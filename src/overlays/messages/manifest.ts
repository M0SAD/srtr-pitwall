import { defineOverlay } from "@/sdk/overlay";
import { settings } from "@/sdk/settings";

// Arkadaş listesi seçenekleri ayar panelinde canlı gelir (kabul edilen hesap arkadaşları)
const people = {
  key: "people",
  label: "Seçili kişiler",
  type: "multi" as const,
  default: [] as string[],
  showIf: { key: "source", is: ["selected"] },
  hint: "Arkadaş listesinde bir arkadaşa sağ tıklayıp \"Mesajlar overlay'inde göster\" ile de ekleyebilirsin.",
  get options() {
    return (settings().friends?.list ?? [])
      .filter((x) => !!x.accountId)
      .map((x) => ({ value: x.accountId!, label: x.name || "?" }));
  },
};

export default defineOverlay({
  id: "messages",
  name: "Mesajlar",
  description: "Yarışırken gelen arkadaş ve takım mesajlarını ekranda küçük balonlarla gösterir; birkaç saniye sonra kaybolur. İstersen mesajları sesli de okur.",
  category: "info",
  topics: [],
  size: { w: 340, h: 200 },
  defaultPosition: { x: 40, y: 600 },
  defaultEnabled: false,
  settings: [
    {
      key: "source",
      label: "Gösterilecek mesajlar",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Tüm arkadaşlar" },
        { value: "team", label: "Takım mesajları" },
        { value: "selected", label: "Seçili kişiler" },
      ],
    },
    { key: "includeTeams", label: "Takım mesajlarını da göster", type: "boolean", default: true, showIf: { key: "source", not: ["team"] } },
    people,
    { key: "mine", label: "Kendi mesajlarımı da göster", type: "boolean", default: false },
    {
      key: "tts",
      label: "Mesajları sesli oku",
      type: "boolean",
      default: false,
      group: "Sesli okuma",
      feature: "social.messages_tts",
      hint: "Bu overlay'de gösterilen gelen mesajlar Windows sesiyle okunur. Canlı sohbetin sesli okumasıyla aynı sırayı kullanır: ikisi üst üste konuşmaz, sesli mühendis konuşurken bekler. Ses, hız ve çıkış cihazı Canlı Sohbet › Sesli okuma ayarlarından alınır. Kendi mesajların okunmaz.",
    },
    { key: "ttsName", label: "Gönderen adını oku", type: "boolean", default: true, group: "Sesli okuma", showIf: { key: "tts", is: [true] }, hint: "\"Ali diyor ki: …\" (takım / grup mesajında takım adı okunmaz)." },
    { key: "ttsMax", label: "En fazla karakter", type: "number", default: 200, min: 40, max: 500, step: 10, group: "Sesli okuma", showIf: { key: "tts", is: [true] }, hint: "Daha uzun mesajlar kelime sınırında kesilir." },
    { key: "lifetime", label: "Ekranda kalma süresi", type: "number", default: 12, min: 3, max: 60, step: 1, unit: "sn", group: "Görünüş" },
    { key: "maxVisible", label: "En fazla mesaj", type: "number", default: 4, min: 1, max: 10, step: 1, ui: "stepper", group: "Görünüş" },
    { key: "lines", label: "Mesaj başına en fazla satır", type: "number", default: 3, min: 1, max: 8, step: 1, ui: "stepper", group: "Görünüş" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 13, min: 10, max: 24, step: 1, unit: "px", group: "Görünüş" },
    { key: "bgOpacity", label: "Arka plan opaklığı", type: "number", default: 80, min: 0, max: 100, step: 5, unit: "%", group: "Görünüş" },
    { key: "avatar", label: "Fotoğraf / baş harf", type: "boolean", default: true, group: "Görünüş" },
    { key: "newestTop", label: "Yeni mesaj üstte", type: "boolean", default: false, group: "Görünüş" },
  ],
});
