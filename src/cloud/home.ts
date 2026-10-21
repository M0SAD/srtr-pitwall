// Ana sayfa (c128): yöneticinin yazdığı haberler ve sayfanın en üstündeki reklamlar.
// Herkes yayındaki haberleri / etkin reklamları okur (giriş yapmadan da); yalnızca yönetici yazar.
// Görseller herkese açık 'site' kovasına (home/…) yüklenir.

import { api, publicUrl, storageUpload } from "./supabase";

export interface HomeLink {
  label: string;
  url: string;
}
export interface HomePost {
  id: string;
  title: string;
  body: string;
  image: string;
  links: HomeLink[];
  pinned: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
}
export type HomePostInput = Omit<HomePost, "id" | "created_at" | "updated_at">;

export interface HomeBanner {
  id: string;
  image: string;
  url: string;
  title: string;
  active: boolean;
  show_pro: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort: number;
  views: number;
  clicks: number;
  created_at: string;
}
export type HomeBannerInput = Pick<HomeBanner, "image" | "url" | "title" | "active" | "show_pro" | "starts_at" | "ends_at" | "sort">;

const enc = encodeURIComponent;

/** Haberler: sabitlenenler önce, sonra yeniden eskiye. Yönetici taslakları da görür (RLS). */
export const homePosts = () =>
  api<HomePost[]>("GET", "home_posts?select=*&order=pinned.desc,created_at.desc&limit=100", { auth: "optional" }).then((r) => r ?? []);
export const homePostAdd = (p: HomePostInput) => api("POST", "home_posts", { body: p, prefer: "return=minimal" });
export const homePostSave = (id: string, p: Partial<HomePostInput>) => api("PATCH", `home_posts?id=eq.${enc(id)}`, { body: p, prefer: "return=minimal" });
export const homePostDelete = (id: string) => api("DELETE", `home_posts?id=eq.${enc(id)}`);

/** Reklamlar (yönetici hepsini, diğerleri etkin olanları görür; tarih ve PRO süzgeci istemcide) */
export const homeBanners = () =>
  api<HomeBanner[]>("GET", "home_banners?select=*&order=sort.asc,created_at.desc&limit=100", { auth: "optional" }).then((r) => r ?? []);
export const homeBannerAdd = (b: HomeBannerInput) => api("POST", "home_banners", { body: b, prefer: "return=minimal" });
export const homeBannerSave = (id: string, b: Partial<HomeBannerInput>) => api("PATCH", `home_banners?id=eq.${enc(id)}`, { body: b, prefer: "return=minimal" });
export const homeBannerDelete = (id: string) => api("DELETE", `home_banners?id=eq.${enc(id)}`);
export const homeBannerHit = (id: string, click = false) =>
  api("POST", "rpc/home_banner_hit", { body: { p_id: id, p_click: click }, auth: "optional" }).catch(() => {});

/** Şu an gösterilebilecek reklamlar (etkin, tarih aralığında; PRO üyeye yalnızca "PRO'ya da göster" olanlar) */
export function liveBanners(list: HomeBanner[], pro: boolean, now = Date.now()) {
  return list.filter(
    (b) =>
      b.active &&
      (!b.starts_at || new Date(b.starts_at).getTime() <= now) &&
      (!b.ends_at || new Date(b.ends_at).getTime() > now) &&
      (!pro || b.show_pro),
  );
}

const MAX_W = 1600;
const MAX_BYTES = 4 * 1024 * 1024;

/** Görseli küçültüp (en çok 1600 px genişlik, JPEG) 'site' kovasına yükler; GIF olduğu gibi (hareket kalsın). Herkese açık adresi döner. */
export async function uploadHomeImage(f: File, folder: "posts" | "banners"): Promise<string> {
  if (!/^image\/(gif|png|webp|jpeg)$/.test(f.type)) throw new Error("Sadece GIF, PNG, WebP ya da JPEG yüklenebilir");
  let body: Blob = f;
  let type = f.type;
  let ext = f.type === "image/gif" ? "gif" : "jpg";
  if (f.type !== "image/gif") {
    body = await shrink(f);
    type = "image/jpeg";
    ext = "jpg";
  }
  if (body.size > MAX_BYTES) throw new Error("Görsel en fazla 4 MB olabilir");
  const path = `home/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await storageUpload("site", path, body, type, false);
  return publicUrl("site", path);
}

async function shrink(f: File): Promise<Blob> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Görsel açılamadı"));
      img.src = url;
    });
    const w = Math.min(MAX_W, img.width);
    const h = Math.round((img.height / img.width) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    // Saydam PNG'ler siyah zemine düşmesin
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Görsel dönüştürülemedi"))), "image/jpeg", 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bağlantı adresi geçerli mi (https / http) */
export const okUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u.trim());
