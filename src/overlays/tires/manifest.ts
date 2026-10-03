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
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "grid",
      options: [
        { value: "grid", label: "Varsayılan (tablo)" },
        { value: "cards", label: "Kompakt kartlar (2×2)" },
        { value: "bars", label: "Minimal aşınma çubukları" },
        { value: "car", label: "Araç üstten görünüm", pro: true },
      ],
      proHint: "Araç üstten görünüm PRO üyelere özel.",
    },
    {
      key: "onlyPit",
      label: "Sadece pitteyken göster",
      type: "boolean",
      default: true,
      hint: "Açıkken overlay yalnızca aracın pit yolunda ya da pit kutusundayken görünür; pistte gizlenir. Düzenleme modunda ve önizlemede her zaman görünür.",
    },
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
