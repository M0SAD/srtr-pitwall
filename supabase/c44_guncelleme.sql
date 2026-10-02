-- ---------------------------------------------------------------------------
-- c44: (1) Yönetim bekleyen iş sayaçları, (2) Güvenilir arkadaşlar: canlı veriyi (takım yakıtı) kodsuz paylaşma.
--
-- 1) admin_badge_counts() -> jsonb: Yönetim bölümlerinde bekleyen işlerin sayısı (anahtar = bölüm kimliği).
--      support     yanıt bekleyen destek talepleri (status = 'open')            — is_moderator()
--      moderation  açık içerik raporları (has_perm('reports.view')) + açık mesaj raporları (sadece yönetici)
--      voicepacks  yeni ses paketi gönderileri (status = 'new')                 — is_admin()
--      trial       şüpheli deneme talepleri: yönetici işlem yapmamış ve bu yöneticinin
--                  bölümü son açışından sonra gelmiş (admin_seen; ilk kez: son 30 gün) — is_admin()
--      ads         onay bekleyen / raporlarla gizlenen reklamlar                 — is_admin()
--      devices     kapatılmamış cihaz sınırı uyarısı olan hesaplar               — is_admin()
--    Çağıranın görebildiği sayılar döner; yetkisi olmayana (ya da girişsiz) boş nesne — hata fırlatmaz.
--    admin_badge_seen(p_section): bölümü "görüldü" işaretler (şimdilik sadece 'trial' sayacını etkiler).
--
-- 2) Güvenilir arkadaşlar (Ayarlar › Paylaşım › Takım yakıtı). Kod (MQTT takım kodu) vermeden paylaşım:
--    Paylaşan, yarışırken canlı verisini live_data tablosundaki kendi satırına yazar (zaten vardı, c27/c33).
--    Okuma yetkisi live_visible(owner) ile verilir (RLS + Realtime aynı kuralı kullanır). Bu sürümde:
--      - share_prefs.trust_all: "Tüm arkadaşlarım" anahtarı (kabul edilmiş tüm arkadaşlar görür)
--      - live_trusts(owner, viewer): arkadaşlık kabul edilmiş VE (friendships.trusted ya da owner trust_all)
--      - live_visible() ve my_friends().trusts_me artık live_trusts() kullanır
--      - friend_trust_set(p_user, p_trusted): sadece güvenilir işaretini değiştirir (sessiz ayarına dokunmaz)
--      - share_trust_get() / share_trust_all_set(p_on)
--      - friend_shares(): bana güvenen arkadaşlar + son canlı verileri (izleyen tarafta liste; kod dönmez)
--    Takım kodu hiçbir zaman sunucuya yazılmaz / arkadaşlara verilmez; kodlu (MQTT) akış aynen çalışır.
--    Arkadaşlık silinince friendships satırları silinir -> güven de kalkar (trust_all da arkadaşlık ister).
--    PRO kuralı değişmedi: 'social.data_share' PRO'ya özelse paylaşan PRO olmalı (izleyen olmak zorunda değil).
-- Sıra: c33 (feature_requires_pro, live_visible) ve c41 (trial_claims) sonrasında.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1) Yönetim sayaçları
-- ===========================================================================
create table if not exists public.admin_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  section text not null check (char_length(section) between 1 and 40),
  seen_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.admin_seen enable row level security;
drop policy if exists "admin seen own" on public.admin_seen;
create policy "admin seen own" on public.admin_seen for select using (auth.uid() = user_id);
grant all on public.admin_seen to service_role;

create or replace function public.admin_badge_seen(p_section text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_admin() or public.is_moderator()) then
    return;
  end if;
  insert into public.admin_seen (user_id, section, seen_at) values (auth.uid(), left(coalesce(p_section, ''), 40), now())
    on conflict (user_id, section) do update set seen_at = now();
end $$;
revoke all on function public.admin_badge_seen(text) from public, anon;
grant execute on function public.admin_badge_seen(text) to authenticated;

create or replace function public.admin_badge_counts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  adm boolean;
  mdr boolean;
  r jsonb := '{}'::jsonb;
  n int;
  seen timestamptz;
begin
  if auth.uid() is null then
    return r;
  end if;
  adm := public.is_admin();
  mdr := adm or public.is_moderator();
  if not mdr then
    return r;
  end if;

  -- Destek: son yazan kullanıcı, yanıt bekliyor
  select count(*)::int into n from public.support_tickets where status = 'open';
  r := r || jsonb_build_object('support', n);

  -- Moderasyon: açık içerik raporları (+ yönetici için açık mesaj raporları)
  select count(*)::int into n from public.reports where status = 'open';
  if adm then
    n := n + (select count(*)::int from public.message_reports where status = 'open');
  end if;
  r := r || jsonb_build_object('moderation', n);

  if adm then
    select count(*)::int into n from public.voice_pack_submissions where status = 'new';
    r := r || jsonb_build_object('voicepacks', n);

    select seen_at into seen from public.admin_seen where user_id = auth.uid() and section = 'trial';
    select count(*)::int into n from public.trial_claims c
      where c.reason not in ('granted', 'had_pro', 'not_new', 'admin') and c.admin_action = ''
        and c.created_at > coalesce(seen, now() - interval '30 days');
    r := r || jsonb_build_object('trial', n);

    select count(*)::int into n from public.ad_campaigns where status in ('pending_review', 'paused_reports');
    r := r || jsonb_build_object('ads', n);

    select count(distinct user_id)::int into n from public.device_flags where not resolved;
    r := r || jsonb_build_object('devices', n);
  end if;
  return r;
