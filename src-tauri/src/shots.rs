// Ekran görüntüleri: oyundayken kısayolla (varsayılan PrintScreen) ekranı overlay'lerle birlikte
// yakalar, yöneticinin belirlediği filigranı ekler ve Resimler\SRTR Pitwall klasörüne kaydeder.
// Ayrıca galeri (SRTR Pitwall + iRacing klasörü), küçük resimler, paylaşım için küçültme ve
// düzenleme ekranı arka planı buradadır.
//
// Filigran görseli arayüzde (canvas) çizilir ve PNG olarak buraya gönderilir; böylece her dilde
// ve her yazı tipinde aynı görünür. Burada sadece ölçeklenip görüntünün üstüne bindirilir.

use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use image::{imageops, DynamicImage, ImageFormat, RgbaImage};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// Filigranın çizildiği referans ekran yüksekliği (arayüz bu yüksekliğe göre çizer)
const REF_H: f32 = 2160.0;

struct Wm {
    img: RgbaImage,
    pos: String,
    margin: f32,
}

#[derive(Default)]
pub struct ShotState {
    wm: Mutex<Option<Wm>>,
    wm_loaded: AtomicBool,
    busy: AtomicBool,
    meta: Mutex<Option<HashMap<String, ShotMeta>>>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct ShotMeta {
    #[serde(default)]
    track: String,
    #[serde(default)]
    car: String,
    /// Filigran eklendi (paylaşırken yeniden eklenmez)
    #[serde(default)]
    wm: bool,
}

#[derive(Serialize, Deserialize)]
struct WmFile {
    enabled: bool,
    pos: String,
    margin: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShotInfo {
    path: String,
    name: String,
    modified: u64,
    size: u64,
    source: String,
    track: String,
    car: String,
    watermarked: bool,
}

// ---------------------------------------------------------------------------
// Klasörler
// ---------------------------------------------------------------------------

/// SRTR Pitwall ekran görüntüleri: Resimler\SRTR Pitwall
pub fn pitwall_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .picture_dir()
        .or_else(|_| app.path().home_dir())
        .ok()
        .map(|d| d.join("SRTR Pitwall"))
}

/// iRacing'in kendi ekran görüntüsü klasörleri
pub fn iracing_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(d) = app.path().document_dir() {
        v.push(d.join("iRacing").join("screenshots"));
        v.push(d.join("iRacing").join("Screenshots"));
    }
    if let Ok(d) = app.path().picture_dir() {
        v.push(d.join("iRacing"));
    }
    v.dedup();
    v
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Okunmasına izin verilen konumda mı (galeri klasörleri)
fn allowed(app: &AppHandle, p: &Path) -> Result<PathBuf, String> {
    let p = p.canonicalize().map_err(|e| e.to_string())?;
    let mut dirs = iracing_dirs(app);
    if let Some(d) = pitwall_dir(app) {
        dirs.push(d);
    }
    if dirs.into_iter().filter_map(|d| d.canonicalize().ok()).any(|d| p.starts_with(&d)) {
        Ok(p)
    } else {
        Err("izin verilmeyen konum".into())
    }
}

fn is_image(p: &Path) -> bool {
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "bmp" | "webp")
}

// ---------------------------------------------------------------------------
// Bilgi dosyası (pist/araç, filigran eklendi mi): ayar klasöründe shots.json
// ---------------------------------------------------------------------------

fn meta_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("shots.json"))
}

fn with_meta<R>(app: &AppHandle, f: impl FnOnce(&mut HashMap<String, ShotMeta>) -> R, save: bool) -> R {
    let st = app.state::<ShotState>();
    let mut g = st.meta.lock();
    if g.is_none() {
        let m = meta_path(app)
            .ok()
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        *g = Some(m);
    }
    let map = g.as_mut().unwrap();
    let r = f(map);
    if save {
        if let (Ok(p), Ok(b)) = (meta_path(app), serde_json::to_vec(map)) {
            let _ = std::fs::write(p, b);
        }
    }
    r
}

// ---------------------------------------------------------------------------
// Filigran
// ---------------------------------------------------------------------------

