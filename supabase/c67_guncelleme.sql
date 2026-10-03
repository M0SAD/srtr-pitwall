-- ---------------------------------------------------------------------------
-- c67: Yedekleme ve geri yükleme (Yönetim › Yedekleme).
--      Yönetici dilediği an bütün içeriği (tablolar + üye listesi + yüklenen dosyalar) tek bir .zip olarak
--      kendi bilgisayarına indirir; aynı dosyayı panelden geri göndererek sistemi o yedeğe döndürür.
--      Bütün işlevler: security definer, search_path = public, ilk satırda is_admin() denetimi;
--      yetki: public / anon'dan alınır, sadece authenticated çağırır (yönetici değilse 'yetki yok').
--
--      YEDEK (okuma)
--        admin_backup_tables()                       → public şemasındaki her temel tablo: ad, satır sayısı, bayt
--        admin_backup_rows(tablo, offset, limit)     → o tablonun satırları (jsonb dizi; birincil anahtar sırasıyla,
--                                                      anahtar yoksa ctid; limit 1..2000)
--        admin_backup_users(offset, limit)           → auth.users özeti (ŞİFRE / TOKEN / SECRET SÜTUNLARI YOK)
--        admin_backup_buckets()                      → storage.buckets (+ kova başına dosya sayısı / bayt)
--        admin_backup_objects(offset, limit)         → storage.objects (kova, ad, boyut, tür, güncellenme)
--        storage.objects politikaları "admin backup read / insert / update / delete": yönetici her kovadaki
--        her dosyayı olağan (authenticated) depolama uçlarından okur, yükler, günceller, siler.
--        admin_backup_log(action, info)              → mod_log'a 'backup_run' | 'restore_run' | 'restore_done' |
--                                                      'restore_failed' (hedef türü 'backup')
--
--      GERİ YÜKLEME (yazma) — PostgREST'in kısa sorgu süresine (authenticated: 8 sn) takılmamak için tablo tablo
--      ve SAYFA SAYFA çalışır: her sayfa (en çok 1000 satır) önce hazırlık tablosuna yazılır, sonra uygulanır.
--        backup_restore_stage (run_id, tbl, seq, rows jsonb)  RLS açık, politika yok (yalnızca işlevler dokunur)
--        admin_restore_begin(tablolar[])             → run kimliği (adlar denetlenir; korumalı tablolar reddedilir;
--                                                      1 günden eski hazırlık satırları silinir)
--        admin_restore_stage(run, tablo, seq, rows)  → bir sayfayı hazırlığa yazar
--        admin_restore_apply(run, tablo, seq)        → SEÇİLEN YOL: parça parça. seq = 0 çağrısı tabloyu boşaltır
--                                                      (tek delete; tetikleyiciler kapalıyken ~100 bin satır
--                                                      saniyenin altında), ardından o sayfayı ekler; sonraki
--                                                      çağrılar yalnızca kendi sayfasını ekler. Her çağrı kendi
--                                                      işlemidir (en çok 1000 satır → 8 sn sınırının çok altında).
--                                                      seq = null verilirse tablonun hazırlıktaki bütün sayfaları
--                                                      tek işlemde uygulanır (küçük tablolar / SQL Editor için).
--                                                      Sonuç: yazılan satır sayısı.
--        admin_restore_finish(run, yetimleri_sil)    → son düzeltmeler + rapor (jsonb), şema önbelleği yenilenir
--
--      Tetikleyiciler / yabancı anahtarlar yükleme sırasında çalışmasın diye işlem içinde
--      session_replication_role = replica yapılır. Supabase'de (PG15+) `postgres` rolüne bu parametre için
--      "grant set on parameter session_replication_role" verilmiştir (Supabase'in kendi pg_dump geri yükleme
--      yönergesi de bunu postgres kullanıcısıyla kullanır); işlevler postgres'e ait security definer olduğundan
--      ayar yapılabilir. Yine de izin yoksa (insufficient_privilege) yedek yol: tablonun açık kullanıcı
--      tetikleyicileri işlem süresince kapatılıp sonunda yeniden açılır (bu yolda yabancı anahtar denetimleri
--      ÇALIŞIR; sıra profiles → diğerleri olduğundan çoğu tablo yine yüklenir, yüklenemeyen hata verir).
--
--      Özel kurallar
--        backup_restore_stage : yedeğe girmez, geri yüklenmez.
--        mod_log              : yedeğe girer ama GERİ YÜKLENMEZ (şimdiki kayıt aynen kalır, üstüne eklenir).
--        profiles             : BİRLEŞTİRİLİR (upsert) — yedekteki satırlar yazılır, yedekten sonra kayıt olmuş
--                               üyelerin profilleri silinmez; hesabı artık olmayan (auth.users'da bulunmayan)
--                               üyelerin profil satırları atlanır. İşlemi yapan yönetici is_admin = true kalır.
--        auth.users           : geri yüklenmez (yedekte şifre yoktur).
--        diğer tablolar       : tamamen yedekteki haline döner (sil + ekle). Yedekte olmayan tablolara dokunulmaz.
--        sütunlar             : tabloda VE yedek satırında bulunan sütunlar yazılır; sonradan eklenmiş sütunlar
--                               varsayılan değerini alır, artık olmayan sütunlar yok sayılır; üretilmiş (generated)
--                               sütunlar atlanır; identity sütunları "overriding system value" ile yazılır ve
--                               sıra sayaçları (sequence) en büyük değere çekilir.
--      Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Hazırlık tablosu
-- ---------------------------------------------------------------------------
create table if not exists public.backup_restore_stage (
  run_id uuid not null,
  tbl text not null,
  seq bigint not null,
  rows jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, tbl, seq)
);
alter table public.backup_restore_stage enable row level security;
revoke all on public.backup_restore_stage from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- İç yardımcılar (istemciden çağrılamaz)
-- ---------------------------------------------------------------------------

