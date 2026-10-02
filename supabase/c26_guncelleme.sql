-- ---------------------------------------------------------------------------
-- c26: Hediye PRO aboneliği.
--      Giriş yapmış bir üye, kayıtlı başka bir üyeye PRO aboneliği hediye edebilir (pro-checkout gift_to).
--      Ödeme sayfasında e-posta ALANIN (hediye edenin) kendi e-postasıdır; fatura, makbuz ve yenileme
--      ödemeleri ona aittir. Abonelik custom_data.user_id (alıcı) ile alıcıya işlenir, custom_data.gifter
--      hediye edeni tutar.
--      1) subscriptions: gifted_by (hediye eden), is_gift, gift_offset (alıcının hediye anındaki kalan PRO
--         süresi; hediye bunun üstüne eklenir), gift_notified, grant_until (bu aboneliğin verdiği PRO bitişi).
--         Alıcı hediye aboneliği tablodan okuyamaz (hediye edenin e-postası / portal bağlantısı gizli kalır).
--      2) apply_subscription: yeni isteğe bağlı p_gifter. Hesabın PRO bitişi artık tüm aboneliklerinin
--         grant_until değerlerinin en büyüğüdür: bir aboneliğin iptali/bitişi diğerinin (ör. hediyenin)
--         süresini kısaltmaz. Hediye ilk kez aktif olunca alıcıya 'pro_gift' (+ e-posta), hediye edene
--         'pro_gift_sent' bildirimi gider (ikisine de e-posta).
--      3) payments.gift_to: hediye faturalarında ödeme HEDİYE EDENE yazılır (makbuz ona gider, ciro doğru
--         sayılır), alıcı gift_to'da tutulur. record_payment'a isteğe bağlı p_gift_to eklendi.
--      4) my_pro: 'sub' artık sadece kendi (hediye olmayan) aboneliği; 'gift' / 'gifted_by_name' alıcının
--         aldığı hediye. my_gifts(): hediye ettiğim abonelikler. gift_cancelled(): gift-cancel fonksiyonu
--         Lemon'da iptal ettikten sonra çağırır (alıcıya 'pro_gift_ended' bildirimi + e-posta).
--      Alıcı hediyeyi kendisi sonlandıramaz: tabloda sadece okuma izni var (hediye satırları ona gizli),
--      my_pro hediyenin portal bağlantısını vermez, gift-cancel sadece gifted_by = çağıran ise çalışır.
-- Sıra: önce bu dosya, sonra pro-webhook / pro-checkout / gift-cancel / pitwall-jobs fonksiyonları.
-- ---------------------------------------------------------------------------

-- 1) Abonelik sütunları ----------------------------------------------------------
alter table public.subscriptions add column if not exists gifted_by uuid references public.profiles (id) on delete set null;
alter table public.subscriptions add column if not exists is_gift boolean not null default false;
alter table public.subscriptions add column if not exists gift_offset interval not null default interval '0';
alter table public.subscriptions add column if not exists gift_notified boolean not null default false;
alter table public.subscriptions add column if not exists grant_until timestamptz;
create index if not exists subscriptions_gifted_by on public.subscriptions (gifted_by) where gifted_by is not null;

-- Var olan abonelikler: verdikleri PRO bitişi (webhook'taki hesapla aynı: aktifse yenileme + 3 gün, değilse bitiş)
update public.subscriptions
  set grant_until = case when status in ('active', 'on_trial', 'past_due') then renews_at + interval '3 days' else ends_at end
  where grant_until is null;

-- Alıcı hediye aboneliğinin satırını göremez (hediye edenin e-postası ve müşteri portalı orada)
drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions for select using (auth.uid() = user_id and not is_gift);

-- 2) Webhook: aboneliği kaydet, PRO süresini ayarla ---------------------------------
drop function if exists public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz);
create or replace function public.apply_subscription(
  p_lemon_id text, p_user uuid, p_email text, p_status text, p_plan text, p_variant text,
  p_renews timestamptz, p_ends timestamptz, p_portal text, p_until timestamptz, p_gifter uuid default null
) returns text language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
  gifter uuid := p_gifter;
  prev public.subscriptions;
  gift boolean;
  off interval := interval '0';
  best timestamptz;
  cur timestamptz;
