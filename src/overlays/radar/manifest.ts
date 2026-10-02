import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "radar",
  name: "Radar",
  description:
    "Yanındaki ve yakınındaki araçları kuşbakışı gösteren radar. Araç blokları boyuna konumlarına göre hareket eder.",
  category: "driving",
  topics: [{ name: "radar", hz: 30 }],
  size: { w: 220, h: 220 },
  defaultPosition: { x: 850, y: 600 },
  defaultEnabled: false,
  settings: [
    {
      key: "hideWhenClear",
      label: "Kimse yokken gizle",
      type: "boolean",
      default: true,
    },
    { key: "color", label: "Araç rengi", type: "color", default: "#ff8a2a" },
    {
      key: "range",
      label: "Görüş mesafesi (ön/arka)",
      type: "number",
      default: 12,
      min: 6,
      max: 40,
      step: 1,
      unit: "m",
    },
    {
      key: "showDistance",
      label: "Mesafe yaz",
      type: "boolean",
      default: false,
    },
    {
      key: "hz",
      label: "Güncelleme sıklığı",
      type: "number",
      default: 30,
      min: 10,
      max: 60,
      step: 10,
      unit: "Hz",
    },
  ],
});
