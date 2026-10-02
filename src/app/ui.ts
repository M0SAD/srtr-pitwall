// Kontrol panelinin sayfalar arası paylaşılan durumu.

import { t } from "@/sdk/i18n";
import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { settings } from "@/sdk/settings";

/** Sol ikon menüsündeki bölümler */
export type Section =
  | "overlays"
  | "layouts"
  | "streaming"
  | "drivers"
  | "telemetry"
  | "community"
  | "shots"
  | "tools"
  | "voice"
  | "livechat"
  | "pro"
  | "account"
  | "admin"
  | "settings"
  | "support";

export const [section, setSection] = createSignal<Section>("overlays");
/** Bölüm içindeki alt sayfa (ayarlar: general, appearance, ...) */
export const [sub, setSub] = createSignal<string>("");

export function go(sec: Section, subPage = "") {
  setSection(sec);
  setSub(subPage);
}

/** Destek: açılacak talep (bildirime tıklayınca) */
export const [supportFocus, setSupportFocus] = createSignal<string | null>(null);
/** Destek talebini aç: kullanıcı kendi talebini Destek'te, yönetici Yönetim › Destek'te görür */
export function openTicket(id: string, admin = false) {
  setSupportFocus(id);
  if (admin) go("admin", "support");
  else go("support");
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
/**
 * Overlay'ler sayfasında düzenlenen düzen. null = "Etkin düzeni izle" (etkin düzen değişince sayfa da onu izler);
 * bir kimlik = o düzen sabit (otomatik geçiş ya da etkin düzen değişse de seçim yerinden oynamaz).
 */
export const [ovProfile, setOvProfile] = createSignal<string | null>(null);
/** Overlay'ler sayfasını belirli bir düzene çevir (zaten izlenen etkin düzen ise izleme korunur) */
export function editLayout(profileId: string) {
  if (ovProfile() === null && settings().activeProfile === profileId) return;
  if (settings().profiles[profileId]) setOvProfile(profileId);
}

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
/** Elle yapılan denetimden sonra kısa süre "güncelsin" göstermek için */
export const [justChecked, setJustChecked] = createSignal(false);

export async function loadVersion() {
  setVersion(await invoke<VersionInfo>("app_version"));
}

export async function checkUpdate(manual = false) {
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
    if (manual && !updateError() && !update()?.available) {
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 4000);
    }
  }
}

/** Arkadaş listesinde sağ tık > "Görünümü düzenle": Arkadaşlar sayfası bu arkadaşın ayarını açar */
export const [friendFocus, setFriendFocus] = createSignal<string | null>(null);
export function editFriendLook(accountId: string) {
  setFriendFocus(accountId);
  go("drivers", "friends");
}

// ---- Güncelleme kurulumu (ilerleme çubuğu penceresi) ----
export type InstallPhase = "idle" | "download" | "installing" | "error";
export const [updateDialog, setUpdateDialog] = createSignal(false);
export const [installPhase, setInstallPhase] = createSignal<InstallPhase>("idle");
export const [installPct, setInstallPct] = createSignal(0);
export const [installBytes, setInstallBytes] = createSignal<{ done: number; total: number | null }>({ done: 0, total: null });
export const [installError, setInstallError] = createSignal("");

let updateEventsBound = false;
/** İlerleme olaylarını bir kez bağlar (panel açılışında) */
export async function bindUpdateEvents() {
  if (updateEventsBound || !inTauriWin()) return;
  updateEventsBound = true;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<{ downloaded: number; total: number | null }>("update-progress", (e) => {
    const { downloaded, total } = e.payload;
    setInstallBytes({ done: downloaded, total });
    setInstallPct(total ? Math.min(100, Math.round((downloaded / total) * 100)) : 0);
  });
  await listen<string>("update-stage", (e) => {
    if (e.payload === "installing") {
      setInstallPct(100);
      setInstallPhase("installing");
    }
  });
}

/** İndir ve kur: indirme bitince kurulum sessizce başlar, program kapanır ve yeni sürümle yeniden açılır */
export async function installUpdate() {
  if (installPhase() === "download" || installPhase() === "installing") return;
  await bindUpdateEvents();
  setInstallError("");
  setInstallPct(0);
  setInstallBytes({ done: 0, total: null });
  setInstallPhase("download");
  try {
    await invoke("update_install");
  } catch (e) {
    setInstallError(String(e));
    setInstallPhase("error");
  }
}

/** Sağ tık > "Ayarlarını aç": Overlay'ler sayfasında o kopyayı seçer. */
export function focusOverlay(id: string, profileId?: string | null) {
  if (profileId) editLayout(profileId);
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
