import { defineOverlay } from "@/sdk/overlay";
import { METRICS } from "./metrics";

export default defineOverlay({
  id: "dataframe",
  name: "Veri Kutusu",
  description: "Seçtiğin tek bir değeri büyük gösteren kutu: hız, vites, yakıt, delta, pozisyon, tur, sıcaklık, BB ve daha fazlası.",
  category: "info",
  topics: [
    { name: "telemetry", hz: 10 },
    { name: "session", hz: 2 },
    { name: "fuel", hz: 2 },
    { name: "delta", hz: 10 },
  ],
  size: { w: 150, h: 70 },
  defaultPosition: { x: 1200, y: 900 },
  defaultEnabled: false,
  multiInstance: true,
  settings: [
    {
      key: "metric",
      label: "Gösterilecek değer",
      type: "select",
      default: "speed",
      options: METRICS.map((m) => ({ value: m.id, label: m.label })),
    },
    { key: "title", label: "Başlığı göster", type: "boolean", default: true },
    { key: "width", label: "Genişlik", type: "number", default: 150, min: 80, max: 400, step: 10, unit: "px" },
    { key: "big", label: "Değer boyutu", type: "number", default: 26, min: 12, max: 72, step: 2, unit: "px" },
  ],
});
