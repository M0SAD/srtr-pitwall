// Sektör Süreleri: güncel turun sektörleri renk koduyla (mor sınıfın en iyisi, yeşil kişisel en iyi, sarı yavaş),
// son tur, en iyi sektörler, teorik en iyi tur ve tur içi sektör farkı.
// Üç özgün tasarım:  boxes → Kompakt kutular   bars → Renkli çubuklar   table → Tablo (PRO)
// Veri: `sectors` konusu (Rust: timing.rs). Sektör sınırları simin resmi sektörleri; yoksa üç eşit mesafe.

import { For, Match, Show, Switch, createMemo, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { lapTime } from "@/sdk/format";
import { t } from "@/sdk/i18n";
import type { Sectors } from "@/sdk/types";
import "./style.css";

const DESIGNS = ["boxes", "bars", "table"] as const;
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const EPS = 0.0005;

/** Düzenleme modunda sim verisi yokken yerleştirme için örnek */
const SAMPLE: Sectors = {
  n: 3,
  official: true,
  bounds: [0.31, 0.68],
  lap: 7,
  lapPct: 0.82,
  sector: 2,
  sectorTime: 14.6,
  lapTime: 77.012,
  current: [29.874, 32.538],
  last: [30.102, 32.611, 31.905],
  best: [29.874, 32.402, 31.77],
  bestPrev: [29.951, 32.402, 31.77],
  classBest: [29.874, 32.115, 31.52],
  classBestNo: ["59", "12", "44"],
  optimal: 94.046,
  classOptimal: 93.509,
  bestLap: 94.388,
  lastLap: 94.618,
  onPitRoad: false,
};

type Tone = "class" | "best" | "slow" | "";

interface Cell {
  i: number;
  /** Gösterilecek süre (0 = yok) */
  time: number;
  tone: Tone;
  /** Referansa göre fark; referans yoksa null */
  delta: number | null;
  state: "done" | "live" | "wait";
  /** Çubuk tasarımı: sektörün turdaki payı ve süren sektörün doluluğu (0..1) */
  share: number;
  fill: number;
}

function createModel(props: OverlayProps) {
  const live = useTopic("sectors");
  const o = () => props.options;
  const d = createMemo<Sectors | undefined>(() => live() ?? (props.editing ? SAMPLE : undefined));
  const dec = () => clamp(parseInt(String(o().decimals ?? "3"), 10) || 3, 1, 3);
  const fmt = (v: number) => (v > 0 ? (v >= 60 ? lapTime(v, dec()) : v.toFixed(dec())) : "—");
  const fmtDelta = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(dec())}`);

  const tone = (v: number, i: number, x: Sectors): Tone => {
    if (!(v > 0)) return "";
    if (x.classBest[i] > 0 && v <= x.classBest[i] + EPS) return "class";
    if (x.best[i] > 0 && v <= x.best[i] + EPS) return "best";
    return "slow";
  };
  const refs = (x: Sectors): number[] => {
    const r = o().reference;
    if (r === "last") return x.last.length === x.n ? x.last : [];
    if (r === "class") return x.classBest;
    // Tur başındaki en iyi: bu turda kırılan rekorun farkı da görünsün
    return x.bestPrev.some((v) => v > 0) ? x.bestPrev : x.best;
  };

  /** Çizgiden hemen sonra biten turun sektörleri bir süre gösterilir */
  const holding = createMemo(() => {
    const x = d();
    if (!x) return false;
    const hold = clamp(num(o().hold, 6), 0, 20);
    return hold > 0 && x.current.length === 0 && x.last.length === x.n && x.sectorTime >= 0 && x.lapTime < hold;
  });

  const cells = createMemo<Cell[]>(() => {
    const x = d();
    if (!x) return [];
    const hold = holding();
    const src = hold ? x.last : x.current;
    const ref = refs(x);
    const out: Cell[] = [];
    for (let i = 0; i < x.n; i++) {
      const a = i === 0 ? 0 : x.bounds[i - 1] || 0;
      const b = i === x.n - 1 ? 1 : x.bounds[i] || 0;
      const known = b > a;
      const share = known ? b - a : 1 / x.n;
      const r = ref[i] > 0 ? ref[i] : 0;
      if (i < src.length) {
        const v = src[i];
        out.push({ i, time: v, tone: tone(v, i, x), delta: r > 0 ? v - r : null, state: "done", share, fill: 1 });
      } else if (!hold && i === x.sector && x.sectorTime >= 0) {
        const fill = known ? clamp((x.lapPct - a) / (b - a), 0, 1) : r > 0 ? clamp(x.sectorTime / r, 0, 1) : 0.5;
        // Referans aşıldıysa fark canlı büyür
        out.push({ i, time: x.sectorTime, tone: "", delta: r > 0 && x.sectorTime > r ? x.sectorTime - r : null, state: "live", share, fill });
      } else {
        out.push({ i, time: 0, tone: "", delta: null, state: "wait", share, fill: 0 });
      }
    }
    return out;
  });

  /** Toplam fark: biten sektörler + süren sektörde aşılan kısım */
  const total = createMemo<number | null>(() => {
    let sum = 0;
    let any = false;
    for (const c of cells()) {
      if (c.delta != null) {
        sum += c.delta;
        any = true;
      }
    }
    return any ? sum : null;
  });

  return { d, o, cells, total, holding, fmt, fmtDelta, tone, dec };
}

type Model = ReturnType<typeof createModel>;

const deltaClass = (v: number | null) => (v == null ? "" : v < -EPS ? "sec-gain" : v > EPS ? "sec-loss" : "");

function Summary(props: { m: Model }) {
  const m = props.m;
  const x = () => m.d()!;
  return (
    <div class="sec-sum">
      <Show when={m.o().showLast !== false}>
        <span class="sec-kv">
          <i>Son</i>
          <b>{lapTime(x().lastLap, m.dec())}</b>
        </span>
      </Show>
      <Show when={m.o().showBest !== false}>
        <span class="sec-kv">
          <i>En iyi</i>
          <b>{lapTime(x().bestLap, m.dec())}</b>
        </span>
      </Show>
      <Show when={m.o().showOptimal !== false}>
        <span class="sec-kv sec-opt">
          <i>Teorik</i>
          <b>{lapTime(x().optimal, m.dec())}</b>
        </span>
      </Show>
    </div>
  );
}

function Total(props: { m: Model }) {
  const m = props.m;
  return (
    <Show when={m.o().showDelta !== false}>
      <span class={`sec-total ${deltaClass(m.total())}`}>{m.total() == null ? "—" : m.fmtDelta(m.total())}</span>
    </Show>
  );
}

function Boxes(props: { m: Model }) {
  const m = props.m;
  return (
    <>
      <div class="sec-row">
        <div class="sec-boxes">
          <For each={m.cells()}>
            {(c) => (
              <div class={`sec-box sec-${c.state} ${c.tone ? `sec-t-${c.tone}` : ""}`}>
                <span class="sec-lbl">S{c.i + 1}</span>
                <span class="sec-time">
                  {c.state === "done" || (c.state === "live" && m.o().showLive !== false) ? (c.state === "live" ? c.time.toFixed(1) : m.fmt(c.time)) : "—"}
                </span>
                <Show when={m.o().showDelta !== false}>
                  <span class={`sec-d ${deltaClass(c.delta)}`}>{m.fmtDelta(c.delta) || " "}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Total m={m} />
      </div>
      <Summary m={m} />
    </>
  );
}

function Bars(props: { m: Model }) {
  const m = props.m;
  return (
    <>
      <div class="sec-row">
        <div class="sec-bars">
          <For each={m.cells()}>
            {(c) => (
              <div class={`sec-seg sec-${c.state} ${c.tone ? `sec-t-${c.tone}` : ""}`} style={{ "flex-grow": String(Math.max(0.08, c.share)) }}>
                <div class="sec-track">
                  <div class="sec-fill" style={{ width: `${(c.fill * 100).toFixed(1)}%` }} />
                </div>
                <span class="sec-time">
                  {c.state === "done" ? m.fmt(c.time) : c.state === "live" && m.o().showLive !== false ? c.time.toFixed(1) : `S${c.i + 1}`}
                </span>
              </div>
            )}
          </For>
        </div>
        <Total m={m} />
      </div>
      <Summary m={m} />
    </>
  );
}

function Table(props: { m: Model }) {
  const m = props.m;
  const x = () => m.d()!;
  const idx = () => Array.from({ length: x().n }, (_, i) => i);
  const cur = (i: number) => m.cells()[i];
  const cols = (): JSX.CSSProperties => ({ "grid-template-columns": `minmax(4.2em, auto) repeat(${x().n}, minmax(3.4em, 1fr)) minmax(5em, auto)` });
  return (
    <div class="sec-table" style={cols()}>
      <span class="sec-th" />
      <For each={idx()}>{(i) => <span class="sec-th">S{i + 1}</span>}</For>
      <span class="sec-th">Tur</span>

      <span class="sec-rh">Güncel</span>
      <For each={idx()}>
        {(i) => (
          <span class={`sec-td sec-${cur(i).state} ${cur(i).tone ? `sec-t-${cur(i).tone}` : ""}`}>
            {cur(i).state === "done" ? m.fmt(cur(i).time) : cur(i).state === "live" && m.o().showLive !== false ? cur(i).time.toFixed(1) : "—"}
          </span>
        )}
      </For>
      <span class={`sec-td sec-sumcell ${deltaClass(m.total())}`}>{m.o().showDelta !== false && m.total() != null ? m.fmtDelta(m.total()) : "—"}</span>

      <Show when={m.o().showLast !== false}>
        <span class="sec-rh">Son tur</span>
        <For each={idx()}>{(i) => <span class={`sec-td sec-t-${m.tone(x().last[i] ?? 0, i, x())}`}>{m.fmt(x().last[i] ?? 0)}</span>}</For>
        <span class="sec-td sec-sumcell">{lapTime(x().lastLap, m.dec())}</span>
      </Show>

      <Show when={m.o().showBest !== false}>
        <span class="sec-rh">En iyi</span>
        <For each={idx()}>{(i) => <span class={`sec-td sec-t-${m.tone(x().best[i], i, x()) === "class" ? "class" : "best"}`}>{m.fmt(x().best[i])}</span>}</For>
        <span class="sec-td sec-sumcell">{lapTime(x().bestLap, m.dec())}</span>
      </Show>

      <Show when={m.o().showClass !== false}>
        <span class="sec-rh">Sınıf</span>
        <For each={idx()}>
          {(i) => (
            <span class="sec-td sec-t-class">
              {m.fmt(x().classBest[i])}
              <Show when={x().classBestNo[i]}>
                <small>#{x().classBestNo[i]}</small>
              </Show>
            </span>
          )}
        </For>
        <span class="sec-td sec-sumcell sec-t-class">{lapTime(x().classOptimal, m.dec())}</span>
      </Show>

      <Show when={m.o().showOptimal !== false}>
        <span class="sec-rh sec-foot">Teorik en iyi</span>
        <span class="sec-td sec-foot sec-wide" style={{ "grid-column": `2 / span ${x().n}` }}>
          <Show when={x().optimal > 0 && x().bestLap > 0}>
            <span class="ov-dim">En iyi turdan</span> <b class="sec-gain">−{Math.max(0, x().bestLap - x().optimal).toFixed(3)}</b>
          </Show>
        </span>
        <span class="sec-td sec-sumcell sec-foot sec-t-best">{lapTime(x().optimal, m.dec())}</span>
      </Show>
    </div>
  );
}

export default function SectorsOverlay(props: OverlayProps) {
  const m = createModel(props);
  const o = () => props.options;
  const design = (): Design => {
    const v = o().design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("sectors", "design", v) ? v : "boxes";
  };
  const visible = () => {
    const x = m.d();
    if (!x) return false;
    if (props.editing) return true;
    return !(o().hidePits && x.onPitRoad);
  };
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 14), 10, 28)}px`,
    width: `${clamp(num(o().width, 360), 200, 800)}px`,
    "--sec-class": (o().colClass as string) || "#b76cff",
    "--sec-best": (o().colBest as string) || "#33d17a",
    "--sec-slow": (o().colSlow as string) || "#ffcc33",
  });
  return (
    <Show when={visible()}>
      <div class={`sec sec-d-${design()} ov-panel`} classList={{ "sec-hold": m.holding() }} style={style()}>
        <div class="ov-header">
          <span>
            Sektörler
            <Show when={!m.d()!.official}>
              <span class="sec-approx" title={t("Üç eşit mesafe")}>
                {" "}
                ≈
              </span>
            </Show>
          </span>
          <span>
            Tur <b>{Math.max(0, m.d()!.lap)}</b>
          </span>
        </div>
        <div class="sec-body">
          <Switch>
            <Match when={design() === "boxes"}>
              <Boxes m={m} />
            </Match>
            <Match when={design() === "bars"}>
              <Bars m={m} />
            </Match>
            <Match when={design() === "table"}>
              <Table m={m} />
            </Match>
          </Switch>
        </div>
      </div>
    </Show>
  );
}
