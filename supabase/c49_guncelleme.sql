-- ---------------------------------------------------------------------------
-- c49: Yönetici üst çubuk özeti (üye / PRO / çevrimiçi / yarışta / bekleyen destek) ve canlı üye listesi.
--
-- 1) admin_overview() -> jsonb {members, pro, trial, online, offline, racing, support, support_open}
--      members       kayıtlı üye sayısı (profiles)
--      pro           PRO süresi süren üyeler: pro_until > now(). Yöneticiler (PRO'su yoksa) ve herkese açık
--                    tanıtım dönemi (promo_active) SAYILMAZ — "kaç kişi PRO üye" sorusunun cevabı budur
--                    (admin_users'ın 'pro' süzgeciyle aynı kural).
--      trial         bunlardan kaynağı deneme olanlar (pro_source = 'trial'); pro sayısına dahildir
--      online        user_status.updated_at son 3 dakikada (my_friends ile aynı kural)
--      offline       members - online
--      racing        çevrimiçi VE user_status.racing
--      support       yanıt bekleyen destek talepleri (status = 'open'; admin_badge_counts ile aynı)
--      support_open  support ile aynı değer (eski istemci uyumu)
--    Sadece yönetici (is_admin()). Yetkisi olmayana / girişsize boş nesne döner, hata fırlatmaz.
--
-- 2) admin_members_live(p_filter, p_search, p_limit, p_offset): üyeler + canlı durum.
--      p_filter: all | online | racing | pro | offline
--      p_search: görünen ad / e-posta / iRacing adı içinde arar
--      Sıra: yarışta olanlar, sonra çevrimiçi olanlar, sonra son görülme (yeni -> eski), sonra ad.
--      is_pro = pro_until > now() (yukarıdaki sayaçla aynı kural). last_seen = user_status.updated_at ile
--      app_pings.last_seen'in büyüğü. Çevrimdışı üyede pist/araç/oturum/oyun boş döner (eski veri gösterilmez).
--      Yönetici tüm üyeleri görür (gizlilik ayarları yönetim araçlarında olduğu gibi uygulanmaz).
--      Yönetici değilse 'yetki yok' hatası (admin_users / admin_find_users ile aynı).
-- Sıra: c31 (user_status.sim) ve c44 (support_tickets sayacı) sonrasında.
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := '{}'::jsonb;
  n_members int := 0;
  n_pro int := 0;
  n_trial int := 0;
  n_online int := 0;
  n_racing int := 0;
  n_support int := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    return r;
  end if;
  select count(*)::int, (count(*) filter (where p.pro_until > now()))::int,
         (count(*) filter (where p.pro_until > now() and p.pro_source = 'trial'))::int
    into n_members, n_pro, n_trial from public.profiles p;
  select count(*)::int, (count(*) filter (where s.racing))::int
    into n_online, n_racing
    from public.user_status s
    where s.updated_at > now() - interval '3 minutes';
  begin
    select count(*)::int into n_support from public.support_tickets where status = 'open';
  exception when others then
    n_support := 0;
  end;
  return jsonb_build_object(
    'members', n_members, 'pro', n_pro, 'trial', n_trial, 'online', n_online,
    'offline', greatest(n_members - n_online, 0), 'racing', n_racing,
    'support', n_support, 'support_open', n_support);
exception when others then
  -- Özet hiçbir zaman arayüzü bozmasın
  return r;
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

drop function if exists public.admin_members_live(text, text, int, int);
create or replace function public.admin_members_live(
  p_filter text default 'all', p_search text default '', p_limit int default 200, p_offset int default 0)
returns table (id uuid, display_name text, avatar_path text, email text, is_pro boolean, pro_until timestamptz,
               pro_source text, is_admin boolean, created_at timestamptz, online boolean, racing boolean,
               sim text, track text, car text, session text, last_seen timestamptz)
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
           x.last_seen
    from (
      select p.id, p.display_name, p.avatar_path, u.email::text as email,
             coalesce(p.pro_until > now(), false) as is_pro, p.pro_until, coalesce(p.pro_source, '') as pro_source, p.is_admin, p.created_at,
             coalesce(s.updated_at > now() - interval '3 minutes', false) as online,
             coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) as racing,
             coalesce(s.sim, '') as sim, coalesce(s.track, '') as track, coalesce(s.car, '') as car,
             coalesce(s.session, '') as session,
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

notify pgrst, 'reload schema';
