// Ana sayfa haberlerinin çevirisi (c135). Haber Türkçe yazılır; yayınlarken (her dilde gösterilecekse) diğer dillere
// makine çevirisiyle çevrilir ve haberle birlikte saklanır (Rust: translate.rs translate_batch; DeepL anahtarı
// varsa DeepL, yoksa MyMemory). Bir dilin çevirisi yoksa (ör. ücretsiz çeviri sınırı dolduysa) okuyanın programı o
// haberi kendi diline o an çevirir ve bu bilgisayarda saklar.
//
// Biçim korunur: satır başındaki "## ", "- ", "1. ", "> " çevrilmez; bağlantı adresleri çeviriye yer tutucu olarak gider.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { LANGS } from "@/sdk/i18n";
import { inTauri } from "@/sdk/platform";
import type { HomeCategory, HomePost, HomePostTr } from "@/cloud/home";

/** Çevrilecek diller (Türkçe asıl dil) */
export const TARGET_LANGS = LANGS.map((l) => l.code).filter((c) => c !== "tr");

/** Asıl metnin özeti: metin değişince çeviri yenilenir */
export function srcHash(p: Pick<HomePost, "title" | "body" | "links"> & { summary?: string }) {
  const s = [p.title, p.summary ?? "", p.body, ...(p.links ?? []).map((l) => l.label)].join("\u0001");
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${s.length}`;
}

const PREFIX = /^(\s*(?:#{1,3}\s+|[-*•]\s+|\d+[.)]\s+|>\s?)?)([\s\S]*)$/;
const URLS = /(\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<>"]+)/g;

interface Line {
  pre: string;
  text: string;
  urls: string[];
}

/** Satırı (önek, çevrilecek metin, korunan adresler) olarak ayır */
function splitLine(line: string): Line {
  const m = line.match(PREFIX)!;
  const urls: string[] = [];
  const text = m[2].replace(URLS, (_all, md, mdUrl, bare) => {
    urls.push(md ? mdUrl : bare);
    const tok = `XQZL${urls.length - 1}X`;
    return md ? `](${tok})` : tok;
  });
  return { pre: m[1], text, urls };
}

function joinLine(l: Line, translated: string) {
  let t = translated;
  l.urls.forEach((u, i) => {
    t = t.replace(new RegExp(`XQZ\\s*L\\s*${i}\\s*X`, "i"), u);
  });
  // Çeviri servisi "](" arasına boşluk koyabilir
  t = t.replace(/\]\s+\(/g, "](");
  return l.pre + t;
}

/** Bir haberi bir dile çevirir */
async function translateOne(p: HomePost, to: string): Promise<HomePostTr> {
  const links = (p.links ?? []).map((l) => l.label || "");
  const lines = p.body.replace(/\r\n/g, "\n").split("\n").map(splitLine);
  // Yalnızca ayırıcı çizgi / boş satır olanlar çevrilmez
  const texts = [p.title, p.summary ?? "", ...links, ...lines.map((l) => (/^\s*(-{3,}|\*{3,}|_{3,})?\s*$/.test(l.text) ? "" : l.text))];
  const out = await invoke<string[]>("translate_batch", { texts, from: "tr", to });
  const n = links.length;
  return {
    title: out[0] || p.title,
    summary: out[1] ?? "",
    links: out.slice(2, 2 + n),
    body: lines.map((l, i) => (l.text.trim() && out[2 + n + i] ? joinLine(l, out[2 + n + i]) : l.pre + l.text.replace(/XQZL(\d+)X/g, (_, k) => l.urls[+k] ?? ""))).join("\n"),
  };
}

export interface TranslateResult {
  translations: Record<string, HomePostTr>;
  errors: { lang: string; msg: string }[];
}

/**
 * Haberi diğer dillere çevirir. `keep`: önceki çeviriler (aynı metinse yeniden çevrilmez). Bir dilde hata olursa
 * (ör. günlük sınır) kalan diller denenmez; çevrilemeyenleri okuyucunun programı kendisi çevirir.
 */
export async function translatePost(p: HomePost, onProgress: (done: number, total: number, lang: string) => void, keep?: Record<string, HomePostTr>): Promise<TranslateResult> {
  const translations: Record<string, HomePostTr> = { ...(keep ?? {}) };
  const errors: { lang: string; msg: string }[] = [];
  const todo = TARGET_LANGS.filter((l) => !translations[l]);
  for (let i = 0; i < todo.length; i++) {
    const to = todo[i];
    onProgress(i, todo.length, to);
    try {
      translations[to] = await translateOne(p, to);
    } catch (e) {
      const msg = typeof e === "string" ? e : String((e as Error)?.message ?? e);
      errors.push({ lang: to, msg });
      if (/sınır|geçersiz|anahtar|limit|bağlanılamadı/i.test(msg)) break;
    }
  }
  onProgress(todo.length, todo.length, "");
  return { translations, errors };
}

/** Kategori adlarını diğer dillere çevirir (dil başına tek istek) */
export async function translateCategoryNames(names: string[]): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = names.map(() => ({}));
  for (const to of TARGET_LANGS) {
    try {
      const tr = await invoke<string[]>("translate_batch", { texts: names, from: "tr", to });
      tr.forEach((x, i) => x.trim() && (out[i][to] = x.trim().slice(0, 40)));
    } catch {
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Okuyucu tarafı: kayıtlı çevirisi olmayan haberi o an kendi diline çevir (sırayla, bu bilgisayarda saklanır)
// ---------------------------------------------------------------------------
const [local, setLocal] = createSignal<Record<string, HomePostTr>>({});
const queue: { key: string; post: HomePost; lang: string }[] = [];
const failed = new Set<string>();
let running = false;

const cacheKey = (p: HomePost, lang: string) => `pitwall.homeTr.${p.id}.${lang}.${srcHash(p)}`;

function readCache(key: string): HomePostTr | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as HomePostTr) : null;
  } catch {
    return null;
  }
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const j = queue.shift()!;
    try {
      const tr = await translateOne(j.post, j.lang);
      try {
        localStorage.setItem(j.key, JSON.stringify(tr));
      } catch {
        /* yer yoksa yalnızca bellekte */
      }
      setLocal((m) => ({ ...m, [j.key]: tr }));
    } catch {
      failed.add(j.key);
    }
  }
  running = false;
}

/** Haberin `lang` dilindeki metni: kayıtlı çeviri, yoksa bu bilgisayarda yapılan çeviri; o da yoksa null (Türkçe asıl gösterilir) */
export function localized(p: HomePost, lang: string): HomePostTr | null {
  if (lang === "tr") return null;
  const saved = p.translations?.[lang];
  if (saved?.title) return saved;
  if (!inTauri || !p.id || p.id === "preview") return null;
  const key = cacheKey(p, lang);
  const mem = local()[key];
  if (mem) return mem;
  const cached = readCache(key);
  if (cached) {
    queueMicrotask(() => setLocal((m) => ({ ...m, [key]: cached })));
    return cached;
  }
  if (!failed.has(key) && !queue.some((q) => q.key === key)) {
    queue.push({ key, post: p, lang });
    void pump();
  }
  return null;
}

/** Kategorinin `lang` dilindeki adı */
export const categoryName = (c: HomeCategory | undefined, name: string, lang: string) => (lang === "tr" ? name : c?.names?.[lang] || name);
