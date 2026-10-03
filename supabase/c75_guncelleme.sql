-- ---------------------------------------------------------------------------
-- c75: Ekip — yalnızca YARIŞTAKİ sürücüler, sürücü başına TEK spotter, sohbeti yalnızca spotter yazar,
--      sürücü yarıştan çıkınca oda (sohbet + spotter yeri) kendiliğinden boşalır.
--
-- Kurallar (hepsi sunucuda; istemciler yalnızca gösterir):
--   1) "Yarışta" = crew_racing(owner): user_status.racing (son 2 dk içinde yenilenmiş) YA DA live_data son 60 sn içinde
--      yazılmış (sim'den çıkınca durum hemen "yarışta değil" olur; canlı verinin 60 sn'lik tazeliği bekleme payıdır).
--   2) crew_drivers(): yalnızca yarıştaki sürücüler döner (izleme ya da pit yetkisi verenler; can_control ayırır).
--      Yeni sütunlar: spotter_id, spotter_name, spotter_me. Dönüş sütunu değiştiği için önce düşürülür.
--   3) Tek spotter: crew_rooms (owner, spotter, claimed_at, beat_at, cleared_at). Pit yetkisi olan ekip üyesi paneli
--      açınca (crew_driver(), 3 sn'de bir çağrılır) yer BOŞSA spotter olur ve her çağrıda nabız (beat_at) yazar.
--      Nabız 45 sn kesilirse (panel kapandı / çöktü) yer boşalır; panel kapanırken crew_spot_release() hemen bırakır.
--      Spotter'ın yetkisi kaldırılırsa / arkadaşlık biterse yer o an boş sayılır (crew_spotter_of).
--      Yer doluyken giren herkes İZLEYİCİDİR: canlı veriyi ve sohbeti görür; pit komutu ve mesajı sunucu REDDEDER.
--   4) crew_command(): bütün türler (pit komutları ve eski tek yönlü "message") yalnızca o anki spotter'dan kabul edilir.
--   5) crew_chat_send(): yalnızca o anki spotter yazar (sürücü ve izleyiciler salt okunur). Sürücünün de yazması
--      istenirse fonksiyondaki TEK koşula "and me <> p_owner" eklemek yeter (yorumla işaretli).
--   6) Sürücü yarıştan çıkınca: crew_room_sweep(owner) odanın bütün mesajlarını siler, spotter yerini boşaltır ve
--      cleared_at yazar. Çağrıldığı yerler: crew_room / crew_driver / crew_chat_send (tembel: ilk okumada) ve
--      crew_session_end() (sürücünün uygulaması yarıştan çıktıktan ~70 sn sonra çağırır). crew_chat okuma kuralı da
--      sürücü yarışta değilken satır vermez (silinmemiş mesaj Realtime / doğrudan okuma ile sızmasın).
--   7) crew_room(): yeni alanlar racing, spotter {id, name} | null, spotter_me, can_write, cleared_at; üyelerde spotter.
--      crew_driver(): yeni alanlar racing_now, spotter_id, spotter_name, spotter_me; control_on artık "yetkim var VE
--      sürücü kabul ediyor VE spotter benim" (eski istemciler de izleyiciyken düğmeleri kapatır).
--   PRO kuralı değişmedi: pit komutu için crew_accepts() (sürücünün ana anahtarı + social.crew PRO).
--
-- Bu dosyanın oluşturduğu / değiştirdiği:
--   tablo     crew_rooms
--   yardımcı  crew_racing(uuid), crew_spotter_of(uuid), crew_room_sweep(uuid)          (dışarıya kapalı)
--             crew_chat_readable(uuid)                                                 (okuma kuralı için)
--   kural     crew_chat "crew chat read"
--   RPC       crew_drivers(), crew_driver(uuid), crew_command(uuid, text, jsonb), crew_chat_send(uuid, text),
--             crew_room(uuid, timestamptz, int)  — c53 / c64 tanımlarının yenisi
--             crew_spot_release(uuid), crew_session_end()  — yeni
-- Sıra: c53, c58, c64, c65 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create table if not exists public.crew_rooms (
  owner uuid primary key references public.profiles (id) on delete cascade,
  spotter uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  beat_at timestamptz,
  cleared_at timestamptz
);
alter table public.crew_rooms enable row level security;
-- Doğrudan erişim yok: yalnızca aşağıdaki security definer fonksiyonlar okur / yazar
revoke all on public.crew_rooms from public, anon, authenticated;
grant all on public.crew_rooms to service_role;

