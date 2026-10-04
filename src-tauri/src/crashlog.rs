//! Çökme günlüğü ve emniyet ağı.
//!
//! - `install()`: genel panic kancası. Her panic `crash.log` dosyasına yazılır: zaman (UTC), sürüm, iş parçacığı,
//!   mesaj, konum ve geri izleme. Dosya uygulama veri klasöründedir (`set_dir` çağrılana kadar geçici klasörde
//!   `srtr-pitwall-crash.log`). Kullanıcı verisi yazılmaz; mesaj kısaltılır, dosya boyutu sınırlıdır.
//! - `guard()`: bir işi `catch_unwind` ile sarar; panic olursa (kanca günlüğe yazmıştır) `None` döner ve
//!   çağıran döngü devam eder. Sürüm profili `panic = "unwind"` olduğu için sürüm derlemesinde de etkilidir.
//! - `past()`: `Instant::now() - süre` yerine; Windows'ta açılıştan kısa süre sonra bu çıkarma panic yapar.
//! - Windows: işlenmeyen yapısal istisnalar (erişim ihlali, yığın taşması…) için kod + adres satırı yazılır.

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const FILE: &str = "crash.log";
const FALLBACK_FILE: &str = "srtr-pitwall-crash.log";
/// Dosya bundan büyükse `crash.old.log` olarak ayrılır ve yenisi başlar
const MAX_BYTES: u64 = 512 * 1024;
/// İlk bu kadar panic ayrıntısıyla yazılır; sonrası en çok `THROTTLE_SECS` saniyede bir
const FULL_ENTRIES: u32 = 25;
const THROTTLE_SECS: u64 = 60;
const MSG_MAX: usize = 400;

static PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
static WRITE_LOCK: Mutex<()> = Mutex::new(());
static COUNT: AtomicU32 = AtomicU32::new(0);
static LAST_SECS: AtomicU64 = AtomicU64::new(0);
static SKIPPED: AtomicU32 = AtomicU32::new(0);

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Unix saniyesi → "YYYY-MM-DD HH:MM:SSZ" (bağımlılıksız)
fn stamp(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Howard Hinnant "civil_from_days"
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}Z", rem / 3600, (rem / 60) % 60, rem % 60)
}

fn path() -> PathBuf {
    let g = PATH.lock().unwrap_or_else(|e| e.into_inner());
    g.clone().unwrap_or_else(|| std::env::temp_dir().join(FALLBACK_FILE))
}

/// Günlük klasörünü ayarlar (uygulama veri klasörü). Kurulumda bir kez çağrılır.
pub fn set_dir(dir: PathBuf) {
    let _ = std::fs::create_dir_all(&dir);
    let p = dir.join(FILE);
    #[cfg(windows)]
    seh::set_path(&p);
    *PATH.lock().unwrap_or_else(|e| e.into_inner()) = Some(p);
}

fn append(text: &str) {
    let _g = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let p = path();
    if std::fs::metadata(&p).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(&p, p.with_file_name("crash.old.log"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&p) {
        let _ = f.write_all(text.as_bytes());
        let _ = f.flush();
    }
}

/// Günlüğe tek satır not (ör. bir iş parçacığının yeniden başlatıldığı)
pub fn note(msg: &str) {
    let msg: String = msg.chars().filter(|c| !c.is_control()).take(MSG_MAX).collect();
    append(&format!("[{}] v{} {msg}\n", stamp(now_secs()), env!("CARGO_PKG_VERSION")));
}

/// Genel panic kancasını kurar. Uygulama açılışında, her şeyden önce çağrılır.
pub fn install() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Sel önleme: ilk FULL_ENTRIES kayıttan sonra en çok dakikada bir
        let n = COUNT.fetch_add(1, Ordering::Relaxed);
        let now = now_secs();
        if n >= FULL_ENTRIES && now.saturating_sub(LAST_SECS.load(Ordering::Relaxed)) < THROTTLE_SECS {
            SKIPPED.fetch_add(1, Ordering::Relaxed);
            return;
        }
        LAST_SECS.store(now, Ordering::Relaxed);
        let skipped = SKIPPED.swap(0, Ordering::Relaxed);

        let payload = info.payload();
        let msg = payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(mesaj yok)".into());
        let msg: String = msg.chars().filter(|c| !c.is_control()).take(MSG_MAX).collect();
        let loc = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "?".into());
        let th = std::thread::current();
        let name = th.name().unwrap_or("(adsız)").to_string();
        // Geri izleme pahalıdır: yalnızca ilk kayıtlarda alınır
        let bt = if n < FULL_ENTRIES { format!("{}", std::backtrace::Backtrace::force_capture()) } else { String::new() };
        let bt: String = bt.chars().take(12_000).collect();
        let mut text = format!(
            "\n==== PANIC [{}] v{} ({}) ====\nthread: {name}\nlocation: {loc}\nmessage: {msg}\n",
            stamp(now),
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS
        );
        if skipped > 0 {
            text.push_str(&format!("(skipped {skipped} similar entries)\n"));
        }
        if !bt.is_empty() {
            text.push_str("backtrace:\n");
            text.push_str(&bt);
            text.push('\n');
        }
        append(&text);
        prev(info);
    }));
    #[cfg(windows)]
    {
        seh::set_path(&path());
        seh::install();
    }
}

