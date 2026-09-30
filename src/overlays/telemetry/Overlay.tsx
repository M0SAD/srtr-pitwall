import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { gear, lapTime, speed, speedUnit, temp } from "@/sdk/format";
import "./style.css";

const R = 42;
const C = 2 * Math.PI * R;
// Halka yayı: alt tarafta boşluk bırakan 270°
const ARC = 0.75;

export default function Telemetry(props: OverlayProps) {
  const d = useTopic("telemetry");

  const rpmFrac = () => {
    const t = d();
    if (!t || t.redline <= 0) return 0;
    return Math.max(0, Math.min(1, t.rpm / t.redline));
  };

  // Devir ışıkları: ilk ışık..son ışık arasında doldurulur; yanıp sönme devrinde hepsi mavi yanar
  const leds = createMemo(() => {
    const t = d();
    const n = props.options.leds as number;
    if (!t) return { lit: 0, blink: false, n };
    const span = Math.max(1, t.slLast - t.slFirst);
    const lit = Math.max(0, Math.min(n, Math.ceil(((t.rpm - t.slFirst) / span) * n)));
    return { lit, blink: t.rpm >= t.slBlink && t.slBlink > 0, n };
  });

  const ledColor = (i: number, n: number) => {
    const f = (i + 1) / n;
    return f <= 0.45 ? "var(--ov-green)" : f <= 0.8 ? "var(--ov-yellow)" : "var(--ov-red)";
  };

  const ringColor = () => (leds().blink ? "var(--ov-blue)" : rpmFrac() > 0.9 ? "var(--ov-red)" : "var(--ov-green)");
  const fmt = (v: number, digits = 0) => (v >= 0 ? v.toFixed(digits) : "—");

  return (
    <div class="ov-theme tel">
      <div class="tel-gear">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="48" class="tel-gear-bg" />
          <circle
            cx="50"
            cy="50"
            r={R}
            class="tel-ring-track"
            stroke-dasharray={`${C * ARC} ${C}`}
            transform="rotate(135 50 50)"
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            class="tel-ring"
            style={{ stroke: ringColor() }}
            stroke-dasharray={`${C * ARC * rpmFrac()} ${C}`}
            transform="rotate(135 50 50)"
          />
        </svg>
        <span class="tel-g-prev">{(d()?.gear ?? 0) > 1 ? gear((d()?.gear ?? 0) - 1) : ""}</span>
        <b class="tel-g">{gear(d()?.gear ?? 0)}</b>
        <span class="tel-g-next">{(d()?.gear ?? 0) >= 0 ? gear((d()?.gear ?? 0) + 1) : ""}</span>
      </div>
      <div class="ov-panel tel-body">
        <div class="tel-top">
          <span class="tel-lbl">{speedUnit(props.units)}</span>
          <b class="tel-speed ov-mono">{speed(d()?.speed ?? 0, props.units)}</b>
          <div class="tel-leds" classList={{ blink: leds().blink }}>
            <For each={Array.from({ length: leds().n })}>
              {(_, i) => (
                <i
                  style={{
                    background: leds().blink
                      ? "var(--ov-blue)"
                      : i() < leds().lit
                        ? ledColor(i(), leds().n)
                        : undefined,
                  }}
                />
              )}
            </For>
          </div>
          <span class="tel-lbl">RPM</span>
          <b class="tel-rpm ov-mono">{Math.round(d()?.rpm ?? 0)}</b>
        </div>
        <div class="tel-bottom">
          <Show when={props.options.showPosition}>
            <span class="tel-item">
              <span class="tel-lbl">P</span>
              <b>{(d()?.classPosition ?? 0) > 0 ? d()!.classPosition : "—"}</b>
              <Show when={(d()?.posChange ?? 0) !== 0}>
                <span class="tel-chg" classList={{ up: d()!.posChange > 0, down: d()!.posChange < 0 }}>
                  {d()!.posChange > 0 ? "▲" : "▼"} {Math.abs(d()!.posChange)}
                </span>
              </Show>
            </span>
          </Show>
          <Show when={props.options.showLast}>
            <span class="tel-item">
              <span class="tel-lbl">SON</span>
              <b class="ov-mono">{lapTime(d()?.last)}</b>
            </span>
          </Show>
          <Show when={props.options.showFuel}>
            <span class="tel-item">
              <span class="tel-lbl">YAKIT</span>
              <b>{Math.round((d()?.fuelPct ?? 0) * 100)}%</b>
            </span>
          </Show>
          <Show when={props.options.showTemp}>
            <span class="tel-item">
              <span class="tel-lbl">PİST</span>
              <b>{temp(d()?.trackTemp ?? 0, props.units)}</b>
            </span>
          </Show>
          <Show when={props.options.showElectronics}>
            <span class="tel-item">
              <span class="tel-lbl">ABS</span>
              <b classList={{ "tel-abs": d()?.absActive }}>{fmt(d()?.abs ?? -1)}</b>
              <span class="tel-lbl">TC</span>
              <b>{fmt(d()?.tc ?? -1)}</b>
              <span class="tel-lbl">BB</span>
              <b>{fmt(d()?.brakeBias ?? -1, 1)}</b>
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}
