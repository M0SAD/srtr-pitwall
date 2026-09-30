import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "pitspeed",
  name: "Pit Hızı",
  description:
    "Pit yoluna yaklaşırken ve pit yolundayken hız sınırına göre hızın; sınırlayıcı kapalıysa uyarır, sınırı aşınca kırmızı yanar.",
  category: "driving",
  topics: [{ name: "pit", hz: 20 }],
  size: { w: 220, h: 120 },
  defaultPosition: { x: 850, y: 700 },
  defaultEnabled: false,
  settings: [
    {
      key: "show",
      label: "Ne zaman görünsün",
      type: "select",
      default: "pit",
      options: [
        { value: "pit", label: "Pit yolunda ve yaklaşırken" },
        { value: "always", label: "Her zaman" },
      ],
    },
    { key: "margin", label: "Uyarı payı", type: "number", default: 2, min: 0, max: 10, step: 0.5, unit: "km/h", hint: "Sınırın bu kadar altına inince sarı yanar." },
    { key: "warnLimiter", label: "Sınırlayıcı kapalı uyarısı", type: "boolean", default: true },
  ],
});
