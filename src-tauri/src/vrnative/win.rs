//! Yerel VR — Windows tarafı: openvr_api.dll (OpenVR düz C API'si), pencere yakalama ve fare kancası.
//!
//! Bu dosya tauri'ye bağımlı DEĞİLDİR (yalnız std, parking_lot, windows-sys): böylece ayrı bir küçük crate içinde
//! Windows hedefi için tek başına derlenip denetlenebilir.
//!
//! openvr_api.dll çalışma anında `LoadLibraryW` ile yüklenir (derlemede C/C++ araç zinciri gerekmez). Arayüzler
//! `VR_GetGenericInterface("FnTable:IVROverlay_0NN")` ile işlev tablosu olarak alınır; tablo sırası ve imzalar
//! `openvr_gen.rs` içindedir (resmi başlıktan üretilir). Her işlev işaretçisi çağrılmadan önce boş mu diye bakılır;
//! arayüz sürümü `VR_IsInterfaceVersionValid` ile SteamVR'a doğrulatılır.

use super::openvr_gen::{self as gen, ivroverlay as ov, ivrsystem as sy};
use super::{HmdMatrix34, MouseInput, OpenError, Probe, TrackedDevicePose};
use parking_lot::Mutex;
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::{Path, PathBuf};

use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, GetDC, ReleaseDC, SelectObject, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC,
};
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_SHIFT};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetAncestor, GetClientRect, GetMessageW, IsIconic,
    IsWindow, PeekMessageW, PostThreadMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
    WindowFromPoint, GA_ROOT, HC_ACTION, MSG, MSLLHOOKSTRUCT, PM_NOREMOVE, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_LBUTTONUP,
    WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_QUIT, WM_RBUTTONDOWN, WM_RBUTTONUP,
};

pub const SUPPORTED: bool = true;

// user32!PrintWindow: windows-sys'te ayrı bir özellik (Win32_Storage_Xps) ister; tek işlev için burada bildirildi.
#[link(name = "user32")]
extern "system" {
    fn PrintWindow(hwnd: HWND, hdc: HDC, flags: u32) -> i32;
}
const PW_CLIENTONLY: u32 = 0x1;
/// DirectComposition içeriğini (WebView2) de yakalar (Windows 8.1+)
const PW_RENDERFULLCONTENT: u32 = 0x2;

// ---------------------------------------------------------------------------
// openvr_api.dll
// ---------------------------------------------------------------------------

/// openvr_capi.h sonundaki S_API bildirimleri (bkz. openvr_capi_excerpt.h) + DLL'in dışa aktardığı
/// VR_IsInterfaceVersionValid (openvr.h: `S_API bool VR_IsInterfaceVersionValid(const char *pchInterfaceVersion)`).
#[derive(Clone, Copy)]
struct Api {
    init: unsafe extern "C" fn(*mut i32, i32) -> isize,
    shutdown: unsafe extern "C" fn(),
    is_hmd_present: unsafe extern "C" fn() -> u8,
    get_generic_interface: unsafe extern "C" fn(*const c_char, *mut i32) -> isize,
    is_runtime_installed: unsafe extern "C" fn() -> u8,
    init_error_description: unsafe extern "C" fn(i32) -> *const c_char,
    is_interface_version_valid: Option<unsafe extern "C" fn(*const c_char) -> u8>,
}

/// Yüklenen DLL süreç boyunca bellekte kalır (FreeLibrary yapılmaz: SteamVR iş parçacıkları kullanıyor olabilir)
static API: Mutex<Option<Api>> = parking_lot::const_mutex(None);

unsafe fn symbol(lib: *mut c_void, name: &CStr) -> Option<unsafe extern "system" fn() -> isize> {
    GetProcAddress(lib, name.as_ptr() as *const u8)
}

#[cfg(windows)]
fn wide_path(p: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    p.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
}

/// Yalnız Windows dışında tür denetimi yapılabilsin diye (bu dosya Windows dışında uygulamaya derlenmez)
#[cfg(not(windows))]
fn wide_path(p: &Path) -> Vec<u16> {
    p.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect()
}

