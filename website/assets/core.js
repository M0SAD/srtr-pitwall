// SRTR Pitwall web sitesi: ortak işler (Supabase bağlantısı, dil, üst menü, ziyaret sayacı).
// Program ile aynı Supabase projesi kullanılır: sitede açılan hesapla programa da giriş yapılır.
// supabase-js 2 (assets/vendor içinde paketli; dışarıdan CDN gerekmez)
import { createClient } from "./vendor/supabase.js";

export const SUPABASE_URL = "https://xiofxqlpuyotojjeamld.supabase.co";
export const SUPABASE_KEY = "sb_publishable_UAOgy6GVD1AC8rcODCHMBA_6mokhs0B";
export const REPO = "M0SAD/srtr-pitwall";

// "Beni hatırla": işaretliyse oturum localStorage'da (tarayıcı kapansa da kalır), değilse sessionStorage'da
// (sekme/tarayıcı kapanınca biter). Bayrak yoksa (eski girişler) localStorage kullanılır: kimsenin oturumu düşmez.
const REMEMBER_KEY = "pw_remember";
function safeStore(kind) {
  try {
    const s = window[kind];
    const k = "__pw_t";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
const LS = safeStore("localStorage");
const SS = safeStore("sessionStorage");
const MEM = new Map();
/** Beni hatırla seçili mi (bayrak yoksa evet) */
export function rememberMe() {
  try {
    return LS?.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}
/** Son "Beni hatırla" seçimi (giriş formundaki kutu için; seçim yapılmadıysa işaretsiz) */
export function rememberChoice() {
  try {
    return LS?.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}
/** Girişten ÖNCE çağrılır: oturumun nerede saklanacağını belirler */
export function setRememberMe(on) {
  try {
    LS?.setItem(REMEMBER_KEY, on ? "1" : "0");
  } catch {}
}
const authStorage = {
  getItem(k) {
    const s = rememberMe() ? LS : SS;
    if (!s) return MEM.get(k) ?? null;
    return s.getItem(k);
  },
  setItem(k, v) {
    const s = rememberMe() ? LS : SS;
    const other = s === LS ? SS : LS;
    try {
      other?.removeItem(k);
    } catch {}
    if (!s) return void MEM.set(k, v);
    try {
      s.setItem(k, v);
    } catch {
      MEM.set(k, v);
    }
  },
  removeItem(k) {
    MEM.delete(k);
    try {
      LS?.removeItem(k);
    } catch {}
    try {
      SS?.removeItem(k);
    } catch {}
  },
};

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, storageKey: "pitwall.site.auth", storage: authStorage },
});

// ---------------------------------------------------------------------------
// Dil: programdaki 15 dil. Türkçe ve İngilizce bu dosyalarda; diğerleri assets/lang/<kod>.json.
// Ziyaretçinin dili: kendi seçimi > tarayıcı dili > saat dilimi (ülke) > İngilizce.
// Sayfadaki metinler data-t="anahtar" ile, koddakiler T("anahtar") ile.
// ---------------------------------------------------------------------------
export const LANGS = [
  ["en", "English"],
  ["tr", "Türkçe"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["fr", "Français"],
  ["it", "Italiano"],
  ["pt-BR", "Português (BR)"],
  ["pt-PT", "Português (PT)"],
  ["nl", "Nederlands"],
  ["pl", "Polski"],
  ["sv", "Svenska"],
  ["fi", "Suomi"],
  ["ru", "Русский"],
  ["zh-CN", "简体中文"],
  ["ja", "日本語"],
];
const CODES = LANGS.map((l) => l[0]);
const DICT = { tr: {}, en: {} };
export function addDict(d) {
  for (const k of Object.keys(d)) {
    DICT.tr[k] = d[k][0];
    DICT.en[k] = d[k][1];
  }
}

/** Saat diliminden ülke dili (tarayıcı dili desteklenmiyorsa) */
const TZ_LANG = {
  "Europe/Istanbul": "tr",
  "Europe/Berlin": "de",
  "Europe/Vienna": "de",
  "Europe/Zurich": "de",
  "Europe/Madrid": "es",
  "America/Mexico_City": "es",
  "America/Argentina/Buenos_Aires": "es",
  "America/Bogota": "es",
  "America/Santiago": "es",
  "Europe/Paris": "fr",
  "Europe/Brussels": "fr",
  "Europe/Rome": "it",
  "America/Sao_Paulo": "pt-BR",
  "Europe/Lisbon": "pt-PT",
  "Europe/Amsterdam": "nl",
  "Europe/Warsaw": "pl",
  "Europe/Stockholm": "sv",
  "Europe/Helsinki": "fi",
  "Europe/Moscow": "ru",
  "Asia/Shanghai": "zh-CN",
  "Asia/Tokyo": "ja",
};

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function matchLang(tag) {
  const t = String(tag || "").toLowerCase();
  const exact = CODES.find((c) => c.toLowerCase() === t);
  if (exact) return exact;
  const base = t.split("-")[0];
  if (base === "pt") return t.includes("pt-pt") ? "pt-PT" : "pt-BR";
  if (base === "zh") return "zh-CN";
  return CODES.find((c) => c.split("-")[0] === base) ?? null;
}

function pickLang() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q && matchLang(q)) return matchLang(q);
    const s = localStorage.getItem("pitwall.site.lang");
    if (s && CODES.includes(s)) return s;
  } catch {}
  for (const l of navigator.languages || [navigator.language]) {
    const m = matchLang(l);
    if (m) return m;
  }
  return TZ_LANG[timeZone()] ?? "en";
}
export let lang = pickLang();

