import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "overtake",
  name: "Hızlı Sınıf Uyarısı",
  description:
    "Çok sınıflı yarışlarda arkadan yaklaşan daha hızlı sınıftaki araçları süre farkı ve sınıf rengiyle gösterir; en yakını yaklaştıkça çubuk dolar.",
  category: "race",
  topics: [{ name: "traffic", hz: 5 }],
  size: { w: 280, h: 110 },
  defaultPosition: { x: 820, y: 180 },
  defaultEnabled: false,
  settings: [
    { key: "within", label: "Uyarı mesafesi", type: "number", default: 5, min: 1, max: 12, step: 0.5, unit: "sn" },
    { key: "count", label: "En fazla araç", type: "number", default: 3, min: 1, max: 6, step: 1 },
    { key: "sameClass", label: "Aynı sınıfı da göster", type: "boolean", default: false, hint: "Tek sınıflı yarışta arkadan yaklaşanları göstermek için." },
    { key: "hideEmpty", label: "Araç yokken gizle", type: "boolean", default: true },
  ],
});
