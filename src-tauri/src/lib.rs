//! SRTR Pitwall uygulama girişi: pencereler, komutlar, tepsi simgesi, kısayollar.

mod broadcast;
mod calc;
mod crashlog;
mod demo;
mod drivecues;
mod audio;
mod engine;
mod entitlement;
mod events;
mod extras;
mod glucose;
mod heartrate;
mod history;
mod laprec;
mod i18n;
mod irating;
mod shots;
mod league;
mod livechat;
mod logos;
mod model;
mod mqtt;
mod sdk;
mod sims;
mod server;
mod session;
mod setupcmp;
mod strategy;
mod trackmap;
mod translate;
mod osd;
mod toast;
mod trayalert;
mod tracker;
mod timing;
mod device;
mod updater;
mod voice;
mod voice_rules;
mod voicepack;
mod voicesub;
mod voicecmd;
#[cfg(windows)]
mod voicecmd_win;
#[cfg(windows)]
mod ptt_win;
mod vr;
mod wheeldev;
mod vrnative;
mod voicepack_build;
mod voicepack_dl;
mod backup;
mod winstate;
mod prtsc;

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
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Her iki pencere aynı WebView2 ortamını paylaşmalı (aynı argümanlar).
/// `--renderer-process-limit=1` iki pencerenin tek bir render sürecini paylaşmasını sağlar (RAM tasarrufu).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-background-networking --renderer-process-limit=1";

/// Ayarlar → Ekran'daki GPU seçenekleri eklenmiş tarayıcı argümanları. Başlangıçta bir kez
/// belirlenir (WebView2 ortamı süreç boyunca değişemez; değişiklik yeniden başlatınca geçerli).
static BROWSER_ARGS_DYN: std::sync::OnceLock<String> = std::sync::OnceLock::new();

pub(crate) fn browser_args() -> &'static str {
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
    // VR modu: overlay pencereleri arkada / ekran dışında kalınca da çizmeyi sürdürsün
    if let Some((feature, extra)) = vr::browser_flags(settings) {
        a = a.replacen("msSmartScreenProtection", &format!("msSmartScreenProtection,{feature}"), 1);
        a += " ";
        a += extra;
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
    // Overlay'ler sayfasında yeni eklenen overlay ekranda tutuluyor (oyun kapalıyken; oyun bağlanınca normal kurallar)
    let pinned = s.pin.lock().is_some() && !s.connected.load(Ordering::Relaxed);
    let show = show || pinned;
    // VR modu "masaüstü overlay'ini gizle": sadece düzenleme modunda (ve yeni eklenen overlay gösterilirken) görünür
    let show = show && (!vr::hide_desktop() || s.edit_mode.load(Ordering::Relaxed) || s.peek.load(Ordering::Relaxed) || pinned);
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
                // Canlı sohbet overlay'leri: "Sürekli göster" (options.always, varsayılan açık) oyun kapalıyken de pencereyi açık tutar
                let ty = o.get("type").and_then(|v| v.as_str()).unwrap_or("");
                always |= on
                    && matches!(ty, "livechat" | "livepoll" | "captions")
                    && o.pointer("/options/always").and_then(|v| v.as_bool()).unwrap_or(true);
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
                // Her monitörün penceresi ayrı başlıkta (pencere yakalama araçları ayırt edebilsin)
                let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
                    .title(format!("SRTR Pitwall Overlay - {}", name.trim_start_matches(|c: char| !c.is_ascii_alphanumeric())))
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
    vr::sync(app, settings);
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
            crashlog::guard(|| app.state::<SettingsStore>().flush(&app));
        })
        .expect("ayar yazıcı başlatılamadı");
}

/// Web sunucusu için güncel ayarlar
pub(crate) fn current_settings(app: &AppHandle) -> Option<Value> {
    app.state::<SettingsStore>().current.lock().clone()
}

/// Güncel ayarları KOPYALAMADAN okur (büyük JSON ağacı her seferinde klonlanmasın; saniyede bir çalışan
/// döngüler için). `f` içinde ayar deposuna dokunan başka bir çağrı YAPILMAMALI (kilit yeniden alınamaz):
/// yalnızca alan okuyan saf işlevler.
pub(crate) fn with_settings<R>(app: &AppHandle, f: impl FnOnce(Option<&Value>) -> R) -> R {
    let store = app.state::<SettingsStore>();
    let g = store.current.lock();
    f(g.as_ref())
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

/// Rust tarafı ayarın bir kısmını değiştirir (ör. yerel VR yerleşimleri): `f` true dönerse kaydedilir ve
/// pencerelere duyurulur. Ana iş parçacığı dışında çağrılmalı.
pub(crate) fn settings_patch(app: &AppHandle, source: &str, f: impl FnOnce(&mut Value) -> bool) {
    let Some(mut v) = current_settings(app) else { return };
    if !f(&mut v) {
        return;
    }
    if let Some(o) = v.as_object_mut() {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        o.insert("updatedAt".into(), Value::from(now));
    }
    settings_set(app.clone(), app.state::<SettingsStore>(), v, source.into());
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
    livechat::apply_settings(app, value);
    vrnative::apply_settings(app, value);
    sh.demo_mute.store(value.pointer("/general/demoMute").and_then(|x| x.as_bool()).unwrap_or(true), Ordering::Relaxed);
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

/// Ayarlardan ses ayarları (paket klasörü kurulu paketlerden ya da özel klasörden çözülür)
fn voice_cfg_of(app: &AppHandle, value: &Value) -> (voice::VoiceCfg, voice::SoundsCfg) {
    voice::cfg_from_settings(value, voicepack::voicepacks_dir(app).as_deref())
}

pub(crate) fn push_voice_cfg(app: &AppHandle, value: &Value) {
    let (vc, sc) = voice_cfg_of(app, value);
    *shared(app).voice_cfg.lock() = Some((vc, sc, voice_allowed(app)));
    // Sesli komut (bas-konuş) ayarları ve PRO izni de aynı anda yenilenir
    voicecmd::apply_settings(app, value);
}

#[tauri::command]
fn voice_info(app: AppHandle) -> voice::VoiceInfo {
    let (vc, _) = current_settings(&app).map(|v| voice_cfg_of(&app, &v)).unwrap_or_default();
    let dir = voicepack::voicepacks_dir(&app);
    voice::info(&vc, dir.as_deref(), shared(&app).voice_active.load(Ordering::Relaxed))
}

/// Test düğmeleri için ayrı bir ses motoru (son çalınan kaydı hatırlasın diye kalıcı)
static VOICE_TEST: Mutex<Option<voice::Voice>> = parking_lot::const_mutex(None);

#[tauri::command]
fn voice_test(app: AppHandle, key: String) -> Result<(), String> {
    // "Dene" herkese açık (PRO olmayanlar da sesleri duyabilsin); yarıştaki mühendis voice_allowed ile PRO kalır
    let (vc, sc) = current_settings(&app).map(|v| voice_cfg_of(&app, &v)).unwrap_or_default();
    let mut g = VOICE_TEST.lock();
    let v = g.get_or_insert_with(|| {
        let mut v = voice::Voice::default();
        v.acks = false;
        v
    });
    v.set_cfg(vc, sc, true);
    v.test(&key)
}

/// Ayarları değiştirmeden verilen klasördeki (ör. kayıt yapılan şablon klasörü) bir ifadeyi çal
#[tauri::command]
fn voice_test_dir(app: AppHandle, dir: String, key: String) -> Result<(), String> {
    let (mut vc, sc) = current_settings(&app).map(|v| voice_cfg_of(&app, &v)).unwrap_or_default();
    let (root, meta) = voicepack::resolve(None, "", &dir).ok_or("Bu klasörde ses paketi bulunamadı")?;
    vc.custom_dir = dir;
    vc.pack_root = Some(root);
    vc.pack_meta = meta;
    let mut g = VOICE_TEST.lock();
    let v = g.get_or_insert_with(|| {
        let mut v = voice::Voice::default();
        v.acks = false;
        v
    });
    v.set_cfg(vc, sc, true);
    v.test(&key)
}

/// Overlay'lerin kısa uyarı bipi (ör. Start Işıkları: yeşilde bip). Sınırlar burada uygulanır.
#[tauri::command]
fn overlay_beep(app: AppHandle, freq: f32, ms: u64, volume: f32) {
    // Demo modu sessizdir: örnek veriyle çalan overlay bipleri (start ışıkları, örnek ekip çağrısı) çalınmaz
    if shared(&app).demo.load(Ordering::Relaxed) {
        return;
    }
    audio::send(audio::Cmd::Beep { freq: freq.clamp(100.0, 4000.0), ms: ms.clamp(20, 1500), volume: volume.clamp(0.0, 1.0), pan: 0.0 });
}

#[tauri::command]
fn sound_test(app: AppHandle, kind: String) {
    let (_, sc) = current_settings(&app).map(|v| voice_cfg_of(&app, &v)).unwrap_or_default();
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

/// Komut işleyicisini sarar: eşzamanlı (sync) komutlar ana iş parçacığında, WebView2 geri çağrısının içinde çalışır;
/// oradaki bir panic FFI sınırını aşamayacağı için tüm programı kapatır. Burada yakalanır (crash.log'a yazılmıştır),
/// yalnızca o çağrı cevapsız kalır.
fn guard_invoke<F>(f: F) -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static
where
    F: Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static,
{
    move |invoke| crashlog::guard(|| f(invoke)).unwrap_or(true)
}

static QUITTING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn quit_now(app: &AppHandle) {
    app.state::<SettingsStore>().flush(app);
    app.exit(0);
}

/// Çıkış: kontrol paneli açıksa önce bekleyen ayar değişikliklerini hesaba göndermesi istenir (bulut eşitlemesi panelde
/// çalışır); panel `sync_flushed` ile haber verince ya da en geç 4 sn sonra uygulama kapanır. Panel kapalıysa hemen kapanır.
fn quit_app(app: &AppHandle) {
    if app.get_webview_window("main").is_none() || QUITTING.swap(true, Ordering::SeqCst) {
        return quit_now(app);
    }
    let _ = app.emit("flush-sync", ());
    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(4000));
        quit_now(&app2);
    });
}

