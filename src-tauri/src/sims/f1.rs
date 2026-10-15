#![cfg_attr(not(windows), allow(dead_code))]
//! EA SPORTS F1 23 / F1 24 / F1 25: oyunun UDP telemetrisi (Ayarlar › Telemetri: UDP açık, biçim = oyunun yılı,
//! port 20777, IP 127.0.0.1 — konsolda bilgisayarın IP adresi). 22 aracın tamamı gelir: sıralama, tur, sektör,
//! pit, lider farkı, konumlar (radar), oyuncu telemetrisi, lastikler, hasar, ERS.
//!
//! Paket düzenleri EA'nın "F1 2x UDP Specification" belgelerinden. Yıla göre değişen yapılar (tur verisi,
//! katılımcılar, hasar) paket biçiminden (m_packetFormat) seçilir; 2022 ve öncesi desteklenmez.

use super::udp::{self, Proto};
use super::*;
use crate::model::{Driver, SessionEntry};

pub const NCARS: usize = 22;
const H: usize = 29;

mod id {
    pub const MOTION: u8 = 0;
    pub const SESSION: u8 = 1;
    pub const LAP: u8 = 2;
    pub const EVENT: u8 = 3;
    pub const PARTICIPANTS: u8 = 4;
    pub const TELEMETRY: u8 = 6;
    pub const STATUS: u8 = 7;
    pub const DAMAGE: u8 = 10;
    pub const HISTORY: u8 = 11;
}

/// m_trackId -> pist adı
const TRACKS: [&str; 42] = [
    "Melbourne",
    "Paul Ricard",
    "Shanghai",
    "Sakhir",
    "Catalunya",
    "Monaco",
    "Montreal",
    "Silverstone",
    "Hockenheim",
    "Hungaroring",
    "Spa",
    "Monza",
    "Singapore",
    "Suzuka",
    "Abu Dhabi",
    "Texas",
    "Brazil",
    "Austria",
    "Sochi",
    "Mexico",
    "Baku",
    "Sakhir Short",
    "Silverstone Short",
    "Texas Short",
    "Suzuka Short",
    "Hanoi",
    "Zandvoort",
    "Imola",
    "Portimao",
    "Jeddah",
    "Miami",
    "Las Vegas",
    "Losail",
    "",
    "",
    "",
    "",
    "",
    "",
    "Silverstone Reverse",
    "Austria Reverse",
    "Zandvoort Reverse",
];

fn track_name(id: i8) -> String {
    match TRACKS
        .get(id.max(-1) as usize)
        .filter(|s| !s.is_empty() && id >= 0)
    {
        Some(s) => s.to_string(),
        None => format!("Track {id}"),
    }
}

fn team_name(fmt: u16, team: u8) -> Option<&'static str> {
    Some(match team {
        0 => "Mercedes",
        1 => "Ferrari",
        2 => "Red Bull Racing",
        3 => "Williams",
        4 => "Aston Martin",
        5 => "Alpine",
        6 if fmt == 2023 => "AlphaTauri",
        6 if fmt == 2024 => "RB",
        6 => "Racing Bulls",
        7 => "Haas",
        8 => "McLaren",
        9 if fmt == 2023 => "Alfa Romeo",
        9 => "Sauber",
        41 => "F1 Generic",
        104 => "F1 Custom Team",
        _ => return None,
    })
}

fn formula_name(f: u8) -> &'static str {
    match f {
        1 => "F1 Classic",
        2 => "F2",
        _ => "F1",
    }
}

/// m_sessionType -> (tür, yarış mı)
fn session_kind(fmt: u16, t: u8) -> &'static str {
    if fmt == 2023 {
        match t {
            1..=4 => "Practice",
            5..=9 => "Qualify",
            10..=12 => "Race",
            13 => "Practice",
            _ => "",
        }
    } else {
        match t {
            1..=4 => "Practice",
            5..=14 => "Qualify",
            15..=17 => "Race",
            18 => "Practice",
            _ => "",
        }
    }
}

/// Bir aracın tur verisi alanlarının konumu (yıla göre)
struct LapLayout {
    size: usize,
    /// m_lapDistance konumu; sonraki alanlar buna göre
    k: usize,
}

fn lap_layout(fmt: u16) -> LapLayout {
    if fmt == 2023 {
        LapLayout { size: 50, k: 18 }
    } else {
        LapLayout { size: 57, k: 20 }
    }
}

fn part_size(fmt: u16) -> (usize, usize) {
    // (araç başına boyut, ad uzunluğu)
    match fmt {
        2023 => (58, 48),
        2024 => (60, 48),
        _ => (57, 32),
    }
}

fn dmg_size(fmt: u16) -> (usize, usize) {
    // (araç başına boyut, kanat hasarı alanının konumu)
    if fmt >= 2025 {
        (46, 28)
    } else {
        (42, 24)
    }
}

