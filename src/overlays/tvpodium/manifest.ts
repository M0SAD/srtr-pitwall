import { defineOverlay } from "@/sdk/overlay";
import { tvShowSettings } from "@/sdk/tvkit";

export default defineOverlay({
  id: "tvpodium",
  name: "TV Yarış Sonucu",
  description:
    "Yarış sonunda TV'deki gibi podyum: ilk üç araç basamaklar üzerinde (ortada kazanan, solda ikinci, sağda üçüncü) logo, ad, takım, bayrak, numara ve farkla. Tarafsızdır: senin bilgilerin gösterilmez. Damalı bayraktan sonra ilk araçlar çizgiyi geçince açılır, ayarlanan süre sonra kaybolur.",
  category: "stream",
  topics: [
    { name: "standings", hz: 1 },
    { name: "session", hz: 1 },
    { name: "status", hz: 1 },
  ],
  size: { w: 1100, h: 520 },
  defaultPosition: { x: 410, y: 300 },
  defaultCenter: true,
  defaultEnabled: false,
  settings: [
    { key: "title", label: "Başlık", type: "text", default: "", placeholder: "RACE RESULT", group: "Başlık" },
    { key: "subtitle", label: "Alt yazı (boş: pist ve oturum)", type: "text", default: "", placeholder: "SPA-FRANCORCHAMPS - RACE", group: "Başlık" },
    ...tvShowSettings({
      autoLabel: "Damalı bayraktan sonra",
      maxSecs: 30,
      showSecs: 20,
      everyMin: 10,
      once: { label: "Yarış sonunda ekranda kalma", hint: "Bu kadar görünür, sonra kaybolur ve o yarışta tekrar çıkmaz. 0: oturum bitene kadar ekranda kalır." },
    }),
    { key: "finishers", label: "Kaç araç bitirince açılsın", type: "number", default: 3, min: 1, max: 20, step: 1, ui: "stepper", group: "Ne zaman görünsün", showIf: { key: "show", is: ["auto"] }, hint: "Damalı bayrağı bu kadar araç geçince açılır (lider dahil)." },
    { key: "podiumDelay", label: "Sonra kaç saniye beklesin", type: "number", default: 0, min: 0, max: 180, step: 1, unit: "sn", group: "Ne zaman görünsün", showIf: { key: "show", is: ["auto"] } },
    {
      key: "classFilter",
      label: "Hangi sınıfın podyumu",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Genel" },
        { value: "first", label: "Liderin sınıfı" },
      ],
    },
    {
      key: "nameFormat",
      label: "Ad",
      type: "select",
      default: "full",
      options: [
        { value: "full", label: "AD SOYAD" },
        { value: "last", label: "SOYAD" },
        { value: "initial", label: "A. SOYAD" },
      ],
    },
    {
      key: "numColor",
      label: "Numara kutusu rengi",
      type: "select",
      default: "category",
      options: [
        { value: "category", label: "Kategori (iRating'e göre)" },
        { value: "class", label: "Sınıf rengi" },
        { value: "white", label: "Beyaz" },
      ],
    },
    { key: "showTeam", label: "Takım / araç satırı", type: "boolean", default: true },
    { key: "showFlag", label: "Ülke bayrağı", type: "boolean", default: true },
    { key: "showGap", label: "Fark", type: "boolean", default: true },
    { key: "accent", label: "Ana renk", type: "color", default: "#d4151d", group: "Görünüm" },
    { key: "scale", label: "Boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüm" },
  ],
});
