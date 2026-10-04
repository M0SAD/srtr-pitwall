//! Telemetri iş parçacığı ve abonelik tabanlı veri yayını.
//!
//! - Tek bir arka plan iş parçacığı iRacing'i (ya da demo'yu) okur.
//! - Her abone (overlay penceresi, Pitwall/Live Timing pencereleri, OBS tarayıcı kaynakları)
//!   hangi konulara hangi sıklıkta abone olduğunu bildirir.
//! - Sadece abone olunan konular, sadece istenen sıklıkta hesaplanır ve gönderilir.

use crate::calc;
use crate::demo::Demo;
use crate::model::{Frame, SessionData};
use crate::trackmap::TrackMap;
use crate::tracker::Tracker;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Clone)]
#[serde(tag = "t", content = "d", rename_all = "camelCase")]
pub enum Packet {
    Status(calc::Status),
    Inputs(calc::Inputs),
    Ers(calc::Ers),
    Telemetry(calc::Telemetry),
    Delta(calc::Delta),
    Radar(calc::Radar),
    Relative(calc::Relative),
    Standings(calc::Standings),
    Fuel(calc::Fuel),
    Session(calc::Session),
    Weather(calc::Weather),
    Map(calc::MapData),
    RaceControl(calc::RaceControl),
    Tires(calc::Tires),
    Team(crate::mqtt::Team),
    Entries(crate::league::Entries),
    Laps(crate::history::Laps),
    Incidents(crate::history::Incidents),
    Pit(crate::extras::Pit),
    Corners(crate::history::Corners),
    Sectors(crate::timing::Sectors),
    Gaps(crate::timing::Gaps),
    Traffic(crate::extras::Traffic),
    /// Fren / vites işareti, pist limiti, hasar (bkz. drivecues.rs)
    Brakepoint(crate::drivecues::Brakepoint),
    Tracklimits(crate::drivecues::TrackLimits),
    Damage(crate::drivecues::DamagePkt),
    Strategy(crate::strategy::StrategyPacket),
    /// Sadece tarayıcı kaynakları: ayarlar değişti
    Settings(serde_json::Value),
    /// Sadece tarayıcı kaynakları: panelde / düzenleme modunda sürüklenen overlay'in anlık konumu (canlı taşıma)
    Drag(serde_json::Value),
    /// Canlı sohbet (bkz. livechat): son mesajlar + kanal durumları. Olay tabanlı (`Shared::push_topic`)
    Livechat(serde_json::Value),
    /// Canlı sohbet anketi
    Livepoll(serde_json::Value),
    /// Altyazı (konuşmadan yazıya)
    Captions(serde_json::Value),
    /// Sesli mühendis altyazısı (bkz. voicesub): kim konuşuyor, ne diyor
    Voice(serde_json::Value),
}

#[derive(Deserialize, Debug, Clone)]
pub struct TopicReq {
    pub name: String,
    pub hz: f32,
}

struct Topic {
    name: String,
    interval: Duration,
    next: Instant,
}

pub enum Sink {
    /// Uygulama penceresi (Tauri kanalı)
    Channel(Channel<Packet>),
    /// Tarayıcı kaynağı (SSE); JSON metni gönderilir
    Sse(Sender<String>),
    /// MQTT istemcisi: her konu `<önek>/<konu>` başlığına yayınlanır
    Mqtt { client: rumqttc::Client, prefix: String },
}

struct Subscriber {
    id: u64,
    sink: Sink,
    topics: Vec<Topic>,
    /// Bu aboneye gönderilen son pist şekli sürümü
    map_version: u32,
    status_key: (bool, bool, bool, bool),
}

impl Subscriber {
    /// `send` ile aynı; tarayıcı kaynakları (SSE) için JSON metni `json` içinde saklanır ve aynı karede
    /// aynı paketi alan diğer SSE abonelerinde yeniden üretilmez (çıktı birebir aynıdır).
    fn send_cached(&self, p: &Packet, json: &mut Option<String>) -> bool {
        match &self.sink {
            Sink::Sse(tx) => {
                if json.is_none() {
                    *json = serde_json::to_string(p).ok();
                }
                match json {
                    Some(s) => tx.send(s.clone()).is_ok(),
                    None => true,
                }
            }
            _ => self.send(p),
        }
    }

    fn send(&self, p: &Packet) -> bool {
        match &self.sink {
            Sink::Channel(c) => c.send(p.clone()).is_ok(),
            Sink::Sse(tx) => match serde_json::to_string(p) {
                Ok(s) => tx.send(s).is_ok(),
                Err(_) => true,
            },
            Sink::Mqtt { client, prefix } => {
                if let Ok(serde_json::Value::Object(mut o)) = serde_json::to_value(p) {
                    let t = o.get("t").and_then(|t| t.as_str()).unwrap_or("x").to_string();
                    let d = o.remove("d").unwrap_or(serde_json::Value::Null);
                    if let Ok(payload) = serde_json::to_vec(&d) {
                        let _ = client.try_publish(format!("{prefix}/{t}"), rumqttc::QoS::AtMostOnce, false, payload);
                    }
                }
                true
            }
        }
    }
}

