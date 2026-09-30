import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS, headerField } from "@/sdk/HeaderStats";

export default defineOverlay({
  id: "relative",
  name: "Relative",
  description:
    "Pistte önündeki ve arkandaki araçlar: fark, stint, lisans/SR, iRating ve tahmini değişimi, son tur, bayraklar. Üstte hava, altta SOF ve olay puanı.",
  category: "race",
  topics: [
    { name: "relative", hz: 10 },
    { name: "session", hz: 1 },
    { name: "weather", hz: 0.5 },
  ],
  size: { w: 560, h: 290 },
  defaultPosition: { x: 40, y: 580 },
  defaultEnabled: true,
  settings: [
    { key: "rows", label: "Önde/arkada gösterilecek araç", type: "number", default: 3, min: 1, max: 8, step: 1 },
    { key: "nameFormat", label: "Ad biçimi", type: "select", default: "full", options: NAME_FORMATS },
    { key: "showHeader", label: "Üst satır", type: "boolean", default: true, group: "Başlık" },
    headerField("headerFields", "Üst satır bilgileri", ["air", "track", "wetness", "humidity", "precip"]),
    { key: "showFooter", label: "Alt satır", type: "boolean", default: true, group: "Başlık" },
    headerField("footerFields", "Alt satır bilgileri", ["sof", "incidents", "remaining", "clock"]),
    { key: "showClass", label: "Sınıf rengi", type: "boolean", default: true },
    { key: "showCar", label: "Araç markası (logo)", type: "boolean", default: false },
    { key: "showStint", label: "Stint / PIT / OUT", type: "boolean", default: true },
    { key: "showLicense", label: "Lisans ve SR", type: "boolean", default: true },
    { key: "showIrating", label: "iRating", type: "boolean", default: true },
    { key: "showIrDelta", label: "Tahmini iRating değişimi (yarış)", type: "boolean", default: true },
    { key: "showLast", label: "Son tur", type: "boolean", default: true },
    { key: "showFlags", label: "Bayrak sütunu", type: "boolean", default: true },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 10, min: 2, max: 30, step: 1, unit: "Hz" },
  ],
});
