-- ---------------------------------------------------------------------------
-- c57: Sesli komut (bas-konuş) PRO özelliği kataloğu (Yönetim › PRO özellikleri).
--      Sürücü bir direksiyon düğmesini ya da klavye tuşunu basılı tutup sesli mühendise soru sorar
--      ("ne kadar yakıtım var", "kaç olay puanım var"…); mühendis sesli cevap verir.
--      Anahtar programda tanımlı (src/sdk/proFeatures.ts) ve Rust tarafında denetleniyor
--      (src-tauri/src/voicecmd.rs allowed: "voice.commands" kilidi + sesli mühendisin kendi kilidi "voice").
--      Sunucuda tablo / RPC denetimi yok: özelliğin verisi sunucudan geçmez; karar pro_features tablosunda tutulur,
--      program pro_features_map() ile okur (c38/c40/c46 ile aynı düzen). Bu dosya yalnızca kataloğu (ad, grup,
--      varsayılan) önceden yazar; böylece web sitesindeki yönetim paneli, programdaki "kataloğu eşitle" beklenmeden
--      satırı gösterir. Yöneticinin daha önce verdiği kararlara (pro_features) DOKUNULMAZ.
--        voice.commands   Sesli komut (bas-konuş) — varsayılan: PRO (sesli mühendisin kendisi de PRO)
-- Sıra: c38'den sonra (pro_feature_catalog tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('voice.commands', 'Sesli komut (bas-konuş: mühendise sesle soru sormak)', 'Ses', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();
