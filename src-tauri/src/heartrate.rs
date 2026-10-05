//! Kalp atışı (nabız): "Nabız" overlay'i için. Akıllı saat / göğüs bandı verisi üç yoldan alınır:
//!   * Pulsoid  — telefondaki Pulsoid uygulaması (Apple Watch, Wear OS, Garmin, Bluetooth bantlar) → Pulsoid sunucusu →
//!                websocket (erişim belirteciyle).
//!   * HypeRate — HypeRate uygulaması → websocket (geliştirici API anahtarı + oturum kimliğiyle).
//!   * Yerel    — saat / telefon uygulaması (ör. Health Data Server, HeartRateOnStream, kendi betiğin) nabzı bu
//!                bilgisayardaki yerel web sunucusuna gönderir: `PUT|POST|GET http://<pc>:<port>/hr/<anahtar>`.
//!
//! Belirteç / anahtar yalnızca bu bilgisayarda, şifreli saklanır (livechat::secrets); ölçümler yalnızca bellekte.
//! Websocket yalnızca overlay ekrandayken (ya da panel önizlemesi açıkken) bağlı tutulur: 2 dk "bakıyorum" gelmezse kapanır.

use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::tungstenite::Message;

const SECRET_KEY: &str = "heartrate";
const WANT_MS: i64 = 120_000;
const HIST: usize = 180;

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Cfg {
    /// "pulsoid" | "hyperate" | "local"
    pub source: String,
    /// Pulsoid erişim belirteci / HypeRate API anahtarı
    #[serde(default)]
    pub token: String,
    /// HypeRate oturum kimliği (uygulamada görünen kısa kod)
    #[serde(default)]
    pub id: String,
    /// Yerel gönderim adresinin anahtarı (kendiliğinden üretilir)
    #[serde(default)]
    pub key: String,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct State {
    /// Bir kaynak ayarlanmış
    pub configured: bool,
    pub source: String,
    /// Websocket bağlı (yerelde: son 30 sn'de veri geldi)
    pub connected: bool,
    pub bpm: Option<u16>,
    /// Son ölçüm anı (epoch ms)
    pub ts: i64,
    /// [epoch ms, bpm], eskiden yeniye (en çok saniyede bir nokta)
    pub hist: Vec<(i64, u16)>,
    pub error: String,
    /// Yerel kaynak: gönderim adresinin anahtarı (adres panelde kurulur)
    pub local_key: String,
}

static STATE: Mutex<Option<State>> = parking_lot::const_mutex(None);
static CFG: Mutex<Option<Cfg>> = parking_lot::const_mutex(None);
static WANT: AtomicI64 = AtomicI64::new(0);
static GEN: AtomicU64 = AtomicU64::new(0);
static STARTED: AtomicBool = AtomicBool::new(false);
static LAST_EMIT: AtomicI64 = AtomicI64::new(0);
static APP: OnceLock<AppHandle> = OnceLock::new();

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn snapshot() -> State {
    STATE.lock().clone().unwrap_or_default()
}

fn emit(force: bool) {
    let now = now_ms();
    if !force && now - LAST_EMIT.load(Ordering::Relaxed) < 900 {
        return;
    }
    LAST_EMIT.store(now, Ordering::Relaxed);
    if let Some(app) = APP.get() {
        let _ = app.emit("heartrate", snapshot());
    }
}

fn update(f: impl FnOnce(&mut State)) {
    let mut g = STATE.lock();
    let st = g.get_or_insert_with(State::default);
    f(st);
}

fn base_state(cfg: Option<&Cfg>) -> State {
    match cfg {
        Some(c) => State { configured: true, source: c.source.clone(), local_key: if c.source == "local" { c.key.clone() } else { String::new() }, ..State::default() },
        None => State::default(),
    }
}

pub fn valid_bpm(v: f64) -> Option<u16> {
    (v.is_finite() && (25.0..=250.0).contains(&v)).then(|| v.round() as u16)
}

/// Yeni ölçüm (her kaynaktan buraya gelir)
fn push_bpm(bpm: u16) {
    let now = now_ms();
    update(|s| {
        s.bpm = Some(bpm);
        s.ts = now;
        s.connected = true;
        s.error.clear();
        match s.hist.last_mut() {
            Some(l) if now - l.0 < 1000 => l.1 = bpm,
            _ => s.hist.push((now, bpm)),
        }
        if s.hist.len() > HIST {
            let cut = s.hist.len() - HIST;
            s.hist.drain(..cut);
        }
    });
    emit(false);
}

fn set_status(connected: bool, error: &str) {
    update(|s| {
        s.connected = connected;
        s.error = error.to_string();
    });
    emit(true);
}

/// Gövde / sorgudan nabız: JSON (heartRate, heart_rate, bpm, hr, value; iç içe "data" da olur), "heartRate:72", "72"
pub fn parse_bpm(text: &str) -> Option<u16> {
    let t = text.trim();
    if t.is_empty() || t.len() > 4096 {
        return None;
    }
    if let Ok(v) = serde_json::from_str::<Value>(t) {
        fn dig(v: &Value, depth: u8) -> Option<f64> {
            match v {
                Value::Number(n) => n.as_f64(),
                Value::String(s) => s.trim().parse::<f64>().ok(),
                Value::Object(m) if depth < 3 => {
                    for k in ["heartRate", "heart_rate", "heartrate", "bpm", "hr", "HR", "BPM", "value"] {
                        if let Some(x) = m.get(k).and_then(|x| dig(x, depth + 1)) {
                            return Some(x);
                        }
                    }
                    ["data", "payload"].iter().find_map(|k| m.get(*k).and_then(|x| dig(x, depth + 1)))
                }
                _ => None,
            }
        }
        if let Some(x) = dig(&v, 0) {
            return valid_bpm(x);
        }
    }
    // "heartRate:72", "bpm=72", "hr 72" ya da yalın sayı
    for part in t.split(|c: char| c == '&' || c == '\n' || c == ';' || c == ',') {
        let p = part.trim();
        let (k, val) = match p.split_once(|c: char| c == ':' || c == '=' || c == ' ') {
            Some((k, v)) => (k.trim().to_ascii_lowercase(), v.trim()),
            None => (String::new(), p),
        };
        if k.is_empty() || matches!(k.as_str(), "heartrate" | "heart_rate" | "bpm" | "hr" | "value") {
            if let Some(b) = val.trim_matches('"').parse::<f64>().ok().and_then(valid_bpm) {
                return Some(b);
            }
        }
    }
    None
}

/// Yerel web sunucusundaki `/hr/<anahtar>` isteği. Dönüş: (HTTP kodu, gövde)
pub fn http_push(path: &str, query: &str, body: &str) -> (u16, &'static str) {
    let key = path.strip_prefix("/hr/").unwrap_or("").trim_end_matches('/');
    let ok = {
        let g = CFG.lock();
        matches!(g.as_ref(), Some(c) if c.source == "local" && !c.key.is_empty() && c.key == key)
    };
    if !ok {
        return (404, "not found");
    }
    match parse_bpm(body).or_else(|| parse_bpm(query)) {
        Some(b) => {
            push_bpm(b);
            (200, "ok")
        }
        None => (400, "no heart rate"),
    }
}

fn check(cfg: &mut Cfg, old_key: &str) -> Result<(), String> {
    cfg.token = cfg.token.trim().to_string();
    cfg.id = cfg.id.trim().to_string();
    match cfg.source.as_str() {
        "pulsoid" => {
            if cfg.token.len() < 8 || cfg.token.len() > 200 || !cfg.token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                return Err("Pulsoid erişim belirteci geçersiz".into());
            }
            cfg.id.clear();
        }
        "hyperate" => {
            if cfg.token.len() < 8 || cfg.token.len() > 200 || cfg.token.contains(char::is_whitespace) {
                return Err("HypeRate API anahtarı geçersiz".into());
            }
            if cfg.id.is_empty() || cfg.id.len() > 20 || !cfg.id.chars().all(|c| c.is_ascii_alphanumeric()) {
                return Err("HypeRate oturum kimliği geçersiz".into());
            }
        }
        "local" => {
            cfg.token.clear();
            cfg.id.clear();
        }
        _ => return Err("Kaynak seçilmedi".into()),
    }
    cfg.key = if cfg.source == "local" {
        if old_key.len() >= 8 {
            old_key.to_string()
        } else {
            crate::livechat::secrets::random_token(9).chars().filter(|c| c.is_ascii_alphanumeric()).take(12).collect()
        }
    } else {
        String::new()
    };
    Ok(())
}

