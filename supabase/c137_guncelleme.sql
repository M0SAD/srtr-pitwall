-- c137: iRacing seri adları. iRacing oturum bilgisi yalnızca seri numarasını (WeekendInfo SeriesID) verir, adını vermez;
-- adlar burada tutulur ve Sıralama Tablosu'nun üstünde "Seri adı · Araç" olarak gösterilir.
-- Adı henüz kayıtlı olmayan bir seriyi, o seride yarışan herhangi bir üye bir kez adlandırabilir (iRacing'de seri
-- bilgisindeki adı yazar); kayıtlı adı yalnızca yöneticiler değiştirir / siler.
-- Sıra: herhangi bir yerden sonra. Tekrar çalıştırmak güvenlidir.

create table if not exists public.iracing_series (
  series_id int primary key check (series_id > 0),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  set_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.iracing_series enable row level security;
drop policy if exists "iracing_series read" on public.iracing_series;
create policy "iracing_series read" on public.iracing_series for select using (true);
drop policy if exists "iracing_series admin delete" on public.iracing_series;
create policy "iracing_series admin delete" on public.iracing_series for delete to authenticated using (public.is_admin());
grant select on public.iracing_series to anon, authenticated;
grant delete on public.iracing_series to authenticated;
grant all on public.iracing_series to service_role;

-- Ad kaydet: üye yalnızca adı olmayan seriyi adlandırır; yönetici her zaman yazar. Döner: kayıtlı ad.
create or replace function public.iracing_series_set(p_id int, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_out text;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_id is null or p_id <= 0 then
    raise exception 'Geçersiz seri';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Seri adı 2-80 karakter olmalı';
  end if;
  if public.is_admin() then
    insert into public.iracing_series (series_id, name, set_by, updated_at)
    values (p_id, v_name, auth.uid(), now())
    on conflict (series_id) do update set name = excluded.name, set_by = excluded.set_by, updated_at = now();
  else
    insert into public.iracing_series (series_id, name, set_by)
    values (p_id, v_name, auth.uid())
    on conflict (series_id) do nothing;
  end if;
  select name into v_out from public.iracing_series where series_id = p_id;
  return v_out;
end;
$$;
revoke all on function public.iracing_series_set(int, text) from public, anon;
grant execute on function public.iracing_series_set(int, text) to authenticated;

notify pgrst, 'reload schema';
