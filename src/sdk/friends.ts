// Arkadaş listesi: arkadaşlar aynı yarışta Relative, Leaderboard, Live Timing ve haritada
// farklı renkle (ve istenirse simge/fotoğrafla) gösterilir.
// Eşleşme önce iRacing üye numarasıyla (CustID), yoksa tam adla yapılır.

import { createMemo } from "solid-js";
import { settings, type Friend } from "./settings";

export type FriendPlace = "relative" | "standings" | "timing" | "map";

function normName(s: string) {
  return s.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

const index = createMemo(() => {
  const f = settings().friends;
  const byId = new Map<number, Friend>();
  const byName = new Map<string, Friend>();
  if (f.enabled) {
    for (const x of f.list) {
      if (x.userId > 0) byId.set(x.userId, x);
      if (x.name) byName.set(normName(x.name), x);
    }
  }
  return { byId, byName };
});

/** Satırdaki sürücü arkadaş mı? */
export function friendOf(userId: number | undefined, name: string | undefined): Friend | null {
  const ix = index();
  if (userId && ix.byId.has(userId)) return ix.byId.get(userId)!;
  if (name) return ix.byName.get(normName(name)) ?? null;
  return null;
}

export function friendColor(f: Friend) {
  return f.color || settings().friends.color;
}

/** Arkadaş vurgusu bu yerde açık mı? */
export function friendsOn(place: FriendPlace) {
  const f = settings().friends;
  return f.enabled && f.where[place];
}

/** Satır arka planı (arkadaş değilse boş) */
export function friendRowStyle(place: FriendPlace, userId: number | undefined, name: string | undefined) {
  if (!friendsOn(place)) return undefined;
  const f = friendOf(userId, name);
  if (!f) return undefined;
  const c = friendColor(f);
  const a = settings().friends.strength;
  return {
    background: `color-mix(in srgb, ${c} ${a}%, transparent)`,
    "box-shadow": `inset 3px 0 0 ${c}`,
  } as Record<string, string>;
}

/** Fotoğrafı küçültüp data URL'ye çevirir (ayar dosyası küçük kalsın). */
export function resizePhoto(file: File, size = 96): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d")!;
      // Ortadan kare kırp
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Resim okunamadı"));
    };
    img.src = url;
  });
}
