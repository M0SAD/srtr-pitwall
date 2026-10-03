import { defineOverlay } from "@/sdk/overlay";
import { NAME_FORMATS } from "@/sdk/HeaderStats";

export default defineOverlay({
  id: "results",
  name: "Yarış Sonucu",
  description:
    "Damalı bayraktan sonra yarış sonucunu gösterir: sınıfının ilk üçü (bayrak ve farklarla), kendi sonucun (sıra, kazanılan sıra, en iyi tur, olay puanı) ve tahmini iRating değişimi.",
  category: "stream",
  topics: [
    { name: "standings", hz: 1 },
    { name: "session", hz: 2 },
    { name: "status", hz: 1 },
  ],
  size: { w: 460, h: 330 },
  defaultPosition: { x: 730, y: 300 },
  defaultCenter: true,
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "podium",
      options: [
        { value: "podium", label: "Podyum (ilk 3)" },
        { value: "table", label: "Tablo (ilk N + ben)" },
      ],
    },
    { key: "topN", label: "Tabloda sürücü sayısı", type: "number", default: 5, min: 3, max: 12, step: 1, ui: "stepper", showIf: { key: "design", is: ["table"] } },
    {
      key: "trigger",
      label: "Ne zaman çıksın",
      type: "select",
      default: "me",
      options: [
        { value: "me", label: "Ben çizgiyi geçince" },
        { value: "flag", label: "Damalı bayrak çıkınca" },
      ],
      hint: "“Ben çizgiyi geçince”: damalı bayraktan sonra turunu tamamladığında (ya da araçtan indiğinde) görünür.",
    },
    {
      key: "mode",
      label: "Ekranda kalma",
      type: "select",
      default: "timed",
      options: [
        { value: "timed", label: "Belirli süre" },
        { value: "stay", label: "Oturum bitene kadar" },
      ],
    },
    { key: "secs", label: "Süre", type: "number", default: 30, min: 5, max: 300, step: 5, unit: "sn", showIf: { key: "mode", is: ["timed"] } },
    { key: "title", label: "Başlık", type: "text", default: "", placeholder: "YARIŞ SONUCU", group: "İçerik" },
    { key: "showFlags", label: "Ülke bayrakları", type: "boolean", default: true, group: "İçerik" },
    { key: "showGaps", label: "Farklar", type: "boolean", default: true, group: "İçerik" },
    { key: "showMine", label: "Kendi sonucum", type: "boolean", default: true, group: "İçerik" },
    { key: "showGain", label: "Kazanılan / kaybedilen sıra", type: "boolean", default: true, group: "İçerik", showIf: { key: "showMine", is: [true] } },
    { key: "showBest", label: "En iyi tur", type: "boolean", default: true, group: "İçerik", showIf: { key: "showMine", is: [true] } },
    { key: "showInc", label: "Olay puanı (iRacing)", type: "boolean", default: true, group: "İçerik", showIf: { key: "showMine", is: [true] } },
    { key: "showIr", label: "Tahmini iRating değişimi (iRacing)", type: "boolean", default: true, group: "İçerik", showIf: { key: "showMine", is: [true] } },
    { key: "nameFormat", label: "Ad biçimi", type: "select", default: "full", options: NAME_FORMATS, group: "İçerik" },
    { key: "width", label: "Genişlik", type: "number", default: 460, min: 300, max: 900, step: 10, unit: "px", group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 15, min: 10, max: 30, step: 1, unit: "px", group: "Görünüm" },
  ],
});