fn ws_url(cfg: &Cfg) -> String {
    let enc: String = cfg.token.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
    match cfg.source.as_str() {
        "pulsoid" => format!("wss://dev.pulsoid.net/api/v1/data/real_time?access_token={enc}"),
        _ => format!("wss://app.hyperate.io/socket/websocket?token={enc}"),
    }
}

/// Websocket iletisinden nabız (Pulsoid: {"data":{"heart_rate":N}}; HypeRate: {"event":"hr_update","payload":{"hr":N}})
pub fn ws_bpm(source: &str, text: &str) -> Option<u16> {
    let v: Value = serde_json::from_str(text).ok()?;
    if source == "hyperate" {
        if v.get("event").and_then(|x| x.as_str()) != Some("hr_update") {
            return None;
        }
        return v.pointer("/payload/hr").and_then(|x| x.as_f64()).and_then(valid_bpm);
    }
    v.pointer("/data/heart_rate").or_else(|| v.get("heart_rate")).and_then(|x| x.as_f64()).and_then(valid_bpm)
}

fn connect_error(source: &str, e: &str) -> String {
    let l = e.to_ascii_lowercase();
    if l.contains("401") || l.contains("403") || l.contains("unauthorized") || l.contains("forbidden") {
        if source == "pulsoid" { "Pulsoid erişim belirteci kabul edilmedi" } else { "HypeRate API anahtarı kabul edilmedi" }.to_string()
    } else if l.contains("zaman") {
        "Sunucu yanıt vermedi".to_string()
    } else {
        "Sunucuya bağlanılamadı".to_string()
    }
}

