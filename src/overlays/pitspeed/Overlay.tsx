import { Match, Show, Switch, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { useTopic, demoShow } from "@/sdk/telemetry";
import { speed, speedUnit } from "@/sdk/format";
import "./style.css";

const DESIGNS = ["default", "big", "strip", "diff", "sign", "gauge"] as const;
type Design = (typeof DESIGNS)[number];

export default function PitSpeed(props: OverlayProps) {
  const p = useTopic("pit");
  // Bilinmeyen ya da kullanıcıya kilitli (PRO) tasarım varsayılana düşer
  const design = createMemo<Design>(() => {
    const v = props.options.design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("pitspeed", "design", v) ? v : "default";
  });
  const active = () => props.editing || demoShow() || props.options.show === "always" || !!(p()?.onPitRoad || p()?.approaching);
  const limit = () => p()?.limit ?? 0;
  const v = () => p()?.speed ?? 0;
  const margin = () => ((props.options.margin as number) ?? 2) / 3.6;
  const inPit = () => !!(p()?.onPitRoad || p()?.approaching);
  const state = () => {
    if (limit() <= 0 || (!inPit() && !props.editing)) return "ok";
    if (v() > limit() + 0.15) return "over";
    if (v() > limit() - margin()) return "near";
    return "ok";
  };
  const ratio = () => (limit() > 0 ? Math.min(1.2, v() / limit()) / 1.2 : 0);
  const limiterOff = () => props.options.warnLimiter && p() && !p()!.limiter && (p()!.onPitRoad || p()!.approaching);
  const lim = () => (limit() > 0 ? speed(limit(), props.units) : "—");
  const spd = () => speed(v(), props.units);
  const un = () => speedUnit(props.units);
  /** Sınıra fark (gösterim biriminde, tam sayı) */
  const diff = () => {
    if (limit() <= 0) return "—";
    const d = Number(spd()) - Number(lim());
    return (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d);
  };
  const Bar = () => (
    <div class="pspd-bar">
      <div class="pspd-fill" style={{ width: `${ratio() * 100}%` }} />
      <div class="pspd-mark" style={{ left: `${(1 / 1.2) * 100}%` }} />
    </div>
  );

  return (
    <Show when={active()}>
      <div class={`ov-panel pspd pspd-${state()} pspd-d-${design()}`}>
        <Switch>
          <Match when={design() === "default"}>
            <div class="pspd-top">
              <span class="pspd-cap">PİT</span>
              <span class="pspd-lim">
                Sınır <b>{lim()}</b> {un()}
              </span>
            </div>
            <div class="pspd-speed">
              <b>{spd()}</b>
              <span>{un()}</span>
            </div>
            <Bar />
          </Match>
          <Match when={design() === "big"}>
            <div class="pspd-top">
              <span class="pspd-cap">PİT</span>
              <span class="pspd-lim">
                Sınır <b>{lim()}</b>
              </span>
            </div>
            <div class="pspd-huge">
              <b>{spd()}</b>
              <span>{un()}</span>
            </div>
          </Match>
          <Match when={design() === "strip"}>
            <div class="pspd-row">
              <span class="pspd-cap">PİT</span>
              <b class="pspd-now">{spd()}</b>
              <Bar />
              <span class="pspd-lim">
                <b>{lim()}</b> {un()}
              </span>
            </div>
          </Match>
          <Match when={design() === "diff"}>
            <div class="pspd-top">
              <span class="pspd-cap">PİT</span>
              <span class="pspd-lim">
                <b>{spd()}</b> / {lim()} {un()}
              </span>
            </div>
            <div class="pspd-huge">
              <b>{diff()}</b>
              <span>{un()}</span>
            </div>
            <Bar />
          </Match>
          <Match when={design() === "sign"}>
            <div class="pspd-signrow">
              <div class="pspd-sign">
                <b>{lim()}</b>
              </div>
              <div class="pspd-signval">
                <span class="pspd-cap">PİT</span>
                <div class="pspd-speed">
                  <b>{spd()}</b>
                  <span>{un()}</span>
                </div>
              </div>
            </div>
            <Bar />
          </Match>
          <Match when={design() === "gauge"}>
            <div class="pspd-gauge">
              <svg viewBox="0 0 200 112">
                <path class="pspd-g-track" d="M16 104 A84 84 0 0 1 184 104" />
                <path class="pspd-g-fill" d="M16 104 A84 84 0 0 1 184 104" pathLength="100" stroke-dasharray={`${ratio() * 100} 100`} />
                <line class="pspd-g-mark" x1="100" y1="8" x2="100" y2="32" transform="rotate(60 100 104)" />
              </svg>
              <div class="pspd-g-read">
                <b>{spd()}</b>
                <span>
                  Sınır {lim()} {un()}
                </span>
              </div>
            </div>
          </Match>
        </Switch>
        <Show when={limiterOff()}>
          <div class="pspd-warn">SINIRLAYICI KAPALI</div>
        </Show>
        <Show when={p()?.limiter}>
          <div class="pspd-on">Sınırlayıcı açık</div>
        </Show>
      </div>
    </Show>
  );
}
