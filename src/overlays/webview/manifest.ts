import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "webview",
  name: "Webview",
  description: "Herhangi bir web sayfasını overlay olarak göster (sohbet, yayın uyarıları, zamanlayıcı, kendi panelin).",
  category: "info",
  noBgOpacity: true,
  topics: [],
  size: { w: 400, h: 300 },
  defaultPosition: { x: 760, y: 380 },
  defaultEnabled: false,
  multiInstance: true,
  settings: [
    {
      key: "url",
      label: "Adres",
      type: "text",
      default: "",
      hint: "https:// ile başlayan tam adres. YouTube, Twitch ve Kick adresleri kendiliğinden oynatıcıya çevrilir (video adresini olduğu gibi yapıştırabilirsin). Bazı siteler başka sayfalara gömülmeyi engeller; o durumda boş görünür.",
    },
    { key: "width", label: "Genişlik", type: "number", default: 400, min: 100, max: 1920, step: 10, unit: "px" },
    { key: "height", label: "Yükseklik", type: "number", default: 300, min: 60, max: 1080, step: 10, unit: "px" },
    { key: "transparent", label: "Şeffaf arka plan", type: "boolean", default: true },
    {
      key: "reload",
      label: "Otomatik yenile",
      type: "number",
      default: 0,
      min: 0,
      max: 600,
      step: 10,
      unit: "sn",
      hint: "0 = kapalı",
    },
  ],
});
