//! Sohbete yazma (PRO: `livechat.send`): Twitch / YouTube / Kick hesabıyla kendi kanal(lar)ının sohbetine mesaj gönderir.
//!
//! İki yöntem vardır; ikisi de KİŞİYE özeldir (yönetici ayarı, app_config ve sunucu işlevi kullanılmaz):
//!   1. Tarayıcı girişi (varsayılan, bkz. webchat.rs): program içi tarayıcı penceresinde platformun kendi sayfasında
//!      giriş yapılır; mesaj o sayfanın sohbet kutusundan gönderilir. Geliştirici uygulaması gerekmez.
//!   2. Gelişmiş: kendi API uygulamam (isteğe bağlı). Kullanıcı KENDİ geliştirici uygulamasının Client ID'sini (YouTube /
//!      Kick için Client Secret'ını da) girer; bunlar ve oturum anahtarları `livechat_secrets.json` içinde DPAPI ile
//!      şifreli saklanır (bkz. secrets.rs), arayüze geri gönderilmez.
//!        - Twitch: OAuth "Device Code Flow" (gizli anahtar yok, "Public" istemci), gönderme Helix POST /helix/chat/messages.
//!        - YouTube ve Kick: yetkilendirme kodu + PKCE (S256), tarayıcı dönüşü 127.0.0.1:8767'deki tek seferlik yerel
//!          sunucuya gelir; kod → anahtar değişimi ve yenileme doğrudan sağlayıcıyla yapılır.
//!      Bir platformda API hesabı bağlıysa o platformda API kullanılır; değilse tarayıcı girişi.
//!
//! Olay: "livechat-send" SendStatus

use super::model::{now_ms, ChannelStatus, Platform, State};
use super::{allowed, hub, net, secrets, webchat};
use base64::Engine;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter};

pub const FEATURE: &str = "livechat.send";
/// Tek seferlik yerel dönüş sunucusu
const PORT: u16 = 8767;
/// YouTube için yedek portlar (8767 açılamazsa; Google "Masaüstü uygulaması" istemcisi her loopback portunu kabul eder,
/// ). Kick'te kayıtlı adres birebir aynı olmalı: yedek yok.
const YT_ALT_PORTS: [u16; 2] = [8768, 8769];
/// Google "Masaüstü uygulaması" istemcisi herhangi bir loopback adresini kabul eder
pub const YT_REDIRECT: &str = "http://127.0.0.1:8767/callback";
/// Kick'te uygulamaya birebir aynı adres kayıtlı olmalı
pub const KICK_REDIRECT: &str = "http://localhost:8767/callback";
const TWITCH_SCOPES: &str = "user:read:chat user:write:chat";
const YT_SCOPE: &str = "https://www.googleapis.com/auth/youtube.force-ssl";
const KICK_SCOPES: &str = "user:read channel:read chat:write";
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
struct Token {
    access: String,
    refresh: String,
    /// unix ms (0: bilinmiyor)
    expires_at: u64,
    user_id: String,
    login: String,
    /// Twitch: yenilemede aynı istemci kimliği
    client_id: String,
}

/// Kullanıcının kendi API uygulaması (Gelişmiş yöntem). `secret` arayüze hiç gönderilmez.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
struct Creds {
    client_id: String,
    secret: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApiView {
    /// Client ID gizli değildir (giriş adresinde açıkça görünür)
    pub client_id: String,
    pub has_secret: bool,
    /// API hesabı bağlı
    pub connected: bool,
    pub login: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub connected: bool,
    pub login: String,
    /// "api" | "web" | "" (bağlı değil)
    pub mode: &'static str,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub user_code: String,
    pub verification_uri: String,
    /// unix ms
    pub expires_at: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SendStatus {
    pub allowed: bool,
    pub twitch: AccountView,
    pub youtube: AccountView,
    pub kick: AccountView,
    /// Twitch cihaz kodu (onay bekleniyor)
    pub device: Option<DeviceView>,
    /// Tarayıcıda giriş bekleniyor: "youtube" | "kick"
    pub pending: Option<String>,
    pub error: Option<String>,
    pub yt_redirect: String,
    pub kick_redirect: String,
    /// Bekleyen YouTube / Kick girişinin izin sayfası (tarayıcı açılmadıysa elle açmak / kopyalamak için; gizli değer içermez)
    pub auth_url: Option<String>,
    /// Platform başına son hata ("twitch" | "youtube" | "kick"); başarılı girişte / gönderimde silinir
    pub last_error: HashMap<String, String>,
    /// Destek için arındırılmış tanılama günlüğü (adım adları, HTTP kodları, sağlayıcı hata kodları; anahtar / kod yok)
    pub log: Vec<String>,
    /// Tarayıcı girişi durumu (platform başına)
    pub web: HashMap<String, webchat::WebView>,
    /// Gelişmiş yöntem: kullanıcının kendi API uygulaması (platform başına)
    pub api: HashMap<String, ApiView>,
}

#[derive(Default)]
struct SendState {
    auth_url: Option<String>,
    /// Giriş denemesi sayacı: biten eski deneme yenisinin durumunu ezmesin
    gen: u64,
    last: HashMap<String, String>,
    log: Vec<String>,
    device: Option<DeviceView>,
    device_task: Option<JoinHandle<()>>,
    pending: Option<String>,
    cancel: Option<Arc<AtomicBool>>,
    error: Option<String>,
    /// Önbellek: "tw:<login>" → yayıncı id, "kick:<slug>" → yayıncı id, "yt:<video>" → liveChatId
    ids: HashMap<String, String>,
}

fn state() -> &'static Mutex<SendState> {
    static S: OnceLock<Mutex<SendState>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(SendState::default()))
}

fn key_of(p: Platform) -> &'static str {
    match p {
        Platform::Twitch => "auth.twitch",
        Platform::Youtube => "auth.youtube",
        _ => "auth.kick",
    }
}

fn load(app: &AppHandle, p: Platform) -> Option<Token> {
    secrets::get_json(app, key_of(p)).and_then(|v| serde_json::from_value::<Token>(v).ok()).filter(|t| !t.access.is_empty())
}

fn store(app: &AppHandle, p: Platform, t: Option<&Token>) -> Result<(), String> {
    match t {
        Some(t) => secrets::set_json(app, key_of(p), &serde_json::to_value(t).map_err(|e| e.to_string())?),
        None => secrets::set(app, key_of(p), ""),
    }
}

fn creds_key(p: Platform) -> String {
    format!("api.{}", pkey(p))
}

