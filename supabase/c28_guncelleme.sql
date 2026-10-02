-- ---------------------------------------------------------------------------
-- c28: Destek ve yönetim araçları.
--      1) Moderatörler destek taleplerini görür: liste, yazışma, yanıt, kapat / yeniden aç (silemez).
--         is_moderator(): yönetici ya da "reports.view" izni olan (Moderatör grubu) üye.
--         support_tickets / support_messages okuma kuralları, "support" kovası okuma, support_reply,
--         support_set_status, support_seen, support_thread ve admin_support_tickets artık is_moderator() ile.
--         admin_support_tickets e-posta adresini sadece yöneticiye döndürür (moderatöre null).
--      2) admin_support_delete(talep): yönetici talebi tüm mesajları ve bildirimleriyle KALICI siler;
--         silinen görsellerin yollarını döner (başka talepte kullanılmayanlar). İstemci bunları Storage API ile
--         "support" kovasından siler (Supabase storage.objects'ten doğrudan silmeye izin vermiyor).
--      3) admin_messages(...): yönetici tüm üye-üye özel mesajlarını süzerek görür
--         (üye adı / iRacing adı, isteğe bağlı ikinci üye = ikili sohbet, tarih aralığı, metin; sayfalı).
--         İlk sayfa her açılışta mod_log'a 'messages_view' olarak yazılır.
--      4) admin_ad_delete(reklam): yönetici reklamı durumundan bağımsız KALICI siler (raporları ve sayaçlarıyla);
--         görsel yolunu döner (başka reklamda kullanılmıyorsa), istemci "ads" kovasından siler.
-- Sıra: sadece bu dosya (edge fonksiyonu değişmedi). Yeni bildirim türü yok.
-- ---------------------------------------------------------------------------

-- 1) Moderatör ------------------------------------------------------------------
-- Yönetici her izne sahip olduğundan has_perm yöneticiler için de true döner.
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.has_perm('reports.view');
$$;
revoke all on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated, service_role;

drop policy if exists "support tickets read" on public.support_tickets;
create policy "support tickets read" on public.support_tickets for select using (auth.uid() = user_id or public.is_moderator());
drop policy if exists "support messages read" on public.support_messages;
create policy "support messages read" on public.support_messages for select using (
  public.is_moderator() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));

