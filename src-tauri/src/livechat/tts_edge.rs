//! Edge "Sesli Oku" (Read Aloud) çevrimiçi doğal sesleri: tr-TR-AhmetNeural, tr-TR-EmelNeural, en-US-AriaNeural…
//!
//! Python `edge-tts` kitaplığının kullandığı protokolün aynısı (yerel Rust, Python gerekmez):
//!   - wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=…
//!     &ConnectionId=…&Sec-MS-GEC=…&Sec-MS-GEC-Version=…
//!   - Sec-MS-GEC: 5 dakikaya yuvarlanmış Windows dosya zamanı (100 ns adım) + belirteç → SHA-256, büyük harf hex
//!   - metin çerçevesi `Path:speech.config` (çıkış biçimi), sonra `Path:ssml` (SSML)
//!   - ikili çerçeveler: 2 bayt (big-endian) başlık uzunluğu + başlıklar (`Path:audio`) + MP3 verisi
//!   - metin çerçevesi `Path:turn.end`: bitti
//!
//! Bu uç yalnızca MP3 (ve WebM/Opus) verir; MP3 → PCM çözme işi Windows'ta Media Foundation ile yapılır
//! (bkz. mp3_win.rs). Bu dosya her platformda derlenir. İnternet gerekir.

// Çalma kuyruğu bugün yalnızca Windows'ta çalışıyor: başka platformlarda sentez yolu çağrılmaz
#![cfg_attr(not(windows), allow(dead_code))]

use super::net;
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

/// Edge ses kimliklerinin ön eki (ör. `edge:tr-TR-EmelNeural`)
pub const PREFIX: &str = "edge:";
/// Edge tarayıcısının herkese açık istemci belirteci (edge-tts ile aynı sabit; gizli değildir)
pub const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL: &str = "143.0.3650.75";
const CHROMIUM_MAJOR: &str = "143";
const WSS_URL: &str = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const VOICES_URL: &str = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list";
const OUTPUT_FORMAT: &str = "audio-24khz-48kbitrate-mono-mp3";
/// 1601 → 1970 arası saniye (Windows dosya zamanı başlangıcı)
const WIN_EPOCH: i64 = 11_644_473_600;
/// Bir okumanın tamamı için süre sınırı
pub const TIMEOUT: Duration = Duration::from_secs(10);
/// Başarısızlıktan sonra bu kadar süre Edge denenmez (sıra her mesajda 10 sn beklemesin)
const COOLDOWN: Duration = Duration::from_secs(30);

/// Sunucu saatine göre düzeltme (sn): 403 yanıtındaki Date başlığından öğrenilir
static CLOCK_SKEW: AtomicI64 = AtomicI64::new(0);
static DOWN_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0) + CLOCK_SKEW.load(Ordering::Relaxed)
}

fn hex_upper(b: &[u8]) -> String {
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push_str(&format!("{x:02X}"));
    }
    s
}

/// Sec-MS-GEC değeri: `unix_secs` anı için (5 dakikalık dilime yuvarlanır)
pub fn sec_ms_gec(unix_secs: i64) -> String {
    let mut ticks = unix_secs + WIN_EPOCH;
    ticks -= ticks.rem_euclid(300);
    // 100 nanosaniyelik adımlar
    let ticks = ticks as i128 * 10_000_000;
    hex_upper(&Sha256::digest(format!("{ticks}{TRUSTED_CLIENT_TOKEN}").as_bytes()))
}

pub fn sec_ms_gec_version() -> String {
    format!("1-{CHROMIUM_FULL}")
}

fn user_agent() -> String {
    format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/{CHROMIUM_MAJOR}.0.0.0")
}

/// 32 haneli rastgele hex (bağlantı / istek kimliği; kriptografik olması gerekmez)
fn rand_hex() -> String {
    static N: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let n = N.fetch_add(1, Ordering::Relaxed);
    let local = 0u8;
    let seed = format!("{nanos}-{n}-{}-{:p}", std::process::id(), &local);
    hex_upper(&Sha256::digest(seed.as_bytes())[..16])
}

/// SSML metni için kaçış: & < > ve denetim karakterleri (boşluğa çevrilir)
pub fn xml_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&apos;"),
            c if (c as u32) < 0x20 || c == '\u{7f}' || c == '\u{fffe}' || c == '\u{ffff}' => o.push(' '),
            c => o.push(c),
        }
    }
    o
}