-- public şemasında böyle bir temel tablo var mı?
create or replace function public.backup_is_table(p_table text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = p_table
  );
$$;
revoke all on function public.backup_is_table(text) from public, anon, authenticated;

-- Geri yüklenmeyen tablolar
create or replace function public.backup_protected(p_table text) returns boolean
language sql immutable set search_path = public as $$
  select p_table in ('backup_restore_stage', 'mod_log');
$$;
revoke all on function public.backup_protected(text) from public, anon, authenticated;

-- Birincil anahtar sütunları (sıralı, tırnaklı): "a", "b" — yoksa boş
create or replace function public.backup_pk_cols(p_table text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(a.attname::text order by k.ord), '{}')
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = format('public.%I', p_table)::regclass and i.indisprimary;
$$;
revoke all on function public.backup_pk_cols(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- YEDEK
-- ---------------------------------------------------------------------------
drop function if exists public.admin_backup_tables();
create function public.admin_backup_tables()
returns table (name text, rows bigint, bytes bigint)
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  for r in
    select c.relname::text as t, c.oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'backup_restore_stage'
    order by c.relname
  loop
    name := r.t;
    execute format('select count(*) from public.%I', r.t) into rows;
    bytes := pg_total_relation_size(r.oid);
    return next;
  end loop;
end $$;

create or replace function public.admin_backup_rows(p_table text, p_offset bigint, p_limit int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ord text;
  res jsonb;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  if p_table is null or not public.backup_is_table(p_table) or p_table = 'backup_restore_stage' then
    raise exception 'bilinmeyen tablo';
  end if;
  select string_agg(format('t.%I', c), ', ') into ord from unnest(public.backup_pk_cols(p_table)) as c;
  if ord is null then ord := 't.ctid'; end if;
  execute format(
    'select coalesce(jsonb_agg(s.j order by s.rn), ''[]''::jsonb)
       from (select to_jsonb(t) as j, row_number() over (order by %s) as rn
               from public.%I t order by %s offset $1 limit $2) s',
    ord, p_table, ord)
    into res using greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 1000), 1), 2000);
  return res;
end $$;

-- Üye listesi: şifre / token / secret sütunları BİLEREK yok
create or replace function public.admin_backup_users(p_offset int, p_limit int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  select coalesce(jsonb_agg(s.j order by s.created_at, s.id), '[]'::jsonb) into res
  from (
    select u.created_at, u.id, jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'phone', u.phone,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at,
      'raw_user_meta_data', u.raw_user_meta_data,
      'raw_app_meta_data', u.raw_app_meta_data,
      'banned_until', u.banned_until,
      'providers', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb)
    ) as j
    from auth.users u
    order by u.created_at, u.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 500), 1), 2000)
  ) s;
  return res;
