# SRTR Pitwall sürüm notları

Sürüm biçimi **GGAAYY-NN**: yükseltmenin yapıldığı gün/ay/yıl ve her değişiklikte bir artan sıra numarası.
En yeni sürüm en üstte.

<<<<<<< HEAD
## 021026-51

- **Olaylar penceresi boş açılıyordu:** demo / overlay önizlemesi açılınca gerçek olay listesi siliniyordu; artık saklanır ve geri dönünce kaldığı yerden sürer. Yeni oturum başlayıp henüz olay yokken bir önceki oturumun olayları ("Önceki oturum") gösterilir. Araçtan inip canlı izlerken de olaylar kaydedilmeye devam eder (yalnızca gerçek tekrar izlemede durur).

## 021026-50

- **Overlay ekle:** eklenen overlay hemen ekranda görünür (oyun kapalıyken de, örnek veriyle) ve Overlay'ler sayfasında seçili kaldığı sürece ekranda kalır.
- **Mesajlar overlay'i: sesli okuma (PRO):** "Mesajları sesli oku", "Gönderen adını oku", "En fazla karakter". Canlı sohbet okumasıyla aynı konuşma sırasını kullanır, üst üste konuşmaz; sesli mühendis konuşurken bekler. Yönetim › PRO özellikleri: `social.messages_tts`.
- **Sohbet Anketi ve Altyazı overlay'leri varsayılan PRO** (Yönetim'den değiştirilebilir); "Sürekli göster" ile oyun kapalıyken de çalışır.
- **Sohbet kaydı (PRO):** Canlı Sohbet › Sohbet kaydı sekmesi: gün listesi, kayıtta arama (seçili gün ya da tüm günler), platform / kanal / kullanıcı süzgeci, kullanıcıya tıklayınca tüm mesajları, kopyala / yasakla, TXT ve CSV dışa aktarma, saklama süresi (varsayılan 30 gün) ve "Kayıtları sil". Yönetim: `livechat.log`.
- **"Twitch Sohbeti (eski)" overlay'i kaldırıldı** (kayıtlı düzenlerden sessizce çıkarılır).
- Sohbeti sesli okuma (`livechat.tts`) varsayılan PRO olarak doğrulandı. (c47)
- Yeni metinler 14 dile çevrildi.

## 011026-49

- **Grup sohbeti:** Arkadaşlar listesinde "Gruplar" bölümü. Grup kur, arkadaşlarını ekle, gruptan ayrıl, (sahibiysen) üye çıkar, adını değiştir ya da grubu sil. Sahip ayrılırsa sahiplik en eski üyeye geçer; grupta kimse kalmayınca grup ve mesajları kendiliğinden silinir. Okunmamış sayacı, sessize alma, mesaj raporlama, bildirim. (c45)
- **Sohbet arka planları:** her sohbetin kendi arka planı. Bire bir sohbette arka planı değiştirince sohbete "sohbet arka planını değiştirdi" mesajı düşer; karşı taraf mesaja tıklayıp "Bu arka planı kullan" ile aynısını kullanabilir. Grup ve takım sohbetlerinde arka planı yalnızca grup / takım sahibi değiştirir ve herkese uygulanır. (c45)
- **Yakıt overlay'i:** yalnızca arkadaş verisi varken başlık artık "ARKADAŞLAR"; "TAKIM · ad" sadece takım adı varsa. Ayar adı "Takım yakıtı".
- **Canlı Sohbet düzeltmeleri:**
  - Overlay'in birkaç saniyede bir kaybolup yeniden belirmesi düzeltildi (her veri gelişinde tüm liste yeniden çiziliyordu; örnek veriler her saniye yeniden üretiliyordu).
  - Yeni "Sürekli göster" seçeneği (sohbet, anket, altyazı; varsayılan açık): oyunda değilken, tekrar izlerken ve pist dışında da görünür.
  - İzleyici çubuğu seçiliyken yayın kapalı olsa da görünür (kapalı platformlar "—").
  - Varsayılan kanallar: YouTube @ErkinAzcan, Kick erkinazcan, Twitch erkinazcan (kaldırılınca geri gelmez).
  - Ücretsiz sürüm: istediğin kadar kanal eklenir ama yalnızca en üstteki kanalın mesajları görünür (kanal listesinde bilgi notu). Sesli okuma, altyazı, anket ve sohbete yazma PRO; hepsi Yönetim › PRO özellikleri'nden tek tek yönetilir (c46).
  - Favori (★): platform başına bir kanal; favorilerin izleyici sayısı ücretsiz sürümde de gösterilir.
  - "Otomatik başlat" açıksa program açılınca canlı sohbet başlar; kapalıysa kısayolla başlat / durdur (varsayılan Ctrl+Shift+C, Kısayollar sayfasından değişir).
- Yeni metinler 14 dile çevrildi.

## 011026-48

- **Araç marka logoları:** 46 marka logosu (Cadillac dahil) programa gömüldü. Relative ve Sıralama'da logo sütunu varsayılan olarak açık ve sürücü adının hemen solunda; sabit genişlikli hücrede alt alta hizalı. Koyu logolar (Buick, Ford, Ligier, McLaren, Oreca, Peugeot, Tatuus) açık bir zeminle, Ray beyaza çevrilerek okunur hale getirildi. Mevcut düzenler bir kereliğine güncellenir. iRacing / ACC / LMU / AMS2 araç adları için marka eşleştirme genişletildi.
- **Yeni overlay: Sesli Mühendis:** konuşurken hoparlör simgesi, "Mühendis" / "Spotter" etiketi ve söylenenin altyazısı; konuşma bitince kaybolur. Ayarlar: mühendis/spotter mesajları, ekranda kalma süresi, simge, etiket, yazı boyutu, genişlik, arka plan, hizalama, renkler.
- **VR (Ayarlar › VR):** VR modu ile her overlay ayrı, yakalanabilir bir pencerede ("SRTR Pitwall - <Overlay adı>") ve/veya tek "VR Panosu" penceresinde açılır (OpenKneeboard, OVR Toolkit, Desktop+ için). VR arka planı (saydam / siyah / yeşil / özel), pencere yeri (monitör / masaüstü dışı), masaüstü overlay'ini gizleme, arka planda çizimin durmaması için WebView2 ayarları (yeniden başlatma gerekir) ve adım adım VR kurulum rehberi (docs/vr_kurulum.md). Yerel SteamVR/OpenVR overlay'i bu sürümde yok.
- **Güvenilir arkadaşlar (Ayarlar › Paylaşım):** takım yakıtı / canlı veriyi kod vermeden paylaşma. Arkadaş başına anahtar ya da "Tüm arkadaşlarım"; izleyen tarafta "Arkadaşlarının paylaşımları" listesi (tek tıkla göster/gizle), veri anında gelir. Kodlu (MQTT) akış aynen çalışır; kod arkadaşlara verilmez. (c44)
- **Yönetim: bekleyen iş sayaçları:** Destek, Moderasyon, Ses paketleri, Deneme PRO, Reklamlar ve Cihazlar bölümlerinin yanında ve Yönetim simgesinde bekleyen iş sayısı. (c44: admin_badge_counts)
- **PRO tanıtım mesajı: "Diğer dillere çevir":** Türkçe metni 14 dile makine çevirisiyle (MyMemory, ücretsiz) doldurur; her dil sonradan düzenlenebilir, otomatik kaydetmez.
- "Overlay önizleme arka planları" → "Overlay arka planları".
- Yeni metinler 14 dile çevrildi.

## 011026-47

