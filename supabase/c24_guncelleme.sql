-- ---------------------------------------------------------------------------
-- c24: Otomatik PRO fiyatı. Yönetim panelinde her plan (1m, 3m, 6m, 12m) için sayısal fiyat girilir:
--      genel fiyat (pro_pricing.currency, ör. USD) ve Türkiye fiyatı (pro_pricing.currency_tr, ör. TRY).
--      pro-checkout fonksiyonu Lemon Squeezy'de tek abonelik ürününün o plana ait varyantıyla, bu tutarı
--      custom_price olarak göndererek ödeme sayfası açar (yenilemeler de aynı tutarla olur).
--      Biçim: {"currency":"USD","currency_tr":"TRY","plans":{"1m":{"price":4.99,"price_tr":149}, ...}}
--      Eski fiyat metni / ödeme bağlantısı alanları, otomatik fiyat girilmemiş planlar için kullanılmaya devam eder.
-- ---------------------------------------------------------------------------
alter table public.app_config add column if not exists pro_pricing jsonb not null default '{"currency":"USD","currency_tr":"TRY","plans":{}}'::jsonb;
