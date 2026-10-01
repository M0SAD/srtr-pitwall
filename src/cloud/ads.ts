// Reklamlar: yerleşim yerleri, gösterilecek reklamı alma, gösterim / tıklama sayma, raporlama
// ve yönetici işlemleri. Reklam satın alma web sitesinde (reklam.html) yapılır.
// PRO üyelere ve oyun içi overlay'lere reklam gösterilmez.

import { lang } from "@/sdk/i18n";
import { api, publicUrl } from "./supabase";

/** Reklam verme sayfası (web sitesi) */
export const AD_SITE = "https://pitwall.simracetr.com/reklam.html";

export type AdPlacement = "panel_banner" | "panel_card" | "site_home" | "site_account";

/** Yerleşim yerleri: önerilen görsel boyutu (piksel) ve adı */
export const AD_PLACEMENTS: Record<AdPlacement, { w: number; h: number; label: string }> = {
  panel_banner: { w: 1200, h: 150, label: "Uygulama · geniş banner" },
  panel_card: { w: 600, h: 600, label: "Uygulama · kare kart" },
  site_home: { w: 1200, h: 240, label: "Site · ana sayfa banner" },
  site_account: { w: 600, h: 400, label: "Site · hesap sayfası kartı" },
};

export const AD_REPORT_REASONS: { id: string; label: string }[] = [
  { id: "inappropriate", label: "Uygunsuz" },
  { id: "misleading", label: "Yanıltıcı / dolandırıcılık" },
  { id: "spam", label: "Spam" },
  { id: "other", label: "Diğer" },
];

export type AdStatus = "unpaid" | "pending_review" | "active" | "paused" | "paused_reports" | "ended" | "rejected" | "refunded";

export const AD_STATUS: Record<AdStatus, { label: string; tone: "" | "ok" | "warn" | "bad" }> = {
  unpaid: { label: "Ödeme bekliyor", tone: "warn" },
  pending_review: { label: "Onay bekliyor", tone: "warn" },
  active: { label: "Yayında", tone: "ok" },
  paused: { label: "Durduruldu", tone: "bad" },
  paused_reports: { label: "Raporlarla gizlendi", tone: "bad" },
  ended: { label: "Bitti", tone: "" },
  rejected: { label: "Reddedildi", tone: "bad" },
  refunded: { label: "İade edildi", tone: "" },
};

export interface Ad {
  id: string;
  placement: AdPlacement;
  title: string;
  body: string;
  url: string;
  image: string;
}

export interface AdPricing {
  currency: string;
  impressions: number[];
  days: number[];
  placements: Partial<Record<AdPlacement, { on?: boolean; cpm?: number; day?: number }>>;
}

export const DEFAULT_AD_PRICING: AdPricing = {
  currency: "USD",
  impressions: [1000, 5000, 10000, 50000],
  days: [1, 3, 7, 14, 30],
  placements: {
    panel_banner: { on: true, cpm: 4, day: 3 },
    panel_card: { on: true, cpm: 3, day: 2 },
    site_home: { on: true, cpm: 5, day: 4 },
    site_account: { on: true, cpm: 3, day: 2 },
  },
};

export const adImageUrl = (path: string) => publicUrl("ads", path);

/** Uygulamanın rastgele izleyici kimliği (gösterim sınırı için; kişisel veri yok) */
function visitorId(): string {
  const K = "pitwall.adVisitor";
  try {
    let v = localStorage.getItem(K);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(K, v);
    }
    return v;
  } catch {
    return "";
  }
}

// Aynı yer için kısa süreli önbellek: sayfalar arasında gezerken her seferinde sorgu atılmasın
const cache = new Map<string, { at: number; ad: Ad | null }>();
const CACHE_MS = 90_000;

export async function pickAd(placement: AdPlacement, fresh = false): Promise<Ad | null> {
  const hit = cache.get(placement);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.ad;
  const ad = await api<Ad | null>("POST", "rpc/ad_pick", {
    body: { p_placement: placement, p_lang: lang(), p_visitor: visitorId() },
    auth: "optional",
  });
  cache.set(placement, { at: Date.now(), ad: ad ?? null });
  return ad ?? null;
}

export function forgetAd(id: string) {
  for (const [k, v] of cache) if (v.ad?.id === id) cache.delete(k);
}

export const adImpression = (id: string) =>
  api("POST", "rpc/ad_impression", { body: { p_ad: id, p_visitor: visitorId() }, auth: "optional" }).catch(() => {});

export const adClick = (id: string) =>
  api<string | null>("POST", "rpc/ad_click", { body: { p_ad: id, p_visitor: visitorId() }, auth: "optional" }).catch(() => null);

export async function reportAd(id: string, reason: string, note: string) {
  try {
    const r = await api<{ reports: number; hidden: boolean }>("POST", "rpc/ad_report", { body: { p_ad: id, p_reason: reason, p_note: note.slice(0, 500) } });
    forgetAd(id);
    return r;
  } catch (e) {
    if (/zaten/i.test(String((e as Error).message))) {
      forgetAd(id);
      throw new Error("Bu reklamı zaten raporladın.");
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export interface AdCampaign extends Ad {
  user_id: string;
  model: "impressions" | "days";
  quantity: number;
  langs: string[];
  status: AdStatus;
  price: number;
  currency: string;
  paid_amount: number | null;
  paid_at: string | null;
  order_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  impressions: number;
  clicks: number;
  reports: number;
  report_base: number;
  review_note: string;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  owner_email?: string | null;
}

export interface AdReportRow {
  id: string;
  reason: string;
  note: string;
  created_at: string;
  reporter: string;
  reporter_name: string | null;
}

export type AdAction = "approve" | "reject" | "pause" | "resume" | "extend" | "end" | "delete";

export const adminAds = (status: string) => api<AdCampaign[]>("POST", "rpc/admin_ads", { body: { p_status: status || null } });
export const adminAdReports = (id: string) => api<AdReportRow[]>("POST", "rpc/admin_ad_reports", { body: { p_ad: id } });
export const adminAdSet = (id: string, action: AdAction, note = "", amount = 0) =>
  api("POST", "rpc/admin_ad_set", { body: { p_ad: id, p_action: action, p_note: note, p_amount: amount } });
