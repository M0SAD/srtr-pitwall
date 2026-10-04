// Hesap profili, uygulama yapılandırması (PRO overlay'ler, destek bağlantıları) ve PRO durumu.

import { createEffect, createRoot, createSignal, on } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { api, callFunction, cloudEnabled, session } from "./supabase";
import { apiBase, inTauri } from "@/sdk/platform";
import { localeTag } from "@/sdk/i18n";
import { loadNotices, loadPerms } from "./moderation";
import { normalizeWatermark, syncWatermark, type WatermarkCfg } from "@/sdk/watermark";

export interface Profile {
  id: string;
  display_name: string;
  iracing_id: number | null;
  iracing_name: string | null;
  pay_email: string | null;
  is_admin: boolean;
  is_owner?: boolean;
  pro_until: string | null;
  pro_source: string | null;
}

export interface AppConfig {
  pro_overlays: string[];
  patreon_url: string;
  /** Türkiye'den bağlananlara gösterilen Patreon bağlantısı (boşsa patreon_url) */
  patreon_url_tr?: string;
  kofi_url: string;
  /** Türkiye'den bağlananlara gösterilen Ko-fi bağlantısı (boşsa kofi_url) */
  kofi_url_tr?: string;
  price_monthly: string;
  price_yearly: string;
  price_3m?: string;
  price_6m?: string;
  /** Lemon Squeezy ödeme bağlantıları (1, 3, 6, 12 aylık) */
  checkout_1m?: string;
  checkout_3m?: string;
  checkout_6m?: string;
  checkout_12m?: string;
  /** Türkiye'ye özel (TL) fiyat ve ödeme bağlantıları; boşsa genel fiyat */
  price_tr_1m?: string;
  price_tr_3m?: string;
  price_tr_6m?: string;
  price_tr_12m?: string;
  checkout_tr_1m?: string;
  checkout_tr_3m?: string;
  checkout_tr_6m?: string;
  checkout_tr_12m?: string;
  /** Bir hesabın kullanabileceği bilgisayar sayısı (aşılınca yöneticiye uyarı gider) */
  device_limit?: number;
  pro_note: string;
  watermark?: Partial<WatermarkCfg>;
  shots_enabled?: boolean;
  shot_max_width?: number;
  shot_quality?: number;
  shot_daily_limit?: number;
  /** Bildirimler okunduktan sonra kaç saat listede kalır */
  notice_keep_hours?: number;
  /** Yöneticinin gizlediği sol menü bölümleri ve overlay'ler (yöneticiler yine görür) */
  hidden_sections?: string[];
  hidden_overlays?: string[];
  /** Gizlenen menü kayıtları (c77): "bölüm" ya da "bölüm.sayfa"; sütun yoksa lig kayıtları gizli sayılır (bkz. app/menu.ts) */
  hidden_menu?: string[];
  /** Üst çubuktaki sim seçicide oyun ikonları (c51); false: eski yazılı görünüm. Sütun yoksa (eski sunucu) açık sayılır */
  sim_icons?: boolean;
  /** Üst çubuk bağlantıları (c61); bkz. cloud/topLinks.ts */
  top_links?: unknown;
  /** Herkese ücretsiz PRO kampanyası: bu tarihe kadar giriş yapmış herkes PRO */
  promo_pro_until?: string | null;
  promo_note?: string;
  /** Reklamlar: açık mı, ödeme sonrası otomatik yayın, kaç raporda gizlenir, yer başına fiyatlar */
  ads_enabled?: boolean;
  ad_auto_approve?: boolean;
  ad_report_hide_threshold?: number;
  ad_pricing?: import("./ads").AdPricing;
  /** Otomatik PRO fiyatları (pro-checkout bu tutarla Lemon Squeezy ödeme sayfası açar).
   *  price: genel fiyat (currency, ör. USD), price_tr: Türkiye fiyatı (currency_tr, ör. TRY) */
  pro_pricing?: ProPricing;
  /** Yeni hesaplara deneme PRO (c41): açık mı ve kaç gün */
  trial_enabled?: boolean;
  trial_days?: number;
  /** Canlı Sohbet › Sohbete yaz (c43): geliştirici uygulamalarının herkese açık istemci kimlikleri (gizli anahtarlar Supabase secrets'ta) */
  livechat_twitch_client_id?: string;
  livechat_youtube_client_id?: string;
  livechat_kick_client_id?: string;
  /** Canlı Sohbet (c52): kullanmak için hesaba giriş zorunlu mu (yoksa: evet) */
  livechat_require_login?: boolean;
  /** Canlı Sohbet (c52): yönetici olmayanlardan gizlenen sekmeler (LIVECHAT_PAGES kimlikleri: "poll", "tts"…) */
  livechat_hidden_tabs?: string[];
}