fn creds(app: &AppHandle, p: Platform) -> Creds {
    secrets::get_json(app, &creds_key(p)).and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

/// API hesabı bağlı mı (webchat: bağlıysa gizli pencere hazırlanmaz)
pub(super) fn has_api(app: &AppHandle, p: Platform) -> bool {
    load(app, p).is_some()
}

pub fn status(app: &AppHandle) -> SendStatus {
    let mut web = HashMap::new();
    let mut api = HashMap::new();
    let mut acc = |p: Platform| {
        let tok = load(app, p);
        let c = creds(app, p);
        let wv = webchat::view(app, p);
        let a = match &tok {
            Some(t) => AccountView { connected: true, login: t.login.clone(), mode: "api" },
            None if webchat::usable(app, p) => AccountView { connected: true, login: wv.login.clone(), mode: "web" },
            None => AccountView::default(),
        };
        api.insert(pkey(p).to_string(), ApiView { has_secret: !c.secret.is_empty(), client_id: c.client_id, connected: tok.is_some(), login: tok.map(|t| t.login).unwrap_or_default() });
        web.insert(pkey(p).to_string(), wv);
        a
    };
    let (twitch, youtube, kick) = (acc(Platform::Twitch), acc(Platform::Youtube), acc(Platform::Kick));
    let g = state().lock();
    SendStatus {
        allowed: allowed(app, FEATURE),
        twitch,
        youtube,
        kick,
        device: g.device.clone(),
        pending: g.pending.clone(),
        error: g.error.clone(),
        yt_redirect: YT_REDIRECT.into(),
        kick_redirect: KICK_REDIRECT.into(),
        auth_url: g.auth_url.clone(),
        last_error: g.last.clone(),
        log: g.log.clone(),
        web,
        api,
    }
}

/// Uzun, anahtar / kod olabilecek dizileri gizler (24+ karakterlik harf-rakam dizisi → "[…]")
fn scrub(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        if run.chars().count() >= 24 {
            out.push_str("[…]");
        } else {
            out.push_str(run);
        }
        run.clear();
    };
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || "_-~+=%".contains(c) {
            run.push(c);
        } else {
            flush(&mut run, &mut out);
            out.push(c);
        }
    }
    flush(&mut run, &mut out);
    out.chars().take(400).collect()
}

/// Tanılama günlüğüne satır ekle (UTC saat + arındırılmış metin; en fazla 80 satır)
pub(super) fn dlog(line: impl AsRef<str>) {
    let secs = now_ms() / 1000 % 86_400;
    let l = format!("{:02}:{:02}:{:02}Z {}", secs / 3600, secs / 60 % 60, secs % 60, scrub(line.as_ref()));
    super::debug_file(&format!("gönderim: {}", scrub(line.as_ref())));
    let mut g = state().lock();
    if g.log.len() >= 80 {
        g.log.remove(0);
    }
    g.log.push(l);
}

pub(super) fn pkey(p: Platform) -> &'static str {
    match p {
        Platform::Twitch => "twitch",
        Platform::Youtube => "youtube",
        _ => "kick",
    }
}

/// Platformun "son hata" satırı (None: temizle)
pub(super) fn set_last(p: Platform, e: Option<&str>) {
    let mut g = state().lock();
    match e {
        Some(e) => g.last.insert(pkey(p).into(), scrub(e)),
        None => g.last.remove(pkey(p)),
    };
}

pub(super) fn emit(app: &AppHandle) {
    let _ = app.emit("livechat-send", status(app));
}

// ---------------------------------------------------------------------------
// HTTP yardımcıları (reqwest'in json özelliği kapalı: gövde elle)
// ---------------------------------------------------------------------------

/// application/x-www-form-urlencoded ve sorgu için yüzde kodlama
pub fn enc(s: &str) -> String {
    let mut o = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{b:02X}"));
        }
    }
    o
}

fn form(pairs: &[(&str, &str)]) -> String {
    pairs.iter().map(|(k, v)| format!("{}={}", enc(k), enc(v))).collect::<Vec<_>>().join("&")
}

/// (durum kodu, JSON gövde; JSON değilse {"raw": metin})
async fn send_req(rb: reqwest::RequestBuilder) -> Result<(u16, Value), String> {
    // reqwest hatasının görünen metni asıl nedeni içermez: kaynak zinciri de eklenir (zaman aşımı, DNS, TLS, bağlantı kesildi…).
    fn chain(e: &reqwest::Error) -> String {
        let kind = if e.is_timeout() { "zaman aşımı" } else if e.is_connect() { "bağlanılamadı" } else if e.is_request() { "istek gönderilemedi" } else if e.is_body() { "gövde okunamadı" } else { "ağ hatası" };
        let mut out = format!("Bağlantı hatası ({kind}): {e}");
        let mut src = std::error::Error::source(e);
        let mut n = 0;
        while let Some(x) = src {
            out.push_str(&format!(" ← {x}"));
            src = x.source();
            n += 1;
            if n >= 5 {
                break;
            }
        }
        out.chars().take(400).collect()
    }
    // Geçici ağ hatasında (bağlantı sıfırlandı, bayat HTTP/2 bağlantısı) bir kez yeniden dene
    let retry = rb.try_clone();
    let r = match rb.send().await {
        Ok(r) => r,
        Err(e) => match retry {
            Some(rb2) if !e.is_builder() => {
                tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                rb2.send().await.map_err(|e2| chain(&e2))?
            }
            _ => return Err(chain(&e)),
        },
    };
    let code = r.status().as_u16();
    let text = r.text().await.unwrap_or_default();
    let v = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({ "raw": text.chars().take(300).collect::<String>() }));
    Ok((code, v))
}

async fn post_form(url: &str, pairs: &[(&str, &str)]) -> Result<(u16, Value), String> {
    let c = net::http()?;
    send_req(c.post(url).header("Content-Type", "application/x-www-form-urlencoded").body(form(pairs))).await
}

async fn get_auth(url: &str, bearer: &str, client_id: Option<&str>) -> Result<(u16, Value), String> {
    let c = net::http()?;
    let mut rb = c.get(url).header("Authorization", format!("Bearer {bearer}")).header("Accept", "application/json");
    if let Some(id) = client_id {
        rb = rb.header("Client-Id", id);
    }
    send_req(rb).await
}

