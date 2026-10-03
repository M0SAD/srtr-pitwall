-- ---------------------------------------------------------------------------
-- c66: Topluluk › Direksiyon Ekranları (Dashboards). Dashboard Tasarımcısı'nda yapılan tasarımlar toplulukta
--      paylaşılır; diğer topluluk içerikleri gibi puanlanır, yorumlanır, raporlanır.
--
-- Tablolar:
--   shared_dashes  (id, user_id, title 1..60, description ≤1000, data jsonb [nesne, ≤200 KB, 1..8 sayfa],
--                   width, height, page_count, widget_count [tetikleyici veriden hesaplar], downloads,
--                   rating_avg, rating_count, hidden, created_at, updated_at)
--   dash_ratings   (dash_id, user_id, stars 1..5)           — kişi başı tek puan, kendi tasarımına puan yok
--   dash_comments  (id, dash_id, user_id, body 1..1000, created_at, edited_at)
--   (Düzenlerin puan / yorum tabloları layout_id'ye bağlı, ortak değil: bu yüzden ayrı tablolar.)
-- Görünümler: dash_list (yazar adı + yorum sayısı), dash_comment_list (yazar adı).
-- İşlevler:
--   protect_dash()            tetikleyici: sayaçları / gizli işaretini / sahibi korur, veriyi doğrular, boyutları hesaplar
--   update_dash_rating()      tetikleyici: ortalama puan ve oy sayısı
--   no_self_dash_rating()     tetikleyici: kendi tasarımına puan verilemez
--   dash_downloaded(p_id)     indirme sayacı
--   dash_set_hidden(p_id, p_hidden)  moderasyon (layouts.delete izni): gizle / göster; mod_log + sahibine bildirim
-- Yetki: giriş yapmış herkes gizli olmayanları okur (diğer topluluk içerikleri gibi anonim okuma YOK);
--        gizliyi yalnızca sahibi ve moderatör görür. Ekleme / güncelleme / silme sahibi; silme ayrıca moderatör.
-- PRO (require_pro güncellendi): shared_dashes → dashboard.designer (varsayılan PRO; tasarımcıyla aynı kural),
--        dash_ratings → community.layouts.rate, dash_comments → community.layouts.comment (düzenlerle aynı anahtarlar).
-- Ortak parçalar güncellendi: reports.target_type ('dash', 'dash_comment'), report_list, audit_content
--        ('dash', 'dash_comment'; silinince sahibine 'dash_removed' bildirimi), community_stats ('dashes').
-- Sıra: c38 (require_pro, feature_requires_pro) ve c48 (audit_content) sonrasında. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create table if not exists public.shared_dashes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  -- CustomDash JSON'u: { id, name, width, height, bg, bgA, font, radius, pages: [{ id, name, widgets: [...] }] }
  data jsonb not null,
  width int not null default 800,
  height int not null default 480,
  page_count int not null default 1,
  widget_count int not null default 0,
  downloads int not null default 0,
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_dashes_data_object check (jsonb_typeof(data) = 'object'),
  constraint shared_dashes_data_size check (octet_length(data::text) <= 204800)
);
create index if not exists shared_dashes_created on public.shared_dashes (created_at desc);
create index if not exists shared_dashes_user on public.shared_dashes (user_id);
alter table public.shared_dashes enable row level security;

drop policy if exists "dashes readable" on public.shared_dashes;
create policy "dashes readable" on public.shared_dashes for select to authenticated
  using (not hidden or auth.uid() = user_id or public.has_perm('layouts.delete'));
drop policy if exists "dashes own insert" on public.shared_dashes;
create policy "dashes own insert" on public.shared_dashes for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "dashes own update" on public.shared_dashes;
create policy "dashes own update" on public.shared_dashes for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dashes own delete" on public.shared_dashes;
create policy "dashes own delete" on public.shared_dashes for delete to authenticated
  using (auth.uid() = user_id or public.has_perm('layouts.delete'));

