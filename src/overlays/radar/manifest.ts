import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "radar",
  name: "Radar",
  description:
    "Yanındaki ve yakınındaki araçları kuşbakışı gösteren radar. Araç blokları boyuna konumlarına göre hareket eder.",
  category: "driving",
  topics: [{ name: "radar", hz: 30 }],
  size: { w: 220, h: 220 },
  defaultPosition: { x: 850, y: 600 },
  defaultEnabled: false,
  settings: [
    {
      key: "mode",
      label: "Araç konumu",
      type: "select",
      default: "lanes",
      options: [
        { value: "lanes", label: "Şeritler (sol / orta / sağ)" },
        { value: "real", label: "Gerçek konum (yanal uzaklıkla)", pro: true },
      ],
      proHint: "Gerçek konum görünümü PRO üyelere özel.",
      hint: "Gerçek konum: araçlar sana gerçek uzaklıkta, sağa / sola ne kadar açık olduklarıyla görünür (ACC, LMU / rF2, AMS2). iRacing diğer araçların yanal konumunu hiç vermez; orada ön / arka uzaklık gerçektir, yan konum tahmindir: araç yanına gelince geldiği tarafa geçer, seni geçince ortaya zıplamaz, geçtiği tarafta kalıp uzaklaştıkça yavaşça şeride döner. Şeritler: önceki görünüm.",
    },
    {
      key: "hideWhenClear",
      label: "Kimse yokken gizle",
      type: "boolean",
      default: true,
    },
    {
      key: "mirror",
      label: "Aynala (sol / sağ ters görünüyorsa)",
      type: "boolean",
      default: false,
      hint: "iRacing dışındaki bazı oyunlarda yandaki araç ters tarafta görünebilir; öyleyse bunu aç. iRacing'de kapalı kalmalı.",
    },
    { key: "color", label: "Araç rengi", type: "color", default: "#ff8a2a" },
    {
      key: "range",
      label: "Görüş mesafesi (ön/arka)",
      type: "number",
      default: 20,
      min: 6,
      max: 60,
      step: 1,
      unit: "m",
      hint: "Arkadan ya da önden gelen araç bu mesafeye girince radarda gerçek uzaklığında görünür.",
    },
    {
      key: "showDistance",
      label: "Uzaklığı yaz (m)",
      type: "boolean",
      default: false,
      hint: "Önündeki ve arkandaki en yakın aracın uzaklığını radarın üstüne / altına yazar. Kapalıyken yazı görünmez.",
    },
    {
      key: "hz",
      label: "Güncelleme sıklığı",
      type: "number",
      default: 30,
      min: 10,
      max: 60,
      step: 10,
      unit: "Hz",
    },
  ],
});
