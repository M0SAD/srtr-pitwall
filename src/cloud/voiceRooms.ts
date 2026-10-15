// Ses odaları (c116): oda bilgisi, yetkiler ve söz hakkı (RPC). Ses Cloudflare Realtime SFU üzerinden akar
// (Edge Function "voice-sfu" aracılık eder; bkz. src/voice/engine.ts). Hiçbir konuşma kaydedilmez.

import type { RealtimeChannel } from "@supabase/realtime-js";
import { api, callFunction } from "./supabase";
import { realtime } from "./social";

export type VoiceKind = "public" | "private" | "team";
export type VoiceMode = "open" | "moderated";
export type VoiceRole = "owner" | "admin" | "mod" | "speaker" | "member";

export interface VoiceRoomRow {
  id: string;
  name: string;
  description: string;
  kind: VoiceKind;
  team_id: string | null;
  team_name: string | null;
  mode: VoiceMode;
  talk_seconds: number;
  max_members: number;
  owner: string;
  owner_name: string | null;
  members: number;
  my_role: VoiceRole | null;
  is_mine: boolean;
  /** c117: boş kalınca 1 saat sonra silinir (yönetici olmayanların odaları) */
  auto_delete?: boolean;
  /** c119 */
  category_id?: string | null;
  /** "i:<ad>" (uygulamadaki simgeler) ya da emoji; boş = türüne göre */
  icon?: string;
  /** Sadece PRO üyeler girebilir */
  pro_only?: boolean;
  /** Ben girebilir miyim (PRO'ya özel odada PRO değilsem false) */
  can_enter?: boolean;
}

export interface VoiceJoin {
  id: string;
  name: string;
  description: string;
  kind: VoiceKind;
  mode: VoiceMode;
  talk_seconds: number;
  max_members: number;
  owner: string;
  auto_next: boolean;
  /** Realtime kanalı (presence + yayın): oda anahtarını bilen girer */
  chan: string;
  role: VoiceRole;
  invite_code: string | null;
  icon?: string;
  pro_only?: boolean;
}

export interface VoiceGrant {
  user_id: string;
  until: string;
  name: string | null;
}
export interface VoiceRequest {
  user_id: string;
  at: string;
  name: string | null;
}
export interface VoiceRoleRow {
  user_id: string;
  role: VoiceRole;
  name: string | null;
}
export interface VoiceState {
  now: string;
  mode: VoiceMode;
  talk_seconds: number;
  auto_next: boolean;
  max_members: number;
  description: string;
  name: string;
  grants: VoiceGrant[];
  requests: VoiceRequest[];
  roles: VoiceRoleRow[];
  my_role: VoiceRole | null;
}

const rpc = <T = unknown>(fn: string, body: Record<string, unknown>) => api<T>("POST", `rpc/${fn}`, { body });

export const voiceRooms = () => rpc<VoiceRoomRow[]>("voice_rooms_list", {}).then((r) => r ?? []);

export const voiceRoomCreate = (o: {
  name: string;
  kind: VoiceKind;
  team?: string | null;
  mode: VoiceMode;
  talkSeconds: number;
  max: number;
  description?: string;
  category?: string | null;
  icon?: string;
  proOnly?: boolean;
}) =>
  rpc<string>("voice_room_create", {
    p_category: o.category ?? null,
    p_icon: o.icon ?? "",
    p_pro_only: !!o.proOnly,
    p_name: o.name,
    p_kind: o.kind,
    p_team: o.team ?? null,
    p_mode: o.mode,
    p_talk_seconds: o.talkSeconds,
    p_max: o.max,
    p_description: o.description ?? "",
  });

export const voiceRoomUpdate = (
  room: string,
  o: {
    name?: string | null;
    mode?: VoiceMode | null;
    talkSeconds?: number | null;
    max?: number | null;
    description?: string | null;
    autoNext?: boolean | null;
  },
) =>
  rpc("voice_room_update", {
    p_room: room,
    p_name: o.name ?? null,
    p_mode: o.mode ?? null,
    p_talk_seconds: o.talkSeconds ?? null,
    p_max: o.max ?? null,
    p_description: o.description ?? null,
    p_auto_next: o.autoNext ?? null,
  });

