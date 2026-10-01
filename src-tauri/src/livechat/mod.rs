//! Canlı Sohbet (MultiChatOverlay'in Rust'a taşınmış çekirdeği).
//!
//! YouTube / Twitch / Kick kanallarının sohbetini (giriş gerekmeden) okur, tek bir akışta birleştirir,
//! moderasyon uygular (yasaklı kullanıcılar, kelime filtresi, bağlantı engeli, tekrar filtresi, platform
//! silmelerini yansıtma), sohbetten anket oylarını sayar, isteğe bağlı günlük sohbet kaydı tutar ve
//! Streamlabs uyarılarını alır.
//!
//! Bağlantılar tokio görevleridir (Tauri'nin async çalışma zamanı); her kanal kendi görevinde, koparsa
//! artan beklemeyle yeniden bağlanır. Merkez (`Hub`) 100 ms'de bir biriken değişiklikleri yayınlar:
//!
//! Uygulama olayları (`app.emit`):
//!   "livechat-message"  ChatMsg[]            yeni mesajlar (filtrelenmiş, sırayla)
//!   "livechat-delete"   { ids: string[] }    silinen mesajlar (platform moderasyonu / yasak / elle gizleme)
//!   "livechat-clear"    null                 sohbet temizlendi
//!   "livechat-status"   LiveChatStatus       kanal durumları, izleyici sayıları, Streamlabs
//!   "livechat-poll"     PollView             anket durumu
//!   "livechat-captions" CaptionView          altyazı
//!
//! Overlay konuları (`Shared::push_topic`; overlay pencereleri ve OBS/SSE): "livechat", "livepoll", "captions".
//!
//! Ayarlar: settings.json → `general.livechat` (bkz. src/sdk/settings.ts `LiveChatSettings`).
//! Gizli bilgiler (Streamlabs Socket API Token, Twitch/YouTube/Kick oturum anahtarları) ayarlarda DEĞİL:
//! `<app_config>/livechat_secrets.json`, DPAPI ile şifreli (bkz. secrets.rs; /api/settings ile yerel ağa açılmasın diye).
//!
//! Ek modüller: tts.rs (sohbeti sesli okuma, Windows sesleri), stt.rs (konuşmayı yazıya çevirme → altyazı),
//! send.rs (Twitch/YouTube/Kick hesabıyla sohbete yazma). Kısayollar (lib.rs): anket F9, sesli okuma F5, altyazı F6;
//! sadece canlı sohbet çalışırken (ya da altyazı açıkken) kaydedilir.
//!
//! Sohbet kaydı görüntüleyici (gün listesi, arama, dışa aktarma, saklama süresi): chatlog.rs (PRO: `livechat.log`).
//! PRO: arayüz entitlement "locked" listesine `livechat.multi`, `livechat.poll`, `livechat.obs`,
//! `livechat.alerts`… anahtarlarını (yönetici PRO'ya ayırdıysa) ekler. Ücretsizde sadece listedeki ilk kanalın
//! mesajları alınır; ★ favori kanallar (platform başına bir tane) yalnızca izleyici sayısı için bağlı kalır.

pub mod filter;
pub mod kick;
pub mod links;
pub mod model;
pub mod net;
pub mod poll;
pub mod secrets;
pub mod chatlog;
pub mod send;
pub mod streamlabs;
pub mod stt;
#[cfg(windows)]
pub mod stt_win;
pub mod tts;
#[cfg(windows)]
pub mod tts_win;
pub mod twitch;
pub mod youtube;

use crate::engine::{Packet, Shared};
use filter::{has_link, linkify, norm_user, SpamFilter, WordFilter};
use links::Link;
use model::{now_ms, now_s, ChannelStatus, ChatMsg, Kind, Part, Platform, State};
use parking_lot::Mutex;
use poll::{Poll, PollState, PollView, Vote};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, Manager};

/// Bellekte tutulan son mesaj sayısı
const RING: usize = 300;
/// Overlay konusunda gönderilen son mesaj sayısı
const TOPIC_MSGS: usize = 100;

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

/// Ayarlardaki kanal kaydı (`general.livechat.channels[]`)
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ChannelIn {
    pub url: String,
    /// Göz kapalı: mesajları gösterilmez, oy sayılmaz (bağlantı ve izleyici sayısı sürer)
    pub hidden: bool,
    /// Kullanıcı adının önünde [kanal] etiketi: null = otomatik (aynı platformdan birden fazla kanal varsa)
    pub tag: Option<bool>,
    /// "Benim kanalım" (platform başına bir tane; izleyici çubuğu bunu gösterir)
    pub mine: bool,
    /// Elle verilen ad (boş: platformdan öğrenilen ad)
    pub name: String,
}

#[derive(Clone, Debug, PartialEq)]
struct Chan {
    cfg: ChannelIn,
    link: Link,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
enum WordMode {
    #[default]
    Mask,
    Hide,
}

#[derive(Clone, Debug, PartialEq)]
struct Config {
    auto_start: bool,
    channels: Vec<Chan>,
    yt_interval: f64,
    yt_client_version: String,
    banned: HashSet<String>,
    word_filter: bool,
    words: String,
    word_mode: WordMode,
    block_links: bool,
    spam: bool,
    spam_window: f64,
    mirror_deletes: bool,
    poll_options: u8,
    poll_duration: f64,
    poll_result: f64,
    hide_votes: bool,
    log: bool,
    /// Kayıtların saklanma süresi (gün; 0: sınırsız)
    log_days: i64,
    streamlabs: bool,
    caption_secs: f64,
}

impl Default for Config {
    fn default() -> Config {
        Config {
            auto_start: false,
            channels: vec![],
            yt_interval: 2.0,
            yt_client_version: String::new(),
            banned: HashSet::new(),
            word_filter: false,
            words: String::new(),
            word_mode: WordMode::Mask,
            block_links: false,
            spam: true,
            spam_window: 10.0,
            mirror_deletes: true,
            poll_options: 2,
            poll_duration: 60.0,
            poll_result: 15.0,
            hide_votes: false,
            log: false,
            log_days: 30,
            streamlabs: false,
            caption_secs: 8.0,
        }
    }
}

fn cfg_from_settings(v: &Value) -> Config {
    let d = Config::default();
    let Some(lc) = v.pointer("/general/livechat") else { return d };
    let b = |p: &str, def: bool| lc.pointer(p).and_then(|x| x.as_bool()).unwrap_or(def);
    let f = |p: &str, def: f64| lc.pointer(p).and_then(|x| x.as_f64()).unwrap_or(def);
    let s = |p: &str| lc.pointer(p).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let mut channels: Vec<Chan> = Vec::new();
    for c in lc.get("channels").and_then(|x| x.as_array()).into_iter().flatten() {
        let Ok(ci) = serde_json::from_value::<ChannelIn>(c.clone()) else { continue };
        let Some(link) = links::parse_link(&ci.url) else { continue };
        if channels.iter().any(|x| x.link.key == link.key) {
            continue;
        }
        channels.push(Chan { cfg: ci, link });
    }
    let banned: HashSet<String> = match lc.pointer("/moderation/banned") {
        Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str()).map(norm_user).filter(|x| !x.is_empty()).collect(),
        Some(Value::String(t)) => t.split(',').map(norm_user).filter(|x| !x.is_empty()).collect(),
        _ => HashSet::new(),
    };
    Config {
        auto_start: b("/autoStart", false),
        channels,
        yt_interval: f("/ytInterval", 2.0).clamp(1.0, 10.0),
        yt_client_version: s("/ytClientVersion").trim().to_string(),
        banned,
        word_filter: b("/moderation/wordFilter", false),
        words: s("/moderation/words"),
        word_mode: if s("/moderation/wordMode") == "hide" { WordMode::Hide } else { WordMode::Mask },
        block_links: b("/moderation/blockLinks", false),
        spam: b("/moderation/spam", true),
        spam_window: f("/moderation/spamWindow", 10.0).clamp(1.0, 300.0),
        mirror_deletes: b("/moderation/mirrorDeletes", true),
        poll_options: f("/poll/options", 2.0).clamp(2.0, 9.0) as u8,
        poll_duration: f("/poll/duration", 60.0).clamp(0.0, 3600.0),
        poll_result: f("/poll/resultDuration", 15.0).clamp(3.0, 120.0),
        hide_votes: b("/poll/hideVotes", false),
        log: b("/log", false),
        log_days: f("/logDays", 30.0).clamp(0.0, 3650.0) as i64,
        streamlabs: b("/streamlabs", false),
        caption_secs: f("/captions/secs", 8.0).clamp(2.0, 60.0),
    }
}

