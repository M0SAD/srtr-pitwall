# SRTR Pitwall — Geliştirici belgesi

Hafif ve hızlı iRacing overlay uygulaması. **Tauri 2 + Rust + SolidJS** ile yazıldı.

- Tüm telemetri okuma ve hesaplama Rust'ta, tek bir arka plan iş parçacığında yapılır.
- Overlay'ler monitör başına tek bir şeffaf pencerede çizilir (her overlay için ayrı pencere açılmaz); birden
  fazla monitör desteklenir, her overlay'in monitörü Düzenler sayfasında seçilir.
- Her overlay sadece ihtiyaç duyduğu veriyi, kendi belirlediği sıklıkta alır (ör. pedallar 60 Hz, sıralama 3 Hz).
- `src/overlays/` klasörüne yeni bir klasör eklemek, overlay'in kontrol panelinde görünmesi için yeterlidir.
- Üyeliksiz tam çalışır. İsteğe bağlı Supabase hesabıyla ayarlar buluta yedeklenir.
- **Görünüm/tema sistemi:** font, renkler, opaklık, köşe, satır yoğunluğu ve genel boyut tek yerden değişir,
  tüm overlay'lere anında uygulanır. 6 hazır tema (Varsayılan, Gece Mavisi, Karbon, Açık, Yüksek Kontrast, Neon).
- **Düzenleme ekranı:** ızgaraya ve diğer overlay'lerin/ekranın kenarlarına yapıştırma, kılavuz çizgileri,
  ekran dışına taşımayı engelleme, her çerçevede kapatma düğmesi.

## Hazır overlay'ler

| Overlay | İçerik |
|---|---|
| Yakındakiler (Relative) | Önündeki/arkandaki araçlar: fark, stint/PIT/OUT, lisans+SR, iRating ve tahmini değişim, son tur, bayraklar; hava ve SOF satırları |
| Leaderboard | Çok sınıflı sıralama, sınıf SOF'u, ülke, marka, iRating, fark/aralık, 5 tur ort., en iyi tur |
| Yakıt Hesaplayıcı | Son/ort.5/ort.10 tüketim tablosu, ikmal, hedef tüketim, kalan tur, pit penceresi |
| Telemetri Paneli | Vites halkası, devir ışıkları, hız, pozisyon değişimi, son tur, yakıt, sıcaklık, ABS/TC/BB |
| Pedallar & Girdi | Gaz/fren/debriyaj izi (yumuşak grafik seçeneği), vites, hız, direksiyon |
| Delta Bar | En iyi tura göre fark, eğilim, tur süreleri |
| Radar | Kuşbakışı radar; araç blokları boyuna konuma göre hareket eder |
| Çubuk Spotter | Sol / sağ ince çubuklar: sadece yanında araç olan taraf yanar, işaret aracın arkadan öne ilerleyişini gösterir |
| Pist Haritası / Mini Harita | Otomatik kaydedilen pist şekli üzerinde araçlar |
| Canlı Hava | Rüzgâr pusulası, sıcaklıklar, nem, yağış, pist ıslaklığı |
| Oturum & Bayraklar, DigiFlags | Bayrak uyarıları, kalan süre/tur, LED matris bayrak |
| Olay Sayacı, Battle Box, Data Frame, Webview | Olay/sınır, önündeki-arkandaki mücadele, tek değer kutusu, web sayfası |
| Lastikler | Dört lastiğin iç/orta/dış sıcaklığı, kalan diş, soğuk basınç (iRacing pitte günceller) |
| Tur Süreleri | Son turlar, 3 sektör, en iyiye fark, yakıt, geçersiz/pit turları, teorik en iyi tur |
| Olay Günlüğü | Her olay puanı: saat, tur, sektör, tür (pist dışı / kontrol kaybı / temas) |
| Pit Hızı | Pit hız sınırına göre hız, sınırlayıcı uyarısı |
| Hızlı Sınıf Uyarısı, Piste Dönüş | Arkadan gelen hızlı sınıf araçları; pist dışından güvenli dönüş yardımcısı |
| Düz Harita, Viraj Analizi | Düz şerit pist haritası; en iyi tura göre viraj en düşük hız karşılaştırması |
| Twitch Sohbeti, Sahne | Yayın için sohbet ve başlıyor/ara/bitiş/garaj ekranları |