/// Panel bekleyen değişiklikleri gönderdi: çıkış bekliyorsa hemen kapat
#[tauri::command]
fn sync_flushed(app: AppHandle) {
    if QUITTING.load(Ordering::SeqCst) {
        quit_now(&app);
    }
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

// ---- Olaylar ekranı ----

#[tauri::command]
fn events_get(state: State<'_, Arc<Shared>>, view: Option<String>) -> events::EventsInfo {
    let connected = state.connected.load(Ordering::Relaxed);
    // view: "current" | "previous" | yok (güncel oturum boşsa önceki oturum)
    state.events.lock().info_view(connected, events::View::parse(view.as_deref()))
}

/// Olay listesini (metin ya da CSV) kullanıcının kaydetme penceresinde seçtiği dosyaya yazar.
#[tauri::command]
fn events_export(path: String, text: String) -> Result<(), String> {
    let low = path.to_lowercase();
    if !low.ends_with(".csv") && !low.ends_with(".txt") {
        return Err("Dosya uzantısı .csv ya da .txt olmalı".into());
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// Olayın ~5 sn öncesine iRacing tekrarını sarar, kamerayı araca çevirir ve 1x oynatır; tekrarın
/// gerçekten oraya gittiğini telemetriden doğrular (bekleme içerdiği için ayrı iş parçacığında).
#[tauri::command]
async fn replay_seek(
    state: State<'_, Arc<Shared>>,
    session_num: i32,
    session_time: f64,
    car_number: String,
    car_idx: Option<i32>,
) -> Result<broadcast::SeekResult, String> {
    let (sim, demo) = {
        let ev = state.events.lock();
        (ev.sim, ev.demo)
    };
    if demo {
        return Err("Demo modunda tekrar yok".into());
    }
    if !sim.is_empty() && sim != "iracing" {
        return Err("Replay bu oyunda desteklenmiyor".into());
    }
    tauri::async_runtime::spawn_blocking(move || broadcast::replay_seek(session_num, session_time, &car_number, car_idx, 5.0))
        .await
        .map_err(|e| e.to_string())?
}

/// Ekip (uzaktan pit): ekip üyesinin gönderdiği pit komutunu iRacing'e uygular. Yetki ve ana anahtar
/// sunucuda ve arayüzde (host/crew.ts) denetlenir; burada sadece izinli pit komutları çalışır.
#[tauri::command]
fn crew_pit_command(state: State<'_, Arc<Shared>>, kind: String, args: Value) -> Result<(), String> {
    let (sim, demo) = {
        let ev = state.events.lock();
        (ev.sim, ev.demo)
    };
    if demo || !state.connected.load(Ordering::Relaxed) {
        return Err("Sürücü oyunda değil".into());
    }
    if !sim.is_empty() && sim != "iracing" {
        return Err("Bu oyunda desteklenmiyor".into());
    }
    broadcast::crew_apply(&kind, &args)
}

// ---- Ek pencereler: Pitwall ve Live Timing ----

/// Ekip Pitwall'ı penceresi: bir sürücünün (owner) canlı pitwall'ı ve ekip odası (her sürücü için ayrı pencere)
#[tauri::command]
async fn crew_window_open(app: AppHandle, owner: String) -> Result<(), String> {
    if owner.is_empty() || owner.len() > 40 || !owner.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("geçersiz sürücü".into());
    }
    let label = format!("crew-{owner}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("window.html?view=crew&owner={owner}").into()))
        .title(format!("SRTR Pitwall – {}", tr(&app, "Ekip Pitwall'ı")))
        .inner_size(1280.0, 720.0)
        .min_inner_size(720.0, 480.0)
        .additional_browser_args(browser_args())
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Kullanıcının en son klavye / fare kullanımından bu yana geçen süre (sn). Arkadaş listesindeki "Uzakta" için.
#[cfg(windows)]
#[tauri::command]
fn idle_seconds() -> u64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        if GetLastInputInfo(&mut info) == 0 {
            return 0;
        }
        (GetTickCount().wrapping_sub(info.dwTime) / 1000) as u64
    }
}
#[cfg(not(windows))]
#[tauri::command]
fn idle_seconds() -> u64 {
    0
}

/// Araç penceresini aç; zaten açık ve görünürse kapat (arayüzdeki "Arkadaşlar" düğmesi)
#[tauri::command]
async fn window_toggle(app: AppHandle, view: String) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window(&view) {
        if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.close();
            return Ok(false);
        }
    }
    window_open(app, view).await?;
    Ok(true)
}

fn valid_uuid(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Sohbet penceresine açılması istenen sekmeler (arkadaş kimliği, öne getir mi); sayfa `chat_tabs_take` ile alır
static CHAT_TABS: Mutex<Vec<(String, bool)>> = Mutex::new(Vec::new());
const CHAT_WIN: &str = "chat";

/// Sohbet penceresi (Steam gibi tek pencere, her arkadaş bir sekme). `front`: öne getir ve o sekmeyi seç;
/// değilse (yeni mesaj geldi) pencere yoksa görev çubuğunda simge durumunda, odak çalmadan açılır.
fn chat_window(app: &AppHandle, id: &str, front: bool) -> Result<(), String> {
    // Arkadaş kimliği, takım odası ("team:<id>") ya da grup sohbeti ("group:<id>")
    if !valid_uuid(id.strip_prefix("team:").or_else(|| id.strip_prefix("group:")).unwrap_or(id)) {
        return Err("geçersiz sohbet".into());
    }
    {
        let mut q = CHAT_TABS.lock();
        q.push((id.to_string(), front));
        let n = q.len();
        if n > 40 {
            q.drain(..n - 40);
        }
    }
    if let Some(w) = app.get_webview_window(CHAT_WIN) {
        let _ = app.emit_to(CHAT_WIN, "chat-tab", ());
        if front {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(app, CHAT_WIN, WebviewUrl::App("window.html?view=chat".into()))
        .title("SRTR Pitwall")
        // Çerçevesiz: sekme çubuğundan tutulup taşınır, düğmeler pencerenin içinde (src/window/chrome.tsx)
        .decorations(false)
        .inner_size(740.0, 640.0)
        .min_inner_size(420.0, 340.0)
        .focused(front)
        .visible(front)
        .additional_browser_args(browser_args())
        .build()
        .map_err(|e| e.to_string())?;
    if !front {
        show_minimized(&w);
    }
    Ok(())
}

/// Pencereyi görev çubuğunda simge durumunda, ETKİNLEŞTİRMEDEN göster (odak çalınmaz; pencere "tıklanmış" sayılmaz)
#[cfg(windows)]
fn show_minimized(w: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWMINNOACTIVE};
    if let Ok(h) = w.hwnd() {
        unsafe {
            ShowWindow(h.0 as _, SW_SHOWMINNOACTIVE);
        }
    }
}
#[cfg(not(windows))]
fn show_minimized(w: &tauri::WebviewWindow) {
    let _ = w.minimize();
    let _ = w.show();
}

/// Görev çubuğu düğmesini, pencere öne gelene kadar renkli (yanıp sönen) yap
#[cfg(windows)]
fn flash_taskbar(w: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{FlashWindowEx, FLASHWINFO, FLASHW_TIMERNOFG, FLASHW_TRAY};
    if let Ok(h) = w.hwnd() {
        let info = FLASHWINFO {
            cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
            hwnd: h.0 as _,
            dwFlags: FLASHW_TRAY | FLASHW_TIMERNOFG,
            uCount: u32::MAX,
            dwTimeout: 0,
        };
        unsafe {
            FlashWindowEx(&info);
        }
    }
}
#[cfg(not(windows))]
fn flash_taskbar(w: &tauri::WebviewWindow) {
    let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
}

/// Sohbet penceresi: bekleyen sekme istekleri (bir kez verilir)
#[tauri::command]
fn chat_tabs_take() -> Vec<(String, bool)> {
    std::mem::take(&mut *CHAT_TABS.lock())
}

/// Yeni özel mesaj: sohbet penceresi görev çubuğunda belirir (yoksa simge durumunda açılır), arkadaşın sekmesi
/// eklenir ve pencere önde değilse görev çubuğu düğmesi yanıp söner (Steam gibi). Odak çalınmaz.
#[tauri::command]
async fn chat_window_notify(app: AppHandle, friend: String) -> Result<(), String> {
    chat_window(&app, &friend, false)?;
    if let Some(w) = app.get_webview_window(CHAT_WIN) {
        // Önde ve odakta değilse (simge durumunda ya da başka pencerenin arkasında) görev çubuğunda renkli görünür
        let front = w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false) && w.is_visible().unwrap_or(false);
        if !front {
            flash_taskbar(&w);
        }
    }
    Ok(())
}

#[tauri::command]
async fn window_open(app: AppHandle, view: String) -> Result<(), String> {
    let (label, title, w, h) = match view.as_str() {
        "pitwall" => ("pitwall", "Pitwall Paneli", 1500.0, 900.0),
        "timing" => ("timing", "Live Timing", 1100.0, 800.0),
        "engineer" => ("engineer", "Mühendis Ekranı", 1000.0, 600.0),
        "friends" => ("friends", "Arkadaşlar", 380.0, 680.0), // başlık aşağıda "SRTR Pitwall - Arkadaşlar"
        "events" => ("events", "Olaylar", 720.0, 760.0),
        v if v.starts_with("chat:") => {
            // Bir arkadaşla sohbet (Steam gibi: her sohbet görev çubuğunda ayrı pencere)
            let id = &v["chat:".len()..];
            return chat_window(&app, id, true);
        }
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
    // Son kullanılan konum/boyut (bağlı bir monitördeyse); pencere gizli açılıp yerleştirildikten sonra gösterilir
    let saved = winstate::restore(&app, label);
    let win = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(format!("window.html?view={view}").into()))
        .title(format!("SRTR Pitwall {} {}", if label == "friends" { "-" } else { "–" }, tr(&app, title)))
        .inner_size(w, h)
        .min_inner_size(
            match label {
                "friends" => 320.0,
                "events" => 460.0,
                _ => 700.0,
            },
            if label == "friends" { 420.0 } else { 500.0 },
        )
        // Arkadaşlar penceresi çerçevesiz: üstteki profil çubuğundan tutulup taşınır
        .decorations(label != "friends")
        .visible(saved.is_none())
        .additional_browser_args(browser_args())
        .build()
        .map_err(|e| e.to_string())?;
    if let Some(g) = saved {
        winstate::apply(&win, &g);
        let _ = win.show();
        let _ = win.set_focus();
    }
    winstate::track(&app, &win);
    Ok(())
}

/// Tepsiden "Arkadaşlar" penceresini aç
fn open_friends(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = window_open(app, "friends".into()).await;
    });
}

