// Geri al / yinele (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z).
//
// Genel yardımcı: her değişiklik "önce" ve "sonra" görüntüsüyle kaydedilir. Geri alırken bütün durum
// eski görüntüyle değiştirilmez; yalnız o değişiklikte farklılaşan yollar eski değerine döner
// (`revert`). Böylece başka bir pencerede (overlay penceresi ↔ kontrol paneli) aynı anda yapılan
// başka değişiklikler bozulmaz. Sürükleme/kaydırıcı gibi art arda gelen aynı değişiklikler tek adımda
// birleştirilir.

import { createSignal } from "solid-js";
import { onSettingsChange, settings, updateSettings, type AppSettings } from "./settings";

type Json = any;

interface Entry {
  before: Json;
  after: Json;
  /** Değişen yolların imzası (birleştirme için) */
  sig: string;
  t: number;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => (v === undefined || v === null || typeof v !== "object" ? v : structuredClone(v));

/** `a` ile `b` arasında farklı olan yaprak yollar (diziler tek yaprak sayılır) */
export function changedPaths(a: Json, b: Json, prefix = "", out: string[] = []): string[] {
  if (a === b) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (!same(a, b)) out.push(prefix);
  return out;
}

/**
 * `cur` içinde, `from` ile `to` arasında değişmiş yolları `from` değerine döndürür.
 * Geri al: revert(şimdiki, önce, sonra) · Yinele: revert(şimdiki, sonra, önce)
 */
export function revert(cur: Json, from: Json, to: Json): Json {
  if (same(from, to)) return cur;
  if (isObj(from) && isObj(to) && isObj(cur)) {
    const out: Record<string, any> = { ...cur };
    for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (same(from[k], to[k])) continue;
      if (!(k in from)) delete out[k];
      else out[k] = revert(cur[k], from[k], to[k]);
    }
    return out;
  }
  return clone(from);
}

export interface History {
  /** Bir değişikliği kaydet (`sig` aynıysa ve `merge` true ise son adımla birleşir) */
  push(before: Json, after: Json, sig: string, merge: boolean): void;
  /** Geri alınmış durumu döner (yoksa null) */
  undo(cur: Json): Json | null;
  redo(cur: Json): Json | null;
  /** Birleştirmeyi bitir: sonraki değişiklik yeni bir adım olur */
  seal(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

export function createHistory(cap = 100): History {
  const undoStack: Entry[] = [];
  const redoStack: Entry[] = [];
  let sealed = true;
  const [ver, setVer] = createSignal(0);
  const bump = () => setVer((v) => v + 1);
  return {
    push(before, after, sig, merge) {
      const top = undoStack[undoStack.length - 1];
      if (top && !sealed && merge && top.sig === sig) {
        top.after = after;
        top.t = Date.now();
      } else {
        undoStack.push({ before, after, sig, t: Date.now() });
        if (undoStack.length > cap) undoStack.splice(0, undoStack.length - cap);
      }
      sealed = false;
      redoStack.length = 0;
      bump();
    },
    undo(cur) {
      const e = undoStack.pop();
      if (!e) return null;
      redoStack.push(e);
      sealed = true;
      bump();
      return revert(cur, e.before, e.after);
    },
    redo(cur) {
      const e = redoStack.pop();
      if (!e) return null;
      undoStack.push(e);
      sealed = true;
      bump();
      return revert(cur, e.after, e.before);
    },
    seal() {
      sealed = true;
    },
    canUndo: () => (ver(), undoStack.length > 0),
    canRedo: () => (ver(), redoStack.length > 0),
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      bump();
    },
  };
}

// ---------------------------------------------------------------------------
// Ayarlar için geçmiş: düzenler (overlay konumları, boyutları, ayarları) ve tema
// ---------------------------------------------------------------------------

/** Aynı türden art arda değişiklikler bu kadar ms içinde gelirse tek adım sayılır */
const COALESCE_MS = 800;

type Slice = Pick<AppSettings, "profiles" | "theme">;
const slice = (s: AppSettings): Slice => ({ profiles: s.profiles, theme: s.theme });

const hist = createHistory(100);
let last: Slice | null = null;
let applying = false;
let pointerDown = false;
let lastChange = 0;

/** Bu pencerede ayar geçmişini başlatır (bir kez; ayarlar yüklendikten sonra çağrılmalı) */
export function startSettingsHistory() {
  if (last) return;
  last = slice(settings());
  onSettingsChange((s, local) => {
    const now = slice(s);
    const before = last!;
    last = now;
    // Başka pencereden/buluttan gelen değişiklikler kaydedilmez (geri alma yalnız kendi yollarını döndürür)
    if (!local || applying) return;
    const paths = changedPaths(before, now);
    if (!paths.length) return;
    const t = Date.now();
    hist.push(before, now, paths.join("|"), pointerDown || t - lastChange < COALESCE_MS);
    lastChange = t;
  });
  // Sürükleme / kaydırıcı: fare basılıyken gelen değişiklikler tek adım; bırakınca adım kapanır
  window.addEventListener("pointerdown", () => (pointerDown = true), true);
  window.addEventListener(
    "pointerup",
    () => {
      pointerDown = false;
      hist.seal();
    },
    true,
  );
  window.addEventListener("blur", () => {
    pointerDown = false;
    hist.seal();
  });
}

function apply(fn: (cur: Slice) => Slice | null) {
  let changed = false;
  applying = true;
  try {
    updateSettings((d) => {
      const next = fn(slice(d));
      if (!next) return;
      changed = true;
      d.profiles = next.profiles;
      d.theme = next.theme;
      // Geri alınan bir ekleme seçili düzeni silmiş olabilir
      if (!d.profiles[d.activeProfile]) d.activeProfile = Object.keys(d.profiles)[0];
    });
  } finally {
    applying = false;
  }
  return changed;
}

export const undoSettings = () => apply((cur) => hist.undo(cur));
export const redoSettings = () => apply((cur) => hist.redo(cur));
export const canUndoSettings = () => hist.canUndo();
export const canRedoSettings = () => hist.canRedo();

/** Odak yazı kutusundaysa tarayıcının kendi geri almasına bırakılır */
function inTextField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  if (el.closest("textarea, [contenteditable=''], [contenteditable=true]")) return true;
  if (el instanceof HTMLInputElement) return !/^(checkbox|radio|range|button|submit|reset|color|file)$/.test(el.type);
  return false;
}

/**
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z kısayollarını bağlar. `enabled` false iken dokunmaz.
 * Dönen fonksiyon dinleyiciyi kaldırır.
 */
export function bindUndoKeys(enabled: () => boolean = () => true) {
  const onKey = (e: KeyboardEvent) => {
    if (!enabled() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    // Latin harf veren düzenlerde tuşun kendisi, diğerlerinde fiziksel konum (KeyZ/KeyY)
    const key = (e.key || "").toLowerCase();
    const letter = /^[a-z]$/.test(key) ? key : e.code === "KeyZ" ? "z" : e.code === "KeyY" ? "y" : "";
    const k = letter === "z" || letter === "y" ? letter : "";
    if (!k || inTextField(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (k === "z" && !e.shiftKey) undoSettings();
    else redoSettings();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}
