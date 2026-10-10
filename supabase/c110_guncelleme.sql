-- ---------------------------------------------------------------------------
-- c110: Paddle ile otomatik ödeme (Lemon Squeezy'nin yerine).
--
-- Yeni PRO abonelikleri, hediye PRO ve reklam ödemeleri Paddle Billing'den gelir (pro-checkout / ads-checkout,
-- PADDLE_API_KEY tanımlıysa). Var olan Lemon abonelikleri eskisi gibi yenilenmeye ve pro-webhook?source=lemon
-- olaylarıyla işlenmeye devam eder; bu dosya onları değiştirmez.
--
--   1) subscriptions.provider ('lemon' | 'paddle') ve subscriptions.customer_id (Paddle müşteri kimliği, ctm_…).
--      Paddle abonelik kimliği (sub_…) Lemon'daki gibi lemon_id sütununda tutulur (abonelik kimliği; ad tarihsel).
--   2) apply_subscription: isteğe bağlı p_provider / p_customer / p_event_at (olay zamanı: Paddle bildirimleri sırasız
--      gelebilir; kayıttaki son olaydan eski olay atlanır, subscriptions.event_at). Paddle aboneliği profiles.pro_source = 'paddle' yazar;
--      'lemon' ve 'paddle' ikisi de "otomatik abonelik" sayılır (birbirinin süresini kısaltmaz, ikisi de uzatır).
--      Eski imza kaldırılır (aynı adla iki imza PostgREST'te belirsiz çağrıya yol açar); Lemon çağrısı p_provider
--      vermediği için varsayılan 'lemon' kalır.
--   3) admin_revenue / admin_pro_members: 'paddle' de ücretli kaynak.
--   4) my_pro: 'sub' içinde provider ve sub_id (Paddle'da "Aboneliği yönet" düğmesi pro-portal fonksiyonunu çağırır;
--      Paddle kalıcı bir portal bağlantısı vermez, her seferinde kısa ömürlü oturum açılır).
--      my_gifts: provider sütunu.
-- Sıra: önce bu dosya, sonra pro-webhook / pro-checkout / ads-checkout / gift-cancel / pro-portal / pitwall-jobs.
-- ---------------------------------------------------------------------------

alter table public.subscriptions add column if not exists provider text not null default 'lemon';
alter table public.subscriptions add column if not exists customer_id text not null default '';
-- Son işlenen olayın zamanı (Paddle data.updated_at): sırasız gelen eski olaylar atlanır
alter table public.subscriptions add column if not exists event_at timestamptz;
create index if not exists subscriptions_customer on public.subscriptions (customer_id) where customer_id <> '';

drop function if exists public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid);
create or replace function public.apply_subscription(
  p_lemon_id text, p_user uuid, p_email text, p_status text, p_plan text, p_variant text,
  p_renews timestamptz, p_ends timestamptz, p_portal text, p_until timestamptz, p_gifter uuid default null,
  p_provider text default 'lemon', p_customer text default '', p_event_at timestamptz default null
) returns text language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := p_user;
  gifter uuid := p_gifter;
  prev public.subscriptions;
  gift boolean;
  off interval := interval '0';
  best timestamptz;
  cur timestamptz;
  prov text := case when p_provider in ('lemon', 'paddle') then p_provider else 'lemon' end;
begin
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  if gifter is not null and not exists (select 1 from public.profiles where id = gifter) then
    gifter := null;
  end if;
  select * into prev from public.subscriptions where lemon_id = p_lemon_id for update;
  -- Sırasız / gecikmeli bildirim (Paddle): kayıttaki durumdan eski olay yenisinin üstüne yazılmaz
  if prev.lemon_id is not null and p_event_at is not null and prev.event_at is not null and p_event_at < prev.event_at then
    return coalesce(prev.user_id::text, 'none');
  end if;
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
                                    gifted_by, is_gift, gift_offset, grant_until, provider, customer_id, event_at)
    values (p_lemon_id, uid, coalesce(p_email, ''), p_status, p_plan, p_variant, p_renews, p_ends, coalesce(p_portal, ''),
            gifter, gift, off, p_until + off, prov, coalesce(p_customer, ''), p_event_at)
    on conflict (lemon_id) do update set
      user_id = coalesce(excluded.user_id, public.subscriptions.user_id),
      status = excluded.status, plan = excluded.plan, variant_id = excluded.variant_id,
      renews_at = excluded.renews_at, ends_at = excluded.ends_at,
      portal_url = case when excluded.portal_url = '' then public.subscriptions.portal_url else excluded.portal_url end,
      gifted_by = coalesce(excluded.gifted_by, public.subscriptions.gifted_by),
      is_gift = public.subscriptions.is_gift or excluded.is_gift,
      grant_until = coalesce(excluded.grant_until, public.subscriptions.grant_until),
      provider = excluded.provider,
      event_at = greatest(coalesce(excluded.event_at, public.subscriptions.event_at), coalesce(public.subscriptions.event_at, excluded.event_at)),
      customer_id = case when excluded.customer_id = '' then public.subscriptions.customer_id else excluded.customer_id end,
      email = case when excluded.email = '' then public.subscriptions.email else excluded.email end,
      updated_at = now();
  if p_until is null then
    return coalesce(uid::text, 'none');
  end if;
  if uid is null then
    if gift then
      return 'none';
    end if;
    insert into public.pending_pro (email, pro_until, source) values (lower(p_email), p_until, prov)
      on conflict (email) do update set pro_until = greatest(public.pending_pro.pro_until, excluded.pro_until), source = prov;
    return 'pending';
  end if;
  -- Hesabın tüm aboneliklerinden en geç biten; elle/Patreon ile verilmiş daha uzun süre varsa kısaltma
  select max(grant_until) into best from public.subscriptions where user_id = uid;
  best := coalesce(best, p_until + off);
  update public.profiles set
    pro_until = case when pro_source in ('lemon', 'paddle') or pro_until is null or pro_until < best then best else pro_until end,
    pro_source = case when pro_source in ('lemon', 'paddle') or pro_until is null or pro_until < best then prov else pro_source end
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
revoke all on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid, text, text, timestamptz) to service_role;

