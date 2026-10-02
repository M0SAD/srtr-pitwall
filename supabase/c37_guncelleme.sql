-- ---------------------------------------------------------------------------
-- c37: Sohbete özel arka plan (arkadaşla paylaşılan).
--      1) chat_backgrounds: iki arkadaş arasındaki sohbetin ortak arka planı. Çift anahtarı (user_a < user_b),
--         öneren (proposer), tür (solid = düz renk #rrggbb, gradient = hazır degrade kimliği, image = görsel),
--         değer, görsel yolu ("chatbg" kovasında), durum (pending / accepted / rejected) ve güncellenme zamanı.
--         Her sohbette tek satır; yeni öneri eskisinin yerine geçer. Tabloya doğrudan yazılamaz, sadece RPC'lerle.
--         Satırı sadece sohbetin iki tarafı okuyabilir.
--      2) Özel "chatbg" kovası: <user_a>_<user_b>/<dosya>.jpg (en fazla 1 MB; uygulama 600 KB altına küçültür).
--         Yükleme: sadece klasördeki iki kişiden biri ve ikisi arkadaşsa. Okuma ve silme: sadece iki taraf.
--      3) RPC'ler:
--           chat_bg_propose(arkadaş, tür, değer, görsel yolu) → öneriyi kaydeder (pending), arkadaşa 'chat_bg'
--             bildirimi gönderir (e-posta yok: friend_request_mail sadece kendi listesindeki türler için e-posta atar).
--             Dönüş: artık kullanılmayan eski görselin yolu (uygulama kovadan siler) ya da null.
--           chat_bg_respond(arkadaş, kabul) → arkadaşın bekleyen önerisini kabul eder ya da reddeder;
--             kabulde önerene 'chat_bg' (state = accepted) bildirimi gider.
--           chat_bg_get(arkadaş) → sohbetin satırı (yoksa boş) + mine (öneren ben miyim).
--           chat_bg_clear(arkadaş) → ortak arka planı kaldırır (iki taraf da yapabilir). Dönüş: görsel yolu ya da null.
-- Sıra: herhangi bir zamanda (friendships, are_friends, notifications ve profiles hazır olmalı).
-- ---------------------------------------------------------------------------

-- 1) Tablo -----------------------------------------------------------------------------
create table if not exists public.chat_backgrounds (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  proposer uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('solid', 'gradient', 'image')),
  value text not null default '',
  image_path text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (proposer = user_a or proposer = user_b)
);
create index if not exists chat_backgrounds_b on public.chat_backgrounds (user_b);
alter table public.chat_backgrounds enable row level security;
drop policy if exists "chat bg read" on public.chat_backgrounds;
create policy "chat bg read" on public.chat_backgrounds for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- 2) Kova ve erişim ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chatbg', 'chatbg', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Klasör adı "<a>_<b>" ve çağıran bu ikisinden biri mi (p_friends: ayrıca arkadaş olmaları gereksin)
create or replace function public.chat_bg_folder_ok(p_folder text, p_friends boolean default false) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  a text := split_part(coalesce(p_folder, ''), '_', 1);
  b text := split_part(coalesce(p_folder, ''), '_', 2);
  re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  me text := auth.uid()::text;
begin
  if me is null or a !~ re or b !~ re or a >= b collate "C" or p_folder <> a || '_' || b then
    return false;
  end if;
  if me <> a and me <> b then
    return false;
  end if;
  return not p_friends or public.are_friends(a::uuid, b::uuid);
end $$;
grant execute on function public.chat_bg_folder_ok(text, boolean) to authenticated;

drop policy if exists "chatbg upload" on storage.objects;
create policy "chatbg upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chatbg' and public.chat_bg_folder_ok((storage.foldername(name))[1], true));
drop policy if exists "chatbg read" on storage.objects;
create policy "chatbg read" on storage.objects for select to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_folder_ok((storage.foldername(name))[1], false));
drop policy if exists "chatbg delete" on storage.objects;
create policy "chatbg delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chatbg' and public.chat_bg_folder_ok((storage.foldername(name))[1], false));