-- Sayaçları, gizli işaretini ve sahibi kullanıcı elle değiştiremesin; veri doğrulanır, boyutlar veriden hesaplanır
create or replace function public.protect_dash() returns trigger
language plpgsql as $$
declare
  n int;
  w int := 0;
  pg jsonb;
  chk boolean;
begin
  if tg_op = 'INSERT' then
    new.downloads := 0;
    new.rating_avg := 0;
    new.rating_count := 0;
    new.hidden := false;
    new.created_at := now();
    new.updated_at := now();
  elsif current_setting('pitwall.counters', true) is distinct from 'on' then
    new.user_id := old.user_id;
    new.downloads := old.downloads;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.hidden := old.hidden;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' then
    chk := true;
  else
    chk := new.data is distinct from old.data or new.title is distinct from old.title
           or new.description is distinct from old.description;
  end if;
  if chk then
    new.title := btrim(new.title);
    if char_length(new.title) < 1 or char_length(new.title) > 60 then
      raise exception 'Başlık 1-60 karakter olmalı';
    end if;
    if char_length(new.description) > 1000 then
      raise exception 'Açıklama en fazla 1000 karakter olabilir';
    end if;
    if jsonb_typeof(new.data) is distinct from 'object' then
      raise exception 'Geçersiz tasarım verisi';
    end if;
    if octet_length(new.data::text) > 204800 then
      raise exception 'Tasarım çok büyük (en fazla 200 KB)';
    end if;
    if jsonb_typeof(new.data -> 'pages') is distinct from 'array' then
      raise exception 'Geçersiz tasarım verisi (sayfa yok)';
    end if;
    n := jsonb_array_length(new.data -> 'pages');
    if n < 1 or n > 8 then
      raise exception 'Tasarımda 1-8 sayfa olmalı';
    end if;
    for pg in select * from jsonb_array_elements(new.data -> 'pages') loop
      if jsonb_typeof(pg -> 'widgets') = 'array' then
        w := w + jsonb_array_length(pg -> 'widgets');
      end if;
    end loop;
    if w < 1 then
      raise exception 'Tasarımda hiç bileşen yok';
    end if;
    if w > 640 then
      raise exception 'Tasarımda çok fazla bileşen var';
    end if;
    new.page_count := n;
    new.widget_count := w;
    new.width := case when jsonb_typeof(new.data -> 'width') = 'number'
      then least(4000, greatest(100, round((new.data ->> 'width')::numeric)))::int else 800 end;
    new.height := case when jsonb_typeof(new.data -> 'height') = 'number'
      then least(4000, greatest(60, round((new.data ->> 'height')::numeric)))::int else 480 end;
  end if;
  return new;
end $$;
drop trigger if exists protect_dash on public.shared_dashes;
create trigger protect_dash before insert or update on public.shared_dashes
  for each row execute function public.protect_dash();

-- Puanlar
create table if not exists public.dash_ratings (
  dash_id uuid not null references public.shared_dashes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (dash_id, user_id)
);
alter table public.dash_ratings enable row level security;
drop policy if exists "dash ratings readable" on public.dash_ratings;
create policy "dash ratings readable" on public.dash_ratings for select to authenticated using (true);
drop policy if exists "dash ratings own insert" on public.dash_ratings;
create policy "dash ratings own insert" on public.dash_ratings for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.shared_dashes d where d.id = dash_id));
drop policy if exists "dash ratings own update" on public.dash_ratings;
create policy "dash ratings own update" on public.dash_ratings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dash ratings own delete" on public.dash_ratings;
create policy "dash ratings own delete" on public.dash_ratings for delete to authenticated using (auth.uid() = user_id);

