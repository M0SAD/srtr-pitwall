-- ---------------------------------------------------------------------------
-- c40: PRO özellikleri ayrıntılı: yönetici HER özelliği PRO ya da herkese açık yapabilir.
--      Kararlar c38'deki pro_features tablosunda (anahtar → PRO mu); burada yeni tablo yok. Yeni anahtarların
--      varsayılanı bugünkü davranıştır (hepsi herkese açık), yani bu dosya tek başına hiçbir şeyi kilitlemez;
--      yönetici Yönetim › PRO özellikleri'nden PRO yaptığında sunucu da reddeder.
--      Uygulamadaki yeni anahtarlar (programda ve sitede de denetlenir):
--        Sosyal:    social.friend_add, social.messages, social.chat_bg, social.avatar, social.profile_public
--        Takımlar:  teams.create, teams.join, teams.chat, teams.poll, teams.post
--        Telemetri: telemetry.record, telemetry.others (+ sadece programda: telemetry.compare, telemetry.leaderboard)
--        Ses:       voice.pack_submit
--        Sadece programda: appearance.themes / app_bg / chat_look, tools.screenshots / streaming / league /
--                   pitwall / timing / engineer / events
--      Overlay'ler (sadece programda; sunucu yolu yok): overlay.<id>.<ayar> (ayarın tamamı) ve
--      overlay.<id>.<ayar>.<değer> (seçenek) pro_features'ta; overlay'in tamamı app_config.pro_overlays'te (değişmedi).
--      Yeniden tanımlanan fonksiyonlar (imza aynı; en son tanımın aynısı, sadece PRO denetimi eklendi:
--      "if public.feature_requires_pro('<anahtar>', false) and not public.is_pro() then raise exception ...").
--      Kabul etmek / kaldırmak / silmek / okumak her zaman serbest (arkadaş isteğini kabul, fotoğrafı kaldırmak,
--      tanıtımı boşaltmak, takım daveti reddetmek…):
--           friend_request(uuid)                                       (schema.sql) — social.friend_add
--           send_message(uuid, text)                                   (c27       ) — social.messages
--           chat_bg_propose(uuid, text, text, text)                    (c37       ) — social.chat_bg
--           profile_set_avatar(text)                                   (c31       ) — social.avatar
--           profile_update_public(text, jsonb)                         (c31       ) — social.profile_public
--           team_create(text, text, text, text, text, text, text)      (c36       ) — teams.create
--           team_request(uuid)                                         (c30       ) — teams.join
--           team_respond(uuid, boolean)                                (c30       ) — teams.join
--           team_send(uuid, text)                                      (c30       ) — teams.chat
--           team_poll_create(uuid, text, text[], boolean, timestamptz) (c30       ) — teams.poll
--           team_post(uuid, text, boolean)                             (c30       ) — teams.post
--           telemetry_record_lap(jsonb)                                (c29       ) — telemetry.record
--           telemetry_visible(uuid)                                    (c29       ) — telemetry.others
--           voice_pack_submit(text, text, text, text)                  (c39       ) — voice.pack_submit
--      team_respond: kabulde takıma girecek kişi (davet edilen ya da isteği onaylanan) PRO olmalı (user_is_pro).
--      telemetry_visible: sahibi her zaman görür; başkası (herkese açık / aynı takım) ancak anahtar açıksa ya da PRO ise.
-- Sıra: c38 ve c39'dan sonra (feature_requires_pro, voice_pack_submissions hazır olmalı).
-- ---------------------------------------------------------------------------

