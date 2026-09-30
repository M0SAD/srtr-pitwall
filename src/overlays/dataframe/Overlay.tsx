import { Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { METRICS } from "./metrics";
import "./style.css";

export default function DataFrame(props: OverlayProps) {
  const tel = useTopic("telemetry");
  const ses = useTopic("session");
  const fuel = useTopic("fuel");
  const delta = useTopic("delta");

  const metric = createMemo(() => METRICS.find((m) => m.id === props.options.metric) ?? METRICS[0]);
  const src = () => ({ tel: tel(), ses: ses(), fuel: fuel(), delta: delta() });
  const value = () => metric().get(src(), props.units);
  const tone = () => metric().tone?.(src()) ?? "";

  return (
    <div class="ov-panel df" style={{ width: `${props.options.width}px` }}>
      <Show when={props.options.title}>
        <div class="df-title">{metric().label}</div>
      </Show>
      <div class="df-value" classList={{ "ov-pos": tone() === "pos", "ov-neg": tone() === "neg" }}>
        <b class="ov-mono" style={{ "font-size": `${props.options.big}px` }}>
          {value()?.[0] ?? "—"}
        </b>
        <Show when={value()?.[1]}>
          <span>{value()![1]}</span>
        </Show>
      </div>
    </div>
  );
}
