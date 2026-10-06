import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS, headerField } from "@/sdk/HeaderStats";
import { labelStyleField } from "@/sdk/WxIcon";

export const STANDINGS_COLUMNS = [
  { value: "flair", label: "Ülke" },
  { value: "car", label: "Araç markası" },
  { value: "name", label: "Sürücü" },
  { value: "change", label: "Kazanılan/kaybedilen sıra" },
  { value: "license", label: "Lisans / SR" },
  { value: "irating", label: "iRating" },
  { value: "irDelta", label: "Tahmini iRating değişimi (yarış)" },
  { value: "pits", label: "Pit sayısı" },
  { value: "gap", label: "Fark" },
  { value: "avg", label: "Son 5 tur ortalaması" },
  { value: "last", label: "Son tur" },
  { value: "best", label: "En iyi tur" },
  { value: "tire", label: "Lastik" },
];

export const STANDINGS_DEFAULT_COLUMNS = [
  { key: "flair", on: true },
  { key: "name", on: true },
  { key: "car", on: true },
  { key: "change", on: false },
  { key: "license", on: true },
  { key: "irating", on: true },
  { key: "irDelta", on: true },
  { key: "pits", on: false },
  { key: "gap", on: true },
  { key: "avg", on: false },
  { key: "last", on: false },
  { key: "best", on: true },
  { key: "tire", on: true },
];

/** Sütun genişliği ayarında varsayılandan ilk değişiklikte başlanan yaklaşık değerler (px) */
export const STANDINGS_COL_START: Record<string, number> = {
  flair: 26, car: 44, name: 130, change: 30, license: 52, irating: 46, irDelta: 34, pits: 24, gap: 50, avg: 62, last: 62, best: 62, tire: 22,
};

