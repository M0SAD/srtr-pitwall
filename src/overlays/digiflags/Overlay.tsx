import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import type { FlagName } from "@/sdk/types";
import "./style.css";

type Pattern = (x: number, y: number, n: number) => string | null;

const OFF = null;
const Y = "#ffd400";
const B = "#1f6bff";
const W = "#f4f7ff";
const G = "#1fd15a";
const R = "#ff2a2a";
const O = "#ff8a00";
const K = "#222"; // siyah bayrakta sönük kenar

// Önem sırasına göre bayraklar ve LED desenleri
const FLAGS: { names: FlagName[]; pattern: Pattern; blink?: boolean }[] = [
  { names: ["disqualify", "black"], pattern: (x, y, n) => (x === 0 || y === 0 || x === n - 1 || y === n - 1 ? W : K) },
  { names: ["red"], pattern: () => R },
  {
    names: ["repair"],
    pattern: (x, y, n) => {
      const c = (n - 1) / 2;
      return Math.hypot(x - c, y - c) <= n * 0.3 ? O : K;
    },
  },
  { names: ["checkered"], pattern: (x, y) => ((x + y) % 2 === 0 ? W : OFF) },
  { names: ["cautionWaving"], pattern: () => Y, blink: true },
  { names: ["caution", "yellow"], pattern: () => Y },
  { names: ["debris"], pattern: (x) => (x % 2 === 0 ? Y : R) },
  // Mavi: köşegen şerit
  { names: ["blue"], pattern: (x, y, n) => (Math.abs(x + y - (n - 1)) <= 0 || Math.abs(x + y - n) <= 0 ? W : B), blink: true },
  { names: ["white"], pattern: () => W },
  { names: ["oneLapToGreen", "greenHeld", "green"], pattern: () => G },
];

export default function DigiFlags(props: OverlayProps) {
  const s = useTopic("session");

  const active = createMemo(() => {
    const f = s()?.flags ?? [];
    return FLAGS.find((d) => d.names.some((n) => f.includes(n) && (n !== "green" || props.options.showGreen)));
  });

  const n = () => props.options.size as number;
  const cells = createMemo(() => {
    const a = active();
    const size = n();
    const out: (string | null)[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push(a ? a.pattern(x, y, size) : OFF);
    return out;
  });

  return (
    <Show when={props.editing || !props.options.hideWhenNone || active()}>
      <div class="dflag" classList={{ blink: !!active()?.blink && props.options.blink }} style={{ "--n": n() }}>
        <For each={cells()}>{(c) => <i style={c ? { background: c, "box-shadow": `0 0 6px ${c}` } : undefined} />}</For>
      </div>
    </Show>
  );
}
