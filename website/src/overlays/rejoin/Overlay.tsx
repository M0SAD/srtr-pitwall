import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import "./style.css";

export default function Rejoin(props: OverlayProps) {
  const t = useTopic("traffic");
  const behind = createMemo(() =>
    (t()?.cars ?? [])
      .filter((c) => c.gap > 0 && !c.onPit)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, props.options.count as number),
  );
  const need = () => {
    const d = t();
    if (!d || !d.onTrack || d.onPitRoad) return false;
    return d.offTrack || d.speed * 3.6 < (props.options.slow as number);
  };
  const nearest = () => behind()[0]?.gap ?? 99;
  const state = () => (nearest() >= (props.options.safe as number) ? "safe" : nearest() >= (props.options.caution as number) ? "caution" : "wait");
  const label = () => ({ safe: "DÖNEBİLİRSİN", caution: "DİKKAT", wait: "BEKLE" })[state()];

  return (
    <Show when={props.editing || need()}>
      <div class={`ov-panel rj rj-${state()}`}>
        <div class="rj-state">{label()}</div>
        <Show when={behind().length > 0} fallback={<div class="ov-empty">Arkada yakın araç yok</div>}>
          <For each={behind()}>
            {(c) => (
              <div class="rj-row">
                <i style={{ background: c.classColor || "var(--ov-dim)" }} />
                <span class="rj-num">#{c.number}</span>
                <span class="rj-name" data-no-i18n>{c.name}</span>
                <b class="ov-mono">{c.gap.toFixed(1)}s</b>
                <span class="ov-dim ov-mono rj-m">{Math.round(c.meters)} m</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
