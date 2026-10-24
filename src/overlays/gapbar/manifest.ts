import { defineOverlay } from "@/sdk/overlay";

const secs = { key: "unit", is: ["s"] };
const metres = { key: "unit", is: ["m"] };

export default defineOverlay({
  id: "gapbar",
  name: "Mesafe Çubuğu",
  description:
    "Aynanın altına yerleşen sade bir şerit: solda öndeki, sağda arkadaki araçla aradaki fark. Fark süre (saniye) ya da mesafe (metre) olarak gösterilir; araç yaklaştıkça çubuk kısalır ve yeşilden sarıya, kırmızıya döner.",
  category: "race",
  topics: [
    { name: "relative", hz: 10 },
    { name: "map", hz: 10 },
  ],
  optionalTopics: [{ name: "telemetry", hz: 5, when: (o) => o.center === "speed" }],
  size: { w: 520, h: 34 },
  defaultPosition: { x: 700, y: 140 },
  defaultEnabled: false,
  noBgOpacity: true,
  resize: { w: "width" },
  settings: [
    {
      key: "unit",
      label: "Fark",
      type: "select",
      default: "s",
      options: [
        { value: "s", label: "Süre (saniye)" },
        { value: "m", label: "Mesafe (metre)" },
      ],
      hint: "Mesafe, araçların pistteki konumundan hesaplanır (pist uzunluğu bilinmiyorsa hızla tahmin edilir).",
    },
    { key: "rangeS", label: "Çubuk ölçeği", type: "number", default: 3, min: 0.5, max: 20, step: 0.5, unit: "sn", showIf: secs, hint: "Fark bu kadar ya da daha fazlaysa çubuk tam dolu (güvenli); araç yaklaştıkça kısalır." },
    { key: "rangeM", label: "Çubuk ölçeği", type: "number", default: 150, min: 20, max: 1000, step: 10, unit: "m", showIf: metres, hint: "Fark bu kadar ya da daha fazlaysa çubuk tam dolu (güvenli); araç yaklaştıkça kısalır." },
    {
      key: "fill",
      label: "Çubuk",
      type: "select",
      default: "gap",
      options: [
        { value: "gap", label: "Aradaki boşluk (yaklaşınca kısalır)" },
        { value: "close", label: "Yakınlık (yaklaşınca uzar)" },
      ],
    },
    {
      key: "center",
      label: "Ortada",
      type: "select",
      default: "pos",
      options: [
        { value: "pos", label: "Sıram" },
        { value: "classPos", label: "Sınıf sıram" },
        { value: "speed", label: "Hız" },
        { value: "none", label: "Hiçbir şey" },
      ],
    },
    { key: "values", label: "Fark değerlerini yaz", type: "boolean", default: true },
    { key: "labels", label: "\"Önde\" / \"Arkada\" yazısı", type: "boolean", default: false },
    { key: "sameClass", label: "Yalnızca kendi sınıfım", type: "boolean", default: false },
    { key: "skipPit", label: "Pitteki araçları atla", type: "boolean", default: true },
    { key: "hideEmpty", label: "Araç yoksa o tarafı gizle", type: "boolean", default: false },

    { key: "width", label: "Genişlik", type: "number", default: 520, min: 200, max: 1400, step: 10, unit: "px", group: "Görünüm" },
    { key: "barH", label: "Çubuk kalınlığı", type: "number", default: 10, min: 3, max: 30, step: 1, unit: "px", group: "Görünüm" },
    { key: "cFar", label: "Uzak (güvenli) rengi", type: "color", default: "#1fc95a", group: "Görünüm" },
    { key: "cMid", label: "Yaklaşıyor rengi", type: "color", default: "#f5b301", group: "Görünüm" },
    { key: "cNear", label: "Çok yakın rengi", type: "color", default: "#ef4444", group: "Görünüm", resetKeys: ["cFar", "cMid", "cNear"], resetLabel: "Renkleri sıfırla" },
    { key: "panel", label: "Arka plan şeridi", type: "boolean", default: false, group: "Görünüm" },
  ],
});