async fn post_json_auth(url: &str, bearer: &str, client_id: Option<&str>, body: &Value) -> Result<(u16, Value), String> {
    let c = net::http()?;
    let mut rb = c
        .post(url)
        .header("Authorization", format!("Bearer {bearer}"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(body.to_string());
    if let Some(id) = client_id {
        rb = rb.header("Client-Id", id);
    }
    send_req(rb).await
}

/// Hata gövdesinden okunur mesaj
fn api_error(v: &Value) -> String {
    for p in ["/message", "/error_description", "/error/message", "/error", "/raw"] {
        if let Some(s) = v.pointer(p).and_then(|x| x.as_str()) {
            if !s.trim().is_empty() {
                return s.trim().chars().take(240).collect();
            }
        }
    }
    "bilinmeyen hata".into()
}

fn token_from(v: &Value, old: Option<&Token>) -> Result<Token, String> {
    let access = v.get("access_token").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if access.is_empty() {
        return Err(api_error(v));
    }
    let refresh = v.get("refresh_token").and_then(|x| x.as_str()).map(String::from).or_else(|| old.map(|o| o.refresh.clone())).unwrap_or_default();
    let exp = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(0);
    let mut t = old.cloned().unwrap_or_default();
    t.access = access;
    t.refresh = refresh;
    t.expires_at = if exp > 0 { now_ms() + exp * 1000 } else { 0 };
    Ok(t)
}

// ---------------------------------------------------------------------------
// YouTube / Kick: anahtar değişimi ve yenileme (doğrudan sağlayıcıyla, kullanıcının kendi uygulaması)
// ---------------------------------------------------------------------------

fn token_url(p: Platform) -> &'static str {
    if p == Platform::Youtube {
        "https://oauth2.googleapis.com/token"
    } else {
        "https://id.kick.com/oauth/token"
    }
}

/// Anahtar uç noktası çağrısı; `extra`: grant'a özel alanlar. Günlüğe yalnız adım adı ve HTTP kodu yazılır.
async fn token_call(p: Platform, c: &Creds, what: &str, extra: &[(&str, &str)]) -> Result<Value, String> {
    let mut pairs: Vec<(&str, &str)> = vec![("client_id", &c.client_id), ("client_secret", &c.secret)];
    pairs.extend_from_slice(extra);
    let (code, v) = post_form(token_url(p), &pairs).await.inspect_err(|e| dlog(format!("{} {what}: ağ hatası: {e}", pkey(p))))?;
    dlog(format!("{} {what}: HTTP {code}{}", pkey(p), if (200..300).contains(&code) { String::new() } else { format!(" · {}", api_error(&v)) }));
    if (200..300).contains(&code) {
        return Ok(v);
    }
    let e = api_error(&v);
    Err(match e.as_str() {
        "invalid_client" => "Client ID / Client Secret sağlayıcı tarafından kabul edilmedi (invalid_client): Gelişmiş bölümündeki değerleri denetle".into(),
        "invalid_grant" => "invalid_grant: kod / oturum geçersiz ya da dönüş adresi uygulamadakiyle aynı değil".into(),
        _ => format!("HTTP {code}: {e}"),
    })
}

// ---------------------------------------------------------------------------
// Geçerli anahtar (gerekirse yenile)
// ---------------------------------------------------------------------------

async fn refresh(app: &AppHandle, p: Platform, t: &Token) -> Result<Token, String> {
    if t.refresh.is_empty() {
        return Err("Oturumun süresi doldu; hesabı yeniden bağla".into());
    }
    let nt = match p {
        Platform::Twitch => {
            let (code, v) = post_form("https://id.twitch.tv/oauth2/token", &[("grant_type", "refresh_token"), ("refresh_token", &t.refresh), ("client_id", &t.client_id)]).await?;
            if code == 400 || code == 401 {
                let _ = store(app, p, None);
                emit(app);
                return Err("Twitch oturumu sona erdi; hesabı yeniden bağla".into());
            }
            token_from(&v, Some(t))?
        }
        _ => {
            let c = creds(app, p);
            if c.client_id.is_empty() || c.secret.is_empty() {
                return Err("Oturumun süresi doldu; yenilemek için Gelişmiş bölümüne kendi Client ID / Client Secret değerlerini gir ya da API bağlantısını kesip tarayıcı girişini kullan".into());
            }
            let v = token_call(p, &c, "yenileme", &[("grant_type", "refresh_token"), ("refresh_token", &t.refresh)]).await.map_err(|e| if e.contains("invalid_grant") { "Oturum geçersiz; hesabı yeniden bağla".to_string() } else { e })?;
            token_from(&v, Some(t))?
        }
    };
    store(app, p, Some(&nt))?;
    Ok(nt)
}

async fn token_for(app: &AppHandle, p: Platform, force: bool) -> Result<Token, String> {
    let t = load(app, p).ok_or_else(|| format!("{} API hesabı bağlı değil (Canlı Sohbet › Sohbete yaz › Gelişmiş)", p.name()))?;
    if force || (t.expires_at > 0 && t.expires_at < now_ms() + 60_000) {
        return refresh(app, p, &t).await;
    }
    Ok(t)
}

// ---------------------------------------------------------------------------
// Twitch: Device Code Flow
// ---------------------------------------------------------------------------

async fn twitch_user(access: &str, client_id: &str) -> Result<(String, String), String> {
    let (code, v) = get_auth("https://api.twitch.tv/helix/users", access, Some(client_id)).await?;
    if code != 200 {
        return Err(api_error(&v));
    }
    let id = net::json_str(v.pointer("/data/0/id"));
    let login = net::json_str(v.pointer("/data/0/login"));
    if id.is_empty() {
        return Err("Twitch kullanıcısı okunamadı".into());
    }
    Ok((id, login))
}

async fn device_poll(app: AppHandle, client_id: String, device_code: String, mut interval: u64, expires_at: u64) {
    let result: Result<Token, String> = async {
        loop {
            tokio::time::sleep(Duration::from_secs(interval.max(1))).await;
            if now_ms() > expires_at {
                return Err("Kodun süresi doldu, yeniden dene".into());
            }
            let (code, v) = post_form(
                "https://id.twitch.tv/oauth2/token",
                &[("client_id", &client_id), ("scopes", TWITCH_SCOPES), ("device_code", &device_code), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code")],
            )
            .await?;
            if code == 200 {
                let mut t = token_from(&v, None)?;
                let (id, login) = twitch_user(&t.access, &client_id).await?;
                t.user_id = id;
                t.login = login;
                t.client_id = client_id.clone();
                return Ok(t);
            }
            let msg = api_error(&v);
            match msg.as_str() {
                "authorization_pending" => continue,
                "slow_down" => interval += 2,
                m if m.contains("invalid device code") || m.contains("expired") => return Err("Kodun süresi doldu, yeniden dene".into()),
                m if m.contains("denied") => return Err("Twitch'te izin verilmedi".into()),
                m => return Err(m.to_string()),
            }
        }
    }
    .await;
    {
        let mut g = state().lock();
        g.device = None;
        g.device_task = None;
        g.error = result.as_ref().err().cloned();
    }
    let result = result.and_then(|t| store(&app, Platform::Twitch, Some(&t)));
    match &result {
        Ok(()) => dlog("twitch: bağlandı"),
        Err(e) => {
            dlog(format!("twitch: giriş başarısız: {e}"));
            state().lock().error = Some(e.clone());
        }
    }
    set_last(Platform::Twitch, result.as_ref().err().map(|e| e.as_str()));
    emit(&app);
}

/// Twitch girişini başlat: kodu döner, onay arka planda beklenir ("livechat-send" olayı)
#[tauri::command]
pub async fn livechat_twitch_login(app: AppHandle) -> Result<SendStatus, String> {
    if !allowed(&app, FEATURE) {
        return Err("Sohbete yazma PRO üyelere özel".into());
    }
    let client_id = creds(&app, Platform::Twitch).client_id;
    if client_id.is_empty() {
        return Err("Önce Gelişmiş bölümüne kendi Twitch uygulamanın Client ID'sini girip kaydet".into());
    }
    cancel_all();
    let r = post_form("https://id.twitch.tv/oauth2/device", &[("client_id", &client_id), ("scopes", TWITCH_SCOPES)]).await;
    let fail = |e: String| {
        dlog(format!("twitch: cihaz kodu alınamadı: {e}"));
        set_last(Platform::Twitch, Some(&e));
        state().lock().error = Some(e.clone());
        emit(&app);
        e
    };
    let (code, v) = r.map_err(fail)?;
    dlog(format!("twitch: cihaz kodu isteği HTTP {code}"));
    if code != 200 {
        return Err(fail(format!("Twitch HTTP {code}: {}. Twitch uygulamasında Client Type “Public” olmalı", api_error(&v))));
    }
    let device_code = net::json_str(v.get("device_code"));
    let user_code = net::json_str(v.get("user_code"));
    let uri = net::json_str(v.get("verification_uri"));
    let interval = v.get("interval").and_then(|x| x.as_u64()).unwrap_or(5);
    let expires_at = now_ms() + v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(1800) * 1000;
    if device_code.is_empty() || uri.is_empty() {
        return Err("Twitch beklenmeyen yanıt verdi".into());
    }
    let _ = crate::open_url(uri.clone());
    let task = tauri::async_runtime::spawn(device_poll(app.clone(), client_id, device_code, interval, expires_at));
    {
        let mut g = state().lock();
        g.device = Some(DeviceView { user_code, verification_uri: uri, expires_at });
        g.device_task = Some(task);
        g.error = None;
    }
    emit(&app);
    Ok(status(&app))
}

// ---------------------------------------------------------------------------
// YouTube / Kick: PKCE + yerel dönüş sunucusu
// ---------------------------------------------------------------------------

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => {
                let h = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|x| u8::from_str_radix(x, 16).ok());
                match h {
                    Some(v) => {
                        out.push(v);
                        i += 2;
                    }
                    None => out.push(b'%'),
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        (pct_decode(k) == key).then(|| pct_decode(v))
    })
}