// ---------------------------------------------------------------------------
// Durum görünümleri
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Viewers {
    pub youtube: Option<u64>,
    pub twitch: Option<u64>,
    pub kick: Option<u64>,
    pub total: Option<u64>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlStatus {
    /// Ayarlarda açık
    pub enabled: bool,
    /// Anahtar kayıtlı
    pub has_token: bool,
    pub connected: bool,
    pub error: Option<String>,
    /// PRO kilidi
    pub locked: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveChatStatus {
    pub running: bool,
    pub channels: Vec<ChannelStatus>,
    pub viewers: Viewers,
    pub streamlabs: SlStatus,
    /// Birden fazla kanal bağlanabilir mi (PRO)
    pub multi: bool,
    pub log: bool,
}

/// "livechat" konusu
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveChatTopic {
    pub running: bool,
    pub msgs: Vec<ChatMsg>,
    pub channels: Vec<ChannelStatus>,
    pub viewers: Viewers,
    pub rev: u64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaptionLine {
    /// "mic" | "remote"
    pub src: String,
    pub label: String,
    pub text: String,
    /// Son güncelleme (unix ms)
    pub ts: u64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CaptionView {
    pub lines: Vec<CaptionLine>,
    pub rev: u64,
}

#[derive(Default, Clone)]
struct ChanRt {
    chat: bool,
    live: Option<bool>,
    viewers: Option<u64>,
    error: Option<String>,
    name: String,
    video: Option<String>,
}

pub type Hook = Arc<dyn Fn(&ChatMsg) + Send + Sync>;

#[derive(Default)]
struct Inner {
    running: bool,
    cfg: Config,
    multi: bool,
    alerts_ok: bool,
    tasks: HashMap<String, Vec<JoinHandle<()>>>,
    sl_task: Option<(String, JoinHandle<()>)>,
    sl_token: String,
    sl_connected: bool,
    sl_error: Option<String>,
    rt: HashMap<String, ChanRt>,
    ring: VecDeque<ChatMsg>,
    new_msgs: Vec<ChatMsg>,
    new_deleted: Vec<String>,
    cleared: bool,
    dirty_chat: bool,
    dirty_status: bool,
    dirty_poll: bool,
    dirty_captions: bool,
    session_bans: HashSet<(Platform, String)>,
    spam: SpamFilter,
    words: WordFilter,
    poll: Poll,
    poll_pushed_at: f64,
    poll_logged: bool,
    captions: CaptionView,
    log_lines: Vec<String>,
    topics_gen: u64,
    rev: u64,
    seq: u64,
}

pub struct Hub {
    pub app: AppHandle,
    shared: Arc<Shared>,
    st: Mutex<Inner>,
    hooks: Mutex<Vec<Hook>>,
    started_once: AtomicBool,
}

/// Bir kanal görevinin bağlamı
#[derive(Clone)]
pub struct Ctx {
    pub hub: Arc<Hub>,
    pub key: String,
    pub link: Link,
}

/// PRO özelliği bu kullanıcıya açık mı (arayüzün entitlement "locked" listesine bakar)
pub fn allowed(app: &AppHandle, key: &str) -> bool {
    let e = crate::entitlement::view(app);
    e.pro || !e.locked.iter().any(|x| x == key)
}

fn show_tag(cfg: &Config, ch: &Chan) -> bool {
    match ch.cfg.tag {
        Some(t) => t,
        None => cfg.channels.iter().filter(|c| c.link.platform == ch.link.platform).count() > 1,
    }
}

fn label_of(ch: &Chan, rt: Option<&ChanRt>) -> String {
    let n = ch.cfg.name.trim();
    if !n.is_empty() {
        return n.to_string();
    }
    match rt {
        Some(r) if !r.name.is_empty() => r.name.clone(),
        _ => ch.link.label.clone(),
    }
}

impl Inner {
    fn channels_view(&self) -> Vec<ChannelStatus> {
        self.cfg
            .channels
            .iter()
            .enumerate()
            .map(|(i, ch)| {
                let rt = self.rt.get(&ch.link.key);
                let locked = !self.multi && i > 0;
                let state = if locked {
                    State::Locked
                } else if !self.running {
                    State::Idle
                } else {
                    match rt {
                        None => State::Connecting,
                        Some(r) if r.live == Some(true) => State::Live,
                        Some(r) if r.error.is_some() && !r.chat => State::Error,
                        Some(r) if r.chat || r.live == Some(false) => State::Offline,
                        Some(_) => State::Connecting,
                    }
                };
                ChannelStatus {
                    key: ch.link.key.clone(),
                    platform: Some(ch.link.platform),
                    url: ch.cfg.url.clone(),
                    label: label_of(ch, rt),
                    state,
                    chat: self.running && !locked && rt.is_some_and(|r| r.chat),
                    // Kilitli (ücretsiz) ama ★ favori kanal: sohbeti gösterilmez, izleyici sayısı izlenir
                    viewers: if state == State::Live || (locked && self.running && ch.cfg.mine && rt.is_some_and(|r| r.live == Some(true))) {
                        rt.and_then(|r| r.viewers)
                    } else {
                        None
                    },
                    error: if self.running && !locked { rt.and_then(|r| r.error.clone()) } else { None },
                    hidden: ch.cfg.hidden,
                    mine: ch.cfg.mine,
                    tag: ch.cfg.tag,
                    video_id: rt.and_then(|r| r.video.clone()),
                }
            })
            .collect()
    }

    fn viewers(&self, chans: &[ChannelStatus]) -> Viewers {
        let per = |p: Platform| -> Option<u64> {
            let list: Vec<&ChannelStatus> = chans.iter().filter(|c| c.platform == Some(p)).collect();
            if let Some(m) = list.iter().find(|c| c.mine && c.viewers.is_some()) {
                return m.viewers;
            }
            let live: Vec<u64> = list.iter().filter_map(|c| c.viewers).collect();
            (!live.is_empty()).then(|| live.iter().sum())
        };
        let (y, t, k) = (per(Platform::Youtube), per(Platform::Twitch), per(Platform::Kick));
        let all: Vec<u64> = [y, t, k].into_iter().flatten().collect();
        Viewers { youtube: y, twitch: t, kick: k, total: (!all.is_empty()).then(|| all.iter().sum()) }
    }

    fn sl_status(&self) -> SlStatus {
        SlStatus {
            enabled: self.cfg.streamlabs,
            has_token: !self.sl_token.is_empty(),
            connected: self.sl_task.is_some() && self.sl_connected,
            error: if self.sl_task.is_some() || !self.sl_token.is_empty() { self.sl_error.clone() } else { None },
            locked: !self.alerts_ok,
        }
    }

    fn status(&self) -> LiveChatStatus {
        let channels = self.channels_view();
        LiveChatStatus {
            running: self.running,
            viewers: self.viewers(&channels),
            channels,
            streamlabs: self.sl_status(),
            multi: self.multi,
            log: self.cfg.log,
        }
    }

    fn topic(&self) -> LiveChatTopic {
        let channels = self.channels_view();
        let skip = self.ring.len().saturating_sub(TOPIC_MSGS);
        LiveChatTopic {
            running: self.running,
            msgs: self.ring.iter().skip(skip).cloned().collect(),
            viewers: self.viewers(&channels),
            channels,
            rev: self.rev,
        }
    }

    fn log(&mut self, line: String) {
        if self.cfg.log {
            self.log_lines.push(line);
        }
    }

    /// Mesaj hattı (MCO update_chat ile aynı sıra). Kabul edilirse halkaya eklenir ve döner.
    fn accept(&mut self, mut m: ChatMsg, now: f64) -> Option<ChatMsg> {
        {
            let g = self;
            if !g.running {
                return None;
            }
            if !matches!(m.platform, Platform::Streamlabs | Platform::System) {
                // Kaldırılmış ya da gizlenmiş (göz kapalı) kanal
                let Some(idx) = g.cfg.channels.iter().position(|c| c.link.key == m.channel) else { return None };
                // Ücretsiz sürüm: yalnızca en üstteki kanalın mesajları (★ favoriler sadece izleyici sayısı için bağlı)
                if !g.multi && idx > 0 {
                    return None;
                }
                let ch = &g.cfg.channels[idx];
                if ch.cfg.hidden {
                    return None;
                }
                m.channel_name = label_of(ch, g.rt.get(&ch.link.key));
                m.show_tag = show_tag(&g.cfg, ch);
            }
            if m.author.login.is_empty() {
                m.author.login = norm_user(&m.author.name);
            }
            let login = norm_user(&m.author.login);
            // Yasaklı kullanıcı (ayarlar + bu oturumda platformda yasaklananlar)
            if m.platform != Platform::Streamlabs && (g.cfg.banned.contains(&login) || g.session_bans.contains(&(m.platform, login.clone()))) {
                return None;
            }
            // Kayıt: filtrelenmemiş hali
            let line = format!("[{}] {}: {}", platform_tag(&m), m.author.name, m.text);
            g.log(line);
            // Anket oyu (filtrelerden önce; filtrelenen mesaj da oy sayılır)
            let mut is_vote = false;
            if m.kind == Kind::Chat && g.poll.active() {
                match g.poll.vote(m.platform, &login, &m.text) {
                    Vote::Counted(n) => {
                        m.vote = Some(n);
                        is_vote = true;
                        g.dirty_poll = true;
                    }
                    Vote::Repeat(_) => is_vote = true,
                    Vote::No => {}
                }
            }
            if m.platform != Platform::Streamlabs {
                if g.cfg.block_links && (has_link(&m.text) || m.parts.iter().any(|p| matches!(p, Part::Link { .. }))) {
                    return None;
                }
                m.parts = linkify(std::mem::take(&mut m.parts));
                if g.cfg.word_filter && g.words.active() {
                    match g.cfg.word_mode {
                        WordMode::Hide => {
                            if g.words.matches(&m.text) {
                                return None;
                            }
                        }
                        WordMode::Mask => {
                            if g.words.mask_parts(&mut m.parts) {
                                m.masked = true;
                                m.refresh_text();
                            }
                        }
                    }
                }
            }
            if is_vote && g.cfg.hide_votes {
                return None;
            }
            if g.cfg.spam && m.kind == Kind::Chat && g.spam.check(m.platform, &login, &m.text, now, g.cfg.spam_window) {
                return None;
            }
            if g.ring.iter().rev().take(200).any(|x| x.id == m.id) {
                return None; // aynı mesaj
            }
            g.ring.push_back(m.clone());
            while g.ring.len() > RING {
                g.ring.pop_front();
            }
            g.new_msgs.push(m.clone());
            g.dirty_chat = true;
            g.rev += 1;
            Some(m)
        }
    }


    fn mark_deleted(&mut self, pred: impl Fn(&ChatMsg) -> bool) -> usize {
        let mut n = 0;
        for m in self.ring.iter_mut() {
            if !m.deleted && pred(m) {
                m.deleted = true;
                self.new_deleted.push(m.id.clone());
                n += 1;
            }
        }
        if n > 0 {
            self.dirty_chat = true;
            self.rev += 1;
        }
        n
    }
}

fn platform_tag(m: &ChatMsg) -> String {
    if m.show_tag && !m.channel_name.is_empty() {
        format!("{} {}", m.platform.name(), m.channel_name)
    } else {
        m.platform.name().to_string()
    }
}

impl Hub {
    fn new(app: AppHandle, shared: Arc<Shared>) -> Hub {
        Hub { app, shared, st: Mutex::new(Inner { multi: true, alerts_ok: true, ..Default::default() }), hooks: Mutex::new(vec![]), started_once: AtomicBool::new(false) }
    }

    #[allow(dead_code)] // sesli okuma (TTS) modülü kullanacak
    /// Her kabul edilen mesajda çağrılır (ör. sesli okuma). Kanca kilit dışında çağrılır.
    pub fn add_hook(&self, h: Hook) {
        self.hooks.lock().push(h);
    }

    pub fn yt_interval(&self) -> f64 {
        self.st.lock().cfg.yt_interval
    }

    pub fn yt_client_version(&self) -> Option<String> {
        let v = self.st.lock().cfg.yt_client_version.clone();
        (!v.is_empty()).then_some(v)
    }

    // ---- Kanal görevlerinden gelen durumlar ----

    fn with_rt(&self, key: &str, f: impl FnOnce(&mut ChanRt)) {
        let mut g = self.st.lock();
        if !g.tasks.contains_key(key) {
            return; // durdurulmuş görev
        }
        let r = g.rt.entry(key.to_string()).or_default();
        let before = (r.chat, r.live, r.viewers, r.error.clone(), r.name.clone(), r.video.clone());
        f(r);
        let after = (r.chat, r.live, r.viewers, r.error.clone(), r.name.clone(), r.video.clone());
        if before != after {
            g.dirty_status = true;
        }
    }

    pub fn set_chat(&self, key: &str, connected: bool, error: Option<String>) {
        self.with_rt(key, |r| {
            r.chat = connected;
            if connected {
                r.error = None;
            } else if error.is_some() {
                r.error = error;
            }
        });
    }

    pub fn set_live(&self, key: &str, live: bool, viewers: Option<u64>) {
        self.with_rt(key, |r| {
            r.live = Some(live);
            r.viewers = if live { viewers.or(r.viewers) } else { None };
            if live {
                r.error = None;
            }
        });
    }

    pub fn set_name(&self, key: &str, name: &str) {
        self.with_rt(key, |r| r.name = name.trim().to_string());
    }

    pub fn set_video(&self, key: &str, vid: Option<String>) {
        self.with_rt(key, |r| r.video = vid);
    }

    pub fn set_streamlabs(&self, connected: bool, error: Option<String>) {
        let mut g = self.st.lock();
        if g.sl_task.is_none() {
            return;
        }
        if connected {
            g.sl_error = None;
        } else if error.is_some() {
            g.sl_error = error;
        }
        g.sl_connected = connected;
        g.dirty_status = true;
    }

    // ---- Mesaj hattı (MCO update_chat ile aynı sıra) ----

    pub fn ingest(&self, m: ChatMsg) {
        let accepted = {
            let mut g = self.st.lock();
            match g.accept(m, now_s()) {
                Some(m) => m,
                None => return,
            }
        };
        let hooks: Vec<Hook> = self.hooks.lock().clone();
        for h in hooks {
            h(&accepted);
        }
    }

    #[allow(dead_code)]
    /// Uygulamanın kendi bilgi satırı (ör. "Anket başladı")
    pub fn system(&self, text: &str) {
        let seq = {
            let mut g = self.st.lock();
            g.seq += 1;
            g.seq
        };
        let mut m = ChatMsg::new(Platform::System, format!("s{seq}"), Kind::System, model::Author { name: "SRTR Pitwall".into(), login: "srtr".into(), ..Default::default() }, vec![Part::text(text)]);
        m.channel = "system".into();
        self.ingest(m);
    }

    // ---- Silmeler ----

    pub fn delete_ids(&self, platform: Platform, ids: &[String]) {
        let mut g = self.st.lock();
        if !g.cfg.mirror_deletes {
            return;
        }
        g.mark_deleted(|m| m.platform == platform && ids.contains(&m.native_id));
    }

    /// Kullanıcının tüm mesajları (platform yasağı / zaman aşımı). Kalıcı yasak bu oturumda gizli kalır.
    pub fn delete_user(&self, platform: Platform, login: &str, permanent: bool) {
        let login = norm_user(login);
        let mut g = self.st.lock();
        if !g.cfg.mirror_deletes {
            return;
        }
        if permanent {
            g.session_bans.insert((platform, login.clone()));
        }
        g.mark_deleted(|m| m.platform == platform && norm_user(&m.author.login) == login);
    }

    pub fn delete_user_last(&self, platform: Platform, login: &str) {
        let login = norm_user(login);
        let mut g = self.st.lock();
        if !g.cfg.mirror_deletes {
            return;
        }
        let id = g.ring.iter().rev().find(|m| m.platform == platform && !m.deleted && norm_user(&m.author.login) == login).map(|m| m.id.clone());
        if let Some(id) = id {
            g.mark_deleted(|m| m.id == id);
        }
    }

    /// YouTube: yazarın (kanal kimliği) tüm mesajları
    pub fn delete_author_id(&self, platform: Platform, author_id: &str) {
        let mut g = self.st.lock();
        if !g.cfg.mirror_deletes {
            return;
        }
        g.mark_deleted(|m| m.platform == platform && m.author.id == author_id);
    }

    // ---- Altyazı (konuşmadan yazıya; STT modülü buraya yazar) ----

    /// Aynı kaynaktan `captions.secs` saniye içinde gelen cümleler birleştirilir (en fazla 180 karakter)
    pub fn push_caption(&self, src: &str, label: &str, text: &str) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        let mut g = self.st.lock();
        let now = now_ms();
        let secs = g.cfg.caption_secs;
        let line = match g.captions.lines.iter_mut().find(|l| l.src == src) {
            Some(l) => l,
            None => {
                g.captions.lines.push(CaptionLine { src: src.to_string(), ..Default::default() });
                g.captions.lines.last_mut().unwrap()
            }
        };
        if now.saturating_sub(line.ts) < (secs * 1000.0) as u64 && !line.text.is_empty() {
            line.text = format!("{} {}", line.text.trim_start_matches('…'), text);
        } else {
            line.text = text.to_string();
        }
        let n = line.text.chars().count();
        if n > 180 {
            line.text = format!("…{}", line.text.chars().skip(n - 179).collect::<String>());
        }
        line.label = label.to_string();
        line.ts = now;
        // Uzak ses ("remote") önce
        g.captions.lines.sort_by_key(|l| if l.src == "remote" { 0 } else { 1 });
        g.captions.rev += 1;
        g.dirty_captions = true;
        let tag = if label.is_empty() { "SES".to_string() } else { format!("SES {label}") };
        g.log(format!("[{tag}] {text}"));
    }

    pub fn clear_captions(&self) {
        let mut g = self.st.lock();
        g.captions.lines.clear();
        g.captions.rev += 1;
        g.dirty_captions = true;
    }

    // ---- Görünümler ----

    pub fn status(&self) -> LiveChatStatus {
        self.st.lock().status()
    }

    pub fn topic(&self) -> LiveChatTopic {
        self.st.lock().topic()
    }

    pub fn poll_view(&self) -> PollView {
        self.st.lock().poll.view(now_s())
    }

    pub fn captions(&self) -> CaptionView {
        self.st.lock().captions.clone()
    }

    pub fn history(&self, limit: usize) -> Vec<ChatMsg> {
        let g = self.st.lock();
        let skip = g.ring.len().saturating_sub(limit);
        g.ring.iter().skip(skip).cloned().collect()
    }

    // ---- Bağlantıları yönet ----

    /// İstenen kanallarla çalışan görevleri eşitle (eksikleri başlat, fazlaları durdur)
    fn reconcile(self: &Arc<Self>) {
        let multi = allowed(&self.app, "livechat.multi");
        let alerts_ok = allowed(&self.app, "livechat.alerts");
        let mut g = self.st.lock();
        if g.multi != multi || g.alerts_ok != alerts_ok {
            g.dirty_status = true;
        }
        g.multi = multi;
        g.alerts_ok = alerts_ok;
        let desired: Vec<(String, Link)> = if g.running {
            // Ücretsiz: en üstteki kanal + ★ favoriler (favorilerin sadece izleyici sayısı kullanılır; mesajları `accept` atar)
            g.cfg.channels.iter().enumerate().filter(|(i, c)| multi || *i == 0 || c.cfg.mine).map(|(_, c)| (c.link.key.clone(), c.link.clone())).collect()
        } else {
            vec![]
        };
        let stop: Vec<String> = g.tasks.keys().filter(|k| !desired.iter().any(|(d, _)| d == *k)).cloned().collect();
        for k in stop {
            if let Some(hs) = g.tasks.remove(&k) {
                for h in hs {
                    h.abort();
                }
            }
            g.rt.remove(&k);
            g.dirty_status = true;
        }
        for (key, link) in desired {
            if g.tasks.contains_key(&key) {
                continue;
            }
            let ctx = Ctx { hub: self.clone(), key: key.clone(), link: link.clone() };
            let spawn = |f: std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>| tauri::async_runtime::spawn(f);
            let handles = match link.platform {
                Platform::Twitch => vec![spawn(Box::pin(twitch::run_chat(ctx.clone()))), spawn(Box::pin(twitch::run_viewers(ctx)))],
                Platform::Kick => vec![spawn(Box::pin(kick::run_chat(ctx.clone()))), spawn(Box::pin(kick::run_viewers(ctx)))],
                Platform::Youtube => vec![spawn(Box::pin(youtube::run(ctx)))],
                _ => vec![],
            };
            g.tasks.insert(key.clone(), handles);
            g.rt.insert(key, ChanRt::default());
            g.dirty_status = true;
        }
        // Streamlabs
        let want = g.running && g.cfg.streamlabs && alerts_ok && !g.sl_token.is_empty();
        let same = g.sl_task.as_ref().is_some_and(|(t, _)| *t == g.sl_token);
        if !want || !same {
            if let Some((_, h)) = g.sl_task.take() {
                h.abort();
                g.sl_connected = false;
                g.dirty_status = true;
            }
        }
        if want && g.sl_task.is_none() {
            let token = g.sl_token.clone();
            let h = tauri::async_runtime::spawn(streamlabs::run(self.clone(), token.clone()));
            g.sl_task = Some((token, h));
            g.sl_error = None;
            g.dirty_status = true;
        }
    }

    fn set_running(self: &Arc<Self>, on: bool) {
        {
            let mut g = self.st.lock();
            if g.running == on {
                return;
            }
            g.running = on;
            g.dirty_status = true;
            g.dirty_chat = true;
            if !on {
                g.poll.cancel();
                g.dirty_poll = true;
            }
        }
        self.reconcile();
        // Canlı sohbet kısayolları (anket / sesli okuma / altyazı) sadece çalışırken kayıtlı
        crate::refresh_shortcuts(&self.app);
    }

    fn restart(self: &Arc<Self>) {
        {
            let mut g = self.st.lock();
            let keys: Vec<String> = g.tasks.keys().cloned().collect();
            for k in keys {
                if let Some(hs) = g.tasks.remove(&k) {
                    for h in hs {
                        h.abort();
                    }
                }
            }
            g.rt.clear();
            if let Some((_, h)) = g.sl_task.take() {
                h.abort();
            }
            g.sl_connected = false;
            g.dirty_status = true;
        }
        self.reconcile();
    }

    fn apply_cfg(self: &Arc<Self>, cfg: Config) {
        let changed_channels;
        {
            let mut g = self.st.lock();
            if g.cfg == cfg {
                return;
            }
            changed_channels = g.cfg.channels != cfg.channels || g.cfg.streamlabs != cfg.streamlabs;
            if g.cfg.words != cfg.words {
                g.words = WordFilter::new(&cfg.words);
            }
            g.cfg = cfg;
            g.dirty_status = true;
            g.dirty_chat = true;
        }
        if changed_channels {
            self.reconcile();
        }
    }

    // ---- Zamanlayıcı: 100 ms'de bir biriken değişiklikleri yayınla ----

    fn tick(self: &Arc<Self>, n: u64) {
        if n % 30 == 0 {
            // PRO durumu değişmiş olabilir (ücretsiz: tek kanal)
            self.reconcile();
            stt::recheck(&self.app);
        }
        let now = now_s();
        let gen = self.shared.topics_gen.load(Ordering::Relaxed);
        let (msgs, deleted, cleared, status, topic, poll, captions, logs) = {
            let mut g = self.st.lock();
            let force = gen != g.topics_gen;
            g.topics_gen = gen;
            if g.poll.tick(now) {
                g.dirty_poll = true;
            }
            // Geri sayım: anket sürerken saniyede bir
            if g.poll.state == PollState::Active && g.poll.ends_at.is_some() && now - g.poll_pushed_at >= 1.0 {
                g.dirty_poll = true;
            }
            if g.poll.state == PollState::Result && !g.poll.spinning && !g.poll_logged {
                g.poll_logged = true;
                let v = g.poll.view(now);
                let counts = v.counts.iter().enumerate().map(|(i, c)| format!("{}: {c}", i + 1)).collect::<Vec<_>>().join(", ");
                g.log(format!("[ANKET] Sonuç — {} | {counts}", v.result_text));
            }
            let msgs = std::mem::take(&mut g.new_msgs);
            let deleted = std::mem::take(&mut g.new_deleted);
            let cleared = std::mem::replace(&mut g.cleared, false);
            let status = std::mem::replace(&mut g.dirty_status, false).then(|| g.status());
            let chat_dirty = std::mem::replace(&mut g.dirty_chat, false);
            let topic = (chat_dirty || status.is_some() || force).then(|| g.topic());
            let poll_dirty = std::mem::replace(&mut g.dirty_poll, false);
            if poll_dirty {
                g.poll_pushed_at = now;
            }
            let poll = (poll_dirty || force).then(|| g.poll.view(now));
            let captions = (std::mem::replace(&mut g.dirty_captions, false) || force).then(|| g.captions.clone());
            let logs = std::mem::take(&mut g.log_lines);
            (msgs, deleted, cleared, status, topic, poll, captions, logs)
        };
        let app = &self.app;
        if cleared {
            let _ = app.emit("livechat-clear", ());
        }
        if !msgs.is_empty() {
            let _ = app.emit("livechat-message", &msgs);
        }
        if !deleted.is_empty() {
            let _ = app.emit("livechat-delete", serde_json::json!({ "ids": deleted }));
        }
        if let Some(s) = &status {
            let _ = app.emit("livechat-status", s);
        }
        if let Some(t) = topic {
            if let Ok(v) = serde_json::to_value(&t) {
                self.shared.push_topic("livechat", &Packet::Livechat(v));
            }
        }
        if let Some(p) = poll {
            let _ = app.emit("livechat-poll", &p);
            if let Ok(v) = serde_json::to_value(&p) {
                self.shared.push_topic("livepoll", &Packet::Livepoll(v));
            }
        }
        if let Some(c) = captions {
            let _ = app.emit("livechat-captions", &c);
            if let Ok(v) = serde_json::to_value(&c) {
                self.shared.push_topic("captions", &Packet::Captions(v));
            }
        }
        if !logs.is_empty() {
            write_log(app, &logs);
        }
    }
}

// ---------------------------------------------------------------------------
// Kayıt ve gizli bilgiler
// ---------------------------------------------------------------------------

fn logs_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("livechat").join("logs"))
}

/// Günlük dosya: <app_data>/livechat/logs/YYYY-MM-DD.txt, satır: [HH:MM:SS] metin
fn write_log(app: &AppHandle, lines: &[String]) {
    use std::io::Write;
    let Some(dir) = logs_dir(app) else { return };
    let (date, time) = net::local_date_time();
    let _ = std::fs::create_dir_all(&dir);
    // Yeni gün: saklama süresini uygula
    if !dir.join(format!("{date}.txt")).exists() {
        let days = hub(app).st.lock().cfg.log_days;
        chatlog::prune(app, days);
    }
    let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join(format!("{date}.txt"))) else { return };
    let mut buf = String::new();
    for l in lines {
        buf.push_str(&format!("[{time}] {}\n", l.replace(['\r', '\n'], " ")));
    }
    let _ = f.write_all(buf.as_bytes());
}

