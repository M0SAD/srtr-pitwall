import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { fuel, lapTime } from "@/sdk/format";
import "./style.css";

export default function LapTimes(props: OverlayProps) {
  const d = useTopic("laps");
  const rows = createMemo(() => {
    let l = d()?.laps ?? [];
    if (props.options.hideInvalid) l = l.filter((x) => x.valid);
    l = l.slice(-(props.options.count as number));
    return props.options.newestFirst ? [...l].reverse() : l;
  });
  const best = () => d()?.best ?? 0;
  const bestS = () => d()?.bestSectors ?? [];
  const secClass = (i: number, v: number, valid: boolean) =>
    valid && v > 0 && bestS()[i] > 0 && Math.abs(v - bestS()[i]) < 0.0005 ? "lpt-purple" : "";

  return (
    <div class="ov-panel lpt" classList={{ nosec: !props.options.showSectors }}>
      <div class="ov-header">
        <span>Tur süreleri</span>
        <span>
          En iyi <b class="lpt-best">{best() > 0 ? lapTime(best()) : "—"}</b>
        </span>
      </div>
      <Show when={rows().length > 0} fallback={<div class="ov-empty">Tamamlanan tur yok</div>}>
        <div class="lpt-rows">
          <For each={rows()}>
            {(l) => (
              <div class="lpt-row" classList={{ invalid: !l.valid, pit: l.pit, best: l.valid && l.time === best() }}>
                <span class="lpt-lap ov-dim">{l.lap}</span>
                <span class="lpt-time ov-mono">{lapTime(l.time)}</span>
                <Show when={props.options.showSectors}>
                  <For each={[0, 1, 2]}>
                    {(i) => (
                      <span class={`lpt-sec ov-mono ${secClass(i, l.sectors[i] ?? 0, l.valid)}`}>
                        {l.sectors[i] ? l.sectors[i].toFixed(1) : "—"}
                      </span>
                    )}
                  </For>
                </Show>
                <Show when={props.options.showDelta}>
                  <span class="lpt-delta ov-mono" classList={{ "ov-pos": l.time <= best(), "ov-neg": l.time > best() }}>
                    {best() > 0 && l.time !== best() ? `${l.time > best() ? "+" : "−"}${Math.abs(l.time - best()).toFixed(3)}` : ""}
                  </span>
                </Show>
                <Show when={props.options.showFuel}>
                  <span class="lpt-fuel ov-mono ov-dim">{l.fuel > 0 ? fuel(l.fuel, props.units, 2) : "—"}</span>
                </Show>
                <span class="lpt-flag">
                  {l.pit ? <i class="ov-tag lpt-tag-pit">PIT</i> : !l.valid ? <i class="ov-tag lpt-tag-inv">✕</i> : null}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.options.showOptimal && (d()?.optimal ?? 0) > 0}>
        <div class="lpt-foot">
          <span class="ov-dim">Teorik en iyi</span>
          <b class="ov-mono lpt-purple">{lapTime(d()!.optimal)}</b>
          <Show when={props.options.showSectors}>
            <span class="ov-dim ov-mono">{bestS().map((x) => x.toFixed(1)).join(" · ")}</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
