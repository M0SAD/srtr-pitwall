-- ---------------------------------------------------------------------------
-- c111: Telemetri turlarında setup adı (turun hangi setup'la atıldığı; iRacing DriverSetupName).
-- telemetry_laps.setup_name; telemetry_record_lap kaydeder; oturum ayrıntısı, en iyiler, karşılaştırma ve
-- pist+araç tur listesi döndürür. Eski turlarda boş (null) kalır.
alter table public.telemetry_laps add column if not exists setup_name text;
do $c111$ begin
  alter table public.telemetry_laps add constraint telemetry_laps_setup_len check (setup_name is null or char_length(setup_name) <= 200);
exception when duplicate_object then null;
end $c111$;

create or replace function public.telemetry_record_lap(p_lap jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_sim text := coalesce(p_lap->>'sim', '');
  v_local text := left(coalesce(p_lap->>'session_local', ''), 120);
  v_lap_local text := left(coalesce(p_lap->>'id', ''), 140);
  v_time real;
  v_valid boolean := coalesce((p_lap->>'valid')::boolean, false);
  v_pit boolean := coalesce((p_lap->>'pit')::boolean, false);
  v_has_trace boolean := coalesce((p_lap->>'has_trace')::boolean, false);
  v_type text := coalesce(p_lap->>'session_type', 'other');
  v_started timestamptz;
  v_ts timestamptz;
  v_sectors real[];
  v_sess uuid;
  v_lap uuid;
  v_new boolean;
  v_best real;
  v_path text;
  v_remove text[] := '{}';
  v_pb boolean := false;
  v_track text := left(coalesce(p_lap->>'track_id', ''), 120);
  v_config text := left(coalesce(p_lap->>'track_config', ''), 160);
  v_car text := left(coalesce(p_lap->>'car_id', ''), 120);
  v_name text := left(btrim(coalesce(p_lap->>'driver_name', '')), 80);
  v_sim_id text := left(btrim(coalesce(p_lap->>'driver_id', '')), 40);
  v_setup text := nullif(left(btrim(coalesce(p_lap->>'setup_name', '')), 200), '');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('telemetry.record', false) and not public.is_pro() then
    raise exception 'Telemetri yüklemek PRO üyelik gerektirir';
  end if;
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2') or v_local = '' or v_lap_local = '' then
    raise exception 'Geçersiz tur';
  end if;
  v_time := (p_lap->>'lap_time')::real;
  if v_time is null or v_time <= 1 or v_time >= 3600 then
    raise exception 'Geçersiz tur süresi';
  end if;
  if v_type not in ('practice', 'qualify', 'race', 'warmup', 'hotlap', 'other') then
    v_type := 'other';
  end if;
  -- Kötüye kullanım sınırı: günde en fazla 5000 tur
  if (select count(*) from public.telemetry_laps where user_id = me and created_at > now() - interval '1 day') >= 5000 then
    raise exception 'Günlük tur sınırına ulaşıldı';
  end if;
  v_started := to_timestamp(coalesce(nullif(p_lap->>'session_started', '')::bigint, 0) / 1000.0);
  v_ts := to_timestamp(coalesce(nullif(p_lap->>'ts', '')::bigint, 0) / 1000.0);
  if v_ts < now() - interval '2 years' or v_ts > now() + interval '1 day' then
    v_ts := now();
  end if;
  if v_started < now() - interval '2 years' or v_started > now() + interval '1 day' then
    v_started := v_ts;
  end if;
  select coalesce(array_agg(x::real), '{}') into v_sectors
  from (select jsonb_array_elements_text(case when jsonb_typeof(p_lap->'sectors') = 'array' then p_lap->'sectors' else '[]'::jsonb end) x limit 3) s;

  insert into public.telemetry_sessions as t (user_id, local_id, sim, track_id, track_name, track_config, track_length_km,
      car_id, car_name, car_class, session_type, session_kind, driver_name, driver_id, started_at, last_lap_at)
  values (me, v_local, v_sim, v_track, left(coalesce(p_lap->>'track_name', ''), 160), v_config,
      greatest(coalesce((p_lap->>'track_length_km')::real, 0), 0), v_car, left(coalesce(p_lap->>'car_name', ''), 160),
      left(coalesce(p_lap->>'car_class', ''), 80), v_type, left(coalesce(p_lap->>'session_kind', ''), 60),
      v_name, v_sim_id, v_started, v_ts)
  on conflict (user_id, local_id) do update
    set last_lap_at = greatest(t.last_lap_at, excluded.last_lap_at),
        driver_name = case when excluded.driver_name <> '' then excluded.driver_name else t.driver_name end,
        driver_id = case when excluded.driver_id <> '' then excluded.driver_id else t.driver_id end
  returning id into v_sess;

  insert into public.telemetry_laps as l (session_id, user_id, local_id, sim, track_id, track_config, car_id, lap, lap_time,
      sectors, valid, pit, off_track, sim_invalid, incidents, fuel_used, air_temp, track_temp, wetness, precip,
      position, class_position, driven_at, setup_name)
  values (v_sess, me, v_lap_local, v_sim, v_track, v_config, v_car, coalesce((p_lap->>'lap')::int, 0), v_time,
      v_sectors, v_valid, v_pit, coalesce((p_lap->>'off_track')::boolean, false),
      coalesce((p_lap->>'sim_invalid')::boolean, false), greatest(coalesce((p_lap->>'incidents')::int, 0), 0),
      nullif((p_lap->>'fuel_used')::real, 0), (p_lap->>'air_temp')::real, (p_lap->>'track_temp')::real,
      (p_lap->>'wetness')::int, (p_lap->>'precip')::real, nullif((p_lap->>'position')::int, 0),
      nullif((p_lap->>'class_position')::int, 0), v_ts, v_setup)
  on conflict (user_id, local_id) do update
    set lap_time = excluded.lap_time, sectors = excluded.sectors, valid = excluded.valid, pit = excluded.pit,
        off_track = excluded.off_track, sim_invalid = excluded.sim_invalid, incidents = excluded.incidents,
        setup_name = coalesce(excluded.setup_name, l.setup_name)
  returning id, (xmax = 0) into v_lap, v_new;

  -- İz: oturumun yeni en iyi geçerli turu ise saklanır, oturumdaki eski izler silinir
  if v_valid and not v_pit then
    select min(lap_time) into v_best from public.telemetry_laps
    where session_id = v_sess and valid and not pit and id <> v_lap;
    if v_has_trace and (v_best is null or v_time < v_best
        or (v_time = v_best and not exists (select 1 from public.telemetry_laps
              where session_id = v_sess and id <> v_lap and trace_path is not null))) then
      v_path := me::text || '/' || v_lap::text || '.json.gz';
      select coalesce(array_agg(trace_path), '{}') into v_remove from public.telemetry_laps
      where session_id = v_sess and id <> v_lap and trace_path is not null;
      update public.telemetry_laps set trace_path = null
      where session_id = v_sess and id <> v_lap and trace_path is not null;
      update public.telemetry_laps set trace_path = v_path where id = v_lap;
    end if;
    v_pb := not exists (select 1 from public.telemetry_laps
      where user_id = me and sim = v_sim and track_id = v_track and track_config = v_config and car_id = v_car
        and valid and not pit and id <> v_lap and lap_time <= v_time);
  end if;

  -- Oturum özeti
  update public.telemetry_sessions s set
    laps = x.n, valid_laps = x.nv, invalid_laps = x.n - x.nv, incidents = x.inc,
    best_lap = x.best, best_lap_id = x.best_id,
    distance_km = x.n * s.track_length_km, drive_time = x.dt,
    air_temp = coalesce((p_lap->>'air_temp')::real, s.air_temp),
    track_temp = coalesce((p_lap->>'track_temp')::real, s.track_temp),
    wetness = coalesce((p_lap->>'wetness')::int, s.wetness)
  from (
    select count(*)::int n, count(*) filter (where valid)::int nv, coalesce(sum(incidents), 0)::int inc,
           min(lap_time) filter (where valid and not pit) best,
           (array_agg(id order by lap_time) filter (where valid and not pit))[1] best_id,
           coalesce(sum(lap_time), 0)::real dt
    from public.telemetry_laps where session_id = v_sess
  ) x
  where s.id = v_sess;

  -- Simdeki kimlik
  if v_name <> '' then
    insert into public.driver_identities as d (user_id, sim, sim_name, sim_id, laps)
    values (me, v_sim, v_name, v_sim_id, 1)
    on conflict (user_id, sim) do update
      set sim_name = excluded.sim_name,
          sim_id = case when excluded.sim_id <> '' then excluded.sim_id else d.sim_id end,
          last_seen = now(),
          laps = d.laps + case when v_new then 1 else 0 end;
  end if;

  return jsonb_build_object('lap_id', v_lap, 'session_id', v_sess, 'trace_path', v_path,
    'remove', to_jsonb(v_remove), 'pb', v_pb, 'new', v_new);
end $$;

create or replace function public.telemetry_overview(p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_prof jsonb;
begin
  if v_user is null then
    raise exception 'Kullanıcı yok';
  end if;
  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'telemetry_public', p.telemetry_public,
           'is_me', p.id = auth.uid(),
           'friend', (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id))
    into v_prof from public.profiles p where p.id = v_user;
  if v_prof is null then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if not public.telemetry_visible(v_user) then
    return jsonb_build_object('profile', v_prof, 'visible', false,
      'identities', (select coalesce(jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name) order by d.last_seen desc), '[]')
                     from public.driver_identities d where d.user_id = v_user));
  end if;
  return jsonb_build_object(
    'profile', v_prof,
    'visible', true,
    'totals', (select jsonb_build_object(
        'sessions', count(*), 'laps', coalesce(sum(s.laps), 0), 'valid_laps', coalesce(sum(s.valid_laps), 0),
        'incidents', coalesce(sum(s.incidents), 0), 'distance_km', round(coalesce(sum(s.distance_km), 0)::numeric, 1),
        'drive_time', round(coalesce(sum(s.drive_time), 0)::numeric), 'tracks', count(distinct (s.sim, s.track_id, s.track_config)),
        'cars', count(distinct (s.sim, s.car_id)), 'first', min(s.started_at), 'last', max(s.last_lap_at))
      from public.telemetry_sessions s where s.user_id = v_user and s.laps > 0),
    'sims', (select coalesce(jsonb_agg(jsonb_build_object('sim', x.sim, 'laps', x.laps, 'sessions', x.n) order by x.laps desc), '[]')
      from (select s.sim, sum(s.laps)::int laps, count(*)::int n from public.telemetry_sessions s
            where s.user_id = v_user and s.laps > 0 group by s.sim) x),
    'identities', (select coalesce(jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name, 'sim_id', d.sim_id,
        'laps', d.laps, 'first_seen', d.first_seen, 'last_seen', d.last_seen) order by d.last_seen desc), '[]')
      from public.driver_identities d where d.user_id = v_user),
    'bests', (select coalesce(jsonb_agg(b.j order by b.driven_at desc), '[]') from (
        select distinct on (l.sim, l.track_id, l.track_config, l.car_id)
          l.driven_at,
          jsonb_build_object('lap_id', l.id, 'session_id', l.session_id, 'sim', l.sim, 'track_id', l.track_id,
            'track_config', l.track_config, 'car_id', l.car_id, 'track_name', s.track_name, 'car_name', s.car_name,
            'car_class', s.car_class, 'lap_time', l.lap_time, 'sectors', l.sectors, 'driven_at', l.driven_at,
            'has_trace', l.trace_path is not null, 'setup_name', l.setup_name,
            'laps', (select count(*) from public.telemetry_laps z where z.user_id = v_user and z.sim = l.sim
                     and z.track_id = l.track_id and z.track_config = l.track_config and z.car_id = l.car_id)) j
        from public.telemetry_laps l join public.telemetry_sessions s on s.id = l.session_id
        where l.user_id = v_user and l.valid and not l.pit
        order by l.sim, l.track_id, l.track_config, l.car_id, l.lap_time, l.driven_at
      ) b),
    'recent', (select coalesce(jsonb_agg(public.telemetry_session_json(s) order by s.started_at desc), '[]')
      from (select * from public.telemetry_sessions s where s.user_id = v_user and s.laps > 0
            order by s.started_at desc limit 20) s)
  );