/// Bir websocket oturumu: bağlan, oku; kaynak değişince / kimse bakmayınca / bağlantı kopunca döner
async fn ws_session(cfg: &Cfg, gen: u64) -> Result<(), String> {
    let mut ws = crate::livechat::net::ws_connect(&ws_url(cfg), &[]).await.map_err(|e| connect_error(&cfg.source, &e))?;
    if cfg.source == "hyperate" {
        let join = json!({ "topic": format!("hr:{}", cfg.id), "event": "phx_join", "payload": {}, "ref": 0 }).to_string();
        ws.send(Message::Text(join.into())).await.map_err(|_| "Sunucuya bağlanılamadı".to_string())?;
    }
    set_status(true, "");
    let mut beat = tokio::time::interval(Duration::from_secs(20));
    loop {
        tokio::select! {
            _ = beat.tick() => {
                if GEN.load(Ordering::Relaxed) != gen || now_ms() - WANT.load(Ordering::Relaxed) > WANT_MS {
                    let _ = ws.close(None).await;
                    return Ok(());
                }
                let ping = if cfg.source == "hyperate" {
                    Message::Text(json!({ "topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": 0 }).to_string().into())
                } else {
                    Message::Ping(Vec::new().into())
                };
                if ws.send(ping).await.is_err() {
                    return Err("Bağlantı koptu".into());
                }
            }
            m = ws.next() => match m {
                Some(Ok(Message::Text(t))) => {
                    if cfg.source == "hyperate" && t.contains("\"phx_reply\"") && t.contains("\"error\"") {
                        return Err("HypeRate oturum kimliği kabul edilmedi".into());
                    }
                    if let Some(b) = ws_bpm(&cfg.source, &t) {
                        push_bpm(b);
                    }
                }
                Some(Ok(Message::Close(_))) | None => return Err("Bağlantı koptu".into()),
                Some(Ok(_)) => {}
                Some(Err(_)) => return Err("Bağlantı koptu".into()),
            }
        }
    }
}

