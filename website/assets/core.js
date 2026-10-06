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
  // data-t-args="a|b": {0}, {1} yerine konacak değerler (ör. overlay sayısı)
  root.querySelectorAll("[data-t]").forEach((el) => (el.innerHTML = T(el.dataset.t, ...(el.dataset.tArgs ? el.dataset.tArgs.split("|") : []))));
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
/** Görsel adresi güvenli mi (yalnızca gömülü resim ya da https) */
const payImgOk = (u) => typeof u === "string" && /^(data:image\/(png|jpeg|webp|gif|svg\+xml);base64,|https:\/\/)/i.test(u);
/** Ödeme yöntemleri ayarı (app_config.pay_methods, c94): hazır yöntemleri gizleme + yöneticinin kategorileri ve bağlantıları */
export function payMethods(cfg) {
  const p = cfg && cfg.pay_methods;
  const purl = { url: String((cfg && (cfg.patreon_url_tr || cfg.patreon_url)) || ""), url_intl: String((cfg && cfg.patreon_url) || "") };
  if (!p || typeof p !== "object") return { links: [], cats: [], badges: [], patreon: { ...purl } };
  const obj = (x) => x && typeof x === "object";
  const cats = (Array.isArray(p.cats) ? p.cats : []).filter((k) => obj(k) && k.id);
  const links = (Array.isArray(p.links) ? p.links : []).filter(obj).map((l) => ({ ...l, cat: cats.some((k) => k.id === l.cat) ? l.cat : "" }));
  return { hide_plans: !!p.hide_plans, hide_patreon: !!p.hide_patreon, hide_coupon: !!p.hide_coupon, cats, links, badges: (Array.isArray(p.badges) ? p.badges : []).filter(payImgOk), patreon: { ...purl, ...(obj(p.patreon) ? Object.fromEntries(Object.entries(p.patreon).filter(([, v]) => v !== undefined && v !== null)) : {}) } };
}
/** Gösterilecek kategoriler ve kartları (kategorisiz bağlantılar başlıksız grup olarak en başta) */
export function payGroups(cfg) {
  const pm = payMethods(cfg);
  // Bölgeye göre adres ve fiyat: Türkiye'de Türkiye alanları, diğer ülkelerde yurt dışı alanları; adresi girilmemiş
  // bölgede kart çıkmaz. Eski kayıt (yurt dışı alanı yok): "Yalnızca Türkiye" değilse aynı adres yurt dışında da geçerli.
  const all = pm.links
    .map((l) =>
      region === "tr"
        ? l
        : { ...l, url: l.url_intl !== undefined ? l.url_intl : l.tr_only ? "" : l.url, price: l.price_intl !== undefined ? l.price_intl : l.tr_only ? "" : l.price },
    )
    .filter((l) => l.on !== false && /^https?:\/\//i.test(String(l.url || "")));
  const out = [];
  const loose = all.filter((l) => !l.cat);
  if (loose.length) out.push({ cat: null, links: loose });
  for (const k of pm.cats) {
    if (k.on === false || (k.tr_only && region !== "tr")) continue;
    const links = all.filter((l) => l.cat === k.id);
    if (links.length) out.push({ cat: k, links });
  }
  // Sabit Patreon kategorisi: başlık ve açıklama yerleşik (site diline çevrili); adresi girilmemiş bölgede çıkmaz
  const pt = pm.patreon || {};
  const purl = String((region === "tr" ? pt.url : pt.url_intl) || "");
  if (!pm.hide_patreon && /^https?:\/\//i.test(purl))
    out.push({
      cat: { id: "__patreon", title: "Patreon", note: T("pay_patreon_note"), img: pt.img, badges: pt.badges },
      links: [{ title: T("plan_1m"), months: 1, price: String((region === "tr" ? pt.price : pt.price_intl) || ""), url: purl, note: "", claim: false, tag: "" }],
    });
  return out;
}
/** Gösterilecek kendi ödeme bağlantıları (düz liste) */
export const payLinks = (cfg) => payGroups(cfg).flatMap((g) => g.links);
/** Ödeme kategorileri: logo + başlık + genel açıklama, altında plan kartı görünümünde bağlantılar ("Öde").
 *  Karta basınca pencere açılır: açıklama, ödeme sayfası düğmesi ve (açıksa) "ödedim" bildirimi.
 *  gift: hediye alıcısının adı (form her zaman açılır, alıcı bildirime yazılır). */
/** "150 TL", "€4,99" gibi fiyat metninin aylık karşılığı (aynı para birimi yazımıyla); hesaplanamazsa "" */
function payPer(price, months) {
  const str = String(price || "").trim();
  const m = str.match(/\d[\d.,\s]*/);
  if (!m || !months || months < 2) return "";
  // Para birimi ne yazıldıysa (₺, TL, $, €, USD, "TL + KDV"…) sayının önündeki / arkasındaki metin aynen korunur
  const pre = str.slice(0, m.index);
  const post = str.slice(m.index + m[0].length);
  let num = m[0].replace(/\s/g, "").replace(/[.,]$/, "");
  const dot = num.lastIndexOf(".");
  const com = num.lastIndexOf(",");
  if (dot >= 0 && com >= 0) num = dot > com ? num.replace(/,/g, "") : num.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, "");
  else num = num.replace(",", ".");
  const n = parseFloat(num);
  if (!isFinite(n) || n <= 0) return "";
  const v = (n / months).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${pre}${v}${m[0].endsWith(" ") && post ? " " : ""}${post}`;
}
let paySeq = 0;
const payStore = new Map();
export function payLinksHtml(cfg, { gift = "", badges = true } = {}) {
  const groups = payGroups(cfg);
  if (!groups.length) return "";
  bindPayLinks();
  const b = badges ? payMethods(cfg).badges : [];
  return `<div class="paycats">${groups
    .map(
      (g) => `<section class="paycat card">
      ${
        g.cat
          ? `<header class="paycat-head">${payImgOk(g.cat.img) ? `<img class="paycat-logo" src="${esc(g.cat.img)}" alt="">` : ""}
          <div class="paycat-txt"><h3 translate="no">${esc(g.cat.title || "")}</h3>${g.cat.note ? `<p translate="no">${esc(g.cat.note)}</p>` : ""}${(() => {
            const cb = (Array.isArray(g.cat.badges) ? g.cat.badges : []).filter(payImgOk);
            return cb.length ? `<div class="paybadges paycat-badges">${cb.map((u) => `<img src="${esc(u)}" alt="">`).join("")}</div>` : "";
          })()}</div></header>`
          : ""
      }
      <div class="plans paycards">${g.links
        .map((x) => {
          const id = "p" + ++paySeq;
          payStore.set(id, { link: x, cat: g.cat, gift });
          const mo = [1, 3, 6, 12].includes(Number(x.months)) ? Number(x.months) : 0;
          const per = payPer(x.price, mo);
          const tag = x.tag === "best" ? T("best_value") : x.tag === "popular" ? T("popular") : "";
          return `<div class="card plan${x.tag === "best" ? " best" : ""}">${tag ? `<span class="tag">${esc(tag)}</span>` : ""}
          <div class="name"${x.title ? ` translate="no"` : ""}>${esc(x.title || (mo ? T("plan_" + mo + "m") : "—"))}</div><div class="price" translate="no">${esc(x.price || "")}</div>
          <div class="per">${per ? esc(T("per_month", per)) : ""}</div>
          <button type="button" class="btn ${x.tag === "best" ? "btn-accent" : ""}" data-pay-open="${id}">${esc(T(gift ? "pay_gift" : "pay_with"))}</button></div>`;
        })
        .join("")}</div></section>`,
    )
    .join("")}${b.length ? `<div class="paybadges">${b.map((u) => `<img src="${esc(u)}" alt="">`).join("")}</div>` : ""}</div>`;
}
function openPayDialog(id) {
  const it = payStore.get(id);
  if (!it) return;
  const { link: x, cat, gift } = it;
  const form = !!x.claim || !!gift;
  // Sabit Patreon kategorisinde PRO kendiliğinden açılır; kendi bağlantılarda yönetici gün içinde elle tanımlar
  const manual = !(cat && cat.id === "__patreon");
  let host = "";
  try {
    host = new URL(x.url).hostname;
  } catch {
    /* geçersiz adres */
  }
  const bynogame = /(^|\.)bynogame\.com$/i.test(host);
  const method = [cat && cat.title, x.title || x.url, x.price].filter(Boolean).join(" · ");
  document.querySelector("dialog.paydlg")?.remove();
  const d = document.createElement("dialog");
  d.className = "paydlg card";
  d.innerHTML = `<div class="paydlg-head">${cat && payImgOk(cat.img) ? `<img src="${esc(cat.img)}" alt="">` : ""}
      <h3 translate="no">${esc(x.title || x.url)}${x.price ? ` <span class="paydlg-price">${esc(x.price)}</span>` : ""}</h3>
      <button type="button" class="btn btn-sm btn-ghost" data-pay-close aria-label="×">✕</button></div>
    <div class="pay-link-body">
      ${gift ? `<p><b>🎁 ${esc(T("pay_gift_to", gift))}</b></p>` : ""}
      ${x.note ? `<p class="pay-note" translate="no">${esc(x.note)}</p>` : ""}
      ${form ? `<p><b>1. ${esc(T("pay_step1"))}</b></p>` : ""}
      <p><a class="btn btn-accent" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(T("pay_open"))}</a></p>
      ${manual ? `<p class="muted small">${esc(T("pay_same_day"))}</p>` : ""}
      ${bynogame ? `<p class="pay-warn">${esc(T("pay_bng"))}</p>` : ""}
      ${
        !form
          ? ""
          : `<p><b>2. ${esc(T("pay_step2"))}</b></p>
      <div data-pay-ask${gift ? " hidden" : ""}>
        <p class="muted small">${esc(T("pay_bought_h"))}</p>
        <p><button type="button" class="btn" data-pay-reveal>✓ ${esc(T("pay_bought"))}</button></p>
      </div>
      <div data-pay-form${gift ? "" : " hidden"}>
        <p class="muted small">${esc(T("pay_step2_h"))}</p>
        <input class="input" maxlength="200" placeholder="${esc(T("pay_contact"))}" data-pay-contact />
        <p><b>${esc(T("pay_info"))}</b></p>
        <textarea class="input" rows="4" maxlength="900" placeholder="${esc(T("pay_note"))}" data-pay-note></textarea>
        <p><button type="button" class="btn btn-accent" data-pay-send>${esc(T("pay_send"))}</button></p>
        <p class="small" data-pay-msg></p>
      </div>`
      }
    </div>`;
  d.dataset.method = method;
  d.dataset.gift = gift || "";
  document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => e.target === d && d.close());
  d.showModal();
}
let payBound = false;
function bindPayLinks() {
  if (payBound) return;
  payBound = true;
  document.addEventListener("click", async (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const op = el?.closest("[data-pay-open]");
    if (op) return openPayDialog(op.getAttribute("data-pay-open"));
    if (el?.closest("[data-pay-close]")) return el.closest("dialog")?.close();
    // "Satın alım yaptım": bildirim formunu aç
    const rv = el?.closest("[data-pay-reveal]");
    if (rv) {
      const body = rv.closest(".pay-link-body");
      body?.querySelector("[data-pay-ask]")?.setAttribute("hidden", "");
      body?.querySelector("[data-pay-form]")?.removeAttribute("hidden");
      body?.querySelector("[data-pay-contact]")?.focus();
      return;
    }
    const btn = el?.closest("[data-pay-send]");
    if (!btn) return;
    const dlg = btn.closest("dialog");
    const box = btn.closest(".pay-link-body");
    const msg = box?.querySelector("[data-pay-msg]");
    const say = (text, ok) => {
      if (!msg) return;
      msg.textContent = text;
      msg.style.color = ok ? "#3ddc84" : "#ff6b6b";
    };
    const contact = (box?.querySelector("[data-pay-contact]")?.value || "").trim();
    const gift = dlg?.dataset.gift || "";
    const note = [gift ? T("pay_gift_to", gift) : "", (box?.querySelector("[data-pay-note]")?.value || "").trim()].filter(Boolean).join("\n");
    const { data } = await sb.auth.getSession();
    if (!data?.session) return say(T("pay_login"), false);
    if (contact.length < 2) return say(T("pay_contact"), false);
    btn.disabled = true;
    const { error } = await sb.rpc("pay_claim_send", { p_method: dlg?.dataset.method || "", p_contact: contact, p_note: note });
    if (error) {
      btn.disabled = false;
      return say(error.message || "?", false);
    }
    say(T("pay_sent"), true);
  });
}

export function planFor(cfg, p) {
  // Yönetici otomatik planları gizlediyse (mağaza hazır değil) plan yok sayılır
  if (payMethods(cfg).hide_plans) return { price: "", checkout: "" };
  const dyn = proPrice(cfg, p);
  if (dyn) return { price: fmtMoney(dyn.num, dyn.cur), checkout: "pro:" + p.id, num: dyn.num, cur: dyn.cur };
  const tr = region === "tr" && (cfg[p.trPrice] || cfg[p.trCheckout]);
  return {
    price: (tr ? cfg[p.trPrice] : cfg[p.price]) || "",
    checkout: (tr ? cfg[p.trCheckout] : cfg[p.checkout]) || "",
  };
}

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
    if (error) {
      let msg = error.message;
      try {
        const j = await error.context?.json();
        msg = j?.error || msg;
      } catch {}
      throw new Error(msg);
    }
    if (!data?.url) throw new Error(T("error"));
    const how = await openCheckout(data.url, () => {
      toast(T(giftTo ? "gift_pay_ok" : "pay_ok"));
      setTimeout(() => (location.href = `hesap.html?paid=${giftTo ? "gift" : "pro"}`), 3000);
    });
    // Katman açıldıysa sayfa yerinde kalır (false: düğme yeniden etkinleşir); tam sayfa yönlendirmede true
    return how === "redirect";
  } catch (e) {
    toast(e?.message || T("error"), true);
    return false;
  }
}

/** Ödeme bağlantısı mı, otomatik ödeme mi ("pro:<plan>") */
export const isProCheckout = (link) => typeof link === "string" && link.startsWith("pro:");

// Ortak metinler (üst menü, alt bilgi, genel)
addDict({
  per_month: ["ayda {0}", "{0} per month"],
  best_value: ["En avantajlı", "Best value"],
  popular: ["Popüler", "Popular"],
  pay_patreon_note: ["Yalnızca aylık abonelik alınır. Patreon'da buradaki e-posta adresini kullandığında SRTR Pitwall PRO kendiliğinden açılır.", "Monthly subscription only. Use the same e-mail on Patreon as here and SRTR Pitwall PRO turns on automatically."],
  pay_open: ["Ödeme sayfasını aç", "Open payment page"],
  pay_with: ["Öde", "Pay"],
  pay_gift: ["Hediye et", "Gift"],
  pay_gift_to: ["Hediye alıcısı: {0}", "Gift recipient: {0}"],
  pay_step1: ["Ödemeyi yap", "Make the payment"],
  pay_step2: ["Satın alımını bildir (isteğe bağlı)", "Report your purchase (optional)"],
  pay_step2_h: [
    "SRTR Pitwall kullanıcı adını ya da e-postanı yazıp gönder; üyeliğin bu bilgiye göre tanımlanır.",
    "Enter your SRTR Pitwall username or e-mail and send it; your membership is assigned using this information.",
  ],
  pay_bought: ["Satın alım yaptım", "I've made the purchase"],
  pay_bought_h: ["Ödemeyi yaptıysan haber ver; üyeliğin daha hızlı tanımlanır.", "If you have paid, let us know; your membership is assigned sooner."],
  pay_same_day: ["PRO üyeliğin, ödemen kontrol edildikten sonra gün içinde tanımlanır.", "Your PRO membership is assigned within the day, once your payment has been checked."],
  pay_bng: ["ByNoGame'de siparişin teslim edildiğinde teslimatı onaylamayı unutma.", "Don't forget to confirm the delivery on ByNoGame once your order has been delivered."],
  pay_contact: ["Kullanıcı adın ya da e-postan", "Your username or e-mail"],
  pay_info: ["Ödeme bilgilerin", "Your payment details"],
  pay_note: ["Ödemede kullandığın ad, tutar, tarih ve saat, sipariş / işlem numarası, seçtiğin süre…", "The name you paid with, amount, date and time, order / transaction number, the period you chose…"],
  pay_send: ["Bildirimi gönder", "Send notification"],
  pay_login: ["Bildirim göndermek için önce hesabına giriş yap.", "Sign in to your account first to send the notification."],
  pay_sent: [
    "Bildirimin gönderildi. Ödemen kontrol edildikten sonra PRO üyeliğin gün içinde tanımlanacak.",
    "Your notification was sent. Once your payment has been checked, your PRO membership will be assigned within the day.",
  ],
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
  nav_crew: ["Ekip", "Crew"],
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
    $$(".nav-crew").forEach((a) => (a.hidden = !u));
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
        <a href="features.html" class="${active === "features" ? "on" : ""}" data-t="nav_features"></a>
        <a href="index.html#pricing" data-t="nav_pricing"></a>
        <a href="index.html#faq" data-t="nav_faq"></a>
        <a href="takimlar.html" class="${active === "teams" ? "on" : ""}" data-t="nav_teams"></a>
        <a href="yarisci.html" class="${active === "drivers" ? "on" : ""}" data-t="nav_drivers"></a>
        <a href="reklam.html" class="${active === "ads" ? "on" : ""}" data-t="nav_ads"></a>
        <a href="crew.html" class="nav-crew${active === "crew" ? " on" : ""}" hidden data-t="nav_crew"></a>
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
        <div class="foot-tl" role="group" hidden></div>
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
  // Üst çubuk bağlantıları (Discord, WhatsApp…): alt bilgide küçük simgeler
  import("./toplinks.js").then((m) => m.initTopLinks()).catch(() => {});
}
