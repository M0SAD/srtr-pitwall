// Direksiyon Ekranı: araç tarzı (PRO) görünümler.
// Gerçek yarış araçlarındaki ekranların YERLEŞİMİNDEN esinlenen özgün çizimler; marka logosu / adı yok.

import { For, Match, Show, Switch, type JSX } from "solid-js";
import { lapTime } from "@/sdk/format";
import type { CarFamily } from "@/sdk/cars";
import "./carstyles.css";

export type CarStyle = "carF1" | "carFjr" | "carGtDe" | "carGtIt" | "carGtUk" | "carProto" | "carStock" | "carRally" | "carTouring" | "carRoad";

export const CAR_STYLES: CarStyle[] = [
  "carF1",
  "carFjr",
  "carGtDe",
  "carGtIt",
  "carGtUk",
  "carProto",
  "carStock",
  "carRally",
  "carTouring",
  "carRoad",
];
export const isCarStyle = (v: unknown): v is CarStyle => CAR_STYLES.includes(v as CarStyle);

/** Araç ailesi -> ekran tarzı */
export const STYLE_FOR_FAMILY: Record<CarFamily, CarStyle> = {
  formula: "carF1",
  formulaJr: "carFjr",
  gtDe: "carGtDe",
  gtIt: "carGtIt",
  gtUk: "carGtUk",
  touring: "carTouring",
  proto: "carProto",
  stock: "carStock",
  rally: "carRally",
  road: "carRoad",
  classic: "carRoad",
};

export interface TyreInfo {
  /** Ortalama yüzey sıcaklığı °C (renk için) */
  c?: number;
  /** Seçilen birimde metin */
  t: string;
  /** Basınç metni (yoksa undefined) */
  p?: string;
}

