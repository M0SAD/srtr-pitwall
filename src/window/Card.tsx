// Pitwall paneli için: bir overlay bileşenini, kendi varsayılan ayarları (ve verilen ek
// ayarlar) ile bir kart içinde gösterir.

import { Show, Suspense, createMemo, lazy, onCleanup, onMount, type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { loadComponent, manifestById } from "@/sdk/registry";
import { defaultOptions } from "@/sdk/overlay";
import { sanitizeOverlayOptions } from "@/sdk/proFeatures";
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

/**
 * Kartın içindeki göstergeyi kart genişliğine sığdırır. Overlay'ler sabit piksel genişliğinde çizildiği için dar
 * kartlarda taşıyordu. İçerik `.pw-fit` sarmalayıcısına alınır; doğal genişliği (scrollWidth) kartın iç
 * genişliğinden büyükse sarmalayıcı CSS `zoom` ile orantılı küçültülür (yükseklik de aynı oranda küçülür, satır
 * yüksekliği içerikten gelir). Kart ya da içerik boyut değiştirince (ResizeObserver) yeniden ölçülür.
 */
function fitToWidth(body: HTMLDivElement) {
  let raf = 0;
  const measure = () => {
    raf = 0;
    const inner = body.firstElementChild as HTMLElement | null;
    if (!inner || !body.isConnected) return;
    // Ölçüm: ölçeksiz ve sola yaslı (ortalanmış taşma sol tarafta sayılmaz); aynı karede geri alınır, titreme olmaz
    inner.classList.add("measuring");
    inner.style.setProperty("zoom", "1");
    inner.style.width = "100%";
    const avail = inner.clientWidth;
    const need = inner.scrollWidth;
    inner.classList.remove("measuring");
    const k = avail > 0 && need > avail + 0.5 ? Math.max(0.2, Math.floor((avail / need) * 1000) / 1000) : 1;
    if (k < 1) {
      inner.style.setProperty("zoom", String(k));
      inner.style.width = `${100 / k}%`;
    } else {
      inner.style.removeProperty("zoom");
      inner.style.width = "100%";
    }
    body.dataset.fit = k < 1 ? k.toFixed(3) : "";
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(measure);
  };
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    // Kartın genişliği (pencere boyutu, sütun düzeni) ve içeriğin boyutu (veri gelince, satır eklenince)
    const ro = new ResizeObserver(queue);
    ro.observe(body);
    const inner = body.firstElementChild;
    if (inner) ro.observe(inner);
    // İçerik tembel yüklenir (lazy): gelen gösterge kökünü de izle
    const mo = new MutationObserver(() => {
      const el = body.firstElementChild;
      if (el) for (const c of Array.from(el.children)) ro.observe(c);
      queue();
    });
    if (inner) mo.observe(inner, { childList: true });
    queue();
    onCleanup(() => {
      ro.disconnect();
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    });
  });
}

export function OverlayCard(props: {
  id: string;
  title?: string;
  options?: Record<string, unknown>;
  class?: string;
  right?: JSX.Element;
  /** Gösterge karta sığmıyorsa orantılı küçült (Pitwall paneli): taşma / kırpılma / yatay kaydırma olmaz */
  fit?: boolean;
}) {
  const m = manifestById(props.id);
  const C = comp(props.id);
  const options = createMemo(() => sanitizeOverlayOptions(props.id, { ...(m ? defaultOptions(m) : {}), ...(props.options ?? {}) }));
  const content = () => (
    <Show when={!isLocked(props.id)} fallback={<div class="ov-empty">PRO üyelere özel</div>}>
      <Show when={C} fallback={<div class="ov-empty">Bulunamadı: {props.id}</div>}>
        <Suspense>
          <Dynamic component={C} options={options()} units={settings().general.units} editing={false} />
        </Suspense>
      </Show>
    </Show>
  );
  return (
    <section class={`pw-card ${props.class ?? ""}`}>
      <Show when={props.title}>
        <header>
          <span>{props.title}</span>
          {props.right}
        </header>
      </Show>
      <div class="pw-body" classList={{ "pw-fitbody": !!props.fit }} ref={(el) => props.fit && fitToWidth(el)}>
        <Show when={props.fit} fallback={content()}>
          <div class="pw-fit">{content()}</div>
        </Show>
      </div>
    </section>
  );
}
