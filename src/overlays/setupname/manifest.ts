import { defineOverlay } from "@/sdk/overlay";

const G_COL = "Renkler";

export default defineOverlay({
  id: "setupname",
  name: "Setup Adı",
  description:
    "Araçta yüklü setup dosyasının adını gösterir; garajda değiştirilip kaydedilmediyse işaretler. İsteğe bağlı olarak yarış başladıktan sonra kendiliğinden gizlenir. Üç tasarım.",
  category: "info",
  topics: [{ name: "session", hz: 1 }],
  size: { w: 300, h: 60 },
  defaultPosition: { x: 40, y: 980 },
  defaultEnabled: false,
  multiInstance: true,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "card",
      options: [
        { value: "card", label: "Kart (başlık + ad)" },
        { value: "pill", label: "Tek satır etiket" },
        { value: "minimal", label: "Yalnızca yazı" },
      ],
    },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 16, min: 10, max: 40, step: 1, unit: "px" },
    { key: "maxWidth", label: "En fazla genişlik", type: "number", default: 320, min: 120, max: 900, step: 10, unit: "px", hint: "Kutu adın boyu kadardır, bu genişliği geçmez. Daha uzun adın yazısı küçülerek kutuya sığar; çok uzunsa iki satıra iner, ad hiç kesilmez." },
    { key: "showLabel", label: "Başlığı göster", type: "boolean", default: true },
    { key: "label", label: "Başlık", type: "text", default: "SETUP", showIf: { key: "showLabel", is: [true] } },
    { key: "showFolder", label: "Klasör adını göster", type: "boolean", default: false, hint: "Setup bir alt klasördeyse (ör. \"garage61\\yaris.sto\") klasörü de yazar." },
    { key: "showExt", label: ".sto uzantısını göster", type: "boolean", default: false },
    { key: "showModified", label: "Değiştirildiyse işaretle", type: "boolean", default: true, hint: "Setup garajda değiştirilip henüz kaydedilmediyse adın yanında \"değiştirildi\" yazar." },
    { key: "showType", label: "Kaynağını göster (iRacing / kendi setup'ım)", type: "boolean", default: false },
    {
      key: "hideAfterStart",
      label: "Yarış başladıktan sonra gizle",
      type: "boolean",
      default: false,
      hint: "Yarışın yeşil bayrağından belirtilen süre sonra ekrandan kalkar; antrenman ve sıralamada, ve yarış başlamadan önce görünür.",
    },
    { key: "hideDelay", label: "Gizleme süresi", type: "number", default: 30, min: 0, max: 600, step: 5, unit: "sn", showIf: { key: "hideAfterStart", is: [true] } },

    { key: "customColors", label: "Özel renkler", type: "boolean", default: false, group: G_COL, hint: "Kapalıyken temanın (ya da bu overlay'in Görünüm ayarının) renkleri kullanılır." },
    { key: "textColor", label: "Ad rengi", type: "color", default: "#f2f4f8", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "labelColor", label: "Başlık rengi", type: "color", default: "#9aa3b2", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "accentColor", label: "Vurgu rengi", type: "color", default: "#ff8a2a", group: G_COL, showIf: { key: "customColors", is: [true] }, hint: "Karttaki şerit ve etiketin başlık kısmı." },
    { key: "bg", label: "Arka plan rengi", type: "color", default: "#0c0e13", group: G_COL, showIf: { key: "customColors", is: [true] } },
    { key: "bgAlpha", label: "Arka plan opaklığı", type: "number", default: 86, min: 0, max: 100, step: 5, unit: "%", group: G_COL, showIf: { key: "customColors", is: [true] } },
  ],
});
