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
    { key: "margin", label: "İkmal emniyet payı", type: "number", default: 5, min: 0, max: 25, step: 1, unit: "%" },
    { key: "showTable", label: "Tüketim tablosu", type: "boolean", default: true },
    { key: "showTargets", label: "Hedef tüketim", type: "boolean", default: true },
    { key: "showRemaining", label: "Kalan tur (son/ort./en kötü)", type: "boolean", default: true },
    { key: "showPitWindow", label: "Pit penceresi", type: "boolean", default: true },
    {
      key: "showTeam",
      label: "Takım yakıtı",
      type: "boolean",
      default: true,
      hint: "Takım kodu (MQTT) ayarlıysa takım arkadaşlarının, güvenilir arkadaşların veri paylaşıyorsa onların yakıtı görünür.",
    },
    { key: "teamHideMe", label: "Takım listesinde kendini gizle", type: "boolean", default: false },
  ],
});
