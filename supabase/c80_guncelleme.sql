-- ---------------------------------------------------------------------------
-- c80: Yönetim › Mesajlar — tüm sohbetlerin tarihe göre taranması (sadece yönetici).
--
-- c28'deki admin_messages(...) yalnızca arkadaşlar arası özel mesajları düz liste olarak veriyordu (o fonksiyon
-- DEĞİŞMEDİ, eski program sürümleri ve site onu kullanmaya devam edebilir). Bu dosya dört kaynağı tek görünümde toplar:
--   dm     messages         (arkadaşlar arası özel mesaj; gönderen + alıcı)
--   team   team_messages    (takım sohbeti; oda = takım)
--   group  group_messages   (grup sohbeti; oda = chat_groups)
--   crew   crew_chat        (ekip odası; oda = sürücü. Yarış bitince silinir: yalnızca o an açık odalar görünür)
--
-- Adlar bilerek admin_chat_* (admin_messages ile aynı adı taşıyan ikinci bir imza PostgREST'te belirsiz çağrıya
-- yol açabilirdi).
--
-- Bu dosyanın oluşturduğu:
--   yardımcı  admin_like(text) -> text                  ILIKE kalıbı (\ % _ kaçışlı)
--             admin_messages_audit(jsonb, uuid)         mod_log'a 'messages_view' (aynı süzgeç 10 dk'da bir kez)
--   RPC       admin_chat_threads(p_kind, p_user, p_query, p_from, p_to, p_before, p_limit)
--               sohbet listesi (iki üye ya da oda), son mesaj zamanı + mesaj sayısı, yeniden eskiye
--             admin_chat_messages(p_kind, p_user, p_other, p_room, p_query, p_from, p_to, p_before, p_before_id, p_limit)
--               mesajlar, yeniden eskiye; sayfalama (created_at, id) anahtarıyla; p_limit en çok 200
--             admin_chat_users(p_q, p_limit)            üye seçici (ad / iRacing adı)
-- Denetim: her fonksiyon is_admin() denetler. İlk sayfa (p_before boş) mod_log'a 'messages_view' olarak yazılır;
--   aynı yönetici aynı süzgeçle 10 dakika içinde yeniden bakarsa ikinci kayıt atılmaz.
-- Sıra: c28, c30, c45, c64 sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create or replace function public.admin_like(p_q text) returns text
language sql immutable as $$
  select case when nullif(trim(coalesce(p_q, '')), '') is null then null
              else '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
$$;

create or replace function public.admin_messages_audit(p_details jsonb, p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d jsonb := jsonb_strip_nulls(coalesce(p_details, '{}'::jsonb));
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.mod_log l
              where l.actor = auth.uid() and l.action = 'messages_view' and l.details = d
                and l.created_at > now() - interval '10 minutes') then
    return;
  end if;
  perform public.log_mod('messages_view', 'message', '', p_owner, d);
end $$;
revoke all on function public.admin_messages_audit(jsonb, uuid) from public, anon, authenticated;

-- Oda adı (denetim kaydı için)
create or replace function public.admin_chat_room_name(p_kind text, p_room uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'team' then (select t.name from public.teams t where t.id = p_room)
    when 'group' then (select g.name from public.chat_groups g where g.id = p_room)
    when 'crew' then (select p.display_name from public.profiles p where p.id = p_room)
  end;
$$;
revoke all on function public.admin_chat_room_name(text, uuid) from public, anon, authenticated;

-- 1) Sohbet listesi --------------------------------------------------------------
-- dm: a / b = iki üye (a < b). Oda: a = oda kimliği (takım / grup / sürücü), b boş.
-- p_user: o üyenin dahil olduğu özel sohbetler + mesaj yazdığı odalar.
-- p_query: taraf / oda adında ya da sohbetin herhangi bir mesajında geçen metin.
-- p_from / p_to: yalnızca bu aralıktaki mesajlar sayılır (aralıkta mesajı olmayan sohbet gelmez).
create or replace function public.admin_chat_threads(
  p_kind text default null, p_user uuid default null, p_query text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_before timestamptz default null, p_limit int default 100)
