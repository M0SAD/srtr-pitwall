import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "digiflags",
  name: "DigiFlags",
  description: "Gerçek yarış donanımlarından esinlenen LED matris bayrak paneli: sarı, mavi, yeşil, beyaz, damalı, kırmızı, siyah, hasar, enkaz.",
  category: "info",
  topics: [{ name: "session", hz: 5 }],
  size: { w: 180, h: 180 },
  defaultPosition: { x: 1100, y: 60 },
  defaultEnabled: false,
  settings: [
    { key: "size", label: "Matris boyutu", type: "number", default: 8, min: 6, max: 12, step: 1 },
    { key: "hideWhenNone", label: "Bayrak yokken gizle", type: "boolean", default: true },
    { key: "showGreen", label: "Yeşil bayrağı da göster", type: "boolean", default: false },
    { key: "blink", label: "Dalgalanan bayraklarda yanıp sön", type: "boolean", default: true },
  ],
});
