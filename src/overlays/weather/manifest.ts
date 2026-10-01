import { defineOverlay } from "@/sdk/overlay";
import { labelStyleField } from "@/sdk/WxIcon";

export default defineOverlay({
  id: "weather",
  name: "Canlı Hava",
  description: "Rüzgâr pusulası (yön ve hız), pist ve hava sıcaklığı, nem, yağış ve pist ıslaklığı.",
  category: "info",
  topics: [{ name: "weather", hz: 2 }],
  size: { w: 240, h: 380 },
  defaultPosition: { x: 1640, y: 240 },
  defaultEnabled: false,
  settings: [
    {
      key: "relative",
      label: "Pusulayı araca göre döndür",
      type: "boolean",
      default: true,
      hint: "Açıkken yukarı aracın gidiş yönüdür; rüzgârın aracına göre nereden geldiğini gösterir.",
    },
    { key: "showCompass", label: "Pusula", type: "boolean", default: true },
    { key: "showWetness", label: "Pist ıslaklığı çubuğu", type: "boolean", default: true },
    labelStyleField(),
  ],
});
