// Topluluk › Direksiyon Ekranları: Dashboard Tasarımcısı'nda yapılan tasarımların paylaşımı, puanlar ve yorumlar.
// Sunucu: supabase/c66_guncelleme.sql (shared_dashes, dash_ratings, dash_comments, dash_list, dash_comment_list).

import { api, session } from "./supabase";
import { likeTerm, logicParams, sinceDays, type Comment } from "./layouts";
import { sanitizeDash, type CustomDash } from "@/dash/model";

export interface DashSummary {
  id: string;
  user_id: string;
  title: string;
  description: string;
  /** Tasarımın kendisi (CustomDash JSON'u); kartlardaki canlı önizleme bununla çizilir */
  data: unknown;
  width: number;
  height: number;
  page_count: number;
  widget_count: number;
  downloads: number;
  rating_avg: number;
  rating_count: number;
  comment_count: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_iracing: string | null;
}

export type DashComment = Omit<Comment, "layout_id"> & { dash_id: string };
export type DashSort = "new" | "top" | "downloads" | "comments" | "updated" | "old" | "title";
export type DashPeriod = "week" | "month" | "year" | "all";

/** Paylaşılan verinin üst sınırı (sunucu da denetler: 200 KB) */
export const MAX_DASH_BYTES = 200_000;

export interface DashFilter {
  q?: string;
  author?: string;
  sort: DashSort;
  days?: number;
  minRating?: number;
  userId?: string;
  ids?: string[];
}

const ORDER: Record<DashSort, string> = {
  new: "created_at.desc",
  old: "created_at.asc",
  top: "rating_avg.desc,rating_count.desc,created_at.desc",
  downloads: "downloads.desc,created_at.desc",
  comments: "comment_count.desc,created_at.desc",
  updated: "updated_at.desc",
  title: "title.asc",
};

export function queryDashes(f: DashFilter, offset = 0, limit = 24) {
  if (f.ids && f.ids.length === 0) return Promise.resolve([] as DashSummary[]);
  let path = `dash_list?select=*&order=${ORDER[f.sort] ?? ORDER.new}&limit=${limit}&offset=${offset}`;
  const groups: string[] = [];
  if (f.q?.trim()) {
    const t = likeTerm(f.q);
    groups.push(`title.ilike.*${t}*,description.ilike.*${t}*,author_name.ilike.*${t}*,author_iracing.ilike.*${t}*`);
  }
  if (f.author?.trim()) {
    const t = likeTerm(f.author);
    groups.push(`author_name.ilike.*${t}*,author_iracing.ilike.*${t}*`);
  }
  path += logicParams(groups);
  path += sinceDays(f.days);
  if (f.minRating) path += `&rating_avg=gte.${f.minRating}&rating_count=gt.0`;
  if (f.userId) path += `&user_id=eq.${f.userId}`;
  if (f.ids) path += `&id=in.(${f.ids.join(",")})`;
  return api<DashSummary[]>("GET", path);
}

/** Topluluk ana sayfası: dönemin öne çıkanları */
export function topDashes(p: DashPeriod, by: "downloads" | "rating" | "comments", limit = 8) {
  const order = by === "downloads" ? ORDER.downloads : by === "rating" ? ORDER.top : ORDER.comments;
  const extra = by === "rating" ? "&rating_count=gt.0" : by === "comments" ? "&comment_count=gt.0" : "";
  const d = new Date();
  const start = p === "week" ? new Date(Date.now() - 7 * 86400_000) : p === "year" ? new Date(d.getFullYear(), 0, 1) : new Date(d.getFullYear(), d.getMonth(), 1);
  const since = p === "all" ? "" : `&created_at=gte.${start.toISOString()}`;
  return api<DashSummary[]>("GET", `dash_list?select=*&order=${order}&limit=${limit}${since}${extra}`);
}

export async function myRatedDashIds() {
  const uid = session()?.user.id;
  if (!uid) return [] as string[];
  const rows = await api<{ dash_id: string }[]>("GET", `dash_ratings?user_id=eq.${uid}&select=dash_id&limit=300`);
  return (rows ?? []).map((r) => r.dash_id);
}

export async function myDashes() {
  const uid = session()?.user.id;
  if (!uid) return [] as DashSummary[];
  return (await api<DashSummary[]>("GET", `dash_list?select=*&user_id=eq.${uid}&order=created_at.desc`)) ?? [];
}

