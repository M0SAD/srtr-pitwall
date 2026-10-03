import { defineOverlay, type SettingField } from "@/sdk/overlay";
import { DASH_VIEW, dashList } from "@/dash/model";

// Alt kutularda gösterilebilecek değerler (Overlay.tsx'teki BOX_VALUES ile aynı anahtarlar)
const BOX_OPTIONS = [
  { value: "tc", label: "TC (çekiş kontrolü)" },
  { value: "abs", label: "ABS" },
  { value: "bb", label: "Fren dengesi" },
  { value: "trackTemp", label: "Pist sıcaklığı" },
  { value: "airTemp", label: "Hava sıcaklığı" },
  { value: "rpm", label: "Devir (RPM)" },
  { value: "fuel", label: "Yakıt" },
  { value: "fuelLaps", label: "Yakıt yeter (tur)" },
  { value: "oilTemp", label: "Yağ sıcaklığı" },
  { value: "waterTemp", label: "Su sıcaklığı" },
  { value: "incidents", label: "Olay sayısı" },
  { value: "lap", label: "Tur" },
  { value: "remain", label: "Kalan tur / süre" },
  { value: "stint", label: "Stint süresi" },
  { value: "none", label: "Boş" },
];

const BOX_VIEWS = { key: "view", is: ["classic", "race"] };
// Araç tarzı ekranların kendi renkleri / yazı tipleri var: bu ayarlar onlarda gizlenir
const CAR_VIEWS = [
  "carF1",
  "carFjr",
  "carGtDe",
  "carGtIt",
  "carGtUk",
  "carProto",
  "carStock",
  "carRally",
  "carTouring",
  "carRoad",
  "carFormula",
  "carMercW13",
  "carFer296",
  "carMcl720",
  "carPor992",
  "carPor963",
  "carCadV",
  "carFer499",
  "carLmp2",
];
const NOT_CAR = { key: "view", not: [...CAR_VIEWS, "custom"], notPrefix: [DASH_VIEW] };
// Hazır görünümler (Klasik, Minimal, Yarış, Dayanıklılık): öğe ayarları sadece bunlarda
const GENERIC = { key: "view", is: ["classic", "minimal", "race", "endurance"] };
const CAR_ONLY = { key: "view", is: [...CAR_VIEWS, "auto"] };
// Eski "Özel tasarım" seçeneği (+ ayrı "Tasarım" alanı) kayıtlı ayarlar için çalışmaya devam eder
const IS_CUSTOM = { key: "view", is: ["custom"] };
// Özel tasarım: eski "custom" ya da doğrudan listedeki "Tasarımlarım: …" (değer "dash:<kimlik>")
const ANY_CUSTOM = { key: "view", is: ["custom"], isPrefix: [DASH_VIEW] };
const NOT_CUSTOM = { key: "view", not: ["custom"], notPrefix: [DASH_VIEW] };

/** Bir öğenin ayarları: göster, boyut, (istenirse) renk */
function element(id: string, name: string, group: string, opts: { show?: string; color?: string; views?: string[]; hint?: string } = {}): SettingField[] {
  const showIf = opts.views ? { key: "view", is: opts.views } : GENERIC;
  const out: SettingField[] = [];
  if (opts.show) out.push({ key: opts.show, label: `${name}: göster`, type: "boolean", default: true, group, showIf, hint: opts.hint });
  out.push({ key: `${id}Size`, label: `${name}: boyut`, type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group, showIf });
  if (opts.color) out.push({ key: opts.color, label: `${name}: renk`, type: "color", default: "#f4f4f4", group, showIf });
  return out;
}
const CUSTOM = { key: "customColors", is: [true] };
const COLOR_KEYS = ["accent", "textColor", "labelColor", "bgColor", "rpmLow", "rpmMid", "rpmHigh", "rpmShift", "warnColor"];
const AID_OPTIONS = [
  { value: "auto", label: "Otomatik (ekranın kendi yerleşimine göre)" },
  { value: "on", label: "Her zaman" },
  { value: "off", label: "Kapalı" },
];

