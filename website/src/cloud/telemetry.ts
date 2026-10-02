// Telemetri (Garage61 benzeri): programın kaydettiği turlar ve yarışçılar dizini.
//
// Kayıt Rust tarafında (src-tauri/src/laprec.rs): canlı sim oturumunda tamamlanan her tur
// <app data>/telemetry/queue.jsonl kuyruğuna yazılır ve "telemetry-lap" olayı gönderilir.
// Overlay penceresi (program açık olduğu sürece çalışır) giriş yapılmışsa kuyruğu Supabase'e yükler:
//   telemetry_record_lap(p_lap) → sunucu turun izinin saklanıp saklanmayacağına karar verir (oturumun en iyi
//   geçerli turu) ve yolunu döner; iz gzip JSON olarak "telemetry" kovasına yüklenir, eski izler silinir.
// Yüklenen turlar telemetry_ack ile kuyruktan silinir. Ağ hatasında tur kuyrukta kalır, sonra yeniden denenir.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api, cloudEnabled, session, storageRemove, storageSignedUrls, storageUpload } from "./supabase";
import { F, proLocked } from "@/sdk/proFeatures";

export const TELEMETRY_BUCKET = "telemetry";

export type SimId = "iracing" | "acc" | "ac" | "lmu" | "rf2" | "ams2";

/** Yarışçılar sekmeleri (rF2 ile LMU ayrı kimliklerdir ama aynı sekmede gösterilir) */
export const SIM_TABS: { id: SimId; label: string; also?: SimId[] }[] = [
  { id: "iracing", label: "iRacing" },
  { id: "acc", label: "ACC" },
  { id: "ac", label: "Assetto Corsa" },
  { id: "lmu", label: "LMU / rF2", also: ["rf2"] },
  { id: "ams2", label: "AMS2" },
];

export const SIM_LABEL: Record<string, string> = {
  iracing: "iRacing",
  acc: "ACC",
  ac: "Assetto Corsa",
  lmu: "Le Mans Ultimate",
  rf2: "rFactor 2",
  ams2: "Automobilista 2",
};

export const SESSION_LABEL: Record<string, string> = {
  practice: "Antrenman",
  qualify: "Sıralama",
  race: "Yarış",
  warmup: "Isınma",
  hotlap: "Hızlı tur",
  other: "Oturum",
};

/** Rakipleri yapay zekâ olan (botlarla) oturum: laprec.rs ham oturum adının sonuna " [AI]" ekler */
export function isAiSession(s: { session_kind?: string | null }): boolean {
  const k = (s.session_kind ?? "").trim();
  return /\[ai\]$/i.test(k) || k.toLowerCase() === "ai";
}

/** Mesafeye göre örneklenmiş tur izi (laprec.rs Trace) */
export interface Trace {
  n: number;
  /** ms */
  t: number[];
  /** km/h x10 */
  speed: number[];
  throttle: number[];
  brake: number[];
  gear: number[];
  steer: number[];
}

interface QueuedLap {
  id: string;
  trace?: Trace;
  [k: string]: unknown;
}

export interface TelemetrySession {
  id: string;
  user_id: string;
  sim: SimId;
  track_id: string;
  track_name: string;
  track_config: string;
  track_length_km: number;
  car_id: string;
  car_name: string;
  car_class: string;
  session_type: string;
  session_kind: string;
  driver_name: string;
  started_at: string;
  last_lap_at: string;
  laps: number;
  valid_laps: number;
  invalid_laps: number;
  best_lap: number | null;
  best_lap_id: string | null;
  incidents: number;
  distance_km: number;
  drive_time: number;
  air_temp: number | null;
  track_temp: number | null;
  wetness: number | null;
}

export interface TelemetryLap {
  id: string;
  lap: number;
  lap_time: number;
  sectors: number[];
  valid: boolean;
  pit: boolean;
  off_track: boolean;
  sim_invalid: boolean;
  incidents: number;
  fuel_used: number | null;
  air_temp: number | null;
  track_temp: number | null;
  wetness: number | null;
  position: number | null;
  class_position: number | null;
  driven_at: string;
  has_trace: boolean;
}

export interface BestLap {
  lap_id: string;
  session_id: string;
  sim: SimId;
  track_id: string;
  track_config: string;
  car_id: string;
  track_name: string;
  car_name: string;
  car_class: string;
  lap_time: number;
  sectors: number[];
  driven_at: string;
  has_trace: boolean;
  laps: number;
}

export interface Identity {
  sim: SimId;
  sim_name: string;
  sim_id?: string;
  laps?: number;
  first_seen?: string;
  last_seen?: string;
}

export interface Overview {
  profile: { id: string; display_name: string; telemetry_public: boolean; is_me: boolean; friend: string | null };
  visible: boolean;
  totals?: {
    sessions: number;
    laps: number;
    valid_laps: number;
    incidents: number;
    distance_km: number;
    drive_time: number;
    tracks: number;
    cars: number;
    first: string | null;
    last: string | null;
  };
  sims?: { sim: SimId; laps: number; sessions: number }[];
  identities: Identity[];
  bests?: BestLap[];
  recent?: TelemetrySession[];
}

