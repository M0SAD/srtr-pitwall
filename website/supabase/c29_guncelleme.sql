-- ---------------------------------------------------------------------------
-- c29: Telemetri (Garage61 benzeri tur kayıtları) ve Yarışçılar dizini.
--      1) Program canlı bir sim oturumunda tamamlanan her turu kaydeder ve giriş yapılmışsa yükler:
--         telemetry_record_lap(p_lap jsonb) → telemetry_sessions (oturum özeti) + telemetry_laps (tur özeti)
--         + driver_identities (simdeki sürücü adı/kimliği). Aynı tur iki kez gönderilirse güncellenir.
--         Tur izi (hız/gaz/fren/vites/direksiyon, ~360 nokta, gzip JSON) sadece her oturumun EN İYİ geçerli
--         turu için "telemetry" kovasında <kullanıcı>/<tur id>.json.gz olarak tutulur (kişisel en iyiler her zaman
--         bir oturumun en iyisidir). RPC, izin yüklenmesi gereken yolu (trace_path) ve artık gereksiz olan
--         eski iz yollarını (remove) döner; istemci Storage API ile yükler/siler.
--      2) Gizlilik: profiles.telemetry_public (varsayılan true, "verilerimi başkaları görebilsin").
--         Okuma: sahibi her zaman; diğerleri sahibi açık bıraktıysa ya da aynı takımdalarsa (same_team).
--         telemetry_visible(sahip) RLS'te, RPC'lerde ve kovada kullanılır.
--         same_team(a, b): burada sadece YOKSA taslak (false) olarak oluşturulur; c30 gerçek haliyle değiştirir.
--      3) Okuma RPC'leri: telemetry_overview(kullanıcı), telemetry_session_list, telemetry_session(oturum),
--         telemetry_laps_info(tur id'leri; karşılaştırma için iz yolları), telemetry_combo_laps (pist+araç için
--         izli turlar), telemetry_leaderboard (pist+araç en iyi turlar, görünür üyeler), telemetry_drivers
--         (sim başına yarışçı dizini, arama), telemetry_set_public(açık), telemetry_delete_session(oturum).
-- Sıra: c28'den sonra, c30'dan önce.
-- ---------------------------------------------------------------------------

-- 0) Profil ayarı ------------------------------------------------------------------
alter table public.profiles add column if not exists telemetry_public boolean not null default true;

-- Takım üyeliği: c30 bunu gerçek takım üyeliğiyle değiştirir. Burada sadece yoksa (c30 önce çalıştıysa
-- gerçek hali ezilmesin diye) taslak oluşturulur.
do $do$
begin
  if to_regprocedure('public.same_team(uuid, uuid)') is null then
    -- c30 bunu gerçek takım üyeliğiyle değiştirir
    create or replace function public.same_team(a uuid, b uuid) returns boolean
    language sql stable security definer set search_path = public as $f$ select false $f$;
  end if;
end $do$;
grant execute on function public.same_team(uuid, uuid) to anon, authenticated, service_role;

-- Bir üyenin telemetrisini oturumdaki kullanıcı (ya da giriş yapmamış ziyaretçi) görebilir mi
create or replace function public.telemetry_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner is not null and (
    coalesce(p_owner = auth.uid(), false)
    or coalesce((select p.telemetry_public from public.profiles p where p.id = p_owner), false)
    or (auth.uid() is not null and coalesce(public.same_team(p_owner, auth.uid()), false)));
$$;
grant execute on function public.telemetry_visible(uuid) to anon, authenticated, service_role;

-- 1) Tablolar ----------------------------------------------------------------------
create table if not exists public.telemetry_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Programın verdiği oturum kimliği (sim-başlangıç-oturum no)
  local_id text not null check (char_length(local_id) between 1 and 120),
  sim text not null check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2')),
  track_id text not null default '' check (char_length(track_id) <= 120),
  track_name text not null default '' check (char_length(track_name) <= 160),
  track_config text not null default '' check (char_length(track_config) <= 160),
  track_length_km real not null default 0,
  car_id text not null default '' check (char_length(car_id) <= 120),
  car_name text not null default '' check (char_length(car_name) <= 160),
  car_class text not null default '' check (char_length(car_class) <= 80),
  session_type text not null default 'other' check (session_type in ('practice', 'qualify', 'race', 'warmup', 'hotlap', 'other')),
  session_kind text not null default '' check (char_length(session_kind) <= 60),
  driver_name text not null default '' check (char_length(driver_name) <= 80),
  driver_id text not null default '' check (char_length(driver_id) <= 40),
  started_at timestamptz not null default now(),
  last_lap_at timestamptz not null default now(),
  laps int not null default 0,
  valid_laps int not null default 0,
  invalid_laps int not null default 0,
  best_lap real,
  best_lap_id uuid,
  incidents int not null default 0,
  distance_km real not null default 0,
  drive_time real not null default 0,
  air_temp real,
  track_temp real,
  wetness int,
  unique (user_id, local_id)
);
create index if not exists telemetry_sessions_user on public.telemetry_sessions (user_id, started_at desc);
create index if not exists telemetry_sessions_combo on public.telemetry_sessions (sim, track_id, track_config, car_id);
alter table public.telemetry_sessions enable row level security;
drop policy if exists "telemetry sessions read" on public.telemetry_sessions;
create policy "telemetry sessions read" on public.telemetry_sessions for select using (public.telemetry_visible(user_id));

