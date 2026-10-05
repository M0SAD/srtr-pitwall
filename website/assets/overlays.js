// Overlay listesi: tek yer. Özellikler sayfası (features.js), ana sayfadaki Overlay Galerisi (home.js) ve görsel
// yuvaları (siteimages.js) buradan okur. Kaynak: src/overlays/<id>/manifest.ts ("scene" gizlidir, listede yok).
// Yeni overlay eklenince: OVERLAYS + NAMES + GALLERY (ovg_<id>) buraya, ov_<id>_d / ov_<id>_h features.js'e,
// sayı counts.js'e, görsel assets/img/ov/<id>.webp olarak eklenir (yoksa galeride simgeli yer tutucu çıkar).
// Metinler Türkçe + İngilizce (addDict); diğer diller assets/lang/<kod>.json.
import { addDict } from "./core.js";

// [grup, [[overlay kimliği, simge, varsayılan etiket: free | pro | mixed], …]]
export const OVERLAYS = [
  [
    "race",
    [
      ["relative", "↕️", "free"],
      ["standings", "🏆", "free"],
      ["duel", "🎯", "pro"],
      ["battlebox", "⚔️", "free"],
      ["gapchart", "📉", "pro"],
      ["target", "🔭", "pro"],
      ["trackmap", "🗺️", "free"],
      ["flatmap", "➖", "free"],
      ["minimap", "🧭", "free"],
      ["radar", "📡", "free"],
      ["spotterbar", "🚦", "mixed"],
      ["overtake", "⏩", "free"],
      ["rejoin", "↩️", "pro"],
    ],
  ],
  [
    "car",
    [
      ["dashboard", "🎛️", "mixed"],
      ["inputs", "🦶", "mixed"],
      ["pedals", "🎚️", "mixed"],
      ["ers", "🔋", "mixed"],
      ["gforce", "🌀", "free"],
      ["telemetry", "⚙️", "free"],
      ["delta", "⏱️", "free"],
      ["sectors", "🟪", "mixed"],
      ["laptimes", "📋", "free"],
      ["corners", "〰️", "pro"],
      ["brakepoint", "🛑", "mixed"],
      ["tracklimits", "🚷", "mixed"],
      ["tires", "🛞", "free"],
      ["damage", "🛠️", "pro"],
      ["dataframe", "🔢", "free"],
      ["glucose", "🩸", "free"],
      ["pitspeed", "🚧", "free"],
    ],
  ],
  [
    "strategy",
    [
      ["fuel", "⛽", "free"],
      ["pitwindow", "🪟", "mixed"],
      ["stint", "📈", "free"],
      ["driverswap", "🔁", "free"],
      ["crewcall", "📣", "pro"],
      ["session", "🏁", "free"],
      ["digiflags", "🚩", "free"],
      ["weather", "🌦️", "free"],
      ["windcompass", "💨", "free"],
      ["incidents", "⚠️", "free"],
      ["incidentlog", "🧾", "free"],
    ],
  ],
  [
    "stream",
    [
      ["livechat", "💬", "mixed"],
      ["livepoll", "📊", "pro"],
      ["captions", "🔤", "pro"],
      ["startlights", "🚥", "free"],
      ["drivercard", "🪪", "pro"],
      ["h2h", "🆚", "pro"],
      ["results", "🏅", "pro"],
      ["goalbar", "🥅", "mixed"],
      ["webview", "🌐", "free"],
    ],
  ],
  [
    "social",
    [
      ["messages", "✉️", "pro"],
      ["voice", "🎙️", "mixed"],
    ],
  ],
];

/** Düz liste: [{ id, icon, tag, group }] (galeri sırası) */
export const OVERLAY_LIST = OVERLAYS.flatMap(([group, list]) => list.map(([id, icon, tag]) => ({ id, icon, tag, group })));
export const OVERLAY_TOTAL = OVERLAY_LIST.length;
/** Başlıklarda gösterilen yuvarlak sayı: 51 → "50+" */
export const OVERLAY_ROUND = `${Math.floor(OVERLAY_TOTAL / 10) * 10}+`;

/** Galeri görseli: siteyle gelen varsayılan dosya ve yönetim panelindeki yuva adı */
export const overlayImage = (id) => `assets/img/ov/${id}.webp`;
export const overlaySlot = (id) => `ov.${id}`;

