// Canlı Sohbet SDK'sı: Rust'taki canlı sohbet merkezinin (src-tauri/src/livechat) komutları, olayları ve tipleri.
//
// Bağlantılar Rust'ta çalışır (YouTube / Twitch / Kick okuma, Streamlabs uyarıları). Arayüz:
//   - ayarları `general.livechat` altında tutar (bkz. settings.ts LiveChatSettings; Rust aynı alanları okur),
//   - bu dosyadaki komutlarla başlatır/durdurur, anket açar, kullanıcı engeller…,
//   - olayları dinler (onMessages / onStatus / onPoll …) ya da overlay'lerde konulara abone olur
//     (useTopic("livechat" | "livepoll" | "captions")).
//
// Olaylar (Rust → tüm uygulama pencereleri):
//   livechat-message  ChatMsg[]          yeni mesajlar (filtrelenmiş)
//   livechat-delete   { ids: string[] }  silinen mesajlar
//   livechat-clear    null
//   livechat-status   LiveChatStatus
//   livechat-poll     PollView
//   livechat-captions CaptionView

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createSignal } from "solid-js";
import { inTauri } from "./platform";
import type { LiveChannel } from "./settings";

export type Platform = "youtube" | "twitch" | "kick" | "streamlabs" | "system";
export type MsgKind = "chat" | "superchat" | "sub" | "raid" | "donation" | "alert" | "system";

export type Part =
  | { t: "text"; v: string }
  | { t: "emote"; url: string; name: string }
  | { t: "link"; url: string; v: string }
  | { t: "mention"; v: string };

export interface Author {
  name: string;
  /** Küçük harfli giriş adı (yasaklama için) */
  login: string;
  id?: string;
  /** Kullanıcının kendi rengi (Twitch / Kick) */
  color?: string;
  avatar?: string;
  mod: boolean;
  sub: boolean;
  /** Kanal sahibi / yayıncı */
  owner: boolean;
  /** YouTube kanal üyesi */
  member: boolean;
  vip: boolean;
  badges?: string[];
}

export interface AlertInfo {
  /** subscriber | resubscriber | resub | sub | subgift | submysterygift | member | milestone | gift | follower |
   *  tip | cheer | raid | host | redemption | superchat | supersticker | announcement … */
  type: string;
  tier?: string;
  months?: number;
  gifted: boolean;
  count?: number;
  recipient?: string;
  currency?: string;
}

export interface ChatMsg {
  /** `<platform>:<nativeId>` */
  id: string;
  nativeId: string;
  platform: Platform;
  /** Kaynak anahtarı (ör. "twitch:erkinazcan") */
  channel: string;
  channelName: string;
  /** [kanal] etiketi gösterilsin mi */
  showTag: boolean;
  kind: MsgKind;
  author: Author;
  parts: Part[];
  text: string;
  /** Unix ms */
  ts: number;
  amount?: string;
  replyTo?: { user: string; text: string };
  alert?: AlertInfo;
  /** Platformun kendi olay metni (Twitch system-msg, YouTube üyelik başlığı) */
  headline?: string;
  action?: boolean;
  deleted: boolean;
  masked?: boolean;
  /** Ankette sayılan oy (şık numarası) */
  vote?: number;
}

export type ChannelState = "idle" | "connecting" | "live" | "offline" | "error" | "locked";

export interface ChannelStatus {
  key: string;
  platform: Platform | null;
  url: string;
  label: string;
  state: ChannelState;
  chat: boolean;
  viewers?: number;
  error?: string;
  hidden: boolean;
  mine: boolean;
  tag: boolean | null;
  videoId?: string;
}

export interface Viewers {
  youtube: number | null;
  twitch: number | null;
  kick: number | null;
  total: number | null;
}

export interface StreamlabsStatus {
  enabled: boolean;
  hasToken: boolean;
  connected: boolean;
  error: string | null;
  locked: boolean;
}

/**
 * Overlay kapısı (Rust: livechat/mod.rs live_gate): Canlı Sohbet overlay'leri ne göstersin.
 *   demo: benzetilmiş akış · real: gerçek mesajlar · offline: yayın canlı değil · stopped: sohbet durdurulmuş ·
 *   login: giriş yapılmamış · pro: OBS kaynağı PRO'ya özel · wait: karar henüz gelmedi (hiçbir şey çizilmez)
 */
