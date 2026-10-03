// Düzen paylaşımı: kullanıcıların overlay yerleşimleri, puanlar ve yorumlar.

import { api, session } from "./supabase";
import { manifests } from "@/sdk/registry";
import type { Profile as LayoutProfile } from "@/sdk/settings";
import type { Theme } from "@/sdk/theme";

export interface LayoutBox {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutData {
  profile: LayoutProfile;
  theme?: Theme;
  boxes: LayoutBox[];
  /** Windows ölçekleme (kutular mantıksal piksel, ekran fiziksel piksel) */
  scale?: number;
  appVersion?: string;
}

export interface LayoutSummary {
  id: string;
  user_id: string;
  title: string;
  description: string;
  screen_w: number;
  screen_h: number;
  cars: string[];
  overlay_count: number;
  downloads: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  author_name: string;
  author_iracing: string | null;
  boxes: LayoutBox[] | null;
  ui_scale: number;
  kind?: "layout" | "stream";
}

export interface Comment {
  id: string;
  layout_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  edited_at?: string | null;
}

export type Sort = "new" | "top" | "downloads";

/** Açık overlay'lerin kutuları (önizleme için) */
export function layoutBoxes(p: LayoutProfile): LayoutBox[] {
  const out: LayoutBox[] = [];
  for (const m of manifests) {
    const o = p.overlays[m.id];
    if (!o?.enabled) continue;
    const w = ((o.options?.width as number) || m.size.w) * (o.scale || 1);
    const h = ((o.options?.height as number) || m.size.h) * (o.scale || 1);
    out.push({ id: m.id, name: m.name, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(w), h: Math.round(h) });
  }
  return out;
}

function enc(s: string) {
  // PostgREST filtresi için: virgül ve parantez aramayı bozmasın
  return encodeURIComponent(s.replace(/[(),*]/g, " ").trim());
}

export async function searchLayouts(q: string, sort: Sort, resolution: string, offset = 0, kind: "layout" | "stream" = "layout") {
  const order = sort === "top" ? "rating_avg.desc,rating_count.desc" : sort === "downloads" ? "downloads.desc" : "created_at.desc";
  let path = `layout_list?select=*&kind=eq.${kind}&order=${order}&limit=24&offset=${offset}`;
  if (q.trim()) {
    const t = enc(q);
    path += `&or=(title.ilike.*${t}*,author_name.ilike.*${t}*,author_iracing.ilike.*${t}*)`;
  }
  if (resolution) {
    const [w, h] = resolution.split("x");
    path += `&screen_w=eq.${Number(w)}&screen_h=eq.${Number(h)}`;
  }
  return api<LayoutSummary[]>("GET", path, { auth: "optional" });
}

// ---------------------------------------------------------------------------
// Gelişmiş arama (topluluk filtreleri). Şema değişmez; yalnızca layout_list görünümünün sütunları.
// ---------------------------------------------------------------------------

export type LayoutSort = Sort | "old" | "comments" | "votes" | "overlays" | "updated" | "trend7" | "trend30" | "title";
export type Aspect = "" | "16:9" | "16:10" | "21:9" | "32:9" | "triple";
export type ResTier = "" | "1080" | "1440" | "4k";

/** En-boy oranı sınıflarına düşen bilinen çözünürlükler (PostgREST oran hesaplayamaz) */
export const ASPECT_RES: Record<Exclude<Aspect, "">, string[]> = {
  "16:9": ["1280x720", "1366x768", "1600x900", "1920x1080", "2560x1440", "3200x1800", "3840x2160", "5120x2880"],
  "16:10": ["1440x900", "1680x1050", "1920x1200", "2560x1600", "2880x1800", "3840x2400"],
  "21:9": ["2560x1080", "3440x1440", "3840x1600", "5120x2160"],
  "32:9": ["3840x1080", "5120x1440", "7680x2160"],
  triple: ["5760x1080", "5760x1200", "7680x1440", "10240x1440", "11520x2160"],
};

export interface LayoutFilter {
  kind: "layout" | "stream";
  q?: string;
  author?: string;
  sort: LayoutSort;
  /** Son N gün (0 = hepsi) */
  days?: number;
  res?: string;
  aspect?: Aspect;
  tier?: ResTier;
  car?: string;
  carMode?: "" | "specific" | "generic";
  ovMin?: number;
  ovMax?: number;
  minRating?: number;
  minDownloads?: number;
  hasComments?: boolean;
  userId?: string;
  /** Yalnızca bu kimlikler (ör. puanladıklarım) */
  ids?: string[];
}

/** PostgREST mantık ağacı içindeki arama metni */
export function likeTerm(s: string) {
  return encodeURIComponent(s.replace(/[(),*"\\]/g, " ").replace(/\s+/g, " ").trim());
}

/** Birden çok or(...) grubunu tek parametrede birleştirir */
export function logicParams(groups: string[]) {
  if (!groups.length) return "";
  if (groups.length === 1) return `&or=(${groups[0]})`;
  return `&and=(${groups.map((g) => `or(${g})`).join(",")})`;
}

export function sinceDays(days?: number, col = "created_at") {
  if (!days) return "";
  return `&${col}=gte.${new Date(Date.now() - days * 86400_000).toISOString()}`;
}

export async function queryLayouts(f: LayoutFilter, offset = 0, limit = 24) {
  if (f.ids && f.ids.length === 0) return [] as LayoutSummary[];
  const order: Record<LayoutSort, string> = {
    new: "created_at.desc",
    old: "created_at.asc",
    top: "rating_avg.desc,rating_count.desc,created_at.desc",
    votes: "rating_count.desc,rating_avg.desc",
    downloads: "downloads.desc,created_at.desc",
    comments: "comment_count.desc,created_at.desc",
    overlays: "overlay_count.desc,created_at.desc",
    updated: "updated_at.desc",
    trend7: "downloads.desc,rating_avg.desc,comment_count.desc",
    trend30: "downloads.desc,rating_avg.desc,comment_count.desc",
    title: "title.asc",
  };
  let path = `layout_list?select=*&kind=eq.${f.kind}&order=${order[f.sort] ?? order.new}&limit=${limit}&offset=${offset}`;
  const groups: string[] = [];
  if (f.q?.trim()) {
    const t = likeTerm(f.q);
    groups.push(`title.ilike.*${t}*,description.ilike.*${t}*,author_name.ilike.*${t}*,author_iracing.ilike.*${t}*`);
  }
  if (f.author?.trim()) {
    const t = likeTerm(f.author);
    groups.push(`author_name.ilike.*${t}*,author_iracing.ilike.*${t}*`);
  }
  if (f.aspect) groups.push(ASPECT_RES[f.aspect].map((r) => `and(screen_w.eq.${r.split("x")[0]},screen_h.eq.${r.split("x")[1]})`).join(","));
  path += logicParams(groups);
  const trend = f.sort === "trend7" ? 7 : f.sort === "trend30" ? 30 : 0;
  const days = trend && f.days ? Math.min(trend, f.days) : trend || f.days;
  path += sinceDays(days);
  if (f.res) {
    const [w, h] = f.res.split("x");
    path += `&screen_w=eq.${Number(w)}&screen_h=eq.${Number(h)}`;
  }
  if (f.tier === "1080") path += "&screen_h=lte.1200";
  else if (f.tier === "1440") path += "&screen_h=gt.1200&screen_h=lt.2160";
  else if (f.tier === "4k") path += "&screen_h=gte.2160";
  if (f.car) path += `&cars=cs.${encodeURIComponent(`{"${f.car.replace(/["\\{}]/g, "")}"}`)}`;
  else if (f.carMode === "specific") path += "&cars=neq.%7B%7D";
  else if (f.carMode === "generic") path += "&cars=eq.%7B%7D";
  if (f.ovMin) path += `&overlay_count=gte.${Math.floor(f.ovMin)}`;
  if (f.ovMax) path += `&overlay_count=lte.${Math.floor(f.ovMax)}`;
  if (f.minRating) path += `&rating_avg=gte.${f.minRating}&rating_count=gt.0`;
  if (f.minDownloads) path += `&downloads=gte.${Math.floor(f.minDownloads)}`;
  if (f.hasComments) path += "&comment_count=gt.0";
  if (f.userId) path += `&user_id=eq.${f.userId}`;
  if (f.ids) path += `&id=in.(${f.ids.join(",")})`;
  return api<(LayoutSummary & { comment_count?: number; updated_at?: string })[]>("GET", path, { auth: "optional" });
}

/** Puan verdiğim düzenlerin kimlikleri */
export async function myRatedLayoutIds() {
  const uid = session()?.user.id;
  if (!uid) return [] as string[];
  const rows = await api<{ layout_id: string }[]>("GET", `layout_ratings?user_id=eq.${uid}&select=layout_id&limit=300`);
  return (rows ?? []).map((r) => r.layout_id);
}

/** Paylaşımlarda geçen araçlar (en sık kullanılan önce) */
export async function layoutCars(kind: "layout" | "stream") {
  const rows = await api<{ cars: string[] }[]>("GET", `layout_list?select=cars&kind=eq.${kind}&cars=neq.%7B%7D&limit=500`, { auth: "optional" });
  const n = new Map<string, number>();
  for (const r of rows ?? []) for (const c of r.cars ?? []) if (c.trim()) n.set(c.trim(), (n.get(c.trim()) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

export async function myLayouts(kind: "layout" | "stream" = "layout") {
  const uid = session()?.user.id;
  if (!uid) return [];
  return api<LayoutSummary[]>("GET", `layout_list?select=*&user_id=eq.${uid}&kind=eq.${kind}&order=created_at.desc`);
}

export async function getLayoutData(id: string) {
  const rows = await api<{ data: LayoutData }[]>("GET", `shared_layouts?id=eq.${id}&select=data`, { auth: "optional" });
  if (!rows?.[0]) throw new Error("Düzen bulunamadı");
  return rows[0].data;
}

export async function shareLayout(v: {
  title: string;
  description: string;
  screen_w: number;
  screen_h: number;
  cars: string[];
  kind: "layout" | "stream";
  data: LayoutData;
}) {
  const rows = await api<LayoutSummary[]>("POST", "shared_layouts", {
    body: { ...v, overlay_count: v.data.boxes.length },
    prefer: "return=representation",
  });
  return rows?.[0];
}

/**
 * Daha önce paylaştığım düzeni yerinde günceller: kimlik, puanlar, indirme sayısı ve yorumlar korunur
 * (satır düzeyi yetki: sadece sahibi güncelleyebilir; sayaçları protect_layout tetikleyicisi korur).
 */
export async function updateSharedLayout(
  id: string,
  v: { title: string; description: string; screen_w: number; screen_h: number; cars: string[]; data: LayoutData },
) {
  const rows = await api<LayoutSummary[]>("PATCH", `shared_layouts?id=eq.${encodeURIComponent(id)}`, {
    body: { ...v, overlay_count: v.data.boxes.length },
    prefer: "return=representation",
  });
  if (!rows?.[0]) throw new Error("Önceki paylaşım bulunamadı");
  return rows[0];
}

/**
 * Bu düzenin daha önce yaptığım paylaşımı: önce kayıtlı paylaşım kimliğiyle (Profile.sharedId), yoksa aynı
 * başlıklı kendi paylaşımımla eşleşir. Yoksa null.
 */
export async function findMyShare(kind: "layout" | "stream", sharedId: string | undefined, title: string): Promise<LayoutSummary | null> {
  const uid = session()?.user.id;
  if (!uid) return null;
  if (sharedId && /^[0-9a-f-]{36}$/i.test(sharedId)) {
    const rows = await api<LayoutSummary[]>("GET", `layout_list?select=*&id=eq.${sharedId}&user_id=eq.${uid}&kind=eq.${kind}&limit=1`).catch(() => null);
    if (rows?.[0]) return rows[0];
  }
  const name = title.trim().toLocaleLowerCase();
  if (!name) return null;
  const mine = await myLayouts(kind).catch(() => [] as LayoutSummary[]);
  return (mine ?? []).find((l) => l.title.trim().toLocaleLowerCase() === name) ?? null;
}

export function deleteLayout(id: string) {
  return api("DELETE", `shared_layouts?id=eq.${id}`);
}

export function markDownloaded(id: string) {
  return api("POST", "rpc/layout_downloaded", { body: { p_id: id }, auth: "optional" }).catch(() => {});
}

export async function myRating(id: string): Promise<number> {
  const uid = session()?.user.id;
  if (!uid) return 0;
  const rows = await api<{ stars: number }[]>("GET", `layout_ratings?layout_id=eq.${id}&user_id=eq.${uid}&select=stars`);
  return rows?.[0]?.stars ?? 0;
}

export function rate(id: string, stars: number) {
  return api("POST", "layout_ratings?on_conflict=layout_id,user_id", {
    body: { layout_id: id, user_id: session()?.user.id, stars },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export function comments(id: string) {
  return api<Comment[]>("GET", `comment_list?layout_id=eq.${id}&select=*&order=created_at.asc`, { auth: "optional" });
}

export function addComment(id: string, body: string) {
  return api("POST", "layout_comments", { body: { layout_id: id, body }, prefer: "return=minimal" });
}

export function deleteComment(id: string) {
  return api("DELETE", `layout_comments?id=eq.${id}`);
}

export function editComment(id: string, body: string) {
  return api("PATCH", `layout_comments?id=eq.${id}`, { body: { body: body.slice(0, 1000) }, prefer: "return=minimal" });
}