const DONE_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>SRTR Pitwall</title></head><body style="background:#0f1115;color:#eef1f6;font:16px Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#ff8a2a">SRTR Pitwall</h2><p>Giriş tamamlandı, bu sekmeyi kapatabilirsin.</p><p style="color:#8a93a3">Signed in, you can close this tab.</p></div></body></html>"#;
const FAIL_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>SRTR Pitwall</title></head><body style="background:#0f1115;color:#eef1f6;font:16px Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#ff5a5a">SRTR Pitwall</h2><p>Giriş tamamlanamadı. Programa dönüp yeniden dene.</p><p style="color:#8a93a3">Sign-in failed, please try again in the app.</p></div></body></html>"#;

/// Yerel dönüş sunucuları: 127.0.0.1:<port> (zorunlu) ve [::1]:<port> (varsa). Kick dönüşü `localhost` adresine gelir;
/// tarayıcı `localhost`u önce IPv6'ya (::1) çözebildiği için iki adres de dinlenir. Port az önce bırakıldıysa
/// (iptal edilen önceki giriş) kısa süre yeniden denenir.
fn bind_loopback(port: u16, tries: u32) -> Result<Vec<tiny_http::Server>, String> {
    let mut last = String::new();
    for i in 0..tries.max(1) {
        if i > 0 {
            std::thread::sleep(Duration::from_millis(300));
        }
        match tiny_http::Server::http(format!("127.0.0.1:{port}")) {
            Ok(s) => {
                let mut v = vec![s];
                if let Ok(s6) = tiny_http::Server::http(format!("[::1]:{port}")) {
                    v.push(s6);
                }
                return Ok(v);
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(format!(
        "Yerel giriş adresi (127.0.0.1:{port}) açılamadı: {last}. Başka bir program bu portu kullanıyor (ör. açık kalmış başka bir sohbet programı) ya da Windows portu ayırmış olabilir (yönetici komut satırında: netsh interface ipv4 show excludedportrange protocol=tcp)"
    ))
}

/// Girişten önce yerel sunucuyu aç: (sunucular, port). YouTube'da 8767 açılamazsa yedek portlar denenir.
fn bind_for(p: Platform) -> Result<(Vec<tiny_http::Server>, u16), String> {
    match bind_loopback(PORT, 8) {
        Ok(v) => Ok((v, PORT)),
        Err(e) => {
            if p == Platform::Youtube {
                for alt in YT_ALT_PORTS {
                    if let Ok(v) = bind_loopback(alt, 1) {
                        return Ok((v, alt));
                    }
                }
            }
            Err(e)
        }
    }
}

/// Tarayıcının dönüşünü bekle (en fazla 5 dk); yetkilendirme kodunu döner
fn wait_code(servers: Vec<tiny_http::Server>, expect_state: &str, cancel: &AtomicBool) -> Result<String, String> {
    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    let wait = Duration::from_millis(if servers.len() > 1 { 150 } else { 300 });
    let mut turn = 0usize;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Giriş iptal edildi".into());
        }
        if std::time::Instant::now() > deadline {
            return Err("Giriş 5 dakika içinde tamamlanmadı: tarayıcıdan programa dönüş gelmedi (tarayıcı bir hata sayfası gösterdiyse sebep orada yazar; çoğunlukla sağlayıcıdaki uygulamada dönüş adresi / Client ID / izin ayarı)".into());
        }
        turn += 1;
        let req = match servers[turn % servers.len()].recv_timeout(wait) {
            Ok(Some(r)) => r,
            Ok(None) => continue,
            Err(e) => return Err(format!("Yerel giriş sunucusu hatası: {e}")),
        };
        let url = req.url().to_string();
        if !url.starts_with("/callback") {
            let _ = req.respond(tiny_http::Response::from_string("").with_status_code(404));
            continue;
        }
        let html_header = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).ok();
        let respond = |req: tiny_http::Request, ok: bool| {
            let mut r = tiny_http::Response::from_string(if ok { DONE_HTML } else { FAIL_HTML });
            if let Some(h) = html_header.clone() {
                r = r.with_header(h);
            }
            let _ = req.respond(r);
        };
        let st = query_param(&url, "state");
        let err = query_param(&url, "error").filter(|e| !e.is_empty());
        // Sağlayıcı hata dönüşünde `state` göndermeyebilir: hata yine de gösterilir (sessizce beklenmez).
        // Kod ise yalnızca bu girişin `state` değeriyle kabul edilir.
        if st.as_deref() != Some(expect_state) && !(st.is_none() && err.is_some()) {
            dlog(format!("dönüş: yok sayıldı (state {})", if st.is_some() { "uyuşmuyor: eski / başka bir giriş" } else { "yok" }));
            respond(req, false);
            continue;
        }
        if let Some(e) = err {
            respond(req, false);
            let d = query_param(&url, "error_description").unwrap_or_default();
            dlog(format!("dönüş: error={e} {d}"));
            return Err(if e == "access_denied" {
                "İzin verilmedi (izin ekranında reddedildi ya da hesap bu uygulama için yetkili değil; Google'da uygulama test aşamasındaysa hesap “Test users” listesinde olmalı)".into()
            } else {
                format!("Sağlayıcı girişi reddetti: {e} {d}").trim().to_string()
            });
        }
        match query_param(&url, "code") {
            Some(c) if !c.is_empty() => {
                respond(req, true);
                dlog("dönüş: yetkilendirme kodu alındı");
                return Ok(c);
            }
            _ => {
                dlog("dönüş: kod yok");
                respond(req, false)
            }
        }
    }
}

