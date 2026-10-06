// Pedallar & Girdi overlay'inin ek tasarımları (özgün çizimler; hiçbir ürünün görseli / adı / logosu kullanılmaz).
//   trace → Telemetri grafiği + çubuklar
//   sim   → Sim tarzı (klasik)
//   wide  → Geniş grafik
// Grafiksiz tasarımlar (çubuklar, şeritler, halkalar, pedal seti, HUD...) ayrı bir overlay oldu: src/overlays/pedals.
// Ortak parçalar (model, iz grafiği, çubuklar, direksiyon): ./shared.tsx

import { Match, Show, Switch } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { t } from "@/sdk/i18n";
import { Bars, CLUTCH, SteerBar, Trace, Wheel, createModel, n100, type Model } from "./shared";

export const DESIGNS = ["trace", "sim", "wide"] as const;
export type Design = (typeof DESIGNS)[number];
export const isDesign = (v: unknown): v is Design => DESIGNS.includes(v as Design);

// ---------------------------------------------------------------------------------------------------------
// Telemetri grafiği + çubuklar
// ---------------------------------------------------------------------------------------------------------
function TraceDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-tr" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showTrace}>
        <Trace m={m} w={300} h={84} fit />
      </Show>
      <Bars m={m} h={m.showPct() ? 68 : 84} />
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-side">
          <Show when={m.o.showGear}>
            <b class="inx-gear">{m.gear()}</b>
            <span class="inx-speed">
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </Show>
          <Show when={m.o.showSteer}>
            <Wheel m={m} />
          </Show>
        </div>
      </Show>
    </div>
  );
}
// ---------------------------------------------------------------------------------------------------------
// Sim tarzı (klasik): küçük siyah kutu; iz grafiği, sayılı dikey debriyaj / fren / gaz çubukları,
// dönen direksiyonun ortasında vites, altında hız.
// ---------------------------------------------------------------------------------------------------------
function SimDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-sim" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showTrace}>
        <Trace m={m} w={200} h={72} grid="sim" class="inx-simtrace" fit />
      </Show>
      <Bars m={m} h={m.showPct() ? 58 : 72} />
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-simdial">
          <div class="inx-simwheel">
            <Show when={m.o.showSteer}>
              <svg viewBox="-30 -30 60 60" class="inx-simrim" style={{ transform: `rotate(${-m.steer()}rad)` }}>
                <circle r="25" class="inx-simring" />
                <path d="M -24 3 L -15 2 M 24 3 L 15 2 M 0 15 L 0 24" class="inx-simspoke" />
                <rect x="-2.6" y="-29" width="5.2" height="8" rx="1" class="inx-simtop" style={{ fill: m.wheelAccent() }} />
              </svg>
            </Show>
            <Show when={m.o.showGear}>
              <b class="inx-simgear">{m.gear()}</b>
            </Show>
          </div>
          <Show when={m.o.showGear}>
            <span class="inx-simspeed">
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </Show>
          <Show when={m.o.showSteer && m.o.showSteerDeg}>
            <small class="inx-deg">{m.steerDeg()}°</small>
          </Show>
        </div>
      </Show>
    </div>
  );
}
// ---------------------------------------------------------------------------------------------------------
// Geniş grafik: tek parça geniş iz; değerler grafiğin üstünde, vites / hız köşede
// ---------------------------------------------------------------------------------------------------------
function WideDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-wd" classList={{ shift: m.shiftOn() }}>
      <div class="inx-wdbox">
        <Trace m={m} w={420} h={78} grid="sim" fit />
        <div class="inx-wdleg">
          <span style={{ color: m.thrFill() }} classList={{ glow: m.tcFrame() }}>
            {t("Gaz")}
            <Show when={m.showPct()}>
              <b>{n100(m.throttle())}%</b>
            </Show>
          </span>
          <span style={{ color: m.brakeFill() }} classList={{ glow: m.absFrame() }}>
            {t("Fren")}
            <Show when={m.showPct()}>
              <b>{n100(m.brake())}%</b>
            </Show>
          </span>
          <Show when={m.o.showClutch}>
            <span style={{ color: CLUTCH }}>
              {t("Debriyaj")}
              <Show when={m.showPct()}>
                <b>{n100(m.clutch())}%</b>
              </Show>
            </span>
          </Show>
        </div>
        <Show when={m.o.showGear}>
          <div class="inx-wdgear">
            <b>{m.gear()}</b>
            <span>
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </div>
        </Show>
      </div>
      <Show when={m.o.showSteer}>
        <SteerBar m={m} class="inx-wdsteer" />
      </Show>
    </div>
  );
}
export function DesignView(props: OverlayProps & { design: Design }) {
  const m = createModel(props);
  return (
    <Switch>
      <Match when={props.design === "trace"}>
        <TraceDesign m={m} />
      </Match>
      <Match when={props.design === "sim"}>
        <SimDesign m={m} />
      </Match>
      <Match when={props.design === "wide"}>
        <WideDesign m={m} />
      </Match>
    </Switch>
  );
}
