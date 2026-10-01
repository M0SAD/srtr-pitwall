import { defineOverlay } from "@/sdk/overlay";

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
const CAR_VIEWS = ["carF1", "carFjr", "carGtDe", "carGtIt", "carGtUk", "carProto", "carStock", "carRally", "carTouring", "carRoad"];
const NOT_CAR = { key: "view", not: CAR_VIEWS };

export default defineOverlay({
  id: "dashboard",
  name: "Direksiyon Ekranı",
  description:
    "Yarış direksiyonlarındaki ekranlar gibi: devir ışıkları, büyük vites, hız, pozisyon, delta, sektör ve tur süreleri, seçilebilir alt kutular. Klasik, Minimal, Yarış ve Dayanıklılık görünümleri; PRO üyeler için gerçek yarış araçlarının ekranlarından esinlenen araç tarzı ekranlar.",
  category: "driving",
  topics: [
    { name: "telemetry", hz: 30 },
    { name: "delta", hz: 15 },
    { name: "laps", hz: 2 },
    { name: "fuel", hz: 2 },
    { name: "session", hz: 2 },
    { name: "tires", hz: 1 },
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
      ],
      hint: "Minimal: vites, hız, delta ve devir ışıkları. Yarış: büyük pozisyon ve delta, tur bilgisi, yakıtın yeteceği tur. Dayanıklılık: yakıt, kalan tur, stint süresi, lastik ve motor sıcaklıkları. Otomatik: sürdüğün araca (formula, GT, prototip, stock car, ralli, touring, yol arabası) uygun araç tarzı ekranı seçer.",
      proHint: "Araç tarzı ekranlar PRO üyelere özel; otomatik modda sana Klasik görünüm gösterilir.",
    },
    { key: "accent", label: "Vurgu rengi", type: "color", default: "#e8101a", group: "Görünüş", showIf: NOT_CAR },
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
      ],
    },
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
    { key: "opacity", label: "Arka plan opaklığı", type: "number", default: 100, min: 30, max: 100, step: 5, unit: "%", group: "Görünüş" },
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
    { key: "box1", label: "Sol alt kutu", type: "select", default: "tc", group: "Alt kutular", showIf: BOX_VIEWS, options: BOX_OPTIONS },
    { key: "box2", label: "Orta alt kutu", type: "select", default: "trackTemp", group: "Alt kutular", showIf: BOX_VIEWS, options: BOX_OPTIONS },
    { key: "box3", label: "Sağ alt kutu", type: "select", default: "rpm", group: "Alt kutular", showIf: BOX_VIEWS, options: BOX_OPTIONS },
  ],
});