#[derive(Default)]
pub struct Shared {
    pub demo: AtomicBool,
    pub connected: AtomicBool,
    pub edit_mode: AtomicBool,
    pub user_hidden: AtomicBool,
    /// Paneldeki düzen editörü açık: iRacing yoksa önizleme için demo verisi üret
    pub preview: AtomicBool,
    /// En az bir overlay "iRacing kapalıyken de göster" ayarında
    pub always_show: AtomicBool,
    /// Ses ayarları değişti: (ses, bipler, izin verildi mi)
    pub voice_cfg: Mutex<Option<(crate::voice::VoiceCfg, crate::voice::SoundsCfg, bool)>>,
    pub voice_active: AtomicBool,
    /// Sesli mühendis kısayolla açılıp kapatıldı: onayı kısayol kendisi çaldı, motor tekrar söylemesin
    pub voice_skip_ack: AtomicBool,
    subs: Mutex<Vec<Subscriber>>,
    next_id: AtomicU64,
    /// Haritayı unut isteği (arayüzden)
    pub forget_map: AtomicBool,
    pub mqtt: crate::mqtt::MqttShared,
    /// League Builder: etkin lig yapılandırması ve değişiklik sayacı
    pub league: Mutex<Option<crate::league::LeagueConfig>>,
    pub league_ver: AtomicU64,
    /// Oturum kayıtları: (özet yaz, en fazla kaç kayıt tutulur)
    pub history_cfg: Mutex<(bool, u32)>,
    /// Kayıtlar klasörü
    pub sessions_dir: Mutex<Option<std::path::PathBuf>>,
    /// Ekran görüntüsü bilgisi: (pist, araç)
    pub shot_meta: Mutex<(String, String)>,
    /// Yeni eklenen overlay kısa süre gösteriliyor (overlay'ler gizli olsa bile)
    pub peek: AtomicBool,
    /// Demo açıkken sesli spotter/bipler sussun
    pub demo_mute: AtomicBool,
    pub peek_gen: AtomicU64,
    /// Overlay'ler sayfasında yeni eklenen overlay: kullanıcı sayfadayken ekranda (örnek veriyle) tutulur
    pub pin: Mutex<Option<String>>,
    /// Önizleme donduruldu: örnek veri birkaç saniye oynadıktan sonra demo saati durur, görüntü sabit kalır.
    /// Sadece önizleme verisini etkiler; kullanıcının açtığı Demo ve canlı sim verisi hiç donmaz.
    pub preview_frozen: AtomicBool,
    /// Olaylar ekranı: oturumun olay listesi (bkz. events.rs)
    pub events: Mutex<crate::events::EventLog>,
    /// Abonelikler her değiştiğinde artar: olay tabanlı konular (canlı sohbet) yeni aboneye anlık görüntüyü yeniden gönderir
    pub topics_gen: AtomicU64,
    /// Canlı Sohbet overlay kapısı (livechat/mod.rs günceller): `status` konusuyla her aboneye — OBS dahil — gider
    pub live_gate: Mutex<crate::livechat::LiveGate>,
}

const KNOWN: &[&str] = &[
    "status",
    "inputs",
    "ers",
    "telemetry",
    "delta",
    "radar",
    "relative",
    "standings",
    "fuel",
    "session",
    "weather",
    "map",
    "raceControl",
    "tires",
    "team",
    "entries",
    "laps",
    "incidents",
    "pit",
    "traffic",
    "strategy",
    "corners",
    "sectors",
    "gaps",
    "brakepoint",
    "tracklimits",
    "damage",
    "livechat",
    "livepoll",
    "captions",
    "voice",
];

/// Telemetri döngüsünde hesaplanmayan, değişince kendi modülünün gönderdiği konular
/// (canlı sohbet, sesli mühendis altyazısı; iRacing bağlı olmasa da akar). Bkz. `Shared::push_topic`.
pub const PUSHED: [&str; 4] = ["livechat", "livepoll", "captions", "voice"];
/// `PUSHED` içinde canlı sohbete ait olanlar (tarayıcı kaynağında PRO: livechat.obs)
pub const LIVECHAT_TOPICS: [&str; 3] = ["livechat", "livepoll", "captions"];

fn build_topics(reqs: &[TopicReq]) -> Vec<Topic> {
    let now = Instant::now();
    let mut out: Vec<Topic> = Vec::new();
    // Durum her zaman gönderilir
    out.push(Topic { name: "status".into(), interval: Duration::from_millis(500), next: now });
    for r in reqs {
        if !KNOWN.contains(&r.name.as_str()) || r.name == "status" {
            continue;
        }
        // NaN `clamp`ten NaN çıkar ve Duration::from_secs_f32 panic yapar (ör. tarayıcı kaynağı adresinde "fuel:nan")
        let hz = if r.hz.is_finite() { r.hz.clamp(0.5, 60.0) } else { 5.0 };
        let interval = Duration::from_secs_f32(1.0 / hz);
        match out.iter_mut().find(|t| t.name == r.name) {
            // Aynı konuya birden fazla overlay abone olursa en yüksek sıklık kazanır
            Some(t) if interval < t.interval => t.interval = interval,
            Some(_) => {}
            None => out.push(Topic { name: r.name.clone(), interval, next: now }),
        }
    }
    out
}

