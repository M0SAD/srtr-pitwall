-- c136: Korna. Yönetici korna seslerini ekler (Yönetim › Kornalar): ad, ses dosyası (uygulama yüklerken WAV'a çevirir),
-- sıra, açık / kapalı ve kimin kullanabileceği: 'pro' (PRO üyeler) ya da 'admin' (yalnızca yöneticiler).
-- Kornayı çalmak PRO özelliğidir (istemci: pro_features "social.horn"); duymak herkese açık. Korna sinyali veritabanına
-- yazılmaz: aynı iRacing sunucusundakiler Realtime yayın kanalıyla ("horn:<SubSessionID>") alır.
-- Ses dosyaları herkese açık 'horns' kovasında (yalnızca yönetici yükler / siler).
-- Sıra: herhangi bir yerden sonra. Tekrar çalıştırmak güvenlidir.

create table if not exists public.horns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- 'horns' kovasındaki yol
  file text not null check (char_length(file) between 3 and 200),
  duration_ms int not null default 0 check (duration_ms between 0 and 10000),
  access text not null default 'pro' check (access in ('pro', 'admin')),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.horns enable row level security;
drop policy if exists "horns read" on public.horns;
create policy "horns read" on public.horns for select using (active or public.is_admin());
drop policy if exists "horns admin" on public.horns;
create policy "horns admin" on public.horns for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.horns to anon, authenticated;
grant insert, update, delete on public.horns to authenticated;
grant all on public.horns to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('horns', 'horns', true, 1048576, array['audio/wav', 'audio/x-wav', 'audio/wave'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "horns admin insert" on storage.objects;
create policy "horns admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'horns' and public.is_admin());
drop policy if exists "horns admin update" on storage.objects;
create policy "horns admin update" on storage.objects for update to authenticated
  using (bucket_id = 'horns' and public.is_admin());
drop policy if exists "horns admin delete" on storage.objects;
create policy "horns admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'horns' and public.is_admin());

notify pgrst, 'reload schema';
