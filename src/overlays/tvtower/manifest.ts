import { defineOverlay } from "@/sdk/overlay";
import { tvShowSettings } from "@/sdk/tvkit";

export default defineOverlay({
  id: "tvtower",
  name: "TV Sıralama Kulesi",
  description:
    "Televizyondaki GT yayınlarındaki gibi solda dikey sıralama: başlıkta seri adı, oturum (RACE) ve pist; altında yarış saati, sıra, marka logosu, soyad, numara (sınıf / kategori rengiyle) ve lidere fark. Sıra kazanan / kaybeden satır kısa süre yeşil / kırmızı yanar, kameranın izlediği araç vurgulanır.",
  category: "stream",
  topics: [
    { name: "standings", hz: 2 },
    { name: "session", hz: 1 },
  ],
  size: { w: 360, h: 560 },
  defaultPosition: { x: 50, y: 30 },
  defaultEnabled: false,
  settings: [
    { key: "title", label: "Seri adı", type: "text", default: "SRTR PITWALL", placeholder: "GT WORLD CHALLENGE", group: "Başlık" },
    { key: "subtitle", label: "Alt yazı", type: "text", default: "", placeholder: "POWERED BY …", group: "Başlık" },
    { key: "trackText", label: "Pist yazısı (boş: simdeki pist)", type: "text", default: "", placeholder: "SPA-FRANCORCHAMPS", group: "Başlık" },
    { key: "country", label: "Pist ülkesi (bayrak kodu)", type: "text", default: "", placeholder: "BE", group: "Başlık", hint: "İki harfli ülke kodu (TR, BE, GB…). Boş bırakılırsa bayrak gösterilmez." },
    { key: "showHeader", label: "Başlığı göster", type: "boolean", default: true, group: "Başlık" },
    {
      key: "clock",
      label: "Saat",
      type: "select",
      default: "elapsed",
      group: "Başlık",
      options: [
        { value: "elapsed", label: "Geçen süre" },
        { value: "remain", label: "Kalan süre" },
        { value: "off", label: "Gösterme" },
      ],
    },
    { key: "rows", label: "Satır sayısı", type: "number", default: 25, min: 5, max: 40, step: 1, ui: "stepper" },
    {
      key: "gapMode",
      label: "Fark sütunu",
      type: "select",
      default: "leader",
      options: [
        { value: "leader", label: "Lidere fark" },
        { value: "interval", label: "Öndekine fark" },
        { value: "cycle", label: "Sırayla ikisi (10 sn)" },
      ],
    },
    {
      key: "classFilter",
      label: "Gösterilen sınıf",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Genel (bütün sınıflar)" },
        { value: "mine", label: "Sadece benim sınıfım" },
      ],
    },
    {
      key: "numColor",
      label: "Numara kutusu rengi",
      type: "select",
      default: "category",
      options: [
        { value: "category", label: "Kategori (iRating'e göre Pro / Gold / Silver / Bronze)" },
        { value: "class", label: "Sınıf rengi" },
        { value: "white", label: "Beyaz" },
      ],
    },
    {
      key: "nameFormat",
      label: "Ad",
      type: "select",
      default: "last",
      options: [
        { value: "last", label: "SOYAD" },
        { value: "initial", label: "A. SOYAD" },
        { value: "full", label: "AD SOYAD" },
      ],
    },
    { key: "nameWidth", label: "Ad sütunu genişliği", type: "number", default: 0, min: 0, max: 320, step: 5, unit: "px", hint: "0: otomatik (ad biçimine göre: SOYAD 100, A. SOYAD 120, AD SOYAD 160 px). Uzun adlar sığmazsa büyüt." },
    { key: "showLogos", label: "Marka logoları", type: "boolean", default: true },
    { key: "highlightCam", label: "İzlenen aracı vurgula", type: "boolean", default: true },
    { key: "showMeAlways", label: "Listede yoksam altta kendimi göster", type: "boolean", default: true },
    { key: "flash", label: "Sıra değişince satır yanıp sönsün", type: "boolean", default: true },
    { key: "accent", label: "Ana renk", type: "color", default: "#d4151d", group: "Görünüm" },
    { key: "scale", label: "Boyut", type: "number", default: 100, min: 60, max: 200, step: 5, unit: "%", group: "Görünüm" },
    ...tvShowSettings({ showSecs: 30, everyMin: 5, hideAfterFinish: true }),
  ],
});
