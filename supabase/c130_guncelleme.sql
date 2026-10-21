-- c130: Reklam istatistikleri. Reklam veren "Reklamlarım"da her reklamın günlük gösterim ve tıklama sayısını görür.
--   ad_stats_daily : reklam başına gün gün (Türkiye saatiyle) gösterim / tıklama
--   ad_impression / ad_click bu tabloya da yazar. ad_impression artık PRO üyeleri topluca atlamaz: PRO üye ancak
--   reklamı gizlemişse (c129, ad_hidden_for_me) sayılmaz; PRO'ların da gördüğü yerlerdeki gösterimler sayılır.
--   ad_stats(p_ad) : son 90 gün (yalnızca reklamın sahibi ve yönetici).
-- Not: bu güncellemeden önceki gösterim / tıklamalar yalnızca toplamda görünür (gün dağılımı tutulmuyordu).

create table if not exists public.ad_stats_daily (
  ad_id uuid not null references public.ad_campaigns (id) on delete cascade,
  day date not null,
  impressions int not null default 0,
  clicks int not null default 0,
  primary key (ad_id, day)
);
alter table public.ad_stats_daily enable row level security;
drop policy if exists "ad stats own read" on public.ad_stats_daily;
create policy "ad stats own read" on public.ad_stats_daily for select using (
  public.is_admin() or exists (select 1 from public.ad_campaigns a where a.id = ad_id and a.user_id = auth.uid()));
revoke all on public.ad_stats_daily from anon;
grant select on public.ad_stats_daily to authenticated;

create or replace function public.ad_stat_bump(p_ad uuid, p_click boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.ad_stats_daily (ad_id, day, impressions, clicks)
  values (p_ad, (now() at time zone 'Europe/Istanbul')::date, case when p_click then 0 else 1 end, case when p_click then 1 else 0 end)
  on conflict (ad_id, day) do update
    set impressions = public.ad_stats_daily.impressions + excluded.impressions,
        clicks = public.ad_stats_daily.clicks + excluded.clicks;
$$;
revoke all on function public.ad_stat_bump(uuid, boolean) from public, anon, authenticated;

create or replace function public.ad_impression(p_ad uuid, p_visitor text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.ad_campaigns;
  pl text;
begin
  select placement into pl from public.ad_campaigns where id = p_ad and status = 'active';
  if pl is null then
    return;
  end if;
  -- Reklamı gizlemiş PRO üye (zaten görmemeli) sayılmaz
  if public.ad_hidden_for_me(pl) then
    return;
  end if;
  if not public.ad_seen(p_ad, p_visitor, 'view') then
    return;
  end if;
  update public.ad_campaigns set impressions = impressions + 1 where id = p_ad and status = 'active' returning * into a;
  if a.id is null then
    return;
  end if;
  perform public.ad_stat_bump(p_ad, false);
  if a.model = 'impressions' and a.impressions >= a.quantity then
    perform public.ad_finish(a.id);
  end if;
end $$;

create or replace function public.ad_click(p_ad uuid, p_visitor text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  u text;
begin
  select url into u from public.ad_campaigns where id = p_ad and status = 'active';
  if u is null then
    return null;
  end if;
  if public.ad_seen(p_ad, p_visitor, 'click') then
    update public.ad_campaigns set clicks = clicks + 1 where id = p_ad;
    perform public.ad_stat_bump(p_ad, true);
  end if;
  return u;
end $$;

create or replace function public.ad_stats(p_ad uuid)
returns table (day date, impressions int, clicks int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or exists (select 1 from public.ad_campaigns a where a.id = p_ad and a.user_id = auth.uid())) then
    raise exception 'Reklam bulunamadı';
  end if;
  return query
    select s.day, s.impressions, s.clicks from public.ad_stats_daily s
    where s.ad_id = p_ad and s.day > (now() at time zone 'Europe/Istanbul')::date - 90
    order by s.day;
end $$;
revoke all on function public.ad_stats(uuid) from public, anon;
grant execute on function public.ad_stats(uuid) to authenticated;

notify pgrst, 'reload schema';
