import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "fuel",
  name: "Yakıt Hesaplayıcı",
  description:
    "Depo durumu, bitişe gereken yakıt, son tur / 5 / 10 tur ortalamasıyla tüketim-tur-stint-ikmal tablosu, hedef tüketim, kalan tur ve pit penceresi.",
  category: "race",
  topics: [
    { name: "fuel", hz: 2 },
    { name: "team", hz: 1 },
  ],
  size: { w: 320, h: 440 },
  defaultPosition: { x: 1560, y: 560 },
  defaultEnabled: true,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "simple",
      options: [
        { value: "simple", label: "Basit (sade)" },
        { value: "classic", label: "Ayrıntılı (klasik)" },
        { value: "line", label: "Tek satır (minimal)" },
        { value: "bar", label: "Kompakt çubuk", pro: true },
        { value: "gauge", label: "Yakıt göstergesi (ibreli)", pro: true },
      ],
      hint: "Basit: depo, kalan tur ve tüketim. Ayrıntılı: tablo, hedef tüketim ve kalan tur kutularıyla eski görünüm.",
      proHint: "Kompakt çubuk ve ibreli yakıt göstergesi PRO üyelere özel.",
    },
    { key: "margin", label: "İkmal emniyet payı", type: "number", default: 5, min: 0, max: 25, step: 1, unit: "%" },
    { key: "showTable", label: "Tüketim tablosu", type: "boolean", default: true, showIf: { key: "design", is: ["classic"] } },
    { key: "showLast", label: "Son tur tüketimi (SON)", type: "boolean", default: true, group: "Tüketim değerleri" },
    { key: "showAvg5", label: "5 tur ortalaması (ORT 5)", type: "boolean", default: true, group: "Tüketim değerleri" },
    { key: "showAvg10", label: "10 tur ortalaması (ORT 10)", type: "boolean", default: true, group: "Tüketim değerleri" },
    { key: "showTargets", label: "Hedef tüketim", type: "boolean", default: true, showIf: { key: "design", is: ["classic"] } },
    { key: "showRemaining", label: "Kalan tur (son/ort./en kötü)", type: "boolean", default: true, showIf: { key: "design", is: ["classic"] } },
    { key: "showPitWindow", label: "Pit penceresi", type: "boolean", default: true },
    {
      key: "showTeam",
      label: "Takım yakıtı",
      type: "boolean",
      default: true,
      showIf: { key: "design", not: ["line"] },
      hint: "Takım kodu (MQTT) ayarlıysa takım arkadaşlarının, güvenilir arkadaşların veri paylaşıyorsa onların yakıtı görünür.",
    },
    { key: "teamHideMe", label: "Takım listesinde kendini gizle", type: "boolean", default: false, showIf: { key: "design", not: ["line"] } },
  ],
});
