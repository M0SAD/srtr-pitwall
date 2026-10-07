// Özellikler sayfası: bütün overlay'ler (src/overlays/*/manifest.ts), Canlı Sohbet, Sesli Mühendis, Topluluk, sosyal,
// araçlar, simülasyon uyumluluğu (src/overlays/simSupport.ts) ve ücretsiz / PRO ayrımı (src/sdk/proFeatures.ts varsayılanları).
// Metinler Türkçe + İngilizce burada (addDict); diğer diller assets/lang/<kod>.json. "a|b|c" biçimindeki anahtarlar listedir.
// Sayılar: OVERLAYS.length (manifest sayısı), VOICE (src-tauri/src/voice_catalog.json), 46 marka logosu (src/assets/carlogos).
// Yeni overlay eklenince overlays.js'e (OVERLAYS, ad, galeri metni) ve buradaki ov_<id>_d/_h anahtarlarına eklenmeli.
import { $, $$, T, addDict, appConfig, applyLang, boot, esc } from "./core.js";
import { applyCachedImages, initSiteImages } from "./siteimages.js";
import { OVERLAYS, OVERLAY_ROUND } from "./overlays.js";

/** voice_catalog.json: toplam ifade, mühendisin kullandığı, bunların içindeki sayı/süre parçaları, kullanılan ifadelerin kayıt sayısı */
const VOICE = { catalog: 2255, used: 1501, numbers: 944, spoken: 557, recordings: 3739, categories: 22 };
const LOGOS = 46;
const LANGS = 15;

// Overlay listesi, adları (ov_<id>_n) ve grup başlıkları: overlays.js (ana sayfa galerisiyle ortak)
const OVERLAY_COUNT = OVERLAYS.reduce((n, g) => n + g[1].length, 0);

// simSupport.ts: 1 = çalışır, 2 = kısmen, 0 = çalışmaz. Sıra: iRacing, ACC, AC, LMU/rF2, AMS2
const SIMS = [
  ["fx_si_r1", 1, 1, 1, 1, 1],
  ["fx_si_r2", 1, 2, 2, 1, 1],
  ["fx_si_r3", 1, 1, 2, 1, 1],
  ["fx_si_r4", 1, 2, 1, 1, 2],
  ["fx_si_r5", 1, 0, 0, 1, 1],
  ["fx_si_r6", 1, 1, 0, 1, 1],
  ["fx_si_r7", 1, 0, 0, 1, 1],
  ["fx_si_r8", 1, 1, 0, 0, 0],
  ["fx_si_r9", 1, 2, 2, 2, 2],
  ["fx_si_r10", 1, 0, 0, 0, 0],
  ["fx_si_r11", 1, 0, 0, 0, 0],
  ["fx_si_r12", 1, 1, 1, 1, 1],
  ["fx_si_r13", 1, 2, 2, 2, 2],
  ["fx_si_r14", 1, 0, 0, 1, 0],
  ["fx_si_r15", 1, 2, 0, 1, 2],
  ["fx_si_r16", 1, 0, 0, 0, 0],
];

const TOC = ["overlays", "livechat", "voice", "community", "social", "tools", "sims", "pro"];
const COMMUNITY = [
  ["🧩", "fx_co1"],
  ["📺", "fx_co2"],
  ["📸", "fx_co3"],
  ["🎨", "fx_co4"],
  ["🎛️", "fx_co5"],
];
const SOCIAL = [
  ["👥", "fx_so1"],
  ["💬", "fx_so2"],
  ["🗨️", "fx_so3"],
  ["🛡️", "fx_so4"],
  ["📡", "fx_so5"],
  ["🎧", "fx_so7"],
  ["🪪", "fx_so6"],
];
// [anahtar, görsel yuvası ("" = yok), çizim türü]
const TOOLS = [
  ["fx_to1", "feat.telemetry", "trace"],
  ["fx_to2", "feat.shots", "shot"],
  ["fx_to3", "feat.layouts", "layout"],
  ["fx_to4", "feat.stream", "stream"],
  ["fx_to5", "feat.vr", "vr"],
];
const EXTRAS = [
  ["🏷️", "fx_ex1"],
  ["🌍", "fx_ex2"],
  ["🖥️", "fx_ex3"],
  ["🎬", "fx_ex4"],
  ["🧪", "fx_ex5"],
  ["🔄", "fx_ex6"],
];

