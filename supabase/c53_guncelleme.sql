-- ---------------------------------------------------------------------------
-- c53: Ekip (uzaktan pit ekibi). Sürücü, kabul edilmiş arkadaşlarına "ekip" rolü verir; ekip üyesi sürücünün
--      canlı yarış verisini (uygulamadan ya da telefondan: website/crew.html) izler ve izin verildiyse pit
--      ayarlarını (yakıt, lastik, hızlı tamir, vizör filmi) uzaktan değiştirir, kısa mesaj gönderir.
--
-- 1) crew_members (owner, member, can_view, can_control, seen_at): kimin ekibimde olduğu. En fazla 10 üye.
--      Sadece kabul edilmiş arkadaş eklenebilir; arkadaşlık silinince satır da silinir (tetikleyici) ve bütün
--      yetki denetimleri ayrıca arkadaşlığın sürdüğünü de arar. can_control => can_view.
--      seen_at: ekip üyesinin panelinin açık olduğu son an (sürücü tarafında "şu an bağlı" göstergesi).
--    crew_prefs (user_id, control_on): sürücünün ana anahtarı "Ekibim pit ayarlarımı değiştirebilsin".
--      Varsayılan KAPALI. "Ekip kontrolünü durdur" bunu kapatır: bekleyen komutlar da reddedilir.
--
-- 2) Görme: live_visible() c44'teki kuralı aynen korur (kendim / güvenilir arkadaş + paylaşan PRO) ve
--      can_view verilmiş ekip üyesini ekler (izlemek PRO istemez). "live own write" kuralı da buna göre
--      genişler: PRO olmayan sürücü, ekibinde izleyebilen biri varsa live_data satırını yazabilir.
--      Ekip verisi live_data.data.crew altında gelir (uygulama yazar; sunucu içeriğine bakmaz).
--
-- 3) Komutlar: crew_commands (id, owner, sender, kind, args, status, result, created_at, applied_at),
--      Realtime yayınında. Durum: pending -> applied | rejected | expired. 30 sn içinde uygulanmayan komut
--      'expired' olur (sürücünün uygulaması kapalı / oyunda değil). Satırı sadece sahibi ve gönderen okur;
--      tabloya doğrudan yazılamaz (yalnızca aşağıdaki security definer fonksiyonlar).
--      Türler (yalnızca bunlar; uygulama ayarı / hesap bilgisi değiştiren komut YOKTUR):
--        fuel_set {liters}  fuel_clear  tyres_all  tyres {lf,rf,lr,rr}  tyres_clear
--        fast_repair {on}   tearoff {on}   clear_all   message {text}
--      crew_command() argümanları türüne göre temizleyip yeniden kurar (fazla alan atılır, sınırlar uygulanır).
--      Hız sınırı: gönderen başına dakikada 30 komut.
--
-- 4) Fonksiyonlar
--      crew_set(p_friend, p_view, p_control)   sürücü: üyeyi ekle / yetkisini değiştir / (ikisi de false) çıkar
--      crew_control_set(p_on)                  sürücü: ana anahtar
--      crew_state() -> jsonb                   sürücü: {control_on, needs_pro, count, max}
--      crew_list()                             sürücü: ekibim (+ şu an bağlı mı)
--      crew_drivers()                          ekip üyesi: ekibinde olduğum sürücüler + durum + son canlı veri
--      crew_driver(p_owner) -> jsonb           ekip üyesi: tek sürücünün paneli (3 sn'de bir; seen_at'i de yazar)
--      crew_command(p_owner, p_kind, p_args)   ekip üyesi: komut gönder -> komut kimliği
--      crew_command_get(p_id) -> jsonb         gönderen / sahip: komutun durumu (süresi dolduysa 'expired' yapar)
--      crew_commands_pending()                 sürücünün uygulaması: uygulanmayı bekleyen taze komutlar
--      crew_command_done(p_id, p_status, p_result)  sürücünün uygulaması: sonucu yaz
--      crew_history(p_limit)                   sürücü: son komutlar (Ayarlar › Paylaşım › Son komutlar)
--
-- 5) PRO: 'social.crew' (varsayılan PRO) — ekibe DEĞİŞTİRME yetkisi vermek ve ana anahtarı açmak için sürücü
--      PRO olmalı; komut anında da sürücünün PRO'su aranır. İzlemek (can_view) ve ekip üyesi olmak ücretsizdir.
-- Sıra: c38 (feature_requires_pro, pro_feature_catalog) ve c44 (live_trusts, live_visible) sonrasında.
-- ---------------------------------------------------------------------------