/// `f`'yi çalıştırır; panic olursa yutar (kanca günlüğe yazmıştır) ve `None` döner.
pub fn guard<R>(f: impl FnOnce() -> R) -> Option<R> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).ok()
}

/// Uzun ömürlü bir iş parçacığı gövdesini sarar: gövde panic ile çıkarsa günlüğe not düşer ve kısa bir
/// beklemeden sonra yeniden başlatır (art arda çok hızlı çökerse bekleme uzar). Gövde normal dönerse biter.
pub fn supervise(what: &str, mut body: impl FnMut()) {
    let mut fails = 0u32;
    loop {
        let started = Instant::now();
        if guard(&mut body).is_some() {
            return;
        }
        if started.elapsed() > Duration::from_secs(60) {
            fails = 0;
        }
        fails = fails.saturating_add(1);
        if fails <= 5 || fails % 50 == 0 {
            note(&format!("thread '{what}' recovered from panic (#{fails}), restarting"));
        }
        std::thread::sleep(Duration::from_millis(if fails < 5 { 200 } else { 2000 }));
    }
}

/// "Şu andan `secs` saniye önce". `Instant::now() - Duration` Windows'ta bilgisayar açılalı bu süreden az
/// olmuşsa panic yapar; burada o durumda "şimdi" döner.
pub fn past(secs: u64) -> Instant {
    let now = Instant::now();
    now.checked_sub(Duration::from_secs(secs)).unwrap_or(now)
}

