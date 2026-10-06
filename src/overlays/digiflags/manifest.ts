import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "digiflags",
  name: "DigiFlags",
  description: "Gerçek yarış donanımlarından esinlenen LED matris bayrak paneli: sarı, mavi, yeşil, beyaz, damalı, kırmızı, siyah, hasar, enkaz. Ceza alınca altında uyarı satırı.",
  category: "info",
  noBgOpacity: true,
  topics: [{ name: "session", hz: 5 }],
  size: { w: 180, h: 180 },
  defaultPosition: { x: 1100, y: 60 },
  defaultEnabled: false,
  settings: [
    { key: "size", label: "Matris boyutu", type: "number", default: 8, min: 6, max: 12, step: 1 },
    { key: "hideWhenNone", label: "Bayrak yokken gizle", type: "boolean", default: true },
    { key: "showGreen", label: "Yeşil bayrağı da göster", type: "boolean", default: false },
    {
      key: "showPenalty",
      label: "Ceza uyarısı satırı",
      type: "boolean",
      default: true,
      hint: "Ceza aldığında (siyah bayrak, pit geçişi, dur-kalk, diskalifiye, hasar bayrağı, yavaşla uyarısı) panelin altında cezayı yazan bir satır gösterir. Cezanın türünü ACC ve AMS2 bildirir; iRacing ve LMU'da genel ceza / siyah bayrak olarak görünür.",
    },
    { key: "blink", label: "Dalgalanan bayraklarda yanıp sön", type: "boolean", default: true },
  ],
});
