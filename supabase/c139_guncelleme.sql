-- c139: Yönetici üye silme (Yönetim › Üyeler › "Üyeyi sil"). Hesap ve ona bağlı tüm kayıtlar (profil, ayarlar,
-- arkadaşlıklar, mesajlar… ; hepsi auth.users'a "on delete cascade" ile bağlı) kalıcı olarak silinir.
-- Kurallar: yalnızca yöneticiler; kendini ve sahibi silemezsin; başka bir yöneticiyi yalnızca sahip silebilir.
-- Uygulama silmeden önce onay ister (ad / e-posta yazılarak).
-- Sıra: herhangi bir yerden sonra. Tekrar çalıştırmak güvenlidir.

create or replace function public.admin_delete_user(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner boolean;
  v_admin boolean;
  v_email text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_id is null or p_id = auth.uid() then
    raise exception 'Kendi hesabını buradan silemezsin';
  end if;
  select coalesce(p.is_owner, false), coalesce(p.is_admin, false) into v_owner, v_admin
  from public.profiles p where p.id = p_id;
  if coalesce(v_owner, false) then
    raise exception 'Sahip hesabı silinemez';
  end if;
  if coalesce(v_admin, false) and not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_owner) then
    raise exception 'Bir yöneticiyi yalnızca sahip silebilir';
  end if;
  select u.email into v_email from auth.users u where u.id = p_id;
  if not found then
    raise exception 'Üye bulunamadı';
  end if;
  delete from auth.users where id = p_id;
  return coalesce(v_email, '');
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

notify pgrst, 'reload schema';
