// Çok dil desteği.
//
// Kaynak dil Türkçe: arayüz metinleri kodda Türkçe yazılır, anahtar olarak da Türkçe metin
// kullanılır. Çeviriler src/locales/<dil>.json dosyalarındadır (scripts/i18n/extract.mjs
// yeni metinleri _source.json'a toplar).
//
// İki yol var:
//  - t("Metin {0}", değer): kodda doğrudan çeviri (onay pencereleri, Rust'a giden metinler…).
//  - DOM çevirmeni: pencerede görünen tüm metin düğümlerini ve title/placeholder gibi
//    öznitelikleri kendiliğinden çevirir. Böylece overlay ve panel kodunun her satırı
//    t() ile sarılmak zorunda kalmaz; yeni eklenen Türkçe metin kataloğa girince çevrilir.

import { createSignal } from "solid-js";

export interface LangInfo {
  code: string;
  name: string;
  /** Tarih/saat biçimleri için BCP-47 */
  locale: string;
}

export const LANGS: LangInfo[] = [
  { code: "tr", name: "Türkçe", locale: "tr-TR" },
  { code: "en", name: "English", locale: "en-GB" },
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "es", name: "Español", locale: "es-ES" },
  { code: "pt-BR", name: "Português (Brasil)", locale: "pt-BR" },
  { code: "pt-PT", name: "Português (Portugal)", locale: "pt-PT" },
  { code: "fr", name: "Français", locale: "fr-FR" },
  { code: "it", name: "Italiano", locale: "it-IT" },
  { code: "nl", name: "Nederlands", locale: "nl-NL" },
  { code: "pl", name: "Polski", locale: "pl-PL" },
  { code: "sv", name: "Svenska", locale: "sv-SE" },
  { code: "fi", name: "Suomi", locale: "fi-FI" },
  { code: "ru", name: "Русский", locale: "ru-RU" },
  { code: "zh-CN", name: "简体中文", locale: "zh-CN" },
  { code: "ja", name: "日本語", locale: "ja-JP" },
];

/** Sistem dilinden en yakın desteklenen dil */
export function detectLang(): string {
  const nav = (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "en";
  const l = nav.toLowerCase();
  if (l.startsWith("pt")) return l.includes("br") ? "pt-BR" : "pt-PT";
  if (l.startsWith("zh")) return "zh-CN";
  const hit = LANGS.find((x) => x.code.toLowerCase() === l || x.code === l.slice(0, 2));
  return hit?.code ?? "en";
}

const loaders = import.meta.glob<{ default: Record<string, string> }>(["../locales/*.json", "!../locales/_*.json"]);

const [lang, setLangSig] = createSignal("tr");
const [ready, setReady] = createSignal(0);
export { lang };

let dict: Record<string, string> = {};
let patterns: { re: RegExp; order: number[]; out: string }[] = [];
const cache = new Map<string, string | null>();

export function localeTag(): string {
  return LANGS.find((l) => l.code === lang())?.locale ?? "tr-TR";
}

function norm(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPatterns() {
  patterns = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!/\{\d\}/.test(k)) continue;
    const order: number[] = [];
    const src = k
      .split(/(\{\d\})/)
      .map((p) => {
        const m = /^\{(\d)\}$/.exec(p);
        if (m) {
          order.push(Number(m[1]));
          return "(.+?)";
        }
        return escapeRe(p);
      })
      .join("");
    patterns.push({ re: new RegExp(`^${src}$`, "s"), order, out: v });
  }
  // Uzun kalıplar önce (daha özgül)
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
}

/** Dili değiştirir; sözlük yüklenince tüm açık metinler yeniden çevrilir. */
export async function setLang(code: string) {
  const c = LANGS.some((l) => l.code === code) ? code : "tr";
  if (c === "tr") {
    dict = {};
  } else {
    const load = loaders[`../locales/${c}.json`];
    dict = load ? (await load()).default : {};
  }
  cache.clear();
  buildPatterns();
  setLangSig(c);
  document.documentElement.lang = c;
  setReady((n) => n + 1);
  retranslateAll();
}

/** Metni çevirir; bulunamazsa null */
function lookup(src: string): string | null {
  const key = norm(src);
  if (!key || !/\p{L}/u.test(key)) return null;
  const c = cache.get(key);
  if (c !== undefined) return c;
  let out: string | null = dict[key] ?? null;
  if (out === null) {
    for (const p of patterns) {
      const m = p.re.exec(key);
      if (!m) continue;
      out = p.out.replace(/\{(\d)\}/g, (_, n) => {
        const i = p.order.indexOf(Number(n));
        return i >= 0 ? m[i + 1] : "";
      });
      break;
    }
  }
  if (cache.size > 8000) cache.clear();
  cache.set(key, out);
  return out;
}

