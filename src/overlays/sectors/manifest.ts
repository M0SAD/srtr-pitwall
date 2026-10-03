import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "sectors",
  name: "Sektör Süreleri",
  description:
    "Güncel turun sektör sürelerini canlı gösterir: mor sınıfın en iyisi, yeşil kişisel en iyi, sarı daha yavaş. Son tur, en iyi sektörler, teorik en iyi tur ve tur içi sektör farkı.",
  category: "driving",
  topics: [{ name: "sectors", hz: 10 }],
  size: { w: 360, h: 96 },
  defaultPosition: { x: 780, y: 120 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "boxes",
      options: [
        { value: "boxes", label: "Kompakt kutular" },
        { value: "bars", label: "Renkli çubuklar (minimal)" },
        { value: "table", label: "Tablo (güncel / son / en iyi / teorik)", pro: true },
      ],
      hint: "Sektör sınırları simin resmi sektörleridir (iRacing, ACC, AC, LMU / rFactor 2, Automobilista 2). Sim sektör bilgisi vermiyorsa tur üç eşit mesafeye bölünür ve başlıkta ≈ işareti görünür.",
      proHint: "Tablo tasarımı PRO üyelere özel.",
    },
    {
      key: "reference",
      label: "Fark neye göre",
      type: "select",
      default: "pb",
      options: [
        { value: "pb", label: "Kişisel en iyi sektörler" },
        { value: "last", label: "Son tur" },
        { value: "class", label: "Sınıfın en iyi sektörleri" },
      ],
      hint: "Fark her sektör bitince güncellenir; süren sektörde referans süre aşılınca canlı olarak büyür.",
    },
    { key: "showDelta", label: "Sektör farkı ve toplam fark", type: "boolean", default: true },
    { key: "showLive", label: "Süren sektörün süresini canlı göster", type: "boolean", default: true },
    { key: "showLast", label: "Son tur", type: "boolean", default: true },
    { key: "showBest", label: "En iyi tur", type: "boolean", default: true },
    { key: "showOptimal", label: "Teorik en iyi tur", type: "boolean", default: true, hint: "En iyi sektörlerinin toplamı." },
    { key: "showClass", label: "Sınıfın en iyi sektörleri (tabloda)", type: "boolean", default: true, showIf: { key: "design", is: ["table"] } },
    { key: "hold", label: "Tur bitince sektörleri ekranda tut", type: "number", default: 6, min: 0, max: 20, step: 1, unit: "sn", hint: "Çizgiyi geçince biten turun sektörleri bu süre boyunca görünmeye devam eder. 0: hemen temizlenir." },
    {
      key: "decimals",
      label: "Ondalık basamak",
      type: "select",
      default: "3",
      options: [
        { value: "1", label: "0,1" },
        { value: "2", label: "0,01" },
        { value: "3", label: "0,001" },
      ],
    },
    { key: "hidePits", label: "Pitte gizle", type: "boolean", default: false },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 10, min: 2, max: 30, step: 1, unit: "Hz" },

    { key: "colClass", label: "Sınıfın en iyisi", type: "color", default: "#b76cff", group: "Renkler" },
    { key: "colBest", label: "Kişisel en iyi", type: "color", default: "#33d17a", group: "Renkler" },
    { key: "colSlow", label: "Daha yavaş", type: "color", default: "#ffcc33", group: "Renkler" },

    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm", hint: "Bütün gösterge yazı boyutuyla birlikte büyür ve küçülür." },
    { key: "width", label: "Genişlik", type: "number", default: 360, min: 200, max: 800, step: 10, unit: "px", group: "Görünüm" },
  ],
});
