-- ---------------------------------------------------------------------------
-- c27: Arkadaşlar: kendi görünümünden mesaj/sohbet silme, mesaj raporlama, PRO kuralları.
--      1) Mesaj gizleme (sadece kendi görünümün; karşı taraf görmeye devam eder):
--         - message_hidden (user_id, message_id): tek mesaj "Benden sil" → hide_message(id)
--         - conversation_cleared (user_id, friend_id, cleared_before): "Sohbeti temizle" → clear_conversation(friend)
--         messages okuma kuralı ("messages own") artık çağıranın gizlediği / temizlediği mesajları döndürmez
--         (REST ve Realtime ikisi de). Gizlenen / temizlenen gelen mesajlar okundu sayılır.
--      2) Mesaj raporlama: message_reports (raporlayan, mesaj, raporlanan, sebep, not, mesaj metninin kopyası).
--         message_report(id, sebep, not): sadece SANA gelen mesaj, mesaj başına bir kez, günde en fazla 20 rapor.
--         Tüm yöneticilere 'message_reported' bildirimi + e-posta (pitwall-jobs → messageReportAdmin).
--         Yönetici: admin_message_reports(durum) ve admin_message_report_set(id, işlem):
--           dismiss (yoksay) | resolve (çözüldü) | reopen (yeniden aç) | delete_message (mesajı iki taraftan da sil)
--      3) PRO kuralları:
--         - Mesaj göndermek artık herkese açık (send_message PRO denetimi kaldırıldı; hız sınırı aynı).
--         - Veri paylaşımı PRO: A'nın canlı verisini B ancak A PRO ise ve A, B'yi güvenilir işaretlediyse görür.
--           user_is_pro(uid) yardımcı fonksiyonu; live_data okuma kuralı (live_visible) paylaşanın PRO olmasını ister,
--           live_data'ya yazmak (yükleme) PRO ister. my_friends().trusts_me paylaşan PRO değilse false döner.
--           PRO olmayan üye, onu güvenilir seçen PRO arkadaşının verisini görebilir.
--           Düzeltme: eski okuma kuralındaki alt sorgu, friendships RLS'i yüzünden karşı tarafın "güvenilir" satırını
--           göremiyordu (arkadaşın verisi hiç okunamıyordu); denetim artık security definer live_visible() ile.
-- Sıra: önce bu dosya, sonra pitwall-jobs fonksiyonu.
-- ---------------------------------------------------------------------------

-- 3a) Bir kullanıcının PRO olup olmadığı (is_pro() ile aynı kural, oturumdaki kullanıcı yerine verilen kişi)
create or replace function public.user_is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from public.profiles p
    where p.id = p_user
      and (p.is_admin or coalesce(p.pro_until > now(), false) or public.promo_active())
  );
$$;
revoke all on function public.user_is_pro(uuid) from public, anon;
grant execute on function public.user_is_pro(uuid) to authenticated, service_role;

-- 1) Mesaj gizleme ------------------------------------------------------------
create table if not exists public.message_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists message_hidden_message on public.message_hidden (message_id);
alter table public.message_hidden enable row level security;
drop policy if exists "own hidden messages" on public.message_hidden;
create policy "own hidden messages" on public.message_hidden for select using (auth.uid() = user_id);

