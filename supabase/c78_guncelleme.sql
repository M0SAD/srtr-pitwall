-- ---------------------------------------------------------------------------
-- c78: "Güvenilir arkadaş" = ekip üyesi. Arkadaş menüsünde artık tek bir anahtar var (Güvenilir yap / Güvenilirden
-- çıkar); ayrı "Ekibe ekle" ve "Pit ayarlarını değiştirebilir" maddeleri kalktı.
--
-- Kural: friendships.trusted (sahibin satırı: user_id = sürücü, friend_id = arkadaş) AÇILINCA arkadaş sürücünün
-- ekibine (crew_members) izleme + pit değiştirme yetkisiyle eklenir; KAPANINCA ekipten çıkar.
--
-- PRO kuralları DEĞİŞMEDİ:
--   - Değiştirme yetkisi (can_control) yalnızca 'social.crew' PRO'ya özel değilse ya da sürücü PRO ise verilir
--     (crew_set'teki kuralın aynısı). PRO olmayan sürücünün güvenilir arkadaşı yalnızca İZLER (izleme ücretsizdi).
--     Komutun uygulanması ayrıca crew_accepts() ile denetlenmeye devam eder (ana anahtar + sürücü PRO).
--   - Veri paylaşımı (live_data, my_friends.trusts_me) live_visible() içinde sürücünün PRO'luğuna bakmayı sürdürür.
--     Bu yüzden friend_trust_set artık PRO olmayana hata VERMEZ: işaret konur (pitwall izleme yetkisi ücretsiz),
--     ama PRO olmayan sürücünün verisi yine paylaşılmaz. friend_set (eski sürümler) olduğu gibi kaldı.
--   - Güvenilir yoluyla eklenen üyede 10 kişilik ekip sınırı aranmaz (crew_set'te sınır duruyor).
--
-- Bu dosyanın oluşturduğu / değiştirdiği:
--   fonksiyon  friend_trust_crew()            — tetikleyici: trusted değişince crew_members'ı eşitler
--   tetikleyici friend_trust_crew (friendships, after insert or update of trusted, status)
--   RPC        friend_trust_set(uuid, boolean) — c44'teki son tanım; yalnızca PRO hatası kaldırıldı
--   TEK SEFERLİK veri düzeltmeleri (en altta, tekrar çalıştırılabilir)
-- Sıra: c53 (crew_members), c44 (friend_trust_set) ve c38 (feature_requires_pro, user_is_pro) sonrası.
-- Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

-- 1) Güvenilir işareti <-> ekip üyeliği
create or replace function public.friend_trust_crew() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trusted and new.status = 'accepted' then
    insert into public.crew_members (owner, member, can_view, can_control)
      values (new.user_id, new.friend_id, true,
              not public.feature_requires_pro('social.crew', true) or public.user_is_pro(new.user_id))
      on conflict (owner, member) do update
        set can_view = true, can_control = public.crew_members.can_control or excluded.can_control;
  elsif tg_op = 'UPDATE' and old.trusted and not new.trusted then
    -- Güvenilirden çıkarıldı: ekip üyeliği ve değiştirme yetkisi de kalkar
    delete from public.crew_members where owner = new.user_id and member = new.friend_id;
  end if;
  return new;
end $$;
revoke all on function public.friend_trust_crew() from public, anon, authenticated;

drop trigger if exists friend_trust_crew on public.friendships;
create trigger friend_trust_crew after insert or update of trusted, status on public.friendships
  for each row execute function public.friend_trust_crew();

-- 2) Sadece güvenilir işareti (c44'teki son tanım). Değişen tek şey: PRO olmayana hata verilmez (bkz. başlık).
create or replace function public.friend_trust_set(p_user uuid, p_trusted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli';
  end if;
  update public.friendships set trusted = coalesce(p_trusted, false)
    where user_id = auth.uid() and friend_id = p_user and status = 'accepted';
  if not found then
    raise exception 'Arkadaş bulunamadı';
  end if;
end $$;
revoke all on function public.friend_trust_set(uuid, boolean) from public, anon;
grant execute on function public.friend_trust_set(uuid, boolean) to authenticated;

-- ===========================================================================
-- TEK SEFERLİK VERİ DÜZELTMELERİ (tekrar çalıştırmak zararsız)
-- ===========================================================================
-- a) Zaten güvenilir olan ama ekipte olmayan arkadaşlar ekibe eklenir; ekipte olup değiştirme yetkisi olmayan
--    güvenilir arkadaşa (sürücü PRO ise / özellik PRO'ya özel değilse) değiştirme yetkisi verilir.
--    Ekipte olup güvenilir OLMAYAN arkadaşlara dokunulmaz (ekipte kalırlar).
insert into public.crew_members (owner, member, can_view, can_control)
  select f.user_id, f.friend_id, true,
         not public.feature_requires_pro('social.crew', true) or public.user_is_pro(f.user_id)
  from public.friendships f
  where f.trusted and f.status = 'accepted' and f.user_id <> f.friend_id
on conflict (owner, member) do update
  set can_view = true, can_control = public.crew_members.can_control or excluded.can_control;

-- b) "Mesajlarını kapat" menüden kalktı: sessize alınmış arkadaşlar görünmez biçimde sessiz kalmasın
update public.friendships set muted = false where muted;
