# Ses Odaları kurulumu (bir kez, yönetici)

Ses odalarında konuşmalar Supabase'den geçmez. Ses, Cloudflare Realtime SFU üzerinden canlı akar ve kaydedilmez. Supabase'de yalnızca oda bilgisi, yetkiler ve söz hakkı (süre, sıra) tutulur; bunlar birkaç KB'lık satırlardır.

## Maliyet

- Cloudflare Realtime: ayda ilk **1000 GB ücretsiz** (TURN ile ortak), sonrası 0,05 $/GB. Yalnızca Cloudflare'den kullanıcılara giden ses sayılır, gönderilen ses ücretsizdir.
- Bir konuşmacının sesi ~32 kbps (Opus). Sessizken DTX sayesinde neredeyse hiç veri gitmez.
- **Söz hakkıyla oda**, 40 kişi, aynı anda 1–2 konuşmacı: saatte ~1–2 GB. Ayda 500 saatten fazla turnuva yapılmadıkça ücretsiz kalır.
- **Herkes konuşur** modunda her dinleyici odadaki herkesin sesini çeker. 40 kişide bu, saatte en çok ~20 GB eder; bu yüzden 15 kişiyi aşan odalarda uygulama "Söz hakkıyla" modunu önerir.

## 1. Cloudflare'de SFU uygulaması

1. https://dash.cloudflare.com adresinde ücretsiz bir hesap aç (kart gerekmez).
2. Sol menüden **Realtime › Serverless SFU** aç ve **Create** ile bir uygulama oluştur (ad: `pitwall`).
3. Çıkan **App ID** ve **App Secret** değerlerini bir yere not et. Bu değerleri kimseyle paylaşma, sohbete yapıştırma.

## 2. Supabase gizli değerleri

Supabase › Project Settings › Edge Functions › **Secrets**:

| Ad | Değer |
| --- | --- |
| `CF_REALTIME_APP_ID` | Cloudflare'deki App ID |
| `CF_REALTIME_APP_TOKEN` | Cloudflare'deki App Secret |

## 3. Veritabanı

Supabase › SQL Editor'da `supabase/c116_guncelleme.sql` dosyasını çalıştır. Dosya birden fazla çalıştırılabilir.

## 4. Edge Function

Supabase › Edge Functions › **Deploy a new function** › **Via Editor**:

- Ad: `voice-sfu`
- İçerik: `supabase/functions/voice-sfu/index.ts`
- Function settings: **Verify JWT** kapalı. Oturum fonksiyonun içinde doğrulanır, öteki fonksiyonlarda da böyledir.

## Nasıl çalışır

- Her kullanıcı tek bir WebRTC bağlantısıyla Cloudflare'e bağlanır ve mikrofonunu oraya gönderir.
- Dinleyici yalnızca **konuşma hakkı olanların** sesini çeker. `voice-sfu` bu hakkı her istekte sunucuda denetler (`voice_can_speak`), bu yüzden söz hakkı olmayanın sesi kimseye ulaşmaz.
- Odadakiler listesi Supabase Realtime presence ile tutulur. Söz verme, uzatma ve sıra gibi değişiklikler RPC ile yazılır; odadakiler bir yayın mesajıyla anında yeniler (ayrıca 10 sn'de bir).
- Odada iken panel penceresinin kapatma düğmesi pencereyi gizler, konuşma kopmaz. Tepsiden geri açılır.
- Mikrofon izni: Windows › Gizlilik › Mikrofon › "Masaüstü uygulamalarının mikrofona erişmesine izin ver" açık olmalı. İlk girişte uygulama izin sorabilir.
