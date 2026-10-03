-- ---------------------------------------------------------------------------
-- c71: Türkiye'den bağlananlara gösterilen ayrı Ko-fi bağlantısı.
-- ---------------------------------------------------------------------------
alter table public.app_config add column if not exists kofi_url_tr text not null default '';
