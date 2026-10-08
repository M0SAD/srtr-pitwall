// Telemetri › Tur analizi: pist haritası üzerinde referansa göre nerede hızlı / yavaş olduğun (PRO).
// Harita, bu bilgisayarda öğrenilmiş pist şeklinden çizilir (Rust `track_shape`); referans izler tek seferde indirilir
// ve önbelleğe alınır (cloud/teleref.ts) — sayfa açıkken sunucuya sürekli istek atılmaz.

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { t } from "@/sdk/i18n";
import { lapTime } from "@/sdk/format";
import { F, proLocked } from "@/sdk/proFeatures";
import type { LapInfo, Trace } from "@/cloud/telemetry";
import { loadRef, type RefKind } from "@/cloud/teleref";
import { fitTransform } from "@/overlays/trackmap/draw";
import type { Shape } from "@/sdk/trackshape";
import { ProLockBox } from "./ProLock";

type Mode = "delta" | "speed" | "sectors";
type Source = "lapB" | RefKind;

const VW = 900;
const VH = 520;
/** Haritadaki renkli parça sayısı (ardışık noktalar birleştirilir) */
const SEGS = 360;

const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
const mix = (c1: number[], c2: number[], k: number) => `rgb(${lerp(c1[0], c2[0], k)},${lerp(c1[1], c2[1], k)},${lerp(c1[2], c2[2], k)})`;
const NEUTRAL = [122, 130, 146];
const GREEN = [46, 204, 113];
const RED = [255, 77, 79];
const BLUE = [58, 132, 255];
/** v: -1 (iyi) .. 0 .. 1 (kötü) → yumuşak geçişli renk */
const grad = (v: number, good: number[]) => {
  const k = Math.min(1, Math.abs(v));
  return mix(NEUTRAL, v < 0 ? good : RED, Math.pow(k, 0.7));
};

function toShape(pts: [number, number][]): Shape {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { version: 0, pts, bbox: { minX, maxX, minY, maxY } };
}

/** Referans izini temel turun nokta sayısına getirir */
const resample = (arr: number[], from: number, n: number) => Array.from({ length: n }, (_, i) => arr[Math.min(from - 1, Math.round((i * from) / n))] ?? 0);

/** Virajlar: temel turda belirgin hız dipleri (tur oranı olarak sıra) */
function corners(speed: number[]): number[] {
  const n = speed.length;
  const w = Math.max(4, Math.round(n * 0.02));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let min = true;
    let hi = 0;
    for (let k = -w; k <= w; k++) {
      const v = speed[(i + k + n) % n];
      if (v < speed[i]) {
        min = false;
        break;
      }
      hi = Math.max(hi, v);
    }
    if (min && hi > speed[i] * 1.08 && (!out.length || i - out[out.length - 1] > w * 2)) out.push(i);
  }
  return out.slice(0, 30);
}