/// Gelen paketlerden biriken son durum
#[derive(Default)]
pub struct F1State {
    pub fmt: u16,
    pub player: usize,
    pub uid: u64,
    pub motion: Vec<u8>,
    pub session: Vec<u8>,
    pub lap: Vec<u8>,
    pub part: Vec<u8>,
    pub tele: Vec<u8>,
    pub status: Vec<u8>,
    pub damage: Vec<u8>,
    /// Araçların en iyi tur süresi (ms; oturum geçmişi paketinden)
    pub best_ms: [u32; NCARS],
    pub start_lit: u8,
    pub lights_out: bool,
    pub chequered: bool,
    pub red: bool,
    /// Gelen telemetri paketi sayısı (yeni kare var mı)
    pub tele_seq: u64,
}

impl F1State {
    pub fn feed(&mut self, b: &[u8]) {
        let Some(fmt) = udp::f1_format(b) else { return };
        let uid = u64::from_le_bytes(b[7..15].try_into().unwrap());
        if uid != self.uid {
            // Yeni oturum: önceki oturumun birikmiş verisi atılır
            *self = F1State {
                fmt,
                uid,
                ..Default::default()
            };
        }
        self.fmt = fmt;
        self.player = (b[27] as usize).min(NCARS - 1);
        let keep = |v: &mut Vec<u8>| {
            v.clear();
            v.extend_from_slice(b);
        };
        match b[6] {
            id::MOTION => keep(&mut self.motion),
            id::SESSION => keep(&mut self.session),
            id::LAP => keep(&mut self.lap),
            id::PARTICIPANTS => keep(&mut self.part),
            id::TELEMETRY => {
                keep(&mut self.tele);
                self.tele_seq += 1;
            }
            id::STATUS => keep(&mut self.status),
            id::DAMAGE => keep(&mut self.damage),
            id::HISTORY => {
                let car = rd_u8(b, H) as usize;
                let best = rd_u8(b, H + 3) as usize;
                if car < NCARS && (1..=100).contains(&best) {
                    let ms = rd_u32(b, H + 7 + (best - 1) * 14);
                    if ms > 0 {
                        self.best_ms[car] = ms;
                    }
                }
            }
            id::EVENT => match b.get(H..H + 4) {
                Some(b"SSTA") => {
                    self.lights_out = false;
                    self.chequered = false;
                    self.red = false;
                    self.start_lit = 0;
                }
                Some(b"STLG") => self.start_lit = rd_u8(b, H + 4).min(5),
                Some(b"LGOT") => {
                    self.lights_out = true;
                    self.start_lit = 0;
                }
                Some(b"CHQF") => self.chequered = true,
                Some(b"RDFL") => self.red = true,
                _ => {}
            },
            _ => {}
        }
    }

    /// Oyuncu (izleyici modunda izlenen araç)
    pub fn me(&self) -> usize {
        let s = &self.session;
        if s.len() > H + 16 && rd_u8(s, H + 15) == 1 {
            let i = rd_u8(s, H + 16) as usize;
            if i < NCARS {
                return i;
            }
        }
        self.player
    }

    fn lap_base(&self, i: usize) -> Option<usize> {
        let l = lap_layout(self.fmt);
        let o = H + i * l.size;
        (self.lap.len() >= o + l.size).then_some(o)
    }

    /// Araç oturumda mı (tur verisinin m_resultStatus'u: 0 geçersiz, 1 etkin değil)
    pub fn active(&self, i: usize) -> bool {
        let l = lap_layout(self.fmt);
        if let Some(o) = self.lap_base(i) {
            return rd_u8(&self.lap, o + l.k + 25) >= 2;
        }
        let n = rd_u8(&self.part, H) as usize;
        !self.part.is_empty() && i < n
    }

    fn name(&self, i: usize) -> String {
        let (ps, nl) = part_size(self.fmt);
        let o = H + 1 + i * ps;
        if self.part.len() < o + ps {
            return String::new();
        }
        rd_cstr(&self.part, o + 7, nl)
    }

    pub fn ready(&self) -> bool {
        !self.session.is_empty() && !self.lap.is_empty()
    }
}

pub fn session_sig(s: &F1State) -> u64 {
    let names: Vec<String> = (0..NCARS)
        .filter(|&i| s.active(i))
        .map(|i| s.name(i))
        .collect();
    let parts: Vec<&str> = names.iter().map(|x| x.as_str()).collect();
    let ss = &s.session;
    let (ps, _) = part_size(s.fmt);
    let mut nums: Vec<i64> = vec![
        s.uid as i64,
        rd_u8(ss, H + 6) as i64,
        rd_u8(ss, H + 7) as i64,
        rd_u8(ss, H + 8) as i64,
        rd_u8(ss, H + 3) as i64,
        s.me() as i64,
        s.part.is_empty() as i64,
    ];
    for i in 0..NCARS {
        if s.active(i) {
            nums.push(i as i64);
            nums.push(rd_u8(&s.part, H + 1 + i * ps + 3) as i64);
            nums.push(rd_u8(&s.part, H + 1 + i * ps + 5) as i64);
        }
    }
    sig(&parts, &nums)
}

