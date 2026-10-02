import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "incidents",
  name: "Olay Sayacı",
  description: "Tamamlanan tur ve olay puanın; yarışın olay sınırına yaklaştıkça renk değiştiren çubuk.",
  category: "info",
  topics: [{ name: "session", hz: 2 }],
  size: { w: 190, h: 230 },
  defaultPosition: { x: 1720, y: 60 },
  defaultEnabled: false,
  settings: [
    {
      key: "layout",
      label: "Yerleşim",
      type: "select",
      default: "stack",
      options: [
        { value: "stack", label: "Alt alta" },
        { value: "row", label: "Yan yana" },
      ],
    },
    { key: "showLaps", label: "Tur", type: "boolean", default: true },
    {
      key: "fallbackLimit",
      label: "Sınır yoksa varsayılan",
      type: "number",
      default: 17,
      min: 0,
      max: 60,
      step: 1,
      unit: "x",
      hint: "Oturumda olay sınırı tanımlı değilse çubuk bu değere göre dolar (0 = çubuk yok).",
    },
  ],
});
