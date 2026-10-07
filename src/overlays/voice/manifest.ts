import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "voice",
  name: "Sesli Mühendis",
  description:
    "Sesli mühendis ya da spotter konuşurken hoparlör simgesiyle birlikte ne dediğini altyazı olarak gösterir. Sesli Mühendis sayfasındaki ses paketiyle çalışır; sustuğunda kendiliğinden kaybolur.",
  category: "info",
  topics: [{ name: "voice", hz: 5 }, { name: "status", hz: 2 }],
  size: { w: 640, h: 84 },
  defaultPosition: { x: 640, y: 880 },
  defaultEnabled: false,
  defaultAlwaysShow: true,
  resize: { w: "maxWidth" },
  settings: [
    { key: "showEngineer", label: "Mühendis mesajlarını göster", type: "boolean", default: true },
    { key: "showSpotter", label: "Spotter mesajlarını göster", type: "boolean", default: true },
    { key: "showDriver", label: "Sesli komutta sorduğun soruyu göster", type: "boolean", default: true },
    { key: "hold", label: "Konuşma bitince ekranda kalma süresi", type: "number", default: 2, min: 0, max: 15, step: 0.5, unit: "sn" },
    { key: "showIcon", label: "Hoparlör simgesi", type: "boolean", default: true, group: "Görünüm" },
    { key: "showRole", label: "Konuşan etiketi (Mühendis / Spotter)", type: "boolean", default: true, group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 22, min: 12, max: 72, step: 1, unit: "px", group: "Görünüm" },
    { key: "maxWidth", label: "En fazla genişlik", type: "number", default: 640, min: 240, max: 1900, step: 20, unit: "px", group: "Görünüm" },
    { key: "bgOpacity", label: "Arka plan opaklığı", type: "number", default: 85, min: 0, max: 100, step: 5, unit: "%", group: "Görünüm" },
    {
      key: "align",
      label: "Hizalama",
      type: "select",
      default: "center",
      group: "Görünüm",
      options: [
        { value: "left", label: "Sol" },
        { value: "center", label: "Orta" },
        { value: "right", label: "Sağ" },
      ],
    },
    { key: "engineerColor", label: "Mühendis rengi", type: "color", default: "#ff8a2a", group: "Görünüm" },
    { key: "spotterColor", label: "Spotter rengi", type: "color", default: "#2ec4b6", group: "Görünüm" },
    { key: "driverColor", label: "Senin sorunun rengi", type: "color", default: "#8ab4f8", group: "Görünüm" },
  ],
});
