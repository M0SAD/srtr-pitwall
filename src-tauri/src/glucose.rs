//! Kan şekeri (CGM) okuma: "Kan Şekeri" overlay'i için. Kaynaklar: LibreLinkUp (FreeStyle Libre takipçi hesabı),
//! Dexcom Share (takipçi paylaşımı açık hesap) ve Nightscout.
//!
//! * Giriş bilgileri yalnızca bu bilgisayarda, şifreli saklanır (livechat::secrets → Windows DPAPI); ayarlara,
//!   buluta, yedeğe ve OBS / tarayıcı kaynağına GİTMEZ. Ölçümler de yalnızca bellekte tutulur.
//! * Veri yalnızca overlay ekrandayken okunur: overlay `glucose_state` ile "bakıyorum" der; 2 dk haber gelmezse
//!   okuma durur. Okuma aralığı 60 sn (sensörler 1–5 dk'da bir değer üretir).
//! * Değerler mg/dL tutulur; birim çevirisi overlay'de yapılır. Bu bir tıbbi cihaz değildir.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const SECRET_KEY: &str = "glucose";
const POLL_MS: i64 = 60_000;
const WANT_MS: i64 = 120_000;
const HIST: usize = 36;
const LLU_VERSION: &str = "4.16.0";
const DEXCOM_APP: &str = "d89443d2-327c-4a6f-89e5-496bbb0317db";

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Cfg {
    /// "libre" | "dexcom" | "nightscout"
    pub source: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
    /// Dexcom: "us" | "ous" | "jp"
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub ns_url: String,
    #[serde(default)]
    pub ns_token: String,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub logged_in: bool,
    pub source: String,
    /// Maskelenmiş hesap adı (ör. "e***@ornek.com")
    pub account: String,
    /// mg/dL
    pub value: Option<f64>,
    /// "↑↑" "↑" "↗" "→" "↘" "↓" "↓↓" ya da boş
    pub arrow: String,
    /// Ölçüm anı (epoch ms)
    pub ts: i64,
    /// Geçmiş (eskiden yeniye): [epoch ms, mg/dL]
    pub hist: Vec<(i64, f64)>,
    pub error: String,
    /// Hatanın teknik özeti (aşama · HTTP kodu · yol); çevrilmez
    pub detail: String,
    /// Son başarılı okuma anı (epoch ms)
    pub checked_at: i64,
}

static STATE: Mutex<Option<State>> = parking_lot::const_mutex(None);
static WANT: AtomicI64 = AtomicI64::new(0);
static GEN: AtomicU64 = AtomicU64::new(0);
static FORCE: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn mask(cfg: &Cfg) -> String {
    if cfg.source == "nightscout" {
        return cfg.ns_url.trim_start_matches("https://").trim_start_matches("http://").trim_end_matches('/').to_string();
    }
    match cfg.user.split_once('@') {
        Some((a, b)) => format!("{}***@{}", a.chars().next().unwrap_or('*'), b),
        None => format!("{}***", cfg.user.chars().next().unwrap_or('*')),
    }
}

fn load(app: &AppHandle) -> Option<Cfg> {
    let v = crate::livechat::secrets::get_json(app, SECRET_KEY)?;
    let c: Cfg = serde_json::from_value(v).ok()?;
    (!c.source.is_empty()).then_some(c)
}

fn snapshot() -> State {
    STATE.lock().clone().unwrap_or_default()
}

fn publish(app: &AppHandle, st: State) {
    *STATE.lock() = Some(st.clone());
    let _ = app.emit("glucose", st);
}

fn client() -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) SRTR-Pitwall")
        // Resmi uygulamalar gibi HTTP/1.1 (bazı sunucu kuralları HTTP/2 istemcilerini reddediyor)
        .http1_only()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())
}

/// Son isteğin teknik özeti (hata iletisinin yanında gösterilir; gizli bilgi içermez): "giriş · HTTP 403 · engellendi"
static DETAIL: Mutex<String> = parking_lot::const_mutex(String::new());

fn note(stage: &str, code: u16, via: &str, extra: &str) {
    let mut d = format!("{stage} · HTTP {code} · {via}");
    if !extra.is_empty() {
        d.push_str(" · ");
        d.push_str(extra);
    }
    *DETAIL.lock() = d;
}

/// Yanıt JSON'a benziyor mu (engelleme sayfaları HTML / düz metin döner)
fn looks_json(b: &[u8]) -> bool {
    matches!(b.iter().find(|c| !c.is_ascii_whitespace()), Some(b'{') | Some(b'[') | Some(b'"'))
}

