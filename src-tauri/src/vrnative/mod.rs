//! Yerel VR (SteamVR / OpenVR) — DENEYSEL: overlay'leri pencere yakalama aracı olmadan doğrudan gözlüğe çizer.
//!
//! Nasıl çalışır:
//!   - `vr.rs` her açık overlay için ayrı bir pencere açar (VR modu pencereleriyle aynı). Bu modül o pencerelerin
//!     piksellerini bir iş parçacığında `PrintWindow(PW_RENDERFULLCONTENT)` ile yakalar (varsayılan 15 kare/sn),
//!     BGRA→RGBA çevirir ve `IVROverlay::SetOverlayRaw` ile SteamVR'a gönderir (kare değişmediyse göndermez).
//!   - Saydamlık: WebView2'nin PrintWindow çıktısında güvenilir alfa yoktur; pencereler düz bir "anahtar renk"
//!     arka planla çizilir ve o renk alfa=0 yapılır ("Saydam (anahtar renk)"), ya da arka plan opak bırakılır.
//!   - Yerleşim `general.vr.native.overlays[<kopya kimliği>]` altında saklanır (bkz. place.rs).
//!   - Yapılandırma modu: genel kısayollar (lib.rs) + masaüstü faresi için düşük seviye kanca (win.rs).
//!
//! OpenVR: SDK **v2.5.1** — `IVRSystem_022`, `IVROverlay_027` (düz C API, `FnTable:` işlev tabloları).
//! `openvr_api.dll` (aynı etiket, bin/win64) uygulamayla birlikte kaynak olarak paketlenir
//! (`resources/openvr/`, BSD-3 lisansı yanında) ve çalışma anında yüklenir. Tablo sırası ve imzalar
//! `openvr_gen.rs` içindedir; `scripts/openvr_gen.mjs` resmi `openvr_capi.h` başlığından üretir.
//!
//! Kapsam dışı: OpenXR API katmanı (OpenXR oyununa doğrudan overlay ekleme) ve kokpit örtmesi (derinlik).
//! SteamVR etkin çalışma zamanıyken (OpenXR oyunları SteamVR üzerinden çalışırken de) çalışır; Oculus / WMR
//! yerel çalışma zamanlarında pencere yakalama yöntemi (VR modu) kullanılır.
//!
//! Güvenlik: bütün Windows / OpenVR kodu `win.rs` içindedir (`#[cfg(windows)]`), diğer platformlarda `stub.rs`.
//! İş parçacığı `catch_unwind` ile sarılıdır (sürüm derlemesinde panic=abort olduğu için yalnız geliştirmede etkili).

mod openvr_gen;
mod place;
mod types;

#[cfg(windows)]
#[path = "win.rs"]
mod backend;
#[cfg(not(windows))]
#[path = "stub.rs"]
mod backend;

pub use place::{Base, Mode, Placement};
pub use types::*;

use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// Anahtar renk eşleşmesinde kanal başına pay (kenar yumuşatması yüzünden tam eşleşmeyen arka plan pikselleri)
const KEY_TOLERANCE: u8 = 3;
/// Hareket bittikten sonra otomatik kayıt gecikmesi
const AUTOSAVE: Duration = Duration::from_millis(500);
/// Yapılandırma modu bu kadar süre dokunulmazsa kendiliğinden kapanır (fare kancası açık kalmasın)
const CONFIG_IDLE: Duration = Duration::from_secs(180);
/// Otomatik başlatmada SteamVR yoksa yeniden deneme aralığı
const RETRY: Duration = Duration::from_secs(10);
const LOG_LINES: usize = 200;

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

/// `general.vr.native` (bkz. src/sdk/settings.ts VrNativeSettings)
#[derive(Debug, Clone, PartialEq)]
pub struct NativeCfg {
    pub auto_start: bool,
    pub show_desktop: bool,
    pub invert: bool,
    pub fps: u32,
    /// Anahtar rengi saydam yap (false: opak arka plan)
    pub key: bool,
    pub standing: bool,
    pub debug: bool,
    /// Kullanıcı en az bir kez başlattı (WebView2 arka plan çizim ayarı açılışta uygulansın)
    pub used: bool,
    pub base: Option<Base>,
    /// Saklanan yerleşimler (ham JSON; varsayılanla birleştirilerek okunur)
    pub overlays: HashMap<String, Value>,
}

impl Default for NativeCfg {
    fn default() -> Self {
        NativeCfg { auto_start: false, show_desktop: false, invert: false, fps: 15, key: true, standing: false, debug: false, used: false, base: None, overlays: HashMap::new() }
    }
}

pub fn cfg_from_settings(v: &Value) -> NativeCfg {
    let d = v.pointer("/general/vr/native");
    let b = |k: &str| d.and_then(|x| x.get(k)).and_then(|x| x.as_bool()).unwrap_or(false);
    let s = |k: &str| d.and_then(|x| x.get(k)).and_then(|x| x.as_str()).unwrap_or("");
    let fps = match d.and_then(|x| x.get("fps")).and_then(|x| x.as_u64()) {
        Some(10) => 10,
        Some(30) => 30,
        _ => 15,
    };
    NativeCfg {
        auto_start: b("autoStart"),
        show_desktop: b("showDesktop"),
        invert: b("invert"),
        fps,
        key: s("transparency") != "opaque",
        standing: s("origin") == "standing",
        debug: b("debug"),
        used: b("used"),
        base: d.and_then(|x| x.get("base")).and_then(Base::from_json),
        overlays: d
            .and_then(|x| x.get("overlays"))
            .and_then(|x| x.as_object())
            .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default(),
    }
}

