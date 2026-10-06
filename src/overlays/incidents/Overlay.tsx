import { For, Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (v: unknown, a: number) => {
  const h = hex(v, "#0c0e13");
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${Math.max(0, Math.min(100, a)) / 100})`;
};
const DESIGNS = ["classic", "compact", "ring", "segments"];

export default function Incidents(props: OverlayProps) {
  const s = useTopic("session");
  const o = () => props.options;
  const design = () => (DESIGNS.includes(String(o().design)) ? String(o().design) : "classic");
  const inc = () => s()?.incidents ?? 0;
  const real = () => s()?.incidentLimit ?? 0;
  const limit = () => (real() > 0 ? real() : num(o().fallbackLimit, 17));
  const ratio = () => (limit() > 0 ? Math.min(1, inc() / limit()) : 0);
  const level = () => {
    const w = num(o().warnAt, 50) / 100;
    const d = Math.max(w, num(o().dangerAt, 80) / 100);
    return ratio() < w ? 0 : ratio() < d ? 1 : 2;
  };
  const custom = () => !!o().customColors;
  const color = () =>
    custom()
      ? [hex(o().safeColor, "#3ddc84"), hex(o().warnColor, "#ffd23f"), hex(o().dangerColor, "#ff4d4d")][level()]
      : ["var(--ov-green)", "var(--ov-yellow)", "var(--ov-red)"][level()];
  const bar = () => o().showBar !== false && limit() > 0;
  const segs = () => Math.max(1, Math.min(60, Math.round(limit())));
  const style = () => {
    const st: Record<string, string> = {
      "--inc-w": String(Math.max(60, Math.min(250, num(o().width, 100))) / 100),
      "--inc-bar": `${Math.max(2, Math.min(20, num(o().barH, 5)))}px`,
      "--inc-c": color(),
    };
    if (num(o().radius, -1) >= 0) st["--ov-radius"] = `${num(o().radius, 0)}px`;
    if (custom()) {
      st["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      st["--ov-bg-solid"] = hex(o().bg, "#0c0e13");
      st["--ov-text"] = hex(o().valueColor, "#f2f4f8");
      st["--ov-dim"] = hex(o().titleColor, "#9aa3b2");
      st["--ov-line"] = hex(o().borderColor, "#2a2f3a");
      st.color = "var(--ov-text)";
    }
    return st;
  };
  const Value = () => (
    <b style={{ color: color() }}>
      {inc()}
      <Show when={o().showLimit !== false && real() > 0}>/{real()}</Show>x
    </b>
  );
  const Left = () => (
    <Show when={o().showLeft && limit() > 0}>
      <small class="inc-left"><span>KALAN</span> {Math.max(0, limit() - inc())}x</small>
    </Show>
  );
  const Bar = () => (
    <Show when={bar()}>
      <Show
        when={design() === "segments"}
        fallback={
          <div class="inc-bar">
            <div style={{ width: `${ratio() * 100}%`, background: color() }} />
          </div>
        }
      >
        <div class="inc-segs">
          <For each={Array.from({ length: segs() }, (_, i) => i)}>{(i) => <i classList={{ on: i < inc() }} />}</For>
        </div>
      </Show>
    </Show>
  );
  const C = 2 * Math.PI * 42;

  return (
    <div class={`ov-theme inc inc-${design()}`} classList={{ row: o().layout === "row", blink: !!o().blink && level() === 2 }} style={style()}>
      <Show when={design() === "compact"}>
        <div class="ov-panel inc-line">
          <Show when={o().showLaps}>
            <span>TUR</span>
            <b>{s()?.lapsCompleted ?? "—"}</b>
            <em />
          </Show>
          <span>OLAY</span>
          <Value />
          <Left />
          <Bar />
        </div>
      </Show>
      <Show when={design() === "ring"}>
        <div class="ov-panel inc-ringbox">
          <div class="inc-dial">
            <svg viewBox="0 0 100 100">
              <circle class="trk" cx="50" cy="50" r="42" />
              <circle class="val" cx="50" cy="50" r="42" stroke-dasharray={`${ratio() * C} ${C}`} />
            </svg>
            <div class="inc-ringin">
              <span>OLAY</span>
              <Value />
            </div>
          </div>
          <Left />
          <Show when={o().showLaps}>
            <div class="inc-ringlap">
              <span>TUR</span> <b>{s()?.lapsCompleted ?? "—"}</b>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={design() === "classic" || design() === "segments"}>
        <Show when={o().showLaps}>
          <div class="ov-panel inc-box">
            <span>TUR</span>
            <b>{s()?.lapsCompleted ?? "—"}</b>
          </div>
        </Show>
        <div class="ov-panel inc-box">
          <span>OLAY</span>
          <Value />
          <Left />
          <Bar />
        </div>
      </Show>
    </div>
  );
}