export interface ProPricing {
  currency?: string;
  currency_tr?: string;
  plans?: Partial<Record<"1m" | "3m" | "6m" | "12m", { price?: number; price_tr?: number }>>;
}

export interface Entitlement {
  pro: boolean;
  proUntil: number;
  locked: string[];
}

const CONFIG_CACHE = "pitwall.appConfig";

function cachedConfig(): AppConfig | null {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_CACHE) || "null");
  } catch {
    return null;
  }
}

const [profile, setProfile] = createSignal<Profile | null>(null);
const [config, setConfig] = createSignal<AppConfig | null>(cachedConfig());
const [entitlement, setEntitlementRaw] = createSignal<Entitlement>({ pro: false, proUntil: 0, locked: [] });
/** PRO durumu Rust'tan (ya da OBS sayfasında /api/entitlement'tan) en az bir kez okundu mu */
const [entitlementLoaded, setEntitlementLoaded] = createSignal(false);
const setEntitlement = (e: Entitlement) => {
  setEntitlementRaw(e);
  setEntitlementLoaded(true);
};
export { profile, config, entitlement, entitlementLoaded };

/** Gerçek yönetici yetkisi (PRO olmayan görünüm açıkken de) */
export const realAdmin = () => !!profile()?.is_admin;

// "PRO olmayan kullanıcı gibi gör" (sadece yöneticiler açabilir; bu bilgisayarda, tüm pencerelerde geçerli)
const FREE_VIEW_KEY = "pitwall.viewAsFree";
const [freeViewFlag, setFreeViewFlag] = createSignal(typeof localStorage !== "undefined" && localStorage.getItem(FREE_VIEW_KEY) === "1");
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === FREE_VIEW_KEY) setFreeViewFlag(e.newValue === "1");
  });
}
/** Yönetici arayüzü PRO olmayan bir üye gibi görüyor mu */
export const freeView = () => freeViewFlag();
export function setFreeView(on: boolean) {
  try {
    if (on) localStorage.setItem(FREE_VIEW_KEY, "1");
    else localStorage.removeItem(FREE_VIEW_KEY);
  } catch {
    /* depolama yoksa sadece bu pencere */
  }
  setFreeViewFlag(on);
}

export const isAdmin = () => realAdmin() && !freeView();
/** Uygulamanın sahibi: yönetici atar, izin gruplarını ve moderasyon kayıtlarını görür */
export const isOwner = () => !!profile()?.is_owner;
/** Ücretsiz PRO kampanyasının bitişi (yoksa 0) */
export const promoUntil = () => {
  const v = config()?.promo_pro_until;
  const t = v ? new Date(v).getTime() : 0;
  return t > Date.now() ? t : 0;
};
/** Kampanya sürüyor ve giriş yapılmış: tüm PRO özellikleri açık */
export const promoActive = () => !!session() && promoUntil() > 0;
export const isPro = () => !freeView() && (entitlement().pro || isAdmin() || promoActive());
/** PRO'ya özel overlay mi (kullanıcı PRO olsa da) */
export const isProOverlay = (id: string) => entitlement().locked.includes(id) || (config()?.pro_overlays ?? []).includes(id);

/** Yöneticinin gizlediği overlay (yöneticiler gizlenenleri de görür) */
/** Üst çubuktaki sim seçicide oyun ikonları gösterilsin mi (Yönetim › Görünürlük; varsayılan açık) */
export const simIconsOn = () => config()?.sim_icons !== false;
export const isHiddenOverlay = (id: string) => !isAdmin() && (config()?.hidden_overlays ?? []).includes(id);
/** Yöneticinin gizlediği sol menü bölümü */
export const isHiddenSection = (id: string) => !isAdmin() && (config()?.hidden_sections ?? []).includes(id);
/** Canlı Sohbet için giriş zorunlu mu (yönetici kapatmadıysa evet; bulut yoksa zorunluluk uygulanamaz) */
export const liveChatRequiresLogin = () => cloudEnabled && config()?.livechat_require_login !== false;
/** Canlı Sohbet bu kullanıcıya açık mı (giriş yapılmış ya da zorunluluk kapalı). Panel bununla kilit gösterir. */
export const liveChatLoginOk = () => !liveChatRequiresLogin() || !!session();
/** Aynı bilgi, Rust'a bildirilmiş haliyle (entitlement "locked" işaretleri): overlay pencereleri ve OBS sayfaları bunu kullanır */
export const liveChatEntitled = () => entitlement().locked.some((x) => x === "livechat.signedin" || x === "livechat.anon");
/** Yöneticinin gizlediği Canlı Sohbet sekmesi (yöneticiler hepsini görür) */
export const isHiddenLiveTab = (id: string) => !isAdmin() && (config()?.livechat_hidden_tabs ?? []).includes(id);
export const markedHiddenLiveTab = (id: string) => (config()?.livechat_hidden_tabs ?? []).includes(id);

