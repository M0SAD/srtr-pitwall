import { lang } from "@/sdk/i18n";
// İsteğe bağlı bulut senkronizasyonu (Supabase).
//
// Uygulama üyeliksiz tamamen çalışır; ayarlar her zaman yerelde (settings.json) tutulur.
// Kullanıcı giriş yaparsa ayarlar ayrıca buluta yedeklenir ve diğer bilgisayarlarla eşitlenir.
// Ek kütüphane yok: Supabase'in REST uç noktaları doğrudan fetch ile çağrılır.
//
// Kurulum: proje kökünde .env dosyası oluştur (bkz. .env.example ve docs/SUPABASE.md)

import { createSignal } from "solid-js";
import { defaultProfileId, newProfile, onSettingsChange, replaceSettings, setSyncedAt, settings, settingsFresh, type AppSettings } from "@/sdk/settings";

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
  setSyncedAt(ts);
}

async function authRequest(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${URL_}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error_description || json.msg || json.message || `Hata ${res.status}`), { status: res.status });
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
  } catch (e) {
    // Ağ hatası ya da sunucu sorunu (internet yok, 5xx, 429): oturumu silme, sonraki istekte yeniden denenir.
    // Sadece sunucu yenileme anahtarını reddederse (400 / 401 / 403) oturum kapanır.
    const st = (e as { status?: number })?.status;
    if (st !== 400 && st !== 401 && st !== 403) return null;
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

/** Bekleyen ayar değişikliğini hemen gönderir (startAutoSync kurar): çıkış yapmadan / pencere kapanmadan önce çağrılır */
let flushPending: () => Promise<void> = async () => {};
export const flushSync = () => flushPending();

export async function signOut() {
  // Son değişiklikler gönderilmeden oturum kapanmasın (eskiden son 1 dakikadaki değişiklikler hesaba hiç gitmiyordu)
  await Promise.race([flushPending().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
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

/** Bu bilgisayarın kimliği (Rust: MachineGuid karması) ve adı; tarayıcıda / hata olursa null */
let device: { hash: string; label: string } | null | undefined;
async function thisDevice() {
  if (device !== undefined) return device;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const d = await invoke<{ hash: string; label: string }>("device_info");
    device = d?.hash ? d : null;
  } catch {
    device = null;
  }
  return device;
}
const setDefaults = (s: AppSettings, def: string | undefined, sdef: string | undefined) => {
  for (const p of Object.values(s.profiles)) {
    const stream = p.rules.mode === "stream";
    const want = stream ? sdef : def;
    if (want && s.profiles[want] && (s.profiles[want].rules.mode === "stream") === stream) p.isDefault = p.id === want;
  }
};
/**
 * Hesaptan gelen ayarları bu bilgisayara uyarlar. Düzen listesi ortaktır; etkin ve varsayılan düzen bilgisayara özeldir:
 *  - Bu bilgisayarın kaydı varsa oradaki etkin / varsayılan düzen geçerli olur.
 *  - Kaydı yoksa ve bu yeni bir kurulumsa (başka bir bilgisayar: monitör / çözünürlük farklı olabilir) eski düzenlere
 *    dokunulmaz, bu bilgisayar için yeni bir varsayılan düzen oluşturulur ve etkin yapılır.
 *  - Kaydı yoksa ama uygulama zaten kuruluysa bu bilgisayardaki etkin / varsayılan seçim korunur.
 * created: yeni düzen oluşturuldu (buluta geri gönderilmeli).
 */
function adaptToDevice(remote: AppSettings, local: AppSettings, dev: { hash: string; label: string } | null, fresh: boolean): { data: AppSettings; created: boolean } {
  if (!dev) return { data: remote, created: false };
  const data = structuredClone(remote);
  const me = data.devices?.[dev.hash];
  if (me) {
    if (me.active && data.profiles[me.active]) data.activeProfile = me.active;
    setDefaults(data, me.def, me.sdef);
    return { data, created: false };
  }
  const others = Object.keys(data.devices ?? {}).length > 0;
  if (fresh && others) {
    let id = `pc-${dev.hash.slice(0, 6)}`;
    while (data.profiles[id]) id += "x";
    const name = `Varsayılan (${(dev.label || "PC").slice(0, 24)})`;
    const p = newProfile(id, name);
    p.order = Math.max(0, ...Object.values(data.profiles).map((x) => x.order ?? 0)) + 1;
    data.profiles[id] = p;
    data.activeProfile = id;
    setDefaults(data, id, undefined);
    return { data, created: true };
  }
  if (!fresh) {
    if (data.profiles[local.activeProfile]) data.activeProfile = local.activeProfile;
    setDefaults(data, defaultProfileId(false, local), defaultProfileId(true, local));
  }
  return { data, created: false };
}

async function push(s0: AppSettings) {
  const uid = session()!.user.id;
  const at = s0.updatedAt || Date.now();
  // Bu bilgisayarın etkin / varsayılan düzeni hesaptaki kayda işlenir (diğer bilgisayarların kayıtları korunur)
  const dev = await thisDevice();
  const s: AppSettings = dev
    ? { ...s0, devices: { ...(s0.devices ?? {}), [dev.hash]: { label: dev.label, active: s0.activeProfile, def: defaultProfileId(false, s0), sdef: defaultProfileId(true, s0), at: Date.now() } } }
    : s0;
  await rest(
    "POST",
    "",
    { user_id: uid, data: s, updated_at: new Date(at).toISOString() },
    { Prefer: "resolution=merge-duplicates,return=minimal" },
  );
  markSynced(at);
}

async function applyRemote(r: { data: AppSettings; at: number }) {
  const fresh = settingsFresh();
  const { data, created } = adaptToDevice(r.data, settings(), await thisDevice(), fresh);
  applyingRemote = true;
  replaceSettings({ ...data, updatedAt: created ? Date.now() : r.at });
  applyingRemote = false;
  markSynced(r.at);
  // Bu bilgisayar için yeni varsayılan düzen oluşturulduysa hesaba da yazılır
  if (created) await push(settings());
}

/** Yerel ve bulut ayarlarını karşılaştırıp eşitler. */
export async function syncNow() {
  if (!cloudEnabled || !session()) return;
  setSyncState("syncing");
  setSyncError("");
  try {
    const local = settings();
    const remote = await fetchRemote();
    // Son eşitleme anı ayar dosyasından okunur. Dosya bu açılışta yoktuysa (yeni kurulum / silinmiş AppData) eldeki ayarlar
    // varsayılandır: tarayıcı deposunda eski bir eşitleme tarihi kalmış olsa bile ilk eşitleme sayılır ve hesaptaki kayıt gelir.
    const fresh = settingsFresh();
    const since = fresh ? 0 : typeof local.syncedAt === "number" ? local.syncedAt : lastSync();
    if (!remote) {
      await push(local);
    } else if (since === 0 && !fresh && local.updatedAt > remote.at) {
      // Bu cihazda hesaba girmeden yapılmış, hesaptakinden yeni ayarlar var: sessizce ezme, kullanıcıya sor
      setConflict({ remote: remote.data, remoteAt: remote.at });
      setSyncState("conflict");
      return;
    } else if (since === 0) {
      // Bu cihazda bu hesapla ilk eşitleme (yeni kurulum, başka bilgisayar ya da yeniden giriş): hesaptaki kayıt geçerlidir.
      // Düzenler ve bütün ayarlar hesaptan gelir; cihazdaki giriş öncesi ayarlar buluttakinin üzerine YAZILMAZ
      // (eskiden cihazdaki ayar daha yeni tarihliyse hesaptaki düzenleri eziyordu). Cihazdaki eski ayarlar yedeklenir.
      try {
        if (local.updatedAt > 0 && !fresh) localStorage.setItem("pitwall.settingsBeforeLogin", JSON.stringify({ at: Date.now(), data: local }));
      } catch {
        /* yer yoksa yedeksiz devam */
      }
      await applyRemote(remote);
    } else if (remote.at > since && local.updatedAt > since && remote.at !== local.updatedAt && since > 0) {
      // Son eşitlemeden beri iki tarafta da değişiklik var: kullanıcıya sor
      setConflict({ remote: remote.data, remoteAt: remote.at });
      setSyncState("conflict");
      return;
    } else if (remote.at > local.updatedAt) {
      await applyRemote(remote);
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
    if (use === "remote") await applyRemote({ data: c.remote, at: c.remoteAt });
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
  // Ayar değişiklikleri hemen değil, toplu gönderilir (her değişiklik ayrı bir istek olmasın): son değişiklikten 8 sn sonra,
  // değişiklikler sürüyorsa en geç 1 dk'da bir. Panel arka plana geçince / gizlenince bekleyen değişiklik hemen gönderilir,
  // böylece başka cihaza geçildiğinde hesap günceldir. (Eskiden her değişiklikten 3 sn sonra gönderiliyordu.)
  const QUIET_MS = 8_000;
  const MAX_WAIT_MS = 60_000;
  let firstPending = 0;
  let inflight: Promise<void> | null = null;
  const flush = async (): Promise<void> => {
    clearTimeout(pushTimer);
    pushTimer = undefined;
    // Süren bir gönderim varsa bitmesi beklenir (pencere kapanırken yarıda kalmasın); arada yeni değişiklik geldiyse o da gönderilir
    if (inflight) await inflight;
    if (!firstPending) return;
    if (applyingRemote || !session() || conflict()) return void (firstPending = 0);
    firstPending = 0;
    inflight = (async () => {
      try {
        setSyncState("syncing");
        await push(settings());
        setSyncState("ok");
      } catch (e) {
        setSyncError(String((e as Error).message ?? e));
        setSyncState("error");
        // Gönderilemedi (ağ / sunucu): değişiklik kaybolmasın, yarım dakika sonra yeniden denenir
        if (!firstPending) firstPending = Date.now();
      }
    })();
    await inflight;
    inflight = null;
    if (firstPending && !pushTimer) pushTimer = window.setTimeout(() => void flush(), syncState() === "error" ? 30_000 : QUIET_MS);
  };
  onSettingsChange(() => {
    if (applyingRemote || !session() || conflict()) return;
    const now = Date.now();
    if (!firstPending) firstPending = now;
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => void flush(), Math.max(1000, Math.min(QUIET_MS, firstPending + MAX_WAIT_MS - now)));
  });
  flushPending = flush;
  // Pencere kapatılırken / uygulamadan çıkılırken bekleyen değişiklik gönderilmeden kapanmasın (webview kapanınca istek yarıda kalıyordu)
  void (async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { listen } = await import("@tauri-apps/api/event");
      const { invoke } = await import("@tauri-apps/api/core");
      const bounded = () => Promise.race([flush().catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
      await getCurrentWindow().onCloseRequested(async () => {
        await bounded();
      });
      await listen("flush-sync", async () => {
        await bounded();
        void invoke("sync_flushed").catch(() => {});
      });
    } catch {
      /* tarayıcı: yok */
    }
  })();
  window.addEventListener("blur", () => void flush());
  document.addEventListener("visibilitychange", () => document.hidden && void flush());
  window.addEventListener("pagehide", () => void flush());
  syncNow();
  // Başka bir cihazda yapılan değişiklikler: panel yeniden öne geldiğinde (en çok 10 dk'da bir) hesaptaki kayıt sorulur.
  // Uygulamayı yeniden başlatmak gerekmez; bekleyen yerel değişiklik varken sorulmaz (önce o gönderilir).
  let pulledAt = Date.now();
  window.addEventListener("focus", () => {
    if (!session() || conflict() || pushTimer || Date.now() - pulledAt < 10 * 60_000) return;
    pulledAt = Date.now();
    void syncNow();
  });
}

/** Hesaptaki ayarların önceki sürümleri (c98): bulut kaydı değişirken eski hali sunucuda saklanır */
export interface SettingsVersion {
  id: number;
  updated_at: string;
  saved_at: string;
  profiles: number;
  overlays: number;
  bytes: number;
}
async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const t = await token();
  if (!t) throw new Error("Oturum süresi doldu, tekrar giriş yap");
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY!, Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Bulut hatası ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
export const settingsHistory = () => rpc<SettingsVersion[]>("settings_history", {});
/** Eski bir sürümü geri yükle: bu bilgisayara uygulanır ve hesaptaki güncel kayıt olur (şimdiki kayıt da geçmişe düşer) */
export async function restoreSettingsVersion(id: number) {
  const data = await rpc<AppSettings | null>("settings_history_get", { p_id: id });
  if (!data) throw new Error("Sürüm bulunamadı");
  applyingRemote = true;
  replaceSettings({ ...data, updatedAt: Date.now() });
  applyingRemote = false;
  await push(settings());
  setSyncState("ok");
}
/** Bu bilgisayarda, hesaptaki kayıt uygulanmadan hemen önce yedeklenen ayarlar (varsa) */
export function localBackup(): { at: number; data: AppSettings } | null {
  try {
    const j = JSON.parse(localStorage.getItem("pitwall.settingsBeforeLogin") || "null");
    return j && typeof j.at === "number" && j.data ? j : null;
  } catch {
    return null;
  }
}
export async function restoreLocalBackup() {
  const b = localBackup();
  if (!b) return;
  applyingRemote = true;
  replaceSettings({ ...b.data, updatedAt: Date.now() });
  applyingRemote = false;
  await push(settings());
  setSyncState("ok");
}
