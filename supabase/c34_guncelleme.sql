-- ---------------------------------------------------------------------------
-- c34: İndirim kuponları. Yönetici yönetim panelinden kupon oluşturur (ör. "ERKIN" → %5 indirim):
--      kod (büyük/küçük harf duyarsız, tekil), yüzde (1-90), başlangıç (isteğe bağlı) ve bitiş zamanı (boşsa süresiz),
--      geçerli paketler: PRO planları (1m, 3m, 6m, 12m), hediye PRO'da geçerli mi, reklam paketleri
--      (impressions: gösterim paketi, days: süre), toplam kullanım sınırı (isteğe bağlı), kişi başı sınır (varsayılan 1),
--      etkin/kapalı, not.
--      Kullanıcı PRO / hediye PRO / reklam satın alırken kodu girer; coupon_check indirimli fiyatı gösterir.
--      pro-checkout ve ads-checkout kuponu sunucuda yeniden doğrular (coupon_validate), indirimli tutarı
--      custom_price olarak gönderir ve indirimi Lemon ödeme sayfasında ürün adı/açıklamasında gösterir.
--      Ödeme gelince pro-webhook kullanımı coupon_redemptions'a yazar (coupon_redeem; aynı sipariş/abonelik bir kez).
--      PRO aboneliğinde Lemon custom_price yenilemelerde de kullanıldığı için indirim o aboneliğin yenilemelerinde de sürer
--      (kullanım ise abonelik başına bir kez sayılır).
--      Yönetici RPC'leri: coupon_admin_list, coupon_admin_save, coupon_admin_set_active, coupon_admin_delete
--      (sadece hiç kullanılmamış kupon silinir), coupon_admin_redemptions. Hepsi mod_log'a yazılır.
-- Sıra: c26'dan sonra (bağımsızdır; mevcut fonksiyonları değiştirmez).
-- ---------------------------------------------------------------------------

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Za-z0-9_-]{2,32}$'),
  percent int not null check (percent between 1 and 90),
  valid_from timestamptz,
  valid_until timestamptz,
  pro_plans text[] not null default '{}' check (pro_plans <@ array['1m', '3m', '6m', '12m']::text[]),
  pro_gift boolean not null default false,
  ad_models text[] not null default '{}' check (ad_models <@ array['impressions', 'days']::text[]),
  max_uses int check (max_uses is null or max_uses > 0),
  max_uses_per_user int default 1 check (max_uses_per_user is null or max_uses_per_user > 0),
  active boolean not null default true,
  note text not null default '' check (char_length(note) <= 500),
  uses int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists coupons_code_key on public.coupons (upper(code));
alter table public.coupons enable row level security;
-- Politika yok: okuma/yazma sadece aşağıdaki security definer fonksiyonlarıyla

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  ref text not null unique,
  product text not null default '' check (product in ('', 'pro', 'gift', 'ad')),
  plan text not null default '',
  amount_before numeric not null default 0,
  amount_after numeric not null default 0,
  currency text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_user on public.coupon_redemptions (coupon_id, user_id);
alter table public.coupon_redemptions enable row level security;

-- Kupon durumu: active | scheduled (henüz başlamadı) | expired | inactive | exhausted
create or replace function public.coupon_state(c public.coupons) returns text
language sql stable set search_path = public as $$
  select case
    when not c.active then 'inactive'
    when c.valid_until is not null and c.valid_until <= now() then 'expired'
    when c.max_uses is not null and c.uses >= c.max_uses then 'exhausted'
    when c.valid_from is not null and c.valid_from > now() then 'scheduled'
    else 'active' end;
$$;

-- İndirimli tutar (sunucu ve istemci aynı kuralı kullanır: 2 haneye yuvarlanır)
create or replace function public.coupon_apply(p_price numeric, p_percent int) returns numeric
language sql immutable as $$
  select round(p_price * (100 - p_percent) / 100.0, 2);
$$;

-- Kodu doğrular; geçersizse Türkçe hata. p_product: pro | gift | ad. p_plan: PRO planı ya da reklam modeli
-- (boşsa o üründe en az bir paket için geçerli olması yeter). p_user: kişi başı sınır için (ödeyen).
create or replace function public.coupon_find(p_code text, p_user uuid, p_product text, p_plan text)
returns public.coupons language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons;
  n int;
  pl text := nullif(btrim(coalesce(p_plan, '')), '');
