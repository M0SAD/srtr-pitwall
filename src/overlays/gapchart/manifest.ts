import { defineOverlay } from "@/sdk/overlay";

const CHARTS = ["stacked", "combined"];

export default defineOverlay({
  id: "gapchart",
  name: "Fark Grafiği",
  description:
    "Sınıfında öndeki ve arkadaki araca (ya da sınıf liderine) olan süre farkını son turlar boyunca çizgi grafikte gösterir: tur başına bir örnek, anlık değer, yaklaşma / uzaklaşma eğilimi ve pit işaretleri.",
  category: "race",
  topics: [
    { name: "standings", hz: 2 },
    { name: "gaps", hz: 2 },
  ],
  size: { w: 340, h: 250 },
  defaultPosition: { x: 40, y: 420 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "stacked",
      options: [
        { value: "stacked", label: "Alt alta iki grafik" },
        { value: "list", label: "Sadece sayılar (eğilim listesi)" },
        { value: "combined", label: "Tek birleşik grafik", pro: true },
      ],
      hint: "Birleşik grafikte orta çizgi sensin: öndeki araç çizginin üstünde, arkadaki altında görünür.",
      proHint: "Tek birleşik grafik tasarımı PRO üyelere özel.",
    },
    {
      key: "aheadRef",
      label: "Öndeki araç",
      type: "select",
      default: "pos",
      options: [
        { value: "pos", label: "Sınıfta hemen önümdeki" },
        { value: "leader", label: "Sınıf lideri" },
      ],
      hint: "Arkadaki araç her zaman sınıfta hemen arkandakidir. Sıra değişince grafik yeni rakibin geçmişini gösterir.",
    },
    { key: "laps", label: "Gösterilecek tur sayısı", type: "number", default: 15, min: 5, max: 40, step: 1, ui: "stepper", hint: "Her tur için başlangıç / bitiş çizgisindeki fark bir nokta olarak eklenir; en sağdaki nokta anlık farktır. Yarış dışındaki oturumlarda fark, pistte çizgiden geçiş aralığıdır." },
    { key: "trendLaps", label: "Eğilim için tur sayısı", type: "number", default: 3, min: 1, max: 10, step: 1, ui: "stepper", hint: "Yaklaşma / uzaklaşma hızı (sn/tur) son bu kadar turun ortalamasıdır." },
    { key: "showAhead", label: "Öndeki aracı göster", type: "boolean", default: true },
    { key: "showBehind", label: "Arkadaki aracı göster", type: "boolean", default: true },
    { key: "showTrend", label: "Eğilim oku ve sn/tur", type: "boolean", default: true },
    { key: "showCatch", label: "Yakalama tahmini (tur)", type: "boolean", default: true, hint: "Fark kapanıyorsa bu hızla kaç turda sıfırlanacağını gösterir." },
    { key: "showPits", label: "Pit işaretleri", type: "boolean", default: true, showIf: { key: "design", is: CHARTS }, hint: "Rakibin pit girişi kendi renginde, senin pit girişin beyaz kesikli çizgiyle işaretlenir." },
    { key: "showNames", label: "Sürücü adları", type: "boolean", default: true },
    { key: "raceOnly", label: "Sadece yarış oturumunda göster", type: "boolean", default: false },

    { key: "colAhead", label: "Öndeki araç rengi", type: "color", default: "#4aa8ff", group: "Renkler" },
    { key: "colBehind", label: "Arkadaki araç rengi", type: "color", default: "#ff8a2a", group: "Renkler" },

    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 13, min: 10, max: 24, step: 1, unit: "px", group: "Görünüm" },
    { key: "width", label: "Genişlik", type: "number", default: 340, min: 220, max: 800, step: 10, unit: "px", group: "Görünüm" },
    { key: "chartHeight", label: "Grafik yüksekliği", type: "number", default: 70, min: 40, max: 240, step: 5, unit: "px", group: "Görünüm", showIf: { key: "design", is: CHARTS }, hint: "Birleşik grafik bu yüksekliğin iki katıdır." },
    { key: "lineWidth", label: "Çizgi kalınlığı", type: "number", default: 2, min: 1, max: 5, step: 0.5, unit: "px", group: "Görünüm", showIf: { key: "design", is: CHARTS } },
  ],
});
