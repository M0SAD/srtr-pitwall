import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { speed, speedUnit } from "@/sdk/format";
import "./style.css";

export default function Corners(props: OverlayProps) {
  const d = useTopic("corners");
  const list = createMemo(() => (d()?.corners ?? []).slice(0, props.options.max as number));
  const next = createMemo(() => {
    const p = d()?.lapPct ?? 0;
    return list().find((c) => c.pct > p)?.n ?? list()[0]?.n;
  });
  const cmp = (c: { last: number; current: number }) => (props.options.compare === "live" && c.current > 0 ? c.current : c.last);
  const diff = (c: { best: number; last: number; current: number }) => {
    const v = cmp(c);
    return v > 0 ? (v - c.best) * (props.units === "metric" ? 3.6 : 2.23694) : null;
  };
  const cls = (x: number | null) => {
    if (x === null) return "";
    const th = ((props.options.threshold as number) ?? 1) * (props.units === "metric" ? 1 : 0.621);
    return Math.abs(x) < th ? "ov-dim" : x > 0 ? "ov-pos" : "ov-neg";
  };

  return (
    <div class="ov-panel cn">
      <div class="ov-header">
        <span>Virajlar</span>
        <span>{d()?.bestLap ? `En iyi tur ${d()!.bestLap}` : ""}</span>
      </div>
      <Show when={list().length > 0} fallback={<div class="ov-empty">Temiz bir tur tamamlanınca virajlar çıkar</div>}>
        <div class="cn-row cn-cap ov-dim">
          <span>#</span>
          <span>En iyi</span>
          <span>Karş.</span>
          <span>Fark ({speedUnit(props.units)})</span>
        </div>
        <For each={list()}>
          {(c) => (
            <div class="cn-row" classList={{ next: props.options.highlightNext && next() === c.n, live: props.options.compare === "live" && c.current > 0 }}>
              <span class="cn-n">V{c.n}</span>
              <span class="ov-mono">{speed(c.best, props.units)}</span>
              <span class="ov-mono">{cmp(c) > 0 ? speed(cmp(c), props.units) : "—"}</span>
              <b class={`ov-mono ${cls(diff(c))}`}>{diff(c) === null ? "" : Math.abs(diff(c)!) < 0.05 ? "0.0" : `${diff(c)! > 0 ? "+" : "−"}${Math.abs(diff(c)!).toFixed(1)}`}</b>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
