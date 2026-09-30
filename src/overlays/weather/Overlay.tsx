import { For, Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { pct, temp, wind, windUnit } from "@/sdk/format";
import { WETNESS } from "@/sdk/types";
import "./style.css";

const DEG = 180 / Math.PI;

export default function Weather(props: OverlayProps) {
  const w = useTopic("weather");

  // Pusula dönüşü: araca göre modda gidiş yönü yukarıda
  const dial = () => (props.options.relative ? -(w()?.heading ?? 0) * DEG : 0);
  // Ok rüzgârın estiği yönü gösterir (geldiği yönün tersi)
  const arrow = () => (w()?.windDir ?? 0) * DEG + 180;

  const rows = () => {
    const d = w()!;
    return [
      { k: "PİST", v: temp(d.trackTemp, props.units) },
      { k: "HAVA", v: temp(d.airTemp, props.units) },
      { k: "RÜZGÂR", v: `${wind(d.windVel, props.units)} ${windUnit(props.units)}` },
      { k: "NEM", v: pct(d.humidity) },
      { k: "YAĞIŞ", v: pct(d.precip) },
    ];
  };

  return (
    <div class="ov-panel wx">
      <div class="ov-header wx-title">
        <span>Canlı Hava</span>
      </div>
      <Show when={w()} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        <Show when={props.options.showCompass}>
          <div class="wx-compass">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="46" class="wx-ring" />
              <g transform={`rotate(${dial()} 60 60)`}>
                <For each={[["K", 0], ["D", 90], ["G", 180], ["B", 270]] as [string, number][]}>
                  {([l, a]) => (
                    <text
                      x={60 + Math.sin(a / DEG) * 34}
                      y={60 - Math.cos(a / DEG) * 34 + 4}
                      class="wx-card"
                      classList={{ north: l === "K" }}
                    >
                      {l}
                    </text>
                  )}
                </For>
                <g transform={`rotate(${arrow()} 60 60)`}>
                  <path d="M60 36 L69 54 L63 52 L63 80 L57 80 L57 52 L51 54 Z" class="wx-arrow" />
                </g>
              </g>
              <Show when={props.options.relative}>
                <path d="M60 4 L65 12 L55 12 Z" class="wx-car" />
              </Show>
            </svg>
            <div class="wx-speed">
              <b>{wind(w()!.windVel, props.units)}</b> {windUnit(props.units)}
            </div>
          </div>
        </Show>
        <div class="wx-rows">
          <For each={rows()}>
            {(r) => (
              <div class="wx-row">
                <span>{r.k}</span>
                <b>{r.v}</b>
              </div>
            )}
          </For>
        </div>
        <Show when={props.options.showWetness}>
          <div class="wx-wet">
            <div class="wx-bar">
              <div style={{ width: `${Math.max(0, (w()!.wetness - 1) / 6) * 100}%` }} />
            </div>
            <div class="wx-row">
              <span>PİST</span>
              <b>{WETNESS[w()!.wetness] || "—"}</b>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
