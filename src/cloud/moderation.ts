// Moderasyon: izin grupları, raporlar, kayıtlar ve bildirimler.

import { createSignal } from "solid-js";
import { api, cloudEnabled, session } from "./supabase";
import { config } from "./account";

export const PERMS = ["shots.delete", "shots.edit", "comments.delete", "comments.edit", "reports.view", "layouts.delete"] as const;
export type Perm = (typeof PERMS)[number];

export const PERM_LABELS: Record<Perm, string> = {
  "shots.delete": "Görselleri silme",
  "shots.edit": "Görselleri düzenleme",
  "comments.delete": "Yorumları silme",
  "comments.edit": "Yorumları düzenleme",
  "reports.view": "Raporları görme ve kapatma",
  "layouts.delete": "Paylaşılan düzenleri silme",
};

const [perms, setPerms] = createSignal<string[]>([]);
export { perms };

/** Oturumdaki kullanıcının bu izni var mı (yönetici her izne sahip) */
export const can = (p: Perm) => perms().includes(p);

export async function loadPerms() {
  if (!cloudEnabled || !session()) {
    setPerms([]);
    return;
  }
  try {
    setPerms((await api<string[]>("POST", "rpc/my_perms", { body: {} })) ?? []);
  } catch {
    setPerms([]);
  }
}

// ---------------------------------------------------------------------------
// Raporlar
// ---------------------------------------------------------------------------

export type ReportTarget = "shot" | "shot_comment" | "layout" | "layout_comment" | "dash" | "dash_comment";

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: "inappropriate", label: "Uygunsuz içerik" },
  { id: "spam", label: "Spam / reklam" },
  { id: "copyright", label: "Telif hakkı ihlali" },
  { id: "harassment", label: "Hakaret / taciz" },
  { id: "impersonation", label: "Başkasının içeriği / kimliği" },
  { id: "other", label: "Diğer" },
];

export const TARGET_LABELS: Record<ReportTarget, string> = {
  shot: "Ekran görüntüsü",
  shot_comment: "Ekran görüntüsü yorumu",
  layout: "Paylaşılan düzen",
  layout_comment: "Düzen yorumu",
  dash: "Paylaşılan direksiyon ekranı",
  dash_comment: "Direksiyon ekranı yorumu",
};

export interface ReportRow {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  reporter: string;
  reporter_name: string;
  reason: string;
  note: string;
  status: "open" | "resolved" | "dismissed";
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  target: {
    title?: string;
    body?: string;
    thumb_path?: string;
    path?: string;
    user_id?: string;
    author?: string;
    screenshot_id?: string;
    layout_id?: string;
    dash_id?: string;
  } | null;
}

export async function sendReport(target_type: ReportTarget, target_id: string, reason: string, note: string) {
  try {
    await api("POST", "reports", { body: { target_type, target_id, reason, note: note.slice(0, 1000) }, prefer: "return=minimal" });
  } catch (e) {
    if (/duplicate|unique/i.test(String((e as Error).message))) throw new Error("Bunu zaten raporladın.");
    throw e;
  }
}

export function listReports(status: "open" | "all") {
  const f = status === "open" ? "&status=eq.open" : "";
  return api<ReportRow[]>("GET", `report_list?select=*${f}&order=created_at.desc&limit=100`);
}

export function setReportStatus(id: string, status: "open" | "resolved" | "dismissed") {
  return api("PATCH", `reports?id=eq.${id}`, { body: { status }, prefer: "return=minimal" });
}

// ---------------------------------------------------------------------------
// İzin grupları (sadece sahip değiştirir)
// ---------------------------------------------------------------------------

export interface PermGroup {
  id: string;
  name: string;
  color: string;
  perms: string[];
}

export function listGroups() {
  return api<PermGroup[]>("GET", "perm_groups?select=*&order=created_at.asc", { auth: "optional" });
}

export async function saveGroup(g: Partial<PermGroup> & { name: string }) {
  if (g.id) {
    await api("PATCH", `perm_groups?id=eq.${g.id}`, { body: { name: g.name, color: g.color, perms: g.perms }, prefer: "return=minimal" });
  } else {
    await api("POST", "perm_groups", { body: { name: g.name, color: g.color ?? "#4ea1ff", perms: g.perms ?? [] }, prefer: "return=minimal" });
  }
}

export function deleteGroup(id: string) {
  return api("DELETE", `perm_groups?id=eq.${id}`);
}

export async function setUserGroup(user: string, group: string, on: boolean) {
  if (on) await api("POST", "user_groups", { body: { user_id: user, group_id: group }, prefer: "resolution=ignore-duplicates,return=minimal" });
  else await api("DELETE", `user_groups?user_id=eq.${user}&group_id=eq.${group}`);
}

