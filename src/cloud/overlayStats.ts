// Overlay kullanım istatistiği (c76): "En çok kullanılanlara göre" sıralaması için.
// - Bildirim (yalnızca giriş yapmış kullanıcı): her overlay türünün kullanıcının kaç düzeninde (yayın düzenleri dahil)
//   AÇIK olduğu gönderilir: { tür kimliği: düzen sayısı }. Başka hiçbir şey (ayar, ad, konum) gönderilmez.
//   Ayar değişince gecikmeli, en çok ~10 dakikada bir; açılışta yalnızca son bildirimden beri değiştiyse.
// - Okuma (hesapsız da çalışır): overlay_usage_top() bütün kullanıcıların toplamını verir; localStorage'da saklanır,
//   açılışta (eskidiyse) ve birkaç saatte bir yenilenir. RPC henüz kurulmamışsa / çevrimdışıyken sessizce geçilir:
//   sıralama yerleşik popülerlik sırasına düşer.

import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { manifests } from "@/sdk/registry";
import { settings } from "@/sdk/settings";
import { api, cloudEnabled, session } from "./supabase";

export interface OverlayTop {
  users: number;
  layouts: number;
}

const TOP_KEY = "pw.overlayTop";
const SENT_KEY = "pw.overlayUsageSent";
const TOP_TTL = 3 * 60 * 60_000;
const REPORT_MIN = 10 * 60_000;
const REPORT_DELAY = 20_000;
const ID_RE = /^[a-z0-9_]{1,40}$/;

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* depolama kapalı: önemli değil */
  }
}

function normalizeTop(v: unknown): Record<string, OverlayTop> {
  const out: Record<string, OverlayTop> = {};
  if (!Array.isArray(v)) return out;
  for (const r of v as Record<string, unknown>[]) {
    if (!r || typeof r.overlay_id !== "string" || !ID_RE.test(r.overlay_id)) continue;
    const users = Number(r.users);
    const layouts = Number(r.layouts);
    if (!Number.isFinite(users) || users <= 0) continue;
    out[r.overlay_id] = { users, layouts: Number.isFinite(layouts) ? layouts : 0 };
  }
  return out;
}

const cached = readJson<{ at: number; rows: unknown }>(TOP_KEY);
const [top, setTop] = createSignal<Record<string, OverlayTop>>(normalizeTop(cached?.rows));
let topAt = typeof cached?.at === "number" ? cached.at : 0;

/** Bütün kullanıcılardaki kullanım: tür kimliği → { kullanıcı sayısı, düzen sayısı }. Veri yoksa boş. */
export const overlayTop = top;

let fetching = false;
export async function refreshOverlayTop(force = false) {
  if (!cloudEnabled || fetching) return;
  // Saat geri alınmışsa (at gelecekte) da yenilenir
  if (!force && topAt <= Date.now() && Date.now() - topAt < TOP_TTL) return;
  fetching = true;
  try {
    const rows = await api<unknown>("POST", "rpc/overlay_usage_top", { body: {}, auth: "optional" });
    if (Array.isArray(rows)) {
      topAt = Date.now();
      writeJson(TOP_KEY, { at: topAt, rows });
      setTop(normalizeTop(rows));
    }
  } catch {
    /* çevrimdışı ya da RPC henüz yok: yerleşik sıra kullanılır */
  } finally {
    fetching = false;
  }
}

/** Kullanıcının düzenlerinde (yayın düzenleri dahil) her türün kaç düzende açık olduğu; tür düzen başına bir kez sayılır */
export function myOverlayCounts(): Record<string, number> {
  const known = new Set(manifests.map((m) => m.id));
  const out: Record<string, number> = {};
  for (const p of Object.values(settings().profiles)) {
    const types = new Set<string>();
    for (const o of Object.values(p.overlays ?? {})) if (o?.enabled && known.has(o.type) && ID_RE.test(o.type)) types.add(o.type);
    for (const ty of types) out[ty] = Math.min(100, (out[ty] ?? 0) + 1);
  }
  // Anahtar sırası sabit olsun: aynı içerik aynı metni versin
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

let reportTimer: number | undefined;
let reporting = false;

function scheduleReport(delay = REPORT_DELAY) {
  clearTimeout(reportTimer);
  reportTimer = window.setTimeout(() => void report(), delay);
}

async function report() {
  const uid = session()?.user.id;
  if (!cloudEnabled || !uid || reporting) return;
  const sig = `${uid}:${JSON.stringify(myOverlayCounts())}`;
  const sent = readJson<{ sig: string; at: number }>(SENT_KEY);
  if (sent?.sig === sig) return;
  const since = Date.now() - (typeof sent?.at === "number" ? sent.at : 0);
  if (since >= 0 && since < REPORT_MIN) return scheduleReport(REPORT_MIN - since + 1000);
  reporting = true;
  // Başarısız olsa da zaman yazılır: RPC yokken / çevrimdışıyken her değişiklikte yeniden denenmesin
  writeJson(SENT_KEY, { sig: sent?.sig ?? "", at: Date.now() });
  try {
    await api("POST", "rpc/overlay_usage_report", { body: { p_counts: JSON.parse(sig.slice(uid.length + 1)) } });
    writeJson(SENT_KEY, { sig, at: Date.now() });
  } catch {
    /* sessiz: bir sonraki değişiklikte / açılışta yeniden denenir */
  } finally {
    reporting = false;
  }
}

/** Panel açılışında bir kez çağrılır (App): toplamı yeniler, kullanıcının sayılarını gerektiğinde bildirir */
export function useOverlayStats() {
  if (!cloudEnabled) return;
  void refreshOverlayTop();
  const iv = setInterval(() => void refreshOverlayTop(), 30 * 60_000);
  // Düzenler ya da oturum değişince (açılışta da bir kez) bildirim sıraya girer
  createEffect(on([() => session()?.user.id, () => JSON.stringify(myOverlayCounts())], ([uid]) => uid && scheduleReport()));
  onCleanup(() => {
    clearInterval(iv);
    clearTimeout(reportTimer);
  });
}
