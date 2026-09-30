// Toplulukta paylaşılan ekran görüntüleri: görseller Supabase Storage'da ("screenshots" kovası),
// bilgileri, puanları ve yorumları veritabanında.

import { invoke } from "@tauri-apps/api/core";
import { api, publicUrl, session, storageRemove, storageUpload } from "./supabase";
import { config } from "./account";

export const SHOT_BUCKET = "screenshots";

export interface SharedShot {
  id: string;
  user_id: string;
  title: string;
  description: string;
  path: string;
  thumb_path: string;
  width: number;
  height: number;
  bytes: number;
  track: string;
  car: string;
  rating_avg: number;
  rating_count: number;
  comment_count: number;
  created_at: string;
  author_name: string;
  author_iracing: string | null;
  views?: number;
  edited_at?: string | null;
}

export interface ShotComment {
  id: string;
  screenshot_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  edited_at?: string | null;
}

export type ShotSort = "new" | "top" | "comments";

export const shotUrl = (s: Pick<SharedShot, "path">) => publicUrl(SHOT_BUCKET, s.path);
export const shotThumbUrl = (s: Pick<SharedShot, "thumb_path">) => publicUrl(SHOT_BUCKET, s.thumb_path);

function enc(s: string) {
  return encodeURIComponent(s.replace(/[(),*]/g, " ").trim());
}

export async function searchShots(q: string, sort: ShotSort, offset = 0) {
  const order = sort === "top" ? "rating_avg.desc,rating_count.desc,created_at.desc" : sort === "comments" ? "comment_count.desc,created_at.desc" : "created_at.desc";
  let path = `shot_list?select=*&order=${order}&limit=30&offset=${offset}`;
  if (q.trim()) {
    const t = enc(q);
    path += `&or=(title.ilike.*${t}*,author_name.ilike.*${t}*,track.ilike.*${t}*,car.ilike.*${t}*)`;
  }
  return api<SharedShot[]>("GET", path, { auth: "optional" });
}

export async function myShots() {
  const uid = session()?.user.id;
  if (!uid) return [];
  return api<SharedShot[]>("GET", `shot_list?select=*&user_id=eq.${uid}&order=created_at.desc`);
}

/** Paylaşım ayarları (yönetici belirler) */
export function shotLimits() {
  const c = config();
  return {
    enabled: c?.shots_enabled ?? true,
    maxWidth: c?.shot_max_width ?? 1920,
    quality: c?.shot_quality ?? 85,
    daily: c?.shot_daily_limit ?? 20,
  };
}

/** Paylaşılacak görüntüyü hazırlar: küçültülmüş, filigranlı JPEG */
export function encodeForShare(path: string, maxW: number, quality: number) {
  return invoke<ArrayBuffer>("shot_encode", { path, maxW, quality, watermark: true });
}

async function dims(buf: ArrayBuffer) {
  try {
    const bmp = await createImageBitmap(new Blob([buf], { type: "image/jpeg" }));
    const d = { w: bmp.width, h: bmp.height };
    bmp.close();
    return d;
  } catch {
    return { w: 0, h: 0 };
  }
}

/** Yerel görüntüyü yükler ve toplulukta paylaşır */
export async function shareShot(v: { path: string; title: string; description: string; track: string; car: string }) {
  const uid = session()?.user.id;
  if (!uid) throw new Error("Bu işlem için giriş yapmalısın");
  const lim = shotLimits();
  if (!lim.enabled) throw new Error("Ekran görüntüsü paylaşımı şu an kapalı");
  const full = await encodeForShare(v.path, lim.maxWidth, lim.quality);
  const thumb = await encodeForShare(v.path, 640, 78);
  const d = await dims(full);
  const id = crypto.randomUUID();
  const path = `${uid}/${id}.jpg`;
  const thumb_path = `${uid}/${id}_t.jpg`;
  await storageUpload(SHOT_BUCKET, path, full, "image/jpeg");
  try {
    await storageUpload(SHOT_BUCKET, thumb_path, thumb, "image/jpeg");
    const rows = await api<SharedShot[]>("POST", "screenshots", {
      body: {
        id,
        title: v.title.slice(0, 80),
        description: v.description.slice(0, 1000),
        path,
        thumb_path,
        width: d.w,
        height: d.h,
        bytes: full.byteLength + thumb.byteLength,
        track: v.track.slice(0, 120),
        car: v.car.slice(0, 120),
      },
      prefer: "return=representation",
    });
    return rows?.[0];
  } catch (e) {
    // Kayıt eklenemediyse yüklenen dosyaları geri al
    await storageRemove(SHOT_BUCKET, [path, thumb_path]).catch(() => {});
    throw e;
  }
}

export async function deleteShot(s: Pick<SharedShot, "id" | "path" | "thumb_path">) {
  await storageRemove(SHOT_BUCKET, [s.path, s.thumb_path]).catch(() => {});
  await api("DELETE", `screenshots?id=eq.${s.id}`);
}

export async function updateShot(id: string, patch: { title?: string; description?: string }) {
  await api("PATCH", `screenshots?id=eq.${id}`, { body: patch, prefer: "return=minimal" });
}

export async function myShotRating(id: string): Promise<number> {
  const uid = session()?.user.id;
  if (!uid) return 0;
  const rows = await api<{ stars: number }[]>("GET", `screenshot_ratings?screenshot_id=eq.${id}&user_id=eq.${uid}&select=stars`);
  return rows?.[0]?.stars ?? 0;
}

export function rateShot(id: string, stars: number) {
  return api("POST", "screenshot_ratings?on_conflict=screenshot_id,user_id", {
    body: { screenshot_id: id, user_id: session()?.user.id, stars },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export function shotComments(id: string) {
  return api<ShotComment[]>("GET", `shot_comment_list?screenshot_id=eq.${id}&select=*&order=created_at.asc`, { auth: "optional" });
}

export function addShotComment(id: string, body: string) {
  return api("POST", "screenshot_comments", { body: { screenshot_id: id, body }, prefer: "return=minimal" });
}

export function deleteShotComment(id: string) {
  return api("DELETE", `screenshot_comments?id=eq.${id}`);
}

export function editShotComment(id: string, body: string) {
  return api("PATCH", `screenshot_comments?id=eq.${id}`, { body: { body: body.slice(0, 1000) }, prefer: "return=minimal" });
}

/** Görüntü açıldı (6 ay açılmayan görseller silinir) */
export function shotViewed(id: string) {
  return api("POST", "rpc/shot_viewed", { body: { p_id: id }, auth: "optional" }).catch(() => {});
}

export async function getShot(id: string) {
  const rows = await api<SharedShot[]>("GET", `shot_list?select=*&id=eq.${id}`, { auth: "optional" });
  return rows?.[0] ?? null;
}
