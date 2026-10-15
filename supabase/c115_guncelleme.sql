-- c115: Yeni oyunlar: RaceRoom (r3e), F1 23-25 (f1), Forza (forza), DiRT Rally 2.0 / DiRT 4 / GRID (dirt), BeamNG.drive (beamng).
-- Oyun kimliği denetimleri genişletildi: telemetri oturumları ve kimlikler, arkadaş listesindeki oyun (user_status.sim),
-- takımın oyunu, telemetry_record_lap / team_create / team_update. Gövdeler öncekiyle aynı, sadece kabul edilen liste uzadı.

-- Eski oyun listesi denetimleri (sütun içi CHECK'lerin adı sürüme göre değişebilir: tanımından bulunur)
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as t, conname from pg_constraint
    where contype = 'c'
      and conrelid in ('public.telemetry_sessions'::regclass, 'public.driver_identities'::regclass,
                       'public.user_status'::regclass, 'public.teams'::regclass)
      and pg_get_constraintdef(oid) like '%ams2%'
  loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
end $$;

alter table public.telemetry_sessions drop constraint if exists telemetry_sessions_sim_check;
alter table public.telemetry_sessions add constraint telemetry_sessions_sim_check check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng'));
alter table public.driver_identities drop constraint if exists driver_identities_sim_check;
alter table public.driver_identities add constraint driver_identities_sim_check check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng'));
alter table public.user_status drop constraint if exists user_status_sim_ok;
alter table public.user_status add constraint user_status_sim_ok check (sim in ('', 'iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng'));
alter table public.teams drop constraint if exists teams_sim_check;
alter table public.teams add constraint teams_sim_check check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng', 'multi'));

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
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng') or v_local = '' or v_lap_local = '' then
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
  if public.feature_requires_pro('teams.create', false) and not public.is_pro() then
    raise exception 'Takım kurmak PRO üyelik gerektirir';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng', 'multi') then
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
  if v_sim is not null and v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'r3e', 'f1', 'forza', 'dirt', 'beamng', 'multi') then
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

notify pgrst, 'reload schema';
