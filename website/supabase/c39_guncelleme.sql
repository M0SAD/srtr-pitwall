-- ---------------------------------------------------------------------------
-- c39: Sesli mühendis ses paketleri.
--      1) voice_packs: indirilebilir ses paketleri listesi (yönetici ekler). Kimlik (ör. "tr-erkin"), ad, dil
--         (BCP47: tr, en, de, pt-BR…), yazar, sürüm (tam sayı; uygulama kurulu sürümden büyükse "Güncelle" gösterir),
--         zip bağlantısı (https; GitHub Releases dosya bağlantısı), boyut, SHA-256, ifade ve kayıt sayısı, biçim
--         (wav / ogg / mixed), not, yayında (published), sıra. Yayındakileri herkes (giriş yapmadan da) okuyabilir;
--         yönetici hepsini görür. Yazmak sadece RPC ile (yönetici):
--           voice_pack_save(...)   → ekle / güncelle (kimliğe göre). mod_log'a yazılır.
--           voice_pack_delete(id)  → sil. mod_log'a yazılır.
--         Paketlere erişim (indirip kullanmak) sesli mühendisin PRO kararına (pro_features "voice") bağlıdır;
--         tabloda ayrıca PRO alanı yok.
--      2) voice_pack_submissions: üyelerin "Paketimi gönder" formu (kendi dilinde kaydettiği paketin bağlantısı).
--         Kişi, gönderen adı (o anki görünen ad), dil, paket adı, bağlantı (sadece https), mesaj, durum
--         (new / reviewing / accepted / rejected), yönetici notu. Kişi kendi gönderilerini, yönetici hepsini görür.
--           voice_pack_submit(dil, paket adı, bağlantı, mesaj) → günde en fazla 3; tüm yöneticilere 'voice_submission'
--             bildirimi + e-posta (pitwall-jobs → voiceSubmissionAdmin).
--           voice_pack_my_submissions()            → kendi gönderilerim.
--           voice_pack_submissions_admin(durum)    → yönetici; durum '' = hepsi.
--           voice_pack_submission_update(id, durum, not) → yönetici; durum accepted / rejected olunca gönderene
--             'voice_submission_result' bildirimi (sadece uygulama içi, e-posta yok). mod_log'a yazılır.
--      3) friend_request_mail(): c35'teki liste aynen + 'voice_submission' (yöneticiye e-posta). Tercih ve sınır
--         denetimleri c35 ile aynı.
-- Sıra: c35'ten sonra (email_kind_category, email_pref_on, email_throttle_ok, call_jobs hazır olmalı).
-- ---------------------------------------------------------------------------

