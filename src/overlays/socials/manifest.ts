import { defineOverlay, type SettingField } from "@/sdk/overlay";

/** Platformlar: kısa etiket (rozet yazısı; marka logosu çizilmez) ve platformun bilinen rengi */
export const SOCIALS: { id: string; name: string; tag: string; color: string; ph: string }[] = [
  { id: "twitch", name: "Twitch", tag: "Tw", color: "#9146ff", ph: "kanaladin" },
  { id: "youtube", name: "YouTube", tag: "Yt", color: "#ff2d2d", ph: "@kanaladin" },
  { id: "kick", name: "Kick", tag: "Ki", color: "#53fc18", ph: "kanaladin" },
  { id: "instagram", name: "Instagram", tag: "Ig", color: "#e1306c", ph: "@kullaniciadin" },
  { id: "tiktok", name: "TikTok", tag: "Tk", color: "#25f4ee", ph: "@kullaniciadin" },
  { id: "x", name: "X", tag: "X", color: "#e7e9ea", ph: "@kullaniciadin" },
  { id: "facebook", name: "Facebook", tag: "Fb", color: "#1877f2", ph: "sayfaadin" },
  { id: "discord", name: "Discord", tag: "Dc", color: "#5865f2", ph: "discord.gg/davet" },
  { id: "web", name: "Web", tag: "www", color: "#38bdf8", ph: "siteadin.com" },
  { id: "custom1", name: "", tag: "@", color: "#ff8a2a", ph: "" },
  { id: "custom2", name: "", tag: "@", color: "#ff8a2a", ph: "" },
];

export const SOCIAL_THEMES: Record<string, { accent: string; bg: string; text: string }> = {
  dark: { accent: "#ff8a2a", bg: "#15171c", text: "#f2f4f8" },
  light: { accent: "#e2531f", bg: "#f4f5f7", text: "#16181d" },
  neon: { accent: "#ff2079", bg: "#0b0b10", text: "#ffffff" },
  ocean: { accent: "#38bdf8", bg: "#0f1724", text: "#e8f1ff" },
  mono: { accent: "#ffffff", bg: "#000000", text: "#ffffff" },
};

const custom = { key: "theme", is: ["custom"] };
const rot = { key: "design", is: ["rotator", "expand"] };

const accounts: SettingField[] = SOCIALS.filter((s) => !s.id.startsWith("custom")).map((s) => ({
  key: `a_${s.id}`,
  label: s.name,
  type: "text",
  default: "",
  placeholder: s.ph,
  group: "Hesaplar",
}));
const icons: SettingField[] = SOCIALS.map((s) => ({
  key: `i_${s.id}`,
  label: s.name || (s.id === "custom1" ? "Özel hesap 1" : "Özel hesap 2"),
  type: "image",
  default: "",
  maxSize: 96,
  group: "Kendi simgelerim",
}));

