//! Sohbeti sesli okuma (TTS, PRO: `livechat.tts`). MultiChatOverlay'in okuma kuralları:
//!
//!   - Mod: hepsi | sadece komutla (`!oku merhaba` → "merhaba") | sadece bağış/abone/uyarılar
//!   - Sadece aboneler / kanal üyeleri, sadece listedeki kullanıcılar, platform seçimi
//!   - Metin temizliği: emote ve bağlantılar okunmaz, yıldızlanan kelimeler atlanır, "aaaaaa" → "aaa",
//!     emoji/süs karakterleri atılır, en fazla `maxChars` karakter (kelime sınırında)
//!   - "Ali diyor ki: …" (isim okunabilir yapılır: alt çizgi → boşluk, sondaki 3+ rakam atılır)
//!   - Kuyruk: en fazla `maxQueue` mesaj (dolunca en eskisi atılır), `maxDelay` saniyeden eski mesaj okunmaz,
//!     silinen (moderasyon) mesaj okunmaz
//!
//! Motor: Windows'un kendi sesleri (WinRT SpeechSynthesizer, bkz. tts_win.rs) → WAV → rodio ile seçilen çıkış
//! cihazında çalınır. Sesli mühendisin ses çıkışından ayrı bir iş parçacığı / akış kullanır (spotter'ı bekletmez).
//! Windows dışında motor yoktur (komutlar anlaşılır hata döner).
//!
//! Aynı kuyruk "Mesajlar" overlay'indeki arkadaş / takım / grup mesajlarını da okur (PRO: `social.messages_tts`,
//! komut `social_tts_speak`): tek iş parçacığı sırayla çaldığı için sohbet okumasıyla üst üste binmez. Bu mesajlar
//! sohbet okuması kapalıyken de okunur (ses / cihaz / hız ayarları ortaktır) ve sesli mühendis konuşurken bekler.
//!
//! Olay: "livechat-tts" TtsStatus

