-- ---------------------------------------------------------------------------
-- c35: E-posta bildirim tercihleri ve takım bildirim e-postaları.
--      1) profiles.email_prefs (jsonb, varsayılan {}): kategori → true/false. Anahtar yoksa varsayılan geçerli.
--         Kategoriler (kullanıcının açıp kapatabildiği e-postalar):
--           friends  Arkadaşlık istekleri (friend_request)                                  varsayılan AÇIK
--           teams    Takım bildirimleri: davet, katılma isteği, kabul, duyuru, yöneticilik
--                    (team_invite, team_request, team_accepted, team_announcement, team_role) varsayılan KAPALI
--           support  Destek talebine yanıt (support_reply)                                 varsayılan AÇIK
--           ads      Reklam durumu: yayında / reddedildi-durduruldu / bitti
--                    (ad_live, ad_rejected, ad_ended)                                       varsayılan AÇIK
--           pro      PRO bitiş hatırlatmaları (pro_expiring: 10 gün ve son gün)              varsayılan AÇIK
--           shots    6 ay açılmadığı için silinen ekran görüntüleri (pitwall-jobs cleanup)  varsayılan AÇIK
--         Her zaman gönderilen (işlem/hesap/güvenlik) e-postalar kapatılamaz: ödeme makbuzu ve iade (payment_receipt),
--         hediye PRO (pro_gift, pro_gift_sent, pro_gift_ended), yöneticinin PRO süresini değiştirmesi (pro_changed),
--         giriş/şifre kodları (Supabase Auth). Yönetici e-postaları (rapor, destek, reklam onayı, ödeme, cihaz,
--         mesaj raporu) bu tercihlerden etkilenmez. Özel mesajlar için e-posta yoktur.
--      2) email_pref_on(kullanıcı, kategori), email_kind_category(bildirim türü), my_email_prefs() (tüm kategoriler,
--         varsayılanlar uygulanmış) ve email_prefs_set(jsonb) (sadece bilinen anahtarlar, sadece true/false; birleştirir).
--      3) Takım bildirimleri artık e-posta da gönderir (pitwall-jobs → teamMail, 15 dil), tercih açıksa.
--         Taşkın önleme (email_throttle): team_announcement aynı kişiye aynı takımdan saatte en fazla bir e-posta;
--         team_request (sahip/yöneticilere) aynı takımdan kişi başına 30 dakikada en fazla bir e-posta.
--      4) friend_request_mail() (c27'deki türler + takım türleri): tercihi ve sınırı tetikleyicide denetler,
--         uygun değilse pitwall-jobs hiç çağrılmaz. pitwall-jobs de göndermeden önce tercihi yeniden denetler
--         (temizlik e-postası tetikleyiciden geçmediği için).
-- Sıra: c30'dan sonra, sonra pitwall-jobs fonksiyonu.
-- ---------------------------------------------------------------------------

-- 1) Tercih sütunu ------------------------------------------------------------------
alter table public.profiles add column if not exists email_prefs jsonb not null default '{}'::jsonb;

-- Kategori varsayılanı: takım e-postaları kapalı, diğerleri açık
create or replace function public.email_pref_default(p_cat text) returns boolean
language sql immutable set search_path = public as $$
  select p_cat is distinct from 'teams';
$$;

-- Bildirim türünün tercih kategorisi (null: her zaman gönderilir ya da yönetici e-postası)
create or replace function public.email_kind_category(p_kind text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_kind = 'friend_request' then 'friends'
    when p_kind in ('team_invite', 'team_request', 'team_accepted', 'team_announcement', 'team_role') then 'teams'
    when p_kind = 'support_reply' then 'support'
    when p_kind in ('ad_live', 'ad_rejected', 'ad_ended') then 'ads'
    when p_kind = 'pro_expiring' then 'pro'
    when p_kind = 'shot_expired' then 'shots'
    else null
  end;
$$;

-- Kişi bu kategorideki e-postaları almak istiyor mu (anahtar yoksa / geçersizse varsayılan)
create or replace function public.email_pref_on(p_user uuid, p_cat text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when jsonb_typeof(p.email_prefs -> p_cat) = 'boolean' then (p.email_prefs ->> p_cat)::boolean end
     from public.profiles p where p.id = p_user),
    public.email_pref_default(p_cat));
$$;

-- Oturumdaki kullanıcının tercihleri (tüm kategoriler, varsayılanlar uygulanmış)
create or replace function public.my_email_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(c, public.email_pref_on(auth.uid(), c))
  from unnest(array['friends', 'teams', 'support', 'ads', 'pro', 'shots']) as c;
$$;

-- Tercihleri değiştir: {"teams": true, "ads": false} gibi; sadece bilinen anahtarlar ve true/false
create or replace function public.email_prefs_set(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısın';
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'Geçersiz tercih';
  end if;
  for k, v in select * from jsonb_each(p_prefs) loop
    if k not in ('friends', 'teams', 'support', 'ads', 'pro', 'shots') then
      raise exception 'Bilinmeyen e-posta tercihi: %', k;
    end if;
    if jsonb_typeof(v) <> 'boolean' then
      raise exception 'Geçersiz değer: %', k;
    end if;
  end loop;
  update public.profiles
    set email_prefs = (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      from jsonb_each(coalesce(email_prefs, '{}'::jsonb) || p_prefs) e
      where e.key in ('friends', 'teams', 'support', 'ads', 'pro', 'shots') and jsonb_typeof(e.value) = 'boolean')
    where id = auth.uid();
  return public.my_email_prefs();
end $$;

revoke all on function public.email_pref_on(uuid, text), public.my_email_prefs(), public.email_prefs_set(jsonb)
  from public, anon;
revoke all on function public.email_pref_on(uuid, text) from authenticated;
grant execute on function public.my_email_prefs(), public.email_prefs_set(jsonb) to authenticated;
grant execute on function public.email_pref_on(uuid, text) to service_role;
grant execute on function public.email_pref_default(text), public.email_kind_category(text) to authenticated, service_role;

-- 2) Taşkın önleme ------------------------------------------------------------------
create table if not exists public.email_throttle (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  last_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.email_throttle enable row level security;
-- (politika yok: sadece sunucu / security definer fonksiyonlar erişir)
grant all on public.email_throttle to service_role;

-- Bu anahtar için son e-postadan bu yana p_gap geçtiyse true döner ve zamanı kaydeder
create or replace function public.email_throttle_ok(p_user uuid, p_key text, p_gap interval) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  insert into public.email_throttle as t (user_id, key, last_at) values (p_user, p_key, now())
  on conflict (user_id, key) do update set last_at = now()
    where t.last_at < now() - p_gap
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.email_throttle_ok(uuid, text, interval) from public, anon, authenticated;

-- Eski kayıtları temizle (bir günden eski sınır kayıtlarının işi bitti)
delete from public.email_throttle where last_at < now() - interval '1 day';

-- 3) Bildirimden e-posta (c27'deki türler + takım türleri; kullanıcı tercihleri ve taşkın sınırı) ----------
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
                  'team_invite', 'team_request', 'team_accepted', 'team_announcement', 'team_role') then
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
