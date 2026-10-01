//! Sohbet kaydı görüntüleyici (PRO: `livechat.log`).
//!
//! Kayıtları mod.rs yazar: <app_data>/livechat/logs/YYYY-MM-DD.txt, satır: `[SS:DD:ss] [Etiket] Ad: metin`
//! (etiket: "Twitch", "YouTube Kanal Adı", "ANKET", "MOD", altyazı kaynağı…). Bu modül o dosyaları listeler,
//! ayrıştırır, tüm günlerde arar, dışa aktarır (txt / csv), siler ve saklama süresini uygular.
//! Kayıt tutmak (yazmak) ve silmek herkese açık; görüntüleme, arama ve dışa aktarma PRO.

use super::allowed;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use tauri::AppHandle;

pub const FEATURE: &str = "livechat.log";
const LOCKED: &str = "Sohbet kaydını görüntülemek PRO üyelere özel";
/// Tek seferde dönen en fazla satır (arama)
const SEARCH_LIMIT: usize = 1000;

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    /// Dosyadaki satır numarası (0'dan)
    pub n: usize,
    /// "SS:DD:ss"
    pub time: String,
    /// "youtube" | "twitch" | "kick" | "streamlabs" | "system" | "" (anket, moderasyon, altyazı…)
    pub platform: String,
    /// Kanal adı (etikette varsa) ya da platform dışı etiketin kendisi (ör. "ANKET")
    pub channel: String,
    pub user: String,
    pub text: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogDay {
    /// "YYYY-MM-DD"
    pub date: String,
    pub bytes: u64,
    pub lines: usize,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogHit {
    pub date: String,
    #[serde(flatten)]
    pub line: LogLine,
}

const PLATFORMS: [(&str, &str); 5] = [("YouTube", "youtube"), ("Twitch", "twitch"), ("Kick", "kick"), ("Streamlabs", "streamlabs"), ("Sistem", "system")];

/// `[SS:DD:ss] [Etiket] Ad: metin` satırını ayrıştırır (biçime uymayan satır düz metin olarak döner)
pub fn parse_line(n: usize, raw: &str) -> LogLine {
    let mut out = LogLine { n, ..Default::default() };
    let mut rest = raw.trim_end();
    if let Some(r) = rest.strip_prefix('[') {
        if let Some(i) = r.find("] ") {
            if i == 8 && r.as_bytes()[2] == b':' {
                out.time = r[..i].to_string();
                rest = &r[i + 2..];
            }
        }
    }
    let Some(r) = rest.strip_prefix('[') else {
        out.text = rest.to_string();
        return out;
    };
    let Some(i) = r.find("] ") else {
        out.text = rest.to_string();
        return out;
    };
    let tag = &r[..i];
    let body = &r[i + 2..];
    match PLATFORMS.iter().find(|(name, _)| tag == *name || tag.starts_with(&format!("{name} "))) {
        Some((name, id)) => {
            out.platform = (*id).to_string();
            out.channel = tag[name.len()..].trim().to_string();
            match body.split_once(": ") {
                Some((u, t)) if !u.is_empty() && u.chars().count() <= 80 => {
                    out.user = u.to_string();
                    out.text = t.to_string();
                }
                _ => out.text = body.to_string(),
            }
        }
        None => {
            out.channel = tag.to_string();
            out.text = body.to_string();
        }
    }
    out
}

pub fn parse_file(text: &str) -> Vec<LogLine> {
    text.lines().enumerate().filter(|(_, l)| !l.trim().is_empty()).map(|(n, l)| parse_line(n, l)).collect()
}

fn valid_date(d: &str) -> bool {
    let b = d.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// 1970-01-01'den bu yana gün (takvim tarihi → gün sayısı)
pub fn day_number(date: &str) -> Option<i64> {
    if !valid_date(date) {
        return None;
    }
    let y: i64 = date[..4].parse().ok()?;
    let m: i64 = date[5..7].parse().ok()?;
    let d: i64 = date[8..10].parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + doe - 719468)
}

/// Klasördeki kayıt günleri (yeniden eskiye)
fn list_dates(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut v: Vec<(String, PathBuf)> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let stem = p.file_stem()?.to_str()?.to_string();
            (p.extension().and_then(|x| x.to_str()) == Some("txt") && valid_date(&stem)).then_some((stem, p))
        })
        .collect();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    v
}

