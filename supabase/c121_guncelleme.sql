-- c121: Ses odası sohbeti ve sol menüde odadaki kişiler.
--   * voice_messages: her odanın yazılı sohbeti. Yalnızca o an odada olanlar (aktif ses oturumu) ve site yöneticileri
--     okur/yazar. Mesajlar 7 gün saklanır; oda silinince mesajları da silinir. Realtime ile anında gelir.
--   * voice_chat / voice_chat_send / voice_chat_delete: geçmiş (son 80), gönder (dakikada 20), sil (kendi mesajı;
--     oda sahibi / yönetici / moderatör herkesinkini).
--   * voice_rooms_people: listede görünen odalarda şu an kim var (sol menüde odanın altında kişiler, Discord gibi).

create table if not exists public.voice_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.voice_rooms (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 1000),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists voice_messages_room on public.voice_messages (room_id, created_at desc);
create index if not exists voice_messages_sender on public.voice_messages (sender, created_at desc);
alter table public.voice_messages enable row level security;

/** Odanın sohbetini okuyabilir mi: o an odada (son 2 dk içinde ses oturumu) ya da site yöneticisi */
create or replace function public.voice_chat_can(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.voice_sessions s where s.room_id = p_room and s.user_id = auth.uid() and s.last_seen > now() - interval '2 minutes')
    or public.is_admin());
$$;

drop policy if exists "voice messages in room" on public.voice_messages;
create policy "voice messages in room" on public.voice_messages for select using (public.voice_chat_can(room_id));
grant select on public.voice_messages to authenticated;
grant all on public.voice_messages to service_role;

do $$
begin
  alter publication supabase_realtime add table public.voice_messages;
exception when others then null;
end $$;

create or replace function public.voice_chat(p_room uuid, p_before timestamptz default null, p_limit int default 80)
returns table (id uuid, room_id uuid, sender uuid, sender_name text, avatar_path text, body text, deleted boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.voice_chat_can(p_room) then
    raise exception 'Sohbeti görmek için odada olmalısın';
  end if;
  return query
    select * from (
      select m.id, m.room_id, m.sender, p.display_name, p.avatar_path, m.body, m.deleted, m.created_at
      from public.voice_messages m left join public.profiles p on p.id = m.sender
      where m.room_id = p_room and (p_before is null or m.created_at < p_before)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x order by x.created_at asc;
end $$;

create or replace function public.voice_chat_send(p_room uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if me is null or not public.voice_chat_can(p_room) or public.voice_role(p_room, me) is null then
    raise exception 'Mesaj yazmak için odada olmalısın';
  end if;
  if v_body = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if (select count(*) from public.voice_messages where sender = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.voice_messages (room_id, sender, body) values (p_room, me, v_body) returning id into mid;
  return mid;
end $$;

create or replace function public.voice_chat_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.voice_messages;
begin
  select * into m from public.voice_messages where id = p_id;
  if m.id is null or not public.voice_chat_can(m.room_id) then
    raise exception 'Mesaj bulunamadı';
  end if;
  if m.sender is distinct from auth.uid() and not public.voice_is_mod(m.room_id, auth.uid()) and not public.is_admin() then
    raise exception 'Sadece kendi mesajını silebilirsin';
  end if;
  update public.voice_messages set deleted = true, body = '' where id = p_id;
end $$;

/** Listede görünen odalarda şu an kimler var (en çok 200 kişi) */
create or replace function public.voice_rooms_people() returns table (room_id uuid, user_id uuid, name text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select distinct on (s.room_id, s.user_id) s.room_id, s.user_id, p.display_name, p.avatar_path
  from public.voice_rooms_list() l
  join public.voice_sessions s on s.room_id = l.id and s.last_seen > now() - interval '90 seconds'
  join public.profiles p on p.id = s.user_id
  where l.kind <> 'private' or l.my_role is not null
  order by s.room_id, s.user_id
  limit 200;
$$;

-- Temizlik (5 dk'da bir): boş odalar + 7 günden eski sohbet mesajları
create or replace function public.voice_rooms_cleanup() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from public.voice_rooms r where public.voice_room_expired(r);
  get diagnostics n = row_count;
  delete from public.voice_messages where created_at < now() - interval '7 days';
  return n;
end $$;

grant execute on function public.voice_chat(uuid, timestamptz, int), public.voice_chat_send(uuid, text), public.voice_chat_delete(uuid),
  public.voice_rooms_people(), public.voice_chat_can(uuid) to authenticated;

notify pgrst, 'reload schema';