-- 1) Ses paketleri ------------------------------------------------------------------
create table if not exists public.voice_packs (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' and id !~ '\.(tmp|old)$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  language text not null check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  author text not null default '',
  version int not null default 1 check (version >= 1),
  url text not null check (url ~ '^https://' and length(url) <= 1000),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text not null default '' check (sha256 = '' or sha256 ~ '^[0-9a-f]{64}$'),
  phrases int not null default 0 check (phrases >= 0),
  files int not null default 0 check (files >= 0),
  format text not null default 'ogg' check (format in ('wav', 'ogg', 'mixed')),
  notes text not null default '',
  published boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.voice_packs enable row level security;
drop policy if exists "voice packs readable" on public.voice_packs;
create policy "voice packs readable" on public.voice_packs for select using (published or public.is_admin());
grant select on public.voice_packs to anon, authenticated;

-- Yönetici: ekle / güncelle
create or replace function public.voice_pack_save(
  p_id text, p_name text, p_language text, p_author text, p_version int, p_url text, p_size bigint,
  p_sha256 text, p_phrases int, p_files int, p_format text, p_notes text, p_published boolean, p_sort int)
returns text language plpgsql security definer set search_path = public as $$
declare
  vid text := btrim(coalesce(p_id, ''));
  old public.voice_packs;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if vid !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' or vid ~ '\.(tmp|old)$' then
    raise exception 'Kimlik 1-64 karakter olmalı (harf, rakam, - _ .), ör. tr-erkin';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Paket adı gerekli (en fazla 80 karakter)';
  end if;
  if btrim(coalesce(p_language, '')) !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then
    raise exception 'Geçersiz dil kodu (ör. tr, en, pt-BR)';
  end if;
  if btrim(coalesce(p_url, '')) !~ '^https://' then
    raise exception 'Bağlantı https:// ile başlamalı';
  end if;
  if coalesce(p_sha256, '') <> '' and lower(btrim(p_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 64 karakterlik onaltılık olmalı';
  end if;
  if coalesce(p_format, 'ogg') not in ('wav', 'ogg', 'mixed') then
    raise exception 'Geçersiz biçim';
  end if;
  select * into old from public.voice_packs where id = vid;
  insert into public.voice_packs as v (id, name, language, author, version, url, size_bytes, sha256, phrases, files, format,
                                       notes, published, sort, updated_by)
    values (vid, btrim(p_name), btrim(p_language), left(btrim(coalesce(p_author, '')), 80), greatest(coalesce(p_version, 1), 1),
            btrim(p_url), greatest(coalesce(p_size, 0), 0), lower(btrim(coalesce(p_sha256, ''))), greatest(coalesce(p_phrases, 0), 0),
            greatest(coalesce(p_files, 0), 0), coalesce(p_format, 'ogg'), left(btrim(coalesce(p_notes, '')), 1000),
            coalesce(p_published, false), coalesce(p_sort, 0), auth.uid())
  on conflict (id) do update set name = excluded.name, language = excluded.language, author = excluded.author,
    version = excluded.version, url = excluded.url, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
    phrases = excluded.phrases, files = excluded.files, format = excluded.format, notes = excluded.notes,
    published = excluded.published, sort = excluded.sort, updated_at = now(), updated_by = auth.uid();
  perform public.log_mod(case when old.id is null then 'voice_pack_create' else 'voice_pack_update' end, 'voice_pack', vid, null,
    jsonb_build_object('name', btrim(p_name), 'language', btrim(p_language), 'version', p_version, 'published', coalesce(p_published, false),
                       'old_version', old.version, 'old_published', old.published));
  return vid;
end $$;
revoke all on function public.voice_pack_save(text, text, text, text, int, text, bigint, text, int, int, text, text, boolean, int) from public, anon;
grant execute on function public.voice_pack_save(text, text, text, text, int, text, bigint, text, int, int, text, text, boolean, int) to authenticated;

-- Yönetici: sil
create or replace function public.voice_pack_delete(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.voice_packs;
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  delete from public.voice_packs where id = p_id returning * into v;
  if v.id is null then
    raise exception 'Paket bulunamadı';
  end if;
  perform public.log_mod('voice_pack_delete', 'voice_pack', v.id, null,
    jsonb_build_object('name', v.name, 'language', v.language, 'version', v.version));
end $$;
revoke all on function public.voice_pack_delete(text) from public, anon;
grant execute on function public.voice_pack_delete(text) to authenticated;

-- 2) Paket gönderileri ----------------------------------------------------------------
create table if not exists public.voice_pack_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  user_name text not null default '',
  language text not null check (length(language) between 2 and 40),
  pack_name text not null check (length(pack_name) between 1 and 80),
  link text not null check (link ~ '^https://' and length(link) <= 1000),
  message text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewing', 'accepted', 'rejected')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id) on delete set null
);
create index if not exists voice_pack_submissions_user on public.voice_pack_submissions (user_id, created_at desc);
create index if not exists voice_pack_submissions_created on public.voice_pack_submissions (created_at desc);
alter table public.voice_pack_submissions enable row level security;
drop policy if exists "voice submissions read" on public.voice_pack_submissions;
create policy "voice submissions read" on public.voice_pack_submissions for select
  using (auth.uid() = user_id or public.is_admin());

-- Üye: paketimi gönder
create or replace function public.voice_pack_submit(p_language text, p_pack_name text, p_link text, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  nm text;
  lang text := left(btrim(coalesce(p_language, '')), 40);
  pn text := left(btrim(coalesce(p_pack_name, '')), 80);
  lk text := btrim(coalesce(p_link, ''));
  msg text := left(btrim(coalesce(p_message, '')), 2000);
  rid uuid;
begin
  if me is null then
    raise exception 'Göndermek için giriş yapmalısın';
  end if;
  if length(lang) < 2 then
    raise exception 'Dili yaz';
  end if;
  if pn = '' then
    raise exception 'Paket adını yaz';
  end if;
  if lk !~ '^https://[^\s/$.?#][^\s]*$' or length(lk) > 1000 then
    raise exception 'Geçerli bir https:// bağlantısı yaz (WeTransfer, Google Drive…)';
  end if;
  if (select count(*) from public.voice_pack_submissions where user_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Bugün en fazla 3 paket gönderebilirsin';
  end if;
  nm := coalesce((select display_name from public.profiles where id = me), '');
  insert into public.voice_pack_submissions (user_id, user_name, language, pack_name, link, message)
    values (me, nm, lang, pn, lk, msg)
    returning id into rid;
  insert into public.notifications (user_id, kind, data)
    select p.id, 'voice_submission', jsonb_build_object(
      'submission', rid, 'user', me, 'name', nm, 'language', lang, 'pack_name', pn, 'link', lk, 'message', left(msg, 500))
    from public.profiles p where p.is_admin;
  return rid;
end $$;
revoke all on function public.voice_pack_submit(text, text, text, text) from public, anon;
grant execute on function public.voice_pack_submit(text, text, text, text) to authenticated;

-- Üye: kendi gönderilerim
create or replace function public.voice_pack_my_submissions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'language', s.language, 'pack_name', s.pack_name, 'link', s.link, 'message', s.message,
      'status', s.status, 'admin_note', s.admin_note, 'created_at', s.created_at, 'updated_at', s.updated_at)
    order by s.created_at desc), '[]'::jsonb)
  from public.voice_pack_submissions s where s.user_id = auth.uid();
$$;
revoke all on function public.voice_pack_my_submissions() from public, anon;
grant execute on function public.voice_pack_my_submissions() to authenticated;

-- Yönetici: gönderiler (p_status '' = hepsi)
create or replace function public.voice_pack_submissions_admin(p_status text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', s.id, 'user_id', s.user_id,
        'user_name', coalesce(nullif(p.display_name, ''), s.user_name),
        'language', s.language, 'pack_name', s.pack_name, 'link', s.link, 'message', s.message,
        'status', s.status, 'admin_note', s.admin_note, 'created_at', s.created_at, 'updated_at', s.updated_at,
        'handled_by_name', coalesce(h.display_name, ''))
      order by (s.status in ('new', 'reviewing')) desc, s.created_at desc)
    from public.voice_pack_submissions s
    left join public.profiles p on p.id = s.user_id
    left join public.profiles h on h.id = s.handled_by
    where coalesce(p_status, '') = '' or s.status = p_status), '[]'::jsonb);