returns table (kind text, a uuid, a_name text, a_avatar text, b uuid, b_name text, b_avatar text,
               last_at timestamptz, msg_count bigint, last_body text, last_sender_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  pat text := public.admin_like(p_query);
  k text := nullif(trim(coalesce(p_kind, '')), '');
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 100), 1), 200);
  if p_before is null then
    perform public.admin_messages_audit(jsonb_build_object(
      'list', true, 'kind', k,
      'user', (select p.display_name from public.profiles p where p.id = p_user),
      'text', nullif(trim(coalesce(p_query, '')), ''), 'from', p_from, 'to', p_to), p_user);
  end if;
  return query
    with msgs as (
      select 'dm'::text as kind, least(m.sender, m.recipient) as a, greatest(m.sender, m.recipient) as b,
             m.sender, m.body, m.created_at, m.id
        from public.messages m where k is null or k = 'dm'
      union all
      select 'team', tm.team_id, null::uuid, tm.sender, case when tm.deleted then '' else tm.body end, tm.created_at, tm.id
        from public.team_messages tm where k is null or k = 'team'
      union all
      select 'group', gm.group_id, null::uuid, gm.sender, case when gm.deleted then '' else gm.body end, gm.created_at, gm.id
        from public.group_messages gm where k is null or k = 'group'
      union all
      select 'crew', cc.owner, null::uuid, cc.sender, cc.body, cc.created_at, cc.id
        from public.crew_chat cc where k is null or k = 'crew'
    ),
    agg as (
      select x.kind, x.a, x.b,
             max(x.created_at) as last_at, count(*) as msg_count,
             (array_agg(x.body order by x.created_at desc, x.id desc))[1] as last_body,
             (array_agg(x.sender order by x.created_at desc, x.id desc))[1] as last_sender,
             coalesce(bool_or(x.body ilike pat), false) as text_hit,
             coalesce(bool_or(x.sender = p_user), false) as user_hit
        from msgs x
       where (p_from is null or x.created_at >= p_from)
         and (p_to is null or x.created_at < p_to)
       group by x.kind, x.a, x.b
    )
    select g.kind, g.a,
           case g.kind when 'team' then coalesce((select '[' || t.tag || '] ' || t.name from public.teams t where t.id = g.a), '?')
                       when 'group' then coalesce((select cg.name from public.chat_groups cg where cg.id = g.a), '?')
                       else coalesce(pa.display_name, '?') end,
           case when g.kind in ('dm', 'crew') then pa.avatar_path end,
           g.b, case when g.b is not null then coalesce(pb.display_name, '?') end, pb.avatar_path,
           g.last_at, g.msg_count, g.last_body, coalesce(ps.display_name, '?')
      from agg g
      left join public.profiles pa on g.kind in ('dm', 'crew') and pa.id = g.a
      left join public.profiles pb on pb.id = g.b
      left join public.profiles ps on ps.id = g.last_sender
     where (p_user is null or g.user_hit or (g.kind = 'dm' and (g.a = p_user or g.b = p_user)) or (g.kind = 'crew' and g.a = p_user))
       and (pat is null or g.text_hit
            or pa.display_name ilike pat or pa.iracing_name ilike pat
            or pb.display_name ilike pat or pb.iracing_name ilike pat
            or (g.kind = 'team' and exists (select 1 from public.teams t where t.id = g.a and (t.name ilike pat or t.tag ilike pat)))
            or (g.kind = 'group' and exists (select 1 from public.chat_groups cg where cg.id = g.a and cg.name ilike pat)))
       and (p_before is null or g.last_at < p_before)
     order by g.last_at desc
     limit p_limit;
end $$;

