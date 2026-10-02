//! Ses paketi indirme ve kurma.
//!
//! Paketler (yöneticinin GitHub Releases'e yüklediği zip'ler) `voicepacks/.<id>.download.zip` geçici
//! dosyasına akıtılarak indirilir (yönlendirmeler izlenir), SHA-256 ve boyut doğrulanır, zip denetlenir
//! (pack.json kökte ya da bir klasör içinde olmalı; zip-slip korumalı yollar; sadece .wav/.ogg/.json/.txt/.md)
//! ve `voicepacks/<id>.tmp` klasörüne açılır. Sonra eski sürüm `<id>.old` yapılıp yeni klasör `<id>` olarak
//! yerine konur (yarıda kalırsa eski sürüm geri gelir).
//!
//! İlerleme: "voicepack-progress" olayı {id, received, total, stage: download|verify|extract|done|error, error?}.
//! İptal: `voice_pack_cancel(id)`.

use crate::voicepack::{self, InstalledPack, PackMeta};
use parking_lot::Mutex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// İzin verilen dosya uzantıları (paket içinde)
const ALLOWED: [&str; 5] = ["wav", "ogg", "json", "txt", "md"];
/// Zip bombasına karşı sınırlar
const MAX_ENTRIES: usize = 60_000;
const MAX_UNPACKED: u64 = 6 * 1024 * 1024 * 1024;
/// Yöneticinin "Bağlantıdan doldur" denetimi için kimlik
pub const PROBE_ID: &str = "__probe";

static CANCEL: Mutex<Option<HashMap<String, Arc<AtomicBool>>>> = parking_lot::const_mutex(None);

/// Bu iş için yeni bir iptal bayrağı (aynı kimlikle süren iş varsa hata)
pub(crate) fn cancel_flag(id: &str) -> Result<Arc<AtomicBool>, String> {
    let mut g = CANCEL.lock();
    let map = g.get_or_insert_with(HashMap::new);
    if map.contains_key(id) {
        return Err("Bu paket için zaten süren bir işlem var".into());
    }
    let f = Arc::new(AtomicBool::new(false));
    map.insert(id.to_string(), f.clone());
    Ok(f)
}

pub(crate) fn cancel_done(id: &str) {
    if let Some(m) = CANCEL.lock().as_mut() {
        m.remove(id);
    }
}

const CANCELLED: &str = "İptal edildi";

#[tauri::command]
pub fn voice_pack_cancel(id: String) {
    if let Some(f) = CANCEL.lock().as_ref().and_then(|m| m.get(&id)) {
        f.store(true, Ordering::Relaxed);
    }
}

/// Disk dolu hatasını anlaşılır yaz
pub(crate) fn io_err(e: std::io::Error) -> String {
    let full = match e.raw_os_error() {
        #[cfg(windows)]
        Some(112) | Some(39) => true,
        #[cfg(unix)]
        Some(28) => true,
        _ => false,
    };
    if full {
        "Diskte yeterli boş yer yok".into()
    } else {
        e.to_string()
    }
}

/// Paket kimliği: harf, rakam, - _ . (klasör adı olarak güvenli)
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && !id.starts_with('.')
        && !id.starts_with('_')
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !id.ends_with(".tmp")
        && !id.ends_with(".old")
}

#[derive(Serialize, Clone)]
struct Progress<'a> {
    id: &'a str,
    received: u64,
    total: u64,
    stage: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn emit(app: &AppHandle, id: &str, received: u64, total: u64, stage: &str, error: Option<String>) {
    let _ = app.emit("voicepack-progress", Progress { id, received, total, stage, error });
}

fn client() -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("SRTR-Pitwall/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())
}