export default defineOverlay({
  id: "socials",
  name: "Sosyal Hesaplar",
  description:
    "Yayında sosyal medya hesaplarını gösterir: sırayla dönen tek hesap, açılan simge sırası, yan yana / alt alta liste ya da kayan şerit. Geçişler, renkler ve simgeler ayarlanabilir.",
  category: "stream",
  topics: [{ name: "status", hz: 1 }],
  size: { w: 300, h: 52 },
  defaultPosition: { x: 60, y: 960 },
  defaultEnabled: false,
  defaultAlwaysShow: true,
  multiInstance: true,
  resize: false,
  settings: [
    ...accounts,
    { key: "l_custom1", label: "Özel hesap 1: platform adı", type: "text", default: "", placeholder: "Patreon", group: "Hesaplar" },
    { key: "a_custom1", label: "Özel hesap 1", type: "text", default: "", group: "Hesaplar" },
    { key: "l_custom2", label: "Özel hesap 2: platform adı", type: "text", default: "", group: "Hesaplar" },
    { key: "a_custom2", label: "Özel hesap 2", type: "text", default: "", group: "Hesaplar", hint: "Boş bıraktığın hesaplar gösterilmez" },
    {
      key: "order",
      label: "Sıra",
      type: "order",
      default: SOCIALS.map((s) => ({ key: s.id, on: true })),
      options: SOCIALS.map((s) => ({ value: s.id, label: s.name || (s.id === "custom1" ? "Özel hesap 1" : "Özel hesap 2") })),
      group: "Hesaplar",
    },
    {
      key: "design",
      label: "Gösterim",
      type: "select",
      default: "rotator",
      group: "Görünüm",
      options: [
        { value: "rotator", label: "Sırayla tek hesap" },
        { value: "expand", label: "Simge sırası (sıradaki açılır)" },
        { value: "row", label: "Yan yana" },
        { value: "list", label: "Alt alta" },
        { value: "ticker", label: "Kayan şerit" },
      ],
    },
    {
      key: "transition",
      label: "Geçiş",
      type: "select",
      default: "slideUp",
      group: "Görünüm",
      showIf: { key: "design", is: ["rotator"] },
      options: [
        { value: "slideUp", label: "Yukarı kay" },
        { value: "slideLeft", label: "Yana kay" },
        { value: "fade", label: "Yumuşak geçiş" },
        { value: "flip", label: "Takla" },
        { value: "zoom", label: "Büyüyerek gel" },
        { value: "blur", label: "Bulanıktan netleş" },
        { value: "wipe", label: "Perde" },
      ],
    },
    { key: "secs", label: "Her hesabın süresi", type: "number", default: 5, min: 2, max: 30, step: 1, unit: "sn", group: "Görünüm", showIf: rot },
    { key: "speed", label: "Kayma hızı", type: "number", default: 60, min: 20, max: 200, step: 5, unit: "px/sn", group: "Görünüm", showIf: { key: "design", is: ["ticker"] } },
    { key: "width", label: "Şerit genişliği", type: "number", default: 600, min: 200, max: 1920, step: 10, unit: "px", group: "Görünüm", showIf: { key: "design", is: ["ticker"] } },
    {
      key: "shape",
      label: "Biçim",
      type: "select",
      default: "pill",
      group: "Görünüm",
      options: [
        { value: "pill", label: "Hap" },
        { value: "card", label: "Kart" },
        { value: "line", label: "Alt çizgili" },
        { value: "plain", label: "Yalnızca yazı (arka plansız)" },
      ],
    },
    {
      key: "align",
      label: "Hizalama",
      type: "select",
      default: "left",
      group: "Görünüm",
      options: [
        { value: "left", label: "Sola" },
        { value: "center", label: "Ortaya" },
        { value: "right", label: "Sağa" },
      ],
    },
    {
      key: "iconStyle",
      label: "Simge",
      type: "select",
      default: "badge",
      group: "Görünüm",
      options: [
        { value: "badge", label: "Dolu rozet" },
        { value: "outline", label: "Çerçeveli rozet" },
        { value: "none", label: "Simge yok" },
      ],
    },
    { key: "showName", label: "Platform adını göster", type: "boolean", default: false, group: "Görünüm" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 18, min: 10, max: 48, step: 1, unit: "px", group: "Görünüm" },
    { key: "bold", label: "Kalın yazı", type: "boolean", default: true, group: "Görünüm" },
    { key: "shadow", label: "Gölge", type: "boolean", default: true, group: "Görünüm" },
    {
      key: "theme",
      label: "Renk teması",
      type: "select",
      default: "dark",
      group: "Renkler",
      options: [
        { value: "dark", label: "Koyu" },
        { value: "light", label: "Açık tema" },
        { value: "neon", label: "Neon" },
        { value: "ocean", label: "Okyanus" },
        { value: "mono", label: "Siyah-beyaz" },
        { value: "app", label: "Uygulama teması" },
        { value: "custom", label: "Kendi renklerim" },
      ],
    },
    { key: "cAccent", label: "Vurgu rengi", type: "color", default: "#ff8a2a", group: "Renkler", showIf: custom },
    { key: "cBg", label: "Arka plan rengi", type: "color", default: "#15171c", group: "Renkler", showIf: custom },
    { key: "cText", label: "Yazı rengi", type: "color", default: "#f2f4f8", group: "Renkler", showIf: custom, resetKeys: ["cAccent", "cBg", "cText"], resetLabel: "Renkleri sıfırla" },
    { key: "brand", label: "Simgeler platformun renginde olsun", type: "boolean", default: true, group: "Renkler", hint: "Kapalıyken bütün simgeler vurgu renginde" },
    { key: "brandText", label: "Hesap adı da platformun renginde olsun", type: "boolean", default: false, group: "Renkler" },
    {
      key: "mode",
      label: "Ne zaman görünsün",
      type: "select",
      default: "always",
      group: "Zamanlama",
      options: [
        { value: "always", label: "Her zaman" },
        { value: "interval", label: "Belirli aralıklarla" },
      ],
    },
    { key: "showSecs", label: "Ekranda kalma süresi", type: "number", default: 20, min: 3, max: 300, step: 1, unit: "sn", group: "Zamanlama", showIf: { key: "mode", is: ["interval"] } },
    { key: "everyMin", label: "Kaç dakikada bir", type: "number", default: 5, min: 1, max: 60, step: 1, unit: "dk", group: "Zamanlama", showIf: { key: "mode", is: ["interval"] } },
    ...icons.map((f, i) => (i === icons.length - 1 ? { ...f, hint: "Bir resim seçersen o hesabın rozeti yerine kendi simgen gösterilir" } : f)),
  ],
});
