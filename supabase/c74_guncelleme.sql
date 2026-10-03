-- ---------------------------------------------------------------------------
-- c74: Arkadaş listesi — durum saatini sunucu yazar.
--      Sorun: "çevrimiçi / yarışta" bilgisi user_status.updated_at son 3 dakikadaysa geçerli sayılır
--      (my_friends, friend_shares, admin_members_live), ama bu saati program üyenin BİLGİSAYAR SAATİYLE
--      gönderiyordu. Saati birkaç dakika geri (ya da saat dilimi / çift işletim sistemi yüzünden saatlerce
--      yanlış) olan üye, kendisi herkesi doğru görürken arkadaşlarına hep çevrimdışı görünür: hangi pistte /
--      oturumda olduğu listede çıkmaz. Saati ileri olan üye ise programı kapattıktan sonra da çevrimiçi kalır.
--      Aynı durum live_data.updated_at için de geçerli (friend_shares "canlı" = son 2 dakika).
--      Çözüm: üyenin kendi yazdığı satırlarda updated_at her zaman sunucu saati (now()) olur.
--      Sunucu tarafı yazmalar (service_role: yedekten geri yükleme vb.; auth.uid() boş) olduğu gibi kalır.
--      İşlev tanımları (my_friends vb.) DEĞİŞMEDİ; c65'teki son tanımlar geçerli.
-- Sıra: c65'ten sonra. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create or replace function public.presence_server_time() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists user_status_server_time on public.user_status;
create trigger user_status_server_time before insert or update on public.user_status
  for each row execute function public.presence_server_time();

drop trigger if exists live_data_server_time on public.live_data;
create trigger live_data_server_time before insert or update on public.live_data
  for each row execute function public.presence_server_time();