async function loadLang(l) {
  loadOverrides(l);
  if (DICT[l]) return;
  try {
    const r = await fetch(`assets/lang/${l}.json`);
    DICT[l] = r.ok ? await r.json() : {};
  } catch {
    DICT[l] = {};
  }
}

// Yöneticinin çeviri düzeltmeleri (programda Yönetim › Çeviriler › Web sitesi; i18n_overrides, "site:<anahtar>").
// Önbellekteki liste hemen uygulanır, sunucudan gelen değişmişse sayfa metinleri yenilenir.
const OVR = {};
const ovrDone = new Set();
function loadOverrides(l) {
  if (ovrDone.has(l)) return;
  ovrDone.add(l);
  const ck = `pitwall.site.i18nOv.${l}`;
  try {
    OVR[l] = JSON.parse(localStorage.getItem(ck) || "null") || {};
  } catch {
    OVR[l] = {};
  }
  sb.rpc("i18n_overrides", { p_lang: l }).then(({ data, error }) => {
    if (error || !data || typeof data !== "object") return;
    const next = {};
    for (const [k, v] of Object.entries(data)) if (k.startsWith("site:") && typeof v === "string" && v) next[k.slice(5)] = v;
    const changed = JSON.stringify(next) !== JSON.stringify(OVR[l] || {});
    OVR[l] = next;
    try {
      localStorage.setItem(ck, JSON.stringify(next));
    } catch {}
    if (changed && l === lang) {
      applyLang();
      document.dispatchEvent(new CustomEvent("langchange"));
    }
  });
}

/** Tarih/sayı biçimi için yerel ayar */
export const locale = () => (lang === "zh-CN" ? "zh-CN" : lang);

/** Çeviri; {0}, {1} yerine değerler konur. Eksik çeviride İngilizce kullanılır. */
export function T(key, ...args) {
  const s = OVR[lang]?.[key] ?? DICT[lang]?.[key] ?? DICT.en[key] ?? DICT.tr[key] ?? key;
  return s.replace(/\{(\d)\}/g, (_, i) => String(args[+i] ?? ""));
}

