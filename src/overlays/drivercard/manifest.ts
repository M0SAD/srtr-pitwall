import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS } from "@/sdk/HeaderStats";

/** Kartta gösterilebilen bilgiler */
export const CARD_FIELDS = [
  { value: "flag", label: "Ülke bayrağı" },
  { value: "number", label: "Araç numarası" },
  { value: "pos", label: "Sıra" },
  { value: "car", label: "Araç" },
  { value: "class", label: "Sınıf" },
  { value: "team", label: "Takım adı" },
  { value: "irating", label: "iRating" },
  { value: "license", label: "Lisans ve SR" },
];
export const CARD_DEFAULT_FIELDS = ["flag", "number", "pos", "car", "class", "team", "irating", "license"];

export default defineOverlay({
  id: "drivercard",
  name: "Sürücü Kartı",
  description:
    "Yayın için alt bant (lower third): adın, ülke bayrağın, araç numaran, aracın ve sınıfın, takım adın, iRating ve lisansın, o anki sıran. İstersen ikinci satırda kendi yazın (ör. sosyal medya adın).",
  category: "stream",
  topics: [
    { name: "standings", hz: 1 },
    { name: "session", hz: 1 },
    { name: "status", hz: 1 },
  ],
  size: { w: 520, h: 96 },
  defaultPosition: { x: 60, y: 900 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "bar",
      options: [
        { value: "bar", label: "Klasik alt bant" },
        { value: "tag", label: "Küçük etiket" },
        { value: "angled", label: "Eğik sport", pro: true },
      ],
    },
    {
      key: "mode",
      label: "Ne zaman görünsün",
      type: "select",
      default: "always",
      options: [
        { value: "always", label: "Her zaman" },
        { value: "interval", label: "Belirli aralıklarla" },
        { value: "garage", label: "Sadece garajda ya da gridde" },
      ],
    },
    { key: "showSecs", label: "Ekranda kalma süresi", type: "number", default: 12, min: 3, max: 120, step: 1, unit: "sn", showIf: { key: "mode", is: ["interval"] } },
    { key: "everyMin", label: "Kaç dakikada bir", type: "number", default: 5, min: 1, max: 60, step: 1, unit: "dk", showIf: { key: "mode", is: ["interval"] } },
    { key: "fields", label: "Gösterilecek bilgiler", type: "multi", default: CARD_DEFAULT_FIELDS, options: CARD_FIELDS, group: "İçerik" },
    { key: "nameFormat", label: "Ad biçimi", type: "select", default: "full", options: NAME_FORMATS, group: "İçerik" },
    { key: "nameText", label: "Ad (boş: simdeki adın)", type: "text", default: "", placeholder: "Ad Soyad", group: "İçerik" },
    { key: "teamText", label: "Takım adı (boş: simdeki takım)", type: "text", default: "", placeholder: "Takım", group: "İçerik" },
    { key: "line2", label: "İkinci satır (kendi yazın)", type: "text", default: "", placeholder: "@kullaniciadi", group: "İçerik", hint: "Boş bırakılırsa ikinci satırda araç ve takım bilgisi gösterilir." },
    { key: "classColor", label: "Vurgu rengi sınıf renginden gelsin", type: "boolean", default: true, group: "Görünüm" },
    { key: "accent", label: "Vurgu rengi", type: "color", default: "#ff8a2a", group: "Görünüm", showIf: { key: "classColor", is: [false] } },
    { key: "width", label: "En az genişlik", type: "number", default: 420, min: 200, max: 900, step: 10, unit: "px", group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 16, min: 10, max: 36, step: 1, unit: "px", group: "Görünüm" },
  ],
});
