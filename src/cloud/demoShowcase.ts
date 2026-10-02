// Demo vitrini: demo yarışındaki sahte sürücülerin bir kısmı gerçek PRO üyelerin görünen adlarını taşır.
// Adlar buluttan (demo_pro_names, giriş gerekmez) alınır, karıştırılır ve Rust'a verilir (demo_set_names);
// Rust her demo oturumunun başında rastgele birkaçını seçer, oturum boyunca değişmez.
// Çevrimdışıysa sessizce sadece sahte adlar kullanılır.

import { createEffect, createRoot, createSignal, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { settings } from "@/sdk/settings";
import { api, cloudEnabled, session } from "./supabase";

const REFRESH_MS = 30 * 60_000;
let lastOk = 0;
let busy = false;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function pushNames() {
  if (busy || !cloudEnabled || !inTauri) return;
  if (lastOk && Date.now() - lastOk < REFRESH_MS) return;
  busy = true;
  try {
    const rows = await api<unknown[]>("POST", "rpc/demo_pro_names", { body: { p_limit: 40 }, auth: "optional" });
    // PostgREST "setof text" için düz dizi ya da {demo_pro_names: "..."} nesneleri dönebilir
    const names = (rows ?? [])
      .map((r) => (typeof r === "string" ? r : r && typeof r === "object" ? String(Object.values(r)[0] ?? "") : ""))
      .map((s) => s.trim())
      .filter(Boolean);
    await invoke("demo_set_names", { names: shuffle(names) });
    lastOk = Date.now();
  } catch {
    /* çevrimdışı ya da RPC yok: sahte adlar yeterli */
  } finally {
    busy = false;
  }
}

/** Panel açılınca bir kez, sonra demo her açıldığında (en çok 30 dakikada bir) adları tazeler */
export function startDemoShowcase() {
  if (!inTauri) return;
  setTimeout(() => void pushNames(), 4000);
  createRoot(() =>
    createEffect(
      on(
        () => settings().general.demo,
        (demo) => {
          if (demo) void pushNames();
        },
        { defer: true },
      ),
    ),
  );
}

/** "Demo modunda adım görünebilsin" (profiles.demo_showcase) */
const [demoShowcase, setDemoShowcaseSig] = createSignal<boolean | null>(null);
export { demoShowcase };

export async function loadDemoShowcase() {
  const uid = session()?.user.id;
  if (!uid) return setDemoShowcaseSig(null);
  try {
    const rows = await api<{ demo_showcase?: boolean }[]>("GET", `profiles?id=eq.${uid}&select=demo_showcase`);
    setDemoShowcaseSig(rows?.[0]?.demo_showcase ?? true);
  } catch {
    // Sütun henüz yoksa (SQL c33 uygulanmadı) seçenek gizli kalır
    setDemoShowcaseSig(null);
  }
}

export async function setDemoShowcase(on: boolean) {
  const prev = demoShowcase();
  setDemoShowcaseSig(on);
  try {
    await api("POST", "rpc/demo_showcase_set", { body: { p_on: on } });
  } catch (e) {
    setDemoShowcaseSig(prev);
    throw e;
  }
}