/** Gizli işaretli mi (yönetici "gizli" rozeti için) */
export const markedHiddenOverlay = (id: string) => (config()?.hidden_overlays ?? []).includes(id);
export const markedHiddenSection = (id: string) => (config()?.hidden_sections ?? []).includes(id);

/** Bu overlay PRO'ya ayrılmış ve kullanıcı PRO değil mi? */
export function isLocked(id: string) {
  return entitlement().locked.includes(id) && !isPro();
}

export async function loadConfig() {
  if (!cloudEnabled) return null;
  const rows = await api<AppConfig[]>("GET", "app_config?id=eq.1&select=*", { auth: "optional" });
  const c = rows?.[0] ?? null;
  if (c) {
    setConfig(c);
    localStorage.setItem(CONFIG_CACHE, JSON.stringify(c));
  }
  return c;
}

export async function loadProfile() {
  const s = session();
  if (!cloudEnabled || !s) {
    setProfile(null);
    loadPerms();
    loadNotices();
    return null;
  }
  const rows = await api<Profile[]>("GET", `profiles?id=eq.${s.user.id}&select=*`);
  setProfile(rows?.[0] ?? null);
  loadPerms();
  loadNotices();
  return profile();
}

export async function updateProfile(patch: Partial<Pick<Profile, "display_name" | "iracing_id" | "iracing_name" | "pay_email">>) {
  const s = session();
  if (!s) throw new Error("Giriş yapmalısın");
  const rows = await api<Profile[]>("PATCH", `profiles?id=eq.${s.user.id}`, { body: patch, prefer: "return=representation" });
  if (rows?.[0]) setProfile(rows[0]);
}

// ---------------------------------------------------------------------------
// PRO süresi ve abonelik
// ---------------------------------------------------------------------------

export interface ProInfo {
  pro_until: string | null;
  source: string | null;
  /** Abonelik kendini yeniliyor mu */
  renewing: boolean;
  sub: { status: string; plan: string; renews_at: string | null; ends_at: string | null; portal_url: string } | null;
  /** Bana hediye edilmiş (sürmekte olan) abonelik; portal bağlantısı ödeyene ait olduğu için yok */
  gift?: GiftReceived | null;
  gifted_by_name?: string | null;
}

export interface GiftReceived {
  status: string;
  plan: string;
  renews_at: string | null;
  ends_at: string | null;
  until: string | null;
  created_at: string;
  gifted_by_name: string;
}

/** Hediye ettiğim abonelik (my_gifts) */
export interface GiftSent {
  lemon_id: string;
  recipient: string | null;
  recipient_name: string;
  plan: string;
  status: string;
  renews_at: string | null;
  ends_at: string | null;
  until: string | null;
  created_at: string;
}

/** Sürmekte olan abonelik durumları */
export const SUB_LIVE = ["active", "on_trial", "past_due"];

export const myGifts = () => api<GiftSent[]>("POST", "rpc/my_gifts", { body: {} }).then((r) => r ?? []);

/** Hediye ettiğim aboneliği sonlandırır (Lemon'da iptal; alıcının PRO'su ödenen dönemin sonuna kadar sürer) */
export const cancelGift = (lemonId: string) =>
  callFunction<{ ok: boolean; status: string; ends_at: string | null }>("gift-cancel", { lemon_id: lemonId });

/** E-posta bildirim tercihleri (c35). Anahtar yoksa sunucu varsayılanı: takımlar kapalı, diğerleri açık. */
export type EmailPrefKey = "friends" | "teams" | "support" | "ads" | "pro" | "shots";
export type EmailPrefs = Record<EmailPrefKey, boolean>;
export const myEmailPrefs = () => api<EmailPrefs>("POST", "rpc/my_email_prefs", { body: {} });
export const setEmailPrefs = (patch: Partial<EmailPrefs>) => api<EmailPrefs>("POST", "rpc/email_prefs_set", { body: { p_prefs: patch } });

const [proInfo, setProInfo] = createSignal<ProInfo | null>(null);
export { proInfo };

