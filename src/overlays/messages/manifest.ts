import { createSignal } from "solid-js";
import { defineOverlay } from "@/sdk/overlay";
import { settings } from "@/sdk/settings";
import { inTauri } from "@/sdk/platform";
import { session } from "@/cloud/supabase";
import { myGroups } from "@/cloud/groups";
import { ttsVoices } from "@/sdk/livechat";

// Grup sohbetlerim (Arkadaşlar bölümünde kurulan gruplar) ve kurulu Windows sesleri: ayar paneli açılınca bir kez
// okunur (gruplar en fazla 30 sn'de bir yenilenir); liste gelince seçenekler kendiliğinden dolar.
const [groupOpts, setGroupOpts] = createSignal<{ value: string; label: string }[]>([]);
let groupsAt = 0;
function loadGroups() {
  if (!session() || Date.now() - groupsAt < 30_000) return;
  groupsAt = Date.now();
  void myGroups()
    .then((l) => setGroupOpts(l.map((g) => ({ value: g.group_id, label: g.name || "?" }))))
    .catch(() => {});
}
const [voiceOpts, setVoiceOpts] = createSignal<{ value: string; label: string }[]>([]);
let voicesAsked = false;
function loadVoices() {
  if (voicesAsked || !inTauri) return;
  voicesAsked = true;
  void ttsVoices()
    .then((l) => setVoiceOpts(l.map((v) => ({ value: v.id, label: `${v.name} (${v.language})` }))))
    .catch(() => {});
}

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
  description:
    "Yarışırken gelen arkadaş, takım, grup ve ekip odası mesajlarını ekranda küçük balonlarla gösterir; ayarladığın süre sonunda kaybolur. İstersen mesajları sesli de okur. Birden fazla kopya eklenip her birine ayrı kaynak seçilebilir.",
  category: "info",
  topics: [],
  size: { w: 340, h: 200 },
  defaultPosition: { x: 40, y: 600 },
  defaultEnabled: false,
  // Birden fazla kopya: her kopyaya ayrı kaynak (ör. biri ekip odası, biri arkadaşlar)
  multiInstance: true,
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
        { value: "none", label: "Arkadaş mesajlarını gösterme" },
      ],
    },
    { key: "includeTeams", label: "Takım mesajlarını da göster", type: "boolean", default: true, showIf: { key: "source", not: ["team"] } },
    people,
    {
      key: "groups",
      label: "Grup sohbetleri",
      type: "select",
      default: "all",
      hint: "Arkadaşlar bölümünde kurduğun ya da üyesi olduğun grupların mesajları.",
      options: [
        { value: "all", label: "Tüm gruplar" },
        { value: "selected", label: "Seçili gruplar" },
        { value: "none", label: "Gösterme" },
      ],
    },
    {
      key: "groupList",
      label: "Seçili gruplar",
      type: "multi" as const,
      default: [] as string[],
      showIf: { key: "groups", is: ["selected"] },
      get options() {
        loadGroups();
        return groupOpts();
      },
    },
    {
      key: "crew",
      label: "Ekip odası mesajlarını göster",
      type: "boolean",
      default: true,
      hint: "Ekibinin Ekip Pitwall'ındaki odaya yazdığı mesajlar (ve hazır spotter mesajları) bu overlay'de görünür.",
    },
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
    {
      key: "crewTts",
      label: "Ekip odası mesajlarını sesli oku",
      type: "boolean",
      default: false,
      group: "Sesli okuma",
      feature: "social.messages_tts",
      showIf: { key: "crew", is: [true] },
      hint: "Ekip odasına yazılan mesajlar, yukarıdaki ayar kapalı olsa bile sesli okunur. Kendi mesajların okunmaz.",
    },
    {
      key: "crewVoice",
      label: "Ekip odası sesi",
      type: "select",
      default: "",
      group: "Sesli okuma",
      dynamic: true,
      showIf: { key: "crewTts", is: [true] },
      hint: "Canlı sohbetin sesli okuma sesinden ayrı seçilir; böylece ekibini sesinden ayırt edersin.",
      get options() {
        loadVoices();
        return [{ value: "", label: "Canlı sohbetle aynı ses" }, ...voiceOpts()];
      },
    },
    {
      key: "lifeValue",
      label: "Ekranda kalma süresi",
      type: "text",
      default: "3",
      placeholder: "3",
      group: "Görünüş",
      hint: "Sayıyı elle yaz (ör. 3 ya da 45); birimi aşağıdan seç. En az 3 saniye, en fazla 60 dakika.",
    },
    {
      key: "lifeUnit",
      label: "Süre birimi",
      type: "select",
      default: "min",
      group: "Görünüş",
      options: [
        { value: "sec", label: "Saniye" },
        { value: "min", label: "Dakika" },
      ],
    },
    { key: "width", label: "Genişlik", type: "number", default: 340, min: 220, max: 900, step: 10, unit: "px", group: "Görünüş", hint: "Düzenleme modunda pencere kenarından sürükleyerek de değiştirebilirsin." },
    { key: "maxVisible", label: "En fazla mesaj", type: "number", default: 4, min: 1, max: 10, step: 1, ui: "stepper", group: "Görünüş" },
    { key: "lines", label: "Mesaj başına en fazla satır", type: "number", default: 3, min: 1, max: 8, step: 1, ui: "stepper", group: "Görünüş" },
    { key: "fontSize", label: "Yazı boyutu", type: "number", default: 13, min: 10, max: 24, step: 1, unit: "px", group: "Görünüş" },
    { key: "bgOpacity", label: "Arka plan opaklığı", type: "number", default: 80, min: 0, max: 100, step: 5, unit: "%", group: "Görünüş" },
    { key: "avatar", label: "Fotoğraf / baş harf", type: "boolean", default: true, group: "Görünüş" },
    { key: "newestTop", label: "Yeni mesaj üstte", type: "boolean", default: false, group: "Görünüş" },
  ],
});
