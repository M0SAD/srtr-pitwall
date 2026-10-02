# VR kurulumu

SRTR Pitwall overlay'leri normalde oyunun üstünde duran, ekranı kaplayan şeffaf bir pencerede çizilir. VR gözlüğünde
masaüstü pencereleri görünmediği için overlay'leri gözlüğün içine bir **pencere yakalama aracı** taşır:
OpenKneeboard, OVR Toolkit, Desktop+ ya da XSOverlay. **VR modu** overlay'leri bu araçların yakalayabileceği
sıradan pencerelerde de açar.

> SteamVR kullanıyorsan pencere yakalama aracına gerek kalmadan **Yerel VR (deneysel)** bölümünü de
> deneyebilirsin (bu sayfanın sonunda). Deneysel olduğu için asıl önerilen yol hâlâ aşağıdaki araçlardır.

## 1. VR modunu aç

**Ayarlar → VR**:

| Ayar | Ne yapar |
|---|---|
| **VR modu** | Açık overlay'ler ayrı pencerelerde de gösterilir. Normal overlay olduğu gibi çalışır. |
| **VR pencereleri** | *Ayrı pencereler*: her overlay kendi penceresinde, başlığı `SRTR Pitwall - <Overlay adı>` (ör. `SRTR Pitwall - Relative`), boyutu içeriği kadar. *VR panosu*: tüm düzen tek pencerede, başlığı `SRTR Pitwall - VR Panosu`, boyutu overlay monitörü kadar. *İkisi de*. |
| **VR arka planı** | *Saydam* (alfa kanalını alabilen araçlar), *Siyah*, *Yeşil* (chroma key), *Özel renk*. Varsayılan: Siyah. |
| **Pencerelerin yeri** | *Monitörde*: seçilen monitörde üst üste dizilir. *Masaüstü dışı*: ekranların sağındaki görünmeyen alana konur (deneysel). |
| **VR pencerelerinin monitörü** | Oyunun ayna penceresinin olmadığı monitörü seç. |
| **Masaüstü overlay'ini gizle** | Ekranı kaplayan normal overlay penceresi gösterilmez (düzenleme modunda yine görünür). |

Sonra **uygulamayı bir kez yeniden başlat**. VR modu açıkken WebView2 şu ayarlarla başlar; bunlar pencereler oyunun
arkasında ya da ekran dışında kalınca çizimin durmasını engeller ve sadece açılışta uygulanabilir:

```
--disable-features=…,CalculateNativeWinOcclusion
--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling
```

VR pencereleri normal overlay penceresinden şu yönlerle ayrılır (yakalama araçları bu yüzden onları görür):

- görev çubuğunda ve Alt+Tab'da görünür (normal overlay görünmez),
- "her zaman üstte" değildir ve tıklamaları geçirmez (`WS_EX_TRANSPARENT` / `WS_EX_LAYERED` yok),
- arka plan opaksa pencere de opaktır (saydam pencere yakalayamayan araçlar için),
- her birinin ayrı ve sabit bir başlığı vardır.

Ayrı pencereler **etkin düzendeki** açık overlay'ler için açılır; overlay açıp kapattığında pencere de açılıp kapanır.
Overlay'in adını değiştirirsen ya da uygulama dilini değiştirirsen pencere başlığı da değişir; yakalama aracında
pencereyi yeniden seçmen gerekir. VR panosu, düzen kurallarına göre o an gösterilen düzeni ve overlay monitöründeki
overlay'leri gösterir. Pencereleri oyun kapalıyken görmek için **Demo**'yu aç.

## 2. OpenKneeboard (önerilen, ücretsiz)

1. OpenKneeboard'u kur ve aç. iRacing OpenXR ile çalışıyorsa ek ayar gerekmez; SteamVR/OpenVR kullanıyorsan
   *Settings → VR* bölümünden SteamVR desteğini aç.
2. *Settings → Tabs → Add a tab → Window Capture*.
3. Listeden `SRTR Pitwall - VR Panosu` ya da tek bir overlay penceresini seç.
4. Pencere eşleştirmede başlığın tam eşleşmesini (*Exact title*) seç; SRTR Pitwall her açıldığında pencere
   kendiliğinden bulunur.
5. *Capture client area only* açık, imleç yakalama kapalı olsun.
6. *Settings → VR* bölümünden panonun konumunu, boyutunu ve opaklığını ayarla. Birden fazla overlay'i ayrı yerlere
   koymak için her biri için ayrı bir *View* ekle.

VR arka planı: önce **Saydam** dene; siyah ya da bozuk görünürse **Siyah** seçip OpenKneeboard'da opaklığı düşür.

## 3. OVR Toolkit (Steam, ücretli)

1. SteamVR açıkken OVR Toolkit'i başlat.
2. Bilek menüsünden yeni bir pencere ekle, kaynak olarak `SRTR Pitwall - …` penceresini seç (*Window capture*).
3. Pencereyi dünyaya ya da kokpite sabitle, boyutunu ve opaklığını ayarla.
4. Saydam görünmüyorsa VR arka planını **Yeşil** yap ve pencere ayarlarından *Chroma key*'i aç; ya da **Siyah**
   bırakıp opaklığı düşür.