/** Ekranların okuduğu değerler (hepsi reaktif) */
export interface DashCtx {
  gear: () => string;
  speed: () => string;
  speedNum: () => number;
  speedMax: () => number;
  speedUnit: () => string;
  rpm: () => number;
  rpmMax: () => number;
  /** Devir ışıklarının dolma oranı 0..1 */
  frac: () => number;
  shift: () => boolean;
  blink: () => boolean;
  pos: () => number;
  carCount: () => number;
  posChange: () => number;
  delta: () => number | undefined;
  deltaLabel: () => string;
  cur: () => number | undefined;
  last: () => number | undefined;
  best: () => number | undefined;
  lap: () => number;
  totalLaps: () => number;
  remain: () => [string, string];
  fuel: () => string;
  fuelUnit: () => string;
  fuelLaps: () => string;
  fuelPct: () => number | undefined;
  tc: () => number | undefined;
  abs: () => number | undefined;
  absActive: () => boolean;
  bb: () => number | undefined;
  oil: () => string;
  oilC: () => number | undefined;
  water: () => string;
  waterC: () => number | undefined;
  tUnit: () => string;
  trackTemp: () => string;
  airTemp: () => string;
  tyres: () => TyreInfo[] | null;
  pressUnit: () => string;
  incidents: () => number | undefined;
  stint: () => string;
  sector: () => { n: number; t: number };
  onPit: () => boolean;
  lapPct: () => number | undefined;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const G = "#2bdc4f";
const Y = "#ffd014";
const R = "#ff2a1f";
const B = "#2f7dff";
const M = "#c93cff";

type LedMode = "ltr" | "outin" | "centerout";

/** n LED'in renkleri; palet dolma adımlarına eşit dağıtılır. Sönük LED: undefined */
function ledList(c: DashCtx, n: number, mode: LedMode, palette: string[], shiftColor: string, blinkColor = shiftColor) {
  const steps = mode === "ltr" ? n : Math.ceil(n / 2);
  if (c.blink()) return Array<string | undefined>(n).fill(blinkColor);
  if (c.shift() && c.frac() >= 1) return Array<string | undefined>(n).fill(shiftColor);
  const lit = Math.ceil(c.frac() * steps - 1e-6);
  return Array.from({ length: n }, (_, i) => {
    const edge = Math.min(i, n - 1 - i);
    const k = mode === "ltr" ? i : mode === "outin" ? edge : steps - 1 - edge;
    return k < lit ? palette[Math.min(palette.length - 1, Math.floor((k * palette.length) / steps))] : undefined;
  });
}

function Leds(p: { c: DashCtx; n: number; mode: LedMode; palette: string[]; shift: string; blink?: string; class?: string }) {
  return (
    <div class={`cd-leds ${p.class ?? ""}`}>
      <For each={ledList(p.c, p.n, p.mode, p.palette, p.shift, p.blink)}>
        {(col) => <i classList={{ on: !!col }} style={col ? { background: col, "--glow": col } : undefined} />}
      </For>
    </div>
  );
}

const fin = (v: number | undefined): v is number => v != null && isFinite(v) && v >= 0;
const n0 = (v: number | undefined, d = 0) => (fin(v) ? v.toFixed(d) : "—");
const posTxt = (c: DashCtx) => (c.pos() > 0 ? String(c.pos()) : "—");
const lapTxt = (c: DashCtx) => (c.lap() > 0 ? String(c.lap()) : "—");
const hasTotal = (c: DashCtx) => c.totalLaps() > 0 && c.totalLaps() < 32767;

function deltaTxt(v: number | undefined) {
  if (v == null || !isFinite(v)) return "-.--";
  if (Math.abs(v) < 0.005) return "0.00";
  return (v > 0 ? "+" : "-") + Math.min(99.99, Math.abs(v)).toFixed(2);
}
const deltaCls = (v: number | undefined) => (v == null ? "" : v < -0.004 ? "cd-fast" : v > 0.004 ? "cd-slow" : "");

/** Lastik sıcaklığına göre renk (°C) */
export function tyreColor(c: number | undefined) {
  if (c == null || !isFinite(c) || c <= 0) return "#3a3f46";
  if (c < 60) return "#2f7dff";
  if (c < 75) return "#20c4e0";
  if (c < 100) return "#2bdc4f";
  if (c < 110) return "#ffd014";
  return "#ff2a1f";
}

/** Merkezi sıfır olan delta çubuğu: hızlıysa yeşil sola, yavaşsa kırmızı sağa (±range sn) */
function DeltaBar(p: { v: number | undefined; range?: number; class?: string }) {
  const w = () => (p.v == null ? 0 : Math.min(1, Math.abs(p.v) / (p.range ?? 1)) * 50);
  return (
    <div class={`cd-dbar ${p.class ?? ""}`}>
      <i
        class={p.v != null && p.v < 0 ? "cd-dbar-f" : "cd-dbar-s"}
        style={p.v != null && p.v < 0 ? { right: "50%", width: `${w()}%` } : { left: "50%", width: `${w()}%` }}
      />
      <b />
    </div>
  );
}

/** Basit hücre: etiket + değer */
function Cell(p: { l: string; v: JSX.Element; class?: string }) {
  return (
    <div class={`cd-cell ${p.class ?? ""}`}>
      <span class="cd-l">{p.l}</span>
      <b class="cd-v">{p.v}</b>
    </div>
  );
}

/** Lastik sıcaklıkları (2x2) — veri yoksa hiç çizilmez */
function TyreGrid(p: { c: DashCtx; class?: string; press?: boolean }) {
  return (
    <Show when={p.c.tyres()}>
      {(ty) => (
        <div class={`cd-tyres ${p.class ?? ""}`}>
          <For each={ty()}>
            {(t) => (
              <div class="cd-tyre" style={{ "--tc": tyreColor(t.c) }}>
                <b>{t.t}</b>
                <Show when={p.press && t.p}>
                  <small>{t.p}</small>
                </Show>
              </div>
            )}
          </For>
        </div>
      )}
    </Show>
  );
}

/** Analog gösterge (SVG). Açı aralığı 270°. */
function Gauge(p: {
  v: number;
  max: number;
  min?: number;
  major: number;
  minor?: number;
  /** Sayı yazılacak her N. ana çizgi */
  labelEvery?: number;
  /** Sayıları bu değere böl (ör. 1000 -> devir x1000) */
  div?: number;
  red?: number;
  numbers?: boolean;
  class?: string;
  children?: JSX.Element;
}) {
  const min = () => p.min ?? 0;
  const ang = (v: number) => 135 + (270 * (Math.max(min(), Math.min(p.max, v)) - min())) / Math.max(1e-6, p.max - min());
  const pt = (a: number, r: number) => {
    const rad = (a * Math.PI) / 180;
    return [Math.cos(rad) * r, Math.sin(rad) * r] as const;
  };
  const ticks = () => {
    const out: { a: number; major: boolean; v: number; i: number }[] = [];
    const step = p.minor ?? p.major;
    let i = 0;
    for (let v = min(); v <= p.max + 1e-6; v += step) {
      const major = Math.abs((v - min()) / p.major - Math.round((v - min()) / p.major)) < 1e-6;
      out.push({ a: ang(v), major, v, i: major ? i++ : -1 });
    }
    return out;
  };
  const redArc = () => {
    if (p.red == null || p.red >= p.max) return "";
    const [x1, y1] = pt(ang(p.red), 44);
    const [x2, y2] = pt(ang(p.max), 44);
    const large = ang(p.max) - ang(p.red) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A 44 44 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <svg class={`cd-gauge ${p.class ?? ""}`} viewBox="-50 -50 100 100">
      <circle class="g-face" r="48" />
      <Show when={redArc()}>
        <path class="g-red" d={redArc()} />
      </Show>
      <For each={ticks()}>
        {(t) => {
          const [x1, y1] = pt(t.a, t.major ? 37 : 41);
          const [x2, y2] = pt(t.a, 45);
          const [lx, ly] = pt(t.a, 29);
          return (
            <>
              <line class={t.major ? "g-maj" : "g-min"} x1={x1} y1={y1} x2={x2} y2={y2} />
              <Show when={p.numbers !== false && t.major && t.i % (p.labelEvery ?? 1) === 0}>
                <text class="g-num" x={lx} y={ly + 3}>
                  {Math.round(t.v / (p.div ?? 1))}
                </text>
              </Show>
            </>
          );
        }}
      </For>
      {p.children}
      <g style={{ transform: `rotate(${ang(p.v)}deg)` }} class="g-needle">
        <path d="M -7 -1.6 L 40 -0.5 L 40 0.5 L -7 1.6 Z" />
      </g>
      <circle class="g-hub" r="4.5" />
    </svg>
  );
}

const niceMax = (v: number, step: number) => Math.max(step, Math.ceil(v / step) * step);

// ---------------------------------------------------------------------------
// Ekranlar
// ---------------------------------------------------------------------------

/** Formula (F1 tarzı): 15 LED yeşil-kırmızı-mavi, renkli etiketli kutular, ortada büyük vites */
function F1(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <div class="cd-f1-top">
        <i class="cd-f1-flag" classList={{ on: c.onPit() }} />
        <Leds c={c} n={15} mode="ltr" palette={[G, R, B]} shift={M} blink={B} class="cd-round" />
        <i class="cd-f1-flag" classList={{ on: c.onPit() }} />
      </div>
      <div class="cd-screen">
        <div class="cd-f1-col">
          <Cell l="LAP" v={<>{lapTxt(c)}<Show when={hasTotal(c)}><small>/{c.totalLaps()}</small></Show></>} class="k-cyan" />
          <Cell l="POS" v={<>P{posTxt(c)}</>} class="k-yellow" />
          <div class={`cd-f1-delta ${deltaCls(c.delta())}`}>
            <span class="cd-l">{c.deltaLabel()}</span>
            <b class="cd-v">{deltaTxt(c.delta())}</b>
          </div>
        </div>
        <div class="cd-f1-mid">
          <div class="cd-gear">{c.gear()}</div>
          <div class="cd-f1-speed">
            {c.speed()}
            <small>{c.speedUnit()}</small>
          </div>
        </div>
        <div class="cd-f1-col">
          <Cell l="BBAL" v={n0(c.bb(), 1)} class="k-magenta" />
          <Cell l="TC" v={n0(c.tc())} class="k-green" />
          <Cell l="FUEL" v={c.fuelLaps()} class="k-orange" />
        </div>
      </div>
      <div class="cd-f1-bot">
        <TyreGrid c={c} class="cd-f1-tyres" />
        <Cell l="LAST" v={lapTime(c.last())} />
        <Cell l="BEST" v={lapTime(c.best())} class="cd-purple" />
        <Cell l="ABS" v={n0(c.abs())} />
      </div>
    </>
  );
}