fn load(dirs: &[PathBuf]) -> Result<Api, String> {
    let mut g = API.lock();
    if let Some(a) = *g {
        return Ok(a);
    }
    let mut last = String::from("openvr_api.dll bulunamadı");
    for d in dirs {
        let p = d.join("openvr_api.dll");
        if !p.is_file() {
            continue;
        }
        let wide = wide_path(&p);
        // SAFETY: sıfırla biten geniş karakterli yol; dönen modül süreç boyunca tutulur.
        let lib = unsafe { LoadLibraryW(wide.as_ptr()) };
        if lib.is_null() {
            last = format!("openvr_api.dll yüklenemedi: {}", std::io::Error::last_os_error());
            continue;
        }
        // SAFETY: simgeler openvr_api.dll'in dışa aktarım tablosundan adlarıyla alınır; imzalar SDK başlığındaki
        // S_API bildirimleriyle aynıdır (x64'te tek çağrı kuralı vardır).
        unsafe {
            macro_rules! sym {
                ($name:literal) => {
                    match symbol(lib, $name) {
                        Some(f) => std::mem::transmute::<unsafe extern "system" fn() -> isize, _>(f),
                        None => {
                            last = format!("openvr_api.dll: {} yok", $name.to_string_lossy());
                            continue;
                        }
                    }
                };
            }
            let api = Api {
                init: sym!(c"VR_InitInternal"),
                shutdown: sym!(c"VR_ShutdownInternal"),
                is_hmd_present: sym!(c"VR_IsHmdPresent"),
                get_generic_interface: sym!(c"VR_GetGenericInterface"),
                is_runtime_installed: sym!(c"VR_IsRuntimeInstalled"),
                init_error_description: sym!(c"VR_GetVRInitErrorAsEnglishDescription"),
                is_interface_version_valid: symbol(lib, c"VR_IsInterfaceVersionValid")
                    .map(|f| std::mem::transmute::<unsafe extern "system" fn() -> isize, unsafe extern "C" fn(*const c_char) -> u8>(f)),
            };
            *g = Some(api);
            return Ok(api);
        }
    }
    Err(last)
}

/// SteamVR'ı başlatmadan: DLL var mı, SteamVR kurulu mu, gözlük bağlı mı
pub fn probe(dirs: &[PathBuf]) -> Probe {
    let Ok(api) = load(dirs) else { return Probe::default() };
    // SAFETY: iki işlev de VR_Init'ten önce çağrılabilir, argüman almaz.
    unsafe {
        let runtime = (api.is_runtime_installed)() != 0;
        Probe { dll: true, runtime, hmd: runtime && (api.is_hmd_present)() != 0 }
    }
}

fn init_error(api: &Api, code: i32) -> String {
    // SAFETY: dönen işaretçi DLL içindeki sabit bir C dizgisidir (boş olabilir).
    let p = unsafe { (api.init_error_description)(code) };
    let text = if p.is_null() { String::new() } else { unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned() };
    format!("{text} ({code})")
}

/// İşlev tablosundan `idx`. alanı `T` türünde işlev işaretçisi olarak okur; boşsa None.
///
/// SAFETY: `table`, `VR_GetGenericInterface("FnTable:…")` dönüşü olmalı; `idx` ve `T` openvr_gen.rs'ten gelmeli.
unsafe fn entry<T: Copy>(table: *const *const c_void, idx: usize) -> Option<T> {
    if table.is_null() || std::mem::size_of::<T>() != std::mem::size_of::<*const c_void>() {
        return None;
    }
    let p = *table.add(idx);
    if p.is_null() {
        None
    } else {
        Some(std::mem::transmute_copy::<*const c_void, T>(&p))
    }
}

const MISSING: &str = "OpenVR işlevi tabloda yok";

/// VREvent_t için tampon: Windows'ta 64 bayt (12 bayt başlık + 4 dolgu + 48 bayt birleşim), 8'e hizalı
#[repr(C, align(8))]
struct EventBuf([u8; 64]);

/// Açık bir OpenVR oturumu. Yalnız oluşturulduğu iş parçacığında kullanılır.
pub struct Session {
    api: Api,
    system: *const *const c_void,
    overlay: *const *const c_void,
}

