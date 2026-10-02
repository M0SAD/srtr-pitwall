-- ---------------------------------------------------------------------------
-- c54: Web sitesinin görsellerini yönetim panelinden değiştirmek (ana sayfa + Özellikler sayfası).
--      1) app_config.site_images (jsonb): yuva → görsel eşlemesi. Herkes okur (app_config zaten herkese açık);
--         site açılışta okuyup <img data-slot="…"> / <div data-slot="…"> yuvalarının görselini değiştirir.
--           { "home.hero":    { "url": "https://…/site/home/home-hero-1700000000000.webp", "alt": "…", "w": 1100, "h": 566 },
--             "feat.livechat": { … },
--             "home.gallery": [ { "url": "…", "alt": "…", "w": 1920, "h": 1080 }, … ] }   -- sıralı galeri (en fazla 24)
--         Yuvada kayıt yoksa siteyle gelen varsayılan görsel / çizim gösterilir.
--      2) admin_set_site_images(jsonb): sadece yönetici yazar; biçim ve boyut denetlenir, moderasyon kaydına düşer.
--      Görsel dosyaları c42'deki 'site' depolama kovasına home/<yuva>-<zaman>.<uzantı> adıyla yüklenir
--      (herkese açık okuma, sadece yönetici yazar/siler, en fazla 4 MB, jpeg/png/webp/gif) — kova ve
--      politikaları c42'de kuruldu; burada sadece yoksa diye yeniden güvenceye alınır.
-- Sıra: c42'den sonra (is_admin, log_mod, 'site' kovası hazır olmalı).
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists site_images jsonb not null default '{}'::jsonb;

-- Tek görsel kaydı geçerli mi: {url: https…, alt?: metin, w?: sayı, h?: sayı}
create or replace function public.site_image_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is not null
     and jsonb_typeof(p) = 'object'
     and jsonb_typeof(p -> 'url') = 'string'
     and (p ->> 'url') ~* '^https://[^\s"''<>]+$'
     and length(p ->> 'url') <= 600
     and (not (p ? 'alt') or (jsonb_typeof(p -> 'alt') = 'string' and length(p ->> 'alt') <= 300))
     and (not (p ? 'w') or jsonb_typeof(p -> 'w') = 'number')
     and (not (p ? 'h') or jsonb_typeof(p -> 'h') = 'number');
$$;

create or replace function public.admin_set_site_images(p_images jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  before jsonb;
  k text;
  v jsonb;
  item jsonb;
  changed text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_images is null or jsonb_typeof(p_images) <> 'object' then
    raise exception 'Geçersiz veri';
  end if;
  if length(p_images::text) > 20000 then
    raise exception 'Görsel listesi çok uzun';
  end if;
  for k, v in select * from jsonb_each(p_images) loop
    if k !~ '^[a-z0-9][a-z0-9_.-]{0,59}$' then
      raise exception 'Geçersiz yuva adı: %', left(k, 60);
    end if;
    if jsonb_typeof(v) = 'array' then
      if jsonb_array_length(v) > 24 then
        raise exception 'Galeride en fazla 24 görsel olabilir';
      end if;
      for item in select * from jsonb_array_elements(v) loop
        if not public.site_image_ok(item) then
          raise exception 'Geçersiz galeri görseli (%)', k;
        end if;
      end loop;
    elsif not public.site_image_ok(v) then
      raise exception 'Geçersiz görsel (%)', k;
    end if;
  end loop;

  select coalesce(site_images, '{}'::jsonb) into before from public.app_config where id = 1;
  update public.app_config set site_images = p_images, updated_at = now() where id = 1;

  select coalesce(array_agg(x.key order by x.key), '{}') into changed
  from (
    select coalesce(n.key, o.key) as key
    from jsonb_each(p_images) n
    full join jsonb_each(coalesce(before, '{}'::jsonb)) o on o.key = n.key
    where n.value is distinct from o.value
  ) x;
  perform public.log_mod('site_images_set', 'config', 'site_images', null,
    jsonb_build_object('changed', to_jsonb(changed),
                       'slots', (select coalesce(jsonb_agg(s), '[]'::jsonb) from jsonb_object_keys(p_images) s),
                       'gallery', case when jsonb_typeof(p_images -> 'home.gallery') = 'array'
                                       then jsonb_array_length(p_images -> 'home.gallery') else 0 end));
end $$;
revoke all on function public.admin_set_site_images(jsonb) from public, anon;
grant execute on function public.admin_set_site_images(jsonb) to authenticated;

-- 'site' kovası (c42 ile aynı; yoksa oluşur, varsa sınırlar aynı kalır)
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
