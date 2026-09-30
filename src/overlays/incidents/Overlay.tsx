import { Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import "./style.css";

export default function Incidents(props: OverlayProps) {
  const s = useTopic("session");
  const limit = () => {
    const l = s()?.incidentLimit ?? 0;
    return l > 0 ? l : (props.options.fallbackLimit as number);
  };
  const ratio = () => (limit() > 0 ? Math.min(1, (s()?.incidents ?? 0) / limit()) : 0);
  const color = () => (ratio() < 0.5 ? "var(--ov-green)" : ratio() < 0.8 ? "var(--ov-yellow)" : "var(--ov-red)");

  return (
    <div class="ov-theme inc" classList={{ row: props.options.layout === "row" }}>
      <Show when={props.options.showLaps}>
        <div class="ov-panel inc-box">
          <span>TUR</span>
          <b>{s()?.lapsCompleted ?? "—"}</b>
        </div>
      </Show>
      <div class="ov-panel inc-box">
        <span>OLAY</span>
        <b style={{ color: color() }}>
          {s()?.incidents ?? 0}
          <Show when={(s()?.incidentLimit ?? 0) > 0}>/{s()!.incidentLimit}</Show>x
        </b>
        <Show when={limit() > 0}>
          <div class="inc-bar">
            <div style={{ width: `${ratio() * 100}%`, background: color() }} />
          </div>
        </Show>
      </div>
    </div>
  );
}