begin
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  if gifter is not null and not exists (select 1 from public.profiles where id = gifter) then
    gifter := null;
  end if;
  select * into prev from public.subscriptions where lemon_id = p_lemon_id for update;
  -- Hediye kalıcıdır: yenileme olaylarında custom_data gelmese de abonelik hediye olarak kalır
  gift := coalesce(prev.is_gift, false) or gifter is not null;
  if prev.lemon_id is not null then
    gifter := coalesce(gifter, prev.gifted_by);
    uid := coalesce(uid, prev.user_id);
  end if;
  if gifter is not null and gifter = uid then
    -- Kendine hediye olmaz: normal abonelik say
    gifter := null;
    gift := coalesce(prev.is_gift, false);
  end if;
  -- Hediyede e-posta hediye edenin: alıcıyı e-postayla eşleme (PRO yanlış hesaba gitmesin)
  if uid is null and not gift and coalesce(p_email, '') <> '' then
    select p.id into uid from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email)
      limit 1;
  end if;
  if prev.lemon_id is not null then
    off := prev.gift_offset;
  elsif gift and uid is not null then
    -- Yeni hediye: alıcının kalan PRO süresinin üstüne eklenir (süresi kısalmaz)
    select greatest(coalesce(pro_until, now()) - now(), interval '0') into off from public.profiles where id = uid;
    off := coalesce(off, interval '0');
    if off > interval '3000 days' then
      off := interval '0'; -- süresiz PRO: eklemeye gerek yok
    end if;
  end if;

  insert into public.subscriptions (lemon_id, user_id, email, status, plan, variant_id, renews_at, ends_at, portal_url,
                                    gifted_by, is_gift, gift_offset, grant_until)
    values (p_lemon_id, uid, coalesce(p_email, ''), p_status, p_plan, p_variant, p_renews, p_ends, coalesce(p_portal, ''),
            gifter, gift, off, p_until + off)
    on conflict (lemon_id) do update set
      user_id = coalesce(excluded.user_id, public.subscriptions.user_id),
      email = excluded.email, status = excluded.status, plan = excluded.plan, variant_id = excluded.variant_id,
      renews_at = excluded.renews_at, ends_at = excluded.ends_at,
      portal_url = case when excluded.portal_url = '' then public.subscriptions.portal_url else excluded.portal_url end,
      gifted_by = coalesce(excluded.gifted_by, public.subscriptions.gifted_by),
      is_gift = public.subscriptions.is_gift or excluded.is_gift,
      grant_until = coalesce(excluded.grant_until, public.subscriptions.grant_until),
      updated_at = now();
  if p_until is null then
    return coalesce(uid::text, 'none');
  end if;
  if uid is null then
    if gift then
      return 'none';
    end if;
    insert into public.pending_pro (email, pro_until, source) values (lower(p_email), p_until, 'lemon')
      on conflict (email) do update set pro_until = greatest(public.pending_pro.pro_until, excluded.pro_until), source = 'lemon';
    return 'pending';
  end if;
  -- Hesabın tüm aboneliklerinden en geç biten; elle/Patreon ile verilmiş daha uzun süre varsa kısaltma
  select max(grant_until) into best from public.subscriptions where user_id = uid;
  best := coalesce(best, p_until + off);
  update public.profiles set
    pro_until = case when pro_source = 'lemon' or pro_until is null or pro_until < best then best else pro_until end,
    pro_source = case when pro_source = 'lemon' or pro_until is null or pro_until < best then 'lemon' else pro_source end
  where id = uid;

  -- Hediye ilk kez aktif oldu: alıcıya ve hediye edene bildirim (bir kez)
  if gift and p_status in ('active', 'on_trial') and not coalesce(prev.gift_notified, false) then
    select pro_until into cur from public.profiles where id = uid;
    insert into public.notifications (user_id, kind, data)
      values (uid, 'pro_gift', jsonb_build_object(
        'gifter', gifter, 'name', coalesce((select display_name from public.profiles where id = gifter), ''),
        'plan', coalesce(p_plan, ''), 'until', cur, 'lemon_id', p_lemon_id));
    if gifter is not null then
      insert into public.notifications (user_id, kind, data)
        values (gifter, 'pro_gift_sent', jsonb_build_object(
          'to', uid, 'name', coalesce((select display_name from public.profiles where id = uid), ''),
          'plan', coalesce(p_plan, ''), 'renews_at', p_renews, 'lemon_id', p_lemon_id));
    end if;
    update public.subscriptions set gift_notified = true where lemon_id = p_lemon_id;
  end if;
  return uid::text;