export type GateMode = "demo" | "real" | "offline" | "stopped" | "login" | "pro" | "wait";
export interface LiveGate {
  /** Kullanıcının açtığı Demo modu */
  demo: boolean;
  running: boolean;
  live: boolean;
  loginOk: boolean;
  obsOk: boolean;
  /** Uygulama içindeki overlay penceresi için karar */
  app: GateMode;
  /** OBS tarayıcı kaynağı için karar */
  obs: GateMode;
}
/**
 * Bu yüzey (uygulama penceresi / tarayıcı kaynağı) için kapı kararı. Karar uygulamadan gelir; burada yalnızca
 * overlay'in kendi "Yalnızca yayın canlıyken göster" seçeneği uygulanır (kapalıysa "offline" → "real").
 */
export function gateMode(g: LiveGate | null | undefined, onlyLive = true, obs = !inTauri): GateMode {
  if (!g || !g.app) return "wait";
  const m = obs ? g.obs : g.app;
  return m === "offline" && !onlyLive ? "real" : m;
}

export interface LiveChatStatus {
  running: boolean;
  channels: ChannelStatus[];
  viewers: Viewers;
  streamlabs: StreamlabsStatus;
  /** Birden fazla kanal bağlanabilir (PRO) */
  multi: boolean;
  log: boolean;
  /** ★ favori kanallar kullanılabilir (PRO: livechat.favorites) */
  favorites: boolean;
  /** Giriş koşulu sağlanıyor (giriş yapılmış ya da yönetici zorunluluğu kapatmış) */
  loginOk: boolean;
  /** Bağlı kanallardan en az biri canlı yayında */
  anyLive: boolean;
  gate?: LiveGate;
}

/** "livechat" konusu */
export interface LiveChatTopic {
  running: boolean;
  /** Son 100 mesaj (silinenler deleted: true) */
  msgs: ChatMsg[];
  channels: ChannelStatus[];
  viewers: Viewers;
  rev: number;
  /** Bağlı kanallardan en az biri canlı yayında (overlay yalnızca bu doğruyken görünür) */
  anyLive: boolean;
  /** Giriş koşulu sağlanıyor (yanlışsa overlay'ler ekranda hiçbir şey çizmez) */
  loginOk: boolean;
  gate?: LiveGate;
}

export interface PollView {
  state: "idle" | "active" | "result";
  options: number;
  counts: number[];
  total: number;
  /** Kalan saniye (süresizse null) */
  remaining: number | null;
  endsAt: number | null;
  /** Kazanan(lar); beraberlik animasyonunda o an vurgulanan şık */
  winners: number[];
  tie: number[];
  spinning: boolean;
  picked: number | null;
  question: string;
  answers: string[];
  /** Türkçe özet (kayıt için) */
  resultText: string;
  rev: number;
}

export interface CaptionLine {
  src: "mic" | "remote";
  label: string;
  text: string;
  ts: number;
}

export interface CaptionView {
  lines: CaptionLine[];
  rev: number;
}

export interface ParsedLink {
  platform: Platform;
  url: string;
  key: string;
  label: string;
  ident: string;
  yt?: "video" | "handle" | "custom" | "user" | "channel";
}

export const PLATFORM_NAMES: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  streamlabs: "Streamlabs",
  system: "SRTR Pitwall",
};

/** Platform renkleri (MCO etiket renkleri) */
export const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: "#ff6b6b",
  twitch: "#b28cff",
  kick: "#53fc18",
  streamlabs: "#31c3a2",
  system: "#ff8a2a",
};

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

