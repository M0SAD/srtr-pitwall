//! Sesli spotter ve mühendis (CrewChief benzeri).
//!
//! Sesler kullanıcının CrewChief ses paketinden okunur: her ifade bir klasördür ve içinde aynı
//! ifadenin farklı kayıtları (1.wav, 2.wav …) bulunur; biri rastgele seçilir. Anahtarlar
//! "kategori/ifade" biçimindedir (ör. "position/p5", "numbers/12", "spotter/car_left").
//!
//! Olaylar motor iş parçacığında her karede değerlendirilir (spotter) ya da saniyede birkaç kez
//! (mühendis); çalma işi `audio` iş parçacığındadır, oyun döngüsünü bekletmez.

use crate::audio::{self, Cmd};
use crate::calc;
use crate::model::{Frame, SessionData, MAX_CARS};
use crate::tracker::Tracker;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BeepCfg {
    pub enabled: bool,
    pub volume: f32,
    pub pitch: f32,
    pub seconds: f32,
    pub mute_spectating: bool,
}

#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SoundsCfg {
    pub faster_class: BeepCfg,
    pub alongside: BeepCfg,
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceCfg {
    pub enabled: bool,
    pub sounds_dir: String,
    pub pack: String,
    pub spotter: String,
    pub volume: f32,
    pub spotter_volume: f32,
    pub oval_inside_outside: bool,
    pub categories: HashMap<String, bool>,
}

impl Default for VoiceCfg {
    fn default() -> Self {
        VoiceCfg {
            enabled: false,
            sounds_dir: String::new(),
            pack: String::new(),
            spotter: String::new(),
            volume: 80.0,
            spotter_volume: 100.0,
            oval_inside_outside: false,
            categories: HashMap::new(),
        }
    }
}

impl VoiceCfg {
    fn on(&self, cat: &str) -> bool {
        self.categories.get(cat).copied().unwrap_or(true)
    }
}

pub fn cfg_from_settings(v: &Value) -> (VoiceCfg, SoundsCfg) {
    let g = v.get("general");
    let voice = g.and_then(|g| g.get("voice")).and_then(|x| serde_json::from_value(x.clone()).ok()).unwrap_or_default();
    let sounds = g.and_then(|g| g.get("sounds")).and_then(|x| serde_json::from_value(x.clone()).ok()).unwrap_or_default();
    (voice, sounds)
}

// ---------------------------------------------------------------------------
// Ses paketi
// ---------------------------------------------------------------------------

/// Varsayılan CrewChief ses klasörü
pub fn default_sounds_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|_| {
        std::env::var("HOME").map(|h| PathBuf::from(h).join(".local/share")).unwrap_or_default()
    });
    base.join("CrewChiefV4").join("Sounds")
}

fn subdirs(p: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(p)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().to_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

fn wavs(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("wav")).unwrap_or(false))
                .collect()
        })
        .unwrap_or_default()
}

pub struct Pack {
    pub sounds: PathBuf,
    pub voice: Option<PathBuf>,
    pub spotter: Option<PathBuf>,
    cache: HashMap<String, Vec<PathBuf>>,
    rng: u64,
}

impl Pack {
    pub fn open(cfg: &VoiceCfg) -> Pack {
        let sounds = if cfg.sounds_dir.trim().is_empty() { default_sounds_dir() } else { PathBuf::from(cfg.sounds_dir.trim()) };
        let alt = sounds.join("alt");
        let base_voice = sounds.join("voice");
        let voice = if !cfg.pack.is_empty() && alt.join(&cfg.pack).join("voice").is_dir() {
            Some(alt.join(&cfg.pack).join("voice"))
        } else if base_voice.join("flags").is_dir() {
            Some(base_voice.clone())
        } else {
            subdirs(&alt).into_iter().map(|p| alt.join(p).join("voice")).find(|p| p.is_dir())
        };
        let pack_name = voice
            .as_ref()
            .and_then(|v| v.parent())
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let spotters: Vec<String> = subdirs(&base_voice).into_iter().filter(|d| d.starts_with("spotter")).collect();
        let spotter = if !cfg.spotter.is_empty() && base_voice.join(&cfg.spotter).is_dir() {
            Some(base_voice.join(&cfg.spotter))
        } else if base_voice.join(format!("spotter_{pack_name}")).is_dir() {
            Some(base_voice.join(format!("spotter_{pack_name}")))
        } else {
            spotters.first().map(|s| base_voice.join(s))
        };
        let seed = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(7);
        Pack { sounds, voice, spotter, cache: HashMap::new(), rng: seed | 1 }
    }

