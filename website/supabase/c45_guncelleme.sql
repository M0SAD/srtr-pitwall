-- ---------------------------------------------------------------------------
-- c45: (1) Sohbet grupları, (2) Sohbet arka planı: sohbette mesaj olarak görünür; grup / takımda sadece sahip değiştirir.
--
-- 1) Sohbet grupları (Arkadaşlar listesinde "Gruplar"):
--      chat_groups (ad, sahip), chat_group_members (son okuma, sessize alma, davet eden),
--      group_messages (Realtime; meta = sistem mesajı bilgisi; deleted = herkesten silindi).
--    Tablolara doğrudan yazılamaz; okuma sadece üyeler (is_group_member). İşlemler RPC ile:
--      group_create(ad, arkadaşlar[])  grup kurar, seçilen arkadaşları ekler (sahip başına en fazla 20 grup)
--      group_invite(grup, kişiler[])   her üye kendi KABUL EDİLMİŞ arkadaşlarını ekleyebilir (grup en fazla 50 üye).
--                                      Çağıranı sessize almış ya da mesajları kapalı olan kişi eklenmez (atlanır).
--                                      Eklenen kişiye 'group_added' bildirimi gider (e-posta yok).
--      group_leave(grup)               gruptan ayrıl. Sahip ayrılırsa sahiplik en eski üyeye geçer;
--                                      kimse kalmazsa grup ve mesajları kendiliğinden silinir (üye silme tetikleyicisi;
--                                      hesap silinince de aynı kural çalışır).
--      group_kick(grup, kişi)          sadece sahip; çıkarılana 'group_removed' bildirimi
--      group_delete(grup)              sadece sahip (ya da yönetici): grup, üyelikler ve mesajlar silinir
--      group_rename(grup, ad)          sadece sahip
--      group_send / group_chat / group_message_delete (kendi mesajın; sahip her mesajı) / group_read / group_mute
--      my_groups()                     gruplarım: sahip miyim, sessiz, okunmamış, son mesaj, üye sayısı
--      group_members(grup)             üyeler (ad, avatar, sahip mi)
--      group_message_report(mesaj, sebep, not)  grup mesajını yöneticilere raporla (message_reports'a yazılır;
--                                      admin_message_reports / admin_message_report_set grup mesajlarını da kapsar)
--    Mesaj yazmak 'social.messages' PRO kuralına uyar (1:1 mesajla aynı), dakikada 30 mesaj sınırı aynı.
--
-- 2) Sohbet arka planı:
--      messages.meta / team_messages.meta / group_messages.meta (jsonb): sistem mesajı bilgisi.
--        {"t":"bg","kind":"solid|gradient|image|none","value":"…","image":"<chatbg yolu>"}
--        grup: {"t":"join|leave|kick|owner|rename", "user":…, "name":…, "by_name":…}
--      1:1 sohbet (kişiye özel; benim seçimim karşı tarafı zorlamaz):
--        chat_bg_announce(arkadaş, tür, değer, görsel) → sohbete "arka planını değiştirdi" mesajı yazar. Karşı taraf
--        mesaja tıklayıp aynı arka planı kendi tarafında kullanabilir (görsel "chatbg" kovasında <a>_<b>/ klasöründe,
--        c37 kuralları: sadece iki taraf okur). Dönüş: {id, old[]} — old: artık gerekmeyen eski görseller
--        (son 2 değişikliğin görseli saklanır; uygulama diğerlerini kovadan siler).
--      Grup ve takım sohbeti (herkese uygulanır, sadece GRUP SAHİBİ / TAKIM SAHİBİ değiştirir):
--        chat_room_bg (scope = 'group' | 'team', room_id) tek satır; okuma: üyeler.
--        room_bg_set(scope, oda, tür, değer, görsel) / room_bg_clear(scope, oda) → odaya sistem mesajı da yazar.
--        Görseller "chatbg" kovasında g_<grup id>/ ve t_<takım id>/ klasörlerinde:
--        yükleme ve silme sadece sahip, okuma üyeler (depolama kuralları aşağıda).
--      'social.chat_bg' PRO kuralı (c40) bu RPC'ler için de geçerlidir.
--      team_chat() artık meta alanını da döndürür.
--      c37'deki öner / kabul et akışı (chat_bg_propose …) yerinde durur; uygulama artık kullanmıyor.
-- Sıra: c30 (takımlar), c37 (chatbg kovası), c40 (feature_requires_pro) ve c44 sonrasında.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 0) Sistem mesajı alanı
-- ===========================================================================
alter table public.messages add column if not exists meta jsonb;
alter table public.team_messages add column if not exists meta jsonb;