-- 2) Mesajlar --------------------------------------------------------------------
-- peer: dm'de alıcı, odalarda oda kimliği (takım / grup / sürücü).
-- p_user: gönderen ya da (dm'de) alıcı o üye. p_user + p_other: yalnızca ikisi arasındaki özel mesajlar.
-- p_room (+ p_kind): yalnızca o oda. p_query: metinde, gönderen adında ya da alıcı / oda adında geçen parça.
-- Sayfalama: bir önceki sayfanın son satırındaki created_at + id -> p_before + p_before_id.
create or replace function public.admin_chat_messages(
  p_kind text default null, p_user uuid default null, p_other uuid default null, p_room uuid default null,
  p_query text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_before timestamptz default null, p_before_id uuid default null, p_limit int default 100)
returns table (kind text, id uuid, created_at timestamptz, sender uuid, sender_name text, sender_avatar text,
               peer uuid, peer_name text, peer_avatar text, body text, deleted boolean, meta jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  pat text := public.admin_like(p_query);
  k text := nullif(trim(coalesce(p_kind, '')), '');
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 100), 1), 200);
  if p_other is not null and p_user is null then
    p_user := p_other;
    p_other := null;
  end if;
  if p_other is not null then
    k := 'dm';       -- ikili sohbet yalnızca özel mesajlarda vardır
    p_room := null;
  end if;
  if p_before is null then
    perform public.admin_messages_audit(jsonb_build_object(
      'kind', k,
      'user', (select p.display_name from public.profiles p where p.id = p_user),
      'other', (select p.display_name from public.profiles p where p.id = p_other),
      'room', case when p_room is not null then coalesce(public.admin_chat_room_name(k, p_room), p_room::text) end,
      'text', nullif(trim(coalesce(p_query, '')), ''), 'from', p_from, 'to', p_to), p_user);
  end if;
  return query
    select x.kind, x.id, x.created_at, x.sender, x.sender_name, x.sender_avatar,
           x.peer, x.peer_name, x.peer_avatar, x.body, x.deleted, x.meta
    from (
      select 'dm'::text as kind, m.id, m.created_at, m.sender,
             coalesce(ps.display_name, '?') as sender_name, ps.avatar_path as sender_avatar,
             m.recipient as peer, coalesce(pr.display_name, '?') as peer_name, pr.avatar_path as peer_avatar,
             m.body, false as deleted, m.meta, m.recipient as other_user,
             coalesce(ps.iracing_name, '') || ' ' || coalesce(pr.iracing_name, '') as extra_names
        from public.messages m
        left join public.profiles ps on ps.id = m.sender
        left join public.profiles pr on pr.id = m.recipient
       where (k is null or k = 'dm') and p_room is null
      union all
      select 'team', tm.id, tm.created_at, tm.sender,
             coalesce(ps.display_name, '?'), ps.avatar_path,
             tm.team_id, coalesce('[' || t.tag || '] ' || t.name, '?'), null::text,
             case when tm.deleted then '' else tm.body end, tm.deleted,
             case when tm.poll_id is not null then coalesce(tm.meta, '{}'::jsonb) || jsonb_build_object('poll', tm.poll_id) else tm.meta end,
             null::uuid, coalesce(ps.iracing_name, '')
        from public.team_messages tm
        left join public.profiles ps on ps.id = tm.sender
        left join public.teams t on t.id = tm.team_id
       where (k is null or k = 'team') and (p_room is null or (k = 'team' and tm.team_id = p_room))
      union all
      select 'group', gm.id, gm.created_at, gm.sender,
             coalesce(ps.display_name, '?'), ps.avatar_path,
             gm.group_id, coalesce(cg.name, '?'), null::text,
             case when gm.deleted then '' else gm.body end, gm.deleted, gm.meta,
             null::uuid, coalesce(ps.iracing_name, '')
        from public.group_messages gm
        left join public.profiles ps on ps.id = gm.sender
        left join public.chat_groups cg on cg.id = gm.group_id
       where (k is null or k = 'group') and (p_room is null or (k = 'group' and gm.group_id = p_room))
      union all
      select 'crew', cc.id, cc.created_at, cc.sender,
             coalesce(ps.display_name, '?'), ps.avatar_path,
             cc.owner, coalesce(po.display_name, '?'), po.avatar_path,
             cc.body, false, null::jsonb,
             cc.owner, coalesce(ps.iracing_name, '') || ' ' || coalesce(po.iracing_name, '')
        from public.crew_chat cc
        left join public.profiles ps on ps.id = cc.sender
        left join public.profiles po on po.id = cc.owner
       where (k is null or k = 'crew') and (p_room is null or (k = 'crew' and cc.owner = p_room))
    ) x
    where (p_user is null
           or (p_other is null and (x.sender = p_user or x.other_user = p_user))
           or (p_other is not null and ((x.sender = p_user and x.other_user = p_other) or (x.sender = p_other and x.other_user = p_user))))
      and (pat is null or x.body ilike pat or x.sender_name ilike pat or x.peer_name ilike pat or x.extra_names ilike pat)
      and (p_from is null or x.created_at >= p_from)
      and (p_to is null or x.created_at < p_to)
      and (p_before is null
           or x.created_at < p_before
           or (p_before_id is not null and x.created_at = p_before and x.id < p_before_id))
    order by x.created_at desc, x.id desc
    limit p_limit;
end $$;

-- 3) Üye seçici ------------------------------------------------------------------
create or replace function public.admin_chat_users(p_q text, p_limit int default 20)
returns table (id uuid, display_name text, iracing_name text, avatar_path text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  pat text := public.admin_like(p_q);
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if pat is null then
    return;
  end if;
  return query
    select p.id, p.display_name, p.iracing_name, p.avatar_path
      from public.profiles p
     where p.display_name ilike pat or p.iracing_name ilike pat
     order by p.display_name
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

-- Yetkiler -----------------------------------------------------------------------
revoke all on function
  public.admin_chat_threads(text, uuid, text, timestamptz, timestamptz, timestamptz, int),
  public.admin_chat_messages(text, uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz, uuid, int),
  public.admin_chat_users(text, int) from public, anon;
grant execute on function
  public.admin_chat_threads(text, uuid, text, timestamptz, timestamptz, timestamptz, int),
  public.admin_chat_messages(text, uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz, uuid, int),
  public.admin_chat_users(text, int) to authenticated;
