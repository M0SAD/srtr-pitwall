// Kontrol panelinin sayfalar arası paylaşılan durumu.

import { t } from "@/sdk/i18n";
import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/** Sol ikon menüsündeki bölümler */
export type Section =
  | "overlays"
  | "layouts"
  | "streaming"
  | "drivers"
  | "community"
  | "shots"
  | "tools"
  | "voice"
  | "pro"
  | "account"
  | "settings";

export const [section, setSection] = createSignal<Section>("overlays");
/** Bölüm içindeki alt sayfa (ayarlar: general, appearance, ...) */
export const [sub, setSub] = createSignal<string>("");

export function go(sec: Section, subPage = "") {
  setSection(sec);
  setSub(subPage);
}

/** Eski sayfa adları (bazı bileşenler kullanıyor) */
export type Page = "overlays" | "appearance" | "tools" | "friends" | "community" | "league" | "general" | "account";
const PAGE_MAP: Record<Page, [Section, string]> = {
  overlays: ["overlays", ""],
  appearance: ["settings", "appearance"],
  tools: ["tools", ""],
  friends: ["drivers", "friends"],
  community: ["community", "home"],
  league: ["drivers", "league"],
  general: ["settings", "general"],
  account: ["account", ""],
};
export function setPage(p: Page) {
  const [a, b] = PAGE_MAP[p];
  go(a, b);
}
export const page = () => section();

/** Overlay'ler sayfasında açık olan ayar kartı */
export const [openCard, setOpenCard] = createSignal<string | null>(null);

export interface VersionInfo {
  display: string;
  semver: string;
  updateConfigured: boolean;
}

export interface UpdateInfo {
  configured: boolean;
  available: boolean;
  version: string | null;
  notes: string | null;
  date: string | null;
}

export const [version, setVersion] = createSignal<VersionInfo | null>(null);
export const [update, setUpdate] = createSignal<UpdateInfo | null>(null);
export const [updateError, setUpdateError] = createSignal("");
export const [checking, setChecking] = createSignal(false);

export async function loadVersion() {
  setVersion(await invoke<VersionInfo>("app_version"));
}

export async function checkUpdate() {
  setChecking(true);
  setUpdateError("");
  try {
    setUpdate(await invoke<UpdateInfo>("update_check"));
  } catch (e) {
    const m = String(e);
    // Henüz yayınlanmış sürüm yok (latest.json bulunamadı) ya da internet yok
    if (/valid release JSON|404|Not Found/i.test(m)) {
      setUpdate({ configured: true, available: false, version: null, notes: null, date: null });
    } else if (/error sending request|dns|connect|timed out|network/i.test(m)) {
      setUpdateError(t("Güncelleme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et."));
    } else setUpdateError(m);
  } finally {
    setChecking(false);
  }
}

/** Sağ tık > "Ayarlarını aç": Overlay'ler sayfasında o kopyayı seçer. */
export function focusOverlay(id: string) {
  go("overlays");
  setOpenCard(id);
}

/** Harici bağlantıyı varsayılan tarayıcıda aç */
export function openUrl(url: string) {
  if (inTauriWin()) invoke("open_url", { url }).catch(() => window.open(url, "_blank"));
  else window.open(url, "_blank");
}

function inTauriWin() {
  return "__TAURI_INTERNALS__" in window;
}
