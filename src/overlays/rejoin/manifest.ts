import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "rejoin",
  name: "Piste Dönüş",
  description:
    "Pist dışına çıktığında ya da durduğunda belirir: arkadan gelen en yakın araçlara süre farkını gösterip piste dönmenin güvenli olup olmadığını söyler.",
  category: "driving",
  // Tekrar ekranında çalışmaz (sürüş verisi yalnızca kendin sürerken gelir)
  replay: false,
  topics: [{ name: "traffic", hz: 10 }],
  size: { w: 260, h: 150 },
  defaultPosition: { x: 830, y: 260 },
  defaultEnabled: false,
  settings: [
    { key: "safe", label: "Güvenli boşluk", type: "number", default: 4, min: 1, max: 10, step: 0.5, unit: "sn" },
    { key: "caution", label: "Dikkat boşluğu", type: "number", default: 2, min: 0.5, max: 6, step: 0.5, unit: "sn" },
    { key: "slow", label: "Yavaş sayılma hızı", type: "number", default: 40, min: 5, max: 120, step: 5, unit: "km/h", hint: "Pistte bu hızın altına düşersen (dönme, kaza) de görünür." },
    { key: "count", label: "Gösterilen araç", type: "number", default: 3, min: 1, max: 5, step: 1 },
  ],
});
