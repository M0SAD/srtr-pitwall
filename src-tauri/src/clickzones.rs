//! Tıklanabilir overlay bölgeleri (ör. tekrar izlerken Sıralama Tablosu / Yakındakiler'de sürücü adı).
//!
//! Overlay pencereleri normalde fareyi oyuna geçirir (`set_ignore_cursor_events(true)`). Arayüz tıklanabilir
//! öğelerin dikdörtgenlerini bildirir; burada imleç konumu ~30 Hz'de yoklanır ve imleç yalnızca bu dikdörtgenlerden
//! birinin üstündeyken o pencere fareyi alır. Böylece tablonun geri kalanı ve ekranın kalanı oyuna tıklanmaya devam eder.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use parking_lot::Mutex;
use tauri::{AppHandle, Manager};

/// Pencere etiketi → tıklanabilir dikdörtgenler (fiziksel ekran pikseli: x, y, w, h)
static ZONES: Mutex<Option<HashMap<String, Vec<[f64; 4]>>>> = Mutex::new(None);
/// Fareyi şu an alan pencere (imleç bir bölgenin üstünde)
static HOVER: Mutex<Option<String>> = Mutex::new(None);
static STARTED: AtomicBool = AtomicBool::new(false);
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Bu pencere şu an fareyi almalı mı (imleç tıklanabilir bir bölgenin üstünde)
pub fn hovered(label: &str) -> bool {
    HOVER.lock().as_deref() == Some(label)
}

fn inside(z: &[f64; 4], x: f64, y: f64) -> bool {
    x >= z[0] && y >= z[1] && x < z[0] + z[2] && y < z[1] + z[3]
}

/// Arayüzden: pencerenin tıklanabilir bölgeleri (CSS pikseli, pencere içi). Boş liste = bölge yok.
pub fn set(app: &AppHandle, w: &tauri::WebviewWindow, rects: Vec<[f64; 4]>) {
    // Yalnızca overlay pencereleri (panel / OBS penceresinin fare davranışına dokunulmaz)
    if w.label() != "overlay" && !w.label().starts_with("overlay-m") {
        return;
    }
    let _ = APP.set(app.clone());
    let k = w.scale_factor().unwrap_or(1.0);
    let (ox, oy) = w.inner_position().map(|p| (p.x as f64, p.y as f64)).unwrap_or((0.0, 0.0));
    let phys: Vec<[f64; 4]> = rects
        .into_iter()
        .filter(|r| r.iter().all(|v| v.is_finite()) && r[2] > 0.0 && r[3] > 0.0)
        .take(400)
        .map(|r| [ox + r[0] * k, oy + r[1] * k, r[2] * k, r[3] * k])
        .collect();
    {
        let mut z = ZONES.lock();
        let map = z.get_or_insert_with(HashMap::new);
        if phys.is_empty() {
            map.remove(w.label());
        } else {
            map.insert(w.label().to_string(), phys);
        }
    }
    if !STARTED.swap(true, Ordering::Relaxed) {
        let _ = std::thread::Builder::new().name("clickzones".into()).spawn(poll);
    }
}

fn poll() {
    loop {
        std::thread::sleep(Duration::from_millis(33));
        let Some(app) = APP.get() else { continue };
        let edit = crate::shared(app).edit_mode.load(Ordering::Relaxed);
        let want: Option<String> = if edit {
            None
        } else {
            let z = ZONES.lock();
            match z.as_ref().filter(|m| !m.is_empty()) {
                None => None,
                Some(map) => match app.cursor_position() {
                    Ok(p) => map.iter().find(|(_, rs)| rs.iter().any(|r| inside(r, p.x, p.y))).map(|(l, _)| l.clone()),
                    Err(_) => None,
                },
            }
        };
        let prev = HOVER.lock().clone();
        if prev == want {
            continue;
        }
        *HOVER.lock() = want.clone();
        if edit {
            continue;
        }
        // Eskiden fareyi alan pencere yeniden geçirgen, yeni pencere fareyi alır
        if let Some(l) = prev {
            if let Some(w) = app.get_webview_window(&l) {
                let _ = w.set_ignore_cursor_events(true);
            }
        }
        if let Some(l) = want {
            if let Some(w) = app.get_webview_window(&l) {
                let _ = w.set_ignore_cursor_events(false);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inside_rect() {
        let z = [10.0, 20.0, 100.0, 30.0];
        assert!(inside(&z, 10.0, 20.0));
        assert!(inside(&z, 109.0, 49.0));
        assert!(!inside(&z, 110.0, 30.0));
        assert!(!inside(&z, 50.0, 19.0));
    }
}
