//! Sesli mühendisin kuralları: telemetriden "ne zaman ne söylenir".
//!
//! `Eng::frame` her karede (sektör zamanları, kaza, ters yön), `Eng::rules` saniyede dört kez çağrılır.
//! Kurallar mesajları `out` listesine koyar; öncelik, süre aşımı ve çalma `voice.rs`'deki kuyruktadır.
//!
//! Her ifade anahtarı kaynakta tam metin olarak ("kategori/ifade") geçer; `voice_catalog.json`'daki
//! "used" alanı bu dosya ve `voice.rs` taranarak üretilir (sayılar ve position/pN hariç).
//! Telemetride karşılığı olmayan Crew Chief özellikleri (sesli komutlar, hasar ayrıntısı, DRS, batarya,
//! sürücü değişimi, safety car sıralaması…) uygulanmadı; bkz. katalog.

use crate::calc;
use crate::model::{Frame, SessionData, MAX_CARS};
use crate::tracker::Tracker;
use crate::voice::{prio, Msg, VoiceCfg};
use crate::voicepack::{k, Part};
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

// iRacing oturum bayrakları (diğer simler de bu bitlere çevrilir; bkz. sims/mod.rs)
pub const F_CHECKERED: u32 = 0x0001;
pub const F_WHITE: u32 = 0x0002;
pub const F_GREEN: u32 = 0x0004;
pub const F_YELLOW: u32 = 0x0008;
pub const F_BLUE: u32 = 0x0020;
pub const F_DEBRIS: u32 = 0x0040;
pub const F_YELLOW_WAVING: u32 = 0x0100;
pub const F_ONE_TO_GREEN: u32 = 0x0200;
pub const F_CAUTION: u32 = 0x4000;
pub const F_CAUTION_WAVING: u32 = 0x8000;
pub const F_BLACK: u32 = 0x0001_0000;
pub const F_DQ: u32 = 0x0002_0000;
pub const F_FURLED: u32 = 0x0008_0000;
pub const F_REPAIR: u32 = 0x0010_0000;
pub const F_START_READY: u32 = 0x2000_0000;
pub const F_START_SET: u32 = 0x4000_0000;

// iRacing EngineWarnings
pub const EW_WATER: u32 = 0x01;
pub const EW_FUEL_PRESS: u32 = 0x02;
pub const EW_OIL_PRESS: u32 = 0x04;
pub const EW_STALLED: u32 = 0x08;
pub const EW_LIMITER: u32 = 0x10;
pub const EW_OIL_TEMP: u32 = 0x40;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Kind {
    Race,
    Qualify,
    #[default]
    Practice,
}

impl Kind {
    pub fn of(s: &SessionData, num: i32) -> Kind {
        let kind = s
            .session(num)
            .map(|x| x.kind.to_lowercase())
            .unwrap_or_default();
        if kind.contains("race") {
            Kind::Race
        } else if kind.contains("qual") {
            Kind::Qualify
        } else {
            Kind::Practice
        }
    }
}

/// Bir değerlendirme anının bağlamı
pub struct Ctx<'a> {
    pub f: &'a Frame,
    pub s: &'a SessionData,
    pub t: &'a Tracker,
    pub now: Instant,
    pub kind: Kind,
    /// iRacing'e özgü veriler (iRating, lisans, olay puanı, motor uyarı bitleri) kullanılabilir mi
    pub iracing: bool,
    pub imperial: bool,
    pub sweary: bool,
    pub me: usize,
    pub my_class: i32,
    pub multiclass: bool,
    /// Sınıf içi sıra (tek sınıfta genel sıra)
    pub pos: i32,
    /// Sınıftaki araç sayısı
    pub field: i32,
    pub oval: bool,
}

impl<'a> Ctx<'a> {
    pub fn new(
        f: &'a Frame,
        s: &'a SessionData,
        t: &'a Tracker,
        now: Instant,
        kind: Kind,
        sim: &str,
        cfg: &VoiceCfg,
    ) -> Ctx<'a> {
        let me = f.player_idx.clamp(0, MAX_CARS as i32 - 1) as usize;
        let my_class = s.driver(me).map(|d| d.class_id).unwrap_or(0);
        let multiclass = s.class_count() > 1;
        let c = f.cars[me];
        let pos = if c.class_position > 0 {
            c.class_position
        } else {
            c.position
        };
        let field = (0..MAX_CARS)
            .filter(|&i| {
                s.driver(i)
                    .map(|d| !d.is_pace_car && !d.is_spectator && d.class_id == my_class)
                    .unwrap_or(false)
            })
            .filter(|&i| f.cars[i].pct >= 0.0 || f.cars[i].position > 0)
            .count() as i32;
        Ctx {
            f,
            s,
            t,
            now,
            kind,
            iracing: sim == "iracing" || sim.is_empty(),
            imperial: cfg.imperial,
            sweary: cfg.sweary,
            me,
            my_class,
            multiclass,
            pos,
            field,
            oval: s.category.to_lowercase().contains("oval"),
        }
    }

    pub fn race(&self) -> bool {
        self.kind == Kind::Race
    }

    fn active(&self, i: usize) -> bool {
        calc::active(self.f, self.s, i)
    }

    fn same_class(&self, i: usize) -> bool {
        self.s
            .driver(i)
            .map(|d| d.class_id == self.my_class)
            .unwrap_or(false)
    }

    /// Sınıf içinde bu sıradaki araç (biz hariç)
    pub fn class_car(&self, pos: i32) -> Option<usize> {
        if pos <= 0 {
            return None;
        }
        (0..MAX_CARS).find(|&i| {
            i != self.me && self.same_class(i) && {
                let c = self.f.cars[i];
                let p = if c.class_position > 0 {
                    c.class_position
                } else {
                    c.position
                };
                p == pos && (c.pct >= 0.0 || c.position > 0)
            }
        })
    }

    fn lap_time(&self) -> f32 {
        calc::ref_lap_time(self.f, self.s).max(1.0)
    }

    /// Yarış sıralamasında süre farkı (sn): + ise `i` bizden önde
    pub fn race_gap(&self, i: usize) -> Option<f32> {
        let (a, b) = (self.f.cars[self.me], self.f.cars[i]);
        if a.f2 > 0.0 || b.f2 > 0.0 {
            return Some(a.f2 - b.f2);
        }
        // f2 yoksa tur + pist konumundan tahmin
        let laps =
            (b.lap_completed as f32 + b.pct.max(0.0)) - (a.lap_completed as f32 + a.pct.max(0.0));
        if b.pct < 0.0 || a.pct < 0.0 {
            return None;
        }
        Some(laps * self.lap_time())
    }

    /// Pistte (tur farkı gözetmeden) süre farkı: + ise `i` arkamızda
    pub fn track_gap(&self, i: usize) -> Option<f32> {
        let (my, c) = (self.f.cars[self.me], self.f.cars[i]);
        if my.pct < 0.0 || c.pct < 0.0 {
            return None;
        }
        let lap_t = self.lap_time();
        let mut dp = my.pct - c.pct;
        if dp > 0.5 {
            dp -= 1.0;
        } else if dp < -0.5 {
            dp += 1.0;
        }
        let mut dt = my.est_time - c.est_time;
        if dp > 0.0 && dt < 0.0 {
            dt += lap_t;
        } else if dp < 0.0 && dt > 0.0 {
            dt -= lap_t;
        }
        if dt.abs() > lap_t * 0.5 || (my.est_time == 0.0 && c.est_time == 0.0) {
            dt = dp * lap_t;
        }
        Some(dt)
    }

    fn class_est(&self, i: usize) -> f32 {
        self.s.driver(i).map(|d| d.class_est_lap).unwrap_or(0.0)
    }

    /// Lisans harfinin ifadesi ve güvenlik puanı (iRacing "A 3.45")
    fn licence(&self, i: usize) -> (Option<&'static str>, f32) {
        let lic = self
            .s
            .driver(i)
            .map(|d| d.license.trim().to_string())
            .unwrap_or_default();
        let key = match lic.chars().next().map(|c| c.to_ascii_uppercase()) {
            Some('R') => Some("licence/rookie_licence"),
            Some('D') => Some("licence/d_licence"),
            Some('C') => Some("licence/c_licence"),
            Some('B') => Some("licence/b_licence"),
            Some('A') => Some("licence/a_licence"),
            Some('P') => Some("licence/pro_licence"),
            _ => None,
        };
        let sr = lic
            .split_whitespace()
            .nth(1)
            .and_then(|x| x.parse::<f32>().ok())
            .unwrap_or(-1.0);
        (key, sr)
    }
}

fn say(out: &mut Vec<Msg>, group: &'static str, p: u8, parts: Vec<Part>) {
    out.push(Msg::new(group, p, parts));
}

fn one(out: &mut Vec<Msg>, group: &'static str, p: u8, key: &str) {
    out.push(Msg::new(group, p, vec![k(key)]));
}

/// Köşe/aks grubu: hangi lastikler (LF, RF, LR, RR)
pub fn corner_group(set: [bool; 4]) -> Option<&'static str> {
    let n = set.iter().filter(|x| **x).count();
    Some(match (set, n) {
        (_, 0) => return None,
        (_, 3..=4) => "all_round",
        ([true, true, false, false], _) => "fronts",
        ([false, false, true, true], _) => "rears",
        ([true, false, true, false], _) => "lefts",
        ([false, true, false, true], _) => "rights",
        ([true, false, false, false], _) => "left_front",
        ([false, true, false, false], _) => "right_front",
        ([false, false, true, false], _) => "left_rear",
        ([false, false, false, true], _) => "right_rear",
        // Çapraz iki lastik: öndekini söyle
        ([true, false, false, true], _) => "left_front",
        _ => "right_front",
    })
}

/// (durum, grup) → ifade. Tekil lastik ifadesi yoksa aks ifadesi kullanılır.
const TYRE_KEYS: &[(&str, &str, &str)] = &[
    ("cold", "all_round", "tyre_monitor/cold_tyres_all_round"),
    ("cold", "fronts", "tyre_monitor/cold_front_tyres"),
    ("cold", "rears", "tyre_monitor/cold_rear_tyres"),
    ("cold", "lefts", "tyre_monitor/cold_left_tyres"),
    ("cold", "rights", "tyre_monitor/cold_right_tyres"),
    ("hot", "all_round", "tyre_monitor/hot_tyres_all_round"),
    ("hot", "fronts", "tyre_monitor/hot_front_tyres"),
    ("hot", "rears", "tyre_monitor/hot_rear_tyres"),
    ("hot", "lefts", "tyre_monitor/hot_left_tyres"),
    ("hot", "rights", "tyre_monitor/hot_right_tyres"),
    ("hot", "left_front", "tyre_monitor/hot_left_front_tyre"),
    ("hot", "right_front", "tyre_monitor/hot_right_front_tyre"),
    ("hot", "left_rear", "tyre_monitor/hot_left_rear_tyre"),
    ("hot", "right_rear", "tyre_monitor/hot_right_rear_tyre"),
    (
        "cooking",
        "all_round",
        "tyre_monitor/cooking_tyres_all_round",
    ),
    ("cooking", "fronts", "tyre_monitor/cooking_front_tyres"),
    ("cooking", "rears", "tyre_monitor/cooking_rear_tyres"),
    ("cooking", "lefts", "tyre_monitor/cooking_left_tyres"),
    ("cooking", "rights", "tyre_monitor/cooking_right_tyres"),
    (
        "cooking",
        "left_front",
        "tyre_monitor/cooking_left_front_tyre",
    ),
    (
        "cooking",
        "right_front",
        "tyre_monitor/cooking_right_front_tyre",
    ),
    (
        "cooking",
        "left_rear",
        "tyre_monitor/cooking_left_rear_tyre",
    ),
    (
        "cooking",
        "right_rear",
        "tyre_monitor/cooking_right_rear_tyre",
    ),
    ("minor", "all_round", "tyre_monitor/minor_wear_all_round"),
    ("minor", "fronts", "tyre_monitor/minor_wear_fronts"),
    ("minor", "rears", "tyre_monitor/minor_wear_rears"),
    ("minor", "lefts", "tyre_monitor/minor_wear_lefts"),
    ("minor", "rights", "tyre_monitor/minor_wear_rights"),
    ("minor", "left_front", "tyre_monitor/minor_wear_left_front"),
    (
        "minor",
        "right_front",
        "tyre_monitor/minor_wear_right_front",
    ),
    ("minor", "left_rear", "tyre_monitor/minor_wear_left_rear"),
    ("minor", "right_rear", "tyre_monitor/minor_wear_right_rear"),
    ("worn", "all_round", "tyre_monitor/worn_all_round"),
    ("worn", "fronts", "tyre_monitor/worn_fronts"),
    ("worn", "rears", "tyre_monitor/worn_rears"),
    ("worn", "lefts", "tyre_monitor/worn_lefts"),
    ("worn", "rights", "tyre_monitor/worn_rights"),
    ("worn", "left_front", "tyre_monitor/worn_left_front"),
    ("worn", "right_front", "tyre_monitor/worn_right_front"),
    ("worn", "left_rear", "tyre_monitor/worn_left_rear"),
    ("worn", "right_rear", "tyre_monitor/worn_right_rear"),
    ("knackered", "all_round", "tyre_monitor/knackered_all_round"),
    ("knackered", "fronts", "tyre_monitor/knackered_fronts"),
    ("knackered", "rears", "tyre_monitor/knackered_rears"),
    ("knackered", "lefts", "tyre_monitor/knackered_lefts"),
    ("knackered", "rights", "tyre_monitor/knackered_rights"),
    (
        "knackered",
        "left_front",
        "tyre_monitor/knackered_left_front",
    ),
    (
        "knackered",
        "right_front",
        "tyre_monitor/knackered_right_front",
    ),
    ("knackered", "left_rear", "tyre_monitor/knackered_left_rear"),
    (
        "knackered",
        "right_rear",
        "tyre_monitor/knackered_right_rear",
    ),
];

pub fn tyre_key(state: &str, group: &str) -> Option<&'static str> {
    let find = |g: &str| {
        TYRE_KEYS
            .iter()
            .find(|(s, gg, _)| *s == state && *gg == g)
            .map(|x| x.2)
    };
    find(group).or_else(|| {
        let axle = match group {
            "left_front" | "right_front" => "fronts",
            "left_rear" | "right_rear" => "rears",
            _ => return None,
        };
        find(axle)
    })
}

/// Sektör farkı ifadeleri. `pace`: sınıfın en iyisine göre; değilse kendi en iyimize göre.
const SECTOR_KEYS: &[&str] = &[
    "lap_times/sector1_a_tenth_off_pace",
    "lap_times/sector1_two_tenths_off_pace",
    "lap_times/sector1_a_second_off_pace",
    "lap_times/sector2_a_tenth_off_pace",
    "lap_times/sector2_two_tenths_off_pace",
    "lap_times/sector2_a_second_off_pace",
    "lap_times/sector3_a_tenth_off_pace",
    "lap_times/sector3_two_tenths_off_pace",
    "lap_times/sector3_a_second_off_pace",
    "lap_times/sector1_and_2_a_tenth_off_pace",
    "lap_times/sector1_and_2_two_tenths_off_pace",
    "lap_times/sector1_and_2_a_second_off_pace",
    "lap_times/sector1_and_3_a_tenth_off_pace",
    "lap_times/sector1_and_3_two_tenths_off_pace",
    "lap_times/sector1_and_3_a_second_off_pace",
    "lap_times/sector2_and_3_a_tenth_off_pace",
    "lap_times/sector2_and_3_two_tenths_off_pace",
    "lap_times/sector2_and_3_a_second_off_pace",
    "lap_times/sector_all_a_tenth_off_pace",
    "lap_times/sector_all_two_tenths_off_pace",
    "lap_times/sector_all_a_second_off_pace",
    "lap_times/sector_all_a_few_tenths_off_pace",
    "lap_times/sector_all_more_than_a_second_off_pace",
    "lap_times/sector1_a_tenth_off_self_pace",
    "lap_times/sector1_two_tenths_off_self_pace",
    "lap_times/sector1_a_second_off_self_pace",
    "lap_times/sector2_a_tenth_off_self_pace",
    "lap_times/sector2_two_tenths_off_self_pace",
    "lap_times/sector2_a_second_off_self_pace",
    "lap_times/sector3_a_tenth_off_self_pace",
    "lap_times/sector3_two_tenths_off_self_pace",
    "lap_times/sector3_a_second_off_self_pace",
    "lap_times/sector1_and_2_a_tenth_off_self_pace",
    "lap_times/sector1_and_2_two_tenths_off_self_pace",
    "lap_times/sector1_and_2_a_second_off_self_pace",
    "lap_times/sector1_and_3_a_tenth_off_self_pace",
    "lap_times/sector1_and_3_two_tenths_off_self_pace",
    "lap_times/sector1_and_3_a_second_off_self_pace",
    "lap_times/sector2_and_3_a_tenth_off_self_pace",
    "lap_times/sector2_and_3_two_tenths_off_self_pace",
    "lap_times/sector2_and_3_a_second_off_self_pace",
    "lap_times/sector_all_a_tenth_off_self_pace",
    "lap_times/sector_all_two_tenths_off_self_pace",
    "lap_times/sector_all_a_second_off_self_pace",
    "lap_times/sector1_fastest",
    "lap_times/sector2_fastest",
    "lap_times/sector3_fastest",
    "lap_times/sector1_and_2_fastest",
    "lap_times/sector1_and_3_fastest",
    "lap_times/sector2_and_3_fastest",
    "lap_times/sector_all_fastest",
    "lap_times/sector1_fast",
    "lap_times/sector2_fast",
    "lap_times/sector3_fast",
    "lap_times/sector1_and_2_fast",
    "lap_times/sector1_and_3_fast",
    "lap_times/sector2_and_3_fast",
    "lap_times/sector_all_fast",
];