/// curl yapılandırma dosyası (stdin'den okunur: adres, başlıklar ve gövde komut satırında görünmez)
pub fn curl_config(method: &str, url: &str, headers: &[(String, String)], body: Option<&str>) -> String {
    let q = |v: &str| v.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\r', "\\r").replace('\t', "\\t");
    let mut c = String::from("silent\nshow-error\nmax-time = 25\nhttp1.1\n");
    c.push_str(&format!("request = \"{}\"\nurl = \"{}\"\n", q(method), q(url)));
    for (k, v) in headers {
        c.push_str(&format!("header = \"{}: {}\"\n", q(k), q(v)));
    }
    if let Some(b) = body {
        c.push_str(&format!("data-binary = \"{}\"\n", q(b)));
    }
    c.push_str("write-out = \"\\n%{http_code}\"\n");
    c
}

/// İsteği Windows'un kendi curl.exe'siyle (Schannel) gönder: sunucu uygulamanın TLS kitaplığını reddederse yedek yol
fn curl_send(method: &str, url: &str, headers: &[(String, String)], body: Option<&str>) -> Result<(u16, Vec<u8>), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let exe = if cfg!(windows) {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        format!("{root}\\System32\\curl.exe")
    } else {
        "curl".to_string()
    };
    let mut cmd = Command::new(exe);
    cmd.args(["-K", "-"]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|_| "curl yok".to_string())?;
    if let Some(mut si) = child.stdin.take() {
        let _ = si.write_all(curl_config(method, url, headers, body).as_bytes());
    }
    let out = child.wait_with_output().map_err(|_| "curl çalışmadı".to_string())?;
    let o = out.stdout;
    let cut = o.iter().rposition(|c| *c == b'\n').ok_or_else(|| "curl yanıt vermedi".to_string())?;
    let code = std::str::from_utf8(&o[cut + 1..]).ok().and_then(|x| x.trim().parse::<u16>().ok()).unwrap_or(0);
    if code == 0 {
        return Err("curl bağlanamadı".into());
    }
    Ok((code, o[..cut].to_vec()))
}

/// Taşıyıcı: önce uygulamanın kendi istemcisi; yanıt engellenmiş görünüyorsa (JSON değil / bağlantı hatası) curl.exe ile
/// yeniden dener ve o oturumda curl'de kalır.
struct Net {
    c: reqwest::Client,
    curl: AtomicBool,
}

impl Net {
    fn new() -> Result<Self, String> {
        Ok(Self { c: client()?, curl: AtomicBool::new(false) })
    }

    async fn direct(&self, method: &str, url: &str, headers: &[(String, String)], body: Option<&str>) -> Result<(u16, Vec<u8>), String> {
        let m = if method == "POST" { reqwest::Method::POST } else { reqwest::Method::GET };
        let mut rq = self.c.request(m, url);
        for (k, v) in headers {
            rq = rq.header(k.as_str(), v.as_str());
        }
        if let Some(b) = body {
            rq = rq.body(b.to_string());
        }
        let r = rq.send().await.map_err(|e| if e.is_timeout() { "zaman aşımı".to_string() } else if e.is_connect() { "bağlantı kurulamadı".to_string() } else { "istek gönderilemedi".to_string() })?;
        let code = r.status().as_u16();
        let b = r.bytes().await.map_err(|_| "yanıt okunamadı".to_string())?;
        Ok((code, b.to_vec()))
    }

    /// (HTTP kodu, gövde). `stage` yalnızca tanılama içindir.
    async fn send(&self, stage: &str, method: &str, url: &str, headers: &[(String, String)], body: Option<&str>) -> Result<(u16, Vec<u8>), String> {
        if !self.curl.load(Ordering::Relaxed) {
            match self.direct(method, url, headers, body).await {
                Ok((code, b)) if looks_json(&b) || (200..300).contains(&code) => {
                    note(stage, code, "doğrudan", "");
                    return Ok((code, b));
                }
                Ok((code, _)) => note(stage, code, "doğrudan", "JSON değil (engellendi?)"),
                Err(e) => note(stage, 0, "doğrudan", &e),
            }
        }
        let first = DETAIL.lock().clone();
        let (m, u, h, bd) = (method.to_string(), url.to_string(), headers.to_vec(), body.map(String::from));
        let r = tauri::async_runtime::spawn_blocking(move || curl_send(&m, &u, &h, bd.as_deref())).await.map_err(|_| "curl çalışmadı".to_string()).and_then(|x| x);
        match r {
            Ok((code, b)) => {
                if looks_json(&b) || (200..300).contains(&code) {
                    self.curl.store(true, Ordering::Relaxed);
                }
                note(stage, code, "curl", if looks_json(&b) { "" } else { "JSON değil" });
                Ok((code, b))
            }
            Err(e) => {
                *DETAIL.lock() = format!("{first} · {e}");
                Err(e)
            }
        }
    }
}

