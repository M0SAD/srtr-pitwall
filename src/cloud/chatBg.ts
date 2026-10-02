// Sohbete özel ortak arka plan (c37): öner, kabul et / reddet, oku, kaldır. Görseller özel "chatbg" kovasında
// <user_a>_<user_b>/ klasöründe (user_a < user_b); sadece iki taraf okuyabilir.

import { api, session, storageRemove, storageSignedUrls, storageUpload } from "./supabase";
import { F, assertFeature } from "@/sdk/proFeatures";

export const CHAT_BG_BUCKET = "chatbg";

export interface SharedChatBg {
  proposer: string;
  kind: "solid" | "gradient" | "image";
  value: string;
  image_path: string | null;
  status: "pending" | "accepted" | "rejected";
  updated_at: string;
  /** Öneren ben miyim */
  mine: boolean;
}

export function pairFolder(friendId: string) {
  const me = (session()?.user.id ?? "").toLowerCase();
  const f = friendId.toLowerCase();
  return me < f ? `${me}_${f}` : `${f}_${me}`;
}

export async function getChatBg(friendId: string): Promise<SharedChatBg | null> {
  const rows = await api<SharedChatBg[]>("POST", "rpc/chat_bg_get", { body: { p_friend: friendId } });
  return rows?.[0] ?? null;
}

/** Arkadaşa öner. Görselse önce kovaya yüklenir; eski görsel kullanılmıyorsa silinir. */
export async function proposeChatBg(friendId: string, bg: { kind: "solid" | "gradient"; value: string } | { kind: "image"; blob: Blob }) {
  assertFeature(F.chatBg, "Sohbet arka planı önermek");
  let path: string | null = null;
  if (bg.kind === "image") {
    path = `${pairFolder(friendId)}/${(session()?.user.id ?? "x").slice(0, 8)}-${Date.now().toString(36)}.jpg`;
    await storageUpload(CHAT_BG_BUCKET, path, bg.blob, "image/jpeg");
  }
  try {
    const old = await api<string | null>("POST", "rpc/chat_bg_propose", {
      body: { p_friend: friendId, p_kind: bg.kind, p_value: bg.kind === "image" ? "" : bg.value, p_image: path },
    });
    if (old) void storageRemove(CHAT_BG_BUCKET, [old]).catch(() => {});
  } catch (e) {
    if (path) void storageRemove(CHAT_BG_BUCKET, [path]).catch(() => {});
    throw e;
  }
}

export const respondChatBg = (friendId: string, accept: boolean) =>
  api("POST", "rpc/chat_bg_respond", { body: { p_friend: friendId, p_accept: accept } });

export async function clearSharedChatBg(friendId: string) {
  const old = await api<string | null>("POST", "rpc/chat_bg_clear", { body: { p_friend: friendId } });
  if (old) void storageRemove(CHAT_BG_BUCKET, [old]).catch(() => {});
}

// Görsel yolu → blob adresi (oturum boyunca bir kez indirilir)
const imgCache = new Map<string, Promise<string | null>>();
/** blob: adresi → Blob (CSP blob: adresine fetch'e izin vermez; "Bu arka planı kullan" bunu kullanır) */
const blobCache = new Map<string, Blob>();