pub fn build_session(s: &F1State) -> SessionData {
    let mut sd = empty_session();
    let ss = &s.session;
    sd.track_name = track_name(rd_u8(ss, H + 7) as i8);
    sd.track_length_km = rd_i16(ss, H + 4) as u16 as f32 / 1000.0;
    sd.pit_limit_kph = rd_u8(ss, H + 13) as f32;
    sd.category = "Formula".into();
    let me = s.me();
    sd.player_idx = me as i32;
    let formula = rd_u8(ss, H + 8);
    let class = formula_name(formula);
    let (class_id, class_color) = class_ident(class);
    let (ps, _) = part_size(s.fmt);
    for i in 0..NCARS {
        if !s.active(i) {
            continue;
        }
        let o = H + 1 + i * ps;
        let has_part = s.part.len() >= o + ps;
        let team = rd_u8(&s.part, o + 3);
        let num = rd_u8(&s.part, o + 5);
        let mut name = s.name(i);
        if name.is_empty() {
            name = if has_part && num > 0 {
                format!("#{num}")
            } else {
                format!("Car {}", i + 1)
            };
        }
        let car = team_name(s.fmt, team)
            .filter(|_| has_part)
            .unwrap_or(class)
            .to_string();
        sd.drivers[i] = Some(Driver {
            car_idx: i as i32,
            abbrev: name.clone(),
            name,
            car_number: if has_part && num > 0 {
                num.to_string()
            } else {
                String::new()
            },
            class_id,
            class_name: class.to_string(),
            class_color: class_color.clone(),
            car_path: format!("f1_{}_{}", s.fmt, team),
            car_name: car.clone(),
            team_name: car,
            is_ai: has_part && rd_u8(&s.part, o) == 1,
            ..Default::default()
        });
    }
    if s.status.len() >= H + (me + 1) * 55 {
        let o = H + me * 55;
        sd.fuel_max_ltr = rd_f32(&s.status, o + 9).max(0.0);
        sd.redline = rd_i16(&s.status, o + 17) as u16 as f32;
    }
    let t = rd_u8(ss, H + 6);
    let kind = session_kind(s.fmt, t);
    let laps = rd_u8(ss, H + 3) as i32;
    sd.sessions.push(SessionEntry {
        num: t as i32,
        kind: kind.to_string(),
        laps: if kind == "Race" && laps > 0 {
            Some(laps)
        } else {
            None
        },
        time: Some(rd_i16(ss, H + 11) as u16 as f64).filter(|v| *v > 0.0),
        ..Default::default()
    });
    sd
}

fn ms(v: u32) -> f32 {
    if v > 0 && v < 86_400_000 {
        v as f32 / 1000.0
    } else {
        -1.0
    }
}

/// Görsel lastik hamuru -> (harf, ıslak mı)
fn compound(v: u8) -> (u8, bool) {
    match v {
        16 | 11 | 12 => (b'S', false),
        17 | 13 => (b'M', false),
        18 | 14 => (b'H', false),
        7 => (b'I', true),
        8 | 10 | 15 => (b'W', true),
        9 => (b'D', false),
        _ => (0, false),
    }
}

/// F1 lastik sırası RL, RR, FL, FR -> LF, RF, LR, RR
const WHEEL: [usize; 4] = [2, 3, 0, 1];

#[derive(Default)]
pub struct Motion {
    rel: Vec<(f32, f32)>,
}

