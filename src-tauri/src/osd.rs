//! Kısayol bildirimi (OSD): bir genel kısayola basılınca ekranın üst ortasında, yapılan işlemi ve
//! yeni durumu yazan küçük bir "hap" gösterilir (ör. "Sesli mühendis: Kapalı"). ~1,8 sn sonra kaybolur;
//! o sırada başka bir kısayola basılırsa içerik yenisiyle değişir.
//!
//! Overlay penceresinden bağımsız, kendi küçük penceresi vardır (etiket `osd`): overlay penceresi sim bağlı
//! değilken gizlidir, kısayollar ise panel tepsideyken de çalışır. Pencere kenarlıksız, saydam, her zaman
//! üstte, görev çubuğunda görünmez, odak almaz ve fare tıklamalarını alttaki pencereye (oyuna) geçirir.
//! Yapı `toast.rs` ile aynıdır: Rust son bildirimi saklar ve "osd-new" olayı yollar → sayfa `osd_take` ile
//! alır, metni arayüz dilinde çizer ve `osd_visible(true)` ile pencereyi gösterir; süre dolunca
//! `osd_visible(false)` gizler (pencere yok edilmez).
//!
//! Metinler sayfada (src/window/Osd.tsx) çevrilir: buradan sadece anahtar (`key`) ve durum (`on`) gider.
//! Canlı Sohbet kısayolları sonucunu zaten "livechat-notice" olayıyla (Türkçe kaynak metin) bildirir;
//! o metin olduğu gibi (`text`) iletilir ve sayfada çevrilir.

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Listener, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "osd";
/// Pencere boyutu (mantıksal px); hap bunun içinde ortalanır
const WIDTH: f64 = 640.0;
const HEIGHT: f64 = 72.0;
/// Monitörün üst kenarından boşluk (mantıksal px)
const TOP: f64 = 26.0;

/// Gösterilecek son bildirim (sayfa henüz yüklenmemişse burada bekler)
static PENDING: Mutex<Option<Value>> = Mutex::new(None);
static SEQ: AtomicU64 = AtomicU64::new(0);
/// Kısayolla başlatılan ve sonucu sonradan (olayla) gelen işlemler: bu ana kadar gelen sonuç gösterilir (ms)
static CHAT_UNTIL: AtomicU64 = AtomicU64::new(0);
static SHOT_UNTIL: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn enabled(app: &AppHandle) -> bool {
    crate::general_flag(app, "shortcutOsd", true)
}

/// Canlı Sohbet kısayoluna basıldı: sonucu "livechat-notice" ile gelir (dikteli ankette birkaç saniye sonra)
pub fn arm_chat() {
    CHAT_UNTIL.store(now_ms() + 12_000, Ordering::Relaxed);
}

/// Ekran görüntüsü kısayoluna basıldı: bildirim, görüntü alındıktan SONRA gösterilir (görüntüye girmesin)
pub fn arm_shot() {
    SHOT_UNTIL.store(now_ms() + 15_000, Ordering::Relaxed);
}

/// Kısayol işlemi bildir: `key` sayfadaki metin anahtarı, `on` (varsa) işlemden SONRAKİ durum
pub fn show(app: &AppHandle, key: &str, on: Option<bool>) {
    push(app, json!({ "key": key, "on": on }));
}

/// Hazır (Türkçe kaynak) metinle bildir; sayfada çevrilir
pub fn show_text(app: &AppHandle, text: &str) {
    if !text.trim().is_empty() {
        push(app, json!({ "text": text }));
    }
}

/// Yerel VR kısayolları: komut VR iş parçacığında işlenir, yapılandırma modunun yeni durumu kısa süre sonra okunur
pub fn show_vr(app: &AppHandle, action: &str) {
    if action != "vrConfig" {
        show(app, action, None);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let before = crate::vrnative::config_mode();
        // İş parçacığı komutu bir sonraki karede işler; durum değişene kadar (en çok ~0,6 sn) bekle
        for _ in 0..12 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if crate::vrnative::config_mode() != before {
                break;
            }
        }
        show(&app, "vrConfig", Some(crate::vrnative::config_mode()));
    });
}

fn push(app: &AppHandle, mut payload: Value) {
    if !enabled(app) {
        return;
    }
    payload["seq"] = Value::from(SEQ.fetch_add(1, Ordering::Relaxed) + 1);
    *PENDING.lock() = Some(payload);
    // Pencere oluşturma kısayol işleyicisinin (ana) iş parçacığında yapılmaz (bkz. toast.rs: WebView2 kilitlenmesi)
    let app = app.clone();
    std::thread::spawn(move || match ensure_window(&app) {
        Ok(_) => {
            let _ = app.emit_to(LABEL, "osd-new", ());
        }
        Err(e) => crate::trayalert::log(&app, &format!("osd: pencere acilamadi: {e}")),
    });
}

fn ensure_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    static LOCK: Mutex<()> = parking_lot::const_mutex(());
    let _guard = LOCK.lock();
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("window.html?view=osd".into()))
        .title("SRTR Pitwall")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .additional_browser_args(crate::browser_args())
        .build()
        .map_err(|e| e.to_string())?;
    let _ = w.set_ignore_cursor_events(true);
    Ok(w)
}

