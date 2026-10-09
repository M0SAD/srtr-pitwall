//! Klavye etkinliği: "en son ne zaman bir tuşa basıldı". Saat overlay'inin alarmı "herhangi bir tuşla sustur" için
//! kullanır. Overlay penceresi odak almadığından (tıklamalar oyuna geçer) tuşlar ancak sistem genelinde yoklanarak
//! görülür. Yoklama yalnızca arayüz sorduğu sürece çalışır (alarm çalarken); 5 sn sorulmazsa durur.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

static RUNNING: AtomicBool = AtomicBool::new(false);
/// Son sorgunun ve son tuşun zamanı (başlangıçtan ms)
static ASKED_MS: AtomicU64 = AtomicU64::new(0);
static LAST_KEY_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    static T0: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    T0.get_or_init(Instant::now).elapsed().as_millis() as u64 + 1
}

/// Herhangi bir klavye tuşu şu an basılı mı (fare düğmeleri hariç)
#[cfg(windows)]
fn any_key_down() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    // 0x01-0x06: fare düğmeleri; 0x07 ve 0xFF tanımsız
    (0x08..=0xFEi32).any(|vk| unsafe { (GetAsyncKeyState(vk) as u16) & 0x8000 != 0 })
}
#[cfg(not(windows))]
fn any_key_down() -> bool {
    false
}

fn ensure_running() {
    if RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    std::thread::spawn(|| {
        // Yoklama başladığı an basılı olan tuş (ör. kısayol) "yeni basış" sayılmasın: önce bırakılması beklenir
        let mut was_down = any_key_down();
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let now = now_ms();
            if now.saturating_sub(ASKED_MS.load(Ordering::Relaxed)) > 5000 {
                RUNNING.store(false, Ordering::Relaxed);
                return;
            }
            let down = any_key_down();
            if down && !was_down {
                LAST_KEY_MS.store(now, Ordering::Relaxed);
            }
            was_down = down;
        }
    });
}

/// Son tuş basışından bu yana geçen ms (yoklama başladığından beri basılmadıysa çok büyük bir sayı)
#[tauri::command]
pub fn key_idle_ms() -> u64 {
    let now = now_ms();
    ASKED_MS.store(now, Ordering::Relaxed);
    ensure_running();
    let last = LAST_KEY_MS.load(Ordering::Relaxed);
    if last == 0 {
        u64::MAX / 2
    } else {
        now.saturating_sub(last)
    }
}
