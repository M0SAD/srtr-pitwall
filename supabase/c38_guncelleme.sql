-- ---------------------------------------------------------------------------
-- c38: PRO özellikleri yöneticiden ayarlanabilir.
--      1) pro_features (key, pro, updated_at, updated_by): yöneticinin bir özellik için verdiği karar
--         (pro = true: PRO üyelere özel, false: herkese açık). Satır yoksa özelliğin varsayılanı geçerli
--         (varsayılanlar bugünkü davranıştır). Herkes okuyabilir; yazmak sadece RPC ile (yönetici).
--      2) pro_feature_catalog (key, label, grp, default_pro): özelliklerin listesi. Program (yönetici Yönetim ›
--         PRO özellikleri bölümünü açınca) kendi kataloğunu buraya yazar; böylece overlay manifestlerindeki
--         PRO işaretli seçenekler de web sitesindeki yönetim panelinde görünür.
--      3) RPC'ler:
--           pro_features_map()                 → {anahtar: bool} (giriş gerekmez; program açılışta ve 5 dk'da bir okur)
--           pro_feature_set(anahtar, pro)      → yönetici; pro null ise varsayılana döner (satır silinir). mod_log'a yazılır.
--           pro_feature_set_many({anahtar: bool|null}) → yönetici; toplu değiştirme (grup işlemleri).
--           pro_feature_catalog_sync([{key, label, group, default}]) → yönetici; kataloğu günceller.
--           pro_features_admin_list()          → yönetici; katalog + kararlar (kim, ne zaman).
--           feature_requires_pro(anahtar, varsayılan) → bu özellik şu an PRO mu (sunucu denetimleri kullanır).
--      4) Sunucudaki PRO denetimleri artık feature_requires_pro'ya bakar (herkese açık yapılınca sunucu da izin verir).
--         Yeniden tanımlanan fonksiyonlar (sadece PRO denetimi değişti, gerisi en son tanımın aynısı):
--           protect_screenshot()  (schema.sql)    — community.share.shots      (varsayılan PRO)
--           require_pro()         (schema.sql)    — tabloya göre anahtar:
--                                                    layout_ratings  → community.layouts.rate    (varsayılan PRO)
--                                                    layout_comments → community.layouts.comment (varsayılan PRO)
--                                                    shared_themes   → community.share.themes    (varsayılan PRO)
--                                                    shared_layouts  → community.share.layouts / community.share.streams
--                                                                      (varsayılan herkese açık; tetik yeniden eklenir)
--           friend_set()          (c27)           — social.data_share (varsayılan PRO)
--           live_visible()        (c27)           — social.data_share
--           my_friends()          (c31)           — social.data_share (trusts_me)
--         ve "live own write" kuralı (live_data'ya yazmak) — social.data_share.
-- Sıra: c27, c31 ve c36'dan sonra.
-- ---------------------------------------------------------------------------

-- 1) Tablolar ---------------------------------------------------------------------
create table if not exists public.pro_features (
  key text primary key check (key ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  pro boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.pro_features enable row level security;
drop policy if exists "pro features readable" on public.pro_features;
create policy "pro features readable" on public.pro_features for select using (true);

create table if not exists public.pro_feature_catalog (
  key text primary key check (key ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  label text not null default '',
  grp text not null default '',
  default_pro boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.pro_feature_catalog enable row level security;
-- (politika yok: sadece security definer RPC'ler okur/yazar)

-- 2) Yardımcı: özellik şu an PRO mu ------------------------------------------------
create or replace function public.feature_requires_pro(p_key text, p_default boolean default true) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.pro from public.pro_features f where f.key = p_key), p_default, true);
$$;
grant execute on function public.feature_requires_pro(text, boolean) to anon, authenticated, service_role;

-- 3) RPC'ler ------------------------------------------------------------------------
create or replace function public.pro_features_map() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.key, f.pro), '{}'::jsonb) from public.pro_features f;
$$;
grant execute on function public.pro_features_map() to anon, authenticated, service_role;

