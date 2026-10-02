import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "delta",
  name: "Delta Bar",
  description: "En iyi turuna göre anlık fark, kazanma/kaybetme eğilimi ve tur süreleri.",
  category: "driving",
  topics: [{ name: "delta", hz: 30 }],
  size: { w: 360, h: 74 },
  defaultPosition: { x: 780, y: 60 },
  defaultEnabled: true,
  settings: [
    { key: "range", label: "Çubuk aralığı", type: "number", default: 1.5, min: 0.5, max: 5, step: 0.5, unit: "sn" },
    { key: "showTimes", label: "Tur süreleri", type: "boolean", default: true },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 30, min: 10, max: 60, step: 10, unit: "Hz" },
  ],
});
