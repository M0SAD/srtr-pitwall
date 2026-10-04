// Arkadaşlar: hesap üzerinden arkadaş listesi, çevrimiçi/yarışta durumu, güvenilir arkadaşlarla
// canlı veri (yakıt vb.) paylaşımı ve anlık mesajlar. Anlık kısım Supabase Realtime ile.

import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";
import { api, cloudEnabled, session, token } from "./supabase";
import { settings } from "@/sdk/settings";
import { F, assertFeature, proLocked } from "@/sdk/proFeatures";
import { cachedAvatar, noteAvatars } from "./profile";
import { t } from "@/sdk/i18n";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";

export interface Friend {
  friend_id: string;
  display_name: string;
  iracing_name: string | null;
  status: "pending_out" | "pending_in" | "accepted";
  /** Ben ona güveniyorum: verilerimi görebilir */
  trusted: boolean;
  /** Ondan mesaj almıyorum */
  muted: boolean;
  /** O bana güveniyor ve PRO: onun verilerini görebilirim (PRO olmayanın verisi paylaşılmaz) */
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
  /** Bu arkadaştan gelen mesajlarda açılır pencere/bildirim gösterme (c30) */
  notify_muted?: boolean;
  /** Bu arkadaştan gelen mesajlarda ses çalma (c30) */
  sound_muted?: boolean;
  /** Arkadaşın kendi profil fotoğrafı ("avatars" kovasındaki yol, c31) */
  avatar_path?: string | null;
  /** Çevrimiçiyse şu an bağlı olduğu sim: iracing | acc | ac | lmu | rf2 | ams2, yoksa "" (c31) */
  sim?: string;
  /** Sadece yöneticiye gelir (c65): arkadaş çevrimiçi ama "Çevrimdışı görün" seçmiş */
  invisible?: boolean;
}

export interface Person {
  id: string;
  display_name: string;
  iracing_name: string | null;
}

/**
 * Sistem mesajı bilgisi (c45): "bg" = sohbet arka planı değişti; grup sohbetinde ayrıca
 * join / leave / kick / owner / rename. Normal mesajda yoktur.
 */
export interface MsgMeta {
  t: "bg" | "join" | "leave" | "kick" | "owner" | "rename";
  /** bg: arka plan türü ("none" = kaldırıldı) */
  kind?: "solid" | "gradient" | "image" | "none";
  value?: string;
  /** bg: "chatbg" kovasındaki görsel yolu (eski görsel silinince düşer) */
  image?: string;
  user?: string;
  name?: string;
  by_name?: string;
}

export interface Message {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  created_at: string;
  read_at: string | null;
  meta?: MsgMeta | null;
}

/** Liste önizlemesi / bildirim metni: sistem mesajı kullanıcının dilinde, normal mesaj olduğu gibi */
export function msgPreview(m: { body: string; meta?: MsgMeta | null }): string {
  const x = m.meta;
  if (!x) return m.body;
  if (x.t === "bg") return x.kind === "none" ? `🖼️ ${t("Sohbet arka planını kaldırdı")}` : `🖼️ ${t("Sohbet arka planını değiştirdi")}`;
  if (x.t === "join") return `➕ ${t("{0} gruba eklendi", x.name ?? "?")}`;
  if (x.t === "leave") return `🚪 ${t("{0} gruptan ayrıldı", x.name ?? "?")}`;
  if (x.t === "kick") return `➖ ${t("{0} gruptan çıkarıldı", x.name ?? "?")}`;
  if (x.t === "owner") return `👑 ${t("{0} artık grubun sahibi", x.name ?? "?")}`;
  if (x.t === "rename") return `✏️ ${t("Grubun adı değişti: {0}", x.name ?? "?")}`;
  return m.body;
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
  /** Pistteki konum (tur yüzdesi 0..1) */
  lapPct?: number;
  best?: number;
  last?: number;
  laps?: { lap: number; time: number; valid: boolean; pit: boolean }[];
  /** Ekip (uzaktan pit) için ek veri (c53; bkz. cloud/crew.ts CrewLive) */
  crew?: import("./crew").CrewLive;
}