-- 3) RPC'ler ---------------------------------------------------------------------------------
create or replace function public.chat_bg_propose(p_friend uuid, p_kind text, p_value text default '',
  p_image text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  folder text;
  v_value text := trim(coalesce(p_value, ''));
  v_image text := nullif(trim(coalesce(p_image, '')), '');
  prev public.chat_backgrounds;
  v_name text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_friend is null or p_friend = me or not public.are_friends(me, p_friend) then
    raise exception 'Sadece arkadaşlarınla arka plan paylaşabilirsin';
  end if;
  if exists (select 1 from public.friendships where user_id = p_friend and friend_id = me and muted) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if me < p_friend then a := me; b := p_friend; else a := p_friend; b := me; end if;
  folder := a::text || '_' || b::text;

  if p_kind = 'solid' then
    if v_value !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Geçersiz renk'; end if;
    v_image := null;
  elsif p_kind = 'gradient' then
    if v_value !~ '^[a-z0-9-]{1,24}$' then raise exception 'Geçersiz degrade'; end if;
    v_image := null;
  elsif p_kind = 'image' then
    if v_image is null or length(v_image) > 200 or v_image not like folder || '/%' or v_image like '%..%'
       or v_image !~ '^[0-9a-f_-]+/[A-Za-z0-9._-]+$' then
      raise exception 'Geçersiz görsel';
    end if;
    v_value := '';
  else
    raise exception 'Geçersiz arka plan türü';
  end if;

  select * into prev from public.chat_backgrounds where user_a = a and user_b = b;
  -- Taşkın önleme: aynı kişi aynı sohbete 5 saniyede bir öneri
  if found and prev.proposer = me and prev.updated_at > now() - interval '5 seconds' then
    raise exception 'Biraz bekleyip tekrar dene';
  end if;

  insert into public.chat_backgrounds (user_a, user_b, proposer, kind, value, image_path, status, updated_at)
    values (a, b, me, p_kind, v_value, v_image, 'pending', now())
  on conflict (user_a, user_b) do update set proposer = excluded.proposer, kind = excluded.kind, value = excluded.value,
    image_path = excluded.image_path, status = 'pending', updated_at = now();

  select display_name into v_name from public.profiles where id = me;
  delete from public.notifications where user_id = p_friend and kind = 'chat_bg' and not read and data ->> 'from' = me::text;
  insert into public.notifications (user_id, kind, data)
    values (p_friend, 'chat_bg', jsonb_build_object('from', me, 'name', coalesce(v_name, '?'), 'state', 'proposed'));

  if prev.image_path is not null and prev.image_path is distinct from v_image then
    return prev.image_path;
  end if;
  return null;
end $$;

create or replace function public.chat_bg_respond(p_friend uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  v_name text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_friend is null or p_friend = me then
    raise exception 'Geçersiz kişi';
  end if;
  if me < p_friend then a := me; b := p_friend; else a := p_friend; b := me; end if;
  update public.chat_backgrounds set status = case when p_accept then 'accepted' else 'rejected' end, updated_at = now()
    where user_a = a and user_b = b and proposer = p_friend and status = 'pending';
  if not found then
    raise exception 'Bekleyen bir arka plan önerisi yok';
  end if;
  update public.notifications set read = true
    where user_id = me and kind = 'chat_bg' and not read and data ->> 'from' = p_friend::text;
  if p_accept and public.are_friends(me, p_friend) then
    select display_name into v_name from public.profiles where id = me;
    insert into public.notifications (user_id, kind, data)
      values (p_friend, 'chat_bg', jsonb_build_object('from', me, 'name', coalesce(v_name, '?'), 'state', 'accepted'));
  end if;
end $$;

drop function if exists public.chat_bg_get(uuid);
create or replace function public.chat_bg_get(p_friend uuid)
returns table (proposer uuid, kind text, value text, image_path text, status text, updated_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select c.proposer, c.kind, c.value, c.image_path, c.status, c.updated_at, c.proposer = auth.uid()
  from public.chat_backgrounds c
  where auth.uid() is not null and p_friend is not null and p_friend <> auth.uid()
    and c.user_a = least(auth.uid(), p_friend) and c.user_b = greatest(auth.uid(), p_friend);
$$;

create or replace function public.chat_bg_clear(p_friend uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_path text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  delete from public.chat_backgrounds
    where user_a = least(me, p_friend) and user_b = greatest(me, p_friend)
    returning image_path into v_path;
  delete from public.notifications where kind = 'chat_bg' and not read
    and ((user_id = p_friend and data ->> 'from' = me::text) or (user_id = me and data ->> 'from' = p_friend::text));
  return v_path;
end $$;

revoke all on function public.chat_bg_propose(uuid, text, text, text) from public, anon;
revoke all on function public.chat_bg_respond(uuid, boolean) from public, anon;
revoke all on function public.chat_bg_get(uuid) from public, anon;
revoke all on function public.chat_bg_clear(uuid) from public, anon;
grant execute on function public.chat_bg_propose(uuid, text, text, text) to authenticated;
grant execute on function public.chat_bg_respond(uuid, boolean) to authenticated;
grant execute on function public.chat_bg_get(uuid) to authenticated;
grant execute on function public.chat_bg_clear(uuid) to authenticated;
