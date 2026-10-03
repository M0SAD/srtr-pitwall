import { For, Match, Show, Switch, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { useTopic } from "@/sdk/telemetry";
import { pct, temp, wind, windUnit } from "@/sdk/format";
import { WETNESS } from "@/sdk/types";
import { WxIcon, WxLabel, type WxKind } from "@/sdk/WxIcon";
import "./style.css";

const DEG = 180 / Math.PI;

const DESIGNS = ["default", "strip", "card", "tiles"] as const;
type Design = (typeof DESIGNS)[number];

export default function Weather(props: OverlayProps) {
  const w = useTopic("weather");
  // Bilinmeyen ya da kullanıcıya kilitli (PRO) tasarım varsayılana düşer
  const design = createMemo<Design>(() => {
    const v = props.options.design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("weather", "design", v) ? v : "default";
  });

  // Pusula dönüşü: araca göre modda gidiş yönü yukarıda
  const dial = () => (props.options.relative ? -(w()?.heading ?? 0) * DEG : 0);
  // Ok rüzgârın estiği yönü gösterir (geldiği yönün tersi)
  const arrow = () => (w()?.windDir ?? 0) * DEG + 180;

  const rows = () => {
    const d = w()!;
    return [
      { k: "PİST", ic: "track", v: temp(d.trackTemp, props.units) },
      { k: "HAVA", ic: "air", v: temp(d.airTemp, props.units) },
      { k: "RÜZGÂR", ic: "wind", v: `${wind(d.windVel, props.units)} ${windUnit(props.units)}` },
      { k: "NEM", ic: "humidity", v: pct(d.humidity) },
      { k: "YAĞIŞ", ic: "precip", v: pct(d.precip) },
    ] as { k: string; ic: WxKind; v: string }[];
  };

  /** Küçük rüzgâr oku (estiği yön; araca göre modda yukarı = gidiş yönü) */
  const WindArrow = () => (
    <svg class="wx-warrow" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${dial() + arrow()}deg)` }}>
      <path d="M12 2.5 L18 12 L13.6 10.8 L13.6 21.5 L10.4 21.5 L10.4 10.8 L6 12 Z" />
    </svg>
  );
  const wet = () => Math.max(0, Math.min(1, ((w()?.wetness ?? 1) - 1) / 6));
  const wetTxt = () => WETNESS[w()?.wetness ?? 0] || "—";
  const windTxt = () => `${wind(w()!.windVel, props.units)} ${windUnit(props.units)}`;

  return (
    <div class={`ov-panel wx wx-d-${design()}`}>
      <Show when={design() === "default" || design() === "tiles"}>
        <div class="ov-header wx-title">
          <span>Canlı Hava</span>
          <Show when={design() === "tiles" && w()}>
            <span class="ov-dim">{wetTxt()}</span>
          </Show>
        </div>
      </Show>
      <Show when={w()} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
       <Switch>
        <Match when={design() === "strip"}>
          <div class="wx-strip">
            <span>
              <WxLabel kind="track" text="PİST" mode={props.options.labelStyle} class="wx-k" />
              <b>{temp(w()!.trackTemp, props.units)}</b>
            </span>
            <span>
              <WxLabel kind="air" text="HAVA" mode={props.options.labelStyle} class="wx-k" />
              <b>{temp(w()!.airTemp, props.units)}</b>
            </span>
            <span>
              <WindArrow />
              <b>{windTxt()}</b>
            </span>
            <span>
              <WxLabel kind="humidity" text="NEM" mode={props.options.labelStyle} class="wx-k" />
              <b>{pct(w()!.humidity)}</b>
            </span>
            <Show when={props.options.showWetness}>
              <span>
                <WxLabel kind="wetness" text="ZEMİN" mode={props.options.labelStyle} class="wx-k" />
                <b>{wetTxt()}</b>
              </span>
            </Show>
          </div>
        </Match>
        <Match when={design() === "card"}>
          <div class="wx-card2">
            <div class="wx-t">
              <WxIcon kind="track" />
              <div>
                <b>{temp(w()!.trackTemp, props.units)}</b>
                <small>Pist</small>
              </div>
            </div>
            <div class="wx-t">
              <WxIcon kind="air" />
              <div>
                <b>{temp(w()!.airTemp, props.units)}</b>
                <small>Hava</small>
              </div>
            </div>
          </div>
          <div class="wx-foot">
            <span>
              <WindArrow />
              {windTxt()}
            </span>
            <span>
              <WxIcon kind="humidity" />
              {pct(w()!.humidity)}
            </span>
            <Show when={props.options.showWetness}>
              <span class="wx-foot-wet">
                <WxIcon kind="wetness" />
                {wetTxt()}
              </span>
            </Show>
          </div>
        </Match>
        <Match when={design() === "tiles"}>
          <div class="wx-tiles">
            <For each={rows()}>
              {(r) => (
                <div class="wx-tile">
                  <Show when={r.ic === "wind"} fallback={<WxIcon kind={r.ic} />}>
                    <WindArrow />
                  </Show>
                  <b>{r.v}</b>
                  <small>{r.k}</small>
                </div>
              )}
            </For>
            <div class="wx-tile">
              <WxIcon kind="wetness" />
              <b>{Math.round(wet() * 100)}%</b>
              <small>ISLAKLIK</small>
            </div>
          </div>
          <Show when={props.options.showWetness}>
            <div class="wx-wetline">
              <div style={{ width: `${wet() * 100}%` }} />
            </div>
          </Show>
        </Match>
        <Match when={design() === "default"}>
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
                <WxLabel kind={r.ic} text={r.k} mode={props.options.labelStyle} class="wx-k" />
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
              <WxLabel kind="wetness" text="ZEMİN" mode={props.options.labelStyle} class="wx-k" />
              <b>{WETNESS[w()!.wetness] || "—"}</b>
            </div>
          </div>
        </Show>
        </Match>
       </Switch>
      </Show>
    </div>
  );
}