addDict({
  fx_hero_eyebrow: ["Özellikler", "Features"],
  fx_hero_title: ["SRTR Pitwall'da <span class=\"accent\">neler var?</span>", "Everything <span class=\"accent\">inside SRTR Pitwall</span>"],
  fx_hero_lead: [
    "Overlay'ler, canlı sohbet, sesli mühendis, topluluk paylaşımları, arkadaşlar ve takımlar, telemetri, yayın ve VR — hepsi tek, hafif bir uygulamada. Bu sayfada her birinin öne çıkan özelliklerini bulursun.",
    "Overlays, live chat, a voice engineer, community sharing, friends and teams, telemetry, streaming and VR — in one lightweight app. This page walks through the highlights of each.",
  ],
  fx_download: ["⬇ Ücretsiz indir", "⬇ Download free"],
  fx_see_pro: ["PRO fiyatları", "PRO pricing"],
  fx_st_overlays: ["overlay", "overlays"],
  fx_st_sims: ["simülasyon", "sims"],
  fx_st_langs: ["dil", "languages"],
  fx_st_phrases: ["sesli ifade", "voice phrases"],
  fx_st_logos: ["marka logosu", "brand logos"],
  fx_toc_overlays: ["Overlay'ler", "Overlays"],
  fx_toc_livechat: ["Canlı Sohbet", "Live Chat"],
  fx_toc_voice: ["Sesli Mühendis", "Voice Engineer"],
  fx_toc_community: ["Topluluk", "Community"],
  fx_toc_social: ["Arkadaşlar ve takımlar", "Friends & teams"],
  fx_toc_tools: ["Araçlar", "Tools"],
  fx_toc_sims: ["Simülasyonlar", "Sims"],
  fx_toc_pro: ["Ücretsiz ve PRO", "Free & PRO"],
  fx_tag_free: ["ÜCRETSİZ", "FREE"],
  fx_tag_pro: ["PRO", "PRO"],
  fx_tag_mixed: ["ÜCRETSİZ + PRO seçenekler", "FREE + PRO options"],

  // ---- Overlay'ler ----
  fx_ov_eyebrow: ["Overlay'ler", "Overlays"],
  fx_ov_title: ["{0} overlay, tek şeffaf pencere", "{0} overlays, one transparent window"],
  fx_ov_lead: [
    "Her overlay yalnızca ihtiyacı olan veriyi kendi hızında alır; kapalı olanlar hiç hesaplanmaz. Hepsi sürüklenir, boyutlanır ve kendi ayar sayfasından özelleştirilir.",
    "Each overlay receives only the data it needs at its own rate; closed ones cost nothing. All of them can be dragged, resized and customised from their own settings page.",
  ],
  fx_ov_common: [
    "Kontrol panelinde gerçek pist üstünde canlı önizleme; demo moduyla oyunu açmadan düzen kur|Tema motoru: yazı tipi, renk, opaklık, kenarlık ve gölge tek hamlede|Her overlay'in kendi görünümü: renk, yazı tipi, köşe, kenarlık ve yoğunluk overlay başına ayrı ayarlanır; hazır görünümler ve kopyala / yapıştır|Araç markası logoları, ülke bayrakları, sınıf renkleri|Oyun desteklemiyorsa overlay kendiliğinden gizlenir, ayarın bozulmaz",
    "Live preview on a real track in the control panel; build layouts in demo mode without starting the game|Theme engine: font, colours, opacity, border and shadow in one go|Every overlay has its own look: colours, typography, corners, border and density per overlay, with quick presets and copy / paste|Car brand logos, country flags, class colours|Overlays hide themselves in sims that can't feed them, without touching your settings",
  ],
  fx_ov_note: [
    "Etiketler varsayılan ayrımı gösterir. “ÜCRETSİZ + PRO seçenekler”: overlay herkese açık, bazı tasarımları ya da ek işlevleri PRO.",
    "Tags show the default split. “FREE + PRO options”: the overlay is open to everyone, some designs or extra functions are PRO.",
  ],
  fx_g_race_d: ["Etrafında kim var, kim nerede, kim yaklaşıyor; fark grafiği ve rakip takibi.", "Who is around you, who is where, who is closing in; gap chart and rival tracking."],
  fx_g_car_d: ["Gösterge paneli, pedallar, tur ve sektör süreleri, fren noktaları, pist limiti, hasar ve sürüş analizi.", "Dash, pedals, lap and sector times, braking points, track limits, damage and driving analysis."],
  fx_g_strategy_d: ["Yakıt, pit penceresi, stint ve sürücü değişimi, ekip çağrıları, bayraklar, hava, rüzgâr ve olay puanı.", "Fuel, pit window, stints and driver swaps, crew calls, flags, weather, wind and incident points."],
  fx_g_stream_d: ["Yayıncılar için: sohbet, anket, altyazı, start ışıkları, sürücü kartı, kafa kafaya, yarış sonucu ve hedef çubuğu.", "For streamers: chat, polls, captions, start lights, driver card, head to head, race result and goal bar."],
  fx_g_social_d: ["Mesajların ve mühendisinin söyledikleri ekranda.", "Your messages and what your engineer says, on screen."],

  ov_relative_d: ["Pistte önündeki ve arkandaki araçlar, aradaki farkla.", "The cars ahead of and behind you on track, with the gaps."],
  ov_relative_h: [
    "Fark, stint / PIT / OUT, lisans ve SR, iRating|Yarışta tahmini iRating değişimi|Ülke bayrağı, araç markası logosu, lastik, son tur, bayraklar|Üstte hava, altta SOF ve olay puanı; sütunları sen seçer ve sıralarsın",
    "Gap, stint / PIT / OUT, licence and SR, iRating|Estimated iRating change during the race|Country flag, car brand logo, tyre, last lap, flags|Weather on top, SOF and incident points at the bottom; you choose and order the columns",
  ],
  ov_standings_d: ["Çok sınıflı sıralama tablosu.", "A multi-class leaderboard."],
  ov_standings_h: [
    "Sınıf başlıkları ve sınıf SOF'u|“Liderler + etrafımdakiler” ya da herkes|Kazanılan / kaybedilen sıra, pit sayısı, son 5 tur ortalaması, en iyi tur|Lidere ya da öndekine fark; sütunlar sıralanabilir",
    "Class headers with class SOF|“Leaders + around me” or everyone|Positions gained / lost, pit count, 5-lap average, best lap|Gap to leader or interval; columns can be reordered",
  ],
  ov_duel_d: [
    "Önündeki ve arkandaki araçlara farkı makara gibi dönen bir şeritte gösterir.",
    "Shows the gaps to the cars ahead and behind on a reel-like rolling strip.",
  ],
  ov_duel_h: [
    "Araç yaklaştıkça satırı büyür ve netleşir, uzaklaştıkça küçülüp silikleşir|Saniye ya da metre eşiği; ön ve arka için ayrı eşik|Yaklaşma oku ve tur farkı rengi (tur önde mavi, tur geride kırmızı)|Eşik içinde kimse yokken gizlenir; sadece kendi sınıfın / sadece yarış seçenekleri",
    "A row grows and sharpens as the car closes in, shrinks and fades as it drops back|Threshold in seconds or metres; separate front and rear thresholds|Closing arrow and lap-difference tint (a lap up blue, a lap down red)|Hides when nobody is within the threshold; own-class-only and race-only options",
  ],
  ov_battlebox_d: ["Sınıfında hemen önündeki ve arkandaki araç.", "The car directly ahead and behind in your class."],
  ov_battlebox_h: ["Numara, isim, son tur ve aradaki fark|Yanında pozisyon rozeti|Küçük ve yayın dostu", "Number, name, last lap and gap|Position badge on the side|Compact and stream-friendly"],
  ov_trackmap_d: ["Tüm pist ve üzerindeki araçlar.", "The whole track with every car on it."],
  ov_trackmap_h: [
    "Pist şekli ilk temiz turunda otomatik kaydedilir|Pit yolu çizimi: giriş / çıkış işaretleri, kendi pit kutun, pitteki araçlar pit yolunda|Sınıf renkleri; araç üstünde numara ya da sınıf pozisyonu|Döndürme, aynalama, dolgu, kenar çizgisi ve özel renkler",
    "The track shape is recorded automatically on your first clean lap|Pit lane drawing: entry / exit marks, your own pit stall, pitted cars shown in the lane|Class colours; car number or class position on each car|Rotation, mirroring, fill, outline and custom colours",
  ],
  ov_flatmap_d: ["Pisti düz bir şerit olarak gösterir.", "Shows the track as a straight strip."],
  ov_flatmap_h: [
    "Tüm araçlar sınıf renkleriyle|Sen ortada ya da başlangıç / bitiş solda|Arkadaşların ayrı renkte",
    "Every car in its class colour|You in the centre, or start / finish on the left|Your friends in a separate colour",
  ],
  ov_minimap_d: ["Aracını merkeze alan, yakınlaştırılmış yuvarlak pist görünümü.", "A zoomed, round track view centred on your car."],
  ov_minimap_h: ["Yakındaki araçları gösterir|İstersen gidiş yönü hep yukarıda|20 Hz akıcı hareket", "Shows nearby cars|Optional heading-up rotation|Smooth 20 Hz motion"],
  ov_radar_d: ["Yanındaki ve yakınındaki araçları kuşbakışı gösteren radar.", "A top-down radar showing the cars beside and near you."],
  ov_radar_h: [
    "Araç blokları boyuna konumlarına göre hareket eder|Yanında araç varken o taraf kırmızıya döner|Görüş mesafesi ayarı, isteğe bağlı mesafe yazısı|Kimse yokken kendiliğinden gizlenir",
    "Car blocks move with their longitudinal position|The side turns red while a car is alongside|Adjustable range, optional distance read-out|Hides itself when nobody is near",
  ],
  ov_spotterbar_d: [
    "Ekranın solunda ve sağında ince birer çubuk: sadece yanında araç olan taraf yanar.",
    "A thin bar on the left and right of the screen: only the side with a car alongside lights up.",
  ],
  ov_spotterbar_h: [
    "İşaret, yandaki aracın arkadan öne ilerleyişini gösterir|Tek araç, iki yanda araç ve tehlikeli yakınlık için ayrı renkler|Kalınlık, yükseklik ve çubuklar arası mesafe ayarlanır; eklenince ekranın ortasına yerleşir|7 görünüm: Düz çubuk ücretsiz; Yay, Soluk uçlu, Segmentli, Ok uçlu, Neon çizgi ve Parantez PRO",
    "A marker shows the car beside you moving from rear to front|Separate colours for one car, cars on both sides and dangerously close|Adjustable thickness, height and gap; lands at the screen centre when added|7 views: Flat bar is free; Arc, Faded ends, Segmented, Chevrons, Neon line and Bracket are PRO",
  ],
  ov_overtake_d: ["Çok sınıflı yarışlarda arkadan yaklaşan daha hızlı sınıftaki araçlar.", "Faster-class cars catching you in multi-class races."],
  ov_overtake_h: ["Süre farkı ve sınıf rengi|En yakını yaklaştıkça çubuk dolar|iRacing", "Time gap and class colour|A bar fills as the closest one approaches|iRacing"],
  ov_rejoin_d: ["Pist dışına çıktığında ya da durduğunda belirir.", "Appears when you go off track or stop."],
  ov_rejoin_h: [
    "Arkadan gelen en yakın araçlara süre farkı|Piste dönmenin güvenli olup olmadığını söyler|Gerekmediğinde ekranda yer kaplamaz",
    "Time gap to the closest cars coming from behind|Tells you whether it is safe to rejoin|Takes no screen space when not needed",
  ],

  ov_dashboard_d: ["Yarış direksiyonlarındaki ekranlar gibi bir gösterge paneli.", "A dash like the screens on racing steering wheels."],
  ov_dashboard_h: [
    "Klasik, Minimal, Yarış ve Dayanıklılık görünümleri + araca göre otomatik seçim|PRO: gerçek yarış araçlarından esinlenen 10 araç tarzı ekran (F1, F3/F4/FR, üç GT3 tarzı, LMDh/LMH, stock car, ralli, TCR, yol arabası)|Devir ışıkları: bloklar, F1 (15 LED) ya da çubuk; vites noktasında yanıp söner|Delta referansı (kendi en iyin / oturumun en iyisi / optimal) ve seçilebilir alt kutular|Her öğe ayrı ayarlanır: göster / gizle, boyut ve renk (devir ışıkları, vites, hız, delta, tur süreleri, yakıt, lastikler…)|PRO: Dashboard Tasarımcısı – bileşenleri tuvale sürükleyip kendi ekranını tasarla, overlay olarak ekle ve toplulukta paylaş (puan ve yorum)|PRO: uzak gösterge – ekranı aynı ağdaki telefon ya da tablette aç (QR kodla)",
    "Classic, Minimal, Race and Endurance views + automatic selection by car|PRO: 10 car-style displays inspired by real race cars (F1, F3/F4/FR, three GT3 styles, LMDh/LMH, stock car, rally, TCR, road car)|Shift lights: blocks, F1 (15 LEDs) or bar; flashes at the shift point|Delta reference (your best / session best / optimal) and selectable bottom boxes|Every element is adjustable: show / hide, size and colour (shift lights, gear, speed, delta, lap times, fuel, tyres…)|PRO: Dashboard Designer – drag widgets onto a canvas to build your own display, add it as an overlay and share it with the community (ratings and comments)|PRO: remote dash – open the display on a phone or tablet in the same network (QR code)",
  ],
  ov_inputs_d: ["Gaz / fren / debriyaj izi, pedal çubukları, vites, hız ve direksiyon.", "Throttle / brake / clutch trace, pedal bars, gear, speed and steering."],
  ov_inputs_h: [
    "4 tasarım: varsayılan, telemetri grafiği + çubuklar, geniş grafik; PRO: sim tarzı (klasik)|Araca ya da bağlı direksiyona göre direksiyon görünümü; PRO: Formula, GT, prototip, ralli, oval ve klasik ahşap direksiyonlar|İsteğe bağlı gaz / fren yüzdesi, son tur ve en iyi tur satırı|60 Hz; ABS / TC göstergesi, grafikte direksiyon çizgisi",
    "4 designs: default, telemetry graph + bars, wide graph; PRO: sim style (classic)|Steering wheel matched to the car or to the connected wheel; PRO: Formula, GT, prototype, rally, oval and classic wooden wheels|Optional throttle / brake percentages, last-lap and best-lap lines|60 Hz; ABS / TC indicators, steering line on the graph",
  ],
  ov_pedals_d: [
    "Grafiksiz pedal göstergesi: gaz / fren / debriyaj, yüzdeler, vites, hız ve direksiyon.",
    "Graph-free pedal display: throttle / brake / clutch, percentages, gear, speed and steering wheel.",
  ],
  ov_pedals_h: [
    "7 tasarım: dikey çubuklar, kompakt şerit, LED segmentler; PRO: pedal seti, yatay şeritler, halka göstergeler, çerçevesiz HUD|Yüzde etiketleri, ABS / TC renk ve çerçeve göstergesi|İsteğe bağlı son tur / en iyi tur satırı|Gaz ve fren renkleri değiştirilebilir",
    "7 designs: vertical bars, compact strip, LED segments; PRO: pedal set, horizontal strips, ring gauges, frameless HUD|Percentage labels, ABS / TC colour and frame indication|Optional last-lap / best-lap line|Custom throttle and brake colours",
  ],
  ov_ers_d: [
    "Hibrit araçlarda batarya doluluğu, turdaki net kazanç / kayıp ve MGU gücü.",
    "Battery charge, net gain / loss this lap and MGU power for hybrid cars.",
  ],
  ov_ers_h: [
    "5 tasarım: yatay çubuk, dikey pil, kompakt; PRO: halka gösterge ve detaylı panel|Tur başı işareti, bu turdaki net fark, tur ortalaması ve boşalmaya / dolmaya kalan tur tahmini|MGU-K / MGU-H gücü, harcama modu, tur başına harcama hakkı, P2P ve DRS|Düşük ve dolu batarya uyarısı; hibrit olmayan araçta kendiliğinden gizlenir",
    "5 designs: horizontal bar, vertical cell, compact; PRO: ring gauge and detailed panel|Lap-start marker, net change this lap, per-lap average and estimated laps until empty / full|MGU-K / MGU-H power, deploy mode, per-lap deploy allowance, P2P and DRS|Low and full battery warnings; hides itself in cars without a hybrid system",
  ],
  ov_gforce_d: [
    "Yanal ve boyuna g kuvveti: fren, hızlanma ve viraj yükünü anlık gösterir.",
    "Lateral and longitudinal g-force: shows braking, acceleration and cornering load live.",
  ],
  ov_gforce_h: [
    "4 tasarım: iz bırakan klasik g-çemberi, yanal / boyuna çubuklar, sayısal minimal, sürtünme çemberi|Tepe değer işaretleri ve ayarlanabilir tutma süresi|En yüksek g ölçeği, iz uzunluğu ve yumuşatma ayarı|Desteklenen bütün oyunlarda çalışır",
    "4 designs: classic g-circle with trail, lateral / longitudinal bars, numeric minimal, friction circle|Peak markers with adjustable hold time|Max g scale, trail length and smoothing settings|Works in every supported sim",
  ],
  ov_telemetry_d: ["Vites halkası ve devir göstergesi tek şeritte.", "Gear ring and rev gauge in one strip."],
  ov_telemetry_h: ["Hız ve devir ışıkları|Pozisyon ve son tur|Yakıt ve pist sıcaklığı", "Speed and shift lights|Position and last lap|Fuel and track temperature"],
  ov_delta_d: ["En iyi turuna göre anlık fark.", "Live difference to your best lap."],
  ov_delta_h: ["Kazanma / kaybetme eğilimi|Tur süreleri|iRacing ve ACC", "Gaining / losing trend|Lap times|iRacing and ACC"],
  ov_laptimes_d: ["Son turlarının süreleri ve sektörleri.", "Times and sectors of your recent laps."],
  ov_laptimes_h: [
    "En iyi tura fark ve tur başına harcanan yakıt|Geçersiz (pist dışı / olaylı) ve pit turları işaretlenir|Teorik en iyi tur hesaplanır",
    "Gap to best and fuel used per lap|Invalid (off-track / incident) and pit laps are marked|Theoretical best lap is calculated",
  ],
  ov_corners_d: ["En iyi turundaki virajları otomatik bulur.", "Finds the corners of your best lap automatically."],
  ov_corners_h: [
    "Her virajdaki en düşük hızını son turunla ve bu turla karşılaştırır|Nerede zaman kaybettiğini gösterir|Elle pist tanımı gerekmez",
    "Compares your minimum speed in every corner with your last and current lap|Shows where you are losing time|No manual track setup needed",
  ],
  ov_tires_d: ["Dört lastiğin durumu.", "The state of all four tyres."],
  ov_tires_h: [
    "İç / orta / dış sıcaklık|Kalan diş ve soğuk basınç|iRacing bu değerleri pitte günceller",
    "Inner / middle / outer temperature|Remaining tread and cold pressure|iRacing updates these values in the pits",
  ],
  ov_glucose_d: [
    "Sürekli şeker ölçüm sensöründen anlık kan şekerin: değer, yön oku ve düşük / yüksek uyarısı.",
    "Your live blood glucose from a continuous glucose monitor: value, trend arrow and low / high alerts.",
  ],
  ov_glucose_h: [
    "FreeStyle Libre (LibreLinkUp), Dexcom (Share) ve Nightscout desteği|Değer, yön oku, değişim, ölçüm saati ve son 3 saatin mini grafiği|Düşük / yüksek ve çok düşük / çok yüksek için sesli ve görsel uyarı; sınırları sen belirlersin|5 tasarım, 6 hazır renk teması ve kendi renklerin; mg/dL ya da mmol/L|Giriş bilgileri yalnızca kendi bilgisayarında, şifreli saklanır",
    "Works with FreeStyle Libre (LibreLinkUp), Dexcom (Share) and Nightscout|Value, trend arrow, change, reading time and a mini graph of the last 3 hours|Sound and visual alerts for low / high and very low / very high; you set the limits|5 designs, 6 colour themes plus your own colours; mg/dL or mmol/L|Login details are stored encrypted on your own computer only",
  ],
  ov_setupcover_d: ["Garajda araç ayarlarını yaparken yayında setup ekranını örter; piste çıkınca kendiliğinden kaybolur.", "Covers the setup screen on stream while you tune the car in the garage; disappears by itself when you go on track."],
  ov_setupcover_h: ["İzleyiciler ve rakipler ayar değerlerini yayından göremez|Pistte değilken, yalnızca garajdayken ya da her zaman görünür|Kendi logon, başlık ve alt yazı; boşsa SRTR Pitwall logosu|Boyut, arka plan, vurgu ve yazı rengi, şerit deseni, çerçeve|Tam opak: değerler arkadan okunamaz", "Viewers and rivals cannot read your setup values from the stream|Shows when off track, only in the garage, or always|Your own logo, title and subtitle; the SRTR Pitwall logo if left empty|Size, background, accent and text colour, stripe pattern, frame|Fully opaque: values cannot be read through it"],
  ov_socials_d: ["Yayında sosyal medya hesaplarını geçişlerle gösterir: sırayla dönen hesap, açılan simgeler, liste ya da kayan şerit.","Shows your social media accounts on stream with transitions: rotating account, expanding icons, list or scrolling ticker."],
  ov_socials_h: ["Twitch, YouTube, Kick, Instagram, TikTok, X, Facebook, Discord, web siten ve 2 özel hesap; sırayı sen belirlersin|5 gösterim: sırayla tek hesap, açılan simge sırası, yan yana, alt alta, kayan şerit|7 geçiş: yukarı kay, yana kay, yumuşak geçiş, takla, büyüyerek gel, bulanıktan netleş, perde|4 biçim, 5 hazır renk teması ve kendi renklerin; simgeler platformun renginde ya da tek renk|Her hesap için kendi simge resmini yükleyebilirsin|İstersen yalnızca belirli aralıklarla görünür (ör. 5 dakikada bir 20 saniye)","Twitch, YouTube, Kick, Instagram, TikTok, X, Facebook, Discord, your website and 2 custom accounts; you choose the order|5 displays: one account at a time, expanding icon row, side by side, stacked, scrolling ticker|7 transitions: slide up, slide sideways, fade, flip, zoom in, blur in, wipe|4 shapes, 5 colour themes plus your own colours; icons in the platform colour or a single colour|Upload your own icon image for each account|Optionally appears only at intervals (e.g. 20 seconds every 5 minutes)"],
  ov_heartrate_d: [
    "Akıllı saatinden ya da göğüs bandından anlık nabzın: atan kalp, BPM ve nabız bölgesi.",
    "Your live heart rate from a smartwatch or chest strap: beating heart, BPM and heart-rate zone.",
  ],
  ov_heartrate_h: [
    "Pulsoid, HypeRate ya da saatten bilgisayara doğrudan yerel gönderim (Apple Watch, Wear OS, Garmin, Bluetooth bantlar)|Nabızla birlikte atan kalp, BPM, nabız bölgesi ve mini grafik|5 tasarım: kart, şerit, bölge halkalı yuvarlak, EKG çizgisi, yalın büyük sayı|6 renk teması, kendi renklerin ya da bölgeye göre değişen renk|İsteğe bağlı yüksek nabız uyarısı (sesli ve görsel)",
    "Pulsoid, HypeRate or a direct local push from the watch to your PC (Apple Watch, Wear OS, Garmin, Bluetooth straps)|A heart that beats with your pulse, BPM, heart-rate zone and a mini graph|5 designs: card, strip, circle with zone ring, ECG line, plain big number|6 colour themes, your own colours, or a colour that follows the zone|Optional high heart-rate alert (sound and visual)",
  ],
  ov_dataframe_d: ["Seçtiğin tek bir değeri büyük gösteren kutu.", "A box showing one value of your choice, big."],
  ov_dataframe_h: [
    "Hız, vites, yakıt, delta, pozisyon, tur, sıcaklık, fren dengesi ve daha fazlası|Kendi gösterge düzenini kutu kutu kur|8 şekil (köşeli, hap, daire, kesik köşeli, eğik, alt çizgili, kutusuz), vurgu şeridi, başlık yeri ve özel renkler",
    "Speed, gear, fuel, delta, position, lap, temperature, brake bias and more|Build your own dash box by box|8 shapes (square, pill, circle, cut corners, slanted, underlined, borderless), accent bar, title position and custom colours",
  ],
  ov_clock_d: ["Bilgisayarının saati, alarmlar ve \"su iç\", \"mola ver\" gibi tekrarlayan hatırlatmalar; vakti gelince sesle ve yanıp sönerek uyarır.", "Your PC clock with alarms and repeating reminders such as \"drink water\" or \"take a break\"; warns you with sound and flashing when it is time."],
  ov_clock_h: ["Dijital kutu, ince şerit, yalnızca yazı ve analog kadran|Üç alarm (yarış saati, mola, yayın sonu) ve tekrarlayan hatırlatma: ör. her 30 dakikada \"su iç\"|Bip, çift bip, siren ya da yumuşak ses; ses düzeyi ayarlanır|Kutu, çerçeve ya da yazı yanıp söner; uyarı rengi seçilir|Yalnızca alarm çalarken ya da alarma az kala görünebilir|Sıradaki alarma kalan süre, tarih, saniye, 12/24 saat", "Digital box, slim strip, text only and analog dial|Three alarms (race start, break, end of stream) plus a repeating reminder, e.g. \"drink water\" every 30 minutes|Beep, double beep, siren or soft tone with adjustable volume|Box, frame or text flashes in a colour you choose|Can appear only while an alarm rings or shortly before|Countdown to the next alarm, date, seconds, 12/24 hour"],
  ov_gear_d: ["Yalnızca takılı vites: büyük, okunaklı ve vites değiştirme devrinde renk değiştirir.", "Just the current gear: big, readable and changing colour at the shift point."],
  ov_gear_h: ["Kutu ve yalnızca rakam tasarımları ücretsiz|Devir halkası, vites LED'leri, neon ve altıgen tasarımları PRO|Vites değiştirme devrinde renk değiştirir ya da yanıp söner|Geri ve boş vites ayrı renkte|İstersen altında hız|Boyut ve tüm renkler ayarlanabilir", "Box and digit-only designs are free|Rev ring, shift LEDs, neon and hexagon designs are PRO|Changes colour or blinks at the shift point|Reverse and neutral in their own colours|Optional speed underneath|Size and every colour adjustable"],
  ov_speedo_d: ["Yalnızca hız: üç dijital ve üç analog kadran tasarımı, tamamen ayarlanabilir.", "Just your speed: three digital and three analog dial designs, fully adjustable."],
  ov_speedo_h: ["Dijital: büyük sayı, sayı ve çubuk, LCD ekran|Analog: klasik kadran, modern yay, yarım kadran|En yüksek hız ve kırmızı bölge başlangıcı ayarlanır|Çizgiler, rakamlar ve kadran içi sayı açılıp kapanır|km/h ya da mph; istersen vites de görünür|Boyut, kalınlık ve tüm renkler ayarlanabilir", "Digital: big number, number with bar, LCD display|Analog: classic dial, modern arc, half dial|Set the top speed and where the red zone starts|Toggle ticks, numbers and the digital readout inside the dial|km/h or mph; optionally shows the gear too|Size, thickness and every colour adjustable"],
  ov_blindspot_d: ["Ayna tipi kör nokta ışığı: arkadan araç yaklaşınca ya da yanına gelince solda / sağda yanar.", "Mirror-style blind spot light: lights up on the left / right when a car closes in from behind or pulls alongside."],
  ov_blindspot_h: ["Ayna camı, yalnızca simge, LED nokta ya da dikey ışık şeridi|Uyarının başlayacağı en uzak ve en yakın mesafe ayarlanır|Yaklaşırken soluk, yan yanayken parlak|O tarafa yönelince hızlı yanıp sönme (isteğe bağlı)|Işıkları aynalarının üstüne ya da ekran kenarlarına yerleştir|Pit ve düşük hızda susar", "Mirror glass, icon only, LED dot or vertical light strip|Set the farthest and nearest distance at which it warns|Dim while closing in, bright when alongside|Optional fast blink when you steer towards that side|Place the lights over your mirrors or at the screen edges|Stays quiet in the pits and at low speed"],
  ov_pitspeed_d: ["Pit yoluna yaklaşırken ve pit yolundayken hız sınırına göre hızın.", "Your speed against the limit when approaching and driving the pit lane."],
  ov_pitspeed_h: ["Sınırlayıcı kapalıysa uyarır|Sınırı aşınca kırmızı yanar|Sadece gerektiğinde görünür", "Warns when the limiter is off|Turns red when you exceed the limit|Only visible when needed"],

  ov_fuel_d: ["Depo durumu ve bitişe gereken yakıt.", "Tank level and the fuel needed to finish."],
  ov_fuel_h: [
    "Son tur / 5 tur / 10 tur ortalamasıyla tüketim–tur–stint–ikmal tablosu|Hedef tüketim, kalan tur (son / ortalama / en kötü) ve pit penceresi|Ayarlanabilir ikmal emniyet payı|Takım yakıtı: takım arkadaşlarının yakıtı canlı",
    "Usage–laps–stint–refuel table from last lap / 5-lap / 10-lap averages|Target usage, laps left (last / average / worst) and pit window|Adjustable refuel safety margin|Team fuel: your teammates' fuel, live",
  ],
  ov_session_d: ["Oturumun özeti tek kutuda.", "The session at a glance."],
  ov_session_h: [
    "Bayrak uyarıları|Kalan süre / tur, pozisyon, sıcaklıklar|Olay puanı ve araç ayarları (fren dengesi / TC / ABS)",
    "Flag alerts|Time / laps left, position, temperatures|Incident points and car settings (brake bias / TC / ABS)",
  ],
  ov_digiflags_d: ["Gerçek yarış donanımlarından esinlenen LED matris bayrak paneli.", "An LED-matrix flag panel inspired by real racing hardware."],
  ov_digiflags_h: ["Sarı, mavi, yeşil, beyaz, damalı|Kırmızı, siyah, hasar ve enkaz bayrakları", "Yellow, blue, green, white, chequered|Red, black, meatball and debris flags"],
  ov_weather_d: ["Pistteki hava, anlık.", "Track weather, live."],
  ov_weather_h: ["Rüzgâr pusulası: yön ve hız|Pist ve hava sıcaklığı, nem|Yağış ve pist ıslaklığı", "Wind compass: direction and speed|Track and air temperature, humidity|Precipitation and track wetness"],
  ov_incidents_d: ["Tamamlanan tur ve olay puanın.", "Laps completed and your incident points."],
  ov_incidents_h: ["Yarışın olay sınırına yaklaştıkça renk değiştiren çubuk|iRacing", "A bar that changes colour as you approach the incident limit|iRacing"],
  ov_incidentlog_d: ["Bu oturumda aldığın her olay puanı.", "Every incident point you picked up this session."],
  ov_incidentlog_h: [
    "Saat, tur, sektör ve türü (1x pist dışı, 2x kontrol kaybı / duvar, 4x temas)|Yeni olay birkaç saniye vurgulanır|iRacing",
    "Time, lap, sector and type (1x off track, 2x loss of control / wall, 4x contact)|A new incident is highlighted for a few seconds|iRacing",
  ],

  ov_livechat_d: ["YouTube, Twitch ve Kick sohbetini tek akışta gösterir.", "Shows YouTube, Twitch and Kick chat in a single feed."],
  ov_livechat_h: [
    "Emote'lar, rozetler, Super Chat, abonelik ve raid uyarıları|İzleyici çubuğu: platform başına + toplam|Botları ve ! komutlarını gizleme, silinen mesajları yansıtma|OBS'te de kullanılabilir; birden fazla kanal PRO",
    "Emotes, badges, Super Chat, sub and raid alerts|Viewer bar: per platform + total|Hide bots and ! commands, mirror deleted messages|Works in OBS too; more than one channel is PRO",
  ],
  ov_livepoll_d: ["Canlı sohbetteki anketi gösterir.", "Shows the poll running in your live chat."],
  ov_livepoll_h: [
    "İzleyiciler şık numarasını yazarak oy verir|Soru, şıklar, oy çubukları ve kalan süre|Beraberlikte rastgele seçim animasyonu|Kısayolla başlat (varsayılan F9)",
    "Viewers vote by typing the option number|Question, options, vote bars and time left|Random-pick animation on a tie|Start with a hotkey (default F9)",
  ],
  ov_captions_d: ["Konuşmanı yazıya çevirip altyazı olarak gösterir.", "Turns your speech into on-screen captions."],
  ov_captions_h: [
    "Mikrofon ve isteğe bağlı uzak ses (ör. Discord) ayrı renkte|Yazı tipi, boyut, renk ve arka plan|Kısayolla aç / kapat (varsayılan F7)",
    "Microphone plus optional remote audio (e.g. Discord) in a separate colour|Font, size, colour and background|Toggle with a hotkey (default F7)",
  ],
  ov_scene_n: ["Yayın Sahnesi", "Stream Scene"],
  ov_scene_d: ["Yayın için tam ekran sahneler.", "Full-screen scenes for your stream."],
  ov_scene_h: ["Başlıyor (geri sayım), Hemen dönerim, Yayın sonu|Garajdayken ekranı kapatan örtü", "Starting soon (countdown), Be right back, Stream ending|A cover that hides the screen while you are in the garage"],
  ov_webview_d: ["Herhangi bir web sayfasını overlay olarak gösterir.", "Shows any web page as an overlay."],
  ov_webview_h: ["Sohbet, yayın uyarıları, zamanlayıcı|Kendi panelin ya da aracın", "Chat, stream alerts, timers|Your own dashboard or tool"],

  ov_messages_d: ["Yarışırken gelen mesajları ekranda küçük balonlarla gösterir.", "Shows incoming messages as small bubbles while you race."],
  ov_messages_h: [
    "Arkadaş, takım ve grup mesajları|Tüm arkadaşlar, takım ya da seçtiğin kişiler|Birkaç saniye sonra kendiliğinden kaybolur|PRO: mesajları sesli okuma",
    "Friend, team and group messages|All friends, team, or only people you pick|Disappears by itself after a few seconds|PRO: reads messages aloud",
  ],
  ov_voice_d: ["Mühendis ya da spotter konuşurken ne dediğini yazıyla gösterir.", "Shows what the engineer or spotter is saying, as text."],
  ov_voice_h: [
    "Mühendis ve spotter ayrı renk ve etiketle|Sustuğunda kendiliğinden kaybolur|Sesli Mühendis (PRO) ile çalışır|Sesli komutta sorduğun soru da \"Sen\" etiketiyle görünür",
    "Engineer and spotter in separate colours and labels|Disappears when they stop talking|Works with the Voice Engineer (PRO)|Your voice-command question is shown too, labelled \"You\"",
  ],

  // ---- Yeni overlay'ler (16): strateji, zamanlama, sürüş, yayın ----
  ov_gapchart_d: [
    "Öndeki ve arkadaki araca (ya da sınıf liderine) olan farkı son turlar boyunca çizgi grafikte gösterir.",
    "Plots the gap to the car ahead and behind (or to the class leader) over the last laps.",
  ],
  ov_gapchart_h: [
    "Tur başına bir nokta, en sağda anlık fark|Yaklaşma / uzaklaşma eğilimi (sn/tur) ve kaç turda yakalanacağı tahmini|Rakibin ve senin pit girişlerin grafikte işaretlenir|3 tasarım: alt alta iki grafik, sadece sayılar; PRO: tek birleşik grafik",
    "One point per lap, the live gap on the right|Closing / dropping trend (s/lap) and an estimate of laps until the catch|Your rival's and your own pit stops are marked on the chart|3 designs: two stacked charts, numbers only; PRO: single combined chart",
  ],
  ov_target_d: [
    "Seçtiğin tek bir rakibi yakından izler: sırası, sana farkı, turları, pit durumu ve lastiği.",
    "Tracks one rival of your choice: position, gap to you, laps, pit status and tyre.",
  ],
  ov_target_h: [
    "Kimi izleyeceğini seç: öndeki, arkadaki, sınıf lideri, belirli bir araç / sürücü ya da işaretli arkadaşın|Son turdaki fark değişimi; son ve en iyi tur seninkiyle karşılaştırmalı|Pit: kaç tur önce / şu an pitte, lastik, iRating ve lisans, mini fark grafiği|Kart ya da kompakt şerit; gösterilecek bilgiler tek tek seçilir",
    "Choose who to follow: car ahead, car behind, class leader, a specific car / driver or a marked friend|Gap change over the last lap; last and best lap compared with yours|Pit: laps since / in the pits now, tyre, iRating and licence, mini gap chart|Card or compact strip; every field can be switched on or off",
  ],
  ov_setupcmp_d: ["Garajda yüklediğin setup'ları yan yana karşılaştırır: hangisiyle daha hızlısın?", "Compares the setups you load in the garage side by side: which one are you faster with?"],
  ov_setupcmp_h: ["Her setup için en iyi tur, sektörler, teorik en iyi, ortalama ve tur sayısı|En hızlı setup yeşil, diğerlerinde fark|2 ile 6 arası setup yan yana|Sadece bu oturum ya da aynı pist ve araçtaki tüm kayıtlar|Tablo ya da sade liste görünümü|iRacing", "Best lap, sectors, theoretical best, average and lap count for every setup|Fastest setup in green, the gap on the others|2 to 6 setups side by side|This session only, or everything recorded on the same track and car|Table or simple list view|iRacing"],
  ov_sectors_d: [
    "Güncel turun sektör süreleri canlı: mor sınıfın en iyisi, yeşil kişisel en iyi, sarı daha yavaş.",
    "Live sector times for the current lap: purple best in class, green personal best, yellow slower.",
  ],
  ov_sectors_h: [
    "Son tur, en iyi tur ve teorik en iyi tur (en iyi sektörlerin toplamı)|Fark neye göre: kişisel en iyi, son tur ya da sınıfın en iyi sektörleri|Oyunun resmi sektörleri; yoksa tur üç eşit parçaya bölünür|3 tasarım: kompakt kutular, renkli çubuklar; PRO: tablo",
    "Last lap, best lap and theoretical best (sum of your best sectors)|Delta reference: personal best, last lap or the class-best sectors|Uses the game's official sectors; otherwise the lap is split into three equal parts|3 designs: compact boxes, coloured bars; PRO: table",
  ],
  ov_brakepoint_d: [
    "En iyi geçerli turundaki fren noktalarına geri sayım, virajın vitesi ve frenleme farkın.",
    "A countdown to the braking points of your best valid lap, the gear for the corner and your braking difference.",
  ],
  ov_brakepoint_h: [
    "Sıradaki fren noktasına metre metre geri sayım; ŞİMDİ uyarısı için ayarlanabilir tepki payı|Virajın vitesi ve isteğe bağlı en düşük hızı|Son virajda referansa göre kaç metre erken / geç frenlediğin|Gaz kesme noktaları ve tur şeridi|3 tasarım: yatay çubuk, büyük minimal işaret; PRO: dikey çubuk",
    "Metre-by-metre countdown to the next braking point; adjustable reaction lead for the NOW cue|The gear for the corner and, optionally, its minimum speed|How many metres earlier / later than the reference you braked at the last corner|Lift points and a lap strip|3 designs: horizontal bar, big minimal cue; PRO: vertical bar",
  ],
  ov_tracklimits_d: [
    "Süren tur hâlâ geçerli mi, kaç kez pist dışına çıktın, kaç turun geçersiz sayıldı.",
    "Is the current lap still valid, how many times you went off track and how many laps were invalidated.",
  ],
  ov_tracklimits_h: [
    "Pist dışına çıkınca ya da tur iptal olunca yanıp söner|iRacing'de olay puanı / sınır ve ayarlanabilir uyarı eşiği|Bekleyen ceza; oyun veriyorsa pist dışındaki teker sayısı|Tur geçerliyken gizlenebilir|2 tasarım: rozet; PRO: şerit",
    "Flashes when you go off track or the lap is invalidated|Incident points / limit in iRacing, with an adjustable warning threshold|Pending penalty; wheels off track where the game reports it|Can hide while the lap is valid|2 designs: badge; PRO: strip",
  ],
  ov_damage_d: [
    "Aracın üstten şeması: hasarlı bölgeler şiddetine göre renklenir, yanında tamir süresi ve motor uyarıları.",
    "A top-down diagram of the car: damaged areas are coloured by severity, with repair time and engine warnings.",
  ],
  ov_damage_h: [
    "Hafif / orta / ağır hasar için ayrı renkler|Tahmini tamir süresi (zorunlu + isteğe bağlı)|Motor uyarıları: su / yağ sıcaklığı, basınçlar, aşırı ısınma|Hasar yokken kendini gizler; araç şeması ya da kompakt şerit|Ayrıntı oyuna göre değişir (tamir süresi iRacing, ACC'de tahmin)",
    "Separate colours for light / medium / heavy damage|Estimated repair time (mandatory + optional)|Engine warnings: water / oil temperature, pressures, overheating|Hides itself when there is no damage; car diagram or compact strip|Detail depends on the game (repair time in iRacing, estimated in ACC)",
  ],
  ov_pitwindow_d: [
    "Şimdi pite girersen nereden çıkarsın? Pit kaybı, aralarına döneceğin araçlar ve pit sonrası sıran.",
    "If you pit now, where do you come out? Pit loss, the cars you rejoin between and your position afterwards.",
  ],
  ov_pitwindow_h: [
    "Pit kaybı bu pistteki stoplarından kendiliğinden ölçülür; istersen elle ya da piste özel süre gir|Pit çıkışında trafik uyarısı (ayarlanabilir eşik)|Yakıta göre en erken ve en geç pit turu|Yalnızca kendi sınıfın seçeneği|2 tasarım: kompakt şerit; PRO: dönüş çizelgeli detaylı kart",
    "Pit loss is measured automatically from your stops at this track; or enter a manual or per-track value|Traffic warning for the pit exit (adjustable threshold)|Earliest and latest pit lap based on fuel|Own-class-only option|2 designs: compact strip; PRO: detailed card with a rejoin timeline",
  ],
  ov_stint_d: [
    "Süren stint'in özeti: tur, süre, ortalama ve en iyi tur, tempo eğilimi, lastik yaşı, yakıt ortalaması.",
    "A summary of the current stint: laps, time, average and best lap, pace trend, tyre age, average fuel.",
  ],
  ov_stint_h: [
    "Stint'ler pit stoplarda kendiliğinden ayrılır|Önceki stint'le karşılaştırma ve tur süresi grafiği|Tablo görünümü: son stint'ler, sürücü ve pit süresi sütunlarıyla|Tempo eğilimi: hızlanıyor musun, yavaşlıyor musun (sn/tur)",
    "Stints are split automatically at pit stops|Comparison with the previous stint and a lap time sparkline|Table view: the last stints, with driver and pit time columns|Pace trend: are you getting faster or slower (s/lap)",
  ],
  ov_driverswap_d: [
    "Takım yarışları için: araçta kim var, ne kadardır sürüyor, her sürücünün toplam süresi ve turu.",
    "For team races: who is in the car, for how long, and each driver's total time and laps.",
  ],
  ov_driverswap_h: [
    "Sürücü başına en az sürüş süresi kuralı: eksik kalan süre ve tamamlanınca onay işareti|En uzun kesintisiz sürüş kuralı: kalan süre, sınıra yaklaşınca uyarı, aşım|Süre payı çubuğu, tur ve araca biniş sayısı|Liste ya da kompakt görünüm; takım yarışı değilse gizlenir|iRacing ve LMU / rFactor 2",
    "Minimum drive time per driver: time still owed and a tick once it is done|Maximum continuous stint: time left, a warning near the limit, overrun|Time-share bar, lap count and number of stints in the car|List or compact view; hides when it isn't a team race|iRacing and LMU / rFactor 2",
  ],
  ov_crewcall_d: [
    "Ekibinin çağrıları, mesajları ve uyguladığı pit komutları ekranın ortasında büyük bir duyuru olarak çıkar.",
    "Your crew's calls, messages and applied pit commands appear as a big announcement in the middle of the screen.",
  ],
  ov_crewcall_h: [
    "Hazır çağrılar kendi rengi ve simgesiyle: Bu tur pit, Push, Yakıt tasarrufu, Arkandan hızlı araç|Ekibin uzaktan yaptığı pit ayarı (yakıt, lastik, hızlı tamir) uygulanınca duyurulur|Nabız, yanıp sönme ya da kayma animasyonu; isteğe bağlı bip sesi|Yalnızca hazır çağrılar seçeneği: sıradan sohbet ortada görünmez",
    "Ready-made calls in their own colour and icon: Pit this lap, Push, Save fuel, Faster car behind|Announces a pit setting your crew changed remotely (fuel, tyres, fast repair) once it is applied|Pulse, flash or slide animation; optional beep|Quick-calls-only option: ordinary chat stays out of the middle of the screen",
  ],
  ov_windcompass_d: [
    "Rüzgârın aracına göre yönü: karşıdan mı, arkadan mı, yandan mı esiyor.",
    "Wind direction relative to your car: headwind, tailwind or crosswind.",
  ],
  ov_windcompass_h: [
    "Pusula (araç ortada) ya da ok ve yazı şeridi|Rüzgâr hızı; isteğe bağlı karşı ve yan bileşenler|Karşıdan / arkadan / yandan için ayrı renkler|Sakin havada gizlenebilir; virajlarda ok yumuşatılır",
    "Compass (car in the centre) or an arrow-and-text strip|Wind speed; optional head and cross components|Separate colours for headwind / tailwind / crosswind|Can hide in calm air; the arrow is smoothed through corners",
  ],
  ov_startlights_d: [
    "Yarış öncesi start ışıkları: formasyon turu, sırayla yanan ışıklar ve start anında yeşil ışık / GO!",
    "Start lights before the race: formation lap, lights coming on in sequence and green / GO! at the start.",
  ],
  ov_startlights_h: [
    "3 tasarım: ışık köprüsü (3–7 ışık), trafik ışığı, sade yazı|Start anı: ışıklar yeşile döner ya da söner; kendi start yazın|Aşama yazısı: formasyon turu, grid, hazır|İsteğe bağlı yeşilde bip; start sonrası kendiliğinden kaybolur",
    "3 designs: light gantry (3–7 lights), traffic light, plain text|At the start the lights turn green or go out; your own start text|Phase text: formation lap, grid, ready|Optional beep on green; disappears by itself after the start",
  ],
  ov_drivercard_d: [
    "Yayın için alt bant: adın, bayrağın, araç numaran, aracın, takımın, iRating ve lisansın, sıran.",
    "A lower third for streams: your name, flag, car number, car, team, iRating and licence, position.",
  ],
  ov_drivercard_h: [
    "Gösterilecek bilgiler tek tek seçilir; ikinci satıra kendi yazın (ör. sosyal medya adın)|Her zaman, belirli aralıklarla ya da sadece garajda / gridde|Vurgu rengi sınıf renginden gelebilir|3 tasarım: klasik alt bant, küçük etiket; PRO: eğik sport",
    "Pick every field; put your own text on the second line (e.g. your social handle)|Always, at intervals, or only in the garage / on the grid|Accent colour can follow the class colour|3 designs: classic lower third, small tag; PRO: angled sport",
  ],
  ov_h2h_d: [
    "Seni ve seçtiğin rakibi yan yana karşılaştırır; her satırda iyi olan değer vurgulanır.",
    "Compares you and a rival of your choice side by side; the better value is highlighted on every row.",
  ],
  ov_h2h_h: [
    "Rakip: sıralamada ya da pistte öndeki / arkadaki, sınıf lideri ya da belirli araç numarası|Sıra, son tur, en iyi tur, pit stop, lastikteki tur, iRating|Bayraklar ve aradaki fark; fark büyükse gizlenebilir|Geniş karşılaştırma bandı ya da üst üste kart",
    "Rival: ahead / behind in the standings or on track, class leader or a specific car number|Position, last lap, best lap, pit stops, laps on tyres, iRating|Flags and the gap between you; can hide when the gap is large|Wide comparison bar or stacked card",
  ],
  ov_results_d: [
    "Damalı bayraktan sonra yarış sonucu: sınıfının ilk üçü, kendi sonucun ve tahmini iRating değişimi.",
    "The race result after the chequered flag: your class top three, your own result and the estimated iRating change.",
  ],
  ov_results_h: [
    "Podyum (ilk 3) ya da tablo (ilk N + sen)|Kazanılan / kaybedilen sıra, en iyi tur, olay puanı|Sen çizgiyi geçince ya da damalı bayrak çıkınca görünür|Belirli süre ya da oturum bitene kadar ekranda; kendi başlığın",
    "Podium (top 3) or table (top N + you)|Positions gained / lost, best lap, incident points|Appears when you cross the line or when the chequered flag comes out|On screen for a set time or until the session ends; your own title",
  ],
  ov_goalbar_d: [
    "Yayıncılar için hedef ilerleme çubuğu: elle sayaç ya da canlı sohbet uyarılarından otomatik sayım.",
    "A goal progress bar for streamers: a manual counter or automatic counting from live chat alerts.",
  ],
  ov_goalbar_h: [
    "Kaynak: elle, yeni takipçiler, aboneler / üyeler, bağış sayısı ya da tutarı, tüm destekler|Başlık, hedef, yüzde, birim ve “son destekçi” satırı|Hedefe ulaşınca kendi yazın ve rengin|3 tasarım: ince çubuk, ikonlu hap; PRO: büyük hedef panosu",
    "Source: manual, new followers, subs / members, donation count or amount, all support|Title, target, percentage, unit and a “latest supporter” line|Your own text and colour when the goal is reached|3 designs: slim bar, icon pill; PRO: big milestone board",
  ],

  // ---- Canlı Sohbet ----
  fx_lc_eyebrow: ["Canlı Sohbet", "Live Chat"],
  fx_lc_title: ["YouTube, Twitch ve Kick tek akışta", "YouTube, Twitch and Kick in one feed"],
  fx_lc_lead: [
    "Yayın yaparken üç platformun sohbetini tek pencerede, oyunun üstünde ya da OBS'te gör. Kanalları giriş yapmadan okur; moderasyon, anket, sesli okuma ve altyazı aynı sayfadan yönetilir.",
    "See the chat of three platforms in one place while you stream — over the game or in OBS. Channels are read without signing in; moderation, polls, read-aloud and captions are managed from the same page.",
  ],
  fx_lc_points: [
    "Emote'lar, rozetler (yayıncı, mod, abone, VIP, üye), yanıtlanan mesaj|Super Chat, abonelik, raid ve bağış uyarıları|Platform başına ve toplam izleyici sayısı|Kısayollar: anket F9, sesli okuma F8, altyazı F7",
    "Emotes, badges (broadcaster, mod, sub, VIP, member), replied-to message|Super Chat, sub, raid and donation alerts|Viewer counts per platform and in total|Hotkeys: poll F9, read-aloud F8, captions F7",
  ],
  fx_lc_free_t: ["Herkese açık", "For everyone"],
  fx_lc_free: [
    "Bir kanalın sohbeti ve izleyici sayısı (listenin en üstündeki kanal)|Moderasyon: engellenen kullanıcılar, kelime filtresi, bağlantı engeli, tekrar filtresi|Platformda silinen mesaj sende de kalkar|Görünüm: yazı tipi, renkler, balonlar, emote boyutu, platform simgeleri|OBS tarayıcı kaynağı: sohbet, anket ve altyazı sayfaları|Streamlabs uyarıları|Günlük sohbet kaydı tutma",
    "One channel's chat and viewer count (the top channel in your list)|Moderation: blocked users, word filter, link blocking, repeat filter|Messages deleted on the platform disappear for you too|Look: font, colours, bubbles, emote size, platform icons|OBS browser source: chat, poll and caption pages|Streamlabs alerts|Keeping a daily chat log",
  ],
  fx_lc_pro_t: ["PRO ile", "With PRO"],
  fx_lc_pro: [
    "Birden fazla kanal aynı anda|Favori kanallar ve izleyici sayıları|Sohbet anketi: izleyiciler numara yazarak oy verir|Sohbeti sesli okuma (TTS, Windows sesleri)|Konuşmayı yazıya çevirme: altyazı|Sohbete kendi Twitch / Kick / YouTube hesabınla yazma|Sohbet kaydı görüntüleyici: arama, süzme, dışa aktarma",
    "Several channels at once|Favourite channels with viewer counts|Chat poll: viewers vote by typing a number|Chat read-aloud (TTS, Windows voices)|Speech-to-text captions|Write to chat with your own Twitch / Kick / YouTube account|Chat log viewer: search, filter, export",
  ],

  // ---- Sesli Mühendis ----
  fx_vo_eyebrow: ["Sesli Mühendis ve spotter", "Voice Engineer and spotter"],
  fx_vo_title: ["Kulağında gerçek bir yarış mühendisi", "A real race engineer in your ear"],
  fx_vo_lead: [
    "Gerçek insan sesiyle kaydedilmiş ses paketleri: spotter yanındaki aracı söyler, mühendis yakıtı, aradaki farkları, bayrakları, pit penceresini ve tur zamanlarını anlatır. Canlı oturum algılanınca kendiliğinden konuşmaya başlar.",
    "Voice packs recorded by real people: the spotter calls the cars beside you, the engineer talks fuel, gaps, flags, pit windows and lap times. It starts talking by itself when a live session is detected.",
  ],
  fx_vo_s1: ["katalogdaki ifade", "phrases in the catalogue"],
  fx_vo_s2: ["mühendisin kullandığı ifade", "phrases the engineer uses"],
  fx_vo_s3: ["ses kaydı (varyasyonlarla)", "recordings (with variations)"],
  fx_vo_s4: ["aç / kapat kategori", "toggleable categories"],
  fx_vo_points: [
    "{0} ifadelik katalogdan {1} tanesi kullanılıyor: {2} konuşma ifadesi + {3} sayı ve süre parçası (sayılar, tur zamanları ve farklar bunlardan birleştirilir)|Her ifadenin birden çok kaydı var; aynı cümle her seferinde aynı tonda gelmez|İndirilebilir ses paketleri: programın içinden tek tıkla indir, kur, değiştir|Kendi paketini yap: program hazır şablon klasörü ve her ifade için metin verir, eksikleri denetler, WAV kayıtlarını OGG'ye çevirip paketler; istersen toplulukla paylaşmak için gönder|Crew Chief v4 klasör düzeniyle uyumlu|Mühendis ve spotter için ayrı ses düzeyi, virajda önemsiz mesajları bekletme, ovalde iç / dış, hangi oturumlarda konuşacağı|Altyazı overlay'i: söylenen her şey ekranda yazıyla da görünür|Sesli komut (bas-konuş): direksiyondaki bir düğmeyi ya da klavyeden bir tuşu basılı tutup sor — \"ne kadar yakıtım var\", \"kaç olay puanım var\", \"öndeki fark\" — mühendis sesle yanıtlar|24 komut, 15 dilde; arayüz dilinde dinler",
    "{1} of the {0} catalogue phrases are in use: {2} spoken phrases + {3} number and time fragments (numbers, lap times and gaps are assembled from these)|Every phrase has several recordings, so the same call doesn't always sound the same|Downloadable voice packs: download, install and switch in one click inside the app|Make your own pack: the app gives you a template folder with the text for each phrase, checks what's missing, converts WAV recordings to OGG and builds the pack; submit it to share with the community|Compatible with the Crew Chief v4 folder layout|Separate volumes for engineer and spotter, holds minor messages in corners, inside / outside on ovals, choose which sessions it talks in|Subtitle overlay: everything that is said also appears as text on screen|Voice commands (push-to-talk): hold a wheel button or a keyboard key and ask — \"how much fuel do I have\", \"how many incidents\", \"gap ahead\" — the engineer answers by voice|24 commands in 15 languages; listens in the interface language",
  ],
  fx_vo_cat_t: ["Neler söyler?", "What does it say?"],
  fx_vo_cat_lead: ["{0} kategori; her birini ayrı ayrı açıp kapatabilirsin.", "{0} categories; each can be switched on or off."],
  fx_vo_cats: [
    "Spotter: solda / sağda araç, üç araç yan yana, temiz|Telsiz kontrolü|Bayraklar: sarı, güvenlik aracı, yeşil, mavi, enkaz|Yarış akışı: start, kalan tur / süre, son tur, bitiş|Pozisyon: sıra değişimi, geçişler, beklenen sıra|Tur zamanları: kişisel rekor, tempo, istikrar|Sektör farkları|Aralar: öndeki / arkadaki ile fark, baskı|Rakipler: lider pite giriyor, en hızlı tur|Yakıt: kalan tur, pit penceresi, eklenecek yakıt|Pit ve strateji: pit limiti, pit kaybı, çıkış sırası|Lastikler|Motor: su / yağ sıcaklığı, basınçlar|Kaza: “iyi misin?”|Cezalar: siyah bayrak, pist sınırı, ters yön|Olay puanı|Hava ve pist: yağmur başladı / durdu|Çok sınıf: arkadan hızlı sınıf, önde yavaş sınıf|Bas!: son turlar, pit çıkışı temiz / trafik|Piste dönüş: “bekle, araç geliyor”|Öğütler|Ayar onayları",
    "Spotter: car left / right, three wide, clear|Radio check|Flags: yellow, safety car, green, blue, debris|Race flow: start, laps / time left, last lap, finish|Position: changes, overtakes, expected position|Lap times: personal best, pace, consistency|Sector deltas|Gaps: ahead / behind, pressure|Opponents: leader pitting, fastest lap|Fuel: laps left, pit window, fuel to add|Pit and strategy: pit limiter, pit loss, exit position|Tyres|Engine: water / oil temperature, pressures|Crash: “are you OK?”|Penalties: black flag, track limits, wrong way|Incident points|Weather and track: rain started / stopped|Multi-class: faster class behind, slower class ahead|Push!: final laps, pit exit clear / traffic|Rejoin: “hold, car coming”|Pearls of wisdom|Setting confirmations",
  ],

  // ---- Topluluk ----
  fx_co_eyebrow: ["Topluluk", "Community"],
  fx_co_title: ["Paylaş, indir, puanla, yorumla", "Share, download, rate, comment"],
  fx_co_lead: [
    "Emek verdiğin düzeni, temayı ya da en iyi karesini toplulukla paylaş; başkalarının hazırladıklarını önizleyip tek tıkla kendi programına al. Ücretsiz bir hesap yeter: topluluk düzenlerine ve temalarına göz atabilir, onları kullanabilir, puan verebilir ve yorum yazabilirsin; topluluk dashboard'larını da gezip puanlayabilir ve yorumlayabilirsin.",
    "Share the layout, theme or best shot you worked on with the community; preview what others made and bring it into your app in one click. A free account is enough: you can browse community layouts and themes, use them, rate them and comment — and browse, rate and comment on community dashboards too.",
  ],
  fx_co1_t: ["Düzen paylaşımı", "Layout sharing"],
  fx_co1_d: ["Komple overlay düzenini (konumlar, her overlay'in ayarları, istersen renklerin ve arka plan görselin) paylaş. Başkasının düzenini canlı demoyla önizle, tek tıkla kendi düzenlerine ekle; puan ver, yorum yaz.", "Share a complete overlay layout (positions, every overlay's settings and, if you like, your colours and background image). Preview someone else's layout with a live demo, add it to your own layouts in one click, rate it and leave a comment."],
  fx_co1_n: ["Ücretsiz hesapla: gez, kullan, puan ver, yorum yaz ve paylaş", "With a free account: browse, use, rate, comment and share"],
  fx_co2_t: ["Yayın düzeni paylaşımı", "Stream layout sharing"],
  fx_co2_d: ["OBS için hazırladığın yayın düzenlerini paylaş; başkalarının yayın düzenini kendi yayınına al.", "Share the stream layouts you built for OBS; bring someone else's stream layout into your own broadcast."],
  fx_co2_n: ["Paylaşmak ücretsiz", "Sharing is free"],
  fx_co3_t: ["Ekran görüntüsü paylaşımı", "Screenshot sharing"],
  fx_co3_d: ["Oyunda aldığın ekran görüntülerini galeriden toplulukta paylaş; diğer sürücülerin karelerine göz at.", "Share your in-game screenshots from the gallery; browse other drivers' shots."],
  fx_co3_n: ["Paylaşmak PRO · gezinmek ücretsiz", "Sharing is PRO · browsing is free"],
  fx_co4_t: ["Tema paylaşımı", "Theme sharing"],
  fx_co4_d: ["Renk, yazı tipi, kenarlık ve gölge ayarlarından oluşan temanı paylaş; beğendiğin temayı tek tıkla uygula.", "Share your theme — colours, font, border and shadow; apply a theme you like in one click."],
  fx_co4_n: ["Kullanmak, puan ve yorum ücretsiz hesapla · paylaşmak PRO", "Using, rating and commenting with a free account · sharing is PRO"],

  fx_co5_t: ["Dashboard paylaşımı", "Dashboard sharing"],
  fx_co5_d: [
    "Dashboard Tasarımcısı'yla yapılmış direksiyon ekranlarına göz at, canlı önizle, puan ver ve yorum yaz; beğendiğini kendi Direksiyon Ekranı overlay'ine al.",
    "Browse steering wheel displays made with the Dashboard Designer, preview them live, rate them and comment; bring the one you like into your own Steering Wheel Display overlay.",
  ],
  fx_co5_n: ["Gezinmek, puan ve yorum ücretsiz hesapla · overlay'de kullanmak, tasarlamak ve paylaşmak PRO", "Browsing, rating and commenting with a free account · using it in the overlay, designing and sharing are PRO"],

  // ---- Sosyal ----
  fx_so_eyebrow: ["Arkadaşlar, mesajlar, gruplar, takımlar", "Friends, messages, groups, teams"],
  fx_so_title: ["Sim yarışçıları için sosyal katman", "A social layer for sim racers"],
  fx_so_lead: [
    "Kim çevrimiçi, kim yarışta gör; mesajlaş, grup kur, takımınla sohbet et. Güvendiğin arkadaşınla yakıtını ve tur sürelerini canlı paylaş; ekibine aldığın arkadaşın uygulamadan ya da telefonundan sana spotter'lık ve yarış mühendisliği yapsın.",
    "See who is online and who is racing; message, create groups, chat with your team. Share your fuel and lap times live with friends you trust, and let a friend on your crew act as your spotter and race engineer from the app or from their phone.",
  ],
  fx_soh1_t: ["Arkadaşını ekle", "Add your friend"],
  fx_soh1_d: ["Uygulamadaki Arkadaşlar panelinde görünen adını ya da iRacing adını arat, istek gönder. Karşı taraf kabul edince listene düşer.", "Search their display name or iRacing name in the app's Friends panel and send a request. Once they accept, they appear in your list."],
  fx_soh2_t: ["Kim ne yapıyor gör", "See who is doing what"],
  fx_soh2_d: ["Listede kimin çevrimiçi, kimin yarışta olduğunu; hangi pistte, hangi araçla ve kaçıncı sırada olduğunu görürsün.", "The list shows who is online and who is racing, on which track, in which car and in what position."],
  fx_soh3_t: ["Yaz, yarışta bile görsün", "Message them, even mid-race"],
  fx_soh3_d: ["Uygulamadan ya da siteden mesaj yaz. Arkadaşın pistteyse mesajın ekranında küçük bir overlay olarak belirir ve birkaç saniye sonra kaybolur; bildirim sesini kendisi seçer ya da Rahatsız Etme ile susturur.", "Write from the app or the website. If your friend is on track, your message pops up on their screen as a small overlay and fades after a few seconds; they choose the notification sound or silence it with Do Not Disturb."],
  fx_so1_t: ["Arkadaş listesi", "Friends list"],
  fx_so1_d: [
    "Steam gibi ayrı arkadaş penceresi: çevrimiçi / yarışta durumu, hangi pistte hangi araçla. Arkadaşlarını renk, simge, fotoğraf ve etiketle özelleştir (PRO).",
    "A separate Steam-like friends window: online / racing status, which track and car. Customise friends with colour, icon, photo and label (PRO).",
  ],
  fx_so2_t: ["Mesajlar", "Messages"],
  fx_so2_d: [
    "Özel mesajlar, ifadeler (:D → 😄), masaüstü bildirimleri ve sürerken ekrana düşen Mesajlar overlay'i. Rahatsız etme modu hepsini susturur. Sitede de mesajlaşabilirsin.",
    "Private messages, emojis (:D → 😄), desktop notifications and the Messages overlay that pops up while you drive. Do Not Disturb silences everything. You can message on the website too.",
  ],
  fx_so3_t: ["Sohbet grupları", "Chat groups"],
  fx_so3_d: ["Arkadaşlarınla grup sohbeti kur; grup mesajları da yarış içi Mesajlar overlay'inde görünür.", "Create group chats with your friends; group messages show in the in-race Messages overlay too."],
  fx_so4_t: ["Takımlar", "Teams"],
  fx_so4_d: [
    "Takım kur ya da katıl: takım sohbeti, duyurular ve herkese açık takım sayfası. Yakıt overlay'inde takım arkadaşlarının yakıtı.",
    "Create or join a team: team chat, announcements and a public team page. Your teammates' fuel in the fuel overlay.",
  ],
  fx_so5_t: ["Güvenilir arkadaşla canlı veri", "Live data with trusted friends"],
  fx_so5_d: [
    "Bir arkadaşını “güvenilir” işaretle; yakıtını, kalan turunu, en iyi / son turunu, son 10 turunu ve pistteki konumunu ayrı bir pencerede canlı izlesin. Dayanıklılık yarışlarında pit duvarı gibi. (PRO)",
    "Mark a friend as “trusted” and they can watch your fuel, laps left, best / last lap, last 10 laps and track position live in a separate window — a pit wall for endurance races. (PRO)",
  ],
  fx_so7_t: ["Ekip: uzaktan spotter ve yarış mühendisi", "Crew: remote spotter and race engineer"],
  fx_so7_d: [
    "Arkadaşını ekibine ekle; yarışırken sana uygulamadan ya da telefonundan (sitedeki Ekip sayfası) bağlansın. Ekip Pitwall'ında çevrendeki araçları, farkları, bayrakları, havayı, yan araç göstergesini, yakıtını ve lastiklerini canlı görür; tek dokunuşla “Solunda araç”, “Bu tur pit” gibi spotter mesajları ya da kendi mesajını gönderir. Yetki verdiysen pit ayarlarını uzaktan değiştirir: eklenecek yakıt miktarı, hangi lastiklerin değişeceği, hızlı tamir ve vizör filmi (uzaktan pit ayarı iRacing'de çalışır). İzlemek ücretsiz; pit ayarı yetkisi vermek için sürücünün PRO olması gerekir. Veri 1–2 saniye gecikmeli gelir, sesli görüşme yoktur.",
    "Add a friend to your crew and they can connect to you while you race, from the app or from their phone (the Crew page on the website). On the Crew pit wall they see the cars around you, gaps, flags, weather, a car-alongside indicator, your fuel and your tyres live, and send one-tap spotter messages such as “Car on your left” or “Pit this lap”, or a message of their own. If you allow it they change your pit settings remotely: the amount of fuel to add, which tyres to change, fast repair and tear-off (remote pit settings work in iRacing). Watching is free; granting pit control requires the driver to be PRO. Data arrives 1–2 seconds late and there is no voice chat.",
  ],
  fx_so6_t: ["Sürücü profili", "Driver profile"],
  fx_so6_d: ["Profil fotoğrafı, tanıtım yazısı ve sosyal bağlantılar; sitedeki Yarışçılar sayfasında turların ve istatistiklerin.", "Profile photo, bio and social links; your laps and stats on the website's Drivers page."],

  // ---- Araçlar ----
  fx_to_eyebrow: ["Araçlar", "Tools"],
  fx_to_title: ["Yarış dışında da işe yarayan araçlar", "Tools that help off track too"],
  fx_to_lead: ["Telemetri, ekran görüntüleri, düzen ve profil yönetimi, OBS yayın düzenleri ve VR.", "Telemetry, screenshots, layout and profile management, OBS stream layouts and VR."],
  fx_to1_t: ["Telemetri", "Telemetry"],
  fx_to1_d: ["Sürdüğün her tur kendiliğinden kaydedilir.", "Every lap you drive is recorded automatically."],
  fx_to1_h: [
    "Süre, geçerlilik, olaylar, sektörler ve hız / gaz / fren izi|Tur karşılaştırma: iki turun izleri üst üste ve aradaki fark|Pist / araç sıralaması (lider tablosu)|Diğer sürücülerin ve takım arkadaşlarının turlarını incele|Bulut yedeği; turların sitedeki Yarışçılar sayfasında",
    "Time, validity, incidents, sectors and speed / throttle / brake trace|Lap comparison: two laps overlaid with the delta between them|Track / car leaderboard|Study the laps of other drivers and teammates|Cloud backup; your laps on the website's Drivers page",
  ],
  fx_to2_t: ["Ekran görüntüleri", "Screenshots"],
  fx_to2_d: ["Tek tuşla, overlay'lerle birlikte.", "One key, with your overlays included."],
  fx_to2_h: [
    "Varsayılan kısayol F12 (değiştirilebilir)|Oyunu overlay'lerle birlikte yakalar, filigran ekler|Resimler\\SRTR Pitwall klasörüne kaydeder|Galeri: SRTR Pitwall ve iRacing ekran görüntüleri bir arada|Galeriden toplulukta paylaş (PRO)",
    "Default hotkey F12 (configurable)|Captures the game together with the overlays and adds a watermark|Saves to Pictures\\SRTR Pitwall|Gallery: SRTR Pitwall and iRacing screenshots together|Share to the community from the gallery (PRO)",
  ],
  fx_to3_t: ["Düzenler ve profiller", "Layouts and profiles"],
  fx_to3_d: ["Her araç ve oturum için ayrı düzen; geçiş kendiliğinden.", "A layout per car and session; switching is automatic."],
  fx_to3_h: [
    "Profil kuralları: hangi araçlarda ve hangi oturumlarda (antrenman, sıralama, yarış) kullanılacağı|Otomatik geçiş: araca ve oturuma en uygun düzen kendiliğinden seçilir|Çoklu monitör, hizalama kılavuzları ve ızgara|Ayarların bulut yedeği|Kısayollar: düzenleme modu, overlay'leri gizle, paneli aç",
    "Profile rules: which cars and which sessions (practice, qualifying, race) a layout is for|Auto-switch: the best matching layout for the car and session is selected by itself|Multi-monitor, alignment guides and grid|Cloud backup of your settings|Hotkeys: edit mode, hide overlays, open the panel",
  ],
  fx_to4_t: ["Yayın düzenleri (OBS)", "Stream layouts (OBS)"],
  fx_to4_d: ["Yayına özel düzenler, OBS'te tarayıcı kaynağı olarak.", "Stream-only layouts, as a browser source in OBS."],
  fx_to4_h: [
    "Kendi düzenine bağla: sürüş düzeninde yaptığın her değişiklik yayına kendiliğinden yansır|Çözünürlük seçimi: hazır tuval boyutları ve 1080×1920 dikey|Şeffaf arka plan; adresi OBS'e yapıştırman yeterli|Canlı sohbet, anket ve altyazı için ayrı OBS sayfaları",
    "Link to your own layout: every change in your driving layout is mirrored to the stream automatically|Resolution choice: preset canvas sizes and 1080×1920 vertical|Transparent background; just paste the address into OBS|Separate OBS pages for live chat, polls and captions",
  ],
  fx_to5_t: ["VR", "VR"],
  fx_to5_d: ["Overlay'lerin gözlüğün içinde.", "Your overlays inside the headset."],
  fx_to5_h: [
    "VR modu: her overlay ayrı bir pencere ya da tüm düzen tek “VR Panosu” penceresi|OpenKneeboard, OVR Toolkit, Desktop+, XSOverlay gibi pencere yakalama araçlarıyla çalışır|Opak arka plan (siyah / yeşil / özel renk), pencereleri masaüstünün dışına koyma|Deneysel: yerel SteamVR (OpenVR) overlay'i — yakalama aracı olmadan doğrudan gözlüğe çizer",
    "VR mode: every overlay as its own window, or the whole layout in a single “VR Board” window|Works with window-capture tools such as OpenKneeboard, OVR Toolkit, Desktop+ and XSOverlay|Opaque background (black / green / custom colour), windows can be parked off the desktop|Experimental: native SteamVR (OpenVR) overlay — draws straight into the headset without a capture tool",
  ],
  fx_ex1_t: ["{0} araç markası logosu", "{0} car brand logos"],
  fx_ex1_d: ["Logolar programla gelir; Yakındakiler, Sıralama ve Yakın Takip'te araç markası logo olarak görünür.", "Logos ship with the app; Relative, Standings and Close Battle show the car brand as a logo."],
  fx_ex2_t: ["{0} dil", "{0} languages"],
  fx_ex2_d: [
    "English, Türkçe, Deutsch, Español, Français, Italiano, Português (BR / PT), Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.",
    "English, Türkçe, Deutsch, Español, Français, Italiano, Português (BR / PT), Nederlands, Polski, Svenska, Suomi, Русский, 简体中文, 日本語.",
  ],
  fx_ex3_t: ["Ek pencereler", "Extra windows"],
  fx_ex3_d: ["Pitwall Paneli, Live Timing ve Mühendis Ekranı: ikinci monitör ya da takım mühendisin için ayrı pencereler.", "Pitwall Panel, Live Timing and Engineer Screen: separate windows for a second monitor or your team engineer."],
  fx_ex4_t: ["Olaylar ve replay", "Events and replay"],
  fx_ex4_d: ["Yarış bitince olaylar listesi açılır: kazalar, geçişler, pit girişleri. Birine tıkla, iRacing replay'i o ana atlasın.", "When the race ends the events list opens: incidents, overtakes, pit stops. Click one and the iRacing replay jumps to that moment."],
  fx_ex5_t: ["Demo modu", "Demo mode"],
  fx_ex5_d: ["Oyunu açmadan bütün overlay'leri canlı veriyle dene, düzenini hazırla.", "Try every overlay with live-looking data and build your layout without starting the game."],
  fx_ex6_t: ["Hafif ve güncel", "Lightweight and up to date"],
  fx_ex6_d: ["Rust ile yazıldı; oyun kapalıyken overlay penceresi tamamen gizlenir. İmzalı otomatik güncellemeler.", "Written in Rust; the overlay window hides completely when the game isn't running. Signed automatic updates."],

  // ---- Simülasyonlar ----
  fx_si_eyebrow: ["Simülasyonlar", "Sims"],
  fx_si_title: ["Hangi oyunda ne çalışıyor?", "What works in which game?"],
  fx_si_lead: [
    "iRacing, Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate / rFactor 2 ve Automobilista 2. Hangi oyunu açarsan kendiliğinden algılar. Her oyunun verdiği veri farklıdır; en eksiksiz destek iRacing'dedir.",
    "iRacing, Assetto Corsa Competizione, Assetto Corsa, Le Mans Ultimate / rFactor 2 and Automobilista 2. Whichever game you start is detected automatically. Each game exposes different data; iRacing has the most complete support.",
  ],
  fx_si_r1: ["Pedallar, vites, yakıt, tur süreleri, direksiyon ekranı, telemetri", "Pedals, gear, fuel, lap times, wheel display, telemetry"],
  fx_si_r2: ["Pist haritası ve mini harita <span class=\"muted\">(AC / ACC: haritada sadece sen)</span>", "Track map and mini map <span class=\"muted\">(AC / ACC: only you on the map)</span>"],
  fx_si_r3: ["Hava <span class=\"muted\">(AC: yağış / ıslaklık yok)</span>", "Weather <span class=\"muted\">(AC: no rain / wetness)</span>"],
  fx_si_r4: ["Lastikler <span class=\"muted\">(ACC: aşınma yok, AMS2: basınç yok)</span>", "Tyres <span class=\"muted\">(ACC: no wear, AMS2: no pressure)</span>"],
  fx_si_r5: [
    "Rakipler: Yakındakiler, Sıralama, Battle Box, Yakın Takip, Düz Harita, Fark Grafiği, Rakip Takibi, Pit Penceresi, Kafa Kafaya, Yarış Sonucu",
    "Opponents: Relative, Standings, Battle Box, Close Battle, Flat Map, Gap Chart, Rival Tracker, Pit Window, Head to Head, Race Result",
  ],
  fx_si_r6: ["Radar ve Çubuk Spotter", "Radar and Spotter Bars"],
  fx_si_r7: ["Piste Dönüş", "Rejoin Helper"],
  fx_si_r8: ["Delta Bar", "Delta Bar"],
  fx_si_r9: ["Pit Hızı <span class=\"muted\">(iRacing dışında hız sınırı bilinmiyor; hız ve sınırlayıcı uyarısı çalışır)</span>", "Pit Speed <span class=\"muted\">(limit unknown outside iRacing; speed and limiter warning work)</span>"],
  fx_si_r10: ["Olay Sayacı ve Olay Günlüğü", "Incident Counter and Incident Log"],
  fx_si_r11: ["Hızlı Sınıf Uyarısı", "Faster Class Warning"],
  fx_si_r12: ["Sektör Süreleri, Fren ve Vites İşareti, Rüzgâr Pusulası, Stint Özeti", "Sector Times, Brake & Gear Markers, Wind Compass, Stint Summary"],
  fx_si_r13: [
    "Pist Limiti ve Hasar Göstergesi <span class=\"muted\">(ayrıntı oyuna göre değişir; olay puanı ve tamir süresi iRacing)</span>",
    "Track Limits and Damage Indicator <span class=\"muted\">(detail varies by game; incident points and repair time in iRacing)</span>",
  ],
  fx_si_r14: ["Sürücü Değişimi", "Driver Swap"],
  fx_si_r15: [
    "Start Işıkları <span class=\"muted\">(ACC: yaklaşık; AMS2: yalnızca grid ve start anı)</span>",
    "Start Lights <span class=\"muted\">(ACC: approximate; AMS2: grid and start moment only)</span>",
  ],
  fx_si_r16: [
    "Ekipten uzaktan pit ayarı <span class=\"muted\">(diğer oyunlarda ekip yalnızca izler ve mesaj gönderir)</span>",
    "Remote pit settings from your crew <span class=\"muted\">(in other games the crew can only watch and send messages)</span>",
  ],
  fx_si_note: [
    "✓ çalışır · ◐ kısmen · — o oyun bu veriyi vermiyor. LMU / rF2 için rF2 Shared Memory eklentisi, AMS2 için oyun ayarlarında Shared Memory: Project CARS 2 gerekir.",
    "✓ works · ◐ partly · — the game doesn't expose this data. LMU / rF2 need the rF2 Shared Memory plugin; AMS2 needs Shared Memory: Project CARS 2 in the game options.",
  ],

  // ---- PRO ----
  fx_pr_eyebrow: ["Ücretsiz ve PRO", "Free and PRO"],
  fx_pr_title: ["Çoğu şey ücretsiz; PRO üstüne koyar", "Most of it is free; PRO adds on top"],
  fx_pr_lead: [
    "SRTR Pitwall hesap açmadan da çalışır. Ücretsiz hesap sosyal özellikleri, topluluğu (düzen ve temaları kullanma, puan ve yorum dahil) ve bulut yedeğini açar. PRO; sesli mühendisi, canlı sohbetin gelişmiş araçlarını ve özel tasarımları ekler.",
    "SRTR Pitwall works without an account. A free account unlocks the social features, the community (including using, rating and commenting on layouts and themes) and cloud backup. PRO adds the voice engineer, the advanced live chat tools and the special designs.",
  ],
  fx_pr_free_t: ["Ücretsiz", "Free"],
  fx_pr_free: [
    "{0} overlay'in {1} tanesi|Düzen yöneticisi, profiller, otomatik geçiş, tema düzenleme|OBS yayın düzenleri|Ekran görüntüsü alma|Telemetri kaydı, tur karşılaştırma, lider tablosu|Arkadaşlar, mesajlar, gruplar, takımlar|Ücretsiz hesapla topluluk düzenlerine ve temalarına göz atma, onları kullanma, puan verme ve yorum yazma (dashboard'larda da puan ve yorum)|Bir arkadaşının ekibinde olup yarışını uygulamadan ya da telefondan canlı izleme|Canlı Sohbet: bir kanal, moderasyon, OBS kaynağı|Düzen ve yayın düzeni paylaşma|VR modu",
    "{1} of the {0} overlays|Layout manager, profiles, auto-switch, theme editing|OBS stream layouts|Taking screenshots|Telemetry recording, lap comparison, leaderboard|Friends, messages, groups, teams|With a free account: browse community layouts and themes, use them, rate them and comment (rating and comments on dashboards too)|Being on a friend's crew and watching their race live from the app or a phone|Live Chat: one channel, moderation, OBS source|Sharing layouts and stream layouts|VR mode",
  ],
  fx_pr_pro_t: ["PRO", "PRO"],
  fx_pr_pro: [
    "Sesli mühendis, spotter ve sesli komut (bas-konuş)|Sohbet Anketi ve Altyazı overlay'leri|Canlı Sohbet: çoklu kanal, sesli okuma, altyazı, sohbete yazma, kayıt görüntüleyici|Araç tarzı direksiyon ekranları, PRO pedal / direksiyon tasarımları ve yeni overlay'lerin PRO tasarımları|Güvenilir arkadaşlarla canlı veri paylaşımı|Ekip: arkadaşlarının pit ayarlarını (yakıt, lastik) uzaktan değiştirmesine izin verme|Ekran görüntüsü ve tema paylaşma, Dashboard Tasarımcısı|Mesajları sesli okuma, arkadaş görünümünü özelleştirme|Aynı anda 2 bilgisayarda kullanım",
    "Voice engineer, spotter and voice commands (push-to-talk)|Chat Poll and Captions overlays|Live Chat: multiple channels, read-aloud, captions, writing to chat, log viewer|Car-style wheel displays, PRO pedal / steering wheel designs and the PRO designs of the new overlays|Live data sharing with trusted friends|Crew: letting your friends change your pit settings (fuel, tyres) remotely|Sharing screenshots and themes, Dashboard Designer|Message read-aloud, customising how friends look|Use on 2 computers at the same time",
  ],
  fx_pr_trial: [
    "Yeni hesaplara {0} günlük PRO denemesi: deneme süresince bütün PRO özellikleri açık, kart bilgisi gerekmez.",
    "New accounts get a {0}-day PRO trial: every PRO feature is unlocked during the trial, no card required.",
  ],
  fx_pr_note: [
    "Ücretsiz / PRO ayrımı zamanla değişebilir; güncel durumu programda her özelliğin yanındaki PRO etiketinden görürsün.",
    "The free / PRO split can change over time; the PRO tag next to each feature in the app shows the current state.",
  ],
  fx_cta_title: ["Hepsini kendin dene", "Try it all yourself"],
  fx_cta_lead: ["Ücretsiz indir, dakikalar içinde kur. Demo moduyla oyunu açmadan bile bakabilirsin.", "Download free and set up in minutes. With demo mode you can look around without even starting the game."],
});

