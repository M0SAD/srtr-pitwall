-- SRTR Pitwall bulut şeması.
-- Supabase panelinde: SQL Editor -> New query -> bu dosyanın tamamını yapıştır -> Run.
-- Tekrar çalıştırmak güvenlidir (var olan tablolar silinmez).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Ayar yedeği (her kullanıcının kendi ayarları)
-- ---------------------------------------------------------------------------

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "own settings select" on public.user_settings;
create policy "own settings select" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "own settings insert" on public.user_settings;
create policy "own settings insert" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "own settings update" on public.user_settings;
create policy "own settings update" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings delete" on public.user_settings;
create policy "own settings delete" on public.user_settings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Profiller
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  -- Uygulamanın iRacing'den okuduğu hesap (bu bilgisayarda sürülen hesap)
  iracing_id bigint,
  iracing_name text,
  -- Patreon / Ko-fi'de kullanılan e-posta (hesap e-postasından farklıysa)
  pay_email text,
  is_admin boolean not null default false,
  pro_until timestamptz,
  pro_source text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Oturumdaki kullanıcı yönetici mi?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- Kullanıcı kendi PRO/yönetici alanlarını değiştiremez (sadece yönetici ve sunucu)
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Uygulamadan gelen isteklerde (anon/authenticated) koru; SQL Editor ve sunucu serbest
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not public.is_admin() then
    new.is_admin := old.is_admin;
    new.pro_until := old.pro_until;
    new.pro_source := old.pro_source;
  end if;
  -- Yönetici bile kendi yöneticiliğini panelden kaldıramasın (kilitlenmeyi önler)
  if old.id = auth.uid() and old.is_admin and not new.is_admin then
    new.is_admin := true;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- Bekleyen PRO: ödeme, hesap açılmadan önce geldiyse
create table if not exists public.pending_pro (
  email text primary key,
  pro_until timestamptz not null,
  source text not null,
  created_at timestamptz not null default now()
);
alter table public.pending_pro enable row level security;
-- (politika yok: sadece sunucu erişir)

-- Yeni kullanıcıya profil aç
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.pending_pro;
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 40))
  on conflict (id) do nothing;
  select * into p from public.pending_pro where lower(email) = lower(new.email);
  if found then
    update public.profiles set pro_until = p.pro_until, pro_source = p.source where id = new.id;
    delete from public.pending_pro where email = p.email;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Şema sonradan kurulduysa var olan kullanıcılara da profil aç
insert into public.profiles (id, display_name)
select u.id, left(coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)), 40)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Uygulama ayarları (tek satır): PRO overlay'ler, destek bağlantıları
-- ---------------------------------------------------------------------------

create table if not exists public.app_config (
  id int primary key default 1 check (id = 1),
  pro_overlays text[] not null default '{}',
  patreon_url text not null default '',
  kofi_url text not null default '',
  price_monthly text not null default '',
  price_yearly text not null default '',
  pro_note text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists "config readable" on public.app_config;
create policy "config readable" on public.app_config for select using (true);

drop policy if exists "config admin update" on public.app_config;
create policy "config admin update" on public.app_config
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- PRO yönetimi
-- ---------------------------------------------------------------------------

-- Ödeme bildirimi (Patreon / Ko-fi) için: e-postaya göre PRO süresini ayarla.
-- Sadece sunucu (Edge Function, service_role) çağırabilir.
create or replace function public.grant_pro_by_email(p_email text, p_until timestamptz, p_source text)
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid;
begin
  select p.id into uid from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email)
    limit 1;
  if uid is null then
    insert into public.pending_pro (email, pro_until, source) values (lower(p_email), p_until, p_source)
      on conflict (email) do update set pro_until = greatest(public.pending_pro.pro_until, excluded.pro_until), source = excluded.source;
    return 'pending';
  end if;
  update public.profiles
    set pro_until = greatest(coalesce(pro_until, now()), p_until), pro_source = p_source
    where id = uid;
  return uid::text;
end $$;

revoke all on function public.grant_pro_by_email(text, timestamptz, text) from public, anon, authenticated;

-- Yönetici: kullanıcı ara (e-posta dahil)
create or replace function public.admin_find_users(q text)
returns table (id uuid, display_name text, email text, iracing_name text, pro_until timestamptz, pro_source text, is_admin boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.iracing_name, p.pro_until, p.pro_source, p.is_admin
    from public.profiles p join auth.users u on u.id = p.id
    where q = '' or p.display_name ilike '%' || q || '%' or u.email ilike '%' || q || '%'
      or coalesce(p.iracing_name, '') ilike '%' || q || '%'
    order by p.created_at desc
    limit 50;
end $$;

-- Yönetici: PRO ver / al (p_until null: PRO'yu kaldır)
create or replace function public.admin_set_pro(p_user uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  update public.profiles set pro_until = p_until, pro_source = case when p_until is null then null else 'admin' end
  where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Paylaşılan düzenler, puanlar, yorumlar
-- ---------------------------------------------------------------------------

create table if not exists public.shared_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  screen_w int not null default 1920,
  screen_h int not null default 1080,
  cars text[] not null default '{}',
  -- { profile: {...}, theme: {...}?, boxes: [{id,name,x,y,w,h}] }
  data jsonb not null,
  overlay_count int not null default 0,
  downloads int not null default 0,
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_layouts_created on public.shared_layouts (created_at desc);
alter table public.shared_layouts enable row level security;

drop policy if exists "layouts readable" on public.shared_layouts;
create policy "layouts readable" on public.shared_layouts for select using (true);

drop policy if exists "layouts own insert" on public.shared_layouts;
create policy "layouts own insert" on public.shared_layouts
  for insert with check (auth.uid() = user_id);

drop policy if exists "layouts own update" on public.shared_layouts;
create policy "layouts own update" on public.shared_layouts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "layouts own delete" on public.shared_layouts;
create policy "layouts own delete" on public.shared_layouts
  for delete using (auth.uid() = user_id or public.is_admin());

-- İndirme/puan sayaçlarını kullanıcı elle değiştiremesin
create or replace function public.protect_layout() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.downloads := 0;
    new.rating_avg := 0;
    new.rating_count := 0;
  elsif current_setting('pitwall.counters', true) is distinct from 'on' then
    new.downloads := old.downloads;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists protect_layout on public.shared_layouts;
create trigger protect_layout before insert or update on public.shared_layouts
  for each row execute function public.protect_layout();

create table if not exists public.layout_ratings (
  layout_id uuid not null references public.shared_layouts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (layout_id, user_id)
);
alter table public.layout_ratings enable row level security;

drop policy if exists "ratings readable" on public.layout_ratings;
create policy "ratings readable" on public.layout_ratings for select using (true);
drop policy if exists "ratings own insert" on public.layout_ratings;
create policy "ratings own insert" on public.layout_ratings for insert with check (auth.uid() = user_id);
drop policy if exists "ratings own update" on public.layout_ratings;
create policy "ratings own update" on public.layout_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ratings own delete" on public.layout_ratings;
create policy "ratings own delete" on public.layout_ratings for delete using (auth.uid() = user_id);

create or replace function public.update_layout_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lid uuid := coalesce(new.layout_id, old.layout_id);
begin
  perform set_config('pitwall.counters', 'on', true);
  update public.shared_layouts l set
    rating_avg = coalesce((select avg(stars) from public.layout_ratings r where r.layout_id = lid), 0),
    rating_count = (select count(*) from public.layout_ratings r where r.layout_id = lid)
  where l.id = lid;
  perform set_config('pitwall.counters', 'off', true);
  return null;
end $$;

drop trigger if exists layout_rating_changed on public.layout_ratings;
create trigger layout_rating_changed after insert or update or delete on public.layout_ratings
  for each row execute function public.update_layout_rating();

-- Kendi düzenine puan verilemesin
create or replace function public.no_self_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.shared_layouts where id = new.layout_id and user_id = new.user_id) then
    raise exception 'Kendi düzenine puan veremezsin';
  end if;
  return new;
end $$;

drop trigger if exists no_self_rating on public.layout_ratings;
create trigger no_self_rating before insert or update on public.layout_ratings
  for each row execute function public.no_self_rating();

create or replace function public.layout_downloaded(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('pitwall.counters', 'on', true);
  update public.shared_layouts set downloads = downloads + 1 where id = p_id;
  perform set_config('pitwall.counters', 'off', true);
end $$;

create table if not exists public.layout_comments (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.shared_layouts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists layout_comments_layout on public.layout_comments (layout_id, created_at);
alter table public.layout_comments enable row level security;

drop policy if exists "comments readable" on public.layout_comments;
create policy "comments readable" on public.layout_comments for select using (true);
drop policy if exists "comments own insert" on public.layout_comments;
create policy "comments own insert" on public.layout_comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments delete" on public.layout_comments;
create policy "comments delete" on public.layout_comments for delete using (
  auth.uid() = user_id
  or public.is_admin()
  or exists (select 1 from public.shared_layouts l where l.id = layout_id and l.user_id = auth.uid())
);

-- Arama için: düzen + yazar adı (RLS'e uyar)
drop view if exists public.layout_list;
create view public.layout_list with (security_invoker = true) as
  select l.id, l.user_id, l.title, l.description, l.screen_w, l.screen_h, l.cars, l.overlay_count,
         l.downloads, l.rating_avg, l.rating_count, l.created_at, l.updated_at,
         p.display_name as author_name, p.iracing_name as author_iracing,
         l.data -> 'boxes' as boxes, coalesce((l.data ->> 'scale')::numeric, 1) as ui_scale
  from public.shared_layouts l join public.profiles p on p.id = l.user_id;

create or replace view public.comment_list with (security_invoker = true) as
  select c.id, c.layout_id, c.user_id, c.body, c.created_at, p.display_name as author_name
  from public.layout_comments c join public.profiles p on p.id = c.user_id;

grant select on public.layout_list, public.comment_list to anon, authenticated;
grant execute on function public.layout_downloaded(uuid) to anon, authenticated;
grant execute on function public.admin_find_users(text) to authenticated;
grant execute on function public.admin_set_pro(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Ekran görüntüleri: filigran, görsel barındırma (Supabase Storage), paylaşım, puan, yorum
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists watermark jsonb not null default
  '{"enabled": true, "text": "SRTR Pitwall · {user}", "logo": "app", "logo_url": "", "position": "br",
    "opacity": 85, "size": 2.2, "color": "#ffffff", "shadow": true}'::jsonb;
alter table public.app_config add column if not exists shots_enabled boolean not null default true;
alter table public.app_config add column if not exists shot_max_width int not null default 1920;
alter table public.app_config add column if not exists shot_quality int not null default 85;
alter table public.app_config add column if not exists shot_daily_limit int not null default 20;

-- Görseller herkese açık "screenshots" kovasında: <kullanıcı id>/<görsel id>.jpg ve _t.jpg (küçük resim)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Filigran logosu (sadece yönetici yükler)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shots own upload" on storage.objects;
create policy "shots own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "shots own read" on storage.objects;
create policy "shots own read" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "shots own delete" on storage.objects;
create policy "shots own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "branding admin insert" on storage.objects;
create policy "branding admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());
drop policy if exists "branding admin read" on storage.objects;
create policy "branding admin read" on storage.objects for select to authenticated
  using (bucket_id = 'branding' and public.is_admin());
drop policy if exists "branding admin update" on storage.objects;
create policy "branding admin update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin());
drop policy if exists "branding admin delete" on storage.objects;
create policy "branding admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());

create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  path text not null,
  thumb_path text not null,
  width int not null default 0,
  height int not null default 0,
  bytes int not null default 0,
  track text not null default '' check (char_length(track) <= 120),
  car text not null default '' check (char_length(car) <= 120),
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists screenshots_created on public.screenshots (created_at desc);
create index if not exists screenshots_user on public.screenshots (user_id, created_at desc);
alter table public.screenshots enable row level security;

drop policy if exists "shots readable" on public.screenshots;
create policy "shots readable" on public.screenshots for select using (true);
drop policy if exists "shots own insert" on public.screenshots;
create policy "shots own insert" on public.screenshots for insert with check (
  auth.uid() = user_id
  and split_part(path, '/', 1) = auth.uid()::text
  and split_part(thumb_path, '/', 1) = auth.uid()::text
);
drop policy if exists "shots own update" on public.screenshots;
create policy "shots own update" on public.screenshots for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "shots own delete" on public.screenshots;
create policy "shots own delete" on public.screenshots for delete using (auth.uid() = user_id or public.is_admin());

-- Sayaçlar elle değiştirilemez; paylaşım kapalıysa ya da günlük sınır dolduysa eklenemez
create or replace function public.protect_screenshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.app_config;
begin
  if tg_op = 'INSERT' then
    new.rating_avg := 0;
    new.rating_count := 0;
    new.comment_count := 0;
    new.created_at := now();
    if not public.is_admin() then
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
    new.path := old.path;
    new.thumb_path := old.thumb_path;
    new.bytes := old.bytes;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists protect_screenshot on public.screenshots;
create trigger protect_screenshot before insert or update on public.screenshots
  for each row execute function public.protect_screenshot();

create table if not exists public.screenshot_ratings (
  screenshot_id uuid not null references public.screenshots (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (screenshot_id, user_id)
);
alter table public.screenshot_ratings enable row level security;
drop policy if exists "shot ratings readable" on public.screenshot_ratings;
create policy "shot ratings readable" on public.screenshot_ratings for select using (true);
drop policy if exists "shot ratings own insert" on public.screenshot_ratings;
create policy "shot ratings own insert" on public.screenshot_ratings for insert with check (auth.uid() = user_id);
drop policy if exists "shot ratings own update" on public.screenshot_ratings;
create policy "shot ratings own update" on public.screenshot_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "shot ratings own delete" on public.screenshot_ratings;
create policy "shot ratings own delete" on public.screenshot_ratings for delete using (auth.uid() = user_id);

create or replace function public.update_screenshot_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(new.screenshot_id, old.screenshot_id);
begin
  perform set_config('pitwall.counters', 'on', true);
  update public.screenshots s set
    rating_avg = coalesce((select avg(stars) from public.screenshot_ratings r where r.screenshot_id = sid), 0),
    rating_count = (select count(*) from public.screenshot_ratings r where r.screenshot_id = sid)
  where s.id = sid;
  perform set_config('pitwall.counters', 'off', true);
  return null;
end $$;

drop trigger if exists screenshot_rating_changed on public.screenshot_ratings;
create trigger screenshot_rating_changed after insert or update or delete on public.screenshot_ratings
  for each row execute function public.update_screenshot_rating();

create or replace function public.no_self_shot_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.screenshots where id = new.screenshot_id and user_id = new.user_id) then
    raise exception 'Kendi görüntüne puan veremezsin';
  end if;
  return new;
end $$;

drop trigger if exists no_self_shot_rating on public.screenshot_ratings;
create trigger no_self_shot_rating before insert or update on public.screenshot_ratings
  for each row execute function public.no_self_shot_rating();

create table if not exists public.screenshot_comments (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid not null references public.screenshots (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists screenshot_comments_shot on public.screenshot_comments (screenshot_id, created_at);
alter table public.screenshot_comments enable row level security;
drop policy if exists "shot comments readable" on public.screenshot_comments;
create policy "shot comments readable" on public.screenshot_comments for select using (true);
drop policy if exists "shot comments own insert" on public.screenshot_comments;
create policy "shot comments own insert" on public.screenshot_comments for insert with check (auth.uid() = user_id);
drop policy if exists "shot comments delete" on public.screenshot_comments;
create policy "shot comments delete" on public.screenshot_comments for delete using (
  auth.uid() = user_id
  or public.is_admin()
  or exists (select 1 from public.screenshots s where s.id = screenshot_id and s.user_id = auth.uid())
);

create or replace function public.update_screenshot_comments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(new.screenshot_id, old.screenshot_id);
begin
  perform set_config('pitwall.counters', 'on', true);
  update public.screenshots s set comment_count = (select count(*) from public.screenshot_comments c where c.screenshot_id = sid)
  where s.id = sid;
  perform set_config('pitwall.counters', 'off', true);
  return null;
end $$;

drop trigger if exists screenshot_comment_changed on public.screenshot_comments;
create trigger screenshot_comment_changed after insert or delete on public.screenshot_comments
  for each row execute function public.update_screenshot_comments();

create or replace view public.shot_list with (security_invoker = true) as
  select s.id, s.user_id, s.title, s.description, s.path, s.thumb_path, s.width, s.height, s.bytes,
         s.track, s.car, s.rating_avg, s.rating_count, s.comment_count, s.created_at,
         p.display_name as author_name, p.iracing_name as author_iracing
  from public.screenshots s join public.profiles p on p.id = s.user_id;

create or replace view public.shot_comment_list with (security_invoker = true) as
  select c.id, c.screenshot_id, c.user_id, c.body, c.created_at, p.display_name as author_name
  from public.screenshot_comments c join public.profiles p on p.id = c.user_id;

-- Yönetici: barındırma kullanımı (dosya sayısı ve toplam boyut)
create or replace function public.admin_storage_usage()
returns table (bucket text, files bigint, bytes bigint)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select o.bucket_id::text, count(*)::bigint, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    where o.bucket_id in ('screenshots', 'branding')
    group by o.bucket_id;
end $$;

grant select on public.shot_list, public.shot_comment_list to anon, authenticated;
grant select on public.screenshots, public.screenshot_ratings, public.screenshot_comments to anon, authenticated;
grant insert, update, delete on public.screenshots, public.screenshot_ratings, public.screenshot_comments to authenticated;
grant execute on function public.admin_storage_usage() to authenticated;
grant all on public.screenshots, public.screenshot_ratings, public.screenshot_comments to service_role;

-- ---------------------------------------------------------------------------
-- Sahip, izin grupları (moderatör), moderasyon kayıtları, raporlar, bildirimler,
-- ekran görüntüsü PRO kuralı ve 6 ay görüntülenmeyen görsellerin silinmesi
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Uygulamanın sahibi: yönetici atar, izin gruplarını ve kayıtları görür.
-- İlk kurulumda var olan yönetici(ler) sahip olur.
alter table public.profiles add column if not exists is_owner boolean not null default false;
update public.profiles set is_owner = true
  where is_admin and not exists (select 1 from public.profiles where is_owner);

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false);
$$;

-- Kullanıcı kendi PRO/yönetici alanlarını değiştiremez; yöneticiliği sadece sahip verir/alır
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if not public.is_admin() then
      new.pro_until := old.pro_until;
      new.pro_source := old.pro_source;
    end if;
    if not public.is_owner() then
      new.is_admin := old.is_admin;
    end if;
    new.is_owner := old.is_owner;
  end if;
  -- Kimse kendi yöneticiliğini panelden kaldıramasın (kilitlenmeyi önler)
  if old.id = auth.uid() and old.is_admin and not new.is_admin then
    new.is_admin := true;
  end if;
  return new;
end $$;

-- İzin grupları
create table if not exists public.perm_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 40),
  color text not null default '#4ea1ff',
  perms text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.user_groups (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.perm_groups (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
alter table public.perm_groups enable row level security;
alter table public.user_groups enable row level security;

insert into public.perm_groups (name, color, perms)
values ('Moderatör', '#4ea1ff', array['shots.delete', 'shots.edit', 'comments.delete', 'comments.edit', 'reports.view', 'layouts.delete'])
on conflict (name) do nothing;

drop policy if exists "groups readable" on public.perm_groups;
create policy "groups readable" on public.perm_groups for select using (true);
drop policy if exists "groups owner write" on public.perm_groups;
create policy "groups owner write" on public.perm_groups for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "user groups readable" on public.user_groups;
create policy "user groups readable" on public.user_groups for select using (auth.uid() = user_id or public.is_owner());
drop policy if exists "user groups owner write" on public.user_groups;
create policy "user groups owner write" on public.user_groups for all using (public.is_owner()) with check (public.is_owner());

-- Oturumdaki kullanıcının bu izni var mı (yönetici her izne sahip)
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_groups ug join public.perm_groups g on g.id = ug.group_id
    where ug.user_id = auth.uid() and p = any (g.perms)
  );
$$;

create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = public as $$
  select case when public.is_admin()
    then array['shots.delete', 'shots.edit', 'comments.delete', 'comments.edit', 'reports.view', 'layouts.delete']
    else coalesce((select array_agg(distinct x) from public.user_groups ug join public.perm_groups g on g.id = ug.group_id,
                   unnest(g.perms) x where ug.user_id = auth.uid()), '{}') end;
$$;

-- Moderasyon kayıtları (sadece sahip görür)
create table if not exists public.mod_log (
  id bigserial primary key,
  actor uuid,
  actor_name text not null default '',
  action text not null,
  target_type text not null,
  target_id text not null default '',
  target_owner uuid,
  owner_name text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists mod_log_created on public.mod_log (created_at desc);
alter table public.mod_log enable row level security;
drop policy if exists "mod log owner" on public.mod_log;
create policy "mod log owner" on public.mod_log for select using (public.is_owner());

create or replace function public.log_mod(p_action text, p_type text, p_id text, p_owner uuid, p_details jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.mod_log (actor, actor_name, action, target_type, target_id, target_owner, owner_name, details)
  values (auth.uid(), coalesce((select display_name from public.profiles where id = auth.uid()), ''),
          p_action, p_type, p_id, p_owner, coalesce((select display_name from public.profiles where id = p_owner), ''), p_details);
end $$;

-- Başkasının içeriğine yapılan silme/düzenleme kaydedilir
create or replace function public.audit_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid := old.user_id;
  kind text := tg_argv[0];
begin
  if auth.uid() is null or auth.uid() = owner then
    return null;
  end if;
  -- Üst kayıt silinirken zincirleme silinen yorumları ayrıca yazma
  if kind = 'shot_comment' and not exists (select 1 from public.screenshots where id = old.screenshot_id) then
    return null;
  end if;
  if kind = 'layout_comment' and not exists (select 1 from public.shared_layouts where id = old.layout_id) then
    return null;
  end if;
  perform public.log_mod(lower(tg_op), kind, old.id::text, owner,
    case when tg_op = 'DELETE' then to_jsonb(old) else jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) end);
  return null;
end $$;

-- Ekran görüntüleri: görüntülenme, PRO kuralı
alter table public.screenshots add column if not exists views int not null default 0;
alter table public.screenshots add column if not exists last_viewed_at timestamptz not null default now();
alter table public.screenshots add column if not exists edited_at timestamptz;

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
      if coalesce((select pro_until from public.profiles where id = new.user_id), 'epoch'::timestamptz) < now() then
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

create or replace function public.shot_viewed(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('pitwall.counters', 'on', true);
  update public.screenshots set views = views + 1, last_viewed_at = now() where id = p_id;
  perform set_config('pitwall.counters', 'off', true);
end $$;

drop policy if exists "shots own update" on public.screenshots;
create policy "shots own update" on public.screenshots for update
  using (auth.uid() = user_id or public.has_perm('shots.edit'))
  with check (auth.uid() = user_id or public.has_perm('shots.edit'));
drop policy if exists "shots own delete" on public.screenshots;
create policy "shots own delete" on public.screenshots for delete using (auth.uid() = user_id or public.has_perm('shots.delete'));
drop policy if exists "shots own delete" on storage.objects;
create policy "shots own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm('shots.delete')));
drop policy if exists "shots own read" on storage.objects;
create policy "shots own read" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm('shots.delete')));

-- Yorumlar: düzenleme (kendi ya da moderatör) ve silme
alter table public.screenshot_comments add column if not exists edited_at timestamptz;
alter table public.layout_comments add column if not exists edited_at timestamptz;

create or replace function public.protect_comment() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.edited_at := now();
  return new;
end $$;

drop trigger if exists protect_shot_comment on public.screenshot_comments;
create trigger protect_shot_comment before update on public.screenshot_comments
  for each row execute function public.protect_comment();
drop trigger if exists protect_layout_comment on public.layout_comments;
create trigger protect_layout_comment before update on public.layout_comments
  for each row execute function public.protect_comment();

drop policy if exists "shot comments update" on public.screenshot_comments;
create policy "shot comments update" on public.screenshot_comments for update
  using (auth.uid() = user_id or public.has_perm('comments.edit'))
  with check (auth.uid() = user_id or public.has_perm('comments.edit'));
drop policy if exists "shot comments delete" on public.screenshot_comments;
create policy "shot comments delete" on public.screenshot_comments for delete using (
  auth.uid() = user_id
  or public.has_perm('comments.delete')
  or exists (select 1 from public.screenshots s where s.id = screenshot_id and s.user_id = auth.uid())
);
drop policy if exists "comments update" on public.layout_comments;
create policy "comments update" on public.layout_comments for update
  using (auth.uid() = user_id or public.has_perm('comments.edit'))
  with check (auth.uid() = user_id or public.has_perm('comments.edit'));
drop policy if exists "comments delete" on public.layout_comments;
create policy "comments delete" on public.layout_comments for delete using (
  auth.uid() = user_id
  or public.has_perm('comments.delete')
  or exists (select 1 from public.shared_layouts l where l.id = layout_id and l.user_id = auth.uid())
);
drop policy if exists "layouts own delete" on public.shared_layouts;
create policy "layouts own delete" on public.shared_layouts
  for delete using (auth.uid() = user_id or public.has_perm('layouts.delete'));

drop trigger if exists audit_shot_comments on public.screenshot_comments;
create trigger audit_shot_comments after update or delete on public.screenshot_comments
  for each row execute function public.audit_content('shot_comment');
drop trigger if exists audit_layout_comments on public.layout_comments;
create trigger audit_layout_comments after update or delete on public.layout_comments
  for each row execute function public.audit_content('layout_comment');
drop trigger if exists audit_layouts on public.shared_layouts;
create trigger audit_layouts after delete on public.shared_layouts
  for each row execute function public.audit_content('layout');

-- Görsel: silme ve başlık/açıklama düzenlemesi kayda girer (sayaç güncellemeleri girmez)
drop trigger if exists audit_shots on public.screenshots;
create trigger audit_shots after delete on public.screenshots
  for each row execute function public.audit_content('shot');
drop trigger if exists audit_shots_update on public.screenshots;
create trigger audit_shots_update after update of title, description on public.screenshots
  for each row when (old.title is distinct from new.title or old.description is distinct from new.description)
  execute function public.audit_content('shot');

create or replace view public.shot_list with (security_invoker = true) as
  select s.id, s.user_id, s.title, s.description, s.path, s.thumb_path, s.width, s.height, s.bytes,
         s.track, s.car, s.rating_avg, s.rating_count, s.comment_count, s.created_at,
         p.display_name as author_name, p.iracing_name as author_iracing,
         s.views, s.last_viewed_at, s.edited_at
  from public.screenshots s join public.profiles p on p.id = s.user_id;

create or replace view public.shot_comment_list with (security_invoker = true) as
  select c.id, c.screenshot_id, c.user_id, c.body, c.created_at, p.display_name as author_name, c.edited_at
  from public.screenshot_comments c join public.profiles p on p.id = c.user_id;

create or replace view public.comment_list with (security_invoker = true) as
  select c.id, c.layout_id, c.user_id, c.body, c.created_at, p.display_name as author_name, c.edited_at
  from public.layout_comments c join public.profiles p on p.id = c.user_id;

-- Raporlar
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('shot', 'shot_comment', 'layout', 'layout_comment')),
  target_id uuid not null,
  reporter uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 40),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter)
);
create index if not exists reports_open on public.reports (status, created_at desc);
alter table public.reports enable row level security;
drop policy if exists "reports insert" on public.reports;
create policy "reports insert" on public.reports for insert to authenticated with check (auth.uid() = reporter);
drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select using (auth.uid() = reporter or public.has_perm('reports.view'));
drop policy if exists "reports handle" on public.reports;
create policy "reports handle" on public.reports for update
  using (public.has_perm('reports.view')) with check (public.has_perm('reports.view'));

create or replace function public.protect_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.handled_by := null;
    new.handled_at := null;
    new.notified_at := null;
    new.created_at := now();
  else
    new.target_type := old.target_type;
    new.target_id := old.target_id;
    new.reporter := old.reporter;
    new.reason := old.reason;
    new.note := old.note;
    new.created_at := old.created_at;
    if coalesce(auth.role(), '') in ('authenticated', 'anon') then
      new.notified_at := old.notified_at;
      if new.status is distinct from old.status then
        new.handled_by := auth.uid();
        new.handled_at := now();
        perform public.log_mod('report_' || new.status, 'report', new.id::text, old.reporter,
          jsonb_build_object('target_type', old.target_type, 'target_id', old.target_id, 'reason', old.reason));
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_report on public.reports;
create trigger protect_report before insert or update on public.reports
  for each row execute function public.protect_report();

create or replace view public.report_list with (security_invoker = true) as
  select r.*, p.display_name as reporter_name,
    case r.target_type
      when 'shot' then (select jsonb_build_object('title', s.title, 'thumb_path', s.thumb_path, 'path', s.path, 'user_id', s.user_id,
                               'author', (select display_name from public.profiles where id = s.user_id))
                        from public.screenshots s where s.id = r.target_id)
      when 'shot_comment' then (select jsonb_build_object('body', c.body, 'user_id', c.user_id, 'screenshot_id', c.screenshot_id,
                               'author', (select display_name from public.profiles where id = c.user_id))
                        from public.screenshot_comments c where c.id = r.target_id)
      when 'layout' then (select jsonb_build_object('title', l.title, 'user_id', l.user_id,
                               'author', (select display_name from public.profiles where id = l.user_id))
                        from public.shared_layouts l where l.id = r.target_id)
      when 'layout_comment' then (select jsonb_build_object('body', c.body, 'user_id', c.user_id, 'layout_id', c.layout_id,
                               'author', (select display_name from public.profiles where id = c.user_id))
                        from public.layout_comments c where c.id = r.target_id)
    end as target
  from public.reports r join public.profiles p on p.id = r.reporter;

-- Bildirimler (uygulama içi)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications update" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own notifications delete" on public.notifications;
create policy "own notifications delete" on public.notifications for delete using (auth.uid() = user_id);

-- Sahip: yönetici ata/kaldır
create or replace function public.owner_set_admin(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'yetki yok';
  end if;
  if p_user = auth.uid() then
    return;
  end if;
  update public.profiles set is_admin = p_on where id = p_user;
  perform public.log_mod(case when p_on then 'admin_grant' else 'admin_revoke' end, 'user', p_user::text, p_user, '{}');
end $$;

-- Yönetici: kullanıcı ara (sahip, yönetici, gruplar dahil)
drop function if exists public.admin_find_users(text);
create or replace function public.admin_find_users(q text)
returns table (id uuid, display_name text, email text, iracing_name text, pro_until timestamptz, pro_source text,
               is_admin boolean, is_owner boolean, groups uuid[])
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.iracing_name, p.pro_until, p.pro_source, p.is_admin, p.is_owner,
           coalesce((select array_agg(ug.group_id) from public.user_groups ug where ug.user_id = p.id), '{}')
    from public.profiles p join auth.users u on u.id = p.id
    where q = '' or p.display_name ilike '%' || q || '%' or u.email ilike '%' || q || '%'
      or coalesce(p.iracing_name, '') ilike '%' || q || '%'
    order by p.created_at desc
    limit 50;
end $$;

-- Grup üyelik değişiklikleri kayda girsin
create or replace function public.audit_groups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_mod(case when tg_op = 'INSERT' then 'group_add' else 'group_remove' end, 'user',
    coalesce(new.user_id, old.user_id)::text, coalesce(new.user_id, old.user_id),
    jsonb_build_object('group', (select name from public.perm_groups where id = coalesce(new.group_id, old.group_id))));
  return null;
end $$;
drop trigger if exists audit_user_groups on public.user_groups;
create trigger audit_user_groups after insert or delete on public.user_groups
  for each row execute function public.audit_groups();

-- Rapor gelince ve her gece: e-posta ve temizlik işini yapan Edge Function'ı çağır
create or replace function public.call_jobs(p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://xiofxqlpuyotojjeamld.supabase.co/functions/v1/pitwall-jobs', -- kendi projende adresi değiştir
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
exception when others then
  null; -- e-posta gönderilemese de rapor kaydedilir
end $$;
revoke all on function public.call_jobs(jsonb) from public, anon, authenticated;

create or replace function public.report_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.call_jobs(jsonb_build_object('type', 'report', 'id', new.id));
  return null;
end $$;
drop trigger if exists report_created on public.reports;
create trigger report_created after insert on public.reports
  for each row execute function public.report_created();

-- Her gece 03:17 (UTC): 6 aydır açılmayan görselleri temizle
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-shots-cleanup';
select cron.schedule('pitwall-shots-cleanup', '17 3 * * *', $$ select public.call_jobs('{"type":"cleanup"}'::jsonb) $$);

grant select on public.perm_groups to anon, authenticated;
grant insert, update, delete on public.perm_groups to authenticated;
grant select, insert, delete on public.user_groups to authenticated;
grant select on public.mod_log to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.report_list to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant update on public.screenshot_comments, public.layout_comments to authenticated;
grant select on public.shot_list, public.shot_comment_list, public.comment_list to anon, authenticated;
grant execute on function public.has_perm(text), public.my_perms(), public.is_owner() to anon, authenticated;
grant execute on function public.shot_viewed(uuid) to anon, authenticated;
grant execute on function public.owner_set_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_find_users(text) to authenticated;
grant all on public.perm_groups, public.user_groups, public.mod_log, public.reports, public.notifications to service_role;
grant usage, select on sequence public.mod_log_id_seq to service_role;

-- Moderatör bir görseli silerse sahibine bildirim gider
create or replace function public.audit_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid := old.user_id;
  kind text := tg_argv[0];
begin
  if auth.uid() is null or auth.uid() = owner then
    return null;
  end if;
  if kind = 'shot_comment' and not exists (select 1 from public.screenshots where id = old.screenshot_id) then
    return null;
  end if;
  if kind = 'layout_comment' and not exists (select 1 from public.shared_layouts where id = old.layout_id) then
    return null;
  end if;
  perform public.log_mod(lower(tg_op), kind, old.id::text, owner,
    case when tg_op = 'DELETE' then to_jsonb(old) else jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) end);
  if tg_op = 'DELETE' and kind in ('shot', 'layout') then
    insert into public.notifications (user_id, kind, data)
    values (owner, case when kind = 'shot' then 'shot_removed' else 'layout_removed' end, jsonb_build_object('title', old.title));
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Topluluk kuralları, abonelik planları, kullanım istatistikleri, arkadaşlar ve mesajlar
-- ---------------------------------------------------------------------------

create or replace function public.is_pro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce((select pro_until from public.profiles where id = auth.uid()) > now(), false);
$$;
grant execute on function public.is_pro() to anon, authenticated;

-- Topluluk içeriği sadece giriş yapanlara görünür
drop policy if exists "layouts readable" on public.shared_layouts;
create policy "layouts readable" on public.shared_layouts for select to authenticated using (true);
drop policy if exists "ratings readable" on public.layout_ratings;
create policy "ratings readable" on public.layout_ratings for select to authenticated using (true);
drop policy if exists "comments readable" on public.layout_comments;
create policy "comments readable" on public.layout_comments for select to authenticated using (true);
drop policy if exists "shots readable" on public.screenshots;
create policy "shots readable" on public.screenshots for select to authenticated using (true);
drop policy if exists "shot ratings readable" on public.screenshot_ratings;
create policy "shot ratings readable" on public.screenshot_ratings for select to authenticated using (true);
drop policy if exists "shot comments readable" on public.screenshot_comments;
create policy "shot comments readable" on public.screenshot_comments for select to authenticated using (true);

-- Düzenler: normal düzen / yayın düzeni
alter table public.shared_layouts add column if not exists kind text not null default 'layout';
do $$ begin
  alter table public.shared_layouts add constraint shared_layouts_kind check (kind in ('layout', 'stream'));
exception when duplicate_object then null; end $$;

create or replace view public.layout_list with (security_invoker = true) as
  select l.id, l.user_id, l.title, l.description, l.screen_w, l.screen_h, l.cars, l.overlay_count,
         l.downloads, l.rating_avg, l.rating_count, l.created_at, l.updated_at,
         p.display_name as author_name, p.iracing_name as author_iracing,
         l.data -> 'boxes' as boxes, coalesce((l.data ->> 'scale')::numeric, 1) as ui_scale,
         l.kind
  from public.shared_layouts l join public.profiles p on p.id = l.user_id;

-- Düzen paylaşmak, puan vermek ve yorum yazmak PRO
create or replace function public.require_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_pro() then
    raise exception 'Bu işlem PRO üyelik gerektirir';
  end if;
  return new;
end $$;
drop trigger if exists require_pro on public.layout_ratings;
create trigger require_pro before insert or update on public.layout_ratings for each row execute function public.require_pro();
drop trigger if exists require_pro on public.layout_comments;
create trigger require_pro before insert on public.layout_comments for each row execute function public.require_pro();
drop trigger if exists require_pro on public.shared_layouts;
create trigger require_pro before insert on public.shared_layouts for each row execute function public.require_pro();

-- Abonelik planları: 3 ve 6 aylık fiyat metinleri
alter table public.app_config add column if not exists price_3m text not null default '';
alter table public.app_config add column if not exists price_6m text not null default '';

-- Kullanım: her kurulum birkaç dakikada bir haber verir (giriş yapmadan da)
create table if not exists public.app_pings (
  install_id text primary key check (char_length(install_id) between 8 and 64),
  user_id uuid references public.profiles (id) on delete set null,
  version text not null default '',
  in_race boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists app_pings_seen on public.app_pings (last_seen desc);
alter table public.app_pings enable row level security;

create or replace function public.app_ping(p_install text, p_version text, p_in_race boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_pings (install_id, user_id, version, in_race, last_seen)
  values (left(p_install, 64), auth.uid(), left(coalesce(p_version, ''), 32), coalesce(p_in_race, false), now())
  on conflict (install_id) do update set
    user_id = coalesce(auth.uid(), public.app_pings.user_id),
    version = excluded.version, in_race = excluded.in_race, last_seen = now();
end $$;
grant execute on function public.app_ping(text, text, boolean) to anon, authenticated;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'pro', (select count(*) from public.profiles where pro_until > now()),
    'admins', (select count(*) from public.profiles where is_admin),
    'installs', (select count(*) from public.app_pings),
    'active_24h', (select count(*) from public.app_pings where last_seen > now() - interval '1 day'),
    'active_30d', (select count(*) from public.app_pings where last_seen > now() - interval '30 days'),
    'online', (select count(*) from public.app_pings where last_seen > now() - interval '4 minutes'),
    'racing', (select count(*) from public.app_pings where last_seen > now() - interval '4 minutes' and in_race)
  );
end $$;
grant execute on function public.admin_stats() to authenticated;

-- Yönetici: tüm kayıtlılar (sayfalı, süzgeçli)
create or replace function public.admin_users(p_q text, p_filter text, p_offset int)
returns table (id uuid, display_name text, email text, iracing_name text, pro_until timestamptz, pro_source text,
               is_admin boolean, is_owner boolean, groups uuid[], created_at timestamptz, last_seen timestamptz, version text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.iracing_name, p.pro_until, p.pro_source, p.is_admin, p.is_owner,
           coalesce((select array_agg(ug.group_id) from public.user_groups ug where ug.user_id = p.id), '{}'),
           p.created_at, s.last_seen, s.version
    from public.profiles p
    join auth.users u on u.id = p.id
    left join lateral (select max(a.last_seen) as last_seen, max(a.version) as version from public.app_pings a where a.user_id = p.id) s on true
    where (coalesce(p_q, '') = '' or p.display_name ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
           or coalesce(p.iracing_name, '') ilike '%' || p_q || '%')
      and case coalesce(p_filter, 'all')
            when 'pro' then p.pro_until > now()
            when 'admin' then p.is_admin
            when 'online' then s.last_seen > now() - interval '4 minutes'
            else true end
    order by p.created_at desc
    limit 50 offset greatest(coalesce(p_offset, 0), 0);
end $$;
grant execute on function public.admin_users(text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Arkadaşlar: her ilişki iki satır (her iki tarafın kendi ayarları: güvenilir, sessiz)
-- ---------------------------------------------------------------------------

create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending_out', 'pending_in', 'accepted')),
  -- Ben ona güveniyorum: yarışırken verilerimi (yakıt vb.) görebilir
  trusted boolean not null default false,
  -- Ondan mesaj almak istemiyorum
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friendships_friend on public.friendships (friend_id);
alter table public.friendships enable row level security;
drop policy if exists "own friendships" on public.friendships;
create policy "own friendships" on public.friendships for select using (auth.uid() = user_id);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships where user_id = a and friend_id = b and status = 'accepted');
$$;

create or replace function public.friend_request(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  theirs text;
begin
  if me is null or p_user is null or p_user = me then
    raise exception 'Geçersiz kullanıcı';
  end if;
  if (select count(*) from public.friendships where user_id = me) >= 300 then
    raise exception 'Arkadaş sınırına ulaştın';
  end if;
  select status into theirs from public.friendships where user_id = p_user and friend_id = me;
  if theirs = 'pending_out' then
    update public.friendships set status = 'accepted' where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
    return 'accepted';
  end if;
  if theirs is not null then
    return theirs;
  end if;
  insert into public.friendships (user_id, friend_id, status) values (me, p_user, 'pending_out') on conflict do nothing;
  insert into public.friendships (user_id, friend_id, status) values (p_user, me, 'pending_in') on conflict do nothing;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'friend_request', jsonb_build_object('from', me, 'name', (select display_name from public.profiles where id = me)));
  return 'pending';
end $$;

create or replace function public.friend_respond(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.friendships where user_id = me and friend_id = p_user and status = 'pending_in') then
    raise exception 'İstek bulunamadı';
  end if;
  if p_accept then
    update public.friendships set status = 'accepted' where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'friend_accepted', jsonb_build_object('from', me, 'name', (select display_name from public.profiles where id = me)));
  else
    delete from public.friendships where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
  end if;
end $$;

create or replace function public.friend_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships where (user_id = auth.uid() and friend_id = p_user) or (user_id = p_user and friend_id = auth.uid());
end $$;

-- Güvenilir işaretlemek PRO; sessize almak herkese açık
create or replace function public.friend_set(p_user uuid, p_trusted boolean, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_trusted and not public.is_pro()
     and not coalesce((select trusted from public.friendships where user_id = auth.uid() and friend_id = p_user), false) then
    raise exception 'Güvenilir işaretlemek PRO üyelik gerektirir';
  end if;
  update public.friendships set trusted = p_trusted, muted = p_muted
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
end $$;

-- Durum: çevrimiçi / yarışta, rahatsız etme, mesaj kabulü
create table if not exists public.user_status (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  racing boolean not null default false,
  track text not null default '',
  car text not null default '',
  session text not null default '',
  dnd boolean not null default false,
  accept_messages boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.user_status enable row level security;
drop policy if exists "status own write" on public.user_status;
create policy "status own write" on public.user_status for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "status friends read" on public.user_status;
create policy "status friends read" on public.user_status for select using (auth.uid() = user_id or public.are_friends(auth.uid(), user_id));

-- Canlı veri (yakıt vb.): sadece güvendiğim arkadaşlar okur
create table if not exists public.live_data (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.live_data enable row level security;
drop policy if exists "live own write" on public.live_data;
create policy "live own write" on public.live_data for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "live trusted read" on public.live_data;
create policy "live trusted read" on public.live_data for select using (
  auth.uid() = user_id
  or exists (select 1 from public.friendships f
             where f.user_id = live_data.user_id and f.friend_id = auth.uid() and f.status = 'accepted' and f.trusted)
);

-- Mesajlar (göndermek PRO)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair on public.messages (recipient, sender, created_at desc);
create index if not exists messages_sender on public.messages (sender, created_at desc);
alter table public.messages enable row level security;
drop policy if exists "messages own" on public.messages;
create policy "messages own" on public.messages for select using (auth.uid() = sender or auth.uid() = recipient);

create or replace function public.send_message(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
begin
  if not public.is_pro() then
    raise exception 'Mesaj göndermek PRO üyelik gerektirir';
  end if;
  if not public.are_friends(me, p_to) then
    raise exception 'Sadece arkadaşlarına mesaj gönderebilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_to and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_to), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.messages (sender, recipient, body) values (me, p_to, left(trim(p_body), 1000)) returning id into mid;
  return mid;
end $$;

create or replace function public.mark_read(p_from uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.messages set read_at = now() where recipient = auth.uid() and sender = p_from and read_at is null;
end $$;

-- Arkadaş listesi: durum, okunmamış mesaj sayısı ve iki tarafın ayarları tek sorguda
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         coalesce(o.trusted and o.status = 'accepted', false),
         coalesce(s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         case when f.status = 'accepted' then coalesce(s.track, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.car, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.session, '') else '' end,
         coalesce(s.dnd, false), coalesce(s.accept_messages, true),
         case when f.status = 'accepted' then s.updated_at end,
         (select count(*)::int from public.messages m where m.recipient = auth.uid() and m.sender = f.friend_id and m.read_at is null)
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.friendships o on o.user_id = f.friend_id and o.friend_id = f.user_id
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;

grant select on public.friendships, public.user_status, public.live_data, public.messages to authenticated;
grant insert, update, delete on public.user_status, public.live_data to authenticated;
grant execute on function public.are_friends(uuid, uuid), public.friend_request(uuid), public.friend_respond(uuid, boolean),
  public.friend_remove(uuid), public.friend_set(uuid, boolean, boolean), public.send_message(uuid, text),
  public.mark_read(uuid), public.my_friends() to authenticated;
grant all on public.friendships, public.user_status, public.live_data, public.messages, public.app_pings to service_role;

-- Anlık mesaj ve canlı veri için Realtime
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_data;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- ---- 300926-14: topluluk ana sayfası, temalar, duyurular ----
-- ---------------------------------------------------------------------------
-- Topluluk ana sayfası, tema paylaşımı, yönetici duyuruları
-- ---------------------------------------------------------------------------

-- Düzen ve yayın düzeni paylaşmak herkese açık (kullanmak/puan/yorum PRO)
drop trigger if exists require_pro on public.shared_layouts;

create or replace view public.layout_list with (security_invoker = true) as
  select l.id, l.user_id, l.title, l.description, l.screen_w, l.screen_h, l.cars, l.overlay_count,
         l.downloads, l.rating_avg, l.rating_count, l.created_at, l.updated_at,
         p.display_name as author_name, p.iracing_name as author_iracing,
         l.data -> 'boxes' as boxes, coalesce((l.data ->> 'scale')::numeric, 1) as ui_scale,
         l.kind,
         (select count(*) from public.layout_comments c where c.layout_id = l.id)::int as comment_count
  from public.shared_layouts l join public.profiles p on p.id = l.user_id;

-- Paylaşılan temalar (paylaşmak ve kullanmak PRO)
create table if not exists public.shared_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 500),
  theme jsonb not null,
  downloads int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shared_themes_created on public.shared_themes (created_at desc);
alter table public.shared_themes enable row level security;
drop policy if exists "themes readable" on public.shared_themes;
create policy "themes readable" on public.shared_themes for select to authenticated using (true);
drop policy if exists "themes own insert" on public.shared_themes;
create policy "themes own insert" on public.shared_themes for insert with check (auth.uid() = user_id);
drop policy if exists "themes own delete" on public.shared_themes;
create policy "themes own delete" on public.shared_themes for delete using (auth.uid() = user_id or public.has_perm('layouts.delete'));
drop trigger if exists require_pro on public.shared_themes;
create trigger require_pro before insert on public.shared_themes for each row execute function public.require_pro();

create or replace function public.protect_theme() returns trigger
language plpgsql as $$
begin
  new.downloads := 0;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists protect_theme on public.shared_themes;
create trigger protect_theme before insert on public.shared_themes for each row execute function public.protect_theme();

create or replace function public.theme_downloaded(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.shared_themes set downloads = downloads + 1 where id = p_id;
end $$;

create or replace view public.theme_list with (security_invoker = true) as
  select t.id, t.user_id, t.name, t.description, t.theme, t.downloads, t.created_at,
         p.display_name as author_name
  from public.shared_themes t join public.profiles p on p.id = t.user_id;

drop trigger if exists audit_themes on public.shared_themes;
create trigger audit_themes after delete on public.shared_themes
  for each row execute function public.audit_content('theme');

-- Topluluk istatistikleri
create or replace function public.community_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shots', (select count(*) from public.screenshots),
    'layouts', (select count(*) from public.shared_layouts where kind = 'layout'),
    'streams', (select count(*) from public.shared_layouts where kind = 'stream'),
    'themes', (select count(*) from public.shared_themes),
    'comments', (select count(*) from public.screenshot_comments) + (select count(*) from public.layout_comments),
    'ratings', (select count(*) from public.screenshot_ratings) + (select count(*) from public.layout_ratings),
    'downloads', (select coalesce(sum(downloads), 0) from public.shared_layouts) + (select coalesce(sum(downloads), 0) from public.shared_themes),
    'views', (select coalesce(sum(views), 0) from public.screenshots),
    'members', (select count(*) from public.profiles)
  );
$$;

-- Yönetici duyuruları
alter table public.app_config add column if not exists notice_keep_hours int not null default 24;
alter table public.notifications add column if not exists read_at timestamptz;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  audience text not null default 'all' check (audience in ('all', 'pro', 'user')),
  user_id uuid references public.profiles (id) on delete cascade,
  -- Okunduktan sonra kaç saat listede kalır (null: yapılandırmadaki varsayılan)
  keep_hours int,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists announcements_created on public.announcements (created_at desc);
alter table public.announcements enable row level security;
drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements for select to authenticated using (
  public.is_admin()
  or ((expires_at is null or expires_at > now())
      and (audience = 'all' or (audience = 'pro' and public.is_pro()) or (audience = 'user' and user_id = auth.uid())))
);
drop policy if exists "announcements admin" on public.announcements;
create policy "announcements admin" on public.announcements for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.announcement_reads (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
alter table public.announcement_reads enable row level security;
drop policy if exists "reads own" on public.announcement_reads;
create policy "reads own" on public.announcement_reads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.shared_themes, public.theme_list to authenticated;
grant insert, delete on public.shared_themes to authenticated;
grant select on public.layout_list to authenticated;
grant execute on function public.theme_downloaded(uuid), public.community_stats() to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert, delete on public.announcement_reads to authenticated;
grant all on public.shared_themes, public.announcements, public.announcement_reads to service_role;

-- ---------------------------------------------------------------------------
-- Arkadaşlık isteği gelince karşı tarafa temalı e-posta (Edge Function pitwall-jobs gönderir)
-- ---------------------------------------------------------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'friend_request' then
    perform public.call_jobs(jsonb_build_object('type', 'friend_request', 'id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists friend_request_mail on public.notifications;
create trigger friend_request_mail after insert on public.notifications
  for each row execute function public.friend_request_mail();

-- ---------------------------------------------------------------------------
-- Lemon Squeezy abonelikleri, PRO süresi uyarısı, cihaz takibi
-- ---------------------------------------------------------------------------
alter table public.app_config add column if not exists checkout_1m text not null default '';
alter table public.app_config add column if not exists checkout_3m text not null default '';
alter table public.app_config add column if not exists checkout_6m text not null default '';
alter table public.app_config add column if not exists checkout_12m text not null default '';
alter table public.app_config add column if not exists device_limit int not null default 2;
alter table public.profiles add column if not exists pro_warned_until timestamptz;

-- Lemon Squeezy abonelik kayıtları (webhook yazar)
create table if not exists public.subscriptions (
  lemon_id text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null default '',
  status text not null default '',
  plan text not null default '',
  variant_id text not null default '',
  renews_at timestamptz,
  ends_at timestamptz,
  portal_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions for select using (auth.uid() = user_id);

-- Webhook: aboneliği kaydet, hesabın PRO süresini ayarla (sadece sunucu çağırır)
create or replace function public.apply_subscription(
  p_lemon_id text, p_user uuid, p_email text, p_status text, p_plan text, p_variant text,
  p_renews timestamptz, p_ends timestamptz, p_portal text, p_until timestamptz
) returns text language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
begin
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  if uid is null and coalesce(p_email, '') <> '' then
    select p.id into uid from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email)
      limit 1;
  end if;
  insert into public.subscriptions (lemon_id, user_id, email, status, plan, variant_id, renews_at, ends_at, portal_url)
    values (p_lemon_id, uid, coalesce(p_email, ''), p_status, p_plan, p_variant, p_renews, p_ends, coalesce(p_portal, ''))
    on conflict (lemon_id) do update set
      user_id = coalesce(excluded.user_id, public.subscriptions.user_id),
      email = excluded.email, status = excluded.status, plan = excluded.plan, variant_id = excluded.variant_id,
      renews_at = excluded.renews_at, ends_at = excluded.ends_at,
      portal_url = case when excluded.portal_url = '' then public.subscriptions.portal_url else excluded.portal_url end,
      updated_at = now();
  if p_until is null then
    return coalesce(uid::text, 'none');
  end if;
  if uid is null then
    insert into public.pending_pro (email, pro_until, source) values (lower(p_email), p_until, 'lemon')
      on conflict (email) do update set pro_until = greatest(public.pending_pro.pro_until, excluded.pro_until), source = 'lemon';
    return 'pending';
  end if;
  -- Elle/Patreon ile verilmiş daha uzun süre varsa kısaltma
  update public.profiles set
    pro_until = case when pro_source = 'lemon' or pro_until is null or pro_until < p_until then p_until else pro_until end,
    pro_source = case when pro_source = 'lemon' or pro_until is null or pro_until < p_until then 'lemon' else pro_source end
  where id = uid;
  return uid::text;
end $$;
revoke all on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz) to service_role;

-- Hesabın aboneliği kendini yeniliyor mu? (yenileniyorsa süre dolma uyarısı gerekmez)
create or replace function public.sub_renewing(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions s
    where s.user_id = p_user and s.status in ('active', 'on_trial') and (s.ends_at is null or s.ends_at > now()));
$$;

-- Kullanıcı: kendi PRO durumu ve aboneliği
create or replace function public.my_pro() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro_until', p.pro_until,
    'source', p.pro_source,
    'renewing', public.sub_renewing(p.id),
    'sub', (select to_jsonb(s) from (
      select status, plan, renews_at, ends_at, portal_url from public.subscriptions
      where user_id = p.id order by updated_at desc limit 1) s)
  ) from public.profiles p where p.id = auth.uid();
$$;

-- Bitmesine 15 gün kalan (ve yenilenmeyen) PRO'lar için günde bir bildirim (e-postayı pitwall-jobs gönderir)
create or replace function public.pro_expiry_notify() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with due as (
    select p.id, p.pro_until from public.profiles p
    where p.pro_until > now() and p.pro_until <= now() + interval '15 days'
      and not p.is_admin and p.pro_warned_until is distinct from p.pro_until
      and not public.sub_renewing(p.id)
  ), ins as (
    insert into public.notifications (user_id, kind, data)
    select id, 'pro_expiring', jsonb_build_object('until', pro_until) from due returning 1
  ), upd as (
    update public.profiles set pro_warned_until = pro_until where id in (select id from due) returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end $$;
revoke all on function public.pro_expiry_notify() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-pro-expiry';
select cron.schedule('pitwall-pro-expiry', '5 6 * * *', $$ select public.pro_expiry_notify() $$);

-- Cihaz takibi: her hesabın giriş yaptığı bilgisayarlar (kimlik karma olarak tutulur)
create table if not exists public.devices (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_hash text not null,
  label text not null default '',
  app_version text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_hash)
);
alter table public.devices enable row level security;

create table if not exists public.device_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_count int not null,
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_at timestamptz
);
alter table public.device_flags enable row level security;

create or replace function public.register_device(p_hash text, p_label text, p_version text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  lim int;
  nm text;
begin
  if uid is null or length(coalesce(p_hash, '')) < 8 then
    return '{}'::jsonb;
  end if;
  insert into public.devices (user_id, device_hash, label, app_version)
    values (uid, left(p_hash, 64), left(coalesce(p_label, ''), 60), left(coalesce(p_version, ''), 30))
    on conflict (user_id, device_hash) do update
      set last_seen = now(), label = excluded.label, app_version = excluded.app_version;
  select coalesce(device_limit, 2) into lim from public.app_config where id = 1;
  select count(*) into n from public.devices where user_id = uid and last_seen > now() - interval '30 days';
  if n > lim
     and not exists (select 1 from public.device_flags f where f.user_id = uid and (not f.resolved or f.device_count >= n)) then
    insert into public.device_flags (user_id, device_count) values (uid, n);
    select display_name into nm from public.profiles where id = uid;
    insert into public.notifications (user_id, kind, data)
      select a.id, 'device_alert', jsonb_build_object('user', uid, 'name', coalesce(nm, '?'), 'count', n)
      from public.profiles a where a.is_admin;
  end if;
  return jsonb_build_object('count', n, 'limit', lim);
end $$;

-- Yönetici: hesaplar ve cihazları (p_filter: flagged | multi | all)
create or replace function public.admin_devices(p_filter text default 'multi')
returns table (user_id uuid, display_name text, email text, pro_until timestamptz, device_count int, flag_id uuid, devices jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select p.id, p.display_name, u.email::text, p.pro_until,
      (select count(*)::int from public.devices d where d.user_id = p.id and d.last_seen > now() - interval '30 days'),
      (select f.id from public.device_flags f where f.user_id = p.id and not f.resolved order by f.created_at desc limit 1),
      (select coalesce(jsonb_agg(jsonb_build_object('hash', d.device_hash, 'label', d.label, 'version', d.app_version,
         'first_seen', d.first_seen, 'last_seen', d.last_seen) order by d.last_seen desc), '[]'::jsonb)
         from public.devices d where d.user_id = p.id)
    from public.profiles p join auth.users u on u.id = p.id
    where exists (select 1 from public.devices d where d.user_id = p.id)
      and (p_filter = 'all'
        or (p_filter = 'flagged' and exists (select 1 from public.device_flags f where f.user_id = p.id and not f.resolved))
        or (p_filter = 'multi' and (select count(*) from public.devices d where d.user_id = p.id and d.last_seen > now() - interval '30 days') > 1))
    order by 5 desc, p.created_at desc
    limit 200;
end $$;

create or replace function public.admin_remove_device(p_user uuid, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.devices where user_id = p_user and device_hash = p_hash;
end $$;

create or replace function public.admin_resolve_flag(p_flag uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  update public.device_flags set resolved = true, resolved_at = now() where id = p_flag;
end $$;

-- Yönetici: abonelik listesi
create or replace function public.admin_subscriptions()
returns table (lemon_id text, user_id uuid, display_name text, email text, status text, plan text,
               renews_at timestamptz, ends_at timestamptz, updated_at timestamptz, created_at timestamptz, pro_until timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select s.lemon_id, s.user_id, p.display_name, coalesce(u.email::text, s.email), s.status, s.plan,
           s.renews_at, s.ends_at, s.updated_at, s.created_at, p.pro_until
    from public.subscriptions s
    left join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id = s.user_id
    order by s.updated_at desc
    limit 300;
end $$;

-- Bildirimden e-posta: arkadaşlık isteği, PRO süresi uyarısı, cihaz uyarısı
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

grant select on public.subscriptions to authenticated;
grant execute on function public.my_pro(), public.register_device(text, text, text), public.sub_renewing(uuid) to authenticated;
grant execute on function public.admin_devices(text), public.admin_remove_device(uuid, text),
  public.admin_resolve_flag(uuid), public.admin_subscriptions() to authenticated;
grant all on public.subscriptions, public.devices, public.device_flags to service_role;

-- ---------------------------------------------------------------------------
-- Web sitesi: ödemeler, PRO süre değişiklik kaydı, site ziyaret istatistikleri
-- ---------------------------------------------------------------------------

-- Her ödeme (Lemon Squeezy fatura/sipariş, Patreon ödeme, Ko-fi) bir satır. Webhook yazar.
create table if not exists public.payments (
  id text primary key,
  source text not null,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null default '',
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  plan text not null default '',
  kind text not null default 'payment', -- payment | refund
  created_at timestamptz not null default now()
);
create index if not exists payments_created on public.payments (created_at desc);
create index if not exists payments_user on public.payments (user_id);
alter table public.payments enable row level security;
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for select using (auth.uid() = user_id);

create or replace function public.record_payment(
  p_id text, p_source text, p_email text, p_user uuid, p_amount numeric, p_currency text, p_plan text, p_kind text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
begin
  if uid is null and coalesce(p_email, '') <> '' then
    select p.id into uid from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email) limit 1;
  end if;
  insert into public.payments (id, source, user_id, email, amount, currency, plan, kind)
    values (p_id, p_source, uid, lower(coalesce(p_email, '')), coalesce(p_amount, 0), upper(coalesce(nullif(p_currency, ''), 'USD')),
            coalesce(p_plan, ''), coalesce(nullif(p_kind, ''), 'payment'))
    on conflict (id) do update set amount = excluded.amount, kind = excluded.kind, user_id = coalesce(public.payments.user_id, excluded.user_id);
end $$;
revoke all on function public.record_payment(text, text, text, uuid, numeric, text, text, text) from public, anon, authenticated;

-- PRO süre değişiklikleri (yönetici uzatması, abonelik, Patreon ...): kim, ne zaman, eskisi/yenisi
create table if not exists public.pro_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  by_user uuid references public.profiles (id) on delete set null,
  old_until timestamptz,
  new_until timestamptz,
  source text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists pro_log_user on public.pro_log (user_id, created_at desc);
alter table public.pro_log enable row level security;

-- profiles.pro_until her değiştiğinde kayıt düşer
create or replace function public.pro_log_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pro_until is distinct from old.pro_until then
    insert into public.pro_log (user_id, by_user, old_until, new_until, source)
      values (new.id, auth.uid(), old.pro_until, new.pro_until, coalesce(new.pro_source, ''));
  end if;
  return new;
end $$;
drop trigger if exists pro_log_trg on public.profiles;
create trigger pro_log_trg after update of pro_until on public.profiles
  for each row execute function public.pro_log_trg();

-- Yönetici: PRO süresini gün ekleyerek uzat (eksi değer kısaltır); not kaydedilir
create or replace function public.admin_extend_pro(p_user uuid, p_days int, p_note text default '')
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  nu timestamptz;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  update public.profiles
    set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days), pro_source = 'admin'
    where id = p_user returning pro_until into nu;
  update public.pro_log set note = coalesce(p_note, '')
    where id = (select max(id) from public.pro_log where user_id = p_user);
  return nu;
end $$;

create or replace function public.admin_pro_log(p_user uuid default null)
returns table (id bigint, user_id uuid, display_name text, by_name text, old_until timestamptz, new_until timestamptz,
               source text, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select l.id, l.user_id, p.display_name, b.display_name, l.old_until, l.new_until, l.source, l.note, l.created_at
    from public.pro_log l
    left join public.profiles p on p.id = l.user_id
    left join public.profiles b on b.id = l.by_user
    where p_user is null or l.user_id = p_user
    order by l.created_at desc limit 200;
end $$;

create or replace function public.admin_payments(p_days int default 365)
returns table (id text, source text, user_id uuid, display_name text, email text, amount numeric, currency text,
               plan text, kind text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select x.id, x.source, x.user_id, p.display_name, x.email, x.amount, x.currency, x.plan, x.kind, x.created_at
    from public.payments x left join public.profiles p on p.id = x.user_id
    where x.created_at > now() - make_interval(days => greatest(p_days, 1))
    order by x.created_at desc limit 1000;
end $$;

-- Site ziyaretleri: her sayfa açılışı bir satır (ziyaretçi kimliği tarayıcıda rastgele, kişisel veri yok)
create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  visitor text not null,
  path text not null,
  ref text not null default '',
  lang text not null default '',
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists site_visits_created on public.site_visits (created_at desc);
alter table public.site_visits enable row level security;

create or replace function public.site_hit(p_visitor text, p_path text, p_ref text, p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_visitor, '')) not between 8 and 64 then return; end if;
  -- aynı ziyaretçi aynı sayfayı 30 dk içinde tekrar sayılmaz
  if exists (select 1 from public.site_visits where visitor = p_visitor and path = left(p_path, 120)
             and created_at > now() - interval '30 minutes') then return; end if;
  insert into public.site_visits (visitor, path, ref, lang, user_id)
    values (p_visitor, left(coalesce(p_path, '/'), 120), left(coalesce(p_ref, ''), 200), left(coalesce(p_lang, ''), 12), auth.uid());
end $$;

-- Yönetici: site ve satış istatistikleri (son p_days gün)
create or replace function public.admin_site_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  since timestamptz := date_trunc('day', now()) - make_interval(days => greatest(p_days, 1) - 1);
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return jsonb_build_object(
    'visits', (select count(*) from public.site_visits where created_at >= since),
    'visitors', (select count(distinct visitor) from public.site_visits where created_at >= since),
    'downloads', (select count(*) from public.site_visits where created_at >= since and path = '/download'),
    'signups', (select count(*) from public.profiles where created_at >= since),
    'revenue', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments where created_at >= since group by currency) r),
    'revenue_all', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments group by currency) r),
    'payments', (select count(*) from public.payments where created_at >= since and kind = 'payment'),
    'active_subs', (select count(*) from public.subscriptions where status in ('active', 'on_trial', 'past_due')),
    'pro', (select count(*) from public.profiles where pro_until > now()),
    'pro_by_source', (select coalesce(jsonb_object_agg(src, n), '{}') from (
        select coalesce(pro_source, '?') src, count(*) n from public.profiles where pro_until > now() group by 1) s),
    'users', (select count(*) from public.profiles),
    'expiring_15d', (select count(*) from public.profiles where pro_until > now() and pro_until <= now() + interval '15 days'),
    'daily', (select coalesce(jsonb_agg(d order by d->>'day'), '[]') from (
        select jsonb_build_object(
          'day', to_char(g, 'YYYY-MM-DD'),
          'visits', (select count(*) from public.site_visits v where v.created_at >= g and v.created_at < g + interval '1 day'),
          'visitors', (select count(distinct visitor) from public.site_visits v where v.created_at >= g and v.created_at < g + interval '1 day'),
          'signups', (select count(*) from public.profiles p where p.created_at >= g and p.created_at < g + interval '1 day'),
          'payments', (select count(*) from public.payments x where x.kind = 'payment' and x.created_at >= g and x.created_at < g + interval '1 day'),
          'revenue', (select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) from public.payments x
                      where x.created_at >= g and x.created_at < g + interval '1 day')
        ) d
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) q),
    'pages', (select coalesce(jsonb_agg(x), '[]') from (
        select path, count(*) n from public.site_visits where created_at >= since group by path order by n desc limit 12) x),
    'refs', (select coalesce(jsonb_agg(x), '[]') from (
        select ref, count(*) n from public.site_visits where created_at >= since and ref <> '' group by ref order by n desc limit 12) x),
    'langs', (select coalesce(jsonb_agg(x), '[]') from (
        select lang, count(distinct visitor) n from public.site_visits where created_at >= since group by lang order by n desc limit 12) x)
  );
end $$;

-- Kullanıcı: kendi ödemeleri
create or replace function public.my_payments()
returns table (id text, source text, amount numeric, currency text, plan text, kind text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, source, amount, currency, plan, kind, created_at from public.payments
  where user_id = auth.uid() order by created_at desc limit 100;
$$;

grant execute on function public.site_hit(text, text, text, text) to anon, authenticated;
grant execute on function public.my_payments() to authenticated;
grant execute on function public.admin_extend_pro(uuid, int, text), public.admin_pro_log(uuid),
  public.admin_payments(int), public.admin_site_stats(int) to authenticated;

-- Türkiye'ye özel fiyatlar (TL): Türkiye'den girenler bu fiyatı ve ödeme bağlantısını görür; boşsa genel fiyat
alter table public.app_config add column if not exists price_tr_1m text not null default '';
alter table public.app_config add column if not exists price_tr_3m text not null default '';
alter table public.app_config add column if not exists price_tr_6m text not null default '';
alter table public.app_config add column if not exists price_tr_12m text not null default '';
alter table public.app_config add column if not exists checkout_tr_1m text not null default '';
alter table public.app_config add column if not exists checkout_tr_3m text not null default '';
alter table public.app_config add column if not exists checkout_tr_6m text not null default '';
alter table public.app_config add column if not exists checkout_tr_12m text not null default '';

-- ---------------------------------------------------------------------------
-- c21: PRO süresini elle düzenleme (+ isteğe bağlı bildirim/e-posta), 10 ve 1 gün kala PRO uyarısı,
--      destek talepleri, bölüm/overlay gizleme, herkese ücretsiz PRO kampanyası,
--      gelir ve ücretli / ücretsiz PRO üye listeleri
-- ---------------------------------------------------------------------------

-- Görünürlük ve kampanya ayarları
alter table public.app_config add column if not exists hidden_sections text[] not null default '{}';
alter table public.app_config add column if not exists hidden_overlays text[] not null default '{}';
alter table public.app_config add column if not exists promo_pro_until timestamptz;
alter table public.app_config add column if not exists promo_note text not null default '';

-- Herkese ücretsiz PRO kampanyası sürüyor mu? (sadece giriş yapmış hesaplar yararlanır)
create or replace function public.promo_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select promo_pro_until > now() from public.app_config where id = 1), false);
$$;
grant execute on function public.promo_active() to anon, authenticated;

-- PRO denetimi: yönetici, süresi devam eden PRO ya da (giriş yapmışsa) kampanya
create or replace function public.is_pro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or coalesce((select pro_until from public.profiles where id = auth.uid()) > now(), false)
      or (auth.uid() is not null and public.promo_active());
$$;
grant execute on function public.is_pro() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Yönetici: PRO süresini düzenle. p_mode:
--   add       p_days gün ekle (eksi değer kısaltır; süre bittiyse bugünden sayılır)
--   set       p_until tarihine ayarla
--   unlimited süresiz (2099)
--   remove    PRO'yu kaldır
-- p_notify: kullanıcıya uygulama içi bildirim + e-posta (kendi dilinde) gönder
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_pro(
  p_user uuid, p_mode text, p_days int default null, p_until timestamptz default null,
  p_note text default '', p_notify boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  ou timestamptz;
  nu timestamptz;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select pro_until into ou from public.profiles where id = p_user;
  if not found then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if p_mode = 'add' then
    if coalesce(p_days, 0) = 0 then
      raise exception 'Gün sayısı gerekli';
    end if;
    nu := (case when ou > now() then ou else now() end) + make_interval(days => p_days);
    if nu <= now() then
      nu := now();
    end if;
  elsif p_mode = 'set' then
    if p_until is null then
      raise exception 'Tarih gerekli';
    end if;
    nu := p_until;
  elsif p_mode = 'unlimited' then
    nu := '2099-12-31 00:00:00+00'::timestamptz;
  elsif p_mode = 'remove' then
    nu := null;
  else
    raise exception 'Geçersiz işlem';
  end if;
  update public.profiles
    set pro_until = nu, pro_source = case when nu is null then null else 'admin' end
    where id = p_user;
  if nu is distinct from ou then
    update public.pro_log set note = left(coalesce(p_note, ''), 200)
      where id = (select max(id) from public.pro_log where user_id = p_user);
  end if;
  if p_notify then
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'pro_changed', jsonb_build_object(
        'old_until', ou, 'new_until', nu, 'mode', p_mode,
        'days', case when p_mode = 'add' then p_days
                     when nu is not null and ou is not null then round(extract(epoch from (nu - greatest(ou, now()))) / 86400)::int
                     else null end,
        'note', left(coalesce(p_note, ''), 200)));
  end if;
  return nu;
end $$;
grant execute on function public.admin_change_pro(uuid, text, int, timestamptz, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- PRO bitiş uyarısı: 10 gün kala ve son 1 gün kala (her bitiş tarihi için bir kez).
-- pro_warned_until = uyarının ait olduğu bitiş tarihi, pro_warned_stage = 1 (10 gün) / 2 (1 gün).
-- Kendini yenileyen abonelikler ve yöneticiler atlanır.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists pro_warned_stage int not null default 0;

create or replace function public.pro_expiry_notify() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with cand as (
    select p.id, p.pro_until,
      case when p.pro_until <= now() + interval '1 day' then 2 else 1 end as want,
      -- eski (15 günlük) uyarıyı almış olanlar 1. aşamayı almış sayılır
      case when p.pro_warned_until is not distinct from p.pro_until then greatest(coalesce(p.pro_warned_stage, 0), 1) else 0 end as done
    from public.profiles p
    where p.pro_until > now() and p.pro_until <= now() + interval '10 days'
      and not p.is_admin
      and not public.sub_renewing(p.id)
  ), due as (
    select * from cand where done < want
  ), ins as (
    insert into public.notifications (user_id, kind, data)
    select id, 'pro_expiring', jsonb_build_object('until', pro_until, 'stage', case when want = 2 then 'd1' else 'd10' end)
    from due returning 1
  ), upd as (
    update public.profiles p set pro_warned_until = d.pro_until, pro_warned_stage = d.want
    from due d where p.id = d.id returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end $$;
revoke all on function public.pro_expiry_notify() from public, anon, authenticated;
-- Günde bir kez (06:05 UTC)
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-pro-expiry';
select cron.schedule('pitwall-pro-expiry', '5 6 * * *', $$ select public.pro_expiry_notify() $$);

-- ---------------------------------------------------------------------------
-- Destek talepleri
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'other' check (category in ('bug', 'payment', 'account', 'feature', 'overlay', 'other')),
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  last_author text not null default 'user' check (last_author in ('user', 'staff')),
  user_seen_at timestamptz,
  staff_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_updated on public.support_tickets (updated_at desc);
alter table public.support_tickets enable row level security;
drop policy if exists "support tickets read" on public.support_tickets;
create policy "support tickets read" on public.support_tickets for select using (auth.uid() = user_id or public.is_admin());

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  images text[] not null default '{}',
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, created_at);
alter table public.support_messages enable row level security;
drop policy if exists "support messages read" on public.support_messages;
create policy "support messages read" on public.support_messages for select using (
  public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

-- Görseller: özel "support" kovası, <kullanıcı id>/<talep>/<dosya>. Kullanıcı kendi klasörüne yükler;
-- yönetici hepsini, kullanıcı kendi taleplerindeki görselleri (yöneticinin eklediği dahil) okur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.support_can_read(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or split_part(p_path, '/', 1) = auth.uid()::text
      or exists (select 1 from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
                 where t.user_id = auth.uid() and p_path = any (m.images));
$$;
grant execute on function public.support_can_read(text) to authenticated;

drop policy if exists "support own upload" on storage.objects;
create policy "support own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "support read" on storage.objects;
create policy "support read" on storage.objects for select to authenticated
  using (bucket_id = 'support' and public.support_can_read(name));
drop policy if exists "support delete" on storage.objects;
create policy "support delete" on storage.objects for delete to authenticated
  using (bucket_id = 'support' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Görsel yolları: en çok 4, hepsi yazanın kendi klasöründe
create or replace function public.support_check_images(p_images text[]) returns text[]
language plpgsql stable set search_path = public as $$
declare
  x text;
begin
  if coalesce(array_length(p_images, 1), 0) > 4 then
    raise exception 'En fazla 4 görsel eklenebilir';
  end if;
  foreach x in array coalesce(p_images, '{}') loop
    if split_part(x, '/', 1) <> auth.uid()::text or x like '%..%' then
      raise exception 'Geçersiz görsel';
    end if;
  end loop;
  return coalesce(p_images, '{}');
end $$;

-- Yöneticilere bildirim (aynı talep için okunmamış bildirim varsa yenisi eklenmez: e-posta yağmuru olmasın)
create or replace function public.support_notify_admins(p_ticket uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.support_tickets;
  nm text;
begin
  select * into t from public.support_tickets where id = p_ticket;
  select display_name into nm from public.profiles where id = t.user_id;
  insert into public.notifications (user_id, kind, data)
    select a.id, p_kind, jsonb_build_object('ticket', t.id, 'subject', t.subject, 'category', t.category, 'name', coalesce(nm, '?'), 'user', t.user_id)
    from public.profiles a
    where a.is_admin and a.id <> t.user_id
      and not exists (select 1 from public.notifications n where n.user_id = a.id and not n.read
                      and n.kind in ('support_new', 'support_user_reply') and n.data ->> 'ticket' = t.id::text);
end $$;
revoke all on function public.support_notify_admins(uuid, text) from public, anon, authenticated;

-- Kullanıcı: yeni talep (ilk mesajla)
create or replace function public.support_create(p_category text, p_subject text, p_body text, p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if (select count(*) from public.support_tickets where user_id = me and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Çok fazla talep açtın, biraz sonra tekrar dene';
  end if;
  if char_length(trim(coalesce(p_subject, ''))) = 0 or char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Başlık ve mesaj gerekli';
  end if;
  insert into public.support_tickets (user_id, category, subject, user_seen_at)
    values (me, case when p_category in ('bug', 'payment', 'account', 'feature', 'overlay', 'other') then p_category else 'other' end,
            left(trim(p_subject), 120), now())
    returning id into tid;
  insert into public.support_messages (ticket_id, author_id, body, images, is_staff)
    values (tid, me, left(trim(p_body), 4000), public.support_check_images(p_images), false);
  perform public.support_notify_admins(tid, 'support_new');
  return tid;
end $$;

-- Yanıt: talep sahibi yazarsa yöneticilere, yönetici yazarsa sahibine bildirim + e-posta
create or replace function public.support_reply(p_ticket uuid, p_body text, p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.support_tickets;
  staff boolean;
  mid uuid;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if not found or (t.user_id <> me and not public.is_admin()) then
    raise exception 'Talep bulunamadı';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Mesaj boş olamaz';
  end if;
  staff := t.user_id <> me;
  if not staff and (select count(*) from public.support_messages where author_id = me and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Çok hızlı yazıyorsun';
  end if;
  insert into public.support_messages (ticket_id, author_id, body, images, is_staff)
    values (p_ticket, me, left(trim(p_body), 4000), public.support_check_images(p_images), staff)
    returning id into mid;
  update public.support_tickets set
    status = case when staff then 'answered' else 'open' end,
    last_author = case when staff then 'staff' else 'user' end,
    staff_seen_at = case when staff then now() else staff_seen_at end,
    user_seen_at = case when staff then user_seen_at else now() end,
    updated_at = now()
  where id = p_ticket;
  if staff then
    if not exists (select 1 from public.notifications n where n.user_id = t.user_id and not n.read
                   and n.kind = 'support_reply' and n.data ->> 'ticket' = t.id::text) then
      insert into public.notifications (user_id, kind, data)
        values (t.user_id, 'support_reply', jsonb_build_object('ticket', t.id, 'subject', t.subject, 'category', t.category,
                'name', (select display_name from public.profiles where id = me)));
    end if;
  else
    perform public.support_notify_admins(p_ticket, 'support_user_reply');
  end if;
  return mid;
end $$;

-- Kapat / yeniden aç (sahip ya da yönetici)
create or replace function public.support_set_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'Geçersiz durum';
  end if;
  update public.support_tickets set status = p_status, updated_at = now()
    where id = p_ticket and (user_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'Talep bulunamadı';
  end if;
end $$;

-- Talep okundu (sahipse kullanıcı, değilse yönetici tarafı)
create or replace function public.support_seen(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets set user_seen_at = now() where id = p_ticket and user_id = auth.uid();
  if not found and public.is_admin() then
    update public.support_tickets set staff_seen_at = now() where id = p_ticket;
  end if;
end $$;

-- Kullanıcı: kendi talepleri
create or replace function public.my_support_tickets()
returns table (id uuid, category text, subject text, status text, created_at timestamptz, updated_at timestamptz,
               unread boolean, messages int, last_body text)
language sql stable security definer set search_path = public as $$
  select t.id, t.category, t.subject, t.status, t.created_at, t.updated_at,
         t.last_author = 'staff' and (t.user_seen_at is null or t.user_seen_at < t.updated_at),
         (select count(*)::int from public.support_messages m where m.ticket_id = t.id),
         (select left(m.body, 160) from public.support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1)
  from public.support_tickets t
  where t.user_id = auth.uid()
  order by t.updated_at desc limit 100;
$$;

-- Talebin mesajları (sahip ya da yönetici)
create or replace function public.support_thread(p_ticket uuid)
returns table (id uuid, author_id uuid, author_name text, body text, images text[], is_staff boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets t where t.id = p_ticket and (t.user_id = auth.uid() or public.is_admin())) then
    raise exception 'Talep bulunamadı';
  end if;
  return query
    select m.id, m.author_id, coalesce(p.display_name, '?'), m.body, m.images, m.is_staff, m.created_at
    from public.support_messages m left join public.profiles p on p.id = m.author_id
    where m.ticket_id = p_ticket order by m.created_at;
end $$;

-- Yönetici: talepler (p_status: null/'' hepsi, 'open', 'answered', 'closed', 'unread')
create or replace function public.admin_support_tickets(p_status text default null, p_category text default null)
returns table (id uuid, user_id uuid, display_name text, email text, category text, subject text, status text,
               created_at timestamptz, updated_at timestamptz, unread boolean, messages int, last_body text, pro_until timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select t.id, t.user_id, p.display_name, u.email::text, t.category, t.subject, t.status, t.created_at, t.updated_at,
           t.last_author = 'user' and (t.staff_seen_at is null or t.staff_seen_at < t.updated_at),
           (select count(*)::int from public.support_messages m where m.ticket_id = t.id),
           (select left(m.body, 160) from public.support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1),
           p.pro_until
    from public.support_tickets t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
    where (coalesce(p_status, '') = ''
           or (p_status = 'unread' and t.last_author = 'user' and (t.staff_seen_at is null or t.staff_seen_at < t.updated_at))
           or t.status = p_status)
      and (coalesce(p_category, '') = '' or t.category = p_category)
    order by (t.status = 'open') desc, t.updated_at desc
    limit 300;
end $$;

grant select on public.support_tickets, public.support_messages to authenticated;
grant execute on function public.support_create(text, text, text, text[]), public.support_reply(uuid, text, text[]),
  public.support_set_status(uuid, text), public.support_seen(uuid), public.my_support_tickets(),
  public.support_thread(uuid), public.admin_support_tickets(text, text) to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;

-- ---------------------------------------------------------------------------
-- Gelir ve PRO üyeleri: parayla PRO olanlar / ücretsiz PRO olanlar
-- ---------------------------------------------------------------------------
create or replace function public.admin_revenue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  paid_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select coalesce(array_agg(p.id), '{}') into paid_ids from public.profiles p
    where p.pro_until > now()
      and (p.pro_source in ('lemon', 'patreon', 'kofi')
           or exists (select 1 from public.payments x where x.user_id = p.id and x.kind = 'payment'));
  return jsonb_build_object(
    'month', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments where created_at >= date_trunc('month', now()) group by currency) r),
    'd30', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments where created_at >= now() - interval '30 days' group by currency) r),
    'all', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments group by currency) r),
    'payments_month', (select count(*) from public.payments where kind = 'payment' and created_at >= date_trunc('month', now())),
    'payments_all', (select count(*) from public.payments where kind = 'payment'),
    'paying_users', (select count(distinct user_id) from public.payments where kind = 'payment' and user_id is not null),
    'paid_pro', coalesce(array_length(paid_ids, 1), 0),
    'free_pro', (select count(*) from public.profiles p where p.pro_until > now() and not (p.id = any (paid_ids))),
    'promo_until', (select promo_pro_until from public.app_config where id = 1)
  );
end $$;

-- p_kind: 'paid' (ödeme kaynağından PRO ya da ödemesi olan) | 'free' (yönetici / diğer, ödemesi yok)
create or replace function public.admin_pro_members(p_kind text default 'paid')
returns table (user_id uuid, display_name text, email text, pro_until timestamptz, pro_source text,
               paid jsonb, payments int, last_payment timestamptz, renewing boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    with m as (
      select p.id, p.display_name, u.email::text as email, p.pro_until, p.pro_source,
        (p.pro_source in ('lemon', 'patreon', 'kofi')
         or exists (select 1 from public.payments x where x.user_id = p.id and x.kind = 'payment')) as is_paid
      from public.profiles p join auth.users u on u.id = p.id
      where p.pro_until > now()
    )
    select m.id, m.display_name, m.email, m.pro_until, m.pro_source,
      (select coalesce(jsonb_object_agg(q.currency, q.total), '{}') from (
         select x.currency, sum(case when x.kind = 'refund' then -x.amount else x.amount end) total
         from public.payments x where x.user_id = m.id group by x.currency) q),
      (select count(*)::int from public.payments x where x.user_id = m.id and x.kind = 'payment'),
      (select max(x.created_at) from public.payments x where x.user_id = m.id and x.kind = 'payment'),
      public.sub_renewing(m.id)
    from m
    where (coalesce(p_kind, 'paid') = 'paid') = m.is_paid
    order by m.pro_until desc
    limit 1000;
end $$;

grant execute on function public.admin_revenue(), public.admin_pro_members(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bildirimden e-posta (pitwall-jobs): yeni türler eklendi
-- ---------------------------------------------------------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- c22: Reklamlar (kendi kendine reklam verme). Reklam veren sitede (reklam.html) yer, fiyat modeli
--      (gösterim paketi ya da gün) ve görsel seçer, Lemon Squeezy ile öder; ödeme gelince reklam
--      kendiliğinden yayına girer (ya da yönetici onayına düşer). PRO üyelere ve oyun içi overlay'lere
--      reklam gösterilmez. Kullanıcılar reklamı sağ tıkla raporlar; rapor sınırı aşılınca reklam gizlenir.
-- ---------------------------------------------------------------------------

-- Ayarlar (yönetim panelinden)
alter table public.app_config add column if not exists ads_enabled boolean not null default false;
alter table public.app_config add column if not exists ad_auto_approve boolean not null default true;
alter table public.app_config add column if not exists ad_report_hide_threshold int not null default 3;
alter table public.app_config add column if not exists ad_pricing jsonb not null default
  '{"currency":"USD","impressions":[1000,5000,10000,50000],"days":[1,3,7,14,30],
    "placements":{"panel_banner":{"on":true,"cpm":4,"day":3},"panel_card":{"on":true,"cpm":3,"day":2},
                  "site_home":{"on":true,"cpm":5,"day":4},"site_account":{"on":true,"cpm":3,"day":2}}}'::jsonb;

-- Reklam kampanyaları
--   status: unpaid (ödeme bekliyor) | pending_review (ödendi, onay bekliyor) | active (yayında)
--           | paused (yönetici durdurdu) | paused_reports (raporlarla gizlendi) | ended (bitti)
--           | rejected (reddedildi) | refunded (iade edildi)
--   model:  impressions (quantity = satın alınan gösterim) | days (quantity = gün)
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  placement text not null check (placement in ('panel_banner', 'panel_card', 'site_home', 'site_account')),
  model text not null check (model in ('impressions', 'days')),
  quantity int not null check (quantity > 0),
  title text not null check (char_length(title) between 1 and 60),
  body text not null default '' check (char_length(body) <= 120),
  url text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  image text not null check (char_length(image) between 3 and 300),
  langs text[] not null default '{}',
  status text not null default 'unpaid'
    check (status in ('unpaid', 'pending_review', 'active', 'paused', 'paused_reports', 'ended', 'rejected', 'refunded')),
  price numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  paid_amount numeric(12, 2),
  paid_at timestamptz,
  order_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  impressions int not null default 0,
  clicks int not null default 0,
  reports int not null default 0,
  report_base int not null default 0,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_campaigns_live on public.ad_campaigns (placement) where status = 'active';
create index if not exists ad_campaigns_user on public.ad_campaigns (user_id, created_at desc);
create index if not exists ad_campaigns_status on public.ad_campaigns (status, created_at desc);
alter table public.ad_campaigns enable row level security;
drop policy if exists "ads own read" on public.ad_campaigns;
create policy "ads own read" on public.ad_campaigns for select using (auth.uid() = user_id or public.is_admin());

-- Raporlar (her üye bir reklamı bir kez raporlar; raporlayan o reklamı bir daha görmez)
create table if not exists public.ad_reports (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ad_campaigns (id) on delete cascade,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('inappropriate', 'misleading', 'spam', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (ad_id, reporter)
);
create index if not exists ad_reports_reporter on public.ad_reports (reporter);
alter table public.ad_reports enable row level security;
drop policy if exists "ad reports read" on public.ad_reports;
create policy "ad reports read" on public.ad_reports for select using (auth.uid() = reporter or public.is_admin());

-- Gösterim / tıklama sınırı: aynı izleyici aynı reklamı 30 dakikada bir kez sayar (kısa ömürlü, kişisel veri yok)
create table if not exists public.ad_views (
  ad_id uuid not null references public.ad_campaigns (id) on delete cascade,
  viewer text not null,
  kind text not null default 'view',
  at timestamptz not null default now(),
  primary key (ad_id, viewer, kind)
);
create index if not exists ad_views_at on public.ad_views (at);
alter table public.ad_views enable row level security;

-- Görseller: herkese açık "ads" kovası, <kullanıcı id>/<dosya>. Üye sadece kendi klasörüne yükler.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ads', 'ads', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "ads own upload" on storage.objects;
create policy "ads own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "ads read" on storage.objects;
create policy "ads read" on storage.objects for select using (bucket_id = 'ads');
drop policy if exists "ads delete" on storage.objects;
create policy "ads delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Fiyat: yönetim panelindeki ad_pricing'den hesaplanır (istemciye güvenilmez)
create or replace function public.ad_price(p_placement text, p_model text, p_qty int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pr jsonb := coalesce((select ad_pricing from public.app_config where id = 1), '{}'::jsonb);
  pl jsonb := pr -> 'placements' -> p_placement;
  amount numeric;
begin
  if pl is null or coalesce((pl ->> 'on')::boolean, true) = false then
    raise exception 'Bu reklam yeri şu an satışta değil';
  end if;
  if p_model = 'impressions' then
    if not coalesce(pr -> 'impressions', '[1000,5000,10000,50000]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz gösterim paketi';
    end if;
    amount := coalesce((pl ->> 'cpm')::numeric, 0) * p_qty / 1000.0;
  elsif p_model = 'days' then
    if not coalesce(pr -> 'days', '[1,3,7,14,30]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz süre';
    end if;
    amount := coalesce((pl ->> 'day')::numeric, 0) * p_qty;
  else
    raise exception 'Geçersiz fiyat modeli';
  end if;
  amount := round(amount, 2);
  if amount <= 0 then
    raise exception 'Bu seçenek için fiyat belirlenmemiş';
  end if;
  return jsonb_build_object('price', amount, 'currency', upper(coalesce(nullif(pr ->> 'currency', ''), 'USD')));
end $$;

-- Reklam verene bildirim (uygulama içi + e-posta: ad_live, ad_rejected, ad_ended)
create or replace function public.ad_notify(p_ad uuid, p_kind text, p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, data)
    select a.user_id, p_kind,
      jsonb_build_object('ad', a.id, 'title', a.title, 'placement', a.placement, 'model', a.model, 'quantity', a.quantity,
                         'impressions', a.impressions, 'clicks', a.clicks, 'ends_at', a.ends_at) || coalesce(p_extra, '{}')
    from public.ad_campaigns a where a.id = p_ad;
end $$;

-- Yöneticilere bildirim (aynı reklam için okunmamış aynı tür bildirim varsa yenisi eklenmez)
create or replace function public.ad_notify_admins(p_ad uuid, p_kind text, p_extra jsonb default '{}', p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, data)
    select p.id, p_kind,
      jsonb_build_object('ad', a.id, 'title', a.title, 'placement', a.placement, 'reports', a.reports,
                         'name', coalesce((select display_name from public.profiles where id = a.user_id), '?')) || coalesce(p_extra, '{}')
    from public.ad_campaigns a cross join public.profiles p
    where a.id = p_ad and p.is_admin
      and (p_force or not exists (select 1 from public.notifications n where n.user_id = p.id and not n.read
                                  and n.kind = p_kind and n.data ->> 'ad' = a.id::text));
end $$;

-- Yayına al (süreli reklamlarda süre şimdi başlar)
create or replace function public.ad_start(p_ad uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ad_campaigns
    set status = 'active', starts_at = coalesce(starts_at, now()), paused_at = null, ended_at = null,
        ends_at = case when model = 'days' then now() + make_interval(days => quantity) else null end,
        updated_at = now()
    where id = p_ad;
  perform public.ad_notify(p_ad, 'ad_live');
end $$;

-- Bitir (gösterimler doldu ya da süre bitti)
create or replace function public.ad_finish(p_ad uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ad_campaigns set status = 'ended', ended_at = now(), updated_at = now()
    where id = p_ad and status = 'active';
  if found then
    perform public.ad_notify(p_ad, 'ad_ended');
  end if;
end $$;

-- Reklam veren: yeni reklam oluştur ya da ödenmemiş reklamını düzenle (fiyat sunucuda hesaplanır)
create or replace function public.ad_save(
  p_id uuid, p_placement text, p_model text, p_quantity int, p_title text, p_body text, p_url text, p_image text,
  p_langs text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q jsonb;
  rid uuid;
  lg text[] := coalesce(p_langs, '{}');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    raise exception 'Reklam alımı şu an kapalı';
  end if;
  p_title := btrim(coalesce(p_title, ''));
  p_body := btrim(coalesce(p_body, ''));
  p_url := btrim(coalesce(p_url, ''));
  if char_length(p_title) not between 1 and 60 then
    raise exception 'Başlık 1-60 karakter olmalı';
  end if;
  if char_length(p_body) > 120 then
    raise exception 'Kısa metin en fazla 120 karakter olabilir';
  end if;
  if p_url !~ '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/[^\s]*)?$' or char_length(p_url) > 500 then
    raise exception 'Bağlantı https:// ile başlayan geçerli bir adres olmalı';
  end if;
  if split_part(coalesce(p_image, ''), '/', 1) <> me::text or p_image like '%..%' or char_length(p_image) > 300 then
    raise exception 'Geçersiz görsel';
  end if;
  if not lg <@ array['tr', 'other']::text[] then
    raise exception 'Geçersiz dil seçimi';
  end if;
  if cardinality(lg) = 2 then
    lg := '{}';
  end if;
  q := public.ad_price(p_placement, p_model, p_quantity);
  if p_id is null then
    if (select count(*) from public.ad_campaigns where user_id = me and status = 'unpaid') >= 10 then
      raise exception 'Ödenmemiş en fazla 10 reklamın olabilir; önce birini sil ya da öde';
    end if;
    insert into public.ad_campaigns (user_id, placement, model, quantity, title, body, url, image, langs, price, currency)
      values (me, p_placement, p_model, p_quantity, p_title, p_body, p_url, p_image, lg,
              (q ->> 'price')::numeric, q ->> 'currency')
      returning id into rid;
  else
    update public.ad_campaigns
      set placement = p_placement, model = p_model, quantity = p_quantity, title = p_title, body = p_body, url = p_url,
          image = p_image, langs = lg, price = (q ->> 'price')::numeric, currency = q ->> 'currency', updated_at = now()
      where id = p_id and user_id = me and status = 'unpaid'
      returning id into rid;
    if rid is null then
      raise exception 'Bu reklam artık düzenlenemez';
    end if;
  end if;
  return rid;
end $$;

-- Reklam veren: ödenmemiş reklamı sil (görsel yolunu döndürür, istemci dosyayı da siler)
create or replace function public.ad_delete(p_ad uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  img text;
begin
  delete from public.ad_campaigns where id = p_ad and user_id = auth.uid() and status = 'unpaid' returning image into img;
  if img is null then
    raise exception 'Sadece ödenmemiş reklamlar silinebilir';
  end if;
  return img;
end $$;

-- Gösterilecek reklam: yerdeki yayındaki reklamlardan ağırlıklı rastgele biri.
-- PRO üyeye, reklamlar kapalıyken ve izleyicinin raporladığı reklamlarda boş döner.
-- p_lang: izleyicinin dili ('tr' dışındaki her dil 'other' hedefine düşer)
create or replace function public.ad_pick(p_placement text, p_lang text default '', p_visitor text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp text := case when lower(coalesce(p_lang, '')) like 'tr%' then 'tr' else 'other' end;
  r jsonb;
begin
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    return null;
  end if;
  if me is not null and public.is_pro() then
    return null;
  end if;
  select jsonb_build_object('id', a.id, 'placement', a.placement, 'title', a.title, 'body', a.body, 'url', a.url, 'image', a.image)
    into r
    from public.ad_campaigns a
    where a.status = 'active' and a.placement = p_placement
      and (cardinality(a.langs) = 0 or grp = any (a.langs))
      and (a.model <> 'days' or a.ends_at > now())
      and (a.model <> 'impressions' or a.impressions < a.quantity)
      and (me is null or not exists (select 1 from public.ad_reports x where x.ad_id = a.id and x.reporter = me))
    order by -ln(greatest(random(), 1e-9)) /
      (case when a.model = 'impressions' then least(5, greatest(1, (a.quantity - a.impressions) / 2000.0)) else 2 end)
    limit 1;
  return r;
end $$;

-- 30 dakikada bir sayma: izleyici = hesap ya da tarayıcı/uygulama kimliği. Sayıldıysa true.
create or replace function public.ad_seen(p_ad uuid, p_visitor text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(auth.uid()::text, nullif('v:' || left(regexp_replace(coalesce(p_visitor, ''), '[^a-zA-Z0-9-]', '', 'g'), 64), 'v:'));
  n int;
begin
  if who is null then
    return false;
  end if;
  insert into public.ad_views (ad_id, viewer, kind, at) values (p_ad, who, p_kind, now())
    on conflict (ad_id, viewer, kind) do update set at = now() where public.ad_views.at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.ad_seen(uuid, text, text) from public, anon, authenticated;

-- Gösterim: reklam ekranda göründüğünde (gösterim paketi dolunca reklam biter)
create or replace function public.ad_impression(p_ad uuid, p_visitor text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  if auth.uid() is not null and public.is_pro() then
    return;
  end if;
  if not exists (select 1 from public.ad_campaigns where id = p_ad and status = 'active') then
    return;
  end if;
  if not public.ad_seen(p_ad, p_visitor, 'view') then
    return;
  end if;
  update public.ad_campaigns set impressions = impressions + 1 where id = p_ad and status = 'active' returning * into a;
  if a.id is not null and a.model = 'impressions' and a.impressions >= a.quantity then
    perform public.ad_finish(a.id);
  end if;
end $$;

-- Tıklama: hedef adresi döndürür (30 dakikada bir sayılır)
create or replace function public.ad_click(p_ad uuid, p_visitor text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  u text;
begin
  select url into u from public.ad_campaigns where id = p_ad and status = 'active';
  if u is null then
    return null;
  end if;
  if public.ad_seen(p_ad, p_visitor, 'click') then
    update public.ad_campaigns set clicks = clicks + 1 where id = p_ad;
  end if;
  return u;
end $$;

-- Rapor: sınır aşılınca reklam gizlenir (paused_reports), yöneticilere bildirim + e-posta
create or replace function public.ad_report(p_ad uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  thr int := greatest(1, coalesce((select ad_report_hide_threshold from public.app_config where id = 1), 3));
  a public.ad_campaigns;
  n int;
  hidden boolean := false;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('inappropriate', 'misleading', 'spam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  if (select count(*) from public.ad_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  if not exists (select 1 from public.ad_campaigns where id = p_ad) then
    raise exception 'Reklam bulunamadı';
  end if;
  insert into public.ad_reports (ad_id, reporter, reason, note)
    values (p_ad, me, p_reason, left(coalesce(p_note, ''), 500))
    on conflict (ad_id, reporter) do nothing;
  if not found then
    raise exception 'Bu reklamı zaten raporladın';
  end if;
  select count(*) into n from public.ad_reports where ad_id = p_ad;
  update public.ad_campaigns set reports = n, updated_at = now() where id = p_ad returning * into a;
  if a.status = 'active' and n - a.report_base >= thr then
    update public.ad_campaigns set status = 'paused_reports', paused_at = now() where id = p_ad;
    hidden := true;
    perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'reports'));
  end if;
  perform public.ad_notify_admins(p_ad, 'ad_reported', jsonb_build_object('hidden', hidden, 'reason', p_reason, 'reports', n), hidden);
  return jsonb_build_object('reports', n, 'hidden', hidden);
end $$;

-- Ödeme geldi (sadece pro-webhook çağırır): otomatik onay açıksa yayına al, değilse onaya düşür
create or replace function public.ad_paid(p_ad uuid, p_user uuid, p_order text, p_amount numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
  auto boolean := coalesce((select ad_auto_approve from public.app_config where id = 1), true);
begin
  select * into a from public.ad_campaigns where id = p_ad for update;
  if a.id is null then
    raise exception 'reklam yok: %', p_ad;
  end if;
  if p_user is not null and p_user <> a.user_id then
    raise exception 'reklam başka hesaba ait';
  end if;
  if a.status <> 'unpaid' then
    return jsonb_build_object('status', a.status, 'already', true, 'placement', a.placement, 'user_id', a.user_id);
  end if;
  update public.ad_campaigns
    set paid_at = now(), order_id = p_order, paid_amount = p_amount, currency = upper(coalesce(nullif(p_currency, ''), currency)),
        status = 'pending_review', updated_at = now()
    where id = p_ad;
  if auto then
    perform public.ad_start(p_ad);
  else
    perform public.ad_notify_admins(p_ad, 'ad_pending');
  end if;
  return jsonb_build_object('status', case when auto then 'active' else 'pending_review' end,
                            'placement', a.placement, 'user_id', a.user_id, 'title', a.title);
end $$;

-- İade (sadece pro-webhook çağırır): reklam durur
create or replace function public.ad_refunded(p_ad uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  update public.ad_campaigns set status = 'refunded', ended_at = coalesce(ended_at, now()), updated_at = now()
    where id = p_ad returning * into a;
  return jsonb_build_object('placement', a.placement, 'user_id', a.user_id);
end $$;

-- Süresi dolanları bitir, sayaç tablosunu temizle (10 dakikada bir)
create or replace function public.ad_housekeeping() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.ad_campaigns
           where status = 'active' and ((model = 'days' and ends_at <= now()) or (model = 'impressions' and impressions >= quantity)) loop
    perform public.ad_finish(r.id);
    n := n + 1;
  end loop;
  delete from public.ad_views where at < now() - interval '1 hour';
  return n;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-ads';
select cron.schedule('pitwall-ads', '*/10 * * * *', $$ select public.ad_housekeeping() $$);

-- Yönetici: reklam listesi (p_status: null/'' hepsi ya da bir durum)
create or replace function public.admin_ads(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select a.*, p.display_name as owner_name, u.email::text as owner_email
      from public.ad_campaigns a
      left join public.profiles p on p.id = a.user_id
      left join auth.users u on u.id = a.user_id
      where coalesce(p_status, '') = '' or a.status = p_status
      order by a.created_at desc
      limit 500
    ) x), '[]'::jsonb);
end $$;

-- Yönetici: bir reklamın raporları
create or replace function public.admin_ad_reports(p_ad uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
                                        'reporter', r.reporter, 'reporter_name', p.display_name) order by r.created_at desc)
    from public.ad_reports r left join public.profiles p on p.id = r.reporter
    where r.ad_id = p_ad), '[]'::jsonb);
end $$;

-- Yönetici işlemleri: approve | reject | pause | resume | extend | end | delete
--   extend: süreli reklama p_amount gün, gösterimli reklama p_amount gösterim ekler
create or replace function public.admin_ad_set(p_ad uuid, p_action text, p_note text default '', p_amount int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into a from public.ad_campaigns where id = p_ad for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  p_note := left(coalesce(p_note, ''), 500);
  if p_action = 'approve' then
    if a.status not in ('pending_review', 'rejected') or a.paid_at is null then
      raise exception 'Sadece ödenmiş ve onay bekleyen reklam onaylanabilir';
    end if;
    update public.ad_campaigns set review_note = p_note where id = p_ad;
    perform public.ad_start(p_ad);
  elsif p_action = 'reject' then
    if a.status in ('ended', 'refunded', 'rejected') then
      raise exception 'Bu reklam reddedilemez';
    end if;
    update public.ad_campaigns set status = 'rejected', review_note = p_note, ended_at = now(), updated_at = now() where id = p_ad;
    if a.status <> 'unpaid' then
      perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'rejected', 'note', p_note));
    end if;
  elsif p_action = 'pause' then
    if a.status <> 'active' then
      raise exception 'Sadece yayındaki reklam durdurulabilir';
    end if;
    update public.ad_campaigns set status = 'paused', paused_at = now(), review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'paused', 'note', p_note));
  elsif p_action = 'resume' then
    if a.status not in ('paused', 'paused_reports') then
      raise exception 'Sadece durdurulmuş reklam sürdürülebilir';
    end if;
    -- Süreli reklamda durdurulan süre bitişe eklenir; rapor sayacı sıfırdan sayılır
    update public.ad_campaigns
      set status = 'active', report_base = reports, updated_at = now(),
          ends_at = case when model = 'days' and paused_at is not null then ends_at + (now() - paused_at) else ends_at end,
          paused_at = null
      where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_live', jsonb_build_object('resumed', true));
  elsif p_action = 'extend' then
    if coalesce(p_amount, 0) <= 0 or a.status in ('unpaid', 'refunded', 'rejected') then
      raise exception 'Uzatma yapılamaz';
    end if;
    update public.ad_campaigns
      set quantity = quantity + p_amount, updated_at = now(),
          ends_at = case when model = 'days' then greatest(coalesce(ends_at, now()), now()) + make_interval(days => p_amount) else ends_at end
      where id = p_ad;
    if a.status = 'ended' then
      update public.ad_campaigns set status = 'active', ended_at = null where id = p_ad;
      perform public.ad_notify(p_ad, 'ad_live', jsonb_build_object('resumed', true));
    end if;
  elsif p_action = 'end' then
    if a.status not in ('active', 'paused', 'paused_reports', 'pending_review') then
      raise exception 'Bu reklam bitirilemez';
    end if;
    update public.ad_campaigns set status = 'ended', ended_at = now(), review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_ended', jsonb_build_object('note', p_note));
  elsif p_action = 'delete' then
    if a.status not in ('unpaid', 'rejected', 'ended', 'refunded') then
      raise exception 'Yayındaki ya da ödenmiş bekleyen reklam silinemez; önce bitir';
    end if;
    delete from public.ad_campaigns where id = p_ad;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('ad_' || p_action, 'ad', p_ad::text, a.user_id, jsonb_build_object('title', a.title, 'note', p_note, 'amount', p_amount));
end $$;

revoke all on function public.ad_notify(uuid, text, jsonb), public.ad_notify_admins(uuid, text, jsonb, boolean),
  public.ad_start(uuid), public.ad_finish(uuid), public.ad_paid(uuid, uuid, text, numeric, text), public.ad_refunded(uuid),
  public.ad_housekeeping() from public, anon, authenticated;
grant execute on function public.ad_price(text, text, int), public.ad_pick(text, text, text),
  public.ad_impression(uuid, text), public.ad_click(uuid, text) to anon, authenticated;
grant execute on function public.ad_save(uuid, text, text, int, text, text, text, text, text[]), public.ad_delete(uuid),
  public.ad_report(uuid, text, text), public.admin_ads(text), public.admin_ad_reports(uuid),
  public.admin_ad_set(uuid, text, text, int) to authenticated;
grant execute on function public.ad_paid(uuid, uuid, text, numeric, text), public.ad_refunded(uuid) to service_role;
grant select on public.ad_campaigns, public.ad_reports to authenticated;
grant all on public.ad_campaigns, public.ad_reports, public.ad_views to service_role;

-- ---------------------------------------------------------------------------
-- Bildirimden e-posta (pitwall-jobs): reklam türleri eklendi
-- ---------------------------------------------------------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

-- Kendini yönetici yapmak (bir kere, kendi e-postanla çalıştır):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'SENIN@EPOSTAN.com');
-- ---------------------------------------------------------------------------

-- Tablo yetkileri açıkça verilir: Supabase'de "Automatically expose new tables" kapalı olsa da
-- uygulama çalışır. Erişimi yine her tablodaki RLS kuralları sınırlar.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant select on public.app_config to anon, authenticated;
grant insert, update on public.app_config to authenticated;
grant select on public.shared_layouts, public.layout_ratings, public.layout_comments to anon, authenticated;
grant insert, update, delete on public.shared_layouts, public.layout_ratings, public.layout_comments to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.grant_pro_by_email(text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- c23: Bölgesel reklam fiyatı. Türkiye'den reklam verenler, o yer için Türkiye fiyatı (cpm_tr / day_tr)
--      girildiyse TL (ad_pricing.currency_tr) öder; diğerleri genel fiyatı (ad_pricing.currency, ör. USD).
--      Reklamın bölgesi ad_campaigns.region'da saklanır; ads-checkout ödemeyi o para biriminin mağazasında açar.
-- ---------------------------------------------------------------------------
alter table public.ad_campaigns add column if not exists region text not null default 'intl';
alter table public.ad_campaigns drop constraint if exists ad_campaigns_region_check;
alter table public.ad_campaigns add constraint ad_campaigns_region_check check (region in ('tr', 'intl'));
update public.app_config set ad_pricing = ad_pricing || '{"currency_tr":"TRY"}'::jsonb
  where id = 1 and not (ad_pricing ? 'currency_tr');

drop function if exists public.ad_price(text, text, int);
drop function if exists public.ad_save(uuid, text, text, int, text, text, text, text, text[]);

create or replace function public.ad_price(p_placement text, p_model text, p_qty int, p_region text default 'intl') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pr jsonb := coalesce((select ad_pricing from public.app_config where id = 1), '{}'::jsonb);
  pl jsonb := pr -> 'placements' -> p_placement;
  amount numeric;
  tr boolean;
  cur text;
begin
  if pl is null or coalesce((pl ->> 'on')::boolean, true) = false then
    raise exception 'Bu reklam yeri şu an satışta değil';
  end if;
  -- Türkiye: o yer için TL fiyatı (cpm_tr / day_tr) girildiyse onlar ve currency_tr; değilse genel fiyat
  tr := coalesce(p_region, '') = 'tr'
        and (coalesce((pl ->> 'cpm_tr')::numeric, 0) > 0 or coalesce((pl ->> 'day_tr')::numeric, 0) > 0);
  cur := case when tr then upper(coalesce(nullif(pr ->> 'currency_tr', ''), 'TRY'))
              else upper(coalesce(nullif(pr ->> 'currency', ''), 'USD')) end;
  if p_model = 'impressions' then
    if not coalesce(pr -> 'impressions', '[1000,5000,10000,50000]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz gösterim paketi';
    end if;
    amount := coalesce((pl ->> case when tr then 'cpm_tr' else 'cpm' end)::numeric, 0) * p_qty / 1000.0;
  elsif p_model = 'days' then
    if not coalesce(pr -> 'days', '[1,3,7,14,30]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz süre';
    end if;
    amount := coalesce((pl ->> case when tr then 'day_tr' else 'day' end)::numeric, 0) * p_qty;
  else
    raise exception 'Geçersiz fiyat modeli';
  end if;
  amount := round(amount, 2);
  if amount <= 0 then
    raise exception 'Bu seçenek için fiyat belirlenmemiş';
  end if;
  return jsonb_build_object('price', amount, 'currency', cur, 'region', case when tr then 'tr' else 'intl' end);
end $$;

create or replace function public.ad_save(
  p_id uuid, p_placement text, p_model text, p_quantity int, p_title text, p_body text, p_url text, p_image text,
  p_langs text[] default '{}', p_region text default 'intl')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q jsonb;
  rid uuid;
  lg text[] := coalesce(p_langs, '{}');
  rg text := case when p_region = 'tr' then 'tr' else 'intl' end;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    raise exception 'Reklam alımı şu an kapalı';
  end if;
  p_title := btrim(coalesce(p_title, ''));
  p_body := btrim(coalesce(p_body, ''));
  p_url := btrim(coalesce(p_url, ''));
  if char_length(p_title) not between 1 and 60 then
    raise exception 'Başlık 1-60 karakter olmalı';
  end if;
  if char_length(p_body) > 120 then
    raise exception 'Kısa metin en fazla 120 karakter olabilir';
  end if;
  if p_url !~ '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/[^\s]*)?$' or char_length(p_url) > 500 then
    raise exception 'Bağlantı https:// ile başlayan geçerli bir adres olmalı';
  end if;
  if split_part(coalesce(p_image, ''), '/', 1) <> me::text or p_image like '%..%' or char_length(p_image) > 300 then
    raise exception 'Geçersiz görsel';
  end if;
  if not lg <@ array['tr', 'other']::text[] then
    raise exception 'Geçersiz dil seçimi';
  end if;
  if cardinality(lg) = 2 then
    lg := '{}';
  end if;
  q := public.ad_price(p_placement, p_model, p_quantity, rg);
  if p_id is null then
    if (select count(*) from public.ad_campaigns where user_id = me and status = 'unpaid') >= 10 then
      raise exception 'Ödenmemiş en fazla 10 reklamın olabilir; önce birini sil ya da öde';
    end if;
    insert into public.ad_campaigns (user_id, placement, model, quantity, title, body, url, image, langs, price, currency, region)
      values (me, p_placement, p_model, p_quantity, p_title, p_body, p_url, p_image, lg,
              (q ->> 'price')::numeric, q ->> 'currency', rg)
      returning id into rid;
  else
    update public.ad_campaigns
      set placement = p_placement, model = p_model, quantity = p_quantity, title = p_title, body = p_body, url = p_url,
          image = p_image, langs = lg, price = (q ->> 'price')::numeric, currency = q ->> 'currency', region = rg, updated_at = now()
      where id = p_id and user_id = me and status = 'unpaid'
      returning id into rid;
    if rid is null then
      raise exception 'Bu reklam artık düzenlenemez';
    end if;
  end if;
  return rid;
end $$;

grant execute on function public.ad_price(text, text, int, text) to anon, authenticated, service_role;
grant execute on function public.ad_save(uuid, text, text, int, text, text, text, text, text[], text) to authenticated;
-- ---------------------------------------------------------------------------
-- c24: Otomatik PRO fiyatı. Yönetim panelinde her plan (1m, 3m, 6m, 12m) için sayısal fiyat girilir:
--      genel fiyat (pro_pricing.currency, ör. USD) ve Türkiye fiyatı (pro_pricing.currency_tr, ör. TRY).
--      pro-checkout fonksiyonu Lemon Squeezy'de tek abonelik ürününün o plana ait varyantıyla, bu tutarı
--      custom_price olarak göndererek ödeme sayfası açar (yenilemeler de aynı tutarla olur).
--      Biçim: {"currency":"USD","currency_tr":"TRY","plans":{"1m":{"price":4.99,"price_tr":149}, ...}}
--      Eski fiyat metni / ödeme bağlantısı alanları, otomatik fiyat girilmemiş planlar için kullanılmaya devam eder.
-- ---------------------------------------------------------------------------
alter table public.app_config add column if not exists pro_pricing jsonb not null default '{"currency":"USD","currency_tr":"TRY","plans":{}}'::jsonb;

-- ---------------------------------------------------------------------------
-- c25: Ödeme bildirimleri ve reklam verenin kendi reklamını durdurması.
--      1) payments tablosuna her yeni kayıt (PRO aboneliği, yenileme, reklam, Patreon, Ko-fi, iade):
--         - yöneticilere 'payment_new' bildirimi + e-posta (pitwall-jobs → paymentAdmin)
--         - ödeme bir hesaba bağlıysa ödeyene 'payment_receipt' bildirimi + kendi dilinde teşekkür/makbuz
--           e-postası (pitwall-jobs → paymentReceipt). PRO ödemelerinde o anki pro_until, reklam
--           ödemelerinde (plan 'Reklam:' ile başlar) 'ad': true eklenir.
--         Tutarı 0 olan kayıtlar bildirim üretmez. Aynı ödeme tekrar gelirse (on conflict update) yeni bildirim olmaz.
--      2) Reklam veren, gösterim bazlı reklamını kendisi durdurup sürdürebilir (yeni durum: paused_owner).
--         Süreli (gün bazlı) reklamlar durdurulamaz, süre işlemeye devam eder.
--         paused_owner reklam gösterilmez ve gösterim harcamaz (ad_pick / ad_impression / ad_housekeeping
--         sadece 'active' reklamlara bakar). Yönetici paused_owner reklamı durdurabilir, sürdürebilir, bitirebilir.
-- ---------------------------------------------------------------------------

-- 1) Ödeme bildirimleri -------------------------------------------------------
create or replace function public.payment_notify_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_ad boolean := coalesce(new.plan, '') like 'Reklam:%';
  d jsonb;
begin
  if coalesce(new.amount, 0) = 0 then
    return null;
  end if;
  d := jsonb_build_object('payment', new.id, 'source', new.source, 'amount', new.amount, 'currency', new.currency,
                          'plan', new.plan, 'kind', new.kind, 'email', new.email, 'ad', is_ad,
                          'name', coalesce((select display_name from public.profiles where id = new.user_id), ''));
  insert into public.notifications (user_id, kind, data)
    select p.id, 'payment_new', d from public.profiles p where p.is_admin;
  if new.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (new.user_id, 'payment_receipt',
              d || case when is_ad then '{}'::jsonb
                        else jsonb_build_object('pro_until', (select pro_until from public.profiles where id = new.user_id)) end);
  end if;
  return null;
end $$;
drop trigger if exists payment_notify_trg on public.payments;
create trigger payment_notify_trg after insert on public.payments
  for each row execute function public.payment_notify_trg();

create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

-- 2) Reklam verenin durdurması (paused_owner) ---------------------------------
alter table public.ad_campaigns drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns add constraint ad_campaigns_status_check
  check (status in ('unpaid', 'pending_review', 'active', 'paused', 'paused_reports', 'paused_owner', 'ended', 'rejected', 'refunded'));

-- Reklam veren: gösterim bazlı reklamı durdur (p_pause = true) / sürdür (false). Yeni durumu döndürür.
create or replace function public.ad_owner_pause(p_ad uuid, p_pause boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a public.ad_campaigns;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into a from public.ad_campaigns where id = p_ad and user_id = me for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  if a.model <> 'impressions' then
    raise exception 'Süreli reklamlar durdurulamaz';
  end if;
  if coalesce(p_pause, true) then
    if a.status = 'paused_owner' then
      return a.status;
    end if;
    if a.status <> 'active' then
      raise exception 'Sadece yayındaki reklam durdurulabilir';
    end if;
    update public.ad_campaigns set status = 'paused_owner', paused_at = now(), updated_at = now() where id = p_ad;
    return 'paused_owner';
  end if;
  if a.status = 'active' then
    return a.status;
  end if;
  if a.status <> 'paused_owner' then
    raise exception 'Bu reklamı sadece yönetici yeniden yayına alabilir';
  end if;
  update public.ad_campaigns set status = 'active', paused_at = null, updated_at = now() where id = p_ad;
  -- Gösterimleri zaten dolmuşsa hemen bitir
  if a.impressions >= a.quantity then
    perform public.ad_finish(p_ad);
    return 'ended';
  end if;
  return 'active';
end $$;
revoke all on function public.ad_owner_pause(uuid, boolean) from public, anon;
grant execute on function public.ad_owner_pause(uuid, boolean) to authenticated;

-- Yönetici işlemleri: approve | reject | pause | resume | extend | end | delete
--   extend: süreli reklama p_amount gün, gösterimli reklama p_amount gösterim ekler
--   paused_owner (reklam verenin durdurduğu): yönetici durdurabilir (paused), sürdürebilir, bitirebilir, reddedebilir
create or replace function public.admin_ad_set(p_ad uuid, p_action text, p_note text default '', p_amount int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into a from public.ad_campaigns where id = p_ad for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  p_note := left(coalesce(p_note, ''), 500);
  if p_action = 'approve' then
    if a.status not in ('pending_review', 'rejected') or a.paid_at is null then
      raise exception 'Sadece ödenmiş ve onay bekleyen reklam onaylanabilir';
    end if;
    update public.ad_campaigns set review_note = p_note where id = p_ad;
    perform public.ad_start(p_ad);
  elsif p_action = 'reject' then
    if a.status in ('ended', 'refunded', 'rejected') then
      raise exception 'Bu reklam reddedilemez';
    end if;
    update public.ad_campaigns set status = 'rejected', review_note = p_note, ended_at = now(), updated_at = now() where id = p_ad;
    if a.status <> 'unpaid' then
      perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'rejected', 'note', p_note));
    end if;
  elsif p_action = 'pause' then
    if a.status not in ('active', 'paused_owner') then
      raise exception 'Sadece yayındaki ya da reklam verenin durdurduğu reklam durdurulabilir';
    end if;
    update public.ad_campaigns set status = 'paused', paused_at = coalesce(case when a.status = 'paused_owner' then paused_at end, now()),
                                   review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'paused', 'note', p_note));
  elsif p_action = 'resume' then
    if a.status not in ('paused', 'paused_reports', 'paused_owner') then
      raise exception 'Sadece durdurulmuş reklam sürdürülebilir';
    end if;
    -- Süreli reklamda durdurulan süre bitişe eklenir; rapor sayacı sıfırdan sayılır
    update public.ad_campaigns
      set status = 'active', report_base = reports, updated_at = now(),
          ends_at = case when model = 'days' and paused_at is not null then ends_at + (now() - paused_at) else ends_at end,
          paused_at = null
      where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_live', jsonb_build_object('resumed', true));
  elsif p_action = 'extend' then
    if coalesce(p_amount, 0) <= 0 or a.status in ('unpaid', 'refunded', 'rejected') then
      raise exception 'Uzatma yapılamaz';
    end if;
    update public.ad_campaigns
      set quantity = quantity + p_amount, updated_at = now(),
          ends_at = case when model = 'days' then greatest(coalesce(ends_at, now()), now()) + make_interval(days => p_amount) else ends_at end
      where id = p_ad;
    if a.status = 'ended' then
      update public.ad_campaigns set status = 'active', ended_at = null where id = p_ad;
      perform public.ad_notify(p_ad, 'ad_live', jsonb_build_object('resumed', true));
    end if;
  elsif p_action = 'end' then
    if a.status not in ('active', 'paused', 'paused_reports', 'paused_owner', 'pending_review') then
      raise exception 'Bu reklam bitirilemez';
    end if;
    update public.ad_campaigns set status = 'ended', ended_at = now(), review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_ended', jsonb_build_object('note', p_note));
  elsif p_action = 'delete' then
    if a.status not in ('unpaid', 'rejected', 'ended', 'refunded') then
      raise exception 'Yayındaki ya da ödenmiş bekleyen reklam silinemez; önce bitir';
    end if;
    delete from public.ad_campaigns where id = p_ad;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('ad_' || p_action, 'ad', p_ad::text, a.user_id, jsonb_build_object('title', a.title, 'note', p_note, 'amount', p_amount));
end $$;
grant execute on function public.admin_ad_set(uuid, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- c26: Hediye PRO aboneliği.
--      Giriş yapmış bir üye, kayıtlı başka bir üyeye PRO aboneliği hediye edebilir (pro-checkout gift_to).
--      Ödeme sayfasında e-posta ALANIN (hediye edenin) kendi e-postasıdır; fatura, makbuz ve yenileme
--      ödemeleri ona aittir. Abonelik custom_data.user_id (alıcı) ile alıcıya işlenir, custom_data.gifter
--      hediye edeni tutar.
--      1) subscriptions: gifted_by (hediye eden), is_gift, gift_offset (alıcının hediye anındaki kalan PRO
--         süresi; hediye bunun üstüne eklenir), gift_notified, grant_until (bu aboneliğin verdiği PRO bitişi).
--         Alıcı hediye aboneliği tablodan okuyamaz (hediye edenin e-postası / portal bağlantısı gizli kalır).
--      2) apply_subscription: yeni isteğe bağlı p_gifter. Hesabın PRO bitişi artık tüm aboneliklerinin
--         grant_until değerlerinin en büyüğüdür: bir aboneliğin iptali/bitişi diğerinin (ör. hediyenin)
--         süresini kısaltmaz. Hediye ilk kez aktif olunca alıcıya 'pro_gift' (+ e-posta), hediye edene
--         'pro_gift_sent' bildirimi gider (ikisine de e-posta).
--      3) payments.gift_to: hediye faturalarında ödeme HEDİYE EDENE yazılır (makbuz ona gider, ciro doğru
--         sayılır), alıcı gift_to'da tutulur. record_payment'a isteğe bağlı p_gift_to eklendi.
--      4) my_pro: 'sub' artık sadece kendi (hediye olmayan) aboneliği; 'gift' / 'gifted_by_name' alıcının
--         aldığı hediye. my_gifts(): hediye ettiğim abonelikler. gift_cancelled(): gift-cancel fonksiyonu
--         Lemon'da iptal ettikten sonra çağırır (alıcıya 'pro_gift_ended' bildirimi + e-posta).
--      Alıcı hediyeyi kendisi sonlandıramaz: tabloda sadece okuma izni var (hediye satırları ona gizli),
--      my_pro hediyenin portal bağlantısını vermez, gift-cancel sadece gifted_by = çağıran ise çalışır.
-- Sıra: önce bu dosya, sonra pro-webhook / pro-checkout / gift-cancel / pitwall-jobs fonksiyonları.
-- ---------------------------------------------------------------------------

-- 1) Abonelik sütunları ----------------------------------------------------------
alter table public.subscriptions add column if not exists gifted_by uuid references public.profiles (id) on delete set null;
alter table public.subscriptions add column if not exists is_gift boolean not null default false;
alter table public.subscriptions add column if not exists gift_offset interval not null default interval '0';
alter table public.subscriptions add column if not exists gift_notified boolean not null default false;
alter table public.subscriptions add column if not exists grant_until timestamptz;
create index if not exists subscriptions_gifted_by on public.subscriptions (gifted_by) where gifted_by is not null;

-- Var olan abonelikler: verdikleri PRO bitişi (webhook'taki hesapla aynı: aktifse yenileme + 3 gün, değilse bitiş)
update public.subscriptions
  set grant_until = case when status in ('active', 'on_trial', 'past_due') then renews_at + interval '3 days' else ends_at end
  where grant_until is null;

-- Alıcı hediye aboneliğinin satırını göremez (hediye edenin e-postası ve müşteri portalı orada)
drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions for select using (auth.uid() = user_id and not is_gift);

-- 2) Webhook: aboneliği kaydet, PRO süresini ayarla ---------------------------------
drop function if exists public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz);
create or replace function public.apply_subscription(
  p_lemon_id text, p_user uuid, p_email text, p_status text, p_plan text, p_variant text,
  p_renews timestamptz, p_ends timestamptz, p_portal text, p_until timestamptz, p_gifter uuid default null
) returns text language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
  gifter uuid := p_gifter;
  prev public.subscriptions;
  gift boolean;
  off interval := interval '0';
  best timestamptz;
  cur timestamptz;
begin
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  if gifter is not null and not exists (select 1 from public.profiles where id = gifter) then
    gifter := null;
  end if;
  select * into prev from public.subscriptions where lemon_id = p_lemon_id for update;
  -- Hediye kalıcıdır: yenileme olaylarında custom_data gelmese de abonelik hediye olarak kalır
  gift := coalesce(prev.is_gift, false) or gifter is not null;
  if prev.lemon_id is not null then
    gifter := coalesce(gifter, prev.gifted_by);
    uid := coalesce(uid, prev.user_id);
  end if;
  if gifter is not null and gifter = uid then
    -- Kendine hediye olmaz: normal abonelik say
    gifter := null;
    gift := coalesce(prev.is_gift, false);
  end if;
  -- Hediyede e-posta hediye edenin: alıcıyı e-postayla eşleme (PRO yanlış hesaba gitmesin)
  if uid is null and not gift and coalesce(p_email, '') <> '' then
    select p.id into uid from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email)
      limit 1;
  end if;
  if prev.lemon_id is not null then
    off := prev.gift_offset;
  elsif gift and uid is not null then
    -- Yeni hediye: alıcının kalan PRO süresinin üstüne eklenir (süresi kısalmaz)
    select greatest(coalesce(pro_until, now()) - now(), interval '0') into off from public.profiles where id = uid;
    off := coalesce(off, interval '0');
    if off > interval '3000 days' then
      off := interval '0'; -- süresiz PRO: eklemeye gerek yok
    end if;
  end if;

  insert into public.subscriptions (lemon_id, user_id, email, status, plan, variant_id, renews_at, ends_at, portal_url,
                                    gifted_by, is_gift, gift_offset, grant_until)
    values (p_lemon_id, uid, coalesce(p_email, ''), p_status, p_plan, p_variant, p_renews, p_ends, coalesce(p_portal, ''),
            gifter, gift, off, p_until + off)
    on conflict (lemon_id) do update set
      user_id = coalesce(excluded.user_id, public.subscriptions.user_id),
      email = excluded.email, status = excluded.status, plan = excluded.plan, variant_id = excluded.variant_id,
      renews_at = excluded.renews_at, ends_at = excluded.ends_at,
      portal_url = case when excluded.portal_url = '' then public.subscriptions.portal_url else excluded.portal_url end,
      gifted_by = coalesce(excluded.gifted_by, public.subscriptions.gifted_by),
      is_gift = public.subscriptions.is_gift or excluded.is_gift,
      grant_until = coalesce(excluded.grant_until, public.subscriptions.grant_until),
      updated_at = now();
  if p_until is null then
    return coalesce(uid::text, 'none');
  end if;
  if uid is null then
    if gift then
      return 'none';
    end if;
    insert into public.pending_pro (email, pro_until, source) values (lower(p_email), p_until, 'lemon')
      on conflict (email) do update set pro_until = greatest(public.pending_pro.pro_until, excluded.pro_until), source = 'lemon';
    return 'pending';
  end if;
  -- Hesabın tüm aboneliklerinden en geç biten; elle/Patreon ile verilmiş daha uzun süre varsa kısaltma
  select max(grant_until) into best from public.subscriptions where user_id = uid;
  best := coalesce(best, p_until + off);
  update public.profiles set
    pro_until = case when pro_source = 'lemon' or pro_until is null or pro_until < best then best else pro_until end,
    pro_source = case when pro_source = 'lemon' or pro_until is null or pro_until < best then 'lemon' else pro_source end
  where id = uid;

  -- Hediye ilk kez aktif oldu: alıcıya ve hediye edene bildirim (bir kez)
  if gift and p_status in ('active', 'on_trial') and not coalesce(prev.gift_notified, false) then
    select pro_until into cur from public.profiles where id = uid;
    insert into public.notifications (user_id, kind, data)
      values (uid, 'pro_gift', jsonb_build_object(
        'gifter', gifter, 'name', coalesce((select display_name from public.profiles where id = gifter), ''),
        'plan', coalesce(p_plan, ''), 'until', cur, 'lemon_id', p_lemon_id));
    if gifter is not null then
      insert into public.notifications (user_id, kind, data)
        values (gifter, 'pro_gift_sent', jsonb_build_object(
          'to', uid, 'name', coalesce((select display_name from public.profiles where id = uid), ''),
          'plan', coalesce(p_plan, ''), 'renews_at', p_renews, 'lemon_id', p_lemon_id));
    end if;
    update public.subscriptions set gift_notified = true where lemon_id = p_lemon_id;
  end if;
  return uid::text;
end $$;
revoke all on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid) to service_role;

-- gift-cancel: hediye eden Lemon'da iptal etti (ödenen dönemin sonuna kadar PRO sürer). Webhook da
-- 'cancelled' olayını ayrıca yollar; burada durum hemen güncellenir ve alıcıya bildirim gider.
create or replace function public.gift_cancelled(p_lemon_id text, p_gifter uuid, p_ends timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.subscriptions;
begin
  select * into s from public.subscriptions where lemon_id = p_lemon_id and is_gift and gifted_by = p_gifter for update;
  if s.lemon_id is null then
    raise exception 'Hediye bulunamadı';
  end if;
  update public.subscriptions
    set status = 'cancelled', ends_at = coalesce(p_ends, ends_at, renews_at), updated_at = now()
    where lemon_id = p_lemon_id;
  if s.status <> 'cancelled' and s.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (s.user_id, 'pro_gift_ended', jsonb_build_object(
        'gifter', p_gifter, 'name', coalesce((select display_name from public.profiles where id = p_gifter), ''),
        'plan', s.plan, 'until', (select pro_until from public.profiles where id = s.user_id), 'lemon_id', p_lemon_id));
  end if;
  return jsonb_build_object('status', 'cancelled', 'ends_at', coalesce(p_ends, s.ends_at, s.renews_at));
end $$;
revoke all on function public.gift_cancelled(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.gift_cancelled(text, uuid, timestamptz) to service_role;

-- 3) Ödemeler: hediye faturası hediye edene, alıcı gift_to ---------------------------
alter table public.payments add column if not exists gift_to uuid references public.profiles (id) on delete set null;

drop function if exists public.record_payment(text, text, text, uuid, numeric, text, text, text);
create or replace function public.record_payment(
  p_id text, p_source text, p_email text, p_user uuid, p_amount numeric, p_currency text, p_plan text, p_kind text,
  p_gift_to uuid default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
  gto uuid := p_gift_to;
begin
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  if gto is not null and not exists (select 1 from public.profiles where id = gto) then
    gto := null;
  end if;
  if uid is null and coalesce(p_email, '') <> '' then
    select p.id into uid from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email) limit 1;
  end if;
  insert into public.payments (id, source, user_id, email, amount, currency, plan, kind, gift_to)
    values (p_id, p_source, uid, lower(coalesce(p_email, '')), coalesce(p_amount, 0), upper(coalesce(nullif(p_currency, ''), 'USD')),
            coalesce(p_plan, ''), coalesce(nullif(p_kind, ''), 'payment'), gto)
    on conflict (id) do update set amount = excluded.amount, kind = excluded.kind,
      user_id = coalesce(public.payments.user_id, excluded.user_id), gift_to = coalesce(public.payments.gift_to, excluded.gift_to);
end $$;
revoke all on function public.record_payment(text, text, text, uuid, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_payment(text, text, text, uuid, numeric, text, text, text, uuid) to service_role;

-- Ödeme bildirimi: hediyede alıcının adı eklenir, ödeyenin kendi PRO süresi yazılmaz
create or replace function public.payment_notify_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_ad boolean := coalesce(new.plan, '') like 'Reklam:%';
  is_gift boolean := new.gift_to is not null;
  d jsonb;
begin
  if coalesce(new.amount, 0) = 0 then
    return null;
  end if;
  d := jsonb_build_object('payment', new.id, 'source', new.source, 'amount', new.amount, 'currency', new.currency,
                          'plan', new.plan, 'kind', new.kind, 'email', new.email, 'ad', is_ad,
                          'name', coalesce((select display_name from public.profiles where id = new.user_id), ''));
  if is_gift then
    d := d || jsonb_build_object('gift', true, 'gift_to', new.gift_to,
                                 'gift_name', coalesce((select display_name from public.profiles where id = new.gift_to), ''));
  end if;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'payment_new', d from public.profiles p where p.is_admin;
  if new.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (new.user_id, 'payment_receipt',
              d || case when is_ad or is_gift then '{}'::jsonb
                        else jsonb_build_object('pro_until', (select pro_until from public.profiles where id = new.user_id)) end);
  end if;
  return null;
end $$;

-- my_payments: hediye ödemelerinde alıcının adı
drop function if exists public.my_payments();
create or replace function public.my_payments()
returns table (id text, source text, amount numeric, currency text, plan text, kind text, created_at timestamptz, gift_name text)
language sql stable security definer set search_path = public as $$
  select y.id, y.source, y.amount, y.currency, y.plan, y.kind, y.created_at,
         case when y.gift_to is not null then coalesce((select display_name from public.profiles where id = y.gift_to), '') end
  from public.payments y
  where y.user_id = auth.uid() order by y.created_at desc limit 100;
$$;
grant execute on function public.my_payments() to authenticated;

-- 4) Kullanıcı RPC'leri -----------------------------------------------------------
-- Kendi PRO durumu: 'sub' kendi aboneliği (hediye hariç; portal bağlantısı ödeyene aittir),
-- 'gift' aldığım (sürmekte olan) hediye ve hediye edenin adı
create or replace function public.my_pro() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro_until', p.pro_until,
    'source', p.pro_source,
    'renewing', public.sub_renewing(p.id),
    'sub', (select to_jsonb(s) from (
      select status, plan, renews_at, ends_at, portal_url from public.subscriptions
      where user_id = p.id and not is_gift order by updated_at desc limit 1) s),
    'gift', g.j,
    'gifted_by_name', g.j ->> 'gifted_by_name'
  ) from public.profiles p
  left join lateral (
    select to_jsonb(x) as j from (
      select s.status, s.plan, s.renews_at, s.ends_at, s.created_at, s.grant_until as until,
             coalesce(gp.display_name, '') as gifted_by_name
      from public.subscriptions s left join public.profiles gp on gp.id = s.gifted_by
      where s.user_id = p.id and s.is_gift
        and (s.status in ('active', 'on_trial', 'past_due') or coalesce(s.grant_until, s.ends_at) > now())
      order by s.updated_at desc limit 1) x
  ) g on true
  where p.id = auth.uid();
$$;
grant execute on function public.my_pro() to authenticated;

-- Hediye ettiğim abonelikler (alıcının e-postası gösterilmez)
create or replace function public.my_gifts()
returns table (lemon_id text, recipient uuid, recipient_name text, plan text, status text,
               renews_at timestamptz, ends_at timestamptz, until timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.lemon_id, s.user_id, coalesce(p.display_name, ''), s.plan, s.status, s.renews_at, s.ends_at, s.grant_until, s.created_at
  from public.subscriptions s left join public.profiles p on p.id = s.user_id
  where s.is_gift and s.gifted_by = auth.uid()
  order by s.created_at desc
  limit 50;
$$;
revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

-- Bildirimden e-posta (c25'teki türler + hediye PRO: alıcıya pro_gift / pro_gift_ended, hediye edene pro_gift_sent)
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- c27: Arkadaşlar: kendi görünümünden mesaj/sohbet silme, mesaj raporlama, PRO kuralları.
--      1) Mesaj gizleme (sadece kendi görünümün; karşı taraf görmeye devam eder):
--         - message_hidden (user_id, message_id): tek mesaj "Benden sil" → hide_message(id)
--         - conversation_cleared (user_id, friend_id, cleared_before): "Sohbeti temizle" → clear_conversation(friend)
--         messages okuma kuralı ("messages own") artık çağıranın gizlediği / temizlediği mesajları döndürmez
--         (REST ve Realtime ikisi de). Gizlenen / temizlenen gelen mesajlar okundu sayılır.
--      2) Mesaj raporlama: message_reports (raporlayan, mesaj, raporlanan, sebep, not, mesaj metninin kopyası).
--         message_report(id, sebep, not): sadece SANA gelen mesaj, mesaj başına bir kez, günde en fazla 20 rapor.
--         Tüm yöneticilere 'message_reported' bildirimi + e-posta (pitwall-jobs → messageReportAdmin).
--         Yönetici: admin_message_reports(durum) ve admin_message_report_set(id, işlem):
--           dismiss (yoksay) | resolve (çözüldü) | reopen (yeniden aç) | delete_message (mesajı iki taraftan da sil)
--      3) PRO kuralları:
--         - Mesaj göndermek artık herkese açık (send_message PRO denetimi kaldırıldı; hız sınırı aynı).
--         - Veri paylaşımı PRO: A'nın canlı verisini B ancak A PRO ise ve A, B'yi güvenilir işaretlediyse görür.
--           user_is_pro(uid) yardımcı fonksiyonu; live_data okuma kuralı (live_visible) paylaşanın PRO olmasını ister,
--           live_data'ya yazmak (yükleme) PRO ister. my_friends().trusts_me paylaşan PRO değilse false döner.
--           PRO olmayan üye, onu güvenilir seçen PRO arkadaşının verisini görebilir.
--           Düzeltme: eski okuma kuralındaki alt sorgu, friendships RLS'i yüzünden karşı tarafın "güvenilir" satırını
--           göremiyordu (arkadaşın verisi hiç okunamıyordu); denetim artık security definer live_visible() ile.
-- Sıra: önce bu dosya, sonra pitwall-jobs fonksiyonu.
-- ---------------------------------------------------------------------------

-- 3a) Bir kullanıcının PRO olup olmadığı (is_pro() ile aynı kural, oturumdaki kullanıcı yerine verilen kişi)
create or replace function public.user_is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from public.profiles p
    where p.id = p_user
      and (p.is_admin or coalesce(p.pro_until > now(), false) or public.promo_active())
  );
$$;
revoke all on function public.user_is_pro(uuid) from public, anon;
grant execute on function public.user_is_pro(uuid) to authenticated, service_role;

-- 1) Mesaj gizleme ------------------------------------------------------------
create table if not exists public.message_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists message_hidden_message on public.message_hidden (message_id);
alter table public.message_hidden enable row level security;
drop policy if exists "own hidden messages" on public.message_hidden;
create policy "own hidden messages" on public.message_hidden for select using (auth.uid() = user_id);

create table if not exists public.conversation_cleared (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  cleared_before timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.conversation_cleared enable row level security;
drop policy if exists "own cleared conversations" on public.conversation_cleared;
create policy "own cleared conversations" on public.conversation_cleared for select using (auth.uid() = user_id);

-- Oturumdaki kullanıcı bu mesajı kendi görünümünden kaldırdı mı (tek tek ya da sohbeti temizleyerek)
create or replace function public.message_hidden_for(p_id uuid, p_sender uuid, p_recipient uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.message_hidden h where h.user_id = auth.uid() and h.message_id = p_id)
      or exists (select 1 from public.conversation_cleared c
                 where c.user_id = auth.uid()
                   and c.friend_id = case when p_sender = auth.uid() then p_recipient else p_sender end
                   and p_at <= c.cleared_before);
$$;
revoke all on function public.message_hidden_for(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.message_hidden_for(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

drop policy if exists "messages own" on public.messages;
create policy "messages own" on public.messages for select using (
  (auth.uid() = sender or auth.uid() = recipient)
  and not public.message_hidden_for(id, sender, recipient, created_at)
);

create or replace function public.hide_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.messages;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into m from public.messages where id = p_id;
  if m.id is null or (m.sender <> me and m.recipient <> me) then
    raise exception 'Mesaj bulunamadı';
  end if;
  insert into public.message_hidden (user_id, message_id) values (me, p_id) on conflict do nothing;
  if m.recipient = me and m.read_at is null then
    update public.messages set read_at = now() where id = p_id;
  end if;
end $$;

create or replace function public.clear_conversation(p_friend uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_at timestamptz := now();
begin
  if me is null or p_friend is null or p_friend = me then
    raise exception 'Geçersiz kullanıcı';
  end if;
  insert into public.conversation_cleared (user_id, friend_id, cleared_before) values (me, p_friend, v_at)
    on conflict (user_id, friend_id) do update set cleared_before = greatest(public.conversation_cleared.cleared_before, excluded.cleared_before);
  update public.messages set read_at = v_at where recipient = me and sender = p_friend and read_at is null and created_at <= v_at;
  -- Tek tek gizlenenlerin kaydı artık gereksiz (temizleme hepsini kapsıyor)
  delete from public.message_hidden h using public.messages m
    where h.user_id = me and m.id = h.message_id and m.created_at <= v_at
      and ((m.sender = me and m.recipient = p_friend) or (m.sender = p_friend and m.recipient = me));
end $$;

-- 2) Mesaj raporları -----------------------------------------------------------
create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  -- Mesaj silinse de rapor kalır (metnin kopyası body'de)
  message_id uuid references public.messages (id) on delete set null,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reported uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'scam', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  body text not null default '',
  message_at timestamptz,
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved', 'removed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter, message_id)
);
create index if not exists message_reports_open on public.message_reports (status, created_at desc);
create index if not exists message_reports_reporter on public.message_reports (reporter, created_at desc);
create index if not exists message_reports_message on public.message_reports (message_id);
alter table public.message_reports enable row level security;
drop policy if exists "message reports read" on public.message_reports;
create policy "message reports read" on public.message_reports for select using (auth.uid() = reporter or public.is_admin());

create or replace function public.message_report(p_message uuid, p_reason text, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.messages;
  rid uuid;
  snippet text;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate', 'scam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  select * into m from public.messages where id = p_message;
  if m.id is null or m.recipient <> me then
    raise exception 'Sadece sana gelen mesajları raporlayabilirsin';
  end if;
  if (select count(*) from public.message_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  insert into public.message_reports (message_id, reporter, reported, reason, note, body, message_at)
    values (p_message, me, m.sender, p_reason, left(trim(coalesce(p_note, '')), 500), m.body, m.created_at)
    on conflict (reporter, message_id) do nothing
    returning id into rid;
  if rid is null then
    raise exception 'Bu mesajı zaten raporladın';
  end if;
  snippet := left(m.body, 200);
  insert into public.notifications (user_id, kind, data)
    select p.id, 'message_reported', jsonb_build_object(
      'report', rid, 'reason', p_reason, 'text', snippet, 'note', left(trim(coalesce(p_note, '')), 200),
      'reporter', me, 'reporter_name', coalesce((select display_name from public.profiles where id = me), '?'),
      'reported', m.sender, 'reported_name', coalesce((select display_name from public.profiles where id = m.sender), '?'))
    from public.profiles p where p.is_admin;
  return rid;
end $$;

-- Yönetici: mesaj raporları (p_status: 'open' ya da '' = hepsi)
create or replace function public.admin_message_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id, r.message_id, r.reason, r.note, r.body, r.message_at, r.status, r.created_at, r.handled_at,
             r.reporter, coalesce(a.display_name, '?') as reporter_name,
             r.reported, coalesce(b.display_name, '?') as reported_name,
             coalesce(h.display_name, '') as handled_name,
             (r.message_id is not null) as message_exists,
             (select count(*)::int from public.message_reports o where o.reported = r.reported and r.reported is not null) as reported_total
      from public.message_reports r
      left join public.profiles a on a.id = r.reporter
      left join public.profiles b on b.id = r.reported
      left join public.profiles h on h.id = r.handled_by
      where coalesce(p_status, '') = '' or r.status = p_status
      order by r.created_at desc
      limit 300
    ) x), '[]'::jsonb);
end $$;

-- Yönetici işlemleri: dismiss | resolve | reopen | delete_message
create or replace function public.admin_message_report_set(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.message_reports;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into r from public.message_reports where id = p_id for update;
  if r.id is null then
    raise exception 'Rapor bulunamadı';
  end if;
  if p_action = 'dismiss' then
    update public.message_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_action = 'resolve' then
    update public.message_reports set status = 'resolved', handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_action = 'reopen' then
    update public.message_reports set status = 'open', handled_by = null, handled_at = null where id = p_id;
  elsif p_action = 'delete_message' then
    -- Aynı mesajın tüm raporları kapanır; mesaj iki taraftan da silinir (rapordaki kopya kalır)
    if r.message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where message_id = r.message_id;
      delete from public.messages where id = r.message_id;
    else
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now() where id = p_id;
    end if;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('message_report_' || p_action, 'message', coalesce(r.message_id::text, ''), r.reported,
    jsonb_build_object('reason', r.reason, 'body', left(r.body, 200), 'report', r.id));
end $$;

-- 3b) Mesaj göndermek herkese açık (PRO denetimi kaldırıldı) --------------------
create or replace function public.send_message(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if not public.are_friends(me, p_to) then
    raise exception 'Sadece arkadaşlarına mesaj gönderebilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_to and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_to), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.messages (sender, recipient, body) values (me, p_to, left(trim(p_body), 1000)) returning id into mid;
  return mid;
end $$;

-- 3c) Veri paylaşımı PRO -------------------------------------------------------
-- Güvenilir işaretlemek (verilerimi paylaşmak) PRO; güvenilirden çıkarmak ve sessize almak herkese açık
create or replace function public.friend_set(p_user uuid, p_trusted boolean, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_trusted and not public.is_pro()
     and not coalesce((select trusted from public.friendships where user_id = auth.uid() and friend_id = p_user), false) then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  update public.friendships set trusted = p_trusted, muted = p_muted
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
end $$;

-- Canlı veriyi yüklemek PRO (silmek herkese açık); okumak: kendisi ya da paylaşan PRO ve beni güvenilir seçmiş
drop policy if exists "live own write" on public.live_data;
create policy "live own write" on public.live_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_pro());
-- Not: friendships satırlarını üye sadece kendi tarafından okuyabildiği için (RLS) "beni güvenilir seçti mi"
-- denetimi security definer yardımcıyla yapılır (eski kuraldaki alt sorgu karşı tarafın satırını göremiyordu).
create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (exists (select 1 from public.friendships f
                where f.user_id = p_owner and f.friend_id = auth.uid() and f.status = 'accepted' and f.trusted)
        and public.user_is_pro(p_owner)));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;
drop policy if exists "live trusted read" on public.live_data;
create policy "live trusted read" on public.live_data for select using (public.live_visible(user_id));

-- Arkadaş listesi: trusts_me = arkadaş beni güvenilir seçti VE arkadaş PRO (verisini görebilirim);
-- okunmamış sayısı kendi görünümümden kaldırdığım mesajları saymaz
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         coalesce(o.trusted and o.status = 'accepted', false) and public.user_is_pro(f.friend_id),
         coalesce(s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         case when f.status = 'accepted' then coalesce(s.track, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.car, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.session, '') else '' end,
         coalesce(s.dnd, false), coalesce(s.accept_messages, true),
         case when f.status = 'accepted' then s.updated_at end,
         (select count(*)::int from public.messages m
          where m.recipient = auth.uid() and m.sender = f.friend_id and m.read_at is null
            and not public.message_hidden_for(m.id, m.sender, m.recipient, m.created_at))
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.friendships o on o.user_id = f.friend_id and o.friend_id = f.user_id
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;

-- Yetkiler -------------------------------------------------------------------
grant select on public.message_hidden, public.conversation_cleared, public.message_reports to authenticated;
grant all on public.message_hidden, public.conversation_cleared, public.message_reports to service_role;
revoke all on function public.hide_message(uuid), public.clear_conversation(uuid), public.message_report(uuid, text, text),
  public.admin_message_reports(text), public.admin_message_report_set(uuid, text) from public, anon;
grant execute on function public.hide_message(uuid), public.clear_conversation(uuid), public.message_report(uuid, text, text),
  public.admin_message_reports(text), public.admin_message_report_set(uuid, text),
  public.send_message(uuid, text), public.friend_set(uuid, boolean, boolean), public.my_friends() to authenticated;

-- Bildirimden e-posta (c26'daki türler + mesaj raporu: yöneticilere message_reported)
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended',
                  'message_reported') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- c28: Destek ve yönetim araçları.
--      1) Moderatörler destek taleplerini görür: liste, yazışma, yanıt, kapat / yeniden aç (silemez).
--         is_moderator(): yönetici ya da "reports.view" izni olan (Moderatör grubu) üye.
--         support_tickets / support_messages okuma kuralları, "support" kovası okuma, support_reply,
--         support_set_status, support_seen, support_thread ve admin_support_tickets artık is_moderator() ile.
--         admin_support_tickets e-posta adresini sadece yöneticiye döndürür (moderatöre null).
--      2) admin_support_delete(talep): yönetici talebi tüm mesajları ve bildirimleriyle KALICI siler;
--         silinen görsellerin yollarını döner (başka talepte kullanılmayanlar). İstemci bunları Storage API ile
--         "support" kovasından siler (Supabase storage.objects'ten doğrudan silmeye izin vermiyor).
--      3) admin_messages(...): yönetici tüm üye-üye özel mesajlarını süzerek görür
--         (üye adı / iRacing adı, isteğe bağlı ikinci üye = ikili sohbet, tarih aralığı, metin; sayfalı).
--         İlk sayfa her açılışta mod_log'a 'messages_view' olarak yazılır.
--      4) admin_ad_delete(reklam): yönetici reklamı durumundan bağımsız KALICI siler (raporları ve sayaçlarıyla);
--         görsel yolunu döner (başka reklamda kullanılmıyorsa), istemci "ads" kovasından siler.
-- Sıra: sadece bu dosya (edge fonksiyonu değişmedi). Yeni bildirim türü yok.
-- ---------------------------------------------------------------------------

-- 1) Moderatör ------------------------------------------------------------------
-- Yönetici her izne sahip olduğundan has_perm yöneticiler için de true döner.
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.has_perm('reports.view');
$$;
revoke all on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated, service_role;

drop policy if exists "support tickets read" on public.support_tickets;
create policy "support tickets read" on public.support_tickets for select using (auth.uid() = user_id or public.is_moderator());
drop policy if exists "support messages read" on public.support_messages;
create policy "support messages read" on public.support_messages for select using (
  public.is_moderator() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

create or replace function public.support_can_read(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_moderator()
      or split_part(p_path, '/', 1) = auth.uid()::text
      or exists (select 1 from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
                 where t.user_id = auth.uid() and p_path = any (m.images));
$$;
-- (Kova silme kuralı değişmedi: kendi klasörü ya da yönetici.)

-- Yanıt: talep sahibi, moderatör ya da yönetici
create or replace function public.support_reply(p_ticket uuid, p_body text, p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.support_tickets;
  staff boolean;
  mid uuid;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if not found or (t.user_id <> me and not public.is_moderator()) then
    raise exception 'Talep bulunamadı';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Mesaj boş olamaz';
  end if;
  staff := t.user_id <> me;
  if not staff and (select count(*) from public.support_messages where author_id = me and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Çok hızlı yazıyorsun';
  end if;
  insert into public.support_messages (ticket_id, author_id, body, images, is_staff)
    values (p_ticket, me, left(trim(p_body), 4000), public.support_check_images(p_images), staff)
    returning id into mid;
  update public.support_tickets set
    status = case when staff then 'answered' else 'open' end,
    last_author = case when staff then 'staff' else 'user' end,
    staff_seen_at = case when staff then now() else staff_seen_at end,
    user_seen_at = case when staff then user_seen_at else now() end,
    updated_at = now()
  where id = p_ticket;
  if staff then
    if not exists (select 1 from public.notifications n where n.user_id = t.user_id and not n.read
                   and n.kind = 'support_reply' and n.data ->> 'ticket' = t.id::text) then
      insert into public.notifications (user_id, kind, data)
        values (t.user_id, 'support_reply', jsonb_build_object('ticket', t.id, 'subject', t.subject, 'category', t.category,
                'name', (select display_name from public.profiles where id = me)));
    end if;
  else
    perform public.support_notify_admins(p_ticket, 'support_user_reply');
  end if;
  return mid;
end $$;

-- Kapat / yeniden aç (sahip, moderatör ya da yönetici)
create or replace function public.support_set_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'Geçersiz durum';
  end if;
  update public.support_tickets set status = p_status, updated_at = now()
    where id = p_ticket and (user_id = auth.uid() or public.is_moderator());
  if not found then
    raise exception 'Talep bulunamadı';
  end if;
end $$;

-- Talep okundu (sahipse kullanıcı, değilse ekip tarafı)
create or replace function public.support_seen(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets set user_seen_at = now() where id = p_ticket and user_id = auth.uid();
  if not found and public.is_moderator() then
    update public.support_tickets set staff_seen_at = now() where id = p_ticket;
  end if;
end $$;

-- Talebin mesajları (sahip, moderatör ya da yönetici)
create or replace function public.support_thread(p_ticket uuid)
returns table (id uuid, author_id uuid, author_name text, body text, images text[], is_staff boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets t where t.id = p_ticket and (t.user_id = auth.uid() or public.is_moderator())) then
    raise exception 'Talep bulunamadı';
  end if;
  return query
    select m.id, m.author_id, coalesce(p.display_name, '?'), m.body, m.images, m.is_staff, m.created_at
    from public.support_messages m left join public.profiles p on p.id = m.author_id
    where m.ticket_id = p_ticket order by m.created_at;
end $$;

-- Ekip: talepler (p_status: null/'' hepsi, 'open', 'answered', 'closed', 'unread'). E-posta sadece yöneticiye.
create or replace function public.admin_support_tickets(p_status text default null, p_category text default null)
returns table (id uuid, user_id uuid, display_name text, email text, category text, subject text, status text,
               created_at timestamptz, updated_at timestamptz, unread boolean, messages int, last_body text, pro_until timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  adm boolean := public.is_admin();
begin
  if not public.is_moderator() then
    raise exception 'yetki yok';
  end if;
  return query
    select t.id, t.user_id, p.display_name, case when adm then u.email::text end, t.category, t.subject, t.status, t.created_at, t.updated_at,
           t.last_author = 'user' and (t.staff_seen_at is null or t.staff_seen_at < t.updated_at),
           (select count(*)::int from public.support_messages m where m.ticket_id = t.id),
           (select left(m.body, 160) from public.support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1),
           p.pro_until
    from public.support_tickets t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
    where (coalesce(p_status, '') = ''
           or (p_status = 'unread' and t.last_author = 'user' and (t.staff_seen_at is null or t.staff_seen_at < t.updated_at))
           or t.status = p_status)
      and (coalesce(p_category, '') = '' or t.category = p_category)
    order by (t.status = 'open') desc, t.updated_at desc
    limit 300;
end $$;

-- 2) Talebi kalıcı sil (sadece yönetici) -----------------------------------------
create or replace function public.admin_support_delete(p_ticket uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  t public.support_tickets;
  imgs text[];
  n int;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Talep bulunamadı';
  end if;
  select coalesce(array_agg(distinct x), '{}'), count(distinct m.id)::int into imgs, n
    from public.support_messages m left join lateral unnest(m.images) x on true
    where m.ticket_id = p_ticket;
  imgs := array_remove(imgs, null);
  delete from public.support_tickets where id = p_ticket;  -- mesajlar cascade
  delete from public.notifications
    where kind in ('support_new', 'support_user_reply', 'support_reply') and data ->> 'ticket' = p_ticket::text;
  -- Başka bir talepte de geçen görsel silinmez
  select coalesce(array_agg(x), '{}') into imgs from unnest(imgs) x
    where not exists (select 1 from public.support_messages m where x = any (m.images));
  perform public.log_mod('support_delete', 'support', p_ticket::text, t.user_id,
    jsonb_build_object('subject', t.subject, 'category', t.category, 'messages', n, 'images', coalesce(array_length(imgs, 1), 0)));
  return imgs;
end $$;

-- 3) Tüm özel mesajlar (sadece yönetici) -----------------------------------------
-- p_user_query: üye adı / iRacing adı (parça) ya da tam kullanıcı kimliği; eşleşen üyelerin TÜM sohbetleri.
-- p_other_query: verilirse sadece bu iki taraf arasındaki mesajlar (ilki boşsa tek süzgeç gibi davranır).
-- p_text: mesaj metninde arama; p_from / p_to: tarih aralığı. Yeniden eskiye, total = süzgece uyan toplam.
create or replace function public.admin_match_users(p_q text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(trim(p_q), '') = '' then null
    when trim(p_q) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then array[trim(p_q)::uuid]
    else coalesce((select array_agg(p.id) from public.profiles p
                   where p.display_name ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or p.iracing_name ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
  end;
$$;
revoke all on function public.admin_match_users(text) from public, anon, authenticated;

create or replace function public.admin_messages(
  p_user_query text default null, p_other_query text default null, p_text text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit int default 100, p_offset int default 0)
returns table (id uuid, sender uuid, sender_name text, sender_iracing text, recipient uuid, recipient_name text, recipient_iracing text,
               body text, created_at timestamptz, read_at timestamptz,
               hidden_by_sender boolean, hidden_by_recipient boolean, reported boolean, total bigint)
language plpgsql security definer set search_path = public as $$
declare
  a uuid[];
  b uuid[];
  q text := nullif(trim(coalesce(p_text, '')), '');
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  a := public.admin_match_users(p_user_query);
  b := public.admin_match_users(p_other_query);
  if a is null then
    a := b;
    b := null;
  end if;
  p_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  if p_offset = 0 then
    perform public.log_mod('messages_view', 'message', '', case when coalesce(array_length(a, 1), 0) = 1 then a[1] end,
      jsonb_strip_nulls(jsonb_build_object('user', nullif(trim(coalesce(p_user_query, '')), ''), 'other', nullif(trim(coalesce(p_other_query, '')), ''),
                                           'text', q, 'from', p_from, 'to', p_to)));
  end if;
  return query
    select m.id, m.sender, coalesce(ps.display_name, '?'), ps.iracing_name, m.recipient, coalesce(pr.display_name, '?'), pr.iracing_name,
           m.body, m.created_at, m.read_at,
           exists (select 1 from public.message_hidden h where h.user_id = m.sender and h.message_id = m.id)
             or exists (select 1 from public.conversation_cleared c where c.user_id = m.sender and c.friend_id = m.recipient and m.created_at <= c.cleared_before),
           exists (select 1 from public.message_hidden h where h.user_id = m.recipient and h.message_id = m.id)
             or exists (select 1 from public.conversation_cleared c where c.user_id = m.recipient and c.friend_id = m.sender and m.created_at <= c.cleared_before),
           exists (select 1 from public.message_reports r where r.message_id = m.id),
           count(*) over ()
    from public.messages m
    left join public.profiles ps on ps.id = m.sender
    left join public.profiles pr on pr.id = m.recipient
    where (a is null or (b is null and (m.sender = any (a) or m.recipient = any (a)))
                     or (b is not null and ((m.sender = any (a) and m.recipient = any (b)) or (m.sender = any (b) and m.recipient = any (a)))))
      and (q is null or m.body ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (p_from is null or m.created_at >= p_from)
      and (p_to is null or m.created_at < p_to)
    order by m.created_at desc
    limit p_limit offset p_offset;
end $$;

-- 4) Reklamı kalıcı sil (sadece yönetici; yayındaki dahil) ---------------------------
create or replace function public.admin_ad_delete(p_ad uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into a from public.ad_campaigns where id = p_ad for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  delete from public.ad_campaigns where id = p_ad;  -- raporlar ve gösterim kayıtları cascade
  delete from public.notifications
    where kind in ('ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending') and data ->> 'ad' = p_ad::text
      and user_id <> a.user_id;  -- reklam verenin kendi bildirimleri (ödeme / yayın geçmişi) kalır
  perform public.log_mod('ad_force_delete', 'ad', p_ad::text, a.user_id,
    jsonb_build_object('title', a.title, 'status', a.status, 'reports', a.reports, 'paid', a.paid_amount, 'currency', a.currency));
  if exists (select 1 from public.ad_campaigns where image = a.image) then
    return null;
  end if;
  return a.image;
end $$;

-- Yetkiler -------------------------------------------------------------------
revoke all on function public.admin_support_delete(uuid),
  public.admin_messages(text, text, text, timestamptz, timestamptz, int, int),
  public.admin_ad_delete(uuid) from public, anon;
grant execute on function public.admin_support_delete(uuid),
  public.admin_messages(text, text, text, timestamptz, timestamptz, int, int),
  public.admin_ad_delete(uuid),
  public.support_reply(uuid, text, text[]), public.support_set_status(uuid, text), public.support_seen(uuid),
  public.support_thread(uuid), public.admin_support_tickets(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- c30: Takımlar, takım duyuru panosu, takım sohbet odası ve anketler, arkadaşa özel bildirim/ses kapatma.
--      1) Takımlar: teams (ad, etiket, açıklama, logo, renk, katılım şekli: open | request | invite),
--         team_members (owner | admin | member), team_invites (invite: takım davet etti, request: üye katılmak istedi).
--         Kuran sahip olur; sahip yönetici atar/alır, sahipliği devreder, takımı siler. Yöneticiler davet eder,
--         katılma isteklerini onaylar, üye çıkarır, duyuru yazar/sabitler, takımı düzenler.
--         Logolar herkese açık "teams" kovasında, <kullanıcı id>/<dosya>.
--         same_team(a, b): iki üye ortak bir takımda mı (c29'daki taslağın gerçek hali; telemetri paylaşımı bunu kullanır).
--      2) Duyuru panosu: team_posts (sadece sahip/yöneticiler yazar), team_post_comments (üyeler yorum yazar),
--         teams.pinned_post (sabit duyuru). Yeni duyuruda üyelere 'team_announcement' bildirimi (e-posta yok).
--      3) Sohbet odası: team_messages (Realtime), team_chat_state (okundu zamanı, odayı sessize alma),
--         team_message_hidden (benden sil). Kendi mesajını (yönetici her mesajı) herkesten silme: içerik boşaltılır.
--      4) Anketler: team_polls (soru, 2-6 seçenek, tek/çok seçim, bitiş zamanı, canlı sayılar) + team_poll_votes.
--         Bitiş zamanından sonra oy verilemez; anketi açan ya da yönetici erken bitirebilir.
--      5) Arkadaşa özel: friendships.notify_muted (bildirim/açılır pencere yok), sound_muted (ses yok) → friend_prefs().
--      Bildirim türleri: team_invite, team_request, team_accepted, team_announcement, team_role.
-- Sıra: c28 ve c29'dan sonra. (c29 same_team taslağını sadece yoksa oluşturur; sıra karışsa da buradaki gerçek hali kalır.)
-- ---------------------------------------------------------------------------

-- 1) Takımlar -------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  tag text not null check (char_length(tag) between 2 and 5),
  description text not null default '' check (char_length(description) <= 1000),
  color text not null default '#4ea1ff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text not null default '' check (char_length(logo_path) <= 200),
  join_mode text not null default 'request' check (join_mode in ('open', 'request', 'invite')),
  owner uuid not null references public.profiles (id) on delete cascade,
  pinned_post uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_name_key on public.teams (lower(name));
create unique index if not exists teams_tag_key on public.teams (upper(tag));
create index if not exists teams_owner on public.teams (owner);
alter table public.teams enable row level security;
drop policy if exists "teams public read" on public.teams;
create policy "teams public read" on public.teams for select using (true);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members (user_id);
create unique index if not exists team_members_one_owner on public.team_members (team_id) where role = 'owner';
alter table public.team_members enable row level security;
drop policy if exists "team members public read" on public.team_members;
create policy "team members public read" on public.team_members for select using (true);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('invite', 'request')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index if not exists team_invites_user on public.team_invites (user_id);
create index if not exists team_invites_by on public.team_invites (invited_by, created_at desc);
alter table public.team_invites enable row level security;

-- Yardımcılar (security definer: RLS döngüsüne girmeden üyelik denetimi)
create or replace function public.team_role(p_team uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.team_members where team_id = p_team and user_id = p_user;
$$;
create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid());
$$;
create or replace function public.is_team_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid() and role in ('owner', 'admin'));
$$;

-- İki üye ortak bir takımda mı (c29'daki taslağın yerine; telemetri görünürlüğü bunu kullanır)
create or replace function public.same_team(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.team_members x
    join public.team_members y on y.team_id = x.team_id
    where x.user_id = a and y.user_id = b);
$$;

drop policy if exists "team invites read" on public.team_invites;
create policy "team invites read" on public.team_invites for select using (auth.uid() = user_id or public.is_team_admin(team_id));

-- 2) Duyuru panosu ----------------------------------------------------------------
create table if not exists public.team_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists team_posts_team on public.team_posts (team_id, created_at desc);
alter table public.team_posts enable row level security;
drop policy if exists "team posts members" on public.team_posts;
create policy "team posts members" on public.team_posts for select using (public.is_team_member(team_id));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_pinned_post_fkey') then
    alter table public.teams add constraint teams_pinned_post_fkey
      foreign key (pinned_post) references public.team_posts (id) on delete set null;
  end if;
end $$;

create table if not exists public.team_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_posts (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists team_post_comments_post on public.team_post_comments (post_id, created_at);
create index if not exists team_post_comments_author on public.team_post_comments (author, created_at desc);
alter table public.team_post_comments enable row level security;
drop policy if exists "team comments members" on public.team_post_comments;
create policy "team comments members" on public.team_post_comments for select using (public.is_team_member(team_id));

-- 3) Sohbet odası ve 4) anketler ---------------------------------------------------
create table if not exists public.team_polls (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  question text not null check (char_length(question) between 1 and 200),
  options text[] not null check (cardinality(options) between 2 and 6),
  multi boolean not null default false,
  ends_at timestamptz not null,
  counts int[] not null,
  voters int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_polls_team on public.team_polls (team_id, created_at desc);
alter table public.team_polls enable row level security;
drop policy if exists "team polls members" on public.team_polls;
create policy "team polls members" on public.team_polls for select using (public.is_team_member(team_id));

create table if not exists public.team_poll_votes (
  poll_id uuid not null references public.team_polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option smallint not null check (option between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option)
);
alter table public.team_poll_votes enable row level security;
drop policy if exists "team poll votes members" on public.team_poll_votes;
create policy "team poll votes members" on public.team_poll_votes for select using (
  exists (select 1 from public.team_polls p where p.id = poll_id and public.is_team_member(p.team_id)));

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 1000),
  poll_id uuid references public.team_polls (id) on delete cascade,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or poll_id is not null or char_length(body) >= 1)
);
create index if not exists team_messages_team on public.team_messages (team_id, created_at desc);
create index if not exists team_messages_sender on public.team_messages (sender, created_at desc);
alter table public.team_messages enable row level security;

create table if not exists public.team_message_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.team_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists team_message_hidden_message on public.team_message_hidden (message_id);
alter table public.team_message_hidden enable row level security;
drop policy if exists "own hidden team messages" on public.team_message_hidden;
create policy "own hidden team messages" on public.team_message_hidden for select using (auth.uid() = user_id);

create or replace function public.team_message_hidden_for(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_message_hidden h where h.user_id = auth.uid() and h.message_id = p_id);
$$;

drop policy if exists "team messages members" on public.team_messages;
create policy "team messages members" on public.team_messages for select using (
  public.is_team_member(team_id) and not public.team_message_hidden_for(id));

-- Üyenin odadaki kişisel durumu: son okuma ve sessize alma
create table if not exists public.team_chat_state (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.team_chat_state enable row level security;
drop policy if exists "own team chat state" on public.team_chat_state;
create policy "own team chat state" on public.team_chat_state for select using (auth.uid() = user_id);

-- Depolama: herkese açık "teams" kovası (logolar), <kullanıcı id>/<dosya>. Üye sadece kendi klasörüne yükler.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teams', 'teams', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "teams own upload" on storage.objects;
create policy "teams own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'teams' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "teams read" on storage.objects;
create policy "teams read" on storage.objects for select using (bucket_id = 'teams');
drop policy if exists "teams delete" on storage.objects;
create policy "teams delete" on storage.objects for delete to authenticated
  using (bucket_id = 'teams' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- RPC'ler
-- ---------------------------------------------------------------------------

-- Ad / etiket / renk / katılım / logo denetimi (hata mesajları kullanıcıya gösterilir)
create or replace function public.team_check(p_name text, p_tag text, p_color text, p_join_mode text, p_logo text)
returns void language plpgsql immutable as $$
begin
  if char_length(coalesce(p_name, '')) not between 2 and 40 then
    raise exception 'Takım adı 2-40 karakter olmalı';
  end if;
  if coalesce(p_tag, '') !~ '^[[:alnum:]]{2,5}$' then
    raise exception 'Etiket 2-5 harf ya da rakam olmalı';
  end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Geçersiz renk';
  end if;
  if coalesce(p_join_mode, '') not in ('open', 'request', 'invite') then
    raise exception 'Geçersiz katılım şekli';
  end if;
  if coalesce(p_logo, '') <> '' and p_logo !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' then
    raise exception 'Geçersiz logo';
  end if;
end $$;

-- İç yardımcı: üyeyi ekle (sınırlar burada); istemciye açık değil
create or replace function public.team_add_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    delete from public.team_invites where team_id = p_team and user_id = p_user;
    return;
  end if;
  if (select count(*) from public.team_members where team_id = p_team) >= 100 then
    raise exception 'Takım dolu (en fazla 100 üye)';
  end if;
  if (select count(*) from public.team_members where user_id = p_user) >= 10 then
    raise exception 'Bir üye en fazla 10 takımda olabilir';
  end if;
  insert into public.team_members (team_id, user_id, role) values (p_team, p_user, 'member');
  insert into public.team_chat_state (team_id, user_id) values (p_team, p_user)
    on conflict (team_id, user_id) do update set last_read_at = now();
  delete from public.team_invites where team_id = p_team and user_id = p_user;
end $$;

create or replace function public.team_create(p_name text, p_tag text, p_description text default '',
  p_color text default '#4ea1ff', p_logo text default '', p_join_mode text default 'request') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if (select count(*) from public.teams where owner = me) >= 3 then
    raise exception 'En fazla 3 takım kurabilirsin';
  end if;
  if (select count(*) from public.team_members where user_id = me) >= 10 then
    raise exception 'En fazla 10 takımda olabilirsin';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name)) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  insert into public.teams (name, tag, description, color, logo_path, join_mode, owner)
    values (v_name, v_tag, left(trim(coalesce(p_description, '')), 1000), p_color, coalesce(p_logo, ''), p_join_mode, me)
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.team_chat_state (team_id, user_id) values (tid, me);
  return tid;
end $$;

create or replace function public.team_update(p_team uuid, p_name text, p_tag text, p_description text,
  p_color text, p_logo text, p_join_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri düzenleyebilir';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if exists (select 1 from public.teams where lower(name) = lower(v_name) and id <> p_team) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag and id <> p_team) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  update public.teams set name = v_name, tag = v_tag, description = left(trim(coalesce(p_description, '')), 1000),
    color = p_color, logo_path = coalesce(p_logo, ''), join_mode = p_join_mode, updated_at = now()
    where id = p_team;
end $$;

-- Takımı sil: sahip ya da site yöneticisi (moderasyon)
create or replace function public.team_delete(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then
    raise exception 'Takım bulunamadı';
  end if;
  if t.owner <> auth.uid() and not public.is_admin() then
    raise exception 'Takımı sadece sahibi silebilir';
  end if;
  delete from public.notifications where kind in ('team_invite', 'team_request') and data ->> 'team' = p_team::text;
  delete from public.teams where id = p_team;
  if t.owner <> auth.uid() then
    perform public.log_mod('team_delete', 'team', p_team::text, t.owner,
      jsonb_build_object('name', t.name, 'tag', t.tag, 'description', left(t.description, 200)));
  end if;
end $$;

-- Davet et (sahip/yönetici). Kişi zaten katılmak istemişse doğrudan üye olur.
create or replace function public.team_invite(p_team uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
  inv public.team_invites;
  iid uuid;
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri davet edebilir';
  end if;
  if p_user is null or p_user = me or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Geçersiz kullanıcı';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    raise exception 'Bu kişi zaten takımda';
  end if;
  select * into t from public.teams where id = p_team;
  select * into inv from public.team_invites where team_id = p_team and user_id = p_user;
  if inv.kind = 'request' then
    perform public.team_add_member(p_team, p_user);
    delete from public.notifications where kind = 'team_request' and data ->> 'invite' = inv.id::text;
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'team_accepted', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag));
    return 'joined';
  end if;
  if inv.kind = 'invite' then
    return 'pending';
  end if;
  if (select count(*) from public.team_invites where invited_by = me and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Bugün çok fazla davet gönderdin';
  end if;
  insert into public.team_invites (team_id, user_id, kind, invited_by) values (p_team, p_user, 'invite', me) returning id into iid;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'team_invite', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'invite', iid,
      'from', me, 'name', coalesce((select display_name from public.profiles where id = me), '?')));
  return 'invited';
end $$;

-- Katılmak iste: açık takıma doğrudan katılır, davet varsa kabul edilir, onaylı takımda istek gönderilir
create or replace function public.team_request(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
  inv public.team_invites;
  iid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into t from public.teams where id = p_team;
  if t.id is null then
    raise exception 'Takım bulunamadı';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = me) then
    raise exception 'Zaten bu takımdasın';
  end if;
  select * into inv from public.team_invites where team_id = p_team and user_id = me;
  if inv.kind = 'invite' or t.join_mode = 'open' then
    perform public.team_add_member(p_team, me);
    if inv.id is not null then
      delete from public.notifications where kind = 'team_invite' and data ->> 'invite' = inv.id::text;
    end if;
    return 'joined';
  end if;
  if inv.kind = 'request' then
    return 'pending';
  end if;
  if t.join_mode = 'invite' then
    raise exception 'Bu takım sadece davetle üye alıyor';
  end if;
  if (select count(*) from public.team_invites where user_id = me and kind = 'request' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla katılma isteği gönderdin';
  end if;
  insert into public.team_invites (team_id, user_id, kind) values (p_team, me, 'request') returning id into iid;
  insert into public.notifications (user_id, kind, data)
    select m.user_id, 'team_request', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'invite', iid,
      'from', me, 'name', coalesce((select display_name from public.profiles where id = me), '?'))
    from public.team_members m where m.team_id = p_team and m.role in ('owner', 'admin');
  return 'requested';
end $$;

-- Davete / isteğe yanıt. Davet: kabul eden davetli; istek: kabul eden sahip/yönetici. Reddetme/iptal: iki taraf da.
create or replace function public.team_respond(p_invite uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.team_invites;
  t public.teams;
  adm boolean;
begin
  select * into inv from public.team_invites where id = p_invite;
  if inv.id is null then
    raise exception 'Davet bulunamadı';
  end if;
  adm := public.is_team_admin(inv.team_id);
  if inv.user_id <> me and not adm then
    raise exception 'yetki yok';
  end if;
  if p_accept then
    if inv.kind = 'invite' and inv.user_id <> me then
      raise exception 'Daveti sadece davet edilen kabul edebilir';
    end if;
    if inv.kind = 'request' and not adm then
      raise exception 'Katılma isteğini sadece takım sahibi ve yöneticileri onaylayabilir';
    end if;
    perform public.team_add_member(inv.team_id, inv.user_id);
    if inv.kind = 'request' then
      select * into t from public.teams where id = inv.team_id;
      insert into public.notifications (user_id, kind, data)
        values (inv.user_id, 'team_accepted', jsonb_build_object('team', t.id, 'team_name', t.name, 'tag', t.tag));
    end if;
  else
    delete from public.team_invites where id = p_invite;
  end if;
  delete from public.notifications where kind in ('team_invite', 'team_request') and data ->> 'invite' = p_invite::text;
end $$;

-- Takımdan ayrıl (sahip önce devretmeli ya da silmeli)
create or replace function public.team_leave(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r text := public.team_role(p_team, auth.uid());
begin
  if r is null then
    raise exception 'Bu takımda değilsin';
  end if;
  if r = 'owner' then
    raise exception 'Takım sahibi ayrılmadan önce sahipliği devretmeli ya da takımı silmeli';
  end if;
  delete from public.team_members where team_id = p_team and user_id = me;
  delete from public.team_chat_state where team_id = p_team and user_id = me;
end $$;

-- Üye çıkar: sahip herkesi, yönetici sadece üyeleri
create or replace function public.team_kick(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  mine text := public.team_role(p_team, auth.uid());
  theirs text := public.team_role(p_team, p_user);
begin
  if mine not in ('owner', 'admin') or mine is null then
    raise exception 'Sadece takım sahibi ve yöneticileri üye çıkarabilir';
  end if;
  if theirs is null then
    raise exception 'Bu kişi takımda değil';
  end if;
  if theirs = 'owner' or (mine = 'admin' and theirs <> 'member') then
    raise exception 'Bu kişiyi çıkaramazsın';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  delete from public.team_chat_state where team_id = p_team and user_id = p_user;
end $$;

-- Yönetici yap / yöneticiliği al (sadece sahip)
create or replace function public.team_set_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  theirs text := public.team_role(p_team, p_user);
  t public.teams;
begin
  if public.team_role(p_team, auth.uid()) is distinct from 'owner' then
    raise exception 'Rolleri sadece takım sahibi değiştirebilir';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Geçersiz rol';
  end if;
  if theirs is null or theirs = 'owner' then
    raise exception 'Bu kişinin rolü değiştirilemez';
  end if;
  if theirs = p_role then
    return;
  end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
  if p_role = 'admin' then
    select * into t from public.teams where id = p_team;
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'team_role', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'role', 'admin',
        'name', coalesce((select display_name from public.profiles where id = auth.uid()), '?')));
  end if;
end $$;

-- Sahipliği devret (sahip yönetici olur)
create or replace function public.team_transfer(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
begin
  if public.team_role(p_team, me) is distinct from 'owner' then
    raise exception 'Sahipliği sadece takım sahibi devredebilir';
  end if;
  if p_user = me or public.team_role(p_team, p_user) is null then
    raise exception 'Sahiplik sadece takımdaki başka bir üyeye devredilebilir';
  end if;
  if (select count(*) from public.teams where owner = p_user) >= 3 then
    raise exception 'Bu üye zaten 3 takımın sahibi';
  end if;
  update public.team_members set role = 'admin' where team_id = p_team and user_id = me;
  update public.team_members set role = 'owner' where team_id = p_team and user_id = p_user;
  update public.teams set owner = p_user, updated_at = now() where id = p_team returning * into t;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'team_role', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'role', 'owner',
      'name', coalesce((select display_name from public.profiles where id = me), '?')));
end $$;

-- Duyuru yaz (sahip/yönetici); üyelere bildirim
create or replace function public.team_post(p_team uuid, p_body text, p_pin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pid uuid;
  t public.teams;
  v_body text := left(trim(coalesce(p_body, '')), 4000);
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Duyuruları sadece takım sahibi ve yöneticileri yazabilir';
  end if;
  if v_body = '' then
    raise exception 'Duyuru boş olamaz';
  end if;
  if (select count(*) from public.team_posts where team_id = p_team and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün bu takıma çok fazla duyuru yazıldı';
  end if;
  insert into public.team_posts (team_id, author, body) values (p_team, me, v_body) returning id into pid;
  if p_pin then
    update public.teams set pinned_post = pid where id = p_team;
  end if;
  select * into t from public.teams where id = p_team;
  insert into public.notifications (user_id, kind, data)
    select m.user_id, 'team_announcement', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'post', pid,
      'name', coalesce((select display_name from public.profiles where id = me), '?'), 'text', left(v_body, 200))
    from public.team_members m where m.team_id = p_team and m.user_id <> me;
  return pid;
end $$;

create or replace function public.team_post_delete(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.team_posts;
begin
  select * into p from public.team_posts where id = p_post;
  if p.id is null then
    raise exception 'Duyuru bulunamadı';
  end if;
  if p.author is distinct from auth.uid() and not public.is_team_admin(p.team_id) and not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.team_posts where id = p_post;
  delete from public.notifications where kind = 'team_announcement' and data ->> 'post' = p_post::text;
end $$;

-- Duyuruyu sabitle (p_post null: sabiti kaldır)
create or replace function public.team_pin(p_team uuid, p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri sabitleyebilir';
  end if;
  if p_post is not null and not exists (select 1 from public.team_posts where id = p_post and team_id = p_team) then
    raise exception 'Duyuru bulunamadı';
  end if;
  update public.teams set pinned_post = p_post where id = p_team;
end $$;

create or replace function public.team_comment(p_post uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.team_posts;
  cid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  select * into p from public.team_posts where id = p_post;
  if p.id is null or not public.is_team_member(p.team_id) then
    raise exception 'Duyuru bulunamadı';
  end if;
  if v_body = '' then
    raise exception 'Yorum boş olamaz';
  end if;
  if (select count(*) from public.team_post_comments where author = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Çok hızlı yorum yazıyorsun';
  end if;
  insert into public.team_post_comments (post_id, team_id, author, body) values (p_post, p.team_id, me, v_body) returning id into cid;
  return cid;
end $$;

create or replace function public.team_comment_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.team_post_comments;
begin
  select * into c from public.team_post_comments where id = p_id;
  if c.id is null then
    raise exception 'Yorum bulunamadı';
  end if;
  if c.author is distinct from auth.uid() and not public.is_team_admin(c.team_id) and not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.team_post_comments where id = p_id;
end $$;

-- Sohbet: mesaj gönder
create or replace function public.team_send(p_team uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  if v_body = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if (select count(*) from public.team_messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.team_messages (team_id, sender, body) values (p_team, me, v_body) returning id into mid;
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = me;
  return mid;
end $$;

-- Mesajı herkesten sil (kendi mesajı; sahip/yönetici her mesajı). İçerik boşaltılır, "silindi" görünür.
create or replace function public.team_message_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.team_messages;
begin
  select * into m from public.team_messages where id = p_id;
  if m.id is null then
    raise exception 'Mesaj bulunamadı';
  end if;
  if m.sender is distinct from auth.uid() and not public.is_team_admin(m.team_id) and not public.is_admin() then
    raise exception 'Sadece kendi mesajını silebilirsin';
  end if;
  update public.team_messages set deleted = true, body = '' where id = p_id;
  if m.poll_id is not null then
    update public.team_polls set ends_at = least(ends_at, now()), updated_at = now() where id = m.poll_id;
  end if;
end $$;

-- Mesajı sadece kendi görünümünden kaldır
create or replace function public.team_message_hide(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.team_messages;
begin
  select * into m from public.team_messages where id = p_id;
  if m.id is null or not public.is_team_member(m.team_id) then
    raise exception 'Mesaj bulunamadı';
  end if;
  insert into public.team_message_hidden (user_id, message_id) values (auth.uid(), p_id) on conflict do nothing;
end $$;

create or replace function public.team_chat_read(p_team uuid) returns void
language sql security definer set search_path = public as $$
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = auth.uid();
$$;

create or replace function public.team_chat_mute(p_team uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  insert into public.team_chat_state (team_id, user_id, muted) values (p_team, auth.uid(), coalesce(p_muted, false))
    on conflict (team_id, user_id) do update set muted = excluded.muted;
end $$;

-- Anket aç: sohbete anket mesajı düşer; dönüş mesaj kimliği
create or replace function public.team_poll_create(p_team uuid, p_question text, p_options text[], p_multi boolean,
  p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_q text := left(trim(coalesce(p_question, '')), 200);
  opts text[];
  pid uuid;
  mid uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  if v_q = '' then
    raise exception 'Anket sorusu boş olamaz';
  end if;
  select coalesce(array_agg(o order by i), '{}') into opts
    from (select left(trim(x), 80) as o, i from unnest(p_options) with ordinality as u(x, i)) s
    where o <> '';
  if cardinality(opts) not between 2 and 6 then
    raise exception 'Ankette 2-6 seçenek olmalı';
  end if;
  if (select count(distinct lower(o)) from unnest(opts) o) <> cardinality(opts) then
    raise exception 'Seçenekler birbirinden farklı olmalı';
  end if;
  if p_ends_at is null or p_ends_at < now() + interval '1 minute' or p_ends_at > now() + interval '30 days' then
    raise exception 'Bitiş zamanı 1 dakika ile 30 gün arasında olmalı';
  end if;
  if (select count(*) from public.team_messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.team_polls (team_id, created_by, question, options, multi, ends_at, counts)
    values (p_team, me, v_q, opts, coalesce(p_multi, false), p_ends_at, array_fill(0, array[cardinality(opts)]))
    returning id into pid;
  insert into public.team_messages (team_id, sender, body, poll_id) values (p_team, me, v_q, pid) returning id into mid;
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = me;
  return mid;
end $$;

-- Oy ver (seçimleri değiştirir; boş dizi oyu geri alır). Sayılar ankette tutulur (Realtime ile canlı).
create or replace function public.team_poll_vote(p_poll uuid, p_options int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.team_polls;
  n int;
  sel int[];
begin
  select * into p from public.team_polls where id = p_poll for update;
  if p.id is null or not public.is_team_member(p.team_id) then
    raise exception 'Anket bulunamadı';
  end if;
  if now() >= p.ends_at then
    raise exception 'Anket bitti';
  end if;
  n := cardinality(p.options);
  select coalesce(array_agg(distinct x), '{}') into sel from unnest(coalesce(p_options, '{}')) x;
  if exists (select 1 from unnest(sel) x where x < 0 or x >= n) then
    raise exception 'Geçersiz seçenek';
  end if;
  if not p.multi and cardinality(sel) > 1 then
    raise exception 'Bu ankette tek seçim yapılabilir';
  end if;
  delete from public.team_poll_votes where poll_id = p_poll and user_id = me;
  insert into public.team_poll_votes (poll_id, user_id, option) select p_poll, me, x from unnest(sel) x;
  update public.team_polls set
    counts = (select array_agg(coalesce(v.c, 0)::int order by i)
              from generate_series(0, n - 1) i
              left join (select option, count(*) as c from public.team_poll_votes where poll_id = p_poll group by option) v
                on v.option = i),
    voters = (select count(distinct user_id)::int from public.team_poll_votes where poll_id = p_poll),
    updated_at = now()
    where id = p_poll;
end $$;

-- Anketi erken bitir (açan ya da sahip/yönetici)
create or replace function public.team_poll_close(p_poll uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.team_polls;
begin
  select * into p from public.team_polls where id = p_poll;
  if p.id is null then
    raise exception 'Anket bulunamadı';
  end if;
  if p.created_by is distinct from auth.uid() and not public.is_team_admin(p.team_id) then
    raise exception 'Anketi sadece açan ya da takım yöneticileri bitirebilir';
  end if;
  update public.team_polls set ends_at = least(ends_at, now()), updated_at = now() where id = p_poll;
end $$;

-- Anketin istemciye giden hali (benim oylarımla)
create or replace function public.team_poll_json(p_poll uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'team_id', p.team_id, 'question', p.question, 'options', to_jsonb(p.options),
    'multi', p.multi, 'ends_at', p.ends_at, 'counts', to_jsonb(p.counts), 'voters', p.voters, 'created_by', p.created_by,
    'mine', coalesce((select jsonb_agg(v.option order by v.option) from public.team_poll_votes v
                      where v.poll_id = p.id and v.user_id = auth.uid()), '[]'::jsonb))
  from public.team_polls p where p.id = p_poll;
$$;

-- Sohbet geçmişi (eskiden yeniye); p_before: daha eskileri yüklemek için
create or replace function public.team_chat(p_team uuid, p_before timestamptz default null, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at) from (
      select m.created_at, jsonb_build_object('id', m.id, 'team_id', m.team_id, 'sender', m.sender,
               'sender_name', coalesce(p.display_name, '?'), 'body', m.body, 'deleted', m.deleted,
               'poll_id', m.poll_id, 'created_at', m.created_at,
               'poll', case when m.poll_id is not null and not m.deleted then public.team_poll_json(m.poll_id) end) as j
      from public.team_messages m
      left join public.profiles p on p.id = m.sender
      where m.team_id = p_team
        and (p_before is null or m.created_at < p_before)
        and not public.team_message_hidden_for(m.id)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;

-- Takımlarım (arkadaş listesindeki odalar): rol, sessiz, okunmamış, son mesaj
create or replace function public.my_teams()
returns table (team_id uuid, name text, tag text, color text, logo_path text, role text, muted boolean, unread int,
               last_body text, last_at timestamptz, last_sender text, last_poll boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.tag, t.color, t.logo_path, m.role, coalesce(s.muted, false),
         (select count(*)::int from public.team_messages x
          where x.team_id = t.id and x.created_at > coalesce(s.last_read_at, m.joined_at)
            and x.sender is distinct from auth.uid() and not x.deleted
            and not public.team_message_hidden_for(x.id)),
         lm.body, lm.created_at, lm.sender_name, coalesce(lm.is_poll, false),
         (select count(*)::int from public.team_members c where c.team_id = t.id)
  from public.team_members m
  join public.teams t on t.id = m.team_id
  left join public.team_chat_state s on s.team_id = m.team_id and s.user_id = m.user_id
  left join lateral (
    select x.body, x.created_at, coalesce(p.display_name, '?') as sender_name, x.poll_id is not null as is_poll
    from public.team_messages x left join public.profiles p on p.id = x.sender
    where x.team_id = t.id and not x.deleted and not public.team_message_hidden_for(x.id)
    order by x.created_at desc limit 1) lm on true
  where m.user_id = auth.uid()
  order by lm.created_at desc nulls last, t.name;
$$;

-- Bana gelen takım davetleri
create or replace function public.my_team_invites()
returns table (id uuid, team_id uuid, name text, tag text, color text, logo_path text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, t.id, t.name, t.tag, t.color, t.logo_path, coalesce(p.display_name, '?'), i.created_at
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.invited_by
  where i.user_id = auth.uid() and i.kind = 'invite'
  order by i.created_at desc;
$$;

-- Takım listesi / arama (herkese açık; sitede de kullanılır)
create or replace function public.teams_search(p_q text default '', p_limit int default 60)
returns table (id uuid, name text, tag text, description text, color text, logo_path text, join_mode text,
               owner_name text, member_count int, created_at timestamptz, my_role text, my_invite text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.tag, t.description, t.color, t.logo_path, t.join_mode,
         coalesce(o.display_name, '?'),
         (select count(*)::int from public.team_members c where c.team_id = t.id) as members,
         t.created_at,
         public.team_role(t.id, auth.uid()),
         (select i.kind from public.team_invites i where i.team_id = t.id and i.user_id = auth.uid())
  from public.teams t
  left join public.profiles o on o.id = t.owner
  where coalesce(trim(p_q), '') = ''
     or t.name ilike '%' || trim(p_q) || '%' or t.tag ilike '%' || trim(p_q) || '%'
  order by members desc, t.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Takım profili: bilgiler, üyeler ve roller; yöneticiye bekleyen davet/istekler; bana olan davet/istek
create or replace function public.team_profile(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t public.teams;
  r text := public.team_role(p_team, auth.uid());
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'tag', t.tag, 'description', t.description, 'color', t.color, 'logo_path', t.logo_path,
    'join_mode', t.join_mode, 'owner', t.owner, 'created_at', t.created_at,
    'owner_name', coalesce((select display_name from public.profiles where id = t.owner), '?'),
    'pinned_post', case when r is not null then t.pinned_post end,
    'my_role', r,
    'my_invite', (select jsonb_build_object('id', i.id, 'kind', i.kind) from public.team_invites i
                  where i.team_id = t.id and i.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', coalesce(p.display_name, '?'),
               'iracing_name', p.iracing_name, 'role', m.role, 'joined_at', m.joined_at)
             order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(coalesce(p.display_name, '')))
      from public.team_members m left join public.profiles p on p.id = m.user_id
      where m.team_id = t.id), '[]'::jsonb),
    'pending', case when r in ('owner', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'user_id', i.user_id, 'display_name', coalesce(p.display_name, '?'),
               'kind', i.kind, 'created_at', i.created_at) order by i.created_at desc)
      from public.team_invites i left join public.profiles p on p.id = i.user_id
      where i.team_id = t.id), '[]'::jsonb) end);
end $$;

-- Duyuru panosu (sadece üyeler): sabit duyuru önce, yorumlarla
create or replace function public.team_wall(p_team uuid, p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pin uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Duyuruları sadece takım üyeleri görebilir';
  end if;
  select pinned_post into pin from public.teams where id = p_team;
  return coalesce((
    select jsonb_agg(x.j order by x.pinned desc, x.created_at desc) from (
      select (po.id = pin) as pinned, po.created_at,
             jsonb_build_object('id', po.id, 'author', po.author, 'author_name', coalesce(a.display_name, '?'),
               'body', po.body, 'created_at', po.created_at, 'pinned', coalesce(po.id = pin, false),
               'comments', coalesce((
                 select jsonb_agg(jsonb_build_object('id', c.id, 'author', c.author, 'author_name', coalesce(ca.display_name, '?'),
                          'body', c.body, 'created_at', c.created_at) order by c.created_at)
                 from public.team_post_comments c left join public.profiles ca on ca.id = c.author
                 where c.post_id = po.id), '[]'::jsonb)) as j
      from public.team_posts po left join public.profiles a on a.id = po.author
      where po.team_id = p_team
      order by (po.id = pin) desc nulls last, po.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x), '[]'::jsonb);
end $$;

-- 5) Arkadaşa özel bildirim / ses kapatma ---------------------------------------------
alter table public.friendships add column if not exists notify_muted boolean not null default false;
alter table public.friendships add column if not exists sound_muted boolean not null default false;

create or replace function public.friend_prefs(p_user uuid, p_notify_muted boolean, p_sound_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.friendships set notify_muted = coalesce(p_notify_muted, false), sound_muted = coalesce(p_sound_muted, false)
    where user_id = auth.uid() and friend_id = p_user;
end $$;

-- Realtime: sohbet mesajları ve anket sayıları
do $$ begin
  alter publication supabase_realtime add table public.team_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.team_polls;
exception when duplicate_object then null; end $$;

-- Yetkiler -------------------------------------------------------------------
grant select on public.teams, public.team_members to anon, authenticated;
grant select on public.team_invites, public.team_posts, public.team_post_comments, public.team_polls, public.team_poll_votes,
  public.team_messages, public.team_message_hidden, public.team_chat_state to authenticated;
grant all on public.teams, public.team_members, public.team_invites, public.team_posts, public.team_post_comments,
  public.team_polls, public.team_poll_votes, public.team_messages, public.team_message_hidden, public.team_chat_state to service_role;

revoke all on function public.team_add_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_add_member(uuid, uuid) to service_role;
revoke all on function public.team_check(text, text, text, text, text) from public, anon;

revoke all on function public.team_role(uuid, uuid), public.is_team_member(uuid), public.is_team_admin(uuid),
  public.team_message_hidden_for(uuid), public.team_poll_json(uuid),
  public.team_create(text, text, text, text, text, text), public.team_update(uuid, text, text, text, text, text, text),
  public.team_delete(uuid), public.team_invite(uuid, uuid), public.team_request(uuid), public.team_respond(uuid, boolean),
  public.team_leave(uuid), public.team_kick(uuid, uuid), public.team_set_role(uuid, uuid, text), public.team_transfer(uuid, uuid),
  public.team_post(uuid, text, boolean), public.team_post_delete(uuid), public.team_pin(uuid, uuid),
  public.team_comment(uuid, text), public.team_comment_delete(uuid), public.team_send(uuid, text),
  public.team_message_delete(uuid), public.team_message_hide(uuid), public.team_chat_read(uuid),
  public.team_chat_mute(uuid, boolean), public.team_poll_create(uuid, text, text[], boolean, timestamptz),
  public.team_poll_vote(uuid, int[]), public.team_poll_close(uuid), public.team_chat(uuid, timestamptz, int),
  public.my_teams(), public.my_team_invites(), public.team_wall(uuid, int), public.friend_prefs(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.team_role(uuid, uuid), public.is_team_member(uuid), public.is_team_admin(uuid),
  public.same_team(uuid, uuid), public.team_message_hidden_for(uuid), public.team_poll_json(uuid),
  public.team_check(text, text, text, text, text),
  public.team_create(text, text, text, text, text, text), public.team_update(uuid, text, text, text, text, text, text),
  public.team_delete(uuid), public.team_invite(uuid, uuid), public.team_request(uuid), public.team_respond(uuid, boolean),
  public.team_leave(uuid), public.team_kick(uuid, uuid), public.team_set_role(uuid, uuid, text), public.team_transfer(uuid, uuid),
  public.team_post(uuid, text, boolean), public.team_post_delete(uuid), public.team_pin(uuid, uuid),
  public.team_comment(uuid, text), public.team_comment_delete(uuid), public.team_send(uuid, text),
  public.team_message_delete(uuid), public.team_message_hide(uuid), public.team_chat_read(uuid),
  public.team_chat_mute(uuid, boolean), public.team_poll_create(uuid, text, text[], boolean, timestamptz),
  public.team_poll_vote(uuid, int[]), public.team_poll_close(uuid), public.team_chat(uuid, timestamptz, int),
  public.my_teams(), public.my_team_invites(), public.team_wall(uuid, int), public.friend_prefs(uuid, boolean, boolean)
  to authenticated, service_role;
-- Herkese açık takım listesi ve profili (site, giriş yapmadan). same_team: c29'daki telemetri kuralları
-- giriş yapmamış ziyaretçi için de değerlendirir (oturum yoksa false döner).
grant execute on function public.teams_search(text, int), public.team_profile(uuid), public.same_team(uuid, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- c29: Telemetri (Garage61 benzeri tur kayıtları) ve Yarışçılar dizini.
--      1) Program canlı bir sim oturumunda tamamlanan her turu kaydeder ve giriş yapılmışsa yükler:
--         telemetry_record_lap(p_lap jsonb) → telemetry_sessions (oturum özeti) + telemetry_laps (tur özeti)
--         + driver_identities (simdeki sürücü adı/kimliği). Aynı tur iki kez gönderilirse güncellenir.
--         Tur izi (hız/gaz/fren/vites/direksiyon, ~360 nokta, gzip JSON) sadece her oturumun EN İYİ geçerli
--         turu için "telemetry" kovasında <kullanıcı>/<tur id>.json.gz olarak tutulur (kişisel en iyiler her zaman
--         bir oturumun en iyisidir). RPC, izin yüklenmesi gereken yolu (trace_path) ve artık gereksiz olan
--         eski iz yollarını (remove) döner; istemci Storage API ile yükler/siler.
--      2) Gizlilik: profiles.telemetry_public (varsayılan true, "verilerimi başkaları görebilsin").
--         Okuma: sahibi her zaman; diğerleri sahibi açık bıraktıysa ya da aynı takımdalarsa (same_team).
--         telemetry_visible(sahip) RLS'te, RPC'lerde ve kovada kullanılır.
--         same_team(a, b): burada sadece YOKSA taslak (false) olarak oluşturulur; c30 gerçek haliyle değiştirir.
--      3) Okuma RPC'leri: telemetry_overview(kullanıcı), telemetry_session_list, telemetry_session(oturum),
--         telemetry_laps_info(tur id'leri; karşılaştırma için iz yolları), telemetry_combo_laps (pist+araç için
--         izli turlar), telemetry_leaderboard (pist+araç en iyi turlar, görünür üyeler), telemetry_drivers
--         (sim başına yarışçı dizini, arama), telemetry_set_public(açık), telemetry_delete_session(oturum).
-- Sıra: c28'den sonra, c30'dan önce.
-- ---------------------------------------------------------------------------

-- 0) Profil ayarı ------------------------------------------------------------------
alter table public.profiles add column if not exists telemetry_public boolean not null default true;

-- Takım üyeliği: c30 bunu gerçek takım üyeliğiyle değiştirir. Burada sadece yoksa (c30 önce çalıştıysa
-- gerçek hali ezilmesin diye) taslak oluşturulur.
do $do$
begin
  if to_regprocedure('public.same_team(uuid, uuid)') is null then
    -- c30 bunu gerçek takım üyeliğiyle değiştirir
    create or replace function public.same_team(a uuid, b uuid) returns boolean
    language sql stable security definer set search_path = public as $f$ select false $f$;
  end if;
end $do$;
grant execute on function public.same_team(uuid, uuid) to anon, authenticated, service_role;

-- Bir üyenin telemetrisini oturumdaki kullanıcı (ya da giriş yapmamış ziyaretçi) görebilir mi
create or replace function public.telemetry_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner is not null and (
    coalesce(p_owner = auth.uid(), false)
    or coalesce((select p.telemetry_public from public.profiles p where p.id = p_owner), false)
    or (auth.uid() is not null and coalesce(public.same_team(p_owner, auth.uid()), false)));
$$;
grant execute on function public.telemetry_visible(uuid) to anon, authenticated, service_role;

-- 1) Tablolar ----------------------------------------------------------------------
create table if not exists public.telemetry_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Programın verdiği oturum kimliği (sim-başlangıç-oturum no)
  local_id text not null check (char_length(local_id) between 1 and 120),
  sim text not null check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2')),
  track_id text not null default '' check (char_length(track_id) <= 120),
  track_name text not null default '' check (char_length(track_name) <= 160),
  track_config text not null default '' check (char_length(track_config) <= 160),
  track_length_km real not null default 0,
  car_id text not null default '' check (char_length(car_id) <= 120),
  car_name text not null default '' check (char_length(car_name) <= 160),
  car_class text not null default '' check (char_length(car_class) <= 80),
  session_type text not null default 'other' check (session_type in ('practice', 'qualify', 'race', 'warmup', 'hotlap', 'other')),
  session_kind text not null default '' check (char_length(session_kind) <= 60),
  driver_name text not null default '' check (char_length(driver_name) <= 80),
  driver_id text not null default '' check (char_length(driver_id) <= 40),
  started_at timestamptz not null default now(),
  last_lap_at timestamptz not null default now(),
  laps int not null default 0,
  valid_laps int not null default 0,
  invalid_laps int not null default 0,
  best_lap real,
  best_lap_id uuid,
  incidents int not null default 0,
  distance_km real not null default 0,
  drive_time real not null default 0,
  air_temp real,
  track_temp real,
  wetness int,
  unique (user_id, local_id)
);
create index if not exists telemetry_sessions_user on public.telemetry_sessions (user_id, started_at desc);
create index if not exists telemetry_sessions_combo on public.telemetry_sessions (sim, track_id, track_config, car_id);
alter table public.telemetry_sessions enable row level security;
drop policy if exists "telemetry sessions read" on public.telemetry_sessions;
create policy "telemetry sessions read" on public.telemetry_sessions for select using (public.telemetry_visible(user_id));

create table if not exists public.telemetry_laps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.telemetry_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 140),
  -- Lider tablosu ve kişisel en iyiler için oturumdan kopya
  sim text not null,
  track_id text not null default '',
  track_config text not null default '',
  car_id text not null default '',
  lap int not null,
  lap_time real not null check (lap_time > 0 and lap_time < 3600),
  sectors real[] not null default '{}',
  valid boolean not null default true,
  pit boolean not null default false,
  off_track boolean not null default false,
  sim_invalid boolean not null default false,
  incidents int not null default 0,
  fuel_used real,
  air_temp real,
  track_temp real,
  wetness int,
  precip real,
  position int,
  class_position int,
  driven_at timestamptz not null default now(),
  -- "telemetry" kovasındaki iz (sadece oturumun en iyi turu)
  trace_path text,
  created_at timestamptz not null default now(),
  unique (user_id, local_id)
);
create index if not exists telemetry_laps_session on public.telemetry_laps (session_id, lap);
create index if not exists telemetry_laps_user_combo on public.telemetry_laps (user_id, sim, track_id, track_config, car_id, lap_time)
  where valid and not pit;
create index if not exists telemetry_laps_combo on public.telemetry_laps (sim, track_id, track_config, car_id, lap_time)
  where valid and not pit;
create index if not exists telemetry_laps_user_day on public.telemetry_laps (user_id, created_at desc);
alter table public.telemetry_laps enable row level security;
drop policy if exists "telemetry laps read" on public.telemetry_laps;
create policy "telemetry laps read" on public.telemetry_laps for select using (public.telemetry_visible(user_id));

-- Simdeki sürücü kimliği (sim başına bir satır; son görülen ad/kimlik)
create table if not exists public.driver_identities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sim text not null check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2')),
  sim_name text not null default '' check (char_length(sim_name) <= 80),
  sim_id text not null default '' check (char_length(sim_id) <= 40),
  laps int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, sim)
);
create index if not exists driver_identities_sim on public.driver_identities (sim, last_seen desc);
alter table public.driver_identities enable row level security;
drop policy if exists "driver identities read" on public.driver_identities;
create policy "driver identities read" on public.driver_identities for select using (public.telemetry_visible(user_id));

grant select on public.telemetry_sessions, public.telemetry_laps, public.driver_identities to anon, authenticated;
grant all on public.telemetry_sessions, public.telemetry_laps, public.driver_identities to service_role;

-- 2) İz kovası ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('telemetry', 'telemetry', false, 262144, array['application/gzip', 'application/json', 'application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Yol: <sahip uuid>/<tur id>.json.gz
create or replace function public.telemetry_can_read(p_path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  begin
    v_owner := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.telemetry_visible(v_owner);
end $$;
grant execute on function public.telemetry_can_read(text) to anon, authenticated, service_role;

drop policy if exists "telemetry own upload" on storage.objects;
create policy "telemetry own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'telemetry' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telemetry own update" on storage.objects;
create policy "telemetry own update" on storage.objects for update to authenticated
  using (bucket_id = 'telemetry' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telemetry read" on storage.objects;
create policy "telemetry read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'telemetry' and public.telemetry_can_read(name));
drop policy if exists "telemetry own delete" on storage.objects;
create policy "telemetry own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'telemetry' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Kayıt -------------------------------------------------------------------------
create or replace function public.telemetry_record_lap(p_lap jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_sim text := coalesce(p_lap->>'sim', '');
  v_local text := left(coalesce(p_lap->>'session_local', ''), 120);
  v_lap_local text := left(coalesce(p_lap->>'id', ''), 140);
  v_time real;
  v_valid boolean := coalesce((p_lap->>'valid')::boolean, false);
  v_pit boolean := coalesce((p_lap->>'pit')::boolean, false);
  v_has_trace boolean := coalesce((p_lap->>'has_trace')::boolean, false);
  v_type text := coalesce(p_lap->>'session_type', 'other');
  v_started timestamptz;
  v_ts timestamptz;
  v_sectors real[];
  v_sess uuid;
  v_lap uuid;
  v_new boolean;
  v_best real;
  v_path text;
  v_remove text[] := '{}';
  v_pb boolean := false;
  v_track text := left(coalesce(p_lap->>'track_id', ''), 120);
  v_config text := left(coalesce(p_lap->>'track_config', ''), 160);
  v_car text := left(coalesce(p_lap->>'car_id', ''), 120);
  v_name text := left(btrim(coalesce(p_lap->>'driver_name', '')), 80);
  v_sim_id text := left(btrim(coalesce(p_lap->>'driver_id', '')), 40);
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2') or v_local = '' or v_lap_local = '' then
    raise exception 'Geçersiz tur';
  end if;
  v_time := (p_lap->>'lap_time')::real;
  if v_time is null or v_time <= 1 or v_time >= 3600 then
    raise exception 'Geçersiz tur süresi';
  end if;
  if v_type not in ('practice', 'qualify', 'race', 'warmup', 'hotlap', 'other') then
    v_type := 'other';
  end if;
  -- Kötüye kullanım sınırı: günde en fazla 5000 tur
  if (select count(*) from public.telemetry_laps where user_id = me and created_at > now() - interval '1 day') >= 5000 then
    raise exception 'Günlük tur sınırına ulaşıldı';
  end if;
  v_started := to_timestamp(coalesce(nullif(p_lap->>'session_started', '')::bigint, 0) / 1000.0);
  v_ts := to_timestamp(coalesce(nullif(p_lap->>'ts', '')::bigint, 0) / 1000.0);
  if v_ts < now() - interval '2 years' or v_ts > now() + interval '1 day' then
    v_ts := now();
  end if;
  if v_started < now() - interval '2 years' or v_started > now() + interval '1 day' then
    v_started := v_ts;
  end if;
  select coalesce(array_agg(x::real), '{}') into v_sectors
  from (select jsonb_array_elements_text(case when jsonb_typeof(p_lap->'sectors') = 'array' then p_lap->'sectors' else '[]'::jsonb end) x limit 3) s;

  insert into public.telemetry_sessions as t (user_id, local_id, sim, track_id, track_name, track_config, track_length_km,
      car_id, car_name, car_class, session_type, session_kind, driver_name, driver_id, started_at, last_lap_at)
  values (me, v_local, v_sim, v_track, left(coalesce(p_lap->>'track_name', ''), 160), v_config,
      greatest(coalesce((p_lap->>'track_length_km')::real, 0), 0), v_car, left(coalesce(p_lap->>'car_name', ''), 160),
      left(coalesce(p_lap->>'car_class', ''), 80), v_type, left(coalesce(p_lap->>'session_kind', ''), 60),
      v_name, v_sim_id, v_started, v_ts)
  on conflict (user_id, local_id) do update
    set last_lap_at = greatest(t.last_lap_at, excluded.last_lap_at),
        driver_name = case when excluded.driver_name <> '' then excluded.driver_name else t.driver_name end,
        driver_id = case when excluded.driver_id <> '' then excluded.driver_id else t.driver_id end
  returning id into v_sess;

  insert into public.telemetry_laps as l (session_id, user_id, local_id, sim, track_id, track_config, car_id, lap, lap_time,
      sectors, valid, pit, off_track, sim_invalid, incidents, fuel_used, air_temp, track_temp, wetness, precip,
      position, class_position, driven_at)
  values (v_sess, me, v_lap_local, v_sim, v_track, v_config, v_car, coalesce((p_lap->>'lap')::int, 0), v_time,
      v_sectors, v_valid, v_pit, coalesce((p_lap->>'off_track')::boolean, false),
      coalesce((p_lap->>'sim_invalid')::boolean, false), greatest(coalesce((p_lap->>'incidents')::int, 0), 0),
      nullif((p_lap->>'fuel_used')::real, 0), (p_lap->>'air_temp')::real, (p_lap->>'track_temp')::real,
      (p_lap->>'wetness')::int, (p_lap->>'precip')::real, nullif((p_lap->>'position')::int, 0),
      nullif((p_lap->>'class_position')::int, 0), v_ts)
  on conflict (user_id, local_id) do update
    set lap_time = excluded.lap_time, sectors = excluded.sectors, valid = excluded.valid, pit = excluded.pit,
        off_track = excluded.off_track, sim_invalid = excluded.sim_invalid, incidents = excluded.incidents
  returning id, (xmax = 0) into v_lap, v_new;

  -- İz: oturumun yeni en iyi geçerli turu ise saklanır, oturumdaki eski izler silinir
  if v_valid and not v_pit then
    select min(lap_time) into v_best from public.telemetry_laps
    where session_id = v_sess and valid and not pit and id <> v_lap;
    if v_has_trace and (v_best is null or v_time < v_best
        or (v_time = v_best and not exists (select 1 from public.telemetry_laps
              where session_id = v_sess and id <> v_lap and trace_path is not null))) then
      v_path := me::text || '/' || v_lap::text || '.json.gz';
      select coalesce(array_agg(trace_path), '{}') into v_remove from public.telemetry_laps
      where session_id = v_sess and id <> v_lap and trace_path is not null;
      update public.telemetry_laps set trace_path = null
      where session_id = v_sess and id <> v_lap and trace_path is not null;
      update public.telemetry_laps set trace_path = v_path where id = v_lap;
    end if;
    v_pb := not exists (select 1 from public.telemetry_laps
      where user_id = me and sim = v_sim and track_id = v_track and track_config = v_config and car_id = v_car
        and valid and not pit and id <> v_lap and lap_time <= v_time);
  end if;

  -- Oturum özeti
  update public.telemetry_sessions s set
    laps = x.n, valid_laps = x.nv, invalid_laps = x.n - x.nv, incidents = x.inc,
    best_lap = x.best, best_lap_id = x.best_id,
    distance_km = x.n * s.track_length_km, drive_time = x.dt,
    air_temp = coalesce((p_lap->>'air_temp')::real, s.air_temp),
    track_temp = coalesce((p_lap->>'track_temp')::real, s.track_temp),
    wetness = coalesce((p_lap->>'wetness')::int, s.wetness)
  from (
    select count(*)::int n, count(*) filter (where valid)::int nv, coalesce(sum(incidents), 0)::int inc,
           min(lap_time) filter (where valid and not pit) best,
           (array_agg(id order by lap_time) filter (where valid and not pit))[1] best_id,
           coalesce(sum(lap_time), 0)::real dt
    from public.telemetry_laps where session_id = v_sess
  ) x
  where s.id = v_sess;

  -- Simdeki kimlik
  if v_name <> '' then
    insert into public.driver_identities as d (user_id, sim, sim_name, sim_id, laps)
    values (me, v_sim, v_name, v_sim_id, 1)
    on conflict (user_id, sim) do update
      set sim_name = excluded.sim_name,
          sim_id = case when excluded.sim_id <> '' then excluded.sim_id else d.sim_id end,
          last_seen = now(),
          laps = d.laps + case when v_new then 1 else 0 end;
  end if;

  return jsonb_build_object('lap_id', v_lap, 'session_id', v_sess, 'trace_path', v_path,
    'remove', to_jsonb(v_remove), 'pb', v_pb, 'new', v_new);
end $$;

-- Paylaşım ayarı
create or replace function public.telemetry_set_public(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  update public.profiles set telemetry_public = coalesce(p_on, true) where id = auth.uid();
end $$;

-- Oturumu sil (sadece sahibi): silinmesi gereken iz yollarını döner (istemci kovadan siler)
create or replace function public.telemetry_delete_session(p_session uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_paths text[];
begin
  if not exists (select 1 from public.telemetry_sessions where id = p_session and user_id = auth.uid()) then
    raise exception 'Oturum bulunamadı';
  end if;
  select coalesce(array_agg(trace_path), '{}') into v_paths from public.telemetry_laps
  where session_id = p_session and trace_path is not null;
  delete from public.telemetry_sessions where id = p_session;
  return v_paths;
end $$;

-- 4) Okuma -------------------------------------------------------------------------
-- Oturum satırı (JSON)
create or replace function public.telemetry_session_json(s public.telemetry_sessions) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', s.id, 'user_id', s.user_id, 'sim', s.sim, 'track_id', s.track_id,
    'track_name', s.track_name, 'track_config', s.track_config, 'track_length_km', s.track_length_km,
    'car_id', s.car_id, 'car_name', s.car_name, 'car_class', s.car_class, 'session_type', s.session_type,
    'session_kind', s.session_kind, 'driver_name', s.driver_name, 'started_at', s.started_at,
    'last_lap_at', s.last_lap_at, 'laps', s.laps, 'valid_laps', s.valid_laps, 'invalid_laps', s.invalid_laps,
    'best_lap', s.best_lap, 'best_lap_id', s.best_lap_id, 'incidents', s.incidents, 'distance_km', s.distance_km,
    'drive_time', s.drive_time, 'air_temp', s.air_temp, 'track_temp', s.track_temp, 'wetness', s.wetness);
$$;

-- Bir üyenin telemetri özeti (p_user boşsa kendim). Görünmüyorsa sadece profil + visible:false.
create or replace function public.telemetry_overview(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_prof jsonb;
begin
  if v_user is null then
    raise exception 'Kullanıcı yok';
  end if;
  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'telemetry_public', p.telemetry_public,
           'is_me', p.id = auth.uid(),
           'friend', (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id))
    into v_prof from public.profiles p where p.id = v_user;
  if v_prof is null then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if not public.telemetry_visible(v_user) then
    return jsonb_build_object('profile', v_prof, 'visible', false,
      'identities', (select coalesce(jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name) order by d.last_seen desc), '[]')
                     from public.driver_identities d where d.user_id = v_user));
  end if;
  return jsonb_build_object(
    'profile', v_prof,
    'visible', true,
    'totals', (select jsonb_build_object(
        'sessions', count(*), 'laps', coalesce(sum(s.laps), 0), 'valid_laps', coalesce(sum(s.valid_laps), 0),
        'incidents', coalesce(sum(s.incidents), 0), 'distance_km', round(coalesce(sum(s.distance_km), 0)::numeric, 1),
        'drive_time', round(coalesce(sum(s.drive_time), 0)::numeric), 'tracks', count(distinct (s.sim, s.track_id, s.track_config)),
        'cars', count(distinct (s.sim, s.car_id)), 'first', min(s.started_at), 'last', max(s.last_lap_at))
      from public.telemetry_sessions s where s.user_id = v_user and s.laps > 0),
    'sims', (select coalesce(jsonb_agg(jsonb_build_object('sim', x.sim, 'laps', x.laps, 'sessions', x.n) order by x.laps desc), '[]')
      from (select s.sim, sum(s.laps)::int laps, count(*)::int n from public.telemetry_sessions s
            where s.user_id = v_user and s.laps > 0 group by s.sim) x),
    'identities', (select coalesce(jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name, 'sim_id', d.sim_id,
        'laps', d.laps, 'first_seen', d.first_seen, 'last_seen', d.last_seen) order by d.last_seen desc), '[]')
      from public.driver_identities d where d.user_id = v_user),
    'bests', (select coalesce(jsonb_agg(b.j order by b.driven_at desc), '[]') from (
        select distinct on (l.sim, l.track_id, l.track_config, l.car_id)
          l.driven_at,
          jsonb_build_object('lap_id', l.id, 'session_id', l.session_id, 'sim', l.sim, 'track_id', l.track_id,
            'track_config', l.track_config, 'car_id', l.car_id, 'track_name', s.track_name, 'car_name', s.car_name,
            'car_class', s.car_class, 'lap_time', l.lap_time, 'sectors', l.sectors, 'driven_at', l.driven_at,
            'has_trace', l.trace_path is not null,
            'laps', (select count(*) from public.telemetry_laps z where z.user_id = v_user and z.sim = l.sim
                     and z.track_id = l.track_id and z.track_config = l.track_config and z.car_id = l.car_id)) j
        from public.telemetry_laps l join public.telemetry_sessions s on s.id = l.session_id
        where l.user_id = v_user and l.valid and not l.pit
        order by l.sim, l.track_id, l.track_config, l.car_id, l.lap_time, l.driven_at
      ) b),
    'recent', (select coalesce(jsonb_agg(public.telemetry_session_json(s) order by s.started_at desc), '[]')
      from (select * from public.telemetry_sessions s where s.user_id = v_user and s.laps > 0
            order by s.started_at desc limit 20) s)
  );
end $$;

-- Oturum listesi (sayfalı, isteğe bağlı sim filtresi)
create or replace function public.telemetry_session_list(p_user uuid default null, p_sim text default null,
    p_limit int default 30, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.telemetry_session_json(s) order by s.started_at desc), '[]')
  from (select * from public.telemetry_sessions s
        where s.user_id = coalesce(p_user, auth.uid()) and s.laps > 0
          and public.telemetry_visible(s.user_id)
          and (p_sim is null or p_sim = '' or s.sim = p_sim)
        order by s.started_at desc
        limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) s;
$$;

-- Oturum ayrıntısı: özet + turlar
create or replace function public.telemetry_session(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.telemetry_sessions;
begin
  select * into s from public.telemetry_sessions where id = p_session;
  if s.id is null or not public.telemetry_visible(s.user_id) then
    raise exception 'Oturum bulunamadı';
  end if;
  return jsonb_build_object(
    'session', public.telemetry_session_json(s),
    'owner', (select jsonb_build_object('id', p.id, 'display_name', p.display_name) from public.profiles p where p.id = s.user_id),
    'laps', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lap', l.lap, 'lap_time', l.lap_time,
        'sectors', l.sectors, 'valid', l.valid, 'pit', l.pit, 'off_track', l.off_track, 'sim_invalid', l.sim_invalid,
        'incidents', l.incidents, 'fuel_used', l.fuel_used, 'air_temp', l.air_temp, 'track_temp', l.track_temp,
        'wetness', l.wetness, 'position', l.position, 'class_position', l.class_position, 'driven_at', l.driven_at,
        'has_trace', l.trace_path is not null) order by l.lap, l.driven_at), '[]')
      from public.telemetry_laps l where l.session_id = s.id));
end $$;

-- Karşılaştırma: turların bilgisi ve iz yolları (en çok 4; görünmeyenler atlanır)
create or replace function public.telemetry_laps_info(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'user_id', l.user_id, 'display_name', p.display_name,
      'driver_name', s.driver_name, 'session_id', l.session_id, 'sim', l.sim, 'track_id', l.track_id,
      'track_config', l.track_config, 'track_name', s.track_name, 'track_length_km', s.track_length_km,
      'car_id', l.car_id, 'car_name', s.car_name, 'car_class', s.car_class, 'session_type', s.session_type,
      'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors, 'valid', l.valid, 'driven_at', l.driven_at,
      'trace_path', l.trace_path)), '[]')
  from public.telemetry_laps l
  join public.telemetry_sessions s on s.id = l.session_id
  join public.profiles p on p.id = l.user_id
  where l.id = any (p_ids[1:4]) and public.telemetry_visible(l.user_id);
$$;

-- Pist + araç için izi olan turlar (p_user boşsa kendim): kendi turlarımdan seçmek için
create or replace function public.telemetry_combo_laps(p_sim text, p_track_id text, p_track_config text, p_car_id text,
    p_user uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.lap_time), '[]') from (
    select l.lap_time, jsonb_build_object('id', l.id, 'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors,
        'driven_at', l.driven_at, 'session_id', l.session_id, 'session_type', s.session_type) j
    from public.telemetry_laps l join public.telemetry_sessions s on s.id = l.session_id
    where l.user_id = coalesce(p_user, auth.uid()) and public.telemetry_visible(l.user_id)
      and l.sim = p_sim and l.track_id = p_track_id and l.track_config = coalesce(p_track_config, '')
      and l.car_id = p_car_id and l.trace_path is not null and l.valid and not l.pit
    order by l.lap_time limit 50) x;
$$;

-- Lider tablosu: pist (+ isteğe bağlı araç) için her görünür üyenin en iyi geçerli turu
create or replace function public.telemetry_leaderboard(p_sim text, p_track_id text, p_track_config text default '',
    p_car_id text default null, p_limit int default 50)
returns table (rank int, user_id uuid, display_name text, sim_name text, lap_id uuid, lap_time real, sectors real[],
               car_id text, car_name text, car_class text, driven_at timestamptz, has_trace boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (l.user_id) l.*
    from public.telemetry_laps l
    where l.sim = p_sim and l.track_id = p_track_id and l.track_config = coalesce(p_track_config, '')
      and (p_car_id is null or p_car_id = '' or l.car_id = p_car_id)
      and l.valid and not l.pit and public.telemetry_visible(l.user_id)
    order by l.user_id, l.lap_time, (l.trace_path is null), l.driven_at
  )
  select (row_number() over (order by b.lap_time, b.driven_at))::int, b.user_id, p.display_name,
         coalesce(d.sim_name, s.driver_name), b.id, b.lap_time, b.sectors, b.car_id, s.car_name, s.car_class,
         b.driven_at, b.trace_path is not null, b.user_id = auth.uid()
  from best b
  join public.telemetry_sessions s on s.id = b.session_id
  join public.profiles p on p.id = b.user_id
  left join public.driver_identities d on d.user_id = b.user_id and d.sim = b.sim
  order by b.lap_time, b.driven_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Yarışçılar dizini: simde en az bir tur kaydı olan üyeler. Telemetrisi görünmeyenlerin sadece adı döner.
create or replace function public.telemetry_drivers(p_sim text default null, p_q text default '',
    p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, display_name text, sim text, sim_name text, sim_id text, visible boolean, laps int,
               tracks int, cars int, last_active timestamptz, friend text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select d.user_id, p.display_name, d.sim, d.sim_name,
         case when v.ok and d.sim = 'iracing' then nullif(d.sim_id, '') end,
         v.ok,
         case when v.ok then st.laps end,
         case when v.ok then st.tracks end,
         case when v.ok then st.cars end,
         case when v.ok then coalesce(st.last, d.last_seen) end,
         (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = d.user_id),
         d.user_id = auth.uid()
  from public.driver_identities d
  join public.profiles p on p.id = d.user_id
  cross join lateral (select public.telemetry_visible(d.user_id) ok) v
  left join lateral (
    select sum(s.laps)::int laps, count(distinct (s.track_id, s.track_config))::int tracks,
           count(distinct s.car_id)::int cars, max(s.last_lap_at) last
    from public.telemetry_sessions s where s.user_id = d.user_id and s.sim = d.sim and s.laps > 0
  ) st on true
  where (p_sim is null or p_sim = '' or d.sim = p_sim)
    and (coalesce(p_q, '') = '' or d.sim_name ilike '%' || p_q || '%' or p.display_name ilike '%' || p_q || '%')
    and exists (select 1 from public.telemetry_sessions s2 where s2.user_id = d.user_id and s2.sim = d.sim and s2.laps > 0)
  order by d.last_seen desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Yetkiler -------------------------------------------------------------------------
revoke all on function public.telemetry_record_lap(jsonb), public.telemetry_set_public(boolean),
  public.telemetry_delete_session(uuid) from public, anon;
grant execute on function public.telemetry_record_lap(jsonb), public.telemetry_set_public(boolean),
  public.telemetry_delete_session(uuid) to authenticated, service_role;
grant execute on function public.telemetry_session_json(public.telemetry_sessions),
  public.telemetry_overview(uuid), public.telemetry_session_list(uuid, text, int, int), public.telemetry_session(uuid),
  public.telemetry_laps_info(uuid[]), public.telemetry_combo_laps(text, text, text, text, uuid),
  public.telemetry_leaderboard(text, text, text, text, int), public.telemetry_drivers(text, text, int, int)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- c31: Profil fotoğrafı, herkese açık profil (kısa tanıtım + sosyal bağlantılar) ve arkadaş listesinde oyun.
--      1) Profil fotoğrafı: herkese açık "avatars" kovası, yol <kullanıcı id>/<dosya> (jpeg/png/webp, en çok 1 MB;
--         program ve site yüklemeden önce ~256 px kareye küçültür). profiles.avatar_path (yol; null = fotoğraf yok).
--         profile_set_avatar(yol | null): yolu doğrular (kendi klasörü, kovada var), eski yolu döner (istemci siler).
--         Arkadaşa özel PRO "fotoğraf" görünümü (programdaki arkadaş görünümü) varsa o önceliklidir.
--      2) Herkese açık profil: profiles.bio (en çok 300 karakter) ve profiles.socials (en çok 10 bağlantı,
--         [{type, url}], type: youtube | twitch | kick | instagram | x | tiktok | facebook | discord | steam |
--         website | other; url sadece https://, en çok 200 karakter). profile_update_public(bio, socials) doğrular,
--         temizler ve kaydeder; sütunlarda da aynı denetim (check) var.
--         public_profile(kullanıcı): ad, fotoğraf, iRacing adı, tanıtım, bağlantılar, sim adları (driver_identities),
--         takımlar, PRO, üyelik tarihi, arkadaşlık durumu. E-posta vb. gizli bilgi dönmez. Giriş yapmadan da çağrılır.
--      3) Arkadaş listesinde oyun: user_status.sim (program bağlıyken simin kimliği: iracing | acc | ac | lmu | rf2 | ams2).
--         my_friends() artık avatar_path ve sim de döner (sim sadece çevrimiçi kabul edilmiş arkadaşta dolu).
--         PRO gerekmez: canlı veri değil, sadece hangi oyunda olduğu.
-- Sıra: c30'dan sonra (c27'deki my_friends'in yerini alır; dönüş sütunları değiştiği için önce silinir).
-- ---------------------------------------------------------------------------

-- 1) Profil sütunları ----------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists socials jsonb not null default '[]'::jsonb;

-- Sosyal bağlantı türleri
create or replace function public.profile_social_types() returns text[]
language sql immutable as $$
  select array['youtube', 'twitch', 'kick', 'instagram', 'x', 'tiktok', 'facebook', 'discord', 'steam', 'website', 'other'];
$$;

-- Bağlantı listesi geçerli mi (check ve RPC kullanır)
create or replace function public.profile_socials_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then
    return false;
  end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then
      return false;
    end if;
    if jsonb_typeof(e -> 'type') is distinct from 'string'
       or jsonb_typeof(e -> 'url') is distinct from 'string'
       or not ((e ->> 'type') = any (public.profile_social_types()))
       or char_length(e ->> 'url') > 200
       or (e ->> 'url') !~ '^https://[^/[:space:]?#.][^[:space:]]*$'
       or (select count(*) from jsonb_object_keys(e)) <> 2 then
      return false;
    end if;
  end loop;
  return true;
end $$;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_socials_ok' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_socials_ok check (public.profile_socials_valid(socials));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_ok' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_avatar_path_ok
      check (avatar_path is null or (char_length(avatar_path) <= 200 and split_part(avatar_path, '/', 1) = id::text));
  end if;
end $do$;

-- 2) Fotoğraf kovası ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "avatars own upload" on storage.objects;
create policy "avatars own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars delete" on storage.objects;
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Fotoğrafı ayarla (null: kaldır). Eski yolu döner; istemci eski dosyayı Storage API ile siler.
create or replace function public.profile_set_avatar(p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_old text;
  v_path text := nullif(trim(coalesce(p_path, '')), '');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if v_path is not null then
    if char_length(v_path) > 200 or split_part(v_path, '/', 1) <> me::text or v_path ~ '\.\.' then
      raise exception 'Geçersiz fotoğraf yolu';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_path) then
      raise exception 'Fotoğraf bulunamadı; yeniden yükle';
    end if;
  end if;
  select avatar_path into v_old from public.profiles where id = me;
  update public.profiles set avatar_path = v_path where id = me;
  return case when v_old is distinct from v_path then v_old end;
end $$;

-- 3) Tanıtım ve sosyal bağlantılar -------------------------------------------------------
create or replace function public.profile_update_public(p_bio text, p_socials jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_bio text := trim(coalesce(p_bio, ''));
  v_out jsonb := '[]'::jsonb;
  e jsonb;
  v_type text;
  v_url text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'Tanıtım en çok 300 karakter olabilir';
  end if;
  if p_socials is not null and jsonb_typeof(p_socials) <> 'array' then
    raise exception 'Geçersiz bağlantı listesi';
  end if;
  if jsonb_array_length(coalesce(p_socials, '[]'::jsonb)) > 10 then
    raise exception 'En çok 10 bağlantı ekleyebilirsin';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_socials, '[]'::jsonb)) loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'Geçersiz bağlantı';
    end if;
    v_type := lower(trim(coalesce(e ->> 'type', '')));
    v_url := trim(coalesce(e ->> 'url', ''));
    if v_url = '' then
      continue; -- boş satırlar atlanır
    end if;
    if not (v_type = any (public.profile_social_types())) then
      raise exception 'Geçersiz bağlantı türü: %', v_type;
    end if;
    if char_length(v_url) > 200 then
      raise exception 'Bağlantı en çok 200 karakter olabilir';
    end if;
    if v_url !~* '^https://[^/[:space:]?#.][^[:space:]]*$' then
      raise exception 'Bağlantı https:// ile başlamalı: %', left(v_url, 60);
    end if;
    v_url := regexp_replace(v_url, '^https://', 'https://', 'i');
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', v_type, 'url', v_url));
  end loop;
  update public.profiles set bio = v_bio, socials = v_out where id = me;
  return jsonb_build_object('bio', v_bio, 'socials', v_out);
end $$;

-- 4) Herkese açık profil ------------------------------------------------------------------
create or replace function public.public_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar_path', p.avatar_path,
    'iracing_name', p.iracing_name,
    'bio', coalesce(p.bio, ''),
    'socials', coalesce(p.socials, '[]'::jsonb),
    'is_pro', coalesce(p.is_admin, false) or coalesce(p.pro_until > now(), false),
    'created_at', p.created_at,
    'is_me', auth.uid() is not null and p.id = auth.uid(),
    'friend', case when auth.uid() is not null then
      (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id) end,
    'sims', coalesce((
      select jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name) order by d.last_seen desc)
      from public.driver_identities d where d.user_id = p.id and d.sim_name <> ''), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'color', t.color,
               'logo_path', t.logo_path, 'role', m.role) order by m.joined_at)
      from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = p.id), '[]'::jsonb));
end $$;

-- 5) Arkadaş listesinde oyun -----------------------------------------------------------
alter table public.user_status add column if not exists sim text not null default '';
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_status_sim_ok' and conrelid = 'public.user_status'::regclass) then
    alter table public.user_status add constraint user_status_sim_ok
      check (sim in ('', 'iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2'));
  end if;
end $do$;

-- Arkadaş listesi (c27 + fotoğraf ve oyun). Dönüş sütunları değiştiği için önce silinir.
drop function if exists public.my_friends();
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int, avatar_path text, sim text)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         coalesce(o.trusted and o.status = 'accepted', false) and public.user_is_pro(f.friend_id),
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

-- Yetkiler -------------------------------------------------------------------------------
grant execute on function public.profile_social_types(), public.profile_socials_valid(jsonb) to anon, authenticated, service_role;
revoke all on function public.profile_set_avatar(text), public.profile_update_public(text, jsonb), public.my_friends() from public, anon;
grant execute on function public.profile_set_avatar(text), public.profile_update_public(text, jsonb), public.my_friends()
  to authenticated, service_role;
grant execute on function public.public_profile(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- c33: Demo modu vitrini: PRO üyelerin görünen adları demo yarışındaki sahte sürücüler arasında görünür.
--      1) profiles.demo_showcase (varsayılan true): "Demo modunda adım görünebilsin". Kullanıcı Hesap → PRO
--         bölümünden kapatabilir (demo_showcase_set). Kendi profilini güncelleme izni zaten var; RPC sadece kolaylık.
--      2) demo_pro_names(p_limit): herkese açık (giriş gerekmez). Aktif PRO üyelerin (pro_until > şimdi; kampanya
--         ile herkesin PRO olduğu dönemler sayılmaz) sadece görünen adlarını rastgele sırayla döner. Kimlik,
--         e-posta vb. dönmez; adı boş olanlar ve vitrini kapatanlar hariç. En fazla 100 ad.
-- Sıra: bağımsız (profiles tablosu yeterli).
-- ---------------------------------------------------------------------------

-- 1) Profil ayarı ---------------------------------------------------------------------
alter table public.profiles add column if not exists demo_showcase boolean not null default true;

create or replace function public.demo_showcase_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  update public.profiles set demo_showcase = coalesce(p_on, true) where id = auth.uid();
end;
$$;
revoke all on function public.demo_showcase_set(boolean) from public, anon;
grant execute on function public.demo_showcase_set(boolean) to authenticated, service_role;

-- 2) Demo vitrini adları ------------------------------------------------------------------
create or replace function public.demo_pro_names(p_limit int default 40) returns setof text
language sql stable security definer set search_path = public as $$
  select n from (
    select distinct trim(p.display_name) as n
    from public.profiles p
    where p.demo_showcase
      and coalesce(p.pro_until > now(), false)
      and char_length(trim(p.display_name)) between 2 and 32
  ) x
  order by random()
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;
revoke all on function public.demo_pro_names(int) from public;
grant execute on function public.demo_pro_names(int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- c34: İndirim kuponları. Yönetici yönetim panelinden kupon oluşturur (ör. "ERKIN" → %5 indirim):
--      kod (büyük/küçük harf duyarsız, tekil), yüzde (1-90), başlangıç (isteğe bağlı) ve bitiş zamanı (boşsa süresiz),
--      geçerli paketler: PRO planları (1m, 3m, 6m, 12m), hediye PRO'da geçerli mi, reklam paketleri
--      (impressions: gösterim paketi, days: süre), toplam kullanım sınırı (isteğe bağlı), kişi başı sınır (varsayılan 1),
--      etkin/kapalı, not.
--      Kullanıcı PRO / hediye PRO / reklam satın alırken kodu girer; coupon_check indirimli fiyatı gösterir.
--      pro-checkout ve ads-checkout kuponu sunucuda yeniden doğrular (coupon_validate), indirimli tutarı
--      custom_price olarak gönderir ve indirimi Lemon ödeme sayfasında ürün adı/açıklamasında gösterir.
--      Ödeme gelince pro-webhook kullanımı coupon_redemptions'a yazar (coupon_redeem; aynı sipariş/abonelik bir kez).
--      PRO aboneliğinde Lemon custom_price yenilemelerde de kullanıldığı için indirim o aboneliğin yenilemelerinde de sürer
--      (kullanım ise abonelik başına bir kez sayılır).
--      Yönetici RPC'leri: coupon_admin_list, coupon_admin_save, coupon_admin_set_active, coupon_admin_delete
--      (sadece hiç kullanılmamış kupon silinir), coupon_admin_redemptions. Hepsi mod_log'a yazılır.
-- Sıra: c26'dan sonra (bağımsızdır; mevcut fonksiyonları değiştirmez).
-- ---------------------------------------------------------------------------

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Za-z0-9_-]{2,32}$'),
  percent int not null check (percent between 1 and 90),
  valid_from timestamptz,
  valid_until timestamptz,
  pro_plans text[] not null default '{}' check (pro_plans <@ array['1m', '3m', '6m', '12m']::text[]),
  pro_gift boolean not null default false,
  ad_models text[] not null default '{}' check (ad_models <@ array['impressions', 'days']::text[]),
  max_uses int check (max_uses is null or max_uses > 0),
  max_uses_per_user int default 1 check (max_uses_per_user is null or max_uses_per_user > 0),
  active boolean not null default true,
  note text not null default '' check (char_length(note) <= 500),
  uses int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists coupons_code_key on public.coupons (upper(code));
alter table public.coupons enable row level security;
-- Politika yok: okuma/yazma sadece aşağıdaki security definer fonksiyonlarıyla

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  ref text not null unique,
  product text not null default '' check (product in ('', 'pro', 'gift', 'ad')),
  plan text not null default '',
  amount_before numeric not null default 0,
  amount_after numeric not null default 0,
  currency text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_user on public.coupon_redemptions (coupon_id, user_id);
alter table public.coupon_redemptions enable row level security;

-- Kupon durumu: active | scheduled (henüz başlamadı) | expired | inactive | exhausted
create or replace function public.coupon_state(c public.coupons) returns text
language sql stable set search_path = public as $$
  select case
    when not c.active then 'inactive'
    when c.valid_until is not null and c.valid_until <= now() then 'expired'
    when c.max_uses is not null and c.uses >= c.max_uses then 'exhausted'
    when c.valid_from is not null and c.valid_from > now() then 'scheduled'
    else 'active' end;
$$;

-- İndirimli tutar (sunucu ve istemci aynı kuralı kullanır: 2 haneye yuvarlanır)
create or replace function public.coupon_apply(p_price numeric, p_percent int) returns numeric
language sql immutable as $$
  select round(p_price * (100 - p_percent) / 100.0, 2);
$$;

-- Kodu doğrular; geçersizse Türkçe hata. p_product: pro | gift | ad. p_plan: PRO planı ya da reklam modeli
-- (boşsa o üründe en az bir paket için geçerli olması yeter). p_user: kişi başı sınır için (ödeyen).
create or replace function public.coupon_find(p_code text, p_user uuid, p_product text, p_plan text)
returns public.coupons language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons;
  n int;
  pl text := nullif(btrim(coalesce(p_plan, '')), '');
begin
  select * into c from public.coupons where upper(code) = upper(btrim(coalesce(p_code, '')));
  if c.id is null then
    raise exception 'Kupon bulunamadı';
  end if;
  if not c.active then
    raise exception 'Bu kupon artık geçerli değil';
  end if;
  if c.valid_until is not null and c.valid_until <= now() then
    raise exception 'Kuponun süresi dolmuş';
  end if;
  if c.valid_from is not null and c.valid_from > now() then
    raise exception 'Kupon henüz geçerli değil';
  end if;
  if p_product = 'pro' then
    if (pl is null and cardinality(c.pro_plans) = 0) or (pl is not null and not pl = any (c.pro_plans)) then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
  elsif p_product = 'gift' then
    if not c.pro_gift or (pl is null and cardinality(c.pro_plans) = 0) or (pl is not null and not pl = any (c.pro_plans)) then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
  elsif p_product = 'ad' then
    if (pl is null and cardinality(c.ad_models) = 0) or (pl is not null and not pl = any (c.ad_models)) then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
  else
    raise exception 'Kupon bu pakette geçersiz';
  end if;
  if c.max_uses is not null and (select count(*) from public.coupon_redemptions where coupon_id = c.id) >= c.max_uses then
    raise exception 'Kuponun kullanım limiti doldu';
  end if;
  if p_user is not null and c.max_uses_per_user is not null then
    select count(*) into n from public.coupon_redemptions where coupon_id = c.id and user_id = p_user;
    if n >= c.max_uses_per_user then
      raise exception 'Bu kuponu kullanım hakkın doldu';
    end if;
  end if;
  return c;
end $$;
revoke all on function public.coupon_find(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.coupon_find(text, uuid, text, text) to service_role;

-- Ödeme fonksiyonları (pro-checkout, ads-checkout) için: {id, code, percent}
create or replace function public.coupon_validate(p_code text, p_user uuid, p_product text, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons := public.coupon_find(p_code, p_user, p_product, p_plan);
begin
  return jsonb_build_object('id', c.id, 'code', upper(c.code), 'percent', c.percent);
end $$;
revoke all on function public.coupon_validate(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.coupon_validate(text, uuid, text, text) to service_role;

-- Kullanıcı "Uygula": indirimi ve fiyatları döndürür (gösterim için; ödeme fonksiyonu yeniden doğrular).
-- PRO / hediye (p_product pro | gift): p_plan boşsa kuponun geçtiği tüm planlar
--   {"plans": {"12m": {"price": 499, "discounted": 474.05, "currency": "TRY"}, ...}}
-- Reklam (p_product ad): p_plan = model (impressions | days); p_placement + p_qty verilirse price / discounted.
create or replace function public.coupon_check(
  p_code text, p_product text, p_plan text default null, p_region text default 'intl',
  p_placement text default null, p_qty int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.coupons;
  pr jsonb;
  plans jsonb := '{}'::jsonb;
  k text;
  price numeric;
  cur text;
  q jsonb;
  res jsonb;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  c := public.coupon_find(p_code, me, p_product, p_plan);
  res := jsonb_build_object('id', c.id, 'code', upper(c.code), 'percent', c.percent,
    'pro_plans', to_jsonb(c.pro_plans), 'pro_gift', c.pro_gift, 'ad_models', to_jsonb(c.ad_models),
    'valid_until', c.valid_until);
  if p_product in ('pro', 'gift') then
    pr := coalesce((select pro_pricing from public.app_config where id = 1), '{}'::jsonb);
    foreach k in array c.pro_plans loop
      continue when nullif(p_plan, '') is not null and k <> p_plan;
      -- pro-checkout ile aynı kural: Türkiye fiyatı girildiyse Türkiye'dekilere o
      if p_region = 'tr' and coalesce((pr -> 'plans' -> k ->> 'price_tr')::numeric, 0) > 0 then
        price := (pr -> 'plans' -> k ->> 'price_tr')::numeric;
        cur := upper(coalesce(nullif(pr ->> 'currency_tr', ''), 'TRY'));
      else
        price := coalesce((pr -> 'plans' -> k ->> 'price')::numeric, 0);
        cur := upper(coalesce(nullif(pr ->> 'currency', ''), 'USD'));
      end if;
      continue when price <= 0;
      plans := plans || jsonb_build_object(k, jsonb_build_object('price', price, 'discounted', public.coupon_apply(price, c.percent), 'currency', cur));
    end loop;
    if plans = '{}'::jsonb then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
    res := res || jsonb_build_object('plans', plans);
  elsif p_product = 'ad' and p_placement is not null and p_qty is not null and nullif(p_plan, '') is not null then
    q := public.ad_price(p_placement, p_plan, p_qty, coalesce(p_region, 'intl'));
    res := res || jsonb_build_object('price', (q ->> 'price')::numeric,
      'discounted', public.coupon_apply((q ->> 'price')::numeric, c.percent), 'currency', q ->> 'currency');
  end if;
  return res;
end $$;
revoke all on function public.coupon_check(text, text, text, text, text, int) from public, anon;
grant execute on function public.coupon_check(text, text, text, text, text, int) to authenticated, service_role;

-- Ödeme gelince (pro-webhook): kullanım kaydı. Aynı ref (abonelik / sipariş) bir kez sayılır.
create or replace function public.coupon_redeem(
  p_coupon uuid, p_user uuid, p_ref text, p_product text, p_plan text, p_before numeric, p_after numeric, p_currency text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := p_user;
  rid uuid;
begin
  if not exists (select 1 from public.coupons where id = p_coupon) then
    return false;
  end if;
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  insert into public.coupon_redemptions (coupon_id, user_id, ref, product, plan, amount_before, amount_after, currency)
    values (p_coupon, uid, p_ref, case when p_product in ('pro', 'gift', 'ad') then p_product else '' end,
            coalesce(p_plan, ''), coalesce(p_before, 0), coalesce(p_after, 0), upper(coalesce(p_currency, '')))
    on conflict (ref) do nothing
    returning id into rid;
  if rid is not null then
    update public.coupons set uses = (select count(*) from public.coupon_redemptions where coupon_id = p_coupon) where id = p_coupon;
  end if;
  return rid is not null;
end $$;
revoke all on function public.coupon_redeem(uuid, uuid, text, text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.coupon_redeem(uuid, uuid, text, text, text, numeric, numeric, text) to service_role;

-- Yönetici: tüm kuponlar, durum, kullanım ve verilen toplam indirim (para birimi başına)
create or replace function public.coupon_admin_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'state', public.coupon_state(c),
        'creator_name', coalesce((select display_name from public.profiles where id = c.created_by), ''),
        'discount', coalesce((
          select jsonb_object_agg(x.currency, x.total) from (
            select r.currency, round(sum(r.amount_before - r.amount_after), 2) as total
              from public.coupon_redemptions r where r.coupon_id = c.id group by r.currency) x), '{}'::jsonb))
      order by c.created_at desc)
    from public.coupons c), '[]'::jsonb);
end $$;
revoke all on function public.coupon_admin_list() from public, anon;
grant execute on function public.coupon_admin_list() to authenticated;

-- Yönetici: oluştur (p_id boş) ya da düzenle. Süresi dolmuş kupon tarihleri güncellenerek yeniden açılabilir.
create or replace function public.coupon_admin_save(
  p_id uuid, p_code text, p_percent int, p_valid_from timestamptz, p_valid_until timestamptz,
  p_pro_plans text[], p_pro_gift boolean, p_ad_models text[], p_max_uses int, p_max_per_user int,
  p_active boolean, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cd text := upper(btrim(coalesce(p_code, '')));
  old public.coupons;
  rid uuid;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if cd !~ '^[A-Z0-9_-]{2,32}$' then
    raise exception 'Kod 2-32 karakter olmalı (harf, rakam, - ve _)';
  end if;
  if p_percent is null or p_percent not between 1 and 90 then
    raise exception 'İndirim %%1 ile %%90 arasında olmalı';
  end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until <= p_valid_from then
    raise exception 'Bitiş zamanı başlangıçtan sonra olmalı';
  end if;
  if not coalesce(p_pro_plans, '{}') <@ array['1m', '3m', '6m', '12m']::text[]
     or not coalesce(p_ad_models, '{}') <@ array['impressions', 'days']::text[] then
    raise exception 'Geçersiz paket seçimi';
  end if;
  if cardinality(coalesce(p_pro_plans, '{}')) = 0 and cardinality(coalesce(p_ad_models, '{}')) = 0 then
    raise exception 'En az bir paket seç';
  end if;
  if exists (select 1 from public.coupons where upper(code) = cd and id is distinct from p_id) then
    raise exception 'Bu kod zaten var';
  end if;
  if p_id is null then
    insert into public.coupons (code, percent, valid_from, valid_until, pro_plans, pro_gift, ad_models, max_uses,
                                max_uses_per_user, active, note, created_by)
      values (cd, p_percent, p_valid_from, p_valid_until, coalesce(p_pro_plans, '{}'), coalesce(p_pro_gift, false),
              coalesce(p_ad_models, '{}'), nullif(p_max_uses, 0), nullif(p_max_per_user, 0), coalesce(p_active, true),
              left(btrim(coalesce(p_note, '')), 500), auth.uid())
      returning id into rid;
    perform public.log_mod('coupon_create', 'coupon', rid::text, null, jsonb_build_object('code', cd, 'percent', p_percent));
  else
    select * into old from public.coupons where id = p_id;
    if old.id is null then
      raise exception 'Kupon bulunamadı';
    end if;
    if upper(old.code) <> cd and old.uses > 0 then
      raise exception 'Kullanılmış kuponun kodu değiştirilemez';
    end if;
    update public.coupons set code = cd, percent = p_percent, valid_from = p_valid_from, valid_until = p_valid_until,
        pro_plans = coalesce(p_pro_plans, '{}'), pro_gift = coalesce(p_pro_gift, false), ad_models = coalesce(p_ad_models, '{}'),
        max_uses = nullif(p_max_uses, 0), max_uses_per_user = nullif(p_max_per_user, 0), active = coalesce(p_active, true),
        note = left(btrim(coalesce(p_note, '')), 500), updated_at = now()
      where id = p_id
      returning id into rid;
    perform public.log_mod('coupon_update', 'coupon', rid::text, null,
      jsonb_build_object('code', cd, 'percent', p_percent, 'old_code', old.code, 'old_percent', old.percent,
                         'valid_until', p_valid_until, 'active', coalesce(p_active, true)));
  end if;
  return rid;
end $$;
revoke all on function public.coupon_admin_save(uuid, text, int, timestamptz, timestamptz, text[], boolean, text[], int, int, boolean, text) from public, anon;
grant execute on function public.coupon_admin_save(uuid, text, int, timestamptz, timestamptz, text[], boolean, text[], int, int, boolean, text) to authenticated;

-- Yönetici: kapat / yeniden aç
create or replace function public.coupon_admin_set_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.coupons;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  update public.coupons set active = coalesce(p_active, false), updated_at = now() where id = p_id returning * into c;
  if c.id is null then
    raise exception 'Kupon bulunamadı';
  end if;
  perform public.log_mod(case when c.active then 'coupon_activate' else 'coupon_deactivate' end, 'coupon', c.id::text, null,
    jsonb_build_object('code', c.code));
end $$;
revoke all on function public.coupon_admin_set_active(uuid, boolean) from public, anon;
grant execute on function public.coupon_admin_set_active(uuid, boolean) to authenticated;

-- Yönetici: sil (sadece hiç kullanılmamışsa)
create or replace function public.coupon_admin_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.coupons;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into c from public.coupons where id = p_id;
  if c.id is null then
    raise exception 'Kupon bulunamadı';
  end if;
  if exists (select 1 from public.coupon_redemptions where coupon_id = p_id) then
    raise exception 'Kullanılmış kupon silinemez; kapatabilirsin';
  end if;
  delete from public.coupons where id = p_id;
  perform public.log_mod('coupon_delete', 'coupon', p_id::text, null, jsonb_build_object('code', c.code, 'percent', c.percent));
end $$;
revoke all on function public.coupon_admin_delete(uuid) from public, anon;
grant execute on function public.coupon_admin_delete(uuid) to authenticated;

-- Yönetici: bir kuponun kullanımları (en yeni önce, en fazla 500)
create or replace function public.coupon_admin_redemptions(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select r.id, r.user_id, coalesce(p.display_name, '') as user_name, r.ref, r.product, r.plan,
             r.amount_before, r.amount_after, r.currency, r.created_at
        from public.coupon_redemptions r left join public.profiles p on p.id = r.user_id
        where r.coupon_id = p_id order by r.created_at desc limit 500) x), '[]'::jsonb);
end $$;
revoke all on function public.coupon_admin_redemptions(uuid) from public, anon;
grant execute on function public.coupon_admin_redemptions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- c35: E-posta bildirim tercihleri ve takım bildirim e-postaları.
--      1) profiles.email_prefs (jsonb, varsayılan {}): kategori → true/false. Anahtar yoksa varsayılan geçerli.
--         Kategoriler (kullanıcının açıp kapatabildiği e-postalar):
--           friends  Arkadaşlık istekleri (friend_request)                                  varsayılan AÇIK
--           teams    Takım bildirimleri: davet, katılma isteği, kabul, duyuru, yöneticilik
--                    (team_invite, team_request, team_accepted, team_announcement, team_role) varsayılan KAPALI
--           support  Destek talebine yanıt (support_reply)                                 varsayılan AÇIK
--           ads      Reklam durumu: yayında / reddedildi-durduruldu / bitti
--                    (ad_live, ad_rejected, ad_ended)                                       varsayılan AÇIK
--           pro      PRO bitiş hatırlatmaları (pro_expiring: 10 gün ve son gün)              varsayılan AÇIK
--           shots    6 ay açılmadığı için silinen ekran görüntüleri (pitwall-jobs cleanup)  varsayılan AÇIK
--         Her zaman gönderilen (işlem/hesap/güvenlik) e-postalar kapatılamaz: ödeme makbuzu ve iade (payment_receipt),
--         hediye PRO (pro_gift, pro_gift_sent, pro_gift_ended), yöneticinin PRO süresini değiştirmesi (pro_changed),
--         giriş/şifre kodları (Supabase Auth). Yönetici e-postaları (rapor, destek, reklam onayı, ödeme, cihaz,
--         mesaj raporu) bu tercihlerden etkilenmez. Özel mesajlar için e-posta yoktur.
--      2) email_pref_on(kullanıcı, kategori), email_kind_category(bildirim türü), my_email_prefs() (tüm kategoriler,
--         varsayılanlar uygulanmış) ve email_prefs_set(jsonb) (sadece bilinen anahtarlar, sadece true/false; birleştirir).
--      3) Takım bildirimleri artık e-posta da gönderir (pitwall-jobs → teamMail, 15 dil), tercih açıksa.
--         Taşkın önleme (email_throttle): team_announcement aynı kişiye aynı takımdan saatte en fazla bir e-posta;
--         team_request (sahip/yöneticilere) aynı takımdan kişi başına 30 dakikada en fazla bir e-posta.
--      4) friend_request_mail() (c27'deki türler + takım türleri): tercihi ve sınırı tetikleyicide denetler,
--         uygun değilse pitwall-jobs hiç çağrılmaz. pitwall-jobs de göndermeden önce tercihi yeniden denetler
--         (temizlik e-postası tetikleyiciden geçmediği için).
-- Sıra: c30'dan sonra, sonra pitwall-jobs fonksiyonu.
-- ---------------------------------------------------------------------------

-- 1) Tercih sütunu ------------------------------------------------------------------
alter table public.profiles add column if not exists email_prefs jsonb not null default '{}'::jsonb;

-- Kategori varsayılanı: takım e-postaları kapalı, diğerleri açık
create or replace function public.email_pref_default(p_cat text) returns boolean
language sql immutable set search_path = public as $$
  select p_cat is distinct from 'teams';
$$;

-- Bildirim türünün tercih kategorisi (null: her zaman gönderilir ya da yönetici e-postası)
create or replace function public.email_kind_category(p_kind text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_kind = 'friend_request' then 'friends'
    when p_kind in ('team_invite', 'team_request', 'team_accepted', 'team_announcement', 'team_role') then 'teams'
    when p_kind = 'support_reply' then 'support'
    when p_kind in ('ad_live', 'ad_rejected', 'ad_ended') then 'ads'
    when p_kind = 'pro_expiring' then 'pro'
    when p_kind = 'shot_expired' then 'shots'
    else null
  end;
$$;

-- Kişi bu kategorideki e-postaları almak istiyor mu (anahtar yoksa / geçersizse varsayılan)
create or replace function public.email_pref_on(p_user uuid, p_cat text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when jsonb_typeof(p.email_prefs -> p_cat) = 'boolean' then (p.email_prefs ->> p_cat)::boolean end
     from public.profiles p where p.id = p_user),
    public.email_pref_default(p_cat));
$$;

-- Oturumdaki kullanıcının tercihleri (tüm kategoriler, varsayılanlar uygulanmış)
create or replace function public.my_email_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(c, public.email_pref_on(auth.uid(), c))
  from unnest(array['friends', 'teams', 'support', 'ads', 'pro', 'shots']) as c;
$$;

-- Tercihleri değiştir: {"teams": true, "ads": false} gibi; sadece bilinen anahtarlar ve true/false
create or replace function public.email_prefs_set(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'Geçersiz tercih';
  end if;
  for k, v in select * from jsonb_each(p_prefs) loop
    if k not in ('friends', 'teams', 'support', 'ads', 'pro', 'shots') then
      raise exception 'Bilinmeyen e-posta tercihi: %', k;
    end if;
    if jsonb_typeof(v) <> 'boolean' then
      raise exception 'Geçersiz değer: %', k;
    end if;
  end loop;
  update public.profiles
    set email_prefs = (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      from jsonb_each(coalesce(email_prefs, '{}'::jsonb) || p_prefs) e
      where e.key in ('friends', 'teams', 'support', 'ads', 'pro', 'shots') and jsonb_typeof(e.value) = 'boolean')
    where id = auth.uid();
  return public.my_email_prefs();
end $$;

revoke all on function public.email_pref_on(uuid, text), public.my_email_prefs(), public.email_prefs_set(jsonb)
  from public, anon;
revoke all on function public.email_pref_on(uuid, text) from authenticated;
grant execute on function public.my_email_prefs(), public.email_prefs_set(jsonb) to authenticated;
grant execute on function public.email_pref_on(uuid, text) to service_role;
grant execute on function public.email_pref_default(text), public.email_kind_category(text) to authenticated, service_role;

-- 2) Taşkın önleme ------------------------------------------------------------------
create table if not exists public.email_throttle (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  last_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.email_throttle enable row level security;
-- (politika yok: sadece sunucu / security definer fonksiyonlar erişir)
grant all on public.email_throttle to service_role;

-- Bu anahtar için son e-postadan bu yana p_gap geçtiyse true döner ve zamanı kaydeder
create or replace function public.email_throttle_ok(p_user uuid, p_key text, p_gap interval) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  insert into public.email_throttle as t (user_id, key, last_at) values (p_user, p_key, now())
  on conflict (user_id, key) do update set last_at = now()
    where t.last_at < now() - p_gap
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.email_throttle_ok(uuid, text, interval) from public, anon, authenticated;

-- Eski kayıtları temizle (bir günden eski sınır kayıtlarının işi bitti)
delete from public.email_throttle where last_at < now() - interval '1 day';

-- 3) Bildirimden e-posta (c27'deki türler + takım türleri; kullanıcı tercihleri ve taşkın sınırı) ----------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cat text;
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended',
                  'message_reported',
                  'team_invite', 'team_request', 'team_accepted', 'team_announcement', 'team_role') then
    cat := public.email_kind_category(new.kind);
    if cat is not null and not public.email_pref_on(new.user_id, cat) then
      return null;
    end if;
    if new.kind = 'team_announcement'
       and not public.email_throttle_ok(new.user_id, 'team_announcement:' || coalesce(new.data ->> 'team', ''), interval '1 hour') then
      return null;
    end if;
    if new.kind = 'team_request'
       and not public.email_throttle_ok(new.user_id, 'team_request:' || coalesce(new.data ->> 'team', ''), interval '30 minutes') then
      return null;
    end if;
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

drop trigger if exists friend_request_mail on public.notifications;
create trigger friend_request_mail after insert on public.notifications
  for each row execute function public.friend_request_mail();

-- ---------------------------------------------------------------------------
-- c36: Takımın oyunu (sim) ve takım sayfasında "Son aktiviteler".
--      1) teams.sim: takımın hangi oyun için kurulduğu (iracing | acc | ac | lmu | rf2 | ams2 | multi = birden fazla oyun).
--         Varsayılan iracing; eski takımlar iracing olur. Kurarken seçilir, takım ayarlarından değiştirilir.
--         team_create / team_update sona p_sim parametresi alır (eski imzalar kaldırılıp yenileri oluşturulur):
--           team_create(..., p_sim default 'iracing'), team_update(..., p_sim default null = değiştirme).
--         teams_search sim döner ve isteğe bağlı p_sim süzgeci alır (dönüş tipi değiştiği için düşürülüp yeniden kurulur).
--         team_profile sim döner.
--      2) team_activity(takım, adet): takım üyelerinin son telemetri oturumları (akış). Herkes çağırabilir ama sadece
--         telemetrisi çağırana görünen (telemetry_visible: kendisi, telemetrisi açık olan ya da aynı takımdaki) üyeler
--         listelenir; takım üyeleri birbirini her zaman görür. Takımın oyunu 'multi' değilse sadece o oyunun oturumları.
--         Her satır: üye adı + fotoğraf yolu, sim, pist/düzen, araç, oturum türü, tur sayısı, en iyi tur, zamanlar,
--         oturum id ve kişisel en iyi (is_pb: oturumun en iyi turu üyenin o pist+araç için en iyisi).
-- Sıra: c29, c30 ve c31'den sonra.
-- ---------------------------------------------------------------------------

-- 1) Takımın oyunu ------------------------------------------------------------------
alter table public.teams add column if not exists sim text not null default 'iracing';
update public.teams set sim = 'iracing' where sim is null or sim = '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_sim_check' and conrelid = 'public.teams'::regclass) then
    alter table public.teams add constraint teams_sim_check check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi'));
  end if;
end $$;
create index if not exists teams_sim on public.teams (sim);

drop function if exists public.team_create(text, text, text, text, text, text);
create or replace function public.team_create(p_name text, p_tag text, p_description text default '',
  p_color text default '#4ea1ff', p_logo text default '', p_join_mode text default 'request', p_sim text default 'iracing') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
  v_sim text := coalesce(nullif(trim(p_sim), ''), 'iracing');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi') then
    raise exception 'Geçersiz oyun';
  end if;
  if (select count(*) from public.teams where owner = me) >= 3 then
    raise exception 'En fazla 3 takım kurabilirsin';
  end if;
  if (select count(*) from public.team_members where user_id = me) >= 10 then
    raise exception 'En fazla 10 takımda olabilirsin';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name)) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  insert into public.teams (name, tag, description, color, logo_path, join_mode, owner, sim)
    values (v_name, v_tag, left(trim(coalesce(p_description, '')), 1000), p_color, coalesce(p_logo, ''), p_join_mode, me, v_sim)
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.team_chat_state (team_id, user_id) values (tid, me);
  return tid;
end $$;

drop function if exists public.team_update(uuid, text, text, text, text, text, text);
create or replace function public.team_update(p_team uuid, p_name text, p_tag text, p_description text,
  p_color text, p_logo text, p_join_mode text, p_sim text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
  v_sim text := nullif(trim(coalesce(p_sim, '')), '');
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri düzenleyebilir';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if v_sim is not null and v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi') then
    raise exception 'Geçersiz oyun';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name) and id <> p_team) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag and id <> p_team) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  -- p_sim verilmezse (eski programlar) oyun değişmez
  update public.teams set name = v_name, tag = v_tag, description = left(trim(coalesce(p_description, '')), 1000),
    color = p_color, logo_path = coalesce(p_logo, ''), join_mode = p_join_mode, sim = coalesce(v_sim, sim), updated_at = now()
    where id = p_team;
end $$;

-- Takım listesi / arama (herkese açık): sim döner, p_sim ile süzülür ('' ya da null = hepsi)
drop function if exists public.teams_search(text, int);
drop function if exists public.teams_search(text, int, text);
create or replace function public.teams_search(p_q text default '', p_limit int default 60, p_sim text default '')
returns table (id uuid, name text, tag text, description text, color text, logo_path text, join_mode text,
               owner_name text, member_count int, created_at timestamptz, my_role text, my_invite text, sim text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.tag, t.description, t.color, t.logo_path, t.join_mode,
         coalesce(o.display_name, '?'),
         (select count(*)::int from public.team_members c where c.team_id = t.id) as members,
         t.created_at,
         public.team_role(t.id, auth.uid()),
         (select i.kind from public.team_invites i where i.team_id = t.id and i.user_id = auth.uid()),
         t.sim
  from public.teams t
  left join public.profiles o on o.id = t.owner
  where (coalesce(trim(p_q), '') = ''
         or t.name ilike '%' || trim(p_q) || '%' or t.tag ilike '%' || trim(p_q) || '%')
    and (coalesce(trim(p_sim), '') = '' or t.sim = trim(p_sim))
  order by members desc, t.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Takım profili: c30'daki hali + sim
create or replace function public.team_profile(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t public.teams;
  r text := public.team_role(p_team, auth.uid());
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'tag', t.tag, 'description', t.description, 'color', t.color, 'logo_path', t.logo_path,
    'join_mode', t.join_mode, 'owner', t.owner, 'created_at', t.created_at, 'sim', t.sim,
    'owner_name', coalesce((select display_name from public.profiles where id = t.owner), '?'),
    'pinned_post', case when r is not null then t.pinned_post end,
    'my_role', r,
    'my_invite', (select jsonb_build_object('id', i.id, 'kind', i.kind) from public.team_invites i
                  where i.team_id = t.id and i.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', coalesce(p.display_name, '?'),
               'iracing_name', p.iracing_name, 'role', m.role, 'joined_at', m.joined_at)
             order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(coalesce(p.display_name, '')))
      from public.team_members m left join public.profiles p on p.id = m.user_id
      where m.team_id = t.id), '[]'::jsonb),
    'pending', case when r in ('owner', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'user_id', i.user_id, 'display_name', coalesce(p.display_name, '?'),
               'kind', i.kind, 'created_at', i.created_at) order by i.created_at desc)
      from public.team_invites i left join public.profiles p on p.id = i.user_id
      where i.team_id = t.id), '[]'::jsonb) end);
end $$;

-- 2) Son aktiviteler ------------------------------------------------------------------
create or replace function public.team_activity(p_team uuid, p_limit int default 30)
returns table (session_id uuid, user_id uuid, display_name text, avatar_path text, sim text, track_name text,
               track_config text, car_name text, session_type text, laps int, best_lap real,
               started_at timestamptz, last_lap_at timestamptz, is_pb boolean)
language sql stable security definer set search_path = public as $$
  with tm as (
    select t.sim from public.teams t where t.id = p_team
  ),
  mem as (
    -- Sadece telemetrisi çağırana görünen üyeler (takım arkadaşları birbirini her zaman görür)
    select m.user_id from public.team_members m
    where m.team_id = p_team and public.telemetry_visible(m.user_id)
  ),
  ss as (
    select s.* from public.telemetry_sessions s
    join mem on mem.user_id = s.user_id
    cross join tm
    where s.laps > 0 and (tm.sim = 'multi' or s.sim = tm.sim)
    order by s.last_lap_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select ss.id, ss.user_id, coalesce(p.display_name, '?'), p.avatar_path, ss.sim, ss.track_name, ss.track_config,
         ss.car_name, ss.session_type, ss.laps, ss.best_lap, ss.started_at, ss.last_lap_at,
         coalesce(ss.best_lap is not null and ss.best_lap <= (
           select min(l.lap_time) from public.telemetry_laps l
           where l.user_id = ss.user_id and l.sim = ss.sim and l.track_id = ss.track_id
             and l.track_config = ss.track_config and l.car_id = ss.car_id and l.valid and not l.pit), false)
  from ss
  left join public.profiles p on p.id = ss.user_id
  order by ss.last_lap_at desc;
$$;

-- Yetkiler -----------------------------------------------------------------------------
revoke all on function public.team_create(text, text, text, text, text, text, text),
  public.team_update(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.team_create(text, text, text, text, text, text, text),
  public.team_update(uuid, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.teams_search(text, int, text), public.team_profile(uuid), public.team_activity(uuid, int)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- c37: Sohbete özel arka plan (arkadaşla paylaşılan).
--      1) chat_backgrounds: iki arkadaş arasındaki sohbetin ortak arka planı. Çift anahtarı (user_a < user_b),
--         öneren (proposer), tür (solid = düz renk #rrggbb, gradient = hazır degrade kimliği, image = görsel),
--         değer, görsel yolu ("chatbg" kovasında), durum (pending / accepted / rejected) ve güncellenme zamanı.
--         Her sohbette tek satır; yeni öneri eskisinin yerine geçer. Tabloya doğrudan yazılamaz, sadece RPC'lerle.
--         Satırı sadece sohbetin iki tarafı okuyabilir.
--      2) Özel "chatbg" kovası: <user_a>_<user_b>/<dosya>.jpg (en fazla 1 MB; uygulama 600 KB altına küçültür).
--         Yükleme: sadece klasördeki iki kişiden biri ve ikisi arkadaşsa. Okuma ve silme: sadece iki taraf.
--      3) RPC'ler:
--           chat_bg_propose(arkadaş, tür, değer, görsel yolu) → öneriyi kaydeder (pending), arkadaşa 'chat_bg'
--             bildirimi gönderir (e-posta yok: friend_request_mail sadece kendi listesindeki türler için e-posta atar).
--             Dönüş: artık kullanılmayan eski görselin yolu (uygulama kovadan siler) ya da null.
--           chat_bg_respond(arkadaş, kabul) → arkadaşın bekleyen önerisini kabul eder ya da reddeder;
--             kabulde önerene 'chat_bg' (state = accepted) bildirimi gider.
--           chat_bg_get(arkadaş) → sohbetin satırı (yoksa boş) + mine (öneren ben miyim).
--           chat_bg_clear(arkadaş) → ortak arka planı kaldırır (iki taraf da yapabilir). Dönüş: görsel yolu ya da null.
-- Sıra: herhangi bir zamanda (friendships, are_friends, notifications ve profiles hazır olmalı).
-- ---------------------------------------------------------------------------

-- 1) Tablo -----------------------------------------------------------------------------
create table if not exists public.chat_backgrounds (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  proposer uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('solid', 'gradient', 'image')),
  value text not null default '',
  image_path text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (proposer = user_a or proposer = user_b)
);
create index if not exists chat_backgrounds_b on public.chat_backgrounds (user_b);
alter table public.chat_backgrounds enable row level security;
drop policy if exists "chat bg read" on public.chat_backgrounds;
create policy "chat bg read" on public.chat_backgrounds for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- 2) Kova ve erişim ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chatbg', 'chatbg', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Klasör adı "<a>_<b>" ve çağıran bu ikisinden biri mi (p_friends: ayrıca arkadaş olmaları gereksin)
create or replace function public.chat_bg_folder_ok(p_folder text, p_friends boolean default false) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  a text := split_part(coalesce(p_folder, ''), '_', 1);
  b text := split_part(coalesce(p_folder, ''), '_', 2);
  re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  me text := auth.uid()::text;
begin
  if me is null or a !~ re or b !~ re or a >= b collate "C" or p_folder <> a || '_' || b then
    return false;
  end if;
  if me <> a and me <> b then
    return false;
  end if;
  return not p_friends or public.are_friends(a::uuid, b::uuid);
end $$;
grant execute on function public.chat_bg_folder_ok(text, boolean) to authenticated;

drop policy if exists "chatbg upload" on storage.objects;
create policy "chatbg upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chatbg' and public.chat_bg_folder_ok((storage.foldername(name))[1], true));
drop policy if exists "chatbg read" on storage.objects;
create policy "chatbg read" on storage.objects for select to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_folder_ok((storage.foldername(name))[1], false));
drop policy if exists "chatbg delete" on storage.objects;
create policy "chatbg delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_folder_ok((storage.foldername(name))[1], false));

-- 3) RPC'ler ---------------------------------------------------------------------------------
create or replace function public.chat_bg_propose(p_friend uuid, p_kind text, p_value text default '',
  p_image text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  folder text;
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  prev public.chat_backgrounds;
  v_name text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_friend is null or p_friend = me or not public.are_friends(me, p_friend) then
    raise exception 'Sadece arkadaşlarınla arka plan paylaşabilirsin';
  end if;
  if exists (select 1 from public.friendships where user_id = p_friend and friend_id = me and muted) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if me < p_friend then a := me; b := p_friend; else a := p_friend; b := me; end if;
  folder := a::text || '_' || b::text;

  if p_kind = 'solid' then
    if v_value !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Geçersiz renk'; end if;
    v_image := null;
  elsif p_kind = 'gradient' then
    if v_value !~ '^[a-z0-9-]{1,24}$' then raise exception 'Geçersiz degrade'; end if;
    v_image := null;
  elsif p_kind = 'image' then
    if v_image is null or length(v_image) > 200 or v_image not like folder || '/%' or v_image like '%..%'
       or v_image !~ '^[0-9a-f_-]+/[A-Za-z0-9._-]+$' then
      raise exception 'Geçersiz görsel';
    end if;
    v_value := '';
  else
    raise exception 'Geçersiz arka plan türü';
  end if;

  select * into prev from public.chat_backgrounds where user_a = a and user_b = b;
  -- Taşkın önleme: aynı kişi aynı sohbete 5 saniyede bir öneri
  if found and prev.proposer = me and prev.updated_at > now() - interval '5 seconds' then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;

  insert into public.chat_backgrounds (user_a, user_b, proposer, kind, value, image_path, status, updated_at)
    values (a, b, me, p_kind, v_value, v_image, 'pending', now())
  on conflict (user_a, user_b) do update set proposer = excluded.proposer, kind = excluded.kind, value = excluded.value,
    image_path = excluded.image_path, status = 'pending', updated_at = now();

  select display_name into v_name from public.profiles where id = me;
  delete from public.notifications where user_id = p_friend and kind = 'chat_bg' and not read and data ->> 'from' = me::text;
  insert into public.notifications (user_id, kind, data)
    values (p_friend, 'chat_bg', jsonb_build_object('from', me, 'name', coalesce(v_name, '?'), 'state', 'proposed'));

  if prev.image_path is not null and prev.image_path is distinct from v_image then
    return prev.image_path;
  end if;
  return null;
end $$;

create or replace function public.chat_bg_respond(p_friend uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  v_name text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_friend is null or p_friend = me then
    raise exception 'Geçersiz kişi';
  end if;
  if me < p_friend then a := me; b := p_friend; else a := p_friend; b := me; end if;
  update public.chat_backgrounds set status = case when p_accept then 'accepted' else 'rejected' end, updated_at = now()
    where user_a = a and user_b = b and proposer = p_friend and status = 'pending';
  if not found then
    raise exception 'Bekleyen bir arka plan önerisi yok';
  end if;
  update public.notifications set read = true
    where user_id = me and kind = 'chat_bg' and not read and data ->> 'from' = p_friend::text;
  if p_accept and public.are_friends(me, p_friend) then
    select display_name into v_name from public.profiles where id = me;
    insert into public.notifications (user_id, kind, data)
      values (p_friend, 'chat_bg', jsonb_build_object('from', me, 'name', coalesce(v_name, '?'), 'state', 'accepted'));
  end if;
end $$;

drop function if exists public.chat_bg_get(uuid);
create or replace function public.chat_bg_get(p_friend uuid)
returns table (proposer uuid, kind text, value text, image_path text, status text, updated_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.proposer, c.kind, c.value, c.image_path, c.status, c.updated_at, c.proposer = auth.uid()
  from public.chat_backgrounds c
  where auth.uid() is not null and p_friend is not null and p_friend <> auth.uid()
    and c.user_a = least(auth.uid(), p_friend) and c.user_b = greatest(auth.uid(), p_friend);
$$;

create or replace function public.chat_bg_clear(p_friend uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_path text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  delete from public.chat_backgrounds
    where user_a = least(me, p_friend) and user_b = greatest(me, p_friend)
    returning image_path into v_path;
  delete from public.notifications where kind = 'chat_bg' and not read
    and ((user_id = p_friend and data ->> 'from' = me::text) or (user_id = me and data ->> 'from' = p_friend::text));
  return v_path;
end $$;

revoke all on function public.chat_bg_propose(uuid, text, text, text) from public, anon;
revoke all on function public.chat_bg_respond(uuid, boolean) from public, anon;
revoke all on function public.chat_bg_get(uuid) from public, anon;
revoke all on function public.chat_bg_clear(uuid) from public, anon;
grant execute on function public.chat_bg_propose(uuid, text, text, text) to authenticated;
grant execute on function public.chat_bg_respond(uuid, boolean) to authenticated;
grant execute on function public.chat_bg_get(uuid) to authenticated;
grant execute on function public.chat_bg_clear(uuid) to authenticated;

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

-- ---------------------------------------------------------------------------
-- c39: Sesli mühendis ses paketleri.
--      1) voice_packs: indirilebilir ses paketleri listesi (yönetici ekler). Kimlik (ör. "tr-erkin"), ad, dil
--         (BCP47: tr, en, de, pt-BR…), yazar, sürüm (tam sayı; uygulama kurulu sürümden büyükse "Güncelle" gösterir),
--         zip bağlantısı (https; GitHub Releases dosya bağlantısı), boyut, SHA-256, ifade ve kayıt sayısı, biçim
--         (wav / ogg / mixed), not, yayında (published), sıra. Yayındakileri herkes (giriş yapmadan da) okuyabilir;
--         yönetici hepsini görür. Yazmak sadece RPC ile (yönetici):
--           voice_pack_save(...)   → ekle / güncelle (kimliğe göre). mod_log'a yazılır.
--           voice_pack_delete(id)  → sil. mod_log'a yazılır.
--         Paketlere erişim (indirip kullanmak) sesli mühendisin PRO kararına (pro_features "voice") bağlıdır;
--         tabloda ayrıca PRO alanı yok.
--      2) voice_pack_submissions: üyelerin "Paketimi gönder" formu (kendi dilinde kaydettiği paketin bağlantısı).
--         Kişi, gönderen adı (o anki görünen ad), dil, paket adı, bağlantı (sadece https), mesaj, durum
--         (new / reviewing / accepted / rejected), yönetici notu. Kişi kendi gönderilerini, yönetici hepsini görür.
--           voice_pack_submit(dil, paket adı, bağlantı, mesaj) → günde en fazla 3; tüm yöneticilere 'voice_submission'
--             bildirimi + e-posta (pitwall-jobs → voiceSubmissionAdmin).
--           voice_pack_my_submissions()            → kendi gönderilerim.
--           voice_pack_submissions_admin(durum)    → yönetici; durum '' = hepsi.
--           voice_pack_submission_update(id, durum, not) → yönetici; durum accepted / rejected olunca gönderene
--             'voice_submission_result' bildirimi (sadece uygulama içi, e-posta yok). mod_log'a yazılır.
--      3) friend_request_mail(): c35'teki liste aynen + 'voice_submission' (yöneticiye e-posta). Tercih ve sınır
--         denetimleri c35 ile aynı.
-- Sıra: c35'ten sonra (email_kind_category, email_pref_on, email_throttle_ok, call_jobs hazır olmalı).
-- ---------------------------------------------------------------------------

-- 1) Ses paketleri ------------------------------------------------------------------
create table if not exists public.voice_packs (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' and id !~ '\.(tmp|old)$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  language text not null check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  author text not null default '',
  version int not null default 1 check (version >= 1),
  url text not null check (url ~ '^https://' and length(url) <= 1000),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text not null default '' check (sha256 = '' or sha256 ~ '^[0-9a-f]{64}$'),
  phrases int not null default 0 check (phrases >= 0),
  files int not null default 0 check (files >= 0),
  format text not null default 'ogg' check (format in ('wav', 'ogg', 'mixed')),
  notes text not null default '',
  published boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.voice_packs enable row level security;
drop policy if exists "voice packs readable" on public.voice_packs;
create policy "voice packs readable" on public.voice_packs for select using (published or public.is_admin());
grant select on public.voice_packs to anon, authenticated;

-- Yönetici: ekle / güncelle
create or replace function public.voice_pack_save(
  p_id text, p_name text, p_language text, p_author text, p_version int, p_url text, p_size bigint,
  p_sha256 text, p_phrases int, p_files int, p_format text, p_notes text, p_published boolean, p_sort int)
returns text language plpgsql security definer set search_path = public as $$
declare
  vid text := btrim(coalesce(p_id, ''));
  old public.voice_packs;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if vid !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' or vid ~ '\.(tmp|old)$' then
    raise exception 'Kimlik 1-64 karakter olmalı (harf, rakam, - _ .), ör. tr-erkin';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Paket adı gerekli (en fazla 80 karakter)';
  end if;
  if btrim(coalesce(p_language, '')) !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then
    raise exception 'Geçersiz dil kodu (ör. tr, en, pt-BR)';
  end if;
  if btrim(coalesce(p_url, '')) !~ '^https://' then
    raise exception 'Bağlantı https:// ile başlamalı';
  end if;
  if coalesce(p_sha256, '') <> '' and lower(btrim(p_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 64 karakterlik onaltılık olmalı';
  end if;
  if coalesce(p_format, 'ogg') not in ('wav', 'ogg', 'mixed') then
    raise exception 'Geçersiz biçim';
  end if;
  select * into old from public.voice_packs where id = vid;
  insert into public.voice_packs as v (id, name, language, author, version, url, size_bytes, sha256, phrases, files, format,
                                       notes, published, sort, updated_by)
    values (vid, btrim(p_name), btrim(p_language), left(btrim(coalesce(p_author, '')), 80), greatest(coalesce(p_version, 1), 1),
            btrim(p_url), greatest(coalesce(p_size, 0), 0), lower(btrim(coalesce(p_sha256, ''))), greatest(coalesce(p_phrases, 0), 0),
            greatest(coalesce(p_files, 0), 0), coalesce(p_format, 'ogg'), left(btrim(coalesce(p_notes, '')), 1000),
            coalesce(p_published, false), coalesce(p_sort, 0), auth.uid())
  on conflict (id) do update set name = excluded.name, language = excluded.language, author = excluded.author,
    version = excluded.version, url = excluded.url, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
    phrases = excluded.phrases, files = excluded.files, format = excluded.format, notes = excluded.notes,
    published = excluded.published, sort = excluded.sort, updated_at = now(), updated_by = auth.uid();
  perform public.log_mod(case when old.id is null then 'voice_pack_create' else 'voice_pack_update' end, 'voice_pack', vid, null,
    jsonb_build_object('name', btrim(p_name), 'language', btrim(p_language), 'version', p_version, 'published', coalesce(p_published, false),
                       'old_version', old.version, 'old_published', old.published));
  return vid;
end $$;
revoke all on function public.voice_pack_save(text, text, text, text, int, text, bigint, text, int, int, text, text, boolean, int) from public, anon;
grant execute on function public.voice_pack_save(text, text, text, text, int, text, bigint, text, int, int, text, text, boolean, int) to authenticated;

-- Yönetici: sil
create or replace function public.voice_pack_delete(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.voice_packs;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.voice_packs where id = p_id returning * into v;
  if v.id is null then
    raise exception 'Paket bulunamadı';
  end if;
  perform public.log_mod('voice_pack_delete', 'voice_pack', v.id, null,
    jsonb_build_object('name', v.name, 'language', v.language, 'version', v.version));
end $$;
revoke all on function public.voice_pack_delete(text) from public, anon;
grant execute on function public.voice_pack_delete(text) to authenticated;

-- 2) Paket gönderileri ----------------------------------------------------------------
create table if not exists public.voice_pack_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  user_name text not null default '',
  language text not null check (length(language) between 2 and 40),
  pack_name text not null check (length(pack_name) between 1 and 80),
  link text not null check (link ~ '^https://' and length(link) <= 1000),
  message text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewing', 'accepted', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id) on delete set null
);
create index if not exists voice_pack_submissions_user on public.voice_pack_submissions (user_id, created_at desc);
create index if not exists voice_pack_submissions_created on public.voice_pack_submissions (created_at desc);
alter table public.voice_pack_submissions enable row level security;
drop policy if exists "voice submissions read" on public.voice_pack_submissions;
create policy "voice submissions read" on public.voice_pack_submissions for select
  using (auth.uid() = user_id or public.is_admin());

-- Üye: paketimi gönder
create or replace function public.voice_pack_submit(p_language text, p_pack_name text, p_link text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  nm text;
  lang text := left(btrim(coalesce(p_language, '')), 40);
  pn text := left(btrim(coalesce(p_pack_name, '')), 80);
  lk text := btrim(coalesce(p_link, ''));
  msg text := left(btrim(coalesce(p_message, '')), 2000);
  rid uuid;
begin
  if me is null then
    raise exception 'Göndermek için giriş yapmalısın';
  end if;
  if length(lang) < 2 then
    raise exception 'Dili yaz';
  end if;
  if pn = '' then
    raise exception 'Paket adını yaz';
  end if;
  if lk !~ '^https://[^\s/$.?#][^\s]*$' or length(lk) > 1000 then
    raise exception 'Geçerli bir https:// bağlantısı yaz (WeTransfer, Google Drive…)';
  end if;
  if (select count(*) from public.voice_pack_submissions where user_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Bugün en fazla 3 paket gönderebilirsin';
  end if;
  nm := coalesce((select display_name from public.profiles where id = me), '');
  insert into public.voice_pack_submissions (user_id, user_name, language, pack_name, link, message)
    values (me, nm, lang, pn, lk, msg)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'voice_submission', jsonb_build_object(
      'submission', rid, 'user', me, 'name', nm, 'language', lang, 'pack_name', pn, 'link', lk, 'message', left(msg, 500))
    from public.profiles p where p.is_admin;
  return rid;
end $$;
revoke all on function public.voice_pack_submit(text, text, text, text) from public, anon;
grant execute on function public.voice_pack_submit(text, text, text, text) to authenticated;

-- Üye: kendi gönderilerim
create or replace function public.voice_pack_my_submissions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'language', s.language, 'pack_name', s.pack_name, 'link', s.link, 'message', s.message,
      'status', s.status, 'admin_note', s.admin_note, 'created_at', s.created_at, 'updated_at', s.updated_at)
    order by s.created_at desc), '[]'::jsonb)
  from public.voice_pack_submissions s where s.user_id = auth.uid();
$$;
revoke all on function public.voice_pack_my_submissions() from public, anon;
grant execute on function public.voice_pack_my_submissions() to authenticated;

-- Yönetici: gönderiler (p_status '' = hepsi)
create or replace function public.voice_pack_submissions_admin(p_status text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', s.id, 'user_id', s.user_id,
        'user_name', coalesce(nullif(p.display_name, ''), s.user_name),
        'language', s.language, 'pack_name', s.pack_name, 'link', s.link, 'message', s.message,
        'status', s.status, 'admin_note', s.admin_note, 'created_at', s.created_at, 'updated_at', s.updated_at,
        'handled_by_name', coalesce(h.display_name, ''))
      order by (s.status in ('new', 'reviewing')) desc, s.created_at desc)
    from public.voice_pack_submissions s
    left join public.profiles p on p.id = s.user_id
    left join public.profiles h on h.id = s.handled_by
    where coalesce(p_status, '') = '' or s.status = p_status), '[]'::jsonb);
end $$;
revoke all on function public.voice_pack_submissions_admin(text) from public, anon;
grant execute on function public.voice_pack_submissions_admin(text) to authenticated;

-- Yönetici: durum / not değiştir
create or replace function public.voice_pack_submission_update(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  old public.voice_pack_submissions;
  st text := coalesce(p_status, '');
  note text := left(btrim(coalesce(p_note, '')), 2000);
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if st not in ('new', 'reviewing', 'accepted', 'rejected') then
    raise exception 'Geçersiz durum';
  end if;
  select * into old from public.voice_pack_submissions where id = p_id for update;
  if old.id is null then
    raise exception 'Gönderi bulunamadı';
  end if;
  update public.voice_pack_submissions set status = st, admin_note = note, updated_at = now(), handled_by = auth.uid()
    where id = p_id;
  perform public.log_mod('voice_submission_' || st, 'voice_submission', p_id::text, old.user_id,
    jsonb_build_object('pack_name', old.pack_name, 'language', old.language, 'old_status', old.status, 'note', note));
  if st in ('accepted', 'rejected') and st <> old.status and old.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (old.user_id, 'voice_submission_result', jsonb_build_object(
        'submission', p_id, 'status', st, 'pack_name', old.pack_name, 'language', old.language, 'note', left(note, 500)));
  end if;
end $$;
revoke all on function public.voice_pack_submission_update(uuid, text, text) from public, anon;
grant execute on function public.voice_pack_submission_update(uuid, text, text) to authenticated;

-- 3) Bildirimden e-posta: c35'teki liste + 'voice_submission' (yöneticiye) -------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cat text;
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended',
                  'message_reported',
                  'team_invite', 'team_request', 'team_accepted', 'team_announcement', 'team_role',
                  'voice_submission') then
    cat := public.email_kind_category(new.kind);
    if cat is not null and not public.email_pref_on(new.user_id, cat) then
      return null;
    end if;
    if new.kind = 'team_announcement'
       and not public.email_throttle_ok(new.user_id, 'team_announcement:' || coalesce(new.data ->> 'team', ''), interval '1 hour') then
      return null;
    end if;
    if new.kind = 'team_request'
       and not public.email_throttle_ok(new.user_id, 'team_request:' || coalesce(new.data ->> 'team', ''), interval '30 minutes') then
      return null;
    end if;
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

drop trigger if exists friend_request_mail on public.notifications;
create trigger friend_request_mail after insert on public.notifications
  for each row execute function public.friend_request_mail();

-- ---------------------------------------------------------------------------
-- c40: PRO özellikleri ayrıntılı: yönetici HER özelliği PRO ya da herkese açık yapabilir.
--      Kararlar c38'deki pro_features tablosunda (anahtar → PRO mu); burada yeni tablo yok. Yeni anahtarların
--      varsayılanı bugünkü davranıştır (hepsi herkese açık), yani bu dosya tek başına hiçbir şeyi kilitlemez;
--      yönetici Yönetim › PRO özellikleri'nden PRO yaptığında sunucu da reddeder.
--      Uygulamadaki yeni anahtarlar (programda ve sitede de denetlenir):
--        Sosyal:    social.friend_add, social.messages, social.chat_bg, social.avatar, social.profile_public
--        Takımlar:  teams.create, teams.join, teams.chat, teams.poll, teams.post
--        Telemetri: telemetry.record, telemetry.others (+ sadece programda: telemetry.compare, telemetry.leaderboard)
--        Ses:       voice.pack_submit
--        Sadece programda: appearance.themes / app_bg / chat_look, tools.screenshots / streaming / league /
--                   pitwall / timing / engineer / events
--      Overlay'ler (sadece programda; sunucu yolu yok): overlay.<id>.<ayar> (ayarın tamamı) ve
--      overlay.<id>.<ayar>.<değer> (seçenek) pro_features'ta; overlay'in tamamı app_config.pro_overlays'te (değişmedi).
--      Yeniden tanımlanan fonksiyonlar (imza aynı; en son tanımın aynısı, sadece PRO denetimi eklendi:
--      "if public.feature_requires_pro('<anahtar>', false) and not public.is_pro() then raise exception ...").
--      Kabul etmek / kaldırmak / silmek / okumak her zaman serbest (arkadaş isteğini kabul, fotoğrafı kaldırmak,
--      tanıtımı boşaltmak, takım daveti reddetmek…):
--           friend_request(uuid)                                       (schema.sql) — social.friend_add
--           send_message(uuid, text)                                   (c27       ) — social.messages
--           chat_bg_propose(uuid, text, text, text)                    (c37       ) — social.chat_bg
--           profile_set_avatar(text)                                   (c31       ) — social.avatar
--           profile_update_public(text, jsonb)                         (c31       ) — social.profile_public
--           team_create(text, text, text, text, text, text, text)      (c36       ) — teams.create
--           team_request(uuid)                                         (c30       ) — teams.join
--           team_respond(uuid, boolean)                                (c30       ) — teams.join
--           team_send(uuid, text)                                      (c30       ) — teams.chat
--           team_poll_create(uuid, text, text[], boolean, timestamptz) (c30       ) — teams.poll
--           team_post(uuid, text, boolean)                             (c30       ) — teams.post
--           telemetry_record_lap(jsonb)                                (c29       ) — telemetry.record
--           telemetry_visible(uuid)                                    (c29       ) — telemetry.others
--           voice_pack_submit(text, text, text, text)                  (c39       ) — voice.pack_submit
--      team_respond: kabulde takıma girecek kişi (davet edilen ya da isteği onaylanan) PRO olmalı (user_is_pro).
--      telemetry_visible: sahibi her zaman görür; başkası (herkese açık / aynı takım) ancak anahtar açıksa ya da PRO ise.
-- Sıra: c38 ve c39'dan sonra (feature_requires_pro, voice_pack_submissions hazır olmalı).
-- ---------------------------------------------------------------------------

-- friend_request(uuid) — social.friend_add (son tanım: schema.sql)
create or replace function public.friend_request(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  theirs text;
begin
  if me is null or p_user is null or p_user = me then
    raise exception 'Geçersiz kullanıcı';
  end if;
  if (select count(*) from public.friendships where user_id = me) >= 300 then
    raise exception 'Arkadaş sınırına ulaştın';
  end if;
  select status into theirs from public.friendships where user_id = p_user and friend_id = me;
  if theirs = 'pending_out' then
    update public.friendships set status = 'accepted' where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
    return 'accepted';
  end if;
  if theirs is not null then
    return theirs;
  end if;
  if public.feature_requires_pro('social.friend_add', false) and not public.is_pro() then
    raise exception 'Arkadaş eklemek PRO üyelik gerektirir';
  end if;
  insert into public.friendships (user_id, friend_id, status) values (me, p_user, 'pending_out') on conflict do nothing;
  insert into public.friendships (user_id, friend_id, status) values (p_user, me, 'pending_in') on conflict do nothing;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'friend_request', jsonb_build_object('from', me, 'name', (select display_name from public.profiles where id = me)));
  return 'pending';
end $$;

-- send_message(uuid, text) — social.messages (son tanım: c27)
create or replace function public.send_message(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.messages', false) and not public.is_pro() then
    raise exception 'Mesaj göndermek PRO üyelik gerektirir';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if not public.are_friends(me, p_to) then
    raise exception 'Sadece arkadaşlarına mesaj gönderebilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_to and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_to), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.messages (sender, recipient, body) values (me, p_to, left(trim(p_body), 1000)) returning id into mid;
  return mid;
end $$;

-- chat_bg_propose(uuid, text, text, text) — social.chat_bg (son tanım: c37)
create or replace function public.chat_bg_propose(p_friend uuid, p_kind text, p_value text default '',
  p_image text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  folder text;
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  prev public.chat_backgrounds;
  v_name text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.chat_bg', false) and not public.is_pro() then
    raise exception 'Sohbet arka planı önermek PRO üyelik gerektirir';
  end if;
  if p_friend is null or p_friend = me or not public.are_friends(me, p_friend) then
    raise exception 'Sadece arkadaşlarınla arka plan paylaşabilirsin';
  end if;
  if exists (select 1 from public.friendships where user_id = p_friend and friend_id = me and muted) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if me < p_friend then a := me; b := p_friend; else a := p_friend; b := me; end if;
  folder := a::text || '_' || b::text;

  if p_kind = 'solid' then
    if v_value !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Geçersiz renk'; end if;
    v_image := null;
  elsif p_kind = 'gradient' then
    if v_value !~ '^[a-z0-9-]{1,24}$' then raise exception 'Geçersiz degrade'; end if;
    v_image := null;
  elsif p_kind = 'image' then
    if v_image is null or length(v_image) > 200 or v_image not like folder || '/%' or v_image like '%..%'
       or v_image !~ '^[0-9a-f_-]+/[A-Za-z0-9._-]+$' then
      raise exception 'Geçersiz görsel';
    end if;
    v_value := '';
  else
    raise exception 'Geçersiz arka plan türü';
  end if;

  select * into prev from public.chat_backgrounds where user_a = a and user_b = b;
  -- Taşkın önleme: aynı kişi aynı sohbete 5 saniyede bir öneri
  if found and prev.proposer = me and prev.updated_at > now() - interval '5 seconds' then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;

  insert into public.chat_backgrounds (user_a, user_b, proposer, kind, value, image_path, status, updated_at)
    values (a, b, me, p_kind, v_value, v_image, 'pending', now())
  on conflict (user_a, user_b) do update set proposer = excluded.proposer, kind = excluded.kind, value = excluded.value,
    image_path = excluded.image_path, status = 'pending', updated_at = now();

  select display_name into v_name from public.profiles where id = me;
  delete from public.notifications where user_id = p_friend and kind = 'chat_bg' and not read and data ->> 'from' = me::text;
  insert into public.notifications (user_id, kind, data)
    values (p_friend, 'chat_bg', jsonb_build_object('from', me, 'name', coalesce(v_name, '?'), 'state', 'proposed'));

  if prev.image_path is not null and prev.image_path is distinct from v_image then
    return prev.image_path;
  end if;
  return null;
end $$;

-- profile_set_avatar(text) — social.avatar (son tanım: c31)
create or replace function public.profile_set_avatar(p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_old text;
  v_path text := nullif(trim(coalesce(p_path, '')), '');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if v_path is not null then
    if public.feature_requires_pro('social.avatar', false) and not public.is_pro() then
      raise exception 'Profil fotoğrafı yüklemek PRO üyelik gerektirir';
    end if;
    if char_length(v_path) > 200 or split_part(v_path, '/', 1) <> me::text or v_path ~ '\.\.' then
      raise exception 'Geçersiz fotoğraf yolu';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_path) then
      raise exception 'Fotoğraf bulunamadı; yeniden yükle';
    end if;
  end if;
  select avatar_path into v_old from public.profiles where id = me;
  update public.profiles set avatar_path = v_path where id = me;
  return case when v_old is distinct from v_path then v_old end;
end $$;

-- profile_update_public(text, jsonb) — social.profile_public (son tanım: c31)
create or replace function public.profile_update_public(p_bio text, p_socials jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_bio text := trim(coalesce(p_bio, ''));
  v_out jsonb := '[]'::jsonb;
  e jsonb;
  v_type text;
  v_url text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'Tanıtım en çok 300 karakter olabilir';
  end if;
  if p_socials is not null and jsonb_typeof(p_socials) <> 'array' then
    raise exception 'Geçersiz bağlantı listesi';
  end if;
  if jsonb_array_length(coalesce(p_socials, '[]'::jsonb)) > 10 then
    raise exception 'En çok 10 bağlantı ekleyebilirsin';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_socials, '[]'::jsonb)) loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'Geçersiz bağlantı';
    end if;
    v_type := lower(trim(coalesce(e ->> 'type', '')));
    v_url := trim(coalesce(e ->> 'url', ''));
    if v_url = '' then
      continue; -- boş satırlar atlanır
    end if;
    if not (v_type = any (public.profile_social_types())) then
      raise exception 'Geçersiz bağlantı türü: %', v_type;
    end if;
    if char_length(v_url) > 200 then
      raise exception 'Bağlantı en çok 200 karakter olabilir';
    end if;
    if v_url !~* '^https://[^/[:space:]?#.][^[:space:]]*$' then
      raise exception 'Bağlantı https:// ile başlamalı: %', left(v_url, 60);
    end if;
    v_url := regexp_replace(v_url, '^https://', 'https://', 'i');
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', v_type, 'url', v_url));
  end loop;
  if public.feature_requires_pro('social.profile_public', false) and (v_bio <> '' or jsonb_array_length(v_out) > 0) and not public.is_pro() then
    raise exception 'Profil tanıtımı ve sosyal bağlantılar PRO üyelik gerektirir';
  end if;
  update public.profiles set bio = v_bio, socials = v_out where id = me;
  return jsonb_build_object('bio', v_bio, 'socials', v_out);
end $$;

-- team_create(text, text, text, text, text, text, text) — teams.create (son tanım: c36)
create or replace function public.team_create(p_name text, p_tag text, p_description text default '',
  p_color text default '#4ea1ff', p_logo text default '', p_join_mode text default 'request', p_sim text default 'iracing') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
  v_sim text := coalesce(nullif(trim(p_sim), ''), 'iracing');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('teams.create', false) and not public.is_pro() then
    raise exception 'Takım kurmak PRO üyelik gerektirir';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi') then
    raise exception 'Geçersiz oyun';
  end if;
  if (select count(*) from public.teams where owner = me) >= 3 then
    raise exception 'En fazla 3 takım kurabilirsin';
  end if;
  if (select count(*) from public.team_members where user_id = me) >= 10 then
    raise exception 'En fazla 10 takımda olabilirsin';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name)) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  insert into public.teams (name, tag, description, color, logo_path, join_mode, owner, sim)
    values (v_name, v_tag, left(trim(coalesce(p_description, '')), 1000), p_color, coalesce(p_logo, ''), p_join_mode, me, v_sim)
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.team_chat_state (team_id, user_id) values (tid, me);
  return tid;
end $$;

-- team_request(uuid) — teams.join (son tanım: c30)
create or replace function public.team_request(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
  inv public.team_invites;
  iid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('teams.join', false) and not public.is_pro() then
    raise exception 'Takıma katılmak PRO üyelik gerektirir';
  end if;
  select * into t from public.teams where id = p_team;
  if t.id is null then
    raise exception 'Takım bulunamadı';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = me) then
    raise exception 'Zaten bu takımdasın';
  end if;
  select * into inv from public.team_invites where team_id = p_team and user_id = me;
  if inv.kind = 'invite' or t.join_mode = 'open' then
    perform public.team_add_member(p_team, me);
    if inv.id is not null then
      delete from public.notifications where kind = 'team_invite' and data ->> 'invite' = inv.id::text;
    end if;
    return 'joined';
  end if;
  if inv.kind = 'request' then
    return 'pending';
  end if;
  if t.join_mode = 'invite' then
    raise exception 'Bu takım sadece davetle üye alıyor';
  end if;
  if (select count(*) from public.team_invites where user_id = me and kind = 'request' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla katılma isteği gönderdin';
  end if;
  insert into public.team_invites (team_id, user_id, kind) values (p_team, me, 'request') returning id into iid;
  insert into public.notifications (user_id, kind, data)
    select m.user_id, 'team_request', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'invite', iid,
      'from', me, 'name', coalesce((select display_name from public.profiles where id = me), '?'))
    from public.team_members m where m.team_id = p_team and m.role in ('owner', 'admin');
  return 'requested';
end $$;

-- team_respond(uuid, boolean) — teams.join (son tanım: c30)
create or replace function public.team_respond(p_invite uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.team_invites;
  t public.teams;
  adm boolean;
begin
  select * into inv from public.team_invites where id = p_invite;
  if inv.id is null then
    raise exception 'Davet bulunamadı';
  end if;
  adm := public.is_team_admin(inv.team_id);
  if inv.user_id <> me and not adm then
    raise exception 'yetki yok';
  end if;
  if p_accept then
    if inv.kind = 'invite' and inv.user_id <> me then
      raise exception 'Daveti sadece davet edilen kabul edebilir';
    end if;
    if inv.kind = 'request' and not adm then
      raise exception 'Katılma isteğini sadece takım sahibi ve yöneticileri onaylayabilir';
    end if;
    if public.feature_requires_pro('teams.join', false) and not public.user_is_pro(inv.user_id) then
      if inv.user_id = me then
        raise exception 'Takıma katılmak PRO üyelik gerektirir';
      end if;
      raise exception 'Bu kişi takıma katılamaz: takıma katılmak PRO üyelik gerektirir';
    end if;
    perform public.team_add_member(inv.team_id, inv.user_id);
    if inv.kind = 'request' then
      select * into t from public.teams where id = inv.team_id;
      insert into public.notifications (user_id, kind, data)
        values (inv.user_id, 'team_accepted', jsonb_build_object('team', t.id, 'team_name', t.name, 'tag', t.tag));
    end if;
  else
    delete from public.team_invites where id = p_invite;
  end if;
  delete from public.notifications where kind in ('team_invite', 'team_request') and data ->> 'invite' = p_invite::text;
end $$;

-- team_send(uuid, text) — teams.chat (son tanım: c30)
create or replace function public.team_send(p_team uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  if public.feature_requires_pro('teams.chat', false) and not public.is_pro() then
    raise exception 'Takım sohbetine yazmak PRO üyelik gerektirir';
  end if;
  if v_body = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if (select count(*) from public.team_messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.team_messages (team_id, sender, body) values (p_team, me, v_body) returning id into mid;
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = me;
  return mid;
end $$;

-- team_poll_create(uuid, text, text[], boolean, timestamptz) — teams.poll (son tanım: c30)
create or replace function public.team_poll_create(p_team uuid, p_question text, p_options text[], p_multi boolean,
  p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_q text := left(trim(coalesce(p_question, '')), 200);
  opts text[];
  pid uuid;
  mid uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  if public.feature_requires_pro('teams.poll', false) and not public.is_pro() then
    raise exception 'Anket oluşturmak PRO üyelik gerektirir';
  end if;
  if v_q = '' then
    raise exception 'Anket sorusu boş olamaz';
  end if;
  select coalesce(array_agg(o order by i), '{}') into opts
    from (select left(trim(x), 80) as o, i from unnest(p_options) with ordinality as u(x, i)) s
    where o <> '';
  if cardinality(opts) not between 2 and 6 then
    raise exception 'Ankette 2-6 seçenek olmalı';
  end if;
  if (select count(distinct lower(o)) from unnest(opts) o) <> cardinality(opts) then
    raise exception 'Seçenekler birbirinden farklı olmalı';
  end if;
  if p_ends_at is null or p_ends_at < now() + interval '1 minute' or p_ends_at > now() + interval '30 days' then
    raise exception 'Bitiş zamanı 1 dakika ile 30 gün arasında olmalı';
  end if;
  if (select count(*) from public.team_messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.team_polls (team_id, created_by, question, options, multi, ends_at, counts)
    values (p_team, me, v_q, opts, coalesce(p_multi, false), p_ends_at, array_fill(0, array[cardinality(opts)]))
    returning id into pid;
  insert into public.team_messages (team_id, sender, body, poll_id) values (p_team, me, v_q, pid) returning id into mid;
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = me;
  return mid;
end $$;

-- team_post(uuid, text, boolean) — teams.post (son tanım: c30)
create or replace function public.team_post(p_team uuid, p_body text, p_pin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pid uuid;
  t public.teams;
  v_body text := left(trim(coalesce(p_body, '')), 4000);
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Duyuruları sadece takım sahibi ve yöneticileri yazabilir';
  end if;
  if public.feature_requires_pro('teams.post', false) and not public.is_pro() then
    raise exception 'Duyuru yazmak PRO üyelik gerektirir';
  end if;
  if v_body = '' then
    raise exception 'Duyuru boş olamaz';
  end if;
  if (select count(*) from public.team_posts where team_id = p_team and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün bu takıma çok fazla duyuru yazıldı';
  end if;
  insert into public.team_posts (team_id, author, body) values (p_team, me, v_body) returning id into pid;
  if p_pin then
    update public.teams set pinned_post = pid where id = p_team;
  end if;
  select * into t from public.teams where id = p_team;
  insert into public.notifications (user_id, kind, data)
    select m.user_id, 'team_announcement', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'post', pid,
      'name', coalesce((select display_name from public.profiles where id = me), '?'), 'text', left(v_body, 200))
    from public.team_members m where m.team_id = p_team and m.user_id <> me;
  return pid;
end $$;

-- telemetry_record_lap(jsonb) — telemetry.record (son tanım: c29)
create or replace function public.telemetry_record_lap(p_lap jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_sim text := coalesce(p_lap->>'sim', '');
  v_local text := left(coalesce(p_lap->>'session_local', ''), 120);
  v_lap_local text := left(coalesce(p_lap->>'id', ''), 140);
  v_time real;
  v_valid boolean := coalesce((p_lap->>'valid')::boolean, false);
  v_pit boolean := coalesce((p_lap->>'pit')::boolean, false);
  v_has_trace boolean := coalesce((p_lap->>'has_trace')::boolean, false);
  v_type text := coalesce(p_lap->>'session_type', 'other');
  v_started timestamptz;
  v_ts timestamptz;
  v_sectors real[];
  v_sess uuid;
  v_lap uuid;
  v_new boolean;
  v_best real;
  v_path text;
  v_remove text[] := '{}';
  v_pb boolean := false;
  v_track text := left(coalesce(p_lap->>'track_id', ''), 120);
  v_config text := left(coalesce(p_lap->>'track_config', ''), 160);
  v_car text := left(coalesce(p_lap->>'car_id', ''), 120);
  v_name text := left(btrim(coalesce(p_lap->>'driver_name', '')), 80);
  v_sim_id text := left(btrim(coalesce(p_lap->>'driver_id', '')), 40);
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('telemetry.record', false) and not public.is_pro() then
    raise exception 'Telemetri yüklemek PRO üyelik gerektirir';
  end if;
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2') or v_local = '' or v_lap_local = '' then
    raise exception 'Geçersiz tur';
  end if;
  v_time := (p_lap->>'lap_time')::real;
  if v_time is null or v_time <= 1 or v_time >= 3600 then
    raise exception 'Geçersiz tur süresi';
  end if;
  if v_type not in ('practice', 'qualify', 'race', 'warmup', 'hotlap', 'other') then
    v_type := 'other';
  end if;
  -- Kötüye kullanım sınırı: günde en fazla 5000 tur
  if (select count(*) from public.telemetry_laps where user_id = me and created_at > now() - interval '1 day') >= 5000 then
    raise exception 'Günlük tur sınırına ulaşıldı';
  end if;
  v_started := to_timestamp(coalesce(nullif(p_lap->>'session_started', '')::bigint, 0) / 1000.0);
  v_ts := to_timestamp(coalesce(nullif(p_lap->>'ts', '')::bigint, 0) / 1000.0);
  if v_ts < now() - interval '2 years' or v_ts > now() + interval '1 day' then
    v_ts := now();
  end if;
  if v_started < now() - interval '2 years' or v_started > now() + interval '1 day' then
    v_started := v_ts;
  end if;
  select coalesce(array_agg(x::real), '{}') into v_sectors
  from (select jsonb_array_elements_text(case when jsonb_typeof(p_lap->'sectors') = 'array' then p_lap->'sectors' else '[]'::jsonb end) x limit 3) s;

  insert into public.telemetry_sessions as t (user_id, local_id, sim, track_id, track_name, track_config, track_length_km,
      car_id, car_name, car_class, session_type, session_kind, driver_name, driver_id, started_at, last_lap_at)
  values (me, v_local, v_sim, v_track, left(coalesce(p_lap->>'track_name', ''), 160), v_config,
      greatest(coalesce((p_lap->>'track_length_km')::real, 0), 0), v_car, left(coalesce(p_lap->>'car_name', ''), 160),
      left(coalesce(p_lap->>'car_class', ''), 80), v_type, left(coalesce(p_lap->>'session_kind', ''), 60),
      v_name, v_sim_id, v_started, v_ts)
  on conflict (user_id, local_id) do update
    set last_lap_at = greatest(t.last_lap_at, excluded.last_lap_at),
        driver_name = case when excluded.driver_name <> '' then excluded.driver_name else t.driver_name end,
        driver_id = case when excluded.driver_id <> '' then excluded.driver_id else t.driver_id end
  returning id into v_sess;

  insert into public.telemetry_laps as l (session_id, user_id, local_id, sim, track_id, track_config, car_id, lap, lap_time,
      sectors, valid, pit, off_track, sim_invalid, incidents, fuel_used, air_temp, track_temp, wetness, precip,
      position, class_position, driven_at)
  values (v_sess, me, v_lap_local, v_sim, v_track, v_config, v_car, coalesce((p_lap->>'lap')::int, 0), v_time,
      v_sectors, v_valid, v_pit, coalesce((p_lap->>'off_track')::boolean, false),
      coalesce((p_lap->>'sim_invalid')::boolean, false), greatest(coalesce((p_lap->>'incidents')::int, 0), 0),
      nullif((p_lap->>'fuel_used')::real, 0), (p_lap->>'air_temp')::real, (p_lap->>'track_temp')::real,
      (p_lap->>'wetness')::int, (p_lap->>'precip')::real, nullif((p_lap->>'position')::int, 0),
      nullif((p_lap->>'class_position')::int, 0), v_ts)
  on conflict (user_id, local_id) do update
    set lap_time = excluded.lap_time, sectors = excluded.sectors, valid = excluded.valid, pit = excluded.pit,
        off_track = excluded.off_track, sim_invalid = excluded.sim_invalid, incidents = excluded.incidents
  returning id, (xmax = 0) into v_lap, v_new;

  -- İz: oturumun yeni en iyi geçerli turu ise saklanır, oturumdaki eski izler silinir
  if v_valid and not v_pit then
    select min(lap_time) into v_best from public.telemetry_laps
    where session_id = v_sess and valid and not pit and id <> v_lap;
    if v_has_trace and (v_best is null or v_time < v_best
        or (v_time = v_best and not exists (select 1 from public.telemetry_laps
              where session_id = v_sess and id <> v_lap and trace_path is not null))) then
      v_path := me::text || '/' || v_lap::text || '.json.gz';
      select coalesce(array_agg(trace_path), '{}') into v_remove from public.telemetry_laps
      where session_id = v_sess and id <> v_lap and trace_path is not null;
      update public.telemetry_laps set trace_path = null
      where session_id = v_sess and id <> v_lap and trace_path is not null;
      update public.telemetry_laps set trace_path = v_path where id = v_lap;
    end if;
    v_pb := not exists (select 1 from public.telemetry_laps
      where user_id = me and sim = v_sim and track_id = v_track and track_config = v_config and car_id = v_car
        and valid and not pit and id <> v_lap and lap_time <= v_time);
  end if;

  -- Oturum özeti
  update public.telemetry_sessions s set
    laps = x.n, valid_laps = x.nv, invalid_laps = x.n - x.nv, incidents = x.inc,
    best_lap = x.best, best_lap_id = x.best_id,
    distance_km = x.n * s.track_length_km, drive_time = x.dt,
    air_temp = coalesce((p_lap->>'air_temp')::real, s.air_temp),
    track_temp = coalesce((p_lap->>'track_temp')::real, s.track_temp),
    wetness = coalesce((p_lap->>'wetness')::int, s.wetness)
  from (
    select count(*)::int n, count(*) filter (where valid)::int nv, coalesce(sum(incidents), 0)::int inc,
           min(lap_time) filter (where valid and not pit) best,
           (array_agg(id order by lap_time) filter (where valid and not pit))[1] best_id,
           coalesce(sum(lap_time), 0)::real dt
    from public.telemetry_laps where session_id = v_sess
  ) x
  where s.id = v_sess;

  -- Simdeki kimlik
  if v_name <> '' then
    insert into public.driver_identities as d (user_id, sim, sim_name, sim_id, laps)
    values (me, v_sim, v_name, v_sim_id, 1)
    on conflict (user_id, sim) do update
      set sim_name = excluded.sim_name,
          sim_id = case when excluded.sim_id <> '' then excluded.sim_id else d.sim_id end,
          last_seen = now(),
          laps = d.laps + case when v_new then 1 else 0 end;
  end if;

  return jsonb_build_object('lap_id', v_lap, 'session_id', v_sess, 'trace_path', v_path,
    'remove', to_jsonb(v_remove), 'pb', v_pb, 'new', v_new);
end $$;

-- telemetry_visible(uuid) — telemetry.others (son tanım: c29)
create or replace function public.telemetry_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner is not null and (
    coalesce(p_owner = auth.uid(), false)
    or ((coalesce((select p.telemetry_public from public.profiles p where p.id = p_owner), false)
         or (auth.uid() is not null and coalesce(public.same_team(p_owner, auth.uid()), false)))
        and (not public.feature_requires_pro('telemetry.others', false) or public.is_pro())));
$$;

-- voice_pack_submit(text, text, text, text) — voice.pack_submit (son tanım: c39)
create or replace function public.voice_pack_submit(p_language text, p_pack_name text, p_link text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  nm text;
  lang text := left(btrim(coalesce(p_language, '')), 40);
  pn text := left(btrim(coalesce(p_pack_name, '')), 80);
  lk text := btrim(coalesce(p_link, ''));
  msg text := left(btrim(coalesce(p_message, '')), 2000);
  rid uuid;
begin
  if me is null then
    raise exception 'Göndermek için giriş yapmalısın';
  end if;
  if public.feature_requires_pro('voice.pack_submit', false) and not public.is_pro() then
    raise exception 'Ses paketi göndermek PRO üyelik gerektirir';
  end if;
  if length(lang) < 2 then
    raise exception 'Dili yaz';
  end if;
  if pn = '' then
    raise exception 'Paket adını yaz';
  end if;
  if lk !~ '^https://[^\s/$.?#][^\s]*$' or length(lk) > 1000 then
    raise exception 'Geçerli bir https:// bağlantısı yaz (WeTransfer, Google Drive…)';
  end if;
  if (select count(*) from public.voice_pack_submissions where user_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Bugün en fazla 3 paket gönderebilirsin';
  end if;
  nm := coalesce((select display_name from public.profiles where id = me), '');
  insert into public.voice_pack_submissions (user_id, user_name, language, pack_name, link, message)
    values (me, nm, lang, pn, lk, msg)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'voice_submission', jsonb_build_object(
      'submission', rid, 'user', me, 'name', nm, 'language', lang, 'pack_name', pn, 'link', lk, 'message', left(msg, 500))
    from public.profiles p where p.is_admin;
  return rid;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- c41: Yeni hesaplara 3 günlük deneme PRO (kötüye kullanım denetimiyle).
--      Program (ilk girişte, hesap + bilgisayar başına bir kez) ve site (hesap sayfası, tarayıcı başına bir kez)
--      trial_claim(p_device, p_web_fp, p_fp) çağırır. Sunucu kararı verir:
--        * Hesap yeni olmalı: 7 günden genç, daha önce hiç PRO süresi / aboneliği / ödemesi / hediyesi olmamış,
--          daha önce deneme talebi olmamış. Değilse sessizce reddedilir (reason: had_pro / not_new; uyarı yok).
--        * Kötüye kullanım (herhangi biri eşleşirse sessizce reddedilir, yöneticilere 'trial_abuse' bildirimi gider):
--            disposable_email  geçici e-posta servisi (yerleşik kısa liste)
--            same_device       aynı bilgisayar (device.rs karması) başka bir hesabın deneme talebinde ya da cihaz kaydında
--            same_browser      aynı tarayıcı kimliği (localStorage'daki rastgele kimlik) başka bir talepte
--            same_email        normalleştirilmiş e-posta (küçük harf; gmail/googlemail'de noktalar ve +ek, diğerlerinde +ek
--                              atılır) başka bir hesapta ya da talepte
--            same_ip           aynı IP son 60 günde başka bir yeni hesabın talebinde (eski üyelerin kayıtları IP'de sayılmaz:
--                              ortak ağ / mobil operatör IP'leri yüzünden haksız ret olmasın)
--            same_network      aynı /24 (IPv6'da /64) ağ son 7 günde ve aynı tarayıcı parmak izi (UA, ekran, saat dilimi, dil)
--        * Kabulde profiles.pro_until = greatest(now, pro_until) + trial_days, pro_source = 'trial'
--          (diğer PRO kaynaklarıyla aynı alan: entitlement / Rust hemen görür). Kullanıcıya uygulama içi
--          'trial_started' bildirimi (e-posta yok: friend_request_mail listesinde değil). 10 günlük bitiş uyarısı
--          atlanır (pro_warned_stage = 1), son gün uyarısı gider.
--        * İstemciye sadece {granted:true, until, days} ya da {granted:false} döner; ret nedeni asla dönmez.
--      Her deneme trial_claims tablosuna nedeniyle yazılır (yönetici listesi). Gizlilik: bilgisayar kimliği ham
--      MachineGuid değil, programdaki tuzlu SHA-256 karmasıdır; tarayıcı parmak izi de karmadır. IP ve normalleştirilmiş
--      e-posta kötüye kullanımı önlemek için tutulur; hesap silinse de kayıt kalır (aynı e-postayla yeniden deneme engeli).
--      app_config.trial_enabled (varsayılan açık) ve trial_days (varsayılan 3) Yönetim › Deneme PRO'dan değişir.
--      protect_profile(): son tanımın aynısı + 'pitwall.pro_grant' işlem bayrağı (sadece trial_claim içinde açılır;
--      PostgREST üzerinden kullanıcı set_config çağıramaz).
-- Yeni fonksiyonlar: trial_claim(text, text, text), admin_trial_claims(text), admin_trial_set(uuid, boolean)
-- Sıra: c40'tan sonra (bağımsız; pro_log, devices, subscriptions, payments tabloları hazır olmalı).
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists trial_enabled boolean not null default true;
alter table public.app_config add column if not exists trial_days int not null default 3;

create table if not exists public.trial_claims (
  user_id uuid primary key,                 -- hesap silinse de kalır (FK yok)
  granted boolean not null default false,
  reason text not null default '',          -- granted | had_pro | not_new | disposable_email | same_device,...
  matched uuid[] not null default '{}',     -- eşleşen diğer hesaplar
  device_hash text,                         -- programın tuzlu SHA-256 bilgisayar karması (ham kimlik değil)
  web_fp text,                              -- tarayıcıdaki rastgele kimlik
  fp_hash text,                             -- tarayıcı parmak izi karması (UA, ekran, saat dilimi, dil)
  ip text,
  ip_prefix text,
  email_norm text,
  source text not null default '',          -- app | web
  until timestamptz,                        -- verilen deneme bitişi
  admin_action text not null default '',    -- granted | revoked (yönetici elle)
  admin_by uuid,
  admin_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trial_claims_device on public.trial_claims (device_hash) where device_hash is not null;
create index if not exists trial_claims_webfp on public.trial_claims (web_fp) where web_fp is not null;
create index if not exists trial_claims_email on public.trial_claims (email_norm) where email_norm is not null;
create index if not exists trial_claims_ip on public.trial_claims (ip, created_at) where ip is not null;
create index if not exists trial_claims_prefix on public.trial_claims (ip_prefix, created_at) where ip_prefix is not null;
create index if not exists trial_claims_created on public.trial_claims (created_at desc);
alter table public.trial_claims enable row level security;
-- (politika yok: sadece aşağıdaki security definer fonksiyonlar erişir)

-- Kullanıcı kendi PRO/yönetici alanlarını değiştiremez; yöneticiliği sadece sahip verir/alır.
-- c41: 'pitwall.pro_grant' = 'on' iken (sadece trial_claim açar) PRO alanları korunmaz.
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if not public.is_admin() and coalesce(current_setting('pitwall.pro_grant', true), '') <> 'on' then
      new.pro_until := old.pro_until;
      new.pro_source := old.pro_source;
    end if;
    if not public.is_owner() then
      new.is_admin := old.is_admin;
    end if;
    new.is_owner := old.is_owner;
  end if;
  -- Kimse kendi yöneticiliğini panelden kaldıramasın (kilitlenmeyi önler)
  if old.id = auth.uid() and old.is_admin and not new.is_admin then
    new.is_admin := true;
  end if;
  return new;
end $$;

-- E-posta normalleştirme: küçük harf; gmail/googlemail'de noktalar ve +ek atılır (alan gmail.com olur), diğerlerinde +ek atılır
create or replace function public.trial_email_norm(p_email text) returns text
language plpgsql immutable as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  loc text;
  dom text;
begin
  if position('@' in e) = 0 then
    return nullif(e, '');
  end if;
  loc := split_part(e, '@', 1);
  dom := substr(e, length(loc) + 2);
  loc := split_part(loc, '+', 1);
  if dom in ('gmail.com', 'googlemail.com') then
    loc := replace(loc, '.', '');
    dom := 'gmail.com';
  end if;
  return loc || '@' || dom;
end $$;

-- Geçici e-posta servisleri (alt alan adları da sayılır)
create or replace function public.trial_disposable(p_domain text) returns boolean
language sql immutable as $$
  select exists (
    select 1 from unnest(array[
      'mailinator.com', '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net',
      'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'temp-mail.org', 'temp-mail.io',
      'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempr.email', 'yopmail.com', 'yopmail.net', 'yopmail.fr',
      'trashmail.com', 'trashmail.de', 'trashmail.net', 'getnada.com', 'nada.email', 'dispostable.com',
      'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com',
      'mailnesia.com', 'mytemp.email', 'moakt.com', 'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'burnermail.io',
      'spamgourmet.com', 'mailcatch.com', 'inboxkitten.com', 'emailfake.com', 'fakemail.net', 'getairmail.com',
      'discard.email', 'spambox.us', '33mail.com', 'mail.tm', 'mailpoof.com', 'linshiyouxiang.net', 'byom.de'
    ]) d
    where lower(coalesce(p_domain, '')) = d or lower(coalesce(p_domain, '')) like '%.' || d
  );
$$;

-- İsteğin IP'si (PostgREST başlıkları: x-forwarded-for'un ilk girdisi; yoksa cf-connecting-ip / x-real-ip)
create or replace function public.trial_client_ip() returns text
language plpgsql stable as $$
declare
  h json;
  v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then
    return null;
  end if;
  v := coalesce(nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), nullif(h ->> 'cf-connecting-ip', ''), nullif(h ->> 'x-real-ip', ''));
  begin
    return host(v::inet);
  exception when others then
    return null;
  end;
end $$;

-- Ağ öneki: IPv4 /24, IPv6 /64
create or replace function public.trial_ip_prefix(p_ip text) returns text
language plpgsql immutable as $$
declare
  a inet;
begin
  if p_ip is null then
    return null;
  end if;
  a := p_ip::inet;
  return network(set_masklen(a, case when family(a) = 4 then 24 else 64 end))::text;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Deneme PRO talebi (programda ilk girişte / sitede hesap sayfasında bir kez)
-- ---------------------------------------------------------------------------
create or replace function public.trial_claim(p_device text default null, p_web_fp text default null, p_fp text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  en boolean;
  days int;
  u_email text;
  u_created timestamptz;
  em text;
  dom text;
  v_ip text := public.trial_client_ip();
  v_pre text;
  dev text := nullif(left(trim(coalesce(p_device, '')), 64), '');
  wfp text := nullif(left(trim(coalesce(p_web_fp, '')), 64), '');
  fph text := nullif(left(trim(coalesce(p_fp, '')), 64), '');
  reasons text[] := '{}';
  m uuid[] := '{}';
  x uuid[];
  rsn text;
  nu timestamptz;
  nm text;
begin
  if uid is null then
    return jsonb_build_object('granted', false);
  end if;
  if length(dev) < 8 then dev := null; end if;
  if length(wfp) < 8 then wfp := null; end if;
  if length(fph) < 8 then fph := null; end if;
  select coalesce(c.trial_enabled, true), greatest(1, least(coalesce(c.trial_days, 3), 30)) into en, days
    from public.app_config c where c.id = 1;
  if not coalesce(en, true) then
    return jsonb_build_object('granted', false);
  end if;
  -- Aynı anda gelen talepler sırayla değerlendirilsin (aynı bilgisayardan iki hesap yarışmasın)
  perform pg_advisory_xact_lock(hashtext('pitwall.trial_claim'));
  if exists (select 1 from public.trial_claims where user_id = uid) then
    return jsonb_build_object('granted', false);
  end if;
  select u.email::text, u.created_at into u_email, u_created from auth.users u where u.id = uid;
  em := public.trial_email_norm(u_email);
  dom := split_part(coalesce(em, ''), '@', 2);
  v_pre := public.trial_ip_prefix(v_ip);

  -- 1) Uygunluk (kötüye kullanım değil; uyarı gitmez)
  if exists (select 1 from public.profiles p where p.id = uid and (p.is_admin or p.pro_until is not null))
     or exists (select 1 from public.subscriptions s where s.user_id = uid)
     or exists (select 1 from public.payments pa where pa.user_id = uid)
     or exists (select 1 from public.pro_log l where l.user_id = uid) then
    rsn := 'had_pro';
  elsif u_created is null or u_created < now() - interval '7 days' then
    rsn := 'not_new';
  else
    -- 2) Kötüye kullanım: hepsi denetlenir, eşleşen hesaplar toplanır
    if public.trial_disposable(dom) then
      reasons := array_append(reasons, 'disposable_email');
    end if;
    if dev is not null then
      select coalesce(array_agg(distinct z), '{}') into x from (
        select c.user_id z from public.trial_claims c where c.device_hash = dev and c.user_id <> uid
        union select d.user_id from public.devices d where d.device_hash = dev and d.user_id <> uid) q;
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_device'); m := m || x; end if;
    end if;
    if wfp is not null then
      select coalesce(array_agg(distinct c.user_id), '{}') into x from public.trial_claims c where c.web_fp = wfp and c.user_id <> uid;
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_browser'); m := m || x; end if;
    end if;
    if em is not null then
      select coalesce(array_agg(distinct z), '{}') into x from (
        select c.user_id z from public.trial_claims c where c.email_norm = em and c.user_id <> uid
        union select au.id from auth.users au
          where au.id <> uid and au.created_at <= u_created and public.trial_email_norm(au.email::text) = em) q;
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_email'); m := m || x; end if;
    end if;
    if v_ip is not null then
      select coalesce(array_agg(distinct c.user_id), '{}') into x from public.trial_claims c
        where c.ip = v_ip and c.user_id <> uid and c.created_at > now() - interval '60 days'
          and c.reason not in ('had_pro', 'not_new');
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_ip'); m := m || x; end if;
    end if;
    if v_pre is not null and fph is not null then
      select coalesce(array_agg(distinct c.user_id), '{}') into x from public.trial_claims c
        where c.ip_prefix = v_pre and c.fp_hash = fph and c.user_id <> uid and c.created_at > now() - interval '7 days'
          and c.reason not in ('had_pro', 'not_new');
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_network'); m := m || x; end if;
    end if;
    rsn := case when cardinality(reasons) > 0 then array_to_string(reasons, ',') else 'granted' end;
  end if;
  select coalesce(array_agg(distinct v), '{}') into m from unnest(m) v;

  insert into public.trial_claims (user_id, granted, reason, matched, device_hash, web_fp, fp_hash, ip, ip_prefix, email_norm, source)
    values (uid, rsn = 'granted', rsn, m, dev, wfp, fph, v_ip, v_pre, em, case when dev is not null then 'app' else 'web' end);

  if rsn = 'granted' then
    perform set_config('pitwall.pro_grant', 'on', true);
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => days),
          pro_source = 'trial'
      where id = uid returning pro_until into nu;
    perform set_config('pitwall.pro_grant', 'off', true);
    -- 10 günlük bitiş uyarısını atla (deneme zaten kısa); son gün uyarısı yine gider
    update public.profiles set pro_warned_until = nu, pro_warned_stage = 1 where id = uid;
    update public.pro_log set note = 'Deneme PRO'
      where id = (select max(id) from public.pro_log where user_id = uid);
    update public.trial_claims set until = nu where user_id = uid;
    insert into public.notifications (user_id, kind, data)
      values (uid, 'trial_started', jsonb_build_object('until', nu, 'days', days));
    return jsonb_build_object('granted', true, 'until', nu, 'days', days);
  end if;

  if rsn not in ('had_pro', 'not_new') then
    select display_name into nm from public.profiles where id = uid;
    insert into public.notifications (user_id, kind, data)
      select a.id, 'trial_abuse', jsonb_build_object(
        'user', uid, 'name', coalesce(nullif(nm, ''), '?'), 'reason', rsn,
        'matches', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name)), '[]'::jsonb)
                    from public.profiles p where p.id = any (m)))
      from public.profiles a where a.is_admin;
  end if;
  return jsonb_build_object('granted', false);
end $$;
revoke all on function public.trial_claim(text, text, text) from public, anon;
grant execute on function public.trial_claim(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Yönetici: deneme talepleri (p_filter: all | granted | denied | suspicious)
-- ---------------------------------------------------------------------------
create or replace function public.admin_trial_claims(p_filter text default 'all')
returns table (user_id uuid, display_name text, email text, account_created timestamptz, created_at timestamptz,
               granted boolean, reason text, matched jsonb, device_hash text, web_fp text, ip text, source text,
               until timestamptz, pro_until timestamptz, pro_source text, admin_action text, admin_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select c.user_id, p.display_name, u.email::text, u.created_at, c.created_at, c.granted, c.reason,
      (select coalesce(jsonb_agg(jsonb_build_object('id', v, 'name', coalesce(mp.display_name, '?'))), '[]'::jsonb)
         from unnest(c.matched) v left join public.profiles mp on mp.id = v),
      c.device_hash, c.web_fp, c.ip, c.source, c.until, p.pro_until, p.pro_source, c.admin_action, c.admin_at
    from public.trial_claims c
    left join public.profiles p on p.id = c.user_id
    left join auth.users u on u.id = c.user_id
    where p_filter = 'all'
       or (p_filter = 'granted' and c.granted)
       or (p_filter = 'denied' and not c.granted)
       or (p_filter = 'suspicious' and c.reason not in ('granted', 'had_pro', 'not_new', 'admin'))
    order by c.created_at desc
    limit 300;
end $$;

-- Yönetici: elle deneme PRO ver (p_grant = true) ya da geri al (false). Döner: yeni PRO bitişi.
-- Geri alma sadece PRO kaynağı hâlâ 'trial' ise PRO'yu kaldırır (sonradan satın alınan PRO'ya dokunmaz).
create or replace function public.admin_trial_set(p_user uuid, p_grant boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  days int;
  nu timestamptz;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  select greatest(1, least(coalesce(trial_days, 3), 30)) into days from public.app_config where id = 1;
  days := coalesce(days, 3);
  if p_grant then
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => days), pro_source = 'trial'
      where id = p_user returning pro_until into nu;
    update public.profiles set pro_warned_until = nu, pro_warned_stage = 1 where id = p_user;
    update public.pro_log set note = 'Deneme PRO (yönetici)'
      where id = (select max(id) from public.pro_log where user_id = p_user);
    insert into public.trial_claims (user_id, granted, reason, until, admin_action, admin_by, admin_at)
      values (p_user, true, 'admin', nu, 'granted', auth.uid(), now())
      on conflict (user_id) do update set granted = true, until = nu, admin_action = 'granted', admin_by = auth.uid(), admin_at = now();
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'trial_started', jsonb_build_object('until', nu, 'days', days));
  else
    update public.profiles set pro_until = null, pro_source = null
      where id = p_user and pro_source = 'trial';
    if found then
      update public.pro_log set note = 'Deneme PRO geri alındı'
        where id = (select max(id) from public.pro_log where user_id = p_user);
    end if;
    select pro_until into nu from public.profiles where id = p_user;
    update public.trial_claims set granted = false, admin_action = 'revoked', admin_by = auth.uid(), admin_at = now()
      where user_id = p_user;
  end if;
  return nu;
end $$;

revoke all on function public.admin_trial_claims(text), public.admin_trial_set(uuid, boolean) from public, anon;
grant execute on function public.admin_trial_claims(text), public.admin_trial_set(uuid, boolean) to authenticated;
revoke all on function public.trial_client_ip() from public, anon, authenticated;
grant all on public.trial_claims to service_role;

-- ---------------------------------------------------------------------------
-- c42: Yönetim panelinden içerik: PRO tanıtım mesajı, overlay önizleme arka planları, çeviri düzeltmeleri.
--      1) app_config.pro_promo (jsonb): PRO olmayanlara programdaki ve sitedeki PRO bölümünde gösterilen tanıtım
--         kartı. {enabled, image, title: {tr, en, …}, text: {…}, button: {…}, action: "plans" | "checkout" | "url",
--         plan: "1m" | "3m" | "6m" | "12m", url, rev}. Herkes okur (app_config zaten herkese açık);
--         yönetici admin_set_pro_promo(jsonb) ile yazar (moderasyon kaydına düşer).
--      2) app_config.preview_backdrops (jsonb): overlay önizlemesinin hazır arka planları için yöneticinin yüklediği
--         görseller ve varsayılan arka plan. {default: "track" | "night" | "cockpit" | "plain",
--         images: {track: url, night: url, cockpit: url}}. Kendi arka planını seçmemiş kullanıcılar yöneticinin
--         varsayılanını görür; programla gelen görseller (çevrimdışı) yedek olarak kalır.
--         Yazma: admin_set_preview_backdrops(jsonb).
--      3) 'site' depolama kovası (herkese açık, en fazla 4 MB, jpeg/png/webp/gif): promo/… ve backdrops/… görselleri.
--         Sadece yöneticiler yükler / değiştirir / siler.
--      4) i18n_overrides (lang, key, value, updated_by, updated_at): yöneticinin çeviri düzeltmeleri.
--         key: "app:<programdaki Türkçe kaynak metin>" ya da "site:<web sitesi anahtarı>". 'tr' de olabilir
--         (Türkçe metnin yerine geçer). Okuma: i18n_overrides(p_lang) → {anahtar: değer} (anon da okur).
--         Yönetici: i18n_overrides_admin(p_lang) (kimin, ne zaman), i18n_override_set(p_lang, p_key, p_value)
--         (boş değer = düzeltmeyi kaldır).
-- Sıra: herhangi bir zamanda (log_mod, is_admin hazır olmalı).
-- ---------------------------------------------------------------------------

-- 1-2) app_config sütunları ---------------------------------------------------------
alter table public.app_config add column if not exists pro_promo jsonb not null default '{}'::jsonb;
alter table public.app_config add column if not exists preview_backdrops jsonb not null default '{}'::jsonb;

create or replace function public.admin_set_pro_promo(p_promo jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  before jsonb;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_promo is null or jsonb_typeof(p_promo) <> 'object' then
    raise exception 'Geçersiz veri';
  end if;
  if length(p_promo::text) > 20000 then
    raise exception 'Tanıtım mesajı çok uzun';
  end if;
  select pro_promo into before from public.app_config where id = 1;
  update public.app_config set pro_promo = p_promo, updated_at = now() where id = 1;
  perform public.log_mod('pro_promo_set', 'config', 'pro_promo', null,
    jsonb_build_object('enabled', coalesce((p_promo ->> 'enabled')::boolean, false),
                       'old_enabled', coalesce((before ->> 'enabled')::boolean, false),
                       'title', left(coalesce(p_promo -> 'title' ->> 'tr', p_promo -> 'title' ->> 'en', ''), 120)));
end $$;
revoke all on function public.admin_set_pro_promo(jsonb) from public, anon;
grant execute on function public.admin_set_pro_promo(jsonb) to authenticated;

create or replace function public.admin_set_preview_backdrops(p_cfg jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  before jsonb;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then
    raise exception 'Geçersiz veri';
  end if;
  if coalesce(p_cfg ->> 'default', 'track') not in ('track', 'night', 'cockpit', 'plain') then
    raise exception 'Geçersiz varsayılan arka plan';
  end if;
  if length(p_cfg::text) > 8000 then
    raise exception 'Çok uzun';
  end if;
  select preview_backdrops into before from public.app_config where id = 1;
  update public.app_config set preview_backdrops = p_cfg, updated_at = now() where id = 1;
  perform public.log_mod('preview_backdrops_set', 'config', 'preview_backdrops', null,
    jsonb_build_object('default', coalesce(p_cfg ->> 'default', 'track'), 'old_default', coalesce(before ->> 'default', 'track'),
                       'images', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(coalesce(p_cfg -> 'images', '{}'::jsonb)) k)));
end $$;
revoke all on function public.admin_set_preview_backdrops(jsonb) from public, anon;
grant execute on function public.admin_set_preview_backdrops(jsonb) to authenticated;

-- 3) 'site' kovası ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site admin insert" on storage.objects;
create policy "site admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.is_admin());
drop policy if exists "site admin read" on storage.objects;
create policy "site admin read" on storage.objects for select to authenticated
  using (bucket_id = 'site' and public.is_admin());
drop policy if exists "site admin update" on storage.objects;
create policy "site admin update" on storage.objects for update to authenticated
  using (bucket_id = 'site' and public.is_admin());
drop policy if exists "site admin delete" on storage.objects;
create policy "site admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.is_admin());

-- 4) Çeviri düzeltmeleri ------------------------------------------------------------
create table if not exists public.i18n_overrides (
  lang text not null check (lang in ('tr', 'en', 'de', 'es', 'pt-BR', 'pt-PT', 'fr', 'it', 'nl', 'pl', 'sv', 'fi', 'ru', 'zh-CN', 'ja')),
  key text not null check (key ~ '^(app|site):' and length(key) between 5 and 3000),
  value text not null check (length(value) between 1 and 8000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (lang, key)
);
alter table public.i18n_overrides enable row level security;
drop policy if exists "i18n overrides readable" on public.i18n_overrides;
create policy "i18n overrides readable" on public.i18n_overrides for select using (true);
grant select on public.i18n_overrides to anon, authenticated;
grant all on public.i18n_overrides to service_role;

-- Herkes: bir dilin düzeltmeleri {anahtar: değer}
create or replace function public.i18n_overrides(p_lang text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb) from public.i18n_overrides o where o.lang = p_lang;
$$;
grant execute on function public.i18n_overrides(text) to anon, authenticated, service_role;

-- Yönetici: bir dilin düzeltmeleri, kim ne zaman yaptı
create or replace function public.i18n_overrides_admin(p_lang text)
returns table (key text, value text, updated_at timestamptz, updated_by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select o.key, o.value, o.updated_at, coalesce(p.display_name, '')
    from public.i18n_overrides o left join public.profiles p on p.id = o.updated_by
    where o.lang = p_lang
    order by o.updated_at desc;
end $$;
revoke all on function public.i18n_overrides_admin(text) from public, anon;
grant execute on function public.i18n_overrides_admin(text) to authenticated;

-- Yönetici: düzeltme yaz (boş değer: kaldır)
create or replace function public.i18n_override_set(p_lang text, p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare
  old text;
  v text := coalesce(p_value, '');
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select o.value into old from public.i18n_overrides o where o.lang = p_lang and o.key = p_key;
  if btrim(v) = '' then
    delete from public.i18n_overrides where lang = p_lang and key = p_key;
    if old is not null then
      perform public.log_mod('i18n_delete', 'i18n', p_lang || '|' || left(p_key, 300), null,
        jsonb_build_object('lang', p_lang, 'key', left(p_key, 300), 'old', left(old, 300)));
    end if;
    return;
  end if;
  insert into public.i18n_overrides (lang, key, value, updated_by, updated_at)
    values (p_lang, p_key, v, auth.uid(), now())
    on conflict (lang, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform public.log_mod('i18n_set', 'i18n', p_lang || '|' || left(p_key, 300), null,
    jsonb_build_object('lang', p_lang, 'key', left(p_key, 300), 'value', left(v, 300), 'old', left(old, 300)));
end $$;
revoke all on function public.i18n_override_set(text, text, text) from public, anon;
grant execute on function public.i18n_override_set(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- c43: Canlı Sohbet › Sohbete yaz için geliştirici uygulamalarının HERKESE AÇIK istemci kimlikleri.
--      app_config.livechat_twitch_client_id   Twitch uygulaması (Public istemci, Device Code Flow; gizli anahtar yok)
--      app_config.livechat_youtube_client_id  Google OAuth istemcisi (Masaüstü uygulaması; YouTube Data API v3)
--      app_config.livechat_kick_client_id     Kick geliştirici uygulaması
--      Program bu kimliklerle giriş adresini kurar. app_config herkese açık okunur (kimlikler gizli değildir);
--      sadece yönetici yazar (mevcut "config admin update" politikası). Yönetim › Canlı Sohbet ayarları'ndan girilir.
--      GİZLİ anahtarlar (client secret) veritabanında TUTULMAZ: Supabase › Edge Functions › Secrets
--      (YT_CLIENT_ID, YT_CLIENT_SECRET, KICK_CLIENT_ID, KICK_CLIENT_SECRET) — sadece chat-oauth işlevi kullanır.
--      Kurulum: docs/canli_sohbet_kurulum.md
-- Sıra: herhangi bir zamanda (bağımsız).
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists livechat_twitch_client_id text not null default '';
alter table public.app_config add column if not exists livechat_youtube_client_id text not null default '';
alter table public.app_config add column if not exists livechat_kick_client_id text not null default '';

-- Kimlikler kısa ve sadece güvenli karakterler (yanlışlıkla gizli anahtar / boşluk yapıştırılmasın diye uzunluk sınırı)
alter table public.app_config drop constraint if exists app_config_livechat_ids_chk;
alter table public.app_config add constraint app_config_livechat_ids_chk check (
  length(livechat_twitch_client_id) <= 100 and livechat_twitch_client_id ~ '^[A-Za-z0-9._-]*$'
  and length(livechat_youtube_client_id) <= 200 and livechat_youtube_client_id ~ '^[A-Za-z0-9._-]*$'
  and length(livechat_kick_client_id) <= 100 and livechat_kick_client_id ~ '^[A-Za-z0-9._-]*$'
);

-- ---------------------------------------------------------------------------
-- c44: (1) Yönetim bekleyen iş sayaçları, (2) Güvenilir arkadaşlar: canlı veriyi (takım yakıtı) kodsuz paylaşma.
--
-- 1) admin_badge_counts() -> jsonb: Yönetim bölümlerinde bekleyen işlerin sayısı (anahtar = bölüm kimliği).
--      support     yanıt bekleyen destek talepleri (status = 'open')            — is_moderator()
--      moderation  açık içerik raporları (has_perm('reports.view')) + açık mesaj raporları (sadece yönetici)
--      voicepacks  yeni ses paketi gönderileri (status = 'new')                 — is_admin()
--      trial       şüpheli deneme talepleri: yönetici işlem yapmamış ve bu yöneticinin
--                  bölümü son açışından sonra gelmiş (admin_seen; ilk kez: son 30 gün) — is_admin()
--      ads         onay bekleyen / raporlarla gizlenen reklamlar                 — is_admin()
--      devices     kapatılmamış cihaz sınırı uyarısı olan hesaplar               — is_admin()
--    Çağıranın görebildiği sayılar döner; yetkisi olmayana (ya da girişsiz) boş nesne — hata fırlatmaz.
--    admin_badge_seen(p_section): bölümü "görüldü" işaretler (şimdilik sadece 'trial' sayacını etkiler).
--
-- 2) Güvenilir arkadaşlar (Ayarlar › Paylaşım › Takım yakıtı). Kod (MQTT takım kodu) vermeden paylaşım:
--    Paylaşan, yarışırken canlı verisini live_data tablosundaki kendi satırına yazar (zaten vardı, c27/c33).
--    Okuma yetkisi live_visible(owner) ile verilir (RLS + Realtime aynı kuralı kullanır). Bu sürümde:
--      - share_prefs.trust_all: "Tüm arkadaşlarım" anahtarı (kabul edilmiş tüm arkadaşlar görür)
--      - live_trusts(owner, viewer): arkadaşlık kabul edilmiş VE (friendships.trusted ya da owner trust_all)
--      - live_visible() ve my_friends().trusts_me artık live_trusts() kullanır
--      - friend_trust_set(p_user, p_trusted): sadece güvenilir işaretini değiştirir (sessiz ayarına dokunmaz)
--      - share_trust_get() / share_trust_all_set(p_on)
--      - friend_shares(): bana güvenen arkadaşlar + son canlı verileri (izleyen tarafta liste; kod dönmez)
--    Takım kodu hiçbir zaman sunucuya yazılmaz / arkadaşlara verilmez; kodlu (MQTT) akış aynen çalışır.
--    Arkadaşlık silinince friendships satırları silinir -> güven de kalkar (trust_all da arkadaşlık ister).
--    PRO kuralı değişmedi: 'social.data_share' PRO'ya özelse paylaşan PRO olmalı (izleyen olmak zorunda değil).
-- Sıra: c33 (feature_requires_pro, live_visible) ve c41 (trial_claims) sonrasında.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) Yönetim sayaçları
-- ===========================================================================
create table if not exists public.admin_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  section text not null check (char_length(section) between 1 and 40),
  seen_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.admin_seen enable row level security;
drop policy if exists "admin seen own" on public.admin_seen;
create policy "admin seen own" on public.admin_seen for select using (auth.uid() = user_id);
grant all on public.admin_seen to service_role;

create or replace function public.admin_badge_seen(p_section text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_admin() or public.is_moderator()) then
    return;
  end if;
  insert into public.admin_seen (user_id, section, seen_at) values (auth.uid(), left(coalesce(p_section, ''), 40), now())
    on conflict (user_id, section) do update set seen_at = now();
end $$;
revoke all on function public.admin_badge_seen(text) from public, anon;
grant execute on function public.admin_badge_seen(text) to authenticated;

create or replace function public.admin_badge_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  adm boolean;
  mdr boolean;
  r jsonb := '{}'::jsonb;
  n int;
  seen timestamptz;
begin
  if auth.uid() is null then
    return r;
  end if;
  adm := public.is_admin();
  mdr := adm or public.is_moderator();
  if not mdr then
    return r;
  end if;

  -- Destek: son yazan kullanıcı, yanıt bekliyor
  select count(*)::int into n from public.support_tickets where status = 'open';
  r := r || jsonb_build_object('support', n);

  -- Moderasyon: açık içerik raporları (+ yönetici için açık mesaj raporları)
  select count(*)::int into n from public.reports where status = 'open';
  if adm then
    n := n + (select count(*)::int from public.message_reports where status = 'open');
  end if;
  r := r || jsonb_build_object('moderation', n);

  if adm then
    select count(*)::int into n from public.voice_pack_submissions where status = 'new';
    r := r || jsonb_build_object('voicepacks', n);

    select seen_at into seen from public.admin_seen where user_id = auth.uid() and section = 'trial';
    select count(*)::int into n from public.trial_claims c
      where c.reason not in ('granted', 'had_pro', 'not_new', 'admin') and c.admin_action = ''
        and c.created_at > coalesce(seen, now() - interval '30 days');
    r := r || jsonb_build_object('trial', n);

    select count(*)::int into n from public.ad_campaigns where status in ('pending_review', 'paused_reports');
    r := r || jsonb_build_object('ads', n);

    select count(distinct user_id)::int into n from public.device_flags where not resolved;
    r := r || jsonb_build_object('devices', n);
  end if;
  return r;
exception when others then
  -- Sayaç hiçbir zaman arayüzü bozmasın (ör. eksik tablo)
  return r;
end $$;
revoke all on function public.admin_badge_counts() from public, anon;
grant execute on function public.admin_badge_counts() to authenticated;

-- ===========================================================================
-- 2) Güvenilir arkadaşlar: kodsuz canlı veri paylaşımı
-- ===========================================================================
create table if not exists public.share_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Kabul edilmiş tüm arkadaşlarım canlı verimi görebilir
  trust_all boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.share_prefs enable row level security;
drop policy if exists "share prefs own" on public.share_prefs;
create policy "share prefs own" on public.share_prefs for select using (auth.uid() = user_id);
grant select on public.share_prefs to authenticated;
grant all on public.share_prefs to service_role;

-- owner, viewer'a güveniyor mu: arkadaşlık kabul edilmiş VE (tek tek güvenilir ya da "tüm arkadaşlarım")
create or replace function public.live_trusts(p_owner uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.user_id = p_owner and f.friend_id = p_viewer and f.status = 'accepted'
      and (f.trusted or coalesce((select sp.trust_all from public.share_prefs sp where sp.user_id = p_owner), false)));
$$;
revoke all on function public.live_trusts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.live_trusts(uuid, uuid) to service_role;

-- live_data okuma kuralı (RLS "live trusted read" ve Realtime bunu kullanır)
create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (public.live_trusts(p_owner, auth.uid())
        and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(p_owner))));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;

-- Sadece güvenilir işareti (friend_set sessiz ayarını da yazıyordu; ayarlar ekranı bunu kullanır)
create or replace function public.friend_trust_set(p_user uuid, p_trusted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_trusted and public.feature_requires_pro('social.data_share', true) and not public.is_pro()
     and not coalesce((select trusted from public.friendships where user_id = auth.uid() and friend_id = p_user), false) then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  update public.friendships set trusted = coalesce(p_trusted, false)
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
  if not found then
    raise exception 'Arkadaş bulunamadı';
  end if;
end $$;
revoke all on function public.friend_trust_set(uuid, boolean) from public, anon;
grant execute on function public.friend_trust_set(uuid, boolean) to authenticated;

create or replace function public.share_trust_all_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if coalesce(p_on, false) and public.feature_requires_pro('social.data_share', true) and not public.is_pro() then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  insert into public.share_prefs (user_id, trust_all, updated_at) values (auth.uid(), coalesce(p_on, false), now())
    on conflict (user_id) do update set trust_all = excluded.trust_all, updated_at = now();
end $$;
revoke all on function public.share_trust_all_set(boolean) from public, anon;
grant execute on function public.share_trust_all_set(boolean) to authenticated;

create or replace function public.share_trust_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trust_all', coalesce((select trust_all from public.share_prefs where user_id = auth.uid()), false),
    'needs_pro', public.feature_requires_pro('social.data_share', true) and not public.is_pro());
$$;
revoke all on function public.share_trust_get() from public, anon;
grant execute on function public.share_trust_get() to authenticated;

-- İzleyen taraf: verisini görebildiğim (bana güvenen) arkadaşlar + son canlı verileri.
-- live: son 2 dakikada veri göndermiş (şu an paylaşıyor). Takım kodu ya da başka gizli bilgi dönmez.
create or replace function public.friend_shares()
returns table (friend_id uuid, display_name text, avatar_path text, online boolean, racing boolean,
               track text, car text, live boolean, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.avatar_path,
         coalesce(s.updated_at > now() - interval '3 minutes', false),
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false),
         coalesce(s.track, ''), coalesce(s.car, ''),
         coalesce(l.updated_at > now() - interval '2 minutes', false),
         case when l.updated_at > now() - interval '10 minutes' then l.data end,
         l.updated_at
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.user_status s on s.user_id = f.friend_id
  left join public.live_data l on l.user_id = f.friend_id
  where f.user_id = auth.uid() and f.status = 'accepted' and public.live_visible(f.friend_id)
  order by coalesce(l.updated_at > now() - interval '2 minutes', false) desc,
           coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.friend_shares() from public, anon;
grant execute on function public.friend_shares() to authenticated;

-- my_friends: c33'teki son tanım (dönüş sütunları aynı); trusts_me artık "tüm arkadaşlarım"ı da sayar
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int, avatar_path text, sim text)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         f.status = 'accepted' and public.live_trusts(f.friend_id, f.user_id)
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
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- c45: (1) Sohbet grupları, (2) Sohbet arka planı: sohbette mesaj olarak görünür; grup / takımda sadece sahip değiştirir.
--
-- 1) Sohbet grupları (Arkadaşlar listesinde "Gruplar"):
--      chat_groups (ad, sahip), chat_group_members (son okuma, sessize alma, davet eden),
--      group_messages (Realtime; meta = sistem mesajı bilgisi; deleted = herkesten silindi).
--    Tablolara doğrudan yazılamaz; okuma sadece üyeler (is_group_member). İşlemler RPC ile:
--      group_create(ad, arkadaşlar[])  grup kurar, seçilen arkadaşları ekler (sahip başına en fazla 20 grup)
--      group_invite(grup, kişiler[])   her üye kendi KABUL EDİLMİŞ arkadaşlarını ekleyebilir (grup en fazla 50 üye).
--                                      Çağıranı sessize almış ya da mesajları kapalı olan kişi eklenmez (atlanır).
--                                      Eklenen kişiye 'group_added' bildirimi gider (e-posta yok).
--      group_leave(grup)               gruptan ayrıl. Sahip ayrılırsa sahiplik en eski üyeye geçer;
--                                      kimse kalmazsa grup ve mesajları kendiliğinden silinir (üye silme tetikleyicisi;
--                                      hesap silinince de aynı kural çalışır).
--      group_kick(grup, kişi)          sadece sahip; çıkarılana 'group_removed' bildirimi
--      group_delete(grup)              sadece sahip (ya da yönetici): grup, üyelikler ve mesajlar silinir
--      group_rename(grup, ad)          sadece sahip
--      group_send / group_chat / group_message_delete (kendi mesajın; sahip her mesajı) / group_read / group_mute
--      my_groups()                     gruplarım: sahip miyim, sessiz, okunmamış, son mesaj, üye sayısı
--      group_members(grup)             üyeler (ad, avatar, sahip mi)
--      group_message_report(mesaj, sebep, not)  grup mesajını yöneticilere raporla (message_reports'a yazılır;
--                                      admin_message_reports / admin_message_report_set grup mesajlarını da kapsar)
--    Mesaj yazmak 'social.messages' PRO kuralına uyar (1:1 mesajla aynı), dakikada 30 mesaj sınırı aynı.
--
-- 2) Sohbet arka planı:
--      messages.meta / team_messages.meta / group_messages.meta (jsonb): sistem mesajı bilgisi.
--        {"t":"bg","kind":"solid|gradient|image|none","value":"…","image":"<chatbg yolu>"}
--        grup: {"t":"join|leave|kick|owner|rename", "user":…, "name":…, "by_name":…}
--      1:1 sohbet (kişiye özel; benim seçimim karşı tarafı zorlamaz):
--        chat_bg_announce(arkadaş, tür, değer, görsel) → sohbete "arka planını değiştirdi" mesajı yazar. Karşı taraf
--        mesaja tıklayıp aynı arka planı kendi tarafında kullanabilir (görsel "chatbg" kovasında <a>_<b>/ klasöründe,
--        c37 kuralları: sadece iki taraf okur). Dönüş: {id, old[]} — old: artık gerekmeyen eski görseller
--        (son 2 değişikliğin görseli saklanır; uygulama diğerlerini kovadan siler).
--      Grup ve takım sohbeti (herkese uygulanır, sadece GRUP SAHİBİ / TAKIM SAHİBİ değiştirir):
--        chat_room_bg (scope = 'group' | 'team', room_id) tek satır; okuma: üyeler.
--        room_bg_set(scope, oda, tür, değer, görsel) / room_bg_clear(scope, oda) → odaya sistem mesajı da yazar.
--        Görseller "chatbg" kovasında g_<grup id>/ ve t_<takım id>/ klasörlerinde:
--        yükleme ve silme sadece sahip, okuma üyeler (depolama kuralları aşağıda).
--      'social.chat_bg' PRO kuralı (c40) bu RPC'ler için de geçerlidir.
--      team_chat() artık meta alanını da döndürür.
--      c37'deki öner / kabul et akışı (chat_bg_propose …) yerinde durur; uygulama artık kullanmıyor.
-- Sıra: c30 (takımlar), c37 (chatbg kovası), c40 (feature_requires_pro) ve c44 sonrasında.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 0) Sistem mesajı alanı
-- ===========================================================================
alter table public.messages add column if not exists meta jsonb;
alter table public.team_messages add column if not exists meta jsonb;

-- ===========================================================================
-- 1) Sohbet grupları
-- ===========================================================================
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  -- Sahibin hesabı silinirse boş kalır; üye silme tetikleyicisi en eski üyeyi sahip yapar
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_groups_owner on public.chat_groups (owner_id);
alter table public.chat_groups enable row level security;

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_group_members_user on public.chat_group_members (user_id);
alter table public.chat_group_members enable row level security;

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 1000),
  meta jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or char_length(body) >= 1)
);
create index if not exists group_messages_group on public.group_messages (group_id, created_at desc);
create index if not exists group_messages_sender on public.group_messages (sender, created_at desc);
alter table public.group_messages enable row level security;

-- security definer: RLS döngüsüne girmeden üyelik denetimi
create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.chat_group_members where group_id = p_group and user_id = auth.uid());
$$;
create or replace function public.is_group_owner(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.chat_groups where id = p_group and owner_id = auth.uid());
$$;
grant execute on function public.is_group_member(uuid), public.is_group_owner(uuid) to authenticated;

drop policy if exists "chat groups members" on public.chat_groups;
create policy "chat groups members" on public.chat_groups for select using (public.is_group_member(id));
drop policy if exists "chat group members read" on public.chat_group_members;
create policy "chat group members read" on public.chat_group_members for select using (public.is_group_member(group_id));
drop policy if exists "group messages members" on public.group_messages;
create policy "group messages members" on public.group_messages for select using (public.is_group_member(group_id));

grant select on public.chat_groups, public.chat_group_members, public.group_messages to authenticated;
grant all on public.chat_groups, public.chat_group_members, public.group_messages to service_role;

do $$ begin
  alter publication supabase_realtime add table public.group_messages;
exception when others then null; end $$;

-- Üye ayrılınca / çıkarılınca / hesabı silinince: kimse kalmadıysa grup silinir, sahip gittiyse en eski üye sahip olur
create or replace function public.chat_group_member_gone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g public.chat_groups;
  nxt uuid;
begin
  select * into g from public.chat_groups where id = old.group_id;
  if not found then
    return null; -- grup zaten siliniyor
  end if;
  select user_id into nxt from public.chat_group_members
    where group_id = old.group_id order by joined_at, user_id limit 1;
  if nxt is null then
    delete from public.chat_groups where id = old.group_id;
    return null;
  end if;
  if g.owner_id is null or g.owner_id = old.user_id
     or not exists (select 1 from public.chat_group_members where group_id = old.group_id and user_id = g.owner_id) then
    update public.chat_groups set owner_id = nxt, updated_at = now() where id = old.group_id;
    insert into public.group_messages (group_id, sender, body, meta)
      values (old.group_id, nxt, '👑 Grubun yeni sahibi oldu',
              jsonb_build_object('t', 'owner', 'user', nxt,
                'name', coalesce((select display_name from public.profiles where id = nxt), '?')));
  end if;
  return null;
end $$;
drop trigger if exists chat_group_member_gone on public.chat_group_members;
create trigger chat_group_member_gone after delete on public.chat_group_members
  for each row execute function public.chat_group_member_gone();

-- İç yardımcı: p_by, kabul edilmiş arkadaşlarını gruba ekler. Dönüş: eklenen kişi sayısı. (Doğrudan çağrılamaz.)
create or replace function public.chat_group_add(p_group uuid, p_by uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  u uuid;
  n int := 0;
  cnt int;
  g_name text;
  by_name text;
  u_name text;
begin
  select name into g_name from public.chat_groups where id = p_group;
  select coalesce(display_name, '?') into by_name from public.profiles where id = p_by;
  select count(*) into cnt from public.chat_group_members where group_id = p_group;
  for u in select distinct x from unnest(coalesce(p_users, '{}'::uuid[])) x where x is not null and x <> p_by limit 60 loop
    continue when exists (select 1 from public.chat_group_members where group_id = p_group and user_id = u);
    continue when not public.are_friends(p_by, u);
    -- Davet edeni sessize alan ya da mesajları kapatan kişi gruba eklenemez
    continue when coalesce((select muted from public.friendships where user_id = u and friend_id = p_by), false);
    continue when not coalesce((select accept_messages from public.user_status where user_id = u), true);
    continue when (select count(*) from public.chat_group_members where user_id = u) >= 100;
    if cnt >= 50 then
      raise exception 'Bir grupta en fazla 50 kişi olabilir';
    end if;
    insert into public.chat_group_members (group_id, user_id, invited_by) values (p_group, u, p_by);
    cnt := cnt + 1;
    n := n + 1;
    select coalesce(display_name, '?') into u_name from public.profiles where id = u;
    insert into public.group_messages (group_id, sender, body, meta)
      values (p_group, p_by, '➕ ' || coalesce(u_name, '?') || ' gruba eklendi',
              jsonb_build_object('t', 'join', 'user', u, 'name', coalesce(u_name, '?'), 'by_name', coalesce(by_name, '?')));
    insert into public.notifications (user_id, kind, data)
      values (u, 'group_added', jsonb_build_object('group', p_group, 'group_name', g_name, 'from', p_by, 'name', coalesce(by_name, '?')));
  end loop;
  return n;
end $$;
revoke all on function public.chat_group_add(uuid, uuid, uuid[]) from public, anon, authenticated;

create or replace function public.group_create(p_name text, p_members uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
  gid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.messages', false) and not public.is_pro() then
    raise exception 'Grup kurmak PRO üyelik gerektirir';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Grup adı en az 2 karakter olmalı';
  end if;
  if (select count(*) from public.chat_groups where owner_id = me) >= 20 then
    raise exception 'En fazla 20 grubun sahibi olabilirsin';
  end if;
  if (select count(*) from public.chat_group_members where user_id = me) >= 100 then
    raise exception 'Çok fazla gruptasın';
  end if;
  insert into public.chat_groups (name, owner_id) values (v_name, me) returning id into gid;
  insert into public.chat_group_members (group_id, user_id) values (gid, me);
  perform public.chat_group_add(gid, me, p_members);
  return gid;
end $$;

create or replace function public.group_invite(p_group uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  if (select count(*) from public.notifications where kind = 'group_added' and data ->> 'from' = me::text
        and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Çok fazla davet gönderdin, biraz bekle';
  end if;
  return public.chat_group_add(p_group, me, p_users);
end $$;

create or replace function public.group_leave(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text;
begin
  if me is null or not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  if (select count(*) from public.chat_group_members where group_id = p_group) > 1 then
    select coalesce(display_name, '?') into v_name from public.profiles where id = me;
    insert into public.group_messages (group_id, sender, body, meta)
      values (p_group, me, '🚪 ' || coalesce(v_name, '?') || ' gruptan ayrıldı',
              jsonb_build_object('t', 'leave', 'user', me, 'name', coalesce(v_name, '?')));
  end if;
  delete from public.notifications where user_id = me and kind = 'group_added' and data ->> 'group' = p_group::text;
  -- Sahiplik devri ve boş grubun silinmesi: chat_group_member_gone tetikleyicisi
  delete from public.chat_group_members where group_id = p_group and user_id = me;
end $$;

create or replace function public.group_kick(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text;
  g_name text;
begin
  if me is null or not public.is_group_owner(p_group) then
    raise exception 'Sadece grup sahibi üye çıkarabilir';
  end if;
  if p_user is null or p_user = me then
    raise exception 'Kendini çıkaramazsın; gruptan ayrılabilirsin';
  end if;
  if not exists (select 1 from public.chat_group_members where group_id = p_group and user_id = p_user) then
    raise exception 'Bu kişi grupta değil';
  end if;
  select coalesce(display_name, '?') into v_name from public.profiles where id = p_user;
  select name into g_name from public.chat_groups where id = p_group;
  delete from public.chat_group_members where group_id = p_group and user_id = p_user;
  insert into public.group_messages (group_id, sender, body, meta)
    values (p_group, me, '➖ ' || coalesce(v_name, '?') || ' gruptan çıkarıldı',
            jsonb_build_object('t', 'kick', 'user', p_user, 'name', coalesce(v_name, '?')));
  delete from public.notifications where user_id = p_user and kind = 'group_added' and data ->> 'group' = p_group::text;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'group_removed', jsonb_build_object('group', p_group, 'group_name', g_name));
end $$;

create or replace function public.group_delete(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_group_owner(p_group) or public.is_admin()) then
    raise exception 'Sadece grup sahibi grubu silebilir';
  end if;
  delete from public.notifications where kind = 'group_added' and data ->> 'group' = p_group::text;
  delete from public.chat_groups where id = p_group;
end $$;

create or replace function public.group_rename(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
begin
  if me is null or not public.is_group_owner(p_group) then
    raise exception 'Sadece grup sahibi adı değiştirebilir';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Grup adı en az 2 karakter olmalı';
  end if;
  update public.chat_groups set name = v_name, updated_at = now() where id = p_group and name is distinct from v_name;
  if found then
    insert into public.group_messages (group_id, sender, body, meta)
      values (p_group, me, '✏️ Grubun adı değişti: ' || v_name, jsonb_build_object('t', 'rename', 'name', v_name));
  end if;
end $$;

create or replace function public.group_send(p_group uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if me is null or not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  if public.feature_requires_pro('social.messages', false) and not public.is_pro() then
    raise exception 'Mesaj göndermek PRO üyelik gerektirir';
  end if;
  if v_body = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if (select count(*) from public.group_messages where sender = me and meta is null and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.group_messages (group_id, sender, body) values (p_group, me, v_body) returning id into mid;
  update public.chat_group_members set last_read_at = now() where group_id = p_group and user_id = me;
  return mid;
end $$;

create or replace function public.group_message_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.group_messages;
begin
  select * into m from public.group_messages where id = p_id;
  if m.id is null or not (public.is_group_member(m.group_id) or public.is_admin()) then
    raise exception 'Mesaj bulunamadı';
  end if;
  if m.meta is not null and not public.is_admin() then
    raise exception 'Sistem mesajları silinemez';
  end if;
  if m.sender is distinct from auth.uid() and not public.is_group_owner(m.group_id) and not public.is_admin() then
    raise exception 'Sadece kendi mesajını silebilirsin';
  end if;
  update public.group_messages set deleted = true, body = '', meta = null where id = p_id;
end $$;

create or replace function public.group_read(p_group uuid) returns void
language sql security definer set search_path = public as $$
  update public.chat_group_members set last_read_at = now() where group_id = p_group and user_id = auth.uid();
$$;
create or replace function public.group_mute(p_group uuid, p_muted boolean) returns void
language sql security definer set search_path = public as $$
  update public.chat_group_members set muted = coalesce(p_muted, false) where group_id = p_group and user_id = auth.uid();
$$;

create or replace function public.group_chat(p_group uuid, p_before timestamptz default null, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at) from (
      select m.created_at, jsonb_build_object('id', m.id, 'group_id', m.group_id, 'sender', m.sender,
               'sender_name', coalesce(p.display_name, '?'), 'body', m.body, 'meta', m.meta, 'deleted', m.deleted,
               'created_at', m.created_at) as j
      from public.group_messages m
      left join public.profiles p on p.id = m.sender
      where m.group_id = p_group and (p_before is null or m.created_at < p_before)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;

drop function if exists public.my_groups();
create or replace function public.my_groups()
returns table (group_id uuid, name text, owner_id uuid, is_owner boolean, muted boolean, unread int,
               last_body text, last_at timestamptz, last_sender uuid, last_sender_name text, last_system boolean,
               member_count int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.owner_id, g.owner_id = auth.uid(), m.muted,
         (select count(*)::int from public.group_messages x
          where x.group_id = g.id and x.created_at > m.last_read_at
            and x.sender is distinct from auth.uid() and not x.deleted),
         lm.body, lm.created_at, lm.sender, lm.sender_name, coalesce(lm.is_system, false),
         (select count(*)::int from public.chat_group_members c where c.group_id = g.id),
         g.created_at
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  left join lateral (
    select x.body, x.created_at, x.sender, coalesce(p.display_name, '?') as sender_name, x.meta is not null as is_system
    from public.group_messages x left join public.profiles p on p.id = x.sender
    where x.group_id = g.id and not x.deleted
    order by x.created_at desc limit 1) lm on true
  where m.user_id = auth.uid()
  order by coalesce(lm.created_at, g.created_at) desc, g.name;
$$;

drop function if exists public.group_members(uuid);
create or replace function public.group_members(p_group uuid)
returns table (user_id uuid, display_name text, avatar_path text, is_owner boolean, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(p.display_name, '?'), p.avatar_path, g.owner_id = m.user_id, m.joined_at
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  join public.profiles p on p.id = m.user_id
  where m.group_id = p_group and public.is_group_member(p_group)
  order by (g.owner_id = m.user_id) desc, m.joined_at, p.display_name;
$$;

-- Grup mesajı raporları: message_reports tablosuna yazılır (mesaj silinse de metnin kopyası kalır)
alter table public.message_reports add column if not exists group_message_id uuid references public.group_messages (id) on delete set null;
alter table public.message_reports add column if not exists group_name text;
create unique index if not exists message_reports_group_once on public.message_reports (reporter, group_message_id)
  where group_message_id is not null;

create or replace function public.group_message_report(p_message uuid, p_reason text, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.group_messages;
  rid uuid;
  g_name text;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate', 'scam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  select * into m from public.group_messages where id = p_message;
  if m.id is null or m.deleted or m.meta is not null or not public.is_group_member(m.group_id) or m.sender is not distinct from me then
    raise exception 'Sadece grubundaki başkasının mesajını raporlayabilirsin';
  end if;
  if (select count(*) from public.message_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  if exists (select 1 from public.message_reports where reporter = me and group_message_id = p_message) then
    raise exception 'Bu mesajı zaten raporladın';
  end if;
  select name into g_name from public.chat_groups where id = m.group_id;
  insert into public.message_reports (group_message_id, group_name, reporter, reported, reason, note, body, message_at)
    values (p_message, g_name, me, m.sender, p_reason, left(trim(coalesce(p_note, '')), 500), m.body, m.created_at)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'message_reported', jsonb_build_object(
      'report', rid, 'reason', p_reason, 'text', left(m.body, 200), 'note', left(trim(coalesce(p_note, '')), 200),
      'group_name', g_name,
      'reporter', me, 'reporter_name', coalesce((select display_name from public.profiles where id = me), '?'),
      'reported', m.sender, 'reported_name', coalesce((select display_name from public.profiles where id = m.sender), '?'))
    from public.profiles p where p.is_admin;
  return rid;
end $$;

-- Yönetici: mesaj raporları (c27) — grup mesajı raporları da gelir (group_name dolu)
create or replace function public.admin_message_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id, r.message_id, r.group_message_id, r.group_name, r.reason, r.note, r.body, r.message_at, r.status,
             r.created_at, r.handled_at,
             r.reporter, coalesce(a.display_name, '?') as reporter_name,
             r.reported, coalesce(b.display_name, '?') as reported_name,
             coalesce(h.display_name, '') as handled_name,
             (r.message_id is not null
              or exists (select 1 from public.group_messages gm where gm.id = r.group_message_id and not gm.deleted)) as message_exists,
             (select count(*)::int from public.message_reports o where o.reported = r.reported and r.reported is not null) as reported_total
      from public.message_reports r
      left join public.profiles a on a.id = r.reporter
      left join public.profiles b on b.id = r.reported
      left join public.profiles h on h.id = r.handled_by
      where coalesce(p_status, '') = '' or r.status = p_status
      order by r.created_at desc
      limit 300
    ) x), '[]'::jsonb);
end $$;

-- Yönetici işlemleri (c27): dismiss | resolve | reopen | delete_message — grup mesajı "herkesten silindi" yapılır
create or replace function public.admin_message_report_set(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.message_reports;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into r from public.message_reports where id = p_id for update;
  if r.id is null then
    raise exception 'Rapor bulunamadı';
  end if;
  if p_action = 'dismiss' then
    update public.message_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_action = 'resolve' then
    update public.message_reports set status = 'resolved', handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_action = 'reopen' then
    update public.message_reports set status = 'open', handled_by = null, handled_at = null where id = p_id;
  elsif p_action = 'delete_message' then
    -- Aynı mesajın tüm raporları kapanır; mesaj silinir (rapordaki kopya kalır)
    if r.message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where message_id = r.message_id;
      delete from public.messages where id = r.message_id;
    elsif r.group_message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where group_message_id = r.group_message_id;
      update public.group_messages set deleted = true, body = '', meta = null where id = r.group_message_id;
    else
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now() where id = p_id;
    end if;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('message_report_' || p_action, 'message', coalesce(r.message_id::text, r.group_message_id::text, ''), r.reported,
    jsonb_build_object('reason', r.reason, 'body', left(r.body, 200), 'report', r.id, 'group_name', r.group_name));
end $$;

revoke all on function public.group_create(text, uuid[]), public.group_invite(uuid, uuid[]), public.group_leave(uuid),
  public.group_kick(uuid, uuid), public.group_delete(uuid), public.group_rename(uuid, text), public.group_send(uuid, text),
  public.group_message_delete(uuid), public.group_read(uuid), public.group_mute(uuid, boolean),
  public.group_chat(uuid, timestamptz, int), public.my_groups(), public.group_members(uuid),
  public.group_message_report(uuid, text, text) from public, anon;
grant execute on function public.group_create(text, uuid[]), public.group_invite(uuid, uuid[]), public.group_leave(uuid),
  public.group_kick(uuid, uuid), public.group_delete(uuid), public.group_rename(uuid, text), public.group_send(uuid, text),
  public.group_message_delete(uuid), public.group_read(uuid), public.group_mute(uuid, boolean),
  public.group_chat(uuid, timestamptz, int), public.my_groups(), public.group_members(uuid),
  public.group_message_report(uuid, text, text) to authenticated;

-- ===========================================================================
-- 2) Sohbet arka planı
-- ===========================================================================

-- Ortak doğrulama: tür / değer / görsel yolu (klasör = beklenen klasör, dosya kovada var)
create or replace function public.chat_bg_check(p_kind text, p_value text, p_image text, p_folder text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'solid' then
    if coalesce(p_value, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Geçersiz renk'; end if;
  elsif p_kind = 'gradient' then
    if coalesce(p_value, '') !~ '^[a-z0-9-]{1,24}$' then raise exception 'Geçersiz degrade'; end if;
  elsif p_kind = 'image' then
    if p_image is null or length(p_image) > 200 or p_image not like p_folder || '/%' or p_image like '%..%'
       or p_image !~ '^[0-9a-gt_-]+/[A-Za-z0-9._-]+$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chatbg' and o.name = p_image) then
      raise exception 'Geçersiz görsel';
    end if;
  else
    raise exception 'Geçersiz arka plan türü';
  end if;
end $$;
revoke all on function public.chat_bg_check(text, text, text, text) from public, anon, authenticated;

-- 2a) 1:1 sohbet: arka planımı değiştirdim → sohbete sistem mesajı (karşı taraf isterse aynısını kullanır)
create or replace function public.chat_bg_announce(p_friend uuid, p_kind text, p_value text default '',
  p_image text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  folder text;
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  mid uuid;
  old text[];
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.chat_bg', false) and not public.is_pro() then
    raise exception 'Sohbet arka planını paylaşmak PRO üyelik gerektirir';
  end if;
  if p_friend is null or p_friend = me or not public.are_friends(me, p_friend) then
    raise exception 'Sadece arkadaşlarınla arka plan paylaşabilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_friend and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_friend), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if me < p_friend then folder := me::text || '_' || p_friend::text;
  else folder := p_friend::text || '_' || me::text; end if;
  perform public.chat_bg_check(p_kind, v_value, v_image, folder);
  if p_kind = 'image' then v_value := ''; else v_image := null; end if;
  -- Taşkın önleme: aynı sohbete 5 saniyede bir, saatte en fazla 20 arka plan mesajı
  if exists (select 1 from public.messages where sender = me and recipient = p_friend and meta ->> 't' = 'bg'
               and created_at > now() - interval '5 seconds') then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;
  if (select count(*) from public.messages where sender = me and meta ->> 't' = 'bg' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Çok sık arka plan değiştiriyorsun, biraz bekle';
  end if;
  insert into public.messages (sender, recipient, body, meta)
    values (me, p_friend, '🖼️ Sohbet arka planını değiştirdi',
            jsonb_strip_nulls(jsonb_build_object('t', 'bg', 'kind', p_kind, 'value', v_value, 'image', v_image)))
    returning id into mid;
  -- Bu sohbette benim eski görsellerim: son 2 değişikliğin görseli kalır, öncekiler mesajdan düşer ve silinmek üzere döner
  with stale as (
    select id, meta ->> 'image' as img from public.messages
    where sender = me and recipient = p_friend and meta ->> 't' = 'bg' and meta ? 'image'
    order by created_at desc offset 2
  ), upd as (
    update public.messages m set meta = m.meta - 'image' from stale s where m.id = s.id returning s.img
  )
  select coalesce(array_agg(img), '{}') into old from upd where img is distinct from v_image;
  return jsonb_build_object('id', mid, 'old', to_jsonb(old));
end $$;
revoke all on function public.chat_bg_announce(uuid, text, text, text) from public, anon;
grant execute on function public.chat_bg_announce(uuid, text, text, text) to authenticated;

-- 2b) Grup / takım sohbetinin ortak arka planı (sadece sahip değiştirir)
create table if not exists public.chat_room_bg (
  scope text not null check (scope in ('group', 'team')),
  room_id uuid not null,
  kind text not null check (kind in ('solid', 'gradient', 'image')),
  value text not null default '',
  image_path text,
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (scope, room_id)
);
alter table public.chat_room_bg enable row level security;

create or replace function public.chat_room_member(p_scope text, p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_scope when 'group' then public.is_group_member(p_room)
                      when 'team' then public.is_team_member(p_room) else false end;
$$;
create or replace function public.chat_room_owner(p_scope text, p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and case p_scope
    when 'group' then public.is_group_owner(p_room)
    when 'team' then exists (select 1 from public.team_members where team_id = p_room and user_id = auth.uid() and role = 'owner')
    else false end;
$$;
grant execute on function public.chat_room_member(text, uuid), public.chat_room_owner(text, uuid) to authenticated;

drop policy if exists "room bg members" on public.chat_room_bg;
create policy "room bg members" on public.chat_room_bg for select using (public.chat_room_member(scope, room_id));
grant select on public.chat_room_bg to authenticated;
grant all on public.chat_room_bg to service_role;

-- Grup / takım silinince arka plan satırı da silinir
create or replace function public.chat_room_bg_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.chat_room_bg where scope = tg_argv[0] and room_id = old.id;
  return old;
end $$;
drop trigger if exists chat_room_bg_gone on public.chat_groups;
create trigger chat_room_bg_gone before delete on public.chat_groups
  for each row execute function public.chat_room_bg_gone('group');
drop trigger if exists chat_room_bg_gone on public.teams;
create trigger chat_room_bg_gone before delete on public.teams
  for each row execute function public.chat_room_bg_gone('team');

-- Kova klasörü "g_<grup id>" / "t_<takım id>": okuma üyeler, yazma sadece sahip
create or replace function public.chat_bg_room_folder_ok(p_folder text, p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  pre text := split_part(coalesce(p_folder, ''), '_', 1);
  id text := split_part(coalesce(p_folder, ''), '_', 2);
  sc text;
begin
  if auth.uid() is null or pre not in ('g', 't') or p_folder <> pre || '_' || id
     or id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  sc := case pre when 'g' then 'group' else 'team' end;
  if p_write then
    return public.chat_room_owner(sc, id::uuid);
  end if;
  return public.chat_room_member(sc, id::uuid);
end $$;
grant execute on function public.chat_bg_room_folder_ok(text, boolean) to authenticated;

drop policy if exists "chatbg room upload" on storage.objects;
create policy "chatbg room upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chatbg' and public.chat_bg_room_folder_ok((storage.foldername(name))[1], true));
drop policy if exists "chatbg room read" on storage.objects;
create policy "chatbg room read" on storage.objects for select to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_room_folder_ok((storage.foldername(name))[1], false));
drop policy if exists "chatbg room delete" on storage.objects;
create policy "chatbg room delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_room_folder_ok((storage.foldername(name))[1], true));

-- İç yardımcı: odaya "arka plan değişti" sistem mesajı
create or replace function public.chat_room_bg_note(p_scope text, p_room uuid, p_meta jsonb, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_scope = 'group' then
    insert into public.group_messages (group_id, sender, body, meta) values (p_room, auth.uid(), p_body, p_meta);
    update public.chat_group_members set last_read_at = now() where group_id = p_room and user_id = auth.uid();
  else
    insert into public.team_messages (team_id, sender, body, meta) values (p_room, auth.uid(), p_body, p_meta);
    update public.team_chat_state set last_read_at = now() where team_id = p_room and user_id = auth.uid();
  end if;
end $$;
revoke all on function public.chat_room_bg_note(text, uuid, jsonb, text) from public, anon, authenticated;

-- Dönüş: artık kullanılmayan eski görselin yolu (uygulama kovadan siler) ya da null
create or replace function public.room_bg_set(p_scope text, p_room uuid, p_kind text, p_value text default '',
  p_image text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  prev public.chat_room_bg;
  had boolean;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_scope not in ('group', 'team') or p_room is null or not public.chat_room_owner(p_scope, p_room) then
    raise exception '%', case when p_scope = 'team' then 'Sohbet arka planını sadece takım sahibi değiştirebilir'
                              else 'Sohbet arka planını sadece grup sahibi değiştirebilir' end;
  end if;
  if public.feature_requires_pro('social.chat_bg', false) and not public.is_pro() then
    raise exception 'Sohbet arka planını değiştirmek PRO üyelik gerektirir';
  end if;
  perform public.chat_bg_check(p_kind, v_value, v_image, (case p_scope when 'group' then 'g_' else 't_' end) || p_room::text);
  if p_kind = 'image' then v_value := ''; else v_image := null; end if;
  select * into prev from public.chat_room_bg where scope = p_scope and room_id = p_room;
  had := found;
  if had and prev.updated_at > now() - interval '5 seconds' then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;
  insert into public.chat_room_bg (scope, room_id, kind, value, image_path, set_by, updated_at)
    values (p_scope, p_room, p_kind, v_value, v_image, me, now())
  on conflict (scope, room_id) do update set kind = excluded.kind, value = excluded.value,
    image_path = excluded.image_path, set_by = excluded.set_by, updated_at = now();
  perform public.chat_room_bg_note(p_scope, p_room,
    jsonb_strip_nulls(jsonb_build_object('t', 'bg', 'kind', p_kind, 'value', v_value, 'image', v_image)),
    '🖼️ Sohbet arka planını değiştirdi');
  if had and prev.image_path is not null and prev.image_path is distinct from v_image then
    -- Eski görsel silinecek: eski sistem mesajlarındaki küçük resim de düşer
    if p_scope = 'group' then
      update public.group_messages set meta = meta - 'image' where group_id = p_room and meta ->> 'image' = prev.image_path;
    else
      update public.team_messages set meta = meta - 'image' where team_id = p_room and meta ->> 'image' = prev.image_path;
    end if;
    return prev.image_path;
  end if;
  return null;
end $$;

create or replace function public.room_bg_clear(p_scope text, p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  if auth.uid() is null or p_scope not in ('group', 'team') or p_room is null or not public.chat_room_owner(p_scope, p_room) then
    raise exception '%', case when p_scope = 'team' then 'Sohbet arka planını sadece takım sahibi değiştirebilir'
                              else 'Sohbet arka planını sadece grup sahibi değiştirebilir' end;
  end if;
  delete from public.chat_room_bg where scope = p_scope and room_id = p_room returning image_path into v_path;
  if not found then
    return null;
  end if;
  if v_path is not null then
    if p_scope = 'group' then
      update public.group_messages set meta = meta - 'image' where group_id = p_room and meta ->> 'image' = v_path;
    else
      update public.team_messages set meta = meta - 'image' where team_id = p_room and meta ->> 'image' = v_path;
    end if;
  end if;
  perform public.chat_room_bg_note(p_scope, p_room, jsonb_build_object('t', 'bg', 'kind', 'none'), '🖼️ Sohbet arka planını kaldırdı');
  return v_path;
end $$;

revoke all on function public.room_bg_set(text, uuid, text, text, text), public.room_bg_clear(text, uuid) from public, anon;
grant execute on function public.room_bg_set(text, uuid, text, text, text), public.room_bg_clear(text, uuid) to authenticated;

-- 2c) team_chat (c30): meta alanı da döner (arka plan sistem mesajı)
create or replace function public.team_chat(p_team uuid, p_before timestamptz default null, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at) from (
      select m.created_at, jsonb_build_object('id', m.id, 'team_id', m.team_id, 'sender', m.sender,
               'sender_name', coalesce(p.display_name, '?'), 'body', m.body, 'deleted', m.deleted,
               'poll_id', m.poll_id, 'created_at', m.created_at, 'meta', m.meta,
               'poll', case when m.poll_id is not null and not m.deleted then public.team_poll_json(m.poll_id) end) as j
      from public.team_messages m
      left join public.profiles p on p.id = m.sender
      where m.team_id = p_team
        and (p_before is null or m.created_at < p_before)
        and not public.team_message_hidden_for(m.id)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- c46: Canlı Sohbet PRO özellikleri kataloğu (Yönetim › PRO özellikleri).
--      Canlı Sohbet anahtarları (livechat.*) programda tanımlı ve Rust tarafında denetleniyor (kanal bağlama,
--      anket, sesli okuma, altyazı, sohbete yazma, OBS adresleri, Streamlabs). Sunucuda tablo / RPC denetimi yok:
--      bu özelliklerin verisi sunucudan geçmez; karar pro_features tablosunda tutulur, program pro_features_map()
--      ile okur (c38/c40 ile aynı düzen). Bu dosya yalnızca kataloğu (ad, grup, varsayılan) önceden yazar; böylece
--      web sitesindeki yönetim paneli, programdaki "kataloğu eşitle" beklenmeden satırları ayrı ayrı gösterir.
--      Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
--        livechat.multi   Birden fazla kanal — ücretsiz: yalnızca en üstteki kanalın mesajları
--                         (kanal eklemek ve ★ favorilerin izleyici sayısı her zaman açık)
--        livechat.poll    Sohbet anketi
--        livechat.tts     Sohbeti sesli okuma
--        livechat.stt     Konuşmayı yazıya çevirme (altyazı)
--        livechat.send    Sohbete yazma
--        livechat.obs     OBS tarayıcı kaynağı
--        livechat.alerts  Streamlabs uyarıları
-- Sıra: c38'den sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('livechat.multi',  'Birden fazla kanal (ücretsiz: yalnızca en üstteki kanalın mesajları)', 'Canlı Sohbet', true, now()),
  ('livechat.poll',   'Sohbet anketi', 'Canlı Sohbet', true, now()),
  ('livechat.obs',    'OBS tarayıcı kaynağı (sohbet, anket, altyazı sayfaları)', 'Canlı Sohbet', true, now()),
  ('livechat.tts',    'Sohbeti sesli okuma (TTS)', 'Canlı Sohbet', true, now()),
  ('livechat.stt',    'Konuşmayı yazıya çevirme (altyazı)', 'Canlı Sohbet', true, now()),
  ('livechat.send',   'Sohbete yazma (Twitch / Kick / YouTube)', 'Canlı Sohbet', true, now()),
  ('livechat.alerts', 'Streamlabs uyarıları', 'Canlı Sohbet', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();

-- ---------------------------------------------------------------------------
-- c47: Yeni PRO özellikleri kataloğu + iki overlay'in varsayılan PRO yapılması (Yönetim › PRO özellikleri).
--      1) Katalog (pro_feature_catalog; c46 ile aynı düzen, sunucuda tablo / RPC denetimi yok: veriler sunucudan
--         geçmez, karar pro_features tablosunda tutulur, program pro_features_map() ile okur ve Rust tarafında
--         denetler). Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
--           livechat.log         Sohbet kaydını görüntüleme (gün listesi, arama, süzme, dışa aktarma).
--                                Kayıt tutmak, saklama süresi ve kayıtları silmek her zaman açık.
--           social.messages_tts  "Mesajlar" overlay'inde arkadaş / takım / grup mesajlarını sesli okuma
--                                (canlı sohbet okumasıyla aynı sırayı kullanır, üst üste konuşmaz).
--         livechat.tts (Sohbeti sesli okuma) c46'da zaten varsayılan PRO; burada yeniden yazılır (değişiklik yok).
--      2) "Sohbet Anketi" (livepoll) ve "Altyazı" (captions) overlay'leri varsayılan olarak PRO olur.
--         Overlay'in tamamının PRO olması app_config.pro_overlays listesinde tutulur (c38/c40: overlay.<id> anahtarı
--         pro_features'ta değil bu listede). Bu ekleme YALNIZCA bu dosya ilk kez çalıştırılırken yapılır
--         (katalogda livechat.log henüz yokken); yönetici sonradan Yönetim › PRO özellikleri'nden herkese açık
--         yaparsa dosya tekrar çalıştırıldığında geri PRO'ya dönmez.
--      3) Kaldırılan eski "Twitch Sohbeti (eski)" overlay'i (twitch): PRO / gizli listelerinden ve katalogdan
--         temizlenir (program artık bu türü tanımıyor; kayıtlı düzenlerdeki kopyaları sessizce atıyor).
-- Sıra: c38 ve c46'dan sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

-- 2) İlk çalıştırmada: Sohbet Anketi ve Altyazı overlay'leri PRO listesine eklenir
do $$
begin
  if not exists (select 1 from public.pro_feature_catalog where key = 'livechat.log') then
    update public.app_config
       set pro_overlays = (
             select coalesce(array_agg(distinct x), '{}')
               from unnest(coalesce(pro_overlays, '{}') || array['livepoll', 'captions']) as x
           )
     where id = 1;
  end if;
end $$;

-- 3) Kaldırılan eski Twitch sohbet overlay'i
update public.app_config
   set pro_overlays = array_remove(pro_overlays, 'twitch'),
       hidden_overlays = array_remove(hidden_overlays, 'twitch')
 where id = 1
   and ('twitch' = any (pro_overlays) or 'twitch' = any (hidden_overlays));
delete from public.pro_features where key = 'overlay.twitch' or key like 'overlay.twitch.%';
delete from public.pro_feature_catalog where key = 'overlay.twitch' or key like 'overlay.twitch.%';

-- 1) Katalog
insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('livechat.log',        'Sohbet kaydını görüntüleme (arama, süzme, dışa aktarma)', 'Canlı Sohbet', true, now()),
  ('livechat.tts',        'Sohbeti sesli okuma (TTS)', 'Canlı Sohbet', true, now()),
  ('social.messages_tts', 'Mesajlar overlay''inde mesajları sesli okuma', 'Sosyal', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();
