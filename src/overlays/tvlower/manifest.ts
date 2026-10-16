import { defineOverlay } from "@/sdk/overlay";
import { tvShowSettings } from "@/sdk/tvkit";

export default defineOverlay({
  id: "tvlower",
  name: "TV Sürücü Bandı",
  description:
    "TV yayınlarındaki alt bant: sıra, marka logosu, ad soyad, takım, ülke bayrağı ve numara. Üstünde hız göstergesi (yeşil yay, km/h), fren ışığı ve vites şeridi. iRacing TV kamerasında ekrandaki araç ve pistte ona en yakın araç yan yana çıkar, ikisinin de hızı ve vitesi görünür. İstersen yanındaki bant öndeki ya da arkadaki araç olur.",
  category: "stream",
  topics: [
    { name: "standings", hz: 2 },
    { name: "inputs", hz: 20 },
    { name: "status", hz: 1 },
    { name: "map", hz: 10 },
    { name: "session", hz: 1 },
  ],
  size: { w: 1500, h: 200 },
  defaultPosition: { x: 210, y: 860 },
  defaultEnabled: false,
  settings: [
    {
      key: "focus",
      label: "Kimi göstersin",
      type: "select",
      default: "cam",
      options: [
        { value: "cam", label: "Kameranın izlediği araç (yoksa ben)" },
        { value: "me", label: "Her zaman ben" },
      ],
    },
    {
      key: "second",
      label: "Yanında ikinci bant",
      type: "select",
      default: "track",
      options: [
        { value: "none", label: "Yok" },
        { value: "track", label: "Pistte en yakın araç (ekrandaki ikinci araç)" },
        { value: "ahead", label: "Öndeki araç" },
        { value: "behind", label: "Arkadaki araç" },
        { value: "close", label: "Hangisi yakınsa" },
      ],
      hint: "“Pistte en yakın” ve “Hangisi yakınsa”: ikinci bant yalnızca kapışma varken çıkar, fark açılınca kalkar.",
    },
    { key: "incidentTag", label: "Kazada bandı hemen göster (INCIDENT etiketi)", type: "boolean", default: true, hint: "Otomatik Rejisör olaydaki araca kesince o aracın bandı “INCIDENT” etiketiyle hemen çıkar." },
    { key: "pairGap", label: "Kapışma sayılan fark", type: "number", default: 1, min: 0.2, max: 3, step: 0.1, unit: "sn", showIf: { key: "second", is: ["track", "close"] } },
    { key: "gridCycle", label: "Yeşil bayraktan önce bütün sürücüleri sırayla göster", type: "boolean", default: true, hint: "Gridde ve ısınma turunda tek bant, pole'dan başlayarak; kamera değişirse kameradaki aracı gösterir." },
    { key: "gridSecs", label: "Grid sırasında sürücü başına", type: "number", default: 4, min: 2, max: 15, step: 1, unit: "sn", showIf: { key: "gridCycle", is: [true] } },
    ...tvShowSettings({ autoLabel: "Kamera başka araca geçince (birkaç saniye)", def: "always", cooldown: 0, showSecs: 15, everyMin: 3, hideAfterFinish: true }),
    { key: "camSecs", label: "Kamera değişince ekranda kalma", type: "number", default: 8, min: 3, max: 60, step: 1, unit: "sn", showIf: { key: "show", is: ["auto"] }, group: "Ne zaman görünsün" },
    {
      key: "gauge",
      label: "Hız / vites / fren göstergesi",
      type: "select",
      default: "all",
      options: [
        { value: "all", label: "Bantlardaki bütün araçlarda" },
        { value: "me", label: "Sadece kendi aracımda" },
        { value: "off", label: "Kapalı" },
      ],
      hint: "Diğer araçların hızı ve vitesi iRacing'den gelir; fren bilgisini iRacing vermediği için yavaşlamadan tahmin edilir.",
    },
    { key: "hideGaugeStopped", label: "Araç dururken göstergeyi gizle", type: "boolean", default: true, hint: "Araç hareketsizken (pitte, gridde, kazadan sonra) hız / vites / fren göstergesi görünmez, yalnızca bant kalır." },
    { key: "maxSpeed", label: "Göstergenin en yüksek hızı", type: "number", default: 300, min: 100, max: 400, step: 10, unit: "km/h", showIf: { key: "gauge", is: ["all", "me"] } },
    { key: "showTeam", label: "Takım / araç satırı", type: "boolean", default: true },
    { key: "showFlag", label: "Ülke bayrağı", type: "boolean", default: true },
    { key: "classPos", label: "Sınıf sırası (çok sınıflı yarışta)", type: "boolean", default: false },
    { key: "nameText", label: "Kendi adım (boş: simdeki ad)", type: "text", default: "", placeholder: "AD SOYAD", group: "İçerik" },
    { key: "teamText", label: "Kendi takımım (boş: simdeki takım)", type: "text", default: "", placeholder: "TAKIM", group: "İçerik" },
    { key: "accent", label: "Ana renk", type: "color", default: "#d4151d", group: "Görünüm" },
    { key: "scale", label: "Boyut", type: "number", default: 100, min: 50, max: 200, step: 5, unit: "%", group: "Görünüm" },
  ],
});
