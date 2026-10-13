import { For, Match, Show, Switch, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { useTopic } from "@/sdk/telemetry";
import { lapTime, signed } from "@/sdk/format";
import "./style.css";

const DESIGNS = ["bar", "center", "number", "line", "split", "arc", "pill", "vertical", "leds", "tape"] as const;
/** Dar tasarımlar: tur süreleri etiket üstte, süre altta (üç sütun) */
const NARROW: Design[] = ["number", "arc", "pill", "vertical"];
const LEDS = 10;
type Design = (typeof DESIGNS)[number];

export default function Delta(props: OverlayProps) {
  const data = useTopic("delta");

  // Bilinmeyen ya da kullanıcıya kilitli (PRO) tasarım varsayılana düşer
  const design = createMemo<Design>(() => {
    const v = props.options.design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("delta", "design", v) ? v : "bar";
  });

  const ratio = () => {
    const d = data();
    if (!d || !d.valid) return 0;
    const r = (props.options.range as number) || 1.5;
    return Math.max(-1, Math.min(1, d.delta / r));
  };
  const mag = () => Math.abs(ratio());
  // Negatif delta = daha hızlı = yeşil, sağa doğru büyür
  const faster = () => (data()?.delta ?? 0) < 0;
  const range = () => (props.options.range as number) || 1.5;
  /** Çubuk / gösterge açık mı (kapalıyken sadece sayı) */
  const bar = () => props.options.showBar !== false && design() !== "number";
  const timeOn = (k: string) => props.options.showTimes !== false && props.options[k] !== false;
  const anyTime = () => timeOn("showCurrent") || timeOn("showLast") || timeOn("showBest");
  /** Kayan cetvel: merkez = anlık fark; 0.1 sn'de bir çizgi, 0.5 sn'de bir etiket */
  const ticks = createMemo(() => {
    const d = data()?.valid ? data()!.delta : 0;
    const r = range();
    const out: { x: number; t: number; major: boolean }[] = [];
    const a = Math.ceil((d - r) * 10);
    const b = Math.floor((d + r) * 10);
    for (let i = a; i <= b && out.length < 120; i++) {
      out.push({ x: 150 + ((i / 10 - d) / r) * 150, t: i / 10, major: i % 5 === 0 });
    }
    return out;
  });
  const trend = () => {
    const t = data()?.trend ?? 0;
    return t < -0.005 ? "▲" : t > 0.005 ? "▼" : "";
  };

  const Value = () => (
    <div class="dl-value ov-mono" classList={{ "ov-pos": faster(), "ov-neg": !faster() }}>
      <Show when={data()?.valid} fallback={<span class="ov-dim">—.——</span>}>
        {signed(data()!.delta)}
        <Show when={props.options.showTrend !== false}>
          <span class="dl-trend">{trend()}</span>
        </Show>
      </Show>
    </div>
  );
  /** Ortadan iki yana büyüyen çubuk */
  const Bar = () => (
    <div class="dl-bar">
      <div class="dl-mid" />
      <div
        class="dl-fill"
        classList={{ fast: faster(), slow: !faster() }}
        style={{
          left: faster() ? "50%" : `${50 - mag() * 50}%`,
          width: `${mag() * 50}%`,
        }}
      />
    </div>
  );

  return (
    <div
      class={`ov-panel dl dl-d-${design()}`}
      classList={{ fast: !!data()?.valid && faster(), slow: !!data()?.valid && !faster(), "dl-nobar": !bar(), "dl-narrow": NARROW.includes(design()) }}
    >
      <Switch>
        <Match when={!bar() && design() !== "pill"}>
          <div class="dl-n">
            <Value />
          </div>
        </Match>
        <Match when={design() === "bar"}>
          <div class="dl-top">
            <Bar />
            <Value />
          </div>
        </Match>
        <Match when={design() === "center"}>
          <div class="dl-c">
            <Value />
            <Bar />
            <div class="dl-scale ov-dim ov-mono">
              <span>+{range().toFixed(1)}</span>
              <span>0</span>
              <span>−{range().toFixed(1)}</span>
            </div>
          </div>
        </Match>
        <Match when={design() === "number"}>
          <div class="dl-n">
            <Value />
          </div>
        </Match>
        <Match when={design() === "line"}>
          <div class="dl-l">
            <Value />
            <Bar />
          </div>
        </Match>
        <Match when={design() === "split"}>
          <div class="dl-s">
            <div class="dl-half l">
              <div style={{ width: `${faster() ? 0 : mag() * 100}%` }} />
            </div>
            <Value />
            <div class="dl-half r">
              <div style={{ width: `${faster() ? mag() * 100 : 0}%` }} />
            </div>
          </div>
        </Match>
        <Match when={design() === "arc"}>
          <div class="dl-a">
            <svg viewBox="0 0 200 104">
              <path class="dl-a-track" d="M14 98 A86 86 0 0 1 186 98" />
              <path class="dl-a-fill slow" d="M100 12 A86 86 0 0 0 14 98" pathLength="100" stroke-dasharray={`${faster() ? 0 : mag() * 100} 100`} />
              <path class="dl-a-fill fast" d="M100 12 A86 86 0 0 1 186 98" pathLength="100" stroke-dasharray={`${faster() ? mag() * 100 : 0} 100`} />
              <line class="dl-a-mid" x1="100" y1="3" x2="100" y2="21" />
            </svg>
            <Value />
          </div>
        </Match>
        <Match when={design() === "pill"}>
          <div class="dl-p" style={{ "--m": data()?.valid ? (bar() ? 0.25 + mag() * 0.75 : 0.45) : 0 }}>
            <Value />
          </div>
        </Match>
        <Match when={design() === "vertical"}>
          <div class="dl-v">
            <div class="dl-vbar">
              <div class="dl-vmid" />
              <div
                class="dl-vfill"
                classList={{ fast: faster(), slow: !faster() }}
                style={{ bottom: faster() ? "50%" : `${50 - mag() * 50}%`, height: `${mag() * 50}%` }}
              />
            </div>
            <Value />
          </div>
        </Match>
        <Match when={design() === "leds"}>
          <div class="dl-leds">
            <div class="dl-ledrow">
              <For each={Array.from({ length: LEDS }, (_, i) => LEDS - i)}>
                {(n) => <i class="led slow" classList={{ on: !faster() && mag() * LEDS >= n - 0.5 }} />}
              </For>
              <b class="dl-ledmid" />
              <For each={Array.from({ length: LEDS }, (_, i) => i + 1)}>
                {(n) => <i class="led fast" classList={{ on: faster() && mag() * LEDS >= n - 0.5 }} />}
              </For>
            </div>
            <Value />
          </div>
        </Match>
        <Match when={design() === "tape"}>
          <div class="dl-tape">
            <Value />
            <svg viewBox="0 0 300 34" preserveAspectRatio="none">
              <rect class="dl-tape-bg" x="0" y="0" width="300" height="34" />
              <For each={ticks()}>
                {(k) => (
                  <>
                    <line
                      class="dl-tick"
                      classList={{ major: k.major, neg: k.t < 0, pos: k.t > 0 }}
                      x1={k.x}
                      x2={k.x}
                      y1={k.major ? 4 : 10}
                      y2={k.major ? 20 : 16}
                    />
                    <Show when={k.major}>
                      <text class="dl-tick-t" x={k.x} y="31">
                        {k.t === 0 ? "0" : `${k.t > 0 ? "+" : "−"}${Math.abs(k.t).toFixed(1)}`}
                      </text>
                    </Show>
                  </>
                )}
              </For>
              <path class="dl-tape-ptr" classList={{ fast: faster(), slow: !faster() }} d="M144 0 L156 0 L150 9 Z" />
              <line class="dl-tape-ptr-l" classList={{ fast: faster(), slow: !faster() }} x1="150" x2="150" y1="0" y2="24" />
            </svg>
          </div>
        </Match>
      </Switch>
      <Show when={anyTime()}>
        <div class="dl-times ov-mono">
          <Show when={timeOn("showCurrent")}>
            <span>
              <label>Şimdi</label>
              {lapTime(data()?.current, 1)}
            </span>
          </Show>
          <Show when={timeOn("showLast")}>
            <span>
              <label>Son</label>
              {lapTime(data()?.last)}
            </span>
          </Show>
          <Show when={timeOn("showBest")}>
            <span class="dl-best">
              <label>En iyi</label>
              {lapTime(data()?.best)}
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
