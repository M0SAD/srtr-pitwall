//! SRTR Pitwall uygulama girişi: pencereler, komutlar, tepsi simgesi, kısayollar.

mod broadcast;
mod calc;
mod demo;
mod audio;
mod engine;
mod entitlement;
mod extras;
mod history;
mod i18n;
mod shots;
mod league;
mod logos;
mod model;
mod mqtt;
mod sdk;
mod sims;
mod server;
mod session;
mod trackmap;
mod toast;
mod tracker;
mod device;
mod updater;
mod voice;

use engine::{Packet, Shared, Sink, TopicReq};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Her iki pencere aynı WebView2 ortamını paylaşmalı (aynı argümanlar).
/// `--renderer-process-limit=1` iki pencerenin tek bir render sürecini paylaşmasını sağlar (RAM tasarrufu).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-networking --renderer-process-limit=1";

/// Ayarlar → Ekran'daki GPU seçenekleri eklenmiş tarayıcı argümanları. Başlangıçta bir kez
/// belirlenir (WebView2 ortamı süreç boyunca değişemez; değişiklik yeniden başlatınca geçerli).
static BROWSER_ARGS_DYN: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn browser_args() -> &'static str {
    BROWSER_ARGS_DYN.get().map(|s| s.as_str()).unwrap_or(BROWSER_ARGS)
}

fn init_browser_args(settings: Option<&Value>) {
    let d = settings.and_then(|v| v.pointer("/general/display"));
    let flag = |k: &str| d.and_then(|x| x.get(k)).and_then(|x| x.as_bool()).unwrap_or(false);
    let mut a = BROWSER_ARGS.to_string();
    if flag("disableGpu") {
        a += " --disable-gpu";
    }
    if flag("disableGpuCompositing") {
        a += " --disable-gpu-compositing";
    }
    let _ = BROWSER_ARGS_DYN.set(a);
}

/// Ana overlay penceresi (varsayılan monitör). Tarayıcı argümanları ayarlara bağlı olduğu
/// için yapılandırma dosyasında değil burada oluşturulur.
fn create_main_overlay(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("SRTR Pitwall Overlay")
        .inner_size(1920.0, 1080.0)
        .position(0.0, 0.0)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .additional_browser_args(browser_args())
        .build()?;
    Ok(())
}

/// Windows başlangıcında eklenen argüman: uygulama arayüz açılmadan tepside başlar.
const TRAY_ARG: &str = "--tray";

/// Görünen sürüm (ör. 290926-01). Tek kaynak: proje kökündeki version.json
const VERSION_JSON: &str = include_str!("../../version.json");

