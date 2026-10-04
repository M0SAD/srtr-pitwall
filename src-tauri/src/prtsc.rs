//! PrintScreen içeren ekran görüntüsü kısayolu (ör. Ctrl+PrintScreen) için düşük seviye klavye kancası.
//! (`RegisterHotKey` başarısız olursa F tuşlu ekran görüntüsü kısayolu da bu kancayla dinlenir.)
//!
//! Neden: Windows'ta global-shortcut eklentisi `RegisterHotKey` kullanır. PrintScreen tuşu
//! (VK_SNAPSHOT) uygulamalara çoğu zaman yalnız tuş bırakma olarak gelir; Windows 11'de
//! "Ekran yakalamayı açmak için Print Screen tuşunu kullan" (Ekran Alıntısı Aracı) ayarı tuşu
//! kendi kancasıyla yakalar ve `RegisterHotKey` ya başarısız olur ya da hiç WM_HOTKEY gelmez.
//! Bu yüzden PrintScreen içeren kısayolu ayrı bir iş parçacığında WH_KEYBOARD_LL kancasıyla
//! dinliyoruz. Diğer tüm tuşlar ve eşleşmeyen PrintScreen basışları `CallNextHookEx` ile
//! olduğu gibi diğer uygulamalara geçer; yalnız bizim kısayolumuzla tam eşleşen basış
//! (kayıtlı bir kısayolun yaptığı gibi) yutulur ki Ekran Alıntısı Aracı oyunun üstünde açılmasın.

/// Kısayol değiştirici bitleri
pub const MOD_CTRL: u8 = 1;
pub const MOD_SHIFT: u8 = 2;
pub const MOD_ALT: u8 = 4;
pub const MOD_WIN: u8 = 8;

