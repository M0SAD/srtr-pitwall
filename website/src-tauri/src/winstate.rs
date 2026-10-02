//! Ek pencerelerin (Arkadaşlar, Pitwall, Live Timing…) son konumu ve boyutu.
//! Kullanıcı pencereyi taşıdığında/boyutlandırdığında/kapattığında `windows.json`
//! (app_config_dir) dosyasına yazılır; pencere yeniden açılınca oraya konur.
//! Kayıtlı konum bağlı bir monitörde değilse (monitör çıkarıldıysa) varsayılan kullanılır.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Fiziksel piksel cinsinden pencere yerleşimi (dış konum + iç boyut)
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Geo {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    #[serde(default)]
    pub maximized: bool,
}

static MAP: Mutex<Option<HashMap<String, Geo>>> = Mutex::new(None);
static SAVE_PENDING: AtomicBool = AtomicBool::new(false);
/// Taşıma/boyutlandırma olaylarını birleştirip diske en fazla bu aralıkla yazar
const SAVE_DELAY_MS: u64 = 700;

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("windows.json"))
}

fn with_map<R>(app: &AppHandle, f: impl FnOnce(&mut HashMap<String, Geo>) -> R) -> R {
    let mut g = MAP.lock();
    if g.is_none() {
        let loaded = path(app)
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str::<HashMap<String, Geo>>(&t).ok())
            .unwrap_or_default();
        *g = Some(loaded);
    }
    f(g.as_mut().unwrap())
}

fn write_now(app: &AppHandle) {
    let Some(p) = path(app) else { return };
    let text = {
        let g = MAP.lock();
        match g.as_ref() {
            Some(m) => serde_json::to_string_pretty(m).unwrap_or_default(),
            None => return,
        }
    };
    if text.is_empty() {
        return;
    }
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = p.with_extension("json.tmp");
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, &p);
    }
}

fn schedule_save(app: &AppHandle) {
    if SAVE_PENDING.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(SAVE_DELAY_MS));
        SAVE_PENDING.store(false, Ordering::Release);
        write_now(&app);
    });
}

/// Kayıtlı yerleşim makul mü (boyut sınırları)
fn sane(g: &Geo) -> bool {
    (200..=16000).contains(&g.w) && (150..=16000).contains(&g.h) && g.x.abs() < 100_000 && g.y.abs() < 100_000
}

/// Pencerenin başlık çubuğu bölgesi bağlı monitörlerden birinin içinde mi
pub fn on_monitor(g: &Geo, monitors: &[(i32, i32, u32, u32)]) -> bool {
    // Başlık çubuğunda tutulabilir bir nokta: üstten ~16 px, yatayda ortada
    let px = g.x as i64 + (g.w as i64) / 2;
    let py = g.y as i64 + 16;
    monitors.iter().any(|&(mx, my, mw, mh)| {
        let (mx, my) = (mx as i64, my as i64);
        px >= mx && px < mx + mw as i64 && py >= my && py < my + mh as i64
    })
}

/// Pencere için kayıtlı ve hâlâ geçerli (görünür monitörde) yerleşim
pub fn restore(app: &AppHandle, label: &str) -> Option<Geo> {
    let g = with_map(app, |m| m.get(label).copied())?;
    if !sane(&g) {
        return None;
    }
    let monitors: Vec<(i32, i32, u32, u32)> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
        .collect();
    if monitors.is_empty() || !on_monitor(&g, &monitors) {
        return None;
    }
    Some(g)
}

/// Kayıtlı yerleşimi yeni oluşturulmuş (gizli) pencereye uygular
pub fn apply(w: &WebviewWindow, g: &Geo) {
    let _ = w.set_size(PhysicalSize::new(g.w, g.h));
    let _ = w.set_position(PhysicalPosition::new(g.x, g.y));
    if g.maximized {
        let _ = w.maximize();
    }
}

/// Pencerenin şu anki yerleşimini belleğe al (simge durumundaysa atla)
fn capture(app: &AppHandle, w: &WebviewWindow, label: &str) -> bool {
    if w.is_minimized().unwrap_or(false) {
        return false;
    }
    let maximized = w.is_maximized().unwrap_or(false);
    let prev = with_map(app, |m| m.get(label).copied());
    let g = if maximized {
        // Büyütülmüşken normal yerleşimi koru, yalnız bayrağı güncelle
        match prev {
            Some(p) => Geo { maximized: true, ..p },
            None => return false,
        }
    } else {
        let (Ok(pos), Ok(size)) = (w.outer_position(), w.inner_size()) else { return false };
        Geo { x: pos.x, y: pos.y, w: size.width, h: size.height, maximized: false }
    };
    if !sane(&g) || prev == Some(g) {
        return false;
    }
    with_map(app, |m| m.insert(label.to_string(), g));
    true
}

/// Pencerenin taşınma/boyutlanma/kapanma olaylarını izleyip yerleşimini kaydeder
pub fn track(app: &AppHandle, w: &WebviewWindow) {
    let app = app.clone();
    let win = w.clone();
    let label = w.label().to_string();
    w.on_window_event(move |e| match e {
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            if capture(&app, &win, &label) {
                schedule_save(&app);
            }
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            capture(&app, &win, &label);
            write_now(&app);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn on_monitor_checks_title_bar() {
        let mons = [(0, 0, 1920, 1080), (1920, 0, 2560, 1440)];
        let g = Geo { x: 100, y: 100, w: 380, h: 680, maximized: false };
        assert!(on_monitor(&g, &mons));
        let g2 = Geo { x: 3000, y: 200, w: 380, h: 680, maximized: false };
        assert!(on_monitor(&g2, &mons));
        // İkinci monitör çıkarılmış
        assert!(!on_monitor(&g2, &mons[..1]));
        // Başlık çubuğu ekranın üstünde kalmış
        let g3 = Geo { x: 100, y: -200, w: 380, h: 680, maximized: false };
        assert!(!on_monitor(&g3, &mons));
    }

    #[test]
    fn sane_limits() {
        assert!(sane(&Geo { x: 0, y: 0, w: 380, h: 680, maximized: false }));
        assert!(!sane(&Geo { x: -32000, y: -32000, w: 0, h: 0, maximized: false }));
    }
}
