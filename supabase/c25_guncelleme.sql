-- ---------------------------------------------------------------------------
-- c25: Ödeme bildirimleri ve reklam verenin kendi reklamını durdurması.
--      1) payments tablosuna her yeni kayıt (PRO aboneliği, yenileme, reklam, Patreon, Ko-fi, iade):
--         - yöneticilere 'payment_new' bildirimi + e-posta (pitwall-jobs → paymentAdmin)
--         - ödeme bir hesaba bağlıysa ödeyene 'payment_receipt' bildirimi + kendi dilinde teşekkür/makbuz
--           e-postası (pitwall-jobs → paymentReceipt). PRO ödemelerinde o anki pro_until, reklam
--           ödemelerinde (plan 'Reklam:' ile başlar) 'ad': true eklenir.
--         Tutarı 0 olan kayıtlar bildirim üretmez. Aynı ödeme tekrar gelirse (on conflict update) yeni bildirim olmaz.
--      2) Reklam veren, gösterim bazlı reklamını kendisi durdurup sürdürebilir (yeni durum: paused_owner).
--         Süreli (gün bazlı) reklamlar durdurulamaz, süre işlemeye devam eder.
--         paused_owner reklam gösterilmez ve gösterim harcamaz (ad_pick / ad_impression / ad_housekeeping
--         sadece 'active' reklamlara bakar). Yönetici paused_owner reklamı durdurabilir, sürdürebilir, bitirebilir.
-- ---------------------------------------------------------------------------

-- 1) Ödeme bildirimleri -------------------------------------------------------
create or replace function public.payment_notify_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_ad boolean := coalesce(new.plan, '') like 'Reklam:%';
  d jsonb;
begin
  if coalesce(new.amount, 0) = 0 then
    return null;
  end if;
  d := jsonb_build_object('payment', new.id, 'source', new.source, 'amount', new.amount, 'currency', new.currency,
                          'plan', new.plan, 'kind', new.kind, 'email', new.email, 'ad', is_ad,
                          'name', coalesce((select display_name from public.profiles where id = new.user_id), ''));
  insert into public.notifications (user_id, kind, data)
    select p.id, 'payment_new', d from public.profiles p where p.is_admin;
  if new.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (new.user_id, 'payment_receipt',
              d || case when is_ad then '{}'::jsonb
                        else jsonb_build_object('pro_until', (select pro_until from public.profiles where id = new.user_id)) end);
  end if;
  return null;
end $$;
drop trigger if exists payment_notify_trg on public.payments;
create trigger payment_notify_trg after insert on public.payments
  for each row execute function public.payment_notify_trg();

create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

-- 2) Reklam verenin durdurması (paused_owner) ---------------------------------
alter table public.ad_campaigns drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns add constraint ad_campaigns_status_check
  check (status in ('unpaid', 'pending_review', 'active', 'paused', 'paused_reports', 'paused_owner', 'ended', 'rejected', 'refunded'));

