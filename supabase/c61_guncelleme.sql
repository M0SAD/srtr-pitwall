-- ---------------------------------------------------------------------------
-- c61: Üst çubuk bağlantıları (Yönetim › Üst çubuk bağlantıları).
--      Programın üst çubuğunun en solunda (ve web sitesinin alt bilgisinde) gösterilen bağlantı düğmeleri
--      (Web sitesi, Discord, WhatsApp…). Yönetici dilediği bağlantıyı ekler, sıralar, kimin göreceğini seçer;
--      hazır simge yerine kendi simgesini (.png / .ico) yükleyebilir.
--      1) app_config.top_links (jsonb, sıralı dizi). Herkes okur (app_config zaten herkese açık). Her öğe:
--           { "id": "web", "label": "SimRaceTR", "url": "https://…",
--             "icon": "web" | "discord" | "whatsapp" | "youtube" | "twitch" | "kick" | "instagram" | "x" | "facebook"
--                   | "telegram" | "tiktok" | "github" | "mail" | "link" | "custom",
--             "image": "https://…/site/toplinks/…",          -- icon = "custom" iken yöneticinin yüklediği simge
--             "audiences": { "guest": true, "member": true, "pro": true },
--                                    -- guest: giriş yapmamış, member: PRO olmayan üye, pro: PRO üye
--             "enabled": true }
--         Varsayılan (sütun varsayılanı da budur): SimRaceTR, Discord, WhatsApp. Sütun ilk kez eklenirken mevcut
--         satıra bu üç bağlantı yazılır; sütun zaten varsa dokunulmaz (yönetici listeyi boşalttıysa boş kalır).
--      2) admin_set_top_links(jsonb): sadece yönetici yazar; biçim denetlenir (en fazla 12 bağlantı, ad 1–40,
--         adres http(s) ve en fazla 500, simge bilinen anahtarlardan, image https ve en fazla 600, mantıksal
--         alanlar boolean); moderasyon kaydına 'top_links_set' düşer.
--      3) 'site' kovasına .ico türleri eklenir (image/x-icon, image/vnd.microsoft.icon); simgeler
--         toplinks/<id>-<zaman>.<uzantı> adıyla yüklenir (sadece yönetici yazar, herkes okur).
--         NOT: c42 / c54 yeniden çalıştırılırsa kovanın tür listesi eski haline döner; ardından c61'i yeniden çalıştır.
-- Sıra: c42'den sonra (is_admin, log_mod, 'site' kovası hazır olmalı). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

-- Varsayılan bağlantılar
create or replace function public.top_links_default() returns jsonb
language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('id', 'web', 'label', 'SimRaceTR', 'url', 'https://www.simracetr.com/', 'icon', 'web',
                       'audiences', jsonb_build_object('guest', true, 'member', true, 'pro', true), 'enabled', true),
    jsonb_build_object('id', 'discord', 'label', 'Discord', 'url', 'https://discord.gg/F6Gxn9Jjen', 'icon', 'discord',
                       'audiences', jsonb_build_object('guest', true, 'member', true, 'pro', true), 'enabled', true),
    jsonb_build_object('id', 'whatsapp', 'label', 'WhatsApp', 'url', 'https://chat.whatsapp.com/GDloVXAmyuEEUtHAvlwlw0',
                       'icon', 'whatsapp',
                       'audiences', jsonb_build_object('guest', true, 'member', true, 'pro', true), 'enabled', true)
  );
$$;
grant execute on function public.top_links_default() to anon, authenticated, service_role;

-- 1) Sütun + varsayılan bağlantılar ---------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_config' and column_name = 'top_links'
  ) then
    -- Yeni sütun: mevcut satır da varsayılan üç bağlantıyı alır
    alter table public.app_config add column top_links jsonb not null default public.top_links_default();
  else
    -- Sütun zaten var: yöneticinin düzenlediği listeye dokunma; sadece boş (null) kalmışsa doldur
    alter table public.app_config alter column top_links set default public.top_links_default();
    update public.app_config set top_links = public.top_links_default() where top_links is null;
  end if;