export function sharedImageUrl(path: string): Promise<string | null> {
  let p = imgCache.get(path);
  if (!p) {
    p = storageSignedUrls(CHAT_BG_BUCKET, [path], 600)
      .then(async (m) => {
        const u = m[path];
        if (!u) return null;
        const r = await fetch(u);
        if (!r.ok) return null;
        const b = await r.blob();
        const url = URL.createObjectURL(b);
        blobCache.set(url, b);
        return url;
      })
      .catch(() => null);
    p.then((u) => !u && imgCache.delete(path));
    imgCache.set(path, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// c45: arka plan değişikliği sohbette mesaj olarak görünür.
//   1:1 sohbet  → announceChatBg: kişiye özel; karşı taraf mesaja tıklayıp aynısını kullanabilir.
//   Grup / takım → setRoomBg / clearRoomBg: sadece sahip değiştirir, odadaki herkese uygulanır.
// Görseller aynı "chatbg" kovasında: <a>_<b>/ (1:1), g_<grup id>/, t_<takım id>/.
// ---------------------------------------------------------------------------

export type BgChoice = { kind: "solid" | "gradient"; value: string } | { kind: "image"; blob: Blob };
export type RoomScope = "group" | "team";

const fileName = () => `${(session()?.user.id ?? "x").slice(0, 8)}-${Date.now().toString(36)}.jpg`;

/** 1:1: "arka planını değiştirdi" mesajını gönderir. Dönüş: mesaj kimliği + meta (sohbete hemen eklemek için). */
export async function announceChatBg(friendId: string, bg: BgChoice) {
  assertFeature(F.chatBg, "Sohbet arka planını paylaşmak");
  let path: string | null = null;
  if (bg.kind === "image") {
    path = `${pairFolder(friendId)}/${fileName()}`;
    await storageUpload(CHAT_BG_BUCKET, path, bg.blob, "image/jpeg");
  }
  try {
    const r = await api<{ id: string; old: string[] }>("POST", "rpc/chat_bg_announce", {
      body: { p_friend: friendId, p_kind: bg.kind, p_value: bg.kind === "image" ? "" : bg.value, p_image: path },
    });
    if (r?.old?.length) void storageRemove(CHAT_BG_BUCKET, r.old).catch(() => {});
    return {
      id: String(r?.id ?? ""),
      meta: { t: "bg" as const, kind: bg.kind, value: bg.kind === "image" ? "" : bg.value, ...(path ? { image: path } : {}) },
    };
  } catch (e) {
    if (path) void storageRemove(CHAT_BG_BUCKET, [path]).catch(() => {});
    throw e;
  }
}

export interface RoomBg {
  kind: "solid" | "gradient" | "image";
  value: string;
  image_path: string | null;
  updated_at: string;
}

const roomFolder = (scope: RoomScope, room: string) => `${scope === "group" ? "g" : "t"}_${room.toLowerCase()}`;

export async function getRoomBg(scope: RoomScope, room: string): Promise<RoomBg | null> {
  const rows = await api<RoomBg[]>("GET", `chat_room_bg?scope=eq.${scope}&room_id=eq.${room}&select=kind,value,image_path,updated_at`);
  return rows?.[0] ?? null;
}

/** Sadece grup sahibi / takım sahibi (sunucu denetler). Odaya sistem mesajı da yazılır. */
export async function setRoomBg(scope: RoomScope, room: string, bg: BgChoice) {
  assertFeature(F.chatBg, "Sohbet arka planını değiştirmek");
  let path: string | null = null;
  if (bg.kind === "image") {
    path = `${roomFolder(scope, room)}/${fileName()}`;
    await storageUpload(CHAT_BG_BUCKET, path, bg.blob, "image/jpeg");
  }
  try {
    const old = await api<string | null>("POST", "rpc/room_bg_set", {
      body: { p_scope: scope, p_room: room, p_kind: bg.kind, p_value: bg.kind === "image" ? "" : bg.value, p_image: path },
    });
    if (old) void storageRemove(CHAT_BG_BUCKET, [old]).catch(() => {});
  } catch (e) {
    if (path) void storageRemove(CHAT_BG_BUCKET, [path]).catch(() => {});
    throw e;
  }
}

/** Sunucudaki satır silinmeden ÖNCE görsel kovadan silinir (silme izni sahiplik ister; grup silinirken de çağrılır) */
export async function clearRoomBg(scope: RoomScope, room: string, quiet = false) {
  if (quiet) {
    // Grup siliniyor: sadece görseli temizle (sistem mesajı gereksiz)
    const cur = await getRoomBg(scope, room).catch(() => null);
    if (cur?.image_path) await storageRemove(CHAT_BG_BUCKET, [cur.image_path]).catch(() => {});
    return;
  }
  const cur = await getRoomBg(scope, room).catch(() => null);
  await api<string | null>("POST", "rpc/room_bg_clear", { body: { p_scope: scope, p_room: room } });
  if (cur?.image_path) void storageRemove(CHAT_BG_BUCKET, [cur.image_path]).catch(() => {});
}

/** Kovadaki görseli blob olarak indir ("Bu arka planı kullan": kendi ayar klasörüne kaydetmek için) */
export async function sharedImageBlob(path: string): Promise<Blob> {
  const u = await sharedImageUrl(path);
  if (!u) throw new Error("Görsel artık yok.");
  const cached = blobCache.get(u);
  if (cached) return cached;
  // Önbellekte yoksa imzalı adresten doğrudan indir
  const signed = (await storageSignedUrls(CHAT_BG_BUCKET, [path], 600))[path];
  if (!signed) throw new Error("Görsel artık yok.");
  const r = await fetch(signed);
  if (!r.ok) throw new Error("Görsel artık yok.");
  return r.blob();
}
