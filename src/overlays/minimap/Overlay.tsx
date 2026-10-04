import { Show, createEffect, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { headingAt, pointAt, useTrack } from "@/sdk/trackshape";
import { cssVar, drawCars, drawTrack, type Xf } from "../trackmap/draw";
import { meMarkerFrom } from "../trackmap/marker";
import "./style.css";

const S = 220;

export default function MiniMap(props: OverlayProps) {
  const { map, shape } = useTrack();
  let canvas: HTMLCanvasElement | undefined;
  let pending = false;
  let alive = true;
  onCleanup(() => (alive = false));

  const draw = () => {
    pending = false;
    if (!alive || !canvas) return;
    const s = shape();
    const m = map();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== S * dpr) {
      canvas.width = S * dpr;
      canvas.height = S * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    const bg = cssVar(canvas, "--ov-bg", "rgba(12,14,19,0.8)");
    // Yuvarlak arka plan ve kırpma
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();
    const me = m?.cars.find((c) => c.me);
    if (s && m && me) {
      const center = pointAt(s, me.pct);
      const k = S / 2 / (props.options.zoom as number);
      const mir = props.options.mirror ? -1 : 1;
      // Gidiş yönü yukarı: aracın yönü kadar ters döndür
      const rot = props.options.headingUp ? headingAt(s, me.pct) * mir : 0;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const xf: Xf = (p) => {
        const x = (p[0] - center[0]) * mir;
        const y = p[1] - center[1];
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        return [S / 2 + rx * k, S / 2 - ry * k];
      };
      drawTrack(ctx, s, xf, {
        line: props.options.lineWidth,
        fill: false,
        text: cssVar(canvas, "--ov-text", "#fff"),
        bg,
        outline: cssVar(canvas, "--ov-bg-solid", "#111"),
      });
      drawCars(ctx, s, xf, m.cars, {
        size: props.options.carSize,
        label: props.options.label,
        meColor: props.options.meColor,
        font: cssVar(canvas, "--ov-font", "sans-serif"),
        me: meMarkerFrom(props.options),
      });
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = cssVar(canvas, "--ov-line", "rgba(255,255,255,0.1)");
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  createEffect(() => {
    map();
    shape();
    void [props.options.zoom, props.options.headingUp, props.options.mirror, props.options.carSize];
    void [props.options.lineWidth, props.options.label, props.options.meColor];
    void [props.options.meShape, props.options.meOutline, props.options.meImage, props.options.meScale, props.options.meRotate];
    if (!pending) {
      pending = true;
      requestAnimationFrame(draw);
    }
  });

  return (
    <div class="mmap">
      <canvas ref={canvas} style={{ width: `${S}px`, height: `${S}px` }} />
      <Show when={map() && !shape()}>
        <div class="mmap-msg ov-dim">
          1 tur attıktan sonra harita görünecek
          <br />%{Math.round((map()?.progress ?? 0) * 100)}
        </div>
      </Show>
    </div>
  );
}