exception when others then
  -- Sayaç hiçbir zaman arayüzü bozmasın (ör. eksik tablo)
  return r;
end $$;
revoke all on function public.admin_badge_counts() from public, anon;
grant execute on function public.admin_badge_counts() to authenticated;

-- ===========================================================================
-- 2) Güvenilir arkadaşlar: kodsuz canlı veri paylaşımı
-- ===========================================================================
create table if not exists public.share_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Kabul edilmiş tüm arkadaşlarım canlı verimi görebilir
  trust_all boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.share_prefs enable row level security;
drop policy if exists "share prefs own" on public.share_prefs;
create policy "share prefs own" on public.share_prefs for select using (auth.uid() = user_id);
grant select on public.share_prefs to authenticated;
grant all on public.share_prefs to service_role;

-- owner, viewer'a güveniyor mu: arkadaşlık kabul edilmiş VE (tek tek güvenilir ya da "tüm arkadaşlarım")
create or replace function public.live_trusts(p_owner uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.user_id = p_owner and f.friend_id = p_viewer and f.status = 'accepted'
      and (f.trusted or coalesce((select sp.trust_all from public.share_prefs sp where sp.user_id = p_owner), false)));
$$;
revoke all on function public.live_trusts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.live_trusts(uuid, uuid) to service_role;

-- live_data okuma kuralı (RLS "live trusted read" ve Realtime bunu kullanır)
create or replace function public.live_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() = p_owner
    or (public.live_trusts(p_owner, auth.uid())
        and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(p_owner))));
$$;
revoke all on function public.live_visible(uuid) from public, anon;
grant execute on function public.live_visible(uuid) to authenticated, service_role;

-- Sadece güvenilir işareti (friend_set sessiz ayarını da yazıyordu; ayarlar ekranı bunu kullanır)
create or replace function public.friend_trust_set(p_user uuid, p_trusted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if p_trusted and public.feature_requires_pro('social.data_share', true) and not public.is_pro()
     and not coalesce((select trusted from public.friendships where user_id = auth.uid() and friend_id = p_user), false) then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  update public.friendships set trusted = coalesce(p_trusted, false)
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
  if not found then
    raise exception 'Arkadaş bulunamadı';
  end if;
end $$;
revoke all on function public.friend_trust_set(uuid, boolean) from public, anon;
grant execute on function public.friend_trust_set(uuid, boolean) to authenticated;

create or replace function public.share_trust_all_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  if coalesce(p_on, false) and public.feature_requires_pro('social.data_share', true) and not public.is_pro() then
    raise exception 'Veri paylaşımı PRO üyelere özel';
  end if;
  insert into public.share_prefs (user_id, trust_all, updated_at) values (auth.uid(), coalesce(p_on, false), now())
    on conflict (user_id) do update set trust_all = excluded.trust_all, updated_at = now();
end $$;
revoke all on function public.share_trust_all_set(boolean) from public, anon;
grant execute on function public.share_trust_all_set(boolean) to authenticated;

create or replace function public.share_trust_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trust_all', coalesce((select trust_all from public.share_prefs where user_id = auth.uid()), false),
    'needs_pro', public.feature_requires_pro('social.data_share', true) and not public.is_pro());
$$;
revoke all on function public.share_trust_get() from public, anon;
grant execute on function public.share_trust_get() to authenticated;

-- İzleyen taraf: verisini görebildiğim (bana güvenen) arkadaşlar + son canlı verileri.
-- live: son 2 dakikada veri göndermiş (şu an paylaşıyor). Takım kodu ya da başka gizli bilgi dönmez.
create or replace function public.friend_shares()
returns table (friend_id uuid, display_name text, avatar_path text, online boolean, racing boolean,
               track text, car text, live boolean, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.avatar_path,
         coalesce(s.updated_at > now() - interval '3 minutes', false),
         coalesce(s.racing and s.updated_at > now() - interval '3 minutes', false),
         coalesce(s.track, ''), coalesce(s.car, ''),
         coalesce(l.updated_at > now() - interval '2 minutes', false),
         case when l.updated_at > now() - interval '10 minutes' then l.data end,
         l.updated_at
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  left join public.user_status s on s.user_id = f.friend_id
  left join public.live_data l on l.user_id = f.friend_id
  where f.user_id = auth.uid() and f.status = 'accepted' and public.live_visible(f.friend_id)
  order by coalesce(l.updated_at > now() - interval '2 minutes', false) desc,
           coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.friend_shares() from public, anon;
grant execute on function public.friend_shares() to authenticated;

-- my_friends: c33'teki son tanım (dönüş sütunları aynı); trusts_me artık "tüm arkadaşlarım"ı da sayar
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, iracing_name text, status text, trusted boolean, muted boolean,
               trusts_me boolean, online boolean, racing boolean, track text, car text, session text, dnd boolean,
               accept_messages boolean, last_seen timestamptz, unread int, avatar_path text, sim text)
language sql stable security definer set search_path = public as $$
  select f.friend_id, p.display_name, p.iracing_name, f.status, f.trusted, f.muted,
         f.status = 'accepted' and public.live_trusts(f.friend_id, f.user_id)
           and (not public.feature_requires_pro('social.data_share', true) or public.user_is_pro(f.friend_id)),
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
  left join public.user_status s on s.user_id = f.friend_id
  where f.user_id = auth.uid()
  order by (f.status = 'pending_in') desc, coalesce(s.racing, false) desc, s.updated_at desc nulls last, p.display_name;
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated, service_role;

notify pgrst, 'reload schema';