export async function loadProInfo() {
  if (!cloudEnabled || !session()) return setProInfo(null);
  try {
    setProInfo((await api<ProInfo>("POST", "rpc/my_pro", { body: {} })) ?? null);
  } catch {
    /* çevrimdışı: son değer kalır */
  }
}

/** PRO'nun bitmesine kaç tam gün kaldı (PRO yoksa ya da süresizse null) */
export function proDaysLeft(): number | null {
  const u = entitlement().proUntil;
  if (!u || isAdmin() || u - Date.now() > 3000 * 86400_000) return null;
  return Math.ceil((u - Date.now()) / 86400_000);
}

/** Bitmesine 10 gün ya da daha az kalmış ve kendini yenilemeyen PRO (kampanya süresi sayılmaz) */
export const proExpiringSoon = () => {
  const d = proDaysLeft();
  if (promoActive()) {
    const own = profile()?.pro_until ? new Date(profile()!.pro_until!).getTime() : 0;
    if (own <= promoUntil()) return false;
  }
  return d !== null && d > 0 && d <= 10 && !proInfo()?.renewing;
};

/** Türkiye'den mi kullanılıyor (saat dilimi): TL fiyatları gösterilir */
export function inTurkey(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Istanbul";
  } catch {
    return false;
  }
}

export interface PlanDef {
  id: "1m" | "3m" | "6m" | "12m";
  label: string;
  price: keyof AppConfig;
  checkout: keyof AppConfig;
  trPrice: keyof AppConfig;
  trCheckout: keyof AppConfig;
}
export const PLAN_LIST: PlanDef[] = [
  { id: "1m", label: "1 aylık", price: "price_monthly", checkout: "checkout_1m", trPrice: "price_tr_1m", trCheckout: "checkout_tr_1m" },
  { id: "3m", label: "3 aylık", price: "price_3m", checkout: "checkout_3m", trPrice: "price_tr_3m", trCheckout: "checkout_tr_3m" },
  { id: "6m", label: "6 aylık", price: "price_6m", checkout: "checkout_6m", trPrice: "price_tr_6m", trCheckout: "checkout_tr_6m" },
  { id: "12m", label: "12 aylık", price: "price_yearly", checkout: "checkout_12m", trPrice: "price_tr_12m", trCheckout: "checkout_tr_12m" },
];

