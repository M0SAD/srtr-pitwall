import { defineOverlay } from "@/sdk/overlay";

const BAR_LIKE = ["bar", "panel"];

export default defineOverlay({
  id: "ers",
  name: "ERS ve Batarya",
  description:
    "Hibrit araçlarda batarya doluluğu, bu turdaki net kazanç / kayıp, MGU gücü, harcama modu ve P2P / DRS durumu. Beş farklı görünüm.",
  category: "driving",
  // Tekrar ekranında çalışmaz (sürüş verisi yalnızca kendin sürerken gelir)
  replay: false,
  topics: [{ name: "ers", hz: 20 }],
  size: { w: 300, h: 96 },
  defaultPosition: { x: 760, y: 780 },
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "bar",
      options: [
        { value: "bar", label: "Yatay çubuk" },
        { value: "cell", label: "Dikey pil" },
        { value: "chip", label: "Kompakt" },
        { value: "ring", label: "Halka gösterge", pro: true },
        { value: "panel", label: "Detaylı panel", pro: true },
      ],
      hint: "Göstergenin genel görünümü. Renkler, uyarılar ve gösterilecek bilgiler bütün tasarımlarda geçerlidir.",
      proHint: "Halka gösterge ve detaylı panel tasarımları PRO üyelere özel.",
    },
    { key: "showPct", label: "Batarya yüzdesi", type: "boolean", default: true },
    { key: "showMj", label: "Enerjiyi MJ olarak göster", type: "boolean", default: false, hint: "Sim bataryadaki enerjiyi veriyorsa gösterilir." },
    { key: "showDelta", label: "Bu turdaki net fark (+/- %)", type: "boolean", default: true, hint: "Tur başındaki doluluğa göre bu turda kazandığın ya da harcadığın miktar." },
    { key: "showMarker", label: "Tur başı işareti", type: "boolean", default: true, hint: "Bataryanın tur başındaki seviyesini ince bir çizgiyle gösterir." },
    { key: "showDeploy", label: "Tur başına kalan harcama hakkı", type: "boolean", default: true, hint: "Turda harcanabilecek enerjisi sınırlı araçlarda kalan hakkı ince bir çubukla gösterir." },
    { key: "showPower", label: "MGU gücü (kW)", type: "boolean", default: true },
    { key: "showMode", label: "Harcama modu", type: "boolean", default: true },
    { key: "showP2pDrs", label: "P2P ve DRS", type: "boolean", default: true },
    { key: "hideNoHybrid", label: "Hibrit yoksa gizle", type: "boolean", default: true, hint: "Araçta hibrit sistem yoksa gösterge ekranda yer kaplamaz. Düzenleme modunda yine görünür." },
    { key: "hidePits", label: "Pitte gizle", type: "boolean", default: false },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 20, min: 5, max: 60, step: 5, unit: "Hz" },

    { key: "lowWarn", label: "Düşük batarya uyarısı", type: "number", default: 15, min: 0, max: 50, step: 1, unit: "%", group: "Uyarılar", hint: "Batarya bu seviyenin altına inince gösterge kırmızıya döner ve yanıp söner. 0: kapalı." },
    { key: "fullWarn", label: "Dolu batarya uyarısı", type: "boolean", default: true, group: "Uyarılar", hint: "Batarya dolunca geri kazanılan enerji boşa gider; harcamayı hatırlatır." },
    { key: "fullAt", label: "Dolu sayılma eşiği", type: "number", default: 98, min: 80, max: 100, step: 1, unit: "%", group: "Uyarılar", showIf: { key: "fullWarn", is: [true] } },
    { key: "sparkLaps", label: "Grafik ve ortalama için tur sayısı", type: "number", default: 8, min: 3, max: 20, step: 1, ui: "stepper", group: "Uyarılar", hint: "Tur ortalaması, kalan tur tahmini ve detaylı paneldeki grafik son bu kadar tura bakar." },

    { key: "colHigh", label: "Yüksek seviye rengi", type: "color", default: "#33d17a", group: "Renkler" },
    { key: "colMid", label: "Orta seviye rengi", type: "color", default: "#ffcc33", group: "Renkler" },
    { key: "colLow", label: "Düşük seviye rengi", type: "color", default: "#ff4d4f", group: "Renkler" },
    { key: "colDeploy", label: "Harcama rengi", type: "color", default: "#ff8a2a", group: "Renkler" },
    { key: "colRegen", label: "Geri kazanım rengi", type: "color", default: "#4aa8ff", group: "Renkler" },

    { key: "smooth", label: "Yumuşatma", type: "number", default: 40, min: 0, max: 90, step: 10, unit: "%", group: "Görünüm", hint: "Batarya ve güç değerlerindeki ani sıçramaları yumuşatır." },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm", hint: "Bütün gösterge yazı boyutuyla birlikte büyür ve küçülür." },
    { key: "width", label: "Genişlik", type: "number", default: 300, min: 200, max: 600, step: 10, unit: "px", group: "Görünüm", showIf: { key: "design", is: BAR_LIKE } },
  ],
});
