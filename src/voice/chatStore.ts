// Ses odası yazılı sohbeti (c121): odaya girince geçmiş yüklenir, yeni mesajlar Realtime ile gelir.
// Sohbet paneli kapalıyken de dinlenir; okunmamış sayısı panel düğmesinde görünür. Yalnızca odadakiler okur.

import { createEffect, createRoot, createSignal, on } from "solid-js";
import { session } from "@/cloud/supabase";
import { noteAvatars } from "@/cloud/profile";
import { onVoiceChat, voiceChat, voiceChatDelete, voiceChatSend, type VoiceMsg } from "@/cloud/voiceRooms";
import { voice } from "./engine";

const [msgs, setMsgs] = createSignal<VoiceMsg[]>([]);
const [loading, setLoading] = createSignal(false);
const [chatErr, setChatErr] = createSignal("");
const [hasOlder, setHasOlder] = createSignal(false);
const [unread, setUnread] = createSignal(0);
/** Sohbet şu an görünüyor mu (görünürken okunmamış sayılmaz) */
const [chatVisible, setChatVisible] = createSignal(false);
export { msgs as chatMsgs, loading as chatLoading, chatErr, hasOlder as chatHasOlder, unread as chatUnread, setChatVisible };

/** Gönderen adı (Realtime satırında ad yok): geçmişten ya da odadakilerden */
const names = new Map<string, string>();
export function senderName(m: VoiceMsg): string {
  if (m.sender_name) return m.sender_name;
  if (!m.sender) return "?";
  return names.get(m.sender) ?? voice.members().find((x) => x.user_id === m.sender)?.name ?? "?";
}

const upsert = (list: VoiceMsg[], m: VoiceMsg) => {
  const i = list.findIndex((x) => x.id === m.id);
  if (i < 0) return [...list, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const next = list.slice();
  next[i] = { ...list[i], ...m, sender_name: list[i].sender_name ?? m.sender_name, avatar_path: list[i].avatar_path ?? m.avatar_path };
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
};

function remember(list: VoiceMsg[]) {
  for (const m of list) if (m.sender && m.sender_name) names.set(m.sender, m.sender_name);
  noteAvatars(list.filter((m) => m.sender && m.avatar_path !== undefined).map((m) => ({ id: m.sender!, avatar_path: m.avatar_path })));
}

let stop: (() => void) | null = null;
let gen = 0;

async function open(room: string) {
  const my = ++gen;
  setMsgs([]);
  setUnread(0);
  setChatErr("");
  setHasOlder(false);
  setLoading(true);
  const off = await onVoiceChat(room, (m, kind) => {
    if (my !== gen) return;
    setMsgs((l) => upsert(l, m));
    if (kind === "insert" && m.sender !== session()?.user.id && !chatVisible()) setUnread((n) => n + 1);
  });
  if (my !== gen) return off();
  stop = off;
  // Ses oturumu sunucuya yazılınca okunabilir; ilk denemede henüz yoksa kısa aralıklarla yeniden dene
  for (let i = 0; i < 4 && my === gen; i++) {
    try {
      const list = await voiceChat(room);
      if (my !== gen) return;
      remember(list);
      setMsgs((cur) => list.reduce(upsert, cur));
      setHasOlder(list.length >= 80);
      setChatErr("");
      break;
    } catch (e) {
      setChatErr(String((e as Error)?.message ?? e));
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  if (my === gen) setLoading(false);
}

function close() {
  gen++;
  stop?.();
  stop = null;
  setMsgs([]);
  setUnread(0);
  setLoading(false);
}

createRoot(() => {
  createEffect(
    on(
      () => (voice.status() === "connected" || voice.status() === "reconnecting" ? (voice.room()?.id ?? "") : ""),
      (id, prev) => {
        if (id === prev) return;
        close();
        if (id) void open(id);
      },
    ),
  );
  createEffect(() => chatVisible() && setUnread(0));
});

export async function loadOlder() {
  const room = voice.room()?.id;
  const first = msgs()[0];
  if (!room || !first) return;
  const list = await voiceChat(room, first.created_at);
  remember(list);
  setMsgs((cur) => list.reduce(upsert, cur));
  setHasOlder(list.length >= 80);
}

export async function sendChat(body: string) {
  const room = voice.room()?.id;
  const text = body.trim();
  if (!room || !text) return;
  const me = session()?.user.id ?? null;
  const id = await voiceChatSend(room, text);
  // Realtime gecikirse kendi mesajım hemen görünsün
  if (id) setMsgs((l) => upsert(l, { id: String(id), room_id: room, sender: me, body: text, deleted: false, created_at: new Date().toISOString() }));
}

export async function deleteChat(id: string) {
  await voiceChatDelete(id);
  setMsgs((l) => l.map((m) => (m.id === id ? { ...m, deleted: true, body: "" } : m)));
}
