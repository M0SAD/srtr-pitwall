import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "startlights",
  name: "Start Işıkları",
  description:
    "Yarış başlamadan önce start ışıklarını gösterir: formasyon turu ve grid bilgisi, sırayla yanan ışıklar ve sim yarışı başlattığı anda yeşil ışık / GO! Start sonrası kendiliğinden kaybolur.",
  category: "stream",
  topics: [
    { name: "session", hz: 10 },
    { name: "status", hz: 1 },
  ],
  size: { w: 420, h: 190 },
  defaultPosition: { x: 750, y: 90 },
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "gantry",
      options: [
        { value: "gantry", label: "Işık köprüsü (5 ışık)" },
        { value: "traffic", label: "Trafik ışığı (kırmızı → yeşil)" },
        { value: "minimal", label: "Sade yazı" },
      ],
    },
    { key: "lights", label: "Işık sayısı", type: "number", default: 5, min: 3, max: 7, step: 1, ui: "stepper", showIf: { key: "design", is: ["gantry"] }, hint: "Sim ışık sayısını kendisi veriyorsa (LMU / rFactor 2) onunki kullanılır." },
    {
      key: "goStyle",
      label: "Start anı",
      type: "select",
      default: "green",
      options: [
        { value: "green", label: "Işıklar yeşile döner" },
        { value: "out", label: "Işıklar söner" },
      ],
      showIf: { key: "design", is: ["gantry"] },
    },
    { key: "goText", label: "Start yazısı", type: "text", default: "GO!", placeholder: "GO!", hint: "Start anında çıkan büyük yazı (ör. GO! ya da YEŞİL BAYRAK). Boş bırakılırsa yazı çıkmaz." },
    { key: "hold", label: "Starttan sonra ekranda kalma", type: "number", default: 4, min: 1, max: 20, step: 1, unit: "sn" },
    { key: "showPhase", label: "Aşama yazısını göster (formasyon turu, grid, hazır)", type: "boolean", default: true },
    { key: "showFormation", label: "Formasyon turunda da göster", type: "boolean", default: true, hint: "Kapalıyken overlay ancak ışıklar yanmaya başlayınca görünür (ışık verisi olmayan simlerde sadece start anında)." },
    { key: "raceOnly", label: "Sadece yarış oturumunda", type: "boolean", default: true },
    { key: "beep", label: "Yeşilde bip sesi", type: "boolean", default: false, group: "Ses" },
    { key: "beepVolume", label: "Bip ses düzeyi", type: "number", default: 60, min: 10, max: 100, step: 5, unit: "%", group: "Ses", showIf: { key: "beep", is: [true] } },
    { key: "size", label: "Işık boyutu", type: "number", default: 46, min: 24, max: 110, step: 2, unit: "px", group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 18, min: 11, max: 40, step: 1, unit: "px", group: "Görünüm" },
    { key: "redColor", label: "Kırmızı ışık rengi", type: "color", default: "#ff2b2b", group: "Görünüm" },
    { key: "greenColor", label: "Yeşil ışık rengi", type: "color", default: "#2fe36e", group: "Görünüm", resetKeys: ["redColor", "greenColor"], resetLabel: "Renkleri sıfırla" },
  ],
});
