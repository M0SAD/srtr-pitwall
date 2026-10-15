-- c119: Ses odaları: kategoriler, oda simgesi, sadece PRO odalar, Ses Odası Moderatörleri, arkadaş daveti.
--   * voice_categories: yöneticinin açtığı kategoriler (sırası değiştirilebilir). Yönetici odalarını bir kategoriye koyar;
--     PRO üyelerin odaları kategorisizdir ve "Özel odalar" altında görünür.
--   * voice_rooms.icon: simge ("i:<ad>" uygulamadaki simge listesinden ya da bir emoji).
--   * voice_rooms.pro_only: sadece PRO üyeler girebilir (yöneticiler, moderatörler ve oda yetkilileri hariç).
--   * voice_moderators: "Ses Odası Moderatörü" — bütün odalarda söz verir / alır, sırayı yönetir, çıkarır.
--   * Site yöneticileri her odada yöneticidir.
--   * voice_invite: odadaki kişi arkadaşını davet eder (mesaj olarak gider; özel odada davet kodu da eklenir).

create table if not exists public.voice_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.voice_categories enable row level security;
drop policy if exists "voice categories readable" on public.voice_categories;
create policy "voice categories readable" on public.voice_categories for select using (true);
grant select on public.voice_categories to anon, authenticated;

alter table public.voice_rooms add column if not exists category_id uuid references public.voice_categories (id) on delete set null;
alter table public.voice_rooms add column if not exists icon text not null default '';
alter table public.voice_rooms drop constraint if exists voice_rooms_icon_check;
alter table public.voice_rooms add constraint voice_rooms_icon_check check (char_length(icon) <= 40);
alter table public.voice_rooms add column if not exists pro_only boolean not null default false;

create table if not exists public.voice_moderators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.voice_moderators enable row level security;

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
  -- Site yöneticileri her odada yöneticidir (c119)
  if coalesce((select is_admin from public.profiles where id = p_user), false) then
    return 'admin';
  end if;
  if exists (select 1 from public.voice_bans b where b.room_id = p_room and b.user_id = p_user and (b.until is null or b.until > now())) then
    return null;
  end if;
  select role into x from public.voice_room_roles where room_id = p_room and user_id = p_user;
  if x is not null then
    return x;
  end if;
  -- Ses Odası Moderatörü (bütün odalarda söz verir, c119)
  if exists (select 1 from public.voice_moderators m where m.user_id = p_user) then
    return 'mod';
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
  -- Sadece PRO üyelerin girebildiği oda (c119)
  if r.pro_only and not public.user_is_pro(p_user) then
    return null;
  end if;
  return 'member';
end $$;

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
    if r.pro_only and not public.user_is_pro(me) then
      raise exception 'Bu oda PRO üyelere özel';
    end if;
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
    'chan', 'voice-' || r.id || '-' || r.chan_key, 'role', v_role, 'icon', r.icon, 'pro_only', r.pro_only,
    'invite_code', case when v_role in ('owner', 'admin') then r.invite_code end
  );
end $$;

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
    -- Yetkililer: oda rolleri, oda sahibi ve odadaki yöneticiler / Ses Odası Moderatörleri (c119)
    'roles', coalesce((select jsonb_agg(jsonb_build_object('user_id', u.uid, 'role', u.role, 'name', p.display_name))
      from (select x.uid, public.voice_role(p_room, x.uid) as role from (
              select user_id as uid from public.voice_room_roles where room_id = p_room
              union select s.user_id from public.voice_sessions s where s.room_id = p_room and s.last_seen > now() - interval '90 seconds'
              union select r.owner) x) u
      join public.profiles p on p.id = u.uid
      where u.role in ('owner', 'admin', 'mod', 'speaker')), '[]'::jsonb),
    'my_role', public.voice_role(p_room, auth.uid())
  );
end $$;

