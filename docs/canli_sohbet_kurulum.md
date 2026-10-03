# Canlı Sohbet — "Sohbete yaz" kurulumu (yönetici için)

Canlı Sohbet'te **okuma** (YouTube / Twitch / Kick sohbetini görmek), moderasyon, anket, sesli okuma ve
konuşma → yazı **hiçbir kurulum gerektirmez**. Bu belge sadece üyelerin kendi hesaplarıyla **sohbete yazabilmesi**
(Canlı Sohbet › Sohbete yaz) için SRTR Pitwall adına bir kez yapılacak işleri anlatır.

Özet:

| Platform | Ne oluşturulur | Programa / yönetime ne girilir | Supabase secret |
|---|---|---|---|
| Twitch  | Twitch geliştirici uygulaması (**Public** istemci) | Client ID → Yönetim › Canlı Sohbet ayarları | yok |
| YouTube | Google Cloud projesi + OAuth istemcisi (**Masaüstü uygulaması**) | Client ID → Yönetim › Canlı Sohbet ayarları | `YT_CLIENT_ID`, `YT_CLIENT_SECRET` |
| Kick    | Kick geliştirici uygulaması | Client ID → Yönetim › Canlı Sohbet ayarları | `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` |

> Gizli anahtarlar (client secret) **asla** programa, ayar dosyasına, veritabanına ya da Yönetim paneline yazılmaz.
> Sadece Supabase › Edge Functions › Secrets'a girilir; onları sadece `chat-oauth` sunucu işlevi kullanır.
> Yönetim panelindeki alanlar yalnızca herkese açık **Client ID**'ler içindir.

## Kısa kontrol listesi ("Hesabı bağla" bağlanmıyorsa önce buna bak)

Gizli değerleri (client secret) **yönetici**, **yalnızca Supabase**'e girer; programa / Yönetim paneline girilmez.

