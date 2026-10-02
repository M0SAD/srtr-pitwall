-- ---------------------------------------------------------------------------
-- c56: Üyenin kendi iRacing bilgileri (iRating, lisans + SR, ülke) profilde ve demo vitrininde.
--      Kaynak: iRacing API'si YOK. Program, giriş yapmış üye iRacing'de bir oturuma girdiğinde oturum bilgisinden
--      (DriverInfo) SADECE KENDİ aracının değerlerini okur ve profile_set_iracing ile hesabına yazar. Başka
--      sürücülerin verisi hiçbir zaman gönderilmez. Üye bu sürümle en az bir kez iRacing'e girene kadar değerler boştur.
--      1) profile_iracing tablosu (üye başına bir satır): irating, license ("A 3.42"), lic_color ("#0153db"),
--         country (iRacing "flair" kısa kodu, ör. TR / DE; programdaki bayrak bileşeninin beklediği kod), cust_id
--         (iRacing üye no), category (son sürülen serinin kategorisi: road / oval / dirtroad / dirtoval ...; iRating
--         ve lisans kategoriye özeldir), updated_at. profiles herkese okunur olduğundan ayrı tabloda ve RLS ile
--         korunur (sadece sahibi / yönetici doğrudan okur). profiles.ir_public (varsayılan true):
--         "iRacing bilgilerimi profilimde göster".
--      2) profile_set_iracing(iRating, lisans, renk, ülke, üye no, kategori): doğrular (aralık, uzunluk, biçim) ve
--         kaydeder; değer değişmediyse ve son yazım 10 dakikadan yeniyse dokunmaz. jsonb {ok, changed} döner.
--      3) profile_iracing_public_set(açık): gizlilik ayarı. Kapalıyken değerler public_profile ve demo vitrininde
--         dönmez (üyenin kendisi kendi profilinde görmeye devam eder; 'public': false ile işaretlenir).
--      4) public_profile(kullanıcı): c31'deki alanlara ek 'iracing' nesnesi
--         {irating, license, lic_color, country, category, updated_at, public} (veri yoksa / gizliyse null).
--      5) demo_pro_drivers(p_limit): demo_pro_names'in (c33) zengin hali. Herkese açık; aktif PRO üyelerden vitrine
--         izin verenlerin [{name, country, irating, license, lic_color}] listesi (rastgele sıra, en fazla 100).
--         iRacing bilgisi olmayan ya da gizleyen üyede bu alanlar null döner: program o sürücüye bayrak GÖSTERMEZ
--         (yanıltıcı rastgele bayrak yok) ve iR/SR'yi eskisi gibi kendisi üretir. demo_pro_names aynen durur
--         (eski sürümler ve canlı sohbet benzetimi kullanır).
-- Sıra: c31 (public_profile) ve c33 (demo_showcase) sonrasında.
-- ---------------------------------------------------------------------------

-- 1) Tablo ve profil ayarı -------------------------------------------------------------
-- profiles herkese okunur olduğu için değerler AYRI tabloda durur (RLS: sadece sahibi ve yönetici okur);
-- başkaları yalnızca aşağıdaki RPC'ler üzerinden ve gizlilik ayarına uyularak görür. Yazma sadece RPC ile.
create table if not exists public.profile_iracing (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  irating int not null check (irating between 1 and 20000),
  license text not null check (license ~ '^[A-Za-z/]{1,6} [0-9]{1,2}\.[0-9]{2}$'),
  lic_color text check (lic_color is null or lic_color ~ '^#[0-9a-f]{6}$'),
  country text check (country is null or country ~ '^[A-Z0-9-]{2,8}$'),
  cust_id bigint check (cust_id is null or cust_id > 0),
  category text check (category is null or category ~ '^[a-z]{2,16}$'),
  updated_at timestamptz not null default now()
);
alter table public.profile_iracing enable row level security;
drop policy if exists "profile_iracing own read" on public.profile_iracing;
create policy "profile_iracing own read" on public.profile_iracing for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.profile_iracing from anon, authenticated;
grant select on public.profile_iracing to authenticated;
grant all on public.profile_iracing to service_role;

alter table public.profiles add column if not exists ir_public boolean not null default true;

