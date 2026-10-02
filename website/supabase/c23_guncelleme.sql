-- ---------------------------------------------------------------------------
-- c23: Bölgesel reklam fiyatı. Türkiye'den reklam verenler, o yer için Türkiye fiyatı (cpm_tr / day_tr)
--      girildiyse TL (ad_pricing.currency_tr) öder; diğerleri genel fiyatı (ad_pricing.currency, ör. USD).
--      Reklamın bölgesi ad_campaigns.region'da saklanır; ads-checkout ödemeyi o para biriminin mağazasında açar.
-- ---------------------------------------------------------------------------
alter table public.ad_campaigns add column if not exists region text not null default 'intl';
alter table public.ad_campaigns drop constraint if exists ad_campaigns_region_check;
alter table public.ad_campaigns add constraint ad_campaigns_region_check check (region in ('tr', 'intl'));
update public.app_config set ad_pricing = ad_pricing || '{"currency_tr":"TRY"}'::jsonb
  where id = 1 and not (ad_pricing ? 'currency_tr');

drop function if exists public.ad_price(text, text, int);
drop function if exists public.ad_save(uuid, text, text, int, text, text, text, text, text[]);

create or replace function public.ad_price(p_placement text, p_model text, p_qty int, p_region text default 'intl') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pr jsonb := coalesce((select ad_pricing from public.app_config where id = 1), '{}'::jsonb);
  pl jsonb := pr -> 'placements' -> p_placement;
  amount numeric;
  tr boolean;
  cur text;
begin
  if pl is null or coalesce((pl ->> 'on')::boolean, true) = false then
    raise exception 'Bu reklam yeri şu an satışta değil';
  end if;
  -- Türkiye: o yer için TL fiyatı (cpm_tr / day_tr) girildiyse onlar ve currency_tr; değilse genel fiyat
  tr := coalesce(p_region, '') = 'tr'
        and (coalesce((pl ->> 'cpm_tr')::numeric, 0) > 0 or coalesce((pl ->> 'day_tr')::numeric, 0) > 0);
  cur := case when tr then upper(coalesce(nullif(pr ->> 'currency_tr', ''), 'TRY'))
              else upper(coalesce(nullif(pr ->> 'currency', ''), 'USD')) end;
  if p_model = 'impressions' then
    if not coalesce(pr -> 'impressions', '[1000,5000,10000,50000]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz gösterim paketi';
    end if;
    amount := coalesce((pl ->> case when tr then 'cpm_tr' else 'cpm' end)::numeric, 0) * p_qty / 1000.0;
  elsif p_model = 'days' then
    if not coalesce(pr -> 'days', '[1,3,7,14,30]'::jsonb) @> to_jsonb(p_qty) then
      raise exception 'Geçersiz süre';
    end if;
    amount := coalesce((pl ->> case when tr then 'day_tr' else 'day' end)::numeric, 0) * p_qty;
  else
    raise exception 'Geçersiz fiyat modeli';
  end if;
  amount := round(amount, 2);
  if amount <= 0 then
    raise exception 'Bu seçenek için fiyat belirlenmemiş';
  end if;
  return jsonb_build_object('price', amount, 'currency', cur, 'region', case when tr then 'tr' else 'intl' end);
end $$;

create or replace function public.ad_save(
  p_id uuid, p_placement text, p_model text, p_quantity int, p_title text, p_body text, p_url text, p_image text,
  p_langs text[] default '{}', p_region text default 'intl')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q jsonb;
  rid uuid;
  lg text[] := coalesce(p_langs, '{}');
  rg text := case when p_region = 'tr' then 'tr' else 'intl' end;
begin
  if me is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if not coalesce((select ads_enabled from public.app_config where id = 1), false) then
    raise exception 'Reklam alımı şu an kapalı';
  end if;
  p_title := btrim(coalesce(p_title, ''));
  p_body := btrim(coalesce(p_body, ''));
  p_url := btrim(coalesce(p_url, ''));
  if char_length(p_title) not between 1 and 60 then
    raise exception 'Başlık 1-60 karakter olmalı';
  end if;
  if char_length(p_body) > 120 then
    raise exception 'Kısa metin en fazla 120 karakter olabilir';
  end if;
  if p_url !~ '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/[^\s]*)?$' or char_length(p_url) > 500 then
    raise exception 'Bağlantı https:// ile başlayan geçerli bir adres olmalı';
  end if;
  if split_part(coalesce(p_image, ''), '/', 1) <> me::text or p_image like '%..%' or char_length(p_image) > 300 then
    raise exception 'Geçersiz görsel';
  end if;
  if not lg <@ array['tr', 'other']::text[] then
    raise exception 'Geçersiz dil seçimi';
  end if;
  if cardinality(lg) = 2 then
    lg := '{}';
  end if;
  q := public.ad_price(p_placement, p_model, p_quantity, rg);
  if p_id is null then
    if (select count(*) from public.ad_campaigns where user_id = me and status = 'unpaid') >= 10 then
      raise exception 'Ödenmemiş en fazla 10 reklamın olabilir; önce birini sil ya da öde';
    end if;
    insert into public.ad_campaigns (user_id, placement, model, quantity, title, body, url, image, langs, price, currency, region)
      values (me, p_placement, p_model, p_quantity, p_title, p_body, p_url, p_image, lg,
              (q ->> 'price')::numeric, q ->> 'currency', rg)
      returning id into rid;
  else
    update public.ad_campaigns
      set placement = p_placement, model = p_model, quantity = p_quantity, title = p_title, body = p_body, url = p_url,
          image = p_image, langs = lg, price = (q ->> 'price')::numeric, currency = q ->> 'currency', region = rg, updated_at = now()
      where id = p_id and user_id = me and status = 'unpaid'
      returning id into rid;
    if rid is null then
      raise exception 'Bu reklam artık düzenlenemez';
    end if;
  end if;
  return rid;
end $$;

grant execute on function public.ad_price(text, text, int, text) to anon, authenticated, service_role;
grant execute on function public.ad_save(uuid, text, text, int, text, text, text, text, text[], text) to authenticated;
