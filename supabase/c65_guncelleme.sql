-- ---------------------------------------------------------------------------
-- c65: (1) Durum seçici: Çevrimiçi / Rahatsız Etme / Çevrimdışı (görünmez), (2) Grup sahipliğini devretme.
--
-- 1) Görünmez durum ("Çevrimdışı görün"):
--      user_status.invisible (boolean) ve user_status.invisible_at (görünmez olunan an; tetikleyici yazar).
--      Görünmez üye başkalarına ÇEVRİMDIŞI döner: online / racing false, pist / araç / oturum / oyun boş,
--      dnd false, last_seen = görünmez olduğu an (durum her 45 sn'de yenilendiği için updated_at verilmez).
--      YÖNETİCİ (is_admin) gerçek durumu ve ayrıca invisible = true işaretini görür ("gizleniyor").
--      Kural sunucuda uygulanır:
--        - user_status okuma kuralı ("status friends read"): arkadaş, görünmez üyenin satırını okuyamaz
--          (kendisi ve yönetici okur).
--        - presence_masked(boolean): "bu satır çağırana gizlenmeli mi" (görünmez VE çağıran yönetici değil).
--        - my_friends(): maskeleme + yeni dönüş sütunu invisible (sadece yöneticiye true döner). Sıralama da
--          maskelenmiş değerlerle yapılır (sıradan anlaşılmasın).
--        - friend_shares(): maskeleme; görünmez üyenin canlı verisi de dönmez (sütunlar aynı).
--        - live_visible(): görünmez üyenin canlı verisini güvenilir ARKADAŞ okuyamaz (live_data okuma kuralı ve
--          Realtime bunu kullanır). EKİP üyesi (crew_role) okumaya devam eder.
--        - admin_members_live(): yeni dönüş sütunu invisible (çevrimiçi ama gizlenen üye). Gerçek durum döner.
--      Bilerek DEĞİŞMEYENLER:
--        - crew_drivers() / crew_driver(): ekip üyesini sürücü kendisi atar ve Ekip Pitwall'ı canlı veriye dayanır;
--          gizlenirse panel çalışmaz. Ekip üyesi gerçek durumu görmeye devam eder.
--        - admin_overview(): sadece yönetici; sayaçlar gerçek durumu sayar.
--        - send_message / chat_group_add …: sadece accept_messages'a bakar, durum sızdırmaz.
--        - telemetry_drivers / public_profile / takım işlevleri: çevrimiçi durumu döndürmez.
-- 2) group_transfer(p_group, p_user): grup sahibi sahipliği bir üyeye devreder (sohbete "yeni sahip" sistem
--      mesajı düşer; meta.t = 'owner'). Ayrılma (group_leave), üye çıkarma (group_kick), grubu silme
--      (group_delete), üye listesi (group_members) ve sahip ayrılınca en eski üyeye devir / boş grubun silinmesi
--      (chat_group_member_gone) c45'te zaten var; aynen kalır.
-- Sıra: c31 (user_status.sim), c45 (gruplar), c49 (admin_members_live), c53 (ekip, live_visible) sonrasında.
-- Tekrar çalıştırılabilir. my_friends ve admin_members_live dönüş sütunu değiştiği için önce düşürülür.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) Görünmez durum
-- ===========================================================================
alter table public.user_status add column if not exists invisible boolean not null default false;
alter table public.user_status add column if not exists invisible_at timestamptz;

-- invisible_at: görünmez olunan an (başkalarına "son görülme" olarak verilir); görünür olunca boşalır
create or replace function public.user_status_invisible_at() returns trigger
language plpgsql as $$
begin
  if not new.invisible then
    new.invisible_at := null;
  elsif tg_op = 'INSERT' or not coalesce(old.invisible, false) then
    new.invisible_at := now();
  else
    new.invisible_at := old.invisible_at; -- istemci değiştiremesin
  end if;
  return new;
end $$;
drop trigger if exists user_status_invisible_at on public.user_status;
create trigger user_status_invisible_at before insert or update on public.user_status
  for each row execute function public.user_status_invisible_at();

-- Bu durum satırı çağırana gizlenmeli mi: görünmez VE çağıran yönetici değil
create or replace function public.presence_masked(p_invisible boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_invisible, false) and not coalesce(public.is_admin(), false);
$$;
revoke all on function public.presence_masked(boolean) from public, anon;
grant execute on function public.presence_masked(boolean) to authenticated, service_role;

