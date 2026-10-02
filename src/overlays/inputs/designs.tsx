// Pedallar & Girdi overlay'inin ek tasarımları (özgün çizimler; hiçbir ürünün görseli / adı / logosu kullanılmaz).
//   trace      → Telemetri grafiği + çubuklar
//   bars       → Dikey çubuklar
//   horizontal → Yatay şeritler
//   rings      → Halka göstergeler
//   strip      → Kompakt şerit
//   sim        → Sim tarzı (klasik)
// Hepsi aynı ortak ayarları kullanır (debriyaj, direksiyon, vites/hız, renkler, ABS/TC, iz süresi).
// İz grafiği tuvale (canvas) çizilir; veri gelmedikçe (önizleme dondurulunca) yeni örnek eklenmez, çizim de durur.

import { Match, Show, Switch, createEffect, onCleanup, onMount, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { gear, speed, speedUnit } from "@/sdk/format";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import { FREE_WHEELS, WheelArt, isWheelStyle, wheelForCar, type WheelStyle } from "./wheels";
import "./designs.css";

export const DESIGNS = ["trace", "bars", "horizontal", "rings", "strip", "sim"] as const;
export type Design = (typeof DESIGNS)[number];
export const isDesign = (v: unknown): v is Design => DESIGNS.includes(v as Design);

const ABS_DEF = "#ffd400";
const TC_DEF = "#00c8ff";
const CLUTCH = "#4aa8ff";
const STEER = "rgba(255,255,255,0.75)";
/** Direksiyon çizgisi / işaretçisi için tam ölçek (±180°) */
const STEER_FULL = Math.PI;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Tüm tasarımların paylaştığı durum: veri, renkler, ABS/TC, direksiyon ve iz tamponu */
function createModel(props: OverlayProps) {
  const data = useTopic("inputs");
  const status = useTopic("status");
  const o = props.options;

  const absMode = () => (o.absMode as string) ?? "both";
  const tcMode = () => (o.tcMode as string) ?? "both";
  const absBar = () => absMode() === "bar" || absMode() === "both";
  const tcBar = () => tcMode() === "bar" || tcMode() === "both";
  const absOn = () => !!data()?.abs && (data()?.brake ?? 0) > 0.01;
  const tcOn = () => !!data()?.tc && (data()?.throttle ?? 0) > 0.01;
  const absColor = () => (o.absColor as string) || ABS_DEF;
  const tcColor = () => (o.tcColor as string) || TC_DEF;

  // Halka tampon: bellek ayırmadan son N saniyelik örnekler
  let cap = 0;
  let thr = new Float32Array(0);
  let brk = new Float32Array(0);
  let clu = new Float32Array(0);
  let str = new Float32Array(0);
  let absB = new Uint8Array(0);
  let tcB = new Uint8Array(0);
  let head = 0;
  let count = 0;
  let pending = false;
  let dead = false;
  let painter: (() => void) | undefined;

  const ensure = () => {
    const n = Math.max(60, Math.round(((o.seconds as number) || 6) * 60));
    if (n !== cap) {
      cap = n;
      thr = new Float32Array(n);
      brk = new Float32Array(n);
      clu = new Float32Array(n);
      str = new Float32Array(n);
      absB = new Uint8Array(n);
      tcB = new Uint8Array(n);
      head = 0;
      count = 0;
    }
  };

  createEffect(() => {
    const d = data();
    if (!d) return;
    ensure();
    thr[head] = d.throttle;
    brk[head] = d.brake;
    clu[head] = d.clutch;
    // sola kırınca yukarı; orta = 0.5
    str[head] = clamp(0.5 + (d.steer / STEER_FULL) * 0.5, 0, 1);
    absB[head] = d.abs && d.brake > 0.01 ? 1 : 0;
    tcB[head] = d.tc && d.throttle > 0.01 ? 1 : 0;
    head = (head + 1) % cap;
    count = Math.min(count + 1, cap);
    if (painter && !pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!dead) painter?.();
      });
    }
  });
  onCleanup(() => (dead = true));

  /** İz grafiğini verilen tuvale çizer (w×h mantıksal piksel, 2× çözünürlük) */
  const paint = (canvas: HTMLCanvasElement | undefined, w: number, h: number, grid: "lines" | "sim") => {
    const ctx = canvas?.getContext("2d");
    if (!ctx || count === 0) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid === "sim" ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)";
    ctx.beginPath();
    for (const y of [0.25, 0.5, 0.75]) {
      ctx.moveTo(0, Math.round(h * y) + 0.5);
      ctx.lineTo(w, Math.round(h * y) + 0.5);
    }
    if (grid === "sim") {
      // saniye çizgileri
      const secs = cap / 60;
      for (let s = 1; s < secs; s++) {
        const x = Math.round(w - (s / secs) * w) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
    }
    ctx.stroke();

    const smooth = !!o.smooth;
    const start = (head - count + cap) % cap;
    const X = (i: number) => w - ((count - 1 - i) / (cap - 1)) * w;
    const line = (buf: Float32Array, color: string, width: number, flags?: Uint8Array, hiColor?: string) => {
      const at = (i: number) => buf[(start + clamp(i, 0, count - 1)) % cap];
      const Y = smooth
        ? (i: number) => h - 2 - ((at(i - 2) + 2 * at(i - 1) + 3 * at(i) + 2 * at(i + 1) + at(i + 2)) / 9) * (h - 4)
        : (i: number) => h - 2 - at(i) * (h - 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      if (!smooth) {
        for (let i = 0; i < count; i++) (i === 0 ? ctx.moveTo(X(i), Y(i)) : ctx.lineTo(X(i), Y(i)));
      } else {
        const step = 2;
        ctx.moveTo(X(0), Y(0));
        for (let i = step; i < count - step; i += step) {
          ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + step)) / 2, (Y(i) + Y(i + step)) / 2);
        }
        ctx.lineTo(X(count - 1), Y(count - 1));
      }
      ctx.stroke();
      if (flags && hiColor) {
        // ABS/TC çalıştığı kısımları üstüne vurgu rengiyle çiz
        const fl = (i: number) => flags[(start + i) % cap] === 1;
        ctx.strokeStyle = hiColor;
        ctx.lineWidth = width + 0.8;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (!fl(i)) continue;
          if (i === 0 || !fl(i - 1)) ctx.moveTo(X(Math.max(0, i - 1)), Y(Math.max(0, i - 1)));
          ctx.lineTo(X(i), Y(i));
        }
        ctx.stroke();
      }
    };
    if (o.steerLine && o.showSteer) line(str, STEER, 1.2);
    if (o.showClutch) line(clu, CLUTCH, 1.8);
    line(brk, o.brakeColor, 2, absBar() ? absB : undefined, absColor());
    line(thr, o.throttleColor, 2, tcBar() ? tcB : undefined, tcColor());
  };

  const wheelStyle = (): WheelStyle => {
    const w = o.wheelStyle as string;
    const st = isWheelStyle(w) ? w : wheelForCar(status());
    return FREE_WHEELS.has(st) || !overlayValueLocked("inputs", "wheelStyle", st) ? st : "round";
  };

  return {
    data,
    o,
    units: () => props.units,
    throttle: () => data()?.throttle ?? 0,
    brake: () => data()?.brake ?? 0,
    clutch: () => data()?.clutch ?? 0,
    steer: () => data()?.steer ?? 0,
    /** -1 (tam sol) … +1 (tam sağ) */
    steerNorm: () => clamp(-(data()?.steer ?? 0) / STEER_FULL, -1, 1),
    steerDeg: () => Math.round((-(data()?.steer ?? 0) * 180) / Math.PI),
    brakeFill: () => (absOn() && absBar() ? absColor() : (o.brakeColor as string)),
    thrFill: () => (tcOn() && tcBar() ? tcColor() : (o.throttleColor as string)),
    absFrame: () => absOn() && (absMode() === "frame" || absMode() === "both"),
    tcFrame: () => tcOn() && (tcMode() === "frame" || tcMode() === "both"),
    absColor,
    tcColor,
    shiftOn: () => {
      const d = data();
      return !!d && d.shiftRpm > 0 && d.rpm >= d.shiftRpm;
    },
    gear: () => gear(data()?.gear ?? 0),
    speed: () => speed(data()?.speed ?? 0, props.units),
    unit: () => speedUnit(props.units),
    barW: () => clamp((o.barWidth as number) || 12, 4, 30),
    showPct: () => o.showPct !== false,
    wheelStyle,
    wheelAccent: () => (o.wheelAccentOn ? (o.wheelAccent as string) : "var(--ov-accent)"),
    wheelSize: () => ((o.wheelSize as number) ?? 100) / 100,
    setPainter: (p: () => void) => (painter = p),
    clearPainter: (p: () => void) => {
      if (painter === p) painter = undefined;
    },
    paint,
  };
}
type Model = ReturnType<typeof createModel>;