create or replace function public.update_dash_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  did uuid := coalesce(new.dash_id, old.dash_id);
begin
  perform set_config('pitwall.counters', 'on', true);
  update public.shared_dashes d set
    rating_avg = coalesce((select avg(stars) from public.dash_ratings r where r.dash_id = did), 0),
    rating_count = (select count(*) from public.dash_ratings r where r.dash_id = did)
  where d.id = did;
  perform set_config('pitwall.counters', 'off', true);
  return null;
end $$;
drop trigger if exists dash_rating_changed on public.dash_ratings;
create trigger dash_rating_changed after insert or update or delete on public.dash_ratings
  for each row execute function public.update_dash_rating();

create or replace function public.no_self_dash_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.shared_dashes where id = new.dash_id and user_id = new.user_id) then
    raise exception 'Kendi tasarımına puan veremezsin';
  end if;
  return new;
end $$;
drop trigger if exists no_self_dash_rating on public.dash_ratings;
create trigger no_self_dash_rating before insert or update on public.dash_ratings
  for each row execute function public.no_self_dash_rating();

-- İndirme sayacı
create or replace function public.dash_downloaded(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  perform set_config('pitwall.counters', 'on', true);
  update public.shared_dashes set downloads = downloads + 1 where id = p_id and not hidden;
  perform set_config('pitwall.counters', 'off', true);
end $$;

-- Yorumlar
create table if not exists public.dash_comments (
  id uuid primary key default gen_random_uuid(),
  dash_id uuid not null references public.shared_dashes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists dash_comments_dash on public.dash_comments (dash_id, created_at);
alter table public.dash_comments enable row level security;
drop policy if exists "dash comments readable" on public.dash_comments;
create policy "dash comments readable" on public.dash_comments for select to authenticated using (true);
drop policy if exists "dash comments own insert" on public.dash_comments;
create policy "dash comments own insert" on public.dash_comments for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.shared_dashes d where d.id = dash_id));
drop policy if exists "dash comments update" on public.dash_comments;
create policy "dash comments update" on public.dash_comments for update to authenticated
  using (auth.uid() = user_id or public.has_perm('comments.edit'))
  with check (auth.uid() = user_id or public.has_perm('comments.edit'));
drop policy if exists "dash comments delete" on public.dash_comments;
create policy "dash comments delete" on public.dash_comments for delete to authenticated using (
  auth.uid() = user_id
  or public.has_perm('comments.delete')
  or exists (select 1 from public.shared_dashes d where d.id = dash_id and d.user_id = auth.uid())
);
-- Düzenlemede kimlik / sahip / tarih korunur, edited_at yazılır (protect_comment: schema.sql); üst içerik de değişmesin
create or replace function public.protect_dash_comment() returns trigger
language plpgsql as $$
begin
  new.id := old.id;
  new.dash_id := old.dash_id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.edited_at := now();
  return new;
end $$;
drop trigger if exists protect_dash_comment on public.dash_comments;
create trigger protect_dash_comment before update on public.dash_comments
  for each row execute function public.protect_dash_comment();

-- Listeler
create or replace view public.dash_list with (security_invoker = true) as
  select d.id, d.user_id, d.title, d.description, d.data, d.width, d.height, d.page_count, d.widget_count,
         d.downloads, d.rating_avg, d.rating_count, d.hidden, d.created_at, d.updated_at,
         p.display_name as author_name, p.iracing_name as author_iracing,
         (select count(*) from public.dash_comments c where c.dash_id = d.id)::int as comment_count
  from public.shared_dashes d join public.profiles p on p.id = d.user_id;

create or replace view public.dash_comment_list with (security_invoker = true) as
  select c.*, p.display_name as author_name
  from public.dash_comments c join public.profiles p on p.id = c.user_id;