/** Formula alt sınıfları: gri çerçeveli basit veri kaydedici ekranı, kademeli devir çubuğu */
function Fjr(p: { c: DashCtx }) {
  const c = p.c;
  const segs = 36;
  const litSeg = () => Math.round((Math.min(c.rpm(), c.rpmMax()) / Math.max(1, c.rpmMax())) * segs);
  const scale = () => Math.max(1, Math.ceil(c.rpmMax() / 1000));
  return (
    <>
      <Leds c={c} n={10} mode="ltr" palette={[G, G, Y, R]} shift={R} blink={B} class="cd-sq" />
      <div class="cd-screen">
        <div class="cd-fjr-bar">
          <For each={Array.from({ length: segs })}>
            {(_, i) => (
              <i
                classList={{ on: i() < litSeg() }}
                style={{ height: `${35 + (i() / segs) * 65}%`, "--sc": i() >= segs * 0.85 ? R : i() >= segs * 0.7 ? Y : "#e8eef2" }}
              />
            )}
          </For>
        </div>
        <div class="cd-fjr-scale">
          <For each={Array.from({ length: scale() + 1 })}>{(_, i) => <span>{i()}</span>}</For>
        </div>
        <div class="cd-fjr-main">
          <div class="cd-fjr-side">
            <b class="cd-v cd-big">{c.speed()}</b>
            <span class="cd-l">{c.speedUnit()}</span>
          </div>
          <div class="cd-gear">{c.gear()}</div>
          <div class="cd-fjr-side r">
            <b class={`cd-v cd-big ${deltaCls(c.delta())}`}>{deltaTxt(c.delta())}</b>
            <span class="cd-l">{c.deltaLabel()}</span>
          </div>
        </div>
        <div class="cd-row">
          <Cell l="LAP" v={lapTime(c.cur(), 1)} />
          <Cell l="LAST" v={lapTime(c.last())} />
          <Cell l="BEST" v={lapTime(c.best())} />
          <Cell l={`H2O ${c.tUnit()}`} v={c.water()} />
        </div>
      </div>
    </>
  );
}

