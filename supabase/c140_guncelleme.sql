-- c140: Ödeme bildirimleri: bildirime tıklayınca üyenin profili açılır, yöneticiye e-posta gider.
-- Reklam ödemesi bildiriminde (ad_pay_claim → 'ad_pending' + claim) reklam verenin kimliği ve e-postası bildirime
-- eklenir (uygulama tıklayınca Yönetim › Üyeler'de o üyeyi açar; e-postada da yazar). PRO ödeme bildirimi
-- ('pay_claim') zaten üyenin kimliğini ve e-postasını taşıyor; e-postası c99'dan beri gidiyor.
-- Sıra: c132'den sonra. Tekrar çalıştırmak güvenlidir.

create or replace function public.ad_notify_admins(p_ad uuid, p_kind text, p_extra jsonb default '{}', p_force boolean default false)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.notifications (user_id, kind, data)
    select p.id, p_kind,
      jsonb_build_object('ad', a.id, 'title', a.title, 'placement', a.placement, 'reports', a.reports,
                         'name', coalesce((select display_name from public.profiles where id = a.user_id), '?'),
                         'user', a.user_id,
                         'email', coalesce((select u.email::text from auth.users u where u.id = a.user_id), '')) || coalesce(p_extra, '{}')
    from public.ad_campaigns a cross join public.profiles p
    where a.id = p_ad and p.is_admin
      and (p_force or not exists (select 1 from public.notifications n where n.user_id = p.id and not n.read
                                  and n.kind = p_kind and n.data ->> 'ad' = a.id::text));
end $$;

notify pgrst, 'reload schema';
