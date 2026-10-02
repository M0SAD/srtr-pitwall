import { For, Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
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

export default function Tires(props: OverlayProps) {
  const d = useTopic("tires");
  const metric = () => props.units === "metric";

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

  return (
    <div class="ov-panel ty">
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
      </Show>
    </div>
  );
}
