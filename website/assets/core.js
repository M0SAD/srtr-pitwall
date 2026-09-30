// SRTR Pitwall web sitesi: ortak işler (Supabase bağlantısı, dil, üst menü, ziyaret sayacı).
// Program ile aynı Supabase projesi kullanılır: sitede açılan hesapla programa da giriş yapılır.
// supabase-js 2 (assets/vendor içinde paketli; dışarıdan CDN gerekmez)
import { createClient } from "./vendor/supabase.js";

export const SUPABASE_URL = "https://xiofxqlpuyotojjeamld.supabase.co";
export const SUPABASE_KEY = "sb_publishable_UAOgy6GVD1AC8rcODCHMBA_6mokhs0B";
export const REPO = "M0SAD/srtr-pitwall";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, storageKey: "pitwall.site.auth" },
});

// ---------------------------------------------------------------------------
// Dil: Türkçe / English. Sayfadaki metinler data-t="anahtar" ile, koddakiler T("anahtar") ile.
// ---------------------------------------------------------------------------
const DICT = { tr: {}, en: {} };
export function addDict(d) {
  for (const k of Object.keys(d)) {
    DICT.tr[k] = d[k][0];
    DICT.en[k] = d[k][1];
  }
}

function pickLang() {
  try {
    const s = localStorage.getItem("pitwall.site.lang");
    if (s === "tr" || s === "en") return s;
  } catch {}
  return (navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
}
export let lang = pickLang();

/** Çeviri; {0}, {1} yerine değerler konur */
export function T(key, ...args) {
  const s = DICT[lang][key] ?? DICT.tr[key] ?? key;
  return s.replace(/\{(\d)\}/g, (_, i) => String(args[+i] ?? ""));
}

export function applyLang(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll("[data-t]").forEach((el) => (el.innerHTML = T(el.dataset.t)));
  root.querySelectorAll("[data-t-ph]").forEach((el) => (el.placeholder = T(el.dataset.tPh)));
  root.querySelectorAll("[data-t-title]").forEach((el) => (el.title = T(el.dataset.tTitle)));
  document.querySelectorAll(".lang-btn").forEach((b) => (b.textContent = lang === "tr" ? "EN" : "TR"));
}

export function setLang(l) {
  lang = l;
  try {
    localStorage.setItem("pitwall.site.lang", l);
  } catch {}
  applyLang();
  document.dispatchEvent(new CustomEvent("langchange"));
}

// Ortak metinler (üst menü, alt bilgi, genel)
addDict({
  nav_features: ["Özellikler", "Features"],
  nav_pricing: ["Fiyatlar", "Pricing"],
  nav_faq: ["SSS", "FAQ"],
  nav_download: ["İndir", "Download"],
  nav_login: ["Giriş yap", "Sign in"],
  nav_account: ["Hesabım", "My account"],
  nav_admin: ["Yönetim", "Admin"],
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
  save: ["Kaydet", "Save"],
  cancel: ["Vazgeç", "Cancel"],
  saved: ["Kaydedildi", "Saved"],
  days: ["gün", "days"],
  unlimited: ["Süresiz", "Unlimited"],
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
  { id: "1m", months: 1, price: "price_monthly", checkout: "checkout_1m", tr: "1 aylık", en: "1 month" },
  { id: "3m", months: 3, price: "price_3m", checkout: "checkout_3m", tr: "3 aylık", en: "3 months" },
  { id: "6m", months: 6, price: "price_6m", checkout: "checkout_6m", tr: "6 aylık", en: "6 months" },
  { id: "12m", months: 12, price: "price_yearly", checkout: "checkout_12m", tr: "12 aylık", en: "12 months" },
];

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
    ? d.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium" });
}
export function fmtMoney(n, cur = "USD") {
  try {
    return new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-US", { style: "currency", currency: cur }).format(n);
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
function visitorId() {
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
  $$(".lang-btn").forEach((b) => b.addEventListener("click", () => setLang(lang === "tr" ? "en" : "tr")));
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
        <a href="yonetim.html" class="nav-admin${active === "admin" ? " on" : ""}" hidden data-t="nav_admin"></a>
        <a href="hesap.html" class="nav-login${active === "account" ? " on" : ""}" data-t="nav_login"></a>
        <a href="#" class="btn btn-accent btn-sm" data-download data-t="nav_download"></a>
        <button class="lang-btn" type="button" aria-label="Language">EN</button>
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
      </div>
    </div>
    <div class="wrap"><p class="muted tiny" data-t="footer_legal"></p></div>
  </footer>`;
}

/** Sayfa iskeleti: üst menü + alt bilgi ekle, dili uygula, sayacı çalıştır */
export async function boot(page, active = "") {
  document.body.insertAdjacentHTML("afterbegin", headerHtml(active));
  document.body.insertAdjacentHTML("beforeend", footerHtml());
  applyLang();
  bindDownloads();
  hit(page);
  await initNav();
}
