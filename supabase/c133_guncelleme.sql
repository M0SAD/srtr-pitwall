-- c133: Ana sayfa haberleri: daha fazla biçim seçeneği, yorumlar ve beğeniler.
--   home_posts      : özet (spot), kategori, vurgu rengi, görünüm (standart / büyük kapak / yan görsel), görsel sığdırma
--                     (tamamı / geniş 16:9 / ince banner), galeri (ek görseller), YouTube videosu, yorumlara açık mı.
--   home_comments   : giriş yapan herkes yayındaki (yorumlara açık) habere yorum yazar; kendi yorumunu düzenler / siler,
--                     yönetici hepsini siler. Dakikada en çok 5 yorum.
--   home_post_likes : beğeni (kişi başı bir); home_like() ile açılır / kapanır.
--   home_post_stats(): her haberin beğeni / yorum sayısı ve "ben beğendim mi".
--   home_comment_list(p_post): yorumlar, yazanın adı, profil resmi, yönetici / PRO işareti.
-- Sıra: c128'den sonra. Tekrar çalıştırmak güvenlidir.

-- 1) Haber sütunları ----------------------------------------------------------------
alter table public.home_posts add column if not exists summary text not null default '' check (char_length(summary) <= 400);
alter table public.home_posts add column if not exists category text not null default '' check (char_length(category) <= 40);
alter table public.home_posts add column if not exists accent text not null default '' check (accent = '' or accent ~ '^#[0-9a-fA-F]{6}$');
alter table public.home_posts add column if not exists layout text not null default 'standard' check (layout in ('standard', 'hero', 'side'));
alter table public.home_posts add column if not exists image_fit text not null default 'full' check (image_fit in ('full', 'wide', 'banner'));
alter table public.home_posts add column if not exists gallery jsonb not null default '[]'::jsonb
  check (jsonb_typeof(gallery) = 'array' and jsonb_array_length(gallery) <= 12);
alter table public.home_posts add column if not exists video text not null default '' check (video = '' or video ~ '^https://');
alter table public.home_posts add column if not exists allow_comments boolean not null default true;

-- 2) Yorumlar ----------------------------------------------------------------------
create table if not exists public.home_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.home_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists home_comments_post on public.home_comments (post_id, created_at);
create index if not exists home_comments_user on public.home_comments (user_id, created_at desc);
alter table public.home_comments enable row level security;

drop policy if exists "home comments read" on public.home_comments;
create policy "home comments read" on public.home_comments for select using (
  public.is_admin() or exists (select 1 from public.home_posts p where p.id = post_id and p.published));
drop policy if exists "home comments insert" on public.home_comments;
create policy "home comments insert" on public.home_comments for insert to authenticated with check (
  auth.uid() = user_id
  and exists (select 1 from public.home_posts p where p.id = post_id and p.published and p.allow_comments));
drop policy if exists "home comments update" on public.home_comments;
create policy "home comments update" on public.home_comments for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "home comments delete" on public.home_comments;
create policy "home comments delete" on public.home_comments for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

grant select on public.home_comments to anon, authenticated;
grant insert, delete on public.home_comments to authenticated;
grant update (body) on public.home_comments to authenticated;
grant all on public.home_comments to service_role;

-- Düzenlemede kimlik / haber / yazar / tarih korunur, edited_at yazılır
create or replace function public.home_comment_protect() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.post_id := old.post_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.edited_at := now();
  return new;
end $$;
drop trigger if exists home_comment_protect on public.home_comments;
create trigger home_comment_protect before update on public.home_comments
  for each row execute function public.home_comment_protect();

-- Sel önleme: dakikada en çok 5, saatte en çok 40 yorum (yönetici hariç)
create or replace function public.home_comment_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.body := btrim(new.body);
  new.created_at := now();
  new.edited_at := null;
  if public.is_admin() then
    return new;
  end if;
  if (select count(*) from public.home_comments where user_id = new.user_id and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from public.home_comments where user_id = new.user_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Çok sık yorum yazıyorsun, biraz bekleyip tekrar dene.';
  end if;
  return new;
end $$;
drop trigger if exists home_comment_limit on public.home_comments;
create trigger home_comment_limit before insert on public.home_comments
  for each row execute function public.home_comment_limit();

-- 3) Beğeniler ---------------------------------------------------------------------
create table if not exists public.home_post_likes (
  post_id uuid not null references public.home_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.home_post_likes enable row level security;
drop policy if exists "home likes own read" on public.home_post_likes;
create policy "home likes own read" on public.home_post_likes for select to authenticated using (auth.uid() = user_id);
grant select on public.home_post_likes to authenticated;
grant all on public.home_post_likes to service_role;

-- Beğen / beğenmekten vazgeç; yeni beğeni sayısını döner
create or replace function public.home_like(p_post uuid, p_on boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Beğenmek için giriş yapmalısın';
  end if;
  if not exists (select 1 from public.home_posts where id = p_post and (published or public.is_admin())) then
    raise exception 'Haber bulunamadı';
  end if;
  if coalesce(p_on, true) then
    insert into public.home_post_likes (post_id, user_id) values (p_post, uid) on conflict do nothing;
  else
    delete from public.home_post_likes where post_id = p_post and user_id = uid;
  end if;
  return (select count(*) from public.home_post_likes where post_id = p_post)::int;
end $$;
revoke all on function public.home_like(uuid, boolean) from public;
grant execute on function public.home_like(uuid, boolean) to authenticated;

-- 4) Sayılar ve yorum listesi --------------------------------------------------------
create or replace function public.home_post_stats()
returns table (post_id uuid, likes int, comments int, liked boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         (select count(*) from public.home_post_likes l where l.post_id = p.id)::int,
         (select count(*) from public.home_comments c where c.post_id = p.id)::int,
         (auth.uid() is not null and exists (select 1 from public.home_post_likes l where l.post_id = p.id and l.user_id = auth.uid()))
  from public.home_posts p
  where p.published or public.is_admin();
$$;
revoke all on function public.home_post_stats() from public;
grant execute on function public.home_post_stats() to anon, authenticated;

create or replace function public.home_comment_list(p_post uuid)
returns table (id uuid, user_id uuid, body text, created_at timestamptz, edited_at timestamptz,
               author_name text, avatar_path text, author_admin boolean, author_pro boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.user_id, c.body, c.created_at, c.edited_at,
         coalesce(nullif(pr.display_name, ''), 'Üye'), pr.avatar_path, pr.is_admin,
         coalesce(pr.pro_until > now(), false)
  from public.home_comments c
  join public.profiles pr on pr.id = c.user_id
  where c.post_id = p_post
    and exists (select 1 from public.home_posts p where p.id = p_post and (p.published or public.is_admin()))
  order by c.created_at asc
  limit 500;
$$;
revoke all on function public.home_comment_list(uuid) from public;
grant execute on function public.home_comment_list(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