fn display_version() -> String {
    serde_json::from_str::<Value>(VERSION_JSON)
        .ok()
        .and_then(|v| v.get("display").and_then(|d| d.as_str()).map(String::from))
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppState {
    demo: bool,
    edit_mode: bool,
    connected: bool,
    hidden: bool,
}

fn app_state(s: &Shared) -> AppState {
    AppState {
        demo: s.demo.load(Ordering::Relaxed),
        edit_mode: s.edit_mode.load(Ordering::Relaxed),
        connected: s.connected.load(Ordering::Relaxed),
        hidden: s.user_hidden.load(Ordering::Relaxed),
    }
}

fn shared(app: &AppHandle) -> Arc<Shared> {
    app.state::<Arc<Shared>>().inner().clone()
}

fn broadcast_state(app: &AppHandle) {
    let _ = app.emit("app-state", app_state(&shared(app)));
}

/// Tüm overlay pencereleri: ana pencere ("overlay") ve diğer monitörlerinkiler ("overlay-m<n>").
pub(crate) fn overlay_windows(app: &AppHandle) -> Vec<tauri::WebviewWindow> {
    app.webview_windows()
        .into_iter()
        .filter(|(l, _)| l == "overlay" || l.starts_with("overlay-m"))
        .map(|(_, w)| w)
        .collect()
}

/// Overlay pencerelerini sadece gerektiğinde gösterir. Gizli pencere GPU/CPU kullanmaz.
pub(crate) fn sync_overlay_visibility(app: &AppHandle) {
    let s = shared(app);
    let show = ((s.connected.load(Ordering::Relaxed)
        || s.edit_mode.load(Ordering::Relaxed)
        || s.always_show.load(Ordering::Relaxed))
        && !s.user_hidden.load(Ordering::Relaxed))
        || s.peek.load(Ordering::Relaxed);
    for w in overlay_windows(app) {
        if show {
            let _ = w.show();
            let _ = w.set_always_on_top(true);
            // Pencere görünür olduktan sonra uygula (gizli pencerede bazı platformlarda çalışmaz).
            // Düzenleme modunda fare overlay'e gelir; normalde tıklamalar oyuna geçer.
            let _ = w.set_ignore_cursor_events(!s.edit_mode.load(Ordering::Relaxed));
        } else {
            let _ = w.hide();
        }
    }
    broadcast_state(app);
}

/// Ayarlardaki overlay kopyalarının kullandığı monitörler için pencere aç/kapat.
/// Ana overlay monitöründekiler ana pencerede çizilir; diğer her monitör için ayrı bir şeffaf pencere.
fn sync_monitor_windows(app: &AppHandle, settings: &Value) {
    let Some(main) = app.get_webview_window("overlay") else { return };
    let monitors = main.available_monitors().unwrap_or_default();
    let general = settings.get("general");
    let def_idx = general.and_then(|g| g.get("monitor")).and_then(|v| v.as_u64()).map(|v| v as usize);
    let def = def_idx
        .and_then(|i| monitors.get(i).cloned())
        .or_else(|| main.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned());
    let def_name = def.as_ref().and_then(|m| m.name().cloned()).unwrap_or_default();

    let mut wanted: Vec<String> = Vec::new();
    let mut always = false;
    if let Some(profiles) = settings.get("profiles").and_then(|p| p.as_object()) {
        for p in profiles.values() {
            let Some(ovs) = p.get("overlays").and_then(|o| o.as_object()) else { continue };
            for o in ovs.values() {
                let on = o.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                always |= on && o.get("alwaysShow").and_then(|v| v.as_bool()).unwrap_or(false);
                let m = o.get("monitor").and_then(|v| v.as_str()).unwrap_or("");
                if on && !m.is_empty() && m != def_name && !wanted.iter().any(|x| x == m) {
                    wanted.push(m.to_string());
                }
            }
        }
    }

    shared(app).always_show.store(always, Ordering::Relaxed);

    let mut keep: Vec<String> = Vec::new();
    for (i, m) in monitors.iter().enumerate() {
        let Some(name) = m.name() else { continue };
        if !wanted.iter().any(|w| w == name) {
            continue;
        }
        let label = format!("overlay-m{i}");
        keep.push(label.clone());
        let w = match app.get_webview_window(&label) {
            Some(w) => w,
            None => {
                let url = format!("overlay.html?monitor={}", server::url_encode(name));
                let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
                    .title("SRTR Pitwall Overlay")
                    .transparent(true)
                    .decorations(false)
                    .shadow(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .resizable(false)
                    .focused(false)
                    .visible(false)
                    .additional_browser_args(browser_args())
                    .build();
                match built {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("Monitör penceresi açılamadı: {e}");
                        continue;
                    }
                }
            }
        };
        let _ = w.set_position(PhysicalPosition::new(m.position().x, m.position().y));
        let _ = w.set_size(PhysicalSize::new(m.size().width, m.size().height));
    }
    for w in overlay_windows(app) {
        let l = w.label().to_string();
        if l != "overlay" && !keep.contains(&l) {
            let _ = w.destroy();
        }
    }
    sync_overlay_visibility(app);
}

// ---------------------------------------------------------------------------
// Ayarlar (yerel JSON dosyası)
// ---------------------------------------------------------------------------

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> Option<Value> {
    let p = settings_path(app)?;
    let text = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_settings_file(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Yarım yazılmış dosya kalmasın diye önce geçici dosyaya yaz, sonra taşı.
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Ayarların bellekteki kopyası. Değişiklik pencerelere anında iletilir,
/// diske ise arka planda en fazla ~0.4 sn'de bir, sadece son hali yazılır.
#[derive(Default)]
pub(crate) struct SettingsStore {
    current: Mutex<Option<Value>>,
    pending: Mutex<Option<Value>>,
}

impl SettingsStore {
    pub(crate) fn flush(&self, app: &AppHandle) {
        let v = self.pending.lock().take();
        if let (Some(v), Some(p)) = (v, settings_path(app)) {
            if let Err(e) = write_settings_file(&p, &v) {
                eprintln!("Ayarlar yazılamadı: {e}");
            }
        }
    }
}

fn spawn_settings_writer(app: AppHandle) {
    std::thread::Builder::new()
        .name("settings-writer".into())
        .spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(400));
            app.state::<SettingsStore>().flush(&app);
        })
        .expect("ayar yazıcı başlatılamadı");
}

/// Web sunucusu için güncel ayarlar
pub(crate) fn current_settings(app: &AppHandle) -> Option<Value> {
    app.state::<SettingsStore>().current.lock().clone()
}

#[tauri::command]
fn settings_get(store: State<'_, SettingsStore>) -> Option<Value> {
    store.current.lock().clone()
}

#[derive(Serialize, Clone)]
struct SettingsChanged {
    value: Value,
    source: String,
}

#[tauri::command]
fn settings_set(app: AppHandle, store: State<'_, SettingsStore>, value: Value, source: String) {
    *store.current.lock() = Some(value.clone());
    *store.pending.lock() = Some(value.clone());
    shared(&app).broadcast_settings(&value);
    apply_dynamic(&app, &value);
    // Diğer pencere beklemeden güncellensin (ör. kapatılan overlay anında kaybolsun).
    let _ = app.emit("settings-changed", SettingsChanged { value, source });
}

