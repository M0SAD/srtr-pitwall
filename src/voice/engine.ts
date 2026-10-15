// Ses odası motoru (panel penceresinde tek örnek; sayfa değişse de bağlantı sürer).
//
// Ses yolu: tek RTCPeerConnection → Cloudflare Realtime SFU. Mikrofon bir kez "push" edilir; dinleyici yalnızca
// konuşma hakkı olanların seslerini "pull" eder (SFU aracısı Edge Function "voice-sfu" bu hakkı sunucuda denetler).
// Kalabalık söz hakkıyla yönetilen odada (moderated) herkes sadece 1-3 konuşmacıyı çeker: 40 kişilik turnuva odasında
// kişi başı indirme ~60-100 kbps kalır. Sessizken Opus DTX neredeyse hiç veri göndermez.
//
// Kimin odada olduğu: Supabase Realtime presence (oda kanalı, voice_room_join'den gelen gizli adla).
// Söz hakları / sıra / yetkiler: voice_room_state (10 sn'de bir + değişiklikte "refresh" yayını).

import { createSignal } from "solid-js";
import { emit } from "@tauri-apps/api/event";
import type { RealtimeChannel } from "@supabase/realtime-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { session } from "@/cloud/supabase";
import { profile } from "@/cloud/account";
import { realtime } from "@/cloud/social";
import { inTauri } from "@/sdk/platform";
import { uiPref } from "@/sdk/settings";
import { t } from "@/sdk/i18n";
import { sfu, voiceHeartbeat, voiceRoomState, type VoiceJoin, type VoiceRole, type VoiceState } from "@/cloud/voiceRooms";
import { buildMicChain, getMicStream, meterNode, micMeter, outputDevice, type MicChain } from "./micChain";
export * from "./micChain";
import { VOICE_OVERLAY_EVENT, VOICE_OVERLAY_REQ, type VoiceOverlayData, type VoiceOverlayMember } from "./overlayTypes";

export interface VoiceMember {
  user_id: string;
  name: string;
  /** SFU oturumu */
  sid: string;
  /** Mikrofonunu kapatmış (ya da sesi kapalı) */
  muted: boolean;
  deaf: boolean;
}

export type VoiceStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

// ---- Kullanıcı tercihleri (hesapla eşitlenir)
export const [inputMode, setInputMode] = uiPref<"open" | "ptt">("voice.room.input", "open");
export const [masterVolume, setMasterVolume] = uiPref<number>("voice.room.vol", 100);
/** Kişi başı ses (0..200 %) */
export const [userVolumes, setUserVolumes] = uiPref<Record<string, number>>("voice.room.userVol", {});
/** Söz hakkı geldiğinde / bittiğinde kısa ses */
export const [cueSounds, setCueSounds] = uiPref<boolean>("voice.room.cues", true);

// ---- Durum
const [status, setStatus] = createSignal<VoiceStatus>("idle");
const [error, setError] = createSignal("");
const [room, setRoom] = createSignal<VoiceJoin | null>(null);
const [members, setMembers] = createSignal<VoiceMember[]>([]);
const [vstate, setVstate] = createSignal<VoiceState | null>(null);
/** Sunucu saati - yerel saat (ms): geri sayımlar sunucuya göre */
const [clockSkew, setClockSkew] = createSignal(0);
const [micOn, setMicOn] = createSignal(true);
const [deafened, setDeafened] = createSignal(false);
const [pttHeld, setPttHeld] = createSignal(false);
/** Konuşma göstergesi: kişi → ses seviyesi 0..1 (çekilen izlerden; kendim için kapı açıkken mikrofon) */
const [levels, setLevels] = createSignal<Record<string, number>>({});
const [micTest, setMicTestSig] = createSignal(false);
/** Yerelde susturulanlar (bu oturum) */
const [localMuted, setLocalMuted] = createSignal<string[]>([]);
/** Saniyelik tik (geri sayım çizimleri için) */
const [tick, setTick] = createSignal(Date.now());

