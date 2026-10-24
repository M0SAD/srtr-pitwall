//! Müzik overlay'i: şu an çalan şarkı (Spotify, tarayıcıda YouTube Music / YouTube, Apple Music, Deezer…) ve
//! önceki / sonraki / durdur denetimi. Kaynak Windows'un medya oturumlarıdır (bkz. music_win.rs); hesap bağlama yok.
//!
//! * Okuma yalnızca overlay ekrandayken yapılır: overlay `music_state` ile "bakıyorum" der; 15 sn haber gelmezse
//!   okuma durur. Ekrandayken saniyede bir bakılır; değişiklik olunca "music" olayı yayınlanır (konum overlay'de
//!   ilerletilir, her saniye olay gönderilmez).
//! * Kapak resmi parça değişince bir kez okunur; panel / overlay pencerelerine data: adresi olarak, OBS'e
//!   /api/music-art üzerinden gider.
//! * Denetim (önceki / sonraki / durdur-oynat) overlay düğmelerinden, panelden ve atanan klavye tuşu ya da
//!   direksiyon düğmesinden (voicecmd.rs giriş döngüsü, `general.musicToggle` / `musicNext` / `musicPrev`) gelir.

#![cfg_attr(not(windows), allow(dead_code))]

use parking_lot::Mutex;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use tauri::{AppHandle, Emitter};

/// Overlay bu kadar süre "bakıyorum" demezse okuma durur
const WANT_MS: i64 = 15_000;

#[derive(Clone, Serialize, Default, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct State {
    /// Bu bilgisayarda okunabiliyor mu (Windows); değilse overlay açıklama gösterir
    pub supported: bool,
    /// Gösterilecek bir oturum var mı
    pub active: bool,
    /// Oynatıcı: "spotify" | "browser" | "app"
    pub kind: String,
    /// Okunur ad: "Spotify", "Chrome", "Edge", "YouTube Music"…
    pub source: String,
    pub app_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    /// Konum (ms), konumun geçerli olduğu an (epoch ms) ve süre (ms; 0: bilinmiyor)
    pub pos_ms: i64,
    pub at: i64,
    pub dur_ms: i64,
    pub can_prev: bool,
    pub can_next: bool,
    pub can_toggle: bool,
    /// Kapak resmi (data: adresi; OBS'e giden durumda boş, yerine `art_url`)
    pub art: String,
    pub art_url: String,
    /// Parça anahtarı (kapak resmi önbelleği ve geçiş animasyonu için)
    pub key: String,
    /// Açık medya oturumları: (uygulama kimliği, okunur ad, çalıyor mu); kaynak seçimi için
    pub sessions: Vec<(String, String, bool)>,
    pub error: String,
    /// Oynatıcının ses düzeyi (%, Windows ses karıştırıcısındaki uygulama sesi); -1: bilinmiyor
    pub volume: i32,
    pub muted: bool,
}