/// Ayarlardan Rust tarafının uyguladığı kısımlar: League Builder ve MQTT.
fn apply_dynamic(app: &AppHandle, value: &Value) {
    let sh = shared(app);
    let league = league_from_settings(value);
    let changed = {
        let cur = sh.league.lock();
        serde_json::to_string(&*cur).ok() != serde_json::to_string(&league).ok()
    };
    if changed {
        sh.set_league(league);
    }
    push_voice_cfg(app, value);
    sh.demo_mute.store(value.pointer("/general/demoMute").and_then(|x| x.as_bool()).unwrap_or(false), Ordering::Relaxed);
    {
        let sh2 = value.pointer("/general/sharing");
        let summaries = sh2.and_then(|x| x.get("summaries")).and_then(|x| x.as_bool()).unwrap_or(true);
        let keep = sh2.and_then(|x| x.get("keepSessions")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
        *sh.history_cfg.lock() = (summaries, keep);
    }
    let cfg = mqtt::cfg_from_settings(Some(value));
    let app = app.clone();
    let v = value.clone();
    let app2 = app.clone();
    let v2 = v.clone();
    std::thread::spawn(move || apply_shortcuts(&app2, Some(&v)));
    let app3 = app.clone();
    std::thread::spawn(move || sync_monitor_windows(&app3, &v2));
    // Bağlantı kurmak zaman alabilir; arayüzü bekletme
    std::thread::spawn(move || mqtt::apply(&app.state::<mqtt::MqttState>(), &shared(&app), cfg));
}

/// Sesli mühendis PRO'ya ayrıldıysa ve kullanıcı PRO değilse kapalı
fn voice_allowed(app: &AppHandle) -> bool {
    let e = entitlement::view(app);
    e.pro || !e.locked.iter().any(|x| x == "voice")
}

pub(crate) fn push_voice_cfg(app: &AppHandle, value: &Value) {
    let (vc, sc) = voice::cfg_from_settings(value);
    *shared(app).voice_cfg.lock() = Some((vc, sc, voice_allowed(app)));
}

#[tauri::command]
fn voice_info(app: AppHandle) -> voice::VoiceInfo {
    let (vc, _) = current_settings(&app).map(|v| voice::cfg_from_settings(&v)).unwrap_or_default();
    voice::info(&vc, shared(&app).voice_active.load(Ordering::Relaxed))
}

#[tauri::command]
fn voice_test(app: AppHandle, key: String) -> Result<(), String> {
    if !voice_allowed(&app) {
        return Err("Sesli mühendis PRO üyelere özel".into());
    }
    let (vc, sc) = current_settings(&app).map(|v| voice::cfg_from_settings(&v)).unwrap_or_default();
    let mut v = voice::Voice::default();
    v.set_cfg(vc, sc, true);
    v.test(&key)
}

#[tauri::command]
fn sound_test(app: AppHandle, kind: String) {
    let (_, sc) = current_settings(&app).map(|v| voice::cfg_from_settings(&v)).unwrap_or_default();
    match kind.as_str() {
        "alongside" => {
            let c = sc.alongside;
            std::thread::spawn(move || {
                let vol = c.volume.max(20.0) / 100.0;
                audio::send(audio::Cmd::Alongside(Some((-1.0, c.pitch.max(100.0), vol))));
                std::thread::sleep(std::time::Duration::from_millis(900));
                audio::send(audio::Cmd::Alongside(Some((1.0, c.pitch.max(100.0), vol))));
                std::thread::sleep(std::time::Duration::from_millis(900));
                audio::send(audio::Cmd::Alongside(None));
            });
        }
        _ => {
            let c = sc.faster_class;
            audio::send(audio::Cmd::Beep { freq: c.pitch.max(100.0), ms: 160, volume: c.volume.max(20.0) / 100.0, pan: 0.0 });
        }
    }
}

fn league_from_settings(v: &Value) -> Option<league::LeagueConfig> {
    let l = v.get("league")?;
    let active = l.get("active")?.as_str()?;
    if active.is_empty() {
        return None;
    }
    let cfg = l.get("configs")?.as_array()?.iter().find(|c| c.get("id").and_then(|x| x.as_str()) == Some(active))?;
    serde_json::from_value(cfg.clone()).ok()
}

#[tauri::command]
fn mqtt_status(app: AppHandle) -> mqtt::MqttStatus {
    mqtt::status(&app.state::<mqtt::MqttState>(), &shared(&app))
}

fn quit_app(app: &AppHandle) {
    app.state::<SettingsStore>().flush(app);
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Veri akışı
// ---------------------------------------------------------------------------

#[tauri::command]
fn stream_start(state: State<'_, Arc<Shared>>, channel: Channel<Packet>, topics: Vec<TopicReq>) -> u64 {
    state.subscribe(Sink::Channel(channel), &topics)
}

#[tauri::command]
fn stream_topics(state: State<'_, Arc<Shared>>, id: u64, topics: Vec<TopicReq>) {
    state.set_topics(id, &topics);
}

#[tauri::command]
fn stream_stop(state: State<'_, Arc<Shared>>, id: u64) {
    state.unsubscribe(id);
}

/// Kayıtlı pist haritasını sil (yeniden kaydedilir).
#[tauri::command]
fn map_forget(state: State<'_, Arc<Shared>>) {
    state.forget_map.store(true, Ordering::Relaxed);
}

// ---- iRacing komutları (Live Timing) ----

#[tauri::command]
fn camera_car(number: String) -> Result<(), String> {
    broadcast::camera_to_car(&number)
}

#[tauri::command]
fn replay_to(session_num: i32, time: f64) -> Result<(), String> {
    broadcast::replay_to(session_num, time)
}

#[tauri::command]
fn replay_live() -> Result<(), String> {
    broadcast::replay_live()
}

// ---- Ek pencereler: Pitwall ve Live Timing ----

#[tauri::command]
async fn window_open(app: AppHandle, view: String) -> Result<(), String> {
    let (label, title, w, h) = match view.as_str() {
        "pitwall" => ("pitwall", "Pitwall Paneli", 1500.0, 900.0),
        "timing" => ("timing", "Live Timing", 1100.0, 800.0),
        "engineer" => ("engineer", "Mühendis Ekranı", 1000.0, 600.0),
        "friends" => ("friends", "Arkadaşlar", 380.0, 680.0),
        v if v.starts_with("friend:") => {
            // Bir arkadaşın canlı verisi (her arkadaş için ayrı pencere)
            let id = &v["friend:".len()..];
            if id.is_empty() || id.len() > 40 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
                return Err("geçersiz arkadaş".into());
            }
            let label = format!("friend-{id}");
            if let Some(w) = app.get_webview_window(&label) {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
                return Ok(());
            }
            return WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("window.html?view=friend&id={id}").into()))
                .title(format!("SRTR Pitwall – {}", tr(&app, "Arkadaş verileri")))
                .inner_size(400.0, 820.0)
                .min_inner_size(340.0, 420.0)
                .additional_browser_args(browser_args())
                .build()
                .map(|_| ())
                .map_err(|e| e.to_string());
        }
        _ => return Err("bilinmeyen pencere".into()),
    };
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(format!("window.html?view={view}").into()))
        .title(format!("SRTR Pitwall – {}", tr(&app, title)))
        .inner_size(w, h)
        .min_inner_size(if label == "friends" { 320.0 } else { 700.0 }, if label == "friends" { 420.0 } else { 500.0 })
        .additional_browser_args(browser_args())
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Tepsiden "Arkadaşlar" penceresini aç
fn open_friends(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = window_open(app, "friends".into()).await;
    });
}