// Windows dışında motor yok: motorla ilgili parçalar sadece Windows'ta kullanılır
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use super::filter::{has_link, norm_user};
use super::model::{ChatMsg, Kind, Part, Platform};
use super::{allowed, Hub};
use parking_lot::{Condvar, Mutex};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub const FEATURE: &str = "livechat.tts";
/// "Mesajlar" overlay'indeki mesajları sesli okuma
pub const SOCIAL_FEATURE: &str = "social.messages_tts";
/// Sosyal mesaj bu kadar saniyeden fazla sırada beklediyse okunmaz
const SOCIAL_MAX_DELAY: f64 = 45.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Mode {
    #[default]
    All,
    Command,
    Alerts,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TtsCfg {
    pub enabled: bool,
    pub mode: Mode,
    /// Virgülle ayrılmış komutlar (ör. "!oku, !s")
    pub command: String,
    pub subs_only: bool,
    pub only_users: HashSet<String>,
    pub read_names: bool,
    /// Bağış / abone / raid gibi uyarılar her modda okunsun
    pub read_alerts: bool,
    pub youtube: bool,
    pub twitch: bool,
    pub kick: bool,
    pub skip_links: bool,
    pub skip_emotes: bool,
    pub max_chars: usize,
    pub max_queue: usize,
    pub max_delay: f64,
    pub voice: String,
    pub device: String,
    /// -10..10
    pub rate: f64,
    /// -10..10
    pub pitch: f64,
    /// 0..100
    pub volume: f64,
}

impl Default for TtsCfg {
    fn default() -> TtsCfg {
        TtsCfg {
            enabled: false,
            mode: Mode::All,
            command: "!oku".into(),
            subs_only: false,
            only_users: HashSet::new(),
            read_names: true,
            read_alerts: true,
            youtube: true,
            twitch: true,
            kick: true,
            skip_links: true,
            skip_emotes: true,
            max_chars: 150,
            max_queue: 3,
            max_delay: 8.0,
            voice: String::new(),
            device: String::new(),
            rate: 0.0,
            pitch: 0.0,
            volume: 80.0,
        }
    }
}

pub fn cfg_from_settings(v: &Value) -> TtsCfg {
    let d = TtsCfg::default();
    let Some(t) = v.pointer("/general/livechat/tts") else { return d };
    let b = |p: &str, def: bool| t.pointer(p).and_then(|x| x.as_bool()).unwrap_or(def);
    let f = |p: &str, def: f64| t.pointer(p).and_then(|x| x.as_f64()).unwrap_or(def);
    let s = |p: &str, def: &str| t.pointer(p).and_then(|x| x.as_str()).unwrap_or(def).to_string();
    TtsCfg {
        enabled: b("/enabled", false),
        mode: match s("/mode", "all").as_str() {
            "command" => Mode::Command,
            "alerts" => Mode::Alerts,
            _ => Mode::All,
        },
        command: s("/command", "!oku"),
        subs_only: b("/subsOnly", false),
        only_users: s("/onlyUsers", "").split([',', '\n', ' ']).map(norm_user).filter(|x| !x.is_empty()).collect(),
        read_names: b("/readNames", true),
        read_alerts: b("/readAlerts", true),
        youtube: b("/platforms/youtube", true),
        twitch: b("/platforms/twitch", true),
        kick: b("/platforms/kick", true),
        skip_links: b("/skipLinks", true),
        skip_emotes: b("/skipEmotes", true),
        max_chars: f("/maxChars", 150.0).clamp(20.0, 500.0) as usize,
        max_queue: f("/maxQueue", 3.0).clamp(1.0, 50.0) as usize,
        max_delay: f("/maxDelay", 8.0).clamp(2.0, 120.0),
        voice: s("/voice", ""),
        device: s("/device", ""),
        rate: f("/rate", 0.0).clamp(-10.0, 10.0),
        pitch: f("/pitch", 0.0).clamp(-10.0, 10.0),
        volume: f("/volume", 80.0).clamp(0.0, 100.0),
    }
}

/// -10..10 → Windows konuşma hızı (0,5..3)
pub fn win_rate(r: f64) -> f64 {
    if r >= 0.0 {
        1.0 + r * 0.2
    } else {
        1.0 + r * 0.05
    }
}

/// -10..10 → Windows ses perdesi (0,2..1,8)
pub fn win_pitch(p: f64) -> f64 {
    1.0 + p * 0.08
}

// ---------------------------------------------------------------------------
// Metin kuralları
// ---------------------------------------------------------------------------

/// Okunacak düz metin (MCO speech_text): emote/bağlantı/yıldızlı kelimeler atlanır, tekrarlar kısalır,
/// emoji ve süs karakterleri atılır, uzunluk kelime sınırında kesilir.
pub fn speech_text(parts: &[Part], max_chars: usize, skip_links: bool, skip_emotes: bool) -> String {
    let mut s = String::new();
    for p in parts {
        match p {
            Part::Text { v } => s.push_str(v),
            Part::Emote { name, .. } => {
                if !skip_emotes {
                    s.push(' ');
                    s.push_str(name);
                }
                s.push(' ');
            }
            Part::Link { v, .. } => {
                if !skip_links {
                    s.push_str(v);
                }
                s.push(' ');
            }
            Part::Mention { v } => {
                s.push(' ');
                s.push_str(v);
                s.push(' ');
            }
        }
    }
    clean_text(&s, max_chars, skip_links)
}

/// Düz metin temizliği (bkz. speech_text)
pub fn clean_text(s: &str, max_chars: usize, skip_links: bool) -> String {
    // Kelime bazlı: bağlantılar ve yıldızlanmış (** içeren) kelimeler atılır
    let words: Vec<&str> = s.split_whitespace().filter(|w| !(skip_links && has_link(w)) && !w.contains("**")).collect();
    let joined = words.join(" ");
    // "aaaaaa" → "aaa"
    let mut out = String::with_capacity(joined.len());
    let mut last: Option<char> = None;
    let mut run = 0;
    for c in joined.chars() {
        if Some(c) == last {
            run += 1;
        } else {
            run = 1;
            last = Some(c);
        }
        if run <= 3 {
            out.push(c);
        }
    }
    // Emoji ve süs karakterleri (\w \s . , ! ? ; : ' " ( ) % & + - / kalır)
    let kept: String = out
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c.is_whitespace() || ".,!?;:'\"()%&+-/".contains(c) { c } else { ' ' })
        .collect();
    let s = kept.split_whitespace().collect::<Vec<_>>().join(" ");
    if max_chars > 0 && s.chars().count() > max_chars {
        let cut: String = s.chars().take(max_chars).collect();
        return match cut.rfind(' ') {
            Some(i) if i > 0 => cut[..i].to_string(),
            _ => cut,
        };
    }
    s
}

/// "gamer_kaan123" → "gamer kaan"
pub fn speech_name(name: &str) -> String {
    let n: String = name.chars().map(|c| if c == '_' || c == '-' || c == '.' { ' ' } else { c }).collect();
    let trimmed = n.trim_end();
    let digits = trimmed.chars().rev().take_while(|c| c.is_ascii_digit()).count();
    let n = if digits >= 3 { &trimmed[..trimmed.len() - digits] } else { trimmed };
    let n: String = n.chars().map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' }).collect();
    let n = n.split_whitespace().collect::<Vec<_>>().join(" ");
    if n.is_empty() {
        name.to_string()
    } else {
        n
    }
}

/// Mesaj okuma komutuyla başlıyorsa komuttan sonrası (MCO match_tts_command). Harfle biten komut ardından boşluk ister.
pub fn match_command(text: &str, cmds: &str) -> Option<String> {
    let t = text.trim();
    let low = t.to_lowercase();
    let mut list: Vec<String> = cmds.split([',', ' ', '\n']).map(|x| x.trim().to_lowercase()).filter(|x| !x.is_empty()).collect();
    list.sort_by_key(|c| std::cmp::Reverse(c.chars().count()));
    for c in list {
        if !low.starts_with(&c) {
            continue;
        }
        // Küçük harfe çevirince uzunluk değişebilir: karakter sayısıyla kes
        let n = c.chars().count();
        let rest: String = t.chars().skip(n).collect();
        let last_alnum = c.chars().last().is_some_and(|x| x.is_alphanumeric());
        if last_alnum && rest.chars().next().is_some_and(|x| !x.is_whitespace()) {
            continue;
        }
        return Some(rest.trim().to_string());
    }
    None
}

