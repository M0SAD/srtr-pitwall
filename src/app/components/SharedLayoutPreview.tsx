// Toplulukta paylaşılan bir düzenin gerçek görünümü: overlay'ler paylaşanın ayarları ve
// renkleriyle (teması) örnek veriyle çizilir. Düzen indirilmeden önce nasıl görüneceği görülür.

import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { manifestById } from "@/sdk/registry";
import { defaultOptions } from "@/sdk/overlay";
import { DEFAULT_THEME, themeVars, type Theme } from "@/sdk/theme";
import { stackKeys, type Profile } from "@/sdk/settings";
import { isLocked } from "@/cloud/account";
import { OverlayView } from "./OverlayView";
import { normalizeLook } from "@/sdk/look";

export function SharedLayoutPreview(props: { profile: Profile; theme?: Theme; w: number; h: number; stream?: boolean; /** Arka plan görseli (data URL) */ backdrop?: string; /** Canlı demo: overlay'ler yarıştaymış gibi davranır */ live?: boolean }) {
  let box: HTMLDivElement | undefined;
  const [boxW, setBoxW] = createSignal(800);
  onMount(() => {
    const ro = new ResizeObserver(() => box && setBoxW(box.clientWidth));
    ro.observe(box!);
    onCleanup(() => ro.disconnect());
  });
  const theme = () => ({ ...DEFAULT_THEME, ...(props.theme ?? {}) });
  const k = createMemo(() => boxW() / Math.max(1, props.w));
  const g = () => (props.stream ? 1 : theme().scale / 100);
  const items = createMemo(() => {
    const list = Object.entries(props.profile.overlays ?? {}).filter(([, o]) => o.enabled && manifestById(o.type));
    const by = new Map(list);
    // Paylaşanın listesindeki sıra: üstteki overlay önizlemede de üstte çizilir
    return stackKeys(props.profile, list.map(([k]) => k)).map((key) => ({ key, o: by.get(key)!, m: manifestById(by.get(key)!.type)! }));
  });
  return (
    <div class="slp-wrap" ref={box}>
      <div
        class="slp ov-theme"
        style={{ ...themeVars(theme()), width: `${props.w * k()}px`, height: `${props.h * k()}px` }}
      >
        <Show when={props.backdrop}>
          <img class="slp-bg" src={props.backdrop} alt="" draggable={false} />
        </Show>
        <For each={items()}>
          {(it) => (
            <div
              class="slp-item"
              classList={{ locked: isLocked(it.o.type) }}
              style={{
                transform: `translate(${it.o.x * k()}px, ${it.o.y * k()}px) scale(${(it.o.scale || 1) * g() * k()})`,
                opacity: Math.min(it.o.opacity ?? 1, theme().opacity / 100),
              }}
            >
              <OverlayView type={it.o.type} options={{ ...defaultOptions(it.m), ...(it.o.options ?? {}) }} look={normalizeLook(it.o.look)} bgOpacity={it.o.bgOpacity} themed={false} editing={!props.live} />
            </div>
          )}
        </For>
        <Show when={items().length === 0}>
          <div class="slp-empty muted">Bu düzende açık overlay yok</div>
        </Show>
      </div>
    </div>
  );
}

/** Temanın renkleri ve yazı tipi (küçük örnek kutucuklar) */
export function ThemeSwatches(props: { theme?: Theme }) {
  const t = () => ({ ...DEFAULT_THEME, ...(props.theme ?? {}) });
  const colors = () =>
    [
      ["Vurgu", t().accent],
      ["Yazı", t().text],
      ["Arka plan", t().bg],
      ["İyi", t().positive],
      ["Kötü", t().negative],
      ["En iyi", t().best],
      ["Uyarı", t().warning],
    ] as const;
  return (
    <div class="swatches">
      <For each={colors()}>
        {([name, c]) => (
          <span class="swatch" title={`${name}: ${c}`}>
            <i style={{ background: c }} />
            {name}
          </span>
        )}
      </For>
      <span class="swatch-font" data-no-i18n>
        {t().font} · {t().fontSize}px · %{t().scale}
      </span>
    </div>
  );
}
