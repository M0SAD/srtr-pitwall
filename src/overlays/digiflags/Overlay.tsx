import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
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

// Önem sırasına göre bayraklar ve LED desenleri
const FLAGS: { names: FlagName[]; pattern: Pattern; blink?: boolean; label: string }[] = [
  // Siyah: kenarlar beyaz yanar, içi sönük
  { names: ["disqualify", "black"], label: "Siyah", pattern: (x, y, n) => (x === 0 || y === 0 || x === n - 1 || y === n - 1 ? W : OFF) },
  { names: ["red"], label: "Kırmızı", pattern: () => R },
  {
    names: ["repair"],
    label: "Hasar (meatball)",
    pattern: (x, y, n) => {
      const c = (n - 1) / 2;
      return Math.hypot(x - c, y - c) <= n * 0.3 ? O : OFF;
    },
  },
  { names: ["checkered"], label: "Damalı", pattern: (x, y) => ((x + y) % 2 === 0 ? W : OFF) },
  { names: ["cautionWaving"], label: "Sarı (dalgalanan)", pattern: () => Y, blink: true },
  { names: ["caution", "yellow"], label: "Sarı", pattern: () => Y },
  { names: ["debris"], label: "Enkaz", pattern: (x) => (x % 2 === 0 ? Y : R) },
  // Mavi: köşegen şerit
  { names: ["blue"], label: "Mavi", pattern: (x, y, n) => (Math.abs(x + y - (n - 1)) <= 0 || Math.abs(x + y - n) <= 0 ? W : B), blink: true },
  { names: ["white"], label: "Beyaz", pattern: () => W },
  { names: ["oneLapToGreen", "greenHeld", "green"], label: "Yeşil", pattern: () => G },
];

type FlagDef = (typeof FLAGS)[number];
const SAMPLE_MS = 3500;

export default function DigiFlags(props: OverlayProps) {
  const s = useTopic("session");

  // Örnek bayrak: düzenlerken (ya da veri yokken) tıklayınca birkaç saniye rastgele bir bayrak yanar.
  // Sürekli dönen bir demo yoktur; süre dolunca panel sönük hale döner.
  const [sample, setSample] = createSignal<FlagDef | null>(null);
  let sampleTimer: number | undefined;
  onCleanup(() => clearTimeout(sampleTimer));
  const showSample = () => {
    const cur = sample();
    const pool = FLAGS.filter((f) => f !== cur);
    setSample(pool[Math.floor(Math.random() * pool.length)]);
    clearTimeout(sampleTimer);
    sampleTimer = window.setTimeout(() => setSample(null), SAMPLE_MS);
  };
  const live = createMemo(() => {
    const f = s()?.flags ?? [];
    return FLAGS.find((d) => d.names.some((n) => f.includes(n) && (n !== "green" || props.options.showGreen)));
  });
  const canSample = () => props.editing || !s();
  const active = createMemo(() => live() ?? (canSample() ? sample() ?? undefined : undefined));

  // Düzenleme modunda çerçeve sürüklemek için işaretçiyi yakalar; bu yüzden tıklamayı
  // basma/bırakma konumundan çıkarırız (sürükleme sayılmaz).
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !canSample()) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointerup", up, true);
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) showSample();
    };
    window.addEventListener("pointerup", up, true);
  };

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
      <div
        class="dflag"
        classList={{ blink: !!active()?.blink && props.options.blink, idle: !active() }}
        style={{ "--n": n() }}
        onPointerDown={onDown}
        title={props.editing ? "Örnek bayrak için tıkla" : undefined}
      >
        <For each={cells()}>{(c) => <i classList={{ on: !!c }} style={c ? { "--c": c } : undefined} />}</For>
        <Show when={props.editing}>
          <span class="dflag-cap">{sample() && !live() ? sample()!.label : "Örnek için tıkla"}</span>
        </Show>
      </div>
    </Show>
  );
}
