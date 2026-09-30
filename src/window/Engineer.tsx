// Mühendis ekranı: tablet/ikinci monitör için, ekranlar kendiliğinden döner.
// Adres: window.html?view=engineer&size=1920x480

import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { setSubscriptions, useTopic } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import { settings } from "@/sdk/settings";
import { query } from "@/sdk/platform";
import { manifestById } from "@/sdk/registry";
import { OverlayCard } from "./Card";
import { ENGINEER_SCREENS } from "./engineerScreens";

export function Engineer() {
  const status = useTopic("status");
  const screens = createMemo(() => {
    const on = settings().general.engineer.screens;
    const list = ENGINEER_SCREENS.filter((s) => on.includes(s.id) && s.overlays.every((o) => manifestById(o.type)));
    return list.length ? list : ENGINEER_SCREENS.slice(0, 1);
  });
  const [idx, setIdx] = createSignal(0);
  const cur = () => screens()[idx() % screens().length];

  onMount(() => {
    const all = ENGINEER_SCREENS.flatMap((s) => s.overlays.flatMap((o) => manifestById(o.type)?.topics ?? []));
    setSubscriptions(all.map((t) => ({ name: t.name, hz: Math.min(t.hz, 10) })));
    const tick = setInterval(() => {
      const sec = settings().general.engineer.cycleSec;
      if (sec > 0) setIdx((i) => i + 1);
    }, Math.max(3, settings().general.engineer.cycleSec || 10) * 1000);
    onCleanup(() => clearInterval(tick));
  });

  const size = (query.get("size") ?? "").split("x").map(Number);
  const vars = createMemo(() => themeVars(settings().theme));

  return (
    <div
      class="eng ov-theme"
      style={{ ...vars(), ...(size[0] > 0 ? { width: `${size[0]}px`, height: `${size[1]}px` } : {}) }}
      onClick={() => setIdx((i) => i + 1)}
    >
      <header class="eng-top">
        <b>{cur().name}</b>
        <span class="pw-dim">{status()?.connected ? status()?.track : "iRacing bekleniyor"}</span>
        <span class="eng-dots">
          <For each={screens()}>{(s, i) => <i classList={{ on: i() === idx() % screens().length }} title={s.name} />}</For>
        </span>
      </header>
      <div class="eng-body" classList={{ two: cur().overlays.length > 1 }}>
        <Show when={cur()} keyed>
          {(s) => <For each={s.overlays}>{(o) => <OverlayCard id={o.type} options={o.options} class="eng-card" />}</For>}
        </Show>
      </div>
    </div>
  );
}