/// Ayarları Rust'tan değiştir (yasaklı kullanıcı ekle, kayıt aç/kapat…); tüm pencerelere iletilir
fn update_settings(app: &AppHandle, f: impl FnOnce(&mut Value)) {
    let mut v = crate::current_settings(app).unwrap_or_else(|| serde_json::json!({}));
    if !v.is_object() {
        return;
    }
    if v.pointer("/general").is_none() {
        v["general"] = serde_json::json!({});
    }
    if v.pointer("/general/livechat").map_or(true, |x| !x.is_object()) {
        v["general"]["livechat"] = serde_json::json!({});
    }
    f(&mut v["general"]["livechat"]);
    v["updatedAt"] = Value::from(now_ms());
    crate::settings_set(app.clone(), app.state::<crate::SettingsStore>(), v, "livechat".into());
}

// ---------------------------------------------------------------------------
// Kurulum
// ---------------------------------------------------------------------------

pub fn hub(app: &AppHandle) -> Arc<Hub> {
    app.state::<Arc<Hub>>().inner().clone()
}

/// Uygulama açılışında (setup): merkezi kur ve zamanlayıcıyı başlat
pub fn init(app: &AppHandle, shared: Arc<Shared>) {
    let h = Arc::new(Hub::new(app.clone(), shared));
    {
        let mut g = h.st.lock();
        g.sl_token = secrets::get(app, "streamlabsToken");
    }
    app.manage(h.clone());
    tts::init(app, &h);
    stt::init(app);
    tauri::async_runtime::spawn(async move {
        let mut n: u64 = 0;
        let mut iv = tokio::time::interval(Duration::from_millis(100));
        loop {
            iv.tick().await;
            n = n.wrapping_add(1);
            h.tick(n);
        }
    });
}

