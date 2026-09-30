import { Show, createEffect, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTrack } from "@/sdk/trackshape";
import { cssVar, drawCars, drawTrack, fitTransform } from "./draw";
import "./style.css";

export default function TrackMap(props: OverlayProps) {
  const { map, shape } = useTrack();
  let canvas: HTMLCanvasElement | undefined;
  let pending = false;
  let alive = true;
  onCleanup(() => (alive = false));

  const W = () => props.options.width as number;
  const H = () => props.options.height as number;

  const draw = () => {
    pending = false;
    const w = W();
    const h = H();
    if (!alive || !canvas) return;
    const s = shape();
    const m = map();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Yüksek DPI ekranlarda keskin çizim
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!s || !m) return;
    const xf = fitTransform(s, w, h, 18, Number(props.options.rotate), !!props.options.mirror);
    drawTrack(ctx, s, xf, {
      line: props.options.lineWidth,
      fill: props.options.fill,
      text: cssVar(canvas, "--ov-text", "#fff"),
      bg: cssVar(canvas, "--ov-bg", "rgba(12,14,19,0.8)"),
      outline: cssVar(canvas, "--ov-bg-solid", "#111"),
    });
    drawCars(ctx, s, xf, m.cars, {
      size: props.options.carSize,
      label: props.options.label,
      meColor: props.options.meColor,
      font: cssVar(canvas, "--ov-font", "sans-serif"),
    });
  };

  createEffect(() => {
    // Veri, şekil ya da ayar değişince bir sonraki karede çiz
    map();
    shape();
    void [props.options.rotate, props.options.mirror, props.options.lineWidth, props.options.fill];
    void [props.options.carSize, props.options.label, props.options.meColor, W(), H()];
    if (!pending) {
      pending = true;
      requestAnimationFrame(draw);
    }
  });

  return (
    <div class="tmap" style={{ width: `${W()}px`, height: `${H()}px` }}>
      <canvas ref={canvas} style={{ width: `${W()}px`, height: `${H()}px` }} />
      <Show when={map() && !shape()}>
        <div class="tmap-rec ov-panel">
          <b>Pist haritası kaydediliyor</b>
          <span class="ov-dim">
            {map()!.recording
              ? `Bu tur %${Math.round(map()!.progress * 100)} — turu pite girmeden tamamla`
              : "Başlangıç çizgisini geçince kayıt başlar"}
          </span>
        </div>
      </Show>
      <Show when={!map()}>
        <div class="tmap-rec ov-panel ov-empty">Veri bekleniyor…</div>
      </Show>
    </div>
  );
}
