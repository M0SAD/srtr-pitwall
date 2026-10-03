import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS } from "@/sdk/HeaderStats";

/** Karşılaştırma satırları */
export const H2H_ROWS = [
  { value: "pos", label: "Sıra" },
  { value: "last", label: "Son tur" },
  { value: "best", label: "En iyi tur" },
  { value: "pits", label: "Pit stop" },
  { value: "tyre", label: "Lastikteki tur" },
  { value: "irating", label: "iRating" },
];
export const H2H_DEFAULT_ROWS = ["pos", "last", "best", "pits", "tyre"];

export default defineOverlay({
  id: "h2h",
  name: "Kafa Kafaya",
  description:
    "İki sürücüyü yan yana karşılaştırır: sen ve seçtiğin rakip (öndeki, arkadaki, sınıf lideri ya da belirli bir araç). Adlar, bayraklar, sıralar, aradaki fark, son ve en iyi tur, pit stop sayısı, lastikteki tur; her satırda iyi olan değer vurgulanır.",
  category: "stream",
  topics: [
    { name: "standings", hz: 2 },
    { name: "relative", hz: 5 },
    { name: "status", hz: 1 },
  ],
  size: { w: 620, h: 200 },
  defaultPosition: { x: 650, y: 820 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "bar",
      options: [
        { value: "bar", label: "Geniş karşılaştırma bandı" },
        { value: "stack", label: "Üst üste kart" },
      ],
    },
    {
      key: "rival",
      label: "Rakip",
      type: "select",
      default: "posAhead",
      options: [
        { value: "posAhead", label: "Sıralamada bir önümdeki" },
        { value: "posBehind", label: "Sıralamada bir arkamdaki" },
        { value: "trackAhead", label: "Pistte önümdeki araç" },
        { value: "trackBehind", label: "Pistte arkamdaki araç" },
        { value: "leader", label: "Sınıf lideri" },
        { value: "number", label: "Belirli araç numarası" },
      ],
      hint: "Sıralamadaki rakipler kendi sınıfından seçilir. Lider sensen ikinci sıradaki sürücü gösterilir.",
    },
    { key: "carNumber", label: "Araç numarası", type: "text", default: "", placeholder: "44", showIf: { key: "rival", is: ["number"] } },
    { key: "rows", label: "Karşılaştırılacak bilgiler", type: "multi", default: H2H_DEFAULT_ROWS, options: H2H_ROWS },
    { key: "showFlags", label: "Ülke bayrakları", type: "boolean", default: true },
    { key: "showGap", label: "Aradaki farkı göster", type: "boolean", default: true },
    { key: "nameFormat", label: "Ad biçimi", type: "select", default: "full", options: NAME_FORMATS },
    { key: "raceOnly", label: "Sadece yarış oturumunda göster", type: "boolean", default: false },
    { key: "maxGap", label: "Fark bundan büyükse gizle (0: hep göster)", type: "number", default: 0, min: 0, max: 60, step: 1, unit: "sn", hint: "Yalnızca yarışta ve fark saniye olarak bilindiğinde uygulanır." },
    { key: "winColor", label: "İyi değer rengi", type: "color", default: "#33d17a", group: "Görünüm" },
    { key: "width", label: "Genişlik", type: "number", default: 620, min: 260, max: 1100, step: 10, unit: "px", group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 15, min: 10, max: 30, step: 1, unit: "px", group: "Görünüm" },
  ],
});