/// Kısa ad geçerli mi ("tr-TR-EmelNeural", "zh-CN-liaoning-XiaobeiNeural"): yalnızca harf, rakam ve tire
pub fn valid_voice(short: &str) -> bool {
    (5..=80).contains(&short.len()) && short.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') && short.split('-').count() >= 3
}

/// "tr-TR-EmelNeural" → "Microsoft Server Speech Text to Speech Voice (tr-TR, EmelNeural)" (edge-tts ile aynı)
pub fn voice_full_name(short: &str) -> String {
    let p: Vec<&str> = short.splitn(3, '-').collect();
    if p.len() != 3 {
        return short.to_string();
    }
    let (lang, mut region, mut name) = (p[0], p[1].to_string(), p[2]);
    if let Some(i) = name.find('-') {
        // ör. zh-CN-liaoning-XiaobeiNeural → (zh-CN-liaoning, XiaobeiNeural)
        region = format!("{region}-{}", &name[..i]);
        name = &name[i + 1..];
    }
    format!("Microsoft Server Speech Text to Speech Voice ({lang}-{region}, {name})")
}

/// Hız -10..10 → SSML yüzdesi (Python uygulamasındaki gibi birim başına %8; SSML sınırı -90..+100)
pub fn rate_pct(rate: f64) -> i32 {
    ((rate * 8.0).round() as i32).clamp(-90, 100)
}

/// Ses tonu -10..10 → Hz farkı (birim başına 5 Hz; -50..+50)
pub fn pitch_hz(pitch: f64) -> i32 {
    ((pitch * 5.0).round() as i32).clamp(-50, 50)
}

/// Ses düzeyi 0..100 → SSML yüzdesi (Python: volume-100). Çalarken ses düzeyi ayrıca uygulanıyorsa 100 verilir.
pub fn volume_pct(volume: f64) -> i32 {
    ((volume - 100.0).round() as i32).clamp(-100, 0)
}

pub fn ssml(text: &str, short: &str, rate: f64, pitch: f64, volume: f64) -> String {
    format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='{}'><prosody pitch='{:+}Hz' rate='{:+}%' volume='{:+}%'>{}</prosody></voice></speak>",
        voice_full_name(short),
        pitch_hz(pitch),
        rate_pct(rate),
        volume_pct(volume),
        xml_escape(text)
    )
}

/// Günden (1970'ten beri) yıl / ay / gün
fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