async fn run() {
    let mut gen = u64::MAX;
    let mut cfg: Option<Cfg> = None;
    let mut wait = 3u64;
    loop {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        let g = GEN.load(Ordering::Relaxed);
        if g != gen {
            gen = g;
            cfg = CFG.lock().clone();
            wait = 3;
            *STATE.lock() = Some(base_state(cfg.as_ref()));
            emit(true);
        }
        let Some(cf) = cfg.clone() else { continue };
        let now = now_ms();
        if cf.source == "local" {
            // Veri HTTP ile gelir; 30 sn gelmezse "bağlı değil"
            let st = snapshot();
            if st.connected && now - st.ts > 30_000 {
                set_status(false, "");
            }
            continue;
        }
        if now - WANT.load(Ordering::Relaxed) > WANT_MS {
            if snapshot().connected {
                set_status(false, "");
            }
            continue;
        }
        match ws_session(&cf, gen).await {
            Ok(()) => {
                wait = 3;
                set_status(false, "");
            }
            Err(e) => {
                set_status(false, &e);
                // Kimlik hatasında sık denenmez; diğerlerinde artan bekleme (en çok 60 sn)
                let auth = e.contains("kabul edilmedi");
                let secs = if auth { 120 } else { wait };
                wait = (wait * 2).min(60);
                for _ in 0..secs {
                    if GEN.load(Ordering::Relaxed) != gen {
                        break;
                    }
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }
}

/// Kaynağı kaydet ve bağlan. Websocket kaynaklarında önce bir kez bağlanmayı dener (belirteç yanlışsa kaydedilmez).
#[tauri::command]
pub async fn heartrate_connect(app: AppHandle, cfg: Cfg) -> Result<State, String> {
    let mut cfg = cfg;
    let old_key = CFG.lock().as_ref().map(|c| c.key.clone()).unwrap_or_default();
    check(&mut cfg, &old_key)?;
    if cfg.source != "local" {
        let mut ws = crate::livechat::net::ws_connect(&ws_url(&cfg), &[]).await.map_err(|e| connect_error(&cfg.source, &e))?;
        let _ = ws.close(None).await;
    }
    crate::livechat::secrets::set_json(&app, SECRET_KEY, &serde_json::to_value(&cfg).map_err(|e| e.to_string())?)?;
    *CFG.lock() = Some(cfg.clone());
    *STATE.lock() = Some(base_state(Some(&cfg)));
    WANT.store(now_ms(), Ordering::Relaxed);
    GEN.fetch_add(1, Ordering::Relaxed);
    emit(true);
    Ok(snapshot())
}

#[tauri::command]
pub fn heartrate_disconnect(app: AppHandle) -> Result<(), String> {
    crate::livechat::secrets::set_json(&app, SECRET_KEY, &Value::Null)?;
    *CFG.lock() = None;
    *STATE.lock() = Some(State::default());
    GEN.fetch_add(1, Ordering::Relaxed);
    emit(true);
    Ok(())
}

/// Son durum. Overlay / önizleme bunu 30 sn'de bir çağırır: "bakıyorum, bağlı kal" anlamına da gelir.
#[tauri::command]
pub fn heartrate_state(watch: Option<bool>) -> State {
    if watch != Some(false) {
        WANT.store(now_ms(), Ordering::Relaxed);
    }
    snapshot()
}

static LAST_ALERT: AtomicI64 = AtomicI64::new(0);

/// Yüksek nabız uyarı sesi (en çok dakikada bir; birden çok pencere çift çalmaz)
#[tauri::command]
pub fn heartrate_alert(volume: f32) -> bool {
    let now = now_ms();
    if now - LAST_ALERT.load(Ordering::Relaxed) < 60_000 {
        return false;
    }
    LAST_ALERT.store(now, Ordering::Relaxed);
    let v = if volume.is_finite() { volume.clamp(0.05, 1.0) } else { 0.6 };
    for _ in 0..2 {
        crate::audio::send(crate::audio::Cmd::Beep { freq: 1000.0, ms: 160, volume: v, pan: 0.0 });
        crate::audio::send(crate::audio::Cmd::Beep { freq: 1.0, ms: 110, volume: 0.0, pan: 0.0 });
    }
    true
}

pub fn start(app: &AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = APP.set(app.clone());
    let cfg: Option<Cfg> = crate::livechat::secrets::get_json(app, SECRET_KEY).and_then(|v| serde_json::from_value(v).ok()).filter(|c: &Cfg| !c.source.is_empty());
    *STATE.lock() = Some(base_state(cfg.as_ref()));
    *CFG.lock() = cfg;
    tauri::async_runtime::spawn(run());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bodies() {
        assert_eq!(parse_bpm("{\"heartRate\":72}"), Some(72));
        assert_eq!(parse_bpm("{\"data\":{\"heart_rate\":141.4}}"), Some(141));
        assert_eq!(parse_bpm("{\"bpm\":\"88\"}"), Some(88));
        assert_eq!(parse_bpm("heartRate:95"), Some(95));
        assert_eq!(parse_bpm("bpm=120&x=1"), Some(120));
        assert_eq!(parse_bpm(" 64 "), Some(64));
        assert_eq!(parse_bpm("{\"heartRate\":900}"), None);
        assert_eq!(parse_bpm("speed:72"), None);
        assert_eq!(parse_bpm(""), None);
    }

    #[test]
    fn ws_messages() {
        assert_eq!(ws_bpm("pulsoid", "{\"measured_at\":1,\"data\":{\"heart_rate\":77}}"), Some(77));
        assert_eq!(ws_bpm("hyperate", "{\"event\":\"hr_update\",\"payload\":{\"hr\":133},\"topic\":\"hr:abc\"}"), Some(133));
        assert_eq!(ws_bpm("hyperate", "{\"event\":\"phx_reply\",\"payload\":{\"status\":\"ok\"}}"), None);
        assert_eq!(ws_bpm("pulsoid", "bozuk"), None);
    }

    #[test]
    fn config() {
        let mut c = Cfg { source: "local".into(), ..Cfg::default() };
        check(&mut c, "").unwrap();
        assert!(c.key.len() >= 8 && c.key.chars().all(|x| x.is_ascii_alphanumeric()));
        let k = c.key.clone();
        check(&mut c, &k).unwrap();
        assert_eq!(c.key, k);
        let mut p = Cfg { source: "pulsoid".into(), token: "kisa".into(), ..Cfg::default() };
        assert!(check(&mut p, "").is_err());
        assert!(ws_url(&Cfg { source: "pulsoid".into(), token: "abc-123".into(), ..Cfg::default() }).ends_with("access_token=abc-123"));
    }

    #[test]
    fn push_route() {
        *CFG.lock() = Some(Cfg { source: "local".into(), key: "anahtar123".into(), ..Cfg::default() });
        assert_eq!(http_push("/hr/yanlis", "", "72").0, 404);
        assert_eq!(http_push("/hr/anahtar123", "", "saçma").0, 400);
        assert_eq!(http_push("/hr/anahtar123", "bpm=81", "").0, 200);
        assert_eq!(snapshot().bpm, Some(81));
        *CFG.lock() = None;
    }
}