let cfg = null;
const nf = (n) => Number(n).toLocaleString(document.documentElement.lang || "en");

/** Çizimler (görsel yüklenmemiş yuvaların varsayılanı) */
function mock(kind) {
  if (kind === "trace")
    return `<div class="mock mock-trace" aria-hidden="true"><svg viewBox="0 0 320 150" preserveAspectRatio="none">
      <polyline class="a" points="0,30 40,28 60,90 90,120 120,60 160,26 200,30 220,100 250,118 280,50 320,28"/>
      <polyline class="b" points="0,36 40,32 64,96 94,112 124,66 160,30 200,34 224,104 252,110 284,56 320,32"/>
      <polyline class="c" points="0,140 50,140 62,70 84,70 96,140 208,140 222,60 246,60 258,140 320,140"/></svg>
      <div class="mt-row"><span>2:17.482</span><span class="g">−0.214</span><span>S1 · S2 · S3</span></div></div>`;
  if (kind === "shot")
    return `<div class="mock mock-shot" aria-hidden="true"><div class="msh-frame"><i></i><i></i><i></i><b>SRTR PITWALL</b></div><kbd>F12</kbd></div>`;
  if (kind === "layout")
    return `<div class="mock mock-layout" aria-hidden="true"><div class="ml-scr"><i style="left:4%;top:8%;width:24%;height:34%"></i><i style="right:4%;top:8%;width:20%;height:26%"></i><i style="left:36%;bottom:8%;width:28%;height:16%"></i><i style="right:4%;bottom:8%;width:22%;height:30%"></i></div>
      <div class="ml-tabs"><span class="on">GT3 · Race</span><span>Formula · Quali</span><span>Stream</span></div></div>`;
  if (kind === "stream")
    return `<div class="mock mock-layout mock-stream" aria-hidden="true"><div class="ml-scr"><i style="left:4%;top:8%;width:26%;height:50%"></i><i style="right:4%;top:8%;width:22%;height:60%"></i><i style="left:30%;bottom:6%;width:40%;height:12%"></i><em>● LIVE</em></div>
      <div class="ml-tabs"><span class="on">1920×1080</span><span>2560×1440</span><span>1080×1920</span></div></div>`;
  return `<div class="mock mock-vr" aria-hidden="true"><div class="mvr-set"><i></i><i></i></div><div class="mvr-pan"><span></span><span></span><span></span></div></div>`;
}