fn hdr(list: &[(&str, &str)]) -> Vec<(String, String)> {
    list.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

/// Oturum (yeniden giriş yapmadan sonraki okumalar için)
#[derive(Default)]
struct Session {
    /// LibreLinkUp: (taban adres, belirteç, hesap özeti, hasta kimliği)
    libre: Option<(String, String, String, String)>,
    /// Dexcom: (taban adres, oturum kimliği)
    dexcom: Option<(String, String)>,
}

struct Reading {
    value: f64,
    arrow: String,
    ts: i64,
    hist: Vec<(i64, f64)>,
}

/// Gün sayısı (1970-01-01'den), proleptik Gregoryen
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// LibreLinkUp "FactoryTimestamp": "10/5/2026 5:11:00 AM" (UTC) → epoch ms
pub fn parse_llu_time(s: &str) -> Option<i64> {
    let mut it = s.split_whitespace();
    let date = it.next()?;
    let time = it.next()?;
    let ampm = it.next().unwrap_or("");
    let mut d = date.split('/');
    let (mo, da, ye) = (d.next()?.parse::<i64>().ok()?, d.next()?.parse::<i64>().ok()?, d.next()?.parse::<i64>().ok()?);
    let mut t = time.split(':');
    let (mut h, mi, se) = (t.next()?.parse::<i64>().ok()?, t.next()?.parse::<i64>().ok()?, t.next().and_then(|x| x.parse::<i64>().ok()).unwrap_or(0));
    if ampm.eq_ignore_ascii_case("PM") && h < 12 {
        h += 12;
    } else if ampm.eq_ignore_ascii_case("AM") && h == 12 {
        h = 0;
    }
    if !(1..=12).contains(&mo) || !(1..=31).contains(&da) || h > 23 || mi > 59 || se > 60 {
        return None;
    }
    Some((days_from_civil(ye, mo, da) * 86_400 + h * 3600 + mi * 60 + se) * 1000)
}

fn llu_arrow(n: i64) -> &'static str {
    match n {
        1 => "↓",
        2 => "↘",
        3 => "→",
        4 => "↗",
        5 => "↑",
        _ => "",
    }
}

/// Dexcom / Nightscout yön adı → ok
pub fn dir_arrow(name: &str) -> &'static str {
    let k: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_uppercase();
    match k.as_str() {
        "DOUBLEUP" | "RISINGQUICKLY" | "1" => "↑↑",
        "SINGLEUP" | "RISING" | "2" => "↑",
        "FORTYFIVEUP" | "RISINGSLOWLY" | "3" => "↗",
        "FLAT" | "STABLE" | "4" => "→",
        "FORTYFIVEDOWN" | "FALLINGSLOWLY" | "5" => "↘",
        "SINGLEDOWN" | "FALLING" | "6" => "↓",
        "DOUBLEDOWN" | "FALLINGQUICKLY" | "7" => "↓↓",
        _ => "",
    }
}

fn valid_mgdl(v: f64) -> bool {
    v.is_finite() && (20.0..=600.0).contains(&v)
}

fn llu_base(region: &str) -> Option<String> {
    let r = region.to_ascii_lowercase();
    if r.is_empty() || r.len() > 8 || !r.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return None;
    }
    Some(match r.as_str() {
        "us" => "https://api.libreview.io".to_string(),
        "ru" => "https://api.libreview.ru".to_string(),
        _ => format!("https://api-{r}.libreview.io"),
    })
}

fn llu_headers(auth: Option<(&str, &str)>) -> Vec<(String, String)> {
    let mut h = hdr(&[("product", "llu.android"), ("version", LLU_VERSION), ("accept", "application/json"), ("content-type", "application/json"), ("cache-control", "no-cache"), ("connection", "Keep-Alive")]);
    if let Some((token, account)) = auth {
        h.push(("authorization".into(), format!("Bearer {token}")));
        h.push(("account-id".into(), account.to_string()));
    }
    h
}

