// Dashboard verisi: canlı konular (uygulamada Tauri kanalı, tarayıcıda SSE) ya da örnek veri.

import { createSignal, onCleanup } from "solid-js";
import { useTopic, type Sub } from "@/sdk/telemetry";
import type { DashData } from "./model";

/** Özel dashboard'un ihtiyaç duyduğu konular */
export const DASH_TOPICS: Sub[] = [
  { name: "telemetry", hz: 30 },
  { name: "inputs", hz: 30 },
  { name: "delta", hz: 15 },
  { name: "ers", hz: 10 },
  { name: "laps", hz: 2 },
  { name: "fuel", hz: 2 },
  { name: "session", hz: 2 },
  { name: "relative", hz: 2 },
  { name: "tires", hz: 1 },
  { name: "weather", hz: 1 },
];

/** Örnek veri: `t` saniye; devir ve hız hafifçe oynar ki çubuklar / ışıklar canlı görünsün */
export function demoData(t = 0): DashData {
  const k = (Math.sin(t * 1.3) + 1) / 2;
  const rpm = 6400 + k * 2450;
  return {
    tel: {
      gear: 4,
      speed: (172 + k * 36) / 3.6,
      rpm,
      slFirst: 7400,
      slShift: 8600,
      slLast: 8600,
      slBlink: 8900,
      redline: 9000,
      position: 4,
      classPosition: 4,
      posChange: 2,
      lap: 12,
      last: 109.37,
      best: 109.156,
      fuelLevel: 38.4,
      fuelPct: 0.35,
      trackTemp: 46.7,
      airTemp: 24.2,
      abs: 6,
      absActive: false,
      tc: 3,
      brakeBias: 54.5,
      oilTemp: 104.2,
      waterTemp: 88.6,
      onPitRoad: false,
    },
    inputs: { throttle: 0.4 + k * 0.6, brake: 0, clutch: 0, steer: 0.12, gear: 4, speed: 52, rpm, shiftRpm: 8600, redline: 9000, abs: false },
    delta: { delta: -0.12 + k * 0.2, valid: true, trend: -0.01, current: 52.1, last: 109.37, best: 109.156, sessionDelta: 0.41, sessionValid: true, optimalDelta: 0.63, optimalValid: true },
    laps: { current: [40.4], bestSectors: [40.1, 37.2, 31.8], optimal: 109.1, lapPct: 0.48 },
    ses: { sessionType: "Race", track: "Spa-Francorchamps", flags: ["green"], lap: 12, lapsCompleted: 11, lapsRemain: 18, totalLaps: 30, position: 4, classPosition: 4, carCount: 22, incidents: 2, incidentLimit: 17, trackTemp: 46.7, airTemp: 24.2, timeRemain: 1980, wetness: 1 },
    fuel: {
      level: 38.4,
      pct: 0.35,
      max: 110,
      stintTime: 1845,
      timeToEmpty: 1460,
      raceNeeded: 51.5,
      avg5: { usage: 2.86, laps: 13.4, stint: 38.4, refuel: 13.1 },
      last: { usage: 2.91, laps: 13.2, stint: 38.4, refuel: 13.4 },
    },
    tires: {
      corners: [
        { temp: [88, 92, 95], wear: [0.9, 0.88, 0.86], press: 172 },
        { temp: [91, 94, 90], wear: [0.88, 0.87, 0.89], press: 172 },
        { temp: [84, 86, 87], wear: [0.93, 0.92, 0.92], press: 168 },
        { temp: [85, 87, 85], wear: [0.92, 0.92, 0.93], press: 168 },
      ],
      compound: 0,
      available: true,
      onPit: false,
    },
    ers: { hasHybrid: true, batteryPct: 0.64, batteryMj: 2.6, lapDeployLeft: 0.55, mgukKw: 85, mguhKw: null, mode: 3, modeSet: 0, regenGain: 2, p2pCount: 6, p2pActive: false, drs: 2, lap: 12, lapPct: 0.48, onPitRoad: false, onTrack: true },
    rel: {
      sof: 2450,
      rows: [
        { isMe: false, name: "M. Keller", gap: 1.8 },
        { isMe: true, name: "Sen", gap: 0 },
        { isMe: false, name: "J. Ortiz", gap: -0.9 },
      ] as never,
    },
    wx: { airTemp: 24.2, trackTemp: 46.7, humidity: 0.55, windVel: 3.2, wetness: 1 },
    status: { carName: "GT3", track: "Spa-Francorchamps", sessionType: "Race" },
  };
}

/** Canlı veri (abonelik çağıranın işi: DASH_TOPICS) */
export function useLiveDash(): () => DashData {
  const tel = useTopic("telemetry");
  const inputs = useTopic("inputs");
  const delta = useTopic("delta");
  const laps = useTopic("laps");
  const ses = useTopic("session");
  const fuel = useTopic("fuel");
  const tires = useTopic("tires");
  const ers = useTopic("ers");
  const rel = useTopic("relative");
  const wx = useTopic("weather");
  const status = useTopic("status");
  return () => ({ tel: tel(), inputs: inputs(), delta: delta(), laps: laps(), ses: ses(), fuel: fuel(), tires: tires(), ers: ers(), rel: rel(), wx: wx(), status: status() });
}

/** Hareketli örnek veri (tasarımcı önizlemesi, bağlantı yokken) */
export function useDemoDash(animate: () => boolean = () => true): () => DashData {
  const [t, setT] = createSignal(0);
  const start = Date.now();
  const iv = setInterval(() => animate() && setT((Date.now() - start) / 1000), 100);
  onCleanup(() => clearInterval(iv));
  return () => demoData(t());
}
