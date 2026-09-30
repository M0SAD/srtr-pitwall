import { For, Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { clock, fuel, fuelUnit } from "@/sdk/format";
import type { FuelRow } from "@/sdk/types";
import { TeamFuel } from "./Team";
import "./style.css";

export default function Fuel(props: OverlayProps) {
  const data = useTopic("fuel");
  const u = () => fuelUnit(props.units);
  const f = (v: number, digits = 2) => (v > 0 ? fuel(v, props.units, digits) : "—");
  const margin = () => 1 + (props.options.margin as number) / 100;

  const refuel = (r: FuelRow) => {
    const d = data()!;
    if (r.usage <= 0) return "—";
    const need = r.refuel > 0 ? r.refuel * margin() : 0;
    const room = d.max > 0 ? Math.max(0, d.max - d.level) : need;
    return fuel(Math.min(need, room), props.units, 2);
  };

  const rows = () => {
    const d = data()!;
    return [
      { label: "SON", r: d.last },
      { label: "ORT 5", r: d.avg5 },
      { label: "ORT 10", r: d.avg10 },
    ];
  };

  // Kalan tur: son tur (yeşil) / ortalama (sarı) / en kötü (kırmızı)
  const remaining = () => {
    const d = data()!;
    return [
      { label: "SON", v: d.last.laps, cls: "g" },
      { label: "ORT.", v: d.avg5.laps, cls: "y" },
      { label: "EN KÖTÜ", v: d.worst.laps, cls: "r" },
    ];
  };

  return (
    <div class="ov-panel fuel">
      <Show when={data()} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        {(d) => (
          <>
            <div class="ov-header fuel-title">
              <span>Yakıt</span>
              <span>Tur {d().lap}</span>
            </div>
            <div class="fuel-tank">
              <div class="fuel-bar">
                <div
                  class="fuel-fill"
                  classList={{ low: d().avg5.laps > 0 && d().avg5.laps < 2 }}
                  style={{ width: `${Math.min(100, d().pct * 100)}%` }}
                />
              </div>
              <div class="fuel-tank-row">
                <span class="ov-dim">B</span>
                <b>
                  {fuel(d().level, props.units)} {u()} ({Math.round(d().pct * 100)}%)
                </b>
                <span class="ov-dim">
                  {d().max > 0 ? fuel(d().max, props.units, 0) : "—"} {u()}
                </span>
              </div>
              <div class="fuel-tank-row">
                <span>
                  <span class="ov-dim">Bitişe </span>
                  <b>
                    {d().raceNeeded > 0 ? fuel(d().raceNeeded, props.units) : "—"} {u()}
                  </b>
                </span>
                <span>
                  <span class="ov-dim">Stint </span>
                  <b>{clock(d().stintTime)}</b>
                </span>
              </div>
            </div>

            <Show when={props.options.showTable}>
              <div class="fuel-table">
                <div class="fuel-th">
                  <span />
                  <span>TÜKETİM</span>
                  <span>TUR</span>
                  <span>STİNT</span>
                  <span>İKMAL</span>
                </div>
                <For each={rows()}>
                  {(x) => (
                    <div class="fuel-tr">
                      <span class="fuel-rl">{x.label}</span>
                      <b>{f(x.r.usage)}</b>
                      <b>{x.r.laps > 0 ? x.r.laps.toFixed(2) : "—"}</b>
                      <b>{x.r.stint > 0 ? x.r.stint.toFixed(2) : "—"}</b>
                      <span class="fuel-refuel" classList={{ zero: x.r.refuel <= 0 }}>
                        {refuel(x.r)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={props.options.showTargets && d().targets.length > 0}>
              <div class="fuel-targets">
                <For each={d().targets}>
                  {([n, per]) => (
                    <div>
                      <small>{n} TUR</small>
                      <b>{fuel(per, props.units, 2)}</b>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={props.options.showRemaining}>
              <div class="fuel-sub">KALAN TUR</div>
              <div class="fuel-remain">
                <For each={remaining()}>
                  {(x) => (
                    <div class={x.cls}>
                      <small>{x.label}</small>
                      <b>{x.v > 0 ? x.v.toFixed(1) : "—"}</b>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={props.options.showPitWindow}>
              <div class="fuel-pit" classList={{ none: d().pitOpen <= 0 }}>
                <span>PİT PENCERESİ</span>
                <Show
                  when={d().pitOpen > 0}
                  fallback={<b class="ov-pos">{d().samples > 0 ? "Pit gerekmez" : "Ölçülüyor…"}</b>}
                >
                  <b>
                    Tur {d().pitOpen}–{d().pitClose}
                  </b>
                  <span class="ov-dim">
                    {clock(d().pitOpenIn)} – {clock(d().pitCloseIn)}
                  </span>
                </Show>
              </div>
            </Show>
            <Show when={d().samples === 0}>
              <div class="fuel-note ov-dim">Tüketim için temiz bir tur tamamla</div>
            </Show>
          </>
        )}
      </Show>
      <Show when={props.options.showTeam}>
        <TeamFuel units={props.units} hideMe={props.options.teamHideMe} />
      </Show>
    </div>
  );
}