impl Session {
    /// `background`: true ise SteamVR çalışmıyorsa başlatmaz (hata döner); false ise Overlay uygulaması olarak
    /// bağlanır ve SteamVR gerekirse başlar.
    pub fn open(dirs: &[PathBuf], background: bool) -> Result<Session, OpenError> {
        let api = load(dirs).map_err(OpenError::Dll)?;
        // SAFETY: bkz. `probe`.
        unsafe {
            if (api.is_runtime_installed)() == 0 {
                return Err(OpenError::NoRuntime);
            }
            if (api.is_hmd_present)() == 0 {
                return Err(OpenError::NoHmd);
            }
        }
        let mut err: i32 = 0;
        // SAFETY: VR_InitInternal(EVRInitError*, EVRApplicationType); hata kodu `err`e yazılır.
        unsafe { (api.init)(&mut err, if background { gen::APP_BACKGROUND } else { gen::APP_OVERLAY }) };
        if err != 0 {
            return Err(OpenError::Init(init_error(&api, err)));
        }
        let fail = |msg: String| {
            // SAFETY: başarılı VR_InitInternal'dan sonra bir kez.
            unsafe { (api.shutdown)() };
            Err(OpenError::Init(msg))
        };
        let mut tables = [std::ptr::null::<*const c_void>(); 2];
        for (i, version) in [gen::IVRSYSTEM_VERSION, gen::IVROVERLAY_VERSION].into_iter().enumerate() {
            let plain = CString::new(version).unwrap_or_default();
            if let Some(valid) = api.is_interface_version_valid {
                // SAFETY: sıfırla biten sürüm adı.
                if unsafe { valid(plain.as_ptr()) } == 0 {
                    return fail(format!("SteamVR {version} arayüzünü desteklemiyor (SteamVR'ı güncelle)"));
                }
            }
            let name = CString::new(format!("FnTable:{version}")).unwrap_or_default();
            let mut e: i32 = 0;
            // SAFETY: VR_GetGenericInterface(const char*, EVRInitError*) -> tablo işaretçisi (ya da 0).
            let p = unsafe { (api.get_generic_interface)(name.as_ptr(), &mut e) };
            if e != 0 || p == 0 {
                return fail(format!("{version}: {}", init_error(&api, e)));
            }
            tables[i] = p as *const *const c_void;
        }
        Ok(Session { api, system: tables[0], overlay: tables[1] })
    }

    /// Bekleyen olayları tüketir; SteamVR kapanıyorsa (VREvent_Quit) onaylar ve true döner.
    pub fn poll_quit(&self) -> bool {
        // SAFETY: tablo ve imzalar openvr_gen.rs'ten; tampon VREvent_t kadar ve hizalı.
        unsafe {
            let Some(poll) = entry::<sy::FnPollNextEvent>(self.system, sy::PollNextEvent) else { return false };
            let mut ev = EventBuf([0; 64]);
            for _ in 0..64 {
                if poll(ev.0.as_mut_ptr() as *mut c_void, ev.0.len() as u32) == 0 {
                    break;
                }
                let ty = u32::from_ne_bytes([ev.0[0], ev.0[1], ev.0[2], ev.0[3]]);
                if ty as i32 == gen::EVENT_QUIT {
                    if let Some(ack) = entry::<sy::FnAcknowledgeQuit_Exiting>(self.system, sy::AcknowledgeQuit_Exiting) {
                        ack();
                    }
                    return true;
                }
            }
            false
        }
    }

    /// Gözlüğün (aygıt 0) seçilen izleme uzayındaki konumu; izleme yoksa None
    pub fn hmd_pose(&self, standing: bool) -> Option<HmdMatrix34> {
        // SAFETY: tek elemanlı TrackedDevicePose_t dizisi (80 bayt, bkz. types.rs testleri).
        unsafe {
            let f = entry::<sy::FnGetDeviceToAbsoluteTrackingPose>(self.system, sy::GetDeviceToAbsoluteTrackingPose)?;
            let mut pose: TrackedDevicePose = std::mem::zeroed();
            f(universe(standing), 0.0, &mut pose, 1);
            (pose.pose_is_valid != 0).then_some(pose.device_to_absolute)
        }
    }

    fn check(&self, code: i32) -> Result<(), String> {
        if code == 0 {
            return Ok(());
        }
        // SAFETY: dönen işaretçi SteamVR içindeki sabit bir C dizgisidir.
        let name = unsafe {
            entry::<ov::FnGetOverlayErrorNameFromEnum>(self.overlay, ov::GetOverlayErrorNameFromEnum)
                .map(|f| f(code))
                .filter(|p| !p.is_null())
                .map(|p| CStr::from_ptr(p).to_string_lossy().into_owned())
        };
        Err(format!("{} ({code})", name.unwrap_or_else(|| "VROverlayError".into())))
    }