/** Overlay adları [tr, en] → ov_<id>_n */
export const NAMES = {
  relative: ["Yakındakiler (Relative)", "Relative"],
  standings: ["Sıralama Tablosu", "Standings"],
  duel: ["Yakın Takip", "Close Battle"],
  battlebox: ["Battle Box", "Battle Box"],
  gapchart: ["Fark Grafiği", "Gap Chart"],
  target: ["Rakip Takibi", "Rival Tracker"],
  trackmap: ["Pist Haritası", "Track Map"],
  flatmap: ["Düz Harita", "Flat Map"],
  minimap: ["Mini Harita", "Mini Map"],
  radar: ["Radar", "Radar"],
  spotterbar: ["Çubuk Spotter", "Spotter Bars"],
  overtake: ["Hızlı Sınıf Uyarısı", "Faster Class Warning"],
  rejoin: ["Piste Dönüş", "Rejoin Helper"],
  dashboard: ["Direksiyon Ekranı", "Steering Wheel Display"],
  inputs: ["Pedallar & Girdi", "Pedals & Inputs"],
  pedals: ["Pedal Seti", "Pedal Set"],
  ers: ["ERS ve Batarya", "ERS & Battery"],
  gforce: ["G-Force", "G-Force"],
  telemetry: ["Telemetri Paneli", "Telemetry Panel"],
  delta: ["Delta Bar", "Delta Bar"],
  sectors: ["Sektör Süreleri", "Sector Times"],
  laptimes: ["Tur Süreleri", "Lap Times"],
  corners: ["Viraj Analizi", "Corner Analysis"],
  brakepoint: ["Fren ve Vites İşareti", "Brake & Gear Markers"],
  tracklimits: ["Pist Limiti", "Track Limits"],
  tires: ["Lastikler", "Tyres"],
  damage: ["Hasar Göstergesi", "Damage Indicator"],
  dataframe: ["Veri Kutusu", "Data Box"],
  glucose: ["Kan Şekeri", "Blood Glucose"],
  pitspeed: ["Pit Hızı", "Pit Speed"],
  fuel: ["Yakıt Hesaplayıcı", "Fuel Calculator"],
  pitwindow: ["Pit Penceresi", "Pit Window"],
  stint: ["Stint Özeti", "Stint Summary"],
  driverswap: ["Sürücü Değişimi", "Driver Swap"],
  crewcall: ["Ekip Çağrısı", "Crew Call"],
  session: ["Oturum & Bayraklar", "Session & Flags"],
  digiflags: ["DigiFlags", "DigiFlags"],
  weather: ["Canlı Hava", "Live Weather"],
  windcompass: ["Rüzgâr Pusulası", "Wind Compass"],
  incidents: ["Olay Sayacı", "Incident Counter"],
  incidentlog: ["Olay Günlüğü", "Incident Log"],
  livechat: ["Canlı Sohbet", "Live Chat"],
  livepoll: ["Sohbet Anketi", "Chat Poll"],
  captions: ["Altyazı", "Captions"],
  startlights: ["Start Işıkları", "Start Lights"],
  drivercard: ["Sürücü Kartı", "Driver Card"],
  h2h: ["Kafa Kafaya", "Head to Head"],
  results: ["Yarış Sonucu", "Race Result"],
  goalbar: ["Hedef Çubuğu", "Goal Bar"],
  webview: ["Webview", "Webview"],
  messages: ["Mesajlar", "Messages"],
  voice: ["Sesli Mühendis altyazısı", "Voice Engineer subtitles"],
};
addDict(Object.fromEntries(Object.entries(NAMES).map(([id, v]) => [`ov_${id}_n`, v])));

// Grup başlıkları (Özellikler sayfası + galeri listesi)
addDict({
  fx_g_race: ["Yarış bilgisi", "Race information"],
  fx_g_car: ["Araç ve telemetri", "Car and telemetry"],
  fx_g_strategy: ["Strateji ve oturum", "Strategy and session"],
  fx_g_stream: ["Yayın ve sohbet", "Streaming and chat"],
  fx_g_social: ["Sosyal ve ses", "Social and voice"],
});