/// Ayarlar değişince (apply_dynamic)
pub fn apply_settings(app: &AppHandle, value: &Value) {
    let Some(h) = app.try_state::<Arc<Hub>>().map(|s| s.inner().clone()) else { return };
    let cfg = cfg_from_settings(value);
    let auto = cfg.auto_start;
    chatlog::prune(app, cfg.log_days);
    h.apply_cfg(cfg);
    tts::apply_settings(app, value);
    let stt_before = stt::is_enabled(app);
    stt::apply_settings(app, value);
    if stt_before != stt::is_enabled(app) {
        crate::refresh_shortcuts(app);
    }
    // Açılışta bir kez: otomatik başlat
    if !h.started_once.swap(true, Ordering::Relaxed) && auto {
        h.set_running(true);
    }
}

/// Canlı sohbet kısayolları kaydedilsin mi: sohbet çalışıyor ya da altyazı açık
pub fn hotkeys_active(app: &AppHandle) -> bool {
    let running = app.try_state::<Arc<Hub>>().is_some_and(|h| h.st.lock().running);
    running || stt::is_enabled(app)
}

/// Panele kısa bilgi ("livechat-notice"; kısayollar için)
pub fn notice(app: &AppHandle, text: &str) {
    let _ = app.emit("livechat-notice", serde_json::json!({ "text": text }));
}