// ---- Web sunucusu (OBS tarayıcı kaynağı) ----

#[derive(Default)]
struct ServerState {
    server: Mutex<Option<server::WebServer>>,
    error: Mutex<Option<String>>,
    lan: std::sync::atomic::AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerInfo {
    running: bool,
    port: u16,
    url: Option<String>,
    lan_url: Option<String>,
    error: Option<String>,
}

fn server_info(app: &AppHandle) -> ServerInfo {
    let st = app.state::<ServerState>();
    let guard = st.server.lock();
    let port = guard.as_ref().map(|s| s.addr.port()).unwrap_or(0);
    let lan = st.lan.load(Ordering::Relaxed);
    let error = st.error.lock().clone();
    let info = ServerInfo {
        running: guard.is_some(),
        port,
        url: guard.as_ref().map(|_| format!("http://127.0.0.1:{port}")),
        lan_url: if guard.is_some() && lan { server::lan_ip().map(|ip| format!("http://{ip}:{port}")) } else { None },
        error,
    };
    info
}

fn apply_server(app: &AppHandle, enabled: bool, port: u16, lan: bool) {
    let st = app.state::<ServerState>();
    if let Some(old) = st.server.lock().take() {
        old.stop();
        // Eski dinleyicinin portu bırakması için kısa bekleme
        std::thread::sleep(std::time::Duration::from_millis(600));
    }
    *st.error.lock() = None;
    st.lan.store(lan, Ordering::Relaxed);
    if !enabled {
        return;
    }
    match server::start(app.clone(), shared(app), port, lan) {
        Ok(s) => *st.server.lock() = Some(s),
        Err(e) => *st.error.lock() = Some(e),
    }
}

#[tauri::command]
fn server_apply(app: AppHandle, enabled: bool, port: u16, lan: bool) -> ServerInfo {
    apply_server(&app, enabled, port, lan);
    server_info(&app)
}

#[tauri::command]
fn server_status(app: AppHandle) -> ServerInfo {
    server_info(&app)
}

// ---------------------------------------------------------------------------
// Uygulama durumu
// ---------------------------------------------------------------------------

#[tauri::command]
fn state_get(state: State<'_, Arc<Shared>>) -> AppState {
    app_state(&state)
}

#[tauri::command]
fn demo_set(app: AppHandle, on: bool) {
    shared(&app).demo.store(on, Ordering::Relaxed);
    broadcast_state(&app);
}

fn set_edit_mode(app: &AppHandle, on: bool) {
    let was = shared(app).edit_mode.swap(on, Ordering::Relaxed);
    sync_overlay_visibility(app);
    if on {
        for w in overlay_windows(app) {
            let _ = w.set_focus();
        }
    } else {
        if let Some(w) = app.get_webview_window("main") {
            // Düzenleme bitince panel normal pencere davranışına döner
            let _ = w.set_always_on_top(false);
        }
        if was && general_flag(app, "returnFocus", true) && shared(app).connected.load(Ordering::Relaxed) {
            focus_sim();
        }
    }
}

fn general_flag(app: &AppHandle, key: &str, default: bool) -> bool {
    current_settings(app)
        .and_then(|v| v.pointer(&format!("/general/{key}")).and_then(|x| x.as_bool()))
        .unwrap_or(default)
}

/// iRacing penceresini öne getirir (düzenleme bitince klavye/fare oyuna dönsün).
#[cfg(windows)]
fn focus_sim() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow};
    let name: Vec<u16> = "iRacing.com Simulator\0".encode_utf16().collect();
    unsafe {
        let h = FindWindowW(std::ptr::null(), name.as_ptr());
        if !h.is_null() {
            SetForegroundWindow(h);
        }
    }
}

#[cfg(not(windows))]
fn focus_sim() {}