export const voiceRoomDelete = (room: string) => rpc("voice_room_delete", { p_room: room });
export const voiceRoomNewCode = (room: string) => rpc<string>("voice_room_new_code", { p_room: room });
export const voiceRoomState = (room: string) => rpc<VoiceState>("voice_room_state", { p_room: room });

export const voiceRequestFloor = (room: string, on: boolean) => rpc("voice_request_floor", { p_room: room, p_on: on });
export const voiceGrant = (room: string, user: string, seconds?: number) =>
  rpc<string>("voice_grant", {
    p_room: room,
    p_user: user,
    p_seconds: seconds ?? null,
  });
export const voiceExtend = (room: string, user: string, seconds = 30) =>
  rpc<string>("voice_extend", {
    p_room: room,
    p_user: user,
    p_seconds: seconds,
  });
/** user boşsa herkesin söz hakkı alınır (herkesi sustur) */
export const voiceRevoke = (room: string, user: string | null) => rpc("voice_revoke", { p_room: room, p_user: user });
export const voiceDismissRequest = (room: string, user: string) => rpc("voice_dismiss_request", { p_room: room, p_user: user });
export const voiceGrantNext = (room: string) => rpc<string | null>("voice_grant_next", { p_room: room });
export const voiceSetRole = (room: string, user: string, role: "admin" | "mod" | "speaker" | null) =>
  rpc("voice_set_role", { p_room: room, p_user: user, p_role: role });
/** minutes: null = kalıcı yasak, 0 = sadece çıkar */
export const voiceKick = (room: string, user: string, minutes: number | null) => rpc("voice_kick", { p_room: room, p_user: user, p_minutes: minutes });
export const voiceUnban = (room: string, user: string) => rpc("voice_unban", { p_room: room, p_user: user });
export const voiceHeartbeat = (room: string, leave = false) => rpc<boolean>("voice_heartbeat", { p_room: room, p_leave: leave });

// ---- SFU aracısı (Edge Function "voice-sfu")
export interface SfuSdp {
  sdp: string;
  type: RTCSdpType;
}
export const sfu = {
  join: (room: string | null, code: string | null) =>
    callFunction<{ room: VoiceJoin; session_id: string; ice: RTCIceServer[] }>("voice-sfu", { action: "join", room, code }),
  push: (sid: string, sdp: string, mid: string) =>
    callFunction<{ sdp: SfuSdp | null }>("voice-sfu", {
      action: "push",
      session_id: sid,
      sdp,
      mid,
    }),
  pull: (sid: string, targets: string[]) =>
    callFunction<{
      sdp?: SfuSdp | null;
      renegotiate?: boolean;
      tracks: { target: string; mid: string; error?: string }[];
      denied: string[];
    }>("voice-sfu", {
      action: "pull",
      session_id: sid,
      targets,
    }),
  renegotiate: (sid: string, sdp: string) => callFunction("voice-sfu", { action: "renegotiate", session_id: sid, sdp }),
  close: (sid: string, mids: string[], sdp: string | null) =>
    callFunction<{ sdp?: SfuSdp | null; renegotiate?: boolean }>("voice-sfu", {
      action: "close",
      session_id: sid,
      mids,
      sdp,
    }),
  leave: (sid: string) => callFunction("voice-sfu", { action: "leave", session_id: sid }),
};

// ---- c119: simge / PRO'ya özel / kategori, kategoriler, Ses Odası Moderatörleri, davet
export const voiceRoomMeta = (room: string, o: { icon?: string | null; proOnly?: boolean | null; category?: string | null; setCategory?: boolean }) =>
  rpc("voice_room_meta", {
    p_room: room,
    p_icon: o.icon ?? null,
    p_pro_only: o.proOnly ?? null,
    p_category: o.category ?? null,
    p_set_category: !!o.setCategory,
  });

