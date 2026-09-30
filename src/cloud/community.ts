// Topluluk ana sayfası (en çok görüntülenen / kullanılan / puan alan / yorum alan) ve tema paylaşımı.

import { api, session } from "./supabase";
import type { SharedShot } from "./shots";
import type { LayoutSummary } from "./layouts";
import type { Theme } from "@/sdk/theme";

export type Period = "month" | "all";

export interface CommunityStats {
  shots: number;
  layouts: number;
  streams: number;
  themes: number;
  comments: number;
  ratings: number;
  downloads: number;
  views: number;
  members: number;
}

export const communityStats = () => api<CommunityStats>("POST", "rpc/community_stats", { body: {} });

function since(p: Period) {
  if (p === "all") return "";
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return `&created_at=gte.${start.toISOString()}`;
}

export function topShots(p: Period, by: "views" | "rating" | "comments", limit = 8) {
  const order =
    by === "views" ? "views.desc,created_at.desc" : by === "rating" ? "rating_avg.desc,rating_count.desc" : "comment_count.desc,created_at.desc";
  const extra = by === "rating" ? "&rating_count=gt.0" : by === "comments" ? "&comment_count=gt.0" : "";
  return api<SharedShot[]>("GET", `shot_list?select=*&order=${order}&limit=${limit}${since(p)}${extra}`);
}

export type LayoutTop = LayoutSummary & { comment_count?: number };

export function topLayouts(p: Period, by: "downloads" | "rating" | "comments", kind?: "layout" | "stream", limit = 8) {
  const order =
    by === "downloads" ? "downloads.desc,created_at.desc" : by === "rating" ? "rating_avg.desc,rating_count.desc" : "comment_count.desc,created_at.desc";
  const extra = by === "rating" ? "&rating_count=gt.0" : by === "comments" ? "&comment_count=gt.0" : "";
  const k = kind ? `&kind=eq.${kind}` : "";
  return api<LayoutTop[]>("GET", `layout_list?select=*&order=${order}&limit=${limit}${since(p)}${extra}${k}`);
}

// ---------------------------------------------------------------------------
// Temalar
// ---------------------------------------------------------------------------

export interface SharedTheme {
  id: string;
  user_id: string;
  name: string;
  description: string;
  theme: Theme;
  downloads: number;
  created_at: string;
  author_name: string;
}

export type ThemeSort = "new" | "downloads";

export function searchThemes(q: string, sort: ThemeSort, p?: Period, limit = 48) {
  const order = sort === "downloads" ? "downloads.desc,created_at.desc" : "created_at.desc";
  let path = `theme_list?select=*&order=${order}&limit=${limit}${p ? since(p) : ""}`;
  if (q.trim()) {
    const t = encodeURIComponent(q.replace(/[(),*]/g, " ").trim());
    path += `&or=(name.ilike.*${t}*,author_name.ilike.*${t}*)`;
  }
  return api<SharedTheme[]>("GET", path);
}

export function myThemes() {
  const uid = session()?.user.id;
  if (!uid) return Promise.resolve([] as SharedTheme[]);
  return api<SharedTheme[]>("GET", `theme_list?select=*&user_id=eq.${uid}&order=created_at.desc`);
}

export const shareTheme = (v: { name: string; description: string; theme: Theme }) =>
  api("POST", "shared_themes", { body: v, prefer: "return=minimal" });
export const deleteTheme = (id: string) => api("DELETE", `shared_themes?id=eq.${id}`);
export const themeDownloaded = (id: string) => api("POST", "rpc/theme_downloaded", { body: { p_id: id } }).catch(() => {});
