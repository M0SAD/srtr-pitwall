-- ---------------------------------------------------------------------------
-- c36: Takımın oyunu (sim) ve takım sayfasında "Son aktiviteler".
--      1) teams.sim: takımın hangi oyun için kurulduğu (iracing | acc | ac | lmu | rf2 | ams2 | multi = birden fazla oyun).
--         Varsayılan iracing; eski takımlar iracing olur. Kurarken seçilir, takım ayarlarından değiştirilir.
--         team_create / team_update sona p_sim parametresi alır (eski imzalar kaldırılıp yenileri oluşturulur):
--           team_create(..., p_sim default 'iracing'), team_update(..., p_sim default null = değiştirme).
--         teams_search sim döner ve isteğe bağlı p_sim süzgeci alır (dönüş tipi değiştiği için düşürülüp yeniden kurulur).
--         team_profile sim döner.
--      2) team_activity(takım, adet): takım üyelerinin son telemetri oturumları (akış). Herkes çağırabilir ama sadece
--         telemetrisi çağırana görünen (telemetry_visible: kendisi, telemetrisi açık olan ya da aynı takımdaki) üyeler
--         listelenir; takım üyeleri birbirini her zaman görür. Takımın oyunu 'multi' değilse sadece o oyunun oturumları.
--         Her satır: üye adı + fotoğraf yolu, sim, pist/düzen, araç, oturum türü, tur sayısı, en iyi tur, zamanlar,
--         oturum id ve kişisel en iyi (is_pb: oturumun en iyi turu üyenin o pist+araç için en iyisi).
-- Sıra: c29, c30 ve c31'den sonra.
-- ---------------------------------------------------------------------------

-- 1) Takımın oyunu ------------------------------------------------------------------
alter table public.teams add column if not exists sim text not null default 'iracing';
update public.teams set sim = 'iracing' where sim is null or sim = '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_sim_check' and conrelid = 'public.teams'::regclass) then
    alter table public.teams add constraint teams_sim_check check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi'));
  end if;
end $$;
create index if not exists teams_sim on public.teams (sim);

drop function if exists public.team_create(text, text, text, text, text, text);
create or replace function public.team_create(p_name text, p_tag text, p_description text default '',
  p_color text default '#4ea1ff', p_logo text default '', p_join_mode text default 'request', p_sim text default 'iracing') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
  v_sim text := coalesce(nullif(trim(p_sim), ''), 'iracing');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi') then
    raise exception 'Geçersiz oyun';
  end if;
  if (select count(*) from public.teams where owner = me) >= 3 then
    raise exception 'En fazla 3 takım kurabilirsin';
  end if;
  if (select count(*) from public.team_members where user_id = me) >= 10 then
    raise exception 'En fazla 10 takımda olabilirsin';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name)) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  insert into public.teams (name, tag, description, color, logo_path, join_mode, owner, sim)
    values (v_name, v_tag, left(trim(coalesce(p_description, '')), 1000), p_color, coalesce(p_logo, ''), p_join_mode, me, v_sim)
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.team_chat_state (team_id, user_id) values (tid, me);
  return tid;
end $$;

drop function if exists public.team_update(uuid, text, text, text, text, text, text);
create or replace function public.team_update(p_team uuid, p_name text, p_tag text, p_description text,
  p_color text, p_logo text, p_join_mode text, p_sim text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
  v_sim text := nullif(trim(coalesce(p_sim, '')), '');
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri düzenleyebilir';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if v_sim is not null and v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi') then
    raise exception 'Geçersiz oyun';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name) and id <> p_team) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag and id <> p_team) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  -- p_sim verilmezse (eski programlar) oyun değişmez
  update public.teams set name = v_name, tag = v_tag, description = left(trim(coalesce(p_description, '')), 1000),
    color = p_color, logo_path = coalesce(p_logo, ''), join_mode = p_join_mode, sim = coalesce(v_sim, sim), updated_at = now()
    where id = p_team;
end $$;

