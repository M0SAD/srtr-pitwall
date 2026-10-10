import { defineOverlay } from "@/sdk/overlay";

const G_COL = "Renkler";

export default defineOverlay({
  id: "gear",
  name: "Vites",
  description: "Yalnızca takılı vitesi büyük ve okunaklı gösterir. Vites değiştirme devrinde renk değiştirir; devir halkalı, LED'li ve neon tasarımları vardır.",
  category: "driving",
  // Tekrar ekranında çalışmaz (sürüş verisi yalnızca kendin sürerken gelir)
  replay: false,
  topics: [{ name: "inputs", hz: 30 }],
  size: { w: 130, h: 150 },
  defaultPosition: { x: 895, y: 760 },
  defaultEnabled: false,
  multiInstance: true,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "box",
      options: [
        { value: "box", label: "Kutu" },
        { value: "minimal", label: "Yalnızca rakam" },
        { value: "ring", label: "Devir halkası", pro: true },
        { value: "leds", label: "Vites LED'leri", pro: true },
        { value: "neon", label: "Neon", pro: true },
        { value: "hex", label: "Altıgen", pro: true },
      ],
      proHint: "Devir halkası, vites LED'leri, neon ve altıgen tasarımları PRO üyelere özel.",
    },
    { key: "size", label: "Boyut", type: "number", default: 120, min: 50, max: 500, step: 5, unit: "px" },
    { key: "showLabel", label: "Başlığı göster", type: "boolean", default: false },
    { key: "showSpeed", label: "Altında hızı göster", type: "boolean", default: false },
    { key: "shiftFlash", label: "Vites değiştirme devrinde renk değiştir", type: "boolean", default: true },
    { key: "shiftBlink", label: "Vites değiştirme devrinde yanıp sön", type: "boolean", default: false },
    { key: "customColors", label: "Özel renkler", type: "boolean", default: false, group: G_COL, hint: "Kapalıyken temanın (ya da bu overlay'in Görünüm ayarının) renkleri kullanılır." },
    { key: "textColor", label: "Rakam rengi", type: "color", default: "#f2f4f8", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "accentColor", label: "Vurgu rengi", type: "color", default: "#ff8a2a", group: G_COL, showIf: { key: "customColors", is: [true] }, hint: "Devir halkası, LED'ler, neon ışıması ve çerçevede kullanılır." },
    { key: "shiftColor", label: "Vites değiştirme rengi", type: "color", default: "#ff4d4d", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "reverseColor", label: "Geri vites rengi", type: "color", default: "#ffd23f", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bg", label: "Arka plan rengi", type: "color", default: "#0c0e13", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bgAlpha", label: "Arka plan opaklığı", type: "number", default: 86, min: 0, max: 100, step: 5, unit: "%", group: G_COL, showIf: { key: "customColors", is: [true] } },
  ],
});
