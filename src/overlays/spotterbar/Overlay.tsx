import { For, Show, createMemo } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { useTopic } from "@/sdk/telemetry";
import type { RadarCar } from "@/sdk/types";
import "./style.css";

/** Araç boyu (m) */
const CAR_LEN = 4.8;

// Kaldırılan görünümler (ör. eski "chevron" / ok uçlu) ve bilinmeyen değerler düz çubuğa düşer
const DESIGNS = ["flat", "arc", "fade", "segments", "neon", "corner"] as const;
type Design = (typeof DESIGNS)[number];

/** Düzenleme / önizlemede yanında kimse yokken gösterilen örnek: solda yaklaşan tek araç, sağda tam yan yana araç */
const SAMPLE: RadarCar[] = [
  { side: -1, offset: -2.6 },
  { side: 1, offset: 0.4 },
];

interface SideState {
  /** 0 yok, 1 araç, 2 iki araç, 3 tehlikeli yakın */
  level: number;
  cars: RadarCar[];
  /** En yakın aracın boyuna mesafesi (m); bilinmiyorsa null */
  near: number | null;
}

export default function SpotterBar(props: OverlayProps) {
  const data = useTopic("radar");
  const o = () => props.options;
  const status = useTopic("status");
  const inputs = useTopic("inputs");
  /** Pist dışında / düşük hızda gizle (sadece gerçek ekranda ve canlı veride) */
  const muted = () => {
    if (props.editing || !onScreen()) return false;
    const st = status();
    if (!st || st.preview) return false;
    if (o().onlyOnTrack !== false && !st.onTrack) return true;
    const min = Number(o().minSpeed) || 0;
    const sp = inputs()?.speed;
    return min > 0 && sp != null && sp * 3.6 < min;
  };

  const design = createMemo<Design>(() => {
    const d = o().design as Design;
    return DESIGNS.includes(d) && !overlayValueLocked("spotterbar", "design", d)
      ? d
      : "flat";
  });
  const t = () => Math.max(2, Number(o().thickness) || 24);
  const h = () => Math.max(20, Number(o().height) || 180);
  const range = () => Math.max(1, Number(o().range) || 7);

  const live = createMemo(() =>
    (data()?.cars ?? []).filter(
      (c) => c.side !== 0 && Math.abs(c.offset) <= range(),
    ),
  );
  /** CarLeftRight: 2 solda, 3 sağda, 4 iki yanda, 5 solda iki, 6 sağda iki */
  const stateSide = (s: number) => {
    const st = data()?.state ?? 0;
    if (s < 0) return st === 5 ? 2 : st === 2 || st === 4 ? 1 : 0;
    return st === 6 ? 2 : st === 3 || st === 4 ? 1 : 0;
  };
  /** Panel önizlemesi ve düzenleme modu: yanında kimse yoksa örnek araçlar */
  const sample = () =>
    (props.editing || !onScreen()) &&
    live().length === 0 &&
    stateSide(-1) + stateSide(1) === 0;

  const sideOf = (s: number): SideState => {
    if (muted()) return { level: 0, cars: [], near: null };
    const smp = sample();
    const cars = (smp ? SAMPLE : live()).filter((c) => c.side === s);
    const flagged = smp ? 0 : stateSide(s);
    const beside = cars.filter((c) => Math.abs(c.offset) < CAR_LEN * 1.1);
    const shown = o().onlyAlongside === false ? cars : beside;
    const count = Math.max(shown.length, flagged);
    if (!count) return { level: 0, cars: [], near: null };
    const near = shown.length
      ? shown.reduce(
          (a, c) => (Math.abs(c.offset) < Math.abs(a) ? c.offset : a),
          shown[0].offset,
        )
      : null;
    const dd = Number(o().dangerDist) || 0;
    const level =
      near != null && dd > 0 && Math.abs(near) < dd ? 3 : count >= 2 ? 2 : 1;
    return { level, cars: shown, near };
  };
  const rawL = createMemo(() => sideOf(-1));
  const rawR = createMemo(() => sideOf(1));
  /** İki yanda birden araç varsa iki çubuk da "iki araç" rengine geçer (tehlike rengi önceliklidir) */
  const both = () => rawL().level > 0 && rawR().level > 0;
  const lift = (st: SideState): SideState =>
    both() && st.level === 1 ? { ...st, level: 2 } : st;
  const left = createMemo(() => lift(rawL()));
  const right = createMemo(() => lift(rawR()));

  const color = (lv: number) =>
    lv === 3
      ? o().colorDanger
      : lv === 2
        ? o().colorTwo
        : lv === 1
          ? o().colorCar
          : o().colorClear;

  // ---- Geometri (sol çubuğa göre; sağ çubuk aynalanır). İç kenar x = w ----
  const bulge = () =>
    design() === "arc" ? Math.max(t() * 0.9, h() * 0.09) : 0;
  const w = () => t() + bulge();
  const lineW = () =>
    design() === "neon" || design() === "corner"
      ? Math.max(2, Math.min(4, t() / 6))
      : t();
  /** Köşe: dış kenarda dikey çizgi, uçlarda içe dönen kollar (çerçeve köşeleri) */
  const cornerPath = () => {
    const c = lineW() / 2;
    const arm = Math.min(h() * 0.22, Math.max(t(), 18));
    return `M${w()} ${c} L${c} ${c} L${c} ${arm} M${c} ${h() - arm} L${c} ${h() - c} L${w()} ${h() - c}`;
  };
  const path = () => {
    const cap = lineW() / 2;
    if (design() === "corner") return `M${w() / 2} ${cap} L${w() / 2} ${h() - cap}`;
    const x0 = design() === "neon" ? w() / 2 : w() - t() / 2;
    if (design() !== "arc") return `M${x0} ${cap} L${x0} ${h() - cap}`;
    // Uçlar iç kenarda, orta dışa doğru bombeli (parantez biçimi)
    const cx = 2 * (t() / 2) - x0;
    return `M${x0} ${cap} Q${cx} ${h() / 2} ${x0} ${h() - cap}`;
  };
  /** Aracın çubuktaki merkezi (0 üst .. 100 alt) ve boyu (%) */
  const pos = (off: number) =>
    50 - ((o().flip ? -off : off) / range()) * 50;
  const carLen = () => (CAR_LEN / (range() * 2)) * 100;

  // Segment dizilimi
  const unit = () => Math.max(5, Math.min(14, t() * 0.45));
  const unitGap = () => 3;
  const units = createMemo(() => {
    const n = Math.max(3, Math.floor((h() + unitGap()) / (unit() + unitGap())));
    const pad = (h() - (n * unit() + (n - 1) * unitGap())) / 2;
    return Array.from({ length: n }, (_, i) => pad + i * (unit() + unitGap()));
  });
  /** Segmentin parlaklığı: aracın gövdesi tam, çevresi yumuşak sönen */
  const lit = (st: SideState, yTop: number) => {
    if (!st.level) return 0;
    if (!o().showMarker || !st.cars.length) return 1;
    const c = ((yTop + unit() / 2) / h()) * 100;
    let best = 0;
    for (const car of st.cars) {
      const d = Math.abs(c - pos(car.offset)) - carLen() / 2;
      best = Math.max(
        best,
        d <= 0 ? 1 : Math.max(0, 1 - d / (carLen() * 0.6)) * 0.55,
      );
    }
    return Math.max(best, 0.16);
  };
  const Bar = (p: {
    s: number;
    st: () => SideState;
  }) => {
    const on = () => p.st().level > 0;
    const stroked = () => design() !== "segments";
    const marker = () => on() && !!o().showMarker && p.st().cars.length > 0;
    return (
      <div
        class={`sb-bar sb-d-${design()}`}
        classList={{
          on: on(),
          guide: !on() && !!o().guides,
          glow: !!o().glow,
          pulse: on() && o().pulse !== false && (p.st().level === 3 || both()),
          [`lv${p.st().level}`]: true,
        }}
        style={{ "--c": color(p.st().level), width: `${w()}px` }}
      >
        <svg width={w()} height={h()} viewBox={`0 0 ${w()} ${h()}`}>
          <g
            transform={p.s > 0 ? `translate(${w()} 0) scale(-1 1)` : undefined}
          >
            <Show
              when={stroked()}
              fallback={
                <For each={units()}>
                  {(y) => (
                    <rect
                      class="sb-unit"
                      x="0"
                      y={y}
                      width={w()}
                      height={unit()}
                      rx={Math.min(3, unit() / 3)}
                      style={{ opacity: on() ? lit(p.st(), y) : 1 }}
                    />
                  )}
                </For>
              }
            >
              <path
                class="sb-track"
                classList={{ dim: marker() && design() !== "corner" }}
                d={design() === "corner" ? cornerPath() : path()}
                stroke-width={lineW()}
              />
              <Show when={marker()}>
                <For each={p.st().cars}>
                  {(c) => (
                    <path
                      class="sb-car"
                      d={path()}
                      stroke-width={
                        design() === "corner"
                          ? Math.max(lineW() * 2, t() * 0.4)
                          : lineW()
                      }
                      pathLength="100"
                      stroke-dasharray={`${carLen()} 300`}
                      stroke-dashoffset={-(pos(c.offset) - carLen() / 2)}
                    />
                  )}
                </For>
              </Show>
            </Show>
          </g>
        </svg>
        <Show when={o().showDistance && on() && p.st().near != null}>
          <span
            class="sb-dist"
            classList={{ r: p.s > 0 }}
            style={{ top: `${Math.min(96, Math.max(4, pos(p.st().near!)))}%` }}
          >
            {p.st().near! > 0 ? "+" : ""}
            {p.st().near!.toFixed(1)} m
          </span>
        </Show>
      </div>
    );
  };

  return (
    <div
      class="sbar"
      style={{
        height: `${h()}px`,
        gap: `${Math.max(0, Number(o().gap) || 0)}px`,
        "--sb-op": `${(Number(o().barOpacity) || 90) / 100}`,
        "--sb-fade": `${Math.max(0, Number(o().fadeMs) || 0)}ms`,
        "--sb-glow": `${Math.max(4, t() * 0.5)}px`,
      }}
    >
      <Bar s={-1} st={left} />
      <Bar s={1} st={right} />
    </div>
  );
}
