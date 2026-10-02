-- ---------------------------------------------------------------------------
-- c31: Profil fotoğrafı, herkese açık profil (kısa tanıtım + sosyal bağlantılar) ve arkadaş listesinde oyun.
--      1) Profil fotoğrafı: herkese açık "avatars" kovası, yol <kullanıcı id>/<dosya> (jpeg/png/webp, en çok 1 MB;
--         program ve site yüklemeden önce ~256 px kareye küçültür). profiles.avatar_path (yol; null = fotoğraf yok).
--         profile_set_avatar(yol | null): yolu doğrular (kendi klasörü, kovada var), eski yolu döner (istemci siler).
--         Arkadaşa özel PRO "fotoğraf" görünümü (programdaki arkadaş görünümü) varsa o önceliklidir.
--      2) Herkese açık profil: profiles.bio (en çok 300 karakter) ve profiles.socials (en çok 10 bağlantı,
--         [{type, url}], type: youtube | twitch | kick | instagram | x | tiktok | facebook | discord | steam |
--         website | other; url sadece https://, en çok 200 karakter). profile_update_public(bio, socials) doğrular,
--         temizler ve kaydeder; sütunlarda da aynı denetim (check) var.
--         public_profile(kullanıcı): ad, fotoğraf, iRacing adı, tanıtım, bağlantılar, sim adları (driver_identities),
--         takımlar, PRO, üyelik tarihi, arkadaşlık durumu. E-posta vb. gizli bilgi dönmez. Giriş yapmadan da çağrılır.
--      3) Arkadaş listesinde oyun: user_status.sim (program bağlıyken simin kimliği: iracing | acc | ac | lmu | rf2 | ams2).
--         my_friends() artık avatar_path ve sim de döner (sim sadece çevrimiçi kabul edilmiş arkadaşta dolu).
--         PRO gerekmez: canlı veri değil, sadece hangi oyunda olduğu.
-- Sıra: c30'dan sonra (c27'deki my_friends'in yerini alır; dönüş sütunları değiştiği için önce silinir).
-- ---------------------------------------------------------------------------

-- 1) Profil sütunları ----------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists socials jsonb not null default '[]'::jsonb;

-- Sosyal bağlantı türleri
create or replace function public.profile_social_types() returns text[]
language sql immutable as $$
  select array['youtube', 'twitch', 'kick', 'instagram', 'x', 'tiktok', 'facebook', 'discord', 'steam', 'website', 'other'];
$$;

-- Bağlantı listesi geçerli mi (check ve RPC kullanır)
create or replace function public.profile_socials_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then
    return false;
  end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'object' then
      return false;
    end if;
    if jsonb_typeof(e -> 'type') is distinct from 'string'
       or jsonb_typeof(e -> 'url') is distinct from 'string'
       or not ((e ->> 'type') = any (public.profile_social_types()))
       or char_length(e ->> 'url') > 200
       or (e ->> 'url') !~ '^https://[^/[:space:]?#.][^[:space:]]*$'
       or (select count(*) from jsonb_object_keys(e)) <> 2 then
      return false;
    end if;
  end loop;
  return true;
end $$;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_socials_ok' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_socials_ok check (public.profile_socials_valid(socials));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_ok' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_avatar_path_ok
      check (avatar_path is null or (char_length(avatar_path) <= 200 and split_part(avatar_path, '/', 1) = id::text));
  end if;
end $do$;

-- 2) Fotoğraf kovası ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "avatars own upload" on storage.objects;
create policy "avatars own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars delete" on storage.objects;
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Fotoğrafı ayarla (null: kaldır). Eski yolu döner; istemci eski dosyayı Storage API ile siler.
create or replace function public.profile_set_avatar(p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_old text;
  v_path text := nullif(trim(coalesce(p_path, '')), '');
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if v_path is not null then
    if char_length(v_path) > 200 or split_part(v_path, '/', 1) <> me::text or v_path ~ '\.\.' then
      raise exception 'Geçersiz fotoğraf yolu';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_path) then
      raise exception 'Fotoğraf bulunamadı; yeniden yükle';
    end if;
  end if;
  select avatar_path into v_old from public.profiles where id = me;
  update public.profiles set avatar_path = v_path where id = me;
  return case when v_old is distinct from v_path then v_old end;
end $$;