-- Tabloyu doğrudan okuma: arkadaş görünmez üyenin satırını göremez
drop policy if exists "status friends read" on public.user_status;
create policy "status friends read" on public.user_status for select using (
  auth.uid() = user_id
  or public.is_admin()
  or (not invisible and public.are_friends(auth.uid(), user_id)));

-- Canlı veri: görünmez üyenin verisini güvenilir arkadaş okuyamaz; ekip üyesi okur (c53 tanımı + görünmezlik)
create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (public.live_trusts(p_owner, auth.uid())
        and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(p_owner))
        and not coalesce((select s.invisible from public.user_status s where s.user_id = p_owner), false))
    or public.crew_role(p_owner, auth.uid(), false));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;

-- Arkadaş listesi: c44'teki tanım + görünmezlik. Yeni sütun: invisible (sadece yöneticiye true dönebilir).
drop function if exists public.my_friends();
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int, avatar_path text, sim text,
               invisible boolean)
language sql stable security definer set search_path = public as $$
  select x.friend_id, x.display_name, x.iracing_name, x.status, x.trusted, x.muted, x.trusts_me,
         x.online, x.racing, x.track, x.car, x.session, x.dnd, x.accept_messages, x.last_seen, x.unread,
         x.avatar_path, x.sim, x.invisible
  from (
    select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
           f.status = 'accepted' and public.live_trusts(f.friend_id, f.user_id)
             and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(f.friend_id)) as trusts_me,
           v.real_on and not v.hid and f.status = 'accepted' as online,
           v.real_on and not v.hid and coalesce(s.racing, false) and f.status = 'accepted' as racing,
           case when f.status = 'accepted' and not v.hid then coalesce(s.track, '') else '' end as track,
           case when f.status = 'accepted' and not v.hid then coalesce(s.car, '') else '' end as car,
           case when f.status = 'accepted' and not v.hid then coalesce(s.session, '') else '' end as session,
           coalesce(s.dnd, false) and not v.hid as dnd,
           coalesce(s.accept_messages, true) as accept_messages,
           case when f.status = 'accepted'
                then case when v.hid then coalesce(s.invisible_at, s.updated_at) else s.updated_at end end as last_seen,
           (select count(*)::int from public.messages m
            where m.recipient = auth.uid() and m.sender = f.friend_id and m.read_at is null
              and not public.message_hidden_for(m.id, m.sender, m.recipient, m.created_at)) as unread,
           p.avatar_path,
           case when f.status = 'accepted' and v.real_on and not v.hid then coalesce(s.sim, '') else '' end as sim,
           -- yöneticiye: çevrimiçi ama gizleniyor
           f.status = 'accepted' and v.real_on and coalesce(s.invisible, false) and not v.hid as invisible
    from public.friendships f
    join public.profiles p on p.id = f.friend_id
    left join public.user_status s on s.user_id = f.friend_id
    cross join lateral (
      select coalesce(s.updated_at > now() - interval '3 minutes', false) as real_on,
             public.presence_masked(s.invisible) as hid) v
    where f.user_id = auth.uid()
  ) x
  order by (x.status = 'pending_in') desc, x.racing desc, x.last_seen desc nulls last, x.display_name;
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated, service_role;

-- Verisini görebildiğim arkadaşlar: c44'teki tanım + görünmezlik (görünmez üyenin canlı verisi de dönmez)
create or replace function public.friend_shares()
returns table (friend_id uuid, display_name text, avatar_path text, online boolean, racing boolean,
               track text, car text, live boolean, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.friend_id, x.display_name, x.avatar_path, x.online, x.racing, x.track, x.car, x.live, x.data, x.updated_at
  from (
    select f.friend_id, p.display_name, p.avatar_path,
           not v.hid and coalesce(s.updated_at > now() - interval '3 minutes', false) as online,
           not v.hid and coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) as racing,
           case when v.hid then '' else coalesce(s.track, '') end as track,
           case when v.hid then '' else coalesce(s.car, '') end as car,
           not v.hid and coalesce(l.updated_at > now() - interval '2 minutes', false) as live,
           case when not v.hid and l.updated_at > now() - interval '10 minutes' then l.data end as data,
           case when v.hid then null else l.updated_at end as updated_at,
           case when v.hid then coalesce(s.invisible_at, s.updated_at) else s.updated_at end as seen
    from public.friendships f
    join public.profiles p on p.id = f.friend_id
    left join public.user_status s on s.user_id = f.friend_id
    left join public.live_data l on l.user_id = f.friend_id
    cross join lateral (select public.presence_masked(s.invisible) as hid) v
    -- görünmez üye listeden düşmesin (çevrimdışı görünsün): live_visible görünmezi eler; güven koşulu ayrıca sayılır, veri yukarıda maskelenir
    where f.user_id = auth.uid() and f.status = 'accepted'
      and (public.live_visible(f.friend_id)
           or (coalesce(s.invisible, false) and public.live_trusts(f.friend_id, auth.uid())
               and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(f.friend_id))))
  ) x
  order by x.live desc, x.racing desc, x.seen desc nulls last, x.display_name;