export default defineOverlay({
  id: "dashboard",
  name: "Direksiyon Ekranı",
  description:
    "Yarış direksiyonlarındaki ekranlar gibi: devir ışıkları, büyük vites, hız, pozisyon, delta, sektör ve tur süreleri, seçilebilir alt kutular. Klasik, Minimal, Yarış ve Dayanıklılık görünümleri; PRO üyeler için gerçek yarış araçlarının ekranlarından esinlenen araç tarzı ekranlar. Hibrit / DRS / P2P bilgisi araca göre kendiliğinden görünür; ABS / TC, renkler ve her öğenin boyutu / rengi / görünürlüğü ayarlanabilir. PRO: Dashboard Tasarımcısı ile kendi ekranını tasarla, telefon ya da tabletten aç.",
  category: "driving",
  topics: [
    { name: "telemetry", hz: 30 },
    { name: "delta", hz: 15 },
    { name: "laps", hz: 2 },
    { name: "fuel", hz: 2 },
    { name: "session", hz: 2 },
    { name: "tires", hz: 1 },
    { name: "ers", hz: 10 },
    // W13 ekranındaki PIT LIM bloğu (pit hız sınırlayıcı)
    { name: "pit", hz: 5 },
    // Özel tasarımdaki gaz / fren, öndeki-arkadaki fark ve hava alanları
    { name: "inputs", hz: 30 },
    { name: "relative", hz: 2 },
    { name: "weather", hz: 1 },
  ],
  size: { w: 380, h: 210 },
  defaultPosition: { x: 770, y: 760 },
  defaultEnabled: false,
  settings: [
    {
      key: "view",
      label: "Görünüm",
      type: "select",
      default: "classic",
      options: [
        { value: "classic", label: "Klasik" },
        { value: "minimal", label: "Minimal" },
        { value: "race", label: "Yarış" },
        { value: "endurance", label: "Dayanıklılık" },
        { value: "auto", label: "Otomatik (araca göre)" },
        { value: "custom", label: "Özel tasarım (Dashboard Tasarımcısı)", pro: true },
        { value: "carF1", label: "Formula (F1 tarzı)", pro: true },
        { value: "carFjr", label: "Formula alt sınıfları (F3/F4/FR)", pro: true },
        { value: "carGtDe", label: "GT3 – Alman tarzı", pro: true },
        { value: "carGtIt", label: "GT3 – İtalyan tarzı", pro: true },
        { value: "carGtUk", label: "GT3 – İngiliz/Japon tarzı", pro: true },
        { value: "carProto", label: "Prototip / Hypercar (LMDh/LMH)", pro: true },
        { value: "carStock", label: "Stock car / NASCAR", pro: true },
        { value: "carRally", label: "Ralli / Rallycross", pro: true },
        { value: "carTouring", label: "Touring car (TCR)", pro: true },
        { value: "carRoad", label: "Yol arabası (analog göstergeler)", pro: true },
        { value: "carFormula", label: "Formula (genel direksiyon ekranı)", pro: true },
        { value: "carMercW13", label: "Mercedes W13 (F1 hibrit)", pro: true },
        { value: "carFer296", label: "Ferrari 296 GT3", pro: true },
        { value: "carMcl720", label: "McLaren 720S GT3 Evo", pro: true },
        { value: "carPor992", label: "Porsche 911 GT3 R (992)", pro: true },
        { value: "carPor963", label: "Porsche 963 GTP", pro: true },
        { value: "carCadV", label: "Cadillac V-Series.R", pro: true },
        { value: "carFer499", label: "Ferrari 499P", pro: true },
        { value: "carLmp2", label: "Dallara P217 LMP2", pro: true },
      ],
      // Kullanıcının kendi tasarımları (Araçlar › Dashboard Tasarımcısı) listede ayrı birer görünüm olarak durur.
      // Kilit kuralı "Özel tasarım" seçeneğiyle aynıdır (overlay.dashboard.view.custom).
      optionsFrom: () => dashList().map((d) => ({ value: DASH_VIEW + d.id, label: `Tasarımlarım: ${d.name}`, pro: true, lockAs: "custom" })),
      hint: "Tasarımlarım: Dashboard Tasarımcısı'nda yaptığın (ya da topluluktan indirdiğin) ekranlar. Minimal: vites, hız, delta ve devir ışıkları. Yarış: büyük pozisyon ve delta, tur bilgisi, yakıtın yeteceği tur. Dayanıklılık: yakıt, kalan tur, stint süresi, lastik ve motor sıcaklıkları. Otomatik: sürdüğün araca (formula, GT, prototip, stock car, ralli, touring, yol arabası) uygun araç tarzı ekranı seçer; kendi ekranı olan araçlarda (ör. Ferrari 296 GT3, Porsche 963, Ferrari 499P) o aracın ekranı açılır.",
      proHint: "Araç tarzı ekranlar ve özel tasarım PRO üyelere özel; otomatik modda sana Klasik görünüm gösterilir.",
    },
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "",
      dynamic: true,
      showIf: IS_CUSTOM,
      hint: "Kendi tasarımlarını Araçlar › Dashboard Tasarımcısı sayfasında yaparsın. Hiç tasarımın yoksa Klasik görünüm gösterilir.",
      // Kullanıcının tasarımları (ayarlar değişince güncellenir)
      get options() {
        const list = dashList();
        return list.length ? list.map((d) => ({ value: d.id, label: `Özel: ${d.name}` })) : [{ value: "", label: "Henüz tasarım yok" }];
      },
    },
    { key: "customWidth", label: "Genişlik", type: "number", default: 380, min: 160, max: 1600, step: 10, unit: "px", showIf: ANY_CUSTOM, hint: "Tasarım bu genişliğe oranını koruyarak sığdırılır." },
    { key: "customPage", label: "Başlangıç sayfası", type: "number", default: 1, min: 1, max: 8, step: 1, ui: "stepper", showIf: ANY_CUSTOM, hint: "Sayfalar arasında Ayarlar › Kısayollar'daki “sonraki sayfa” kısayoluyla geçilir." },
    {
      key: "carPage",
      label: "Sayfa",
      type: "select",
      default: "1",
      showIf: { key: "view", is: ["carMercW13", "auto"] },
      hint: "Mercedes W13 ekranının iki sayfası vardır. Yarış sırasında Ayarlar › Kısayollar'daki “sonraki sayfa” kısayoluyla da geçilir.",
      options: [
        { value: "1", label: "Sayfa 1 (lastikler, fren dengesi, su sıcaklığı)" },
        { value: "2", label: "Sayfa 2 (deploy, yakıt, son tur)" },
      ],
    },
    { key: "accent", label: "Vurgu rengi", type: "color", default: "#e8101a", group: "Görünüş", showIf: NOT_CUSTOM },
    {
      key: "theme",
      label: "Renk teması",
      type: "select",
      default: "black",
      group: "Görünüş",
      showIf: NOT_CAR,
      options: [
        { value: "black", label: "Siyah ekran" },
        { value: "carbon", label: "Karbon" },
        { value: "app", label: "Uygulama teması" },
      ],
    },
    {
      key: "gearColor",
      label: "Vites rengi",
      type: "select",
      default: "accent",
      group: "Görünüş",
      showIf: NOT_CAR,
      options: [
        { value: "accent", label: "Vurgu rengi" },
        { value: "white", label: "Beyaz" },
        { value: "rpm", label: "Devre göre (ışıklarla aynı)" },
        { value: "custom", label: "Özel renk" },
      ],
    },
    { key: "gearCustom", label: "Vites: özel renk", type: "color", default: "#ffffff", group: "Görünüş", showIf: { key: "gearColor", is: ["custom"] } },
    {
      key: "font",
      label: "Yazı tipi",
      type: "select",
      default: "digital",
      group: "Görünüş",
      showIf: NOT_CAR,
      options: [
        { value: "digital", label: "Dijital" },
        { value: "mono", label: "Eş aralıklı" },
        { value: "theme", label: "Tema yazı tipi" },
      ],
    },
    { key: "opacity", label: "Arka plan opaklığı", type: "number", default: 100, min: 30, max: 100, step: 5, unit: "%", group: "Görünüş", showIf: NOT_CUSTOM },
    { key: "radius", label: "Köşe yuvarlaklığı", type: "number", default: 6, min: 0, max: 30, step: 1, unit: "px", group: "Görünüş", showIf: GENERIC },
    { key: "gap", label: "Öğeler arası boşluk", type: "number", default: 5, min: 0, max: 20, step: 1, unit: "px", group: "Görünüş", showIf: GENERIC },
    { key: "showBorder", label: "Dış çerçeve", type: "boolean", default: true, group: "Görünüş", showIf: GENERIC },
    { key: "showFrames", label: "Kutu çerçeveleri", type: "boolean", default: true, group: "Görünüş", showIf: GENERIC },
    { key: "showLabels", label: "Etiketler", type: "boolean", default: true, group: "Görünüş", showIf: GENERIC },
    { key: "labelSize", label: "Etiket boyutu", type: "number", default: 100, min: 60, max: 200, step: 5, unit: "%", group: "Görünüş", showIf: GENERIC },
    { key: "carScale", label: "Ekran ölçeği", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüş", showIf: CAR_ONLY, hint: "Araç tarzı ekranın tamamını büyütür / küçültür." },
    { key: "carRpmSize", label: "Devir ışıkları boyutu", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüş", showIf: CAR_ONLY },
    {
      key: "customColors",
      label: "Özel renkler kullan",
      type: "boolean",
      default: false,
      group: "Renkler",
      hint: "Kapalıyken her ekran kendi renklerini kullanır (araç tarzı ekranlar kendi paletini, diğerleri vurgu rengini ve temayı). Açınca aşağıdaki renkler bütün görünümlere uygulanır.",
      resetKeys: COLOR_KEYS,
      resetLabel: "Varsayılan renkler",
    },
    { key: "textColor", label: "Yazı rengi", type: "color", default: "#f4f4f4", group: "Renkler", showIf: CUSTOM },
    { key: "labelColor", label: "Etiket rengi", type: "color", default: "#a3a3a3", group: "Renkler", showIf: CUSTOM },
    { key: "bgColor", label: "Arka plan rengi", type: "color", default: "#040405", group: "Renkler", showIf: CUSTOM },
    { key: "rpmLow", label: "Devir rengi: düşük", type: "color", default: "#34e05c", group: "Renkler", showIf: CUSTOM },
    { key: "rpmMid", label: "Devir rengi: orta", type: "color", default: "#ffd21f", group: "Renkler", showIf: CUSTOM },
    { key: "rpmHigh", label: "Devir rengi: yüksek", type: "color", default: "#e8101a", group: "Renkler", showIf: CUSTOM },
    { key: "rpmShift", label: "Devir rengi: vites noktası", type: "color", default: "#2f8bff", group: "Renkler", showIf: CUSTOM },
    { key: "warnColor", label: "Uyarı rengi", type: "color", default: "#ff1f1f", group: "Renkler", showIf: CUSTOM },
    { key: "showLogo", label: "Logo", type: "boolean", default: true, group: "Görünüş" },
    { key: "logoText", label: "Logo yazısı", type: "text", default: "SRTR", placeholder: "SRTR", group: "Görünüş", showIf: { key: "showLogo", is: [true] } },
    { key: "logoSub", label: "Logo alt yazısı", type: "text", default: "PITWALL", placeholder: "RACING", group: "Görünüş", showIf: { key: "showLogo", is: [true] } },

    { key: "showLeds", label: "Devir ışıkları", type: "boolean", default: true, group: "Devir ışıkları" },
    {
      key: "ledStyle",
      label: "Işık stili",
      type: "select",
      default: "blocks",
      group: "Devir ışıkları",
      showIf: { key: "showLeds", is: [true] },
      options: [
        { value: "blocks", label: "Bloklar (logonun iki yanında)" },
        { value: "f1", label: "F1 (15 LED)" },
        { value: "bar", label: "Çubuk" },
      ],
    },
    { key: "flash", label: "Vites noktasında yanıp sön", type: "boolean", default: true, group: "Devir ışıkları", showIf: { key: "showLeds", is: [true] } },
    { key: "rpmSize", label: "Devir ışıkları boyutu", type: "number", default: 70, min: 40, max: 200, step: 5, unit: "%", group: "Devir ışıkları", showIf: GENERIC, hint: "%100 eski (büyük) boyuttur." },

    { key: "showGear", label: "Vites: göster", type: "boolean", default: true, group: "Öğeler", showIf: GENERIC },
    { key: "gearSize", label: "Vites: boyut", type: "number", default: 100, min: 50, max: 160, step: 5, unit: "%", group: "Öğeler", showIf: GENERIC, hint: "Vites rengi: Görünüş › Vites rengi." },
    ...element("speed", "Hız", "Öğeler", { show: "showSpeed", color: "speedColor" }),
    { key: "showDelta", label: "Delta: göster", type: "boolean", default: true, group: "Öğeler", showIf: GENERIC },
    { key: "deltaSize", label: "Delta: boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Öğeler", showIf: GENERIC },
    { key: "deltaFast", label: "Delta: hızlıyken renk", type: "color", default: "#34e05c", group: "Öğeler", showIf: GENERIC },
    { key: "deltaSlow", label: "Delta: yavaşken renk", type: "color", default: "#e8101a", group: "Öğeler", showIf: GENERIC, hint: "Varsayılan değerde bırakılırsa vurgu rengi kullanılır." },
    ...element("lap", "Tur süreleri", "Öğeler", { show: "showLapTimes", color: "lapColor", views: ["classic", "race", "endurance"] }),
    ...element("pos", "Pozisyon, tur ve sektör", "Öğeler", { show: "showPos", color: "posColor", views: ["classic", "race", "endurance"] }),
    ...element("fuel", "Yakıt", "Öğeler", { show: "showFuel", color: "fuelColor", views: ["race", "endurance"] }),
    ...element("tyre", "Lastikler", "Öğeler", { show: "showTyres", views: ["endurance"] }),
    ...element("temp", "Sıcaklıklar", "Öğeler", { show: "showTemps", color: "tempColor", views: ["endurance"] }),
    ...element("box", "Alt kutular (TC / ABS / fren dengesi…)", "Öğeler", { show: "showBoxes", color: "boxColor", views: ["classic", "race"] }),
    { key: "extrasSize", label: "Hibrit / ABS / TC şeridi: boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Öğeler", showIf: GENERIC, hint: "Şeridin içeriği: “Hibrit, ABS ve TC” ayarları." },


    {
      key: "deltaRef",
      label: "Delta referansı",
      type: "select",
      default: "best",
      group: "Veriler",
      hint: "Oturumun en iyisi ve optimal tur sadece iRacing'de vardır; diğer simülasyonlarda kendi en iyi turun kullanılır.",
      options: [
        { value: "best", label: "Kendi en iyi turum" },
        { value: "session", label: "Oturumun en iyi turu" },
        { value: "optimal", label: "Optimal tur" },
      ],
    },
    {
      key: "speedUnit",
      label: "Hız birimi",
      type: "select",
      default: "auto",
      group: "Veriler",
      options: [
        { value: "auto", label: "Genel ayar" },
        { value: "kmh", label: "km/h" },
        { value: "mph", label: "mph" },
      ],
    },
    {
      key: "tempUnit",
      label: "Sıcaklık birimi",
      type: "select",
      default: "auto",
      group: "Veriler",
      options: [
        { value: "auto", label: "Genel ayar" },
        { value: "c", label: "°C" },
        { value: "f", label: "°F" },
      ],
    },
    {
      key: "hybridInfo",
      label: "Hibrit bilgisini göster",
      type: "select",
      default: "auto",
      group: "Hibrit, ABS ve TC",
      hint: "Batarya doluluğu, harcama modu, MGU-K gücü ve DRS / P2P durumu. Otomatik: sadece bu sistemlerden biri olan araçlarda görünür (bataryası olmayan ama DRS ya da P2P'si olan araçlarda yalnızca onlar).",
      options: [
        { value: "auto", label: "Otomatik (araca göre)" },
        { value: "always", label: "Her zaman" },
        { value: "off", label: "Kapalı" },
      ],
    },
    {
      key: "showAbs",
      label: "ABS bilgisi",
      type: "select",
      default: "auto",
      group: "Hibrit, ABS ve TC",
      hint: "ABS seviyesi; ABS devreye girince kutu yanar. Otomatik: ABS kutusu olan araç tarzı ekranlarda görünür. Her zaman: kutusu olmayan görünümlerde alta eklenir.",
      options: AID_OPTIONS,
    },
    {
      key: "showTc",
      label: "TC (çekiş kontrolü) bilgisi",
      type: "select",
      default: "auto",
      group: "Hibrit, ABS ve TC",
      hint: "TC seviyesi; sim bildiriyorsa (ACC / AC) çekiş kontrolü keserken kutu yanar.",
      options: AID_OPTIONS,
    },
    { key: "box1", label: "Sol alt kutu", type: "select", default: "tc", group: "Alt kutular", showIf: BOX_VIEWS, options: BOX_OPTIONS },
    { key: "box2", label: "Orta alt kutu", type: "select", default: "trackTemp", group: "Alt kutular", showIf: BOX_VIEWS, options: BOX_OPTIONS },
    { key: "box3", label: "Sağ alt kutu", type: "select", default: "rpm", group: "Alt kutular", showIf: BOX_VIEWS, options: BOX_OPTIONS },
  ],
});