## 4. Desktop+ (Steam, ücretsiz)

1. SteamVR açıkken Desktop+'ı başlat, *Add Overlay → Window*.
2. Yakalama kaynağı: *Graphics Capture*, pencere: `SRTR Pitwall - …`.
3. Konumu *Playspace* ya da *Seated* olarak sabitle; genişliği ve eğriliği ayarla.
4. Güncelleme hızını 30 FPS ile sınırla.

XSOverlay'de de aynı mantık geçerlidir: pencere yakalama kaynağı olarak `SRTR Pitwall - …` penceresi seçilir.

## 5. Önerilen boyutlar

| Overlay | Gözlükteki genişlik | Yer |
|---|---|---|
| Relative, Sıralama | 35–45 cm | direksiyonun sol ya da sağ üstü |
| Yakıt, Delta, Girdiler | 20–30 cm | gösterge panelinin üstü |
| Radar | 15–20 cm | bakış alanının alt ortası |
| Sesli Mühendis altyazısı | 40–50 cm | bakış alanının altı |

Yazılar küçük kalıyorsa pencereyi gözlükte büyütmek yerine **Görünüm** sayfasından yazı boyutunu artır: yakalanan
görüntü daha net olur.

## 6. Performans ipuçları

- Tek tek pencereler yerine **VR panosu** daha az kaynak kullanır (tek yakalama); ama gözlükte tek parça durur.
- *Ayarlar → Performans*: telemetri hızını 30 Hz yap, **Görsel efektleri azalt**'ı aç.
- Yakalama aracında kare hızını 30 FPS ile sınırla.
- Kullanmadığın overlay'leri kapat: her açık overlay ayrı bir pencere ve ayrı bir yakalamadır.
- Sadece VR'da sürüyorsan **Masaüstü overlay'ini gizle**'yi aç: ekranı kaplayan şeffaf pencere hiç çizilmez.

## 7. Sorun giderme

| Sorun | Çözüm |
|---|---|
| Pencere yakalama aracının listesinde yok | VR modu açık mı, overlay açık mı (etkin düzende)? Pencere yeri *Monitörde* olsun. |
| Görüntü donuyor / oyun öndeyken güncellenmiyor | Uygulamayı VR modu açıkken yeniden başlat. Pencere yeri *Monitörde* olsun, pencereyi küçültme (minimize). |
| Arka plan siyah / saydam değil | VR arka planını *Siyah* ya da *Yeşil* yap; araçta opaklık ya da chroma key kullan. |
| Pencere boş | Overlay o an veri göstermiyor olabilir (oyun kapalı). Demo'yu aç. |
| Uygulama yeniden açılınca araç pencereyi bulamıyor | Araçta eşleştirmeyi pencere başlığına göre yap; overlay adını ve uygulama dilini değiştirme. |

## Bilinen sınırlar

- Yerel VR (aşağıda) deneyseldir ve sadece SteamVR'da çalışır; OpenXR API katmanı yoktur.
- *Masaüstü dışı* yerleşim deneysel: bazı araçlar ekran dışındaki pencereyi listelemeyebilir.
- Saydam pencerenin alfa kanalının alınması araca ve ekran kartı sürücüsüne bağlıdır; emin olmak için opak arka plan kullan.
- VR pencerelerinde düzenleme modu yoktur; overlay ayarları panelden yapılır.

## Yerel VR (deneysel)

**Ayarlar → VR → Yerel VR (SteamVR) — deneysel**. Overlay'leri pencere yakalama aracı olmadan doğrudan SteamVR'a
overlay olarak gönderir (OpenVR `IVROverlay`).

**Ne zaman çalışır:** etkin VR çalışma zamanı SteamVR olduğunda; OpenXR kullanan oyunlar SteamVR üzerinden
çalışıyorsa da çalışır. Oculus / Windows Mixed Reality'nin kendi çalışma zamanında (oyun SteamVR'sız açıldığında)
çalışmaz; o durumda yukarıdaki VR modu + pencere yakalama aracı kullanılır. OpenXR API katmanı kapsam dışıdır.

### Kullanım

1. SteamVR'ı ve gözlüğü hazırla, göstermek istediğin overlay'leri Overlay'ler sayfasından aç.
2. **Başlat**'a bas (SteamVR kapalıysa açılır). Durum satırı `Çalışıyor (N overlay)` olmalı.
3. İlk kullanımdan sonra **uygulamayı bir kez yeniden başlat**: pencerelerin oyunun arkasında kalınca da çizmesini
   sağlayan WebView2 ayarı açılışta uygulanır; yoksa gözlükteki görüntü donabilir.
4. Overlay'leri **Overlay yerleşimi** altındaki kaydırıcılarla ya da yapılandırma moduyla yerleştir.

