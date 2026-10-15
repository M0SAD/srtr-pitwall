import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "voiceroom",
  name: "Ses Odası",
  description:
    "Ses odasındayken kimin konuştuğunu gösterir: konuşanın adı yanar, mikrofonu kapalı olanlar ve söz hakkıyla odalarda kalan konuşma süresi görünür. Odada değilken gizlenir.",
  category: "info",
  // Veri panelden olayla gelir (src/voice/engine.ts "voiceroom-overlay")
  topics: [],
  size: { w: 240, h: 220 },
  defaultPosition: { x: 40, y: 420 },
  defaultEnabled: false,
  settings: [
    {
      key: "show",
      label: "Kimler gösterilsin",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Odadaki herkes" },
        { value: "speakers", label: "Konuşabilenler (söz hakkı olanlar)" },
        { value: "talking", label: "Sadece şu an konuşanlar" },
      ],
    },
    { key: "showMe", label: "Kendimi göster", type: "boolean", default: true },
    { key: "title", label: "Oda adını göster", type: "boolean", default: true },
    { key: "icons", label: "Mikrofon / ses simgeleri", type: "boolean", default: true },
    { key: "timer", label: "Söz hakkı süresi", type: "boolean", default: true },
    { key: "maxRows", label: "En çok satır", type: "number", default: 12, min: 1, max: 40, step: 1, ui: "stepper" },
    { key: "size", label: "Boyut", type: "number", default: 100, min: 60, max: 250, step: 5, unit: "%" },
    { key: "talkColor", label: "Konuşan rengi", type: "color", default: "#33d17a" },
    { key: "bg", label: "Arka plan", type: "boolean", default: true },
  ],
});