/// Kısayol onayı: açılınca iki tiz, kapanınca bir pes bip
pub fn beep_onoff(on: bool) {
    let beeps: &'static [f32] = if on { &[880.0, 1320.0] } else { &[440.0] };
    std::thread::spawn(move || {
        for (i, f) in beeps.iter().enumerate() {
            if i > 0 {
                std::thread::sleep(Duration::from_millis(140));
            }
            crate::audio::send(crate::audio::Cmd::Beep { freq: *f, ms: 110, volume: 0.45, pan: 0.0 });
        }
    });
}

/// Kısayol (varsayılan Ctrl+Shift+C): canlı sohbeti başlat / durdur. Her zaman kayıtlıdır
/// ("Otomatik başlat" kapalıyken sohbeti panele girmeden açmak için).
pub fn hotkey_chat(app: &AppHandle) {
    let h = hub(app);
    let (running, n) = {
        let g = h.st.lock();
        (g.running, g.cfg.channels.len())
    };
    let err = |text: &str| {
        crate::audio::send(crate::audio::Cmd::Beep { freq: 300.0, ms: 160, volume: 0.5, pan: 0.0 });
        notice(app, text);
        let _ = app.emit("livechat-toggled", serde_json::json!({ "on": false, "error": true }));
    };
    if running {
        h.set_running(false);
        beep_onoff(false);
        notice(app, "Canlı sohbet durduruldu");
        let _ = app.emit("livechat-toggled", serde_json::json!({ "on": false, "error": false }));
    } else if n == 0 {
        err("Önce Kanallar'dan en az bir kanal ekle");
    } else {
        h.started_once.store(true, Ordering::Relaxed);
        h.set_running(true);
        beep_onoff(true);
        notice(app, "Canlı sohbet başlatıldı");
        let _ = app.emit("livechat-toggled", serde_json::json!({ "on": true, "error": false }));
    }
}

