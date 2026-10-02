import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { friendColor, friendOf, friendsOn } from "@/sdk/friends";
import { SHAPES, meMarkerFrom, type MeShape } from "../trackmap/marker";
import "./style.css";

export default function FlatMap(props: OverlayProps) {
  const m = useTopic("map");
  const me = () => m()?.cars.find((c) => c.me);
  const x = (pct: number) => {
    if (props.options.mode !== "centered" || !me()) return pct;
    let d = pct - me()!.pct;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return 0.5 + d;
  };
  const cars = createMemo(() =>
    (m()?.cars ?? [])
      .filter((c) => !(props.options.hidePit && c.pit && !c.me))
      .map((c) => ({ c, x: x(c.pct) }))
      // Ben en üstte çizilsin
      .sort((a, b) => Number(a.c.me) - Number(b.c.me)),
  );
  // Senin aracının işareti (daire: eski görünüm, boyut ayarı uygulanır)
  const mk = createMemo(() => meMarkerFrom(props.options));
  const layers = () => SHAPES[mk().shape as Exclude<MeShape, "image">] ?? SHAPES.circle;
  const firstMain = () => layers().findIndex((l) => l.tone === "main");
  const sf = () => (props.options.mode === "centered" && me() ? x(0) : 0);

  return (
    <div class="ov-panel fm" style={{ width: `${props.options.width}px` }}>
      <div class="fm-track">
        <Show when={props.options.sectors}>
          <For each={[1 / 3, 2 / 3]}>{(p) => <div class="fm-sec" style={{ left: `${x(p) * 100}%` }} />}</For>
        </Show>
        <div class="fm-sf" style={{ left: `${sf() * 100}%` }} />
        <For each={cars()}>
          {({ c, x }) => {
            const fr = () => (friendsOn("map") ? friendOf(c.userId, c.name) : null);
            const custom = () => c.me && mk().shape !== "circle";
            return (
              <Show
                when={!custom()}
                fallback={
                  <div
                    class="fm-me"
                    classList={{ pit: c.pit }}
                    style={{ left: `${x * 100}%`, "--ms": `${Math.round(28 * mk().scale)}px` }}
                    title={c.name}
                  >
                    <Show
                      when={mk().shape === "image" && mk().image}
                      fallback={
                        <svg viewBox="-1.3 -1.3 2.6 2.6" style={{ transform: mk().rotate ? "rotate(90deg)" : undefined }}>
                          <For each={layers()}>
                            {(l, i) => (
                              <path
                                d={l.d}
                                fill={l.tone === "main" ? mk().color : "rgba(10,12,16,0.82)"}
                                stroke={i() === firstMain() ? mk().outline : "none"}
                                stroke-opacity="0.6"
                                stroke-width="0.09"
                                stroke-linejoin="round"
                              />
                            )}
                          </For>
                        </svg>
                      }
                    >
                      <img src={mk().image} alt="" draggable={false} style={{ transform: mk().rotate ? "rotate(90deg)" : undefined }} />
                    </Show>
                  </div>
                }
              >
                <div
                  class="fm-car"
                  classList={{ me: c.me, pit: c.pit, friend: !!fr() }}
                  style={{
                    left: `${x * 100}%`,
                    "--cc": fr() ? friendColor(fr()!) : c.color || "#ccc",
                    "--ms": c.me ? `${Math.round(28 * mk().scale)}px` : undefined,
                  }}
                  title={c.name}
                >
                  <Show when={props.options.numbers}>
                    <span>{c.number}</span>
                  </Show>
                </div>
              </Show>
            );
          }}
        </For>
      </div>
    </div>
  );
}
