//! Ağ yardımcıları: tarayıcı gibi görünen HTTP istemcisi, websocket bağlantısı, artan bekleme.

use std::sync::OnceLock;
use std::time::Duration;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;

pub type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

pub const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/// rustls'in şifreleme sağlayıcısı (ring) süreç başına bir kez kurulur (bkz. voicepack_dl.rs)
pub fn ensure_crypto() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

/// Ortak HTTP istemcisi (çerez/yönlendirme: tarayıcı gibi)
pub fn http() -> Result<reqwest::Client, String> {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = C.get() {
        return Ok(c.clone());
    }
    ensure_crypto();
    let c = reqwest::Client::builder()
        .user_agent(BROWSER_UA)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(C.get_or_init(|| c).clone())
}

/// Websocket bağlantısı (wss: rustls + işletim sistemi sertifikaları). `headers`: ek başlıklar (Origin, User-Agent…)
pub async fn ws_connect(url: &str, headers: &[(&str, &str)]) -> Result<Ws, String> {
    ensure_crypto();
    let mut req = url.into_client_request().map_err(|e| e.to_string())?;
    for (k, v) in headers {
        if let (Ok(name), Ok(val)) = (
            tokio_tungstenite::tungstenite::http::header::HeaderName::from_bytes(k.as_bytes()),
            HeaderValue::from_str(v),
        ) {
            req.headers_mut().insert(name, val);
        }
    }
    let fut = tokio_tungstenite::connect_async_tls_with_config(req, None, false, None);
    match tokio::time::timeout(Duration::from_secs(20), fut).await {
        Ok(Ok((ws, _))) => Ok(ws),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("zaman aşımı".into()),
    }
}

/// Artan bekleme: 2 → 4 → … → en fazla `max` saniye; bağlantı sağlıklı olunca `reset`
pub struct Backoff {
    cur: u64,
    min: u64,
    max: u64,
}

impl Backoff {
    pub fn new(min: u64, max: u64) -> Backoff {
        Backoff { cur: min, min, max }
    }
    pub fn reset(&mut self) {
        self.cur = self.min;
    }
    /// Sıradaki bekleme süresi (her çağrıda ikiye katlanır)
    pub fn next(&mut self) -> Duration {
        let d = self.cur;
        self.cur = (self.cur * 2).min(self.max);
        Duration::from_secs(d)
    }
}

/// Yerel tarih ve saat: ("2026-10-01", "15:13:22")
pub fn local_date_time() -> (String, String) {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::SystemInformation::GetLocalTime;
        let mut t = std::mem::zeroed();
        GetLocalTime(&mut t);
        return (
            format!("{:04}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay),
            format!("{:02}:{:02}:{:02}", t.wHour, t.wMinute, t.wSecond),
        );
    }
    #[allow(unreachable_code)]
    {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0) as i64;
        let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
        let z = days + 719468;
        let era = z.div_euclid(146097);
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + i64::from(m <= 2);
        (format!("{y:04}-{m:02}-{d:02}"), format!("{:02}:{:02}:{:02}", rem / 3600, rem % 3600 / 60, rem % 60))
    }
}

/// JSON değerinden metin ("12" / 12 → "12")
pub fn json_str(v: Option<&serde_json::Value>) -> String {
    match v {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        Some(serde_json::Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

/// JSON değerinden sayı ("12", 12, "1.2k" → 1200)
pub fn json_u64(v: Option<&serde_json::Value>) -> Option<u64> {
    match v? {
        serde_json::Value::Number(n) => n.as_u64().or_else(|| n.as_f64().map(|f| f.max(0.0) as u64)),
        serde_json::Value::String(s) => parse_count(s),
        _ => None,
    }
}

/// "1.234" / "1,2k" / "3M" / "12 izliyor" → sayı
pub fn parse_count(s: &str) -> Option<u64> {
    let t = s.trim().to_lowercase();
    let mult = if t.ends_with('k') {
        1000.0
    } else if t.ends_with('m') {
        1_000_000.0
    } else {
        1.0
    };
    if mult > 1.0 {
        let num: String = t.trim_end_matches(['k', 'm']).trim().replace(',', ".");
        if let Ok(f) = num.parse::<f64>() {
            return Some((f * mult) as u64);
        }
    }
    let digits: String = t.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counts() {
        assert_eq!(parse_count("1.234"), Some(1234));
        assert_eq!(parse_count("1,2k"), Some(1200));
        assert_eq!(parse_count("3M"), Some(3_000_000));
        assert_eq!(parse_count("12 watching now"), Some(12));
        assert_eq!(parse_count("yok"), None);
        let mut b = Backoff::new(2, 10);
        assert_eq!(b.next().as_secs(), 2);
        assert_eq!(b.next().as_secs(), 4);
        assert_eq!(b.next().as_secs(), 8);
        assert_eq!(b.next().as_secs(), 10);
        b.reset();
        assert_eq!(b.next().as_secs(), 2);
        let (d, t) = local_date_time();
        assert_eq!(d.len(), 10);
        assert_eq!(t.len(), 8);
    }
}
