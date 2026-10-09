//! Açılış emniyeti: program açılmıyor gibi göründüğünde kullanıcıya sebebi gösterir, destek için iz bırakır.
//!
//! - `boot_step`: açılış adımları zaman damgasıyla `boot.log` dosyasına yazılır (her açılışta yeniden; bir önceki
//!   `boot.old.log` olarak kalır). "Açılmıyor" şikâyetinde hangi adımda takıldığı buradan görülür.
//! - `check_running_instance`: program zaten çalışıyor ama yanıt vermiyorsa (ör. donmuş eski kopya) yeni kopya
//!   ona ileti gönderirken sonsuza dek bekliyordu (imleçte dönen mavi çember, pencere yok). Artık bu durum
//!   saptanır, kullanıcıya sorulur ve donmuş kopya kapatılıp program yeniden açılır.
//! - `fatal`: kurulum hatası (ör. WebView2 açılamadı) sessizce kapanmak yerine pencereyle gösterilir.
//! - `watch_panel`: elle açılışta kontrol paneli belli bir sürede yüklenmezse sebep ve günlük yeri gösterilir.

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use parking_lot::Mutex;

static T0: Mutex<Option<Instant>> = parking_lot::const_mutex(None);
/// Klasör ayarlanana kadar biriken satırlar
static PENDING: Mutex<Vec<String>> = parking_lot::const_mutex(Vec::new());
static PATH: Mutex<Option<PathBuf>> = parking_lot::const_mutex(None);
/// Kontrol panelinin sayfası yüklendi
static PANEL_LOADED: AtomicBool = AtomicBool::new(false);

fn elapsed_ms() -> u128 {
    let mut t = T0.lock();
    t.get_or_insert_with(Instant::now).elapsed().as_millis()
}

/// Açılış adımı: "1234 ms  adım"
pub fn boot_step(what: &str) {
    let line = format!("{:>6} ms  {what}\n", elapsed_ms());
    let path = PATH.lock().clone();
    match path {
        Some(p) => {
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&p) {
                let _ = f.write_all(line.as_bytes());
            }
        }
        None => PENDING.lock().push(line),
    }
}

/// Günlük klasörü belli oldu: `boot.log` yeniden başlar, bekleyen satırlar yazılır
pub fn set_dir(dir: PathBuf) {
    let _ = std::fs::create_dir_all(&dir);
    let p = dir.join("boot.log");
    if p.exists() {
        let _ = std::fs::rename(&p, dir.join("boot.old.log"));
    }
    let head = format!(
        "SRTR Pitwall {} açılış günlüğü ({})\nargs: {:?}\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::args().skip(1).collect::<Vec<_>>()
    );
    let mut text = head;
    for l in PENDING.lock().drain(..) {
        text.push_str(&l);
    }
    let _ = std::fs::write(&p, text);
    *PATH.lock() = Some(p);
}

fn log_dir_text() -> String {
    PATH.lock()
        .as_ref()
        .and_then(|p| p.parent().map(|d| d.display().to_string()))
        .unwrap_or_else(|| std::env::temp_dir().display().to_string())
}

/// Windows arayüz dili Türkçe mi (yerel uyarı pencereleri, ayarlar okunmadan önce de gösterilir)
pub fn turkish() -> bool {
    #[cfg(windows)]
    {
        // LANGID'in alt 10 biti birincil dil; 0x1F = Türkçe
        let id = unsafe { windows_sys::Win32::Globalization::GetUserDefaultUILanguage() };
        (id & 0x3ff) == 0x1f
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn pick<'a>(tr: &'a str, en: &'a str) -> &'a str {
    if turkish() {
        tr
    } else {
        en
    }
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Yerel uyarı penceresi; `yes_no` ise "Evet"e basıldı mı döner
fn message(text: &str, yes_no: bool) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            MessageBoxW, IDYES, MB_ICONERROR, MB_ICONWARNING, MB_OK, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO,
        };
        let flags = (if yes_no { MB_YESNO | MB_ICONWARNING } else { MB_OK | MB_ICONERROR }) | MB_TOPMOST | MB_SETFOREGROUND;
        let r = unsafe { MessageBoxW(std::ptr::null_mut(), wide(text).as_ptr(), wide("SRTR Pitwall").as_ptr(), flags) };
        r == IDYES
    }
    #[cfg(not(windows))]
    {
        let _ = yes_no;
        eprintln!("{text}");
        false
    }
}