export const start = () => invoke<LiveChatStatus>("livechat_start");
export const stop = () => invoke<LiveChatStatus>("livechat_stop");
export const restart = () => invoke<LiveChatStatus>("livechat_restart");
export const getStatus = () => invoke<LiveChatStatus>("livechat_status");
/** Serbest metindeki linkleri tanır (boşluk/virgül/satır ayırıcı) */
export const parseLinks = (text: string) => invoke<{ valid: ParsedLink[]; invalid: string[] }>("livechat_parse_links", { text });
/** Kanal listesini kaydeder (Rust doğrular, tekrarları atar, platform başına tek "benim kanalım") */
export const setChannels = (channels: LiveChannel[]) => invoke<ChannelStatus[]>("livechat_channels_set", { channels });
export const history = (limit = 100) => invoke<ChatMsg[]>("livechat_history", { limit });
export const getState = () => invoke<{ chat: LiveChatTopic; poll: PollView; captions: CaptionView }>("livechat_state");

/** Anket başlat (PRO: livechat.poll). Verilmeyenler ayarlardan; duration 0 = süresiz */
export const pollStart = (o: { options?: number; duration?: number; question?: string; answers?: string[] } = {}) =>
  invoke<PollView>("livechat_poll_start", o);
/** Şimdi bitir (sonuç; beraberlikte rastgele seçim animasyonu) */
export const pollStop = () => invoke<PollView>("livechat_poll_stop");
/** İptal / sonucu kapat */
export const pollReset = () => invoke<PollView>("livechat_poll_reset");
export const pollGet = () => invoke<PollView>("livechat_poll_get");

/** Kullanıcıyı kalıcı engelle (ayarlardaki listeye eklenir, mesajları silinir) */
export const banUser = (user: string, platform?: Platform) => invoke<void>("livechat_ban_user", { user, platform });
export const unbanUser = (user: string) => invoke<void>("livechat_unban_user", { user });
/** Tek mesajı bu uygulamada gizle */
export const hideMessage = (id: string) => invoke<void>("livechat_hide_message", { id });
export const clearChat = () => invoke<void>("livechat_clear");
export const setLog = (on: boolean) => invoke<void>("livechat_log_set", { on });
/** Kayıt klasörünü aç; yolunu döner */
export const openLogDir = () => invoke<string>("livechat_log_open_dir");

/** Sohbet kaydının bir günü (dosyası) */
export interface LogDay {
  /** "YYYY-MM-DD" */
  date: string;
  bytes: number;
  lines: number;
}
/** Kayıt satırı: `[SS:DD:ss] [Etiket] Ad: metin` ayrıştırılmış hali */
export interface LogLine {
  n: number;
  time: string;
  /** "youtube" | "twitch" | "kick" | "streamlabs" | "system" | "" (anket, moderasyon, altyazı…) */
  platform: string;
  /** Kanal adı ya da platform dışı etiket (ör. "ANKET", "MOD") */
  channel: string;
  user: string;
  text: string;
}
export interface LogHit extends LogLine {
  date: string;
}
/** Kayıt günleri, yeniden eskiye (PRO gerekmez; içerik PRO: livechat.log) */
export const logDays = () => invoke<LogDay[]>("livechat_log_days");
/** Bir günün satırları (PRO: livechat.log) */
export const logRead = (date: string) => invoke<LogLine[]>("livechat_log_read", { date });
/** Tüm günlerde arama, en fazla 1000 sonuç (PRO: livechat.log). user: tam kullanıcı adı */
export const logSearch = (query: string, platform = "", user = "") => invoke<LogHit[]>("livechat_log_search", { query, platform, user });
/** Kayıtları sil (date yoksa hepsi); silinen dosya sayısı */
export const logDelete = (date?: string) => invoke<number>("livechat_log_delete", { date: date ?? null });
/** Günü İndirilenler klasörüne dışa aktar (PRO: livechat.log); dosya yolunu döner */
export const logExport = (date: string, format: "txt" | "csv") => invoke<string>("livechat_log_export", { date, format });
/** Streamlabs Socket API Token (boş: sil). Anahtar geri okunamaz. PRO: livechat.alerts */
export const setStreamlabsToken = (token: string) => invoke<StreamlabsStatus>("livechat_streamlabs_token_set", { token });
export const streamlabsStatus = () => invoke<StreamlabsStatus>("livechat_streamlabs_status");
/** Altyazı satırı (konuşmadan yazıya modülü için / test) */
export const pushCaption = (text: string, src: "mic" | "remote" = "mic", label = "") => invoke<void>("livechat_caption_push", { src, label, text });
export const clearCaptions = () => invoke<void>("livechat_caption_clear");