/// Sektör farkının bandı: None önemsiz/çok büyük (tur bozuk)
fn sector_band(d: f32, pace: bool) -> Option<&'static str> {
    if pace && d <= 0.0 {
        return Some("fastest");
    }
    if pace && d < 0.05 {
        return Some("fast");
    }
    if d < 0.05 {
        return None;
    }
    if d < 0.15 {
        Some("a_tenth")
    } else if d < 0.45 {
        Some("two_tenths")
    } else if d < 1.6 {
        Some("a_second")
    } else {
        None
    }
}

/// Sektör farklarından tek bir ifade: en kötü bandı paylaşan sektörler birlikte söylenir
pub fn sector_message(d: [f32; 3], pace: bool) -> Option<&'static str> {
    let bands: Vec<Option<&str>> = d.iter().map(|x| sector_band(*x, pace)).collect();
    let rank = |b: &str| match b {
        "a_second" => 4,
        "two_tenths" => 3,
        "a_tenth" => 2,
        "fastest" => 1,
        "fast" => 0,
        _ => -1,
    };
    // En kötü (en büyük) bant; sadece hızlı/en hızlı sektörler varsa onların en iyisi
    let worst = bands.iter().flatten().max_by_key(|b| rank(b)).copied()?;
    let chosen = if rank(worst) >= 2 {
        worst
    } else if bands.iter().flatten().any(|b| *b == "fastest") {
        "fastest"
    } else {
        "fast"
    };
    let idx: Vec<usize> = (0..3).filter(|&i| bands[i] == Some(chosen)).collect();
    let which = match idx.as_slice() {
        [0, 1, 2] => "sector_all".to_string(),
        [a] => format!("sector{}", a + 1),
        [a, b] => format!("sector{}_and_{}", a + 1, b + 1),
        _ => return None,
    };
    let key = match chosen {
        "fastest" | "fast" => format!("lap_times/{which}_{chosen}"),
        _ => format!(
            "lap_times/{which}_{chosen}_off_{}",
            if pace { "pace" } else { "self_pace" }
        ),
    };
    SECTOR_KEYS.iter().find(|x| **x == key).copied()
}

/// Sınıf adından ifade: ("lmp2" grubu, "_runners" ifadesi varsa o)
const CLASS_KEYS: &[(&str, &str, Option<&str>)] = &[
    ("GT300", "multiclass/gt300", None),
    ("GT500", "multiclass/gt500", None),
    ("LMP1", "multiclass/lmp1", Some("multiclass/lmp1_runners")),
    ("LMP2", "multiclass/lmp2", Some("multiclass/lmp2_runners")),
    ("LMP3", "multiclass/lmp3", Some("multiclass/lmp3_runners")),
    ("LMDH", "multiclass/lmdh", Some("multiclass/lmdh_runners")),
    (
        "HYPERCAR",
        "multiclass/lmdh",
        Some("multiclass/lmdh_runners"),
    ),
    ("GTP", "multiclass/gtp", Some("multiclass/gtp_runners")),
    ("GTLM", "multiclass/gtlm", None),
    ("GTE", "multiclass/gte", Some("multiclass/gte_runners")),
    ("GT1", "multiclass/gt1", None),
    ("GT2", "multiclass/gt2", Some("multiclass/gt2_runners")),
    ("GT3", "multiclass/gt3", Some("multiclass/gt3_runners")),
    ("GT4", "multiclass/gt4", Some("multiclass/gt4_runners")),
    ("GT5", "multiclass/gt5", Some("multiclass/gt5_runners")),
    ("GTC", "multiclass/gtc", Some("multiclass/gtc_runners")),
    ("GTO", "multiclass/gto", None),
    ("DTM", "multiclass/dtm", Some("multiclass/dtm_runners")),
    ("TC1", "multiclass/tc1", Some("multiclass/tc1_runners")),
    ("TC2", "multiclass/tc2", Some("multiclass/tc2_runners")),
    ("CARRERA", "multiclass/carrera_cup", None),
    ("CUP", "multiclass/carrera_cup", None),
    ("MUSTANG", "multiclass/mustang", None),
    ("GROUP4", "multiclass/group4", None),
    ("GROUP5", "multiclass/group5", None),
    ("GROUP6", "multiclass/group6", None),
    (
        "GROUPA",
        "multiclass/groupa",
        Some("multiclass/groupa_runners"),
    ),
    ("GROUPB", "multiclass/groupb", None),
    (
        "GROUPC",
        "multiclass/groupc",
        Some("multiclass/groupc_runners"),
    ),
];

/// "… GT3'ler" gibi sınıf ifadesi parçaları
pub fn class_parts(class_name: &str) -> Option<Vec<Part>> {
    let n: String = class_name
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let (_, cls, runners) = CLASS_KEYS.iter().find(|(pat, _, _)| n.contains(pat))?;
    Some(match runners {
        Some(r) => vec![k(r)],
        None => vec![k(cls), k("multiclass/runners")],
    })
}

/// iRacing güç sırası (SoF) formülü
pub fn sof(ratings: &[i32]) -> i32 {
    let v: Vec<f64> = ratings
        .iter()
        .filter(|r| **r > 0)
        .map(|r| *r as f64)
        .collect();
    if v.is_empty() {
        return 0;
    }
    let br = 1600.0 / std::f64::consts::LN_2;
    let sum: f64 = v.iter().map(|r| (-r / br).exp()).sum();
    (br * (v.len() as f64 / sum).ln()).round() as i32
}

// ---------------------------------------------------------------------------
// Sektör zamanları (tüm araçlar, pist konumundan)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct CarSec {
    seen: bool,
    last_pct: f32,
    t_line: f64,
    t_b1: f64,
    t_b2: f64,
    dirty: bool,
    best: [f32; 3],
}

impl Default for CarSec {
    fn default() -> Self {
        CarSec {
            seen: false,
            last_pct: 0.0,
            t_line: -1.0,
            t_b1: -1.0,
            t_b2: -1.0,
            dirty: true,
            best: [f32::MAX; 3],
        }
    }
}

struct Sectors {
    cars: [CarSec; MAX_CARS],
    /// Oyuncunun son tamamlanan turunun sektörleri (henüz değerlendirilmedi)
    mine: Option<[f32; 3]>,
}

impl Default for Sectors {
    fn default() -> Self {
        Sectors {
            cars: [CarSec::default(); MAX_CARS],
            mine: None,
        }
    }
}

