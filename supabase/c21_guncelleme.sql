-- ---------------------------------------------------------------------------
-- c21: PRO süresini elle düzenleme (+ isteğe bağlı bildirim/e-posta), 10 ve 1 gün kala PRO uyarısı,
--      destek talepleri, bölüm/overlay gizleme, herkese ücretsiz PRO kampanyası,
--      gelir ve ücretli / ücretsiz PRO üye listeleri
-- ---------------------------------------------------------------------------

-- Görünürlük ve kampanya ayarları
alter table public.app_config add column if not exists hidden_sections text[] not null default '{}';
alter table public.app_config add column if not exists hidden_overlays text[] not null default '{}';
alter table public.app_config add column if not exists promo_pro_until timestamptz;
alter table public.app_config add column if not exists promo_note text not null default '';

-- Herkese ücretsiz PRO kampanyası sürüyor mu? (sadece giriş yapmış hesaplar yararlanır)
create or replace function public.promo_active() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select promo_pro_until > now() from public.app_config where id = 1), false);
$$;
grant execute on function public.promo_active() to anon, authenticated;

-- PRO denetimi: yönetici, süresi devam eden PRO ya da (giriş yapmışsa) kampanya
create or replace function public.is_pro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or coalesce((select pro_until from public.profiles where id = auth.uid()) > now(), false)
      or (auth.uid() is not null and public.promo_active());
$$;
grant execute on function public.is_pro() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Yönetici: PRO süresini düzenle. p_mode:
--   add       p_days gün ekle (eksi değer kısaltır; süre bittiyse bugünden sayılır)
--   set       p_until tarihine ayarla
--   unlimited süresiz (2099)
--   remove    PRO'yu kaldır
-- p_notify: kullanıcıya uygulama içi bildirim + e-posta (kendi dilinde) gönder
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_pro(
  p_user uuid, p_mode text, p_days int default null, p_until timestamptz default null,
  p_note text default '', p_notify boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  ou timestamptz;
  nu timestamptz;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select pro_until into ou from public.profiles where id = p_user;
  if not found then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if p_mode = 'add' then
    if coalesce(p_days, 0) = 0 then
      raise exception 'Gün sayısı gerekli';
    end if;
    nu := (case when ou > now() then ou else now() end) + make_interval(days => p_days);
    if nu <= now() then
      nu := now();
    end if;
  elsif p_mode = 'set' then
    if p_until is null then
      raise exception 'Tarih gerekli';
    end if;
    nu := p_until;
  elsif p_mode = 'unlimited' then
    nu := '2099-12-31 00:00:00+00'::timestamptz;
  elsif p_mode = 'remove' then
    nu := null;
  else
    raise exception 'Geçersiz işlem';
  end if;
  update public.profiles
    set pro_until = nu, pro_source = case when nu is null then null else 'admin' end
    where id = p_user;
  if nu is distinct from ou then
    update public.pro_log set note = left(coalesce(p_note, ''), 200)
      where id = (select max(id) from public.pro_log where user_id = p_user);
  end if;
  if p_notify then
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'pro_changed', jsonb_build_object(
        'old_until', ou, 'new_until', nu, 'mode', p_mode,
        'days', case when p_mode = 'add' then p_days
                     when nu is not null and ou is not null then round(extract(epoch from (nu - greatest(ou, now()))) / 86400)::int
                     else null end,
        'note', left(coalesce(p_note, ''), 200)));
  end if;
  return nu;
