-- ---------------------------------------------------------------------------
-- c52: Canlı Sohbet erişim kuralları (yönetici panelinden yönetilir).
--      1) app_config.livechat_require_login (boolean, varsayılan true): Canlı Sohbet'i kullanmak için hesaba giriş
--         zorunlu mu. Açıkken giriş yapmamış kullanıcıda hiçbir bölüm (ücretsiz olanlar dahil) çalışmaz; sekmeler
--         görünür ama kilitlidir, sohbet overlay'leri ekranda görünmez. Yönetim › Canlı Sohbet ayarları'ndan değişir.
--      2) app_config.livechat_hidden_tabs (text[], varsayılan boş): yönetici olmayanlardan gizlenen Canlı Sohbet
--         sekmeleri (chat, channels, moderation, poll, tts, stt, send, alerts, log, obs). hidden_sections /
--         hidden_overlays (c21) ile aynı düzen; Yönetim › Canlı Sohbet ayarları'ndan değişir.
--      3) PRO özellikleri kataloğu (pro_feature_catalog; c46 / c47 ile aynı düzen):
--           livechat.favorites  Favori kanallar ve izleyici sayıları (★, platform başına bir tane) — varsayılan PRO.
--             Ücretsizde yalnızca en üstteki kanalın sohbeti ve izleyici sayısı gösterilir; favoriler bağlanmaz.
--           livechat.multi      etiketi güncellendi (ücretsiz: tek kanalın sohbeti ve izleyici sayısı).
--         Diğer Canlı Sohbet anahtarları (poll, obs, tts, stt, send, alerts, log) c46 / c47 / c50'de kayıtlı;
--         eksikse burada varsayılanlarıyla eklenir (var olanın yönetici kararına ve varsayılanına dokunulmaz).
--      Denetim programda (Rust: livechat/mod.rs allowed / login_ok); sunucuda tablo / RPC denetimi yok, çünkü sohbet
--      verisi sunucudan geçmez. app_config yazma yetkisi mevcut RLS ile yalnızca yöneticide (ayrı RPC gerekmez).
-- Sıra: c38, c46, c47, c50'den sonra. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists livechat_require_login boolean not null default true;
alter table public.app_config add column if not exists livechat_hidden_tabs text[] not null default '{}';

-- Yeni / etiketi değişen anahtarlar
insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('livechat.multi',     'Birden fazla kanal (ücretsiz: yalnızca en üstteki kanalın sohbeti ve izleyici sayısı)', 'Canlı Sohbet', true, now()),
  ('livechat.favorites', 'Favori kanallar ve izleyici sayıları (★, platform başına bir tane)', 'Canlı Sohbet', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();

-- Diğer Canlı Sohbet anahtarları: yalnızca eksikse eklenir
insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('livechat.poll',   'Sohbet anketi', 'Canlı Sohbet', true, now()),
  ('livechat.obs',    'OBS tarayıcı kaynağı (sohbet, anket, altyazı sayfaları)', 'Canlı Sohbet', false, now()),
  ('livechat.tts',    'Sohbeti sesli okuma (TTS)', 'Canlı Sohbet', true, now()),
  ('livechat.stt',    'Konuşmayı yazıya çevirme (altyazı)', 'Canlı Sohbet', true, now()),
  ('livechat.send',   'Sohbete yazma (Twitch / Kick / YouTube)', 'Canlı Sohbet', true, now()),
  ('livechat.alerts', 'Streamlabs uyarıları', 'Canlı Sohbet', false, now()),
  ('livechat.log',    'Sohbet kaydını görüntüleme (arama, süzme, dışa aktarma)', 'Canlı Sohbet', true, now())
on conflict (key) do nothing;
