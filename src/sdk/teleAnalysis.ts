// Telemetri › Tur analizi: viraj viraj analiz, koçluk notları, teorik en iyi tur.
// Girdi: turların izleri (mesafeye göre eşit aralıklı noktalar; t ms, speed km/h×10, throttle/brake %, gear, steer).
// Saf hesap (DOM yok): uygulama (TelemetryPage) ve web sitesi paylaşım sayfası (website/assets/teleanalysis.js —
// bu dosyadan esbuild ile üretilir: `npx esbuild src/sdk/teleAnalysis.ts --format=esm --outfile=website/assets/teleanalysis.js`)
// aynı sonucu gösterir.

export interface TraceLike {
  t: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  gear?: number[];
}

export interface CornerLap {
  /** Viraj bölümündeki süre (sn) */
  time: number;
  /** En düşük hız (km/h) */
  minSpeed: number;
  /** Fren başlangıcındaki hız (km/h); fren yoksa bölüm başındaki hız */
  entrySpeed: number;
  /** Çıkış hızı (km/h): apeks ile sonraki virajın ortası arasının yarısında */
  exitSpeed: number;
  /** Fren noktası (tur başından metre); frene basılmadıysa null */
  brakeAt: number | null;
  /** Tam gaza geçiş noktası (metre); bölümde tam gaz yoksa null */
  throttleAt: number | null;
  /** En düşük vites */
  minGear: number | null;
}

export interface CornerStat {
  /** Viraj numarası (1'den) */
  n: number;
  /** Tur oranları (0..1): bölüm başı, apeks, bölüm sonu */
  startPct: number;
  apexPct: number;
  endPct: number;
  /** Metre */
  apexM: number;
  laps: CornerLap[];
}

/** Hız (km/h) dizisi */
const kmh = (tr: TraceLike) => tr.speed.map((v) => v / 10);

/** Bir turun dizisini temel turun nokta sayısına getirir */
function resample<T>(arr: T[], n: number): T[] {
  const m = arr.length;
  if (m === n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.min(m - 1, Math.round((i * (m - 1)) / Math.max(1, n - 1)))]);
}

/** Virajlar: temel turda belirgin hız dipleri (indeksler) */
export function findCorners(speed: number[]): number[] {
  const n = speed.length;
  if (n < 20) return [];
  // Hafif yumuşatma (gürültüdeki küçük dipler viraj sayılmasın)
  const s = speed.map((_, i) => {
    let sum = 0;
    let c = 0;
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        sum += speed[j];
        c++;
      }
    }
    return sum / c;
  });
  const w = Math.max(4, Math.round(n * 0.02));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let min = true;
    let hi = 0;
    for (let k = -w; k <= w; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      if (s[j] < s[i]) {
        min = false;
        break;
      }
      hi = Math.max(hi, s[j]);
    }
    if (min && hi > s[i] * 1.08 && (!out.length || i - out[out.length - 1] > w * 2)) out.push(i);
  }
  return out.slice(0, 40);
}

/**
 * Viraj viraj analiz. Virajlar ilk turdan (A) bulunur; her tur aynı bölümlerde ölçülür.
 * `lenKm`: pist uzunluğu (metre hesapları; bilinmiyorsa 0 → tur yüzdesi × 1000).
 */
export function analyzeCorners(traces: TraceLike[], lenKm: number): CornerStat[] {
  const base = traces[0];
  if (!base || base.t.length < 20) return [];
  const n = base.t.length;
  const lenM = (lenKm > 0 ? lenKm : 1) * 1000;
  const mOf = (i: number) => (i / (n - 1)) * lenM;
  const apexes = findCorners(kmh(base));
  if (!apexes.length) return [];
  const laps = traces.map((tr) => ({
    t: resample(tr.t, n),
    v: resample(kmh(tr), n),
    thr: resample(tr.throttle, n),
    brk: resample(tr.brake, n),
    gear: tr.gear ? resample(tr.gear, n) : null,
  }));
  const w = Math.max(3, Math.round(n * 0.015));
  return apexes.map((ai, k) => {
    const prev = k > 0 ? apexes[k - 1] : null;
    const next = k < apexes.length - 1 ? apexes[k + 1] : null;
    const start = prev == null ? 0 : Math.round((prev + ai) / 2);
    const end = next == null ? n - 1 : Math.round((ai + next) / 2);
    const exitIdx = Math.min(end, Math.round(ai + (end - ai) * 0.5));
    return {
      n: k + 1,
      startPct: start / (n - 1),
      apexPct: ai / (n - 1),
      endPct: end / (n - 1),
      apexM: mOf(ai),
      laps: laps.map((L) => {
        let minSpeed = Infinity;
        let minGear: number | null = null;
        for (let i = Math.max(start, ai - w); i <= Math.min(end, ai + w); i++) {
          if (L.v[i] < minSpeed) minSpeed = L.v[i];
          if (L.gear && L.gear[i] > 0) minGear = minGear == null ? L.gear[i] : Math.min(minGear, L.gear[i]);
        }
        // Fren noktası: bölümde apeksten önce frenin ilk %10'u geçtiği yer
        let brakeIdx: number | null = null;
        for (let i = start; i <= ai; i++) {
          if (L.brk[i] >= 10) {
            brakeIdx = i;
            break;
          }
        }
        // Tam gaz: apeksten sonra gazın ilk %90'ı geçtiği yer
        let thrIdx: number | null = null;
        for (let i = ai; i <= end; i++) {
          if (L.thr[i] >= 90) {
            thrIdx = i;
            break;
          }
        }
        return {
          time: (L.t[end] - L.t[start]) / 1000,
          minSpeed: Number.isFinite(minSpeed) ? minSpeed : 0,
          entrySpeed: L.v[brakeIdx ?? start],
          exitSpeed: L.v[exitIdx],
          brakeAt: brakeIdx == null ? null : mOf(brakeIdx),
          throttleAt: thrIdx == null ? null : mOf(thrIdx),
          minGear,
        };
      }),
    };
  });
}