-- Moderasyon: gizle / göster
create or replace function public.dash_set_hidden(p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.shared_dashes;
begin
  if not public.has_perm('layouts.delete') then
    raise exception 'Yetkin yok';
  end if;
  select * into r from public.shared_dashes where id = p_id;
  if not found then
    raise exception 'Paylaşım bulunamadı';
  end if;
  if r.hidden = coalesce(p_hidden, false) then
    return;
  end if;
  perform set_config('pitwall.counters', 'on', true);
  update public.shared_dashes set hidden = coalesce(p_hidden, false) where id = p_id;
  perform set_config('pitwall.counters', 'off', true);
  perform public.log_mod(case when coalesce(p_hidden, false) then 'dash_hide' else 'dash_show' end, 'dash', p_id::text, r.user_id,
    jsonb_build_object('title', r.title));
  if coalesce(p_hidden, false) and r.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, kind, data)
    values (r.user_id, 'dash_hidden', jsonb_build_object('title', r.title));
  end if;
end $$;

-- PRO denetimi (c38'deki tanım + direksiyon ekranı tabloları)
create or replace function public.require_pro() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text;
  d boolean := true;
begin
  if tg_table_name = 'layout_ratings' then
    k := 'community.layouts.rate';
  elsif tg_table_name = 'layout_comments' then
    k := 'community.layouts.comment';
  elsif tg_table_name = 'shared_themes' then
    k := 'community.share.themes';
  elsif tg_table_name = 'shared_layouts' then
    k := case when to_jsonb(new) ->> 'kind' = 'stream' then 'community.share.streams' else 'community.share.layouts' end;
    d := false; -- düzen paylaşmak bugün herkese açık
  elsif tg_table_name = 'dash_ratings' then
    k := 'community.layouts.rate';
  elsif tg_table_name = 'dash_comments' then
    k := 'community.layouts.comment';
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
drop trigger if exists require_pro on public.dash_ratings;
create trigger require_pro before insert or update on public.dash_ratings for each row execute function public.require_pro();
drop trigger if exists require_pro on public.dash_comments;
create trigger require_pro before insert on public.dash_comments for each row execute function public.require_pro();
drop trigger if exists require_pro on public.shared_dashes;
create trigger require_pro before insert on public.shared_dashes for each row execute function public.require_pro();

-- Moderasyon kaydı (c48'deki tanım + 'dash' / 'dash_comment')
create or replace function public.audit_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid := old.user_id;
  kind text := tg_argv[0];
  j jsonb := to_jsonb(old);
begin
  if auth.uid() is null or auth.uid() = owner then
    return null;
  end if;
  -- Üst içerik silinirken zincirleme silinen yorumlar kayda geçmez
  if kind = 'shot_comment' then
    if not exists (select 1 from public.screenshots where id = (j ->> 'screenshot_id')::uuid) then
      return null;
    end if;
  elsif kind = 'layout_comment' then
    if not exists (select 1 from public.shared_layouts where id = (j ->> 'layout_id')::uuid) then
      return null;
    end if;
  elsif kind = 'dash_comment' then
    if not exists (select 1 from public.shared_dashes where id = (j ->> 'dash_id')::uuid) then
      return null;
    end if;
  end if;
  -- Tasarım verisi (200 KB'a kadar) kayda girmez
  if kind = 'dash' then
    j := j - 'data';
  end if;
  perform public.log_mod(lower(tg_op), kind, old.id::text, owner,
    case when tg_op = 'DELETE' then j else jsonb_build_object('before', j, 'after', to_jsonb(new)) end);
  if tg_op = 'DELETE' and kind in ('shot', 'layout', 'dash') then
    insert into public.notifications (user_id, kind, data)
    values (owner, case kind when 'shot' then 'shot_removed' when 'dash' then 'dash_removed' else 'layout_removed' end,
            jsonb_build_object('title', j ->> 'title'));
  end if;
  return null;
end $$;
drop trigger if exists audit_dash_comments on public.dash_comments;
create trigger audit_dash_comments after update or delete on public.dash_comments
  for each row execute function public.audit_content('dash_comment');
drop trigger if exists audit_dashes on public.shared_dashes;
create trigger audit_dashes after delete on public.shared_dashes
  for each row execute function public.audit_content('dash');

-- Raporlar: yeni hedef türleri
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.reports'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%target_type%'
  loop
    execute format('alter table public.reports drop constraint %I', c.conname);
  end loop;
  alter table public.reports add constraint reports_target_type_check
    check (target_type in ('shot', 'shot_comment', 'layout', 'layout_comment', 'dash', 'dash_comment'));
end $$;

create or replace view public.report_list with (security_invoker = true) as
  select r.*, p.display_name as reporter_name,
    case r.target_type
      when 'shot' then (select jsonb_build_object('title', s.title, 'thumb_path', s.thumb_path, 'path', s.path, 'user_id', s.user_id,
                               'author', (select display_name from public.profiles where id = s.user_id))
                        from public.screenshots s where s.id = r.target_id)
      when 'shot_comment' then (select jsonb_build_object('body', c.body, 'user_id', c.user_id, 'screenshot_id', c.screenshot_id,
                               'author', (select display_name from public.profiles where id = c.user_id))
                        from public.screenshot_comments c where c.id = r.target_id)
      when 'layout' then (select jsonb_build_object('title', l.title, 'user_id', l.user_id,
                               'author', (select display_name from public.profiles where id = l.user_id))
                        from public.shared_layouts l where l.id = r.target_id)
      when 'layout_comment' then (select jsonb_build_object('body', c.body, 'user_id', c.user_id, 'layout_id', c.layout_id,
                               'author', (select display_name from public.profiles where id = c.user_id))
                        from public.layout_comments c where c.id = r.target_id)
      when 'dash' then (select jsonb_build_object('title', d.title, 'user_id', d.user_id,
                               'author', (select display_name from public.profiles where id = d.user_id))
                        from public.shared_dashes d where d.id = r.target_id)
      when 'dash_comment' then (select jsonb_build_object('body', c.body, 'user_id', c.user_id, 'dash_id', c.dash_id,
                               'author', (select display_name from public.profiles where id = c.user_id))
                        from public.dash_comments c where c.id = r.target_id)
    end as target
  from public.reports r join public.profiles p on p.id = r.reporter;

-- Topluluk istatistikleri: + dashes; yorum / puan / indirme toplamlarına direksiyon ekranları da girer
create or replace function public.community_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shots', (select count(*) from public.screenshots),
    'layouts', (select count(*) from public.shared_layouts where kind = 'layout'),
    'streams', (select count(*) from public.shared_layouts where kind = 'stream'),
    'themes', (select count(*) from public.shared_themes),
    'dashes', (select count(*) from public.shared_dashes where not hidden),
    'comments', (select count(*) from public.screenshot_comments) + (select count(*) from public.layout_comments)
                + (select count(*) from public.dash_comments),
    'ratings', (select count(*) from public.screenshot_ratings) + (select count(*) from public.layout_ratings)
               + (select count(*) from public.dash_ratings),
    'downloads', (select coalesce(sum(downloads), 0) from public.shared_layouts) + (select coalesce(sum(downloads), 0) from public.shared_themes)
                 + (select coalesce(sum(downloads), 0) from public.shared_dashes),
    'views', (select coalesce(sum(views), 0) from public.screenshots),
    'members', (select count(*) from public.profiles)
  );
$$;

-- Yetkiler (anonim okuma yok: diğer topluluk içerikleri de yalnızca giriş yapmış üyelere açık)
grant select, insert, update, delete on public.shared_dashes, public.dash_ratings, public.dash_comments to authenticated;
grant select on public.dash_list, public.dash_comment_list to authenticated;
grant select on public.report_list to authenticated;
revoke all on function public.dash_downloaded(uuid), public.dash_set_hidden(uuid, boolean) from public, anon;
grant execute on function public.dash_downloaded(uuid), public.dash_set_hidden(uuid, boolean), public.community_stats() to authenticated;
grant all on public.shared_dashes, public.dash_ratings, public.dash_comments to service_role;