-- Reklam veren: gösterim bazlı reklamı durdur (p_pause = true) / sürdür (false). Yeni durumu döndürür.
create or replace function public.ad_owner_pause(p_ad uuid, p_pause boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a public.ad_campaigns;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into a from public.ad_campaigns where id = p_ad and user_id = me for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  if a.model <> 'impressions' then
    raise exception 'Süreli reklamlar durdurulamaz';
  end if;
  if coalesce(p_pause, true) then
    if a.status = 'paused_owner' then
      return a.status;
    end if;
    if a.status <> 'active' then
      raise exception 'Sadece yayındaki reklam durdurulabilir';
    end if;
    update public.ad_campaigns set status = 'paused_owner', paused_at = now(), updated_at = now() where id = p_ad;
    return 'paused_owner';
  end if;
  if a.status = 'active' then
    return a.status;
  end if;
  if a.status <> 'paused_owner' then
    raise exception 'Bu reklamı sadece yönetici yeniden yayına alabilir';
  end if;
  update public.ad_campaigns set status = 'active', paused_at = null, updated_at = now() where id = p_ad;
  -- Gösterimleri zaten dolmuşsa hemen bitir
  if a.impressions >= a.quantity then
    perform public.ad_finish(p_ad);
    return 'ended';
  end if;
  return 'active';
end $$;
revoke all on function public.ad_owner_pause(uuid, boolean) from public, anon;
grant execute on function public.ad_owner_pause(uuid, boolean) to authenticated;

-- Yönetici işlemleri: approve | reject | pause | resume | extend | end | delete
--   extend: süreli reklama p_amount gün, gösterimli reklama p_amount gösterim ekler
--   paused_owner (reklam verenin durdurduğu): yönetici durdurabilir (paused), sürdürebilir, bitirebilir, reddedebilir
create or replace function public.admin_ad_set(p_ad uuid, p_action text, p_note text default '', p_amount int default 0)
returns void language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into a from public.ad_campaigns where id = p_ad for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  p_note := left(coalesce(p_note, ''), 500);
  if p_action = 'approve' then
    if a.status not in ('pending_review', 'rejected') or a.paid_at is null then
      raise exception 'Sadece ödenmiş ve onay bekleyen reklam onaylanabilir';
    end if;
    update public.ad_campaigns set review_note = p_note where id = p_ad;
    perform public.ad_start(p_ad);
  elsif p_action = 'reject' then
    if a.status in ('ended', 'refunded', 'rejected') then
      raise exception 'Bu reklam reddedilemez';
    end if;
    update public.ad_campaigns set status = 'rejected', review_note = p_note, ended_at = now(), updated_at = now() where id = p_ad;
    if a.status <> 'unpaid' then
      perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'rejected', 'note', p_note));
    end if;
  elsif p_action = 'pause' then
    if a.status not in ('active', 'paused_owner') then
      raise exception 'Sadece yayındaki ya da reklam verenin durdurduğu reklam durdurulabilir';
    end if;
    update public.ad_campaigns set status = 'paused', paused_at = coalesce(case when a.status = 'paused_owner' then paused_at end, now()),
                                   review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'paused', 'note', p_note));
  elsif p_action = 'resume' then
    if a.status not in ('paused', 'paused_reports', 'paused_owner') then
      raise exception 'Sadece durdurulmuş reklam sürdürülebilir';
    end if;
    -- Süreli reklamda durdurulan süre bitişe eklenir; rapor sayacı sıfırdan sayılır
    update public.ad_campaigns
      set status = 'active', report_base = reports, updated_at = now(),
          ends_at = case when model = 'days' and paused_at is not null then ends_at + (now() - paused_at) else ends_at end,
          paused_at = null
      where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_live', jsonb_build_object('resumed', true));
  elsif p_action = 'extend' then
    if coalesce(p_amount, 0) <= 0 or a.status in ('unpaid', 'refunded', 'rejected') then
      raise exception 'Uzatma yapılamaz';
    end if;
    update public.ad_campaigns
      set quantity = quantity + p_amount, updated_at = now(),
          ends_at = case when model = 'days' then greatest(coalesce(ends_at, now()), now()) + make_interval(days => p_amount) else ends_at end
      where id = p_ad;
    if a.status = 'ended' then
      update public.ad_campaigns set status = 'active', ended_at = null where id = p_ad;
      perform public.ad_notify(p_ad, 'ad_live', jsonb_build_object('resumed', true));
    end if;
  elsif p_action = 'end' then
    if a.status not in ('active', 'paused', 'paused_reports', 'paused_owner', 'pending_review') then
      raise exception 'Bu reklam bitirilemez';
    end if;
    update public.ad_campaigns set status = 'ended', ended_at = now(), review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_ended', jsonb_build_object('note', p_note));
  elsif p_action = 'delete' then
    if a.status not in ('unpaid', 'rejected', 'ended', 'refunded') then
      raise exception 'Yayındaki ya da ödenmiş bekleyen reklam silinemez; önce bitir';
    end if;
    delete from public.ad_campaigns where id = p_ad;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('ad_' || p_action, 'ad', p_ad::text, a.user_id, jsonb_build_object('title', a.title, 'note', p_note, 'amount', p_amount));
end $$;
grant execute on function public.admin_ad_set(uuid, text, text, int) to authenticated;