create or replace function public.support_can_read(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_moderator()
      or split_part(p_path, '/', 1) = auth.uid()::text
      or exists (select 1 from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
                 where t.user_id = auth.uid() and p_path = any (m.images));
$$;
-- (Kova silme kuralı değişmedi: kendi klasörü ya da yönetici.)

-- Yanıt: talep sahibi, moderatör ya da yönetici
create or replace function public.support_reply(p_ticket uuid, p_body text, p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.support_tickets;
  staff boolean;
  mid uuid;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if not found or (t.user_id <> me and not public.is_moderator()) then
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

-- Kapat / yeniden aç (sahip, moderatör ya da yönetici)
create or replace function public.support_set_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'Geçersiz durum';
  end if;
  update public.support_tickets set status = p_status, updated_at = now()
    where id = p_ticket and (user_id = auth.uid() or public.is_moderator());
  if not found then
    raise exception 'Talep bulunamadı';
  end if;
end $$;

-- Talep okundu (sahipse kullanıcı, değilse ekip tarafı)
create or replace function public.support_seen(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets set user_seen_at = now() where id = p_ticket and user_id = auth.uid();
  if not found and public.is_moderator() then
    update public.support_tickets set staff_seen_at = now() where id = p_ticket;
  end if;
end $$;

-- Talebin mesajları (sahip, moderatör ya da yönetici)
create or replace function public.support_thread(p_ticket uuid)
returns table (id uuid, author_id uuid, author_name text, body text, images text[], is_staff boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.support_tickets t where t.id = p_ticket and (t.user_id = auth.uid() or public.is_moderator())) then
    raise exception 'Talep bulunamadı';
  end if;
  return query
    select m.id, m.author_id, coalesce(p.display_name, '?'), m.body, m.images, m.is_staff, m.created_at
    from public.support_messages m left join public.profiles p on p.id = m.author_id
    where m.ticket_id = p_ticket order by m.created_at;
end $$;

-- Ekip: talepler (p_status: null/'' hepsi, 'open', 'answered', 'closed', 'unread'). E-posta sadece yöneticiye.
create or replace function public.admin_support_tickets(p_status text default null, p_category text default null)
returns table (id uuid, user_id uuid, display_name text, email text, category text, subject text, status text,
               created_at timestamptz, updated_at timestamptz, unread boolean, messages int, last_body text, pro_until timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  adm boolean := public.is_admin();
begin
  if not public.is_moderator() then
    raise exception 'yetki yok';
  end if;
  return query
    select t.id, t.user_id, p.display_name, case when adm then u.email::text end, t.category, t.subject, t.status, t.created_at, t.updated_at,
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

-- 2) Talebi kalıcı sil (sadece yönetici) -----------------------------------------
create or replace function public.admin_support_delete(p_ticket uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  t public.support_tickets;
  imgs text[];
  n int;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Talep bulunamadı';
  end if;
  select coalesce(array_agg(distinct x), '{}'), count(distinct m.id)::int into imgs, n
    from public.support_messages m left join lateral unnest(m.images) x on true
    where m.ticket_id = p_ticket;
  imgs := array_remove(imgs, null);
  delete from public.support_tickets where id = p_ticket;  -- mesajlar cascade
  delete from public.notifications
    where kind in ('support_new', 'support_user_reply', 'support_reply') and data ->> 'ticket' = p_ticket::text;
  -- Başka bir talepte de geçen görsel silinmez
  select coalesce(array_agg(x), '{}') into imgs from unnest(imgs) x
    where not exists (select 1 from public.support_messages m where x = any (m.images));
  perform public.log_mod('support_delete', 'support', p_ticket::text, t.user_id,
    jsonb_build_object('subject', t.subject, 'category', t.category, 'messages', n, 'images', coalesce(array_length(imgs, 1), 0)));
  return imgs;
end $$;

-- 3) Tüm özel mesajlar (sadece yönetici) -----------------------------------------
-- p_user_query: üye adı / iRacing adı (parça) ya da tam kullanıcı kimliği; eşleşen üyelerin TÜM sohbetleri.
-- p_other_query: verilirse sadece bu iki taraf arasındaki mesajlar (ilki boşsa tek süzgeç gibi davranır).
-- p_text: mesaj metninde arama; p_from / p_to: tarih aralığı. Yeniden eskiye, total = süzgece uyan toplam.
create or replace function public.admin_match_users(p_q text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(trim(p_q), '') = '' then null
    when trim(p_q) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then array[trim(p_q)::uuid]
    else coalesce((select array_agg(p.id) from public.profiles p
                   where p.display_name ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or p.iracing_name ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
  end;
$$;
revoke all on function public.admin_match_users(text) from public, anon, authenticated;

create or replace function public.admin_messages(
  p_user_query text default null, p_other_query text default null, p_text text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit int default 100, p_offset int default 0)
returns table (id uuid, sender uuid, sender_name text, sender_iracing text, recipient uuid, recipient_name text, recipient_iracing text,
               body text, created_at timestamptz, read_at timestamptz,
               hidden_by_sender boolean, hidden_by_recipient boolean, reported boolean, total bigint)
language plpgsql security definer set search_path = public as $$
declare
  a uuid[];
  b uuid[];
  q text := nullif(trim(coalesce(p_text, '')), '');
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  a := public.admin_match_users(p_user_query);
  b := public.admin_match_users(p_other_query);
  if a is null then
    a := b;
    b := null;
  end if;
  p_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  if p_offset = 0 then
    perform public.log_mod('messages_view', 'message', '', case when coalesce(array_length(a, 1), 0) = 1 then a[1] end,
      jsonb_strip_nulls(jsonb_build_object('user', nullif(trim(coalesce(p_user_query, '')), ''), 'other', nullif(trim(coalesce(p_other_query, '')), ''),
                                           'text', q, 'from', p_from, 'to', p_to)));
  end if;
  return query
    select m.id, m.sender, coalesce(ps.display_name, '?'), ps.iracing_name, m.recipient, coalesce(pr.display_name, '?'), pr.iracing_name,
           m.body, m.created_at, m.read_at,
           exists (select 1 from public.message_hidden h where h.user_id = m.sender and h.message_id = m.id)
             or exists (select 1 from public.conversation_cleared c where c.user_id = m.sender and c.friend_id = m.recipient and m.created_at <= c.cleared_before),
           exists (select 1 from public.message_hidden h where h.user_id = m.recipient and h.message_id = m.id)
             or exists (select 1 from public.conversation_cleared c where c.user_id = m.recipient and c.friend_id = m.sender and m.created_at <= c.cleared_before),
           exists (select 1 from public.message_reports r where r.message_id = m.id),
           count(*) over ()
    from public.messages m
    left join public.profiles ps on ps.id = m.sender
    left join public.profiles pr on pr.id = m.recipient
    where (a is null or (b is null and (m.sender = any (a) or m.recipient = any (a)))
                     or (b is not null and ((m.sender = any (a) and m.recipient = any (b)) or (m.sender = any (b) and m.recipient = any (a)))))
      and (q is null or m.body ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      and (p_from is null or m.created_at >= p_from)
      and (p_to is null or m.created_at < p_to)
    order by m.created_at desc
    limit p_limit offset p_offset;
end $$;

-- 4) Reklamı kalıcı sil (sadece yönetici; yayındaki dahil) ---------------------------
create or replace function public.admin_ad_delete(p_ad uuid) returns text
language plpgsql security definer set search_path = public as $$
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
  delete from public.ad_campaigns where id = p_ad;  -- raporlar ve gösterim kayıtları cascade
  delete from public.notifications
    where kind in ('ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending') and data ->> 'ad' = p_ad::text
      and user_id <> a.user_id;  -- reklam verenin kendi bildirimleri (ödeme / yayın geçmişi) kalır
  perform public.log_mod('ad_force_delete', 'ad', p_ad::text, a.user_id,
    jsonb_build_object('title', a.title, 'status', a.status, 'reports', a.reports, 'paid', a.paid_amount, 'currency', a.currency));
  if exists (select 1 from public.ad_campaigns where image = a.image) then
    return null;
  end if;
  return a.image;
end $$;

-- Yetkiler -------------------------------------------------------------------
revoke all on function public.admin_support_delete(uuid),
  public.admin_messages(text, text, text, timestamptz, timestamptz, int, int),
  public.admin_ad_delete(uuid) from public, anon;
grant execute on function public.admin_support_delete(uuid),
  public.admin_messages(text, text, text, timestamptz, timestamptz, int, int),
  public.admin_ad_delete(uuid),
  public.support_reply(uuid, text, text[]), public.support_set_status(uuid, text), public.support_seen(uuid),
  public.support_thread(uuid), public.admin_support_tickets(text, text) to authenticated;