fn load_wm(app: &AppHandle) {
    let st = app.state::<ShotState>();
    if st.wm_loaded.swap(true, Ordering::Relaxed) {
        return;
    }
    let Ok(dir) = config_dir(app) else { return };
    let cfg: Option<WmFile> = std::fs::read(dir.join("watermark.json")).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let Some(cfg) = cfg else { return };
    if !cfg.enabled {
        return;
    }
    if let Ok(img) = image::open(dir.join("watermark.png")) {
        *st.wm.lock() = Some(Wm { img: img.to_rgba8(), pos: cfg.pos, margin: cfg.margin });
    }
}

/// Arayüzün çizdiği filigranı kaydeder (png: base64). enabled=false: filigran yok.
#[tauri::command]
pub fn watermark_set(app: AppHandle, enabled: bool, png: Option<String>, pos: String, margin: f32) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let st = app.state::<ShotState>();
    st.wm_loaded.store(true, Ordering::Relaxed);
    let cfg = WmFile { enabled, pos: pos.clone(), margin };
    std::fs::write(dir.join("watermark.json"), serde_json::to_vec(&cfg).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let bytes = match (enabled, png) {
        (true, Some(b64)) => base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?,
        _ => {
            *st.wm.lock() = None;
            return Ok(());
        }
    };
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();
    std::fs::write(dir.join("watermark.png"), &bytes).map_err(|e| e.to_string())?;
    *st.wm.lock() = Some(Wm { img, pos, margin });
    Ok(())
}

/// Filigranı görüntünün yüksekliğine göre ölçekleyip bindirir. Eklendiyse true.
fn apply_wm(app: &AppHandle, img: &mut RgbaImage) -> bool {
    load_wm(app);
    let st = app.state::<ShotState>();
    let g = st.wm.lock();
    let Some(wm) = g.as_ref() else { return false };
    let (w, h) = img.dimensions();
    let s = h as f32 / REF_H;
    let ww = ((wm.img.width() as f32 * s).round() as u32).clamp(1, w);
    let wh = ((wm.img.height() as f32 * s).round() as u32).clamp(1, h);
    let scaled = if ww == wm.img.width() && wh == wm.img.height() {
        wm.img.clone()
    } else {
        imageops::resize(&wm.img, ww, wh, imageops::FilterType::CatmullRom)
    };
    let m = (wm.margin * h as f32).round() as i64;
    let (w, h, ww, wh) = (w as i64, h as i64, ww as i64, wh as i64);
    let (x, y) = match wm.pos.as_str() {
        "tl" => (m, m),
        "tr" => (w - ww - m, m),
        "bl" => (m, h - wh - m),
        "center" => ((w - ww) / 2, (h - wh) / 2),
        "bc" => ((w - ww) / 2, h - wh - m),
        _ => (w - ww - m, h - wh - m),
    };
    imageops::overlay(img, &scaled, x.max(0), y.max(0));
    true
}

// ---------------------------------------------------------------------------
// Ekranı yakalama
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn capture_rect(x: i32, y: i32, w: u32, h: u32) -> Result<RgbaImage, String> {
    use windows_sys::Win32::Graphics::Gdi::*;
    unsafe {
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() {
            return Err("ekran okunamadı".into());
        }
        let mem = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, w as i32, h as i32);
        let old = SelectObject(mem, bmp);
        // CAPTUREBLT: katmanlı (şeffaf) pencereler, yani overlay'ler de görüntüye girer
        let ok = BitBlt(mem, 0, 0, w as i32, h as i32, screen, x, y, SRCCOPY | CAPTUREBLT);
        SelectObject(mem, old);
        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = w as i32;
        bi.bmiHeader.biHeight = -(h as i32);
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB;
        let mut buf = vec![0u8; w as usize * h as usize * 4];
        let lines = GetDIBits(mem, bmp, 0, h, buf.as_mut_ptr() as *mut _, &mut bi, DIB_RGB_COLORS);
        DeleteObject(bmp);
        DeleteDC(mem);
        ReleaseDC(std::ptr::null_mut(), screen);
        if ok == 0 || lines == 0 {
            return Err("ekran okunamadı".into());
        }
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        RgbaImage::from_raw(w, h, buf).ok_or_else(|| "ekran okunamadı".into())
    }
}