insert into public.pro_feature_catalog (key, label, grp, default_pro, updated_at) values
  ('social.crew', 'Ekip: arkadaşların pit ayarlarını uzaktan değiştirmesi (izlemek ücretsiz)', 'Sosyal', true, now())
on conflict (key) do update
  set label = excluded.label, grp = excluded.grp, default_pro = excluded.default_pro, updated_at = now();

-- ===========================================================================
-- 1) Tablolar
-- ===========================================================================
create table if not exists public.crew_members (
  owner uuid not null references public.profiles (id) on delete cascade,
  member uuid not null references public.profiles (id) on delete cascade,
  can_view boolean not null default true,
  can_control boolean not null default false,
  created_at timestamptz not null default now(),
  -- Ekip üyesinin paneli en son ne zaman açıktı
  seen_at timestamptz,
  primary key (owner, member),
  check (owner <> member)
);
alter table public.crew_members add column if not exists seen_at timestamptz;
create index if not exists crew_members_member on public.crew_members (member);
alter table public.crew_members enable row level security;
drop policy if exists "crew members read" on public.crew_members;
create policy "crew members read" on public.crew_members for select using (auth.uid() = owner or auth.uid() = member);
grant select on public.crew_members to authenticated;
grant all on public.crew_members to service_role;

create table if not exists public.crew_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Ekibim pit ayarlarımı değiştirebilsin (ana anahtar)
  control_on boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.crew_prefs enable row level security;
drop policy if exists "crew prefs own" on public.crew_prefs;
create policy "crew prefs own" on public.crew_prefs for select using (auth.uid() = user_id);
grant select on public.crew_prefs to authenticated;
grant all on public.crew_prefs to service_role;

create table if not exists public.crew_commands (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  sender uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('fuel_set', 'fuel_clear', 'tyres_all', 'tyres', 'tyres_clear',
                                     'fast_repair', 'tearoff', 'clear_all', 'message')),
  args jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'expired')),
  result text not null default '',
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists crew_commands_owner on public.crew_commands (owner, created_at desc);
create index if not exists crew_commands_sender on public.crew_commands (sender, created_at desc);
alter table public.crew_commands enable row level security;
drop policy if exists "crew commands read" on public.crew_commands;
create policy "crew commands read" on public.crew_commands for select using (auth.uid() = owner or auth.uid() = sender);
grant select on public.crew_commands to authenticated;
grant all on public.crew_commands to service_role;

do $$ begin
  alter publication supabase_realtime add table public.crew_commands;
exception when others then null; end $$;

-- Arkadaşlık silinince ekip yetkisi de kalkar (friendships iki yönlü satır tutar: ikisi de silinir)
create or replace function public.crew_friend_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.crew_members
    where (owner = old.user_id and member = old.friend_id) or (owner = old.friend_id and member = old.user_id);
  return old;
end $$;
drop trigger if exists crew_friend_gone on public.friendships;
create trigger crew_friend_gone after delete on public.friendships
  for each row execute function public.crew_friend_gone();

-- ===========================================================================
-- 2) Yetki yardımcıları + canlı veri görünürlüğü
-- ===========================================================================
-- p_member, p_owner'ın ekibinde mi (arkadaşlık sürüyor olmalı). p_control: değiştirme yetkisi de aranır.
create or replace function public.crew_role(p_owner uuid, p_member uuid, p_control boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.crew_members c
    join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
    where c.owner = p_owner and c.member = p_member
      and case when p_control then c.can_control else (c.can_view or c.can_control) end);