export interface SessionDetail {
  session: TelemetrySession;
  owner: { id: string; display_name: string };
  laps: TelemetryLap[];
}

export interface LapInfo {
  id: string;
  user_id: string;
  display_name: string;
  driver_name: string;
  session_id: string;
  sim: SimId;
  track_id: string;
  track_config: string;
  track_name: string;
  track_length_km: number;
  car_id: string;
  car_name: string;
  car_class: string;
  session_type: string;
  lap: number;
  lap_time: number;
  sectors: number[];
  valid: boolean;
  driven_at: string;
  trace_path: string | null;
}

export interface ComboLap {
  id: string;
  lap: number;
  lap_time: number;
  sectors: number[];
  driven_at: string;
  session_id: string;
  session_type: string;
}

export interface BoardRow {
  rank: number;
  user_id: string;
  display_name: string;
  sim_name: string | null;
  lap_id: string;
  lap_time: number;
  sectors: number[];
  car_id: string;
  car_name: string;
  car_class: string;
  driven_at: string;
  has_trace: boolean;
  is_me: boolean;
}

export interface DriverRow {
  user_id: string;
  display_name: string;
  sim: SimId;
  sim_name: string;
  sim_id: string | null;
  visible: boolean;
  laps: number | null;
  tracks: number | null;
  cars: number | null;
  last_active: string | null;
  friend: string | null;
  is_me: boolean;
}

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

const rpc = <T>(name: string, body: Record<string, unknown>) => api<T>("POST", `rpc/${name}`, { body, auth: "optional" });

export const telemetryOverview = (user?: string | null) => rpc<Overview>("telemetry_overview", { p_user: user ?? null });
export const telemetrySessions = (user: string | null, sim = "", limit = 30, offset = 0) =>
  rpc<TelemetrySession[]>("telemetry_session_list", { p_user: user, p_sim: sim || null, p_limit: limit, p_offset: offset });
export const telemetrySession = (id: string) => rpc<SessionDetail>("telemetry_session", { p_session: id });
export const lapsInfo = (ids: string[]) => rpc<LapInfo[]>("telemetry_laps_info", { p_ids: ids.slice(0, 4) });
export const comboLaps = (c: { sim: string; track_id: string; track_config: string; car_id: string }, user?: string | null) =>
  rpc<ComboLap[]>("telemetry_combo_laps", {
    p_sim: c.sim,
    p_track_id: c.track_id,
    p_track_config: c.track_config ?? "",
    p_car_id: c.car_id,
    p_user: user ?? null,
  });
export const leaderboard = (c: { sim: string; track_id: string; track_config: string }, car: string | null, limit = 50) =>
  rpc<BoardRow[]>("telemetry_leaderboard", {
    p_sim: c.sim,
    p_track_id: c.track_id,
    p_track_config: c.track_config ?? "",
    p_car_id: car,
    p_limit: limit,
  });
export const telemetryDrivers = (sim: string, q = "", limit = 60, offset = 0) =>
  rpc<DriverRow[]>("telemetry_drivers", { p_sim: sim || null, p_q: q.trim(), p_limit: limit, p_offset: offset });

/** "Verilerimi başkaları görebilsin" */
export const [telemetryPublic, setTelemetryPublicSig] = createSignal<boolean | null>(null);
export async function loadTelemetryPublic() {
  const uid = session()?.user.id;
  if (!uid) return setTelemetryPublicSig(null);
  try {
    const rows = await api<{ telemetry_public: boolean }[]>("GET", `profiles?id=eq.${uid}&select=telemetry_public`);
    setTelemetryPublicSig(rows?.[0]?.telemetry_public ?? true);
  } catch {
    setTelemetryPublicSig(null);
  }
}
export async function setTelemetryPublic(on: boolean) {
  const prev = telemetryPublic();
  setTelemetryPublicSig(on);
  try {
    await api("POST", "rpc/telemetry_set_public", { body: { p_on: on } });
  } catch (e) {
    setTelemetryPublicSig(prev);
    throw e;
  }
}

/** Oturumu sil (izleri kovadan da) */
export async function deleteSession(id: string) {
  const paths = await api<string[]>("POST", "rpc/telemetry_delete_session", { body: { p_session: id } });
  if (paths?.length) await storageRemove(TELEMETRY_BUCKET, paths).catch(() => {});
}

const traceCache = new Map<string, Promise<Trace | null>>();

/** İzi kovadan indirir (gzip ya da düz JSON) */
export function loadTrace(path: string | null | undefined): Promise<Trace | null> {
  if (!path) return Promise.resolve(null);
  let p = traceCache.get(path);
  if (!p) {
    p = (async () => {
      const urls = await storageSignedUrls(TELEMETRY_BUCKET, [path], 600);
      const url = urls[path];
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return decodeTrace(new Uint8Array(await res.arrayBuffer()));
    })().catch(() => null);
    traceCache.set(path, p);
  }
  return p;
}