fn is_alert(m: &ChatMsg) -> bool {
    matches!(m.kind, Kind::Superchat | Kind::Sub | Kind::Raid | Kind::Donation | Kind::Alert) || m.platform == Platform::Streamlabs
}

/// Uyarının okunacak kısa açıklaması
fn alert_action(m: &ChatMsg) -> String {
    let ty = m.alert.as_ref().map(|a| a.kind.as_str()).unwrap_or("");
    let count = m.alert.as_ref().and_then(|a| a.count);
    match m.kind {
        Kind::Superchat => format!("Super Chat gönderdi{}", m.amount.as_deref().map(|a| format!(", {a}")).unwrap_or_default()),
        Kind::Donation if ty == "cheer" => format!("{} bits gönderdi", count.map(|c| c.to_string()).unwrap_or_default()).trim().to_string(),
        Kind::Donation => format!("bağış yaptı{}", m.amount.as_deref().map(|a| format!(", {a}")).unwrap_or_default()),
        Kind::Raid if ty == "host" => "host etti".into(),
        Kind::Raid => match count {
            Some(c) => format!("{c} kişiyle raid yaptı"),
            None => "raid yaptı".into(),
        },
        Kind::Sub if ty.contains("gift") => "abonelik hediye etti".into(),
        Kind::Sub if ty == "member" || ty == "milestone" => "üye oldu".into(),
        Kind::Sub => "abone oldu".into(),
        _ => match ty {
            "follower" => "takip etti".into(),
            "redemption" => "ödül aldı".into(),
            "tip" => "bağış yaptı".into(),
            "subscriber" | "resubscriber" => "abone oldu".into(),
            "member" => "üye oldu".into(),
            "cheer" => "bits gönderdi".into(),
            "raid" => "raid yaptı".into(),
            _ => String::new(),
        },
    }
}

/// Bu mesaj okunacak mı; okunacaksa metni (saf kural, test edilebilir)
pub fn decide(cfg: &TtsCfg, m: &ChatMsg) -> Option<String> {
    if m.deleted || m.kind == Kind::System || m.platform == Platform::System || m.vote.is_some() {
        return None;
    }
    let pf_ok = match m.platform {
        Platform::Youtube => cfg.youtube,
        Platform::Twitch => cfg.twitch,
        Platform::Kick => cfg.kick,
        _ => true,
    };
    if !pf_ok {
        return None;
    }
    let alert = is_alert(m);
    let name = speech_name(&m.author.name);
    if alert {
        if !(cfg.read_alerts || cfg.mode == Mode::Alerts) {
            return None;
        }
        let action = alert_action(m);
        let msg = speech_text(&m.parts, cfg.max_chars, cfg.skip_links, cfg.skip_emotes);
        let head = format!("{name} {action}").trim().to_string();
        let s = if msg.is_empty() { head } else if head.is_empty() { msg } else { format!("{head}. {msg}") };
        return (!s.is_empty()).then_some(s);
    }
    if cfg.mode == Mode::Alerts {
        return None;
    }
    let login = norm_user(&m.author.login);
    let listed = !cfg.only_users.is_empty() && (cfg.only_users.contains(&login) || cfg.only_users.contains(&norm_user(&m.author.name)));
    if cfg.subs_only {
        if !(m.author.sub || m.author.member || listed) {
            return None;
        }
    } else if !cfg.only_users.is_empty() && !listed {
        return None;
    }
    let text = if cfg.mode == Mode::Command {
        let rest = match_command(&m.text, &cfg.command)?;
        clean_text(&rest, cfg.max_chars, cfg.skip_links)
    } else {
        speech_text(&m.parts, cfg.max_chars, cfg.skip_links, cfg.skip_emotes)
    };
    if text.is_empty() {
        return None;
    }
    Some(if cfg.read_names && !name.is_empty() { format!("{name} diyor ki: {text}") } else { text })
}

// ---------------------------------------------------------------------------
// Çalışma zamanı
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
struct Override {
    voice: String,
    device: String,
    rate: f64,
    pitch: f64,
    volume: f64,
}

struct Item {
    id: Option<String>,
    text: String,
    at: Instant,
    test: Option<Override>,
    /// "Mesajlar" overlay'inden (sohbet okuması kapalıyken de okunur)
    ext: bool,
    /// Bu mesaja özel ses (boş / yok: ayarlardaki ses). Ekip sohbeti / Mesajlar overlay'i kendi sesini seçebilsin diye.
    voice: Option<String>,
}

