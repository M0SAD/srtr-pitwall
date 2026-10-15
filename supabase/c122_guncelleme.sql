-- c122: Ses odaları arasında üye taşıma (Discord'daki gibi sürükle-bırak).
--   * voice_move(kişi, hedef oda): kişinin şu an bulunduğu odada ve hedef odada yönetici / moderatör olan taşıyabilir
--     (site yöneticileri ve Ses Odası Moderatörleri her yerde). Oda sahibi / yöneticisi yalnızca site yöneticisi taşır.
--   * Taşıma kaydı voice_moves'a yazılır; taşınan kişinin uygulaması bunu Realtime ile görür ve hedef odaya geçer.
--     Kayıt sadece taşınan kişiye görünür, 2 dakika geçerlidir; özel odalarda davet kodu ve oda doluluğu aranmaz.

create table if not exists public.voice_moves (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  from_room uuid references public.voice_rooms (id) on delete set null,
  to_room uuid not null references public.voice_rooms (id) on delete cascade,
  by_user uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.voice_moves enable row level security;
drop policy if exists "voice moves own" on public.voice_moves;
create policy "voice moves own" on public.voice_moves for select using (user_id = auth.uid());
grant select on public.voice_moves to authenticated;
grant all on public.voice_moves to service_role;

do $$
begin
  alter publication supabase_realtime add table public.voice_moves;
exception when others then null;
end $$;

create or replace function public.voice_move(p_user uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_src uuid;
  v_role text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select s.room_id into v_src from public.voice_sessions s
   where s.user_id = p_user and s.last_seen > now() - interval '90 seconds'
   order by s.last_seen desc limit 1;
  if v_src is null then
    raise exception 'Bu kişi şu an bir ses odasında değil';
  end if;
  if v_src = p_to then
    raise exception 'Zaten bu odada';
  end if;
  if not exists (select 1 from public.voice_rooms where id = p_to) then
    raise exception 'Oda bulunamadı';
  end if;
  if p_user <> me then
    if coalesce(public.voice_role(v_src, me), '') not in ('owner', 'admin', 'mod')
       or coalesce(public.voice_role(p_to, me), '') not in ('owner', 'admin', 'mod') then
      raise exception 'Bu kişiyi taşıma yetkin yok (iki odada da yönetici ya da moderatör olmalısın)';
    end if;
    v_role := public.voice_role(v_src, p_user);
    if v_role in ('owner', 'admin') and not public.is_admin() then
      raise exception 'Oda sahibini ya da yöneticisini sadece site yöneticisi taşıyabilir';
    end if;
  end if;
  if public.voice_role(p_to, p_user) is null then
    raise exception 'Bu kişi o odaya giremez (PRO''ya özel oda ya da odadan uzaklaştırılmış)';
  end if;
  insert into public.voice_moves (user_id, from_room, to_room, by_user, created_at)
  values (p_user, v_src, p_to, me, now())
  on conflict (user_id) do update set from_room = excluded.from_room, to_room = excluded.to_room, by_user = excluded.by_user, created_at = now();
end $$;

/** Taşıyanın adı (bildirim için) */
create or replace function public.voice_my_move() returns table (to_room uuid, room_name text, by_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.to_room, r.name, p.display_name, m.created_at
  from public.voice_moves m
  join public.voice_rooms r on r.id = m.to_room
  left join public.profiles p on p.id = m.by_user
  where m.user_id = auth.uid() and m.created_at > now() - interval '2 minutes';
$$;

-- Katılma: geçerli bir taşıma kaydı varsa özel oda kodu ve doluluk aranmaz (kayıt kullanılınca silinir)
create or replace function public.voice_room_join(p_room uuid default null, p_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.voice_rooms;
  v_role text;
  v_moved boolean := false;
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
  delete from public.voice_moves m where m.user_id = me and m.to_room = r.id and m.created_at > now() - interval '2 minutes';
  v_moved := found;
  if not v_moved and r.kind = 'private' and v_role = 'member' and coalesce(upper(trim(p_code)), '') <> coalesce(r.invite_code, '#') then
    raise exception 'Bu oda özel: davet kodu gerekir';
  end if;
  if not v_moved and public.voice_member_count(r.id) >= r.max_members
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

-- Eski taşıma kayıtları temizlenir (5 dk'da bir çalışan temizlikle)
create or replace function public.voice_rooms_cleanup() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from public.voice_rooms r where public.voice_room_expired(r);
  get diagnostics n = row_count;
  delete from public.voice_messages where created_at < now() - interval '7 days';
  delete from public.voice_moves where created_at < now() - interval '10 minutes';
  return n;
end $$;

grant execute on function public.voice_move(uuid, uuid), public.voice_my_move() to authenticated;

notify pgrst, 'reload schema';
