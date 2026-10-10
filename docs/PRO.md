# PRO üyelik (Paddle; eski yollar: Lemon Squeezy, Patreon / Ko-fi)

**Ödemeleri Paddle alır.** 1, 3, 6 ve 12 aylık PRO abonelikleri, hediye PRO ve reklam ödemeleri Paddle Billing'den
geçer. Paddle "Merchant of Record"dur: faturayı kesen, KDV / satış vergisini hesaplayıp ödeyen satıcı odur; sen
kazancı Paddle'dan alırsın. Abonelikler kendiliğinden yenilenir; her olayda Paddle bir bildirim (webhook) yollar,
Supabase'deki `pro-webhook` fonksiyonu hesabın PRO süresini ayarlar. Üye kartını değiştirmek, faturalarını indirmek
ya da aboneliği iptal etmek için Hesap sayfasındaki **Aboneliği yönet** düğmesiyle Paddle müşteri portalına gider.

Fiyatlar Paddle'da değil, **yönetim panelinde** (Planlar ve fiyatlar) belirlenir. Kullanıcı "Satın al"a basınca
`pro-checkout` fonksiyonu Paddle'da bu ödemeye özel bir fiyatla (tutar, para birimi, yenileme dönemi) bir işlem
(transaction) açar; Paddle bu fiyatı abonelikte saklar ve yenilemeler aynı tutardan olur. Panelde fiyatı değiştirmek
yalnızca yeni abonelikleri etkiler. Türkiye'den girenler TL, diğerleri genel fiyatı (ör. USD) öder; Paddle birden çok
para birimini tek hesapta desteklediği için ayrı mağaza ya da kur çevrimi gerekmez.

## Paddle kurulumu (sıfırdan)

Önce **test ortamında (sandbox)** kur ve dene, sonra aynı adımları canlı hesapta tekrarla.

### 1. Hesaplar

1. Test: https://sandbox-vendors.paddle.com/signup — test hesabı hemen açılır, gerçek para geçmez.
2. Canlı: https://www.paddle.com → **Get started** (Paddle Billing). Kayıtta satıcı (sen / şirketin) bilgileri,
   ülke ve kazancın gönderileceği ödeme (payout) yöntemi sorulur; Türkiye'den satıcı kabulünü ve ödeme yöntemini
   kayıt sırasında doğrula. Paddle canlı satışa açmadan önce hesabı ve **alan adını** inceler:
   - Alan adı: `pitwall.simracetr.com` (Paddle → **Checkout → Website approval**).
   - Sitede şunlar olmalı: ürünün ne olduğu ve fiyatları (var), **Kullanım koşulları** (satıcının adıyla),
     **Gizlilik politikası** ve **İade politikası** sayfaları, iletişim bilgisi. Bu sayfalar sitede henüz yok;
     onay için eklenmeli.

### 2. Ürünler

Paddle → **Catalog → Products → + New product**:

- **SRTR Pitwall PRO** — vergi kategorisi **Standard digital goods** (ya da **SaaS**). Fiyat eklemen gerekmez
  (fiyat her ödemede panelden gönderilir). Ürün kimliğini (`pro_…`) not et → `PADDLE_PRO_PRODUCT_ID`.
- ~~SRTR Pitwall reklamı~~ — **oluşturma.** Paddle reklam alanı satışına izin vermiyor (mağaza onayı bu yüzden reddedildi). Reklam ödemeleri Paddle dışında kalır (Lemon tanımlıysa Lemon, değilse reklam alımı kapalı: yönetim > Reklamlar > "Reklamlar açık" kapalı tutulur; kapalıyken sitede reklam bağlantıları ve fiyatları görünmez).

### 3. Anahtarlar

Paddle → **Developer tools → Authentication**:

- **API keys → New API key**: ad ör. "Supabase". İzinler: Customers, Transactions, Subscriptions, Discounts,
  Customer portal sessions için okuma + yazma (ya da tüm izinler). → `PADDLE_API_KEY`
- **Client-side tokens → New client-side token** → `PADDLE_CLIENT_TOKEN` (herkese açık bilgi; ödeme sayfası kullanır).

### 4. Ödeme sayfası

Paddle → **Checkout → Checkout settings**:

- **Default payment link**: `https://pitwall.simracetr.com/odeme.html` (canlıda alan adı onaylanınca kaydedilir).
  Paddle'ın kendi e-postalarındaki bağlantılar (kart güncelleme, başarısız yenileme ödemesi) da bu sayfaya gelir.
- Para birimleri: TRY ve USD'nin (yönetim panelinde kullandıkların) açık olduğunu kontrol et.
- Vergi: panelde yazdığın fiyatlar **vergi dahil** gönderilir (`tax_mode: internal`); Paddle KDV / satış vergisini
  fiyatın içinden ayırır, müşteri panelde gördüğü tutarı öder.

Sitedeki `odeme.html` ve `assets/pay.js` dosyaları yayında olmalı (aşağıda 8. adım).

### 5. Bildirim (webhook)

Paddle → **Developer tools → Notifications → + New destination**:

- Tür: **Webhook**, URL: `https://<proje>.supabase.co/functions/v1/pro-webhook?source=paddle`
- Olaylar: `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.canceled`,
  `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.trialing`,
  `transaction.completed`, `adjustment.created`, `adjustment.updated`
- Kaydettikten sonra hedefin **secret key** değerini kopyala → `PADDLE_WEBHOOK_SECRET`

### 6. Supabase

1. SQL Editor'de `supabase/c110_guncelleme.sql` dosyasını çalıştır (abonelikte sağlayıcı / müşteri kimliği,
   `apply_subscription`, `my_pro`, `my_gifts`, gelir istatistiklerinde Paddle).