#[derive(Default)]
struct St {
    cfg: TtsCfg,
    queue: VecDeque<Item>,
    /// Son okunan sosyal mesaj kimlikleri (aynı mesaj birden fazla overlay kopyasından / pencereden gelirse bir kez okunur)
    ext_seen: VecDeque<String>,
    error: Option<String>,
    /// Engellemeyen bilgi: son okumada Edge sesi yerine Windows sesi kullanıldı
    notice: Option<String>,
    speaking: bool,
    /// Çalışan okumayı kes
    skip: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TtsStatus {
    pub enabled: bool,
    pub allowed: bool,
    pub supported: bool,
    pub speaking: bool,
    pub queue: usize,
    pub error: Option<String>,
    /// Engellemeyen bilgi (ör. "Edge sesi kullanılamadı, Windows sesiyle okundu")
    pub notice: Option<String>,
}

pub struct Tts {
    app: AppHandle,
    st: Mutex<St>,
    cv: Condvar,
    /// Konuşma bitişi (unix ms) + kısa pay: altyazı kendi sesini yazmasın
    pub quiet_until: AtomicU64,
    pub speaking: AtomicBool,
}

pub const SUPPORTED: bool = cfg!(windows);

impl Tts {
    fn status(&self) -> TtsStatus {
        let g = self.st.lock();
        TtsStatus {
            enabled: g.cfg.enabled,
            allowed: allowed(&self.app, FEATURE),
            supported: SUPPORTED,
            speaking: g.speaking,
            queue: g.queue.len(),
            error: g.error.clone(),
            notice: g.notice.clone(),
        }
    }

    fn emit(&self) {
        let _ = self.app.emit("livechat-tts", self.status());
    }

    fn push(&self, item: Item, front: bool) {
        {
            let mut g = self.st.lock();
            if front {
                g.queue.push_front(item);
            } else {
                g.queue.push_back(item);
                let max = g.cfg.max_queue.max(1);
                while g.queue.len() > max {
                    // En eski sohbet mesajı atılır (yoksa en eski sosyal mesaj; denemeler kalır)
                    match g.queue.iter().position(|x| x.test.is_none() && !x.ext).or_else(|| g.queue.iter().position(|x| x.test.is_none())) {
                        Some(i) => {
                            g.queue.remove(i);
                        }
                        None => break,
                    }
                }
            }
        }
        self.cv.notify_one();
        self.emit();
    }

    /// Sohbet kancası: kabul edilen her mesaj
    fn on_msg(&self, m: &ChatMsg) {
        let cfg = {
            let g = self.st.lock();
            if !g.cfg.enabled {
                return;
            }
            g.cfg.clone()
        };
        if !SUPPORTED || !allowed(&self.app, FEATURE) {
            return;
        }
        if let Some(text) = decide(&cfg, m) {
            self.push(Item { id: Some(m.id.clone()), text, at: Instant::now(), test: None, ext: false, voice: None }, false);
        }
    }

    pub fn skip(&self) {
        self.st.lock().skip = true;
    }

    pub fn clear(&self) {
        {
            let mut g = self.st.lock();
            g.queue.retain(|x| x.test.is_some());
            g.skip = true;
        }
        self.emit();
    }

    fn apply(&self, cfg: TtsCfg) {
        let off = {
            let mut g = self.st.lock();
            if g.cfg == cfg {
                return;
            }
            let off = g.cfg.enabled && !cfg.enabled;
            g.cfg = cfg;
            if off {
                g.queue.retain(|x| x.test.is_some() || x.ext);
                g.skip = true;
            }
            off
        };
        let _ = off;
        self.emit();
    }
}

pub fn tts(app: &AppHandle) -> Option<Arc<Tts>> {
    app.try_state::<Arc<Tts>>().map(|s| s.inner().clone())
}

/// Kurulum (livechat::init): kanca ve çalma iş parçacığı
pub fn init(app: &AppHandle, hub: &Arc<Hub>) {
    let t = Arc::new(Tts {
        app: app.clone(),
        st: Mutex::new(St::default()),
        cv: Condvar::new(),
        quiet_until: AtomicU64::new(0),
        speaking: AtomicBool::new(false),
    });
    app.manage(t.clone());
    let t2 = t.clone();
    hub.add_hook(Arc::new(move |m: &ChatMsg| t2.on_msg(m)));
    if SUPPORTED {
        let t3 = t.clone();
        let h = hub.clone();
        let _ = std::thread::Builder::new().name("livechat-tts".into()).spawn(move || crate::crashlog::supervise("livechat-tts", || worker(t3.clone(), h.clone())));
    }
}

pub fn apply_settings(app: &AppHandle, v: &Value) {
    if let Some(t) = tts(app) {
        t.apply(cfg_from_settings(v));
    }
}

/// Mesaj moderasyonla silindi mi
fn is_deleted(hub: &Hub, id: &str) -> bool {
    hub.st.lock().ring.iter().rev().take(300).find(|m| m.id == id).is_some_and(|m| m.deleted)
}

#[cfg(windows)]
fn worker(t: Arc<Tts>, hub: Arc<Hub>) {
    use rodio::cpal::traits::HostTrait;
    use rodio::DeviceTrait;
    use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};