/** Arkadaşa özel bildirim / ses kapatma (friendships.notify_muted / sound_muted, sunucu c30) */
export interface FriendPrefs {
  notify_muted: boolean;
  sound_muted: boolean;
}
async function friendPrefs(): Promise<Record<string, FriendPrefs>> {
  const me = session()?.user.id;
  if (!me) return {};
  try {
    const rows = await api<({ friend_id: string } & FriendPrefs)[]>("GET", `friendships?user_id=eq.${me}&select=friend_id,notify_muted,sound_muted`);
    return Object.fromEntries((rows ?? []).map((r) => [r.friend_id, { notify_muted: !!r.notify_muted, sound_muted: !!r.sound_muted }]));
  } catch {
    return {}; // sunucu güncellenmemişse (c30 yok) hepsi açık sayılır
  }
}

/** Arkadaş listesi (+ arkadaşa özel bildirim/ses ayarları) */
export async function myFriends() {
  const [list, prefs] = await Promise.all([api<Friend[]>("POST", "rpc/my_friends", { body: {} }), friendPrefs()]);
  noteAvatars((list ?? []).map((f) => ({ id: f.friend_id, avatar_path: f.avatar_path })));
  return (list ?? []).map((f) => ({ ...f, notify_muted: !!prefs[f.friend_id]?.notify_muted, sound_muted: false }));
}
export const setFriendPrefs = (id: string, notifyMuted: boolean, soundMuted: boolean) =>
  api("POST", "rpc/friend_prefs", { body: { p_user: id, p_notify_muted: notifyMuted, p_sound_muted: soundMuted } });

export function findPeople(q: string) {
  const t = encodeURIComponent(q.replace(/[(),*]/g, " ").trim());
  const me = session()?.user.id ?? "";
  return api<Person[]>(
    "GET",
    `profiles?select=id,display_name,iracing_name&or=(display_name.ilike.*${t}*,iracing_name.ilike.*${t}*)&id=neq.${me}&limit=20`,
  );
}

/** accepting: karşı taraf zaten istek göndermişse (kabul etmek her zaman serbest) */
export const friendRequest = (id: string, accepting = false) => {
  if (!accepting) assertFeature(F.friendAdd, "Arkadaş eklemek");
  return api<string>("POST", "rpc/friend_request", { body: { p_user: id } });
};
export const friendRespond = (id: string, accept: boolean) => api("POST", "rpc/friend_respond", { body: { p_user: id, p_accept: accept } });
export const friendRemove = (id: string) => api("POST", "rpc/friend_remove", { body: { p_user: id } });
export const friendSet = (id: string, trusted: boolean, muted: boolean) =>
  api("POST", "rpc/friend_set", { body: { p_user: id, p_trusted: trusted, p_muted: muted } });

// Güvenilir arkadaşlar (c44): canlı veriyi (takım yakıtı) kod vermeden paylaşma
/** Sadece güvenilir işaretini değiştirir (sessiz ayarına dokunmaz) */
export const friendTrustSet = (id: string, trusted: boolean) => api("POST", "rpc/friend_trust_set", { body: { p_user: id, p_trusted: trusted } });
/**
 * Güvenilir yap / güvenilirden çıkar (c78): güvenilir arkadaş pitwall'ıma girebilir ve pit ayarlarımı değiştirebilir.
 * Sunucu c78 ile güvenilir işaretini ekip üyeliğine kendisi çevirir; eski sunucuda da çalışsın diye ekip yetkisi
 * (crew_set) ayrıca yazılır. Değiştirme yetkisi PRO'ya özelse PRO olmayan sürücünün arkadaşı yalnızca izler.
 */
