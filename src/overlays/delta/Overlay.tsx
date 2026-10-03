import { Match, Show, Switch, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { useTopic } from "@/sdk/telemetry";
import { lapTime, signed } from "@/sdk/format";
import "./style.css";

const DESIGNS = ["bar", "center", "number", "line", "split", "arc"] as const;
type Design = (typeof DESIGNS)[number];

export default function Delta(props: OverlayProps) {
  const data = useTopic("delta");

  // Bilinmeyen ya da kullanıcıya kilitli (PRO) tasarım varsayılana düşer
  const design = createMemo<Design>(() => {
    const v = props.options.design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("delta", "design", v) ? v : "bar";
  });

  const ratio = () => {
    const d = data();
    if (!d || !d.valid) return 0;
    const r = (props.options.range as number) || 1.5;
    return Math.max(-1, Math.min(1, d.delta / r));
  };
  const mag = () => Math.abs(ratio());
  // Negatif delta = daha hızlı = yeşil, sağa doğru büyür
  const faster = () => (data()?.delta ?? 0) < 0;
  const trend = () => {
    const t = data()?.trend ?? 0;
    return t < -0.005 ? "▲" : t > 0.005 ? "▼" : "";
  };

  const Value = () => (
    <div class="dl-value ov-mono" classList={{ "ov-pos": faster(), "ov-neg": !faster() }}>
      <Show when={data()?.valid} fallback={<span class="ov-dim">—.——</span>}>
        {signed(data()!.delta)}
        <span class="dl-trend">{trend()}</span>
      </Show>
    </div>
  );
  /** Ortadan iki yana büyüyen çubuk */
  const Bar = () => (
    <div class="dl-bar">
      <div class="dl-mid" />
      <div
        class="dl-fill"
        classList={{ fast: faster(), slow: !faster() }}
        style={{
          left: faster() ? "50%" : `${50 - mag() * 50}%`,
          width: `${mag() * 50}%`,
        }}
      />
    </div>
  );

  return (
    <div class={`ov-panel dl dl-d-${design()}`} classList={{ fast: !!data()?.valid && faster(), slow: !!data()?.valid && !faster() }}>
      <Switch>
        <Match when={design() === "bar"}>
          <div class="dl-top">
            <Bar />
            <Value />
          </div>
        </Match>
        <Match when={design() === "center"}>
          <div class="dl-c">
            <Value />
            <Bar />
            <div class="dl-scale ov-dim ov-mono">
              <span>+{((props.options.range as number) || 1.5).toFixed(1)}</span>
              <span>0</span>
              <span>−{((props.options.range as number) || 1.5).toFixed(1)}</span>
            </div>
          </div>
        </Match>
        <Match when={design() === "number"}>
          <div class="dl-n">
            <Value />
          </div>
        </Match>
        <Match when={design() === "line"}>
          <div class="dl-l">
            <Value />
            <Bar />
          </div>
        </Match>
        <Match when={design() === "split"}>
          <div class="dl-s">
            <div class="dl-half l">
              <div style={{ width: `${faster() ? 0 : mag() * 100}%` }} />
            </div>
            <Value />
            <div class="dl-half r">
              <div style={{ width: `${faster() ? mag() * 100 : 0}%` }} />
            </div>
          </div>
        </Match>
        <Match when={design() === "arc"}>
          <div class="dl-a">
            <svg viewBox="0 0 200 104">
              <path class="dl-a-track" d="M14 98 A86 86 0 0 1 186 98" />
              <path class="dl-a-fill slow" d="M100 12 A86 86 0 0 0 14 98" pathLength="100" stroke-dasharray={`${faster() ? 0 : mag() * 100} 100`} />
              <path class="dl-a-fill fast" d="M100 12 A86 86 0 0 1 186 98" pathLength="100" stroke-dasharray={`${faster() ? mag() * 100 : 0} 100`} />
              <line class="dl-a-mid" x1="100" y1="3" x2="100" y2="21" />
            </svg>
            <Value />
          </div>
        </Match>
      </Switch>
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