/// Geliştirme ortamı (Linux/X11): ImageMagick "import" ile
#[cfg(not(windows))]
fn capture_rect(x: i32, y: i32, w: u32, h: u32) -> Result<RgbaImage, String> {
    let out = std::process::Command::new("import")
        .args(["-window", "root", "-crop", &format!("{w}x{h}+{x}+{y}"), "png:-"])
        .output()
        .map_err(|e| format!("ekran okunamadı: {e}"))?;
    if !out.status.success() {
        return Err("ekran okunamadı".into());
    }
    Ok(image::load_from_memory(&out.stdout).map_err(|e| e.to_string())?.to_rgba8())
}

/// Overlay'lerin gösterildiği monitörü yakalar
fn capture_monitor(app: &AppHandle) -> Result<RgbaImage, String> {
    let win = app.get_webview_window("overlay").ok_or("overlay penceresi yok")?;
    let m = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten())
        .ok_or("monitör bulunamadı")?;
    let p = m.position();
    let s = m.size();
    capture_rect(p.x, p.y, s.width, s.height)
}

// ---------------------------------------------------------------------------
// Çekme
// ---------------------------------------------------------------------------

fn setting<'a>(v: Option<&'a serde_json::Value>, key: &str) -> Option<&'a serde_json::Value> {
    v.and_then(|v| v.pointer(&format!("/general/screenshots/{key}")))
}

/// Yerel saat: 2026-09-30_15-13-22
fn stamp() -> String {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::SystemInformation::GetLocalTime;
        let mut t = std::mem::zeroed();
        GetLocalTime(&mut t);
        return format!(
            "{:04}-{:02}-{:02}_{:02}-{:02}-{:02}",
            t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
        );
    }
    #[allow(unreachable_code)]
    {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
        let (days, rem) = (secs.div_euclid(86400), secs.rem_euclid(86400));
        // Günden takvim tarihine (Howard Hinnant)
        let z = days + 719468;
        let era = z.div_euclid(146097);
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + i64::from(m <= 2);
        format!("{y:04}-{m:02}-{d:02}_{:02}-{:02}-{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
    }
}

fn encode(img: &RgbaImage, png: bool, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let mut out = Vec::new();
    if png {
        DynamicImage::ImageRgb8(rgb)
            .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .map_err(|e| e.to_string())?;
    } else {
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality.clamp(40, 100))
            .encode_image(&rgb)
            .map_err(|e| e.to_string())?;
    }
    Ok(out)
}

fn take_inner(app: &AppHandle, from_panel: bool) -> Result<ShotInfo, String> {
    let v = crate::current_settings(app);
    let include = setting(v.as_ref(), "includeOverlays").and_then(|x| x.as_bool()).unwrap_or(true);
    let png = setting(v.as_ref(), "format").and_then(|x| x.as_str()) == Some("png");
    let quality = setting(v.as_ref(), "quality").and_then(|x| x.as_u64()).unwrap_or(92) as u8;

    // Panelden çekiliyorsa panel görüntüye girmesin
    let panel = if from_panel { app.get_webview_window("main").filter(|w| w.is_visible().unwrap_or(false)) } else { None };
    if let Some(w) = &panel {
        let _ = w.hide();
        std::thread::sleep(Duration::from_millis(600));
    }
    if !include {
        for w in crate::overlay_windows(app) {
            let _ = w.hide();
        }
        std::thread::sleep(Duration::from_millis(180));
    }
    let shot = capture_monitor(app);
    if !include {
        crate::sync_overlay_visibility(app);
    }
    if let Some(w) = &panel {
        let _ = w.show();
    }
    let mut img = shot?;
    let wm = apply_wm(app, &mut img);

    let dir = pitwall_dir(app).ok_or("Resimler klasörü bulunamadı")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let base = format!("SRTR_Pitwall_{}", stamp());
    let ext = if png { "png" } else { "jpg" };
    let mut path = dir.join(format!("{base}.{ext}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base}_{n}.{ext}"));
        n += 1;
    }
    let bytes = encode(&img, png, quality)?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    let (track, car) = crate::shared(app).shot_meta.lock().clone();
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let meta = ShotMeta { track, car, wm };
    with_meta(app, |m| m.insert(name.clone(), meta.clone()), true);
    Ok(ShotInfo {
        path: path.to_string_lossy().into(),
        name,
        modified: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
        size: bytes.len() as u64,
        source: "pitwall".into(),
        track: meta.track,
        car: meta.car,
        watermarked: wm,
    })
}