/** GT – Alman tarzı: dıştan içe dolan ışık şeridi, ince çizgili kutu ızgarası */
function GtDe(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <Leds c={c} n={12} mode="outin" palette={[G, Y, R]} shift={B} blink={B} class="cd-rect" />
      <div class="cd-screen">
        <div class="cd-de-grid">
          <Cell l="TC" v={n0(c.tc())} class="a1" />
          <Cell l="ABS" v={n0(c.abs())} class={`a2 ${c.absActive() ? "cd-warn" : ""}`} />
          <Cell l="BB %" v={n0(c.bb(), 1)} class="a3" />
          <div class="cd-de-gear">
            <div class="cd-gear">{c.gear()}</div>
            <span class="cd-de-speed">
              {c.speed()} <small>{c.speedUnit()}</small>
            </span>
          </div>
          <Cell l={c.deltaLabel()} v={deltaTxt(c.delta())} class={`c1 cd-de-delta ${deltaCls(c.delta())}`} />
          <Cell l="LAST" v={lapTime(c.last())} class="c2" />
          <Cell l={`FUEL ${c.fuelUnit()}`} v={c.fuel()} class="c3" />
        </div>
        <div class="cd-de-bot">
          <span>
            <em>LAP</em> {lapTxt(c)}
            <Show when={hasTotal(c)}>/{c.totalLaps()}</Show>
          </span>
          <span>
            <em>POS</em> {posTxt(c)}
          </span>
          <span>
            <em>BEST</em> {lapTime(c.best())}
          </span>
          <TyreGrid c={c} class="cd-inline" />
        </div>
      </div>
    </>
  );
}

