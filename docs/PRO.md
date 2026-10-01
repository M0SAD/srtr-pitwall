# PRO üyelik (Lemon Squeezy, Patreon / Ko-fi)

**Önerilen yol: Lemon Squeezy.** 1, 3, 6 ve 12 aylık abonelikler kendiliğinden yenilenir. Ödeme olunca bir bildirim
(webhook) Supabase'deki `pro-webhook` fonksiyonuna gelir; uygulama hesabın PRO süresini ayarlar. Kullanıcı
uygulamada kalan süreyi görür, bitmesine 15 gün kala (ve abonelik yenilenmiyorsa) uygulama içi bildirim, e-posta
ve üst çubukta uyarı alır.

## Lemon Squeezy kurulumu

1. Ürünü abonelik olarak oluştur ve 4 varyant ekle: her **1 / 3 / 6 / 12 ayda** bir ödeme.
2. Her varyantın **Share** bölümündeki ödeme bağlantısını kopyala; uygulamada **Yönetim → Planlar ve fiyatlar**
   bölümündeki ilgili plana yapıştır, fiyat metnini yaz, **Kaydet**. Uygulama bağlantıya kullanıcının hesabını
   (kimlik ve e-posta) kendisi ekler.
3. Lemon Squeezy → **Settings → Webhooks → +**:
   - URL: `https://<proje>.supabase.co/functions/v1/pro-webhook?source=lemon`
   - Signing secret: kendin bir değer belirle (uzun, rastgele) ve kopyala.
   - Olaylar: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`,
     `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_payment_success`,
     `subscription_payment_refunded` (son ikisi web sitesi yönetim panelindeki satış/gelir istatistikleri için).
4. Supabase → **Edge Functions → Secrets**: `LEMON_WEBHOOK_SECRET` = aynı signing secret.
5. `pro-webhook` fonksiyonunun **Verify JWT** ayarı kapalı olmalı (Lemon Supabase anahtarı göndermez).

PRO, yenileme tarihine 3 gün ek süreyle verilir; iptalde ödenen dönemin sonuna kadar sürer. Elle ya da Patreon
ile verilmiş daha uzun bir süre varsa abonelik onu kısaltmaz.

## Cihaz sınırı

Uygulama girişte bilgisayarın karma kimliğini kaydeder. Bir hesap **Yönetim → Planlar ve fiyatlar → Cihaz sınırı**
kadar bilgisayarı aşarsa (varsayılan 2, son 30 günde açılanlar sayılır) yöneticilere bildirim ve e-posta gider;
**Yönetim → Cihazlar** bölümünde hesabı, bilgisayarları ve son kullanım zamanlarını görür, bir cihazı kaldırır,
uyarıyı kapatır ya da PRO'yu alırsın.

---

# Eski yöntem: Patreon / Ko-fi

PRO üyelik aylık ya da yıllık abonelikle çalışır. Ödemeyi Patreon ya da Ko-fi alır; her ödemede bir bildirim
(webhook) Supabase'deki `pro-webhook` fonksiyonuna gelir ve ödeyen e-postanın SRTR Pitwall hesabına PRO süresi
eklenir. Hesap e-postası farklıysa kullanıcı **Hesap → PRO üyelik → Ödeme e-postası** alanına Patreon/Ko-fi
e-postasını yazar. Henüz hesabı olmayan biri öderse kayıt olduğunda PRO kendiliğinden açılır.

Önce [SUPABASE.md](SUPABASE.md) adımlarını bitir.

## 1. Fonksiyonu yükle (tarayıcıdan, komut satırı gerekmez)

1. Supabase panelinde **Edge Functions → Deploy a new function → Via Editor**.
2. Ad: `pro-webhook`.
3. Editördeki örnek kodu sil, `supabase/functions/pro-webhook/index.ts` dosyasının içeriğini yapıştır →
   **Deploy function**.
4. Fonksiyonun **Details** (ayarlar) sayfasında **Enforce JWT Verification / Verify JWT** seçeneğini **kapat**.
   Patreon ve Ko-fi Supabase anahtarı göndermez; güvenliği fonksiyonun kendisi imza/token ile sağlar.
5. Fonksiyon adresi: `https://<proje>.supabase.co/functions/v1/pro-webhook`

(Supabase CLI kullanıyorsan: `supabase functions deploy pro-webhook --no-verify-jwt`)

## 2a. Patreon

1. Patreon'da yaratıcı sayfanda üyelik kademesi oluştur (ör. **SRTR Pitwall PRO**). Yıllık ödeme için Patreon'un
   *annual billing* seçeneğini aç; ikisi de aynı kademede olabilir.
2. https://www.patreon.com/portal/registration/register-webhooks adresinde (Patreon → Creator settings →
   Developers → Webhooks) yeni webhook ekle:
   - URL: `https://<proje>.supabase.co/functions/v1/pro-webhook?source=patreon`
   - Olaylar (triggers): `members:pledge:create`, `members:pledge:update`, `members:update`, `members:create`
3. Webhook'un **secret** değerini kopyala. Supabase → **Edge Functions → Secrets** (ya da Project Settings →
   Edge Functions) bölümüne `PATREON_WEBHOOK_SECRET` adıyla ekle.
4. PRO süresi, Patreon'un bildirdiği bir sonraki ödeme tarihine (+3 gün) kadar verilir; her ödemede uzar.
   İptal eden kişinin PRO'su ödediği dönemin sonuna kadar sürer.

