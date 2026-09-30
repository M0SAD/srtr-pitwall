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