/// Uygulama açılışında WebView2'nin arkada kalan pencereleri de çizmesi gerekiyor mu (bkz. vr.rs browser_flags)
pub fn wants_background_rendering(settings: &Value) -> bool {
    let c = cfg_from_settings(settings);
    c.auto_start || c.used
}

// ---------------------------------------------------------------------------
// Paylaşılan durum
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
enum Cmd {
    Config,
    Next,
    Mode,
    Save,
    Reset,
    Recenter,
    FaceMe,
    Gaze,
    Select(String),
}

#[derive(Default)]
struct Inner {
    /// "idle" | "starting" | "waiting" | "running" | "error"
    state: &'static str,
    detail: String,
    overlays: usize,
    selected: String,
    mode: Mode,
    cfg: NativeCfg,
    /// `cfg` her değiştiğinde artar (iş parçacığı yerleşimleri yeniden okur)
    gen: u64,
    cmds: Vec<Cmd>,
    log: VecDeque<String>,
    log_file: Option<PathBuf>,
    /// Sim bağlanınca kendiliğinden başlatıldı (sim kapanınca durur)
    auto: bool,
    probe: Option<(Instant, Probe)>,
}

struct Shared {
    running: AtomicBool,
    stop: AtomicBool,
    config: AtomicBool,
    inner: Mutex<Inner>,
}

fn sh() -> &'static Shared {
    static S: OnceLock<Shared> = OnceLock::new();
    S.get_or_init(|| Shared {
        running: AtomicBool::new(false),
        stop: AtomicBool::new(false),
        config: AtomicBool::new(false),
        inner: Mutex::new(Inner { state: "idle", ..Default::default() }),
    })
}

/// Yerel VR iş parçacığı çalışıyor (SteamVR'ı bekliyor olabilir)
pub fn running() -> bool {
    sh().running.load(Ordering::Relaxed)
}

/// Yapılandırma modu açık (yalnız o zaman kaydedilen kısayollar için)
pub fn config_mode() -> bool {
    running() && sh().config.load(Ordering::Relaxed)
}

/// Yerel VR çalışırken masaüstü overlay'i gizlensin mi ("Masaüstünde de göster" kapalıysa)
pub fn hides_desktop() -> bool {
    running() && !sh().inner.lock().cfg.show_desktop
}

fn log(msg: impl Into<String>) {
    let msg = msg.into();
    let mut g = sh().inner.lock();
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let line = format!("{:02}:{:02}:{:02} {msg}", (secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    if g.cfg.debug {
        if let Some(p) = &g.log_file {
            use std::io::Write;
            // Dosya büyümesin: 512 KB'ı geçince baştan başla
            let big = std::fs::metadata(p).map(|m| m.len() > 512 * 1024).unwrap_or(false);
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(!big).write(true).truncate(big).open(p) {
                let _ = writeln!(f, "{line}");
            }
        }
    }
    g.log.push_back(line);
    while g.log.len() > LOG_LINES {
        g.log.pop_front();
    }
}

fn set_state(state: &'static str, detail: impl Into<String>) {
    let detail = detail.into();
    let changed = {
        let mut g = sh().inner.lock();
        let changed = g.state != state || g.detail != detail;
        g.state = state;
        g.detail = detail.clone();
        changed
    };
    if changed {
        log(format!("durum: {state} {detail}"));
    }
}

/// openvr_api.dll'in aranacağı klasörler (paketlenen kaynak klasörü, exe'nin yanı, geliştirme klasörü)
fn dll_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(r) = app.path().resource_dir() {
        v.push(r.join("openvr"));
        v.push(r.join("resources").join("openvr"));
        v.push(r);
    }
    if let Some(d) = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        v.push(d.join("openvr"));
        v.push(d.join("resources").join("openvr"));
        v.push(d);
    }
    #[cfg(debug_assertions)]
    v.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("openvr"));
    v
}

// ---------------------------------------------------------------------------
// lib.rs / vr.rs tarafından çağrılanlar
// ---------------------------------------------------------------------------

/// Ayarlar değişti (ya da açılışta yüklendi)
pub fn apply_settings(app: &AppHandle, v: &Value) {
    let cfg = cfg_from_settings(v);
    let mut g = sh().inner.lock();
    if g.log_file.is_none() {
        g.log_file = app.path().app_data_dir().ok().map(|d| d.join("vr_native.log"));
    }
    if g.cfg != cfg {
        g.cfg = cfg;
        g.gen += 1;
    }
}

/// Sim bağlandı / koptu: "Sim bağlanınca otomatik başlat"
pub fn on_connection(app: &AppHandle, connected: bool) {
    let (auto_start, auto) = {
        let g = sh().inner.lock();
        (g.cfg.auto_start, g.auto)
    };
    if connected && auto_start && !running() {
        start(app, true);
    } else if !connected && auto && running() {
        stop();
    }
}