    let mut synth: Option<super::tts_win::Synth> = None;
    let mut out: Option<(String, OutputStream, OutputStreamHandle)> = None;
    // Edge sesi çalışmazsa kullanılacak Windows sesi (dil kodu → ses kimliği; boş: Windows varsayılanı)
    let mut win_fallback: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    loop {
        // Sıradaki mesaj (20 sn boşta kalınca ses akışı kapatılır)
        let item = {
            let mut g = t.st.lock();
            loop {
                if let Some(it) = g.queue.pop_front() {
                    break it;
                }
                let r = t.cv.wait_for(&mut g, Duration::from_secs(20));
                if r.timed_out() && g.queue.is_empty() {
                    out = None;
                }
            }
        };
        let cfg = t.st.lock().cfg.clone();
        if item.ext {
            if !allowed(&t.app, SOCIAL_FEATURE) || item.at.elapsed().as_secs_f64() > SOCIAL_MAX_DELAY {
                t.emit();
                continue;
            }
        } else if item.test.is_none() {
            if !cfg.enabled || item.at.elapsed().as_secs_f64() > cfg.max_delay {
                t.emit();
                continue;
            }
            if item.id.as_deref().is_some_and(|id| is_deleted(&hub, id)) {
                t.emit();
                continue;
            }
        }
        let mut ov = item.test.clone().unwrap_or(Override { voice: cfg.voice.clone(), device: cfg.device.clone(), rate: cfg.rate, pitch: cfg.pitch, volume: cfg.volume });
        if let Some(v) = item.voice.as_ref().filter(|v| !v.is_empty()) {
            ov.voice = v.clone();
        }
        // Edge çevrimiçi sesi (edge:…): olmazsa bu mesaj aynı dildeki Windows sesiyle okunur, sıra beklemez
        let mut edge_wav: Option<Vec<u8>> = None;
        let mut notice: Option<String> = None;
        if let Some(short) = ov.voice.strip_prefix(super::tts_edge::PREFIX).map(str::to_string) {
            t.st.lock().skip = false;
            match super::tts_edge::synth_wav_blocking(&item.text, &short, ov.rate, ov.pitch) {
                Ok(w) => edge_wav = Some(w),
                Err(e) => {
                    notice = Some(format!("Edge sesi kullanılamadı, Windows sesiyle okundu ({e})"));
                    let lang = short.split('-').next().unwrap_or("").to_lowercase();
                    let fb = win_fallback.entry(lang.clone()).or_insert_with(|| {
                        super::tts_win::voices()
                            .ok()
                            .and_then(|l| l.into_iter().find(|v| !lang.is_empty() && v.language.to_lowercase().split('-').next() == Some(lang.as_str())))
                            .map(|v| v.id)
                            .unwrap_or_default()
                    });
                    ov.voice = fb.clone();
                }
            }
            // Beklerken susturulduysa / sıra boşaltıldıysa okuma
            if std::mem::take(&mut t.st.lock().skip) {
                t.emit();
                continue;
            }
        }
        // Sentez
        if edge_wav.is_none() && synth.is_none() {
            match super::tts_win::Synth::new() {
                Ok(s) => synth = Some(s),
                Err(e) => {
                    t.st.lock().error = Some(format!("Windows ses motoru açılamadı: {e}"));
                    t.emit();
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            }
        }
        let wav = match edge_wav {
            Some(w) => w,
            None => match synth.as_mut().unwrap().wav(&item.text, &ov.voice, ov.rate, ov.pitch, win_rate(ov.rate), win_pitch(ov.pitch)) {
                Ok(w) => w,
                Err(e) => {
                    synth = None;
                    t.st.lock().error = Some(format!("Ses üretilemedi: {e}"));
                    t.emit();
                    continue;
                }
            },
        };
        // Çıkış cihazı (boş: Windows varsayılanı)
        if out.as_ref().map(|(d, _, _)| d != &ov.device).unwrap_or(true) {
            out = None;
            let host = rodio::cpal::default_host();
            let dev = if ov.device.is_empty() {
                None
            } else {
                host.output_devices().ok().and_then(|mut it| it.find(|d| d.name().map(|n| n == ov.device).unwrap_or(false)))
            };
            let opened = match dev {
                Some(d) => OutputStream::try_from_device(&d).or_else(|_| OutputStream::try_default()),
                None => OutputStream::try_default(),
            };
            match opened {
                Ok((s, h)) => out = Some((ov.device.clone(), s, h)),
                Err(e) => {
                    t.st.lock().error = Some(format!("Ses çıkışı açılamadı: {e}"));
                    t.emit();
                    continue;
                }
            }
        }
        // Sesli mühendis / spotter konuşuyorsa bitmesini bekle (en fazla 8 sn; denemeler beklemez)
        if item.test.is_none() {
            let wait = Instant::now();
            while crate::audio::busy() && wait.elapsed() < Duration::from_secs(8) {
                std::thread::sleep(Duration::from_millis(60));
            }
        }
        let Some((_, _, handle)) = out.as_ref() else { continue };
        let sink = match Sink::try_new(handle) {
            Ok(s) => s,
            Err(e) => {
                out = None;
                t.st.lock().error = Some(format!("Ses çalınamadı: {e}"));
                t.emit();
                continue;
            }
        };
        let src = match Decoder::new(std::io::Cursor::new(wav)) {
            Ok(s) => s,
            Err(e) => {
                t.st.lock().error = Some(format!("Ses çözülemedi: {e}"));
                t.emit();
                continue;
            }
        };
        sink.set_volume((ov.volume / 100.0) as f32);
        sink.append(src);
        {
            let mut g = t.st.lock();
            g.speaking = true;
            g.skip = false;
            g.error = None;
            g.notice = notice;
        }
        t.speaking.store(true, Ordering::Relaxed);
        t.emit();
        let started = Instant::now();
        while !sink.empty() {
            std::thread::sleep(Duration::from_millis(40));
            let (skip, vol) = {
                let g = t.st.lock();
                (g.skip, g.cfg.volume)
            };
            if skip || started.elapsed() > Duration::from_secs(60) {
                sink.stop();
                break;
            }
            if item.test.is_none() {
                sink.set_volume((vol / 100.0) as f32);
            }
        }
        drop(sink);
        {
            let mut g = t.st.lock();
            g.speaking = false;
            g.skip = false;
        }
        t.speaking.store(false, Ordering::Relaxed);
        t.quiet_until.store(super::model::now_ms() + 800, Ordering::Relaxed);
        t.emit();
    }
}

#[cfg(not(windows))]
fn worker(_t: Arc<Tts>, _hub: Arc<Hub>) {}

// ---------------------------------------------------------------------------
// Kısayollar
// ---------------------------------------------------------------------------

/// Kısayol: sesli okumayı aç / kapat
pub fn hotkey_toggle(app: &AppHandle) {
    if !SUPPORTED || !allowed(app, FEATURE) {
        crate::audio::send(crate::audio::Cmd::Beep { freq: 300.0, ms: 160, volume: 0.5, pan: 0.0 });
        super::notice(app, "Sesli okuma kullanılamıyor (PRO / Windows gerekli)");
        return;
    }
    let on = !tts(app).map(|t| t.st.lock().cfg.enabled).unwrap_or(false);
    super::update_settings(app, |lc| {
        if !lc.get("tts").is_some_and(|x| x.is_object()) {
            lc["tts"] = serde_json::json!({});
        }
        lc["tts"]["enabled"] = Value::Bool(on);
    });
    super::beep_onoff(on);
    super::notice(app, if on { "Sesli okuma açıldı" } else { "Sesli okuma kapatıldı" });
}

/// Kısayol: okunanı kes ve kuyruğu boşalt
pub fn hotkey_hush(app: &AppHandle) {
    if let Some(t) = tts(app) {
        t.clear();
    }
    super::notice(app, "Sesli okuma susturuldu");
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VoiceOut {
    /// Ses kimliği (ayarlara bu yazılır; SAPI5 seslerinde `sapi:` ön ekli)
    pub id: String,
    pub name: String,
    /// BCP-47 (ör. "tr-TR")
    pub language: String,
    /// Dilin Windows arayüz dilindeki adı
    pub language_name: String,
    pub female: bool,
    /// "female" | "male"
    pub gender: &'static str,
    /// "edge" (Edge çevrimiçi doğal sesleri) | "onecore" (Windows Ayarları › Konuşma sesleri) | "sapi" (klasik SAPI5 sesleri)
    pub engine: &'static str,
}

/// Edge çevrimiçi sesleri (liste alınamazsa yerleşik liste). Kimlik: `edge:<kısa ad>`
async fn edge_voice_list() -> Vec<VoiceOut> {
    let (list, _) = super::tts_edge::voices().await;
    list.into_iter()
        .map(|v| VoiceOut {
            id: format!("{}{}", super::tts_edge::PREFIX, v.short),
            name: v.display(),
            language: v.locale.clone(),
            language_name: v.language_name.clone(),
            female: v.female,
            gender: if v.female { "female" } else { "male" },
            engine: "edge",
        })
        .collect()
}

#[tauri::command]
pub async fn livechat_tts_voices() -> Result<Vec<VoiceOut>, String> {
    #[cfg(windows)]
    {
        // Windows sesleri okunamasa da Edge sesleri listelenir
        let list = tauri::async_runtime::spawn_blocking(super::tts_win::voices).await.map_err(|e| e.to_string())?.unwrap_or_default();
        let mut out = edge_voice_list().await;
        out.extend(
            list.into_iter()
                .filter(|v| !v.id.is_empty())
                .map(|v| VoiceOut { id: v.id, name: v.name, language: v.language, language_name: v.language_name, female: v.female, gender: if v.female { "female" } else { "male" }, engine: v.engine }),
        );
        Ok(out)
    }
    #[cfg(not(windows))]
    {
        let _ = edge_voice_list;
        Err("Sesli okuma sadece Windows'ta çalışır".into())
    }
}

/// Ses çıkış cihazlarının adları
#[tauri::command]
pub async fn livechat_audio_outputs() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        use rodio::cpal::traits::HostTrait;
        use rodio::DeviceTrait;
        let host = rodio::cpal::default_host();
        let mut v: Vec<String> = host.output_devices().map(|it| it.filter_map(|d| d.name().ok()).collect()).unwrap_or_default();
        v.dedup();
        v
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn livechat_tts_status(app: AppHandle) -> TtsStatus {
    tts(&app).map(|t| t.status()).unwrap_or_default()
}

/// Deneme okuması (kayıtlı olmayan değerlerle; sesli okuma kapalıyken de çalışır)
#[tauri::command]
pub fn livechat_tts_test(app: AppHandle, text: String, voice: String, device: String, rate: f64, pitch: f64, volume: f64) -> Result<(), String> {
    if !SUPPORTED {
        return Err("Sesli okuma sadece Windows'ta çalışır".into());
    }
    if !allowed(&app, FEATURE) {
        return Err("Sohbeti sesli okuma PRO üyelere özel".into());
    }
    let t = tts(&app).ok_or("hazır değil")?;
    let text = clean_text(&text, 300, true);
    if text.is_empty() {
        return Err("Okunacak metin yok".into());
    }
    let ov = Override { voice, device, rate: rate.clamp(-10.0, 10.0), pitch: pitch.clamp(-10.0, 10.0), volume: volume.clamp(0.0, 100.0) };
    t.st.lock().error = None;
    t.push(Item { id: None, text, at: Instant::now(), test: Some(ov), ext: false, voice: None }, true);
    Ok(())
}

/// Sosyal mesajın okunacak metni: ad isteğe bağlı ("Ali diyor ki: …"), metin sohbetle aynı kurallarla temizlenir
pub fn social_text(name: &str, body: &str, read_name: bool, max_chars: usize) -> Option<String> {
    let text = clean_text(body, max_chars.clamp(20, 500), true);
    if text.is_empty() {
        return None;
    }
    let name = if read_name { speech_name(name) } else { String::new() };
    Some(if name.trim().is_empty() { text } else { format!("{name} diyor ki: {text}") })
}

/// "Mesajlar" overlay'i: gelen arkadaş / takım / grup mesajını sesli oku (PRO: social.messages_tts).
/// Sohbet okumasıyla aynı kuyruğa girer (üst üste konuşmaz). Aynı kimlik ikinci kez gelirse yok sayılır.
/// Döner: sıraya alındı mı.
#[tauri::command]
pub fn social_tts_speak(app: AppHandle, id: String, name: String, text: String, read_name: Option<bool>, max_chars: Option<usize>, voice: Option<String>) -> Result<bool, String> {
    if !SUPPORTED {
        return Err("Sesli okuma sadece Windows'ta çalışır".into());
    }
    if !allowed(&app, SOCIAL_FEATURE) {
        return Err("Mesajları sesli okuma PRO üyelere özel".into());
    }
    let t = tts(&app).ok_or("hazır değil")?;
    let Some(text) = social_text(&name, &text, read_name.unwrap_or(true), max_chars.unwrap_or(200)) else { return Ok(false) };
    {
        let mut g = t.st.lock();
        if !id.is_empty() {
            if g.ext_seen.iter().any(|x| *x == id) {
                return Ok(false);
            }
            g.ext_seen.push_back(id);
            while g.ext_seen.len() > 200 {
                g.ext_seen.pop_front();
            }
        }
    }
    t.push(Item { id: None, text, at: Instant::now(), test: None, ext: true, voice: voice.filter(|v| !v.trim().is_empty()) }, false);
    Ok(true)
}

/// Verilen metni seçilen sesle oku (ekip sohbeti, Mesajlar overlay'i gibi başka özellikler için genel komut).
/// Sohbet okumasıyla aynı kuyruğa girer (üst üste konuşmaz); sohbet okuması kapalıyken de çalışır.
/// Verilmeyen değerler Canlı Sohbet › Sesli okuma ayarlarından alınır (cihaz, hız, ton, ses düzeyi).
/// PRO: `livechat.tts` ya da `social.messages_tts` açık olmalı. Döner: sıraya alındı mı.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn tts_speak(
    app: AppHandle,
    text: String,
    voice: Option<String>,
    device: Option<String>,
    rate: Option<f64>,
    pitch: Option<f64>,
    volume: Option<f64>,
    max_chars: Option<usize>,
) -> Result<bool, String> {
    if !SUPPORTED {
        return Err("Sesli okuma sadece Windows'ta çalışır".into());
    }
    if !allowed(&app, FEATURE) && !allowed(&app, SOCIAL_FEATURE) {
        return Err("Sesli okuma PRO üyelere özel".into());
    }
    let t = tts(&app).ok_or("hazır değil")?;
    let text = clean_text(&text, max_chars.unwrap_or(300).clamp(20, 1000), true);
    if text.is_empty() {
        return Ok(false);
    }
    let cfg = t.st.lock().cfg.clone();
    let ov = Override {
        voice: voice.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).unwrap_or(cfg.voice),
        device: device.unwrap_or(cfg.device),
        rate: rate.unwrap_or(cfg.rate).clamp(-10.0, 10.0),
        pitch: pitch.unwrap_or(cfg.pitch).clamp(-10.0, 10.0),
        volume: volume.unwrap_or(cfg.volume).clamp(0.0, 100.0),
    };
    t.st.lock().error = None;
    t.push(Item { id: None, text, at: Instant::now(), test: Some(ov), ext: false, voice: None }, false);
    Ok(true)
}

