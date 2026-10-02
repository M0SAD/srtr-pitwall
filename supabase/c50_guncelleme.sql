-- ---------------------------------------------------------------------------
-- c50: Canlı Sohbet'te "Bildirimler" (Streamlabs uyarıları, livechat.alerts) ve "OBS tarayıcı kaynağı"
--      (livechat.obs) artık varsayılan olarak herkese açık (ücretsiz). Katalog varsayılanı güncellenir ve
--      bu iki anahtar için daha önce kaydedilmiş karar (varsa) silinir; yönetici isterse Yönetim › PRO
--      özellikleri'nden yeniden PRO'ya ayırabilir.
-- Sıra: c46 / c47 sonrasında. Tekrar çalıştırılabilir (tekrar çalıştırılırsa yönetici kararını yine siler).
-- ---------------------------------------------------------------------------
update public.pro_feature_catalog set default_pro = false, updated_at = now()
 where key in ('livechat.obs', 'livechat.alerts');
delete from public.pro_features where key in ('livechat.obs', 'livechat.alerts');
