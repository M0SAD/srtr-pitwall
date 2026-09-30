// Hesap profili, uygulama yapılandırması (PRO overlay'ler, destek bağlantıları) ve PRO durumu.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { api, cloudEnabled, session } from "./supabase";
import { apiBase, inTauri } from "@/sdk/platform";
import { loadNotices, loadPerms } from "./moderation";
import { normalizeWatermark, syncWatermark, type WatermarkCfg } from "@/sdk/watermark";

export interface Profile {
  id: string;
  display_name: string;
  iracing_id: number | null;
  iracing_name: string | null;
  pay_email: string | null;
  is_admin: boolean;
  is_owner?: boolean;
  pro_until: string | null;
  pro_source: string | null;
}

export interface AppConfig {
  pro_overlays: string[];
  patreon_url: string;
  kofi_url: string;
  price_monthly: string;
  price_yearly: string;
  price_3m?: string;
  price_6m?: string;
  /** Lemon Squeezy ödeme bağlantıları (1, 3, 6, 12 aylık) */
  checkout_1m?: string;
  checkout_3m?: string;
  checkout_6m?: string;
  checkout_12m?: string;
  /** Bir hesabın kullanabileceği bilgisayar sayısı (aşılınca yöneticiye uyarı gider) */
  device_limit?: number;
  pro_note: string;
  watermark?: Partial<WatermarkCfg>;
  shots_enabled?: boolean;
  shot_max_width?: number;
  shot_quality?: number;
  shot_daily_limit?: number;
  /** Bildirimler okunduktan sonra kaç saat listede kalır */
  notice_keep_hours?: number;
}

export interface Entitlement {
  pro: boolean;
  proUntil: number;
  locked: string[];
}

const CONFIG_CACHE = "pitwall.appConfig";

function cachedConfig(): AppConfig | null {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_CACHE) || "null");
  } catch {
    return null;
  }
}

const [profile, setProfile] = createSignal<Profile | null>(null);
const [config, setConfig] = createSignal<AppConfig | null>(cachedConfig());
const [entitlement, setEntitlement] = createSignal<Entitlement>({ pro: false, proUntil: 0, locked: [] });
export { profile, config, entitlement };

export const isAdmin = () => !!profile()?.is_admin;
/** Uygulamanın sahibi: yönetici atar, izin gruplarını ve moderasyon kayıtlarını görür */
export const isOwner = () => !!profile()?.is_owner;
export const isPro = () => entitlement().pro || isAdmin();

/** Bu overlay PRO'ya ayrılmış ve kullanıcı PRO değil mi? */
export function isLocked(id: string) {
  return entitlement().locked.includes(id) && !isPro();
}

export async function loadConfig() {
  if (!cloudEnabled) return null;
  const rows = await api<AppConfig[]>("GET", "app_config?id=eq.1&select=*", { auth: "optional" });
  const c = rows?.[0] ?? null;
  if (c) {
    setConfig(c);
    localStorage.setItem(CONFIG_CACHE, JSON.stringify(c));
  }
  return c;
}

export async function loadProfile() {
  const s = session();
  if (!cloudEnabled || !s) {
    setProfile(null);
    loadPerms();
    loadNotices();
    return null;
  }
  const rows = await api<Profile[]>("GET", `profiles?id=eq.${s.user.id}&select=*`);
  setProfile(rows?.[0] ?? null);
  loadPerms();
  loadNotices();
  return profile();
}

export async function updateProfile(patch: Partial<Pick<Profile, "display_name" | "iracing_id" | "iracing_name" | "pay_email">>) {
  const s = session();
  if (!s) throw new Error("Giriş yapmalısın");
  const rows = await api<Profile[]>("PATCH", `profiles?id=eq.${s.user.id}`, { body: patch, prefer: "return=representation" });
  if (rows?.[0]) setProfile(rows[0]);
}

// ---------------------------------------------------------------------------
// PRO süresi ve abonelik
// ---------------------------------------------------------------------------

export interface ProInfo {
  pro_until: string | null;
  source: string | null;
  /** Abonelik kendini yeniliyor mu */
  renewing: boolean;
  sub: { status: string; plan: string; renews_at: string | null; ends_at: string | null; portal_url: string } | null;
}