/** Para tutarını yerel biçimde yazar ("$4.99", "₺149,00") */
export function fmtPrice(n: number, cur: string) {
  try {
    return new Intl.NumberFormat(localeTag(), { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

/** Yönetim panelinde girilen otomatik fiyat (Türkiye'de, girildiyse Türkiye fiyatı); yoksa null */
export function proPrice(c: AppConfig | null | undefined, p: PlanDef): { num: number; cur: string } | null {
  const pr = c?.pro_pricing ?? {};
  const pl = pr.plans?.[p.id] ?? {};
  const tr = Number(pl.price_tr);
  if (inTurkey() && tr > 0) return { num: tr, cur: String(pr.currency_tr || "TRY").toUpperCase() };
  const n = Number(pl.price);
  if (n > 0) return { num: n, cur: String(pr.currency || "USD").toUpperCase() };
  return null;
}

/** Otomatik ödeme mi ("pro:<plan>", pro-checkout ile açılır) yoksa elle girilmiş bağlantı mı */
export const isProCheckout = (link: string) => link.startsWith("pro:");

/** Planın kullanıcının bölgesindeki fiyatı ve ödeme bağlantısı.
 *  Otomatik fiyat girildiyse checkout "pro:<plan>" olur (ödeme startProCheckout ile açılır). */
export function planFor(c: AppConfig | null | undefined, p: PlanDef): { price: string; checkout: string; num?: number; cur?: string } {
  const dyn = proPrice(c, p);
  if (dyn) return { price: fmtPrice(dyn.num, dyn.cur), checkout: "pro:" + p.id, num: dyn.num, cur: dyn.cur };
  const g = (k: keyof AppConfig) => String((c?.[k] as string | undefined) ?? "");
  const tr = inTurkey() && (g(p.trPrice) || g(p.trCheckout));
  return { price: tr ? g(p.trPrice) : g(p.price), checkout: tr ? g(p.trCheckout) : g(p.checkout) };
}

/** Lemon Squeezy ödeme bağlantısına hesabı (kimlik ve e-posta) ekler */
export function checkoutUrl(base: string) {
  try {
    const u = new URL(base);
    const s = session();
    if (s) {
      u.searchParams.set("checkout[email]", s.user.email ?? "");
      u.searchParams.set("checkout[custom][user_id]", s.user.id);
    }
    return u.toString();
  } catch {
    return base;
  }
}

/** Program içi ödeme tamamlandı (hesap sayfasında teşekkür mesajı için) */
const [checkoutPaid, setCheckoutPaid] = createSignal(false);
/** Son açılan ödeme hediye miydi (teşekkür mesajı ve hediye listesi için) */
const [checkoutGift, setCheckoutGift] = createSignal(false);
export { checkoutPaid, checkoutGift };

/** Webhook gecikmesi: PRO durumunu ~10 sn boyunca birkaç kez yeniler */
function refreshAfterPayment() {
  for (const ms of [1500, 4000, 7000, 11000]) {
    setTimeout(() => {
      refreshEntitlement();
      loadProInfo();
    }, ms);
  }
}

let checkoutListening = false;
/** Ödeme penceresinin olaylarını bir kez dinler (checkout-done: ödeme bitti; checkout-closed: pencere kapandı) */
async function listenCheckout() {
  if (checkoutListening) return;
  checkoutListening = true;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<string>("checkout-done", () => {
    setCheckoutPaid(true);
    refreshAfterPayment();
  });
  // Dönüş adresine gidilmeden kapatıldıysa da (ödeme yapılmış olabilir) bir kez yenile
  await listen("checkout-closed", () => {
    setTimeout(() => {
      refreshEntitlement();
      loadProInfo();
    }, 1500);
  });
}

/** Otomatik fiyatlı PRO ödemesi: pro-checkout fonksiyonu Lemon Squeezy ödeme sayfasını açar.
 *  Programda sayfa ayrı bir uygulama penceresinde açılır (checkout_open); ödeme bitince PRO durumu
 *  yenilenir. Olmazsa varsayılan tarayıcıda açılır. Hata olursa mesajıyla fırlatır.
 *  giftTo: hediye PRO için alıcının hesap kimliği (ödeme sayfasında ödeyenin kendi e-postası kullanılır).
 *  coupon: indirim kuponu kodu (sunucuda yeniden doğrulanır). */
export async function startProCheckout(planId: PlanDef["id"], giftTo?: string, coupon?: string) {
  const r = await callFunction<{ url?: string }>("pro-checkout", {
    plan: planId,
    region: inTurkey() ? "tr" : "intl",
    ...(giftTo ? { gift_to: giftTo } : {}),
    ...(coupon ? { coupon } : {}),
  });
  const url = r?.url;
  if (!url) throw new Error("Ödeme sayfası açılamadı");
  if (!inTauri) {
    window.open(url, "_blank");
    return;
  }
  setCheckoutPaid(false);
  setCheckoutGift(!!giftTo);
  try {
    await listenCheckout();
    await invoke("checkout_open", { url, donePrefix: "https://pitwall.simracetr.com/hesap.html?paid=" });
  } catch {
    await invoke("open_url", { url }).catch(() => window.open(url, "_blank"));
  }
}

// ---------------------------------------------------------------------------
// Cihaz kaydı: hesabın hangi bilgisayarlarda kullanıldığını sunucu sayar
// ---------------------------------------------------------------------------

export async function registerDevice(version: string) {
  const s = session();
  if (!cloudEnabled || !inTauri || !s) return;
  try {
    const d = await invoke<{ hash: string; label: string }>("device_info");
    await api("POST", "rpc/register_device", { body: { p_hash: d.hash, p_label: d.label, p_version: version } });
  } catch {
    /* sonra yeniden denenir */
  }
}

export interface AdminDeviceRow {
  user_id: string;
  display_name: string;
  email: string;
  pro_until: string | null;
  device_count: number;
  flag_id: string | null;
  devices: { hash: string; label: string; version: string; first_seen: string; last_seen: string }[];
}

export type DeviceFilter = "flagged" | "multi" | "all";
export const adminDevices = (filter: DeviceFilter) => api<AdminDeviceRow[]>("POST", "rpc/admin_devices", { body: { p_filter: filter } });
export const adminRemoveDevice = (user: string, hash: string) => api("POST", "rpc/admin_remove_device", { body: { p_user: user, p_hash: hash } });
export const adminResolveFlag = (flag: string) => api("POST", "rpc/admin_resolve_flag", { body: { p_flag: flag } });

export interface AdminSub {
  lemon_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string;
  status: string;
  plan: string;
  renews_at: string | null;
  ends_at: string | null;
  updated_at: string;
  created_at: string;
  pro_until: string | null;
}
export const adminSubscriptions = () => api<AdminSub[]>("POST", "rpc/admin_subscriptions", { body: {} });

/** Rust tarafındaki (diske yazılan) PRO durumunu oku */
export async function readEntitlement() {
  try {
    const e = inTauri
      ? await invoke<Entitlement>("entitlement_get")
      : await fetch(`${apiBase}/api/entitlement`).then((r) => r.json());
    setEntitlement(e);
  } catch {
    /* eski sürüm / sunucu kapalı */
  }
}

/**
 * Buluttan yapılandırmayı ve profili alıp PRO durumunu günceller. İnternet yoksa
 * son bilinen durum geçerli kalır (PRO süresi bitene kadar).
 */
/** Sesli mühendis PRO'ya ayrılmış mı: yöneticinin "PRO özellikleri" kararı (voice.engineer), yoksa varsayılan PRO.
 *  proFeatures.ts döngüsel içe aktarmayı önlemek için kararları önbellekten okur. */
function voiceRequiresPro(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem("pitwall.proFeatures") || "{}");
    if (v && typeof v["voice.engineer"] === "boolean") return v["voice.engineer"];
  } catch {
    /* önbellek yok */
  }
  return true;
}

/** Ekran görüntüsü almak PRO'ya ayrılmış mı (tools.screenshots; varsayılan herkese açık). Rust kısayolu "shots" kilidine bakar. */
function shotsRequirePro(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem("pitwall.proFeatures") || "{}");
    return !!v && v["tools.screenshots"] === true;
  } catch {
    return false;
  }
}