-- Takım listesi / arama (herkese açık): sim döner, p_sim ile süzülür ('' ya da null = hepsi)
drop function if exists public.teams_search(text, int);
drop function if exists public.teams_search(text, int, text);
create or replace function public.teams_search(p_q text default '', p_limit int default 60, p_sim text default '')
returns table (id uuid, name text, tag text, description text, color text, logo_path text, join_mode text,
               owner_name text, member_count int, created_at timestamptz, my_role text, my_invite text, sim text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.tag, t.description, t.color, t.logo_path, t.join_mode,
         coalesce(o.display_name, '?'),
         (select count(*)::int from public.team_members c where c.team_id = t.id) as members,
         t.created_at,
         public.team_role(t.id, auth.uid()),
         (select i.kind from public.team_invites i where i.team_id = t.id and i.user_id = auth.uid()),
         t.sim
  from public.teams t
  left join public.profiles o on o.id = t.owner
  where (coalesce(trim(p_q), '') = ''
         or t.name ilike '%' || trim(p_q) || '%' or t.tag ilike '%' || trim(p_q) || '%')
    and (coalesce(trim(p_sim), '') = '' or t.sim = trim(p_sim))
  order by members desc, t.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Takım profili: c30'daki hali + sim
create or replace function public.team_profile(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t public.teams;
  r text := public.team_role(p_team, auth.uid());
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'tag', t.tag, 'description', t.description, 'color', t.color, 'logo_path', t.logo_path,
    'join_mode', t.join_mode, 'owner', t.owner, 'created_at', t.created_at, 'sim', t.sim,
    'owner_name', coalesce((select display_name from public.profiles where id = t.owner), '?'),
    'pinned_post', case when r is not null then t.pinned_post end,
    'my_role', r,
    'my_invite', (select jsonb_build_object('id', i.id, 'kind', i.kind) from public.team_invites i
                  where i.team_id = t.id and i.user_id = auth.uid()),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', coalesce(p.display_name, '?'),
               'iracing_name', p.iracing_name, 'role', m.role, 'joined_at', m.joined_at)
             order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(coalesce(p.display_name, '')))
      from public.team_members m left join public.profiles p on p.id = m.user_id
      where m.team_id = t.id), '[]'::jsonb),
    'pending', case when r in ('owner', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'user_id', i.user_id, 'display_name', coalesce(p.display_name, '?'),
               'kind', i.kind, 'created_at', i.created_at) order by i.created_at desc)
      from public.team_invites i left join public.profiles p on p.id = i.user_id
      where i.team_id = t.id), '[]'::jsonb) end);
end $$;

-- 2) Son aktiviteler ------------------------------------------------------------------
create or replace function public.team_activity(p_team uuid, p_limit int default 30)
returns table (session_id uuid, user_id uuid, display_name text, avatar_path text, sim text, track_name text,
               track_config text, car_name text, session_type text, laps int, best_lap real,
               started_at timestamptz, last_lap_at timestamptz, is_pb boolean)
language sql stable security definer set search_path = public as $$
  with tm as (
    select t.sim from public.teams t where t.id = p_team
  ),
  mem as (
    -- Sadece telemetrisi çağırana görünen üyeler (takım arkadaşları birbirini her zaman görür)
    select m.user_id from public.team_members m
    where m.team_id = p_team and public.telemetry_visible(m.user_id)
  ),
  ss as (
    select s.* from public.telemetry_sessions s
    join mem on mem.user_id = s.user_id
    cross join tm
    where s.laps > 0 and (tm.sim = 'multi' or s.sim = tm.sim)
    order by s.last_lap_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select ss.id, ss.user_id, coalesce(p.display_name, '?'), p.avatar_path, ss.sim, ss.track_name, ss.track_config,
         ss.car_name, ss.session_type, ss.laps, ss.best_lap, ss.started_at, ss.last_lap_at,
         coalesce(ss.best_lap is not null and ss.best_lap <= (
           select min(l.lap_time) from public.telemetry_laps l
           where l.user_id = ss.user_id and l.sim = ss.sim and l.track_id = ss.track_id
             and l.track_config = ss.track_config and l.car_id = ss.car_id and l.valid and not l.pit), false)
  from ss
  left join public.profiles p on p.id = ss.user_id
  order by ss.last_lap_at desc;
$$;

-- Yetkiler -----------------------------------------------------------------------------
revoke all on function public.team_create(text, text, text, text, text, text, text),
  public.team_update(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.team_create(text, text, text, text, text, text, text),
  public.team_update(uuid, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.teams_search(text, int, text), public.team_profile(uuid), public.team_activity(uuid, int)
  to anon, authenticated, service_role;