export function TeleMap(p: { base: { info: LapInfo; trace: Trace }; other?: { info: LapInfo; trace: Trace } }) {
  const [mode, setMode] = createSignal<Mode>("delta");
  const [source, setSource] = createSignal<Source>(p.other ? "lapB" : "session");
  const [labels, setLabels] = createSignal(true);
  const info = () => p.base.info;
  const combo = () => ({ sim: info().sim, track_id: info().track_id, track_config: info().track_config, car_id: info().car_id });

  const [shape] = createResource(
    () => `${info().sim}|${info().track_id}|${info().track_name}|${info().track_config}`,
    async () => {
      if (!inTauri) return null;
      const pts = await invoke<[number, number][] | null>("track_shape", { sim: info().sim, trackId: info().track_id, trackName: info().track_name, trackConfig: info().track_config }).catch(() => null);
      return pts && pts.length >= 50 ? toShape(pts) : null;
    },
  );

  const communityLocked = () => proLocked(F.teleCommunity);
  /** Seçili referans: { ad, süre, iz } ya da null (yeterli veri yok) */
  const [ref] = createResource(
    () => [source(), info().id, p.other?.info.id ?? ""] as const,
    async ([src]) => {
      if (src === "lapB") return p.other ? { name: p.other.info.driver_name || p.other.info.display_name, time: p.other.info.lap_time, laps: 1, trace: p.other.trace, same: false } : null;
      if ((src === "best" || src === "avg") && communityLocked()) return null;
      const r = await loadRef(src, combo(), { sessionId: info().session_id });
      return r ? { name: r.name, time: r.time, laps: r.laps, trace: r.trace, same: r.lapId === info().id } : null;
    },
  );

  const calc = createMemo(() => {
    const r = ref();
    const b = p.base.trace;
    if (!r || !b?.n) return null;
    const n = b.n;
    const rt = resample(r.trace.t, r.trace.n, n);
    const rs = resample(r.trace.speed, r.trace.n, n);
    /** Tur içi fark (sn): + temel tur referanstan yavaş */
    const d = b.t.slice(0, n).map((v, i) => (v - rt[i]) / 1000);
    const dv = b.speed.slice(0, n).map((v, i) => (v - rs[i]) / 10);
    return { n, d, dv };
  });

  const segments = createMemo(() => {
    const s = shape();
    const c = calc();
    if (!s) return null;
    const xf = fitTransform(s, VW, VH, 46, 0, false);
    const m = s.pts.length;
    const at = (k: number) => xf(s.pts[Math.min(m - 1, Math.floor(k * m)) % m]);
    const N = SEGS;
    const md = mode();
    // Renk ölçeği: kazanç / kayıp hızı (sn / tur oranı) ya da hız farkı (km/h)
    let vals: number[] = new Array(N).fill(0);
    let sectorDelta: number[] = [];
    if (c) {
      const idx = (k: number) => Math.min(c.n - 1, Math.max(0, Math.round(k * c.n)));
      if (md === "speed") vals = vals.map((_, i) => -c.dv[idx((i + 0.5) / N)]);
      else if (md === "delta") {
        const w = 0.012;
        vals = vals.map((_, i) => {
          const k = (i + 0.5) / N;
          return c.d[idx(Math.min(1, k + w))] - c.d[idx(Math.max(0, k - w))];
        });
      } else {
        const ns = Math.max(3, Math.min(9, p.base.info.sectors?.length || 3));
        sectorDelta = Array.from({ length: ns }, (_, j) => c.d[idx((j + 1) / ns) === c.n - 1 ? c.n - 1 : idx((j + 1) / ns)] - c.d[idx(j / ns)]);
        vals = vals.map((_, i) => sectorDelta[Math.min(ns - 1, Math.floor(((i + 0.5) / N) * ns))]);
      }
    }
    const sorted = vals.map(Math.abs).sort((a, b) => a - b);
    const scale = Math.max(sorted[Math.floor(N * 0.92)] || 0, md === "speed" ? 3 : md === "delta" ? 0.01 : 0.02);
    const good = md === "delta" ? GREEN : BLUE;
    const segs = Array.from({ length: N }, (_, i) => {
      const a = at(i / N);
      const b = at((i + 1) / N);
      return { x1: a[0], y1: a[1], x2: b[0], y2: b[1], c: c ? grad(vals[i] / scale, good) : mix(NEUTRAL, NEUTRAL, 0) };
    });
    // Etiketler
    const tags: { x: number; y: number; text: string; bad: boolean }[] = [];
    if (c && labels()) {
      const fmt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(Math.abs(v) < 1 ? 3 : 2)}`;
      const push = (k: number, v: number) => {
        const [x, y] = at(((k % 1) + 1) % 1);
        // Etiket çizginin dışına: harita merkezinden uzağa doğru itilir
        const dx = x - VW / 2;
        const dy = y - VH / 2;
        const l = Math.hypot(dx, dy) || 1;
        tags.push({ x: x + (dx / l) * 26, y: y + (dy / l) * 20, text: fmt(v), bad: v > 0 });
      };
      if (md === "sectors") sectorDelta.forEach((v, j) => push((j + 0.5) / sectorDelta.length, v));
      else {
        const cs = corners(p.base.trace.speed.slice(0, c.n));
        cs.forEach((ci, j) => {
          const prev = cs[(j - 1 + cs.length) % cs.length];
          const next = cs[(j + 1) % cs.length];
          const a = j === 0 ? Math.max(0, Math.round(ci / 2)) : Math.round((prev + ci) / 2);
          const b = j === cs.length - 1 ? Math.min(c.n - 1, Math.round((ci + c.n) / 2)) : Math.round((ci + next) / 2);
          const v = md === "speed" ? c.dv[ci] : c.d[b] - c.d[a];
          if (md === "speed") {
            const [x, y] = at(ci / c.n);
            const dx = x - VW / 2;
            const dy = y - VH / 2;
            const l = Math.hypot(dx, dy) || 1;
            tags.push({ x: x + (dx / l) * 26, y: y + (dy / l) * 20, text: `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}`, bad: v < 0 });
          } else if (Math.abs(v) >= 0.005) push(ci / c.n, v);
        });
      }
    }
    const start = at(0);
    return { segs, tags, start };
  });

  const total = () => {
    const c = calc();
    return c ? c.d[c.n - 1] : null;
  };
  const refTitle = () => {
    const r = ref();
    const s = source();
    if (!r) return "";
    const who = s === "avg" ? t("Topluluk ortalaması ({0} tur)", r.laps) : r.name || "";
    return `${who} · ${lapTime(r.time)}`;
  };
  const noData = () => {
    const s = source();
    if ((s === "best" || s === "avg") && communityLocked()) return t("Toplulukla kıyaslama PRO üyelere özel.");
    if (s === "avg") return t("Yeterli veri yok: ortalama için bu pist ve araçta izi paylaşılmış en az 3 tur gerekir.");
    if (s === "best") return t("Yeterli veri yok: bu pist ve araç için toplulukta izi paylaşılmış bir tur yok.");
    if (s === "mine") return t("Yeterli veri yok: bu pist ve araçta izi kayıtlı başka bir turun yok.");
    return t("Yeterli veri yok: bu oturumda izi kayıtlı bir tur yok.");
  };

  return (
    <section class="panel tmap">
      <div class="tele-head">
        <div>
          <h3>
            Pist haritası <span class="pro-badge small">PRO</span>
          </h3>
          <p class="muted small">Seçtiğin referansa göre pistin neresinde zaman kazanıp neresinde kaybettiğini gösterir.</p>
        </div>
      </div>
      <ProLockBox feature={F.teleMap} text="Pist haritasında hızlı / yavaş noktalar PRO üyelere özel.">
        <div class="tmap-tools">
          <label class="tmap-f">
            <span>Referans</span>
            <select value={source()} onChange={(e) => setSource(e.currentTarget.value as Source)}>
              <Show when={p.other}>
                <option value="lapB">Karşılaştırılan tur (B)</option>
              </Show>
              <option value="session">Bu oturumun en iyi turu</option>
              <option value="mine">Kendi rekorum</option>
              <option value="best">Topluluğun en iyi turu</option>
              <option value="avg">Topluluk ortalaması</option>
            </select>
          </label>
          <div class="seg small">
            <button classList={{ on: mode() === "delta" }} onClick={() => setMode("delta")} title={t("Yeşil: zaman kazandığın, kırmızı: kaybettiğin yerler")}>
              Zaman kazancı / kaybı
            </button>
            <button classList={{ on: mode() === "speed" }} onClick={() => setMode("speed")} title={t("Mavi: referanstan hızlı, kırmızı: yavaş olduğun noktalar")}>
              Hız farkı
            </button>
            <button classList={{ on: mode() === "sectors" }} onClick={() => setMode("sectors")} title={t("Mavi: hızlı, kırmızı: yavaş olduğun sektörler")}>
              Sektörler
            </button>
          </div>
          <label class="chk">
            <input type="checkbox" checked={labels()} onChange={(e) => setLabels(e.currentTarget.checked)} />
            Farkları haritada göster
          </label>
        </div>
        <Show when={!shape.loading && !shape()}>
          <p class="muted tmap-note">Bu pistin haritası bu bilgisayarda henüz yok. Pistte bir tur attığında harita öğrenilir ve burada görünür.</p>
        </Show>
        <Show when={shape()}>
          <div class="tmap-box">
            <svg viewBox={`0 0 ${VW} ${VH}`} class="tmap-svg">
              <For each={segments()?.segs}>{(s) => <line class="tmap-bg" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />}</For>
              <For each={segments()?.segs}>{(s) => <line class="tmap-seg" x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.c} />}</For>
              <Show when={segments()}>
                <circle class="tmap-start" cx={segments()!.start[0]} cy={segments()!.start[1]} r="7" />
              </Show>
              <For each={segments()?.tags}>
                {(g) => (
                  <text class="tmap-tag" classList={{ bad: g.bad }} x={g.x} y={g.y} text-anchor="middle" dominant-baseline="middle">
                    {g.text}
                  </text>
                )}
              </For>
            </svg>
            <div class="tmap-side">
              <Show when={ref.loading}>
                <p class="muted small">Referans tur yükleniyor…</p>
              </Show>
              <Show when={!ref.loading && !ref()}>
                <p class="tmap-nodata">{noData()}</p>
              </Show>
              <Show when={!ref.loading && ref()}>
                <small class="muted">Referans</small>
                <b data-no-i18n>{refTitle()}</b>
                <Show when={ref()!.same}>
                  <p class="muted small">Bu tur zaten referansın kendisi: fark yok.</p>
                </Show>
                <Show when={total() != null}>
                  <small class="muted">Tur sonu farkı</small>
                  <b class="tmap-total" classList={{ bad: total()! > 0.0005, good: total()! < -0.0005 }} data-no-i18n>
                    {total()! >= 0 ? "+" : "−"}
                    {Math.abs(total()!).toFixed(3)}
                  </b>
                </Show>
                <div class="tmap-legend" classList={{ blue: mode() !== "delta" }}>
                  <i />
                  <span>{mode() === "delta" ? t("kazanç") : t("hızlı")}</span>
                  <span>{mode() === "delta" ? t("kayıp") : t("yavaş")}</span>
                </div>
                <p class="muted small">
                  {mode() === "delta"
                    ? t("Sayılar her virajda (giriş + çıkış) kazandığın ya da kaybettiğin süredir.")
                    : mode() === "speed"
                      ? t("Sayılar virajın en yavaş noktasında referansa göre hız farkındır (km/h).")
                      : t("Sayılar her sektörde kazandığın ya da kaybettiğin süredir.")}
                </p>
              </Show>
            </div>
          </div>
        </Show>
      </ProLockBox>
    </section>
  );
}