end $$;

-- Tek bağlantı geçerli mi
create or replace function public.top_link_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is not null
     and jsonb_typeof(p) = 'object'
     and jsonb_typeof(p -> 'id') = 'string'
     and (p ->> 'id') ~ '^[a-z0-9][a-z0-9_-]{0,39}$'
     and jsonb_typeof(p -> 'label') = 'string'
     and length(btrim(p ->> 'label')) between 1 and 40
     and length(p ->> 'label') <= 40
     and jsonb_typeof(p -> 'url') = 'string'
     and (p ->> 'url') ~* '^https?://[^\s"''<>`\\]+$'
     and length(p ->> 'url') <= 500
     and jsonb_typeof(p -> 'icon') = 'string'
     and (p ->> 'icon') in ('web', 'discord', 'whatsapp', 'youtube', 'twitch', 'kick', 'instagram', 'x', 'facebook',
                            'telegram', 'tiktok', 'github', 'mail', 'link', 'custom')
     and (coalesce(jsonb_typeof(p -> 'image'), 'null') = 'null'
          or (jsonb_typeof(p -> 'image') = 'string'
              and ((p ->> 'image') = ''
                   or ((p ->> 'image') ~* '^https://[^\s"''<>`\\]+$' and length(p ->> 'image') <= 600))))
     and jsonb_typeof(p -> 'audiences') = 'object'
     and jsonb_typeof(p -> 'audiences' -> 'guest') = 'boolean'
     and jsonb_typeof(p -> 'audiences' -> 'member') = 'boolean'
     and jsonb_typeof(p -> 'audiences' -> 'pro') = 'boolean'
     and jsonb_typeof(p -> 'enabled') = 'boolean';
$$;

-- 2) Yönetici: listeyi yaz ------------------------------------------------------------
create or replace function public.admin_set_top_links(p_links jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  before jsonb;
  item jsonb;
  n int;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'Geçersiz veri';
  end if;
  n := jsonb_array_length(p_links);
  if n > 12 then
    raise exception 'En fazla 12 bağlantı eklenebilir';
  end if;
  if length(p_links::text) > 20000 then
    raise exception 'Bağlantı listesi çok uzun';
  end if;
  for item in select * from jsonb_array_elements(p_links) loop
    if not public.top_link_ok(item) then
      raise exception 'Geçersiz bağlantı: %', left(coalesce(item ->> 'label', item ->> 'id', '?'), 40);
    end if;
  end loop;
  if (select count(distinct e ->> 'id') from jsonb_array_elements(p_links) e) <> n then
    raise exception 'Bağlantı kimlikleri benzersiz olmalı';
  end if;

  select coalesce(top_links, '[]'::jsonb) into before from public.app_config where id = 1;
  update public.app_config set top_links = p_links, updated_at = now() where id = 1;

  if before is distinct from p_links then
    perform public.log_mod('top_links_set', 'config', 'top_links', null,
      jsonb_build_object(
        'count', n,
        'old_count', case when jsonb_typeof(before) = 'array' then jsonb_array_length(before) else 0 end,
        'enabled', (select count(*) from jsonb_array_elements(p_links) e where (e ->> 'enabled')::boolean),
        'labels', (select coalesce(jsonb_agg(left(e ->> 'label', 40)), '[]'::jsonb) from jsonb_array_elements(p_links) e)));
  end if;
end $$;
revoke all on function public.admin_set_top_links(jsonb) from public, anon;
grant execute on function public.admin_set_top_links(jsonb) to authenticated;

-- 3) 'site' kovası: .ico türleri (eksik olanlar eklenir; diğer ayarlar aynı kalır) ------
update storage.buckets b
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(coalesce(b.allowed_mime_types, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
              || array['image/x-icon', 'image/vnd.microsoft.icon']) m
)
where b.id = 'site';
