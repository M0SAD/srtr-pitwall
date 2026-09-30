import { Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { speed, speedUnit } from "@/sdk/format";
import "./style.css";

export default function PitSpeed(props: OverlayProps) {
  const p = useTopic("pit");
  const active = () => props.editing || props.options.show === "always" || !!(p()?.onPitRoad || p()?.approaching);
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

  return (
    <Show when={active()}>
      <div class={`ov-panel pspd pspd-${state()}`}>
        <div class="pspd-top">
          <span class="pspd-cap">PİT</span>
          <span class="pspd-lim">
            Sınır <b>{limit() > 0 ? speed(limit(), props.units) : "—"}</b> {speedUnit(props.units)}
          </span>
        </div>
        <div class="pspd-speed">
          <b>{speed(v(), props.units)}</b>
          <span>{speedUnit(props.units)}</span>
        </div>
        <div class="pspd-bar">
          <div class="pspd-fill" style={{ width: `${ratio() * 100}%` }} />
          <div class="pspd-mark" style={{ left: `${(1 / 1.2) * 100}%` }} />
        </div>
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
