// Pedallar & Girdi (inputs) ile Pedal Seti (pedals) overlay'lerinin ortak parçaları: veri modeli (renkler, ABS / TC,
// direksiyon, iz tamponu), iz grafiği tuvali, dikey çubuklar, direksiyon çizimi, yatay direksiyon göstergesi ve
// tur süresi satırları. Ortak stiller: designs.css (.inx-*) ve style.css (.inp-stack, .inp-laps, .inp-wheel).
// İz grafiği tuvale (canvas) çizilir; veri gelmedikçe (önizleme dondurulunca) yeni örnek eklenmez, çizim de durur.

import { Show, createEffect, onCleanup, onMount } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { gear, lapTime, speed, speedUnit } from "@/sdk/format";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { FREE_WHEELS, WheelArt, resolveWheel, type WheelStyle } from "./wheels";
import "./style.css";
import "./designs.css";

const ABS_DEF = "#ffd400";
const TC_DEF = "#00c8ff";
export const CLUTCH = "#4aa8ff";
const STEER = "rgba(255,255,255,0.75)";
/** Direksiyon çizgisi / işaretçisi için tam ölçek (±180°) */
const STEER_FULL = Math.PI;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Tüm tasarımların paylaştığı durum: veri, renkler, ABS/TC, direksiyon ve iz tamponu */
export function createModel(props: OverlayProps, overlayId = "inputs") {
  const data = useTopic("inputs");
  const status = useTopic("status");
  // Seçenekler her ayar değişikliğinde yeni bir nesne olarak gelir: ilk nesneyi saklamak yerine her okumada
  // güncel props.options'a bakılır (yoksa "direksiyon / vites ve hız göster" gibi anahtarlar kapatılınca etkisiz kalır)
  const o = new Proxy({} as OverlayProps["options"], {
    get: (_, k) => (props.options as Record<string | symbol, unknown>)[k],
    has: (_, k) => k in (props.options as object),
    ownKeys: () => Reflect.ownKeys(props.options as object),
    getOwnPropertyDescriptor: (_, k) => Reflect.getOwnPropertyDescriptor(props.options as object, k),
  });

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
    const st = resolveWheel(w, status());
    return FREE_WHEELS.has(st) || !overlayValueLocked(overlayId, "wheelStyle", st) ? st : "round";
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
export type Model = ReturnType<typeof createModel>;

export const n100 = (v: number) => Math.round(v * 100);

export function Trace(props: { m: Model; w: number; h: number; grid?: "lines" | "sim"; class?: string }) {
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
export function VBar(props: { v: number; color: string; h: number; w: number; glow?: boolean; glowColor?: string; num?: boolean }) {
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

export function Bars(props: { m: Model; h: number }) {
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

export function Wheel(props: { m: Model; deg?: boolean }) {
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
export function SteerBar(props: { m: Model; class?: string }) {
  return (
    <div class={`inx-steerbar ${props.class ?? ""}`}>
      <i class="inx-steermid" />
      <i class="inx-steerdot" style={{ left: `${50 + props.m.steerNorm() * 50}%` }} />
    </div>
  );
}

/** Göstergenin altındaki isteğe bağlı tur süresi satırları (son tur / en iyi tur) */
export function LapLines(props: OverlayProps) {
  const data = useTopic("inputs");
  return (
    <Show when={props.options.showLastLap || props.options.showBestLap}>
      <div class="ov-panel inp-laps">
        <Show when={props.options.showLastLap}>
          <div class="inp-lap">
            <label>Son tur</label>
            <b>{lapTime(data()?.lastLap)}</b>
          </div>
        </Show>
        <Show when={props.options.showBestLap}>
          <div class="inp-lap best">
            <label>En iyi tur</label>
            <b>{lapTime(data()?.bestLap)}</b>
          </div>
        </Show>
      </div>
    </Show>
  );
}
