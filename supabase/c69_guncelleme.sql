-- ---------------------------------------------------------------------------
-- c69: Topluluk düzen / tema / direksiyon ekranlarına puan vermek ve yorum yazmak artık varsayılan olarak
--      ücretsiz hesaba açık (community.layouts.rate, community.layouts.comment varsayılanı: herkese açık).
--      Yönetim › PRO özellikleri'nde verilmiş bir karar varsa o geçerli kalır.
-- ---------------------------------------------------------------------------
create or replace function public.require_pro() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
  d boolean := true;
begin
  if tg_table_name = 'layout_ratings' then
    k := 'community.layouts.rate';
    d := false;
  elsif tg_table_name = 'layout_comments' then
    k := 'community.layouts.comment';
    d := false;
  elsif tg_table_name = 'shared_themes' then
    k := 'community.share.themes';
  elsif tg_table_name = 'shared_layouts' then
    k := case when to_jsonb(new) ->> 'kind' = 'stream' then 'community.share.streams' else 'community.share.layouts' end;
    d := false; -- düzen paylaşmak bugün herkese açık
  elsif tg_table_name = 'dash_ratings' then
    k := 'community.layouts.rate';
    d := false;
  elsif tg_table_name = 'dash_comments' then
    k := 'community.layouts.comment';
    d := false;
  elsif tg_table_name = 'shared_dashes' then
    k := 'dashboard.designer'; -- tasarım paylaşmak, tasarımcının kendisiyle aynı kurala bağlı (varsayılan PRO)
  end if;
  if k is not null and not public.feature_requires_pro(k, d) then
    return new;
  end if;
  if not public.is_pro() then
    raise exception 'Bu işlem PRO üyelik gerektirir';
  end if;
  return new;
end $$;
update public.pro_feature_catalog set default_pro = false
 where key in ('community.layouts.use', 'community.layouts.rate', 'community.layouts.comment', 'community.themes.use');