end $$;

create or replace function public.admin_backup_buckets()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'public', b.public,
    'file_size_limit', b.file_size_limit,
    'allowed_mime_types', b.allowed_mime_types,
    'created_at', b.created_at,
    'objects', (select count(*) from storage.objects o where o.bucket_id = b.id),
    'bytes', (select coalesce(sum(case when o.metadata ->> 'size' ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end), 0)
              from storage.objects o where o.bucket_id = b.id)
  ) order by b.id), '[]'::jsonb) into res
  from storage.buckets b;
  return res;
end $$;

create or replace function public.admin_backup_objects(p_offset bigint, p_limit int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  select coalesce(jsonb_agg(s.j order by s.bucket_id, s.name), '[]'::jsonb) into res
  from (
    select o.bucket_id, o.name, jsonb_build_object(
      'bucket_id', o.bucket_id,
      'name', o.name,
      'size', case when o.metadata ->> 'size' ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end,
      'mimetype', coalesce(o.metadata ->> 'mimetype', ''),
      'updated_at', o.updated_at
    ) as j
    from storage.objects o
    where o.bucket_id is not null and o.name is not null
    order by o.bucket_id, o.name
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 1000), 1), 2000)
  ) s;
  return res;
end $$;

create or replace function public.admin_backup_log(p_action text, p_info jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  if p_action is null or p_action not in ('backup_run', 'restore_run', 'restore_done', 'restore_failed') then
    raise exception 'geçersiz işlem';
  end if;
  perform public.log_mod(p_action, 'backup', '', null, coalesce(p_info, '{}'::jsonb));
end $$;

-- Yönetici her kovadaki her dosyayı okur / yükler / günceller / siler (yedek indirme ve geri yükleme için)
drop policy if exists "admin backup read" on storage.objects;
create policy "admin backup read" on storage.objects for select to authenticated using (public.is_admin());
drop policy if exists "admin backup insert" on storage.objects;
create policy "admin backup insert" on storage.objects for insert to authenticated with check (public.is_admin());
drop policy if exists "admin backup update" on storage.objects;
create policy "admin backup update" on storage.objects for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin backup delete" on storage.objects;
create policy "admin backup delete" on storage.objects for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- GERİ YÜKLEME
-- ---------------------------------------------------------------------------
create or replace function public.admin_restore_begin(p_tables text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  foreach t in array coalesce(p_tables, '{}') loop
    if t is null or not public.backup_is_table(t) then
      raise exception 'bilinmeyen tablo: %', coalesce(t, '(boş)');
    end if;
    if public.backup_protected(t) then
      raise exception 'korumalı tablo geri yüklenemez: %', t;
    end if;
  end loop;
  delete from public.backup_restore_stage where created_at < now() - interval '1 day';
  return gen_random_uuid();
end $$;

create or replace function public.admin_restore_stage(p_run uuid, p_table text, p_seq bigint, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  if p_run is null or p_seq is null or p_seq < 0 then raise exception 'geçersiz istek'; end if;
  if p_table is null or not public.backup_is_table(p_table) then raise exception 'bilinmeyen tablo'; end if;
  if public.backup_protected(p_table) then raise exception 'korumalı tablo geri yüklenemez: %', p_table; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'satırlar dizi olmalı'; end if;
  n := jsonb_array_length(p_rows);
  if n > 1000 then raise exception 'bir sayfada en çok 1000 satır olabilir'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) e where jsonb_typeof(e) <> 'object') then
    raise exception 'her satır bir nesne olmalı';
  end if;
  insert into public.backup_restore_stage (run_id, tbl, seq, rows) values (p_run, p_table, p_seq, p_rows)
  on conflict (run_id, tbl, seq) do update set rows = excluded.rows, created_at = now();
  return n;
end $$;

drop function if exists public.admin_restore_apply(uuid, text);
create or replace function public.admin_restore_apply(p_run uuid, p_table text, p_seq bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  merge boolean := (p_table = 'profiles');
  replica boolean := true;
  trg text[] := '{}';
  x text;
  pk text[];
  cols text;
  sets text;
  keys text[];
  stage record;
  sql text;
  n bigint;
  total bigint := 0;
  s record;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  if p_run is null then raise exception 'geçersiz istek'; end if;
  if p_table is null or not public.backup_is_table(p_table) then raise exception 'bilinmeyen tablo'; end if;
  if public.backup_protected(p_table) then raise exception 'korumalı tablo geri yüklenemez: %', p_table; end if;

  -- Tetikleyiciler ve yabancı anahtar denetimleri bu işlem boyunca çalışmasın (işlem bitince kendiliğinden döner)
  begin
    perform set_config('session_replication_role', 'replica', true);
  exception when insufficient_privilege then
    replica := false;
    select coalesce(array_agg(tg.tgname::text), '{}') into trg
    from pg_trigger tg
    where tg.tgrelid = format('public.%I', p_table)::regclass and not tg.tgisinternal and tg.tgenabled = 'O';
    foreach x in array trg loop
      execute format('alter table public.%I disable trigger %I', p_table, x);
    end loop;
  end;

  pk := public.backup_pk_cols(p_table);
  if merge and coalesce(array_length(pk, 1), 0) = 0 then merge := false; end if;

  -- Hazırlıkta bu çağrıya ait sayfa yoksa HİÇBİR ŞEY yapılmaz: yanıtı kaybolup yinelenen bir çağrı (seq 0 dahil)
  -- tabloyu ikinci kez boşaltmasın. Boş tablolar için istemci boş bir sayfa ([]) hazırlar.
  if not exists (select 1 from public.backup_restore_stage st
                 where st.run_id = p_run and st.tbl = p_table and (p_seq is null or st.seq = p_seq)) then
    return 0;
  end if;

  -- Tabloyu boşalt: bütün tablo modunda (seq null) ya da ilk sayfada (seq 0). profiles birleştirilir, silinmez.
  if not merge and (p_seq is null or p_seq = 0) then
    execute format('delete from public.%I', p_table);
  end if;

  for stage in
    select st.seq, st.rows from public.backup_restore_stage st
    where st.run_id = p_run and st.tbl = p_table and (p_seq is null or st.seq = p_seq)
    order by st.seq
  loop
    if jsonb_array_length(stage.rows) > 0 then
      -- Bu sayfadaki satırlarda geçen anahtarlar (ilk satır yeter: aynı tablonun satırları aynı sütunları taşır)
      select coalesce(array_agg(k), '{}') into keys from jsonb_object_keys(stage.rows -> 0) as k;
      -- Hem tabloda hem yedekte olan, üretilmiş (generated) olmayan sütunlar
      select string_agg(format('%I', a.attname), ', ' order by a.attnum),
             string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum)
               filter (where not (a.attname::text = any (pk)))
        into cols, sets
      from pg_attribute a
      where a.attrelid = format('public.%I', p_table)::regclass
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attname::text = any (keys);
      if cols is not null then
        sql := format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) r',
                      p_table, cols, cols, p_table);
        if p_table = 'profiles' then
          -- Hesabı artık olmayan üyelerin profilleri yazılmaz (profiles.id → auth.users)
          sql := sql || ' where exists (select 1 from auth.users u where u.id = r.id)';
        end if;
        if merge then
          sql := sql || format(' on conflict (%s) do ', (select string_agg(format('%I', c), ', ') from unnest(pk) as c))
                     || case when sets is null then 'nothing' else 'update set ' || sets end;
        else
          -- Yedek alınırken tablo değiştiyse aynı satır iki sayfada bulunabilir: yinelenen anahtar yok sayılır
          sql := sql || ' on conflict do nothing';
        end if;
        execute sql using stage.rows;
        get diagnostics n = row_count;
        total := total + n;
      end if;
    end if;
    delete from public.backup_restore_stage st where st.run_id = p_run and st.tbl = p_table and st.seq = stage.seq;
  end loop;

  -- İşlemi yapan yönetici yetkisini yitirmesin (yedekte yönetici olmasa bile)
  if p_table = 'profiles' then
    update public.profiles set is_admin = true where id = auth.uid() and is_admin is distinct from true;
  end if;

  -- Sıra sayaçları (serial / identity): en büyük değere çek
  for s in
    select a.attname::text as col, pg_get_serial_sequence(format('public.%I', p_table), a.attname::text) as seqname
    from pg_attribute a
    where a.attrelid = format('public.%I', p_table)::regclass and a.attnum > 0 and not a.attisdropped
      and a.atttypid in ('int2'::regtype, 'int4'::regtype, 'int8'::regtype)
  loop
    if s.seqname is not null then
      execute format('select max(%I)::bigint from public.%I', s.col, p_table) into n;
      if n is not null and n >= 1 then
        perform setval(s.seqname::regclass, n, true);
      end if;
    end if;
  end loop;

  if not replica then
    foreach x in array trg loop
      execute format('alter table public.%I enable trigger %I', p_table, x);
    end loop;
  end if;
  return total;