$$;
revoke all on function public.crew_role(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.crew_role(uuid, uuid, boolean) to service_role;

-- Sürücü şu an uzaktan komut kabul ediyor mu: ana anahtar açık ve (özellik PRO'ya özelse) sürücü PRO
create or replace function public.crew_accepts(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select control_on from public.crew_prefs where user_id = p_owner), false)
     and (not public.feature_requires_pro('social.crew', true) or public.user_is_pro(p_owner));
$$;
revoke all on function public.crew_accepts(uuid) from public, anon, authenticated;
grant execute on function public.crew_accepts(uuid) to service_role;

-- live_data okuma kuralı: c44'teki kural aynen + izleme yetkisi olan ekip üyesi (PRO aranmaz)
create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (public.live_trusts(p_owner, auth.uid())
        and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(p_owner)))
    or public.crew_role(p_owner, auth.uid(), false));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;

-- Ekibimde izleyebilen biri var mı ("live own write" kuralı için; kendi satırlarını okur)
create or replace function public.crew_has_viewers() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.crew_members c
    join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
    where c.owner = auth.uid() and (c.can_view or c.can_control));
$$;
revoke all on function public.crew_has_viewers() from public, anon;
grant execute on function public.crew_has_viewers() to authenticated, service_role;

-- Canlı veriyi yazmak: veri paylaşımı PRO'ya özel değilse / PRO isem (c38) YA DA ekibimde izleyen varsa
drop policy if exists "live own write" on public.live_data;
create policy "live own write" on public.live_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and (not public.feature_requires_pro('social.data_share', true) or public.is_pro() or public.crew_has_viewers()));

-- ===========================================================================
-- 3) Sürücü tarafı: ekibi yönetme
-- ===========================================================================
create or replace function public.crew_set(p_friend uuid, p_view boolean, p_control boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_view boolean := coalesce(p_view, false) or coalesce(p_control, false);
  v_ctl boolean := coalesce(p_control, false);
  had_ctl boolean;
  n int;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if not v_view then
    delete from public.crew_members where owner = auth.uid() and member = p_friend;
    return;
  end if;
  if not exists (select 1 from public.friendships
                 where user_id = auth.uid() and friend_id = p_friend and status = 'accepted') then
    raise exception 'Arkadaş bulunamadı';
  end if;
  select can_control into had_ctl from public.crew_members where owner = auth.uid() and member = p_friend;
  if v_ctl and not coalesce(had_ctl, false)
     and public.feature_requires_pro('social.crew', true) and not public.is_pro() then
    raise exception 'Ekibe değiştirme yetkisi vermek PRO üyelere özel';
  end if;
  if had_ctl is null then
    select count(*)::int into n from public.crew_members where owner = auth.uid();
    if n >= 10 then
      raise exception 'En fazla 10 ekip üyesi ekleyebilirsin';
    end if;
  end if;
  insert into public.crew_members (owner, member, can_view, can_control)
    values (auth.uid(), p_friend, true, v_ctl)
    on conflict (owner, member) do update set can_view = true, can_control = excluded.can_control;
end $$;
revoke all on function public.crew_set(uuid, boolean, boolean) from public, anon;
grant execute on function public.crew_set(uuid, boolean, boolean) to authenticated;

create or replace function public.crew_control_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if coalesce(p_on, false) and public.feature_requires_pro('social.crew', true) and not public.is_pro() then
    raise exception 'Ekibe değiştirme yetkisi vermek PRO üyelere özel';
  end if;
  insert into public.crew_prefs (user_id, control_on, updated_at) values (auth.uid(), coalesce(p_on, false), now())
    on conflict (user_id) do update set control_on = excluded.control_on, updated_at = now();
  -- Kontrol kapatıldı: bekleyen komutlar uygulanmasın
  if not coalesce(p_on, false) then
    update public.crew_commands set status = 'rejected', result = 'Sürücü ekip kontrolünü durdurdu', applied_at = now()
      where owner = auth.uid() and status = 'pending' and kind <> 'message';
  end if;
end $$;
revoke all on function public.crew_control_set(boolean) from public, anon;
grant execute on function public.crew_control_set(boolean) to authenticated;

create or replace function public.crew_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'control_on', coalesce((select control_on from public.crew_prefs where user_id = auth.uid()), false),
    'needs_pro', public.feature_requires_pro('social.crew', true) and not public.is_pro(),
    'count', (select count(*)::int from public.crew_members where owner = auth.uid()),
    'max', 10);
