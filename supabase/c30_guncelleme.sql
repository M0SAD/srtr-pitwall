-- ---------------------------------------------------------------------------
-- c30: Takımlar, takım duyuru panosu, takım sohbet odası ve anketler, arkadaşa özel bildirim/ses kapatma.
--      1) Takımlar: teams (ad, etiket, açıklama, logo, renk, katılım şekli: open | request | invite),
--         team_members (owner | admin | member), team_invites (invite: takım davet etti, request: üye katılmak istedi).
--         Kuran sahip olur; sahip yönetici atar/alır, sahipliği devreder, takımı siler. Yöneticiler davet eder,
--         katılma isteklerini onaylar, üye çıkarır, duyuru yazar/sabitler, takımı düzenler.
--         Logolar herkese açık "teams" kovasında, <kullanıcı id>/<dosya>.
--         same_team(a, b): iki üye ortak bir takımda mı (c29'daki taslağın gerçek hali; telemetri paylaşımı bunu kullanır).
--      2) Duyuru panosu: team_posts (sadece sahip/yöneticiler yazar), team_post_comments (üyeler yorum yazar),
--         teams.pinned_post (sabit duyuru). Yeni duyuruda üyelere 'team_announcement' bildirimi (e-posta yok).
--      3) Sohbet odası: team_messages (Realtime), team_chat_state (okundu zamanı, odayı sessize alma),
--         team_message_hidden (benden sil). Kendi mesajını (yönetici her mesajı) herkesten silme: içerik boşaltılır.
--      4) Anketler: team_polls (soru, 2-6 seçenek, tek/çok seçim, bitiş zamanı, canlı sayılar) + team_poll_votes.
--         Bitiş zamanından sonra oy verilemez; anketi açan ya da yönetici erken bitirebilir.
--      5) Arkadaşa özel: friendships.notify_muted (bildirim/açılır pencere yok), sound_muted (ses yok) → friend_prefs().
--      Bildirim türleri: team_invite, team_request, team_accepted, team_announcement, team_role.
-- Sıra: c28 ve c29'dan sonra. (c29 same_team taslağını sadece yoksa oluşturur; sıra karışsa da buradaki gerçek hali kalır.)
-- ---------------------------------------------------------------------------

-- 1) Takımlar -------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  tag text not null check (char_length(tag) between 2 and 5),
  description text not null default '' check (char_length(description) <= 1000),
  color text not null default '#4ea1ff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text not null default '' check (char_length(logo_path) <= 200),
  join_mode text not null default 'request' check (join_mode in ('open', 'request', 'invite')),
  owner uuid not null references public.profiles (id) on delete cascade,
  pinned_post uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_name_key on public.teams (lower(name));
create unique index if not exists teams_tag_key on public.teams (upper(tag));
create index if not exists teams_owner on public.teams (owner);
alter table public.teams enable row level security;
drop policy if exists "teams public read" on public.teams;
create policy "teams public read" on public.teams for select using (true);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members (user_id);
create unique index if not exists team_members_one_owner on public.team_members (team_id) where role = 'owner';
alter table public.team_members enable row level security;
drop policy if exists "team members public read" on public.team_members;
create policy "team members public read" on public.team_members for select using (true);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('invite', 'request')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index if not exists team_invites_user on public.team_invites (user_id);
create index if not exists team_invites_by on public.team_invites (invited_by, created_at desc);
alter table public.team_invites enable row level security;

-- Yardımcılar (security definer: RLS döngüsüne girmeden üyelik denetimi)
create or replace function public.team_role(p_team uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.team_members where team_id = p_team and user_id = p_user;
$$;
create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid());
$$;
create or replace function public.is_team_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid() and role in ('owner', 'admin'));
$$;

-- İki üye ortak bir takımda mı (c29'daki taslağın yerine; telemetri görünürlüğü bunu kullanır)
create or replace function public.same_team(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.team_members x
    join public.team_members y on y.team_id = x.team_id
    where x.user_id = a and y.user_id = b);
$$;

drop policy if exists "team invites read" on public.team_invites;
create policy "team invites read" on public.team_invites for select using (auth.uid() = user_id or public.is_team_admin(team_id));

-- 2) Duyuru panosu ----------------------------------------------------------------
create table if not exists public.team_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists team_posts_team on public.team_posts (team_id, created_at desc);
alter table public.team_posts enable row level security;
drop policy if exists "team posts members" on public.team_posts;
create policy "team posts members" on public.team_posts for select using (public.is_team_member(team_id));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teams_pinned_post_fkey') then
    alter table public.teams add constraint teams_pinned_post_fkey
      foreign key (pinned_post) references public.team_posts (id) on delete set null;
  end if;
end $$;

