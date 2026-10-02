// Takımlar: takım kurma, üyelik (sahip / yönetici / üye), davet ve katılma istekleri, duyuru panosu,
// takım sohbet odası (Realtime) ve sohbetteki anketler. Sunucu tarafı: supabase/c30_guncelleme.sql.

import { createSignal } from "solid-js";
import type { RealtimeChannel } from "@supabase/realtime-js";
import { api, publicUrl, session, storageUpload } from "./supabase";
import { realtime } from "./social";
import { F, assertFeature } from "@/sdk/proFeatures";

export type TeamRole = "owner" | "admin" | "member";
export type JoinMode = "open" | "request" | "invite";
/** Takımın oyunu (c36); multi = birden fazla oyun */
export type TeamSim = "iracing" | "acc" | "ac" | "lmu" | "rf2" | "ams2" | "multi";

export const TEAM_BUCKET = "teams";

export const ROLE_LABELS: Record<TeamRole, string> = { owner: "Sahip", admin: "Yönetici", member: "Üye" };
export const JOIN_LABELS: Record<JoinMode, string> = {
  open: "Herkes katılabilir",
  request: "Katılma isteği onayla",
  invite: "Sadece davetle",
};

export const TEAM_SIMS: { id: TeamSim; label: string; short: string }[] = [
  { id: "iracing", label: "iRacing", short: "iRacing" },
  { id: "acc", label: "Assetto Corsa Competizione", short: "ACC" },
  { id: "ac", label: "Assetto Corsa", short: "AC" },
  { id: "lmu", label: "Le Mans Ultimate", short: "LMU" },
  { id: "rf2", label: "rFactor 2", short: "rF2" },
  { id: "ams2", label: "Automobilista 2", short: "AMS2" },
  { id: "multi", label: "Birden fazla oyun", short: "Çoklu" },
];
export const teamSimMeta = (sim: string | null | undefined) => TEAM_SIMS.find((x) => x.id === sim) ?? TEAM_SIMS[0];

export interface TeamSummary {
  id: string;
  name: string;
  tag: string;
  description: string;
  color: string;
  logo_path: string;
  join_mode: JoinMode;
  owner_name: string;
  member_count: number;
  created_at: string;
  my_role: TeamRole | null;
  my_invite: "invite" | "request" | null;
  /** c36 öncesi sunucuda yok */
  sim?: TeamSim;
}

export interface TeamMember {
  user_id: string;
  display_name: string;
  iracing_name: string | null;
  role: TeamRole;
  joined_at: string;
}

export interface TeamPending {
  id: string;
  user_id: string;
  display_name: string;
  kind: "invite" | "request";
  created_at: string;
}

export interface TeamProfile {
  id: string;
  name: string;
  tag: string;
  description: string;
  color: string;
  logo_path: string;
  join_mode: JoinMode;
  sim?: TeamSim;
  owner: string;
  owner_name: string;
  created_at: string;
  pinned_post: string | null;
  my_role: TeamRole | null;
  my_invite: { id: string; kind: "invite" | "request" } | null;
  members: TeamMember[];
  pending: TeamPending[] | null;
}

/** Arkadaş listesindeki oda satırı */
export interface MyTeam {
  team_id: string;
  name: string;
  tag: string;
  color: string;
  logo_path: string;
  role: TeamRole;
  muted: boolean;
  unread: number;
  last_body: string | null;
  last_at: string | null;
  last_sender: string | null;
  last_poll: boolean;
  member_count: number;
}

export interface TeamInvite {
  id: string;
  team_id: string;
  name: string;
  tag: string;
  color: string;
  logo_path: string;
  from_name: string;
  created_at: string;
}