export function applyLang(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll("[data-t]").forEach((el) => (el.innerHTML = T(el.dataset.t)));
  root.querySelectorAll("[data-t-ph]").forEach((el) => (el.placeholder = T(el.dataset.tPh)));
  root.querySelectorAll("[data-t-title]").forEach((el) => (el.title = T(el.dataset.tTitle)));
  document.querySelectorAll(".lang-sel").forEach((b) => (b.value = lang));
}

export async function setLang(l) {
  await loadLang(l);
  lang = l;
  try {
    localStorage.setItem("pitwall.site.lang", l);
  } catch {}
  applyLang();
  document.dispatchEvent(new CustomEvent("langchange"));
}

// ---------------------------------------------------------------------------
// Bölge: Türkiye'den girenlere TL fiyatları (yönetim panelinde girildiyse), diğerlerine USD/EUR.
// Saat dilimine bakılır; ?region=tr / ?region=intl ile denenebilir.
// ---------------------------------------------------------------------------
function pickRegion() {
  try {
    const q = new URLSearchParams(location.search).get("region");
    if (q === "tr" || q === "intl") {
      localStorage.setItem("pitwall.site.region", q);
      return q;
    }
    const s = localStorage.getItem("pitwall.site.region");
    if (s === "tr" || s === "intl") return s;
  } catch {}
  return timeZone() === "Europe/Istanbul" ? "tr" : "intl";
}
export const region = pickRegion();

/** Yönetim panelinde girilen otomatik fiyat (app_config.pro_pricing); yoksa null.
 *  Türkiye'den girenlere Türkiye fiyatı (girildiyse), diğerlerine genel fiyat. */
export function proPrice(cfg, p) {
  const pr = cfg?.pro_pricing || {};
  const pl = pr.plans?.[p.id] || {};
  const tr = Number(pl.price_tr);
  if (region === "tr" && tr > 0) return { num: tr, cur: String(pr.currency_tr || "TRY").toUpperCase() };
  const n = Number(pl.price);
  if (n > 0) return { num: n, cur: String(pr.currency || "USD").toUpperCase() };
  return null;
}

/** Planın bu bölgedeki fiyat metni ve ödeme bağlantısı (Türkiye alanı boşsa genel fiyat).
 *  Otomatik fiyat girildiyse checkout "pro:<plan>" olur (ödeme startProCheckout ile açılır). */
export function planFor(cfg, p) {
  const dyn = proPrice(cfg, p);
  if (dyn) return { price: fmtMoney(dyn.num, dyn.cur), checkout: "pro:" + p.id, num: dyn.num, cur: dyn.cur };
  const tr = region === "tr" && (cfg[p.trPrice] || cfg[p.trCheckout]);
  return {
    price: (tr ? cfg[p.trPrice] : cfg[p.price]) || "",
    checkout: (tr ? cfg[p.trCheckout] : cfg[p.checkout]) || "",
  };
}

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// Ödeme sayfası: Lemon Squeezy katmanı (lemon.js) ile sitenin içinde açılır.
// lemon.js yüklenemezse (engelleyici, ağ) ~6 sn sonra tam sayfa yönlendirmeye düşülür.
// ---------------------------------------------------------------------------
const LEMON_JS = "https://assets.lemonsqueezy.com/lemon.js";
let lemonLoad = null;
let lemonDone = null; // açık ödemenin başarı geri çağrısı

function loadLemon() {
  if (window.LemonSqueezy?.Url?.Open) return Promise.resolve(window.LemonSqueezy);
  if (!lemonLoad) {
    lemonLoad = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("lemon.js timeout")), 6000);
      const fail = (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error("lemon.js"));
      };
      const ready = () => {
        try {
          if (typeof window.createLemonSqueezy === "function") window.createLemonSqueezy();
          const ls = window.LemonSqueezy;
          if (!ls?.Url?.Open) return fail(new Error("lemon.js"));
          ls.Setup?.({
            eventHandler: (e) => {
              if (e?.event === "Checkout.Success" && lemonDone) {
                const cb = lemonDone;
                lemonDone = null;
                try {
                  cb(e);
                } catch {}
              }
            },
          });
          clearTimeout(timer);
          resolve(ls);
        } catch (e) {
          fail(e);
        }
      };
      const el = document.createElement("script");
      el.src = LEMON_JS;
      el.defer = true;
      el.onload = ready;
      el.onerror = fail;
      document.head.appendChild(el);
    }).catch((e) => {
      lemonLoad = null; // sonraki denemede yeniden yükle
      throw e;
    });
  }
  return lemonLoad;
}