/// Genel kısayol basıldı (lib.rs setup_shortcuts): "vrConfig", "vrNext", …
pub fn hotkey(action: &str) {
    let cmd = match action {
        "vrConfig" => Cmd::Config,
        "vrNext" => Cmd::Next,
        "vrMode" => Cmd::Mode,
        "vrSave" => Cmd::Save,
        "vrReset" => Cmd::Reset,
        "vrRecenter" => Cmd::Recenter,
        "vrFace" => Cmd::FaceMe,
        "vrGaze" => Cmd::Gaze,
        _ => return,
    };
    if running() {
        sh().inner.lock().cmds.push(cmd);
    }
}

/// İş parçacığını başlat. `auto`: sim bağlanınca; SteamVR'ı kendisi başlatmaz, çalışana kadar bekler.
pub fn start(app: &AppHandle, auto: bool) {
    let s = sh();
    if s.running.swap(true, Ordering::SeqCst) {
        return;
    }
    s.stop.store(false, Ordering::SeqCst);
    s.config.store(false, Ordering::SeqCst);
    {
        let mut g = s.inner.lock();
        g.auto = auto;
        g.cmds.clear();
        g.overlays = 0;
        g.selected.clear();
        g.mode = Mode::Position;
    }
    set_state("starting", "");
    let app2 = app.clone();
    let spawned = std::thread::Builder::new().name("vr-native".into()).spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker(&app2, auto)));
        backend::mouse::stop();
        let s = sh();
        s.config.store(false, Ordering::SeqCst);
        s.running.store(false, Ordering::SeqCst);
        match result {
            Ok(Ok(())) => set_state("idle", ""),
            Ok(Err(e)) => set_state("error", e),
            Err(_) => set_state("error", "beklenmeyen hata (panic)"),
        }
        after_change(&app2);
    });
    if let Err(e) = spawned {
        s.running.store(false, Ordering::SeqCst);
        set_state("error", e.to_string());
    }
}

pub fn stop() {
    sh().stop.store(true, Ordering::SeqCst);
}

/// Çalışma durumu değişti: kısayolları, VR pencerelerini ve masaüstü overlay görünürlüğünü güncelle
fn after_change(app: &AppHandle) {
    crate::refresh_shortcuts(app);
    if let Some(v) = crate::current_settings(app) {
        crate::vr::sync(app, &v);
    }
    crate::sync_overlay_visibility(app);
}

// ---------------------------------------------------------------------------
// İş parçacığı
// ---------------------------------------------------------------------------

struct Ov {
    key: String,
    handle: u64,
    hwnd: isize,
    place: Placement,
    /// Kaydedilmemiş değişiklik var
    dirty: bool,
    sent_tf: Option<HmdMatrix34>,
    sent_width: f32,
    sent_curve: f32,
    sent_alpha: f32,
    sent_color: [f32; 3],
    hash: u64,
    /// İlk kare gönderildi
    has_frame: bool,
    visible: bool,
    /// yükseklik / genişlik
    aspect: f32,
    /// Bakış solması 0..1
    gaze_f: f32,
    next_capture: Instant,
    errors: u32,
}

fn stopping() -> bool {
    sh().stop.load(Ordering::Relaxed)
}