export default defineOverlay({
  id: "standings",
  name: "Sıralama Tablosu",
  description:
    "Çok sınıflı sıralama: sınıf başlıkları ve SOF, ülke, araç, iRating ve tahmini değişimi, fark/aralık, 5 tur ortalaması, en iyi tur, pit durumu. Sütunlar sıralanabilir.",
  category: "race",
  topics: [
    { name: "standings", hz: 3 },
    { name: "session", hz: 1 },
    { name: "weather", hz: 0.5 },
  ],
  size: { w: 560, h: 440 },
  defaultPosition: { x: 40, y: 60 },
  defaultEnabled: true,
  // Alt / üst kenardan sürükleme satır sayısını değiştirir (her sınıf bölümü bir satır büyür)
  resize: { h: { key: (o) => ((o.drivers ?? "all") === "smart" ? "topOwn" : "maxRows"), row: ".st-row", per: (root) => Number(root.querySelector<HTMLElement>(".st")?.dataset.per) || 1 } },
  settings: [
    {
      key: "drivers",
      label: "Gösterilen sürücüler",
      type: "select",
      default: "smart",
      options: [
        { value: "smart", label: "Liderler + etrafımdakiler" },
        { value: "all", label: "Hepsi (sınıf başına sınırlı)" },
      ],
      group: "Sürücüler",
    },
    { key: "maxRows", label: "Sınıf başına en fazla satır", type: "number", default: 8, min: 3, max: 60, step: 1, ui: "stepper", group: "Sürücüler", showIf: { key: "drivers", is: ["all"] }, hint: "Düzenleme modunda pencerenin alt / üst kenarından sürükleyerek de ayarlanır.", },
    { key: "topOwn", label: "Sınıfımın ilk", type: "number", default: 8, min: 0, max: 20, step: 1, ui: "stepper", unit: "araç", group: "Sürücüler", showIf: { key: "drivers", is: ["smart"] }, hint: "Düzenleme modunda pencerenin alt / üst kenarından sürükleyerek de ayarlanır.", },
    { key: "around", label: "Önümde/arkamda", type: "number", default: 2, min: 0, max: 10, step: 1, ui: "stepper", unit: "araç", group: "Sürücüler", showIf: { key: "drivers", is: ["smart"] } },
    { key: "topOther", label: "Diğer sınıfların ilk", type: "number", default: 3, min: 0, max: 20, step: 1, ui: "stepper", unit: "araç", group: "Sürücüler", showIf: { key: "drivers", is: ["smart"] } },
    { key: "nameFormat", label: "Ad biçimi", type: "select", default: "full", options: NAME_FORMATS, group: "Sürücüler" },
    {
      key: "columns",
      label: "Sütunlar",
      type: "order",
      default: STANDINGS_DEFAULT_COLUMNS,
      options: STANDINGS_COLUMNS,
      widths: { key: "colWidths", start: STANDINGS_COL_START, min: 16, max: 400, step: 2 },
      group: "Sütunlar",
      hint: "Tahmini iRating değişimi: sınıfındaki sürücülerin iRating'lerinden ve o anki sıralamadan hesaplanır; sadece yarışta görünür, kesin sonuç değildir.",
    },
    {
      key: "gapMode",
      label: "Fark sütunu",
      type: "select",
      default: "gap",
      options: [
        { value: "gap", label: "Lidere fark" },
        { value: "interval", label: "Öndekine fark" },
      ],
      group: "Sütunlar",
    },
    { key: "decimals", label: "Fark ondalığı", type: "number", default: 1, min: 0, max: 3, step: 1, ui: "stepper", group: "Sütunlar" },
    {
      key: "carStyle",
      label: "Marka gösterimi",
      type: "select",
      default: "logo",
      options: [
        { value: "logo", label: "Logo" },
        { value: "both", label: "Logo ve yazı" },
        { value: "text", label: "Sadece yazı" },
      ],
      group: "Sütunlar",
    },
    { key: "hideSameCar", label: "Tüm araçlar aynıysa araç sütununu gizle", type: "boolean", default: true, group: "Sütunlar", hint: "Tek marka serilerde (ör. Porsche Cup) herkes aynı araçta olduğundan logo / araç adı gösterilmez; yer açılır." },
    { key: "logoSize", label: "Logo boyutu", type: "number", default: 150, min: 80, max: 220, step: 10, unit: "%", group: "Sütunlar", showIf: { key: "carStyle", not: ["text"] } },
    { key: "showHeader", label: "Başlık satırı", type: "boolean", default: true, group: "Başlık" },
    headerField("headerFields", "Başlık bilgileri", ["remaining", "sof", "incidents", "position", "brakeBias"]),
    labelStyleField("Başlık"),
    { key: "width", label: "Genişlik (en az)", type: "number", default: 560, min: 300, max: 1600, step: 10, unit: "px", hint: "Tablo en az bu genişlikte olur; ad sütunu boşluğu doldurur. Sütunlar sığmazsa tablo kendiliğinden genişler. Düzenleme modunda pencerenin sağ / sol kenarından sürükleyerek de ayarlanır." },
    { key: "barSize", label: "Bilgi satırı yazı boyutu", type: "number", default: 120, min: 80, max: 200, step: 5, unit: "%", group: "Başlık", hint: "Başlık bilgi satırındaki yazı ve simgelerin boyutu." },
    { key: "rowOpacity", label: "Satır arka planı", type: "number", default: 100, min: 0, max: 100, step: 5, unit: "%", group: "Görünüm" },
    { key: "rowsFrame", label: "Sürücü listesinin çevresinde çerçeve", type: "boolean", default: false, group: "Görünüm", hint: "Listede kaç sürücü varsa onları saran ince bir çerçeve çizer (çok sınıflıda her sınıf için ayrı)." },
    { key: "rowFrame", label: "Her sürücünün çevresinde çerçeve", type: "boolean", default: false, group: "Görünüm" },
    { key: "hz", label: "Güncelleme sıklığı", type: "number", default: 3, min: 1, max: 10, step: 1, unit: "Hz", group: "Görünüm" },
  ],
});