/** Ödeme bağlantısını sitenin içinde (Lemon katmanı) açar; olmazsa sayfayı ödemeye yönlendirir.
 *  onSuccess ödeme tamamlanınca çağrılır. Dönüş: "overlay" ya da "redirect". */
export async function openCheckout(url, onSuccess) {
  try {
    const ls = await loadLemon();
    lemonDone = typeof onSuccess === "function" ? onSuccess : null;
    ls.Url.Open(url);
    return "overlay";
  } catch {
    location.href = url;
    return "redirect";
  }
}

/** Otomatik fiyatlı PRO ödemesi: pro-checkout fonksiyonu Lemon Squeezy ödeme sayfasını açar.
 *  giftTo: hediye PRO için alıcının hesap kimliği (ödeme sayfasında ödeyenin kendi e-postası kullanılır).
 *  coupon: indirim kuponu kodu (sunucuda yeniden doğrulanır). */
export async function startProCheckout(planId, giftTo = null, coupon = null) {
  try {
    const body = { plan: planId, region, embed: true };
    if (giftTo) body.gift_to = giftTo;
    if (coupon) body.coupon = coupon;
    const { data, error } = await sb.functions.invoke("pro-checkout", { body });
=======
/** Otomatik fiyatlı PRO ödemesi: pro-checkout fonksiyonu Lemon Squeezy ödeme sayfasını açar */
export async function startProCheckout(planId) {
  try {
    const { data, error } = await sb.functions.invoke("pro-checkout", { body: { plan: planId, region } });
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
    if (error) {
      let msg = error.message;
      try {
        const j = await error.context?.json();
        msg = j?.error || msg;
      } catch {}
      throw new Error(msg);
    }
    if (!data?.url) throw new Error(T("error"));
<<<<<<< HEAD
    const how = await openCheckout(data.url, () => {
      toast(T(giftTo ? "gift_pay_ok" : "pay_ok"));
      setTimeout(() => (location.href = `hesap.html?paid=${giftTo ? "gift" : "pro"}`), 3000);
    });
    // Katman açıldıysa sayfa yerinde kalır (false: düğme yeniden etkinleşir); tam sayfa yönlendirmede true
    return how === "redirect";
=======
    location.href = data.url;
    return true;
>>>>>>> 2eced7f1d54b4de63de247375088ba133e0d37d3
  } catch (e) {
    toast(e?.message || T("error"), true);
    return false;
  }
}

/** Ödeme bağlantısı mı, otomatik ödeme mi ("pro:<plan>") */
export const isProCheckout = (link) => typeof link === "string" && link.startsWith("pro:");

// Ortak metinler (üst menü, alt bilgi, genel)
addDict({
  nav_features: ["Özellikler", "Features"],
  nav_pricing: ["Fiyatlar", "Pricing"],
  nav_faq: ["SSS", "FAQ"],
  nav_download: ["İndir", "Download"],
  nav_login: ["Giriş yap", "Sign in"],
  nav_account: ["Hesabım", "My account"],
  nav_admin: ["Yönetim", "Admin"],
  nav_ads: ["Reklam ver", "Advertise"],
  nav_drivers: ["Yarışçılar", "Drivers"],
  nav_teams: ["Takımlar", "Teams"],
  footer_made: [
    "<b>Erkin Azcan</b> tarafından <a href=\"https://www.simracetr.com\" target=\"_blank\" rel=\"noopener\">Sim Race Türkiye</a> topluluğu için geliştirildi.",
    "Built by <b>Erkin Azcan</b> for the <a href=\"https://www.simracetr.com\" target=\"_blank\" rel=\"noopener\">Sim Race Türkiye</a> community.",
  ],
  footer_legal: [
    "iRacing, iRacing.com Motorsport Simulations, LLC'nin ticari markasıdır. SRTR Pitwall'un iRacing ile bağlantısı yoktur.",
    "iRacing is a trademark of iRacing.com Motorsport Simulations, LLC. SRTR Pitwall is not affiliated with iRacing.",
  ],
  loading: ["Yükleniyor…", "Loading…"],
  error: ["Hata", "Error"],
  pay_ok: [
    "Ödemen alındı, teşekkürler! Birkaç saniye içinde hesabına işlenir.",
    "Payment received, thank you! It will be applied to your account within a few seconds.",
  ],
  gift_pay_ok: [
    "Hediye ödemen alındı, teşekkürler! PRO birkaç saniye içinde alıcının hesabına işlenir.",
    "Gift payment received, thank you! PRO will be applied to the recipient's account within a few seconds.",
  ],
  save: ["Kaydet", "Save"],
  cancel: ["Vazgeç", "Cancel"],
  saved: ["Kaydedildi", "Saved"],
  days: ["gün", "days"],
  unlimited: ["Süresiz", "Unlimited"],
  plan_1m: ["1 aylık", "1 month"],
  plan_3m: ["3 aylık", "3 months"],
  plan_6m: ["6 aylık", "6 months"],
  plan_12m: ["12 aylık", "12 months"],
  language: ["Dil", "Language"],
  promo_banner: [
    "Ücretsiz PRO kampanyası: {0} tarihine kadar hesabıyla giriş yapan herkes tüm PRO özelliklerini kullanabilir.",
    "Free PRO promotion: until {0}, everyone signed in with an account can use every PRO feature.",
  ],
  promo_cta: ["Ücretsiz hesap aç", "Create a free account"],
});

// ---------------------------------------------------------------------------
// Oturum ve profil
// ---------------------------------------------------------------------------
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

let profileCache = null;
export async function myProfile(force = false) {
  const u = await currentUser();
  if (!u) return null;
  if (profileCache && !force) return profileCache;
  const { data } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
  profileCache = data ?? null;
  return profileCache;
}

export async function appConfig() {
  const { data } = await sb.from("app_config").select("*").eq("id", 1).maybeSingle();
  return data ?? {};
}

/** Lemon Squeezy ödeme bağlantısına hesabı ekler (ödeme olunca PRO bu hesaba işlenir) */
export function checkoutUrl(base, user) {
  try {
    const u = new URL(base);
    if (user) {
      u.searchParams.set("checkout[email]", user.email ?? "");
      u.searchParams.set("checkout[custom][user_id]", user.id);
    }
    return u.toString();
  } catch {
    return base;
  }
}

export const PLANS = [
  { id: "1m", months: 1, price: "price_monthly", checkout: "checkout_1m", trPrice: "price_tr_1m", trCheckout: "checkout_tr_1m", tr: "1 aylık" },
  { id: "3m", months: 3, price: "price_3m", checkout: "checkout_3m", trPrice: "price_tr_3m", trCheckout: "checkout_tr_3m", tr: "3 aylık" },
  { id: "6m", months: 6, price: "price_6m", checkout: "checkout_6m", trPrice: "price_tr_6m", trCheckout: "checkout_tr_6m", tr: "6 aylık" },
  { id: "12m", months: 12, price: "price_yearly", checkout: "checkout_12m", trPrice: "price_tr_12m", trCheckout: "checkout_tr_12m", tr: "12 aylık" },
];
/** Plan adı ("1 aylık" / "1 month" …) */
export const planName = (p) => T("plan_" + p.id);

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
export function fmtDate(v, time = false) {
  if (!v) return "—";
  const d = new Date(v);
  return time
    ? d.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(locale(), { dateStyle: "medium" });
}
export function fmtMoney(n, cur = "USD") {
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: cur }).format(n);
  } catch {
    return `${Number(n).toFixed(2)} ${cur}`;
  }
}
export function daysLeft(until) {
  if (!until) return null;
  return Math.ceil((new Date(until).getTime() - Date.now()) / 86400000);
}
export function toast(msg, bad = false) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = bad ? "show bad" : "show";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = ""), 3500);
}

