-- c126: Yönetim › Gelir: ödemeler düzenlenebilir ve silinebilir.
-- Yönetici bir ödemenin tutarını, para birimini, yöntemini, ne alındığını (plan), türünü (ödeme / iade) ve tarihini
-- değiştirebilir ya da ödemeyi silebilir. Gelir toplamları, "Parayla PRO" sayısı ve yönteme göre döküm buna göre
-- yeniden hesaplanır. (Giderler zaten yöneticiye açık tablo: düzenleme uygulamadan doğrudan yapılır.)

create or replace function public.admin_payment_update(
  p_id text, p_amount numeric, p_currency text, p_method text, p_plan text, p_kind text, p_created_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
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
  update public.payments
    set amount = round(p_amount, 2),
        currency = p_currency,
        method = left(btrim(coalesce(p_method, '')), 60),
        plan = left(btrim(coalesce(p_plan, '')), 120),
        kind = p_kind,
        created_at = p_created_at
    where id = p_id;
  if not found then
    raise exception 'Ödeme bulunamadı';
  end if;
end $$;
revoke all on function public.admin_payment_update(text, numeric, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.admin_payment_update(text, numeric, text, text, text, text, timestamptz) to authenticated;

create or replace function public.admin_payment_delete(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.payments where id = p_id;
  if not found then
    raise exception 'Ödeme bulunamadı';
  end if;
end $$;
revoke all on function public.admin_payment_delete(text) from public, anon;
grant execute on function public.admin_payment_delete(text) to authenticated;

notify pgrst, 'reload schema';