async fn yt_user(access: &str) -> Result<(String, String), String> {
    let (code, v) = get_auth("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", access, None).await?;
    dlog(format!("youtube: kanal bilgisi HTTP {code}{}", if code == 200 { String::new() } else { format!(" · {}", net::json_str(v.pointer("/error/errors/0/reason"))) }));
    if code != 200 {
        return Err(format!("YouTube kanal bilgisi okunamadı (HTTP {code}): {}", yt_error(&v)));
    }
    let id = net::json_str(v.pointer("/items/0/id"));
    if id.is_empty() {
        return Err("Bu Google hesabının YouTube kanalı yok (izin ekranında kanalı olan hesabı / marka hesabını seç)".into());
    }
    Ok((id, net::json_str(v.pointer("/items/0/snippet/title"))))
}

async fn kick_user(access: &str) -> Result<(String, String), String> {
    let (code, v) = get_auth("https://api.kick.com/public/v1/users", access, None).await?;
    dlog(format!("kick: hesap bilgisi HTTP {code}"));
    if code != 200 {
        return Err(format!("Kick hesap bilgisi okunamadı (HTTP {code}): {}. Kick uygulamasında user:read izni açık olmalı", api_error(&v)));
    }
    let id = net::json_str(v.pointer("/data/0/user_id"));
    if id.is_empty() {
        return Err("Kick hesap bilgisi boş döndü (user:read izni verilmemiş olabilir)".into());
    }
    Ok((id, net::json_str(v.pointer("/data/0/name"))))
}

/// YouTube / Kick girişi: tarayıcıda izin → kod → edge function ile anahtar → kullanıcı bilgisi
#[tauri::command]
pub async fn livechat_oauth_login(app: AppHandle, provider: String) -> Result<SendStatus, String> {
    let p = match provider.as_str() {
        "youtube" => Platform::Youtube,
        "kick" => Platform::Kick,
        _ => return Err("Bilinmeyen platform".into()),
    };
    let cr = creds(&app, p);
    let client_id = cr.client_id.clone();
    // Ön koşullar: hata hem döner hem "son hata" / günlükte kalır
    let pre = if !allowed(&app, FEATURE) {
        Some("Sohbete yazma PRO üyelere özel".to_string())
    } else if client_id.is_empty() || cr.secret.is_empty() {
        Some(format!("Önce Gelişmiş bölümüne kendi {} uygulamanın Client ID ve Client Secret değerlerini girip kaydet", p.name()))
    } else {
        None
    };
    if let Some(e) = pre {
        dlog(format!("{provider}: giriş başlatılamadı: {e}"));
        set_last(p, Some(&e));
        emit(&app);
        return Err(e);
    }
    cancel_all();
    let verifier = secrets::random_token(48);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let st = secrets::random_token(18);
    let cancel = Arc::new(AtomicBool::new(false));
    let my_gen = {
        let mut g = state().lock();
        g.gen += 1;
        g.pending = Some(provider.clone());
        g.cancel = Some(cancel.clone());
        g.auth_url = None;
        g.error = None;
        g.gen
    };
    dlog(format!("{provider}: giriş başladı (Client ID {} karakter)", client_id.chars().count()));
    emit(&app);
    let result: Result<Token, String> = async {
        // Yerel sunucu tarayıcı açılmadan ÖNCE dinlemeye başlar; açılamazsa tarayıcı hiç açılmaz
        let (servers, port) = tauri::async_runtime::spawn_blocking(move || bind_for(p)).await.map_err(|e| e.to_string())?.inspect_err(|e| dlog(format!("yerel sunucu: {e}")))?;
        let redirect = if p == Platform::Youtube { format!("http://127.0.0.1:{port}/callback") } else { KICK_REDIRECT.to_string() };
        dlog(format!("yerel sunucu: açık ({}), dönüş adresi {redirect}", if servers.len() > 1 { "IPv4 + IPv6" } else { "yalnız IPv4" }));
        let url = if p == Platform::Youtube {
            format!(
                "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
                enc(&client_id),
                enc(&redirect),
                enc(YT_SCOPE),
                challenge,
                st
            )
        } else {
            format!(
                "https://id.kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
                enc(&client_id),
                enc(&redirect),
                enc(KICK_SCOPES),
                challenge,
                st
            )
        };
        let st2 = st.clone();
        let c2 = cancel.clone();
        let waiter = tauri::async_runtime::spawn_blocking(move || wait_code(servers, &st2, &c2));
        state().lock().auth_url = Some(url.clone());
        // Tarayıcı açılamazsa giriş iptal edilmez: arayüzdeki "Sayfayı yeniden aç" / "Bağlantıyı kopyala" ile sürdürülebilir
        match crate::open_url(url) {
            Ok(()) => dlog("tarayıcı: izin sayfası açıldı"),
            Err(e) => {
                dlog(format!("tarayıcı: açılamadı: {e}"));
                state().lock().error = Some(format!("Tarayıcı kendiliğinden açılamadı ({e}): aşağıdaki “Bağlantıyı kopyala” ile izin sayfasını tarayıcına yapıştır"));
            }
        }
        emit(&app);
        let code = waiter.await.map_err(|e| e.to_string())?.inspect_err(|e| dlog(format!("dönüş bekleme: {e}")))?;
        let v = token_call(p, &cr, "anahtar değişimi", &[("grant_type", "authorization_code"), ("code", &code), ("code_verifier", &verifier), ("redirect_uri", &redirect)])
            .await
            .map_err(|e| format!("{} anahtar değişimi başarısız: {e}", p.name()))?;
        let mut t = token_from(&v, None).map_err(|e| format!("{} anahtar yanıtı geçersiz: {e}", p.name()))?;
        if p == Platform::Youtube && t.refresh.is_empty() {
            dlog("youtube: yanıtta yenileme anahtarı yok (oturum ~1 saat sonra yeniden bağlanma ister)");
        }
        let (id, login) = if p == Platform::Youtube { yt_user(&t.access).await? } else { kick_user(&t.access).await? };
        t.user_id = id;
        t.login = login;
        Ok(t)
    }
    .await;
    let r = result.and_then(|t| store(&app, p, Some(&t)));
    let cancelled = cancel.load(Ordering::Relaxed);
    {
        let mut g = state().lock();
        // Bu sırada yeni bir giriş başladıysa onun durumuna dokunma
        if g.gen == my_gen {
            g.pending = None;
            g.cancel = None;
            g.auth_url = None;
            g.error = if cancelled { None } else { r.as_ref().err().cloned() };
        }
    }
    match &r {
        Ok(()) => {
            dlog(format!("{provider}: bağlandı"));
            set_last(p, None);
        }
        Err(e) => {
            dlog(format!("{provider}: giriş başarısız: {e}"));
            if !cancelled {
                set_last(p, Some(e));
            }
        }
    }
    emit(&app);
    r.map(|_| status(&app))
}

/// Bekleyen YouTube / Kick girişinin izin sayfasını yeniden aç
#[tauri::command]
pub fn livechat_auth_reopen() -> Result<(), String> {
    let url = state().lock().auth_url.clone().ok_or("Bekleyen giriş yok")?;
    crate::open_url(url).inspect_err(|e| dlog(format!("tarayıcı: yeniden açılamadı: {e}")))
}

fn cancel_all() {
    let mut g = state().lock();
    if let Some(c) = g.cancel.take() {
        c.store(true, Ordering::Relaxed);
    }
    if let Some(t) = g.device_task.take() {
        t.abort();
    }
    g.device = None;
    g.pending = None;
    g.auth_url = None;
}

