// Telemetri: viraj numaraları ve kullanıcının verdiği viraj adları (pist başına).
// Virajlar turun hız diplerinden bulunur (teleAnalysis.findCorners); adlar tur oranıyla (apeks) saklanır, böylece
// farklı turlarda / araçlarda numara kaysa da ad doğru virajda kalır. Ayarlarla (uiPrefs) hesaba eşitlenir.

import { findCorners } from "./teleAnalysis";
import { uiPref } from "./settings";

export interface CornerName {
  /** Apeksin tur oranı (0..1) */
  k: number;
  name: string;
}

type Track = { sim: string; track_id: string; track_config?: string | null };

const [names, setNames] = uiPref<Record<string, CornerName[]>>("tele.cornerNames", {});

export const trackKey = (t: Track) => `${t.sim}|${t.track_id}|${t.track_config ?? ""}`;

/** Aynı virajı tanıma toleransı (tur oranı) */
const TOL = 0.012;

export function cornerName(t: Track, k: number): string {
  const list = names()[trackKey(t)] ?? [];
  let best: CornerName | null = null;
  for (const c of list) if (Math.abs(c.k - k) <= TOL && (!best || Math.abs(c.k - k) < Math.abs(best.k - k))) best = c;
  return best?.name ?? "";
}

export function setCornerName(t: Track, k: number, name: string) {
  const key = trackKey(t);
  const list = (names()[key] ?? []).filter((c) => Math.abs(c.k - k) > TOL);
  const v = name.trim().slice(0, 40);
  if (v) list.push({ k: Math.round(k * 10000) / 10000, name: v });
  list.sort((a, b) => a.k - b.k);
  setNames({ ...names(), [key]: list });
}

/** Turun virajları: apeks tur oranları (hız: km/h × 10 ya da km/h; ölçek önemsiz) */
export function cornersOf(speed: number[] | undefined): number[] {
  if (!speed || speed.length < 20) return [];
  const n = speed.length;
  return findCorners(speed).map((i) => i / Math.max(1, n - 1));
}

/** "3" ya da "3 · Eau Rouge" */
export function cornerLabel(t: Track, k: number, n: number): string {
  const nm = cornerName(t, k);
  return nm ? `${n} · ${nm}` : `${n}`;
}
