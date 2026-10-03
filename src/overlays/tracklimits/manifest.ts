import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "tracklimits",
  name: "Pist Limiti",
  description:
    "Süren tur hâlâ geçerli mi, oturumda kaç kez pist dışına çıktın, kaç turun geçersiz sayıldı ve (iRacing'de) olay puanın sınıra ne kadar yakın. Pist dışına çıkınca ya da tur iptal olunca yanıp söner.",
  category: "driving",
  topics: [{ name: "tracklimits", hz: 15 }],
  size: { w: 250, h: 84 },
  defaultPosition: { x: 835, y: 120 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "badge",
      options: [
        { value: "badge", label: "Rozet" },
        { value: "strip", label: "Şerit", pro: true },
      ],
      hint: "Rozet: büyük durum yazısı ve altında sayaçlar. Şerit: tek satırlık ince görünüm.",
      proHint: "Şerit tasarımı PRO üyelere özel.",
    },
    { key: "showOffs", label: "Pist dışı sayısı", type: "boolean", default: true },
    { key: "showInvalid", label: "Geçersiz tur sayısı", type: "boolean", default: true, hint: "Bu oturumda geçersiz sayılan turların sayısı (süren tur dahil)." },
    { key: "showIncidents", label: "Olay puanı (x / sınır)", type: "boolean", default: true, hint: "Sadece iRacing olay puanı ve sınırını verir; diğer simlerde bu alan görünmez." },
    { key: "showPenalty", label: "Bekleyen cezayı göster", type: "boolean", default: true },
    { key: "showTyres", label: "Pist dışındaki teker sayısı", type: "boolean", default: false, hint: "Sim veriyorsa (ACC, AC, LMU / rF2, AMS2) kaç tekerin pist dışında olduğunu gösterir." },
    { key: "flash", label: "Olayda yanıp sön", type: "boolean", default: true, group: "Uyarı", hint: "Pist dışına çıkınca ya da tur geçersiz sayılınca gösterge kısa süre yanıp söner." },
    { key: "flashSecs", label: "Uyarı süresi", type: "number", default: 3, min: 1, max: 10, step: 0.5, unit: "sn", group: "Uyarı", showIf: { key: "flash", is: [true] } },
    { key: "warnAt", label: "Olay puanı uyarı eşiği", type: "number", default: 75, min: 0, max: 100, step: 5, unit: "%", group: "Uyarı", hint: "Olay puanı sınırın bu oranına ulaşınca sayaç renk değiştirir. 0: kapalı." },
    { key: "hideValid", label: "Tur geçerliyken gizle", type: "boolean", default: false, group: "Görünüm", hint: "Açıkken gösterge sadece tur geçersiz olduğunda ya da uyarı sırasında görünür." },
    { key: "hidePits", label: "Pitte gizle", type: "boolean", default: false, group: "Görünüm" },
    { key: "colValid", label: "Geçerli rengi", type: "color", default: "#33d17a", group: "Renkler" },
    { key: "colInvalid", label: "Geçersiz rengi", type: "color", default: "#ff4d4f", group: "Renkler" },
    { key: "colWarn", label: "Uyarı rengi", type: "color", default: "#ffcc33", group: "Renkler" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 30, step: 1, unit: "px", group: "Görünüm", hint: "Bütün gösterge yazı boyutuyla birlikte büyür ve küçülür." },
  ],
});
