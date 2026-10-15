-- c117: Ses odası kurma izni ve boş odaların silinmesi.
--   * app_config.voice_create: admin (yalnızca yöneticiler) | pro (PRO üyeler, varsayılan) | team (PRO + takım
--     yöneticileri takım odası) | all (herkes). Yöneticiler her zaman kurar; yöneticiler için 10 oda sınırı yok.
--   * Yönetici olmayanların kurduğu odalar (auto_delete) içinde kimse kalmadıktan 1 saat sonra silinir. Yöneticilerin
--     odaları kalıcıdır. Silme: pg_cron (5 dk'da bir) + oda kurulurken; süresi dolan oda listede de görünmez.
--   * Odalara herkes girebilir (değişmedi).

alter table public.app_config add column if not exists voice_create text not null default 'pro';
alter table public.app_config drop constraint if exists app_config_voice_create_check;
alter table public.app_config add constraint app_config_voice_create_check check (voice_create in ('admin', 'pro', 'team', 'all'));

alter table public.voice_rooms add column if not exists auto_delete boolean not null default false;

/** Boş kaldıktan 1 saat sonra silinecek oda mı */
create or replace function public.voice_room_expired(r public.voice_rooms) returns boolean
language sql stable security definer set search_path = public as $$
  select r.auto_delete and r.last_active < now() - interval '1 hour'
    and not exists (select 1 from public.voice_sessions s where s.room_id = r.id and s.last_seen > now() - interval '90 seconds');
$$;

create or replace function public.voice_rooms_cleanup() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from public.voice_rooms r where public.voice_room_expired(r);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.voice_room_create(p_name text, p_kind text default 'public', p_team uuid default null,
  p_mode text default 'open', p_talk_seconds int default 60, p_max int default 50, p_description text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_id uuid;
  v_who text;
  v_adm boolean := public.is_admin();
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  -- Oda kurma izni (app_config.voice_create): admin = sadece site yöneticileri, pro = PRO üyeler (varsayılan),
  -- team = PRO üyeler + takım odası için takım yöneticileri, all = herkes. Yöneticiler her zaman kurar.
  v_who := coalesce((select voice_create from public.app_config where id = 1), 'pro');
  if not v_adm then
    if v_who = 'admin'
       or (v_who = 'pro' and not public.is_pro())
       or (v_who = 'team' and not public.is_pro() and not (p_kind = 'team' and p_team is not null and public.is_team_admin(p_team))) then
      raise exception '%', case when v_who = 'admin' then 'Ses odalarını yalnızca yöneticiler kurabilir'
        else 'Ses odası kurmak PRO üyelere özel' end;
    end if;
  end if;
  perform public.voice_rooms_cleanup();
  if (select count(*) from public.voice_rooms where owner = me) >= 10 and not v_adm then
    raise exception 'En çok 10 oda kurabilirsin';
  end if;
  if p_kind = 'team' and (p_team is null or not public.is_team_admin(p_team)) then
    raise exception 'Takım odasını yalnızca takım yöneticileri kurabilir';
  end if;
  insert into public.voice_rooms (owner, name, description, kind, team_id, invite_code, mode, talk_seconds, max_members, auto_delete)
  values (me, trim(p_name), coalesce(trim(p_description), ''), p_kind, case when p_kind = 'team' then p_team end,
    case when p_kind = 'private' then upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) end,
    p_mode, least(greatest(coalesce(p_talk_seconds, 60), 10), 900), least(greatest(coalesce(p_max, 50), 2), 60), not v_adm)
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.voice_rooms_list();
create or replace function public.voice_rooms_list() returns table (
  id uuid, name text, description text, kind text, team_id uuid, team_name text, mode text, talk_seconds int,
  max_members int, owner uuid, owner_name text, members int, my_role text, is_mine boolean, auto_delete boolean
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.kind, r.team_id, t.name, r.mode, r.talk_seconds, r.max_members, r.owner,
         p.display_name, public.voice_member_count(r.id), public.voice_role(r.id, auth.uid()), r.owner = auth.uid(), r.auto_delete
  from public.voice_rooms r
  left join public.teams t on t.id = r.team_id
  left join public.profiles p on p.id = r.owner
  where auth.uid() is not null
    and (r.kind = 'public'
      or r.owner = auth.uid()
      or exists (select 1 from public.voice_room_roles x where x.room_id = r.id and x.user_id = auth.uid())
      or (r.kind = 'team' and public.is_team_member(r.team_id)))
    and not public.voice_room_expired(r)
    and not exists (select 1 from public.voice_bans b where b.room_id = r.id and b.user_id = auth.uid() and (b.until is null or b.until > now()))
  order by public.voice_member_count(r.id) desc, r.last_active desc
  limit 200;
$$;

create or replace function public.voice_heartbeat(p_room uuid, p_leave boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
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
  -- Odada biri olduğu sürece oda "etkin" (boş kalan oda 1 saat sonra silinir: voice_rooms_cleanup)
  update public.voice_rooms set last_active = now() where id = p_room and last_active < now() - interval '1 minute';
  -- Eski bağlantılar temizlenir
  delete from public.voice_sessions where last_seen < now() - interval '10 minutes';
  return true;
end $$;

revoke all on function public.voice_room_expired(public.voice_rooms), public.voice_rooms_cleanup() from public, anon, authenticated;
revoke all on function public.voice_rooms_list() from public, anon;
grant execute on function public.voice_rooms_list() to authenticated;
grant execute on function public.voice_rooms_cleanup() to service_role;

-- 5 dakikada bir boş odaları temizle (pg_cron yoksa atlanır; oda kurulurken de temizlenir)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pitwall-voice-rooms-cleanup';
    perform cron.schedule('pitwall-voice-rooms-cleanup', '*/5 * * * *', 'select public.voice_rooms_cleanup()');
  end if;
end $$;

notify pgrst, 'reload schema';
