# Hesap sistemi kurulumu (Supabase)

Uygulama üyeliksiz tam çalışır. Hesap; bulut yedeği, düzen paylaşımı (Topluluk), yorum/puan ve PRO üyelik için
gerekir. Hepsi tek bir ücretsiz Supabase projesinde çalışır. Kurulum yaklaşık 15 dakika.

## 1. Projeyi oluştur

1. https://supabase.com → **Start your project** → GitHub ile giriş yap.
2. **New project**: ad `pitwall`, bir veritabanı şifresi belirle (bir yere not et), bölge olarak
   **Central EU (Frankfurt)** seç (Türkiye'ye en yakın). Plan: Free.
3. Proje hazırlanınca (1–2 dk) sol menüden **SQL Editor → New query** aç.
4. `supabase/schema.sql` dosyasının **tamamını** yapıştır → **Run**. "Success. No rows returned" görmelisin.
   (Şema güncellendiğinde aynı dosyayı tekrar çalıştırmak güvenlidir; veriler silinmez.)

## 2. Giriş ayarları

**Authentication → Sign In / Providers → Email**

- *Confirm email* açık kalırsa kayıt olan kişiye doğrulama e-postası gider (önerilen). Kapatırsan kayıt olan
  hemen giriş yapar.

**Authentication → URL Configuration**

- *Site URL*: doğrulama ve şifre sıfırlama bağlantıları buraya döner. Bir web siten yoksa GitHub sayfanı
  (ör. `https://github.com/KULLANICI/pitwall`) yazabilirsin; e-postadaki bağlantıya tıklandığında hesap
  doğrulanır, sonra uygulamada giriş yapılır.

**Authentication → Emails → SMTP Settings** (isteğe bağlı ama önerilir)

- Supabase'in kendi e-posta servisi saatte birkaç e-postayla sınırlıdır. Çok kullanıcı bekliyorsan ücretsiz bir
  SMTP servisi (ör. Resend, Brevo) bağla.

## 3. Anahtarları uygulamaya ekle

1. **Project Settings → API** (ya da üstteki **Connect**) bölümünden kopyala:
   - Project URL (ör. `https://abcd1234.supabase.co`)
   - `anon` / *publishable* anahtar
2. **Kendi bilgisayarında derliyorsan:** proje kökündeki `.env.example` dosyasını `.env` olarak kopyala:

   ```
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   Sonra `build.bat` ile yeniden derle.
3. **GitHub Actions ile yayınlıyorsan:** depoda **Settings → Secrets and variables → Actions → New repository
   secret** ile `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` ekle. Sürüm iş akışı bunları kullanır.

> `anon` anahtarı herkese açık olacak şekilde tasarlanmıştır; güvenliği tablolardaki satır düzeyi güvenlik
> (RLS) kuralları sağlar. **`service_role` anahtarını asla uygulamaya ya da GitHub'a koyma.**

## 4. Kendini yönetici yap

1. Uygulamada **Hesap → Kayıt ol** ile kendi hesabını aç (e-postayı doğrula, giriş yap).
2. Supabase **SQL Editor**'de kendi e-postanla çalıştır:

   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'SENIN@EPOSTAN.com');
   ```

3. Uygulamada Hesap sayfasını yeniden aç: en altta **Yönetici** bölümü görünür. Buradan:
   - PRO'ya ayrılacak overlay'leri işaretlersin,
   - Patreon/Ko-fi bağlantılarını ve fiyat metinlerini yazarsın,
   - kullanıcı arayıp elle PRO verir ya da alırsın.

Yöneticiler her zaman PRO sayılır. Kullanıcılar kendilerini yönetici ya da PRO yapamaz (veritabanı engeller).

## 5. PRO ödemeleri

Patreon/Ko-fi ödemelerinin otomatik PRO açması için: [PRO.md](PRO.md)

## 6. Sunucu işleri (rapor e-postası, 6 ay görsel temizliği)

`supabase/functions/pitwall-jobs` Edge Function'ı iki iş yapar; veritabanı çağırır (uygulama değil):

- Biri bir görseli/yorumu/düzeni raporlayınca yöneticilere e-posta gönderir.
- Her gece 03:17'de (UTC) 6 aydır açılmayan ekran görüntülerini siler, sahibine uygulama içi bildirim ve
  kendi dilinde e-posta gönderir.

Kurulum (bu projede yapıldı):

1. Edge Functions → Deploy a new function → Via Editor → adı `pitwall-jobs`, dosya içeriği
   `supabase/functions/pitwall-jobs/index.ts`. Ayarlarda **Verify JWT** kapalı olmalı.
2. SQL Editor'da `schema.sql` (pg_cron ve pg_net açılır, gece işi kurulur). Başka projede `call_jobs`
   içindeki adresi kendi proje adresinle değiştir.
3. **E-posta için:** Edge Functions → Secrets → `SMTP_PASS` = Gmail uygulama şifren. (İsteğe bağlı:
   `SMTP_USER`, `REPORT_TO`.) Bu değer girilmezse işler yine çalışır, sadece e-posta gitmez.

## Moderasyon

- **Sahip** (ilk yönetici): başkalarını yönetici yapar, izin gruplarını düzenler, moderasyon kayıtlarını görür.
- **İzin grupları** (ör. Moderatör): görsel/yorum silme ve düzenleme, raporlar, düzen silme.
  Yetkiler veritabanında `has_perm()` ile denetlenir.
- Başkasının içeriğine yapılan her silme/düzenleme `mod_log` tablosuna yazılır.

## Nasıl çalışır

- Ayarlar önce yerel dosyaya yazılır: `%APPDATA%\com.pitwall.overlay\settings.json`. Giriş yapılmışsa
  değişiklikten ~3 sn sonra buluta da gönderilir; yeni bilgisayarda giriş yapınca aynen gelir.
- Paylaşılan düzenler, puanlar ve yorumlar herkes tarafından okunabilir; sadece sahibi değiştirir/siler
  (yorumu yazan, düzenin sahibi ve yönetici silebilir). Kendi düzenine puan verilemez.
- PRO durumu uygulama açılışında ve 6 saatte bir denetlenir, bilgisayarda saklanır. İnternet yokken de PRO
  süresi bitene kadar geçerli kalır.
- Oyun sırasında ağ trafiği yok denecek kadar azdır (sadece 6 saatte bir küçük bir istek).

## Tablolar

| Tablo | İçerik |
|---|---|
| `user_settings` | Her kullanıcının ayar yedeği |
| `profiles` | Görünen ad, bağlı iRacing hesabı, yönetici, PRO bitişi |
| `app_config` | PRO overlay listesi, Patreon/Ko-fi bağlantıları, fiyat metinleri |
| `shared_layouts` | Paylaşılan düzenler (ekran çözünürlüğü, overlay kutuları, profil verisi) |
| `layout_ratings` / `layout_comments` | Yıldızlar ve yorumlar |
| `pending_pro` | Hesap açılmadan önce ödeme yapanlar (kayıt olunca PRO otomatik açılır) |