export interface TeamComment {
  id: string;
  author: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TeamPost {
  id: string;
  author: string | null;
  author_name: string;
  body: string;
  created_at: string;
  pinned: boolean;
  comments: TeamComment[];
}

export interface TeamPoll {
  id: string;
  team_id: string;
  question: string;
  options: string[];
  multi: boolean;
  ends_at: string;
  counts: number[];
  voters: number;
  created_by: string | null;
  /** Benim seçtiklerim (seçenek sırası) */
  mine: number[];
}

export interface TeamMessage {
  id: string;
  team_id: string;
  sender: string | null;
  sender_name?: string;
  body: string;
  deleted: boolean;
  poll_id: string | null;
  created_at: string;
  poll?: TeamPoll | null;
  /** Sistem mesajı (c45): sohbet arka planı değişti */
  meta?: import("./social").MsgMeta | null;
}

/** Logo adresi (herkese açık kova) */
export const teamLogo = (path: string) => (path ? publicUrl(TEAM_BUCKET, path) : "");

/** Takımlar sayfasında açılacak takım (bildirime tıklayınca) */
export const [teamFocus, setTeamFocus] = createSignal<string | null>(null);

// ---------------------------------------------------------------------------
// Liste, profil, üyelik
// ---------------------------------------------------------------------------

export const searchTeams = (q: string, sim: TeamSim | "" = "") =>
  api<TeamSummary[]>("POST", "rpc/teams_search", { body: { p_q: q, p_limit: 100, ...(sim ? { p_sim: sim } : {}) }, auth: "optional" }).then(
    (r) => r ?? [],
  );
export const teamProfile = (id: string) => api<TeamProfile | null>("POST", "rpc/team_profile", { body: { p_team: id }, auth: "optional" });
export const myTeams = () => api<MyTeam[]>("POST", "rpc/my_teams", { body: {} }).then((r) => r ?? []);
export const myTeamInvites = () => api<TeamInvite[]>("POST", "rpc/my_team_invites", { body: {} }).then((r) => r ?? []);

export interface TeamFields {
  name: string;
  tag: string;
  description: string;
  color: string;
  logo: string;
  joinMode: JoinMode;
  sim: TeamSim;
}
export const createTeam = (f: TeamFields) => {
  assertFeature(F.teamCreate, "Takım kurmak");
  return api<string>("POST", "rpc/team_create", {
    body: { p_name: f.name, p_tag: f.tag, p_description: f.description, p_color: f.color, p_logo: f.logo, p_join_mode: f.joinMode, p_sim: f.sim },
  });
};
export const updateTeam = (id: string, f: TeamFields) =>
  api("POST", "rpc/team_update", {
    body: { p_team: id, p_name: f.name, p_tag: f.tag, p_description: f.description, p_color: f.color, p_logo: f.logo, p_join_mode: f.joinMode, p_sim: f.sim },
  });
export const deleteTeam = (id: string) => api("POST", "rpc/team_delete", { body: { p_team: id } });
/** Dönüş: invited | pending | joined */
export const inviteToTeam = (team: string, user: string) => api<string>("POST", "rpc/team_invite", { body: { p_team: team, p_user: user } });
/** Dönüş: joined | requested | pending */
export const requestJoin = (team: string) => {
  assertFeature(F.teamJoin, "Takıma katılmak");
  return api<string>("POST", "rpc/team_request", { body: { p_team: team } });
};
export const respondInvite = (invite: string, accept: boolean) => api("POST", "rpc/team_respond", { body: { p_invite: invite, p_accept: accept } });
export const leaveTeam = (team: string) => api("POST", "rpc/team_leave", { body: { p_team: team } });
export const kickMember = (team: string, user: string) => api("POST", "rpc/team_kick", { body: { p_team: team, p_user: user } });
export const setMemberRole = (team: string, user: string, role: "admin" | "member") =>
  api("POST", "rpc/team_set_role", { body: { p_team: team, p_user: user, p_role: role } });
export const transferTeam = (team: string, user: string) => api("POST", "rpc/team_transfer", { body: { p_team: team, p_user: user } });

/** Logoyu küçült (en çok 256 px kare, WebP/JPEG) ve kendi klasörüne yükle; kova yolunu döner */
export async function uploadTeamLogo(file: File): Promise<string> {
  const uid = session()?.user.id;
  if (!uid) throw new Error("Giriş yapmalısın");
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error("Görsel okunamadı");
  });
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  // Ortadan kare kırp
  const s = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Görsel okunamadı"))), "image/webp", 0.9));
  const type = blob.type === "image/webp" ? "image/webp" : "image/png";
  const path = `${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${type === "image/webp" ? "webp" : "png"}`;
  await storageUpload(TEAM_BUCKET, path, blob, type);
  return path;
}

// ---------------------------------------------------------------------------
// Son aktiviteler (c36): üyelerin son telemetri oturumları
// ---------------------------------------------------------------------------

export interface TeamActivity {
  session_id: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  sim: string;
  track_name: string;
  track_config: string;
  car_name: string;
  session_type: string;
  laps: number;
  best_lap: number | null;
  started_at: string;
  last_lap_at: string;
  /** Oturumun en iyi turu üyenin bu pist + araçtaki kişisel en iyisi */
  is_pb: boolean;
}
export const teamActivity = (team: string, limit = 30) =>
  api<TeamActivity[]>("POST", "rpc/team_activity", { body: { p_team: team, p_limit: limit }, auth: "optional" }).then((r) => r ?? []);

// ---------------------------------------------------------------------------
// Duyuru panosu
// ---------------------------------------------------------------------------