    pub fn found(&self) -> bool {
        self.voice.is_some() || self.spotter.is_some()
    }

    fn rand(&mut self, n: usize) -> usize {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        (self.rng % n.max(1) as u64) as usize
    }

    /// "kategori/ifade" anahtarına karşılık gelen kayıtlardan birini seç
    pub fn pick(&mut self, key: &str) -> Option<PathBuf> {
        if !self.cache.contains_key(key) {
            let dir = if let Some(rest) = key.strip_prefix("spotter/") {
                self.spotter.as_ref().map(|s| s.join(rest))
            } else {
                self.voice.as_ref().map(|v| v.join(key))
            };
            let list = dir.map(|d| wavs(&d)).unwrap_or_default();
            self.cache.insert(key.to_string(), list);
        }
        let n = self.cache[key].len();
        if n == 0 {
            return None;
        }
        let i = self.rand(n);
        Some(self.cache[key][i].clone())
    }

    /// Tüm parçalar bulunursa yol listesi (bir parça eksikse hiç söyleme)
    pub fn phrase(&mut self, keys: &[String]) -> Option<Vec<PathBuf>> {
        keys.iter().map(|k| self.pick(k)).collect()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    pub sounds_dir: String,
    pub found: bool,
    pub packs: Vec<String>,
    pub spotters: Vec<String>,
    pub phrases: usize,
    pub files: usize,
    pub active: bool,
    pub error: Option<String>,
}

pub fn info(cfg: &VoiceCfg, active: bool) -> VoiceInfo {
    let pack = Pack::open(cfg);
    let mut phrases = 0;
    let mut files = 0;
    for root in [pack.voice.as_ref(), pack.spotter.as_ref()].into_iter().flatten() {
        for cat in subdirs(root) {
            let c = root.join(&cat);
            let direct = wavs(&c).len();
            if direct > 0 && root == pack.spotter.as_ref().unwrap_or(&PathBuf::new()) {
                phrases += 1;
                files += direct;
            }
            for ph in subdirs(&c) {
                let n = wavs(&c.join(ph)).len();
                if n > 0 {
                    phrases += 1;
                    files += n;
                }
            }
        }
    }
    let alt = pack.sounds.join("alt");
    VoiceInfo {
        sounds_dir: pack.sounds.display().to_string(),
        found: pack.found(),
        packs: subdirs(&alt).into_iter().filter(|p| alt.join(p).join("voice").is_dir()).collect(),
        spotters: subdirs(&pack.sounds.join("voice")).into_iter().filter(|d| d.starts_with("spotter")).collect(),
        phrases,
        files,
        active,
        error: None,
    }
}

// ---------------------------------------------------------------------------
// Sayılar
// ---------------------------------------------------------------------------

pub fn number_keys(n: i64) -> Vec<String> {
    if (0..100).contains(&n) {
        return vec![format!("numbers/{n}")];
    }
    if (100..1000).contains(&n) {
        let h = n / 100;
        let rest = n % 100;
        let mut v = vec![format!("numbers/{h}"), "numbers/hundred".into()];
        if rest > 0 {
            v.push(format!("numbers/{rest}"));
        }
        return v;
    }
    vec![format!("numbers/{}", n.clamp(0, 99))]
}

/// Saniye cinsinden ara: 1.5 -> "1point5seconds", 12.3 -> "12point3" + "seconds"
pub fn seconds_keys(s: f32) -> Vec<String> {
    let s = s.abs();
    let tenths = (s * 10.0).round() as i64;
    let whole = tenths / 10;
    let dec = tenths % 10;
    if whole == 0 {
        return vec![format!("numbers/point{dec}seconds")];
    }
    if whole < 10 {
        return vec![format!("numbers/{whole}point{dec}seconds")];
    }
    if whole < 60 {
        return vec![format!("numbers/{whole}point{dec}"), "numbers/seconds".into()];
    }
    vec![format!("numbers/{}", whole.min(99)), "numbers/seconds".into()]
}

// ---------------------------------------------------------------------------
// Olay takibi
// ---------------------------------------------------------------------------

const F_CHECKERED: u32 = 0x0001;
const F_WHITE: u32 = 0x0002;
const F_GREEN: u32 = 0x0004;
const F_YELLOW: u32 = 0x0008;
const F_BLUE: u32 = 0x0020;
const F_CAUTION: u32 = 0x4000;
const F_CAUTION_WAVING: u32 = 0x8000;
const F_BLACK: u32 = 0x0001_0000;
const F_REPAIR: u32 = 0x0010_0000;

struct Say {
    keys: Vec<String>,
    spotter: bool,
}

#[derive(Default)]
struct RaceState {
    session_num: i32,
    started: bool,
    finished: bool,
    last_lap_done: i32,
    announced_pos: i32,
    pos_lap: i32,
    time_marks: Vec<u32>,
    half_done: bool,
    fuel_warned: i32,
    two_to_go: bool,
    last_lap_said: bool,
    laps_left_said: Vec<i32>,
    best_lap: f32,
    incidents: i32,
    pit_open_said: bool,
    pit_close_said: bool,
    gap_ahead_hist: Vec<f32>,
    gap_behind_hist: Vec<f32>,
}

pub struct Voice {
    pub cfg: VoiceCfg,
    pub sounds: SoundsCfg,
    /// Sesli kısım etkin (PRO ve ayar)
    pub voice_on: bool,
    pack: Option<Pack>,
    pack_key: String,
    // spotter
    clr: i32,
    pending_clr: i32,
    pending_since: Instant,
    overlap_since: Option<Instant>,
    last_spot: Instant,
    held_line: bool,
    // mühendis
    last_eng: Instant,
    prev_flags: u32,
    last_blue: Instant,
    race: RaceState,
    faster_cd: HashMap<usize, Instant>,
    last_faster_voice: Instant,
}

impl Default for Voice {
    fn default() -> Self {
        let past = Instant::now() - Duration::from_secs(600);
        Voice {
            cfg: VoiceCfg::default(),
            sounds: SoundsCfg::default(),
            voice_on: false,
            pack: None,
            pack_key: String::new(),
            clr: 1,
            pending_clr: 1,
            pending_since: past,
            overlap_since: None,
            last_spot: past,
            held_line: false,
            last_eng: past,
            prev_flags: 0,
            last_blue: past,
            race: RaceState::default(),
            faster_cd: HashMap::new(),
            last_faster_voice: past,
        }
    }
}

impl Voice {
    pub fn set_cfg(&mut self, cfg: VoiceCfg, sounds: SoundsCfg, allowed: bool) {
        let key = format!("{}|{}|{}", cfg.sounds_dir, cfg.pack, cfg.spotter);
        if key != self.pack_key {
            self.pack = None;
            self.pack_key = key;
        }
        self.voice_on = cfg.enabled && allowed;
        self.cfg = cfg;
        self.sounds = sounds;
        if !self.sounds.alongside.enabled {
            audio::send(Cmd::Alongside(None));
        }
    }