function tagHtml(kind) {
  return `<span class="tag ${kind}" data-t="fx_tag_${kind}"></span>`;
}

/** Yöneticinin overlay kararları (app_config.pro_overlays) varsayılanın üstüne yazılır */
function tagOf(id, def) {
  const list = Array.isArray(cfg?.pro_overlays) ? cfg.pro_overlays : null;
  if (!list) return def;
  if (list.includes(id)) return "pro";
  return def === "pro" ? "free" : def;
}

/** İskelet bir kez kurulur; metinler data-t / data-tl ile dil değişince yenilenir */
function build() {
  $("#fx-toc").innerHTML = TOC.map((k) => `<a href="#${k}" data-t="fx_toc_${k}"></a>`).join("");
  $("#fx-overlays").innerHTML = OVERLAYS.map(
    ([g, list]) => `<div class="fx-group">
      <div class="fx-group-head"><h3><span data-t="fx_g_${g}"></span> <small>${list.length}</small></h3><p class="muted small" data-t="fx_g_${g}_d"></p></div>
      <div class="grid g3 fx-ov-grid">${list
        .map(
          ([id, ic, tag]) => `<article class="card fx-ov" id="ov-${id}" data-ov="${id}" data-def="${tag}">
        <header><span class="ic">${ic}</span><h4 data-t="ov_${id}_n"></h4><span class="fx-tag-slot"></span></header>
        <p data-t="ov_${id}_d"></p>
        <ul class="fx-dots" data-tl="ov_${id}_h"></ul>
      </article>`,
        )
        .join("")}</div></div>`,
  ).join("");
  const cards = (rows, note = false) =>
    rows
      .map(
        ([ic, k]) =>
          `<div class="card feat"><div class="ic">${ic}</div><h3 data-t="${k}_t"${k === "fx_ex1" ? ` data-a="${LOGOS}"` : k === "fx_ex2" ? ` data-a="${LANGS}"` : ""}></h3><p data-t="${k}_d"></p>${
            note ? `<p class="fx-cardnote" data-t="${k}_n"></p>` : ""
          }</div>`,
      )
      .join("");
  $("#fx-community").innerHTML = cards(COMMUNITY, true);
  $("#fx-social").innerHTML = cards(SOCIAL);
  $("#fx-tools").innerHTML =
    TOOLS.map(
      ([k, slot, kind], i) => `<div class="split fx-tool${i % 2 ? " rev" : ""}">
        <div><h3 data-t="${k}_t"></h3><p class="muted" data-t="${k}_d"></p><ul class="checks" data-tl="${k}_h"></ul></div>
        <div class="slot-box" data-slot="${slot}">${mock(kind)}</div>
      </div>`,
    ).join("") + `<div class="grid g3 fx-cards">${cards(EXTRAS)}</div>`;
  const mark = (v) => (v === 1 ? `<span class="y">✓</span>` : v === 2 ? `<span class="p">◐</span>` : `<span class="n">—</span>`);
  $("#fx-sims").innerHTML = SIMS.map(([k, ...v]) => `<tr><td data-t="${k}"></td>${v.map((x) => `<td>${mark(x)}</td>`).join("")}</tr>`).join("");
}