-- 2) Kendi iRacing bilgilerini kaydet ------------------------------------------------------
create or replace function public.profile_set_iracing(
  p_irating int,
  p_license text,
  p_lic_color text default null,
  p_country text default null,
  p_cust_id bigint default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_lic text := nullif(regexp_replace(trim(coalesce(p_license, '')), '\s+', ' ', 'g'), '');
  v_col text := nullif(lower(trim(coalesce(p_lic_color, ''))), '');
  v_cty text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_cat text := nullif(lower(regexp_replace(coalesce(p_category, ''), '[^A-Za-z]', '', 'g')), '');
  v_cust bigint := case when p_cust_id > 0 then p_cust_id end;
  cur public.profile_iracing;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_irating is null or p_irating < 1 or p_irating > 20000 then
    raise exception 'Geçersiz iRating';
  end if;
  if v_lic is null or v_lic !~ '^[A-Za-z/]{1,6} [0-9]{1,2}\.[0-9]{2}$' then
    raise exception 'Geçersiz lisans';
  end if;
  -- İsteğe bağlı alanlar: biçime uymayan değer hata değil, boş sayılır
  if v_col is not null and v_col !~ '^#[0-9a-f]{6}$' then
    v_col := null;
  end if;
  if v_cty is not null and v_cty !~ '^[A-Z0-9-]{2,8}$' then
    v_cty := null;
  end if;
  if v_cat is not null and v_cat !~ '^[a-z]{2,16}$' then
    v_cat := null;
  end if;

  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'Profil bulunamadı';
  end if;
  select * into cur from public.profile_iracing where user_id = me;
  if cur.user_id is not null then
    -- Değişiklik yoksa ve son yazım yeniyse dokunma (istemci de aynı kuralı uygular)
    if cur.updated_at > now() - interval '10 minutes'
       and cur.irating = p_irating
       and cur.license = v_lic
       and cur.lic_color is not distinct from v_col
       and cur.country is not distinct from v_cty
       and cur.cust_id is not distinct from v_cust
       and cur.category is not distinct from v_cat then
      return jsonb_build_object('ok', true, 'changed', false);
    end if;
    -- Çok sık yazımı sınırla (en çok 20 saniyede bir)
    if cur.updated_at > now() - interval '20 seconds' then
      return jsonb_build_object('ok', true, 'changed', false);
    end if;
  end if;
  insert into public.profile_iracing (user_id, irating, license, lic_color, country, cust_id, category, updated_at)
  values (me, p_irating, v_lic, v_col, v_cty, v_cust, v_cat, now())
  on conflict (user_id) do update
    set irating = excluded.irating, license = excluded.license, lic_color = excluded.lic_color,
        country = excluded.country, cust_id = excluded.cust_id, category = excluded.category,
        updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true, 'changed', true);
end $$;
revoke all on function public.profile_set_iracing(int, text, text, text, bigint, text) from public, anon;
grant execute on function public.profile_set_iracing(int, text, text, text, bigint, text) to authenticated, service_role;

-- 3) Gizlilik: "iRacing bilgilerimi profilimde göster" ---------------------------------------
create or replace function public.profile_iracing_public_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  update public.profiles set ir_public = coalesce(p_on, true) where id = auth.uid();
end $$;
revoke all on function public.profile_iracing_public_set(boolean) from public, anon;
grant execute on function public.profile_iracing_public_set(boolean) to authenticated, service_role;

-- 4) Herkese açık profil (c31 + iRacing bilgileri) ----------------------------------------
create or replace function public.public_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  ir public.profile_iracing;
  v_me boolean;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then
    return null;
  end if;
  v_me := auth.uid() is not null and p.id = auth.uid();
  select * into ir from public.profile_iracing where user_id = p.id;
  return jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar_path', p.avatar_path,
    'iracing_name', p.iracing_name,
    'bio', coalesce(p.bio, ''),
    'socials', coalesce(p.socials, '[]'::jsonb),
    'is_pro', coalesce(p.is_admin, false) or coalesce(p.pro_until > now(), false),
    'created_at', p.created_at,
    'is_me', v_me,
    'friend', case when auth.uid() is not null then
      (select f.status from public.friendships f where f.user_id = auth.uid() and f.friend_id = p.id) end,
    'sims', coalesce((
      select jsonb_agg(jsonb_build_object('sim', d.sim, 'sim_name', d.sim_name) order by d.last_seen desc)
      from public.driver_identities d where d.user_id = p.id and d.sim_name <> ''), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'tag', t.tag, 'color', t.color,
               'logo_path', t.logo_path, 'role', m.role) order by m.joined_at)
      from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = p.id), '[]'::jsonb),
    -- iRacing bilgileri: veri varsa ve üye izin veriyorsa (kendi profilinde her zaman; 'public' ayarı gösterir)
    'iracing', case when ir.user_id is not null and (coalesce(p.ir_public, true) or v_me) then
      jsonb_build_object('irating', ir.irating, 'license', ir.license, 'lic_color', ir.lic_color,
                         'country', ir.country, 'category', ir.category, 'updated_at', ir.updated_at,
                         'public', coalesce(p.ir_public, true)) end);
end $$;
grant execute on function public.public_profile(uuid) to anon, authenticated, service_role;

-- 5) Demo vitrini sürücüleri (ad + gerçek bayrak / iRating / lisans) ----------------------------
create or replace function public.demo_pro_drivers(p_limit int default 40) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', x.n, 'country', x.country, 'irating', x.irating, 'license', x.license, 'lic_color', x.lic_color)), '[]'::jsonb)
  from (
    select y.* from (
      select distinct on (lower(trim(p.display_name)))
             trim(p.display_name) as n,
             i.country, i.irating, i.license, i.lic_color
      from public.profiles p
      left join public.profile_iracing i on i.user_id = p.id and p.ir_public
      where p.demo_showcase
        and coalesce(p.pro_until > now(), false)
        and char_length(trim(p.display_name)) between 2 and 32
      order by lower(trim(p.display_name)), i.updated_at desc nulls last
    ) y
    order by random()
    limit greatest(1, least(coalesce(p_limit, 40), 100))
  ) x;
$$;
revoke all on function public.demo_pro_drivers(int) from public;
grant execute on function public.demo_pro_drivers(int) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
