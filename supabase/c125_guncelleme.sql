-- c125: Yönetim › Üyeler araması e-postayla üyeyi bulamıyordu. Arama yalnızca hesabın giriş e-postasında
-- (auth.users.email) yapılıyordu; üyenin bilinen e-postası çoğu zaman başka bir yerde durur:
--   * ödeme / abonelikte kullanılan e-posta (payments.email, subscriptions.email)
--   * değiştirilmek üzere onay bekleyen yeni e-posta (auth.users.email_change)
--   * Google / Discord gibi girişlerde sağlayıcının verdiği e-posta (auth.identities)
-- Ayrıca kopyala-yapıştırla gelen boşluk / görünmez karakterler ve e-postadaki "_" (LIKE'ta joker) aramayı
-- bozabiliyordu. Artık hepsinde aranır; tam kullanıcı kimliğiyle (uuid) de bulunur. Dönüş tipi aynı.

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
            else true end
    order by
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