/// iRacing bağlantısı kurulunca/koptuğunca (demo hariç)
pub(crate) fn on_connection_change(app: &AppHandle, connected: bool) {
    // Oyuna girince/çıkınca ekran görüntüsü kısayolunu kaydet/bırak
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let v = current_settings(&app);
            apply_shortcuts(&app, v.as_ref());
        });
    }
    if connected && !shared(app).demo.load(Ordering::Relaxed) && general_flag(app, "minimizeOnConnect", false) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    }
}

/// Kontrol panelini öne getirir. Düzenleme modundayken overlay penceresi her zaman üstte
/// olduğu için panel de geçici olarak "her zaman üstte" yapılır (panel kısayolu).
fn bring_panel_front(app: &AppHandle) {
    open_panel(app);
    if let Some(w) = app.get_webview_window("main") {
        let edit = shared(app).edit_mode.load(Ordering::Relaxed);
        let _ = w.set_always_on_top(edit);
        let _ = w.set_focus();
    }
}

#[tauri::command]
async fn panel_front(app: AppHandle) {
    bring_panel_front(&app);
}

/// Düzenleme ekranında sağ tık > "Ayarlarını aç": paneli öne getir ve o overlay'in kartını aç.
#[derive(Default)]
struct PendingFocus(Mutex<Option<String>>);

#[tauri::command]
async fn panel_focus_overlay(app: AppHandle, id: String) {
    *app.state::<PendingFocus>().0.lock() = Some(id.clone());
    bring_panel_front(&app);
    let _ = app.emit("focus-overlay", id);
}

/// Panel yeni açıldıysa olay kaçmış olabilir; açılışta bekleyen isteği alır.
#[tauri::command]
fn panel_take_focus(state: State<'_, PendingFocus>) -> Option<String> {
    state.0.lock().take()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionInfo {
    display: String,
    semver: String,
    update_configured: bool,
}

#[tauri::command]
fn app_version(app: AppHandle) -> VersionInfo {
    VersionInfo {
        display: display_version(),
        semver: app.package_info().version.to_string(),
        update_configured: updater::configured(&app),
    }
}

// ---- Windows ile başlat ----

/// Tarayıcıda bağlantı aç (sadece http/https)
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.contains(char::is_whitespace) {
        return Err("Geçersiz adres".into());
    }
    #[cfg(windows)]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn logos_list(app: AppHandle) -> Vec<logos::Logo> {
    logos::list(&app)
}

#[tauri::command]
fn logos_open_dir(app: AppHandle) -> Result<(), String> {
    logos::open_dir(&app)
}

fn sessions_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map(|d| history::dir(&d)).map_err(|e| e.to_string())
}

#[tauri::command]
fn sessions_info(app: AppHandle) -> Result<history::SessionsInfo, String> {
    Ok(history::info(&sessions_path(&app)?))
}

#[tauri::command]
fn sessions_open_dir(app: AppHandle) -> Result<(), String> {
    let d = sessions_path(&app)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    open_path(&d)
}

#[tauri::command]
fn sessions_prune(app: AppHandle, days: u32, keep: usize, all: Option<bool>) -> Result<usize, String> {
    Ok(history::prune(&sessions_path(&app)?, days, keep, all.unwrap_or(false)))
}

/// Oturum kaydının okunabilir özetini döner (dosya adı ile)
#[tauri::command]
fn session_summary(app: AppHandle, file: String) -> Result<String, String> {
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("geçersiz dosya".into());
    }
    let p = sessions_path(&app)?.join(&file);
    let r: history::SessionRecord = serde_json::from_slice(&std::fs::read(&p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(history::summary_text(&r))
}

fn open_path(d: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    let cmd = "explorer";
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = "xdg-open";
    std::process::Command::new(cmd).arg(d).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(app: AppHandle, on: bool) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    if on { al.enable() } else { al.disable() }.map_err(|e| e.to_string())?;
    Ok(al.is_enabled().unwrap_or(on))
}

/// Arkadaş listesi: güvendiği arkadaşın canlı yakıt verisini takım listesine ekler (Yakıt overlay'i ve Pitwall)
#[tauri::command]
fn team_remote_set(app: AppHandle, key: String, fuel: Option<mqtt::TeamFuel>) {
    let k = format!("friend-{}", mqtt::topic_key(&key));
    let s = shared(&app);
    let mut team = s.mqtt.team.lock();
    match fuel {
        Some(f) => {
            team.insert(k, f);
        }
        None => {
            team.remove(&k);
        }
    }
}

/// Panelden overlay eklenince: overlay'ler gizli olsa bile birkaç saniye göster, yeni overlay vurgulansın
#[tauri::command]
async fn overlay_peek(app: AppHandle, id: String, ms: Option<u64>) {
    let ms = ms.unwrap_or(4000).clamp(500, 10_000);
    let s = shared(&app);
    let gen = s.peek_gen.fetch_add(1, Ordering::Relaxed) + 1;
    s.peek.store(true, Ordering::Relaxed);
    sync_overlay_visibility(&app);
    let _ = app.emit("overlay-peek", serde_json::json!({ "id": id, "ms": ms }));
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(ms));
        let s = shared(&app);
        if s.peek_gen.load(Ordering::Relaxed) == gen {
            s.peek.store(false, Ordering::Relaxed);
            sync_overlay_visibility(&app);
        }
    });
}

#[tauri::command]
fn edit_mode_set(app: AppHandle, on: bool) {
    set_edit_mode(&app, on);
}

