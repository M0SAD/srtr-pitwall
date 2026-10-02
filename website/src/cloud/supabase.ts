import { lang } from "@/sdk/i18n";
// İsteğe bağlı bulut senkronizasyonu (Supabase).
//
// Uygulama üyeliksiz tamamen çalışır; ayarlar her zaman yerelde (settings.json) tutulur.
// Kullanıcı giriş yaparsa ayarlar ayrıca buluta yedeklenir ve diğer bilgisayarlarla eşitlenir.
// Ek kütüphane yok: Supabase'in REST uç noktaları doğrudan fetch ile çağrılır.
//
// Kurulum: proje kökünde .env dosyası oluştur (bkz. .env.example ve docs/SUPABASE.md)

import { createSignal } from "solid-js";
import { onSettingsChange, replaceSettings, settings, type AppSettings } from "@/sdk/settings";

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = !!URL_ && !!KEY;

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix sn
  user: { id: string; email: string };
}

export type SyncState = "idle" | "syncing" | "ok" | "error" | "conflict";

const SESSION_KEY = "pitwall.session";
const LAST_SYNC_KEY = "pitwall.lastSync";

function loadSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

const [session, setSession] = createSignal<StoredSession | null>(loadSession());
const [syncState, setSyncState] = createSignal<SyncState>("idle");
const [syncError, setSyncError] = createSignal<string>("");
const [lastSync, setLastSync] = createSignal<number>(Number(localStorage.getItem(LAST_SYNC_KEY) || 0));
const [conflict, setConflict] = createSignal<{ remote: AppSettings; remoteAt: number } | null>(null);

export { session, syncState, syncError, lastSync, conflict };

/**
 * Oturumu depodan yeniden oku: başka bir pencere (ana pencere) çıkış yaptıysa / giriş yaptıysa bu
 * penceredeki `session()` de hemen güncellensin (arkadaş listesi, sohbet, bildirimler çıkıştan sonra kalmasın).
 */
export function refreshSession() {
  const stored = loadSession();
  if ((stored?.access_token ?? "") !== (session()?.access_token ?? "")) setSession(stored);
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === SESSION_KEY) refreshSession();
  });
}

function saveSession(s: StoredSession | null) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  setSession(s);
}

function markSynced(ts: number) {
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
  setLastSync(ts);
}

async function authRequest(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.msg || json.message || `Hata ${res.status}`);
  return json;
}

function toSession(j: any): StoredSession {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
    user: { id: j.user.id, email: j.user.email },
  };
}

