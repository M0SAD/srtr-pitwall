// Sohbet grupları (c45): arkadaşlarla grup kur, davet et, ayrıl, sil. Mesajlar Realtime ile; okuma sadece üyeler.
// Sahip ayrılırsa sahiplik en eski üyeye geçer; kimse kalmazsa grup sunucuda kendiliğinden silinir.

import type { RealtimeChannel } from "@supabase/realtime-js";
import { api, session, storageRemove, storageUpload } from "./supabase";
import { F, assertFeature } from "@/sdk/proFeatures";
import { AVATAR_BUCKET, avatarUrl, noteAvatars, squareImage } from "./profile";
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
  /** Grup görseli ("avatars" kovasındaki yol, c83) */
  avatar_path?: string | null;
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
/** Bekleyen grup daveti (c93): kabul edilene kadar gruba dahil olunmaz */
export interface GroupInvite {
  group_id: string;
  name: string;
  from_id: string | null;
  from_name: string;
  member_count: number;
  created_at: string;
}
/** Bekleyen grup davetlerim (sunucu güncel değilse boş) */
export const myGroupInvites = () => api<GroupInvite[]>("POST", "rpc/my_group_invites", { body: {} }).then((r) => r ?? []).catch(() => [] as GroupInvite[]);
/** Daveti kabul et / reddet */
export const respondGroupInvite = (group: string, accept: boolean) => api<boolean>("POST", "rpc/group_invite_respond", { body: { p_group: group, p_accept: accept } });
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
/** Sahipliği bir üyeye devret (c65) */
export const transferGroup = (group: string, user: string) => api("POST", "rpc/group_transfer", { body: { p_group: group, p_user: user } });
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
/** Mesajı sadece kendi görünümümden kaldır (c55) */
export const hideGroupMessage = (id: string) => api("POST", "rpc/group_message_hide", { body: { p_id: id } });
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

/** Grup görselinin adresi ("" = yok) */
export const groupAvatarUrl = (path: string | null | undefined) => avatarUrl(path);

/** Grup görseli yükle (yalnızca sahip): kare kırpılıp küçültülür, sahibin "avatars" klasörüne konur */
export async function uploadGroupAvatar(group: string, file: File): Promise<string> {
  const uid = session()?.user.id;
  if (!uid) throw new Error("Giriş yapmalısın");
  const blob = await squareImage(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  await storageUpload(AVATAR_BUCKET, path, blob, blob.type);
  let old: string | null = null;
  try {
    old = await api<string | null>("POST", "rpc/group_set_avatar", { body: { p_group: group, p_path: path } });
  } catch (e) {
    void storageRemove(AVATAR_BUCKET, [path]).catch(() => {});
    throw e;
  }
  if (old && old.startsWith(`${uid}/`)) void storageRemove(AVATAR_BUCKET, [old]).catch(() => {});
  return path;
}

/** Grup görselini kaldır (yalnızca sahip) */
export async function removeGroupAvatar(group: string) {
  const uid = session()?.user.id;
  const old = await api<string | null>("POST", "rpc/group_set_avatar", { body: { p_group: group, p_path: null } });
  if (uid && old && old.startsWith(`${uid}/`)) void storageRemove(AVATAR_BUCKET, [old]).catch(() => {});
}
