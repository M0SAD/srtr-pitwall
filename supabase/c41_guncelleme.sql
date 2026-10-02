-- ---------------------------------------------------------------------------
-- c41: Yeni hesaplara 3 günlük deneme PRO (kötüye kullanım denetimiyle).
--      Program (ilk girişte, hesap + bilgisayar başına bir kez) ve site (hesap sayfası, tarayıcı başına bir kez)
--      trial_claim(p_device, p_web_fp, p_fp) çağırır. Sunucu kararı verir:
--        * Hesap yeni olmalı: 7 günden genç, daha önce hiç PRO süresi / aboneliği / ödemesi / hediyesi olmamış,
--          daha önce deneme talebi olmamış. Değilse sessizce reddedilir (reason: had_pro / not_new; uyarı yok).
--        * Kötüye kullanım (herhangi biri eşleşirse sessizce reddedilir, yöneticilere 'trial_abuse' bildirimi gider):
--            disposable_email  geçici e-posta servisi (yerleşik kısa liste)
--            same_device       aynı bilgisayar (device.rs karması) başka bir hesabın deneme talebinde ya da cihaz kaydında
--            same_browser      aynı tarayıcı kimliği (localStorage'daki rastgele kimlik) başka bir talepte
--            same_email        normalleştirilmiş e-posta (küçük harf; gmail/googlemail'de noktalar ve +ek, diğerlerinde +ek
--                              atılır) başka bir hesapta ya da talepte
--            same_ip           aynı IP son 60 günde başka bir yeni hesabın talebinde (eski üyelerin kayıtları IP'de sayılmaz:
--                              ortak ağ / mobil operatör IP'leri yüzünden haksız ret olmasın)
--            same_network      aynı /24 (IPv6'da /64) ağ son 7 günde ve aynı tarayıcı parmak izi (UA, ekran, saat dilimi, dil)
--        * Kabulde profiles.pro_until = greatest(now, pro_until) + trial_days, pro_source = 'trial'
--          (diğer PRO kaynaklarıyla aynı alan: entitlement / Rust hemen görür). Kullanıcıya uygulama içi
--          'trial_started' bildirimi (e-posta yok: friend_request_mail listesinde değil). 10 günlük bitiş uyarısı
--          atlanır (pro_warned_stage = 1), son gün uyarısı gider.
--        * İstemciye sadece {granted:true, until, days} ya da {granted:false} döner; ret nedeni asla dönmez.
--      Her deneme trial_claims tablosuna nedeniyle yazılır (yönetici listesi). Gizlilik: bilgisayar kimliği ham
--      MachineGuid değil, programdaki tuzlu SHA-256 karmasıdır; tarayıcı parmak izi de karmadır. IP ve normalleştirilmiş
--      e-posta kötüye kullanımı önlemek için tutulur; hesap silinse de kayıt kalır (aynı e-postayla yeniden deneme engeli).
--      app_config.trial_enabled (varsayılan açık) ve trial_days (varsayılan 3) Yönetim › Deneme PRO'dan değişir.
--      protect_profile(): son tanımın aynısı + 'pitwall.pro_grant' işlem bayrağı (sadece trial_claim içinde açılır;
--      PostgREST üzerinden kullanıcı set_config çağıramaz).
-- Yeni fonksiyonlar: trial_claim(text, text, text), admin_trial_claims(text), admin_trial_set(uuid, boolean)
-- Sıra: c40'tan sonra (bağımsız; pro_log, devices, subscriptions, payments tabloları hazır olmalı).
-- ---------------------------------------------------------------------------

alter table public.app_config add column if not exists trial_enabled boolean not null default true;
alter table public.app_config add column if not exists trial_days int not null default 3;

create table if not exists public.trial_claims (
  user_id uuid primary key,                 -- hesap silinse de kalır (FK yok)
  granted boolean not null default false,
  reason text not null default '',          -- granted | had_pro | not_new | disposable_email | same_device,...
  matched uuid[] not null default '{}',     -- eşleşen diğer hesaplar
  device_hash text,                         -- programın tuzlu SHA-256 bilgisayar karması (ham kimlik değil)
  web_fp text,                              -- tarayıcıdaki rastgele kimlik
  fp_hash text,                             -- tarayıcı parmak izi karması (UA, ekran, saat dilimi, dil)
  ip text,
  ip_prefix text,
  email_norm text,
  source text not null default '',          -- app | web
  until timestamptz,                        -- verilen deneme bitişi
  admin_action text not null default '',    -- granted | revoked (yönetici elle)
  admin_by uuid,
  admin_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trial_claims_device on public.trial_claims (device_hash) where device_hash is not null;
create index if not exists trial_claims_webfp on public.trial_claims (web_fp) where web_fp is not null;
create index if not exists trial_claims_email on public.trial_claims (email_norm) where email_norm is not null;
create index if not exists trial_claims_ip on public.trial_claims (ip, created_at) where ip is not null;
create index if not exists trial_claims_prefix on public.trial_claims (ip_prefix, created_at) where ip_prefix is not null;
create index if not exists trial_claims_created on public.trial_claims (created_at desc);
alter table public.trial_claims enable row level security;
-- (politika yok: sadece aşağıdaki security definer fonksiyonlar erişir)

-- Kullanıcı kendi PRO/yönetici alanlarını değiştiremez; yöneticiliği sadece sahip verir/alır.
-- c41: 'pitwall.pro_grant' = 'on' iken (sadece trial_claim açar) PRO alanları korunmaz.
create or replace function public.protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if not public.is_admin() and coalesce(current_setting('pitwall.pro_grant', true), '') <> 'on' then
      new.pro_until := old.pro_until;
      new.pro_source := old.pro_source;
    end if;
    if not public.is_owner() then
      new.is_admin := old.is_admin;
    end if;
    new.is_owner := old.is_owner;
  end if;
  -- Kimse kendi yöneticiliğini panelden kaldıramasın (kilitlenmeyi önler)
  if old.id = auth.uid() and old.is_admin and not new.is_admin then
    new.is_admin := true;
  end if;
  return new;
end $$;

-- E-posta normalleştirme: küçük harf; gmail/googlemail'de noktalar ve +ek atılır (alan gmail.com olur), diğerlerinde +ek atılır
create or replace function public.trial_email_norm(p_email text) returns text
language plpgsql immutable as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
  loc text;
  dom text;
begin
  if position('@' in e) = 0 then
    return nullif(e, '');
  end if;
  loc := split_part(e, '@', 1);
  dom := substr(e, length(loc) + 2);
  loc := split_part(loc, '+', 1);
  if dom in ('gmail.com', 'googlemail.com') then
    loc := replace(loc, '.', '');
    dom := 'gmail.com';
  end if;
  return loc || '@' || dom;
end $$;

-- Geçici e-posta servisleri (alt alan adları da sayılır)
create or replace function public.trial_disposable(p_domain text) returns boolean
language sql immutable as $$
  select exists (
    select 1 from unnest(array[
      'mailinator.com', '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net',
      'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'temp-mail.org', 'temp-mail.io',
      'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempr.email', 'yopmail.com', 'yopmail.net', 'yopmail.fr',
      'trashmail.com', 'trashmail.de', 'trashmail.net', 'getnada.com', 'nada.email', 'dispostable.com',
      'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com',
      'mailnesia.com', 'mytemp.email', 'moakt.com', 'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'burnermail.io',
      'spamgourmet.com', 'mailcatch.com', 'inboxkitten.com', 'emailfake.com', 'fakemail.net', 'getairmail.com',
      'discard.email', 'spambox.us', '33mail.com', 'mail.tm', 'mailpoof.com', 'linshiyouxiang.net', 'byom.de'
    ]) d
    where lower(coalesce(p_domain, '')) = d or lower(coalesce(p_domain, '')) like '%.' || d
  );
$$;

-- İsteğin IP'si (PostgREST başlıkları: x-forwarded-for'un ilk girdisi; yoksa cf-connecting-ip / x-real-ip)
create or replace function public.trial_client_ip() returns text
language plpgsql stable as $$
declare
  h json;
  v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then
    return null;
  end if;
  v := coalesce(nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), nullif(h ->> 'cf-connecting-ip', ''), nullif(h ->> 'x-real-ip', ''));
  begin
    return host(v::inet);
  exception when others then
    return null;
  end;
end $$;

-- Ağ öneki: IPv4 /24, IPv6 /64
create or replace function public.trial_ip_prefix(p_ip text) returns text
language plpgsql immutable as $$
declare
  a inet;
begin
  if p_ip is null then
    return null;
  end if;
  a := p_ip::inet;
  return network(set_masklen(a, case when family(a) = 4 then 24 else 64 end))::text;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Deneme PRO talebi (programda ilk girişte / sitede hesap sayfasında bir kez)
-- ---------------------------------------------------------------------------
create or replace function public.trial_claim(p_device text default null, p_web_fp text default null, p_fp text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  en boolean;
  days int;
  u_email text;
  u_created timestamptz;
  em text;
  dom text;
  v_ip text := public.trial_client_ip();
  v_pre text;
  dev text := nullif(left(trim(coalesce(p_device, '')), 64), '');
  wfp text := nullif(left(trim(coalesce(p_web_fp, '')), 64), '');
  fph text := nullif(left(trim(coalesce(p_fp, '')), 64), '');
  reasons text[] := '{}';
  m uuid[] := '{}';
  x uuid[];
  rsn text;
  nu timestamptz;
  nm text;
begin
  if uid is null then
    return jsonb_build_object('granted', false);
  end if;
  if length(dev) < 8 then dev := null; end if;
  if length(wfp) < 8 then wfp := null; end if;
  if length(fph) < 8 then fph := null; end if;
  select coalesce(c.trial_enabled, true), greatest(1, least(coalesce(c.trial_days, 3), 30)) into en, days
    from public.app_config c where c.id = 1;
  if not coalesce(en, true) then
    return jsonb_build_object('granted', false);
  end if;
  -- Aynı anda gelen talepler sırayla değerlendirilsin (aynı bilgisayardan iki hesap yarışmasın)
  perform pg_advisory_xact_lock(hashtext('pitwall.trial_claim'));
  if exists (select 1 from public.trial_claims where user_id = uid) then
    return jsonb_build_object('granted', false);
  end if;
  select u.email::text, u.created_at into u_email, u_created from auth.users u where u.id = uid;
  em := public.trial_email_norm(u_email);
  dom := split_part(coalesce(em, ''), '@', 2);
  v_pre := public.trial_ip_prefix(v_ip);

  -- 1) Uygunluk (kötüye kullanım değil; uyarı gitmez)
  if exists (select 1 from public.profiles p where p.id = uid and (p.is_admin or p.pro_until is not null))
     or exists (select 1 from public.subscriptions s where s.user_id = uid)
     or exists (select 1 from public.payments pa where pa.user_id = uid)
     or exists (select 1 from public.pro_log l where l.user_id = uid) then
    rsn := 'had_pro';
  elsif u_created is null or u_created < now() - interval '7 days' then
    rsn := 'not_new';
  else
    -- 2) Kötüye kullanım: hepsi denetlenir, eşleşen hesaplar toplanır
    if public.trial_disposable(dom) then
      reasons := array_append(reasons, 'disposable_email');
    end if;
    if dev is not null then
      select coalesce(array_agg(distinct z), '{}') into x from (
        select c.user_id z from public.trial_claims c where c.device_hash = dev and c.user_id <> uid
        union select d.user_id from public.devices d where d.device_hash = dev and d.user_id <> uid) q;
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_device'); m := m || x; end if;
    end if;
    if wfp is not null then
      select coalesce(array_agg(distinct c.user_id), '{}') into x from public.trial_claims c where c.web_fp = wfp and c.user_id <> uid;
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_browser'); m := m || x; end if;
    end if;
    if em is not null then
      select coalesce(array_agg(distinct z), '{}') into x from (
        select c.user_id z from public.trial_claims c where c.email_norm = em and c.user_id <> uid
        union select au.id from auth.users au
          where au.id <> uid and au.created_at <= u_created and public.trial_email_norm(au.email::text) = em) q;
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_email'); m := m || x; end if;
    end if;
    if v_ip is not null then
      select coalesce(array_agg(distinct c.user_id), '{}') into x from public.trial_claims c
        where c.ip = v_ip and c.user_id <> uid and c.created_at > now() - interval '60 days'
          and c.reason not in ('had_pro', 'not_new');
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_ip'); m := m || x; end if;
    end if;
    if v_pre is not null and fph is not null then
      select coalesce(array_agg(distinct c.user_id), '{}') into x from public.trial_claims c
        where c.ip_prefix = v_pre and c.fp_hash = fph and c.user_id <> uid and c.created_at > now() - interval '7 days'
          and c.reason not in ('had_pro', 'not_new');
      if cardinality(x) > 0 then reasons := array_append(reasons, 'same_network'); m := m || x; end if;
    end if;
    rsn := case when cardinality(reasons) > 0 then array_to_string(reasons, ',') else 'granted' end;
  end if;
  select coalesce(array_agg(distinct v), '{}') into m from unnest(m) v;

  insert into public.trial_claims (user_id, granted, reason, matched, device_hash, web_fp, fp_hash, ip, ip_prefix, email_norm, source)
    values (uid, rsn = 'granted', rsn, m, dev, wfp, fph, v_ip, v_pre, em, case when dev is not null then 'app' else 'web' end);

  if rsn = 'granted' then
    perform set_config('pitwall.pro_grant', 'on', true);
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => days),
          pro_source = 'trial'
      where id = uid returning pro_until into nu;
    perform set_config('pitwall.pro_grant', 'off', true);
    -- 10 günlük bitiş uyarısını atla (deneme zaten kısa); son gün uyarısı yine gider
    update public.profiles set pro_warned_until = nu, pro_warned_stage = 1 where id = uid;
    update public.pro_log set note = 'Deneme PRO'
      where id = (select max(id) from public.pro_log where user_id = uid);
    update public.trial_claims set until = nu where user_id = uid;
    insert into public.notifications (user_id, kind, data)
      values (uid, 'trial_started', jsonb_build_object('until', nu, 'days', days));
    return jsonb_build_object('granted', true, 'until', nu, 'days', days);
  end if;

  if rsn not in ('had_pro', 'not_new') then
    select display_name into nm from public.profiles where id = uid;
    insert into public.notifications (user_id, kind, data)
      select a.id, 'trial_abuse', jsonb_build_object(
        'user', uid, 'name', coalesce(nullif(nm, ''), '?'), 'reason', rsn,
        'matches', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name)), '[]'::jsonb)
                    from public.profiles p where p.id = any (m)))
      from public.profiles a where a.is_admin;
  end if;
  return jsonb_build_object('granted', false);
