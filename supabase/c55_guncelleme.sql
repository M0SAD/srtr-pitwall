-- ---------------------------------------------------------------------------
-- c55: Mesaj menüsü her sohbette aynı: "Benden sil" ve "Raporla" (1:1, grup, takım — uygulama ve site).
--
-- 1) Grup mesajında "Benden sil" (c45'te yoktu; takım sohbetindeki team_message_hidden düzeninin aynısı):
--      group_message_hidden (user_id, message_id)   kişiye özel gizlenen grup mesajları (sadece kendi satırını okur)
--      group_message_hidden_for(mesaj)              çağıran için gizli mi (security definer; RLS ve RPC'ler kullanır)
--      group_message_hide(mesaj)                    grubun üyesi mesajı kendi görünümünden kaldırır (sistem mesajı da olur)
--    group_messages okuma kuralı, group_chat() ve my_groups() (okunmamış sayısı + son mesaj) çağıranın gizlediği
--    mesajları artık saymaz / döndürmez.
--
-- 2) Takım sohbeti mesajını raporlama (c30'da yoktu; group_message_report'un aynısı):
--      message_reports.team_message_id / team_name
--      team_message_report(mesaj, sebep, not)       takımındaki BAŞKASININ mesajını yöneticilere raporla
--                                                   (silinmiş mesaj ve sistem mesajı raporlanamaz; anket mesajında
--                                                   metin olarak anket sorusu saklanır). Günde 20 rapor sınırı ortak.
--    admin_message_reports() takım raporlarını da döndürür (team_message_id, team_name; message_exists takım için de
--    hesaplanır); admin_message_report_set(…, 'delete_message') takım mesajını "herkesten silindi" yapar
--    (anket varsa kapatılır — team_message_delete ile aynı).
-- Sıra: c30 (takımlar), c45 (sohbet grupları) sonrasında.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) Grup mesajı: benden sil
-- ===========================================================================
create table if not exists public.group_message_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.group_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists group_message_hidden_message on public.group_message_hidden (message_id);
alter table public.group_message_hidden enable row level security;
drop policy if exists "own hidden group messages" on public.group_message_hidden;
create policy "own hidden group messages" on public.group_message_hidden for select using (auth.uid() = user_id);
grant select on public.group_message_hidden to authenticated;
grant all on public.group_message_hidden to service_role;

create or replace function public.group_message_hidden_for(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_message_hidden h where h.user_id = auth.uid() and h.message_id = p_id);
$$;
revoke all on function public.group_message_hidden_for(uuid) from public, anon;
grant execute on function public.group_message_hidden_for(uuid) to authenticated, service_role;

drop policy if exists "group messages members" on public.group_messages;
create policy "group messages members" on public.group_messages for select using (
  public.is_group_member(group_id) and not public.group_message_hidden_for(id));