end $$;

drop function if exists public.admin_restore_finish(uuid);
create or replace function public.admin_restore_finish(p_run uuid, p_delete_orphans boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fk record;
  n bigint;
  orphans jsonb := '[]'::jsonb;
  left_over bigint;
  me uuid := auth.uid();
  kept boolean := false;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;

  -- Kilitlenme olmasın: işlemi yapan yönetici yönetici kalır
  update public.profiles set is_admin = true where id = me and is_admin is distinct from true;
  kept := found;

  -- Sahibi kalmamış satırlar: auth.users / profiles'a giden TEK sütunlu yabancı anahtarlar.
  -- Varsayılan: yalnızca sayılır ve raporlanır. p_delete_orphans = true ise silinir (olağan tetikleyicilerle).
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname::text as col,
           c.confrelid::regclass::text as ref, fa.attname::text as refcol
    from pg_constraint c
    join pg_class rc on rc.oid = c.conrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f' and rn.nspname = 'public' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and not public.backup_protected(rc.relname::text)
    order by 1, 2
  loop
    execute format('select count(*) from %s t where t.%I is not null and not exists (select 1 from %s p where p.%I = t.%I)',
                   fk.tbl, fk.col, fk.ref, fk.refcol, fk.col) into n;
    if n > 0 then
      if p_delete_orphans then
        execute format('delete from %s t where t.%I is not null and not exists (select 1 from %s p where p.%I = t.%I)',
                       fk.tbl, fk.col, fk.ref, fk.refcol, fk.col);
      end if;
      orphans := orphans || jsonb_build_object('table', fk.tbl, 'column', fk.col, 'references', fk.ref, 'rows', n,
                                                'deleted', coalesce(p_delete_orphans, false));
    end if;
  end loop;

  select count(*) into left_over from public.backup_restore_stage where run_id = p_run;
  delete from public.backup_restore_stage where run_id = p_run;

  notify pgrst, 'reload schema';

  return jsonb_build_object(
    'admin_kept', kept,
    'orphans', orphans,
    'orphans_deleted', coalesce(p_delete_orphans, false),
    'stage_left', left_over,
    'profiles', (select count(*) from public.profiles),
    'users', (select count(*) from auth.users),
    'users_without_profile', (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id))
  );