create table if not exists public.team_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.team_posts (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists team_post_comments_post on public.team_post_comments (post_id, created_at);
create index if not exists team_post_comments_author on public.team_post_comments (author, created_at desc);
alter table public.team_post_comments enable row level security;
drop policy if exists "team comments members" on public.team_post_comments;
create policy "team comments members" on public.team_post_comments for select using (public.is_team_member(team_id));

-- 3) Sohbet odası ve 4) anketler ---------------------------------------------------
create table if not exists public.team_polls (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  question text not null check (char_length(question) between 1 and 200),
  options text[] not null check (cardinality(options) between 2 and 6),
  multi boolean not null default false,
  ends_at timestamptz not null,
  counts int[] not null,
  voters int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_polls_team on public.team_polls (team_id, created_at desc);
alter table public.team_polls enable row level security;
drop policy if exists "team polls members" on public.team_polls;
create policy "team polls members" on public.team_polls for select using (public.is_team_member(team_id));

create table if not exists public.team_poll_votes (
  poll_id uuid not null references public.team_polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option smallint not null check (option between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option)
);
alter table public.team_poll_votes enable row level security;
drop policy if exists "team poll votes members" on public.team_poll_votes;
create policy "team poll votes members" on public.team_poll_votes for select using (
  exists (select 1 from public.team_polls p where p.id = poll_id and public.is_team_member(p.team_id)));

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  sender uuid references public.profiles (id) on delete set null,
  body text not null default '' check (char_length(body) <= 1000),
  poll_id uuid references public.team_polls (id) on delete cascade,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (deleted or poll_id is not null or char_length(body) >= 1)
);
create index if not exists team_messages_team on public.team_messages (team_id, created_at desc);
create index if not exists team_messages_sender on public.team_messages (sender, created_at desc);
alter table public.team_messages enable row level security;

create table if not exists public.team_message_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.team_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists team_message_hidden_message on public.team_message_hidden (message_id);
alter table public.team_message_hidden enable row level security;
drop policy if exists "own hidden team messages" on public.team_message_hidden;
create policy "own hidden team messages" on public.team_message_hidden for select using (auth.uid() = user_id);

create or replace function public.team_message_hidden_for(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_message_hidden h where h.user_id = auth.uid() and h.message_id = p_id);
$$;

drop policy if exists "team messages members" on public.team_messages;
create policy "team messages members" on public.team_messages for select using (
  public.is_team_member(team_id) and not public.team_message_hidden_for(id));