begin
  select * into c from public.coupons where upper(code) = upper(btrim(coalesce(p_code, '')));
  if c.id is null then
    raise exception 'Kupon bulunamadı';
  end if;
  if not c.active then
    raise exception 'Bu kupon artık geçerli değil';
  end if;
  if c.valid_until is not null and c.valid_until <= now() then
    raise exception 'Kuponun süresi dolmuş';
  end if;
  if c.valid_from is not null and c.valid_from > now() then
    raise exception 'Kupon henüz geçerli değil';
  end if;
  if p_product = 'pro' then
    if (pl is null and cardinality(c.pro_plans) = 0) or (pl is not null and not pl = any (c.pro_plans)) then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
  elsif p_product = 'gift' then
    if not c.pro_gift or (pl is null and cardinality(c.pro_plans) = 0) or (pl is not null and not pl = any (c.pro_plans)) then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
  elsif p_product = 'ad' then
    if (pl is null and cardinality(c.ad_models) = 0) or (pl is not null and not pl = any (c.ad_models)) then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
  else
    raise exception 'Kupon bu pakette geçersiz';
  end if;
  if c.max_uses is not null and (select count(*) from public.coupon_redemptions where coupon_id = c.id) >= c.max_uses then
    raise exception 'Kuponun kullanım limiti doldu';
  end if;
  if p_user is not null and c.max_uses_per_user is not null then
    select count(*) into n from public.coupon_redemptions where coupon_id = c.id and user_id = p_user;
    if n >= c.max_uses_per_user then
      raise exception 'Bu kuponu kullanım hakkın doldu';
    end if;
  end if;
  return c;
