// Sohbet grupları (c45): arkadaşlarla grup kur, davet et, ayrıl, sil. Mesajlar Realtime ile; okuma sadece üyeler.
// Sahip ayrılırsa sahiplik en eski üyeye geçer; kimse kalmazsa grup sunucuda kendiliğinden silinir.

import type { RealtimeChannel } from "@supabase/realtime-js";
import { api } from "./supabase";
import { F, assertFeature } from "@/sdk/proFeatures";
import { noteAvatars } from "./profile";
import { realtime, type MsgMeta } from "./social";

export const GROUP_MAX_MEMBERS = 50;

export interface MyGroup {
  group_id: string;
  name: string;
  owner_id: string | null;
  is_owner: boolean;
  muted: boolean;
  unread: number;
  last_body: string | null;
  last_at: string | null;
  last_sender: string | null;
  last_sender_name: string | null;
  last_system: boolean;
  member_count: number;
  created_at: string;
}

export interface GroupMember {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  is_owner: boolean;
  joined_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender: string | null;
  sender_name?: string;
  body: string;
  meta?: MsgMeta | null;
  deleted: boolean;
  created_at: string;
}

export const myGroups = () => api<MyGroup[]>("POST", "rpc/my_groups", { body: {} }).then((r) => r ?? []);
export const createGroup = (name: string, members: string[]) => {
  assertFeature(F.messages, "Grup kurmak");
  return api<string>("POST", "rpc/group_create", { body: { p_name: name, p_members: members } });
};
/** Dönüş: eklenen kişi sayısı (mesajları kapalı olan ya da seni sessize alan arkadaşlar eklenmez) */
export const inviteToGroup = (group: string, users: string[]) =>
  api<number>("POST", "rpc/group_invite", { body: { p_group: group, p_users: users } }).then((n) => Number(n) || 0);
export const leaveGroup = (group: string) => api("POST", "rpc/group_leave", { body: { p_group: group } });
export const kickFromGroup = (group: string, user: string) => api("POST", "rpc/group_kick", { body: { p_group: group, p_user: user } });
export const deleteGroup = (group: string) => api("POST", "rpc/group_delete", { body: { p_group: group } });
export const renameGroup = (group: string, name: string) => api("POST", "rpc/group_rename", { body: { p_group: group, p_name: name } });
export async function groupMembers(group: string) {
  const list = (await api<GroupMember[]>("POST", "rpc/group_members", { body: { p_group: group } })) ?? [];
  noteAvatars(list.map((m) => ({ id: m.user_id, avatar_path: m.avatar_path })));
  return list;
}

export const groupChat = (group: string, before?: string) =>
  api<GroupMessage[]>("POST", "rpc/group_chat", { body: { p_group: group, p_before: before ?? null, p_limit: 80 } }).then((r) => r ?? []);
export const sendGroupMessage = (group: string, body: string) => {
  assertFeature(F.messages, "Mesaj göndermek");
  return api<string>("POST", "rpc/group_send", { body: { p_group: group, p_body: body } });
};
export const deleteGroupMessage = (id: string) => api("POST", "rpc/group_message_delete", { body: { p_id: id } });
export const markGroupRead = (group: string) => api("POST", "rpc/group_read", { body: { p_group: group } }).catch(() => {});
export const muteGroup = (group: string, muted: boolean) => api("POST", "rpc/group_mute", { body: { p_group: group, p_muted: muted } });
export const reportGroupMessage = (id: string, reason: string, note: string) =>
  api<string>("POST", "rpc/group_message_report", { body: { p_message: id, p_reason: reason, p_note: note } });

/** Gruplarımın mesajları (yeni mesaj ve silinme). Realtime okuma kuralına (üye olma) uyar; filtre sadece trafiği azaltır. */
export async function onGroupChat(groups: string[], cb: (m: GroupMessage, kind: "insert" | "update") => void): Promise<() => void> {
  const c = await realtime();
  if (!c || groups.length === 0) return () => {};
  const filter = `group_id=in.(${groups.slice(0, 100).join(",")})`;
  const ch: RealtimeChannel = c
    .channel(`groups-${Math.random().toString(36).slice(2, 9)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "group_messages", filter }, (p: any) => cb(p.new as GroupMessage, "insert"))
    .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "group_messages", filter }, (p: any) => cb(p.new as GroupMessage, "update"))
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

/** Grup sohbet kimliği (açılır pencere → Arkadaşlar penceresi) */
export const groupChatKey = (group: string) => `group:${group}`;