/// Kısayol: anket aç / bitir. Sürerken bitirir (sonuç gösterilir); yoksa ayarlardaki şık sayısı ve süreyle hızlı anket açar.
pub fn hotkey_poll(app: &AppHandle) {
    if !allowed(app, "livechat.poll") {
        crate::audio::send(crate::audio::Cmd::Beep { freq: 300.0, ms: 160, volume: 0.5, pan: 0.0 });
        notice(app, "Sohbet anketi PRO üyelere özel");
        return;
    }
    let h = hub(app);
    let active = h.st.lock().poll.active();
    if active {
        livechat_poll_stop(app.clone());
        beep_onoff(false);
        notice(app, "Anket bitirildi");
    } else {
        match livechat_poll_start(app.clone(), None, None, None, None) {
            Ok(_) => {
                beep_onoff(true);
                notice(app, "Anket başladı");
            }
            Err(e) => {
                crate::audio::send(crate::audio::Cmd::Beep { freq: 300.0, ms: 160, volume: 0.5, pan: 0.0 });
                notice(app, &e);
            }
        }
    }
}

/// Web sunucusu (OBS) için tüm durum
pub fn state_json(app: &AppHandle) -> Value {
    let Some(h) = app.try_state::<Arc<Hub>>().map(|s| s.inner().clone()) else { return Value::Null };
    serde_json::json!({ "chat": h.topic(), "poll": h.poll_view(), "captions": h.captions() })
}

// ---------------------------------------------------------------------------
// Tauri komutları
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn livechat_start(app: AppHandle) -> LiveChatStatus {
    let h = hub(&app);
    h.started_once.store(true, Ordering::Relaxed);
    h.set_running(true);
    h.status()
}

#[tauri::command]
pub fn livechat_stop(app: AppHandle) -> LiveChatStatus {
    let h = hub(&app);
    h.set_running(false);
    h.status()
}

#[tauri::command]
pub fn livechat_restart(app: AppHandle) -> LiveChatStatus {
    let h = hub(&app);
    h.restart();
    h.status()
}

#[tauri::command]
pub fn livechat_status(app: AppHandle) -> LiveChatStatus {
    hub(&app).status()
}

#[derive(Serialize)]
pub struct ParsedLinks {
    pub valid: Vec<Link>,
    pub invalid: Vec<String>,
}

/// Serbest metindeki linkleri tanır (kanal ekleme kutusu için)
#[tauri::command]
pub fn livechat_parse_links(text: String) -> ParsedLinks {
    let (valid, invalid) = links::parse_many(&text);
    ParsedLinks { valid, invalid }
}