// ---------------------------------------------------------------------------
// Olaylar
// ---------------------------------------------------------------------------

const on = <T>(ev: string, fn: (p: T) => void): Promise<UnlistenFn> =>
  inTauri ? listen<T>(ev, (e) => fn(e.payload)) : Promise.resolve(() => {});

export const onMessages = (fn: (m: ChatMsg[]) => void) => on("livechat-message", fn);
export const onDelete = (fn: (ids: string[]) => void) => on<{ ids: string[] }>("livechat-delete", (p) => fn(p.ids));
export const onClear = (fn: () => void) => on("livechat-clear", () => fn());
export const onStatus = (fn: (s: LiveChatStatus) => void) => on("livechat-status", fn);
export const onPoll = (fn: (p: PollView) => void) => on("livechat-poll", fn);
export const onCaptions = (fn: (c: CaptionView) => void) => on("livechat-captions", fn);

/**
 * Panel için hazır durum: son mesajlar (en fazla `max`), kanal durumları, anket. İlk çağrıda geçmişi yükler
 * ve olayları dinler; tüm pencere boyunca tek kopya.
 */
let store: ReturnType<typeof makeStore> | null = null;
function makeStore(max: number) {
  const [msgs, setMsgs] = createSignal<ChatMsg[]>([]);
  const [status, setStatus] = createSignal<LiveChatStatus | null>(null);
  const [poll, setPoll] = createSignal<PollView | null>(null);
  const [captions, setCaptions] = createSignal<CaptionView | null>(null);
  if (inTauri) {
    void (async () => {
      await onMessages((list) => setMsgs((l) => [...l, ...list].slice(-max)));
      await onDelete((ids) => setMsgs((l) => l.map((m) => (ids.includes(m.id) ? { ...m, deleted: true } : m))));
      await onClear(() => setMsgs([]));
      await onStatus(setStatus);
      await onPoll(setPoll);
      await onCaptions(setCaptions);
      const [h, s, st] = await Promise.all([history(max), getStatus(), getState()]);
      setMsgs((l) => {
        const seen = new Set(l.map((m) => m.id));
        return [...h.filter((m) => !seen.has(m.id)), ...l].slice(-max);
      });
      setStatus(s);
      setPoll(st.poll);
      setCaptions(st.captions);
    })().catch(() => {});
  }
  return { msgs, status, poll, captions };
}
export function useLiveChat(max = 200) {
  return (store ??= makeStore(max));
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Linkin platformu (anında, Rust'a sormadan; kesin doğrulama parseLinks/setChannels ile) */
export function detectPlatform(url: string): Platform | null {
  const u = url.toLowerCase();
  if (/(^|[/.])youtu\.be\/[\w-]+/.test(u) || /youtube\.com\/(watch\?|live\/|embed\/|shorts\/|@|c\/|user\/|channel\/)/.test(u)) return "youtube";
  if (/twitch\.tv\/(popout\/)?[\w-]+/.test(u) && !/twitch\.tv\/(videos|directory|settings|downloads|p|search)(\/|$)/.test(u)) return "twitch";
  if (/kick\.com\/(popout\/)?[\w-]+/.test(u) && !/kick\.com\/(categories|browse|following|search|video)(\/|$)/.test(u)) return "kick";
  return null;
}

/** Ad kısaltma (MCO: name[:max-1] + "…") */
export function shortName(name: string, max: number): string {
  return max > 0 && name.length > max ? name.slice(0, Math.max(1, max - 1)) + "…" : name;
}

/** 12345 → 12.345 */
export function fmtCount(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("tr-TR");
}

// ---------------------------------------------------------------------------
// Sesli okuma (TTS, PRO: livechat.tts) — Rust: livechat/tts.rs
// ---------------------------------------------------------------------------

export interface TtsStatus {
  enabled: boolean;
  allowed: boolean;
  /** Windows'ta çalışıyor */
  supported: boolean;
  speaking: boolean;
  queue: number;
  error: string | null;
}

export interface TtsVoice {
  id: string;
  name: string;
  /** ör. "tr-TR" */
  language: string;
  female: boolean;
}

/** Kurulu Windows sesleri (Windows değilse hata) */
export const ttsVoices = () => invoke<TtsVoice[]>("livechat_tts_voices");
/** Ses çıkış cihazlarının adları */
export const audioOutputs = () => invoke<string[]>("livechat_audio_outputs");
export const ttsStatus = () => invoke<TtsStatus>("livechat_tts_status");
/** Deneme okuması (kayıtlı olmayan değerlerle) */
export const ttsTest = (o: { text: string; voice: string; device: string; rate: number; pitch: number; volume: number }) => invoke<void>("livechat_tts_test", o);
export const ttsSkip = () => invoke<void>("livechat_tts_skip");
export const ttsClear = () => invoke<void>("livechat_tts_clear");
export const onTts = (fn: (s: TtsStatus) => void) => on("livechat-tts", fn);

// ---------------------------------------------------------------------------
// Konuşmayı yazıya çevirme (STT, PRO: livechat.stt) — Rust: livechat/stt.rs
// ---------------------------------------------------------------------------

export interface SttStatus {
  enabled: boolean;
  allowed: boolean;
  supported: boolean;
  listening: boolean;
  language: string;
  error: string | null;
  last: string | null;
}

export const sttLanguages = () => invoke<{ languages: [string, string][]; system: string | null; error: string | null }>("livechat_stt_languages");
export const sttStatus = () => invoke<SttStatus>("livechat_stt_status");
export const sttRestart = () => invoke<SttStatus>("livechat_stt_restart");
export const onStt = (fn: (s: SttStatus) => void) => on("livechat-stt", fn);

/** Kısayol bildirimi (Rust: "livechat-notice") */
export const onNotice = (fn: (text: string) => void) => on<{ text: string }>("livechat-notice", (p) => fn(p.text));

// ---------------------------------------------------------------------------
// Sohbete yaz (PRO: livechat.send) — Rust: livechat/send.rs
// ---------------------------------------------------------------------------

export interface SendAccount {
  connected: boolean;
  login: string;
}

export interface SendStatus {
  allowed: boolean;
  twitch: SendAccount;
  youtube: SendAccount;
  kick: SendAccount;
  /** Twitch cihaz kodu (onay bekleniyor) */
  device: { userCode: string; verificationUri: string; expiresAt: number } | null;
  /** Tarayıcıda giriş bekleniyor */
  pending: "youtube" | "kick" | null;
  error: string | null;
  ytRedirect: string;
  kickRedirect: string;
}

export interface SendResult {
  key: string;
  platform: Platform;
  label: string;
  ok: boolean;
  error: string | null;
}

/** Edge function (chat-oauth) çağrısı için taze oturum bilgisi; giriş yoksa jwt boş */
async function cloudAuth() {
  const { cloudEnabled, token } = await import("@/cloud/supabase");
  const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "").replace(/\/$/, "");
  const apikey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
  const jwt = cloudEnabled ? ((await token().catch(() => null)) ?? "") : "";
  return { url: url ? `${url}/functions/v1` : "", apikey, jwt };
}

export const sendStatus = () => invoke<SendStatus>("livechat_send_status");
/** Twitch: cihaz kodu akışı (kod ekranda gösterilir, onay arka planda beklenir) */
export const twitchLogin = (clientId: string) => invoke<SendStatus>("livechat_twitch_login", { clientId });
/** YouTube / Kick: tarayıcıda giriş (PKCE), anahtar değişimi chat-oauth edge function üzerinden */
export const oauthLogin = async (provider: "youtube" | "kick", clientId: string) =>
  invoke<SendStatus>("livechat_oauth_login", { provider, clientId, cloud: await cloudAuth() });
export const authCancel = () => invoke<SendStatus>("livechat_auth_cancel");
export const authLogout = (platform: "twitch" | "youtube" | "kick") => invoke<SendStatus>("livechat_auth_logout", { platform });
/** Mesaj gönder: target "mine" (★ kanallarım) ya da kanal anahtarı */
export const sendMessage = async (text: string, target: string) =>
  invoke<SendResult[]>("livechat_send", { text, target, cloud: await cloudAuth() });
export const onSend = (fn: (s: SendStatus) => void) => on("livechat-send", fn);
