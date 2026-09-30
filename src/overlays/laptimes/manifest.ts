import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "laptimes",
  name: "Tur Süreleri",
  description:
    "Son turlarının süreleri, sektörleri, en iyi tura farkı ve harcanan yakıt. Geçersiz (pist dışı/olaylı) ve pit turları işaretlenir; teorik en iyi tur hesaplanır.",
  category: "driving",
  topics: [{ name: "laps", hz: 2 }],
  size: { w: 330, h: 300 },
  defaultPosition: { x: 1560, y: 420 },
  defaultEnabled: false,
  settings: [
    { key: "count", label: "Gösterilen tur", type: "number", default: 8, min: 3, max: 20, step: 1 },
    { key: "showSectors", label: "Sektörler", type: "boolean", default: true },
    { key: "showDelta", label: "En iyiye fark", type: "boolean", default: true },
    { key: "showFuel", label: "Yakıt", type: "boolean", default: false },
    { key: "showOptimal", label: "Teorik en iyi tur", type: "boolean", default: true },
    { key: "hideInvalid", label: "Geçersiz turları gizle", type: "boolean", default: false },
    { key: "newestFirst", label: "En yeni en üstte", type: "boolean", default: true },
  ],
});