create table if not exists public.telemetry_laps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.telemetry_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 140),
  -- Lider tablosu ve kişisel en iyiler için oturumdan kopya
  sim text not null,
  track_id text not null default '',
  track_config text not null default '',
  car_id text not null default '',
  lap int not null,
  lap_time real not null check (lap_time > 0 and lap_time < 3600),
  sectors real[] not null default '{}',
  valid boolean not null default true,
  pit boolean not null default false,
  off_track boolean not null default false,
  sim_invalid boolean not null default false,
  incidents int not null default 0,
  fuel_used real,
  air_temp real,
  track_temp real,
  wetness int,
  precip real,
  position int,
  class_position int,
  driven_at timestamptz not null default now(),
  -- "telemetry" kovasındaki iz (sadece oturumun en iyi turu)
  trace_path text,
  created_at timestamptz not null default now(),
  unique (user_id, local_id)
);
create index if not exists telemetry_laps_session on public.telemetry_laps (session_id, lap);
create index if not exists telemetry_laps_user_combo on public.telemetry_laps (user_id, sim, track_id, track_config, car_id, lap_time)
  where valid and not pit;
create index if not exists telemetry_laps_combo on public.telemetry_laps (sim, track_id, track_config, car_id, lap_time)
  where valid and not pit;
create index if not exists telemetry_laps_user_day on public.telemetry_laps (user_id, created_at desc);
alter table public.telemetry_laps enable row level security;
drop policy if exists "telemetry laps read" on public.telemetry_laps;
create policy "telemetry laps read" on public.telemetry_laps for select using (public.telemetry_visible(user_id));

-- Simdeki sürücü kimliği (sim başına bir satır; son görülen ad/kimlik)
create table if not exists public.driver_identities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sim text not null check (sim in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2')),
  sim_name text not null default '' check (char_length(sim_name) <= 80),
  sim_id text not null default '' check (char_length(sim_id) <= 40),
  laps int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, sim)
);
create index if not exists driver_identities_sim on public.driver_identities (sim, last_seen desc);
alter table public.driver_identities enable row level security;
drop policy if exists "driver identities read" on public.driver_identities;
create policy "driver identities read" on public.driver_identities for select using (public.telemetry_visible(user_id));

grant select on public.telemetry_sessions, public.telemetry_laps, public.driver_identities to anon, authenticated;
grant all on public.telemetry_sessions, public.telemetry_laps, public.driver_identities to service_role;