// Overlay Galerisi (ana sayfa): her overlay için uzman olmayanın da anlayacağı ayrıntılı açıklama → ovg_<id>
addDict({
  ovg_eyebrow: ["Overlay Galerisi", "Overlay Gallery"],
  ovg_title: ["{0} overlay'in hepsine tek tek bak", "Take a look at all {0} overlays"],
  ovg_lead: [
    "Listeden bir overlay seç; ne gösterdiğini, ne zaman işe yaradığını ve öne çıkan ayarlarını oku. Hepsi sürüklenir, boyutlanır ve kendi ayar sayfasından özelleştirilir.",
    "Pick an overlay from the list to see what it shows, when it helps and which options stand out. Every one can be dragged, resized and customised from its own settings page.",
  ],
  ovg_list: ["Overlay listesi", "Overlay list"],
  ovg_prev: ["Önceki overlay", "Previous overlay"],
  ovg_next: ["Sonraki overlay", "Next overlay"],
  ovg_more: ["Tüm özellikleri →", "All its features →"],
  ovg_hint: ["İpucu: listede ↑ ↓ tuşlarıyla gezebilirsin.", "Tip: use the ↑ ↓ keys to move through the list."],
  ovg_tag_free: ["Ücretsiz", "Free"],
  ovg_tag_pro: ["PRO", "PRO"],
  ovg_tag_mixed: ["Ücretsiz + PRO seçenekler", "Free + PRO options"],

  ovg_relative: [
    "Pistte hemen önünde ve arkanda kimlerin olduğunu, aradaki süre farkıyla birlikte listeler. Kiminle mücadele ettiğini, kimin tur bindirdiğini ya da pitten yeni çıktığını bir bakışta görürsün. Lisans, iRating, lastik, son tur, ülke bayrağı ve araç markası logosu gibi sütunları sen seçer ve sıralarsın; yarışta tahmini iRating değişimini de gösterebilir.",
    "Lists who is directly ahead of and behind you on track, with the time gap to each car. At a glance you see who you are fighting, who is lapping you and who has just left the pits. You choose and order the columns — licence, iRating, tyre, last lap, country flag, car brand logo — and it can show the estimated iRating change during a race.",
  ],
  ovg_standings: [
    "Yarışın sıralama tablosu: kim kaçıncı, lidere ya da öndeki araca ne kadar fark var. Çok sınıflı yarışlarda her sınıf kendi başlığı ve ortalama gücüyle (SOF) ayrı gösterilir. Tablonun tamamını ya da yalnızca “liderler + etrafımdakiler” görünümünü seçebilir; kazanılan / kaybedilen sıra, pit sayısı ve en iyi tur gibi sütunları açıp kapatabilirsin.",
    "The race leaderboard: who is in which position and how far they are from the leader or the car in front. In multi-class races each class gets its own header and strength of field (SOF). Show the whole table or just “leaders + around me”, and toggle columns such as positions gained / lost, pit count and best lap.",
  ],
  ovg_duel: [
    "Önündeki ve arkandaki araçlara olan farkı, makara gibi dönen küçük bir şeritte gösterir. Araç yaklaştıkça satırı büyür ve netleşir, uzaklaştıkça küçülüp silikleşir; böylece sayı okumadan tehlikenin yaklaştığını hissedersin. Eşiği saniye ya da metre olarak belirlersin; yakında kimse yokken kendiliğinden gizlenir.",
    "Shows the gap to the cars ahead and behind on a small strip that rolls like a reel. A row grows and sharpens as that car closes in and fades as it drops back, so you feel a threat coming without reading numbers. Set the threshold in seconds or metres; it hides itself when nobody is close.",
  ],
  ovg_battlebox: [
    "Sınıfında hemen önündeki ve hemen arkandaki sürücüyü iki küçük kutuda gösterir: araç numarası, isim, son tur süresi ve aradaki fark. Tam sıralama tablosu açmak istemediğinde ya da yayında ekranı sade tutmak istediğinde idealdir.",
    "Shows the driver directly ahead and directly behind you in your class in two small boxes: car number, name, last lap time and the gap. Ideal when you don't want a full leaderboard on screen, or want to keep a stream clean.",
  ],
  ovg_gapchart: [
    "Önündeki ve arkandaki araca (ya da sınıf liderine) olan süre farkının son turlarda nasıl değiştiğini çizgi grafikte gösterir. Rakibine yaklaşıyor musun, arkadaki seni yakalıyor mu; bunu tur tur görür, bu hızla kaç turda yakalayacağının tahminini okursun. Pit stoplar grafikte işaretlenir. Alt alta iki grafik ve sadece sayılardan oluşan liste ücretsiz, tek birleşik grafik PRO.",
    "Plots how the gap to the car ahead and the car behind (or to the class leader) has changed over the last laps. You see lap by lap whether you are catching your rival or being caught, with an estimate of how many laps it will take at this rate. Pit stops are marked on the chart. Two stacked charts and a numbers-only list are free; the single combined chart is PRO.",
  ],
  ovg_target: [
    "Seçtiğin tek bir rakibi yakından izler: sınıfta önündeki, arkandaki, sınıf lideri, belirli bir araç numarası ya da arkadaş listendeki bir sürücü. Sırasını, sana olan farkını ve bu farkın son turda nasıl değiştiğini, son ve en iyi turunu seninkiyle karşılaştırmalı gösterir. Pit durumu, lastiği ve farkın mini grafiği de aynı kartta; hangi bilgilerin görüneceğini sen seçersin.",
    "Keeps a close eye on one rival of your choice: the car ahead or behind in class, the class leader, a specific car number or a driver from your friends list. It shows their position, the gap to you and how it changed last lap, and their last and best lap compared with yours. Pit status, tyre and a mini gap chart sit on the same card, and you pick which fields appear.",
  ],
  ovg_trackmap: [
    "Pistin tamamını ve üzerindeki bütün araçları kuşbakışı gösterir. Pist şekli ilk temiz turunda kendiliğinden kaydedilir; elle bir şey çizmen gerekmez. Sınıf renkleri, araç numarası ya da sınıf sırası, pit yolu ve kendi pit kutun haritada görünür; haritayı döndürebilir, aynalayabilir ve renklerini değiştirebilirsin.",
    "A bird's-eye view of the whole track with every car on it. The track shape is recorded automatically on your first clean lap, so there is nothing to draw by hand. Class colours, car number or class position, the pit lane and your own pit stall are shown; you can rotate, mirror and recolour the map.",
  ],
  ovg_flatmap: [
    "Pisti düz bir şerit gibi açar ve bütün araçları bu şeridin üzerinde sınıf renkleriyle gösterir. Önünde ve arkanda ne kadar boşluk olduğunu, trafiğin nerede yığıldığını tek satırda görürsün. İstersen sen ortada kalırsın, istersen başlangıç / bitiş çizgisi solda durur; arkadaşların ayrı renkte işaretlenir.",
    "Unrolls the track into a straight strip and places every car on it in its class colour. One line tells you how much clear road you have ahead and behind and where traffic is bunching up. Keep yourself in the centre or the start / finish line on the left; friends are marked in their own colour.",
  ],
  ovg_minimap: [
    "Aracını merkeze alan, yakınlaştırılmış yuvarlak bir pist görünümü. Önündeki virajı ve hemen yakınındaki araçları gösterir; oyunlardaki mini haritalara benzer. İstersen gidiş yönün hep yukarıda kalacak şekilde döner.",
    "A zoomed, round track view centred on your car. It shows the corner coming up and the cars right around you, much like the mini maps in games. It can rotate so that your heading always points up.",
  ],
  ovg_radar: [
    "Yanındaki ve çok yakınındaki araçları kuşbakışı gösteren bir yakınlık radarı. Aynada göremediğin kör noktadaki aracı fark etmeni sağlar; yanında araç varken o taraf kırmızıya döner. Görüş mesafesini ayarlayabilirsin; çevrende kimse yokken kendiliğinden gizlenir.",
    "A proximity radar showing the cars beside and very close to you from above. It helps you notice a car in the blind spot your mirrors miss; the side turns red while a car is alongside. The range is adjustable and it hides itself when nobody is near.",
  ],
  ovg_spotterbar: [
    "Ekranın solunda ve sağında ince birer çubuk: yalnızca yanında araç olan taraf yanar. Çubuktaki işaret, yandaki aracın arkadan öne doğru ilerleyişini gösterir; tek araç, iki yanda araç ve tehlikeli yakınlık için ayrı renkler kullanılır. Radar kadar yer kaplamayan sade bir spotter isteyenler içindir. Düz çubuk ücretsiz; yay, segmentli ve neon gibi altı görünüm PRO.",
    "A thin bar on the left and right of the screen: only the side with a car alongside lights up. A marker on the bar shows that car moving from your rear to your front, with separate colours for one car, cars on both sides and dangerously close. For anyone who wants a spotter that takes less room than a radar. The flat bar is free; six other looks such as arc, segmented and neon are PRO.",
  ],
  ovg_overtake: [
    "Çok sınıflı yarışlarda arkandan yaklaşan daha hızlı sınıftaki araçları haber verir. Süre farkını ve aracın sınıf rengini gösterir; en yakındaki araç yaklaştıkça çubuk dolar. Böylece viraja girmeden önce yol verip vermeyeceğine karar verebilirsin. Yalnızca iRacing'de çalışır.",
    "In multi-class races it warns you about faster-class cars catching you from behind. It shows the time gap and the car's class colour, and a bar fills as the closest one approaches, so you can decide before the corner whether to let it through. Works in iRacing only.",
  ],
  ovg_rejoin: [
    "Pist dışına çıktığında ya da durduğunda kendiliğinden belirir. Arkadan gelen en yakın araçlara süre farkını gösterir ve piste dönmenin güvenli olup olmadığını söyler. Gerekmediğinde ekranda hiç yer kaplamaz.",
    "Appears by itself when you go off track or come to a stop. It shows the time gap to the closest cars coming from behind and tells you whether it is safe to rejoin. It takes no screen space when it isn't needed.",
  ],
  ovg_dashboard: [
    "Gerçek yarış direksiyonlarındaki ekranlara benzeyen bir gösterge paneli: vites, hız, devir ışıkları, delta, tur süreleri, yakıt ve lastikler tek ekranda. Klasik, Minimal, Yarış ve Dayanıklılık görünümleri ücretsizdir; her öğenin boyutunu ve rengini ayrı ayarlayabilirsin. PRO ile gerçek yarış araçlarından esinlenen 10 araç tarzı ekran, kendi ekranını çizdiğin Dashboard Tasarımcısı ve ekranı telefon ya da tablette açma özelliği gelir.",
    "A dash that looks like the screens on real racing steering wheels: gear, speed, shift lights, delta, lap times, fuel and tyres on one display. The Classic, Minimal, Race and Endurance views are free, and every element's size and colour can be adjusted. PRO adds 10 car-style displays inspired by real race cars, the Dashboard Designer for building your own display, and opening the dash on a phone or tablet.",
  ],
  ovg_inputs: [
    "Gaz, fren ve debriyaja ne kadar bastığını zaman içinde çizen bir iz grafiği; yanında pedal çubukları, vites, hız ve direksiyon açısı. Frene ne kadar yumuşak bastığını ya da gaza ne kadar erken döndüğünü görmek, sürüşünü geliştirmek ve yayında izleyiciye göstermek için kullanılır. ABS / TC devreye girdiğinde belli olur. Üç tasarım ücretsiz; sim tarzı klasik tasarım ve özel direksiyon görselleri PRO.",
    "A trace that draws how much throttle, brake and clutch you apply over time, next to pedal bars, gear, speed and steering angle. Use it to see how smoothly you brake or how early you get back on the throttle — for improving your driving or for showing viewers on stream. It shows when ABS / TC kick in. Three designs are free; the classic sim-style design and special steering wheel artwork are PRO.",
  ],
  ovg_pedals: [
    "Grafiği olmayan, sade bir pedal göstergesi: gaz, fren ve debriyaj çubukları, yüzdeler, vites, hız ve direksiyon. İz grafiğine ihtiyacın yoksa ya da ekranda az yer kaplamasını istiyorsan bunu kullan. Dikey çubuklar, kompakt şerit ve LED segmentler ücretsiz; pedal seti, yatay şeritler, halka göstergeler ve çerçevesiz HUD tasarımları PRO.",
    "A simple pedal display without a graph: throttle, brake and clutch bars, percentages, gear, speed and steering wheel. Use it when you don't need the trace or want something that takes little space. Vertical bars, a compact strip and LED segments are free; the pedal set, horizontal strips, ring gauges and frameless HUD designs are PRO.",
  ],
  ovg_ers: [
    "Hibrit araçlarda bataryanın ne kadar dolu olduğunu, bu turda net olarak enerji kazanıp kazanmadığını ve elektrik motorunun (MGU) gücünü gösterir. Bataryanın kaç turda boşalacağını ya da dolacağını tahmin eder; düşük ve dolu batarya için uyarır. Hibrit olmayan araçta kendiliğinden gizlenir. Yatay çubuk, dikey pil ve kompakt tasarım ücretsiz; halka gösterge ve detaylı panel PRO.",
    "For hybrid cars: how full the battery is, whether you gained or lost energy this lap and the electric motor (MGU) power. It estimates how many laps until the battery is empty or full and warns on low and full charge. It hides itself in cars without a hybrid system. Horizontal bar, vertical cell and compact designs are free; the ring gauge and detailed panel are PRO.",
  ],
  ovg_gforce: [
    "Aracın üzerindeki yanal (viraj) ve boyuna (fren / hızlanma) g kuvvetini anlık gösterir. İz bırakan klasik g-çemberi, lastiklerin tutunma sınırına ne kadar yaklaştığını ve fren ile dönüşü ne kadar iyi birleştirdiğini görmeni sağlar. Dört tasarım, tepe değer işaretleri, ölçek ve yumuşatma ayarı vardır; desteklenen bütün oyunlarda çalışır.",
    "Shows the lateral (cornering) and longitudinal (braking / acceleration) g-force on the car, live. The classic g-circle with a trail lets you see how close you are to the grip limit and how well you blend braking into turning. Four designs, peak markers, scale and smoothing settings; works in every supported sim.",
  ],
  ovg_telemetry: [
    "Vites halkası ve devir göstergesini tek, ince bir şeritte birleştirir. Hız, devir ışıkları, pozisyon, son tur, yakıt ve pist sıcaklığı aynı satırdadır. Büyük bir gösterge paneli yerine ekranın altında küçük bir bilgi şeridi isteyenler içindir.",
    "Combines a gear ring and a rev gauge in one slim strip. Speed, shift lights, position, last lap, fuel and track temperature sit on the same line. For drivers who want a small info strip at the bottom of the screen instead of a full dash.",
  ],
  ovg_delta: [
    "En iyi turuna göre şu an önde misin, geride misin; saniyenin binde biri hassasiyetiyle anlık gösterir. Çubuk yeşile dönüyorsa zaman kazanıyor, kırmızıya dönüyorsa kaybediyorsun; eğilim oku farkın büyüyüp küçüldüğünü belirtir. Sıralama turlarında ve tempo çalışırken en çok bakılan göstergedir. iRacing ve ACC'de çalışır.",
    "Shows live, to the thousandth of a second, whether you are ahead of or behind your best lap. A bar turning green means you are gaining time, red means you are losing it, and a trend arrow shows whether the difference is growing or shrinking. It is the gauge drivers watch most in qualifying and pace runs. Works in iRacing and ACC.",
  ],
  ovg_sectors: [
    "Güncel turunun sektör sürelerini canlı gösterir ve yayınlardaki gibi renklendirir: mor sınıfın en iyisi, yeşil kişisel en iyin, sarı daha yavaş. Turun hangi bölümünde zaman kazandığını ya da kaybettiğini hemen anlarsın; en iyi sektörlerinin toplamı olan teorik en iyi turu da görürsün. Farkı kişisel en iyine, son turuna ya da sınıfın en iyisine göre ölçebilirsin. Kompakt kutular ve renkli çubuklar ücretsiz, tablo tasarımı PRO.",
    "Shows the sector times of your current lap live, coloured the way broadcasts do it: purple for best in class, green for a personal best, yellow for slower. You immediately see in which part of the lap you gain or lose time, plus your theoretical best lap — the sum of your best sectors. The delta can be measured against your personal best, your last lap or the class best. Compact boxes and coloured bars are free; the table design is PRO.",
  ],
  ovg_laptimes: [
    "Son turlarının sürelerini ve sektörlerini bir liste halinde gösterir. Her turun en iyi turuna farkı ve o turda harcadığın yakıt yanında yazar; geçersiz ve pit turları işaretlenir. Temponun istikrarlı olup olmadığını ve lastikler eskidikçe ne kadar yavaşladığını görmek için kullanılır.",
    "Lists the times and sectors of your recent laps. Each lap shows its gap to your best and the fuel it used, and invalid and pit laps are marked. Use it to check how consistent your pace is and how much you slow down as the tyres wear.",
  ],
  ovg_corners: [
    "En iyi turundaki virajları kendiliğinden bulur ve her virajdaki en düşük hızını son turun ve süren turunla karşılaştırır. Böylece hangi virajda zaman bıraktığını tek tek görürsün. Pisti elle tanımlaman gerekmez.",
    "Finds the corners of your best lap automatically and compares your minimum speed in each one with your last lap and your current lap. That shows you, corner by corner, where you are leaving time on the table. No manual track setup is needed.",
  ],
  ovg_brakepoint: [
    "En iyi geçerli turunda nerede frene bastığını hatırlar ve sıradaki fren noktasına metre metre geri sayar. Virajın vitesini gösterir; virajdan sonra da referansa göre kaç metre erken ya da geç frenlediğini söyler. Yeni bir pisti öğrenirken ve fren noktalarını tutarlı hale getirirken çok işe yarar. Yatay geri sayım çubuğu ve büyük minimal işaret ücretsiz, dikey çubuk PRO.",
    "Remembers where you braked on your best valid lap and counts down, metre by metre, to the next braking point. It shows the gear for the corner and afterwards tells you how many metres earlier or later than the reference you braked. Very handy for learning a new track and making your braking points consistent. The horizontal countdown bar and the big minimal cue are free; the vertical bar is PRO.",
  ],
  ovg_tracklimits: [
    "Süren turun hâlâ geçerli olup olmadığını büyük ve net bir rozetle gösterir. Bu oturumda kaç kez pist dışına çıktığını, kaç turunun geçersiz sayıldığını ve iRacing'de olay puanının sınıra ne kadar yaklaştığını sayar. Pist dışına çıktığında ya da tur iptal olduğunda yanıp söner; sıralama turlarında emeğin boşa gitmeden haberdar olursun. Rozet tasarımı ücretsiz, şerit tasarımı PRO.",
    "Shows with a big, clear badge whether your current lap is still valid. It counts how often you went off track this session, how many laps were invalidated and — in iRacing — how close your incident points are to the limit. It flashes when you leave the track or lose the lap, so in qualifying you know at once. The badge design is free; the strip design is PRO.",
  ],
  ovg_tires: [
    "Dört lastiğin durumunu gösterir: her lastiğin iç, orta ve dış sıcaklığı, kalan dişi ve basıncı. Lastiklerin aşırı ısınıp ısınmadığını ve ne zaman değiştirmen gerektiğini anlamana yardım eder. Oyunun verdiği veriye göre bazı değerler yalnızca pitte güncellenir.",
    "Shows the state of all four tyres: inner, middle and outer temperature, remaining tread and pressure for each one. It helps you tell whether the tyres are overheating and when they need changing. Depending on what the game provides, some values only update in the pits.",
  ],
  ovg_damage: [
    "Aracının üstten görünen bir şeması: hasar alan bölgeler şiddetine göre sarı, turuncu ya da kırmızıya boyanır. Yanında tahmini tamir süresi ve motor uyarıları (su / yağ sıcaklığı, basınçlar) durur; böylece bir temastan sonra pite girmeye değer mi, hemen karar verirsin. Hasar yokken kendini gizleyebilir. Gösterilen ayrıntı oyuna göre değişir.",
    "A top-down diagram of your car: damaged areas turn yellow, orange or red by severity. Next to it are the estimated repair time and engine warnings (water / oil temperature, pressures), so after contact you can decide right away whether a pit stop is worth it. It can hide itself while the car is undamaged. The level of detail depends on the game.",
  ],
  ovg_glucose: [
    "Diyabetli sürücüler için: sürekli şeker ölçüm sensörünün (FreeStyle Libre, Dexcom ya da Nightscout) değerini yarışırken ekranında gösterir. Kan damlası simgesinin yanında anlık değer, yükselip düştüğünü gösteren ok ve küçük bir grafik bulunur; şekerin belirlediğin sınırların altına düşerse ya da üstüne çıkarsa çerçeve yanıp söner ve uyarı sesi çalar. Böylece uzun bir yarışta telefona bakmadan durumunu takip edebilirsin. Giriş bilgilerin yalnızca kendi bilgisayarında saklanır. Tıbbi cihaz değildir.",
    "For drivers with diabetes: shows the reading from your continuous glucose monitor (FreeStyle Libre, Dexcom or Nightscout) on screen while you race. Next to a blood-drop icon you get the current value, an arrow showing whether it is rising or falling, and a small graph; if your glucose drops below or climbs above the limits you set, the frame flashes and an alert sounds. That way you can keep an eye on it during a long race without looking at your phone. Your login details stay on your own computer. Not a medical device.",
  ],
  ovg_dataframe: [
    "Seçtiğin tek bir değeri büyük ve okunaklı gösteren küçük bir kutu: hız, vites, yakıt, delta, pozisyon, tur, sıcaklık, fren dengesi ve daha fazlası. Birkaç kutuyu yan yana koyarak tam istediğin gösterge düzenini parça parça kurabilirsin.",
    "A small box that shows one value of your choice, big and readable: speed, gear, fuel, delta, position, lap, temperature, brake bias and more. Put several boxes side by side to build exactly the dash you want, piece by piece.",
  ],
  ovg_pitspeed: [
    "Pit yoluna yaklaşırken ve pit yolundayken hızını hız sınırıyla birlikte gösterir. Sınırlayıcı kapalıysa uyarır, sınırı aşarsan kırmızı yanar; böylece hız cezası almazsın. Yalnızca gerektiğinde görünür.",
    "Shows your speed against the limit as you approach and drive through the pit lane. It warns you when the limiter is off and turns red if you exceed the limit, saving you from a speeding penalty. Only visible when needed.",
  ],
  ovg_fuel: [
    "Depoda ne kadar yakıt kaldığını, tur başına ne kadar harcadığını ve yarışı bitirmek için ne kadar eklemen gerektiğini hesaplar. Son tur, 5 tur ve 10 tur ortalamalarına göre kaç tur daha gidebileceğini ve pit pencerenin ne zaman açıldığını gösterir. Emniyet payını sen ayarlarsın; takım yarışlarında takım arkadaşlarının yakıtını da canlı görürsün.",
    "Works out how much fuel is left, how much you burn per lap and how much you must add to finish the race. From last-lap, 5-lap and 10-lap averages it shows how many more laps you can do and when your pit window opens. You set the safety margin, and in team races you see your teammates' fuel live as well.",
  ],
  ovg_pitwindow: [
    "“Şimdi pite girersem nereden çıkarım?” sorusunu yanıtlar. Pit stopun sana kaç saniye kaybettireceğini (bu pistteki önceki stoplarından ölçer), pist üzerinde hangi araçların arasına döneceğini, pit sonrası tahmini sıranı ve çıkışta trafiğe takılıp takılmayacağını gösterir. Yakıta göre en erken ve en geç pit turunu da yazar. Kompakt şerit ücretsiz; dönüş çizelgeli detaylı kart PRO.",
    "Answers the question “if I pit now, where do I come out?”. It shows how many seconds the stop will cost (measured from your earlier stops at this track), which cars you would rejoin between, your estimated position afterwards and whether you would come out in traffic. It also gives the earliest and latest pit lap based on fuel. The compact strip is free; the detailed card with a rejoin timeline is PRO.",
  ],
  ovg_stint: [
    "Stint, iki pit stop arasındaki sürüş bölümüdür. Bu overlay süren stint'inin tur sayısını, süresini, ortalama ve en iyi turunu, temponun hızlanıp yavaşladığını, lastiklerin kaç turluk olduğunu ve yakıt ortalamasını özetler. Önceki stint'le karşılaştırır ya da son stint'leri tablo halinde gösterir; uzun yarışlarda lastik ve tempo kararlarını kolaylaştırır.",
    "A stint is the stretch of driving between two pit stops. This overlay sums up your current stint: lap count, duration, average and best lap, whether your pace is improving or dropping off, tyre age and average fuel use. It compares with the previous stint or lists the last stints in a table, which makes tyre and pace decisions easier in long races.",
  ],
  ovg_driverswap: [
    "Birden çok sürücünün aynı aracı paylaştığı takım yarışları içindir. Araçta şu an kimin olduğunu ve ne kadardır sürdüğünü, her sürücünün toplam sürüş süresini ve tur sayısını gösterir. Lig kuralın varsa (sürücü başına en az sürüş süresi, en uzun kesintisiz sürüş) girersin; kalan ya da aşılan süreyi takip eder ve sınıra yaklaşınca uyarır. Tek sürücülü oturumlarda kendini gizler.",
    "Made for team races where several drivers share one car. It shows who is in the car right now and for how long, plus each driver's total drive time and lap count. If your league has rules — minimum drive time per driver, maximum continuous stint — enter them and it tracks the time remaining or exceeded and warns you before the limit. It hides itself in single-driver sessions.",
  ],
  ovg_crewcall: [
    "Ekibin sana Ekip odasından bir çağrı ya da mesaj gönderdiğinde, ya da uzaktan yaptığı bir pit ayarı uygulandığında, ekranın ortasında büyük ve gözden kaçmayan bir duyuru çıkarır. “Bu tur pit”, “Push”, “Yakıt tasarrufu” ve “Arkandan hızlı araç” gibi hazır çağrılar kendi rengi ve simgesiyle görünür; istersen bip sesiyle de haber verir. Yarışın ortasında sohbet penceresi okumak zorunda kalmazsın.",
    "When your crew sends you a call or a message from the Crew room — or when a pit setting they changed remotely is applied — it puts a big, unmissable announcement in the middle of the screen. Ready-made calls such as “Pit this lap”, “Push”, “Save fuel” and “Faster car behind” appear in their own colour and icon, with an optional beep. No need to read a chat window in the middle of a race.",
  ],
  ovg_session: [
    "Oturumun özetini tek kutuda toplar: kalan süre ya da tur, pozisyonun, hava ve pist sıcaklığı. Sarı, mavi ya da damalı gibi bayraklar çıktığında uyarır. Olay puanını ve fren dengesi, TC, ABS gibi araç ayarlarını da gösterir.",
    "Gathers the session into one box: time or laps left, your position, air and track temperature. It alerts you when a flag such as yellow, blue or chequered comes out, and also shows incident points and car settings like brake bias, TC and ABS.",
  ],
  ovg_digiflags: [
    "Gerçek pistlerin kenarındaki ışıklı panellerden esinlenen LED matris bayrak paneli. Sarı, mavi, yeşil, beyaz, damalı, kırmızı, siyah, hasar ve enkaz bayraklarını büyük ve parlak gösterir; göz ucuyla bile fark edilir.",
    "An LED-matrix flag panel inspired by the light panels beside real race tracks. It shows yellow, blue, green, white, chequered, red, black, meatball and debris flags big and bright, noticeable even out of the corner of your eye.",
  ],
  ovg_weather: [
    "Pistteki hava durumunu anlık gösterir: hava ve pist sıcaklığı, nem, rüzgârın yönü ve hızı, yağış ve pistin ne kadar ıslak olduğu. Yağmur lastiğine geçme zamanını ya da pistin kuruyup kurumadığını takip etmek için kullanılır.",
    "Shows the weather at the track live: air and track temperature, humidity, wind direction and speed, precipitation and how wet the surface is. Use it to judge when to switch to wet tyres or whether the track is drying.",
  ],
  ovg_windcompass: [
    "Rüzgârın aracına göre nereden estiğini gösterir: karşıdan mı, arkadan mı, yandan mı. Karşıdan esen rüzgâr düzlükte seni yavaşlatır ama frenlemede yardım eder, arkadan esen rüzgâr fren mesafesini uzatır; bu yüzden fren noktalarını ayarlarken işe yarar. Küçük bir pusula ya da tek satırlık ok ve yazı şeridi olarak, rüzgâr hızıyla birlikte görünür.",
    "Shows where the wind is coming from relative to your car: headwind, tailwind or crosswind. A headwind slows you on the straight but helps under braking, while a tailwind lengthens braking distances — useful when adjusting your braking points. It appears as a small compass or a one-line arrow-and-text strip, together with the wind speed.",
  ],
  ovg_incidents: [
    "Tamamladığın tur sayısını ve topladığın olay puanını gösterir. Çubuk, yarışın olay sınırına yaklaştıkça renk değiştirir; diskalifiye olmadan önce ne kadar payın kaldığını bilirsin. Yalnızca iRacing'de çalışır.",
    "Shows the laps you have completed and the incident points you have collected. A bar changes colour as you approach the race's incident limit, so you know how much margin is left before disqualification. Works in iRacing only.",
  ],
  ovg_incidentlog: [
    "Bu oturumda aldığın her olay puanını tek tek listeler: saati, turu, sektörü ve türü (1x pist dışı, 2x kontrol kaybı ya da duvar, 4x temas). Yeni olay birkaç saniye vurgulanır. Puanlarının nerede ve neden geldiğini görmek için kullanılır. Yalnızca iRacing'de çalışır.",
    "Lists every incident point you picked up this session: time, lap, sector and type (1x off track, 2x loss of control or wall, 4x contact). A new incident is highlighted for a few seconds. Use it to see where and why your points came from. Works in iRacing only.",
  ],
  ovg_livechat: [
    "Yayın yaparken YouTube, Twitch ve Kick sohbetini tek bir akışta, oyunun üstünde gösterir; ikinci monitöre bakman gerekmez. Emote'lar, rozetler, Super Chat, abonelik ve raid uyarıları görünür; botları ve komutları gizleyebilirsin. OBS'te tarayıcı kaynağı olarak da kullanılabilir. Bir kanal ücretsiz, aynı anda birden fazla kanal PRO.",
    "Shows YouTube, Twitch and Kick chat in a single feed on top of the game while you stream, so you don't have to look at a second monitor. Emotes, badges, Super Chat, sub and raid alerts are shown, and you can hide bots and commands. It also works as a browser source in OBS. One channel is free; several channels at once is PRO.",
  ],
  ovg_livepoll: [
    "Canlı sohbette anket yapmanı sağlar: izleyiciler şık numarasını yazarak oy verir. Soru, şıklar, oy çubukları ve kalan süre ekranda görünür; beraberlikte rastgele seçim animasyonu oynar. Bir kısayolla (varsayılan F9) başlatırsın. PRO özelliğidir.",
    "Lets you run a poll in your live chat: viewers vote by typing the option number. The question, options, vote bars and time left are shown on screen, with a random-pick animation on a tie. Start it with a hotkey (F9 by default). A PRO feature.",
  ],
  ovg_captions: [
    "Konuşmanı yazıya çevirir ve yayında altyazı olarak gösterir. İstersen Discord gibi uzaktan gelen sesi de ayrı renkte yazar. Yazı tipi, boyut, renk ve arka plan ayarlanır; bir kısayolla (varsayılan F6) açıp kapatırsın. PRO özelliğidir.",
    "Turns your speech into text and shows it as captions on stream. Optionally it also transcribes remote audio such as Discord in a separate colour. Font, size, colour and background are adjustable, and a hotkey (F6 by default) toggles it. A PRO feature.",
  ],
  ovg_startlights: [
    "Yarış başlamadan önce ekrana start ışıklarını getirir: formasyon turu ve grid bilgisi, sırayla yanan kırmızı ışıklar ve oyun yarışı başlattığı anda yeşil ışık ya da “GO!” yazısı. Yayına gerçek yarış havası katar, startı kaçırmamanı sağlar. Beş ışıklı köprü, trafik ışığı ya da sade yazı tasarımını seçebilirsin; start sonrası kendiliğinden kaybolur.",
    "Puts start lights on screen before the race: formation lap and grid information, the red lights coming on one by one, then a green light or “GO!” the moment the game starts the race. It gives a stream a real race feel and makes sure you don't miss the start. Choose the five-light gantry, a traffic light or plain text; it disappears by itself after the start.",
  ],
  ovg_drivercard: [
    "Yayınlardaki alt bant (lower third) gibi bir sürücü kartı: adın, ülke bayrağın, araç numaran, aracın ve sınıfın, takımın, iRating ve lisansın, o anki sıran. İkinci satıra kendi yazını (örneğin sosyal medya adını) koyabilirsin. Her zaman, belirli aralıklarla ya da yalnızca garajda ve gridde görünecek şekilde ayarlanır. Klasik alt bant ve küçük etiket ücretsiz, eğik sport tasarım PRO.",
    "A driver card like the lower third on TV broadcasts: your name, country flag, car number, car and class, team, iRating and licence, and your current position. The second line can carry your own text, for example your social handle. Set it to show always, at intervals, or only in the garage and on the grid. The classic bar and small tag are free; the angled sport design is PRO.",
  ],
  ovg_h2h: [
    "İki sürücüyü yan yana karşılaştırır: sen ve seçtiğin rakip (öndeki, arkadaki, sınıf lideri ya da belirli bir araç numarası). Adlar, bayraklar, sıralar, aradaki fark, son ve en iyi tur, pit stop sayısı ve lastikteki tur karşılıklı görünür; her satırda daha iyi olan değer vurgulanır. Yayında bir mücadeleyi izleyiciye anlatmanın en kolay yoludur.",
    "Compares two drivers side by side: you and a rival you choose (the car ahead, behind, the class leader or a specific car number). Names, flags, positions, the gap, last and best lap, pit stops and laps on the tyres are shown against each other, with the better value highlighted on every row. The easiest way to explain a battle to viewers on stream.",
  ],
  ovg_results: [
    "Damalı bayraktan sonra yarış sonucunu ekrana getirir: sınıfının ilk üçü bayrakları ve farklarıyla, altında kendi sonucun (sıra, kazandığın ya da kaybettiğin sıra, en iyi tur, olay puanı) ve tahmini iRating değişimi. Podyum ya da tablo görünümünü seçebilirsin; belirli bir süre ya da oturum bitene kadar ekranda kalır. Yayını güzel bir kapanışla bitirir.",
    "Brings up the race result after the chequered flag: the top three of your class with flags and gaps, then your own result (position, places gained or lost, best lap, incident points) and the estimated iRating change. Choose the podium or the table view; it stays for a set time or until the session ends. A neat way to close out a stream.",
  ],
  ovg_goalbar: [
    "Yayıncılar için hedef ilerleme çubuğu: “100 takipçi” ya da bir bağış hedefi gibi. Sayacı elle artırabilir ya da canlı sohbet uyarılarından (yeni takipçi, abone / üye, bağış) kendiliğinden saydırabilirsin. Başlık, hedef, yüzde ve istersen “son destekçi” satırı görünür. İnce çubuk ve ikonlu hap tasarımı ücretsiz, büyük hedef panosu PRO.",
    "A goal progress bar for streamers — “100 followers”, say, or a donation target. Bump the counter by hand or let it count automatically from live chat alerts (new followers, subs / members, donations). It shows a title, the target, the percentage and optionally a “latest supporter” line. The slim bar and icon pill designs are free; the big milestone board is PRO.",
  ],
  ovg_webview: [
    "Herhangi bir web sayfasını overlay olarak oyunun üstünde gösterir. Yayın uyarıları, zamanlayıcı, başka bir sitenin sohbeti ya da kendi hazırladığın bir panel için kullanabilirsin; adresi yapıştırman yeterli.",
    "Shows any web page as an overlay on top of the game. Use it for stream alerts, a timer, another site's chat or a panel you built yourself — just paste the address.",
  ],
  ovg_messages: [
    "Sen sürerken gelen arkadaş, takım ve grup mesajlarını ekranda küçük balonlarla gösterir; birkaç saniye sonra kendiliğinden kaybolur. Kimlerin mesajının görüneceğini (tüm arkadaşlar, takım ya da seçtiğin kişiler) sen belirlersin. PRO ile mesajlar sesli de okunur, gözünü pistten ayırmazsın.",
    "Shows incoming friend, team and group messages as small bubbles while you drive; they disappear by themselves after a few seconds. You decide whose messages appear — all friends, your team or only people you pick. With PRO, messages are also read aloud so your eyes stay on the track.",
  ],
  ovg_voice: [
    "Sesli Mühendis ya da spotter konuşurken söylediklerini yazıyla da gösterir. Mühendis ve spotter ayrı renk ve etiketle görünür; sustuklarında yazı kendiliğinden kaybolur. Sesi kısık kullananlar, anonsu kaçırmak istemeyenler ve yayın izleyicileri için faydalıdır. Sesli Mühendis (PRO) ile birlikte çalışır.",
    "Shows what the Voice Engineer or spotter is saying as text as well. The engineer and the spotter get separate colours and labels, and the text disappears when they stop talking. Useful if you keep the volume low, don't want to miss a call, or want stream viewers to follow along. Works together with the Voice Engineer (PRO).",
  ],
});
