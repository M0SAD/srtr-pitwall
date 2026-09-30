import { Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { lapTime, signed } from "@/sdk/format";
import "./style.css";

export default function Delta(props: OverlayProps) {
  const data = useTopic("delta");

  const ratio = () => {
    const d = data();
    if (!d || !d.valid) return 0;
    const r = props.options.range as number;
    return Math.max(-1, Math.min(1, d.delta / r));
  };
  // Negatif delta = daha hızlı = yeşil, sağa doğru büyür
  const faster = () => (data()?.delta ?? 0) < 0;

  return (
    <div class="ov-panel dl">
      <div class="dl-top">
        <div class="dl-bar">
          <div class="dl-mid" />
          <div
            class="dl-fill"
            classList={{ fast: faster(), slow: !faster() }}
            style={{
              left: faster() ? "50%" : `${50 - Math.abs(ratio()) * 50}%`,
              width: `${Math.abs(ratio()) * 50}%`,
            }}
          />
        </div>
        <div class="dl-value ov-mono" classList={{ "ov-pos": faster(), "ov-neg": !faster() }}>
          <Show when={data()?.valid} fallback={<span class="ov-dim">—.——</span>}>
            {signed(data()!.delta)}
            <span class="dl-trend">{(data()!.trend ?? 0) < -0.005 ? "▲" : (data()!.trend ?? 0) > 0.005 ? "▼" : ""}</span>
          </Show>
        </div>
      </div>
      <Show when={props.options.showTimes}>
        <div class="dl-times ov-mono">
          <span>
            <label>Şimdi</label>
            {lapTime(data()?.current, 1)}
          </span>
          <span>
            <label>Son</label>
            {lapTime(data()?.last)}
          </span>
          <span class="dl-best">
            <label>En iyi</label>
            {lapTime(data()?.best)}
          </span>
        </div>
      </Show>
    </div>
  );
}
