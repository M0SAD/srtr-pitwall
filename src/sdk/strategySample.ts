// Strateji overlay'leri (Pit Penceresi, Stint Özeti, Sürücü Değişimi) için düzenleme modunda, sim verisi yokken
// gösterilen örnek veri.

import type { Fuel, StratCar, StratStint, Strategy } from "./types";

const car = (idx: number, number: string, name: string, behind: number, raceGap: number, pos: number, classPos: number, same = true): StratCar => ({
  idx,
  number,
  name,
  className: same ? "GT3" : "LMP2",
  classColor: same ? "#33ceff" : "#ffda59",
  sameClass: same,
  pos,
  classPos,
  behind,
  raceGap,
  onPit: false,
});

const stint = (n: number, driver: string, startLap: number, laps: number, avg: number, trend: number, fuelAvg: number, pitTime: number, current = false): StratStint => ({
  n,
  driver,
  startLap,
  laps,
  time: laps * avg + 12,
  avg,
  best: avg - 0.58,
  last: avg + 0.21,
  trend,
  trendOk: true,
  fuelAvg,
  fuelUsed: fuelAvg * laps,
  tyreLaps: laps,
  tyreKnown: true,
  pitTime,
  current,
  lapTimes: Array.from({ length: Math.min(laps, 24) }, (_, i) => avg - 0.4 + trend * i + (((i * 7) % 5) - 2) * 0.07),
});

export const STRATEGY_SAMPLE: Strategy = {
  race: true,
  multiclass: true,
  lapTime: 98.6,
  position: 9,
  classPosition: 6,
  onPitRoad: false,
  pitElapsed: -1,
  pitLoss: 27.4,
  pitLossSamples: 3,
  pitLossLast: 27.9,
  track: "Demo Pisti",
  cars: [
    car(1, "12", "Emre Kaya", 3.1, 3.1, 10, 7),
    car(2, "71", "Finn Larsen", 9.4, 9.4, 11, 8),
    car(3, "8", "Marco Bianchi", 14.2, -84.4, 3, 1, false),
    car(4, "44", "Luca Rossi", 22.6, 22.6, 12, 9),
    car(5, "27", "Noah Fischer", 25.1, 25.1, 13, 10),
    car(6, "3", "Kenji Sato", 31.8, 31.8, 14, 11),
    car(7, "90", "Ali Demir", 38.5, 38.5, 15, 12),
    car(8, "5", "Hugo Martin", 61.0, 61.0, 17, 13),
    car(9, "21", "Sven Olsen", 92.3, -6.3, 8, 5),
  ],
  stints: [
    stint(1, "Deniz Arslan", 0, 23, 99.42, 0.045, 2.91, 41.8),
    stint(2, "Mert Yıldız", 23, 17, 98.89, 0.03, 2.87, 43.1),
    stint(3, "Sen", 40, 9, 98.61, -0.035, 2.86, -1, true),
  ],
  team: true,
  teamName: "Demo Endurance",
  driver: "Sen",
  driveTime: 905,
  drivers: [
    { name: "Deniz Arslan", userId: 1, time: 2320, laps: 23, stints: 1, current: false },
    { name: "Mert Yıldız", userId: 2, time: 1720, laps: 17, stints: 1, current: false },
    { name: "Sen", userId: 3, time: 905, laps: 9, stints: 1, current: true },
  ],
  trackedFrom: 0,
  sessionTime: 4990,
};

export const FUEL_SAMPLE: Pick<Fuel, "lap" | "avg5" | "raceLapsLeft" | "pitOpen" | "pitClose" | "level"> = {
  lap: 50,
  level: 38.4,
  avg5: { usage: 2.86, laps: 13.4, stint: 38.5, refuel: 12 },
  raceLapsLeft: 17.6,
  pitOpen: 48,
  pitClose: 63,
};