/// "Olaylar" penceresini aç (tepsi ve yarış bitince otomatik)
pub(crate) fn open_events(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = window_open(app, "events".into()).await;
    });
}

/// "Olaylar" penceresi açık değilse aç (tekrar başlayınca; açıksa odağı çalma)
pub(crate) fn open_events_if_closed(app: &AppHandle) {
    let open = app
        .get_webview_window("events")
        .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false);
    if !open {
        open_events(app);
    }
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

/// "Başka cihazda aç" paneli: sunucu ağa açıkken bu bilgisayarın yerel IPv4 adreslerine göre adresler
/// (http://<ip>:<port>). Sunucu kapalıysa ya da yalnızca bu bilgisayara açıksa boş liste.
#[tauri::command]
fn server_lan_urls(app: AppHandle) -> Vec<String> {
    let st = app.state::<ServerState>();
    let guard = st.server.lock();
    let Some(srv) = guard.as_ref() else { return Vec::new() };
    if !st.lan.load(Ordering::Relaxed) {
        return Vec::new();
    }
    let port = srv.addr.port();
    server::lan_ips().into_iter().map(|ip| format!("http://{ip}:{port}")).collect()
}

/// Dashboard tasarımını (JSON) kullanıcının kaydetme penceresinde seçtiği dosyaya yazar.
#[tauri::command]
fn dash_export(path: String, text: String) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".json") {
        return Err("Dosya uzantısı .json olmalı".into());
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())
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
    with_settings(app, |v| v.and_then(|v| v.get("general")).and_then(|g| g.get(key)).and_then(|x| x.as_bool())).unwrap_or(default)
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
    // Yerel VR: "Sim bağlanınca otomatik başlat" (demo sayılmaz)
    if !shared(app).demo.load(Ordering::Relaxed) || !connected {
        vrnative::on_connection(app, connected);
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
struct PendingFocus(Mutex<Option<serde_json::Value>>);

/// `profile`: sağ tıklanan overlay'in bulunduğu düzen (ekranda o an düzenlenen düzen; etkin düzenden farklı olabilir).
#[tauri::command]
async fn panel_focus_overlay(app: AppHandle, id: String, profile: Option<String>) {
    let payload = serde_json::json!({ "id": id, "profile": profile.filter(|x| !x.is_empty()) });
    *app.state::<PendingFocus>().0.lock() = Some(payload.clone());
    bring_panel_front(&app);
    let _ = app.emit("focus-overlay", payload);
}

/// Panel yeni açıldıysa olay kaçmış olabilir; açılışta bekleyen isteği alır ({ id, profile }).
#[tauri::command]
fn panel_take_focus(state: State<'_, PendingFocus>) -> Option<serde_json::Value> {
    state.0.lock().take()
}

/// Ekranda tutulan (pin) overlay'in düzeni: Overlay'ler sayfasında düzenlenen düzen (None → etkin düzen).
#[derive(Default)]
struct PinProfile(Mutex<Option<String>>);

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

/// Ödeme penceresinin dönüş adresi öneki (pencere yeniden kullanılınca güncellenir)
static CHECKOUT_DONE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

/// Ödeme sayfasını (Lemon Squeezy) programın içinde ayrı bir pencerede açar. Pencere dış adres
/// gösterir; IPC izni yoktur (capabilities'te "checkout" yok). Ödeme bitip sayfa `done_prefix` ile
/// başlayan dönüş adresine gitmek isteyince gezinme engellenir, "checkout-done" olayı yayınlanır ve
/// pencere kapanır. Pencere elle kapatılırsa "checkout-closed" yayınlanır.
#[tauri::command]
async fn checkout_open(app: AppHandle, url: String, done_prefix: String) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| "Geçersiz adres".to_string())?;
    if parsed.scheme() != "https" || !done_prefix.starts_with("https://") {
        return Err("Geçersiz adres".into());
    }
    if let Ok(mut d) = CHECKOUT_DONE.lock() {
        *d = done_prefix;
    }
    if let Some(w) = app.get_webview_window("checkout") {
        w.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let nav_app = app.clone();
    let w = WebviewWindowBuilder::new(&app, "checkout", WebviewUrl::External(parsed))
        .title(format!("SRTR Pitwall – {}", tr(&app, "Ödeme")))
        .inner_size(520.0, 760.0)
        .min_inner_size(380.0, 480.0)
        .center()
        .resizable(true)
        .decorations(true)
        .focused(true)
        .additional_browser_args(browser_args())
        .on_navigation(move |u| {
            let done = CHECKOUT_DONE.lock().map(|d| d.clone()).unwrap_or_default();
            if done.is_empty() || !u.as_str().starts_with(&done) {
                return true;
            }
            let _ = nav_app.emit("checkout-done", u.as_str().to_string());
            let a = nav_app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(w) = a.get_webview_window("checkout") {
                    let _ = w.close();
                }
            });
            false
        })
        .build()
        .map_err(|e| e.to_string())?;
    let ev_app = app.clone();
    w.on_window_event(move |e| {
        if let tauri::WindowEvent::Destroyed = e {
            let _ = ev_app.emit("checkout-closed", ());
        }
    });
    Ok(())
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

fn telemetry_queue(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(laprec::queue_path(&d))
}

/// Telemetri kuyruğu: yüklenmeyi bekleyen en eski turlar (iz dahil) ve toplam sayı
#[tauri::command]
fn telemetry_pending(app: AppHandle, limit: Option<usize>) -> Result<Value, String> {
    let p = telemetry_queue(&app)?;
    let laps = laprec::pending(&p, limit.unwrap_or(20).clamp(1, 200));
    Ok(serde_json::json!({ "laps": laps, "total": laprec::count(&p) }))
}

/// Yüklenen turları kuyruktan siler; kalan sayıyı döner
#[tauri::command]
fn telemetry_ack(app: AppHandle, ids: Vec<String>) -> Result<usize, String> {
    laprec::ack(&telemetry_queue(&app)?, &ids).map_err(|e| e.to_string())
}