// ---------------------------------------------------------------------------
// Ziyaret sayacı (kişisel veri yok: tarayıcıda rastgele kimlik)
// ---------------------------------------------------------------------------
export function visitorId() {
  try {
    let v = localStorage.getItem("pitwall.site.vid");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("pitwall.site.vid", v);
    }
    return v;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2, 12);
  }
}
export function hit(path) {
  let ref = "";
  try {
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.host !== location.host) ref = r.host;
    }
  } catch {}
  const q = new URLSearchParams(location.search).get("ref") || new URLSearchParams(location.search).get("utm_source");
  if (q) ref = q.slice(0, 60);
  sb.rpc("site_hit", { p_visitor: visitorId(), p_path: path, p_ref: ref, p_lang: navigator.language || "" }).then(
    () => {},
    () => {},
  );
}

// ---------------------------------------------------------------------------
// İndirme: GitHub'daki son sürümün kurulum dosyası
// ---------------------------------------------------------------------------
let latest = null;
export async function latestRelease() {
  if (latest) return latest;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    const j = await r.json();
    const exe = (j.assets || []).find((a) => /setup\.exe$/i.test(a.name)) || (j.assets || []).find((a) => /\.exe$/i.test(a.name));
    const msi = (j.assets || []).find((a) => /\.msi$/i.test(a.name));
    latest = {
      version: String(j.name || j.tag_name || "").replace(/^SRTR Pitwall\s*/i, ""),
      date: j.published_at,
      url: (exe || msi)?.browser_download_url || `https://github.com/${REPO}/releases/latest`,
      size: (exe || msi)?.size || 0,
      page: j.html_url || `https://github.com/${REPO}/releases/latest`,
    };
  } catch {
    latest = { version: "", url: `https://github.com/${REPO}/releases/latest`, page: `https://github.com/${REPO}/releases/latest` };
  }
  return latest;
}
export function bindDownloads() {
  $$("[data-download]").forEach((a) => {
    a.addEventListener("click", () => hit("/download"));
  });
  latestRelease().then((r) => {
    $$("[data-download]").forEach((a) => (a.href = r.url));
    $$("[data-version]").forEach((el) => (el.textContent = r.version || ""));
  });
}

