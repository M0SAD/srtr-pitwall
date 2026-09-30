// Pitwall paneli için: bir overlay bileşenini, kendi varsayılan ayarları (ve verilen ek
// ayarlar) ile bir kart içinde gösterir.

import { Show, Suspense, createMemo, lazy, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { loadComponent, manifestById } from "@/sdk/registry";
import { defaultOptions } from "@/sdk/overlay";
import { settings } from "@/sdk/settings";
import { isLocked } from "@/cloud/account";

const cache = new Map<string, Component<any>>();
function comp(id: string) {
  if (!cache.has(id)) {
    const l = loadComponent(id);
    if (l) cache.set(id, lazy(l));
  }
  return cache.get(id);
}

export function OverlayCard(props: {
  id: string;
  title?: string;
  options?: Record<string, unknown>;
  class?: string;
  right?: JSX.Element;
}) {
  const m = manifestById(props.id);
  const C = comp(props.id);
  const options = createMemo(() => ({ ...(m ? defaultOptions(m) : {}), ...(props.options ?? {}) }));
  return (
    <section class={`pw-card ${props.class ?? ""}`}>
      <Show when={props.title}>
        <header>
          <span>{props.title}</span>
          {props.right}
        </header>
      </Show>
      <div class="pw-body">
        <Show when={!isLocked(props.id)} fallback={<div class="ov-empty">PRO üyelere özel</div>}>
        <Show when={C} fallback={<div class="ov-empty">Bulunamadı: {props.id}</div>}>
          <Suspense>
            <Dynamic component={C} options={options()} units={settings().general.units} editing={false} />
          </Suspense>
        </Show>
        </Show>
      </div>
    </section>
  );
}