static STATE: Mutex<Option<State>> = parking_lot::const_mutex(None);
/// Ham kapak resmi (OBS için): (anahtar, bayt, MIME)
static ART: Mutex<Option<(String, Vec<u8>, String)>> = parking_lot::const_mutex(None);
static WANT: AtomicI64 = AtomicI64::new(0);
static STARTED: AtomicBool = AtomicBool::new(false);
/// Kaynak tercihi: "auto" | "spotify" | "browser" | uygulama kimliği
static PREF: Mutex<String> = parking_lot::const_mutex(String::new());
static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Uygulama kimliğinden okunur ad ve tür
pub fn describe(app_id: &str) -> (&'static str, String) {
    let a = app_id.to_ascii_lowercase();
    let browser = |n: &str| ("browser", n.to_string());
    if a.contains("spotify") {
        return ("spotify", "Spotify".into());
    }
    if a.contains("youtube-music") || a.contains("youtubemusic") || a.contains("ytmdesktop") {
        return ("app", "YouTube Music".into());
    }
    if a.contains("msedge") {
        return browser("Edge");
    }
    if a.contains("chrome") {
        return browser("Chrome");
    }
    // Firefox'un Windows uygulama kimliği bir özet değeridir
    if a.contains("firefox") || a == "308046b0af4a39cb" || a == "6f193ccc56814779" {
        return browser("Firefox");
    }
    if a.contains("opera") {
        return browser("Opera");
    }
    if a.contains("brave") {
        return browser("Brave");
    }
    if a.contains("vivaldi") {
        return browser("Vivaldi");
    }
    if a.contains("applemusic") || a.contains("apple music") || a.contains("itunes") {
        return ("app", "Apple Music".into());
    }
    let known = [
        ("deezer", "Deezer"),
        ("tidal", "TIDAL"),
        ("amazon", "Amazon Music"),
        ("musicbee", "MusicBee"),
        ("foobar", "foobar2000"),
        ("aimp", "AIMP"),
        ("winamp", "Winamp"),
        ("vlc", "VLC"),
        ("zunemusic", "Medya Yürütücüsü"),
        ("microsoft.media.player", "Medya Yürütücüsü"),
    ];
    for (k, n) in known {
        if a.contains(k) {
            return ("app", n.to_string());
        }
    }
    // "Uygulama.exe" ya da "Şirket.Uygulama_xxx!App" → "Uygulama"
    let base = app_id
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(app_id)
        .split('!')
        .next()
        .unwrap_or(app_id);
    let base = base.split('_').next().unwrap_or(base);
    let base = base.trim_end_matches(".exe").trim_end_matches(".EXE");
    let base = base.rsplit('.').next().unwrap_or(base);
    ("app", if base.is_empty() { "?".into() } else { base.to_string() })
}

/// Tarayıcıdaki YouTube Music / YouTube: tarayıcı başlığa " - YouTube Music" ekleyebilir; temizlenir
pub fn clean_title(title: &str) -> String {
    let t = title.trim();
    for suf in [" - YouTube Music", " - YouTube", " | YouTube Music"] {
        if let Some(x) = t.strip_suffix(suf) {
            return x.trim().to_string();
        }
    }
    t.to_string()
}

fn snapshot() -> State {
    STATE.lock().clone().unwrap_or(State {
        supported: cfg!(windows),
        ..State::default()
    })
}

fn publish(app: &AppHandle, st: State) {
    let changed = STATE.lock().as_ref() != Some(&st);
    if changed {
        *STATE.lock() = Some(st.clone());
        let _ = app.emit("music", st);
    }
}

/// Son durum. Overlay bunu birkaç saniyede bir çağırır: "ekrandayım, okumaya devam et" anlamına da gelir.
/// `pref`: kaynak tercihi (overlay ayarı).
#[tauri::command]
pub fn music_state(watch: Option<bool>, pref: Option<String>) -> State {
    if let Some(p) = pref {
        *PREF.lock() = p;
    }
    if watch != Some(false) {
        WANT.store(now_ms(), Ordering::Relaxed);
    }
    snapshot()
}

/// OBS / tarayıcı kaynağı için son durum (kapak resmi ayrı adresten)
pub fn http_state() -> String {
    WANT.store(now_ms(), Ordering::Relaxed);
    let mut s = snapshot();
    if !s.art.is_empty() {
        s.art.clear();
        s.art_url = format!("/api/music-art?k={}", urlenc(&s.key));
    }
    serde_json::to_string(&s).unwrap_or_else(|_| "{}".into())
}

/// OBS için kapak resmi: (bayt, MIME)
pub fn http_art() -> Option<(Vec<u8>, String)> {
    ART.lock().as_ref().map(|(_, b, m)| (b.clone(), m.clone()))
}

fn urlenc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Denetim: "toggle" | "play" | "pause" | "next" | "prev" | "volup" | "voldown" | "vol:<0-100>" | "mute"
#[tauri::command]
pub fn music_control(action: String) -> Result<bool, String> {
    control(&action)
}

/// Kısayol / direksiyon düğmesi (voicecmd.rs): "musicToggle" | "musicNext" | "musicPrev" | "musicVolUp" |
/// "musicVolDown" | "musicMute"
pub fn hotkey(name: &str) {
    let action = match name {
        "musicNext" => "next",
        "musicPrev" => "prev",
        "musicVolUp" => "volup",
        "musicVolDown" => "voldown",
        "musicMute" => "mute",
        _ => "toggle",
    };
    let r = control(action);
    let Some(app) = APP.get() else { return };
    if action.starts_with("vol") || action == "mute" {
        // Yeni ses düzeyi ekranda (bulunamadıysa uyarı)
        let s = snapshot();
        let v = if r.is_ok() && s.volume >= 0 { if s.muted { 0 } else { s.volume } } else { -1 };
        crate::osd::push(app, serde_json::json!({ "key": "musicVol", "value": v, "on": s.muted }));
    } else {
        crate::osd::show(app, name, None);
    }
}

