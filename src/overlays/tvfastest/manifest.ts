import { defineOverlay } from "@/sdk/overlay";
import { tvShowSettings } from "@/sdk/tvkit";

export default defineOverlay({
  id: "tvfastest",
  name: "TV En Hızlı Tur",
  description:
    "Biri oturumun (ya da sınıfının) en hızlı turunu attığında TV'deki gibi mor “FASTEST LAP” bandı çıkar: logo, ad, numara, tur süresi ve önceki en iyiye göre kazanç. Birkaç saniye sonra kaybolur.",
  category: "stream",
  topics: [
    { name: "standings", hz: 2 },
    { name: "session", hz: 1 },
    { name: "status", hz: 1 },
  ],
  size: { w: 560, h: 70 },
  defaultPosition: { x: 680, y: 140 },
  defaultEnabled: false,
  settings: [
    {
      key: "scope",
      label: "Hangi en hızlı tur",
      type: "select",
      default: "overall",
      options: [
        { value: "overall", label: "Genel (bütün sınıflar)" },
        { value: "class", label: "Her sınıfın kendi en hızlısı" },
        { value: "myclass", label: "Sadece benim sınıfım" },
      ],
    },
    { key: "secs", label: "Ekranda kalma", type: "number", default: 7, min: 3, max: 30, step: 1, unit: "sn", showIf: { key: "show", is: ["auto"] } },
    ...tvShowSettings({ autoLabel: "Yeni en hızlı tur atılınca", cooldown: 0, hideBeforeGreen: true, hideAfterFinish: true }),
    { key: "title", label: "Başlık", type: "text", default: "", placeholder: "FASTEST LAP" },
    { key: "color", label: "Renk", type: "color", default: "#8e2bff", group: "Görünüm" },
    { key: "scale", label: "Boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüm" },
  ],
});
