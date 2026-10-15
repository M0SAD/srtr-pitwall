-- c116: Ses odaları (Discord benzeri, sadeleştirilmiş).
--
-- Ses veritabanından ya da Supabase'den GEÇMEZ: Cloudflare Realtime SFU üzerinden canlı akar ve kaydedilmez.
-- Burada yalnızca odaların bilgisi, yetkiler, söz hakkı (süreli) ve söz isteme sırası tutulur.
--
--   voice_rooms          oda: ad, tür (public herkese açık | private davet kodlu | team takım üyeleri), mod (open herkes
--                        konuşur | moderated söz hakkıyla), varsayılan konuşma süresi, kişi sınırı, kanal anahtarı
--   voice_room_roles     odaya özel yetki: admin (yönetir), mod (söz verir), speaker (her zaman konuşabilir)
--   voice_grants         süreli söz hakkı (until): moderatör verir, uzatır, geri alır
--   voice_requests       söz isteme sırası (el kaldırma)
--   voice_bans           odadan atılanlar (until null = kalıcı)
--   voice_sessions       odadaki bağlantılar (Edge Function "voice-sfu" yazar; istemci 30 sn'de bir işaret verir).
--                        Oda listesindeki kişi sayısı ve SFU'dan ses çekme izni bundan kontrol edilir.
--
-- Yetki kuralı (voice_can_speak): yasaklı değil VE (oda "open" YA DA sahibi / admin / mod / speaker YA DA süresi
-- dolmamış söz hakkı). SFU'dan bir kişinin sesini çekmek (Edge Function) bu kurala bağlıdır: söz hakkı olmayanın
-- sesi kimseye iletilmez.

create table if not exists public.voice_rooms (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  description text not null default '' check (char_length(description) <= 200),
  kind text not null default 'public' check (kind in ('public', 'private', 'team')),
  team_id uuid references public.teams (id) on delete cascade,
  invite_code text,
  mode text not null default 'open' check (mode in ('open', 'moderated')),
  talk_seconds int not null default 60 check (talk_seconds between 10 and 900),
  max_members int not null default 50 check (max_members between 2 and 60),
  -- Söz hakkı bitince sıradaki istekçiye kendiliğinden ver (moderated)
  auto_next boolean not null default false,
  chan_key text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  last_active timestamptz not null default now(),
  check (kind <> 'team' or team_id is not null)
);
alter table public.voice_rooms add column if not exists auto_next boolean not null default false;
create index if not exists voice_rooms_owner on public.voice_rooms (owner);
create index if not exists voice_rooms_team on public.voice_rooms (team_id);
create unique index if not exists voice_rooms_invite on public.voice_rooms (invite_code) where invite_code is not null;
alter table public.voice_rooms enable row level security;
-- Doğrudan okuma yok (kanal anahtarı ve davet kodu gizli): liste ve katılma RPC'lerle

create table if not exists public.voice_room_roles (
  room_id uuid not null references public.voice_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'mod', 'speaker')),
  primary key (room_id, user_id)
);
alter table public.voice_room_roles enable row level security;