impl Shared {
    /// Yeni abone ekler, kimliğini döner.
    pub fn subscribe(&self, sink: Sink, reqs: &[TopicReq]) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        self.subs.lock().push(Subscriber {
            id,
            sink,
            topics: build_topics(reqs),
            map_version: u32::MAX,
            status_key: (false, false, false, true),
        });
        self.topics_gen.fetch_add(1, Ordering::Relaxed);
        id
    }

    pub fn set_topics(&self, id: u64, reqs: &[TopicReq]) {
        if let Some(s) = self.subs.lock().iter_mut().find(|s| s.id == id) {
            s.topics = build_topics(reqs);
            s.map_version = u32::MAX;
        }
        self.topics_gen.fetch_add(1, Ordering::Relaxed);
    }

    /// Olay tabanlı bir konuyu (bkz. `PUSHED`) bu konuya abone olan herkese hemen gönderir.
    /// Kapanmış aboneler listeden çıkarılır.
    pub fn push_topic(&self, name: &str, p: &Packet) {
        let mut subs = self.subs.lock();
        subs.retain(|s| !s.topics.iter().any(|t| t.name == name) || s.send(p));
    }

    pub fn set_league(&self, cfg: Option<crate::league::LeagueConfig>) {
        *self.league.lock() = cfg;
        self.league_ver.fetch_add(1, Ordering::Relaxed);
    }

    pub fn unsubscribe(&self, id: u64) {
        self.subs.lock().retain(|s| s.id != id);
    }

    /// Canlı taşıma konumunu ("overlay-live-drag" olayı) tarayıcı kaynaklarına (OBS sayfası) iletir.
    pub fn broadcast_drag(&self, value: serde_json::Value) {
        let p = Packet::Drag(value);
        let mut subs = self.subs.lock();
        subs.retain(|s| match &s.sink {
            Sink::Sse(_) => s.send(&p),
            Sink::Channel(_) | Sink::Mqtt { .. } => true,
        });
    }

    /// Ayar değişikliğini tarayıcı kaynaklarına iletir.
    pub fn broadcast_settings(&self, value: &serde_json::Value) {
        let p = Packet::Settings(value.clone());
        let mut subs = self.subs.lock();
        subs.retain(|s| match &s.sink {
            Sink::Sse(_) => s.send(&p),
            Sink::Channel(_) | Sink::Mqtt { .. } => true,
        });
    }
}

pub fn spawn(app: AppHandle, shared: Arc<Shared>) {
    std::thread::Builder::new()
        .name("telemetry".into())
        .spawn(move || crate::crashlog::supervise("telemetry", || run(app.clone(), shared.clone())))
        .expect("telemetri iş parçacığı başlatılamadı");
}

/// Oturum başına tutulan tüm durum
struct State {
    frame: Frame,
    /// iRacing'den (ya da demodan) gelen oturum
    raw: SessionData,
    /// Overlay'lerin gördüğü oturum (League Builder uygulanmış)
    session: SessionData,
    league_active: bool,
    league_ver: u64,
    tracker: Tracker,
    map: TrackMap,
    history: crate::history::History,
    /// Sektör süreleri ve tur bazlı fark geçmişi (bkz. timing.rs)
    timing: crate::timing::Timing,
    /// Bağlı sim kısa adı (`status.sim`), bağlı değilse boş
    sim: &'static str,
    /// Telemetri kaydı (tur özetleri + izler), bkz. laprec.rs
    laprec: crate::laprec::Recorder,
    /// Fren noktası referansı + pist limiti sayaçları, bkz. drivecues.rs
    cues: crate::drivecues::Cues,
    /// Stint / takım sürücüsü / pit kaybı takibi (`strategy` konusu), bkz. strategy.rs
    strategy: crate::strategy::Strategy,
}

/// Tamamlanan turu arka planda yerel kuyruğa yazar ve arayüze haber verir (yükleme JS tarafında).
fn save_lap(app: &AppHandle, dir: Option<&std::path::Path>, lap: crate::laprec::LapRecord) {
    let Some(dir) = dir.map(|d| d.to_path_buf()) else { return };
    let app = app.clone();
    std::thread::spawn(move || {
        let path = crate::laprec::queue_path(&dir);
        if let Err(e) = crate::laprec::append(&path, &lap) {
            eprintln!("tur kaydı yazılamadı: {e}");
            return;
        }
        use tauri::Emitter;
        let _ = app.emit(
            "telemetry-lap",
            serde_json::json!({ "id": lap.id, "lap": lap.lap, "time": lap.lap_time, "valid": lap.valid, "sim": lap.sim }),
        );
    });
}

/// Bitmiş oturum kaydını arka planda diske yazar.
fn save_record(shared: &Shared, rec: Option<crate::history::SessionRecord>) {
    let Some(rec) = rec else { return };
    let Some(dir) = shared.sessions_dir.lock().clone() else { return };
    let (summary, keep) = *shared.history_cfg.lock();
    std::thread::spawn(move || {
        if let Err(e) = crate::history::save(&dir, &rec, summary) {
            eprintln!("oturum kaydı yazılamadı: {e}");
        }
        if keep > 0 {
            crate::history::prune(&dir, 0, keep as usize, false);
        }
    });
}

