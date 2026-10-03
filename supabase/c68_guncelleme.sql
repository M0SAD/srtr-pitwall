-- ---------------------------------------------------------------------------
-- c68: Yedekten geri yükleme yeniden kuruldu (c67'nin düzeltmesi; c67'ye dokunulmaz).
--      Supabase'de `postgres` rolü session_replication_role ayarlayamıyor ("permission denied to set parameter");
--      c67'nin yedek yolu ise yabancı anahtarları (FK) açık bırakıyordu: ad sırasıyla yüklenen alt tablo, üst tablo
--      boşaltılınca ON DELETE CASCADE ile yeniden siliniyor; üstü henüz yüklenmemiş / artık olmayan satırlar FK
--      hatası veriyordu. Yeni tasarım: GERİ YÜKLEME SÜRESİNCE public şemasındaki BÜTÜN yabancı anahtarlar
--      kaldırılır, tanımları saklanır, sonunda yeniden kurulur.
--
--        backup_restore_fks (run_id, tbl, conname, def, created_at)   RLS açık, politika yok.
--        admin_restore_begin(tablolar[])  → adlar denetlenir; önceki yarım kalmış işten saklı tanım varsa ÖNCE onlar
--                                           yeniden kurulur (hiçbir tanım kaybolmaz); sonra public'teki her FK'nin
--                                           pg_get_constraintdef çıktısı saklanır ve kısıt kaldırılır. Tek işlem:
--                                           ya hepsi saklanıp kaldırılır ya hiçbiri.
--        admin_restore_apply(run, tablo, seq) → session_replication_role YOK. Tablonun açık kullanıcı tetikleyicileri
--                                           çağrı süresince kapatılır, sonunda (hata yolunda da) yeniden açılır.
--                                           FK'ler olmadığından sıra önemsizdir, zincirleme silme olmaz.
--        admin_restore_finish(run, yetimleri_sil) → saklı her FK "NOT VALID" olarak yeniden kurulur (anında; yeni
--                                           satırlar için hemen geçerlidir), yönetici korunur, hazırlık temizlenir.
--                                           Rapor: admin_kept, users_without_profile, profiles, users, stage_left,
--                                           fks_restored (sayı), fks_not_valid ([{table, conname}]).
--        admin_restore_validate(tablo, kısıt, yetimleri_sil) → SEÇİLEN YOL: doğrulama (VALIDATE tabloyu tarar) finish
--                                           içinde topluca DEĞİL, istemci tarafından KISIT BAŞINA ayrı çağrıyla
--                                           yapılır; böylece hiçbir çağrı 8 sn sınırına yaklaşmaz. Yetim satır
--                                           (üstü olmayan) varsa kısıt NOT VALID kalır ve sayısı bildirilir;
--                                           yetimleri_sil = true ve tek sütunlu FK ise yetimler silinip yeniden
--                                           doğrulanır. p_delete_orphans finish'te artık kullanılmaz (imza korunur).
--        admin_restore_repair()           → saklı kalan FK'leri yeniden kurar (iptal / çökme sonrası "Onar").
--        admin_restore_pending()          → saklı FK sayısı (0 değilse panel uyarı gösterir).
--      ALTER TABLE kısa süreli kilit ister: işlevler lock_timeout = 3 sn kullanır; kilit alınamazsa
--      "Tablo şu anda kullanımda…" hatası döner (hiçbir şey değişmez, yeniden denenir).
--      Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

create table if not exists public.backup_restore_fks (
  run_id uuid,
  tbl text not null,
  conname text not null,
  def text not null,
  created_at timestamptz not null default now(),
  primary key (tbl, conname)
);
alter table public.backup_restore_fks enable row level security;
revoke all on public.backup_restore_fks from public, anon, authenticated;

-- Geri yüklenmeyen / yedeğe girmeyen iç tablolar
create or replace function public.backup_protected(p_table text) returns boolean
language sql immutable set search_path = public as $$
  select p_table in ('backup_restore_stage', 'backup_restore_fks', 'mod_log');
$$;
revoke all on function public.backup_protected(text) from public, anon, authenticated;

-- İç: saklı FK'leri NOT VALID olarak yeniden kurar; kurulanların (ya da zaten var olanların) kaydını siler.
create or replace function public.backup_fk_recreate() returns int
language plpgsql security definer set search_path = public as $$
declare
  f record;
  n int := 0;
begin
  perform set_config('lock_timeout', '3s', true);
  for f in select tbl, conname, def from public.backup_restore_fks order by tbl, conname loop
    if not public.backup_is_table(f.tbl) then
      -- tablo artık yok: kurulacak yer kalmadı
      delete from public.backup_restore_fks where tbl = f.tbl and conname = f.conname;
      continue;
    end if;
    if not exists (select 1 from pg_constraint c
                   where c.conrelid = format('public.%I', f.tbl)::regclass and c.conname = f.conname) then
      execute format('alter table public.%I add constraint %I %s not valid',
                     f.tbl, f.conname, regexp_replace(f.def, '\s+NOT VALID\s*$', '', 'i'));
      n := n + 1;
    end if;
    delete from public.backup_restore_fks where tbl = f.tbl and conname = f.conname;
  end loop;
  return n;
