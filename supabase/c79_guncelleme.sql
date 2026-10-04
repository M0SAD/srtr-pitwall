-- ---------------------------------------------------------------------------
-- c79: Ekip Pitwall'ı — "sürücünün gözünden" salt okunur görünümler (Live Timing, Mühendis ekranı, Olaylar).
--
-- Ekip üyesi (spotter ya da izleyici) arkadaşının pitwall'ına girince sürücünün KENDİ ekranında gördüğü Live Timing,
-- Mühendis ekranı ve Olaylar listesini de görür. Bunlar yalnızca gösterimdir: tekrar / kamera komutu yoktur
-- (zaten sunucuda böyle bir komut türü yok; crew_command() yalnızca pit komutlarını kabul eder).
--
-- Taşıma: c58'deki crew_wall ile aynı düşünce (UNLOGGED tek satır, yalnızca security definer fonksiyonlar okur/yazar),
-- ama üç ayrı parça ve "isteyen var mı" işaretiyle:
--   crew_wall_ext (owner,
--                  t, t_at            -- Live Timing: sıralama + oturum + yarış kontrol akışı
--                  g, g_at            -- Mühendis ekranı: yakıt, lastik, hava, araç, tur süreleri, yakındakiler
--                  e, e_rev, e_at     -- Olaylar: son olaylar + oturum özeti (yalnızca değişince yazılır)
--                  ask_t, ask_g, ask_e)  -- bir ekip üyesi bu parçayı en son ne zaman istedi
--   - Ekip üyesi crew_ext(p_owner, p_parts, p_e_rev) ile ~3 sn'de bir okur; istediği parçaların ask_* damgasını
--     yazar (5 sn'de bir). Olaylar parçası, elindeki sürümle (p_e_rev) aynıysa yeniden gönderilmez (e_same).
--   - Sürücünün uygulaması crew_ext_push(p_t, p_g, p_e, p_e_rev) ile 3 sn'de bir yazar; dönüşteki `want`
--     ("t", "g", "e" harfleri) son 20 sn içinde istenen parçalardır — uygulama yalnızca onları üretir ve gönderir.
--     Kimse bu sekmeleri açmadıysa hiçbir ağır veri yazılmaz. p_e null + p_e_rev: "olaylar değişmedi" (e_at yenilenir).
--   - Yetki: crew_role(owner, üye, false) (izleme ya da pit yetkisi + kabul edilmiş arkadaşlık) VE sürücü yarışta
--     (crew_racing) VE sürücünün "ekibim pitwall'ımı izleyebilsin" anahtarı (crew_prefs.wall_on) açık.
--     Anahtar kapalıysa saklanan veri silinir. Parçalar bayatlayınca (t/g 20 sn, e 60 sn) verilmez.
--   - Boyut sınırları: t ≤ 64 KB, g ≤ 32 KB, e ≤ 32 KB (uygulama 64 araç / 40 yarış kontrol olayı / 60 olay ile kırpar).
--   PRO kuralı değişmedi (bu görünümler için ayrı bir PRO denetimi yok; pit komutları c58/c75'teki gibi).
--
-- Bu dosyanın oluşturduğu:
--   tablo  crew_wall_ext
--   RPC    crew_ext_push(jsonb, jsonb, jsonb, text) -> jsonb {watchers, wall_on, want, e_rev}   sürücünün uygulaması
--          crew_ext(uuid, text, text) -> jsonb {on, racing, t, t_age, g, g_age, e, e_rev, e_age, e_same}   ekip üyesi
-- Sıra: c53, c58, c75 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create unlogged table if not exists public.crew_wall_ext (
  owner uuid primary key references public.profiles (id) on delete cascade,
  t jsonb,
  t_at timestamptz,
  g jsonb,
  g_at timestamptz,
  e jsonb,
  e_rev text,
  e_at timestamptz,
  ask_t timestamptz,
  ask_g timestamptz,
  ask_e timestamptz
);
alter table public.crew_wall_ext enable row level security;
-- Kural yok: yalnızca aşağıdaki security definer fonksiyonlar okur / yazar
revoke all on public.crew_wall_ext from public, anon, authenticated;
grant all on public.crew_wall_ext to service_role;

-- Sürücünün uygulaması: görünüm parçalarını yaz (hepsi null: yalnızca "hangi parçalar isteniyor" sorusu).
create or replace function public.crew_ext_push(p_t jsonb default null, p_g jsonb default null,
                                                p_e jsonb default null, p_e_rev text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_on boolean;
  n int;
  w public.crew_wall_ext%rowtype;
  v_want text := '';
  v_rev text := left(coalesce(p_e_rev, ''), 80);
begin
  if me is null then
    raise exception 'Giriş gerekli';
  end if;
  v_on := coalesce((select wall_on from public.crew_prefs where user_id = me), true);
  if not v_on then
    delete from public.crew_wall_ext where owner = me;
    return jsonb_build_object('watchers', 0, 'wall_on', false, 'want', '', 'e_rev', null);
  end if;
  select count(*)::int into n
    from public.crew_members c
    join public.friendships f on f.user_id = c.owner and f.friend_id = c.member and f.status = 'accepted'
    where c.owner = me and (c.can_view or c.can_control)
      and c.seen_at > now() - interval '45 seconds';
  if n > 0 and (p_t is not null or p_g is not null or p_e is not null or v_rev <> '') then
    if (p_t is not null and (jsonb_typeof(p_t) <> 'object' or octet_length(p_t::text) > 64000))
       or (p_g is not null and (jsonb_typeof(p_g) <> 'object' or octet_length(p_g::text) > 32000))
       or (p_e is not null and (jsonb_typeof(p_e) <> 'object' or octet_length(p_e::text) > 32000)) then
      raise exception 'Pitwall verisi geçersiz';
    end if;
    insert into public.crew_wall_ext as x (owner, t, t_at, g, g_at, e, e_rev, e_at)
      values (me, p_t, case when p_t is not null then now() end,
                  p_g, case when p_g is not null then now() end,
                  p_e, case when p_e is not null then v_rev end, case when p_e is not null then now() end)
    on conflict (owner) do update
      set t = coalesce(excluded.t, x.t),
          t_at = coalesce(excluded.t_at, x.t_at),
          g = coalesce(excluded.g, x.g),
          g_at = coalesce(excluded.g_at, x.g_at),
          e = coalesce(excluded.e, x.e),
          e_rev = case when excluded.e is not null then excluded.e_rev else x.e_rev end,
          -- Olaylar değişmediyse (aynı sürüm) yalnızca tazelik damgası yenilenir
          e_at = case when excluded.e is not null then now()
                      when v_rev <> '' and x.e is not null and x.e_rev = v_rev then now()
                      else x.e_at end;
  end if;
  select * into w from public.crew_wall_ext where owner = me;
  if found and n > 0 then
    v_want := case when w.ask_t > now() - interval '20 seconds' then 't' else '' end
           || case when w.ask_g > now() - interval '20 seconds' then 'g' else '' end
           || case when w.ask_e > now() - interval '20 seconds' then 'e' else '' end;
  end if;
  return jsonb_build_object('watchers', n, 'wall_on', true, 'want', v_want,
                            'e_rev', case when w.e is not null then w.e_rev end);
end $$;
revoke all on function public.crew_ext_push(jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.crew_ext_push(jsonb, jsonb, jsonb, text) to authenticated;

-- Ekip üyesi: sürücünün görünüm parçaları. p_parts: istenen parçalar ("t", "g", "e" harfleri);
-- p_e_rev: elimdeki olaylar sürümü (aynıysa olaylar yeniden gönderilmez: e_same).
create or replace function public.crew_ext(p_owner uuid, p_parts text default 'tge', p_e_rev text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.crew_members%rowtype;
  w public.crew_wall_ext%rowtype;
  parts text := lower(coalesce(p_parts, ''));
  wt boolean := position('t' in parts) > 0;
  wg boolean := position('g' in parts) > 0;
  we boolean := position('e' in parts) > 0;
  r jsonb;
  ok boolean;
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
  if not coalesce((select wall_on from public.crew_prefs where user_id = p_owner), true) then
    return jsonb_build_object('on', false, 'racing', false);
  end if;
  if not public.crew_racing(p_owner) then
    return jsonb_build_object('on', true, 'racing', false);
  end if;
  -- "Bu parçayı isteyen var" işareti (5 sn'de bir yazılır); sürücünün uygulaması crew_ext_push dönüşünde görür
  if wt or wg or we then
    insert into public.crew_wall_ext as x (owner, ask_t, ask_g, ask_e)
      values (p_owner, case when wt then now() end, case when wg then now() end, case when we then now() end)
    on conflict (owner) do update
      set ask_t = case when wt then now() else x.ask_t end,
          ask_g = case when wg then now() else x.ask_g end,
          ask_e = case when we then now() else x.ask_e end
      where (wt and (x.ask_t is null or x.ask_t < now() - interval '5 seconds'))
         or (wg and (x.ask_g is null or x.ask_g < now() - interval '5 seconds'))
         or (we and (x.ask_e is null or x.ask_e < now() - interval '5 seconds'));
  end if;
  select * into w from public.crew_wall_ext where owner = p_owner;
  r := jsonb_build_object('on', true, 'racing', true);
  if wt then
    ok := w.t is not null and w.t_at > now() - interval '20 seconds';
    r := r || jsonb_build_object('t', case when ok then w.t end,
      't_age', case when ok then (extract(epoch from clock_timestamp() - w.t_at) * 1000)::int end);
  end if;
  if wg then
    ok := w.g is not null and w.g_at > now() - interval '20 seconds';
    r := r || jsonb_build_object('g', case when ok then w.g end,
      'g_age', case when ok then (extract(epoch from clock_timestamp() - w.g_at) * 1000)::int end);
  end if;
  if we then
    ok := w.e is not null and w.e_at > now() - interval '60 seconds';
    r := r || jsonb_build_object(
      'e', case when ok and (p_e_rev is null or w.e_rev is distinct from p_e_rev) then w.e end,
      'e_same', coalesce(ok and p_e_rev is not null and w.e_rev = p_e_rev, false),
      'e_rev', case when ok then w.e_rev end,
      'e_age', case when ok then (extract(epoch from clock_timestamp() - w.e_at) * 1000)::int end);
  end if;
  return r;
end $$;
revoke all on function public.crew_ext(uuid, text, text) from public, anon;
grant execute on function public.crew_ext(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