/// `url`'yi `dest` dosyasına indir; (bayt, sha256 hex) döner
async fn download(
    app: &AppHandle,
    id: &str,
    url: &str,
    dest: &Path,
    expected_size: Option<u64>,
    cancel: &AtomicBool,
) -> Result<(u64, String), String> {
    if !url.trim().starts_with("https://") {
        return Err("Bağlantı https:// ile başlamalı".into());
    }
    let mut resp = client()?
        .get(url.trim())
        .send()
        .await
        .map_err(|e| format!("İndirilemedi: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Sunucu yanıtı: {}", resp.status()));
    }
    let total = resp.content_length().or(expected_size).unwrap_or(0);
    let mut file = std::fs::File::create(dest).map_err(io_err)?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last = Instant::now();
    emit(app, id, 0, total, "download", None);
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.into());
        }
        let chunk = match resp.chunk().await {
            Ok(Some(c)) => c,
            Ok(None) => break,
            Err(e) => return Err(format!("İndirme yarıda kaldı: {e}")),
        };
        hasher.update(&chunk);
        file.write_all(&chunk).map_err(io_err)?;
        received += chunk.len() as u64;
        if received > MAX_UNPACKED {
            return Err("Dosya çok büyük".into());
        }
        if last.elapsed() >= Duration::from_millis(200) {
            last = Instant::now();
            emit(app, id, received, total, "download", None);
        }
    }
    file.flush().map_err(io_err)?;
    drop(file);
    emit(app, id, received, total.max(received), "download", None);
    let sha = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect::<String>();
    Ok((received, sha))
}

// ---------------------------------------------------------------------------
// Zip denetimi ve açma
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ZipScan {
    /// pack.json'un bulunduğu klasör ("" = kök, "X/" = bir klasör içinde)
    pub prefix: String,
    pub meta: PackMeta,
    pub phrases: usize,
    pub files: usize,
    pub unpacked: u64,
    /// Atlanacak (izin verilmeyen) dosya sayısı
    pub skipped: usize,
    pub format: String,
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn is_junk(p: &Path) -> bool {
    p.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s == "__MACOSX" || s.starts_with("._") || s == ".DS_Store"
    })
}

/// Zip'i denetle: pack.json nerede, kaç ifade / kayıt var
pub fn scan_zip(path: &Path) -> Result<ZipScan, String> {
    let f = std::fs::File::open(path).map_err(io_err)?;
    let mut z = zip::ZipArchive::new(f).map_err(|_| "Geçerli bir zip dosyası değil".to_string())?;
    if z.len() > MAX_ENTRIES {
        return Err("Zip'te çok fazla dosya var".into());
    }
    let mut prefix: Option<String> = None;
    let mut names: Vec<PathBuf> = Vec::with_capacity(z.len());
    let mut unpacked = 0u64;
    for i in 0..z.len() {
        let e = z.by_index_raw(i).map_err(|e| e.to_string())?;
        if e.is_dir() {
            continue;
        }
        let Some(p) = e.enclosed_name() else {
            return Err(format!("Zip'te güvenli olmayan bir yol var: {}", e.name()));
        };
        if is_junk(&p) {
            continue;
        }
        unpacked += e.size();
        let comps: Vec<String> = p.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
        if comps.last().map(|s| s.eq_ignore_ascii_case("pack.json")).unwrap_or(false) {
            let pre = match comps.len() {
                1 => Some(String::new()),
                2 => Some(format!("{}/", comps[0])),
                _ => None,
            };
            if let Some(pre) = pre {
                // Kökteki pack.json önceliklidir
                if prefix.as_ref().map(|x| !x.is_empty()).unwrap_or(true) {
                    prefix = Some(pre);
                }
            }
        }
        names.push(p);
    }
    if unpacked > MAX_UNPACKED {
        return Err("Paket açıldığında çok büyük".into());
    }
    let prefix = prefix.ok_or("Zip'te pack.json yok (kökte ya da bir klasörün içinde olmalı)")?;
    let mut meta = PackMeta::default();
    {
        let name = format!("{prefix}pack.json");
        let idx = (0..z.len()).find(|&i| {
            z.by_index_raw(i)
                .ok()
                .and_then(|e| e.enclosed_name())
                .map(|p| p.to_string_lossy().replace('\\', "/").eq_ignore_ascii_case(&name))
                .unwrap_or(false)
        });
        if let Some(i) = idx {
            let mut e = z.by_index(i).map_err(|e| e.to_string())?;
            let mut s = String::new();
            e.by_ref().take(64 * 1024).read_to_string(&mut s).map_err(|_| "pack.json okunamadı".to_string())?;
            meta = serde_json::from_str(s.trim_start_matches('\u{feff}')).map_err(|_| "pack.json geçersiz".to_string())?;
        }
    }
    let mut phrases = std::collections::HashSet::new();
    let (mut files, mut skipped) = (0usize, 0usize);
    let (mut wav, mut ogg) = (0usize, 0usize);
    let pre_path = PathBuf::from(prefix.trim_end_matches('/'));
    for p in &names {
        let ext = ext_of(p);
        if !ALLOWED.contains(&ext.as_str()) {
            skipped += 1;
            continue;
        }
        if ext == "wav" || ext == "ogg" {
            let rel = if prefix.is_empty() { p.as_path() } else { p.strip_prefix(&pre_path).unwrap_or(p) };
            // kategori/ifade/dosya
            if rel.components().count() == 3 {
                files += 1;
                if ext == "wav" {
                    wav += 1
                } else {
                    ogg += 1
                }
                if let Some(parent) = rel.parent() {
                    phrases.insert(parent.to_path_buf());
                }
            }
        }
    }
    if files == 0 {
        return Err("Zip'te ses kaydı yok (kategori/ifade/1.wav düzeni bekleniyor)".into());
    }
    let format = if ogg > 0 && wav > 0 {
        "mixed"
    } else if ogg > 0 {
        "ogg"
    } else {
        "wav"
    };
    Ok(ZipScan { prefix, meta, phrases: phrases.len(), files, unpacked, skipped, format: format.into() })
}