-- Tek özellik: p_pro null → varsayılana dön
create or replace function public.pro_feature_set(p_key text, p_pro boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  before boolean;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_.:-]{1,200}$' then
    raise exception 'Geçersiz özellik anahtarı';
  end if;
  select pro into before from public.pro_features where key = p_key;
  if p_pro is null then
    delete from public.pro_features where key = p_key;
  else
    insert into public.pro_features (key, pro, updated_at, updated_by) values (p_key, p_pro, now(), auth.uid())
      on conflict (key) do update set pro = excluded.pro, updated_at = now(), updated_by = auth.uid();
  end if;
  perform public.log_mod('pro_feature_set', 'pro_feature', p_key, null,
    jsonb_build_object('before', before, 'after', p_pro));
end $$;
revoke all on function public.pro_feature_set(text, boolean) from public, anon;
grant execute on function public.pro_feature_set(text, boolean) to authenticated;

-- Toplu: {anahtar: true | false | null}
create or replace function public.pro_feature_set_many(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e record;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then
    raise exception 'Geçersiz liste';
  end if;
  for e in select * from jsonb_each(p_items) loop
    if e.key !~ '^[A-Za-z0-9_.:-]{1,200}$' then
      raise exception 'Geçersiz özellik anahtarı: %', left(e.key, 60);
    end if;
    if jsonb_typeof(e.value) = 'boolean' then
      insert into public.pro_features (key, pro, updated_at, updated_by) values (e.key, (e.value)::text::boolean, now(), auth.uid())
        on conflict (key) do update set pro = excluded.pro, updated_at = now(), updated_by = auth.uid();
    elsif jsonb_typeof(e.value) = 'null' then
      delete from public.pro_features where key = e.key;
    else
      raise exception 'Geçersiz değer: %', left(e.key, 60);
    end if;
    n := n + 1;
  end loop;
  if n > 0 then
    perform public.log_mod('pro_feature_set_many', 'pro_feature', '', null, jsonb_build_object('items', p_items));
  end if;
  return n;
end $$;
revoke all on function public.pro_feature_set_many(jsonb) from public, anon;
grant execute on function public.pro_feature_set_many(jsonb) to authenticated;

-- Program kataloğunu yazar: [{key, label, group, default}]
create or replace function public.pro_feature_catalog_sync(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 3000 then
    raise exception 'Geçersiz liste';
  end if;
  for e in select * from jsonb_array_elements(p_items) loop
    continue when jsonb_typeof(e) <> 'object' or coalesce(e ->> 'key', '') !~ '^[A-Za-z0-9_.:-]{1,200}$';
    insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at)
      values (e ->> 'key', left(coalesce(e ->> 'label', ''), 200), left(coalesce(e ->> 'group', ''), 60),
              coalesce((e ->> 'default')::boolean, true), now())
      on conflict (key) do update set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro,
                                      updated_at = now()
      where (public.pro_feature_catalog.label, public.pro_feature_catalog.grp, public.pro_feature_catalog.default_pro)
            is distinct from (excluded.label, excluded.grp, excluded.default_pro);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pro_feature_catalog_sync(jsonb) from public, anon;
grant execute on function public.pro_feature_catalog_sync(jsonb) to authenticated;

-- Yönetici listesi: katalog + kararlar (katalogda olmayan kararlar da gelir)
create or replace function public.pro_features_admin_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.grp, x.label, x.key) from (
      select coalesce(c.key, f.key) as key,
             coalesce(nullif(c.label, ''), coalesce(c.key, f.key)) as label,
             coalesce(nullif(c.grp, ''), 'Diğer') as grp,
             coalesce(c.default_pro, true) as default_pro,
             f.pro, f.updated_at,
             coalesce((select display_name from public.profiles where id = f.updated_by), '') as updated_by_name,
             c.key is not null as in_catalog
        from public.pro_feature_catalog c
        full join public.pro_features f on f.key = c.key) x), '[]'::jsonb);
end $$;
revoke all on function public.pro_features_admin_list() from public, anon;
grant execute on function public.pro_features_admin_list() to authenticated;

-- 4) Sunucu denetimleri ------------------------------------------------------------------