/// Program zaten çalışıyor mu, çalışıyorsa yanıt veriyor mu. Yanıt veren kopya varsa hiçbir şey yapılmaz (tek
/// örnek eklentisi paneli öne getirir). Donmuş kopya varsa kullanıcıya sorulur: kapatılıp devam edilir ya da çıkılır.
pub fn check_running_instance(identifier: &str, from_autostart: bool) {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows_sys::Win32::System::Threading::{
            OpenMutexW, OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_TERMINATE, PROCESS_SYNCHRONIZE,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            FindWindowW, GetWindowThreadProcessId, SendMessageTimeoutW, SMTO_ABORTIFHUNG, SMTO_BLOCK, WM_NULL,
        };
        // tauri-plugin-single-instance adları: "<kimlik>-sim" (mutex), "<kimlik>-sic" / "<kimlik>-siw" (pencere)
        const SYNCHRONIZE: u32 = 0x0010_0000;
        let m = OpenMutexW(SYNCHRONIZE, 0, wide(&format!("{identifier}-sim")).as_ptr());
        if m.is_null() {
            return;
        }
        CloseHandle(m);
        let hwnd = FindWindowW(wide(&format!("{identifier}-sic")).as_ptr(), wide(&format!("{identifier}-siw")).as_ptr());
        if hwnd.is_null() {
            return;
        }
        let mut res: usize = 0;
        let ok = SendMessageTimeoutW(hwnd, WM_NULL, 0, 0, SMTO_ABORTIFHUNG | SMTO_BLOCK, 5000, &mut res);
        if ok != 0 {
            boot_step("çalışan kopya yanıt veriyor: ona devrediliyor");
            return;
        }
        // Kapanmakta olan bir kopya (ör. güncelleme sonrası yeniden başlatma) da kısa süre yanıt vermeyebilir:
        // biraz beklenir, o arada kapandıysa normal açılışa devam edilir
        for _ in 0..6 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let m = OpenMutexW(SYNCHRONIZE, 0, wide(&format!("{identifier}-sim")).as_ptr());
            if m.is_null() {
                boot_step("önceki kopya kapandı");
                return;
            }
            CloseHandle(m);
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        boot_step(&format!("çalışan kopya yanıt vermiyor (pid {pid})"));
        if pid == 0 || pid == std::process::id() {
            return;
        }
        // Windows açılışında soru sorulmaz: eski kopya ne durumdaysa öyle kalır
        if from_autostart {
            std::process::exit(0);
        }
        let ask = pick(
            "SRTR Pitwall zaten çalışıyor ama yanıt vermiyor.\n\nDonmuş kopya kapatılıp program yeniden açılsın mı?",
            "SRTR Pitwall is already running but not responding.\n\nClose the frozen copy and start the program again?",
        );
        if !message(ask, true) {
            std::process::exit(0);
        }
        let h = OpenProcess(PROCESS_TERMINATE | PROCESS_SYNCHRONIZE, 0, pid);
        if h.is_null() {
            message(
                pick(
                    "Donmuş kopya kapatılamadı. Görev Yöneticisi'nden \"SRTR Pitwall\" işlemini sonlandırıp tekrar deneyin.",
                    "The frozen copy could not be closed. End the \"SRTR Pitwall\" process in Task Manager and try again.",
                ),
                false,
            );
            std::process::exit(1);
        }
        TerminateProcess(h, 1);
        let done = WaitForSingleObject(h, 8000) == WAIT_OBJECT_0;
        CloseHandle(h);
        boot_step(&format!("donmuş kopya kapatıldı: {done}"));
        // Kapanan kopyanın WebView2 süreçleri de çekilsin
        std::thread::sleep(std::time::Duration::from_millis(1200));
    }
    #[cfg(not(windows))]
    {
        let _ = (identifier, from_autostart);
    }
}

/// Program başlatılamadı: sebebi göster, günlüğe yaz ve çık
pub fn fatal(err: &str) -> ! {
    boot_step(&format!("BAŞLATILAMADI: {err}"));
    crate::crashlog::note(&format!("başlatılamadı: {err}"));
    let webview = err.to_ascii_lowercase().contains("webview");
    let text = if turkish() {
        format!(
            "SRTR Pitwall başlatılamadı.\n\n{err}\n\n{}Günlük dosyaları: {}",
            if webview {
                "Microsoft Edge WebView2 Runtime eksik ya da bozuk olabilir. https://go.microsoft.com/fwlink/p/?LinkId=2124703 adresinden kurup programı yeniden açın.\n\n"
            } else {
                ""
            },
            log_dir_text()
        )
    } else {
        format!(
            "SRTR Pitwall could not start.\n\n{err}\n\n{}Log files: {}",
            if webview {
                "Microsoft Edge WebView2 Runtime may be missing or damaged. Install it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and open the program again.\n\n"
            } else {
                ""
            },
            log_dir_text()
        )
    };
    message(&text, false);
    std::process::exit(1)
}

pub fn panel_loaded() {
    if !PANEL_LOADED.swap(true, Ordering::Relaxed) {
        boot_step("panel sayfası yüklendi");
    }
}

/// Elle açılışta panel bu sürede yüklenmezse kullanıcıya söylenir (bir kez)
pub fn watch_panel() {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(60));
        if PANEL_LOADED.load(Ordering::Relaxed) {
            return;
        }
        boot_step("UYARI: panel 60 sn içinde yüklenmedi");
        let text = if turkish() {
            format!(
                "SRTR Pitwall'ın kontrol paneli 1 dakikadır yüklenemedi.\n\nGenellikle Microsoft Edge WebView2 Runtime'ın eksik / bozuk olmasından ya da bir antivirüsün programı engellemesinden olur. WebView2'yi https://go.microsoft.com/fwlink/p/?LinkId=2124703 adresinden kurup (ya da onarıp) bilgisayarı yeniden başlatın.\n\nSorun sürerse şu klasördeki boot.log ve crash.log dosyalarını gönderin:\n{}",
                log_dir_text()
            )
        } else {
            format!(
                "The SRTR Pitwall control panel has not loaded for 1 minute.\n\nThis is usually caused by a missing / damaged Microsoft Edge WebView2 Runtime or an antivirus blocking the program. Install (or repair) WebView2 from https://go.microsoft.com/fwlink/p/?LinkId=2124703 and restart the computer.\n\nIf it continues, send the boot.log and crash.log files from this folder:\n{}",
                log_dir_text()
            )
        };
        message(&text, false);
    });
}
