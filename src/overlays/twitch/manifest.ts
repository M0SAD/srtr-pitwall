import { defineOverlay } from "@/sdk/overlay";

export default defineOverlay({
  id: "twitch",
  name: "Twitch Sohbeti",
  description:
    "Twitch kanalının sohbetini oyunun üstünde gösterir. Giriş gerekmez (anonim okuma). Kanal adı Ayarlar → Entegrasyonlar'dan ya da buradan girilir.",
  category: "stream",
  topics: [],
  size: { w: 340, h: 300 },
  defaultPosition: { x: 20, y: 540 },
  defaultEnabled: false,
  settings: [
    { key: "channel", label: "Kanal (boş: genel ayar)", type: "text", default: "" },
    { key: "max", label: "En fazla mesaj", type: "number", default: 12, min: 3, max: 40, step: 1 },
    { key: "fade", label: "Mesajları soldur", type: "number", default: 0, min: 0, max: 300, step: 10, unit: "sn", hint: "0 = mesajlar kalır." },
    { key: "showBadges", label: "Mod/abone işareti", type: "boolean", default: true },
    { key: "hideCommands", label: "! komutlarını gizle", type: "boolean", default: true },
    { key: "hideBots", label: "Bot adları (virgülle)", type: "text", default: "nightbot,streamelements,streamlabs,moobot" },
  ],
});