create table if not exists public.conversation_cleared (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  cleared_before timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.conversation_cleared enable row level security;
drop policy if exists "own cleared conversations" on public.conversation_cleared;
create policy "own cleared conversations" on public.conversation_cleared for select using (auth.uid() = user_id);

-- Oturumdaki kullanıcı bu mesajı kendi görünümünden kaldırdı mı (tek tek ya da sohbeti temizleyerek)
create or replace function public.message_hidden_for(p_id uuid, p_sender uuid, p_recipient uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.message_hidden h where h.user_id = auth.uid() and h.message_id = p_id)
      or exists (select 1 from public.conversation_cleared c
                 where c.user_id = auth.uid()
                   and c.friend_id = case when p_sender = auth.uid() then p_recipient else p_sender end
                   and p_at <= c.cleared_before);
$$;
revoke all on function public.message_hidden_for(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.message_hidden_for(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

drop policy if exists "messages own" on public.messages;
create policy "messages own" on public.messages for select using (
  (auth.uid() = sender or auth.uid() = recipient)
  and not public.message_hidden_for(id, sender, recipient, created_at)
);

create or replace function public.hide_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.messages;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into m from public.messages where id = p_id;
  if m.id is null or (m.sender <> me and m.recipient <> me) then
    raise exception 'Mesaj bulunamadı';
  end if;
  insert into public.message_hidden (user_id, message_id) values (me, p_id) on conflict do nothing;
  if m.recipient = me and m.read_at is null then
    update public.messages set read_at = now() where id = p_id;
  end if;
end $$;

create or replace function public.clear_conversation(p_friend uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_at timestamptz := now();
begin
  if me is null or p_friend is null or p_friend = me then
    raise exception 'Geçersiz kullanıcı';
  end if;
  insert into public.conversation_cleared (user_id, friend_id, cleared_before) values (me, p_friend, v_at)
    on conflict (user_id, friend_id) do update set cleared_before = greatest(public.conversation_cleared.cleared_before, excluded.cleared_before);
  update public.messages set read_at = v_at where recipient = me and sender = p_friend and read_at is null and created_at <= v_at;
  -- Tek tek gizlenenlerin kaydı artık gereksiz (temizleme hepsini kapsıyor)
  delete from public.message_hidden h using public.messages m
    where h.user_id = me and m.id = h.message_id and m.created_at <= v_at
      and ((m.sender = me and m.recipient = p_friend) or (m.sender = p_friend and m.recipient = me));
end $$;

-- 2) Mesaj raporları -----------------------------------------------------------
create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  -- Mesaj silinse de rapor kalır (metnin kopyası body'de)
  message_id uuid references public.messages (id) on delete set null,
  reporter uuid not null references public.profiles (id) on delete cascade,
  reported uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'scam', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  body text not null default '',
  message_at timestamptz,
  status text not null default 'open' check (status in ('open', 'dismissed', 'resolved', 'removed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter, message_id)
);
create index if not exists message_reports_open on public.message_reports (status, created_at desc);
create index if not exists message_reports_reporter on public.message_reports (reporter, created_at desc);
create index if not exists message_reports_message on public.message_reports (message_id);
alter table public.message_reports enable row level security;
drop policy if exists "message reports read" on public.message_reports;
create policy "message reports read" on public.message_reports for select using (auth.uid() = reporter or public.is_admin());

create or replace function public.message_report(p_message uuid, p_reason text, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.messages;
  rid uuid;
  snippet text;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate', 'scam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  select * into m from public.messages where id = p_message;
  if m.id is null or m.recipient <> me then
    raise exception 'Sadece sana gelen mesajları raporlayabilirsin';
  end if;
  if (select count(*) from public.message_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  insert into public.message_reports (message_id, reporter, reported, reason, note, body, message_at)
    values (p_message, me, m.sender, p_reason, left(trim(coalesce(p_note, '')), 500), m.body, m.created_at)
    on conflict (reporter, message_id) do nothing
    returning id into rid;
  if rid is null then
    raise exception 'Bu mesajı zaten raporladın';
  end if;
  snippet := left(m.body, 200);
  insert into public.notifications (user_id, kind, data)
    select p.id, 'message_reported', jsonb_build_object(
      'report', rid, 'reason', p_reason, 'text', snippet, 'note', left(trim(coalesce(p_note, '')), 200),
      'reporter', me, 'reporter_name', coalesce((select display_name from public.profiles where id = me), '?'),
      'reported', m.sender, 'reported_name', coalesce((select display_name from public.profiles where id = m.sender), '?'))
    from public.profiles p where p.is_admin;
  return rid;
end $$;

-- Yönetici: mesaj raporları (p_status: 'open' ya da '' = hepsi)
create or replace function public.admin_message_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id, r.message_id, r.reason, r.note, r.body, r.message_at, r.status, r.created_at, r.handled_at,
             r.reporter, coalesce(a.display_name, '?') as reporter_name,
             r.reported, coalesce(b.display_name, '?') as reported_name,
             coalesce(h.display_name, '') as handled_name,
             (r.message_id is not null) as message_exists,
             (select count(*)::int from public.message_reports o where o.reported = r.reported and r.reported is not null) as reported_total
      from public.message_reports r
      left join public.profiles a on a.id = r.reporter
      left join public.profiles b on b.id = r.reported
      left join public.profiles h on h.id = r.handled_by
      where coalesce(p_status, '') = '' or r.status = p_status
      order by r.created_at desc
      limit 300
    ) x), '[]'::jsonb);
end $$;

-- Yönetici işlemleri: dismiss | resolve | reopen | delete_message
create or replace function public.admin_message_report_set(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.message_reports;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  select * into r from public.message_reports where id = p_id for update;
  if r.id is null then
    raise exception 'Rapor bulunamadı';
  end if;
  if p_action = 'dismiss' then
    update public.message_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_action = 'resolve' then
    update public.message_reports set status = 'resolved', handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_action = 'reopen' then
    update public.message_reports set status = 'open', handled_by = null, handled_at = null where id = p_id;
  elsif p_action = 'delete_message' then
    -- Aynı mesajın tüm raporları kapanır; mesaj iki taraftan da silinir (rapordaki kopya kalır)
    if r.message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where message_id = r.message_id;
      delete from public.messages where id = r.message_id;
    else
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now() where id = p_id;
    end if;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('message_report_' || p_action, 'message', coalesce(r.message_id::text, ''), r.reported,
    jsonb_build_object('reason', r.reason, 'body', left(r.body, 200), 'report', r.id));
end $$;

-- 3b) Mesaj göndermek herkese açık (PRO denetimi kaldırıldı) --------------------
create or replace function public.send_message(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if not public.are_friends(me, p_to) then
    raise exception 'Sadece arkadaşlarına mesaj gönderebilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_to and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_to), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.messages (sender, recipient, body) values (me, p_to, left(trim(p_body), 1000)) returning id into mid;
  return mid;
end $$;

-- 3c) Veri paylaşımı PRO -------------------------------------------------------
-- Güvenilir işaretlemek (verilerimi paylaşmak) PRO; güvenilirden çıkarmak ve sessize almak herkese açık
create or replace function public.friend_set(p_user uuid, p_trusted boolean, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_trusted and not public.is_pro()
     and not coalesce((select trusted from public.friendships where user_id = auth.uid() and friend_id = p_user), false) then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  update public.friendships set trusted = p_trusted, muted = p_muted
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
end $$;

-- Canlı veriyi yüklemek PRO (silmek herkese açık); okumak: kendisi ya da paylaşan PRO ve beni güvenilir seçmiş
drop policy if exists "live own write" on public.live_data;
create policy "live own write" on public.live_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.is_pro());
-- Not: friendships satırlarını üye sadece kendi tarafından okuyabildiği için (RLS) "beni güvenilir seçti mi"
-- denetimi security definer yardımcıyla yapılır (eski kuraldaki alt sorgu karşı tarafın satırını göremiyordu).
create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (exists (select 1 from public.friendships f
                where f.user_id = p_owner and f.friend_id = auth.uid() and f.status = 'accepted' and f.trusted)
        and public.user_is_pro(p_owner)));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;
drop policy if exists "live trusted read" on public.live_data;
create policy "live trusted read" on public.live_data for select using (public.live_visible(user_id));

-- Arkadaş listesi: trusts_me = arkadaş beni güvenilir seçti VE arkadaş PRO (verisini görebilirim);
-- okunmamış sayısı kendi görünümümden kaldırdığım mesajları saymaz
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         coalesce(o.trusted and o.status = 'accepted', false) and public.user_is_pro(f.friend_id),
         coalesce(s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         case when f.status = 'accepted' then coalesce(s.track, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.car, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.session, '') else '' end,
         coalesce(s.dnd, false), coalesce(s.accept_messages, true),
         case when f.status = 'accepted' then s.updated_at end,
         (select count(*)::int from public.messages m
          where m.recipient = auth.uid() and m.sender = f.friend_id and m.read_at is null
            and not public.message_hidden_for(m.id, m.sender, m.recipient, m.created_at))
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.friendships o on o.user_id = f.friend_id and o.friend_id = f.user_id
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;

-- Yetkiler -------------------------------------------------------------------
grant select on public.message_hidden, public.conversation_cleared, public.message_reports to authenticated;
grant all on public.message_hidden, public.conversation_cleared, public.message_reports to service_role;
revoke all on function public.hide_message(uuid), public.clear_conversation(uuid), public.message_report(uuid, text, text),
  public.admin_message_reports(text), public.admin_message_report_set(uuid, text) from public, anon;
grant execute on function public.hide_message(uuid), public.clear_conversation(uuid), public.message_report(uuid, text, text),
  public.admin_message_reports(text), public.admin_message_report_set(uuid, text),
  public.send_message(uuid, text), public.friend_set(uuid, boolean, boolean), public.my_friends() to authenticated;

-- Bildirimden e-posta (c26'daki türler + mesaj raporu: yöneticilere message_reported)
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended',
                  'message_reported') then
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;
