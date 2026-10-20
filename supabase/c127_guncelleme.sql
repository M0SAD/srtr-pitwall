-- c127: Yönetim › Gelir: elle gelir ekleme. Yönetici satış tarihini, tutarı, para birimini, yöntemi, ne alındığını ve
-- kimin aldığını girer; PRO süresine dokunmaz (PRO vermek için Üyeler › PRO düzenle kullanılır).
-- Alan kişi üyeyse seçilir (user_id); üye değilse adı / e-postası yazılır. Yazılan e-posta bir üyeninkiyle aynıysa
-- ödeme o üyeye bağlanır. Üye olmayan alıcının adı yeni "buyer" sütununda tutulur ve listede ad olarak görünür.

alter table public.payments add column if not exists buyer text not null default '';

create or replace function public.admin_payment_add(
  p_user uuid, p_buyer text, p_amount numeric, p_currency text, p_method text, p_plan text, p_kind text,
  p_created_at timestamptz)
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  nid text := 'manual_' || replace(gen_random_uuid()::text, '-', '');
  b text := left(btrim(coalesce(p_buyer, '')), 120);
  uid uuid := p_user;
  em text := '';
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Geçersiz tutar';
  end if;
  if coalesce(p_kind, '') not in ('payment', 'refund') then
    raise exception 'Geçersiz tür';
  end if;
  if coalesce(p_currency, '') !~ '^[A-Z]{3}$' then
    raise exception 'Geçersiz para birimi';
  end if;
  if p_created_at is null or p_created_at > now() + interval '1 day' then
    raise exception 'Geçersiz tarih';
  end if;
  if uid is not null and not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Üye bulunamadı';
  end if;
  -- E-posta yazıldıysa ve bir üyeninkiyle aynıysa o üyeye bağla
  if uid is null and position('@' in b) > 0 then
    select u.id into uid from auth.users u where lower(u.email) = lower(b) limit 1;
  end if;
  if uid is not null then
    select coalesce(u.email, '') into em from auth.users u where u.id = uid;
    b := '';
  elsif position('@' in b) > 0 then
    em := b;
  end if;
  insert into public.payments (id, source, user_id, email, amount, currency, plan, kind, created_at, method, buyer)
  values (nid, 'manual', uid, em, round(p_amount, 2), p_currency, left(btrim(coalesce(p_plan, '')), 120), p_kind,
          p_created_at, left(btrim(coalesce(p_method, '')), 60), b);
  return nid;
end $$;
revoke all on function public.admin_payment_add(uuid, text, numeric, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.admin_payment_add(uuid, text, numeric, text, text, text, text, timestamptz) to authenticated;

-- Listede üye olmayan alıcının adı görünsün (dönüş tipi aynı)
create or replace function public.admin_payments(p_days int default 365)
returns table (id text, source text, user_id uuid, display_name text, email text, amount numeric, currency text,
               plan text, kind text, created_at timestamptz, method text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return query
    select x.id, x.source, x.user_id, coalesce(p.display_name, nullif(x.buyer, '')), x.email, x.amount, x.currency,
           x.plan, x.kind, x.created_at, x.method
    from public.payments x left join public.profiles p on p.id = x.user_id
    where x.created_at > now() - make_interval(days => greatest(p_days, 1))
    order by x.created_at desc limit 1000;
end $$;
revoke all on function public.admin_payments(int) from public, anon;
grant execute on function public.admin_payments(int) to authenticated;

notify pgrst, 'reload schema';
