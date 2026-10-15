import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "friendalert",
  name: "Arkadaş Uyarısı",
  description:
    "Arkadaş listendeki biriyle aynı yarıştayken atadığın tuşa ya da direksiyon düğmesine basınca onun ekranında yanıp sönen bir ünlem ve \"DİKKAT\" yazısı çıkar; o basınca da senin ekranında. Tuşu ve düğmeyi Kısayollar sayfasından atarsın.",
  category: "race",
  // Uyarı olay tabanlıdır (src/host/friendAlert.ts); veri konusu gerekmez
  topics: [],
  size: { w: 420, h: 220 },
  defaultPosition: { x: 750, y: 180 },
  defaultCenter: true,
  defaultEnabled: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "triangle",
      options: [
        { value: "triangle", label: "Uyarı üçgeni" },
        { value: "circle", label: "Daire" },
        { value: "banner", label: "Şerit" },
      ],
    },
    { key: "text", label: "Yazı", type: "text", default: "DİKKAT", placeholder: "DİKKAT" },
    { key: "showName", label: "Gönderenin adını göster", type: "boolean", default: true },
    { key: "duration", label: "Ekranda kalma süresi", type: "number", default: 5, min: 1, max: 30, step: 1, unit: "sn", ui: "stepper" },
    { key: "speed", label: "Yanıp sönme hızı", type: "number", default: 3, min: 1, max: 8, step: 1, unit: "Hz", hint: "Saniyede kaç kez yanıp söner." },
    { key: "size", label: "Boyut", type: "number", default: 100, min: 40, max: 300, step: 5, unit: "%" },
    { key: "sound", label: "Uyarı sesi", type: "boolean", default: true, hint: "Bildirim sesi (Sosyal ayarlarındaki ses ve ses düzeyi). Rahatsız Etme açıkken de çalar." },
    { key: "color", label: "Renk", type: "color", default: "#ffcc00" },
    { key: "textColor", label: "Yazı rengi", type: "color", default: "#ffffff" },
  ],
});