fn run(app: AppHandle, shared: Arc<Shared>) {
    let map_dir = app.path().app_data_dir().ok();
    *shared.sessions_dir.lock() = map_dir.as_ref().map(|d| crate::history::dir(d));
    let mut st = State {
        frame: Frame::default(),
        raw: SessionData::default(),
        session: SessionData::default(),
        league_active: false,
        league_ver: u64::MAX,
        tracker: Tracker::default(),
        map: TrackMap::new(map_dir.clone()),
        history: Default::default(),
        timing: Default::default(),
        sim: "",
        laprec: Default::default(),
        cues: Default::default(),
        strategy: crate::strategy::Strategy::new(map_dir.clone()),
    };
    let app_data = map_dir.clone();
    // Telemetri kaydı ayarı (general.telemetryRecord, varsayılan açık); saniyede bir okunur
    let mut rec_enabled = true;
    let mut last_rec_check = crate::crashlog::past(10);
    let mut demo: Option<Demo> = None;
    let mut last_demo_step = Instant::now();
    let mut was_connected = false;
    let mut last_team = Instant::now();
    let mut voice = crate::voice::Voice::default();
    // Tekrar izleme başladı mı (Olaylar penceresini bir kez açmak için)
    let mut was_replay = false;
    // Olaylar penceresine son bildirilen liste sürümü ve kayıt ayarının son okunma anı
    let mut events_rev = 0u64;
    let mut last_events_cfg = crate::crashlog::past(10);

    // Canlı sim bağlantısı (iRacing, ACC/AC, LMU/rF2, AMS2). Bkz. sims/mod.rs
    #[cfg(windows)]
    let mut live: Option<Box<dyn crate::sims::Source>> = None;
    #[cfg(windows)]
    let mut sim_pref = crate::with_settings(&app, |v| crate::sims::SimPref::from_settings(v));
    #[cfg(windows)]
    let mut last_pref_check = Instant::now();
    #[cfg(windows)]
    let mut last_try = crate::crashlog::past(10);
    // Son yeni telemetri satırının zamanı. iRacing yarış ekranı kapanınca veya donunca
    // paylaşımlı bellek bir süre "bağlı" görünebilir; veri akmıyorsa bağlı saymıyoruz.
    #[cfg(windows)]
    let mut last_data = crate::crashlog::past(60);

    loop {
        let user_demo = shared.demo.load(Ordering::Relaxed);
        #[cfg(windows)]
        let live_recent = last_data.elapsed() < STALE_AFTER;
        #[cfg(not(windows))]
        let live_recent = false;
        // Önizleme: panelde düzen editörü açık ve iRacing yok -> demo verisi, overlay'ler gizli kalır
        // Düzenleme modu (kilit açık) kendi başına demo verisi başlatmaz: demo sadece Demo düğmesiyle açılır
        let preview = !user_demo
            && (shared.preview.load(Ordering::Relaxed) || shared.pin.lock().is_some())
            && !shared.edit_mode.load(Ordering::Relaxed)
            && !live_recent;
        let demo_on = user_demo || preview;
        // Dondurma yalnızca önizleme verisinde geçerli (Demo modu ve canlı veri sürekli akar)
        let frozen = preview && shared.preview_frozen.load(Ordering::Relaxed);
        let mut connected = false;
        let mut new_frame = false;

        if shared.forget_map.swap(false, Ordering::Relaxed) && demo.is_none() {
            st.map.forget();
        }

        if demo_on {
            #[cfg(windows)]
            {
                if preview {
                    // Önizleme sırasında iRacing açıldı mı diye ara ara bak
                    if last_try.elapsed() > Duration::from_secs(2) {
                        last_try = Instant::now();
                        if live.is_none() {
                            live = crate::sims::open(sim_pref);
                        }
                        if let Some(src) = live.as_mut() {
                            let mut probe = Frame::default();
                            if src.connected() && src.read(&mut probe) {
                                last_data = Instant::now();
                            }
                        }
                    }
                } else {
                    live = None;
                }
            }
            if demo.is_none() {
                save_record(&shared, st.history.take());
                st.history = Default::default();
                st.laprec.reset();
                let mut d = Demo::new();
                st.raw = d.session().clone();
                st.league_ver = u64::MAX;
                st.tracker.reset();
                let (hist, laps, stint) = d.seed_history();
                st.tracker.fuel.seed(&hist, &laps, stint);
                st.history.seed_demo(&laps, &hist);
                st.map.set_shape("demo", d.track_shape());
                demo = Some(d);
                last_demo_step = Instant::now();
            }
            let now = Instant::now();
            let dt = (now - last_demo_step).as_secs_f64().min(0.1);
            last_demo_step = now;
            if let Some(d) = demo.as_mut() {
                // Vitrin adları demo başladıktan sonra geldiyse bir kez yerleştir
                if d.apply_showcase() {
                    st.raw = d.session().clone();
                    st.league_ver = u64::MAX;
                }
                // Dondurulmuş önizleme: demo saati ilerlemez, son kare olduğu gibi kalır (ilk kare her zaman üretilir)
                if !frozen || st.frame.player_idx < 0 {
                    d.step(dt, &mut st.frame);
                    new_frame = true;
                }
            }
            connected = true;
        } else {
            if demo.take().is_some() {
                st.history = Default::default();
                st.frame = Frame::default();
                st.raw = SessionData::default();
                st.league_ver = u64::MAX;
                st.tracker.reset();
                st.map.set_track("");
            }

            #[cfg(windows)]
            {
                // Sim seçimi (ayar: general.sim) değişti mi? Uymayan bağlantı bırakılır.
                let mut drop_live = false;
                if last_pref_check.elapsed() > Duration::from_secs(1) {
                    last_pref_check = Instant::now();
                    sim_pref = crate::with_settings(&app, |v| crate::sims::SimPref::from_settings(v));
                    if live.as_ref().map(|l| !sim_pref.accepts(l.kind())).unwrap_or(false) {
                        drop_live = true;
                    }
                }
                if live.is_none() && last_try.elapsed() > Duration::from_secs(1) {
                    last_try = Instant::now();
                    live = crate::sims::open(sim_pref);
                }
                if drop_live {
                    // aşağıda bırakılır
                } else if let Some(src) = live.as_mut() {
                    // iRacing her yeni veri yazdığında olay sinyali verir (60 Hz).
                    src.wait(200);
                    if src.connected() {
                        if let Some(sd) = src.session_update() {
                            st.raw = sd;
                            crate::demo::note_player(src.kind().id(), &st.raw);
                            st.league_ver = u64::MAX;
                            let key = src.map_key(&st.raw);
                            st.map.set_track(&key);
                        }
                        new_frame = src.read(&mut st.frame);
                        if new_frame {
                            last_data = Instant::now();
                        }
                        connected = last_data.elapsed() < STALE_AFTER;
                        st.sim = src.kind().id();
                    } else {
                        drop_live = true;
                    }
                } else {
                    std::thread::sleep(Duration::from_millis(500));
                }
                if drop_live {
                    save_record(&shared, st.history.take());
                    // Bekleyen tur (süresi bekleniyordu) ölçülen süreyle kaydedilir, süren tur bırakılır
                    if let Some(lap) = st.laprec.update(&st.frame, &st.raw, st.sim, false) {
                        save_lap(&app, app_data.as_deref(), lap);
                    }
                    live = None;
                    st.sim = "";
                    st.frame = Frame::default();
                    st.raw = SessionData::default();
                    st.league_ver = u64::MAX;
                    st.tracker.reset();
                    std::thread::sleep(Duration::from_millis(500));
                }
            }

            #[cfg(not(windows))]
            {
                // iRacing sadece Windows'ta çalışır; diğer sistemlerde yalnızca demo modu var.
                std::thread::sleep(Duration::from_millis(500));
            }
        }

        // League Builder: oturum ya da lig ayarı değiştiyse etkin oturumu yeniden üret
        let lv = shared.league_ver.load(Ordering::Relaxed);
        if lv != st.league_ver {
            st.league_ver = lv;
            let cfg = shared.league.lock().clone();
            let (s, active) = crate::league::apply(&st.raw, cfg.as_ref());
            st.session = s;
            st.league_active = active;
            let track = if st.session.track_config.is_empty() {
                st.session.track_name.clone()
            } else {
                format!("{} – {}", st.session.track_name, st.session.track_config)
            };
            let car = st.session.player().map(|d| d.car_name.clone()).unwrap_or_default();
            *shared.shot_meta.lock() = (track, car);
        }

        if let Some((vc, sc, allowed)) = shared.voice_cfg.lock().take() {
            let acks = voice.acks;
            if shared.voice_skip_ack.swap(false, Ordering::Relaxed) {
                voice.acks = false;
            }
            voice.set_cfg(vc, sc, allowed);
            voice.acks = acks;
            shared.voice_active.store(voice.active(), Ordering::Relaxed);
        }

        if new_frame {
            if st.league_active {
                crate::league::reposition(&mut st.frame, &st.session);
            }
            st.tracker.update(&st.frame, &st.session);
            // Yardımcı hesaplar tek tek korunur: birindeki panic (crash.log'a yazılır) o kareyi atlar, döngü sürer
            crate::crashlog::guard(|| st.strategy.update(&st.frame, &st.session, st.sim, demo_on));
            // Olaylar ekranı: olayları topla; oyuncu yarışı bitirince pencereyi bir kez aç
            // Hangi türlerin kaydedileceği (general.eventsRecord) saniyede bir okunur
            let record = if last_events_cfg.elapsed() > Duration::from_secs(1) {
                last_events_cfg = Instant::now();
                Some(crate::with_settings(&app, |v| crate::events::Record::from_settings(v.and_then(|v| v.pointer("/general/eventsRecord")))))
            } else {
                None
            };
            let (finished, ev_count, ev_rev) = crate::crashlog::guard(|| {
                let mut ev = shared.events.lock();
                ev.set_source(st.sim, demo_on);
                if let Some(r) = record {
                    ev.set_record(r);
                }
                let fin = ev.update(&st.frame, &st.session, &st.tracker);
                (fin, ev.auto_count(), ev.rev)
            })
            .unwrap_or((false, 0, events_rev));
            // Açık Olaylar penceresi beklemeden yenilensin (pencere ayrıca açılışta ve aralıklarla kendi çeker)
            if ev_rev != events_rev {
                events_rev = ev_rev;
                use tauri::Emitter;
                let _ = app.emit("events-changed", ev_rev);
            }
            // Otomatik açılış: general.eventsAutoOpen açık ve en az general.eventsMinCount olay varsa
            let auto_open = |need: usize| {
                let (auto, min) = crate::with_settings(&app, |v| {
                    let auto = v.and_then(|v| v.pointer("/general/eventsAutoOpen").and_then(|x| x.as_bool())).unwrap_or(true);
                    let min = v.and_then(|v| v.pointer("/general/eventsMinCount").and_then(|x| x.as_u64())).unwrap_or(0) as usize;
                    (auto, min)
                });
                auto && ev_count >= min.max(need)
            };
            if finished && !demo_on && connected && auto_open(0) {
                crate::open_events(&app);
            }
            // Tekrar izlenmeye başlandı: olaylara atlayabilmek için Olaylar penceresini aç (açık değilse)
            let replay = connected && !demo_on && !preview && crate::calc::replay_watch(&st.frame);
            // Atlanacak olay yoksa açılmaz (boş pencere açmanın anlamı yok)
            if replay && !was_replay && auto_open(1) {
                crate::open_events_if_closed(&app);
            }
            was_replay = replay;
            let done = crate::crashlog::guard(|| st.history.update(&st.frame, &st.session, !demo_on && connected)).flatten();
            save_record(&shared, done);
            crate::crashlog::guard(|| st.timing.update(&st.frame, &st.session, demo_on));
            // Telemetri: sadece canlı sim verisi (demo/önizleme değil); League Builder öncesi ham oturum
            if last_rec_check.elapsed() > Duration::from_secs(1) {
                last_rec_check = Instant::now();
                rec_enabled = crate::with_settings(&app, |v| v.and_then(|v| v.pointer("/general/telemetryRecord").and_then(|x| x.as_bool()))).unwrap_or(true);
            }
            // Fren noktası referansı ve pist limiti sayaçları (demo verisinde dosyaya yazılmaz)
            crate::crashlog::guard(|| st.cues.update(&st.frame, &st.raw, st.sim, demo_on, app_data.as_deref()));
            let rec_on = rec_enabled && !demo_on && !preview && connected && demo.is_none();
            if let Some(lap) = crate::crashlog::guard(|| st.laprec.update(&st.frame, &st.raw, st.sim, rec_on)).flatten() {
                save_lap(&app, app_data.as_deref(), lap);
            }
            if demo.is_none() {
                crate::crashlog::guard(|| st.map.update(&st.frame));
            }
            // Sesli spotter/mühendis ve bipler (önizleme verisinde ve Demo modunda susar)
            // Demo modunda da susar: Demo yalnızca görüntü içindir (eski `general.demoMute` ayarı artık yok sayılır)
            let muted = user_demo;
            crate::crashlog::guard(|| voice.tick(&st.frame, &st.session, &st.tracker, connected && !preview && !muted, st.sim));
        }
        // Sesli komut (bas-konuş): bekleyen soruları son kareden cevapla (bkz. voicecmd.rs)
        crate::crashlog::guard(|| crate::voicecmd::service(&mut voice, &st.frame, &st.session, &st.tracker, st.sim));

        let visible = connected && !preview;
        if visible != was_connected {
            was_connected = visible;
            if !visible {
                save_record(&shared, st.history.take());
            }
            shared.connected.store(visible, Ordering::Relaxed);
            crate::sync_overlay_visibility(&app);
            crate::on_connection_change(&app, visible);
        }

        publish(&shared, &st, connected, demo_on, preview);

        // Takım yakıt paylaşımı: sadece aracı sen sürerken
        if connected && last_team.elapsed() > Duration::from_secs(2) {
            last_team = Instant::now();
            let f = &st.frame;
            if f.is_on_track && !f.replay && f.player_idx >= 0 {
                if let Some(me) = st.session.player() {
                    let fu = calc::fuel(f, &st.session, &st.tracker);
                    let row = &fu.avg5;
                    let lp = st.history.laps(f);
                    let tf = crate::mqtt::TeamFuel {
                        sender: me.name.clone(),
                        car: me.car_name.clone(),
                        number: me.car_number.clone(),
                        level: fu.level,
                        pct: fu.pct,
                        max: fu.max,
                        usage: row.usage,
                        laps_left: row.laps,
                        refuel: row.refuel,
                        lap: f.lap,
                        on_pit: f.on_pit_road,
                        ts: crate::mqtt::now_ms(),
                        lap_pct: f.lap_dist_pct,
                        position: f.cars.get(me.car_idx as usize).map(|c| c.position).unwrap_or(0),
                        best: lp.best,
                        last: lp.laps.iter().rev().find(|l| l.time > 0.0).map(|l| l.time).unwrap_or(0.0),
                        laps: lp
                            .laps
                            .iter()
                            .rev()
                            .take(10)
                            .rev()
                            .map(|l| crate::mqtt::TeamLap { lap: l.lap, time: l.time, valid: l.valid, pit: l.pit })
                            .collect(),
                    };
                    shared.mqtt.publish_team(&tf);
                    // Arkadaş listesi: güvenilir arkadaşlara gönderilmek üzere arayüze (demo verisi gitmez)
                    if !demo_on {
                        use tauri::Emitter;
                        // Ekip (uzaktan pit) için ek veri: canlı veriye "crew" alanı olarak eklenir (bkz. host/crew.ts).
                        // team-fuel-local'dan ÖNCE gönderilir ki aynı pakete girsin.
                        let avg = |a: &[f32; 3]| (a[0] + a[1] + a[2]) / 3.0;
                        let r1 = |x: f32| (x * 10.0).round() / 10.0;
                        let car = f.cars.get(me.car_idx as usize);
                        // Lastik: kalan diş % (bilinmiyorsa -1) ve yüzey sıcaklığı °C — LF, RF, LR, RR
                        let wear = [0, 1, 2, 3].map(|i| {
                            let x = avg(&f.tire_wear[i]);
                            if x < 0.0 { -1.0 } else { (x * 100.0).round() }
                        });
                        let temp = [0, 1, 2, 3].map(|i| avg(&f.tire_temp[i]).round());
                        let crew = serde_json::json!({
                            "sim": st.sim,
                            "timeRemain": f.session_time_remain.round(),
                            "lapsRemain": f.session_laps_remain,
                            "classPos": car.map(|c| c.class_position).unwrap_or(0),
                            "raceLaps": r1(fu.race_laps_left),
                            "toFinish": r1(row.refuel.max(0.0)),
                            "needed": r1(fu.race_needed),
                            "inc": f.incidents,
                            "flags": f.session_flags,
                            "stall": car.map(|c| c.surface == 1).unwrap_or(false),
                            "pit": {
                                "flags": f.pit_sv_flags,
                                "fuel": r1(f.pit_sv_fuel),
                                "compound": f.pit_sv_compound,
                                "fr": f.fast_repairs,
                            },
                            "wear": wear,
                            "temp": temp,
                            "compound": f.tire_compound,
                        });
                        let _ = app.emit("crew-live-local", &crew);
                        let _ = app.emit("team-fuel-local", &tf);
                    }
                }
            }
        }

        if demo_on {
            // Demo 60 Hz; dondurulmuş önizlemede sadece aboneler için ara ara yayın
            std::thread::sleep(Duration::from_millis(if frozen { 100 } else { 16 }));
        }
    }
}

