//! Steam benzeri mesaj açılır penceresi: ekranın (ana monitörün çalışma alanının) sağ altında,
//! görev çubuğunun/tepsinin hemen üstünde küçük, kenarlıksız, saydam, her zaman üstte ve
//! odak çalmayan "toast" penceresi. Windows bildirim sistemine (Odak yardımı, uygulama kimliği,
//! kayıt defteri) bağlı değildir; bu yüzden her kurulumda görünür.
//!
//! Akış: overlay penceresindeki arkadaş servisi `toast_show` çağırır → kart kuyruğa eklenir,
//! pencere yoksa (gizli olarak) oluşturulur ve "toast-new" olayı gönderilir → sayfa `toast_take`
//! ile kuyruğu alır, kartları çizer ve `toast_layout(yükseklik)` ile pencereyi boyutlandırıp
//! gösterir; kart kalmayınca `toast_layout(0)` pencereyi gizler (yok edilmez, titreme olmaz).
//! Karta tıklayınca `toast_open_chat` Arkadaşlar penceresini o sohbetle açar.

use parking_lot::Mutex;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "toast";
/// Kartların mantıksal genişliği (px); pencere buna göre ölçeklenir
const WIDTH: f64 = 356.0;
/// Çalışma alanı kenarından boşluk (mantıksal px)
const MARGIN: f64 = 10.0;
const MAX_HEIGHT: f64 = 640.0;
const MAX_QUEUE: usize = 20;

/// Sayfa henüz yüklenmemişken gelen kartlar burada bekler
static QUEUE: Mutex<Vec<Value>> = Mutex::new(Vec::new());
/// Arkadaşlar penceresi açılınca gösterilecek sohbet (arkadaş kimliği ya da "team:<takım id>")
static PENDING_CHAT: Mutex<Option<String>> = Mutex::new(None);

fn ensure_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("window.html?view=toast".into()))
        .title("SRTR Pitwall")
        .inner_size(WIDTH, 120.0)
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
        .map_err(|e| e.to_string())
}

/// Ana monitörün çalışma alanına göre (görev çubuğu hariç) sağ alt köşe: (x, y, genişlik, yükseklik)
fn place(app: &AppHandle, w: &WebviewWindow, height: f64) -> Option<(i32, i32, u32, u32)> {
    let mon = app.primary_monitor().ok().flatten().or_else(|| w.current_monitor().ok().flatten())?;
    let wa = mon.work_area();
    Some(rect(wa.position.x, wa.position.y, wa.size.width, wa.size.height, mon.scale_factor(), height))
}

fn rect(ax: i32, ay: i32, aw: u32, ah: u32, scale: f64, height: f64) -> (i32, i32, u32, u32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let w = (WIDTH * scale).round() as u32;
    let h = (height.clamp(40.0, MAX_HEIGHT) * scale).round().min(ah as f64) as u32;
    let m = (MARGIN * scale).round() as i32;
    let x = ax + aw as i32 - w as i32 - m;
    let y = ay + ah as i32 - h as i32 - m;
    (x.max(ax), y.max(ay), w, h)
}

/// Pencereyi odak çalmadan göster (oyun ya da yazılan başka pencere odağını kaybetmez)
#[cfg(windows)]
fn show_at(w: &WebviewWindow, x: i32, y: i32, cw: u32, ch: u32) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_SHOWWINDOW};
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

/// Yeni kart göster (mesaj, arkadaşlık isteği, güvenilir işaretleme)
///
/// ÖNEMLİ: async olmak zorunda. Senkron Tauri komutları ana iş parçacığında çalışır; Windows'ta
/// (WebView2) ana iş parçacığında komut içinden pencere oluşturmak kilitlenmeye yol açar:
/// açılır pencere beyaz kalır ve tüm uygulama yanıt vermez.
#[tauri::command]
pub async fn toast_show(app: AppHandle, payload: Value) -> Result<(), String> {
    {
        let mut q = QUEUE.lock();
        q.push(payload);
        let n = q.len();
        if n > MAX_QUEUE {
            q.drain(..n - MAX_QUEUE);
        }
    }
    ensure_window(&app)?;
    let _ = app.emit_to(LABEL, "toast-new", ());
    Ok(())
}

/// Bekleyen kartları al (sayfa yüklenince ve "toast-new" olayında)
#[tauri::command]
pub fn toast_take() -> Vec<Value> {
    std::mem::take(&mut *QUEUE.lock())
}

/// Kartların toplam yüksekliğine (mantıksal px) göre pencereyi sağ alta yerleştir; 0 ise gizle
#[tauri::command]
pub async fn toast_layout(app: AppHandle, height: f64) -> Result<(), String> {
    let Some(w) = app.get_webview_window(LABEL) else { return Ok(()) };
    if !(height > 0.0) {
        hide(&w);
        return Ok(());
    }
    if let Some((x, y, cw, ch)) = place(&app, &w, height) {
        // Yeni boyut önce uygulanır ki eski (küçük) boyutta bir kare görünmesin
        #[cfg(windows)]
        {
            let _ = w.set_size(PhysicalSize::new(cw, ch));
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        show_at(&w, x, y, cw, ch);
    }
    Ok(())
}

/// Karta tıklanınca: Arkadaşlar penceresini aç ve (varsa) o arkadaşla sohbeti göster
#[tauri::command]
pub async fn toast_open_chat(app: AppHandle, friend: Option<String>) -> Result<(), String> {
    // Arkadaş kimliği (uuid), takım odası ("team:<uuid>") ya da grup sohbeti ("group:<uuid>")
    let friend = friend.filter(|id| {
        let rest = id.strip_prefix("team:").or_else(|| id.strip_prefix("group:")).unwrap_or(id);
        !rest.is_empty() && rest.len() <= 40 && rest.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
    });
    *PENDING_CHAT.lock() = friend;
    crate::window_open(app.clone(), "friends".into()).await?;
    // Pencere zaten açıksa olayı dinler; yeni açılıyorsa yüklenince `friends_take_chat` ile alır
    let _ = app.emit_to("friends", "friends-chat", ());
    Ok(())
}

/// Arkadaşlar penceresi: açılması istenen sohbet (bir kez verilir)
#[tauri::command]
pub fn friends_take_chat() -> Option<String> {
    PENDING_CHAT.lock().take()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bottom_right_of_work_area() {
        // 1920x1040 çalışma alanı (40 px görev çubuğu), %100 ölçek
        let (x, y, w, h) = rect(0, 0, 1920, 1040, 1.0, 200.0);
        assert_eq!((w, h), (356, 200));
        assert_eq!(x, 1920 - 356 - 10);
        assert_eq!(y, 1040 - 200 - 10);
    }

    #[test]
    fn scaled_and_offset_monitor() {
        // %150 ölçekli ikinci düzen: çalışma alanı (100, 50) konumunda
        let (x, y, w, h) = rect(100, 50, 2560, 1380, 1.5, 100.0);
        assert_eq!((w, h), (534, 150));
        assert_eq!(x, 100 + 2560 - 534 - 15);
        assert_eq!(y, 50 + 1380 - 150 - 15);
    }

    #[test]
    fn clamps_height() {
        let (_, y, _, h) = rect(0, 0, 800, 300, 1.0, 5000.0);
        assert_eq!(h, 300);
        assert_eq!(y, 0);
    }

    #[test]
    fn queue_take_empties() {
        QUEUE.lock().push(serde_json::json!({"id": "a"}));
        assert!(!toast_take().is_empty());
        assert!(toast_take().is_empty());
    }
}
