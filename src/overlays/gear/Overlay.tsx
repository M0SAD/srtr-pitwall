import { For, Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { speed, speedUnit } from "@/sdk/format";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (v: unknown, a: number) => {
  const h = hex(v, "#0c0e13");
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${clamp(a, 0, 100) / 100})`;
};
const DESIGNS = ["box", "minimal", "ring", "leds", "neon", "hex"];
const C = 2 * Math.PI * 44;

export default function Gear(props: OverlayProps) {
  const d = useTopic("inputs");
  const o = () => props.options;
  const design = () => {
    const v = String(o().design ?? "box");
    return DESIGNS.includes(v) && !overlayValueLocked("gear", "design", v) ? v : "box";
  };
  const gear = () => {
    const g = d()?.gear;
    return g == null ? "N" : g < 0 ? "R" : g === 0 ? "N" : String(g);
  };
  const ratio = () => {
    const red = d()?.redline || d()?.shiftRpm || 0;
    return red > 0 ? clamp((d()?.rpm ?? 0) / red, 0, 1) : 0;
  };
  const shift = () => {
    const s = d()?.shiftRpm ?? 0;
    return s > 0 && (d()?.rpm ?? 0) >= s;
  };
  const custom = () => !!o().customColors;
  const style = () => {
    const st: Record<string, string> = {
      "--gr-size": `${clamp(num(o().size, 120), 50, 500)}px`,
      "--gr-shift": custom() ? hex(o().shiftColor, "#ff4d4d") : "var(--ov-red)",
      "--gr-rev": custom() ? hex(o().reverseColor, "#ffd23f") : "var(--ov-yellow)",
    };
    if (custom()) {
      st["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      st["--ov-text"] = hex(o().textColor, "#f2f4f8");
      st["--ov-accent"] = hex(o().accentColor, "#ff8a2a");
    }
    return st;
  };
  const leds = () => Math.round(clamp((ratio() - 0.6) / 0.4, 0, 1) * 8);

  return (
    <div
      class={`ov-theme gr gr-${design()}`}
      classList={{ "gr-shift": shift() && o().shiftFlash !== false, "gr-blink": shift() && !!o().shiftBlink, "gr-r": gear() === "R", "gr-n": gear() === "N" }}
      style={style()}
    >
      <Show when={o().showLabel}>
        <div class="gr-cap">VİTES</div>
      </Show>
      <div class="gr-body" classList={{ "ov-panel": design() === "box" || design() === "leds" }}>
        <Show when={design() === "leds"}>
          <div class="gr-leds">
            <For each={Array.from({ length: 8 }, (_, i) => i)}>{(i) => <i classList={{ on: i < leds(), hi: i >= 5 }} />}</For>
          </div>
        </Show>
        <Show when={design() === "ring"}>
          <svg class="gr-svg" viewBox="0 0 100 100">
            <circle class="trk" cx="50" cy="50" r="44" stroke-dasharray={`${C * 0.75} ${C}`} />
            <circle class="val" cx="50" cy="50" r="44" stroke-dasharray={`${C * 0.75 * ratio()} ${C}`} />
          </svg>
        </Show>
        <Show when={design() === "hex"}>
          <svg class="gr-svg" viewBox="0 0 100 100">
            <polygon class="hex" points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5" />
          </svg>
        </Show>
        <b class="gr-num">{gear()}</b>
      </div>
      <Show when={o().showSpeed}>
        <div class="gr-spd">
          {speed(d()?.speed ?? 0, props.units)} <small>{speedUnit(props.units)}</small>
        </div>
      </Show>
    </div>
  );
}
