import { defineOverlay } from "@/sdk/overlay";

const custom = { key: "theme", is: ["custom"] };
const timed = { key: "show", is: ["change"] };

export default defineOverlay({
  id: "music",
  name: "Müzik",
  description:
    "Şu an çalan şarkı: kapak resmi, şarkı, sanatçı, albüm, ilerleme çubuğu. Spotify, tarayıcıda YouTube Music / YouTube, Apple Music, Deezer ve medya tuşlarını destekleyen diğer oynatıcılarla çalışır; hesap bağlamak gerekmez. Önceki / sonraki / durdur için klavye tuşu ya da direksiyon düğmesi atanabilir.",
  category: "stream",
  topics: [],
  size: { w: 380, h: 112 },
  defaultPosition: { x: 40, y: 900 },
  defaultEnabled: false,
  defaultAlwaysShow: true,
  resize: { w: "width" },
  settings: [
    {
      key: "design",
      label: "Tasarım",
      type: "select",
      default: "card",
      group: "Görünüm",
      options: [
        { value: "card", label: "Kart (kapak + bilgi)" },
        { value: "strip", label: "İnce şerit" },
        { value: "cover", label: "Büyük kapak" },
        { value: "text", label: "Sadece yazı" },
      ],
    },
    { key: "width", label: "Genişlik", type: "number", default: 380, min: 200, max: 900, step: 10, unit: "px", group: "Görünüm" },
    {
      key: "theme",
      label: "Renk teması",
      type: "select",
      default: "art",
      group: "Görünüm",
      options: [
        { value: "art", label: "Kapak resmine uysun" },
        { value: "dark", label: "Koyu" },
        { value: "glass", label: "Buzlu cam" },
        { value: "light", label: "Açık" },
        { value: "app", label: "Uygulama teması" },
        { value: "custom", label: "Kendi renklerim" },
      ],
    },
    { key: "cBg", label: "Arka plan rengi", type: "color", default: "#15161b", group: "Görünüm", showIf: custom },
    { key: "cText", label: "Yazı rengi", type: "color", default: "#f4f6fa", group: "Görünüm", showIf: custom },
    { key: "cAccent", label: "Vurgu rengi (çubuk, simge)", type: "color", default: "#1ed760", group: "Görünüm", showIf: custom, resetKeys: ["cBg", "cText", "cAccent"], resetLabel: "Renkleri sıfırla" },
    { key: "radius", label: "Köşe yuvarlaklığı", type: "number", default: 14, min: 0, max: 30, step: 1, unit: "px", group: "Görünüm" },
    { key: "border", label: "Çerçeve çizgisi", type: "boolean", default: true, group: "Görünüm" },
    { key: "shadow", label: "Gölge", type: "boolean", default: true, group: "Görünüm" },
    { key: "textSize", label: "Yazı boyutu", type: "number", default: 100, min: 70, max: 160, step: 5, unit: "%", group: "Görünüm" },

    { key: "header", label: "\"Şu an çalıyor\" başlığı", type: "boolean", default: true, group: "Bilgiler" },
    { key: "album", label: "Albüm adı", type: "boolean", default: false, group: "Bilgiler" },
    { key: "source", label: "Kaynak (Spotify, Chrome…)", type: "boolean", default: true, group: "Bilgiler" },
    { key: "progress", label: "İlerleme çubuğu", type: "boolean", default: true, group: "Bilgiler", hint: "Oynatıcı süre bildirmiyorsa görünmez (bazı tarayıcı sekmeleri)" },
    { key: "time", label: "Süre (1:23 / 3:45)", type: "boolean", default: true, group: "Bilgiler", showIf: { key: "progress", is: [true] } },
    { key: "buttons", label: "Önceki / durdur / sonraki düğmeleri", type: "boolean", default: true, group: "Bilgiler", hint: "Yarışta overlay'e tıklanamaz: denetim için tuş / direksiyon düğmesi ata (aşağıda)" },
    { key: "eq", label: "Çalarken hareketli ses çubukları", type: "boolean", default: true, group: "Bilgiler" },
    { key: "marquee", label: "Sığmayan uzun adlar kaysın", type: "boolean", default: true, group: "Bilgiler" },

    {
      key: "show",
      label: "Ne zaman görünsün",
      type: "select",
      default: "always",
      group: "Davranış",
      options: [
        { value: "always", label: "Müzik açıkken her zaman" },
        { value: "playing", label: "Yalnızca çalarken (duraklatınca gizlen)" },
        { value: "change", label: "Şarkı değişince birkaç saniye" },
      ],
    },
    { key: "showSecs", label: "Görünme süresi", type: "number", default: 8, min: 3, max: 60, step: 1, unit: "sn", group: "Davranış", showIf: timed },
    {
      key: "pref",
      label: "Kaynak",
      type: "select",
      default: "auto",
      group: "Davranış",
      options: [
        { value: "auto", label: "Otomatik (çalan oynatıcı)" },
        { value: "spotify", label: "Önce Spotify" },
        { value: "browser", label: "Önce tarayıcı (YouTube Music, YouTube…)" },
      ],
      hint: "Birden çok oynatıcı açıksa hangisi gösterilsin; seçilen kapalıysa çalan gösterilir",
    },
  ],
});
