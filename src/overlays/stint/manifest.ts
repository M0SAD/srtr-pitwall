import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "stint",
  name: "Stint Özeti",
  description:
    "Süren stint'in tur sayısı, süresi, ortalama ve en iyi turu, tempo eğilimi, lastik yaşı ve yakıt ortalaması; önceki stint'le karşılaştırma ve son stint'lerin tablosu. Stint'ler pit stoplarda ayrılır.",
  category: "race",
  topics: [{ name: "strategy", hz: 1 }],
  size: { w: 340, h: 150 },
  defaultPosition: { x: 40, y: 420 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "compact",
      options: [
        { value: "compact", label: "Kompakt (süren stint)" },
        { value: "table", label: "Tablo (son stint'ler)" },
      ],
    },
    { key: "width", label: "Genişlik", type: "number", default: 340, min: 240, max: 800, step: 10, unit: "px" },
    { key: "rows", label: "Gösterilecek stint sayısı", type: "number", default: 5, min: 2, max: 12, step: 1, ui: "stepper", showIf: { key: "design", is: ["table"] } },
    { key: "newestTop", label: "En yeni stint üstte", type: "boolean", default: true, showIf: { key: "design", is: ["table"] } },
    { key: "showTime", label: "Stint süresi", type: "boolean", default: true, group: "Gösterilecekler" },
    { key: "showAvg", label: "Ortalama tur", type: "boolean", default: true, group: "Gösterilecekler" },
    { key: "showBest", label: "En iyi tur", type: "boolean", default: true, group: "Gösterilecekler" },
    { key: "showTrend", label: "Tempo eğilimi", type: "boolean", default: true, group: "Gösterilecekler", hint: "Stint'teki temiz turların eğimi: ok yukarı ve kırmızıysa yavaşlıyorsun, aşağı ve yeşilse hızlanıyorsun (saniye / tur)." },
    { key: "showTyre", label: "Lastik yaşı", type: "boolean", default: true, group: "Gösterilecekler", hint: "Bu lastik takımıyla atılan tur. Sim lastik değişimini bildirmiyorsa her pit stopta değiştiği varsayılır ve değer \"~\" ile gösterilir." },
    { key: "showFuel", label: "Yakıt ortalaması", type: "boolean", default: true, group: "Gösterilecekler" },
    { key: "showSpark", label: "Tur süresi grafiği", type: "boolean", default: true, group: "Gösterilecekler", showIf: { key: "design", is: ["compact"] } },
    { key: "showCompare", label: "Önceki stint'le karşılaştırma", type: "boolean", default: true, group: "Gösterilecekler", showIf: { key: "design", is: ["compact"] } },
    { key: "showDriver", label: "Sürücü sütunu", type: "boolean", default: false, group: "Gösterilecekler", showIf: { key: "design", is: ["table"] }, hint: "Takım yarışlarında stint'i kimin sürdüğünü gösterir." },
    { key: "showPit", label: "Pit süresi sütunu", type: "boolean", default: false, group: "Gösterilecekler", showIf: { key: "design", is: ["table"] }, hint: "Stint'i bitiren pit stopta pit yolunda geçen süre." },
    { key: "hidePits", label: "Pitte gizle", type: "boolean", default: false },
  ],
});
