import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { speed, speedUnit } from "@/sdk/format";
import { overlayValueLocked } from "@/sdk/proFeatures";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (v: unknown, a: number) => {
  const h = hex(v, "#0c0e13");
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${clamp(a, 0, 100) / 100})`;
};
const DESIGNS = ["digital", "bar", "lcd", "analog", "arc", "half"];
const pt = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
/** Yay yolu (derece, saat yönünde; 0 = sağ) */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  if (a1 - a0 < 0.01) return "";
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export default function Speedo(props: OverlayProps) {
  const d = useTopic("inputs");
  const o = () => props.options;
  const design = () => {
    const v = String(o().design);
    return DESIGNS.includes(v) && !overlayValueLocked("speedo", "design", v) ? v : "arc";
  };
  const unit = () => (o().unit === "kmh" ? "km/h" : o().unit === "mph" ? "mph" : speedUnit(props.units));
  const value = () => {
    const ms = d()?.speed ?? 0;
    return o().unit === "kmh" ? Math.round(ms * 3.6) : o().unit === "mph" ? Math.round(ms * 2.23694) : Number(speed(ms, props.units));
  };
  const max = () => clamp(num(o().max, 320), 60, 500);
  const ratio = () => clamp(value() / max(), 0, 1);
  const red = () => clamp(num(o().redFrom, 85), 40, 100) / 100;
  const inRed = () => red() < 1 && ratio() >= red();
  const gear = () => {
    const g = d()?.gear;
    return g == null ? "N" : g < 0 ? "R" : g === 0 ? "N" : String(g);
  };
  const custom = () => !!o().customColors;
  const style = () => {
    const st: Record<string, string> = {
      "--sp-size": `${clamp(num(o().size, 220), 90, 700)}px`,
      "--sp-red": custom() ? hex(o().redColor, "#ff4d4d") : "var(--ov-red)",
      "--sp-tick": custom() ? hex(o().tickColor, "#9aa3b2") : "var(--ov-dim)",
    };
    if (custom()) {
      st["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      st["--ov-text"] = hex(o().textColor, "#f2f4f8");
      st["--ov-accent"] = hex(o().accentColor, "#ff8a2a");
    }
    return st;
  };
  const half = () => design() === "half";
  // Kadran açıları: tam kadran 270° (135 → 405), yarım kadran 180° (180 → 360)
  const A0 = () => (half() ? 180 : 135);
  const SW = () => (half() ? 180 : 270);
  const ang = (r: number) => A0() + SW() * r;
  const cy = () => (half() ? 92 : 100);
  /** Kadran üzerindeki nokta: hız değeri ve yarıçap (tasarım değişince yeniden hesaplanır) */
  const P = (v: number, r: number) => pt(100, cy(), r, ang(v / max()));
  const sw = () => 9 * (clamp(num(o().thick, 100), 40, 250) / 100);
  /** Büyük çizgiler: yuvarlak adım (10/20/40/50), 6-10 aralık */
  const step = createMemo(() => [10, 20, 30, 40, 50, 100].find((s) => max() / s <= 10) ?? 100);
  const majors = createMemo(() => Array.from({ length: Math.floor(max() / step()) + 1 }, (_, i) => i * step()));
  const minors = createMemo(() => Array.from({ length: Math.floor(max() / (step() / 2)) + 1 }, (_, i) => (i * step()) / 2).filter((v) => v % step() !== 0));
  const Center = () => (
    <Show when={o().digital !== false}>
      <div class="sp-center">
        <b>{value()}</b>
        <Show when={o().showUnit !== false}>
          <small>{unit()}</small>
        </Show>
        <Show when={o().showGear}>
          <em>{gear()}</em>
        </Show>
      </div>
    </Show>
  );

  return (
    <div class={`ov-theme sp sp-${design()}`} classList={{ "sp-inred": inRed() }} style={style()}>
      <Show when={design() === "digital" || design() === "bar" || design() === "lcd"}>
        <div class="ov-panel sp-box">
          <Show when={o().showGear}>
            <em class="sp-gear">{gear()}</em>
          </Show>
          <div class="sp-val">
            <Show when={design() === "lcd"}>
              <span class="sp-ghost">888</span>
            </Show>
            <b>{value()}</b>
          </div>
          <Show when={o().showUnit !== false}>
            <small>{unit()}</small>
          </Show>
          <Show when={design() === "bar"}>
            <div class="sp-meter" style={{ height: `${sw() * 0.9}px` }}>
              <div style={{ width: `${ratio() * 100}%` }} />
              <Show when={red() < 1}>
                <i style={{ left: `${red() * 100}%` }} />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={design() === "analog" || design() === "arc" || design() === "half"}>
        <div class="sp-dial" classList={{ half: half() }}>
          <svg viewBox={half() ? "0 0 200 112" : "0 0 200 200"}>
            <Show when={!half()} fallback={<path class="sp-face" d={`${arc(100, cy(), 96, 180, 360)} L 196 ${cy() + 16} L 4 ${cy() + 16} Z`} />}>
              <circle class="sp-face" cx="100" cy="100" r="97" />
            </Show>
            <Show when={design() === "arc"}>
              <path class="sp-trk" d={arc(100, cy(), 82, ang(0), ang(1))} stroke-width={sw()} />
              <Show when={red() < 1}>
                <path class="sp-redtrk" d={arc(100, cy(), 82, ang(red()), ang(1))} stroke-width={sw()} />
              </Show>
              <path class="sp-fill" d={arc(100, cy(), 82, ang(0), ang(ratio()))} stroke-width={sw()} />
            </Show>
            <Show when={design() !== "arc"}>
              <path class="sp-rim" d={arc(100, cy(), 90, ang(0), ang(1))} stroke-width={sw() * 0.35} />
              <Show when={red() < 1}>
                <path class="sp-redtrk" d={arc(100, cy(), 90, ang(red()), ang(1))} stroke-width={sw() * 0.6} />
              </Show>
              <Show when={o().ticks !== false}>
                <For each={minors()}>
                  {(v) => <line class="sp-tk" x1={P(v, 86)[0]} y1={P(v, 86)[1]} x2={P(v, 80)[0]} y2={P(v, 80)[1]} />}
                </For>
                <For each={majors()}>
                  {(v) => <line class="sp-tk big" classList={{ red: red() < 1 && v / max() >= red() }} x1={P(v, 86)[0]} y1={P(v, 86)[1]} x2={P(v, 74)[0]} y2={P(v, 74)[1]} />}
                </For>
              </Show>
              <Show when={o().numbers !== false}>
                <For each={majors()}>
                  {(v) => (
                    <text class="sp-nm" x={P(v, 62)[0]} y={P(v, 62)[1] + 3.5} text-anchor="middle">
                      {v}
                    </text>
                  )}
                </For>
              </Show>
              <g style={{ transform: `rotate(${ang(ratio())}deg)`, "transform-origin": `100px ${cy()}px`, transition: "transform 0.08s linear" }}>
                <polygon class="sp-needle" points={`100,${cy() - 3} 182,${cy()} 100,${cy() + 3} 84,${cy()}`} />
              </g>
              <circle class="sp-hub" cx="100" cy={cy()} r="7" />
            </Show>
          </svg>
          <Center />
        </div>
      </Show>
    </div>
  );
}