Araçlar: **Pitwall Paneli**, **Live Timing** (tekrar/kamera düğmeli yarış kontrol akışı), **OBS tarayıcı kaynağı**
(yerel web sunucusu), **Layout Manager** (araca/oturuma göre otomatik düzen, spotting ve yayın düzenleri),
**MQTT** (dahili sunucu + istemci, takım yakıt paylaşımı), **League Builder** (lig kategorileri), **araç markası logoları**,
**Arkadaşlar** (aynı yarıştaki arkadaşlar renkli/simgeli), **Topluluk** (düzen paylaşımı, arama, puan, yorum),
**hesap ve PRO üyelik** (Patreon/Ko-fi aboneliği, yönetici paneli), **Sesli Mühendis ve Spotter** (PRO; bilgisayardaki
CrewChief ses paketiyle), **Mühendis ekranı** (tablet/tarayıcı için döngülü ekranlar), **oturum kayıtları ve yarış özetleri**,
**uzak telemetri**.

## Kurulum (Windows)

Bir kez kurulması gerekenler:

1. **Node.js 20 veya üstü** — https://nodejs.org
2. **Rust** — https://rustup.rs (varsayılan `x86_64-pc-windows-msvc` araç zinciri)
3. **Visual Studio C++ Build Tools** — "Desktop development with C++" iş yükü
   (Rust kurulumu bunu yoksa zaten önerir)
4. **WebView2** — Windows 10/11'de zaten yüklü.

Ayrıntılı kılavuz: https://v2.tauri.app/start/prerequisites/

## Çalıştırma ve exe üretme

```bat
npm install

:: Geliştirme: değişiklikler anında görünür (sıcak yeniden yükleme)
npm run app:dev

:: Sürüm derlemesi: optimize edilmiş exe + kurulum dosyaları
npm run app:build
```

Ya da kök klasördeki **`build.bat`** dosyasına çift tıkla; bağımlılıkları kurar ve derler.

Derleme bitince:

- Taşınabilir exe: `src-tauri\target\release\pitwall.exe`
- Kurulum dosyası: `src-tauri\target\release\bundle\nsis\SRTR Pitwall_0.1.0_x64-setup.exe`
- MSI: `src-tauri\target\release\bundle\msi\SRTR Pitwall_0.1.0_x64_en-US.msi`

İlk sürüm derlemesi Rust bağımlılıkları yüzünden birkaç dakika sürer; sonrakiler hızlıdır.

## Kullanım

- iRacing'i **Kenarlıksız pencere (Borderless / Windowed Fullscreen)** modunda çalıştır. Özel tam ekran modunda
  Windows hiçbir pencerenin oyunun üstünde görünmesine izin vermez; bu, tüm overlay uygulamaları için geçerlidir.
- Uygulama açılınca overlay'ler iRacing bağlandığında kendiliğinden görünür.
- **Demo** anahtarı iRacing olmadan sahte bir 24 araçlı çok sınıflı yarış oynatır; overlay tasarlarken kullan.
- **Ctrl+Shift+E**: yerleşimi düzenle (sürükle, sağ alt köşeden boyutlandır, ✕ ile kapat). Tekrar basınca biter.
  Taşırken **Alt** basılı tutulursa yapıştırma geçici olarak kapanır.
