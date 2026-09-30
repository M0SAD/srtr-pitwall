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