$$;
revoke all on function public.friend_shares() from public, anon;
grant execute on function public.friend_shares() to authenticated;

-- Yönetici canlı üye listesi: c49'daki tanım + invisible sütunu (çevrimiçi ama "Çevrimdışı görün" seçmiş)
drop function if exists public.admin_members_live(text, text, int, int);
create or replace function public.admin_members_live(
  p_filter text default 'all', p_search text default '', p_limit int default 200, p_offset int default 0)
returns table (id uuid, display_name text, avatar_path text, email text, is_pro boolean, pro_until timestamptz,
               pro_source text, is_admin boolean, created_at timestamptz, online boolean, racing boolean,
               sim text, track text, car text, session text, last_seen timestamptz, invisible boolean)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  q text := btrim(coalesce(p_search, ''));
  f text := lower(coalesce(nullif(btrim(p_filter), ''), 'all'));
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  -- ilike joker karakterleri düz metin sayılsın
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select x.id, x.display_name, x.avatar_path, x.email, x.is_pro, x.pro_until, x.pro_source, x.is_admin, x.created_at,
           x.online, x.racing,
           case when x.online then x.sim else '' end,
           case when x.online then x.track else '' end,
           case when x.online then x.car else '' end,
           case when x.online then x.session else '' end,
           x.last_seen,
           x.online and x.invisible
    from (
      select p.id, p.display_name, p.avatar_path, u.email::text as email,
             coalesce(p.pro_until > now(), false) as is_pro, p.pro_until, coalesce(p.pro_source, '') as pro_source, p.is_admin, p.created_at,
             coalesce(s.updated_at > now() - interval '3 minutes', false) as online,
             coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) as racing,
             coalesce(s.sim, '') as sim, coalesce(s.track, '') as track, coalesce(s.car, '') as car,
             coalesce(s.session, '') as session,
             coalesce(s.invisible, false) as invisible,
             nullif(greatest(coalesce(s.updated_at, '-infinity'::timestamptz),
                             coalesce((select max(a.last_seen) from public.app_pings a where a.user_id = p.id),
                                      '-infinity'::timestamptz)), '-infinity'::timestamptz) as last_seen
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.user_status s on s.user_id = p.id
      where q = ''
         or p.display_name ilike '%' || q || '%'
         or u.email ilike '%' || q || '%'
         or coalesce(p.iracing_name, '') ilike '%' || q || '%'
    ) x
    where case f
            when 'online' then x.online
            when 'racing' then x.racing
            when 'pro' then x.is_pro
            when 'offline' then not x.online
            else true end
    order by x.racing desc, x.online desc, x.last_seen desc nulls last, x.display_name
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_members_live(text, text, int, int) from public, anon;
grant execute on function public.admin_members_live(text, text, int, int) to authenticated;

-- ===========================================================================
-- 2) Grup sahipliğini devret
-- ===========================================================================
create or replace function public.group_transfer(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_group_owner(p_group) then
    raise exception 'Sadece grup sahibi sahipliği devredebilir';
  end if;
  if p_user is null or p_user = me then
    return; -- zaten sahip
  end if;
  if not exists (select 1 from public.chat_group_members where group_id = p_group and user_id = p_user) then
    raise exception 'Bu kişi grupta değil';
  end if;
  update public.chat_groups set owner_id = p_user, updated_at = now() where id = p_group;
  insert into public.group_messages (group_id, sender, body, meta)
    values (p_group, p_user, '👑 Grubun yeni sahibi oldu',
            jsonb_build_object('t', 'owner', 'user', p_user,
              'name', coalesce((select display_name from public.profiles where id = p_user), '?')));
end $$;
revoke all on function public.group_transfer(uuid, uuid) from public, anon;
grant execute on function public.group_transfer(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