    fn pack(&mut self) -> &mut Pack {
        if self.pack.is_none() {
            self.pack = Some(Pack::open(&self.cfg));
        }
        self.pack.as_mut().unwrap()
    }

    pub fn active(&self) -> bool {
        self.voice_on && self.pack.as_ref().map(|p| p.found()).unwrap_or(true)
    }

    fn play(&mut self, say: Say) {
        let vol = if say.spotter { self.cfg.spotter_volume } else { self.cfg.volume } / 100.0;
        if let Some(parts) = self.pack().phrase(&say.keys) {
            audio::send(Cmd::Say { parts, spotter: say.spotter, volume: vol });
        }
    }

    /// Test düğmeleri için
    pub fn test(&mut self, key: &str) -> Result<(), String> {
        let keys: Vec<String> = match key {
            "radio" => vec!["radio_check/test".into()],
            "car_left" => vec!["spotter/car_left".into()],
            "car_right" => vec!["spotter/car_right".into()],
            "three_wide" => vec!["spotter/in_the_middle".into()],
            "clear" => vec!["spotter/clear".into()],
            "position" => vec!["position/p5".into()],
            "laps_left" => {
                let mut v = number_keys(5);
                v.push("race_time/laps_remaining".into());
                v
            }
            "fuel" => vec!["fuel/three_laps_fuel".into()],
            "yellow" => vec!["flags/yellow_flag".into()],
            "last_lap" => vec!["lap_counter/last_lap".into()],
            other => vec![other.to_string()],
        };
        let spotter = keys.iter().all(|k| k.starts_with("spotter/"));
        let vol = if spotter { self.cfg.spotter_volume } else { self.cfg.volume } / 100.0;
        let pack = self.pack();
        if !pack.found() {
            return Err("Ses paketi bulunamadı".into());
        }
        let parts = pack.phrase(&keys).ok_or_else(|| format!("Bu ifadenin kaydı yok: {}", keys.join(" + ")))?;
        audio::send(Cmd::Say { parts, spotter, volume: vol });
        Ok(())
    }

