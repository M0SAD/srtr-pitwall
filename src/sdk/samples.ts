// Kontrol panelindeki canlı önizleme için örnek veriler.

import { injectTopic } from "./telemetry";
import type { FuelRow, Row } from "./types";

export function sampleRow(p: Partial<Row>): Row {
  return {
    idx: 0,
    pos: 1,
    classPos: 1,
    classId: 1,
    className: "GT3",
    classColor: "#33ceff",
    number: "7",
    name: "Sürücü",
    car: "Porsche",
    carName: "Porsche 911 GT3 R",
    userId: 0,
    flair: "DE",
    irating: 2100,
    irDelta: 0,
    license: "A 3.10",
    licLetter: "A",
    sr: 3.1,
    licColor: "#0153db",
    gap: 0,
    interval: 0,
    lapsDown: 0,
    lapRel: 0,
    last: 98.4,
    best: 97.9,
    avg5: 98.6,
    lastPb: false,
    onPit: false,
    pitState: "",
    stint: 6,
    pits: 0,
    tire: 0,
    flag: "",
    posChange: 0,
    isMe: false,
    classBest: false,
    ...p,
  };
}

const fr = (usage: number, level: number, max: number, left: number): FuelRow => ({
  usage,
  laps: level / usage,
  stint: max / usage,
  refuel: Math.max(0, left * usage - level),
});

export function injectSamples() {
  injectTopic("relative", {
    rows: [
      sampleRow({ classPos: 3, number: "44", name: "Luca Rossi", gap: 2.4, lapRel: 1, classColor: "#ffda59", licLetter: "P", sr: 4.2, licColor: "#222", irating: 6100, irDelta: 12 }),
      sampleRow({ classPos: 11, number: "12", name: "Emre Kaya", gap: 0.9, irating: 1800, licLetter: "B", sr: 2.8, licColor: "#00c702", irDelta: 38, pitState: "OUT" }),
      sampleRow({ classPos: 12, number: "59", name: "Sen", isMe: true, irating: 2450, sr: 3.45, irDelta: -6, lastPb: true }),
      sampleRow({ classPos: 13, number: "3", name: "Noah Fischer", gap: -1.3, irating: 3200, sr: 4.1, irDelta: -22, flag: "BLU" }),
      sampleRow({ classPos: 18, number: "71", name: "Finn Larsen", gap: -3.1, lapRel: -1, licLetter: "C", sr: 3.0, licColor: "#fec600", irDelta: 51 }),
    ],
    airTemp: 22.5,
    trackTemp: 31.2,
    wetness: 1,
    humidity: 0.55,
    precip: 0.1,
    sof: 2350,
    incidents: 4,
    incidentLimit: 17,
    timeRemain: 1420,
    lapsRemain: 32767,
  });
  injectTopic("delta", { delta: -0.34, valid: true, trend: -0.02, current: 62.3, last: 98.412, best: 97.873 });
  const level = 38.4;
  const max = 110;
  const left = 17.6;
  injectTopic("fuel", {
    level,
    pct: level / max,
    max,
    lap: 9,
    last: fr(2.9, level, max, left),
    avg5: fr(2.86, level, max, left),
    avg10: fr(2.88, level, max, left),
    worst: fr(2.97, level, max, left),
    raceLapsLeft: left,
    raceNeeded: left * 2.86,
    stintTime: 610,
    lapTime: 98.6,
    timeToEmpty: (level / 2.86) * 98.6,
    targets: [
      [14, level / 14],
      [15, level / 15],
      [16, level / 16],
    ],
    pitOpen: 14,
    pitClose: 22,
    pitOpenIn: 380,
    pitCloseIn: 1300,
    samples: 5,
  });
}