-- Üyenin odadaki kişisel durumu: son okuma ve sessize alma
create table if not exists public.team_chat_state (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.team_chat_state enable row level security;
drop policy if exists "own team chat state" on public.team_chat_state;
create policy "own team chat state" on public.team_chat_state for select using (auth.uid() = user_id);

-- Depolama: herkese açık "teams" kovası (logolar), <kullanıcı id>/<dosya>. Üye sadece kendi klasörüne yükler.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teams', 'teams', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "teams own upload" on storage.objects;
create policy "teams own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'teams' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "teams read" on storage.objects;
create policy "teams read" on storage.objects for select using (bucket_id = 'teams');
drop policy if exists "teams delete" on storage.objects;
create policy "teams delete" on storage.objects for delete to authenticated
  using (bucket_id = 'teams' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- RPC'ler
-- ---------------------------------------------------------------------------

-- Ad / etiket / renk / katılım / logo denetimi (hata mesajları kullanıcıya gösterilir)
create or replace function public.team_check(p_name text, p_tag text, p_color text, p_join_mode text, p_logo text)
returns void language plpgsql immutable as $$
begin
  if char_length(coalesce(p_name, '')) not between 2 and 40 then
    raise exception 'Takım adı 2-40 karakter olmalı';
  end if;
  if coalesce(p_tag, '') !~ '^[[:alnum:]]{2,5}$' then
    raise exception 'Etiket 2-5 harf ya da rakam olmalı';
  end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Geçersiz renk';
  end if;
  if coalesce(p_join_mode, '') not in ('open', 'request', 'invite') then
    raise exception 'Geçersiz katılım şekli';
  end if;
  if coalesce(p_logo, '') <> '' and p_logo !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' then
    raise exception 'Geçersiz logo';
  end if;
end $$;

-- İç yardımcı: üyeyi ekle (sınırlar burada); istemciye açık değil
create or replace function public.team_add_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    delete from public.team_invites where team_id = p_team and user_id = p_user;
    return;
  end if;
  if (select count(*) from public.team_members where team_id = p_team) >= 100 then
    raise exception 'Takım dolu (en fazla 100 üye)';
  end if;
  if (select count(*) from public.team_members where user_id = p_user) >= 10 then
    raise exception 'Bir üye en fazla 10 takımda olabilir';
  end if;
  insert into public.team_members (team_id, user_id, role) values (p_team, p_user, 'member');
  insert into public.team_chat_state (team_id, user_id) values (p_team, p_user)
    on conflict (team_id, user_id) do update set last_read_at = now();
  delete from public.team_invites where team_id = p_team and user_id = p_user;
end $$;

create or replace function public.team_create(p_name text, p_tag text, p_description text default '',
  p_color text default '#4ea1ff', p_logo text default '', p_join_mode text default 'request') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tid uuid;
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
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
  insert into public.teams (name, tag, description, color, logo_path, join_mode, owner)
    values (v_name, v_tag, left(trim(coalesce(p_description, '')), 1000), p_color, coalesce(p_logo, ''), p_join_mode, me)
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.team_chat_state (team_id, user_id) values (tid, me);
  return tid;
end $$;

create or replace function public.team_update(p_team uuid, p_name text, p_tag text, p_description text,
  p_color text, p_logo text, p_join_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag text := upper(trim(coalesce(p_tag, '')));
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri düzenleyebilir';
  end if;
  perform public.team_check(v_name, v_tag, p_color, p_join_mode, p_logo);
  if exists (select 1 from public.teams where lower(name) = lower(v_name) and id <> p_team) then
    raise exception 'Bu takım adı kullanılıyor';
  end if;
  if exists (select 1 from public.teams where upper(tag) = v_tag and id <> p_team) then
    raise exception 'Bu etiket kullanılıyor';
  end if;
  update public.teams set name = v_name, tag = v_tag, description = left(trim(coalesce(p_description, '')), 1000),
    color = p_color, logo_path = coalesce(p_logo, ''), join_mode = p_join_mode, updated_at = now()
    where id = p_team;
end $$;

-- Takımı sil: sahip ya da site yöneticisi (moderasyon)
create or replace function public.team_delete(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then
    raise exception 'Takım bulunamadı';
  end if;
  if t.owner <> auth.uid() and not public.is_admin() then
    raise exception 'Takımı sadece sahibi silebilir';
  end if;
  delete from public.notifications where kind in ('team_invite', 'team_request') and data ->> 'team' = p_team::text;
  delete from public.teams where id = p_team;
  if t.owner <> auth.uid() then
    perform public.log_mod('team_delete', 'team', p_team::text, t.owner,
      jsonb_build_object('name', t.name, 'tag', t.tag, 'description', left(t.description, 200)));
  end if;
end $$;

-- Davet et (sahip/yönetici). Kişi zaten katılmak istemişse doğrudan üye olur.
create or replace function public.team_invite(p_team uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
  inv public.team_invites;
  iid uuid;
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri davet edebilir';
  end if;
  if p_user is null or p_user = me or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Geçersiz kullanıcı';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    raise exception 'Bu kişi zaten takımda';
  end if;
  select * into t from public.teams where id = p_team;
  select * into inv from public.team_invites where team_id = p_team and user_id = p_user;
  if inv.kind = 'request' then
    perform public.team_add_member(p_team, p_user);
    delete from public.notifications where kind = 'team_request' and data ->> 'invite' = inv.id::text;
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'team_accepted', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag));
    return 'joined';
  end if;
  if inv.kind = 'invite' then
    return 'pending';
  end if;
  if (select count(*) from public.team_invites where invited_by = me and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Bugün çok fazla davet gönderdin';
  end if;
  insert into public.team_invites (team_id, user_id, kind, invited_by) values (p_team, p_user, 'invite', me) returning id into iid;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'team_invite', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'invite', iid,
      'from', me, 'name', coalesce((select display_name from public.profiles where id = me), '?')));
  return 'invited';
end $$;

-- Katılmak iste: açık takıma doğrudan katılır, davet varsa kabul edilir, onaylı takımda istek gönderilir
create or replace function public.team_request(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
  inv public.team_invites;
  iid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  select * into t from public.teams where id = p_team;
  if t.id is null then
    raise exception 'Takım bulunamadı';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = me) then
    raise exception 'Zaten bu takımdasın';
  end if;
  select * into inv from public.team_invites where team_id = p_team and user_id = me;
  if inv.kind = 'invite' or t.join_mode = 'open' then
    perform public.team_add_member(p_team, me);
    if inv.id is not null then
      delete from public.notifications where kind = 'team_invite' and data ->> 'invite' = inv.id::text;
    end if;
    return 'joined';
  end if;
  if inv.kind = 'request' then
    return 'pending';
  end if;
  if t.join_mode = 'invite' then
    raise exception 'Bu takım sadece davetle üye alıyor';
  end if;
  if (select count(*) from public.team_invites where user_id = me and kind = 'request' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün çok fazla katılma isteği gönderdin';
  end if;
  insert into public.team_invites (team_id, user_id, kind) values (p_team, me, 'request') returning id into iid;
  insert into public.notifications (user_id, kind, data)
    select m.user_id, 'team_request', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'invite', iid,
      'from', me, 'name', coalesce((select display_name from public.profiles where id = me), '?'))
    from public.team_members m where m.team_id = p_team and m.role in ('owner', 'admin');
  return 'requested';
end $$;

-- Davete / isteğe yanıt. Davet: kabul eden davetli; istek: kabul eden sahip/yönetici. Reddetme/iptal: iki taraf da.
create or replace function public.team_respond(p_invite uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  inv public.team_invites;
  t public.teams;
  adm boolean;
begin
  select * into inv from public.team_invites where id = p_invite;
  if inv.id is null then
    raise exception 'Davet bulunamadı';
  end if;
  adm := public.is_team_admin(inv.team_id);
  if inv.user_id <> me and not adm then
    raise exception 'yetki yok';
  end if;
  if p_accept then
    if inv.kind = 'invite' and inv.user_id <> me then
      raise exception 'Daveti sadece davet edilen kabul edebilir';
    end if;
    if inv.kind = 'request' and not adm then
      raise exception 'Katılma isteğini sadece takım sahibi ve yöneticileri onaylayabilir';
    end if;
    perform public.team_add_member(inv.team_id, inv.user_id);
    if inv.kind = 'request' then
      select * into t from public.teams where id = inv.team_id;
      insert into public.notifications (user_id, kind, data)
        values (inv.user_id, 'team_accepted', jsonb_build_object('team', t.id, 'team_name', t.name, 'tag', t.tag));
    end if;
  else
    delete from public.team_invites where id = p_invite;
  end if;
  delete from public.notifications where kind in ('team_invite', 'team_request') and data ->> 'invite' = p_invite::text;
end $$;

-- Takımdan ayrıl (sahip önce devretmeli ya da silmeli)
create or replace function public.team_leave(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r text := public.team_role(p_team, auth.uid());
begin
  if r is null then
    raise exception 'Bu takımda değilsin';
  end if;
  if r = 'owner' then
    raise exception 'Takım sahibi ayrılmadan önce sahipliği devretmeli ya da takımı silmeli';
  end if;
  delete from public.team_members where team_id = p_team and user_id = me;
  delete from public.team_chat_state where team_id = p_team and user_id = me;
end $$;

-- Üye çıkar: sahip herkesi, yönetici sadece üyeleri
create or replace function public.team_kick(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  mine text := public.team_role(p_team, auth.uid());
  theirs text := public.team_role(p_team, p_user);
begin
  if mine not in ('owner', 'admin') or mine is null then
    raise exception 'Sadece takım sahibi ve yöneticileri üye çıkarabilir';
  end if;
  if theirs is null then
    raise exception 'Bu kişi takımda değil';
  end if;
  if theirs = 'owner' or (mine = 'admin' and theirs <> 'member') then
    raise exception 'Bu kişiyi çıkaramazsın';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  delete from public.team_chat_state where team_id = p_team and user_id = p_user;
end $$;

-- Yönetici yap / yöneticiliği al (sadece sahip)
create or replace function public.team_set_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  theirs text := public.team_role(p_team, p_user);
  t public.teams;
begin
  if public.team_role(p_team, auth.uid()) is distinct from 'owner' then
    raise exception 'Rolleri sadece takım sahibi değiştirebilir';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Geçersiz rol';
  end if;
  if theirs is null or theirs = 'owner' then
    raise exception 'Bu kişinin rolü değiştirilemez';
  end if;
  if theirs = p_role then
    return;
  end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
  if p_role = 'admin' then
    select * into t from public.teams where id = p_team;
    insert into public.notifications (user_id, kind, data)
      values (p_user, 'team_role', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'role', 'admin',
        'name', coalesce((select display_name from public.profiles where id = auth.uid()), '?')));
  end if;
end $$;

-- Sahipliği devret (sahip yönetici olur)
create or replace function public.team_transfer(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t public.teams;
begin
  if public.team_role(p_team, me) is distinct from 'owner' then
    raise exception 'Sahipliği sadece takım sahibi devredebilir';
  end if;
  if p_user = me or public.team_role(p_team, p_user) is null then
    raise exception 'Sahiplik sadece takımdaki başka bir üyeye devredilebilir';
  end if;
  if (select count(*) from public.teams where owner = p_user) >= 3 then
    raise exception 'Bu üye zaten 3 takımın sahibi';
  end if;
  update public.team_members set role = 'admin' where team_id = p_team and user_id = me;
  update public.team_members set role = 'owner' where team_id = p_team and user_id = p_user;
  update public.teams set owner = p_user, updated_at = now() where id = p_team returning * into t;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'team_role', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'role', 'owner',
      'name', coalesce((select display_name from public.profiles where id = me), '?')));
end $$;

-- Duyuru yaz (sahip/yönetici); üyelere bildirim
create or replace function public.team_post(p_team uuid, p_body text, p_pin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pid uuid;
  t public.teams;
  v_body text := left(trim(coalesce(p_body, '')), 4000);
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Duyuruları sadece takım sahibi ve yöneticileri yazabilir';
  end if;
  if v_body = '' then
    raise exception 'Duyuru boş olamaz';
  end if;
  if (select count(*) from public.team_posts where team_id = p_team and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Bugün bu takıma çok fazla duyuru yazıldı';
  end if;
  insert into public.team_posts (team_id, author, body) values (p_team, me, v_body) returning id into pid;
  if p_pin then
    update public.teams set pinned_post = pid where id = p_team;
  end if;
  select * into t from public.teams where id = p_team;
  insert into public.notifications (user_id, kind, data)
    select m.user_id, 'team_announcement', jsonb_build_object('team', p_team, 'team_name', t.name, 'tag', t.tag, 'post', pid,
      'name', coalesce((select display_name from public.profiles where id = me), '?'), 'text', left(v_body, 200))
    from public.team_members m where m.team_id = p_team and m.user_id <> me;
  return pid;
end $$;

create or replace function public.team_post_delete(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.team_posts;
begin
  select * into p from public.team_posts where id = p_post;
  if p.id is null then
    raise exception 'Duyuru bulunamadı';
  end if;
  if p.author is distinct from auth.uid() and not public.is_team_admin(p.team_id) and not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.team_posts where id = p_post;
  delete from public.notifications where kind = 'team_announcement' and data ->> 'post' = p_post::text;
end $$;

-- Duyuruyu sabitle (p_post null: sabiti kaldır)
create or replace function public.team_pin(p_team uuid, p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_admin(p_team) then
    raise exception 'Sadece takım sahibi ve yöneticileri sabitleyebilir';
  end if;
  if p_post is not null and not exists (select 1 from public.team_posts where id = p_post and team_id = p_team) then
    raise exception 'Duyuru bulunamadı';
  end if;
  update public.teams set pinned_post = p_post where id = p_team;
end $$;

create or replace function public.team_comment(p_post uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.team_posts;
  cid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  select * into p from public.team_posts where id = p_post;
  if p.id is null or not public.is_team_member(p.team_id) then
    raise exception 'Duyuru bulunamadı';
  end if;
  if v_body = '' then
    raise exception 'Yorum boş olamaz';
  end if;
  if (select count(*) from public.team_post_comments where author = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Çok hızlı yorum yazıyorsun';
  end if;
  insert into public.team_post_comments (post_id, team_id, author, body) values (p_post, p.team_id, me, v_body) returning id into cid;
  return cid;
end $$;

create or replace function public.team_comment_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.team_post_comments;
begin
  select * into c from public.team_post_comments where id = p_id;
  if c.id is null then
    raise exception 'Yorum bulunamadı';
  end if;
  if c.author is distinct from auth.uid() and not public.is_team_admin(c.team_id) and not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.team_post_comments where id = p_id;
end $$;

-- Sohbet: mesaj gönder
create or replace function public.team_send(p_team uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
  v_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  if v_body = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if (select count(*) from public.team_messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.team_messages (team_id, sender, body) values (p_team, me, v_body) returning id into mid;
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = me;
  return mid;
end $$;

-- Mesajı herkesten sil (kendi mesajı; sahip/yönetici her mesajı). İçerik boşaltılır, "silindi" görünür.
create or replace function public.team_message_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.team_messages;
begin
  select * into m from public.team_messages where id = p_id;
  if m.id is null then
    raise exception 'Mesaj bulunamadı';
  end if;
  if m.sender is distinct from auth.uid() and not public.is_team_admin(m.team_id) and not public.is_admin() then
    raise exception 'Sadece kendi mesajını silebilirsin';
  end if;
  update public.team_messages set deleted = true, body = '' where id = p_id;
  if m.poll_id is not null then
    update public.team_polls set ends_at = least(ends_at, now()), updated_at = now() where id = m.poll_id;
  end if;
end $$;

-- Mesajı sadece kendi görünümünden kaldır
create or replace function public.team_message_hide(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.team_messages;
begin
  select * into m from public.team_messages where id = p_id;
  if m.id is null or not public.is_team_member(m.team_id) then
    raise exception 'Mesaj bulunamadı';
  end if;
  insert into public.team_message_hidden (user_id, message_id) values (auth.uid(), p_id) on conflict do nothing;
end $$;

create or replace function public.team_chat_read(p_team uuid) returns void
language sql security definer set search_path = public as $$
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = auth.uid();
$$;

create or replace function public.team_chat_mute(p_team uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  insert into public.team_chat_state (team_id, user_id, muted) values (p_team, auth.uid(), coalesce(p_muted, false))
    on conflict (team_id, user_id) do update set muted = excluded.muted;
end $$;

-- Anket aç: sohbete anket mesajı düşer; dönüş mesaj kimliği
create or replace function public.team_poll_create(p_team uuid, p_question text, p_options text[], p_multi boolean,
  p_ends_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_q text := left(trim(coalesce(p_question, '')), 200);
  opts text[];
  pid uuid;
  mid uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  if v_q = '' then
    raise exception 'Anket sorusu boş olamaz';
  end if;
  select coalesce(array_agg(o order by i), '{}') into opts
    from (select left(trim(x), 80) as o, i from unnest(p_options) with ordinality as u(x, i)) s
    where o <> '';
  if cardinality(opts) not between 2 and 6 then
    raise exception 'Ankette 2-6 seçenek olmalı';
  end if;
  if (select count(distinct lower(o)) from unnest(opts) o) <> cardinality(opts) then
    raise exception 'Seçenekler birbirinden farklı olmalı';
  end if;
  if p_ends_at is null or p_ends_at < now() + interval '1 minute' or p_ends_at > now() + interval '30 days' then
    raise exception 'Bitiş zamanı 1 dakika ile 30 gün arasında olmalı';
  end if;
  if (select count(*) from public.team_messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.team_polls (team_id, created_by, question, options, multi, ends_at, counts)
    values (p_team, me, v_q, opts, coalesce(p_multi, false), p_ends_at, array_fill(0, array[cardinality(opts)]))
    returning id into pid;
  insert into public.team_messages (team_id, sender, body, poll_id) values (p_team, me, v_q, pid) returning id into mid;
  update public.team_chat_state set last_read_at = now() where team_id = p_team and user_id = me;
  return mid;
end $$;

-- Oy ver (seçimleri değiştirir; boş dizi oyu geri alır). Sayılar ankette tutulur (Realtime ile canlı).
create or replace function public.team_poll_vote(p_poll uuid, p_options int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.team_polls;
  n int;
  sel int[];
begin
  select * into p from public.team_polls where id = p_poll for update;
  if p.id is null or not public.is_team_member(p.team_id) then
    raise exception 'Anket bulunamadı';
  end if;
  if now() >= p.ends_at then
    raise exception 'Anket bitti';
  end if;
  n := cardinality(p.options);
  select coalesce(array_agg(distinct x), '{}') into sel from unnest(coalesce(p_options, '{}')) x;
  if exists (select 1 from unnest(sel) x where x < 0 or x >= n) then
    raise exception 'Geçersiz seçenek';
  end if;
  if not p.multi and cardinality(sel) > 1 then
    raise exception 'Bu ankette tek seçim yapılabilir';
  end if;
  delete from public.team_poll_votes where poll_id = p_poll and user_id = me;
  insert into public.team_poll_votes (poll_id, user_id, option) select p_poll, me, x from unnest(sel) x;
  update public.team_polls set
    counts = (select array_agg(coalesce(v.c, 0)::int order by i)
              from generate_series(0, n - 1) i
              left join (select option, count(*) as c from public.team_poll_votes where poll_id = p_poll group by option) v
                on v.option = i),
    voters = (select count(distinct user_id)::int from public.team_poll_votes where poll_id = p_poll),
    updated_at = now()
    where id = p_poll;
end $$;

-- Anketi erken bitir (açan ya da sahip/yönetici)
create or replace function public.team_poll_close(p_poll uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.team_polls;
begin
  select * into p from public.team_polls where id = p_poll;
  if p.id is null then
    raise exception 'Anket bulunamadı';
  end if;
  if p.created_by is distinct from auth.uid() and not public.is_team_admin(p.team_id) then
    raise exception 'Anketi sadece açan ya da takım yöneticileri bitirebilir';
  end if;
  update public.team_polls set ends_at = least(ends_at, now()), updated_at = now() where id = p_poll;
end $$;

-- Anketin istemciye giden hali (benim oylarımla)
create or replace function public.team_poll_json(p_poll uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'team_id', p.team_id, 'question', p.question, 'options', to_jsonb(p.options),
    'multi', p.multi, 'ends_at', p.ends_at, 'counts', to_jsonb(p.counts), 'voters', p.voters, 'created_by', p.created_by,
    'mine', coalesce((select jsonb_agg(v.option order by v.option) from public.team_poll_votes v
                      where v.poll_id = p.id and v.user_id = auth.uid()), '[]'::jsonb))
  from public.team_polls p where p.id = p_poll;
$$;

-- Sohbet geçmişi (eskiden yeniye); p_before: daha eskileri yüklemek için
create or replace function public.team_chat(p_team uuid, p_before timestamptz default null, p_limit int default 80) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'Bu takımda değilsin';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.created_at) from (
      select m.created_at, jsonb_build_object('id', m.id, 'team_id', m.team_id, 'sender', m.sender,
               'sender_name', coalesce(p.display_name, '?'), 'body', m.body, 'deleted', m.deleted,
               'poll_id', m.poll_id, 'created_at', m.created_at,
               'poll', case when m.poll_id is not null and not m.deleted then public.team_poll_json(m.poll_id) end) as j
      from public.team_messages m
      left join public.profiles p on p.id = m.sender
      where m.team_id = p_team
        and (p_before is null or m.created_at < p_before)
        and not public.team_message_hidden_for(m.id)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 80), 1), 200)
    ) x), '[]'::jsonb);
end $$;

-- Takımlarım (arkadaş listesindeki odalar): rol, sessiz, okunmamış, son mesaj
create or replace function public.my_teams()
returns table (team_id uuid, name text, tag text, color text, logo_path text, role text, muted boolean, unread int,
               last_body text, last_at timestamptz, last_sender text, last_poll boolean, member_count int)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.tag, t.color, t.logo_path, m.role, coalesce(s.muted, false),
         (select count(*)::int from public.team_messages x
          where x.team_id = t.id and x.created_at > coalesce(s.last_read_at, m.joined_at)
            and x.sender is distinct from auth.uid() and not x.deleted
            and not public.team_message_hidden_for(x.id)),
         lm.body, lm.created_at, lm.sender_name, coalesce(lm.is_poll, false),
         (select count(*)::int from public.team_members c where c.team_id = t.id)
  from public.team_members m
  join public.teams t on t.id = m.team_id
  left join public.team_chat_state s on s.team_id = m.team_id and s.user_id = m.user_id
  left join lateral (
    select x.body, x.created_at, coalesce(p.display_name, '?') as sender_name, x.poll_id is not null as is_poll
    from public.team_messages x left join public.profiles p on p.id = x.sender
    where x.team_id = t.id and not x.deleted and not public.team_message_hidden_for(x.id)
    order by x.created_at desc limit 1) lm on true
  where m.user_id = auth.uid()
  order by lm.created_at desc nulls last, t.name;
$$;

-- Bana gelen takım davetleri
create or replace function public.my_team_invites()
returns table (id uuid, team_id uuid, name text, tag text, color text, logo_path text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, t.id, t.name, t.tag, t.color, t.logo_path, coalesce(p.display_name, '?'), i.created_at
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.invited_by
  where i.user_id = auth.uid() and i.kind = 'invite'
  order by i.created_at desc;
$$;

-- Takım listesi / arama (herkese açık; sitede de kullanılır)
create or replace function public.teams_search(p_q text default '', p_limit int default 60)
returns table (id uuid, name text, tag text, description text, color text, logo_path text, join_mode text,
               owner_name text, member_count int, created_at timestamptz, my_role text, my_invite text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.tag, t.description, t.color, t.logo_path, t.join_mode,
         coalesce(o.display_name, '?'),
         (select count(*)::int from public.team_members c where c.team_id = t.id) as members,
         t.created_at,
         public.team_role(t.id, auth.uid()),
         (select i.kind from public.team_invites i where i.team_id = t.id and i.user_id = auth.uid())
  from public.teams t
  left join public.profiles o on o.id = t.owner
  where coalesce(trim(p_q), '') = ''
     or t.name ilike '%' || trim(p_q) || '%' or t.tag ilike '%' || trim(p_q) || '%'
  order by members desc, t.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

-- Takım profili: bilgiler, üyeler ve roller; yöneticiye bekleyen davet/istekler; bana olan davet/istek
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
    'join_mode', t.join_mode, 'owner', t.owner, 'created_at', t.created_at,
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

-- Duyuru panosu (sadece üyeler): sabit duyuru önce, yorumlarla
create or replace function public.team_wall(p_team uuid, p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pin uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Duyuruları sadece takım üyeleri görebilir';
  end if;
  select pinned_post into pin from public.teams where id = p_team;
  return coalesce((
    select jsonb_agg(x.j order by x.pinned desc, x.created_at desc) from (
      select (po.id = pin) as pinned, po.created_at,
             jsonb_build_object('id', po.id, 'author', po.author, 'author_name', coalesce(a.display_name, '?'),
               'body', po.body, 'created_at', po.created_at, 'pinned', coalesce(po.id = pin, false),
               'comments', coalesce((
                 select jsonb_agg(jsonb_build_object('id', c.id, 'author', c.author, 'author_name', coalesce(ca.display_name, '?'),
                          'body', c.body, 'created_at', c.created_at) order by c.created_at)
                 from public.team_post_comments c left join public.profiles ca on ca.id = c.author
                 where c.post_id = po.id), '[]'::jsonb)) as j
      from public.team_posts po left join public.profiles a on a.id = po.author
      where po.team_id = p_team
      order by (po.id = pin) desc nulls last, po.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x), '[]'::jsonb);
end $$;

-- 5) Arkadaşa özel bildirim / ses kapatma ---------------------------------------------
alter table public.friendships add column if not exists notify_muted boolean not null default false;
alter table public.friendships add column if not exists sound_muted boolean not null default false;

create or replace function public.friend_prefs(p_user uuid, p_notify_muted boolean, p_sound_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.friendships set notify_muted = coalesce(p_notify_muted, false), sound_muted = coalesce(p_sound_muted, false)
    where user_id = auth.uid() and friend_id = p_user;
end $$;

-- Realtime: sohbet mesajları ve anket sayıları
do $$ begin
  alter publication supabase_realtime add table public.team_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.team_polls;
exception when duplicate_object then null; end $$;

-- Yetkiler -------------------------------------------------------------------
grant select on public.teams, public.team_members to anon, authenticated;
grant select on public.team_invites, public.team_posts, public.team_post_comments, public.team_polls, public.team_poll_votes,
  public.team_messages, public.team_message_hidden, public.team_chat_state to authenticated;
grant all on public.teams, public.team_members, public.team_invites, public.team_posts, public.team_post_comments,
  public.team_polls, public.team_poll_votes, public.team_messages, public.team_message_hidden, public.team_chat_state to service_role;

revoke all on function public.team_add_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_add_member(uuid, uuid) to service_role;
revoke all on function public.team_check(text, text, text, text, text) from public, anon;

revoke all on function public.team_role(uuid, uuid), public.is_team_member(uuid), public.is_team_admin(uuid),
  public.team_message_hidden_for(uuid), public.team_poll_json(uuid),
  public.team_create(text, text, text, text, text, text), public.team_update(uuid, text, text, text, text, text, text),
  public.team_delete(uuid), public.team_invite(uuid, uuid), public.team_request(uuid), public.team_respond(uuid, boolean),
  public.team_leave(uuid), public.team_kick(uuid, uuid), public.team_set_role(uuid, uuid, text), public.team_transfer(uuid, uuid),
  public.team_post(uuid, text, boolean), public.team_post_delete(uuid), public.team_pin(uuid, uuid),
  public.team_comment(uuid, text), public.team_comment_delete(uuid), public.team_send(uuid, text),
  public.team_message_delete(uuid), public.team_message_hide(uuid), public.team_chat_read(uuid),
  public.team_chat_mute(uuid, boolean), public.team_poll_create(uuid, text, text[], boolean, timestamptz),
  public.team_poll_vote(uuid, int[]), public.team_poll_close(uuid), public.team_chat(uuid, timestamptz, int),
  public.my_teams(), public.my_team_invites(), public.team_wall(uuid, int), public.friend_prefs(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.team_role(uuid, uuid), public.is_team_member(uuid), public.is_team_admin(uuid),
  public.same_team(uuid, uuid), public.team_message_hidden_for(uuid), public.team_poll_json(uuid),
  public.team_check(text, text, text, text, text),
  public.team_create(text, text, text, text, text, text), public.team_update(uuid, text, text, text, text, text, text),
  public.team_delete(uuid), public.team_invite(uuid, uuid), public.team_request(uuid), public.team_respond(uuid, boolean),
  public.team_leave(uuid), public.team_kick(uuid, uuid), public.team_set_role(uuid, uuid, text), public.team_transfer(uuid, uuid),
  public.team_post(uuid, text, boolean), public.team_post_delete(uuid), public.team_pin(uuid, uuid),
  public.team_comment(uuid, text), public.team_comment_delete(uuid), public.team_send(uuid, text),
  public.team_message_delete(uuid), public.team_message_hide(uuid), public.team_chat_read(uuid),
  public.team_chat_mute(uuid, boolean), public.team_poll_create(uuid, text, text[], boolean, timestamptz),
  public.team_poll_vote(uuid, int[]), public.team_poll_close(uuid), public.team_chat(uuid, timestamptz, int),
  public.my_teams(), public.my_team_invites(), public.team_wall(uuid, int), public.friend_prefs(uuid, boolean, boolean)
  to authenticated, service_role;
-- Herkese açık takım listesi ve profili (site, giriş yapmadan). same_team: c29'daki telemetri kuralları
-- giriş yapmamış ziyaretçi için de değerlendirir (oturum yoksa false döner).
grant execute on function public.teams_search(text, int), public.team_profile(uuid), public.same_team(uuid, uuid)
  to anon, authenticated, service_role;
