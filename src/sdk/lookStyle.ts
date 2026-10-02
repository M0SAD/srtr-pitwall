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
export function lookStyle(look: OverlayLook | undefined, t: Theme): Record<string, string> {
  return lookVars(effectiveLook(look), t);
}
