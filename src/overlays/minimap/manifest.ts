import { defineOverlay } from "@/sdk/overlay";
import { meMarkerFields } from "../trackmap/marker";

export default defineOverlay({
  id: "minimap",
  name: "Mini Harita",
  description: "Aracını merkeze alan, yakınlaştırılmış yuvarlak pist görünümü. Yakındaki araçları gösterir; istersen gidiş yönü hep yukarıda.",
  category: "driving",
  topics: [{ name: "map", hz: 20 }],
  size: { w: 220, h: 220 },
  defaultPosition: { x: 1680, y: 820 },
  defaultEnabled: false,
  settings: [
    { key: "zoom", label: "Görüş yarıçapı", type: "number", default: 350, min: 100, max: 1500, step: 50, unit: "m" },
    { key: "headingUp", label: "Gidiş yönü hep yukarıda", type: "boolean", default: true },
    {
      key: "mirror",
      label: "Aynala (harita ters görünüyorsa)",
      type: "boolean",
      default: false,
      hint: "iRacing dışındaki bazı oyunlarda harita sağ-sol ters çizilebilir (sola dönerken pist sağa kıvrılıyorsa); öyleyse bunu aç. iRacing'de kapalı kalmalı.",
    },
    { key: "carSize", label: "Araç işareti boyutu", type: "number", default: 9, min: 5, max: 16, step: 1, unit: "px" },
    { key: "lineWidth", label: "Pist çizgi kalınlığı", type: "number", default: 4, min: 2, max: 10, step: 1, unit: "px" },
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
    ...meMarkerFields({ color: "#ff3b30", shape: "arrow" }),
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 20, min: 5, max: 60, step: 5, unit: "Hz" },
  ],
});
