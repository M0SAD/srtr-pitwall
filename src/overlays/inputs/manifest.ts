import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "inputs",
  name: "Pedallar & Girdi",
  description: "Gaz/fren/debriyaj izi, anlık pedal çubukları, vites, hız ve direksiyon.",
  category: "driving",
  topics: [{ name: "inputs", hz: 60 }],
  size: { w: 420, h: 110 },
  defaultPosition: { x: 750, y: 920 },
  defaultEnabled: true,
  settings: [
    { key: "seconds", label: "İz süresi", type: "number", default: 6, min: 2, max: 15, step: 1, unit: "sn" },
    { key: "showTrace", label: "Pedal izi grafiği", type: "boolean", default: true },
    {
      key: "smooth",
      label: "Yumuşak grafik",
      type: "boolean",
      default: false,
      hint: "Pedal izini köşeli çizgiler yerine yumuşak eğrilerle çizer.",
    },
    { key: "showClutch", label: "Debriyaj", type: "boolean", default: false },
    { key: "showSteer", label: "Direksiyon", type: "boolean", default: true },
    { key: "showGear", label: "Vites ve hız", type: "boolean", default: true },
    { key: "throttleColor", label: "Gaz rengi", type: "color", default: "#33d17a" },
    { key: "brakeColor", label: "Fren rengi", type: "color", default: "#ff4d4f" },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 60, min: 20, max: 60, step: 10, unit: "Hz" },
  ],
});
