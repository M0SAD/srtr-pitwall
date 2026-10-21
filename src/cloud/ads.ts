// Reklamlar: yerleşim yerleri, gösterilecek reklamı alma, gösterim / tıklama sayma, raporlama
// ve yönetici işlemleri. Reklam satın alma web sitesinde (reklam.html) yapılır.
// PRO üyelere ve oyun içi overlay'lere reklam gösterilmez.

import { lang } from "@/sdk/i18n";
import { api, callFunction, publicUrl, session, storageRemove, storageUpload } from "./supabase";
import { config, isPro, profile } from "./account";

/** Reklam verme sayfası (web sitesi) */
export const AD_SITE = "https://pitwall.simracetr.com/reklam.html";

export type AdPlacement = "panel_banner" | "panel_card" | "site_home" | "site_account" | "home_top" | "home_feed" | "overlays_banner" | "telemetry_banner";

/** Yerleşim yerleri: önerilen görsel boyutu (piksel) ve adı */
export const AD_PLACEMENTS: Record<AdPlacement, { w: number; h: number; label: string; app?: boolean; where?: string }> = {
  home_top: { w: 1200, h: 240, label: "Uygulama · ana sayfa üst banner", app: true, where: "Ana sayfanın en üstü (uygulama açılınca ilk görülen yer)" },
  home_feed: { w: 1200, h: 300, label: "Uygulama · ana sayfa haberler arası", app: true, where: "Ana sayfada haberlerin arasında" },
  panel_banner: { w: 1200, h: 150, label: "Uygulama · geniş banner", app: true, where: "Hesap sayfası" },
  panel_card: { w: 600, h: 600, label: "Uygulama · kare kart", app: true, where: "Topluluk ana sayfası" },
  overlays_banner: { w: 1200, h: 150, label: "Uygulama · Overlaylarım banner", app: true, where: "Overlaylarım sayfasının altı" },
  telemetry_banner: { w: 1200, h: 150, label: "Uygulama · Telemetri banner", app: true, where: "Telemetri sayfasının altı" },
  site_home: { w: 1200, h: 240, label: "Site · ana sayfa banner" },
  site_account: { w: 600, h: 400, label: "Site · hesap sayfası kartı" },
};
/** Uygulamada gösterilen yerler */
export const APP_PLACEMENTS = (Object.keys(AD_PLACEMENTS) as AdPlacement[]).filter((k) => AD_PLACEMENTS[k].app);

export const AD_REPORT_REASONS: { id: string; label: string }[] = [
  { id: "inappropriate", label: "Uygunsuz" },
  { id: "misleading", label: "Yanıltıcı / dolandırıcılık" },
  { id: "spam", label: "Spam" },
  { id: "other", label: "Diğer" },
];

export type AdStatus = "unpaid" | "pending_review" | "active" | "paused" | "paused_reports" | "paused_owner" | "ended" | "rejected" | "refunded";

