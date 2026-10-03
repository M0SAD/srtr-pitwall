import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS, headerField } from "@/sdk/HeaderStats";
import { labelStyleField } from "@/sdk/WxIcon";

export const RELATIVE_COLUMNS = [
  { value: "class", label: "Sınıf rengi" },
  { value: "pos", label: "Sınıf sırası" },
  { value: "num", label: "Araç numarası" },
  { value: "flair", label: "Ülke" },
  { value: "name", label: "Sürücü" },
  { value: "car", label: "Araç markası (logo)" },
  { value: "stint", label: "Stint / PIT / OUT" },
  { value: "license", label: "Lisans ve SR" },
  { value: "irating", label: "iRating" },
  { value: "last", label: "Son tur" },
  { value: "tire", label: "Lastik" },
  { value: "gap", label: "Fark" },
  { value: "flag", label: "Bayrak" },
];

export const RELATIVE_DEFAULT_COLUMNS = [
  { key: "class", on: true },
  { key: "pos", on: true },
  { key: "num", on: true },
  { key: "flair", on: true },
  { key: "name", on: true },
  { key: "car", on: true },
  { key: "license", on: true },
  { key: "irating", on: true },
  { key: "stint", on: true },
  { key: "gap", on: true },
  { key: "last", on: true },
  { key: "tire", on: true },
  { key: "flag", on: true },
];

/** Sütun genişliği ayarında varsayılandan ilk değişiklikte başlanan yaklaşık değerler (px) */
export const RELATIVE_COL_START: Record<string, number> = {
  class: 4, pos: 24, num: 40, flair: 26, name: 130, car: 44, stint: 40, license: 60, irating: 54, last: 62, tire: 22, gap: 46, flag: 26,
};

export default defineOverlay({
  id: "relative",
  name: "Yakındakiler",
  description:
    "Pistte önündeki ve arkandaki araçlar (Relative): fark, stint, lisans/SR, ülke bayrağı, iRating ve tahmini değişimi, son tur, bayraklar. Üstte hava, altta SOF ve olay puanı.",
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
    headerField("footerFields", "Alt satır bilgileri", ["sof", "incidents", "position", "brakeBias", "remaining", "clock"]),
    labelStyleField("Başlık"),
    {
      key: "columns",
      label: "Sütunlar",
      type: "order",
      default: RELATIVE_DEFAULT_COLUMNS,
      options: RELATIVE_COLUMNS,
      widths: { key: "colWidths", start: RELATIVE_COL_START, min: 16, max: 400, step: 2, mins: { class: 2 } },
      group: "Sütunlar",
      hint: "Lastik: her aracın taktığı lastik — yağmur (mavi), ara (yeşil I), yumuşak (kırmızı S), orta (sarı M), sert (beyaz H), kuru (gri D). Bayrak: araca gösterilen bayrağın rengi.",
    },
    { key: "logoSize", label: "Logo boyutu", type: "number", default: 150, min: 80, max: 220, step: 10, unit: "%", group: "Sütunlar" },
    { key: "showIrDelta", label: "Tahmini iRating değişimi (yarış)", type: "boolean", default: true, group: "Sütunlar" },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 10, min: 2, max: 30, step: 1, unit: "Hz" },
  ],
});