    /// Overlay oluşturur (aynı anahtarla eskisi kaldıysa onu kullanır)
    pub fn create(&self, key: &str, name: &str) -> Result<u64, String> {
        let key = CString::new(key).map_err(|e| e.to_string())?;
        let name = CString::new(name.replace('\0', " ")).map_err(|e| e.to_string())?;
        let mut handle: u64 = 0;
        // SAFETY: sıfırla biten dizgiler, çıkış tutamacı geçerli bir u64'e yazılır.
        unsafe {
            if let Some(find) = entry::<ov::FnFindOverlay>(self.overlay, ov::FindOverlay) {
                if find(key.as_ptr(), &mut handle) == 0 && handle != 0 {
                    return Ok(handle);
                }
            }
            handle = 0;
            let f = entry::<ov::FnCreateOverlay>(self.overlay, ov::CreateOverlay).ok_or(MISSING)?;
            self.check(f(key.as_ptr(), name.as_ptr(), &mut handle))?;
        }
        Ok(handle)
    }

    pub fn destroy(&self, h: u64) {
        // SAFETY: tutamaç `create` dönüşü.
        unsafe {
            if let Some(f) = entry::<ov::FnDestroyOverlay>(self.overlay, ov::DestroyOverlay) {
                f(h);
            }
        }
    }

    /// RGBA8 kareyi gönderir (SteamVR tamponu kopyalar)
    pub fn set_raw(&self, h: u64, rgba: &[u8], w: u32, ht: u32) -> Result<(), String> {
        if w == 0 || ht == 0 || rgba.len() < w as usize * ht as usize * 4 {
            return Err("geçersiz kare".into());
        }
        // SAFETY: tampon en az w*ht*4 bayt; SteamVR yalnız okur.
        unsafe {
            let f = entry::<ov::FnSetOverlayRaw>(self.overlay, ov::SetOverlayRaw).ok_or(MISSING)?;
            self.check(f(h, rgba.as_ptr() as *mut c_void, w, ht, 4))
        }
    }

    pub fn set_transform(&self, h: u64, standing: bool, m: &HmdMatrix34) -> Result<(), String> {
        let mut m = *m;
        // SAFETY: HmdMatrix34_t işaretçisi çağrı süresince geçerli.
        unsafe {
            let f = entry::<ov::FnSetOverlayTransformAbsolute>(self.overlay, ov::SetOverlayTransformAbsolute).ok_or(MISSING)?;
            self.check(f(h, universe(standing), &mut m))
        }
    }

    pub fn set_width(&self, h: u64, meters: f32) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnSetOverlayWidthInMeters>(self.overlay, ov::SetOverlayWidthInMeters).ok_or(MISSING)?;
            self.check(f(h, meters))
        }
    }

    pub fn set_curvature(&self, h: u64, c: f32) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnSetOverlayCurvature>(self.overlay, ov::SetOverlayCurvature).ok_or(MISSING)?;
            self.check(f(h, c))
        }
    }

    pub fn set_alpha(&self, h: u64, a: f32) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnSetOverlayAlpha>(self.overlay, ov::SetOverlayAlpha).ok_or(MISSING)?;
            self.check(f(h, a))
        }
    }

    pub fn set_color(&self, h: u64, r: f32, g: f32, b: f32) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnSetOverlayColor>(self.overlay, ov::SetOverlayColor).ok_or(MISSING)?;
            self.check(f(h, r, g, b))
        }
    }

    pub fn set_sort_order(&self, h: u64, order: u32) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnSetOverlaySortOrder>(self.overlay, ov::SetOverlaySortOrder).ok_or(MISSING)?;
            self.check(f(h, order))
        }
    }

    pub fn show(&self, h: u64) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnShowOverlay>(self.overlay, ov::ShowOverlay).ok_or(MISSING)?;
            self.check(f(h))
        }
    }

    pub fn hide(&self, h: u64) -> Result<(), String> {
        // SAFETY: değer argümanları.
        unsafe {
            let f = entry::<ov::FnHideOverlay>(self.overlay, ov::HideOverlay).ok_or(MISSING)?;
            self.check(f(h))
        }
    }

    /// Oturumu kapatır (VR_ShutdownInternal); overlay'ler SteamVR tarafında da silinir.
    pub fn close(self) {
        // SAFETY: başarılı VR_InitInternal'ın karşılığı, aynı iş parçacığında bir kez.
        unsafe { (self.api.shutdown)() };
    }
}

fn universe(standing: bool) -> i32 {
    if standing {
        gen::UNIVERSE_STANDING
    } else {
        gen::UNIVERSE_SEATED
    }
}

// ---------------------------------------------------------------------------
// Pencere yakalama
// ---------------------------------------------------------------------------