async fn llu_login(c: &Net, cfg: &Cfg) -> Result<(String, String, String, String), String> {
    let mut base = "https://api.libreview.io".to_string();
    let body = json!({ "email": cfg.user, "password": cfg.password }).to_string();
    for _ in 0..3 {
        let (code, raw) = c.send("giriş", "POST", &format!("{base}/llu/auth/login"), &llu_headers(None), Some(&body)).await.map_err(|_| "LibreLinkUp sunucusuna ulaşılamadı".to_string())?;
        if code == 429 {
            return Err("Çok fazla deneme yapıldı: birkaç dakika sonra tekrar dene".into());
        }
        let v: Value = serde_json::from_slice(&raw).map_err(|_| "LibreLinkUp yanıtı okunamadı".to_string())?;
        let status = v.get("status").and_then(|x| x.as_i64()).unwrap_or(-1);
        let data = v.get("data").cloned().unwrap_or(Value::Null);
        if data.get("redirect").and_then(|x| x.as_bool()) == Some(true) {
            base = llu_base(data.get("region").and_then(|x| x.as_str()).unwrap_or("")).ok_or_else(|| "LibreLinkUp bölgesi belirlenemedi".to_string())?;
            continue;
        }
        if status == 2 {
            return Err("E-posta ya da şifre hatalı".into());
        }
        if status == 4 || data.get("step").is_some() {
            return Err("LibreLinkUp uygulamasını açıp bekleyen adımı (kullanım koşulları / doğrulama) tamamla, sonra tekrar dene".into());
        }
        if data.get("lockout").is_some() || status == 429 {
            return Err("Hesap geçici olarak kilitlendi: bir süre sonra tekrar dene".into());
        }
        let token = data.pointer("/authTicket/token").and_then(|x| x.as_str()).unwrap_or("");
        let uid = data.pointer("/user/id").and_then(|x| x.as_str()).unwrap_or("");
        if token.is_empty() || uid.is_empty() {
            note("giriş", code, if c.curl.load(Ordering::Relaxed) { "curl" } else { "doğrudan" }, &format!("durum {status}"));
            return Err("LibreLinkUp girişi başarısız".into());
        }
        let account: String = Sha256::digest(uid.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
        // Takip edilen ilk kişi
        let v: Value = llu_get(c, "bağlantılar", &base, token, &account, "/llu/connections").await?;
        let pid = v.pointer("/data/0/patientId").and_then(|x| x.as_str()).unwrap_or("");
        if pid.is_empty() || !pid.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') {
            return Err("Bu LibreLinkUp hesabı kimseyi takip etmiyor: sensör sahibinin LibreLink uygulamasından davet gönderilmeli".into());
        }
        return Ok((base, token.to_string(), account, pid.to_string()));
    }
    Err("LibreLinkUp bölgesi belirlenemedi".into())
}

async fn llu_get(c: &Net, stage: &str, base: &str, token: &str, account: &str, path: &str) -> Result<Value, String> {
    let (code, raw) = c.send(stage, "GET", &format!("{base}{path}"), &llu_headers(Some((token, account))), None).await.map_err(|_| "LibreLinkUp sunucusuna ulaşılamadı".to_string())?;
    if code == 401 || (code == 403 && looks_json(&raw)) {
        return Err("AUTH".into());
    }
    if !(200..300).contains(&code) {
        return Err("LibreLinkUp hatası".into());
    }
    serde_json::from_slice(&raw).map_err(|_| "LibreLinkUp yanıtı okunamadı".to_string())
}

async fn libre(c: &Net, cfg: &Cfg, s: &mut Session) -> Result<Reading, String> {
    if s.libre.is_none() {
        s.libre = Some(llu_login(c, cfg).await?);
    }
    let (base, token, account, pid) = s.libre.clone().unwrap();
    let v = match llu_get(c, "ölçüm", &base, &token, &account, &format!("/llu/connections/{pid}/graph")).await {
        Err(e) if e == "AUTH" => {
            // Oturum süresi doldu: bir kez yeniden giriş
            s.libre = Some(llu_login(c, cfg).await?);
            let (base, token, account, pid) = s.libre.clone().unwrap();
            llu_get(c, "ölçüm", &base, &token, &account, &format!("/llu/connections/{pid}/graph")).await.map_err(|e| if e == "AUTH" { "LibreLinkUp oturumu açılamadı".to_string() } else { e })?
        }
        r => r?,
    };
    let m = v.pointer("/data/connection/glucoseMeasurement").cloned().unwrap_or(Value::Null);
    let value = m.get("ValueInMgPerDl").and_then(|x| x.as_f64()).unwrap_or(f64::NAN);
    if !valid_mgdl(value) {
        return Err("Sensörden henüz veri gelmedi".into());
    }
    let ts = m.get("FactoryTimestamp").and_then(|x| x.as_str()).and_then(parse_llu_time).unwrap_or_else(now_ms);
    let mut hist: Vec<(i64, f64)> = v
        .pointer("/data/graphData")
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let val = e.get("ValueInMgPerDl")?.as_f64()?;
                    let t = parse_llu_time(e.get("FactoryTimestamp")?.as_str()?)?;
                    valid_mgdl(val).then_some((t, val))
                })
                .collect()
        })
        .unwrap_or_default();
    hist.push((ts, value));
    Ok(Reading { value, arrow: llu_arrow(m.get("TrendArrow").and_then(|x| x.as_i64()).unwrap_or(0)).to_string(), ts, hist })
}

