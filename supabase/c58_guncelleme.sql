-- ---------------------------------------------------------------------------
-- c58: Ekip — (1) ana anahtar PRO üyede varsayılan AÇIK, (2) Ekip Pitwall'ı (uzaktan pit duvarı).
--
-- 1) "Ekibim pit ayarlarımı değiştirebilsin" (crew_prefs.control_on)
--    c53'te crew_prefs satırı olmayan sürücünün ana anahtarı KAPALI sayılıyordu. Artık:
--      - Sürücü anahtara dokunduysa (control_on true / false) her zaman o geçerli: "Durdur" / kısayol ile
--        kapattıysa kapalı kalır, PRO olsa bile kendiliğinden açılmaz.
--      - Hiç dokunmadıysa (satır yok ya da control_on NULL): sürücü PRO ise AÇIK, değilse KAPALI.
--    Bunun için control_on sütunu NULL olabilir hâle gelir (NULL = "dokunulmadı"); böylece yalnızca pitwall
--    anahtarı için satır açılması ana anahtarı kapalıya çekmez.
--    PRO üyeliği biterse dokunmamış sürücünün anahtarı kendiliğinden kapalıya döner; ayrıca özellik PRO'ya
--    özelken (social.crew) crew_accepts() zaten her komutta sürücünün PRO'sunu arar.
--
-- 2) Ekip Pitwall'ı: ekip üyesi sürücünün çevresindeki araçları, tur / delta / bayrak / hava bilgisini ve
--    spotter durumunu (solda / sağda araç) saniyede bir izler; uygulamadan ya da web sitesinden.
--    Taşıma: veritabanı. crew_wall (owner, data, updated_at) tek satırlık, UNLOGGED (WAL yazmaz; sunucu
--    çökerse içerik kaybolur, sorun değil) bir tablodur ve Realtime yayınında DEĞİLDİR.
--      - Sürücünün uygulaması crew_wall_push(veri) ile saniyede bir yazar; fonksiyon o an paneli açık
--        olan (seen_at son 45 sn) ekip üyesi sayısını döner. Kimse izlemiyorsa uygulama veri göndermez,
--        5 sn'de bir crew_wall_push(null) ile yalnızca izleyen var mı diye sorar.
--      - Ekip üyesi crew_wall(p_owner) ile saniyede bir okur (seen_at'i de yazar). Yetki crew_role() ile
--        fonksiyonun içinde denetlenir; tabloda kimseye doğrudan okuma / yazma hakkı yoktur.
--      - Sürücü "Ekibim canlı pitwall'ımı izleyebilsin" anahtarını (crew_prefs.wall_on, varsayılan AÇIK)
--        kapatırsa veri yazılmaz, saklanan satır silinir ve crew_wall() {on:false} döner. Eski ekip paneli
--        (live_data.data.crew, 3 sn) bundan etkilenmez.
--    Sunucu içeriğe bakmaz; yalnızca nesne olduğunu ve 24 KB'ı geçmediğini denetler.
--
-- Yeni / değişen:
--   crew_prefs.control_on        NULL olabilir (dokunulmadı);  crew_prefs.wall_on boolean (varsayılan true)
--   crew_wall                    tablo (yukarıda)
--   crew_control_effective(p_owner) -> boolean   (yardımcı; dışarıya kapalı)
--   crew_accepts(p_owner)        etkin değeri kullanır (crew_drivers / crew_driver / crew_command değişmedi)
--   crew_state()                 control_on artık ETKİN değer; yeni alanlar control_default, wall_on
--   crew_wall_set(p_on)          sürücü: pitwall anahtarı
--   crew_wall_push(p_data) -> jsonb {watchers, wall_on}   sürücünün uygulaması
--   crew_wall(p_owner) -> jsonb {on, age_ms, data}        ekip üyesi
-- Sıra: c53 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) Ana anahtar: PRO üyede varsayılan açık
-- ===========================================================================
alter table public.crew_prefs alter column control_on drop not null;
alter table public.crew_prefs alter column control_on drop default;
alter table public.crew_prefs add column if not exists wall_on boolean not null default true;

-- Ana anahtarın etkin değeri: sürücü dokunduysa o, dokunmadıysa PRO üyede açık
create or replace function public.crew_control_effective(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select control_on from public.crew_prefs where user_id = p_owner),
                  public.user_is_pro(p_owner), false);
$$;
revoke all on function public.crew_control_effective(uuid) from public, anon, authenticated;
grant execute on function public.crew_control_effective(uuid) to service_role;

