import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { lapTime } from "@/sdk/format";
import type { Row } from "@/sdk/types";
import "./style.css";

const R = 34;
const C = 2 * Math.PI * R;

export default function BattleBox(props: OverlayProps) {
  const data = useTopic("standings");

  const view = createMemo(() => {
    const d = data();
    if (!d) return null;
    const me = d.rows.find((r) => r.isMe);
    if (!me) return null;
    const cls = d.rows.filter((r) => r.classId === me.classId).sort((a, b) => a.classPos - b.classPos);
    const i = cls.findIndex((r) => r.isMe);
    const ahead = i > 0 ? cls[i - 1] : null;
    const behind = i >= 0 && i < cls.length - 1 ? cls[i + 1] : null;
    return {
      me,
      count: cls.length,
      race: d.race,
      rows: [
        { r: ahead, dir: "up" as const, gap: ahead ? me.interval : 0 },
        { r: behind, dir: "down" as const, gap: behind ? behind.interval : 0 },
      ],
    };
  });

  const gapText = (r: Row | null, gap: number, dir: "up" | "down") => {
    if (!r) return "";
    if (!view()!.race) {
      const me = view()!.me;
      if (r.best <= 0 || me.best <= 0) return "—";
      const d = me.best - r.best;
      return (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(2);
    }
    return (dir === "up" ? "−" : "+") + gap.toFixed(1);
  };

  return (
    <div class="ov-theme bbox">
      <Show when={view()} fallback={<div class="ov-panel ov-empty bbox-empty">Veri bekleniyor…</div>}>
        <div class="bbox-rows">
          <For each={view()!.rows}>
            {(x) => (
              <div class="ov-panel bbox-row" classList={{ empty: !x.r }}>
                <Show when={x.r} fallback={<span class="ov-dim bbox-none">{x.dir === "up" ? "Lidersin" : "Arkanda kimse yok"}</span>}>
                  <span class="bbox-accent" style={{ background: x.r!.classColor || "#888" }} />
                  <span class="bbox-pos">{x.r!.classPos}</span>
                  <span class="bbox-num">{x.r!.number}</span>
                  <span class={`bbox-arrow ${x.dir}`}>{x.dir === "up" ? "▲" : "▼"}</span>
                  <span class="bbox-name" data-no-i18n>{x.r!.name}</span>
                  <Show when={props.options.showLast}>
                    <span class="bbox-last ov-mono" classList={{ pb: x.r!.lastPb }}>
                      {lapTime(x.r!.last)}
                    </span>
                  </Show>
                  <span class="bbox-gap ov-mono">{gapText(x.r, x.gap, x.dir)}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={props.options.showBadge}>
          <div class="bbox-badge">
            <svg viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="38" class="bb-bg" />
              <circle cx="40" cy="40" r={R} class="bb-track" />
              <circle
                cx="40"
                cy="40"
                r={R}
                class="bb-arc"
                stroke-dasharray={`${C * (1 - (view()!.me.classPos - 1) / Math.max(1, view()!.count - 1 || 1))} ${C}`}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <span class="bb-p">P</span>
            <b>{view()!.me.classPos}</b>
          </div>
        </Show>
      </Show>
    </div>
  );
}