2. **Edge Functions → Secrets**:
   - `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`
   - `PADDLE_PRO_PRODUCT_ID` (`PADDLE_AD_PRODUCT_ID` tanımlanmaz; varsa silinir)
   - `PADDLE_ENV=sandbox` (yalnızca test ortamında; canlıda bu değeri **sil**)
   - (isteğe bağlı) `SITE_URL`, varsayılan `https://pitwall.simracetr.com`
3. Fonksiyonları güncel dosyalarla yeniden yayınla (**Edge Functions → fonksiyon → Code** → dosyanın içeriğini
   yapıştır → **Deploy**): `pro-checkout`, `ads-checkout`, `pro-webhook`, `gift-cancel`, `pitwall-jobs`.
4. Yeni fonksiyon: **Deploy a new function → Via Editor**, ad `pro-portal`, içerik
   `supabase/functions/pro-portal/index.ts`. `pro-checkout`, `ads-checkout`, `gift-cancel`, `pro-portal` ve
   `pro-webhook` için **Verify JWT kapalı** olmalı (oturum / imza fonksiyonların içinde doğrulanır).

`PADDLE_API_KEY` tanımlandığı an yeni ödemeler Paddle'dan açılır; tanımlı değilken eski Lemon yolu çalışır.

### 7. Fiyatlar

**Yönetim → Planlar ve fiyatlar**: her plan için genel fiyat (USD) ve Türkiye fiyatı (TL). Reklam fiyatları:
**Yönetim → Reklamlar**. Kuponlar: **Yönetim → Kuponlar** (ödemede Paddle'da bu ödemeye özel, tek kullanımlık bir
indirim olarak uygulanır; aylık planda kupon geçerliyken her ödemede, diğer planlarda yalnızca ilk ödemede).
Sandbox'ta bitiş tarihli bir kuponla aylık abonelik alıp Paddle → Subscriptions → abonelik → indirimin kaç ödeme
süreceğini kontrol et (Paddle'ın "maximum recurring intervals" sayısı ilk ödemeyi de içerir; içermiyorsa
`pro-checkout`'ta bir eksiği gönderilmeli).

### 8. Site

Siteye şu dosyaları yükle: `odeme.html`, `assets/pay.js`, `assets/core.js`, `assets/account.js`, `assets/ads.js`,
`assets/admin.js`, `assets/ads-admin.js`, `assets/coupons-admin.js` ve `assets/lang/*.json`.

### 9. Deneme (sandbox)

Sitede ya da programda bir plan satın al. Test kartı: `4242 4242 4242 4242`, ileri bir son kullanma tarihi,
CVC `100`. Sonra kontrol et:

- Supabase → Edge Functions → `pro-webhook` → **Logs**: `subscription.created` ve `transaction.completed` 200 dönmeli.
- Hesap sayfasında PRO açık, **Aboneliği yönet** düğmesi Paddle portalını açıyor.
- Hediye PRO: alıcıya PRO geldi, hediye edenin listesinde **Sonlandır** çalışıyor.
- Paddle → Transactions → bir işlem → **Refund**: onaylanınca ödeme listesinde iade görünür.

### 10. Canlıya geçiş

Canlı Paddle hesabında 2–5. adımları tekrarla (ürünler, anahtarlar, ödeme bağlantısı, bildirim hedefi canlıda
ayrıdır), Supabase'deki `PADDLE_*` değerlerini canlı değerlerle değiştir ve `PADDLE_ENV`'i sil.

PRO, yenileme tarihine 3 gün ek süreyle verilir; iptalde ödenen dönemin sonuna kadar sürer. Elle ya da Patreon
ile verilmiş daha uzun bir süre varsa abonelik onu kısaltmaz. Ödeme yenilenemezse (past_due) Paddle birkaç gün
yeniden dener; bu sırada PRO ödenen dönemin sonuna (+3 gün) kadar sürer.

## Eski: Lemon Squeezy (mevcut aboneler için)

Paddle kurulduktan sonra yeni ödemeler Paddle'dan alınır (`PADDLE_API_KEY` tanımlı olduğu sürece `pro-checkout` ve
`ads-checkout` Lemon'u kullanmaz). Var olan Lemon abonelikleri kendi mağazalarında yenilenmeye devam eder; son
Lemon aboneliği bitene kadar `LEMON_*` gizli değerlerini, Lemon webhook'unu ve mağazayı silme. Aşağıdaki adımlar
yalnızca Lemon'u yeniden kurmak gerekirse içindir.


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
2. Paddle kurulumundaki **SRTR Pitwall reklamı** ürünü (`PADDLE_AD_PRODUCT_ID`) ve `ads-checkout` fonksiyonu
   (Verify JWT kapalı) yeterli; tutar her ödemede sunucuda hesaplanıp bu ödemeye özel fiyat olarak gönderilir.
   Reklam ödemesi de `pro-webhook?source=paddle` bildirimiyle (`transaction.completed`) işlenir.
3. Yönetim → **Reklamlar**: fiyatları (1.000 gösterim / günlük) gir ve **Reklamlar açık**'ı işaretle.

Kullanıcılar reklamı sağ tıklayıp raporlar; **rapor sınırına** ulaşan reklam gizlenir, yöneticilere bildirim + e-posta
gider. Reddettiğin ödenmiş reklamlar için iadeyi Paddle'dan yap (Transactions → işlem → Refund); iade onaylanınca
(`adjustment.updated`) reklam durur ve ödeme listesinde iade görünür.
