import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "setupcmp",
  name: "Setup Karşılaştırma",
  description:
    "Garajda yüklediğin setup'ları yan yana karşılaştırır: her setup ile attığın en iyi tur, sektörler, teorik en iyi, ortalama ve tur sayısı. En hızlı olan yeşil, diğerlerinde fark gösterilir.",
  category: "driving",
  // Tekrar ekranında çalışmaz (sürüş verisi yalnızca kendin sürerken gelir)
  replay: false,
  topics: [
    { name: "setupcmp", hz: 2 },
    { name: "status", hz: 1 },
  ],
  size: { w: 380, h: 200 },
  defaultPosition: { x: 760, y: 260 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "table",
      options: [
        { value: "table", label: "Tablo (setup'lar yan yana)" },
        { value: "list", label: "Liste (yalnızca en iyi tur ve fark)" },
      ],
      hint: "Setup adı iRacing'den okunur. Süreler yalnızca geçerli (süresi sayılan) turlardan alınır; çıkış turu sayılmaz.",
    },
    { key: "count", label: "Karşılaştırılacak setup sayısı", type: "number", default: 2, min: 2, max: 6, step: 1, hint: "En son kullandığın setup'lar gösterilir; şu an yüklü olan işaretlenir." },
    {
      key: "scope",
      label: "Hangi turlar",
      type: "select",
      default: "session",
      options: [
        { value: "session", label: "Sadece bu oturum" },
        { value: "all", label: "Tüm zamanlar (bu pist ve araç)" },
      ],
      hint: "Bu oturum: pist koşulları aynıyken adil karşılaştırma. Tüm zamanlar: aynı pist ve araçta daha önce kaydedilen turlar da sayılır.",
    },
    { key: "showSectors", label: "Sektörler", type: "boolean", default: true, group: "Satırlar", showIf: { key: "design", is: ["table"] } },
    {
      key: "sectorMode",
      label: "Sektör süreleri",
      type: "select",
      default: "best",
      options: [
        { value: "best", label: "En iyi turun sektörleri" },
        { value: "opt", label: "En iyi sektörler (farklı turlardan)" },
      ],
      group: "Satırlar",
      showIf: { key: "design", is: ["table"] },
    },
    { key: "showOptimal", label: "Teorik en iyi tur", type: "boolean", default: true, group: "Satırlar", hint: "En iyi sektörlerin toplamı.", showIf: { key: "design", is: ["table"] } },
    { key: "showAvg", label: "Ortalama tur", type: "boolean", default: true, group: "Satırlar", showIf: { key: "design", is: ["table"] } },
    { key: "showLast", label: "Son tur", type: "boolean", default: false, group: "Satırlar", showIf: { key: "design", is: ["table"] } },
    { key: "showLaps", label: "Tur sayısı", type: "boolean", default: true, group: "Satırlar" },
    { key: "showDelta", label: "En hızlıya göre fark", type: "boolean", default: true, group: "Satırlar" },
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
    { key: "hideEmpty", label: "Karşılaştıracak tur yokken gizle", type: "boolean", default: false },
    { key: "colBest", label: "En hızlı", type: "color", default: "#33d17a", group: "Renkler" },
    { key: "colSlow", label: "Daha yavaş", type: "color", default: "#ffcc33", group: "Renkler" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm", hint: "Bütün gösterge yazı boyutuyla birlikte büyür ve küçülür." },
    { key: "width", label: "Genişlik", type: "number", default: 380, min: 220, max: 900, step: 10, unit: "px", group: "Görünüm" },
  ],
});