fn dexcom_base(region: &str) -> &'static str {
    match region {
        "us" => "https://share2.dexcom.com/ShareWebServices/Services",
        "jp" => "https://share.dexcom.jp/ShareWebServices/Services",
        _ => "https://shareous1.dexcom.com/ShareWebServices/Services",
    }
}

async fn dexcom_post(c: &Net, url: String, body: Value) -> Result<Value, String> {
    let (code, raw) = c.send("dexcom", "POST", &url, &hdr(&[("accept", "application/json"), ("content-type", "application/json")]), Some(&body.to_string())).await.map_err(|_| "Dexcom sunucusuna ulaşılamadı".to_string())?;
    let v: Value = serde_json::from_slice(&raw).unwrap_or(Value::Null);
    if (200..300).contains(&code) {
        return Ok(v);
    }
    let code = v.get("Code").and_then(|x| x.as_str()).unwrap_or("");
    Err(match code {
        "AccountPasswordInvalid" | "SSO_AuthenticateAccountNotFound" | "SSO_AuthenticatePasswordInvalid" => "Kullanıcı adı ya da şifre hatalı (bölgeyi de kontrol et)".into(),
        "SSO_AuthenticateMaxAttemptsExceeed" | "SSO_AuthenticateMaxAttemptsExceeded" => "Çok fazla deneme yapıldı: bir süre sonra tekrar dene".into(),
        "SessionIdNotFound" | "SessionNotValid" => "AUTH".into(),
        _ => "Dexcom hatası".into(),
    })
}

async fn dexcom_login(c: &Net, cfg: &Cfg) -> Result<(String, String), String> {
    let base = dexcom_base(&cfg.region).to_string();
    let acc = dexcom_post(c, format!("{base}/General/AuthenticatePublisherAccount"), json!({ "accountName": cfg.user, "password": cfg.password, "applicationId": DEXCOM_APP })).await?;
    let acc = acc.as_str().unwrap_or("").to_string();
    if acc.is_empty() || acc.starts_with("00000000") {
        return Err("Kullanıcı adı ya da şifre hatalı (bölgeyi de kontrol et)".into());
    }
    let sid = dexcom_post(c, format!("{base}/General/LoginPublisherAccountById"), json!({ "accountId": acc, "password": cfg.password, "applicationId": DEXCOM_APP })).await?;
    let sid = sid.as_str().unwrap_or("").to_string();
    if sid.is_empty() || sid.starts_with("00000000") || !sid.chars().all(|ch| ch.is_ascii_hexdigit() || ch == '-') {
        return Err("Dexcom oturumu açılamadı".into());
    }
    Ok((base, sid))
}

fn dexcom_parse(v: &Value) -> Result<Reading, String> {
    let mut hist: Vec<(i64, f64, String)> = v
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let val = e.get("Value")?.as_f64()?;
                    let wt = e.get("WT").or_else(|| e.get("ST"))?.as_str()?;
                    let digits: String = wt.chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
                    let t = digits.parse::<i64>().ok()?;
                    let tr = match e.get("Trend") {
                        Some(Value::String(s)) => s.clone(),
                        Some(Value::Number(n)) => n.to_string(),
                        _ => String::new(),
                    };
                    valid_mgdl(val).then_some((t, val, tr))
                })
                .collect()
        })
        .unwrap_or_default();
    hist.sort_by_key(|x| x.0);
    let Some(last) = hist.last().cloned() else { return Err("Son 3 saatte veri yok (Dexcom uygulamasında Share açık ve en az bir takipçi ekli olmalı)".into()) };
    Ok(Reading { value: last.1, arrow: dir_arrow(&last.2).to_string(), ts: last.0, hist: hist.into_iter().map(|x| (x.0, x.1)).collect() })
}