#[tauri::command]
pub fn livechat_auth_cancel(app: AppHandle) -> SendStatus {
    cancel_all();
    state().lock().error = None;
    emit(&app);
    status(&app)
}

#[tauri::command]
pub async fn livechat_auth_logout(app: AppHandle, platform: String) -> Result<SendStatus, String> {
    let p = Platform::parse(&platform).filter(|p| matches!(p, Platform::Twitch | Platform::Youtube | Platform::Kick)).ok_or("Bilinmeyen platform")?;
    if let Some(t) = load(&app, p) {
        // Sağlayıcıda da geçersiz kıl (başarısız olsa da yerel kayıt silinir)
        match p {
            Platform::Twitch => {
                let _ = post_form("https://id.twitch.tv/oauth2/revoke", &[("client_id", &t.client_id), ("token", &t.access)]).await;
            }
            Platform::Youtube => {
                let _ = post_form("https://oauth2.googleapis.com/revoke", &[("token", if t.refresh.is_empty() { &t.access } else { &t.refresh })]).await;
            }
            _ => {}
        }
    }
    store(&app, p, None)?;
    state().lock().ids.clear();
    emit(&app);
    Ok(status(&app))
}

#[tauri::command]
pub fn livechat_send_status(app: AppHandle) -> SendStatus {
    status(&app)
}

// ---------------------------------------------------------------------------
// Bağlantıyı test et
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestStep {
    pub name: String,
    /// "ok" | "fail" | "warn" | "skip"
    pub state: &'static str,
    pub detail: String,
}

pub(super) fn step(name: &str, state: &'static str, detail: impl Into<String>) -> TestStep {
    TestStep { name: name.into(), state, detail: detail.into() }
}

/// Kapsam listesinde (boşluk / virgülle ayrılmış metin ya da dizi) eksik olanlar
fn missing_scopes(have: &Value, need: &str) -> Vec<String> {
    let have: Vec<String> = match have {
        Value::Array(a) => a.iter().filter_map(|x| x.as_str()).map(String::from).collect(),
        Value::String(s) => s.split([' ', ',']).filter(|x| !x.is_empty()).map(String::from).collect(),
        _ => Vec::new(),
    };
    need.split(' ').filter(|n| !have.iter().any(|h| h == n)).map(String::from).collect()
}

/// Bağlı API hesabının anahtarını sağlayıcıda dene (gerekirse yeniler). Anahtarın kendisi hiçbir zaman döndürülmez.
async fn test_account(app: &AppHandle, p: Platform) -> Vec<TestStep> {
    const NAME: &str = "API hesap oturumu";
    let mut out = Vec::new();
    let t = match token_for(app, p, false).await {
        Ok(t) => t,
        Err(e) => {
            out.push(step(NAME, "fail", format!("Anahtar yenilenemedi: {e}")));
            return out;
        }
    };
    match p {
        Platform::Twitch => match get_auth("https://id.twitch.tv/oauth2/validate", &t.access, None).await {
            Ok((200, v)) => {
                let miss = missing_scopes(v.get("scopes").unwrap_or(&Value::Null), TWITCH_SCOPES);
                if miss.is_empty() {
                    out.push(step(NAME, "ok", format!("Geçerli (HTTP 200), hesap: {}", net::json_str(v.get("login")))));
                } else {
                    out.push(step(NAME, "fail", format!("Anahtar geçerli ama izin eksik: {}. Bağlantıyı kesip yeniden bağla", miss.join(", "))));
                }
            }
            Ok((code, v)) => out.push(step(NAME, "fail", format!("Twitch HTTP {code}: {}. Bağlantıyı kesip yeniden bağla", api_error(&v)))),
            Err(e) => out.push(step(NAME, "fail", e)),
        },
        Platform::Youtube => match get_auth("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", &t.access, None).await {
            Ok((200, v)) => {
                let title = net::json_str(v.pointer("/items/0/snippet/title"));
                if net::json_str(v.pointer("/items/0/id")).is_empty() {
                    out.push(step(NAME, "fail", "Anahtar geçerli (HTTP 200) ama bu Google hesabının YouTube kanalı yok"));
                } else {
                    out.push(step(NAME, "ok", format!("Geçerli (HTTP 200), kanal: {title}")));
                }
            }
            Ok((code, v)) => out.push(step(NAME, "fail", format!("YouTube HTTP {code}: {}", yt_error(&v)))),
            Err(e) => out.push(step(NAME, "fail", e)),
        },
        _ => {
            match get_auth("https://api.kick.com/public/v1/users", &t.access, None).await {
                Ok((200, v)) => out.push(step(NAME, "ok", format!("Geçerli (HTTP 200), hesap: {}", net::json_str(v.pointer("/data/0/name"))))),
                Ok((code, v)) => out.push(step(NAME, "fail", format!("Kick HTTP {code}: {}", api_error(&v)))),
                Err(e) => out.push(step(NAME, "fail", e)),
            }
            // İzinler (uç yoksa / yanıt beklenmedikse sessizce atlanır)
            if let Ok(c) = net::http() {
                if let Ok((200, v)) = send_req(c.post("https://id.kick.com/oauth/token/introspect").header("Authorization", format!("Bearer {}", t.access)).header("Accept", "application/json")).await {
                    if let Some(sc) = v.pointer("/data/scope").or_else(|| v.get("scope")).filter(|x| x.as_str().is_some_and(|s| !s.is_empty())) {
                        let miss = missing_scopes(sc, KICK_SCOPES);
                        if miss.is_empty() {
                            out.push(step("İzinler", "ok", KICK_SCOPES));
                        } else {
                            out.push(step("İzinler", "fail", format!("Eksik izin: {}. Kick uygulamasında bu kapsamları aç, sonra bağlantıyı kesip yeniden bağla", miss.join(", "))));
                        }
                    }
                }
            }
        }
    }
    out
}

/// "Bağlantıyı test et": platformun kullanılan yöntemini (API hesabı bağlıysa API, değilse tarayıcı girişi) adım adım
/// dener. Hiçbir adım anahtar / gizli değer döndürmez. Mesaj göndermez.
#[tauri::command]
pub async fn livechat_auth_test(app: AppHandle, platform: String) -> Result<Vec<TestStep>, String> {
    let p = Platform::parse(&platform).filter(|p| matches!(p, Platform::Twitch | Platform::Youtube | Platform::Kick)).ok_or("Bilinmeyen platform")?;
    let mut out = Vec::new();
    out.push(if allowed(&app, FEATURE) { step("PRO izni", "ok", "Sohbete yazma bu hesapta açık") } else { step("PRO izni", "fail", "Sohbete yazma PRO üyelere özel") });
    if has_api(&app, p) {
        out.push(step("Yöntem", "ok", "Gelişmiş: kendi API uygulamam"));
        let c = creds(&app, p);
        if p != Platform::Twitch && (c.client_id.is_empty() || c.secret.is_empty()) {
            out.push(step("Uygulama bilgileri", "warn", "Client ID / Client Secret kayıtlı değil: oturum süresi dolunca yenilenemez"));
        }
        out.extend(test_account(&app, p).await);
    } else {
        out.push(step("Yöntem", "ok", "Tarayıcı girişi"));
        out.extend(webchat::test(&app, p).await);
    }
    for s in &out {
        dlog(format!("test {}: [{}] {}: {}", pkey(p), s.state, s.name, s.detail));
    }
    emit(&app);
    Ok(out)
}