/// Pencerenin istemci alanını yukarıdan aşağı BGRA olarak `buf` içine yakalar; (genişlik, yükseklik).
/// Pencere yoksa, simge durumundaysa ya da yakalanamadıysa None.
pub fn capture(hwnd: isize, buf: &mut Vec<u8>) -> Option<(u32, u32)> {
    let hwnd = hwnd as HWND;
    // SAFETY: GDI nesneleri bu işlev içinde oluşturulup bırakılır; DIB belleği DeleteObject'ten önce kopyalanır.
    unsafe {
        if hwnd.is_null() || IsWindow(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return None;
        }
        let mut rc: RECT = std::mem::zeroed();
        if GetClientRect(hwnd, &mut rc) == 0 {
            return None;
        }
        let (w, h) = (rc.right - rc.left, rc.bottom - rc.top);
        if !(8..=4096).contains(&w) || !(8..=4096).contains(&h) {
            return None;
        }
        let screen = GetDC(std::ptr::null_mut());
        if screen.is_null() {
            return None;
        }
        let mem = CreateCompatibleDC(screen);
        ReleaseDC(std::ptr::null_mut(), screen);
        if mem.is_null() {
            return None;
        }
        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = w;
        bi.bmiHeader.biHeight = -h; // yukarıdan aşağı
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB;
        let mut bits: *mut c_void = std::ptr::null_mut();
        let bmp = CreateDIBSection(mem, &bi, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0);
        if bmp.is_null() || bits.is_null() {
            DeleteDC(mem);
            return None;
        }
        let old = SelectObject(mem, bmp);
        let ok = PrintWindow(hwnd, mem, PW_CLIENTONLY | PW_RENDERFULLCONTENT);
        GdiFlush();
        let len = w as usize * h as usize * 4;
        if ok != 0 {
            buf.clear();
            buf.extend_from_slice(std::slice::from_raw_parts(bits as *const u8, len));
        }
        SelectObject(mem, old);
        DeleteObject(bmp);
        DeleteDC(mem);
        (ok != 0).then_some((w as u32, h as u32))
    }
}

// ---------------------------------------------------------------------------
// Fare kancası (yalnız yapılandırma modunda)
// ---------------------------------------------------------------------------

