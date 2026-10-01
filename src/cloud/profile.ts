// Herkese açık profil (sunucu c31): profil fotoğrafı ("avatars" kovası), kısa tanıtım, sosyal bağlantılar,
// sim adları ve takımlar. Fotoğraflar arkadaş listesinde, sohbet başlığında, açılır pencerede ve profillerde görünür;
// arkadaşa özel PRO fotoğraf (Arkadaşlar sayfasındaki görünüm) her zaman önceliklidir (bkz. social.ts friendLook).

import { createSignal } from "solid-js";
import { api, cloudEnabled, publicUrl, session, storageRemove, storageUpload } from "./supabase";
import { F, assertFeature } from "@/sdk/proFeatures";

export const AVATAR_BUCKET = "avatars";

export type SocialType = "youtube" | "twitch" | "kick" | "instagram" | "x" | "tiktok" | "facebook" | "discord" | "steam" | "website" | "other";

export interface SocialLink {
  type: SocialType;
  url: string;
}

/** Bağlantı türleri: ad, marka rengi, örnek adres (düzenleme ekranında ipucu) */
export const SOCIAL_TYPES: { id: SocialType; label: string; color: string; hint: string }[] = [
  { id: "youtube", label: "YouTube", color: "#ff3b3b", hint: "https://www.youtube.com/@kanal" },
  { id: "twitch", label: "Twitch", color: "#a970ff", hint: "https://www.twitch.tv/kanal" },
  { id: "kick", label: "Kick", color: "#53fc19", hint: "https://kick.com/kanal" },
  { id: "instagram", label: "Instagram", color: "#ff4f8b", hint: "https://www.instagram.com/kullanici" },
  { id: "x", label: "X (Twitter)", color: "#e7e9ea", hint: "https://x.com/kullanici" },
  { id: "tiktok", label: "TikTok", color: "#25f4ee", hint: "https://www.tiktok.com/@kullanici" },
  { id: "facebook", label: "Facebook", color: "#4d8dff", hint: "https://www.facebook.com/kullanici" },
  { id: "discord", label: "Discord", color: "#7d87ff", hint: "https://discord.gg/davet" },
  { id: "steam", label: "Steam", color: "#9fb8d0", hint: "https://steamcommunity.com/id/kullanici" },
  { id: "website", label: "İnternet sitesi", color: "#ffb35c", hint: "https://site.com" },
  { id: "other", label: "Diğer", color: "#a4adbd", hint: "https://" },
];
export const socialMeta = (t: string) => SOCIAL_TYPES.find((x) => x.id === t) ?? SOCIAL_TYPES[SOCIAL_TYPES.length - 1];

export const MAX_SOCIALS = 10;
export const MAX_BIO = 300;

/** Adres türüne uygun mu (sunucu da denetler): sadece https, en çok 200 karakter */
export function socialUrlOk(url: string) {
  return /^https:\/\/[^/\s?#.][^\s]*$/i.test(url.trim()) && url.trim().length <= 200;
}

/** Adresten türü tahmin et (yapıştırınca tür kendiliğinden seçilsin) */
export function guessSocialType(url: string): SocialType | null {
  const h = (() => {
    try {
      return new URL(url.trim()).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!h) return null;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) return "youtube";
  if (/(^|\.)twitch\.tv$/.test(h)) return "twitch";
  if (/(^|\.)kick\.com$/.test(h)) return "kick";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(x|twitter)\.com$/.test(h)) return "x";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)(facebook|fb)\.com$/.test(h)) return "facebook";
  if (/(^|\.)discord\.(gg|com)$/.test(h)) return "discord";
  if (/(^|\.)steam(community|powered)\.com$/.test(h)) return "steam";
  return null;
}

export interface PublicProfile {
  id: string;
  display_name: string;
  avatar_path: string | null;
  iracing_name: string | null;
  bio: string;
  socials: SocialLink[];
  is_pro: boolean;
  created_at: string;
  is_me: boolean;
  friend: "pending_out" | "pending_in" | "accepted" | null;
  sims: { sim: string; sim_name: string }[];
  teams: { id: string; name: string; tag: string; color: string; logo_path: string; role: string }[];
}

export const publicProfile = (id: string) =>
  api<PublicProfile | null>("POST", "rpc/public_profile", { body: { p_user: id }, auth: "optional" }).then((p) => {
    if (p) noteAvatar(p.id, p.avatar_path);
    return p;
  });

export const avatarUrl = (path: string | null | undefined) => (path ? publicUrl(AVATAR_BUCKET, path) : "");

