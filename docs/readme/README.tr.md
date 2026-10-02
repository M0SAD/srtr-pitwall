<div align="center">

<img src="../images/logo.png" width="96" alt="SRTR Pitwall logosu" />

# SRTR Pitwall

### Hepsi bir arada iRacing yardımcın — overlay'ler, spotter, strateji, yayın ve topluluk tek bir hafif uygulamada.

[English](../../README.md) · **Türkçe** · [Deutsch](README.de.md) · [Español](README.es.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português (BR)](README.pt-BR.md) · [Português (PT)](README.pt-PT.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Svenska](README.sv.md) · [Suomi](README.fi.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[**⬇ En son sürümü indir**](../../../../releases/latest) · [**🌐 pitwall.simracetr.com**](https://pitwall.simracetr.com)

</div>

---

<img src="../images/layout.jpg" alt="Pistte SRTR Pitwall overlay'leri" width="100%" />

## Neden SRTR Pitwall?

Çoğu overlay uygulaması overlay'de kalır. SRTR Pitwall ise sim kokpitin için eksiksiz bir pit duvarı:

- 🏎️ **27 overlay, tek şeffaf pencere** — relative, leaderboard, yakıt, lastikler, radar, pist haritası, delta, pedal/direksiyon girdileri, hava durumu, bayraklar ve daha fazlası. Her monitörde her şey tek pencerede çizilir; dolu bir düzende bile akıcı kalır.
- 🎙️ **Görsel ve sesli spotter** — solda araç / sağda araç, üçlü yan yana, bayrak, yakıt ve pozisyon anonsları Türkçe ses paketiyle; üstüne daha hızlı sınıf ve piste dönüş uyarıları.
- ⛽ **Canlı takım paylaşımlı yakıt stratejisi** — tur başı tüketim, doldurulacak yakıt, pit pencereleri ve takım arkadaşlarının yakıtı canlı olarak kendi overlay'inde.
- 👥 **Güvenilir canlı telemetrili arkadaşlar** — arkadaş ekle, kim çevrimiçi ya da yarışta gör, güvendiğin pilotlar canlı yakıt ve tur verini görsün. Kod yok, kurulum yok.
- 💬 **Yarış içi mesajlaşma** — arkadaşlarından gelen mesajlar sen sürerken sesli bildirimle ekrana düşer. Rahatsız Etmeyin modu, garaja dönene kadar hepsini sessizde tutar.
- 📺 **OBS için yayın düzenleri** — yayına özel ayrı düzenler, hazır sahneler (birazdan başlıyoruz, hemen döneceğim, kapanış, garaj ekranı) ve Twitch sohbet overlay'i.
- 🌍 **Topluluk merkezi** — tüm ayarlarıyla birlikte komple düzenleri, yayın düzenlerini ve renk temalarını paylaş, indir. Puan ver, yorum yap; ayın ve tüm zamanların en iyilerine göz at.
- 📸 **Tek tuşla ekran görüntüsü** — Print Screen, oyunu overlay'lerin *ve* filigranla birlikte yakalar; sonra topluluk galerisinde paylaş.
- 🎨 **Tema motoru** — font, renk, yoğunluk, köşe yuvarlaklığı, opaklık ve boyut tüm overlay'leri tek hamlede değiştirir. Altı hazır tema, üstüne topluluktan temalar.
- 🧩 **Düzen yöneticisi** — araca ve oturuma göre otomatik düzenler, çoklu monitör desteği, hizalama kılavuzları ve gerçek pist arka planları üzerinde canlı önizleme.
- 🔄 **İmzalı otomatik güncellemeler** — yeni sürümler tek tıkla kurulur, imza anahtarımızla doğrulanır.
- 🌐 **15 dil** — English, Türkçe, Deutsch, Español, Français, Italiano, Português, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.

<img src="../images/panel.jpg" alt="SRTR Pitwall kontrol paneli" width="100%" />

## Performans için tasarlandı

GPU'n ve CPU'n simülasyona ait. SRTR Pitwall, **Tauri 2** üzerinde **SolidJS** arayüzüyle **Rust** ile yazıldı:

- Tüm telemetri okuma ve hesaplamalar Rust'ta, tek bir arka plan iş parçacığında çalışır.
- Her overlay yalnızca ihtiyaç duyduğu veriyi, kendi hızında alır. Kapalı overlay'lerin verisi hiç hesaplanmaz.
- iRacing çalışmıyorken overlay penceresi tamamen gizlenir.
- Kontrol panelindeki önizlemeler statik anlık görüntülerdir; sen etkileşime girmedikçe hiç CPU harcamaz.
- Bulanıklık efekti ya da sürekli animasyon yok: hiçbir şey GPU için oyunla yarışmaz.

## Başlarken

1. Kurulum dosyasını [**Releases**](../../../../releases/latest) sayfasından indir ve kur.
2. iRacing'i **kenarlıksız / pencereli tam ekran** modunda çalıştır. Windows, özel tam ekranın üzerinde hiçbir overlay'e izin vermez.
3. iRacing bağlandığında overlay'ler otomatik olarak belirir. iRacing olmadan düzenini tasarlamak için **Demo** anahtarını kullan.

| Kısayol | İşlev |
|---|---|
| `Ctrl` + `Shift` + `E` | Düzeni düzenle (sürükle, boyutlandır, seçenekler için sağ tıkla) |
| `Ctrl` + `Shift` + `D` | Overlay'leri göster / gizle |
| `Ctrl` + `Shift` + `Space` | Kontrol panelini öne getir |
| `Print Screen` | Overlay'lerle ekran görüntüsü al |

Tüm kısayollar **Ayarlar → Kısayollar** bölümünden değiştirilebilir.

## Ücretsiz ve PRO

SRTR Pitwall **hesap olmadan** da eksiksiz çalışır. Ücretsiz bir hesap topluluğu, ayarlarının bulut yedeğini ve arkadaş listesini açar. **PRO** ise premium overlay'leri, sesli yarış mühendisini, güvenilir canlı veri paylaşımını ve arkadaşlara mesaj göndermeyi, topluluk temalarını paylaşıp kullanmayı, topluluk düzenlerini kullanmayı, puanlamayı ve yorumlamayı ekler.

## Topluluk

**Erkin Azcan** tarafından [Sim Race Türkiye](https://www.simracetr.com) topluluğu için geliştirildi.

[YouTube](https://www.youtube.com/@ErkinAzcan) · [Twitch](https://www.twitch.tv/erkinazcan) · [Kick](https://kick.com/erkinazcan) · [Instagram](https://www.instagram.com/erkinazcan) · [Steam](https://steamcommunity.com/id/erkinazcan/)

Bir hata mı buldun ya da aklında bir fikir mi var? Bir [issue](../../../../issues) aç.

---

<sub>Geliştirici belgesi: [docs/GELISTIRME.md](../GELISTIRME.md) · Sürüm notları: [SURUM_NOTLARI.md](../../SURUM_NOTLARI.md)<br/>
iRacing, iRacing.com Motorsport Simulations, LLC'nin ticari markasıdır. SRTR Pitwall'un iRacing ile herhangi bir bağlantısı yoktur ve iRacing tarafından onaylanmamıştır.</sub>
