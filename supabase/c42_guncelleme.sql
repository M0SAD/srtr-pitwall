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