/** Yayın düzenindeki SRTR Pitwall logosunu gizlemek PRO'ya ayrılmış mı (stream.badge.hide; varsayılan PRO).
 *  OBS sayfası "stream.badge" işaretine bakar (sdk/streamBadge.tsx). */
function streamBadgeRequiresPro(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem("pitwall.proFeatures") || "{}");
    if (v && typeof v["stream.badge.hide"] === "boolean") return v["stream.badge.hide"];
  } catch {
    /* önbellek yok */
  }
  return true;
}

/** Ücretli PRO kaynakları (profiles.pro_source). Üyeden üyeye hediye de Lemon aboneliğidir ('lemon').
 *  Yöneticinin verdiği ('admin'), deneme ('trial') ve kampanya PRO'su ücretli sayılmaz. */
const PAID_PRO_SOURCES = ["lemon", "patreon", "kofi"];
/** Kullanıcının PRO'su ücretli bir kaynaktan mı geliyor (ve sürüyor mu) */
export const paidPro = () => {
  const p = profile();
  return !!p && !!p.pro_until && new Date(p.pro_until).getTime() > Date.now() && PAID_PRO_SOURCES.includes(p.pro_source ?? "");
};
/** Yayın logosunu gizleme / taşıma hakkı (özellik PRO'ya ayrılmışken): ücretli PRO ya da yönetici hesabı */
export const streamBadgeEntitled = () => !freeView() && (realAdmin() || (isPro() && paidPro()));

/** Rust'a giden kilit listesi: "voice" sadece sesli mühendis PRO'ya ayrılmışsa (eski pro_overlays işareti yok sayılır),
 *  "shots" ekran görüntüsü almak PRO'ya ayrılmışsa, "livechat.*" Canlı Sohbet özellikleri PRO'ya ayrılmışsa */
function withVoiceLock(list: string[]): string[] {
  // "stream.badge.paid": logoyu gizleme / taşıma hakkı var (ücretli PRO ya da yönetici). İşaret yoksa OBS sayfası logoyu
  // zorunlu tutar (PRO olsa da). Profil okunamadıysa (çevrimdışı) son bilinen durum korunur; oturum yoksa hak yoktur.
  const p = profile();
  const hadPaid = list.includes("stream.badge.paid") || entitlement().locked.includes("stream.badge.paid");
  const badgePaid = !session() ? false : p ? !!p.is_admin || paidPro() : hadPaid;
  const rest = list.filter((x) => x !== "voice" && x !== "voice.commands" && x !== "dashboard.remote" && x !== "shots" && x !== "stream.badge" && x !== "stream.badge.paid" && !x.startsWith("livechat.") && !x.startsWith("social."));
  if (voiceRequiresPro()) rest.push("voice");
  if (shotsRequirePro()) rest.push("shots");
  if (streamBadgeRequiresPro()) rest.push("stream.badge");
  if (badgePaid) rest.push("stream.badge.paid");
  rest.push(...livechatLocks());
  // Canlı Sohbet giriş koşulu (kilit değil, işaret; Rust: livechat/mod.rs login_ok): ikisi de yoksa Canlı Sohbet çalışmaz
  if (session()) rest.push("livechat.signedin");
  if (!liveChatRequiresLogin()) rest.push("livechat.anon");
  return rest;
}

