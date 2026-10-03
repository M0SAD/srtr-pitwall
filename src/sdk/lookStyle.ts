// Kopyanın görünümünü (sdk/look.ts) çizim stiline çevirir; PRO'ya ayrılmış seçenekleri kilitliyken yok sayar.
// Overlay'in çizildiği her yer bunu kullanır: Host (overlay penceresi), Single (OBS / VR), OverlayView (panel önizlemeleri).

import { F, proLocked } from "./proFeatures";
import { LOOK_FREE, lookVars, type OverlayLook } from "./look";
import type { Theme } from "./theme";

/** PRO'ya ayrılmış seçenekler kilitliyken (PRO değil) yok sayılır: overlay o alanlarda temayı kullanır */
export function effectiveLook(look: OverlayLook | undefined): OverlayLook | undefined {
  if (!look) return undefined;
  if (!proLocked(F.overlayLook)) return look;
  const o: Record<string, unknown> = {};
  if (look.on !== undefined) o.on = look.on;
  for (const k of LOOK_FREE) if (look[k] !== undefined) o[k] = look[k];
  return Object.keys(o).some((k) => k !== "on") ? (o as OverlayLook) : undefined;
}

/** Kök sarmalayıcıya yazılacak stil (tema değişkenlerinin üstüne). Görünüm yoksa boş nesne: overlay temadaki gibi çizilir. */
export function lookStyle(look: OverlayLook | undefined, t: Theme, bgOpacity?: number): Record<string, string> {
  const l = effectiveLook(look);
  const v = lookVars(l, t);
  // Kopyanın "Arka plan opaklığı" (0..1): panel arka planının alfasını çarpar; yazılar opak kalır
  const k = typeof bgOpacity === "number" && isFinite(bgOpacity) ? Math.min(1, Math.max(0, bgOpacity)) : 1;
  if (k < 1) {
    const on = l && l.on !== false ? l : undefined;
    v["--ov-bg"] = hexAlpha(on?.bg ?? t.bg, (on?.bgOpacity ?? t.bgOpacity) * k);
    // Kendi arka planını çizen overlay'ler de aynı çarpanı kullanabilsin
    v["--ov-bg-k"] = String(k);
  }
  return v;
}

function hexAlpha(hex: string, alphaPct: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(Math.max(0, Math.min(100, alphaPct)) * 10) / 1000})`;
}
