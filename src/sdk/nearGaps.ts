// Öndeki ve arkadaki en yakın araçla fark: süre (relative konusundaki fark, sn) ve mesafe (m).
// Mesafe, harita konusundaki tur yüzdelerinin farkı × pist uzunluğu; harita verisi yoksa süre × anlık hız.
// Kullanan: Mesafe Çubuğu (gapbar) ve Pedallar & Girdi (üstteki fark satırı).
import { createMemo, type Accessor } from "solid-js";
import { useTopic } from "./telemetry";
import type { Row } from "./types";

export interface NearGap {
  row: Row;
  /** Fark (sn, mutlak) */
  s: number;
  /** Mesafe (m, mutlak); hesaplanamıyorsa null */
  m: number | null;
}
export interface NearGaps {
  me: Row | undefined;
  ahead: NearGap | null;
  behind: NearGap | null;
}

/** Hızla tahminde en düşük hız (m/sn): dururken fark 0 m görünmesin */
const MIN_SPEED = 10;

/** Topics: relative (fark), map (tur yüzdesi, pist uzunluğu, hız) */
export function useNearGaps(opts: () => { sameClass?: boolean; skipPit?: boolean }): Accessor<NearGaps> {
  const rel = useTopic("relative");
  const map = useTopic("map");
  return createMemo<NearGaps>(() => {
    const rows = rel()?.rows ?? [];
    const mi = rows.findIndex((r) => r.isMe);
    if (mi < 0) return { me: undefined, ahead: null, behind: null };
    const me = rows[mi];
    const o = opts();
    const ok = (r: Row) => (!o.sameClass || r.classId === me.classId) && !(o.skipPit && r.onPit);
    const mp = map();
    const len = mp?.trackM ?? 0;
    const cars = mp?.cars ?? [];
    const meCar = cars.find((c) => c.idx === me.idx) ?? cars.find((c) => c.me);
    const speed = Math.max(MIN_SPEED, meCar?.speed ?? 0);
    const metres = (r: Row): number | null => {
      if (len > 0 && meCar && meCar.pct >= 0) {
        const c = cars.find((x) => x.idx === r.idx);
        if (c && c.pct >= 0) {
          let d = Math.abs(c.pct - meCar.pct) % 1;
          if (d > 0.5) d = 1 - d;
          return d * len;
        }
      }
      return mp ? Math.abs(r.gap) * speed : null;
    };
    const pick = (from: number, step: number): NearGap | null => {
      for (let i = from; i >= 0 && i < rows.length; i += step) {
        const r = rows[i];
        if (!ok(r)) continue;
        return { row: r, s: Math.abs(r.gap), m: metres(r) };
      }
      return null;
    };
    return { me, ahead: pick(mi - 1, -1), behind: pick(mi + 1, 1) };
  });
}

/** Farkı yazıya çevir: "1.24" / "12.4" sn ya da "38 m" */
export function gapLabel(g: NearGap | null, unit: "s" | "m"): string {
  if (!g) return "—";
  if (unit === "m" && g.m != null) return `${Math.round(g.m)} m`;
  return g.s < 10 ? g.s.toFixed(2) : g.s < 100 ? g.s.toFixed(1) : String(Math.round(g.s));
}

/** Yakınlık 0..1: `range`'de (sn ya da m) 0, tampon tampona 1 */
export function closeness(g: NearGap | null, unit: "s" | "m", range: number): number {
  if (!g) return 0;
  const v = unit === "m" && g.m != null ? g.m : unit === "m" ? g.s * 40 : g.s;
  return Math.max(0, Math.min(1, 1 - v / Math.max(0.01, range)));
}
