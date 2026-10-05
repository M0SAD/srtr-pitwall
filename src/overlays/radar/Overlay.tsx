import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import "./style.css";

/** Araç boyu (m): yan yana sayılma sınırı */
const CAR_LEN = 4.8;

export default function Radar(props: OverlayProps) {
  const data = useTopic("radar");

  const range = () => props.options.range as number;
  const cars = createMemo(() =>
    (data()?.cars ?? [])
      .filter((c) => Math.abs(c.offset) <= range())
      // Aynala: sol / sağ yer değiştirir (bazı oyunlarda yan taraf ters geliyor)
      .map((c) => (props.options.mirror && c.side !== 0 ? { ...c, side: -c.side } : c)),
  );
  const side = (s: number) => cars().filter((c) => c.side === s);
  const alongside = (s: number) =>
    side(s).some((c) => Math.abs(c.offset) < CAR_LEN * 1.1);
  const frontNear = () => cars().some((c) => c.side === 0 && c.offset > 0);
  const rearNear = () => cars().some((c) => c.side === 0 && c.offset < 0);
  const active = () => cars().length > 0;

  // Radar: 200px alan, merkez 100; araç 22x46 px; boyuna ölçek range -> 90px
  const y = (off: number) => 100 - (off / range()) * 90;

  return (
    <Show when={props.editing || demoShow() || !props.options.hideWhenClear || active()}>
      <svg
        class="radar"
        viewBox="0 0 200 200"
        style={{ "--rc": props.options.color }}
      >
        <defs>
          <radialGradient id="rg-bg">
            <stop
              offset="0%"
              style={{
                "stop-color": "var(--ov-bg-solid)",
                "stop-opacity": 0.85,
              }}
            />
            <stop
              offset="100%"
              style={{
                "stop-color": "var(--ov-bg-solid)",
                "stop-opacity": 0.35,
              }}
            />
          </radialGradient>
          <linearGradient id="rg-l" x1="0" x2="1">
            <stop
              offset="0%"
              style={{ "stop-color": "var(--ov-red)", "stop-opacity": 0.15 }}
            />
            <stop
              offset="100%"
              style={{ "stop-color": "var(--ov-red)", "stop-opacity": 0.7 }}
            />
          </linearGradient>
          <linearGradient id="rg-r" x1="1" x2="0">
            <stop
              offset="0%"
              style={{ "stop-color": "var(--ov-red)", "stop-opacity": 0.15 }}
            />
            <stop
              offset="100%"
              style={{ "stop-color": "var(--ov-red)", "stop-opacity": 0.7 }}
            />
          </linearGradient>
          <clipPath id="rg-clip">
            <circle cx="100" cy="100" r="98" />
          </clipPath>
        </defs>
        <circle cx="100" cy="100" r="98" fill="url(#rg-bg)" />
        <g clip-path="url(#rg-clip)">
          {/* Yan bölgeler: yanda araç varken kırmızı */}
          <Show when={alongside(-1)}>
            <rect x="0" y="0" width="84" height="200" fill="url(#rg-l)" />
          </Show>
          <Show when={alongside(1)}>
            <rect x="116" y="0" width="84" height="200" fill="url(#rg-r)" />
          </Show>
          {/* Ön/arka koniler: yakında araç varken sarı */}
          <path
            d="M88 76 L76 0 L124 0 L112 76 Z"
            class="cone"
            classList={{ on: frontNear() }}
          />
          <path
            d="M88 124 L76 200 L124 200 L112 124 Z"
            class="cone"
            classList={{ on: rearNear() }}
          />
          {/* Kılavuz çizgiler */}
          <line x1="100" y1="0" x2="100" y2="200" class="guide" />
          <line x1="0" y1="100" x2="200" y2="100" class="guide" />
          <line x1="30" y1="77" x2="170" y2="77" class="guide" />
          <line x1="30" y1="123" x2="170" y2="123" class="guide" />
          <For each={cars()}>
            {(c) => (
              <rect
                class="car other"
                x={c.side === 0 ? 89 : c.side < 0 ? 57 : 121}
                y={y(c.offset) - 23}
                width="22"
                height="46"
                rx="5"
              />
            )}
          </For>
        </g>
        <rect class="car me" x="89" y="77" width="22" height="46" rx="5" />
        <circle cx="100" cy="100" r="98" class="rim" />
        <Show when={props.options.showDistance}>
          <Show when={data()?.aheadM != null && data()!.aheadM! < range()}>
            <text x="100" y="18" class="dist">
              {data()!.aheadM!.toFixed(0)} m
            </text>
          </Show>
          <Show when={data()?.behindM != null && data()!.behindM! < range()}>
            <text x="100" y="190" class="dist">
              {data()!.behindM!.toFixed(0)} m
            </text>
          </Show>
        </Show>
      </svg>
    </Show>
  );
}