/** Paylaşıma girecek veri: yerel işaretler (paylaşım kimliği) çıkarılır */
export function dashPayload(d: CustomDash): CustomDash {
  const c = structuredClone(d);
  delete c.sharedId;
  return c;
}

/** Paylaşılan veriden güvenli tasarım (bozuksa null) */
export function dashOf(row: { data: unknown }): CustomDash | null {
  const d = sanitizeDash(row.data);
  if (d) delete d.sharedId;
  return d;
}

function body(v: { title: string; description: string; dash: CustomDash }) {
  const data = dashPayload(v.dash);
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_DASH_BYTES)
    throw new Error("Tasarım paylaşmak için çok büyük (en fazla 200 KB). Resim bileşenlerini küçült ya da kaldır.");
  return {
    title: v.title.trim().slice(0, 60),
    description: v.description.trim().slice(0, 1000),
    data,
  };
}

export async function shareDash(v: { title: string; description: string; dash: CustomDash }) {
  const rows = await api<{ id: string }[]>("POST", "shared_dashes?select=id", { body: body(v), prefer: "return=representation" });
  return rows?.[0];
}

/** Önceki paylaşımı yerinde günceller: kimlik, puanlar, indirme sayısı ve yorumlar korunur (sayaçları protect_dash korur) */
export async function updateSharedDash(id: string, v: { title: string; description: string; dash: CustomDash }) {
  const rows = await api<{ id: string }[]>("PATCH", `shared_dashes?id=eq.${encodeURIComponent(id)}&select=id`, { body: body(v), prefer: "return=representation" });
  if (!rows?.[0]) throw new Error("Önceki paylaşım bulunamadı");
  return rows[0];
}

/** Bu tasarımın daha önce yaptığım paylaşımı: önce kayıtlı kimlikle (CustomDash.sharedId), yoksa aynı başlıkla */
export async function findMyDashShare(sharedId: string | undefined, title: string): Promise<DashSummary | null> {
  const uid = session()?.user.id;
  if (!uid) return null;
  if (sharedId && /^[0-9a-f-]{36}$/i.test(sharedId)) {
    const rows = await api<DashSummary[]>("GET", `dash_list?select=*&id=eq.${sharedId}&user_id=eq.${uid}&limit=1`).catch(() => null);
    if (rows?.[0]) return rows[0];
  }
  const name = title.trim().toLocaleLowerCase();
  if (!name) return null;
  const mine = await myDashes().catch(() => [] as DashSummary[]);
  return mine.find((l) => l.title.trim().toLocaleLowerCase() === name) ?? null;
}

export const deleteDash = (id: string) => api("DELETE", `shared_dashes?id=eq.${id}`);
export const dashDownloaded = (id: string) => api("POST", "rpc/dash_downloaded", { body: { p_id: id } }).catch(() => {});
/** Moderasyon: paylaşımı gizle / yeniden göster (layouts.delete izni) */
export const setDashHidden = (id: string, hidden: boolean) => api("POST", "rpc/dash_set_hidden", { body: { p_id: id, p_hidden: hidden } });

export async function myDashRating(id: string): Promise<number> {
  const uid = session()?.user.id;
  if (!uid) return 0;
  const rows = await api<{ stars: number }[]>("GET", `dash_ratings?dash_id=eq.${id}&user_id=eq.${uid}&select=stars`);
  return rows?.[0]?.stars ?? 0;
}

export function rateDash(id: string, stars: number) {
  return api("POST", "dash_ratings?on_conflict=dash_id,user_id", {
    body: { dash_id: id, user_id: session()?.user.id, stars },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export const dashComments = (id: string) => api<DashComment[]>("GET", `dash_comment_list?dash_id=eq.${id}&select=*&order=created_at.asc`);
export const addDashComment = (id: string, text: string) => api("POST", "dash_comments", { body: { dash_id: id, body: text.slice(0, 1000) }, prefer: "return=minimal" });
export const deleteDashComment = (id: string) => api("DELETE", `dash_comments?id=eq.${id}`);
export const editDashComment = (id: string, text: string) => api("PATCH", `dash_comments?id=eq.${id}`, { body: { body: text.slice(0, 1000) }, prefer: "return=minimal" });
