//! Sohbete yazma (PRO: `livechat.send`): Twitch / YouTube / Kick hesabıyla kendi kanal(lar)ının sohbetine mesaj gönderir.
//!
//! Giriş:
//!   - Twitch: OAuth "Device Code Flow" (gizli anahtar yok, "Public" istemci). Kod ekranda gösterilir, twitch.tv/activate
//!     açılır, Rust arka planda onayı bekler. Yenileme de gizli anahtarsız (public istemci). Kapsamlar:
//!     `user:read:chat user:write:chat` (gönderme Helix POST /helix/chat/messages).
//!   - YouTube ve Kick: yetkilendirme kodu + PKCE (S256), tarayıcı dönüşü 127.0.0.1:8767'deki tek seferlik yerel
//!     sunucuya gelir. Kod → anahtar değişimi ve yenileme Supabase edge function `chat-oauth` üzerinden yapılır
//!     (istemci gizli anahtarları sadece Supabase secrets'ta; programda yok). Çağrı giriş yapmış üyenin oturum
//!     anahtarıyla (JWT) yapılır.
//!   - İstemci kimlikleri (gizli değil) yönetici tarafından app_config'e yazılır; arayüz bunları komutlara verir.
//!
//! Anahtarlar `livechat_secrets.json` içinde DPAPI ile şifreli (bkz. secrets.rs), arayüze hiç gönderilmez.
//! Olay: "livechat-send" SendStatus

use super::model::{now_ms, ChannelStatus, Platform, State};
use super::{allowed, hub, net, secrets};
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
const LOOPBACK: &str = "127.0.0.1:8767";
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

/// Edge function çağrısı için oturum bilgisi (arayüz her çağrıda taze verir)
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CloudAuth {
    /// https://<proje>.supabase.co/functions/v1
    pub url: String,
    pub apikey: String,
    pub jwt: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub connected: bool,
    pub login: String,
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
}

#[derive(Default)]
struct SendState {
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

pub fn status(app: &AppHandle) -> SendStatus {
    let acc = |p: Platform| load(app, p).map(|t| AccountView { connected: true, login: t.login }).unwrap_or_default();
    let g = state().lock();
    SendStatus {
        allowed: allowed(app, FEATURE),
        twitch: acc(Platform::Twitch),
        youtube: acc(Platform::Youtube),
        kick: acc(Platform::Kick),
        device: g.device.clone(),
        pending: g.pending.clone(),
        error: g.error.clone(),
        yt_redirect: YT_REDIRECT.into(),
        kick_redirect: KICK_REDIRECT.into(),
    }
}

fn emit(app: &AppHandle) {
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
    let r = rb.send().await.map_err(|e| format!("Bağlantı hatası: {e}"))?;
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
// Edge function (YouTube / Kick anahtar değişimi ve yenileme)
// ---------------------------------------------------------------------------

async fn cloud_call(cloud: &CloudAuth, body: Value) -> Result<Value, String> {
    if cloud.url.is_empty() || cloud.jwt.is_empty() {
        return Err("Bu işlem için SRTR Pitwall hesabına giriş yapmalısın".into());
    }
    let c = net::http()?;
    let url = format!("{}/chat-oauth", cloud.url.trim_end_matches('/'));
    let (code, v) = send_req(
        c.post(&url)
            .header("apikey", &cloud.apikey)
            .header("Authorization", format!("Bearer {}", cloud.jwt))
            .header("Content-Type", "application/json")
            .body(body.to_string()),
    )
    .await?;
    if code == 404 {
        return Err("Sunucu işlevi (chat-oauth) kurulmamış; yöneticiye bildir".into());
    }
    if !(200..300).contains(&code) {
        return Err(api_error(&v));
    }
    Ok(v)
}

// ---------------------------------------------------------------------------
// Geçerli anahtar (gerekirse yenile)
// ---------------------------------------------------------------------------

async fn refresh(app: &AppHandle, p: Platform, t: &Token, cloud: Option<&CloudAuth>) -> Result<Token, String> {
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
            let cloud = cloud.ok_or("Oturumun süresi doldu; yenilemek için SRTR Pitwall hesabına giriş yapmalısın")?;
            let provider = if p == Platform::Youtube { "youtube" } else { "kick" };
            let v = cloud_call(cloud, json!({ "provider": provider, "action": "refresh", "refresh_token": t.refresh })).await.map_err(|e| {
                if e.contains("invalid_grant") {
                    "Oturum geçersiz; hesabı yeniden bağla".to_string()
                } else {
                    e
                }
            })?;
            token_from(&v, Some(t))?
        }
    };
    store(app, p, Some(&nt))?;
    Ok(nt)
}

