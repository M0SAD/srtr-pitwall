-- c113: Telemetri paylaşım bağlantıları (herkese açık) + 5 tura kadar kıyaslama
--
-- Uygulamada "Paylaş" bir paylaşım kaydı oluşturur; bağlantıyı (telemetri.html?s=<kimlik>) bilen herkes GİRİŞ YAPMADAN
-- görür. Yalnızca paylaşılan turlar / oturum açılır: sahibin diğer telemetrisi ve gizlilik ayarı değişmez. Sahibi
-- istediği an iptal edebilir (iptal edilince bağlantı ve iz dosyaları yeniden kapanır).
--   - kind 'laps': 1-5 tur (tur analizi / kıyaslama). Kendi turların ve telemetrisi herkese açık üyelerin turları.
--   - kind 'session': kendi oturumun (tur tablosu + izli turlar).
-- Kimlik tahmin edilemez (32 onaltılık karakter). Harita şekli (pist çizgisi) paylaşıma eklenir: harita her
-- bilgisayarda yerel olarak öğrenildiğinden sitede ancak böyle çizilebilir.

create table if not exists public.telemetry_shares (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{16,64}$'),
  owner uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'laps' check (kind in ('laps', 'session')),
  session_id uuid references public.telemetry_sessions (id) on delete cascade,
  lap_ids uuid[] not null default '{}' check (cardinality(lap_ids) <= 5),
  title text not null default '' check (char_length(title) <= 120),
  shape jsonb check (shape is null or octet_length(shape::text) <= 150000),
  views int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists telemetry_shares_owner on public.telemetry_shares (owner, created_at desc);
create index if not exists telemetry_laps_trace_path on public.telemetry_laps (trace_path) where trace_path is not null;
alter table public.telemetry_shares enable row level security;
drop policy if exists "shares own read" on public.telemetry_shares;
create policy "shares own read" on public.telemetry_shares for select to authenticated using (owner = auth.uid());
revoke all on public.telemetry_shares from anon, authenticated;
grant select on public.telemetry_shares to authenticated;
grant all on public.telemetry_shares to service_role;

-- Paylaşılan (iptal edilmemiş) bir turun iz dosyası mı
create or replace function public.telemetry_trace_shared(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.telemetry_shares sh
    join public.telemetry_laps l on l.id = any (sh.lap_ids)
    where not sh.revoked and l.trace_path = p_path);
$$;
grant execute on function public.telemetry_trace_shared(text) to anon, authenticated, service_role;

-- İz kovası okuma kuralı: görme yetkisi olanlar + paylaşılmış turların izleri (giriş yapmamış ziyaretçi de)
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
  return public.telemetry_visible(v_owner) or public.telemetry_trace_shared(p_path);
end $$;
grant execute on function public.telemetry_can_read(text) to anon, authenticated, service_role;

-- Paylaşım oluştur. Aynı içerik daha önce paylaşıldıysa (iptal edilmemiş) aynı bağlantı döner.
create or replace function public.telemetry_share_create(p_kind text, p_laps uuid[], p_session uuid, p_title text,
    p_shape jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_laps uuid[];
  v_id text;
  v_n int;
begin
  if v_me is null then
    raise exception 'Paylaşmak için giriş yapmalısın';
  end if;
  if p_shape is not null and octet_length(p_shape::text) > 150000 then
    p_shape := null;
  end if;
  if p_kind = 'session' then
    if not exists (select 1 from public.telemetry_sessions s where s.id = p_session and s.user_id = v_me) then
      raise exception 'Yalnızca kendi oturumunu paylaşabilirsin';
    end if;
    select coalesce(array_agg(x.id), '{}') into v_laps from (
      select l.id from public.telemetry_laps l
      where l.session_id = p_session and l.trace_path is not null
      order by l.lap_time limit 5) x;
  elsif p_kind = 'laps' then
    if p_laps is null or cardinality(p_laps) < 1 or cardinality(p_laps) > 5 then
      raise exception 'Paylaşılacak tur sayısı 1 ile 5 arasında olmalı';
    end if;
    select count(*) into v_n from public.telemetry_laps l
      join public.profiles p on p.id = l.user_id
      where l.id = any (p_laps)
        and (l.user_id = v_me or (coalesce(p.telemetry_public, false) and public.telemetry_visible(l.user_id)));
    if v_n <> (select count(distinct x) from unnest(p_laps) x) then
      raise exception 'Bu turlardan biri paylaşılamaz (telemetrisi gizli)';
    end if;
    v_laps := p_laps;
    p_session := null;
  else
    raise exception 'Geçersiz paylaşım türü';
  end if;
  -- Aynı içerik zaten paylaşıldıysa onu kullan (harita şekli yoksa güncellenir)
  select sh.id into v_id from public.telemetry_shares sh
   where sh.owner = v_me and not sh.revoked and sh.kind = p_kind
     and coalesce(sh.session_id::text, '') = coalesce(p_session::text, '') and sh.lap_ids = v_laps
   order by sh.created_at desc limit 1;
  if v_id is not null then
    update public.telemetry_shares set shape = coalesce(shape, p_shape), title = coalesce(nullif(left(p_title, 120), ''), title)
     where id = v_id;
    return v_id;
  end if;
  -- Kötüye kullanım sınırı: günde en çok 200 paylaşım
  if (select count(*) from public.telemetry_shares where owner = v_me and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Bugün çok fazla paylaşım yaptın; yarın yeniden dene';
  end if;
  v_id := replace(gen_random_uuid()::text, '-', '');
  insert into public.telemetry_shares (id, owner, kind, session_id, lap_ids, title, shape)
  values (v_id, v_me, p_kind, p_session, v_laps, left(coalesce(p_title, ''), 120), p_shape);
  return v_id;
end $$;
grant execute on function public.telemetry_share_create(text, uuid[], uuid, text, jsonb) to authenticated;

-- Paylaşımı aç (giriş gerekmez). Turların bilgisi + iz dosyası yolları (iz kovası paylaşılan izleri herkese okutur).
create or replace function public.telemetry_share_get(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sh public.telemetry_shares;
  v_sess jsonb;
begin
  select * into sh from public.telemetry_shares where id = p_id and not revoked;
  if sh.id is null then
    raise exception 'Paylaşım bulunamadı ya da kaldırıldı';
  end if;
  update public.telemetry_shares set views = views + 1 where id = sh.id;
  if sh.kind = 'session' then
    select jsonb_build_object(
      'session', public.telemetry_session_json(s),
      'laps', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lap', l.lap, 'lap_time', l.lap_time,
          'sectors', l.sectors, 'valid', l.valid, 'pit', l.pit, 'off_track', l.off_track, 'incidents', l.incidents,
          'fuel_used', l.fuel_used, 'track_temp', l.track_temp, 'position', l.position, 'class_position', l.class_position,
          'has_trace', l.id = any (sh.lap_ids), 'setup_name', l.setup_name) order by l.lap, l.driven_at), '[]')
        from public.telemetry_laps l where l.session_id = s.id))
      into v_sess
      from public.telemetry_sessions s where s.id = sh.session_id;
  end if;
  return jsonb_build_object(
    'id', sh.id, 'kind', sh.kind, 'title', sh.title, 'created_at', sh.created_at, 'views', sh.views + 1,
    'shape', sh.shape,
    'owner', (select jsonb_build_object('display_name', p.display_name) from public.profiles p where p.id = sh.owner),
    'session', v_sess,
    'laps', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'display_name', p.display_name,
        'driver_name', s.driver_name, 'session_id', l.session_id, 'sim', l.sim, 'track_id', l.track_id,
        'track_config', l.track_config, 'track_name', s.track_name, 'track_length_km', s.track_length_km,
        'car_id', l.car_id, 'car_name', s.car_name, 'car_class', s.car_class, 'session_type', s.session_type,
        'lap', l.lap, 'lap_time', l.lap_time, 'sectors', l.sectors, 'valid', l.valid, 'driven_at', l.driven_at,
        'trace_path', l.trace_path, 'setup_name', l.setup_name, 'track_temp', l.track_temp, 'air_temp', l.air_temp)
        order by array_position(sh.lap_ids, l.id)), '[]')
      from public.telemetry_laps l
      join public.telemetry_sessions s on s.id = l.session_id
      join public.profiles p on p.id = l.user_id
      where l.id = any (sh.lap_ids)));
end $$;
grant execute on function public.telemetry_share_get(text) to anon, authenticated;

-- Kendi paylaşımlarım (yönetmek / iptal etmek için)
create or replace function public.telemetry_shares_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'title', title, 'views', views,
      'created_at', created_at, 'laps', cardinality(lap_ids)) order by created_at desc), '[]')
  from (select * from public.telemetry_shares where owner = auth.uid() and not revoked order by created_at desc limit 200) x;
$$;
grant execute on function public.telemetry_shares_mine() to authenticated;

create or replace function public.telemetry_share_revoke(p_id text) returns void
language sql security definer set search_path = public as $$
  update public.telemetry_shares set revoked = true where id = p_id and owner = auth.uid();
$$;
grant execute on function public.telemetry_share_revoke(text) to authenticated;

-- Tur analizi artık 5 tura kadar kıyaslar
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
  where l.id = any (p_ids[1:5]) and public.telemetry_visible(l.user_id);
$$;

notify pgrst, 'reload schema';