- **Ctrl+Shift+D**: overlay'leri gizle/göster.
- **Ctrl+Shift+Boşluk**: kontrol panelini öne getir (düzenleme modunda panel overlay'lerin üstünde kalır).
- Kısayolların hepsi **Genel ayarlar → Kısayollar**'dan değiştirilebilir.
- Düzenleme modunda bir overlay'e **sağ tıkla**: ortala, köşelere yerleştir, boyutu sıfırla, ayarlarını aç.
- Aynı anda tek SRTR Pitwall çalışır. **Windows ile başlat** seçeneği Genel ayarlarda; bu şekilde başlayınca sadece
  tepside çalışır.
- Kontrol paneli kapatılınca uygulama sistem tepsisinde çalışmaya devam eder (panel belleği boşaltılır).
  Tepsi simgesine tıklayınca panel yeniden açılır; tamamen kapatmak için tepsi menüsünden **Çıkış**.
- Profiller: farklı araçlar/seriler için ayrı yerleşimler oluşturup aralarında geçiş yapabilirsin.

- **Pist haritası:** iRacing pist şeklini vermez; uygulama bir pistteki ilk temiz turunda (pite girmeden, pist
  dışına çıkmadan) şekli kendisi çıkarır ve saklar. Harita ters görünürse overlay ayarlarındaki "Aynala"yı aç.
  Kayıtlar: `%APPDATA%\com.pitwall.overlay\tracks\`
- **OBS:** Araçlar → Web sunucusu'nu aç, verilen adresi OBS'te Tarayıcı Kaynağı olarak ekle (1920×1080).
- **Marka logoları:** 46 markanın logosu uygulamayla birlikte gelir (`src/assets/carlogos/`); kullanıcının ayrıca
  dosya koyması gerekmez (eski `logos` klasörü artık okunmaz). Logosu olmayan markada marka adı yazılır.
- **Takım yakıt paylaşımı (MQTT):** Araçlar → MQTT. Takımdan biri "MQTT sunucusunu çalıştır"ı açar (port 1883,
  internetten bağlanılacaksa modemde port yönlendirmesi gerekir) ya da ortak bir MQTT sunucusu kullanılır. Herkes
  istemciyi açıp aynı sunucu adresini ve aynı **takım adını** yazar. Sürüş yapanın yakıtı Yakıt overlay'inin
  altında ve Pitwall'da herkese görünür.
- **Arkadaşlar:** iRacing adını (ve istersen üye numarasını) eklediğin kişiler Relative, Leaderboard, Live
  Timing ve haritalarda kendi renginle, haritada simge ya da fotoğrafla görünür. Aynı oturumdaysanız listeden
  tek tıkla eklenir.
- **Hesap ve Topluluk:** kurulum [docs/SUPABASE.md](SUPABASE.md). Hesapla düzenlerini paylaşırsın; başkaları
  adına, iRacing adına ya da çözünürlüğe göre arar, ekran şemasını görür, tek tıkla profil olarak indirir, yıldız
  ve yorum bırakır.
- **PRO:** yönetici seçtiği overlay'leri PRO yapar; PRO olmayanlarda kilitli olur. Ödeme Patreon/Ko-fi ile,
  kurulum [docs/PRO.md](PRO.md).
- **League Builder:** lig yarışlarında iRacing sınıfları yerine Pro / Pro-Am / Am gibi kategoriler. Sürücüleri
  sürükle-bırak ile ata, iRacing sınıflarına göre varsayılan ver, lig kimliği girersen sadece o ligde çalışır.
  Yapılandırma dışa/içe aktarılarak lig arkadaşlarıyla paylaşılabilir.

Ayarlar şurada saklanır: `%APPDATA%\com.pitwall.overlay\settings.json`

## Ekran görüntüleri

- Oyundayken **Print Screen** (Ayarlar → Kısayollar'dan değiştirilebilir) ekranı overlay'lerle birlikte
  `Resimler\SRTR Pitwall` klasörüne kaydeder ve yönetici filigranını ekler (`src-tauri/src/shots.rs`).
- Filigran arayüzde canvas ile çizilir (`src/sdk/watermark.ts`) ve PNG olarak Rust'a gönderilir; Rust görüntü
  yüksekliğine göre ölçekleyip bindirir. Ayarı `app_config.watermark` (Hesap → Yönetici).
- Toplulukta paylaşılan görseller Supabase Storage'daki herkese açık `screenshots` kovasında
  (`<kullanıcı id>/<id>.jpg` + `_t.jpg` küçük resim); bilgiler `screenshots`, `screenshot_ratings`,
  `screenshot_comments` tablolarında (`supabase/schema.sql`).
- Düzenleme ekranı arka planı ayar klasöründe `edit-backdrop.jpg` olarak tutulur.

## Diller ve çeviri

Arayüz 15 dilde (Ayarlar → Genel → Dil). Kaynak dil Türkçe: metinler kodda Türkçe yazılır ve
çeviri anahtarı da bu Türkçe metindir. Çeviriler `src/locales/<dil>.json` dosyalarında.

- Panel ve overlay'lerdeki görünen metinler DOM çevirmeniyle kendiliğinden çevrilir; kodda
  gereken yerlerde `t("Metin {0}", değer)` kullanılır (`src/sdk/i18n.ts`). Çevrilmemesi gereken
  alanlara (sürücü adı, bayrak kodu…) `data-no-i18n` eklenir.
- Rust tarafı (tepsi, pencere başlıkları, oturum özeti) çevirileri `i18n_set` komutuyla alır.
- Yeni metin ekledikten sonra: `node scripts/i18n/extract.mjs --missing` eksikleri listeler;
  kurallar `scripts/i18n/TRANSLATING.md` dosyasında.
- E-posta şablonları çok dilli: `node supabase/templates/build.mjs` ile üretilir, kullanıcının
  dili Supabase'de `user_metadata.lang` alanında tutulur.

## Sürümler ve güncelleme

Sürüm biçimi `GGAAYY-NN` (ör. `290926-01`). Değişiklikler `SURUM_NOTLARI.md` dosyasında. Sürüm yükseltme ve
otomatik güncellemenin kurulumu: [docs/GUNCELLEME.md](GUNCELLEME.md)

## Proje yapısı

```
pitwall/
├─ src-tauri/                 Rust çekirdek
│  ├─ src/sdk.rs              iRacing paylaşımlı bellek okuyucu (Windows)
│  ├─ src/session.rs          Session YAML ayrıştırıcı (sürücüler, sınıflar, oturumlar)
│  ├─ src/model.rs            Normalize veri modeli (Frame, SessionData)
│  ├─ src/calc.rs             Relative, standings, yakıt, delta, radar hesapları
│  ├─ src/engine.rs           Telemetri iş parçacığı + abonelik tabanlı yayın
│  ├─ src/demo.rs             Sahte yarış üretici
│  ├─ src/league.rs           League Builder (kategori uygulama, sınıf içi sıra)
│  ├─ src/mqtt.rs             MQTT sunucusu/istemcisi, takım yakıt paylaşımı
│  ├─ src/logos.rs            Kullanıcının marka logoları klasörü
│  ├─ src/entitlement.rs      PRO durumu (diske yazılır, çevrimdışı da geçerli)
│  └─ src/lib.rs              Pencereler, komutlar, tepsi, kısayollar, ayar dosyası
├─ src/
│  ├─ app/                    Kontrol paneli (Overlay'ler, Görünüm, Araçlar, League Builder, Genel, Hesap)
│  ├─ host/                   Şeffaf overlay penceresi, düzenleme modu, snap.ts (yapıştırma)
│  ├─ sdk/                    Ortak API: ayarlar, telemetri, theme.ts (tema), fonts.ts
│  ├─ cloud/supabase.ts       İsteğe bağlı bulut senkronizasyonu
│  └─ overlays/               ← Overlay'ler burada
│     ├─ relative/  standings/  fuel/  delta/  inputs/  radar/  session/
│     └─ _template/           Yeni overlay için şablon (yüklenmez)
├─ supabase/schema.sql        Bulut şeması (hesap, paylaşım, PRO)
├─ supabase/functions/        pro-webhook: Patreon/Ko-fi ödeme bildirimi
└─ docs/
   ├─ OVERLAY_YAZMA.md        Yeni overlay nasıl eklenir
   ├─ SUPABASE.md             Hesap/bulut kurulumu (adım adım)
   └─ PRO.md                  PRO üyelik ve ödeme kurulumu
```

## Yeni overlay eklemek

`src/overlays/_template` klasörünü kopyala, adını değiştir (ör. `laptimer`), `manifest.ts` içindeki `id`'yi
klasör adıyla aynı yap. `npm run app:dev` açıkken kaydettiğin an kontrol panelinde belirir. Ayrıntılar:
[docs/OVERLAY_YAZMA.md](OVERLAY_YAZMA.md)

## Performans notları

- **Tek render süreci:** iki pencere `--renderer-process-limit=1` ile aynı WebView2 render sürecini paylaşır.
  İstersen `src-tauri/tauri.conf.json` ve `src-tauri/src/lib.rs` içindeki `BROWSER_ARGS`'tan kaldırabilirsin
  (ikisi aynı olmalı).
- **Gizli pencere = sıfır çizim:** iRacing bağlı değilken overlay penceresi tamamen gizlenir.
- **Abone olunmayan veri hesaplanmaz:** kapalı bir overlay'in verisi Rust'ta hiç üretilmez.
- **Tembel yükleme:** kapalı overlay'lerin kodu overlay penceresine hiç yüklenmez.
- **Sanal DOM yok:** SolidJS yalnızca değişen metin düğümünü günceller; pedal izi Canvas ile çizilir.
- **Sürüm profili:** `lto = "fat"`, `codegen-units = 1`, `opt-level = 3`, `panic = "abort"`, `strip = true`.
- CSS'te `backdrop-filter`/bulanıklık ve sürekli animasyon kullanılmaz (GPU'yu oyunla paylaşmamak için).

## Sonraki adımlar için fikirler

VR'da gösterim, pit limit uyarısı, çok sınıflı geçiş uyarısı, hibrit enerji (GTP), tur geçmişi / stint analizi,
diğer simülasyonlar (ACC, LMU, AMS2) için veri kaynakları.