/// Saklama süresi: `days` günden eski dosyaları siler (0: sınırsız). Döner: silinen dosya sayısı.
pub fn prune_dir(dir: &Path, today: &str, days: i64) -> usize {
    if days <= 0 {
        return 0;
    }
    let Some(now) = day_number(today) else { return 0 };
    let mut n = 0;
    for (date, path) in list_dates(dir) {
        if day_number(&date).is_some_and(|d| now - d >= days) && std::fs::remove_file(path).is_ok() {
            n += 1;
        }
    }
    n
}

static PRUNED_KEY: AtomicI64 = AtomicI64::new(-1);

/// Ayarlar değişince ve yeni gün dosyası açılınca: saklama süresini uygula (aynı gün + aynı süre için bir kez)
pub fn prune(app: &AppHandle, days: i64) {
    let (today, _) = super::net::local_date_time();
    let key = day_number(&today).unwrap_or(0) * 100_000 + days.clamp(0, 99_999);
    if PRUNED_KEY.swap(key, Ordering::Relaxed) == key {
        return;
    }
    if let Some(dir) = super::logs_dir(app) {
        prune_dir(&dir, &today, days);
    }
}

fn file_of(app: &AppHandle, date: &str) -> Result<PathBuf, String> {
    if !valid_date(date) {
        return Err("Geçersiz tarih".into());
    }
    Ok(super::logs_dir(app).ok_or("klasör yok")?.join(format!("{date}.txt")))
}