end $$;

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------
revoke all on function public.admin_backup_tables() from public, anon;
revoke all on function public.admin_backup_rows(text, bigint, int) from public, anon;
revoke all on function public.admin_backup_users(int, int) from public, anon;
revoke all on function public.admin_backup_buckets() from public, anon;
revoke all on function public.admin_backup_objects(bigint, int) from public, anon;
revoke all on function public.admin_backup_log(text, jsonb) from public, anon;
revoke all on function public.admin_restore_begin(text[]) from public, anon;
revoke all on function public.admin_restore_stage(uuid, text, bigint, jsonb) from public, anon;
revoke all on function public.admin_restore_apply(uuid, text, bigint) from public, anon;
revoke all on function public.admin_restore_finish(uuid, boolean) from public, anon;
grant execute on function public.admin_backup_tables() to authenticated;
grant execute on function public.admin_backup_rows(text, bigint, int) to authenticated;
grant execute on function public.admin_backup_users(int, int) to authenticated;
grant execute on function public.admin_backup_buckets() to authenticated;
grant execute on function public.admin_backup_objects(bigint, int) to authenticated;
grant execute on function public.admin_backup_log(text, jsonb) to authenticated;
grant execute on function public.admin_restore_begin(text[]) to authenticated;
grant execute on function public.admin_restore_stage(uuid, text, bigint, jsonb) to authenticated;
grant execute on function public.admin_restore_apply(uuid, text, bigint) to authenticated;
grant execute on function public.admin_restore_finish(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