export async function friendTrust(id: string, on: boolean) {
  const control = on && !proLocked(F.crew);
  // Eski sunucu (c78 yok) PRO olmayana "güvenilir" işaretini reddeder: ekip yetkisi yine de verilir
  const trustErr = await friendTrustSet(id, on).then(
    () => null,
    (e) => e as Error,
  );
  try {
    await api("POST", "rpc/crew_set", { body: { p_friend: id, p_view: on, p_control: control } });
  } catch (e) {
    // c78'li sunucuda üyelik zaten yazıldı (ör. 10 kişilik sınır hatası yok sayılır); ikisi de olmadıysa hata
    if (trustErr) throw e;
    return;
  }
  if (trustErr && !on) throw trustErr;
}
export interface ShareTrust {
  /** Kabul edilmiş tüm arkadaşlarım verimi görebilir */
  trust_all: boolean;
  /** Veri paylaşımı PRO'ya özel ve ben PRO değilim */
  needs_pro: boolean;
}
export const shareTrustGet = () => api<ShareTrust>("POST", "rpc/share_trust_get", { body: {} });
export const shareTrustAllSet = (on: boolean) => api("POST", "rpc/share_trust_all_set", { body: { p_on: on } });
/** Bana güvenen (verisini görebildiğim) arkadaş ve son canlı verisi */
export interface FriendShare {
  friend_id: string;
  display_name: string;
  avatar_path: string | null;
  online: boolean;
  racing: boolean;
  track: string;
  car: string;
  /** Son 2 dakikada veri göndermiş */
  live: boolean;
  data: LiveData | null;
  updated_at: string | null;
}
export const friendShares = () => api<FriendShare[]>("POST", "rpc/friend_shares", { body: {} });

export const sendMessage = (to: string, body: string) => {
  assertFeature(F.messages, "Mesaj göndermek");
  return api<string>("POST", "rpc/send_message", { body: { p_to: to, p_body: body } });
};
export const markRead = (from: string) => api("POST", "rpc/mark_read", { body: { p_from: from } }).catch(() => {});

/** Mesajı sadece kendi görünümünden kaldır (karşı taraf görmeye devam eder) */
export const hideMessage = (id: string) => api("POST", "rpc/hide_message", { body: { p_id: id } });
/** Sohbetin şu ana kadarki tüm mesajlarını kendi görünümünden kaldır (karşı tarafta kalır) */
export const clearConversation = (friend: string) => api("POST", "rpc/clear_conversation", { body: { p_friend: friend } });

/** Mesaj raporlama sebepleri (sunucudaki message_reports.reason ile aynı) */
export const MESSAGE_REPORT_REASONS: { id: string; label: string }[] = [
  { id: "harassment", label: "Hakaret / taciz" },
  { id: "spam", label: "Spam" },
  { id: "inappropriate", label: "Uygunsuz içerik" },
  { id: "scam", label: "Dolandırıcılık" },
  { id: "other", label: "Diğer" },
];
/** Sana gelen bir mesajı yöneticilere raporla */
export const reportMessage = (id: string, reason: string, note: string) =>
  api<string>("POST", "rpc/message_report", { body: { p_message: id, p_reason: reason, p_note: note } });

export function conversation(friend: string) {
  const me = session()?.user.id;
  return api<Message[]>(
    "GET",
    `messages?select=*&or=(and(sender.eq.${me},recipient.eq.${friend}),and(sender.eq.${friend},recipient.eq.${me}))&order=created_at.desc&limit=100`,
  ).then((r) => (r ?? []).reverse());
}

/** Bu arkadaştan gelen, henüz okunmamış son mesajlar (Realtime'ın kaçırdığı mesajın bildirimi için); en yeniden eskiye */
export function unreadFrom(friend: string, limit = 3) {
  const me = session()?.user.id;
  if (!me) return Promise.resolve([] as Message[]);
  return api<Message[]>("GET", `messages?select=*&sender=eq.${friend}&recipient=eq.${me}&read_at=is.null&order=created_at.desc&limit=${limit}`).then((r) => r ?? []);
}

/** Son mesajlar (arkadaş listesinde son mesaj önizlemesi için); en yeniden eskiye */
export function recentMessages(limit = 200) {
  const me = session()?.user.id;
  if (!me) return Promise.resolve([] as Message[]);
  return api<Message[]>(
    "GET",
    `messages?select=*&or=(sender.eq.${me},recipient.eq.${me})&order=created_at.desc&limit=${limit}`,
  ).then((r) => r ?? []);
}