## 2b. Ko-fi

1. Ko-fi'de **Memberships** bölümünde üyelik kademeleri oluştur. Yıllık kademenin adında **"Yıllık"**
   (ya da "Yearly/Annual") geçsin, ör. *PRO Aylık* ve *PRO Yıllık*. Fonksiyon kademe adından süreyi anlar
   (aylık: 31 gün, yıllık: 365 gün, +3 gün ek süre).
2. Ko-fi → **Settings → API** (More → API): Webhook URL'e
   `https://<proje>.supabase.co/functions/v1/pro-webhook?source=kofi` yaz → Update.
3. Aynı sayfadaki **Verification Token**'ı kopyala, Supabase Secrets'a `KOFI_VERIFICATION_TOKEN` adıyla ekle.
4. Ko-fi'deki **Send Test** ile deneyebilirsin (test bildirimi üyelik olmadığı için sadece "ignored" döner).

## 3. Uygulamada göster

Uygulamada yönetici hesabınla **Yönetim → Planlar ve fiyatlar** bölümüne Patreon/Ko-fi bağlantılarını ve
fiyat metinlerini (ör. "3 € / ay", "30 € / yıl") yaz. PRO olmayan kullanıcılar Hesap sayfasında bu bilgileri ve
abone ol düğmelerini görür.

## Elle PRO verme

**Yönetim → Üyeler**: ad, e-posta ya da iRacing adıyla ara; 1 ay, 1 yıl ya da süresiz PRO ver,
gerekirse kaldır. (Hediye, çekiliş, destekçi vb. için.)

## Hangi overlay'ler PRO?

**Yönetim → Planlar ve fiyatlar → PRO overlay'ler** listesinden işaretle. Değişiklik kullanıcılara en geç 6 saat içinde
(ya da uygulamayı yeniden açtıklarında) yansır. PRO olmayan kullanıcıda bu overlay'ler panelde **PRO**
rozetiyle kilitli görünür ve ekranda gösterilmez. Topluluktan indirilen düzenlerde de kilitli kalır.

## Güvenlik notu

Kilit uygulamanın içindedir; bu yüzden kaynak kodu gizli (private) GitHub deposunda tut. `service_role`
anahtarı sadece Supabase'in kendi fonksiyon ortamında kullanılır, uygulamaya konmaz.

## Sorun giderme

- **Ödeme yaptım ama PRO gelmedi:** Supabase → Edge Functions → pro-webhook → **Logs**. "pending" dönmüşse o
  e-postayla hesap yok: kullanıcı ya o e-postayla kayıt olmalı ya da Hesap sayfasında "Ödeme e-postası"na
  yazmalı, sonra **Üyeliği yeniden denetle**. (Sonraki ödemede otomatik eşleşir; hemen istiyorsa yönetici elle
  verebilir.)
- **401 imza hatalı / token hatalı:** Secrets'taki değer Patreon/Ko-fi'dekiyle aynı değil.

## Reklamlar (kendi kendine reklam verme)

Reklam verenler sitedeki **Reklam ver** (`reklam.html`) sayfasından yer, gösterim paketi ya da gün seçer, görsel
yükler ve öder; ödeme gelince reklam otomatik yayına girer (Yönetim → Reklamlar'da otomatik onay kapalıysa onay bekler).
PRO üyeler reklam görmez, oyun içi overlay'lerde reklam yoktur. Kurulum:

1. SQL Editor'de `supabase/c22_guncelleme.sql` dosyasını çalıştır (şemanın c22 bölümü: tablolar, `ads` kovası, RPC'ler,
   10 dakikada bir çalışan `pitwall-ads` işi).
2. Lemon Squeezy → **Products → New product**: ad ör. "SRTR Pitwall reklamı", **tek seferlik (single payment)**,
   fiyat herhangi (ör. 1) — gerçek tutar her ödemede sunucuda hesaplanıp `custom_price` ile gönderilir. Varyant
   numarasını not et (ürün → varyant → adresteki sayı ya da API).
3. Lemon Squeezy → **Settings → API** → yeni API anahtarı; **Settings → Stores** → mağaza numarası.
4. Lemon Squeezy → **Settings → Webhooks**: mevcut `pro-webhook?source=lemon` webhook'unda **order_created** ve
   **order_refunded** olaylarını da işaretle.
5. Supabase → **Edge Functions → Secrets**: `LEMON_API_KEY`, `LEMON_STORE_ID`, `LEMON_AD_VARIANT_ID`
   (isteğe bağlı: `LEMON_TEST_MODE=1` test ödemesi için, `SITE_URL`).
6. `supabase/functions/ads-checkout/index.ts` dosyasıyla **ads-checkout** fonksiyonunu oluştur — **Verify JWT açık**
   kalsın (site oturum anahtarıyla çağırır). `pro-webhook` ve `pitwall-jobs` fonksiyonlarını da güncel dosyalarla yeniden yayınla.
7. Yönetim → **Reklamlar**: fiyatları (1.000 gösterim / günlük, para birimi Lemon mağazanla aynı) gir ve **Reklamlar açık**'ı işaretle.

Kullanıcılar reklamı sağ tıklayıp raporlar; **rapor sınırına** ulaşan reklam gizlenir, yöneticilere bildirim + e-posta
gider. Reddettiğin ödenmiş reklamlar için iadeyi Lemon Squeezy'den yap; `order_refunded` gelince reklam durur ve
ödeme listesinde iade görünür.