| Durum | Anlamı |
|---|---|
| openvr_api.dll bulunamadı | Kurulum eksik; uygulamayı yeniden kur. |
| SteamVR kurulu değil | SteamVR'ı Steam'den kur. |
| Gözlük yok | SteamVR bir gözlük bulamadı; gözlüğü bağla / Link, Virtual Desktop vb. bağlantıyı aç. |
| Hazır, başlatılmadı | Başlat'a basılabilir. |
| SteamVR bekleniyor | Otomatik başlatma açık; SteamVR çalışana kadar 10 saniyede bir denenir. |
| Çalışıyor (N overlay) | N overlay gözlüğe gönderiliyor. |
| Hata: … | SteamVR'ın bildirdiği hata; ayrıntı VR günlüğünde. |

| Ayar | Ne yapar |
|---|---|
| **Sim bağlanınca otomatik başlat** | Oyuna girince başlar, çıkınca durur. SteamVR'ı kendisi açmaz. |
| **Masaüstünde de göster** | Kapalıyken yerel VR çalıştığı sürece ekranı kaplayan normal overlay gizlenir. |
| **Overlay'leri ters çevir** | Overlay'leri 180° döndürür (baş aşağı görünüyorsa). |
| **Kare hızı** | 10 / 15 / 30; her overlay saniyede bu kadar kez yakalanır (varsayılan 15). |
| **Saydamlık yöntemi** | *Saydam (anahtar renk)*: VR arka plan rengi (varsayılan siyah) saydam yapılır. *Opak*: arka plan kalır. |
| **İzleme başlangıcı** | *Oturarak* (SteamVR oturma sıfırlamasına göre, varsayılan) ya da *Ayakta* (oda merkezine göre). |
| **VR günlüğü** | Son satırlar panelde görünür; "Günlüğü dosyaya da yaz" açıksa uygulama veri klasöründeki `vr_native.log` dosyasına da yazılır. |

### Overlay yerleşimi

Her overlay için: sağ/sol (x), yukarı/aşağı (y), uzaklık (z) metre; yatay dönüş (yaw), dikey eğim (pitch) derece;
genişlik (metre), eğrilik, opaklık, **Bana dön** (sabit uzaklıkta hep sana döner) ve **Bakış modu** (sadece bakınca
120 ms'de belirir). Varsayılan: yaklaşık 1,2 m önde, yay şeklinde. Değişiklikler anında uygulanır ve yarım saniye
sonra kaydedilir. **Sıfırla** varsayılana döndürür.

### Yapılandırma modu (kısayollar ve fare)

Kısayollar yalnız yerel VR çalışırken kaydedilir; tek tuşlu olanlar yalnız yapılandırma modu açıkken
(Ayarlar → Kısayollar'dan değiştirilebilir):

| Tuş | İşlev |
|---|---|
| F9 | Yapılandırma modunu aç / kapat |
| End | Ortala (overlay'leri baktığın yöne al) |
| Space | Sonraki overlay |
| M | Konum / ayar modu |
| F10 | Şimdi kaydet |
| Home | Seçili overlay'i sıfırla |
| F | Bana dön |
| G | Bakış modu |

Yapılandırma modunda seçili overlay renklenir (konum modu yeşil, ayar modu turuncu) ve masaüstü faresiyle düzenlenir:

- **Konum modu:** sol sürükle = sağ/sol ve yukarı/aşağı, sağ sürükle = uzaklık.
- **Ayar modu:** sol sürükle = boyut, sağ sürükle = döndür (ilk hareket edilen eksene kilitlenir; Shift = yatay,
  Ctrl = dikey), orta sürükle = eğrilik, tekerlek = opaklık.

> Yapılandırma modu açıkken SRTR Pitwall pencereleri dışındaki fare tıklamaları ve tekerlek diğer programlara
> **gitmez**. Mod 3 dakika dokunulmazsa kendiliğinden kapanır; F9 ya da paneldeki düğmeyle hemen kapatılır.

### Bilinen sınırlar (yerel VR)

- Deneyseldir; gerçek donanımda sınırlı denenmiştir. Sorun olursa **Durdur**'a bas ve VR günlüğünü gönder.
- Kareler pencereden kopyalanır (`PrintWindow`), GPU dokusu paylaşılmaz: 30 kare/sn üstü yoktur ve çok sayıda
  büyük overlay işlemciyi yorar.
- Saydamlık anahtar renkle yapılır: yarı saydam paneller gözlükte opak görünür, overlay içindeki arka plan rengiyle
  aynı (varsayılan tam siyah) pikseller de saydamlaşır. Gerekirse VR arka planını başka bir renge çevir ya da *Opak* seç.
- Overlay'ler kokpitin önünde çizilir (derinlik / kokpit örtmesi yok).
- OpenVR SDK v2.5.1 (`IVRSystem_022`, `IVROverlay_027`) kullanılır; çok eski SteamVR sürümlerinde "SteamVR'ı güncelle"
  hatası verir. `openvr_api.dll` uygulamayla birlikte gelir (BSD-3, Valve).
