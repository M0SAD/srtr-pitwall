# SRTR Pitwall sürüm notları

Sürüm biçimi **GGAAYY-NN**: yükseltmenin yapıldığı gün/ay/yıl ve her değişiklikte bir artan sıra numarası.
En yeni sürüm en üstte.

## 211026-411

- Düzeltme (site › Yönetim › Reklamlar): gösterim paketleri boş / 0 iken "Paket listeleri boş olamaz" hatası veriyordu. Artık gösterim paketleri yalnızca bir yerde 1.000 gösterim fiyatı girilmişse, gün seçenekleri yalnızca günlük fiyat girilmişse gerekli. Ayrıca sitedeki bu sayfadan kaydetmek uygulamanın eklediği reklam ayarlarını (ödeme bağlantıları, yeni reklam yerleri, PRO gizleme, boş alan kutusu) siliyordu; artık yalnızca sayfadaki alanlar değişir, diğerleri korunur.

## 211026-410

- Pencere boyutu: kontrol paneli ilk açılışta ekranın tamamına göre değil, kullanılabilir alana (Windows görev çubuğu hariç) göre boyutlanır ve ortalanır; küçük / yüksek ölçekli ekranlarda alttaki "Arkadaşlar" çubuğu görev çubuğunun altında kalmaz. Kayıtlı boyut korunur; yalnız ekrana sığmıyorsa (ör. monitör değişti) küçültülür ve ekranın içine çekilir. Live Timing, Arkadaşlar, Olaylar ve Arkadaş verileri pencereleri de aynı şekilde ekrana sığdırılır; yapışık Arkadaşlar penceresi görev çubuğuna taşmaz.
- Pencerelerin son boyutu / konumu tepsiden Çıkış'ta da hemen kaydedilir (gecikmeli kayıt kapanışta kaybolmuyor): uygulama ve Arkadaşlar penceresi bir sonraki açılışta kullanıcının en son verdiği boyutla açılır.
- PRO satın alma sayfasında belirgin "Reklamını SRTR Pitwall'da yayınla" kartı (başlayan fiyat ve "Reklam ver" düğmesi).

## 211026-409

- Düzeltme: Yönetim › Reklamlar › Ödeme yöntemleri ve ana sayfa haber düzenleyicisinin bağlantı satırlarında her harften sonra yazı kutusu odağı kaybediyordu (tek harf yazılabiliyordu).
- Yönetim › Reklamlar › Fiyatları kaydet: "Paket listeleri boş olamaz" hatası kaldırıldı; gösterim paketleri / gün seçenekleri yalnızca o fiyat türü bir yerde kullanılıyorsa gerekli (hata ne eksik olduğunu söyler). Adresi boş ödeme bağlantısı kaydedilir, reklam verene gösterilmez. Para birimi 3 harfli kod olmalı (USD, TRY …). Üstteki açıklama elle ödeme akışına göre güncellendi.

## 211026-408

