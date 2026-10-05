#!/usr/bin/env node
// Arayüz metinlerini toplar: src altındaki tüm .ts/.tsx dosyalarında Türkçe (kaynak dil)
// kullanıcıya görünen metinleri bulur ve src/locales/_source.json dosyasına yazar.
// Çeviri dosyaları (src/locales/<dil>.json) bu anahtarlarla eşleşir.
//
// Kullanım: node scripts/i18n/extract.mjs            -> kataloğu güncelle
//           node scripts/i18n/extract.mjs --missing  -> her dilde eksik anahtarları listele

import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(root, "src");
const OUT = join(SRC, "locales");

const SKIP_DIRS = new Set(["locales", "assets"]);
const SKIP_FILES = [/types\.ts$/, /vite-env\.d\.ts$/, /engineerScreens\.ts$/, /i18n\.ts$/];

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(n) && !n.startsWith("_")) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(n) && !SKIP_FILES.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

const TR = /[çğıöşüÇĞİÖŞÜ]/;
const LETTER = /[A-Za-zÀ-ÿçğıöşüÇĞİÖŞÜ]/;
const CODEY = /^[a-z0-9_\-./:#?=&%@$*+<>()[\]{},;|\\"'`~^!]+$/; // tek kelime, küçük harf, kod benzeri
const ATTRS = new Set(["placeholder", "title", "label", "alt", "aria-label", "fallback", "caption", "description", "sub"]);
const SKIP_ATTRS = new Set(["class", "classList", "style", "id", "href", "src", "type", "name", "value", "key", "for", "role", "inputMode", "autocomplete", "accept", "rel", "target", "d", "viewBox", "fill", "stroke", "transform", "preserveAspectRatio", "mode", "place", "view"]);
const SKIP_CALLS = new Set(["invoke", "listen", "emit", "import", "require", "querySelector", "querySelectorAll", "getElementById", "addEventListener", "removeEventListener", "setItem", "getItem", "removeItem", "api", "rest", "fetch", "startsWith", "endsWith", "includes", "split", "replace", "join", "test", "match", "createElement", "getContext", "setAttribute", "toLocaleString", "toLocaleTimeString", "toLocaleDateString", "Intl", "console", "log", "warn", "error", "info", "debug", "matchMedia", "localeCompare", "indexOf", "manifestById", "shortcut", "useTopic", "orderValue", "go", "authRequest", "update", "instanceName", "setBackdrop", "setMode", "invokeCmd", "encodeURIComponent", "padStart", "toFixed", "prettyKey", "setSel", "setSelId", "open", "startResizeDragging", "closest"]);

/** Doğal dil metni mi? */
const ACRONYMS = new Set(["BMW", "LMU", "MB", "NFD", "NFC", "POST", "PUT", "GET", "PATCH", "DELETE", "VIP", "MOD", "DE", "SOF", "PRO", "ABS", "TC", "BB", "FPS", "GPU", "LED", "HUD", "OBS", "IP", "SR", "OUT", "PIT", "BLK", "DSQ", "REP", "BLU", "LF", "RF", "LR", "RR", "RPM", "UTC", "URL", "API", "MQTT", "HTTP", "JSON", "OK", "ID", "XL", "XLT", "GT3", "GTP", "LMP", "AM", "Pro", "Am", "P", "S", "L", "R", "T", "x", "km/h", "mph", "kPa", "psi", "bar", "°C", "°F", "Hz", "px", "sn", "dk", "Esc", "Fn"]);

const JUNK = /^shared-|sans-serif|monospace|calc\(|rgba\(|CAP REQ|SCHMOOPIIE|^NICK |^JOIN #|^Bearer |manifest id'si|^\d+ Hz$|^\d+ sn$|^Ctrl\+|^A 3\.10$|^Aa( |$)/;

function natural(s, strong, jsx = false) {
  const t = s.replace(/\s+/g, " ").trim();
  if (JUNK.test(t)) return false;
  if (t.length < 2 || !LETTER.test(t)) return false;
  if (/^https?:|^[./]|\.(png|jpg|svg|css|json|ts|tsx|html|wav)$|^--|^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (/^[a-z]+(-[a-z0-9]+)+$/.test(t)) return false; // kebab-case
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !TR.test(t)) return jsx && t.length > 2; // tek küçük kelime: sadece JSX metninde
  if (ACRONYMS.has(t)) return false; // kısaltmalar: SOF, PRO...
  if (!TR.test(t) && CODEY.test(t)) return false;
  if (/^(\s*[a-z-]+\s*)+$/.test(t) && !TR.test(t) && !strong) return false; // "btn ghost small"
  return true;
}

const found = new Map(); // anahtar -> dosyalar

function add(key, file) {
  const k = key.replace(/\s+/g, " ").trim();
  if (!k) return;
  if (!found.has(k)) found.set(k, new Set());
  found.get(k).add(relative(root, file));
}

function attrName(node) {
  let p = node.parent;
  while (p && (ts.isJsxExpression(p) || ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || ts.isBinaryExpression(p))) p = p.parent;
  if (p && ts.isJsxAttribute(p)) return p.name.getText();
  return null;
}

function callName(node) {
  let p = node.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isArrayLiteralExpression(p) || ts.isObjectLiteralExpression(p) || ts.isPropertyAssignment(p) || ts.isConditionalExpression(p))) p = p.parent;
  if (p && (ts.isCallExpression(p) || ts.isNewExpression(p))) {
    const e = p.expression;
    const name = ts.isPropertyAccessExpression(e) ? e.name.getText() : e.getText();
    return name;
  }
  return null;
}

function isKeyish(node) {
  const p = node.parent;
  if (ts.isPropertyAssignment(p) && p.name === node) return true; // nesne anahtarı
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode?.(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText())) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  return false;
}

