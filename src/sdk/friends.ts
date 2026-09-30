// Arkadaş listesi: arkadaşlar aynı yarışta Relative, Leaderboard, Live Timing ve haritada
// farklı renkle (ve istenirse simge/fotoğrafla) gösterilir.
// Eşleşme önce iRacing üye numarasıyla (CustID), yoksa tam adla yapılır.

import { createMemo } from "solid-js";
import { settings, updateSettings, type Friend } from "./settings";

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

// ---------------------------------------------------------------------------
// Hesap arkadaşları: kabul edilen her arkadaş otomatik olarak yerel listeye eklenir
// (renk, simge, fotoğraf, etiket burada arkadaşa özel ayarlanır); arkadaşlık bitince kalkar.
// ---------------------------------------------------------------------------

export interface CloudFriendLite {
  friend_id: string;
  display_name: string;
  iracing_name: string | null;
  status: string;
}

const nameOfCloud = (f: CloudFriendLite) => (f.iracing_name || f.display_name || "?").trim();

/** Sunucudan gelen arkadaş listesiyle yerel listeyi eşitler. Sadece başarılı bir okumadan sonra çağır. */
export function syncAccountFriends(cloud: CloudFriendLite[]) {
  const acc = cloud.filter((f) => f.status === "accepted");
  const ids = new Set(acc.map((f) => f.friend_id));
  const list = settings().friends.list;
  const seen = new Set<string>();
  const dup = list.some((x) => x.accountId && (seen.has(x.accountId) ? true : (seen.add(x.accountId), false)));
  const stale = list.some((x) => x.accountId && !ids.has(x.accountId));
  const missing = acc.some((f) => {
    const e = list.find((x) => x.accountId === f.friend_id);
    return !e || (e.autoName && e.name !== nameOfCloud(f));
  });
  if (!dup && !stale && !missing) return;
  updateSettings((d) => {
    const have = new Set<string>();
    d.friends.list = d.friends.list.filter((x) => {
      if (!x.accountId) return true;
      if (!ids.has(x.accountId) || have.has(x.accountId)) return false;
      have.add(x.accountId);
      return true;
    });
    for (const f of acc) {
      const e = d.friends.list.find((x) => x.accountId === f.friend_id);
      if (!e) {
        d.friends.list.unshift({
          id: Math.random().toString(36).slice(2, 9),
          name: nameOfCloud(f),
          userId: 0,
          color: "",
          icon: "",
          photo: "",
          note: "",
          accountId: f.friend_id,
          autoName: true,
        });
      } else if (e.autoName && e.name !== nameOfCloud(f)) e.name = nameOfCloud(f);
    }
  });
}