async fn dexcom(c: &Net, cfg: &Cfg, s: &mut Session) -> Result<Reading, String> {
    if s.dexcom.is_none() {
        s.dexcom = Some(dexcom_login(c, cfg).await?);
    }
    let read = |base: String, sid: String| dexcom_post(c, format!("{base}/Publisher/ReadPublisherLatestGlucoseValues?sessionId={sid}&minutes=180&maxCount={HIST}"), json!({}));
    let (base, sid) = s.dexcom.clone().unwrap();
    let v = match read(base, sid).await {
        Err(e) if e == "AUTH" => {
            s.dexcom = Some(dexcom_login(c, cfg).await?);
            let (base, sid) = s.dexcom.clone().unwrap();
            read(base, sid).await.map_err(|e| if e == "AUTH" { "Dexcom oturumu açılamadı".to_string() } else { e })?
        }
        r => r?,
    };
    dexcom_parse(&v)
}

fn ns_parse(v: &Value) -> Result<Reading, String> {
    let mut hist: Vec<(i64, f64, String)> = v
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let val = e.get("sgv")?.as_f64()?;
                    let t = e.get("date")?.as_f64()? as i64;
                    let d = e.get("direction").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    valid_mgdl(val).then_some((t, val, d))
                })
                .collect()
        })
        .unwrap_or_default();
    hist.sort_by_key(|x| x.0);
    let Some(last) = hist.last().cloned() else { return Err("Nightscout'ta ölçüm bulunamadı".into()) };
    Ok(Reading { value: last.1, arrow: dir_arrow(&last.2).to_string(), ts: last.0, hist: hist.into_iter().map(|x| (x.0, x.1)).collect() })
}

async fn nightscout(c: &Net, cfg: &Cfg) -> Result<Reading, String> {
    let base = cfg.ns_url.trim().trim_end_matches('/');
    let mut url = format!("{base}/api/v1/entries.json?count={HIST}");
    if !cfg.ns_token.is_empty() {
        let enc: String = cfg.ns_token.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
        url.push_str("&token=");
        url.push_str(&enc);
    }
    let (code, raw) = c.send("nightscout", "GET", &url, &hdr(&[("accept", "application/json")]), None).await.map_err(|_| "Nightscout adresine ulaşılamadı".to_string())?;
    if code == 401 || code == 403 {
        return Err("Nightscout erişim belirteci (token) geçersiz ya da gerekli".into());
    }
    if !(200..300).contains(&code) {
        return Err("Nightscout hatası".into());
    }
    let v: Value = serde_json::from_slice(&raw).map_err(|_| "Nightscout yanıtı okunamadı".to_string())?;
    ns_parse(&v)
}

async fn fetch(c: &Net, cfg: &Cfg, s: &mut Session) -> Result<Reading, String> {
    let mut r = match cfg.source.as_str() {
        "libre" => libre(c, cfg, s).await,
        "dexcom" => dexcom(c, cfg, s).await,
        "nightscout" => nightscout(c, cfg).await,
        _ => Err("Bilinmeyen kaynak".into()),
    }?;
    r.hist.sort_by_key(|x| x.0);
    r.hist.dedup_by_key(|x| x.0);
    if r.hist.len() > HIST {
        r.hist.drain(..r.hist.len() - HIST);
    }
    Ok(r)
}

fn check(cfg: &mut Cfg) -> Result<(), String> {
    cfg.user = cfg.user.trim().to_string();
    cfg.ns_url = cfg.ns_url.trim().to_string();
    cfg.ns_token = cfg.ns_token.trim().to_string();
    match cfg.source.as_str() {
        "libre" | "dexcom" => {
            if cfg.user.is_empty() || cfg.password.is_empty() {
                return Err("E-posta / kullanıcı adı ve şifre gerekli".into());
            }
            if cfg.user.len() > 200 || cfg.password.len() > 200 {
                return Err("Giriş bilgileri çok uzun".into());
            }
            if !matches!(cfg.region.as_str(), "us" | "ous" | "jp") {
                cfg.region = "ous".into();
            }
            cfg.ns_url.clear();
            cfg.ns_token.clear();
        }
        "nightscout" => {
            if cfg.ns_url.is_empty() {
                return Err("Nightscout adresi gerekli".into());
            }
            if !cfg.ns_url.starts_with("https://") && !cfg.ns_url.starts_with("http://") {
                cfg.ns_url = format!("https://{}", cfg.ns_url);
            }
            if cfg.ns_url.len() > 300 || cfg.ns_token.len() > 300 || cfg.ns_url.contains(char::is_whitespace) {
                return Err("Nightscout adresi geçersiz".into());
            }
            cfg.user.clear();
            cfg.password.clear();
        }
        _ => return Err("Kaynak seçilmedi".into()),
    }
    Ok(())
}

