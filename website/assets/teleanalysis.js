// OTOMATİK ÜRETİLİR: src/sdk/teleAnalysis.ts → npx esbuild src/sdk/teleAnalysis.ts --format=esm --outfile=website/assets/teleanalysis.js
const kmh = (tr) => tr.speed.map((v) => v / 10);
function resample(arr, n) {
  const m = arr.length;
  if (m === n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.min(m - 1, Math.round(i * (m - 1) / Math.max(1, n - 1)))]);
}
function findCorners(speed) {
  const n = speed.length;
  if (n < 20) return [];
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
  const out = [];
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
function analyzeCorners(traces, lenKm) {
  const base = traces[0];
  if (!base || base.t.length < 20) return [];
  const n = base.t.length;
  const lenM = (lenKm > 0 ? lenKm : 1) * 1e3;
  const mOf = (i) => i / (n - 1) * lenM;
  const apexes = findCorners(kmh(base));
  if (!apexes.length) return [];
  const laps = traces.map((tr) => ({
    t: resample(tr.t, n),
    v: resample(kmh(tr), n),
    thr: resample(tr.throttle, n),
    brk: resample(tr.brake, n),
    gear: tr.gear ? resample(tr.gear, n) : null
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
        let minGear = null;
        for (let i = Math.max(start, ai - w); i <= Math.min(end, ai + w); i++) {
          if (L.v[i] < minSpeed) minSpeed = L.v[i];
          if (L.gear && L.gear[i] > 0) minGear = minGear == null ? L.gear[i] : Math.min(minGear, L.gear[i]);
        }
        let brakeIdx = null;
        for (let i = start; i <= ai; i++) {
          if (L.brk[i] >= 10) {
            brakeIdx = i;
            break;
          }
        }
        let thrIdx = null;
        for (let i = ai; i <= end; i++) {
          if (L.thr[i] >= 90) {
            thrIdx = i;
            break;
          }
        }
        return {
          time: (L.t[end] - L.t[start]) / 1e3,
          minSpeed: Number.isFinite(minSpeed) ? minSpeed : 0,
          entrySpeed: L.v[brakeIdx ?? start],
          exitSpeed: L.v[exitIdx],
          brakeAt: brakeIdx == null ? null : mOf(brakeIdx),
          throttleAt: thrIdx == null ? null : mOf(thrIdx),
          minGear
        };
      })
    };
  });
}
function coachNotes(stats, base = 0, ref = 1, limit = 3) {
  const notes = [];
  for (const c of stats) {
    const a = c.laps[base];
    const r = c.laps[ref];
    if (!a || !r) continue;
    const reasons = [];
    if (a.brakeAt != null && r.brakeAt != null) {
      const d = r.brakeAt - a.brakeAt;
      if (d > 8) reasons.push({ kind: "brakeEarly", m: d });
      else if (d < -8 && a.minSpeed < r.minSpeed - 2) reasons.push({ kind: "brakeLate", m: -d, slower: r.minSpeed - a.minSpeed });
    }
    if (a.minSpeed < r.minSpeed - 2 && !reasons.some((x) => x.kind === "brakeLate")) reasons.push({ kind: "minSpeed", kmh: r.minSpeed - a.minSpeed });
    if (a.throttleAt != null && r.throttleAt != null && a.throttleAt - r.throttleAt > 10) reasons.push({ kind: "throttleLate", m: a.throttleAt - r.throttleAt });
    if (a.exitSpeed < r.exitSpeed - 3) reasons.push({ kind: "exitSpeed", kmh: r.exitSpeed - a.exitSpeed });
    if (a.minGear != null && r.minGear != null && a.minGear !== r.minGear) reasons.push({ kind: "gear", mine: a.minGear, ref: r.minGear });
    notes.push({ corner: c.n, apexPct: c.apexPct, delta: a.time - r.time, reasons });
  }
  const losses = notes.filter((x) => x.delta > 0.02).sort((x, y) => y.delta - x.delta).slice(0, limit);
  const gain = notes.filter((x) => x.delta < -0.02).sort((x, y) => x.delta - y.delta)[0] ?? null;
  return { losses, best: gain };
}
function theoreticalBest(traces, lapTimes, parts = 24) {
  const base = traces[0];
  if (!base || traces.length < 2 || base.t.length < parts * 2) return null;
  const n = base.t.length;
  const ts = traces.map((tr) => resample(tr.t, n));
  const owner = [];
  let gainA = 0;
  for (let p = 0; p < parts; p++) {
    const a = Math.round(p * (n - 1) / parts);
    const b = Math.round((p + 1) * (n - 1) / parts);
    let best = Infinity;
    let who = 0;
    ts.forEach((t, j) => {
      const d = (t[b] - t[a]) / 1e3;
      if (d > 0 && d < best) {
        best = d;
        who = j;
      }
    });
    const mine = (ts[0][b] - ts[0][a]) / 1e3;
    if (Number.isFinite(best) && mine > best) gainA += mine - best;
    owner.push(who);
  }
  const baseTime = lapTimes[0] > 0 ? lapTimes[0] : (ts[0][n - 1] - ts[0][0]) / 1e3;
  const time = Math.min(baseTime - gainA, ...lapTimes.filter((x) => x > 0));
  return { time, parts, gap: lapTimes.map((lt) => lt > 0 ? Math.max(0, lt - time) : 0), owner };
}
export {
  analyzeCorners,
  coachNotes,
  findCorners,
  theoreticalBest
};