-- 2) İz kovası ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('telemetry', 'telemetry', false, 262144, array['application/gzip', 'application/json', 'application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Yol: <sahip uuid>/<tur id>.json.gz
create or replace function public.telemetry_can_read(p_path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  begin
    v_owner := split_part(p_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.telemetry_visible(v_owner);
end $$;
grant execute on function public.telemetry_can_read(text) to anon, authenticated, service_role;

drop policy if exists "telemetry own upload" on storage.objects;
create policy "telemetry own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'telemetry' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telemetry own update" on storage.objects;
create policy "telemetry own update" on storage.objects for update to authenticated
  using (bucket_id = 'telemetry' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telemetry read" on storage.objects;
create policy "telemetry read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'telemetry' and public.telemetry_can_read(name));
drop policy if exists "telemetry own delete" on storage.objects;
create policy "telemetry own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'telemetry' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Kayıt -------------------------------------------------------------------------
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
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
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
      position, class_position, driven_at)
  values (v_sess, me, v_lap_local, v_sim, v_track, v_config, v_car, coalesce((p_lap->>'lap')::int, 0), v_time,
      v_sectors, v_valid, v_pit, coalesce((p_lap->>'off_track')::boolean, false),
      coalesce((p_lap->>'sim_invalid')::boolean, false), greatest(coalesce((p_lap->>'incidents')::int, 0), 0),
      nullif((p_lap->>'fuel_used')::real, 0), (p_lap->>'air_temp')::real, (p_lap->>'track_temp')::real,
      (p_lap->>'wetness')::int, (p_lap->>'precip')::real, nullif((p_lap->>'position')::int, 0),
      nullif((p_lap->>'class_position')::int, 0), v_ts)
  on conflict (user_id, local_id) do update
    set lap_time = excluded.lap_time, sectors = excluded.sectors, valid = excluded.valid, pit = excluded.pit,
        off_track = excluded.off_track, sim_invalid = excluded.sim_invalid, incidents = excluded.incidents
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

-- Paylaşım ayarı
create or replace function public.telemetry_set_public(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  update public.profiles set telemetry_public = coalesce(p_on, true) where id = auth.uid();
end $$;

-- Oturumu sil (sadece sahibi): silinmesi gereken iz yollarını döner (istemci kovadan siler)
create or replace function public.telemetry_delete_session(p_session uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_paths text[];
begin
  if not exists (select 1 from public.telemetry_sessions where id = p_session and user_id = auth.uid()) then
    raise exception 'Oturum bulunamadı';
  end if;
  select coalesce(array_agg(trace_path), '{}') into v_paths from public.telemetry_laps
  where session_id = p_session and trace_path is not null;
  delete from public.telemetry_sessions where id = p_session;
  return v_paths;
end $$;

-- 4) Okuma -------------------------------------------------------------------------
-- Oturum satırı (JSON)
create or replace function public.telemetry_session_json(s public.telemetry_sessions) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', s.id, 'user_id', s.user_id, 'sim', s.sim, 'track_id', s.track_id,
    'track_name', s.track_name, 'track_config', s.track_config, 'track_length_km', s.track_length_km,
    'car_id', s.car_id, 'car_name', s.car_name, 'car_class', s.car_class, 'session_type', s.session_type,
    'session_kind', s.session_kind, 'driver_name', s.driver_name, 'started_at', s.started_at,
    'last_lap_at', s.last_lap_at, 'laps', s.laps, 'valid_laps', s.valid_laps, 'invalid_laps', s.invalid_laps,
    'best_lap', s.best_lap, 'best_lap_id', s.best_lap_id, 'incidents', s.incidents, 'distance_km', s.distance_km,
    'drive_time', s.drive_time, 'air_temp', s.air_temp, 'track_temp', s.track_temp, 'wetness', s.wetness);
$$;

-- Bir üyenin telemetri özeti (p_user boşsa kendim). Görünmüyorsa sadece profil + visible:false.
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
            'has_trace', l.trace_path is not null,
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

-- Oturum listesi (sayfalı, isteğe bağlı sim filtresi)
create or replace function public.telemetry_session_list(p_user uuid default null, p_sim text default null,
    p_limit int default 30, p_offset int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.telemetry_session_json(s) order by s.started_at desc), '[]')
  from (select * from public.telemetry_sessions s
        where s.user_id = coalesce(p_user, auth.uid()) and s.laps > 0
          and public.telemetry_visible(s.user_id)
          and (p_sim is null or p_sim = '' or s.sim = p_sim)
        order by s.started_at desc
        limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) s;
$$;

-- Oturum ayrıntısı: özet + turlar
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
        'has_trace', l.trace_path is not null) order by l.lap, l.driven_at), '[]')
      from public.telemetry_laps l where l.session_id = s.id));
end $$;

-- Karşılaştırma: turların bilgisi ve iz yolları (en çok 4; görünmeyenler atlanır)
create or replace function public.telemetry_laps_info(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'user_id', l.user_id, 'display_name', p.display_name,
      'driver_name', s.driver_name, 'session_id', l.session_id, 'sim', l.sim, 'track_id', l.track_id,
      'track_config', l.track_config, 'track_name', s.track_name, 'track_length_km', s.track_length_km,
      'car_id', l.car_id, 'car_name', s.car_name, 'car_class', s.car_class, 'session_type', s.session_type,
      'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors, 'valid', l.valid, 'driven_at', l.driven_at,
      'trace_path', l.trace_path)), '[]')
  from public.telemetry_laps l
  join public.telemetry_sessions s on s.id = l.session_id
  join public.profiles p on p.id = l.user_id
  where l.id = any (p_ids[1:4]) and public.telemetry_visible(l.user_id);
$$;