$$;
revoke all on function public.crew_state() from public, anon;
grant execute on function public.crew_state() to authenticated;

-- Ekibim. watching: paneli son 45 sn içinde açıktı
drop function if exists public.crew_list();
create or replace function public.crew_list()
returns table (member_id uuid, display_name text, avatar_path text, can_view boolean, can_control boolean,
               watching boolean, seen_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.member, p.display_name, p.avatar_path, c.can_view, c.can_control,
         coalesce(c.seen_at > now() - interval '45 seconds', false), c.seen_at, c.created_at
  from public.crew_members c
  join public.profiles p on p.id = c.member
  join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
  where c.owner = auth.uid()
  order by coalesce(c.seen_at > now() - interval '45 seconds', false) desc, p.display_name;
$$;
revoke all on function public.crew_list() from public, anon;
grant execute on function public.crew_list() to authenticated;

-- ===========================================================================
-- 4) Ekip üyesi tarafı: sürücüler ve panel
-- ===========================================================================
-- Ekibinde olduğum sürücüler. control_on: değiştirme yetkim var VE sürücü şu an komut kabul ediyor.
-- live: son 2 dakikada veri göndermiş. Veri 10 dakikadan eskiyse dönmez.
drop function if exists public.crew_drivers();
create or replace function public.crew_drivers()
returns table (owner_id uuid, display_name text, avatar_path text, online boolean, racing boolean, sim text,
               track text, car text, session text, can_view boolean, can_control boolean, control_on boolean,
               live boolean, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.owner, p.display_name, p.avatar_path,
         coalesce(s.updated_at > now() - interval '3 minutes', false),
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false),
         case when s.updated_at > now() - interval '3 minutes' then coalesce(s.sim, '') else '' end,
         case when s.updated_at > now() - interval '3 minutes' then coalesce(s.track, '') else '' end,
         case when s.updated_at > now() - interval '3 minutes' then coalesce(s.car, '') else '' end,
         case when s.updated_at > now() - interval '3 minutes' then coalesce(s.session, '') else '' end,
         c.can_view or c.can_control, c.can_control,
         c.can_control and public.crew_accepts(c.owner),
         coalesce(l.updated_at > now() - interval '2 minutes', false),
         case when l.updated_at > now() - interval '10 minutes' then l.data end,
         l.updated_at
  from public.crew_members c
  join public.profiles p on p.id = c.owner
  join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
  left join public.user_status s on s.user_id = c.owner
  left join public.live_data l on l.user_id = c.owner
  where c.member = auth.uid() and (c.can_view or c.can_control)
  order by coalesce(l.updated_at > now() - interval '2 minutes', false) desc,
           coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) desc,
           s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.crew_drivers() from public, anon;
grant execute on function public.crew_drivers() to authenticated;

-- Tek sürücünün paneli (ekip üyesi 3 sn'de bir çağırır). "Bağlı" göstergesi için seen_at'i 10 sn'de bir yazar.
create or replace function public.crew_driver(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.crew_members%rowtype;
  r jsonb;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  select * into c from public.crew_members where owner = p_owner and member = auth.uid();
  if not found or not public.crew_role(p_owner, auth.uid(), false) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  if c.seen_at is null or c.seen_at < now() - interval '10 seconds' then
    update public.crew_members set seen_at = now() where owner = p_owner and member = auth.uid();
  end if;
  select jsonb_build_object(
      'owner_id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path,
      'online', coalesce(s.updated_at > now() - interval '3 minutes', false),
      'racing', coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false),
      'sim', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.sim, '') else '' end,
      'track', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.track, '') else '' end,
      'car', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.car, '') else '' end,
      'session', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.session, '') else '' end,
      'can_view', true, 'can_control', c.can_control,
      'control_on', c.can_control and public.crew_accepts(p_owner),
      'live', coalesce(l.updated_at > now() - interval '2 minutes', false),
      'age', case when l.updated_at is null then null else extract(epoch from now() - l.updated_at)::int end,
      'data', case when l.updated_at > now() - interval '10 minutes' then l.data end,
      'updated_at', l.updated_at)
    into r
    from public.profiles p
    left join public.user_status s on s.user_id = p.id
    left join public.live_data l on l.user_id = p.id
    where p.id = p_owner;
  return r;