#[cfg(windows)]
mod imp {
    use super::*;
    use parking_lot::Mutex;
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU8, Ordering};
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_SNAPSHOT,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        TranslateMessage, UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    /// Dinlenen tuş (sanal tuş kodu). Varsayılan PrintScreen; `RegisterHotKey` başarısız olursa
    /// başka bir tuş (ör. F12, Windows'ta hata ayıklayıcıya ayrılmış olabilir) için de kullanılır.
    static VK: AtomicU32 = AtomicU32::new(VK_SNAPSHOT as u32);
    /// İstenen değiştiriciler
    static MODS: AtomicU8 = AtomicU8::new(0);
    /// PrintScreen basılı görüldü (kendi tekrarlarını ve bırakmayı ayırt etmek için)
    static DOWN_SEEN: AtomicBool = AtomicBool::new(false);
    /// Eşleşen basışın bırakılması da yutulacak
    static SWALLOW_UP: AtomicBool = AtomicBool::new(false);
    /// Panelde kısayol kaydedilirken kanca tuşu yutmaz/tetiklemez (tuş arayüze ulaşsın)
    static PAUSED: AtomicBool = AtomicBool::new(false);
    /// Kısayol tetiklenince çağrılır
    static ACTION: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();
    /// Kanca iş parçacığının kimliği (0: çalışmıyor)
    static THREAD: Mutex<u32> = Mutex::new(0);

    fn pressed(vk: u16) -> bool {
        unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 }
    }

    fn current_mods() -> u8 {
        let mut m = 0;
        if pressed(VK_CONTROL) {
            m |= MOD_CTRL;
        }
        if pressed(VK_SHIFT) {
            m |= MOD_SHIFT;
        }
        if pressed(VK_MENU) {
            m |= MOD_ALT;
        }
        if pressed(VK_LWIN) || pressed(VK_RWIN) {
            m |= MOD_WIN;
        }
        m
    }

    fn fire() {
        if let Some(f) = ACTION.get() {
            // Klavye kancası (FFI geri çağrısı) içinde çalışır: panic programı kapatmasın
            crate::crashlog::guard(|| f());
        }
    }

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 && lparam != 0 {
            let k = &*(lparam as *const KBDLLHOOKSTRUCT);
            if k.vkCode == VK.load(Ordering::Relaxed) && !PAUSED.load(Ordering::Relaxed) {
                let msg = wparam as u32;
                let want = MODS.load(Ordering::Relaxed);
                if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                    let first = !DOWN_SEEN.swap(true, Ordering::Relaxed);
                    if current_mods() == want {
                        if first {
                            fire();
                        }
                        SWALLOW_UP.store(true, Ordering::Relaxed);
                        return 1;
                    }
                } else if msg == WM_KEYUP || msg == WM_SYSKEYUP {
                    let had_down = DOWN_SEEN.swap(false, Ordering::Relaxed);
                    if SWALLOW_UP.swap(false, Ordering::Relaxed) {
                        return 1;
                    }
                    // Bazı sistemlerde PrintScreen için yalnız bırakma gelir
                    if !had_down && current_mods() == want {
                        fire();
                        return 1;
                    }
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    pub fn set_action(f: Box<dyn Fn() + Send + Sync>) {
        let _ = ACTION.set(f);
    }

    /// Kancayı istenen değiştiricilerle aç (zaten açıksa yalnız değiştiricileri günceller)
    pub fn enable(mods: u8) -> Result<(), String> {
        enable_key(VK_SNAPSHOT as u32, mods)
    }

    /// Kancayı verilen tuş ve değiştiricilerle aç
    pub fn enable_key(vk: u32, mods: u8) -> Result<(), String> {
        if VK.swap(vk, Ordering::Relaxed) != vk {
            DOWN_SEEN.store(false, Ordering::Relaxed);
            SWALLOW_UP.store(false, Ordering::Relaxed);
        }
        MODS.store(mods, Ordering::Relaxed);
        let mut th = THREAD.lock();
        if *th != 0 {
            return Ok(());
        }
        let (tx, rx) = std::sync::mpsc::channel::<Result<u32, String>>();
        std::thread::Builder::new()
            .name("prtsc-hook".into())
            .spawn(move || unsafe {
                let mut msg: MSG = std::mem::zeroed();
                // İleti kuyruğunu oluştur (PostThreadMessageW ile WM_QUIT alabilmek için)
                PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
                let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), GetModuleHandleW(std::ptr::null()), 0);
                if hook.is_null() {
                    let _ = tx.send(Err(std::io::Error::last_os_error().to_string()));
                    return;
                }
                let _ = tx.send(Ok(GetCurrentThreadId()));
                // Düşük seviye kancalar bu iş parçacığının ileti döngüsünde çağrılır
                loop {
                    let r = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
                    if r == 0 || r == -1 {
                        break;
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                UnhookWindowsHookEx(hook);
            })
            .map_err(|e| e.to_string())?;
        match rx.recv_timeout(std::time::Duration::from_secs(3)) {
            Ok(Ok(id)) => {
                *th = id;
                Ok(())
            }
            Ok(Err(e)) => Err(e),
            Err(_) => Err("klavye kancası başlatılamadı".into()),
        }
    }

    /// Kancayı kapat
    pub fn disable() {
        let mut th = THREAD.lock();
        if *th != 0 {
            unsafe {
                PostThreadMessageW(*th, WM_QUIT, 0, 0);
            }
            *th = 0;
        }
        DOWN_SEEN.store(false, Ordering::Relaxed);
        SWALLOW_UP.store(false, Ordering::Relaxed);
    }

    pub fn set_paused(on: bool) {
        PAUSED.store(on, Ordering::Relaxed);
        DOWN_SEEN.store(false, Ordering::Relaxed);
        SWALLOW_UP.store(false, Ordering::Relaxed);
    }

    pub const SUPPORTED: bool = true;
}

#[cfg(not(windows))]
mod imp {
    pub fn set_action(_f: Box<dyn Fn() + Send + Sync>) {}
    pub fn enable(_mods: u8) -> Result<(), String> {
        Err("desteklenmiyor".into())
    }
    pub fn enable_key(_vk: u32, _mods: u8) -> Result<(), String> {
        Err("desteklenmiyor".into())
    }
    pub fn disable() {}
    pub fn set_paused(_on: bool) {}
    pub const SUPPORTED: bool = false;
}

pub use imp::{disable, enable, enable_key, set_action, set_paused, SUPPORTED};

/// F1–F24 tuşlarının Windows sanal tuş kodu (VK_F1 = 0x70)
pub fn vk_function_key(n: u32) -> Option<u32> {
    (1..=24).contains(&n).then(|| 0x6F + n)
}

#[cfg(test)]
mod tests {
    #[test]
    fn function_key_codes() {
        assert_eq!(super::vk_function_key(1), Some(0x70));
        assert_eq!(super::vk_function_key(12), Some(0x7B));
        assert_eq!(super::vk_function_key(0), None);
        assert_eq!(super::vk_function_key(25), None);
    }
}