/// Yüklenmemiş turları siler
#[tauri::command]
fn telemetry_queue_clear(app: AppHandle) -> Result<(), String> {
    laprec::clear(&telemetry_queue(&app)?).map_err(|e| e.to_string())
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

/// Overlay'ler sayfasında yeni eklenen overlay'i ekranda tut (id: None → bırak). Süre sınırı yok: kullanıcı sayfadan
/// çıkınca / başka overlay seçince / panel kapanınca bırakılır. Tutulurken oyun kapalıysa örnek (demo) veri üretilir
/// (engine.rs: preview), overlay pencereleri gizli olsa da açılır.
#[tauri::command]
fn overlay_pin(app: AppHandle, id: Option<String>, profile: Option<String>) {
    let id = id.filter(|x| !x.is_empty());
    let profile = if id.is_some() { profile.filter(|x| !x.is_empty()) } else { None };
    set_overlay_pin(&app, id, profile);
}

#[tauri::command]
fn overlay_pin_get(app: AppHandle) -> Option<String> {
    shared(&app).pin.lock().clone()
}

/// Sonradan açılan overlay penceresi için: tutulan overlay'in düzeni
#[tauri::command]
fn overlay_pin_profile_get(state: State<'_, PinProfile>) -> Option<String> {
    state.0.lock().clone()
}

fn set_overlay_pin(app: &AppHandle, id: Option<String>, profile: Option<String>) {
    let s = shared(app);
    {
        let pp = app.state::<PinProfile>();
        let mut g = s.pin.lock();
        let mut gp = pp.0.lock();
        if *g == id && *gp == profile {
            return;
        }
        *g = id.clone();
        *gp = profile.clone();
    }
    let _ = app.emit("overlay-pin", serde_json::json!({ "id": id, "profile": profile }));
    sync_overlay_visibility(app);
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

/// Kısayol: sesli mühendisi aç/kapat (`general.voice.enabled`). Onay olarak bir ifade (yoksa bip)
/// çalınır ve overlay'de kısa bir bildirim gösterilir.
fn toggle_voice(app: &AppHandle) {
    if !voice_allowed(app) {
        audio::send(audio::Cmd::Beep { freq: 300.0, ms: 160, volume: 0.5, pan: 0.0 });
        let _ = app.emit("voice-toggled", serde_json::json!({ "on": false, "error": true }));
        return;
    }
    let cur = with_settings(app, |v| v.and_then(|v| v.pointer("/general/voice/enabled").and_then(|x| x.as_bool()))).unwrap_or(true);
    set_voice_enabled(app, !cur, true);
}

/// Sesli mühendisi aç / kapat (kısayol ve "sus" / "konuşabilirsin" sesli komutları). Onay ifadesi ses paketinden
/// çalındıysa true; `beep_fallback`: paket yoksa bip çal (sesli komut kendi cevabını Windows sesiyle söyler).
pub(crate) fn set_voice_enabled(app: &AppHandle, on: bool, beep_fallback: bool) -> bool {
    let Some(mut v) = current_settings(app) else { return false };
    let Some(vo) = v.pointer_mut("/general/voice").and_then(|x| x.as_object_mut()) else { return false };
    vo.insert("enabled".into(), Value::Bool(on));
    if let Some(o) = v.as_object_mut() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        o.insert("updatedAt".into(), Value::from(now));
    }
    // Onayı burada çal; ses motoru aynı değişikliği bir daha söylemesin
    shared(app).voice_skip_ack.store(true, Ordering::Relaxed);
    settings_set(app.clone(), app.state::<SettingsStore>(), v.clone(), "shortcut".into());
    let said = {
        let (vc, sc) = voice_cfg_of(app, &v);
        let mut g = VOICE_TEST.lock();
        let t = g.get_or_insert_with(|| {
            let mut t = voice::Voice::default();
            t.acks = false;
            t
        });
        t.set_cfg(vc, sc, true);
        t.test(if on { "acknowledge/keepQuietDisabled" } else { "acknowledge/keepQuietEnabled" }).is_ok()
    };
    if !said && beep_fallback {
        // Ses paketi/kaydı yok: açılınca iki tiz, kapanınca bir pes bip
        let beeps: &'static [f32] = if on { &[880.0, 1320.0] } else { &[440.0] };
        std::thread::spawn(move || {
            for (i, f) in beeps.iter().enumerate() {
                if i > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(140));
                }
                audio::send(audio::Cmd::Beep { freq: *f, ms: 110, volume: 0.5, pan: 0.0 });
            }
        });
    }
    // Overlay kısa bir bildirim gösterir (metin arayüz dilinde, bkz. Host.tsx)
    let _ = app.emit("voice-toggled", serde_json::json!({ "on": on, "error": false }));
    said
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

/// Monitör listesinin imzası (ad + konum + boyut + ölçek). Değişince monitör takıldı/çıkarıldı demektir.
fn monitor_signature(app: &AppHandle) -> Option<String> {
    let w = app.get_webview_window("overlay")?;
    let list = w.available_monitors().ok()?;
    Some(
        list.iter()
            .map(|m| {
                format!(
                    "{}@{},{}:{}x{}*{}",
                    m.name().cloned().unwrap_or_default(),
                    m.position().x,
                    m.position().y,
                    m.size().width,
                    m.size().height,
                    m.scale_factor()
                )
            })
            .collect::<Vec<_>>()
            .join("|"),
    )
}

/// Monitör tak-çıkar takibi: her 2 sn'de bir monitör listesini karşılaştırır (ucuz).
/// Değişince overlay pencereleri yeniden yerleştirilir ve arayüze "monitors-changed" gönderilir.
fn spawn_monitor_watch(app: AppHandle) {
    std::thread::spawn(move || crashlog::supervise("monitor-watch", || {
        let mut last = monitor_signature(&app);
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let Some(sig) = monitor_signature(&app) else { continue };
            if last.as_deref() == Some(sig.as_str()) {
                continue;
            }
            last = Some(sig);
            // Windows'un yeni düzeni oturtması için kısa bir bekleme
            std::thread::sleep(std::time::Duration::from_millis(400));
            let settings = current_settings(&app);
            let monitor = settings
                .as_ref()
                .and_then(|v| v.pointer("/general/monitor"))
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            place_overlay(&app, monitor);
            if let Some(v) = settings.as_ref() {
                sync_monitor_windows(&app, v);
            }
            let _ = app.emit("monitors-changed", ());
        }
    }));
}

/// "Windows ile başlat" (sistem tepsisinde, --tray) varsayılan olarak açıktır: ilk kurulumda ve bu varsayılanın
/// geldiği sürüme güncellenen mevcut kurulumlarda bir kez açılır. İşaret dosyası sayesinde kullanıcı sonradan
/// kapatırsa tekrar açılmaz.
fn autostart_first_run(app: &AppHandle, _had_settings: bool) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    // v2: mevcut kurulumlar da bir kez açılır (eski "autostart.init" sadece yeni kurulumları açıyordu)
    // v3 (163 sonrası): bir kez daha açılır — eski kurulumlarda kayıt hiç yazılmamış ya da eski kurulum yolunda kalmış olabiliyordu
    let marker = dir.join("autostart.v3");
    // Geliştirme derlemesi kendini başlangıca eklemesin
    if cfg!(debug_assertions) {
        return;
    }
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    if marker.exists() {
        // Açıksa kayıt her açılışta yenilenir: program başka bir klasöre kurulduysa başlangıç kaydı eski yolu göstermesin
        if al.is_enabled().unwrap_or(false) {
            let _ = al.enable();
        }
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&marker, b"1");
    if let Err(e) = al.enable() {
        eprintln!("Otomatik başlatma açılamadı: {e}");
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
    if !on {
        set_preview_frozen(&app, false);
    }
}

/// Önizleme örnek verisi birkaç saniye oynadıktan sonra dondurulur (demo saati durur, görüntü sabit kalır).
/// Kullanıcının açtığı Demo modu ve canlı sim verisi bundan etkilenmez (bkz. engine.rs `frozen`).
#[tauri::command]
fn preview_freeze(app: AppHandle, on: bool) {
    set_preview_frozen(&app, on);
}

fn set_preview_frozen(app: &AppHandle, on: bool) {
    if shared(app).preview_frozen.swap(on, Ordering::Relaxed) != on {
        let _ = app.emit("preview-frozen", on);
    }
}

// ---------------------------------------------------------------------------
// Kontrol paneli penceresi
// ---------------------------------------------------------------------------

/// Kontrol panelinin son konumu ve boyutu (fiziksel piksel). Pencere taşındıkça / boyutlandıkça bellekte tutulur,
/// kapanırken (ve en çok 2 sn'de bir) `panel-window.json` dosyasına yazılır; panel bir sonraki açılışta aynı yerde açılır.
#[derive(Clone, Copy, PartialEq)]
struct PanelGeom {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    max: bool,
}

static PANEL_GEOM: Mutex<Option<PanelGeom>> = Mutex::new(None);
static PANEL_GEOM_SAVED: Mutex<Option<std::time::Instant>> = Mutex::new(None);

fn panel_geom_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("panel-window.json"))
}

fn load_panel_geom(app: &AppHandle) -> Option<PanelGeom> {
    if let Some(g) = *PANEL_GEOM.lock() {
        return Some(g);
    }
    let v: Value = serde_json::from_slice(&std::fs::read(panel_geom_path(app)?).ok()?).ok()?;
    let n = |k: &str| v.get(k).and_then(|x| x.as_i64());
    let g = PanelGeom {
        x: n("x")? as i32,
        y: n("y")? as i32,
        w: n("w")?.clamp(0, 20000) as u32,
        h: n("h")?.clamp(0, 20000) as u32,
        max: v.get("max").and_then(|x| x.as_bool()).unwrap_or(false),
    };
    (g.w >= 600 && g.h >= 400).then_some(g)
}