-- ===========================================================================
-- 1) Sohbet grupları
-- ===========================================================================
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  -- Sahibin hesabı silinirse boş kalır; üye silme tetikleyicisi en eski üyeyi sahip yapar
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_groups_owner on public.chat_groups (owner_id);
alter table public.chat_groups enable row level security;

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_group_members_user on public.chat_group_members (user_id);
alter table public.chat_group_members enable row level security;

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 1000),
  meta jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or char_length(body) >= 1)
);
create index if not exists group_messages_group on public.group_messages (group_id, created_at desc);
create index if not exists group_messages_sender on public.group_messages (sender, created_at desc);
alter table public.group_messages enable row level security;

-- security definer: RLS döngüsüne girmeden üyelik denetimi
create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.chat_group_members where group_id = p_group and user_id = auth.uid());
$$;
create or replace function public.is_group_owner(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.chat_groups where id = p_group and owner_id = auth.uid());
$$;
grant execute on function public.is_group_member(uuid), public.is_group_owner(uuid) to authenticated;

drop policy if exists "chat groups members" on public.chat_groups;
create policy "chat groups members" on public.chat_groups for select using (public.is_group_member(id));
drop policy if exists "chat group members read" on public.chat_group_members;
create policy "chat group members read" on public.chat_group_members for select using (public.is_group_member(group_id));
drop policy if exists "group messages members" on public.group_messages;
create policy "group messages members" on public.group_messages for select using (public.is_group_member(group_id));

grant select on public.chat_groups, public.chat_group_members, public.group_messages to authenticated;
grant all on public.chat_groups, public.chat_group_members, public.group_messages to service_role;

do $$ begin
  alter publication supabase_realtime add table public.group_messages;
exception when others then null; end $$;

-- Üye ayrılınca / çıkarılınca / hesabı silinince: kimse kalmadıysa grup silinir, sahip gittiyse en eski üye sahip olur
create or replace function public.chat_group_member_gone() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g public.chat_groups;
  nxt uuid;
begin
  select * into g from public.chat_groups where id = old.group_id;
  if not found then
    return null; -- grup zaten siliniyor
  end if;
  select user_id into nxt from public.chat_group_members
    where group_id = old.group_id order by joined_at, user_id limit 1;
  if nxt is null then
    delete from public.chat_groups where id = old.group_id;
    return null;
  end if;
  if g.owner_id is null or g.owner_id = old.user_id
     or not exists (select 1 from public.chat_group_members where group_id = old.group_id and user_id = g.owner_id) then
    update public.chat_groups set owner_id = nxt, updated_at = now() where id = old.group_id;
    insert into public.group_messages (group_id, sender, body, meta)
      values (old.group_id, nxt, '👑 Grubun yeni sahibi oldu',
              jsonb_build_object('t', 'owner', 'user', nxt,
                'name', coalesce((select display_name from public.profiles where id = nxt), '?')));
  end if;
  return null;
end $$;
drop trigger if exists chat_group_member_gone on public.chat_group_members;
create trigger chat_group_member_gone after delete on public.chat_group_members
  for each row execute function public.chat_group_member_gone();

