-- ---------------------------------------------------------------------------
-- c22: Reklamlar (kendi kendine reklam verme). Reklam veren sitede (reklam.html) yer, fiyat modeli
--      (gösterim paketi ya da gün) ve görsel seçer, Lemon Squeezy ile öder; ödeme gelince reklam
--      kendiliğinden yayına girer (ya da yönetici onayına düşer). PRO üyelere ve oyun içi overlay'lere
--      reklam gösterilmez. Kullanıcılar reklamı sağ tıkla raporlar; rapor sınırı aşılınca reklam gizlenir.
-- ---------------------------------------------------------------------------

-- Ayarlar (yönetim panelinden)
alter table public.app_config add column if not exists ads_enabled boolean not null default false;
alter table public.app_config add column if not exists ad_auto_approve boolean not null default true;
alter table public.app_config add column if not exists ad_report_hide_threshold int not null default 3;
alter table public.app_config add column if not exists ad_pricing jsonb not null default
  '{"currency":"USD","impressions":[1000,5000,10000,50000],"days":[1,3,7,14,30],
    "placements":{"panel_banner":{"on":true,"cpm":4,"day":3},"panel_card":{"on":true,"cpm":3,"day":2},
                  "site_home":{"on":true,"cpm":5,"day":4},"site_account":{"on":true,"cpm":3,"day":2}}}'::jsonb;

-- Reklam kampanyaları
--   status: unpaid (ödeme bekliyor) | pending_review (ödendi, onay bekliyor) | active (yayında)
--           | paused (yönetici durdurdu) | paused_reports (raporlarla gizlendi) | ended (bitti)
--           | rejected (reddedildi) | refunded (iade edildi)
--   model:  impressions (quantity = satın alınan gösterim) | days (quantity = gün)
create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  placement text not null check (placement in ('panel_banner', 'panel_card', 'site_home', 'site_account')),
  model text not null check (model in ('impressions', 'days')),
  quantity int not null check (quantity > 0),
  title text not null check (char_length(title) between 1 and 60),
  body text not null default '' check (char_length(body) <= 120),
  url text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  image text not null check (char_length(image) between 3 and 300),
  langs text[] not null default '{}',
  status text not null default 'unpaid'
    check (status in ('unpaid', 'pending_review', 'active', 'paused', 'paused_reports', 'ended', 'rejected', 'refunded')),
  price numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  paid_amount numeric(12, 2),
  paid_at timestamptz,
  order_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  impressions int not null default 0,
  clicks int not null default 0,
  reports int not null default 0,
  report_base int not null default 0,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_campaigns_live on public.ad_campaigns (placement) where status = 'active';
create index if not exists ad_campaigns_user on public.ad_campaigns (user_id, created_at desc);
create index if not exists ad_campaigns_status on public.ad_campaigns (status, created_at desc);
alter table public.ad_campaigns enable row level security;
drop policy if exists "ads own read" on public.ad_campaigns;
create policy "ads own read" on public.ad_campaigns for select using (auth.uid() = user_id or public.is_admin());

