// Data Frame overlay'inin gösterebileceği değerler. Yeni değer eklemek için listeye bir satır ekle.

import type { Units } from "@/sdk/overlay";
import type { Delta, Fuel, Session, Telemetry } from "@/sdk/types";
import { clock, wallClock, fuel, fuelUnit, gear, lapTime, signed, speed, speedUnit, temp } from "@/sdk/format";

export interface Src {
  tel?: Telemetry;
  ses?: Session;
  fuel?: Fuel;
  delta?: Delta;
}

export interface Metric {
  id: string;
  label: string;
  /** Değer ve (varsa) birim */
  get: (s: Src, u: Units) => [string, string?] | null;
  /** Rengi değere göre (ör. delta) */
  tone?: (s: Src) => "pos" | "neg" | "";
}

const num = (v: number | undefined, d = 0) => (v == null || !isFinite(v) || v < 0 ? "—" : v.toFixed(d));

export const METRICS: Metric[] = [
  { id: "speed", label: "Hız", get: (s, u) => (s.tel ? [speed(s.tel.speed, u), speedUnit(u)] : null) },
  { id: "gear", label: "Vites", get: (s) => (s.tel ? [gear(s.tel.gear)] : null) },
  { id: "rpm", label: "Devir", get: (s) => (s.tel ? [Math.round(s.tel.rpm).toString(), "rpm"] : null) },
  {
    id: "position",
    label: "Pozisyon",
    get: (s) => (s.ses ? [`P${s.ses.classPosition || s.ses.position || "—"}`, `/${s.ses.carCount}`] : null),
  },
  { id: "lap", label: "Tur", get: (s) => (s.ses ? [String(s.ses.lap)] : null) },
  {
    id: "remain",
    label: "Kalan",
    get: (s) => {
      if (!s.ses) return null;
      if (s.ses.lapsRemain > 0 && s.ses.lapsRemain < 32767) return [String(s.ses.lapsRemain), "tur"];
      return [clock(s.ses.timeRemain)];
    },
  },
  { id: "last", label: "Son tur", get: (s) => (s.delta ? [lapTime(s.delta.last)] : null) },
  { id: "best", label: "En iyi tur", get: (s) => (s.delta ? [lapTime(s.delta.best)] : null) },
  { id: "current", label: "Şimdiki tur", get: (s) => (s.delta ? [lapTime(s.delta.current, 1)] : null) },
  {
    id: "delta",
    label: "Delta (en iyi)",
    get: (s) => (s.delta?.valid ? [signed(s.delta.delta)] : s.delta ? ["—"] : null),
    tone: (s) => (!s.delta?.valid ? "" : s.delta.delta < 0 ? "pos" : "neg"),
  },
  { id: "fuel", label: "Yakıt", get: (s, u) => (s.fuel ? [fuel(s.fuel.level, u), fuelUnit(u)] : null) },
  {
    id: "fuelLaps",
    label: "Yakıt yeter (tur)",
    get: (s) => (s.fuel ? [s.fuel.avg5.laps > 0 ? s.fuel.avg5.laps.toFixed(1) : "—", "tur"] : null),
  },
  {
    id: "fuelPerLap",
    label: "Tur başı yakıt",
    get: (s, u) => (s.fuel ? [s.fuel.avg5.usage > 0 ? fuel(s.fuel.avg5.usage, u, 2) : "—", fuelUnit(u)] : null),
  },
  { id: "incidents", label: "Olay", get: (s) => (s.ses ? [`${s.ses.incidents}x`] : null) },
  { id: "trackTemp", label: "Pist sıcaklığı", get: (s, u) => (s.ses ? [temp(s.ses.trackTemp, u)] : null) },
  { id: "airTemp", label: "Hava sıcaklığı", get: (s, u) => (s.ses ? [temp(s.ses.airTemp, u)] : null) },
  { id: "bb", label: "Fren dengesi", get: (s) => (s.tel ? [num(s.tel.brakeBias, 1), "%"] : null) },
  { id: "tc", label: "TC", get: (s) => (s.tel ? [num(s.tel.tc)] : null) },
  { id: "abs", label: "ABS", get: (s) => (s.tel ? [num(s.tel.abs)] : null) },
  { id: "clock", label: "Saat", get: () => [wallClock(Date.now())] },
];