/// Zip'i `dest` klasörüne aç (sadece `prefix` altındakiler, izin verilen uzantılar). Paket kökünü döner.
fn extract(app: &AppHandle, id: &str, zip_path: &Path, scan: &ZipScan, dest: &Path, cancel: &AtomicBool) -> Result<PathBuf, String> {
    let f = std::fs::File::open(zip_path).map_err(io_err)?;
    let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dest).map_err(io_err)?;
    let pre = PathBuf::from(scan.prefix.trim_end_matches('/'));
    let total = scan.unpacked.max(1);
    let mut done = 0u64;
    let mut last = Instant::now();
    let mut buf = vec![0u8; 256 * 1024];
    for i in 0..z.len() {
        if cancel.load(Ordering::Relaxed) {
            return Err(CANCELLED.into());
        }
        let mut e = z.by_index(i).map_err(|e| e.to_string())?;
        if e.is_dir() {
            continue;
        }
        let Some(p) = e.enclosed_name() else { continue };
        if is_junk(&p) || !ALLOWED.contains(&ext_of(&p).as_str()) {
            continue;
        }
        let rel = if scan.prefix.is_empty() {
            p.clone()
        } else {
            match p.strip_prefix(&pre) {
                Ok(r) => r.to_path_buf(),
                Err(_) => continue,
            }
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = dest.join(&rel);
        if !out.starts_with(dest) {
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(io_err)?;
        }
        let mut w = std::fs::File::create(&out).map_err(io_err)?;
        let mut written = 0u64;
        loop {
            let n = e.read(&mut buf).map_err(|e| format!("Zip açılamadı: {e}"))?;
            if n == 0 {
                break;
            }
            written += n as u64;
            if written > e.size().max(1) * 2 + 1024 * 1024 {
                return Err("Zip içeriği bildirilen boyutu aşıyor".into());
            }
            w.write_all(&buf[..n]).map_err(io_err)?;
        }
        done += written;
        if last.elapsed() >= Duration::from_millis(200) {
            last = Instant::now();
            emit(app, id, done.min(total), total, "extract", None);
        }
    }
    voicepack::find_root(dest).ok_or_else(|| "Paket düzeni bulunamadı (spotter, numbers… klasörleri yok)".to_string())
}

/// Windows'ta çalınan bir dosya klasörü kısa süre kilitleyebilir: birkaç kez dene
fn rename_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut last = None;
    for _ in 0..10 {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => last = Some(e),
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Err(last.unwrap())
}