export function ownerSetAdmin(user: string, on: boolean) {
  return api("POST", "rpc/owner_set_admin", { body: { p_user: user, p_on: on } });
}

// ---------------------------------------------------------------------------
// Moderasyon kayıtları (sadece sahip görür)
// ---------------------------------------------------------------------------

export interface ModLog {
  id: number;
  actor: string | null;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  target_owner: string | null;
  owner_name: string;
  details: Record<string, any>;
  created_at: string;
}

export function listModLog(offset = 0) {
  return api<ModLog[]>("GET", `mod_log?select=*&order=created_at.desc&limit=100&offset=${offset}`);
}

export const ACTION_LABELS: Record<string, string> = {
  delete: "Sildi",
  update: "Düzenledi",
  report_resolved: "Raporu kapattı",
  report_dismissed: "Raporu reddetti",
  report_open: "Raporu yeniden açtı",
  admin_grant: "Yönetici yaptı",
  admin_revoke: "Yöneticiliği aldı",
  group_add: "Gruba ekledi",
  group_remove: "Gruptan çıkardı",
  message_report_dismiss: "Mesaj raporunu yoksaydı",
  message_report_resolve: "Mesaj raporunu kapattı",
  message_report_reopen: "Mesaj raporunu yeniden açtı",
  message_report_delete_message: "Raporlanan mesajı sildi",
  team_delete: "Takımı sildi",
  support_delete: "Destek talebini sildi",
  messages_view: "Özel mesajlara baktı",
  ad_force_delete: "Reklamı kalıcı sildi",
};

export const LOG_TARGETS: Record<string, string> = {
  ...TARGET_LABELS,
  report: "Rapor",
  user: "Kullanıcı",
  message: "Mesaj",
  team: "Takım",
  support: "Destek talebi",
  ad: "Reklam",
};

// ---------------------------------------------------------------------------
// Mesaj raporları (arkadaş mesajları; sadece yöneticiler)
// ---------------------------------------------------------------------------

export interface MessageReportRow {
  id: string;
  message_id: string | null;
  reason: string;
  note: string;
  body: string;
  message_at: string | null;
  status: "open" | "dismissed" | "resolved" | "removed";
  created_at: string;
  handled_at: string | null;
  handled_name: string;
  reporter: string;
  reporter_name: string;
  reported: string | null;
  reported_name: string;
  message_exists: boolean;
  reported_total: number;
}

export type MessageReportAction = "dismiss" | "resolve" | "reopen" | "delete_message";

export const adminMessageReports = (status: "open" | "all") =>
  api<MessageReportRow[]>("POST", "rpc/admin_message_reports", { body: { p_status: status === "all" ? "" : status } }).then((r) => r ?? []);
export const adminMessageReportSet = (id: string, action: MessageReportAction) =>
  api("POST", "rpc/admin_message_report_set", { body: { p_id: id, p_action: action } });

// ---------------------------------------------------------------------------
// Tüm özel mesajlar (sadece yönetici; her ilk sayfa moderasyon kaydına yazılır)
// ---------------------------------------------------------------------------

export interface AdminMessageRow {
  id: string;
  sender: string;
  sender_name: string;
  sender_iracing: string | null;
  recipient: string;
  recipient_name: string;
  recipient_iracing: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  hidden_by_sender: boolean;
  hidden_by_recipient: boolean;
  reported: boolean;
  total: number;
}

export interface AdminMessageFilter {
  /** Üye adı / iRacing adı (parça) ya da kullanıcı kimliği */
  user?: string;
  /** İkinci üye: verilirse sadece ikisi arasındaki mesajlar */
  other?: string;
  text?: string;
  /** ISO tarih (dahil) */
  from?: string | null;
  /** ISO tarih (hariç) */
  to?: string | null;
  limit?: number;
  offset?: number;
}

export const adminMessages = (f: AdminMessageFilter) =>
  api<AdminMessageRow[]>("POST", "rpc/admin_messages", {
    body: {
      p_user_query: f.user?.trim() || null,
      p_other_query: f.other?.trim() || null,
      p_text: f.text?.trim() || null,
      p_from: f.from || null,
      p_to: f.to || null,
      p_limit: f.limit ?? 100,
      p_offset: f.offset ?? 0,
    },
  }).then((r) => r ?? []);

// ---------------------------------------------------------------------------
// Bildirimler
// ---------------------------------------------------------------------------

export interface Notice {
  id: string;
  kind: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
  read_at?: string | null;
  /** Yönetici duyurusu ise */
  ann?: { title: string; body: string; keep_hours: number | null };
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: "all" | "pro" | "user";
  user_id: string | null;
  keep_hours: number | null;
  created_at: string;
  expires_at: string | null;
}

const [notices, setNotices] = createSignal<Notice[]>([]);
export { notices };

