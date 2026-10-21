-- c128: Uygulama ana sayfası (haberler) ve ana sayfa reklamları.
--   home_posts   : yöneticinin yazdığı haberler (başlık, metin, görsel, bağlantılar, sabitleme, yayında mı)
--   home_banners : ana sayfanın en üstündeki reklamlar (görsel + bağlantı); yönetici doğrudan ekler (ücretli reklam
--                  sisteminden ayrı). Tarih aralığı, sıra, "PRO üyelere de göster" ve gösterim / tıklama sayısı.
-- Herkes yayındaki haberleri / etkin reklamları okur; yalnızca yönetici yazar. Görseller 'site' kovasına (home/…)
-- yüklenir (c71'deki yönetici yükleme kuralları geçerli).

create table if not exists public.home_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  image text not null default '',
  -- [{ "label": "...", "url": "https://..." }]
  links jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  published boolean not null default true,
  author uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists home_posts_order on public.home_posts (pinned desc, created_at desc);
alter table public.home_posts enable row level security;
drop policy if exists "home posts read" on public.home_posts;
create policy "home posts read" on public.home_posts for select using (published or public.is_admin());
drop policy if exists "home posts admin" on public.home_posts;
create policy "home posts admin" on public.home_posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.home_posts to anon, authenticated;
grant insert, update, delete on public.home_posts to authenticated;

create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  image text not null check (image ~ '^https://'),
  url text not null default '' check (url = '' or url ~ '^https?://'),
  title text not null default '',
  active boolean not null default true,
  show_pro boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  sort int not null default 0,
  views bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.home_banners enable row level security;
drop policy if exists "home banners read" on public.home_banners;
create policy "home banners read" on public.home_banners for select using (active or public.is_admin());
drop policy if exists "home banners admin" on public.home_banners;
create policy "home banners admin" on public.home_banners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.home_banners to anon, authenticated;
grant insert, update, delete on public.home_banners to authenticated;

-- updated_at
create or replace function public.home_posts_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists home_posts_touch on public.home_posts;
create trigger home_posts_touch before update on public.home_posts
  for each row execute function public.home_posts_touch();

-- Gösterim / tıklama sayacı (herkes çağırabilir; yalnızca sayaç artar)
create or replace function public.home_banner_hit(p_id uuid, p_click boolean default false) returns void
language sql security definer set search_path = public as $$
  update public.home_banners
    set views = views + case when p_click then 0 else 1 end,
        clicks = clicks + case when p_click then 1 else 0 end
    where id = p_id and active;
$$;
revoke all on function public.home_banner_hit(uuid, boolean) from public;
grant execute on function public.home_banner_hit(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