fn install_blocking(app: &AppHandle, id: &str, zip_path: &Path, base: &Path, cancel: &AtomicBool) -> Result<InstalledPack, String> {
    emit(app, id, 0, 0, "verify", None);
    let scan = scan_zip(zip_path)?;
    let tmp = base.join(format!("{id}.tmp"));
    let old = base.join(format!("{id}.old"));
    let fin = base.join(id);
    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::remove_dir_all(&old);
    let res = (|| -> Result<(), String> {
        let root = extract(app, id, zip_path, &scan, &tmp, cancel)?;
        if root != tmp {
            // pack.json'lu klasör bulundu ama kategoriler bir alt düzeydeyse: paket klasörü yine tmp kalır
            // (voicepack::find_root iki alt düzeye kadar bakar)
        }
        if fin.exists() {
            rename_retry(&fin, &old).map_err(|e| format!("Eski sürüm kaldırılamadı (ses çalıyor olabilir): {}", io_err(e)))?;
        }
        if let Err(e) = rename_retry(&tmp, &fin) {
            if old.exists() {
                let _ = std::fs::rename(&old, &fin);
            }
            return Err(io_err(e));
        }
        let _ = std::fs::remove_dir_all(&old);
        Ok(())
    })();
    if let Err(e) = res {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(e);
    }
    // Kimlik klasör adından gelir; pack.json'daki id farklıysa düzelt
    let pj = fin.join("pack.json");
    if let Ok(t) = std::fs::read_to_string(&pj) {
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(t.trim_start_matches('\u{feff}')) {
            if v.get("id").and_then(|x| x.as_str()) != Some(id) {
                v["id"] = serde_json::Value::String(id.to_string());
                let _ = std::fs::write(&pj, serde_json::to_string_pretty(&v).unwrap_or_default());
            }
        }
    }
    voicepack::installed(base)
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Paket kuruldu ama okunamadı".to_string())
}

/// Ses paketini indir ve kur (aynı kimlikteki eski sürümün yerine)
#[tauri::command]
pub async fn voice_pack_install(
    app: AppHandle,
    url: String,
    id: String,
    expected_sha256: Option<String>,
    expected_size: Option<u64>,
) -> Result<InstalledPack, String> {
    if !valid_id(&id) {
        return Err("Geçersiz paket kimliği".into());
    }
    let base = voicepack::voicepacks_dir(&app).ok_or("Uygulama veri klasörü bulunamadı")?;
    std::fs::create_dir_all(&base).map_err(io_err)?;
    let cancel = cancel_flag(&id)?;
    let zip_path = base.join(format!(".{id}.download.zip"));
    let res = async {
        let (size, sha) = download(&app, &id, &url, &zip_path, expected_size.filter(|&n| n > 0), &cancel).await?;
        emit(&app, &id, size, size, "verify", None);
        if let Some(n) = expected_size.filter(|&n| n > 0) {
            if n != size {
                return Err(format!("Dosya boyutu tutmuyor ({size} / {n} bayt). Bağlantı değişmiş olabilir."));
            }
        }
        if let Some(h) = expected_sha256.as_deref().map(str::trim).filter(|h| !h.is_empty()) {
            if !h.eq_ignore_ascii_case(&sha) {
                return Err("Dosya doğrulanamadı (SHA-256 tutmuyor). Bağlantı değişmiş ya da indirme bozulmuş olabilir.".into());
            }
        }
        let (app2, id2, zp, b2, c2) = (app.clone(), id.clone(), zip_path.clone(), base.clone(), cancel.clone());
        tauri::async_runtime::spawn_blocking(move || install_blocking(&app2, &id2, &zp, &b2, &c2))
            .await
            .map_err(|e| e.to_string())?
    }
    .await;
    let _ = std::fs::remove_file(&zip_path);
    cancel_done(&id);
    match &res {
        Ok(p) => {
            emit(&app, &id, 1, 1, "done", None);
            // Ses motoru yeni dosyaları görsün (paket önbelleği yenilenir)
            let _ = p;
            voicepack::PACK_GEN.fetch_add(1, Ordering::Relaxed);
            if let Some(v) = crate::current_settings(&app) {
                crate::push_voice_cfg(&app, &v);
            }
        }
        Err(e) => emit(&app, &id, 0, 0, "error", Some(e.clone())),
    }
    res
}