/** GT – İtalyan tarzı: renkli ışıklar, devir süpürme çubuğu, kırmızı halkalı vites */
function GtIt(p: { c: DashCtx }) {
  const c = p.c;
  const sweep = () => Math.min(1, c.rpm() / Math.max(1, c.rpmMax()));
  return (
    <>
      <div class="cd-it-head">
        <Leds c={c} n={10} mode="ltr" palette={[G, G, G, R, R, R, R, B, B, B]} shift={B} blink={R} class="cd-pill" />
      </div>
      <div class="cd-screen">
        <div class="cd-it-sweep">
          <i style={{ width: `${sweep() * 100}%` }} />
          <span>{Math.round(c.rpm())}</span>
        </div>
        <div class="cd-it-main">
          <div class="cd-it-side">
            <Cell l={c.speedUnit()} v={c.speed()} class="cd-big" />
            <Cell l="POS" v={<>P{posTxt(c)}<Show when={c.carCount() > 0}><small>/{c.carCount()}</small></Show></>} />
          </div>
          <div class="cd-it-ring">
            <div class="cd-gear">{c.gear()}</div>
          </div>
          <div class="cd-it-side r">
            <Cell l={c.deltaLabel()} v={deltaTxt(c.delta())} class={`cd-big ${deltaCls(c.delta())}`} />
            <Cell l="LAP" v={<>{lapTxt(c)}<Show when={hasTotal(c)}><small>/{c.totalLaps()}</small></Show></>} />
          </div>
        </div>
        <div class="cd-it-tiles">
          <Cell l="TC" v={n0(c.tc())} />
          <Cell l="ABS" v={n0(c.abs())} />
          <Cell l="BB" v={n0(c.bb(), 1)} />
          <Cell l={`FUEL ${c.fuelUnit()}`} v={c.fuel()} />
          <Cell l="LAST" v={lapTime(c.last())} class="w2" />
        </div>
      </div>
    </>
  );
}

/** GT – İngiliz/Japon tarzı: ortadan dışa dolan ışıklar, sade ekran, üstte delta çubuğu */
function GtUk(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <Leds c={c} n={11} mode="centerout" palette={[G, Y, R]} shift={M} blink={B} class="cd-dot" />
      <div class="cd-screen">
        <div class="cd-uk-delta">
          <DeltaBar v={c.delta()} />
          <b class={deltaCls(c.delta())}>{deltaTxt(c.delta())}</b>
        </div>
        <div class="cd-uk-main">
          <div class="cd-uk-side">
            <Cell l="LAST" v={lapTime(c.last())} />
            <Cell l="BEST" v={lapTime(c.best())} />
          </div>
          <div class="cd-uk-gear">
            <div class="cd-gear">{c.gear()}</div>
            <span>
              {c.speed()} <small>{c.speedUnit()}</small>
            </span>
          </div>
          <div class="cd-uk-side r">
            <Cell l="POSITION" v={<>{posTxt(c)}<Show when={c.carCount() > 0}><small>/{c.carCount()}</small></Show></>} />
            <Cell l="LAP" v={<>{lapTxt(c)}<Show when={hasTotal(c)}><small>/{c.totalLaps()}</small></Show></>} />
          </div>
        </div>
        <div class="cd-uk-bot">
          <span>
            TC <b>{n0(c.tc())}</b>
          </span>
          <span>
            ABS <b>{n0(c.abs())}</b>
          </span>
          <span>
            BB <b>{n0(c.bb(), 1)}</b>
          </span>
          <span>
            FUEL <b>{c.fuel()}</b> {c.fuelUnit()} · <b>{c.fuelLaps()}</b> L
          </span>
        </div>
        <Show when={fin(c.lapPct())}>
          <div class="cd-uk-prog">
            <i style={{ width: `${(c.lapPct() ?? 0) * 100}%` }} />
          </div>
        </Show>
      </div>
    </>
  );
}

