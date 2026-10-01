# VR kurulumu

SRTR Pitwall overlay'leri normalde oyunun üstünde duran, ekranı kaplayan şeffaf bir pencerede çizilir. VR gözlüğünde
masaüstü pencereleri görünmediği için overlay'leri gözlüğün içine bir **pencere yakalama aracı** taşır:
OpenKneeboard, OVR Toolkit, Desktop+ ya da XSOverlay. **VR modu** overlay'leri bu araçların yakalayabileceği
sıradan pencerelerde de açar.

> Yerel SteamVR (OpenVR) overlay'i **yoktur**. Bunun için `openvr_api.dll` ve webview karelerinin doku olarak
> SteamVR'a gönderilmesi gerekir; test edilemeden eklenmedi. Aşağıdaki araçlardan biri gerekir.

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

- Yerel OpenVR/OpenXR overlay'i yok; bir pencere yakalama aracı gerekir.
- *Masaüstü dışı* yerleşim deneysel: bazı araçlar ekran dışındaki pencereyi listelemeyebilir.
- Saydam pencerenin alfa kanalının alınması araca ve ekran kartı sürücüsüne bağlıdır; emin olmak için opak arka plan kullan.
- VR pencerelerinde düzenleme modu yoktur; overlay ayarları panelden yapılır.
