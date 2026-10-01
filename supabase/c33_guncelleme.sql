-- ---------------------------------------------------------------------------
-- c33: Demo modu vitrini: PRO üyelerin görünen adları demo yarışındaki sahte sürücüler arasında görünür.
--      1) profiles.demo_showcase (varsayılan true): "Demo modunda adım görünebilsin". Kullanıcı Hesap → PRO
--         bölümünden kapatabilir (demo_showcase_set). Kendi profilini güncelleme izni zaten var; RPC sadece kolaylık.
--      2) demo_pro_names(p_limit): herkese açık (giriş gerekmez). Aktif PRO üyelerin (pro_until > şimdi; kampanya
--         ile herkesin PRO olduğu dönemler sayılmaz) sadece görünen adlarını rastgele sırayla döner. Kimlik,
--         e-posta vb. dönmez; adı boş olanlar ve vitrini kapatanlar hariç. En fazla 100 ad.
-- Sıra: bağımsız (profiles tablosu yeterli).
-- ---------------------------------------------------------------------------

-- 1) Profil ayarı ---------------------------------------------------------------------
alter table public.profiles add column if not exists demo_showcase boolean not null default true;

create or replace function public.demo_showcase_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  update public.profiles set demo_showcase = coalesce(p_on, true) where id = auth.uid();
end;
$$;
revoke all on function public.demo_showcase_set(boolean) from public, anon;
grant execute on function public.demo_showcase_set(boolean) to authenticated, service_role;

-- 2) Demo vitrini adları ------------------------------------------------------------------
create or replace function public.demo_pro_names(p_limit int default 40) returns setof text
language sql stable security definer set search_path = public as $$
  select n from (
    select distinct trim(p.display_name) as n
    from public.profiles p
    where p.demo_showcase
      and coalesce(p.pro_until > now(), false)
      and char_length(trim(p.display_name)) between 2 and 32
  ) x
  order by random()
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;
revoke all on function public.demo_pro_names(int) from public;
grant execute on function public.demo_pro_names(int) to anon, authenticated, service_role;
