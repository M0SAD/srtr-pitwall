import { defineOverlay } from "@/sdk/overlay";

const G_COL = "Renkler";

export default defineOverlay({
  id: "ffb",
  name: "FFB Gücü",
  description:
    "Direksiyonun güç geri bildirimi (FFB) ayarını Nm olarak gösterir: kaç FFB'de sürdüğünü görürsün. İsteğe bağlı anlık tork çubuğu ve sınıra dayanma (clipping) uyarısı. Dört tasarım.",
  category: "driving",
  // Tekrar ekranında çalışmaz (FFB verisi yalnızca kendin sürerken gelir)
  replay: false,
  topics: [{ name: "inputs", hz: 30 }],
  size: { w: 200, h: 90 },
  defaultPosition: { x: 1560, y: 900 },
  defaultEnabled: false,
  multiInstance: true,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "card",
      options: [
        { value: "card", label: "Kart (değer + tork çubuğu)" },
        { value: "bar", label: "Yatay çubuk" },
        { value: "gauge", label: "Gösterge (yarım daire)" },
        { value: "minimal", label: "Yalnızca yazı" },
      ],
    },
    {
      key: "valueMode",
      label: "Gösterilecek değer",
      type: "select",
      default: "both",
      options: [
        { value: "both", label: "FFB gücü ve Nm (ör. 5.5 (61.4 Nm))" },
        { value: "strength", label: "Yalnızca FFB gücü (ör. 5.5)" },
        { value: "nm", label: "Yalnızca Nm (ör. 61.4 Nm)" },
      ],
      hint: "iRacing'in Quick Settings ekranındaki gibi: FFB gücü sayısı ve parantez içinde Max Force (Nm). Güç sayısı direksiyon gücü (Wheel Force) bilinmiyorsa yalnızca Nm yazar.",
    },
    { key: "size", label: "Boyut", type: "number", default: 100, min: 50, max: 300, step: 5, unit: "%" },
    { key: "showLabel", label: "\"FFB\" başlığını göster", type: "boolean", default: true },
    { key: "decimals", label: "Ondalık basamak", type: "number", default: 1, min: 0, max: 1, step: 1, ui: "stepper" },
    {
      key: "showTorque",
      label: "Anlık torku göster",
      type: "boolean",
      default: true,
      hint: "Direksiyon şaftındaki anlık torkun, FFB gücüne oranı. Çubuk sona dayanıyorsa güç geri bildirimi sınırda (clipping) demektir.",
    },
    { key: "clipWarn", label: "Sınıra dayanınca (clipping) uyar", type: "boolean", default: true, hint: "Tork sınıra dayandığında değer ve çubuk kırmızı yanar." },
    {
      key: "clipStat",
      label: "Son 30 sn'de sınırda kalma oranını göster",
      type: "boolean",
      default: false,
      hint: "Yüksekse FFB gücünü (Max Force) artırmayı düşünebilirsin; sınırda kalan anlarda direksiyon ayrıntı vermez.",
    },
    { key: "showPeak", label: "Direksiyon gücünü göster (Wheel Force)", type: "boolean", default: false, hint: "iRacing ayarlarında direksiyonun için girilen en yüksek tork (Nm)." },

    { key: "customColors", label: "Özel renkler", type: "boolean", default: false, group: G_COL, hint: "Kapalıyken temanın (ya da bu overlay'in Görünüm ayarının) renkleri kullanılır." },
    { key: "textColor", label: "Yazı rengi", type: "color", default: "#f2f4f8", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "barColor", label: "Tork çubuğu rengi", type: "color", default: "#ff8a2a", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "clipColor", label: "Sınırda (clipping) rengi", type: "color", default: "#ff4d4d", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bg", label: "Arka plan rengi", type: "color", default: "#0c0e13", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bgAlpha", label: "Arka plan opaklığı", type: "number", default: 86, min: 0, max: 100, step: 5, unit: "%", group: G_COL, showIf: { key: "customColors", is: [true] } },
  ],
});