-- friend_request(uuid) — social.friend_add (son tanım: schema.sql)
create or replace function public.friend_request(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  theirs text;
begin
  if me is null or p_user is null or p_user = me then
    raise exception 'Geçersiz kullanıcı';
  end if;
  if (select count(*) from public.friendships where user_id = me) >= 300 then
    raise exception 'Arkadaş sınırına ulaştın';
  end if;
  select status into theirs from public.friendships where user_id = p_user and friend_id = me;
  if theirs = 'pending_out' then
    update public.friendships set status = 'accepted' where (user_id = me and friend_id = p_user) or (user_id = p_user and friend_id = me);
    return 'accepted';
  end if;
  if theirs is not null then
    return theirs;
  end if;
  if public.feature_requires_pro('social.friend_add', false) and not public.is_pro() then
    raise exception 'Arkadaş eklemek PRO üyelik gerektirir';
  end if;
  insert into public.friendships (user_id, friend_id, status) values (me, p_user, 'pending_out') on conflict do nothing;
  insert into public.friendships (user_id, friend_id, status) values (p_user, me, 'pending_in') on conflict do nothing;
  insert into public.notifications (user_id, kind, data)
    values (p_user, 'friend_request', jsonb_build_object('from', me, 'name', (select display_name from public.profiles where id = me)));
  return 'pending';
end $$;

-- send_message(uuid, text) — social.messages (son tanım: c27)
create or replace function public.send_message(p_to uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mid uuid;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if public.feature_requires_pro('social.messages', false) and not public.is_pro() then
    raise exception 'Mesaj göndermek PRO üyelik gerektirir';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Mesaj boş olamaz';
  end if;
  if not public.are_friends(me, p_to) then
    raise exception 'Sadece arkadaşlarına mesaj gönderebilirsin';
  end if;
  if coalesce((select muted from public.friendships where user_id = p_to and friend_id = me), false)
     or not coalesce((select accept_messages from public.user_status where user_id = p_to), true) then
    raise exception 'Bu kişi mesajları kapatmış';
  end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Çok hızlı mesaj gönderiyorsun';
  end if;
  insert into public.messages (sender, recipient, body) values (me, p_to, left(trim(p_body), 1000)) returning id into mid;
  return mid;
end $$;

-- chat_bg_propose(uuid, text, text, text) — social.chat_bg (son tanım: c37)
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
  if public.feature_requires_pro('social.chat_bg', false) and not public.is_pro() then
    raise exception 'Sohbet arka planı önermek PRO üyelik gerektirir';
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

-- profile_set_avatar(text) — social.avatar (son tanım: c31)
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
    if public.feature_requires_pro('social.avatar', false) and not public.is_pro() then
      raise exception 'Profil fotoğrafı yüklemek PRO üyelik gerektirir';
    end if;
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

-- profile_update_public(text, jsonb) — social.profile_public (son tanım: c31)
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
  if public.feature_requires_pro('social.profile_public', false) and (v_bio <> '' or jsonb_array_length(v_out) > 0) and not public.is_pro() then
    raise exception 'Profil tanıtımı ve sosyal bağlantılar PRO üyelik gerektirir';
  end if;
  update public.profiles set bio = v_bio, socials = v_out where id = me;
  return jsonb_build_object('bio', v_bio, 'socials', v_out);
end $$;

-- team_create(text, text, text, text, text, text, text) — teams.create (son tanım: c36)
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
  if v_sim not in ('iracing', 'acc', 'ac', 'lmu', 'rf2', 'ams2', 'multi') then
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

-- team_request(uuid) — teams.join (son tanım: c30)
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
  if public.feature_requires_pro('teams.join', false) and not public.is_pro() then
    raise exception 'Takıma katılmak PRO üyelik gerektirir';
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

-- team_respond(uuid, boolean) — teams.join (son tanım: c30)
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
    if public.feature_requires_pro('teams.join', false) and not public.user_is_pro(inv.user_id) then
      if inv.user_id = me then
        raise exception 'Takıma katılmak PRO üyelik gerektirir';
      end if;
      raise exception 'Bu kişi takıma katılamaz: takıma katılmak PRO üyelik gerektirir';
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

-- team_send(uuid, text) — teams.chat (son tanım: c30)
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
  if public.feature_requires_pro('teams.chat', false) and not public.is_pro() then
    raise exception 'Takım sohbetine yazmak PRO üyelik gerektirir';
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

-- team_poll_create(uuid, text, text[], boolean, timestamptz) — teams.poll (son tanım: c30)
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
  if public.feature_requires_pro('teams.poll', false) and not public.is_pro() then
    raise exception 'Anket oluşturmak PRO üyelik gerektirir';
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

-- team_post(uuid, text, boolean) — teams.post (son tanım: c30)
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
  if public.feature_requires_pro('teams.post', false) and not public.is_pro() then
    raise exception 'Duyuru yazmak PRO üyelik gerektirir';
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

-- telemetry_record_lap(jsonb) — telemetry.record (son tanım: c29)
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

-- telemetry_visible(uuid) — telemetry.others (son tanım: c29)
create or replace function public.telemetry_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner is not null and (
    coalesce(p_owner = auth.uid(), false)
    or ((coalesce((select p.telemetry_public from public.profiles p where p.id = p_owner), false)
         or (auth.uid() is not null and coalesce(public.same_team(p_owner, auth.uid()), false)))
        and (not public.feature_requires_pro('telemetry.others', false) or public.is_pro())));
$$;

-- voice_pack_submit(text, text, text, text) — voice.pack_submit (son tanım: c39)
create or replace function public.voice_pack_submit(p_language text, p_pack_name text, p_link text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  nm text;
  lang text := left(btrim(coalesce(p_language, '')), 40);
  pn text := left(btrim(coalesce(p_pack_name, '')), 80);
  lk text := btrim(coalesce(p_link, ''));
  msg text := left(btrim(coalesce(p_message, '')), 2000);
  rid uuid;
begin
  if me is null then
    raise exception 'Göndermek için giriş yapmalısın';
  end if;
  if public.feature_requires_pro('voice.pack_submit', false) and not public.is_pro() then
    raise exception 'Ses paketi göndermek PRO üyelik gerektirir';
  end if;
  if length(lang) < 2 then
    raise exception 'Dili yaz';
  end if;
  if pn = '' then
    raise exception 'Paket adını yaz';
  end if;
  if lk !~ '^https://[^\s/$.?#][^\s]*$' or length(lk) > 1000 then
    raise exception 'Geçerli bir https:// bağlantısı yaz (WeTransfer, Google Drive…)';
  end if;
  if (select count(*) from public.voice_pack_submissions where user_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Bugün en fazla 3 paket gönderebilirsin';
  end if;
  nm := coalesce((select display_name from public.profiles where id = me), '');
  insert into public.voice_pack_submissions (user_id, user_name, language, pack_name, link, message)
    values (me, nm, lang, pn, lk, msg)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'voice_submission', jsonb_build_object(
      'submission', rid, 'user', me, 'name', nm, 'language', lang, 'pack_name', pn, 'link', lk, 'message', left(msg, 500))
    from public.profiles p where p.is_admin;
  return rid;
end $$;

notify pgrst, 'reload schema';