/// Kanal listesini ayarlara yazar (sıra önemli: ücretsizde sadece ilki bağlanır). Tanınmayan / tekrar eden linkler atılır.
#[tauri::command]
pub fn livechat_channels_set(app: AppHandle, channels: Vec<ChannelIn>) -> Result<Vec<ChannelStatus>, String> {
    let mut seen = HashSet::new();
    let mut list = Vec::new();
    for mut c in channels {
        let Some(l) = links::parse_link(&c.url) else { continue };
        if !seen.insert(l.key.clone()) {
            continue;
        }
        c.url = l.url;
        c.name = c.name.trim().chars().take(40).collect();
        list.push(c);
    }
    // Platform başına tek "benim kanalım"
    let mut mine_seen = HashSet::new();
    for c in list.iter_mut() {
        if c.mine {
            let p = links::parse_link(&c.url).map(|l| l.platform);
            if !mine_seen.insert(p) {
                c.mine = false;
            }
        }
    }
    let v = serde_json::to_value(&list).map_err(|e| e.to_string())?;
    update_settings(&app, |lc| lc["channels"] = v);
    Ok(hub(&app).status().channels)
}

#[tauri::command]
pub fn livechat_history(app: AppHandle, limit: Option<usize>) -> Vec<ChatMsg> {
    hub(&app).history(limit.unwrap_or(100).clamp(1, RING))
}

/// Tüm durum (sohbet konusu + anket + altyazı)
#[tauri::command]
pub fn livechat_state(app: AppHandle) -> Value {
    state_json(&app)
}

#[tauri::command]
pub fn livechat_poll_start(
    app: AppHandle,
    options: Option<u8>,
    duration: Option<f64>,
    question: Option<String>,
    answers: Option<Vec<String>>,
) -> Result<PollView, String> {
    if !allowed(&app, "livechat.poll") {
        return Err("Sohbet anketi PRO üyelere özel".into());
    }
    let h = hub(&app);
    let now = now_s();
    let view = {
        let mut g = h.st.lock();
        if !g.running {
            return Err("Önce canlı sohbeti başlatın".into());
        }
        let n = options.unwrap_or(g.cfg.poll_options).clamp(2, 9);
        let dur = duration.unwrap_or(g.cfg.poll_duration).max(0.0);
        let res = g.cfg.poll_result;
        let answers = answers.unwrap_or_default();
        let q = question.unwrap_or_default();
        g.poll.start(n, dur, &q, &answers, res, now);
        g.poll_logged = false;
        g.dirty_poll = true;
        let desc = g.poll.answers.iter().enumerate().filter(|(_, a)| !a.is_empty()).map(|(i, a)| format!("{}={a}", i + 1)).collect::<Vec<_>>().join(", ");
        let mut line = format!("[ANKET] Başladı — {n} şık, {}", if dur > 0.0 { format!("{} sn", dur.round()) } else { "süresiz".into() });
        if !g.poll.question.is_empty() {
            line += &format!(" — Soru: {}", g.poll.question);
        }
        if !desc.is_empty() {
            line += &format!(" — {desc}");
        }
        g.log(line);
        g.poll.view(now)
    };
    Ok(view)
}

/// Anketi şimdi bitir (sonuç gösterilir; beraberlikte rastgele seçim animasyonu)
#[tauri::command]
pub fn livechat_poll_stop(app: AppHandle) -> PollView {
    let h = hub(&app);
    let mut g = h.st.lock();
    let now = now_s();
    g.poll.finish(now);
    g.dirty_poll = true;
    g.poll.view(now)
}

/// Anketi iptal et / sonucu kapat
#[tauri::command]
pub fn livechat_poll_reset(app: AppHandle) -> PollView {
    let h = hub(&app);
    let mut g = h.st.lock();
    g.poll.cancel();
    g.dirty_poll = true;
    g.poll.view(now_s())
}

#[tauri::command]
pub fn livechat_poll_get(app: AppHandle) -> PollView {
    hub(&app).poll_view()
}

/// Kullanıcıyı kalıcı olarak engelle (ayarlardaki yasak listesine eklenir, mesajları silinir)
#[tauri::command]
pub fn livechat_ban_user(app: AppHandle, user: String, platform: Option<String>) {
    let login = norm_user(&user);
    if login.is_empty() {
        return;
    }
    let p = platform.as_deref().and_then(Platform::parse);
    {
        let h = hub(&app);
        let mut g = h.st.lock();
        g.cfg.banned.insert(login.clone());
        g.mark_deleted(|m| p.map_or(true, |p| m.platform == p) && norm_user(&m.author.login) == login);
        g.log(format!("[MOD] {login} engellendi"));
    }
    update_settings(&app, |lc| {
        let mut list: Vec<String> = match lc.pointer("/moderation/banned") {
            Some(Value::Array(a)) => a.iter().filter_map(|x| x.as_str()).map(String::from).collect(),
            Some(Value::String(s)) => s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect(),
            _ => vec![],
        };
        if !list.iter().any(|x| norm_user(x) == login) {
            list.push(login.clone());
        }
        if !lc.get("moderation").is_some_and(|m| m.is_object()) {
            lc["moderation"] = serde_json::json!({});
        }
        lc["moderation"]["banned"] = serde_json::json!(list);
    });
}

#[tauri::command]
pub fn livechat_unban_user(app: AppHandle, user: String) {
    let login = norm_user(&user);
    {
        let h = hub(&app);
        let mut g = h.st.lock();
        g.cfg.banned.remove(&login);
        g.session_bans.retain(|(_, l)| *l != login);
    }
    update_settings(&app, |lc| {
        if let Some(Value::Array(a)) = lc.pointer_mut("/moderation/banned") {
            a.retain(|x| x.as_str().map(norm_user) != Some(login.clone()));
        }
    });
}

/// Tek mesajı gizle (sadece bu uygulamada)
#[tauri::command]
pub fn livechat_hide_message(app: AppHandle, id: String) {
    hub(&app).st.lock().mark_deleted(|m| m.id == id);
}

/// Sohbeti temizle (geçmiş silinir; kayıt dosyası etkilenmez)
#[tauri::command]
pub fn livechat_clear(app: AppHandle) {
    let h = hub(&app);
    let mut g = h.st.lock();
    g.ring.clear();
    g.new_msgs.clear();
    g.spam.clear();
    g.cleared = true;
    g.dirty_chat = true;
    g.rev += 1;
}

/// Günlük sohbet kaydını aç/kapat (ayara yazılır)
#[tauri::command]
pub fn livechat_log_set(app: AppHandle, on: bool) {
    update_settings(&app, |lc| lc["log"] = Value::Bool(on));
}

#[tauri::command]
pub fn livechat_log_open_dir(app: AppHandle) -> Result<String, String> {
    let d = logs_dir(&app).ok_or("klasör yok")?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    crate::open_path(&d)?;
    Ok(d.to_string_lossy().into_owned())
}

/// Streamlabs Socket API Token'ı kaydet (boş: sil). Anahtar geri okunamaz; sadece var/yok bilgisi döner.
#[tauri::command]
pub fn livechat_streamlabs_token_set(app: AppHandle, token: String) -> Result<SlStatus, String> {
    let t = token.trim().to_string();
    if t.len() > 4096 {
        return Err("Anahtar çok uzun".into());
    }
    secrets::set(&app, "streamlabsToken", &t)?;
    let h = hub(&app);
    {
        let mut g = h.st.lock();
        g.sl_token = t;
        g.sl_error = None;
        g.dirty_status = true;
    }
    h.reconcile();
    let s = h.st.lock().sl_status();
    Ok(s)
}

#[tauri::command]
pub fn livechat_streamlabs_status(app: AppHandle) -> SlStatus {
    hub(&app).st.lock().sl_status()
}