- Patreon reklam tier'ı: pro-webhook artık reklam tier'ındaki (adı "Ad" / "Reklam" ile başlayan ya da PATREON_AD_TIER_IDS'teki) Patreon üyelerine PRO vermez (eskiden her aktif Patreon üyesine PRO veriliyordu). Ödemeleri Gelir'e "Reklam: Patreon" olarak yazılır. PRO tier'ları eskisi gibi; hem PRO hem reklam tier'ındaki üye PRO alır. pro-webhook fonksiyonu yeniden yüklenmeli.
- Yönetim › Reklamlar › Ödendi say: Patreon ile ödenen reklamda önerilen tutar 0 (ödeme Gelir'e zaten kendiliğinden yazıldığı için iki kez sayılmasın).

## 211026-407

- Reklam ödemesi elle (ByNoGame, Patreon …): Reklam ver'de "Kaydet ve öde" reklamı kaydeder ve ödeme kutusunu açar: ödenecek tutar, yöneticinin ödeme bağlantıları (açıklamalarıyla) ve "Ödedim, bildir" (yöntem, kullanıcı adı / sipariş numarası, not). Yöneticiye bildirim gider ("Reklam ödemesi bildirildi"). Yönetim › Reklamlar: "Ödeme yöntemleri" düzenleyicisi (ad, bağlantı, açıklama, açık / kapalı; "ByNoGame + Patreon ekle"), "Ödeme bildirildi" süzgeci ve sayacı, reklam satırında bildirim bilgisi ve "Ödendi say" (alınan tutar Gelir'e yazılır, reklam hemen yayına girer). Otomatik ödeme sayfası (Lemon / Paddle) uygulamada artık kullanılmaz. Supabase'de c132_guncelleme.sql çalıştırılmalı.

## 211026-406

- Reklam istatistikleri: Reklam ver › Reklamlarım'da her reklamın "İstatistik" paneli: toplam gösterim, tıklama, tıklama oranı, kalan gösterim / süre (ilerleme çubuğuyla); son 30 günün günlük gösterim ve tıklama grafikleri (bir güne gelince o günün sayıları) ve tablo görünümü. Listede de tıklama oranı ve kalan gösterim yazar.
- Gösterim sayımı: PRO üyelerin de reklam gördüğü yerlerde (yönetici "PRO gizleyebilir"i kaldırdıysa) gösterimler artık sayılır; reklamı gizlemiş PRO üyeler sayılmaz. Supabase'de c130_guncelleme.sql çalıştırılmalı (günlük sayım bu güncellemeden itibaren başlar).

## 211026-405

- Reklamlar: yeni reklam yerleri: ana sayfa üst banner, ana sayfa haberler arası (ikinci haberin altı), Overlaylarım sayfasının altı ve Telemetri sayfasının altı (mevcut Hesap ve Topluluk alanlarına ek). Fiyatları Yönetim › Reklamlar › Fiyatlar'dan girilir.
- Reklamların köşesinde "Reklam · Reklam vermek için tıklayın"; tıklayınca uygulama içindeki Reklam ver sayfası açılır. Yayında reklam olmayan satıştaki alanlarda "Bu alana reklam ver" kutusu (Yönetim › Reklamlar'dan kapatılabilir). Ana sayfanın üstünde önce ücretli reklam, yoksa yöneticinin ana sayfa reklamları gösterilir.
- Reklam ver (uygulama içi): yer, gün / gösterim paketi, başlık, kısa metin, bağlantı, görsel, hedef dil; canlı önizleme ve sunucunun hesapladığı fiyat; "Öde" ödeme sayfasını uygulamanın ödeme penceresinde açar. Reklamlarım: durum, gösterim / tıklama, öde / düzenle / sil / durdur / sürdür. Hesap sayfasından ve reklamların sağ tık menüsünden de açılır.
- PRO: Hesap › Reklamlar › "Reklamları gizle" (varsayılan açık). Yönetici her yer için "PRO gizleyebilir" seçer; işaretsiz yerlerde PRO üyeler de reklam görür. Supabase'de c129_guncelleme.sql çalıştırılmalı.

## 211026-404

- Ana Sayfa: sol menünün en üstünde gazete simgesiyle yeni "Ana Sayfa"; uygulama artık bu sayfada açılır. En üstte reklam, altında haberler (görsel, metin, içindeki adresler tıklanabilir, düğme olarak bağlantılar; sabitlenenler önce). Yönetici haberleri bu sayfada ekler, düzenler, sabitler, yayından kaldırır, siler; görseller yüklenirken 1600 px genişliğe küçültülür (GIF olduğu gibi).
- Yönetim › Reklamlar › Ana sayfa reklamları: yönetici ana sayfanın en üstündeki reklamları doğrudan ekler (görsel + bağlantı, başlangıç / bitiş tarihi, sıra, aç / kapat, "PRO üyelere de göster"); gösterim ve tıklama sayılır. Birden çok reklam 8 sn'de bir döner; hiç yoksa ücretli reklam alanı (geniş banner) görünür. Supabase'de c128_guncelleme.sql çalıştırılmalı.

## 201026-403

- Yönetim › Gelir: "Gelir ekle" formu. Satış tarihi, tutar, para birimi, tür (ödeme / iade), yöntem ve ne alındığı girilir; kimin aldığı üyelerden aranıp seçilir ya da (üye değilse) adı / e-postası yazılır. Yazılan e-posta bir üyeninkiyle aynıysa ödeme o üyeye bağlanır. Yalnızca gelir kaydı ekler, PRO süresini değiştirmez. Supabase'de c127_guncelleme.sql çalıştırılmalı.

## 201026-402

- Yönetim › Gelir: son ödemelerde ve giderlerde her satırın sonunda düzenle (✎) ve sil (✕) düğmeleri. Düzenle satırı yerinde forma çevirir: ödemede tutar, para birimi, tür (ödeme / iade), tarih, yöntem ve "ne aldı"; giderde ad, kategori, tutar, para birimi, tarih ve not. Toplamlar, yönteme göre döküm ve "Parayla PRO" sayısı kaydedince yeniden hesaplanır. Supabase'de c126_guncelleme.sql çalıştırılmalı.

## 201026-401

- Göreli (Relative) farkları: süre farkı artık ölçülerek hesaplanır. Her aracın pistin her noktasından (turun binde biri) geçtiği an kaydedilir; arkamdaki araç için "o şu an neredeyse ben oradan ne kadar önce geçtim", önümdeki için "o benim bulunduğum yerden ne kadar önce geçti". Eskiden simin tahmini varış süresi (iRacing CarIdxEstTime, referans tur profili) kullanılıyordu: yavaş bölümlerde (firkete, şikan) metre olarak yakın araç gerçekte 2 sn gerideyken 0,2 sn görünebiliyordu; sınıflar arası farklar da kayıyordu. Kayıt yoksa (piste yeni çıkıldı, tekrar sarıldı) eski tahmin kullanılır. Aynı düzeltme yakın trafik verisine ve sesli mühendisin "arkanda / önünde X sn" uyarılarına da uygulandı.

## 191026-400

- Üst çubuk: PRO üyelerde soldaki bağlantıların hemen yanında altın renkli "PRO" rozeti. Tıklayınca kalan süre (gün / saat), bitiş tarihi, kampanya PRO'su ve kendini yenileyen abonelik bilgisi açılır; "PRO süresini uzat" düğmesi PRO satın alma sayfasına gider. Bitimine 10 günden az kalan (yenilenmeyen) üyelikte rozet turuncu olur.

## 191026-399

- Kan Şekeri: CareSens Air (i-SENS Sens365) desteği. Overlay ayarlarında "Sensör / kaynak" → "CareSens Air (Sens365)" → "Sens365 ile giriş yap": Sens365 giriş sayfası ayrı pencerede açılır, e-posta / şifre orada girilir (uygulamaya girilmez). Değer, yön oku (değişim hızından) ve ölçüm saati Sens365'ten dakikada bir okunur; mini grafik program açıkken okunan ölçümlerden oluşur. Oturum anahtarı 24 saat geçerli; süresi dolunca giriş sayfası gizli pencerede yeniden açılır ve oturum hatırlanıyorsa sessizce yenilenir, hatırlanmıyorsa "yeniden giriş yap" uyarısı çıkar. Şimdilik Avrupa sunucusu (accounts-de / cgm-api-de).

## 191026-398

- iRacing lastik verisi: veride lastik yüzey sıcaklığı varsa (LFtempL/M/R; kayıtlı .ibt dosyalarında var) direksiyon ekranı canlı değişen yüzey sıcaklığını ve sıcak basıncı gösterir. Yoksa önceki gibi "PİT" etiketli son pit ölçümü. Günlüğe bir kez "lastik: canlı değişkenler [...], yüzey sıcaklığı VAR / yok" satırı yazılır: iRacing'in canlı veride lastik sıcaklığı gönderip göndermediği buradan görülür.

## 191026-397

- Direksiyon Ekranı lastik bilgileri (iRacing): iRacing lastik sıcaklığını ve aşınmasını sürüş sırasında göndermiyor, yalnızca pit kutusunda ölçüyor (kayıtlı telemetride bütün oturum boyunca 2 farklı değer). Ekran bu değerleri canlıymış gibi renklendiriyordu (ilk pite kadar ortam sıcaklığı "soğuk lastik" mavisiyle). Artık iRacing'de değerler "PİT" etiketiyle ve nötr gri renkle gösterilir; Lastik göstergesinde her lastiğin kalan dişi (%) de yazılır. Araç tarzı ekranlarda, klasik görünümde ve özel tasarım ekranlarında da aynı. Diğer simlerde (ACC, LMU, AMS2, RaceRoom…) canlı renkli gösterim değişmedi.

## 181026-396

- Otomatik Rejisör: yeşil bayraktan hemen önce kamera lidere geçer (lider start çizgisine 15 sn'den az kala ya da duran startta gridde ışıkları beklerken), start yapıldıktan sonra 8 sn daha liderde kalır. Grid turu yarıda kalsa da lider gösterilir. Rejisör ayarlarında "Startta lider" ile kapatılabilir.
- TV Sonuç Tablosu: yarış sonunda sayfalar bir kez sırayla gösterilir, son sayfadan sonra başa dönmeden kapanır (2. sayfadan sonra 1. sayfa bir an görünüp kayboluyordu). Sayfa başına süre varsayılanı 20 sn ("Sayfa başına süre"); eski "Yarış sonunda ekranda kalma" ayarı kaldırıldı, tablonun ekranda kalma süresi sayfa sayısı × sayfa süresi.
- Canlı Sohbet: izleyici çubuğu yalnızca yayını canlı olan (gizlenmemiş) kanal varken görünür. Yayın yokken ya da canlı kanal gizlenmişken masaüstünde boş izleyici çubuğu kalmıyor; gizlenen kanalın canlı yayını artık "yayın var" sayılmıyor.

## 181026-395

- Tekrarda (replay) ülke bayrakları: iRacing tekrar dosyasında sürücülerin ülkesini göndermiyor (günlükte tekrar oturumlarında hiç ülke alanı yok). Artık canlı oturumlarda görülen her sürücünün ülkesi üye numarasıyla bilgisayara kaydedilir (flags-cache.json) ve tekrarda bu sürücülerin bayrakları Lider tablosu ve TV overlay'lerinde görünür. Program açıkken canlı olarak hiç karşılaşılmamış sürücülerin bayrağı tekrarda çıkmaz. Günlüğe "bayrak: N sürücü, X önbellekten, Y bilinmiyor" satırı yazılır.

## 181026-394

- Canlı Sohbet, izleyici çubuğu: gizlenen (göz kapalı) kanalların izleyici sayısı çubukta ve toplamda (Σ) sayılmaz; gösterilecek başka kanal yoksa çubuk da gizlenir.
- İzleyici çubuğundaki simgeye tıklayınca o platformdaki canlı kanalların listesi açılır (Σ: hepsi); listeden kanala tıklayınca sayfası açılır. Liste tekrar tıklayınca ya da kanal seçilince kapanır (önceden tıklama en çok izlenen kanalı doğrudan açıyordu).

## 181026-393

- Rejisör, bitiş: çizgiyi geçen araç ~6 sn daha gösterilir (önceden 3 sn); bu sırada başka bir araç çizgiye 3 sn'den yakınsa ona geçilir.
- TV Sıralama Kulesi: yeni ayar "Herkes yarışı bitirince kalksın" (varsayılan açık): pistteki bütün araçlar bitiş çizgisini geçene kadar kule ekranda kalır. Kimse bitirmezse bekleme 10 dk (önceden 2 dk; uzun pistlerde kule erken kalkıyordu). Kapatılırsa eskisi gibi araç sayısı.
- Ülke bayrakları isteğe bağlı ve varsayılan kapalı: TV Sıralama Kulesi ve TV Sonuç Tablosu'na bayrak sütunu eklendi; TV Sürücü Bandı ve TV Yarış Sonucu'nda bayrak artık varsayılan kapalı. iRacing sürücünün ülkesini göndermiyorsa bayrak çıkmaz.

## 181026-392

- Rejisör: ön sıralar çok az gösteriliyordu. "Uzun süredir gösterilmeyen araç" kuralı 2,5 dk'da bir devreye girip arka sıralara çok ağırlık veriyordu; artık bekleme süresi araç sayısına göre (araç başına 15 sn, en az 3 dk; 30 araçta 7,5 dk) ve ağırlığı düşük. Varsayılan oranlar: lider 30, ön sıralar 30, mücadele 25, diğer araçlar 25 (önceki varsayılanlar 20/20/25/40 bir kez taşınır).

## 181026-391

- Tekrarda aynı kaza sonsuz döngüde gösteriliyordu: kazaya kesince tekrar olaydan öncesine sarılıyor, olay yeniden oynayınca yeniden kaza sayılıp yine sarılıyordu. Tekrarda gösterilen kazalar oturum zamanıyla hatırlanır; aynı an (±20 sn) yeniden kaza sayılmaz ve bir daha geri sarılmaz.

## 181026-390

- Lider tablosu, yarışta en iyi tur: sıralama turlarındaki derece görünüyordu (1 tur atan sürücünün en iyisi attığı turdan farklıydı). Yarışta oturumun sonuç listesi artık kullanılmaz (yarış başında sıralama derecelerini taşıyabiliyor); en iyi tur yalnızca yarış turlarından (son tur süreleri) ve yeşilden sonra değişen sim değerinden gelir. Simin ham değerleri sonuç listesiyle karıştırılmadan alınır.

## 181026-389

- OBS tarayıcı kaynağındaki overlay sayfası uygulama güncellenince kendini yeniler (20 sn'de bir sürüm sorulur). OBS sayfayı açık tuttuğu için güncellemeden sonra yayında eski arayüz (ör. eski TV Sürücü Bandı hizası) çalışmaya devam ediyordu.

## 181026-388

- TV Sürücü Bandı hizası (kesin): kart sabit yükseklikte (gösterge + bant), bant hep en altta. Overlay çerçevesi içeriğe göre ayarlandığı için göstergesiz bantlar (ve INCIDENT etiketi) çerçeveyi yukarı kaydırıyordu; artık içerik yüksekliği hep aynı.

- Aynı anda iki yerde kaza (ya da bir kaza gösterilirken başka bir kaza): öndeki önce gösterilir, diğeri sıraya alınır ve ilk kaza en az 10 sn gösterildikten sonra o da gösterilir (tekrarda onun da öncesine sarılır). Sırada en çok 4 kaza, 1 dk'dan eskisi atlanır.

## 181026-387

- TV Sürücü Bandı hizası: hız / vites göstergesinin yeri her durumda (gösterge kapalıyken de) ayrılır; bant hep aynı yükseklikte.
- Pitteki / garajda bekleyen (sırası olmayan) sürücü gösterilirken bant çıkmıyordu: TV listesi sırası olmayan araçları süzüyordu. Artık kameradaki araç her zaman bulunur; sıra yerine "PIT" yazar.

## 181026-386

- Grid turu bittikten sonra kurgu yeniden sırayla gitmiyor: "en uzun süredir gösterilmeyen" kuralı grid sırasını tekrar üretiyordu; grid turu bitince gösterilme zamanları karıştırılır, TV Mixed ile karışık kurgu başlar.
- Kalan süre (lider tablosu, Relative, Oturum, TV kulesi): süreli yarışta yeşilden sonra toplam süre − yeşilden beri geçen süre gösterilir. iRacing gride oturulan zamanı da saydığı için yeşilde süre birden düşüyordu (ör. 40 dk'lık yarışta).
- Kazalar daha çok yakalanır: pist dışında 0,5 sn kalan ya da pistte 0,5 sn neredeyse duran (< 40 km/s) araç, son 5 sn'de hızlıysa kaza sayılır (önceden 0,7 / 0,6 sn, 2,5 sn). Aynı araç 12 sn sonra yeniden gösterilebilir.
- Tekrarda kaza yapıp aracını sıfırlayan (pite ışınlanan) sürücü: tekrar olaydan öncesine sarılıp kaza gösterilir (o araç son 1 dk'da gösterilmediyse).
- Araç içi kamera ara sıra (normal çekimlerin ~%12'si, yalnız TV Mixed / TV + araç üstü kamera ayarında); grid sonrası ilk çekim TV kamerası. Araç içindeyken sürücü bandı aracı yazar.
- TV Sürücü Bandı: pit çekiminde bant her zaman görünür; ikinci bant her kipte yalnızca iki araç arasındaki fark "Kapışma sayılan fark"ın (varsayılan 1 sn) altındaysa çıkar (20 sn öndeki aracın bandı çıkıyordu).

- TV Sürücü Bandı hep aynı hizada: hız / vites göstergesi gizliyken (araç duruyor, grid) yeri boş tutulur, INCIDENT etiketi bandı kaydırmaz.

## 181026-385

- Tekrarda kaza öncesi görünmüyordu: tekrarı geri sarma komutu, hemen ardından gelen kamera / hız komutlarıyla yarıda kalabiliyordu. Artık doğrulamalı sarma kullanılır (zaman araması tutmazsa kare numarasıyla), olaydan 6 sn öncesine gidilir; sarma bitene kadar rejisör başka komut göndermez, sonra kamera kazadaki araçta 1x oynar.

## 171026-384

- Ses odası aygıtları (mikrofon, hoparlör / kulaklık, yayın çıkışı) hatırlanıyor: seçim artık bu bilgisayarda yerel olarak saklanır (önceden bulutla eşitlenen ayarlardaydı; aygıt kimlikleri bilgisayara özel). Ayarlar sayfası açılınca kayıtlı seçim görünür (önceden aygıt listesi geç yüklendiği için hep "Varsayılan" / "Kapalı" görünüyordu). Aygıtın kimliği değişirse aynı adlı aygıt bulunur; seçili mikrofon takılı değilse varsayılanla devam edilir.

## 171026-383

- Grid turu start alınınca kesin biter (yarıda kalsa da; "Baştan başlat" ile başlatılmış olsa da) ve TV Mixed'e geçilir. Yarış başlangıcı artık yarış durumunun yanında yeşil / "start" bayrağından da anlaşılır (durum geç güncellense de).
- Kamera önden açıda takılı kalmıyor: TV Mixed grubu bulunamazsa başka bir TV kamerasına (yoksa araç içi / önden olmayan herhangi bir gruba) geçilir; önceden "grup 0" gönderildiği için iRacing grid turunun önden kamerasında kalıyordu.

- Grid turu: önce griddeki araçlar (lider tablosu sırasıyla), sonra pitte olanlar gösterilir; herkes gösterilince (yarış başlamadıysa da) baştan başlamaz, TV Mixed ve normal kurguya geçilir. TV Mixed kamerası olmayan pistlerde (ör. Nordschleife) TV kameraları arasında karışık geçilir; dip dibe mücadelede ara sıra araç içi kamera kuralı aynen.
- Varsayılan grid süresi araç başına 4 sn (5 / 6 sn'de kalan ayar bir kez 4'e).
- Start alır almaz "en hızlı tur" uyarısı: önceki oturumdan kalan süre yarış turu sayılıyordu. Yeşilden beri geçen süreden uzun "tur" artık sayılmaz; TV En Hızlı Tur yarışta lider 2 tur tamamlamadan duyurmaz.
- Lider tablosu: gride oturunca son tur dereceleri de silinir (önceden yalnızca en iyi turlar); yeşilden sonra ilk yarış turu tamamlanana kadar sıralamadan kalan son tur gösterilmez.

## 171026-382

- Grid turu oturum başına bir kez: durum bir an değişse de (grid → ısınma turu vb.) baştan başlamaz; yalnızca yeni oturumda ya da "Baştan başlat" ile. TV Sürücü Bandı gridde her zaman ekrandaki aracı yazar (rejisör TV Mixed'e geçince bant kendi başına ikinci kez sırayla dönmez).

## 171026-381

- Grid turu düzeltildi: araçlar lider tablosundaki sırayla (aynı sıralama) birer kez gösterilir. Gridde olmayan (garajda / pitte / henüz yüklenmemiş) araç atlanır; sonradan gride gelirse sırası gelince gösterilir. Önceden, araçlar gride yüklenirken tur birkaç araçla bitip TV Mixed'e geçebiliyordu.
- "Baştan başlat": kamera hemen 1. sıradaki araca döner.

- Kalan süre yarış başlamadan işlemiyor (asıl düzeltme): iRacing gridde süreyi saymaya başladığı için lider tablosu başlığındaki "Kalan" kutucuğu, Relative ve Oturum overlay'leri geri sayıyordu. Artık yarışta yeşil bayraktan önce kalan süre her yerde yarışın toplam süresi olarak gelir; geri sayım yeşilde başlar.
- Rejisör: kamera çok hızlı değişmesin diye bir çekim en az 6 sn ekranda kalır (kaza, bitiş, en hızlı tur ve "Sonraki çekim" hariç); bu sırada gelen pite giriş çekimi bekletilir. Pit ve en hızlı tur çekimleri 10 sn.

- Varsayılanlar: grid turunda araç başına 5 sn, çekim süresi 10–20 sn (eski varsayılanlarda kalan ayarlar — grid 4 / 6 sn, çekim 8–16 sn — bir kez yenilerine taşınır).

- Panel açılırken "Cannot access 'J' before initialization" hatası düzeltildi (TV Sürücü Bandı'nda bir ayar tanımlanmadan kullanılıyordu; 376'dan beri).
- Tekrarda kazaya kesince olaydan 5 sn öncesine sarılır (önceden 3 sn): olay ve öncesi görünür.
- TV overlay'lerinde Türkçe büyük harf: Türk sürücülerin (ülkesi Türkiye ya da adında Türkçe harf olan) adları ERKİN AZCAN gibi doğru yazılır (önceden ERKIN). Kule, sürücü bandı, en hızlı tur, mücadele, sonuç tablosu ve podyumda.

## 171026-380

- Otomatik Rejisör: kendi aracın için ayrı kural kaldırıldı ("Kendi aracım" oranı); diğer araçlar gibi sıralamadaki yerine göre gösterilir.
- Yarıştaki bütün araçlar mutlaka gösterilir: 2,5 dakikadır ekrana gelmeyen araç varsa sıra ona gelir (hiç gösterilmeyen / en uzun bekleyen önce). Kurgu oranları arka sıralar lehine: lider 20, ön sıralar 20, mücadele 25, diğer araçlar 40 (eski varsayılanlar bir kez yenilerine taşınır).
- Aynı ikili sürekli yakın takipteyse çok sık gösterilmez: ikisinden biri son 2 dakikada gösterildiyse o mücadele beklemede.
- Mücadele çekimleri kısaltıldı: en çok 20 sn, dip dibe olanlar en çok 25 sn (önceki sürümde 30 / 45 sn).

- Dip dibe mücadelede araç içi kamera artık ara sıra (çekimlerin ~üçte biri); mücadele sürerken araç içi ↔ TV geçişi de her seferinde değil. Kamera araç içindeyken TV Sürücü Bandı yalnızca o aracı yazar (ikinci bant yok).

## 171026-379

- Lider tablosu (ve TV Sıralama Kulesi "Kalan süre"): süreli yarışta saat yeşil bayraktan önce (grid / ısınma turu) işlemiyor; yarışın toplam süresi yazar, geri sayım yeşilde başlar.

## 171026-378

- Araçlar › Otomatik Rejisör: "Grid turunda araç başına" süresi gizli "Kurgu ayarları" bölümünden çıkarıldı, "Grid turu" anahtarının hemen altında görünür; "Grid turunu başlat" açıklaması bu ayarı adıyla anıyor.

## 171026-377

- Otomatik Rejisör: son tur başlamadan önce (lider sondan bir önceki turda, süreli yarışta süre dolmak üzereyken) lider bitiş çizgisine yaklaşırken kamera ona geçer: beyaz bayrağın sallandığı geçiş görünür; ardından son turun başında 10 sn daha lider.

## 171026-376

- Otomatik Rejisör: yeni en hızlı tur atılınca kamera o araca geçer (9 sn; yarışta ilk 2 turda ve 25 sn'de bir kezden sık değil, kaza çekimini bölmez). TV Sürücü Bandı bu çekimde de hep görünür. Ayar: "En hızlı tura odaklan" (varsayılan açık).

- Kaza algılama sıkılaştırıldı: yalnızca hızlıyken pistten çıkıp en az 0,7 sn dışarıda kalan ya da pistte hızlıyken yavaşlayıp en az 0,6 sn neredeyse duran araç (kısa kenar taşmaları ve ölçüm sıçramaları "INCIDENT" olmaz).
- Tekrar izlerken kazaya kesince tekrar olaydan 3 sn öncesine sarılır: kaza baştan görünür (ayar: "Tekrarda kazayı baştan göster", varsayılan açık). Canlıda geri sarılamaz.
- Ön sıralardaki (ilk N) aracın kazası, arkadaki bir aracın kaza çekimini böler; aynı anda birkaç kaza olursa öndeki gösterilir.

- Dip dibe mücadele (0,5 sn'den yakın): çekim daha uzun (×1,8; sürdükçe en çok 45 sn) ve arkadaki aracın içinden gösterilir (Roll Bar / Cockpit / Nose kamerası, öndekini takip ederken); mücadele sürdükçe ~10 sn'de bir araç içi ↔ TV kamerası arasında geçer. "Seçtiğim kamera kalsın" seçiliyse kamera değişmez.

- Beyaz bayrak (son tur) çıkınca lider hemen 10 sn gösterilir; bitiş çizgisine yaklaşırken yeniden lidere geçilir.
- Pite girenler: yarışta pit yoluna giren araç ara sıra 8 sn gösterilir (40 sn'de bir kezden sık değil, öndeki öncelikli; kaza / bitiş / en hızlı tur çekimini bölmez). Ayar: "Pite girenleri göster" (varsayılan açık).

## 171026-375

- TV Sürücü Bandı: rejisörün grid turunda, kaza ve bitiş çekiminde band her zaman görünür ve kameradaki aracı gösterir (görünürlük ayarları, "Yeşil bayraktan önce gizle", sürelerin bitmesi bandı gizlemez; yalnızca "Gösterme" seçiliyse gizli). Grid turunda hız-vites ve ikinci bant yok; kazada ikinci bant yok.
- TV Sürücü Bandı: kamera araç içinde / üstündeyken (Cockpit, Roll Bar, Gyro, Nose, Gearbox, Chase, Rear Chase, süspansiyon kameraları) band her zaman görünür ve o aracı yazar (iRacing CamGroupNumber).
- Otomatik Rejisör: "Grid turunu başlat" düğmesi (Araçlar › Otomatik Rejisör): araçları hemen 1. sıradan başlayarak sırayla gösterir, herkes gösterilince normal kurguya döner (yeşilden sonra da çalışır).
- TV Sıralama Kulesi: ekrandaki (kameradaki) aracın satırı belirgin: beyaz şerit, koyu kalın yazı.

## 171026-374

- Grid turu bir kez yapılır: bütün araçlar sırayla gösterilince (yeşil bayraktan önce) TV Mixed kamerasına geçilir; herkes gösterilmeden yeşil bayrak verilirse de hemen TV Mixed.
- Kaza / pist dışı çekimleri daha uzun: 16 sn (eskiden 12); başka bir kaza en erken 10 sn sonra araya girer.

- TV Sıralama Kulesi: saatin yanında kaçıncı turda olunduğu (liderin turu): LAP 5/20, toplam tur bilinmiyorsa LAP 5. Ayar: "Kaçıncı turda (liderin turu)" (varsayılan açık); yarış başlamadan görünmez.

## 171026-373

- Grid turu: TV Sürücü Bandı gridde her zaman görünür (numara, ad, sıra; hız-vites göstergesi ve ikinci bant yok). Eski sürümlerden kalan "Yeşil bayraktan önce gizle" ayarı bandı gizliyordu; artık yok sayılır.
- Grid turunda araçlar önden gösterilir (Rear Chase kamerası; pistte yoksa Chase / Gyro / Far Chase), araç başına 6 sn (eskiden 4; kayıtlı 4 sn bir kez 6 sn'ye taşınır). Yeşil bayrakta TV Mixed kamerasına geçilir.

## 171026-372

- Otomatik Rejisör çekim süreleri yayınlara göre: varsayılan 10–20 sn (eskiden 8–16). Türe göre: lider ×1,2, mücadele ×1,5 (sürdükçe en çok 30 sn), arkadaki araçlar ×0,75 (en az 6 sn). Daha önce ayarlarını değiştirdiysen kayıtlı süreler kalır; Araçlar › Otomatik Rejisör'den 10–20 yapabilirsin.

## 171026-371

- Otomatik Rejisör, grid turu: araçlar yakın açılardan gösterilir (Rear Chase, Gyro, Chase, Far Chase; araçtan araca farklı kamera), kim olduğu anlaşılsın. TV Sürücü Bandı grid turunda yalnızca aracı / sürücüyü yazar (hız-vites göstergesi ve ikinci bant yok).
- Kaza / pist dışı çekimleri daha uzun: 12 sn (olay ve sonrası görünsün), başka bir kaza en az 7 sn sonra araya girebilir.
- Mücadele çekimleri biraz daha uzun ve mücadele sürdükçe uzar (en çok 30 sn); mücadele bitince en kısa süreden sonra kesilir.
- Bitiş çizgisi çekiminde TV Sürücü Bandı her zaman görünür: çizgiyi geçen sürücü yazar.

## 171026-370

- Lider tablosunda en iyi / son tur boş kalıyordu. Tekrar (ve izleyici) modunda turlar tekrar kafasından ölçülürken tur sayacına güveniliyordu; iRacing bunu tekrarda her zaman güncellemediği için hiç tur ölçülmüyor, tablo bomboş kalıyordu. Artık geçişler aracın pistteki konumundan (çizgiyi geçişi) ölçülür; o tekrarda henüz hiç tur ölçülmediyse simin değerleri gösterilir, tablo boş kalmaz.
- Yarışta en iyi tur üç kaynaktan alınır (son tur süresinden hesaplanan, oturumun resmi sonucu, yeşilden sonra değişen sim değeri); biri eksik kalsa da derece görünür.

## 171026-369

- TV Sonuç Tablosu her açılışta 1. sayfadan başlar (gizliyken de sayfa çevirdiği için son sayfadan açılabiliyordu); sayfalar yalnızca tablo ekrandayken döner.

## 171026-368

- Lider tablosu: sunucudan çıkan sürücülerin (ör. yarışı bitirip çıkanlar) en iyi ve son tur dereceleri artık silinmez; oturumda en son görülen değerleri kalır. Oturum değişince ve yarış gridinde sıfırlanır.

## 161026-367

- Ses odasındayken ana pencerenin çarpısına basınca konuşma kopuyordu: pencere gizlenmesi gerekirken (ayar senkronunun kapatma dinleyicisi yüzünden) yok ediliyordu. Artık ses odasındayken çarpı pencereyi yalnızca gizler; sesler ve mikrofon sürer, panel tepsiden geri açılır.

- Autofuel ayarı kaldırıldı (Genel › "Autofuel'i otomatik aç"): iRacing sohbetine "#autofuel" yazmak oyunu bozuyordu.
- Sıralama turlarında lider tablosunda dereceler görünmüyordu (sim önceki oturumdan kalan daha hızlı turu verdiği için gizleniyordu). Artık o oturumun resmi sonuçlarındaki en iyi turlar gösterilir.
- Yarış için gride oturunca (grid / ısınma turu) lider tablosundaki dereceler sıfırlanır; yeşilden sonra yarış turlarıyla dolar.

## 161026-366

- Arkadaşlar penceresi son boyutuyla açılır: ana pencereye yapışıkken her açılışta yüksekliği ana pencere boyuna zorlanıyordu. Artık kullanıcının verdiği genişlik ve yükseklik korunur (yalnızca ana pencereden uzunsa kısaltılır; genişlik ana pencerenin en çok %60'ı). Ana pencere boyunu doldurma yalnızca ilk açılışta (kayıtlı boyut yokken) ve "Ana pencerenin sağına yapışsın" tercihi yeni açıldığında olur.

## 161026-365

- TV Sıralama Kulesi: "Kaç araç bitirince kalksın" artık 0 olabilir ve varsayılanı 0: herkes yarışı bitirince (pistteki bütün araçlar bitiş çizgisini geçince ya da 2 dk kimse geçmezse) kule kaybolur. 1 ve üstü eskisi gibi o kadar araç bitirince.

- TV Sürücü Bandı: damalı bayrakta hemen kalkmıyor, herkes yarışı bitirince kalkıyor ("Damalı bayraktan sonra gizle" açıkken). Yarışı bitirmiş bir araç gösterilirken yanındaki ikinci bant kapalı, yalnızca o araç.

## 161026-364

- Otomatik Rejisör, bitiş: ilk araçlar bitirdikten sonra da bitiş çizgisine gelen, henüz bitirmemiş araçlara geçer; herkes çizgiyi geçene kadar sürer. Çizgiye gelen ilk N araç her zaman önce gösterilir. Ayar: "Herkes bitirene kadar göster" (varsayılan açık).
- TV Sonuç Tablosu yarış bitince açılır: pistteki bütün araçlar bitiş çizgisini geçince (2 dk kimse geçmezse ya da soğuma turuna geçilince de) ve "Sonra kaç saniye beklesin" kadar sonra. Ayar: "Yarış bitince aç (herkes bitirince)" (varsayılan açık; kapalıysa eskisi gibi araç sayısı). Podyum açıksa ikisi de beklenir: kule → podyum → (herkes bitince) sonuç tablosu.

## 161026-363

- Tekrar izlerken lider/sıralama tablolarında en iyi ve son tur, yarışın SONUNDAKİ değerleri gösteriyordu (iRacing tekrarda bu süreleri oturum sonundan verir). Artık turlar tekrar kafasının zamanından hesaplanır: tablo izlenen tura kadar atılan turları gösterir; geri sarınca ilerideki turlar silinir, ileri/geri sarınca bir sonraki tam tura kadar o araç için süre yoktur.
- TV En Hızlı Tur: tekrarda en iyi turlar hiç değişmediği için açılmıyordu; düzeldi. Ayrıca oturumun ilk en hızlı turu da artık duyurulur (önceden yalnızca iyileşmeler).

## 161026-362

- Yarışta en iyi turlar (Sıralama / Lider tablosu, TV overlay'leri) eksik ya da bir önceki turun süresi çıkıyordu: iRacing son tur süresini çizgiyi geçtikten biraz sonra güncelliyor. Artık yarış turu son tur süresi değiştiği anda sayılır. TV En Hızlı Tur bu yüzden yarışta hiç çıkmıyordu; düzeldi.
- Yarış sonu sırası: ilk 3 bitiş çizgisini geçince TV Sıralama Kulesi kalkar ve TV Yarış Sonucu (podyum) hemen açılır (ayar: "Sonra kaç saniye beklesin", varsayılan 0; ekranda 30 sn); podyum kapanınca TV Sonuç Tablosu açılır ("TV Yarış Sonucu'ndan sonra aç", varsayılan açık; podyum aynı pencerede değilse eski süre ayarı geçerli).

## 161026-361

- DigiFlags tekrar izlenirken çalışmıyordu: iRacing tekrarda bayrak bilgisini o ana göre vermiyor. Artık tekrarda bayraklar kameradaki aracın çevresinden çıkarılır: önünde 400 m içinde pist dışı ya da duran araç varsa sarı (150 m içinde dalgalanan sarı), arkasından 1,5 sn içinde tur önündeki araç yaklaşıyorsa mavi.
- TV Sıralama Kulesi: uzun pist adı başlıkta alt alta iki satıra sığar.
- TV Sürücü Bandı: "Araç dururken göstergeyi gizle" (varsayılan açık): araç hareketsizken hız / vites / fren göstergesi görünmez.

## 161026-360

- En iyi turlar her oturumda ayrı: yarışta yeşil bayrakta sıfırlanır ve yalnızca yarış turlarından hesaplanır (sıralamadan kalan süreler Sıralama, Lider tablosu, TV overlay'lerine karışmaz); antrenman / sıralama başında simde kalan önceki oturum süreleri yeni tur atılana kadar gösterilmez. TV En Hızlı Tur her oturumda ve yeşil bayrakta baştan sayar.
- TV overlay'leri sıralama ve antrenmanda da: farklar en iyi tura göre (lider en iyi turunu gösterir); Sonuç Tablosu ve TV Yarış Sonucu sıralama bitince (damalı bayrak) ayarlanan süre sonra açılır ("QUALIFYING RESULT").
- TV Sıralama Kulesi gridde de görünür (yarış başlamadan sim sıra vermediğinde grid sırası kullanılır). Sayfalarda "Her sayfadan sonra ilk sayfaya dön" (varsayılan açık): ilk sayfa çoğu zaman ekranda (45 sn), diğerleri ara sıra (10 sn).
- TV Sürücü Bandı: Otomatik Rejisör kazaya kesince olaydaki aracın bandı "INCIDENT" etiketiyle hemen çıkar (ayar).
- DigiFlags tekrar izlenirken de doğru bayrağı gösterir (tekrardaki anın bayrakları kameradaki araçtan okunur).
- Otomatik Rejisör: başlıkta her zaman PRO yazar; ayarlar ve durum yalnızca PRO üyelere görünür.

## 161026-359

- Mesajlarda "blob:https://…" görünmesi: bir sitedeki (ör. ChatGPT) resim kopyalanınca panoya bazen resim yerine tarayıcının geçici adresi gelir; bu adres yalnızca kopyalandığı tarayıcıda çalışır. Arkadaş, grup, takım ve ses odası sohbetlerinde böyle bir adres yapıştırılınca artık yazılmaz, kutunun üstünde açıklama çıkar. Eski mesajlardaki bu adresler bağlantı olarak gösterilmez.

## 161026-358

- Otomatik Rejisör: "Bitişte ilk araçlara odaklan" (varsayılan açık, 3 araç). Son turda (beyaz bayrak) lider, damalı bayraktan sonra ilk N araç bitiş çizgisine yaklaşınca (15 sn kala) kamera onlara geçer, çizgiyi geçişini gösterir (3 sn daha); sıradaki gelir. Kaza ve diğer kurgudan önceliklidir.
- TV Sıralama Kulesi: "Kaç araç bitirince kalksın" (varsayılan 3): damalı bayraktan sonra ilk N araç çizgiyi geçince kule kaybolur (daha az araç varsa hepsi geçince).
- TV Sonuç Tablosu: "Sürücü adı" ayarı: A. SOYAD (varsayılan), AD SOYAD (tam ad) ya da SOYAD.

## 161026-357

- TV Sıralama Kulesi: "Sığmayanları sırayla göster" (varsayılan açık): satır sayısından fazla araç varsa sonraki sıralar (26-50, 51-…) sayfa sayfa gösterilir, sonra başa döner. İlk sayfada kalma (30 sn), sonraki sayfalarda kalma (12 sn) ve "sonraki sayfalarda üstte sabit kalan" (ör. 3: lider ve ilk üç hep üstte) ayarları.

## 161026-356

- Otomatik Rejisör artık PRO üyelere özel (Yönetim › PRO özellikleri › Araçlar: "Otomatik Rejisör", varsayılan PRO). Araçlar sayfasında PRO rozeti ve not; anahtar PRO olmayanlarda kapalı. Rust da denetler: kilitliyken iRacing'e kamera komutu gönderilmez.
- Web sitesi: Otomatik Rejisör "(PRO)" olarak işaretlendi.

## 161026-355

- Yeni overlay: **TV Yarış Sonucu** (Yayın): yarış sonunda TV'deki gibi podyum, ilk üç basamaklarda (ortada kazanan, solda ikinci, sağda üçüncü): logo, ad, takım, bayrak, numara, fark. Tarafsız: oyuncunun kendi bilgisi gösterilmez.
- TV Sonuç Tablosu ve TV Yarış Sonucu: damalı bayraktan sonra "Kaç araç bitirince açılsın" (varsayılan 3) ve "Sonra kaç saniye beklesin" (varsayılan 15 sn) ayarları.
- TV Sıralama Kulesi ve Sonuç Tablosu tarafsız: "Listede yoksam altta kendimi göster" ve kendi satırını vurgulama varsayılan kapalı (tekrarı kimin çektiği belli olmaz).
- TV Sürücü Bandı: yeşil bayraktan önce bütün sürücüleri pole'dan başlayarak sırayla gösterir (tek bant; kamera değişirse kameradaki araç). Yeşil bayraktan sonra ikinci bant "Pistte en yakın araç" ve yalnızca kapışma varken (fark 1 sn altında, ayarlanır) görünür; fark açılınca kalkar, yalnızca ekrandaki aracın bandı kalır.
- Otomatik Rejisör: grid turu tekrar izlerken de çalışır. Kurgu ayarlarındaki kaydırıcılar görünmüyordu (yalnızca adlar vardı): düzeltildi.
- TV overlay'lerinde beyaz zemindeki yazılar gölgesiz (daha net).
- Web sitesi: TV Yarış Sonucu eklendi (71 overlay).

## 161026-354

- TV overlay'leri damalı bayraktan sonra gizlenmiyordu: TV Sürücü Bandı, En Hızlı Tur ve Mücadele oturum verisine (bayrak / yarış durumu) abone değildi; ayrıca daha önce eklenmiş overlay'lerin kaydında yeni ayarlar (yeşil / damalı bayrakta gizle, sonuç tablosunun ekranda kalma süresi) olmadığından varsayılanları devreye girmiyordu. Artık TV overlay'leri kayıtta olmayan ayarlar için varsayılanı kullanır.
- TV Sonuç Tablosu: sayfa çevirme çalışmıyordu (zamanlayıcı her veri güncellemesinde baştan kuruluyordu); 20'den fazla araçta sayfalar artık ayarlanan sürede döner. Yarış sonunda sıralama verisi bir an boş gelince tablo kapanıp açılıyordu (yanıp sönme); son dolu liste tutulur. 60 sn sonra kaybolur (ayar).
- Bütün TV overlay'leri: sıralama verisi bir an boş gelirse son liste birkaç saniye tutulur (yanıp sönme olmaz).

## 161026-353

- TV Sıralama Kulesi saati: yeni "Yarış başladıktan sonra geçen süre" seçeneği (varsayılan): yeşil bayraktan itibaren sayar (grid ve ısınma turu dahil değil; yarış başlamadan 00:00:00). Uygulama yarışın ortasında açıldıysa süreli yarışta toplam süre - kalan süreden hesaplanır. "Oturumun geçen süresi" seçeneği eski davranış.
- "Kalan süre" seçiliyken saat boş kalıyordu: tur sayılı yarışlarda iRacing kalan süre vermiyor; artık kalan tur yazılır ("12 LAPS"). Saat kutusu uzun değerlere göre genişler.

## 161026-352

- TV Sonuç Tablosu sürekli açılıp kapanıyordu: sıralama verisi her geldiğinde (saniyede 2 kez) satırlar baştan kurulup giriş animasyonu yeniden oynuyordu. Satırlar artık yerinde güncellenir (Sıralama Kulesi ve Sürücü Bandı'nda da).
- TV Sonuç Tablosu: "Yarış sonunda ekranda kalma" ayarı (varsayılan 60 sn): damalı bayraktan sonra bu kadar görünür, sonra kaybolur ve o yarışta tekrar çıkmaz; 0 = oturum bitene kadar.

## 161026-351

- Yeni: **Otomatik Rejisör** (Araçlar sayfası, iRacing). Yayında kamerayı kendisi yönetir: yarış başlamadan (gridde, ısınma turunda) araçları pole'dan başlayarak sırayla gösterir; yeşil bayrakta iRacing'in TV Mixed kamerasına geçer ve lideri, ön sıraları, mücadeleleri (fark ~1 sn altı, kovalayan araç kadrajda) gösterir, ara sıra arkadaki araçlara geçer (en uzun süredir gösterilmeyen önce: zamanla bütün araçlar ekrana gelir). Biri pistten çıkar ya da hızlıyken birden durursa hemen oraya keser. Tekrar izlerken de çalışır. Çekim süresi, kurgu oranları, kamera grubu (TV Mixed / seçtiğim / TV kameraları / TV + araç üstü), grid turu ve kaza odağı ayarlanır; "Sonraki çekim" düğmesi; kamerayı elle değiştirince 20 sn bekler. Araçta sürerken kameraya dokunmaz.
- TV overlay'leri: "Damalı bayraktan sonra gizle" (Sıralama Kulesi, Sürücü Bandı, En Hızlı Tur, Mücadele) ve "Yeşil bayraktan önce gizle" (Sürücü Bandı, En Hızlı Tur, Mücadele) ayarları, varsayılan açık.
- TV Sıralama Kulesi: ad sütunu genişliği ayarı; "AD SOYAD" biçiminde sütun kendiliğinden genişler (uzun adlar sığar).
- Web sitesi: özelliklere Otomatik Rejisör eklendi.

## 161026-350

- TV overlay'lerinde marka logoları kutuya sığmıyordu (ör. TV Mücadele'de Porsche armatürünün üstü / altı kesiliyordu): logolar artık oranı korunarak kutunun içine sığar; 48 logo 5 overlay'in kutu boyutlarında denendi. Web sitesindeki TV overlay görselleri yenilendi.

## 161026-349

- Web sitesi: 5 TV overlay'inin açıklamalarına "Ne zaman görünsün" ayarları eklendi (15 dil).

## 161026-348

- TV yayını overlay'lerine "Ne zaman görünsün" ayarları: kendi olayında (mücadele olunca, yeni en hızlı tur atılınca, damalı bayraktan sonra, kamera başka araca geçince), her zaman, belirli aralıklarla (kaç dakikada bir, kaç saniye) ya da gizli. Olayda görünenlerde "bir seferde en çok" süre ve "tekrar görünmeden önce bekleme" var: ör. mücadele en çok 30 sn ekranda kalır, sonra 30 sn beklemeden tekrar çıkmaz. "Sadece yarış oturumunda" seçeneği (Mücadele'de varsayılan açık). Gizlenip görünürken yumuşak geçiş.
- TV En Hızlı Tur "her zaman" / aralıklı kipte o anki en hızlı tur sahibini gösterir.

## 161026-347

- Yeni TV yayını overlay'leri (Overlaylarım › Yayın): **TV Sıralama Kulesi** (GT World Challenge yayınlarındaki gibi solda dikey sıralama; başlıkta seri adı, oturum, pist ve bayrak, yarış saati, logo, soyad, kategori / sınıf renkli numara, lidere fark; sıra kazanan / kaybeden satır yanıp söner), **TV Sonuç Tablosu** (yarış sonundaki büyük tablo: takım, aracı süren 3 sürücüye kadar, numara, +3 LAPS gibi fark; sayfa sayfa döner, damalı bayraktan sonra kendiliğinden çıkar), **TV Sürücü Bandı** (alt bant: sıra, logo, ad, takım, bayrak, numara; üstünde hız yayı, BRAKE ve vites şeridi), **TV Mücadele** ("BATTLE FOR P5": iki sürücü, fark, kapanıyor / açılıyor ve 30 sn grafik) ve **TV En Hızlı Tur** (mor "FASTEST LAP" bandı).
- TV Sürücü Bandı: iRacing TV kamerasında ekrandaki araç ve pistte ona en yakın araç yan yana çıkar; ikisinde de hız (km/h) ve vites görünür. Diğer araçların hızı tur yüzdesi değişiminden, vitesi iRacing'in CarIdxGear verisinden gelir; fren bilgisini iRacing vermediği için yavaşlamadan tahmin edilir.
- Sıralama verisine takım adı eklendi (takım yarışlarında).
- Web sitesine 5 yeni overlay ve görselleri eklendi (overlay sayısı 70).

## 161026-346

- Ses odaları pencerenin tüm genişliğini kullanır (eskiden sayfa 1200 px'te kalıyor, sağ taraf boş görünüyordu). Oda ekranında kişi kutuları sahneyi doldurur: pencere boyutuna ve kişi sayısına göre en büyük kutuyu verecek sütun sayısı seçilir (Discord gibi). Tüm odalar sayfasında bölümler yan yana sütunlar halinde dizilir; kalabalık bölüm tüm satırı kaplar.

## 161026-345

Supabase'de `c124_guncelleme.sql` çalıştırılmalı.

- Düzeltme: ses odasında bir süre sonra kişi diğerlerine odadan çıkmış gibi görünüyor, sesler gelmeye devam etse de kendi sesi gitmiyordu. Sebep: bağlantı kısa süre kopup kendiliğinden geri gelince odadaki "buradayım" kaydı yenilenmiyordu; uzun süre yanıt veremeyince de sunucudaki ses oturumu siliniyordu. Artık: kanal yeniden bağlanınca kayıt hemen yenilenir; 15 sn'de bir bekçi kanalı ve kaydı denetler (eksikse yeniler, kanal kapalıysa yeniden bağlanır); sunucudaki oturum kaybolmuşsa uygulama birkaç saniyede sessizce yeniden bağlanır. Bağlantı nabzı 30 yerine 20 sn'de bir.

## 161026-344

- Ses ayarları › Yayın (OBS): ses odasındaki konuşmalar kulaklığa gitmeye devam ederken ayrıca seçilen ikinci bir aygıta (ör. ücretsiz VB-Audio Virtual Cable) da gönderilir; OBS'te "Ses Girişi Yakalama" ile o aygıt alınır. Oyun ve masaüstü sesinden ayrı, kendi ses ayarıyla. Kişi başı ses ve "benim için sustur" yayına da uygulanır. Kurulum adımları sayfada yazar. (OBS'in "Uygulama Ses Yakalama"sı programın sesini alamayabiliyor: ses WebView2'nin ayrı işleminden çalıyor.)

## 161026-343

- Düzeltme: program tepsiye küçültülünce (pencere gizlenince) birkaç dakika sonra ses odası bağlantısı kopuyordu. Gizli / simge durumundaki pencerede tarayıcının zamanlayıcıları dakikada bire düşürmesi ve sayfayı arka plana alması kapatıldı; bağlantı nabzı ve oturum yenileme kesintisiz sürer. (Değişiklik programı yeniden başlatınca geçerli olur.)
- Arkadaşlar (sohbet) penceresi ana pencerenin sağ kenarına yapışır: üst çubuktaki Arkadaşlar düğmesine basınca uygulamanın sağında, onunla aynı boyda açılır; uygulama taşınınca / boyutlanınca peşinden gelir. Pencereyi tutup başka yere taşıyınca o seferlik ayrılır. Ayarlar › Sohbet'ten kapatılabilir.
- Ses ayarları › Görünüm (PRO): ses odaları için 7 renk teması (Pitwall, Discord, Gece mavisi, Karbon, Synthwave, Yarış yeşili, Açık) ve 3 kişi görünümü (Kutular, Daireler, Liste). Tema sol menüye, oda ekranına, Tüm odalar sayfasına ve kişi menüsüne uygulanır. PRO olmayanlar önizlemeleri görür.
- Direksiyon Ekranı: her görünüme (araç tarzı ekranlar ve kendi tasarımların dahil) eklenebilen lastik sıcaklığı göstergesi. Yeri: ekranın altı / üstü / sağı / solu. Tasarımlar: Kutular, Çubuklar (termometre), Araç (üstten görünüm, PRO), İç / orta / dış yüzey (PRO), Halkalar (PRO). İdeal sıcaklık aralığı ayarlanır (renkler ona göre), istenirse basınç da gösterilir. Ayar: overlay ayarları › Lastik göstergesi.

## 161026-342

Supabase'de `c123_guncelleme.sql` çalıştırılmalı. Yeni Edge Function: `admin-mail` (Verify JWT kapalı); `pitwall-jobs` güncel koduyla yeniden yayınlanmalı. Kayıt e-postalarını da uygulamadan ayarlamak için bir kez `PITWALL_MGMT_TOKEN` sırrı eklenmeli (docs/SUPABASE.md).

- Yönetim › E-posta (SMTP): Gmail adresi ve uygulama şifresi uygulamadan girilir. Kaydedince hem uygulamanın kendi e-postaları (bildirim, destek, rapor) hem de kayıt doğrulama / şifre sıfırlama e-postaları bu hesaptan gider; Supabase paneline girmek gerekmez. "Deneme e-postası gönder" ile ayar doğrulanır (yanlış şifrede ne yapılacağı açıkça yazar). Kayıtta e-posta doğrulaması buradan açılıp kapatılır. Uygulama şifresinin nasıl alınacağı adım adım ve myaccount.google.com/apppasswords bağlantısıyla anlatılır. Şifre sunucuda saklanır, uygulamaya geri gönderilmez.
- Yönetici üye listesi (üst çubuktaki Üyeler): sıralama seçenekleri: aktiflik, üyelik tarihi (en yeni / en eski), son görülme, ad, PRO'lar önce. Her üyenin altında üyelik tarihi yazar. Seçim hatırlanır.
- Sürücü Kartı overlay'ine 5 yeni tasarım: TV yayını, Buzlu cam, Sade (arka plansız), Neon, Kapı numarası.
- Ses odaları: kişi menüsüne "Profili gör". Oda sohbetinde ada ya da fotoğrafa tıklayınca / sağ tıklayınca da kişi menüsü açılır (arkadaş ekle, profil, ses, söz, taşı…).
- Arkadaş listesi: çevrimiçi arkadaşa sağ tıklayınca "Ses odasına davet et" (bulunduğun ses odasına; hangi pencereden olursa olsun).

## 151026-341

Supabase'de `c122_guncelleme.sql` çalıştırılmalı (c121 de çalıştırılmadıysa önce o).

- Ses odalarında sağ tık menüsü: oda içindeki kişi kutularına ve sol menüdeki kişilere sağ tıklayınca (ya da tıklayınca) imlecin yanında kişi menüsü açılır: arkadaş ekle, ses seviyesi, benim için sustur, söz ver / al, yetki, çıkar / uzaklaştır. Başka odadaki kişiler için de açılır (arkadaş ekle, taşı).
- Üyeyi başka odaya taşıma: yönetici / moderatör bir kişiyi (oda kutusundan ya da sol menüden) fareyle tutup sol menüdeki başka bir odanın üstüne bırakır; ya da kişi menüsündeki "Başka odaya taşı" listesinden seçer. Taşınan kişinin uygulaması kendiliğinden yeni odaya geçer ve "X seni Y odasına taşıdı" yazısı görünür. Özel odalarda davet kodu ve doluluk aranmaz.
- Kim taşıyabilir: kişinin bulunduğu odada ve hedef odada yönetici / moderatör olanlar; site yöneticileri ve Ses Odası Moderatörleri her yerde. Oda sahibini / yöneticisini yalnızca site yöneticisi taşır. PRO'ya özel odaya PRO olmayan, uzaklaştırılmış kişi o odaya taşınamaz.

## 151026-340

Supabase'de `c121_guncelleme.sql` çalıştırılmalı.

- Ses odalarına yazılı sohbet: odadayken sağdaki "Sohbet" panelinde odanın mesajları. Bağlantılar tıklanabilir ve önizlenir, Enter gönderir (Shift+Enter yeni satır). Mesajları yalnızca o an odada olanlar görür; 7 gün saklanır, oda silinince mesajları da silinir. Kendi mesajını, oda sahibi / yönetici / moderatör herkesin mesajını silebilir. Panel kapalıyken gelen mesajlar sohbet düğmesinde sayı olarak görünür. Sadece yazı gider, veri kullanımı yok denecek kadar az.
- Ses odaları Discord'a benzer düzende: odadayken ortada kişi kutuları (konuşanın çerçevesi yeşil yanar, söz süresi kutunun köşesinde), altta yuvarlak mikrofon / ses / ayarlar / ayrıl düğmeleri, üstte oda adı ve açıklaması, sağda açılır panel (Sohbet, Söz sırası, Arkadaş davet et, Oda ayarları). Kişi kutusuna tıklayınca kişi kartı açılır (arkadaş ekle, ses seviyesi, benim için sustur, söz ver, yetki, çıkar / uzaklaştır).
- Sol menü: bölüm başlıkları tıklayınca katlanır (katlıyken bulunduğun oda görünmeye devam eder), başlığın yanındaki + ile o bölüme oda kurulur, her odanın altında içindeki kişiler listelenir (bulunduğun odada konuşanın simgesi yeşil halkalı). En altta ses bağlantısı (oda adı, ayrıl) ve kendi mikrofon / ses / ayarlar düğmelerin.
- "Tüm odalar" sayfası kartlarla: her odada kimlerin olduğu küçük fotoğraflarla görünür; yönetim ayarları katlanabilir bölümde.

## 151026-339

- Sol menüdeki Ses Odaları simgesinin üstünde, ses odalarında o an toplam kaç kişi olduğu yeşil rozetle gösterilir (kimse yoksa rozet görünmez). Sayı uygulama açıkken arka planda 45 saniyede bir (Ses Odaları açıkken 15 saniyede bir) kendiliğinden güncellenir.

## 151026-338

- Yakındakiler (Relative) overlayında renk özelleştirme: overlay ayarlarında yeni "Renkler" bölümü. "Renkleri özelleştir" açılınca yazı, soluk yazı, senin satırının arka planı / yoğunluğu / yazısı, seni turlayan, turladığın, fark (saniye), kişisel en iyi tur, pit etiketi, sürücü satırı arka planı ve ayırıcı çizgi renkleri tek tek seçilebilir. Kapalıyken temanın renkleri kullanılır.

## 151026-337

- Düzeltme: ses odasına bağlanırken "Cannot read properties of null (reading 'createOffer')" hatası. Bağlantı sürerken ikinci bir giriş (odaya iki kez tıklama, menüden başka odaya tıklama, davetten katılma ya da yeniden bağlanma) ilk denemenin bağlantısını yarıda kapatıyordu; ilk deneme de kapanmış bağlantıyla devam etmeye çalışıp bu hatayı veriyordu. Artık her deneme kendi kaynaklarıyla çalışır, yenisi gelince eskisi sessizce bırakılır; aynı odaya bağlanırken tekrar tıklamak yok sayılır.

## 151026-336

Supabase'de `c120_guncelleme.sql` çalıştırılmalı.

- Ses odası bölümlerinin sırası: yönetici bölümündeki Kategoriler listesinde kategoriler, "Topluluk odaları" ve "Özel odalar" birlikte listelenir; oklarla istenen yere taşınır. Sıra sunucuda saklanır, herkes sol menüde ve oda listesinde aynı sırayı görür. Yeni kategori "Topluluk odaları"nın üstüne eklenir.

## 151026-335

Supabase'de `c119_guncelleme.sql` çalıştırılmalı.

- Ses odası **kategorileri**: yönetici Odalar sayfasındaki yönetici bölümünden kategori ekler, adını değiştirir, sırasını değiştirir (yukarı / aşağı), siler (içindeki odalar silinmez, "Topluluk odaları"na geçer). Sol menüde ve oda listesinde odalar kategorilerin altında görünür; kategorisiz yönetici odaları "Topluluk odaları", PRO üyelerin odaları her zaman "Özel odalar" altında. Kategoriye konan oda kalıcıdır.
- **Oda simgesi**: oda kurarken ve oda ayarlarında 26 simgeden biri ya da bir emoji. Menüde ve listede odanın yanında görünür.
- **Sadece PRO üyeler girebilir** seçeneği (oda kurarken ve oda ayarlarında). Listede PRO rozeti; PRO olmayanlar için "Gir" kapalı. Yöneticiler, moderatörler ve odada yetki verilenler her zaman girer.
- **Ses Odası Moderatörü**: yönetici, istediği üyeyi bütün odalarda moderatör yapar (yönetici bölümünden kullanıcı arayarak ya da odadakiler listesinde kişiye tıklayıp). Moderatör söz isteyenlere söz verir, süre uzatır, sözü alır, sırayı yönetir, odadan çıkarabilir ve her zaman konuşur. Site yöneticileri de her odada yöneticidir.
- **Arkadaşını odaya davet et**: odadayken "Arkadaş davet et" → arkadaş listesi (çevrimiçiler üstte) → "Davet et". Davet arkadaşına mesaj olarak gider; sohbette "Katıl" düğmeli bir kart çıkar (Arkadaşlar penceresinden de çalışır, panel öne gelip odaya girer). Özel odada davet kodu da eklenir.
- AMS2: Ayarlar › Genel › "Algılama durumunu göster" artık oyunun yönetici olarak çalıştığını (bellek erişimi reddedildi) ve oyunun açık olduğu hâlde belleğin olmadığını (Paylaşımlı Bellek ayarı) ayrı ayrı yazar.

## 151026-334

- Ses Odaları sol menüsü (Discord gibi): en üstte sabit **Ses ayarları** (çark simgesi) ve **Tüm odalar**; altında **Topluluk odaları** (yöneticilerin kurduğu, boş kalsa da hiç silinmeyen odalar) ve **Özel odalar** (PRO üyelerin kurduğu, içinde kimse kalmadıktan 1 saat sonra silinen odalar). Odaya tıklayınca girilir; içinde olduğun oda vurgulanır, odadaki kişi sayısı yanında yazar. Liste 15 sn'de bir yenilenir.
- Odalar sayfasında da aynı iki grup.
- Söz hakkıyla odalarda el simgesi (✋): menüde, oda listesinde ve oda başlığında.
- Yöneticiler her odayı silebilir (çöp kutusu; onay penceresinde oda sahibi yazar). İçindekiler odadan çıkarılır.
- Supabase: `c118_guncelleme.sql` çalıştırılmalı (c117'den önce PRO üyelerin kurduğu odalar da "Özel oda" sayılır ve boş kalınca silinir).

## 151026-333

- Site: "Ses Odası" overlay'i overlay listesine ve galeriye eklendi (görsel, açıklama, özellikler; 14 dilde). Overlay sayısı artık 65 (sayfa başlıklarındaki eski "61 overlay" da düzeltildi).

## 151026-332

- Site: Özellikler sayfasındaki "Ses odaları" kartı güncellendi (herkes ücretsiz girer, oda kurmak PRO; yapay zekâ gürültü engelleme, algılama eşiği, mikrofon / ses kapatma tuşları, Ses Odası overlay'i). Fiyatlandırma listelerine "Ses odalarına katılma" (ücretsiz) ve "Ses odası kurma" (PRO) eklendi. 14 dilde.

## 151026-331

- Ses odası kurma izni (sunucuda denetlenir; Supabase'de `c117_guncelleme.sql` çalıştırılmalı):
  - Varsayılan: yöneticiler ve **PRO üyeler** kurar, herkes girer.
  - Yöneticiler Ses Odaları sayfasındaki "Kimler oda kurabilir" ayarıyla değiştirebilir: sadece yöneticiler, PRO üyeler, PRO + takım yöneticileri (takım odası) ya da herkes.
- Yönetici olmayanların kurduğu odalar içinde kimse kalmadıktan **1 saat sonra kendiliğinden silinir**. Yöneticilerin odaları kalıcıdır, yöneticiler için 10 oda sınırı da yok.
- Odadayken de bütün odalar (kurduğun odalar, takım ve herkese açık odalar) aşağıda görünür. İçinde bulunduğun oda "Buradasın" diye işaretlenir; başka odaya "Gir" ile doğrudan geçilir.
- Yeni oyun simgeleri: RaceRoom, F1, Forza, DiRT Rally / GRID ve BeamNG için logolar (oyun seçicide, arkadaş listesinde oynadığı oyunun yanında). Koyu zeminde okunsun diye siyah kısımlar beyaza çevrildi.
- Odadakiler listesinde kişiye tıklayınca **Arkadaş ekle** düğmesi var. Zaten arkadaşsanız ya da istek gönderildiyse durumu yazar; sana istek gönderdiyse oradan kabul edilir.

## 151026-330

- Oyun seçimi artık "öncelik": Ayarlar › Genel › Oyun'da belirli bir oyun (ör. iRacing) seçiliyken o oyun açık değilse diğer oyunlar da aranır. Eskiden iRacing seçili kalmış biri AMS2'yi (ya da başka bir oyunu) açınca bağlantı kurulmuyor, overlay'ler görünmüyordu. Durum yazısı "Aranan: iRacing" yerine "Öncelik: iRacing (diğer oyunlar da aranıyor)".

## 151026-329

- Düzeltme: Ses Odaları sayfası yayın sürümünde açılırken "Cannot access 'x' before initialization" hatası veriyordu (odadakiler listesinin sıralaması).
- Ses Odaları › **Ses ayarları** (sol menüde Ses Odaları'nın altında):
  - **Gürültü engelleme**: Güçlü (yapay zekâ tabanlı RNNoise; klavye, fan, araba, ortam sesi), Standart (Windows / tarayıcı), Kapalı. 90 Hz altı uğultu her zaman kesilir.
  - **Algılama eşiği** (ses kapısı): Otomatik (ortam gürültüsünü ölçer), Elle (ölçer çubuğunda tıklayıp sürükleyerek) ya da Kapalı. Konuşma bitince bekleme süresi ayarlanır. Eşiğin altındaki ses hiç gönderilmez.
  - **Mikrofonu dene**: canlı seviye çubuğu ve eşik çizgisi, istenirse "Kendimi duy". Mikrofon kazancı (%0–300).
  - Mikrofon / hoparlör seçimi, yankı giderme, otomatik ses seviyesi, genel ses.
- **Kısayollar**: mikrofonu kapat / aç ve sesi kapat / aç (kimseyi duymazsın, mikrofon da kapanır). Klavye tuşu ya da direksiyon düğmesi atanır, oyun öndeyken çalışır, basınca ekranda kısa bildirim çıkar. Ayarlar › Kısayollar'da da var.
- Yeni overlay: **Ses Odası**. Oyunda odadakileri gösterir; konuşanın adı yanar, mikrofonu kapalı / söz hakkı olmayanlar ve kalan söz süresi görünür. Herkes / konuşabilenler / sadece konuşanlar, satır sayısı, boyut, renk ayarlanır. Odada değilken gizlenir.
- Konuşma göstergesi artık ses iş parçacığında ölçülüyor (panel gizliyken de doğru çalışır).
- Sohbetler: arkadaş, grup ve takım mesajlarındaki **bağlantılar tıklanabilir** (http, https, www.). Mesajın altında **bağlantı önizlemesi**: sayfanın başlığı, açıklaması ve görseli (YouTube, haber siteleri…); resim bağlantılarında resmin kendisi. Önizleme uygulama tarafından indirilir, yerel ağ adresleri önizlenmez. Ayarlar › Sohbet › "Bağlantı önizlemesi" ile kapatılabilir.

## 151026-328

- Ses Odaları artık sol menüde ayrı bir bölüm (ses dalgası simgesi, Sesli Mühendis'in üstünde); Sürücüler altından kaldırıldı. Üst çubuktaki oda göstergesine tıklayınca da buraya gelinir. Yöneticiler Görünürlük › Menü görünürlüğü'nden bu bölümü gizleyebilir.

## 151026-327

- Yeni: **Ses Odaları**. Discord benzeri sesli odalar uygulamanın içinde: herkese açık, davet kodlu özel ya da takım odası (takım yöneticileri kurar). Kişi başı en çok 10 oda, odada en çok 60 kişi.
- Kalabalık odalar için **"Söz hakkıyla"** modu: oda sahibi, yöneticiler, moderatörler ve "konuşmacı" yetkisi olanlar her zaman konuşur. Diğerleri "Söz iste"ye basıp sıraya girer.
  - Moderatör söz verir (odanın varsayılan süresi ya da seçilen süre: 15 sn – 10 dk), +30 sn / +1 dk uzatır, sözü geri alır, "Sıradakine ver", "Herkesi sustur", isteği düşürür.
  - "Otomatik sıra" açıkken süre bitince söz kendiliğinden sıradakine geçer.
  - Geri sayım çubukları; söz geldiğinde ve bittiğinde kısa ses.
- Söz hakkı olmayanın sesi sunucuda engellenir; kimse dinleyemez.
- Yetkiler (yönetici, moderatör, konuşmacı) oda içinden verilir. Ayrıca: odadan çıkarma, 10 dk uzaklaştırma, kalıcı yasak. Özel odada davet kodu kopyalanır ya da yenilenir.
- Açık mikrofon ya da bas-konuş. Bas-konuş için klavye tuşu ya da direksiyon düğmesi atanır (Ayarlar › Kısayollar'da da). Tuş yutulmaz, oyun öndeyken çalışır.
- Ses ayarları: mikrofon ve hoparlör seçimi, gürültü bastırma, yankı giderme, otomatik ses seviyesi, genel ses. Kişi başı ses ayarı (%0–200) ve "benim için sustur" da var.
- Konuşanın simgesi yanar. Üst çubukta oda göstergesi var: mikrofon, ses ve ayrıl düğmeleri, söz sendeyse kalan süre.
- Odada iken paneli kapatmak konuşmayı bitirmez; panel gizlenir. Bağlantı koparsa kendiliğinden yeniden bağlanır.
- Altyapı: ses Cloudflare Realtime SFU üzerinden akar (ayda 1000 GB ücretsiz) ve kaydedilmez. Supabase'de yalnızca oda, yetki ve söz bilgisi tutulur. Kurulum: `docs/ses_odalari_kurulum.md`. Supabase'de `c116_guncelleme.sql` çalıştırılmalı, `voice-sfu` Edge Function'ı yayınlanmalı.

## 151026-326

- Telemetri › Sürüş çizgisi canlı turlarda da: konum veren oyunlarda (ACC, AC, LMU / rF2, AMS2, RaceRoom, F1, DiRT / GRID, Forza) her turun pistteki çizgisi kaydedilir (iz dosyasında px / py, metre). Kıyaslanan turların çizgileri üst üste, imleçle A'ya uzaklık metre olarak.
- iRacing canlı veride aracın konumunu vermez: iRacing'de telemetri kaydı açıksa (sürerken Alt+L) yarıştan sonra yeni .ibt dosyaları kendiliğinden içe aktarılır (Telemetri sayfasında ".ibt içe aktar" yanındaki "Otomatik", varsayılan açık). Turlar aynı kimlikle yazılır: canlı kaydedilmiş turların üzerine sürüş çizgisi eklenir, kopya oluşmaz.
- Viraj numaraları ve adları: pist haritasında ve sürüş çizgisinde virajlar numaralanır (turun hız diplerinden); "Viraj adları" bölümünden her virajın adını yaz (ör. La Source). Adlar pist başına saklanır (hesapla eşitlenir); haritada, sürüş çizgisinde ve viraj analizi tablosunda görünür. Numaraya tıklayınca grafiklerde o viraja gidilir.
- CSV dışa aktarmada konum sütunları (pos_east_m, pos_north_m). Paylaşım sayfasında (site) canlı turların sürüş çizgisi ve viraj numaraları.

## 151026-325

- Le Mans Ultimate: oyunun kendi paylaşımlı belleği (`LMU_Data`) okunuyor; rF2 Shared Memory eklentisi artık gerekmiyor (yeni LMU sürümlerinde eklenti yüklenmediği için LMU algılanmıyordu). Oyunda Ayarlar › Oynanış › "Eklentileri etkinleştir" açık olmalı (açtıktan sonra oyunu yeniden başlat). Eklenti kurulu rFactor 2 ve eski LMU eskisi gibi çalışır.
- Ayarlar › Genel › Oyun › "Oyun algılanmıyor mu? Algılama durumunu göster": her oyun için bellek / port bulunup bulunmadığını, oyunun durumunu (menü, sürüşte…) ve bağlanmama sebebini gösterir (ör. AMS2'de "Paylaşımlı Bellek = Project CARS 2" seçili değilse bellek hiç oluşmaz). Kopyalanabilir.

## 141026-324

- Lider Tablosu: sol üstteki süre artık varsayılan olarak yarışın kalan süresini gösterir (oyunun yarış saatinden; oturumun başındaki bekleme ve grid süresi sayılmaz). Yeni ayar Başlık › "Sol üstteki süre": Yarışın kalan süresi (varsayılan), Yarışın geçen / toplam süresi, Oturum başından geçen / toplam (eski görünüm). Tur sayılı yarışlarda eskisi gibi lider turu / toplam tur.

## 141026-323

- Telemetri › İzler: fareyle grafiklerin üzerinde gezinirken değerler imlecin olduğu yerde, çizginin üstünde de yazar (her turun noktası ve değeri, birimiyle: Gaz %54, Fren %80, Hız 184 km/h, vites, direksiyon, devir, G, fark). Etiketler üst üste binmez; sağ kenara yaklaşınca imlecin soluna geçer. Grafik başlığının sağındaki değerler eskisi gibi duruyor.
- Paylaşım sayfasında (site) da aynısı.

## 131026-322

- Kendiliğinden kapanma için önlem ve teşhis: tepsi menüsü, tepsi simgesi ve overlay yenileme gibi ana iş parçacığında çalışan geri çağrılardaki bir hata artık programı kapatmıyor (yakalanıp crash.log'a yazılıyor). Program yine de beklenmedik kapanırsa (bellek bitmesi, sürücü çökmesi, sonlandırılma) bir sonraki açılışta crash.log'a "önceki oturum beklenmedik kapandı" satırı düşer: ne zaman açıldığı, ne kadar çalıştığı, bellek kullanımı (en yüksek dahil) ve son durum (oyuna bağlı mı). Bellek 2,5 GB'ı aşarsa da not düşülür.
- Ayarlar › Genel › Hakkında › "Hata günlüğü": günlüğü programın içinden göster, kopyala ya da klasörünü aç.
- F1 kaynağı açılırken ve DiRT sektör numarasında olası taşma düzeltildi.

## 131026-321

- Yakın Takip: yeni "Performans" ayar grubu. Performans modu: Görsel kalite (tüm efektler, varsayılan), Dengeli (yakınlık renk geçişi ve kenar karartması kapalı), En yüksek FPS (animasyon yok, 3B eğim yok, düz görünüm), Özel (kayma animasyonu, yumuşak renk geçişi, 3B eğim, kenar karartması ve yakın araç renk dolgusu tek tek açılıp kapanır). En pahalı efekt yumuşak renk geçişiydi (her karede satırın yeniden boyanması).
- Yakın Takip: yakınlık değeri 1/20 adımlara yuvarlanıyor; küçük fark değişimlerinde satırın stili ve animasyonu yeniden başlamıyor (tüm modlarda daha az çizim). Güncelleme sıklığı ayarına FPS ipucu eklendi.

## 131026-320

- Delta Bar: tur süreleri tek tek açılıp kapatılabilir (Şimdi, Son, En iyi; "Tur süreleri" kapalıyken hepsi gizli). Yeni ayarlar "Çubuk / gösterge" (kapatınca seçili tasarımın sadece +/− sayısı kalır) ve "Eğilim oku": hepsi kapatılınca overlay'de yalnızca fark sayısı kalır.
- Delta Bar: 4 yeni tasarım — Kapsül (fark yönüne göre yeşil / kırmızı dolan, büyüdükçe koyulaşan kapsül), Dikey çubuk (yukarı kazanç, aşağı kayıp; ekran kenarı için dar), LED şerit (direksiyon ekranı gibi ortadan iki yana yanan 10+10 ışık, PRO) ve Kayan cetvel (farkla kayan cetvel ve ortada ibre, PRO). Toplam 10 tasarım.
- Delta Bar "Sadece büyük sayı" (ve dar tasarımlar): tur sürelerinde "EN İYİ" alt satıra düşmüyor; dar tasarımlarda etiket üstte, süre altta üç sütun, dikey tasarımda alt alta.
- Site: Delta Bar açıklaması (tasarımlar, açılıp kapanan öğeler, RaceRoom), 14 dil.

## 131026-319

- Yeni oyunlar. Tüm alanla (lider tablosu, relative, radar, harita dahil): **RaceRoom** (paylaşımlı bellek, ek ayar gerekmez; delta, olay puanı, start ışıkları, DRS / batarya) ve **F1 23 / F1 24 / F1 25** (oyunun UDP telemetrisi; 22 araç, lider farkı, lastik hamurları, ERS / DRS, hasar, start ışıkları, güvenlik aracı). **Project CARS 3** AMS2 / PC2 belleğiyle çalışır. Sadece kendi aracınla (oyunlar rakip verisi vermiyor): **Forza Motorsport / Forza Horizon 4-5** ("Data Out" UDP), **DiRT Rally 2.0 / DiRT Rally / DiRT 4 / GRID** (Codemasters UDP, extradata=3) ve **BeamNG.drive** (OutGauge).
- Ayarlar › Genel › Oyun: seçici yeni oyunlarla birlikte alt satıra geçebilir; simgenin üzerine gelince o oyunda yapılacak ayar yazar. Yeni satır "UDP portları": F1 / DiRT 20777, Forza 5300, BeamNG 4444 (değiştirilebilir); port sadece oyun bu bilgisayarda açıkken dinlenir (SimHub gibi programlarla çakışmasın diye), "Konsoldan da al" açıksa sürekli (PlayStation / Xbox'taki F1 ve Forza). Açılamayan port (başka program kullanıyor) satırda kırmızı yazar.
- Overlay'ler oyuna göre gizlenir (simSupport.ts): rakip isteyen overlay'ler Forza / DiRT / BeamNG'de, iRacing'e özel olanlar (setup adı, FFB, sınıf uyarısı vb.) yeni oyunlarda görünmez.
- Rust: sims/udp.rs (port dinleyici, paket sınıflama), sims/f1.rs, sims/r3e.rs, sims/solo.rs (Forza, DiRT, BeamNG). Paket ve bellek düzenleri yayımlanmış belgelerden (EA F1 UDP spesifikasyonu, sector3studios r3e.h 3.5 — gcc offsetof ile doğrulandı); örnek paketlerle ve gerçek UDP soketiyle testli.
- Site: özellikler sayfasındaki "Hangi oyunda ne çalışıyor?" tablosuna 5 sütun, ana sayfa / SSS metinleri, yarışçılar sekmeleri, takım ve profil oyun listeleri (14 dil).
- Supabase: c115_guncelleme.sql (yeni oyun kimlikleri: telemetri oturumları, sürücü kimlikleri, arkadaş listesindeki oyun, takımın oyunu).

## 131026-318

- Telemetri › ".ibt içe aktar" (yalnızca iRacing): iRacing'in kaydettiği telemetri dosyaları (Belgeler › iRacing › telemetry) seçilir, içindeki turlar canlı kayıt gibi telemetrine eklenir (tur süreleri, sektörler, 1000 noktalık izler, setup adı). Birden çok dosya bir kerede seçilebilir; aynı dosya yeniden içe aktarılınca kopya oluşmaz. Telemetri kaydını iRacing'de açmak için: sürerken Alt+L. Rust: ibt.rs (dosya biçimi okuyucu; satırlar laprec Recorder'dan geçer), komutlar ibt_import / ibt_default_dir.
- Tur analizi › "Sürüş çizgisi": .ibt'den içe aktarılan turlarda GPS konumu (Lat / Lon) saklanır; kıyaslanan turların çizgileri üst üste çizilir (tekerlek: yakınlaş, sürükle: kaydır, çift tık: sıfırla), ortak imleçle her turun o mesafedeki yeri ve A'ya uzaklığı (m). Canlı veride iRacing konum vermediği için çizgi yalnızca içe aktarılan turlarda var.
- Tur analizi › "CSV": kıyaslanan turların bütün kanalları (süre, hız, gaz, fren, vites, direksiyon, devir, G, ABS, konum) mesafe sırasıyla tek CSV dosyasına (Excel ya da başka analiz araçlarında açmak için).
- Paylaşım sayfası (site): sürüş çizgisi (turlarda konum varsa) ve "CSV indir".

## 131026-317

- Telemetri kaydı: tur izi 360 yerine 1000 noktayla kaydedilir (7 km'lik pistte ~7 m'de bir; fren noktaları ve viraj analizi daha hassas). Yeni kanallar: motor devri, yanal / boyuna G, ABS devrede. Eski kayıtlar okunmaya devam eder; farklı çözünürlükteki turlar kıyaslanırken aynı ölçeğe getirilir (fark grafiği, viraj analizi, harita). Rust: laprec.rs Trace (rpm, lat_g, long_g, abs; boşsa yazılmaz).
- Tur analizi › İzler: kanal seçimi (Fark, Hız, Gaz, Fren, Vites, Direksiyon, Devir, Yanal G, Boyuna G, ABS; seçim hatırlanır). Yakınlaştırma: grafikte sürükleyerek bölge seç, tekerlekle yakınlaş / uzaklaş, çift tıkla ya da "Tüm tur" ile sıfırla; imleç ve harita noktası yakınlaştırmada da senkron.
- Paylaşım sayfası (site): yeni kanallar (kayıtta varsa) ve aynı yakınlaştırma; farklı çözünürlükteki turların fark grafiği düzeltildi.

## 131026-316

- Telemetri › Tur analizi: "Viraj analizi" (Garage61 / Track Titan tarzı). Virajlar A turunun hız diplerinden bulunur; her viraj için fren noktası (m), giriş / en düşük / çıkış hızı, tam gaz noktası (m), en düşük vites ve seçilen referansa göre süre farkı. Satıra tıklayınca grafiklerde ve pist haritasında o viraja gidilir.
- Koçluk notları: A'nın referansa göre en çok süre kaybettiği 3 viraj ve nedenleri (erken / geç fren, düşük viraj hızı, geç tam gaz, düşük çıkış hızı, farklı vites) + en güçlü viraj. Referans 2'den fazla turda seçilebilir.
- Teorik en iyi tur: kıyaslanan turların 24 mikro sektöründeki en hızlıları; her turun potansiyeli (teorik en iyiye uzaklığı) ve kaç mikro sektörde en hızlı olduğu.
- Aynı analiz web sitesindeki paylaşım sayfasında da (telemetri.html). Hesaplar tek kaynakta: src/sdk/teleAnalysis.ts (site için website/assets/teleanalysis.js esbuild ile üretilir).

## 131026-315

- Site: overlay görsellerinin hepsi (64) güncel görünümle yeniden üretildi; programın kendi kodu ve demo verisiyle çizildi (lider tablosu, araç logoları, bayraklar vb. bugünkü haliyle). FFB Gücü, Setup Adı ve Arkadaş Uyarısı'nın da artık görseli var. Üretim aracı: Rust `engine.rs` dump_demo_topics (demo verisini JSON'a döker) + scripts/ovshots (çekim sayfası, Playwright çekimi, 960×600 bileşim); görselleri yeniden üretmek için kullanılabilir.
- Yönetim › Ana sayfa görselleri › Overlay Galerisi: her overlay'e birden fazla görsel (en çok 8) eklenebilir, sıralanır, alt metin yazılır, kaldırılır; "Varsayılana dön". İlk eklemede siteyle gelen görsel listenin başına konur. Ana sayfa galerisinde birden fazla görseli olan overlay'de oklar ve noktalarla geçilir. Eski tek görsel kayıtları geçerli.
- Supabase: c114_guncelleme.sql (admin_set_site_images toplam boyut sınırı 20 000 → 250 000 karakter).

## 131026-314

- Telemetri paylaşımı herkese açık: tur analizinde (kıyaslama dahil) ve kendi oturumunda "Paylaş (herkese açık)" bağlantı oluşturup kopyalar; bağlantıyı (telemetri.html?s=…) bilen herkes GİRİŞ YAPMADAN görür. Yalnızca paylaşılan turlar / oturum açılır, telemetrinin geri kalanı ve gizlilik ayarı değişmez. "Paylaşımlarım": bağlantıları kopyala ya da kaldır (kaldırınca bağlantı ve iz dosyaları yeniden kapanır). Başkasının turu kıyaslamadaysa yalnızca telemetrisi herkese açık üyelerin turları paylaşılabilir. Üye profili / pist sıralaması bağlantıları eskisi gibi giriş yapmış üyelere açık.
- Paylaşım sayfası (telemetri.html) uygulamadaki Tur analizi gibi: tur kartları (A'ya göre fark, setup), sektör tablosu (en hızlı sektör mor), pist haritası (A'ya göre kazanç / kayıp renkleri, kıyaslanacak tur seçimi; harita şekli paylaşıma eklenir), fark / hız / gaz / fren / vites / direksiyon grafikleri, grafiklerde ve haritada ortak imleç. Oturum paylaşımında tur tablosu da. Turlar tek tek gizlenip gösterilebilir. 14 dil.
- Tur analizi 5 tura kadar kıyaslar (A–E, ayrı renkler): her tur A'ya göre fark grafiği ve sektör satırı, pist haritasında referans olarak herhangi bir kıyaslanan tur, tur kartında A'ya göre fark. Site: yarışçı oturum sayfasında kendi oturumun için "Herkese açık paylaş".
- Supabase: c113_guncelleme.sql (telemetry_shares tablosu; telemetry_share_create / _get / _revoke, telemetry_shares_mine; iz kovası okuma kuralı paylaşılan izleri herkese okutur; telemetry_laps_info 5 tur).

## 131026-313

- Olaylar ekranı kayıtlı tekrarlarda da çalışır. Olaylar yalnızca canlı sürüşte toplanıyor, kaydedilmiyordu: iRacing'de kayıtlı bir tekrar dosyası açılınca liste boş kalıyor (ya da başka bir yarışın listesi görünüyordu). Artık tekrar izlerken Olaylar penceresinde "Olayları bul": iRacing'in tekrara gömdüğü olay işaretleri (tekrar ekranındaki "sonraki olay" düğmesinin gittiği anlar) tek tek gezilir; her işarette oturum, zaman, kameranın gösterdiği araç ve turu alınır, sonunda tekrar kaldığın yere döner ve oynar (olay başına ~0,2-0,5 sn; "Durdur" ile kesilebilir). Bulunan olaylar o tekrarın listesi olur; tıklayınca tekrar o ana sarılır. Kayıtlı tekrar dosyası açıkken (iRacing SimMode = replay) pencere açılınca ve liste bu tekrara ait değilse tarama kendiliğinden başlar; başka yarışın listesi gösterilmez (yanlış anlara sarardı), "önceki oturum" olarak saklanır. Listenin hangi oturuma ait olduğu iRacing SubSessionID ile (yoksa pist + oturumlar) izlenir. Rust: broadcast::replay_scan_incidents, EventLog::load_replay_hits, events_scan_replay / events_scan_stop komutları; testler replay_file_lists_scanned_incidents, session_keys.

## 121026-312

- Sıralama tablosu: sunucudaki bütün sürücüler görünür. Önceden yalnızca aracı dünyada olanlar (pistte / pitte) ve sunucudan çıkmış ama resmi sırası olanlar listeleniyordu; antrenmanda ya da kimsenin tur atmadığı bir oturumda garajda bekleyenler hiç görünmüyor, piste çıkınca tablo boş kalıyordu (yalnızca sen). Artık garajdaki / henüz piste çıkmamış sürücüler de listede: en sonda, "GAR" etiketiyle ve hafif soluk; fark / aralık sütunları boş. Resmi sırası olmadığı için sıra numarası tablodaki yeridir. Sıra numaraları Yakındakiler ve sesli mühendisle aynı kaynaktan (calc::positions) gelmeye devam eder. Rust: calc.rs garage_car, field_idxs; test standings_show_drivers_in_garage.
- Yakındakiler (relative) yalnızca pistteki / pitteki araçları gösterir (garajdaki araçların pistte konumu yoktur); sıra numaraları tabloyla aynı.
- Yakın Mücadele, Fark Grafiği, Hedef ve Sonuçlar overlay'leri garajdaki sürücüleri rakip / sonuç saymaz.

## 121026-311

- Olaylar penceresi: yarış bitince çizgiyi geçer geçmez açılmıyor; bitişten sonra araçtan çıkınca (ESC ile tekrar / replay ekranına geçince) açılır. Önceden tekrar ekranı canlı görüntüdeyken açılmıyor, ancak geri sarınca açılıyordu. Tekrar izlemeye (geri sarmaya) başlayınca açılması ve araca binince kapanması aynen sürer. Ayar metinleri güncellendi.

## 121026-310

- DigiFlags: "Yeşil bayrağı da göster" açıkken yarış startında yeşil yanmıyordu. Sebep (306): yeşil süresi yeşil ailesinden herhangi bir işaret ilk göründüğünde başlıyordu; iRacing gridde uzun süre "greenHeld" tuttuğu için süre start öncesinde doluyor, start anında "green" gelince sayaç yenilenmiyordu. Artık yeşilin durumu her değiştiğinde (greenHeld → green, sarı / kırmızı kalkınca yeniden yeşil) yeşil yeniden "Yeşil bayrak süresi" kadar yanar (greenState, digiflags/pick.ts). Sürekli yanması için süre 0 yapılabilir.
- Yeni ayar (Genel › Pit servisi): "Autofuel'i otomatik aç" (Kapalı / Yarışlarda / Her oturumda; varsayılan kapalı). Araca binince (ve araçtayken yarış başlayınca) iRacing'in autofuel'i açılır: pitte depo doldurulmaz. SDK'da autofuel için pit komutu olmadığından "#autofuel" pit makrosu iRacing sohbetine yazılır (sohbeti açma: irsdk ChatComand BeginChat; yazı iRacing penceresine WM_CHAR ile, ardından Enter). Komut her zaman "aç" demektir, zaten açıksa değişmez. Rust: broadcast::chat_macro (yalnızca "#" ile başlayan kısa pit makroları), pit_autofuel komutu.
- Olaylar penceresi: araca binince (sürüş başlayınca) kendiliğinden açılmışsa kapanır, elle açılmışsa simge durumuna küçülür (yalnızca biniş anında; yarış bitince soğuma turunda açılan pencere hemen kapanmaz). Tekrar (replay) başlayınca açılmaya devam eder. Oyundan çıkınca (Quit) oturum sırasında açık görülen Olaylar penceresi kapanır (önceden yalnızca kendiliğinden açılan kapanıyordu).

## 121026-309

- Siyah ekran düzeltmesi: yarıştan çıkınca bazen monitör siyah kalıyor, düzelmesi için programı kapatıp açmak gerekiyordu. Sebep: iRacing yarıştan çıkınca sim süreci kapanır ve ekran modu değişir; bu sırada WebView2'nin şeffaf overlay çizimi bozulabiliyor ve görünür kalan overlay penceresi (ör. "sürekli göster" açık Canlı Sohbet / Altyazı, Kan Şekeri) tüm monitörü siyah kaplıyordu. Artık oyundan çıkınca (en az 20 sn süren gerçek bir oturumdan sonra, demo hariç) 4 sn beklenip hâlâ bağlı değilse overlay pencereleri sıfırdan oluşturuluyor; yeni pencere içerik çizilene kadar gösterilmediği için siyah kalmıyor. Oturum değişiminde hemen yeniden bağlanılırsa yenileme yapılmaz. Oyun dışındayken ekran çözünürlüğü / monitör düzeni değişince de yenilenir. Rust: refresh_overlay_windows (lib.rs).
- Tepsi menüsüne "Overlay'leri yenile": ekran yine de kararırsa programı kapatmadan düzeltir.

## 121026-308

- Arkadaş Uyarısı: Demo açıkken (ana ekrandaki Demo ve düzen / topluluk önizlemelerindeki canlı Demo) tuşa basmadan da görünür: belli aralıklarla (en az 12 sn'de bir, ayarlanan süre kadar) "SRTR Pitwall" adıyla örnek uyarı yanıp söner. Demoda ses çalmaz.

## 121026-307

- Topluluk › Düzenler / Yayın düzenleri: paylaşılan bir düzeni "Kullan" ile almak bazı kullanıcılarda hata veriyordu. Sebep: indirilen düzen, programın açılışta her düzene uyguladığı onarımdan geçmeden doğrudan ayarlara ekleniyordu. Paylaşan ile indiren farklı sürümlerdeyse düzende bu sürümde olmayan overlay türleri, eski biçimde ayarlar ya da eksik alanlar (ör. kurallar) kalıyor; "Kullan" ya da düzenin açılması hata veriyordu. Artık indirilen düzen aynı onarımdan geçiyor (normalizeImportedProfile): eski biçimler taşınır, eksik ayarlar varsayılanla dolar, bilinmeyen overlay türleri atılır; temalar da normalizeTheme'den geçer. Paylaşanın yerel işaretleri (varsayılan düzen, kilit, paylaşım kimliği, arka plan işareti, yayın bağı) alınmaz; önceden paylaşanın arka plan işareti yüzünden indirenin aynı kimlikli düzeninin arka planı kopyalanabiliyordu. Bozuk paylaşımda ve bu sürümde hiç overlay'i olmayan düzende anlaşılır hata yazılır.

## 121026-306

- DigiFlags: "Yeşil bayrağı da göster" kapalıyken de yeşil yanıyor ve ekranda kalıyordu. Sebep: ayar yalnızca "green" bayrağına uygulanıyordu; iRacing'in start öncesi / sonrası uzun süre açık tuttuğu "greenHeld" (yeşil bekletiliyor) ve "oneLapToGreen" (yeşile bir tur) ayarı atlıyordu. Artık üçü de ayara bağlı. Ayar açıkken yeşil, göründükten sonra "Yeşil bayrak süresi" kadar yanar (varsayılan 5 sn, 0: sim kaldırana kadar), sonra söner. Bayrak seçimi ayrı dosyada (digiflags/pick.ts).

## 121026-305

- Arkadaş Uyarısı: ünlem işareti yazı karakteri yerine şekil olarak çiziliyor; yazı tipinden bağımsız olarak üçgenin / dairenin tam ortasında duruyor.
- Arkadaş Uyarısı artık PRO overlay. PRO olmayan üye tuşa basınca uyarı gönderilmez, ekranda "Arkadaş uyarısı PRO üyelik gerektirir" yazar. Site: overlay listesinde PRO rozeti.
- Supabase: c112_guncelleme.sql (app_config.pro_overlays'e "friendalert" eklenir; Yönetim › PRO özellikleri'nden değiştirilebilir).

## 121026-304

- Yeni overlay: Arkadaş Uyarısı. Arkadaş listendeki biriyle aynı yarıştayken atadığın klavye tuşuna ya da direksiyon düğmesine basınca onun ekranında yanıp sönen ünlem işareti ve "DİKKAT" yazısı çıkar (o basınca senin ekranında). Tuş / düğme: Kısayollar › Arkadaşa uyarı (tuş yutulmaz, oyun öndeyken de çalışır). Tasarımlar: üçgen, daire, şerit; yazı, gönderenin adı, süre (5 sn), yanıp sönme hızı, boyut, renkler ve isteğe bağlı ses ayarlanır. Aynı yarış: arkadaşın profilindeki sim adı bağlı oturumun sürücü listesinde olmalı. Uyarı Supabase Realtime yayınıyla gider (veritabanına yazılmaz); alıcı, gönderenin kabul edilmiş ve susturulmamış arkadaşı ve aynı oturumda olduğunu kendisi denetler, 30 sn'den eski uyarıyı göstermez. Ekranda kısa bilgi: "Gönderildi" / "Aynı yarışta arkadaşın yok" / giriş gerekli. Demoda basınca kendi ekranında önizleme. Rust: voicecmd.rs (friend-alert-press), session_driver_names komutu. Şimdilik iRacing.
- Tur analizi: sektör karşılaştırma tablosunda "Setup" sütunu (A ve B hangi setup'la atıldı; "Aynı setup" / "Farklı setup"). Karşılaştırılacak tur seçicide kendi turlarının setup adı.
- Tur analizi › İzler: grafiklerin yanında küçük pist haritası; grafiklerin üzerinde gezinirken imlecin pistin neresinde olduğu sarı noktayla gösterilir (büyük pist haritasında da). Küçük haritanın üzerinde gezinince grafiklerdeki imleç oraya gider. Harita bu bilgisayarda öğrenilmiş pist şeklinden çizilir.
- Site: overlay listesine Arkadaş Uyarısı.

## 121026-303

- Telemetri: sayfaların üstünde "Paylaş" düğmesi. Bağlantıyı panoya kopyalar; giriş yapmış her üye web sitesinde (yarisci.html) açıp görebilir. Kendi telemetrin / bir üyenin telemetrisi → ?u=, oturum → ?s=, pist + araç sıralaması → ?b=; tur analizinde o turun oturum sayfası paylaşılır (analizin sitede karşılığı yok).
- Site: yarışçı telemetri sayfalarında (profil, oturum, sıralama) da "Paylaş" düğmesi. Giriş yapmamış biri paylaşılan bağlantıyı açarsa "Giriş yap" onu girişten sonra aynı sayfaya geri getirir. Üst menüde giriş yapmış üyelere "Telemetrim" bağlantısı.

## 121026-302

- Yeni PRO özellik: Altyazı çevirisi (livechat.translate). Konuşma → yazı › Çeviri: oyunda / Discord'da / takım telsizinde başka dilde konuşulanlar altyazıda seçilen dile çevrilmiş görünür (varsayılan: arayüz dili). Çevrimiçi (Whisper) motoruyla çalışır: konuşma yazıya döküldükten sonra aynı OpenAI uyumlu sunucunun sohbet ucuyla çevrilir (aynı API anahtarı; Groq: llama-3.3-70b-versatile, OpenAI: gpt-4o-mini, kendi sunucunda model adı ayardan). Çevrilen kaynakta Whisper dili kendisi algılar; zaten hedef dilde olan cümle olduğu gibi kalır. Seçenekler: yalnızca bilgisayar sesi ya da mikrofon da, "Orijinali de göster" (çevirinin altında küçük harfle özgün metin; altyazı overlay'i ve OBS sayfası). Cümleler sırayla çevrilir; çeviri hata verirse cümle çevrilmeden yazılır ve durum satırında uyarı çıkar. Rust: livechat/translate.rs.
- Site: Canlı Sohbet PRO listesine altyazı çevirisi eklendi.

## 121026-301

- Telemetri: her tur hangi setup'la atıldığını kaydeder (iRacing; setup dosyasının adı, klasör ve .sto olmadan). Telemetri sayfasında en iyi turlar listesi ve kartlarında, oturum ayrıntısının tur tablosunda ("Setup" sütunu; yalnızca setup bilgisi olan oturumlarda) ve tur analizinde gösterilir. Sitede yarışçı telemetri sayfalarında da görünür. Eski turlarda setup bilgisi yok.
- Supabase: c111_guncelleme.sql (telemetry_laps.setup_name; telemetry_record_lap, telemetry_overview, telemetry_session, telemetry_laps_info, telemetry_combo_laps). SQL çalıştırılmadan önce de program sorunsuz tur yükler (setup adı o zamana kadar kaydedilmez).

## 111026-300

- FFB Gücü: iRacing'in Quick Settings'teki gibi FFB gücü sayısı da gösteriliyor, ör. "5.5 (61.4 Nm)". Yeni ayar "Gösterilecek değer": ikisi (varsayılan) / yalnızca güç sayısı / yalnızca Nm. Güç sayısı = 100 × direksiyon gücü (Wheel Force, SteeringWheelPeakForceNm) / Max Force (Nm); direksiyon gücü bilinmiyorsa yalnızca Nm. "Aracın tepe torku" seçeneği aslında direksiyon gücünü (Wheel Force) gösterdiği için adı düzeltildi.
- Yakın Takip: sunucuda / pistte başka araç yokken ortadaki çizgi çizilmiyor.

## 111026-299

- Setup Adı: demo modunda "Yarış başladıktan sonra gizle" uygulanmıyor (demo yarışı hep sürdüğü için overlay hiç görünmüyordu). Varsayılan yazı boyutu 22 px, en fazla genişlik 420 px (eskiden 16 / 320; mevcut kopyada "Sıfırla" ile yeni varsayılanlar gelir). Kenardan sürükleyince en fazla genişlik değişir.
- Sürücü Kartı: tekrar izlerken, izleyiciyken ya da araçta takım arkadaşın varken kameranın izlediği aracın sürücüsü gösterilir (adı, numarası, sırası, aracı, sınıfı, iRating ve lisansı). Kendi özel ad / takım / ikinci satır yazıların yalnızca sen sürerken kullanılır. "Replay'de göster" seçeneği eklendi. Rust: standings paketinde camIdx (iRacing CamCarIdx).

## 111026-298

- Vites ve Hız Göstergesi overlay'lerine "Replay'de göster" seçeneği eklendi (varsayılan açık).

## 111026-297

- Yeni overlay: FFB Gücü (iRacing). FFB gücü ayarını (Max Force) Nm olarak gösterir. Anlık tork çubuğu, sınıra dayanınca (clipping) kırmızı uyarı, isteğe bağlı son 30 sn'de sınırda kalma oranı ve aracın tepe torku. Tasarımlar: kart, yatay çubuk, gösterge, yalnızca yazı; boyut ve renkler ayarlanabilir. Rust: SteeringWheelMaxForceNm / PctTorque / Torque / PeakForceNm, `inputs` konusunda ffb* alanları.
- Yeni overlay: Setup Adı (iRacing). Yüklü setup dosyasının adı; garajda değiştirilip kaydedilmediyse "değiştirildi", isteğe bağlı kaynağı (iRacing / kendi setup'ım), klasör ve .sto uzantısı. Kutu adın boyu kadar (en fazla genişliğe kadar); uzun ad küçülerek tam sığar, çok uzunsa iki satıra iner, kesilmez. "Yarış başladıktan sonra gizle" (varsayılan kapalı; süre varsayılan 30 sn). Tasarımlar: kart, tek satır etiket, yalnızca yazı. `session` konusunda setupName / setupModified / setupType.
- Yakın Takip: "Araçlar uzaktayken gizle" (varsayılan kapalı; önde ve arkada belirtilen süreden, varsayılan 30 sn, yakın araç yoksa overlay gizlenir). "Uzaktaki araçlar şeffaflaşsın" (varsayılan açık) ve "Ortadaki çizgiyi hep göster" (varsayılan açık).
- Olaylar: art arda gelen olay puanları (4 sn içinde) tek olayda birleşir. iRacing aynı pist dışı çıkışa 1x + 1x verebiliyordu ve iki ayrı "Pist dışı" satırı görünüyordu; artık tek satır "2x Pist dışı".
- Site: Özellikler sayfası ve ana sayfa galerisine FFB Gücü ve Setup Adı eklendi (13 dil).

## 111026-296

- Yakın Takip: yeni "Renkler" bölümü. Yakın araç vurgu rengi buraya taşındı; "Özel renkler" açılınca satır arka planı, yazı, ikincil yazı, satır çerçevesi, kendi satırım / orta çizgi, yaklaşıyor / uzaklaşıyor oku, tur önde / tur geride renkleri seçilebilir.
- Sıralama tablosu ve Yakındakiler yarış başında uyumlu: sıra tek yerden hesaplanıyor (calc::positions).
  - Yeşil bayraktan önce (araca binme, grid, formasyon turu) sıralama turlarının sonucuna (grid sırasına) göre dizilir; yarış başlamadan da sıralama sonucu görünür.
  - Start turunda (lider ilk turunu tamamlayana kadar) pistteki konuma göre; iRacing'in resmi sırası bu aralıkta çizgi geçilmeden güncellenmediği için eski kalıyordu.
  - Yakındakiler'deki sıra numaraları Sıralama tablosundakilerle aynı.
- Sesli mühendis: sırayı Sıralama tablosuyla aynı kaynaktan alıyor. Çizgi geçişindeki sıra duyurusu 1,5 sn sonra yapılıyor (iRacing sırayı çizgiden biraz sonra güncellediği için bir önceki turun sırası söyleniyordu). Start değerlendirmesi (iyi / kötü start) grid sırasına göre.

## 101026-295

- Veri Kutusu: En iyi tur / Son tur gibi değerler boşken ("--:--.---") tirelerden bölünüp iki satır görünüyordu; değer artık hep tek satır.

## 101026-294

- "Replay'de göster" artık varsayılan olarak AÇIK (replay'de çalışan tüm overlay'lerde; mevcut kopyalarda da kendiliğinden açılır). Kapatılan kopyada kapalı kalır; "Sıfırla" yeniden açar.
- Veri Kutusu overlay'ine "Replay'de göster" eklendi.
- Sürücü Kartı'ndan "Replay'de göster" kaldırıldı (replay'de çalışmıyor).

## 101026-293

- Ayarlar: seçenek düğmeleri (ör. Pit servisi "Kapalı / Yarışlarda / Her oturumda") uzun açıklama metninin yanında daralıp son düğme yarım kesiliyordu; düğmeler artık daralmıyor ve yazıları tek satırda kalıyor.

## 101026-292

- Genel ayarlar > yeni "Pit servisi (iRacing)" bölümü: "Lastik değişimini otomatik kapat" (Kapalı / Yarışlarda / Her oturumda; varsayılan kapalı). Araca her binişte ve araçtayken yarış oturumu başlayınca pit servisindeki lastik değişimi kaldırılır (iRacing #cleartires komutu; araç yüklenirken iRacing seçimi geri açabildiği için 1,5 ve 5 sn sonra iki kez gönderilir). Yalnızca kendi aracını sürerken çalışır (izlerken / takım arkadaşı sürerken / tekrarda değil). Kod: src/host/autoPit.ts.

## 101026-291

- Overlay ayarları: "Ne zaman gizlensin" bölümünün adı "Görünürlük" oldu. "Replay'de göster" seçeneği replay ekranında çalışan tüm overlay'lerde var (sıralama, yakındakiler, harita, oturum, hava, tur süreleri, sektörler, olaylar, sohbet…).
- Replay ekranında çalışmayan overlay'lerde (Pedallar & Girdi, pedallar, vites, hız, G kuvveti, telemetri, gösterge paneli, veri çerçevesi, delta, fren noktası, koç, virajlar, hasar, ERS, lastikler, pit hızı, yola dönüş, pist limitleri, spotter çubuğu, kör nokta, radar, setup karşılaştırma) bu seçenek yerine açıklama görünür: verileri yalnızca aracı kendin sürerken gelir; tekrar izlerken ya da takım arkadaşın sürerken gelmez. Bu overlay'lerde eskiden açılmış seçenek de uygulanmaz.

## 101026-290

- Site: "Reklam ver" sayfası herkese kapatıldı (core.js ADS_PAGE = false). Menüde, alt bilgide, ana sayfa özelliklerinde ve reklam kutusunun menüsünde bağlantısı yok; reklam.html açılırsa ana sayfaya yönlenir ve arama motorlarına kapalı (noindex). Yönetimdeki reklam ayarları yerinde duruyor; sayfayı geri açmak için ADS_PAGE = true.

## 101026-289

- Paddle reklam satışına izin vermediği için mağaza onayı reddedildi; reklam ödemesi Paddle'dan ayrıldı:
  - ads-checkout: Paddle yalnızca PADDLE_AD_PRODUCT_ID tanımlıysa kullanılır (tanımlanmamalı); yoksa Lemon, o da yoksa "Reklam ödemesi henüz yapılandırılmadı".
  - Site: yönetimde "Reklamlar açık" kapalıyken üst menü ve alt bilgideki "Reklam ver" bağlantıları, ana sayfadaki "Reklam ver" kutusu gizlenir; reklam sayfası giriş yapmamış ziyaretçiye fiyat göstermez, yalnızca "Reklam alımı şu an kapalı" yazar.
  - Kullanım koşulları ve iade politikasından reklam satışı maddeleri çıkarıldı.

## 101026-288

- Site, Hesabım: "PRO satın al ya da uzat" bölümü ana sayfadaki gibi plan kutularıyla gösteriliyor (Aylık / 3 aylık / 6 aylık / Yıllık; "Popüler" ve "En avantajlı" etiketleri, aylık karşılığı, her kutuda Satın al düğmesi). Kupon uygulanınca kutudaki fiyat üstü çizili eski fiyat ve yeni fiyat olarak güncellenir.

## 101026-287

- Site: yasal sayfalar eklendi (Paddle onayı için): Kullanım koşulları (kosullar.html), Gizlilik politikası (gizlilik.html), İade politikası (iade.html). Türkçe arayüzde Türkçe, diğer dillerde İngilizce. Alt bilgide bu sayfaların ve iletişim e-postasının bağlantıları. Satıcı: Erkin Azcan (Türkiye), iletişim: erkinazcan@gmail.com. Metinler assets/legal.js içinde.

## 101026-286

- Hesap sayfası (site ve program): abonelik satırındaki "Kendiliğinden yenilenir / Yenilenmeyecek" etiketi artık gösterilen aboneliğin kendi durumuna bakıyor. Eskiden hesaptaki herhangi bir abonelik (ör. eski Lemon aboneliği) yenileniyorsa iptal edilmiş Paddle aboneliği de "yenilenir" görünüyordu.
- Site: ödeme seçeneği yokken hesap sayfasında "soon" yerine "Yakında" yazıyor.

## 101026-285

- Ödemeler Paddle'a taşındı (Lemon Squeezy'nin yerine). PRO abonelik (1 / 3 / 6 / 12 ay), hediye PRO, kuponlar ve reklam ödemeleri Paddle Billing üzerinden alınır; Paddle anahtarları sunucuda tanımlanana kadar eski Lemon yolu çalışmaya devam eder. Var olan Lemon abonelikleri kendi mağazalarında yenilenmeye devam eder.
- Hesap › "Aboneliği yönet": Paddle aboneliğinde Paddle müşteri portalını açar (kart değiştirme, faturalar, iptal).
- Hediye ettiğin Paddle aboneliğini "Sonlandır" ile iptal edebilirsin (alıcının PRO'su ödenen dönemin sonuna kadar sürer).
- Yönetim: gelir / üye / ödeme listelerinde Paddle kaynağı; plan ve reklam açıklamaları Paddle'a göre güncellendi.
- Sunucu: c110_guncelleme.sql, yeni pro-portal fonksiyonu; pro-checkout, ads-checkout, pro-webhook (?source=paddle), gift-cancel ve pitwall-jobs güncellendi. Sitede yeni ödeme sayfası (odeme.html). Kurulum: docs/PRO.md.

## 101026-284

- Kontrol paneli: X'e basınca pencere anında kayboluyor. Eskiden bekleyen ayarlar hesaba gönderilene kadar (en çok 3,5 sn) pencere ekranda kalıyordu; gönderim artık pencere gizlendikten sonra arka planda yapılıyor.
- Canlı sohbet › Sesli okuma: YouTube kanal emojileri / özel görseller için ayrı ayar, "Kanal emojilerini ve özel görselleri oku" (varsayılan kapalı). Eskiden bunlar emote sayılıyor ve yüklenen dosyanın adıyla ("imagein…" gibi) okunuyordu. Açıldığında artık kanalın verdiği ad okunuyor (":_pitStop:" → "pit Stop"), dosya adı okunmuyor. "Emote'ları oku" ayarı yalnızca Twitch / Kick emote'larını kapsıyor.

## 101026-283

- Canlı sohbet › Sesli okuma: kanal emojileri ve gönderilen özel görseller yazı olarak (":_imageinKedi:" gibi kısa kodlarla ya da Kick'te "[emote:…]") gelince kodlarıyla birlikte okunuyordu. Artık okunmuyor. Ayar "Emote ve özel görselleri oku" olarak yeniden adlandırıldı (varsayılan kapalı); açılırsa görselin adı okunur hâle getirilip okunuyor (":_pitStop:" → "pit Stop"). Saat gibi yazılar ("10:30:45") etkilenmiyor.

## 091026-282

- Sıralama Tablosu: yeni "Araç numarası" sütunu, ülke bayrağının solunda (varsayılan kapalı; Sütunlar'dan açılır).
- Düzeltme: canlı yayın bitince program donmuş gibi kalıyordu. Yayın kapanınca Canlı Sohbet overlay'indeki izleyici çubuğu / mesaj kutusu kalkarken, aynı anda imleç onların üstündeyse görünmez tam ekran overlay penceresi tıklanabilir kalıyor ve bütün tıklamaları yutuyordu (oyuna, OBS'e, masaüstüne tıklanamıyordu). Artık bölge kalkınca pencere her zaman yeniden tıklama geçirir oluyor; izleme biterken de bütün overlay pencereleri emniyet için geri alınıyor.
- Düzeltme: Canlı Sohbet hata ayıklama günlüğü 256 KB'ı geçince Türkçe harfte kesilip panic yapabiliyordu; yayın bitiminde sohbet bağlantıları birer birer düşüyordu.
- Canlı Sohbet › izleyici çubuğu: platform simgesinin (ya da Σ toplamın) üstüne gelince o platformdaki canlı kanallar izleyici sayılarıyla listeleniyor; listeden tıklanan kanalın yayın sayfası açılıyor. Simgeye doğrudan tıklamak eskisi gibi en çok izleyicisi olan kanalı açıyor.
- Tekrar izlerken sürücü adına tıklama, Canlı Sohbet'in tıklanabilir bölge düzeneğine taşındı (ayrı düzenek, tarayıcıdaki videoyu karartabilen bir pencere stili değişikliği yapıyordu).

## 091026-281

- Saat › Alarm: alarm artık susturulmazsa 2 dakika çalıyor ("En uzun çalma süresi", varsayılan 120 sn; eski "Uyarı süresi" yerine). Yeni "Herhangi bir tuşla sustur" seçeneği (varsayılan açık): alarm 10 saniye çaldıktan sonra klavyede herhangi bir tuşa basınca susuyor. İlk 10 saniyede basılan tuşlar (ör. sürüş sırasında) alarmı kapatmıyor. Susturulan alarm o gün aynı saatte yeniden çalmıyor; ertesi gün yine çalıyor.

## 091026-280

- Telemetri / profil: iRacing lisans sınıfı ve SR artık gösterilmiyor (iRating zaten kaldırılmıştı). iRacing bu değerleri yalnızca o an sürülen oturumun kategorisi için veriyor (yol, formula, oval, toprak ayrı ayrı); program son girilen oturumun değerini kaydettiği için profilde çoğu zaman başka kategorinin değeri, yani yanlış görünen bir değer çıkıyordu. Ülke bayrağı kalıyor.
- Telemetri: araç sınıfı düzeltmesi. Lig kategorisi ayarlıysa oturumlara iRacing sınıfı yerine lig kategorisi ("Pro", "Am" vb.) yazılıyordu; artık gerçek sınıf yazılıyor. Anlamsız sınıf adları ("Hosted All Cars Class", araç adının kendisi, yalnızca sayı) gösterilmiyor; "GT3 Class" → "GT3". Eski kayıtlarda da aynı süzme uygulanıyor.
- Telemetri: profil fotoğrafı, baş harfler yerine üstteki avatar kutusunda görünüyor.
- Telemetri: istatistik kutuları yeniden düzenlendi. "Sürüş süresi" artık kutuya sığıyor: sayılar büyük, "sa / dk" birimleri küçük yazılıyor; değer kutuya sığmazsa taşmıyor. Kutular biraz genişledi, etiketler gerekirse iki satıra iniyor. "1 sa 60 dk" gibi yuvarlama hatası da düzeltildi.

## 091026-279

Açılış sorunları ("yükledim ama açılmıyor", "Windows ile başlamadı") için düzeltmeler ve tanı araçları:

- Program zaten çalışıyor ama donmuşsa, yeni açılış ona ileti gönderirken sonsuza dek bekliyordu (imleçte dönen mavi çember, pencere yok). Artık bu durum fark ediliyor ve "Donmuş kopya kapatılıp yeniden açılsın mı?" diye soruluyor.
- Kurulum sırasında bir hata olursa (ör. WebView2 açılamadı) program sessizce kapanıyordu. Artık sebep bir pencerede gösteriliyor; WebView2 ile ilgiliyse indirme bağlantısı da veriliyor.
- Kontrol paneli 1 dakika içinde yüklenmezse kullanıcıya sebep ve günlük dosyalarının yeri gösteriliyor.
- Overlay penceresi ya da tepsi simgesi oluşturulamazsa panel yine açılıyor (eskiden tüm program kapanıyordu).
- Olası bir donma giderildi: tepsi menüsü yazıları güncellenirken panel aynı anda dil çevirilerini gönderirse program kilitlenebiliyordu (özellikle iRacing açıkken program başlatılınca).
- Windows ile tepside başladıktan sonra paneli ilk açışta pencere ayrı iş parçacığında kuruluyor (donma riski).
- Açılış günlüğü: her açılışın adımları %APPDATA%\com.pitwall.overlay\boot.log dosyasına yazılıyor (bir öncekisi boot.old.log). Arayüz hataları da buraya düşüyor. "Açılmıyor" bildirimlerinde bu dosya istenebilir.
- Ayarlar okunamasa ya da beklenmeyen biçimde olsa da panel varsayılanlarla açılıyor; bozuk dosya settings.broken.json olarak saklanıyor. Ayarlar gelmeden varsayılanlar diske yazılmıyor.
- Panelde beklenmeyen bir çizim hatası olursa boş pencere yerine hata ve "Yeniden yükle" düğmesi görünüyor.
- Windows ile başlat: kayıt defterindeki program yolu artık tırnak içinde yazılıyor (yolda boşluk var). Windows açılışında programın arka planda çalıştığını söyleyen kısa bir bildirim gösteriliyor; Windows 11 yeni tepsi simgelerini gizli simgelere koyduğu için program açılmamış sanılıyordu. Bilgisayar yeni açıldığında bekleme 75 sn'den 40 sn'ye indi.
- Telemetri aboneliği bir kez hata verirse oturum boyunca "Bağlı değil" kalabiliyordu; düzeltildi.

## 091026-278

- Düzeltme: "Replay'de göster" açık olan overlay (ör. Sıralama Tablosu) iRacing'de araçtan inip tekrar ekranına geçince görünmüyordu. Tekrar ekranı canlı ana yetişmiş olarak açıldığında "replay" sayılmıyor, bu yüzden "Pistte değilken gizle" kuralı overlay'i gizliyordu. Artık tekrar ekranının her hâli (eski bir anı izlerken de, canlıyı izlerken de) replay sayılıyor; garaj / setup ekranı sayılmıyor. Sürücü adına tıklayıp canlı izleme de canlı ana dönünce çalışmaya devam ediyor.

## 091026-277

- Sıralama Tablosu ve Yakındakiler: "Test sürüşünde gizle" yerine "Gösterildiği oturumlar" ayarı. Test sürüşü, antrenman, sıralama turları ve yarış ayrı ayrı seçilebiliyor (varsayılan: test sürüşü hariç hepsi).
- Sıralama Tablosu: yeni varsayılan sütunlar. Son 5 tur ortalaması kapalı, son tur ve en iyi tur açık; en sonda sırasıyla son tur, fark, lastik ve bayrak. Sütunları hiç değiştirmemiş olanlar yeni düzene kendiliğinden geçiyor.
- Sıralama Tablosu: yeni "Bayrak (ceza)" sütunu. Sürücünün aldığı cezanın bayrağı görünüyor: siyah bayrak, diskalifiye, teknik (turuncu toplu) bayrak, uyarı (kıvrık siyah bayrak), mavi bayrak.
- Yakındakiler: yeni "En iyi tur" sütunu (varsayılan açık); sütun sırası Sıralama Tablosu ile aynı (en iyi tur, son tur, fark, lastik, bayrak). Bayrak sütununda uyarı bayrağı da görünüyor.
- Her overlay'in ayarlarında yeni "Replay'de göster" seçeneği (varsayılan kapalı): açık olan overlay, genel "Replay izlerken overlay'leri gizle" ayarı açık olsa bile tekrar izlerken görünür.
- Tekrar izlerken (iRacing) Sıralama Tablosu ya da Yakındakiler'de bir sürücünün adına tıklayınca canlı yayına dönülüyor ve kamera o sürücüye geçiyor. Yalnızca adların üstü tıklanabilir; ekranın geri kalanı oyuna tıklanmaya devam ediyor. Sunucudan çıkmış sürücülerin adı tıklanmıyor.
- Radar › Gerçek konum (iRacing): sizi geçen araç artık önünüze zıplamıyor; geçtiği tarafta kalıp uzaklaştıkça yavaşça şeride dönüyor. iRacing diğer araçların yan konumunu vermediği için yan konum tahmini; ön / arka uzaklık gerçek.

## 091026-276

- Canlı sohbet › Sesli okuma: yeni "Yüz ifadelerini atla" ayarı (varsayılan açık). ":)", ":D", ";)", "<3", "xD" gibi karakterlerle yazılan ifadeler artık okunmuyor; kelimeye bitişik olanlar da ("iyi:)") atlanıyor, saat gibi yazılar ("10:30") okunmaya devam ediyor.

## 091026-275

- Canlı sohbet (YouTube): "YouTube sayfası yüklenemedi (HTTP 429)" hatası. YouTube çok sık sayfa isteğinde geçici sınır koyuyor; canlı yayın ve sohbet artık sayfa yerine YouTube'un hafif veri arayüzünden bulunuyor (sınıra takılmıyor). Sayfaya yine de gerekirse ve sınır varsa sınır bitene kadar (her seferinde artan sürelerle) tekrar istenmiyor; "Yeniden kur" da sınırı uzatmıyor. Hata mesajı ne kadar sonra yeniden deneneceğini gösteriyor.

## 091026-274

- Sıralama / lider tablosu overlay'leri (iRacing): bazı sürücülerin en iyi turu boş görünüyordu. iRacing'in canlı verisi oturuma sonradan girdiğinde ya da bazı araçlar için en iyi turu vermiyor; eksik en iyi ve son turlar artık oturumun resmi sonuçlarından tamamlanıyor. Sonuçlardaki tur daha hızlıysa o gösteriliyor ve pratikte sıralama da buna göre yapılıyor.
- Telemetri › Sıralama: kaza ya da pist dışı olan en hızlı turlar artık listede (⚠ işaretiyle). "Yalnızca temiz turlar" seçeneğiyle eski görünüm. Araç süzgecindeyken başka araçlarla tur atan yarışçı sayısı ve "Tüm araçları göster" bağlantısı gösteriliyor.
- Uygulama açılınca monitörün siyah görünmesi düzeltildi: overlay pencereleri artık içerikleri yüklenmeden gösterilmiyor. Windows ile başlatıldığında bilgisayar yeni açıldıysa ekran kartı sürücüsünün hazır olması için birkaç saniye bekleniyor.
- Telemetri: pistin tamamı ölçülemeyen turlar (sıfırlama, çekici, tur sayacı atlaması) geçersiz sayılıyor; 10 saniyelik gibi hatalı turlar artık sıralamanın başına geçmiyor.

## 081026-273

- Pit Penceresi: Kompakt şerit ve Detaylı kart tasarımlarında yazıların iç içe geçmesi düzeltildi. Sabit genişlikli etiketler kaldırıldı; önündeki / arkandaki araç yön oklarıyla gösteriliyor ve uzun çevirilerde bölümler alt satıra geçiyor. Zaman çizelgesinde numaralar ve "SEN" etiketi artık üst üste binmiyor.
- Pit Penceresi: üç yeni tasarım. Minimal tek satır, Büyük kutular ve Pit penceresi çubuğu (PRO); son ikisinde yakıt penceresi yarışın turları üzerinde çubukla ve bulunduğun turla gösteriliyor.

## 081026-272

- Canlı Sohbet: mesaj kutusuna tıklayınca Chrome'daki yayının kararması için ek düzeltme (overlay penceresi yazarken tarayıcının örtülme hesabının tamamen dışında tutulur).
- Radar: "Gerçek konum" görünümü PRO üyelere özel; varsayılan görünüm şeritler.

## 081026-271

- Canlı Sohbet: oyun üstündeki mesaj kutusuna tıklayınca Chrome / Edge'deki yayının (YouTube vb.) siyah olması için kalıcı düzeltme: overlay penceresi tıklanabilir olurken tarayıcının onu opak sayması engellendi.
- Radar: arkadan / önden gelen araçlar artık ayarladığın görüş mesafesinde gerçek uzaklıklarında görünür (eskiden 25 m'den uzaktakiler hiç çizilmiyordu); varsayılan görüş mesafesi 20 m, en fazla 60 m.
- Radar: yeni "Araç konumu" ayarı (Gerçek konum PRO). Gerçek konum: araçlar sağa / sola ne kadar açık olduklarıyla gösterilir (ACC, LMU / rF2, AMS2; iRacing yanal konum vermediği için orada yan şeride yerleşir). Şeritler: önceki sol / orta / sağ görünümü.
- Radar: araçlar yan değiştirirken ve yaklaşırken yumuşak kayar; yanından çıkan araç bir anda ortaya zıplamaz. "Uzaklığı yaz (m)" ayarıyla mesafe yazısı açılıp kapatılabilir.

## 081026-270

- Canlı Sohbet: oyun üstündeki mesaj kutusuna tıklayınca Chrome / Edge'de açık olan yayının (YouTube vb.) siyah olması düzeltildi.
- Canlı Sohbet: gönderildi görünen bir mesaj 20 saniye içinde sohbette görünmezse mesaj kutusunda uyarı çıkar.

## 081026-269

- Web Görünümü overlay'i: YouTube (video, shorts, canlı yayın, oynatma listesi), Twitch ve Kick adresleri kendiliğinden oynatıcıya çevrilir; video adresini olduğu gibi yapıştırınca artık boş görünmez.

## 081026-268

- Yarış bitince (ya da tekrar izlemeye başlayınca) kendiliğinden açılan Olaylar penceresi, oturumdan çıkınca (quit) kendiliğinden kapanır. Elle açtığın Olaylar penceresine dokunulmaz.

## 081026-267

- Telemetri sayfası yenilendi: üstte sürücü kartı ve özet kutuları, oturumlarda pist ile araç tek sütunda ve oturum türü renkli etiketle; kişisel en iyiler liste ya da kart olarak görüntülenebilir.
- Tur kaydı artık her zaman açık; turların ve izlerin topluluğa açıktır ve sıralamalarda, topluluk kıyaslamalarında kullanılır. Telemetri oturumları silinemez.
- Ayarlar › Genel'e "Mesaj bildirimi" bölümü eklendi: arkadaş mesajı sesini ve ses düzeyini buradan seçebilirsin (varsayılan ses değişmedi).
- Ctrl + Shift + Boşluk: kontrol paneli öndeyken tekrar basınca pencere simge durumuna küçülür.
- Canlı Sohbet mesaj kutusu: soldaki kanal adına tıklayarak da kanal değiştirebilirsin (sağ tık: önceki, tekerlek de çalışır). Yalnızca şu an canlı yayında olan kanallar listelenir.
- Canlı Sohbet izleyici çubuğu: bir platformun izleyici sayısına tıklayınca o platformdaki canlı kanalın sayfası açılır (Σ: en çok izlenen canlı kanal).
- "Windows ile başlat" güncellemelerden sonra kendiliğinden kapanıyordu; düzeltildi. Varsayılan olarak açıktır; Ayarlar › Genel'den kapatırsan sonraki sürümlerde de kapalı kalır.

## 081026-266

- Telemetri artık herkese açık: tur kayıtların, kişisel en iyilerin ve tur izlerin tüm üyelere ve Yarışçılar sayfasına açıktır; sıralamalarda ve topluluk kıyaslamalarında kullanılır. "Telemetri verilerimi başkaları görebilsin" seçeneği kaldırıldı. Kaydedilmesini istemiyorsan Telemetri › Ayarlar'daki "Turlarımı kaydet" anahtarını kapatabilir, istediğin oturumu silebilirsin.

## 081026-265

- Yeni overlay (PRO): Canlı Kıyas. Sürerken gaz ve frenini topluluğun en iyi turuyla, topluluk ortalamasıyla ya da kendi rekorunla canlı karşılaştırır; tur içi farkı, hız farkını ve bölüm bölüm kazanç / kaybı gösterir. Yeterli tur yoksa "Yeterli veri yok" yazar.
- Telemetri › Tur analizi (PRO): pist haritası. Seçtiğin referansa göre (bu oturumun en iyisi, kendi rekorun, topluluğun en iyi turu, topluluk ortalaması ya da karşılaştırdığın tur) zaman kazandığın yerler yeşil, kaybettiğin yerler kırmızı görünür; hız farkı ve sektör görünümleri de var. "Farkları haritada göster" ile viraj viraj fark süreleri haritaya yazılır.
- Telemetri › Tur analizi (PRO): "Toplulukla kıyasla" düğmesi, topluluğun en hızlı turunu tek tıkla karşılaştırmaya ekler.
- Telemetri sayfasının görünümü düzenlendi (tur kartları, tablolar, grafikler).
- Referans turlar bir kez indirilip bilgisayarında saklanır; aynı pist ve araç için sunucuya en fazla 12 saatte bir gidilir.

## 081026-264

- Fren ve Vites İşareti:
  - Yeni ayar "Fren noktaları neye göre": tüm zamanlardaki kendi rekorun, bu oturumdaki en iyi turun ya da topluluk telemetrisindeki rekor tur.
  - Üç yeni tabela tasarımı: Neon tabela, Uyarı şeridi ve İkaz üçgeni.
  - "Büyük minimal işaret" ve "Dikey çubuk" tasarımları kaldırıldı.
  - Mesafe levhalarında son kutu "GAZ KES" yazısı sığacak şekilde büyütüldü.
  - Arka plan opaklığı düşürülünce içteki kutuların arka planı da şeffaflaşıyor.
- Tamamı PRO olan overlay'lerde tasarım seçeneklerinin yanında artık ayrıca "PRO" yazmıyor.

## 081026-263

- Yakıt Hesaplayıcı'da "Her zaman göster" işareti tüm düzenlerde bir kereliğine kaldırıldı. İstersen overlay ayarından yeniden açabilirsin.

## 071026-262

- Overlay listelerindeki "Kategori" menüsüne "PRO olanlar" ve "PRO olmayanlar" seçenekleri eklendi.

## 071026-261

- Şu overlay'ler artık PRO: G-Force, Düz Harita, Direksiyon Ekranı, Mini Harita, Telemetri Paneli ve Kalp Atışı.
- Hız Göstergesi: LCD ekran, klasik kadran ve yarım kadran tasarımları PRO oldu; varsayılan tasarım "modern yay".
- Pist Limiti: Şerit tasarımı kaldırıldı; üç yeni tasarım eklendi (Bayrak şeridi, Işık, Küçük etiket). Tüm tasarımlar herkese açık.

## 071026-260

- Fren ve Vites İşareti'ne üç yeni tasarım: Parlayan FREN tabelası (yaklaştıkça dolar, fren noktasında kırmızı parlayıp yanıp söner), Mesafe levhaları (PRO) ve Geri sayım halkası (PRO).

## 071026-259

- Düzenler ve Yayın sayfalarındaki overlay listesinde kategori başlıklarına tıklayıp kategoriyi kapatabilirsin. Overlaylarım sayfasıyla ortaktır: birinde kapattığın kategori diğerinde de kapalı görünür ve program yeniden açıldığında öyle kalır.
- Overlay aramanın altına "Kategori" menüsü eklendi (Overlaylarım, Düzenler ve Yayın sayfaları): bir kategori seçince yalnızca o kategorideki overlay'ler listelenir.

## 071026-258

- Yeni overlay: Setup Karşılaştırma. Garajda yüklediğin her setup ile attığın en iyi turu, sektörleri, teorik en iyiyi, ortalamayı ve tur sayısını tutar; setup'ları yan yana koyup hangisiyle daha hızlı olduğunu gösterir. 2 ile 6 arası setup karşılaştırılabilir; yalnızca bu oturum ya da aynı pist ve araçtaki tüm kayıtlar seçilebilir. iRacing'de çalışır.

## 071026-257

- Sıralama Tablosu ve Yakındakiler artık test sürüşünde (iRacing Test Drive) gizleniyor. Overlay ayarlarındaki "Test sürüşünde gizle" seçeneğiyle kapatılabilir.

## 071026-256

- Takım sohbetindeki anket özelliği kaldırıldı.

## 071026-255

- Küçük iyileştirmeler ve düzeltmeler.

## 071026-254

- Sohbet grupları: son mesajın üstünden 24 saat geçen grup, mesajlarıyla birlikte kendiliğinden silinir. Eskiden yalnızca hiç mesaj yazılmamış gruplar siliniyordu.

## 071026-253

- Ülke bayrakları: ülke seçmemiş ya da ülkesi tanınmayan sürücülerde bayrak yerine küre simgesi görünür.

## 071026-252

- Ülke bayrakları: iRacing'in gönderdiği ülke adları (ör. "Türkiye") doğru okunuyor; ülke seçmemiş sürücüde hücre boş kalıyor. Not: Test Sürüşü gibi çevrimdışı oturumlarda iRacing ülke bilgisi göndermediği için bayrak görünmez; çevrimiçi oturumlarda görünür.
- Aksanlı harf içeren sürücü ve takım adları (ü, é, ñ…) artık bozulmadan görünüyor.

## 071026-251

- Ülke bayrakları: iRacing'in gönderdiği ülke bilgisi için ek okuma yolu ve sorun teşhisi için günlük kaydı eklendi.

## 071026-250

- Küçük iyileştirmeler ve düzeltmeler.

## 071026-249

- Sıralama Tablosu ve Yakındakiler'de ülke bayrakları artık gerçek iRacing yarışlarında da görünüyor. iRacing ülkeyi kısa kodla değil adıyla gönderiyor; uygulama yalnızca kısa kodu okuduğu için bayraklar yalnızca Demo modunda çıkıyordu.

## 071026-248

- Sıralama Tablosu ve Yakındakiler: ülke bayrağı sütunu bütün düzenlerde bir kereliğine yeniden açıldı (bazı düzenlerde kapalı kalmıştı). İstemezsen overlay ayarlarındaki sütun listesinden "Ülke"yi kapatabilirsin.

## 071026-247

- Sıralama Tablosu ve Yakındakiler: ülke bayrağı, iRacing ülkenin kısa kodunu göndermediğinde ülke adından da bulunur.
- Canlı sohbet yazma kutusu: Enter ile gönderdikten sonra imleç kutuda kalır, tıklamadan art arda mesaj yazabilirsin. Oyuna dönmek için Esc'e bas ya da kutunun dışına tıkla.

## 071026-246

- OBS'e birden fazla tarayıcı kaynağı (iki yayın düzeni, sohbet, anket, altyazı…) eklenince bazı kaynakların takılması düzeltildi: görseller yüklenmiyor, overlay'ler görünmüyor ya da Setup Örtüsü ekrandan gitmiyordu. Tarayıcılar aynı adrese sınırlı sayıda bağlantı açtığı için kaynaklar birbirini tıkıyordu; veri akışı artık ek portlara (8911–8922) dağıtılıyor.
- Setup Örtüsü'nün hazır görseli uygulamanın içine gömüldü (ayrı dosya olarak yüklenmez).

## 071026-245

- Hız Göstergesi: "Dijital: LCD ekran" tasarımında sayı artık kutunun ortasında.
- OBS'teki eski yayın adresi (…?layout=stream-default) yeniden eski "Varsayılan" yayın düzenini gösteriyor; adresi değiştirmeyenlerde başka bir yayın düzeni görünebiliyordu.

## 071026-244

- Sesli Mühendis overlay'i artık Demo modunda da görünüyor: kimse konuşmuyorken örnek bir cümle gösterir, böylece yerini ve görünümünü ayarlayabilirsin. Gerçek yarışta yine yalnızca mühendis ya da spotter konuşurken görünür.

## 071026-243

- Düzen listesindeki sıra artık üst üste binme sırasını da belirliyor: soldaki "Düzende" listesinde üstte duran overlay, ekranda, OBS'te ve düzenleme tuvalinde diğerlerinin üstünde görünür. Sırayı listede sürükleyerek değiştirebilirsin.

## 071026-242

- Kör Nokta Uyarısı: "Çerçeveli üçgen ve ünlem" tasarımı eklendi (PRO).

## 071026-241

- Kör Nokta Uyarısı: PRO üyeler için altı yeni tasarım (uyarı üçgeni, ok üçgeni, üçlü ok, halka nokta, yayılan nokta, elmas). Ayrıca yan yanayken farklı bir renk seçilebilir.

## 071026-240

- SRTR Pitwall artık varsayılan olarak Windows açılışında (sistem tepsisinde) başlar. İstemezsen Ayarlar › Genel'deki "Windows ile başlat" seçeneğinden kapatabilirsin; kapattıktan sonra kapalı kalır.

## 071026-239

- Küçük iyileştirmeler ve düzeltmeler.

## 071026-238

- Yeni overlay: Kör Nokta Uyarısı. Gerçek arabaların aynalarındaki kör nokta ışığı gibi, arkadan bir araç ayarladığın mesafeye girince ya da yanına gelince solda / sağda ışık yanar. En uzak ve en yakın mesafe, tasarım (ayna camı, simge, LED nokta, ışık şeridi), renk ve ışıklar arası mesafe ayarlanabilir. iRacing yaklaşan aracın tarafını ancak yanına geldiğinde bildirdiği için o ana kadar iki ışık birden soluk yanar (kapatılabilir).

## 071026-237

- Küçük iyileştirmeler ve düzeltmeler.

## 071026-236

- Hesap eşitlemesi artık "bu bilgisayardakini mi, hesaptakini mi kullanayım" diye sormuyor: en son değiştirilen ayarlar geçerli olur. Eski sürümler Hesap sayfasındaki ayar geçmişinde durur.
- Ayar değişiklikleri hesaba 30 dakika sonra toplu yazılır; uygulama kapatılırken ya da çıkış yapılırken bekleyen değişiklik hemen yazılır. Bilgisayar uygulama açıkken kapatılırsa yazılamayan değişiklik kaybolmaz: uygulama bir sonraki açılışta hesaba gönderir. Ayarlar bu bilgisayara her zamanki gibi anında kaydedilir.

## 071026-235

- Yayın düzenleri: "varsayılan yayın düzeni" kalktı. Her yayın düzeninin kendine özel OBS adresi var; hepsi silinebilir ve uygulama kendiliğinden yenisini oluşturmaz.
- Yayın düzeninin OBS adresi artık sabit: bir kez oluşunca değişmez ve başka bir bilgisayarda hesabına girdiğinde de aynıdır. Ağ erişimi açıksa ikinci bilgisayar için ağ adresi ayrıca gösterilir.
- Dikkat: eski "Varsayılan" yayın düzeninin adresi (…?layout=stream-default) değişti. OBS'te bu adresi kullanıyorsan Yayın sayfasından yeni adresi kopyalayıp tarayıcı kaynağına yapıştır.

## 071026-234

- Arka plan opaklığı %0 yapılan overlay'lerde çerçeve izi kalmıyor: kendi kenarlığını ve gölgesini çizen overlay'lerde de (Kan Şekeri, Kalp Atışı, Girdiler'in sim tasarımı vb.) dış çerçeve, gölge ve bulanıklık tamamen kalkar. Uyarı anındaki yanıp sönen çerçeve (ör. Kan Şekeri alarmı) görünmeye devam eder.

## 071026-233

- Setup Örtüsü kilitlenince düzenleme ekranlarında neredeyse saydam olur ve tıklamaları geçirir: arkasındaki overlay'ler rahatça seçilip taşınır. Kilit, ekranda örtünün sol üstündeki kilit düğmesinden ya da düzen listesinde sağ tıkla açılır.
- Setup Örtüsü artık bir düzene yalnızca bir kez eklenebilir; sağ tık menüsündeki "Aynısından ekle" yalnızca birden çok eklenebilen overlay'lerde görünür.

## 071026-232

- Setup Örtüsü: garaj / setup ekranı açılınca uygulama izleme düzenine geçtiği için sürüş düzenindeki örtü kayboluyordu. Garaj ekranı açıkken artık sürüş düzeni kalır ve örtü görünür. Örtü Garage düğmesine basıldığı anda gelir (eskiden yarım saniyeye kadar gecikebiliyordu).

## 071026-231

- Ekran Görüntüleri sayfasındaki filigran önizlemesinin görseli yenilendi.

## 071026-230

- Yeni overlay: Saat. Bilgisayarının saatini dijital kutu, ince şerit, yalnızca yazı ya da analog kadran olarak gösterir. Üç alarm ve tekrarlayan hatırlatma kurulabilir; vakti gelince seçtiğin sesle (bip, çift bip, siren, yumuşak) ve yanıp sönerek uyarır. "Yalnızca alarm çalarken" ya da "alarma az kala" görünme seçenekleri vardır.
- Yeni overlay: Vites. Yalnızca takılı vitesi gösterir; vites değiştirme devrinde renk değiştirir ya da yanıp söner. Kutu ve yalnızca rakam tasarımları ücretsiz; devir halkası, vites LED'leri, neon ve altıgen tasarımları PRO.
- Yeni overlay: Hız Göstergesi. Üç dijital (büyük sayı, sayı ve çubuk, LCD) ve üç analog (klasik kadran, modern yay, yarım kadran) tasarım. En yüksek hız, kırmızı bölge, çizgiler, kalınlık ve renkler ayarlanabilir.
- Arkadaş ve mesaj bildirim sesi artık seçilebilir: Yumuşak, Çan dizisi, Tık, Zil, Damla ve Klasik. Ses düzeyi de ayarlanır. Varsayılan artık daha pes ve sönerek biten "Yumuşak" ses. Ayar, Arkadaşlar panelindeki durum menüsünde (Çevrimiçi / Rahatsız Etme) "Bildirim sesi" başlığı altındadır.

## 071026-229

- Sıralama Tablosu ve Relative: "Sürücü satırlarının arka planı" ayarı eklendi. Arka plan şeffafken yalnızca sürücülerin olduğu satırlar koyulaştırılabilir; kaç sürücü varsa o kadar satır dolar, tablonun geri kalanı şeffaf kalır.

## 071026-228

- Topluluk: düzen paylaşırken "Arka plan görselimi de ekle" seçeneği geldi. Düzene bakanlar önizlemeyi o arka planla görür, indirenlerde düzen aynı arka planla gelir.
- Topluluk: paylaşılan düzenin önizlemesine "Demo" düğmesi eklendi. Basınca düzen örnek yarış verisiyle canlı oynar; overlay'ler gerçek yarıştaki gibi görünür, gizlenir ve değişir.

## 071026-227

- Olay Sayacı: dört görünüm (Kutular, Tek satır, Halka, Bölmeli çubuk) ve özelleştirme eklendi. Genişlik, çubuk kalınlığı, köşe yuvarlaklığı, sarı/kırmızı eşikleri, kırmızıdayken yanıp sönme, kalan hakkı gösterme ve özel renkler (güvenli/uyarı/tehlike, arka plan, yazı, kenarlık) ayarlanabilir.

## 071026-226

- Düzenler ve Yayın düzenleme ekranlarındaki overlay listesine arama çubuğu eklendi: yazdıkça hem düzendeki hem eklenebilir overlay'ler ada göre süzülür.

## 071026-225

- Setup Örtüsü: Tasarım seçeneği artık herkese görünür. Yayın logosu izni olmayanlar yalnızca "Görsel tüm alanı kaplar" tasarımını kullanabilir; diğer tasarımlar ve kendi görselini ekleme izinli PRO üyelere açıktır.

## 061026-224

- "iRacing kapalıyken de göster" seçeneğinin adı "Her zaman göster" oldu ve artık adının hakkını veriyor: işaretli overlay'ler oyun kapalıyken ve pist dışında olduğu gibi tekrar izlerken ve garaj ekranında da görünür kalır (ekranda ve OBS'te). Eskiden "tekrar izlerken gizle" kuralı bu overlay'leri de gizliyordu; iRacing garaj ekranını ve araç dışı görünümü tekrar saydığı için orada kayboluyorlardı.
- Kan Şekeri ve Kalp Atışı overlay'lerinde "Her zaman göster" bir kereliğine açıldı (sonradan kapatılabilir).

## 061026-223

- Veri Kutusu özelleştirme: 8 şekil (yuvarlak köşeli, köşeli, hap, daire, kesik köşeli, eğik, alt çizgili, yalnızca yazı), vurgu şeridi (sol / sağ / üst / alt), iç boşluk, başlığın yeri (üstte / altta / solda tek satır), hizalama, başlık boyutu, özel başlık ve birimi gizleme.
- Veri Kutusu renkleri: "Özel renkler" ile arka plan rengi ve opaklığı, değer rengi, başlık / birim rengi, vurgu rengi, kenarlık rengi ve kalınlığı; "Yazı parlaması" ve "Değere göre renk" (delta yeşil / kırmızı) seçenekleri. Özel renkler kapalıyken tema renkleri kullanılır; mevcut kutuların görünümü değişmez.
- Düzeltme (Setup Örtüsü): örtü, overlay penceresinin ve OBS sayfasının genel gizleme kurallarına takılıyordu (özellikle "tekrar izlerken gizle": iRacing'de garaj ekranı açıkken sim tekrar oynatılıyor bildirir). Artık bu kurallar örtüye uygulanmaz; ne zaman görüneceğine yalnızca kendi "Ne zaman görünsün" ayarı karar verir. "Her zaman" seçeneği sim kapalıyken de örter.

## 061026-222

- Pedallar & Girdi: "Genişlik" artık gerçek genişlik (260–1200 px; eskiden "en az genişlik"ti ve 430'un altına inmiyordu) ve yeni "Yükseklik" ayarı (76–260 px). İz grafiği ve çubuklar alanı doldurur, vites / hız / direksiyon yükseklikle birlikte ölçeklenir. Düzenleme ekranında sağ / sol kenardan genişlik, üst / alt kenardan yükseklik sürüklenerek ayarlanır. Dört tasarımda da geçerli.
- Düzeltme: Overlay'ler, Düzenler ve Yayın sayfalarındaki overlay listesi ara sıra kendiliğinden en üste kayıyordu (liste her yeniden hesaplandığında baştan kuruluyordu); artık kaydırma konumu korunur.
- Yayın sayfası: son seçtiğin yayın düzeni hatırlanır; başka bir sayfaya gidip dönünce (ve uygulamayı yeniden açınca) en üstteki değil, üzerinde çalıştığın düzen seçili gelir.

## 061026-221

- Ödeme penceresi (program + site): bildirim formu artık isteğe bağlı bir "Satın alım yaptım" düğmesinin arkasında; düğmeye basınca kullanıcı adı / e-posta ve ödeme bilgisi alanları açılır. Kendi ödeme bağlantılarında "PRO üyeliğin, ödemen kontrol edildikten sonra gün içinde tanımlanır." yazar; ByNoGame bağlantılarında ayrıca teslimatı onaylama hatırlatması görünür.

## 061026-220

- Küçük iyileştirmeler ve düzeltmeler.

## 061026-219

- Uygulama kapanırken düzenler hesaba gönderilir: kontrol paneli kapatılırken ve tepsi menüsünden "Çıkış" denirken bekleyen ayar değişikliği önce buluta yazılır, sonra pencere / uygulama kapanır (en çok ~4 sn bekler). Eskiden son değişiklikler, istek yarıda kaldığı için hesaba hiç gitmeyebiliyordu.
- Hesaptan çıkış yaparken de bekleyen değişiklik önce gönderilir.
- Değişiklikler artık son değişiklikten 8 sn sonra, en geç 1 dakikada bir gönderilir; gönderim başarısız olursa (ağ / sunucu) kaybolmaz, 30 sn sonra yeniden denenir.
- "Hangi ayarlar kullanılsın?" sorusu artık her sayfada pencere olarak çıkar (karar verilene kadar ayarlar hesaba gönderilmediği için gözden kaçmamalı).

## 061026-218

- ÖNEMLİ düzeltme (ayarların kaybolması): ayar dosyası silindiğinde / yeni kurulumda (AppData temizlenmiş, ama oturum tarayıcı deposunda duruyor) uygulama varsayılan ayarları "daha yeni" sayıp hesaptaki kaydın üzerine yazıyordu; düzenler bulutta da siliniyordu. Artık ayar dosyası yoksa bu ilk eşitleme sayılır ve hesaptaki kayıt geri gelir; boş ayarlar buluta yazılmaz. Son eşitleme anı ayar dosyasının içinde tutulur (syncedAt).
- Hesaba girmeden yapılmış ve hesaptakinden yeni ayarlar varsa sessizce ezilmez; "Hangi ayarlar kullanılsın?" diye sorulur.
- Ayarların önceki sürümleri (c98, veritabanına uygulandı): hesaptaki ayar kaydı değişirken eski hali sunucuda saklanır (6 saatte bir; içerik belirgin küçülüyorsa 10 dakikada bir; son 8 sürüm). Hesap › "Ayarların önceki sürümleri" listesinden geri yüklenir. Aynı yerde, varsa bu bilgisayardaki giriş öncesi yedek de geri yüklenebilir.
- Ayar değişiklikleri buluta 60 sn yerine 20 sn sessizlikten sonra gönderilir (uygulama hemen kapatılırsa kaybolma olasılığı azalır).
- Birden çok bilgisayar: düzen listesi hesapta ortaktır, ama hangi düzenin etkin / varsayılan olduğu artık bilgisayara özeldir (hesap kaydında bilgisayar başına tutulur). Hesabı zaten kullanan başka bilgisayar varken yeni bir bilgisayara kurulup giriş yapıldığında eski düzenlere dokunulmaz; o bilgisayar için "Varsayılan (bilgisayar adı)" adlı yeni bir varsayılan düzen oluşturulur ve etkin yapılır. Aynı bilgisayara yeniden kurulumda o bilgisayarın eski etkin / varsayılan düzeni geri gelir.

## 061026-217

- Sabit Patreon kategorisi: Patreon artık ödeme kategorileri arasında yerleşik bir kategori. Başlığı ve açıklaması sabittir ve arayüzün / sitenin diline göre kendiliğinden çevrilir (14 dil); kart başlığı "1 aylık". Yönetim › Planlar'daki "Patreon" anahtarıyla kapatılır. Logo, ödeme yöntemi görselleri, Türkiye / yurt dışı fiyatı ve adresi aynı kutudan girilir; adres girilmezse eski Patreon bağlantıları kullanılır. "Kendi Patreon kategorimden aktar" düğmesi elle eklenmiş Patreon kategorisindeki logo, görseller, fiyat ve adresleri buraya taşır ve o kategoriyi siler (Kaydet'e basınca uygulanır).
- Eski "Patreon" düğmesi (program) ve sitedeki ayrı "Patreon ile destekle" kartı kaldırıldı; Patreon yalnızca kategori olarak görünür.
- Yönetim › Üyeler: üstte sayılar (kayıtlı üye, PRO, deneme, PRO değil, çevrimiçi, yarışta).
- Setup Örtüsü: varsayılan boyut 1024×768 (yeni eklenen örtüler için; varsayılan görünme koşulu "Garaj / setup ekranı açıkken").

## 061026-216

- Ödeme bağlantılarında Türkiye ve yurt dışı için ayrı adres ve fiyat: Yönetim › Planlar'da her bağlantıda iki satır (Türkiye / Yurt dışı). Türkiye'den bağlananlar Türkiye adresini ve fiyatını, diğerleri yurt dışı adresini ve fiyatını görür; adresi girilmemiş bölgede kart hiç çıkmaz (program + site). Bağlantıdaki "Yalnızca Türkiye" kutusu kalktı; eski kayıtlar kendiliğinden çevrilir (yalnızca Türkiye olanların yurt dışı adresi boş, diğerlerinde aynı adres iki bölgede).
- Düzen tuvali: yakınlaştırılmış tuvalde boş yere basıp sürükleyerek gezinilir (Space gerekmez; Space + sürükle de çalışmaya devam eder). Yakınlaştırılmışken seçim kutusu için Shift / Ctrl basılı tutulur; tuval ekrana sığıyorken boş yerden sürüklemek eskisi gibi seçim kutusu çizer.
- Düzenler ve Yayın sayfaları: geniş pencerede ayar paneli kapalıyken yeri boş ayrılmıyor; tuval soldaki overlay listesine yanaşır ve ortalanmaz, ayarlar açılınca sağa kayar.
- Setup Örtüsü: yeni varsayılan "Garaj / setup ekranı açıkken". iRacing garaj ekranının açık olduğunu bildirdiği için (IsGarageVisible) örtü yalnızca o ekran açıkken gelir; bunu bildirmeyen simlerde pistte değilken örter.
- Tema arka planını kullanmayan overlay'lerde (Setup Örtüsü, Sahne, Dijital Bayraklar, Spotter Çubuğu, Webview, Altyazı, Canlı Anket) işe yaramayan genel "Arka plan opaklığı" kaydırıcısı artık gösterilmiyor.
- Setup Örtüsü: tasarım, görsel, yazı ve renk ayarları yalnızca yayın logosu izni olanlara (ücretli PRO / yönetici) gösterilir; diğerlerinde bu düğmeler ayar panelinde hiç çıkmaz.

## 061026-215

- Elle verilen PRO'da "ödenen tutar" yerine kutucuk (c97, veritabanına uygulandı): Yönetim › Üyeler › PRO düzenleme penceresinde "Yayın logosuna müdahale edebilsin". İşaretliyken verilen sürenin sonuna kadar üye logoyu kaldırabilir / taşıyabilir ve Setup Örtüsü'nü özelleştirebilir; işaretsizken bu haklar kapanır. Kutu üyenin o anki izniyle açılır; her süre eklemede kutunun durumu uygulanır. Tutar alanı ve elle ödeme kaydı kaldırıldı.
- Ödeme bildirimleri listesinde "Tutar" kutusu yerine "Logo izni" kutusu (varsayılan işaretli).

## 061026-214

- Sıralama tablosu › Sütunlar: "Tüm araçlar aynıysa araç sütununu gizle" (varsayılan açık). Tek marka serilerde (ör. Porsche Cup) oturumdaki tüm araçlar aynıysa logo / araç adı sütunu kendiliğinden kalkar; farklı araç gelince geri döner. Aynı seçenek Relative ve Yakın Takip'e de eklendi.
- "Her sürücünün çevresinde çerçeve" seçeneği: Sıralama ve Relative'de varsayılan kapalı; Yakın Takip'te satırlar zaten çerçeveli olduğundan varsayılan açık (kapatılabilir; arka plan opaklığı %0 iken kendiliğinden kalkar).
- "Sürücü listesinin çevresinde çerçeve" seçeneği Relative ve Yakın Takip'e de eklendi.

## 061026-213

- Sıralama tablosu: arka plan tümüyle şeffafken (Satır arka planı %0, kopyanın arka plan opaklığı 0 ya da temada arka plan %0) dış çerçeve, satır ayırıcı çizgileri ve şerit zeminleri de çizilmez. Ayırıcı çizgilerin kalkması arka planı %0 olan diğer overlay'lerde de geçerli.
- Sıralama tablosu › Görünüm: "Sürücü listesinin çevresinde çerçeve" (varsayılan kapalı): listede kaç sürücü varsa onları saran ince çerçeve; çok sınıflıda her sınıf için ayrı.

## 061026-212

- Elle verilen PRO'da ödenen tutar (c96, veritabanına uygulandı): Yönetim › Üyeler › PRO düzenleme penceresinde "Ödenen tutar" alanı ve para birimi. Tutar > 0 ise o sürenin sonuna kadar üye "ücretli" sayılır (yayın logosunu kaldırabilir, Setup Örtüsü'nü özelleştirebilir) ve ödeme kaydı düşer (kaynak: Elle ödeme). 0 / boşsa süre ücretsizdir ve bu hakları vermez; daha önce ödenmiş kapsam varsa kendi bitişine kadar sürer. Sonradan tutar girilerek süre eklenirse haklar yeni bitişe kadar açılır. PRO kaldırılınca ücretli kapsam da biter.
- Ödeme bildirimleri listesinde her bildirim için "Tutar (TL)" kutusu: +1 / +3 / +6 / +12 ay düğmeleri bu tutarla birlikte tanımlar.
- Setup Örtüsü: tasarımı ve görseli değiştirmek yalnızca ücretli PRO üyelere (ve yöneticilere) açık; diğerlerinde her zaman SRTR Pitwall görseli gösterilir.

## 061026-211

- Yeni overlay: Setup Örtüsü (yayın). Garajda / pistte değilken yayındaki setup ekranının üstünü tam opak bir perdeyle örter, piste çıkınca kalkar. Varsayılan tasarım SRTR Pitwall görselidir (pitwall.simracetr.com adresiyle, ortalanmış, kırpılmadan; boşluklar görselin bulanık haliyle dolar). "Ortada logo ve yazı" tasarımı, kendi görselini yükleme, boyut, çerçeve, renkler ve "ne zaman görünsün" (pistte değilken / yalnızca garajda / her zaman) ayarları var. Düzenleme, önizleme ve demoda hep görünür. Tekrar izlerken ve izleyici / spotter iken örtmez.
- Web sitesi: overlay listesi, özellikler, galeri görseli ve yönetim listesine eklendi (13 dil).

## 061026-210

- Sesli mühendis PRO'ya ayrılmışsa ve kullanıcı PRO değilse demoda da ses çalınmaz ("Demoda ses" açık olsa bile yalnızca sessiz altyazı benzetimi). PRO üyede demo, sesli mühendis anahtarı kapalı olsa da konuşur.

## 061026-209

- Kategori başına ödeme yöntemi görselleri: Yönetim › Planlar'da her kategorinin açıklamasının altına görsel eklenir (Visa, Mastercard…); program ve sitede kategori açıklamasının altında şerit olarak görünür. En alttaki genel şerit de duruyor.
- Kategori logosu büyütüldü (program 220×76, site 260×92); yükleme sınırı 440×140.
- Aylık karşılık artık fiyat alanına yazılan para birimini aynen kullanır: tutarın önündeki / arkasındaki metin (₺, TL, $, €, USD…) "ayda …" satırında da görünür; binlik ayraçlı yazım (1.250 TL, 1,250.00 $) doğru hesaplanır.
- Düzeltme: demoda ses açıkken sesli mühendis anahtarı kapalıysa (ya da PRO'ya ayrılmışsa) hiç ses çıkmıyordu; demo artık bu anahtara bakmadan konuşur.
- Gizleme anahtarının adı "Lemon Squeezy ödemeleri (otomatik planlar)" oldu: kapalıyken 1 / 3 / 6 / 12 aylık mağaza düğmeleri, kupon kutusu ve hediye PRO'nun mağaza düğmeleri programda ve sitede görünmez.

## 061026-208

- Ödeme bölümü yeniden tasarlandı: kendi bağlantıların artık kategoriler altında, otomatik planlar gibi kart olarak görünür (başlık / süre, fiyat, "ayda …" karşılığı, "Öde" düğmesi; "Bununla öde" → "Öde"). Kategorinin logosu, başlığı ve genel açıklaması kartların üstünde durur. Program (Hesap › PRO) ve web sitesi (ana sayfa fiyatlar, hesap sayfası) aynı kaydı kullanır.
- Yönetim › Planlar › Ödeme yöntemleri: kategori ekleme / sıralama / gizleme / yalnızca Türkiye, kategori logosu ve genel açıklaması; bağlantıda fiyat, süre (1 / 3 / 6 / 12 ay; 1 aydan uzunsa aylık karşılığı kendiliğinden yazılır), etiket (Popüler / En avantajlı) ve kategori seçimi. Gizlenen kategori içindeki bağlantılarla birlikte programda ve sitede kaybolur. Eski bağlantılar "Kategorisiz" grubunda durur.
- Ödeme yöntemi görselleri (Visa, Mastercard…): yönetimden yüklenir, ödeme bölümünün altında şerit olarak görünür. Yüklenen görseller en çok 320×96'ya küçültülüp ayar kaydına gömülür.
- "İndirim kuponu kutusu" gizleme anahtarı (program + site).
- "Abonelik kendiliğinden yenilenir…" metni programdan kaldırıldı; sitede yalnızca otomatik planlar açıkken görünür.
- Hediye PRO: alıcı seçildikten sonra etkin kategoriler ve kartları da görünür ("Hediye et"); pencerede alıcı yazılır, bildirim formu her zaman açıktır ve alıcının adı bildirime eklenir. Otomatik planlar kapalıyken de hediye bölümü kullanılabilir.
- Web sitesinde bağlantı ayrıntıları artık açılır pencerede (dialog) gösterilir.
- Veritabanı değişikliği yok (c95 hâlâ uygulanmayı bekliyor).

## 061026-207

- Ko-fi kaldırıldı: Hesap sayfası, Yönetim (bağlantı alanları, gizleme anahtarı, metinler) ve web sitesinde (ana sayfa "Patreon ile destekle", hesap sayfası, yönetim paneli) Ko-fi düğmesi / alanı / adı artık yok. Eski ödeme kayıtlarındaki "Ko-fi" kaynak etiketi geçmiş kayıtlar için duruyor.
- Ödeme bildirimi: "Ödeme bilgilerin" adlı 5 satırlık, 1000 karakterlik yazma alanı (uygulama penceresi + web sitesi kartı). Yönetimdeki bildirim listesinde bu metin ayrı satırda, satır sonlarıyla gösterilir.
- "Ödedim, bildir" formu artık bağlantı başına isteğe bağlı ve varsayılan kapalı: Yönetim › Planlar › Kendi ödeme bağlantıların satırında "Ödedim, bildir" formu kutusu. Kapalıyken pencere yalnızca açıklamayı ve "Ödeme sayfasını aç" düğmesini gösterir.
- Düzeltme: Yönetimde kendi bağlantılarının başlık / adres / açıklama kutularına yazarken her harfte odak kayboluyordu (satırlar her tuşta yeniden oluşturuluyordu; For yerine Index).
- c95 (veritabanı, henüz uygulanmadı): pay_claim_send notu 1000 karaktere çıkarır ve bildirimi gönderen yönetici de olsa tüm yöneticilere iletir.

## 061026-206

- Kendi ödeme bağlantıları için "ödedim" bildirimi (c94): Hesap sayfasında bağlantının "Bununla öde" düğmesi bir pencere açar: açıklama, "Ödeme sayfasını aç" düğmesi ve kullanıcı adı / e-posta + isteğe bağlı not alanı. "Ödedim, bildir" denince yöneticilere uygulama içi bildirim gider. Web sitesinde aynı akış bağlantı kartının içinde açılır.
- Yönetim › Planlar › Ödeme bildirimleri: gelen bildirimler üye adı, e-postası, yazdığı bilgi ve PRO durumuyla listelenir; +1 / +3 / +6 / +12 ay düğmeleri PRO'yu kalan sürenin üstüne tanımlar ve bildirimi tamamlandı işaretler.

## 061026-205

- Overlay'ler sürüş başlayınca görünür: "Pistte değilken gizle" (Ayarlar › Genel) artık varsayılan olarak açık ve mevcut kurulumlarda da bir kez açılır. Sunucuya bağlanınca, garajda, menüde ve tekrar izlerken overlay'ler gizli kalır; araca binip sürüşe başlayınca belirir. Kapatılırsa seçim hatırlanır.
  - Etkilenmeyenler: "iRacing kapalıyken de göster" işaretli kopyalar (ör. Kan Şekeri, Kalp Atışı, Sosyal Hesaplar), "sürekli göster" açık sohbet overlay'leri, "İzlerken / garaj" türündeki düzenler ve Demo modu.
- Yakın Takip: gösterilecek araç yokken ortadaki çizgi de çizilmez (ekranda tek başına çizgi kalmıyor).

## 061026-204

- Ödeme yöntemleri (c94): Yönetim › Planlar'a "Ödeme yöntemleri" bölümü eklendi.
  - Kendi ödeme bağlantıların: başlık, adres ve açıklamayla en çok 8 bağlantı (ör. ByNoGame ilanı). Sıralanır, tek tek gizlenir, istenirse yalnızca Türkiye'den bağlananlara gösterilir. Hesap sayfasında ve web sitesinde (fiyatlar bölümü, hesap sayfası) başlık + açıklama + "Ödeme sayfasını aç" düğmesiyle görünür.
  - Gizleme: otomatik planlar (mağaza düğmeleri, kupon kutusu, hediye PRO), Patreon ve Ko-fi ayrı ayrı kapatılabilir. Mağaza hazır değilken planlar gizlenip yalnızca kendi bağlantıların gösterilebilir.
  - Kendi bağlantınla yapılan ödemede PRO kendiliğinden açılmaz; ödemeyi görünce Üyeler bölümünden elle tanımlanır.

## 061026-203

- Kan Şekeri: veri gecikmesi azaltıldı.
  - Geçici hatalarda (ağ takılması, sunucu hatası, henüz veri yok) 20 sn sonra yeniden denenir (ilk üç deneme, sonra 60 sn). Eskiden her hata bekleme süresini katlıyordu (2, 3, 4, 5 dk): tek bir takılma veriyi dakikalarca geciktiriyor, bu sırada ekranda eski değer kalıyordu. Giriş / hesap hatalarında (şifre, kilit) aralık hesabı kilitlememek için yine uzar.
  - Okuma sensörün ölçüm anına hizalanır: sabit 60 sn yerine bir sonraki ölçümün beklendiği andan birkaç saniye sonra sorulur (en erken 20 sn, en geç 60 sn). Yeni ölçüm yayınlandıktan sonra en fazla ~10 sn içinde ekrana gelir (eskiden 60 sn'ye kadar).
  - Overlay bir süre ekranda değilken geri geldiğinde beklemeden okunur.

## 061026-202

- Ekranda düzenleme: içeriği manifestteki genişlikten dar olan tasarımlarda (ör. Kan Şekeri / Kalp Atışı yuvarlak ve kare, Sosyal Hesaplar tek hesap) çerçevenin sağında boşluk kalmaz; overlay ekranın sağ kenarına kadar taşınabilir. Çerçeve artık içeriğin gerçek genişliğini alır (boş overlay tutulabilsin diye yalnızca küçük bir alt sınır kaldı).

## 061026-201

- Ayarların / düzenlerin buluta gönderimi toplu yapılır: her değişiklikten 3 sn sonra ayrı ayrı göndermek yerine son değişiklikten 60 sn sonra, değişiklikler sürüyorsa en geç 5 dakikada bir. Panel arka plana geçince ya da gizlenince bekleyen değişiklik hemen gönderilir (başka cihaza geçildiğinde hesap günceldir). Düzen düzenlerken atılan istek sayısı belirgin biçimde düşer.

## 061026-200

- Overlay düzenleri hesapla birlikte gelir: düzenler (ve bütün ayarlar) giriş yapılıyken zaten buluta kaydediliyordu; ancak başka bir bilgisayarda / yeni kurulumda giriş yapınca cihazdaki ayarlar daha yeni tarihliyse hesaptaki düzenlerin ÜZERİNE yazılabiliyordu. Artık bir cihazda bir hesapla ilk girişte her zaman hesaptaki kayıt uygulanır; cihazdaki giriş öncesi ayarlar yedek olarak saklanır.
- Açık duran uygulama da güncel kalır: panel yeniden öne geldiğinde (en çok 10 dakikada bir) hesaptaki kayıt sorulur; başka cihazda yapılan düzen değişikliği uygulamayı yeniden başlatmadan gelir. İki cihazda da değişiklik yapıldıysa eskisi gibi hangisinin kalacağı sorulur.

## 061026-199

- Arkadaşlar penceresi: alttaki bölmenin adı "Takım ve grup sohbetleri" yerine "Grup sohbetleri"; hiç grup (ve bekleyen grup daveti) yokken bölme gösterilmez. Grup, bir sohbetin başlığındaki "Sohbete arkadaş ekle" düğmesiyle kurulur.
- Grup kurma ekranında uyarı: "Grupta 24 saat içinde hiç mesaj yazılmazsa grup kendiliğinden silinir. Davet ettiğin kişiler daveti kabul edince gruba katılır."

## 061026-198

- Sohbette resme tıklayınca profil: birebir sohbette mesajların başındaki resim (karşı tarafın ve kendi resmin), sohbet penceresinde etkin sekmenin resmi, grup sohbetinde gönderenin adı ve üye listesindeki resimler tıklanınca o üyenin profilini açar (ayrı sohbet penceresinden tıklanınca ana panel o profille öne gelir).

## 061026-197

- Sohbet / Arkadaşlar / ana pencere: pencereyi üst çubuktan tutup taşıyınca yazı alanının odağı kaybolmaz; taşıdıktan sonra mesaj kutusuna yeniden tıklamadan yazmaya devam edilir (çubuğa basmak odağı değiştirmez, taşıma bitince odak eski yazı alanına geri verilir).

## 061026-196

- Ekip paneli: sürücü yoklaması 6 sn yerine 15 sn'de bir (saatte 600 → 240 istek; canlı veri zaten pit duvarı yayınıyla gelir). Pit ayarı gibi yalnızca bu yoklamayla gelen bilgiler en fazla 15 sn gecikebilir. Uygulama ve web sitesi.
- Güvenilirden çıkarma artık anlık: sürücü birini çıkardığında o kişinin paneline bir haber gider, panel hemen yeniden sorar ve bağlantı kesilir (haber ulaşmazsa en geç 15 sn'lik yoklamada).

## 061026-195

- Ekip paneli: sürücü bir spotter'ı / izleyiciyi güvenilir arkadaşlarından çıkarınca o kişinin paneli hemen (en geç 6 sn içinde) kapanır, spotter yeri boşalır ve "… seni güvenilir arkadaşlarından çıkardı; bağlantın kesildi" bilgisi gösterilir. Uygulama ve web sitesi.

## 061026-194

- Sohbet grubuna eklenmek artık onaya bağlı (c93): grup kurulurken ya da sonradan eklenen kişi doğrudan üye olmaz, davet alır. Arkadaşlar listesinde "Grup davetleri" bölümünde Kabul et / Reddet ile yanıtlar (bildirim de gelir). Kabul edene kadar grubu, üyelerini ve mesajlarını göremez; reddederse davet silinir. Davet eden "davet gönderildi" bilgisini görür. Uygulama ve web sitesi.

## 061026-193

- Takım sohbet odaları kapatıldı: arkadaş listesinde / Arkadaşlar penceresinde takım odası çıkmaz, takım sohbeti dinlenmez ve bunun için sunucuya istek atılmaz (uygulama ve web sitesi). Takımlar sayfası, duyurular ve üyelik aynen durur; "Takım sohbeti" düğmesi kaldırıldı. Sunucudaki eski mesajlara dokunulmadı.
- Ekip paneli (spotter / izleyici) 10 dakikalık oturum sınırı: bir sürücünün paneline girilince çubukta geri sayım görünür (son 1 dakikada turuncu). Süre dolunca panel kapanır, spotter yeri bırakılır ve "spotter takibine oyunun içinden devam et; acil durumda tekrar bağlanabilirsin" bilgisi "Tekrar bağlan" düğmesiyle gösterilir (yeniden bağlanınca sayaç baştan başlar). Uygulamadaki Ekip sayfasında ve web sitesindeki ekip panelinde aynı.

## 061026-192

- Supabase istek sayısı azaltıldı (günlük log kotası). Koddan hesap: boşta ~525–750 → ~200–300 istek/saat; sürüşte ~975–1.470 → ~450–550 istek/saat.
  - Ekip odası sohbeti: Realtime asıl kanal; yedek yoklama her oda için 60 sn yerine 10 dk (kendi odam yarışta 60 sn). Eskiden güvenilir arkadaş sayısıyla katlanan en büyük kalemdi.
  - Canlı veri (takım yakıtı / arkadaş verisi): 10 sn'de bir Realtime yayınıyla gider (veritabanına yazılmaz); satır yalnızca 45 sn'de bir yazılır ve yayın anahtarını taşır (satırı yalnızca güvenilenler okuyabildiği için yayını da onlar bulur). Ekip izlerken satır eskisi gibi 10 sn'de bir.
  - Overlay penceresi: arkadaş listesi 2 dk yerine 10 dk'da bir; takım / grup / "herkese güven" ayarı 30 dk'da bir (kendi değişikliklerin hemen).
  - Arkadaşa özel bildirim ayarları 15 dk saklanır: arkadaş listesi her yenilemede iki yerine tek istek.
  - Arkadaşlar paneli: gizliyken 5 dk yerine 10 dk; takım / grup / ekip listeleri 15 dk'da bir.
  - Ekip komutu yoklaması yarışta 30 → 60 sn, boşta 2 → 10 dk; pit duvarı "izleyen var mı" sorusu 30 → 90 sn (izleyen girince yine hemen); ekip sürücü listesi 3 → 15 dk.
  - Pencere görünmüyorken (simge durumunda / tepside) yoklamayan sayfalar: Ekip, Arkadaşlar, Ekip ayarları, sohbet arka planı, Yönetim, Destek. Bildirimler 3 → 10 dk.
- c92 (sunucu): içinde 24 saat boyunca hiç mesaj yazılmayan sohbet grupları kendiliğinden silinir (saat başı; katıldı / ayrıldı gibi sistem satırları mesaj sayılmaz).

## 061026-191

- Fren ve Vites İşareti overlay'i varsayılan olarak PRO (c91: app_config.pro_overlays). Yönetim › PRO özellikleri'nden değiştirilebilir. Web sitesinde overlay "PRO" etiketiyle gösterilir.

## 051026-190

- Olaylar: sürücü süzgeci. Kategori çiplerinin yanındaki kutudan bir sürücü seçince yalnızca onun olayları listelenir (numara, ad ve olay sayısıyla, ada göre sıralı). Varsayılan "Tüm sürücüler". Kategori çipleriyle birlikte çalışır; CSV / dışa aktarma da süzülmüş listeyi alır. "Sadece benim" ile aynı anda kullanılmaz (biri seçilince diğeri kapanır).

## 051026-189

- Demoda ses aç / kapa: Demo açıkken üst çubukta Demo düğmesinin yanında bir hoparlör düğmesi çıkar. Varsayılan kapalı (sesli mühendis ve spotter demoda sessiz, altyazı benzetimi sürer); açınca demo da gerçek sürüş gibi seslidir (mühendis, spotter, uyarı bipleri). Seçim hatırlanır.

## 051026-188

- Lider Tablosu: sunucudan çıkan sürücüler artık listede kalır (soluk görünür); yarışı bitirip çıkanlar tablodan düşmez. Resmi sırası olan (pozisyonu bilinen) sürücüler için geçerlidir.
- Yarış Sonucu (podyum): podyum resmi sınıf sırasına göre dizilir (1., 2., 3.); o an sunucuda kalan ilk üç kişiye göre değil. Çıkan sürücüler de sonuç tablosunda yer alır.
- Sesli Mühendis: yeni "Ses çıkış cihazı" ayarı (mühendis, spotter ve uyarı sesleri seçilen hoparlör / kulaklıkta çalar; boş: Windows varsayılanı; cihaz bulunamazsa varsayılana düşer).
- Canlı Sohbet › Sesli okuma: seçilen çıkış cihazı uygulama yeniden açılınca kutuda "Windows varsayılanı" görünüyordu (ayar kayıtlıydı, kutu yanlış gösteriyordu); düzeltildi. Kayıtlı cihaz o an takılı değilse de adıyla görünür. Overlay ayarlarındaki "Monitör" kutusunda aynı düzeltme.
- Üst çubuktaki oyun seçici (Otomatik + oyun simgeleri) kaldırıldı; Ayarlar › Genel › Görüntü › "Oyun" satırına taşındı.
- Üst çubuk: pencere daralınca düğme yazıları (ör. "Sohbet açık") alt alta kırılmaz; sığmıyorsa punto ve boşluklar pencereyle birlikte küçülür.

## 051026-187

- Radar: yeni "Aynala (sol / sağ ters görünüyorsa)" ayarı. iRacing dışındaki bazı oyunlarda yandaki araç ters tarafta görünebiliyor; açılınca sol ve sağ yer değiştirir (yan araçlar ve kırmızı yan bölgeler). Varsayılan kapalı; iRacing'de kapalı kalmalı.
- Mini Harita: zaten olan "Aynala" ayarına aynı açıklama eklendi (hangi durumda açılacağı).

## 051026-186

- Sesli mühendis / spotter ses düzeyi artık kulağa göre ayarlı: kaydırıcı doğrudan genlik çarpanıydı, bu yüzden ses %10 civarına inene kadar neredeyse hiç kısılmıyordu. Şimdi kare eğrisi kullanılıyor: %50 belirgin biçimde kısık, %100 yine tam ses. Not: %100 altındaki eski ayarlar öncekinden daha kısık duyulur (ör. varsayılan %80); gerekirse kaydırıcıyı biraz yükselt.
- Web sitesi: Kan Şekeri, Kalp Atışı ve Sosyal Hesaplar overlaylarının galeri görselleri eklendi.

## 051026-185

- Tuval arka planı artık her düzen için ayrı (Düzenler ve Yayın sayfaları): "Arka plan" kutusu ve görsel seçici yalnızca seçili düzeni etkiler; her düzene başka görsel seçebilir, birinde kapatıp diğerinde açık bırakabilirsin.
  - Düzende hiç ayar yapılmadıysa eskisi gibi sayfanın ortak arka planı görünür (güncellemeyle hiçbir şey değişmez).
  - Düzen kopyalanınca (sağ tık › Düzeni kopyala) kopya aynı arka planla gelir; sonra ayrı değiştirilebilir.
  - Seçicideki "Kaldır" düzenin kendi görselini siler, düzen ortak arka plana döner.
  - Görseller bu bilgisayarda saklanır (hesapla eşitlenmez); saydamlık ayarı ortak kalır (Ayarlar › Genel › Düzenleme ekranı).

## 051026-184

- Düzen tuvalinde çoklu seçim artık gerçekten birlikte taşınır (ok tuşları ve fareyle sürükleme): ilk taşımadan sonra seçim kendiliğinden siliniyor, sonraki adımlarda hiçbiri ya da yalnızca biri hareket ediyordu. Neden: düzen kimliğini izleyen kod, ayar her değiştiğinde "düzen değişti" sanıp seçimi sıfırlıyordu.

## 051026-183

- SRTR Pitwall logosu artık her düzende (düzenler ve yayın düzenleri) ayrı ayarlanır (ücretli PRO): bir düzende gizleyip diğerinde gösterebilir, her düzende başka yere taşıyabilir ve boyutunu değiştirebilirsin (%50–%250).
  - Tuvalde sürükle: taşı; sağ alt köşedeki tutamak: boyutlandır; çift tık: varsayılana dön. Yayın sayfasında logo seçiliyken "Logo boyutu" kaydırıcısı ve "Varsayılan konum ve boyuta döndür" düğmesi var.
  - "Varsayılana döndür" her zaman ilk yere (sağ üst köşe, %100) döner.
  - Daha önce taşıdığın ortak konum bir kez bütün düzenlere aktarılır (görünüm değişmez); "Logo" kutusu / gizleme ayarı o düzende ayrıca değiştirilene kadar eski ortak ayarı izler.
  - PRO olmayanlarda değişiklik yok: logo sağ üstte, sabit boyutta görünür.

## 051026-182

- Sosyal Hesaplar: simgeler varsayılan olarak platform logosu (Twitch, YouTube, Kick, Instagram, TikTok, X, Facebook, Discord, Web). "Simge" ayarında yeni "Platform logosu" seçeneği varsayılandır; kısaltmalı dolu / çerçeveli rozet ve "simge yok" duruyor, "Kendi simgelerim"den yüklenen resim yine önceliklidir.
- Overlaylarım: listenin üstünde arama kutusu. Yazdığın metin adında geçen overlayler kalır (ör. "pit": Pit Penceresi, Pit Hız Limiti…); büyük / küçük harf ve Türkçe karakter farkı gözetilmez, uygulama diliyle ya da Türkçe adıyla aranır. Esc ya da kutuyu boşaltmak listeyi geri getirir.

## 051026-181

- Düzen tuvalinde çoklu seçim ok tuşlarıyla birlikte taşınır (Shift: 10 px): önceden yalnızca bir overlay hareket ediyordu. Kilitli olanlar yerinde kalır.

## 051026-180

- Yeni overlay: **Sosyal Hesaplar** (Yayın grubu, ücretsiz). Hesaplarını overlay ayarlarından yazarsın: Twitch, YouTube, Kick, Instagram, TikTok, X, Facebook, Discord, web siten ve adını kendin verdiğin 2 özel hesap; boş bırakılan gösterilmez, sıra sürüklenerek değişir.
  - 5 gösterim: sırayla tek hesap, simge sırası (sıradaki açılır), yan yana, alt alta, kayan şerit.
  - 7 geçiş (sırayla tek hesap): yukarı kay, yana kay, yumuşak geçiş, takla, büyüyerek gel, bulanıktan netleş, perde; her hesabın süresi ayarlanır.
  - 4 biçim (hap, kart, alt çizgili, yalnızca yazı), hizalama, yazı boyutu / kalınlığı, gölge, platform adını gösterme.
  - Renkler: 5 hazır tema, uygulama teması ya da kendi renklerin; simgeler platformun renginde ya da vurgu renginde.
  - Simgeler marka logosu değil, platformun kısaltmasını taşıyan renkli rozetlerdir; "Kendi simgelerim" bölümünden her hesap için kendi resmini yükleyebilirsin.
  - "Belirli aralıklarla" görünme (ör. 5 dakikada bir 20 sn); Demo modunda ve önizlemede hep görünür, hesap girilmemişse örnek hesaplar gösterilir.
  - Aynı düzende birden çok kopya eklenebilir. Web sitesine eklendi (14 dil).

## 051026-179

- Demo modunda bütün overlay'ler görünür kalır: gizleme koşulları demoda uygulanmaz. Sürücü Kartı "belirli aralıklarla" / "garajda" kipinde bile sürekli görünür. Aynısı şunlar için de geçerli: Hedef, Sürücü Değişimi, Geçiş Uyarısı, Spotter Çubuğu, Sektörler, Pit Penceresi, Pit Hız Limiti, Hasar, Pist Sınırları, Fren Noktası, Fark Grafiği, Stint, ERS, Olay Günlüğü, Düello, Rüzgar Pusulası, Kafa Kafaya, Dijital Bayraklar, Piste Dönüş, Radar (pitte gizle, yalnızca yarışta, boşken gizle, pist dışında gizle vb.). Garaj örtüsü (Sahne) bilerek dışarıda bırakıldı: demoda ekranı kapatmasın.

## 051026-178

- Canlı Sohbet varsayılan kısayolları: sesli okuma aç / kapat F8 (eskiden F5), altyazı aç / kapat F7 (eskiden F6). Eski varsayılanda kalmış kurulumlar bir kez kendiliğinden yeni tuşlara geçer; kendi seçtiğin tuşa dokunulmaz, yeni tuş başka bir eyleme atanmışsa da değiştirilmez.

## 051026-177

- Kopyala / yapıştır (Ctrl+C / Ctrl+V) başka düzene ya da yayın düzenine yapıştırırken overlay'i aynı yere, aynı görünür boyuta ve aynı ayarlarla getirir: kaynak ve hedef tuvalin çözünürlük farkı ile "genel boyut" ayarı hesaba katılır (ör. 5120×1440 monitör düzeninden 1920×1080 yayın düzenine). En-boy oranı aynıysa birebir; farklıysa boyut yüksekliğe göre, konum her eksende kendi oranıyla taşınır ve tuvalin içinde kalır.

## 051026-176

- Düzenler ve Yayın düzenleri: soldaki eklenebilir overlay listesinde favoriler (Overlaylarım'da sağ tık › Favorilere ekle) en üstte, "Favorilerim" başlığı altında görünür; diğerleri seçili sıralamayla altında kalır. Düzene eklenen favori "Düzende" bölümüne geçer.

## 051026-175

- Overlay ayarlarındaki ad kutusu artık düzendeki her overlay için görünür (ilk eklenen kopya dahil; eskiden yalnızca 2., 3. … kopyalarda vardı). Boş bırakılırsa overlay'in kendi adı kullanılır. Sağ tık › Yeniden adlandır aynen çalışır.

## 051026-174

- Kan Şekeri ve Kalp Atışı overlay'leri artık OBS / tarayıcı kaynağında da çalışır (yayın düzenleri): eskiden OBS'te "overlay ayarlarından giriş yap" yazıyordu, çünkü veri bilerek yalnızca uygulama pencerelerine veriliyordu. OBS sayfası veriyi yerel web sunucusundan okur; bu adres sunucu ağa açık olsa da yalnızca bu bilgisayardan gelen isteğe yanıt verir (ağdaki başka cihazlar okuyamaz). Kan şekeri 20 sn'de bir, nabız 2 sn'de bir yenilenir. Uyarı sesi yalnızca uygulamadaki overlay'de çalar; OBS'te yanıp sönme görünür.

## 051026-173

- Ana pencere çerçevesiz: Windows başlık çubuğu yok. Pencere, üst çubuğun (sayfa adının yazdığı çubuk) boş bir yerinden tutulup taşınır; çift tık büyütür / eski boyutuna döndürür. Küçült, büyüt ve kapat düğmeleri üst çubuğun sağ ucunda (dil seçicinin yanında). Kenarlardan boyutlandırma aynen çalışır.

## 051026-172

- Yeni overlay: Kalp Atışı. Akıllı saatten / göğüs bandından anlık nabız: nabızla birlikte atan kalp, BPM, nabız bölgesi (en yüksek nabza göre) ve mini grafik.
  - Kaynaklar: Pulsoid (erişim belirteciyle; Apple Watch, Wear OS, Garmin, Bluetooth bantlar), HypeRate (API anahtarı + oturum kimliği) ve yerel gönderim (saat / telefon uygulaması nabzı bu bilgisayardaki web sunucusuna yollar: `/hr/<anahtar>`; PUT, POST, GET; `heartRate:72`, `{"bpm":72}`, `?bpm=72`). Bağlantı, overlay ayarlarının başındaki "Nabız kaynağı" bölümünden kurulur; belirteç / anahtar yalnızca bu bilgisayarda şifreli saklanır.
  - Tasarımlar: Kart, Şerit, Yuvarlak (bölge halkası), EKG çizgisi, Yalın. 6 renk teması, uygulama teması, kendi renklerin ya da bölgeye göre değişen renk. İsteğe bağlı yüksek nabız uyarısı (yanıp sönme + ses).
  - Etkin ölçüm varsa önizlemede ve Demo modunda da gerçek değer görünür; yoksa önizleme, Demo ve düzenlemede normal aralıkta (yaklaşık 70–150) benzetilir.
- Kan Şekeri: daha çok özelleştirme — damla için kendi rengin, çerçeve çizgisi aç / kapat, köşe yuvarlaklığı, gölge, değer yazı boyutu ("Kendi renklerim" temasındaki beş renk aynen duruyor). Sınır dışı uyarısı değer normale dönene kadar yanıp söner; önizlemede de durmaz (eskiden önizleme donunca duruyordu). Ayar: "Değer sınır dışındayken çerçeve yanıp sönsün".
- Düzeltme: uygulama arka planı (degrade / görsel) açıkken açılır listelerin seçenekleri saydam zemine düşüp okunmuyordu; seçenek listeleri ve kabuk içindeki menü / pencere katmanları artık her zaman opak.
- Web sitesi: Kalp Atışı overlay'i eklendi (13 dil).

## 051026-171

- Düzenler ve Yayın düzenleri: pencere yeterince genişse (1500 px ve üzeri) ayar sütununun yeri panel kapalıyken de ayrılır; ayarları kapatınca tuval ve üstündeki başlık sola kaymaz, yerinde kalır. Daha dar pencerede eskisi gibi tuval boşalan yere genişler.
- Kan Şekeri: Demo modu açıkken de (ekranda ve önizlemede) giriş yapılmışsa gerçek ölçüm gösterilir; örnek veri yalnızca giriş yokken ya da henüz değer gelmemişken çıkar (170 ile birlikte).

## 051026-170

- Kan Şekeri: giriş yapılmışsa panel önizlemesinde (Overlaylarım, Düzenler / Yayın tuvali) örnek yerine gerçek değer görünür ve önizleme açıkken güncel kalır. Giriş yoksa ya da henüz değer gelmediyse örnek gösterilir. Sesli uyarı yine yalnızca ekrandaki overlay'de çalar.

## 051026-169

- Sohbet ve Arkadaşlar pencereleri çerçevesiz: Windows başlık çubuğu yok. Sohbet penceresi sekme çubuğunun (arkadaşın adının yazdığı çubuk) herhangi bir yerinden, Arkadaşlar penceresi üstteki profil çubuğundan / "Arkadaşlar" başlığından tutulup taşınır. Tıklama aynen çalışır (taşıma, imleç 4 px oynayınca başlar); çubuğa çift tık pencereyi büyütür. Küçült ve kapat düğmeleri pencerenin sağ üstünde. Kenarlardan boyutlandırma aynen çalışır.

## 051026-168

- Kan Şekeri: veri okuma sağlamlaştırıldı. İstekler artık HTTP/1.1 ile ve resmi uygulamadaki başlıklarla gidiyor; sunucu uygulamanın bağlantısını reddederse (JSON yerine engelleme sayfası / bağlantı hatası) aynı istek Windows'un kendi curl.exe'siyle yeniden denenir (bilgiler komut satırına yazılmaz). Rusya bölgesi adresi düzeltildi.
- Kan Şekeri: hata olduğunda teknik özet de gösterilir (aşama · HTTP kodu · yol; ör. "giriş · HTTP 403 · doğrudan"): giriş kutusunda ve bağlıyken hesap satırının altında. Hesap satırına "Şimdi yenile" düğmesi eklendi (overlay ekranda olmasa da hemen okur).
- Kan Şekeri overlay'i varsayılan olarak PRO (c90, yayında; Yönetim › PRO özellikleri'nden değiştirilebilir). Web sitesinde de PRO etiketiyle görünür.

## 051026-167

- Web sitesi artık main dalına yapılan her push'ta yeniden yayınlanır (eskiden yalnızca website/ değişince). Arada push'lanmayan bir sürümün site değişiklikleri sonraki push'ta kendiliğinden yayına girer.

## 051026-166

- Kan Şekeri: Yuvarlak ve Kare tasarımda ölçüm saati artık değişim / birim satırının altında ayrı satırda; çerçevenin dışına taşmıyor (yuvarlak 132 → 140 px). Ayarın adı "Ölçüm saatini göster" oldu (kapatınca saat hiç görünmez).

## 051026-165

- Yeni overlay: Kan Şekeri. Sürekli şeker ölçüm sensöründen (FreeStyle Libre / LibreLinkUp, Dexcom Share, Nightscout) anlık değer, yön oku, değişim, ölçüm saati ve son ~3 saatin mini grafiği; kan damlası simgesiyle.
  - Giriş: overlay ayarlarının başındaki "Sensör hesabı" bölümünden kaynak seçilip giriş yapılır / çıkış yapılır. Bilgiler yalnızca bu bilgisayarda, şifreli (Windows DPAPI) saklanır; ayarlara, buluta, yedeğe ve OBS sayfasına gitmez. Ölçümler de yalnızca bellekte tutulur.
  - Tasarımlar: Kart, Şerit, Yuvarlak, Kare, Geniş grafik. Renk temaları: Klasik, Okyanus, Neon, Pastel, Açık, Siyah-beyaz, Uygulama teması ya da kendi renklerin. mg/dL ya da mmol/L.
  - Uyarı: düşük / yüksek ve çok düşük / çok yüksek sınırları ayarlanır; aşılınca çerçeve yanıp söner, etiket çıkar ve uyarı sesi çalar (15 dk'da bir; acil düzeyde 5 dk'da bir). 15 dakikadan eski veri gri görünür, uyarı vermez.
  - Veri yalnızca overlay ekrandayken, 60 sn'de bir okunur; hata üst üste gelirse aralık uzar (hesabın kilitlenmemesi için). Çift tık hemen yeniler. Varsayılan olarak oyun kapalıyken de görünür.
  - OBS / tarayıcı kaynağında gösterilmez (bilerek: sağlık verisi yayına kendiliğinden çıkmasın). Tıbbi cihaz değildir.
- Web sitesi: overlay listesi, galeri ve özellikler sayfasına Kan Şekeri eklendi (13 dil).

## 051026-164

- Düzenler ve Yayın düzenleri: düzen / sahne adları tutup sürüklenerek sıralanır (turuncu çizgi bırakılacak yeri gösterir; Esc vazgeçer). Soldaki "Düzende" overlay listesi de aynı şekilde sıralanır; yeni eklenen overlay yine sona gelir.
- Düzenler ve Yayın düzenleri: sol sütun (düzenler + overlay listesi) ve ayarlar sütunu sağ kenarından sürüklenerek genişletilir (250–420 / 290–520 px, çift tık varsayılan). Genişlikler Overlaylarım sayfasıyla ortaktır ve hesapla hatırlanır.
- "Düzende" listesi: kilit simgesi PRO etiketinin sağında; simgeye tıklayınca kilit açılır.
- Düzeltme: Sohbet Anketi overlay'i uygulama açılınca örnek anketle ekranda kalıyordu (159'daki demo düzeltmesi panel önizleme verisini de "demo" sayıyordu). Artık yalnızca kullanıcının açtığı Demo modunda örnek gösterir.
- Windows ile başlat (sistem tepsisinde) varsayılanı bir kez daha uygulanır (kayıt eski kurulumlarda yazılmamış / eski klasörü gösteriyor olabiliyordu) ve açıkken her açılışta yenilenir. Ayarlardan kapatılırsa kapalı kalır.

## 051026-163

- Tuval yakınlaştırması düzen başına: bir düzende (ya da yayın düzeninde) yapılan yakınlaştırma yalnızca o düzende kalır, diğerleri kendi değerinde durur. Değer bu bilgisayarda hatırlanır (uygulama kapanıp açılsa da).

## 051026-162

- Düzenleme tuvallerinde (Düzenler ve Yayın düzenleri) fare tekeri doğrudan yakınlaştırır / uzaklaştırır; Space'e basmak gerekmez. Yakınlaştırma imlecin altındaki noktaya doğru yapılır. Yakınlaştırılmış tuvalde gezinmek için Space basılıyken sol tuşla sürükle (159'da eklendi).

## 051026-161

- Kopyalanan overlay başka düzene (ya da yayın düzenine) yapıştırılınca aynı konum ve ayarlarla gelir. Tek kopyalı overlay o düzende zaten varsa kopyalananla değiştirilir (kilitliyse dokunulmaz); aynı düzen içinde yapıştırmada eskisi gibi atlanır. Ctrl+Z geri alır.

## 051026-160

- Düzen tuvali: Ctrl+C seçili overlay'i (ya da çoklu seçimi) kopyalar, Ctrl+V yapıştırır. Birden çok kez eklenebilen overlay yeni kopya olarak (aynı ayarlar, biraz kaydırılmış) gelir; tek kopyalı overlay yalnızca düzende yoksa yapışır, varsa atlanır ve bilgi verilir. Başka bir düzene / yayın düzenine de yapıştırılabilir.
- Sağ tık menüsü: "Kopyasını oluştur" (birden çok eklenebilen overlay'lerde; aynı ayarlarla) ve "Yeniden adlandır" (menünün başında ad kutusu; Enter kaydeder, boş bırakılırsa varsayılan ada döner).
- Yakınlaştırma kısayolları overlay seçiliyken de çalışır: odak ayar panelindeki bir düğmede / listede kalınca Space + teker çalışmıyordu. Ayrıca imleç tuvaldeyken + / − yakınlaştırır / uzaklaştırır, 0 sığdırır.

## 051026-159

- Anket overlay'i Demo modunda örnek anket gösterir: eskiden sohbet bağlıyken (yayın kapalı) ya da giriş / PRO koşulu sağlanmıyorken demo açık olsa da boş kalıyordu. Gerçek bir anket sürüyorsa o gösterilir.
- Düzen tuvali: Space basılıyken sol tuşla sürükleyerek yakınlaştırılmış tuvalde gezinilir (o sırada overlay seçilmez / taşınmaz).
- Düzen tuvali: boş yerden sürükleyerek birden çok overlay taranıp seçilir (kesik çerçeve). Seçilenlerden biri sürüklenince hepsi birlikte taşınır; ok tuşları hepsini taşır; Delete hepsini siler. Ctrl / Shift + tıkla seçime ekler / çıkarır; boş yere tıklamak seçimi kaldırır. Kilitli overlay'ler taşınmaz ve silinmez. Yayın düzenlerinde de geçerli.

## 051026-158

- Demo modunda sesli mühendis / spotter sessizce "konuşur": ses ve bip çıkmaz ama mesajlar gerçek süreleriyle sıraya girer, Sesli Mühendis (altyazı) overlay'i canlı yarıştaki gibi dolar. Sesli mühendis ayarı kapalı olsa da demo altyazıları gösterir (ses paketi kurulu olmalı; hangi mesaj türlerinin açık olduğu ayarlardan gelir).

## 051026-157

- Arkadaş listesi: okunmamış mesaj sayısı satırın sağında, yükseklikte tam ortada ve biraz daha büyük (13 punto). Takım ve grup satırlarında da aynı.
- Güvenilir işareti yeşil yerine altın / turuncu.
- Düzen (ve yayın düzeni) silerken uygulama içi onay penceresi çıkar: "… düzeni silinsin mi?" + "geri alınamaz" notu, Vazgeç / Sil. Sil düğmesi, sağ tık menüsü ve Delete tuşu için geçerli; varsayılan odak Vazgeç'te, Esc ve dışına tıklama vazgeçer. (Eskiden tarayıcının onay kutusu kullanılıyordu; bazı kurulumlarda görünmüyordu.)

## 051026-156

- Sohbet penceresi önde ve o kişinin (takımın / grubun) sekmesi açıkken ondan gelen mesajda ses ve bildirim kutusu çıkmaz; simdeyken de. Pencere arkadayken, simge durumundayken ya da başka sekme açıkken ses gelir. Pencerenin öndeki sekmesi artık pencereler arası olayla da bildiriliyor (eskiden yalnızca ortak depo; gecikince ses kaçıyordu).

## 051026-155

- Overlaylarım: overlay listesi ve ayarlar sütunu sağ kenarından sürüklenerek genişletilebilir (liste 250–420 px, ayarlar 290–520 px; çift tık varsayılana döndürür). Genişlik hesapla birlikte hatırlanır.
- Overlaylarım: hedef düzen olarak en son overlay eklenen düzen seçili gelir (hesapla birlikte hatırlanır; düzen silindiyse etkin düzene döner).

## 051026-154

- Pit duvarının veritabanı yedeği 5 sn → 15 sn (canlı yayın saniyede bir, değişmedi). Sunucudaki tazelik sınırı buna göre 15 sn → 45 sn (c89, yayında).
- Canlı veri (arkadaş / ekip paylaşımı) 3 sn → 10 sn; yalnızca bakan varken gönderilir.

## 051026-153

- Canlı veri yalnızca bakan varken gönderilir: eskiden güvenilir arkadaşı olan sürücü yarış boyunca 3 sn'de bir veri yazıyordu (kimse bakmasa da). Artık bakan taraf "bakıyorum" der (simdeyken ya da arkadaşın veri penceresi açıkken, 20 sn'de bir, Realtime); 50 sn haber gelmezse gönderim durur. Ekip için de yalnızca pit duvarını izleyen varken.
- Pit duvarı Realtime canlı yayına taşındı: sürücü veriyi saniyede bir (eskisi gibi) doğrudan izleyene yayınlar, veritabanına yalnızca 5 sn'de bir yazar (yedek + yayın anahtarı). İzleyen, yayın geldiği sürece sunucuyu hiç yoklamaz; yayın 5 sn gelmezse 4 sn'lik yoklamaya döner. Yayın kanalının adı her izleyici girişinde değişen rastgele anahtar içerir; anahtarı yalnızca yeri tutan kişi alabilir.
- İzleyen panele girince sürücüye "girdim" haberi gider: sürücü izleyen var mı diye 15 sn'de bir sormak yerine 30 sn'de bir sorar, haber gelince hemen başlar. Ek görünümler (Timing, mühendis) istenmiyorken 3 sn yerine 15 sn'de bir sorulur.
- Ekip listesi yenilemesi 60 sn → 5 dk, yönetici rozetleri 60 sn → 5 dk (pencere gizliyken hiç), yarışta durum nabzı 60 sn. Sitede ekip listesi 3 sn → 15 sn, sürücü yoklaması 3 sn → 6 sn.
- Not: sürücü ve izleyen 153 (ve yeni site) olmalı. Eski sürümdeki izleyici yeni sürücüyü 5 sn gecikmeli (yedek) görür; eski sürümdeki bakan "bakıyorum" diyemediği için yeni sürücünün canlı arkadaş verisini göremez.

## 041026-152

- Arkadaş listesi artık canlı: bir arkadaşın durumu değişince (çevrimiçi, yarışa girdi / çıktı, uzakta, rahatsız etmeyin) uygulaması arkadaşlarına haber verir ve liste 1–2 sn içinde güncellenir (Realtime yayını; veritabanına yazılmaz). Düzenli yenileme 30 sn → 2 dk (kapalı / gizliyken 5 dk); sohbet penceresindeki sekme durumu 30 sn → 2 dk.
- Mesaj ifadeleri canlı: biri ifade bırakınca / kaldırınca açık sohbetlerde hemen görünür; 25 sn'lik yenileme kalktı (yedek: 3 dk).
- Web sitesi aynı kanalları kullanır (site ↔ program arası da canlı); sitedeki liste yenilemesi 20 sn → 60 sn.
- Not: iki taraf da 152 (ve yeni site) olmalı; eski sürümdeki arkadaşın değişikliği yedek yenilemeyle (en geç 2 dk) görünür. Programı kapatan arkadaşın çevrimdışı görünmesi 3–5 dk sürer.

## 041026-151

- Pit duvarını sürücü başına tek kişi izler (c88, yayında): ekipten ilk giren yeri alır (izleme yetkisi yeter; pit komutu için yetki ayrıca aranır), diğerleri pit duvarını, ek görünümleri ve canlı veriyi göremez; "… şu an bu sürücünün spotter'ı" notu çıkar. Yer, panel kapanınca hemen, bağlantı koparsa 45 sn içinde boşalır. Web sitesi dahil.
- Düzeltme: sürücünün "izleyen var" sayacı uygulaması açık her ekip üyesini sayıyordu (arka plandaki sohbet yoklaması yüzünden), sürücü kimse izlemezken de sürekli veri gönderiyordu. Artık yalnızca yeri tutan kişi sayılır.

## 041026-150

- Supabase istek sayısı azaltıldı (log kotası): ekip komut yoklaması 2 sn → 30 sn (yarış dışında 2 dk; asıl kanal Realtime), ekip sohbeti 4 sn → 20/60 sn, pit duvarı gönderimi 1 sn → 2 sn (izleyen yokken 5 sn → 15 sn), izleyici tarafı 1 sn → 2 sn ve pencere gizliyken hiç, ifadeler 6 sn → 25 sn ve yalnızca sohbet penceresi öndeyken, arkadaş listesi 20 sn → 30 sn (kapalı / gizliyken 3 dk), durum bildirimi 45 → 90 sn, uygulama pingi 2 → 3 dk, PRO özellik listesi 5 → 30 dk. Web sitesinde de aynı (pit duvarı, ifadeler, çevrimiçi bildirimi 60 sn).
- En çok veri kullanan özellikler varsayılan PRO (c87, yayında): telemetriyi buluta yüklemek, başkalarının telemetrisini görmek ve yeni "Ekip: arkadaşın yarışını canlı izlemek" (izleyen / spotter olan üye PRO olmalı; sunucu denetler, site dahil). Yönetim › PRO özellikleri'nden değiştirilebilir.
- Yeni üyeye deneme PRO artık 1 gün (açık; ilk girişte kendiliğinden verilir, kötüye kullanım denetimleri aynen).

## 041026-149

- GÜVENLİK (c86, yayında): telemetri yalnızca giriş yapmış üyelere görünür. Giriş yapmadan oturumlar, turlar, sürücü kimlikleri (iRacing numarası dahil), iz dosyaları, yarışçı listesi, sıralamalar, iRating bilgisi ve takım "Son aktiviteler" artık okunamaz. Web sitesindeki Yarışçılar sayfası ziyaretçiye "giriş yapmalısın" gösterir.
- Yeni araç: `node scripts/guvenlik-tara.mjs` — giriş yapmadan hangi tablolardan satır okunabildiğini listeler; beklenmedik açık tablo varsa uyarır. Yeni tablo / SQL ekledikten sonra çalıştırılmalı.

## 041026-148

- GÜVENLİK (c85, yayında): `profiles` tablosu artık herkese açık değil. Eskiden herkese açık anahtarla giriş yapmadan tablonun tamamı okunabiliyordu (ödeme e-postası, yönetici bilgisi, PRO tarihleri, iRacing numarası). Artık herkes yalnızca kendi satırını okur (yönetici hepsini). Başkalarının adı / iRacing adı / fotoğrafı yalnızca bu dört sütunu veren `profiles_public` görünümünden gelir; topluluk liste görünümleri (düzen, ekran görüntüsü, tema, gösterge ve yorumları) de onu kullanır.
- Program ve web sitesi: arkadaş arama, fotoğraf ve ad sorguları `profiles_public` görünümüne geçti. Bu sürümden ÖNCEKİ programlarda ve eski sitede arkadaş arama sonuç vermez (güncelleme gerekir); diğer her şey çalışır.

## 041026-147

- Web sitesi (telefon): sohbet paneli artık klavye açıldığında görünen alana tam oturur; yazı kutusu klavyenin hemen üstünde kalır, arkadaki sayfa görünmez ve kaymaz, son mesaj görünür kalır.
- Web sitesi: mesaj kutusu otomatik doldurma alanı olarak işaretlenmez (iOS'ta klavyenin üstünde çıkan parola / kart / konum çubuğunu azaltmak için).

## 041026-146

- Web sitesinden bağlı üye artık arkadaşlarına çevrimiçi görünür ve adının yanında cihaz simgesi çıkar: telefondan bağlıysa telefon ("Telefonda"), bilgisayar tarayıcısından bağlıysa dünya ("Web sitesinde"). Program açıksa program durumu önceliklidir (simge çıkmaz). "Çevrimdışı görün" seçen üye siteden de gizli kalır. Site sayfa görünürken 45 sn'de bir bildirir; sayfa kapanınca en geç 90 sn'de çevrimdışına döner.
- Programda: arkadaş listesi ve sohbet sekmesi. Sitede: arkadaş listesi. Sunucu: c84 (web_presence, web_ping, my_friends.device) — yayında.

## 041026-145

- Overlay ayarları › "Ne zaman gizlensin": "Garajdayken gizle" artık "Pitteyken gizle" ve garajın yanında pit yolunda / pit kutusundayken de gizler (eskiden yalnızca iRacing'in garaj ekranında gizliyordu). "Pistte sürerken gizle" artık yalnızca araçtayken ve pitte değilken gizler (eskiden pitte araçta otururken de gizliyordu; iki seçenek bu yüzden ters çalışıyor gibi görünüyordu).
- Bölüme açıklama eklendi: Demo modunda ve düzenlerken bu iki seçenek uygulanmaz.

## 041026-144

- Mesajlar overlay'i ayarları: "Takım mesajlarını göster" artık "Grup mesajlarını göster" yazıyor. "Ekip mesajlarını sesli oku" açıklaması: güvenilir olarak seçtiğin arkadaşlarının ekip odasına yazdığı mesajlar sesli okunur.
- Demo modunda sesli mühendis artık sesli komut (bas-konuş) sorularına da cevap vermez; otomatik anonslar, spotter ve bipler zaten susuyordu. Ayarlardaki "Test" / örnek çalma düğmeleri etkilenmez.

## 041026-143

- Pist Haritası ve Mini Harita: harita henüz çizilmemişken görünen yazı kısaltıldı: "1 tur atınca görünür".

## 041026-142

- Düzeltme: Ekip Pitwall'ında "Pit servisi" kutularındaki onay işareti uzun turuncu / koyu bir kama gibi görünüyor ve yazıları (Açık / Kapalı) örtüyordu. Neden: Sıralama overlay'inin stili panelde yüklüyken bu kutulara sızıyordu. Artık küçük yuvarlak onay işareti olarak görünür.

## 041026-141

- Sohbet penceresi açık ve öndeyken (odakta), o anda seçili sekmedeki kişiden / odadan gelen mesaj için sağ alttaki bildirim kartı ve bildirim sesi çıkmaz. Başka sekmedeki ya da pencere arkadayken gelen mesajlar eskisi gibi bildirilir. Arkadaş, takım ve grup sohbetlerinde geçerli.

## 041026-140

- "iRacing bilgilerimi profilimde göster" ayarı kaldırıldı: programda Hesap › Herkese açık profil bölümünden ve web sitesindeki profil düzenleme sayfasından.

## 041026-139

- Düzeltme: sohbet penceresinde sekme değiştirince (ve sohbet açılınca) liste tam en alta inmiyor, son mesaj yarım kalıyordu. Artık son mesaj tam görünür (arkadaş, takım ve grup sohbetlerinde).
- SRTR Pitwall logosu normal düzenlerde artık yalnızca ana monitörde değil, düzende en az bir overlay eklenmiş her monitörde çizilir; hiç overlay eklenmemiş monitörde görünmez (Düzenler tuvalinde de aynı).

## 041026-138

- SRTR Pitwall logosu artık normal düzenlerde de (oyunun üstündeki overlay'lerde, ana overlay monitöründe) aynı kurallarla görünür: ücretsiz üyede ve hediye PRO'da sabit (sağ üst) ve gizlenemez; ücretli PRO ve yönetici gizleyebilir / taşıyabilir. Ayar yayın düzenleriyle ortaktır. Logo, sim bağlıyken (ya da Demo'da) ve overlay'ler görünürken çizilir.
- Düzenler sayfası: tuvalde logo görünür (ücretsiz üyede ayrılmış alan: overlay oraya konamaz), araç çubuğunda "Logo" onay kutusu.

## 041026-137

- Web sitesi: programda arkadaşa verilen takma ad sitede de görünür (arkadaş listesi, sohbet başlığı, mesaj başlığı, yeni mesaj kutusu); listede adın üzerine gelince gerçek adı yazar. Takma ad programdan verilir / değiştirilir.

## 041026-136

- Arkadaşlara takma ad: arkadaşa sağ tık > "Takma ad ver" (ad satırda düzenlenir; Enter kaydeder, Esc vazgeçer, boş bırakınca takma ad kalkar). Takma adı yalnızca sen görürsün; listede, favori şeridinde, sohbet sekmesinde ve mesaj başlığında görünür, üzerine gelince gerçek adı yazar. Arama takma adla da bulur. Hesapla birlikte taşınır.

## 041026-135

- Web sitesi sohbeti programla eşitlendi (website/assets/friends.js, friends.css, 13 dil dosyası):
  - Steam tarzı balonsuz yazışma: fotoğraf + ad + saat başlığı altında düz satırlar.
  - Mesajlara ifade: mesaj menüsünün üstünde hızlı ifadeler, mesajın altında ifade çipleri (6 sn'de bir yenilenir).
  - Grup görseli listede ve sohbet başlığında görünür.
  - "Uzakta" (zzz) ve "Rahatsız etme" işaretleri arkadaş listesinde.
  - Başka cihazdan / programdan gönderdiğin özel mesajlar açık sohbette anında görünür.
  - Fareyle sol tık mesaja bir şey yapmaz (menü sağ tıkla); dokunmatik ekranda dokunmak menüyü açmaya devam eder.

## 041026-134

- Grup görseli: grubun sahibi Üyeler panelinden "Grup görseli ekle / Görseli değiştir / Görseli kaldır" ile gruba görsel koyar (kare kırpılır); listede ve sohbet başlığında görünür. Etiket yok. Sunucu: c83 (chat_groups.avatar_path, group_set_avatar, my_groups.avatar_path) — yayında.
- Başka cihazdan (telefon, web sitesi) ya da başka pencereden gönderdiğin özel mesajlar açık sohbette anında görünür; eskiden sohbeti kapatıp açmak gerekiyordu.

## 041026-133

- "Uzakta" durumu: üye 10 dakikadır klavye / fare kullanmıyorsa (yarışta değilken) arkadaşlarında adının yanında zzz işareti ve "Uzakta" yazısı görünür, satır biraz sönükleşir. Sunucu: c82 (user_status.away, my_friends.away) — yayında. Yalnızca bu sürümü (ve sonrasını) kullanan üyeler için çalışır.
- "Rahatsız etme" seçen arkadaşın adının yanında kırmızı işaret.
- Alttaki çubuk artık "TAKIM VE GRUP SOHBETLERİ".
- Takım odasına sağ tık menüsü: Sohbeti aç, Takım sayfası, Favorilere ekle / çıkar, Sessize al. Favori takımlar da yıldızla en üstte durur.

## 041026-132

- Ayarlar › Sohbet: mesaj yazı boyutu (14–18 px; en küçüğü şimdiki boyut) ve yazı tipi seçimi, canlı örnekle. Arkadaş, takım ve grup sohbetlerinde geçerli; arkadaş listesi de aynı oranda büyür. Hesapla birlikte taşınır.
- Sohbet penceresinde seçili sekmenin altında ince turuncu çizgi.
- Sekmeler arkadaş listesindeki renklerle: çevrimiçi mavi, yarışta yeşil, çevrimdışı gri ve sönük; seçili olmayan sekme biraz daha sönük.
- Sekme kapatılınca sağdaki sekmeler yumuşak bir geçişle sola kayar.

## 041026-131

- Sohbette "… yazıyor" satırı için mesajların altında her zaman küçük bir boşluk ayrılır; karşı taraf yazmaya başlayınca yazı artık son mesajın üstüne binmez.

## 041026-130

- Düzeltme: mesaj gelince sohbet penceresi "tıklanmış" gibi davranıyor, mesaj okunmuş sayılıyor ve görev çubuğunda renkli görünmüyordu. Pencere artık görev çubuğunda etkinleştirilmeden (odak almadan) açılır ve öne gelene kadar düğmesi renkli / yanıp söner kalır; pencere açıkken başka pencerelerin arkasındaysa da aynısı olur.
- Görev çubuğundan sohbet penceresine tıklayınca en son mesaj gelen kişinin sekmesi öne gelir, mesaj okunmuş sayılır ve Arkadaşlar listesindeki okunmamış uyarısı kalkar.
- Sohbet sekmesinde arkadaşın durumu Arkadaşlar penceresindeki gibi yazılır (oyun · oturum · pist · araç, ya da son görülme); 30 saniyede bir güncellenir.

## 041026-129

- Web sitesi: bağlantı paylaşılınca (WhatsApp, Discord, X, Facebook…) görünen önizleme görseli eklendi (website/assets/img/og.jpg, 1200×630). Tüm sayfalara tam adresli og:image, og:url, og:type, twitter:card etiketleri kondu; eski göreli adresli og:image bazı uygulamalarda önizlemenin hiç çıkmamasına yol açıyordu.
- Sohbet penceresinde seçili sekme belirgin: turuncu üst çizgi ve parlak zemin; diğer sekmeler soluk.
- Sohbet penceresinde mesaj yalnızca pencere öndeyken (tıklanmış, odakta) okunmuş sayılır. Pencere başka pencerelerin arkasındaysa ya da simge durumundaysa mesaj okunmamış kalır (Arkadaşlar penceresinde "Okunmamış mesajlar"da görünür); pencereye geçince okunur.

## 041026-128

- Düzeltme: Yönetim › Üst çubuk bağlantıları'nda ad ya da adres yazarken her harfte yazı kutusu odağı kaybediyordu; artık kesintisiz yazılır.

## 041026-127

- Sohbette mesaja sol tıklamak artık bir şey yapmaz; mesaj menüsü yalnızca sağ tıkla açılır.
- Arayüzdeki "Arkadaşlar" düğmesi arkadaş listesini her zaman ayrı pencerede açar (uygulama içinde açılmaz); düğmeye yeniden basınca pencere kapanır. Tepsiden okunmamış mesajla açılınca da ayrı pencere açılır.
- Sohbet penceresinde özel sohbetin üstündeki çubuk (grup kurma ve "bendeki mesajları sil" düğmeleri) kaldırıldı.
- Düzeltme: sohbet penceresi simge durumundayken gelen mesajlar okunmuş sayılıyordu; Arkadaşlar penceresindeki "Okunmamış mesajlar" bölümü boş kalıyordu. Artık pencere açılana kadar okunmamış kalır.
- Kendi gönderdiğin mesajların yanındaki saat de okunur renkte görünür.

## 041026-126

- Mesajlara ifade (reaksiyon): mesaja tıklayınca / sağ tıklayınca açılan menünün üstünde hızlı ifadeler; mesajın altında ifade çipleri (sayı ve kimlerin bıraktığı; tıklayınca sen de eklersin / kaldırırsın). Özel, takım ve grup sohbetlerinde. Başkalarının ifadeleri birkaç saniye içinde görünür. Sunucu: c81 (message_reactions, message_react, message_reactions_for) — yayında.
- Takım ve grup sohbetleri de sohbet penceresinde sekme olarak açılır (Arkadaşlar penceresinden tıklayınca ya da bildirim kartından). Grup sekmesinde üyeler sağda açık gelir.
- Yeni mesaj gelen sekme farklı (sarımsı) renkte görünür; takım / grup mesajında da sohbet penceresi görev çubuğunda yanıp söner.
- Takım / grup odasında zil düğmesi artık "Bildirimler" penceresini açar: "Şu durumlarda bildir" seçimi (Tüm mesajlar / Hiçbiri).

## 041026-125

- Yazışma ekranı Steam tarzında: balon yok; fotoğraf + ad + saat başlığı altında düz satırlar, sakin koyu renkler, üzerine gelinen satır hafifçe vurgulanır. Arkadaş, takım ve grup sohbetlerinin hepsinde geçerli.
- Sohbet arka planı kaldırıldı: sohbet başlığındaki arka plan düğmeleri, arka plan görseli ve Ayarlar › Sohbet sayfası artık yok.
- Sohbet penceresi tek pencerede sekmeli (Steam gibi): her arkadaş bir sekme (fotoğraf, ad, durum; × ya da orta tık kapatır). Yeni mesaj gelen sekmede sarı nokta yanar, pencere görev çubuğunda yanıp söner.
- Özel sohbet başlığında "Sohbete arkadaş ekle": o arkadaş seçili gelen grup kurma ekranı açılır; grup kurulunca grup sohbetine geçilir.
- Grup sağ tık menüsüne "Favorilere ekle" eklendi: favori gruplar yıldızla en üstte durur (hesapla taşınır).

## 041026-124

- Sohbet pencereleri (Steam gibi): ayrı Arkadaşlar penceresinde bir arkadaşa tıklayınca sohbet kendi penceresinde açılır (başlığı arkadaşın adı, görev çubuğunda ayrı düğme). Yeni mesaj gelince o arkadaşın penceresi görev çubuğunda belirir (yoksa simge durumunda, odak çalmadan açılır) ve yanıp söner; tıklayınca sohbet açılır. Yarıştayken pencere açılmaz. Bildirim kartına tıklamak da sohbet penceresini açar.
- Mesaj bildirimleri: art arda gelen özel mesajlar tek kartta birleşmek yerine alt alta ayrı kartlarda görünür (en çok 3); üzerine gelinen kart farklı renkte.
- Arkadaş listesi: en üstte "Okunmamış mesajlar" bölümü (mesaj sayısıyla). Sohbet başka pencerede okununca sayı her pencerede sıfırlanır.
- Favori arkadaşlar: sağ tık > "Favorilere ekle"; ayrı pencerede profilin altında büyük fotoğraflarla durur (tıkla: sohbet, sağ tık: çıkar).
- Ayrı pencerede arama "ARKADAŞLAR" çubuğunun içinde yumuşakça sola doğru açılır; kişiler arasında gezinirken yumuşak geçiş.
- Sistem tepsisi sağ tık menüsü programın kendi tasarımıyla (koyu zemin, simgeler, turuncu vurgu, kısayollar sağda). Açılamazsa Windows'un yerel menüsüne düşer.
- Üst çubuk sol menü çubuğuyla aynı renkte.
- Küçük arayüz tercihleri artık hesapla birlikte buluta gidiyor (ayarların içinde): favori overlay'ler, "Sadece favorilerim", kapalı overlay kategorileri, arkadaş listesinde kapalı bölümler, çevrimdışı sırası, Takım sohbetleri bölmesi, favori arkadaşlar. Bu bilgisayardaki eski seçimler ilk değişiklikte hesaba taşınır.
- Düzeltme: sağ alttaki boyutlandırma noktaları ve pencere başlığı için gereken pencere izinleri eklendi.

## 041026-123

- Overlaylarım: overlay'e sağ tık > "Favorilere ekle" / "Favorilerden çıkar". Favori overlay'lerin sağında yıldız görünür ve her sıralamada listenin en üstünde "Favorilerim" başlığı altında durur (bu bilgisayarda hatırlanır).
- Sırala listesine "Sadece favorilerim (n)" eklendi: liste yalnızca favorileri gösterir (önceki sıralaman korunur; başka bir sıralamayı seçince tüm overlay'ler geri gelir). Favorin yokken ne yapacağını yazar.
- Ayrı Arkadaşlar penceresi: üstteki profil ve "ARKADAŞLAR" çubuğu ile alttaki çubuk sabit kalır; yalnızca arkadaş listesi fare tekeriyle kayar (ince kaydırma çubuğu).

## 041026-122

- Overlaylarım: alttaki "Düzen" artık seçilebilir bir liste; normal düzenler ve yayın düzenleri seçilebilir (seçilmezse eskisi gibi etkin düzen).
- "+ Overlay Ekle" (ve çift tık) overlay'i seçili düzene ekleyip görüntüyü o düzenin ekranına geçirir (yayın düzeniyse Yayın sayfası) ve eklenen overlay seçili gelir.

## 041026-121

- Ayrı Arkadaşlar penceresi: kategori başlıkları Steam'deki gibi ("+ Oyunda (3)" kapalı, "– …" açık), aralarında çizgi.
- Alttaki çubuk "TAKIM SOHBETLERİ" oldu ve açılıp kapanan bir bölme: takım odaları ve gruplar artık burada listelenir (üst listeden çıktı), + ile grup kurulur. Açık/kapalı durumu hatırlanır.
- Durum menüsüne (adının altındaki ok) "Profili düzenle" eklendi: arayüzde Hesap sayfasını açar. Fotoğrafa basmak profil sayfasını açmaya devam eder.

## 041026-120

- Arkadaş satırının sağındaki "Mesaj" ve "Seçenekler" (üç nokta) düğmeleri kaldırıldı; satıra tıklamak sohbeti, sağ tık menüyü açar (ekip paneli düğmesi duruyor).
- Arkadaş sağ tık menüsüne "Telemetri kıyasla" eklendi: ikinizin de aynı pistte (tercihen aynı araçla) telemetri kayıtlı en iyi turu varsa tur analizini iki turla açar; ortak pist yoksa arkadaşın telemetri profilini açıp nedenini yazar.

## 041026-119

- Ayrı Arkadaşlar penceresi Steam arkadaş listesi düzenine geçti: pencere başlığı "SRTR Pitwall - Arkadaşlar"; en üstte fotoğrafın, adın ve durumun; altında "ARKADAŞLAR" çubuğu (arama ve arkadaş ekle); en altta "GRUP SOHBETLERİ" çubuğu (+ ile grup kur); kategoriler arasında çizgi; sağ alt köşede boyutlandırma noktaları.
- Bu pencerede kendi fotoğrafına basınca arayüzde kendi Telemetri profil sayfan açılır.
- Çevrimdışı başlığının sağında sıralama düğmesi: A'dan Z'ye ya da en son çevrimiçi olana göre (saat ikonu). Seçim hatırlanır.
- Oyundaki arkadaşların solunda girdiği oyunun ikonu (src/assets/simlogos'taki dosyalar; ikonu olmayan oyunda eskisi gibi kısa ad yazar).
- Düzeltme: ayrı pencereden "Profil" istenince Telemetri sayfası henüz hiç açılmamışsa profil açılmıyordu.

## 041026-118

- Yönetici üye listeleri (üst çubuktaki canlı üye listesi ve Yönetim › Üyeler): üye adına basınca arkadaş listesindeki "Profil" gibi o üyenin Telemetri profil sayfası açılır. Canlı listede satırın geri kalanı eskisi gibi Yönetim › Üyeler'i açar.

## 041026-117

- **Demo:** overlay'in "Pistte gizle" / "Garajda gizle" ayarı Demo'da uygulanmaz; Demo açıkken bütün etkin overlay'ler görünür (ekranda ve OBS'te). Lastikler bu yüzden Demo'da gizli kalabiliyordu.

## 041026-116

- **Yayın logosu yalnızca ücretli PRO ile gizlenir / taşınır:** yöneticinin hediye ettiği, deneme ve kampanya PRO'sunda logo sağ üstte sabit kalır (OBS çıktısında da). Ücretli abonelikler (Lemon Squeezy, Patreon, Ko-fi; üyeden üyeye satın alınan hediye dahil) ve yöneticiler gizleyip taşıyabilir.

## 041026-115

- **Yayın düzenlerinde SRTR Pitwall logosu:** PRO üyeler logoyu tuvalde sürükleyerek ya da ok tuşlarıyla taşıyabilir ("Varsayılan konuma döndür" düğmesiyle geri alınır). PRO bittiğinde logo yeniden sağ üst köşede görünür; gizlenemez ve taşınamaz.

## 041026-114

- **Bağlantı göstergesi:** noktanın üzerine gelince artık yalnızca tek açıklama kutusu çıkar (tarayıcının ikinci, düz ipucu kaldırıldı).

## 041026-113

- **Düzenleme arka planları ayrıldı:** Düzenler tuvali, Yayın düzenleri tuvali ve ekranda düzenleme modunun arka plan görseli ve ayarları artık birbirinden bağımsız. Mevcut arka plan üçünün de başlangıç değeri olur; birini değiştirmek ya da kaldırmak diğerlerini etkilemez. Ayarlar › Genel'de "Arka plan yeri" seçimi.

## 041026-112

- **Çökme günlüğü:** `crash.log` artık çökmenin hangi modülde (DLL) olduğunu ve çağrı yığınını da yazar (bellek erişim hatalarının yerini bulmak için).

## 041026-111

- **Lastikler:** Demo'dayken pit beklenmeden görünür (ekranda ve OBS'te); gerçek yarışta yine yalnızca pitteyken.
- **Yayın düzenlerinde SRTR Pitwall logosu:** yayın çıktısının sağ üst köşesinde küçük bir etiket (logo, "SRTR Pitwall", altında pitwall.simracetr.com); 30 saniyede bir hafif parlama efekti. Oyuna girilip overlay'ler etkin olunca (ya da Demo'da) görünür. Taşınamaz, boyutlandırılamaz, silinemez; her zaman overlay'lerin üstünde çizilir.
- PRO olmayanlar logoyu gizleyemez ve üstüne overlay koyamaz (overlay alanın dışına itilir). PRO üyeler Yayın düzenleri'nde logoya tıklayıp "SRTR Pitwall logosunu göster" anahtarıyla ya da araç satırındaki "Logo" kutusuyla gizleyebilir. Yönetim › PRO özellikleri: "Yayın düzeninde SRTR Pitwall logosunu gizleyebilmek".

## 041026-110

- **Hız ve bellek:** panel artık açılışta sayfaların yalnızca gerekenini yükler (açılışta yüklenen kod 2,03 MB → 0,94 MB; diğer sayfalar ilk açıldıklarında yüklenir). Çeviri araması hızlandı. Motor, ayarları her saniye kopyalamıyor ve aynı veriyi birden çok alıcıya tek seferde hazırlıyor; ses iş parçacığı boştayken uyanmıyor. Görünüm ve davranış değişmedi.
- **Üst üste overlay'ler (düzen tuvali ve ekranda düzenleme):** kilitli overlay sol tıkı altındaki kilitsiz overlay'e geçirir; aynı noktaya yeniden tıklamak alttaki overlay'i seçer; seçili olan üstte çizilir. Sürükleme 3 px hareketten sonra başlar.
- **Ok tuşları:** seçili overlay 1 px (Shift ile 10 px) taşınır.
- **Arkadaş sohbeti:** karşı taraf yazarken "… yazıyor…" görünür (program ve site).
- **Pist Haritası / Mini Harita:** "1 tur attıktan sonra harita görünecek".

## 041026-109

- **Overlay sağ tık menüsü (ekranda düzenleme ve düzen tuvali):** "Kilitle / Kilidi aç" artık menünün en üstünde.

## 041026-108

- **Overlaylarım:** overlay sayısı artık seçili ya da bağlı oyunda çalışan overlay'leri sayar (Otomatik'te ve oyun bağlı değilken hepsi listelenir ve sayılır).
- **Önizleme:** sol üst köşede overlay'in çalıştığı oyunlar yazılı etiketlerle gösterilir (iRacing, ACC, AC, LMU / rF2, AMS2; hepsinde çalışıyorsa "Tüm oyunlar").

## 041026-107

- **"Yayın bilgisi" kaldırıldı** (başlık, oyun / kategori, kapak ve planlama): sekme, sol menü düğmesi ve ayarları yok. API girişi yeniden yalnızca sohbet izinlerini ister (Twitch ve Kick'te ek izin istenmez).

## 041026-106

- **Yayın bilgisi / Sohbete yaz API istekleri:** ağ hatasında istek bir kez yeniden denenir ve hata metni artık asıl nedeni de yazar (zaman aşımı, bağlanılamadı, TLS…).
- Hata kutuları dar alanda kelime kelime alt alta dizilmiyor.
- **Yayın bilgisi:** "Sol menüde ayrı düğme olarak göster" artık diğer ayarlardaki gibi anahtar (aç / kapat) görünümünde; varsayılan kapalı.

## 041026-105

- **Sohbete yaz › Gelişmiş: kendi API uygulamam:** her platformda "Geliştirici sayfasını aç" bağlantısı (Twitch, Google Cloud, Kick); YouTube için "YouTube Data API v3'ü etkinleştir" bağlantısı. YouTube açıklaması düzeltildi: "Masaüstü uygulaması (Desktop app)" türünde dönüş adresi alanı yoktur ve gerekmez.
- **Yayın bilgisi:** "Sol menüde ayrı düğme olarak göster" kutusu; açıkken Yayın bilgisi sol menüde kendi düğmesiyle açılır ve Canlı Sohbet sekmelerinden kalkar.

## 041026-104

- **Sohbete yaz › Bağlantıyı test et:** sohbet kutusu bulunup kapalıysa artık sayfada yazan neden de gösterilir (ör. kuralları kabul et, takip et, hesabı doğrula) ve pencereyi açıp adımı tamamlaman söylenir.

## 041026-103

- **Canlı Sohbet › Yayın bilgisi (PRO):** bağlı API hesaplarına yayın başlığı ve oyun / kategori uygulanır (Twitch, YouTube, Kick); YouTube için açıklama ve kapak resmi; planlama: YouTube'da planlı yayın oluşturma / düzenleme / silme, Twitch takvimine ekleme; adlandırılmış şablonlar. "Gelişmiş: kendi API uygulamam" ile bağlı hesap gerekir.
- **Yönetim › Mesajlar:** üyelerin tüm sohbetleri tarihe göre (arkadaş, takım, grup, açık ekip odaları); türe, üyeye, tarihe ve metne göre arama / süzme; salt okunur; her görüntüleme moderasyon kayıtlarına yazılır (c80). Site yönetim panelinde de var.

## 041026-102

- **Kendiliğinden kapanma düzeltildi:** bilgisayar açıldıktan sonraki ilk 10 dakika içinde program başlatılınca telemetri iş parçacığındaki bir zaman hesabı programı kapatıyordu (Windows açılışında tepside başlatmada sessizce). Ayrıca yayın sürümünde herhangi bir iç hata programı tümden kapatıyordu; artık hatalı kare atlanır, iş parçacıkları yeniden başlar ve ayrıntı `crash.log` dosyasına yazılır (%APPDATA%\com.pitwall.overlay).
- **Sohbete yaz — tarayıcı girişi:** her üye Twitch / YouTube / Kick'e program içindeki pencerede kendi hesabıyla giriş yapar; yönetici ayarı, uygulama anahtarı ve sunucu işlevi gerekmez. Yönetim'deki Client ID ayarları kaldırıldı. İsteyen için "Gelişmiş: kendi API uygulamam" bölümü duruyor.
- **Açılışta overlay'lerin görünüp kaybolması:** overlay penceresi artık durum bilinene kadar hiçbir şey çizmez ve panel önizleme verisini ekrana yansıtmaz; Hedef Çubuğu, Start Işıkları ve Yarış Sonucu yalnızca gerçek Demo'da örnek gösterir.
- **Bağlantı göstergesi:** üst barda tek renkli nokta (kırmızı: bağlı değil, sarı: Demo, yeşil: bağlı); üzerine gelince oyun, pist, oturum ve araç bilgisi.
- **Canlı Sohbet:** "Uygulama açılınca sohbeti başlat" varsayılan açık; varsayılan üç kanal ★ işaretli.

## 041026-101

- **Sağ tık menüsü (düzen tuvali, ekranda düzenleme):** menü her zaman görünen alanın içinde kalır; aşağıda yer yoksa yukarı açılır, sığmıyorsa fare tekeriyle kayar ("Sil" artık hep erişilebilir).
- **Sıralama Tablosu ve Yakındakiler:** kendi satırındaki sütunlar diğer satırlarla aynı hizada (kalın yazı sütun genişliğini büyütüyordu).
- **Sesli Mühendis:** pitteyken (pit yolu, pit kutusu ve çıkıştan sonraki ilk saniyeler) trafik çağrıları susar: tur bindirme, fark, mavi bayrak, geçiş. "Arkadaki araç tur bindiriyor" çağrısı pistte de en çok 75 saniyede bir ve her araç için bir kez söylenir. Pitten çıkınca konum bir kez özetlenir.
- **Arkadaş listesi:** arkadaş menüsündeki "Sesi kapat" kaldırıldı. Rahatsız etme'de ekip odası mesajlarının sesi ve bildirimi de gelmez. Yöneticinin gördüğü gizli (çevrimdışı görünen ama uygulamada olan) üyeler mor renkte ve "Çevrimdışı (gizli)" olarak görünür.

## 041026-100

- **Ekip pitwall'ı:** yarıştaki arkadaşın pitwall'ında yeni sekmeler: Live Timing, Mühendis, Olaylar — sürücünün kendi gördüğü ekranlar, salt okunur (Tekrar / kamera düğmeleri yok). Veri yaklaşık 3 saniyede bir gelir (c79). Sitedeki / telefondaki ekip sayfasında da sade tablolar olarak var.
- **Demo:** artık ses çıkarmaz; üst bardaki "Ses" düğmesi kaldırıldı. Durum göstergesi Demo'da "Bağlı değil · Demo" yazar (bağlıymış gibi görünmez).
- **Sesli mühendisi sustur / aç kısayolu:** varsayılan Ctrl+Shift+S (eski varsayılan Ctrl+Shift+V'de ya da boş olanlar bir kez taşınır).
- **Mesajlar overlay'i:** Demo kapatılınca örnek mesajlar hemen kalkar; ekip mesajları "Pit Ekibi {ad}" olarak gösterilir ve okunur.
- Üst bardaki güncelleme düğmesi kaldırıldı (güncelleme kendiliğinden denetlenir).

## 041026-99

- **Arkadaş listesi (Steam gibi):** çevrimiçi olanların adı mavi, yarışta olanlar en üstte ve yeşil; yarışta olanın altında oyun, oturum, pist ve araç yazar. Ad altında sohbet mesajı gösterilmez (grup ve takım odalarında da yalnızca üye sayısı). Sitede de yarış satırına oyun, oturum ve araç eklendi.

## 041026-98

- **Arkadaş listesi (program ve site):** çevrimiçi arkadaşın adı mavi, yarıştaki yeşil, çevrimdışı gri. Adın altında artık son mesaj değil durum yazar (Çevrimiçi, yarıştaysa pist / oturum, çevrimdışıysa son görülme); okunmamış mesaj sayısı sağda kalır.

## 041026-97

- **Kısayol bildirimi:** bir kısayola basınca artık yalnızca üst ortadaki yeni bildirim çıkar; aynı işlem için panelin sağ altındaki bildirim ve overlay penceresindeki eski üst bildirim gösterilmez ("Kısayol bildirimi göster" kapalıysa eskiler çalışmaya devam eder).

## 041026-96

- **Mesajlar overlay'i:** örnek mesajlar artık yalnızca gerçek Demo modunda ya da düzenleme modunda görünür (panel açıkken gelen önizleme verisi Demo sayılıyordu). OBS / VR tekil görünümünde oyun kapalıyken "iRacing kapalıyken de göster" işaretli değilse çizilmez.
- **Düzenler / Yayın düzenleri:** ayar paneli açılınca tuval küçülüp panelin sağına geçer (panel artık tuvalin üstünü örtmez).
- **Sesli Mühendis:** telsiz kontrolü varsayılan olarak kapalı (mevcut kurulumlarda da bir kez kapatılır).
- **Yönetim › Görünürlük › Menü görünürlüğü:** bölümlerin alt sayfaları üyelerden gizlenebilir; Lig Kategorileri varsayılan olarak gizli (c77). Site yönetim panelinde de var.
- **Arkadaş sağ tık menüsü:** "Canlı veri", "Ekibe ekle", "Pit ayarlarını değiştirebilir", "Mesajlarını kapat" ve "Overlay'de gizle" kaldırıldı. Tek seçenek: "Güvenilir yap" — güvenilir arkadaş pitwall'a girebilir ve pit ayarlarını değiştirebilir (c78). Kapatılmış mesajlar yeniden açıldı.
- **Profil:** sağ tık › Profil, Telemetri sayfasındaki yarışçı profilini açar; telemetri gizliyse ya da veri yoksa da profil kartı görünür. Profilden kategori (Road vb.) ve iR değeri kaldırıldı (sitede de).

## 041026-95

- **Sohbete yaz (YouTube / Kick) girişi:** chat-oauth işlevi oturumu artık kendisi doğruluyor (sürüm 3; işlevde "Verify JWT" KAPALI olmalı). Sağlayıcıdan dönen hata artık hemen gösteriliyor (önceden 5 dakika sessizce bekliyordu), yerel giriş adresi tarayıcı açılmadan önce açılıyor, YouTube için yedek portlar (8768 / 8769), Kick izin denetimi adresi düzeltildi. Her platformda "Son hata" satırı ve anahtar içermeyen "Günlüğü kopyala".
- **Canlı Sohbet overlay'i › Mesaj yazma kutusu:** en altta solda kanal, sağında yazma kutusu. Tab / Shift+Tab: sonraki / önceki yazılabilir kanal, Enter: gönder, Esc: çık.
- **Overlay kilidi:** düzendeki overlay'e sağ tık › Kilitle; kilitli overlay taşınamaz, boyutlandırılamaz, silinemez (tuvalde ve ekranda düzenlemede).
- **Düzen kilidi:** kilitli düzende ekleme, çıkarma, taşıma, Delete ve "Ekranda düzenle" denenince "Bu düzen kilitli…" uyarısı çıkar.
- **Delete:** Düzenler ve Yayın düzenleri tuvalinde seçili overlay'i siler (Ctrl+Z geri alır).
- **Kısayol bildirimi:** bir kısayola basınca ekranın üst ortasında, diğer pencerelerin üstünde yapılan işlem ve yeni durum kısa süre görünür (Kısayollar › "Kısayol bildirimi göster", varsayılan açık).

## 041026-94

- **Mesajlar overlay'i:** Demo'da yine örnek mesajlar oynar; gerçek bir mesaj geldiği anda örnekler kalkar ve o mesaj ekrandan silinene kadar geri gelmez.
- **Yakındakiler ve Sıralama Tablosu:** pencere artık sabit yükseklikte; araç sayısı değişince kaymaz. Yakındakiler'de sen her zaman tam ortadasın (araç azsa boş satır bırakılır). Düzenleme modunda alt / üst kenardan sürükleyince satır sayısı artar / azalır.
- **Overlaylarım:** sıralama seçimi (En çok kullanılanlara göre — varsayılan, Kategoriye göre, Harf sırasına göre, Kendi sıram); kategori adına tıklayınca altındakiler gizlenir. Sıra Düzenler ve Yayın sayfalarındaki listede de geçerli.
- **Kullanım istatistiği (c76):** düzenlerde hangi overlay türlerinin açık olduğu (yalnızca tür ve sayı) sunucuda tutulur; "En çok kullanılanlar" sırası buna göre belirlenir.

## 041026-93

- **Overlaylarım:** listede çift tık da overlay'i seçili düzene ekler ("+ Overlay Ekle" ile aynı).
- **Düzenler / Yayın düzenleri:** overlay ayarları artık overlay listesinin hemen sağında, tuvalin üstünde yüzen panelde açılır; tuval küçülmez. Esc ya da X ile kapanır. Bir kez eklenebilen overlay eklendikten sonra "eklenebilir" listesinde görünmez.
- **Sürücü algılama:** izleyici, spotter / ekip olarak başkasının aracına katılan ya da tekrar dosyası izleyen üye artık "yarışta" görünmez; canlı verisi yayınlanmaz, pitwall'ı ekip listesinde çıkmaz ve uzaktan pit komutu kabul etmez (iRacing, LMU / rF2; ACC / AC / AMS2'de yalnızca tekrar algılanır).
- **Sesli komut ve Sesli Mühendis:** PRO olmayanlarda ayarlar açık görünür ama kilitlidir (çalışmaz, değiştirilemez).
- **Sesli komut tanıma motoru:** Otomatik / Windows / Çevrimiçi (Whisper). Windows'ta Türkçe tanıyıcı olmadığı için Türkçe komutlar çevrimiçi motorla tanınır (API anahtarı gerekir; anahtar alanı sesli komut bölümünde).
- **Direksiyon tuşuyla bas-konuş:** birden çok HID raporu gönderen direksiyonlarda basılı tutma kesiliyordu; bırakma 80 ms gecikmeyle sayılır; tuş basılıyken "Basılı: dinliyor" göstergesi.
- **Anket kısayolu (F9):** basılı tutunca mikrofon kendiliğinden dinlenir (altyazı kapalıyken de), söylenen soru alanına yazılır, bırakınca anket başlar; soru anlaşılmazsa ya da kısa dokunuşta anket başlamaz.
- **Konuşma → yazı / sesli okuma varsayılanları:** motor Çevrimiçi (Whisper), kaynak "ikisi", altyazı ve sesli okuma açık (PRO olmayanlarda kilitli). API anahtarı yoksa Windows motoruna düşer ve uyarı gösterir.
- **OBS sohbet kaynağı:** önerilen boyut 600 × 400; sohbet kaynağın tamamını doldurur.

## 041026-92

- **Mesaj bildirimi:** gelen arkadaş mesajında sağ alttaki bildirim kartı artık panel öndeyken de çıkar (yalnızca o sohbet açıksa çıkmaz); panel tepsideyken bağlantı 15 saniyede bir canlı tutulur, kaçan mesajlar için yedek denetim var. Bildirim sesi daha belirgin; ses aygıtı açılamazsa Windows sistem sesi çalar. Rahatsız etme'de kart, ses ve tepsi işareti gelmez.
- **Tepsi simgesi:** sol tık her zaman program arayüzünü açar (okunmamış mesaj varsa arkadaş listesiyle birlikte).
- Sorun giderme için `social.log` (mesaj metni içermez).
- **Ekip:** listede yalnızca şu an yarışta olan ve seni ekibine eklemiş arkadaşların görünür; yarıştan çıkınca listeden düşer ve oda sohbeti silinir. Bir sürücünün aynı anda tek spotter'ı olur: pit ayarlarını yalnızca o değiştirir ve odaya yalnızca o yazar; diğerleri sadece izler (c75). Site / telefon ekip sayfası da aynı kurallarla çalışır.
- İnternet yokken ya da sunucu hatasında oturum artık kapanmıyor (yalnızca sunucu oturumu reddederse kapanır).

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