/** Canlı Sohbet: PRO'ya ayrılmış özellikler (yönetici kararı, yoksa varsayılan PRO). Rust aynı adlarla denetler. */
// "social.messages_tts": Mesajlar overlay'inde sesli okuma (aynı düzen; Rust: livechat/tts.rs social_tts_speak)
// "voice.commands": sesli komut / bas-konuş (aynı düzen; Rust: voicecmd.rs allowed)
const LIVECHAT_LOCKS = ["livechat.multi", "livechat.favorites", "livechat.poll", "livechat.obs", "livechat.tts", "livechat.stt", "livechat.send", "livechat.alerts", "livechat.log", "social.messages_tts", "voice.commands", "dashboard.remote"];
function livechatLocks(): string[] {
  let v: Record<string, unknown> = {};
  try {
    v = JSON.parse(localStorage.getItem("pitwall.proFeatures") || "{}") || {};
  } catch {
    /* önbellek yok */
  }
  // Varsayılanda herkese açık olanlar (proFeatures.ts kataloğuyla aynı): OBS tarayıcı kaynağı ve Streamlabs uyarıları
  const free = ["livechat.obs", "livechat.alerts"];
  return LIVECHAT_LOCKS.filter((k) => (typeof v[k] === "boolean" ? v[k] : !free.includes(k)));
}

/** Yönetici sesli mühendis kararını değiştirdi: Rust tarafındaki kilidi hemen güncelle */
export async function syncVoiceLock() {
  if (!inTauri) return;
  const cur = entitlement();
  const locked = withVoiceLock(cur.locked);
  if (locked.length === cur.locked.length && locked.every((x) => cur.locked.includes(x))) return;
  try {
    setEntitlement(await invoke<Entitlement>("entitlement_set", { value: { proUntil: cur.proUntil, locked } }));
  } catch {
    /* sonraki yenilemede düzelir */
  }
}

export async function refreshEntitlement() {
  if (!cloudEnabled || !inTauri) {
    await readEntitlement();
    if (inTauri) syncWatermark(normalizeWatermark(null), "");
    // Bulut yok: Canlı Sohbet giriş işareti ("livechat.anon") yine de Rust'a bildirilsin
    await syncVoiceLock();
    return;
  }
  try {
    if (!session()) setProfile(null);
    const [c, p] = await Promise.all([loadConfig(), session() ? loadProfile() : Promise.resolve(null)]);
    loadProInfo();
    invoke<{ display: string }>("app_version").then((v) => registerDevice(v.display)).catch(() => {});
    if (c) syncWatermark(normalizeWatermark(c.watermark), p?.display_name ?? "");
    const own = p?.is_admin ? Date.now() + 3650 * 86400_000 : p?.pro_until ? new Date(p.pro_until).getTime() : 0;
    // Ücretsiz PRO kampanyası: giriş yapmış herkes kampanya bitene kadar PRO
    const promo = session() && c?.promo_pro_until ? new Date(c.promo_pro_until).getTime() : 0;
    const until = Math.max(own, promo > Date.now() ? promo : 0);
    const value = { proUntil: until, locked: withVoiceLock(c?.pro_overlays ?? entitlement().locked) };
    setEntitlement(await invoke<Entitlement>("entitlement_set", { value }));
  } catch {
    await readEntitlement();
    // Çevrimdışı da Rust'a giden işaretler (ör. "stream.badge") güncel kalsın
    if (inTauri) await syncVoiceLock();
    // Çevrimdışı: son bilinen filigranı kullan
    const cc = config();
    if (cc && inTauri) syncWatermark(normalizeWatermark(cc.watermark), profile()?.display_name ?? "");
  }
}

let started = false;
/** Uygulama pencerelerinde bir kez çağrılır: başta ve 6 saatte bir yenile, değişiklikleri dinle. */
export function startEntitlement() {
  if (started) return;
  started = true;
  // Başka pencere (ör. yönetici panelden kaydetti) yapılandırmayı güncelledi: gizlenenler hemen uygulansın
  window.addEventListener("storage", (e) => {
    if (e.key !== CONFIG_CACHE || !e.newValue) return;
    try {
      setConfig(JSON.parse(e.newValue));
    } catch {
      /* bozuk */
    }
  });
  readEntitlement().then(refreshEntitlement);
  setInterval(refreshEntitlement, 6 * 3600_000);
  // Giriş / çıkış ya da "giriş zorunlu" ayarı değişti: Canlı Sohbet giriş işaretini Rust'a hemen bildir
  // (çıkış yapılınca çalışan sohbet durur, overlay'ler ekrandan kalkar)
  createRoot(() =>
    createEffect(
      on([() => !!session(), liveChatRequiresLogin], () => void syncVoiceLock(), { defer: true }),
    ),
  );
  if (inTauri) {
    import("@tauri-apps/api/event").then(({ listen }) => listen<Entitlement>("entitlement", (e) => setEntitlement(e.payload)));
  } else {
    setInterval(readEntitlement, 60_000);
  }
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  display_name: string;
  email: string;
  iracing_name: string | null;
  pro_until: string | null;
  pro_source: string | null;
  is_admin: boolean;
  is_owner: boolean;
  groups: string[];
  created_at?: string;
  last_seen?: string | null;
  version?: string | null;
}

