// Fark Grafiği ve Rakip Takibi overlay'lerinin ortak yardımcıları: rakip seçimi, tur bazlı fark serisi, eğilim,
// SVG yolu üretimi ve düzenleme modu için örnek veri. (Bu dosya bir overlay değildir; registry sadece
// manifest.ts / Overlay.tsx dosyalarına bakar.)

import type { GapCar, Gaps, Row } from "@/sdk/types";
import { friendOf } from "@/sdk/friends";
import { sampleRow } from "@/sdk/samples";

export type RivalMode = "ahead" | "behind" | "leader" | "fixed" | "friend";

const norm = (s: string) => s.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");

/**
 * Sıralama satırlarından rakibi seçer (hep oyuncunun sınıfı içinde; sabit araç / arkadaş her sınıftan olabilir).
 * - ahead / behind: sınıf sırasında hemen önümdeki / arkamdaki
 * - leader: sınıf lideri (lider bensem yok)
 * - fixed: araç numarası ("12" ya da "#12") tam eşleşir; yoksa sürücü adında geçen yazı aranır
 * - friend: işaretli arkadaşlardan sınıf sırasında bana en yakın olan
 */
export function pickRival(rows: Row[] | undefined, mode: RivalMode, query = ""): Row | undefined {
  if (!rows?.length) return undefined;
  const me = rows.find((r) => r.isMe);
  if (!me) return undefined;
  if (mode === "fixed") {
    const q = norm(query);
    if (!q) return undefined;
    const no = q.replace(/^#/, "");
    return (
      rows.find((r) => !r.isMe && norm(r.number) === no) ??
      (q.startsWith("#") ? undefined : rows.find((r) => !r.isMe && norm(r.name).includes(q)))
    );
  }
  if (mode === "friend") {
    const fr = rows.filter((r) => !r.isMe && friendOf(r.userId, r.name));
    if (!fr.length) return undefined;
    const d = (r: Row) => (r.classId === me.classId ? Math.abs(r.classPos - me.classPos) : 1000 + Math.abs(r.pos - me.pos));
    return fr.sort((a, b) => d(a) - d(b))[0];
  }
  const cls = rows.filter((r) => r.classId === me.classId && (r.classPos > 0 || r.isMe)).sort((a, b) => a.classPos - b.classPos);
  const mi = cls.findIndex((r) => r.isMe);
  if (mi < 0) return undefined;
  if (mode === "ahead") return cls[mi - 1];
  if (mode === "behind") return cls[mi + 1];
  return mi > 0 ? cls[0] : undefined;
}

export interface Series {
  /** Tur numaraları ve o turun çizgi geçişindeki fark (sn): + rakip önümde, − arkamda; örnek yoksa null */
  laps: number[];
  hist: (number | null)[];
  live: number | null;
  /** Rakibin ve benim pit girişlerim: örnek sırası (hist.length = bitmemiş güncel tur) */
  pits: number[];
  myPits: number[];
}

/** `gaps` konusundan bir aracın son `n` turluk serisi */
export function seriesOf(g: Gaps | undefined, idx: number | undefined, n: number): Series | undefined {
  if (!g || idx == null) return undefined;
  const car: GapCar | undefined = g.cars.find((c) => c.idx === idx);
  if (!car) return undefined;
  const off = Math.max(0, g.laps.length - n);
  const shift = (p: number[]) => p.map((x) => x - off).filter((x) => x >= 0);
  return { laps: g.laps.slice(off), hist: car.hist.slice(off), live: car.live, pits: shift(car.pits), myPits: shift(g.myPits) };
}

/** Son `k` turdaki ortalama değişim (sn/tur); yeterli örnek yoksa null. Değerler çağıranın yönlendirdiği mesafedir. */
export function trendOf(vals: (number | null)[], k: number): number | null {
  const pts: number[] = [];
  for (let i = vals.length - 1; i >= 0 && pts.length < k + 1; i--) {
    const v = vals[i];
    if (v != null) pts.unshift(v);
  }
  return pts.length >= 2 ? (pts[pts.length - 1] - pts[0]) / (pts.length - 1) : null;
}

/** Son iki örnek arasındaki değişim (son turda fark ne kadar değişti) */
export function lastChange(vals: (number | null)[]): number | null {
  return trendOf(vals, 1);
}

export function gapText(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  return a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2);
}

