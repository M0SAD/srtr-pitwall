// Ses odaları (c116): oda bilgisi, yetkiler ve söz hakkı (RPC). Ses Cloudflare Realtime SFU üzerinden akar
// (Edge Function "voice-sfu" aracılık eder; bkz. src/voice/engine.ts). Hiçbir konuşma kaydedilmez.

import { api, callFunction } from "./supabase";

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
}) =>
  rpc<string>("voice_room_create", {
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
