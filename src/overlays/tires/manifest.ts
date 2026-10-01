import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "tires",
  name: "Lastikler",
  description:
    "Dört lastiğin iç/orta/dış sıcaklığı, kalan diş ve soğuk basıncı. iRacing bu değerleri sadece pitte (lastik kontrolünde) günceller.",
  category: "driving",
  topics: [{ name: "tires", hz: 1 }],
  size: { w: 260, h: 250 },
  defaultPosition: { x: 1290, y: 780 },
  defaultEnabled: false,
  settings: [
    { key: "showTemp", label: "Sıcaklık", type: "boolean", default: true },
    { key: "showWear", label: "Kalan diş", type: "boolean", default: true },
    { key: "showPressure", label: "Soğuk basınç", type: "boolean", default: true },
    {
      key: "pressUnit",
      label: "Basınç birimi",
      type: "select",
      default: "psi",
      options: [
        { value: "kpa", label: "kPa" },
        { value: "psi", label: "psi" },
        { value: "bar", label: "bar" },
      ],
    },
    { key: "cold", label: "Soğuk sınırı", type: "number", default: 70, min: 30, max: 120, step: 5, unit: "°C" },
    { key: "hot", label: "Sıcak sınırı", type: "number", default: 105, min: 60, max: 160, step: 5, unit: "°C" },
  ],
});
