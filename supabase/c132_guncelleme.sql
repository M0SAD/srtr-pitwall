-- c132: Reklam ödemesi elle (ByNoGame, Patreon …). Otomatik ödeme sayfası (Lemon / Paddle) kullanılmaz.
--   Ödeme bağlantıları: Yönetim › Reklamlar'da yönetici girer (app_config.ad_pricing.pay_links: [{name,url,note,on}]).
--   Reklam veren reklamını kaydeder, bir yöntemle öder ve "Ödedim" der (ad_pay_claim): yöntem, kullanıcı adı / sipariş
--   numarası, not reklama yazılır, yöneticilere bildirim gider. Yönetici ödemeyi kontrol edip "Ödendi say" der
--   (admin_ad_mark_paid): ödeme Gelir'e (payments, kaynak 'manual') yazılır ve reklam hemen yayına girer.

alter table public.ad_campaigns add column if not exists pay_method text not null default '';
alter table public.ad_campaigns add column if not exists pay_ref text not null default '';
alter table public.ad_campaigns add column if not exists pay_note text not null default '';
alter table public.ad_campaigns add column if not exists pay_claimed_at timestamptz;

-- Reklam veren: "Ödedim"
create or replace function public.ad_pay_claim(p_ad uuid, p_method text, p_ref text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  select * into a from public.ad_campaigns where id = p_ad and user_id = auth.uid() for update;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  if a.status <> 'unpaid' then
    raise exception 'Bu reklam zaten ödenmiş';
  end if;
  p_method := left(btrim(coalesce(p_method, '')), 60);
  p_ref := left(btrim(coalesce(p_ref, '')), 120);
  if p_method = '' or p_ref = '' then
    raise exception 'Ödeme yöntemini ve kullanıcı adını / sipariş numarasını yaz';
  end if;
  -- Aynı reklam için sık sık bildirim gönderilmesin
  if a.pay_claimed_at is not null and a.pay_claimed_at > now() - interval '2 minutes' then
    raise exception 'Bildirimin alındı; biraz bekle';
  end if;
  update public.ad_campaigns
    set pay_method = p_method, pay_ref = p_ref, pay_note = left(btrim(coalesce(p_note, '')), 500),
        pay_claimed_at = now(), updated_at = now()
    where id = p_ad;
  perform public.ad_notify_admins(p_ad, 'ad_pending',
    jsonb_build_object('claim', true, 'method', p_method, 'ref', p_ref, 'price', a.price, 'currency', a.currency), true);
end $$;
revoke all on function public.ad_pay_claim(uuid, text, text, text) from public, anon;
grant execute on function public.ad_pay_claim(uuid, text, text, text) to authenticated;

-- Yönetici: "Ödendi say": ödeme Gelir'e yazılır, reklam yayına girer
create or replace function public.admin_ad_mark_paid(p_ad uuid, p_amount numeric, p_currency text, p_method text default '')
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  a public.ad_campaigns;
  em text;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into a from public.ad_campaigns where id = p_ad;
  if a.id is null then
    raise exception 'Reklam bulunamadı';
  end if;
  if a.status <> 'unpaid' then
    raise exception 'Bu reklam zaten ödenmiş';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
    raise exception 'Geçersiz tutar';
  end if;
  p_currency := upper(coalesce(nullif(btrim(p_currency), ''), a.currency));
  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Geçersiz para birimi';
  end if;
  p_method := left(btrim(coalesce(nullif(p_method, ''), a.pay_method)), 60);
  select coalesce(u.email, '') into em from auth.users u where u.id = a.user_id;
  if p_amount > 0 then
    insert into public.payments (id, source, user_id, email, amount, currency, plan, kind, created_at, method)
    values ('ad_' || a.id::text, 'manual', a.user_id, coalesce(em, ''), round(p_amount, 2), p_currency,
            left('Reklam: ' || a.title, 120), 'payment', now(), p_method)
    on conflict (id) do nothing;
  end if;
  -- Yönetici ödemeyi kontrol etti: onay beklemeden yayına (otomatik onay ayarından bağımsız)
  update public.ad_campaigns
    set paid_at = now(), order_id = left('manual:' || p_method, 120), paid_amount = round(p_amount, 2), currency = p_currency,
        updated_at = now()
    where id = p_ad;
  perform public.ad_start(p_ad);
  perform public.log_mod('ad_paid', 'ad', p_ad::text, a.user_id,
    jsonb_build_object('title', a.title, 'amount', p_amount, 'currency', p_currency, 'method', p_method));
  return 'active';
end $$;
revoke all on function public.admin_ad_mark_paid(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_ad_mark_paid(uuid, numeric, text, text) to authenticated;

-- my_ads yeni sütunlarla
create or replace function public.my_ads()
returns setof public.ad_campaigns language sql stable security definer set search_path = public as $$
  select * from public.ad_campaigns where user_id = auth.uid() order by created_at desc limit 200;
$$;

notify pgrst, 'reload schema';
