// Genel kısayollar: ayarlarda metin olarak ("Ctrl+Shift+D") saklanır, Rust tarafı kaydeder.

import { settings } from "./settings";

export type ShortcutAction = "edit" | "hide" | "panel" | "shot";

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  edit: "Ctrl+Shift+E",
  hide: "Ctrl+Shift+D",
  panel: "Ctrl+Shift+Space",
  shot: "PrintScreen",
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  edit: "Yerleşimi düzenle / bitir",
  hide: "Overlay'leri gizle / göster",
  panel: "Kontrol panelini öne getir (düzenlerken de)",
  shot: "Ekran görüntüsü al (overlay'lerle)",
};

export function shortcut(action: ShortcutAction): string {
  return settings().general.shortcuts?.[action] ?? DEFAULT_SHORTCUTS[action];
}

/** Görünen ad: "Ctrl+Shift+Space" -> "Ctrl + Shift + Boşluk" */
export function prettyKey(k: string) {
  return k ? k.replace(/Space/, "Boşluk").replace("PrintScreen", "Print Screen") : "yok";
}

const CODE_NAMES: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
};

/**
 * Klavye olayından kısayol metni. Sadece değiştirici tuşa basıldıysa null.
 * Tek başına harf kabul edilmez (oyunda yazarken tetiklenmesin): en az bir değiştirici gerekir,
 * F tuşları hariç.
 */
export function fromEvent(e: KeyboardEvent): string | null {
  const c = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^F\d{1,2}$/.test(c)) key = c;
  else if (/^Numpad\d$/.test(c)) key = "Num" + c.slice(6);
  else if (CODE_NAMES[c]) key = CODE_NAMES[c];
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  // F tuşları ve PrintScreen/ScrollLock/Pause tek başına da olabilir
  if (mods.length === 0 && !/^(F\d|PrintScreen|ScrollLock|Pause)/.test(key)) return null;
  return [...mods, key].join("+");
}
