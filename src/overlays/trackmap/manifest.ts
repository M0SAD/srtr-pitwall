import { defineOverlay } from "@/sdk/overlay";
import { meMarkerFields } from "./marker";

export default defineOverlay({
  id: "trackmap",
  name: "Pist Haritası",
  description:
    "Tüm pist ve üzerindeki araçlar; sınıf renkleri, numaralar, senin aracın vurgulu. Pist şekli ilk temiz turunda otomatik kaydedilir.",
  category: "race",
  topics: [{ name: "map", hz: 10 }],
  size: { w: 360, h: 280 },
  defaultPosition: { x: 1500, y: 240 },
  defaultEnabled: false,
  settings: [
    {
      key: "label",
      label: "Araç üzerindeki yazı",
      type: "select",
      default: "number",
      options: [
        { value: "number", label: "Araç numarası" },
        { value: "pos", label: "Sınıf pozisyonu" },
        { value: "none", label: "Yok" },
      ],
    },
    { key: "width", label: "Genişlik", type: "number", default: 360, min: 160, max: 1200, step: 10, unit: "px" },
    { key: "height", label: "Yükseklik", type: "number", default: 280, min: 120, max: 1000, step: 10, unit: "px" },
    { key: "carSize", label: "Araç işareti boyutu", type: "number", default: 11, min: 5, max: 20, step: 1, unit: "px" },
    { key: "lineWidth", label: "Pist çizgi kalınlığı", type: "number", default: 5, min: 2, max: 14, step: 1, unit: "px" },
    {
      key: "rotate",
      label: "Döndür",
      type: "select",
      default: "0",
      options: [
        { value: "0", label: "0°" },
        { value: "90", label: "90°" },
        { value: "180", label: "180°" },
        { value: "270", label: "270°" },
      ],
    },
    { key: "mirror", label: "Aynala (harita ters görünüyorsa)", type: "boolean", default: false },
    { key: "fill", label: "Pist içini doldur", type: "boolean", default: true },
    ...meMarkerFields({ color: "#ffffff" }),
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 10, min: 2, max: 30, step: 1, unit: "Hz" },
  ],
});
