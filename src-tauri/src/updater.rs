//! Otomatik güncelleme (isteğe bağlı).
//!
//! Güncelleme sadece imzalı sürüm derlemelerinde çalışır: `tauri.release.conf.json` içinde
//! açık anahtar (pubkey) ve güncelleme adresi tanımlıysa eklenti devreye girer.
//! Yerel `build.bat` derlemelerinde anahtar olmadığı için güncelleme kapalıdır ve uygulama
//! bunu arayüzde "yapılandırılmamış" olarak gösterir. Ayrıntılar: docs/GUNCELLEME.md

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState(Mutex<Option<Update>>);

/// Derleme bir güncelleme anahtarı ve adresiyle yapılandırılmış mı?
pub fn configured(app: &AppHandle) -> bool {
    let cfg = app.config().plugins.0.get("updater");
    let has_key = cfg
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_endpoint = cfg
        .and_then(|v| v.get("endpoints"))
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    has_key && has_endpoint
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    configured: bool,
    available: bool,
    version: Option<String>,
    notes: Option<String>,
    date: Option<String>,
}

#[tauri::command]
pub async fn update_check(app: AppHandle, state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    if !configured(&app) {
        return Ok(UpdateInfo { configured: false, available: false, version: None, notes: None, date: None });
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    let info = match &found {
        Some(u) => UpdateInfo {
            configured: true,
            available: true,
            version: Some(u.version.clone()),
            notes: u.body.clone(),
            date: u.date.map(|d| d.date().to_string()),
        },
        None => UpdateInfo { configured: true, available: false, version: None, notes: None, date: None },
    };
    *state.0.lock() = found;
    Ok(info)
}

#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Bulunan güncellemeyi indirir, kurar ve uygulamayı yeniden başlatır.
#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    let update = state.0.lock().take().ok_or("Önce güncellemeleri denetle")?;
    // Kurulumdan önce ayarları diske yaz
    app.state::<crate::SettingsStore>().flush(&app);
    let mut downloaded: u64 = 0;
    let emitter = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = emitter.emit("update-progress", Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}