end $$;
revoke all on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid) to service_role;

-- gift-cancel: hediye eden Lemon'da iptal etti (ödenen dönemin sonuna kadar PRO sürer). Webhook da
-- 'cancelled' olayını ayrıca yollar; burada durum hemen güncellenir ve alıcıya bildirim gider.
create or replace function public.gift_cancelled(p_lemon_id text, p_gifter uuid, p_ends timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.subscriptions;
begin
  select * into s from public.subscriptions where lemon_id = p_lemon_id and is_gift and gifted_by = p_gifter for update;
  if s.lemon_id is null then
    raise exception 'Hediye bulunamadı';
  end if;
  update public.subscriptions
    set status = 'cancelled', ends_at = coalesce(p_ends, ends_at, renews_at), updated_at = now()
    where lemon_id = p_lemon_id;
  if s.status <> 'cancelled' and s.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (s.user_id, 'pro_gift_ended', jsonb_build_object(
        'gifter', p_gifter, 'name', coalesce((select display_name from public.profiles where id = p_gifter), ''),
        'plan', s.plan, 'until', (select pro_until from public.profiles where id = s.user_id), 'lemon_id', p_lemon_id));
  end if;
  return jsonb_build_object('status', 'cancelled', 'ends_at', coalesce(p_ends, s.ends_at, s.renews_at));
end $$;
revoke all on function public.gift_cancelled(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.gift_cancelled(text, uuid, timestamptz) to service_role;

-- 3) Ödemeler: hediye faturası hediye edene, alıcı gift_to ---------------------------
alter table public.payments add column if not exists gift_to uuid references public.profiles (id) on delete set null;

drop function if exists public.record_payment(text, text, text, uuid, numeric, text, text, text);
create or replace function public.record_payment(
  p_id text, p_source text, p_email text, p_user uuid, p_amount numeric, p_currency text, p_plan text, p_kind text,
  p_gift_to uuid default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
  gto uuid := p_gift_to;
begin
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  if gto is not null and not exists (select 1 from public.profiles where id = gto) then
    gto := null;
  end if;
  if uid is null and coalesce(p_email, '') <> '' then
    select p.id into uid from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = lower(p_email) or lower(coalesce(p.pay_email, '')) = lower(p_email) limit 1;
  end if;
  insert into public.payments (id, source, user_id, email, amount, currency, plan, kind, gift_to)
    values (p_id, p_source, uid, lower(coalesce(p_email, '')), coalesce(p_amount, 0), upper(coalesce(nullif(p_currency, ''), 'USD')),
            coalesce(p_plan, ''), coalesce(nullif(p_kind, ''), 'payment'), gto)
    on conflict (id) do update set amount = excluded.amount, kind = excluded.kind,
      user_id = coalesce(public.payments.user_id, excluded.user_id), gift_to = coalesce(public.payments.gift_to, excluded.gift_to);
end $$;
revoke all on function public.record_payment(text, text, text, uuid, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_payment(text, text, text, uuid, numeric, text, text, text, uuid) to service_role;

-- Ödeme bildirimi: hediyede alıcının adı eklenir, ödeyenin kendi PRO süresi yazılmaz
create or replace function public.payment_notify_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_ad boolean := coalesce(new.plan, '') like 'Reklam:%';
  is_gift boolean := new.gift_to is not null;
  d jsonb;
begin
  if coalesce(new.amount, 0) = 0 then
    return null;
  end if;
  d := jsonb_build_object('payment', new.id, 'source', new.source, 'amount', new.amount, 'currency', new.currency,
                          'plan', new.plan, 'kind', new.kind, 'email', new.email, 'ad', is_ad,
                          'name', coalesce((select display_name from public.profiles where id = new.user_id), ''));
  if is_gift then
    d := d || jsonb_build_object('gift', true, 'gift_to', new.gift_to,
                                 'gift_name', coalesce((select display_name from public.profiles where id = new.gift_to), ''));
  end if;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'payment_new', d from public.profiles p where p.is_admin;
  if new.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (new.user_id, 'payment_receipt',
              d || case when is_ad or is_gift then '{}'::jsonb
                        else jsonb_build_object('pro_until', (select pro_until from public.profiles where id = new.user_id)) end);
  end if;
  return null;
end $$;

-- my_payments: hediye ödemelerinde alıcının adı
drop function if exists public.my_payments();
create or replace function public.my_payments()
returns table (id text, source text, amount numeric, currency text, plan text, kind text, created_at timestamptz, gift_name text)
language sql stable security definer set search_path = public as $$
  select y.id, y.source, y.amount, y.currency, y.plan, y.kind, y.created_at,
         case when y.gift_to is not null then coalesce((select display_name from public.profiles where id = y.gift_to), '') end
  from public.payments y
  where y.user_id = auth.uid() order by y.created_at desc limit 100;
$$;
grant execute on function public.my_payments() to authenticated;

-- 4) Kullanıcı RPC'leri -----------------------------------------------------------
-- Kendi PRO durumu: 'sub' kendi aboneliği (hediye hariç; portal bağlantısı ödeyene aittir),
-- 'gift' aldığım (sürmekte olan) hediye ve hediye edenin adı
create or replace function public.my_pro() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro_until', p.pro_until,
    'source', p.pro_source,
    'renewing', public.sub_renewing(p.id),
    'sub', (select to_jsonb(s) from (
      select status, plan, renews_at, ends_at, portal_url from public.subscriptions
      where user_id = p.id and not is_gift order by updated_at desc limit 1) s),
    'gift', g.j,
    'gifted_by_name', g.j ->> 'gifted_by_name'
  ) from public.profiles p
  left join lateral (
    select to_jsonb(x) as j from (
      select s.status, s.plan, s.renews_at, s.ends_at, s.created_at, s.grant_until as until,
             coalesce(gp.display_name, '') as gifted_by_name
      from public.subscriptions s left join public.profiles gp on gp.id = s.gifted_by
      where s.user_id = p.id and s.is_gift
        and (s.status in ('active', 'on_trial', 'past_due') or coalesce(s.grant_until, s.ends_at) > now())
      order by s.updated_at desc limit 1) x
  ) g on true
  where p.id = auth.uid();
$$;
grant execute on function public.my_pro() to authenticated;

-- Hediye ettiğim abonelikler (alıcının e-postası gösterilmez)
create or replace function public.my_gifts()
returns table (lemon_id text, recipient uuid, recipient_name text, plan text, status text,
               renews_at timestamptz, ends_at timestamptz, until timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.lemon_id, s.user_id, coalesce(p.display_name, ''), s.plan, s.status, s.renews_at, s.ends_at, s.grant_until, s.created_at
  from public.subscriptions s left join public.profiles p on p.id = s.user_id
  where s.is_gift and s.gifted_by = auth.uid()
  order by s.created_at desc
  limit 50;
$$;
revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

-- Bildirimden e-posta (c25'teki türler + hediye PRO: alıcıya pro_gift / pro_gift_ended, hediye edene pro_gift_sent)
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;