export const voice = {
  status,
  error,
  room,
  members,
  state: vstate,
  micOn,
  deafened,
  pttHeld,
  /** Kendi mikrofon seviyem 0..1 (sadece iletilirken) */
  myLevel: () => (transmitting() && micMeter.open() ? dbToLevel(micMeter.db()) : 0),
  levels,
  micTest,
  localMuted,
  tick,
  /** Sunucu saatine göre şimdi (ms) */
  now: () => tick() + clockSkew(),
};

const uid = () => session()?.user.id ?? "";

/** dB → 0..1 (-60 dB sessiz, -10 dB tam) */
export const dbToLevel = (db: number) => Math.max(0, Math.min(1, (db + 60) / 50));
/** Kişi konuşuyor mu (gösterge eşiği) */
export const levelOf = (user: string) => (user === uid() ? voice.myLevel() : (levels()[user] ?? 0));
export const isTalking = (user: string) => levelOf(user) > 0.12;

export function myRole(): VoiceRole | null {
  return (vstate()?.my_role as VoiceRole | null) ?? room()?.role ?? null;
}
export const amMod = () => ["owner", "admin", "mod"].includes(myRole() ?? "");
export const amAdmin = () => ["owner", "admin"].includes(myRole() ?? "");

/** Kişinin odadaki yetkisi (durumdan) */
export function roleOf(user: string): VoiceRole {
  const st = vstate();
  const r = st?.roles.find((x) => x.user_id === user);
  return (r?.role as VoiceRole) ?? "member";
}

/** Söz hakkı bitişi (ms, sunucu saati) ya da null */
export function grantUntil(user: string): number | null {
  const g = vstate()?.grants.find((x) => x.user_id === user);
  if (!g) return null;
  const ms = Date.parse(g.until);
  return ms > voice.now() ? ms : null;
}

/** Kişinin sesi odaya iletilebilir mi (sunucu kuralının istemci kopyası; asıl denetim Edge Function'da) */
export function canSpeak(user: string): boolean {
  const st = vstate();
  const mode = st?.mode ?? room()?.mode;
  if (mode === "open") return true;
  if (["owner", "admin", "mod", "speaker"].includes(roleOf(user))) return true;
  if (user === room()?.owner) return true;
  return grantUntil(user) !== null;
}

/** Şu an mikrofonum iletiliyor mu */
export const transmitting = () => status() === "connected" && canSpeak(uid()) && !deafened() && (inputMode() === "ptt" ? pttHeld() : micOn());

/** Mikrofonum kapalı mı (açık mikrofonda kapattım ya da sesi kapattım; bas-konuşta basmamak kapalı sayılmaz) */
export const micMuted = () => deafened() || (inputMode() === "open" && !micOn());

export const requested = () => !!vstate()?.requests.some((r) => r.user_id === uid());

// ---------------------------------------------------------------------------
// Bağlantı
// ---------------------------------------------------------------------------

let pc: RTCPeerConnection | null = null;
let sid = "";
let mic: MediaStream | null = null;
let chain: MicChain | null = null;
let micTx: RTCRtpTransceiver | null = null;
let chan: RealtimeChannel | null = null;
let ctx: AudioContext | null = null;
let timers: number[] = [];
let expiryTimer = 0;
let joinArgs: { room: string | null; code: string | null } | null = null;
let retries = 0;
let unPtt: (() => void) | null = null;
/** SDP işlemleri sırayla (aynı anda iki teklif olmaz) */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(f: () => Promise<T>): Promise<T> => {
  const p = queue.then(f, f);
  queue = p.catch(() => {});
  return p;
};

interface Pulled {
  mid: string;
  user: string;
  el: HTMLAudioElement;
  gain: GainNode | null;
  meter: AudioWorkletNode | null;
  src: MediaStreamAudioSourceNode | null;
}
/** Çekilen izler: hedef oturum → iz */
const pulled = new Map<string, Pulled>();
/** İstendi, iz henüz gelmedi: mid → hedef */
const pendingMid = new Map<string, string>();
/** Reddedilen hedefler (söz hakkı yok): durum değişene kadar tekrar sorulmaz */
const denied = new Set<string>();

