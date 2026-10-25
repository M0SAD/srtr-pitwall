// iRacing seri adları (c137): oturum bilgisi yalnızca seri numarasını (WeekendInfo SeriesID) verir; adlar Supabase'deki
// iracing_series tablosundan okunur. Adı olmayan seriyi o seride yarışan bir üye bir kez adlandırabilir, yönetici
// değiştirir. Okunan adlar bu bilgisayarda 3 gün saklanır (yoksa her pencere ayrı ayrı sormasın).

import { createSignal } from "solid-js";
import { api, cloudEnabled } from "./supabase";

const KEY = "pitwall.seriesNames";
const TTL = 3 * 24 * 3600_000;
/** Adı bilinmeyen seri en sık bu aralıkla yeniden sorulur */
const MISS_TTL = 10 * 60_000;

type Cache = Record<string, { n: string; at: number }>;
function load(): Cache {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function save(c: Cache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* yer yok */
  }
}

const [names, setNames] = createSignal<Cache>(load());
const pending = new Set<number>();

/** Seri adı ("" : bilinmiyor / henüz okunmadı). Reaktif: okununca güncellenir. */
export function seriesName(id: number): string {
  if (!(id > 0)) return "";
  const c = names()[id];
  const fresh = c && Date.now() - c.at < (c.n ? TTL : MISS_TTL);
  if (!fresh && cloudEnabled && !pending.has(id)) {
    pending.add(id);
    void api<{ name: string }[]>("GET", `iracing_series?select=name&series_id=eq.${id}`, { auth: "optional" })
      .then((r) => remember(id, r?.[0]?.name ?? ""))
      .catch(() => {})
      .finally(() => pending.delete(id));
  }
  return c?.n ?? "";
}

function remember(id: number, n: string) {
  const c = { ...load(), [id]: { n, at: Date.now() } };
  save(c);
  setNames(c);
}

/** Seriyi adlandır (üye: yalnızca adı yoksa; yönetici: her zaman). Döner: kayıtlı ad. */
export async function setSeriesName(id: number, name: string): Promise<string> {
  const n = await api<string>("POST", "rpc/iracing_series_set", { body: { p_id: id, p_name: name.trim() } });
  remember(id, n ?? "");
  return n ?? "";
}

// Başka pencere (panel) adlandırınca overlay penceresi de görsün
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => e.key === KEY && setNames(load()));
}
