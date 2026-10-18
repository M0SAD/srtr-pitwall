//! Arkadaşlar (sohbet) penceresini ana pencerenin sağ kenarına yapıştırır (Discord'daki yan panel gibi).
//!
//! Yapışıkken: pencere ana pencerenin sağ kenarında, onunla aynı yükseklikte durur; ana pencere taşınınca ya da
//! boyutlanınca peşinden gider. Kullanıcı Arkadaşlar penceresini tutup başka yere taşırsa yapışma kalkar (sol
//! kenarından genişletmek yapışmayı bozmaz). Tercih arayüzde (Sohbet görünümü › "Ana pencerenin sağına yapışsın").

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

const LABEL: &str = "friends";
static DOCKED: AtomicBool = AtomicBool::new(false);
static MAIN_HOOKED: AtomicBool = AtomicBool::new(false);
/// Son yerleştirme zamanı (ms): hemen ardından gelen kendi taşıma olaylarımız yapışmayı bozmasın
static PLACED_AT: AtomicU64 = AtomicU64::new(0);
/// Bir sonraki yerleştirmede ana pencerenin yüksekliğini doldur (yapışma yeni açıldı / kayıtlı boyut yok).
/// Aksi halde kullanıcının son verdiği boyut korunur (yalnız ana pencereden uzunsa kısaltılır).
static FILL_NEXT: AtomicBool = AtomicBool::new(false);

/// Pencere kayıtlı boyutu olmadan açıldı: ilk yerleştirme ana pencere boyunu doldursun
pub fn fill_next() {
    FILL_NEXT.store(true, Ordering::Relaxed);
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn docked() -> bool {
    DOCKED.load(Ordering::Relaxed)
}

/// Yapıştırma tercihini uygula (true: hemen yerleştir). `fill`: kullanıcı tercihi şimdi açtı, ana pencere boyunu doldur
pub fn set(app: &AppHandle, on: bool, fill: bool) {
    let was = DOCKED.swap(on, Ordering::Relaxed);
    if on && fill && !was {
        FILL_NEXT.store(true, Ordering::Relaxed);
    }
    if on {
        hook_main(app);
        place(app);
    }
}

/// Ana pencerenin istemci alanı (konum, boyut); simge durumundaysa ya da gizliyse None
fn main_rect(app: &AppHandle) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let m = app.get_webview_window("main")?;
    if m.is_minimized().unwrap_or(false) || !m.is_visible().unwrap_or(false) {
        return None;
    }
    Some((m.inner_position().ok()?, m.inner_size().ok()?))
}

/// Arkadaşlar penceresini ana pencerenin sağ kenarına yerleştir
pub fn place(app: &AppHandle) {
    if !docked() {
        return;
    }
    let Some(fw) = app.get_webview_window(LABEL) else {
        return;
    };
    let Some((p, s)) = main_rect(app) else { return };
    let cur = fw.outer_size().unwrap_or(PhysicalSize::new(380, 680));
    // Genişlik korunur; ana pencerenin en çok %60.ı (en az 300 px). Yükseklik: kullanıcının verdiği (ana pencereden
    // uzun olamaz); yapışma yeni açıldıysa ana pencere boyu
    let w = cur.width.min((s.width as f64 * 0.6) as u32).max(300);
    let h = if FILL_NEXT.swap(false, Ordering::Relaxed) {
        s.height
    } else {
        cur.height.min(s.height).max(300)
    };
    let x = p.x + s.width as i32 - w as i32;
    PLACED_AT.store(now_ms(), Ordering::Relaxed);
    let _ = fw.set_position(PhysicalPosition::new(x, p.y));
    if cur.width != w || cur.height != h {
        let _ = fw.set_size(PhysicalSize::new(w, h));
    }
}

/// Ana pencere taşınınca / boyutlanınca Arkadaşlar penceresi peşinden gelsin (bir kez kurulur)
fn hook_main(app: &AppHandle) {
    if MAIN_HOOKED.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(m) = app.get_webview_window("main") else {
        MAIN_HOOKED.store(false, Ordering::SeqCst);
        return;
    };
    let app2 = app.clone();
    m.on_window_event(move |e| match e {
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => place(&app2),
        _ => {}
    });
}

/// Yeni açılan Arkadaşlar penceresini izle: kullanıcı onu başka yere taşırsa yapışma kalkar
pub fn watch(app: &AppHandle, w: &WebviewWindow) {
    let app2 = app.clone();
    let win = w.clone();
    w.on_window_event(move |e| {
        if let tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) = e {
            if !docked() || now_ms().saturating_sub(PLACED_AT.load(Ordering::Relaxed)) < 600 {
                return;
            }
            let Some((p, s)) = main_rect(&app2) else {
                return;
            };
            let (Ok(fp), Ok(fs)) = (win.outer_position(), win.outer_size()) else {
                return;
            };
            let right = fp.x + fs.width as i32;
            let main_right = p.x + s.width as i32;
            // Sağ kenar ve üst hizası korunuyorsa (sol / alt kenardan boyutlandırma) yapışık kalır
            if (right - main_right).abs() > 8 || (fp.y - p.y).abs() > 8 {
                DOCKED.store(false, Ordering::Relaxed);
            }
        }
    });
    if docked() {
        hook_main(app);
        place(app);
    }
}