/// Windows: işlenmeyen yapısal istisna süzgeci. Yalnızca kernel32 çağrıları ve yığın tamponu kullanır
/// (bellek ayırmaz); satırı yazıp önceki süzgece / varsayılan işleyişe devreder.
#[cfg(windows)]
mod seh {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicUsize, Ordering};

    #[repr(C)]
    struct ExceptionRecord {
        code: u32,
        flags: u32,
        record: *mut ExceptionRecord,
        address: *mut c_void,
        n_params: u32,
        info: [usize; 15],
    }
    #[repr(C)]
    struct ExceptionPointers {
        record: *mut ExceptionRecord,
        context: *mut c_void,
    }
    type Filter = unsafe extern "system" fn(*mut ExceptionPointers) -> i32;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetUnhandledExceptionFilter(filter: Option<Filter>) -> Option<Filter>;
        fn CreateFileW(name: *const u16, access: u32, share: u32, sec: *mut c_void, disp: u32, flags: u32, template: *mut c_void) -> *mut c_void;
        fn WriteFile(h: *mut c_void, buf: *const u8, len: u32, written: *mut u32, overlapped: *mut c_void) -> i32;
        fn CloseHandle(h: *mut c_void) -> i32;
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
        fn GetCurrentThreadId() -> u32;
        fn GetModuleHandleExW(flags: u32, addr: *const c_void, module: *mut *mut c_void) -> i32;
        fn GetModuleFileNameW(module: *mut c_void, buf: *mut u16, size: u32) -> u32;
        fn RtlCaptureStackBackTrace(skip: u32, count: u32, frames: *mut *mut c_void, hash: *mut u32) -> u16;
    }

    /// `addr`'ı içeren modülün dosya adını (yol olmadan, ASCII) ve modül içi ofseti `buf`'a yazar: "ad.dll+0x1234".
    /// Bellek ayırmaz. Modül bulunamazsa ham adresi yazar.
    unsafe fn write_module(buf: &mut Buf, addr: usize) {
        use std::fmt::Write;
        let mut hmod: *mut c_void = std::ptr::null_mut();
        // 0x4: FROM_ADDRESS, 0x2: UNCHANGED_REFCOUNT
        if GetModuleHandleExW(0x4 | 0x2, addr as *const c_void, &mut hmod) != 0 && !hmod.is_null() {
            let mut name = [0u16; 260];
            let n = GetModuleFileNameW(hmod, name.as_mut_ptr(), name.len() as u32) as usize;
            let n = n.min(name.len());
            let mut start = 0;
            for (i, c) in name[..n].iter().enumerate() {
                if *c == b'\\' as u16 || *c == b'/' as u16 {
                    start = i + 1;
                }
            }
            for c in &name[start..n] {
                let ch = if *c < 128 { *c as u8 as char } else { '?' };
                let _ = buf.write_char(ch);
            }
            let _ = write!(buf, "+0x{:X}", addr.wrapping_sub(hmod as usize));
        } else {
            let _ = write!(buf, "0x{:X}", addr);
        }
    }

    const FILE_APPEND_DATA: u32 = 0x0004;
    const FILE_SHARE_READ_WRITE: u32 = 0x0003;
    const OPEN_ALWAYS: u32 = 4;
    const FILE_ATTRIBUTE_NORMAL: u32 = 0x80;

    /// Günlük yolu (UTF-16, sıfır sonlu). Bir kez ayrılır ve hiç serbest bırakılmaz.
    static PATH_W: AtomicPtr<u16> = AtomicPtr::new(std::ptr::null_mut());
    static PREV: AtomicUsize = AtomicUsize::new(0);
    static BUSY: AtomicBool = AtomicBool::new(false);

    pub fn set_path(p: &std::path::Path) {
        let w: Vec<u16> = p.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        // Sızdırılır: süzgeç çalışırken geçerli kalmalı (önceki yol da sızdırılmış kalır; bir kez çağrılır)
        let leaked: &'static mut [u16] = Box::leak(w.into_boxed_slice());
        PATH_W.store(leaked.as_mut_ptr(), Ordering::SeqCst);
    }

    pub fn install() {
        // SAFETY: süzgeç 'static bir işlevdir; dönen önceki süzgeç zincirleme için saklanır.
        let prev = unsafe { SetUnhandledExceptionFilter(Some(filter)) };
        PREV.store(prev.map(|f| f as usize).unwrap_or(0), Ordering::SeqCst);
    }

    struct Buf {
        b: [u8; 2048],
        n: usize,
    }
    impl std::fmt::Write for Buf {
        fn write_str(&mut self, s: &str) -> std::fmt::Result {
            let room = self.b.len() - self.n;
            let take = s.len().min(room);
            self.b[self.n..self.n + take].copy_from_slice(&s.as_bytes()[..take]);
            self.n += take;
            Ok(())
        }
    }

    unsafe extern "system" fn filter(info: *mut ExceptionPointers) -> i32 {
        // İç içe istisna (süzgecin kendisi çökerse) tekrar yazmaya çalışma
        if !BUSY.swap(true, Ordering::SeqCst) {
            let path = PATH_W.load(Ordering::SeqCst);
            if !path.is_null() && !info.is_null() && !(*info).record.is_null() {
                use std::fmt::Write;
                let rec = &*(*info).record;
                let base = GetModuleHandleW(std::ptr::null()) as usize;
                let addr = rec.address as usize;
                let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                let mut buf = Buf { b: [0u8; 2048], n: 0 };
                let _ = write!(
                    buf,
                    "\r\n==== UNHANDLED EXCEPTION unix={} v{} ====\r\ncode: 0x{:08X}\r\naddress: 0x{:X} (exe base 0x{:X}, offset 0x{:X})\r\nthread id: {}\r\n",
                    secs,
                    env!("CARGO_PKG_VERSION"),
                    rec.code,
                    addr,
                    base,
                    addr.wrapping_sub(base),
                    GetCurrentThreadId()
                );
                // Erişim ihlali: okuma/yazma türü ve hedef adres
                if rec.code == 0xC000_0005 && rec.n_params >= 2 {
                    let _ = write!(buf, "access: kind={} target=0x{:X}\r\n", rec.info[0], rec.info[1]);
                }
                // Hangi modülde (DLL) çöktü + çağrı yığını (modül+ofset)
                let _ = buf.write_str("module: ");
                write_module(&mut buf, addr);
                let _ = buf.write_str("\r\nstack:\r\n");
                let mut frames: [*mut c_void; 24] = [std::ptr::null_mut(); 24];
                let got = RtlCaptureStackBackTrace(0, frames.len() as u32, frames.as_mut_ptr(), std::ptr::null_mut()) as usize;
                for f in frames.iter().take(got.min(frames.len())) {
                    let _ = buf.write_str("  ");
                    write_module(&mut buf, *f as usize);
                    let _ = buf.write_str("\r\n");
                }
                let h = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ_WRITE, std::ptr::null_mut(), OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, std::ptr::null_mut());
                if !h.is_null() && h as isize != -1 {
                    let mut written = 0u32;
                    WriteFile(h, buf.b.as_ptr(), buf.n as u32, &mut written, std::ptr::null_mut());
                    CloseHandle(h);
                }
            }
        }
        let prev = PREV.load(Ordering::SeqCst);
        if prev != 0 {
            // SAFETY: değer SetUnhandledExceptionFilter'ın döndürdüğü geçerli işlev işaretçisidir.
            let f: Filter = std::mem::transmute::<usize, Filter>(prev);
            return f(info);
        }
        0 // EXCEPTION_CONTINUE_SEARCH: varsayılan işleyiş (süreç sonlanır / WER)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_formats_utc() {
        assert_eq!(stamp(0), "1970-01-01 00:00:00Z");
        assert_eq!(stamp(1_759_536_000), "2025-10-04 00:00:00Z");
        assert_eq!(stamp(951_782_400 + 86_399), "2000-02-29 23:59:59Z");
    }

    #[test]
    fn guard_swallows_panic() {
        assert_eq!(guard(|| 5), Some(5));
        let r: Option<()> = guard(|| panic!("deneme"));
        assert!(r.is_none());
    }

    #[test]
    fn past_never_panics() {
        let _ = past(u64::MAX / 4);
        assert!(past(1) <= Instant::now());
    }
}
