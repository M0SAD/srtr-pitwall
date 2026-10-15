// DigiFlags: hangi bayrağın yanacağı (saf mantık; Overlay.tsx kullanır, testi: scratchpad).
import type { FlagName } from "@/sdk/types";

/** Yeşil bayrak ailesi: iRacing başlangıç öncesi / sonrası "greenHeld" ve "oneLapToGreen" bitlerini uzun süre açık tutar */
export const GREEN_NAMES: FlagName[] = ["oneLapToGreen", "greenHeld", "green"];

export const isGreen = (n: FlagName) => GREEN_NAMES.includes(n);

/** Sarı / kırmızı gibi yarışı durduran bayraklar: bunlar kalkınca gelen yeşil yeni bir yeşil sayılır */
const HOLD: FlagName[] = ["caution", "cautionWaving", "yellow", "yellowWaving", "red", "checkered"];

/**
 * Yeşilin "durumu": hangi yeşil işaretleri var (+ durdurucu bayrak var mı). Bu değişince yeşil yeniden başlamış sayılır
 * (ör. start öncesi uzun süre "greenHeld" → start anında "green"; sarı bayrak kalkınca yeniden yeşil). Yeşil yoksa "".
 */
export function greenState(flags: readonly FlagName[]): string {
  const g = GREEN_NAMES.filter((n) => flags.includes(n));
  if (!g.length) return "";
  return g.join("+") + (HOLD.some((n) => flags.includes(n)) ? "|hold" : "");
}

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