function audioCtx(): AudioContext {
  if (!ctx) {
    // RNNoise 48 kHz ister
    try {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    } catch {
      ctx = new AudioContext();
    }
    void applyOutput();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

async function applyOutput() {
  const dev = outputDevice();
  // deno-lint-ignore no-explicit-any
  const c = ctx as any;
  if (c?.setSinkId) await c.setSinkId(dev || "").catch(() => {});
}

/** Opus: DTX (sessizken neredeyse sıfır veri), FEC, mono ~32 kbps */
function tuneOpus(sdp: string): string {
  return sdp.replace(/a=fmtp:(\d+) ([^\r\n]*)/g, (line, pt, params: string) => {
    if (!new RegExp(`a=rtpmap:${pt} opus/`, "i").test(sdp)) return line;
    let p = params;
    if (!/usedtx=/.test(p)) p += ";usedtx=1";
    if (!/useinbandfec=/.test(p)) p += ";useinbandfec=1";
    if (!/maxaveragebitrate=/.test(p)) p += ";maxaveragebitrate=32000";
    return `a=fmtp:${pt} ${p}`;
  });
}

function micError(e: unknown): string {
  const n = (e as DOMException)?.name;
  if (n === "NotAllowedError") return t("Mikrofon izni verilmedi. Windows › Gizlilik › Mikrofon'dan masaüstü uygulamalarına izin ver.");
  if (n === "NotFoundError" || n === "OverconstrainedError") return t("Mikrofon bulunamadı. Ses ayarlarından başka bir giriş aygıtı seç.");
  if (n === "NotReadableError") return t("Mikrofon başka bir uygulama tarafından kullanılıyor.");
  return String((e as Error)?.message ?? e);
}

/** Odaya gir (oda kimliği ya da davet kodu) */
export async function joinRoom(roomId: string | null, code: string | null = null) {
  if (status() !== "idle" && status() !== "error") await leaveRoom();
  joinArgs = { room: roomId, code };
  retries = 0;
  await connect();
}

async function connect() {
  if (!joinArgs) return;
  setStatus(status() === "reconnecting" ? "reconnecting" : "connecting");
  setError("");
  try {
    stopMicTest();
    try {
      mic = await getMicStream();
    } catch (e) {
      throw new Error(micError(e));
    }
    chain = await buildMicChain(audioCtx(), mic);
    const j = await sfu.join(joinArgs.room, joinArgs.code);
    // Özel odaya kodla girildi: yeniden bağlanırken oda kimliğiyle (kod yine gerekir, saklı kalsın)
    joinArgs = { room: j.room.id, code: joinArgs.code };
    sid = j.session_id;
    setRoom(j.room);
    pc = new RTCPeerConnection({
      iceServers: j.ice,
      bundlePolicy: "max-bundle",
    });
    pc.ontrack = onTrack;
    pc.onconnectionstatechange = () => {
      const s = pc?.connectionState;
      if (s === "failed") scheduleReconnect();
      // "disconnected" çoğu zaman kendiliğinden düzelir (ağ değişimi): 6 sn sonra hâlâ kopuksa yeniden bağlan
      else if (s === "disconnected") {
        const me = pc;
        window.setTimeout(() => {
          if (pc === me && pc?.connectionState !== "connected") scheduleReconnect();
        }, 6000);
      }
    };
    const track = chain.track;
    track.enabled = false;
    micTx = pc.addTransceiver(track, { direction: "sendonly" });
    try {
      const p = micTx.sender.getParameters();
      p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: 40000 }];
      await micTx.sender.setParameters(p);
    } catch {
      /* bazı sürümlerde kodlama listesi boş */
    }
    await serial(async () => {
      const offer = await pc!.createOffer();
      await pc!.setLocalDescription({
        type: "offer",
        sdp: tuneOpus(offer.sdp ?? ""),
      });
      const r = await sfu.push(sid, pc!.localDescription!.sdp, micTx!.mid ?? "0");
      if (!r.sdp) throw new Error(t("Ses sunucusu yanıt vermedi"));
      await pc!.setRemoteDescription({
        type: "answer",
        sdp: tuneOpus(r.sdp.sdp),
      });
    });
    await waitConnected();
    await joinChannel(j.room.chan);
    await refreshState();
    startLoops();
    void bindPtt();
    if (inTauri) void invoke("voice_room_active", { on: true }).catch(() => {});
    setStatus("connected");
    retries = 0;
    applyTransmit();
    cue("join");
    pushOverlay(true);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await teardown(false);
    if (status() === "reconnecting" && retries < 3) {
      scheduleReconnect();
      return;
    }
    setStatus("error");
    setError(msg);
    setRoom(null);
    setVstate(null);
    setMembers([]);
    if (inTauri) void invoke("voice_room_active", { on: false }).catch(() => {});
  }
}

