-- c112: Arkadaş Uyarısı overlay'i varsayılan olarak PRO (app_config.pro_overlays). Yönetim › PRO özellikleri'nden değiştirilebilir.
update public.app_config
   set pro_overlays = (select array_agg(distinct x) from unnest(coalesce(pro_overlays, '{}') || array['friendalert']) as x)
 where id = 1;