/** Prototip / Hypercar: segmentli ışıklar, dikey yakıt çubuğu, altıgen vites, lastik ızgarası */
function Proto(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <Leds c={c} n={20} mode="ltr" palette={[G, G, Y, R]} shift={B} blink={B} class="cd-seg" />
      <div class="cd-screen">
        <div class="cd-pr-main">
          <div class="cd-pr-fuel">
            <div class="cd-pr-tank">
              <i style={{ height: `${Math.max(0, Math.min(1, c.fuelPct() ?? 0)) * 100}%` }} />
            </div>
            <span class="cd-l">FUEL</span>
            <b>{c.fuel()}</b>
          </div>
          <div class="cd-pr-center">
            <div class="cd-pr-top">
              <span>
                <em>P</em>
                {posTxt(c)}
              </span>
              <span>
                <em>LAP</em>
                {lapTxt(c)}
              </span>
            </div>
            <div class="cd-pr-hex">
              <div class="cd-gear">{c.gear()}</div>
            </div>
            <div class="cd-pr-speed">
              {c.speed()} <small>{c.speedUnit()}</small>
            </div>
            <div class="cd-pr-delta">
              <DeltaBar v={c.delta()} />
              <b class={deltaCls(c.delta())}>{deltaTxt(c.delta())}</b>
            </div>
          </div>
          <div class="cd-pr-right">
            <TyreGrid c={c} press />
            <div class="cd-pr-sys">
              <Cell l="TC" v={n0(c.tc())} />
              <Cell l="ABS" v={n0(c.abs())} />
              <Cell l="BB" v={n0(c.bb(), 1)} />
            </div>
          </div>
        </div>
        <div class="cd-row cd-pr-row">
          <Cell l="LAST" v={lapTime(c.last())} />
          <Cell l="BEST" v={lapTime(c.best())} />
          <Cell l="STINT" v={c.stint()} />
          <Cell l="FUEL LAPS" v={c.fuelLaps()} />
          <Cell l={c.remain()[1] === "Time Left" ? "TIME LEFT" : "LAPS LEFT"} v={c.remain()[0]} />
        </div>
      </div>
    </>
  );
}

/** Stock car: büyük analog devir saati, küçük yağ/su/yakıt göstergeleri, iri vites ışıkları */
function Stock(p: { c: DashCtx }) {
  const c = p.c;
  const tachMax = () => niceMax(c.rpmMax() * 1.02, 1000);
  const shiftOn = (i: number) => c.blink() || c.shift() || c.frac() >= (i + 1) / 3;
  return (
    <>
      <div class="cd-st-panel">
        <div class="cd-st-left">
          <Gauge v={c.oilC() ?? 0} min={40} max={160} major={40} minor={20} numbers={false} red={130} class="cd-mini">
            <text class="g-cap" y="16">OIL</text>
            <text class="g-val" y="30">{c.oil()}</text>
          </Gauge>
          <Gauge v={c.waterC() ?? 0} min={40} max={140} major={25} numbers={false} red={115} class="cd-mini">
            <text class="g-cap" y="16">WATER</text>
            <text class="g-val" y="30">{c.water()}</text>
          </Gauge>
        </div>
        <div class="cd-st-tach">
          <div class="cd-st-lights">
            <For each={[0, 1, 2]}>
              {(i) => <i classList={{ on: shiftOn(i), last: i === 2 }} />}
            </For>
          </div>
          <Gauge v={c.rpm()} max={tachMax()} major={1000} minor={500} div={1000} red={c.rpmMax() * 0.96}>
            <text class="g-cap" y="14">RPM x1000</text>
            <text class="g-val big" y="36">{c.gear()}</text>
          </Gauge>
        </div>
        <div class="cd-st-right">
          <Gauge v={(c.fuelPct() ?? 0) * 100} max={100} major={25} numbers={false} class="cd-mini cd-fuelg">
            <text class="g-cap" y="16">FUEL</text>
            <text class="g-val" y="30">{c.fuel()}</text>
          </Gauge>
          <div class="cd-st-digi">
            <Cell l="POS" v={posTxt(c)} />
            <Cell l="LAP" v={lapTxt(c)} />
            <Cell l={c.speedUnit()} v={c.speed()} />
          </div>
        </div>
      </div>
      <div class="cd-st-strip">
        <span>
          LAST <b>{lapTime(c.last())}</b>
        </span>
        <span>
          {c.deltaLabel()} <b class={deltaCls(c.delta())}>{deltaTxt(c.delta())}</b>
        </span>
        <span>
          {c.remain()[1] === "Time Left" ? "TIME" : "TO GO"} <b>{c.remain()[0]}</b>
        </span>
      </div>
    </>
  );
}

