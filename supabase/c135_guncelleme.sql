-- c135: Ana sayfa haberleri: çeviriler, "sadece Türkçe" haberler ve yöneticinin düzenlediği kategoriler.
--   home_posts.translations : { "<dil>": { "title", "summary", "body", "links": ["düğme yazısı", ...] } } (Türkçe asıl metin
--                             sütunlarda; yayınlarken diğer dillere otomatik çevrilir)
--   home_posts.translated_from : çevirinin yapıldığı Türkçe metnin özeti (metin değişince yeniden çevrilir)
--   home_posts.audience     : 'all' (her dilde, çevirisiyle) | 'tr' (yalnızca Türkçe kullananlara)
--   home_categories         : ad (Türkçe), renk, sıra ve ad çevirileri; yönetici ekler / düzenler / siler.
--                             Ad değişince o kategorideki haberler de yeni adı alır.
-- Sıra: c133'ten sonra. Tekrar çalıştırmak güvenlidir.

alter table public.home_posts add column if not exists translations jsonb not null default '{}'::jsonb
  check (jsonb_typeof(translations) = 'object');
alter table public.home_posts add column if not exists translated_from text not null default '';
alter table public.home_posts add column if not exists audience text not null default 'all' check (audience in ('all', 'tr'));
-- Çeviriler metni büyütür: sütun sınırı yalnızca asıl metinde (body 20000); toplam satır boyutu makul kalsın
alter table public.home_posts drop constraint if exists home_posts_translations_size;
alter table public.home_posts add constraint home_posts_translations_size check (pg_column_size(translations) <= 600000);

create table if not exists public.home_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 40),
  color text not null default '' check (color = '' or color ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  -- { "<dil>": "çeviri" }
  names jsonb not null default '{}'::jsonb check (jsonb_typeof(names) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.home_categories enable row level security;
drop policy if exists "home categories read" on public.home_categories;
create policy "home categories read" on public.home_categories for select using (true);
drop policy if exists "home categories admin" on public.home_categories;
create policy "home categories admin" on public.home_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.home_categories to anon, authenticated;
grant insert, update, delete on public.home_categories to authenticated;
grant all on public.home_categories to service_role;

-- Kategori adı değişince haberlerdeki ad da değişir
create or replace function public.home_category_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' and new.name is distinct from old.name then
    update public.home_posts set category = new.name where category = old.name;
  end if;
  return new;
end $$;
drop trigger if exists home_category_rename on public.home_categories;
create trigger home_category_rename before insert or update on public.home_categories
  for each row execute function public.home_category_rename();

-- Hazır kategoriler (tablo boşsa) ve haberlerde kullanılmış ama listede olmayan adlar
insert into public.home_categories (name, color, sort)
select x.name, x.color, x.sort
  from (values ('Duyuru', '#ff8a2a', 1), ('Güncelleme', '#3b82f6', 2), ('Etkinlik', '#a855f7', 3), ('Yarış', '#ef4444', 4),
               ('Rehber', '#22c55e', 5), ('Kampanya', '#eab308', 6), ('Topluluk', '#14b8a6', 7)) as x(name, color, sort)
 where not exists (select 1 from public.home_categories);
insert into public.home_categories (name, sort)
select distinct p.category, 100 from public.home_posts p
 where p.category <> '' and not exists (select 1 from public.home_categories c where c.name = p.category);

notify pgrst, 'reload schema';
