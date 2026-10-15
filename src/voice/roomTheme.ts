// Ses odaları görünümü (Ses ayarları › Görünüm; PRO): renk teması ve kişi görünümü (kutular / daireler / liste).
// Tema yalnızca ses odası sayfalarına (sol menü, oda, Tüm odalar, kişi menüsü) uygulanır: kapsayıcıya "vr-th-<id>"
// sınıfı eklenir, voicerooms.css'teki renk değişkenleri ezilir. PRO değilse varsayılan görünüm kullanılır.

import { uiPref } from "@/sdk/settings";
import { F, proLocked } from "@/sdk/proFeatures";

export interface RoomTheme {
  id: string;
  label: string;
  /** önizleme: zemin, yan panel, vurgu, konuşma rengi */
  sw: [string, string, string, string];
}

export const ROOM_THEMES: RoomTheme[] = [
  { id: "default", label: "Pitwall", sw: ["#0e1015", "#151821", "#ff8a2a", "#33d17a"] },
  { id: "discord", label: "Discord", sw: ["#313338", "#2b2d31", "#5865f2", "#23a55a"] },
  { id: "midnight", label: "Gece mavisi", sw: ["#0a1020", "#0f1830", "#3fa9ff", "#2ee6a6"] },
  { id: "carbon", label: "Karbon", sw: ["#0d0d0f", "#141417", "#e10600", "#00d46a"] },
  { id: "synth", label: "Synthwave", sw: ["#140b24", "#1c1033", "#ff3d9a", "#22f0e0"] },
  { id: "racing", label: "Yarış yeşili", sw: ["#0c1a13", "#10231a", "#d4af37", "#5cff9d"] },
  { id: "light", label: "Açık", sw: ["#f3f4f7", "#ffffff", "#ff7a1a", "#16a34a"] },
];

export type TileStyle = "tiles" | "circles" | "list";
export const TILE_STYLES: { id: TileStyle; label: string; hint: string }[] = [
  { id: "tiles", label: "Kutular", hint: "Discord'daki gibi büyük kutular" },
  { id: "circles", label: "Daireler", hint: "Yuvarlak fotoğraflar, altında ad" },
  { id: "list", label: "Liste", hint: "Sade, sıkışık liste (kalabalık odalar için)" },
];

export const [roomThemePref, setRoomThemePref] = uiPref<string>("voice.room.theme", "default");
export const [tileStylePref, setTileStylePref] = uiPref<TileStyle>("voice.room.tiles", "tiles");

const locked = () => proLocked(F.voiceRoomTheme);
/** Geçerli tema (PRO değilse varsayılan) */
export const roomTheme = () => (locked() || !ROOM_THEMES.some((x) => x.id === roomThemePref()) ? "default" : roomThemePref());
export const tileStyle = (): TileStyle =>
  locked() ? "tiles" : (["tiles", "circles", "list"] as TileStyle[]).includes(tileStylePref()) ? tileStylePref() : "tiles";
/** Kapsayıcı sınıfı */
export const themeClass = () => `vr-th-${roomTheme()}`;