/** Ralli: kehribar LCD, kademeli devir grafiği, iri vites, etap süresi */
function Rally(p: { c: DashCtx }) {
  const c = p.c;
  const bars = 24;
  const lit = () => Math.round((Math.min(c.rpm(), c.rpmMax()) / Math.max(1, c.rpmMax())) * bars);
  return (
    <div class="cd-screen">
      <div class="cd-ra-top">
        <div class="cd-ra-graph">
          <For each={Array.from({ length: bars })}>
            {(_, i) => <i classList={{ on: i() < lit(), hot: i() >= bars - 5 }} style={{ height: `${18 + Math.pow(i() / (bars - 1), 1.6) * 82}%` }} />}
          </For>
        </div>
        <Leds c={c} n={6} mode="ltr" palette={[R]} shift={R} blink={R} class="cd-ra-leds" />
      </div>
      <div class="cd-ra-main">
        <div class="cd-ra-left">
          <div class="cd-ra-speed">
            {c.speed()}
            <small>{c.speedUnit()}</small>
          </div>
          <div class="cd-ra-time">
            <span class="cd-l">STAGE</span>
            <b>{lapTime(c.cur(), 1)}</b>
          </div>
          <div class="cd-ra-time">
            <span class="cd-l">{c.deltaLabel()}</span>
            <b>{deltaTxt(c.delta())}</b>
          </div>
        </div>
        <div class="cd-ra-gear">
          <div class="cd-gear">{c.gear()}</div>
        </div>
      </div>
      <div class="cd-row cd-ra-row">
        <Cell l={`OIL${c.tUnit()}`} v={c.oil()} />
        <Cell l={`H2O${c.tUnit()}`} v={c.water()} />
        <Cell l="TC" v={n0(c.tc())} />
        <Cell l="ABS" v={n0(c.abs())} />
        <Cell l={`FUEL`} v={c.fuel()} />
      </div>
    </div>
  );
}