const [proInfo, setProInfo] = createSignal<ProInfo | null>(null);
export { proInfo };

export async function loadProInfo() {
  if (!cloudEnabled || !session()) return setProInfo(null);
  try {
    setProInfo((await api<ProInfo>("POST", "rpc/my_pro", { body: {} })) ?? null);
  } catch {
    /* çevrimdışı: son değer kalır */
  }
}

/** PRO'nun bitmesine kaç tam gün kaldı (PRO yoksa ya da süresizse null) */
export function proDaysLeft(): number | null {
  const u = entitlement().proUntil;
  if (!u || isAdmin() || u - Date.now() > 3000 * 86400_000) return null;
  return Math.ceil((u - Date.now()) / 86400_000);
}

/** Bitmesine 15 gün ya da daha az kalmış ve kendini yenilemeyen PRO */
export const proExpiringSoon = () => {
  const d = proDaysLeft();
  return d !== null && d > 0 && d <= 15 && !proInfo()?.renewing;
};

/** Lemon Squeezy ödeme bağlantısına hesabı (kimlik ve e-posta) ekler */
export function checkoutUrl(base: string) {
  try {
    const u = new URL(base);
    const s = session();
    if (s) {
      u.searchParams.set("checkout[email]", s.user.email ?? "");
      u.searchParams.set("checkout[custom][user_id]", s.user.id);
    }
    return u.toString();
  } catch {
    return base;
  }
}

// ---------------------------------------------------------------------------
// Cihaz kaydı: hesabın hangi bilgisayarlarda kullanıldığını sunucu sayar
// ---------------------------------------------------------------------------

export async function registerDevice(version: string) {
  const s = session();
  if (!cloudEnabled || !inTauri || !s) return;
  try {
    const d = await invoke<{ hash: string; label: string }>("device_info");
    await api("POST", "rpc/register_device", { body: { p_hash: d.hash, p_label: d.label, p_version: version } });
  } catch {
    /* sonra yeniden denenir */
  }
}

export interface AdminDeviceRow {
  user_id: string;
  display_name: string;
  email: string;
  pro_until: string | null;
  device_count: number;
  flag_id: string | null;
  devices: { hash: string; label: string; version: string; first_seen: string; last_seen: string }[];
}

export type DeviceFilter = "flagged" | "multi" | "all";
export const adminDevices = (filter: DeviceFilter) => api<AdminDeviceRow[]>("POST", "rpc/admin_devices", { body: { p_filter: filter } });
export const adminRemoveDevice = (user: string, hash: string) => api("POST", "rpc/admin_remove_device", { body: { p_user: user, p_hash: hash } });
export const adminResolveFlag = (flag: string) => api("POST", "rpc/admin_resolve_flag", { body: { p_flag: flag } });

export interface AdminSub {
  lemon_id: string;
  user_id: string | null;
  display_name: string | null;
  email: string;
  status: string;
  plan: string;
  renews_at: string | null;
  ends_at: string | null;
  updated_at: string;
  created_at: string;
  pro_until: string | null;
}
export const adminSubscriptions = () => api<AdminSub[]>("POST", "rpc/admin_subscriptions", { body: {} });

/** Rust tarafındaki (diske yazılan) PRO durumunu oku */
export async function readEntitlement() {
  try {
    const e = inTauri
      ? await invoke<Entitlement>("entitlement_get")
      : await fetch(`${apiBase}/api/entitlement`).then((r) => r.json());
    setEntitlement(e);
  } catch {
    /* eski sürüm / sunucu kapalı */
  }
}

/**
 * Buluttan yapılandırmayı ve profili alıp PRO durumunu günceller. İnternet yoksa
 * son bilinen durum geçerli kalır (PRO süresi bitene kadar).
 */
