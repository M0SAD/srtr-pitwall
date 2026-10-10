import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "damage",
  name: "Hasar Göstergesi",
  description:
    "Aracın üstten şeması: hasarlı bölgeler şiddetine göre renklenir, tahmini tamir süresi (zorunlu + isteğe bağlı) ve motor uyarıları yanında durur. Hasar yokken kendini gizleyebilir.",
  category: "driving",
  // Tekrar ekranında çalışmaz (sürüş verisi yalnızca kendin sürerken gelir)
  replay: false,
  topics: [{ name: "damage", hz: 5 }],
  size: { w: 230, h: 190 },
  defaultPosition: { x: 40, y: 420 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "car",
      options: [
        { value: "car", label: "Araç şeması" },
        { value: "compact", label: "Kompakt şerit" },
      ],
      hint: "Araç şeması: üstten görünüm ve yanında ayrıntılar. Kompakt şerit: küçük şema, genel hasar ve tamir süresi tek satırda.",
    },
    { key: "hideNone", label: "Hasar yokken gizle", type: "boolean", default: true, hint: "Araç sağlamken gösterge ekranda yer kaplamaz. Düzenleme modunda yine görünür." },
    { key: "showRepair", label: "Tamir süresi", type: "boolean", default: true, hint: "iRacing zorunlu ve isteğe bağlı tamir süresini kendisi verir. ACC'de süre hasardan tahmin edilir. LMU / rF2, AMS2 ve AC tamir süresi vermez." },
    { key: "showParts", label: "Parça ayrıntıları (motor, aero, süspansiyon)", type: "boolean", default: true, showIf: { key: "design", is: ["car"] } },
    { key: "showWarnings", label: "Motor uyarıları", type: "boolean", default: true, hint: "Su / yağ sıcaklığı, yağ ve yakıt basıncı, aşırı ısınma, kopan parça." },
    { key: "showNote", label: "Veri kaynağı notu", type: "boolean", default: true, showIf: { key: "design", is: ["car"] }, hint: "Sim bölge bazlı hasar vermiyorsa bunu küçük bir notla belirtir." },
    { key: "minSev", label: "En düşük gösterilecek hasar", type: "number", default: 3, min: 0, max: 30, step: 1, unit: "%", hint: "Bunun altındaki hasar yok sayılır (göstergenin sürekli açık kalmaması için)." },
    { key: "colLight", label: "Hafif hasar rengi", type: "color", default: "#ffcc33", group: "Renkler" },
    { key: "colMedium", label: "Orta hasar rengi", type: "color", default: "#ff8a2a", group: "Renkler" },
    { key: "colHeavy", label: "Ağır hasar rengi", type: "color", default: "#ff4d4f", group: "Renkler" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm", hint: "Bütün gösterge yazı boyutuyla birlikte büyür ve küçülür." },
  ],
});