export async function token(): Promise<string | null> {
  // Başka bir pencere oturumu yenilemiş olabilir: her zaman en güncelini oku
  const stored = loadSession();
  if (stored?.access_token !== session()?.access_token) setSession(stored);
  const s = stored;
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try {
    const j = await authRequest("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
    const ns = toSession(j);
    saveSession(ns);
    return ns.access_token;
  } catch {
    // Diğer pencere aynı anda yenilediyse onun oturumunu kullan
    const again = loadSession();
    if (again && again.refresh_token !== s.refresh_token) {
      setSession(again);
      return again.access_token;
    }
    saveSession(null);
    return null;
  }
}

/**
 * Supabase REST/RPC isteği. auth: "required" oturum ister, "optional" varsa kullanır
 * (herkese açık tablolar giriş yapmadan da okunabilir).
 */
export async function api<T = any>(
  method: string,
  path: string,
  o: { body?: unknown; prefer?: string; auth?: "required" | "optional" } = {},
): Promise<T> {
  if (!cloudEnabled) throw new Error("Bulut bağlantısı yapılandırılmamış");
  const t = await token();
  if (!t && o.auth !== "optional") throw new Error("Bu işlem için giriş yapmalısın");
  const headers: Record<string, string> = { apikey: KEY!, "Content-Type": "application/json" };
  // Yeni "sb_publishable_" anahtarları JWT değildir, Authorization'a konmaz; eski anon anahtarı (eyJ…) konabilir
  const bearer = t ?? (KEY!.startsWith("eyJ") ? KEY : null);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (o.prefer) headers.Prefer = o.prefer;
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  if (!res.ok) {
    let msg = await res.text();
    try {
      const j = JSON.parse(msg);
      msg = j.message || j.hint || msg;
    } catch {
      /* düz metin */
    }
    throw new Error(msg || `Bulut hatası ${res.status}`);
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Supabase Edge Function çağrısı (POST, oturum anahtarıyla). Hata gövdesindeki {error} mesajı fırlatılır. */
export async function callFunction<T = any>(name: string, body: unknown): Promise<T> {
  if (!cloudEnabled) throw new Error("Bulut bağlantısı yapılandırılmamış");
  const t = await token();
  if (!t) throw new Error("Bu işlem için giriş yapmalısın");
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    /* düz metin */
  }
  if (!res.ok) throw new Error(j?.error || j?.message || text || `Bulut hatası ${res.status}`);
  return j as T;
}

// ---------------------------------------------------------------------------
// Görsel barındırma: Supabase Storage (ücretsiz planda 1 GB depolama)
// ---------------------------------------------------------------------------

/** Proje kimliği (https://<ref>.supabase.co) */
export function projectRef(): string {
  return URL_ ? new URL(URL_).hostname.split(".")[0] : "";
}

function objPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Herkese açık kovadaki dosyanın adresi */
export function publicUrl(bucket: string, path: string) {
  return `${URL_}/storage/v1/object/public/${bucket}/${objPath(path)}`;
}

async function storageHeaders(): Promise<Record<string, string>> {
  if (!cloudEnabled) throw new Error("Bulut bağlantısı yapılandırılmamış");
  const t = await token();
  if (!t) throw new Error("Bu işlem için giriş yapmalısın");
  return { apikey: KEY!, Authorization: `Bearer ${t}` };
}

async function storageError(res: Response) {
  let msg = await res.text();
  try {
    const j = JSON.parse(msg);
    msg = j.message || j.error || msg;
  } catch {
    /* düz metin */
  }
  return new Error(msg || `Depolama hatası ${res.status}`);
}

export async function storageUpload(bucket: string, path: string, body: ArrayBuffer | Blob, type: string, upsert = false) {
  const headers = { ...(await storageHeaders()), "Content-Type": type, "x-upsert": upsert ? "true" : "false", "cache-control": "max-age=31536000" };
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}/${objPath(path)}`, { method: "POST", headers, body });
  if (!res.ok) throw await storageError(res);
}

export async function storageRemove(bucket: string, paths: string[]) {
  const headers = { ...(await storageHeaders()), "Content-Type": "application/json" };
  const res = await fetch(`${URL_}/storage/v1/object/${bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: paths }) });
  if (!res.ok) throw await storageError(res);
}

/** Özel kovadaki dosyalar için süreli (imzalı) adresler: yol -> adres */
export async function storageSignedUrls(bucket: string, paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const headers = { ...(await storageHeaders()), "Content-Type": "application/json" };
  const res = await fetch(`${URL_}/storage/v1/object/sign/${bucket}`, { method: "POST", headers, body: JSON.stringify({ expiresIn, paths }) });
  if (!res.ok) throw await storageError(res);
  const rows = (await res.json()) as { path: string | null; signedURL: string | null; error: string | null }[];
  const out: Record<string, string> = {};
  rows.forEach((r, i) => {
    if (r.signedURL) out[r.path ?? paths[i]] = `${URL_}/storage/v1${r.signedURL.startsWith("/") ? "" : "/"}${r.signedURL}`;
  });
  return out;
}

function currentLang(): string {
  return lang();
}

export async function resetPassword(email: string) {
  await authRequest("recover", { email });
}

/** E-postadaki 6 haneli kodla doğrular ("signup": hesap onayı, "recovery": şifre sıfırlama) ve oturum açar. */
export async function verifyCode(email: string, code: string, type: "signup" | "recovery") {
  const j = await authRequest("verify", { type, email, token: code.replace(/\s/g, "") });
  if (!j.access_token) throw new Error("Kod doğrulanamadı");
  saveSession(toSession(j));
}

/** Onay kodunu yeniden gönderir */
export async function resendSignupCode(email: string) {
  await authRequest("resend", { type: "signup", email });
}

/** E-postaların hangi dilde gönderileceği (kullanıcı verisinde "lang") */
export async function setUserLang(lang: string) {
  if (!cloudEnabled) return;
  const t = await token();
  if (!t) return;
  await fetch(`${URL_}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: KEY!, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { lang } }),
  }).catch(() => {});
}

/** Giriş yapmış kullanıcının şifresini değiştirir */
export async function updatePassword(password: string) {
  const t = await token();
  if (!t) throw new Error("Oturum yok");
  const res = await fetch(`${URL_}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: KEY!, Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || json.message || json.error_description || `Hata ${res.status}`);
}