/// Ekran görüntüsü al (kısayoldan ya da panelden). Sonuç "screenshot-taken" olayıyla bildirilir.
pub fn take(app: &AppHandle, from_panel: bool) {
    let st = app.state::<ShotState>();
    if st.busy.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let r = take_inner(&app, from_panel);
        app.state::<ShotState>().busy.store(false, Ordering::Relaxed);
        match r {
            Ok(info) => {
                let _ = app.emit("screenshot-taken", info);
            }
            Err(e) => {
                let _ = app.emit("screenshot-error", e);
            }
        }
    });
}

#[tauri::command]
pub async fn shot_take(app: AppHandle) {
    take(&app, true);
}

// ---------------------------------------------------------------------------
// Galeri
// ---------------------------------------------------------------------------

fn list_dir(d: &Path, source: &str, meta: &HashMap<String, ShotMeta>, out: &mut Vec<ShotInfo>) {
    let Ok(rd) = std::fs::read_dir(d) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if !is_image(&p) {
            continue;
        }
        let Ok(m) = e.metadata() else { continue };
        let modified = m
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let mm = if source == "pitwall" { meta.get(&name).cloned().unwrap_or_default() } else { ShotMeta::default() };
        out.push(ShotInfo {
            path: p.to_string_lossy().into(),
            name,
            modified,
            size: m.len(),
            source: source.into(),
            track: mm.track,
            car: mm.car,
            watermarked: mm.wm,
        });
    }
}

