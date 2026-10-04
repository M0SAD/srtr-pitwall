// Yönetim › Mesajlar (c80): tüm sohbetler — özel mesaj, takım, grup ve ekip odası (sadece yönetici).
// Sunucu her ilk sayfayı moderasyon kaydına yazar (aynı süzgeç 10 dakikada bir kez).

import { api } from "./supabase";

export type ChatKind = "dm" | "team" | "group" | "crew";

export interface AdminChatThread {
  kind: ChatKind;
  /** dm: iki üyeden biri; diğerlerinde oda kimliği (takım / grup / sürücü) */
  a: string;
  a_name: string;
  a_avatar: string | null;
  /** yalnızca dm */
  b: string | null;
  b_name: string | null;
  b_avatar: string | null;
  last_at: string;
  msg_count: number;
  last_body: string;
  last_sender_name: string;
}

export interface AdminChatMessage {
  kind: ChatKind;
  id: string;
  created_at: string;
  sender: string | null;
  sender_name: string;
  sender_avatar: string | null;
  /** dm: alıcı; diğerlerinde oda kimliği */
  peer: string;
  peer_name: string;
  peer_avatar: string | null;
  body: string;
  deleted: boolean;
  meta: Record<string, any> | null;
}

export interface AdminChatUser {
  id: string;
  display_name: string;
  iracing_name: string | null;
  avatar_path: string | null;
}

export interface AdminChatFilter {
  kind?: ChatKind | null;
  user?: string | null;
  other?: string | null;
  room?: string | null;
  query?: string | null;
  /** ISO (dahil) */
  from?: string | null;
  /** ISO (hariç) */
  to?: string | null;
  before?: string | null;
  beforeId?: string | null;
  limit?: number;
}

export const adminChatThreads = (f: AdminChatFilter) =>
  api<AdminChatThread[]>("POST", "rpc/admin_chat_threads", {
    body: {
      p_kind: f.kind || null,
      p_user: f.user || null,
      p_query: f.query?.trim() || null,
      p_from: f.from || null,
      p_to: f.to || null,
      p_before: f.before || null,
      p_limit: f.limit ?? 60,
    },
  }).then((r) => r ?? []);

export const adminChatMessages = (f: AdminChatFilter) =>
  api<AdminChatMessage[]>("POST", "rpc/admin_chat_messages", {
    body: {
      p_kind: f.kind || null,
      p_user: f.user || null,
      p_other: f.other || null,
      p_room: f.room || null,
      p_query: f.query?.trim() || null,
      p_from: f.from || null,
      p_to: f.to || null,
      p_before: f.before || null,
      p_before_id: f.beforeId || null,
      p_limit: f.limit ?? 100,
    },
  }).then((r) => r ?? []);

export const adminChatUsers = (q: string) =>
  api<AdminChatUser[]>("POST", "rpc/admin_chat_users", { body: { p_q: q.trim(), p_limit: 12 } }).then((r) => r ?? []);

/** Sunucuda c80 henüz çalıştırılmamış mı (fonksiyon bulunamadı) */
export const chatNotDeployed = (e: unknown) => /could not find|PGRST202|does not exist|404/i.test(String((e as Error)?.message ?? e));