/// Gelişmiş yöntem: kullanıcının kendi uygulama bilgilerini kaydet. Client ID boşsa kayıt silinir; Client Secret boş
/// bırakılırsa kayıtlı olan korunur. Değerler şifreli saklanır, günlüğe yazılmaz.
#[tauri::command]
pub fn livechat_api_creds_set(app: AppHandle, platform: String, client_id: String, client_secret: String) -> Result<SendStatus, String> {
    let p = Platform::parse(&platform).filter(|p| matches!(p, Platform::Twitch | Platform::Youtube | Platform::Kick)).ok_or("Bilinmeyen platform")?;
    let client_id = client_id.trim().to_string();
    let secret = client_secret.trim().to_string();
    if client_id.is_empty() {
        secrets::set(&app, &creds_key(p), "")?;
        dlog(format!("{}: API uygulama bilgileri silindi", pkey(p)));
    } else {
        let old = creds(&app, p);
        let c = Creds { secret: if secret.is_empty() && old.client_id == client_id { old.secret } else { secret }, client_id };
        secrets::set_json(&app, &creds_key(p), &serde_json::to_value(&c).map_err(|e| e.to_string())?)?;
        dlog(format!("{}: API uygulama bilgileri kaydedildi (Client ID {} karakter, Client Secret {})", pkey(p), c.client_id.chars().count(), if c.secret.is_empty() { "yok" } else { "var" }));
    }
    emit(&app);
    Ok(status(&app))
}

// ---------------------------------------------------------------------------
// Gönderme
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    pub key: String,
    pub platform: Platform,
    pub label: String,
    pub ok: bool,
    pub error: Option<String>,
}

enum SendErr {
    Unauthorized,
    Other(String),
}

