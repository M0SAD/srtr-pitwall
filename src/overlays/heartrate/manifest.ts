import { defineOverlay } from "@/sdk/overlay";

/** Hazır renk temaları: kalp / vurgu, arka plan, yazı */
export const HEART_THEMES: Record<string, { accent: string; bg: string; text: string }> = {
  classic: { accent: "#ff4d5e", bg: "#17181c", text: "#f2f4f8" },
  ocean: { accent: "#38bdf8", bg: "#0f1724", text: "#e8f1ff" },
  neon: { accent: "#ff2079", bg: "#0b0b10", text: "#ffffff" },
  pastel: { accent: "#ff9aa2", bg: "#252838", text: "#f3f1ff" },
  light: { accent: "#dc2626", bg: "#f4f5f7", text: "#16181d" },
  mono: { accent: "#ffffff", bg: "#000000", text: "#ffffff" },
};

const custom = { key: "theme", is: ["custom"] };

export default defineOverlay({
  id: "heartrate",
  name: "Kalp Atışı",
  description:
    "Akıllı saatinden ya da göğüs bandından anlık kalp atışın: atan kalp simgesi, dakikadaki atış (BPM), nabız bölgesi ve mini grafik. Pulsoid, HypeRate ya da yerel gönderimle çalışır.",
  category: "info",
  topics: [{ name: "status", hz: 1 }],
  size: { w: 220, h: 92 },
  defaultPosition: { x: 1640, y: 180 },
  defaultEnabled: false,
  defaultAlwaysShow: true,
  resize: false,
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "card",
      group: "Görünüm",
      options: [
        { value: "card", label: "Kart (kalp + grafik)" },
        { value: "pill", label: "Şerit (tek satır)" },
        { value: "circle", label: "Yuvarlak (bölge halkası)" },
        { value: "ecg", label: "EKG çizgisi" },
        { value: "big", label: "Yalın (büyük sayı)" },
      ],
    },
    {
      key: "theme",
      label: "Renk teması",
      type: "select",
      default: "classic",
      group: "Görünüm",
      options: [
        { value: "classic", label: "Klasik" },
        { value: "ocean", label: "Okyanus" },
        { value: "neon", label: "Neon" },
        { value: "pastel", label: "Pastel" },
        { value: "light", label: "Açık tema" },
        { value: "mono", label: "Siyah-beyaz" },
        { value: "app", label: "Uygulama teması" },
        { value: "custom", label: "Kendi renklerim" },
      ],
    },
    { key: "cAccent", label: "Kalp / vurgu rengi", type: "color", default: "#ff4d5e", group: "Görünüm", showIf: custom },
    { key: "cBg", label: "Arka plan rengi", type: "color", default: "#17181c", group: "Görünüm", showIf: custom },
    { key: "cText", label: "Yazı rengi", type: "color", default: "#f2f4f8", group: "Görünüm", showIf: custom, resetKeys: ["cAccent", "cBg", "cText"], resetLabel: "Renkleri sıfırla" },
    { key: "zoneColor", label: "Rengi nabız bölgesine göre değiştir", type: "boolean", default: false, group: "Görünüm", hint: "Dinlenme mavi, hafif yeşil, orta sarı, yüksek turuncu, en yüksek kırmızı" },
    { key: "beat", label: "Kalp nabızla birlikte atsın", type: "boolean", default: true, group: "Görünüm" },
    { key: "label", label: "BPM yazısı", type: "boolean", default: true, group: "Görünüm" },
    { key: "zone", label: "Nabız bölgesi (yüzde ve ad)", type: "boolean", default: true, group: "Görünüm" },
    { key: "spark", label: "Mini grafik", type: "boolean", default: true, group: "Görünüm" },
    { key: "minmax", label: "En düşük / en yüksek", type: "boolean", default: false, group: "Görünüm" },
    { key: "maxHr", label: "En yüksek nabzın", type: "number", default: 190, min: 140, max: 230, step: 1, unit: "bpm", group: "Ölçüm ve uyarı", hint: "Bölgeler buna göre hesaplanır; kabaca 220 − yaşın" },
    { key: "alert", label: "Yüksek nabız uyarısı", type: "boolean", default: false, group: "Ölçüm ve uyarı" },
    { key: "alertAt", label: "Uyarı sınırı", type: "number", default: 175, min: 100, max: 230, step: 1, unit: "bpm", group: "Ölçüm ve uyarı", showIf: { key: "alert", is: [true] } },
    { key: "sound", label: "Uyarı sesi", type: "boolean", default: true, group: "Ölçüm ve uyarı", showIf: { key: "alert", is: [true] }, hint: "En çok dakikada bir" },
    { key: "volume", label: "Ses düzeyi", type: "number", default: 60, min: 5, max: 100, step: 5, unit: "%", group: "Ölçüm ve uyarı", showIf: { key: "alert", is: [true] } },
  ],
});
