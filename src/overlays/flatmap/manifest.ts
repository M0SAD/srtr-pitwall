import { defineOverlay } from "@/sdk/overlay";
import { meMarkerFields } from "../trackmap/marker";

// Daire varsayılan görünümdür (sınıf rengi + beyaz halka); renkler diğer şekillerde kullanılır
const meFields = meMarkerFields({ color: "#ffffff" }).map((f) =>
  f.key === "meColor" || f.key === "meOutline" ? { ...f, showIf: { key: "meShape", not: ["circle", "image"] } } : f,
);

export default defineOverlay({
  id: "flatmap",
  name: "Düz Harita",
  description:
    "Pisti düz bir şerit olarak gösterir: tüm araçlar sınıf renkleriyle, sen ortada ya da başlangıç/bitiş solda. Arkadaşların ayrı renkte.",
  category: "race",
  topics: [{ name: "map", hz: 10 }],
  size: { w: 700, h: 56 },
  defaultPosition: { x: 610, y: 1010 },
  defaultEnabled: false,
  settings: [
    {
      key: "mode",
      label: "Yerleşim",
      type: "select",
      default: "centered",
      options: [
        { value: "centered", label: "Ben ortada (±yarım tur)" },
        { value: "absolute", label: "Başlangıç/bitiş solda" },
      ],
    },
    { key: "width", label: "Genişlik", type: "number", default: 700, min: 300, max: 1800, step: 20, unit: "px", group: "Boyut" },
    { key: "numbers", label: "Araç numaraları", type: "boolean", default: true },
    { key: "hidePit", label: "Pitteki araçları gizle", type: "boolean", default: true },
    { key: "sectors", label: "Sektör çizgileri", type: "boolean", default: true },
    ...meFields,
  ],
});
