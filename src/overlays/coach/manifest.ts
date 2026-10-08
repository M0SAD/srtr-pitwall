import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "coach",
  name: "Canlı Kıyas",
  description:
    "Sürerken gaz ve fren girdilerini topluluğun en iyi turuyla, topluluk ortalamasıyla ya da kendi rekorunla canlı karşılaştırır: önündeki virajda referansın nerede frenleyip nerede gaza bastığını, tur içi farkını ve hangi bölümde zaman kazanıp kaybettiğini gösterir.",
  category: "driving",
  topics: [
    { name: "coach", hz: 20 },
    { name: "status", hz: 1 },
  ],
  size: { w: 460, h: 190 },
  defaultPosition: { x: 730, y: 700 },
  defaultEnabled: false,
  settings: [
    {
      key: "reference",
      label: "Neyle kıyasla",
      type: "select",
      default: "best",
      options: [
        { value: "best", label: "Topluluğun en iyi turu" },
        { value: "avg", label: "Topluluk ortalaması (en hızlı turlar)" },
        { value: "mine", label: "Kendi rekorum" },
      ],
      hint: "Referans, Telemetri sayfasındaki sıralamadan bu pist ve araç için alınır. En iyi tur: izi paylaşılmış en hızlı tur. Ortalama: en hızlı 3-8 turun ortalaması; 3'ten az tur varsa \"Yeterli veri yok\" yazar. Kendi rekorum: hesabına kayıtlı en iyi turun.",
    },
    { key: "showGraph", label: "Gaz / fren grafiği", type: "boolean", default: true, group: "Bölümler", hint: "Soluk alanlar referansın, parlak çizgiler senin girdilerin. Dikey çizgi şu anki konumun; sağında önündeki pist var." },
    { key: "showBars", label: "Anlık gaz / fren çubukları", type: "boolean", default: true, group: "Bölümler", hint: "Senin ve referansın şu anki gaz ve freni yan yana." },
    { key: "showDelta", label: "Tur içi fark", type: "boolean", default: true, group: "Bölümler" },
    { key: "showSpeed", label: "Hız farkı", type: "boolean", default: true, group: "Bölümler", hint: "Bu noktada referansa göre kaç km/h hızlı ya da yavaşsın." },
    { key: "showSectors", label: "Bölüm kazanç / kayıpları", type: "boolean", default: true, group: "Bölümler", hint: "Tur üç eşit bölüme ayrılır; her bölümde referansa göre kazandığın ya da kaybettiğin süre." },
    { key: "showCue", label: "Kısa ipucu (FREN / GAZ)", type: "boolean", default: true, group: "Bölümler", hint: "Referans frendeyken sen değilsen ya da o gazdayken sen bekliyorsan kısa bir uyarı gösterir." },
    { key: "showLogo", label: "SRTR Pitwall logosu", type: "boolean", default: true, group: "Bölümler" },
    { key: "hidePits", label: "Pitte gizle", type: "boolean", default: true },
    { key: "colThr", label: "Gaz rengi", type: "color", default: "#35d07f", group: "Renkler" },
    { key: "colBrk", label: "Fren rengi", type: "color", default: "#ff4d4f", group: "Renkler" },
    { key: "colGain", label: "Kazanç rengi", type: "color", default: "#35d07f", group: "Renkler" },
    { key: "colLoss", label: "Kayıp rengi", type: "color", default: "#ff4d4f", group: "Renkler" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm" },
    { key: "width", label: "Genişlik", type: "number", default: 460, min: 280, max: 1000, step: 10, unit: "px", group: "Görünüm" },
    { key: "graphH", label: "Grafik yüksekliği", type: "number", default: 90, min: 50, max: 260, step: 5, unit: "px", group: "Görünüm" },
  ],
});