async fn token_for(app: &AppHandle, p: Platform, cloud: Option<&CloudAuth>, force: bool) -> Result<Token, String> {
    let t = load(app, p).ok_or_else(|| format!("{} hesabı bağlı değil (Canlı Sohbet › Sohbete yaz)", p.name()))?;
    if force || (t.expires_at > 0 && t.expires_at < now_ms() + 60_000) {
        return refresh(app, p, &t, cloud).await;
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
    if let Ok(t) = result {
        if let Err(e) = store(&app, Platform::Twitch, Some(&t)) {
            state().lock().error = Some(e);
        }
    }
    emit(&app);
}

/// Twitch girişini başlat: kodu döner, onay arka planda beklenir ("livechat-send" olayı)
#[tauri::command]
pub async fn livechat_twitch_login(app: AppHandle, client_id: String) -> Result<SendStatus, String> {
    if !allowed(&app, FEATURE) {
        return Err("Sohbete yazma PRO üyelere özel".into());
    }
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Twitch uygulama kimliği yönetici tarafından henüz girilmedi".into());
    }
    cancel_all();
    let (code, v) = post_form("https://id.twitch.tv/oauth2/device", &[("client_id", &client_id), ("scopes", TWITCH_SCOPES)]).await?;
    if code != 200 {
        return Err(format!("Twitch: {}", api_error(&v)));
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

/// Tarayıcının dönüşünü bekle (en fazla 5 dk); yetkilendirme kodunu döner
fn wait_code(expect_state: &str, cancel: &AtomicBool) -> Result<String, String> {
    let server = tiny_http::Server::http(LOOPBACK).map_err(|e| format!("Yerel giriş adresi (127.0.0.1:8767) açılamadı, başka bir program kullanıyor olabilir: {e}"))?;
    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Giriş iptal edildi".into());
        }
        if std::time::Instant::now() > deadline {
            return Err("Giriş 5 dakika içinde tamamlanmadı".into());
        }
        let req = match server.recv_timeout(Duration::from_millis(400)) {
            Ok(Some(r)) => r,
            Ok(None) => continue,
            Err(e) => return Err(e.to_string()),
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
        let st = query_param(&url, "state").unwrap_or_default();
        if st != expect_state {
            respond(req, false);
            continue; // başka / eski bir dönüş
        }
        if let Some(e) = query_param(&url, "error") {
            respond(req, false);
            let d = query_param(&url, "error_description").unwrap_or_default();
            return Err(if e == "access_denied" { "İzin verilmedi".into() } else { format!("{e} {d}").trim().to_string() });
        }
        match query_param(&url, "code") {
            Some(c) if !c.is_empty() => {
                respond(req, true);
                return Ok(c);
            }
            _ => respond(req, false),
        }
    }
}

async fn yt_user(access: &str) -> Result<(String, String), String> {
    let (code, v) = get_auth("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", access, None).await?;
    if code != 200 {
        return Err(api_error(&v));
    }
    let id = net::json_str(v.pointer("/items/0/id"));
    if id.is_empty() {
        return Err("Bu Google hesabının YouTube kanalı yok".into());
    }
    Ok((id, net::json_str(v.pointer("/items/0/snippet/title"))))
}

async fn kick_user(access: &str) -> Result<(String, String), String> {
    let (code, v) = get_auth("https://api.kick.com/public/v1/users", access, None).await?;
    if code != 200 {
        return Err(api_error(&v));
    }
    let id = net::json_str(v.pointer("/data/0/user_id"));
    Ok((id, net::json_str(v.pointer("/data/0/name"))))
}

/// YouTube / Kick girişi: tarayıcıda izin → kod → edge function ile anahtar → kullanıcı bilgisi
#[tauri::command]
pub async fn livechat_oauth_login(app: AppHandle, provider: String, client_id: String, cloud: CloudAuth) -> Result<SendStatus, String> {
    if !allowed(&app, FEATURE) {
        return Err("Sohbete yazma PRO üyelere özel".into());
    }
    let p = match provider.as_str() {
        "youtube" => Platform::Youtube,
        "kick" => Platform::Kick,
        _ => return Err("Bilinmeyen platform".into()),
    };
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err(format!("{} uygulama kimliği yönetici tarafından henüz girilmedi", p.name()));
    }
    if cloud.jwt.is_empty() {
        return Err("Bu işlem için SRTR Pitwall hesabına giriş yapmalısın".into());
    }
    cancel_all();
    let verifier = secrets::random_token(48);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let st = secrets::random_token(18);
    let redirect = if p == Platform::Youtube { YT_REDIRECT } else { KICK_REDIRECT };
    let url = if p == Platform::Youtube {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
            enc(&client_id),
            enc(redirect),
            enc(YT_SCOPE),
            challenge,
            st
        )
    } else {
        format!(
            "https://id.kick.com/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
            enc(&client_id),
            enc(redirect),
            enc(KICK_SCOPES),
            challenge,
            st
        )
    };
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut g = state().lock();
        g.pending = Some(provider.clone());
        g.cancel = Some(cancel.clone());
        g.error = None;
    }
    emit(&app);
    let result: Result<Token, String> = async {
        // Sunucu tarayıcı açılmadan önce dinlemeye başlasın
        let st2 = st.clone();
        let c2 = cancel.clone();
        let waiter = tauri::async_runtime::spawn_blocking(move || wait_code(&st2, &c2));
        tokio::time::sleep(Duration::from_millis(150)).await;
        crate::open_url(url)?;
        let code = waiter.await.map_err(|e| e.to_string())??;
        let v = cloud_call(&cloud, json!({ "provider": provider, "action": "exchange", "code": code, "code_verifier": verifier, "redirect_uri": redirect })).await?;
        let mut t = token_from(&v, None)?;
        let (id, login) = if p == Platform::Youtube { yt_user(&t.access).await? } else { kick_user(&t.access).await? };
        t.user_id = id;
        t.login = login;
        Ok(t)
    }
    .await;
    {
        let mut g = state().lock();
        g.pending = None;
        g.cancel = None;
        g.error = result.as_ref().err().cloned();
    }
    let r = match result {
        Ok(t) => store(&app, p, Some(&t)).map(|_| ()),
        Err(e) => Err(e),
    };
    emit(&app);
    r.map(|_| status(&app))
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
        return Err(SendErr::Other(api_error(&v)));
    }
    Ok(())
}