end $$;

create or replace function public.telemetry_session(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.telemetry_sessions;
begin
  select * into s from public.telemetry_sessions where id = p_session;
  if s.id is null or not public.telemetry_visible(s.user_id) then
    raise exception 'Oturum bulunamadı';
  end if;
  return jsonb_build_object(
    'session', public.telemetry_session_json(s),
    'owner', (select jsonb_build_object('id', p.id, 'display_name', p.display_name) from public.profiles p where p.id = s.user_id),
    'laps', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lap', l.lap, 'lap_time', l.lap_time,
        'sectors', l.sectors, 'valid', l.valid, 'pit', l.pit, 'off_track', l.off_track, 'sim_invalid', l.sim_invalid,
        'incidents', l.incidents, 'fuel_used', l.fuel_used, 'air_temp', l.air_temp, 'track_temp', l.track_temp,
        'wetness', l.wetness, 'position', l.position, 'class_position', l.class_position, 'driven_at', l.driven_at,
        'has_trace', l.trace_path is not null, 'setup_name', l.setup_name) order by l.lap, l.driven_at), '[]')
      from public.telemetry_laps l where l.session_id = s.id));
end $$;

create or replace function public.telemetry_laps_info(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'user_id', l.user_id, 'display_name', p.display_name,
      'driver_name', s.driver_name, 'session_id', l.session_id, 'sim', l.sim, 'track_id', l.track_id,
      'track_config', l.track_config, 'track_name', s.track_name, 'track_length_km', s.track_length_km,
      'car_id', l.car_id, 'car_name', s.car_name, 'car_class', s.car_class, 'session_type', s.session_type,
      'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors, 'valid', l.valid, 'driven_at', l.driven_at,
      'trace_path', l.trace_path, 'setup_name', l.setup_name)), '[]')
  from public.telemetry_laps l
  join public.telemetry_sessions s on s.id = l.session_id
  join public.profiles p on p.id = l.user_id
  where l.id = any (p_ids[1:4]) and public.telemetry_visible(l.user_id);
$$;

create or replace function public.telemetry_combo_laps(p_sim text, p_track_id text, p_track_config text, p_car_id text,
    p_user uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.lap_time), '[]') from (
    select l.lap_time, jsonb_build_object('id', l.id, 'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors,
        'driven_at', l.driven_at, 'session_id', l.session_id, 'session_type', s.session_type, 'setup_name', l.setup_name) j
    from public.telemetry_laps l join public.telemetry_sessions s on s.id = l.session_id
    where l.user_id = coalesce(p_user, auth.uid()) and public.telemetry_visible(l.user_id)
      and l.sim = p_sim and l.track_id = p_track_id and l.track_config = coalesce(p_track_config, '')
      and l.car_id = p_car_id and l.trace_path is not null and l.valid and not l.pit
    order by l.lap_time limit 50) x;
$$;

notify pgrst, 'reload schema';