-- Raporlar (her üye bir reklamı bir kez raporlar; raporlayan o reklamı bir daha görmez)
create table if not exists public.ad_reports (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ad_campaigns (id) on delete cascade,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('inappropriate', 'misleading', 'spam', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (ad_id, reporter)
);
create index if not exists ad_reports_reporter on public.ad_reports (reporter);
alter table public.ad_reports enable row level security;
drop policy if exists "ad reports read" on public.ad_reports;
create policy "ad reports read" on public.ad_reports for select using (auth.uid() = reporter or public.is_admin());

-- Gösterim / tıklama sınırı: aynı izleyici aynı reklamı 30 dakikada bir kez sayar (kısa ömürlü, kişisel veri yok)
create table if not exists public.ad_views (
  ad_id uuid not null references public.ad_campaigns (id) on delete cascade,
  viewer text not null,
  kind text not null default 'view',
  at timestamptz not null default now(),
  primary key (ad_id, viewer, kind)
);
create index if not exists ad_views_at on public.ad_views (at);
alter table public.ad_views enable row level security;

-- Görseller: herkese açık "ads" kovası, <kullanıcı id>/<dosya>. Üye sadece kendi klasörüne yükler.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ads', 'ads', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "ads own upload" on storage.objects;
create policy "ads own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "ads read" on storage.objects;
create policy "ads read" on storage.objects for select using (bucket_id = 'ads');
drop policy if exists "ads delete" on storage.objects;
create policy "ads delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Fiyat: yönetim panelindeki ad_pricing'den hesaplanır (istemciye güvenilmez)
create or replace function public.ad_price(p_placement text, p_model text, p_qty int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pr jsonb := coalesce((select ad_pricing from public.app_config where id = 1), '{}'::jsonb);
  pl jsonb := pr -> 'placements' -> p_placement;
  amount numeric;
begin
  if pl is null or coalesce((pl ->> 'on')::boolean, true) = false then
    raise exception 'Bu reklam yeri şu an satışta değil';
  end if;
  if p_model = 'impressions' then
    if not coalesce(pr -> 'impressions', '[1000,5000,10000,50000]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz gösterim paketi';
    end if;
    amount := coalesce((pl ->> 'cpm')::numeric, 0) * p_qty / 1000.0;
  elsif p_model = 'days' then
    if not coalesce(pr -> 'days', '[1,3,7,14,30]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz süre';
    end if;
    amount := coalesce((pl ->> 'day')::numeric, 0) * p_qty;
  else
    raise exception 'Geçersiz fiyat modeli';
  end if;
  amount := round(amount, 2);
  if amount <= 0 then
    raise exception 'Bu seçenek için fiyat belirlenmemiş';
  end if;
  return jsonb_build_object('price', amount, 'currency', upper(coalesce(nullif(pr ->> 'currency', ''), 'USD')));
end $$;

-- Reklam verene bildirim (uygulama içi + e-posta: ad_live, ad_rejected, ad_ended)
create or replace function public.ad_notify(p_ad uuid, p_kind text, p_extra jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, data)
    select a.user_id, p_kind,
      jsonb_build_object('ad', a.id, 'title', a.title, 'placement', a.placement, 'model', a.model, 'quantity', a.quantity,
                         'impressions', a.impressions, 'clicks', a.clicks, 'ends_at', a.ends_at) || coalesce(p_extra, '{}')
    from public.ad_campaigns a where a.id = p_ad;
end $$;

-- Yöneticilere bildirim (aynı reklam için okunmamış aynı tür bildirim varsa yenisi eklenmez)
create or replace function public.ad_notify_admins(p_ad uuid, p_kind text, p_extra jsonb default '{}', p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, data)
    select p.id, p_kind,
      jsonb_build_object('ad', a.id, 'title', a.title, 'placement', a.placement, 'reports', a.reports,
                         'name', coalesce((select display_name from public.profiles where id = a.user_id), '?')) || coalesce(p_extra, '{}')
    from public.ad_campaigns a cross join public.profiles p
    where a.id = p_ad and p.is_admin
      and (p_force or not exists (select 1 from public.notifications n where n.user_id = p.id and not n.read
                                  and n.kind = p_kind and n.data ->> 'ad' = a.id::text));
end $$;

-- Yayına al (süreli reklamlarda süre şimdi başlar)
create or replace function public.ad_start(p_ad uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ad_campaigns
    set status = 'active', starts_at = coalesce(starts_at, now()), paused_at = null, ended_at = null,
        ends_at = case when model = 'days' then now() + make_interval(days => quantity) else null end,
        updated_at = now()
    where id = p_ad;
  perform public.ad_notify(p_ad, 'ad_live');
end $$;

-- Bitir (gösterimler doldu ya da süre bitti)
create or replace function public.ad_finish(p_ad uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ad_campaigns set status = 'ended', ended_at = now(), updated_at = now()
    where id = p_ad and status = 'active';
  if found then
    perform public.ad_notify(p_ad, 'ad_ended');
  end if;
end $$;

-- Reklam veren: yeni reklam oluştur ya da ödenmemiş reklamını düzenle (fiyat sunucuda hesaplanır)
create or replace function public.ad_save(
  p_id uuid, p_placement text, p_model text, p_quantity int, p_title text, p_body text, p_url text, p_image text,
  p_langs text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q jsonb;
  rid uuid;
  lg text[] := coalesce(p_langs, '{}');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    raise exception 'Reklam alımı şu an kapalı';
  end if;
  p_title := btrim(coalesce(p_title, ''));
  p_body := btrim(coalesce(p_body, ''));
  p_url := btrim(coalesce(p_url, ''));
  if char_length(p_title) not between 1 and 60 then
    raise exception 'Başlık 1-60 karakter olmalı';
  end if;
  if char_length(p_body) > 120 then
    raise exception 'Kısa metin en fazla 120 karakter olabilir';
  end if;
  if p_url !~ '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/[^\s]*)?$' or char_length(p_url) > 500 then
    raise exception 'Bağlantı https:// ile başlayan geçerli bir adres olmalı';
  end if;
  if split_part(coalesce(p_image, ''), '/', 1) <> me::text or p_image like '%..%' or char_length(p_image) > 300 then
    raise exception 'Geçersiz görsel';
  end if;
  if not lg <@ array['tr', 'other']::text[] then
    raise exception 'Geçersiz dil seçimi';
  end if;
  if cardinality(lg) = 2 then
    lg := '{}';
  end if;
  q := public.ad_price(p_placement, p_model, p_quantity);
  if p_id is null then
    if (select count(*) from public.ad_campaigns where user_id = me and status = 'unpaid') >= 10 then
      raise exception 'Ödenmemiş en fazla 10 reklamın olabilir; önce birini sil ya da öde';
    end if;
    insert into public.ad_campaigns (user_id, placement, model, quantity, title, body, url, image, langs, price, currency)
      values (me, p_placement, p_model, p_quantity, p_title, p_body, p_url, p_image, lg,
              (q ->> 'price')::numeric, q ->> 'currency')
      returning id into rid;
  else
    update public.ad_campaigns
      set placement = p_placement, model = p_model, quantity = p_quantity, title = p_title, body = p_body, url = p_url,
          image = p_image, langs = lg, price = (q ->> 'price')::numeric, currency = q ->> 'currency', updated_at = now()
      where id = p_id and user_id = me and status = 'unpaid'
      returning id into rid;
    if rid is null then
      raise exception 'Bu reklam artık düzenlenemez';
    end if;
  end if;
  return rid;
end $$;

-- Reklam veren: ödenmemiş reklamı sil (görsel yolunu döndürür, istemci dosyayı da siler)
create or replace function public.ad_delete(p_ad uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  img text;
begin
  delete from public.ad_campaigns where id = p_ad and user_id = auth.uid() and status = 'unpaid' returning image into img;
  if img is null then
    raise exception 'Sadece ödenmemiş reklamlar silinebilir';
  end if;
  return img;
end $$;

-- Gösterilecek reklam: yerdeki yayındaki reklamlardan ağırlıklı rastgele biri.
-- PRO üyeye, reklamlar kapalıyken ve izleyicinin raporladığı reklamlarda boş döner.
-- p_lang: izleyicinin dili ('tr' dışındaki her dil 'other' hedefine düşer)
create or replace function public.ad_pick(p_placement text, p_lang text default '', p_visitor text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp text := case when lower(coalesce(p_lang, '')) like 'tr%' then 'tr' else 'other' end;
  r jsonb;
begin
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    return null;
  end if;
  if me is not null and public.is_pro() then
    return null;
  end if;
  select jsonb_build_object('id', a.id, 'placement', a.placement, 'title', a.title, 'body', a.body, 'url', a.url, 'image', a.image)
    into r
    from public.ad_campaigns a
    where a.status = 'active' and a.placement = p_placement
      and (cardinality(a.langs) = 0 or grp = any (a.langs))
      and (a.model <> 'days' or a.ends_at > now())
      and (a.model <> 'impressions' or a.impressions < a.quantity)
      and (me is null or not exists (select 1 from public.ad_reports x where x.ad_id = a.id and x.reporter = me))
    order by -ln(greatest(random(), 1e-9)) /
      (case when a.model = 'impressions' then least(5, greatest(1, (a.quantity - a.impressions) / 2000.0)) else 2 end)
    limit 1;
  return r;
end $$;

-- 30 dakikada bir sayma: izleyici = hesap ya da tarayıcı/uygulama kimliği. Sayıldıysa true.
create or replace function public.ad_seen(p_ad uuid, p_visitor text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(auth.uid()::text, nullif('v:' || left(regexp_replace(coalesce(p_visitor, ''), '[^a-zA-Z0-9-]', '', 'g'), 64), 'v:'));
  n int;
begin
  if who is null then
    return false;
  end if;
  insert into public.ad_views (ad_id, viewer, kind, at) values (p_ad, who, p_kind, now())
    on conflict (ad_id, viewer, kind) do update set at = now() where public.ad_views.at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.ad_seen(uuid, text, text) from public, anon, authenticated;

-- Gösterim: reklam ekranda göründüğünde (gösterim paketi dolunca reklam biter)
create or replace function public.ad_impression(p_ad uuid, p_visitor text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  if auth.uid() is not null and public.is_pro() then
    return;
  end if;
  if not exists (select 1 from public.ad_campaigns where id = p_ad and status = 'active') then
    return;
  end if;
  if not public.ad_seen(p_ad, p_visitor, 'view') then
    return;
  end if;
  update public.ad_campaigns set impressions = impressions + 1 where id = p_ad and status = 'active' returning * into a;
  if a.id is not null and a.model = 'impressions' and a.impressions >= a.quantity then
    perform public.ad_finish(a.id);
  end if;
end $$;

-- Tıklama: hedef adresi döndürür (30 dakikada bir sayılır)
create or replace function public.ad_click(p_ad uuid, p_visitor text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  u text;
begin
  select url into u from public.ad_campaigns where id = p_ad and status = 'active';
  if u is null then
    return null;
  end if;
  if public.ad_seen(p_ad, p_visitor, 'click') then
    update public.ad_campaigns set clicks = clicks + 1 where id = p_ad;
  end if;
  return u;
end $$;

-- Rapor: sınır aşılınca reklam gizlenir (paused_reports), yöneticilere bildirim + e-posta
create or replace function public.ad_report(p_ad uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  thr int := greatest(1, coalesce((select ad_report_hide_threshold from public.app_config where id = 1), 3));
  a public.ad_campaigns;
  n int;
  hidden boolean := false;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('inappropriate', 'misleading', 'spam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  if (select count(*) from public.ad_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  if not exists (select 1 from public.ad_campaigns where id = p_ad) then
    raise exception 'Reklam bulunamadı';
  end if;
  insert into public.ad_reports (ad_id, reporter, reason, note)
    values (p_ad, me, p_reason, left(coalesce(p_note, ''), 500))
    on conflict (ad_id, reporter) do nothing;
  if not found then
    raise exception 'Bu reklamı zaten raporladın';
  end if;
  select count(*) into n from public.ad_reports where ad_id = p_ad;
  update public.ad_campaigns set reports = n, updated_at = now() where id = p_ad returning * into a;
  if a.status = 'active' and n - a.report_base >= thr then
    update public.ad_campaigns set status = 'paused_reports', paused_at = now() where id = p_ad;
    hidden := true;
    perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'reports'));
  end if;
  perform public.ad_notify_admins(p_ad, 'ad_reported', jsonb_build_object('hidden', hidden, 'reason', p_reason, 'reports', n), hidden);
  return jsonb_build_object('reports', n, 'hidden', hidden);
end $$;

-- Ödeme geldi (sadece pro-webhook çağırır): otomatik onay açıksa yayına al, değilse onaya düşür
create or replace function public.ad_paid(p_ad uuid, p_user uuid, p_order text, p_amount numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
  auto boolean := coalesce((select ad_auto_approve from public.app_config where id = 1), true);
begin
  select * into a from public.ad_campaigns where id = p_ad for update;
  if a.id is null then
    raise exception 'reklam yok: %', p_ad;
  end if;
  if p_user is not null and p_user <> a.user_id then
    raise exception 'reklam başka hesaba ait';
  end if;
  if a.status <> 'unpaid' then
    return jsonb_build_object('status', a.status, 'already', true, 'placement', a.placement, 'user_id', a.user_id);
  end if;
  update public.ad_campaigns
    set paid_at = now(), order_id = p_order, paid_amount = p_amount, currency = upper(coalesce(nullif(p_currency, ''), currency)),
        status = 'pending_review', updated_at = now()
    where id = p_ad;
  if auto then
    perform public.ad_start(p_ad);
  else
    perform public.ad_notify_admins(p_ad, 'ad_pending');
  end if;
  return jsonb_build_object('status', case when auto then 'active' else 'pending_review' end,
                            'placement', a.placement, 'user_id', a.user_id, 'title', a.title);
end $$;

-- İade (sadece pro-webhook çağırır): reklam durur
create or replace function public.ad_refunded(p_ad uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
begin
  update public.ad_campaigns set status = 'refunded', ended_at = coalesce(ended_at, now()), updated_at = now()
    where id = p_ad returning * into a;
  return jsonb_build_object('placement', a.placement, 'user_id', a.user_id);
end $$;

-- Süresi dolanları bitir, sayaç tablosunu temizle (10 dakikada bir)
create or replace function public.ad_housekeeping() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.ad_campaigns
           where status = 'active' and ((model = 'days' and ends_at <= now()) or (model = 'impressions' and impressions >= quantity)) loop
    perform public.ad_finish(r.id);
    n := n + 1;
  end loop;
  delete from public.ad_views where at < now() - interval '1 hour';
  return n;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-ads';
select cron.schedule('pitwall-ads', '*/10 * * * *', $$ select public.ad_housekeeping() $$);

-- Yönetici: reklam listesi (p_status: null/'' hepsi ya da bir durum)
create or replace function public.admin_ads(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select a.*, p.display_name as owner_name, u.email::text as owner_email
      from public.ad_campaigns a
      left join public.profiles p on p.id = a.user_id
      left join auth.users u on u.id = a.user_id
      where coalesce(p_status, '') = '' or a.status = p_status
      order by a.created_at desc
      limit 500
    ) x), '[]'::jsonb);
end $$;

-- Yönetici: bir reklamın raporları
create or replace function public.admin_ad_reports(p_ad uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
                                        'reporter', r.reporter, 'reporter_name', p.display_name) order by r.created_at desc)
    from public.ad_reports r left join public.profiles p on p.id = r.reporter
    where r.ad_id = p_ad), '[]'::jsonb);
end $$;

-- Yönetici işlemleri: approve | reject | pause | resume | extend | end | delete
--   extend: süreli reklama p_amount gün, gösterimli reklama p_amount gösterim ekler
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
    if a.status <> 'active' then
      raise exception 'Sadece yayındaki reklam durdurulabilir';
    end if;
    update public.ad_campaigns set status = 'paused', paused_at = now(), review_note = p_note, updated_at = now() where id = p_ad;
    perform public.ad_notify(p_ad, 'ad_rejected', jsonb_build_object('mode', 'paused', 'note', p_note));
  elsif p_action = 'resume' then
    if a.status not in ('paused', 'paused_reports') then
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
    if a.status not in ('active', 'paused', 'paused_reports', 'pending_review') then
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

revoke all on function public.ad_notify(uuid, text, jsonb), public.ad_notify_admins(uuid, text, jsonb, boolean),
  public.ad_start(uuid), public.ad_finish(uuid), public.ad_paid(uuid, uuid, text, numeric, text), public.ad_refunded(uuid),
  public.ad_housekeeping() from public, anon, authenticated;
grant execute on function public.ad_price(text, text, int), public.ad_pick(text, text, text),
  public.ad_impression(uuid, text), public.ad_click(uuid, text) to anon, authenticated;
grant execute on function public.ad_save(uuid, text, text, int, text, text, text, text, text[]), public.ad_delete(uuid),
  public.ad_report(uuid, text, text), public.admin_ads(text), public.admin_ad_reports(uuid),
  public.admin_ad_set(uuid, text, text, int) to authenticated;
grant execute on function public.ad_paid(uuid, uuid, text, numeric, text), public.ad_refunded(uuid) to service_role;
grant select on public.ad_campaigns, public.ad_reports to authenticated;
grant all on public.ad_campaigns, public.ad_reports, public.ad_views to service_role;

-- ---------------------------------------------------------------------------
-- Bildirimden e-posta (pitwall-jobs): reklam türleri eklendi
-- ---------------------------------------------------------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