function propName(node) {
  const p = node.parent;
  if (ts.isPropertyAssignment(p) && p.initializer === node) return p.name.getText().replace(/["']/g, "");
  return null;
}

const VALUE_PROPS = new Set(["id", "key", "value", "type", "kind", "topic", "name_", "icon", "color", "category", "t", "hz", "mode", "view", "path", "file", "url", "font", "numFont", "preset", "density", "style", "code", "slug", "group_"]);

function visit(file, sf) {
  const text = sf.getFullText();
  function v(node) {
    if (ts.isJsxText(node)) {
      const s = node.getText();
      if (LETTER.test(s) && natural(s, true, true)) add(s, file);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const s = node.text;
      if (!isKeyish(node)) {
        const an = attrName(node);
        const cn = callName(node);
        const pn = propName(node);
        const strongCtx = (an && ATTRS.has(an)) || (pn && !VALUE_PROPS.has(pn));
        if (an && SKIP_ATTRS.has(an)) {
          /* sınıf vb. */
        } else if (cn && SKIP_CALLS.has(cn) && !(pn && !VALUE_PROPS.has(pn))) {
          /* komut adı vb. */
        } else if (pn && VALUE_PROPS.has(pn)) {
          /* değer anahtarı */
        } else if (natural(s, strongCtx) && (TR.test(s) || strongCtx || /\s/.test(s.trim()) || /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]/.test(s) || /^[A-ZÇĞİÖŞÜ]{3,}$/.test(s))) {
          add(s, file);
        }
      }
    } else if (ts.isTemplateExpression(node)) {
      // `Son ${n} tur` -> "Son {0} tur"
      const an = attrName(node);
      if (!(an && SKIP_ATTRS.has(an))) {
        let s = node.head.text;
        node.templateSpans.forEach((sp, i) => (s += `{${i}}` + sp.literal.text));
        const staticText = s.replace(/\{\d+\}/g, " ");
        if (LETTER.test(staticText) && !/[(){};:=<>]|px|%\)|\bvar\(|rgba|\\n|^\s*[#./-]|\/$/.test(staticText) && (TR.test(staticText) || /[A-Za-zçğıöşüÇĞİÖŞÜ]{2,}/.test(staticText)) && natural(s, true)) add(s, file);
      }
    }
    ts.forEachChild(node, v);
  }
  v(sf);
}

for (const f of walk(SRC)) {
  const code = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, code, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  visit(f, sf);
}

// Rust tarafından gelen metinler (yarış kontrol olayları vb.) elle eklenir
const EXTRA = JSON.parse(readFileSync(join(root, "scripts/i18n/extra.json"), "utf8"));
for (const k of EXTRA) add(k, "src-tauri");

const keys = [...found.keys()].sort((a, b) => a.localeCompare(b, "tr"));
const source = Object.fromEntries(keys.map((k) => [k, [...found.get(k)].join(", ")]));
writeFileSync(join(OUT, "_source.json"), JSON.stringify(source, null, 1) + "\n");
console.log(`${keys.length} metin -> src/locales/_source.json`);

if (process.argv.includes("--missing")) {
  for (const n of readdirSync(OUT).filter((n) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(n))) {
    const d = JSON.parse(readFileSync(join(OUT, n), "utf8"));
    const miss = keys.filter((k) => !(k in d));
    console.log(`${n}: ${miss.length} eksik`);
  }
}
