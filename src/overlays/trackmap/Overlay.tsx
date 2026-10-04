import { Show, createEffect, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTrack } from "@/sdk/trackshape";
import { autoRotation, cssVar, drawCars, drawPit, drawTrack, fitTransform, pitGeometry, xfScale, type PitGeom, type Xf } from "./draw";
import { meMarkerFrom } from "./marker";
import "./style.css";

export default function TrackMap(props: OverlayProps) {
  const { map, shape } = useTrack();
  let canvas: HTMLCanvasElement | undefined;
  let pending = false;
  let alive = true;
  onCleanup(() => (alive = false));
  // Sabit katman (pist + pit yolu) ayrı bir tuvalde saklanır; her karede sadece araçlar yeniden çizilir
  let layer: HTMLCanvasElement | undefined;
  let layerKey = "";
  let xf: Xf | undefined;
  let pitGeom: PitGeom | null = null;

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
    const o = props.options;
    const on = (v: unknown) => v !== false; // eski kayıtlı ayarlarda alan yoksa açık say
    const custom = !!o.customColors;
    const track = custom ? String(o.trackColor) : cssVar(canvas, "--ov-text", "#fff");
    const bg = custom ? String(o.fillColor) : cssVar(canvas, "--ov-bg", "rgba(12,14,19,0.8)");
    const outline = custom ? String(o.outlineColor) : cssVar(canvas, "--ov-bg-solid", "#111");
    const pit = on(o.pitLane) ? (m.pit ?? null) : null;
    const key = JSON.stringify([
      s.version, w, h, dpr, o.rotate, o.rotateFine, !!o.mirror, o.lineWidth, o.fill, o.fillOpacity, o.outline, o.outlineWidth,
      o.sfLine, custom && o.sfColor, track, bg, outline, pit, o.pitSide, o.pitColor, o.pitWidth, o.pitOffset, o.pitMarks, o.pitStall, o.meColor,
    ]);
    if (key !== layerKey || !layer || !xf) {
      layerKey = key;
      layer ??= document.createElement("canvas");
      layer.width = w * dpr;
      layer.height = h * dpr;
      const mirror = !!o.mirror;
      const deg = (o.rotate === "auto" ? autoRotation(s, mirror) : Number(o.rotate) || 0) + (Number(o.rotateFine) || 0);
      const line = Number(o.lineWidth) || 5;
      const ow = on(o.outline) ? (Number(o.outlineWidth) || 2) : 0;
      const pitOff = Number(o.pitOffset) || 10;
      // Pit yolu ve kenar çizgisi kutunun dışına taşmasın
      const f = (xf = fitTransform(s, w, h, 18 + (pit ? pitOff : 0), deg, mirror));
      pitGeom = pit ? pitGeometry(s, pit, String(o.pitSide ?? "auto"), pitOff / xfScale(s, f)) : null;
      const g = pitGeom;
      const lc = layer.getContext("2d");
      if (lc) {
        lc.setTransform(dpr, 0, 0, dpr, 0, 0);
        lc.clearRect(0, 0, w, h);
        drawTrack(lc, s, f, {
          line,
          fill: !!o.fill,
          fillAlpha: (Number(o.fillOpacity ?? 100) || 0) / 100,
          text: track,
          bg,
          outline,
          outlineWidth: ow,
          sf: on(o.sfLine),
          sfColor: custom ? String(o.sfColor) : undefined,
          under: g
            ? () =>
                drawPit(lc, s, g, f, {
                  color: String(o.pitColor || "#ffb020"),
                  width: Number(o.pitWidth) || 3,
                  outline,
                  outlineWidth: Math.min(ow, 2),
                  marks: on(o.pitMarks),
                  trackLine: line,
                  stall: on(o.pitStall) ? String(o.meColor || "#ffffff") : undefined,
                })
            : undefined,
        });
      }
    }
    ctx.drawImage(layer, 0, 0, w, h);
    drawCars(ctx, s, xf, m.cars, {
      size: props.options.carSize,
      label: props.options.label,
      meColor: props.options.meColor,
      font: cssVar(canvas, "--ov-font", "sans-serif"),
      me: meMarkerFrom(props.options),
      pit: on(o.pitCars) ? pitGeom : null,
      carColor: on(o.classColors) ? undefined : String(o.carColor || "#e03b3b"),
      pitAlpha: on(o.dimPit) ? 0.45 : 1,
    });
  };

  createEffect(() => {
    // Veri, şekil ya da ayar değişince bir sonraki karede çiz
    map();
    shape();
    void [props.options.rotate, props.options.mirror, props.options.lineWidth, props.options.fill];
    void [props.options.carSize, props.options.label, props.options.meColor, W(), H()];
    void [props.options.rotateFine, props.options.fillOpacity, props.options.outline, props.options.outlineWidth, props.options.sfLine];
    void [props.options.customColors, props.options.trackColor, props.options.outlineColor, props.options.fillColor, props.options.sfColor];
    void [props.options.pitLane, props.options.pitSide, props.options.pitColor, props.options.pitWidth, props.options.pitOffset];
    void [props.options.pitMarks, props.options.pitStall, props.options.pitCars, props.options.classColors, props.options.carColor, props.options.dimPit];
    void [props.options.meShape, props.options.meOutline, props.options.meImage, props.options.meScale, props.options.meRotate];
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
          <b>1 tur attıktan sonra harita görünecek</b>
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
