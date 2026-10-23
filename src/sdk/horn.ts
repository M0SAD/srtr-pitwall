// Korna çalan araç (src/host/horn.ts "horn-honk" olayı { idx }): Relative ve Radar overlay'lerinde 2 sn kısa işaret.
import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./platform";

const SHOW_MS = 2000;
const [honks, setHonks] = createSignal<Record<number, number>>({});
let bound = false;

function bind() {
  if (bound || !inTauri) return;
  bound = true;
  void listen<{ idx: number }>("horn-honk", (e) => {
    const idx = Number(e.payload?.idx);
    if (!Number.isInteger(idx) || idx < 0) return;
    const until = Date.now() + SHOW_MS;
    setHonks((m) => ({ ...m, [idx]: until }));
    setTimeout(() => setHonks((m) => (m[idx] === until ? Object.fromEntries(Object.entries(m).filter(([k]) => Number(k) !== idx)) : m)), SHOW_MS + 50);
  });
}

/** Bu araç az önce korna çaldı mı */
export function honking(idx: number | undefined) {
  bind();
  return idx != null && (honks()[idx] ?? 0) > Date.now();
}