drop function if exists public.voice_room_create(text, text, uuid, text, int, int, text);
create or replace function public.voice_room_create(p_name text, p_kind text default 'public', p_team uuid default null,
  p_mode text default 'open', p_talk_seconds int default 60, p_max int default 50, p_description text default '',
  p_category uuid default null, p_icon text default '', p_pro_only boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_id uuid;
  v_who text;
  v_adm boolean := public.is_admin();
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  -- Oda kurma izni (app_config.voice_create): admin = sadece site yöneticileri, pro = PRO üyeler (varsayılan),
  -- team = PRO üyeler + takım odası için takım yöneticileri, all = herkes. Yöneticiler her zaman kurar.
  v_who := coalesce((select voice_create from public.app_config where id = 1), 'pro');
  if not v_adm then
    if v_who = 'admin'
       or (v_who = 'pro' and not public.is_pro())
       or (v_who = 'team' and not public.is_pro() and not (p_kind = 'team' and p_team is not null and public.is_team_admin(p_team))) then
      raise exception '%', case when v_who = 'admin' then 'Ses odalarını yalnızca yöneticiler kurabilir'
        else 'Ses odası kurmak PRO üyelere özel' end;
    end if;
  end if;
  perform public.voice_rooms_cleanup();
  if (select count(*) from public.voice_rooms where owner = me) >= 10 and not v_adm then
    raise exception 'En çok 10 oda kurabilirsin';
  end if;
  if p_kind = 'team' and (p_team is null or not public.is_team_admin(p_team)) then
    raise exception 'Takım odasını yalnızca takım yöneticileri kurabilir';
  end if;
  insert into public.voice_rooms (owner, name, description, kind, team_id, invite_code, mode, talk_seconds, max_members, auto_delete,
    category_id, icon, pro_only)
  values (me, trim(p_name), coalesce(trim(p_description), ''), p_kind, case when p_kind = 'team' then p_team end,
    case when p_kind = 'private' then upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) end,
    p_mode, least(greatest(coalesce(p_talk_seconds, 60), 10), 900), least(greatest(coalesce(p_max, 50), 2), 60), not v_adm,
    case when v_adm then p_category end, left(coalesce(trim(p_icon), ''), 40), coalesce(p_pro_only, false))
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.voice_rooms_list();
create or replace function public.voice_rooms_list() returns table (
  id uuid, name text, description text, kind text, team_id uuid, team_name text, mode text, talk_seconds int,
  max_members int, owner uuid, owner_name text, members int, my_role text, is_mine boolean, auto_delete boolean, category_id uuid, icon text, pro_only boolean, can_enter boolean
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.kind, r.team_id, t.name, r.mode, r.talk_seconds, r.max_members, r.owner,
         p.display_name, public.voice_member_count(r.id), public.voice_role(r.id, auth.uid()), r.owner = auth.uid(), r.auto_delete, r.category_id, r.icon, r.pro_only, public.voice_role(r.id, auth.uid()) is not null
  from public.voice_rooms r
  left join public.teams t on t.id = r.team_id
  left join public.profiles p on p.id = r.owner
  where auth.uid() is not null
    and (r.kind = 'public'
      or r.owner = auth.uid()
      or exists (select 1 from public.voice_room_roles x where x.room_id = r.id and x.user_id = auth.uid())
      or (r.kind = 'team' and public.is_team_member(r.team_id)))
    and not public.voice_room_expired(r)
    and not exists (select 1 from public.voice_bans b where b.room_id = r.id and b.user_id = auth.uid() and (b.until is null or b.until > now()))
  order by public.voice_member_count(r.id) desc, r.last_active desc
  limit 200;
$$;

/** Oda simgesi / kategori / PRO'ya özel (kategori sadece site yöneticisi; diğerleri oda sahibi ya da oda yöneticisi) */
create or replace function public.voice_room_meta(p_room uuid, p_icon text default null, p_pro_only boolean default null,
  p_category uuid default null, p_set_category boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.voice_role(p_room, auth.uid()) in ('owner', 'admin'), false) then
    raise exception 'Yetkin yok';
  end if;
  if p_set_category and not public.is_admin() then
    raise exception 'Kategoriyi yalnızca yöneticiler değiştirebilir';
  end if;
  update public.voice_rooms set
    icon = coalesce(left(trim(p_icon), 40), icon),
    pro_only = coalesce(p_pro_only, pro_only),
    category_id = case when p_set_category then p_category else category_id end,
    -- Yöneticinin kategoriye koyduğu oda kalıcıdır
    auto_delete = case when p_set_category and p_category is not null then false else auto_delete end
  where id = p_room;
end $$;

-- ---- Kategoriler (yönetici)
create or replace function public.voice_category_save(p_id uuid, p_name text, p_sort int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid;
begin
  if not public.is_admin() then
    raise exception 'Yetkin yok';
  end if;
  if p_id is null then
    insert into public.voice_categories (name, sort)
    values (trim(p_name), coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.voice_categories)))
    returning id into v;
  else
    update public.voice_categories set name = coalesce(nullif(trim(p_name), ''), name), sort = coalesce(p_sort, sort)
    where id = p_id returning id into v;
  end if;
  return v;
end $$;

create or replace function public.voice_category_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkin yok';
  end if;
  delete from public.voice_categories where id = p_id;
end $$;

-- ---- Ses Odası Moderatörleri (yönetici atar)
create or replace function public.voice_mod_set(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkin yok';
  end if;
  if p_on then
    insert into public.voice_moderators (user_id, added_by) values (p_user, auth.uid()) on conflict do nothing;
  else
    delete from public.voice_moderators where user_id = p_user;
  end if;
end $$;

create or replace function public.voice_mods_list() returns table (user_id uuid, name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, m.created_at
  from public.voice_moderators m join public.profiles p on p.id = m.user_id
  where auth.uid() is not null
  order by p.display_name;
$$;

-- ---- Arkadaşı odaya davet et: mesaj olarak gider (meta.t = 'voice'); özel odada davet kodu da eklenir
create or replace function public.voice_invite(p_room uuid, p_to uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.voice_rooms;
  mid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into r from public.voice_rooms where id = p_room;
  if r.id is null or public.voice_role(p_room, me) is null then
    raise exception 'Oda bulunamadı';
  end if;
  if not public.are_friends(me, p_to) then
    raise exception 'Sadece arkadaşlarını davet edebilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_to and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_to), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.messages (sender, recipient, body, meta)
  values (me, p_to, '🎧 ' || r.name, jsonb_build_object('t', 'voice', 'room', r.id, 'name', r.name,
    'code', case when r.kind = 'private' then r.invite_code end, 'pro_only', r.pro_only))
  returning id into mid;
  return mid;
end $$;

revoke all on function public.voice_room_meta(uuid, text, boolean, uuid, boolean), public.voice_category_save(uuid, text, int),
  public.voice_category_delete(uuid), public.voice_mod_set(uuid, boolean), public.voice_mods_list(), public.voice_invite(uuid, uuid),
  public.voice_room_create(text, text, uuid, text, int, int, text, uuid, text, boolean), public.voice_rooms_list() from public, anon;
grant execute on function public.voice_room_meta(uuid, text, boolean, uuid, boolean), public.voice_category_save(uuid, text, int),
  public.voice_category_delete(uuid), public.voice_mod_set(uuid, boolean), public.voice_mods_list(), public.voice_invite(uuid, uuid),
  public.voice_room_create(text, text, uuid, text, int, int, text, uuid, text, boolean), public.voice_rooms_list() to authenticated;

notify pgrst, 'reload schema';
