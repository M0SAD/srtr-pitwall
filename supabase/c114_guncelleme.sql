-- c114: Site görselleri: overlay başına birden fazla görsel (Yönetim › Ana sayfa görselleri › Overlay Galerisi).
-- "ov.<overlay>" yuvası artık görsel listesi tutabilir (eski tek görsel kaydı geçerli kalır). 64 overlay × birkaç görsel
-- eski 20 000 karakterlik toplam sınırı aştığı için sınır 250 000'e çıkarıldı; diğer denetimler aynı.

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
  if length(p_images::text) > 250000 then
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

notify pgrst, 'reload schema';