-- 3) Tanıtım ve sosyal bağlantılar -------------------------------------------------------
create or replace function public.profile_update_public(p_bio text, p_socials jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_bio text := trim(coalesce(p_bio, ''));
  v_out jsonb := '[]'::jsonb;
  e jsonb;
  v_type text;
  v_url text;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'Tanıtım en çok 300 karakter olabilir';
  end if;
  if p_socials is not null and jsonb_typeof(p_socials) <> 'array' then
    raise exception 'Geçersiz bağlantı listesi';
  end if;
  if jsonb_array_length(coalesce(p_socials, '[]'::jsonb)) > 10 then
    raise exception 'En çok 10 bağlantı ekleyebilirsin';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_socials, '[]'::jsonb)) loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'Geçersiz bağlantı';
    end if;
    v_type := lower(trim(coalesce(e ->> 'type', '')));
    v_url := trim(coalesce(e ->> 'url', ''));
    if v_url = '' then
      continue; -- boş satırlar atlanır
    end if;
    if not (v_type = any (public.profile_social_types())) then
      raise exception 'Geçersiz bağlantı türü: %', v_type;
    end if;
    if char_length(v_url) > 200 then
      raise exception 'Bağlantı en çok 200 karakter olabilir';
    end if;
    if v_url !~* '^https://[^/[:space:]?#.][^[:space:]]*$' then
      raise exception 'Bağlantı https:// ile başlamalı: %', left(v_url, 60);
    end if;
    v_url := regexp_replace(v_url, '^https://', 'https://', 'i');
    v_out := v_out || jsonb_build_array(jsonb_build_object('type', v_type, 'url', v_url));
  end loop;
  update public.profiles set bio = v_bio, socials = v_out where id = me;
  return jsonb_build_object('bio', v_bio, 'socials', v_out);
end $$;

-- 4) Herkese açık profil ------------------------------------------------------------------
create or replace function public.public_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar_path', p.avatar_path,
    'iracing_name', p.iracing_name,
    'bio', coalesce(p.bio, ''),
    'socials', coalesce(p.socials, '[]'::jsonb),
    'is_pro', coalesce(p.is_admin, false) or coalesce(p.pro_until > now(), false),
    'created_at', p.created_at,
    'is_me', auth.uid() is not null and p.id = auth.uid(),
    'friend', case when auth.uid() is not null then
      (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id) end,
    'sims', coalesce((
      select jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name) order by d.last_seen desc)
      from public.driver_identities d where d.user_id = p.id and d.sim_name <> ''), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'color', t.color,
               'logo_path', t.logo_path, 'role', m.role) order by m.joined_at)
      from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = p.id), '[]'::jsonb));
end $$;

-- 5) Arkadaş listesinde oyun -----------------------------------------------------------
alter table public.user_status add column if not exists sim text not null default '';
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_status_sim_ok' and conrelid = 'public.user_status'::regclass) then
    alter table public.user_status add constraint user_status_sim_ok
      check (sim in ('', 'iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2'));
  end if;
end $do$;

-- Arkadaş listesi (c27 + fotoğraf ve oyun). Dönüş sütunları değiştiği için önce silinir.
drop function if exists public.my_friends();
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int, avatar_path text, sim text)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         coalesce(o.trusted and o.status = 'accepted', false) and public.user_is_pro(f.friend_id),
         coalesce(s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false) and f.status = 'accepted',
         case when f.status = 'accepted' then coalesce(s.track, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.car, '') else '' end,
         case when f.status = 'accepted' then coalesce(s.session, '') else '' end,
         coalesce(s.dnd, false), coalesce(s.accept_messages, true),
         case when f.status = 'accepted' then s.updated_at end,
         (select count(*)::int from public.messages m
          where m.recipient = auth.uid() and m.sender = f.friend_id and m.read_at is null
            and not public.message_hidden_for(m.id, m.sender, m.recipient, m.created_at)),
         p.avatar_path,
         case when f.status = 'accepted' and coalesce(s.updated_at > now() - interval '3 minutes', false)
              then coalesce(s.sim, '') else '' end
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.friendships o on o.user_id = f.friend_id and o.friend_id = f.user_id
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;

-- Yetkiler -------------------------------------------------------------------------------
grant execute on function public.profile_social_types(), public.profile_socials_valid(jsonb) to anon, authenticated, service_role;
revoke all on function public.profile_set_avatar(text), public.profile_update_public(text, jsonb), public.my_friends() from public, anon;
grant execute on function public.profile_set_avatar(text), public.profile_update_public(text, jsonb), public.my_friends()
  to authenticated, service_role;
grant execute on function public.public_profile(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