end $$;
revoke all on function public.crew_driver(uuid) from public, anon;
grant execute on function public.crew_driver(uuid) to authenticated;

-- ===========================================================================
-- 5) Komutlar
-- ===========================================================================
create or replace function public.crew_command(p_owner uuid, p_kind text, p_args jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k text := lower(btrim(coalesce(p_kind, '')));
  a jsonb := coalesce(p_args, '{}'::jsonb);
  clean jsonb := '{}'::jsonb;
  lit numeric;
  txt text;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if k not in ('fuel_set', 'fuel_clear', 'tyres_all', 'tyres', 'tyres_clear', 'fast_repair', 'tearoff', 'clear_all', 'message') then
    raise exception 'Bilinmeyen komut';
  end if;
  if jsonb_typeof(a) <> 'object' then
    a := '{}'::jsonb;
  end if;
  -- Mesaj: ekipteki herkes gönderebilir. Pit komutu: değiştirme yetkisi + sürücünün ana anahtarı.
  if k = 'message' then
    if not public.crew_role(p_owner, auth.uid(), false) then
      raise exception 'Bu sürücünün ekibinde değilsin';
    end if;
  else
    if not public.crew_role(p_owner, auth.uid(), true) then
      raise exception 'Bu sürücünün pit ayarlarını değiştirme yetkin yok';
    end if;
    if not public.crew_accepts(p_owner) then
      raise exception 'Sürücü şu an ekip kontrolünü kabul etmiyor';
    end if;
  end if;
  -- Hız sınırı
  if (select count(*) from public.crew_commands
      where sender = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı: dakikada en fazla 30 komut gönderebilirsin';
  end if;

  -- Argümanlar türüne göre yeniden kurulur (bilinmeyen alanlar atılır)
  if k = 'fuel_set' then
    begin
      lit := round((a ->> 'liters')::numeric, 1);
    exception when others then
      lit := null;
    end;
    if lit is null or lit <= 0 or lit > 1000 then
      raise exception 'Yakıt miktarı 1 ile 1000 litre arasında olmalı';
    end if;
    clean := jsonb_build_object('liters', lit);
  elsif k = 'tyres' then
    clean := jsonb_build_object(
      'lf', coalesce(a ->> 'lf', '') = 'true', 'rf', coalesce(a ->> 'rf', '') = 'true',
      'lr', coalesce(a ->> 'lr', '') = 'true', 'rr', coalesce(a ->> 'rr', '') = 'true');
  elsif k in ('fast_repair', 'tearoff') then
    clean := jsonb_build_object('on', coalesce(a ->> 'on', 'true') <> 'false');
  elsif k = 'message' then
    txt := btrim(regexp_replace(coalesce(a ->> 'text', ''), '[[:cntrl:]]+', ' ', 'g'));
    txt := left(regexp_replace(txt, '\s+', ' ', 'g'), 120);
    if txt = '' then
      raise exception 'Mesaj boş';
    end if;
    clean := jsonb_build_object('text', txt);
  end if;

  -- Bakım: süresi dolanlar ve bir haftadan eski kayıtlar
  update public.crew_commands set status = 'expired', result = 'Süresi doldu (sürücünün uygulaması yanıt vermedi)'
    where owner = p_owner and status = 'pending' and created_at < now() - interval '30 seconds';
  delete from public.crew_commands where owner = p_owner and created_at < now() - interval '7 days';

  insert into public.crew_commands (owner, sender, kind, args) values (p_owner, auth.uid(), k, clean)
    returning id into new_id;
  return new_id;
end $$;
revoke all on function public.crew_command(uuid, text, jsonb) from public, anon;
grant execute on function public.crew_command(uuid, text, jsonb) to authenticated;

-- Komutun durumu (gönderen ya da sahip). 30 sn'yi geçen bekleyen komut burada 'expired' olur.
create or replace function public.crew_command_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.crew_commands%rowtype;
begin
  select * into c from public.crew_commands where id = p_id and (owner = auth.uid() or sender = auth.uid());
  if not found then
    return null;
  end if;
  if c.status = 'pending' and c.created_at < now() - interval '30 seconds' then
    update public.crew_commands set status = 'expired', result = 'Süresi doldu (sürücünün uygulaması yanıt vermedi)'
      where id = p_id and status = 'pending'
      returning * into c;
    if not found then
      select * into c from public.crew_commands where id = p_id;
    end if;
  end if;
  return jsonb_build_object('id', c.id, 'kind', c.kind, 'args', c.args, 'status', c.status, 'result', c.result,
                            'created_at', c.created_at, 'applied_at', c.applied_at);
end $$;
revoke all on function public.crew_command_get(uuid) from public, anon;
grant execute on function public.crew_command_get(uuid) to authenticated;

-- Sürücünün uygulaması: uygulanmayı bekleyen taze komutlar (eskiden yeniye). Süresi dolanları kapatır.
-- allowed: komut hâlâ geçerli mi (yetki / ana anahtar bu arada kapatılmış olabilir) — uygulama false olanı reddeder.
drop function if exists public.crew_commands_pending();
create or replace function public.crew_commands_pending()
returns table (id uuid, sender uuid, sender_name text, kind text, args jsonb, created_at timestamptz, allowed boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.crew_commands c set status = 'expired', result = 'Süresi doldu (sürücünün uygulaması yanıt vermedi)'
    where c.owner = auth.uid() and c.status = 'pending' and c.created_at < now() - interval '30 seconds';
  return query
    select c.id, c.sender, p.display_name, c.kind, c.args, c.created_at,
           case when c.kind = 'message' then public.crew_role(c.owner, c.sender, false)
                else public.crew_role(c.owner, c.sender, true) and public.crew_accepts(c.owner) end
    from public.crew_commands c
    join public.profiles p on p.id = c.sender
    where c.owner = auth.uid() and c.status = 'pending'
    order by c.created_at
    limit 20;
end $$;
revoke all on function public.crew_commands_pending() from public, anon;
grant execute on function public.crew_commands_pending() to authenticated;

-- Sürücünün uygulaması: sonucu yaz. Sadece bekleyen komut kapanır (ikinci çağrı yok sayılır).
create or replace function public.crew_command_done(p_id uuid, p_status text, p_result text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_status not in ('applied', 'rejected') then
    raise exception 'Geçersiz durum';
  end if;
  update public.crew_commands
    set status = p_status, result = left(coalesce(p_result, ''), 200), applied_at = now()
    where id = p_id and owner = auth.uid() and status = 'pending';
end $$;
revoke all on function public.crew_command_done(uuid, text, text) from public, anon;
grant execute on function public.crew_command_done(uuid, text, text) to authenticated;

-- Sürücü: son komutlar (yeniden eskiye)
drop function if exists public.crew_history(int);
create or replace function public.crew_history(p_limit int default 20)
returns table (id uuid, sender uuid, sender_name text, kind text, args jsonb, status text, result text,
               created_at timestamptz, applied_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.sender, p.display_name, c.kind, c.args,
         case when c.status = 'pending' and c.created_at < now() - interval '30 seconds' then 'expired' else c.status end,
         c.result, c.created_at, c.applied_at
  from public.crew_commands c
  join public.profiles p on p.id = c.sender
  where c.owner = auth.uid()
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;
revoke all on function public.crew_history(int) from public, anon;
grant execute on function public.crew_history(int) to authenticated;

notify pgrst, 'reload schema';
