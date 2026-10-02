// Monitör listesi (Rust'tan). Overlay'ler monitör adıyla (ör. \\.\DISPLAY2) saklanır;
// boş ad "ana overlay monitörü" demektir (Genel ayarlardaki seçim).

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./platform";
import { settings, updateOverlay } from "./settings";
import { manifestById } from "./registry";

export interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  primary: boolean;
}

const [monitors, setMonitors] = createSignal<MonitorInfo[]>([]);
export { monitors };

let loading: Promise<void> | null = null;
let watching = false;
export function loadMonitors(force = false) {
  if (!inTauri) return Promise.resolve();
  if (!watching) {
    watching = true;
    // Monitör takıldı/çıkarıldı (Rust 2 sn'de bir kontrol eder): listeyi hemen yenile
    void listen("monitors-changed", () => void loadMonitors(true)).catch(() => {});
  }
  if (!loading || force) {
    loading = invoke<MonitorInfo[]>("monitors_list")
      .then((m) => void setMonitors(m))
      .catch(() => {});
  }
  return loading;
}

/** Ana overlay monitörü (Genel ayarlardaki seçim, yoksa birincil) */
export function defaultMonitor(): MonitorInfo | undefined {
  const list = monitors();
  const idx = settings().general.monitor;
  return list.find((m) => m.index === idx) ?? list.find((m) => m.primary) ?? list[0];
}

/** Bir kopyanın gerçekte gösterileceği monitör */
export function monitorOf(name: string): MonitorInfo | undefined {
  return (name && monitors().find((m) => m.name === name)) || defaultMonitor();
}

/**
 * Manifesti `defaultCenter` olan kopyayı (ör. Çubuk Spotter) hedef ekranın tam ortasına alır. Sadece kopya hâlâ
 * varsayılan konumundaysa (kullanıcı taşımadıysa) dokunur; ekrana ilk eklenirken çağrılır.
 */
export function centerInstance(key: string, profileId?: string) {
  const cur = settings();
  const p0 = cur.profiles[profileId && cur.profiles[profileId] ? profileId : cur.activeProfile];
  const i0 = p0?.overlays[key];
  const m = i0 && manifestById(i0.type);
  if (!i0 || !m?.defaultCenter) return;
  const base = key !== i0.type ? 40 : 0; // addInstance ek kopyayı 40 px kaydırır
  if (i0.x !== m.defaultPosition.x + base || i0.y !== m.defaultPosition.y + base) return;
  const mon = monitorOf(i0.monitor);
  const sc = mon && mon.scale > 0 ? mon.scale : 1;
  const W = p0.canvas?.w ?? (mon ? mon.width / sc : 1920);
  const H = p0.canvas?.h ?? (mon ? mon.height / sc : 1080);
  const k = (i0.scale || 1) * (cur.theme.scale / 100 || 1);
  const x = Math.round((W - m.size.w * k) / 2);
  const y = Math.round((H - m.size.h * k) / 2);
  if (x === i0.x && y === i0.y) return;
  updateOverlay(key, (o) => ((o.x = x), (o.y = y)), profileId);
}

/** "Monitör 2 (2560×1440)" gibi kısa ad */
export function monitorLabel(m: MonitorInfo) {
  return `Monitör ${m.index + 1}${m.primary ? " (birincil)" : ""} · ${m.width}×${m.height}`;
}

/** Kopya bu pencereye mi ait? `windowMonitor` boş: ana pencere. */
export function belongsTo(instMonitor: string, windowMonitor: string) {
  if (!inTauri) return true;
  const def = defaultMonitor();
  const exists = monitors().some((m) => m.name === instMonitor);
  if (windowMonitor) return instMonitor === windowMonitor && instMonitor !== def?.name;
  return !instMonitor || !exists || instMonitor === def?.name;
}
