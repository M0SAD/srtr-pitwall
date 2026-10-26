-- c138: Aynı e-postayla tek hesap. Supabase e-postayı büyük / küçük harfe göre ayırmaz ama aynı adresin farklı
-- yazılışları (Gmail'de noktalar: ali.veli@ = aliveli@, googlemail.com = gmail.com; her sağlayıcıda +etiket:
-- ali+2@ = ali@) ayrı hesap açabiliyordu. Yeni kayıtta ve e-posta değiştirmede aynı adrese (sadeleştirilmiş haline)
-- sahip başka hesap varsa reddedilir. Mevcut çift hesaplar silinmez: Yönetim › Üyeler › "Aynı e-posta" süzgeci listeler.
-- Sıra: herhangi bir yerden sonra. Tekrar çalıştırmak güvenlidir.

-- Sadeleştirilmiş e-posta: küçük harf, +etiket atılır; Gmail / Googlemail'de noktalar da atılır
create or replace function public.email_canon(p text)
returns text
language sql
immutable
as $$
  select case
           when p is null or position('@' in p) = 0 then lower(btrim(coalesce(p, '')))
           when d in ('gmail.com', 'googlemail.com') then replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
           else split_part(l, '+', 1) || '@' || d
         end
  from (select lower(btrim(split_part(p, '@', 1))) as l, lower(btrim(split_part(p, '@', 2))) as d) x
$$;
grant execute on function public.email_canon(text) to anon, authenticated, service_role;

create or replace function public.block_duplicate_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;
  -- Güncellemede yalnızca e-posta gerçekten değiştiyse (var olan çift hesapların girişi bozulmasın)
  if tg_op = 'UPDATE' and old.email is not distinct from new.email then
    return new;
  end if;
  if exists (
    select 1 from auth.users u
    where u.id <> new.id and u.email is not null and public.email_canon(u.email) = public.email_canon(new.email)
  ) then
    raise exception 'Bu e-posta adresiyle zaten bir hesap var (DUPLICATE_EMAIL)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists block_duplicate_email on auth.users;
create trigger block_duplicate_email
  before insert or update of email on auth.users
  for each row execute function public.block_duplicate_email();

create or replace function public.admin_users(p_q text, p_filter text, p_offset int)
returns table (id uuid, display_name text, email text, iracing_name text, pro_until timestamptz, pro_source text,
               is_admin boolean, is_owner boolean, groups uuid[], created_at timestamptz, last_seen timestamptz, version text,
               pro_paid_until timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  -- Görünmez karakterler (sıfır genişlikli boşluk, BOM, bölünmez boşluk) atılır, baştaki "mailto:" silinir
  q text := btrim(regexp_replace(regexp_replace(coalesce(p_q, ''), '[​-‍﻿ ]', '', 'g'), '^mailto:', '', 'i'));
  pat text;
  qid uuid;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  -- E-posta gibi görünüyorsa içindeki boşluklar da atılır
  if position('@' in q) > 0 then
    q := regexp_replace(q, '\s+', '', 'g');
  end if;
  -- LIKE jokerleri (% _ \) düz karakter olarak aranır
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  begin
    qid := q::uuid;
  exception when others then
    qid := null;
  end;
  return query
    select p.id, p.display_name, u.email::text, p.iracing_name, p.pro_until, p.pro_source, p.is_admin, p.is_owner,
           coalesce((select array_agg(ug.group_id) from public.user_groups ug where ug.user_id = p.id), '{}'),
           p.created_at, s.last_seen, s.version, p.pro_paid_until
    from public.profiles p
    join auth.users u on u.id = p.id
    left join lateral (select max(a.last_seen) as last_seen, max(a.version) as version from public.app_pings a where a.user_id = p.id) s on true
    where (q = ''
           or p.id = qid
           or p.display_name ilike pat
           or coalesce(p.iracing_name, '') ilike pat
           or coalesce(u.email, '') ilike pat
           or coalesce(u.email_change, '') ilike pat
           or coalesce(u.raw_user_meta_data ->> 'email', '') ilike pat
           or exists (select 1 from auth.identities i where i.user_id = u.id and coalesce(i.identity_data ->> 'email', '') ilike pat)
           or exists (select 1 from public.payments pa where pa.user_id = p.id and pa.email ilike pat)
           or exists (select 1 from public.subscriptions su where su.user_id = p.id and su.email ilike pat))
      and case coalesce(p_filter, 'all')
            when 'pro' then p.pro_until > now()
            when 'admin' then p.is_admin
            when 'online' then s.last_seen > now() - interval '4 minutes'
            -- Aynı e-postayla (büyük / küçük harf, Gmail noktası, +etiket farkıyla) birden çok hesap
            when 'dup' then u.email is not null and exists (
              select 1 from auth.users u2 where u2.id <> u.id and u2.email is not null
                and public.email_canon(u2.email) = public.email_canon(u.email))
            else true end
    order by
      case when p_filter = 'dup' then public.email_canon(u.email) end asc nulls last,
      case when p.pro_until > now() and p.pro_until < '2090-01-01'::timestamptz then 0
           when p.pro_until > now() then 1
           else 2 end,
      case when p.pro_until > now() and p.pro_until < '2090-01-01'::timestamptz then p.pro_until end asc nulls last,
      p.created_at desc
    limit 50 offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_users(text, text, int) from public, anon;
grant execute on function public.admin_users(text, text, int) to authenticated;

notify pgrst, 'reload schema';
