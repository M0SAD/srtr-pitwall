import { defineOverlay } from "@/sdk/overlay";

export const TARGET_FIELDS = [
  { value: "pos", label: "Sınıf sırası" },
  { value: "num", label: "Araç numarası" },
  { value: "gap", label: "Bana olan fark" },
  { value: "change", label: "Son turdaki fark değişimi" },
  { value: "last", label: "Son turu (benimkine göre)" },
  { value: "best", label: "En iyi turu (benimkine göre)" },
  { value: "pit", label: "Pit: kaç tur önce / şu an pitte" },
  { value: "tire", label: "Lastik" },
  { value: "irating", label: "iRating" },
  { value: "license", label: "Lisans ve SR" },
  { value: "spark", label: "Fark grafiği (mini)" },
];

export const TARGET_DEFAULT_FIELDS = TARGET_FIELDS.map((f) => f.value);

export default defineOverlay({
  id: "target",
  name: "Rakip Takibi",
  description:
    "Seçtiğin tek bir rakibi yakından izler: sırası, sana olan farkı ve son turdaki değişimi, son ve en iyi turu seninkiyle karşılaştırmalı, pit durumu, lastiği ve farkın mini grafiği.",
  category: "race",
  topics: [
    { name: "standings", hz: 2 },
    { name: "gaps", hz: 2 },
  ],
  size: { w: 300, h: 170 },
  defaultPosition: { x: 40, y: 700 },
  defaultEnabled: false,
  settings: [
    {
      key: "mode",
      label: "Kimi izleyeyim",
      type: "select",
      default: "ahead",
      options: [
        { value: "ahead", label: "Sınıfta hemen önümdeki" },
        { value: "behind", label: "Sınıfta hemen arkamdaki" },
        { value: "leader", label: "Sınıf lideri" },
        { value: "fixed", label: "Belirli bir araç / sürücü" },
        { value: "friend", label: "İşaretli arkadaşım" },
      ],
      hint: "Arkadaş: Arkadaşlar listendeki sürücülerden bu oturumda olan ve sıralamada sana en yakın olanı izlenir.",
    },
    {
      key: "query",
      label: "Araç numarası ya da sürücü adı",
      type: "text",
      default: "",
      placeholder: "12 ya da Rossi",
      showIf: { key: "mode", is: ["fixed"] },
      hint: "Önce araç numarası aranır (ör. 12 ya da #12), bulunamazsa sürücü adında geçen yazı.",
    },
    {
      key: "fallback",
      label: "Rakip bulunamazsa",
      type: "select",
      default: "ahead",
      options: [
        { value: "ahead", label: "Önümdeki aracı izle" },
        { value: "behind", label: "Arkamdaki aracı izle" },
        { value: "hide", label: "Gizle" },
      ],
    },
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "card",
      options: [
        { value: "card", label: "Kart" },
        { value: "strip", label: "Kompakt şerit" },
      ],
    },
    { key: "fields", label: "Gösterilecek bilgiler", type: "multi", default: TARGET_DEFAULT_FIELDS, options: TARGET_FIELDS, hint: "Lastik, iRating ve lisans sadece simin verdiği durumlarda görünür." },
    { key: "sparkLaps", label: "Mini grafikte tur sayısı", type: "number", default: 12, min: 5, max: 30, step: 1, ui: "stepper" },
    { key: "raceOnly", label: "Sadece yarış oturumunda göster", type: "boolean", default: false },

    { key: "accent", label: "Vurgu rengi", type: "color", default: "#ff8a2a", group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 14, min: 10, max: 26, step: 1, unit: "px", group: "Görünüm" },
    { key: "width", label: "Genişlik", type: "number", default: 300, min: 200, max: 700, step: 10, unit: "px", group: "Görünüm" },
  ],
});
