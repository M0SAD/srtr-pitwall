// Telemetri referans turları: topluluk rekoru, topluluk ortalaması, kendi rekorum, oturumun en iyisi.
// Telemetri sayfasındaki harita / kıyas ve Canlı Kıyas overlay'i aynı kaynakları kullanır.

import { comboLaps, lapsInfo, leaderboard, loadTrace, telemetrySession, type LapInfo, type SimId, type Trace } from "./telemetry";
import { session } from "./supabase";

export type RefKind = "best" | "avg" | "mine" | "session";

export interface ComboKey {
  sim: SimId | string;
  track_id: string;
  track_config: string;
  car_id: string;
}

export interface RefLap {
  kind: RefKind;
  /** Kimin turu (ortalamada boş) */
  name: string;
  time: number;
  /** Ortalamaya giren tur sayısı (tek tur: 1) */
  laps: number;
  trace: Trace;
  /** Tek turun kimliği (ortalamada yok) */
  lapId?: string;
}

/** Ortalama için gereken en az / kullanılan en çok tur */
export const AVG_MIN = 3;
export const AVG_MAX = 8;

/** İzleri aynı uzunluğa getirip nokta nokta ortalar (vites: en hızlı turunki) */
export function averageTraces(list: Trace[]): Trace | null {
  const ok = list.filter((t) => t && t.n > 10 && t.t.length >= t.n);
  if (!ok.length) return null;
  const n = ok[0].n;
  const at = (arr: number[], t: Trace, i: number) => arr[Math.min(t.n - 1, Math.round((i * t.n) / n))] ?? 0;
  const mean = (pick: (t: Trace) => number[]) => Array.from({ length: n }, (_, i) => Math.round(ok.reduce((s, t) => s + at(pick(t), t, i), 0) / ok.length));
  return { n, t: mean((t) => t.t), speed: mean((t) => t.speed), throttle: mean((t) => t.throttle), brake: mean((t) => t.brake), gear: ok[0].gear.slice(0, n), steer: mean((t) => t.steer) };
}

async function traceOf(lapId: string): Promise<{ info: LapInfo; trace: Trace } | null> {
  const info = (await lapsInfo([lapId]))?.[0];
  const trace = info ? await loadTrace(info.trace_path) : null;
  return info && trace ? { info, trace } : null;
}

/** Sıralamadaki izi paylaşılmış turlar (en hızlıdan); `skipMe`: kendi turum hariç */
async function boardTraces(c: ComboKey, max: number, skipMe: boolean) {
  const rows = ((await leaderboard({ sim: c.sim, track_id: c.track_id, track_config: c.track_config }, c.car_id, 30)) ?? []).filter((r) => r.has_trace && !(skipMe && r.is_me));
  const out: { name: string; time: number; trace: Trace; lapId: string }[] = [];
  for (const r of rows) {
    if (out.length >= max) break;
    const x = await traceOf(r.lap_id).catch(() => null);
    if (x) out.push({ name: r.display_name || r.sim_name || "", time: r.lap_time, trace: x.trace, lapId: r.lap_id });
  }
  return out;
}

/**
 * Referans turu getirir. Yeterli veri yoksa null döner.
 * - best: topluluktaki en hızlı (izi olan) tur
 * - avg: en hızlı 3-8 turun ortalaması (3'ten azsa null)
 * - mine: bu pist ve araçtaki kendi en iyi turum (izi olan)
 * - session: verilen oturumun en iyi geçerli turu
 */
export async function loadRef(kind: RefKind, c: ComboKey, opts: { sessionId?: string; skipMe?: boolean } = {}): Promise<RefLap | null> {
  // Önbellek: aynı pist + araç için referans bu bilgisayarda saklanır; süresi dolana kadar sunucuya hiç gidilmez
  const key = kind === "session" ? "" : `${CACHE}${kind}${opts.skipMe ? "-x" : ""}|${c.sim}|${c.track_id}|${c.track_config}|${c.car_id}`;
  const hit = key ? cacheGet(key, kind === "mine" ? 2 * 3600_000 : 12 * 3600_000) : undefined;
  if (hit !== undefined) return hit;
  const r = await fetchRef(kind, c, opts);
  if (key) cachePut(key, r);
  return r;
}

const CACHE = "pw.tref.";
/** En çok bu kadar referans saklanır (en eskisi silinir) */
const CACHE_MAX = 10;

function cacheGet(key: string, ttl: number): RefLap | null | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { at: number; ref: RefLap | null };
    // "Veri yok" sonucu kısa süre saklanır: biri tur paylaşınca yarım saat içinde görünür
    if (Date.now() - v.at > (v.ref ? ttl : 30 * 60_000)) return undefined;
    return v.ref;
  } catch {
    return undefined;
  }
}

function cachePut(key: string, ref: RefLap | null) {
  try {
    const keys: { k: string; at: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE) && k !== key) keys.push({ k, at: (JSON.parse(localStorage.getItem(k) || "{}") as { at?: number }).at ?? 0 });
    }
    keys.sort((a, b) => b.at - a.at);
    for (const x of keys.slice(CACHE_MAX - 1)) localStorage.removeItem(x.k);
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), ref }));
  } catch {
    /* depolama dolu / kapalı: önbelleksiz devam */
  }
}

async function fetchRef(kind: RefKind, c: ComboKey, opts: { sessionId?: string; skipMe?: boolean }): Promise<RefLap | null> {
  if (kind === "best") {
    const [x] = await boardTraces(c, 1, !!opts.skipMe);
    return x ? { kind, name: x.name, time: x.time, laps: 1, trace: x.trace, lapId: x.lapId } : null;
  }
  if (kind === "avg") {
    const xs = await boardTraces(c, AVG_MAX, false);
    if (xs.length < AVG_MIN) return null;
    const trace = averageTraces(xs.map((x) => x.trace));
    if (!trace) return null;
    return { kind, name: "", time: (trace.t[trace.n - 1] ?? 0) / 1000 || xs.reduce((s, x) => s + x.time, 0) / xs.length, laps: xs.length, trace };
  }
  if (kind === "mine") {
    if (!session()) return null;
    const laps = ((await comboLaps({ sim: c.sim, track_id: c.track_id, track_config: c.track_config, car_id: c.car_id })) ?? []).slice().sort((a, b) => a.lap_time - b.lap_time);
    for (const l of laps.slice(0, 6)) {
      const x = await traceOf(l.id).catch(() => null);
      if (x) return { kind, name: x.info.driver_name || x.info.display_name, time: l.lap_time, laps: 1, trace: x.trace, lapId: l.id };
    }
    return null;
  }
  if (!opts.sessionId) return null;
  const d = await telemetrySession(opts.sessionId);
  const laps = (d?.laps ?? []).filter((l) => l.valid && l.has_trace && l.lap_time > 0).sort((a, b) => a.lap_time - b.lap_time);
  for (const l of laps.slice(0, 3)) {
    const x = await traceOf(l.id).catch(() => null);
    if (x) return { kind, name: x.info.driver_name || x.info.display_name, time: l.lap_time, laps: 1, trace: x.trace, lapId: l.id };
  }
  return null;
}