/** Okunan bildirim bu kadar saat sonra listeden kalkar (okunmayanlar kalır) */
function keepHours(n: Notice) {
  return n.ann?.keep_hours ?? config()?.notice_keep_hours ?? 24;
}
function visible(n: Notice) {
  if (!n.read || !n.read_at) return true;
  return Date.now() - new Date(n.read_at).getTime() < keepHours(n) * 3600_000;
}

export async function loadNotices() {
  if (!cloudEnabled || !session()) {
    setNotices([]);
    return;
  }
  try {
    const [own, anns, reads] = await Promise.all([
      api<Notice[]>("GET", "notifications?select=*&order=created_at.desc&limit=50"),
      api<Announcement[]>("GET", `announcements?select=*&or=(expires_at.is.null,expires_at.gt.${new Date().toISOString()})&order=created_at.desc&limit=30`).catch(() => []),
      api<{ announcement_id: string; read_at: string }[]>("GET", "announcement_reads?select=announcement_id,read_at").catch(() => []),
    ]);
    const uid = session()?.user.id;
    const rmap = new Map((reads ?? []).map((r) => [r.announcement_id, r.read_at]));
    const annNotices: Notice[] = (anns ?? [])
      // Yönetici hepsini görür; kendine gelenleri ve herkese/PRO'ya olanları listeler
      .filter((a) => a.audience !== "user" || a.user_id === uid)
      .map((a) => ({
        id: "a:" + a.id,
        kind: "announcement",
        data: {},
        read: rmap.has(a.id),
        read_at: rmap.get(a.id) ?? null,
        created_at: a.created_at,
        ann: { title: a.title, body: a.body, keep_hours: a.keep_hours },
      }));
    const all = [...(own ?? []).map((n) => ({ ...n, read_at: n.read_at ?? (n.read ? n.created_at : null) })), ...annNotices];
    all.sort((x, y) => y.created_at.localeCompare(x.created_at));
    setNotices(all.filter(visible));
  } catch {
    /* çevrimdışı */
  }
}

export async function markNoticesRead() {
  const unread = notices().filter((n) => !n.read);
  if (!unread.length) return;
  const uid = session()?.user.id;
  const now = new Date().toISOString();
  if (unread.some((n) => !n.ann))
    await api("PATCH", `notifications?user_id=eq.${uid}&read=eq.false`, { body: { read: true, read_at: now }, prefer: "return=minimal" }).catch(() => {});
  const anns = unread.filter((n) => n.ann).map((n) => ({ announcement_id: n.id.slice(2) }));
  if (anns.length)
    await api("POST", "announcement_reads?on_conflict=user_id,announcement_id", { body: anns, prefer: "resolution=ignore-duplicates,return=minimal" }).catch(() => {});
  setNotices(notices().map((n) => (n.read ? n : { ...n, read: true, read_at: now })));
}

export async function deleteNotice(id: string) {
  if (id.startsWith("a:")) {
    // Duyuru silinemez, okundu sayılıp gizlenir
    const aid = id.slice(2);
    await api("DELETE", `announcement_reads?announcement_id=eq.${aid}&user_id=eq.${session()?.user.id}`).catch(() => {});
    await api("POST", "announcement_reads", { body: { announcement_id: aid, read_at: new Date(0).toISOString() }, prefer: "return=minimal" }).catch(() => {});
  } else await api("DELETE", `notifications?id=eq.${id}`).catch(() => {});
  setNotices(notices().filter((n) => n.id !== id));
}

/** Tüm bildirimleri sil (yalnız kendi satırları; duyurular okundu sayılıp gizlenir) */
export async function deleteAllNotices() {
  const uid = session()?.user.id;
  if (!uid) return;
  const list = notices();
  if (list.some((n) => !n.ann)) await api("DELETE", `notifications?user_id=eq.${uid}`, { prefer: "return=minimal" }).catch(() => {});
  const aids = list.filter((n) => n.ann).map((n) => n.id.slice(2));
  if (aids.length) {
    await api("DELETE", `announcement_reads?user_id=eq.${uid}&announcement_id=in.(${aids.join(",")})`, { prefer: "return=minimal" }).catch(() => {});
    const epoch = new Date(0).toISOString();
    await api("POST", "announcement_reads", {
      body: aids.map((a) => ({ announcement_id: a, read_at: epoch })),
      prefer: "return=minimal",
    }).catch(() => {});
  }
  setNotices([]);
}

// Yönetici: duyurular
export const listAnnouncements = () => api<Announcement[]>("GET", "announcements?select=*&order=created_at.desc&limit=100");
export const createAnnouncement = (a: Pick<Announcement, "title" | "body" | "audience" | "user_id" | "keep_hours" | "expires_at">) =>
  api("POST", "announcements", { body: a, prefer: "return=minimal" });
export const deleteAnnouncement = (id: string) => api("DELETE", `announcements?id=eq.${id}`);