// ---------------------------------------------------------------------------
// Üst menü: giriş durumuna göre Hesabım / Yönetim
// ---------------------------------------------------------------------------
export async function initNav() {
  $$(".lang-sel").forEach((b) => b.addEventListener("change", () => setLang(b.value)));
  const burger = $(".burger");
  if (burger) burger.addEventListener("click", () => $(".nav").classList.toggle("open"));
  const refresh = async () => {
    const u = await currentUser();
    const p = u ? await myProfile() : null;
    $$(".nav-login").forEach((a) => {
      a.dataset.t = u ? "nav_account" : "nav_login";
      a.innerHTML = T(a.dataset.t);
    });
    $$(".nav-admin").forEach((a) => (a.hidden = !p?.is_admin));
  };
  await refresh();
  sb.auth.onAuthStateChange(() => {
    profileCache = null;
    refresh();
  });
}

export function headerHtml(active = "") {
  return `
  <header class="top">
    <div class="wrap top-in">
      <a class="brand" translate="no" href="index.html"><img src="assets/img/logo.png" alt="" width="34" height="34" /><span>SRTR <b>Pitwall</b></span></a>
      <nav class="nav">
        <a href="index.html#features" data-t="nav_features"></a>
        <a href="index.html#pricing" data-t="nav_pricing"></a>
        <a href="index.html#faq" data-t="nav_faq"></a>
        <a href="takimlar.html" class="${active === "teams" ? "on" : ""}" data-t="nav_teams"></a>
        <a href="yarisci.html" class="${active === "drivers" ? "on" : ""}" data-t="nav_drivers"></a>
        <a href="reklam.html" class="${active === "ads" ? "on" : ""}" data-t="nav_ads"></a>
        <a href="yonetim.html" class="nav-admin${active === "admin" ? " on" : ""}" hidden data-t="nav_admin"></a>
        <a href="hesap.html" class="nav-login${active === "account" ? " on" : ""}" data-t="nav_login"></a>
        <a href="#" class="btn btn-accent btn-sm" data-download data-t="nav_download"></a>
        <select class="lang-sel" aria-label="Language" title="Language">${LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join("")}</select>
      </nav>
      <button class="burger" type="button" aria-label="Menu"><span></span><span></span><span></span></button>
    </div>
    <div class="kerb"></div>
  </header>`;
}

