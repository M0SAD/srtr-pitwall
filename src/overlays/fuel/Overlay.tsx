import { For, Match, Show, Switch, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { clock, fuel, fuelUnit } from "@/sdk/format";
import { overlayValueLocked } from "@/sdk/proFeatures";
import type { Fuel as FuelData, FuelRow } from "@/sdk/types";
import { TeamFuel } from "./Team";
import "./style.css";

const DESIGNS = ["simple", "classic", "line", "bar", "gauge"] as const;
type Design = (typeof DESIGNS)[number];

export default function Fuel(props: OverlayProps) {
  // Bilinmeyen ya da kullanıcıya kilitli (PRO) tasarım sade görünüme düşer
  const design = createMemo<Design>(() => {
    const v = props.options.design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("fuel", "design", v) ? v : "simple";
  });
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
      { label: "SON", r: d.last, on: props.options.showLast !== false },
      { label: "ORT 5", r: d.avg5, on: props.options.showAvg5 !== false },
      { label: "ORT 10", r: d.avg10, on: props.options.showAvg10 !== false },
    ].filter((x) => x.on);
  };
  /** Kalan tur: 5 tur ortalaması, yoksa son tur */
  const lapsLeft = (d: FuelData) => (d.avg5.laps > 0 ? d.avg5.laps : d.last.laps);
  const low = (d: FuelData) => lapsLeft(d) > 0 && lapsLeft(d) < 2;
  const lapsTxt = (d: FuelData) => (lapsLeft(d) > 0 ? lapsLeft(d).toFixed(1) : "—");
  const mainRow = (d: FuelData) => (d.avg5.usage > 0 ? d.avg5 : d.last);
  const pctW = (d: FuelData) => Math.max(0, Math.min(1, d.pct));

  const Chips = () => (
    <Show when={rows().length > 0}>
      <div class="fuel-chips">
        <For each={rows()}>
          {(x) => (
            <div class="fuel-chip">
              <small>{x.label}</small>
              <b>{f(x.r.usage)}</b>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
  const PitWindow = (p: { d: FuelData }) => (
    <Show when={props.options.showPitWindow}>
      <div class="fuel-pit" classList={{ none: p.d.pitOpen <= 0 }}>
        <span>PİT PENCERESİ</span>
        <Show when={p.d.pitOpen > 0} fallback={<b class="ov-pos">{p.d.samples > 0 ? "Pit gerekmez" : "Ölçülüyor…"}</b>}>
          <b>
            Tur {p.d.pitOpen}–{p.d.pitClose}
          </b>
          <span class="ov-dim">
            {clock(p.d.pitOpenIn)} – {clock(p.d.pitCloseIn)}
          </span>
        </Show>
      </div>
    </Show>
  );
  const Refuel = (p: { d: FuelData }) => (
    <span class="fuel-refuel" classList={{ zero: mainRow(p.d).refuel <= 0 }}>
      {refuel(mainRow(p.d))}
    </span>
  );

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
    <div class={`ov-panel fuel fuel-d-${design()}`}>
      <Show when={data()} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        {(d) => (
          <Switch>
            <Match when={design() === "simple"}>
              <div class="ov-header fuel-title">
                <span>Yakıt</span>
                <span>Tur {d().lap}</span>
              </div>
              <div class="fuel-s-top">
                <div class="fuel-s-big">
                  <b>{fuel(d().level, props.units)}</b>
                  <span class="ov-dim">{u()}</span>
                </div>
                <div class="fuel-s-big r" classList={{ low: low(d()) }}>
                  <b>{lapsTxt(d())}</b>
                  <span class="ov-dim">tur</span>
                </div>
              </div>
              <div class="fuel-s-bar">
                <div classList={{ low: low(d()) }} style={{ width: `${pctW(d()) * 100}%` }} />
              </div>
              <div class="fuel-s-row">
                <span>
                  <span class="ov-dim">Bitişe </span>
                  <b>
                    {d().raceNeeded > 0 ? fuel(d().raceNeeded, props.units) : "—"} {u()}
                  </b>
                </span>
                <span>
                  <span class="ov-dim">İkmal </span>
                  <Refuel d={d()} />
                </span>
              </div>
              <Show when={rows().length > 0}>
                <div class="fuel-s-cons">
                  <For each={rows()}>
                    {(x) => (
                      <div>
                        <span class="fuel-rl">{x.label}</span>
                        <b>
                          {f(x.r.usage)} <small class="ov-dim">{u()}</small>
                        </b>
                        <span class="ov-dim">{x.r.laps > 0 ? `${x.r.laps.toFixed(1)} tur` : "—"}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <PitWindow d={d()} />
            </Match>
            <Match when={design() === "line"}>
              <div class="fuel-l">
                <svg class="fuel-l-ic" classList={{ low: low(d()) }} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3 C12 3 5.5 10.2 5.5 14.6 A6.5 6.5 0 0 0 18.5 14.6 C18.5 10.2 12 3 12 3 Z" />
                </svg>
                <b>
                  {fuel(d().level, props.units)} <small class="ov-dim">{u()}</small>
                </b>
                <i />
                <b classList={{ "fuel-low": low(d()) }}>
                  {lapsTxt(d())} <small class="ov-dim">tur</small>
                </b>
                <For each={rows()}>
                  {(x) => (
                    <>
                      <i />
                      <span>
                        <small class="ov-dim">{x.label}</small> <b>{f(x.r.usage)}</b>
                      </span>
                    </>
                  )}
                </For>
                <i />
                <span>
                  <small class="ov-dim">İKMAL</small> <Refuel d={d()} />
                </span>
              </div>
            </Match>
            <Match when={design() === "bar"}>
              <div class="fuel-b">
                <div class="fuel-b-bar">
                  <div class="fuel-b-txt">
                    <b>
                      {fuel(d().level, props.units)} {u()}
                    </b>
                    <b>{lapsTxt(d())} tur</b>
                  </div>
                  <div class="fuel-b-fill" classList={{ low: low(d()) }} style={{ width: `${pctW(d()) * 100}%` }}>
                    <div class="fuel-b-txt" style={{ width: `${100 / Math.max(0.01, pctW(d()))}%` }}>
                      <b>
                        {fuel(d().level, props.units)} {u()}
                      </b>
                      <b>{lapsTxt(d())} tur</b>
                    </div>
                  </div>
                </div>
                <div class="fuel-chips">
                  <For each={rows()}>
                    {(x) => (
                      <div class="fuel-chip">
                        <small>{x.label}</small>
                        <b>{f(x.r.usage)}</b>
                      </div>
                    )}
                  </For>
                  <div class="fuel-chip">
                    <small>İKMAL</small>
                    <Refuel d={d()} />
                  </div>
                </div>
              </div>
              <PitWindow d={d()} />
            </Match>
            <Match when={design() === "gauge"}>
              <div class="fuel-g">
                <svg viewBox="0 0 200 116" classList={{ low: low(d()) }}>
                  <path class="fuel-g-track" d="M16 104 A84 84 0 0 1 184 104" />
                  <path class="fuel-g-res" d="M16 104 A84 84 0 0 1 184 104" pathLength="100" stroke-dasharray="12 100" />
                  <path class="fuel-g-fill" d="M16 104 A84 84 0 0 1 184 104" pathLength="100" stroke-dasharray={`${pctW(d()) * 100} 100`} />
                  <For each={[0, 0.25, 0.5, 0.75, 1]}>
                    {(k) => (
                      <line
                        class="fuel-g-tick"
                        classList={{ major: k === 0 || k === 0.5 || k === 1 }}
                        x1="100"
                        y1="32"
                        x2="100"
                        y2={k === 0 || k === 0.5 || k === 1 ? 42 : 38}
                        transform={`rotate(${-90 + k * 180} 100 104)`}
                      />
                    )}
                  </For>
                  <text class="fuel-g-lbl" x="34" y="102">E</text>
                  <text class="fuel-g-lbl" x="166" y="102">F</text>
                  <g class="fuel-g-needle" style={{ transform: `rotate(${-90 + pctW(d()) * 180}deg)` }}>
                    <path d="M100 30 L103.5 100 L96.5 100 Z" />
                  </g>
                  <circle class="fuel-g-hub" cx="100" cy="104" r="8" />
                </svg>
                <div class="fuel-g-read">
                  <div>
                    <b>{fuel(d().level, props.units)}</b>
                    <small class="ov-dim">{u()}</small>
                  </div>
                  <div classList={{ "fuel-low": low(d()) }}>
                    <b>{lapsTxt(d())}</b>
                    <small class="ov-dim">tur</small>
                  </div>
                  <div>
                    <Refuel d={d()} />
                    <small class="ov-dim">ikmal</small>
                  </div>
                </div>
              </div>
              <Chips />
              <PitWindow d={d()} />
            </Match>
            <Match when={design() === "classic"}>
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

            <Show when={props.options.showTable && rows().length > 0}>
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

            <PitWindow d={d()} />
            </Match>
          </Switch>
        )}
      </Show>
      <Show when={data()?.samples === 0 && design() !== "line"}>
        <div class="fuel-note ov-dim">Tüketim için temiz bir tur tamamla</div>
      </Show>
      <Show when={props.options.showTeam && design() !== "line"}>
        <TeamFuel units={props.units} hideMe={props.options.teamHideMe} />
      </Show>
    </div>
  );
}