export async function refreshEntitlement() {
  if (!cloudEnabled || !inTauri) {
    await readEntitlement();
    if (inTauri) syncWatermark(normalizeWatermark(null), "");
    return;
  }
  try {
    if (!session()) setProfile(null);
    const [c, p] = await Promise.all([loadConfig(), session() ? loadProfile() : Promise.resolve(null)]);
    loadProInfo();
    invoke<{ display: string }>("app_version").then((v) => registerDevice(v.display)).catch(() => {});
    if (c) syncWatermark(normalizeWatermark(c.watermark), p?.display_name ?? "");
    const until = p?.is_admin ? Date.now() + 3650 * 86400_000 : p?.pro_until ? new Date(p.pro_until).getTime() : 0;
    const value = { proUntil: until, locked: c?.pro_overlays ?? entitlement().locked };
    setEntitlement(await invoke<Entitlement>("entitlement_set", { value }));
  } catch {
    await readEntitlement();
    // Çevrimdışı: son bilinen filigranı kullan
    const cc = config();
    if (cc && inTauri) syncWatermark(normalizeWatermark(cc.watermark), profile()?.display_name ?? "");
  }
}

let started = false;
/** Uygulama pencerelerinde bir kez çağrılır: başta ve 6 saatte bir yenile, değişiklikleri dinle. */
export function startEntitlement() {
  if (started) return;
  started = true;
  readEntitlement().then(refreshEntitlement);
  setInterval(refreshEntitlement, 6 * 3600_000);
  if (inTauri) {
    import("@tauri-apps/api/event").then(({ listen }) => listen<Entitlement>("entitlement", (e) => setEntitlement(e.payload)));
  } else {
    setInterval(readEntitlement, 60_000);
  }
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  display_name: string;
  email: string;
  iracing_name: string | null;
  pro_until: string | null;
  pro_source: string | null;
  is_admin: boolean;
  is_owner: boolean;
  groups: string[];
  created_at?: string;
  last_seen?: string | null;
  version?: string | null;
}

export async function saveConfig(patch: Partial<AppConfig>) {
  const rows = await api<AppConfig[]>("PATCH", "app_config?id=eq.1", {
    body: { ...patch, updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  if (!rows?.length) throw new Error("Kaydedilemedi (yönetici değil misin?)");
  setConfig(rows[0]);
  localStorage.setItem(CONFIG_CACHE, JSON.stringify(rows[0]));
  await refreshEntitlement();
  syncWatermark(normalizeWatermark(rows[0].watermark), profile()?.display_name ?? "");
}

export function adminFindUsers(q: string) {
  return api<AdminUser[]>("POST", "rpc/admin_find_users", { body: { q } });
}

export function adminSetPro(user: string, until: Date | null) {
  return api("POST", "rpc/admin_set_pro", { body: { p_user: user, p_until: until ? until.toISOString() : null } });
}

export interface StorageUsage {
  bucket: string;
  files: number;
  bytes: number;
}

export function adminStorageUsage() {
  return api<StorageUsage[]>("POST", "rpc/admin_storage_usage", { body: {} });
}

export interface AdminStats {
  users: number;
  users_7d: number;
  pro: number;
  admins: number;
  installs: number;
  active_24h: number;
  active_30d: number;
  online: number;
  racing: number;
}

export function adminStats() {
  return api<AdminStats>("POST", "rpc/admin_stats", { body: {} });
}

export type UserFilter = "all" | "pro" | "admin" | "online";

export function adminUsers(q: string, filter: UserFilter, offset = 0) {
  return api<AdminUser[]>("POST", "rpc/admin_users", { body: { p_q: q, p_filter: filter, p_offset: offset } });
}

// ---------------------------------------------------------------------------
// Kullanım sayacı: her kurulum birkaç dakikada bir "açığım" der (giriş yapmadan da)
// ---------------------------------------------------------------------------

function installId() {
  const K = "pitwall.installId";
  let id = localStorage.getItem(K);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(K, id);
  }
  return id;
}

export function startPing(version: () => string, inRace: () => boolean) {
  if (!cloudEnabled) return;
  const ping = () =>
    api("POST", "rpc/app_ping", { body: { p_install: installId(), p_version: version(), p_in_race: inRace() }, auth: "optional" }).catch(() => {});
  setTimeout(ping, 5000);
  setInterval(ping, 2 * 60_000);
}