/// Durdurma isteğine bakarak bekle; durdurulduysa false
fn wait(d: Duration) -> bool {
    let end = Instant::now() + d;
    while Instant::now() < end {
        if stopping() {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    !stopping()
}

/// Durum ayrıntısı: "dll: …", "noRuntime", "noHmd" (panel çevirir) ya da SteamVR'ın hata açıklaması
fn open_error_text(e: &OpenError) -> String {
    match e {
        OpenError::Dll(m) => format!("dll: {m}"),
        OpenError::NoRuntime => "noRuntime".into(),
        OpenError::NoHmd => "noHmd".into(),
        OpenError::Init(m) => m.clone(),
    }
}

/// Pencere tutamacı (yalnız Windows'ta anlamlı)
fn window_handle(app: &AppHandle, label: &str) -> isize {
    #[cfg(windows)]
    {
        if let Some(w) = app.get_webview_window(label) {
            if let Ok(h) = w.hwnd() {
                return h.0 as isize;
            }
        }
        0
    }
    #[cfg(not(windows))]
    {
        let _ = (app, label);
        0
    }
}

/// Fare kancasının tıklamaları yutmayacağı pencereler: kontrol paneli ve diğer uygulama pencereleri
/// (VR yakalama pencereleri ve tam ekran overlay pencereleri hariç)
fn exempt_windows(app: &AppHandle) -> Vec<isize> {
    app.webview_windows()
        .keys()
        .filter(|l| !l.starts_with("vr-") && !l.starts_with("overlay"))
        .map(|l| window_handle(app, l))
        .filter(|h| *h != 0)
        .collect()
}

fn worker(app: &AppHandle, auto: bool) -> Result<(), String> {
    log(format!("başlıyor (OpenVR {}, {}, {})", openvr_gen::OPENVR_TAG, openvr_gen::IVRSYSTEM_VERSION, openvr_gen::IVROVERLAY_VERSION));
    after_change(app);
    let dirs = dll_dirs(app);

    // Bağlan: elle başlatmada Overlay uygulaması (SteamVR gerekirse açılır); otomatikte Background (açmaz, bekler)
    let session = loop {
        if stopping() {
            return Ok(());
        }
        match backend::Session::open(&dirs, auto) {
            Ok(x) => break x,
            Err(e) => {
                let text = open_error_text(&e);
                if !auto || matches!(e, OpenError::Dll(_) | OpenError::NoRuntime) {
                    return Err(text);
                }
                set_state("waiting", text);
                if !wait(RETRY) {
                    return Ok(());
                }
            }
        }
    };
    set_state("running", "");
    let result = run(app, &session);
    session.close();
    log("durdu");
    result
}

fn run(app: &AppHandle, session: &backend::Session) -> Result<(), String> {
    let s = sh();
    let mut ovs: Vec<Ov> = Vec::new();
    let mut cfg = s.inner.lock().cfg.clone();
    let mut gen = u64::MAX;
    let mut base: Base = cfg.base.unwrap_or(Base::ZERO);
    let mut base_auto = cfg.standing && cfg.base.is_none();
    let mut base_dirty = false;
    let mut selected = String::new();
    let mut mode = Mode::Position;
    let mut lock = place::AxisLock::default();
    let mut last_change = Instant::now();
    let mut last_input = Instant::now();
    let mut last_targets = Instant::now() - Duration::from_secs(10);
    let mut last_events = Instant::now();
    let mut last_tick = Instant::now();
    let mut buf: Vec<u8> = Vec::new();
    let mut key_rgb: Option<[u8; 3]> = None;

    loop {
        if stopping() {
            break;
        }
        let now = Instant::now();
        let dt = now.duration_since(last_tick).as_secs_f32().min(0.25);
        last_tick = now;

        // SteamVR kapanıyor mu
        if now.duration_since(last_events) > Duration::from_millis(250) {
            last_events = now;
            if session.poll_quit() {
                log("SteamVR kapanıyor (VREvent_Quit)");
                break;
            }
        }

        // Ayarlar değişti: yerleşimleri (kaydedilmemiş olanlar hariç) yeniden oku
        let cur_gen = s.inner.lock().gen;
        if cur_gen != gen {
            gen = cur_gen;
            cfg = s.inner.lock().cfg.clone();
            if !base_dirty {
                if let Some(b) = cfg.base {
                    base = b;
                    base_auto = false;
                }
            }
            let count = ovs.len();
            for (i, o) in ovs.iter_mut().enumerate() {
                if !o.dirty {
                    let d = Placement::default_for(i, count);
                    o.place = cfg.overlays.get(&o.key).map(|v| Placement::from_json(v, d)).unwrap_or(o.place);
                }
                o.hash = 0; // saydamlık yöntemi değişmiş olabilir: kareyi yeniden gönder
            }
        }

        // Yakalanacak pencereler (overlay açılıp kapanınca değişir)
        if now.duration_since(last_targets) > Duration::from_secs(1) {
            last_targets = now;
            let (targets, bg) = crate::vr::native_targets(app);
            key_rgb = cfg.key.then(|| place::parse_rgb(&bg)).flatten();
            ovs.retain(|o| {
                let keep = targets.iter().any(|(k, _, _)| *k == o.key);
                if !keep {
                    session.destroy(o.handle);
                }
                keep
            });
            let count = targets.len();
            for (i, (key, label, title)) in targets.iter().enumerate() {
                let hwnd = window_handle(app, label);
                if let Some(o) = ovs.iter_mut().find(|o| o.key == *key) {
                    if o.hwnd != hwnd {
                        o.hwnd = hwnd;
                        o.hash = 0;
                    }
                    continue;
                }
                let ov_key = format!("srtr.pitwall.{}", crate::vr::safe(key));
                match session.create(&ov_key, &format!("SRTR Pitwall - {title}")) {
                    Ok(handle) => {
                        let d = Placement::default_for(i, count);
                        let stored = cfg.overlays.get(key);
                        let _ = session.set_sort_order(handle, i as u32);
                        ovs.push(Ov {
                            key: key.clone(),
                            handle,
                            hwnd,
                            place: stored.map(|v| Placement::from_json(v, d)).unwrap_or(d),
                            // İlk kez görülen overlay'in varsayılan yeri de kaydedilsin (panelde düzenlenebilsin)
                            dirty: stored.is_none(),
                            sent_tf: None,
                            sent_width: 0.0,
                            sent_curve: -1.0,
                            sent_alpha: -1.0,
                            sent_color: [-1.0; 3],
                            hash: 0,
                            has_frame: false,
                            visible: false,
                            aspect: 0.5,
                            gaze_f: 1.0,
                            next_capture: now,
                            errors: 0,
                        });
                        last_change = now;
                    }
                    Err(e) => log(format!("overlay oluşturulamadı ({key}): {e}")),
                }
            }
            ovs.sort_by(|a, b| a.key.cmp(&b.key));
            if !ovs.iter().any(|o| o.key == selected) {
                selected = ovs.first().map(|o| o.key.clone()).unwrap_or_default();
            }
            let mut g = s.inner.lock();
            g.overlays = ovs.len();
            g.selected = selected.clone();
        }

        let hmd = session.hmd_pose(cfg.standing);
        if base_auto {
            if let Some(h) = &hmd {
                // Ayakta (oda) uzayında başlangıç yerdedir: ilk geçerli gözlük konumu başlangıç olur
                base = Base::from_hmd(h);
                base_auto = false;
                base_dirty = true;
                last_change = now;
            }
        }

        // Komutlar (kısayollar ve paneldeki düğmeler)
        let cmds: Vec<Cmd> = std::mem::take(&mut s.inner.lock().cmds);
        let mut save_now = false;
        for c in cmds {
            last_input = now;
            let config = s.config.load(Ordering::Relaxed);
            let sel = ovs.iter().position(|o| o.key == selected);
            let is_face = c == Cmd::FaceMe;
            match c {
                Cmd::Config => {
                    let on = !config;
                    if on {
                        if let Err(e) = backend::mouse::start(exempt_windows(app)) {
                            log(format!("fare kancası kurulamadı: {e} (paneldeki düzenleyiciyi kullan)"));
                        }
                    } else {
                        backend::mouse::stop();
                        save_now = true;
                    }
                    s.config.store(on, Ordering::SeqCst);
                    log(if on { "yapılandırma modu açıldı" } else { "yapılandırma modu kapandı" });
                    crate::refresh_shortcuts(app);
                }
                Cmd::Next if config && !ovs.is_empty() => {
                    let i = sel.map(|i| (i + 1) % ovs.len()).unwrap_or(0);
                    selected = ovs[i].key.clone();
                }
                Cmd::Select(k) if ovs.iter().any(|o| o.key == k) => selected = k,
                Cmd::Mode if config => {
                    mode = if mode == Mode::Position { Mode::Adjust } else { Mode::Position };
                }
                Cmd::Save => save_now = true,
                Cmd::Reset => {
                    if let Some(i) = sel {
                        let count = ovs.len();
                        ovs[i].place = Placement::default_for(i, count);
                        ovs[i].dirty = true;
                        last_change = now;
                    }
                }
                Cmd::Recenter => match &hmd {
                    Some(h) => {
                        base = Base::from_hmd(h);
                        base_dirty = true;
                        last_change = now;
                        log("ortalandı");
                    }
                    None => log("ortalanamadı: gözlük konumu yok"),
                },
                Cmd::FaceMe | Cmd::Gaze => {
                    if let (true, Some(i)) = (config, sel) {
                        if is_face {
                            ovs[i].place.face_me = !ovs[i].place.face_me;
                        } else {
                            ovs[i].place.gaze = !ovs[i].place.gaze;
                        }
                        ovs[i].dirty = true;
                        last_change = now;
                    }
                }
                _ => {}
            }
            let mut g = s.inner.lock();
            g.selected = selected.clone();
            g.mode = mode;
        }

        // Yapılandırma modu: fare
        let config = s.config.load(Ordering::Relaxed);
        if config {
            let m = backend::mouse::take();
            if let Some(o) = ovs.iter_mut().find(|o| o.key == selected) {
                if place::apply_mouse(&mut o.place, mode, &m, &mut lock) {
                    o.dirty = true;
                    last_change = now;
                    last_input = now;
                }
            }
            if now.duration_since(last_input) > CONFIG_IDLE {
                s.inner.lock().cmds.push(Cmd::Config);
            }
        }

        // Dönüşüm, boyut, eğrilik, opaklık, renk
        let base_m = base.matrix();
        for o in ovs.iter_mut() {
            let tf = place::transform(&o.place, &base_m, hmd.as_ref(), cfg.invert);
            if o.sent_tf != Some(tf) && check(o, session.set_transform(o.handle, cfg.standing, &tf)) {
                o.sent_tf = Some(tf);
            }
            if o.sent_width != o.place.width && check(o, session.set_width(o.handle, o.place.width)) {
                o.sent_width = o.place.width;
            }
            if o.sent_curve != o.place.curve && check(o, session.set_curvature(o.handle, o.place.curve)) {
                o.sent_curve = o.place.curve;
            }
            // Bakış modu: yapılandırma modunda devre dışı (hep görünür)
            let target_on = !o.place.gaze || config || hmd.as_ref().map(|h| place::gaze_inside(h, &tf, o.place.width, o.aspect)).unwrap_or(true);
            o.gaze_f = place::fade(o.gaze_f, target_on, dt);
            let alpha = (o.place.alpha * o.gaze_f).clamp(0.0, 1.0);
            if (o.sent_alpha - alpha).abs() > 0.004 && check(o, session.set_alpha(o.handle, alpha)) {
                o.sent_alpha = alpha;
            }
            let color = if !config {
                [1.0, 1.0, 1.0]
            } else if o.key != selected {
                [0.45, 0.45, 0.45]
            } else if mode == Mode::Position {
                [0.6, 1.0, 0.6]
            } else {
                [1.0, 0.8, 0.45]
            };
            if o.sent_color != color && check(o, session.set_color(o.handle, color[0], color[1], color[2])) {
                o.sent_color = color;
            }
            let want_visible = o.has_frame && alpha > 0.004;
            if want_visible != o.visible {
                let r = if want_visible { session.show(o.handle) } else { session.hide(o.handle) };
                if check(o, r) {
                    o.visible = want_visible;
                }
            }
        }

        // Kare yakalama (overlay başına saniyede `fps` kez; görünmeyen overlay yakalanmaz)
        let interval = Duration::from_millis(1000 / cfg.fps.max(1) as u64);
        for o in ovs.iter_mut() {
            if now < o.next_capture || o.hwnd == 0 || (o.has_frame && o.gaze_f <= 0.0) {
                continue;
            }
            o.next_capture = now + interval;
            let Some((w, h)) = backend::capture(o.hwnd, &mut buf) else { continue };
            place::bgra_to_rgba(&mut buf, key_rgb, KEY_TOLERANCE);
            let hash = place::frame_hash(&buf, w, h);
            if hash == o.hash {
                continue;
            }
            if check(o, session.set_raw(o.handle, &buf, w, h)) {
                o.hash = hash;
                o.has_frame = true;
                o.aspect = h as f32 / w as f32;
            }
        }

        // Otomatik kayıt: son değişiklikten 0,5 sn sonra (ya da "şimdi kaydet")
        let dirty = base_dirty || ovs.iter().any(|o| o.dirty);
        if dirty && (save_now || now.duration_since(last_change) > AUTOSAVE) {
            let places: Vec<(String, Value)> = ovs.iter().filter(|o| o.dirty).map(|o| (o.key.clone(), o.place.to_json())).collect();
            let base_json = base_dirty.then(|| base.to_json());
            for o in ovs.iter_mut() {
                o.dirty = false;
            }
            base_dirty = false;
            save(app, places, base_json);
        }

        std::thread::sleep(Duration::from_millis(11));
    }

    backend::mouse::stop();
    if s.config.swap(false, Ordering::SeqCst) {
        crate::refresh_shortcuts(app);
    }
    // Kaydedilmemiş değişiklikleri yaz, overlay'leri kaldır
    let places: Vec<(String, Value)> = ovs.iter().filter(|o| o.dirty).map(|o| (o.key.clone(), o.place.to_json())).collect();
    if !places.is_empty() || base_dirty {
        save(app, places, base_dirty.then(|| base.to_json()));
    }
    for o in &ovs {
        session.destroy(o.handle);
    }
    s.inner.lock().overlays = 0;
    Ok(())
}

/// OpenVR çağrısının sonucunu değerlendirir; hatayı (overlay başına ilk birkaç kez) günlüğe yazar
fn check(o: &mut Ov, r: Result<(), String>) -> bool {
    match r {
        Ok(()) => true,
        Err(e) => {
            o.errors += 1;
            if o.errors <= 5 {
                log(format!("{}: {e}", o.key));
            }
            false
        }
    }
}

/// Yerleşimleri (ve başlangıç noktasını) ayarlara yazar
fn save(app: &AppHandle, places: Vec<(String, Value)>, base: Option<Value>) {
    let n = places.len();
    crate::settings_patch(app, "vr", move |v| {
        let Some(vr) = v.pointer_mut("/general/vr").and_then(|x| x.as_object_mut()) else { return false };
        let native = vr.entry("native").or_insert_with(|| Value::Object(Default::default()));
        let Some(native) = native.as_object_mut() else { return false };
        if let Some(b) = base {
            native.insert("base".into(), b);
        }
        let ovs = native.entry("overlays").or_insert_with(|| Value::Object(Default::default()));
        let Some(ovs) = ovs.as_object_mut() else { return false };
        for (k, p) in places {
            ovs.insert(k, p);
        }
        true
    });
    log(format!("kaydedildi ({n} overlay)"));
}

// ---------------------------------------------------------------------------
// Komutlar (VrPanel)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// Bu platformda destekleniyor mu (Windows)
    supported: bool,
    /// "dll" | "noRuntime" | "noHmd" | "ready" | "starting" | "waiting" | "running" | "error"
    state: String,
    detail: String,
    overlays: usize,
    config: bool,
    selected: String,
    /// "position" | "adjust"
    mode: &'static str,
    auto: bool,
    openvr: String,
    log_file: String,
    log: Vec<String>,
}

#[tauri::command]
pub async fn vr_native_status(app: AppHandle) -> Status {
    let s = sh();
    let is_running = running();
    // Çalışmıyorken: DLL / SteamVR / gözlük durumunu yokla (5 sn önbellek; SteamVR'ı başlatmaz)
    let probe = if is_running || !backend::SUPPORTED {
        None
    } else {
        let cached = s.inner.lock().probe.filter(|(t, _)| t.elapsed() < Duration::from_secs(5)).map(|(_, p)| p);
        Some(match cached {
            Some(p) => p,
            None => {
                let p = backend::probe(&dll_dirs(&app));
                s.inner.lock().probe = Some((Instant::now(), p));
                p
            }
        })
    };
    let g = s.inner.lock();
    let (state, detail) = match (g.state, probe) {
        ("idle", Some(p)) if !p.dll => ("dll", String::new()),
        ("idle", Some(p)) if !p.runtime => ("noRuntime", String::new()),
        ("idle", Some(p)) if !p.hmd => ("noHmd", String::new()),
        ("idle", _) => ("ready", String::new()),
        (st, _) => (st, g.detail.clone()),
    };
    Status {
        supported: backend::SUPPORTED,
        state: state.into(),
        detail,
        overlays: g.overlays,
        config: is_running && s.config.load(Ordering::Relaxed),
        selected: g.selected.clone(),
        mode: if g.mode == Mode::Adjust { "adjust" } else { "position" },
        auto: g.auto,
        openvr: format!("{} · {} · {}", openvr_gen::OPENVR_TAG, openvr_gen::IVRSYSTEM_VERSION, openvr_gen::IVROVERLAY_VERSION),
        log_file: g.log_file.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        log: g.log.iter().rev().take(40).rev().cloned().collect(),
    }
}

/// Başlat (kullanıcı düğmeye bastı: SteamVR çalışmıyorsa açılır)
#[tauri::command]
pub async fn vr_native_start(app: AppHandle) {
    if !backend::SUPPORTED {
        set_state("error", "Yerel VR sadece Windows'ta çalışır");
        return;
    }
    start(&app, false);
}

#[tauri::command]
pub async fn vr_native_stop() {
    stop();
}

/// Paneldeki düğmeler: "config" | "next" | "mode" | "save" | "reset" | "recenter" | "select" (key ile)
#[tauri::command]
pub async fn vr_native_cmd(action: String, key: Option<String>) {
    let cmd = match action.as_str() {
        "config" => Cmd::Config,
        "next" => Cmd::Next,
        "mode" => Cmd::Mode,
        "save" => Cmd::Save,
        "reset" => Cmd::Reset,
        "recenter" => Cmd::Recenter,
        "select" => Cmd::Select(key.unwrap_or_default()),
        _ => return,
    };
    if running() {
        sh().inner.lock().cmds.push(cmd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn config_defaults_and_values() {
        let d = cfg_from_settings(&json!({}));
        assert_eq!(d, NativeCfg::default());
        assert!(d.key && !d.standing && d.fps == 15 && !wants_background_rendering(&json!({})));
        let s = json!({ "general": { "vr": { "native": {
            "autoStart": true, "showDesktop": true, "invert": true, "fps": 30, "transparency": "opaque", "origin": "standing",
            "debug": true, "base": { "x": 1, "y": 2, "z": 3, "yaw": 45 },
            "overlays": { "relative": { "x": 0.5, "faceMe": true } }
        } } } });
        let c = cfg_from_settings(&s);
        assert!(c.auto_start && c.show_desktop && c.invert && c.fps == 30 && !c.key && c.standing && c.debug);
        assert_eq!(c.base, Some(Base { x: 1.0, y: 2.0, z: 3.0, yaw: 45.0 }));
        let p = Placement::from_json(&c.overlays["relative"], Placement::default_for(0, 1));
        assert!(p.face_me && (p.x - 0.5).abs() < 1e-6 && (p.z - 1.2).abs() < 1e-5);
        assert!(wants_background_rendering(&s));
        // Desteklenmeyen kare hızı varsayılana düşer
        assert_eq!(cfg_from_settings(&json!({ "general": { "vr": { "native": { "fps": 144 } } } })).fps, 15);
    }

    #[test]
    fn hotkeys_ignored_when_not_running() {
        hotkey("vrConfig");
        hotkey("bilinmeyen");
        assert!(!running() && !config_mode() && !hides_desktop());
        assert!(sh().inner.lock().cmds.is_empty());
    }

    // ---- openvr_gen.rs, başlık alıntısıyla bağımsız olarak karşılaştırılır ----

    const EXCERPT: &str = include_str!("openvr_capi_excerpt.h");

    /// Alıntıdaki `struct VR_<arayüz>_FnTable` içindeki işlev adları ve bildirim satırları, sırayla
    fn table(iface: &str) -> Vec<(String, String)> {
        let start = EXCERPT.find(&format!("struct VR_{iface}_FnTable")).expect("tablo alıntıda yok");
        let body = &EXCERPT[start..];
        let body = &body[..body.find("};").expect("tablo sonu")];
        body.lines()
            .filter(|l| l.contains("(OPENVR_FNTABLE_CALLTYPE *"))
            .map(|l| {
                let after = l.split("(OPENVR_FNTABLE_CALLTYPE *").nth(1).unwrap();
                (after[..after.find(')').unwrap()].to_string(), l.trim().to_string())
            })
            .collect()
    }

    #[test]
    fn fn_tables_match_header() {
        use openvr_gen::*;
        assert!(EXCERPT.contains(&format!("IVRSystem_Version = \"{IVRSYSTEM_VERSION}\"")));
        assert!(EXCERPT.contains(&format!("IVROverlay_Version = \"{IVROVERLAY_VERSION}\"")));
        assert!(EXCERPT.contains(&format!("OpenVR SDK {OPENVR_TAG} ")));
        for (iface, names, used) in [("IVRSystem", &IVRSYSTEM_FNS[..], &ivrsystem::USED[..]), ("IVROverlay", &IVROVERLAY_FNS[..], &ivroverlay::USED[..])] {
            let t = table(iface);
            // Alan sayısı ve sırası başlıkla aynı (tablo yalnız işlev işaretçilerinden oluşur)
            assert_eq!(t.len(), names.len(), "{iface}");
            let body_lines = {
                let start = EXCERPT.find(&format!("struct VR_{iface}_FnTable")).unwrap();
                let body = &EXCERPT[start..];
                body[..body.find("};").unwrap()].lines().filter(|l| l.trim_end().ends_with(';')).count()
            };
            assert_eq!(body_lines, names.len(), "{iface}: tabloda işlev olmayan alan var");
            for (i, (name, _)) in t.iter().enumerate() {
                assert_eq!(name, names[i], "{iface}[{i}]");
            }
            // Kullanılan her işlevin indeksi ve C bildirimi başlıktakiyle aynı
            for (name, idx, decl) in used {
                assert_eq!(&t[*idx].0, name, "{iface}.{name} indeksi");
                assert_eq!(&t[*idx].1, decl, "{iface}.{name} bildirimi");
            }
        }
        // Elle doğrulanmış birkaç bilinen konum (v2.5.1)
        assert_eq!(ivroverlay::FindOverlay, 0);
        assert_eq!(ivroverlay::CreateOverlay, 1);
        assert_eq!(IVROVERLAY_FNS[ivroverlay::SetOverlayRaw], "SetOverlayRaw");
        assert_eq!(IVRSYSTEM_FNS[ivrsystem::PollNextEvent], "PollNextEvent");
        assert_eq!(IVRSYSTEM_FNS.len(), 46);
        assert_eq!(IVROVERLAY_FNS.len(), 80);
    }

    #[test]
    fn enums_and_layouts_match_header() {
        use openvr_gen::*;
        for (text, value) in [
            ("ETrackingUniverseOrigin_TrackingUniverseSeated = ", UNIVERSE_SEATED),
            ("ETrackingUniverseOrigin_TrackingUniverseStanding = ", UNIVERSE_STANDING),
            ("EVRApplicationType_VRApplication_Overlay = ", APP_OVERLAY),
            ("EVRApplicationType_VRApplication_Background = ", APP_BACKGROUND),
            ("EVREventType_VREvent_Quit = ", EVENT_QUIT),
        ] {
            assert!(EXCERPT.contains(&format!("{text}{value},")), "{text}");
        }
        // HmdMatrix34_t: float m[3][4]; TrackedDevicePose_t: matris + 2 × HmdVector3_t + enum + 2 bool
        assert!(EXCERPT.contains("float m[3][4];"));
        assert_eq!(std::mem::size_of::<HmdMatrix34>(), 48);
        assert_eq!(std::mem::size_of::<TrackedDevicePose>(), 80);
        assert_eq!(std::mem::align_of::<TrackedDevicePose>(), 4);
        assert_eq!(std::mem::offset_of!(TrackedDevicePose, pose_is_valid), 76);
        let pose = &EXCERPT[EXCERPT.find("typedef struct TrackedDevicePose_t").unwrap()..];
        let pose: Vec<&str> = pose[..pose.find('}').unwrap()].lines().skip(2).map(|l| l.trim()).collect();
        assert_eq!(
            pose,
            [
                "struct HmdMatrix34_t mDeviceToAbsoluteTracking;",
                "struct HmdVector3_t vVelocity;",
                "struct HmdVector3_t vAngularVelocity;",
                "enum ETrackingResult eTrackingResult;",
                "bool bPoseIsValid;",
                "bool bDeviceIsConnected;",
            ]
        );
        // VREvent_t: uint32 + uint32 + float, sonra en büyüğü 6 × uint64 olan birleşim → Windows'ta 64 bayt
        let ev = &EXCERPT[EXCERPT.find("struct VREvent_t\n").unwrap()..];
        assert!(ev.contains("uint32_t eventType;") && ev.find("eventType").unwrap() < ev.find("trackedDeviceIndex").unwrap());
        assert!(EXCERPT.contains("uint64_t reserved5;") && !EXCERPT.contains("uint64_t reserved6;"));
        // Düz API bildirimleri (win.rs Api alanları)
        for decl in [
            "S_API intptr_t VR_InitInternal( EVRInitError *peError, EVRApplicationType eType );",
            "S_API void VR_ShutdownInternal();",
            "S_API bool VR_IsHmdPresent();",
            "S_API intptr_t VR_GetGenericInterface( const char *pchInterfaceVersion, EVRInitError *peError );",
            "S_API bool VR_IsRuntimeInstalled();",
            "S_API const char * VR_GetVRInitErrorAsEnglishDescription( EVRInitError error );",
        ] {
            assert!(EXCERPT.contains(decl), "{decl}");
        }
    }

    /// Paketlenen DLL gerçekten 64 bit bir Windows DLL'i ve kullanılan simgeleri dışa aktarıyor
    #[test]
    fn bundled_dll_exports() {
        let dll = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/openvr/openvr_api.dll")).expect("openvr_api.dll paketlenmeli");
        assert_eq!(&dll[..2], b"MZ");
        let pe = u32::from_le_bytes([dll[0x3c], dll[0x3d], dll[0x3e], dll[0x3f]]) as usize;
        assert_eq!(&dll[pe..pe + 4], b"PE\0\0");
        // Makine: 0x8664 (x64)
        assert_eq!(u16::from_le_bytes([dll[pe + 4], dll[pe + 5]]), 0x8664);
        let has = |name: &str| {
            let n = format!("\0{name}\0");
            dll.windows(n.len()).any(|w| w == n.as_bytes())
        };
        for name in [
            "VR_InitInternal",
            "VR_ShutdownInternal",
            "VR_IsHmdPresent",
            "VR_GetGenericInterface",
            "VR_IsRuntimeInstalled",
            "VR_GetVRInitErrorAsEnglishDescription",
            "VR_IsInterfaceVersionValid",
        ] {
            assert!(has(name), "{name}");
        }
        assert!(std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/openvr/LICENSE.txt")).is_file());
    }
}