end $$;
revoke all on function public.coupon_find(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.coupon_find(text, uuid, text, text) to service_role;

-- Ödeme fonksiyonları (pro-checkout, ads-checkout) için: {id, code, percent}
create or replace function public.coupon_validate(p_code text, p_user uuid, p_product text, p_plan text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons := public.coupon_find(p_code, p_user, p_product, p_plan);
begin
  return jsonb_build_object('id', c.id, 'code', upper(c.code), 'percent', c.percent);
end $$;
revoke all on function public.coupon_validate(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.coupon_validate(text, uuid, text, text) to service_role;

-- Kullanıcı "Uygula": indirimi ve fiyatları döndürür (gösterim için; ödeme fonksiyonu yeniden doğrular).
-- PRO / hediye (p_product pro | gift): p_plan boşsa kuponun geçtiği tüm planlar
--   {"plans": {"12m": {"price": 499, "discounted": 474.05, "currency": "TRY"}, ...}}
-- Reklam (p_product ad): p_plan = model (impressions | days); p_placement + p_qty verilirse price / discounted.
create or replace function public.coupon_check(
  p_code text, p_product text, p_plan text default null, p_region text default 'intl',
  p_placement text default null, p_qty int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.coupons;
  pr jsonb;
  plans jsonb := '{}'::jsonb;
  k text;
  price numeric;
  cur text;
  q jsonb;
  res jsonb;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  c := public.coupon_find(p_code, me, p_product, p_plan);
  res := jsonb_build_object('id', c.id, 'code', upper(c.code), 'percent', c.percent,
    'pro_plans', to_jsonb(c.pro_plans), 'pro_gift', c.pro_gift, 'ad_models', to_jsonb(c.ad_models),
    'valid_until', c.valid_until);
  if p_product in ('pro', 'gift') then
    pr := coalesce((select pro_pricing from public.app_config where id = 1), '{}'::jsonb);
    foreach k in array c.pro_plans loop
      continue when nullif(p_plan, '') is not null and k <> p_plan;
      -- pro-checkout ile aynı kural: Türkiye fiyatı girildiyse Türkiye'dekilere o
      if p_region = 'tr' and coalesce((pr -> 'plans' -> k ->> 'price_tr')::numeric, 0) > 0 then
        price := (pr -> 'plans' -> k ->> 'price_tr')::numeric;
        cur := upper(coalesce(nullif(pr ->> 'currency_tr', ''), 'TRY'));
      else
        price := coalesce((pr -> 'plans' -> k ->> 'price')::numeric, 0);
        cur := upper(coalesce(nullif(pr ->> 'currency', ''), 'USD'));
      end if;
      continue when price <= 0;
      plans := plans || jsonb_build_object(k, jsonb_build_object('price', price, 'discounted', public.coupon_apply(price, c.percent), 'currency', cur));
    end loop;
    if plans = '{}'::jsonb then
      raise exception 'Kupon bu pakette geçersiz';
    end if;
    res := res || jsonb_build_object('plans', plans);
  elsif p_product = 'ad' and p_placement is not null and p_qty is not null and nullif(p_plan, '') is not null then
    q := public.ad_price(p_placement, p_plan, p_qty, coalesce(p_region, 'intl'));
    res := res || jsonb_build_object('price', (q ->> 'price')::numeric,
      'discounted', public.coupon_apply((q ->> 'price')::numeric, c.percent), 'currency', q ->> 'currency');
  end if;
  return res;
end $$;
revoke all on function public.coupon_check(text, text, text, text, text, int) from public, anon;
grant execute on function public.coupon_check(text, text, text, text, text, int) to authenticated, service_role;

-- Ödeme gelince (pro-webhook): kullanım kaydı. Aynı ref (abonelik / sipariş) bir kez sayılır.
create or replace function public.coupon_redeem(
  p_coupon uuid, p_user uuid, p_ref text, p_product text, p_plan text, p_before numeric, p_after numeric, p_currency text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := p_user;
  rid uuid;
begin
  if not exists (select 1 from public.coupons where id = p_coupon) then
    return false;
  end if;
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    uid := null;
  end if;
  insert into public.coupon_redemptions (coupon_id, user_id, ref, product, plan, amount_before, amount_after, currency)
    values (p_coupon, uid, p_ref, case when p_product in ('pro', 'gift', 'ad') then p_product else '' end,
            coalesce(p_plan, ''), coalesce(p_before, 0), coalesce(p_after, 0), upper(coalesce(p_currency, '')))
    on conflict (ref) do nothing
    returning id into rid;
  if rid is not null then
    update public.coupons set uses = (select count(*) from public.coupon_redemptions where coupon_id = p_coupon) where id = p_coupon;
  end if;
  return rid is not null;
end $$;
revoke all on function public.coupon_redeem(uuid, uuid, text, text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.coupon_redeem(uuid, uuid, text, text, text, numeric, numeric, text) to service_role;

-- Yönetici: tüm kuponlar, durum, kullanım ve verilen toplam indirim (para birimi başına)
create or replace function public.coupon_admin_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'state', public.coupon_state(c),
        'creator_name', coalesce((select display_name from public.profiles where id = c.created_by), ''),
        'discount', coalesce((
          select jsonb_object_agg(x.currency, x.total) from (
            select r.currency, round(sum(r.amount_before - r.amount_after), 2) as total
              from public.coupon_redemptions r where r.coupon_id = c.id group by r.currency) x), '{}'::jsonb))
      order by c.created_at desc)
    from public.coupons c), '[]'::jsonb);
end $$;
revoke all on function public.coupon_admin_list() from public, anon;
grant execute on function public.coupon_admin_list() to authenticated;

-- Yönetici: oluştur (p_id boş) ya da düzenle. Süresi dolmuş kupon tarihleri güncellenerek yeniden açılabilir.
create or replace function public.coupon_admin_save(
  p_id uuid, p_code text, p_percent int, p_valid_from timestamptz, p_valid_until timestamptz,
  p_pro_plans text[], p_pro_gift boolean, p_ad_models text[], p_max_uses int, p_max_per_user int,
  p_active boolean, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cd text := upper(btrim(coalesce(p_code, '')));
  old public.coupons;
  rid uuid;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if cd !~ '^[A-Z0-9_-]{2,32}$' then
    raise exception 'Kod 2-32 karakter olmalı (harf, rakam, - ve _)';
  end if;
  if p_percent is null or p_percent not between 1 and 90 then
    raise exception 'İndirim %%1 ile %%90 arasında olmalı';
  end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until <= p_valid_from then
    raise exception 'Bitiş zamanı başlangıçtan sonra olmalı';
  end if;
  if not coalesce(p_pro_plans, '{}') <@ array['1m', '3m', '6m', '12m']::text[]
     or not coalesce(p_ad_models, '{}') <@ array['impressions', 'days']::text[] then
    raise exception 'Geçersiz paket seçimi';
  end if;
  if cardinality(coalesce(p_pro_plans, '{}')) = 0 and cardinality(coalesce(p_ad_models, '{}')) = 0 then
    raise exception 'En az bir paket seç';
  end if;
  if exists (select 1 from public.coupons where upper(code) = cd and id is distinct from p_id) then
    raise exception 'Bu kod zaten var';
  end if;
  if p_id is null then
    insert into public.coupons (code, percent, valid_from, valid_until, pro_plans, pro_gift, ad_models, max_uses,
                                max_uses_per_user, active, note, created_by)
      values (cd, p_percent, p_valid_from, p_valid_until, coalesce(p_pro_plans, '{}'), coalesce(p_pro_gift, false),
              coalesce(p_ad_models, '{}'), nullif(p_max_uses, 0), nullif(p_max_per_user, 0), coalesce(p_active, true),
              left(btrim(coalesce(p_note, '')), 500), auth.uid())
      returning id into rid;
    perform public.log_mod('coupon_create', 'coupon', rid::text, null, jsonb_build_object('code', cd, 'percent', p_percent));
  else
    select * into old from public.coupons where id = p_id;
    if old.id is null then
      raise exception 'Kupon bulunamadı';
    end if;
    if upper(old.code) <> cd and old.uses > 0 then
      raise exception 'Kullanılmış kuponun kodu değiştirilemez';
    end if;
    update public.coupons set code = cd, percent = p_percent, valid_from = p_valid_from, valid_until = p_valid_until,
        pro_plans = coalesce(p_pro_plans, '{}'), pro_gift = coalesce(p_pro_gift, false), ad_models = coalesce(p_ad_models, '{}'),
        max_uses = nullif(p_max_uses, 0), max_uses_per_user = nullif(p_max_per_user, 0), active = coalesce(p_active, true),
        note = left(btrim(coalesce(p_note, '')), 500), updated_at = now()
      where id = p_id
      returning id into rid;
    perform public.log_mod('coupon_update', 'coupon', rid::text, null,
      jsonb_build_object('code', cd, 'percent', p_percent, 'old_code', old.code, 'old_percent', old.percent,
                         'valid_until', p_valid_until, 'active', coalesce(p_active, true)));
  end if;
  return rid;
end $$;
revoke all on function public.coupon_admin_save(uuid, text, int, timestamptz, timestamptz, text[], boolean, text[], int, int, boolean, text) from public, anon;
grant execute on function public.coupon_admin_save(uuid, text, int, timestamptz, timestamptz, text[], boolean, text[], int, int, boolean, text) to authenticated;

-- Yönetici: kapat / yeniden aç
create or replace function public.coupon_admin_set_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.coupons;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  update public.coupons set active = coalesce(p_active, false), updated_at = now() where id = p_id returning * into c;
  if c.id is null then
    raise exception 'Kupon bulunamadı';
  end if;
  perform public.log_mod(case when c.active then 'coupon_activate' else 'coupon_deactivate' end, 'coupon', c.id::text, null,
    jsonb_build_object('code', c.code));
end $$;
revoke all on function public.coupon_admin_set_active(uuid, boolean) from public, anon;
grant execute on function public.coupon_admin_set_active(uuid, boolean) to authenticated;

-- Yönetici: sil (sadece hiç kullanılmamışsa)
create or replace function public.coupon_admin_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.coupons;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into c from public.coupons where id = p_id;
  if c.id is null then
    raise exception 'Kupon bulunamadı';
  end if;
  if exists (select 1 from public.coupon_redemptions where coupon_id = p_id) then
    raise exception 'Kullanılmış kupon silinemez; kapatabilirsin';
  end if;
  delete from public.coupons where id = p_id;
  perform public.log_mod('coupon_delete', 'coupon', p_id::text, null, jsonb_build_object('code', c.code, 'percent', c.percent));
end $$;
revoke all on function public.coupon_admin_delete(uuid) from public, anon;
grant execute on function public.coupon_admin_delete(uuid) to authenticated;

-- Yönetici: bir kuponun kullanımları (en yeni önce, en fazla 500)
create or replace function public.coupon_admin_redemptions(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.created_at desc) from (
      select r.id, r.user_id, coalesce(p.display_name, '') as user_name, r.ref, r.product, r.plan,
             r.amount_before, r.amount_after, r.currency, r.created_at
        from public.coupon_redemptions r left join public.profiles p on p.id = r.user_id
        where r.coupon_id = p_id order by r.created_at desc limit 500) x), '[]'::jsonb);
end $$;
revoke all on function public.coupon_admin_redemptions(uuid) from public, anon;
grant execute on function public.coupon_admin_redemptions(uuid) to authenticated;