// ---------------------------------------------------------------------------
// Fotoğraf önbelleği: kullanıcı id → fotoğraf adresi ("" = fotoğrafı yok). Arkadaş listesi, profil ve
// takım üyeleri doldurur; avatarı gösteren her yer (friendLook) buradan okur ve güncellenince yeniden çizer.
// ---------------------------------------------------------------------------
const [avatars, setAvatars] = createSignal<Record<string, string>>({});

/** Önbellekteki fotoğraf adresi ("" ya da undefined: yok / bilinmiyor) */
export const cachedAvatar = (id: string) => avatars()[id] || "";

export function noteAvatar(id: string, path: string | null | undefined) {
  if (!id || path === undefined) return;
  const url = avatarUrl(path);
  if (avatars()[id] === url) return;
  setAvatars({ ...avatars(), [id]: url });
}

export function noteAvatars(rows: { id: string; avatar_path?: string | null }[]) {
  const cur = avatars();
  let next: Record<string, string> | null = null;
  for (const r of rows) {
    if (!r.id || r.avatar_path === undefined) continue;
    const url = avatarUrl(r.avatar_path);
    if (cur[r.id] === url) continue;
    next ??= { ...cur };
    next[r.id] = url;
  }
  if (next) setAvatars(next);
}

const asked = new Set<string>();
/** Bilinmeyen kullanıcıların fotoğraflarını getir (takım üyeleri, arama sonuçları); sunucu c31 yoksa sessiz */
export async function loadAvatars(ids: string[]) {
  if (!cloudEnabled) return;
  const want = [...new Set(ids)].filter((id) => id && !asked.has(id) && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!want.length) return;
  want.forEach((id) => asked.add(id));
  try {
    const rows = await api<{ id: string; avatar_path: string | null }[]>("GET", `profiles?select=id,avatar_path&id=in.(${want.join(",")})`, {
      auth: "optional",
    });
    noteAvatars(rows ?? []);
  } catch {
    want.forEach((id) => asked.delete(id));
  }
}

// ---------------------------------------------------------------------------
// Kendi profilim: fotoğraf yükle / kaldır, tanıtım ve bağlantılar
// ---------------------------------------------------------------------------

/** Görseli ortadan kare kırpıp 256 px'e küçültür (WebP, olmazsa JPEG) */
async function squareImage(file: File, size = 256): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error("Bir görsel dosyası seç (JPEG, PNG ya da WebP)");
  if (file.size > 15 * 1024 * 1024) throw new Error("Görsel çok büyük (en çok 15 MB)");
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error("Görsel okunamadı");
  });
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  const s = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close();
  const enc = (type: string) => new Promise<Blob | null>((res) => c.toBlob(res, type, 0.88));
  const blob = (await enc("image/webp").then((b) => (b?.type === "image/webp" ? b : null))) ?? (await enc("image/jpeg"));
  if (!blob) throw new Error("Görsel okunamadı");
  if (blob.size > 1024 * 1024) throw new Error("Görsel 1 MB'tan büyük");
  return blob;
}

/** Fotoğrafı yükle ve profile işle; yeni yolu döner */
export async function uploadAvatar(file: File): Promise<string> {
  assertFeature(F.avatar, "Profil fotoğrafı yüklemek");
  const uid = session()?.user.id;
  if (!uid) throw new Error("Giriş yapmalısın");
  const blob = await squareImage(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  await storageUpload(AVATAR_BUCKET, path, blob, blob.type);
  let old: string | null = null;
  try {
    old = await api<string | null>("POST", "rpc/profile_set_avatar", { body: { p_path: path } });
  } catch (e) {
    void storageRemove(AVATAR_BUCKET, [path]).catch(() => {});
    throw e;
  }
  if (old && old.startsWith(`${uid}/`)) void storageRemove(AVATAR_BUCKET, [old]).catch(() => {});
  noteAvatar(uid, path);
  return path;
}

/** Fotoğrafı kaldır */
export async function removeAvatar() {
  const uid = session()?.user.id;
  if (!uid) throw new Error("Giriş yapmalısın");
  const old = await api<string | null>("POST", "rpc/profile_set_avatar", { body: { p_path: null } });
  if (old && old.startsWith(`${uid}/`)) void storageRemove(AVATAR_BUCKET, [old]).catch(() => {});
  noteAvatar(uid, null);
}

/** Tanıtım ve bağlantıları kaydet (sunucu doğrular ve temizlenmiş halini döner) */
export const savePublicProfile = (bio: string, socials: SocialLink[]) => {
  // Hepsini silmek her zaman serbest
  if (bio.trim() || socials.some((s) => s.url.trim())) assertFeature(F.profilePublic, "Profil tanıtımı ve bağlantılar");
  return api<{ bio: string; socials: SocialLink[] }>("POST", "rpc/profile_update_public", { body: { p_bio: bio, p_socials: socials } });
};
