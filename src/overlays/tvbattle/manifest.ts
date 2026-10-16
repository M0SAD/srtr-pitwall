import { defineOverlay } from "@/sdk/overlay";
import { tvShowSettings } from "@/sdk/tvkit";

export default defineOverlay({
  id: "tvbattle",
  name: "TV Mücadele",
  description:
    "Pistte kıyasıya bir mücadele olunca TV'deki gibi “BATTLE FOR P5” bandı çıkar: iki sürücü (logo, ad, numara), aradaki fark ve farkın kapanıp açıldığını gösteren ok ve son 30 sn'lik küçük grafik. Fark açılınca kendiliğinden kaybolur.",
  category: "stream",
  topics: [
    { name: "standings", hz: 2 },
    { name: "session", hz: 1 },
    { name: "status", hz: 1 },
  ],
  size: { w: 640, h: 120 },
  defaultPosition: { x: 640, y: 60 },
  defaultEnabled: false,
  settings: [
    { key: "threshold", label: "Mücadele sayılan fark", type: "number", default: 1, min: 0.2, max: 3, step: 0.1, unit: "sn" },
    { key: "maxPos", label: "En çok kaçıncı sıraya kadar", type: "number", default: 20, min: 2, max: 60, step: 1, ui: "stepper", hint: "Bu sıradan gerideki mücadeleler gösterilmez." },
    {
      key: "prefer",
      label: "Birden çok mücadele varsa",
      type: "select",
      default: "top",
      options: [
        { value: "top", label: "En öndeki" },
        { value: "closest", label: "En yakın fark" },
        { value: "mine", label: "Benimki (varsa)" },
      ],
    },
    {
      key: "classFilter",
      label: "Sınıf",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Genel sıra" },
        { value: "class", label: "Sınıf içi (aynı sınıftaki araçlar)" },
      ],
    },
    { key: "minSecs", label: "Ekranda en az kalma", type: "number", default: 8, min: 3, max: 60, step: 1, unit: "sn" },
    ...tvShowSettings({ autoLabel: "Mücadele olunca", maxSecs: 30, cooldown: 30, raceOnly: true, hideBeforeGreen: true, hideAfterFinish: true }),
    { key: "showGraph", label: "Fark grafiği", type: "boolean", default: true },
    { key: "title", label: "Başlık", type: "text", default: "", placeholder: "BATTLE FOR P{0}", hint: "{0} yerine sıra yazılır." },
    { key: "accent", label: "Ana renk", type: "color", default: "#d4151d", group: "Görünüm" },
    { key: "scale", label: "Boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüm" },
  ],
});
