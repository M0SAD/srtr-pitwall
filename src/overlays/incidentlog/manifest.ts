import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "incidentlog",
  name: "Olay Günlüğü",
  description:
    "Bu oturumda aldığın her olay puanı: saat, tur, sektör ve türü (1x pist dışı, 2x kontrol kaybı/duvar, 4x temas). Yeni olay birkaç saniye vurgulanır.",
  category: "info",
  topics: [{ name: "incidents", hz: 2 }],
  size: { w: 320, h: 240 },
  defaultPosition: { x: 1580, y: 300 },
  defaultEnabled: false,
  settings: [
    { key: "count", label: "Gösterilen olay", type: "number", default: 6, min: 1, max: 20, step: 1 },
    {
      key: "time",
      label: "Zaman",
      type: "select",
      default: "real",
      options: [
        { value: "real", label: "Gerçek saat" },
        { value: "session", label: "Oturum süresi" },
        { value: "none", label: "Gösterme" },
      ],
    },
    { key: "showSector", label: "Sektör", type: "boolean", default: true },
    { key: "showKind", label: "Olay türü", type: "boolean", default: true },
    { key: "newestFirst", label: "En yeni en üstte", type: "boolean", default: true },
    { key: "flashSec", label: "Yeni olayı vurgula", type: "number", default: 6, min: 0, max: 30, step: 1, unit: "sn" },
    { key: "hideEmpty", label: "Olay yokken gizle", type: "boolean", default: false },
  ],
});
