import { Show, createEffect, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { gear, speed, speedUnit } from "@/sdk/format";
import "./style.css";

const W = 240;
const H = 86;

export default function Inputs(props: OverlayProps) {
  const data = useTopic("inputs");
  let canvas: HTMLCanvasElement | undefined;

  // Halka tampon: bellek ayırmadan son N saniyelik örnekler
  let cap = 0;
  let thr = new Float32Array(0);
  let brk = new Float32Array(0);
  let clu = new Float32Array(0);
  let head = 0;
  let count = 0;
  let pending = false;

  const ensure = () => {
    const n = Math.max(60, Math.round((props.options.seconds as number) * 60));
    if (n !== cap) {
      cap = n;
      thr = new Float32Array(n);
      brk = new Float32Array(n);
      clu = new Float32Array(n);
      head = 0;
      count = 0;
    }
  };

  const draw = () => {
    pending = false;
    const ctx = canvas?.getContext("2d");
    if (!ctx || count === 0) return;
    ctx.clearRect(0, 0, W, H);
    // Yatay kılavuz çizgileri
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const y of [0.25, 0.5, 0.75]) {
      ctx.moveTo(0, Math.round(H * y) + 0.5);
      ctx.lineTo(W, Math.round(H * y) + 0.5);
    }
    ctx.stroke();

    const smooth = !!props.options.smooth;
    const line = (buf: Float32Array, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      const start = (head - count + cap) % cap;
      const at = (i: number) => buf[(start + Math.max(0, Math.min(count - 1, i))) % cap];
      const X = (i: number) => W - ((count - 1 - i) / (cap - 1)) * W;
      if (!smooth) {
        for (let i = 0; i < count; i++) {
          const y = H - 2 - at(i) * (H - 4);
          i === 0 ? ctx.moveTo(X(i), y) : ctx.lineTo(X(i), y);
        }
      } else {
        // Yumuşak: önce 5 örneklik ağırlıklı ortalama, sonra noktalar arası ikinci derece eğriler
        const Y = (i: number) => {
          const v = (at(i - 2) + 2 * at(i - 1) + 3 * at(i) + 2 * at(i + 1) + at(i + 2)) / 9;
          return H - 2 - v * (H - 4);
        };
        const step = 2; // her 2 örnekte bir kontrol noktası (daha akıcı ve daha az çizim)
        ctx.moveTo(X(0), Y(0));
        let i = step;
        for (; i < count - step; i += step) {
          const mx = (X(i) + X(i + step)) / 2;
          const my = (Y(i) + Y(i + step)) / 2;
          ctx.quadraticCurveTo(X(i), Y(i), mx, my);
        }
        ctx.lineTo(X(count - 1), Y(count - 1));
      }
      ctx.stroke();
    };
    if (props.options.showClutch) line(clu, "#4aa8ff");
    line(brk, props.options.brakeColor);
    line(thr, props.options.throttleColor);
  };

  createEffect(() => {
    const d = data();
    if (!d) return;
    ensure();
    thr[head] = d.throttle;
    brk[head] = d.brake;
    clu[head] = d.clutch;
    head = (head + 1) % cap;
    count = Math.min(count + 1, cap);
    if (props.options.showTrace && !pending) {
      pending = true;
      requestAnimationFrame(draw);
    }
  });

  onCleanup(() => (pending = true));

  const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;
  const shiftOn = () => {
    const d = data();
    return !!d && d.shiftRpm > 0 && d.rpm >= d.shiftRpm;
  };

  return (
    <div class="ov-panel inp" classList={{ shift: shiftOn() }}>
      <Show when={props.options.showTrace}>
        <canvas ref={canvas} width={W} height={H} class="inp-trace" />
      </Show>
      <div class="inp-bars">
        <Show when={props.options.showClutch}>
          <div class="inp-bar">
            <div class="inp-fill" style={{ height: pct(data()?.clutch), background: "#4aa8ff" }} />
          </div>
        </Show>
        <div class="inp-bar">
          <div
            class="inp-fill"
            classList={{ abs: data()?.abs }}
            style={{ height: pct(data()?.brake), background: props.options.brakeColor }}
          />
        </div>
        <div class="inp-bar">
          <div class="inp-fill" style={{ height: pct(data()?.throttle), background: props.options.throttleColor }} />
        </div>
      </div>
      <Show when={props.options.showGear}>
        <div class="inp-gear">
          <b>{gear(data()?.gear ?? 0)}</b>
          <span>{speed(data()?.speed ?? 0, props.units)}</span>
          <small>{speedUnit(props.units)}</small>
          <Show when={props.options.showSteer}>
            <Wheel angle={-(data()?.steer ?? 0)} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Direksiyon: GT tipi, tutma yerleri, üç kol, üstte merkez işareti. */
function Wheel(props: { angle: number }) {
  return (
    <svg class="inp-wheel" viewBox="-24 -24 48 48" style={{ transform: `rotate(${props.angle}rad)` }}>
      {/* Jant */}
      <path
        class="w-rim"
        d="M -19 -6 C -19 -17 -11 -20 0 -20 C 11 -20 19 -17 19 -6 L 19 6 C 19 15 12 19 7 19 L -7 19 C -12 19 -19 15 -19 6 Z"
      />
      {/* Tutma yerleri */}
      <path class="w-grip" d="M -19 -7 L -19 7" />
      <path class="w-grip" d="M 19 -7 L 19 7" />
      {/* Kollar */}
      <path class="w-spoke" d="M -18 2 L -6 3" />
      <path class="w-spoke" d="M 18 2 L 6 3" />
      <path class="w-spoke" d="M 0 8 L 0 18" />
      {/* Göbek */}
      <rect class="w-hub" x="-7" y="-4" width="14" height="12" rx="3" />
      {/* Merkez işareti */}
      <rect class="w-mark" x="-2" y="-23" width="4" height="7" rx="1" />
    </svg>
  );
}
