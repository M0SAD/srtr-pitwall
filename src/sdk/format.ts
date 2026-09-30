import type { Units } from "./overlay";
import { localeTag } from "./i18n";

/** 83.456 -> "1:23.456" */
export function lapTime(t: number | undefined | null, digits = 3): string {
  if (t == null || !isFinite(t) || t <= 0) return "--:--.---".slice(0, 6 + digits);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(digits).padStart(digits + 3, "0");
  return m > 0 ? `${m}:${ss}` : s.toFixed(digits);
}

/** Saniye cinsinden süreyi "1:02:05" ya da "12:05" olarak yazar. */
export function clock(t: number): string {
  if (!isFinite(t) || t < 0) return "--:--";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Kullanıcı tercihleri (Ayarlar → Genel): overlay pencereleri ayarlar değişince günceller */
export const formatPrefs = { hour12: false, speedMph: false };

/** Unix ms -> yerel saat "14:05" (ya da "2:05 PM") */
export function wallClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(localeTag(), {
    hour: "numeric",
    minute: "2-digit",
    hour12: formatPrefs.hour12,
  });
}

/** İşaretli fark: +0.42 / -1.20 */
export function signed(v: number, digits = 2): string {
  if (!isFinite(v)) return "-";
  return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits);
}

export function speed(ms: number, units: Units): string {
  return Math.round(units === "metric" && !formatPrefs.speedMph ? ms * 3.6 : ms * 2.23694).toString();
}

export function speedUnit(units: Units) {
  return units === "metric" && !formatPrefs.speedMph ? "km/h" : "mph";
}

export function fuel(l: number, units: Units, digits = 1): string {
  if (!isFinite(l)) return "-";
  return (units === "metric" ? l : l * 0.264172).toFixed(digits);
}

export function fuelUnit(units: Units) {
  return units === "metric" ? "L" : "gal";
}

export function temp(c: number, units: Units): string {
  return units === "metric" ? `${c.toFixed(1)}°C` : `${(c * 1.8 + 32).toFixed(1)}°F`;
}

/** 2450 -> "2.4k" */
export function irating(v: number): string {
  if (!v) return "-";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

export function gear(g: number): string {
  return g < 0 ? "R" : g === 0 ? "N" : String(g);
}

/** Rüzgâr hızı: m/s -> km/h ya da mph */
export function wind(ms: number, units: Units): string {
  return Math.round(units === "metric" ? ms * 3.6 : ms * 2.23694).toString();
}

export function windUnit(units: Units) {
  return units === "metric" && !formatPrefs.speedMph ? "km/h" : "mph";
}

/** 0..1 -> "%70"; bilinmiyorsa "—" */
export function pct(v: number | undefined | null): string {
  if (v == null || !isFinite(v) || v < 0) return "—";
  return `${Math.round(v * 100)}%`;
}

/** Saniye -> "4:03" dakika:saniye (saatli ise 1:04:03) */
export function duration(t: number): string {
  return clock(t);
}

/** Pozitif farka + koyar: 3 -> "+3", -2 -> "−2", 0 -> "0" */
export function change(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
}