- **Yeni: Canlı Sohbet (MultiChatOverlay programın içinde):** YouTube, Twitch ve Kick yayın sohbetleri tek akışta. Uygulamada yeni "Canlı Sohbet" sayfası:
  - **Sohbet:** birleşik canlı sohbet (platform simgeleri, emojiler, Süper Chat, abonelik/raid/bağış bildirimleri), platform başına ve toplam izleyici sayısı, kullanıcıyı yasakla / mesajı gizle / kopyala, otomatik kaydırmayı durdur, arama.
  - **Kanallar:** bağlantıları yapıştır (platform otomatik tanınır), sürükleyip sırala, gizle, etiket, ★ kendi kanalım, kanal durumu, başlat / durdur / yeniden bağlan. Ücretsiz sürümde ilk kanal bağlanır.
  - **Moderasyon:** yasaklı kişiler, kelime süzgeci (gizle ya da yıldızla, "kelime*" ile başlayanlar), bağlantı engeli, tekrar eden mesajları gizleme, platformdaki silme/yasakları yansıtma.
  - **Anket:** sohbette sayı yazarak oy (kişi başı ilk oy), 2–9 seçenek, soru, süre, beraberlikte animasyonlu kura; F9 kısayolu.
  - **Sesli okuma:** Windows sesleriyle sohbeti okur; hepsini / sadece !oku komutunu / aboneleri / seçili kişileri okuma, isimleri okuma, sıra sınırları; F5 kısayolu.
  - **Konuşma → yazı:** Mikrofondan Windows konuşma tanımayla altyazı (Altyazı overlay'i ve OBS); küfür süzgeci; F6 kısayolu.
  - **Sohbete yaz:** Twitch, YouTube ve Kick'e programdan mesaj gönderme (hesap bağlama; anahtarlar bilgisayarda şifreli saklanır).
  - **Bildirimler:** Streamlabs bağış, takip, abonelik, bits, raid bildirimleri.
  - **Kayıt:** günlük sohbet kaydı. **OBS:** sohbet, anket ve altyazı tarayıcı kaynağı adresleri.
- **Yeni overlay'ler:** Canlı Sohbet, Anket, Altyazı (oyun açık olmasa da gösterilebilir). Eski "Twitch Sohbeti" overlay'i "(eski)" olarak duruyor.
- **PRO:** Yönetim → PRO özellikleri'nde "Canlı Sohbet" grubu: birden fazla kanal, anket, OBS, sesli okuma, konuşma → yazı, sohbete yaz, bildirimler (varsayılan PRO); tek kanal okuma, moderasyon ve kayıt ücretsiz.
- **Yönetim → Canlı Sohbet ayarları:** Twitch / YouTube / Kick uygulama kimlikleri (kurulum: docs/canli_sohbet_kurulum.md).

## 011026-46

- **3 günlük deneme PRO:** Yeni kayıt olan üyeye ilk girişte 3 günlük PRO verilir ve "Hoş geldin! 3 günlük PRO denemen başladı" penceresi gösterilir (program ve site). Kötüye kullanım denetimi: aynı bilgisayar, aynı tarayıcı, aynı e-posta (gmail nokta/+ hileleri dahil), aynı IP, aynı ağ + aynı tarayıcı izi ya da geçici e-posta servisi ise deneme verilmez; kullanıcıya hiçbir uyarı gösterilmez, normal ücretsiz hesap açılır, yöneticiye bildirim gider. Yönetim → Deneme PRO: açık/kapalı, gün sayısı, tüm talepler (verildi / reddedildi / şüpheli), eşleşen hesaplar, elle PRO ver / geri al.
- **Kısayollar:** Ekran görüntüsü varsayılanı artık F12 (Print Screen / Ctrl+Print Screen kullananlar bir kez F12'ye geçer). Yeni kısayol: sesli mühendisi aç/kapat (Ctrl+Shift+V, yarıştayken). Ayarlar → Kısayollar: uygulamadaki tüm kısayollar, değiştirme, çakışma uyarısı, varsayılana dön, uygulama içi tuşlar listesi.
- **Replay:** Replay izlerken overlay'ler kendiliğinden gizlenir (Genel ayarlardan kapatılabilir). "Yarış bitince Olaylar ekranını aç" (varsayılan açık) replay başlayınca da Olaylar ekranını açar.
- **Telemetri süzgeçleri:** Oyun, pist, araç, oturum türü (yarış, sıralama, antrenman, ısınma, hızlı tur, diğer) ve "Botlarla yarış / Botsuz".
- **Overlay'ler:** Relative'de bayrak sütunu sadece bayrak rengini gösterir (üzerine gelince adı). Lastik basıncı varsayılan psi. Relative'in sütunları da Sıralama gibi sıralanabilir listede; "Lastik" (kuru/ıslak/bileşik) ve "Bayrak" sütunları orada. Pedallar & Girdiler'de ABS/TC göstergesi varsayılan "İkisi". Data Frame → "Veri Kutusu"; birden fazla eklenebilir (aynı overlay'den birden fazla ekleme kapalı olsa bile).
- **Kuponlar:** PRO'da indirim artık Lemon indirim koduyla uygulanır, abonelik fiyatı tam fiyattır: 3/6/12 aylık planlarda indirim sadece ilk ödemede; aylık planda kupon geçerli olduğu sürece, kupon bitince yenilemeler güncel fiyattan.
- **PRO tanıtım mesajı:** Yönetim → PRO tanıtım mesajı: GIF/görsel, başlık, metin, düğme (dillere göre), aç/kapat, önizleme. PRO olmayanlara programda ve sitede PRO bölümünde görünür; kullanıcı 7 gün gizleyebilir.
- **Overlay önizleme arka planları:** Yönetim'den pist gündüz / pist gece / kokpit görsellerini değiştirebilir ve varsayılanı seçebilirsin; kendi arka planını seçmemiş herkes bunu görür.
- **Çeviriler:** Yönetim → Çeviriler: programdaki ya da sitedeki herhangi bir metnin herhangi bir dildeki çevirisini (Türkçe dahil) değiştirebilirsin; herkeste uygulanır.
- **Moderasyon kayıtları:** Her işlem okunur Türkçe cümleyle yazılır (ör. "PRO özellikleri: 'Overlay › Relative › …' herkese açık yapıldı (önce: PRO)"); tıklayınca ilgili bölüm açılır. Sitede de var.
- **PRO özellikleri sayfası:** Değişiklik yapınca sayfanın en üste atlaması düzeltildi.

## 011026-45

- **Üst çubukta ikonlar:** Relative, Sıralama ve üst çubuğu olan diğer overlay'lerde oturum türü (yarış: damalı bayrak, sıralama: kronometre, antrenman: bayrak), kalan tur/süre (kum saati), SOF, olay sayısı, tur, pozisyon, saat ve hava bilgileri ikonla gösterilir; üzerine gelince ne olduğu yazar. "Etiket gösterimi: Yazı" ile eski yazılar geri gelir. Yeni isteğe bağlı alan: "Oturum türü".
- **Lastik sütunu:** Relative ve Sıralama'ya isteğe bağlı "Lastik": yağmur lastiği (mavi damla), ara (I), yumuşak/orta/sert (S/M/H) ya da kuru (D). iRacing'de tüm araçlar, LMU/rF2'de tüm araçlar, ACC/AC'de sadece kendi aracın.
- **Direksiyon Ekranı – Otomatik:** PRO üyeler "Otomatik (araca göre)" seçince araç bilgisi yokken (önizleme, düzenleme modu) de araba tarzı ekran görünür; yarışta araca göre değişir.
- **PRO özellikleri çok daha ayrıntılı:** Yönetim → PRO özellikleri'nde her overlay için overlay'in kendisi, her ayarı ve her seçeneği ayrı ayrı PRO / herkese açık yapılabilir. Uygulama özellikleri de eklendi: arkadaş ekleme, özel mesajlaşma, sohbet arka planı, profil fotoğrafı, tanıtım ve sosyal bağlantılar, takım kurma, takıma katılma, takım sohbeti, anket, duyuru, telemetri kaydı, başkalarının telemetrisini görme, tur karşılaştırma, lider tablosu, temalar, uygulama arka planı, sohbet görünümü, ses paketi gönderme, ekran görüntüsü, yayın düzenleri, lig, Pitwall paneli, canlı zamanlama, mühendis ekranı, olaylar. Arama, süzgeçler, grup işlemleri, "Tümünü varsayılana döndür". Sunucu tarafı da bu ayarlara uyar. PRO olmayan üyeler kilitli özellikleri görür (PRO rozeti ve "PRO'ya bak"), kullanamaz.
- **Windows ile başlat:** Programın ilk kurulumunda varsayılan olarak açık (sonradan kapatırsan kapalı kalır).
- **Dil seçici:** Arayüzün sağ üst köşesinde geçerli dilin bayrağı; tıklayınca bayraklardan dil seçilir.
- **Monitör algılama:** Kapalı bir monitör açılınca / takılınca program birkaç saniye içinde tanır; düzenler, overlay monitör seçimi ve monitör pencereleri güncellenir.
- **Düzenleme modunda düzen değiştirme:** Düzenleme çubuğundaki düzen adı açılır listeye dönüştü; kayıtlı düzenlerden birini seçince hemen o düzene geçer.

## 011026-44

- **Yeni sesli mühendis (Crew Chief gerekmez):** Kendi ses motorumuz; Crew Chief kurulumuna bakmaz. Ses paketleri programın kendi klasöründe (ya da test için seçilen bir klasörde). WAV ve OGG çalar; her ifade klasöründen rastgele bir kayıt seçilir, aynısı art arda tekrarlanmaz. Yarış oturumu algılanınca kendiliğinden başlar; Ayarlar'dan kapatılabilir. PRO'ya özel (Yönetim → PRO özellikleri → "Sesli mühendis" ile herkese açılabilir).
- **Özellikler:** spotter (solda/sağda/üç araç/temiz), start ve yarış akışı, pozisyon ve sollamalar, kalan tur/süre, son tur, tur zamanları ve kişisel rekor, sektör farkları, öndeki/arkadaki farkı (yaklaşıyor/uzaklaşıyor), rakip pit girişleri, yakıt (kalan tur, eklenecek miktar, pit penceresi), pit limitörü ve pit hızı, lastik sıcaklık/aşınma, motor sıcaklıkları, kaza sonrası "iyi misin", bayraklar ve cezalar, pist sınırı uyarıları, iRacing olay sayısı, yağmur ve sıcaklık değişimleri, çok sınıflı yarışlarda hızlı/yavaş sınıf uyarıları, sayı ve tur zamanı okuma. Özellik grupları ayrı ayrı açılıp kapatılabilir; "Argo ifadeler" seçeneği.
- **Ses paketleri:** Sesli mühendis sayfasında paket listesi: indir (ilerleme çubuğu), güncelle, kullan, kaldır. Paketler GitHub Releases'ten indirilir, SHA-256 ile doğrulanır.
- **Kendi dilinde ses paketi yap:** Şablon indir (her ifade klasöründe ne söylenmesi gerektiğini ve ne zaman çaldığını anlatan METIN.txt, Türkçe ve İngilizce), eksik kontrolü (yüzde ve eksik listesi, klasörü oyunda deneme), ses paketi oluşturma (WAV'ları OGG'ye çevirip yaklaşık 10 kat küçültür, tek zip) ve "Paketimi gönder" formu (WeTransfer / Google Drive bağlantısı; yöneticiye bildirim ve e-posta).
- **Yönetim → Ses paketleri:** Paket ekle/düzenle ("Bağlantıdan doldur" boyut, SHA-256 ve ifade sayılarını kendisi bulur), yayınla, sırala; gelen paket gönderileri (inceleniyor / kabul / ret ve not; gönderene bildirim). Sitedeki yönetim panelinde de var.

## 011026-43

- Sohbet ayarlarında ve uygulama arka planında bulanıklık değerinin yanındaki "px" kaldırıldı.

## 011026-42

- **PRO tasarımlara önizleme:** PRO olmayan üyeler Overlay'ler sayfasında PRO seçenekleri (ör. direksiyon ekranının gerçek araba tasarımları, direksiyon simidi tasarımları) seçip önizlemede görebilir; seçim kaydedilmez ve overlay'de kullanılmaz ("Önizleme: bu seçenek PRO üyelere özel, kaydedilmedi" notu, "Önizlemeyi kapat"). PRO overlay'lere tıklayınca da önizlemede görünür ama eklenemez/açılamaz.

## 011026-41

- **Hava durumu ikonları:** Hava, Relative, Sıralama ve Oturum overlay'lerinde hava/pist sıcaklığı, zemin (ıslaklık), nem, yağış ve rüzgâr yazıları yerine ikonlar; üzerine gelince ne olduğu yazar. "Etiket gösterimi: İkon / Yazı" ayarı.
- **Pedallar & Girdiler – ABS / TC:** ABS çalışınca fren çubuğu sarıya, TC çalışınca gaz çubuğu maviye döner (renkler ayarlanabilir); gösterim: çubuk rengi / dış çerçeve / ikisi / kapalı. Pedal grafiğinde ABS/TC anları da renkli. (TC bilgisi şimdilik ACC/AC'de var.)
- **DigiFlags yenilendi:** Gerçek LED paneli görünümü (yanan LED'ler parlak ve ışıltılı). Düzenleme modunda ya da veri yokken tıklayınca 3,5 saniyeliğine rastgele bir bayrak örneği gösterir; sürekli demo yok.
- **Araç logoları:** Relative ve Sıralama'da logolar daha büyük ("Logo boyutu" ayarı). SVG araç logoları eklenebilecek şekilde hazırlandı.
- **Bildirimler:** "Tümünü okundu say" ve "Tümünü sil".
- **Pencere konumları:** Arkadaşlar (ve Pitwall, Canlı Zamanlama, Mühendis, Olaylar) penceresi en son nereye taşındıysa ve hangi boyuttaysa orada açılır; mesaj bildirimine tıklayınca da.
- **Ctrl + Print Screen düzeltildi:** Windows'un Print Screen → Ekran Alıntısı Aracı ayarı kısayolu engelliyordu; ekran görüntüsü kısayolu artık klavye kancasıyla yakalanıyor.
- **Geri al / İleri al:** Düzenlemelerde Ctrl+Z, Ctrl+Y (Ctrl+Shift+Z) ve ◀ ▶ düğmeleri: overlay taşıma/boyutlandırma, overlay ayarları, düzenler ve tema.
- **Sohbete özel arka plan:** Arkadaşınla sohbetin başlığındaki düğmeden o sohbete özel arka plan (renk, degrade, resim). "Arkadaşına öner" ile gönderirsin; arkadaşın kabul ederse ikiniz de görürsünüz.
- **Uygulama arka planı:** Ayarlar → Görünüm: hazır degradeler ya da kendi resmin (karartma, bulanıklık). İstersen overlay'lerin arkasında da hafifçe görünür.
- **Yeni overlay: Mesajlar:** Yarışırken arkadaş ve takım mesajlarını ekranda gösterir. Kaynak: tüm arkadaşlar / takım mesajları / seçili kişiler; süre, en fazla mesaj, yazı boyutu, arka plan. Arkadaş listesinde kişiye sağ tık → "Mesajlar overlay'inde göster/gizle".
- **PRO özellikleri yönetimi:** Yönetim → PRO özellikleri (program ve site): resim / tema / düzen paylaşımı, düzen puanlama/yorum, arkadaş özelleştirme, veri paylaşımı ve overlay'lerdeki tek tek PRO seçenekleri (ör. direksiyon ekranı tasarımları) için "PRO" ya da "Herkese açık" seçimi; arama, grup işlemleri, varsayılana dön. PRO olmayan üyeler kilitli seçenekleri görür ama seçemez. Sunucu tarafındaki denetimler de bu ayara uyar.

## 011026-40

- **Takımın oyunu:** Takım kurarken hangi oyun için kurulduğu seçilir (iRacing varsayılan; ACC, AC, LMU, rF2, AMS2 ya da birden fazla oyun). Takım ayarlarından değiştirilebilir; takım kartlarında oyun rozeti, takımlar listesinde oyun süzgeci (program ve site).
- **Son aktiviteler:** Takım sayfasında telemetrisi görünen üyelerin son oturumları: kim, hangi pistte, hangi araçla kaç tur attı, en iyi turu, ne zaman; kişisel rekorlarda PB rozeti. Tıklayınca oturum Telemetri sayfasında açılır (sitede yarışçı oturum sayfası). Tek oyunlu takımlarda sadece o oyunun oturumları.
- **Gerçek araba tarzı direksiyon ekranları (PRO):** Direksiyon Ekranı'na 10 yeni görünüm: Formula (F1 tarzı), Formula alt sınıfları, GT3 Alman / İtalyan / İngiliz-Japon tarzı, Prototip / Hypercar, Stock car / NASCAR (analog göstergeli), Ralli, Touring car (TCR), Yol arabası. Her birinin kendine özgü vites ışıkları ve veri düzeni var. "Otomatik (araca göre)" kullandığın arabayı algılayıp ona benzeyen ekranı gösterir. PRO olmayanlarda Klasik görünüm kullanılır.

## 011026-39

- **Kritik düzeltme – mesaj gelince beyaz ekran / donma:** Mesaj bildirimi penceresi ilk kez açılırken Windows'ta programın ana iş parçacığı kilitleniyordu (bildirim beyaz kalıyor, uygulama yanıt vermiyordu). Pencere artık arka planda oluşturuluyor; donma giderildi.
- **Sohbet görünümü (Ayarlar → Sohbet):** Kendi ve arkadaşının balon rengi (yazı rengi otomatik), balon şekli (yuvarlak / köşeli / hap), yazı boyutu, saydamlık; arka plan: yok / düz renk / degrade / kendi resmin (bulanıklık ve karartma ayarı). Balonlar her zaman arka planın üstünde ve okunur. Sadece sen görürsün; arkadaş sohbeti ve takım sohbetinde geçerli.
- **Direksiyon tasarımları (Pedallar ve girdiler overlay'i):** "Otomatik (araca göre)": kullandığın arabaya göre direksiyon değişir (Formula, GT, Prototip, Ralli, Oval/Stock car, Klasik ahşap). "Yuvarlak" herkese açık, diğer tasarımlar PRO. Direksiyon boyutu, vurgu rengi, direksiyon açısı (°).
- **Pist haritasında kendi aracın:** Şekil seç (daire, ok, üçgen, üstten araç, kare, baklava, altıgen, yıldız) ya da kendi resmini yükle (PNG, ICO, JPG, WEBP, SVG…). Boyut ayarı görüntüyü bozmadan (oran korunur), gidiş yönüne döndürme seçeneği. Pist haritası, mini harita ve düz haritada.
- **Demo modunda PRO üyeler:** Demo yarışında relative/sıralama gibi tablolarda sahte sürücülerin arasında rastgele PRO üyelerin adları görünür. Hesap → PRO'dan "Demo modunda adım görünebilsin" kapatılabilir.
- **İndirim kuponları:** Yönetim → Kuponlar (program ve site): kod (ör. ERKIN), yüzde, başlangıç/bitiş tarihi, geçerli paketler (PRO 1/3/6/12 ay, hediye PRO, reklam gösterim/gün), toplam ve kişi başı kullanım sınırı. Aktif ve geçmiş/biten kuponlar, kullanım sayısı ve verilen toplam indirim; biten kupon tarihleri güncellenerek yeniden açılabilir. Kullanıcı PRO / hediye / reklam alırken kodu girer, eski fiyat üstü çizili yeni fiyat görünür; Lemon ödeme sayfasında da indirim adı ve tutarı yazar.
- **Profil:** Profil fotoğrafı (program ve site; arkadaş listesinde, sohbet başlığında, bildirimde, takımda ve profilde görünür), kısa tanıtım ve 10'a kadar sosyal bağlantı (YouTube, Twitch, Kick, Instagram, X, TikTok, Facebook, Discord, Steam, web sitesi…). iRacing adı ve simlerdeki adlar otomatik. Profili ziyaret eden herkes görür.
- **Arkadaş listesinde oyun:** Çevrimiçi arkadaşın hangi oyunda olduğu (iRacing / ACC / AC / LMU / rF2 / AMS2) rozetle görünür.
- **Web sitesi:** Girişte "Beni hatırla" kutucuğu (işaretli değilse tarayıcı kapanınca çıkış yapılır). Giriş yapınca sağ altta arkadaş listesi ve mesajlaşma (istekler, arama, sohbet, emoji, benden sil, raporla).
- **Ekran görüntüsü kısayolu:** Varsayılan artık Ctrl + Print Screen (eski Print Screen ayarı bir kez otomatik güncellenir).
- **E-posta tercihleri:** Hesabım'da "E-posta bildirimleri": arkadaşlık istekleri, takım bildirimleri (varsayılan kapalı), destek yanıtları, reklam durumu, PRO hatırlatmaları, ekran görüntüsü temizliği. Ödeme ve hesap e-postaları her zaman gider. Özel mesajlar için e-posta gönderilmez.
- **Takım e-postaları:** Davet, katılma isteği, kabul, duyuru ve yöneticilik/sahiplik e-postaları (15 dil), tercih açıksa. Duyuru e-postası takım başına saatte en fazla bir tane.

## 011026-38

- **Telemetri (Garage61 benzeri):** Program açıkken canlı oturumda tamamlanan her tur kaydedilir ve hesabına yüklenir (iRacing, ACC, AC, LMU/rF2, AMS2). Yeni "Telemetri" sayfası: son oturumlar, pist ve araç başına tur sayısı, geçersiz turlar/pistten çıkmalar/olaylar, kişisel en iyi turlar, oturum ayrıntısı, en iyi turların hız/gaz/fren/vites izleri ve 4 tura kadar karşılaştırma, pist + araç lider tablosu. İnternet yokken turlar sırada bekler, bağlantı gelince yüklenir. Ayarlar → Genel'den kayıt kapatılabilir.
- **Gizlilik:** Hesabım'da "Telemetri verilerimi başkaları görebilsin" anahtarı. Kapalıyken verilerini sadece sen ve takım arkadaşların görür.
- **Yarışçılar sayfası:** En az bir tur kaydı olan üyeler sim başına (iRacing yarışçıları, ACC yarışçıları…) simdeki kullanıcı adlarıyla listelenir; arama, profil ve arkadaş ekleme. Sitede yarisci.html.
- **Takımlar:** Takım kurma (ad, etiket, açıklama, logo, renk; açık / onaylı / sadece davet), davet ve katılma istekleri, üye çıkarma, sahiplik devri. Sahip üyelere yöneticilik verebilir; yöneticiler duyuru panosunda duyuru paylaşır ve sabitler, üyeler yorum yazar. Takım üyeleri birbirinin telemetrisini görür. Takımlar sayfası programda ve sitede (takimlar.html).
- **Takım sohbet odası:** Arkadaş listesinde takım odaları; odayı sessize alma, mesajı benden/herkesten silme, süreli anket (tek/çok seçim, canlı sonuçlar, erken bitirme).
- **Arkadaşa özel sessize alma:** Arkadaş listesinde istediğin kişinin mesaj bildirimlerini ve/veya sesini kapatma.
- **Destek:** Mesaj kutusuna ifade (emoji) seçici. Yönetici destek taleplerini görselleriyle birlikte kalıcı silebilir. Moderatörler destek taleplerini görür, yanıtlar, kapatıp yeniden açar (silemez, e-posta adresini göremez).
- **Yönetim → Özel mesajlar:** Yönetici üyeler arasındaki tüm mesajları görür; üye adına/iRacing adına göre (ör. "Erkin" → onunla ilgili tüm konuşmalar), iki üye arasındaki sohbet, metin ve tarih aralığı ile süzer. Her görüntüleme moderasyon kaydına yazılır.
- **Raporlanan reklamlar:** Yönetici reklamı (yayındaki dahil) kalıcı silebilir.

## 011026-37

- **Hediye PRO:** Üyeler, kayıtlı başka bir üyeye adını arayarak PRO aboneliği hediye edebilir (sitede Hesabım → Hediye PRO, programda PRO bölümünde "Hediye et"). Ödeme hediye edenin kendi e-postasıyla yapılır; abonelik alıcıya işlenir ve alıcının mevcut PRO süresinin üstüne eklenir. Hediye eden "Hediye ettiğim abonelikler" listesinden durumu görür ve istediği zaman sonlandırabilir; alıcı hediyeyi sonlandıramaz. Alıcıya hediye paketi temalı e-posta, hediye edene "Hediyen ulaştı" e-postası, hediye sonlandırılınca alıcıya bilgi e-postası (15 dil).
- **Arkadaşlar – mesaj silme:** Mesaja sağ tık → "Benden sil" ve "Sohbeti temizle"; sadece kendi ekranından silinir, karşı taraf görmeye devam eder.
- **Mesaj raporlama:** Gelen mesaja sağ tık → "Raporla", sebep seçilir (hakaret/taciz, spam, uygunsuz içerik, dolandırıcılık, diğer). Raporlar yöneticiye bildirim + e-posta olarak gelir; Yönetim → Moderasyon → Mesaj raporları (sitede yonetim.html#mesajlar): yoksay, çözüldü, mesajı sil.
- **PRO olmayan üyeler:** Arkadaş ekleyip mesaj gönderebilir; arkadaş görünümünü özelleştirme (renk, simge, fotoğraf, etiket) ve veri paylaşımı PRO'ya özel. PRO bir arkadaş seni güvenilir yaparsa onun verilerini görebilirsin. Arkadaşların canlı verisinin hiç görünmemesine yol açan bir sunucu hatası düzeltildi.

## 011026-36

- **Yeni overlay: Direksiyon Ekranı (Dashboard):** yarış arabası direksiyon ekranı görünümü; vites, hız, pozisyon, delta, sektör, son/en iyi tur ve devir ışıkları. 4 görünüm (Klasik, Minimal, Yarış, Dayanıklılık); vurgu rengi, renk teması, yazı tipi, devir ışığı stili (bloklar / F1 15 LED / çubuk), vites noktasında yanıp sönme, delta referansı, hız ve sıcaklık birimi, alt 3 kutuda gösterilecek veri (TC, ABS, fren dengesi, pist/hava sıcaklığı, RPM, yakıt, yağ/su sıcaklığı, olay sayısı…), logo yazısı.
- **Tümünü kaldır:** Overlay'ler ekranında açık overlay'lerin hepsini tek seferde kapatma (onaylı).
- **Sime göre gizleme:** iRacing dışındaki simlerde veri olmadığı için çalışmayan overlay'ler (ör. ACC/AC'de relative, sıralama; olay sayısı sadece iRacing'de) o sim algılandığında listede ve ekranda gizlenir; iRacing'e dönünce geri gelir.
- iRacing'den yağ/su sıcaklığı ve oturumun en iyisine / optimal tura göre delta okunuyor.

## 011026-35

- **Ödeme sayfası içeride:** Programda PRO ödemesi ayrı bir program penceresinde açılır, ödeme bitince pencere kapanır ve PRO kendiliğinden yenilenir. Sitede ödeme sayfa değiştirmeden, sitenin üstünde açılan bir pencerede yapılır (PRO ve reklam).
- **Ödeme e-postaları:** Her ödeme ve iadede yöneticiye tutar, üye, plan ve kaynağı gösteren e-posta + bildirim. Ödeyene kendi dilinde (15 dil) teşekkür/makbuz e-postası: PRO'da geçerlilik tarihi ve abonelik bilgisi, reklamda reklam yeri; iadede onay.
- **Reklam paneli:** "Reklamlarım" listesinde kalan gösterim ya da kalan süre çubukla görünür. Gösterim paketli reklamlar "Durdur" / "Devam ettir" ile durdurulup sürdürülebilir; durdurulan reklam gösterilmez ve gösterim harcamaz.
- Yönetimde reklam listesine "Reklam veren durdurdu" durumu eklendi.

## 011026-34

- **PRO ödeme sayfası:** başlık artık "SRTR Pitwall PRO (12 aylık)" biçiminde; plan adı iki kez yazılmıyor.

## 011026-33

- **Fiyat kutuları:** Yönetim panelindeki PRO ve reklam fiyatlarına ondalıklı tutar (4,99 ya da 4.99) yazılabiliyor; önce virgül/nokta yazılamıyordu.

=======
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
## 011026-32

- **Reklam ödemesi:** Lemon'da reklam ürününün varyant numarası yerine ürün numarası da girilebilir (LEMON_AD_PRODUCT_ID / LEMON_USD_AD_PRODUCT_ID); varyant otomatik bulunur.

## 011026-31

- **Ödeme sayfası dili:** Lemon ödeme sayfasındaki ürün adı ve açıklama TL mağazasında Türkçe (ör. "SRTR Pitwall PRO · 3 aylık"), dolar mağazasında İngilizce.

## 011026-30

- **Bölgesel reklam fiyatı:** Yönetim → Reklamlar'da her yer için Türkiye fiyatları (TL) ayrı girilir. Türkiye'den reklam verenler TL fiyatını görür ve TL öder, yurt dışından gelenler genel fiyatı (USD).
- **PRO ödemesi yönetim panelinden:** Planlar ve fiyatlar'da her plan için yurt dışı (USD) ve Türkiye (TL) tutarı girilir. Lemon Squeezy'de tek abonelik ürünü (4 varyant) yeterli; ödeme sayfası girilen tutarla açılır, yenilemeler aynı tutarla olur. Eski elle bağlantı alanları isteğe bağlı olarak duruyor.
- Sitede ödeme dönüşünde "ödemen alındı" bildirimi; ödeme bağlantısı olmayan planda hesap sayfasının kendini yenileyip durması düzeltildi.

## 011026-29

- **Olaylar ekranı:** yarış bitince (damalı bayraktan sonra) olaylar penceresi kendiliğinden açılır; kazalar, geçişler, pit girişleri listelenir. Bir olaya tıklayınca iRacing replay'i o anın 5 sn öncesine gider ve o aracın kamerasına geçer. Tepsi menüsü ve Araçlar'dan da açılır; Ayarlar → Genel'den otomatik açılma kapatılabilir.
- **PRO olmayan üye görünümü (yönetici):** Ayarlar → Genel → "PRO olmayan üye gibi gör" ile arayüz PRO'suz bir üyenin gördüğü gibi görünür; altta şerit ve "Kapat" düğmesi.
- **PRO etiketi:** PRO'ya ayrılmış tüm overlay'lerin yanında PRO yazar.
- **Reklam sistemi:** sitede "Reklam ver" sayfası: gösterim sayısı ya da süre paketi, yer seçimi (site / program), görsel + bağlantı, ödeme (Lemon Squeezy) sonrası otomatik yayın. Kullanıcılar reklama sağ tıklayıp raporlayabilir; rapor sınırı aşılınca reklam gizlenir. Yönetim → Reklamlar sekmesi (onay, fiyatlar, raporlar). Reklam verene e-posta ve bildirim.
- **Web sitesi:** reklam sayfası ve yeni özellikler (olaylar/replay, reklam) 15 dilde.

## 011026-28

- **Birden çok simülasyon:** iRacing'in yanında Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate / rFactor 2 (rF2 Shared Memory eklentisiyle) ve Automobilista 2 / Project CARS 2. Üst çubukta Otomatik / iRacing / ACC / AC / LMU / AMS2 seçimi; Otomatik açık oyunu kendiliğinden bulur.
- **Destek:** program ve sitede destek talebi (konu seçimi, 4 görsele kadar). Yeni talep ve yanıtlar bildirim + e-postayla gelir.
- **Yönetim:** üyelerin PRO süresine gün ekleme/çıkarma, tarih, süresiz, kaldırma; "Kullanıcıya bildir (e-posta + bildirim)" kutusu. Yeni sekmeler: Gelir (paralı / ücretsiz PRO'lar ve kazanç), Destek, Ücretsiz PRO (herkese belli tarihe kadar PRO), Görünürlük (bölümleri ve overlay'leri gizle/göster).
- **PRO bitiş hatırlatması:** 10 gün ve 1 gün kala, kullanıcının dilinde e-posta + uygulama bildirimi.
- **Arkadaşlar:** Steam gibi sağ altta mesaj kartı (Windows bildirim sistemine bağlı değil), yeniden tasarlanan liste (gruplar, arama, son mesaj, avatarlar), sohbet balonları, ifadeler (:D → 😄) ve ifade seçici.
- **Topluluk:** yeni görünüm ve çok daha ayrıntılı filtreler (sıralama, tarih, ekran oranı/çözünürlük, araç, puan, indirme, yazar…).
- **Güncelleme:** üst çubukta sadece döngü simgesi; açılışta ve 30 dakikada bir denetlenir, yeni sürüm varsa üstte "Yeni sürüm hazır – Şimdi yükle" şeridi.
- **Lig Kategorileri (League Builder):** Türkçe ad ve adım adım açıklama.
- **iRacing hesabı:** iRacing'e bağlanınca ad ve üye no hesaba kendiliğinden yazılır.
- **Önizlemeler:** panelde overlay önizlemesi 5 sn veri alır; DigiFlags gibi sadece belli durumda görünen overlay'ler de önizlemede görünür.
- **Web sitesi:** yeni özellikler (simülasyonlar, destek, arkadaş listesi) 15 dilde; destek bölümü ve kampanya şeridi.

## 011026-27

- **Bölgesel fiyat:** Türkiye'den kullananlara TL fiyatı ve TL ödeme bağlantısı, diğer ülkelere genel (USD / EUR) fiyat gösterilir. Yönetim → Planlar ve fiyatlar'da her plan için ayrı "Türkiye (TL)" alanları (sitede ve programda). Türkiye alanı boşsa herkes genel fiyatı görür.
- **Programda PRO satın alma / uzatma:** Hesap → PRO bölümünde planlar artık her zaman görünür; PRO iken "Uzat" ile süre kalan sürenin üstüne eklenir. "Web sitesinde hesabım" düğmesi.
- **Web sitesi 15 dilde:** ziyaretçinin tarayıcı diline (yoksa ülkesinin saat dilimine) göre otomatik; üst menüden dil seçilebilir.

## 300926-26

- **Web sitesi:** fiyat kartlarındaki "ayda …" aylık karşılığı para birimiyle doğru yazılıyor (ör. "ayda 83,25₺"; önce "₺/Yıl83,25" görünüyordu).

## 300926-25

- **Kaydırıcılar:** overlay ayarlarındaki çubuklar artık fareyle tutulup sürüklenebiliyor (sürüklerken form yeniden kurulup tutuşu bırakıyordu; kaydırıcı kendi fare takibini yapıyor).
- **Sütun sıralama:** Sıralama Tablosu sütunlarını yukarı/aşağı taşıyınca ayar paneli en üste kaymıyor.
- **Canlı taşıma:** Düzenler ekranında ya da düzenleme modunda bir overlay'i sürüklerken/boyutlandırırken diğer tarafta da anında hareket ediyor.
- **Sıralama Tablosu (Leaderboard):** Türkçe adı "Sıralama Tablosu"; ülke bayrakları görünüyor; "24 araç" yerine kask simgesi + sayı.
- **Arkadaşlar:**
  - Tepsi menüsünde **Arkadaşlar**: Steam gibi ayrı arkadaş listesi penceresi. Panelin arkadaş kutusunda da "Ayrı pencerede aç" düğmesi var.
  - Arkadaşa sağ tık: **Canlı veri** ve **Canlı veriyi ayrı pencerede aç** (yakıt, turlar, pistteki yeri; her arkadaş için ayrı pencere).
  - Gelen mesajlar panel ve arkadaş penceresi önde değilken Windows bildirimi olarak gelir; sessize alınan arkadaştan ve rahatsız etme açıkken gelmez. Yarıştayken oyun içi bildirim gösterilir.
  - Arkadaşın durum yazısının üstünde durunca tamamı görünür.
- **Uygulama adı çevrilmez:** e-postalarda ve sitede "SRTR Pitwall" Gmail / Google Çeviri'ye "çevirme" olarak işaretlendi ("Çukur Duvarı" sorunu).

## 300926-24

- **Web sitesi (website/):** özellikleri anlatan tanıtım sayfası, ücretsiz/PRO karşılaştırması, fiyatlar ve satın alma (Lemon Squeezy; Patreon ve Ko-fi de), SSS ve indirme. Türkçe / English.
- **Üyelik:** sitede kayıt, giriş, şifre sıfırlama (e-postadaki kodla). Aynı hesapla programa da giriş yapılır. Hesabım sayfasında PRO kalan gün, abonelik yönetimi, satın alma/uzatma, ödeme geçmişi, profil.
- **Yönetim paneli (sitede, sadece yöneticiler):** gelir, ödeme, aktif abonelik, PRO üye, yeni üye, ziyaretçi, indirme ve program kullanımı; günlük grafikler; sayfalar, gelinen siteler; satışlar (CSV), abonelikler, üyeler (PRO süresi ver / uzat / kısalt / süresiz / al, notlu), PRO süre geçmişi, cihaz uyarıları, planlar ve fiyatlar.
- **Veritabanı:** ödemeler, PRO süre geçmişi ve site ziyaretleri kaydediliyor; pro-webhook Lemon/Patreon/Ko-fi ödemelerini gelir istatistiğine yazıyor.
- **Yayın:** website/ değişince GitHub Pages'e kendiliğinden yayınlanır (docs/SITE.md).

## 300926-23

- **Masaüstü bildirimleri (Steam gibi):** arkadaştan mesaj gelince, biri seni "güvenilir" işaretleyince ya da arkadaşlık isteği gelince sağ alttan Windows bildirimi çıkar (Rahatsız etme açıksa çıkmaz). Panel kapalı olsa da çalışır.
- **Arkadaş "Veriler" ekranı:** yakıt, sıralama, en iyi/son tur, son 10 tur süresi ve pistteki konum (harita ya da halka üzerinde). Arkadaş çevrimdışı olsa bile son veri "son veri: X önce" diye görünür; hiç veri yoksa "Örnek veriyi göster" düğmesi var.
- **Bildirim zili:** PRO bitiyor ve cihaz uyarısı bildirimleri artık okunaklı cümleyle görünüyor.
- **E-posta düzeltmesi (Edge Function):** arkadaşlık e-postası bozuk kodlanıyordu; e-posta gönderimi nodemailer'a geçirildi (pitwall-jobs fonksiyonunu yeniden yayınlamak gerekir).

## 300926-22

- **Yönetim menüsü:** yöneticiler için ayrı sol menü; Özet, Üyeler, Abonelikler, Cihazlar, Planlar ve fiyatlar, Bildirimler, Moderasyon ve Medya ayrı sayfalarda. (Eski Hesap > Yönetici paneli buraya taşındı.)
- **Lemon Squeezy aboneliği:** 1/3/6/12 aylık planlar, otomatik yenileme, satın alma düğmeleri (hesap otomatik eşlenir), aboneliği yönet bağlantısı. Ödeme olunca PRO süresi kendiliğinden ayarlanır.
- **PRO kalan süre:** PRO sayfasında, sol menüde ve (abonelik yenilenmiyorsa) bitmesine 15 gün kala üst çubukta uyarı; aynı zamanda bildirim ve e-posta (15 dil).
- **Cihaz takibi:** hesabın kullanıldığı bilgisayarlar karma kimlikle kaydedilir; sınır (varsayılan 2) aşılırsa yöneticiye bildirim ve e-posta, Yönetim > Cihazlar sayfasında inceleme.

## 300926-21

- **Otomatik yayın:** artık elle etiket (tag) atmak gerekmiyor. GitHub'a push edince iş akışı sürüm numarasına bakar; yeni sürümse derler, etiketi ve yayını kendisi oluşturur.

## 300926-20

- **Güncelleme denetimi panelde:** üst çubukta "Güncellemeleri denetle" düğmesi (sonucu "En güncel sürümdesin" / hata olarak gösterir). Program açık kaldıkça 30 dakikada bir de kendiliğinden denetler.

## 300926-19

- **Yayın düzeltmesi:** GitHub Actions sürüm notu adımı ("Matching delimiter not found") hatası giderildi; 300926-18 yayını bu yüzden derlenmemişti, içeriği bu sürümde.

## 300926-18

- **Arkadaşlar yenilendi:** elle arkadaş ekleme kalktı. Giriş yapan kullanıcı adı ya da iRacing adıyla arayıp arkadaşlık isteği gönderir; kabul edilen arkadaşlar listede otomatik görünür.
- **Onay akışı:** gelen istekler "Onay bekleyenler"de Kabul et / Reddet ile görülür, gönderilenler geri çekilebilir. Karşı tarafa uygulama içi bildirim ve temalı e-posta (15 dilde) gider; bildirim zilinden de kabul edilebilir.
- **Arkadaşa özel görünüm:** arkadaş listesinde (sağ panel ve Arkadaşlar sayfası) sağ tık > "Görünümü düzenle" ile renk, simge, fotoğraf ve etiket arkadaşa özel ayarlanır.
- **Güncelleme:** "İndir ve kur"a basınca ilerleme çubuklu pencere açılır; indirme bitince kurulum sessizce (ileri-ileri pencereleri olmadan) yapılır, program kendiliğinden kapanır ve yeni sürümle açılır.
- Sunucu: arkadaşlık isteği e-posta tetikleyicisi (supabase/schema.sql) ve pitwall-jobs fonksiyonu güncellendi.

## 300926-17

- **Otomatik güncelleme açıldı:** imza anahtarı ve güncelleme adresi (github.com/M0SAD/srtr-pitwall) tanımlandı. GitHub'dan yayınlanan sürümler kendini günceller.
- Güncelleme denetiminde anlaşılır mesajlar: henüz yayınlanmış sürüm yoksa "güncel" görünür, internet yoksa bağlantıyı kontrol et uyarısı çıkar.

## 300926-16

- GitHub sayfası için yeni README: İngilizce ana sayfa, en üstte 15 dilin hepsine geçiş (docs/readme/), ekran görüntüleri ve öne çıkan özellikler.
- Eski Türkçe teknik README, geliştirici belgesi olarak docs/GELISTIRME.md dosyasına taşındı.

## 300926-15

- Overlay'ler sayfasındaki önizleme artık sabit görüntü: overlay seçilince bir anlık örnek veri alınır, sonra veri akışı ve demo üretimi durur. Overlay son hâliyle ekranda kalır, işlemci ve bellek harcamaz.
- Aynı davranış Düzenler ve Yayın tuvallerinde ve topluluktaki düzen önizlemesinde de geçerli. Demo açıksa önizlemeler canlı akar.
- Hakkında: SRTR Pitwall'un web sitesi (pitwall.simracetr.com) bağlantısı eklendi.

## 300926-14

**Topluluk**
- Yeni **Ana sayfa**: en çok görüntülenen görseller, en çok kullanılan düzenler ve yayın düzenleri, en çok puan alanlar, en çok yorum alanlar, en çok indirilen temalar. "Bu ay / Tüm zamanlar" seçilebilir; öğelere tıklayınca detay açılır.
- İstatistikler: görsel, düzen, yayın düzeni, tema, indirme, görüntülenme, yorum, puan ve üye sayıları.
- Düzen ve yayın düzeni **paylaşmak artık giriş yapan herkese açık** (kullanmak, puan vermek ve yorum yazmak PRO olarak kalır).
- Hazır sahneler (Yayın başlıyor, Hemen dönerim, Yayın sonu, Garaj örtüsü) toplulukta paylaşılamaz.
- **Temalar**: PRO üyeler düzenledikleri temayı paylaşır ve başkalarının temalarını kullanır. Kullanılan temalar Ayarlar › Görünüm'de hazır temaların yanında durur (üzerine gelip × ile kaldırılır).

**Bildirimler**
- Yönetici bildirim (duyuru) oluşturabilir: herkese, PRO üyelere ya da tek kullanıcıya; isteğe bağlı yayında kalma süresi.
- Zil simgesinde okunmamış sayısı görünür. Okunan bildirimler belirlenen süre sonra listeden kalkar (varsayılan 24 saat, yönetici panelinden değiştirilebilir; her duyuruya ayrı süre de verilebilir).

**Arayüz**
- Kontrol paneli ekranın yaklaşık %85'i boyutunda açılır.
- Hakkında: "Programı yapan: Erkin Azcan" ve YouTube, Kick, Twitch, Instagram, Steam, simracetr.com bağlantıları.
- Düzenler sayfası: monitör kutucukları büyüdü (geniş monitörlerde yazı taşmıyor), üstte "Paylaş" düğmesi, "Düzenlerim"de sağ tık menüsü (adını değiştir, paylaş, kopyala, varsayılan yap, sil).
- Demo kapalıyken Düzenler tuvalindeki overlay'ler sabit görüntü olur, veri almaz (RAM/işlemci harcamaz).
- Izgara kapalıyken ızgara ve orta çizgiler gizlenir; açıkken çizgiler daha belirgin. Izgara ve Kenarlar'ın üzerine gelince ne işe yaradıkları yazar.
- Tarayıcının sağ tık menüsü (Farklı kaydet, Yazdır) uygulamanın hiçbir yerinde çıkmaz (düzenleme ekranı dahil).
- Görünüm › Renkler: renk satırlarındaki taşma düzeltildi.

## 300926-13

**Arkadaş listesi (sağ alttaki "Arkadaşlar")**
- Hesap üzerinden arkadaş ekleme (görünen ad ya da iRacing adıyla arama), istek kabul/ret.
- Arkadaşların çevrimiçi / yarışta durumu (yarıştaysa seans, pist ve araç görünür).
- **Güvenilir işaretleme (PRO):** işaretlediğin arkadaş, sen yarışırken yakıt ve tur verilerini kod girmeden görür; yarıştaki arkadaşa tıklayıp "Veriler" ile canlı izler. Bu veri Yakıt overlay'inin takım bölümüne ve SRTR Pitwall paneline de otomatik gelir.
- **Anlık mesaj (gönderme PRO):** yarıştayken gelen mesaj ekranda sesle gösterilir. "Rahatsız etme" açıksa yarıştayken ekrana gelmez ve ses çalmaz, sadece sağ altta sayaç görünür. "Mesajlar açık" kapatılınca kimse mesaj atamaz; tek tek kişilerin mesajları da kapatılabilir.
- Arkadaşlık istekleri bildirim ziline de düşer.

**Topluluk**
- Düzenler ve Yayın sayfalarında "Toplulukta paylaş" düğmesi.
- Topluluk → Düzenler ve Yayın düzenleri ayrı sayfalar. Detayda düzen, paylaşanın renkleri ve ayarlarıyla gerçek görünümde (örnek veriyle) çizilir; overlay listesi ve renk/yazı tipi bilgisi görünür.
- Kullanmak, puan vermek ve yorum yazmak PRO (PRO olmayanlar görür, düğmelerde PRO yazar). Paylaşmak PRO.
- Topluluk (düzenler ve ekran görüntüleri) sadece giriş yapanlara görünür; ekran görüntülerinde puan/yorum için "hesap oluştur ya da giriş yap" yazar.

**Düzeltmeler ve küçük değişiklikler**
- Kilidi açmak (düzenleme modu) artık demo verisini başlatmaz; demo sadece Demo düğmesiyle açılır.
- Izgara kapalıyken düzenleme ekranında ve Düzenler tuvalinde ızgara çizgileri görünmez, sadece overlay çerçeveleri kalır.
- Panelde tarayıcının sağ tık menüsü (Farklı kaydet, Yazdır…) kaldırıldı. Overlay listesinde sağ tık: Overlay ekle / Kaldır / Aynısından ekle / Ayarlarını aç.
- Açık overlay'ler listede yeşil çizgi ve göz simgesiyle belirgin.
- Demo açıkken sesli spotter ya da bipler açıksa üst çubukta "Ses" düğmesi: demo seslerini kapatır.

**Yönetim**
- Abonelik planları: aylık, 3 aylık, 6 aylık, yıllık (PRO sayfasında görünür); kullanıcılara 1/3/6/12 ay ya da süresiz PRO.
- Kullanım istatistikleri: şu an çevrimiçi, şu an yarışta, son 24 saat / 30 gün kullanan, toplam kurulum, kayıtlı üye, PRO üye.
- Tüm kayıtlılar listesi (sayfalı), PRO üyeler, çevrimiçi olanlar, yöneticiler süzgeçleri; kayıt tarihi, son görülme ve sürüm.

## 300926-12

- Düzenler ve Yayın sayfalarındaki düzen tuvalinde overlay'e sağ tıklayınca düzenleme ekranındaki menünün aynısı açılır: 3×3 ızgarayla ekranda konumlama (köşeler, kenar ortaları, tam orta), yatayda/dikeyde ortalama, boyutu %100 yapma, varsayılan konum ve boyut, başka monitöre taşıma (yayın sahnelerinde yok), aynısından ekleme (ayarda izin varsa), ayarlarını açma ve kapatma.

## 300926-11

**Düzeltmeler**
- Kısayollar (Ctrl+Shift+E / D …) "HotKey already registered" hatası verip çalışmıyordu: kısayollar aynı anda iki yerden (ayar değişince ve oyuna girip çıkınca) yeniden kaydediliyordu. Artık sırayla ve sadece değişenler kaydediliyor. Hâlâ hata görürsen başka bir uygulama (ör. açık kalmış eski "PitWall") aynı tuşu kullanıyordur; hata metni bunu söyler.
- Yayın arayüzlerinde (sahne kartları, SRTR Pitwall paneli, Live Timing, OBS adresleri) "SRTR Pitwall" yazıyor.

**Overlay'ler**
- Aynı overlay'den varsayılan olarak bir tane eklenebilir; Ayarlar → Genel → "Aynı overlay'den birden fazla eklenebilsin" ile açılır. Açıkken düzenleme ekranında sağ tık → "Aynısından ekle" ve paneldeki "Kopya" görünür.
- Panelden overlay ekleyince overlay'ler gizli ya da oyun kapalı olsa bile birkaç saniye gösterilir ve yeni overlay turuncu çerçeveyle vurgulanır.
- Yayın düzenleri için "Kopyala" (Düzenler sayfasında zaten vardı).

**Düzenleme arka planı**
- Düzenler sayfasındaki tuvalde de gösterilir. Tuvalde ve düzenleme çubuğunda (Ctrl+Shift+E) "Arka plan" kutusu; işaretliyken görünür. "Arka plan" yazısına sağ tık: Galerim (SRTR Pitwall + iRacing), Topluluk ya da bilgisayardan yükle.

**Topluluk → Ekran Görüntüleri**
- Büyük yıldızlarla puanlama; kendi görüntüne puan verilemediği açıkça yazıyor.
- Görsel başlığı/açıklaması düzenlenebilir, silinebilir; yorumlar düzenlenebilir/silinebilir ("düzenlendi" işareti).
- Raporlama: sebep seçilir (uygunsuz, spam, telif, hakaret, başkasının içeriği, diğer) ve açıklama yazılır; yöneticiye e-posta gider. Düzenler ve yorumlar da raporlanabilir.
- Görüntü paylaşmak PRO özelliği oldu; PRO olmayanlar görür, puanlar, yorum yazar ve arka plan yapar.
- 6 ay boyunca açılmayan görseller her gece otomatik silinir; sahibine uygulama içi bildirim ve kendi dilinde e-posta gider. Üst çubukta bildirim zili.

**Yönetim**
- Moderasyon: raporları gör, içeriği sil, çözüldü/reddet (izni olan herkes).
- İzin grupları (sadece sahip): grup oluştur, yetkileri seç, üye ekle. Hazır "Moderatör" grubu: görsel ve yorum silme/düzenleme, raporlar, düzen silme.
- Moderasyon kayıtları (sadece sahip): başkasının içeriğini silen/düzenleyen, raporu kapatan, yönetici ya da grup değiştiren herkesin işlemi.
- Kullanıcılar listesinden yönetici yapma/alma ve gruba ekleme (sadece sahip).

## 300926-10

**Ekran görüntüleri**
- Oyundayken **Print Screen** tuşuna basınca ekran overlay'lerle birlikte kaydedilir (Resimler\SRTR Pitwall). Kısayol varsayılan olarak sadece oyundayken çalışır; oyun kapalıyken tuş Windows'a kalır. Tuş Ayarlar → Kısayollar'dan değiştirilebilir.
- Görüntülere yöneticinin belirlediği **filigran** eklenir (yazı, logo, konum, boyut, opaklık, renk, gölge; yazıda `{user}` paylaşanın adı olur).
- Yeni **Ekran Görüntüleri** sayfası: SRTR Pitwall çekimleri ve iRacing'in kendi klasörü (Belgeler\iRacing\screenshots), büyük görüntüleyici, "Şimdi çek", silme, klasörü açma. Ayarlar: overlay'ler görünsün mü, sadece oyundayken, JPEG/PNG, JPEG kalitesi.
- iRacing'de ekran görüntüsü nasıl alınır bilgisi (varsayılan tuş Ctrl + Alt + Shift + S).

**Topluluk → Ekran Görüntüleri**
- Görüntüler toplulukta paylaşılır; herkes 1–5 yıldız puan verir ve yorum yazar. Arama, "En yeni / En yüksek puan / En çok yorumlanan" sıralaması, "Paylaştıklarım", sahibi ve yönetici silebilir.

**Ücretsiz görsel barındırma**
- Görseller Supabase Storage'da (ücretsiz plan: 1 GB depolama, ayda 5 GB trafik). Yüklenirken küçültülür (varsayılan 1920 px), ayrıca küçük resim tutulur.
- Yönetici panelinde: kullanım çubuğu (kullanılan alan / 1 GB, görüntü sayısı), paylaşımı aç/kapat, en büyük genişlik, JPEG kalitesi, günlük paylaşım sınırı, Supabase paneline bağlantılar.

**Düzenleme ekranı arka planı**
- Düzenleme modunda overlay'lerin arkasına bir görsel konabilir (ör. kokpit içinden ekran görüntüsü): Ayarlar → Genel → Düzenleme ekranı, ya da görüntüleyicide "Düzenleme arka planı yap". Kendi çekimlerinden, iRacing klasöründen, topluluktan ya da dosyadan seçilir; opaklığı ayarlanır, düzenleme çubuğundan açılıp kapatılır.
- Overlay'ler sayfasındaki önizleme arka planı da artık SRTR Pitwall + iRacing görüntülerinden seçilebilir.

**Diller**
- Tüm yeni metinler 15 dilde.

## 300926-09

**Çok dil desteği (15 dil)**
- Arayüz artık Türkçe, English, Deutsch, Español, Português (Brasil), Português (Portugal), Français, Italiano, Nederlands, Polski, Svenska, Suomi, Русский, 简体中文 ve 日本語 dillerinde.
- Dil seçimi: **Ayarlar → Genel → Dil**. İlk açılışta sistem dili seçilir; değişiklik anında uygulanır (panel, overlay'ler, Live Timing, mühendis ekranı).
- Tepsi menüsü, pencere başlıkları, yarış kontrolü olayları ve oturum özeti dosyaları da seçilen dilde.
- Tarih/saat biçimleri seçilen dile göre.
- **E-postalar arayüz dilinde gider**: kayıt onay kodu, şifre sıfırlama kodu ve "şifren değişti" bildirimi. Dil değişince hesabına da kaydedilir, sonraki e-postalar yeni dilde gelir.
- Çeviri akışı: yeni Türkçe metin eklendiğinde `node scripts/i18n/extract.mjs --missing` eksik çevirileri listeler (kurallar: `scripts/i18n/TRANSLATING.md`).

## 300926-08

- Uygulamanın adı her yerde **SRTR Pitwall** oldu: pencere başlıkları, tepsi simgesi, panel, kurulum dosyası, oturum özetleri, e-postalar (gönderen adı, konu ve logo).
- Not: Kurulum dosyasının adı değiştiği için yeni sürüm ayrı bir klasöre kurulur. Eski "PitWall" kurulumunu Windows'tan kaldırabilirsin; ayarların korunur (aynı ayar klasörü kullanılır). "Windows ile başlat" açıksa bir kez kapatıp açman yeterli.

## 300926-07

**Hesap: kodla onay ve şifre sıfırlama**
- Kayıt olunca e-postaya 6 haneli onay kodu gelir; kod uygulamada girilir ve hesap onaylanıp giriş yapılır. "Kod gelmedi mi? Yeniden gönder" var.
- Onaylanmamış hesapla giriş denenirse uygulama yeni kod gönderip onay ekranını açar.
- Şifremi unuttum: e-postaya gelen kod ve yeni şifreyle uygulamanın içinden şifre değiştirilir.
- PitWall temalı e-posta şablonları (onay, şifre sıfırlama, giriş kodu, e-posta değişikliği, doğrulama, şifre değişti bildirimi): `supabase/templates`.
- Hata iletileri Türkçe.

**Düzeltmeler**
- Araçlar → Live Timing / Pitwall / Mühendis ekranı Windows'ta boş ve kapatılamayan pencere açıyordu (pencere oluşturma kilitlenmesi). Düzeltildi; panel öne getirme de aynı şekilde düzeltildi.

**Önizleme arka planları**
- Pist (gündüz), Pist (gece) ve Kokpit arka planları 3B olarak yeniden üretildi (asfalt, kerbler, çakıl havuzu, bariyerler, reklam panoları, tel çit, ağaçlar, gece projektörleri, GT3 direksiyonu).
- Yeni: **iRacing görüntüsü** düğmesi; iRacing'de aldığın ekran görüntülerini (Belgeler\iRacing\screenshots) listeler, tek tıkla arka plan yapar.

## 300926-06

- Bulut bağlantısı yapılandırıldı (Supabase projesi). Supabase'in yeni `sb_publishable_` anahtarlarıyla giriş/kayıt çalışır.
- Veritabanı şemasına tablo yetkileri açıkça eklendi (Supabase'de "tabloları otomatik aç" kapalı olsa da çalışır).
- PRO ödeme bildirimi fonksiyonu yeni gizli anahtar biçimini de tanır.

## 300926-05

**Yeni arayüz**
- Soldan simgeli menü (Overlay'ler, Düzenler, Yayın, Sürücüler, Topluluk, Araçlar, Sesli Mühendis, PRO, Hesap, Ayarlar) ve üst çubukta sim seçimi (Otomatik / iRacing), bağlantı durumu, Demo / Görünür / Kilitli anahtarları.
- **Overlay'ler** sayfası üç sütun: solda açık overlay'ler ve kategoriler, ortada katlanır bölümlerle ayarlar (Genel, overlay'e özel gruplar, "Ne zaman gizlensin"), sağda pist, gece pisti, kokpit ya da kendi görselinin üzerinde canlı önizleme.
- Kaydırıcılar, − / + düğmeleri, sürüklenebilir sütun listeleri ve çoklu seçim kutuları.
- iRacing kapalıyken panel açıkken önizleme için demo verisi üretilir; ekrandaki overlay'ler gizli kalır.

**Düzenler: monitör seçerek düzenleme**
- Monitör haritasından monitörü seç, o monitörün tuvalinde overlay'leri sürükle ve köşesinden boyutlandır (ızgara ve kenar yakalama, orta çizgiler).
- Her overlay'in (ve kopyasının) kendi monitörü olabilir; birden fazla monitörde aynı anda overlay gösterilir.
- Overlay kopyaları: aynı overlay'den farklı ayarlarla birden fazla (ör. iki Relative).
- Düzen kuralları (araç, oturum türü, otomatik geçiş), kopyala, varsayılan yap, sil.

**Yayın (OBS)**
- Oyundakinden ayrı yayın düzenleri, her birinin kendi OBS adresi; 1080p, 1440p, 720p, 4K ve dikey tuval.
- Hazır sahneler: Yayın telemetrisi, Yayın başlıyor (geri sayım), Hemen dönerim, Yayın sonu, Kokpit HUD, Garaj örtüsü.

**Yeni overlay'ler**
- **Tur Süreleri**: son turlar, 3 sektör (en iyi sektör mor), en iyiye fark, yakıt, geçersiz/pit turları, teorik en iyi tur.
- **Olay Günlüğü**: her olay puanı saat, tur, sektör ve türüyle (1x pist dışı, 2x kontrol kaybı/duvar, 4x temas); yeni olay yanıp söner.
- **Pit Hızı**: pit sınırına göre hız çubuğu, sınırı aşınca kırmızı, sınırlayıcı kapalıysa uyarı.
- **Hızlı Sınıf Uyarısı**: arkadan gelen daha hızlı sınıftaki araçlar, süre farkı ve yaklaşma çubuğu.
- **Piste Dönüş**: pist dışına çıkınca ya da yavaşlayınca arkadan gelenlere göre DÖNEBİLİRSİN / DİKKAT / BEKLE.
- **Düz Harita**: pist düz şerit, sen ortada ya da start/finiş solda, arkadaşlar kendi renginde.
- **Viraj Analizi**: en iyi turundaki virajlar otomatik bulunur; her virajda en düşük hızını son turla ve bu turla karşılaştırır.
- **Twitch Sohbeti**: giriş gerekmeden kanal sohbeti; rozetler, ! komutları ve botları gizleme, soldurma.
- **Sahne** (yayın): başlıyor / ara / bitiş / garaj ekranları.

**Leaderboard ve Relative**
- Başlık/alt satır bilgilerini seç (en fazla 8): SOF, olay, kalan tur/süre, tur, pozisyon, saat, hava/pist sıcaklığı, ıslaklık, yağış, nem, rüzgâr, fren dengesi.
- Leaderboard: "Liderler + etrafımdakiler" (sınıfımın ilk N, önümde/arkamda N, diğer sınıfların ilk N) ya da hepsi; sütunları sürükleyerek sırala ve aç/kapat (lisans/SR ve pit sayısı sütunları yeni); fark ondalığı; satır arka planı saydamlığı.
- Ad biçimi: Ad Soyad, A. Soyad, Soyad, Ad S., SOYAD.
- Sürücü etiketleri: Sürücüler → Arkadaşlar'da her kişiye etiket (ör. "Takım", "Dikkat"); adın yanında görünür.

**Sesli Mühendis ve Spotter (PRO)**
- CrewChief ses paketin (bilgisayarındaki CrewChief klasöründen) ile Türkçe sesli uyarılar: solda/sağda araç, üç araç yan yana, temiz, hâlâ orada, çizgini koru; bayraklar, start, son tur, kalan tur/süre, pozisyon, yakıt, pit penceresi, kişisel rekor, fark eğilimi, olaylar.
- Ayrı mühendis ve spotter ses düzeyi, kategori seçimi, test düğmeleri. Yönetici "voice" seçeneğini PRO'ya ayırabilir.
- Sesler: arkadan hızlı sınıf bip'i ve yanındaki araç için sol/sağ kulağa yönlendirilmiş ton.

**Ayarlar (alt sayfalar)**
- Genel: bağlanınca paneli küçült, düzenleme bitince oyuna odağı geri ver, 12/24 saat, hız her zaman mph, opak paneller.
- Görünüm: yazı tipi kartları, kalınlık, rakam fontu, satır yoğunluğu, lisans ve iRating tek rozette.
- Performans: telemetri ve pedal güncelleme sıklığı sınırı, efektleri azalt.
- Ekran: GPU hızlandırmayı / GPU birleştirmeyi kapat (yeniden başlatınca geçerli).
- Entegrasyonlar: web sunucusu ve ağdan erişim, MQTT sunucu/istemci, Twitch kanalı, **uzak telemetri** (başka bilgisayardaki PitWall'un verisini Live Timing/Mühendis ekranında göster).
- Mühendis ekranı: tarayıcı/tablet için döngülü ekranlar (sıralama, relative, yakıt, stint, tur süreleri, hava…).
- Paylaşım: takım yakıtı kodu (oluştur/katıl), **yarış özetleri ve oturum kayıtları** (her oturumun turları, sektörleri, olayları ve sonuçları kaydedilir; listeden özet açılır, eski kayıtlar silinebilir).
- Hakkında: konum/ayar sıfırlama.

## 300926-04

**Kısayollar değiştirilebilir**
- Genel ayarlar → Kısayollar: kısayola tıkla, yeni tuş birleşimine bas. Varsayılana dönme ve kısayolu kaldırma var; başka bir uygulama aynı kısayolu kullanıyorsa uyarı çıkar.
- Yeni varsayılanlar: overlay'leri gizle/göster **Ctrl+Shift+D**, kontrol panelini öne getir **Ctrl+Shift+Boşluk** (düzenleme **Ctrl+Shift+E** aynı). Tepsi menüsü ve ipuçları seçtiğin kısayolları gösterir.

**Arkadaşlar (yeni sayfa)**
- iRacing adıyla (istersen üye numarasıyla) arkadaş ekle; aynı oturumdaysanız listeden tek tıkla, numarası otomatik gelir.
- Arkadaşların Relative, Leaderboard ve Live Timing'de renkli satır ve isim önünde rozetle, pist haritası ve mini haritada kendi renginde görünür.
- Varsayılan renk, satır rengi yoğunluğu, nerede gösterileceği ayarlanır. Her arkadaşa ayrı renk, simge (★ ♥ ⚡ 🔥 👑 🏁…) ya da fotoğraf verilebilir; haritada fotoğraf yuvarlak olarak çizilir.

**Hesap**
- Kayıt olurken görünen ad, "Şifremi unuttum", profil (görünen ad), iRacing hesabını bağlama (iRacing'e girince uygulama hesabını algılar, tek tıkla bağlanır).
- Adım adım kurulum: docs/SUPABASE.md. Bulut bağlantısı yapılandırılmış derlemelerde kayıt/giriş çalışır.
- Düzeltme: bulut yedeğine gönderimde "The string did not match the expected pattern" hatası.

**Topluluk: düzen paylaşımı (yeni sayfa)**
- Düzenini başlık, açıklama ve (istersen) görünüm temasıyla paylaş; ekran çözünürlüğü monitörden otomatik alınır.
- Düzen adı, kullanıcı adı ya da iRacing adıyla ara; çözünürlüğe göre süz; en yeni / en yüksek puan / en çok indirilen.
- Her düzenin ekran şeması (overlay'lerin yerleri ve adları), indirme sayısı, yıldız ortalaması.
- Tek tıkla profil olarak indir, temasını uygula, 1–5 yıldız ver, yorum yaz. Kendi paylaşımlarını ve yorumlarını silebilirsin.

**PRO üyelik**
- Yönetici paneli (sadece yöneticiye görünür): PRO'ya ayrılacak overlay'leri işaretle, Patreon/Ko-fi bağlantıları ve aylık/yıllık fiyat metinleri, kullanıcı ara ve elle PRO ver/al.
- PRO olmayan kullanıcıda PRO overlay'ler panelde **PRO** rozetiyle kilitli, ekranda gösterilmez (Pitwall ve OBS dahil).
- Patreon ve Ko-fi ödemeleri otomatik PRO açar ve her ödemede uzatır (aylık/yıllık). Kurulum: docs/PRO.md.
- PRO durumu bilgisayarda saklanır; internet yokken de süresi bitene kadar geçerli.

**Not:** iRacing hesabıyla giriş (OAuth) şu an mümkün değil: iRacing yeni uygulama kayıtlarını durdurmuş. Açıldığında eklenebilir.

## 290926-03

**Araç markası logoları**
- Leaderboard (Logo / Logo ve yazı / Sadece yazı seçeneği), Relative (isteğe bağlı sütun) ve Live Timing araç markasını logoyla gösterir.
- Logolar tescilli olduğu için uygulamayla gelmez: Görünüm → **Araç markası logoları** → "Logo klasörünü aç", dosyaları marka adıyla koy (`porsche.png`, `aston-martin.svg`, PNG/SVG/WEBP, en fazla 512 KB). Sayfada 42 markanın listesi, hangilerinin bulunduğu ve eşleşmeyen dosyalar görünür.
- Marka, iRacing'deki tam araç adından bulunur (ör. "Mercedes-AMG GT3" → Mercedes, "Corvette" → Chevrolet, "HPD" → Honda). Logo yoksa marka adı yazılır.

**Lastikler (yeni overlay)**
- Dört lastiğin iç/orta/dış sıcaklığı (soğuk mavi, ideal yeşil, sıcak kırmızı; sınırlar ayarlanabilir), kalan diş ve soğuk basınç (kPa/psi/bar). iRacing bu değerleri sadece pitte günceller. Pitwall'a da eklendi. Demo'da lastikler aşınır, pitte yenilenir.

**MQTT ve takım yakıt paylaşımı**
- Araçlar sayfasında **dahili MQTT sunucusu** (port ayarlı) ve **MQTT istemcisi** (adres, port, kullanıcı/şifre, başlık öneki).
- **Takım yakıtı:** aynı takım adını yazan herkes, aracı süren kişinin yakıt verisini (yakıt, tur başı tüketim, kalan tur, pitte mi) görür. Yakıt overlay'inin altında ve Pitwall'da "TAKIM" bölümü; bağlantı durumu ve verinin ne kadar eski olduğu yazar.
- İstenen veri konuları (durum, oturum, sıralama, relative, yakıt, araç, girdiler, delta, hava, lastikler, yarış kontrol) `pitwall/<konu>` başlıklarına JSON olarak yayınlanır; kendi dashboard'un ya da Home Assistant gibi araçlar okuyabilir.

**League Builder (yeni sayfa)**
- Lig yarışlarında iRacing sınıfları yerine ligin kategorileri (Pro / Pro-Am / Am gibi, ad ve renk ayarlı).
- Sürücüleri sütunlar arasında **sürükle-bırak** ile ata; oturumda olmayan numaraları elle ekle. Atanmamış sürücüler iRacing sınıfına göre varsayılan kategoriye girer.
- iRacing lig kimliği girilirse sadece o ligin oturumlarında uygulanır (0: her oturumda).
- Etkinken tüm overlay'ler kategorileri görür: Leaderboard başlıkları ve SOF, sınıf renkleri, sınıf içi sıralar, Relative, harita, Live Timing.
- Birden fazla yapılandırma; dışa/içe aktarma (JSON) ile lig arkadaşlarıyla paylaşma.

**Düzeltmeler**
- Live Timing sıralama başlıkları sütunlarla hizalı.
- Pitwall'da yakıt sütunu genişletildi, lastik kartı eklendi.

**Sırada:** VR'da gösterim.

## 290926-02

Edge Overlays'teki özelliklerin büyük bölümü eklendi.

**Yeni overlay'ler**
- **Telemetri Paneli:** devir yayı olan vites halkası (önceki/sonraki vites), hız, devir ışıkları (vites değiştirme anında mavi yanıp söner), pozisyon ve başlangıca göre kazanılan/kaybedilen sıra, son tur, yakıt, pist sıcaklığı, isteğe bağlı ABS/TC/fren dengesi.
- **Pist Haritası:** tüm pist ve araçlar (sınıf renkleri, numara ya da sınıf pozisyonu, senin aracın vurgulu, pitteki araçlar soluk). Pist şekli ilk temiz turunda otomatik kaydedilir ve pist başına saklanır. Döndürme, aynalama, boyut ayarları.
- **Mini Harita:** aracını merkeze alan yuvarlak, yakınlaştırılmış görünüm; istersen gidiş yönü hep yukarıda.
- **Canlı Hava:** rüzgâr pusulası (araca göre döndürülebilir), rüzgâr hızı, pist/hava sıcaklığı, nem, yağış, pist ıslaklığı çubuğu.
- **Olay Sayacı:** tur ve olay puanı; olay sınırına yaklaştıkça yeşil → sarı → kırmızı çubuk.
- **DigiFlags:** LED matris bayrak paneli (sarı, mavi, yeşil, beyaz, damalı, kırmızı, siyah, hasar, enkaz; dalgalanan bayraklarda yanıp söner).
- **Battle Box:** sınıfında hemen önündeki ve arkasındaki araç, son turları ve farklar; pozisyon rozeti.
- **Data Frame:** tek bir değeri büyük gösteren kutu (hız, vites, devir, pozisyon, tur, kalan, son/en iyi/şimdiki tur, delta, yakıt, yakıt yeter, tur başı yakıt, olay, sıcaklıklar, BB, TC, ABS, saat).
- **Webview:** herhangi bir web sayfasını overlay olarak gösterir.

**Yükseltilen overlay'ler**
- **Relative:** üstte hava satırı (hava/pist sıcaklığı, pist durumu, nem, yağış); sütunlar: sınıf rengi, pozisyon, numara, stint (tur) ya da PIT/OUT, lisans + güvenlik puanı, iRating + yarışta tahmini iRating değişimi, son tur (kişisel rekorsa yeşil), fark, araç bayrağı (BLK/DSQ/REP/BLU); altta SOF, olay/sınır, kalan süre/tur, saat. Her sütun ayrı açılıp kapatılabilir.
- **Leaderboard:** oturum başlığı (süre/tur, araç sayısı), sınıf başlıklarında araç sayısı ve SOF, ülke, araç markası, iRating, kazanılan/kaybedilen sıra, fark/aralık, son 5 tur ortalaması, son tur, en iyi tur (sınıfın en iyisi mor).
- **Yakıt Hesaplayıcı:** depo çubuğu, bitişe gereken yakıt, stint süresi; SON / ORT 5 / ORT 10 için tüketim–tur–stint–ikmal tablosu; "N tur gitmek için gereken tüketim" hedefleri; kalan tur (son/ortalama/en kötü); tek duraklı pit penceresi (tur ve zaman aralığı).
- **Görsel Spotter (eski Kör Nokta):** radar görünümünde yan bölgeler, ön/arka koniler ve boyuna konumlarına göre hareket eden araç blokları; spotter çubuklarında araç bloğu çubuk içinde hareket eder.

**Layout Manager**
- Düzenlere kural: ne için (Sürüş / Spotting / Yayın), hangi araç ya da sınıflar, hangi oturumlar (antrenman/sıralama/yarış).
- **Otomatik geçiş:** iRacing'e girince araca ve oturuma en uygun düzen seçilir. Pistte değilken (izlerken/garajda) Spotting düzeni kullanılır.
- Düzenleme ekranında hangi düzenin düzenlendiği yazar; panelde "Ekranda: …" gösterilir.

**Araçlar**
- **Pitwall Paneli** (ayrı pencere): sınıf sıralaması, pist haritası, hava, girdiler, yakıt stratejisi, tur süreleri, araç, mücadele, oturum.
- **Live Timing** (ayrı pencere): sınıf sıralaması ve yarış kontrol akışı (liderlik değişimi, 3+ sıra kaybı/kazancı, pit giriş/çıkış, sınıfın en hızlı turu, siyah/hasar/diskalifiye). **Tekrar** düğmesi iRacing tekrarını olayın 5 sn öncesine sarar, **Canlı** kamerayı o araca çevirir, **Canlıya dön**.
- **OBS tarayıcı kaynağı:** yerel web sunucusu (port ayarlanabilir). Her düzen için OBS adresi; "Yayın" türündeki düzen varsayılan. Yerel ağa açılırsa Pitwall ve Live Timing başka bilgisayar ya da tabletten izlenebilir.

**Henüz yok (sonraki adımlar):** MQTT sunucu/istemci, takım arkadaşlarıyla yakıt paylaşımı, League Builder, VR'da yerel gösterim, lastik paneli.

## 290926-01

İlk numaralı sürüm.

**Uygulama**
- Aynı anda yalnızca bir PitWall çalışabilir. İkinci kez açmaya çalışınca yeni kopya açılmaz, çalışan uygulamanın paneli öne gelir.
- Windows ile başlat seçeneği (Genel ayarlar). Windows ile başladığında arayüz açılmaz, sadece sistem tepsisinde çalışır. Masaüstü/başlat menüsü simgesiyle açılınca arayüz görünür.
- iRacing yarış ekranı kapanınca (ya da 3 saniye boyunca veri gelmezse) overlay'ler otomatik gizlenir.
- **Ctrl+Shift+R**: kontrol panelini öne getirir. Düzenleme modundayken panel overlay'lerin üstünde kalır, ayarları yaparken yerleşimi görebilirsin.
- Sürüm numarası panelde ve tepsi ipucunda görünür. Genel ayarlar > Hakkında bölümünde sürüm notları ve güncelleme denetimi.
- Otomatik güncelleme altyapısı (imzalı sürümlerle; kurulumu için docs/GUNCELLEME.md).

**Düzenleme ekranı**
- Overlay'e sağ tıklayınca konum menüsü: ekranın ortasına, yatayda/dikeyde ortala, dört köşe, üst/alt/sol/sağ orta; boyutu sıfırla, varsayılan konum, ayarlarını aç, kapat.
- Ekranın enine ve boyuna tam ortasındaki ızgara çizgileri daha belirgin.
- Üst çubuğa Demo kutucuğu eklendi.

**Görünüm**
- Genel opaklık: tüm overlay'lere tavan olarak uygulanır. Bir overlay %50 iken genel %50 yapılırsa %50 kalır; genel %35 yapılırsa o da %35 olur.
- Genel boyut orantılı çalışır (overlay %150, genel %80 ise sonuç %120). Küçülürken her overlay ekrandaki bölgesine göre sabitlenir: sol üsttekiler sol üst köşesinden, üst ortadakiler üst orta noktasından, sağ alttakiler sağ alt köşesinden vb. Okunamayacak kadar küçülmemesi için etkin boyut %35'in altına inmez.

**Overlay'ler**
- Kör Nokta: ikinci görünüm "Sadece çubuklar" (sağda ve solda iki çubuk, aradaki mesafe piksel olarak ayarlanabilir).
- Pedallar & Girdi: yeni direksiyon çizimi, "yumuşak grafik" seçeneği (iz yumuşak eğrilerle çizilir).
- Yakıt: oturuma turun ortasında bağlanılınca o yarım tur ölçülmez, tur başı ortalama bozulmaz.
- Düzenleme ekranında sağ kenardaki overlay'lerin etiketi sağa hizalanır (ekrandan taşmaz).

**Demo**
- Yarışın 7. dakikasından başlar; tur süreleri ve yakıt geçmişi hemen dolu gelir.
- Kör nokta: soldan, sağdan ya da iki yandan, farklı göreli hızlarda rastgele geçişler (bizi geçen ya da bizim geçtiğimiz araçlar).
- Bayraklar birkaç saniyede bir rastgele görünür (sarı, mavi, enkaz, güvenlik aracı, son tur, hasar, siyah).
- Hava ve pist sıcaklığı 15 saniyede bir çok az değişir; olay puanı 15 sn – 1 dk arasında rastgele 1x/2x/4x artar.
- Yakıt tüketimi turdan tura değişir; yakıt azalınca pite girilip ikmal yapılır.