| | YouTube (Google) | Kick |
|---|---|---|
| Uygulama türü | OAuth client: **Desktop app (Masaüstü uygulaması)** | Kick Developer uygulaması |
| Kayıtlı dönüş adresi | Desktop app'te girilmez. İstemci "Web application" ise **birebir** `http://127.0.0.1:8767/callback` eklenmeli | **birebir** `http://localhost:8767/callback` (`127.0.0.1` değil, sonda `/` yok, `https` değil) |
| İzinler (scope) | `https://www.googleapis.com/auth/youtube.force-ssl` (izin ekranında / Data access'te ekli) | `user:read`, `channel:read`, `chat:write` (uygulamada işaretli) |
| Ek koşul | **YouTube Data API v3** etkin; uygulama "Testing" ise giriş yapacak Google hesabı **Test users** listesinde | Hesapta 2FA açık |
| Yönetim › Canlı Sohbet ayarları | Client ID | Client ID |
| Supabase › Edge Functions › Secrets (ad) | `YT_CLIENT_ID`, `YT_CLIENT_SECRET` | `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` |

- Yönetim'deki Client ID ile Supabase'deki `*_CLIENT_ID` **aynı uygulamanın** kimliği olmalı (Client ID ve secret aynı istemciden).
- `chat-oauth` işlevi yayınlanmış ve güncel olmalı; **Verify JWT kapalı** (işlev oturumu kendi içinde doğrular).
- Üye SRTR Pitwall hesabına **giriş yapmış** olmalı (YouTube / Kick anahtar değişimi sunucudan geçer). Twitch için gerekmez.
- Program girişte `127.0.0.1:8767` (ve `[::1]:8767`) adresini dinler; port doluysa YouTube için 8768 / 8769 denenir, Kick'te yedek yoktur.
- Sorun sürerse: Canlı Sohbet › Sohbete yaz › **Bağlantıyı test et**, ardından **Günlüğü kopyala** → çıkan metni destek ekibine yapıştır
  (adım adları, HTTP kodları ve sağlayıcı hata kodları vardır; anahtar / kod içermez).
- YouTube'da "bağlı" olmak için yayının açık olması gerekmez; mesaj **gönderirken** kanalın canlı yayını ve etkin sohbeti olmalı
  (yoksa "YouTube yayını şu an canlı değil" denir, hesap bağlı kalır).

---

## 0. Önce: veritabanı ve sunucu işlevi

1. Supabase › SQL Editor'da `supabase/c43_guncelleme.sql` dosyasını çalıştır
   (app_config'e `livechat_twitch_client_id`, `livechat_youtube_client_id`, `livechat_kick_client_id` sütunlarını ekler).
2. `chat-oauth` işlevini yayınla — diğer SRTR işlevleri gibi **Verify JWT KAPALI**:

   ```bash
   supabase functions deploy chat-oauth --no-verify-jwt --project-ref <proje-kimliği>
   ```

   Panelden yayınlıyorsan: Edge Functions › chat-oauth › Details › **Enforce JWT Verification / Verify JWT: kapalı**.
   İşlev oturumu **kendi içinde** doğrular (gelen oturum anahtarını Supabase Auth'a sorar); giriş yapmamış biri ya da
   herkese açık anahtarla çağrılamaz. Ayar açık bırakılırsa ve proje yeni imzalama anahtarlarını kullanıyorsa ağ geçidi
   geçerli oturumu "Invalid JWT" (HTTP 401) diye reddedebilir; programda bu "Supabase ağ geçidi oturum anahtarını reddetti" diye görünür.
3. Secrets'ı aşağıdaki adımlarda oluşturduğun değerlerle gir (Supabase › Edge Functions › **Secrets** ya da):

   ```bash
   supabase secrets set YT_CLIENT_ID=... YT_CLIENT_SECRET=... KICK_CLIENT_ID=... KICK_CLIENT_SECRET=... --project-ref <proje-kimliği>
   ```

   Secret değiştirince işlevi yeniden yayınlamak gerekmez.

---

## 1. Twitch (gizli anahtar gerekmez)

Twitch girişi "Device Code Flow" ile olur: program ekranda bir kod gösterir, üye twitch.tv/activate sayfasında kodu girer.
Bu akışta gizli anahtar kullanılmaz.

1. https://dev.twitch.tv/console/apps/create adresine SRTR hesabıyla gir (Twitch hesabında iki adımlı doğrulama açık olmalı).
2. **Name:** `SRTR Pitwall` (benzersiz olmalı; alınmışsa `SRTR Pitwall Chat` gibi).
3. **OAuth Redirect URLs:** `http://localhost` (cihaz kodu akışı kullanmaz ama alan zorunlu).
4. **Category:** `Chat Bot` (ya da `Application Integration`).
5. **Client Type:** **Public** ← önemli (cihaz kodu akışı ve gizli anahtarsız yenileme için).
6. Kaydet, uygulamayı aç ve **Client ID**'yi kopyala.
7. SRTR Pitwall › **Yönetim › Canlı Sohbet ayarları › Twitch Client ID** alanına yapıştır, **Kaydet**.

Programın istediği izinler: `user:read:chat`, `user:write:chat` (mesaj Helix `POST /helix/chat/messages` ile gönderilir).

---

## 2. YouTube (Google Cloud)

1. https://console.cloud.google.com/ › yeni proje: `SRTR Pitwall`.
2. **APIs & Services › Library** › **YouTube Data API v3** › **Enable**.
3. **APIs & Services › OAuth consent screen** (Google Auth Platform):
   - User type: **External**
   - Uygulama adı: `SRTR Pitwall`, destek e-postası, logo (isteğe bağlı), ana sayfa: `https://www.simracetr.com`,
     gizlilik politikası adresi.
   - **Scopes / Data access:** `https://www.googleapis.com/auth/youtube.force-ssl` ekle.
   - Yayınlama durumu: test aşamasındayken sadece **Test users** listesine eklenen Google hesapları giriş yapabilir.
     Herkese açmak için **Publish app** de; `youtube.force-ssl` hassas bir izin olduğu için Google **doğrulama** ister
     (birkaç gün–hafta; uygulamanın nasıl kullandığını anlatan kısa bir video ister).
4. **APIs & Services › Credentials › Create credentials › OAuth client ID**
   - Application type: **Desktop app** ← önemli
   - Name: `SRTR Pitwall`
   - Masaüstü istemcisinde yönlendirme adresi girilmez; program `http://127.0.0.1:8767/callback` adresini kullanır
     (Google masaüstü istemcilerinde her loopback adresini kabul eder).
5. Oluşan **Client ID** ve **Client secret**'i kopyala.
   - Client ID → Yönetim › Canlı Sohbet ayarları › **YouTube (Google) OAuth Client ID** ve Supabase secret `YT_CLIENT_ID`
   - Client secret → **sadece** Supabase secret `YT_CLIENT_SECRET`
6. **Kota:** YouTube Data API günlük 10.000 birim verir; her gönderilen sohbet mesajı ~50 birim (+ yayının sohbet kimliği
   bir kez ~1 birim) → tüm üyeler toplamı günde yaklaşık **200 mesaj**. Kullanım artarsa Google Cloud › APIs › YouTube Data API v3 ›
   Quotas üzerinden artış başvurusu yap. Kota dolunca programda "YouTube günlük mesaj kotası doldu" görünür.

---

## 3. Kick

1. Kick hesabında **iki adımlı doğrulama (2FA)** açık olmalı.
2. https://kick.com/settings/developer › **Create App**.
3. **App name:** `SRTR Pitwall`, açıklama, logo (isteğe bağlı).
4. **Redirect URL:** `http://localhost:8767/callback` ← birebir aynı yazılmalı.
5. **Scopes:** `user:read`, `channel:read`, `chat:write`.
6. Kaydet; **Client ID** ve **Client Secret**'i kopyala.
   - Client ID → Yönetim › Canlı Sohbet ayarları › **Kick Client ID** ve Supabase secret `KICK_CLIENT_ID`
   - Client Secret → **sadece** Supabase secret `KICK_CLIENT_SECRET`

Mesajlar `POST https://api.kick.com/public/v1/chat` ile gönderilir (OAuth 2.1 + PKCE).

---

## 4. Kontrol

1. Programı aç, SRTR Pitwall hesabıyla giriş yap (YouTube/Kick bağlamak için gerekli), PRO olmayan bir hesapta
   "Sohbete yazma" PRO'ya ayrılmışsa önce PRO özellikleri ayarına bak (Yönetim › PRO özellikleri › Canlı Sohbet).
2. Canlı Sohbet › **Kanallar**: kendi kanalını ekle ve ★ ile "benim kanalım" yap, **Başlat**.
3. Canlı Sohbet › **Sohbete yaz**: her platformda durum "Yönetici ayarı eksik" yerine "Bağlı değil" görünmeli.
   **Hesabı bağla** → tarayıcıda izin ver → "Bağlı".
4. Canlı Sohbet › **Sohbet**: alttaki kutuya yazıp gönder; mesaj platformda ve programın sohbet akışında görünür.

Sorun giderme:

| Görülen | Neden / çözüm |
|---|---|
| "Yönetici ayarı eksik" | İlgili Client ID Yönetim'de boş. |
| "Sunucu işlevi (chat-oauth) kurulmamış" | İşlev yayınlanmamış (404). Adım 0.2. |
| "YouTube girişi sunucuda yapılandırılmadı" | `YT_CLIENT_ID` / `YT_CLIENT_SECRET` secret'ları eksik. |
| Google "Access blocked / app not verified" | Uygulama test aşamasında: hesabı Test users'a ekle ya da doğrulamayı tamamla. |
| Kick "redirect_uri mismatch" | Kick uygulamasındaki adres tam olarak `http://localhost:8767/callback` olmalı. |
| "Yerel giriş adresi (127.0.0.1:8767) açılamadı" | Başka bir program 8767 portunu kullanıyor (ör. eski MultiChatOverlay açık); kapatıp tekrar dene. |
| "Supabase ağ geçidi oturum anahtarını reddetti" (HTTP 401, Invalid JWT) | chat-oauth'ta Verify JWT açık: kapat (Adım 0.2). |
| "Client ID ile Supabase secret … aynı değil" | Yönetim'deki Client ID ile `YT_CLIENT_ID` / `KICK_CLIENT_ID` farklı uygulamaya ait. |
| "… HTTP 400: invalid_client" / "unauthorized_client" | Supabase'deki `*_CLIENT_SECRET` bu Client ID'ye ait değil (ya da yenilenmiş). |
| "… HTTP 400: invalid_grant" | Kod kullanılmış / süresi dolmuş ya da dönüş adresi uyuşmuyor: yeniden "Hesabı bağla". |
| Google "Error 400: redirect_uri_mismatch" | İstemci "Web application": ya Desktop app istemcisi oluştur ya da `http://127.0.0.1:8767/callback` adresini ekle. |
| "Giriş 5 dakika içinde tamamlanmadı" | Tarayıcı izin ekranı yerine sağlayıcının hata sayfasını gösterdi ya da sekme kapatıldı. Tarayıcı hiç açılmadıysa kartta "Bağlantıyı kopyala". |
| "YouTube Data API v3 … etkin değil" | Google Cloud projesinde API etkinleştirilmemiş (Adım 2.2). |
| "Bu Google hesabının YouTube kanalı yok" | İzin ekranında kanalı olan hesap / marka hesabı seçilmeli. |
| Twitch "Kodun süresi doldu" | twitch.tv/activate'te kodu 30 dk içinde gir; tekrar "Hesabı bağla". |

---

## Güvenlik notları

- Üyelerin oturum anahtarları (access / refresh token) sadece kendi bilgisayarlarında,
  `%APPDATA%\<uygulama>\livechat_secrets.json` içinde **Windows DPAPI** ile (Windows hesabına bağlı) şifreli saklanır;
  ayar dosyasına, buluta ya da yerel web sunucusuna (OBS / ağ) hiç gitmez. Streamlabs Socket API Token'ı da aynı dosyadadır.
- `chat-oauth` işlevi anahtarları saklamaz ve kaydetmez; sadece kod → anahtar değişimini ve yenilemeyi gizli anahtarı ekleyerek
  sağlayıcıya iletir. Sadece programın yerel dönüş adreslerine (`127.0.0.1:8767` / `localhost:8767`; YouTube yedeği `127.0.0.1:8768`, `:8769`) verilen kodları kabul eder.
- Bir üye "Bağlantıyı kes" deyince yerel kayıt silinir; Twitch ve Google anahtarları sağlayıcıda da iptal edilir.