impl From<String> for SendErr {
    fn from(s: String) -> SendErr {
        SendErr::Other(s)
    }
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn cached(k: &str) -> Option<String> {
    state().lock().ids.get(k).cloned()
}

fn cache(k: String, v: String) {
    let mut g = state().lock();
    if g.ids.len() > 200 {
        g.ids.clear();
    }
    g.ids.insert(k, v);
}

async fn twitch_send(t: &Token, channel: &str, text: &str) -> Result<(), SendErr> {
    let ck = format!("tw:{}", channel.to_lowercase());
    let bid = match cached(&ck) {
        Some(b) => b,
        None => {
            let (code, v) = get_auth(&format!("https://api.twitch.tv/helix/users?login={}", enc(&channel.to_lowercase())), &t.access, Some(&t.client_id)).await?;
            if code == 401 {
                return Err(SendErr::Unauthorized);
            }
            let id = net::json_str(v.pointer("/data/0/id"));
            if id.is_empty() {
                return Err(SendErr::Other(format!("Twitch kanalı bulunamadı: {channel}")));
            }
            cache(ck, id.clone());
            id
        }
    };
    let body = json!({ "broadcaster_id": bid, "sender_id": t.user_id, "message": truncate(text, 500) });
    let (code, v) = post_json_auth("https://api.twitch.tv/helix/chat/messages", &t.access, Some(&t.client_id), &body).await?;
    if code == 401 {
        return Err(SendErr::Unauthorized);
    }
    if !(200..300).contains(&code) {
        return Err(SendErr::Other(api_error(&v)));
    }
    if v.pointer("/data/0/is_sent").and_then(|x| x.as_bool()) == Some(false) {
        let why = net::json_str(v.pointer("/data/0/drop_reason/message"));
        return Err(SendErr::Other(if why.is_empty() { "Twitch mesajı göndermedi".into() } else { why }));
    }
    Ok(())
}

fn yt_error(v: &Value) -> String {
    let reason = net::json_str(v.pointer("/error/errors/0/reason"));
    match reason.as_str() {
        "quotaExceeded" | "dailyLimitExceeded" | "rateLimitExceeded" => "YouTube günlük mesaj kotası doldu".into(),
        "liveChatEnded" => "YouTube canlı sohbeti kapandı".into(),
        "liveChatNotFound" | "liveChatDisabled" => "Bu yayında canlı sohbet yok / kapalı".into(),
        "forbidden" | "insufficientPermissions" => "Bu hesabın bu sohbete yazma izni yok".into(),
        "accessNotConfigured" | "SERVICE_DISABLED" => format!("YouTube Data API v3 Google Cloud projesinde etkin değil: {}", api_error(v)),
        _ => api_error(v),
    }
}

async fn youtube_send(t: &Token, video: &str, text: &str) -> Result<(), SendErr> {
    let ck = format!("yt:{video}");
    let chat_id = match cached(&ck) {
        Some(c) => c,
        None => {
            let (code, v) = get_auth(&format!("https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}", enc(video)), &t.access, None).await?;
            if code == 401 {
                return Err(SendErr::Unauthorized);
            }
            if code != 200 {
                return Err(SendErr::Other(yt_error(&v)));
            }
            let id = net::json_str(v.pointer("/items/0/liveStreamingDetails/activeLiveChatId"));
            if id.is_empty() {
                return Err(SendErr::Other("YouTube yayınında etkin canlı sohbet yok".into()));
            }
            cache(ck, id.clone());
            id
        }
    };
    let body = json!({ "snippet": { "liveChatId": chat_id, "type": "textMessageEvent", "textMessageDetails": { "messageText": truncate(text, 200) } } });
    let (code, v) = post_json_auth("https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet", &t.access, None, &body).await?;
    if code == 401 {
        return Err(SendErr::Unauthorized);
    }
    if !(200..300).contains(&code) {
        return Err(SendErr::Other(yt_error(&v)));
    }
    Ok(())
}

async fn kick_send(t: &Token, slug: &str, text: &str) -> Result<(), SendErr> {
    let ck = format!("kick:{}", slug.to_lowercase());
    let bid = match cached(&ck) {
        Some(b) => b,
        None => {
            let (code, v) = get_auth(&format!("https://api.kick.com/public/v1/channels?slug={}", enc(&slug.to_lowercase())), &t.access, None).await?;
            if code == 401 {
                return Err(SendErr::Unauthorized);
            }
            if code != 200 {
                return Err(SendErr::Other(format!("Kick kanal bilgisi okunamadı (HTTP {code}): {}", api_error(&v))));
            }
            let id = net::json_str(v.pointer("/data/0/broadcaster_user_id"));
            if id.is_empty() {
                return Err(SendErr::Other(format!("Kick kanalı bulunamadı: {slug}")));
            }
            cache(ck, id.clone());
            id
        }
    };
    let bid_v: Value = bid.parse::<u64>().map(Value::from).unwrap_or(Value::String(bid));
    let body = json!({ "broadcaster_user_id": bid_v, "content": truncate(text, 500), "type": "user" });
    let (code, v) = post_json_auth("https://api.kick.com/public/v1/chat", &t.access, None, &body).await?;
    if code == 401 {
        return Err(SendErr::Unauthorized);
    }
    if !(200..300).contains(&code) {
        return Err(SendErr::Other(format!("Kick HTTP {code}: {}", api_error(&v))));
    }
    Ok(())
}

/// API hesabıyla gönder (Gelişmiş yöntem)
async fn send_api(app: &AppHandle, p: Platform, ident: &str, video: Option<&str>, text: &str) -> Result<(), String> {
    let mut tok = token_for(app, p, false).await?;
    for attempt in 0..2 {
        let r = match p {
            Platform::Twitch => twitch_send(&tok, ident, text).await,
            Platform::Kick => kick_send(&tok, ident, text).await,
            Platform::Youtube => match video {
                Some(v) => youtube_send(&tok, v, text).await,
                None => Err(SendErr::Other("YouTube yayını şu an canlı değil".into())),
            },
            _ => Err(SendErr::Other("Bu kanala yazılamaz".into())),
        };
        match r {
            Ok(()) => return Ok(()),
            Err(SendErr::Unauthorized) if attempt == 0 => tok = token_for(app, p, true).await?,
            Err(SendErr::Unauthorized) => return Err("Yetki reddedildi; hesabı yeniden bağla".into()),
            Err(SendErr::Other(e)) => return Err(e),
        }
    }
    Err("Gönderilemedi".into())
}

/// Platformun yöntemiyle gönder: API hesabı bağlıysa API, değilse tarayıcı girişi (varsayılan)
async fn send_one(app: &AppHandle, p: Platform, ident: &str, video: Option<&str>, text: &str) -> Result<(), String> {
    if has_api(app, p) {
        send_api(app, p, ident, video, text).await
    } else {
        webchat::send(app, p, ident, video, text).await
    }
}

/// Gönderilebilecek kanallar: kanal çalışıyor (kilitli değil) ve sohbete bağlı / canlı
fn sendable(c: &ChannelStatus) -> bool {
    c.state != State::Locked && c.state != State::Idle && matches!(c.platform, Some(Platform::Twitch | Platform::Youtube | Platform::Kick))
}

/// Mesaj gönder. target: boş / "mine" = ★ ile işaretli tüm kanallar; ya da kanal anahtarı.
#[tauri::command]
pub async fn livechat_send(app: AppHandle, text: String, target: Option<String>) -> Result<Vec<SendResult>, String> {
    if !allowed(&app, FEATURE) {
        return Err("Sohbete yazma PRO üyelere özel".into());
    }
    let text = text.replace(['\r', '\n'], " ").trim().to_string();
    if text.is_empty() {
        return Err("Mesaj boş".into());
    }
    let h = hub(&app);
    let (chans, idents): (Vec<ChannelStatus>, HashMap<String, String>) = {
        let g = h.st.lock();
        if !g.running {
            return Err("Önce canlı sohbeti başlat".into());
        }
        (g.channels_view(), g.cfg.channels.iter().map(|c| (c.link.key.clone(), c.link.ident.clone())).collect())
    };
    let target = target.unwrap_or_default();
    let list: Vec<ChannelStatus> = if target.is_empty() || target == "mine" {
        chans.into_iter().filter(|c| c.mine && sendable(c)).collect()
    } else {
        chans.into_iter().filter(|c| c.key == target).collect()
    };
    if list.is_empty() {
        return Err(if target.is_empty() || target == "mine" {
            "Gönderilecek kanal yok: Kanallar'da kendi kanal(lar)ını ★ ile işaretle ve sohbeti başlat".into()
        } else {
            "Kanal bulunamadı".into()
        });
    }
    let mut out = Vec::new();
    for c in list {
        let p = c.platform.unwrap_or(Platform::System);
        let ident = idents.get(&c.key).cloned().unwrap_or_default();
        let r = if !sendable(&c) {
            Err("Bu kanal şu an bağlı değil".to_string())
        } else {
            send_one(&app, p, &ident, c.video_id.as_deref(), &text).await
        };
        match &r {
            Ok(()) => set_last(p, None),
            Err(e) => {
                dlog(format!("gönder {} ({} karakter): {e}", pkey(p), text.chars().count()));
                set_last(p, Some(&format!("Gönderilemedi: {e}")));
            }
        }
        out.push(SendResult { key: c.key.clone(), platform: p, label: c.label.clone(), ok: r.is_ok(), error: r.err() });
    }
    emit(&app);
    if out.iter().any(|r| r.ok) {
        let line = format!("[YAZ] {}", text);
        h.st.lock().log(line);
        // Doğrulama: gönderilen mesaj 20 sn içinde o kanalın sohbetinde görünmezse kullanıcıya söylenir
        let sent_at = now_ms();
        let want: String = text.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
        let keys: Vec<(String, String)> = out.iter().filter(|r| r.ok).map(|r| (r.key.clone(), r.label.clone())).collect();
        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut left = keys;
            for _ in 0..40 {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let h = hub(&app2);
                let g = h.st.lock();
                left.retain(|(k, _)| {
                    !g.ring.iter().rev().take(200).any(|m| {
                        m.channel == *k && m.ts + 5_000 >= sent_at && m.text.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase().contains(&want)
                    })
                });
                if left.is_empty() {
                    break;
                }
            }
            for (k, label) in left {
                dlog(format!("doğrulama {k}: gönderildi denildi ama 20 sn içinde sohbette görünmedi"));
                use tauri::Emitter;
                let _ = app2.emit("livechat-send-unseen", serde_json::json!({ "key": k, "label": label }));
            }
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn helpers() {
        assert_eq!(enc("a b/ç"), "a%20b%2F%C3%A7");
        assert_eq!(form(&[("scope", "user:read chat:write")]), "scope=user%3Aread%20chat%3Awrite");
        assert_eq!(query_param("/callback?code=4%2F0Ab&state=xyz", "code").as_deref(), Some("4/0Ab"));
        assert_eq!(query_param("/callback?error=access_denied&state=s", "error").as_deref(), Some("access_denied"));
        assert_eq!(query_param("/callback?x=1", "code"), None);
        assert_eq!(pct_decode("%C4%B0stanbul+bey%"), "İstanbul bey%");
        let t = token_from(&json!({ "access_token": "a", "expires_in": 60 }), Some(&Token { refresh: "r".into(), login: "x".into(), ..Default::default() })).unwrap();
        assert_eq!(t.refresh, "r");
        assert_eq!(t.login, "x");
        assert!(t.expires_at > now_ms());
        assert!(token_from(&json!({ "error": "invalid_grant" }), None).is_err());
        assert_eq!(truncate("çok uzun", 3), "çok");
        assert!(missing_scopes(&json!("user:read channel:read chat:write"), KICK_SCOPES).is_empty());
        assert_eq!(missing_scopes(&json!(["user:read:chat"]), TWITCH_SCOPES), vec!["user:write:chat".to_string()]);
        assert_eq!(missing_scopes(&Value::Null, "a b").len(), 2);
        assert_eq!(scrub("HTTP 400: invalid_grant kod 4/0AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"), "HTTP 400: invalid_grant kod 4/[…]");
        assert_eq!(scrub("dönüş adresi http://127.0.0.1:8767/callback"), "dönüş adresi http://127.0.0.1:8767/callback");
    }
}
