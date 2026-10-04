import { For, Match, Show, Switch, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { useTopic } from "@/sdk/telemetry";
import type { TireCorner } from "@/sdk/types";
import "./style.css";

const NAMES = ["SÖ", "SAÖ", "SA", "SAA"];
const UNIT: Record<string, string> = { kpa: "kPa", psi: "psi", bar: "bar" };
const TITLES = ["Sol ön", "Sağ ön", "Sol arka", "Sağ arka"];

/** Soğuk -> mavi, ideal -> yeşil, sıcak -> kırmızı */
function heat(t: number, cold: number, hot: number) {
  if (t <= 0) return "var(--ov-line)";
  const mid = (cold + hot) / 2;
  if (t < cold) return "var(--ov-blue)";
  if (t > hot) return "var(--ov-red)";
  const k = Math.abs(t - mid) / ((hot - cold) / 2);
  return k < 0.6 ? "var(--ov-green)" : "var(--ov-yellow)";
}

function wearColor(w: number) {
  if (w < 0) return "var(--ov-dim)";
  if (w < 0.3) return "var(--ov-red)";
  if (w < 0.6) return "var(--ov-yellow)";
  return "var(--ov-green)";
}

const DESIGNS = ["grid", "cards", "bars", "car"] as const;
type Design = (typeof DESIGNS)[number];

/** Üstten görünümde lastiklerin konumu (viewBox 0 0 120 200): SÖ, SAÖ, SA, SAA */
const TYRE_XY: [number, number][] = [
  [5, 26],
  [91, 26],
  [5, 128],
  [91, 128],
];

export default function Tires(props: OverlayProps) {
  // Bilinmeyen ya da kullanıcıya kilitli (PRO) tasarım varsayılana düşer
  const design = createMemo<Design>(() => {
    const v = props.options.design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("tires", "design", v) ? v : "grid";
  });
  const d = useTopic("tires");
  const st = useTopic("status");
  const metric = () => props.units === "metric";
  /** "Sadece pitteyken göster" (varsayılan açık): pistteyken gizli; düzenleme modunda / önizlemede hep görünür */
  // Demo'da (ekranda ve OBS'te) pit beklenmeden gösterilir: yerleşim ve görünüm denenebilsin
  const visible = () => props.editing || props.options.onlyPit === false || !!d()?.onPit || !!st()?.demo;

  const t = (c: number) => (c <= 0 ? "-" : metric() ? c.toFixed(0) : (c * 1.8 + 32).toFixed(0));
  const press = (kpa: number) => {
    if (kpa <= 0) return "-";
    switch (props.options.pressUnit) {
      case "kpa":
        return kpa.toFixed(0);
      case "bar":
        return (kpa / 100).toFixed(2);
      default:
        return (kpa * 0.145038).toFixed(1);
    }
  };
  const avgWear = (c: TireCorner) => (c.wear[1] < 0 ? -1 : (c.wear[0] + c.wear[1] + c.wear[2]) / 3);
  const avgTemp = (c: TireCorner) => {
    const v = c.temp.filter((x) => x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const hc = (v: number) => heat(v, props.options.cold, props.options.hot);
  const wearTxt = (w: number) => (w < 0 ? "-" : `${(w * 100).toFixed(0)}%`);
  const pUnit = () => UNIT[props.options.pressUnit as string] ?? "psi";

  /** Köşe bilgisi (üstten görünümün iki yanında) */
  const Info = (p: { c: TireCorner; i: number }) => (
    <div class="ty-info" classList={{ r: p.i % 2 === 1 }} title={TITLES[p.i]}>
      <Show when={props.options.showTemp}>
        <b class="ty-big" style={{ color: hc(avgTemp(p.c)) }}>
          {t(avgTemp(p.c))}°
        </b>
      </Show>
      <Show when={props.options.showWear}>
        <span class="ov-mono" style={{ color: wearColor(avgWear(p.c)) }}>
          {wearTxt(avgWear(p.c))}
        </span>
      </Show>
      <Show when={props.options.showPressure}>
        <span class="ov-dim">
          <span class="ov-mono">{press(p.c.press)}</span> {pUnit()}
        </span>
      </Show>
    </div>
  );

  return (
    <Show when={visible()}>
    <div class={`ov-panel ty ty-d-${design()}`}>
      <div class="ov-header ty-head">
        <span>Lastikler</span>
        <Show when={d()}>
          <span class="ov-dim">
            {d()!.compound > 0 ? "Yağmur" : d()!.compound === 0 ? "Kuru" : ""}
            {d()!.onPit ? " · pit" : ""}
          </span>
        </Show>
      </div>
      <Show when={d()?.available} fallback={<div class="ov-empty">Lastik verisi pitte güncellenir</div>}>
        <Switch>
          <Match when={design() === "cards"}>
            <div class="ty-cards">
              <For each={d()!.corners}>
                {(c, i) => (
                  <div class="ty-card" title={TITLES[i()]}>
                    <div class="ty-strip">
                      <For each={c.temp}>{(v) => <i style={{ background: hc(v) }} />}</For>
                    </div>
                    <div class="ty-card-top">
                      <span class="ty-name ov-dim">{NAMES[i()]}</span>
                      <Show when={props.options.showTemp}>
                        <b class="ty-big">{t(avgTemp(c))}°</b>
                      </Show>
                    </div>
                    <Show when={props.options.showWear || props.options.showPressure}>
                      <div class="ty-card-bot">
                        <Show when={props.options.showWear}>
                          <span class="ov-mono" style={{ color: wearColor(avgWear(c)) }}>
                            {wearTxt(avgWear(c))}
                          </span>
                        </Show>
                        <Show when={props.options.showPressure}>
                          <span class="ov-dim">
                            <span class="ov-mono">{press(c.press)}</span> {pUnit()}
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Match>
          <Match when={design() === "bars"}>
            <div class="ty-rows">
              <For each={d()!.corners}>
                {(c, i) => (
                  <div class="ty-rowl" title={TITLES[i()]}>
                    <span class="ty-name ov-dim">{NAMES[i()]}</span>
                    <div class="ty-bar">
                      <Show when={props.options.showWear}>
                        <i style={{ width: `${Math.max(0, avgWear(c)) * 100}%`, background: wearColor(avgWear(c)) }} />
                      </Show>
                    </div>
                    <Show when={props.options.showWear}>
                      <span class="ov-mono ty-num">{wearTxt(avgWear(c))}</span>
                    </Show>
                    <Show when={props.options.showTemp}>
                      <span class="ov-mono ty-num">
                        <i class="ty-dot" style={{ background: hc(avgTemp(c)) }} />
                        {t(avgTemp(c))}°
                      </span>
                    </Show>
                    <Show when={props.options.showPressure}>
                      <span class="ov-mono ov-dim ty-num">{press(c.press)}</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Match>
          <Match when={design() === "car"}>
            <div class="ty-car">
              <div class="ty-side">
                <Info c={d()!.corners[0]} i={0} />
                <Info c={d()!.corners[2]} i={2} />
              </div>
              <svg viewBox="0 0 120 200" aria-hidden="true">
                <path class="ty-axle" d="M17 49 H103 M17 151 H103" />
                <path
                  class="ty-body"
                  d="M60 6 C74 6 80 14 81 30 L84 150 C84 176 78 192 60 192 C42 192 36 176 36 150 L39 30 C40 14 46 6 60 6 Z"
                />
                <path class="ty-glass" d="M45 66 Q60 58 75 66 L72 92 Q60 88 48 92 Z M48 128 Q60 124 72 128 L74 146 Q60 152 46 146 Z" />
                <For each={d()!.corners}>
                  {(c, i) => (
                    <g transform={`translate(${TYRE_XY[i()][0]} ${TYRE_XY[i()][1]})`}>
                      <clipPath id={`ty-clip-${i()}`}>
                        <rect width="24" height="46" rx="5" />
                      </clipPath>
                      <g clip-path={`url(#ty-clip-${i()})`}>
                        <For each={c.temp}>{(v, k) => <rect x={k() * 8} width="8" height="46" fill={hc(v)} />}</For>
                      </g>
                      <rect class="ty-rim" width="24" height="46" rx="5" />
                    </g>
                  )}
                </For>
              </svg>
              <div class="ty-side">
                <Info c={d()!.corners[1]} i={1} />
                <Info c={d()!.corners[3]} i={3} />
              </div>
            </div>
          </Match>
          <Match when={design() === "grid"}>
            <div class="ty-grid">
              <For each={d()!.corners}>
                {(c, i) => {
                  const w = () => avgWear(c);
                  return (
                    <div class="ty-corner" title={TITLES[i()]}>
                      <div class="ty-name ov-dim">{NAMES[i()]}</div>
                      <Show when={props.options.showTemp}>
                        <div class="ty-temps">
                          <For each={c.temp}>
                            {(v) => (
                              <div class="ty-cell" style={{ background: heat(v, props.options.cold, props.options.hot) }}>
                                <span>{t(v)}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={props.options.showWear}>
                        <div class="ty-wear">
                          <div class="ty-bar">
                            <i style={{ width: `${Math.max(0, w()) * 100}%`, background: wearColor(w()) }} />
                          </div>
                          <span class="ov-mono">{w() < 0 ? "-" : `${(w() * 100).toFixed(0)}%`}</span>
                        </div>
                      </Show>
                      <Show when={props.options.showPressure}>
                        <div class="ty-press ov-dim">
                          <span class="ov-mono">{press(c.press)}</span> {UNIT[props.options.pressUnit as string] ?? "psi"}
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
    </Show>
  );
}