/** Kod içinde çeviri: t("Port {0} açılamadı", 8910) */
export function t(key: string, ...args: unknown[]): string {
  ready(); // reaktif: dil değişince yeniden hesaplanır
  const base = dict[key] ?? key;
  return args.length ? base.replace(/\{(\d)\}/g, (m, n) => (args[+n] !== undefined ? String(args[+n]) : m)) : base;
}

/** Serbest metni (ör. Rust'tan gelen hata) mümkünse çevirir */
export function translateText(s: string): string {
  if (lang() === "tr") return s;
  return lookup(s) ?? s;
}

// ---------------------------------------------------------------------------
// DOM çevirmeni
// ---------------------------------------------------------------------------

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "INPUT", "SELECT_"]);

interface TextState {
  src: string;
  out: string;
}
const textState = new WeakMap<Text, TextState>();
const attrState = new WeakMap<Element, Record<string, TextState>>();
let observer: MutationObserver | null = null;
let applying = false;

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.hasAttribute("data-no-i18n") || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function translateTextNode(n: Text) {
  const st = textState.get(n);
  const cur = n.data;
  // Düğüm bizim yazdığımız çeviriyi taşıyorsa kaynak değişmemiştir
  const src = st && cur === st.out ? st.src : cur;
  if (!/\p{L}/u.test(src)) {
    if (st) textState.delete(n);
    return;
  }
  if (skipped(n.parentElement)) return;
  const tr = lang() === "tr" ? null : lookup(src);
  let out = src;
  if (tr !== null) {
    const lead = /^\s*/.exec(src)![0];
    const trail = /\s*$/.exec(src)![0];
    out = lead + tr + trail;
  }
  textState.set(n, { src, out });
  if (n.data !== out) n.data = out;
}

function translateAttrs(el: Element) {
  if (skipped(el)) return;
  let st = attrState.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur === null) continue;
    const prev = st?.[a];
    const src = prev && cur === prev.out ? prev.src : cur;
    const tr = lang() === "tr" ? null : lookup(src);
    const out = tr ?? src;
    if (!st) {
      st = {};
      attrState.set(el, st);
    }
    st[a] = { src, out };
    if (cur !== out) el.setAttribute(a, out);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    translateAttrs(el);
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n as Text);
    else translateAttrs(n as Element);
    n = tw.nextNode();
  }
}

function retranslateAll() {
  if (!observer) return;
  applying = true;
  walk(document.documentElement);
  applying = false;
}

/** Penceredeki metinleri kendiliğinden çevirmeye başlar */
export function startDomTranslation() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver((list) => {
    if (applying || lang() === "tr") return;
    applying = true;
    for (const m of list) {
      if (m.type === "characterData") translateTextNode(m.target as Text);
      else if (m.type === "attributes") translateAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => walk(n));
    }
    applying = false;
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  retranslateAll();
  // Onay pencereleri
  const origConfirm = window.confirm.bind(window);
  window.confirm = (m?: string) => origConfirm(m === undefined ? m : translateText(String(m)));
  const origAlert = window.alert.bind(window);
  window.alert = (m?: unknown) => origAlert(m === undefined ? m : translateText(String(m)));
}

/** Rust tarafının kullandığı metinler (tepsi, pencere başlıkları, oturum özeti) */
export const RUST_KEYS = [
  "Düzenleme Modu", "Overlay Gizle/Göster", "Kontrol Paneli", "Çıkış", "Boşluk",
  "Pitwall Paneli", "Live Timing", "Mühendis Ekranı", "Arkadaşlar", "Arkadaş verileri",
  "oturum özeti", "Tarih (UTC)", "Başlangıç: P{0}   Bitiş: P{1} (sınıf)", "Tur: {0}  (geçerli {1})   En iyi: {2}", "Olay: {0}x",
  "TURLAR", "OLAYLAR", "SONUÇLAR", "yakıt", "geçersiz", "pit", "tur", "Tur", "toplam",
  "Pist dışı", "Kontrol kaybı / duvar", "Temas", "Ağır temas", "Olay",
];

/** Çevirileri Rust'a gönderir (panel penceresinden, dil değişince) */
export function rustStrings(): Record<string, string> {
  return Object.fromEntries(RUST_KEYS.map((k) => [k, dict[k] ?? k]));
}