/** Koçluk notunun bir sebebi (arayüz kendi dilinde yazar) */
export type CoachReason =
  | { kind: "brakeEarly"; m: number }
  | { kind: "brakeLate"; m: number; slower: number }
  | { kind: "minSpeed"; kmh: number }
  | { kind: "throttleLate"; m: number }
  | { kind: "exitSpeed"; kmh: number }
  | { kind: "gear"; mine: number; ref: number };

export interface CoachNote {
  corner: number;
  apexPct: number;
  /** Bu virajda kaybedilen (+) / kazanılan (−) süre, sn */
  delta: number;
  reasons: CoachReason[];
}

/**
 * Koçluk notları: `base` turunun `ref` turuna göre en çok süre kaybettiği virajlar (en çok `limit`) ve nedenleri;
 * ayrıca en çok kazandığı viraj (güçlü yan). Eşikler: fren 8 m, hız 2-3 km/h, gaz 10 m, süre 0,02 sn.
 */
export function coachNotes(stats: CornerStat[], base = 0, ref = 1, limit = 3): { losses: CoachNote[]; best: CoachNote | null } {
  const notes: CoachNote[] = [];
  for (const c of stats) {
    const a = c.laps[base];
    const r = c.laps[ref];
    if (!a || !r) continue;
    const reasons: CoachReason[] = [];
    if (a.brakeAt != null && r.brakeAt != null) {
      const d = r.brakeAt - a.brakeAt; // + : ben daha önce frenliyorum
      if (d > 8) reasons.push({ kind: "brakeEarly", m: d });
      else if (d < -8 && a.minSpeed < r.minSpeed - 2) reasons.push({ kind: "brakeLate", m: -d, slower: r.minSpeed - a.minSpeed });
    }
    if (a.minSpeed < r.minSpeed - 2 && !reasons.some((x) => x.kind === "brakeLate")) reasons.push({ kind: "minSpeed", kmh: r.minSpeed - a.minSpeed });
    if (a.throttleAt != null && r.throttleAt != null && a.throttleAt - r.throttleAt > 10) reasons.push({ kind: "throttleLate", m: a.throttleAt - r.throttleAt });
    if (a.exitSpeed < r.exitSpeed - 3) reasons.push({ kind: "exitSpeed", kmh: r.exitSpeed - a.exitSpeed });
    if (a.minGear != null && r.minGear != null && a.minGear !== r.minGear) reasons.push({ kind: "gear", mine: a.minGear, ref: r.minGear });
    notes.push({ corner: c.n, apexPct: c.apexPct, delta: a.time - r.time, reasons });
  }
  const losses = notes
    .filter((x) => x.delta > 0.02)
    .sort((x, y) => y.delta - x.delta)
    .slice(0, limit);
  const gain = notes.filter((x) => x.delta < -0.02).sort((x, y) => x.delta - y.delta)[0] ?? null;
  return { losses, best: gain };
}

export interface Theoretical {
  /** Teorik en iyi tur (sn): her mikro sektörde kıyaslanan turların en hızlısı */
  time: number;
  /** Mikro sektör sayısı */
  parts: number;
  /** Her turun teorik en iyiye uzaklığı (sn, ≥ 0) */
  gap: number[];
  /** Her mikro sektörü hangi tur kazandı (indeks) */
  owner: number[];
}

/** Teorik en iyi tur: tur mesafeye göre `parts` eşit mikro sektöre bölünür */
export function theoreticalBest(traces: TraceLike[], lapTimes: number[], parts = 24): Theoretical | null {
  const base = traces[0];
  if (!base || traces.length < 2 || base.t.length < parts * 2) return null;
  const n = base.t.length;
  const ts = traces.map((tr) => resample(tr.t, n));
  const owner: number[] = [];
  // A'nın her mikro sektörde en hızlıya göre kaybı toplanır; teorik tur = A'nın resmi tur süresi − bu toplam
  // (izin toplam süresi resmi tur süresinden biraz farklı olabilir; böylece sonuç resmi sürelerle tutarlı kalır)
  let gainA = 0;
  for (let p = 0; p < parts; p++) {
    const a = Math.round((p * (n - 1)) / parts);
    const b = Math.round(((p + 1) * (n - 1)) / parts);
    let best = Infinity;
    let who = 0;
    ts.forEach((t, j) => {
      const d = (t[b] - t[a]) / 1000;
      if (d > 0 && d < best) {
        best = d;
        who = j;
      }
    });
    const mine = (ts[0][b] - ts[0][a]) / 1000;
    if (Number.isFinite(best) && mine > best) gainA += mine - best;
    owner.push(who);
  }
  const baseTime = lapTimes[0] > 0 ? lapTimes[0] : (ts[0][n - 1] - ts[0][0]) / 1000;
  const time = Math.min(baseTime - gainA, ...lapTimes.filter((x) => x > 0));
  return { time, parts, gap: lapTimes.map((lt) => (lt > 0 ? Math.max(0, lt - time) : 0)), owner };
}
