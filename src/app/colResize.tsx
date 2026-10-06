// Düzenler / Yayın düzenleri sayfalarında sol sütun (düzenler + overlay listesi) ve ayarlar sütunu sağ kenarından
// sürüklenerek genişletilir. Genişlikler Overlaylarım sayfasıyla ortaktır (uiPref: ovColList / ovColSet) ve sınırlıdır.
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { uiPref } from "@/sdk/settings";

const COL = { list: [250, 420], set: [290, 520] } as const;
type Col = keyof typeof COL;
const [listRaw, setList] = uiPref<number>("ovColList", COL.list[0]);
const [setRaw, setSet] = uiPref<number>("ovColSet", COL.set[0]);
const clamp = (v: unknown, k: Col) => Math.min(COL[k][1], Math.max(COL[k][0], Math.round(Number(v) || COL[k][0])));

/** Pencere bu kadar genişse ayar sütununun yeri panel kapalıyken de ayrılır: tuval sola kaymaz */
const KEEP_MIN = 1500;

export function useCols() {
  const [winW, setWinW] = createSignal(typeof window === "undefined" ? 0 : window.innerWidth);
  onMount(() => {
    const on = () => setWinW(window.innerWidth);
    window.addEventListener("resize", on);
    onCleanup(() => window.removeEventListener("resize", on));
  });
  /** Ayar paneli kapalı ama yeri ayrılmış mı */
  // Ayar paneli kapalıyken yeri ayrılmaz: düzen tuvali soldaki overlay listesine yanaşır, ayarlar açılınca sağa kayar
  const keep = () => false && winW() >= KEEP_MIN;
  const [drag, setDrag] = createSignal<{ k: Col; v: number } | null>(null);
  const w = (k: Col) => (drag()?.k === k ? drag()!.v : clamp(k === "list" ? listRaw() : setRaw(), k));
  const save = (k: Col, v: number) => (k === "list" ? setList(v) : setSet(v));
  const start = (k: Col, e: PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = w(k);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDrag({ k, v: w0 });
    const move = (ev: PointerEvent) => setDrag({ k, v: clamp(w0 + ev.clientX - x0, k) });
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const v = drag()?.v ?? w0;
      setDrag(null);
      if (v !== w0) save(k, v);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  /** Sayfa ızgarasının sütunları (ayar paneli açıkken üç sütun) */
  const columns = (withSet: boolean) => (withSet || keep() ? `${w("list")}px ${w("set")}px minmax(320px, 1fr)` : `${w("list")}px minmax(0, 1fr)`);
  const Grips = (p: { withSet: boolean }) => (
    <>
      <div class="ovcol-grip" classList={{ on: drag()?.k === "list" }} style={{ left: `${w("list") - 4}px` }} title="Genişletmek için sürükle (çift tık: varsayılan)" onPointerDown={(e) => start("list", e)} onDblClick={() => save("list", COL.list[0])} />
      <Show when={p.withSet || keep()}>
        <div class="ovcol-grip" classList={{ on: drag()?.k === "set" }} style={{ left: `${w("list") + w("set") - 4}px` }} title="Genişletmek için sürükle (çift tık: varsayılan)" onPointerDown={(e) => start("set", e)} onDblClick={() => save("set", COL.set[0])} />
      </Show>
    </>
  );
  return { columns, Grips, keep, resizing: () => !!drag() };
}