function waitConnected(): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = pc!;
    if (p.connectionState === "connected") return resolve();
    const to = window.setTimeout(() => reject(new Error(t("Ses sunucusuna bağlanılamadı (güvenlik duvarı UDP'yi engelliyor olabilir)"))), 15000);
    const h = () => {
      if (p.connectionState === "connected") {
        clearTimeout(to);
        p.removeEventListener("connectionstatechange", h);
        resolve();
      } else if (p.connectionState === "failed") {
        clearTimeout(to);
        p.removeEventListener("connectionstatechange", h);
        reject(new Error(t("Ses sunucusuna bağlanılamadı (güvenlik duvarı UDP'yi engelliyor olabilir)")));
      }
    };
    p.addEventListener("connectionstatechange", h);
  });
}

let reconnectTimer = 0;
function scheduleReconnect() {
  if (reconnectTimer || !joinArgs) return;
  retries++;
  setStatus("reconnecting");
  reconnectTimer = window.setTimeout(
    async () => {
      reconnectTimer = 0;
      await teardown(false);
      await connect();
    },
    Math.min(8000, 1500 * retries),
  );
}

/** Odadan çık */
export async function leaveRoom() {
  joinArgs = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }
  if (status() === "connected") cue("leave");
  await teardown(true);
  setStatus("idle");
  setRoom(null);
  setVstate(null);
  setMembers([]);
  setLevels({});
  pushOverlay(true);
}