pub fn extract(s: &F1State, sd: &SessionData, m: &mut Motion, f: &mut Frame) {
    let (tick, st) = (f.tick, f.session_time);
    let side = f.demo_side_cars.take();
    *f = Frame {
        tick,
        session_time: st,
        demo_side_cars: side,
        ..Frame::default()
    };
    let ss = &s.session;
    let fmt = s.fmt;
    let ll = lap_layout(fmt);
    let k = ll.k;
    let track_len = rd_i16(ss, H + 4) as u16 as f32;
    let me = s.me();
    f.player_idx = me as i32;
    f.session_num = rd_u8(ss, H + 6) as i32;
    let race = sd.is_race(f.session_num);

    // Araçlar
    for i in 0..NCARS {
        if !s.active(i) || sd.driver(i).is_none() {
            continue;
        }
        let Some(o) = s.lap_base(i) else { continue };
        let l = &s.lap;
        let c = &mut f.cars[i];
        let mut d = rd_f32(l, o + k);
        if track_len > 0.0 && d < 0.0 {
            d += track_len;
        }
        c.pct = if track_len > 0.0 {
            (d / track_len).clamp(0.0, 0.9999)
        } else {
            0.0
        };
        c.lap = rd_u8(l, o + k + 13) as i32;
        c.lap_completed = (c.lap - 1).max(0);
        c.position = rd_u8(l, o + k + 12) as i32;
        c.sector = rd_u8(l, o + k + 16).min(200) + 2;
        let pit = rd_u8(l, o + k + 14);
        let status = rd_u8(l, o + k + 24);
        c.on_pit = pit > 0 || status == 0;
        c.surface = if status == 0 || pit == 2 {
            1
        } else if pit == 1 {
            2
        } else {
            3
        };
        c.last = ms(rd_u32(l, o));
        c.best = ms(s.best_ms[i]);
        c.f2 = if fmt == 2023 {
            rd_i16(l, o + 16) as u16 as f32 / 1000.0
        } else {
            rd_i16(l, o + 17) as u16 as f32 / 1000.0 + rd_u8(l, o + 19) as f32 * 60.0
        };
        if s.status.len() >= H + (i + 1) * 55 {
            let so = H + i * 55;
            let (kind, wet) = compound(rd_u8(&s.status, so + 26));
            c.tire_kind = kind;
            c.tire = if kind == 0 { -1 } else { wet as i32 };
            c.flags = match rd_u8(&s.status, so + 28) as i8 {
                2 => flags::BLUE,
                3 => flags::YELLOW,
                _ => 0,
            };
        }
    }

    // Oyuncu: tur verisi
    if let Some(o) = s.lap_base(me) {
        let l = &s.lap;
        f.lap = rd_u8(l, o + k + 13) as i32;
        f.lap_completed = (f.lap - 1).max(0);
        f.lap_dist_pct = f.cars[me].pct.max(0.0);
        f.lap_cur = rd_u32(l, o + 4) as f32 / 1000.0;
        f.lap_last = ms(rd_u32(l, o));
        f.lap_best = ms(s.best_ms[me]);
        f.lap_invalid = rd_u8(l, o + k + 17) == 1;
        let pit = rd_u8(l, o + k + 14);
        let status = rd_u8(l, o + k + 24);
        f.on_pit_road = pit > 0;
        f.is_in_garage = status == 0;
        f.is_on_track = status > 0 && rd_u8(ss, H + 14) == 0;
        f.penalty = if rd_u8(l, o + k + 22) > 0 {
            2
        } else if rd_u8(l, o + k + 21) > 0 {
            1
        } else if rd_u8(l, o + k + 18) > 0 {
            4
        } else {
            0
        };
        if rd_u8(l, o + k + 25) == 5 {
            f.penalty = 3;
        }
    }

    // Oyuncu: telemetri (araç başına 60 bayt)
    let t = &s.tele;
    let to = H + me * 60;
    if t.len() >= to + 60 {
        f.speed = rd_i16(t, to) as u16 as f32 / 3.6;
        f.throttle = rd_f32(t, to + 2).clamp(0.0, 1.0);
        f.steer = steer_rad(rd_f32(t, to + 6), 360.0);
        f.brake = rd_f32(t, to + 10).clamp(0.0, 1.0);
        f.clutch = rd_u8(t, to + 14) as f32 / 100.0;
        f.gear = (rd_u8(t, to + 15) as i8) as i32;
        f.rpm = rd_i16(t, to + 16) as u16 as f32;
        f.shift_pct = rd_u8(t, to + 19) as f32 / 100.0;
        f.water_temp = rd_i16(t, to + 38) as u16 as f32;
        for (src, dst) in WHEEL.iter().enumerate() {
            let surf = rd_u8(t, to + 30 + src) as f32;
            let inner = rd_u8(t, to + 34 + src) as f32;
            let _ = inner;
            f.tire_temp[*dst] = [surf; 3];
            f.tire_press[*dst] = rd_f32(t, to + 40 + src * 4) * 6.894_757;
        }
        // Teker altındaki zemin: 0 asfalt, 1 kerb, 2-3 beton / şerit dışı ... 4+ çim, çakıl, kum vb.
        f.tyres_out = (0..4)
            .filter(|w| matches!(rd_u8(t, to + 56 + w), 4 | 5 | 6 | 7 | 8 | 9 | 11))
            .count() as i8;
    }

    // Oyuncu: araç durumu (55 bayt)
    let st = &s.status;
    let so = H + me * 55;
    if st.len() >= so + 55 {
        f.tc = rd_u8(st, so) as f32;
        f.abs_setting = rd_u8(st, so + 1) as f32;
        f.brake_bias = rd_u8(st, so + 3) as f32;
        if rd_u8(st, so + 4) == 1 {
            f.engine_warnings |= EW_PIT_LIMITER;
        }
        let fuel = rd_f32(st, so + 5);
        let cap = rd_f32(st, so + 9);
        f.fuel_level = fuel.max(0.0);
        f.fuel_pct = if cap > 0.0 {
            (fuel / cap).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let (kind, wet) = compound(rd_u8(st, so + 26));
        f.tire_compound = if kind == 0 { -1 } else { wet as i32 };
        let ers = rd_f32(st, so + 37);
        if fmt >= 2023 {
            const ERS_MAX: f32 = 4_000_000.0;
            let deployed = rd_f32(st, so + 50);
            f.hybrid = crate::model::Hybrid {
                has: true,
                battery_pct: (ers / ERS_MAX).clamp(0.0, 1.0),
                battery_j: ers.max(0.0),
                lap_deploy_left: ((ERS_MAX - deployed) / ERS_MAX).clamp(0.0, 1.0),
                mguk_kw: rd_f32(st, so + 33) / 1000.0,
                mguk_ok: true,
                mode: rd_u8(st, so + 41) as i32,
                drs: if t.len() >= to + 60 && rd_u8(t, to + 18) == 1 {
                    3
                } else if rd_u8(st, so + 22) == 1 {
                    2
                } else {
                    0
                },
                ..Default::default()
            };
        }
    }

    // Oyuncu: hasar ve lastik aşınması
    let (ds, wo) = dmg_size(fmt);
    let dm = &s.damage;
    let dof = H + me * ds;
    if dm.len() >= dof + ds {
        let pct = |v: u8| (v as f32 / 100.0).clamp(0.0, 1.0);
        let mut d = crate::drivecues::Damage {
            detail: 2,
            body: [0.0; 8],
            centre: 0.0,
            engine: 0.0,
            aero: 0.0,
            ..Default::default()
        };
        let fl = pct(rd_u8(dm, dof + wo));
        let fr = pct(rd_u8(dm, dof + wo + 1));
        let rear = pct(rd_u8(dm, dof + wo + 2));
        let floor = pct(rd_u8(dm, dof + wo + 3));
        let diff = pct(rd_u8(dm, dof + wo + 4));
        let pod = pct(rd_u8(dm, dof + wo + 5));
        d.body[0] = fl;
        d.body[2] = fr;
        d.body[1] = fl.max(fr);
        d.body[5] = rear.max(diff);
        d.body[3] = pod;
        d.body[7] = pod;
        d.centre = floor;
        d.aero = fl.max(fr).max(rear).max(floor).max(diff);
        d.engine = pct(rd_u8(dm, dof + wo + 9));
        d.overheating = false;
        d.detached = rd_u8(dm, dof + wo + 16) == 1;
        for (src, dst) in WHEEL.iter().enumerate() {
            d.brake[*dst] = pct(rd_u8(dm, dof + 20 + src));
            let wear = rd_f32(dm, dof + src * 4);
            f.tire_wear[*dst] = [(1.0 - wear / 100.0).clamp(0.0, 1.0); 3];
        }
        f.damage = d;
    }

    // Oturum
    let left = rd_i16(ss, H + 9) as u16;
    f.session_time_remain = if left > 0 { left as f64 } else { -1.0 };
    let total = rd_u8(ss, H + 3) as i32;
    let leader = (0..NCARS).find(|&i| f.cars[i].position == 1 && f.cars[i].pct >= 0.0);
    let leader_done = leader.map(|i| f.cars[i].lap_completed).unwrap_or(0);
    f.session_laps_remain = if race && total > 0 {
        (total - leader_done).max(0)
    } else {
        32767
    };
    f.air_temp = rd_u8(ss, H + 2) as i8 as f32;
    f.track_temp = rd_u8(ss, H + 1) as i8 as f32;
    let weather = rd_u8(ss, H);
    f.precip = match weather {
        3 => 0.33,
        4 => 0.66,
        5 => 1.0,
        _ => 0.0,
    };
    f.track_wetness = match weather {
        3 => 3,
        4 => 5,
        5 => 6,
        _ => 1,
    };
    let sc = rd_u8(ss, H + 124);
    let mut bits = 0u32;
    // Marshal bölgeleri: 3 sarı, 4 kırmızı (bazı sürümler)
    let zones = (rd_u8(ss, H + 18) as usize).min(21);
    for z in 0..zones {
        match rd_u8(ss, H + 19 + z * 5 + 4) as i8 {
            3 => bits |= flags::YELLOW,
            4 => bits |= flags::RED,
            _ => {}
        }
    }
    if matches!(sc, 1 | 2) {
        bits |= flags::CAUTION | flags::YELLOW;
    }
    if s.red {
        bits |= flags::RED;
    }
    if s.chequered {
        bits |= flags::CHECKERED;
    }
    if let Some(c) = f.cars.get(me) {
        bits |= c.flags;
    }
    if st.len() >= so + 55 && rd_u8(st, so + 28) as i8 == 1 {
        bits |= flags::GREEN;
    }
    f.session_flags = bits;
    let finished = s
        .lap_base(me)
        .map(|o| rd_u8(&s.lap, o + k + 25) == 3)
        .unwrap_or(false);
    f.start_total = if race && !s.lights_out && s.start_lit > 0 {
        5
    } else {
        0
    };
    f.start_lit = if f.start_total > 0 { s.start_lit } else { 0 };
    f.session_state = if s.chequered || finished {
        STATE_CHECKERED
    } else if race && sc == 3 {
        STATE_PARADE
    } else if race && !s.lights_out && f.lap <= 1 && f.lap_cur <= 0.0 {
        2
    } else {
        STATE_RACING
    };

    // Hareket ve yan araçlar (dünya: x doğu, z kuzey; araç yönleri normalize i16)
    let mo = &s.motion;
    let mb = H + me * 60;
    m.rel.clear();
    if mo.len() >= H + NCARS * 60 {
        let vx = rd_f32(mo, mb + 12);
        let vz = rd_f32(mo, mb + 20);
        motion(f, vx, vz);
        f.lat_g = rd_f32(mo, mb + 36);
        f.long_g = rd_f32(mo, mb + 40);
        let n = |o: usize| rd_i16(mo, o) as f32 / 32767.0;
        let (fx, fz) = (n(mb + 24), n(mb + 28));
        let (rx, rz) = (n(mb + 30), n(mb + 34));
        let (px, pz) = (rd_f32(mo, mb), rd_f32(mo, mb + 8));
        f.pos_e = px as f64;
        f.pos_n = pz as f64;
        for i in 0..NCARS {
            if i == me || !s.active(i) || f.cars[i].surface == 1 {
                continue;
            }
            let o = H + i * 60;
            let (dx, dz) = (rd_f32(mo, o) - px, rd_f32(mo, o + 8) - pz);
            if dx == 0.0 && dz == 0.0 {
                continue;
            }
            m.rel.push((dx * rx + dz * rz, dx * fx + dz * fz));
        }
    }
    fill_radar(f, &m.rel, f.is_on_track && !f.on_pit_road);
    fill_estimates(f, sd, false, true);
}

// ---------------------------------------------------------------------------
// Canlı kaynak (UDP kuyruğundan)
// ---------------------------------------------------------------------------

pub struct F1 {
    st: F1State,
    session: SessionData,
    motion: Motion,
    sig: u64,
    last_sig_check: std::time::Instant,
    seen_seq: u64,
    tick: i32,
    t0: std::time::Instant,
    buf: Vec<Vec<u8>>,
}

impl F1 {
    /// Son 2 sn'de F1 paketi geldiyse kaynak açılır
    pub fn open() -> Option<F1> {
        if !udp::active(Proto::F1, std::time::Duration::from_secs(2)) {
            return None;
        }
        let now = std::time::Instant::now();
        Some(F1 {
            st: F1State::default(),
            session: SessionData::default(),
            motion: Motion::default(),
            sig: 0,
            last_sig_check: crate::crashlog::past(5),
            seen_seq: 0,
            tick: 0,
            t0: now,
            buf: Vec::new(),
        })
    }

    fn pump(&mut self) {
        self.buf.clear();
        udp::drain(Proto::F1, &mut self.buf);
        for b in self.buf.iter() {
            self.st.feed(b);
        }
    }
}

impl Source for F1 {
    fn kind(&self) -> SimKind {
        SimKind::F1
    }

    fn wait(&self, ms: u32) {
        std::thread::sleep(std::time::Duration::from_millis(ms.min(10) as u64));
    }

    fn connected(&self) -> bool {
        udp::active(Proto::F1, std::time::Duration::from_secs(3))
    }

    fn session_update(&mut self) -> Option<SessionData> {
        self.pump();
        if self.last_sig_check.elapsed() < std::time::Duration::from_millis(500) || !self.st.ready()
        {
            return None;
        }
        self.last_sig_check = std::time::Instant::now();
        let s = session_sig(&self.st);
        if s == self.sig {
            return None;
        }
        self.sig = s;
        self.session = build_session(&self.st);
        Some(self.session.clone())
    }

    fn read(&mut self, frame: &mut Frame) -> bool {
        self.pump();
        if !self.st.ready() || self.st.tele_seq == self.seen_seq {
            return false;
        }
        self.seen_seq = self.st.tele_seq;
        self.tick = self.tick.wrapping_add(1);
        frame.tick = self.tick;
        frame.session_time = self.t0.elapsed().as_secs_f64();
        extract(&self.st, &self.session, &mut self.motion, frame);
        true
    }

    fn map_key(&self, s: &SessionData) -> String {
        map_key(SimKind::F1, s)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn header(fmt: u16, id: u8, len: usize, uid: u64, player: u8) -> Vec<u8> {
        let mut b = vec![0u8; len];
        b[0..2].copy_from_slice(&fmt.to_le_bytes());
        b[2] = (fmt % 100) as u8;
        b[6] = id;
        b[7..15].copy_from_slice(&uid.to_le_bytes());
        b[27] = player;
        b
    }
    fn pf(b: &mut [u8], o: usize, v: f32) {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn pu16(b: &mut [u8], o: usize, v: u16) {
        b[o..o + 2].copy_from_slice(&v.to_le_bytes());
    }
    fn pu32(b: &mut [u8], o: usize, v: u32) {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }

    /// İki araçlı örnek oturum paketleri (Monza, yarış, oyuncu 1. indeks)
    pub fn sample(fmt: u16) -> Vec<Vec<u8>> {
        let uid = 77;
        let mut out = Vec::new();
        // Oturum
        let slen = if fmt == 2023 { 644 } else { 753 };
        let mut s = header(fmt, id::SESSION, slen, uid, 1);
        s[H] = 3; // hafif yağmur
        s[H + 1] = 30;
        s[H + 2] = 22;
        s[H + 3] = 10;
        pu16(&mut s, H + 4, 5793);
        s[H + 6] = if fmt == 2023 { 10 } else { 15 };
        s[H + 7] = 11;
        s[H + 13] = 80;
        s[H + 18] = 1;
        s[H + 19 + 4] = 3; // sarı bölge
        out.push(s);
        // Katılımcılar
        let (ps, _) = part_size(fmt);
        let plen = H + 1 + NCARS * ps;
        let mut p = header(fmt, id::PARTICIPANTS, plen, uid, 1);
        p[H] = 2;
        for (i, (name, team, num)) in [("VERSTAPPEN", 2u8, 1u8), ("Erkin Azcan", 1, 16)]
            .iter()
            .enumerate()
        {
            let o = H + 1 + i * ps;
            p[o] = if i == 0 { 1 } else { 0 };
            p[o + 3] = *team;
            p[o + 5] = *num;
            p[o + 7..o + 7 + name.len()].copy_from_slice(name.as_bytes());
        }
        out.push(p);
        // Tur verisi
        let ll = lap_layout(fmt);
        let mut l = header(fmt, id::LAP, H + NCARS * ll.size + 2, uid, 1);
        for (i, (dist, pos, lap, last)) in [(2896.5f32, 1u8, 4u8, 82_500u32), (-10.0, 2, 4, 83_000)]
            .iter()
            .enumerate()
        {
            let o = H + i * ll.size;
            pu32(&mut l, o, *last);
            pu32(&mut l, o + 4, 12_345);
            pf(&mut l, o + ll.k, *dist);
            l[o + ll.k + 12] = *pos;
            l[o + ll.k + 13] = *lap;
            l[o + ll.k + 16] = 1;
            l[o + ll.k + 24] = 4;
            l[o + ll.k + 25] = 2;
            if i == 1 {
                if fmt == 2023 {
                    pu16(&mut l, o + 16, 1500);
                } else {
                    pu16(&mut l, o + 17, 1500);
                    l[o + 19] = 1;
                }
                l[o + ll.k + 17] = 1; // tur geçersiz
                l[o + ll.k + 21] = 1; // bekleyen pit geçişi
            }
        }
        out.push(l);
        // Telemetri
        let mut t = header(fmt, id::TELEMETRY, 1352, uid, 1);
        let to = H + 60;
        pu16(&mut t, to, 288);
        pf(&mut t, to + 2, 1.0);
        pf(&mut t, to + 6, -0.5);
        t[to + 15] = 7;
        pu16(&mut t, to + 16, 11_500);
        t[to + 18] = 1; // DRS açık
        t[to + 30 + 2] = 95; // FL yüzey
        pf(&mut t, to + 40 + 3 * 4, 23.0); // FR basınç psi
        out.push(t);
        // Durum
        let mut st = header(fmt, id::STATUS, 1239, uid, 1);
        let so = H + 55;
        st[so + 3] = 56;
        st[so + 4] = 1;
        pf(&mut st, so + 5, 50.0);
        pf(&mut st, so + 9, 110.0);
        pu16(&mut st, so + 17, 13_000);
        st[so + 26] = 17;
        pf(&mut st, so + 37, 2_000_000.0);
        st[H + 28] = 2; // lidere mavi bayrak (araç 0)
        out.push(st);
        // Hasar
        let (ds, wo) = dmg_size(fmt);
        let mut d = header(fmt, id::DAMAGE, H + NCARS * ds, uid, 1);
        let dof = H + ds;
        pf(&mut d, dof + 2 * 4, 30.0); // FL aşınma %30
        d[dof + wo] = 40; // sol ön kanat
        out.push(d);
        // Oturum geçmişi: oyuncunun en iyi turu (2. tur, 81.9 sn)
        let mut h = header(fmt, id::HISTORY, 1460, uid, 1);
        h[H] = 1;
        h[H + 3] = 2;
        pu32(&mut h, H + 7 + 14, 81_900);
        out.push(h);
        // Hareket: araç 0 oyuncunun 3 m sağında, 1 m önünde; oyuncu kuzeye (z+) gidiyor
        let mut m = header(fmt, id::MOTION, 1349, uid, 1);
        let mb = H + 60;
        pf(&mut m, mb + 20, 50.0);
        pu16(&mut m, mb + 28, 32767); // ileri z
        pu16(&mut m, mb + 30, 32767); // sağ x
        pf(&mut m, H, 3.0);
        pf(&mut m, H + 8, 1.0);
        pf(&mut m, mb + 36, 1.5);
        out.push(m);
        // Olay: ışıklar söndü
        let mut e = header(fmt, id::EVENT, 45, uid, 1);
        e[H..H + 4].copy_from_slice(b"LGOT");
        out.push(e);
        out
    }

    fn run(fmt: u16) -> (SessionData, Frame) {
        let mut s = F1State::default();
        for p in sample(fmt) {
            assert_eq!(udp::classify(&p), Some(Proto::F1), "{fmt} id {}", p[6]);
            s.feed(&p);
        }
        assert!(s.ready());
        let sd = build_session(&s);
        let mut f = Frame::default();
        extract(&s, &sd, &mut Motion::default(), &mut f);
        (sd, f)
    }

    #[test]
    fn parses_all_formats() {
        for fmt in [2023u16, 2024, 2025] {
            let (sd, f) = run(fmt);
            assert_eq!(sd.track_name, "Monza", "{fmt}");
            assert!((sd.track_length_km - 5.793).abs() < 1e-4);
            assert!(sd.is_race(f.session_num), "{fmt}");
            assert_eq!(sd.player_idx, 1);
            assert_eq!(sd.driver(1).unwrap().name, "Erkin Azcan");
            assert_eq!(sd.driver(1).unwrap().car_name, "Ferrari");
            assert_eq!(sd.driver(0).unwrap().car_name, "Red Bull Racing");
            assert!(sd.driver(0).unwrap().is_ai);
            assert_eq!(sd.driver(1).unwrap().car_number, "16");
            assert_eq!(sd.fuel_max_ltr, 110.0);
            assert_eq!(sd.redline, 13_000.0);
            assert_eq!(f.player_idx, 1);
            assert_eq!(f.gear, 7);
            assert!((f.speed - 80.0).abs() < 1e-3);
            assert_eq!(f.rpm, 11_500.0);
            assert_eq!(f.lap, 4);
            assert_eq!(f.lap_last, 83.0);
            assert_eq!(f.lap_best, 81.9);
            assert!(f.lap_invalid);
            assert_eq!(f.penalty, 1);
            assert!((f.cars[0].pct - 0.5).abs() < 1e-3);
            // -10 m: çizgiden hemen önce
            assert!(f.cars[1].pct > 0.99);
            let want = if fmt == 2023 { 1.5 } else { 61.5 };
            assert!((f.cars[1].f2 - want).abs() < 1e-3, "{fmt} {}", f.cars[1].f2);
            assert_eq!(f.cars[0].position, 1);
            assert_eq!(f.cars[1].class_position, 2);
            assert_eq!(f.cars[1].tire_kind, b'M');
            assert_eq!(f.cars[0].flags, flags::BLUE);
            assert_eq!(f.tire_temp[0], [95.0; 3]);
            assert!((f.tire_press[1] - 23.0 * 6.894_757).abs() < 1e-2);
            assert!((f.tire_wear[0][0] - 0.7).abs() < 1e-4);
            assert!((f.damage.body[0] - 0.4).abs() < 1e-4);
            assert_eq!(f.engine_warnings, EW_PIT_LIMITER);
            assert!((f.fuel_pct - 50.0 / 110.0).abs() < 1e-4);
            assert_eq!(f.brake_bias, 56.0);
            assert_eq!(f.hybrid.drs, 3);
            assert!((f.hybrid.battery_pct - 0.5).abs() < 1e-4);
            assert!(f.session_flags & flags::YELLOW != 0);
            assert_eq!(f.session_state, STATE_RACING);
            assert_eq!(f.session_laps_remain, 7);
            assert_eq!(f.air_temp, 22.0);
            assert_eq!(f.track_wetness, 3);
            assert!(f.steer > 0.0, "sola (-0.5) = iRacing pozitif");
            assert_eq!(f.lat_g, 1.5);
            // Araç 0: 3 m sağda, 1 m önde -> sağda araç
            assert_eq!(f.car_left_right, 3, "{fmt}");
            assert!((f.radar_lat[0] - 3.0).abs() < 1e-3);
        }
    }

    #[test]
    fn new_session_resets() {
        let mut s = F1State::default();
        for p in sample(2025) {
            s.feed(&p);
        }
        assert_eq!(s.best_ms[1], 81_900);
        let p = header(2025, id::TELEMETRY, 1352, 78, 0);
        s.feed(&p);
        assert_eq!(s.best_ms[1], 0);
        assert!(!s.ready());
    }
}
