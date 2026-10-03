// Canlı taşıma: bir pencerede (panel Düzenler ekranı ya da overlay düzenleme modu) overlay
// sürüklenirken/boyutlandırılırken konum diğer pencerelere anında gönderilir; bırakınca ayar kaydedilir.
// Konum kayıtlı yerleşim biriminde (ayarlardaki x, y, scale) taşınır.

import { createSignal } from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./platform";
import { onRemoteDrag } from "./telemetry";

export interface LivePos {
  profile: string;
  key: string;
  x: number;
  y: number;
  scale: number;
  /** Kenardan boyutlandırmada değişen ayarlar (genişlik / yükseklik; bkz. OverlayManifest.resize) */
  opts?: Record<string, number>;
}

const me = inTauri ? getCurrentWindow().label : "web";
const [remote, setRemote] = createSignal<Record<string, LivePos>>({});
const id = (profile: string, key: string) => `${profile}/${key}`;

type DragMsg = { from: string; pos: LivePos; end?: boolean };
function apply(msg: DragMsg | undefined | null) {
  const p = msg?.pos;
  if (!msg || !p || typeof p.profile !== "string" || typeof p.key !== "string" || msg.from === me) return;
  const k = id(p.profile, p.key);
  setRemote((m) => {
    const n = { ...m };
    if (msg.end) delete n[k];
    else n[k] = p;
    return n;
  });
}

if (inTauri) {
  listen<DragMsg>("overlay-live-drag", (e) => apply(e.payload)).catch(() => {});
} else {
  // OBS sayfası: Rust aynı olayı web sunucusunun canlı veri akışından (SSE, "drag" paketi) iletir
  onRemoteDrag((v) => apply(v as DragMsg));
}

/** Başka bir pencerede şu an taşınan overlay'in geçici konumu */
export function remoteDrag(profile: string | undefined, key: string): LivePos | undefined {
  if (!profile) return undefined;
  return remote()[id(profile, key)];
}

let pending: LivePos | null = null;
let raf = 0;
/** Taşıma sırasında konumu gönder (kare başına en fazla bir kez) */
export function sendDrag(pos: LivePos) {
  if (!inTauri) return;
  pending = pos;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (pending) emit("overlay-live-drag", { from: me, pos: pending }).catch(() => {});
  });
}

/** Taşıma bitti: diğer pencereler geçici konumu bırakır (kayıtlı ayar zaten gelir) */
export function endDrag(pos: LivePos) {
  if (!inTauri) return;
  pending = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  // Kayıtlı ayar diğer pencereye ulaşana kadar geçici konum kalsın
  setTimeout(() => emit("overlay-live-drag", { from: me, pos, end: true }).catch(() => {}), 250);
}
