-- ---------------------------------------------------------------------------
-- c64: Ekip odası (sohbet) + odada kimler var.
--
-- Ekip Pitwall'ı artık gerçek bir sohbet odasıdır: her sürücünün (owner) bir odası vardır; odayı sürücünün
-- kendisi ve ekibindeki (crew_members: görebilir / değiştirebilir, arkadaşlığı süren) üyeler okur ve yazar.
-- Eski tek yönlü "message" komutu (crew_command) yerinde durur (eski uygulama / site sürümleri için).
--
--   crew_chat (id, owner, sender, body, created_at)   oda mesajları. Realtime yayınında (sürücünün uygulaması
--        yeni mesajı anında alır); okuma kuralı: sürücü ya da ekip üyesi. Doğrudan yazma hakkı yoktur.
--   crew_chat_visible(p_owner) -> boolean             okuma kuralı yardımcısı (ben sürücüyüm ya da ekibindeyim)
--   crew_chat_send(p_owner, p_body) -> uuid           mesaj yaz (1–300 karakter; dakikada en fazla 20 mesaj).
--        Her yazışta bakım: odanın 24 saatten eski mesajları ve son 200 mesajın dışındakiler silinir.
--   crew_room(p_owner, p_after, p_limit) -> jsonb     oda durumu (panel 2–3 sn'de bir çağırır):
--        { driver:  { id, name, avatar_path, online, racing },
--          control_on: sürücü şu an pit komutu kabul ediyor,
--          members: [ { id, name, avatar_path, can_control, present, me } ]   (present: paneli son 45 sn'de açık)
--          messages: [ { id, sender, name, role: 'driver' | 'control' | 'view' | 'gone', body, at } ]  (eskiden yeniye)
--          now: sunucu saati }
--        p_after verilirse yalnızca o andan sonraki mesajlar döner. Ekip üyesi çağırırsa seen_at'i de yazar
--        (10 sn'de bir), yani oda açıkken "bağlı" görünür.
-- Sıra: c53 / c58 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create table if not exists public.crew_chat (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  sender uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists crew_chat_owner on public.crew_chat (owner, created_at desc);
create index if not exists crew_chat_sender on public.crew_chat (sender, created_at desc);
alter table public.crew_chat enable row level security;

-- Okuma kuralı yardımcısı (crew_role dışarıya kapalı olduğu için security definer sarmalayıcı)
create or replace function public.crew_chat_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (auth.uid() = p_owner or public.crew_role(p_owner, auth.uid(), false));
$$;
revoke all on function public.crew_chat_visible(uuid) from public, anon;
grant execute on function public.crew_chat_visible(uuid) to authenticated, service_role;

drop policy if exists "crew chat read" on public.crew_chat;
create policy "crew chat read" on public.crew_chat for select using (public.crew_chat_visible(owner));
revoke all on public.crew_chat from public, anon, authenticated;
grant select on public.crew_chat to authenticated;
grant all on public.crew_chat to service_role;

do $$ begin
  alter publication supabase_realtime add table public.crew_chat;
exception when others then null; end $$;

-- Mesaj yaz: sürücü kendi odasına, ekip üyesi sürücünün odasına
create or replace function public.crew_chat_send(p_owner uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  txt text;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_owner is null or not public.crew_chat_visible(p_owner) then
    raise exception 'Bu sürücünün ekibinde değilsin';
  end if;
  txt := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
  txt := left(regexp_replace(txt, '\s+', ' ', 'g'), 300);
  if txt = '' then
    raise exception 'Mesaj boş';
  end if;
  -- Hız sınırı
  if (select count(*) from public.crew_chat
      where sender = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Çok hızlı: dakikada en fazla 20 mesaj gönderebilirsin';
  end if;
  -- Bakım: 24 saatten eski mesajlar ve son 200 mesajın dışındakiler
  delete from public.crew_chat where owner = p_owner and created_at < now() - interval '24 hours';
  delete from public.crew_chat where owner = p_owner and id in (
    select id from public.crew_chat where owner = p_owner order by created_at desc offset 200);

  insert into public.crew_chat (owner, sender, body) values (p_owner, auth.uid(), txt) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.crew_chat_send(uuid, text) from public, anon;
grant execute on function public.crew_chat_send(uuid, text) to authenticated;

-- Oda durumu: sürücü, yetkililer (kim odada, kim pit ayarlarını değiştirebilir) ve mesajlar
create or replace function public.crew_room(p_owner uuid, p_after timestamptz default null, p_limit int default 60) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 60), 1), 200);
  v_driver jsonb;
  v_members jsonb;
  v_msgs jsonb;
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
      'present', coalesce(c.seen_at > now() - interval '45 seconds', false),
      'me', c.member = me)
      order by coalesce(c.seen_at > now() - interval '45 seconds', false) desc, c.can_control desc, p.display_name), '[]'::jsonb)
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
    'members', v_members,
    'messages', v_msgs,
    'now', now());
end $$;
revoke all on function public.crew_room(uuid, timestamptz, int) from public, anon;
grant execute on function public.crew_room(uuid, timestamptz, int) to authenticated;
