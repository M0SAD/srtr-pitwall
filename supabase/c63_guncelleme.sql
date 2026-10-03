-- ---------------------------------------------------------------------------
-- c63 — iRacing bilgileri KATEGORİ BAŞINA (Sports Car / Formula / Oval / Dirt Road / Dirt Oval)
-- Sorun: iRacing, oturum bilgisinde sürücünün iRating / lisans + SR değerini O OTURUMUN kategorisi için verir
--        (yol serisinde yol lisansı, ovalde oval lisansı). c56 üye başına TEK değer tutuyordu; üye en son hangi
--        kategoride sürdüyse onun değeri öncekinin üstüne yazılıyor, profilde "yanlış iR / SR" gibi görünüyordu.
-- Çözüm: 1) profile_iracing.cats (jsonb): kategori -> {irating, license, lic_color, updated_at}. Eski tek değer
--           alanları (irating, license, …) "en son sürülen kategori" olarak kalır (demo vitrini ve eski sürümler).
--        2) profile_set_iracing: aynı imza; değeri ilgili kategorinin altına da yazar.
--        3) profile_iracing_cats(p_user): profilde gösterilecek kategori listesi (gizlilik ayarına uyar;
--           sahibi her zaman görür). public_profile DEĞİŞMEDİ.
-- Sıra: c56 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

alter table public.profile_iracing add column if not exists cats jsonb not null default '{}'::jsonb;

-- Var olan tek değer, kategorisi biliniyorsa o kategorinin ilk kaydı olur
update public.profile_iracing
   set cats = jsonb_build_object(category, jsonb_build_object(
         'irating', irating, 'license', license, 'lic_color', lic_color, 'updated_at', updated_at))
 where cats = '{}'::jsonb and category is not null;

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
  v_cats jsonb;
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
  -- Kategori başına değer: başka iRacing hesabına geçildiyse eski hesabın kategorileri silinir
  v_cats := case when cur.user_id is not null and cur.cust_id is not distinct from v_cust
                 then coalesce(cur.cats, '{}'::jsonb) else '{}'::jsonb end;
  if v_cat is not null then
    v_cats := v_cats || jsonb_build_object(v_cat, jsonb_build_object(
      'irating', p_irating, 'license', v_lic, 'lic_color', v_col, 'updated_at', now()));
  end if;
  insert into public.profile_iracing (user_id, irating, license, lic_color, country, cust_id, category, cats, updated_at)
  values (me, p_irating, v_lic, v_col, v_cty, v_cust, v_cat, v_cats, now())
  on conflict (user_id) do update
    set irating = excluded.irating, license = excluded.license, lic_color = excluded.lic_color,
        country = excluded.country, cust_id = excluded.cust_id, category = excluded.category,
        cats = excluded.cats, updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true, 'changed', true);
end $$;
revoke all on function public.profile_set_iracing(int, text, text, text, bigint, text) from public, anon;
grant execute on function public.profile_set_iracing(int, text, text, text, bigint, text) to authenticated, service_role;

-- Profilde gösterilecek kategori listesi (en son güncellenen önce). Gizliyse (ir_public kapalı) sadece sahibi görür.
create or replace function public.profile_iracing_cats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'category', c.key,
             'irating', (c.value ->> 'irating')::int,
             'license', c.value ->> 'license',
             'lic_color', c.value ->> 'lic_color',
             'updated_at', c.value ->> 'updated_at')
           order by c.value ->> 'updated_at' desc)
    from public.profile_iracing i
    join public.profiles p on p.id = i.user_id
    cross join lateral jsonb_each(i.cats) c
    where i.user_id = p_user
      and (coalesce(p.ir_public, true) or (auth.uid() is not null and p.id = auth.uid()))
  ), '[]'::jsonb);
$$;
revoke all on function public.profile_iracing_cats(uuid) from public;
grant execute on function public.profile_iracing_cats(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
