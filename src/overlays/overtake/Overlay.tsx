import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import "./style.css";

export default function Overtake(props: OverlayProps) {
  const t = useTopic("traffic");
  const within = () => (props.options.within as number) ?? 5;
  const cars = createMemo(() =>
    (t()?.cars ?? [])
      .filter((c) => c.gap > 0 && c.gap <= within() && !c.onPit && (c.faster || (props.options.sameClass && c.sameClass)))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, props.options.count as number),
  );
  const show = () => props.editing || demoShow() || !props.options.hideEmpty || cars().length > 0;

  return (
    <Show when={show()}>
      <div class="ov-panel ot">
        <div class="ov-header">
          <span>Arkadan hızlı araç</span>
          <span>{cars().length}</span>
        </div>
        <Show when={cars().length > 0} fallback={<div class="ov-empty">Arkan temiz</div>}>
          <For each={cars()}>
            {(c) => (
              <div class="ot-row" style={{ "--cc": c.classColor || "var(--ov-accent)" }}>
                <span class="ot-cls">{c.className}</span>
                <span class="ot-num">#{c.number}</span>
                <span class="ot-name" data-no-i18n>{c.name}</span>
                <b class="ot-gap ov-mono">{c.gap.toFixed(1)}s</b>
                <div class="ot-bar" style={{ width: `${Math.max(0, 1 - c.gap / within()) * 100}%` }} />
              </div>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
