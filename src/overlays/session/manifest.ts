import { defineOverlay } from "@/sdk/overlay";
import { labelStyleField } from "@/sdk/WxIcon";

export default defineOverlay({
  id: "session",
  name: "Oturum & Bayraklar",
  description: "Bayrak uyarıları, kalan süre/tur, pozisyon, sıcaklıklar, olay puanı ve araç ayarları (BB/TC/ABS).",
  category: "info",
  topics: [{ name: "session", hz: 2 }],
  size: { w: 300, h: 150 },
  defaultPosition: { x: 1580, y: 60 },
  defaultEnabled: true,
  settings: [
    { key: "showFlags", label: "Bayrak uyarısı", type: "boolean", default: true },
    { key: "showWeather", label: "Hava ve pist", type: "boolean", default: true },
    { ...labelStyleField(), showIf: { key: "showWeather", is: [true] } },
    { key: "showCar", label: "BB / TC / ABS", type: "boolean", default: true },
    { key: "showIncidents", label: "Olay puanı", type: "boolean", default: true },
    { key: "showClock", label: "Saat", type: "boolean", default: false },
  ],
});