impl Sectors {
    fn update(&mut self, f: &Frame, me: usize, my_dirty: bool) {
        let now = f.session_time;
        for i in 0..MAX_CARS {
            let c = f.cars[i];
            let s = &mut self.cars[i];
            if c.pct < 0.0 {
                s.seen = false;
                continue;
            }
            let (p, lp) = (c.pct, s.last_pct);
            if !s.seen {
                *s = CarSec {
                    seen: true,
                    last_pct: p,
                    best: s.best,
                    ..CarSec::default()
                };
                continue;
            }
            s.last_pct = p;
            if c.on_pit {
                s.dirty = true;
            }
            if lp > 0.9 && p < 0.1 {
                if s.t_line >= 0.0 && s.t_b1 > s.t_line && s.t_b2 > s.t_b1 {
                    let secs = [
                        (s.t_b1 - s.t_line) as f32,
                        (s.t_b2 - s.t_b1) as f32,
                        (now - s.t_b2) as f32,
                    ];
                    let ok = secs.iter().all(|x| *x > 1.0);
                    if i == me {
                        self.mine = if ok && !my_dirty { Some(secs) } else { None };
                    } else if ok && !s.dirty {
                        for k in 0..3 {
                            s.best[k] = s.best[k].min(secs[k]);
                        }
                    }
                }
                s.t_line = now;
                s.t_b1 = -1.0;
                s.t_b2 = -1.0;
                s.dirty = c.on_pit;
            } else if (p - lp).abs() > 0.2 || p < lp - 0.01 {
                // Işınlanma (çekici, sıfırlama) ya da geri gitme: bu tur sayılmaz
                s.t_line = -1.0;
            } else {
                if lp < 1.0 / 3.0 && p >= 1.0 / 3.0 {
                    s.t_b1 = now;
                }
                if lp < 2.0 / 3.0 && p >= 2.0 / 3.0 {
                    s.t_b2 = now;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Mühendis durumu
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Default)]
struct PendingLap {
    at: Option<Instant>,
    #[allow(dead_code)]
    lap: i32,
    dirty: bool,
    in_lap: bool,
    out_lap: bool,
}

pub struct Eng {
    session_num: i32,
    rng: u64,
    cd: HashMap<&'static str, Instant>,
    prev_flags: u32,
    prev_state: i32,
    blue_since: Option<Instant>,
    yellow_since: Option<Instant>,
    // yarış akışı
    pre_said: bool,
    started: bool,
    start_time: f64,
    start_pos: i32,
    start_reported: bool,
    get_ready_said: bool,
    checkered: Option<i32>,
    finished: bool,
    last_lap_done: i32,
    last_lap_pending: Option<Instant>,
    last_lap_said: bool,
    two_to_go: bool,
    laps_left_said: Vec<i32>,
    time_marks: Vec<u32>,
    half_done: bool,
    push_said: bool,
    less_than_minute: bool,
    zero_said: bool,
    prev_time_remain: f64,
    // pozisyon
    announced_pos: i32,
    pos_lap: i32,
    last_pos: i32,
    last_pos_change: Option<Instant>,
    last_laps: i32,
    lapped_said: i32,
    lapping_said: i32,
    /// Bu stintte "tur bindiriyor" diye duyurulan araçlar → o andaki tur farkı
    lapped_by: HashMap<usize, i32>,
    /// Pit ziyaretinden sonra sıra / tur farkı özeti bir kez söylenecek
    pos_after_pit: bool,
    // turlar
    cur_dirty: bool,
    cur_in: bool,
    cur_out: bool,
    pending: PendingLap,
    best_lap: f32,
    laps: Vec<f32>,
    my_best_sec: [f32; 3],
    sectors: Sectors,
    pub expected: i32,
    sof: i32,
    // aralar ve rakipler
    ahead_idx: i32,
    behind_idx: i32,
    ahead_hist: Vec<f32>,
    behind_hist: Vec<f32>,
    close_ahead_laps: i32,
    close_behind_laps: i32,
    next_car_said: i32,
    rep_said: Vec<usize>,
    prev_pit: [bool; MAX_CARS],
    pit_tire: [i32; MAX_CARS],
    class_best: f32,
    car_cd: HashMap<(u8, usize), Instant>,
    // yakıt
    fuel_status: bool,
    stint_est_said: bool,
    fuel_warned: i32,
    fuel_time_warned: u32,
    fuel_low_said: bool,
    run_out_said: bool,
    half_tank_said: bool,
    prev_fuel: f32,
    pit_open_said: bool,
    pit_close_said: bool,
    window_said: bool,
    pit_this_lap_said: bool,
    box_now_lap: i32,
    // pit
    prev_on_pit: bool,
    pit_entries: u32,
    pit_exit_at: Option<Instant>,
    last_pit_exit: Option<Instant>,
    speeding_since: Option<Instant>,
    pit_loss: Option<f32>,
    in_lap_time: Option<f32>,
    ref_lap: Option<f32>,
    // lastikler
    temp_sum: f32,
    temps_live_at: Option<Instant>,
    wear_sum: f32,
    wear_live_at: Option<Instant>,
    tyre_temp_said: Option<(&'static str, i32)>,
    cold_said: bool,
    good_temps_said: bool,
    wear_level: u8,
    camber_said: bool,
    camber_pending: Option<Instant>,
    // motor
    prev_ew: u32,
    ew_since: Option<Instant>,
    temp_warned: u8,
    // koşullar
    rain_level: i32,
    rain_cand: (i32, Option<Instant>),
    temps_said: bool,
    temp_ref: Option<(f32, f32, Instant)>,
    // olay puanı ve cezalar
    incidents: i32,
    inc_limit_said: bool,
    inc_warned: bool,
    cut_count: i32,
    prev_invalid: bool,
    black_laps: i32,
    // ters yön, kaza, pistten dönüş
    back_since: Option<f64>,
    prev_pct: f32,
    speed_hist: VecDeque<(f64, f32)>,
    crash: Option<(Instant, u8)>,
    off_since: Option<Instant>,
    on_since: Option<Instant>,
    rejoin_said: bool,
    // çok sınıf
    mc_cd: HashMap<usize, Instant>,
    alongside_cd: Option<Instant>,
}

impl Default for Eng {
    fn default() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(99);
        Eng {
            session_num: i32::MIN,
            rng: seed | 1,
            cd: HashMap::new(),
            prev_flags: 0,
            prev_state: 0,
            blue_since: None,
            yellow_since: None,
            pre_said: false,
            started: false,
            start_time: 0.0,
            start_pos: 0,
            start_reported: false,
            get_ready_said: false,
            checkered: None,
            finished: false,
            last_lap_done: 0,
            last_lap_pending: None,
            last_lap_said: false,
            two_to_go: false,
            laps_left_said: Vec::new(),
            time_marks: Vec::new(),
            half_done: false,
            push_said: false,
            less_than_minute: false,
            zero_said: false,
            prev_time_remain: -1.0,
            announced_pos: 0,
            pos_lap: 0,
            last_pos: 0,
            last_pos_change: None,
            last_laps: 0,
            lapped_said: 0,
            lapping_said: 0,
            lapped_by: HashMap::new(),
            pos_after_pit: false,
            cur_dirty: true,
            cur_in: false,
            cur_out: false,
            pending: PendingLap::default(),
            best_lap: -1.0,
            laps: Vec::new(),
            my_best_sec: [f32::MAX; 3],
            sectors: Sectors::default(),
            expected: 0,
            sof: 0,
            ahead_idx: -1,
            behind_idx: -1,
            ahead_hist: Vec::new(),
            behind_hist: Vec::new(),
            close_ahead_laps: 0,
            close_behind_laps: 0,
            next_car_said: -1,
            rep_said: Vec::new(),
            prev_pit: [false; MAX_CARS],
            pit_tire: [-1; MAX_CARS],
            class_best: -1.0,
            car_cd: HashMap::new(),
            fuel_status: false,
            stint_est_said: false,
            fuel_warned: 99,
            fuel_time_warned: 999,
            fuel_low_said: false,
            run_out_said: false,
            half_tank_said: false,
            prev_fuel: -1.0,
            pit_open_said: false,
            pit_close_said: false,
            window_said: false,
            pit_this_lap_said: false,
            box_now_lap: -1,
            prev_on_pit: false,
            pit_entries: 0,
            pit_exit_at: None,
            last_pit_exit: None,
            speeding_since: None,
            pit_loss: None,
            in_lap_time: None,
            ref_lap: None,
            temp_sum: 0.0,
            temps_live_at: None,
            wear_sum: 0.0,
            wear_live_at: None,
            tyre_temp_said: None,
            cold_said: false,
            good_temps_said: false,
            wear_level: 0,
            camber_said: false,
            camber_pending: None,
            prev_ew: 0,
            ew_since: None,
            temp_warned: 0,
            rain_level: -1,
            rain_cand: (-1, None),
            temps_said: false,
            temp_ref: None,
            incidents: 0,
            inc_limit_said: false,
            inc_warned: false,
            cut_count: 0,
            prev_invalid: false,
            black_laps: 0,
            back_since: None,
            prev_pct: -1.0,
            speed_hist: VecDeque::new(),
            crash: None,
            off_since: None,
            on_since: None,
            rejoin_said: false,
            mc_cd: HashMap::new(),
            alongside_cd: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Trafik çağrıları kapısı (pit yolu / pit çıkışı) ve sıklık sınırları
// ---------------------------------------------------------------------------

/// Pit çıkışından sonra trafik çağrıları en az bu kadar susar (sn)
pub const TRAFFIC_GRACE_MIN: f32 = 6.0;
/// ...ve yarış hızına dönülmediyse en çok bu kadar (sn)
pub const TRAFFIC_GRACE_MAX: f32 = 20.0;
/// "Yarış hızı" eşiği (m/s)
pub const TRAFFIC_RACING_SPEED: f32 = 25.0;
/// Kuyrukta bu kadar bekleyen trafik mesajı bayatlamıştır (sn)
pub const TRAFFIC_TTL: f32 = 6.0;
/// "Arkadaki araç tur bindiriyor" / "turunu geri alıyor": hangi araç olursa olsun en çok bu sıklıkta (sn)
pub const LAPPED_CAT_CD: f32 = 75.0;

/// Trafik çağrıları (tur bindiren araç, ön/arka fark, mavi bayrak, hızlı sınıf, geçiş) susturulsun mu?
/// `in_pit`: pit yolunda / pit kutusunda / garajda; `since_exit`: pitten çıkalı geçen süre (sn).
pub fn traffic_blocked(in_pit: bool, speed: f32, since_exit: f32) -> bool {
    in_pit
        || since_exit < TRAFFIC_GRACE_MIN
        || (since_exit < TRAFFIC_GRACE_MAX && speed < TRAFFIC_RACING_SPEED)
}

/// İfade bir trafik çağrısı mı (pitte atılır, kuyrukta çabuk bayatlar)
pub fn traffic_key(key: &str) -> bool {
    key.starts_with("timings/")
        || key.starts_with("multiclass/")
        || matches!(
            key,
            "flags/blue_flag"
                | "penalties/blue_move_now_or_be_penalized"
                | "position/overtaking"
                | "position/being_overtaken"
        )
}

pub fn traffic_msg(m: &Msg) -> bool {
    m.parts
        .iter()
        .any(|p| matches!(p, Part::K(s) if traffic_key(s)))
}

/// "Arkadaki araç tur bindiriyor" kararı: (aracı duyuruldu say, şimdi söyle).
/// `prev`: bu araç için bu stintte kaydedilen tur farkı; `diff`: şimdiki tur farkı;
/// `since_cat`: bu tür son çağrıdan beri geçen süre. Aynı araç aynı tur farkıyla bir daha söylenmez;
/// bekleme süresindeki yeni araçlar da duyurulmuş sayılır (art arda gelenler tek çağrıda toplanır).
pub fn lapped_call(prev: Option<i32>, diff: i32, since_cat: f32) -> (bool, bool) {
    if diff < 1 || prev.map(|p| diff <= p).unwrap_or(false) {
        return (false, false);
    }
    (true, since_cat >= LAPPED_CAT_CD)
}

/// Gerçek tur farkı (pist konumu dahil): tur çizgisi dışında da doğru sonuç verir
pub fn laps_between(front_lc: i32, front_pct: f32, back_lc: i32, back_pct: f32) -> i32 {
    let d = (front_lc as f32 + front_pct.clamp(0.0, 1.0)) - (back_lc as f32 + back_pct.clamp(0.0, 1.0));
    d.floor() as i32
}

fn secs_since(t: Option<Instant>, now: Instant) -> f32 {
    t.map(|t| now.saturating_duration_since(t).as_secs_f32())
        .unwrap_or(f32::MAX)
}

impl Eng {
    fn rand(&mut self, n: usize) -> usize {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        (self.rng % n.max(1) as u64) as usize
    }

    fn pick<'b>(&mut self, opts: &[&'b str]) -> &'b str {
        let i = self.rand(opts.len());
        opts[i]
    }

    fn chance(&mut self, p: f32) -> bool {
        (self.rand(1000) as f32) < p * 1000.0
    }

    /// Bekleme süresi dolduysa true döner ve süreyi yeniden başlatır
    fn ready(&mut self, key: &'static str, secs: f32, now: Instant) -> bool {
        if secs_since(self.cd.get(key).copied(), now) < secs {
            return false;
        }
        self.cd.insert(key, now);
        true
    }

    /// Trafik çağrıları şu an kapalı mı (pit yolu / kutu ya da pit çıkışından hemen sonra)
    pub fn traffic_off(&self, f: &Frame, now: Instant) -> bool {
        let me = f.player_idx.max(0) as usize;
        let car = f.cars[me];
        let in_pit = f.on_pit_road || self.prev_on_pit || car.on_pit || car.surface == 1;
        traffic_blocked(in_pit, f.speed, secs_since(self.last_pit_exit, now))
    }

    fn car_ready(&mut self, kind: u8, i: usize, secs: f32, now: Instant) -> bool {
        if secs_since(self.car_cd.get(&(kind, i)).copied(), now) < secs {
            return false;
        }
        self.car_cd.insert((kind, i), now);
        true
    }

    fn reset_session(&mut self, f: &Frame) {
        let rng = self.rng;
        let pit_loss = self.pit_loss;
        *self = Eng {
            rng,
            session_num: f.session_num,
            ..Eng::default()
        };
        // Aynı yarış hafta sonunda pit kaybı değişmez
        self.pit_loss = pit_loss;
        self.incidents = f.incidents;
        self.last_lap_done = f.lap_completed;
        self.prev_flags = f.session_flags;
        self.prev_state = f.session_state;
        self.prev_on_pit = f.on_pit_road;
        self.prev_invalid = f.lap_invalid;
        self.prev_ew = f.engine_warnings;
        for i in 0..MAX_CARS {
            self.prev_pit[i] = f.cars[i].on_pit;
            self.pit_tire[i] = f.cars[i].tire;
        }
    }

    /// Her karede: oturum değişimi, sektör zamanları, kaza ve ters yön
    pub fn frame(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        if f.session_num != self.session_num {
            self.reset_session(f);
        }
        let me = f.cars[c.me];
        // Turu bozan durumlar: pit, pist dışı, simin geçersiz sayması
        if f.on_pit_road || f.lap_invalid || me.surface == 0 {
            self.cur_dirty = true;
        }
        self.sectors.update(f, c.me, self.cur_dirty);

        // Kaza: yarım saniyede 25 m/s'den fazla yavaşlayıp neredeyse durmak
        let t = f.session_time;
        self.speed_hist.push_back((t, f.speed));
        while self
            .speed_hist
            .front()
            .map(|x| t - x.0 > 0.7 || x.0 > t)
            .unwrap_or(false)
        {
            self.speed_hist.pop_front();
        }
        let vmax = self.speed_hist.iter().map(|x| x.1).fold(0.0f32, f32::max);
        if self.crash.is_none()
            && !f.on_pit_road
            && vmax > 25.0
            && f.speed < 12.0
            && vmax - f.speed > 25.0
        {
            self.crash = Some((c.now, 1));
            self.speed_hist.clear();
            say(
                out,
                "damage",
                prio::CRITICAL,
                vec![k("damage_reporting/are_you_ok_first_try")],
            );
            if c.sweary && self.chance(0.3) && self.ready("rant", 600.0, c.now) {
                say(out, "pearls", prio::LOW, vec![k("rants/general")]);
            }
        }

        // Ters yön: 2 sn boyunca tur yüzdesi geriye gidiyor
        let p = f.lap_dist_pct;
        if self.prev_pct >= 0.0 && f.speed > 8.0 && !f.on_pit_road && f.is_on_track {
            let d = p - self.prev_pct;
            if d < -0.00005 && d > -0.5 {
                let since = *self.back_since.get_or_insert(t);
                if t - since > 2.0 && self.ready("wrong_way", 15.0, c.now) {
                    say(
                        out,
                        "penalties",
                        prio::CRITICAL,
                        vec![k("penalties/warning_wrong_way")],
                    );
                }
            } else if d > 0.00005 {
                self.back_since = None;
            }
        } else {
            self.back_since = None;
        }
        self.prev_pct = p;
    }

    /// Saniyede dört kez: tüm mühendis kuralları
    pub fn rules(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let crossed = f.lap_completed > self.last_lap_done;
        if crossed {
            self.pending = PendingLap {
                at: Some(c.now),
                lap: f.lap_completed,
                dirty: self.cur_dirty,
                in_lap: self.cur_in,
                out_lap: self.cur_out,
            };
            self.cur_dirty = f.on_pit_road;
            self.cur_in = false;
            self.cur_out = false;
            self.last_lap_done = f.lap_completed;
        } else if f.lap_completed < self.last_lap_done {
            self.last_lap_done = f.lap_completed;
        }
        let lap_ready = self
            .pending
            .at
            .map(|a| c.now.duration_since(a) >= Duration::from_millis(1500))
            .unwrap_or(false);
        let pending = if lap_ready {
            let p = self.pending;
            self.pending.at = None;
            Some(p)
        } else {
            None
        };

        self.flags(c, out);
        if c.race() {
            self.race_flow(c, crossed, out);
            self.position(c, crossed, out);
        } else {
            self.session_flow(c, out);
        }
        if let Some(p) = pending {
            self.lap_done(c, p, out);
        }
        if c.race() && self.started && !self.finished {
            if crossed {
                self.gaps(c, out);
            }
            self.opponents(c, out);
            self.push_now(c, crossed, out);
        }
        self.fuel(c, crossed, out);
        self.pit(c, out);
        self.tyres(c, crossed, out);
        self.engine(c, out);
        self.damage(c, out);
        self.penalties(c, crossed, out);
        self.conditions(c, out);
        if c.multiclass {
            self.multiclass(c, out);
        }
        self.rejoin(c, out);

        self.prev_flags = f.session_flags;
        self.prev_state = f.session_state;
        self.prev_on_pit = f.on_pit_road;
        self.prev_ew = f.engine_warnings;
        for i in 0..MAX_CARS {
            self.prev_pit[i] = f.cars[i].on_pit;
        }
    }

    // ------------------------------------------------------------------ bayraklar
    fn flags(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let (fl, pf) = (c.f.session_flags, self.prev_flags);
        let rising = |b: u32| fl & b != 0 && pf & b == 0;
        let falling = |b: u32| fl & b == 0 && pf & b != 0;
        let caution = F_CAUTION | F_CAUTION_WAVING;
        let now = c.now;

        if c.race() && fl & caution != 0 && pf & caution == 0 {
            let key = if c.oval {
                self.pick(&["flags/fc_yellow_start_usa", "flags/fc_yellow_start"])
            } else {
                self.pick(&["flags/fc_yellow_start_eu", "flags/fc_yellow_start"])
            };
            one(out, "flags", prio::CRITICAL, key);
        } else if rising(F_YELLOW) && fl & caution == 0 {
            self.yellow_since = Some(now);
            if fl & F_YELLOW_WAVING != 0 {
                one(out, "flags", prio::CRITICAL, "flags/double_yellow_flag");
            } else {
                let key = self.pick(&[
                    "flags/yellow_flag",
                    "flags/local_yellow_flag",
                    "flags/local_yellow_ahead",
                ]);
                one(out, "flags", prio::CRITICAL, key);
            }
        }
        if falling(F_YELLOW)
            && fl & caution == 0
            && secs_since(self.yellow_since, now) > 3.0
            && self.ready("yellow_clear", 20.0, now)
        {
            one(out, "flags", prio::HIGH, "flags/local_yellow_clear");
        }
        if c.race() && rising(F_ONE_TO_GREEN) {
            let key = if c.oval {
                "flags/fc_yellow_prepare_for_green_usa"
            } else {
                "flags/fc_yellow_prepare_for_green_eu"
            };
            let key = if self.chance(0.3) {
                "flags/fc_yellow_prepare_for_green"
            } else {
                key
            };
            one(out, "flags", prio::HIGH, key);
        }
        if c.race() && pf & caution != 0 && fl & caution == 0 && fl & F_GREEN != 0 {
            one(out, "flags", prio::CRITICAL, "flags/fc_yellow_green_flag");
        }
        // Mavi bayrak: 25 sn'de bir; uzun sürerse ceza uyarısı
        if fl & F_BLUE != 0 && !self.traffic_off(c.f, now) {
            let since = *self.blue_since.get_or_insert(now);
            if now.duration_since(since) > Duration::from_secs(15)
                && self.ready("blue_pen", 40.0, now)
            {
                one(
                    out,
                    "flags",
                    prio::HIGH,
                    "penalties/blue_move_now_or_be_penalized",
                );
            } else if self.ready("blue", 25.0, now) {
                one(out, "flags", prio::HIGH, "flags/blue_flag");
            }
        } else {
            self.blue_since = None;
        }
        if rising(F_DEBRIS) && self.ready("debris", 60.0, now) {
            let key = self.pick(&["flags/red-yellow-flag", "flags/slippery-surface-flag"]);
            one(out, "flags", prio::NORMAL, key);
        }
        if rising(F_BLACK) {
            let key = self.pick(&["flags/black_flag", "penalties/new_penalty_black_flag"]);
            one(out, "penalties", prio::CRITICAL, key);
            self.black_laps = 0;
        }
        if falling(F_BLACK) && fl & F_DQ == 0 {
            one(out, "penalties", prio::HIGH, "penalties/penalty_served");
        }
        if rising(F_REPAIR) {
            one(out, "penalties", prio::CRITICAL, "penalties/meatball_flag");
        }
        if rising(F_DQ) {
            one(
                out,
                "penalties",
                prio::CRITICAL,
                "penalties/penalty_disqualified",
            );
        }
        // iRacing "furled" siyah bayrak: pist sınırı / kesme uyarısı
        if rising(F_FURLED) {
            self.cut_warning(c, out);
        }
    }

    fn cut_warning(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        if !self.ready("cut", 6.0, c.now) {
            return;
        }
        self.cut_count += 1;
        let n = self.cut_count;
        let key = if c.race() {
            match n {
                1 => "penalties/cut_track_in_race",
                2 => "penalties/cut_track_race_1",
                3 => "penalties/cut_track_race_2",
                4 => "penalties/cut_track_race_3",
                _ => "penalties/cut_track_race_4",
            }
        } else {
            match n {
                1 => self.pick(&[
                    "penalties/cut_track_in_prac_or_qual",
                    "penalties/lap_deleted",
                ]),
                2 => "penalties/cut_track_prac_or_qual_1",
                3 => "penalties/cut_track_prac_or_qual_2",
                4 => "penalties/cut_track_prac_or_qual_3",
                _ => "penalties/cut_track_prac_or_qual_4",
            }
        };
        one(out, "penalties", prio::HIGH, key);
    }

    // ------------------------------------------------------------------ yarış akışı
    fn race_flow(&mut self, c: &Ctx, crossed: bool, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let st = f.session_state;
        let pos = c.pos;

        // Start öncesi (gridde): güç sırası, başlangıç sırası, beklenen sıra
        if !self.started && !self.pre_said && (1..=3).contains(&st) && f.is_on_track {
            self.pre_said = true;
            if c.iracing {
                let ratings: Vec<i32> = (0..MAX_CARS)
                    .filter_map(|i| c.s.driver(i))
                    .filter(|d| {
                        !d.is_pace_car
                            && !d.is_spectator
                            && (!c.multiclass || d.class_id == c.my_class)
                    })
                    .map(|d| d.irating)
                    .collect();
                self.sof = sof(&ratings);
                if self.sof > 0 {
                    let key = if c.multiclass {
                        "lap_counter/strength_of_field_for_our_class_is"
                    } else {
                        "lap_counter/strength_of_field_is"
                    };
                    out.push(
                        Msg::new("race", prio::LOW, vec![k(key), Part::Int(self.sof as i64)])
                            .ttl(90.0),
                    );
                }
                let mine = c.s.driver(c.me).map(|d| d.irating).unwrap_or(0);
                if mine > 0 {
                    self.expected = 1 + ratings.iter().filter(|r| **r > mine).count() as i32;
                    let parts = if self.expected == 1 {
                        vec![k("position/expected_position_win")]
                    } else {
                        let intro = if self.sof < 1500 {
                            "position/expected_position_intro_weak_field"
                        } else if self.sof < 2500 {
                            "position/expected_position_intro_medium_field"
                        } else {
                            "position/expected_position_intro_strong_field"
                        };
                        vec![k(intro), Part::Pos(self.expected)]
                    };
                    out.push(Msg::new("position", prio::LOW, parts).ttl(90.0));
                }
            }
            if pos > 0 {
                let parts = if pos == 1 {
                    vec![k("frozen_order/were_starting_from_pole")]
                } else {
                    vec![
                        k("frozen_order/were_starting_from_position"),
                        Part::Pos(pos),
                    ]
                };
                out.push(Msg::new("race", prio::LOW, parts).ttl(90.0));
            }
        }
        if st == 3 && self.prev_state < 3 && self.prev_state > 0 {
            one(
                out,
                "race",
                prio::NORMAL,
                "frozen_order/thats_a_rolling_start",
            );
        }
        let fl = f.session_flags;
        if !self.started && !self.get_ready_said && fl & (F_START_READY | F_START_SET) != 0 {
            self.get_ready_said = true;
            out.push(Msg::new("race", prio::HIGH, vec![k("lap_counter/get_ready")]).ttl(5.0));
        }

        // Yeşil
        if !self.started && st == 4 {
            self.started = true;
            self.start_time = f.session_time;
            self.start_pos = pos;
            self.announced_pos = pos;
            self.last_pos = pos;
            if f.lap_completed <= 1
                && (fl & F_GREEN != 0 || self.prev_state == 3 || self.prev_state == 2)
            {
                out.push(
                    Msg::new(
                        "race",
                        prio::CRITICAL,
                        vec![k("lap_counter/green_green_green")],
                    )
                    .ttl(4.0),
                );
            }
        }
        if !self.started {
            return;
        }

        // Bitiş: damalı bayraktan sonra çizgiyi geçmek
        if (st >= 5 || fl & F_CHECKERED != 0) && self.checkered.is_none() {
            self.checkered = Some(if crossed {
                f.lap_completed - 1
            } else {
                f.lap_completed
            });
        }
        if !self.finished {
            if let Some(cl) = self.checkered {
                if f.lap_completed > cl || st >= 6 {
                    self.finished = true;
                    let key = if pos == 1 {
                        "lap_counter/won_race"
                    } else if pos <= 3 && pos > 0 {
                        "lap_counter/podium_finish"
                    } else if c.field >= 4 && pos >= c.field {
                        "lap_counter/finished_race_last"
                    } else if pos > 0 && (pos < self.start_pos || pos <= 5) {
                        "lap_counter/finished_race_good_finish"
                    } else {
                        "lap_counter/finished_race"
                    };
                    one(out, "race", prio::CRITICAL, key);
                    return;
                }
            }
        }
        if self.finished {
            return;
        }

        // Start değerlendirmesi
        if !self.start_reported && (f.session_time - self.start_time > 25.0 || f.lap_completed >= 2)
        {
            self.start_reported = true;
            if self.start_pos > 0 && pos > 0 {
                let d = self.start_pos - pos;
                let key = if d >= 2 {
                    "position/good_start"
                } else if d <= -3 {
                    "position/terrible_start"
                } else if d < 0 {
                    "position/bad_start"
                } else {
                    "position/ok_start"
                };
                one(out, "position", prio::NORMAL, key);
                self.announced_pos = pos;
            }
        }

        // Beyaz bayrak: son tur
        if fl & F_WHITE != 0 && self.prev_flags & F_WHITE == 0 && !self.last_lap_said {
            self.last_lap_said = true;
            let key = self.last_lap_key(pos);
            one(out, "race", prio::HIGH, key);
        }
        if let Some(at) = self.last_lap_pending {
            if now.duration_since(at) > Duration::from_millis(1500) {
                self.last_lap_pending = None;
                if !self.last_lap_said {
                    self.last_lap_said = true;
                    let key = self.last_lap_key(pos);
                    one(out, "race", prio::HIGH, key);
                }
            }
        }

        let sess = c.s.session(f.session_num);
        let laps_left = f.session_laps_remain;
        let laps_race = laps_left > 0 && laps_left < 32767;
        let total_laps = sess.and_then(|x| x.laps).unwrap_or(0);
        let total_time = sess.and_then(|x| x.time).unwrap_or(0.0);
        let remain = f.session_time_remain;
        let timed = !laps_race && remain > 0.0 && remain < 604_800.0 && total_time > 0.0;

        if crossed && laps_race {
            if laps_left == 2 && !self.two_to_go {
                self.two_to_go = true;
                let key = if pos == 1 {
                    "lap_counter/two_to_go_leading"
                } else if pos <= 3 {
                    "lap_counter/two_to_go_top_three"
                } else {
                    self.pick(&[
                        "lap_counter/two_to_go",
                        "race_time/one_more_lap_after_this_one",
                    ])
                };
                one(out, "race", prio::HIGH, key);
            } else if laps_left == 1 {
                self.last_lap_pending = Some(now);
            } else if [10, 5, 3].contains(&laps_left)
                && !self.laps_left_said.contains(&laps_left)
                && total_laps > laps_left + 2
            {
                self.laps_left_said.push(laps_left);
                let tail = if laps_left <= 5 {
                    self.pick(&[
                        "race_time/laps_remaining",
                        "lap_counter/laps_make_them_count",
                    ])
                } else {
                    "race_time/laps_remaining"
                };
                say(
                    out,
                    "race",
                    prio::NORMAL,
                    vec![Part::Int(laps_left as i64), k(tail)],
                );
            }
            if !self.half_done && total_laps >= 6 && laps_left <= total_laps / 2 {
                self.half_done = true;
                self.halfway(c, out);
            }
        }

        if timed {
            for (mins, key) in [
                (20u32, "race_time/twenty_minutes_left"),
                (15, "race_time/fifteen_minutes_left"),
                (10, "race_time/ten_minutes_left"),
                (5, "race_time/five_minutes_left"),
                (2, "race_time/two_minutes_left"),
                (1, "race_time/one_minute_remaining"),
            ] {
                let m = mins as f64 * 60.0;
                if total_time > m + 120.0
                    && remain <= m
                    && remain > m - 20.0
                    && !self.time_marks.contains(&mins)
                {
                    self.time_marks.push(mins);
                    let key = match (mins, pos) {
                        (5, 1) => "race_time/five_minutes_left_leading",
                        (5, 2..=3) => "race_time/five_minutes_left_podium",
                        _ => key,
                    };
                    one(out, "race", prio::HIGH, key);
                }
            }
            for mins in [60u32, 45, 30] {
                let m = mins as f64 * 60.0;
                if total_time > m + 300.0
                    && remain <= m
                    && remain > m - 20.0
                    && !self.time_marks.contains(&mins)
                {
                    self.time_marks.push(mins);
                    say(
                        out,
                        "race",
                        prio::NORMAL,
                        vec![
                            Part::Int(mins as i64),
                            k("numbers/minutes"),
                            k("race_time/remaining"),
                        ],
                    );
                }
            }
            if crossed
                && remain > 0.0
                && remain < 60.0
                && !self.less_than_minute
                && !self.last_lap_said
            {
                self.less_than_minute = true;
                one(out, "race", prio::NORMAL, "race_time/less_than_one_minute");
            }
            if crossed && pos == 1 {
                let lt = c.lap_time() as f64;
                if remain >= lt && remain < 2.0 * lt && !self.two_to_go {
                    self.two_to_go = true;
                    one(
                        out,
                        "race",
                        prio::HIGH,
                        "race_time/one_more_lap_after_this_one",
                    );
                }
            }
            if !self.half_done && remain <= total_time / 2.0 {
                self.half_done = true;
                self.halfway(c, out);
            }
        }
        if total_time > 0.0
            && self.prev_time_remain > 0.0
            && remain <= 0.0
            && !self.zero_said
            && !self.last_lap_said
        {
            self.zero_said = true;
            one(out, "race", prio::NORMAL, "race_time/zero_minutes_left");
        }
        self.prev_time_remain = remain;
    }

    fn last_lap_key(&mut self, pos: i32) -> &'static str {
        if pos == 1 {
            self.pick(&["lap_counter/last_lap_leading", "race_time/last_lap_leading"])
        } else if (2..=3).contains(&pos) {
            self.pick(&[
                "lap_counter/last_lap_top_three",
                "race_time/last_lap_top_three",
            ])
        } else {
            self.pick(&[
                "lap_counter/last_lap",
                "lap_counter/white_flag_last_lap",
                "race_time/last_lap",
                "race_time/this_is_the_last_lap",
                "flags/white_flag",
            ])
        }
    }

    /// Yarı mesafe: yarı yol, yakıt durumu, beklenen sıra
    fn halfway(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        one(out, "race", prio::NORMAL, "race_time/half_way");
        let fu = calc::fuel(c.f, c.s, c.t);
        if fu.samples > 0 && fu.avg5.usage > 0.0 {
            let key = if fu.race_needed > fu.level {
                "fuel/half_distance_low_fuel"
            } else {
                "fuel/half_distance_good_fuel"
            };
            one(out, "fuel", prio::NORMAL, key);
        }
        if self.expected > 0 && c.pos > 0 {
            let parts = if self.expected == 1 && c.pos == 1 {
                vec![k("position/expected_position_win_mid_race")]
            } else {
                vec![
                    k("position/expected_position_intro_mid_race"),
                    Part::Pos(self.expected),
                ]
            };
            say(out, "position", prio::LOW, parts);
        }
    }

    /// Antrenman / sıralama: oturum sonu, sıralamada kalan süre
    fn session_flow(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let fl = f.session_flags;
        if (f.session_state >= 5 || fl & F_CHECKERED != 0) && self.checkered.is_none() {
            self.checkered = Some(f.lap_completed);
            if c.kind == Kind::Qualify && c.pos == 1 {
                one(out, "race", prio::HIGH, "lap_counter/end_of_session_pole");
            } else {
                one(out, "race", prio::NORMAL, "lap_counter/end_of_session");
                if c.kind == Kind::Qualify && c.pos > 0 {
                    say(out, "position", prio::NORMAL, vec![Part::Pos(c.pos)]);
                }
            }
        }
        let total =
            c.s.session(f.session_num)
                .and_then(|x| x.time)
                .unwrap_or(0.0);
        let remain = f.session_time_remain;
        if c.kind == Kind::Qualify && remain > 0.0 && remain < 604_800.0 && total > 0.0 {
            for mins in [10u32, 5, 2, 1] {
                let m = mins as f64 * 60.0;
                if total > m + 120.0
                    && remain <= m
                    && remain > m - 20.0
                    && !self.time_marks.contains(&mins)
                {
                    self.time_marks.push(mins);
                    let parts = match mins {
                        10 => vec![k("race_time/ten_minutes_left")],
                        1 => vec![k("race_time/one_minute_remaining")],
                        _ => vec![
                            k("push_now/we_have"),
                            Part::Int(mins as i64),
                            k("push_now/minutes_to_set_a_lap"),
                        ],
                    };
                    say(out, "race", prio::HIGH, parts);
                }
            }
        }
    }

    // ------------------------------------------------------------------ pozisyon
    fn position(&mut self, c: &Ctx, crossed: bool, out: &mut Vec<Msg>) {
        let f = c.f;
        let pos = c.pos;
        if !self.started || self.finished || pos <= 0 {
            return;
        }
        let now = c.now;
        // Pitteyken sıra / tur farkı söylenmez; pistte hıza dönünce tek özet
        let off = self.traffic_off(f, now);
        // Anlık geçiş: sıra bir değişti ve iki araç da pistte
        if self.last_pos > 0
            && pos != self.last_pos
            && f.lap_completed >= 1
            && !off
            && self.start_reported
        {
            let d = self.last_pos - pos;
            if d == 1 {
                // Geçtiğimiz araç pitte değilse gerçek geçiş
                let passed = c.class_car(pos + 1);
                if passed.map(|i| !f.cars[i].on_pit).unwrap_or(false)
                    && self.ready("overtake", 25.0, now)
                {
                    one(out, "position", prio::NORMAL, "position/overtaking");
                }
            } else if d == -1 {
                let by = c.class_car(pos - 1);
                if by
                    .map(|i| !f.cars[i].on_pit && !self.prev_pit[i])
                    .unwrap_or(false)
                    && self.ready("overtaken", 25.0, now)
                {
                    one(out, "position", prio::NORMAL, "position/being_overtaken");
                }
            } else if d <= -2
                && c.sweary
                && secs_since(self.crash.map(|x| x.0), now) < 15.0
                && self.ready("rant", 600.0, now)
            {
                say(out, "pearls", prio::LOW, vec![k("rants/general")]);
            }
            self.last_pos_change = Some(now);
        }
        self.last_pos = pos;

        if !self.start_reported {
            return;
        }
        if off {
            if f.on_pit_road {
                self.pos_after_pit = true;
            }
            return;
        }
        let summary = !crossed && self.pos_after_pit;
        if !crossed && !summary {
            return;
        }
        self.pos_after_pit = false;
        let lap = f.lap_completed;
        if pos != self.announced_pos {
            self.announced_pos = pos;
            self.pos_lap = lap;
            let parts = if pos == 1 {
                vec![k("position/leading")]
            } else {
                vec![Part::Pos(pos)]
            };
            say(out, "position", prio::NORMAL, parts);
        } else if lap - self.pos_lap >= 5 {
            self.pos_lap = lap;
            out.push(Msg::new("position", prio::LOW, vec![Part::Pos(pos)]).ttl(8.0));
        }
        if summary {
            // tur sayaçlarına dokunma
        } else if c.field >= 4 && pos >= c.field {
            self.last_laps += 1;
            if self.last_laps == 1 {
                one(out, "position", prio::LOW, "position/last");
            } else if self.last_laps == 6 {
                one(out, "position", prio::LOW, "position/consistently_last");
            }
        } else {
            self.last_laps = 0;
        }
        // Tur farkı (sınıf liderine göre)
        let my_lc = f.cars[c.me].lap_completed;
        if pos > 1 {
            if let Some(l) = c.class_car(1) {
                let diff = if summary {
                    laps_between(f.cars[l].lap_completed, f.cars[l].pct, my_lc, f.cars[c.me].pct)
                } else {
                    f.cars[l].lap_completed - my_lc
                };
                if diff >= 1 && diff > self.lapped_said {
                    self.lapped_said = diff;
                    let parts = if diff == 1 {
                        vec![k("position/one_lap_down")]
                    } else {
                        vec![Part::Int(diff as i64), k("position/laps_behind")]
                    };
                    say(out, "position", prio::NORMAL, parts);
                }
            }
        } else if let Some(p2) = c.class_car(2) {
            let diff = if summary {
                laps_between(my_lc, f.cars[c.me].pct, f.cars[p2].lap_completed, f.cars[p2].pct)
            } else {
                my_lc - f.cars[p2].lap_completed - 1
            };
            if diff >= 1 && diff > self.lapping_said {
                self.lapping_said = diff;
                let parts = if diff == 1 {
                    vec![k("position/one_lap_ahead")]
                } else {
                    vec![Part::Int(diff as i64), k("position/laps_ahead")]
                };
                say(out, "position", prio::NORMAL, parts);
            }
        }
    }

    // ------------------------------------------------------------------ tur süreleri
    fn lap_done(&mut self, c: &Ctx, p: PendingLap, out: &mut Vec<Msg>) {
        let f = c.f;
        let lap = f.lap_last;
        let mine_sec = self.sectors.mine.take();
        // Pit kaybı: giriş + çıkış turu − 2 normal tur
        if c.race() {
            if p.in_lap && lap > 0.0 {
                self.in_lap_time = Some(lap);
            }
            if p.out_lap && lap > 0.0 {
                if let (Some(inl), Some(refl)) = (self.in_lap_time.take(), self.ref_lap) {
                    let loss = inl + lap - 2.0 * refl;
                    if loss > 8.0 && loss < 150.0 {
                        let first = self.pit_loss.is_none();
                        self.pit_loss = Some(loss);
                        if first {
                            say(
                                out,
                                "pit",
                                prio::LOW,
                                vec![
                                    k("strategy/a_pitstop_costs_us_about"),
                                    Part::Int(loss.round() as i64),
                                    k("numbers/seconds"),
                                ],
                            );
                        }
                    }
                }
            }
        }
        if p.dirty || p.in_lap || p.out_lap || lap <= 0.0 {
            return;
        }
        let prev_best = self.best_lap;
        let pb = prev_best > 0.0 && lap < prev_best - 0.001;
        if prev_best <= 0.0 || lap < prev_best {
            self.best_lap = lap;
        }
        self.laps.push(lap);
        if self.laps.len() > 12 {
            self.laps.remove(0);
        }
        // Normal tur referansı: son 3 temiz turun ortancası
        if self.laps.len() >= 3 {
            let mut v: Vec<f32> = self.laps.iter().rev().take(3).copied().collect();
            v.sort_by(|a, b| a.total_cmp(b));
            self.ref_lap = Some(v[1]);
        }

        // Sınıfın en iyisi (bizim dışımızda)
        let others_best = (0..MAX_CARS)
            .filter(|&i| i != c.me && c.same_class(i) && c.active(i))
            .map(|i| f.cars[i].best)
            .filter(|b| *b > 0.0)
            .fold(f32::MAX, f32::min);
        let overall_best = (0..MAX_CARS)
            .filter(|&i| i != c.me && c.active(i))
            .map(|i| f.cars[i].best)
            .filter(|b| *b > 0.0)
            .fold(f32::MAX, f32::min);
        let mut said = false;

        match c.kind {
            Kind::Race => {
                if pb && self.laps.len() >= 2 {
                    said = true;
                    if others_best < f32::MAX && self.best_lap < others_best {
                        let key = if c.multiclass {
                            "lap_times/best_lap_in_race_for_class"
                        } else {
                            "lap_times/best_lap_in_race"
                        };
                        one(out, "laptimes", prio::NORMAL, key);
                    } else {
                        one(out, "laptimes", prio::NORMAL, "lap_times/personal_best");
                    }
                    if self.chance(0.25) && self.ready("pearl", 360.0, c.now) {
                        one(out, "pearls", prio::CHATTER, "pearls_of_wisdom/keep_it_up");
                    }
                }
                let n = self.laps.len();
                if !said && n >= 4 {
                    let l: Vec<f32> = self.laps[n - 4..].to_vec();
                    let spread = l.iter().fold(f32::MIN, |a, b| a.max(*b))
                        - l.iter().fold(f32::MAX, |a, b| a.min(*b));
                    if spread < 0.25 && self.ready("consistent", 600.0, c.now) {
                        said = true;
                        one(out, "laptimes", prio::LOW, "lap_times/consistent");
                        if self.chance(0.2) && self.ready("pearl", 360.0, c.now) {
                            one(out, "pearls", prio::CHATTER, "pearls_of_wisdom/neutral");
                        }
                    } else if l[1] < l[0] - 0.1
                        && l[2] < l[1] - 0.1
                        && l[3] < l[2] - 0.1
                        && self.ready("improving", 300.0, c.now)
                    {
                        said = true;
                        one(out, "laptimes", prio::LOW, "lap_times/improving");
                    } else if l[1] > l[0] + 0.2
                        && l[2] > l[1] + 0.2
                        && l[3] > l[2] + 0.2
                        && self.ready("worsening", 300.0, c.now)
                    {
                        said = true;
                        one(out, "laptimes", prio::LOW, "lap_times/worsening");
                        if self.chance(0.3) && self.ready("pearl", 360.0, c.now) {
                            one(
                                out,
                                "pearls",
                                prio::CHATTER,
                                "pearls_of_wisdom/must_do_better",
                            );
                        }
                    }
                }
                // Yarış temposu: 4 turda bir, sınıfın ilk üçünün son 3 tur ortalamasına göre
                if !said && n >= 3 && f.lap_completed % 4 == 0 {
                    let mine = self.laps[n - 3..].iter().sum::<f32>() / 3.0;
                    let mut leaders: Vec<f32> = (1..=3)
                        .filter_map(|p| c.class_car(p))
                        .map(|i| c.t.cars[i].avg(3))
                        .filter(|a| *a > 0.0)
                        .collect();
                    leaders.sort_by(|a, b| a.total_cmp(b));
                    if let Some(best) = leaders.first() {
                        let d = mine - best;
                        let key = if d <= 0.0 {
                            "lap_times/setting_current_race_pace"
                        } else if d < 0.15 {
                            "lap_times/matching_race_pace"
                        } else if d < 0.5 {
                            "lap_times/pace_good"
                        } else if d < 1.0 {
                            "lap_times/pace_ok"
                        } else if d < 2.0 {
                            "lap_times/pace_bad"
                        } else {
                            "lap_times/off_the_pace"
                        };
                        one(out, "laptimes", prio::LOW, key);
                    }
                }
            }
            Kind::Qualify | Kind::Practice => {
                let mut parts: Vec<Part> = Vec::new();
                if pb {
                    parts.push(k("lap_times/personal_best"));
                } else if prev_best > 0.0 && lap < prev_best * 1.0015 {
                    parts.push(k("lap_times/good_lap"));
                }
                parts.push(k("lap_times/time_intro"));
                parts.push(Part::Lap(lap));
                say(out, "laptimes", prio::NORMAL, parts);
                let my_best = self.best_lap;
                if pb || prev_best <= 0.0 {
                    let class_ref = if c.multiclass {
                        others_best
                    } else {
                        overall_best
                    };
                    if class_ref < f32::MAX {
                        if my_best < class_ref {
                            let key = match (c.kind, c.multiclass) {
                                (Kind::Qualify, true) => "lap_times/quickest_in_class",
                                (Kind::Practice, true) => "lap_times/fastest_in_your_class",
                                _ => "lap_times/quickest_overall",
                            };
                            if c.kind == Kind::Qualify {
                                say(
                                    out,
                                    "laptimes",
                                    prio::NORMAL,
                                    vec![
                                        Part::Secs(class_ref - my_best),
                                        k("lap_times/quicker_than_second_place"),
                                    ],
                                );
                            } else {
                                one(out, "laptimes", prio::NORMAL, key);
                            }
                            if c.kind == Kind::Qualify && self.ready("pole", 120.0, c.now) {
                                one(out, "position", prio::NORMAL, "position/pole");
                            }
                        } else {
                            let gap = my_best - class_ref;
                            if gap < 0.1 {
                                one(
                                    out,
                                    "laptimes",
                                    prio::NORMAL,
                                    "lap_times/less_than_a_tenth_off_the_pace",
                                );
                            } else if gap < 5.0 && self.chance(0.5) {
                                say(
                                    out,
                                    "laptimes",
                                    prio::NORMAL,
                                    vec![
                                        k("lap_times/gap_intro"),
                                        Part::Secs(gap),
                                        k("lap_times/gap_outro_off_pace"),
                                    ],
                                );
                            } else {
                                let key = if gap < 0.2 {
                                    "lap_times/need_to_find_one_more_tenth"
                                } else if gap < 0.6 {
                                    "lap_times/need_to_find_a_few_more_tenths"
                                } else if gap < 1.2 {
                                    "lap_times/need_to_find_a_second"
                                } else if gap < 3.0 {
                                    "lap_times/need_to_find_more_than_a_second"
                                } else {
                                    "lap_times/off_the_pace"
                                };
                                one(out, "laptimes", prio::NORMAL, key);
                            }
                        }
                    }
                    if c.kind == Kind::Qualify && c.pos > 0 && c.pos != self.announced_pos {
                        self.announced_pos = c.pos;
                        say(out, "position", prio::NORMAL, vec![Part::Pos(c.pos)]);
                    }
                } else if let Some(secs) = mine_sec {
                    // Sektörler: sınıfın en iyi sektörlerine göre (yoksa kendi en iyimize göre)
                    let class_best: Vec<f32> = (0..3)
                        .map(|s| {
                            (0..MAX_CARS)
                                .filter(|&i| i != c.me && c.same_class(i))
                                .map(|i| self.sectors.cars[i].best[s])
                                .fold(f32::MAX, f32::min)
                                .min(self.my_best_sec[s])
                        })
                        .collect();
                    let pace = class_best.iter().all(|x| *x < f32::MAX)
                        && (0..3).any(|s| class_best[s] < self.my_best_sec[s]);
                    let reference: Vec<f32> = if pace {
                        class_best
                    } else {
                        self.my_best_sec.to_vec()
                    };
                    if reference.iter().all(|x| *x < f32::MAX) {
                        let d = [
                            secs[0] - reference[0],
                            secs[1] - reference[1],
                            secs[2] - reference[2],
                        ];
                        if let Some(key) = sector_message(d, pace) {
                            one(out, "sectors", prio::LOW, key);
                        }
                    }
                }
                if let Some(secs) = mine_sec {
                    for s in 0..3 {
                        self.my_best_sec[s] = self.my_best_sec[s].min(secs[s]);
                    }
                }
                return;
            }
        }
        if let Some(secs) = mine_sec {
            for s in 0..3 {
                self.my_best_sec[s] = self.my_best_sec[s].min(secs[s]);
            }
        }
    }

    // ------------------------------------------------------------------ aralar
    fn gaps(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        if f.lap_completed < 2 || self.traffic_off(f, c.now) {
            return;
        }
        let now = c.now;
        let ahead = c.class_car(c.pos - 1);
        let behind = c.class_car(c.pos + 1);
        let ga = ahead
            .and_then(|i| c.race_gap(i))
            .filter(|g| *g > 0.0 && *g < 60.0);
        let gb = behind
            .and_then(|i| c.race_gap(i))
            .map(|g| -g)
            .filter(|g| *g > 0.0 && *g < 60.0);
        let ai = ahead.map(|i| i as i32).unwrap_or(-1);
        let bi = behind.map(|i| i as i32).unwrap_or(-1);
        if ai != self.ahead_idx {
            self.ahead_idx = ai;
            self.ahead_hist.clear();
            self.close_ahead_laps = 0;
        }
        if bi != self.behind_idx {
            self.behind_idx = bi;
            self.behind_hist.clear();
            self.close_behind_laps = 0;
        }
        if let (Some(g), Some(i)) = (ga, ahead) {
            self.ahead_hist.push(g);
            self.close_ahead_laps = if g < 0.8 {
                self.close_ahead_laps + 1
            } else {
                0
            };
            let h = &self.ahead_hist;
            if h.len() >= 3 && !f.cars[i].on_pit {
                let d = h[h.len() - 1] - h[h.len() - 3];
                if d < -0.5 && g < 6.0 && self.ready("gap_ahead", 150.0, now) {
                    let first = if d < -0.8 {
                        "timings/youre_reeling"
                    } else {
                        "timings/gap_in_front_decreasing"
                    };
                    say(
                        out,
                        "gaps",
                        prio::LOW,
                        vec![k(first), k("timings/gap_in_front_is_now"), Part::Secs(g)],
                    );
                } else if d > 0.8 && g < 10.0 && self.ready("gap_ahead", 150.0, now) {
                    say(
                        out,
                        "gaps",
                        prio::LOW,
                        vec![
                            k("timings/gap_in_front_increasing"),
                            k("timings/gap_in_front_is_now"),
                            Part::Secs(g),
                        ],
                    );
                }
            }
            // Takılı kaldık: 3 turdur 0.8 sn içindeyiz ve bizim temiz turlarımız daha hızlı
            if self.close_ahead_laps >= 3 && self.ready("held_up", 300.0, now) {
                let theirs = c.t.cars[i].avg(3);
                if self.best_lap > 0.0 && theirs > 0.0 && self.best_lap < theirs - 0.2 {
                    one(out, "gaps", prio::LOW, "timings/being_held_up");
                }
            }
        }
        if let (Some(g), Some(i)) = (gb, behind) {
            self.behind_hist.push(g);
            self.close_behind_laps = if g < 0.6 {
                self.close_behind_laps + 1
            } else {
                0
            };
            let h = &self.behind_hist;
            if h.len() >= 3 && !f.cars[i].on_pit {
                let d = h[h.len() - 1] - h[h.len() - 3];
                if d < -0.5 && g < 4.0 && self.ready("gap_behind", 150.0, now) {
                    if d < -0.8 && g < 2.5 {
                        one(out, "gaps", prio::LOW, "timings/is_reeling_you_in");
                    } else {
                        say(
                            out,
                            "gaps",
                            prio::LOW,
                            vec![
                                k("timings/gap_behind_decreasing"),
                                k("timings/gap_behind_is_now"),
                                Part::Secs(g),
                            ],
                        );
                    }
                } else if d > 0.8 && g < 10.0 && self.ready("gap_behind", 150.0, now) {
                    say(
                        out,
                        "gaps",
                        prio::LOW,
                        vec![
                            k("timings/gap_behind_increasing"),
                            k("timings/gap_behind_is_now"),
                            Part::Secs(g),
                        ],
                    );
                }
            }
            if self.close_behind_laps >= 3 && self.ready("pressured", 300.0, now) {
                one(out, "gaps", prio::LOW, "timings/being_pressured");
            }
        }
    }

    // ------------------------------------------------------------------ rakipler
    fn opponents(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let racing = f.lap_completed >= 1 && f.session_time - self.start_time > 60.0;
        let leader = c.class_car(1);
        let ahead = c.class_car(c.pos - 1);
        let behind = c.class_car(c.pos + 1);
        for i in 0..MAX_CARS {
            if i == c.me || !c.active(i) {
                continue;
            }
            let car = f.cars[i];
            let entered = car.on_pit && !self.prev_pit[i];
            let exited = !car.on_pit && self.prev_pit[i];
            if entered {
                self.pit_tire[i] = car.tire;
            }
            if !racing {
                continue;
            }
            if entered && c.same_class(i) && self.car_ready(1, i, 60.0, now) {
                if Some(i) == leader && c.pos != 1 {
                    one(
                        out,
                        "opponents",
                        prio::NORMAL,
                        "opponents/the_leader_is_pitting",
                    );
                } else if Some(i) == ahead {
                    let key = self.pick(&[
                        "opponents/the_car_ahead_is_pitting",
                        "opponents/ahead_is_pitting",
                    ]);
                    let mut parts = vec![k(key)];
                    // Pit kaybını biliyorsak: önümüzde mi arkamızda mı çıkar
                    if let (Some(loss), Some(g)) = (self.pit_loss, c.race_gap(i)) {
                        let after = g - loss;
                        if after < 0.0 && after > -3.0 {
                            parts.push(k("strategy/he_will_come_out_just_behind"));
                        } else if after > 0.0 && after < 3.0 {
                            parts.push(k("strategy/he_will_come_out_just_in_front"));
                        }
                    }
                    say(out, "opponents", prio::NORMAL, parts);
                } else if Some(i) == behind {
                    let key = self.pick(&[
                        "opponents/the_car_behind_is_pitting",
                        "opponents/behind_is_pitting",
                    ]);
                    one(out, "opponents", prio::NORMAL, key);
                }
            }
            if exited {
                // Lastik değişimi (kuru ↔ yağmur)
                let (before, after) = (self.pit_tire[i], car.tire);
                if before >= 0 && after >= 0 && (before == 0) != (after == 0) && c.same_class(i) {
                    let tyre = if after == 0 {
                        "tyre_monitor/slicks"
                    } else {
                        "tyre_monitor/wets"
                    };
                    let who = if Some(i) == leader && c.pos != 1 {
                        Some("opponents/the_leader_is_now_on")
                    } else if Some(i) == ahead {
                        Some("opponents/the_car_ahead_is_now_on")
                    } else if Some(i) == behind {
                        Some("opponents/the_car_behind_is_now_on")
                    } else {
                        None
                    };
                    if let Some(w) = who {
                        say(out, "opponents", prio::NORMAL, vec![k(w), k(tyre)]);
                    }
                }
                // Pitten çıkan araç hemen yanımızda
                if !f.on_pit_road {
                    if let Some(g) = c.track_gap(i) {
                        if g > -2.5 && g < 1.5 && self.ready("car_exit_pits", 20.0, now) {
                            one(
                                out,
                                "opponents",
                                prio::HIGH,
                                "opponents/car_exiting_pits_be_careful",
                            );
                        }
                    }
                }
                // Arkamızdaki rakip pitten çıktı: bas
                if Some(i) == behind
                    && c.track_gap(i).map(|g| g > 0.0 && g < 12.0).unwrap_or(false)
                    && self.car_ready(2, i, 120.0, now)
                {
                    one(out, "push", prio::HIGH, "push_now/opponent_exiting_pits");
                }
            }
        }
        if !racing {
            return;
        }
        // Sınıfın en hızlı turu
        let mut best = (f32::MAX, usize::MAX);
        for i in 0..MAX_CARS {
            if i != c.me
                && c.same_class(i)
                && c.active(i)
                && f.cars[i].best > 0.0
                && f.cars[i].best < best.0
            {
                best = (f.cars[i].best, i);
            }
        }
        if best.1 != usize::MAX {
            if self.class_best > 0.0 && best.0 < self.class_best - 0.001 && f.lap_completed >= 2 {
                let i = best.1;
                let key = if Some(i) == leader && c.pos != 1 {
                    Some("opponents/the_leader_has_just_done_a")
                } else if Some(i) == ahead {
                    Some("opponents/the_car_ahead_has_just_done_a")
                } else if Some(i) == behind {
                    Some("opponents/the_car_behind_has_just_done_a")
                } else {
                    None
                };
                if let Some(key) = key {
                    say(out, "opponents", prio::LOW, vec![k(key), Part::Lap(best.0)]);
                }
            }
            if self.class_best <= 0.0 || best.0 < self.class_best {
                self.class_best = best.0;
            }
        }
        // Öndeki yeni rakip: numarası, reytingi, lisansı; düşük güvenlik puanı uyarısı
        if let Some(i) = ahead {
            let gap = c.race_gap(i).unwrap_or(99.0);
            if i as i32 != self.next_car_said
                && gap > 0.0
                && gap < 2.5
                && self.ready("next_car", 45.0, now)
            {
                self.next_car_said = i as i32;
                if let Some(d) = c.s.driver(i) {
                    let num: String = d
                        .car_number
                        .chars()
                        .filter(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(n) = num.parse::<i64>() {
                        let mut parts = vec![
                            k("opponents/next_car_is"),
                            k("opponents/car_number"),
                            Part::Int(n),
                        ];
                        if c.iracing && d.irating > 0 {
                            parts.push(k("opponents/rating_intro"));
                            parts.push(Part::Int(d.irating as i64));
                        }
                        if c.iracing {
                            if let (Some(lk), _) = c.licence(i) {
                                parts.push(k(lk));
                            }
                        }
                        say(out, "opponents", prio::LOW, parts);
                    }
                }
            }
            self.reputation(c, i, gap, true, out);
        }
        if let Some(i) = behind {
            let gap = c.race_gap(i).map(|g| -g).unwrap_or(99.0);
            self.reputation(c, i, gap, false, out);
        }
        // Arkamızdan tur bindiren ya da turunu geri alan aynı sınıf araç
        // Biz pitteyken (ve pit çıkışından hemen sonra) susar: pit kutusunda dururken pistten geçen her
        // araç "0,3–1,5 sn arkada" görünür. Pistte de tür başına bekleme + araç başına tek duyuru.
        if self.traffic_off(f, now) {
            return;
        }
        for i in 0..MAX_CARS {
            if i == c.me || !c.active(i) || !c.same_class(i) || f.cars[i].on_pit {
                continue;
            }
            let Some(g) = c.track_gap(i) else { continue };
            if !(0.3..1.5).contains(&g) {
                continue;
            }
            let (theirs, mine) = (f.cars[i].lap_completed, f.cars[c.me].lap_completed);
            if theirs > mine {
                let since = secs_since(self.cd.get("lapped_cat").copied(), now);
                let (mark, speak) = lapped_call(self.lapped_by.get(&i).copied(), theirs - mine, since);
                if mark {
                    self.lapped_by.insert(i, theirs - mine);
                }
                if speak {
                    self.cd.insert("lapped_cat", now);
                    one(
                        out,
                        "gaps",
                        prio::NORMAL,
                        "timings/car_behind_is_lapping_us",
                    );
                }
            } else if theirs < mine && Some(i) != behind {
                let (ta, ma) = (c.t.cars[i].avg(3), c.t.cars[c.me].avg(3));
                if ta > 0.0
                    && ma > 0.0
                    && ta < ma - 0.3
                    && self.car_ready(4, i, 90.0, now)
                    && self.ready("unlap_cat", LAPPED_CAT_CD, now)
                {
                    one(
                        out,
                        "gaps",
                        prio::NORMAL,
                        "timings/car_behind_is_unlapping_itself",
                    );
                }
            }
        }
    }

    fn reputation(&mut self, c: &Ctx, i: usize, gap: f32, ahead: bool, out: &mut Vec<Msg>) {
        if !c.iracing
            || !(0.0..1.5).contains(&gap)
            || self.rep_said.contains(&i)
            || self.traffic_off(c.f, c.now)
        {
            return;
        }
        let (_, sr) = c.licence(i);
        if sr < 0.0 || sr >= 2.5 {
            return;
        }
        self.rep_said.push(i);
        let key = match (ahead, sr < 1.5) {
            (true, true) => "timings/opponent_ahead_has_bad_reputation",
            (true, false) => "timings/opponent_ahead_has_below_average_reputation",
            (false, true) => "timings/opponent_behind_has_bad_reputation",
            (false, false) => "timings/opponent_behind_has_below_average_reputation",
        };
        one(out, "gaps", prio::LOW, key);
    }

    // ------------------------------------------------------------------ son turlarda bas
    fn push_now(&mut self, c: &Ctx, crossed: bool, out: &mut Vec<Msg>) {
        if self.push_said || !crossed {
            return;
        }
        let f = c.f;
        let laps_left = f.session_laps_remain;
        let laps_race = laps_left > 0 && laps_left < 32767;
        let remain = f.session_time_remain;
        let n = if laps_race {
            if laps_left != 4 {
                return;
            }
            laps_left - 1
        } else if remain > 0.0 && remain < 300.0 && remain > 120.0 {
            ((remain as f32) / c.lap_time()).ceil() as i32
        } else {
            return;
        };
        self.push_said = true;
        let reach = n as f32 * 0.8;
        let ga = c
            .class_car(c.pos - 1)
            .and_then(|i| c.race_gap(i))
            .filter(|g| *g > 0.0);
        let gb = c
            .class_car(c.pos + 1)
            .and_then(|i| c.race_gap(i))
            .map(|g| -g)
            .filter(|g| *g > 0.0);
        let key = if ga.map(|g| g < reach).unwrap_or(false) {
            match c.pos - 1 {
                1 => "push_now/push_to_get_win",
                2 => "push_now/push_to_get_second",
                3 => "push_now/push_to_get_third",
                _ => "push_now/push_to_improve",
            }
        } else if gb.map(|g| g < reach).unwrap_or(false) {
            "push_now/push_to_hold_position"
        } else {
            return;
        };
        let mut parts = vec![k(key)];
        if laps_race {
            parts.extend([
                k("push_now/we_have"),
                Part::Int(n as i64),
                k("push_now/laps_to_get_the_job_done"),
            ]);
        }
        say(out, "push", prio::HIGH, parts);
    }

    // ------------------------------------------------------------------ yakıt
    fn fuel(&mut self, c: &Ctx, crossed: bool, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        // Pit çıkışında stint durumları sıfırlanır
        if self.prev_on_pit && !f.on_pit_road {
            self.fuel_warned = 99;
            self.fuel_time_warned = 999;
            self.fuel_low_said = false;
            self.run_out_said = false;
            self.half_tank_said = false;
            self.stint_est_said = false;
            self.pit_this_lap_said = false;
        }
        if f.fuel_level <= 0.0 || f.on_pit_road {
            self.prev_fuel = f.fuel_level;
            return;
        }
        let fu = calc::fuel(f, c.s, c.t);
        let gal = 3.785_41_f32;
        let conv = |l: f32| if c.imperial { l / gal } else { l };
        let unit_rem = if c.imperial {
            "fuel/gallons_remaining"
        } else {
            "fuel/litres_remaining"
        };
        let unit_per_lap = if c.imperial {
            "fuel/gallons_per_lap"
        } else {
            "fuel/litres_per_lap"
        };
        let unit_to_end = if c.imperial {
            "fuel/gallons_to_get_to_the_end"
        } else {
            "fuel/litres_to_get_to_the_end"
        };
        let ok = fu.samples > 0 && fu.avg5.usage > 0.0;
        let race = c.race() && self.started && !self.finished;
        let laps_race = f.session_laps_remain > 0 && f.session_laps_remain < 32767;
        // Yarışta: bitişe yetmiyor mu
        let short = !race || fu.race_laps_left > fu.avg5.laps + 0.2;

        // Bir litre / galon kaldı
        let lim = if c.imperial { gal } else { 1.0 };
        if self.prev_fuel > lim && f.fuel_level <= lim && short && !self.fuel_low_said {
            self.fuel_low_said = true;
            one(
                out,
                "fuel",
                prio::HIGH,
                if c.imperial {
                    "fuel/one_gallon_remaining"
                } else {
                    "fuel/one_litre_remaining"
                },
            );
        } else if c.imperial && self.prev_fuel > gal * 0.5 && f.fuel_level <= gal * 0.5 && short {
            one(out, "fuel", prio::HIGH, "fuel/half_a_gallon_remaining");
        }
        // Depo yarıya indi (bitişe yetmeyecekse)
        if race
            && fu.max > 0.0
            && self.prev_fuel > fu.max / 2.0
            && f.fuel_level <= fu.max / 2.0
            && short
            && !self.half_tank_said
            && ok
        {
            self.half_tank_said = true;
            one(out, "fuel", prio::LOW, "fuel/half_tank_warning");
        }
        self.prev_fuel = f.fuel_level;
        if !ok {
            return;
        }
        let laps = fu.avg5.laps;

        if laps < 0.5 && short && !self.run_out_said {
            self.run_out_said = true;
            one(out, "fuel", prio::CRITICAL, "fuel/about_to_run_out");
        }
        // Süreli yarış: dakika uyarıları; turlu yarış ve antrenman: tur uyarıları
        let timed_race = race && !laps_race;
        if timed_race {
            let mins = fu.time_to_empty / 60.0;
            for (m, key) in [
                (10u32, "fuel/ten_minutes_fuel"),
                (5, "fuel/five_minutes_fuel"),
                (2, "fuel/two_minutes_fuel"),
            ] {
                if mins <= m as f32 && mins > m as f32 - 0.5 && m < self.fuel_time_warned && short {
                    self.fuel_time_warned = m;
                    one(out, "fuel", prio::HIGH, key);
                }
            }
        } else if crossed && short {
            let lvl = if laps < 1.2 {
                1
            } else if laps < 2.2 {
                2
            } else if laps < 3.2 {
                3
            } else if laps < 4.2 {
                4
            } else {
                99
            };
            if lvl < self.fuel_warned {
                self.fuel_warned = lvl;
                let key = match lvl {
                    1 => "fuel/one_lap_fuel",
                    2 => "fuel/two_laps_fuel",
                    3 => "fuel/three_laps_fuel",
                    _ => "fuel/four_laps_fuel",
                };
                one(out, "fuel", prio::HIGH, key);
            }
        }

        // Stint tahmini (antrenman/sıralama): 3. turda tur başı tüketim, kalan tur, kalan yakıt
        let stint = c.t.cars[c.me].stint(f.lap_completed);
        if !c.race() && crossed && stint >= 3 && !self.stint_est_said && fu.samples >= 2 {
            self.stint_est_said = true;
            say(
                out,
                "fuel",
                prio::LOW,
                vec![
                    k("fuel/we_estimate"),
                    Part::Dec(conv(fu.avg5.usage)),
                    k(unit_per_lap),
                ],
            );
            say(
                out,
                "fuel",
                prio::LOW,
                vec![
                    k("fuel/we_estimate"),
                    Part::Int(laps.floor() as i64),
                    k("fuel/laps_remaining"),
                ],
            );
            let mins = (fu.time_to_empty / 60.0).floor() as i64;
            if mins >= 2 {
                say(
                    out,
                    "fuel",
                    prio::LOW,
                    vec![
                        k("fuel/we_estimate"),
                        Part::Int(mins),
                        k("fuel/minutes_remaining"),
                    ],
                );
            }
            say(
                out,
                "fuel",
                prio::LOW,
                vec![Part::Int(conv(f.fuel_level).round() as i64), k(unit_rem)],
            );
        }

        if !race {
            return;
        }
        // Yarış: 2 ölçümden sonra bir kez genel durum
        if crossed && !self.fuel_status && fu.samples >= 2 && fu.race_laps_left > 1.0 {
            self.fuel_status = true;
            let margin = laps - fu.race_laps_left;
            if margin >= 2.0 {
                one(out, "fuel", prio::NORMAL, "fuel/plenty_of_fuel");
            } else if margin >= 0.3 {
                one(out, "fuel", prio::NORMAL, "fuel/fuel_should_be_ok");
            } else if margin >= -0.7 {
                one(out, "fuel", prio::NORMAL, "fuel/fuel_will_be_tight");
                say(
                    out,
                    "fuel",
                    prio::NORMAL,
                    vec![
                        k("fuel/we_estimate_we_will_need"),
                        Part::Int(conv(fu.race_needed).ceil() as i64),
                        k(unit_to_end),
                    ],
                );
            } else {
                one(
                    out,
                    "fuel",
                    prio::NORMAL,
                    "fuel/we_will_need_to_pit_for_fuel",
                );
                if fu.pit_open > 0 && fu.pit_close >= fu.pit_open {
                    self.window_said = true;
                    let parts = if !laps_race && fu.pit_open_in > 60.0 {
                        let (o, cl) = (
                            (fu.pit_open_in / 60.0).round() as i64,
                            (fu.pit_close_in / 60.0).round() as i64,
                        );
                        vec![
                            k("fuel/pit_window_for_fuel_opens_after"),
                            Part::Int(o),
                            k("numbers/minutes"),
                            k("fuel/and_closes_after"),
                            Part::Int(cl),
                            k("numbers/minutes"),
                        ]
                    } else if fu.pit_open > f.lap {
                        vec![
                            k("fuel/pit_window_for_fuel_opens_on_lap"),
                            Part::Int(fu.pit_open as i64),
                            k("fuel/and_will_close_on_lap"),
                            Part::Int(fu.pit_close as i64),
                        ]
                    } else {
                        vec![
                            k("fuel/pit_window_for_fuel_closes_on_lap"),
                            Part::Int(fu.pit_close as i64),
                        ]
                    };
                    say(out, "fuel", prio::NORMAL, parts);
                }
                if fu.max > 0.0 && fu.avg5.refuel > fu.max * 0.98 {
                    one(out, "fuel", prio::NORMAL, "fuel/will_need_to_stop_again");
                }
            }
        }
        // Pit penceresi (tek duraklı yakıt penceresi)
        if fu.pit_open > 0 {
            if crossed && !self.pit_open_said && f.lap >= fu.pit_open {
                self.pit_open_said = true;
                one(
                    out,
                    "pit",
                    prio::NORMAL,
                    "mandatory_pit_stops/pit_window_open",
                );
            } else if crossed
                && !self.pit_close_said
                && fu.pit_close > 0
                && f.lap + 1 >= fu.pit_close
            {
                self.pit_close_said = true;
                one(
                    out,
                    "pit",
                    prio::HIGH,
                    "mandatory_pit_stops/pit_window_closing",
                );
            }
            if !laps_race {
                for (secs, key, opening) in [
                    (120.0, "mandatory_pit_stops/pit_window_opens_2_min", true),
                    (60.0, "mandatory_pit_stops/pit_window_opens_1_min", true),
                    (120.0, "mandatory_pit_stops/pit_window_closes_2_min", false),
                    (60.0, "mandatory_pit_stops/pit_window_closes_1_min", false),
                ] {
                    let v = if opening {
                        fu.pit_open_in
                    } else {
                        fu.pit_close_in
                    };
                    if v <= secs && v > secs - 5.0 && self.ready(key, 30.0, now) {
                        one(out, "pit", prio::NORMAL, key);
                    }
                }
            }
        }
        if short {
            if crossed && laps >= 1.0 && laps < 2.0 && !self.pit_this_lap_said {
                self.pit_this_lap_said = true;
                one(out, "pit", prio::HIGH, "mandatory_pit_stops/pit_this_lap");
            }
            if f.lap_dist_pct > 0.8 && laps < 1.25 && self.box_now_lap != f.lap {
                self.box_now_lap = f.lap;
                one(out, "pit", prio::CRITICAL, "mandatory_pit_stops/box_now");
            }
        }
    }

    // ------------------------------------------------------------------ pit yolu
    fn pit(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let limit = c.s.pit_limit_kph / 3.6;
        let limiter = f.engine_warnings & EW_LIMITER != 0;
        let me = f.cars[c.me];
        if f.on_pit_road && !self.prev_on_pit {
            // Pite giriş
            self.cur_in = true;
            self.pit_entries += 1;
            if limit > 0.0 && !limiter && f.speed > limit + 1.0 {
                one(out, "pit", prio::HIGH, "mandatory_pit_stops/engage_limiter");
            }
            if self.pit_entries == 1 && limit > 0.0 && !c.race() {
                let (v, unit) = if c.imperial {
                    (c.s.pit_limit_kph / 1.609_344, "frozen_order/miles_per_hour")
                } else {
                    (c.s.pit_limit_kph, "frozen_order/kilometres_per_hour")
                };
                say(
                    out,
                    "pit",
                    prio::NORMAL,
                    vec![
                        k("mandatory_pit_stops/pit_speed_limit"),
                        Part::Int(v.round() as i64),
                        k(unit),
                    ],
                );
            }
            if c.race() && self.started && !self.finished {
                // Bitişe kadar ne kadar yakıt lazım
                let fu = calc::fuel(f, c.s, c.t);
                if fu.samples > 0 && fu.avg5.refuel > 0.5 {
                    let need = fu.avg5.refuel + fu.avg5.usage * 0.5;
                    let parts = if c.imperial && need <= 3.785 {
                        vec![k("fuel/need_to_add_one_gallon_to_get_to_the_end")]
                    } else if c.imperial {
                        vec![
                            k("fuel/we_will_need_to_add"),
                            Part::Int((need / 3.785).ceil() as i64),
                            k("fuel/gallons_to_get_to_the_end"),
                        ]
                    } else {
                        vec![
                            k("fuel/we_will_need_to_add"),
                            Part::Int(need.ceil() as i64),
                            k("fuel/litres_to_get_to_the_end"),
                        ]
                    };
                    say(out, "fuel", prio::HIGH, parts);
                }
                // Pit kaybını biliyorsak: kaçıncı çıkarız, trafik var mı
                if let Some(loss) = self.pit_loss {
                    let mine = me.f2;
                    if mine > 0.0 || c.pos == 1 {
                        let after = mine + loss;
                        let ahead = (0..MAX_CARS)
                            .filter(|&i| {
                                i != c.me && c.same_class(i) && c.active(i) && !f.cars[i].on_pit
                            })
                            .filter(|&i| {
                                f.cars[i].f2 >= 0.0
                                    && f.cars[i].f2 < after
                                    && (f.cars[i].f2 > 0.0 || f.cars[i].class_position == 1)
                            })
                            .count() as i32;
                        say(
                            out,
                            "pit",
                            prio::NORMAL,
                            vec![
                                k("strategy/we_should_emerge_in_position"),
                                Part::Pos(ahead + 1),
                            ],
                        );
                        let traffic = (0..MAX_CARS)
                            .filter(|&i| i != c.me && c.active(i) && !f.cars[i].on_pit)
                            .any(|i| (f.cars[i].f2 - after).abs() < 2.0 && f.cars[i].f2 > 0.0);
                        one(
                            out,
                            "pit",
                            prio::NORMAL,
                            if traffic {
                                "strategy/expect_traffic_on_pit_exit"
                            } else {
                                "strategy/expect_clear_track_on_pit_exit"
                            },
                        );
                    }
                }
            }
        }
        if !f.on_pit_road && self.prev_on_pit {
            // Pitten çıkış
            self.cur_out = true;
            self.pit_exit_at = Some(now);
            self.last_pit_exit = Some(now);
            // Yeni stint: tur bindiren araçlar yeniden (tür beklemesiyle) duyurulabilir
            self.lapped_by.clear();
            if c.race() && self.started && !self.finished && f.lap_completed >= 1 {
                let traffic = (0..MAX_CARS)
                    .filter(|&i| i != c.me && c.active(i) && !f.cars[i].on_pit)
                    .any(|i| c.track_gap(i).map(|g| g > 0.2 && g < 4.0).unwrap_or(false));
                one(
                    out,
                    "push",
                    prio::HIGH,
                    if traffic {
                        "push_now/pits_exit_traffic_behind"
                    } else {
                        "push_now/pits_exit_clear"
                    },
                );
            }
        }
        if let Some(at) = self.pit_exit_at {
            let s = now.duration_since(at).as_secs_f32();
            if s > 2.0 {
                self.pit_exit_at = None;
                if limiter && !f.on_pit_road {
                    one(
                        out,
                        "pit",
                        prio::HIGH,
                        "mandatory_pit_stops/disengage_limiter",
                    );
                }
            }
        }
        // Pit yolunda hız aşımı
        if f.on_pit_road && limit > 0.0 && me.surface != 1 && f.speed > limit + 0.6 && !limiter {
            let since = *self.speeding_since.get_or_insert(now);
            if now.duration_since(since) > Duration::from_millis(700)
                && self.ready("pit_speed", 8.0, now)
            {
                let key = self.pick(&[
                    "mandatory_pit_stops/watch_your_pit_speed",
                    "mandatory_pit_stops/watch_your_speed",
                ]);
                one(out, "pit", prio::CRITICAL, key);
            }
        } else {
            self.speeding_since = None;
        }
    }

    // ------------------------------------------------------------------ lastikler
    fn tyres(&mut self, c: &Ctx, crossed: bool, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let me = f.cars[c.me];
        let temp_sum: f32 = f.tire_temp.iter().flatten().sum();
        let wear_sum: f32 = f.tire_wear.iter().flatten().sum();
        let moving = !f.on_pit_road && f.speed > 5.0;
        if moving && (temp_sum - self.temp_sum).abs() > 0.3 && temp_sum > 0.0 {
            self.temps_live_at = Some(now);
        }
        if moving && (wear_sum - self.wear_sum).abs() > 0.0005 && f.tire_wear[0][0] >= 0.0 {
            self.wear_live_at = Some(now);
        }
        // iRacing: lastik verisi pit kutusunda güncellenir → antrenmanda kamber yorumu
        if !moving
            && me.surface == 1
            && (temp_sum - self.temp_sum).abs() > 1.0
            && temp_sum > 0.0
            && secs_since(self.temps_live_at, now) > 30.0
        {
            self.camber_pending = Some(now);
        }
        self.temp_sum = temp_sum;
        self.wear_sum = wear_sum;
        if self.prev_on_pit && !f.on_pit_road {
            self.wear_level = 0;
            self.cold_said = false;
            self.good_temps_said = false;
            self.tyre_temp_said = None;
        }
        if let Some(at) = self.camber_pending {
            if now.duration_since(at) > Duration::from_secs(2) {
                self.camber_pending = None;
                if c.kind == Kind::Practice && !self.camber_said {
                    self.camber_said = true;
                    self.camber(c, out);
                }
            }
        }
        if !crossed || f.on_pit_road {
            return;
        }
        let stint = c.t.cars[c.me].stint(f.lap_completed);
        let temps_live = secs_since(self.temps_live_at, now) < 15.0;
        let wear_live = secs_since(self.wear_live_at, now) < 120.0;
        if temps_live {
            let wet = me.tire >= 1 || f.track_wetness >= 4;
            let (cold, hot, cook) = if wet {
                (40.0, 85.0, 95.0)
            } else {
                (65.0, 100.0, 110.0)
            };
            let avg: Vec<f32> = f
                .tire_temp
                .iter()
                .map(|t| (t[0] + t[1] + t[2]) / 3.0)
                .collect();
            let set = |pred: &dyn Fn(f32) -> bool| -> [bool; 4] {
                [pred(avg[0]), pred(avg[1]), pred(avg[2]), pred(avg[3])]
            };
            let cooking = set(&|x| x > cook);
            let hotset = set(&|x| x > hot);
            let coldset = set(&|x| x < cold && x > 1.0);
            let report = if let Some(g) = corner_group(cooking) {
                Some(("cooking", g))
            } else if let Some(g) = corner_group(hotset) {
                Some(("hot", g))
            } else if let Some(g) = corner_group(coldset) {
                if stint <= 3 {
                    Some(("cold", g))
                } else {
                    None
                }
            } else {
                None
            };
            match report {
                Some((state, g)) => {
                    if let Some(key) = tyre_key(state, g) {
                        let lap = f.lap_completed;
                        let again = match self.tyre_temp_said {
                            Some((k0, l)) => k0 != key || lap - l >= 4,
                            None => true,
                        };
                        if again {
                            self.tyre_temp_said = Some((key, lap));
                            if state == "cold" {
                                self.cold_said = true;
                            }
                            one(
                                out,
                                "tyres",
                                if state == "cold" {
                                    prio::LOW
                                } else {
                                    prio::NORMAL
                                },
                                key,
                            );
                        }
                    }
                }
                None => {
                    if self.cold_said
                        && !self.good_temps_said
                        && avg.iter().all(|x| *x >= cold && *x <= hot)
                    {
                        self.good_temps_said = true;
                        one(out, "tyres", prio::LOW, "tyre_monitor/good_tyre_temps");
                    }
                }
            }
        }
        if wear_live {
            // Kalan diş: < 0.80 hafif, < 0.55 aşınmış, < 0.30 bitmiş
            let rem: Vec<f32> = f
                .tire_wear
                .iter()
                .map(|w| w.iter().fold(1.0f32, |a, b| a.min(*b)))
                .collect();
            let level = |x: f32| {
                if x < 0.30 {
                    3u8
                } else if x < 0.55 {
                    2
                } else if x < 0.80 {
                    1
                } else {
                    0
                }
            };
            let lv: Vec<u8> = rem.iter().map(|x| level(*x)).collect();
            let top = *lv.iter().max().unwrap_or(&0);
            if top > self.wear_level {
                self.wear_level = top;
                let set = [lv[0] == top, lv[1] == top, lv[2] == top, lv[3] == top];
                let state = match top {
                    1 => "minor",
                    2 => "worn",
                    _ => "knackered",
                };
                if let Some(key) = corner_group(set).and_then(|g| tyre_key(state, g)) {
                    one(
                        out,
                        "tyres",
                        if top >= 3 { prio::HIGH } else { prio::NORMAL },
                        key,
                    );
                }
            }
        } else if c.race() && self.started {
            // Aşınma bilinmiyorsa: bu lastiklerle kaç tur / dakika
            let laps_race = f.session_laps_remain > 0 && f.session_laps_remain < 32767;
            if laps_race && stint >= 10 && stint % 10 == 0 {
                say(
                    out,
                    "tyres",
                    prio::LOW,
                    vec![
                        k("tyre_monitor/laps_on_current_tyres_intro"),
                        Part::Int(stint as i64),
                        k("tyre_monitor/laps_on_current_tyres_outro"),
                    ],
                );
            } else if !laps_race {
                let mins = ((f.session_time - c.t.fuel.stint_start) / 60.0) as i64;
                if mins >= 20 && self.ready("tyre_minutes", 1190.0, now) {
                    say(
                        out,
                        "tyres",
                        prio::LOW,
                        vec![
                            k("tyre_monitor/minutes_on_current_tyres_intro"),
                            Part::Int(mins),
                            k("tyre_monitor/minutes_on_current_tyres_outro"),
                        ],
                    );
                }
            }
        }
    }

    /// Pit kutusunda ölçülen iç/dış sıcaklık farkından kamber yorumu (ön ve arka aks)
    fn camber(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let t = &c.f.tire_temp;
        // Sol lastiklerde iç taraf sağdadır (indeks 2), sağ lastiklerde solda (indeks 0)
        let inner = |i: usize| if i % 2 == 0 { t[i][2] } else { t[i][0] };
        let outer = |i: usize| if i % 2 == 0 { t[i][0] } else { t[i][2] };
        let mut advice: Vec<&'static str> = Vec::new();
        for (axle, a, b) in [("front", 0usize, 1usize), ("rear", 2, 3)] {
            if inner(a) <= 1.0 || inner(b) <= 1.0 {
                return;
            }
            let d = ((inner(a) - outer(a)) + (inner(b) - outer(b))) / 2.0;
            let front = axle == "front";
            let parts = if d.abs() < 3.0 {
                vec![k(if front {
                    "tyre_monitor/average_front_inner_and_outer_same"
                } else {
                    "tyre_monitor/average_rear_inner_and_outer_same"
                })]
            } else {
                vec![
                    k(if front {
                        "tyre_monitor/average_front_inner_temps_are"
                    } else {
                        "tyre_monitor/average_rear_inner_temps_are"
                    }),
                    Part::Int(d.abs().round() as i64),
                    k(if d > 0.0 {
                        "tyre_monitor/celsius_hotter_than_outers"
                    } else {
                        "tyre_monitor/celsius_colder_than_outers"
                    }),
                ]
            };
            say(out, "tyres", prio::LOW, parts);
            if d < 0.0 {
                advice.push(if front {
                    "tyre_monitor/you_need_more_negative_camber_on_fronts"
                } else {
                    "tyre_monitor/you_need_more_negative_camber_on_rears"
                });
            } else if d > 12.0 {
                advice.push(if front {
                    "tyre_monitor/you_need_more_positive_camber_on_fronts"
                } else {
                    "tyre_monitor/you_need_more_positive_camber_on_rears"
                });
            }
        }
        match advice.as_slice() {
            [] => one(out, "tyres", prio::LOW, "tyre_monitor/camber_ok"),
            [a, b] if a.contains("negative") && b.contains("negative") => one(
                out,
                "tyres",
                prio::LOW,
                "tyre_monitor/you_need_more_negative_camber",
            ),
            [a, b] if a.contains("positive") && b.contains("positive") => one(
                out,
                "tyres",
                prio::LOW,
                "tyre_monitor/you_need_more_positive_camber",
            ),
            list => {
                for a in list.to_vec() {
                    one(out, "tyres", prio::LOW, a);
                }
            }
        }
    }

    // ------------------------------------------------------------------ motor
    fn engine(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let ew = f.engine_warnings;
        let new = ew & !self.prev_ew;
        // Sıcaklık eşikleri (motor uyarı biti vermeyen simler için de)
        let water_hot = ew & EW_WATER != 0 || f.water_temp > 112.0;
        let oil_hot = ew & EW_OIL_TEMP != 0 || f.oil_temp > 140.0;
        let hot = (water_hot as u8) | ((oil_hot as u8) << 1);
        if hot != 0 && hot != self.temp_warned && self.ready("engine_temp", 60.0, now) {
            let key = match hot {
                3 => "engine_monitor/hot_oil_and_water",
                2 => "engine_monitor/hot_oil",
                _ => "engine_monitor/hot_water",
            };
            let mut parts = vec![k(key)];
            if water_hot && f.water_temp > 0.0 {
                parts.extend([
                    k("engine_monitor/water_temp_intro"),
                    Part::Int(f.water_temp.round() as i64),
                    k("conditions/celsius"),
                ]);
            } else if oil_hot && f.oil_temp > 0.0 {
                parts.extend([
                    k("engine_monitor/oil_temp_intro"),
                    Part::Int(f.oil_temp.round() as i64),
                    k("conditions/celsius"),
                ]);
            }
            say(out, "engine", prio::HIGH, parts);
            self.temp_warned = hot;
            self.ew_since = Some(now);
        }
        if new & EW_OIL_PRESS != 0 && self.ready("oil_press", 60.0, now) {
            one(out, "engine", prio::HIGH, "engine_monitor/low_oil_pressure");
            self.ew_since = Some(now);
        }
        if new & EW_FUEL_PRESS != 0 && self.ready("fuel_press", 60.0, now) {
            one(
                out,
                "engine",
                prio::HIGH,
                "engine_monitor/low_fuel_pressure",
            );
            self.ew_since = Some(now);
        }
        if new & EW_STALLED != 0 && f.session_state >= 4 && self.ready("stalled", 20.0, now) {
            one(out, "engine", prio::CRITICAL, "engine_monitor/stalled");
        }
        let warn = hot != 0 || ew & (EW_OIL_PRESS | EW_FUEL_PRESS) != 0;
        if !warn && self.temp_warned != 0 {
            self.temp_warned = 0;
        }
        if !warn && self.ew_since.is_some() && secs_since(self.ew_since, now) > 10.0 {
            self.ew_since = None;
            one(out, "engine", prio::NORMAL, "engine_monitor/all_clear");
        }
    }

    // ------------------------------------------------------------------ kaza sonrası
    fn damage(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let Some((at, stage)) = self.crash else {
            return;
        };
        let f = c.f;
        let s = c.now.duration_since(at).as_secs_f32();
        if f.speed > 15.0 || s > 40.0 {
            self.crash = None;
            return;
        }
        if f.speed < 3.0 {
            if stage == 1 && s > 10.0 {
                self.crash = Some((at, 2));
                one(
                    out,
                    "damage",
                    prio::HIGH,
                    "damage_reporting/are_you_ok_second_try",
                );
            } else if stage == 2 && s > 20.0 {
                self.crash = Some((at, 3));
                one(
                    out,
                    "damage",
                    prio::HIGH,
                    "damage_reporting/are_you_ok_third_try",
                );
            }
        }
    }

    // ------------------------------------------------------------------ cezalar ve olay puanı
    fn penalties(&mut self, c: &Ctx, crossed: bool, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        // Simin geçersiz saydığı tur (pist sınırı)
        // Pitten çıkışta / garajdan gelişte simler turu zaten geçersiz başlatabilir: o an uyarma
        if f.lap_invalid
            && !self.prev_invalid
            && f.is_on_track
            && !f.on_pit_road
            && f.speed > 10.0
            && secs_since(self.last_pit_exit, now) > 8.0
        {
            self.cut_warning(c, out);
        }
        self.prev_invalid = f.lap_invalid;
        // Siyah bayrak sürerken her tur hatırlat (en çok 3 kez)
        if crossed && f.session_flags & F_BLACK != 0 && self.black_laps < 3 {
            self.black_laps += 1;
            let key = self.pick(&[
                "penalties/you_still_have_a_penalty",
                "penalties/warning_enter_pits_to_serve_penalty",
            ]);
            one(out, "penalties", prio::HIGH, key);
        }
        if !c.iracing {
            return;
        }
        let limit = c.s.incident_limit;
        if !self.inc_limit_said && c.race() && f.is_on_track && !c.s.sessions.is_empty() {
            self.inc_limit_said = true;
            let parts = if limit > 0 {
                let key = self.pick(&[
                    "incidents/the_incident_limit_is",
                    "incidents/the_incident_points_limit_is",
                ]);
                vec![k(key), Part::Int(limit as i64)]
            } else {
                vec![k(self.pick(&[
                    "incidents/no_incident_limit",
                    "incidents/no_incident_points_limit",
                ]))]
            };
            out.push(Msg::new("incidents", prio::LOW, parts).ttl(60.0));
        }
        if f.incidents > self.incidents {
            let d = f.incidents - self.incidents;
            self.incidents = f.incidents;
            if d >= 2 {
                let unit = self.pick(&["incidents/incidents", "incidents/incident_points"]);
                say(
                    out,
                    "incidents",
                    prio::NORMAL,
                    vec![
                        k("incidents/you_have"),
                        Part::Int(f.incidents as i64),
                        k(unit),
                    ],
                );
            } else if c.race() && self.ready("track_limits", 90.0, now) {
                // 1x: dört teker pist dışı
                one(
                    out,
                    "penalties",
                    prio::NORMAL,
                    "penalties/possible_track_limits_warning",
                );
            }
            if limit > 0 && f.incidents >= limit - 4 && !self.inc_warned {
                self.inc_warned = true;
                one(
                    out,
                    "incidents",
                    prio::HIGH,
                    "penalties/one_more_collision_before_kick",
                );
            }
        } else if f.incidents < self.incidents {
            self.incidents = f.incidents;
        }
    }

    // ------------------------------------------------------------------ hava ve pist
    fn conditions(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let deg = |x: f32| if c.imperial { x * 9.0 / 5.0 + 32.0 } else { x };
        let unit = if c.imperial {
            "conditions/fahrenheit"
        } else {
            "conditions/celsius"
        };
        if !self.temps_said && f.track_temp > 0.0 && f.speed > 5.0 {
            self.temps_said = true;
            self.temp_ref = Some((f.air_temp, f.track_temp, now));
            say(
                out,
                "conditions",
                prio::LOW,
                vec![
                    k("conditions/air_temp_is"),
                    Part::Int(deg(f.air_temp).round() as i64),
                    k(unit),
                ],
            );
            say(
                out,
                "conditions",
                prio::LOW,
                vec![
                    k("conditions/track_temp_is"),
                    Part::Int(deg(f.track_temp).round() as i64),
                    k(unit),
                ],
            );
        }
        if let Some((air, track, at)) = self.temp_ref {
            if now.duration_since(at) > Duration::from_secs(600) {
                let (da, dt) = (f.air_temp - air, f.track_temp - track);
                let (ba, bt) = (da.abs() >= 3.0, dt.abs() >= 3.0);
                if ba || bt {
                    self.temp_ref = Some((f.air_temp, f.track_temp, now));
                    if ba && bt && da.signum() == dt.signum() {
                        one(
                            out,
                            "conditions",
                            prio::LOW,
                            if dt > 0.0 {
                                "conditions/air_and_track_temp_increasing"
                            } else {
                                "conditions/air_and_track_temp_decreasing"
                            },
                        );
                    } else if bt {
                        let key = if dt > 0.0 {
                            "conditions/track_temp_increasing_its_now"
                        } else {
                            "conditions/track_temp_decreasing_its_now"
                        };
                        say(
                            out,
                            "conditions",
                            prio::LOW,
                            vec![k(key), Part::Int(deg(f.track_temp).round() as i64), k(unit)],
                        );
                    } else {
                        let key = if da > 0.0 {
                            "conditions/air_temp_increasing_its_now"
                        } else {
                            "conditions/air_temp_decreasing_its_now"
                        };
                        say(
                            out,
                            "conditions",
                            prio::LOW,
                            vec![k(key), Part::Int(deg(f.air_temp).round() as i64), k(unit)],
                        );
                    }
                }
            }
        }
        // Yağmur: seviye 20 sn değişmeden kalırsa söylenir
        if f.precip >= 0.0 {
            let p = f.precip;
            let lvl = if p < 0.03 {
                0
            } else if p < 0.2 {
                1
            } else if p < 0.4 {
                2
            } else if p < 0.6 {
                3
            } else if p < 0.85 {
                4
            } else {
                5
            };
            if self.rain_level < 0 {
                self.rain_level = lvl;
            } else if lvl != self.rain_level {
                if self.rain_cand.0 != lvl {
                    self.rain_cand = (lvl, Some(now));
                } else if secs_since(self.rain_cand.1, now) > 20.0 {
                    let prev = self.rain_level;
                    self.rain_level = lvl;
                    let key = match (prev, lvl) {
                        (_, 0) => "conditions/stopped_raining",
                        (0, _) => "conditions/seeing_some_rain",
                        (_, 5) => "conditions/maximum_rain",
                        (a, 1) if a > 1 => "conditions/drizzle_decreasing",
                        (_, 1) => "conditions/drizzle_increasing",
                        (a, 2) if a > 2 => "conditions/light_rain_decreasing",
                        (_, 2) => "conditions/light_rain_increasing",
                        (a, 3) if a > 3 => "conditions/mid_rain_decreasing",
                        (_, 3) => "conditions/mid_rain_increasing",
                        (a, _) if a > 4 => "conditions/heavy_rain_decreasing",
                        _ => "conditions/heavy_rain_increasing",
                    };
                    one(out, "conditions", prio::NORMAL, key);
                }
            } else {
                self.rain_cand = (-1, None);
            }
        }
    }

    // ------------------------------------------------------------------ çok sınıf
    fn multiclass(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        if self.traffic_off(f, now) || f.speed < 10.0 || !self.ready("mc_tick", 1.0, now) {
            return;
        }
        let my_est = c.class_est(c.me);
        if my_est <= 1.0 {
            return;
        }
        let mut faster: Vec<(usize, f32)> = Vec::new();
        let mut slower: Vec<(usize, f32)> = Vec::new();
        for i in 0..MAX_CARS {
            if i == c.me || !c.active(i) || c.same_class(i) || f.cars[i].on_pit {
                continue;
            }
            let est = c.class_est(i);
            let Some(g) = c.track_gap(i) else { continue };
            if est > 1.0 && est < my_est * 0.985 && g > 0.5 && g < 4.0 {
                faster.push((i, g));
            } else if est > my_est * 1.015 && g < -0.5 && g > -4.0 {
                slower.push((i, -g));
            }
        }
        for (list, is_faster) in [(faster, true), (slower, false)] {
            let fresh: Vec<(usize, f32)> = list
                .iter()
                .copied()
                .filter(|(i, _)| secs_since(self.mc_cd.get(i).copied(), now) > 90.0)
                .collect();
            if fresh.is_empty()
                || !self.ready(if is_faster { "mc_faster" } else { "mc_slower" }, 20.0, now)
            {
                continue;
            }
            for (i, _) in &list {
                self.mc_cd.insert(*i, now);
            }
            let leader = list.iter().any(|(i, _)| f.cars[*i].class_position == 1);
            let mut gaps: Vec<f32> = list.iter().map(|x| x.1).collect();
            gaps.sort_by(|a, b| a.total_cmp(b));
            let fighting = list.len() >= 2 && gaps.windows(2).any(|w| w[1] - w[0] < 1.0);
            let class =
                c.s.driver(list[0].0)
                    .map(|d| d.class_name.clone())
                    .unwrap_or_default();
            let class_p = if list.iter().all(|(i, _)| {
                c.s.driver(*i)
                    .map(|d| d.class_name == class)
                    .unwrap_or(false)
            }) {
                class_parts(&class)
            } else {
                None
            };
            let key = match (is_faster, list.len(), fighting, leader) {
                (true, 1, _, true) => "multiclass/faster_car_behind_is_class_leader",
                (true, 1, _, false) => "multiclass/faster_car_behind",
                (true, _, true, true) => "multiclass/faster_cars_fighting_behind_inc_class_leader",
                (true, _, true, false) => "multiclass/faster_cars_behind_fighting",
                (true, _, false, true) => "multiclass/faster_cars_behind_inc_class_leader",
                (true, _, false, false) => "multiclass/faster_cars_behind",
                (false, 1, _, true) => "multiclass/slower_car_ahead_is_class_leader",
                (false, 1, _, false) => "multiclass/slower_car_ahead",
                (false, _, true, true) => "multiclass/slower_cars_fighting_ahead_inc_class_leader",
                (false, _, true, false) => "multiclass/slower_cars_ahead_fighting",
                (false, _, false, true) => "multiclass/slower_cars_ahead_inc_class_leader",
                (false, _, false, false) => "multiclass/slower_cars_ahead",
            };
            // Bazen sınıf adıyla: "GT3'ler yetişiyor"
            let parts = if !leader && !fighting && self.chance(0.4) {
                match (is_faster, class_p) {
                    (true, Some(p)) => {
                        [vec![k("multiclass/you_are_being_caught_by_the")], p].concat()
                    }
                    (false, Some(p)) => [vec![k("multiclass/you_are_catching_the")], p].concat(),
                    (true, None) => vec![k("multiclass/you_are_being_caught_by_the_faster_cars")],
                    (false, None) => vec![k("multiclass/you_are_catching_the_slower_cars")],
                }
            } else {
                vec![k(key)]
            };
            say(
                out,
                "multiclass",
                if is_faster { prio::HIGH } else { prio::NORMAL },
                parts,
            );
        }
    }

    /// Spotter "solda araç" dedikten sonra: yanımızdaki aracın sınıfı (çok sınıflı oturumda)
    pub fn alongside_class(&mut self, f: &Frame, s: &SessionData, now: Instant) -> Option<Msg> {
        if s.class_count() < 2 || secs_since(self.alongside_cd, now) < 15.0 {
            return None;
        }
        let me = f.player_idx.max(0) as usize;
        let my = s.driver(me)?;
        let len = (s.track_length_km * 1000.0).max(1.0);
        let my_pct = f.cars[me].pct;
        let near = (0..MAX_CARS)
            .filter(|&i| {
                i != me
                    && f.cars[i].pct >= 0.0
                    && !f.cars[i].on_pit
                    && s.driver(i).map(|d| !d.is_pace_car).unwrap_or(false)
            })
            .map(|i| {
                let mut d = (f.cars[i].pct - my_pct).abs();
                if d > 0.5 {
                    d = 1.0 - d;
                }
                (i, d * len)
            })
            .filter(|(_, m)| *m < 10.0)
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))?;
        let d = s.driver(near.0)?;
        self.alongside_cd = Some(now);
        let key = if d.class_id == my.class_id {
            "multiclass/same_class_as_us"
        } else if d.class_est_lap > 1.0
            && my.class_est_lap > 1.0
            && d.class_est_lap < my.class_est_lap
        {
            "multiclass/it_is_a_faster_class"
        } else {
            "multiclass/it_is_a_slower_class"
        };
        Some(Msg::new("multiclass", prio::NORMAL, vec![k(key)]).ttl(4.0))
    }

    // ------------------------------------------------------------------ pistten dönüş
    fn rejoin(&mut self, c: &Ctx, out: &mut Vec<Msg>) {
        let f = c.f;
        let now = c.now;
        let me = f.cars[c.me];
        if me.surface == 0 && !f.on_pit_road && f.speed < 25.0 {
            self.on_since = None;
            let since = *self.off_since.get_or_insert(now);
            if now.duration_since(since) < Duration::from_secs(1) {
                return;
            }
            let coming = (0..MAX_CARS)
                .filter(|&i| {
                    i != c.me && c.active(i) && !f.cars[i].on_pit && f.cars[i].surface != 0
                })
                .any(|i| c.track_gap(i).map(|g| g > 0.0 && g < 3.5).unwrap_or(false));
            if coming {
                if self.ready("rejoin_wait", 5.0, now) {
                    out.push(
                        Msg::new("rejoin", prio::CRITICAL, vec![k("rejoining/rejoin_wait")])
                            .ttl(2.0),
                    );
                    self.rejoin_said = false;
                }
            } else if !self.rejoin_said
                && secs_since(self.cd.get("rejoin_wait").copied(), now) > 2.0
            {
                self.rejoin_said = true;
                out.push(
                    Msg::new("rejoin", prio::CRITICAL, vec![k("rejoining/rejoin_clear")]).ttl(2.0),
                );
            }
        } else if me.surface != 0 {
            let since = *self.on_since.get_or_insert(now);
            if now.duration_since(since) > Duration::from_secs(2) {
                self.off_since = None;
                self.rejoin_said = false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Driver, SessionEntry};

    fn session(kind: &str, cars: usize) -> SessionData {
        let mut s = SessionData {
            player_idx: 0,
            track_length_km: 4.0,
            pit_limit_kph: 60.0,
            fuel_max_ltr: 100.0,
            max_fuel_pct: 1.0,
            ..Default::default()
        };
        s.sessions = vec![SessionEntry {
            num: 0,
            kind: kind.into(),
            laps: Some(20),
            time: None,
            ..Default::default()
        }];
        s.drivers = vec![None; MAX_CARS];
        for i in 0..cars {
            s.drivers[i] = Some(Driver {
                car_idx: i as i32,
                name: format!("D{i}"),
                car_number: format!("{}", i + 1),
                class_id: 1,
                class_name: "GT3".into(),
                class_est_lap: 90.0,
                irating: 2000 + i as i32 * 100,
                license: "A 3.00".into(),
                ..Default::default()
            });
        }
        s
    }

    fn frame(cars: usize) -> Frame {
        let mut f = Frame {
            player_idx: 0,
            is_on_track: true,
            speed: 50.0,
            session_state: 4,
            fuel_level: 50.0,
            ..Default::default()
        };
        for i in 0..cars {
            f.cars[i].pct = 0.5 - i as f32 * 0.01;
            f.cars[i].position = i as i32 + 1;
            f.cars[i].class_position = i as i32 + 1;
            f.cars[i].surface = 3;
        }
        f
    }

    fn keys(out: &[Msg]) -> Vec<String> {
        out.iter()
            .flat_map(|m| m.parts.iter())
            .filter_map(|p| {
                if let Part::K(s) = p {
                    Some(s.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    fn run(e: &mut Eng, f: &Frame, s: &SessionData, now: Instant) -> Vec<Msg> {
        let t = Tracker::default();
        let cfg = VoiceCfg::default();
        let c = Ctx::new(f, s, &t, now, Kind::of(s, f.session_num), "iracing", &cfg);
        let mut out = Vec::new();
        e.frame(&c, &mut out);
        e.rules(&c, &mut out);
        out
    }

    #[test]
    fn yellow_flag_rising_edge_only_once() {
        let s = session("Race", 4);
        let mut f = frame(4);
        let mut e = Eng::default();
        let t0 = Instant::now();
        run(&mut e, &f, &s, t0);
        f.session_flags = F_YELLOW;
        let k1 = keys(&run(&mut e, &f, &s, t0 + Duration::from_millis(250)));
        assert!(k1.iter().any(|x| x.contains("yellow")), "{k1:?}");
        let k2 = keys(&run(&mut e, &f, &s, t0 + Duration::from_millis(500)));
        assert!(!k2.iter().any(|x| x.contains("yellow")), "{k2:?}");
        // 5 sn sonra sarı kalkınca "temiz"
        f.session_flags = 0;
        let k3 = keys(&run(&mut e, &f, &s, t0 + Duration::from_secs(5)));
        assert!(
            k3.contains(&"flags/local_yellow_clear".to_string()),
            "{k3:?}"
        );
    }

    #[test]
    fn race_start_green_and_start_report() {
        let s = session("Race", 6);
        let mut f = frame(6);
        let mut e = Eng::default();
        let t0 = Instant::now();
        // Grid: sıra P4
        f.session_state = 3;
        f.cars[0].class_position = 4;
        f.cars[3].class_position = 1;
        let pre = keys(&run(&mut e, &f, &s, t0));
        assert!(
            pre.contains(&"lap_counter/strength_of_field_is".to_string()),
            "{pre:?}"
        );
        assert!(pre.contains(&"frozen_order/were_starting_from_position".to_string()));
        // iRating sırası: biz en düşük (2000) → 6. beklenir
        assert_eq!(e.expected, 6);
        f.session_state = 4;
        f.session_flags = F_GREEN;
        let g = keys(&run(&mut e, &f, &s, t0 + Duration::from_secs(1)));
        assert!(
            g.contains(&"lap_counter/green_green_green".to_string()),
            "{g:?}"
        );
        // 30 sn sonra P2: iki sıra kazandık
        f.session_time = 30.0;
        f.cars[0].class_position = 2;
        f.cars[3].class_position = 4;
        let st = keys(&run(&mut e, &f, &s, t0 + Duration::from_secs(31)));
        assert!(st.contains(&"position/good_start".to_string()), "{st:?}");
    }

    #[test]
    fn laps_left_and_last_lap() {
        let s = session("Race", 3);
        let mut f = frame(3);
        let mut e = Eng::default();
        let t0 = Instant::now();
        f.session_laps_remain = 6;
        f.lap_completed = 14;
        run(&mut e, &f, &s, t0);
        // 5 tur kaldı
        f.lap_completed = 15;
        f.session_laps_remain = 5;
        let out = run(&mut e, &f, &s, t0 + Duration::from_secs(90));
        assert!(
            out.iter().any(|m| m.parts.first() == Some(&Part::Int(5))),
            "{:?}",
            keys(&out)
        );
        // Son tur: beyaz bayrak
        f.lap_completed = 18;
        f.session_laps_remain = 2;
        let two = keys(&run(&mut e, &f, &s, t0 + Duration::from_secs(400)));
        assert!(
            two.contains(&"lap_counter/two_to_go_leading".to_string()),
            "{two:?}"
        );
        f.lap_completed = 19;
        f.session_laps_remain = 1;
        f.session_flags = F_WHITE;
        let last = keys(&run(&mut e, &f, &s, t0 + Duration::from_secs(490)));
        assert!(
            last.iter().any(|x| x.ends_with("last_lap_leading")),
            "{last:?}"
        );
        // Damalı bayrak ve çizgi: kazandık
        f.session_flags = F_CHECKERED;
        f.session_state = 5;
        run(&mut e, &f, &s, t0 + Duration::from_secs(570));
        f.lap_completed = 20;
        let fin = keys(&run(&mut e, &f, &s, t0 + Duration::from_secs(580)));
        assert!(fin.contains(&"lap_counter/won_race".to_string()), "{fin:?}");
    }

    #[test]
    fn rejoin_waits_for_traffic() {
        let s = session("Race", 2);
        let mut f = frame(2);
        let mut e = Eng::default();
        let t0 = Instant::now();
        run(&mut e, &f, &s, t0);
        // Pist dışındayız, arkadan 1 sn geride araç geliyor
        f.cars[0].surface = 0;
        f.speed = 5.0;
        f.cars[0].pct = 0.50;
        f.cars[1].pct = 0.49;
        run(&mut e, &f, &s, t0 + Duration::from_millis(100));
        let w = keys(&run(&mut e, &f, &s, t0 + Duration::from_millis(1300)));
        assert!(w.contains(&"rejoining/rejoin_wait".to_string()), "{w:?}");
        // Araç geçti, yol açık
        f.cars[1].pct = 0.60;
        let cl = keys(&run(&mut e, &f, &s, t0 + Duration::from_millis(4000)));
        assert!(cl.contains(&"rejoining/rejoin_clear".to_string()), "{cl:?}");
    }

    #[test]
    fn fuel_warnings_when_short() {
        let s = session("Race", 2);
        let mut f = frame(2);
        let mut t = Tracker::default();
        // Turda 3 l: 7 l → 2.3 tur, yarışın 10 turu var
        t.fuel.seed(&[3.0, 3.0, 3.0], &[90.0, 90.0, 90.0], 0.0);
        f.fuel_level = 7.0;
        f.session_laps_remain = 10;
        f.lap_completed = 5;
        let cfg = VoiceCfg::default();
        let mut e = Eng::default();
        let t0 = Instant::now();
        let mut out = Vec::new();
        e.started = true;
        e.session_num = 0;
        e.last_lap_done = 5;
        f.lap_completed = 6;
        let c = Ctx::new(&f, &s, &t, t0, Kind::Race, "iracing", &cfg);
        e.rules(&c, &mut out);
        let ks = keys(&out);
        assert!(ks.contains(&"fuel/three_laps_fuel".to_string()), "{ks:?}");
        assert!(
            ks.contains(&"fuel/we_will_need_to_pit_for_fuel".to_string()),
            "{ks:?}"
        );
    }

    #[test]
    fn helpers() {
        assert_eq!(corner_group([true, true, false, false]), Some("fronts"));
        assert_eq!(corner_group([true, true, true, false]), Some("all_round"));
        assert_eq!(
            corner_group([false, false, false, true]),
            Some("right_rear")
        );
        assert_eq!(
            tyre_key("cold", "left_front"),
            Some("tyre_monitor/cold_front_tyres")
        );
        assert_eq!(tyre_key("worn", "lefts"), Some("tyre_monitor/worn_lefts"));
        assert_eq!(
            sector_message([0.12, 0.0, 0.13], false),
            Some("lap_times/sector1_and_3_a_tenth_off_self_pace")
        );
        assert_eq!(
            sector_message([0.5, 0.2, 0.6], true),
            Some("lap_times/sector1_and_3_a_second_off_pace")
        );
        assert_eq!(
            sector_message([-0.1, -0.2, -0.05], true),
            Some("lap_times/sector_all_fastest")
        );
        assert_eq!(sector_message([0.0, 0.01, 0.02], false), None);
        assert_eq!(
            class_parts("GT3 Class"),
            Some(vec![k("multiclass/gt3_runners")])
        );
        assert_eq!(
            class_parts("Porsche Cup"),
            Some(vec![k("multiclass/carrera_cup"), k("multiclass/runners")])
        );
        assert_eq!(
            class_parts("LMP2"),
            Some(vec![k("multiclass/lmp2_runners")])
        );
        let s = sof(&[2000, 2000, 2000]);
        assert!((s - 2000).abs() <= 1, "{s}");
    }

    /// Kaynakta geçen her ifade anahtarı sahibin paketinde var ve katalogda "used"
    #[test]
    fn traffic_gate_and_cooldowns() {
        // pitte her zaman kapalı
        assert!(traffic_blocked(true, 60.0, f32::MAX));
        // pistte, pit ziyareti yok / çoktan çıkılmış
        assert!(!traffic_blocked(false, 60.0, f32::MAX));
        assert!(!traffic_blocked(false, 3.0, f32::MAX));
        // pit çıkışı: ilk saniyeler hızdan bağımsız kapalı, sonra hıza bağlı, en geç MAX'ta açık
        assert!(traffic_blocked(false, 60.0, 2.0));
        assert!(traffic_blocked(false, 15.0, 10.0));
        assert!(!traffic_blocked(false, 40.0, 10.0));
        assert!(!traffic_blocked(false, 15.0, TRAFFIC_GRACE_MAX + 1.0));

        assert!(traffic_key("timings/car_behind_is_lapping_us"));
        assert!(traffic_key("multiclass/faster_car_behind"));
        assert!(traffic_key("flags/blue_flag"));
        assert!(!traffic_key("flags/yellow_flag"));
        assert!(!traffic_key("push_now/pits_exit_traffic_behind"));
        assert!(!traffic_key("fuel/we_estimate"));
        assert!(traffic_msg(&Msg::new("gaps", prio::NORMAL, vec![k("timings/gap_behind_is_now"), Part::Secs(1.0)])));
        assert!(!traffic_msg(&Msg::new("position", prio::NORMAL, vec![Part::Pos(3)])));

        // yeni araç, bekleme dolmuş: söyle
        assert_eq!(lapped_call(None, 1, f32::MAX), (true, true));
        // yeni araç, bekleme sürüyor: duyuruldu say ama sus
        assert_eq!(lapped_call(None, 1, 10.0), (true, false));
        // aynı araç aynı tur farkı: bir daha asla
        assert_eq!(lapped_call(Some(1), 1, f32::MAX), (false, false));
        // tur çizgisinde fark anlık düşerse
        assert_eq!(lapped_call(Some(1), 0, f32::MAX), (false, false));
        // aynı araç ikinci kez tur bindiriyor
        assert_eq!(lapped_call(Some(1), 2, f32::MAX), (true, true));

        assert_eq!(laps_between(10, 0.2, 9, 0.5), 0);
        assert_eq!(laps_between(10, 0.6, 9, 0.5), 1);
        assert_eq!(laps_between(12, 0.1, 9, 0.9), 2);
    }

    #[test]
    fn lapping_calls_silent_in_pits_and_rate_limited() {
        let s = session("Race", 6);
        let mut f = frame(6);
        f.lap_completed = 5;
        f.cars[0].lap_completed = 5;
        // 1..=3: bir tur önde ve pistte hemen arkamızda
        for i in 1..=3 {
            f.cars[i].lap_completed = 6;
            f.cars[i].pct = 0.5 - 0.005;
        }
        let t0 = Instant::now();
        let mut e = Eng {
            started: true,
            start_reported: true,
            ..Eng::default()
        };
        let lapping = |out: &[Msg]| {
            keys(out)
                .iter()
                .filter(|x| x.as_str() == "timings/car_behind_is_lapping_us")
                .count()
        };
        // pit yolunda: hiç
        f.on_pit_road = true;
        f.speed = 0.0;
        let out = run(&mut e, &f, &s, t0);
        assert_eq!(lapping(&out), 0);
        assert!(!out.iter().any(traffic_msg));
        // pitten çıkış + ilk saniyeler: yine yok
        f.on_pit_road = false;
        f.speed = 40.0;
        let out = run(&mut e, &f, &s, t0 + Duration::from_secs(1));
        assert_eq!(lapping(&out), 0);
        let out = run(&mut e, &f, &s, t0 + Duration::from_secs(3));
        assert_eq!(lapping(&out), 0);
        // pistte: üç araç için tek çağrı
        let out = run(&mut e, &f, &s, t0 + Duration::from_secs(30));
        assert!(lapping(&out) <= 1);
        // bekleme dolsa da aynı araçlar bir daha söylenmez
        let out = run(&mut e, &f, &s, t0 + Duration::from_secs(300));
        assert_eq!(lapping(&out), 0);
    }

    #[test]
    fn keys_exist_in_catalog() {
        let cat: serde_json::Value = serde_json::from_str(crate::voicepack::CATALOG_JSON).unwrap();
        let map: HashMap<String, (u64, bool)> = cat
            .as_array()
            .unwrap()
            .iter()
            .map(|e| {
                (
                    e["key"].as_str().unwrap().to_string(),
                    (
                        e["files"].as_u64().unwrap_or(0),
                        e["used"].as_bool().unwrap_or(false),
                    ),
                )
            })
            .collect();
        let cats: Vec<&str> = map.keys().map(|k| k.split('/').next().unwrap()).collect();
        for src in [include_str!("voice_rules.rs"), include_str!("voice.rs")] {
            for piece in src.split('"').skip(1).step_by(2) {
                let Some((cat0, ph)) = piece.split_once('/') else {
                    continue;
                };
                if !cats.contains(&cat0)
                    || ph.is_empty()
                    || ph.contains(' ')
                    || ph.contains('{')
                    || ph.contains('/')
                {
                    continue;
                }
                if cat0 == "numbers" && ph.chars().all(|c| c.is_ascii_digit() || c == '_') {
                    continue;
                }
                let e = map.get(piece);
                assert!(e.is_some(), "katalogda yok: {piece}");
                assert!(e.unwrap().1, "katalogda used=false: {piece}");
            }
        }
    }
}
