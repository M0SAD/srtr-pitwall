//! Araç markası logoları.
//!
//! ESKİ / KULLANILMIYOR: logolar artık uygulamayla paketlenir (src/assets/carlogos, bkz. src/sdk/logos.tsx)
//! ve arayüz bu modülü çağırmaz. Eskiden kullanıcı kendi logo dosyalarını uygulama klasöründeki `logos`
//! klasörüne koyardı; komutlar (logos_list, logos_open_dir, GET /api/logos) eski pencereler/OBS sayfaları
//! bozulmasın diye yerinde duruyor.

use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 512 * 1024;

pub fn dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("logos"))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Logo {
    /// Dosya adının uzantısız, küçük harfli hali (eşleme arayüzde yapılır)
    pub name: String,
    pub file: String,
    pub data_url: String,
}

fn mime(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        _ => None,
    }
}

pub fn list(app: &AppHandle) -> Vec<Logo> {
    let Some(d) = dir(app) else { return vec![] };
    let _ = std::fs::create_dir_all(&d);
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(&d) else { return out };
    for e in rd.flatten() {
        let p = e.path();
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
        let Some(m) = mime(&ext) else { continue };
        if e.metadata().map(|m| m.len() > MAX_BYTES).unwrap_or(true) {
            continue;
        }
        let Ok(bytes) = std::fs::read(&p) else { continue };
        let name = p.file_stem().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        let file = p.file_name().and_then(|x| x.to_str()).unwrap_or("").to_string();
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        out.push(Logo { name, file, data_url: format!("data:{m};base64,{b64}") });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Klasörü dosya yöneticisinde aç
pub fn open_dir(app: &AppHandle) -> Result<(), String> {
    let d = dir(app).ok_or("klasör bulunamadı")?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let cmd = "explorer";
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = "xdg-open";
    std::process::Command::new(cmd).arg(&d).spawn().map(|_| ()).map_err(|e| e.to_string())
}