#[tauri::command]
pub fn livechat_tts_skip(app: AppHandle) {
    if let Some(t) = tts(&app) {
        t.skip();
    }
}

#[tauri::command]
pub fn livechat_tts_clear(app: AppHandle) {
    if let Some(t) = tts(&app) {
        t.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::livechat::model::{AlertInfo, Author};

    fn msg(text: &str, sub: bool) -> ChatMsg {
        let mut m = ChatMsg::new(Platform::Twitch, "1", Kind::Chat, Author { name: "gamer_kaan123".into(), login: "gamer_kaan123".into(), sub, ..Default::default() }, vec![Part::text(text)]);
        m.channel = "twitch:x".into();
        m
    }

    #[test]
    fn text_rules() {
        assert_eq!(speech_name("gamer_kaan123"), "gamer kaan");
        assert_eq!(speech_name("Ali.Veli"), "Ali Veli");
        assert_eq!(speech_name("12345"), "12345");
        assert_eq!(clean_text("çooooook güzel 🔥 www.x.com k*** s**t", 150, true), "çoook güzel");
        assert_eq!(clean_text("bir iki üç dört", 9, true), "bir iki");
        assert_eq!(match_command("!oku merhaba", "!oku"), Some("merhaba".into()));
        assert_eq!(match_command("!okul var", "!oku"), None);
        assert_eq!(match_command("!merhaba", "!"), Some("merhaba".into()));
        assert_eq!(match_command("!OKU Selam", "!s, !oku"), Some("Selam".into()));
        let parts = vec![Part::text("bak "), Part::Emote { url: "u".into(), name: "Kappa".into() }, Part::text(" "), Part::Link { url: "https://a.com".into(), v: "a.com".into() }, Part::text(" tamam")];
        assert_eq!(speech_text(&parts, 150, true, true), "bak tamam");
        assert_eq!(speech_text(&parts, 150, false, false), "bak Kappa a.com tamam");
        assert_eq!(social_text("Ali_Veli", "Pitte görüşürüz 👍", true, 200).as_deref(), Some("Ali Veli diyor ki: Pitte görüşürüz"));
        assert_eq!(social_text("Ali", "selam", false, 200).as_deref(), Some("selam"));
        assert_eq!(social_text("Ali", "🔥", true, 200), None);
    }

    #[test]
    fn decide_rules() {
        let mut c = TtsCfg { enabled: true, ..Default::default() };
        assert_eq!(decide(&c, &msg("selam", false)).as_deref(), Some("gamer kaan diyor ki: selam"));
        c.read_names = false;
        assert_eq!(decide(&c, &msg("selam", false)).as_deref(), Some("selam"));
        c.mode = Mode::Command;
        assert_eq!(decide(&c, &msg("selam", false)), None);
        assert_eq!(decide(&c, &msg("!oku selam", false)).as_deref(), Some("selam"));
        c.mode = Mode::All;
        c.subs_only = true;
        assert_eq!(decide(&c, &msg("selam", false)), None);
        assert!(decide(&c, &msg("selam", true)).is_some());
        c.subs_only = false;
        c.only_users = ["ali".to_string()].into_iter().collect();
        assert_eq!(decide(&c, &msg("selam", true)), None);
        c.only_users = ["gamer_kaan123".to_string()].into_iter().collect();
        assert!(decide(&c, &msg("selam", false)).is_some());
        c.twitch = false;
        assert_eq!(decide(&c, &msg("selam", false)), None);
        c.twitch = true;
        // Oylar okunmaz
        let mut v = msg("2", false);
        v.vote = Some(2);
        assert_eq!(decide(&c, &v), None);
        // Uyarılar: "sadece uyarılar" modunda normal mesaj okunmaz
        c.mode = Mode::Alerts;
        assert_eq!(decide(&c, &msg("selam", false)), None);
        let mut a = msg("", false);
        a.kind = Kind::Raid;
        a.alert = Some(AlertInfo { kind: "raid".into(), count: Some(42), ..Default::default() });
        assert_eq!(decide(&c, &a).as_deref(), Some("gamer kaan 42 kişiyle raid yaptı"));
        c.mode = Mode::All;
        c.read_alerts = false;
        assert_eq!(decide(&c, &a), None);
    }

    #[test]
    fn settings() {
        let v = serde_json::json!({ "general": { "livechat": { "tts": { "enabled": true, "mode": "command", "onlyUsers": "@Ali, veli", "maxQueue": 99, "platforms": { "kick": false } } } } });
        let c = cfg_from_settings(&v);
        assert!(c.enabled && c.mode == Mode::Command && !c.kick && c.twitch);
        assert!(c.only_users.contains("ali") && c.only_users.contains("veli"));
        assert_eq!(c.max_queue, 50);
        assert!((win_rate(10.0) - 3.0).abs() < 1e-9 && (win_rate(-10.0) - 0.5).abs() < 1e-9);
    }
}