/// Bu süre boyunca yeni veri gelmezse iRacing kapanmış/donmuş sayılır ve overlay'ler gizlenir.
#[cfg(windows)]
const STALE_AFTER: Duration = Duration::from_secs(3);

fn publish(shared: &Shared, st: &State, connected: bool, demo: bool, preview: bool) {
    let mut subs = shared.subs.lock();
    if subs.is_empty() {
        return;
    }
    let now = Instant::now();
    let f = &st.frame;
    let s = &st.session;
    let t = &st.tracker;
    let has_data = connected && f.player_idx >= 0;
    let key = (connected, demo || preview, f.is_on_track, f.replay);

    // Aynı karede birden fazla aboneye gidecek paketi bir kez hesapla
    // (konu, paket, SSE aboneleri için hazır JSON metni)
    let mut cache: Vec<(&'static str, Packet, Option<String>)> = Vec::new();
    // Abone başına yeniden ayrılmasın: liste her abonede boşaltılıp yeniden kullanılır
    let mut due: Vec<&'static str> = Vec::new();

    subs.retain_mut(|sub| {
        // Durum değiştiyse hemen gönder
        if key != sub.status_key {
            sub.status_key = key;
            if let Some(tp) = sub.topics.iter_mut().find(|tp| tp.name == "status") {
                tp.next = now;
            }
        }
        // Önce gönderilecek konuları seç, sonra paketleri üretip gönder
        due.clear();
        for tp in sub.topics.iter_mut() {
            if now < tp.next || (tp.name != "status" && tp.name != "team" && !has_data) || PUSHED.contains(&tp.name.as_str()) {
                continue;
            }
            tp.next = now + tp.interval;
            if let Some(n) = KNOWN.iter().find(|k| **k == tp.name) {
                due.push(n);
            }
        }
        for &name in due.iter() {
            if name == "map" {
                // Pist şekli büyük: sadece bu abone eski sürümü gördüyse eklenir
                let send_shape = sub.map_version != st.map.version;
                sub.map_version = st.map.version;
                if !sub.send(&Packet::Map(calc::map(f, s, &st.map, send_shape))) {
                    return false;
                }
                continue;
            }
            // Paket önbellekte tutulur ve oradan gönderilir (fazladan kopya çıkarılmaz)
            let idx = if let Some(i) = cache.iter().position(|(n, _, _)| *n == name) {
                i
            } else {
                // Konu hesabı korunur: bir konudaki panic (crash.log'a yazılır) yalnız o konuyu bu karede atlar
                let made = crate::crashlog::guard(|| Some(match name {
                    "status" => {
                        let mut x = calc::status(f, s, connected, demo, preview);
                        if connected && !demo && !preview {
                            x.sim = st.sim.to_string();
                            let role = crate::sims::role::role(st.sim, f, s);
                            x.driver = role.is_driver();
                            x.role = role.id().to_string();
                        }
                        x.chat = shared.live_gate.lock().clone();
                        Packet::Status(x)
                    }
                    "inputs" => Packet::Inputs(calc::inputs(f, s)),
                    "ers" => Packet::Ers(calc::ers(f)),
                    "telemetry" => Packet::Telemetry(calc::telemetry(f, s, t)),
                    "delta" => Packet::Delta(calc::delta(f, t)),
                    "radar" => Packet::Radar(calc::radar(f, s)),
                    "relative" => Packet::Relative(calc::relative(f, s, t, 8)),
                    "standings" => Packet::Standings(calc::standings(f, s, t)),
                    "fuel" => Packet::Fuel(calc::fuel(f, s, t)),
                    "session" => Packet::Session(calc::session(f, s)),
                    "weather" => Packet::Weather(calc::weather(f)),
                    "raceControl" => Packet::RaceControl(calc::race_control(t)),
                    "tires" => Packet::Tires(calc::tires(f)),
                    "team" => Packet::Team(shared.mqtt.team_packet()),
                    "entries" => Packet::Entries(crate::league::entries(s, st.league_active)),
                    "laps" => Packet::Laps(st.history.laps(f)),
                    "incidents" => Packet::Incidents(st.history.incidents(f, s)),
                    "pit" => Packet::Pit(crate::extras::pit(f, s)),
                    "corners" => Packet::Corners(st.history.corners(f)),
                    "sectors" => Packet::Sectors(st.timing.sectors(f, s)),
                    "gaps" => Packet::Gaps(st.timing.gaps(f, s)),
                    "traffic" => Packet::Traffic(crate::extras::traffic(f, s)),
                    "brakepoint" => Packet::Brakepoint(st.cues.brakepoint(f, &st.raw)),
                    "tracklimits" => Packet::Tracklimits(st.cues.limits(f, &st.raw)),
                    "damage" => Packet::Damage(crate::drivecues::damage(f)),
                    "strategy" => Packet::Strategy(st.strategy.packet(f, s)),
                    _ => return None,
                }))
                .flatten();
                let Some(p) = made else { continue };
                cache.push((name, p, None));
                cache.len() - 1
            };
            let (_, p, json) = &mut cache[idx];
            if !sub.send_cached(p, json) {
                // Pencere yeniden yüklendi/kapandı ya da tarayıcı bağlantısı koptu
                return false;
            }
        }
        true
    });
}

#[cfg(test)]
mod publish_tests {
    use super::*;

    fn state() -> State {
        State {
            frame: Frame::default(),
            raw: SessionData::default(),
            session: SessionData::default(),
            league_active: false,
            league_ver: 0,
            tracker: Tracker::default(),
            map: TrackMap::new(None),
            history: Default::default(),
            timing: Default::default(),
            sim: "",
            laprec: Default::default(),
            cues: Default::default(),
            strategy: crate::strategy::Strategy::new(None),
        }
    }

    /// Aynı konuya abone iki tarayıcı kaynağı aynı karede birebir aynı JSON'u alır; paket bir kez üretilir.
    #[test]
    fn sse_subscribers_share_one_packet() {
        let shared = Shared::default();
        let (tx1, rx1) = std::sync::mpsc::channel::<String>();
        let (tx2, rx2) = std::sync::mpsc::channel::<String>();
        let reqs = [TopicReq { name: "team".into(), hz: 1.0 }];
        shared.subscribe(Sink::Sse(tx1), &reqs);
        shared.subscribe(Sink::Sse(tx2), &reqs);
        let st = state();
        publish(&shared, &st, false, false, false);
        let a: Vec<String> = rx1.try_iter().collect();
        let b: Vec<String> = rx2.try_iter().collect();
        // Bağlı değilken: durum + takım (veri gerektirmeyen iki konu)
        assert_eq!(a.len(), 2);
        assert_eq!(a, b);
        assert!(a[0].starts_with("{\"t\":\"status\""));
        assert!(a[1].starts_with("{\"t\":\"team\""));
        let expect = serde_json::to_string(&Packet::Team(shared.mqtt.team_packet())).unwrap();
        assert_eq!(a[1], expect);
        // Kapanan abone listeden çıkar, diğeri almaya devam eder
        drop(rx1);
        std::thread::sleep(Duration::from_millis(1100));
        publish(&shared, &st, false, false, false);
        assert_eq!(shared.subs.lock().len(), 1);
        assert!(rx2.try_iter().count() >= 1);
    }
}
