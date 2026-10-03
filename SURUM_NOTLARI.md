# SRTR Pitwall sürüm notları

Sürüm biçimi **GGAAYY-NN**: yükseltmenin yapıldığı gün/ay/yıl ve her değişiklikte bir artan sıra numarası.
En yeni sürüm en üstte.

## 041026-91

- **Girdiler ve Pedal Seti:** "Genişlik (en az)" ayarı; düzenleme modunda kenardan sürükleyerek de ayarlanır.
- **Lastikler:** varsayılan olarak yalnızca pitteyken görünür ("Sadece pitteyken göster").
- **Arka plan %0:** çerçeve, gölge ve bulanıklık da tamamen kaybolur (silik çerçeve izi kalmaz).
- **Canlı Sohbet:** sohbet çalışırken ve yayın canlıyken Demo açılsa da gerçek sohbet gösterilir.
- **Mesajlar overlay'i:** Demo'da örnek mesaj göstermez; ekip üyesi olduğun sürücülerin odalarındaki mesajlar da gelir; her kopyada arkadaş / ekip / seçili kişiler ayrı seçilir; arkadaş ve ekip mesajları ayrı ayrı sesli okunabilir (aynı mesaj bir kez okunur).
- **Olaylar ve Live Timing › Tekrar:** araç numarası kodlaması düzeltildi (07 gibi numaralarda kamera geçmiyordu), sarma doğrulanıyor, gerekirse kareyle sarılıyor, kamera sarma bittikten sonra değişiyor; uyarı artık gerçek sonucu yazıyor. Live Timing'deki Tekrar da kamerayı o araca çeviriyor.
- **Arkadaşlar:** gelen mesaj sesi her pencerede çalar; sistem tepsisi simgesinde okunmamış mesaj işareti ve sayısı (Rahatsız etme'de ses, uyarı ve tepsi işareti gelmez); çevrimiçi / yarışta bilgisi artık sunucu saatine göre (c74); "Çevrimdışı görün"den dönünce gizli kalma hatası düzeltildi.
- **Overlaylarım:** "Düzen oluştur" yerine "+ Overlay Ekle": seçili overlay'i Düzenler'de seçili düzene ekler.
- **Düzenler / Yayın düzenleri:** herhangi bir düzen yıldızla ya da sağ tıkla "Varsayılan yap" ile varsayılan yapılabilir; varsayılan ve son kalan düzen silinemez.

## 031026-90

- Şu overlay'ler artık PRO: Kafa Kafaya, Yarış Sonucu, Sürücü Kartı, Ekip Çağrısı, Fark Grafiği, Yakın Takip, Rakip Takibi, Hasar Göstergesi, Piste Dönüş, Viraj Analizi, Mesajlar (c72).
- Overlaylarım: yukarı / aşağı ok tuşlarıyla listede önceki / sonraki overlay seçilir.
- Pit Penceresi: "TEMİZ HAVA" etiketi iki satır.
- Ödeme bölümlerinde (program ve site): "Patreon ile sadece aylık abonelik alınabilir" notu.

## 031026-89

- Yönetim › Planlar ve fiyatlar: "Ko-fi bağlantısı (Türkiye)" alanı. Türkiye'den bağlananlara (site ve program) Ko-fi düğmesi bu bağlantıyı açar; boşsa genel bağlantı kullanılır (c71).

## 031026-88

- Yönetim › Planlar ve fiyatlar: "Patreon bağlantısı (Türkiye)" alanı. Türkiye'den bağlananlara (site ve program) Patreon düğmesi bu bağlantıyı açar; boşsa genel bağlantı kullanılır (c70).

## 031026-87

- Yöneticiye gelen "Yeni ödeme" bildiriminde ödemenin kaynağı da yazıyor (Lemon Squeezy / Patreon / Ko-fi).

## 031026-86

- Web sitesi: başlıklarda overlay sayısı "50+" olarak yazıyor.
- Web sitesi: overlay sayısı artık doğrudan overlay listesinden hesaplanıyor (tarayıcı önbelleğinde eski `counts.js` kaldığında ana sayfada 35 yazıyordu).

## 031026-85

- **16 yeni overlay:** Pit Penceresi, Stint Özeti, Sürücü Değişimi, Ekip Çağrısı, Sektör Süreleri, Fark Grafiği, Rakip Takibi, Fren ve Vites İşareti, Pist Limiti, Hasar Göstergesi, Rüzgâr Pusulası, Start Işıkları (ışıklar sönünce yeşil / GO), Sürücü Kartı, Yarış Sonucu, Kafa Kafaya, Hedef Çubuğu.
- Düzenler ve Yayın düzenleri sayfasında tuvalin altında kısayol bilgisi: Space + fare tekeri (yakınlaştır / uzaklaştır), Ctrl+Z / Ctrl+Y, Alt.
- Topluluk düzen ve temalarını kullanmak, puan vermek ve yorum yazmak artık varsayılan olarak ücretsiz hesaba açık (c69).
- Düzeltme: İngilizce arayüzde çevrilmemiş metinlerin ilk harfi değişiyordu ("Type" → "Lype").
- Düzeltme: bazı yeni overlay tasarımlarında kök sınıf çakışması yerleşimi bozuyordu.
- Web sitesi: ana sayfada Overlay Galerisi (51 overlay, ekran görüntüsü ve ayrıntılı açıklama), ücretsiz hesap ve ekip (uygulamadan ya da telefondan spotter'lık, uzaktan yakıt / lastik ayarı) metinleri güncellendi; 13 dile çevrildi.

## 031026-84

- **Kenardan genişlik ayarı artık Sıralama Tablosu ve Yakındakiler'de de var:** ikisine "Genişlik (en az)" ayarı eklendi; düzenleme modunda (ve düzen tuvalinde) pencerenin sağ / sol kenarındaki turuncu tutamaçtan sürükleyerek değiştirilir. Sesli Sohbet overlay'inde de kenardan "en fazla genişlik" ayarlanır.
- Kenardan boyutlandırılabilen overlay'ler: Sıralama Tablosu, Yakındakiler, Yakın Takip, Canlı Sohbet (genişlik + yükseklik), Mesajlar, Altyazı, Anket, Sesli Sohbet, Pist Haritası (genişlik + yükseklik), Düz Harita, Çubuk Spotter (yükseklik), ERS, Veri Kutusu, Webview (genişlik + yükseklik). Köşeler eskisi gibi tümünü ölçekler.

## 031026-83

- **Daha okunaklı varsayılan yazı (bütün overlay'ler):** yazı tipi Inter, boyut 14 px, orta kalınlık, yazı gölgesi açık; soluk (ikincil) yazı rengi biraz açıldı. Yazı ayarlarına hiç dokunmamış kurulumlar bir kez yeni varsayılana geçer; yazı tipini, boyutunu ya da kalınlığını kendisi değiştirmiş olanlara dokunulmaz. Hepsi Görünüm sayfasından değiştirilebilir.

## 031026-82

- **Sıralama Tablosu ve Yakındakiler:** üst / alt bilgi satırındaki yazı ve simgeler varsayılan olarak %20 büyütüldü; "Bilgi satırı yazı boyutu" ayarıyla (%80–%200) değiştirilebilir.

## 031026-81

- **Yönetim › Yedekleme (yeni):** tek tıkla tam yedek. Veritabanı tabloları, üye listesi ve yüklenen bütün dosyalar / görseller bilgisayarda seçilen yere tek bir .zip olarak iner (şema dosyası ve geri yükleme notu içinde). Parolalar ve gizli anahtarlar yedeğe girmez.
- **Yedekten geri yükleme:** aynı .zip panelden seçilir; dosya doğrulanır, özet gösterilir, onay için GERİ YÜKLE yazılır. İşlemden önce kendiliğinden bir güvenlik yedeği alınır. Tablolar yedekteki hâline döner, dosyalar yeniden yüklenir; üye hesapları (giriş bilgileri) değişmez, sonradan katılan üyelerin profili korunur, yönetici yetkin korunur.
- Geri yükleme sırasında tablo bağları geçici olarak kaldırılıp sonunda yeniden kurulur; yarıda kalırsa panelde "Onar" düğmesi çıkar.
- Veritabanı: c67 (yedekleme) uygulandı; c68 (güvenli geri yükleme) uygulanmayı bekliyor. c68 uygulanmadan panel geri yüklemeyi başlatmaz.

## 031026-80

- **Pedal Seti:** varsayılan görünüm artık "Dikey çubuklar"; "Pedal seti" görünümü PRO oldu; "Dikey kule" görünümü kaldırıldı (seçili olanlar Dikey çubuklar'a döner). Web sitesi ve diller güncellendi.

## 031026-79

- **Pedal Seti / Pedallar & Girdi:** "Direksiyon", "Vites ve hız" ve diğer aç / kapat seçenekleri kapatılınca overlay'den kalkmıyordu (overlay ilk açıldığındaki ayarları kullanmaya devam ediyordu). Ayar değişiklikleri artık anında uygulanıyor.

## 031026-78

- **Kurulum:** kurulum arayüzü artık sadece İngilizce (dil seçme penceresi kaldırıldı).
- **Anket kısayolu (F9) ile sesli soru:** Konuşma → yazı açıkken kısayolu basılı tutup soruyu söylediğinde metin Canlı Sohbet › Anket'teki soru alanına yazılır; tuşu bırakınca anket o soruyla başlar. Kısa dokunuş eskisi gibi sorusuz anketi başlatır; anket sürerken basmak bitirir. Dikte edilen soru altyazıya yazılmaz.

## 031026-77

- **Düzenleme tuvali:** imleç tuvalin üstündeyken Space basılı tutup fare tekeriyle yakınlaştırma / uzaklaştırma (Düzenler ve Yayın sayfaları).
- **Yarış sonrası Olaylar penceresi:** pencerenin boş açılmasının asıl nedeni (pencere izin listesinde yoktu, ayarları yükleyemeyip hiç çizilmiyordu) giderildi. Ayrıca: oturum özeti başlığı (pist, araç, oturum, tur, en iyi tur, bitiş sırası, olay puanı), "Bu oturum / Önceki oturum" geçişi, sayılı süzgeçler, metin kopyalama ve CSV kaydı, ayar paneli (kendiliğinden açılma, en az olay sayısı, kaydedilecek türler). Olay olmayan oturumda replay başlayınca boş pencere açılmıyor; oyun değiştirince biten oturum silinmiyor; bağlantı kopup gelince sahte olay yazılmıyor.
- **Arkadaşlar:** "Mesajlar açık" düğmesi kaldırıldı; mesaj alma her zaman açık.
- **Windows başlangıcı:** uygulama varsayılan olarak Windows açılışında sistem tepsisinde başlar (mevcut kurulumlarda da bir kez açılır; Ayarlar › Genel'den kapatılabilir).
- **Canlı Sohbet (PRO):** Kanallar sekmesinde "Üst çubuğa başlatma düğmesi ekle" seçeneği; açılınca üst çubukta oyun seçicinin solunda sohbeti başlatan / durduran düğme çıkar.

## 031026-76

- **Overlaylarım:** overlay sırası artık fareyle sürükleyip bırakarak değiştiriliyor (oklar kaldırıldı; sağ tık menüsü duruyor).
- **Sıralama Tablosu ve Yakındakiler:** her sütunun genişliği ayarlanabiliyor (sütun listesinde − / px / + / ↺; "Sütun genişliklerini sıfırla").
- **Seslendirme: Edge doğal sesleri.** Python sohbet uygulamandaki ses motoru (Microsoft Edge çevrimiçi nöral sesleri; Ahmet, Emel ve diğer diller) eklendi ve varsayılan yapıldı. İnternet gerekir; ulaşılamazsa o mesaj Windows sesiyle okunur.
- **Direksiyon Ekranı: Mercedes W13.** Gönderdiğin iki sayfalı ekran düzeniyle yeniden yapıldı ("Sayfa" ayarı; sonraki sayfa kısayolu da çalışır).
- **Dashboard Tasarımcısı:** tasarımların Direksiyon Ekranı › Görünüm listesinde "Tasarımlarım: …" olarak doğrudan seçilebiliyor; tasarımcıya "Direksiyon Ekranı'nda kullan" ve "Paylaş" düğmeleri eklendi.
- **Topluluk › Direksiyon Ekranları:** tasarımlar önizlemeyle paylaşılır, indirilir, puanlanır ve yorumlanır; şikâyet ve moderasyon diğer paylaşımlarla aynı.
- **Yeni overlay: Pedal Seti.** Dikey çubuklar, kompakt şerit, yatay şeritler, halka göstergeler, LED segmentler, dikey kule, pedal seti ve çerçevesiz HUD tasarımları Pedallar & Girdi'den buraya taşındı; varsayılan görünüm Pedal Seti. Bu tasarımları kullanan ekli overlay'ler kendiliğinden Pedal Seti'ne çevrilir (konum korunur).
- **Logolar:** Ford biraz küçültüldü; McLaren logosu gönderdiğin görselle değiştirildi.
- **Sohbete yaz (YouTube / Kick):** Client ID uyuşmazlığı, IPv6 localhost dinleyicisi ve gizlenen hata nedenleri düzeltildi; her platforma "Bağlantıyı test et" eklendi. chat-oauth işlevi güncellendi.
- **Ekip:** sohbet odası ve Ekip Pitwall'ı her 3 saniyede sıfırlanıp yeniden yükleniyordu; artık yerinde güncelleniyor, kaydırma konumu korunuyor (web sitesi paneli dahil).
- Veritabanı: c66 (paylaşılan direksiyon ekranları, puan ve yorumları).

## 031026-75

- Windows derleme hatası giderildi (E0061): sesli komutların sesli yanıtı, yeni ses motorunun 6 parametreli çağrısına uyarlandı. Başka değişiklik yok.

## 031026-74

**Düzenler ve overlay'ler**
- Düzen kilitleme: satırdaki kilit simgesiyle (ya da sağ tık) düzen kilitlenir; kilitli düzen değiştirilemez, silinemez, ekranda da taşınmaz. Sabit "Varsayılan" düzen artık iğne simgesiyle gösteriliyor.
- "Düzenlerim" başlığındaki "+" düğmesinin boşluğu düzeltildi.
- Daha önce paylaşılan düzen yeniden paylaşılırken "Öncekini güncelle" / "Yeni olarak paylaş" sorulur.
- Düzenleme modunda yayın düzenleri listelenmiyor. Overlay'ler dört köşeden o yöne doğru büyütülür; genişlik / yükseklik ayarı olan overlay'ler (sohbet, mesajlar, altyazı, webview, veri kutusu, pist haritası) kenarlarından tutulup genişletilir.
- Sol üstteki logoya tıklayınca pitwall.simracetr.com açılır.
- Düzene eklenen overlay'ler listenin başında, eklenme sırasıyla alt alta durur. Overlaylarım'da overlay sırası değiştirilebilir (oklar ya da sağ tık; "Sıralamayı sıfırla").
- Her overlay'e "Arka plan opaklığı" ayarı eklendi. "Görünüm (bu overlay)" bölümü kaldırıldı (kayıtlı görünümler çalışmaya devam eder).
- Yayın düzenleri: "Overlay kaynağı" kaldırıldı (bağlı düzenlerde sadece "Bağlantıyı kopar" kalır); ızgara, kenarlar ve arka plan seçenekleri eklendi; overlay taşınırken OBS'te de anlık hareket eder.
- Web sunucusu varsayılan olarak açık (mevcut kurulumlarda bir kez açılır).

**Overlay'ler**
- Yeni overlay: **G-Force** (g-çemberi, çubuklar, sayısal, sürtünme çemberi). Yayın Sahnesi listelerden gizlendi.
- Sıralama Tablosu: sınıfımın ilk 8'i; olay puanı, pozisyon ve fren dengesi açık; "Tahmini iRating değişimi (yarış)" sütunu. Aynı ayarlar Yakındakiler'de. İkisinde de sütun genişlikleri elden geçirildi.
- Lisans / SR rozeti yeniden tasarlandı (C ve B dahil okunaklı).
- Demo: PRO üyelerin bayrağı, iRating ve SR'si gösterilir; veri yoksa rastgele doldurulur.
- Profilde iRacing iR / SR artık kategori başına (Sports Car, Formula, Oval…) saklanıp etiketli gösterilir.
- Yakın Takip: eşik türü Süre / Mesafe / Sınırsız; tur farkı +1T / −1T; yeni varsayılanlar (kendi satırım kapalı, lisans ve lastik açık, bulanıklık kapalı, 560 px, %90).
- Yakıt: SON / ORT 5 / ORT 10 ayrı ayrı açılıp kapanır; sade varsayılan görünüm ve yeni tasarımlar (ibreli ve kompakt çubuk PRO).
- Delta, Lastikler, Pit Hızı, Canlı Hava, Oturum & Bayraklar, Pedallar & Girdi: yeni tasarımlar.
- Pedallar & Girdi: son tur / en iyi tur satırları (kapalı), gaz / fren yüzdesi (açık), bağlı direksiyona göre otomatik direksiyon görseli (genel çizim).
- Çubuk Spotter: ok uçlu görünüm kaldırıldı.
- Pist Haritası ve Mini Harita: kendi aracın kırmızı ok; pist içi dolgusu kapalı.
- DigiFlags: sarı bayrağın yeşil görünmesi düzeltildi; ceza uyarısı satırı eklendi.
- Oturum & Bayraklar: bayrak uyarısı pencereyi aşağı kaydırmıyor.
- Mesajlar: birden fazla eklenebilir; kaynak olarak grup sohbetleri ve ekip odası seçilebilir; ekranda kalma süresi elle girilir (varsayılan 3 dk); genişlik ayarı; ekip mesajlarını ayrı sesle okuma.

**Canlı sohbet ve ses**
- Canlı Sohbet varsayılanları: 480 px, 10 mesaj, 16 px, izleyici çubuğu normal, saat açık. Mesajlar alttan dizilir.
- Varsayılan kanallar: YouTube, Kick, Twitch (bu sırayla).
- Altyazı: kaynak Mikrofon / Bilgisayar sesi (Discord vb.) / İkisi, cihaz seçimi ve konuşmacı etiketi. Bilgisayar sesi ve Türkçe için çevrimiçi (Whisper) motoru gerekir.
- Konuşma → yazı: "Eleman bulunamadı (0x80070490)" hatası giderildi (kurulu dile düşer, anlaşılır mesaj verir); mikrofon seçimi eklendi.
- Streamlabs: düşen uyarı türleri, bağlantı kopması ve "sohbet açıkken bağlanma" sorunu düzeltildi; durum göstergesi ve test düğmeleri eklendi.
- Seslendirme: Windows'taki bütün sesler (kadın / erkek, dile göre süzme).
- Ses mühendisi: mikrofon seçimi; sesli komut varsayılan açık; bas-konuş kısayolları Ayarlar › Kısayollar'da da var.
- Demo açılınca ses varsayılan olarak kapalı.

**Ekip ve arkadaşlar**
- Ekip Pitwall'ı: odadaki üyeler ve pit yetkilisi görünür; tek mesaj kutusu ve ekip sohbet odası; 16:9'a uygun üç sütunlu yerleşim; ayrı pencerede açılır (arkadaş listesinden "Pitwall'ını izle").
- Ekip mesajları sağ üst yerine ekranın alt ortasında kutucukta görünür (Ayarlar › Paylaşım › Ekip'ten kapatılabilir).
- Arkadaşlar: sağ tık menüsünde uygulamanın düz renge dönmesi düzeltildi. Grup satırında sağ tık menüsü (ayrıl, sil), sahiplik devri; sitede grubu silme ve üye çıkarma.
- Durum menüsü: Çevrimiçi / Rahatsız Etme / Çevrimdışı. Çevrimdışı görünen üyeyi yöneticiler "gizleniyor" olarak görür.

**Diğer**
- Filigran logosu (PNG) artık uygulanıyor; sayfada önizlemesi var.
- Güncellemeden sonra panel açıksa yine açık başlar.
- Pitwall Paneli penceresinde göstergeler kartlara sığacak şekilde ölçeklenir.
- Veritabanı: c63 (kategori başına iRacing verisi), c64 (ekip sohbet odası), c65 (görünmez durum, grup sahipliği devri).

## 031026-73

- **Overlaylarım genel bir sekme oldu.** Düzen seçici, "Açık overlay'ler" bölümü ve "Tümünü kaldır" kaldırıldı. Buradaki ayarlar her overlay'in **varsayılanı**: bir overlay bir düzene eklendiğinde bu ayarlarla gelir. "Sıfırla" fabrika ayarlarına döner. Alttaki düğme artık "+ Düzen oluştur" ve Düzenler sayfasını açar. Güncellemede varsayılanlar, o an etkin düzendeki ayarlarından alınır (yaptığın ayarlar kaybolmaz).
- **Düzenler sayfası yeniden düzenlendi.** Solda en üstte düzenler alt alta: başlıkta "+" (yeni düzen), her satırda çöp kutusu (onay sorar). "Varsayılan" düzen sabit: adı çift tıkla değişir, silinemez. Sağ tık: Düzeni kopyala. Delete tuşu onay sorarak siler. Listede seçtiğin düzen ekranda etkin olan düzendir.
- **Düzenlerin altında bütün overlay'ler.** Tıklayınca ayarları sağda açılır ve o düzene özel değiştirilir. Çift tık ya da "+" overlay'i seçili düzene ekler; ekli olanlar yeşil görünür, çift tık ya da "−" ile çıkarılır. Sadece Veri Kutusu ve Webview birden fazla eklenebilir (Ayarlar › Genel'deki "birden fazla eklenebilsin" seçeneği kaldırıldı).
- **Tuval araçları:** "+ Bu monitöre ekle" yerine geri al / yinele (yeni ikonlar; düz oklar kaldırıldı) ve yakınlaştır / uzaklaştır. **"Ekranda düzenle" artık çalışıyor:** kilidi açar, Görünür'ü ve (oyun bağlı değilse) Demo'yu kendiliğinden açar, seçili düzeni ekranda taşınabilir hâle getirir.
- **Yayın düzenleri aynı mantıkta:** solda yayın düzenleri ("+", çöp kutusu, sabit "Varsayılan") ve overlay listesi, sağda ayarlar. Hazır sahneler kaldırıldı (Sahne overlay'i listeden eklenebilir). Düzenler artık yayın düzenlerine, yayın düzenleri de düzenlere kopyalanmıyor.
- **Uygulama penceresi:** ilk açılışta daha geniş; sonraki açılışlarda en son bırakıldığı konumda ve boyutta (ekranı kaplamışsa öyle) açılır.
- Düzen sırası (yukarı / aşağı taşı) artık yeniden başlatınca korunuyor.

## 021026-72

- **Ekip sayfası: Ekrana sığdır.** Açıldığında panelin tamamı (yarış durumu, Ekip Pitwall'ı, pit kontrolü) kaydırmaya gerek kalmadan ekrana sığacak şekilde ölçeklenir; geniş ekranda iki sütuna dizilir. Pencere boyutu ya da içerik değiştikçe kendiliğinden yeniden ayarlanır. Tercih hatırlanır.
- **Ekip sayfası: Tam ekran.** Menüler gizlenir, ekip paneli tüm ekranı kaplar; Esc ile çıkılır. İkisi birlikte kullanılabilir (ikinci monitör / tablet için).
- Aynı iki düğme web sitesindeki ekip panelinde de var (Ekip sayfası ve arkadaş listesinden açılan panel).

## 021026-71

- **Ekip ekranı artık "yenilenmiyor":** uygulamada ekip listesi her 12 saniyede yeniden yüklenirken sayfanın tamamı baştan kuruluyordu; liste artık yerinde güncelleniyor.
- Web sitesindeki ekip paneli (Ekip sayfası ve arkadaş listesinden açılan panel) her yenilemede içeriği silip baştan yazıyordu; artık yalnızca değişen değerler güncelleniyor. Kırpışma yok, kaydırma konumu, odak ve animasyonlar korunuyor.
- **Arkadaş listesi sağ tık menüsü** artık liste başlığının ya da kaydırma alanının altında kalmıyor: en üst katmanda, tıkladığın noktada açılıyor ve pencereden taşmıyor (sığmazsa kendi içinde kayar). Dışarı tıklayınca, kaydırınca ya da Esc ile kapanır.
- Geçici bağlantı hatasında ekip listesi kaybolmuyor, eldeki liste gösterilmeye devam ediyor.

## 021026-70

- **Üst çubuk bağlantıları:** Yönetim › Üst çubuk bağlantıları bölümünden üst çubuğun soluna bağlantı düğmeleri eklenebiliyor (en fazla 12). Varsayılan olarak SimRaceTR web sitesi, Discord ve WhatsApp bağlantıları ekli.
- Her bağlantıyı kimin göreceği ayrı ayrı seçilebiliyor: giriş yapmamış (free), üye, PRO. Bağlantılar tek tek kapatılıp sıralanabiliyor.
- Hazır simgeler yerine kendi png / ico dosyan yüklenebiliyor.
- Bağlantılar web sitesinin alt bölümünde de gösteriliyor.
- Veritabanı: c61 (app_config.top_links, admin_set_top_links, site kovasında ico desteği).

## 021026-69

- **Canlı Sohbet overlay'i düzeltmeleri:**
  - Demo modu açıkken (yayın canlı olsa bile) overlay sürekli akan örnek sohbeti gösterir; OBS tarayıcı kaynağında da. Önceden demo, 5 mesajlık kısa önizlemeyi gösterip kayboluyor, yayın canlıyken hiç çalışmıyordu.
  - OBS sayfası artık giriş / PRO / demo kararını programdan alır (tahmin etmez).
  - Canlı algılama: sohbet bağlıyken son 3 dakikada mesaj geldiyse yayın canlı sayılır (Twitch / Kick'te durum sorgusu "kapalı" dese bile).
  - Yeni seçenek "Yalnızca yayın canlıyken göster" (varsayılan açık). Canlı Sohbet sayfasında "Overlay durumu" satırı: gösteriliyor / neden gizli.
  - Anket ve Altyazı overlay'leri de demo modunda örnek gösterir.
- **Ekip paneli görselleştirildi (program + site):** üstten araç çizimi üzerinde dokunulabilir 4 lastik (kalan diş dolgusu, sıcaklık, "değişecek" işareti), yakıt deposu grafiği (seviye, bitiş işareti, pit sonrası seviye, kaydırıcı ve hızlı düğmeler: Bitişe kadar, +5 L, +10 L, Dolu, Yakıt ekleme), simgeli pit servisi şeridi, yarış durumu başlığı (sıra rozeti, tur halkası, bayrak), araçlı spotter göstergesi; komut gönderilince ilgili öğede bekliyor / uygulandı / reddedildi animasyonu.
- **Ford logosu** yenilendi.
- Yeni metinler programda 14, sitede 13 dile çevrildi.

## 021026-68

- **Direksiyon Ekranı (dashboard):**
  - 9 yeni PRO araç ekranı, araca göre otomatik: Ferrari 296 GT3, McLaren 720S GT3 Evo, Porsche 911 GT3 R (992), Porsche 963 GTP, Cadillac V-Series.R, Ferrari 499P, Dallara P217 LMP2, Mercedes W13, Formula (genel). Özgün çizim; marka yazısı / logosu yok.
  - Hibrit araçlarda batarya, harcama modu, MGU-K gücü; DRS / P2P olan araçlarda durumları otomatik gösterilir ("Hibrit bilgisini göster").
  - İsteğe bağlı ABS ve TC bilgisi; özel renkler (yazı, etiket, arka plan, devir renkleri, uyarı).
  - Öğe özelleştirme: devir ışıkları varsayılan %70 boyutta; vites, hız, delta, tur süreleri, yakıt, lastik, sıcaklıklar için göster / boyut / renk; köşe, boşluk, çerçeve, etiketler. Araç ekranlarında ölçek.
  - **Dashboard Tasarımcısı (PRO):** Araçlar › Dashboard Tasarımcısı'nda kendi ekranını tasarla (sürükle-bırak, ~75 veri alanı, koşullu renk, 8 sayfaya kadar, şablonlar, dışa / içe aktar); Direksiyon Ekranı'nda "Özel tasarım" olarak overlay'e eklenir.
  - **Başka cihazda aç (PRO):** direksiyon ekranını aynı ağdaki telefon / tabletten aç (adres + QR kod; "Ağdaki cihazlara izin ver" açık olmalı).
- **Sesli komut (bas-konuş, PRO):** Sesli Mühendis › Sesli komut. Klavye tuşu ya da direksiyon düğmesi ata; basılı tutup sor: yakıt, yakıtla kaç tur, bitişe gereken yakıt, olay puanı, sıra, öndeki / arkadaki fark, son / en iyi tur, kalan süre, lastik, hava, öndeki / arkadaki sürücü, "tekrarla", "sus / konuş", "radyo kontrol" (24 komut, 15 dil; arayüz dilinde dinler). Cevabı mühendis sesle verir; altyazı overlay'inde sorun "Sen" etiketiyle görünür.
- **Ekip:**
  - "Ekibim pit ayarlarımı değiştirebilsin" PRO üyede varsayılan açık (elle kapattıysan kapalı kalır).
  - Arkadaşa sağ tık: "Ekibe ekle (görebilir)", "Pit ayarlarını değiştirebilir" (PRO), "Ekipten çıkar", "Pitwall'ını izle".
  - **Ekip Pitwall'ı:** ekibinde olduğun sürücünün çevresindeki araçlar, farklar ve eğilimi, tur / delta, bayraklar, hava, yakıt, pit servisi ve yanında araç göstergesi (~1–2 sn gecikmeli); hazır spotter mesajları. Programda Sürücüler › Ekip'te, sitede Ekip panelinde.
  - **Sürücünün konuşma altyazısı (PRO):** sürücüde Konuşma → yazı açıksa söyledikleri, ekibin mesaj yazdığı yerde altyazı olarak görünür.
- **Radar ve Çubuk Spotter:** "Görsel Spotter" artık "Radar" (görünüm seçeneği kaldırıldı). Yeni overlay "Çubuk Spotter": yalnızca sağ / sol yan yana gelişleri gösterir; kalınlık 24 px, yükseklik 180 px, çubuklar arası 600 px, eklenince ekran ortasında. Görünümler: Düz çubuk (ücretsiz); Yay (uçları soluk), Soluk uçlu, Segmentli, Ok uçlu, Neon çizgi, Parantez (PRO).
- **Her overlay'de özel görünüm:** "Görünüm (bu overlay)" bölümü: renkler (yazı, vurgu, arka plan, satır, kenarlık, olumlu / olumsuz / uyarı), opaklık, köşe, yazı tipi ve boyutu, yoğunluk, gölge, hazır görünümler (Koyu cam, Düz siyah, Açık, Yüksek kontrast, Neon…), görünümü kopyala / yapıştır, tüm overlay'lere uygula.
- **Düzenler:** Düzenlerim ve Yayın düzenleri'nde düzen adına sağ tık: yeniden adlandır, kopyasını oluştur, yayın düzenine / düzene kopyala, varsayılan yap, toplulukta paylaş, yukarı / aşağı taşı, OBS adresini kopyala, bağlantıyı kopar, sil (F2 / Delete).
- **Overlay'ler sayfası düzeltmesi:** sayfa artık seçtiğin düzeni düzenler ("Düzen:" seçici); ekrandaki "Ayarlarını aç" o an gösterilen düzenin overlay'ini açar (önceden hep etkin düzene gidiyordu). Toplam overlay sayısı ve açık olanlar başlıkta.
- **Demo ve profil:** demo modunda PRO üyeler kendi bayrağı, iRating ve lisansıyla görünür (üye iRacing'de bu sürümle en az bir kez sürdüyse; bilgisi olmayanda bayrak gösterilmez). Profilde iRating ve lisans / SR; "iRacing bilgilerimi profilimde göster" ayarı.
- **Web sitesi:** Özellikler sayfası güncellendi (34 overlay, Radar / Çubuk Spotter, yeni araç ekranları, tasarımcı, uzak ekran, sesli komut, Ekip Pitwall'ı, özel görünüm); profilde iRacing bilgileri.
- Sunucu: c56–c60. Yeni metinler programda 14, sitede 13 dile çevrildi.

## 021026-67

- **Web sitesi sohbeti: gruplar ve takımlar.** Arkadaşlar panelinde "Gruplar" ve "Takımlar" bölümleri: grup ve takım sohbetlerini okuma / yazma, okunmamış sayaçları, üyeler, sessize alma, gruptan / takımdan ayrılma; takım anketleri salt okunur. (Grup kurma, davet, anket oylama programda.)
- **Mesaj menüsü her yerde aynı (program + site):** mesaja tıklayınca (sağ tık / uzun basma) Kopyala, Benden sil, Raporla; kendi mesajında ya da yetkin varsa Herkesten sil. Yeni: grup sohbetinde "Benden sil", takım sohbetinde "Raporla". (c55)
- **Ekip, arkadaş listesinden:** ekibinde olduğun arkadaşların yanında sitede "Ekip" düğmesi ve yarışırken canlı satır (pist · sıra · yakıtla gidilecek tur); tıklayınca canlı ekip paneli (izin varsa pit kontrolleriyle) panelin içinde açılır. Programda aynı arkadaşlarda Ekip düğmesi Sürücüler › Ekip sayfasını o sürücüyle açar.
- Sitede giriş yaptıktan sonra geldiğin sayfaya (ör. Ekip) geri dönülür.
- Yeni metinler programda 14, sitede 13 dile çevrildi.

## 021026-66

- **Derleme düzeltmesi:** projeden kaldırılan ama depoda kalan dosyalar (ör. `LogosPanel.tsx`) derlemeyi bozuyordu. Derleme ve site yayını artık önce `scripts/temizle.mjs` ile bu eski dosyaları siler (yanlışlıkla `website/` içine kopyalanmış proje dosyaları dahil).

## 021026-65

- **Yeni: Ekip (uzaktan pit ekibi).** Ayarlar › Paylaşım › "Ekip (uzaktan pit)": arkadaşlarına Görebilir / Değiştirebilir yetkisi ver (en fazla 10). Ekip üyesi programdaki Sürücüler › Ekip sayfasından ya da telefondan web sitesindeki Ekip sayfasından (crew.html) canlı yarış verini izler: sıra, tur, kalan süre, yakıt ve bitişe gereken yakıt, ayarlı pit servisi, lastikler, bayraklar. "Ekibim pit ayarlarımı değiştirebilsin" açıksa (varsayılan kapalı) iRacing'de yakıt miktarı, lastik değişimi (4'ü / tek tek / hiçbiri), hızlı tamir, vizör filmi ve "tümünü temizle" komutlarını uzaktan gönderir, kısa mesaj yazar. Her komut ekranında bildirim olarak görünür; "Ekip kontrolünü durdur" düğmesi / kısayolu anında keser. Değiştirme yetkisi vermek PRO (`social.crew`), izlemek ücretsiz. Diğer oyunlarda yalnızca izleme. (c53)
- **Yeni overlay: ERS ve Batarya.** Hibrit araçlarda batarya doluluğu, tur başı işareti, bu turdaki net fark, tur ortalaması, boşalmaya / dolmaya kalan tur, MGU-K / MGU-H gücü, harcama modu, tur harcama hakkı, P2P ve DRS. 5 tasarım: Yatay çubuk, Dikey pil, Kompakt (ücretsiz); Halka gösterge, Detaylı panel (PRO). Düşük / dolu batarya uyarısı; hibrit olmayan araçta kendiliğinden gizlenir. iRacing tam; LMU / rF2 ve AC kısmi; ACC ve AMS2 yok.
- **Web sitesi: Özellikler sayfası (features.html).** 33 overlay'in tamamı öne çıkan özellikleri ve ÜCRETSİZ / PRO etiketiyle; Canlı Sohbet, Sesli Mühendis (1.493 ifade, 3.685 ses kaydı, 22 kategori), Topluluk (düzen, yayın düzeni, ekran görüntüsü, tema paylaşımı), arkadaşlar / gruplar / takımlar, araçlar (telemetri, ekran görüntüsü, düzenler, yayın düzenleri, VR), oyun uyumluluk tablosu, ücretsiz ve PRO.
- **Web sitesi yönetim paneli: "Ana sayfa görselleri".** Ana sayfa ve Özellikler sayfasındaki 14 görsel yuvası için görsel yükle / alt metin / varsayılana dön; ana sayfa galerisi (ekle, sil, sırala; en fazla 24). (c54)
- Yeni metinler programda 14, sitede 13 dile çevrildi.

## 021026-64

- **Yayın düzenleri: kendi düzenini kullan.**
  - **Bağlı düzen:** "Overlay kaynağı" → "Düzenimi kullan: <ad>" ya da "Etkin düzeni izle". Yayın düzeni o düzenin açık overlay'lerini canlı gösterir; normal düzende yaptığın her değişiklik OBS'e kendiliğinden yansır. Overlay başına "Yayında gizle". "Bağlantıyı kopar" bağımsız kopyaya çevirir.
  - **Düzenden kopyala:** Yayın sayfasında "Düzenden kopyala…", Düzenler sayfasında "Yayın düzenine kopyala": açık tüm overlay'ler aynı ayar, ölçek ve saydamlıkla, konumları orantılı taşınarak gelir.
  - **Yayın çözünürlüğü:** monitör yerine 1280×720, 1920×1080, 2560×1440, 3840×2160, 1080×1920 (dikey) ya da Özel. Değiştirince konumlar (istersen overlay boyutları da) orantılı taşınır; OBS kaynağı için önerilen genişlik / yükseklik gösterilir.
- Yeni metinler 14 dile çevrildi.

## 021026-63

- **Yeni overlay: Yakın Takip.** Önündeki ve arkandaki araçlar makara (slot makinesi) gibi dönen dikey bir şeritte: araç eşik mesafesinin içine girdikçe satırı büyür, netleşir ve parlar; uzaklaştıkça küçülüp silikleşir. Öndekiler aşağı, arkadakiler yukarı doğru döner. 1–5 araç ön / arka, mesafe eşiği (varsayılan 2,0 sn; metre de seçilebilir), ön ve arka için ayrı eşik, gösterilecek bilgiler (sınıf, sıra, ülke, numara, sürücü, marka logosu, lisans, iRating, lastik, PIT/OUT, yaklaşma oku, fark), makara etkisi gücü, bulanıklık, vurgu rengi.
- **Pist haritası:** pit yolu çizilir (giriş / çıkış, araçlar pite girip çıktıkça öğrenilir ve pist başına saklanır), pit giriş / çıkış işaretleri, kendi pit kutun, pitteki araçlar pit yolunda. Yeni ayarlar: pist (yol) rengi, kenar çizgisi (aç / kapat, kalınlık, renk), dolgu rengi ve opaklığı, başlangıç / bitiş çizgisi, pit yolu rengi / kalınlığı / uzaklığı / tarafı, sınıf renkleri, araç rengi, otomatik döndürme (start çizgisi altta) ve ek açı.
- **Pedallar / girdi: 6 yeni tasarım** ("Tasarım" seçeneği): Telemetri grafiği + çubuklar, Dikey çubuklar, Kompakt şerit (ücretsiz); Yatay şeritler, Halka göstergeler, Sim tarzı (klasik) (PRO; Yönetim'den değiştirilebilir). Yeni seçenekler: pedal değerlerini sayıyla göster, çubuk kalınlığı, grafikte direksiyon çizgisi.
- Yeni metinler 14 dile çevrildi.

## 021026-62

- **Üst çubukta oyun ikonları:** iRacing, ACC, AC, LMU ve AMS2 ikonları eklendi; bağlı oyun yeşil nokta ve alt çizgiyle belli olur. Yönetim › Görünürlük'teki "Oyun ikonlarını göster" anahtarıyla herkes için yazılı görünüme dönülebilir. (c51)
- **Kurulum dosyası özelleştirildi:** karşılama / bitiş sayfasında yan görsel, sayfa başlığında logo, kurulum dili seçimi (12 dil), İngilizce açıklama, yayıncı ve telif bilgisi, başlat menüsü klasörü. Görseller `src-tauri/installer/` içinde (şimdilik uygulama simgesinden üretilmiş yer tutucular).
- **Çıkış yapınca arkadaşlar gizlenir:** arkadaş listesi, sayaçlar ve overlay'lerdeki arkadaş vurguları yalnızca giriş yapılmışken görünür. Sağ alttaki sohbet düğmesi giriş yapmayanlara da gösterilir; tıklayınca "giriş yapmalısın" uyarısı çıkar.
- **Canlı Sohbet:**
  - Giriş zorunlu: giriş yapmayanlar sekmeleri görür ama hiçbir bölüm (ücretsiz olanlar dahil) çalışmaz, overlay'ler ekranda görünmez. Yönetim › Canlı Sohbet ayarlarından kapatılabilir; aynı yerden sekmeler gizlenebilir. (c52)
  - Ücretsiz sürüm: yalnızca en üstteki kanalın sohbeti ve izleyici sayısı. Favori kanallar (★, platform başına bir tane) PRO: `livechat.favorites`.
  - Overlay yalnızca yayın canlıyken görünür; yayın açılınca kendiliğinden belirir ("Sürekli göster" açıksa oyun dışında da).
  - Önizleme kısaldı: 5 örnek mesaj, ardından ekrandan kaybolur.
- **Sesli Mühendis:** "Dene" bölümü ve ses paketi indirme herkese açık (yarışta konuşan mühendis PRO). Paket kartında "N ifade · bu pakette toplam M ses kaydı (dosya) var".
- **Araç logoları:** 46 logonun tamamı programda; Ayarlar'daki "Araç logoları" bölümü kaldırıldı, herkes gömülü logoları kullanır.
- Yeni metinler 14 dile çevrildi.

## 021026-61

- **Üst çubuk sim seçici:** bağlı (aktif) oyun yeşil nokta ve alt çizgiyle belli olur. Oyun ikonları için altyapı hazır: `src/assets/simlogos/` klasörüne `iracing`, `acc`, `ac`, `lmu`, `ams2` adlı png/svg konunca adların yerine ikon gösterilir (ikon yoksa kısa ad yazılır).

## 021026-60

- **Canlı Sohbet: Bildirimler (Streamlabs uyarıları) ve OBS tarayıcı kaynağı varsayılan olarak ücretsiz.** Yönetim › PRO özellikleri'nden yeniden PRO'ya ayrılabilir. (c50)

## 021026-59

- **Sıralama Tablosu: ülke bayrağı sürücü adından önce.** Yeni eklenenlerde zaten böyleydi; kayıtlı (eski) Sıralama Tablosu kopyalarında da bayrak sütunu bir kereliğine sürücü adının hemen soluna alınır.

## 021026-58

- **Canlı Sohbet sekme başlıklarında PRO rozeti:** Anket, Sesli okuma, Konuşma → yazı, Sohbete yaz, Bildirimler, Sohbet kaydı ve OBS sekmelerinin yanında "PRO" yazar (yönetici bir özelliği herkese açarsa rozet kalkar).

## 021026-57

- **Yönetici üst çubuğu:** yönetici girişinde üst çubuğun en solunda üye sayısı (üzerine gelince çevrimiçi / çevrimdışı), ★ PRO üye sayısı (deneme ayrı), yarışta olanların sayısı ve yanıt bekleyen destek talepleri. Tıklayınca "Üyeler" penceresi: Tümü / Çevrimiçi / Yarışta / PRO / Çevrimdışı, arama; yarışta olanların oyunu, pisti, aracı ve oturumu. (c49)
- **Relative → "Yakındakiler":** ülke bayrağı sütunu eklendi (varsayılan açık, sürücü adının hemen solunda; Sıralama Tablosu ile aynı sıra). Mevcut düzenlere bir kereliğine eklenir.
- **Logo / bayrak titremesi düzeltildi:** Yakındakiler ve Sıralama'da satırlar her veri gelişinde yeniden çiziliyordu; artık araç bazında sabit kalır (gerçek sürüşte de).
- **Önizlemeler oynayıp duruyor:** overlay önizlemeleri ~8 sn örnek veriyle oynar, sonra görüntü sabit kalır. Başka overlay seçince, ayar değiştirince ya da "▶ Önizlemeyi oynat" ile yeniden oynar. Demo modu ve gerçek sim verisi etkilenmez.
- Yeni metinler 14 dile çevrildi.

## 021026-56

- **Sohbet arka planı: "Bu arka planı kullan" hatası düzeltildi** ("Failed to fetch"): görsel artık güvenlik kuralına takılmadan kopyalanır.
- **Ekran görüntüleri: paylaşılanlar işaretli.** Toplulukta paylaştığın görüntülerin üzerinde "✓ Paylaşıldı" rozeti ve turuncu çerçeve; topluluktan silinince işaret kalkar. (Bu sürümden önce paylaşılanlar işaretlenemez.)
- **Canlı Sohbet overlay'i:** gerçek sohbet çalışıyorsa gerçek mesajlar; çalışmıyorsa demo / önizleme / düzenlemede arayüz dilinde akan örnek sohbet (platform simgeleri, abonelik / Süper Chat / raid satırları, yavaşça değişen izleyici sayıları). Örnek yazarlar mümkünse PRO üyelerin adları.
- **Yerel VR (SteamVR) — deneysel (Ayarlar › VR):** overlay'ler doğrudan gözlüğün içinde. Başlat / Durdur, sim bağlanınca otomatik başlat, masaüstünde de göster, ters çevir, kare hızı, saydamlık yöntemi, oturarak / ayakta. Overlay başına konum, uzaklık, dönüş, genişlik, eğrilik, opaklık, "bana dön" ve bakış modu (kaydırıcılar ya da yapılandırma modunda fare). Kısayollar: F9 yapılandırma, Space sonraki overlay, M mod, F10 kaydet, Home sıfırla, End ortala, F bana dön, G bakış. SteamVR etkin çalışma zamanı olmalı. Windows'ta ve gözlükle henüz denenmedi.
- Yeni metinler 14 dile çevrildi.

## 021026-55

- **Görsel silme hatası düzeltildi:** yönetici/moderatör başkasının görselini silerken çıkan 'record "old" has no field "screenshot_id"' hatası giderildi (c48, sunucu tarafı; program güncellemesi gerekmez).

## 021026-54

- **Sıralama / Relative: lisans rozeti sabit genişlikte.** "Pro 4.4" gibi uzun rozetler artık soldaki marka logosu sütununu kaydırmıyor; logolar tek dikey hizada.

## 021026-53

- **Sıralama Tablosu varsayılan sütunları:** Ülke, Sürücü, Araç markası, (Kazanılan/kaybedilen kapalı), Lisans / SR, iRating, (Pit sayısı kapalı), Fark, (Son 5 tur ortalaması ve Son tur kapalı), En iyi tur, Lastik.
- **Relative varsayılan sütunları aynı sırada:** Sınıf, Poz, No, Sürücü, Araç markası, Lisans, iRating, Stint, Fark, Son tur, Lastik, Bayrak. Marka logosu artık sürücü adının sağında.
- Kendi sütun düzenini değiştirmiş olanlar etkilenmez; "Varsayılana döndür" yeni düzeni getirir.

## 021026-52

- Sürüm yükseltildi (yeniden yayın için); içerik 021026-51 ile aynı.

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
