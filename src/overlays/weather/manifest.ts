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
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "default",
      options: [
        { value: "default", label: "Varsayılan (pusula + liste)" },
        { value: "strip", label: "Kompakt şerit" },
        { value: "card", label: "Sıcaklık kartı" },
        { value: "tiles", label: "Ayrıntılı kart (kutucuklar)", pro: true },
      ],
      proHint: "Ayrıntılı kart PRO üyelere özel.",
    },
    {
      key: "relative",
      label: "Rüzgâr yönünü araca göre göster",
      type: "boolean",
      default: true,
      hint: "Açıkken yukarı aracın gidiş yönüdür; rüzgârın aracına göre nereden geldiğini gösterir.",
    },
    { key: "showCompass", label: "Pusula", type: "boolean", default: true, showIf: { key: "design", is: ["default"] } },
    { key: "showWetness", label: "Pist ıslaklığı", type: "boolean", default: true },
    labelStyleField(),
  ],
});
