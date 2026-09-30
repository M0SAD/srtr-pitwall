// Pist şekli önbelleği. "map" paketleri şekli sadece değişince taşır;
// burada saklanır ve haritayı kullanan tüm overlay'ler paylaşır.

import { createEffect, createRoot, createSignal } from "solid-js";
import { useTopic } from "./telemetry";

export interface Shape {
  version: number;
  pts: [number, number][];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

const [shape, setShape] = createSignal<Shape | null>(null);
let tracking = false;

function build(version: number, pts: [number, number][]): Shape {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { version, pts, bbox: { minX, maxX, minY, maxY } };
}

/** Harita verisini ve önbelleklenmiş şekli döner. */
export function useTrack() {
  const map = useTopic("map");
  if (!tracking) {
    tracking = true;
    // Kök seviyesinde: overlay kapanıp açılsa da önbellek güncellenmeye devam eder
    createRoot(() =>
      createEffect(() => {
        const m = map();
        if (!m) return;
        if (m.shape && m.shape.length > 10) {
          if (shape()?.version !== m.version) setShape(build(m.version, m.shape));
        }
        else if (!m.hasShape) setShape(null);
      }),
    );
  }
  return { map, shape };
}

/** Tur yüzdesindeki nokta (doğrusal ara değer) */
export function pointAt(s: Shape, pct: number): [number, number] {
  const n = s.pts.length;
  const f = (((pct % 1) + 1) % 1) * n;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const k = f - Math.floor(f);
  return [s.pts[i][0] + (s.pts[j][0] - s.pts[i][0]) * k, s.pts[i][1] + (s.pts[j][1] - s.pts[i][1]) * k];
}

/** Tur yüzdesindeki yön (rad, +y'ye göre saat yönünde) */
export function headingAt(s: Shape, pct: number): number {
  const a = pointAt(s, pct);
  const b = pointAt(s, pct + 0.004);
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
}