async function teardown(sayBye: boolean) {
  const r = room();
  const s = sid;
  for (const id of timers) clearInterval(id);
  timers = [];
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = 0;
  unPtt?.();
  unPtt = null;
  setPttHeld(false);
  for (const p of pulled.values()) dropAudio(p);
  pulled.clear();
  pendingMid.clear();
  denied.clear();
  if (chan) {
    const c = chan;
    chan = null;
    void c.untrack().catch(() => {});
    void realtime().then((rt) => rt?.removeChannel(c));
  }
  try {
    pc?.close();
  } catch {
    /* zaten kapalı */
  }
  pc = null;
  micTx = null;
  chain?.close();
  chain = null;
  mic?.getTracks().forEach((x) => x.stop());
  mic = null;
  sid = "";
  if (sayBye && r) {
    if (s) void sfu.leave(s).catch(() => {});
    void voiceHeartbeat(r.id, true).catch(() => {});
  }
  if (inTauri && sayBye) void invoke("voice_room_active", { on: false }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Kanal (presence + yayın)
// ---------------------------------------------------------------------------

async function joinChannel(name: string) {
  const rt = await realtime();
  if (!rt) throw new Error(t("Giriş yapmalısın"));
  const c = rt.channel(name, {
    config: { presence: { key: uid() }, broadcast: { self: false } },
  });
  c.on("presence", { event: "sync" }, () => syncPresence());
  c.on("broadcast", { event: "refresh" }, () => void refreshState());
  c.on("broadcast", { event: "kick" }, (m: { payload?: { u?: string; why?: string } }) => {
    if (m.payload?.u === uid()) void kicked(m.payload?.why ?? "");
  });
  await new Promise<void>((resolve, reject) => {
    const to = window.setTimeout(() => reject(new Error(t("Oda kanalına bağlanılamadı"))), 12000);
    c.subscribe((st) => {
      if (st === "SUBSCRIBED") {
        clearTimeout(to);
        resolve();
      } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
        clearTimeout(to);
        reject(new Error(t("Oda kanalına bağlanılamadı")));
      }
    });
  });
  chan = c;
  await trackPresence();
}

let lastPresence = "";
async function trackPresence() {
  if (!chan) return;
  const body = {
    n: profile()?.display_name || t("Sürücü"),
    s: sid,
    m: micMuted(),
    d: deafened(),
  };
  const key = JSON.stringify(body);
  if (key === lastPresence) return;
  lastPresence = key;
  await chan.track(body).catch(() => {});
}

function syncPresence() {
  if (!chan) return;
  const ps = chan.presenceState() as Record<string, { n?: string; s?: string; m?: boolean; d?: boolean }[]>;
  const list: VoiceMember[] = [];
  for (const [user, metas] of Object.entries(ps)) {
    const m = metas[metas.length - 1];
    if (!m?.s) continue;
    list.push({
      user_id: user,
      name: String(m.n ?? "").slice(0, 40) || "?",
      sid: m.s,
      muted: !!m.m,
      deaf: !!m.d,
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  setMembers(list);
  pushOverlay(true);
  void reconcile();
}

/** Durum değiştiğini odadakilere bildir (söz verme / alma, yetki) */
export function announce() {
  void chan?.send({ type: "broadcast", event: "refresh", payload: {} });
  void refreshState();
}

/** Atılan kişiye haber ver (o da hemen çıkar; sunucu zaten engeller) */
export function announceKick(user: string) {
  void chan?.send({ type: "broadcast", event: "kick", payload: { u: user } });
  announce();
}

async function kicked(why: string) {
  await leaveRoom();
  setStatus("error");
  setError(why || t("Odadan çıkarıldın"));
}

// ---------------------------------------------------------------------------
// Söz hakkı durumu
// ---------------------------------------------------------------------------

let wasSpeaker = false;
export async function refreshState() {
  const r = room();
  if (!r) return;
  try {
    const st = await voiceRoomState(r.id);
    const now = Date.parse(st.now);
    if (Number.isFinite(now)) setClockSkew(now - Date.now());
    setVstate(st);
    // Söz hakkım yeni geldi / bitti: kısa ses
    const me = canSpeak(uid());
    if (me !== wasSpeaker && st.mode === "moderated" && !["owner", "admin", "mod", "speaker"].includes(roleOf(uid()))) cue(me ? "grant" : "end");
    wasSpeaker = me;
    denied.clear();
    scheduleExpiry();
    applyTransmit();
    void reconcile();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/giremezsin|bulunamadı/i.test(msg)) void kicked(t("Odadan çıkarıldın"));
  }
}

/** En yakın söz hakkı bitişinde yeniden değerlendir (sunucu da aynı anda keser) */
function scheduleExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = 0;
  const now = voice.now();
  const next = (vstate()?.grants ?? [])
    .map((g) => Date.parse(g.until))
    .filter((x) => x > now)
    .sort((a, b) => a - b)[0];
  if (next) {
    expiryTimer = window.setTimeout(
      () => {
        expiryTimer = 0;
        const me = canSpeak(uid());
        if (wasSpeaker && !me) cue("end");
        wasSpeaker = me;
        applyTransmit();
        void reconcile();
        scheduleExpiry();
      },
      Math.max(50, next - now + 150),
    );
  }
}

function startLoops() {
  timers.push(
    window.setInterval(() => setTick(Date.now()), 500),
    window.setInterval(() => void refreshState(), 10_000),
    window.setInterval(async () => {
      const r = room();
      if (!r) return;
      const ok = await voiceHeartbeat(r.id).catch(() => true);
      if (ok === false) void kicked(t("Odadan çıkarıldın"));
    }, 30_000),
    // Overlay için (söz süresi, durum); konuşma göstergesi ölçerden anında gider
    window.setInterval(() => pushOverlay(false), 1000),
  );
}

// ---------------------------------------------------------------------------
// Mikrofon
// ---------------------------------------------------------------------------

function applyTransmit() {
  if (chain) chain.track.enabled = transmitting();
  void trackPresence();
  pushOverlay(true);
}

export function toggleMic() {
  setMicOn(!micOn());
  if (micOn() && deafened()) setDeafened(false);
  applyTransmit();
}

export function toggleDeafen() {
  setDeafened(!deafened());
  applyTransmit();
  void reconcile();
}

export function setPtt(down: boolean) {
  if (pttHeld() === down) return;
  setPttHeld(down);
  applyTransmit();
}

async function bindPtt() {
  if (!inTauri || unPtt) return;
  const un = await listen<boolean>("voiceroom-ptt", (e) => setPtt(!!e.payload)).catch(() => null);
  if (!room()) {
    un?.();
    return;
  }
  unPtt = un;
}

/** Giriş aygıtı / ses işleme ayarı değişti: mikrofon zincirini yeniden kur (bağlantı kopmadan) */
export async function restartMic() {
  if (testChain) {
    const loop = testLoop;
    stopMicTest();
    await startMicTest(loop);
  }
  if (!micTx || !pc) return;
  try {
    const m = await getMicStream();
    const c = await buildMicChain(audioCtx(), m);
    c.track.enabled = transmitting();
    await micTx.sender.replaceTrack(c.track);
    chain?.close();
    mic?.getTracks().forEach((x) => x.stop());
    mic = m;
    chain = c;
  } catch (e) {
    setError(micError(e));
  }
}

/** Kapı / kazanç ayarı değişti (zincir yeniden kurulmaz) */
export function updateMic() {
  chain?.update();
  testChain?.update();
}

export const changeOutput = () => void applyOutput();

// ---- Mikrofon testi (Ses ayarları): seviye ve eşik çubuğu, istenirse kendini duy
let testChain: MicChain | null = null;
let testMic: MediaStream | null = null;
let testLoop = false;
export async function startMicTest(loopback: boolean) {
  testLoop = loopback;
  setMicTestSig(true);
  if (chain) {
    // Odadayken: oda zinciri ölçülür, sadece kendini duyma açılıp kapanır
    chain.setLoopback(loopback);
    return;
  }
  try {
    if (!testChain) {
      testMic = await getMicStream();
      testChain = await buildMicChain(audioCtx(), testMic);
    }
    testChain.setLoopback(loopback);
  } catch (e) {
    setMicTestSig(false);
    setError(micError(e));
  }
}
export function stopMicTest() {
  setMicTestSig(false);
  testLoop = false;
  chain?.setLoopback(false);
  testChain?.close();
  testChain = null;
  testMic?.getTracks().forEach((x) => x.stop());
  testMic = null;
}

/** Konuşma göstergesi: ölçerden gelen seviye (değişince) */
let lastOverlayTalk = 0;
function noteLevel(user: string, db: number) {
  const q = Math.round(dbToLevel(db) * 20) / 20;
  const cur = levels();
  if ((cur[user] ?? 0) === q) return;
  setLevels({ ...cur, [user]: q });
  const now = Date.now();
  if (now - lastOverlayTalk > 90) {
    lastOverlayTalk = now;
    pushOverlay(false);
  }
}

// ---------------------------------------------------------------------------
// Dinleme: kimin sesi çekilecek
// ---------------------------------------------------------------------------

let reconciling = false;
let again = false;
async function reconcile() {
  if (!pc || !sid || status() === "idle") return;
  if (reconciling) {
    again = true;
    return;
  }
  reconciling = true;
  try {
    do {
      again = false;
      await reconcileOnce();
    } while (again);
  } finally {
    reconciling = false;
  }
}

async function reconcileOnce() {
  const want = new Map<string, string>(); // hedef oturum → kullanıcı
  if (!deafened()) {
    for (const m of members()) {
      if (m.user_id === uid() || !m.sid) continue;
      if (!canSpeak(m.user_id)) continue;
      want.set(m.sid, m.user_id);
    }
  }
  // Kapatılacaklar
  const drop = [...pulled.entries()].filter(([s]) => !want.has(s));
  if (drop.length) {
    await serial(async () => {
      if (!pc) return;
      const mids = drop.map(([, p]) => p.mid);
      for (const [s, p] of drop) {
        dropAudio(p);
        pulled.delete(s);
        const tx = pc.getTransceivers().find((x) => x.mid === p.mid);
        try {
          tx?.stop();
        } catch {
          /* zaten durmuş */
        }
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await sfu.close(sid, mids, pc.localDescription?.sdp ?? null).catch(() => null);
      if (r?.sdp && pc.signalingState === "have-local-offer") await pc.setRemoteDescription({ type: "answer", sdp: r.sdp.sdp });
    }).catch(() => {});
  }
  // Çekilecekler
  const pendingTargets = new Set(pendingMid.values());
  const add = [...want.keys()].filter((s) => !pulled.has(s) && !pendingTargets.has(s) && !denied.has(s));
  if (!add.length) return;
  await serial(async () => {
    if (!pc) return;
    const r = await sfu.pull(sid, add);
    for (const d of r.denied ?? []) denied.add(d);
    const ok = (r.tracks ?? []).filter((x) => !x.error && x.mid);
    for (const x of ok) pendingMid.set(x.mid, x.target);
    if (r.sdp && r.renegotiate) {
      await pc.setRemoteDescription({ type: "offer", sdp: r.sdp.sdp });
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await sfu.renegotiate(sid, pc.localDescription!.sdp);
    }
    // İz gelmediyse (izin geri alındı vb.) bekleyen kaydı temizle
    window.setTimeout(() => {
      for (const x of ok) if (pendingMid.get(x.mid) === x.target) pendingMid.delete(x.mid);
    }, 8000);
  }).catch(() => {});
}

function onTrack(e: RTCTrackEvent) {
  const mid = e.transceiver?.mid ?? "";
  const target = pendingMid.get(mid);
  if (!target) return;
  pendingMid.delete(mid);
  const user = members().find((m) => m.sid === target)?.user_id ?? "";
  const stream = new MediaStream([e.track]);
  // Chromium: uzak WebRTC sesi bir ortam öğesine bağlı değilse akmaz. Öğe sessiz, ses WebAudio'dan çalınır
  // (kişi başı %200'e kadar ses ve çıkış aygıtı seçimi için).
  const el = new Audio();
  el.muted = true;
  el.srcObject = stream;
  void el.play().catch(() => {});
  let gain: GainNode | null = null;
  let src: MediaStreamAudioSourceNode | null = null;
  try {
    const c = audioCtx();
    src = c.createMediaStreamSource(stream);
    gain = c.createGain();
    src.connect(gain);
    gain.connect(c.destination);
  } catch {
    el.muted = false;
  }
  const p: Pulled = { mid, user, el, gain, meter: null, src };
  const old = pulled.get(target);
  if (old) dropAudio(old);
  pulled.set(target, p);
  applyVolume(p);
  // Seviye ölçer (konuşma göstergesi; ses iş parçacığında, panel gizliyken de çalışır)
  if (src && ctx) {
    void meterNode(ctx, (db) => noteLevel(user, db)).then((m) => {
      if (!m) return;
      if (pulled.get(target) !== p) return m.disconnect();
      p.meter = m;
      src!.connect(m);
    });
  }
}

function dropAudio(p: Pulled) {
  try {
    p.src?.disconnect();
    p.gain?.disconnect();
    if (p.meter) {
      p.meter.port.onmessage = null;
      p.meter.disconnect();
    }
  } catch {
    /* zaten ayrık */
  }
  p.el.srcObject = null;
  if (p.user) {
    const cur = { ...levels() };
    delete cur[p.user];
    setLevels(cur);
  }
}

function applyVolume(p: Pulled) {
  const v = localMuted().includes(p.user) ? 0 : ((userVolumes()[p.user] ?? 100) / 100) * (masterVolume() / 100);
  if (p.gain) p.gain.gain.value = v;
  else p.el.volume = Math.min(1, v);
}

export function applyVolumes() {
  for (const p of pulled.values()) applyVolume(p);
}

export function setUserVolume(user: string, v: number) {
  setUserVolumes({
    ...userVolumes(),
    [user]: Math.max(0, Math.min(200, Math.round(v))),
  });
  applyVolumes();
}

export function toggleLocalMute(user: string) {
  const l = localMuted();
  setLocalMuted(l.includes(user) ? l.filter((x) => x !== user) : [...l, user]);
  applyVolumes();
}

// ---------------------------------------------------------------------------
// Kısa sesler (girme / çıkma / söz hakkı)
// ---------------------------------------------------------------------------

function cue(kind: "join" | "leave" | "grant" | "end") {
  if (!cueSounds()) return;
  try {
    const c = audioCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    const f = {
      join: [520, 780],
      leave: [660, 440],
      grant: [700, 1050],
      end: [500, 330],
    }[kind];
    const t0 = c.currentTime;
    o.frequency.setValueAtTime(f[0], t0);
    o.frequency.setValueAtTime(f[1], t0 + 0.09);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + 0.25);
  } catch {
    /* ses yok */
  }
}

/** Mikrofon testi için cihaz listesi (izin verilmeden adlar boş gelir) */
export async function audioDevices(): Promise<{
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: all.filter((d) => d.kind === "audioinput"),
      outputs: all.filter((d) => d.kind === "audiooutput"),
    };
  } catch {
    return { inputs: [], outputs: [] };
  }
}

