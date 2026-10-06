import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS } from "@/sdk/HeaderStats";

/** Satırda gösterilebilen alanlar (sıra sabit; ayarda sadece açılıp kapatılır) */
export const DUEL_FIELDS = [
  { value: "class", label: "Sınıf rengi" },
  { value: "pos", label: "Sınıf sırası" },
  { value: "flair", label: "Ülke" },
  { value: "num", label: "Araç numarası" },
  { value: "name", label: "Sürücü" },
  { value: "car", label: "Araç markası (logo)" },
  { value: "license", label: "Lisans ve SR" },
  { value: "irating", label: "iRating" },
  { value: "tire", label: "Lastik" },
  { value: "pit", label: "PIT / OUT" },
  { value: "trend", label: "Yaklaşma oku" },
  { value: "gap", label: "Fark" },
];

export const DUEL_DEFAULT_FIELDS = ["class", "pos", "flair", "num", "name", "car", "license", "irating", "tire", "pit", "trend", "gap"];

export default defineOverlay({
  // defaultBgOpacity: 0.9 (coordinator) — bu overlay kendi "Arka plan opaklığı" ayarını (bgOpacity, %90) kullanıyor
  id: "duel",
  name: "Yakın Takip",
  description:
    "Önündeki ve arkandaki araçlara olan farkı makara gibi dönen bir şeritte gösterir: araç yaklaştıkça satırı büyür ve netleşir, uzaklaştıkça küçülüp silikleşir.",
  category: "race",
  topics: [
    { name: "relative", hz: 10 },
    { name: "session", hz: 1 },
    { name: "telemetry", hz: 5 },
  ],
  size: { w: 560, h: 300 },
  defaultPosition: { x: 620, y: 560 },
  settings: [
    { key: "ahead", label: "Öndeki araç sayısı", type: "number", default: 3, min: 1, max: 5, step: 1, ui: "stepper" },
    { key: "behind", label: "Arkadaki araç sayısı", type: "number", default: 3, min: 1, max: 5, step: 1, ui: "stepper" },
    {
      key: "gapUnit",
      label: "Fark birimi",
      type: "select",
      default: "s",
      options: [
        { value: "s", label: "Saniye" },
        { value: "m", label: "Metre (yaklaşık)" },
      ],
      hint: "Metre, saniye farkının o anki hızınla çarpılmasıyla tahmin edilir; çok yavaşken güvenilir değildir.",
    },
    {
      key: "thresholdMode",
      label: "Mesafe eşiği türü",
      type: "select",
      default: "s",
      options: [
        { value: "s", label: "Süre (saniye)" },
        { value: "m", label: "Mesafe (metre)" },
        { value: "off", label: "Sınırsız" },
      ],
      hint: "Sınırsız: eşik yoktur, overlay her zaman görünür ve en yakın araçlar hep listelenir. Yarışta tur farkı olan araçlar +1 / +2 (seni turlayan) ve −1 / −2 (turladığın) olarak işaretlenir.",
    },
    { key: "threshold", label: "Mesafe eşiği (saniye)", type: "number", default: 2, min: 0.5, max: 10, step: 0.1, unit: "sn", showIf: { key: "thresholdMode", is: ["s"] }, hint: "Araç bu farkın içine girdikçe satırı büyür ve netleşir." },
    { key: "thresholdM", label: "Mesafe eşiği (metre)", type: "number", default: 100, min: 20, max: 500, step: 5, unit: "m", showIf: { key: "thresholdMode", is: ["m"] }, hint: "Araç bu farkın içine girdikçe satırı büyür ve netleşir." },
    { key: "splitThreshold", label: "Ön ve arka için ayrı eşik", type: "boolean", default: false, showIf: { key: "thresholdMode", not: ["off"] } },
    { key: "thresholdBack", label: "Arka eşik (saniye)", type: "number", default: 2, min: 0.5, max: 10, step: 0.1, unit: "sn", showIf: { key: "splitThreshold", is: [true] }, hint: "Eşik türü süre iken kullanılır." },
    { key: "thresholdBackM", label: "Arka eşik (metre)", type: "number", default: 100, min: 20, max: 500, step: 5, unit: "m", showIf: { key: "splitThreshold", is: [true] }, hint: "Eşik türü mesafe iken kullanılır." },
    { key: "hideOutside", label: "Eşik dışındakileri gizle", type: "boolean", default: false, showIf: { key: "thresholdMode", not: ["off"] } },
    { key: "hideWhenAlone", label: "Eşik içinde kimse yokken gizle", type: "boolean", default: false, showIf: { key: "thresholdMode", not: ["off"] } },
    { key: "sameClass", label: "Sadece kendi sınıfım", type: "boolean", default: false },
    { key: "raceOnly", label: "Sadece yarış oturumunda göster", type: "boolean", default: false },
    { key: "showMe", label: "Kendi satırımı göster", type: "boolean", default: false },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 10, min: 2, max: 30, step: 1, unit: "Hz" },

    { key: "fields", label: "Gösterilecek bilgiler", type: "multi", default: DUEL_DEFAULT_FIELDS, options: DUEL_FIELDS, group: "Satır içeriği" },
    { key: "nameFormat", label: "Ad biçimi", type: "select", default: "full", options: NAME_FORMATS, group: "Satır içeriği" },
    { key: "hideSameCar", label: "Tüm araçlar aynıysa araç sütununu gizle", type: "boolean", default: true, group: "Satır içeriği", hint: "Tek marka serilerde (ör. Porsche Cup) herkes aynı araçta olduğundan logo / araç adı gösterilmez; yer açılır." },
    { key: "logoSize", label: "Logo boyutu", type: "number", default: 130, min: 80, max: 220, step: 10, unit: "%", group: "Satır içeriği" },
    { key: "lapTint", label: "Tur farkı rengi (tur önde mavi, tur geride kırmızı)", type: "boolean", default: true, group: "Satır içeriği" },

    { key: "reel", label: "Makara etkisi gücü", type: "number", default: 60, min: 0, max: 100, step: 5, unit: "%", group: "Görünüm", hint: "0: düz liste. Yükseldikçe uzak satırlar daha çok eğilir, küçülür ve silikleşir." },
    { key: "blur", label: "Bulanıklık", type: "boolean", default: false, group: "Görünüm", hint: "Uzak satırları bulanıklaştırır. Ekran kartını biraz yorar; takılma olursa kapat." },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 15, min: 10, max: 28, step: 1, unit: "px", group: "Görünüm" },
    { key: "rowHeight", label: "Satır yüksekliği", type: "number", default: 36, min: 22, max: 64, step: 1, unit: "px", group: "Görünüm" },
    { key: "width", label: "Genişlik", type: "number", default: 560, min: 220, max: 700, step: 10, unit: "px", group: "Görünüm" },
    { key: "nearColor", label: "Yakın araç vurgu rengi", type: "color", default: "#ff8a2a", group: "Görünüm" },
    { key: "rowsFrame", label: "Sürücü listesinin çevresinde çerçeve", type: "boolean", default: false, group: "Görünüm" },
    { key: "rowFrame", label: "Her sürücünün çevresinde çerçeve", type: "boolean", default: true, group: "Görünüm" },
    { key: "bgOpacity", label: "Arka plan opaklığı", type: "number", default: 90, min: 0, max: 100, step: 5, unit: "%", group: "Görünüm" },
  ],
});