#[cfg(windows)]
fn control(action: &str) -> Result<bool, String> {
    imp::control(action)
}

#[cfg(not(windows))]
fn control(_action: &str) -> Result<bool, String> {
    Err("unsupported".into())
}

pub fn start(app: &AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = APP.set(app.clone());
    #[cfg(windows)]
    imp::start(app.clone());
}

#[cfg(windows)]
mod imp {
    use super::*;
    use crate::music_win::Media;
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::sync::OnceLock;
    use std::time::Duration;

    type Req = (String, Sender<Result<bool, String>>);
    static TX: OnceLock<Mutex<Sender<Req>>> = OnceLock::new();

    pub fn control(action: &str) -> Result<bool, String> {
        let tx = TX.get().ok_or("not_started")?.lock().clone();
        let (rtx, rrx) = channel();
        tx.send((action.to_string(), rtx)).map_err(|e| e.to_string())?;
        // Overlay ekranda değilken de denetim çalışsın: okuma döngüsü uyanır
        WANT.store(now_ms(), Ordering::Relaxed);
        rrx.recv_timeout(Duration::from_secs(4)).map_err(|_| "timeout".to_string())?
    }

    pub fn start(app: AppHandle) {
        let (tx, rx) = channel::<Req>();
        let _ = TX.set(Mutex::new(tx));
        let _ = std::thread::Builder::new().name("music".into()).spawn(move || {
            crate::crashlog::supervise("music", || run(&app, &rx));
        });
    }

