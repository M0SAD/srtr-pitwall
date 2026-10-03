// Topluluk ana sayfası (en çok görüntülenen / kullanılan / puan alan / yorum alan) ve tema paylaşımı.

import { api, session } from "./supabase";
import type { SharedShot } from "./shots";
import type { LayoutSummary } from "./layouts";
import type { Theme } from "@/sdk/theme";

export type Period = "week" | "month" | "year" | "all";

export interface CommunityStats {
  shots: number;
  layouts: number;
  streams: number;
  themes: number;
  /** Direksiyon ekranı tasarımları (c66 öncesi sunucuda yok) */
  dashes?: number;
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
  const start =
    p === "week"
      ? new Date(Date.now() - 7 * 86400_000)
      : p === "year"
        ? new Date(d.getFullYear(), 0, 1)
        : new Date(d.getFullYear(), d.getMonth(), 1);
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

export type ThemeSortX = ThemeSort | "old" | "name";

export interface ThemeFilter {
  q?: string;
  author?: string;
  sort: ThemeSortX;
  days?: number;
  font?: string;
  density?: "" | "compact" | "normal" | "comfortable";
  corners?: "" | "sharp" | "round";
  border?: "" | "yes" | "no";
  shadow?: "" | "yes" | "no";
  minDownloads?: number;
  userId?: string;
  ids?: string[];
}

export function queryThemes(f: ThemeFilter, offset = 0, limit = 36) {
  if (f.ids && f.ids.length === 0) return Promise.resolve([] as SharedTheme[]);
  const order = f.sort === "downloads" ? "downloads.desc,created_at.desc" : f.sort === "old" ? "created_at.asc" : f.sort === "name" ? "name.asc" : "created_at.desc";
  let path = `theme_list?select=*&order=${order}&limit=${limit}&offset=${offset}`;
  const e = (s: string) => encodeURIComponent(s.replace(/[(),*"\\]/g, " ").trim());
  const groups: string[] = [];
  if (f.q?.trim()) groups.push(`name.ilike.*${e(f.q)}*,description.ilike.*${e(f.q)}*,author_name.ilike.*${e(f.q)}*`);
  if (f.author?.trim()) groups.push(`author_name.ilike.*${e(f.author)}*`);
  if (groups.length === 1) path += `&or=(${groups[0]})`;
  else if (groups.length > 1) path += `&and=(${groups.map((g) => `or(${g})`).join(",")})`;
  if (f.days) path += `&created_at=gte.${new Date(Date.now() - f.days * 86400_000).toISOString()}`;
  if (f.font) path += `&theme->>font=eq.${encodeURIComponent(f.font)}`;
  if (f.density) path += `&theme->>density=eq.${f.density}`;
  if (f.corners === "sharp") path += "&theme->>radius=eq.0";
  else if (f.corners === "round") path += "&theme->>radius=neq.0";
  if (f.border) path += `&theme->>border=eq.${f.border === "yes"}`;
  if (f.shadow) path += `&theme->>textShadow=eq.${f.shadow === "yes"}`;
  if (f.minDownloads) path += `&downloads=gte.${Math.floor(f.minDownloads)}`;
  if (f.userId) path += `&user_id=eq.${f.userId}`;
  if (f.ids) path += `&id=in.(${f.ids.map(encodeURIComponent).join(",")})`;
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
