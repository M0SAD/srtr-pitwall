// Fren ve Vites İşareti › "Topluluk rekoru": bu pist ve araç için topluluk telemetrisindeki en hızlı (izi paylaşılmış)
// turu bulur, izinden fren / gaz kesme noktalarını çıkarır ve motora verir (`brake_community_set`).
// Yalnızca bir düzende bu kaynak seçiliyken çalışır; pist + araç değişince yeniden arar.

import { invoke } from "@tauri-apps/api/core";
import { settings } from "@/sdk/settings";
import type { SimId, Trace } from "@/cloud/telemetry";
import { loadRef } from "@/cloud/teleref";
import type { BrakeZone } from "@/sdk/drivecues";

interface Combo {
  sim: string;
  trackId: string;
  trackConfig: string;
  carId: string;
}

/** Bir düzende (ya da overlay varsayılanında) "Topluluk rekoru" seçili mi */
function wanted(): boolean {
  const s = settings();
  if (s.defaults?.brakepoint?.options?.source === "community") return true;
  for (const p of Object.values(s.profiles)) for (const o of Object.values(p.overlays)) if (o.type === "brakepoint" && o.enabled !== false && o.options?.source === "community") return true;
  return false;
}

/** İzden fren / gaz kesme noktaları (Rust `drivecues.rs` ile aynı eşikler) */
export function zonesFromTrace(tr: Trace): BrakeZone[] {
  const n = tr.n;
  const zones: BrakeZone[] = [];
  if (!n || tr.brake.length < n || tr.throttle.length < n) return zones;
  let corner = false;
  let cornerT = 0;
  let braking = false;
  let rel = 0;
  let thrHigh = false;
  let lift: { pct: number; age: number } | null = null;
  for (let i = 1; i < n; i++) {
    const pct = i / n;
    const dt = Math.max(0, ((tr.t[i] ?? 0) - (tr.t[i - 1] ?? 0)) / 1000);
    const thr = (tr.throttle[i] ?? 0) / 100;
    const br = (tr.brake[i] ?? 0) / 100;
    const v = (tr.speed[i] ?? 0) / 36;
    const gear = tr.gear[i] ?? 0;
    const fast = v > 14;
    if (thr > 0.8) thrHigh = true;
    if (lift) lift.age += dt;
    if (thrHigh && thr < 0.2) {
      thrHigh = false;
      lift = { pct, age: 0 };
    }
    const last = zones[zones.length - 1];
    if (corner && last) {
      cornerT += dt;
      if (gear > 0 && (last.gear <= 0 || gear < last.gear)) last.gear = gear;
      last.minSpeed = Math.min(last.minSpeed, v);
      if ((thr > 0.6 && br < 0.05 && cornerT > 0.5) || cornerT > 12) corner = false;
    }
    if (braking) {
      if (br < 0.05) {
        rel += dt;
        if (rel > 0.35) braking = false;
      } else rel = 0;
    }
    if (!braking && br > 0.12 && fast) {
      braking = true;
      rel = 0;
      if (corner && last && last.kind === 1) {
        last.lift = last.pct;
        last.pct = pct;
        last.kind = 0;
      } else if (!corner) {
        zones.push({ pct, kind: 0, gear, speed: v, minSpeed: v, lift: lift && lift.age < 2.5 ? lift.pct : -1 });
        corner = true;
        cornerT = 0;
      }
    }
    if (!corner && !braking && fast && br < 0.05 && thr < 0.2 && lift && lift.age >= 0.4 && lift.age < 2.5) {
      zones.push({ pct: lift.pct, kind: 1, gear, speed: v, minSpeed: v, lift: lift.pct });
      corner = true;
      cornerT = 0;
      lift = null;
    }
  }
  return zones.slice(0, 150);
}

async function fetchRef(c: Combo): Promise<boolean> {
  // Canlı Kıyas ile aynı önbellekli kaynak: aynı pist + araç için sunucuya en fazla 12 saatte bir gidilir
  const r = await loadRef("best", { sim: c.sim, track_id: c.trackId, track_config: c.trackConfig, car_id: c.carId });
  if (!r) return false;
  const zones = zonesFromTrace(r.trace);
  if (!zones.length) return false;
  await invoke("brake_community_set", { reference: { combo: c, time: r.time, name: r.name, zones } });
  return true;
}

let started = false;
export function startBrakeRef() {
  if (started) return;
  started = true;
  let doneKey = "";
  let failAt = 0;
  let busy = false;
  const tick = async () => {
    if (busy || !wanted()) return;
    busy = true;
    try {
      const c = await invoke<Combo>("brake_combo");
      const key = c?.sim && c.trackId && c.carId ? `${c.sim}|${c.trackId}|${c.trackConfig}|${c.carId}` : "";
      if (!key) {
        // Sim kapandı: yeniden bağlanınca aynı pist için de tekrar verilir (motor referansı oturumla birlikte siler)
        doneKey = "";
        return;
      }
      if (key === doneKey || Date.now() - failAt < 120_000) return;
      if (await fetchRef({ ...c, sim: c.sim as SimId })) doneKey = key;
      else failAt = Date.now();
    } catch {
      failAt = Date.now();
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), 5000);
}