/** Dile bağlı metinler: listeler, sayılı başlıklar, etiketler */
function fill() {
  applyLang();
  // {0} içeren başlıklar
  $$("[data-a]").forEach((el) => (el.innerHTML = T(el.dataset.t, el.dataset.a)));
  $('[data-t="fx_ov_title"]').innerHTML = T("fx_ov_title", OVERLAY_ROUND);
  $('[data-t="fx_vo_cat_lead"]').innerHTML = T("fx_vo_cat_lead", VOICE.categories);
  let proCount = 0;
  $$("[data-ov]").forEach((el) => {
    const kind = tagOf(el.dataset.ov, el.dataset.def);
    if (kind === "pro") proCount++;
    $(".fx-tag-slot", el).innerHTML = tagHtml(kind);
  });
  const args = {
    fx_vo_points: [nf(VOICE.catalog), nf(VOICE.used), nf(VOICE.spoken), nf(VOICE.numbers)],
    fx_pr_free: [OVERLAY_COUNT, OVERLAY_COUNT - proCount],
  };
  $$("[data-tl]").forEach((el) => {
    const tag = el.dataset.tlTag || "li";
    el.innerHTML = T(el.dataset.tl, ...(args[el.dataset.tl] || []))
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `<${tag}>${s}</${tag}>`)
      .join("");
  });
  const stat = (n, k) => `<div><b>${esc(String(n))}</b><span>${esc(T(k))}</span></div>`;
  $("#fx-stats").innerHTML =
    stat(OVERLAY_ROUND, "fx_st_overlays") + stat(6, "fx_st_sims") + stat(nf(VOICE.used), "fx_st_phrases") + stat(LOGOS, "fx_st_logos") + stat(LANGS, "fx_st_langs");
  $("#fx-voice-stats").innerHTML =
    stat(nf(VOICE.catalog), "fx_vo_s1") + stat(nf(VOICE.used), "fx_vo_s2") + stat(nf(VOICE.recordings), "fx_vo_s3") + stat(VOICE.categories, "fx_vo_s4");
  const days = cfg && cfg.trial_enabled !== false ? Number(cfg.trial_days ?? 3) || 0 : cfg ? 0 : 3;
  $("#fx-trial").innerHTML = (days > 0 ? T("fx_pr_trial", days) + " " : "") + T("fx_pr_note");
  $$(".fx-tag-slot [data-t]").forEach((el) => (el.innerHTML = T(el.dataset.t)));
}

async function main() {
  build();
  await boot("/features", "features");
  fill();
  document.addEventListener("langchange", fill);
  applyCachedImages();
  cfg = await appConfig().catch(() => null);
  if (cfg && !Object.keys(cfg).length) cfg = null;
  if (cfg) fill();
  initSiteImages(cfg);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main();
