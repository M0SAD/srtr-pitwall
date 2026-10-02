// Bir overlay bileşenini panel içinde (önizleme, düzen tuvali) çizer.

import { Show, Suspense, createMemo, lazy, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { loadComponent, manifestById } from "@/sdk/registry";
import { defaultOptions, previewFrozen } from "@/sdk/overlay";
import { sanitizeOverlayOptions } from "@/sdk/proFeatures";
import { settings } from "@/sdk/settings";
import { themeVars } from "@/sdk/theme";
import type { OverlayLook } from "@/sdk/look";
import { lookStyle } from "@/sdk/lookStyle";

const cache = new Map<string, Component<any>>();
export function overlayComponent(type: string) {
  if (!cache.has(type)) {
    const l = loadComponent(type);
    if (l) cache.set(type, lazy(l));
  }
  return cache.get(type);
}

/** Overlay'i kendi tema değişkenleriyle çizer. `themed` false ise dış kap tema taşır. */
/** Panel önizlemelerinde overlay düzenleme modundaymış gibi çizilir: sadece belli durumlarda görünenler
 * (bayrak, pit hızı, radar, piste dönüş…) de örnek hâliyle görünsün. */
export function OverlayView(props: { type: string; options?: Record<string, unknown>; themed?: boolean; class?: string; editing?: boolean; look?: OverlayLook }) {
  const m = manifestById(props.type);
  const C = overlayComponent(props.type);
  const opts = createMemo(() => sanitizeOverlayOptions(props.type, { ...(m ? defaultOptions(m) : {}), ...(props.options ?? {}) }));
  const vars = createMemo(() => ({ ...(props.themed === false ? {} : themeVars(settings().theme)), ...lookStyle(props.look, settings().theme) }));
  return (
    <div class={`ov-theme ovview ${props.class ?? ""}`} classList={{ "ov-frozen": previewFrozen() }} style={vars()}>
      <Show when={C} fallback={<div class="ov-panel ov-empty">{props.type}</div>}>
        <Suspense>
          <Dynamic component={C} options={opts()} units={settings().general.units} editing={props.editing ?? true} />
        </Suspense>
      </Show>
    </div>
  );
}