export interface MyStatus {
  racing: boolean;
  track: string;
  car: string;
  session: string;
  dnd: boolean;
  accept_messages: boolean;
  /** Bağlı sim (arkadaş listesinde "iRacing'de"), yoksa "" (sunucu c31) */
  sim?: string;
  /** Çevrimdışı görün: başkaları beni çevrimdışı görür, yöneticiler gerçek durumu görür (sunucu c65) */
  invisible?: boolean;
}

/** Sunucuda user_status.invisible yoksa (c65 kurulmadan) durum bu alan olmadan gönderilir */
let statusNoInvisible = false;
/** Sunucuda user_status.sim yoksa (c31 kurulmadan) durum sim olmadan gönderilir */
let statusNoSim = false;
export function setMyStatus(s: MyStatus): Promise<unknown> {
  const uid = session()?.user.id;
  if (!uid) return Promise.resolve();
  const send = (body: Partial<MyStatus>) =>
    api("POST", "user_status?on_conflict=user_id", {
      body: { user_id: uid, ...body, updated_at: new Date().toISOString() },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  const { sim, invisible, ...rest0 } = s;
  const rest: Partial<MyStatus> = statusNoInvisible ? rest0 : { ...rest0, invisible: !!invisible };
  if (statusNoSim) return send(rest).catch(() => {});
  return send({ ...rest, sim: sim ?? "" }).catch((e) => {
    const msg = String((e as Error)?.message ?? "");
    // Sadece "sütun yok" hatasında (eski sunucu) alan bırakılır. Başka bir hatada bırakılırsa "Çevrimdışı görün"
    // bir daha sunucuya yazılamaz ve üye, durumunu Çevrimiçi yapsa bile arkadaşlarına gizli kalırdı.
    const noColumn = /column|schema cache/i.test(msg);
    if (!statusNoInvisible && noColumn && /\binvisible\b/.test(msg)) {
      statusNoInvisible = true;
      return setMyStatus(s);
    }
    if (!noColumn || !/\bsim\b/.test(msg)) return;
    statusNoSim = true;
    return send(rest).catch(() => {});
  });
}

/** Canlı verimi gönder: veri paylaşımı PRO üyelere özel (sunucu da PRO olmayanın yüklemesini reddeder) */
export function pushLive(data: LiveData, crewOnly = false) {
  const uid = session()?.user.id;
  // crewOnly: veri paylaşımı kapalı ama ekibimde izleyen var (c53; izlemek PRO istemez, sunucu denetler)
  if (!uid || (!crewOnly && proLocked("social.data_share"))) return Promise.resolve();
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

/** Ortak Realtime bağlantısı (takım sohbeti de kullanır) */
export async function realtime() {
  return client();
}

async function client() {
  if (!cloudEnabled || !URL_ || !KEY) return null;
  const t = await token();
  if (!t) return null;
  if (!rt) {
    rt = new RealtimeClient(`${URL_.replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: KEY } });
    rt.onHeartbeat((status) => {
      if (status === "sent") lastBeat = Date.now();
      else if (status !== "ok") socialLog(`realtime: kalp atisi ${status}`);
    });
    // Oturum anahtarı yenilendikçe Realtime'a da ver. Anahtar bitmeden yenilenmeli: süresi dolan anahtarla
    // sunucu kanalı kapatır ve yenisi verilene kadar mesaj gelmez (eskiden 5 dk'da bir bakılıyordu).
    setInterval(() => void syncRealtimeAuth(), 60_000);
  }
  rtToken = t;
  rt.setAuth(t);
  return rt;
}

/** Realtime'a en son verilen oturum anahtarı */
let rtToken = "";
/** Son kalp atışının gönderildiği an */
let lastBeat = 0;

async function syncRealtimeAuth() {
  const nt = await token();
  if (!nt || !rt || nt === rtToken) return;
  rtToken = nt;
  rt.setAuth(nt);
}

/**
 * Bağlantıyı canlı tut (overlay penceresindeki arkadaş servisi, Rust tarafındaki saatten 15 sn'de bir çağırır).
 * Overlay penceresi oyun kapalıyken gizlidir; gizli sayfada tarayıcı zamanlayıcıları dakikada bire kadar
 * kısılır: kütüphanenin 25 sn'lik kalp atışı gecikir, sunucu bağlantıyı düşürür ve mesaj anında gelmez.
 * Burada gecikmiş kalp atışı elle gönderilir, kopmuş bağlantı yeniden kurulur, oturum anahtarı tazelenir.
 */
export async function realtimeKeepAlive() {
  if (!rt) return;
  await syncRealtimeAuth().catch(() => {});
  if (!rt.isConnected()) {
    if (!rt.isConnecting() && rt.channels.length) {
      socialLog("realtime: baglanti kopuk, yeniden baglaniliyor");
      rt.connect();
    }
    return;
  }
  // Kütüphanenin kendi zamanlayıcısı çalışıyorsa (25 sn) dokunma; gecikmişse gönder
  if (Date.now() - lastBeat > 40_000) void rt.sendHeartbeat();
}

/**
 * Bildirim günlüğü (uygulama veri klasöründe social.log): mesaj geldi / kart gösterildi / neden gösterilmedi.
 * Mesaj metni ve oturum anahtarı yazılmaz.
 */
export function socialLog(line: string) {
  if (inTauri) invoke("social_log", { line }).catch(() => {});
}

/** Bana gelen mesajlar (yeni kayıt geldikçe) */
/**
 * `onStatus`: abonelik durumu (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED); bağlantı hiç kurulamadıysa
 * (oturum yok / anahtar alınamadı) "NO_CLIENT" — çağıran daha sonra yeniden denemeli.
 */
export async function onMessages(cb: (m: Message) => void, onStatus?: (status: string) => void): Promise<() => void> {
  const c = await client();
  const uid = session()?.user.id;
  if (!c || !uid) {
    onStatus?.("NO_CLIENT");
    return () => {};
  }
  const ch: RealtimeChannel = c
    .channel(`inbox-${uid}-${Math.random().toString(36).slice(2, 7)}`)
    .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${uid}` }, (p: any) =>
      cb(p.new as Message),
    )
    .subscribe((status) => onStatus?.(String(status)));
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

/**
 * Pencerenin (panel: "main", Arkadaşlar penceresi: "friends") şu an gösterdiği özel sohbetin arkadaş kimliği.
 * Pencereler aynı depoyu paylaşır: overlay penceresindeki arkadaş servisi, öndeki pencere zaten o sohbeti
 * gösteriyorsa açılır pencere / ses çıkarmaz.
 */
export const chatOpenKey = (label: string) => `pitwall.chatOpen.${label}`;

/** Kısa bildirim sesi (dosya gerekmez) */
export function messageBeep(volume = 0.25) {
  // Rahatsız Etme: hiçbir bildirim sesi çalmaz (tek kapı; ayrı "Ses" düğmesi kaldırıldı, ses onun dışında hep açık)
  if (settings().general.social.dnd) return;
  // Programda ses Rust tarafında çalınır: overlay penceresi hiç tıklanmadığı için tarayıcının otomatik
  // oynatma kuralı oradaki AudioContext'i askıda bırakır ve bildirim sesi hiç duyulmaz.
  if (inTauri) {
    // 0.25 → 0.6: önceki seviye (0.5) oyun / yayın sesi arasında zor duyuluyordu
    invoke("message_beep", { volume: Math.min(1, volume * 2.4) }).catch(() => {});
    return;
  }
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

// ---------------------------------------------------------------------------
// İfadeler (emoji) ve avatar rengi: panel, Arkadaşlar penceresi ve mesaj açılır penceresi ortak kullanır
// ---------------------------------------------------------------------------

/** Seçilebilen ifadeler (emoji seçici: özel sohbet ve takım sohbeti) */
export const EMOJI_PICKS = [
  "😀", "😄", "😂", "🤣", "😊", "🙂", "😉", "😍",
  "😘", "😎", "🤔", "😮", "😢", "😭", "😡", "🙁",
  "😛", "😆", "😅", "🙃", "😴", "🥳", "🤯", "😬",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "👋", "🤝",
  "❤️", "🔥", "💯", "🎉", "🏁", "🏆", "🚗", "⛽",
];

/** Yazı ifadeleri → emoji. "gg" gibi kısaltmalar yazı olarak kalır. */
export const EMOTICONS: [string, string][] = [
  [":'(", "😢"],
  [":+1:", "👍"],
  [":-)", "🙂"],
  [":)", "🙂"],
  [":-D", "😄"],
  [":D", "😄"],
  [";-)", "😉"],
  [";)", "😉"],
  [":-(", "🙁"],
  [":(", "🙁"],
  [":-P", "😛"],
  [":P", "😛"],
  [":p", "😛"],
  [":-O", "😮"],
  [":O", "😮"],
  [":o", "😮"],
  ["<3", "❤️"],
  ["xD", "😆"],
  ["XD", "😆"],
  ["8)", "😎"],
  ["B)", "😎"],
];

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// İfade sadece tek başına yazıldığında değişir (başında boşluk/satır başı, sonunda boşluk/noktalama/son):
// "http://", "(1-8)" ya da "abc:Dx" gibi yazılar bozulmaz.
const EMO_ALT = EMOTICONS.map(([k]) => escRe(k)).join("|");
const EMO_ALL = new RegExp(`(^|\\s)(${EMO_ALT})(?=$|\\s|[.,!?])`, "g");
const EMO_TYPED = new RegExp(`(^|\\s)(${EMO_ALT})(?=\\s)`, "g");
const EMO_MAP = new Map(EMOTICONS);

/** Tüm ifadeleri emojiye çevirir (gönderirken ve gösterirken) */
export function emojify(text: string) {
  return text.replace(EMO_ALL, (_m, pre: string, k: string) => pre + (EMO_MAP.get(k) ?? k));
}

/** Yazarken: sadece arkasından boşluk gelmiş (tamamlanmış) ifadeleri çevirir */
export function emojifyTyped(text: string) {
  return text.replace(EMO_TYPED, (_m, pre: string, k: string) => pre + (EMO_MAP.get(k) ?? k));
}

const EMOJI_RE = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/gu;

/** Mesajı yazı ve emoji parçalarına ayırır (emojiler biraz büyük çizilir) */
export function emojiParts(text: string): { t: string; emo: boolean }[] {
  return text
    .split(EMOJI_RE)
    .filter((x) => x !== "")
    .map((t) => ({ t, emo: /\p{Extended_Pictographic}/u.test(t) }));
}

/** Sadece 1-3 emojiden oluşan mesaj (büyük gösterilir) */
export function emojiOnly(text: string) {
  const p = emojiParts(text.trim()).filter((x) => x.t.trim() !== "");
  return p.length > 0 && p.length <= 3 && p.every((x) => x.emo);
}

/** Kimlikten sabit, okunaklı bir renk (arkadaşa özel renk seçilmemişse) */
export function hashColor(id: string) {
  // FNV-1a + karıştırma: benzer kimlikler de birbirinden farklı renk alsın
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `hsl(${h % 360} 58% 50%)`;
}

export function initialOf(name: string) {
  const c = [...(name || "?").trim()][0] ?? "?";
  return c.toLocaleUpperCase("tr");
}

/** Mesaj açılır penceresine (toast) giden kart */
export interface ToastPayload {
  id: string;
  kind: "message" | "request" | "trusted" | "team" | "group";
  /** Arkadaş kimliği; takım sohbetinde "team:<takım id>", grup sohbetinde "group:<grup id>" */
  friendId: string;
  name: string;
  body: string;
  color: string;
  photo?: string;
  ts: number;
}

/**
 * Arkadaşın avatarı: Arkadaşlar sayfasında ona özel seçilen renk/fotoğraf (PRO), yoksa üyenin kendi profil
 * fotoğrafı (c31), o da yoksa kimlikten renk + baş harf
 */
export function friendLook(id: string): { color: string; photo: string } {
  const e = settings().friends?.list?.find((x) => x.accountId === id);
  return { color: e?.color || hashColor(id), photo: e?.photo || cachedAvatar(id) };
}
