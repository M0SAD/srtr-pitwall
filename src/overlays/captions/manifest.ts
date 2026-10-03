import { defineOverlay } from "@/sdk/overlay";
import { FONT_OPTIONS } from "../livechat/opts";

export default defineOverlay({
  id: "captions",
  name: "Altyazı",
  description:
    "Konuşmadan yazıya çevrilen metni altyazı olarak gösterir: kendi mikrofonun ve isteğe bağlı olarak bilgisayar sesi (ör. Discord'da konuşanlar), her biri kendi etiketi ve rengiyle. Kaynak ve cihazlar Canlı Sohbet › Konuşma → yazı sekmesinden seçilir.",
  category: "stream",
  topics: [{ name: "captions", hz: 5 }],
  size: { w: 900, h: 120 },
  defaultPosition: { x: 510, y: 900 },
  defaultEnabled: false,
  defaultAlwaysShow: true,
  settings: [
    {
      key: "always",
      label: "Sürekli göster",
      type: "boolean",
      default: true,
      hint: "Oyunda / seansta değilken de (oyun kapalı, tekrar izlerken, pist dışında) görünür.",
    },
    { key: "width", label: "Genişlik", type: "number", default: 900, min: 300, max: 1900, step: 20, unit: "px" },
    { key: "font", label: "Yazı tipi", type: "select", default: "", options: FONT_OPTIONS },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 36, min: 12, max: 160, step: 2, unit: "px" },
    { key: "color", label: "Yazı rengi", type: "color", default: "#FFFFFF" },
    { key: "remoteColor", label: "Bilgisayar sesi (Discord) rengi", type: "color", default: "#5fd3ff" },
    { key: "bg", label: "Arka plan", type: "boolean", default: true },
    { key: "align", label: "Hizalama", type: "select", default: "center", options: [
      { value: "left", label: "Sol" },
      { value: "center", label: "Orta" },
      { value: "right", label: "Sağ" },
    ] },
    { key: "maxAge", label: "Ekranda kalma süresi", type: "number", default: 8, min: 2, max: 60, step: 1, unit: "sn" },
  ],
});