    fn run(app: &AppHandle, rx: &Receiver<Req>) {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let mut media: Option<Media> = None;
        let mut last_key = String::new();
        let mut art_tries = 0u32;
        let mut art_url = String::new();
        let mut last_err_at = 0i64;
        loop {
            // Denetim isteği gelirse hemen; yoksa ekrandayken 1 sn, değilken 2 sn'de bir uyan
            let wanted = now_ms() - WANT.load(Ordering::Relaxed) < WANT_MS;
            let wait = if wanted { 1000 } else { 2000 };
            let req = rx.recv_timeout(Duration::from_millis(wait)).ok();
            if media.is_none() && (wanted || req.is_some()) && now_ms() - last_err_at > 10_000 {
                crate::crashlog::crumb("music:gsmtc-open");
                match Media::new() {
                    Ok(m) => media = Some(m),
                    Err(e) => {
                        last_err_at = now_ms();
                        publish(app, State { supported: true, error: e, ..State::default() });
                    }
                }
            }
            let pref = PREF.lock().clone();
            if let Some((action, reply)) = req {
                crate::crashlog::crumb("music:control");
                let r = media.as_ref().map(|m| m.control(&pref, &action)).unwrap_or(Err("no_media".into()));
                // Ses düzeyi değiştiyse yeni değer hemen durumda (kısayol bildirimi bunu gösterir)
                if r.is_ok() && (action.starts_with("vol") || action == "mute") {
                    if let Some(app_id) = media.as_ref().and_then(|m| m.current_app(&pref)) {
                        let (v, mu) = crate::music_win::volume_of(&app_id).unwrap_or((-1, false));
                        let cur = STATE.lock().clone().unwrap_or(State { supported: true, ..State::default() });
                        publish(app, State { volume: v, muted: mu, ..cur });
                    }
                }
                let _ = reply.send(r);
                // Oynatıcının yeni durumu bir an sonra gelir
                std::thread::sleep(Duration::from_millis(250));
            }
            if !wanted {
                continue;
            }
            let Some(m) = media.as_ref() else { continue };
            let sessions: Vec<(String, String, bool)> = m
                .sessions()
                .into_iter()
                .map(|(id, playing)| {
                    let (_, name) = describe(&id);
                    (id, name, playing)
                })
                .collect();
            // Parça anahtarı belli olmadan kapak resmi istenmez: önce anahtar, değiştiyse resim
            crate::crashlog::crumb("music:gsmtc-read");
            let snap = match m.snapshot(&pref, false) {
                Ok(s) => s,
                Err(e) => {
                    publish(app, State { supported: true, error: e, sessions, ..State::default() });
                    continue;
                }
            };
            let Some((s, _)) = snap else {
                last_key.clear();
                *ART.lock() = None;
                publish(app, State { supported: true, sessions, ..State::default() });
                continue;
            };
            let key = format!("{}\u{1}{}\u{1}{}\u{1}{}", s.app_id, s.title, s.artist, s.album);
            if key != last_key {
                last_key = key.clone();
                art_tries = 0;
                art_url.clear();
                *ART.lock() = None;
            }
            // Kapak resmi: parça değişince; oynatıcı resmi geç verebilir, 5 kez daha denenir
            if art_url.is_empty() && art_tries < 6 {
                art_tries += 1;
                crate::crashlog::crumb("music:art");
                if let Ok(Some((_, Some((bytes, mime))))) = m.snapshot(&pref, true) {
                    art_url = format!("data:{mime};base64,{}", b64(&bytes));
                    *ART.lock() = Some((key.clone(), bytes, mime));
                }
            }
            let now = now_ms();
            // Konum: oynatıcının son bildirdiği konum + o andan beri geçen süre (çalıyorsa)
            let mut pos = s.pos_ms;
            if s.playing && s.pos_at > 0 && now > s.pos_at {
                pos += now - s.pos_at;
            }
            if s.dur_ms > 0 {
                pos = pos.min(s.dur_ms);
            }
            let (kind, source) = describe(&s.app_id);
            crate::crashlog::crumb("music:volume");
            let (volume, muted) = crate::music_win::volume_of(&s.app_id).unwrap_or((-1, false));
            let st = State {
                supported: true,
                active: true,
                kind: kind.to_string(),
                source,
                app_id: s.app_id.clone(),
                title: clean_title(&s.title),
                artist: s.artist.clone(),
                album: s.album.clone(),
                playing: s.playing,
                pos_ms: pos,
                at: now,
                dur_ms: s.dur_ms,
                can_prev: s.can_prev,
                can_next: s.can_next,
                can_toggle: s.can_toggle,
                art: art_url.clone(),
                art_url: String::new(),
                key: key.clone(),
                sessions,
                error: String::new(),
                volume,
                muted,
            };
            // Konum her saniye ilerler: yalnızca beklenenden 1,5 sn'den fazla saptıysa ya da başka bir şey
            // değiştiyse yayınla (overlay konumu kendisi ilerletir)
            let prev = STATE.lock().clone();
            if let Some(p) = prev {
                let expect = if p.playing { p.pos_ms + (now - p.at) } else { p.pos_ms };
                let same_rest = State { pos_ms: 0, at: 0, ..p.clone() } == State { pos_ms: 0, at: 0, ..st.clone() };
                if same_rest && (expect - st.pos_ms).abs() < 1500 {
                    continue;
                }
            }
            publish(app, st);
        }
    }

    fn b64(b: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(describe("Spotify.exe"), ("spotify", "Spotify".into()));
        assert_eq!(describe("Chrome"), ("browser", "Chrome".into()));
        assert_eq!(describe("MSEdge"), ("browser", "Edge".into()));
        assert_eq!(describe("308046B0AF4A39CB"), ("browser", "Firefox".into()));
        assert_eq!(describe("SomeHash1234"), ("app", "SomeHash1234".into()));
        assert_eq!(describe("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App").1, "Apple Music");
        assert_eq!(describe("C:\\Programs\\Foo\\MyPlayer.exe").1, "MyPlayer");
        assert_eq!(describe("com.github.th-ch.youtube-music").1, "YouTube Music");
        assert_eq!(clean_title("Song - YouTube Music"), "Song");
        assert_eq!(clean_title(" Song "), "Song");
    }

    #[test]
    fn enc() {
        assert_eq!(urlenc("a b\u{1}ç"), "a%20b%01%C3%A7");
    }
}
