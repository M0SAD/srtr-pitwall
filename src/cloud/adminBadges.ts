// Yönetim bölümlerinde bekleyen işlerin sayaçları (c44: admin_badge_counts).
// Anahtar = Yönetim alt sayfası kimliği (support, moderation, voicepacks, trial, ads, devices).
// Sunucu sadece çağıranın görebildiği sayıları döndürür; yetkisi olmayana boş nesne.

import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { api, cloudEnabled, session } from "./supabase";
import { isAdmin } from "./account";
import { can, notices } from "./moderation";

const [counts, setCounts] = createSignal<Record<string, number>>({});

/** Bir bölümün bekleyen iş sayısı (yoksa 0) */
export const adminBadge = (id: string) => counts()[id] ?? 0;
/** Tüm bölümlerin toplamı (Yönetim simgesindeki rozet) */
export const adminBadgeTotal = () => Object.values(counts()).reduce((a, b) => a + (Number(b) || 0), 0);
/** Rozet yazısı: 99'dan büyükse "99+" */
export const badgeText = (n: number) => (n > 99 ? "99+" : String(n));

let busy = false;
export async function refreshAdminBadges() {
  if (!cloudEnabled || !session() || !(isAdmin() || can("reports.view"))) {
    if (Object.keys(counts()).length) setCounts({});
    return;
  }
  if (busy) return;
  busy = true;
  try {
    const r = await api<Record<string, number>>("POST", "rpc/admin_badge_counts", { body: {} });
    setCounts(r && typeof r === "object" ? r : {});
  } catch {
    /* eski sunucu (c44 yok) ya da ağ hatası: rozet gösterilmez */
  } finally {
    busy = false;
  }
}

let timer: number | undefined;
/** Bir işlemden sonra (sunucu yazımı bitince) sayaçları yenile */
export function refreshAdminBadgesSoon(ms = 1200) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void refreshAdminBadges(), ms);
}

/** Bölümü görüldü işaretle (şimdilik sadece "trial": şüpheli deneme talepleri sayacı sıfırlanır) */
export async function adminBadgeSeen(section: string) {
  if (!adminBadge(section)) return;
  setCounts({ ...counts(), [section]: 0 });
  try {
    await api("POST", "rpc/admin_badge_seen", { body: { p_section: section } });
  } catch {
    /* önemli değil */
  }
}

/**
 * Bileşen içinde çağrılır (ana pencere): yetki gelince, 60 sn'de bir, pencere öne gelince ve
 * yeni bildirim düşünce (rapor / destek / reklam bildirimleri yöneticiye bildirim olarak gelir) yeniler.
 */
export function useAdminBadges() {
  createEffect(on([() => session()?.user.id, isAdmin, () => can("reports.view")], () => void refreshAdminBadges()));
  createEffect(on(() => notices().length, () => refreshAdminBadgesSoon(500), { defer: true }));
  const iv = window.setInterval(() => !document.hidden && void refreshAdminBadges(), 300_000);
  const onFocus = () => refreshAdminBadgesSoon(300);
  window.addEventListener("focus", onFocus);
  onCleanup(() => {
    clearInterval(iv);
    clearTimeout(timer);
    window.removeEventListener("focus", onFocus);
  });
}
