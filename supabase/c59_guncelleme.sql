-- ---------------------------------------------------------------------------
-- c59: Dashboard Tasarımcısı ve uzak gösterge PRO özellikleri kataloğu (Yönetim › PRO özellikleri).
--      Dashboard Tasarımcısı: kullanıcı Direksiyon Ekranı için kendi ekranını tasarlar (Araçlar › Dashboard
--      Tasarımcısı); tasarım overlay'de "Özel tasarım" görünümü olarak kullanılır.
--      Uzak gösterge: direksiyon ekranı aynı ağdaki telefon / tablette açılır (yerel web sunucusu: /dash).
--      Anahtarlar programda tanımlı (src/sdk/proFeatures.ts). "dashboard.remote" Rust tarafında da denetleniyor
--      (src-tauri/src/server.rs: kilitliyken /dash sayfası ve /api/dash 403 döner).
--      Sunucuda tablo / RPC denetimi yok: özelliklerin verisi sunucudan geçmez; karar pro_features tablosunda
--      tutulur, program pro_features_map() ile okur (c38/c40/c46/c57 ile aynı düzen). Bu dosya yalnızca kataloğu
--      (ad, grup, varsayılan) önceden yazar; böylece web sitesindeki yönetim paneli, programdaki "kataloğu eşitle"
--      beklenmeden satırları gösterir. Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
--        dashboard.designer   Dashboard tasarımcısı — varsayılan: PRO
--        dashboard.remote     Uzak gösterge (telefon / tablet) — varsayılan: PRO
--      Not: overlay'deki "Özel tasarım" görünümü ayrı bir seçenek anahtarıdır
--      (overlay.dashboard.view.custom, varsayılan PRO); program "kataloğu eşitle" ile kendisi yazar.
-- Sıra: c38'den sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('dashboard.designer', 'Dashboard tasarımcısı (Direksiyon Ekranı için kendi tasarımını yapmak)', 'Araçlar', true, now()),
  ('dashboard.remote', 'Uzak gösterge (direksiyon ekranını telefon / tabletten açmak: /dash)', 'Araçlar', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();
