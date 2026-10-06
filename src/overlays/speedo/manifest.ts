import { defineOverlay } from "@/sdk/overlay";

const G_DIAL = "Kadran";
const G_COL = "Renkler";

export default defineOverlay({
  id: "speedo",
  name: "Hız Göstergesi",
  description: "Yalnızca hızı gösterir: üç dijital ve üç analog kadran tasarımı. En yüksek hız, kırmızı bölge, çizgiler ve renkler ayarlanabilir.",
  category: "driving",
  topics: [{ name: "inputs", hz: 30 }],
  size: { w: 220, h: 220 },
  defaultPosition: { x: 1040, y: 740 },
  defaultEnabled: false,
  multiInstance: true,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "analog",
      options: [
        { value: "digital", label: "Dijital: büyük sayı" },
        { value: "bar", label: "Dijital: sayı ve çubuk" },
        { value: "lcd", label: "Dijital: LCD ekran" },
        { value: "analog", label: "Analog: klasik kadran" },
        { value: "arc", label: "Analog: modern yay" },
        { value: "half", label: "Analog: yarım kadran" },
      ],
    },
    { key: "size", label: "Boyut", type: "number", default: 220, min: 90, max: 700, step: 10, unit: "px" },
    {
      key: "unit",
      label: "Birim",
      type: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Genel ayara göre" },
        { value: "kmh", label: "km/h" },
        { value: "mph", label: "mph" },
      ],
    },
    { key: "showUnit", label: "Birimi göster", type: "boolean", default: true },
    { key: "showGear", label: "Vitesi de göster", type: "boolean", default: false },
    { key: "max", label: "En yüksek hız", type: "number", default: 320, min: 60, max: 500, step: 10, group: G_DIAL, hint: "Kadranın ve çubuğun sonu (seçili birimde)." },
    { key: "redFrom", label: "Kırmızı bölge başlangıcı", type: "number", default: 85, min: 40, max: 100, step: 5, unit: "%", group: G_DIAL, hint: "100 = kırmızı bölge yok." },
    { key: "ticks", label: "Çizgileri göster", type: "boolean", default: true, group: G_DIAL, showIf: { key: "design", is: ["analog", "half"] } },
    { key: "numbers", label: "Rakamları göster", type: "boolean", default: true, group: G_DIAL, showIf: { key: "design", is: ["analog", "half"] } },
    { key: "digital", label: "Kadranın içinde sayı", type: "boolean", default: true, group: G_DIAL, showIf: { key: "design", is: ["analog", "arc", "half"] } },
    { key: "thick", label: "Yay / çubuk kalınlığı", type: "number", default: 100, min: 40, max: 250, step: 10, unit: "%", group: G_DIAL },
    { key: "customColors", label: "Özel renkler", type: "boolean", default: false, group: G_COL, hint: "Kapalıyken temanın (ya da bu overlay'in Görünüm ayarının) renkleri kullanılır." },
    { key: "textColor", label: "Sayı rengi", type: "color", default: "#f2f4f8", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "accentColor", label: "İbre / yay rengi", type: "color", default: "#ff8a2a", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "redColor", label: "Kırmızı bölge rengi", type: "color", default: "#ff4d4d", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "tickColor", label: "Çizgi ve rakam rengi", type: "color", default: "#9aa3b2", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bg", label: "Arka plan rengi", type: "color", default: "#0c0e13", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bgAlpha", label: "Arka plan opaklığı", type: "number", default: 86, min: 0, max: 100, step: 5, unit: "%", group: G_COL, showIf: { key: "customColors", is: [true] } },
  ],
});