fn toggle_hidden(app: &AppHandle) {
    let s = shared(app);
    let v = !s.user_hidden.load(Ordering::Relaxed);
    s.user_hidden.store(v, Ordering::Relaxed);
    sync_overlay_visibility(app);
}

#[tauri::command]
fn hidden_set(app: AppHandle, on: bool) {
    shared(&app).user_hidden.store(on, Ordering::Relaxed);
    sync_overlay_visibility(&app);
}

// ---------------------------------------------------------------------------
// Monitörler
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    scale: f64,
    primary: bool,
}

#[tauri::command]
fn monitors_list(app: AppHandle) -> Vec<MonitorInfo> {
    let Some(w) = app.get_webview_window("overlay") else { return vec![] };
    let primary = w.primary_monitor().ok().flatten().map(|m| *m.position());
    w.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            index: i,
            name: m.name().cloned().unwrap_or_else(|| format!("Monitör {}", i + 1)),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            scale: m.scale_factor(),
            primary: primary.map(|p| p == *m.position()).unwrap_or(false),
        })
        .collect()
}

fn place_overlay(app: &AppHandle, index: Option<usize>) {
    let Some(w) = app.get_webview_window("overlay") else { return };
    let monitors = w.available_monitors().unwrap_or_default();
    let m = index
        .and_then(|i| monitors.get(i).cloned())
        .or_else(|| w.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned());
    if let Some(m) = m {
        let _ = w.set_position(PhysicalPosition::new(m.position().x, m.position().y));
        let _ = w.set_size(PhysicalSize::new(m.size().width, m.size().height));
    }
}

#[tauri::command]
fn overlay_set_monitor(app: AppHandle, index: usize) {
    place_overlay(&app, Some(index));
    if let Some(v) = current_settings(&app) {
        std::thread::spawn(move || sync_monitor_windows(&app, &v));
    }
}