/// Altyazı satırı ekle (konuşmadan yazıya modülü ve test için). src: "mic" | "remote"
#[tauri::command]
pub fn livechat_caption_push(app: AppHandle, src: String, label: Option<String>, text: String) {
    let src = if src == "remote" { "remote" } else { "mic" };
    hub(&app).push_caption(src, label.as_deref().unwrap_or(""), &text);
}

#[tauri::command]
pub fn livechat_caption_clear(app: AppHandle) {
    hub(&app).clear_captions();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_json() -> Value {
        serde_json::json!({ "general": { "livechat": {
            "autoStart": true,
            "channels": [
                { "url": "https://www.twitch.tv/Erkin", "mine": true },
                { "url": "https://kick.com/erkin", "hidden": true, "tag": true, "name": "Kick Ana" },
                { "url": "twitch.tv/erkin" },
                { "url": "bozuk" },
                { "url": "https://www.twitch.tv/ikinci" }
            ],
            "ytInterval": 0.2,
            "moderation": { "banned": ["@Kotu", "Spam "], "wordFilter": true, "words": "a*", "wordMode": "hide", "spamWindow": 5 },
            "poll": { "options": 12, "duration": 30 },
            "log": true
        }}})
    }

    #[test]
    fn settings_parse() {
        let c = cfg_from_settings(&cfg_json());
        assert!(c.auto_start);
        assert_eq!(c.channels.len(), 3); // tekrar ve bozuk atıldı
        assert_eq!(c.channels[0].link.key, "twitch:erkin");
        assert!(c.channels[0].cfg.mine);
        assert!(c.channels[1].cfg.hidden);
        assert_eq!(c.yt_interval, 1.0);
        assert!(c.banned.contains("kotu") && c.banned.contains("spam"));
        assert_eq!(c.word_mode, WordMode::Hide);
        assert_eq!(c.poll_options, 9);
        assert!(c.log);
        assert!(show_tag(&c, &c.channels[0])); // iki Twitch kanalı → otomatik etiket
        assert!(show_tag(&c, &c.channels[1])); // elle açık
        assert_eq!(label_of(&c.channels[1], None), "Kick Ana");
        let d = cfg_from_settings(&serde_json::json!({}));
        assert_eq!(d, Config::default());
    }

    #[test]
    fn status_view_and_viewers() {
        let mut g = Inner { running: true, multi: false, alerts_ok: true, cfg: cfg_from_settings(&cfg_json()), ..Default::default() };
        g.rt.insert("twitch:erkin".into(), ChanRt { chat: true, live: Some(true), viewers: Some(10), ..Default::default() });
        let v = g.channels_view();
        assert_eq!(v[0].state, State::Live);
        assert_eq!(v[1].state, State::Locked); // ücretsiz: sadece ilk kanal
        assert_eq!(v[2].state, State::Locked);
        g.multi = true;
        g.rt.insert("twitch:ikinci".into(), ChanRt { chat: true, live: Some(true), viewers: Some(5), ..Default::default() });
        g.rt.insert("kick:erkin".into(), ChanRt { chat: false, error: Some("x".into()), ..Default::default() });
        let v = g.channels_view();
        assert_eq!(v[1].state, State::Error);
        let w = g.viewers(&v);
        // "benim kanalım" canlıysa sadece o
        assert_eq!(w.twitch, Some(10));
        assert_eq!(w.kick, None);
        assert_eq!(w.total, Some(10));
        g.cfg.channels[0].cfg.mine = false;
        let v = g.channels_view();
        assert_eq!(g.viewers(&v).twitch, Some(15));
        g.running = false;
        assert_eq!(g.channels_view()[0].state, State::Idle);
    }

    fn chat(platform: Platform, channel: &str, id: &str, user: &str, text: &str) -> ChatMsg {
        let mut m = ChatMsg::new(platform, id, Kind::Chat, model::Author { name: user.into(), login: user.to_lowercase(), ..Default::default() }, vec![Part::text(text)]);
        m.channel = channel.into();
        m
    }

    #[test]
    fn pipeline() {
        let mut v = cfg_json();
        v["general"]["livechat"]["moderation"]["wordMode"] = "mask".into();
        v["general"]["livechat"]["moderation"]["words"] = "kötü, salak*".into();
        let cfg = cfg_from_settings(&v);
        let mut g = Inner { running: true, multi: true, words: WordFilter::new(&cfg.words), cfg, ..Default::default() };
        // Etiket ve kanal adı
        let m = g.accept(chat(Platform::Twitch, "twitch:erkin", "1", "Ali", "selam"), 0.0).unwrap();
        assert!(m.show_tag);
        assert_eq!(m.channel_name, "Erkin");
        // Gizli (göz kapalı) ve listede olmayan kanal
        assert!(g.accept(chat(Platform::Kick, "kick:erkin", "2", "Ali", "x"), 0.0).is_none());
        assert!(g.accept(chat(Platform::Twitch, "twitch:yok", "3", "Ali", "x"), 0.0).is_none());
        // Yasaklı
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "4", "KOTU", "x"), 0.0).is_none());
        // Kelime filtresi (yıldızla)
        let m = g.accept(chat(Platform::Twitch, "twitch:erkin", "5", "Veli", "çok kötü salaklık"), 0.0).unwrap();
        assert!(m.masked);
        assert_eq!(m.text, "çok k*** s*******");
        // Tekrar (spam) filtresi: 5 sn
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "6", "Veli", "çok kötü salaklık"), 1.0).is_none());
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "7", "Veli", "çok kötü salaklık"), 20.0).is_some());
        // Aynı kimlik iki kez gelmez
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "1", "Ali", "başka"), 30.0).is_none());
        // Bağlantılar parçalara ayrılır; engel açıksa mesaj düşer
        let m = g.accept(chat(Platform::Twitch, "twitch:erkin", "8", "Can", "bak simracetr.com"), 31.0).unwrap();
        assert!(m.parts.iter().any(|p| matches!(p, Part::Link { .. })));
        g.cfg.block_links = true;
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "9", "Can", "bak www.x.org"), 32.0).is_none());
        // Anket: oy sayılır, istenirse gizlenir
        g.poll.start(3, 60.0, "", &[], 15.0, 40.0);
        let m = g.accept(chat(Platform::Twitch, "twitch:erkin", "10", "Oy1", "2"), 41.0).unwrap();
        assert_eq!(m.vote, Some(2));
        g.cfg.hide_votes = true;
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "11", "Oy2", "#3"), 42.0).is_none());
        assert_eq!(g.poll.counts, vec![0, 1, 1]);
        // Gizli kanaldan oy sayılmaz
        g.accept(chat(Platform::Kick, "kick:erkin", "12", "Oy3", "1"), 43.0);
        assert_eq!(g.poll.counts, vec![0, 1, 1]);
        // Kayıt satırları (filtrelenmemiş)
        assert!(g.log_lines.iter().any(|l| l == "[Twitch Erkin] Veli: çok kötü salaklık"));
        // Silme: tek mesaj ve kullanıcının tümü
        assert_eq!(g.mark_deleted(|m| m.native_id == "5"), 1);
        assert_eq!(g.mark_deleted(|m| m.author.login == "veli"), 1);
        assert_eq!(g.new_deleted, vec!["twitch:5".to_string(), "twitch:7".to_string()]);
        // Durmuşken mesaj alınmaz
        g.running = false;
        assert!(g.accept(chat(Platform::Twitch, "twitch:erkin", "99", "Ali", "x"), 50.0).is_none());
    }
}
