-- c131: Açık tablo izinleri (Supabase 30 Ekim 2026 değişikliği).
-- Supabase, "public" şemasında YENİ oluşturulan tablolara Data API (supabase-js / PostgREST) erişimini artık
-- kendiliğinden vermiyor; her tabloya açık GRANT gerekiyor. Var olan tablolar etkilenmez (izinleri durur).
-- Bu dosya, izni yalnızca o varsayılandan gelen tablolara bugün sahip oldukları izni AÇIKÇA yazar; böylece proje
-- schema.sql ile sıfırdan kurulduğunda (yeni proje, test dalı) da aynı çalışır. Mevcut projede bir şey değişmez.
-- Erişimi yine satır güvenliği (RLS) kuralları belirler; bu tabloların hepsinde RLS açık.
-- backup_restore_* tabloları bilerek kapalıdır (yalnızca sunucu), onlara izin verilmez.

grant select, insert, update, delete on
  public.chat_backgrounds,
  public.coupon_redemptions,
  public.coupons,
  public.payments,
  public.pending_pro,
  public.pro_feature_catalog,
  public.pro_features,
  public.pro_log,
  public.site_visits,
  public.user_settings_history,
  public.voice_bans,
  public.voice_grants,
  public.voice_moderators,
  public.voice_pack_submissions,
  public.voice_requests,
  public.voice_room_roles,
  public.voice_rooms,
  public.voice_sessions
to anon, authenticated;

-- Sunucu fonksiyonları (Edge Functions) service_role ile çalışır
grant all on all tables in schema public to service_role;
-- Otomatik artan kimlik sütunları (identity / serial)
grant usage, select on all sequences in schema public to authenticated, service_role;

notify pgrst, 'reload schema';