fn state_of(cfg: &Cfg, r: Result<Reading, String>, prev: &State) -> State {
    match r {
        Ok(r) => State { logged_in: true, source: cfg.source.clone(), account: mask(cfg), value: Some(r.value), arrow: r.arrow, ts: r.ts, hist: r.hist, error: String::new(), detail: String::new(), checked_at: now_ms() },
        // Hata: son değer ekranda kalır (overlay eskiyince gri gösterir), hata metni eklenir
        Err(e) => State { logged_in: true, source: cfg.source.clone(), account: mask(cfg), error: e, detail: DETAIL.lock().clone(), ..prev.clone() },
    }
}

/// Giriş: bilgileri dener; başarılıysa bu bilgisayarda şifreli saklar ve okumayı başlatır.
#[tauri::command]
pub async fn glucose_login(app: AppHandle, cfg: Cfg) -> Result<State, String> {
    let mut cfg = cfg;
    check(&mut cfg)?;
    let c = Net::new()?;
    let mut s = Session::default();
    DETAIL.lock().clear();
    let r = fetch(&c, &cfg, &mut s).await;
    // "Henüz veri yok" girişin başarısız olduğu anlamına gelmez; kimlik / adres hataları ise kaydedilmez
    if let Err(e) = &r {
        if !e.contains("veri") && !e.contains("ölçüm") {
            let d = DETAIL.lock().clone();
            return Err(if d.is_empty() { e.clone() } else { format!("{e}\n{d}") });
        }
    }
    crate::livechat::secrets::set_json(&app, SECRET_KEY, &serde_json::to_value(&cfg).map_err(|e| e.to_string())?)?;
    let st = state_of(&cfg, r, &State::default());
    GEN.fetch_add(1, Ordering::Relaxed);
    publish(&app, st.clone());
    Ok(st)
}

#[tauri::command]
pub fn glucose_logout(app: AppHandle) -> Result<(), String> {
    crate::livechat::secrets::set_json(&app, SECRET_KEY, &Value::Null)?;
    GEN.fetch_add(1, Ordering::Relaxed);
    publish(&app, State::default());
    Ok(())
}

/// Son durum. Overlay bunu 30 sn'de bir çağırır: "ekrandayım, okumaya devam et" anlamına da gelir.
#[tauri::command]
pub fn glucose_state(watch: Option<bool>) -> State {
    if watch != Some(false) {
        WANT.store(now_ms(), Ordering::Relaxed);
    }
    snapshot()
}

/// OBS / tarayıcı kaynağı için son durum (yerel web sunucusu, yalnızca bu bilgisayardan): "bakıyorum" anlamına da gelir
pub fn http_state() -> String {
    WANT.store(now_ms(), Ordering::Relaxed);
    serde_json::to_string(&snapshot()).unwrap_or_else(|_| "{}".into())
}

/// Hemen yenile (çift tık)
#[tauri::command]
pub fn glucose_refresh() {
    WANT.store(now_ms(), Ordering::Relaxed);
    FORCE.store(true, Ordering::Relaxed);
}

static LAST_ALERT: Mutex<(String, i64)> = parking_lot::const_mutex((String::new(), 0));

/// Sesli uyarı (overlay eşiklere göre düzeyi bildirir): "ul" çok düşük, "l" düşük, "h" yüksek, "uh" çok yüksek, "ok" normal.
/// Aynı düzey için bekleme süresi burada tutulur (acil 5 dk, diğerleri 15 dk): birden çok pencere / kopya çift çalmaz.
/// Ses Rust'ta çalınır (overlay penceresinde tarayıcı sesi otomatik oynatma kuralına takılır).
#[tauri::command]
pub fn glucose_alert(level: String, volume: f32) -> bool {
    let (freq, count, cool) = match level.as_str() {
        "ul" => (900.0, 3, 300_000),
        "uh" => (1300.0, 3, 300_000),
        "l" => (700.0, 2, 900_000),
        "h" => (1100.0, 2, 900_000),
        _ => {
            *LAST_ALERT.lock() = (String::new(), 0);
            return false;
        }
    };
    let now = now_ms();
    {
        let mut g = LAST_ALERT.lock();
        if g.0 == level && now - g.1 < cool {
            return false;
        }
        *g = (level, now);
    }
    let v = if volume.is_finite() { volume.clamp(0.05, 1.0) } else { 0.6 };
    for _ in 0..count {
        crate::audio::send(crate::audio::Cmd::Beep { freq, ms: 220, volume: v, pan: 0.0 });
        crate::audio::send(crate::audio::Cmd::Beep { freq: 1.0, ms: 140, volume: 0.0, pan: 0.0 });
    }
    true
}