fn csv_cell(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

pub fn to_csv(date: &str, lines: &[LogLine]) -> String {
    // BOM: Excel Türkçe karakterleri doğru açsın
    let mut out = String::from("\u{feff}tarih,saat,platform,kanal,kullanici,mesaj\r\n");
    for l in lines {
        out.push_str(&[date, &l.time, &l.platform, &l.channel, &l.user, &l.text].map(csv_cell).join(","));
        out.push_str("\r\n");
    }
    out
}

/// Arama süzgeci: metin (küçük harf, ad ya da mesajda), platform, kullanıcı (tam ad)
fn matches(l: &LogLine, q: &str, platform: &str, user: &str) -> bool {
    if !platform.is_empty() && l.platform != platform {
        return false;
    }
    if !user.is_empty() && l.user.to_lowercase() != user {
        return false;
    }
    q.is_empty() || l.text.to_lowercase().contains(q) || l.user.to_lowercase().contains(q)
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

/// Kayıt günleri (yeniden eskiye). PRO değilse de döner (liste boş değil bilgisi ve silme için); içerik PRO.
#[tauri::command]
pub async fn livechat_log_days(app: AppHandle) -> Vec<LogDay> {
    let Some(dir) = super::logs_dir(&app) else { return vec![] };
    tauri::async_runtime::spawn_blocking(move || {
        list_dates(&dir)
            .into_iter()
            .map(|(date, p)| {
                let bytes = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                let lines = std::fs::read(&p).map(|b| b.iter().filter(|c| **c == b'\n').count()).unwrap_or(0);
                LogDay { date, bytes, lines }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Bir günün tüm satırları (ayrıştırılmış)
#[tauri::command]
pub async fn livechat_log_read(app: AppHandle, date: String) -> Result<Vec<LogLine>, String> {
    if !allowed(&app, FEATURE) {
        return Err(LOCKED.into());
    }
    let p = file_of(&app, &date)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&p).map_err(|_| "Bu güne ait kayıt yok".to_string())?;
        Ok(parse_file(&String::from_utf8_lossy(&bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Tüm günlerde arama (yeniden eskiye, en fazla 1000 sonuç). user: tam kullanıcı adı (büyük/küçük harf ayırmaz)
#[tauri::command]
pub async fn livechat_log_search(app: AppHandle, query: String, platform: Option<String>, user: Option<String>) -> Result<Vec<LogHit>, String> {
    if !allowed(&app, FEATURE) {
        return Err(LOCKED.into());
    }
    let dir = super::logs_dir(&app).ok_or("klasör yok")?;
    let q = query.trim().to_lowercase();
    let platform = platform.unwrap_or_default();
    let user = user.unwrap_or_default().trim().to_lowercase();
    if q.is_empty() && user.is_empty() {
        return Ok(vec![]);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut out: Vec<LogHit> = Vec::new();
        for (date, p) in list_dates(&dir) {
            let Ok(bytes) = std::fs::read(&p) else { continue };
            for l in parse_file(&String::from_utf8_lossy(&bytes)) {
                if matches(&l, &q, &platform, &user) {
                    out.push(LogHit { date: date.clone(), line: l });
                    if out.len() >= SEARCH_LIMIT {
                        return out;
                    }
                }
            }
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

/// Kayıtları sil: date verilirse o gün, verilmezse hepsi. Döner: silinen dosya sayısı. (PRO gerekmez)
#[tauri::command]
pub fn livechat_log_delete(app: AppHandle, date: Option<String>) -> Result<usize, String> {
    let dir = super::logs_dir(&app).ok_or("klasör yok")?;
    let mut n = 0;
    for (d, p) in list_dates(&dir) {
        if date.as_deref().map_or(true, |x| x == d) && std::fs::remove_file(&p).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}

/// Bir günü İndirilenler klasörüne dışa aktar (format: "txt" | "csv"); dosya yolunu döner ve klasörü açar
#[tauri::command]
pub fn livechat_log_export(app: AppHandle, date: String, format: String) -> Result<String, String> {
    use tauri::Manager;
    if !allowed(&app, FEATURE) {
        return Err(LOCKED.into());
    }
    let src = file_of(&app, &date)?;
    let bytes = std::fs::read(&src).map_err(|_| "Bu güne ait kayıt yok".to_string())?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    let csv = format == "csv";
    let dir = app.path().download_dir().or_else(|_| app.path().document_dir()).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("srtr-sohbet-{date}.{}", if csv { "csv" } else { "txt" }));
    let data = if csv { to_csv(&date, &parse_file(&text)) } else { text };
    std::fs::write(&out, data).map_err(|e| e.to_string())?;
    let _ = crate::open_path(&dir);
    Ok(out.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse() {
        let l = parse_line(3, "[12:34:56] [Twitch Erkin] Veli: selam: nasılsın");
        assert_eq!(l, LogLine { n: 3, time: "12:34:56".into(), platform: "twitch".into(), channel: "Erkin".into(), user: "Veli".into(), text: "selam: nasılsın".into() });
        let l = parse_line(0, "[01:02:03] [YouTube] Ali: merhaba");
        assert_eq!((l.platform.as_str(), l.channel.as_str(), l.user.as_str(), l.text.as_str()), ("youtube", "", "Ali", "merhaba"));
        let l = parse_line(0, "[01:02:03] [ANKET] Sonuç — 2 | 1: 3, 2: 5");
        assert_eq!((l.platform.as_str(), l.channel.as_str(), l.user.as_str()), ("", "ANKET", ""));
        assert_eq!(l.text, "Sonuç — 2 | 1: 3, 2: 5");
        let l = parse_line(0, "[01:02:03] [MOD] veli engellendi");
        assert_eq!((l.channel.as_str(), l.text.as_str()), ("MOD", "veli engellendi"));
        let l = parse_line(0, "bozuk satır");
        assert_eq!((l.time.as_str(), l.text.as_str()), ("", "bozuk satır"));
        assert_eq!(parse_file("[01:02:03] [Kick] a: b\n\n[01:02:04] [Kick] c: d\n").len(), 2);
    }

    #[test]
    fn dates_and_csv() {
        assert_eq!(day_number("1970-01-01"), Some(0));
        assert_eq!(day_number("2026-03-01").unwrap() - day_number("2026-02-01").unwrap(), 28);
        assert_eq!(day_number("2024-03-01").unwrap() - day_number("2024-02-01").unwrap(), 29);
        assert_eq!(day_number("2026-3-1"), None);
        assert_eq!(day_number("../../x.txt"), None);
        let l = parse_line(0, "[01:02:03] [Twitch] Ali: \"selam\", dedi");
        let csv = to_csv("2026-01-02", &[l.clone()]);
        assert!(csv.ends_with("\"2026-01-02\",\"01:02:03\",\"twitch\",\"\",\"Ali\",\"\"\"selam\"\", dedi\"\r\n"));
        assert!(matches(&l, "selam", "", ""));
        assert!(matches(&l, "", "twitch", "ali"));
        assert!(!matches(&l, "", "kick", ""));
        assert!(!matches(&l, "", "", "veli"));
    }

    #[test]
    fn retention() {
        let dir = std::env::temp_dir().join(format!("pitwall-chatlog-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for d in ["2026-01-01", "2026-01-20", "2026-01-31"] {
            std::fs::write(dir.join(format!("{d}.txt")), "x\n").unwrap();
        }
        std::fs::write(dir.join("notlar.txt"), "x").unwrap();
        assert_eq!(prune_dir(&dir, "2026-01-31", 0), 0);
        assert_eq!(prune_dir(&dir, "2026-01-31", 30), 1);
        let left: Vec<String> = list_dates(&dir).into_iter().map(|x| x.0).collect();
        assert_eq!(left, vec!["2026-01-31".to_string(), "2026-01-20".to_string()]);
        assert!(dir.join("notlar.txt").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