-- Pist + araç için izi olan turlar (p_user boşsa kendim): kendi turlarımdan seçmek için
create or replace function public.telemetry_combo_laps(p_sim text, p_track_id text, p_track_config text, p_car_id text,
    p_user uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.lap_time), '[]') from (
    select l.lap_time, jsonb_build_object('id', l.id, 'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors,
        'driven_at', l.driven_at, 'session_id', l.session_id, 'session_type', s.session_type) j
    from public.telemetry_laps l join public.telemetry_sessions s on s.id = l.session_id
    where l.user_id = coalesce(p_user, auth.uid()) and public.telemetry_visible(l.user_id)
      and l.sim = p_sim and l.track_id = p_track_id and l.track_config = coalesce(p_track_config, '')
      and l.car_id = p_car_id and l.trace_path is not null and l.valid and not l.pit
    order by l.lap_time limit 50) x;
$$;

-- Lider tablosu: pist (+ isteğe bağlı araç) için her görünür üyenin en iyi geçerli turu
create or replace function public.telemetry_leaderboard(p_sim text, p_track_id text, p_track_config text default '',
    p_car_id text default null, p_limit int default 50)
returns table (rank int, user_id uuid, display_name text, sim_name text, lap_id uuid, lap_time real, sectors real[],
               car_id text, car_name text, car_class text, driven_at timestamptz, has_trace boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (l.user_id) l.*
    from public.telemetry_laps l
    where l.sim = p_sim and l.track_id = p_track_id and l.track_config = coalesce(p_track_config, '')
      and (p_car_id is null or p_car_id = '' or l.car_id = p_car_id)
      and l.valid and not l.pit and public.telemetry_visible(l.user_id)
    order by l.user_id, l.lap_time, (l.trace_path is null), l.driven_at
  )
  select (row_number() over (order by b.lap_time, b.driven_at))::int, b.user_id, p.display_name,
         coalesce(d.sim_name, s.driver_name), b.id, b.lap_time, b.sectors, b.car_id, s.car_name, s.car_class,
         b.driven_at, b.trace_path is not null, b.user_id = auth.uid()
  from best b
  join public.telemetry_sessions s on s.id = b.session_id
  join public.profiles p on p.id = b.user_id
  left join public.driver_identities d on d.user_id = b.user_id and d.sim = b.sim
  order by b.lap_time, b.driven_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Yarışçılar dizini: simde en az bir tur kaydı olan üyeler. Telemetrisi görünmeyenlerin sadece adı döner.
create or replace function public.telemetry_drivers(p_sim text default null, p_q text default '',
    p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, display_name text, sim text, sim_name text, sim_id text, visible boolean, laps int,
               tracks int, cars int, last_active timestamptz, friend text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select d.user_id, p.display_name, d.sim, d.sim_name,
         case when v.ok and d.sim = 'iracing' then nullif(d.sim_id, '') end,
         v.ok,
         case when v.ok then st.laps end,
         case when v.ok then st.tracks end,
         case when v.ok then st.cars end,
         case when v.ok then coalesce(st.last, d.last_seen) end,
         (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = d.user_id),
         d.user_id = auth.uid()
  from public.driver_identities d
  join public.profiles p on p.id = d.user_id
  cross join lateral (select public.telemetry_visible(d.user_id) ok) v
  left join lateral (
    select sum(s.laps)::int laps, count(distinct (s.track_id, s.track_config))::int tracks,
           count(distinct s.car_id)::int cars, max(s.last_lap_at) last
    from public.telemetry_sessions s where s.user_id = d.user_id and s.sim = d.sim and s.laps > 0
  ) st on true
  where (p_sim is null or p_sim = '' or d.sim = p_sim)
    and (coalesce(p_q, '') = '' or d.sim_name ilike '%' || p_q || '%' or p.display_name ilike '%' || p_q || '%')
    and exists (select 1 from public.telemetry_sessions s2 where s2.user_id = d.user_id and s2.sim = d.sim and s2.laps > 0)
  order by d.last_seen desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Yetkiler -------------------------------------------------------------------------
revoke all on function public.telemetry_record_lap(jsonb), public.telemetry_set_public(boolean),
  public.telemetry_delete_session(uuid) from public, anon;
grant execute on function public.telemetry_record_lap(jsonb), public.telemetry_set_public(boolean),
  public.telemetry_delete_session(uuid) to authenticated, service_role;
grant execute on function public.telemetry_session_json(public.telemetry_sessions),
  public.telemetry_overview(uuid), public.telemetry_session_list(uuid, text, int, int), public.telemetry_session(uuid),
  public.telemetry_laps_info(uuid[]), public.telemetry_combo_laps(text, text, text, text, uuid),
  public.telemetry_leaderboard(text, text, text, text, int), public.telemetry_drivers(text, text, int, int)
  to anon, authenticated, service_role;