end $$;
revoke all on function public.voice_pack_submissions_admin(text) from public, anon;
grant execute on function public.voice_pack_submissions_admin(text) to authenticated;

-- Yönetici: durum / not değiştir
create or replace function public.voice_pack_submission_update(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  old public.voice_pack_submissions;
  st text := coalesce(p_status, '');
  note text := left(btrim(coalesce(p_note, '')), 2000);
begin
  if not public.is_admin() then
    raise exception 'yetki yok';
  end if;
  if st not in ('new', 'reviewing', 'accepted', 'rejected') then
    raise exception 'Geçersiz durum';
  end if;
  select * into old from public.voice_pack_submissions where id = p_id for update;
  if old.id is null then
    raise exception 'Gönderi bulunamadı';
  end if;
  update public.voice_pack_submissions set status = st, admin_note = note, updated_at = now(), handled_by = auth.uid()
    where id = p_id;
  perform public.log_mod('voice_submission_' || st, 'voice_submission', p_id::text, old.user_id,
    jsonb_build_object('pack_name', old.pack_name, 'language', old.language, 'old_status', old.status, 'note', note));
  if st in ('accepted', 'rejected') and st <> old.status and old.user_id is not null then
    insert into public.notifications (user_id, kind, data)
      values (old.user_id, 'voice_submission_result', jsonb_build_object(
        'submission', p_id, 'status', st, 'pack_name', old.pack_name, 'language', old.language, 'note', left(note, 500)));
  end if;
end $$;
revoke all on function public.voice_pack_submission_update(uuid, text, text) from public, anon;
grant execute on function public.voice_pack_submission_update(uuid, text, text) to authenticated;

-- 3) Bildirimden e-posta: c35'teki liste + 'voice_submission' (yöneticiye) -------------------------
create or replace function public.friend_request_mail() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cat text;
begin
  if new.kind in ('friend_request', 'pro_expiring', 'device_alert', 'pro_changed',
                  'support_new', 'support_user_reply', 'support_reply',
                  'ad_live', 'ad_rejected', 'ad_ended', 'ad_reported', 'ad_pending',
                  'payment_new', 'payment_receipt', 'pro_gift', 'pro_gift_sent', 'pro_gift_ended',
                  'message_reported',
                  'team_invite', 'team_request', 'team_accepted', 'team_announcement', 'team_role',
                  'voice_submission') then
    cat := public.email_kind_category(new.kind);
    if cat is not null and not public.email_pref_on(new.user_id, cat) then
      return null;
    end if;
    if new.kind = 'team_announcement'
       and not public.email_throttle_ok(new.user_id, 'team_announcement:' || coalesce(new.data ->> 'team', ''), interval '1 hour') then
      return null;
    end if;
    if new.kind = 'team_request'
       and not public.email_throttle_ok(new.user_id, 'team_request:' || coalesce(new.data ->> 'team', ''), interval '30 minutes') then
      return null;
    end if;
    perform public.call_jobs(jsonb_build_object('type', new.kind, 'id', new.id));
  end if;
  return null;
end $$;

drop trigger if exists friend_request_mail on public.notifications;
create trigger friend_request_mail after insert on public.notifications
  for each row execute function public.friend_request_mail();
