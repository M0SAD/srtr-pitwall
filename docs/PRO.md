# PRO üyelik (Lemon Squeezy, Patreon / Ko-fi)

**Önerilen yol: Lemon Squeezy.** 1, 3, 6 ve 12 aylık abonelikler kendiliğinden yenilenir. Ödeme olunca bir bildirim
(webhook) Supabase'deki `pro-webhook` fonksiyonuna gelir; uygulama hesabın PRO süresini ayarlar. Kullanıcı
uygulamada kalan süreyi görür, bitmesine 15 gün kala (ve abonelik yenilenmiyorsa) uygulama içi bildirim, e-posta
ve üst çubukta uyarı alır.

## Lemon Squeezy kurulumu

Fiyatlar Lemon Squeezy'de değil, **yönetim panelinde** belirlenir. Lemon'da tek bir abonelik ürünü vardır; kullanıcı
"Satın al"a basınca `pro-checkout` fonksiyonu o planın varyantıyla, yönetim panelindeki tutarı `custom_price` olarak
göndererek ödeme sayfasını açar. Lemon'un belgelerine göre abonelikte bu özel tutar **tüm yenilemelerde** de
kullanılır; bu yüzden panelde fiyatı değiştirmek yalnızca yeni abonelikleri etkiler, mevcut aboneler eski tutardan
yenilenmeye devam eder.

1. Lemon Squeezy → **Products → New product**: ad **SRTR Pitwall PRO**, **abonelik (subscription)**. 4 varyant ekle:
   - **Monthly** — her 1 ayda bir
   - **Every 3 months** — her 3 ayda bir
   - **Every 6 months** — her 6 ayda bir
   - **Yearly** — her 12 ayda bir

   Varyant fiyatları önemsizdir (yer tutucu, ör. 1); gerçek tutar her ödemede panelden alınır. Varyant adları
   abonelik listesinde ve ödeme geçmişinde plan adı olarak görünür. Her varyantın numarasını not et (ürün → varyant →
   adresteki sayı ya da API).
2. Lemon Squeezy → **Settings → API** → yeni API anahtarı; **Settings → Stores** → mağaza numarası.
3. Supabase → **Edge Functions → Secrets**:
   - `LEMON_API_KEY` — API anahtarı (reklamlarla ortak)
   - `LEMON_STORE_ID` — ana mağaza numarası (reklamlarla ortak)
   - `LEMON_STORE_CURRENCY` — (isteğe bağlı) ana mağazanın para birimi, varsayılan `TRY`
   - `LEMON_PRO_1M_VARIANT_ID`, `LEMON_PRO_3M_VARIANT_ID`, `LEMON_PRO_6M_VARIANT_ID`, `LEMON_PRO_12M_VARIANT_ID`
   - `LEMON_WEBHOOK_SECRET` — aşağıdaki webhook'un signing secret'ı
   - (isteğe bağlı) `LEMON_TEST_MODE=1` test ödemesi için, `SITE_URL` ödeme sonrası dönüş adresi
4. `supabase/functions/pro-checkout/index.ts` dosyasıyla **pro-checkout** fonksiyonunu oluştur; **Verify JWT kapalı**
   olsun (oturum fonksiyonun içinde doğrulanır). `pro-webhook` fonksiyonunu da güncel dosyayla yeniden yayınla.
5. SQL Editor'de `supabase/c24_guncelleme.sql` dosyasını çalıştır (`app_config.pro_pricing` sütunu).
6. **Yönetim → Planlar ve fiyatlar** (sitede ya da uygulamada): her plan için **Fiyat (yurt dışı, USD)** ve
   **Türkiye fiyatı (TL)** gir, **Kaydet**. Türkiye'den girenler (saat dilimi Türkiye) TL fiyatını görür ve öder,
   diğer herkes genel fiyatı (USD). Türkiye fiyatı boşsa Türkiye'de de genel fiyat kullanılır. Bir plan için hiç
   otomatik fiyat girilmezse eski yöntem (elle yapıştırılan ödeme bağlantısı ve fiyat metni) kullanılır.
7. Lemon Squeezy → **Settings → Webhooks → +**:
   - URL: `https://<proje>.supabase.co/functions/v1/pro-webhook?source=lemon`
   - Signing secret: kendin bir değer belirle (uzun, rastgele) ve Supabase'de `LEMON_WEBHOOK_SECRET` olarak gir.
   - Olaylar: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`,
     `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_payment_success`,
     `subscription_payment_refunded` (son ikisi web sitesi yönetim panelindeki satış/gelir istatistikleri için).
8. `pro-webhook` fonksiyonunun **Verify JWT** ayarı kapalı olmalı (Lemon Supabase anahtarı göndermez).

### Para birimi ve mağazalar

Lemon'da her mağazanın tek para birimi vardır. Ana mağaza TL ise (varsayılan) Türkiye fiyatı doğrudan TL olarak
alınır; yurt dışı (USD) fiyatı ödeme anında güncel kurla TL'ye çevrilerek ödeme sayfası açılır. Yurt dışı müşterilerin
doğrudan dolarla ödemesini istersen **isteğe bağlı bir USD mağazası** aç, aynı PRO ürününü (4 varyant) orada da oluştur
ve şu gizli değerleri ekle: `LEMON_USD_STORE_ID`, `LEMON_USD_PRO_1M_VARIANT_ID`, `LEMON_USD_PRO_3M_VARIANT_ID`,
`LEMON_USD_PRO_6M_VARIANT_ID`, `LEMON_USD_PRO_12M_VARIANT_ID` (başka para birimleri için aynı kalıp: `LEMON_EUR_…`).
Bir para birimi için mağaza tanımlıysa ödeme o mağazada, o para biriminde açılır.

**Ödemeler (payout):** Lemon Squeezy kazancı varsayılan olarak USD öder; **Settings → Payouts** bölümünden
ödeme para birimini **TRY** seçebilirsin.

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
6. `supabase/functions/ads-checkout/index.ts` dosyasıyla **ads-checkout** fonksiyonunu oluştur — **Verify JWT kapalı** (oturum fonksiyon içinde doğrulanır)
   kalsın (site oturum anahtarıyla çağırır). `pro-webhook` ve `pitwall-jobs` fonksiyonlarını da güncel dosyalarla yeniden yayınla.
7. Yönetim → **Reklamlar**: fiyatları (1.000 gösterim / günlük, para birimi Lemon mağazanla aynı) gir ve **Reklamlar açık**'ı işaretle.

Kullanıcılar reklamı sağ tıklayıp raporlar; **rapor sınırına** ulaşan reklam gizlenir, yöneticilere bildirim + e-posta
gider. Reddettiğin ödenmiş reklamlar için iadeyi Lemon Squeezy'den yap; `order_refunded` gelince reklam durur ve
ödeme listesinde iade görünür.
