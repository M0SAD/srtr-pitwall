-- c124: Ses odası bağlantı bekçisi. voice_heartbeat, kişinin ses oturumu kaydı sunucuda yoksa (uzun süre yanıt
-- veremediği için silinmişse) null döner; uygulama bunu görünce sessizce yeniden bağlanır. Önceden bu durumda
-- kişi sesleri duymaya devam ediyor ama diğerleri onu duyamıyordu (odadan çıkmış gibi görünüyordu).
--   true  = oturum canlı   false = odaya girme yetkisi yok (çıkarıldı)   null = oturum kaydı yok (yeniden bağlan)

create or replace function public.voice_heartbeat(p_room uuid, p_leave boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_leave then
    delete from public.voice_sessions where room_id = p_room and user_id = auth.uid();
    delete from public.voice_requests where room_id = p_room and user_id = auth.uid();
    return false;
  end if;
  if public.voice_role(p_room, auth.uid()) is null then
    delete from public.voice_sessions where room_id = p_room and user_id = auth.uid();
    return false;
  end if;
  update public.voice_sessions set last_seen = now() where room_id = p_room and user_id = auth.uid();
  get diagnostics n = row_count;
  -- Odada biri olduğu sürece oda "etkin" (boş kalan oda 1 saat sonra silinir: voice_rooms_cleanup)
  update public.voice_rooms set last_active = now() where id = p_room and last_active < now() - interval '1 minute';
  -- Eski bağlantılar temizlenir
  delete from public.voice_sessions where last_seen < now() - interval '10 minutes';
  if n = 0 then
    return null;
  end if;
  return true;
end $$;

notify pgrst, 'reload schema';