export async function decodeTrace(bytes: Uint8Array): Promise<Trace | null> {
  let text: string;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const j = JSON.parse(text) as Trace;
  return Array.isArray(j?.t) && Array.isArray(j?.speed) ? j : null;
}

async function encodeTrace(tr: Trace): Promise<{ body: Blob; type: string }> {
  const json = JSON.stringify(tr);
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
    return { body: await new Response(stream).blob(), type: "application/gzip" };
  }
  return { body: new Blob([json]), type: "application/json" };
}

// ---------------------------------------------------------------------------
// Yükleme (overlay penceresinde çalışır)
// ---------------------------------------------------------------------------

/** Kuyrukta bekleyen tur sayısı (bilinmiyorsa null) ve son yükleme hatası */
export const [queueCount, setQueueCount] = createSignal<number | null>(null);
export const [uploadError, setUploadError] = createSignal("");

/** Sunucunun reddettiği (yeniden denemenin anlamı olmayan) turlar */
const PERMANENT = /Geçersiz|invalid input|violates check|out of range/i;

async function uploadLap(lap: QueuedLap) {
  const { trace, ...rest } = lap;
  const r = await api<{ trace_path: string | null; remove: string[] }>("POST", "rpc/telemetry_record_lap", {
    body: { p_lap: { ...rest, has_trace: !!trace } },
  });
  if (r?.trace_path && trace) {
    const { body, type } = await encodeTrace(trace);
    await storageUpload(TELEMETRY_BUCKET, r.trace_path, body, type, true);
  }
  if (r?.remove?.length) await storageRemove(TELEMETRY_BUCKET, r.remove).catch(() => {});
}

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoff = 0;

/** Kuyruğu yükler. Panelden "Şimdi yükle" ile de çağrılır. */
export async function flushTelemetry(): Promise<number> {
  if (running || !cloudEnabled || !session()) return 0;
  // Yönetici telemetri yüklemeyi PRO'ya ayırdıysa: turlar bilgisayardaki kuyrukta bekler
  if (proLocked(F.teleRecord)) {
    setUploadError("Telemetri yüklemek PRO üyelik gerektirir; turlar bu bilgisayarda bekliyor, PRO olunca yüklenir.");
    return 0;
  }
  running = true;
  let sent = 0;
  try {
    for (let round = 0; round < 100; round++) {
      const q = await invoke<{ laps: QueuedLap[]; total: number }>("telemetry_pending", { limit: 10 });
      setQueueCount(q.total);
      if (!q.laps.length) break;
      const done: string[] = [];
      let failed: unknown = null;
      for (const lap of q.laps) {
        try {
          await uploadLap(lap);
          done.push(lap.id);
        } catch (e) {
          if (PERMANENT.test(String((e as Error)?.message ?? e))) {
            done.push(lap.id);
          } else {
            failed = e;
            break;
          }
        }
      }
      if (done.length) {
        setQueueCount(await invoke<number>("telemetry_ack", { ids: done }));
        sent += done.length;
      }
      if (failed) throw failed;
    }
    setUploadError("");
    backoff = 0;
  } catch (e) {
    setUploadError(String((e as Error)?.message ?? e));
    backoff = Math.min(backoff ? backoff * 2 : 60_000, 30 * 60_000);
    schedule(backoff);
  } finally {
    running = false;
  }
  return sent;
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void flushTelemetry(), ms);
}

let started = false;

/** Overlay penceresinde bir kez çağrılır */
export function startTelemetryUpload() {
  if (started || !cloudEnabled) return;
  started = true;
  void listen("telemetry-lap", () => {
    if (!backoff) schedule(4000);
  });
  schedule(20_000);
  // Giriş yapılınca / ara ara bekleyenleri yükle
  let lastUser = session()?.user.id ?? "";
  setInterval(() => {
    const uid = session()?.user.id ?? "";
    if (uid !== lastUser) {
      lastUser = uid;
      if (uid) schedule(2000);
    }
  }, 10_000);
  setInterval(() => !backoff && schedule(0), 10 * 60_000);
}

/** Paneldeki gösterge için kuyruğu sayar */
export async function refreshQueueCount() {
  try {
    const q = await invoke<{ total: number }>("telemetry_pending", { limit: 1 });
    setQueueCount(q.total);
  } catch {
    setQueueCount(null);
  }
}

// ---------------------------------------------------------------------------
// Analiz yardımcıları
// ---------------------------------------------------------------------------

/** İkinci turun birinciye göre farkı (sn, + yavaş) mesafe boyunca */
export function deltaSeries(base: Trace, other: Trace): number[] {
  const n = Math.min(base.t.length, other.t.length);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (other.t[i] - base.t[i]) / 1000;
  return out;
}

export function trackLabel(x: { track_name: string; track_config?: string | null }) {
  return x.track_config ? `${x.track_name} – ${x.track_config}` : x.track_name;
}
