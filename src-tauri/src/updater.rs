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
    // Panel açıkken güncelleniyorsa yeni sürüm de panel açık başlasın (tepsiye küçülmüş değil)
    mark_reopen_panel(&app);
    let mut downloaded: u64 = 0;
    let emitter = app.clone();
    let done = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = emitter.emit("update-progress", Progress { downloaded, total });
            },
            // İndirme bitti: kurulum sessizce başlar, program kendiliğinden kapanır ve
            // kurulum bitince yeni sürüm olarak yeniden açılır (Windows'ta eklenti süreci sonlandırır).
            move || {
                let _ = done.emit("update-stage", "installing");
            },
        )
        .await
        .map_err(|e| {
            // Kurulum olmadı: işaret sonraki (ilgisiz) açılışı etkilemesin
            clear_reopen_panel(&app);
            e.to_string()
        })?;
    app.restart();
}

// ---------------------------------------------------------------------------
// Güncellemeden sonra paneli yeniden aç
// ---------------------------------------------------------------------------
//
// Uygulama Windows başlangıcından `--tray` ile açıldıysa kurulum programı / yeniden başlatma aynı bağımsız
// değişkenlerle açar ve yeni sürüm yalnızca tepside başlardı. Güncelleme başlarken panel penceresi açıksa ayar
// klasörüne `reopen-panel` işareti yazılır; açılışta işaret varsa (ve tazeyse) panel gösterilir, işaret silinir.

const REOPEN_FILE: &str = "reopen-panel";
/// İşaret bundan eskiyse (yarım kalmış kurulum) yok sayılır
const REOPEN_MAX_AGE: std::time::Duration = std::time::Duration::from_secs(30 * 60);

fn reopen_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(REOPEN_FILE))
}

fn mark_reopen_panel(app: &AppHandle) {
    // Panel penceresi var ve görünür mü (simge durumunda olsa da "açık" sayılır; tepsiye kapatılmışsa pencere gizlidir)
    let open = app.get_webview_window("main").map(|w| w.is_visible().unwrap_or(false)).unwrap_or(false);
    let Some(p) = reopen_path(app) else { return };
    if !open {
        let _ = std::fs::remove_file(p);
        return;
    }
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(p, b"1");
}

fn clear_reopen_panel(app: &AppHandle) {
    if let Some(p) = reopen_path(app) {
        let _ = std::fs::remove_file(p);
    }
}

/// Açılışta: işaret varsa siler ve tazeyse true döner (panel `--tray` olsa da açılmalı)
pub fn take_reopen_panel(app: &AppHandle) -> bool {
    let Some(p) = reopen_path(app) else { return false };
    let Ok(meta) = std::fs::metadata(&p) else { return false };
    let fresh = meta.modified().ok().and_then(|t| t.elapsed().ok()).map(|age| age <= REOPEN_MAX_AGE).unwrap_or(true);
    let _ = std::fs::remove_file(&p);
    fresh
}