const n100 = (v: number) => Math.round(v * 100);

function Trace(props: { m: Model; w: number; h: number; grid?: "lines" | "sim"; class?: string }) {
  let canvas: HTMLCanvasElement | undefined;
  const p = () => props.m.paint(canvas, props.w, props.h, props.grid ?? "lines");
  props.m.setPainter(p);
  // Tampon doluyken (ör. önizleme donmuşken tasarım değişirse) ilk kareyi hemen çiz
  onMount(p);
  onCleanup(() => props.m.clearPainter(p));
  return (
    <canvas
      ref={canvas}
      width={props.w * 2}
      height={props.h * 2}
      class={`inx-trace ${props.class ?? ""}`}
      style={{ width: `${props.w}px`, height: `${props.h}px` }}
    />
  );
}

/** Dikey çubuk (üstünde isteğe bağlı sayı) */
function VBar(props: { v: number; color: string; h: number; w: number; glow?: boolean; glowColor?: string; num?: boolean }) {
  return (
    <div class="inx-vcol">
      <Show when={props.num}>
        <span class="inx-num" style={{ "min-width": `${Math.max(props.w, 20)}px` }}>
          {n100(props.v)}
        </span>
      </Show>
      <div
        class="inx-vbar"
        classList={{ glow: !!props.glow }}
        style={{ width: `${props.w}px`, height: `${props.h}px`, "--glow": props.glowColor }}
      >
        <div class="inx-vfill" style={{ transform: `scaleY(${clamp(props.v, 0, 1)})`, background: props.color }} />
      </div>
    </div>
  );
}