-- Sürücü şu an yarışta mı (oyuna bağlı ve durumu taze, ya da canlı verisi son 60 sn içinde geldi)
create or replace function public.crew_racing(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_status s
                  where s.user_id = p_owner and s.racing and s.updated_at > now() - interval '2 minutes')
      or exists (select 1 from public.live_data l
                  where l.user_id = p_owner and l.updated_at > now() - interval '60 seconds');
$$;
revoke all on function public.crew_racing(uuid) from public, anon, authenticated;
grant execute on function public.crew_racing(uuid) to service_role;

-- O anki spotter (yoksa null): nabzı taze ve pit yetkisi hâlâ geçerli olmalı
create or replace function public.crew_spotter_of(p_owner uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select r.spotter from public.crew_rooms r
   where r.owner = p_owner and r.spotter is not null
     and r.beat_at > now() - interval '45 seconds'
     and public.crew_role(r.owner, r.spotter, true);
$$;
revoke all on function public.crew_spotter_of(uuid) from public, anon, authenticated;
grant execute on function public.crew_spotter_of(uuid) to service_role;

-- Oda bakımı: sürücü yarışta değilse sohbeti sil ve spotter yerini boşalt. Dönüş: sürücü yarışta mı.
create or replace function public.crew_room_sweep(p_owner uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  if public.crew_racing(p_owner) then
    return true;
  end if;
  delete from public.crew_chat where owner = p_owner;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.crew_rooms (owner, spotter, claimed_at, beat_at, cleared_at)
      values (p_owner, null, null, null, now())
    on conflict (owner) do update
      set spotter = null, claimed_at = null, beat_at = null, cleared_at = now();
  else
    update public.crew_rooms set spotter = null, claimed_at = null, beat_at = null
      where owner = p_owner and spotter is not null;
  end if;
  return false;
end $$;
revoke all on function public.crew_room_sweep(uuid) from public, anon, authenticated;
grant execute on function public.crew_room_sweep(uuid) to service_role;

-- Sohbet okuma kuralı: odayı görebiliyorum VE sürücü yarışta
create or replace function public.crew_chat_readable(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.crew_chat_visible(p_owner) and public.crew_racing(p_owner);
$$;
revoke all on function public.crew_chat_readable(uuid) from public, anon;
grant execute on function public.crew_chat_readable(uuid) to authenticated, service_role;

drop policy if exists "crew chat read" on public.crew_chat;
create policy "crew chat read" on public.crew_chat for select using (public.crew_chat_readable(owner));

-- ===========================================================================
-- Ekip üyesi tarafı: sürücü listesi ve panel
-- ===========================================================================
-- Ekibinde olduğum VE şu an yarışta olan sürücüler. control_on: yetkim var VE sürücü komut kabul ediyor.
drop function if exists public.crew_drivers();
create or replace function public.crew_drivers()
returns table (owner_id uuid, display_name text, avatar_path text, online boolean, racing boolean, sim text,
               track text, car text, session text, can_view boolean, can_control boolean, control_on boolean,
               live boolean, data jsonb, updated_at timestamptz,
               spotter_id uuid, spotter_name text, spotter_me boolean)
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
         l.updated_at,
         sp.id,
         (select sn.display_name from public.profiles sn where sn.id = sp.id),
         coalesce(sp.id = auth.uid(), false)
  from public.crew_members c
  join public.profiles p on p.id = c.owner
  join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
  left join public.user_status s on s.user_id = c.owner
  left join public.live_data l on l.user_id = c.owner
  cross join lateral (select public.crew_spotter_of(c.owner) as id) sp
  where c.member = auth.uid() and (c.can_view or c.can_control)
    and public.crew_racing(c.owner)
  order by c.can_control desc,
           coalesce(l.updated_at > now() - interval '2 minutes', false) desc,
           s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.crew_drivers() from public, anon;
grant execute on function public.crew_drivers() to authenticated;

-- Tek sürücünün paneli (ekip üyesi 3 sn'de bir çağırır): "bağlı" göstergesi + spotter yeri (al / nabız)
create or replace function public.crew_driver(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.crew_members%rowtype;
  r jsonb;
  v_racing boolean;
  v_spot uuid;
begin
  if me is null then
    raise exception 'Giriş gerekli';
  end if;
  select * into c from public.crew_members where owner = p_owner and member = me;
  if not found or not public.crew_role(p_owner, me, false) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  if c.seen_at is null or c.seen_at < now() - interval '10 seconds' then
    update public.crew_members set seen_at = now() where owner = p_owner and member = me;
  end if;
  -- Sürücü yarıştan çıktıysa oda boşaltılır
  v_racing := public.crew_room_sweep(p_owner);
  -- Spotter yeri: pit yetkim varsa ve yer boşsa (ya da zaten bendeyse) al / nabzı yenile (5 sn'de bir yazılır)
  if v_racing and c.can_control then
    insert into public.crew_rooms as cr (owner, spotter, claimed_at, beat_at)
      values (p_owner, me, now(), now())
    on conflict (owner) do update
      set spotter = excluded.spotter,
          claimed_at = case when cr.spotter is not distinct from excluded.spotter and cr.claimed_at is not null
                            then cr.claimed_at else now() end,
          beat_at = now()
      where cr.spotter is null
         or cr.beat_at is null
         or cr.beat_at < now() - interval '45 seconds'
         or not public.crew_role(cr.owner, cr.spotter, true)
         or (cr.spotter = excluded.spotter and cr.beat_at < now() - interval '5 seconds');
  end if;
  v_spot := public.crew_spotter_of(p_owner);
  select jsonb_build_object(
      'owner_id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path,
      'online', coalesce(s.updated_at > now() - interval '3 minutes', false),
      'racing', coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false),
      'sim', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.sim, '') else '' end,
      'track', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.track, '') else '' end,
      'car', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.car, '') else '' end,
      'session', case when s.updated_at > now() - interval '3 minutes' then coalesce(s.session, '') else '' end,
      'can_view', true, 'can_control', c.can_control,
      'control_on', c.can_control and public.crew_accepts(p_owner) and coalesce(v_spot = me, false),
      'racing_now', v_racing,
      'spotter_id', v_spot,
      'spotter_name', (select sn.display_name from public.profiles sn where sn.id = v_spot),
      'spotter_me', coalesce(v_spot = me, false),
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

-- Spotter yerini bırak (panel kapanırken / başka sürücüye geçerken). Yer bende değilse hiçbir şey yapmaz.
create or replace function public.crew_spot_release(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.crew_rooms set spotter = null, claimed_at = null, beat_at = null
    where owner = p_owner and spotter = auth.uid();
end $$;
revoke all on function public.crew_spot_release(uuid) from public, anon;
grant execute on function public.crew_spot_release(uuid) to authenticated;

-- Sürücünün uygulaması: yarıştan çıktım (odam boşaltılsın). Hâlâ yarışta görünüyorsam hiçbir şey silinmez.
create or replace function public.crew_session_end() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  return not public.crew_room_sweep(auth.uid());
end $$;
revoke all on function public.crew_session_end() from public, anon;
grant execute on function public.crew_session_end() to authenticated;

-- ===========================================================================
-- Komutlar: yalnızca o anki spotter (c53 tanımı + spotter denetimi)
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
  if k = 'message' then
    if not public.crew_role(p_owner, auth.uid(), false) then
      raise exception 'Bu sürücünün ekibinde değilsin';
    end if;
    -- c75: mesajı da yalnızca spotter yazar
    if public.crew_spotter_of(p_owner) is distinct from auth.uid() then
      raise exception 'Sadece spotter mesaj yazabilir';
    end if;
  else
    if not public.crew_role(p_owner, auth.uid(), true) then
      raise exception 'Bu sürücünün pit ayarlarını değiştirme yetkin yok';
    end if;
    -- c75: sürücü başına tek spotter; yer başkasındaysa (ya da henüz alınmadıysa) komut reddedilir
    if public.crew_spotter_of(p_owner) is distinct from auth.uid() then
      raise exception 'Pit ayarlarını şu an başka bir spotter yönetiyor: sadece izleyebilirsin';
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

-- ===========================================================================
-- Ekip odası: yalnızca spotter yazar; sürücü yarışta değilken oda boştur
-- ===========================================================================
create or replace function public.crew_chat_send(p_owner uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  txt text;
  new_id uuid;
begin
  if me is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_owner is null or not public.crew_chat_visible(p_owner) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  if not public.crew_room_sweep(p_owner) then
    return null; -- sürücü yarışta değil: oda kapalı (sweep'in silmesi geri alınmasın diye hata fırlatılmaz)
  end if;
  -- YAZMA KURALI (tek koşul): yalnızca o anki spotter yazar; sürücü ve izleyiciler salt okunur.
  -- Sürücü de yazabilsin istenirse koşula şunu ekle:  and me <> p_owner
  if public.crew_spotter_of(p_owner) is distinct from me then
    raise exception 'Sadece spotter mesaj yazabilir';
  end if;
  txt := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
  txt := left(regexp_replace(txt, '\s+', ' ', 'g'), 300);
  if txt = '' then
    raise exception 'Mesaj boş';
  end if;
  -- Hız sınırı
  if (select count(*) from public.crew_chat
      where sender = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Çok hızlı: dakikada en fazla 20 mesaj gönderebilirsin';
  end if;
  -- Bakım: 24 saatten eski mesajlar ve son 200 mesajın dışındakiler
  delete from public.crew_chat where owner = p_owner and created_at < now() - interval '24 hours';
  delete from public.crew_chat where owner = p_owner and id in (
    select id from public.crew_chat where owner = p_owner order by created_at desc offset 200);

  insert into public.crew_chat (owner, sender, body) values (p_owner, me, txt) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.crew_chat_send(uuid, text) from public, anon;
grant execute on function public.crew_chat_send(uuid, text) to authenticated;

-- Oda durumu: sürücü, spotter, odadakiler ve mesajlar
create or replace function public.crew_room(p_owner uuid, p_after timestamptz default null, p_limit int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 60), 1), 200);
  v_driver jsonb;
  v_members jsonb;
  v_msgs jsonb;
  v_racing boolean;
  v_spot uuid;
  v_spot_name text;
  v_cleared timestamptz;
begin
  if me is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_owner is null or not public.crew_chat_visible(p_owner) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  -- Ekip üyesi: oda açıkken "bağlı" görünür
  if me <> p_owner then
    update public.crew_members set seen_at = now()
      where owner = p_owner and member = me and (seen_at is null or seen_at < now() - interval '10 seconds');
  end if;
  -- Sürücü yarıştan çıktıysa sohbet silinir, spotter yeri boşalır
  v_racing := public.crew_room_sweep(p_owner);
  v_spot := public.crew_spotter_of(p_owner);
  if v_spot is not null then
    select display_name into v_spot_name from public.profiles where id = v_spot;
  end if;
  select cleared_at into v_cleared from public.crew_rooms where owner = p_owner;

  select jsonb_build_object(
      'id', p.id, 'name', p.display_name, 'avatar_path', p.avatar_path,
      'online', coalesce(s.updated_at > now() - interval '3 minutes', false),
      'racing', coalesce(s.updated_at > now() - interval '3 minutes' and s.racing, false))
    into v_driver
    from public.profiles p
    left join public.user_status s on s.user_id = p.id
    where p.id = p_owner;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.member, 'name', p.display_name, 'avatar_path', p.avatar_path,
      'can_control', c.can_control,
      'spotter', coalesce(c.member = v_spot, false),
      'present', coalesce(c.seen_at > now() - interval '45 seconds', false),
      'me', c.member = me)
      order by coalesce(c.member = v_spot, false) desc,
               coalesce(c.seen_at > now() - interval '45 seconds', false) desc, c.can_control desc, p.display_name), '[]'::jsonb)
    into v_members
    from public.crew_members c
    join public.profiles p on p.id = c.member
    join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
    where c.owner = p_owner and (c.can_view or c.can_control);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'sender', x.sender, 'name', x.display_name, 'role', x.role, 'body', x.body, 'at', x.created_at)
      order by x.created_at), '[]'::jsonb)
    into v_msgs
    from (
      select m.id, m.sender, m.body, m.created_at, p.display_name,
             case when m.sender = p_owner then 'driver'
                  when c.member is null then 'gone'
                  when c.can_control then 'control' else 'view' end as role
      from public.crew_chat m
      join public.profiles p on p.id = m.sender
      left join public.crew_members c on c.owner = m.owner and c.member = m.sender
      where m.owner = p_owner and (p_after is null or m.created_at > p_after)
      order by m.created_at desc
      limit lim) x;

  return jsonb_build_object(
    'driver', v_driver,
    'control_on', public.crew_accepts(p_owner),
    'racing', v_racing,
    'spotter', case when v_spot is null then null else jsonb_build_object('id', v_spot, 'name', v_spot_name) end,
    'spotter_me', coalesce(v_spot = me, false),
    'can_write', coalesce(v_spot = me, false),
    'cleared_at', v_cleared,
    'members', v_members,
    'messages', v_msgs,
    'now', now());
end $$;
revoke all on function public.crew_room(uuid, timestamptz, int) from public, anon;
grant execute on function public.crew_room(uuid, timestamptz, int) to authenticated;

notify pgrst, 'reload schema';