-- 4a) Ekran görüntüsü paylaşmak (schema.sql'deki son tanım; sadece PRO denetimi değişti)
create or replace function public.protect_screenshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.app_config;
begin
  if tg_op = 'INSERT' then
    new.rating_avg := 0;
    new.rating_count := 0;
    new.comment_count := 0;
    new.views := 0;
    new.created_at := now();
    new.last_viewed_at := now();
    if not public.is_admin() then
      if public.feature_requires_pro('community.share.shots', true)
         and coalesce((select pro_until from public.profiles where id = new.user_id), 'epoch'::timestamptz) < now() then
        raise exception 'Ekran görüntüsü paylaşmak PRO üyelik gerektirir';
      end if;
      select * into c from public.app_config where id = 1;
      if not coalesce(c.shots_enabled, true) then
        raise exception 'Ekran görüntüsü paylaşımı şu an kapalı';
      end if;
      if (select count(*) from public.screenshots s where s.user_id = new.user_id and s.created_at > now() - interval '1 day')
         >= coalesce(c.shot_daily_limit, 20) then
        raise exception 'Günlük paylaşım sınırına ulaştın';
      end if;
    end if;
  elsif current_setting('pitwall.counters', true) is distinct from 'on' then
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.comment_count := old.comment_count;
    new.views := old.views;
    new.last_viewed_at := old.last_viewed_at;
    new.path := old.path;
    new.thumb_path := old.thumb_path;
    new.bytes := old.bytes;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.edited_at := now();
  end if;
  return new;
end $$;

-- 4b) Düzen puanı / yorumu, tema paylaşımı, düzen ve yayın düzeni paylaşımı (tabloya göre özellik anahtarı)
create or replace function public.require_pro() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
  d boolean := true;
begin
  if tg_table_name = 'layout_ratings' then
    k := 'community.layouts.rate';
  elsif tg_table_name = 'layout_comments' then
    k := 'community.layouts.comment';
  elsif tg_table_name = 'shared_themes' then
    k := 'community.share.themes';
  elsif tg_table_name = 'shared_layouts' then
    k := case when to_jsonb(new) ->> 'kind' = 'stream' then 'community.share.streams' else 'community.share.layouts' end;
    d := false; -- düzen paylaşmak bugün herkese açık
  end if;
  if k is not null and not public.feature_requires_pro(k, d) then
    return new;
  end if;
  if not public.is_pro() then
    raise exception 'Bu işlem PRO üyelik gerektirir';
  end if;
  return new;
end $$;
-- Düzen paylaşımı da denetlenir (varsayılan herkese açık: yönetici PRO yaparsa sunucu da uygular)
drop trigger if exists require_pro on public.shared_layouts;
create trigger require_pro before insert on public.shared_layouts for each row execute function public.require_pro();

-- 4c) Veri paylaşımı (c27'deki son tanımlar; sadece PRO denetimi değişti)
create or replace function public.friend_set(p_user uuid, p_trusted boolean, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_trusted and public.feature_requires_pro('social.data_share', true) and not public.is_pro()
     and not coalesce((select trusted from public.friendships where user_id = auth.uid() and friend_id = p_user), false) then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  update public.friendships set trusted = p_trusted, muted = p_muted
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
end $$;

drop policy if exists "live own write" on public.live_data;
create policy "live own write" on public.live_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (not public.feature_requires_pro('social.data_share', true) or public.is_pro()));

create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (exists (select 1 from public.friendships f
                where f.user_id = p_owner and f.friend_id = auth.uid() and f.status = 'accepted' and f.trusted)
        and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(p_owner))));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;

-- my_friends: c31'deki son tanım (dönüş sütunları aynı), sadece trusts_me'deki PRO denetimi değişti
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int, avatar_path text, sim text)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         coalesce(o.trusted and o.status = 'accepted', false)
           and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(f.friend_id)),
         coalesce(s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         case when f.status = 'accepted' then coalesce(s.track, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.car, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.session, '') else '' end,
         coalesce(s.dnd, false), coalesce(s.accept_messages, true),
         case when f.status = 'accepted' then s.updated_at end,
         (select count(*)::int from public.messages m
          where m.recipient = auth.uid() and m.sender = f.friend_id and m.read_at is null
            and not public.message_hidden_for(m.id, m.sender, m.recipient, m.created_at)),
         p.avatar_path,
         case when f.status = 'accepted' and coalesce(s.updated_at > now() - interval '3 minutes', false)
              then coalesce(s.sim, '') else '' end
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.friendships o on o.user_id = f.friend_id and o.friend_id = f.user_id
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated, service_role;

notify pgrst, 'reload schema';
