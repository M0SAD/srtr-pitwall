-- c123: E-posta (SMTP) ayarları uygulamadan (Yönetim › E-posta).
--   * mail_settings: tek satır; uygulamanın kendi e-postaları (pitwall-jobs: bildirim, rapor, destek…) buradan gönderilir.
--     Hiç kimse okuyamaz / yazamaz (RLS kuralı yok); yalnızca sunucu fonksiyonları (service_role) erişir. Şifre istemciye
--     hiçbir zaman geri gönderilmez.
--   * Kayıt / şifre sıfırlama e-postaları (Supabase Auth) "admin-mail" fonksiyonu Management API ile ayarlar.

create table if not exists public.mail_settings (
  id int primary key default 1 check (id = 1),
  smtp_host text not null default 'smtp.gmail.com',
  smtp_port int not null default 465,
  smtp_user text not null default '',
  smtp_pass text not null default '',
  sender_name text not null default 'SRTR Pitwall',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.mail_settings enable row level security;
revoke all on public.mail_settings from anon, authenticated;
grant all on public.mail_settings to service_role;

notify pgrst, 'reload schema';

-- Arkadaş listesinden "Ses odasına davet et": şu an bulunduğum ses odasına davet (hangi pencereden olursa olsun)
create or replace function public.voice_invite_here(p_to uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
begin
  select s.room_id into v_room from public.voice_sessions s
   where s.user_id = auth.uid() and s.last_seen > now() - interval '90 seconds'
   order by s.last_seen desc limit 1;
  if v_room is null then
    raise exception 'Önce bir ses odasına gir, sonra arkadaşını davet et';
  end if;
  return public.voice_invite(v_room, p_to);
end $$;
grant execute on function public.voice_invite_here(uuid) to authenticated;

notify pgrst, 'reload schema';


-- Yönetici üye listesinde (üst çubuktaki Üyeler) sıralama: p_sort
--   active (yarışta / çevrimiçi / son görülme, varsayılan) | new (üyelik: yeni → eski) | old (üyelik: eski → yeni)
--   seen (son görülme) | name (ad A → Z) | pro (PRO'lar önce, bitişi uzak olan önce)
drop function if exists public.admin_members_live(text, text, int, int);
drop function if exists public.admin_members_live(text, text, int, int, text);
create or replace function public.admin_members_live(
  p_filter text default 'all', p_search text default '', p_limit int default 200, p_offset int default 0,
  p_sort text default 'active')
returns table (id uuid, display_name text, avatar_path text, email text, is_pro boolean, pro_until timestamptz,
               pro_source text, is_admin boolean, created_at timestamptz, online boolean, racing boolean,
               sim text, track text, car text, session text, last_seen timestamptz, invisible boolean)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  q text := btrim(coalesce(p_search, ''));
  f text := lower(coalesce(nullif(btrim(p_filter), ''), 'all'));
  srt text := lower(coalesce(nullif(btrim(p_sort), ''), 'active'));
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
    order by
      (case when srt = 'new' then x.created_at end) desc nulls last,
      (case when srt = 'old' then x.created_at end) asc nulls last,
      (case when srt = 'seen' then x.last_seen end) desc nulls last,
      (case when srt = 'name' then lower(x.display_name) end) asc nulls last,
      (case when srt = 'pro' then x.is_pro end) desc nulls last,
      (case when srt = 'pro' then x.pro_until end) desc nulls last,
      x.racing desc, x.online desc, x.last_seen desc nulls last, x.display_name
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_members_live(text, text, int, int, text) from public, anon;
grant execute on function public.admin_members_live(text, text, int, int, text) to authenticated;

notify pgrst, 'reload schema';
