import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "corners",
  name: "Viraj Analizi",
  description:
    "En iyi turundaki virajları otomatik bulur ve her virajdaki en düşük hızını son turunla (ve bu turla) karşılaştırır. Nerede zaman kaybettiğini gösterir.",
  category: "driving",
  topics: [{ name: "corners", hz: 2 }],
  size: { w: 300, h: 320 },
  defaultPosition: { x: 1600, y: 560 },
  defaultEnabled: false,
  settings: [
    {
      key: "compare",
      label: "Karşılaştırma",
      type: "select",
      default: "live",
      options: [
        { value: "live", label: "Bu tur (geçilen virajlar), yoksa son tur" },
        { value: "last", label: "Son tur" },
      ],
    },
    { key: "threshold", label: "Önemsiz fark", type: "number", default: 1, min: 0, max: 5, step: 0.5, unit: "km/h", hint: "Bundan küçük farklar gri görünür." },
    { key: "max", label: "En fazla viraj", type: "number", default: 14, min: 4, max: 30, step: 1 },
    { key: "highlightNext", label: "Sıradaki virajı vurgula", type: "boolean", default: true },
  ],
});