/** Touring car (TCR): aydınlık ekran, kare ışıklar, iki sıra kutu */
function Touring(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <Leds c={c} n={8} mode="ltr" palette={[G, G, G, Y, Y, Y, R, R]} shift={R} blink={B} class="cd-sq" />
      <div class="cd-screen">
        <div class="cd-tc-main">
          <Cell l={`SPEED ${c.speedUnit()}`} v={c.speed()} class="cd-big" />
          <div class="cd-tc-gear">
            <div class="cd-gear">{c.gear()}</div>
          </div>
          <Cell l={c.deltaLabel()} v={deltaTxt(c.delta())} class={`cd-big ${deltaCls(c.delta())}`} />
        </div>
        <div class="cd-tc-grid">
          <Cell l="LAP" v={<>{lapTxt(c)}<Show when={hasTotal(c)}><small>/{c.totalLaps()}</small></Show></>} />
          <Cell l="POS" v={posTxt(c)} />
          <Cell l="LAST" v={lapTime(c.last())} class="w2" />
          <Cell l="BEST" v={lapTime(c.best())} class="w2" />
          <Cell l={`FUEL ${c.fuelUnit()}`} v={c.fuel()} />
          <Cell l="ABS" v={n0(c.abs())} />
          <Cell l="BB" v={n0(c.bb(), 1)} />
          <Cell l={`OIL ${c.tUnit()}`} v={c.oil()} />
          <Cell l="TC" v={n0(c.tc())} />
          <Cell l={`H2O ${c.tUnit()}`} v={c.water()} />
        </div>
      </div>
    </>
  );
}

/** Yol arabası: iki analog gösterge (devir / hız) ve ortada küçük bilgi ekranı */
function Road(p: { c: DashCtx }) {
  const c = p.c;
  const tachMax = () => niceMax(c.rpmMax() * 1.05, 1000);
  const fuelPct = () => Math.max(0, Math.min(1, c.fuelPct() ?? 0));
  return (
    <div class="cd-rd-panel">
      <Gauge v={c.rpm()} max={tachMax()} major={1000} minor={500} div={1000} red={c.rpmMax() * 0.94}>
        <text class="g-cap" y="15">x1000 r/min</text>
      </Gauge>
      <div class="cd-rd-mid">
        <div class="cd-rd-shift" classList={{ on: c.shift() || c.blink() }}>
          SHIFT
        </div>
        <div class="cd-gear">{c.gear()}</div>
        <div class="cd-rd-info">
          <span>{lapTime(c.cur(), 1)}</span>
          <span class={deltaCls(c.delta())}>{deltaTxt(c.delta())}</span>
          <span>
            P{posTxt(c)} · L{lapTxt(c)}
          </span>
        </div>
        <div class="cd-rd-fuel">
          <em>E</em>
          <div>
            <i style={{ width: `${fuelPct() * 100}%` }} classList={{ low: fuelPct() < 0.15 }} />
          </div>
          <em>F</em>
        </div>
        <span class="cd-rd-temp">
          {c.airTemp()}
          {c.tUnit()}
        </span>
      </div>
      <Gauge v={c.speedNum()} max={c.speedMax()} major={20} minor={10} labelEvery={c.speedMax() > 240 ? 3 : 2}>
        <text class="g-cap" y="15">{c.speedUnit()}</text>
        <text class="g-val" y="36">{c.speed()}</text>
      </Gauge>
    </div>
  );
}

export function CarDash(p: { style: CarStyle; c: DashCtx; flash: boolean; opacity: number }) {
  return (
    <div class={`cd cd-${p.style}`} classList={{ "cd-flash": p.flash }} style={{ "--cd-a": String(p.opacity) }} data-no-i18n>
      <Switch>
        <Match when={p.style === "carF1"}>
          <F1 c={p.c} />
        </Match>
        <Match when={p.style === "carFjr"}>
          <Fjr c={p.c} />
        </Match>
        <Match when={p.style === "carGtDe"}>
          <GtDe c={p.c} />
        </Match>
        <Match when={p.style === "carGtIt"}>
          <GtIt c={p.c} />
        </Match>
        <Match when={p.style === "carGtUk"}>
          <GtUk c={p.c} />
        </Match>
        <Match when={p.style === "carProto"}>
          <Proto c={p.c} />
        </Match>
        <Match when={p.style === "carStock"}>
          <Stock c={p.c} />
        </Match>
        <Match when={p.style === "carRally"}>
          <Rally c={p.c} />
        </Match>
        <Match when={p.style === "carTouring"}>
          <Touring c={p.c} />
        </Match>
        <Match when={p.style === "carRoad"}>
          <Road c={p.c} />
        </Match>
      </Switch>
    </div>
  );
}