async fn send_one(app: &AppHandle, p: Platform, ident: &str, video: Option<&str>, text: &str, cloud: Option<&CloudAuth>) -> Result<(), String> {
    let mut tok = token_for(app, p, cloud, false).await?;
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
            Err(SendErr::Unauthorized) if attempt == 0 => tok = token_for(app, p, cloud, true).await?,
            Err(SendErr::Unauthorized) => return Err("Yetki reddedildi; hesabı yeniden bağla".into()),
            Err(SendErr::Other(e)) => return Err(e),
        }
    }
    Err("Gönderilemedi".into())
}

/// Gönderilebilecek kanallar: kanal çalışıyor (kilitli değil) ve sohbete bağlı / canlı
fn sendable(c: &ChannelStatus) -> bool {
    c.state != State::Locked && c.state != State::Idle && matches!(c.platform, Some(Platform::Twitch | Platform::Youtube | Platform::Kick))
}

/// Mesaj gönder. target: boş / "mine" = ★ ile işaretli tüm kanallar; ya da kanal anahtarı.
#[tauri::command]
pub async fn livechat_send(app: AppHandle, text: String, target: Option<String>, cloud: Option<CloudAuth>) -> Result<Vec<SendResult>, String> {
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
            send_one(&app, p, &ident, c.video_id.as_deref(), &text, cloud.as_ref()).await
        };
        out.push(SendResult { key: c.key.clone(), platform: p, label: c.label.clone(), ok: r.is_ok(), error: r.err() });
    }
    if out.iter().any(|r| r.ok) {
        let line = format!("[YAZ] {}", text);
        h.st.lock().log(line);
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
    }
}
