import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "telemetry",
  name: "Telemetri Paneli",
  description: "Vites halkası ve devir göstergesi, hız, devir ışıkları, pozisyon, son tur, yakıt ve pist sıcaklığı.",
  category: "driving",
  topics: [{ name: "telemetry", hz: 30 }],
  size: { w: 520, h: 104 },
  defaultPosition: { x: 700, y: 800 },
  defaultEnabled: false,
  settings: [
    { key: "leds", label: "Devir ışığı sayısı", type: "number", default: 15, min: 6, max: 24, step: 1 },
    { key: "showPosition", label: "Pozisyon ve değişim", type: "boolean", default: true },
    { key: "showLast", label: "Son tur", type: "boolean", default: true },
    { key: "showFuel", label: "Yakıt", type: "boolean", default: true },
    { key: "showTemp", label: "Pist sıcaklığı", type: "boolean", default: true },
    { key: "showElectronics", label: "ABS / TC / Fren dengesi", type: "boolean", default: false },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 30, min: 10, max: 60, step: 10, unit: "Hz" },
  ],
});