-- Sürücü şu an uzaktan komut kabul ediyor mu: ana anahtar (etkin değer) açık ve (özellik PRO'ya özelse) sürücü PRO
create or replace function public.crew_accepts(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.crew_control_effective(p_owner)
     and (not public.feature_requires_pro('social.crew', true) or public.user_is_pro(p_owner));
$$;
revoke all on function public.crew_accepts(uuid) from public, anon, authenticated;
grant execute on function public.crew_accepts(uuid) to service_role;

create or replace function public.crew_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'control_on', public.crew_control_effective(auth.uid()),
    'control_default', not exists (select 1 from public.crew_prefs where user_id = auth.uid() and control_on is not null),
    'wall_on', coalesce((select wall_on from public.crew_prefs where user_id = auth.uid()), true),
    'needs_pro', public.feature_requires_pro('social.crew', true) and not public.is_pro(),
    'count', (select count(*)::int from public.crew_members where owner = auth.uid()),
    'max', 10);
$$;
revoke all on function public.crew_state() from public, anon;
grant execute on function public.crew_state() to authenticated;

-- ===========================================================================
-- 2) Ekip Pitwall'ı
-- ===========================================================================
create unlogged table if not exists public.crew_wall (
  owner uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.crew_wall enable row level security;
-- Kural yok: yalnızca aşağıdaki security definer fonksiyonlar okur / yazar
revoke all on public.crew_wall from public, anon, authenticated;
grant all on public.crew_wall to service_role;

-- Sürücü: "Ekibim canlı pitwall'ımı izleyebilsin". Ana anahtara (control_on) dokunmaz.
create or replace function public.crew_wall_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  insert into public.crew_prefs (user_id, control_on, wall_on, updated_at)
    values (auth.uid(), null, coalesce(p_on, true), now())
    on conflict (user_id) do update set wall_on = excluded.wall_on, updated_at = now();
  if not coalesce(p_on, true) then
    delete from public.crew_wall where owner = auth.uid();
  end if;
end $$;
revoke all on function public.crew_wall_set(boolean) from public, anon;
grant execute on function public.crew_wall_set(boolean) to authenticated;

-- Sürücünün uygulaması: pitwall verisini yaz (p_data null: yalnızca "izleyen var mı" sorusu).
-- Veri yalnızca anahtar açıksa ve o an izleyen varsa saklanır. Dönüş: {watchers, wall_on}.
create or replace function public.crew_wall_push(p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_on boolean;
  n int;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  v_on := coalesce((select wall_on from public.crew_prefs where user_id = auth.uid()), true);
  select count(*)::int into n
    from public.crew_members c
    join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
    where c.owner = auth.uid() and (c.can_view or c.can_control)
      and c.seen_at > now() - interval '45 seconds';
  if not v_on then
    delete from public.crew_wall where owner = auth.uid();
  elsif p_data is not null and n > 0 then
    if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 24000 then
      raise exception 'Pitwall verisi geçersiz';
    end if;
    insert into public.crew_wall as w (owner, data, updated_at) values (auth.uid(), p_data, now())
      on conflict (owner) do update set data = excluded.data, updated_at = now()
      where w.updated_at < now() - interval '300 milliseconds';
  end if;
  return jsonb_build_object('watchers', n, 'wall_on', v_on);
end $$;
revoke all on function public.crew_wall_push(jsonb) from public, anon;
grant execute on function public.crew_wall_push(jsonb) to authenticated;

-- Ekip üyesi: sürücünün pitwall verisi (saniyede bir). "Bağlı" göstergesi için seen_at'i 10 sn'de bir yazar.
-- on: sürücü pitwall'ı açık tutuyor; data: 15 sn'den eski değilse son veri; age_ms: verinin yaşı.
create or replace function public.crew_wall(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.crew_members%rowtype;
  w public.crew_wall%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  select * into c from public.crew_members where owner = p_owner and member = auth.uid();
  if not found or not public.crew_role(p_owner, auth.uid(), false) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  if c.seen_at is null or c.seen_at < now() - interval '10 seconds' then
    update public.crew_members set seen_at = now() where owner = p_owner and member = auth.uid();
  end if;
  if not coalesce((select wall_on from public.crew_prefs where user_id = p_owner), true) then
    return jsonb_build_object('on', false, 'age_ms', null, 'data', null);
  end if;
  select * into w from public.crew_wall where owner = p_owner;
  if not found or w.updated_at < now() - interval '15 seconds' then
    return jsonb_build_object('on', true, 'age_ms', null, 'data', null);
  end if;
  return jsonb_build_object('on', true,
    'age_ms', (extract(epoch from clock_timestamp() - w.updated_at) * 1000)::int,
    'data', w.data);
end $$;
revoke all on function public.crew_wall(uuid) from public, anon;
grant execute on function public.crew_wall(uuid) to authenticated;

notify pgrst, 'reload schema';
