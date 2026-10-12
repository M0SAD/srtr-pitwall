// DigiFlags: hangi bayrağın yanacağı (saf mantık; Overlay.tsx kullanır, testi: scratchpad).
import type { FlagName } from "@/sdk/types";

/** Yeşil bayrak ailesi: iRacing başlangıç öncesi / sonrası "greenHeld" ve "oneLapToGreen" bitlerini uzun süre açık tutar */
export const GREEN_NAMES: FlagName[] = ["oneLapToGreen", "greenHeld", "green"];

export const isGreen = (n: FlagName) => GREEN_NAMES.includes(n);

/**
 * Önem sırasına göre ilk eşleşen bayrak tanımı.
 * Yeşil ailesi yalnızca `showGreen` açıksa ve yeşil ilk göründükten sonra `greenMs` süresi dolmadıysa yanar
 * (gerçek panellerdeki gibi kısa süre; bayrak simde açık kalsa da ekranda kalmaz).
 */
export function pickFlag<T extends { names: FlagName[] }>(
  defs: T[],
  flags: readonly FlagName[],
  opt: { showGreen: boolean; greenSince: number | null; greenMs: number; now: number },
): T | undefined {
  const greenOk = opt.showGreen && opt.greenSince != null && (opt.greenMs <= 0 || opt.now - opt.greenSince < opt.greenMs);
  return defs.find((d) => d.names.some((n) => flags.includes(n) && (!isGreen(n) || greenOk)));
}