-- İç yardımcı: p_by, kabul edilmiş arkadaşlarını gruba ekler. Dönüş: eklenen kişi sayısı. (Doğrudan çağrılamaz.)
create or replace function public.chat_group_add(p_group uuid, p_by uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  u uuid;
  n int := 0;
  cnt int;
  g_name text;
  by_name text;
  u_name text;
begin
  select name into g_name from public.chat_groups where id = p_group;
  select coalesce(display_name, '?') into by_name from public.profiles where id = p_by;
  select count(*) into cnt from public.chat_group_members where group_id = p_group;
  for u in select distinct x from unnest(coalesce(p_users, '{}'::uuid[])) x where x is not null and x <> p_by limit 60 loop
    continue when exists (select 1 from public.chat_group_members where group_id = p_group and user_id = u);
    continue when not public.are_friends(p_by, u);
    -- Davet edeni sessize alan ya da mesajları kapatan kişi gruba eklenemez
    continue when coalesce((select muted from public.friendships where user_id = u and friend_id = p_by), false);
    continue when not coalesce((select accept_messages from public.user_status where user_id = u), true);
    continue when (select count(*) from public.chat_group_members where user_id = u) >= 100;
    if cnt >= 50 then
      raise exception 'Bir grupta en fazla 50 kişi olabilir';
    end if;
    insert into public.chat_group_members (group_id, user_id, invited_by) values (p_group, u, p_by);
    cnt := cnt + 1;
    n := n + 1;
    select coalesce(display_name, '?') into u_name from public.profiles where id = u;
    insert into public.group_messages (group_id, sender, body, meta)
      values (p_group, p_by, '➕ ' || coalesce(u_name, '?') || ' gruba eklendi',
              jsonb_build_object('t', 'join', 'user', u, 'name', coalesce(u_name, '?'), 'by_name', coalesce(by_name, '?')));
    insert into public.notifications (user_id, kind, data)
      values (u, 'group_added', jsonb_build_object('group', p_group, 'group_name', g_name, 'from', p_by, 'name', coalesce(by_name, '?')));
  end loop;
  return n;
end $$;
revoke all on function public.chat_group_add(uuid, uuid, uuid[]) from public, anon, authenticated;

create or replace function public.group_create(p_name text, p_members uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
  gid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.messages', false) and not public.is_pro() then
    raise exception 'Grup kurmak PRO üyelik gerektirir';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Grup adı en az 2 karakter olmalı';
  end if;
  if (select count(*) from public.chat_groups where owner_id = me) >= 20 then
    raise exception 'En fazla 20 grubun sahibi olabilirsin';
  end if;
  if (select count(*) from public.chat_group_members where user_id = me) >= 100 then
    raise exception 'Çok fazla gruptasın';
  end if;
  insert into public.chat_groups (name, owner_id) values (v_name, me) returning id into gid;
  insert into public.chat_group_members (group_id, user_id) values (gid, me);
  perform public.chat_group_add(gid, me, p_members);
  return gid;
end $$;

create or replace function public.group_invite(p_group uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  if (select count(*) from public.notifications where kind = 'group_added' and data ->> 'from' = me::text
        and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Çok fazla davet gönderdin, biraz bekle';
  end if;
  return public.chat_group_add(p_group, me, p_users);
end $$;

create or replace function public.group_leave(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text;
begin
  if me is null or not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  if (select count(*) from public.chat_group_members where group_id = p_group) > 1 then
    select coalesce(display_name, '?') into v_name from public.profiles where id = me;
    insert into public.group_messages (group_id, sender, body, meta)
      values (p_group, me, '🚪 ' || coalesce(v_name, '?') || ' gruptan ayrıldı',
              jsonb_build_object('t', 'leave', 'user', me, 'name', coalesce(v_name, '?')));
  end if;
  delete from public.notifications where user_id = me and kind = 'group_added' and data ->> 'group' = p_group::text;
  -- Sahiplik devri ve boş grubun silinmesi: chat_group_member_gone tetikleyicisi
  delete from public.chat_group_members where group_id = p_group and user_id = me;
end $$;

create or replace function public.group_kick(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text;
  g_name text;
begin
  if me is null or not public.is_group_owner(p_group) then
    raise exception 'Sadece grup sahibi üye çıkarabilir';
  end if;
  if p_user is null or p_user = me then
    raise exception 'Kendini çıkaramazsın; gruptan ayrılabilirsin';
  end if;
  if not exists (select 1 from public.chat_group_members where group_id = p_group and user_id = p_user) then
    raise exception 'Bu kişi grupta değil';
  end if;
  select coalesce(display_name, '?') into v_name from public.profiles where id = p_user;
  select name into g_name from public.chat_groups where id = p_group;
  delete from public.chat_group_members where group_id = p_group and user_id = p_user;
  insert into public.group_messages (group_id, sender, body, meta)
    values (p_group, me, '➖ ' || coalesce(v_name, '?') || ' gruptan çıkarıldı',
            jsonb_build_object('t', 'kick', 'user', p_user, 'name', coalesce(v_name, '?')));
  delete from public.notifications where user_id = p_user and kind = 'group_added' and data ->> 'group' = p_group::text;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'group_removed', jsonb_build_object('group', p_group, 'group_name', g_name));
end $$;

create or replace function public.group_delete(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_group_owner(p_group) or public.is_admin()) then
    raise exception 'Sadece grup sahibi grubu silebilir';
  end if;
  delete from public.notifications where kind = 'group_added' and data ->> 'group' = p_group::text;
  delete from public.chat_groups where id = p_group;
end $$;

create or replace function public.group_rename(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40);
begin
  if me is null or not public.is_group_owner(p_group) then
    raise exception 'Sadece grup sahibi adı değiştirebilir';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Grup adı en az 2 karakter olmalı';
  end if;
  update public.chat_groups set name = v_name, updated_at = now() where id = p_group and name is distinct from v_name;
  if found then
    insert into public.group_messages (group_id, sender, body, meta)
      values (p_group, me, '✏️ Grubun adı değişti: ' || v_name, jsonb_build_object('t', 'rename', 'name', v_name));
  end if;
end $$;

create or replace function public.group_send(p_group uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if me is null or not public.is_group_member(p_group) then
    raise exception 'Bu grupta değilsin';
  end if;
  if public.feature_requires_pro('social.messages', false) and not public.is_pro() then
    raise exception 'Mesaj göndermek PRO üyelik gerektirir';
  end if;
  if v_body = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if (select count(*) from public.group_messages where sender = me and meta is null and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.group_messages (group_id, sender, body) values (p_group, me, v_body) returning id into mid;
  update public.chat_group_members set last_read_at = now() where group_id = p_group and user_id = me;
  return mid;
end $$;

create or replace function public.group_message_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.group_messages;
begin
  select * into m from public.group_messages where id = p_id;
  if m.id is null or not (public.is_group_member(m.group_id) or public.is_admin()) then
    raise exception 'Mesaj bulunamadı';
  end if;
  if m.meta is not null and not public.is_admin() then
    raise exception 'Sistem mesajları silinemez';
  end if;
  if m.sender is distinct from auth.uid() and not public.is_group_owner(m.group_id) and not public.is_admin() then
    raise exception 'Sadece kendi mesajını silebilirsin';
  end if;
  update public.group_messages set deleted = true, body = '', meta = null where id = p_id;
end $$;

create or replace function public.group_read(p_group uuid) returns void
language sql security definer set search_path = public as $$
  update public.chat_group_members set last_read_at = now() where group_id = p_group and user_id = auth.uid();
$$;
create or replace function public.group_mute(p_group uuid, p_muted boolean) returns void
language sql security definer set search_path = public as $$
  update public.chat_group_members set muted = coalesce(p_muted, false) where group_id = p_group and user_id = auth.uid();
$$;

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
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;

drop function if exists public.my_groups();
create or replace function public.my_groups()
returns table (group_id uuid, name text, owner_id uuid, is_owner boolean, muted boolean, unread int,
               last_body text, last_at timestamptz, last_sender uuid, last_sender_name text, last_system boolean,
               member_count int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.owner_id, g.owner_id = auth.uid(), m.muted,
         (select count(*)::int from public.group_messages x
          where x.group_id = g.id and x.created_at > m.last_read_at
            and x.sender is distinct from auth.uid() and not x.deleted),
         lm.body, lm.created_at, lm.sender, lm.sender_name, coalesce(lm.is_system, false),
         (select count(*)::int from public.chat_group_members c where c.group_id = g.id),
         g.created_at
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  left join lateral (
    select x.body, x.created_at, x.sender, coalesce(p.display_name, '?') as sender_name, x.meta is not null as is_system
    from public.group_messages x left join public.profiles p on p.id = x.sender
    where x.group_id = g.id and not x.deleted
    order by x.created_at desc limit 1) lm on true
  where m.user_id = auth.uid()
  order by coalesce(lm.created_at, g.created_at) desc, g.name;
$$;

drop function if exists public.group_members(uuid);
create or replace function public.group_members(p_group uuid)
returns table (user_id uuid, display_name text, avatar_path text, is_owner boolean, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(p.display_name, '?'), p.avatar_path, g.owner_id = m.user_id, m.joined_at
  from public.chat_group_members m
  join public.chat_groups g on g.id = m.group_id
  join public.profiles p on p.id = m.user_id
  where m.group_id = p_group and public.is_group_member(p_group)
  order by (g.owner_id = m.user_id) desc, m.joined_at, p.display_name;
$$;

-- Grup mesajı raporları: message_reports tablosuna yazılır (mesaj silinse de metnin kopyası kalır)
alter table public.message_reports add column if not exists group_message_id uuid references public.group_messages (id) on delete set null;
alter table public.message_reports add column if not exists group_name text;
create unique index if not exists message_reports_group_once on public.message_reports (reporter, group_message_id)
  where group_message_id is not null;

create or replace function public.group_message_report(p_message uuid, p_reason text, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.group_messages;
  rid uuid;
  g_name text;
begin
  if me is null then
    raise exception 'Raporlamak için giriş yapmalısın';
  end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate', 'scam', 'other') then
    raise exception 'Geçersiz sebep';
  end if;
  select * into m from public.group_messages where id = p_message;
  if m.id is null or m.deleted or m.meta is not null or not public.is_group_member(m.group_id) or m.sender is not distinct from me then
    raise exception 'Sadece grubundaki başkasının mesajını raporlayabilirsin';
  end if;
  if (select count(*) from public.message_reports where reporter = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla rapor gönderdin';
  end if;
  if exists (select 1 from public.message_reports where reporter = me and group_message_id = p_message) then
    raise exception 'Bu mesajı zaten raporladın';
  end if;
  select name into g_name from public.chat_groups where id = m.group_id;
  insert into public.message_reports (group_message_id, group_name, reporter, reported, reason, note, body, message_at)
    values (p_message, g_name, me, m.sender, p_reason, left(trim(coalesce(p_note, '')), 500), m.body, m.created_at)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'message_reported', jsonb_build_object(
      'report', rid, 'reason', p_reason, 'text', left(m.body, 200), 'note', left(trim(coalesce(p_note, '')), 200),
      'group_name', g_name,
      'reporter', me, 'reporter_name', coalesce((select display_name from public.profiles where id = me), '?'),
      'reported', m.sender, 'reported_name', coalesce((select display_name from public.profiles where id = m.sender), '?'))
    from public.profiles p where p.is_admin;
  return rid;
end $$;

-- Yönetici: mesaj raporları (c27) — grup mesajı raporları da gelir (group_name dolu)
create or replace function public.admin_message_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select r.id, r.message_id, r.group_message_id, r.group_name, r.reason, r.note, r.body, r.message_at, r.status,
             r.created_at, r.handled_at,
             r.reporter, coalesce(a.display_name, '?') as reporter_name,
             r.reported, coalesce(b.display_name, '?') as reported_name,
             coalesce(h.display_name, '') as handled_name,
             (r.message_id is not null
              or exists (select 1 from public.group_messages gm where gm.id = r.group_message_id and not gm.deleted)) as message_exists,
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

-- Yönetici işlemleri (c27): dismiss | resolve | reopen | delete_message — grup mesajı "herkesten silindi" yapılır
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
    -- Aynı mesajın tüm raporları kapanır; mesaj silinir (rapordaki kopya kalır)
    if r.message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where message_id = r.message_id;
      delete from public.messages where id = r.message_id;
    elsif r.group_message_id is not null then
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now()
        where group_message_id = r.group_message_id;
      update public.group_messages set deleted = true, body = '', meta = null where id = r.group_message_id;
    else
      update public.message_reports set status = 'removed', handled_by = auth.uid(), handled_at = now() where id = p_id;
    end if;
  else
    raise exception 'Geçersiz işlem';
  end if;
  perform public.log_mod('message_report_' || p_action, 'message', coalesce(r.message_id::text, r.group_message_id::text, ''), r.reported,
    jsonb_build_object('reason', r.reason, 'body', left(r.body, 200), 'report', r.id, 'group_name', r.group_name));
end $$;

revoke all on function public.group_create(text, uuid[]), public.group_invite(uuid, uuid[]), public.group_leave(uuid),
  public.group_kick(uuid, uuid), public.group_delete(uuid), public.group_rename(uuid, text), public.group_send(uuid, text),
  public.group_message_delete(uuid), public.group_read(uuid), public.group_mute(uuid, boolean),
  public.group_chat(uuid, timestamptz, int), public.my_groups(), public.group_members(uuid),
  public.group_message_report(uuid, text, text) from public, anon;
grant execute on function public.group_create(text, uuid[]), public.group_invite(uuid, uuid[]), public.group_leave(uuid),
  public.group_kick(uuid, uuid), public.group_delete(uuid), public.group_rename(uuid, text), public.group_send(uuid, text),
  public.group_message_delete(uuid), public.group_read(uuid), public.group_mute(uuid, boolean),
  public.group_chat(uuid, timestamptz, int), public.my_groups(), public.group_members(uuid),
  public.group_message_report(uuid, text, text) to authenticated;

-- ===========================================================================
-- 2) Sohbet arka planı
-- ===========================================================================

-- Ortak doğrulama: tür / değer / görsel yolu (klasör = beklenen klasör, dosya kovada var)
create or replace function public.chat_bg_check(p_kind text, p_value text, p_image text, p_folder text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'solid' then
    if coalesce(p_value, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Geçersiz renk'; end if;
  elsif p_kind = 'gradient' then
    if coalesce(p_value, '') !~ '^[a-z0-9-]{1,24}$' then raise exception 'Geçersiz degrade'; end if;
  elsif p_kind = 'image' then
    if p_image is null or length(p_image) > 200 or p_image not like p_folder || '/%' or p_image like '%..%'
       or p_image !~ '^[0-9a-gt_-]+/[A-Za-z0-9._-]+$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chatbg' and o.name = p_image) then
      raise exception 'Geçersiz görsel';
    end if;
  else
    raise exception 'Geçersiz arka plan türü';
  end if;
end $$;
revoke all on function public.chat_bg_check(text, text, text, text) from public, anon, authenticated;

-- 2a) 1:1 sohbet: arka planımı değiştirdim → sohbete sistem mesajı (karşı taraf isterse aynısını kullanır)
create or replace function public.chat_bg_announce(p_friend uuid, p_kind text, p_value text default '',
  p_image text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  folder text;
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  mid uuid;
  old text[];
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.chat_bg', false) and not public.is_pro() then
    raise exception 'Sohbet arka planını paylaşmak PRO üyelik gerektirir';
  end if;
  if p_friend is null or p_friend = me or not public.are_friends(me, p_friend) then
    raise exception 'Sadece arkadaşlarınla arka plan paylaşabilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_friend and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_friend), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if me < p_friend then folder := me::text || '_' || p_friend::text;
  else folder := p_friend::text || '_' || me::text; end if;
  perform public.chat_bg_check(p_kind, v_value, v_image, folder);
  if p_kind = 'image' then v_value := ''; else v_image := null; end if;
  -- Taşkın önleme: aynı sohbete 5 saniyede bir, saatte en fazla 20 arka plan mesajı
  if exists (select 1 from public.messages where sender = me and recipient = p_friend and meta ->> 't' = 'bg'
               and created_at > now() - interval '5 seconds') then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;
  if (select count(*) from public.messages where sender = me and meta ->> 't' = 'bg' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Çok sık arka plan değiştiriyorsun, biraz bekle';
  end if;
  insert into public.messages (sender, recipient, body, meta)
    values (me, p_friend, '🖼️ Sohbet arka planını değiştirdi',
            jsonb_strip_nulls(jsonb_build_object('t', 'bg', 'kind', p_kind, 'value', v_value, 'image', v_image)))
    returning id into mid;
  -- Bu sohbette benim eski görsellerim: son 2 değişikliğin görseli kalır, öncekiler mesajdan düşer ve silinmek üzere döner
  with stale as (
    select id, meta ->> 'image' as img from public.messages
    where sender = me and recipient = p_friend and meta ->> 't' = 'bg' and meta ? 'image'
    order by created_at desc offset 2
  ), upd as (
    update public.messages m set meta = m.meta - 'image' from stale s where m.id = s.id returning s.img
  )
  select coalesce(array_agg(img), '{}') into old from upd where img is distinct from v_image;
  return jsonb_build_object('id', mid, 'old', to_jsonb(old));
end $$;
revoke all on function public.chat_bg_announce(uuid, text, text, text) from public, anon;
grant execute on function public.chat_bg_announce(uuid, text, text, text) to authenticated;

-- 2b) Grup / takım sohbetinin ortak arka planı (sadece sahip değiştirir)
create table if not exists public.chat_room_bg (
  scope text not null check (scope in ('group', 'team')),
  room_id uuid not null,
  kind text not null check (kind in ('solid', 'gradient', 'image')),
  value text not null default '',
  image_path text,
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (scope, room_id)
);
alter table public.chat_room_bg enable row level security;

create or replace function public.chat_room_member(p_scope text, p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_scope when 'group' then public.is_group_member(p_room)
                      when 'team' then public.is_team_member(p_room) else false end;
$$;
create or replace function public.chat_room_owner(p_scope text, p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and case p_scope
    when 'group' then public.is_group_owner(p_room)
    when 'team' then exists (select 1 from public.team_members where team_id = p_room and user_id = auth.uid() and role = 'owner')
    else false end;
$$;
grant execute on function public.chat_room_member(text, uuid), public.chat_room_owner(text, uuid) to authenticated;

drop policy if exists "room bg members" on public.chat_room_bg;
create policy "room bg members" on public.chat_room_bg for select using (public.chat_room_member(scope, room_id));
grant select on public.chat_room_bg to authenticated;
grant all on public.chat_room_bg to service_role;

-- Grup / takım silinince arka plan satırı da silinir
create or replace function public.chat_room_bg_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.chat_room_bg where scope = tg_argv[0] and room_id = old.id;
  return old;
end $$;
drop trigger if exists chat_room_bg_gone on public.chat_groups;
create trigger chat_room_bg_gone before delete on public.chat_groups
  for each row execute function public.chat_room_bg_gone('group');
drop trigger if exists chat_room_bg_gone on public.teams;
create trigger chat_room_bg_gone before delete on public.teams
  for each row execute function public.chat_room_bg_gone('team');

-- Kova klasörü "g_<grup id>" / "t_<takım id>": okuma üyeler, yazma sadece sahip
create or replace function public.chat_bg_room_folder_ok(p_folder text, p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  pre text := split_part(coalesce(p_folder, ''), '_', 1);
  id text := split_part(coalesce(p_folder, ''), '_', 2);
  sc text;
begin
  if auth.uid() is null or pre not in ('g', 't') or p_folder <> pre || '_' || id
     or id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  sc := case pre when 'g' then 'group' else 'team' end;
  if p_write then
    return public.chat_room_owner(sc, id::uuid);
  end if;
  return public.chat_room_member(sc, id::uuid);
end $$;
grant execute on function public.chat_bg_room_folder_ok(text, boolean) to authenticated;

drop policy if exists "chatbg room upload" on storage.objects;
create policy "chatbg room upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chatbg' and public.chat_bg_room_folder_ok((storage.foldername(name))[1], true));
drop policy if exists "chatbg room read" on storage.objects;
create policy "chatbg room read" on storage.objects for select to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_room_folder_ok((storage.foldername(name))[1], false));
drop policy if exists "chatbg room delete" on storage.objects;
create policy "chatbg room delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_room_folder_ok((storage.foldername(name))[1], true));

-- İç yardımcı: odaya "arka plan değişti" sistem mesajı
create or replace function public.chat_room_bg_note(p_scope text, p_room uuid, p_meta jsonb, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_scope = 'group' then
    insert into public.group_messages (group_id, sender, body, meta) values (p_room, auth.uid(), p_body, p_meta);
    update public.chat_group_members set last_read_at = now() where group_id = p_room and user_id = auth.uid();
  else
    insert into public.team_messages (team_id, sender, body, meta) values (p_room, auth.uid(), p_body, p_meta);
    update public.team_chat_state set last_read_at = now() where team_id = p_room and user_id = auth.uid();
  end if;
end $$;
revoke all on function public.chat_room_bg_note(text, uuid, jsonb, text) from public, anon, authenticated;

-- Dönüş: artık kullanılmayan eski görselin yolu (uygulama kovadan siler) ya da null
create or replace function public.room_bg_set(p_scope text, p_room uuid, p_kind text, p_value text default '',
  p_image text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  prev public.chat_room_bg;
  had boolean;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_scope not in ('group', 'team') or p_room is null or not public.chat_room_owner(p_scope, p_room) then
    raise exception '%', case when p_scope = 'team' then 'Sohbet arka planını sadece takım sahibi değiştirebilir'
                              else 'Sohbet arka planını sadece grup sahibi değiştirebilir' end;
  end if;
  if public.feature_requires_pro('social.chat_bg', false) and not public.is_pro() then
    raise exception 'Sohbet arka planını değiştirmek PRO üyelik gerektirir';
  end if;
  perform public.chat_bg_check(p_kind, v_value, v_image, (case p_scope when 'group' then 'g_' else 't_' end) || p_room::text);
  if p_kind = 'image' then v_value := ''; else v_image := null; end if;
  select * into prev from public.chat_room_bg where scope = p_scope and room_id = p_room;
  had := found;
  if had and prev.updated_at > now() - interval '5 seconds' then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;
  insert into public.chat_room_bg (scope, room_id, kind, value, image_path, set_by, updated_at)
    values (p_scope, p_room, p_kind, v_value, v_image, me, now())
  on conflict (scope, room_id) do update set kind = excluded.kind, value = excluded.value,
    image_path = excluded.image_path, set_by = excluded.set_by, updated_at = now();
  perform public.chat_room_bg_note(p_scope, p_room,
    jsonb_strip_nulls(jsonb_build_object('t', 'bg', 'kind', p_kind, 'value', v_value, 'image', v_image)),
    '🖼️ Sohbet arka planını değiştirdi');
  if had and prev.image_path is not null and prev.image_path is distinct from v_image then
    -- Eski görsel silinecek: eski sistem mesajlarındaki küçük resim de düşer
    if p_scope = 'group' then
      update public.group_messages set meta = meta - 'image' where group_id = p_room and meta ->> 'image' = prev.image_path;
    else
      update public.team_messages set meta = meta - 'image' where team_id = p_room and meta ->> 'image' = prev.image_path;
    end if;
    return prev.image_path;
  end if;
  return null;
end $$;

create or replace function public.room_bg_clear(p_scope text, p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  if auth.uid() is null or p_scope not in ('group', 'team') or p_room is null or not public.chat_room_owner(p_scope, p_room) then
    raise exception '%', case when p_scope = 'team' then 'Sohbet arka planını sadece takım sahibi değiştirebilir'
                              else 'Sohbet arka planını sadece grup sahibi değiştirebilir' end;
  end if;
  delete from public.chat_room_bg where scope = p_scope and room_id = p_room returning image_path into v_path;
  if not found then
    return null;
  end if;
  if v_path is not null then
    if p_scope = 'group' then
      update public.group_messages set meta = meta - 'image' where group_id = p_room and meta ->> 'image' = v_path;
    else
      update public.team_messages set meta = meta - 'image' where team_id = p_room and meta ->> 'image' = v_path;
    end if;
  end if;
  perform public.chat_room_bg_note(p_scope, p_room, jsonb_build_object('t', 'bg', 'kind', 'none'), '🖼️ Sohbet arka planını kaldırdı');
  return v_path;
end $$;

revoke all on function public.room_bg_set(text, uuid, text, text, text), public.room_bg_clear(text, uuid) from public, anon;
grant execute on function public.room_bg_set(text, uuid, text, text, text), public.room_bg_clear(text, uuid) to authenticated;

-- 2c) team_chat (c30): meta alanı da döner (arka plan sistem mesajı)
create or replace function public.team_chat(p_team uuid, p_before timestamptz default null, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at) from (
      select m.created_at, jsonb_build_object('id', m.id, 'team_id', m.team_id, 'sender', m.sender,
               'sender_name', coalesce(p.display_name, '?'), 'body', m.body, 'deleted', m.deleted,
               'poll_id', m.poll_id, 'created_at', m.created_at, 'meta', m.meta,
               'poll', case when m.poll_id is not null and not m.deleted then public.team_poll_json(m.poll_id) end) as j
      from public.team_messages m
      left join public.profiles p on p.id = m.sender
      where m.team_id = p_team
        and (p_before is null or m.created_at < p_before)
        and not public.team_message_hidden_for(m.id)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;
