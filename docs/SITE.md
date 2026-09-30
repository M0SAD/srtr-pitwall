# Web sitesi (website/)

Tanıtım, fiyatlar, üyelik (kayıt / giriş / şifre sıfırlama), hesap sayfası ve yönetim paneli. Programla aynı
Supabase hesaplarını kullanır: sitede açılan hesapla programa da giriş yapılır, PRO her iki yerde görünür.

| Sayfa | İçerik |
|---|---|
| `index.html` | Özellikler, ücretsiz/PRO karşılaştırması, fiyatlar (Yönetim → Planlar ve fiyatlar'dan gelir), SSS, indirme |
| `hesap.html` | Giriş / kayıt (e-postadaki 6 haneli kodla), PRO durumu ve kalan gün, satın alma, abonelik yönetimi, ödeme geçmişi, profil |
| `yonetim.html` | Sadece yöneticiler: özet (gelir, ödeme, abonelik, PRO, yeni üye, ziyaretçi, indirme, program kullanımı, grafikler), satışlar (CSV), abonelikler, üyeler (PRO süresi ver/uzat/al + geçmiş), süre geçmişi, cihaz uyarıları, planlar ve fiyatlar |

Derleme gerekmez; düz HTML/CSS/JS. `assets/vendor/supabase.js` paketlenmiş supabase-js 2'dir.

## Yayınlama (GitHub Pages, ücretsiz)

1. GitHub'da depo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Değişiklikleri push et. **Actions → Web sitesi** iş akışı siteyi yayınlar.
3. Adres: `https://m0sad.github.io/srtr-pitwall/`

### Kendi alan adın (pitwall.simracetr.com)

1. Alan adının DNS paneline **CNAME** kaydı ekle: ad `pitwall`, değer `m0sad.github.io`.
2. GitHub → Settings → Pages → **Custom domain**: `pitwall.simracetr.com` → Save. DNS oturunca **Enforce HTTPS**'i aç.

## Supabase

Veritabanı kısmı `supabase/schema.sql` içinde (ödemeler, PRO süre geçmişi, site ziyaretleri ve `admin_*`
fonksiyonları). Ödemelerin gelir istatistiğine düşmesi için Lemon Squeezy webhook'unda
`subscription_payment_success` ve `subscription_payment_refunded` olayları da seçili olmalı (docs/PRO.md).

Ziyaret sayacı kişisel veri toplamaz: tarayıcıda rastgele bir kimlik tutulur, aynı sayfa 30 dakikada bir sayılır.

## Dil ve bölgesel fiyat

- Site 15 dilde (programla aynı). Dil sırası: ziyaretçinin seçimi → tarayıcı dili → saat dilimi → İngilizce.
  Türkçe/İngilizce metinler `assets/*.js` içinde, diğer diller `assets/lang/<kod>.json`. Deneme: `?lang=de`.
- Türkiye saat diliminden girenler Türkiye (TL) fiyatını ve bağlantısını görür (yönetimde girildiyse), diğerleri
  genel fiyatı. Deneme: `?region=tr` / `?region=intl` (tarayıcıda hatırlanır).
- Lemon Squeezy'de TL fiyatı için aynı üründe ayrı varyantlar (ör. "1 aylık – Türkiye") oluşturup bağlantılarını
  Türkiye alanlarına yapıştır.