end $$;
grant execute on function public.admin_change_pro(uuid, text, int, timestamptz, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- PRO bitiş uyarısı: 10 gün kala ve son 1 gün kala (her bitiş tarihi için bir kez).
-- pro_warned_until = uyarının ait olduğu bitiş tarihi, pro_warned_stage = 1 (10 gün) / 2 (1 gün).
-- Kendini yenileyen abonelikler ve yöneticiler atlanır.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists pro_warned_stage int not null default 0;

create or replace function public.pro_expiry_notify() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with cand as (
    select p.id, p.pro_until,
      case when p.pro_until <= now() + interval '1 day' then 2 else 1 end as want,
      -- eski (15 günlük) uyarıyı almış olanlar 1. aşamayı almış sayılır
      case when p.pro_warned_until is not distinct from p.pro_until then greatest(coalesce(p.pro_warned_stage, 0), 1) else 0 end as done
    from public.profiles p
    where p.pro_until > now() and p.pro_until <= now() + interval '10 days'
      and not p.is_admin
      and not public.sub_renewing(p.id)
  ), due as (
    select * from cand where done < want
  ), ins as (
    insert into public.notifications (user_id, kind, data)
    select id, 'pro_expiring', jsonb_build_object('until', pro_until, 'stage', case when want = 2 then 'd1' else 'd10' end)
    from due returning 1
  ), upd as (
    update public.profiles p set pro_warned_until = d.pro_until, pro_warned_stage = d.want
    from due d where p.id = d.id returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end $$;
revoke all on function public.pro_expiry_notify() from public, anon, authenticated;
-- Günde bir kez (06:05 UTC)
select cron.unschedule(jobid) from cron.job where jobname = 'pitwall-pro-expiry';
select cron.schedule('pitwall-pro-expiry', '5 6 * * *', $$ select public.pro_expiry_notify() $$);

-- ---------------------------------------------------------------------------
-- Destek talepleri
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'other' check (category in ('bug', 'payment', 'account', 'feature', 'overlay', 'other')),
  subject text not null check (char_length(subject) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  last_author text not null default 'user' check (last_author in ('user', 'staff')),
  user_seen_at timestamptz,
  staff_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_updated on public.support_tickets (updated_at desc);
alter table public.support_tickets enable row level security;
drop policy if exists "support tickets read" on public.support_tickets;
create policy "support tickets read" on public.support_tickets for select using (auth.uid() = user_id or public.is_admin());

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  images text[] not null default '{}',
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages (ticket_id, created_at);
alter table public.support_messages enable row level security;
drop policy if exists "support messages read" on public.support_messages;
create policy "support messages read" on public.support_messages for select using (
  public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

-- Görseller: özel "support" kovası, <kullanıcı id>/<talep>/<dosya>. Kullanıcı kendi klasörüne yükler;
-- yönetici hepsini, kullanıcı kendi taleplerindeki görselleri (yöneticinin eklediği dahil) okur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support', 'support', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.support_can_read(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or split_part(p_path, '/', 1) = auth.uid()::text
      or exists (select 1 from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
                 where t.user_id = auth.uid() and p_path = any (m.images));
$$;
grant execute on function public.support_can_read(text) to authenticated;

drop policy if exists "support own upload" on storage.objects;
create policy "support own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'support' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "support read" on storage.objects;
create policy "support read" on storage.objects for select to authenticated
  using (bucket_id = 'support' and public.support_can_read(name));
drop policy if exists "support delete" on storage.objects;
create policy "support delete" on storage.objects for delete to authenticated
  using (bucket_id = 'support' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Görsel yolları: en çok 4, hepsi yazanın kendi klasöründe
create or replace function public.support_check_images(p_images text[]) returns text[]
language plpgsql stable set search_path = public as $$
declare
  x text;
begin
  if coalesce(array_length(p_images, 1), 0) > 4 then
    raise exception 'En fazla 4 görsel eklenebilir';
  end if;
  foreach x in array coalesce(p_images, '{}') loop
    if split_part(x, '/', 1) <> auth.uid()::text or x like '%..%' then
      raise exception 'Geçersiz görsel';
    end if;
  end loop;
  return coalesce(p_images, '{}');
end $$;

-- Yöneticilere bildirim (aynı talep için okunmamış bildirim varsa yenisi eklenmez: e-posta yağmuru olmasın)
create or replace function public.support_notify_admins(p_ticket uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.support_tickets;
  nm text;
begin
  select * into t from public.support_tickets where id = p_ticket;
  select display_name into nm from public.profiles where id = t.user_id;
  insert into public.notifications (user_id, kind, data)
    select a.id, p_kind, jsonb_build_object('ticket', t.id, 'subject', t.subject, 'category', t.category, 'name', coalesce(nm, '?'), 'user', t.user_id)
    from public.profiles a
    where a.is_admin and a.id <> t.user_id
      and not exists (select 1 from public.notifications n where n.user_id = a.id and not n.read
                      and n.kind in ('support_new', 'support_user_reply') and n.data ->> 'ticket' = t.id::text);
end $$;
revoke all on function public.support_notify_admins(uuid, text) from public, anon, authenticated;

-- Kullanıcı: yeni talep (ilk mesajla)
create or replace function public.support_create(p_category text, p_subject text, p_body text, p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if (select count(*) from public.support_tickets where user_id = me and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Çok fazla talep açtın, biraz sonra tekrar dene';
  end if;
  if char_length(trim(coalesce(p_subject, ''))) = 0 or char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Başlık ve mesaj gerekli';
  end if;
  insert into public.support_tickets (user_id, category, subject, user_seen_at)
    values (me, case when p_category in ('bug', 'payment', 'account', 'feature', 'overlay', 'other') then p_category else 'other' end,
            left(trim(p_subject), 120), now())
    returning id into tid;
  insert into public.support_messages (ticket_id, author_id, body, images, is_staff)
    values (tid, me, left(trim(p_body), 4000), public.support_check_images(p_images), false);
  perform public.support_notify_admins(tid, 'support_new');
  return tid;
end $$;

-- Yanıt: talep sahibi yazarsa yöneticilere, yönetici yazarsa sahibine bildirim + e-posta
create or replace function public.support_reply(p_ticket uuid, p_body text, p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.support_tickets;
  staff boolean;
  mid uuid;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if not found or (t.user_id <> me and not public.is_admin()) then
    raise exception 'Talep bulunamadı';
  end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Mesaj boş olamaz';
  end if;
  staff := t.user_id <> me;
  if not staff and (select count(*) from public.support_messages where author_id = me and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Çok hızlı yazıyorsun';
  end if;
  insert into public.support_messages (ticket_id, author_id, body, images, is_staff)
    values (p_ticket, me, left(trim(p_body), 4000), public.support_check_images(p_images), staff)
    returning id into mid;
  update public.support_tickets set
    status = case when staff then 'answered' else 'open' end,
    last_author = case when staff then 'staff' else 'user' end,
    staff_seen_at = case when staff then now() else staff_seen_at end,
    user_seen_at = case when staff then user_seen_at else now() end,
    updated_at = now()
  where id = p_ticket;
  if staff then
    if not exists (select 1 from public.notifications n where n.user_id = t.user_id and not n.read
                   and n.kind = 'support_reply' and n.data ->> 'ticket' = t.id::text) then
      insert into public.notifications (user_id, kind, data)
        values (t.user_id, 'support_reply', jsonb_build_object('ticket', t.id, 'subject', t.subject, 'category', t.category,
                'name', (select display_name from public.profiles where id = me)));
    end if;
  else
    perform public.support_notify_admins(p_ticket, 'support_user_reply');
  end if;
  return mid;
end $$;

-- Kapat / yeniden aç (sahip ya da yönetici)
create or replace function public.support_set_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'Geçersiz durum';
  end if;
  update public.support_tickets set status = p_status, updated_at = now()
    where id = p_ticket and (user_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'Talep bulunamadı';
  end if;
end $$;

-- Talep okundu (sahipse kullanıcı, değilse yönetici tarafı)
create or replace function public.support_seen(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets set user_seen_at = now() where id = p_ticket and user_id = auth.uid();
  if not found and public.is_admin() then
    update public.support_tickets set staff_seen_at = now() where id = p_ticket;
  end if;
end $$;

-- Kullanıcı: kendi talepleri
create or replace function public.my_support_tickets()
returns table (id uuid, category text, subject text, status text, created_at timestamptz, updated_at timestamptz,
               unread boolean, messages int, last_body text)
language sql stable security definer set search_path = public as $$
  select t.id, t.category, t.subject, t.status, t.created_at, t.updated_at,
         t.last_author = 'staff' and (t.user_seen_at is null or t.user_seen_at < t.updated_at),
         (select count(*)::int from public.support_messages m where m.ticket_id = t.id),
         (select left(m.body, 160) from public.support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1)
  from public.support_tickets t
  where t.user_id = auth.uid()
  order by t.updated_at desc limit 100;
$$;

-- Talebin mesajları (sahip ya da yönetici)
create or replace function public.support_thread(p_ticket uuid)
returns table (id uuid, author_id uuid, author_name text, body text, images text[], is_staff boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets t where t.id = p_ticket and (t.user_id = auth.uid() or public.is_admin())) then
    raise exception 'Talep bulunamadı';
  end if;
  return query
    select m.id, m.author_id, coalesce(p.display_name, '?'), m.body, m.images, m.is_staff, m.created_at
    from public.support_messages m left join public.profiles p on p.id = m.author_id
    where m.ticket_id = p_ticket order by m.created_at;
end $$;

-- Yönetici: talepler (p_status: null/'' hepsi, 'open', 'answered', 'closed', 'unread')
create or replace function public.admin_support_tickets(p_status text default null, p_category text default null)
returns table (id uuid, user_id uuid, display_name text, email text, category text, subject text, status text,
               created_at timestamptz, updated_at timestamptz, unread boolean, messages int, last_body text, pro_until timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select t.id, t.user_id, p.display_name, u.email::text, t.category, t.subject, t.status, t.created_at, t.updated_at,
           t.last_author = 'user' and (t.staff_seen_at is null or t.staff_seen_at < t.updated_at),
           (select count(*)::int from public.support_messages m where m.ticket_id = t.id),
           (select left(m.body, 160) from public.support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1),
           p.pro_until
    from public.support_tickets t
    left join public.profiles p on p.id = t.user_id
    left join auth.users u on u.id = t.user_id
    where (coalesce(p_status, '') = ''
           or (p_status = 'unread' and t.last_author = 'user' and (t.staff_seen_at is null or t.staff_seen_at < t.updated_at))
           or t.status = p_status)
      and (coalesce(p_category, '') = '' or t.category = p_category)
    order by (t.status = 'open') desc, t.updated_at desc
    limit 300;
end $$;

grant select on public.support_tickets, public.support_messages to authenticated;
grant execute on function public.support_create(text, text, text, text[]), public.support_reply(uuid, text, text[]),
  public.support_set_status(uuid, text), public.support_seen(uuid), public.my_support_tickets(),
  public.support_thread(uuid), public.admin_support_tickets(text, text) to authenticated;
grant all on public.support_tickets, public.support_messages to service_role;

-- ---------------------------------------------------------------------------
-- Gelir ve PRO üyeleri: parayla PRO olanlar / ücretsiz PRO olanlar
-- ---------------------------------------------------------------------------
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
      and (p.pro_source in ('lemon', 'patreon', 'kofi')
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

-- p_kind: 'paid' (ödeme kaynağından PRO ya da ödemesi olan) | 'free' (yönetici / diğer, ödemesi yok)
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
        (p.pro_source in ('lemon', 'patreon', 'kofi')
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

-- ---------------------------------------------------------------------------
-- Bildirimden e-posta (pitwall-jobs): yeni türler eklendi
-- ---------------------------------------------------------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