export async function saveConfig(patch: Partial<AppConfig>) {
  const rows = await api<AppConfig[]>("PATCH", "app_config?id=eq.1", {
    body: { ...patch, updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  if (!rows?.length) throw new Error("Kaydedilemedi (yönetici değil misin?)");
  setConfig(rows[0]);
  localStorage.setItem(CONFIG_CACHE, JSON.stringify(rows[0]));
  await refreshEntitlement();
  syncWatermark(normalizeWatermark(rows[0].watermark), profile()?.display_name ?? "");
}

export function adminFindUsers(q: string) {
  return api<AdminUser[]>("POST", "rpc/admin_find_users", { body: { q } });
}

export function adminSetPro(user: string, until: Date | null) {
  return api("POST", "rpc/admin_set_pro", { body: { p_user: user, p_until: until ? until.toISOString() : null } });
}

export type ProChangeMode = "add" | "set" | "unlimited" | "remove";
/** PRO süresini düzenle; notify: kullanıcıya bildirim + e-posta (kendi dilinde). Yeni bitişi döner. */
export function adminChangePro(user: string, mode: ProChangeMode, o: { days?: number; until?: Date; note?: string; notify?: boolean } = {}) {
  return api<string | null>("POST", "rpc/admin_change_pro", {
    body: {
      p_user: user,
      p_mode: mode,
      p_days: o.days ?? null,
      p_until: o.until ? o.until.toISOString() : null,
      p_note: o.note ?? "",
      p_notify: !!o.notify,
    },
  });
}

export type Money = Record<string, number>;
export interface AdminRevenue {
  month: Money;
  d30: Money;
  all: Money;
  payments_month: number;
  payments_all: number;
  paying_users: number;
  paid_pro: number;
  free_pro: number;
  promo_until: string | null;
}
export const adminRevenue = () => api<AdminRevenue>("POST", "rpc/admin_revenue", { body: {} });

export interface ProMember {
  user_id: string;
  display_name: string;
  email: string;
  pro_until: string | null;
  pro_source: string | null;
  paid: Money;
  payments: number;
  last_payment: string | null;
  renewing: boolean;
}
export const adminProMembers = (kind: "paid" | "free") => api<ProMember[]>("POST", "rpc/admin_pro_members", { body: { p_kind: kind } });

export interface StorageUsage {
  bucket: string;
  files: number;
  bytes: number;
}

export function adminStorageUsage() {
  return api<StorageUsage[]>("POST", "rpc/admin_storage_usage", { body: {} });
}

export interface AdminStats {
  users: number;
  users_7d: number;
  pro: number;
  admins: number;
  installs: number;
  active_24h: number;
  active_30d: number;
  online: number;
  racing: number;
}

export function adminStats() {
  return api<AdminStats>("POST", "rpc/admin_stats", { body: {} });
}

export type UserFilter = "all" | "pro" | "admin" | "online";

export function adminUsers(q: string, filter: UserFilter, offset = 0) {
  return api<AdminUser[]>("POST", "rpc/admin_users", { body: { p_q: q, p_filter: filter, p_offset: offset } });
}

// ---------------------------------------------------------------------------
// Kullanım sayacı: her kurulum birkaç dakikada bir "açığım" der (giriş yapmadan da)
// ---------------------------------------------------------------------------

function installId() {
  const K = "pitwall.installId";
  let id = localStorage.getItem(K);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(K, id);
  }
  return id;
}

export function startPing(version: () => string, inRace: () => boolean) {
  if (!cloudEnabled) return;
  const ping = () =>
    api("POST", "rpc/app_ping", { body: { p_install: installId(), p_version: version(), p_in_race: inRace() }, auth: "optional" }).catch(() => {});
  setTimeout(ping, 5000);
  setInterval(ping, 3 * 60_000);
}