/// source: "pitwall" | "iracing" | "all"
#[tauri::command]
pub fn shots_list(app: AppHandle, source: String) -> Vec<ShotInfo> {
    let meta = with_meta(&app, |m| m.clone(), false);
    let mut out = Vec::new();
    if source != "iracing" {
        if let Some(d) = pitwall_dir(&app) {
            list_dir(&d, "pitwall", &meta, &mut out);
        }
    }
    if source != "pitwall" {
        let mut seen = Vec::new();
        for d in iracing_dirs(&app) {
            // Windows'ta büyük/küçük harf farkı aynı klasör olabilir
            let c = d.canonicalize().unwrap_or(d.clone());
            if seen.contains(&c) {
                continue;
            }
            seen.push(c);
            list_dir(&d, "iracing", &meta, &mut out);
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out.truncate(500);
    out
}

#[tauri::command]
pub async fn shot_read(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let p = allowed(&app, Path::new(&path))?;
    Ok(tauri::ipc::Response::new(std::fs::read(&p).map_err(|e| e.to_string())?))
}

fn decode(p: &Path) -> Result<DynamicImage, String> {
    image::ImageReader::open(p)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())
}

/// Galeri için küçük resim (önbellekte saklanır)
#[tauri::command]
pub async fn shot_thumb(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    use std::hash::{Hash, Hasher};
    let p = allowed(&app, Path::new(&path))?;
    let md = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let mut h = std::collections::hash_map::DefaultHasher::new();
    p.hash(&mut h);
    md.len().hash(&mut h);
    md.modified().ok().hash(&mut h);
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    let file = cache.join(format!("{:016x}.jpg", h.finish()));
    if let Ok(b) = std::fs::read(&file) {
        return Ok(tauri::ipc::Response::new(b));
    }
    let img = decode(&p)?.thumbnail(640, 360).to_rgba8();
    let bytes = encode(&img, false, 80)?;
    let _ = std::fs::create_dir_all(&cache);
    let _ = std::fs::write(&file, &bytes);
    Ok(tauri::ipc::Response::new(bytes))
}

/// Paylaşım için: en fazla max_w genişliğe küçültür, istenirse filigran ekler (yoksa), JPEG döner.
#[tauri::command]
pub async fn shot_encode(app: AppHandle, path: String, max_w: u32, quality: u8, watermark: bool) -> Result<tauri::ipc::Response, String> {
    let p = allowed(&app, Path::new(&path))?;
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let in_pitwall = pitwall_dir(&app).and_then(|d| d.canonicalize().ok()).is_some_and(|d| p.starts_with(d));
    let already = in_pitwall && with_meta(&app, |m| m.get(&name).map(|x| x.wm).unwrap_or(false), false);
    let mut img = decode(&p)?.to_rgba8();
    if watermark && !already {
        apply_wm(&app, &mut img);
    }
    let max_w = max_w.clamp(320, 7680);
    if img.width() > max_w {
        let h = (img.height() as f64 * max_w as f64 / img.width() as f64).round() as u32;
        img = imageops::resize(&img, max_w, h.max(1), imageops::FilterType::CatmullRom);
    }
    Ok(tauri::ipc::Response::new(encode(&img, false, quality)?))
}

/// Sadece SRTR Pitwall klasöründeki görüntüler silinebilir (iRacing'inkilere dokunulmaz)
#[tauri::command]
pub fn shot_delete(app: AppHandle, path: String) -> Result<(), String> {
    let p = allowed(&app, Path::new(&path))?;
    let dir = pitwall_dir(&app).and_then(|d| d.canonicalize().ok()).ok_or("klasör yok")?;
    if !p.starts_with(&dir) {
        return Err("Sadece SRTR Pitwall görüntüleri silinebilir".into());
    }
    std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    with_meta(&app, |m| m.remove(&name), true);
    Ok(())
}

#[tauri::command]
pub fn shots_open_dir(app: AppHandle, source: String) -> Result<(), String> {
    let d = if source == "iracing" {
        iracing_dirs(&app).into_iter().find(|d| d.exists()).ok_or("iRacing ekran görüntüsü klasörü bulunamadı")?
    } else {
        let d = pitwall_dir(&app).ok_or("Resimler klasörü bulunamadı")?;
        std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
        d
    };
    crate::open_path(&d)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShotDirs {
    pitwall: String,
    iracing: String,
    iracing_found: bool,
}

#[tauri::command]
pub fn shots_dirs(app: AppHandle) -> ShotDirs {
    let ir = iracing_dirs(&app);
    let found = ir.iter().find(|d| d.exists()).cloned();
    ShotDirs {
        pitwall: pitwall_dir(&app).map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        iracing: found.clone().or_else(|| ir.first().cloned()).map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        iracing_found: found.is_some(),
    }
}

// ---------------------------------------------------------------------------
// Düzenleme ekranı arka planı (ayar klasöründe tek dosya)
// ---------------------------------------------------------------------------

fn backdrop_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("edit-backdrop.jpg"))
}

fn save_backdrop(app: &AppHandle, img: DynamicImage) -> Result<(), String> {
    let img = if img.width() > 3840 { img.resize(3840, 3840, imageops::FilterType::CatmullRom) } else { img };
    let bytes = encode(&img.to_rgba8(), false, 90)?;
    std::fs::write(backdrop_path(app)?, bytes).map_err(|e| e.to_string())
}

/// Galerideki bir görüntüyü düzenleme arka planı yap
#[tauri::command]
pub async fn edit_backdrop_set(app: AppHandle, path: String) -> Result<(), String> {
    let p = allowed(&app, Path::new(&path))?;
    save_backdrop(&app, decode(&p)?)
}

/// Kullanıcının seçtiği dosyadan (base64)
#[tauri::command]
pub async fn edit_backdrop_import(app: AppHandle, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    save_backdrop(&app, image::load_from_memory(&bytes).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn edit_backdrop_read(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(std::fs::read(backdrop_path(&app)?).map_err(|_| "arka plan yok".to_string())?))
}

#[tauri::command]
pub fn edit_backdrop_clear(app: AppHandle) -> Result<(), String> {
    let p = backdrop_path(&app)?;
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_format() {
        let s = stamp();
        assert_eq!(s.len(), 19, "{s}");
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[10..11], "_");
    }

    #[test]
    fn jpeg_roundtrip() {
        let img = RgbaImage::from_pixel(64, 36, image::Rgba([200, 30, 30, 255]));
        let b = encode(&img, false, 85).unwrap();
        let back = image::load_from_memory(&b).unwrap();
        assert_eq!(back.width(), 64);
    }
}
