-- c118: c117'den önce kurulmuş odalar: yönetici olmayanların odaları da "Özel oda" sayılsın (boş kalınca 1 saat sonra
-- silinir). Yöneticilerin odaları "Topluluk odası" olarak kalıcı kalır. Birden fazla çalıştırılabilir.

update public.voice_rooms r set auto_delete = true
where not r.auto_delete
  and not coalesce((select p.is_admin from public.profiles p where p.id = r.owner), false);

notify pgrst, 'reload schema';