    /// Her karede çağrılır. `live`: gerçek sürüş ya da kullanıcının açtığı demo (önizleme değil).
    pub fn tick(&mut self, f: &Frame, s: &SessionData, t: &Tracker, live: bool) {
        let now = Instant::now();
        let driving = live && f.is_on_track && !f.replay && f.player_idx >= 0;

        self.beeps(f, s, driving, live, now);

        if !self.voice_on || !driving {
            self.clr = 1;
            self.overlap_since = None;
            if !live {
                self.race = RaceState::default();
            }
            return;
        }

        if self.cfg.on("spotter") {
            self.spotter(f, s, now);
        }
        if now.duration_since(self.last_eng) >= Duration::from_millis(250) {
            self.last_eng = now;
            self.engineer(f, s, t, now);
        }
    }

    // ------------------------------------------------------------------ bipler
    fn beeps(&mut self, f: &Frame, s: &SessionData, driving: bool, live: bool, now: Instant) {
        let al = &self.sounds.alongside;
        if al.enabled && live && (driving || !al.mute_spectating) && !f.on_pit_road {
            let pan = match f.car_left_right {
                2 | 5 => Some(-1.0),
                3 | 6 => Some(1.0),
                4 => Some(0.0),
                _ => None,
            };
            audio::send(Cmd::Alongside(pan.map(|p| (p, al.pitch.max(100.0), al.volume / 100.0))));
        } else if al.enabled {
            audio::send(Cmd::Alongside(None));
        }

        let fc = self.sounds.faster_class.clone();
        let want_voice = self.voice_on && self.cfg.on("multiclass") && driving;
        if !(fc.enabled || want_voice) || !(driving || (live && !fc.mute_spectating)) {
            return;
        }
        let me = f.player_idx.max(0) as usize;
        let Some(my) = s.driver(me) else { return };
        let my_est = my.class_est_lap;
        let lap = if my_est > 1.0 { my_est } else { 100.0 };
        let my_pct = f.cars[me].pct;
        for i in 0..MAX_CARS {
            if i == me || f.cars[i].pct < 0.0 || f.cars[i].on_pit {
                continue;
            }
            let Some(d) = s.driver(i) else { continue };
            if d.is_pace_car || d.class_id == my.class_id || d.class_est_lap <= 1.0 || d.class_est_lap >= my_est - 0.5 {
                continue;
            }
            // Arkamızda ve yakın mı (saniye)
            let mut behind = my_pct - f.cars[i].pct;
            if behind < 0.0 {
                behind += 1.0;
            }
            let secs = behind * lap;
            if secs > 0.3 && secs < fc.seconds.max(1.0) {
                let cd = self.faster_cd.get(&i).copied();
                if cd.map(|c| now.duration_since(c) > Duration::from_secs(45)).unwrap_or(true) {
                    self.faster_cd.insert(i, now);
                    if fc.enabled {
                        audio::send(Cmd::Beep { freq: fc.pitch.max(100.0), ms: 160, volume: fc.volume / 100.0, pan: 0.0 });
                    }
                    if want_voice && now.duration_since(self.last_faster_voice) > Duration::from_secs(60) {
                        self.last_faster_voice = now;
                        self.play(Say { keys: vec!["multiclass/faster_car_behind".into()], spotter: false });
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ spotter
    fn spotter(&mut self, f: &Frame, s: &SessionData, now: Instant) {
        if f.on_pit_road || f.speed < 5.0 {
            self.clr = 1;
            self.overlap_since = None;
            return;
        }
        let st = if f.car_left_right <= 0 { 1 } else { f.car_left_right };
        // Kısa titremeleri yok say: yeni durum 120 ms sürmeli
        if st != self.pending_clr {
            self.pending_clr = st;
            self.pending_since = now;
            return;
        }
        if st == self.clr || now.duration_since(self.pending_since) < Duration::from_millis(120) {
            // Uzun süren yan yanalık: "hâlâ orada"
            if st != 1 {
                if let Some(since) = self.overlap_since {
                    if st == 4 && !self.held_line && now.duration_since(since) > Duration::from_secs(2) {
                        self.held_line = true;
                        self.last_spot = now;
                        self.play(Say { keys: vec!["spotter/hold_your_line".into()], spotter: true });
                    } else if now.duration_since(since) > Duration::from_secs(4) && now.duration_since(self.last_spot) > Duration::from_secs(4) {
                        self.last_spot = now;
                        self.play(Say { keys: vec!["spotter/still_there".into()], spotter: true });
                    }
                }
            }
            return;
        }
        let prev = self.clr;
        self.clr = st;
        let oval = self.cfg.oval_inside_outside && s.category.to_lowercase().contains("oval");
        let (l, r) = if oval { ("inside", "outside") } else { ("left", "right") };
        let key: Option<String> = match (prev, st) {
            (_, 2) if prev == 1 => Some(format!("car_{l}")),
            (_, 3) if prev == 1 => Some(format!("car_{r}")),
            (_, 4) => Some("in_the_middle".into()),
            (_, 5) => Some(format!("three_wide_on_{r}")),
            (_, 6) => Some(format!("three_wide_on_{l}")),
            (2, 1) | (5, 1) => Some(format!("clear_{l}")),
            (3, 1) | (6, 1) => Some(format!("clear_{r}")),
            (4, 1) => Some("clear_all_round".into()),
            (4, 2) => Some(format!("clear_{r}")),
            (4, 3) => Some(format!("clear_{l}")),
            (5, 2) | (6, 3) => None,
            (2, 3) => Some(format!("car_{r}")),
            (3, 2) => Some(format!("car_{l}")),
            _ => None,
        };
        if st == 1 {
            self.overlap_since = None;
            self.held_line = false;
        } else if prev == 1 {
            self.overlap_since = Some(now);
        }
        if let Some(k) = key {
            self.last_spot = now;
            self.play(Say { keys: vec![format!("spotter/{k}")], spotter: true });
        }
    }

    // ------------------------------------------------------------------ mühendis
    fn engineer(&mut self, f: &Frame, s: &SessionData, t: &Tracker, now: Instant) {
        let race = s.is_race(f.session_num);
        if f.session_num != self.race.session_num {
            self.race = RaceState { session_num: f.session_num, best_lap: -1.0, incidents: f.incidents, ..Default::default() };
        }
        let flags = f.session_flags;
        let rising = |bit: u32| flags & bit != 0 && self.prev_flags & bit == 0;
        let mut says: Vec<Say> = Vec::new();
        let me = f.player_idx.max(0) as usize;
        let multiclass = s.class_count() > 1;
        let pos = if multiclass { f.cars[me].class_position } else { f.cars[me].position };

        // Bayraklar
        if self.cfg.on("flags") {
            if rising(F_CAUTION) || rising(F_CAUTION_WAVING) {
                says.push(Say { keys: vec!["flags/fc_yellow_start".into()], spotter: false });
            } else if rising(F_YELLOW) {
                says.push(Say { keys: vec!["flags/yellow_flag".into()], spotter: false });
            }
            if self.prev_flags & (F_CAUTION | F_CAUTION_WAVING) != 0 && flags & (F_CAUTION | F_CAUTION_WAVING) == 0 && flags & F_GREEN != 0 {
                says.push(Say { keys: vec!["flags/fc_yellow_green_flag".into()], spotter: false });
            }
            if flags & F_BLUE != 0 && now.duration_since(self.last_blue) > Duration::from_secs(25) {
                self.last_blue = now;
                says.push(Say { keys: vec!["flags/blue_flag".into()], spotter: false });
            }
            if rising(F_BLACK) {
                says.push(Say { keys: vec!["flags/black_flag".into()], spotter: false });
            }
            if rising(F_REPAIR) {
                says.push(Say { keys: vec!["penalties/meatball_flag".into()], spotter: false });
            }
        }

        if race {
            // Start
            if !self.race.started && f.session_state == 4 {
                self.race.started = true;
                self.race.last_lap_done = f.lap_completed;
                self.race.announced_pos = pos;
                if self.cfg.on("race") && flags & F_GREEN != 0 && f.lap_completed <= 1 {
                    says.push(Say { keys: vec!["lap_counter/green_green_green".into()], spotter: false });
                }
            }
            // Bitiş
            if !self.race.finished && (flags & F_CHECKERED != 0 || f.session_state >= 5) && self.race.started {
                self.race.finished = true;
                if self.cfg.on("race") {
                    let k = if pos == 1 {
                        "lap_counter/won_race"
                    } else if pos <= 3 {
                        "lap_counter/podium_finish"
                    } else {
                        "lap_counter/finished_race"
                    };
                    says.push(Say { keys: vec![k.into()], spotter: false });
                }
            }
            if self.race.started && !self.race.finished {
                // Son tur (beyaz bayrak)
                if self.cfg.on("race") && rising(F_WHITE) && !self.race.last_lap_said {
                    self.race.last_lap_said = true;
                    let k = if pos == 1 {
                        "lap_counter/last_lap_leading"
                    } else if pos <= 3 {
                        "lap_counter/last_lap_top_three"
                    } else {
                        "lap_counter/last_lap"
                    };
                    says.push(Say { keys: vec![k.into()], spotter: false });
                }
                // Kalan süre (süreli yarış)
                let total = s.session(f.session_num).and_then(|x| x.time).unwrap_or(0.0);
                if self.cfg.on("race") && total > 0.0 && f.session_time_remain > 0.0 && f.session_laps_remain >= 32767 {
                    let left = f.session_time_remain;
                    for (mins, key) in [(20u32, "twenty_minutes_left"), (15, "fifteen_minutes_left"), (10, "ten_minutes_left"), (5, "five_minutes_left"), (2, "two_minutes_left"), (1, "one_minute_remaining")] {
                        let m = mins as f64 * 60.0;
                        if total > m + 120.0 && left <= m && left > m - 20.0 && !self.race.time_marks.contains(&mins) {
                            self.race.time_marks.push(mins);
                            says.push(Say { keys: vec![format!("race_time/{key}")], spotter: false });
                        }
                    }
                    if !self.race.half_done && left <= total / 2.0 {
                        self.race.half_done = true;
                        self.half_distance(f, s, t, &mut says);
                    }
                }

                // Tur tamamlandı
                if f.lap_completed > self.race.last_lap_done {
                    self.race.last_lap_done = f.lap_completed;
                    self.on_lap(f, s, t, pos, &mut says);
                }
            }
        } else if f.lap_completed > self.race.last_lap_done {
            self.race.last_lap_done = f.lap_completed;
            self.lap_time(f, s, t, &mut says);
        }

        // Olay puanı
        if f.incidents > self.race.incidents {
            if self.cfg.on("incidents") && f.incidents - self.race.incidents >= 2 {
                let mut k = vec!["incidents/you_have".to_string()];
                k.extend(number_keys(f.incidents as i64));
                k.push("incidents/incidents".into());
                says.push(Say { keys: k, spotter: false });
            }
            self.race.incidents = f.incidents;
        }

        self.prev_flags = flags;
        for s in says {
            self.play(s);
        }
    }

    fn half_distance(&mut self, f: &Frame, s: &SessionData, t: &Tracker, says: &mut Vec<Say>) {
        if !self.cfg.on("fuel") {
            return;
        }
        let fu = calc::fuel(f, s, t);
        if fu.samples == 0 || fu.avg5.usage <= 0.0 {
            return;
        }
        let k = if fu.race_needed > fu.level { "fuel/half_distance_low_fuel" } else { "fuel/half_distance_good_fuel" };
        says.push(Say { keys: vec![k.into()], spotter: false });
    }

    fn lap_time(&mut self, f: &Frame, _s: &SessionData, _t: &Tracker, says: &mut Vec<Say>) {
        if !self.cfg.on("laptimes") || f.lap_last <= 0.0 {
            return;
        }
        if self.race.best_lap > 0.0 && f.lap_last < self.race.best_lap - 0.001 {
            says.push(Say { keys: vec!["lap_times/personal_best".into()], spotter: false });
        }
        if self.race.best_lap <= 0.0 || f.lap_last < self.race.best_lap {
            self.race.best_lap = f.lap_last;
        }
    }

    fn on_lap(&mut self, f: &Frame, s: &SessionData, t: &Tracker, pos: i32, says: &mut Vec<Say>) {
        let lap = f.lap_completed;
        // Kalan tur (turlu yarış)
        let laps_left = f.session_laps_remain;
        if self.cfg.on("race") && laps_left > 0 && laps_left < 32767 {
            if laps_left == 2 && !self.race.two_to_go {
                self.race.two_to_go = true;
                let k = if pos == 1 { "lap_counter/two_to_go_leading" } else if pos <= 3 { "lap_counter/two_to_go_top_three" } else { "lap_counter/two_to_go" };
                says.push(Say { keys: vec![k.into()], spotter: false });
            } else if (laps_left == 10 || laps_left == 5) && !self.race.laps_left_said.contains(&laps_left) {
                self.race.laps_left_said.push(laps_left);
                let mut k = number_keys(laps_left as i64);
                k.push("race_time/laps_remaining".into());
                says.push(Say { keys: k, spotter: false });
            }
            let total = s.session(f.session_num).and_then(|x| x.laps).unwrap_or(0);
            if !self.race.half_done && total > 4 && laps_left <= total / 2 {
                self.race.half_done = true;
                self.half_distance(f, s, t, says);
            }
        }

        // Pozisyon: değiştiyse ya da 3 turda bir
        if self.cfg.on("position") && pos > 0 && (pos != self.race.announced_pos || lap - self.race.pos_lap >= 3) {
            self.race.announced_pos = pos;
            self.race.pos_lap = lap;
            let k = if pos == 1 { "position/leading".to_string() } else { format!("position/p{pos}") };
            says.push(Say { keys: vec![k], spotter: false });
        }

        // Yakıt
        if self.cfg.on("fuel") {
            let fu = calc::fuel(f, s, t);
            if fu.samples > 0 && fu.avg5.usage > 0.0 && fu.race_laps_left > fu.avg5.laps {
                let laps = fu.avg5.laps;
                let lvl = if laps < 1.2 { 1 } else if laps < 2.2 { 2 } else if laps < 3.2 { 3 } else if laps < 4.2 { 4 } else { 99 };
                if lvl < 99 && (self.race.fuel_warned == 0 || lvl < self.race.fuel_warned) {
                    self.race.fuel_warned = lvl;
                    let k = match lvl {
                        1 => "fuel/one_lap_fuel",
                        2 => "fuel/two_laps_fuel",
                        3 => "fuel/three_laps_fuel",
                        _ => "fuel/four_laps_fuel",
                    };
                    says.push(Say { keys: vec![k.into()], spotter: false });
                }
            }
            if f.on_pit_road {
                self.race.fuel_warned = 0;
            }
            // Pit penceresi
            if self.cfg.on("pit") && fu.pit_open > 0 {
                if !self.race.pit_open_said && f.lap >= fu.pit_open {
                    self.race.pit_open_said = true;
                    says.push(Say { keys: vec!["mandatory_pit_stops/pit_window_open".into()], spotter: false });
                } else if !self.race.pit_close_said && fu.pit_close > 0 && f.lap + 1 >= fu.pit_close {
                    self.race.pit_close_said = true;
                    says.push(Say { keys: vec!["mandatory_pit_stops/pit_window_closing".into()], spotter: false });
                }
            }
        }

        self.lap_time(f, s, t, says);

        // Aralar: 3 turda bir öndeki/arkadaki ile ara açılıyor mu kapanıyor mu
        if self.cfg.on("gaps") {
            let me = f.player_idx.max(0) as usize;
            let my_f2 = f.cars[me].f2;
            let my_cls = s.driver(me).map(|d| d.class_id).unwrap_or(0);
            let (mut ahead, mut behind) = (None::<f32>, None::<f32>);
            for i in 0..MAX_CARS {
                if i == me || f.cars[i].position <= 0 || s.driver(i).map(|d| d.class_id) != Some(my_cls) {
                    continue;
                }
                let d = my_f2 - f.cars[i].f2;
                if f.cars[i].class_position == f.cars[me].class_position - 1 && d > 0.0 {
                    ahead = Some(d);
                }
                if f.cars[i].class_position == f.cars[me].class_position + 1 && d < 0.0 {
                    behind = Some(-d);
                }
            }
            if let Some(a) = ahead {
                self.race.gap_ahead_hist.push(a);
            }
            if let Some(b) = behind {
                self.race.gap_behind_hist.push(b);
            }
            if lap % 3 == 0 {
                let h = &self.race.gap_ahead_hist;
                if h.len() >= 3 {
                    let d = h[h.len() - 1] - h[h.len() - 3];
                    if d < -0.4 && h[h.len() - 1] < 5.0 {
                        let mut k = vec!["timings/gap_in_front_is_now".to_string()];
                        k.extend(seconds_keys(h[h.len() - 1]));
                        says.push(Say { keys: vec!["timings/gap_in_front_decreasing".into()], spotter: false });
                        says.push(Say { keys: k, spotter: false });
                    } else if d > 0.6 {
                        says.push(Say { keys: vec!["timings/gap_in_front_increasing".into()], spotter: false });
                    }
                }
                let h = &self.race.gap_behind_hist;
                if h.len() >= 3 {
                    let d = h[h.len() - 1] - h[h.len() - 3];
                    if d < -0.4 && h[h.len() - 1] < 3.0 {
                        says.push(Say { keys: vec!["timings/gap_behind_decreasing".into()], spotter: false });
                    }
                }
                self.race.gap_ahead_hist.clear();
                self.race.gap_behind_hist.clear();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers() {
        assert_eq!(number_keys(5), vec!["numbers/5"]);
        assert_eq!(number_keys(120), vec!["numbers/1", "numbers/hundred", "numbers/20"]);
        assert_eq!(seconds_keys(1.52), vec!["numbers/1point5seconds"]);
        assert_eq!(seconds_keys(0.3), vec!["numbers/point3seconds"]);
        assert_eq!(seconds_keys(12.34), vec!["numbers/12point3", "numbers/seconds"]);
    }

    #[test]
    fn pack_missing_is_harmless() {
        let cfg = VoiceCfg { sounds_dir: "/yok/boyle/bir/klasor".into(), ..Default::default() };
        let mut p = Pack::open(&cfg);
        assert!(!p.found());
        assert!(p.pick("spotter/car_left").is_none());
    }
}