/// Arka plan okuyucu (bir kez başlatılır)
pub fn start(app: &AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    let _ = std::thread::Builder::new().name("glucose".into()).spawn(move || {
        let mut gen = u64::MAX;
        let mut cfg: Option<Cfg> = None;
        let mut sess = Session::default();
        let mut last = 0i64;
        let mut fails = 0u32;
        let Ok(c) = Net::new() else { return };
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let g = GEN.load(Ordering::Relaxed);
            if g != gen {
                gen = g;
                cfg = load(&app);
                sess = Session::default();
                last = 0;
                fails = 0;
                let cur = snapshot();
                match &cfg {
                    Some(cf) if !cur.logged_in => publish(&app, State { logged_in: true, source: cf.source.clone(), account: mask(cf), ..State::default() }),
                    None if cur.logged_in => publish(&app, State::default()),
                    _ => {}
                }
            }
            let Some(cf) = cfg.clone() else { continue };
            let now = now_ms();
            if now - WANT.load(Ordering::Relaxed) > WANT_MS {
                continue;
            }
            let force = FORCE.swap(false, Ordering::Relaxed);
            // Hata üst üste gelirse aralık uzar (en çok 5 dk): hesabın kilitlenmesine yol açmamak için
            let wait = POLL_MS * i64::from(1 + fails.min(4));
            if !(force && now - last > 5000) && now - last < wait {
                continue;
            }
            last = now;
            let r = crate::crashlog::guard(|| tauri::async_runtime::block_on(fetch(&c, &cf, &mut sess))).unwrap_or_else(|| Err("Okuma hatası".into()));
            if GEN.load(Ordering::Relaxed) != gen {
                continue;
            }
            fails = if r.is_ok() { 0 } else { fails + 1 };
            publish(&app, state_of(&cf, r, &snapshot()));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llu_time() {
        assert_eq!(parse_llu_time("1/1/1970 12:00:00 AM"), Some(0));
        assert_eq!(parse_llu_time("1/1/1970 12:00:01 PM"), Some(43_201_000));
        assert_eq!(parse_llu_time("10/5/2026 5:11:00 AM"), Some(1_791_177_060_000));
        assert_eq!(parse_llu_time("bozuk"), None);
    }

    #[test]
    fn arrows() {
        assert_eq!(dir_arrow("Flat"), "→");
        assert_eq!(dir_arrow("FortyFiveUp"), "↗");
        assert_eq!(dir_arrow("DOUBLE_DOWN"), "↓↓");
        assert_eq!(dir_arrow("NOT COMPUTABLE"), "");
        assert_eq!(llu_arrow(3), "→");
    }

    #[test]
    fn parsers() {
        let d = json!([{ "WT": "Date(1700000300000)", "Value": 120, "Trend": "Flat" }, { "WT": "Date(1700000000000)", "Value": 110, "Trend": "SingleUp" }]);
        let r = dexcom_parse(&d).unwrap();
        assert_eq!((r.value, r.ts, r.arrow.as_str(), r.hist.len()), (120.0, 1_700_000_300_000, "→", 2));
        let n = json!([{ "sgv": 95, "date": 1700000300000i64, "direction": "FortyFiveDown" }, { "sgv": 900, "date": 1700000000000i64 }]);
        let r = ns_parse(&n).unwrap();
        assert_eq!((r.value, r.arrow.as_str(), r.hist.len()), (95.0, "↘", 1));
        assert!(dexcom_parse(&json!([])).is_err());
        assert_eq!(llu_base("eu").as_deref(), Some("https://api-eu.libreview.io"));
        assert_eq!(llu_base("RU").as_deref(), Some("https://api.libreview.ru"));
        assert_eq!(llu_base("e/u"), None);
        assert!(looks_json(b"  {\"a\":1}") && !looks_json(b"<html>"));
        let c = curl_config("POST", "https://x/y", &hdr(&[("a", "b\"c")]), Some("{\"p\":\"q\\\\\"}"));
        assert!(c.contains("header = \"a: b\\\"c\"") && c.contains("request = \"POST\"") && c.contains("data-binary = \"{\\\"p\\\":\\\"q\\\\\\\\\\\"}\""));
    }

    #[test]
    fn masks() {
        let c = Cfg { source: "libre".into(), user: "erkin@ornek.com".into(), ..Cfg::default() };
        assert_eq!(mask(&c), "e***@ornek.com");
    }
}