pub mod mouse {
    //! WH_MOUSE_LL: yapılandırma modunda masaüstü faresinin sürüklemelerini toplar. Tuş basışları ve tekerlek,
    //! imleç uygulamanın kendi pencerelerinden birinin (kontrol paneli vb.) üstünde DEĞİLSE yutulur; böylece panel
    //! her zaman tıklanabilir kalır. İmleç hareketi hiçbir zaman engellenmez.

    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU8, Ordering};

    const L: u8 = 1;
    const R: u8 = 2;
    const M: u8 = 4;

    static ACTIVE: AtomicBool = AtomicBool::new(false);
    /// Bizim yakaladığımız (basılı) tuşlar
    static HELD: AtomicU8 = AtomicU8::new(0);
    static LAST_X: AtomicI32 = AtomicI32::new(0);
    static LAST_Y: AtomicI32 = AtomicI32::new(0);
    static ACC: [AtomicI32; 6] = [AtomicI32::new(0), AtomicI32::new(0), AtomicI32::new(0), AtomicI32::new(0), AtomicI32::new(0), AtomicI32::new(0)];
    static WHEEL: AtomicI32 = AtomicI32::new(0);
    static THREAD: Mutex<u32> = parking_lot::const_mutex(0);
    /// Üstündeyken tıklamaların yutulmadığı pencereler (kök pencere tutamaçları)
    static EXEMPT: Mutex<Vec<isize>> = parking_lot::const_mutex(Vec::new());

    unsafe fn over_own_window(pt: POINT) -> bool {
        let w = WindowFromPoint(pt);
        if w.is_null() {
            return false;
        }
        let root = GetAncestor(w, GA_ROOT);
        let root = if root.is_null() { w } else { root };
        EXEMPT.lock().contains(&(root as isize))
    }

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 && lparam != 0 && ACTIVE.load(Ordering::Relaxed) {
            let d = &*(lparam as *const MSLLHOOKSTRUCT);
            let msg = wparam as u32;
            let down = match msg {
                WM_LBUTTONDOWN => L,
                WM_RBUTTONDOWN => R,
                WM_MBUTTONDOWN => M,
                _ => 0,
            };
            let up = match msg {
                WM_LBUTTONUP => L,
                WM_RBUTTONUP => R,
                WM_MBUTTONUP => M,
                _ => 0,
            };
            if down != 0 {
                if !over_own_window(d.pt) {
                    if HELD.fetch_or(down, Ordering::Relaxed) == 0 {
                        LAST_X.store(d.pt.x, Ordering::Relaxed);
                        LAST_Y.store(d.pt.y, Ordering::Relaxed);
                    }
                    return 1;
                }
            } else if up != 0 {
                if HELD.fetch_and(!up, Ordering::Relaxed) & up != 0 {
                    return 1;
                }
            } else if msg == WM_MOUSEMOVE {
                let held = HELD.load(Ordering::Relaxed);
                if held != 0 {
                    let dx = d.pt.x - LAST_X.swap(d.pt.x, Ordering::Relaxed);
                    let dy = d.pt.y - LAST_Y.swap(d.pt.y, Ordering::Relaxed);
                    for (i, bit) in [L, R, M].into_iter().enumerate() {
                        if held & bit != 0 {
                            ACC[i * 2].fetch_add(dx, Ordering::Relaxed);
                            ACC[i * 2 + 1].fetch_add(dy, Ordering::Relaxed);
                        }
                    }
                }
            } else if msg == WM_MOUSEWHEEL && !over_own_window(d.pt) {
                // mouseData'nın üst sözcüğü: işaretli tekerlek miktarı (120 = bir çentik)
                WHEEL.fetch_add(((d.mouseData >> 16) as u16 as i16) as i32, Ordering::Relaxed);
                return 1;
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }

    fn reset() {
        HELD.store(0, Ordering::Relaxed);
        WHEEL.store(0, Ordering::Relaxed);
        for a in &ACC {
            a.store(0, Ordering::Relaxed);
        }
    }

    /// Kancayı kur. `exempt`: üstündeyken tıklamaların uygulamaya bırakıldığı kök pencereler.
    pub fn start(exempt: Vec<isize>) -> Result<(), String> {
        *EXEMPT.lock() = exempt;
        let mut th = THREAD.lock();
        reset();
        if *th != 0 {
            ACTIVE.store(true, Ordering::Relaxed);
            return Ok(());
        }
        let (tx, rx) = std::sync::mpsc::channel::<Result<u32, String>>();
        std::thread::Builder::new()
            .name("vr-mouse-hook".into())
            .spawn(move || unsafe {
                let mut msg: MSG = std::mem::zeroed();
                // İleti kuyruğunu oluştur (PostThreadMessageW ile WM_QUIT alabilmek için)
                PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
                let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), GetModuleHandleW(std::ptr::null()), 0);
                if hook.is_null() {
                    let _ = tx.send(Err(std::io::Error::last_os_error().to_string()));
                    return;
                }
                let _ = tx.send(Ok(GetCurrentThreadId()));
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
                ACTIVE.store(true, Ordering::Relaxed);
                Ok(())
            }
            Ok(Err(e)) => Err(e),
            Err(_) => Err("fare kancası başlatılamadı".into()),
        }
    }

    /// Kancayı kaldır (yapılandırma modundan çıkınca / yerel VR durunca)
    pub fn stop() {
        ACTIVE.store(false, Ordering::Relaxed);
        let mut th = THREAD.lock();
        if *th != 0 {
            // SAFETY: kanca iş parçacığının ileti kuyruğuna WM_QUIT.
            unsafe {
                PostThreadMessageW(*th, WM_QUIT, 0, 0);
            }
            *th = 0;
        }
        reset();
    }

    /// Son okumadan beri biriken hareket (okununca sıfırlanır)
    pub fn take() -> MouseInput {
        let a = |i: usize| ACC[i].swap(0, Ordering::Relaxed);
        // Tekerlek: tam çentikleri al, artanı bırak
        let raw = WHEEL.load(Ordering::Relaxed);
        let notches = raw / 120;
        if notches != 0 {
            WHEEL.fetch_sub(notches * 120, Ordering::Relaxed);
        }
        // SAFETY: GetAsyncKeyState yan etkisizdir.
        let key = |vk: u16| unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 };
        MouseInput {
            left: (a(0), a(1)),
            right: (a(2), a(3)),
            middle: (a(4), a(5)),
            wheel: notches,
            shift: key(VK_SHIFT),
            ctrl: key(VK_CONTROL),
            right_down: HELD.load(Ordering::Relaxed) & R != 0,
        }
    }
}