create or replace function public.admin_revenue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  paid_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select coalesce(array_agg(p.id), '{}') into paid_ids from public.profiles p
    where p.pro_until > now()
      and (p.pro_source in ('lemon', 'paddle', 'patreon', 'kofi')
           or exists (select 1 from public.payments x where x.user_id = p.id and x.kind = 'payment'));
  return jsonb_build_object(
    'month', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments where created_at >= date_trunc('month', now()) group by currency) r),
    'd30', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments where created_at >= now() - interval '30 days' group by currency) r),
    'all', (select coalesce(jsonb_object_agg(currency, total), '{}') from (
        select currency, sum(case when kind = 'refund' then -amount else amount end) total
        from public.payments group by currency) r),
    'payments_month', (select count(*) from public.payments where kind = 'payment' and created_at >= date_trunc('month', now())),
    'payments_all', (select count(*) from public.payments where kind = 'payment'),
    'paying_users', (select count(distinct user_id) from public.payments where kind = 'payment' and user_id is not null),
    'paid_pro', coalesce(array_length(paid_ids, 1), 0),
    'free_pro', (select count(*) from public.profiles p where p.pro_until > now() and not (p.id = any (paid_ids))),
    'promo_until', (select promo_pro_until from public.app_config where id = 1)
  );
end $$;

create or replace function public.admin_pro_members(p_kind text default 'paid')
returns table (user_id uuid, display_name text, email text, pro_until timestamptz, pro_source text,
               paid jsonb, payments int, last_payment timestamptz, renewing boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    with m as (
      select p.id, p.display_name, u.email::text as email, p.pro_until, p.pro_source,
        (p.pro_source in ('lemon', 'paddle', 'patreon', 'kofi')
         or exists (select 1 from public.payments x where x.user_id = p.id and x.kind = 'payment')) as is_paid
      from public.profiles p join auth.users u on u.id = p.id
      where p.pro_until > now()
    )
    select m.id, m.display_name, m.email, m.pro_until, m.pro_source,
      (select coalesce(jsonb_object_agg(q.currency, q.total), '{}') from (
         select x.currency, sum(case when x.kind = 'refund' then -x.amount else x.amount end) total
         from public.payments x where x.user_id = m.id group by x.currency) q),
      (select count(*)::int from public.payments x where x.user_id = m.id and x.kind = 'payment'),
      (select max(x.created_at) from public.payments x where x.user_id = m.id and x.kind = 'payment'),
      public.sub_renewing(m.id)
    from m
    where (coalesce(p_kind, 'paid') = 'paid') = m.is_paid
    order by m.pro_until desc
    limit 1000;
end $$;

grant execute on function public.admin_revenue(), public.admin_pro_members(text) to authenticated;

create or replace function public.my_pro() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pro_until', p.pro_until,
    'source', p.pro_source,
    'renewing', public.sub_renewing(p.id),
    'sub', (select to_jsonb(s) from (
      select status, plan, renews_at, ends_at, portal_url, provider, lemon_id as sub_id from public.subscriptions
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

drop function if exists public.my_gifts();
create or replace function public.my_gifts()
returns table (lemon_id text, recipient uuid, recipient_name text, plan text, status text,
               renews_at timestamptz, ends_at timestamptz, until timestamptz, created_at timestamptz, provider text)
language sql stable security definer set search_path = public as $$
  select s.lemon_id, s.user_id, coalesce(p.display_name, ''), s.plan, s.status, s.renews_at, s.ends_at, s.grant_until, s.created_at, s.provider
  from public.subscriptions s left join public.profiles p on p.id = s.user_id
  where s.is_gift and s.gifted_by = auth.uid()
  order by s.created_at desc
  limit 50;
$$;
revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

notify pgrst, 'reload schema';
