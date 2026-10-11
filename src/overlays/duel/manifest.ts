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
    {
      key: "farHide",
      label: "Araçlar uzaktayken gizle",
      type: "boolean",
      default: false,
      hint: "Önde ve arkada belirtilen süreden yakın hiç araç yoksa overlay ekrandan kalkar; biri yaklaşınca geri gelir.",
    },
    { key: "farLimit", label: "Uzaklık sınırı", type: "number", default: 30, min: 2, max: 120, step: 1, unit: "sn", showIf: { key: "farHide", is: [true] } },
    { key: "farFade", label: "Uzaktaki araçlar şeffaflaşsın", type: "boolean", default: true, hint: "Araç uzaklaştıkça satırı silikleşir (30 sn'de en silik hâline gelir; \"Araçlar uzaktayken gizle\" açıksa onun sınırında)." },
    { key: "centerLine", label: "Ortadaki çizgiyi hep göster", type: "boolean", default: true, hint: "Kapalıyken çizgi yalnızca gösterilecek bir araç varken çizilir. \"Kendi satırımı göster\" açıkken çizgi yerine kendi satırın görünür." },
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
    { key: "rowsFrame", label: "Sürücü listesinin çevresinde çerçeve", type: "boolean", default: false, group: "Görünüm" },
    { key: "rowFrame", label: "Her sürücünün çevresinde çerçeve", type: "boolean", default: true, group: "Görünüm" },
    { key: "bgOpacity", label: "Arka plan opaklığı", type: "number", default: 90, min: 0, max: 100, step: 5, unit: "%", group: "Görünüm" },

    { key: "nearColor", label: "Yakın araç vurgu rengi", type: "color", default: "#ff8a2a", group: "Renkler", hint: "Araç eşik içine girdikçe satırı bu renkle dolar ve çerçevelenir." },
    { key: "customColors", label: "Özel renkler", type: "boolean", default: false, group: "Renkler", hint: "Kapalıyken satırlar temanın (ya da bu overlay'in Görünüm ayarının) renklerini kullanır." },
    { key: "rowBg", label: "Satır arka planı", type: "color", default: "#0c0e13", group: "Renkler", showIf: { key: "customColors", is: [true] }, hint: "Saydamlığı Görünüm > Arka plan opaklığı ile ayarlanır." },
    { key: "textColor", label: "Yazı rengi", type: "color", default: "#f2f4f8", group: "Renkler", showIf: { key: "customColors", is: [true] } },
    { key: "dimColor", label: "İkincil yazı rengi", type: "color", default: "#9aa3b2", group: "Renkler", showIf: { key: "customColors", is: [true] }, hint: "Araç numarası, ülke ve yaklaşma oku (durağanken)." },
    { key: "borderColor", label: "Satır çerçevesi rengi", type: "color", default: "#2a2f3a", group: "Renkler", showIf: { key: "customColors", is: [true] } },
    { key: "meColor", label: "Kendi satırım / orta çizgi rengi", type: "color", default: "#ffd23f", group: "Renkler", showIf: { key: "customColors", is: [true] } },
    { key: "closingColor", label: "Yaklaşıyor rengi", type: "color", default: "#3ddc84", group: "Renkler", showIf: { key: "customColors", is: [true] }, hint: "Yaklaşma okunun rengi: fark kapanıyor." },
    { key: "awayColor", label: "Uzaklaşıyor rengi", type: "color", default: "#ff4d4d", group: "Renkler", showIf: { key: "customColors", is: [true] }, hint: "Yaklaşma okunun rengi: fark açılıyor." },
    { key: "lapAheadColor", label: "Tur önde rengi", type: "color", default: "#4da3ff", group: "Renkler", showIf: { key: "customColors", is: [true] }, hint: "Seni turlayan aracın adı, farkı ve +1 etiketi." },
    { key: "lapBehindColor", label: "Tur geride rengi", type: "color", default: "#ff4d4d", group: "Renkler", showIf: { key: "customColors", is: [true] }, hint: "Turladığın aracın adı, farkı ve −1 etiketi." },
  ],
});
