import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "scene",
  name: "Yayın Sahnesi",
  description: "Yayın için tam ekran sahneler: Başlıyor (geri sayım), Hemen dönerim, Yayın sonu ve garajdayken ekranı kapatan örtü.",
  category: "stream",
  topics: [{ name: "status", hz: 1 }],
  size: { w: 1920, h: 1080 },
  defaultPosition: { x: 0, y: 0 },
  defaultEnabled: false,
  // Şimdilik gereksiz: listelerde gizli (var olan düzenlerdeki kopyalar çalışır). Geri açmak için bu satırı sil.
  hidden: true,
  settings: [
    {
      key: "style",
      label: "Sahne",
      type: "select",
      default: "starting",
      options: [
        { value: "starting", label: "Yayın başlıyor" },
        { value: "brb", label: "Hemen dönerim" },
        { value: "ending", label: "Yayın sonu" },
        { value: "garage", label: "Garaj örtüsü (sadece garajdayken)" },
      ],
    },
    { key: "title", label: "Başlık", type: "text", default: "", placeholder: "Boş: sahneye göre" },
    { key: "subtitle", label: "Alt yazı", type: "text", default: "", placeholder: "ör. Bu akşam: Spa 6 Saat" },
    { key: "countdown", label: "Geri sayım", type: "number", default: 5, min: 0, max: 30, step: 1, unit: "dk", showIf: { key: "style", is: ["starting", "brb"] } },
    { key: "accent", label: "Vurgu rengi", type: "color", default: "#ff8a2a" },
    { key: "transparent", label: "Şeffaf arka plan (kendi sahne görselin OBS'te)", type: "boolean", default: false },
    { key: "w", label: "Genişlik", type: "number", default: 1920, min: 640, max: 3840, step: 10, unit: "px", group: "Boyut" },
    { key: "h", label: "Yükseklik", type: "number", default: 1080, min: 360, max: 2160, step: 10, unit: "px", group: "Boyut" },
  ],
});