exception when lock_not_available then
  raise exception 'Tablo şu anda kullanımda (kilit alınamadı); birkaç saniye sonra yeniden dene';
end $$;
revoke all on function public.backup_fk_recreate() from public, anon, authenticated;

-- İç: public'te doğrulanmamış (NOT VALID) FK'ler
create or replace function public.backup_fk_not_valid() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('table', rc.relname, 'conname', c.conname) order by rc.relname, c.conname), '[]'::jsonb)
  from pg_constraint c
  join pg_class rc on rc.oid = c.conrelid
  join pg_namespace n on n.oid = rc.relnamespace
  where c.contype = 'f' and n.nspname = 'public' and not c.convalidated and c.conparentid = 0;
$$;
revoke all on function public.backup_fk_not_valid() from public, anon, authenticated;

-- Yedek tablo listesi: iç tablolar dışarıda
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
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('backup_restore_stage', 'backup_restore_fks')
    order by c.relname
  loop
    name := r.t;
    execute format('select count(*) from public.%I', r.t) into rows;
    bytes := pg_total_relation_size(r.oid);
    return next;
  end loop;
end $$;

create or replace function public.admin_restore_begin(p_tables text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t text;
  f record;
  run uuid := gen_random_uuid();
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

  -- Önceki yarım işten kalan tanımlar önce yeniden kurulur (hiçbiri kaybolmasın)
  perform public.backup_fk_recreate();

  -- public'teki bütün yabancı anahtarlar: tanımı sakla, kısıtı kaldır
  perform set_config('lock_timeout', '3s', true);
  for f in
    select rc.relname::text as tbl, c.conname::text as conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class rc on rc.oid = c.conrelid
    join pg_namespace n on n.oid = rc.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and c.conparentid = 0 and rc.relkind in ('r', 'p')
    order by 1, 2
  loop
    insert into public.backup_restore_fks (run_id, tbl, conname, def) values (run, f.tbl, f.conname, f.def)
    on conflict (tbl, conname) do update set run_id = excluded.run_id, def = excluded.def, created_at = now();
    execute format('alter table public.%I drop constraint %I', f.tbl, f.conname);
  end loop;
  return run;
exception when lock_not_available then
  raise exception 'Tablo şu anda kullanımda (kilit alınamadı); birkaç saniye sonra yeniden dene';
end $$;

create or replace function public.admin_restore_apply(p_run uuid, p_table text, p_seq bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  merge boolean := (p_table = 'profiles');
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

  -- Hazırlıkta bu çağrıya ait sayfa yoksa HİÇBİR ŞEY yapılmaz (yinelenen seq 0 çağrısı tabloyu yeniden boşaltmasın)
  if not exists (select 1 from public.backup_restore_stage st
                 where st.run_id = p_run and st.tbl = p_table and (p_seq is null or st.seq = p_seq)) then
    return 0;
  end if;

  -- Tablonun açık kullanıcı tetikleyicileri bu çağrı süresince kapatılır
  perform set_config('lock_timeout', '3s', true);
  select coalesce(array_agg(tg.tgname::text), '{}') into trg
  from pg_trigger tg
  where tg.tgrelid = format('public.%I', p_table)::regclass and not tg.tgisinternal and tg.tgenabled = 'O';
  begin
    foreach x in array trg loop
      execute format('alter table public.%I disable trigger %I', p_table, x);
    end loop;
  exception when lock_not_available then
    raise exception 'Tablo şu anda kullanımda (kilit alınamadı); birkaç saniye sonra yeniden dene';
  end;

  begin
    pk := public.backup_pk_cols(p_table);
    if merge and coalesce(array_length(pk, 1), 0) = 0 then merge := false; end if;

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
        select coalesce(array_agg(k), '{}') into keys from jsonb_object_keys(stage.rows -> 0) as k;
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
            sql := sql || ' where exists (select 1 from auth.users u where u.id = r.id)';
          end if;
          if merge then
            sql := sql || format(' on conflict (%s) do ', (select string_agg(format('%I', c), ', ') from unnest(pk) as c))
                       || case when sets is null then 'nothing' else 'update set ' || sets end;
          else
            sql := sql || ' on conflict do nothing';
          end if;
          execute sql using stage.rows;
          get diagnostics n = row_count;
          total := total + n;
        end if;
      end if;
      delete from public.backup_restore_stage st where st.run_id = p_run and st.tbl = p_table and st.seq = stage.seq;
    end loop;

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
  exception when others then
    -- İç blok geri alındı; dışarıda kapatılan tetikleyiciler yeniden açılıp hata aynen iletilir
    foreach x in array trg loop
      execute format('alter table public.%I enable trigger %I', p_table, x);
    end loop;
    raise;
  end;

  foreach x in array trg loop
    execute format('alter table public.%I enable trigger %I', p_table, x);
  end loop;
  return total;
end $$;

create or replace function public.admin_restore_finish(p_run uuid, p_delete_orphans boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  kept boolean := false;
  restored int;
  left_over bigint;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  restored := public.backup_fk_recreate();

  update public.profiles set is_admin = true where id = me and is_admin is distinct from true;
  kept := found;

  select count(*) into left_over from public.backup_restore_stage where run_id = p_run;
  delete from public.backup_restore_stage where run_id = p_run;
  notify pgrst, 'reload schema';

  return jsonb_build_object(
    'admin_kept', kept,
    'fks_restored', restored,
    'fks_not_valid', public.backup_fk_not_valid(),
    'stage_left', left_over,
    'profiles', (select count(*) from public.profiles),
    'users', (select count(*) from auth.users),
    'users_without_profile', (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id))
  );
end $$;

create or replace function public.admin_restore_validate(p_table text, p_conname text, p_delete_orphans boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record;
  nn text;
  eq text;
  cond text;
  n bigint := 0;
  deleted boolean := false;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  if p_table is null or not public.backup_is_table(p_table) then raise exception 'bilinmeyen tablo'; end if;
  select k.oid, k.conkey, k.confkey, k.conrelid, k.confrelid, k.convalidated into c
  from pg_constraint k
  where k.conrelid = format('public.%I', p_table)::regclass and k.conname = p_conname and k.contype = 'f';
  if not found then raise exception 'bilinmeyen kısıt: %', p_conname; end if;
  if c.convalidated then
    return jsonb_build_object('table', p_table, 'conname', p_conname, 'valid', true, 'orphans', 0, 'deleted', false);
  end if;
  perform set_config('lock_timeout', '3s', true);
  begin
    execute format('alter table public.%I validate constraint %I', p_table, p_conname);
    return jsonb_build_object('table', p_table, 'conname', p_conname, 'valid', true, 'orphans', 0, 'deleted', false);
  exception
    when foreign_key_violation then null;
    when lock_not_available then
      raise exception 'Tablo şu anda kullanımda (kilit alınamadı); birkaç saniye sonra yeniden dene';
  end;

  -- Yetim satırlar (MATCH SIMPLE: sütunlardan biri null ise denetlenmez)
  select string_agg(format('t.%I is not null', a.attname), ' and ' order by k.ord),
         string_agg(format('p.%I = t.%I', fa.attname, a.attname), ' and ' order by k.ord)
    into nn, eq
  from unnest(c.conkey, c.confkey) with ordinality as k(col, refcol, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
  join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.refcol;
  cond := format('%s and not exists (select 1 from %s p where %s)', nn, c.confrelid::regclass, eq);
  execute format('select count(*) from public.%I t where %s', p_table, cond) into n;

  if coalesce(p_delete_orphans, false) and array_length(c.conkey, 1) = 1 and n > 0 then
    execute format('delete from public.%I t where %s', p_table, cond);
    deleted := true;
    begin
      execute format('alter table public.%I validate constraint %I', p_table, p_conname);
      return jsonb_build_object('table', p_table, 'conname', p_conname, 'valid', true, 'orphans', n, 'deleted', true);
    exception when foreign_key_violation then null;
    end;
  end if;
  return jsonb_build_object('table', p_table, 'conname', p_conname, 'valid', false, 'orphans', n, 'deleted', deleted);
end $$;

create or replace function public.admin_restore_repair()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  restored int;
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  restored := public.backup_fk_recreate();
  notify pgrst, 'reload schema';
  return jsonb_build_object('fks_restored', restored, 'fks_not_valid', public.backup_fk_not_valid());
end $$;

create or replace function public.admin_restore_pending()
returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'yetki yok'; end if;
  return (select count(*)::int from public.backup_restore_fks);
end $$;

revoke all on function public.admin_backup_tables() from public, anon;
revoke all on function public.admin_restore_begin(text[]) from public, anon;
revoke all on function public.admin_restore_apply(uuid, text, bigint) from public, anon;
revoke all on function public.admin_restore_finish(uuid, boolean) from public, anon;
revoke all on function public.admin_restore_validate(text, text, boolean) from public, anon;
revoke all on function public.admin_restore_repair() from public, anon;
revoke all on function public.admin_restore_pending() from public, anon;
grant execute on function public.admin_backup_tables() to authenticated;
grant execute on function public.admin_restore_begin(text[]) to authenticated;
grant execute on function public.admin_restore_apply(uuid, text, bigint) to authenticated;
grant execute on function public.admin_restore_finish(uuid, boolean) to authenticated;
grant execute on function public.admin_restore_validate(text, text, boolean) to authenticated;
grant execute on function public.admin_restore_repair() to authenticated;
grant execute on function public.admin_restore_pending() to authenticated;

notify pgrst, 'reload schema';