/// X-Timestamp: "Sat Oct 03 2026 12:00:00 GMT+0000 (Coordinated Universal Time)"
pub fn js_date(unix_secs: i64) -> String {
    let (days, rem) = (unix_secs.div_euclid(86_400), unix_secs.rem_euclid(86_400));
    let (y, m, d) = civil(days);
    format!(
        "{} {} {:02} {} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        DAYS[days.rem_euclid(7) as usize],
        MONTHS[(m - 1) as usize],
        d,
        y,
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

/// HTTP Date başlığı ("Sat, 03 Oct 2026 12:00:00 GMT") → unix saniye
pub fn parse_http_date(s: &str) -> Option<i64> {
    let p: Vec<&str> = s.split_whitespace().collect();
    if p.len() < 5 {
        return None;
    }
    let d: i64 = p[1].parse().ok()?;
    let m = MONTHS.iter().position(|x| x.eq_ignore_ascii_case(p[2]))? as i64 + 1;
    let y: i64 = p[3].parse().ok()?;
    let mut t = p[4].split(':').map(|x| x.parse::<i64>().ok());
    let (h, mi, sec) = (t.next()??, t.next()??, t.next()??);
    Some(days_from_civil(y, m, d) * 86_400 + h * 3600 + mi * 60 + sec)
}

fn config_msg(now: i64) -> String {
    format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"{OUTPUT_FORMAT}\"}}}}}}}}\r\n",
        js_date(now)
    )
}

fn ssml_msg(now: i64, request_id: &str, ssml: &str) -> String {
    format!("X-RequestId:{request_id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n{ssml}", js_date(now))
}

/// İkili çerçeve: ses verisi (`Path:audio` başlıklıysa). Başka yol / bozuk çerçeve: None
pub fn audio_payload(frame: &[u8]) -> Option<&[u8]> {
    if frame.len() < 2 {
        return None;
    }
    let hl = u16::from_be_bytes([frame[0], frame[1]]) as usize;
    if frame.len() < 2 + hl {
        return None;
    }
    let head = String::from_utf8_lossy(&frame[2..2 + hl]);
    head.split("\r\n").any(|l| l.trim().eq_ignore_ascii_case("Path:audio")).then(|| &frame[2 + hl..])
}

/// Metin çerçevesinin `Path` başlığı
fn text_path(msg: &str) -> &str {
    let head = msg.split("\r\n\r\n").next().unwrap_or("");
    head.split("\r\n").find_map(|l| l.strip_prefix("Path:")).map(str::trim).unwrap_or("")
}

enum ConnErr {
    /// 403: saat farkı olabilir (Date başlığı)
    Forbidden(Option<i64>),
    Other(String),
}

async fn connect() -> Result<net::Ws, ConnErr> {
    net::ensure_crypto();
    let url = format!(
        "{WSS_URL}?TrustedClientToken={TRUSTED_CLIENT_TOKEN}&ConnectionId={}&Sec-MS-GEC={}&Sec-MS-GEC-Version={}",
        rand_hex().to_lowercase(),
        sec_ms_gec(unix_now()),
        sec_ms_gec_version()
    );
    let mut req = url.into_client_request().map_err(|e| ConnErr::Other(e.to_string()))?;
    let ua = user_agent();
    let cookie = format!("muid={};", rand_hex());
    for (k, v) in [
        ("Pragma", "no-cache"),
        ("Cache-Control", "no-cache"),
        ("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"),
        ("User-Agent", ua.as_str()),
        ("Accept-Language", "en-US,en;q=0.9"),
        ("Cookie", cookie.as_str()),
    ] {
        if let (Ok(name), Ok(val)) = (tokio_tungstenite::tungstenite::http::header::HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
            req.headers_mut().insert(name, val);
        }
    }
    match tokio_tungstenite::connect_async_tls_with_config(req, None, false, None).await {
        Ok((ws, _)) => Ok(ws),
        Err(tokio_tungstenite::tungstenite::Error::Http(resp)) => {
            let code = resp.status().as_u16();
            if code == 403 {
                let date = resp.headers().get("date").and_then(|v| v.to_str().ok()).and_then(parse_http_date);
                Err(ConnErr::Forbidden(date))
            } else {
                Err(ConnErr::Other(format!("HTTP {code}")))
            }
        }
        Err(e) => Err(ConnErr::Other(e.to_string())),
    }
}

async fn synth_inner(text: &str, short: &str, rate: f64, pitch: f64) -> Result<Vec<u8>, String> {
    let mut ws = match connect().await {
        Ok(ws) => ws,
        Err(ConnErr::Forbidden(date)) => {
            // Bilgisayarın saati yanlışsa sunucu saatine göre düzelt ve bir kez daha dene
            let Some(server) = date else { return Err("HTTP 403".into()) };
            let local = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
            CLOCK_SKEW.store(server - local, Ordering::Relaxed);
            match connect().await {
                Ok(ws) => ws,
                Err(ConnErr::Forbidden(_)) => return Err("HTTP 403".into()),
                Err(ConnErr::Other(e)) => return Err(e),
            }
        }
        Err(ConnErr::Other(e)) => return Err(e),
    };
    let now = unix_now();
    ws.send(Message::text(config_msg(now))).await.map_err(|e| e.to_string())?;
    // Ses düzeyi çalarken uygulanır (canlı ayarlanabilsin): SSML'de tam ses
    ws.send(Message::text(ssml_msg(now, &rand_hex().to_lowercase(), &ssml(text, short, rate, pitch, 100.0)))).await.map_err(|e| e.to_string())?;
    let mut mp3: Vec<u8> = Vec::with_capacity(32 * 1024);
    loop {
        match ws.next().await {
            Some(Ok(Message::Binary(b))) => {
                if let Some(a) = audio_payload(&b) {
                    mp3.extend_from_slice(a);
                    if mp3.len() > 16 * 1024 * 1024 {
                        return Err("ses çok uzun".into());
                    }
                }
            }
            Some(Ok(Message::Text(t))) => {
                if text_path(t.as_str()) == "turn.end" {
                    break;
                }
            }
            Some(Ok(Message::Ping(p))) => {
                let _ = ws.send(Message::Pong(p)).await;
            }
            Some(Ok(Message::Close(_))) | None => break,
            Some(Ok(_)) => {}
            Some(Err(e)) => return Err(e.to_string()),
        }
    }
    let _ = ws.close(None).await;
    if mp3.is_empty() {
        return Err("ses gelmedi (ses adı geçersiz olabilir)".into());
    }
    Ok(mp3)
}

/// Metni MP3 baytlarına çevir (en fazla 10 sn). `short`: ön eksiz ses adı (ör. "tr-TR-AhmetNeural").
pub async fn synth_mp3(text: &str, short: &str, rate: f64, pitch: f64) -> Result<Vec<u8>, String> {
    if !valid_voice(short) {
        return Err("geçersiz ses adı".into());
    }
    if let Some(until) = *DOWN_UNTIL.lock() {
        if Instant::now() < until {
            return Err("az önce bağlanılamadı, kısa süre sonra yeniden denenecek".into());
        }
    }
    let r = match tokio::time::timeout(TIMEOUT, synth_inner(text, short, rate, pitch)).await {
        Ok(r) => r,
        Err(_) => Err("zaman aşımı (10 sn)".into()),
    };
    *DOWN_UNTIL.lock() = if r.is_err() { Some(Instant::now() + COOLDOWN) } else { None };
    r
}

/// Çalma iş parçacığı için: sentezle ve WAV'a çöz (Windows: Media Foundation). Çağıran iş parçacığını en fazla ~10 sn tutar.
pub fn synth_wav_blocking(text: &str, short: &str, rate: f64, pitch: f64) -> Result<Vec<u8>, String> {
    let mp3 = tauri::async_runtime::block_on(synth_mp3(text, short, rate, pitch))?;
    decode_mp3(&mp3)
}

#[cfg(windows)]
fn decode_mp3(mp3: &[u8]) -> Result<Vec<u8>, String> {
    super::mp3_win::decode_mp3(mp3).map_err(|e| format!("MP3 çözülemedi: {e}"))
}

#[cfg(not(windows))]
fn decode_mp3(_mp3: &[u8]) -> Result<Vec<u8>, String> {
    Err("MP3 çözücü bu platformda yok".into())
}

// ---------------------------------------------------------------------------
// Ses listesi
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct EdgeVoice {
    /// "tr-TR-EmelNeural"
    pub short: String,
    /// "tr-TR"
    pub locale: String,
    pub female: bool,
    /// Dilin İngilizce adı ("Turkish (Turkey)"; yerleşik listede boş: arayüz kendi dilinde üretir)
    pub language_name: String,
}

impl EdgeVoice {
    /// Görünen ad: "Emel"
    pub fn display(&self) -> String {
        let n = self.short.rsplit('-').next().unwrap_or(&self.short);
        n.strip_suffix("Neural").unwrap_or(n).to_string()
    }
}

/// Çevrimdışı yedek liste: uygulamanın arayüz dilleri (her biri için kadın + erkek)
const BUILTIN: &[(&str, bool)] = &[
    ("tr-TR-EmelNeural", true),
    ("tr-TR-AhmetNeural", false),
    ("en-US-AriaNeural", true),
    ("en-US-JennyNeural", true),
    ("en-US-GuyNeural", false),
    ("en-GB-SoniaNeural", true),
    ("en-GB-RyanNeural", false),
    ("de-DE-KatjaNeural", true),
    ("de-DE-ConradNeural", false),
    ("es-ES-ElviraNeural", true),
    ("es-ES-AlvaroNeural", false),
    ("fi-FI-NooraNeural", true),
    ("fi-FI-HarriNeural", false),
    ("fr-FR-DeniseNeural", true),
    ("fr-FR-HenriNeural", false),
    ("it-IT-ElsaNeural", true),
    ("it-IT-DiegoNeural", false),
    ("ja-JP-NanamiNeural", true),
    ("ja-JP-KeitaNeural", false),
    ("nl-NL-ColetteNeural", true),
    ("nl-NL-MaartenNeural", false),
    ("pl-PL-ZofiaNeural", true),
    ("pl-PL-MarekNeural", false),
    ("pt-BR-FranciscaNeural", true),
    ("pt-BR-AntonioNeural", false),
    ("pt-PT-RaquelNeural", true),
    ("pt-PT-DuarteNeural", false),
    ("ru-RU-SvetlanaNeural", true),
    ("ru-RU-DmitryNeural", false),
    ("sv-SE-SofieNeural", true),
    ("sv-SE-MattiasNeural", false),
    ("zh-CN-XiaoxiaoNeural", true),
    ("zh-CN-YunxiNeural", false),
];

pub fn builtin_voices() -> Vec<EdgeVoice> {
    BUILTIN
        .iter()
        .map(|(s, f)| EdgeVoice { short: s.to_string(), locale: s.splitn(3, '-').take(2).collect::<Vec<_>>().join("-"), female: *f, language_name: String::new() })
        .collect()
}

/// voices/list yanıtını çöz (bozuk kayıtlar atlanır)
pub fn parse_voices(body: &str) -> Vec<EdgeVoice> {
    let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(body) else { return Vec::new() };
    arr.iter()
        .filter_map(|v| {
            let short = v.get("ShortName")?.as_str()?.to_string();
            if !valid_voice(&short) {
                return None;
            }
            let locale = v.get("Locale").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let female = v.get("Gender").and_then(|x| x.as_str()).is_some_and(|g| g.eq_ignore_ascii_case("female"));
            let language_name = v.get("FriendlyName").and_then(|x| x.as_str()).and_then(|f| f.rsplit_once(" - ")).map(|(_, l)| l.trim().to_string()).unwrap_or_default();
            Some(EdgeVoice { short, locale, female, language_name })
        })
        .collect()
}

async fn fetch_voices() -> Result<Vec<EdgeVoice>, String> {
    let url = format!("{VOICES_URL}?trustedclienttoken={TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC={}&Sec-MS-GEC-Version={}", sec_ms_gec(unix_now()), sec_ms_gec_version());
    let resp = net::http()?
        .get(url)
        .header("User-Agent", user_agent())
        .header("Accept", "*/*")
        .header("Accept-Language", "en-US,en;q=0.9")
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let list = parse_voices(&resp.text().await.map_err(|e| e.to_string())?);
    if list.is_empty() {
        return Err("boş liste".into());
    }
    Ok(list)
}

/// Ses listesi: çevrimiçi liste (12 saat önbellek); alınamazsa yerleşik liste (5 dakika sonra yeniden denenir).
/// İkinci değer: liste çevrimiçi mi alındı.
pub async fn voices() -> (Vec<EdgeVoice>, bool) {
    static CACHE: Mutex<Option<(Instant, bool, Vec<EdgeVoice>)>> = Mutex::new(None);
    if let Some((at, online, list)) = CACHE.lock().as_ref() {
        let ttl = if *online { Duration::from_secs(12 * 3600) } else { Duration::from_secs(300) };
        if at.elapsed() < ttl {
            return (list.clone(), *online);
        }
    }
    let (list, online) = match fetch_voices().await {
        Ok(l) => (l, true),
        Err(_) => (builtin_voices(), false),
    };
    *CACHE.lock() = Some((Instant::now(), online, list.clone()));
    (list, online)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gec_token() {
        // 5 dakikalık dilim içinde aynı, dilim değişince farklı; 64 haneli büyük harf hex
        let a = sec_ms_gec(1_700_000_000);
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_digit() || ('A'..='F').contains(&c)));
        // (1_700_000_000 + 11_644_473_600) % 300 == 200 → dilim 1_699_999_800..1_700_000_099
        assert_eq!(a, sec_ms_gec(1_699_999_800));
        assert_eq!(a, sec_ms_gec(1_700_000_099));
        assert_ne!(a, sec_ms_gec(1_700_000_100));
        assert_ne!(a, sec_ms_gec(1_699_999_799));
        // Karma girdisi: yuvarlanmış dosya zamanı (100 ns) + belirteç
        let expect = hex_upper(&Sha256::digest(format!("133444734000000000{TRUSTED_CLIENT_TOKEN}").as_bytes()));
        assert_eq!(a, expect);
        assert_eq!(sec_ms_gec_version(), format!("1-{CHROMIUM_FULL}"));
        assert_eq!(rand_hex().len(), 32);
        assert_ne!(rand_hex(), rand_hex());
    }

    #[test]
    fn ssml_escape() {
        assert_eq!(xml_escape("a & b <c> \"d\" 'e'\u{1}\n"), "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;  ");
        let s = ssml("Merhaba <dünya> & 'sen'", "tr-TR-AhmetNeural", 2.0, -1.0, 100.0);
        assert!(s.starts_with("<speak version='1.0'"));
        assert!(s.contains("<voice name='Microsoft Server Speech Text to Speech Voice (tr-TR, AhmetNeural)'>"));
        assert!(s.contains("<prosody pitch='-5Hz' rate='+16%' volume='+0%'>Merhaba &lt;dünya&gt; &amp; &apos;sen&apos;</prosody>"));
        assert!(s.ends_with("</prosody></voice></speak>"));
        assert_eq!(voice_full_name("zh-CN-liaoning-XiaobeiNeural"), "Microsoft Server Speech Text to Speech Voice (zh-CN-liaoning, XiaobeiNeural)");
        assert!(valid_voice("tr-TR-EmelNeural"));
        assert!(!valid_voice("tr-TR-Emel'/><x"));
        assert!(!valid_voice("Emel"));
    }

    #[test]
    fn prosody_map() {
        assert_eq!(rate_pct(0.0), 0);
        assert_eq!(rate_pct(10.0), 80);
        assert_eq!(rate_pct(-10.0), -80);
        assert_eq!(rate_pct(50.0), 100);
        assert_eq!(rate_pct(-50.0), -90);
        assert_eq!(pitch_hz(10.0), 50);
        assert_eq!(volume_pct(80.0), -20);
        assert_eq!(volume_pct(100.0), 0);
        assert_eq!(volume_pct(0.0), -100);
    }

    #[test]
    fn dates_and_frames() {
        assert_eq!(js_date(0), "Thu Jan 01 1970 00:00:00 GMT+0000 (Coordinated Universal Time)");
        assert_eq!(js_date(1_700_000_000), "Tue Nov 14 2023 22:13:20 GMT+0000 (Coordinated Universal Time)");
        assert_eq!(parse_http_date("Tue, 14 Nov 2023 22:13:20 GMT"), Some(1_700_000_000));
        assert_eq!(parse_http_date("bozuk"), None);
        let head = b"X-RequestId:abc\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n";
        let mut frame = (head.len() as u16).to_be_bytes().to_vec();
        frame.extend_from_slice(head);
        frame.extend_from_slice(&[1, 2, 3]);
        assert_eq!(audio_payload(&frame), Some(&[1u8, 2, 3][..]));
        assert_eq!(audio_payload(&[0, 9, 1]), None);
        assert_eq!(text_path("X-RequestId:abc\r\nContent-Type:application/json\r\nPath:turn.end\r\n\r\n{}"), "turn.end");
        assert!(config_msg(0).contains("Path:speech.config\r\n\r\n{\"context\""));
        assert!(config_msg(0).contains(OUTPUT_FORMAT));
        assert!(ssml_msg(0, "id", "<speak/>").ends_with("Path:ssml\r\n\r\n<speak/>"));
    }

    #[test]
    fn voice_lists() {
        let b = builtin_voices();
        assert!(b.iter().any(|v| v.short == "tr-TR-EmelNeural" && v.female && v.locale == "tr-TR"));
        assert!(b.iter().any(|v| v.short == "tr-TR-AhmetNeural" && !v.female));
        for l in ["tr", "en", "de", "es", "fi", "fr", "it", "ja", "nl", "pl", "pt", "ru", "sv", "zh"] {
            assert!(b.iter().filter(|v| v.locale.starts_with(l)).count() >= 2, "{l}");
        }
        assert_eq!(b[0].display(), "Emel");
        let body = r#"[{"Name":"x","ShortName":"tr-TR-EmelNeural","Gender":"Female","Locale":"tr-TR","FriendlyName":"Microsoft Emel Online (Natural) - Turkish (Turkey)"},{"ShortName":"bad name"}]"#;
        let p = parse_voices(body);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].language_name, "Turkish (Turkey)");
        assert!(p[0].female);
    }
}
