import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

/**
 * Tekrar izlerken sürücüye tıklayıp canlı izleme (iRacing).
 * Overlay penceresi (Host) tekrar izlenirken bunu açar; Sıralama Tablosu / Yakındakiler sürücü adlarını
 * `data-replay-click` ile işaretler. Host bu öğelerin dikdörtgenlerini Rust'a bildirir; imleç bir adın üstüne
 * gelince pencere fareyi alır (bkz. src-tauri/src/clickzones.rs), kalan yerler oyuna tıklanmaya devam eder.
 */
const [on, setOn] = createSignal(false);
export const replayClick = on;
export const setReplayClick = setOn;

/** Canlı yayına dön ve kamerayı bu araca çevir */
export function watchLive(number: string) {
  if (!inTauri || !number) return;
  invoke("watch_car_live", { number }).catch((e) => console.warn("watch_car_live", e));
}

let last = "";
/** Sayfadaki tıklanabilir adların dikdörtgenlerini bildir (değişince) */
export function reportClickRects(active: boolean) {
  if (!inTauri) return;
  const rects: [number, number, number, number][] = [];
  if (active)
    document.querySelectorAll<HTMLElement>("[data-replay-click]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
    });
  const key = JSON.stringify(rects);
  if (key === last) return;
  last = key;
  invoke("overlay_click_rects", { rects }).catch(() => {});
}