// ---------------------------------------------------------------------------
// Overlay ("Ses Odası" overlay'i, overlay penceresinde): kimin konuştuğu
// ---------------------------------------------------------------------------

let lastOverlay = "";
function overlayData(): VoiceOverlayData {
  const r = room();
  if (!r || status() === "idle" || status() === "error") return { room: null, mode: "", members: [] };
  const me = uid();
  const now = voice.now();
  const list = members().map((m) => {
    const isMe = m.user_id === me;
    const g = grantUntil(m.user_id);
    const speak = canSpeak(m.user_id);
    return {
      id: m.user_id,
      name: m.name,
      talking: isTalking(m.user_id),
      mic: !speak ? "floor" : isMe ? (micMuted() ? "off" : "on") : m.muted ? "off" : "on",
      deaf: isMe ? deafened() : m.deaf,
      me: isMe,
      left: g ? Math.max(0, Math.ceil((g - now) / 1000)) : null,
      role: r.owner === m.user_id ? "owner" : roleOf(m.user_id),
    } as VoiceOverlayMember;
  });
  return { room: r.name, mode: vstate()?.mode ?? r.mode, members: list };
}

/** Overlay'e durum gönder (değiştiyse; force: her durumda) */
export function pushOverlay(force: boolean) {
  if (!inTauri) return;
  const d = overlayData();
  const key = JSON.stringify(d);
  if (!force && key === lastOverlay) return;
  lastOverlay = key;
  void emit(VOICE_OVERLAY_EVENT, d).catch(() => {});
}

// ---------------------------------------------------------------------------
// Kısayollar (Rust "voiceroom-key": mute | deafen) ve overlay'in ilk istek olayı
// ---------------------------------------------------------------------------

// (Motor yalnızca panel penceresinde yüklenir: VoiceDock ve Ses Odaları sayfası)
if (inTauri) {
  void listen<string>("voiceroom-key", (e) => {
    if (!room() || status() === "idle") return;
    if (e.payload === "mute") {
      toggleMic();
      void invoke("osd_push", { key: "roomMute", on: voice.micOn() && !deafened() }).catch(() => {});
    } else if (e.payload === "deafen") {
      toggleDeafen();
      void invoke("osd_push", { key: "roomDeafen", on: !deafened() }).catch(() => {});
    }
  });
  void listen(VOICE_OVERLAY_REQ, () => pushOverlay(true));
}

// Pencere kapanırken (uygulama çıkışı) odadan düzgün çık
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const r = room();
    if (r && sid) {
      void sfu.leave(sid).catch(() => {});
      void voiceHeartbeat(r.id, true).catch(() => {});
    }
  });
}