export interface PlotLine {
  vals: (number | null)[];
  live: number | null;
}

export interface Plot {
  /** Çizgi, noktalar ve canlı (kesikli) parça: her seri için SVG yolu */
  lines: { d: string; dots: string; live: string }[];
  lo: number;
  hi: number;
  /** Sıfır çizgisinin y'si (aralık dışındaysa null) */
  zeroY: number | null;
  x: (i: number) => number;
  y: (v: number) => number;
}

/**
 * Serileri W×H alana yerleştirir. x: örnek sırası (son yuva = canlı değer), y: büyük değer üstte.
 * Yollar düz yazıdır: veri değişmedikçe DOM'a dokunulmaz.
 */
export function buildPlot(series: PlotLine[], slots: number, W: number, H: number, pad: { l: number; r: number; t: number; b: number }, withZero: boolean): Plot {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const v of s.vals) {
      if (v != null) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (s.live != null) {
      lo = Math.min(lo, s.live);
      hi = Math.max(hi, s.live);
    }
  }
  if (!isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (withZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  let span = hi - lo;
  if (span < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
    span = 1;
  }
  lo -= span * 0.12;
  hi += span * 0.12;
  const iw = Math.max(1, W - pad.l - pad.r);
  const ih = Math.max(1, H - pad.t - pad.b);
  const n = Math.max(1, slots);
  const x = (i: number) => pad.l + (i / n) * iw;
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * ih;
  const f = (v: number) => v.toFixed(1);
  const lines = series.map((s) => {
    let d = "";
    let dots = "";
    let pen = false;
    let lastI = -1;
    s.vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${f(x(i))} ${f(y(v))}`;
      dots += `M${f(x(i) - 1.6)} ${f(y(v))}a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0`;
      pen = true;
      lastI = i;
    });
    let live = "";
    if (s.live != null) {
      const lx = x(n);
      const ly = y(s.live);
      if (lastI >= 0) live = `M${f(x(lastI))} ${f(y(s.vals[lastI] as number))}L${f(lx)} ${f(ly)}`;
      dots += `M${f(lx - 2.4)} ${f(ly)}a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0`;
    }
    return { d, dots, live };
  });
  return { lines, lo, hi, zeroY: lo < 0 && hi > 0 ? y(0) : null, x, y };
}

// --- Düzenleme modunda sim verisi yokken yerleştirme için örnek ---

export const SAMPLE_ROWS: Row[] = [
  sampleRow({ idx: 1, pos: 1, classPos: 1, number: "8", name: "Ayşe Demir", irating: 4100, licLetter: "A", sr: 4.4, last: 97.61, best: 97.2, stint: 14, tireKind: "M" }),
  sampleRow({ idx: 2, pos: 6, classPos: 6, number: "44", name: "Luca Rossi", irating: 3150, licLetter: "A", sr: 3.9, last: 98.02, best: 97.74, stint: 9, pits: 1, tireKind: "S" }),
  sampleRow({ idx: 3, pos: 7, classPos: 7, number: "59", name: "Sen", isMe: true, irating: 2450, sr: 3.45, last: 97.88, best: 97.81, stint: 14 }),
  sampleRow({ idx: 4, pos: 8, classPos: 8, number: "3", name: "Noah Fischer", irating: 2800, sr: 4.1, last: 97.7, best: 97.66, stint: 4, pits: 1, tireKind: "M" }),
];

const SAMPLE_LAPS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

export const SAMPLE_GAPS: Gaps = {
  race: true,
  lap: 20,
  laps: SAMPLE_LAPS,
  myPits: [],
  cars: [
    { idx: 1, live: 14.9, hist: [9.8, 10.3, 10.9, 11.2, 11.9, 12.4, 12.8, 13.3, 13.7, 14.1, 14.4, 14.8], pits: [] },
    { idx: 2, live: 1.42, hist: [-18.2, -18.9, -19.4, 4.9, 4.4, 4.1, 3.5, 3.2, 2.6, 2.3, 1.9, 1.55], pits: [3] },
    { idx: 4, live: -0.86, hist: [-3.9, -3.6, -3.4, -3.5, -3.0, -2.7, -2.6, -2.1, -1.8, -1.5, -1.2, -0.95], pits: [] },
  ],
};
