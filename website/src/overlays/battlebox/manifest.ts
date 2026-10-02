import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "battlebox",
  name: "Battle Box",
  description: "Sınıfında hemen önündeki ve arkasındaki araç: numara, isim, son tur ve aradaki fark; yanında pozisyon rozeti.",
  category: "race",
  topics: [{ name: "standings", hz: 3 }],
  size: { w: 470, h: 80 },
  defaultPosition: { x: 725, y: 150 },
  defaultEnabled: false,
  settings: [
    { key: "showLast", label: "Son tur", type: "boolean", default: true },
    { key: "showBadge", label: "Pozisyon rozeti", type: "boolean", default: true },
  ],
});