export function footerHtml() {
  return `
  <footer class="foot">
    <div class="wrap foot-in">
      <div>
        <div class="brand" translate="no"><img src="assets/img/logo.png" alt="" width="28" height="28" /><span>SRTR <b>Pitwall</b></span></div>
        <p class="muted small" data-t="footer_made"></p>
      </div>
      <div class="foot-links">
        <a href="https://www.youtube.com/@ErkinAzcan" target="_blank" rel="noopener">YouTube</a>
        <a href="https://www.twitch.tv/erkinazcan" target="_blank" rel="noopener">Twitch</a>
        <a href="https://kick.com/erkinazcan" target="_blank" rel="noopener">Kick</a>
        <a href="https://www.instagram.com/erkinazcan" target="_blank" rel="noopener">Instagram</a>
        <a href="https://github.com/${REPO}" target="_blank" rel="noopener">GitHub</a>
        <a href="yarisci.html" data-t="nav_drivers"></a>
        <a href="reklam.html" data-t="nav_ads"></a>
      </div>
    </div>
    <div class="wrap"><p class="muted tiny" data-t="footer_legal"></p></div>
  </footer>`;
}

/** Ücretsiz PRO kampanyası sürüyorsa bitiş tarihi (yoksa null) */
export function promoUntil(cfg) {
  const t = cfg?.promo_pro_until ? new Date(cfg.promo_pro_until).getTime() : 0;
  return t > Date.now() ? new Date(t) : null;
}

/** Kampanya şeridi: üst menünün altında (kampanya yoksa bir şey göstermez) */
async function promoBanner() {
  try {
    const cfg = await appConfig();
    const until = promoUntil(cfg);
    if (!until) return;
    const u = await currentUser();
    const el = document.createElement("div");
    el.className = "promo-banner";
    const draw = () => {
      el.innerHTML = `<div class="wrap promo-in"><b>PRO</b><span>${esc(T("promo_banner", fmtDate(until, true)))}${
        cfg.promo_note ? ` <span class="promo-note">${esc(cfg.promo_note)}</span>` : ""
      }</span>${u ? "" : `<a class="btn btn-sm btn-accent" href="hesap.html?mode=signup">${esc(T("promo_cta"))}</a>`}</div>`;
    };
    draw();
    document.addEventListener("langchange", draw);
    const top = document.querySelector("header.top");
    top ? top.after(el) : document.body.prepend(el);
  } catch {}
}

/** Sayfa iskeleti: üst menü + alt bilgi ekle, dili uygula, sayacı çalıştır */
export async function boot(page, active = "") {
  await loadLang(lang);
  document.body.insertAdjacentHTML("afterbegin", headerHtml(active));
  document.body.insertAdjacentHTML("beforeend", footerHtml());
  applyLang();
  bindDownloads();
  hit(page);
  await initNav();
  promoBanner();
}