export const teamWall = (team: string) => api<TeamPost[]>("POST", "rpc/team_wall", { body: { p_team: team } }).then((r) => r ?? []);
export const postAnnouncement = (team: string, body: string, pin: boolean) => {
  assertFeature(F.teamPost, "Duyuru yazmak");
  return api<string>("POST", "rpc/team_post", { body: { p_team: team, p_body: body, p_pin: pin } });
};
export const deletePost = (id: string) => api("POST", "rpc/team_post_delete", { body: { p_post: id } });
export const pinPost = (team: string, post: string | null) => api("POST", "rpc/team_pin", { body: { p_team: team, p_post: post } });
export const commentPost = (post: string, body: string) => api<string>("POST", "rpc/team_comment", { body: { p_post: post, p_body: body } });
export const deleteComment = (id: string) => api("POST", "rpc/team_comment_delete", { body: { p_id: id } });

// ---------------------------------------------------------------------------
// Sohbet odası ve anketler
// ---------------------------------------------------------------------------

export const teamChat = (team: string, before?: string) =>
  api<TeamMessage[]>("POST", "rpc/team_chat", { body: { p_team: team, p_before: before ?? null, p_limit: 80 } }).then((r) => r ?? []);
export const sendTeamMessage = (team: string, body: string) => {
  assertFeature(F.teamChat, "Takım sohbetine yazmak");
  return api<string>("POST", "rpc/team_send", { body: { p_team: team, p_body: body } });
};
export const deleteTeamMessage = (id: string) => api("POST", "rpc/team_message_delete", { body: { p_id: id } });
export const hideTeamMessage = (id: string) => api("POST", "rpc/team_message_hide", { body: { p_id: id } });
/** Takım mesajını yöneticilere raporla (c55) */
export const reportTeamMessage = (id: string, reason: string, note: string) =>
  api<string>("POST", "rpc/team_message_report", { body: { p_message: id, p_reason: reason, p_note: note } });
export const markTeamRead = (team: string) => api("POST", "rpc/team_chat_read", { body: { p_team: team } }).catch(() => {});
export const muteTeamChat = (team: string, muted: boolean) => api("POST", "rpc/team_chat_mute", { body: { p_team: team, p_muted: muted } });

/** Anket süresi seçenekleri (saat) */
export const POLL_DURATIONS: { id: string; label: string; hours: number }[] = [
  { id: "1h", label: "1 saat", hours: 1 },
  { id: "6h", label: "6 saat", hours: 6 },
  { id: "1d", label: "1 gün", hours: 24 },
  { id: "3d", label: "3 gün", hours: 72 },
  { id: "7d", label: "7 gün", hours: 168 },
];

export const createPoll = (team: string, question: string, options: string[], multi: boolean, endsAt: Date) => {
  assertFeature(F.teamPoll, "Anket oluşturmak");
  return api<string>("POST", "rpc/team_poll_create", {
    body: { p_team: team, p_question: question, p_options: options, p_multi: multi, p_ends_at: endsAt.toISOString() },
  });
};
export const votePoll = (poll: string, options: number[]) => api("POST", "rpc/team_poll_vote", { body: { p_poll: poll, p_options: options } });
export const closePoll = (poll: string) => api("POST", "rpc/team_poll_close", { body: { p_poll: poll } });

/** Anket bitti mi (bitiş zamanı geçti) */
export const pollEnded = (p: Pick<TeamPoll, "ends_at">, now = Date.now()) => new Date(p.ends_at).getTime() <= now;
/** Kazanan seçenek(ler): en çok oy alan(lar); hiç oy yoksa boş */
export function pollWinners(p: Pick<TeamPoll, "counts">): number[] {
  const max = Math.max(0, ...p.counts);
  if (max === 0) return [];
  return p.counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
}

/**
 * Takımlarımın sohbet mesajları (yeni mesaj ve silinme/güncelleme) ve anket sayıları.
 * Realtime, okuma kuralına (üye olma) uyar; filtre sadece trafiği azaltır.
 */
export async function onTeamChat(
  teams: string[],
  cb: { message?: (m: TeamMessage, kind: "insert" | "update") => void; poll?: (p: Omit<TeamPoll, "mine">) => void },
): Promise<() => void> {
  const c = await realtime();
  if (!c || teams.length === 0) return () => {};
  const filter = `team_id=in.(${teams.slice(0, 100).join(",")})`;
  const ch: RealtimeChannel = c
    .channel(`teams-${Math.random().toString(36).slice(2, 9)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "team_messages", filter }, (p: any) =>
      cb.message?.(p.new as TeamMessage, "insert"),
    )
    .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "team_messages", filter }, (p: any) =>
      cb.message?.(p.new as TeamMessage, "update"),
    )
    .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "team_polls", filter }, (p: any) => cb.poll?.(p.new))
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

/** Takım odası sohbet kimliği (açılır pencere → Arkadaşlar penceresi) */
export const teamChatKey = (team: string) => `team:${team}`;
