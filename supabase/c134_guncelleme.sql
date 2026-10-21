-- c134: Müzik overlay'i varsayılan olarak PRO (app_config.pro_overlays). Yönetim › PRO özellikleri'nden değiştirilebilir.
update public.app_config
   set pro_overlays = (select array_agg(distinct x) from unnest(coalesce(pro_overlays, '{}') || array['music']) as x)
 where id = 1;

notify pgrst, 'reload schema';