-- Mesajı sadece kendi görünümünden kaldır
create or replace function public.group_message_hide(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.group_messages;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into m from public.group_messages where id = p_id;
  if m.id is null or not public.is_group_member(m.group_id) then
    raise exception 'Mesaj bulunamadı';
  end if;
  insert into public.group_message_hidden (user_id, message_id) values (auth.uid(), p_id) on conflict do nothing;
end $$;
revoke all on function public.group_message_hide(uuid) from public, anon;
grant execute on function public.group_message_hide(uuid) to authenticated;

-- group_chat (c45): çağıranın gizlediği mesajlar gelmez
create or replace function public.group_chat(p_group uuid, p_before timestamptz default null, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at) from (
      select m.created_at, jsonb_build_object('id', m.id, 'group_id', m.group_id, 'sender', m.sender,
               'sender_name', coalesce(p.display_name, '?'), 'body', m.body, 'meta', m.meta, 'deleted', m.deleted,
               'created_at', m.created_at) as j
      from public.group_messages m
      left join public.profiles p on p.id = m.sender
      where m.group_id = p_group and (p_before is null or m.created_at < p_before)
        and not public.group_message_hidden_for(m.id)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;

-- my_groups (c45): okunmamış sayısı ve son mesaj, gizlenen mesajları saymaz (dönüş sütunları aynı)
create or replace function public.my_groups()
returns table (group_id uuid, name text, owner_id uuid, is_owner boolean, muted boolean, unread int,
               last_body text, last_at timestamptz, last_sender uuid, last_sender_name text, last_system boolean,
               member_count int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.owner_id, g.owner_id = auth.uid(), m.muted,
         (select count(*)::int from public.group_messages x
          where x.group_id = g.id and x.created_at > m.last_read_at
            and x.sender is distinct from auth.uid() and not x.deleted
            and not public.group_message_hidden_for(x.id)),
         lm.body, lm.created_at, lm.sender, lm.sender_name, coalesce(lm.is_system, false),
         (select count(*)::int from public.chat_group_members c where c.group_id = g.id),
         g.created_at
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  left join lateral (
    select x.body, x.created_at, x.sender, coalesce(p.display_name, '?') as sender_name, x.meta is not null as is_system
    from public.group_messages x left join public.profiles p on p.id = x.sender
    where x.group_id = g.id and not x.deleted and not public.group_message_hidden_for(x.id)
    order by x.created_at desc limit 1) lm on true
  where m.user_id = auth.uid()
  order by coalesce(lm.created_at, g.created_at) desc, g.name;
$$;
revoke all on function public.group_chat(uuid, timestamptz, int), public.my_groups() from public, anon;
grant execute on function public.group_chat(uuid, timestamptz, int), public.my_groups() to authenticated;

-- ===========================================================================
-- 2) Takım mesajı raporu
-- ===========================================================================
alter table public.message_reports add column if not exists team_message_id uuid references public.team_messages (id) on delete set null;
alter table public.message_reports add column if not exists team_name text;
create unique index if not exists message_reports_team_once on public.message_reports (reporter, team_message_id)
  where team_message_id is not null;

create or replace function public.team_message_report(p_message uuid, p_reason text, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.team_messages;
  rid uuid;
  t_name text;
  v_body text;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate', 'scam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  select * into m from public.team_messages where id = p_message;
  if m.id is null or m.deleted or m.meta is not null or not public.is_team_member(m.team_id) or m.sender is not distinct from me then
    raise exception 'Sadece takımındaki başkasının mesajını raporlayabilirsin';
  end if;
  if (select count(*) from public.message_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  if exists (select 1 from public.message_reports where reporter = me and team_message_id = p_message) then
    raise exception 'Bu mesajı zaten raporladın';
  end if;
  select name into t_name from public.teams where id = m.team_id;
  -- Anket mesajının gövdesi boş olabilir: rapora anket sorusu yazılır
  v_body := m.body;
  if coalesce(v_body, '') = '' and m.poll_id is not null then
    select '📊 ' || question into v_body from public.team_polls where id = m.poll_id;
  end if;
  v_body := coalesce(v_body, '');
  insert into public.message_reports (team_message_id, team_name, reporter, reported, reason, note, body, message_at)
    values (p_message, t_name, me, m.sender, p_reason, left(trim(coalesce(p_note, '')), 500), v_body, m.created_at)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'message_reported', jsonb_build_object(
      'report', rid, 'reason', p_reason, 'text', left(v_body, 200), 'note', left(trim(coalesce(p_note, '')), 200),
      'team_name', t_name,
      'reporter', me, 'reporter_name', coalesce((select display_name from public.profiles where id = me), '?'),
      'reported', m.sender, 'reported_name', coalesce((select display_name from public.profiles where id = m.sender), '?'))
    from public.profiles p where p.is_admin;
  return rid;
end $$;
revoke all on function public.team_message_report(uuid, text, text) from public, anon;
grant execute on function public.team_message_report(uuid, text, text) to authenticated;

-- Yönetici: mesaj raporları (c27, c45) — takım mesajı raporları da gelir (team_name dolu)
create or replace function public.admin_message_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id, r.message_id, r.group_message_id, r.group_name, r.team_message_id, r.team_name,
             r.reason, r.note, r.body, r.message_at, r.status,
             r.created_at, r.handled_at,
             r.reporter, coalesce(a.display_name, '?') as reporter_name,
             r.reported, coalesce(b.display_name, '?') as reported_name,
             coalesce(h.display_name, '') as handled_name,
             (r.message_id is not null
              or exists (select 1 from public.group_messages gm where gm.id = r.group_message_id and not gm.deleted)
              or exists (select 1 from public.team_messages tm where tm.id = r.team_message_id and not tm.deleted)) as message_exists,
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

-- Yönetici işlemleri (c27, c45): dismiss | resolve | reopen | delete_message — takım mesajı da "herkesten silindi" yapılır
create or replace function public.admin_message_report_set(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.message_reports;
  v_poll uuid;
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
    -- Aynı mesajın tüm raporları kapanır; mesaj silinir (rapordaki kopya kalır)
    if r.message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where message_id = r.message_id;
      delete from public.messages where id = r.message_id;
    elsif r.group_message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where group_message_id = r.group_message_id;
      update public.group_messages set deleted = true, body = '', meta = null where id = r.group_message_id;
    elsif r.team_message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where team_message_id = r.team_message_id;
      update public.team_messages set deleted = true, body = '' where id = r.team_message_id returning poll_id into v_poll;
      if v_poll is not null then
        update public.team_polls set ends_at = least(ends_at, now()), updated_at = now() where id = v_poll;
      end if;
    else
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now() where id = p_id;
    end if;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('message_report_' || p_action, 'message',
    coalesce(r.message_id::text, r.group_message_id::text, r.team_message_id::text, ''), r.reported,
    jsonb_build_object('reason', r.reason, 'body', left(r.body, 200), 'report', r.id,
                       'group_name', r.group_name, 'team_name', r.team_name));
end $$;