export interface VoiceCategory {
  id: string;
  name: string;
  sort: number;
}
export const voiceCategories = () =>
  api<VoiceCategory[]>("GET", "voice_categories?select=id,name,sort&order=sort.asc,created_at.asc", { auth: "optional" }).then((r) => r ?? []);
export const voiceCategorySave = (id: string | null, name: string, sort?: number) =>
  rpc<string>("voice_category_save", { p_id: id, p_name: name, p_sort: sort ?? null });
export const voiceCategoryDelete = (id: string) => rpc("voice_category_delete", { p_id: id });

export interface VoiceMod {
  user_id: string;
  name: string | null;
  created_at: string;
}
export const voiceMods = () => rpc<VoiceMod[]>("voice_mods_list", {}).then((r) => r ?? []);
export const voiceModSet = (user: string, on: boolean) => rpc("voice_mod_set", { p_user: user, p_on: on });

/** Arkadaşı odaya davet et (mesaj olarak gider) */
export const voiceInvite = (room: string, to: string) => rpc<string>("voice_invite", { p_room: room, p_to: to });

// ---- c121: oda sohbeti (yalnızca odadakiler okur; 7 gün saklanır) ve odalardaki kişiler (sol menü)
export interface VoiceMsg {
  id: string;
  room_id: string;
  sender: string | null;
  sender_name?: string | null;
  avatar_path?: string | null;
  body: string;
  deleted: boolean;
  created_at: string;
}
export const voiceChat = (room: string, before?: string) =>
  rpc<VoiceMsg[]>("voice_chat", { p_room: room, p_before: before ?? null, p_limit: 80 }).then((r) => r ?? []);
export const voiceChatSend = (room: string, body: string) => rpc<string>("voice_chat_send", { p_room: room, p_body: body });
export const voiceChatDelete = (id: string) => rpc("voice_chat_delete", { p_id: id });

/** Odanın yeni mesajları ve silinmeleri (Realtime; okuma kuralı: odada olmak) */
export async function onVoiceChat(room: string, cb: (m: VoiceMsg, kind: "insert" | "update") => void): Promise<() => void> {
  const c = await realtime();
  if (!c) return () => {};
  const filter = `room_id=eq.${room}`;
  const ch: RealtimeChannel = c
    .channel(`vchat-${room}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "voice_messages", filter }, (p: any) => cb(p.new as VoiceMsg, "insert"))
    .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "voice_messages", filter }, (p: any) => cb(p.new as VoiceMsg, "update"))
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

export interface VoicePerson {
  room_id: string;
  user_id: string;
  name: string | null;
  avatar_path: string | null;
}
/** Listede görünen odalarda şu an kimler var (sunucu eskiyse boş) */
export const voiceRoomsPeople = () => rpc<VoicePerson[]>("voice_rooms_people", {}).then((r) => r ?? []);

// ---- c122: üyeyi başka odaya taşı (sürükle-bırak)
export const voiceMove = (user: string, to: string) => rpc("voice_move", { p_user: user, p_to: to });
export interface VoiceMoveInfo {
  to_room: string;
  room_name: string;
  by_name: string | null;
  created_at: string;
}
export const voiceMyMove = () => rpc<VoiceMoveInfo[]>("voice_my_move", {}).then((r) => r?.[0] ?? null);

/** Beni başka odaya taşıdılar (Realtime; kayıt yalnızca bana görünür) */
export async function onVoiceMoved(uid: string, cb: () => void): Promise<() => void> {
  const c = await realtime();
  if (!c) return () => {};
  const filter = `user_id=eq.${uid}`;
  const ch: RealtimeChannel = c
    .channel(`vmove-${uid}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "voice_moves", filter }, () => cb())
    .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "voice_moves", filter }, () => cb())
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

/** Arkadaşı şu an bulunduğum ses odasına davet et (c123; hangi pencereden olursa olsun) */
export const voiceInviteHere = (to: string) => rpc<string>("voice_invite_here", { p_to: to });