fn save_panel_geom(app: &AppHandle, force: bool) {
    let Some(g) = *PANEL_GEOM.lock() else { return };
    {
        let mut last = PANEL_GEOM_SAVED.lock();
        if !force && last.is_some_and(|t| t.elapsed() < std::time::Duration::from_secs(2)) {
            return;
        }
        *last = Some(std::time::Instant::now());
    }
    let Some(path) = panel_geom_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, serde_json::json!({ "x": g.x, "y": g.y, "w": g.w, "h": g.h, "max": g.max }).to_string());
}

/// Pencerenin o anki konumunu / boyutunu kaydeder. Simge durumundayken dokunulmaz; ekranı kaplamışken sadece
/// "kaplamış" bilgisi güncellenir (normal boyut korunur ki geri küçültünce eski yerine dönsün).
fn record_panel_geom(app: &AppHandle, w: &tauri::WebviewWindow) {
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    let max = w.is_maximized().unwrap_or(false);
    let mut cur = PANEL_GEOM.lock();
    if max {
        if let Some(g) = cur.as_mut() {
            g.max = true;
        } else if let (Ok(p), Ok(sz)) = (w.outer_position(), w.inner_size()) {
            *cur = Some(PanelGeom { x: p.x, y: p.y, w: sz.width, h: sz.height, max: true });
        }
    } else if let (Ok(p), Ok(sz)) = (w.outer_position(), w.inner_size()) {
        // Simge durumuna geçerken Windows (-32000, -32000) bildirir
        if sz.width < 300 || sz.height < 200 || p.x <= -30000 || p.y <= -30000 {
            return;
        }
        *cur = Some(PanelGeom { x: p.x, y: p.y, w: sz.width, h: sz.height, max: false });
    }
    drop(cur);
    save_panel_geom(app, false);
}

/// Kayıtlı konum hâlâ bir monitörün üstünde mi (monitör çıkarılmış / çözünürlük değişmiş olabilir)
fn panel_geom_visible(app: &AppHandle, g: &PanelGeom) -> bool {
    let Ok(mons) = app.available_monitors() else { return false };
    mons.iter().any(|m| {
        let (mx, my) = (m.position().x as i64, m.position().y as i64);
        let (mw, mh) = (m.size().width as i64, m.size().height as i64);
        let ix = ((g.x as i64 + g.w as i64).min(mx + mw) - (g.x as i64).max(mx)).max(0);
        // Başlık çubuğu ekranda kalmalı: üst kenar monitörün içinde olsun
        let top_in = (g.y as i64) >= my - 8 && (g.y as i64) < my + mh - 60;
        ix >= 200 && top_in
    })
}

/// Kontrol paneli kapatılınca tamamen yok edilir (RAM boşalır); tepsiden yeniden açılır.
fn open_panel(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // İlk açılış: ekranın ~%92'si kadar (en fazla 1760×1000), küçük ekranlarda en az 1200×680.
    // Sonraki açılışlarda son bırakılan konum ve boyut kullanılır.
    let (w, h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let sz = m.size().to_logical::<f64>(m.scale_factor());
            ((sz.width * 0.92).clamp(1200.0, 1760.0).min(sz.width), (sz.height * 0.85).clamp(680.0, 1000.0).min(sz.height - 40.0))
        })
        .unwrap_or((1560.0, 880.0));
    let geom = load_panel_geom(app).filter(|g| panel_geom_visible(app, g));
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title(format!("SRTR Pitwall {}", display_version()))
        // Çerçevesiz: üst çubuktan tutulup taşınır, pencere düğmeleri üst çubuğun sağında (src/window/chrome.tsx)
        .decorations(false)
        .inner_size(w, h)
        .min_inner_size(900.0, 600.0)
        .center()
        .visible(geom.is_none())
        .additional_browser_args(browser_args())
        .build()
        .map(|w| {
            if let Some(g) = geom {
                let _ = w.set_size(PhysicalSize::new(g.w, g.h));
                let _ = w.set_position(PhysicalPosition::new(g.x, g.y));
                *PANEL_GEOM.lock() = Some(g);
                if g.max {
                    let _ = w.maximize();
                }
                let _ = w.show();
                let _ = w.set_focus();
            }
            // Panel kapanınca (pencere yok edilir) ekranda tutulan yeni overlay bırakılır
            let app2 = app.clone();
            w.on_window_event(move |e| match e {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    if let Some(w) = app2.get_webview_window("main") {
                        record_panel_geom(&app2, &w);
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => save_panel_geom(&app2, true),
                tauri::WindowEvent::Destroyed => {
                    save_panel_geom(&app2, true);
                    set_preview_frozen(&app2, false);
                    set_overlay_pin(&app2, None, None);
                }
                _ => {}
            });
        });
}

fn tray_action(app: &AppHandle, id: &str) {
    match id {
        "open" => bring_panel_front(app),
        "friends" => open_friends(app),
        "events" => open_events(app),
        "edit" => {
            let on = !shared(app).edit_mode.load(Ordering::Relaxed);
            set_edit_mode(app, on);
        }
        "hide" => toggle_hidden(app),
        "quit" => quit_app(app),
        _ => {}
    }
}

const TRAY_MENU: &str = "traymenu";
/// Tepsi menüsü penceresinin mantıksal boyutu (src/window/TrayMenu.tsx ile aynı: 6 satır + ayırıcı + iç boşluk)
const TRAY_MENU_W: f64 = 250.0;
const TRAY_MENU_H: f64 = 6.0 * 34.0 + 9.0 + 12.0;

/// Tepsi sağ tık menüsü: kenarlıksız, saydam, her zaman üstte küçük pencere (gizli oluşturulur, odak kaybedince gizlenir)
fn tray_menu_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(TRAY_MENU) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, TRAY_MENU, WebviewUrl::App("window.html?view=traymenu".into()))
        .title("SRTR Pitwall")
        .inner_size(TRAY_MENU_W, TRAY_MENU_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .visible(false)
        .additional_browser_args(browser_args())
        .build()
        .map_err(|e| e.to_string())?;
    let w2 = w.clone();
    w.on_window_event(move |e| {
        if let tauri::WindowEvent::Focused(false) = e {
            let _ = w2.hide();
        }
    });
    Ok(w)
}

/// Menüyü imlecin (tepsi simgesinin) üstünde, ekranın içinde kalacak şekilde göster
fn tray_menu_show(app: &AppHandle, x: f64, y: f64) {
    let Ok(w) = tray_menu_window(app) else { return };
    let scale = w.scale_factor().unwrap_or(1.0).max(0.5);
    let (pw, ph) = (TRAY_MENU_W * scale, TRAY_MENU_H * scale);
    let (mut px, mut py) = (x - pw, y - ph);
    let mon = app.monitor_from_point(x, y).ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    if let Some(m) = mon {
        let (mx, my) = (m.position().x as f64, m.position().y as f64);
        let (mw, mh) = (m.size().width as f64, m.size().height as f64);
        if px < mx {
            px = x.min(mx + mw - pw);
        }
        if py < my {
            py = y.min(my + mh - ph);
        }
    }
    let _ = w.set_position(tauri::PhysicalPosition::new(px.round() as i32, py.round() as i32));
    let _ = app.emit_to(TRAY_MENU, "traymenu-open", ());
    let _ = w.show();
    let _ = w.set_focus();
}

/// Menü satırları: (eylem, etiket). Etiketler tepsi öğeleriyle aynıdır (çeviri ve kısayol yazısı dahil).
#[tauri::command]
fn tray_menu_items(app: AppHandle) -> Vec<(String, String)> {
    let st = app.state::<KeyBindings>();
    let items = st.tray.lock();
    let mut out: Vec<(String, String)> = Vec::new();
    for want in ["panel", "friends", "events", "edit", "hide", "quit"] {
        if let Some((a, it)) = items.iter().find(|(a, _)| a == want) {
            out.push((a.clone(), it.text().unwrap_or_default()));
        }
    }
    out
}

