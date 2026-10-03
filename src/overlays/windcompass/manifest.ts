import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "windcompass",
  name: "Rüzgâr Pusulası",
  description:
    "Rüzgârın aracına göre yönü: karşıdan mı, arkadan mı, yandan mı esiyor. Küçük bir pusula ya da ok ve yazı şeridi; rüzgâr hızı ve karşı / yan bileşenleriyle.",
  category: "info",
  topics: [{ name: "weather", hz: 15 }],
  size: { w: 150, h: 180 },
  defaultPosition: { x: 1500, y: 120 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "compass",
      options: [
        { value: "compass", label: "Pusula" },
        { value: "strip", label: "Ok ve yazı şeridi" },
      ],
      hint: "Pusula: araç ortada, rüzgâr oku çevresinde döner. Şerit: tek satırda ok, yön yazısı ve hız.",
    },
    { key: "showSpeed", label: "Rüzgâr hızı", type: "boolean", default: true },
    { key: "showCue", label: "Yön yazısı (karşıdan / arkadan / yandan)", type: "boolean", default: true },
    { key: "showParts", label: "Karşı ve yan bileşenler", type: "boolean", default: false, hint: "Rüzgârın araca göre boyuna (karşı / arka) ve yanal bileşenini ayrı ayrı gösterir." },
    { key: "showNorth", label: "Kuzey işareti", type: "boolean", default: true, showIf: { key: "design", is: ["compass"] } },
    { key: "calm", label: "Sakin sayılma eşiği", type: "number", default: 3, min: 0, max: 20, step: 1, unit: "km/h", hint: "Rüzgâr bundan yavaşsa yön yerine \"sakin\" yazar." },
    { key: "hideCalm", label: "Rüzgâr sakinken gizle", type: "boolean", default: false },
    { key: "smooth", label: "Yumuşatma", type: "number", default: 60, min: 0, max: 90, step: 10, unit: "%", hint: "Okun virajlarda ani sıçramasını yumuşatır." },
    { key: "colHead", label: "Karşıdan rengi", type: "color", default: "#4aa8ff", group: "Renkler" },
    { key: "colTail", label: "Arkadan rengi", type: "color", default: "#33d17a", group: "Renkler" },
    { key: "colCross", label: "Yandan rengi", type: "color", default: "#ffcc33", group: "Renkler" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm", hint: "Bütün gösterge yazı boyutuyla birlikte büyür ve küçülür." },
    { key: "size", label: "Pusula boyutu", type: "number", default: 120, min: 70, max: 260, step: 5, unit: "px", group: "Görünüm", showIf: { key: "design", is: ["compass"] } },
  ],
});
