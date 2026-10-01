-- ---------------------------------------------------------------------------
-- c47: Yeni PRO özellikleri kataloğu + iki overlay'in varsayılan PRO yapılması (Yönetim › PRO özellikleri).
--      1) Katalog (pro_feature_catalog; c46 ile aynı düzen, sunucuda tablo / RPC denetimi yok: veriler sunucudan
--         geçmez, karar pro_features tablosunda tutulur, program pro_features_map() ile okur ve Rust tarafında
--         denetler). Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
--           livechat.log         Sohbet kaydını görüntüleme (gün listesi, arama, süzme, dışa aktarma).
--                                Kayıt tutmak, saklama süresi ve kayıtları silmek her zaman açık.
--           social.messages_tts  "Mesajlar" overlay'inde arkadaş / takım / grup mesajlarını sesli okuma
--                                (canlı sohbet okumasıyla aynı sırayı kullanır, üst üste konuşmaz).
--         livechat.tts (Sohbeti sesli okuma) c46'da zaten varsayılan PRO; burada yeniden yazılır (değişiklik yok).
--      2) "Sohbet Anketi" (livepoll) ve "Altyazı" (captions) overlay'leri varsayılan olarak PRO olur.
--         Overlay'in tamamının PRO olması app_config.pro_overlays listesinde tutulur (c38/c40: overlay.<id> anahtarı
--         pro_features'ta değil bu listede). Bu ekleme YALNIZCA bu dosya ilk kez çalıştırılırken yapılır
--         (katalogda livechat.log henüz yokken); yönetici sonradan Yönetim › PRO özellikleri'nden herkese açık
--         yaparsa dosya tekrar çalıştırıldığında geri PRO'ya dönmez.
--      3) Kaldırılan eski "Twitch Sohbeti (eski)" overlay'i (twitch): PRO / gizli listelerinden ve katalogdan
--         temizlenir (program artık bu türü tanımıyor; kayıtlı düzenlerdeki kopyaları sessizce atıyor).
-- Sıra: c38 ve c46'dan sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

-- 2) İlk çalıştırmada: Sohbet Anketi ve Altyazı overlay'leri PRO listesine eklenir
do $$
begin
  if not exists (select 1 from public.pro_feature_catalog where key = 'livechat.log') then
    update public.app_config
       set pro_overlays = (
             select coalesce(array_agg(distinct x), '{}')
               from unnest(coalesce(pro_overlays, '{}') || array['livepoll', 'captions']) as x
           )
     where id = 1;
  end if;
end $$;

-- 3) Kaldırılan eski Twitch sohbet overlay'i
update public.app_config
   set pro_overlays = array_remove(pro_overlays, 'twitch'),
       hidden_overlays = array_remove(hidden_overlays, 'twitch')
 where id = 1
   and ('twitch' = any (pro_overlays) or 'twitch' = any (hidden_overlays));
delete from public.pro_features where key = 'overlay.twitch' or key like 'overlay.twitch.%';
delete from public.pro_feature_catalog where key = 'overlay.twitch' or key like 'overlay.twitch.%';

-- 1) Katalog
insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('livechat.log',        'Sohbet kaydını görüntüleme (arama, süzme, dışa aktarma)', 'Canlı Sohbet', true, now()),
  ('livechat.tts',        'Sohbeti sesli okuma (TTS)', 'Canlı Sohbet', true, now()),
  ('social.messages_tts', 'Mesajlar overlay''inde mesajları sesli okuma', 'Sosyal', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();