#[tauri::command]
async fn tray_menu_run(app: AppHandle, id: String) {
    if let Some(w) = app.get_webview_window(TRAY_MENU) {
        let _ = w.hide();
    }
    let id = if id == "panel" { "open".to_string() } else { id };
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || tray_action(&app2, &id));
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", TRAY_LABELS[2].1, true, None::<&str>)?;
    let edit = MenuItem::with_id(app, "edit", TRAY_LABELS[0].1, true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", TRAY_LABELS[1].1, true, None::<&str>)?;
    let friends = MenuItem::with_id(app, "friends", TRAY_LABELS[4].1, true, None::<&str>)?;
    let events = MenuItem::with_id(app, "events", TRAY_LABELS[5].1, true, None::<&str>)?;
    *app.state::<KeyBindings>().tray.lock() = vec![
        ("edit".into(), edit.clone()),
        ("hide".into(), hide.clone()),
        ("panel".into(), open.clone()),
        ("friends".into(), friends.clone()),
        ("events".into(), events.clone()),
    ];
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    app.state::<KeyBindings>().tray.lock().push(("quit".into(), quit.clone()));
    let menu = Menu::with_items(app, &[&open, &friends, &events, &edit, &hide, &sep, &quit])?;

    // Sağ tık menüsü: programın kendi çizdiği pencere (tasarımlı). Açılamazsa Windows'un yerel menüsü kullanılır.
    let custom = tray_menu_window(app).is_ok();
    let mut builder = TrayIconBuilder::with_id("main-tray").tooltip(format!("SRTR Pitwall {}", display_version()));
    if !custom {
        builder = builder.menu(&menu);
    }
    let mut builder = builder
        .on_menu_event(|app, event| tray_action(app, event.id.as_ref()))
        .on_tray_icon_event(move |tray, event| {
            if custom {
                if let TrayIconEvent::Click { button: MouseButton::Right, button_state: MouseButtonState::Up, position, .. } = event {
                    tray_menu_show(tray.app_handle(), position.x, position.y);
                    return;
                }
            }
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                // Sol tık her zaman programın arayüzünü (paneli) açar; okunmamış mesaj varken
                // (tepside kırmızı nokta) panelde arkadaş listesi de açılır
                bring_panel_front(tray.app_handle());
                if trayalert::unread() > 0 {
                    trayalert::request_open_friends(tray.app_handle());
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Kısayol eylemleri ve varsayılan tuşları
const SHORTCUTS: [(&str, &str); 20] = [
    ("edit", "Ctrl+Shift+E"),
    ("hide", "Ctrl+Shift+D"),
    ("panel", "Ctrl+Shift+Space"),
    ("shot", "F12"),
    ("voice", "Ctrl+Shift+S"),
    // Canlı Sohbet (MultiChatOverlay varsayılanları): anket aç/bitir, sesli okuma aç/kapat, sustur, altyazı aç/kapat
    ("poll", "F9"),
    ("tts", "F8"),
    ("ttsHush", ""),
    ("stt", "F7"),
    // Canlı sohbeti başlat / durdur (her zaman kayıtlı)
    ("chat", "Ctrl+Shift+C"),
    // Ekip (uzaktan pit) kontrolünü durdur (varsayılan: kısayol yok)
    ("crewStop", ""),
    // Direksiyon Ekranı (özel tasarım): sonraki sayfa (varsayılan: kısayol yok)
    ("dashPage", ""),
    // Yerel VR (deneysel, bkz. vrnative): sadece yerel VR çalışırken kaydedilir
    ("vrConfig", "F9"),
    ("vrRecenter", "End"),
    // … ve bunlar sadece yapılandırma modu açıkken (tek tuşlar diğer uygulamalardan çalınmasın)
    ("vrNext", "Space"),
    ("vrMode", "M"),
    ("vrSave", "F10"),
    ("vrReset", "Home"),
    ("vrFace", "F"),
    ("vrGaze", "G"),
];

/// Sadece yerel VR çalışırken kaydedilen kısayollar
const VR_ONLY: [&str; 8] = ["vrConfig", "vrRecenter", "vrNext", "vrMode", "vrSave", "vrReset", "vrFace", "vrGaze"];
/// Sadece yerel VR yapılandırma modunda kaydedilenler
const VR_CONFIG_ONLY: [&str; 6] = ["vrNext", "vrMode", "vrSave", "vrReset", "vrFace", "vrGaze"];

/// Sadece Canlı Sohbet çalışırken (ya da altyazı açıkken) kaydedilen kısayollar: F7/F8/F9 diğer uygulamalara kalsın
const LIVECHAT_ONLY: [&str; 4] = ["poll", "tts", "ttsHush", "stt"];

/// Kısayolları yeniden kaydet (canlı sohbet başlayınca / durunca)
pub(crate) fn refresh_shortcuts(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let v = current_settings(&app);
        apply_shortcuts(&app, v.as_ref());
    });
}

/// Sadece oyundayken kaydedilen kısayollar: oyun kapalıyken tuş diğer uygulamalara kalır
/// (ör. Ctrl+Shift+S "farklı kaydet"). Ekran görüntüsü ayrıca `screenshots.onlyInGame` ayarına bağlı.
const IN_GAME_ONLY: [&str; 1] = ["voice"];

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

const TRAY_LABELS: [(&str, &str); 6] = [
    ("edit", "Düzenleme Modu"),
    ("hide", "Overlay Gizle/Göster"),
    ("panel", "Kontrol Paneli"),
    ("quit", "Çıkış"),
    ("friends", "Arkadaşlar"),
    ("events", "Olaylar"),
];

#[derive(Serialize)]
struct ShortcutError {
    action: String,
    error: String,
}

fn shortcuts_from_settings(v: Option<&Value>) -> Vec<(String, String)> {
    let sc = v.and_then(|v| v.get("general")).and_then(|g| g.get("shortcuts"));
    let mut list: Vec<(String, String)> = SHORTCUTS
        .iter()
        .map(|(a, d)| {
            let mut key = sc.and_then(|s| s.get(*a)).and_then(|x| x.as_str()).unwrap_or(d).trim().to_string();
            // Eski varsayılanlar (PrintScreen, Ctrl+PrintScreen) bir kez F12'ye taşınır;
            // arayüz ayarı kaydedince `shotKeyV3` yazılır ve kullanıcının sonraki seçimi korunur.
            if *a == "shot" && (key == "PrintScreen" || key == "Ctrl+PrintScreen") && !shot_key_migrated(v) {
                key = (*d).to_string();
            }
            (a.to_string(), key)
        })
        .collect();
    // Bir kerelik geçiş (voiceKeyV1, arayüz: settings.ts voiceKeyMigrate): sesli mühendis kısayolu boşsa ya da eski
    // varsayılandaysa (Ctrl+Shift+V) Ctrl+Shift+S olur; bu tuş başka bir eylemdeyse dokunulmaz.
    if !v.and_then(|v| v.pointer("/general/voiceKeyV1")).and_then(|x| x.as_bool()).unwrap_or(false) {
        let norm = |k: &str| k.replace(' ', "").to_lowercase();
        let taken = list.iter().any(|(a, k)| a != "voice" && norm(k) == "ctrl+shift+s");
        if let Some((_, k)) = list.iter_mut().find(|(a, _)| a == "voice") {
            let cur = norm(k);
            if !taken && (cur.is_empty() || cur == "ctrl+shift+v") {
                *k = "Ctrl+Shift+S".to_string();
            }
        }
    }
    // Bir kerelik geçiş (chatKeyV2, arayüz: settings.ts chatKeyMigrate): sesli okuma F5 → F8, altyazı F6 → F7
    // (yalnızca eski varsayılanda kalmışsa ve yeni tuş başka bir eylemde değilse).
    if !v.and_then(|v| v.pointer("/general/chatKeyV2")).and_then(|x| x.as_bool()).unwrap_or(false) {
        for (act, old, new) in [("tts", "f5", "F8"), ("stt", "f6", "F7")] {
            let taken = list.iter().any(|(a, k)| a != act && k.replace(' ', "").eq_ignore_ascii_case(new));
            if let Some((_, k)) = list.iter_mut().find(|(a, _)| a == act) {
                if !taken && k.replace(' ', "").to_lowercase() == old {
                    *k = new.to_string();
                }
            }
        }
    }
    list
}

fn shot_key_migrated(v: Option<&Value>) -> bool {
    v.and_then(|v| v.pointer("/general/shotKeyV3")).and_then(|x| x.as_bool()).unwrap_or(false)
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
    // Ekran görüntüsü kısayolu (Ctrl+PrintScreen) varsayılan olarak sadece oyundayken kaydedilir;
    // oyun kapalıyken tuş Windows'un kendi işlevine kalır.
    let only_in_game = v
        .and_then(|v| v.pointer("/general/screenshots/onlyInGame"))
        .and_then(|x| x.as_bool())
        .unwrap_or(true);
    let in_game = shared(app).connected.load(Ordering::Relaxed);
    if only_in_game && !in_game {
        want.retain(|(a, _)| a != "shot");
    }
    if !in_game {
        want.retain(|(a, _)| !IN_GAME_ONLY.contains(&a.as_str()));
    }
    if !livechat::hotkeys_active(app) {
        want.retain(|(a, _)| !LIVECHAT_ONLY.contains(&a.as_str()));
    }
    if !vrnative::running() {
        want.retain(|(a, _)| !VR_ONLY.contains(&a.as_str()));
    } else {
        if !vrnative::config_mode() {
            want.retain(|(a, _)| !VR_CONFIG_ONLY.contains(&a.as_str()));
        }
        // Aynı tuş başka bir eylemdeyse (ör. F9: Canlı Sohbet anketi) yerel VR çalışırken VR önceliklidir
        want.sort_by_key(|(a, _)| !VR_ONLY.contains(&a.as_str()));
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
    let mut hook_used = false;
    for (action, sc) in parsed {
        // PrintScreen içeren ekran görüntüsü kısayolu Windows'ta klavye kancasıyla dinlenir
        // (RegisterHotKey PrintScreen'i güvenilir şekilde iletmiyor, bkz. prtsc.rs)
        if prtsc::SUPPORTED && action == "shot" && sc.key == Code::PrintScreen {
            match prtsc::enable(shortcut_mods(&sc)) {
                Ok(()) => {
                    if gs.is_registered(sc) {
                        let _ = gs.unregister(sc);
                    }
                    hook_used = true;
                    bound.push((action, sc));
                    continue;
                }
                Err(e) => eprintln!("PrintScreen kancası: {e}"),
            }
        }
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
                    Err(e) => {
                        // Ekran görüntüsü F tuşundaysa (ör. F12: Windows bunu hata ayıklayıcıya ayırabilir)
                        // klavye kancasıyla dinle
                        let vk = function_key_number(sc.key).and_then(prtsc::vk_function_key);
                        if let (true, "shot", Some(vk), false) = (prtsc::SUPPORTED, action.as_str(), vk, hook_used) {
                            if prtsc::enable_key(vk, shortcut_mods(&sc)).is_ok() {
                                hook_used = true;
                                bound.push((action, sc));
                                continue;
                            }
                        }
                        // Başka bir uygulama (ör. eski "PitWall" kurulumu) aynı kısayolu kullanıyor
                        errors.push((action, format!("Kaydedilemedi: başka bir uygulama bu kısayolu kullanıyor ({e})")))
                    }
                }
            }
        }
    }
    if !hook_used {
        prtsc::disable();
    }
    for (a, e) in &errors {
        eprintln!("kısayol {a}: {e}");
    }
    *st.bound.lock() = bound;
    *st.errors.lock() = errors;
    refresh_tray_labels(app, v);
}