create table if not exists public.voice_grants (
  room_id uuid not null references public.voice_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  until timestamptz not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.voice_grants enable row level security;

create table if not exists public.voice_requests (
  room_id uuid not null references public.voice_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.voice_requests enable row level security;

create table if not exists public.voice_bans (
  room_id uuid not null references public.voice_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  until timestamptz,
  by_user uuid references public.profiles (id) on delete set null,
  primary key (room_id, user_id)
);
alter table public.voice_bans enable row level security;

create table if not exists public.voice_sessions (
  session_id text primary key check (char_length(session_id) <= 100),
  room_id uuid not null references public.voice_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  track_name text not null default '' check (char_length(track_name) <= 100),
  last_seen timestamptz not null default now()
);
create index if not exists voice_sessions_room on public.voice_sessions (room_id, last_seen);
create index if not exists voice_sessions_user on public.voice_sessions (user_id);
alter table public.voice_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------------

/** Kullanıcının odadaki yetkisi: owner | admin | mod | speaker | member | null (giremez) */
create or replace function public.voice_role(p_room uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  r public.voice_rooms;
  x text;
begin
  select * into r from public.voice_rooms where id = p_room;
  if r.id is null or p_user is null then
    return null;
  end if;
  if r.owner = p_user then
    return 'owner';
  end if;
  if exists (select 1 from public.voice_bans b where b.room_id = p_room and b.user_id = p_user and (b.until is null or b.until > now())) then
    return null;
  end if;
  select role into x from public.voice_room_roles where room_id = p_room and user_id = p_user;
  if x is not null then
    return x;
  end if;
  -- Takım odasında takım yöneticisi oda yöneticisidir
  if r.kind = 'team' then
    if public.team_role(r.team_id, p_user) in ('owner', 'admin') then
      return 'admin';
    end if;
    if public.team_role(r.team_id, p_user) is null then
      return null;
    end if;
  end if;
  return 'member';
end $$;

create or replace function public.voice_is_mod(p_room uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.voice_role(p_room, p_user) in ('owner', 'admin', 'mod'), false);
$$;

/** Bu kişinin sesi odada iletilebilir mi */
create or replace function public.voice_can_speak(p_room uuid, p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  role text := public.voice_role(p_room, p_user);
  m text;
begin
  if role is null then
    return false;
  end if;
  select mode into m from public.voice_rooms where id = p_room;
  if m = 'open' or role in ('owner', 'admin', 'mod', 'speaker') then
    return true;
  end if;
  return exists (select 1 from public.voice_grants g where g.room_id = p_room and g.user_id = p_user and g.until > now());
end $$;

create or replace function public.voice_member_count(p_room uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct user_id)::int from public.voice_sessions where room_id = p_room and last_seen > now() - interval '90 seconds';
$$;

-- ---------------------------------------------------------------------------
-- Odalar
-- ---------------------------------------------------------------------------

create or replace function public.voice_room_create(p_name text, p_kind text default 'public', p_team uuid default null,
  p_mode text default 'open', p_talk_seconds int default 60, p_max int default 50, p_description text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_id uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if (select count(*) from public.voice_rooms where owner = me) >= 10 then
    raise exception 'En çok 10 oda kurabilirsin';
  end if;
  if p_kind = 'team' and (p_team is null or not public.is_team_admin(p_team)) then
    raise exception 'Takım odasını yalnızca takım yöneticileri kurabilir';
  end if;
  insert into public.voice_rooms (owner, name, description, kind, team_id, invite_code, mode, talk_seconds, max_members)
  values (me, trim(p_name), coalesce(trim(p_description), ''), p_kind, case when p_kind = 'team' then p_team end,
    case when p_kind = 'private' then upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) end,
    p_mode, least(greatest(coalesce(p_talk_seconds, 60), 10), 900), least(greatest(coalesce(p_max, 50), 2), 60))
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.voice_room_update(uuid, text, text, int, int, text);
create or replace function public.voice_room_update(p_room uuid, p_name text, p_mode text, p_talk_seconds int, p_max int,
  p_description text default null, p_auto_next boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.voice_role(p_room, auth.uid()) in ('owner', 'admin'), false) then
    raise exception 'Yetkin yok';
  end if;
  update public.voice_rooms set
    name = coalesce(nullif(trim(p_name), ''), name),
    mode = coalesce(p_mode, mode),
    talk_seconds = least(greatest(coalesce(p_talk_seconds, talk_seconds), 10), 900),
    max_members = least(greatest(coalesce(p_max, max_members), 2), 60),
    description = coalesce(trim(p_description), description),
    auto_next = coalesce(p_auto_next, auto_next)
  where id = p_room;
end $$;

create or replace function public.voice_room_delete(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.voice_rooms where id = p_room and (owner = auth.uid() or public.is_admin())) then
    raise exception 'Odayı yalnızca sahibi silebilir';
  end if;
  delete from public.voice_rooms where id = p_room;
end $$;

/** Yeni davet kodu (eskisi geçersiz olur) */
create or replace function public.voice_room_new_code(p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
begin
  if not coalesce(public.voice_role(p_room, auth.uid()) in ('owner', 'admin'), false) then
    raise exception 'Yetkin yok';
  end if;
  update public.voice_rooms set invite_code = c, kind = 'private' where id = p_room;
  return c;
end $$;

/** Görebildiğim odalar: herkese açık, takımlarımın odaları, sahibi / yetkilisi olduklarım; kişi sayısıyla */
create or replace function public.voice_rooms_list() returns table (
  id uuid, name text, description text, kind text, team_id uuid, team_name text, mode text, talk_seconds int,
  max_members int, owner uuid, owner_name text, members int, my_role text, is_mine boolean
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.kind, r.team_id, t.name, r.mode, r.talk_seconds, r.max_members, r.owner,
         p.display_name, public.voice_member_count(r.id), public.voice_role(r.id, auth.uid()), r.owner = auth.uid()
  from public.voice_rooms r
  left join public.teams t on t.id = r.team_id
  left join public.profiles p on p.id = r.owner
  where auth.uid() is not null
    and (r.kind = 'public'
      or r.owner = auth.uid()
      or exists (select 1 from public.voice_room_roles x where x.room_id = r.id and x.user_id = auth.uid())
      or (r.kind = 'team' and public.is_team_member(r.team_id)))
    and not exists (select 1 from public.voice_bans b where b.room_id = r.id and b.user_id = auth.uid() and (b.until is null or b.until > now()))
  order by public.voice_member_count(r.id) desc, r.last_active desc
  limit 200;
$$;

/** Odaya katıl: yetki, yasak, davet kodu ve kişi sınırı denetlenir; kanal anahtarı ve oda bilgisi döner.
 *  Davet koduyla katılan kişi özel odanın listesinde kalır (speaker değil, üye olarak: rol tablosuna yazılmaz,
 *  bu yüzden özel odaya her girişte kod gerekir; sahibi isterse "speaker" ya da "mod" yapar). */
create or replace function public.voice_room_join(p_room uuid default null, p_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.voice_rooms;
  v_role text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_code is not null and trim(p_code) <> '' then
    select * into r from public.voice_rooms where invite_code = upper(trim(p_code));
  else
    select * into r from public.voice_rooms where id = p_room;
  end if;
  if r.id is null then
    raise exception 'Oda bulunamadı';
  end if;
  v_role := public.voice_role(r.id, me);
  if v_role is null then
    raise exception 'Bu odaya giremezsin';
  end if;
  if r.kind = 'private' and v_role = 'member' and coalesce(upper(trim(p_code)), '') <> coalesce(r.invite_code, '#') then
    raise exception 'Bu oda özel: davet kodu gerekir';
  end if;
  if public.voice_member_count(r.id) >= r.max_members
     and not exists (select 1 from public.voice_sessions s where s.room_id = r.id and s.user_id = me and s.last_seen > now() - interval '90 seconds')
     and v_role = 'member' then
    raise exception 'Oda dolu';
  end if;
  update public.voice_rooms set last_active = now() where id = r.id;
  return jsonb_build_object(
    'id', r.id, 'name', r.name, 'description', r.description, 'kind', r.kind, 'mode', r.mode,
    'talk_seconds', r.talk_seconds, 'max_members', r.max_members, 'owner', r.owner, 'auto_next', r.auto_next,
    'chan', 'voice-' || r.id || '-' || r.chan_key, 'role', v_role,
    'invite_code', case when v_role in ('owner', 'admin') then r.invite_code end
  );
end $$;

/** Oda durumu: söz hakları (bitiş zamanıyla), söz isteme sırası, yetkililer, mod; sunucu saati (geri sayım için) */
create or replace function public.voice_room_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.voice_rooms;
  nxt uuid;
begin
  if public.voice_role(p_room, auth.uid()) is null then
    raise exception 'Bu odaya giremezsin';
  end if;
  select * into r from public.voice_rooms where id = p_room;
  -- Otomatik sıra: kimsenin süreli söz hakkı kalmadıysa sıradaki (odada olan) istekçiye ver. Odadaki herkes bu
  -- işlevi düzenli çağırır; kilit aynı anda iki kişiye verilmesini önler.
  if r.mode = 'moderated' and r.auto_next then
    perform pg_advisory_xact_lock(hashtext('voice_next:' || p_room::text));
    if not exists (select 1 from public.voice_grants g where g.room_id = p_room and g.until > now()) then
      select q.user_id into nxt from public.voice_requests q
      where q.room_id = p_room
        and exists (select 1 from public.voice_sessions s where s.room_id = p_room and s.user_id = q.user_id and s.last_seen > now() - interval '90 seconds')
      order by q.created_at limit 1;
      if nxt is not null then
        insert into public.voice_grants (room_id, user_id, until, granted_by)
        values (p_room, nxt, now() + make_interval(secs => r.talk_seconds), null)
        on conflict (room_id, user_id) do update set until = excluded.until, granted_by = null, granted_at = now();
        delete from public.voice_requests where room_id = p_room and user_id = nxt;
      end if;
    end if;
  end if;
  return jsonb_build_object(
    'now', now(),
    'mode', r.mode,
    'talk_seconds', r.talk_seconds,
    'auto_next', r.auto_next,
    'max_members', r.max_members,
    'description', r.description,
    'name', r.name,
    'grants', coalesce((select jsonb_agg(jsonb_build_object('user_id', g.user_id, 'until', g.until, 'name', p.display_name))
      from public.voice_grants g join public.profiles p on p.id = g.user_id where g.room_id = p_room and g.until > now()), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('user_id', q.user_id, 'at', q.created_at, 'name', p.display_name) order by q.created_at)
      from public.voice_requests q join public.profiles p on p.id = q.user_id where q.room_id = p_room), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'role', x.role, 'name', p.display_name))
      from public.voice_room_roles x join public.profiles p on p.id = x.user_id where x.room_id = p_room), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('user_id', r.owner, 'role', 'owner', 'name', (select display_name from public.profiles where id = r.owner))),
    'my_role', public.voice_role(p_room, auth.uid())
  );
end $$;

-- ---------------------------------------------------------------------------
-- Söz hakkı
-- ---------------------------------------------------------------------------

create or replace function public.voice_request_floor(p_room uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.voice_role(p_room, auth.uid()) is null then
    raise exception 'Bu odaya giremezsin';
  end if;
  if p_on then
    insert into public.voice_requests (room_id, user_id) values (p_room, auth.uid()) on conflict do nothing;
  else
    delete from public.voice_requests where room_id = p_room and user_id = auth.uid();
  end if;
end $$;

/** Söz ver (p_seconds null: odanın varsayılan süresi). İsteği sıradan düşer. */
create or replace function public.voice_grant(p_room uuid, p_user uuid, p_seconds int default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  s int;
  u timestamptz;
begin
  if not public.voice_is_mod(p_room, auth.uid()) then
    raise exception 'Söz vermeye yetkin yok';
  end if;
  if public.voice_role(p_room, p_user) is null then
    raise exception 'Bu kişi odaya giremez';
  end if;
  select coalesce(p_seconds, talk_seconds) into s from public.voice_rooms where id = p_room;
  u := now() + make_interval(secs => least(greatest(s, 5), 3600));
  insert into public.voice_grants (room_id, user_id, until, granted_by) values (p_room, p_user, u, auth.uid())
  on conflict (room_id, user_id) do update set until = excluded.until, granted_by = excluded.granted_by, granted_at = now();
  delete from public.voice_requests where room_id = p_room and user_id = p_user;
  return u;
end $$;

/** Süreyi uzat (süresi bitmişse şimdiden itibaren) */
create or replace function public.voice_extend(p_room uuid, p_user uuid, p_seconds int default 30) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  u timestamptz;
begin
  if not public.voice_is_mod(p_room, auth.uid()) then
    raise exception 'Yetkin yok';
  end if;
  update public.voice_grants set until = greatest(until, now()) + make_interval(secs => least(greatest(p_seconds, 5), 3600))
  where room_id = p_room and user_id = p_user returning until into u;
  if u is null then
    return public.voice_grant(p_room, p_user, p_seconds);
  end if;
  return u;
end $$;

/** Söz hakkını al (p_user null: herkesin) */
create or replace function public.voice_revoke(p_room uuid, p_user uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.voice_is_mod(p_room, auth.uid()) and coalesce(p_user, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid() then
    raise exception 'Yetkin yok';
  end if;
  delete from public.voice_grants where room_id = p_room and (p_user is null or user_id = p_user);
end $$;

/** Söz isteğini sıradan düşür (moderatör) */
create or replace function public.voice_dismiss_request(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.voice_is_mod(p_room, auth.uid()) then
    raise exception 'Yetkin yok';
  end if;
  delete from public.voice_requests where room_id = p_room and user_id = p_user;
end $$;

/** Sıradaki istekçiye söz ver; sıra boşsa null */
create or replace function public.voice_grant_next(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nxt uuid;
begin
  if not public.voice_is_mod(p_room, auth.uid()) then
    raise exception 'Yetkin yok';
  end if;
  select user_id into nxt from public.voice_requests where room_id = p_room order by created_at limit 1;
  if nxt is null then
    return null;
  end if;
  perform public.voice_grant(p_room, nxt, null);
  return nxt;
end $$;

/** Odaya özel yetki ver / al (p_role null: kaldır). admin yalnızca sahip / admin verebilir. */
create or replace function public.voice_set_role(p_room uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  my text := public.voice_role(p_room, auth.uid());
begin
  if my not in ('owner', 'admin') then
    raise exception 'Yetkin yok';
  end if;
  if p_user = (select owner from public.voice_rooms where id = p_room) then
    raise exception 'Oda sahibinin yetkisi değiştirilemez';
  end if;
  if p_role is null then
    delete from public.voice_room_roles where room_id = p_room and user_id = p_user;
  elsif p_role in ('admin', 'mod', 'speaker') then
    insert into public.voice_room_roles (room_id, user_id, role) values (p_room, p_user, p_role)
    on conflict (room_id, user_id) do update set role = excluded.role;
  else
    raise exception 'Geçersiz yetki';
  end if;
end $$;

/** Odadan at (p_minutes null: kalıcı yasak, 0: yasaksız sadece çıkar) */
create or replace function public.voice_kick(p_room uuid, p_user uuid, p_minutes int default 10) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.voice_is_mod(p_room, auth.uid()) then
    raise exception 'Yetkin yok';
  end if;
  if public.voice_role(p_room, p_user) in ('owner', 'admin') then
    raise exception 'Yöneticiler atılamaz';
  end if;
  delete from public.voice_grants where room_id = p_room and user_id = p_user;
  delete from public.voice_requests where room_id = p_room and user_id = p_user;
  delete from public.voice_sessions where room_id = p_room and user_id = p_user;
  if p_minutes is null or p_minutes > 0 then
    insert into public.voice_bans (room_id, user_id, until, by_user)
    values (p_room, p_user, case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end, auth.uid())
    on conflict (room_id, user_id) do update set until = excluded.until, by_user = excluded.by_user;
  end if;
end $$;

create or replace function public.voice_unban(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.voice_is_mod(p_room, auth.uid()) then
    raise exception 'Yetkin yok';
  end if;
  delete from public.voice_bans where room_id = p_room and user_id = p_user;
end $$;

/** Bağlantı işareti (istemci 30 sn'de bir); odadan çıkınca p_leave = true */
create or replace function public.voice_heartbeat(p_room uuid, p_leave boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_leave then
    delete from public.voice_sessions where room_id = p_room and user_id = auth.uid();
    delete from public.voice_requests where room_id = p_room and user_id = auth.uid();
    return false;
  end if;
  if public.voice_role(p_room, auth.uid()) is null then
    delete from public.voice_sessions where room_id = p_room and user_id = auth.uid();
    return false;
  end if;
  update public.voice_sessions set last_seen = now() where room_id = p_room and user_id = auth.uid();
  -- Eski bağlantılar temizlenir
  delete from public.voice_sessions where last_seen < now() - interval '10 minutes';
  return true;
end $$;

revoke all on function public.voice_role(uuid, uuid), public.voice_is_mod(uuid, uuid), public.voice_can_speak(uuid, uuid),
  public.voice_member_count(uuid) from public, anon, authenticated;
-- Edge Function (voice-sfu) servis anahtarıyla çağırır
grant execute on function public.voice_role(uuid, uuid), public.voice_can_speak(uuid, uuid), public.voice_is_mod(uuid, uuid),
  public.voice_member_count(uuid) to service_role;
revoke all on function public.voice_room_create(text, text, uuid, text, int, int, text), public.voice_room_update(uuid, text, text, int, int, text, boolean),
  public.voice_room_delete(uuid), public.voice_room_new_code(uuid), public.voice_rooms_list(), public.voice_room_join(uuid, text),
  public.voice_room_state(uuid), public.voice_request_floor(uuid, boolean), public.voice_grant(uuid, uuid, int),
  public.voice_extend(uuid, uuid, int), public.voice_revoke(uuid, uuid), public.voice_grant_next(uuid), public.voice_dismiss_request(uuid, uuid),
  public.voice_set_role(uuid, uuid, text), public.voice_kick(uuid, uuid, int), public.voice_unban(uuid, uuid),
  public.voice_heartbeat(uuid, boolean) from public, anon;
grant execute on function public.voice_room_create(text, text, uuid, text, int, int, text), public.voice_room_update(uuid, text, text, int, int, text, boolean),
  public.voice_room_delete(uuid), public.voice_room_new_code(uuid), public.voice_rooms_list(), public.voice_room_join(uuid, text),
  public.voice_room_state(uuid), public.voice_request_floor(uuid, boolean), public.voice_grant(uuid, uuid, int),
  public.voice_extend(uuid, uuid, int), public.voice_revoke(uuid, uuid), public.voice_grant_next(uuid), public.voice_dismiss_request(uuid, uuid),
  public.voice_set_role(uuid, uuid, text), public.voice_kick(uuid, uuid, int), public.voice_unban(uuid, uuid),
  public.voice_heartbeat(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
