import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "radar",
  name: "Görsel Spotter",
  description:
    "Yanındaki ve yakınındaki araçları gösteren radar ya da sadece iki yan çubuk (spotter çubukları). Araç blokları boyuna konumlarına göre hareket eder.",
  category: "driving",
  topics: [{ name: "radar", hz: 30 }],
  size: { w: 220, h: 220 },
  defaultPosition: { x: 850, y: 600 },
  defaultEnabled: false,
  settings: [
    {
      key: "style",
      label: "Görünüm",
      type: "select",
      default: "radar",
      options: [
        { value: "radar", label: "Radar (görsel spotter)" },
        { value: "bars", label: "Spotter çubukları (sol/sağ)" },
      ],
    },
    { key: "hideWhenClear", label: "Kimse yokken gizle", type: "boolean", default: true },
    { key: "color", label: "Araç rengi", type: "color", default: "#ff8a2a" },
    { key: "range", label: "Görüş mesafesi (ön/arka)", type: "number", default: 12, min: 6, max: 40, step: 1, unit: "m" },
    // Radar
    { key: "showDistance", label: "Mesafe yaz (radar)", type: "boolean", default: false },
    // Çubuklar
    {
      key: "barGap",
      label: "Çubuklar arası mesafe",
      type: "number",
      default: 220,
      min: 20,
      max: 1200,
      step: 10,
      unit: "px",
      hint: "Sadece çubuk görünümünde. İki çubuğun iç kenarları arasındaki boşluk.",
    },
    { key: "barHeight", label: "Çubuk yüksekliği", type: "number", default: 180, min: 40, max: 600, step: 10, unit: "px" },
    { key: "barWidth", label: "Çubuk kalınlığı", type: "number", default: 44, min: 8, max: 120, step: 2, unit: "px" },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 30, min: 10, max: 60, step: 10, unit: "Hz" },
  ],
});