/// F1–F24 tuşunun numarası
fn function_key_number(c: Code) -> Option<u32> {
    let s = format!("{c:?}");
    s.strip_prefix('F').and_then(|n| n.parse::<u32>().ok()).filter(|n| (1..=24).contains(n))
}

/// Kısayolun değiştiricileri (PrintScreen kancası için)
fn shortcut_mods(sc: &Shortcut) -> u8 {
    let mut m = 0;
    if sc.mods.contains(Modifiers::CONTROL) {
        m |= prtsc::MOD_CTRL;
    }
    if sc.mods.contains(Modifiers::SHIFT) {
        m |= prtsc::MOD_SHIFT;
    }
    if sc.mods.contains(Modifiers::ALT) {
        m |= prtsc::MOD_ALT;
    }
    if sc.mods.intersects(Modifiers::SUPER | Modifiers::META) {
        m |= prtsc::MOD_WIN;
    }
    m
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
    for (label, title) in [("pitwall", "Pitwall Paneli"), ("timing", "Live Timing"), ("engineer", "Mühendis Ekranı"), ("events", "Olaylar")] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.set_title(&format!("SRTR Pitwall – {}", tr(&app, title)));
        }
    }
}

/// Demo vitrini: panelin buluttan aldığı PRO üye adları (bkz. demo.rs)
#[tauri::command]
fn demo_set_names(names: Vec<String>) -> usize {
    demo::set_showcase_names(names)
}

/// Demo vitrini: adlarla birlikte üyenin gerçek bayrağı / iRating / lisansı (SQL c56 demo_pro_drivers)
#[tauri::command]
fn demo_set_drivers(drivers: Vec<demo::ShowcaseDriver>) -> usize {
    demo::set_showcase_drivers(drivers)
}

/// Oyuncunun kendi iRacing bilgileri (son iRacing oturum bilgisinden; yoksa null)
#[tauri::command]
fn player_iracing() -> Option<demo::PlayerIracing> {
    demo::player_iracing()
}

