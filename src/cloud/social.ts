// Arkadaşlar: hesap üzerinden arkadaş listesi, çevrimiçi/yarışta durumu, güvenilir arkadaşlarla
// canlı veri (yakıt vb.) paylaşımı ve anlık mesajlar. Anlık kısım Supabase Realtime ile.

import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";
import { api, cloudEnabled, session, token } from "./supabase";

export interface Friend {
  friend_id: string;
  display_name: string;
  iracing_name: string | null;
  status: "pending_out" | "pending_in" | "accepted";
  /** Ben ona güveniyorum: verilerimi görebilir */
  trusted: boolean;
  /** Ondan mesaj almıyorum */
  muted: boolean;
  /** O bana güveniyor: onun verilerini görebilirim */
  trusts_me: boolean;
  online: boolean;
  racing: boolean;
  track: string;
  car: string;
  session: string;
  dnd: boolean;
  accept_messages: boolean;
  last_seen: string | null;
  unread: number;
}

export interface Person {
  id: string;
  display_name: string;
  iracing_name: string | null;
}

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** Arkadaşın paylaştığı canlı veri (yakıt hesaplayıcının özeti + pist bilgisi) */
export interface LiveData {
  sender: string;
  car: string;
  number: string;
  level: number;
  pct: number;
  max: number;
  usage: number;
  lapsLeft: number;
  refuel: number;
  lap: number;
  onPit: boolean;
  ts: number;
  track?: string;
  position?: number;
  session?: string;
}

export const myFriends = () => api<Friend[]>("POST", "rpc/my_friends", { body: {} });

export function findPeople(q: string) {
  const t = encodeURIComponent(q.replace(/[(),*]/g, " ").trim());
  const me = session()?.user.id ?? "";
  return api<Person[]>(
    "GET",
    `profiles?select=id,display_name,iracing_name&or=(display_name.ilike.*${t}*,iracing_name.ilike.*${t}*)&id=neq.${me}&limit=20`,
  );
}

export const friendRequest = (id: string) => api<string>("POST", "rpc/friend_request", { body: { p_user: id } });
export const friendRespond = (id: string, accept: boolean) => api("POST", "rpc/friend_respond", { body: { p_user: id, p_accept: accept } });
export const friendRemove = (id: string) => api("POST", "rpc/friend_remove", { body: { p_user: id } });
export const friendSet = (id: string, trusted: boolean, muted: boolean) =>
  api("POST", "rpc/friend_set", { body: { p_user: id, p_trusted: trusted, p_muted: muted } });

export const sendMessage = (to: string, body: string) => api<string>("POST", "rpc/send_message", { body: { p_to: to, p_body: body } });
export const markRead = (from: string) => api("POST", "rpc/mark_read", { body: { p_from: from } }).catch(() => {});

export function conversation(friend: string) {
  const me = session()?.user.id;
  return api<Message[]>(
    "GET",
    `messages?select=*&or=(and(sender.eq.${me},recipient.eq.${friend}),and(sender.eq.${friend},recipient.eq.${me}))&order=created_at.desc&limit=100`,
  ).then((r) => (r ?? []).reverse());
}

export interface MyStatus {
  racing: boolean;
  track: string;
  car: string;
  session: string;
  dnd: boolean;
  accept_messages: boolean;
}

export function setMyStatus(s: MyStatus) {
  const uid = session()?.user.id;
  if (!uid) return Promise.resolve();
  return api("POST", "user_status?on_conflict=user_id", {
    body: { user_id: uid, ...s, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  }).catch(() => {});
}

export function pushLive(data: LiveData) {
  const uid = session()?.user.id;
  if (!uid) return Promise.resolve();
  return api("POST", "live_data?on_conflict=user_id", {
    body: { user_id: uid, data, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates,return=minimal",
  }).catch(() => {});
}

export async function getLive(user: string) {
  const rows = await api<{ data: LiveData; updated_at: string }[]>("GET", `live_data?user_id=eq.${user}&select=data,updated_at`);
  return rows?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Realtime (anlık mesaj, canlı veri)
// ---------------------------------------------------------------------------

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
let rt: RealtimeClient | null = null;

async function client() {
  if (!cloudEnabled || !URL_ || !KEY) return null;
  const t = await token();
  if (!t) return null;
  if (!rt) {
    rt = new RealtimeClient(`${URL_.replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: KEY } });
    // Oturum anahtarı yenilendikçe Realtime'a da ver
    setInterval(async () => {
      const nt = await token();
      if (nt && rt) rt.setAuth(nt);
    }, 5 * 60_000);
  }
  rt.setAuth(t);
  return rt;
}

/** Bana gelen mesajlar (yeni kayıt geldikçe) */
export async function onMessages(cb: (m: Message) => void): Promise<() => void> {
  const c = await client();
  const uid = session()?.user.id;
  if (!c || !uid) return () => {};
  const ch: RealtimeChannel = c
    .channel(`inbox-${uid}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${uid}` }, (p: any) =>
      cb(p.new as Message),
    )
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

/** Güvendiği arkadaşların canlı verisi (ekleme/güncelleme geldikçe) */
export async function onLive(users: string[], cb: (user: string, d: LiveData) => void): Promise<() => void> {
  const c = await client();
  if (!c || users.length === 0) return () => {};
  const ch: RealtimeChannel = c
    .channel(`live-${Math.random().toString(36).slice(2, 9)}`)
    .on("postgres_changes" as any, { event: "*", schema: "public", table: "live_data", filter: `user_id=in.(${users.slice(0, 100).join(",")})` }, (p: any) => {
      const row = p.new as { user_id: string; data: LiveData };
      if (row?.user_id) cb(row.user_id, row.data);
    })
    .subscribe();
  return () => {
    c.removeChannel(ch);
  };
}

/** Kısa bildirim sesi (dosya gerekmez) */
export function messageBeep(volume = 0.25) {
  try {
    const ac = new AudioContext();
    const g = ac.createGain();
    g.gain.value = volume;
    g.connect(ac.destination);
    [880, 1320].forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start(ac.currentTime + i * 0.12);
      o.stop(ac.currentTime + i * 0.12 + 0.1);
    });
    setTimeout(() => ac.close(), 600);
  } catch {
    /* ses yok */
  }
}
