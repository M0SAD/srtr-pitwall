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
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
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
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem / 60) % 60,
        rem % 60
    )
}

fn path() -> PathBuf {
    let g = PATH.lock().unwrap_or_else(|e| e.into_inner());
    g.clone()
        .unwrap_or_else(|| std::env::temp_dir().join(FALLBACK_FILE))
}

/// Windows olay günlüğünden son `window_ms` içindeki pitwall.exe çökme kayıtları (Application Error / Windows Error
/// Reporting: hata kodu, hatalı modül) ve Windows'un kapatılması / yeniden başlatılması (System: 1074, 6008).
#[cfg(windows)]
fn windows_events(window_ms: u64) -> Vec<String> {
    use std::os::windows::process::CommandExt;
    let run = |log: &str, q: String| -> String {
        std::process::Command::new("wevtutil")
            .args(["qe", log, &format!("/q:{q}"), "/c:12", "/rd:true", "/f:text"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default()
    };
    let mut out = Vec::new();
    let app = run(
        "Application",
        format!("*[System[(Provider[@Name='Application Error'] or Provider[@Name='Windows Error Reporting']) and TimeCreated[timediff(@SystemTime) <= {window_ms}]]]"),
    );
    for ev in app.split("Event[").skip(1) {
        if !ev.to_ascii_lowercase().contains("pitwall") {
            continue;
        }
        let one: String = ev
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with("Log Name") && !l.starts_with("Task:") && !l.starts_with("Keyword") && !l.starts_with("User") && !l.starts_with("Computer") && !l.starts_with("Opcode"))
            .collect::<Vec<_>>()
            .join(" | ");
        out.push(format!("Windows olay günlüğü (çökme): {}", one.chars().take(700).collect::<String>()));
        if out.len() >= 3 {
            break;
        }
    }
    let sys = run(
        "System",
        format!("*[System[(EventID=1074 or EventID=6008) and TimeCreated[timediff(@SystemTime) <= {window_ms}]]]"),
    );
    if sys.contains("Event[") {
        out.push("Windows olay günlüğü: bu arada Windows kapatıldı / yeniden başlatıldı (kapanma bu yüzden olabilir)".into());
    }
    if out.is_empty() {
        out.push("Windows olay günlüğünde pitwall.exe için çökme kaydı yok (program kapatılmış ya da sonlandırılmış olabilir)".into());
    }
    out
}

/// Uygulama veri klasörü (ayarlandıysa)
#[cfg_attr(not(windows), allow(dead_code))]
pub fn data_dir() -> Option<PathBuf> {
    let g = PATH.lock().unwrap_or_else(|e| e.into_inner());
    g.as_ref().and_then(|p| p.parent().map(|d| d.to_path_buf()))
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
    if std::fs::metadata(&p)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = std::fs::rename(&p, p.with_file_name("crash.old.log"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&p)
    {
        let _ = f.write_all(text.as_bytes());
        let _ = f.flush();
    }
}

// ---------------------------------------------------------------------------
// İz (kırıntı): yerel kod (Windows API, COM, ses, ham giriş…) çağrılarının son N'si, zamanıyla. Bellek (heap) bozulması
// çoğu zaman bozan yerde değil, sonradan başka bir iş parçacığında çöker; çökmede ve yığın denetimi bozulma
// bulduğunda bu iz yazılır: bozan çağrının hangisi olduğunu daraltmak için. Bellek ayırmaz (sabit halka).
// ---------------------------------------------------------------------------

const CRUMBS: usize = 48;
/// (etiket, son çağrı: açılıştan beri ms, toplam çağrı sayısı); her etiket bir kez (sık çağrılanlar diğerlerini silmesin)
type Crumb = (&'static str, u64, u32);
static CRUMB_TABLE: parking_lot::Mutex<([Crumb; CRUMBS], usize)> = parking_lot::const_mutex(([("", 0, 0); CRUMBS], 0));
static T0: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

fn since_start_ms() -> u64 {
    T0.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// Yerel kod çağrısı izi (ör. "music:volume", "ptt:hid-info"): etiketin son çağrı zamanı ve sayısı tutulur
pub fn crumb(label: &'static str) {
    let t = since_start_ms();
    let mut g = CRUMB_TABLE.lock();
    let (tab, n) = &mut *g;
    for c in tab[..*n].iter_mut() {
        // Etiketler sabit metin: önce adres, olmazsa içerik karşılaştırılır
        if std::ptr::eq(c.0, label) || c.0 == label {
            c.1 = t;
            c.2 = c.2.saturating_add(1);
            return;
        }
    }
    if *n < CRUMBS {
        tab[*n] = (label, t, 1);
        *n += 1;
    }
}

/// Son `max` etiketi en eskiden en yeniye yazar (bellek ayırmadan; kilit alınamazsa boş)
#[cfg_attr(not(windows), allow(dead_code))]
fn write_crumbs(out: &mut impl std::fmt::Write, max: usize) {
    let Some(g) = CRUMB_TABLE.try_lock() else { return };
    let mut list = [("", 0u64, 0u32); CRUMBS];
    let n = g.1;
    list[..n].copy_from_slice(&g.0[..n]);
    drop(g);
    let list = &mut list[..n];
    list.sort_unstable_by_key(|c| c.1);
    let now = since_start_ms();
    let from = list.len().saturating_sub(max);
    for c in &list[from..] {
        let _ = write!(out, "  {} -{:.1}s (x{})\r\n", c.0, now.saturating_sub(c.1) as f64 / 1000.0, c.2);
    }
}

/// Günlüğe tek satır not (ör. bir iş parçacığının yeniden başlatıldığı)
pub fn note(msg: &str) {
    let msg: String = msg
        .chars()
        .filter(|c| !c.is_control())
        .take(MSG_MAX)
        .collect();
    append(&format!(
        "[{}] v{} {msg}\n",
        stamp(now_secs()),
        env!("CARGO_PKG_VERSION")
    ));
}

// ---------------------------------------------------------------------------
// Oturum izi: program beklenmedik kapanırsa (panic yazılamadan süreç sonlandı, bellek bitti, Görev Yöneticisi,
// sürücü çökmesi...) bir sonraki açılışta crash.log'a kaydedilir. Çalışırken `session.lock` dosyası 30 sn'de bir
// güncellenir (zaman, çalışma süresi, bellek, son durum); temiz çıkışta silinir.
// ---------------------------------------------------------------------------

static SESSION: Mutex<Option<PathBuf>> = Mutex::new(None);
static SESSION_INFO: Mutex<String> = Mutex::new(String::new());
static SESSION_START: AtomicU64 = AtomicU64::new(0);
static PEAK_MB: AtomicU64 = AtomicU64::new(0);

/// Sürecin bellek kullanımı (çalışma kümesi, MB); bilinmiyorsa 0
pub fn memory_mb() -> u64 {
    #[cfg(windows)]
    {
        #[repr(C)]
        #[allow(dead_code)]
        struct Pmc {
            cb: u32,
            page_faults: u32,
            peak_ws: usize,
            ws: usize,
            q1: usize,
            q2: usize,
            q3: usize,
            q4: usize,
            pagefile: usize,
            peak_pagefile: usize,
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn GetCurrentProcess() -> *mut std::ffi::c_void;
            fn K32GetProcessMemoryInfo(h: *mut std::ffi::c_void, c: *mut Pmc, cb: u32) -> i32;
        }
        let mut c: Pmc = unsafe { std::mem::zeroed() };
        c.cb = std::mem::size_of::<Pmc>() as u32;
        // SAFETY: geçerli sözde tutamak ve doğru boyutlu yapı
        if unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb) } != 0 {
            return (c.ws / (1024 * 1024)) as u64;
        }
        0
    }
    #[cfg(not(windows))]
    {
        std::fs::read_to_string("/proc/self/statm")
            .ok()
            .and_then(|s| {
                s.split_whitespace()
                    .nth(1)
                    .and_then(|x| x.parse::<u64>().ok())
            })
            .map(|pages| pages * 4096 / (1024 * 1024))
            .unwrap_or(0)
    }
}

/// Son durum (ör. "iracing bağlı"): beklenmedik kapanışta günlüğe yazılır
pub fn session_info(s: &str) {
    *SESSION_INFO.lock().unwrap_or_else(|e| e.into_inner()) = s.chars().take(160).collect();
}

fn session_text() -> String {
    let now = now_secs();
    let start = SESSION_START.load(Ordering::Relaxed);
    let mb = memory_mb();
    let peak = PEAK_MB.fetch_max(mb, Ordering::Relaxed).max(mb);
    let info = SESSION_INFO
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    format!(
        "v={}\nstart={start}\nbeat={now}\nmem={mb}\npeak={peak}\ninfo={info}\n",
        env!("CARGO_PKG_VERSION")
    )
}

/// Açılışta (günlük klasörü belli olunca) çağrılır: önceki oturum temiz kapanmadıysa günlüğe yazar,
/// yeni oturum dosyasını başlatır ve 30 sn'lik kalp atışını kurar.
pub fn session_start(dir: &std::path::Path) {
    let p = dir.join("session.lock");
    if let Ok(prev) = std::fs::read_to_string(&p) {
        let get = |k: &str| {
            prev.lines()
                .find_map(|l| l.strip_prefix(&format!("{k}=")))
                .unwrap_or("")
                .to_string()
        };
        let start: u64 = get("start").parse().unwrap_or(0);
        let beat: u64 = get("beat").parse().unwrap_or(0);
        let mins = beat.saturating_sub(start) / 60;
        note(&format!(
            "ÖNCEKİ OTURUM BEKLENMEDİK KAPANDI (Windows kapatıldıysa normaldir): sürüm {}, açılış {}, son işaret {} ({} dk çalıştı), bellek {} MB (en çok {} MB), son durum: {}",
            get("v"),
            if start > 0 { stamp(start) } else { "?".into() },
            if beat > 0 { stamp(beat) } else { "?".into() },
            mins,
            get("mem"),
            get("peak"),
            get("info")
        ));
        // Windows olay günlüğünde bu oturumda pitwall.exe için çökme kaydı var mı (bellek bozulması çoğu zaman
        // "hızlı sonlandırma" ile biter: süreç içindeki çökme süzgecine hiç uğramaz, yalnızca Windows kaydeder)
        #[cfg(windows)]
        {
            let window_ms = now_secs().saturating_sub(start.max(1)).saturating_add(120).min(7 * 86_400) * 1000;
            let _ = std::thread::Builder::new()
                .name("crash-events".into())
                .spawn(move || {
                    for line in windows_events(window_ms) {
                        note(&line);
                    }
                });
        }
    }
    if std::env::args().any(|a| a == "--restarted") {
        note("program çöktükten sonra Windows tarafından kendiliğinden yeniden açıldı");
    }
    SESSION_START.store(now_secs(), Ordering::Relaxed);
    *SESSION.lock().unwrap_or_else(|e| e.into_inner()) = Some(p.clone());
    let _ = std::fs::write(&p, session_text());
    let _ = std::thread::Builder::new()
        .name("session-beat".into())
        .spawn(move || {
            let mut warned = false;
            loop {
                std::thread::sleep(Duration::from_secs(30));
                let Some(p) = SESSION.lock().unwrap_or_else(|e| e.into_inner()).clone() else {
                    return;
                };
                let text = session_text();
                let _ = std::fs::write(&p, &text);
                // Bellek sızıntısı belirtisi: bir kez not düşülür
                let mb = memory_mb();
                if mb > 2500 && !warned {
                    warned = true;
                    note(&format!("bellek kullanımı yüksek: {mb} MB"));
                }
            }
        });
}

/// Temiz çıkış: oturum dosyası silinir (bir sonraki açılışta "beklenmedik kapandı" yazılmaz)
pub fn session_end() {
    if let Some(p) = SESSION.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = std::fs::remove_file(p);
    }
}

/// Günlük dosyalarının klasörü
pub fn log_dir() -> PathBuf {
    let p = path();
    p.parent()
        .map(|d| d.to_path_buf())
        .unwrap_or_else(std::env::temp_dir)
}

/// Günlüklerin son kısmı (panelde "Hata günlüğü"): crash.log + önceki açılışın adımları (boot.old.log)
pub fn read_logs(max: usize) -> String {
    let dir = log_dir();
    let tail = |name: &str, n: usize| -> String {
        match std::fs::read(dir.join(name)) {
            Ok(b) => {
                let s = String::from_utf8_lossy(&b[b.len().saturating_sub(n)..]).to_string();
                format!("===== {name} ({} bayt) =====\n{s}\n", b.len())
            }
            Err(_) => String::new(),
        }
    };
    let mut out = format!(
        "SRTR Pitwall v{} · {} · bellek {} MB\n\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        memory_mb()
    );
    out.push_str(&tail(FILE, max));
    out.push_str(&tail("crash.old.log", max / 4));
    out.push_str(&tail("boot.old.log", 6000));
    out
}

/// Genel panic kancasını kurar. Uygulama açılışında, her şeyden önce çağrılır.
pub fn install() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Sel önleme: ilk FULL_ENTRIES kayıttan sonra en çok dakikada bir
        let n = COUNT.fetch_add(1, Ordering::Relaxed);
        let now = now_secs();
        if n >= FULL_ENTRIES
            && now.saturating_sub(LAST_SECS.load(Ordering::Relaxed)) < THROTTLE_SECS
        {
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
        let msg: String = msg
            .chars()
            .filter(|c| !c.is_control())
            .take(MSG_MAX)
            .collect();
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "?".into());
        let th = std::thread::current();
        let name = th.name().unwrap_or("(adsız)").to_string();
        // Geri izleme pahalıdır: yalnızca ilk kayıtlarda alınır
        let bt = if n < FULL_ENTRIES {
            format!("{}", std::backtrace::Backtrace::force_capture())
        } else {
            String::new()
        };
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
        seh::start_heap_watch();
    }
    let _ = since_start_ms();
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
            note(&format!(
                "thread '{what}' recovered from panic (#{fails}), restarting"
            ));
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
        fn CreateFileW(
            name: *const u16,
            access: u32,
            share: u32,
            sec: *mut c_void,
            disp: u32,
            flags: u32,
            template: *mut c_void,
        ) -> *mut c_void;
        fn WriteFile(
            h: *mut c_void,
            buf: *const u8,
            len: u32,
            written: *mut u32,
            overlapped: *mut c_void,
        ) -> i32;
        fn CloseHandle(h: *mut c_void) -> i32;
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
        fn GetCurrentThreadId() -> u32;
        fn GetModuleHandleExW(flags: u32, addr: *const c_void, module: *mut *mut c_void) -> i32;
        fn GetModuleFileNameW(module: *mut c_void, buf: *mut u16, size: u32) -> u32;
        fn RtlCaptureStackBackTrace(
            skip: u32,
            count: u32,
            frames: *mut *mut c_void,
            hash: *mut u32,
        ) -> u16;
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
        let w: Vec<u16> = p
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        // Sızdırılır: süzgeç çalışırken geçerli kalmalı (önceki yol da sızdırılmış kalır; bir kez çağrılır)
        let leaked: &'static mut [u16] = Box::leak(w.into_boxed_slice());
        PATH_W.store(leaked.as_mut_ptr(), Ordering::SeqCst);
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetProcessHeap() -> *mut c_void;
        fn HeapValidate(heap: *mut c_void, flags: u32, mem: *const c_void) -> i32;
    }

    /// Yığın (heap) denetimi: 2 saniyede bir süreç yığını doğrulanır. Bozulma bulunursa (çökmeden önce) zamanı ve
    /// son yerel çağrılar günlüğe yazılır: bozulma son başarılı denetimle bu denetim arasındaki çağrılardan birindedir.
    /// Bellek ayırmaz (bozuk yığından ayırmak da çökertebilir). Bir kez yazar.
    pub fn start_heap_watch() {
        let _ = std::thread::Builder::new().name("heapwatch".into()).spawn(|| {
            let mut ok_at = super::since_start_ms();
            loop {
                std::thread::sleep(std::time::Duration::from_secs(2));
                // SAFETY: süreç yığını tanıtıcısı her zaman geçerlidir; mem null: tüm yığın denetlenir.
                let good = unsafe { HeapValidate(GetProcessHeap(), 0, std::ptr::null()) } != 0;
                let now = super::since_start_ms();
                if good {
                    ok_at = now;
                    continue;
                }
                let path = PATH_W.load(Ordering::SeqCst);
                if path.is_null() {
                    return;
                }
                use std::fmt::Write;
                let mut buf = Buf { b: [0u8; 4096], n: 0 };
                let secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let _ = write!(
                    buf,
                    "\r\n==== YIGIN (HEAP) BOZULDU unix={} v{} ====\r\nson saglam denetim {:.1} sn once; bu aradaki yerel cagrilardan biri bozdu.\r\nson yerel çağrılar (önce eskiler; -sn: kaç sn önce):\r\n",
                    secs,
                    env!("CARGO_PKG_VERSION"),
                    now.saturating_sub(ok_at) as f64 / 1000.0
                );
                super::write_crumbs(&mut buf, 40);
                unsafe {
                    let h = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ_WRITE, std::ptr::null_mut(), OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, std::ptr::null_mut());
                    if !h.is_null() && h as isize != -1 {
                        let mut written = 0u32;
                        WriteFile(h, buf.b.as_ptr(), buf.n as u32, &mut written, std::ptr::null_mut());
                        CloseHandle(h);
                    }
                }
                return;
            }
        });
    }

    pub fn install() {
        // SAFETY: süzgeç 'static bir işlevdir; dönen önceki süzgeç zincirleme için saklanır.
        let prev = unsafe { SetUnhandledExceptionFilter(Some(filter)) };
        PREV.store(prev.map(|f| f as usize).unwrap_or(0), Ordering::SeqCst);
    }

    struct Buf {
        b: [u8; 4096],
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
                let secs = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let mut buf = Buf {
                    b: [0u8; 4096],
                    n: 0,
                };
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
                    let _ = write!(
                        buf,
                        "access: kind={} target=0x{:X}\r\n",
                        rec.info[0], rec.info[1]
                    );
                }
                // Hangi modülde (DLL) çöktü + çağrı yığını (modül+ofset)
                let _ = buf.write_str("module: ");
                write_module(&mut buf, addr);
                let _ = buf.write_str("\r\nstack:\r\n");
                let mut frames: [*mut c_void; 24] = [std::ptr::null_mut(); 24];
                let got = RtlCaptureStackBackTrace(
                    0,
                    frames.len() as u32,
                    frames.as_mut_ptr(),
                    std::ptr::null_mut(),
                ) as usize;
                for f in frames.iter().take(got.min(frames.len())) {
                    let _ = buf.write_str("  ");
                    write_module(&mut buf, *f as usize);
                    let _ = buf.write_str("\r\n");
                }
                let _ = buf.write_str("son yerel çağrılar (önce eskiler; -sn: kaç sn önce):\r\n");
                super::write_crumbs(&mut buf, 30);
                let h = CreateFileW(
                    path,
                    FILE_APPEND_DATA,
                    FILE_SHARE_READ_WRITE,
                    std::ptr::null_mut(),
                    OPEN_ALWAYS,
                    FILE_ATTRIBUTE_NORMAL,
                    std::ptr::null_mut(),
                );
                if !h.is_null() && h as isize != -1 {
                    let mut written = 0u32;
                    WriteFile(
                        h,
                        buf.b.as_ptr(),
                        buf.n as u32,
                        &mut written,
                        std::ptr::null_mut(),
                    );
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
    fn crumbs_keep_each_label_once() {
        for _ in 0..100 {
            crumb("test:a");
        }
        crumb("test:b");
        let mut out = String::new();
        write_crumbs(&mut out, 48);
        assert!(out.contains("test:a") && out.contains("(x100)") && out.contains("test:b"), "{out}");
        assert!(out.find("test:a").unwrap() < out.find("test:b").unwrap());
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

    #[test]
    fn detects_unclean_previous_session() {
        let dir = std::env::temp_dir().join(format!("pw-sess-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        set_dir(dir.clone());
        std::fs::write(
            dir.join("session.lock"),
            "v=1.0.1\nstart=1000\nbeat=1600\nmem=512\npeak=900\ninfo=oyuna bağlı\n",
        )
        .unwrap();
        session_start(&dir);
        let log = std::fs::read_to_string(dir.join(FILE)).unwrap();
        assert!(log.contains("BEKLENMEDİK KAPANDI"), "{log}");
        assert!(log.contains("10 dk") && log.contains("512 MB") && log.contains("oyuna bağlı"));
        assert!(dir.join("session.lock").exists());
        session_end();
        assert!(!dir.join("session.lock").exists());
        assert!(read_logs(10_000).contains("crash.log"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