/** Oturum açıldıktan sonra (kodla doğrulama dahil) ayarları eşitle */
export async function afterLogin() {
  await syncNow();
  void setUserLang(currentLang());
}

export async function signIn(email: string, password: string) {
  const j = await authRequest("token?grant_type=password", { email, password });
  saveSession(toSession(j));
  await syncNow();
  void setUserLang(currentLang());
}

/** Kayıt olur. E-posta doğrulaması açıksa oturum hemen açılmaz; true döner. */
export async function signUp(email: string, password: string, displayName = ""): Promise<boolean> {
  const j = await authRequest("signup", { email, password, data: { display_name: displayName.trim(), lang: currentLang() } });
  if (j.access_token) {
    saveSession(toSession(j));
    await syncNow();
    return false;
  }
  return true;
}

export async function signOut() {
  const t = session()?.access_token;
  saveSession(null);
  markSynced(0);
  setSyncState("idle");
  if (t) {
    fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY!, Authorization: `Bearer ${t}` } }).catch(
      () => {},
    );
  }
}

async function rest(method: string, query: string, body?: unknown, extra: Record<string, string> = {}) {
  const t = await token();
  if (!t) throw new Error("Oturum süresi doldu, tekrar giriş yap");
  const res = await fetch(`${URL_}/rest/v1/user_settings${query}`, {
    method,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Bulut hatası ${res.status}: ${await res.text()}`);
  // return=minimal: 201/204 ve boş gövde
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function fetchRemote(): Promise<{ data: AppSettings; at: number } | null> {
  const uid = session()!.user.id;
  const rows = await rest("GET", `?select=data,updated_at&user_id=eq.${uid}`);
  if (!rows?.length) return null;
  return { data: rows[0].data, at: new Date(rows[0].updated_at).getTime() };
}

let applyingRemote = false;

async function push(s: AppSettings) {
  const uid = session()!.user.id;
  const at = s.updatedAt || Date.now();
  await rest(
    "POST",
    "",
    { user_id: uid, data: s, updated_at: new Date(at).toISOString() },
    { Prefer: "resolution=merge-duplicates,return=minimal" },
  );
  markSynced(at);
}

function applyRemote(r: { data: AppSettings; at: number }) {
  applyingRemote = true;
  replaceSettings({ ...r.data, updatedAt: r.at });
  applyingRemote = false;
  markSynced(r.at);
}

/** Yerel ve bulut ayarlarını karşılaştırıp eşitler. */
export async function syncNow() {
  if (!cloudEnabled || !session()) return;
  setSyncState("syncing");
  setSyncError("");
  try {
    const local = settings();
    const remote = await fetchRemote();
    const since = lastSync();
    if (!remote) {
      await push(local);
    } else if (remote.at > since && local.updatedAt > since && remote.at !== local.updatedAt && since > 0) {
      // Son eşitlemeden beri iki tarafta da değişiklik var: kullanıcıya sor
      setConflict({ remote: remote.data, remoteAt: remote.at });
      setSyncState("conflict");
      return;
    } else if (remote.at > local.updatedAt || (since === 0 && local.updatedAt === 0)) {
      applyRemote(remote);
    } else if (local.updatedAt > remote.at) {
      await push(local);
    } else {
      markSynced(remote.at);
    }
    setSyncState("ok");
  } catch (e) {
    setSyncError(String((e as Error).message ?? e));
    setSyncState("error");
  }
}

export async function resolveConflict(use: "local" | "remote") {
  const c = conflict();
  if (!c) return;
  setConflict(null);
  try {
    if (use === "remote") applyRemote({ data: c.remote, at: c.remoteAt });
    else await push(settings());
    setSyncState("ok");
  } catch (e) {
    setSyncError(String((e as Error).message ?? e));
    setSyncState("error");
  }
}

let pushTimer: number | undefined;

/** Kontrol paneli açıkken ayar değişikliklerini birkaç saniye bekleyip buluta gönderir. */
export function startAutoSync() {
  if (!cloudEnabled) return;
  onSettingsChange(() => {
    if (applyingRemote || !session() || conflict()) return;
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(async () => {
      try {
        setSyncState("syncing");
        await push(settings());
        setSyncState("ok");
      } catch (e) {
        setSyncError(String((e as Error).message ?? e));
        setSyncState("error");
      }
    }, 3000);
  });
  syncNow();
}
