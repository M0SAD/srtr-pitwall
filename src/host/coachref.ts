// Canlı Kıyas overlay'i için referans turları indirir (topluluk rekoru / topluluk ortalaması / kendi rekorum) ve motora
// verir (`coach_ref_set`). Yalnızca bir düzende Canlı Kıyas açıkken çalışır; pist + araç değişince yeniden arar.

import { invoke } from "@tauri-apps/api/core";
import { settings } from "@/sdk/settings";
import { session } from "@/cloud/supabase";
import { loadRef, type RefKind } from "@/cloud/teleref";

interface Combo {
  sim: string;
  trackId: string;
  trackConfig: string;
  carId: string;
}

const KINDS: RefKind[] = ["best", "avg", "mine"];

/** Düzenlerde seçili referans türleri */
function wanted(): Set<RefKind> {
  const out = new Set<RefKind>();
  const s = settings();
  for (const p of Object.values(s.profiles))
    for (const o of Object.values(p.overlays))
      if (o.type === "coach" && o.enabled !== false) {
        const k = o.options?.reference as RefKind;
        out.add(KINDS.includes(k) ? k : "best");
      }
  return out;
}

let started = false;
export function startCoachRef() {
  if (started) return;
  started = true;
  /** tür → en son verilen pist + araç anahtarı */
  const done = new Map<string, string>();
  const retry = new Map<string, number>();
  let busy = false;
  const tick = async () => {
    const kinds = wanted();
    if (busy || !kinds.size) return;
    busy = true;
    try {
      const c = await invoke<Combo>("brake_combo");
      const key = c?.sim && c.trackId && c.carId ? `${c.sim}|${c.trackId}|${c.trackConfig}|${c.carId}` : "";
      if (!key) {
        done.clear();
        return;
      }
      for (const kind of kinds) {
        const id = `${kind}`;
        if (done.get(id) === key || Date.now() < (retry.get(id) ?? 0)) continue;
        const send = (status: string, extra: Record<string, unknown> = {}) => invoke("coach_ref_set", { reference: { combo: c, kind, status, name: "", time: 0, laps: 0, ...extra } });
        if (kind === "mine" && !session()) {
          await send("login");
          retry.set(id, Date.now() + 60_000);
          continue;
        }
        await send("loading");
        try {
          const r = await loadRef(kind, { sim: c.sim, track_id: c.trackId, track_config: c.trackConfig, car_id: c.carId });
          if (r) {
            await send("ok", { name: r.name, time: r.time, laps: r.laps, trace: r.trace });
            done.set(id, key);
          } else {
            // Yeterli veri yok: 5 dakikada bir yeniden bakılır (o sırada biri tur paylaşmış olabilir)
            await send("nodata");
            retry.set(id, Date.now() + 300_000);
          }
        } catch {
          await send("nodata");
          retry.set(id, Date.now() + 120_000);
        }
      }
    } catch {
      /* motor hazır değil */
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), 5000);
}