/// Kurulu paketi sil
#[tauri::command]
pub fn voice_pack_remove(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Geçersiz paket kimliği".into());
    }
    let base = voicepack::voicepacks_dir(&app).ok_or("Uygulama veri klasörü bulunamadı")?;
    let dir = base.join(&id);
    if !dir.is_dir() {
        return Ok(());
    }
    // Önce yeniden adlandır (çalan dosya varsa hata hemen görünür), sonra sil
    let trash = base.join(format!("{id}.old"));
    let _ = std::fs::remove_dir_all(&trash);
    rename_retry(&dir, &trash).map_err(|e| format!("Paket silinemedi (ses çalıyor olabilir): {}", io_err(e)))?;
    std::fs::remove_dir_all(&trash).map_err(io_err)?;
    voicepack::PACK_GEN.fetch_add(1, Ordering::Relaxed);
    if let Some(v) = crate::current_settings(&app) {
        crate::push_voice_cfg(&app, &v);
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub size: u64,
    pub sha256: String,
    pub meta: PackMeta,
    pub phrases: usize,
    pub files: usize,
    pub format: String,
    pub skipped: usize,
}

/// Yönetici: bağlantıdaki zip'i indir (kurmadan), boyut + SHA-256 + pack.json + sayıları çıkar
#[tauri::command]
pub async fn voice_pack_probe(app: AppHandle, url: String) -> Result<ProbeResult, String> {
    let base = voicepack::voicepacks_dir(&app).ok_or("Uygulama veri klasörü bulunamadı")?;
    std::fs::create_dir_all(&base).map_err(io_err)?;
    let cancel = cancel_flag(PROBE_ID)?;
    let zip_path = base.join(".probe.download.zip");
    let res: Result<ProbeResult, String> = async {
        let (size, sha) = download(&app, PROBE_ID, &url, &zip_path, None, &cancel).await?;
        emit(&app, PROBE_ID, size, size, "verify", None);
        let zp = zip_path.clone();
        let scan = tauri::async_runtime::spawn_blocking(move || scan_zip(&zp))
            .await
            .map_err(|e| e.to_string())??;
        Ok(ProbeResult {
            size,
            sha256: sha,
            meta: scan.meta,
            phrases: scan.phrases,
            files: scan.files,
            format: scan.format,
            skipped: scan.skipped,
        })
    }
    .await;
    let _ = std::fs::remove_file(&zip_path);
    cancel_done(PROBE_ID);
    match &res {
        Ok(_) => emit(&app, PROBE_ID, 1, 1, "done", None),
        Err(e) => emit(&app, PROBE_ID, 0, 0, "error", Some(e.clone())),
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let f = std::fs::File::create(path).unwrap();
        let mut z = zip::ZipWriter::new(f);
        let o = zip::write::SimpleFileOptions::default();
        for (n, d) in entries {
            z.start_file(*n, o).unwrap();
            z.write_all(d).unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn ids() {
        assert!(valid_id("tr-erkin"));
        assert!(valid_id("en_v2.1"));
        assert!(!valid_id("../x"));
        assert!(!valid_id(".hidden"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id("x.tmp"));
        assert!(!valid_id(""));
    }

    #[test]
    fn scan_layouts() {
        let dir = std::env::temp_dir().join(format!("pw_vpdl_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // Kökte pack.json
        let a = dir.join("a.zip");
        make_zip(&a, &[
            ("pack.json", br#"{"id":"x","name":"X","language":"de"}"#),
            ("spotter/car_left/1.ogg", b"o"),
            ("spotter/car_left/2.ogg", b"o"),
            ("numbers/5/1.ogg", b"o"),
            ("numbers/5/METIN.txt", b"t"),
            ("evil.exe", b"x"),
        ]);
        let s = scan_zip(&a).unwrap();
        assert_eq!((s.prefix.as_str(), s.phrases, s.files, s.skipped, s.format.as_str()), ("", 2, 3, 1, "ogg"));
        assert_eq!(s.meta.language, "de");
        // Bir klasör içinde
        let b = dir.join("b.zip");
        make_zip(&b, &[("Paket/pack.json", b"{}"), ("Paket/spotter/clear/1.wav", b"w")]);
        let s = scan_zip(&b).unwrap();
        assert_eq!((s.prefix.as_str(), s.files), ("Paket/", 1));
        // pack.json yok
        let c = dir.join("c.zip");
        make_zip(&c, &[("spotter/clear/1.wav", b"w")]);
        assert!(scan_zip(&c).is_err());
        // Zip-slip
        let d = dir.join("d.zip");
        make_zip(&d, &[("pack.json", b"{}"), ("../../evil/1.wav", b"w")]);
        assert!(scan_zip(&d).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
