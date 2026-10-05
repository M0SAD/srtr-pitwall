import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import { clock, wallClock } from "@/sdk/format";
import "./style.css";

const COLORS: Record<number, string> = { 1: "var(--ov-yellow)", 2: "#ff9f43", 4: "var(--ov-red)" };

export default function IncidentLog(props: OverlayProps) {
  const d = useTopic("incidents");
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));

  const rows = createMemo(() => {
    const l = (d()?.list ?? []).slice(-(props.options.count as number));
    return props.options.newestFirst ? [...l].reverse() : l;
  });
  const limit = () => d()?.limit ?? 0;
  const total = () => d()?.total ?? 0;
  const ratio = () => (limit() > 0 ? Math.min(1, total() / limit()) : 0);
  const fresh = (ts: number) => (props.options.flashSec as number) > 0 && now() - ts < (props.options.flashSec as number) * 1000;
  const hidden = () => props.options.hideEmpty && !props.editing && !demoShow() && rows().length === 0;

  return (
    <Show when={!hidden()}>
      <div class="ov-panel il">
        <div class="ov-header">
          <span>Olaylar</span>
          <span class="il-total" classList={{ warn: ratio() >= 0.7 }}>
            {total()}
            <Show when={limit() > 0}>/{limit()}</Show>x
          </span>
        </div>
        <Show when={limit() > 0}>
          <div class="il-bar">
            <div style={{ width: `${ratio() * 100}%` }} classList={{ warn: ratio() >= 0.7 }} />
          </div>
        </Show>
        <Show when={rows().length > 0} fallback={<div class="ov-empty">Temiz sürüş · olay yok</div>}>
          <For each={rows()}>
            {(r) => (
              <div class="il-row" classList={{ fresh: fresh(r.ts) }}>
                <Show when={props.options.time !== "none"}>
                  <span class="il-time ov-mono ov-dim">{props.options.time === "real" ? wallClock(r.ts) : clock(r.sessionTime)}</span>
                </Show>
                <span class="il-lap ov-dim">T{r.lap}</span>
                <Show when={props.options.showSector}>
                  <span class="il-sec ov-dim">S{r.sector}</span>
                </Show>
                <span class="il-pts" style={{ background: COLORS[r.delta] ?? "var(--ov-red)" }}>+{r.delta}x</span>
                <Show when={props.options.showKind}>
                  <span class="il-kind">{r.kind}</span>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