function Bars(props: { m: Model; h: number }) {
  const m = props.m;
  return (
    <div class="inx-bars">
      <Show when={m.o.showClutch}>
        <VBar v={m.clutch()} color={CLUTCH} h={props.h} w={m.barW()} num={m.showPct()} />
      </Show>
      <VBar v={m.brake()} color={m.brakeFill()} h={props.h} w={m.barW()} num={m.showPct()} glow={m.absFrame()} glowColor={m.absColor()} />
      <VBar v={m.throttle()} color={m.thrFill()} h={props.h} w={m.barW()} num={m.showPct()} glow={m.tcFrame()} glowColor={m.tcColor()} />
    </div>
  );
}

function Wheel(props: { m: Model; deg?: boolean }) {
  const m = props.m;
  return (
    <div class="inx-wheel">
      <WheelArt style={m.wheelStyle()} angle={-m.steer()} accent={m.wheelAccent()} size={m.wheelSize()} />
      <Show when={props.deg !== false && m.o.showSteerDeg}>
        <small class="inx-deg">{m.steerDeg()}°</small>
      </Show>
    </div>
  );
}

/** Yatay direksiyon göstergesi: ortadan iki yana kayan işaretçi */
function SteerBar(props: { m: Model; class?: string }) {
  return (
    <div class={`inx-steerbar ${props.class ?? ""}`}>
      <i class="inx-steermid" />
      <i class="inx-steerdot" style={{ left: `${50 + props.m.steerNorm() * 50}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Telemetri grafiği + çubuklar
// ---------------------------------------------------------------------------------------------------------
function TraceDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-tr" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showTrace}>
        <Trace m={m} w={300} h={84} />
      </Show>
      <Bars m={m} h={m.showPct() ? 68 : 84} />
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-side">
          <Show when={m.o.showGear}>
            <b class="inx-gear">{m.gear()}</b>
            <span class="inx-speed">
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </Show>
          <Show when={m.o.showSteer}>
            <Wheel m={m} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Dikey çubuklar
// ---------------------------------------------------------------------------------------------------------
function BarsDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-vb" classList={{ shift: m.shiftOn() }}>
      <Bars m={m} h={m.showPct() ? 92 : 108} />
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-side">
          <Show when={m.o.showGear}>
            <b class="inx-gearbox">{m.gear()}</b>
            <span class="inx-speed">{m.speed()}</span>
            <small class="inx-unit">{m.unit()}</small>
          </Show>
          <Show when={m.o.showSteer}>
            <Wheel m={m} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Yatay şeritler
// ---------------------------------------------------------------------------------------------------------
function HRow(props: { label: string; v: number; color: string; h: number; glow?: boolean; glowColor?: string; num: boolean }) {
  return (
    <div class="inx-hrow">
      <span class="inx-hlabel">{props.label}</span>
      <div class="inx-hbar" classList={{ glow: !!props.glow }} style={{ height: `${props.h}px`, "--glow": props.glowColor }}>
        <div class="inx-hfill" style={{ transform: `scaleX(${clamp(props.v, 0, 1)})`, background: props.color }} />
      </div>
      <Show when={props.num}>
        <span class="inx-hnum">{n100(props.v)}</span>
      </Show>
    </div>
  );
}

function HorizontalDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-hz" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showGear}>
        <div class="inx-hzgear">
          <b class="inx-gear">{m.gear()}</b>
          <span class="inx-speed">{m.speed()}</span>
          <small class="inx-unit">{m.unit()}</small>
        </div>
      </Show>
      <div class="inx-hrows">
        <HRow label={t("Gaz")} v={m.throttle()} color={m.thrFill()} h={m.barW()} num={m.showPct()} glow={m.tcFrame()} glowColor={m.tcColor()} />
        <HRow label={t("Fren")} v={m.brake()} color={m.brakeFill()} h={m.barW()} num={m.showPct()} glow={m.absFrame()} glowColor={m.absColor()} />
        <Show when={m.o.showClutch}>
          <HRow label={t("Debriyaj")} v={m.clutch()} color={CLUTCH} h={m.barW()} num={m.showPct()} />
        </Show>
        <Show when={m.o.showSteer}>
          <div class="inx-hrow">
            <span class="inx-hlabel">{t("Direksiyon")}</span>
            <SteerBar m={m} />
            <Show when={m.showPct()}>
              <span class="inx-hnum">{m.steerDeg()}°</span>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Halka göstergeler
// ---------------------------------------------------------------------------------------------------------
const R = 40;
const pt = (deg: number, r = R) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
};
// Açı: +x ekseninden saat yönünde (SVG'de y aşağı). Gaz sağda aşağıdan yukarı, fren solda aşağıdan yukarı dolar.
const ARC_THR = `M ${pt(58)} A ${R} ${R} 0 0 0 ${pt(-58)}`;
const ARC_BRK = `M ${pt(122)} A ${R} ${R} 0 0 1 ${pt(238)}`;
const ARC_CLU = `M ${pt(112)} A ${R} ${R} 0 0 0 ${pt(68)}`;
const ARC_STR = `M ${pt(-116)} A ${R} ${R} 0 0 1 ${pt(-64)}`;

function Arc(props: { d: string; v: number; color: string; w: number; glow?: boolean; glowColor?: string }) {
  return (
    <>
      <path d={props.d} class="inx-arcbg" stroke-width={props.w} />
      <path
        d={props.d}
        class="inx-arc"
        classList={{ glow: !!props.glow }}
        pathLength="100"
        stroke={props.color}
        stroke-width={props.w}
        stroke-dasharray={`${clamp(props.v, 0, 1) * 100} 100`}
        style={{ "--glow": props.glowColor } as JSX.CSSProperties}
      />
    </>
  );
}

function RingsDesign(props: { m: Model }) {
  const m = props.m;
  const w = () => clamp(m.barW() * 0.6, 3, 11);
  const mark = () => {
    const a = ((-90 + m.steerNorm() * 24) * Math.PI) / 180;
    return [R * Math.cos(a), R * Math.sin(a)];
  };
  return (
    <div class="ov-panel inx inx-rg" classList={{ shift: m.shiftOn() }}>
      <svg viewBox="-50 -50 100 100" class="inx-rings">
        <Arc d={ARC_BRK} v={m.brake()} color={m.brakeFill()} w={w()} glow={m.absFrame()} glowColor={m.absColor()} />
        <Arc d={ARC_THR} v={m.throttle()} color={m.thrFill()} w={w()} glow={m.tcFrame()} glowColor={m.tcColor()} />
        <Show when={m.o.showClutch}>
          <Arc d={ARC_CLU} v={m.clutch()} color={CLUTCH} w={w() * 0.7} />
        </Show>
        <Show when={m.o.showSteer}>
          <path d={ARC_STR} class="inx-arcbg" stroke-width="2.4" />
          <path d={`M ${pt(-90, R - 4)} L ${pt(-90, R + 4)}`} class="inx-arctick" />
          <circle r="3.6" class="inx-arcmark" cx={mark()[0]} cy={mark()[1]} />
        </Show>
        <Show when={m.o.showGear}>
          <text class="inx-rgear" y="6" text-anchor="middle">
            {m.gear()}
          </text>
          <text class="inx-rspeed" y="21" text-anchor="middle">
            {m.speed()}
          </text>
          <text class="inx-runit" y="29" text-anchor="middle">
            {m.unit()}
          </text>
        </Show>
        <Show when={m.showPct()}>
          <text class="inx-rpct" x="-13" y={m.o.showGear ? -17 : -3} text-anchor="middle" fill={m.o.brakeColor}>
            {n100(m.brake())}
          </text>
          <text class="inx-rpct" x="13" y={m.o.showGear ? -17 : -3} text-anchor="middle" fill={m.o.throttleColor}>
            {n100(m.throttle())}
          </text>
        </Show>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Kompakt şerit
// ---------------------------------------------------------------------------------------------------------
function StripDesign(props: { m: Model }) {
  const m = props.m;
  const cell = (v: number, color: string, glow?: boolean, glowColor?: string) => (
    <div class="inx-scell">
      <div class="inx-hbar" classList={{ glow: !!glow }} style={{ height: `${clamp(m.barW() * 0.6, 4, 14)}px`, "--glow": glowColor }}>
        <div class="inx-hfill" style={{ transform: `scaleX(${clamp(v, 0, 1)})`, background: color }} />
      </div>
      <Show when={m.showPct()}>
        <span class="inx-snum">{n100(v)}</span>
      </Show>
    </div>
  );
  return (
    <div class="ov-panel inx inx-st" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showGear}>
        <b class="inx-gear">{m.gear()}</b>
        <span class="inx-speed">
          {m.speed()} <small>{m.unit()}</small>
        </span>
        <i class="inx-sep" />
      </Show>
      <Show when={m.o.showClutch}>{cell(m.clutch(), CLUTCH)}</Show>
      {cell(m.brake(), m.brakeFill(), m.absFrame(), m.absColor())}
      {cell(m.throttle(), m.thrFill(), m.tcFrame(), m.tcColor())}
      <Show when={m.o.showSteer}>
        <SteerBar m={m} class="inx-ssteer" />
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Sim tarzı (klasik): küçük siyah kutu; iz grafiği, sayılı dikey debriyaj / fren / gaz çubukları,
// dönen direksiyonun ortasında vites, altında hız.
// ---------------------------------------------------------------------------------------------------------
function SimDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-sim" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showTrace}>
        <Trace m={m} w={200} h={72} grid="sim" class="inx-simtrace" />
      </Show>
      <Bars m={m} h={m.showPct() ? 58 : 72} />
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-simdial">
          <div class="inx-simwheel">
            <Show when={m.o.showSteer}>
              <svg viewBox="-30 -30 60 60" class="inx-simrim" style={{ transform: `rotate(${-m.steer()}rad)` }}>
                <circle r="25" class="inx-simring" />
                <path d="M -24 3 L -15 2 M 24 3 L 15 2 M 0 15 L 0 24" class="inx-simspoke" />
                <rect x="-2.6" y="-29" width="5.2" height="8" rx="1" class="inx-simtop" style={{ fill: m.wheelAccent() }} />
              </svg>
            </Show>
            <Show when={m.o.showGear}>
              <b class="inx-simgear">{m.gear()}</b>
            </Show>
          </div>
          <Show when={m.o.showGear}>
            <span class="inx-simspeed">
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </Show>
          <Show when={m.o.showSteer && m.o.showSteerDeg}>
            <small class="inx-deg">{m.steerDeg()}°</small>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function DesignView(props: OverlayProps & { design: Design }) {
  const m = createModel(props);
  return (
    <Switch>
      <Match when={props.design === "trace"}>
        <TraceDesign m={m} />
      </Match>
      <Match when={props.design === "bars"}>
        <BarsDesign m={m} />
      </Match>
      <Match when={props.design === "horizontal"}>
        <HorizontalDesign m={m} />
      </Match>
      <Match when={props.design === "rings"}>
        <RingsDesign m={m} />
      </Match>
      <Match when={props.design === "strip"}>
        <StripDesign m={m} />
      </Match>
      <Match when={props.design === "sim"}>
        <SimDesign m={m} />
      </Match>
    </Switch>
  );
}
