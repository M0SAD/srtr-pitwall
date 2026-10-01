// Destek talepleri: üyeler konu açar (kategori, başlık, mesaj, en çok 4 görsel), yöneticiler yanıtlar.
// Görseller özel "support" kovasında <kullanıcı id>/<zaman>/<dosya> olarak durur; imzalı adresle gösterilir.

import { api, session, storageRemove, storageSignedUrls, storageUpload } from "./supabase";

export const SUPPORT_BUCKET = "support";
export const SUPPORT_MAX_IMAGES = 4;

export type SupportCategory = "bug" | "payment" | "account" | "feature" | "overlay" | "other";
export type SupportStatus = "open" | "answered" | "closed";

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string }[] = [
  { id: "bug", label: "Hata bildirimi" },
  { id: "overlay", label: "Overlay / görünüm" },
  { id: "payment", label: "Ödeme / abonelik" },
  { id: "account", label: "Hesap" },
  { id: "feature", label: "Öneri / istek" },
  { id: "other", label: "Diğer" },
];
export const categoryLabel = (id: string) => SUPPORT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Açık",
  answered: "Yanıtlandı",
  closed: "Kapalı",
};

export interface SupportTicket {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  unread: boolean;
  messages: number;
  last_body: string | null;
}

export interface AdminSupportTicket extends SupportTicket {
  user_id: string;
  display_name: string | null;
  email: string | null;
  pro_until: string | null;
}

export interface SupportMessage {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  images: string[];
  is_staff: boolean;
  created_at: string;
}

export const myTickets = () => api<SupportTicket[]>("POST", "rpc/my_support_tickets", { body: {} });
export const adminTickets = (status = "", category = "") =>
  api<AdminSupportTicket[]>("POST", "rpc/admin_support_tickets", { body: { p_status: status || null, p_category: category || null } });
export const ticketThread = (id: string) => api<SupportMessage[]>("POST", "rpc/support_thread", { body: { p_ticket: id } });
export const ticketSeen = (id: string) => api("POST", "rpc/support_seen", { body: { p_ticket: id } }).catch(() => {});
export const setTicketStatus = (id: string, status: SupportStatus) =>
  api("POST", "rpc/support_set_status", { body: { p_ticket: id, p_status: status } });

/** Yönetici: talebi tüm mesajları ve görselleriyle kalıcı sil (görseller Storage API ile kovadan silinir) */
export async function adminDeleteTicket(id: string) {
  const paths = (await api<string[]>("POST", "rpc/admin_support_delete", { body: { p_ticket: id } })) ?? [];
  if (paths.length) await storageRemove(SUPPORT_BUCKET, paths).catch(() => {});
}

/** Görseli küçült (en çok 1920 px, JPEG) ve kullanıcının klasörüne yükle; yolu döner */
async function uploadImage(file: File, stamp: string, i: number): Promise<string> {
  const uid = session()?.user.id;
  if (!uid) throw new Error("Giriş yapmalısın");
  let blob: Blob = file;
  let ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    if (scale < 1 || file.size > 1_500_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Görsel okunamadı"))), "image/jpeg", 0.86));
      ext = "jpg";
    }
    bmp.close();
  } catch {
    /* tarayıcı çözemedi: dosyayı olduğu gibi yükle */
  }
  if (blob.size > 5 * 1024 * 1024) throw new Error("Görsel çok büyük (en fazla 5 MB)");
  const path = `${uid}/${stamp}/${i + 1}.${ext}`;
  await storageUpload(SUPPORT_BUCKET, path, blob, ext === "jpg" ? "image/jpeg" : blob.type || file.type);
  return path;
}

async function uploadAll(files: File[]) {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return Promise.all(files.slice(0, SUPPORT_MAX_IMAGES).map((f, i) => uploadImage(f, stamp, i)));
}

export async function createTicket(v: { category: SupportCategory; subject: string; body: string; files: File[] }) {
  const images = await uploadAll(v.files);
  return api<string>("POST", "rpc/support_create", {
    body: { p_category: v.category, p_subject: v.subject.trim(), p_body: v.body.trim(), p_images: images },
  });
}

export async function replyTicket(id: string, body: string, files: File[]) {
  const images = await uploadAll(files);
  return api<string>("POST", "rpc/support_reply", { body: { p_ticket: id, p_body: body.trim(), p_images: images } });
}

/** Mesajlardaki görsellerin imzalı adresleri (1 saat geçerli) */
export async function signImages(msgs: SupportMessage[]): Promise<Record<string, string>> {
  const paths = [...new Set(msgs.flatMap((m) => m.images ?? []))];
  if (!paths.length) return {};
  try {
    return await storageSignedUrls(SUPPORT_BUCKET, paths, 3600);
  } catch {
    return {};
  }
}