/// Paneldeki düzen editörü açıkken iRacing yoksa önizleme için demo verisi üretilir
/// (overlay'ler ekranda görünmez).
#[tauri::command]
fn preview_set(app: AppHandle, on: bool) {
    shared(&app).preview.store(on, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------
// Kontrol paneli penceresi
// ---------------------------------------------------------------------------

/// Kontrol paneli kapatılınca tamamen yok edilir (RAM boşalır); tepsiden yeniden açılır.
fn open_panel(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // Ekranın ~%85'i kadar (en fazla 1600×1000), küçük ekranlarda en az 1000×680
    let (w, h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let sz = m.size().to_logical::<f64>(m.scale_factor());
            ((sz.width * 0.85).clamp(1000.0, 1600.0).min(sz.width), (sz.height * 0.85).clamp(680.0, 1000.0).min(sz.height - 40.0))
        })
        .unwrap_or((1400.0, 880.0));
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title(format!("SRTR Pitwall {}", display_version()))
        .inner_size(w, h)
        .min_inner_size(900.0, 600.0)
        .center()
        .additional_browser_args(browser_args())
        .build();
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", TRAY_LABELS[2].1, true, None::<&str>)?;
    let edit = MenuItem::with_id(app, "edit", TRAY_LABELS[0].1, true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", TRAY_LABELS[1].1, true, None::<&str>)?;
    let friends = MenuItem::with_id(app, "friends", TRAY_LABELS[4].1, true, None::<&str>)?;
    *app.state::<KeyBindings>().tray.lock() = vec![
        ("edit".into(), edit.clone()),
        ("hide".into(), hide.clone()),
        ("panel".into(), open.clone()),
        ("friends".into(), friends.clone()),
    ];
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    app.state::<KeyBindings>().tray.lock().push(("quit".into(), quit.clone()));
    let menu = Menu::with_items(app, &[&open, &friends, &edit, &hide, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip(format!("SRTR Pitwall {}", display_version()))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => bring_panel_front(app),
            "friends" => open_friends(app),
            "edit" => {
                let on = !shared(app).edit_mode.load(Ordering::Relaxed);
                set_edit_mode(app, on);
            }
            "hide" => toggle_hidden(app),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                bring_panel_front(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Kısayol eylemleri ve varsayılan tuşları
const SHORTCUTS: [(&str, &str); 4] =
    [("edit", "Ctrl+Shift+E"), ("hide", "Ctrl+Shift+D"), ("panel", "Ctrl+Shift+Space"), ("shot", "PrintScreen")];

#[derive(Default)]
struct KeyBindings {
    /// eylem -> kayıtlı kısayol
    bound: Mutex<Vec<(String, Shortcut)>>,
    /// Son uygulanan ayar (değişmediyse yeniden kaydetme)
    applied: Mutex<String>,
    errors: Mutex<Vec<(String, String)>>,
    /// Tepsi menüsündeki öğeler (etiketlerinde kısayol yazar)
    tray: Mutex<Vec<(String, MenuItem<tauri::Wry>)>>,
}

const TRAY_LABELS: [(&str, &str); 5] = [
    ("edit", "Düzenleme Modu"),
    ("hide", "Overlay Gizle/Göster"),
    ("panel", "Kontrol Paneli"),
    ("quit", "Çıkış"),
    ("friends", "Arkadaşlar"),
];

#[derive(Serialize)]
struct ShortcutError {
    action: String,
    error: String,
}

fn shortcuts_from_settings(v: Option<&Value>) -> Vec<(String, String)> {
    let sc = v.and_then(|v| v.get("general")).and_then(|g| g.get("shortcuts"));
    SHORTCUTS
        .iter()
        .map(|(a, d)| {
            let key = sc.and_then(|s| s.get(*a)).and_then(|x| x.as_str()).unwrap_or(d).trim().to_string();
            (a.to_string(), key)
        })
        .collect()
}

fn want_text(v: Option<&Value>, action: &str) -> String {
    shortcuts_from_settings(v).into_iter().find(|(a, _)| a == action).map(|(_, k)| k).unwrap_or_default()
}

/// Kısayolları ayarlardan (yeniden) kaydet. Boş tuş: o eylemin kısayolu yok.
///
/// Birden çok iş parçacığından çağrılabilir (ayar değişince, oyuna girip çıkınca): aynı anda iki
/// çağrı birbirinin kaydını bozmasın diye kilitlenir ve sadece değişen kısayollar bırakılıp kaydedilir.
fn apply_shortcuts(app: &AppHandle, v: Option<&Value>) {
    static LOCK: Mutex<()> = parking_lot::const_mutex(());
    let _guard = LOCK.lock();
    let mut want = shortcuts_from_settings(v);
    // Ekran görüntüsü kısayolu (PrintScreen) varsayılan olarak sadece oyundayken kaydedilir;
    // oyun kapalıyken tuş Windows'un kendi işlevine kalır.
    let only_in_game = v
        .and_then(|v| v.pointer("/general/screenshots/onlyInGame"))
        .and_then(|x| x.as_bool())
        .unwrap_or(true);
    let in_game = shared(app).connected.load(Ordering::Relaxed);
    if only_in_game && !in_game {
        want.retain(|(a, _)| a != "shot");
    }
    let key = format!("{want:?}");
    let st = app.state::<KeyBindings>();
    {
        let mut applied = st.applied.lock();
        if *applied == key {
            return;
        }
        *applied = key;
    }
    let gs = app.global_shortcut();

    // İstenen kısayolları çöz
    let mut parsed: Vec<(String, Shortcut)> = Vec::new();
    let mut errors = Vec::new();
    for (action, text) in want {
        if text.is_empty() {
            continue;
        }
        match text.parse::<Shortcut>() {
            Ok(sc) => {
                if parsed.iter().any(|(_, b)| b.id() == sc.id()) {
                    errors.push((action, "Başka bir eylemle aynı kısayol".into()));
                } else {
                    parsed.push((action, sc));
                }
            }
            Err(e) => errors.push((action, format!("Geçersiz kısayol: {e}"))),
        }
    }

    // Artık istenmeyenleri bırak
    let old: Vec<(String, Shortcut)> = st.bound.lock().clone();
    for (_, sc) in &old {
        if !parsed.iter().any(|(_, p)| p.id() == sc.id()) {
            let _ = gs.unregister(*sc);
        }
    }

    let mut bound = Vec::new();
    for (action, sc) in parsed {
        if gs.is_registered(sc) {
            bound.push((action, sc));
            continue;
        }
        match gs.register(sc) {
            Ok(()) => bound.push((action, sc)),
            Err(_) => {
                // Bu uygulamanın eski bir kaydı kalmış olabilir: bırakıp bir kez daha dene
                let _ = gs.unregister(sc);
                match gs.register(sc) {
                    Ok(()) => bound.push((action, sc)),
                    // Başka bir uygulama (ör. eski "PitWall" kurulumu) aynı kısayolu kullanıyor
                    Err(e) => errors.push((action, format!("Kaydedilemedi: başka bir uygulama bu kısayolu kullanıyor ({e})"))),
                }
            }
        }
    }
    for (a, e) in &errors {
        eprintln!("kısayol {a}: {e}");
    }
    *st.bound.lock() = bound;
    *st.errors.lock() = errors;
    refresh_tray_labels(app, v);
}

/// Tepsi menüsü etiketleri: arayüz dilinde, atanmış kısayolla birlikte
fn refresh_tray_labels(app: &AppHandle, v: Option<&Value>) {
    let st = app.state::<KeyBindings>();
    let bound: Vec<String> = st.bound.lock().iter().map(|(a, _)| a.clone()).collect();
    for (action, item) in st.tray.lock().iter() {
        let base = TRAY_LABELS.iter().find(|(a, _)| a == action).map(|(_, l)| *l).unwrap_or("");
        let base = tr(app, base);
        let key = bound.iter().any(|a| a == action).then(|| want_text(v, action));
        let _ = item.set_text(match key {
            Some(k) if !k.is_empty() => format!("{base} ({})", k.replace("Space", &tr(app, "Boşluk"))),
            _ => base,
        });
    }
}

// ---- Arayüz dili: Rust'ta görünen metinler (tepsi, pencere başlıkları, özetler) ----

fn tr(_app: &AppHandle, key: &str) -> String {
    i18n::tr(key)
}

/// Panel dil değişince çevirileri gönderir
#[tauri::command]
fn i18n_set(app: AppHandle, strings: std::collections::HashMap<String, String>) {
    i18n::set(strings);
    let v = current_settings(&app);
    refresh_tray_labels(&app, v.as_ref());
    for (label, title) in [("pitwall", "Pitwall Paneli"), ("timing", "Live Timing"), ("engineer", "Mühendis Ekranı")] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_title(&format!("SRTR Pitwall – {}", tr(&app, title)));
        }
    }
}

#[tauri::command]
fn shortcuts_status(app: AppHandle) -> Vec<ShortcutError> {
    app.state::<KeyBindings>()
        .errors
        .lock()
        .iter()
        .map(|(a, e)| ShortcutError { action: a.clone(), error: e.clone() })
        .collect()
}

fn setup_shortcuts(app: &AppHandle, saved: Option<&Value>) {
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let action = app
                .state::<KeyBindings>()
                .bound
                .lock()
                .iter()
                .find(|(_, s)| s.id() == shortcut.id())
                .map(|(a, _)| a.clone());
            match action.as_deref() {
                Some("edit") => {
                    let on = !shared(app).edit_mode.load(Ordering::Relaxed);
                    set_edit_mode(app, on);
                }
                Some("hide") => toggle_hidden(app),
                Some("panel") => bring_panel_front(app),
                Some("shot") => shots::take(app, false),
                _ => {}
            }
        })
        .build();
    if app.plugin(plugin).is_ok() {
        apply_shortcuts(app, saved);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = Arc::new(Shared::default());

    tauri::Builder::default()
        // Tek örnek: ikinci kez açılmaya çalışılırsa yeni kopya kapanır, mevcut olanın paneli öne gelir.
        // (Eklentiler arasında ilk sırada olmalı.)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| bring_panel_front(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![TRAY_ARG]),
        ))
        .manage(shared_state.clone())
        .manage(PendingFocus::default())
        .manage(updater::UpdateState::default())
        .manage(ServerState::default())
        .manage(SettingsStore::default())
        .manage(mqtt::MqttState::default())
        .manage(KeyBindings::default())
        .manage(shots::ShotState::default())
        .manage(entitlement::EntitlementState::default())
        .invoke_handler(tauri::generate_handler![
            settings_get,
            settings_set,
            stream_start,
            stream_topics,
            stream_stop,
            map_forget,
            camera_car,
            replay_to,
            replay_live,
            window_open,
            toast::toast_show,
            toast::toast_take,
            toast::toast_layout,
            toast::toast_open_chat,
            toast::friends_take_chat,
            server_apply,
            server_status,
            state_get,
            demo_set,
            edit_mode_set,
            overlay_peek,
            team_remote_set,
            hidden_set,
            monitors_list,
            overlay_set_monitor,
            preview_set,
            panel_front,
            panel_focus_overlay,
            panel_take_focus,
            app_version,
            autostart_get,
            autostart_set,
            logos_list,
            logos_open_dir,
            open_url,
            voice_info,
            voice_test,
            sound_test,
            mqtt_status,
            shortcuts_status,
            sessions_info,
            sessions_open_dir,
            sessions_prune,
            session_summary,
            i18n_set,
            shots::watermark_set,
            shots::shot_take,
            shots::shots_list,
            shots::shot_read,
            shots::shot_thumb,
            shots::shot_encode,
            shots::shot_delete,
            shots::shots_open_dir,
            shots::shots_dirs,
            shots::edit_backdrop_set,
            shots::edit_backdrop_import,
            shots::edit_backdrop_read,
            shots::edit_backdrop_clear,
            entitlement::entitlement_get,
            entitlement::entitlement_set,
            device::device_info,
            updater::update_check,
            updater::update_install,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Kayıtlı genel ayarları uygula (panel açılmadan önce).
            let saved = read_settings(&handle);
            *app.state::<SettingsStore>().current.lock() = saved.clone();
            spawn_settings_writer(handle.clone());
            let general = saved.as_ref().and_then(|v| v.get("general"));
            let demo = general.and_then(|g| g.get("demo")).and_then(|v| v.as_bool()).unwrap_or(false);
            let monitor = general.and_then(|g| g.get("monitor")).and_then(|v| v.as_u64()).map(|v| v as usize);
            let srv = general.and_then(|g| g.get("server"));
            let srv_on = srv.and_then(|v| v.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(false);
            let srv_port = srv.and_then(|v| v.get("port")).and_then(|v| v.as_u64()).unwrap_or(8910) as u16;
            let srv_lan = srv.and_then(|v| v.get("lan")).and_then(|v| v.as_bool()).unwrap_or(false);
            shared_state.demo.store(demo, Ordering::Relaxed);

            init_browser_args(saved.as_ref());
            create_main_overlay(&handle)?;
            place_overlay(&handle, monitor);

            // Güncelleme eklentisi sadece imzalı sürüm derlemelerinde (anahtar tanımlıysa) yüklenir.
            if updater::configured(&handle) {
                handle.plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            // Windows başlangıcında (--tray) sadece tepside başla; elle açılınca paneli göster.
            let from_autostart = std::env::args().any(|a| a == TRAY_ARG);
            if !from_autostart {
                open_panel(&handle);
            }

            setup_tray(&handle)?;
            setup_shortcuts(&handle, saved.as_ref());
            engine::spawn(handle.clone(), shared_state.clone());
            if srv_on {
                apply_server(&handle, true, srv_port, srv_lan);
            }
            if let Some(v) = saved.as_ref() {
                apply_dynamic(&handle, v);
            }
            sync_overlay_visibility(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("SRTR Pitwall başlatılamadı")
        .run(|app, event| match event {
            // Kontrol paneli kapansa da uygulama tepside çalışmaya devam eder.
            tauri::RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
            tauri::RunEvent::Exit => app.state::<SettingsStore>().flush(app),
            _ => {}
        });
}