end $$;
revoke all on function public.trial_claim(text, text, text) from public, anon;
grant execute on function public.trial_claim(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Yönetici: deneme talepleri (p_filter: all | granted | denied | suspicious)
-- ---------------------------------------------------------------------------
create or replace function public.admin_trial_claims(p_filter text default 'all')
returns table (user_id uuid, display_name text, email text, account_created timestamptz, created_at timestamptz,
               granted boolean, reason text, matched jsonb, device_hash text, web_fp text, ip text, source text,
               until timestamptz, pro_until timestamptz, pro_source text, admin_action text, admin_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select c.user_id, p.display_name, u.email::text, u.created_at, c.created_at, c.granted, c.reason,
      (select coalesce(jsonb_agg(jsonb_build_object('id', v, 'name', coalesce(mp.display_name, '?'))), '[]'::jsonb)
         from unnest(c.matched) v left join public.profiles mp on mp.id = v),
      c.device_hash, c.web_fp, c.ip, c.source, c.until, p.pro_until, p.pro_source, c.admin_action, c.admin_at
    from public.trial_claims c
    left join public.profiles p on p.id = c.user_id
    left join auth.users u on u.id = c.user_id
    where p_filter = 'all'
       or (p_filter = 'granted' and c.granted)
       or (p_filter = 'denied' and not c.granted)
       or (p_filter = 'suspicious' and c.reason not in ('granted', 'had_pro', 'not_new', 'admin'))
    order by c.created_at desc
    limit 300;
end $$;

-- Yönetici: elle deneme PRO ver (p_grant = true) ya da geri al (false). Döner: yeni PRO bitişi.
-- Geri alma sadece PRO kaynağı hâlâ 'trial' ise PRO'yu kaldırır (sonradan satın alınan PRO'ya dokunmaz).
create or replace function public.admin_trial_set(p_user uuid, p_grant boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  days int;
  nu timestamptz;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  select greatest(1, least(coalesce(trial_days, 3), 30)) into days from public.app_config where id = 1;
  days := coalesce(days, 3);
  if p_grant then
    update public.profiles
      set pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => days), pro_source = 'trial'
      where id = p_user returning pro_until into nu;
    update public.profiles set pro_warned_until = nu, pro_warned_stage = 1 where id = p_user;
    update public.pro_log set note = 'Deneme PRO (yönetici)'
      where id = (select max(id) from public.pro_log where user_id = p_user);
    insert into public.trial_claims (user_id, granted, reason, until, admin_action, admin_by, admin_at)
      values (p_user, true, 'admin', nu, 'granted', auth.uid(), now())
      on conflict (user_id) do update set granted = true, until = nu, admin_action = 'granted', admin_by = auth.uid(), admin_at = now();
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'trial_started', jsonb_build_object('until', nu, 'days', days));
  else
    update public.profiles set pro_until = null, pro_source = null
      where id = p_user and pro_source = 'trial';
    if found then
      update public.pro_log set note = 'Deneme PRO geri alındı'
        where id = (select max(id) from public.pro_log where user_id = p_user);
    end if;
    select pro_until into nu from public.profiles where id = p_user;
    update public.trial_claims set granted = false, admin_action = 'revoked', admin_by = auth.uid(), admin_at = now()
      where user_id = p_user;
  end if;
  return nu;
end $$;

revoke all on function public.admin_trial_claims(text), public.admin_trial_set(uuid, boolean) from public, anon;
grant execute on function public.admin_trial_claims(text), public.admin_trial_set(uuid, boolean) to authenticated;
revoke all on function public.trial_client_ip() from public, anon, authenticated;
grant all on public.trial_claims to service_role;