/// Panel kısayol kaydederken PrintScreen kancasını duraklatır (tuş arayüze ulaşsın)
#[tauri::command]
fn shortcuts_pause(paused: bool) {
    prtsc::set_paused(paused);
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
            // Ana iş parçacığında çalışır: panic programı kapatmasın (crash.log'a yazılır)
            crashlog::guard(|| {
            let action = app
                .state::<KeyBindings>()
                .bound
                .lock()
                .iter()
                .find(|(_, s)| s.id() == shortcut.id())
                .map(|(a, _)| a.clone());
            if event.state() != ShortcutState::Pressed {
                // Tuş bırakıldı: sadece anket kısayolu kullanır (basılı tutup soruyu söyle, bırakınca anket başlar)
                if event.state() == ShortcutState::Released && action.as_deref() == Some("poll") {
                    osd::arm_chat();
                    livechat::hotkey_poll_up(app);
                }
                return;
            }
            match action.as_deref() {
                Some("edit") => {
                    let on = !shared(app).edit_mode.load(Ordering::Relaxed);
                    set_edit_mode(app, on);
                    osd::show(app, "edit", Some(shared(app).edit_mode.load(Ordering::Relaxed)));
                }
                Some("hide") => {
                    toggle_hidden(app);
                    osd::show(app, "hide", Some(!shared(app).user_hidden.load(Ordering::Relaxed)));
                }
                Some("panel") => {
                    bring_panel_front(app);
                    osd::show(app, "panel", None);
                }
                Some("shot") => {
                    // Bildirim görüntü alındıktan sonra gösterilir (osd.rs: screenshot-taken / screenshot-error)
                    osd::arm_shot();
                    shots::take(app, false)
                }
                Some("voice") => {
                    osd::claim(app);
                    toggle_voice(app);
                    if voice_allowed(app) {
                        let on = with_settings(app, |v| v.and_then(|v| v.pointer("/general/voice/enabled").and_then(|x| x.as_bool()))).unwrap_or(true);
                        osd::show(app, "voice", Some(on));
                    } else {
                        osd::show(app, "voiceLocked", None);
                    }
                }
                // Canlı Sohbet kısayolları sonucu "livechat-notice" ile bildirir; osd.rs onu gösterir
                Some(a @ ("poll" | "tts" | "ttsHush" | "stt" | "chat")) => {
                    osd::arm_chat();
                    match a {
                        "poll" => livechat::hotkey_poll(app),
                        "tts" => livechat::tts::hotkey_toggle(app),
                        "ttsHush" => livechat::tts::hotkey_hush(app),
                        "stt" => livechat::stt::hotkey_toggle(app),
                        _ => livechat::hotkey_chat(app),
                    }
                }
                Some("crewStop") => {
                    // Sonuç overlay sayfasında belli olur (src/host/crew.ts `osd_push` ile bildirir)
                    let _ = app.emit("crew-stop", ());
                }
                Some("dashPage") => {
                    let _ = app.emit("dash-page", ());
                    osd::show(app, "dashPage", None);
                }
                Some(a) if a.starts_with("vr") => {
                    vrnative::hotkey(a);
                    osd::show_vr(app, a);
                }
                _ => {}
            }
            });
        })
        .build();
    let hook_app = app.clone();
    prtsc::set_action(Box::new(move || {
        osd::arm_shot();
        shots::take(&hook_app, false)
    }));
    if app.plugin(plugin).is_ok() {
        apply_shortcuts(app, saved);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Çökme günlüğü (crash.log) ve panic kancası: her şeyden önce
    crashlog::install();
    let shared_state = Arc::new(Shared::default());

    tauri::Builder::default()
        // Tek örnek: ikinci kez açılmaya çalışılırsa yeni kopya kapanır, mevcut olanın paneli öne gelir.
        // (Eklentiler arasında ilk sırada olmalı.)
        // Geri çağrı ana iş parçacığında, başka sürecin GÖNDERDİĞİ ileti (WM_COPYDATA) işlenirken gelir; o bağlamda
        // panel penceresi (WebView2) oluşturmak başarısız olabilir / kilitlenebilir. İş ayrı iş parçacığına devredilir.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let app = app.clone();
            std::thread::spawn(move || {
                crashlog::guard(|| bring_panel_front(&app));
            });
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![TRAY_ARG]),
        ))
        .manage(shared_state.clone())
        .manage(PendingFocus::default())
        .manage(PinProfile::default())
        .manage(updater::UpdateState::default())
        .manage(ServerState::default())
        .manage(SettingsStore::default())
        .manage(mqtt::MqttState::default())
        .manage(KeyBindings::default())
        .manage(shots::ShotState::default())
        .manage(entitlement::EntitlementState::default())
        .invoke_handler(guard_invoke(tauri::generate_handler![
            settings_get,
            settings_set,
            sync_flushed,
            stream_start,
            stream_topics,
            stream_stop,
            map_forget,
            camera_car,
            replay_to,
            replay_live,
            crew_pit_command,
            events_get,
            events_export,
            replay_seek,
            window_open,
            crew_window_open,
            toast::toast_show,
            toast::toast_take,
            toast::toast_layout,
            toast::toast_open_chat,
            toast::friends_take_chat,
            osd::osd_push,
            osd::osd_claimed,
            osd::osd_take,
            osd::osd_visible,
            trayalert::tray_unread,
            trayalert::tray_take_open,
            trayalert::social_log,
            trayalert::message_beep,
            trayalert::social_tick_start,
            server_apply,
            server_status,
            dash_export,
            server_lan_urls,
            state_get,
            demo_set,
            edit_mode_set,
            overlay_peek,
            overlay_pin,
            overlay_pin_get,
            overlay_pin_profile_get,
            team_remote_set,
            hidden_set,
            monitors_list,
            overlay_set_monitor,
            glucose::glucose_login,
            glucose::glucose_logout,
            glucose::glucose_state,
            glucose::glucose_refresh,
            glucose::glucose_alert,
            heartrate::heartrate_connect,
            heartrate::heartrate_disconnect,
            heartrate::heartrate_state,
            heartrate::heartrate_alert,
            preview_set,
            preview_freeze,
            panel_front,
            chat_window_notify,
            chat_tabs_take,
            window_toggle,
            idle_seconds,
            tray_menu_items,
            tray_menu_run,
            panel_focus_overlay,
            panel_take_focus,
            app_version,
            autostart_get,
            autostart_set,
            logos_list,
            logos_open_dir,
            open_url,
            checkout_open,
            voice_info,
            voice_test,
            vr::vr_fit,
            vrnative::vr_native_status,
            vrnative::vr_native_start,
            vrnative::vr_native_stop,
            vrnative::vr_native_cmd,
            voicepack::voice_packs_installed,
            voicepack::voice_catalog,
            voicepack::voice_packs_open_dir,
            voicepack_dl::voice_pack_install,
            voicepack_dl::voice_pack_cancel,
            voicepack_dl::voice_pack_remove,
            voicepack_dl::voice_pack_probe,
            backup::backup_run,
            backup::restore_run,
            backup::backup_inspect,
            backup::backup_cancel,
            backup::backup_token,
            backup::backup_busy,
            backup::backup_reveal,
            voicepack_build::voice_pack_build,
            voicepack_build::voice_pack_template,
            voicepack_build::voice_pack_check,
            voice_test_dir,
            voicecmd::voicecmd_status,
            voicecmd::voicecmd_examples,
            voicecmd::voicecmd_capture_button,
            voicecmd::voicecmd_capture_cancel,
            voicecmd::voicecmd_test_text,
            voicecmd::voicecmd_listen,
            voicecmd::voicecmd_microphones,
            sound_test,
            overlay_beep,
            mqtt_status,
            translate::translate_text,
            shortcuts_status,
            shortcuts_pause,
            sessions_info,
            sessions_open_dir,
            sessions_prune,
            session_summary,
            telemetry_pending,
            telemetry_ack,
            telemetry_queue_clear,
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
            shots::chat_bg_import,
            shots::chat_bg_read,
            shots::chat_bg_clear,
            shots::bg_file_import,
            shots::bg_file_read,
            shots::bg_file_clear,
            demo_set_names,
            demo_set_drivers,
            player_iracing,
            entitlement::entitlement_get,
            entitlement::entitlement_set,
            device::device_info,
            wheeldev::wheel_detect,
            updater::update_check,
            updater::update_install,
            livechat::livechat_start,
            livechat::livechat_stop,
            livechat::livechat_restart,
            livechat::livechat_status,
            livechat::livechat_parse_links,
            livechat::livechat_channels_set,
            livechat::livechat_history,
            livechat::livechat_state,
            livechat::livechat_poll_start,
            livechat::livechat_poll_stop,
            livechat::livechat_poll_reset,
            livechat::livechat_poll_get,
            livechat::livechat_ban_user,
            livechat::livechat_unban_user,
            livechat::livechat_hide_message,
            livechat::livechat_clear,
            livechat::livechat_log_set,
            livechat::livechat_log_open_dir,
            livechat::chatlog::livechat_log_days,
            livechat::chatlog::livechat_log_read,
            livechat::chatlog::livechat_log_search,
            livechat::chatlog::livechat_log_delete,
            livechat::chatlog::livechat_log_export,
            livechat::tts::social_tts_speak,
            livechat::tts::tts_speak,
            livechat::livechat_streamlabs_reconnect,
            livechat::livechat_streamlabs_test,
            livechat::stt::livechat_stt_key_set,
            livechat::stt::livechat_audio_devices,
            livechat::livechat_streamlabs_token_set,
            livechat::livechat_streamlabs_status,
            livechat::livechat_caption_push,
            livechat::livechat_caption_clear,
            livechat::tts::livechat_tts_voices,
            livechat::tts::livechat_audio_outputs,
            livechat::tts::livechat_tts_status,
            livechat::tts::livechat_tts_test,
            livechat::tts::livechat_tts_skip,
            livechat::tts::livechat_tts_clear,
            livechat::stt::livechat_stt_languages,
            livechat::stt::livechat_stt_status,
            livechat::stt::livechat_stt_restart,
            livechat::send::livechat_send_status,
            livechat::send::livechat_auth_test,
            livechat::send::livechat_twitch_login,
            livechat::send::livechat_oauth_login,
            livechat::send::livechat_auth_cancel,
            livechat::send::livechat_auth_logout,
            livechat::send::livechat_send,
            livechat::send::livechat_auth_reopen,
            livechat::send::livechat_api_creds_set,
            livechat::webchat::livechat_web_open,
            livechat::webchat::livechat_web_hide,
            livechat::webchat::livechat_web_logout,
            livechat::inputbox::livechat_input,
        ]))
        .setup(move |app| {
            let handle = app.handle().clone();
            // Varsayılan: Windows açılışında başlat (sistem tepsisinde). Bir kez uygulanır; kullanıcı Ayarlar › Genel'den
            // kapatırsa kapalı kalır. Geliştirme derlemesinde dokunulmaz.
            if !cfg!(debug_assertions) {
                if let Ok(dir) = handle.path().app_config_dir() {
                    let mark = dir.join("autostart-default");
                    if !mark.exists() {
                        use tauri_plugin_autostart::ManagerExt;
                        let _ = std::fs::create_dir_all(&dir);
                        if handle.autolaunch().enable().is_ok() {
                            let _ = std::fs::write(&mark, b"1");
                        }
                    }
                }
            }
            if let Ok(dir) = handle.path().app_data_dir() {
                crashlog::set_dir(dir);
            }

            // Kayıtlı genel ayarları uygula (panel açılmadan önce).
            let had_settings = settings_path(&handle).map(|p| p.exists()).unwrap_or(false);
            let saved = read_settings(&handle);
            autostart_first_run(&handle, had_settings);
            *app.state::<SettingsStore>().current.lock() = saved.clone();
            spawn_settings_writer(handle.clone());
            let general = saved.as_ref().and_then(|v| v.get("general"));
            let demo = general.and_then(|g| g.get("demo")).and_then(|v| v.as_bool()).unwrap_or(false);
            let monitor = general.and_then(|g| g.get("monitor")).and_then(|v| v.as_u64()).map(|v| v as usize);
            let srv = general.and_then(|g| g.get("server"));
            // Web sunucusu varsayılan olarak açık: yeni kurulumda ve bir kereliğine (general.serverOnV1 işareti yokken)
            // eski kurulumlarda da başlatılır; kullanıcı sonradan kapatırsa (işaret kaydedilmiştir) kapalı kalır.
            let srv_migrated = general.and_then(|g| g.get("serverOnV1")).and_then(|v| v.as_bool()).unwrap_or(false);
            let srv_on = !srv_migrated || srv.and_then(|v| v.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(true);
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
            // Güncelleme kurulurken panel açıktıysa (işaret dosyası) --tray ile yeniden başlasa bile panel açılır.
            let from_autostart = std::env::args().any(|a| a == TRAY_ARG);
            let reopen = updater::take_reopen_panel(&handle);
            if !from_autostart || reopen {
                open_panel(&handle);
            }

            setup_tray(&handle)?;
            setup_shortcuts(&handle, saved.as_ref());
            osd::init(&handle);
            voicesub::init(shared_state.clone());
            engine::spawn(handle.clone(), shared_state.clone());
            // Canlı sohbet merkezi (ayarlar aşağıda apply_dynamic ile uygulanır; autoStart açıksa bağlanır)
            livechat::init(&handle, shared_state.clone());
            glucose::start(&handle);
            heartrate::start(&handle);
            if srv_on {
                apply_server(&handle, true, srv_port, srv_lan);
            }
            // Canlı taşıma: pencereler arası "overlay-live-drag" olayı OBS sayfasına da (SSE) iletilir, ~30/sn
            {
                use tauri::Listener;
                let drag_shared = shared_state.clone();
                let last = Mutex::new(std::time::Instant::now());
                handle.listen("overlay-live-drag", move |ev| {
                    let Ok(v) = serde_json::from_str::<Value>(ev.payload()) else { return };
                    let end = v.get("end").and_then(|e| e.as_bool()).unwrap_or(false);
                    if !end {
                        let mut t = last.lock();
                        if t.elapsed() < std::time::Duration::from_millis(30) {
                            return;
                        }
                        *t = std::time::Instant::now();
                    }
                    drag_shared.broadcast_drag(v);
                });
            }
            if let Some(v) = saved.as_ref() {
                apply_dynamic(&handle, v);
            }
            sync_overlay_visibility(&handle);
            spawn_monitor_watch(handle.clone());
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
