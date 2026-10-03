-- ---------------------------------------------------------------------------
-- c76: Overlay kullanım istatistiği — "Overlaylarım › En çok kullanılanlara göre" sıralaması için.
--
-- Ne tutulur: kullanıcı başına, overlay türü başına, o türün kullanıcının KAÇ DÜZENİNDE (yayın düzenleri dahil)
-- açık olduğu. Yalnızca tür kimliği ve sayı; ayar, ad, konum gibi hiçbir şey tutulmaz.
--
-- Bu dosyanın oluşturduğu:
--   tablo  overlay_usage (user_id, overlay_id, layouts, updated_at)   — doğrudan erişim yok (RLS açık, kural yok)
--   RPC    overlay_usage_report(jsonb)  — giriş yapmış kullanıcı: kendi satırlarını gönderilen {tür: sayı} ile DEĞİŞTİRİR
--                                         (gönderilmeyen / 0 olan türler silinir). Geçersiz anahtar ve değerler atlanır.
--          overlay_usage_top()          — herkes (anon dahil; uygulama hesapsız da çalışır): bütün kullanıcıların toplamı
--                                         (overlay_id, users = kullanan kullanıcı sayısı, layouts = toplam düzen sayısı)
-- Sıra: bağımsız (yalnızca profiles tablosu gerekir). Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create table if not exists public.overlay_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  overlay_id text not null check (overlay_id ~ '^[a-z0-9_]{1,40}$'),
  layouts int not null default 0 check (layouts between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, overlay_id)
);
create index if not exists overlay_usage_overlay_idx on public.overlay_usage (overlay_id);
alter table public.overlay_usage enable row level security;
-- Doğrudan erişim yok: yalnızca aşağıdaki security definer fonksiyonlar okur / yazar
revoke all on public.overlay_usage from public, anon, authenticated;
grant all on public.overlay_usage to service_role;

-- Kullanıcının kendi sayılarını bildirir: { "relative": 3, "fuel": 1, ... }
create or replace function public.overlay_usage_report(p_counts jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Bu işlem için giriş yapmalısın';
  end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'object' then
    raise exception 'Geçersiz veri';
  end if;
  if (select count(*) from jsonb_object_keys(p_counts)) > 200 then
    raise exception 'Çok fazla overlay';
  end if;
  -- Profil satırı henüz yoksa (yabancı anahtar hatası vermesin) sessizce çık
  if not exists (select 1 from public.profiles p where p.id = me) then
    return;
  end if;

  -- Geçerli (kimliği uygun, sayısı 1..100) girdiler; sayı olmayan değer 0 sayılır, 100'ün üstü 100'e indirilir
  with v as (
    select e.key as oid,
           case when jsonb_typeof(e.value) = 'number'
                then least(greatest(floor((e.value #>> '{}')::numeric), 0), 100)::int
                else 0 end as n
      from jsonb_each(p_counts) e
     where e.key ~ '^[a-z0-9_]{1,40}$'
  )
  delete from public.overlay_usage u
   where u.user_id = me
     and not exists (select 1 from v where v.oid = u.overlay_id and v.n > 0);

  with v as (
    select e.key as oid,
           case when jsonb_typeof(e.value) = 'number'
                then least(greatest(floor((e.value #>> '{}')::numeric), 0), 100)::int
                else 0 end as n
      from jsonb_each(p_counts) e
     where e.key ~ '^[a-z0-9_]{1,40}$'
  )
  insert into public.overlay_usage as u (user_id, overlay_id, layouts, updated_at)
  select me, v.oid, v.n, now() from v where v.n > 0
  on conflict (user_id, overlay_id) do update
     set layouts = excluded.layouts, updated_at = now()
   where u.layouts is distinct from excluded.layouts;
end;
$$;
revoke all on function public.overlay_usage_report(jsonb) from public, anon;
grant execute on function public.overlay_usage_report(jsonb) to authenticated, service_role;

-- Bütün kullanıcıların toplamı (kişisel veri dönmez)
create or replace function public.overlay_usage_top()
returns table (overlay_id text, users int, layouts int)
language sql stable security definer set search_path = public as $$
  select u.overlay_id, count(*)::int as users, sum(u.layouts)::int as layouts
    from public.overlay_usage u
   where u.layouts > 0
   group by u.overlay_id
   order by 2 desc, 3 desc, 1
   limit 500;
$$;
revoke all on function public.overlay_usage_top() from public;
grant execute on function public.overlay_usage_top() to anon, authenticated, service_role;
