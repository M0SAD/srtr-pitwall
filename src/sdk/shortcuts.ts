// Genel kısayollar: ayarlarda metin olarak ("Ctrl+Shift+D") saklanır, Rust tarafı kaydeder.

import { settings } from "./settings";

export type ShortcutAction =
  | "edit"
  | "hide"
  | "panel"
  | "shot"
  | "voice"
  | "poll"
  | "tts"
  | "ttsHush"
  | "stt"
  | "chat"
  | "crewStop"
  | "vrConfig"
  | "vrRecenter"
  | "vrNext"
  | "vrMode"
  | "vrSave"
  | "vrReset"
  | "vrFace"
  | "vrGaze";

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  edit: "Ctrl+Shift+E",
  hide: "Ctrl+Shift+D",
  panel: "Ctrl+Shift+Space",
  shot: "F12",
  voice: "Ctrl+Shift+V",
  poll: "F9",
  tts: "F5",
  ttsHush: "",
  stt: "F6",
  chat: "Ctrl+Shift+C",
  crewStop: "",
  vrConfig: "F9",
  vrRecenter: "End",
  vrNext: "Space",
  vrMode: "M",
  vrSave: "F10",
  vrReset: "Home",
  vrFace: "F",
  vrGaze: "G",
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  edit: "Yerleşimi düzenle / bitir",
  hide: "Overlay'leri gizle / göster",
  panel: "Kontrol panelini öne getir (düzenlerken de)",
  shot: "Ekran görüntüsü al (overlay'lerle)",
  voice: "Sesli mühendisi aç / kapat (oyundayken)",
  poll: "Canlı Sohbet: anketi başlat / bitir",
  tts: "Canlı Sohbet: sesli okumayı aç / kapat",
  ttsHush: "Canlı Sohbet: okunanı kes ve kuyruğu boşalt",
  stt: "Canlı Sohbet: konuşma → yazıyı (altyazı) aç / kapat",
  chat: "Canlı Sohbet: başlat / durdur",
  crewStop: "Ekip: uzaktan pit kontrolünü durdur",
  vrConfig: "Yerel VR: yapılandırma modunu aç / kapat",
  vrRecenter: "Yerel VR: ortala (overlay'leri baktığın yöne al)",
  vrNext: "Yerel VR: sonraki overlay'i seç",
  vrMode: "Yerel VR: konum / ayar modu arasında geç",
  vrSave: "Yerel VR: yerleşimi şimdi kaydet",
  vrReset: "Yerel VR: seçili overlay'i sıfırla",
  vrFace: "Yerel VR: seçili overlay bana dönsün (aç / kapat)",
  vrGaze: "Yerel VR: seçili overlay'de bakış modu (aç / kapat)",
};

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "edit",
  "hide",
  "panel",
  "shot",
  "voice",
  "chat",
  "crewStop",
  "poll",
  "tts",
  "ttsHush",
  "stt",
  "vrConfig",
  "vrRecenter",
  "vrNext",
  "vrMode",
  "vrSave",
  "vrReset",
  "vrFace",
  "vrGaze",
];

/** Sadece Canlı Sohbet çalışırken (ya da altyazı açıkken) kaydedilen kısayollar (Rust: lib.rs LIVECHAT_ONLY) */
export const LIVECHAT_SHORTCUTS: ShortcutAction[] = ["poll", "tts", "ttsHush", "stt"];

/** Sadece yerel VR (SteamVR overlay'i) çalışırken kaydedilen kısayollar (Rust: lib.rs VR_ONLY) */
export const VR_SHORTCUTS: ShortcutAction[] = ["vrConfig", "vrRecenter", "vrNext", "vrMode", "vrSave", "vrReset", "vrFace", "vrGaze"];
/** … ve sadece yapılandırma modu açıkken kaydedilenler (Rust: lib.rs VR_CONFIG_ONLY) */
export const VR_CONFIG_SHORTCUTS: ShortcutAction[] = ["vrNext", "vrMode", "vrSave", "vrReset", "vrFace", "vrGaze"];

export function shortcut(action: ShortcutAction): string {
  return settings().general.shortcuts?.[action] ?? DEFAULT_SHORTCUTS[action];
}

/** İki kısayol aynı tuş birleşimi mi (değiştirici sırası ve büyük/küçük harf önemsiz) */
export function sameKey(a: string, b: string): boolean {
  const norm = (k: string) =>
    k
      .split("+")
      .map((x) => x.trim().toLowerCase())
      .map((x) => (x === "control" ? "ctrl" : x === "cmd" || x === "meta" || x === "win" ? "super" : x))
      .filter(Boolean)
      .sort()
      .join("+");
  return !!a && !!b && norm(a) === norm(b);
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
 * F tuşları hariç. `allowBare`: tek tuşa izin ver (yalnız kısa süre kaydedilen yerel VR kısayolları için).
 */
export function fromEvent(e: KeyboardEvent, allowBare = false): string | null {
  // Bazı klavyelerde/WebView2'de PrintScreen keyup olayında code boş gelebilir
  const c = e.code || (e.key === "PrintScreen" ? "PrintScreen" : "");
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^F\d{1,2}$/.test(c)) key = c;
  else if (/^Numpad\d$/.test(c)) key = "Num" + c.slice(6);
  else if (CODE_NAMES[c]) key = CODE_NAMES[c];
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
  // F tuşları ve PrintScreen/ScrollLock/Pause tek başına da olabilir
  if (mods.length === 0 && !allowBare && !/^(F\d|PrintScreen|ScrollLock|Pause)/.test(key)) return null;
  return [...mods, key].join("+");
}
