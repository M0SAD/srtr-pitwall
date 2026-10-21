-- c129: Uygulamada yeni reklam yerleri ve PRO üyelerin reklam gizlemesi.
--   1) Yeni yerler: home_top (ana sayfa üst banner), home_feed (ana sayfa, haberler arası),
--      overlays_banner (Overlaylarım sayfası), telemetry_banner (Telemetri sayfası). Fiyatları Yönetim › Reklamlar'da
--      girilir (app_config.ad_pricing.placements); fiyat girilmeyen yer satışta değildir.
--   2) PRO üyeler Hesap sayfasında "Reklamları gizle" seçebilir (profiles.hide_ads, varsayılan açık: önceki gibi
--      reklamsız). Yönetici her yer için "PRO gizleyebilir" seçer (ad_pricing.placements.<yer>.pro_hide, varsayılan
--      açık). PRO üye, gizlemeyi açtıysa yalnızca gizlenebilir yerlerde reklam görmez; gizlenemez yerlerde ya da
--      gizlemeyi kapattıysa reklam görür.
--   3) my_ads: reklam verenin kendi reklamları (uygulamadaki "Reklamlarım" listesi için).

-- 1) Yer listesi
alter table public.ad_campaigns drop constraint if exists ad_campaigns_placement_check;
alter table public.ad_campaigns add constraint ad_campaigns_placement_check check (placement in (
  'panel_banner', 'panel_card', 'site_home', 'site_account',
  'home_top', 'home_feed', 'overlays_banner', 'telemetry_banner'));

-- 2) PRO reklam gizleme tercihi
alter table public.profiles add column if not exists hide_ads boolean not null default true;

create or replace function public.set_hide_ads(p_hide boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  update public.profiles set hide_ads = coalesce(p_hide, true) where id = auth.uid();
  return coalesce(p_hide, true);
end $$;
revoke all on function public.set_hide_ads(boolean) from public, anon;
grant execute on function public.set_hide_ads(boolean) to authenticated;

-- PRO üye bu yerde reklam görmez mi
create or replace function public.ad_hidden_for_me(p_placement text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and public.is_pro()
     and coalesce((select hide_ads from public.profiles where id = auth.uid()), true)
     and coalesce((select (ad_pricing -> 'placements' -> p_placement ->> 'pro_hide')::boolean from public.app_config where id = 1), true);
$$;
revoke all on function public.ad_hidden_for_me(text) from public;
grant execute on function public.ad_hidden_for_me(text) to anon, authenticated;

-- Gösterilecek reklam (c25'teki kural; PRO üyeye artık yer ve tercihe göre)
create or replace function public.ad_pick(p_placement text, p_lang text default '', p_visitor text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  grp text := case when lower(coalesce(p_lang, '')) like 'tr%' then 'tr' else 'other' end;
  r jsonb;
begin
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    return null;
  end if;
  if public.ad_hidden_for_me(p_placement) then
    return null;
  end if;
  select jsonb_build_object('id', a.id, 'placement', a.placement, 'title', a.title, 'body', a.body, 'url', a.url, 'image', a.image)
    into r
    from public.ad_campaigns a
    where a.status = 'active' and a.placement = p_placement
      and (cardinality(a.langs) = 0 or grp = any (a.langs))
      and (a.model <> 'days' or a.ends_at > now())
      and (a.model <> 'impressions' or a.impressions < a.quantity)
      and (me is null or not exists (select 1 from public.ad_reports x where x.ad_id = a.id and x.reporter = me))
    order by -ln(greatest(random(), 1e-9)) /
      (case when a.model = 'impressions' then least(5, greatest(1, (a.quantity - a.impressions) / 2000.0)) else 2 end)
    limit 1;
  return r;
end $$;
grant execute on function public.ad_pick(text, text, text) to anon, authenticated;

-- 3) Reklam verenin kendi reklamları (RLS zaten kendi satırlarını gösteriyor; tek çağrıda sıralı liste)
create or replace function public.my_ads()
returns setof public.ad_campaigns language sql stable security definer set search_path = public as $$
  select * from public.ad_campaigns where user_id = auth.uid() order by created_at desc limit 200;
$$;
revoke all on function public.my_ads() from public, anon;
grant execute on function public.my_ads() to authenticated;

notify pgrst, 'reload schema';
