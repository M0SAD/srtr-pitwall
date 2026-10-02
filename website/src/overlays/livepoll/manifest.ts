import { defineOverlay } from "@/sdk/overlay";
import { FONT_OPTIONS } from "../livechat/opts";

export default defineOverlay({
  id: "livepoll",
  name: "Sohbet Anketi",
  description:
    "Canlı sohbetteki anketi gösterir: izleyiciler şık numarasını yazarak oy verir. Soru, şıklar, oy çubukları, kalan süre ve kazanan (beraberlikte rastgele seçim animasyonu). Anket Canlı Sohbet sayfasından başlatılır.",
  category: "stream",
  topics: [{ name: "livepoll", hz: 10 }],
  size: { w: 360, h: 200 },
  defaultPosition: { x: 20, y: 200 },
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
    { key: "width", label: "Genişlik", type: "number", default: 360, min: 240, max: 900, step: 10, unit: "px" },
    { key: "font", label: "Yazı tipi", type: "select", default: "", options: FONT_OPTIONS },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 16, min: 10, max: 40, step: 1, unit: "px" },
    { key: "showQuestion", label: "Soruyu göster", type: "boolean", default: true },
    { key: "showAnswers", label: "Şık metinlerini göster", type: "boolean", default: true },
    { key: "barColor", label: "Çubuk rengi", type: "color", default: "#4ea1ff" },
    { key: "winColor", label: "Kazanan rengi", type: "color", default: "#ffc83d" },
  ],
});
