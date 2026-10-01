-- ---------------------------------------------------------------------------
-- c46: Canlı Sohbet PRO özellikleri kataloğu (Yönetim › PRO özellikleri).
--      Canlı Sohbet anahtarları (livechat.*) programda tanımlı ve Rust tarafında denetleniyor (kanal bağlama,
--      anket, sesli okuma, altyazı, sohbete yazma, OBS adresleri, Streamlabs). Sunucuda tablo / RPC denetimi yok:
--      bu özelliklerin verisi sunucudan geçmez; karar pro_features tablosunda tutulur, program pro_features_map()
--      ile okur (c38/c40 ile aynı düzen). Bu dosya yalnızca kataloğu (ad, grup, varsayılan) önceden yazar; böylece
--      web sitesindeki yönetim paneli, programdaki "kataloğu eşitle" beklenmeden satırları ayrı ayrı gösterir.
--      Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
--        livechat.multi   Birden fazla kanal — ücretsiz: yalnızca en üstteki kanalın mesajları
--                         (kanal eklemek ve ★ favorilerin izleyici sayısı her zaman açık)
--        livechat.poll    Sohbet anketi
--        livechat.tts     Sohbeti sesli okuma
--        livechat.stt     Konuşmayı yazıya çevirme (altyazı)
--        livechat.send    Sohbete yazma
--        livechat.obs     OBS tarayıcı kaynağı
--        livechat.alerts  Streamlabs uyarıları
-- Sıra: c38'den sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('livechat.multi',  'Birden fazla kanal (ücretsiz: yalnızca en üstteki kanalın mesajları)', 'Canlı Sohbet', true, now()),
  ('livechat.poll',   'Sohbet anketi', 'Canlı Sohbet', true, now()),
  ('livechat.obs',    'OBS tarayıcı kaynağı (sohbet, anket, altyazı sayfaları)', 'Canlı Sohbet', true, now()),
  ('livechat.tts',    'Sohbeti sesli okuma (TTS)', 'Canlı Sohbet', true, now()),
  ('livechat.stt',    'Konuşmayı yazıya çevirme (altyazı)', 'Canlı Sohbet', true, now()),
  ('livechat.send',   'Sohbete yazma (Twitch / Kick / YouTube)', 'Canlı Sohbet', true, now()),
  ('livechat.alerts', 'Streamlabs uyarıları', 'Canlı Sohbet', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();
