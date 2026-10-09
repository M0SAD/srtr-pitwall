import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

/**
 * Tekrar izlerken sürücüye tıklayıp canlı izleme (iRacing).
 * Overlay penceresi (Host) tekrar izlenirken bunu açar; Sıralama Tablosu / Yakındakiler sürücü adlarını
 * `data-replay-click` ile işaretler. Host bu öğelerin dikdörtgenlerini Rust'a bildirir; imleç bir adın üstüne
 * gelince pencere fareyi alır (bkz. src-tauri/src/livechat/inputbox.rs), kalan yerler oyuna tıklanmaya devam eder.
 */
const [on, setOn] = createSignal(false);
export const replayClick = on;
export const setReplayClick = setOn;

/** Canlı yayına dön ve kamerayı bu araca çevir */
export function watchLive(number: string) {
  if (!inTauri || !number) return;
  invoke("watch_car_live", { number }).catch((e) => console.warn("watch_car_live", e));
}

/** Bildirilmiş bölgeler: kimlik → dikdörtgen (JSON) */
const sent = new Map<string, string>();
/**
 * Sayfadaki tıklanabilir adların yerlerini bildir (değişenleri). Canlı Sohbet mesaj kutusunun tıklanabilir bölge
 * düzeneği kullanılır (Rust: livechat/inputbox.rs): imleç yalnızca bu dikdörtgenlerin üstündeyken pencere fareyi alır.
 */
export function reportClickRects(active: boolean) {
  if (!inTauri) return;
  const now = new Map<string, string>();
  if (active) {
    const k = window.devicePixelRatio || 1;
    let i = 0;
    document.querySelectorAll<HTMLElement>("[data-replay-click]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && i < 200)
        now.set(`rc-${i++}`, JSON.stringify({ x: Math.round(r.left * k), y: Math.round(r.top * k), w: Math.round(r.width * k), h: Math.round(r.height * k) }));
    });
  }
  for (const [id, rect] of now) {
    if (sent.get(id) === rect) continue;
    sent.set(id, rect);
    invoke("livechat_input", { id, op: "region", rect: JSON.parse(rect) }).catch(() => {});
  }
  for (const id of [...sent.keys()]) {
    if (now.has(id)) continue;
    sent.delete(id);
    invoke("livechat_input", { id, op: "remove", rect: null }).catch(() => {});
  }
}