export const AD_STATUS: Record<AdStatus, { label: string; tone: "" | "ok" | "warn" | "bad" }> = {
  unpaid: { label: "Ödeme bekliyor", tone: "warn" },
  pending_review: { label: "Onay bekliyor", tone: "warn" },
  active: { label: "Yayında", tone: "ok" },
  paused: { label: "Durduruldu", tone: "bad" },
  paused_reports: { label: "Raporlarla gizlendi", tone: "bad" },
  paused_owner: { label: "Reklam veren durdurdu", tone: "warn" },
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
  /** Genel (yurt dışı) para birimi */
  currency: string;
  /** Türkiye'deki reklam verenler için para birimi; yerin cpm_tr / day_tr fiyatı girildiyse kullanılır */
  currency_tr?: string;
  impressions: number[];
  days: number[];
  placements: Partial<Record<AdPlacement, { on?: boolean; cpm?: number; day?: number; cpm_tr?: number; day_tr?: number; pro_hide?: boolean }>>;
  /** Boş reklam alanlarında "Bu alana reklam ver" kutusu (varsayılan açık) */
  placeholder?: boolean;
  /** Elle ödeme bağlantıları (c132): ByNoGame, Patreon … */
  pay_links?: AdPayLink[];
}
export interface AdPayLink {
  name: string;
  url: string;
  /** Reklam verene açıklama (ör. "Tutarı ilan üzerinden öde, kullanıcı adını yaz") */
  note: string;
  on: boolean;
}
/** Açık ödeme bağlantıları */
export const adPayLinks = () => (config()?.ad_pricing?.pay_links ?? []).filter((l) => l.on !== false && l.name.trim() && /^https:\/\//.test(l.url));

export const DEFAULT_AD_PRICING: AdPricing = {
  currency: "USD",
  currency_tr: "TRY",
  impressions: [1000, 5000, 10000, 50000],
  days: [1, 3, 7, 14, 30],
  placements: {
    panel_banner: { on: true, cpm: 4, day: 3 },
    panel_card: { on: true, cpm: 3, day: 2 },
    site_home: { on: true, cpm: 5, day: 4 },
    site_account: { on: true, cpm: 3, day: 2 },
    home_top: { on: true, cpm: 6, day: 5 },
    home_feed: { on: true, cpm: 4, day: 3 },
    overlays_banner: { on: true, cpm: 4, day: 3 },
    telemetry_banner: { on: true, cpm: 3, day: 2 },
  },
};

/** Kayıtlı fiyatlar + varsayılanlar */
export function adPricing(): AdPricing {
  const p = config()?.ad_pricing;
  return { ...DEFAULT_AD_PRICING, ...(p ?? {}), placements: { ...DEFAULT_AD_PRICING.placements, ...(p?.placements ?? {}) } };
}

/** Bu yer satışta mı (yönetici kayıtlı fiyatlarda açmış ve fiyat girmiş) */
export function adOnSale(pl: AdPlacement) {
  const x = config()?.ad_pricing?.placements?.[pl];
  return !!x && x.on !== false && ((x.cpm ?? 0) > 0 || (x.day ?? 0) > 0 || (x.cpm_tr ?? 0) > 0 || (x.day_tr ?? 0) > 0);
}

/** PRO üye bu yerde reklam görmez mi: "Reklamları gizle" açık ve yönetici bu yer için "PRO gizleyebilir" demiş */
export function adHiddenForMe(pl: AdPlacement) {
  if (!isPro()) return false;
  if (profile()?.hide_ads === false) return false;
  return config()?.ad_pricing?.placements?.[pl]?.pro_hide !== false;
}

/** PRO: reklam gizleme tercihini kaydet */
export const setHideAds = (hide: boolean) => api<boolean>("POST", "rpc/set_hide_ads", { body: { p_hide: hide } });

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

// ---------------------------------------------------------------------------
// Reklam verme (uygulama içinden): kaydet, öde, kendi reklamlarım
// ---------------------------------------------------------------------------

export const adPrice = (placement: AdPlacement, model: "impressions" | "days", qty: number, region: "tr" | "intl") =>
  api<{ price: number; currency: string; region: string }>("POST", "rpc/ad_price", {
    body: { p_placement: placement, p_model: model, p_qty: qty, p_region: region },
    auth: "optional",
  });

/** Reklam görselini 'ads' kovasına yükler (yol: <kullanıcı>/<rastgele>.<uzantı>; en çok 2 MB). Kova içi yolu döner. */
export async function uploadAdImage(f: File): Promise<string> {
  const uid = session()?.user.id;
  if (!uid) throw new Error("Bu işlem için giriş yapmalısın");
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[f.type];
  if (!ext) throw new Error("Sadece PNG, JPEG, WebP ya da GIF yüklenebilir");
  if (f.size > 2 * 1024 * 1024) throw new Error("Görsel en fazla 2 MB olabilir");
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  await storageUpload("ads", path, f, f.type, false);
  return path;
}

export interface AdDraft {
  id: string | null;
  placement: AdPlacement;
  model: "impressions" | "days";
  quantity: number;
  title: string;
  body: string;
  url: string;
  image: string;
  langs: string[];
  region: "tr" | "intl";
}
export const adSave = (d: AdDraft) =>
  api<string>("POST", "rpc/ad_save", {
    body: {
      p_id: d.id,
      p_placement: d.placement,
      p_model: d.model,
      p_quantity: d.quantity,
      p_title: d.title.trim(),
      p_body: d.body.trim(),
      p_url: d.url.trim(),
      p_image: d.image,
      p_langs: d.langs,
      p_region: d.region,
    },
  });

/** Kendi reklamlarım (c129) */
export const myAds = () => api<AdCampaign[]>("POST", "rpc/my_ads", { body: {} }).then((r) => r ?? []);
/** Ödenmemiş reklamı sil (görseliyle) */
export async function adDelete(id: string) {
  const img = await api<string | null>("POST", "rpc/ad_delete", { body: { p_ad: id } });
  if (img) await storageRemove("ads", [img]).catch(() => {});
}
/** Günlük gösterim / tıklama, son 90 gün (c130; reklamın sahibi ve yönetici) */
export interface AdStatDay {
  day: string;
  impressions: number;
  clicks: number;
}
export const adStats = (id: string) => api<AdStatDay[]>("POST", "rpc/ad_stats", { body: { p_ad: id } }).then((r) => r ?? []);
/** Reklam veren: "Ödedim" (c132) */
export const adPayClaim = (id: string, method: string, ref: string, note: string) =>
  api("POST", "rpc/ad_pay_claim", { body: { p_ad: id, p_method: method, p_ref: ref, p_note: note } });
/** Yönetici: ödemeyi kontrol ettim, ödendi say (Gelir'e yazılır, reklam yayına girer) */
export const adminAdMarkPaid = (id: string, amount: number, currency: string, method: string) =>
  api("POST", "rpc/admin_ad_mark_paid", { body: { p_ad: id, p_amount: amount, p_currency: currency, p_method: method } });
export const adOwnerPause = (id: string, pause: boolean) => api<string>("POST", "rpc/ad_owner_pause", { body: { p_ad: id, p_pause: pause } });

/** Ödeme sayfasının adresi (ads-checkout). Ödeme bitince sağlayıcı reklam.html?paid=<id> adresine döner. */
export async function adCheckoutUrl(id: string): Promise<string> {
  const r = await callFunction<{ url?: string }>("ads-checkout", { ad_id: id });
  if (!r?.url) throw new Error("Ödeme sayfası açılamadı");
  return r.url;
}
export const AD_PAID_PREFIX = "https://pitwall.simracetr.com/reklam.html?paid=";

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
  /** Elle ödeme bildirimi (c132) */
  pay_method?: string;
  pay_ref?: string;
  pay_note?: string;
  pay_claimed_at?: string | null;
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

/** Yönetici: reklamı durumundan bağımsız kalıcı sil (raporlarıyla); görseli başka reklamda yoksa kovadan da silinir */
export async function adminAdDelete(id: string) {
  const img = await api<string | null>("POST", "rpc/admin_ad_delete", { body: { p_ad: id } });
  if (img) await storageRemove("ads", [img]).catch(() => {});
  forgetAd(id);
}
