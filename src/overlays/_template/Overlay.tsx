import { Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { speed, speedUnit } from "@/sdk/format";

export default function Template(props: OverlayProps) {
  // Sadece manifestte istenen konular dolu gelir.
  const data = useTopic("inputs");

  return (
    <div class="ov-panel" style={{ padding: "10px 14px", width: "200px" }}>
      <Show when={props.options.label}>
        <div class="ov-dim">Hız</div>
      </Show>
      <b style={{ "font-size": "1.85em", color: props.options.color }}>
        {speed(data()?.speed ?? 0, props.units)} {speedUnit(props.units)}
      </b>
    </div>
  );
}
