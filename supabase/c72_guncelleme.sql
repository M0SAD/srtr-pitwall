-- ---------------------------------------------------------------------------
-- c72: Şu overlay'ler PRO: Kafa Kafaya, Yarış Sonucu, Sürücü Kartı, Ekip Çağrısı, Fark Grafiği, Yakın Takip,
--      Rakip Takibi, Hasar Göstergesi, Piste Dönüş, Viraj Analizi, Mesajlar (app_config.pro_overlays listesine eklenir).
-- ---------------------------------------------------------------------------
update public.app_config
   set pro_overlays = (select array_agg(distinct x)
                         from unnest(coalesce(pro_overlays, '{}') || array['h2h', 'results', 'drivercard', 'crewcall', 'gapchart', 'duel', 'target', 'damage', 'rejoin', 'corners', 'messages']) as x)
 where id = 1;