/// Overlay'lerin kullandığı monitörün (yoksa ana monitörün) üst ortası: (x, y, genişlik, yükseklik).
/// Çalışma alanı değil monitörün tamamı esas alınır (kenarlıksız tam ekran oyunun üst ortası).
fn place(app: &AppHandle, w: &WebviewWindow) -> Option<(i32, i32, u32, u32)> {
    let mon = app
        .get_webview_window("overlay")
        .and_then(|o| o.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| w.current_monitor().ok().flatten())?;
    Some(rect(mon.position().x, mon.position().y, mon.size().width, mon.scale_factor()))
}

fn rect(mx: i32, my: i32, mw: u32, scale: f64) -> (i32, i32, u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let w = ((WIDTH * scale).round() as u32).min(mw.max(1));
    let h = (HEIGHT * scale).round() as u32;
    let x = mx + (mw as i32 - w as i32) / 2;
    let y = my + (TOP * scale).round() as i32;
    (x, y, w, h)
}

/// Pencereyi odak çalmadan, en üstte göster (oyun odağını kaybetmez)
#[cfg(windows)]
fn show_at(w: &WebviewWindow, x: i32, y: i32, cw: u32, ch: u32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW};
    let _ = w.set_size(PhysicalSize::new(cw, ch));
    let _ = w.set_position(PhysicalPosition::new(x, y));
    if let Ok(h) = w.hwnd() {
        unsafe {
            SetWindowPos(h.0 as _, HWND_TOPMOST, x, y, cw as i32, ch as i32, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }
}

#[cfg(windows)]
fn hide(w: &WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};
    if let Ok(h) = w.hwnd() {
        unsafe {
            ShowWindow(h.0 as _, SW_HIDE);
        }
    }
}

#[cfg(not(windows))]
fn show_at(w: &WebviewWindow, x: i32, y: i32, cw: u32, ch: u32) {
    let _ = w.set_size(PhysicalSize::new(cw, ch));
    let _ = w.set_position(PhysicalPosition::new(x, y));
    let _ = w.show();
    let _ = w.set_always_on_top(true);
}

#[cfg(not(windows))]
fn hide(w: &WebviewWindow) {
    let _ = w.hide();
}

/// Sonucu olayla gelen kısayolları dinle (uygulama açılışında bir kez)
pub fn init(app: &AppHandle) {
    let a = app.clone();
    app.listen_any("livechat-notice", move |ev| {
        if now_ms() > CHAT_UNTIL.load(Ordering::Relaxed) {
            return;
        }
        let text = serde_json::from_str::<Value>(ev.payload())
            .ok()
            .and_then(|v| v.get("text").and_then(|t| t.as_str()).map(String::from));
        if let Some(t) = text {
            show_text(&a, &t);
        }
    });
    let a = app.clone();
    app.listen_any("screenshot-taken", move |_| {
        if now_ms() <= SHOT_UNTIL.swap(0, Ordering::Relaxed) {
            show(&a, "shot", None);
        }
    });
    let a = app.clone();
    app.listen_any("screenshot-error", move |ev| {
        if now_ms() <= SHOT_UNTIL.swap(0, Ordering::Relaxed) {
            match serde_json::from_str::<String>(ev.payload()) {
                Ok(t) => show_text(&a, &t),
                Err(_) => show(&a, "shotError", None),
            }
        }
    });
}

/// Arayüz tarafından bildirim (sonucu sayfada belli olan kısayollar, ör. ekip kontrolünü durdur)
#[tauri::command]
pub fn osd_push(app: AppHandle, key: String, on: Option<bool>) {
    show(&app, &key, on);
}

/// Bekleyen bildirimi al (sayfa yüklenince ve "osd-new" olayında)
#[tauri::command]
pub fn osd_take() -> Option<Value> {
    PENDING.lock().take()
}

/// Sayfa hapı çizdi (göster) ya da süresi doldu (gizle)
#[tauri::command]
pub async fn osd_visible(app: AppHandle, show: bool) -> Result<(), String> {
    let Some(w) = app.get_webview_window(LABEL) else { return Ok(()) };
    if !show {
        // Bu arada yeni bildirim geldiyse gizleme (sayfa onu birazdan gösterecek)
        if PENDING.lock().is_none() {
            hide(&w);
        }
        return Ok(());
    }
    let Some((x, y, cw, ch)) = place(&app, &w) else {
        crate::trayalert::log(&app, "osd: monitor bilgisi alinamadi");
        return Ok(());
    };
    show_at(&w, x, y, cw, ch);
    // Görünür olduktan sonra da uygula (gizli pencerede bazı platformlarda çalışmaz): tıklamalar oyuna geçsin
    let _ = w.set_ignore_cursor_events(true);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_centre_of_monitor() {
        let (x, y, w, h) = rect(0, 0, 1920, 1.0);
        assert_eq!((w, h), (640, 72));
        assert_eq!(x, (1920 - 640) / 2);
        assert_eq!(y, 26);
    }

    #[test]
    fn scaled_and_offset_monitor() {
        let (x, y, w, h) = rect(1920, -200, 2560, 1.5);
        assert_eq!((w, h), (960, 108));
        assert_eq!(x, 1920 + (2560 - 960) / 2);
        assert_eq!(y, -200 + 39);
    }

    #[test]
    fn narrow_monitor_clamps_width() {
        let (x, _, w, _) = rect(0, 0, 500, 1.0);
        assert_eq!((x, w), (0, 500));
    }
}
