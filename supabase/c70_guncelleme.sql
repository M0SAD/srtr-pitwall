-- ---------------------------------------------------------------------------
-- c70: Türkiye'den bağlananlara gösterilen ayrı Patreon bağlantısı (Türkiye fiyatlı kademe).
-- ---------------------------------------------------------------------------
alter table public.app_config add column if not exists patreon_url_tr text not null default '';
