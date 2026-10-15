#![cfg_attr(not(windows), allow(dead_code))]
//! RaceRoom Racing Experience: `$R3E` paylaşımlı belleği (sector3studios/r3e-api, r3e.h sürüm 3.x).
//! Oyunda ek ayar gerekmez. 128 araca kadar sürücü verisi (sıra, tur, sektör, pit, konum), oyuncu telemetrisi,
//! lastikler, hasar, bayraklar, start ışıkları.
//!
//! Konumlar r3e.h'nin 3.5 sürümünden (`#pragma pack(1)`, gcc offsetof ile doğrulandı). Sürücü dizisinin
//! başlangıcı ve eleman boyutu bellekteki `all_drivers_offset` / `driver_data_size` alanlarından okunur.
//!
//! Araç adları bellekte yoktur (sadece model / sınıf kimlikleri): araç adı boş kalır, sınıflar
//! performans sırasına göre "Class 1", "Class 2"... adını alır (tek sınıfta boş).

use super::*;
use crate::model::{CarState, Driver, SessionEntry};

pub mod o {
    pub const VERSION_MAJOR: usize = 0;
    pub const ALL_DRIVERS_OFFSET: usize = 8;
    pub const DRIVER_DATA_SIZE: usize = 12;
    pub const GAME_PAUSED: usize = 20;
    pub const GAME_IN_MENUS: usize = 24;
    pub const GAME_IN_REPLAY: usize = 28;
    pub const PLAYER_IN_GARAGE: usize = 36;
    pub const PLAYER_VELOCITY: usize = 80; // f64[3] dünya
    pub const TRACK_NAME: usize = 600;
    pub const LAYOUT_NAME: usize = 664;
    pub const TRACK_ID: usize = 728;
    pub const LAYOUT_ID: usize = 732;
    pub const LAYOUT_LENGTH: usize = 736;
    pub const SECTOR_STARTS: usize = 740;
    pub const SESSION_TYPE: usize = 780;
    pub const SESSION_ITERATION: usize = 784;
    pub const PIT_SPEED_LIMIT: usize = 792; // m/s
    pub const SESSION_PHASE: usize = 796;
    pub const START_LIGHTS: usize = 800;
    pub const NUMBER_OF_LAPS: usize = 812;
    pub const SESSION_TIME_REMAINING: usize = 820;
    pub const MAX_INCIDENT_POINTS: usize = 824;
    pub const IN_PITLANE: usize = 848;
    pub const PIT_STATE: usize = 904;
    pub const FLAG_YELLOW: usize = 932;
    pub const FLAG_BLUE: usize = 964;
    pub const FLAG_BLACK: usize = 968;
    pub const FLAG_GREEN: usize = 972;
    pub const FLAG_CHECKERED: usize = 976;
    pub const FLAG_WHITE: usize = 980;
    pub const PENALTIES: usize = 1004; // f32[5]: pit geçişi, dur-kalk, pit, süre, yavaşla
    pub const COMPLETED_LAPS: usize = 1028;
    pub const CURRENT_LAP_VALID: usize = 1032;
    pub const LAP_FRACTION: usize = 1044;
    pub const LAP_BEST: usize = 1068;
    pub const LAP_PREVIOUS: usize = 1084;
    pub const LAP_CURRENT: usize = 1100;
    pub const DELTA_BEST: usize = 1132;
    pub const INCIDENT_POINTS: usize = 1172;
    pub const VEHICLE_INFO: usize = 1196; // r3e_driver_info
    pub const PLAYER_NAME: usize = 1324;
    pub const CAR_SPEED: usize = 1392;
    pub const ENGINE_RPS: usize = 1396;
    pub const MAX_ENGINE_RPS: usize = 1400;
    pub const UPSHIFT_RPS: usize = 1404;
    pub const GEAR: usize = 1408;
    pub const LOCAL_ACCEL: usize = 1440; // f32[3]: +X sol, +Y yukarı, +Z geri
    pub const FUEL_LEFT: usize = 1456;
    pub const FUEL_CAPACITY: usize = 1460;
    pub const ENGINE_TEMP: usize = 1480;
    pub const OIL_TEMP: usize = 1484;
    pub const THROTTLE: usize = 1500;
    pub const BRAKE: usize = 1508;
    pub const CLUTCH: usize = 1516;
    pub const STEER: usize = 1524;
    pub const STEER_RANGE: usize = 1532;
    pub const AID_ABS: usize = 1536;
    pub const AID_TC: usize = 1540;
    pub const DRS_AVAILABLE: usize = 1560;
    pub const DRS_ENGAGED: usize = 1568;
    pub const DRS_EQUIPPED: usize = 1556;
    pub const PIT_LIMITER: usize = 1572;
    pub const BATTERY_SOC: usize = 1608;
    pub const TIRE_WEAR: usize = 1680; // f32[4] 1 = yeni
    pub const TIRE_PRESSURE: usize = 1712; // kPa
    pub const TIRE_TEMP: usize = 1744; // 4 × (f32[3] sol/orta/sağ + 3 f32)
    pub const TIRE_TEMP_SIZE: usize = 24;
    pub const TIRE_SUBTYPE_FRONT: usize = 1848;
    pub const TIRE_ON_MTRL: usize = 1952; // i32[4]
    pub const CAR_DAMAGE: usize = 1984; // motor, şanzıman, aero, süspansiyon (1 = sağlam)
    pub const NUM_CARS: usize = 2008;
    pub const DRIVERS: usize = 2012;
    pub const DRIVER_SIZE: usize = 328;

    // r3e_driver_data içinde
    pub const D_NAME: usize = 0;
    pub const D_CAR_NUMBER: usize = 64;
    pub const D_CLASS_ID: usize = 68;
    pub const D_MODEL_ID: usize = 72;
    pub const D_USER_ID: usize = 88;
    pub const D_SLOT_ID: usize = 92;
    pub const D_CLASS_PERF: usize = 96;
    pub const D_PLACE: usize = 132;
    pub const D_LAP_DISTANCE: usize = 140;
    pub const D_LAP_FRACTION: usize = 144;
    pub const D_POSITION: usize = 148; // f32[3]
    pub const D_SECTOR: usize = 160;
    pub const D_COMPLETED_LAPS: usize = 164;
    pub const D_SECTOR_PREV: usize = 188; // f32[3] birikimli: [2] = tur
    pub const D_SECTOR_BEST: usize = 200;
    pub const D_IN_PITLANE: usize = 224;
    pub const D_TIRE_SUBTYPE_FRONT: usize = 264;
    pub const D_FINISH_STATUS: usize = 128;
}

pub const MAX_DRIVERS: usize = 128;

fn drivers_base(b: &[u8]) -> (usize, usize) {
    let off = rd_i32(b, o::ALL_DRIVERS_OFFSET);
    let size = rd_i32(b, o::DRIVER_DATA_SIZE);
    let base = if off > 0 && (off as usize) < 8192 {
        off as usize + 4
    } else {
        o::DRIVERS
    };
    let size = if (200..=1024).contains(&size) {
        size as usize
    } else {
        o::DRIVER_SIZE
    };
    (base, size)
}

fn num_cars(b: &[u8]) -> usize {
    let (base, _) = drivers_base(b);
    rd_i32(b, base - 4).clamp(0, MAX_DRIVERS as i32) as usize
}

fn drv(b: &[u8], i: usize) -> usize {
    let (base, size) = drivers_base(b);
    base + i * size
}

/// Okunması gereken bayt sayısı (sürücü sayısına göre)
pub fn read_len(b: &[u8]) -> usize {
    let (base, size) = drivers_base(b);
    base + MAX_DRIVERS * size
}

pub fn connected_state(b: &[u8]) -> bool {
    rd_i32(b, o::VERSION_MAJOR) == 3
        && (rd_i32(b, o::GAME_IN_MENUS) == 0 || rd_i32(b, o::GAME_IN_REPLAY) == 1)
        && num_cars(b) > 0
        && rd_i32(b, o::SESSION_TYPE) >= 0
}

fn session_kind(t: i32) -> &'static str {
    match t {
        0 => "Practice",
        1 => "Qualify",
        2 => "Race",
        3 => "Warmup",
        _ => "",
    }
}

fn session_num(b: &[u8]) -> i32 {
    rd_i32(b, o::SESSION_TYPE) * 10 + rd_i32(b, o::SESSION_ITERATION).clamp(0, 9)
}

/// Sürücünün kalıcı kimliği (slot)
fn slot(b: &[u8], i: usize) -> i64 {
    rd_i32(b, drv(b, i) + o::D_SLOT_ID) as i64
}

pub fn session_sig(b: &[u8]) -> u64 {
    let n = num_cars(b).min(MAX_CARS);
    let names: Vec<String> = (0..n)
        .map(|i| rd_cstr(b, drv(b, i) + o::D_NAME, 64))
        .collect();
    let mut parts: Vec<&str> = names.iter().map(|s| s.as_str()).collect();
    let track = rd_cstr(b, o::TRACK_NAME, 64);
    let layout = rd_cstr(b, o::LAYOUT_NAME, 64);
    parts.push(&track);
    parts.push(&layout);
    let mut nums = vec![
        session_num(b) as i64,
        rd_i32(b, o::NUMBER_OF_LAPS) as i64,
        rd_i32(b, o::VEHICLE_INFO + o::D_SLOT_ID) as i64,
    ];
    nums.extend((0..n).map(|i| slot(b, i)));
    nums.extend((0..n).map(|i| rd_i32(b, drv(b, i) + o::D_CLASS_ID) as i64));
    sig(&parts, &nums)
}

pub fn build_session(b: &[u8]) -> SessionData {
    let mut sd = empty_session();
    sd.track_name = rd_cstr(b, o::TRACK_NAME, 64);
    sd.track_config = rd_cstr(b, o::LAYOUT_NAME, 64);
    sd.track_id = rd_i32(b, o::LAYOUT_ID);
    sd.track_length_km = (rd_f32(b, o::LAYOUT_LENGTH) / 1000.0).max(0.0);
    let pit = rd_f32(b, o::PIT_SPEED_LIMIT);
    sd.pit_limit_kph = if pit > 0.0 { pit * 3.6 } else { 0.0 };
    sd.fuel_max_ltr = rd_f32(b, o::FUEL_CAPACITY).max(0.0);
    let rps = std::f32::consts::TAU / 60.0;
    sd.redline = (rd_f32(b, o::MAX_ENGINE_RPS) / rps).max(0.0);
    let up = rd_f32(b, o::UPSHIFT_RPS) / rps;
    sd.shift_rpm = if up > 0.0 { up } else { 0.0 };
    sd.incident_limit = rd_i32(b, o::MAX_INCIDENT_POINTS).max(0);
    let sec = [
        rd_f32(b, o::SECTOR_STARTS + 4),
        rd_f32(b, o::SECTOR_STARTS + 8),
    ];
    if sec.iter().all(|v| *v > 0.0 && *v < 1.0) && sec[0] < sec[1] {
        sd.sector_starts = vec![0.0, sec[0], sec[1]];
    }
    let n = num_cars(b).min(MAX_CARS);
    let my_slot = rd_i32(b, o::VEHICLE_INFO + o::D_SLOT_ID) as i64;
    // Sınıflar: performans endeksine göre sıralı
    let mut classes: Vec<(i32, i32)> = Vec::new();
    for i in 0..n {
        let d = drv(b, i);
        let c = rd_i32(b, d + o::D_CLASS_ID);
        let perf = rd_i32(b, d + o::D_CLASS_PERF);
        match classes.iter_mut().find(|x| x.0 == c) {
            Some(x) => x.1 = x.1.max(perf),
            None => classes.push((c, perf)),
        }
    }
    classes.sort_by(|a, b| b.1.cmp(&a.1));
    let multi = classes.len() > 1;
    for i in 0..n {
        let d = drv(b, i);
        let c = rd_i32(b, d + o::D_CLASS_ID);
        let class_name = if multi {
            format!(
                "Class {}",
                classes.iter().position(|x| x.0 == c).unwrap_or(0) + 1
            )
        } else {
            String::new()
        };
        let (_, class_color) = class_ident(&format!("r3e-class-{c}"));
        let name = rd_cstr(b, d + o::D_NAME, 64);
        let num = rd_i32(b, d + o::D_CAR_NUMBER);
        if slot(b, i) == my_slot {
            sd.player_idx = i as i32;
        }
        sd.drivers[i] = Some(Driver {
            car_idx: i as i32,
            user_id: rd_i32(b, d + o::D_USER_ID).max(0) as i64,
            abbrev: name.clone(),
            name,
            car_number: if num >= 0 {
                num.to_string()
            } else {
                String::new()
            },
            class_id: c,
            class_name,
            class_color,
            car_id: rd_i32(b, d + o::D_MODEL_ID),
            car_path: format!("r3e_{}", rd_i32(b, d + o::D_MODEL_ID)),
            ..Default::default()
        });
    }
    let t = rd_i32(b, o::SESSION_TYPE);
    let kind = session_kind(t);
    let laps = rd_i32(b, o::NUMBER_OF_LAPS);
    sd.sessions.push(SessionEntry {
        num: session_num(b),
        kind: kind.to_string(),
        laps: if kind == "Race" && laps > 0 {
            Some(laps)
        } else {
            None
        },
        time: None,
        ..Default::default()
    });
    sd
}

#[derive(Default)]
pub struct Motion {
    fwd: Option<(f32, f32)>,
    rel: Vec<(f32, f32)>,
}

fn secs(v: f32) -> f32 {
    if v > 0.0 && v < 86_400.0 {
        v
    } else {
        -1.0
    }
}

pub fn extract(b: &[u8], sd: &SessionData, m: &mut Motion, f: &mut Frame) {
    let (tick, st) = (f.tick, f.session_time);
    let side = f.demo_side_cars.take();
    *f = Frame {
        tick,
        session_time: st,
        demo_side_cars: side,
        ..Frame::default()
    };
    let n = num_cars(b).min(MAX_CARS);
    let me = sd.player_idx.max(-1);
    f.player_idx = me;
    f.session_num = session_num(b);
    let race = sd.is_race(f.session_num);
    let track_len = rd_f32(b, o::LAYOUT_LENGTH);

    for i in 0..n {
        if sd.driver(i).is_none() {
            continue;
        }
        let d = drv(b, i);
        let c: &mut CarState = &mut f.cars[i];
        let frac = rd_f32(b, d + o::D_LAP_FRACTION);
        c.pct = if frac >= 0.0 {
            frac.clamp(0.0, 0.9999)
        } else if track_len > 0.0 {
            (rd_f32(b, d + o::D_LAP_DISTANCE) / track_len).clamp(0.0, 0.9999)
        } else {
            0.0
        };
        c.lap_completed = rd_i32(b, d + o::D_COMPLETED_LAPS).max(0);
        c.lap = c.lap_completed + 1;
        c.position = rd_i32(b, d + o::D_PLACE).max(0);
        c.sector = (rd_i32(b, d + o::D_SECTOR).clamp(-1, 200) + 2) as u8;
        c.on_pit = rd_i32(b, d + o::D_IN_PITLANE) == 1;
        c.surface = if c.on_pit { 2 } else { 3 };
        c.last = secs(rd_f32(b, d + o::D_SECTOR_PREV + 8));
        c.best = secs(rd_f32(b, d + o::D_SECTOR_BEST + 8));
        let sub = rd_i32(b, d + o::D_TIRE_SUBTYPE_FRONT);
        c.tire_kind = match sub {
            2 => b'S',
            3 => b'M',
            4 => b'H',
            0 | 1 => b'D',
            _ => 0,
        };
        c.tire = if c.tire_kind == 0 { -1 } else { 0 };
        if rd_i32(b, d + o::D_FINISH_STATUS) >= 2 {
            c.surface = -1;
        }
    }

    // Oyuncu
    f.speed = rd_f32(b, o::CAR_SPEED).max(0.0);
    f.rpm = (rd_f32(b, o::ENGINE_RPS) * 60.0 / std::f32::consts::TAU).max(0.0);
    let gear = rd_i32(b, o::GEAR);
    f.gear = if gear < -1 { 0 } else { gear };
    f.throttle = rd_f32(b, o::THROTTLE).clamp(0.0, 1.0);
    f.brake = rd_f32(b, o::BRAKE).clamp(0.0, 1.0);
    f.clutch = rd_f32(b, o::CLUTCH).clamp(0.0, 1.0);
    f.steer = steer_rad(rd_f32(b, o::STEER), rd_i32(b, o::STEER_RANGE) as f32);
    f.abs_active = rd_i32(b, o::AID_ABS) == 5;
    f.tc_active = rd_i32(b, o::AID_TC) == 5;
    // Yerel ivme: +X sol, +Z geri
    f.lat_g = -rd_f32(b, o::LOCAL_ACCEL) / 9.80665;
    f.long_g = -rd_f32(b, o::LOCAL_ACCEL + 8) / 9.80665;
    let cap = rd_f32(b, o::FUEL_CAPACITY);
    f.fuel_level = rd_f32(b, o::FUEL_LEFT).max(0.0);
    f.fuel_pct = if cap > 0.0 {
        (f.fuel_level / cap).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let wt = rd_f32(b, o::ENGINE_TEMP);
    f.water_temp = if wt > 0.0 { wt } else { -1.0 };
    let ot = rd_f32(b, o::OIL_TEMP);
    f.oil_temp = if ot > 0.0 { ot } else { -1.0 };
    if rd_i32(b, o::PIT_LIMITER) == 1 {
        f.engine_warnings |= EW_PIT_LIMITER;
    }
    f.incidents = rd_i32(b, o::INCIDENT_POINTS).max(0);
    f.lap_invalid = rd_i32(b, o::CURRENT_LAP_VALID) == 0;
    let soc = rd_f32(b, o::BATTERY_SOC);
    if rd_i32(b, o::DRS_EQUIPPED) == 1 || soc >= 0.0 {
        f.hybrid = crate::model::Hybrid {
            has: soc >= 0.0,
            battery_pct: if soc >= 0.0 {
                (soc / 100.0).clamp(0.0, 1.0)
            } else {
                -1.0
            },
            drs: if rd_i32(b, o::DRS_EQUIPPED) != 1 {
                -1
            } else if rd_i32(b, o::DRS_ENGAGED) == 1 {
                3
            } else if rd_i32(b, o::DRS_AVAILABLE) == 1 {
                2
            } else {
                0
            },
            ..Default::default()
        };
    }
    // Cezalar: pit geçişi, dur-kalk, pit, süre, yavaşla (> -1 bekliyor)
    let pen = |k: usize| rd_f32(b, o::PENALTIES + k * 4) >= 0.0;
    f.penalty = if pen(1) {
        2
    } else if pen(0) || pen(2) {
        1
    } else if pen(3) {
        4
    } else if pen(4) {
        5
    } else {
        0
    };
    // Lastikler FL, FR, RL, RR (sıcaklık sol/orta/sağ)
    for c in 0..4 {
        let t = o::TIRE_TEMP + c * o::TIRE_TEMP_SIZE;
        f.tire_temp[c] = [rd_f32(b, t), rd_f32(b, t + 4), rd_f32(b, t + 8)];
        let w = rd_f32(b, o::TIRE_WEAR + c * 4);
        f.tire_wear[c] = if w >= 0.0 {
            [w.clamp(0.0, 1.0); 3]
        } else {
            [-1.0; 3]
        };
        let p = rd_f32(b, o::TIRE_PRESSURE + c * 4);
        f.tire_press[c] = p.max(0.0);
    }
    // Zemin: 2 çim, 3 toprak, 4 çakıl
    f.tyres_out = (0..4)
        .filter(|w| matches!(rd_i32(b, o::TIRE_ON_MTRL + w * 4), 2..=4))
        .count() as i8;
    // Hasar (1 = sağlam): motor, şanzıman, aero, süspansiyon
    let dmg = |k: usize| {
        let v = rd_f32(b, o::CAR_DAMAGE + k * 4);
        if v >= 0.0 {
            (1.0 - v).clamp(0.0, 1.0)
        } else {
            0.0
        }
    };
    let susp = dmg(3);
    f.damage = crate::drivecues::Damage {
        detail: 1,
        engine: dmg(0).max(dmg(1)),
        aero: dmg(2),
        susp: [susp; 4],
        ..Default::default()
    };

    f.lap_completed = rd_i32(b, o::COMPLETED_LAPS).max(0);
    f.lap = f.lap_completed + 1;
    f.lap_dist_pct = rd_f32(b, o::LAP_FRACTION).clamp(0.0, 1.0);
    f.lap_cur = rd_f32(b, o::LAP_CURRENT).max(0.0);
    f.lap_last = secs(rd_f32(b, o::LAP_PREVIOUS));
    f.lap_best = secs(rd_f32(b, o::LAP_BEST));
    let delta = rd_f32(b, o::DELTA_BEST);
    if f.lap_best > 0.0 && delta > -1000.0 && delta.abs() < 600.0 {
        f.delta_best = delta;
        f.delta_best_ok = true;
    }
    let in_pit = rd_i32(b, o::IN_PITLANE) == 1;
    f.on_pit_road = in_pit;
    f.is_in_garage = rd_i32(b, o::PLAYER_IN_GARAGE) == 1;
    f.replay = rd_i32(b, o::GAME_IN_REPLAY) == 1;
    f.is_on_track = !f.replay && !f.is_in_garage && rd_i32(b, o::GAME_IN_MENUS) == 0;
    if let Some(c) = (me >= 0).then(|| &mut f.cars[me as usize]) {
        c.on_pit = in_pit;
        c.surface = if f.is_in_garage {
            1
        } else if in_pit {
            2
        } else {
            3
        };
        c.last = f.lap_last;
        c.best = f.lap_best;
    }

    let remain = rd_f32(b, o::SESSION_TIME_REMAINING);
    f.session_time_remain = if remain >= 0.0 { remain as f64 } else { -1.0 };
    let laps = rd_i32(b, o::NUMBER_OF_LAPS);
    let leader_laps = (0..n)
        .find(|&i| f.cars[i].position == 1)
        .map(|i| f.cars[i].lap_completed)
        .unwrap_or(0);
    f.session_laps_remain = if race && laps > 0 {
        (laps - leader_laps).max(0)
    } else {
        32767
    };
    let phase = rd_i32(b, o::SESSION_PHASE);
    f.session_state = match phase {
        1 | 2 => 2,
        3 | 4 => STATE_PARADE,
        6 => STATE_CHECKERED,
        _ => STATE_RACING,
    };
    let lights = rd_i32(b, o::START_LIGHTS);
    if race && (1..=5).contains(&lights) {
        f.start_total = 5;
        f.start_lit = lights as u8;
    }
    let on = |off: usize| rd_i32(b, off) == 1;
    let mut bits = 0;
    if on(o::FLAG_YELLOW) {
        bits |= flags::YELLOW;
    }
    if on(o::FLAG_BLUE) {
        bits |= flags::BLUE;
    }
    if on(o::FLAG_BLACK) {
        bits |= flags::BLACK;
    }
    if on(o::FLAG_GREEN) {
        bits |= flags::GREEN;
    }
    if on(o::FLAG_CHECKERED) {
        bits |= flags::CHECKERED;
    }
    if on(o::FLAG_WHITE) {
        bits |= flags::WHITE;
    }
    f.session_flags = bits;

    // Hareket ve yan araçlar. r3e.h: araç yerel ekseni +X sol, +Z geri; dünya ekseni aynı yönlü kabul edilir:
    // kuzeye (-Z) giden aracın solu +X -> doğu = -X, kuzey = -Z.
    let vx = rd_f64(b, o::PLAYER_VELOCITY) as f32;
    let vz = rd_f64(b, o::PLAYER_VELOCITY + 16) as f32;
    let (east, north) = (-vx, -vz);
    motion(f, east, north);
    let v = (east * east + north * north).sqrt();
    if v > 3.0 {
        m.fwd = Some((east / v, north / v));
    }
    m.rel.clear();
    if let (true, Some((fe, fnn))) = (me >= 0, m.fwd) {
        let pos = |i: usize| {
            let d = drv(b, i);
            (
                -rd_f32(b, d + o::D_POSITION),
                -rd_f32(b, d + o::D_POSITION + 8),
            )
        };
        let (mx, mn) = pos(me as usize);
        let (re, rn) = (fnn, -fe);
        for i in 0..n {
            if i == me as usize || f.cars[i].on_pit || sd.driver(i).is_none() {
                continue;
            }
            let (x, y) = pos(i);
            let (de, dn) = (x - mx, y - mn);
            m.rel.push((de * re + dn * rn, de * fe + dn * fnn));
        }
    }
    fill_radar(f, &m.rel, f.is_on_track && !f.replay);
    fill_estimates(f, sd, true, true);
}

// ---------------------------------------------------------------------------
// Windows: canlı kaynak
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub use win::R3e;

#[cfg(windows)]
mod win {
    use super::*;
    use crate::sims::shm::{self, Mapping};
    use std::cell::Cell;
    use std::time::{Duration, Instant};

    pub struct R3e {
        map: Mapping,
        b: Vec<u8>,
        session: SessionData,
        motion: Motion,
        sig: u64,
        last_sig_check: Instant,
        tick: i32,
        t0: Instant,
        last_ticks: i32,
        last_new: Instant,
        last_emit: Instant,
        checked: Cell<Instant>,
        alive: Cell<bool>,
    }

    impl R3e {
        pub fn open() -> Option<R3e> {
            let map = Mapping::open("$R3E")?;
            if map.len() < o::DRIVERS {
                return None;
            }
            let now = Instant::now();
            Some(R3e {
                map,
                b: Vec::new(),
                session: SessionData::default(),
                motion: Motion::default(),
                sig: 0,
                last_sig_check: now.checked_sub(Duration::from_secs(10)).unwrap_or(now),
                tick: 0,
                t0: now,
                last_ticks: i32::MIN,
                last_new: now,
                last_emit: now,
                checked: Cell::new(now),
                alive: Cell::new(true),
            })
        }

        fn snapshot(&mut self) {
            self.map.copy(0, o::DRIVERS, &mut self.b);
            let len = read_len(&self.b).min(self.map.len());
            self.map.copy(0, len, &mut self.b);
        }
    }

    impl Source for R3e {
        fn kind(&self) -> SimKind {
            SimKind::R3e
        }

        fn wait(&self, ms: u32) {
            std::thread::sleep(Duration::from_millis(ms.min(15) as u64));
        }

        fn connected(&self) -> bool {
            if self.map.u32_at(o::VERSION_MAJOR) != 3 {
                return false;
            }
            let menus = self.map.u32_at(o::GAME_IN_MENUS) as i32;
            let replay = self.map.u32_at(o::GAME_IN_REPLAY) as i32;
            if menus != 0 && replay != 1 {
                return false;
            }
            if self.last_new.elapsed() > Duration::from_secs(10)
                && self.checked.get().elapsed() > Duration::from_secs(5)
            {
                self.checked.set(Instant::now());
                self.alive
                    .set(shm::any_running(&["rrre64.exe", "rrre.exe"]));
            }
            self.alive.get() || self.last_new.elapsed() < Duration::from_secs(10)
        }

        fn session_update(&mut self) -> Option<SessionData> {
            if self.last_sig_check.elapsed() < Duration::from_millis(500) {
                return None;
            }
            self.last_sig_check = Instant::now();
            self.snapshot();
            if !connected_state(&self.b) {
                return None;
            }
            let s = session_sig(&self.b);
            if s == self.sig {
                return None;
            }
            self.sig = s;
            self.t0 = Instant::now();
            self.session = build_session(&self.b);
            Some(self.session.clone())
        }

        fn read(&mut self, frame: &mut Frame) -> bool {
            // Fizik zamanı (tick) ilerledi mi; duraklatmada yarım saniyede bir kare
            let ticks = self.map.u32_at(44) as i32; // player.game_simulation_ticks
            let now = Instant::now();
            if ticks != self.last_ticks {
                self.last_ticks = ticks;
                self.last_new = now;
            } else if now.duration_since(self.last_emit) < Duration::from_millis(500) {
                return false;
            }
            self.last_emit = now;
            self.snapshot();
            self.tick = self.tick.wrapping_add(1);
            frame.tick = self.tick;
            frame.session_time = self.t0.elapsed().as_secs_f64();
            extract(&self.b, &self.session, &mut self.motion, frame);
            true
        }

        fn map_key(&self, s: &SessionData) -> String {
            map_key(SimKind::R3e, s)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pi(b: &mut [u8], off: usize, v: i32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn pf(b: &mut [u8], off: usize, v: f32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn pd(b: &mut [u8], off: usize, v: f64) {
        b[off..off + 8].copy_from_slice(&v.to_le_bytes());
    }
    fn ps(b: &mut [u8], off: usize, s: &str) {
        b[off..off + s.len()].copy_from_slice(s.as_bytes());
    }

    fn sample() -> Vec<u8> {
        let mut b = vec![0u8; o::DRIVERS + MAX_DRIVERS * o::DRIVER_SIZE];
        pi(&mut b, o::VERSION_MAJOR, 3);
        pi(&mut b, 4, 5);
        pi(&mut b, o::ALL_DRIVERS_OFFSET, o::NUM_CARS as i32);
        pi(&mut b, o::DRIVER_DATA_SIZE, o::DRIVER_SIZE as i32);
        ps(&mut b, o::TRACK_NAME, "Nürburgring");
        ps(&mut b, o::LAYOUT_NAME, "Grand Prix");
        pf(&mut b, o::LAYOUT_LENGTH, 5148.0);
        pi(&mut b, o::SESSION_TYPE, 2);
        pi(&mut b, o::SESSION_PHASE, 5);
        pi(&mut b, o::NUMBER_OF_LAPS, 12);
        pi(&mut b, o::VEHICLE_INFO + o::D_SLOT_ID, 7);
        pi(&mut b, o::NUM_CARS, 2);
        for (i, (name, slot, place, frac, x, z, class)) in [
            ("Leader", 3, 1, 0.5f32, -2.5f32, -1.0f32, 1700),
            ("Erkin Azcan", 7, 2, 0.25, 0.0, 0.0, 1700),
        ]
        .iter()
        .enumerate()
        {
            let d = o::DRIVERS + i * o::DRIVER_SIZE;
            ps(&mut b, d + o::D_NAME, name);
            pi(&mut b, d + o::D_SLOT_ID, *slot);
            pi(&mut b, d + o::D_PLACE, *place);
            pf(&mut b, d + o::D_LAP_FRACTION, *frac);
            pi(&mut b, d + o::D_COMPLETED_LAPS, 3);
            pi(&mut b, d + o::D_CLASS_ID, *class);
            pi(&mut b, d + o::D_CAR_NUMBER, 10 + i as i32);
            pf(&mut b, d + o::D_SECTOR_PREV + 8, 112.5 + i as f32);
            pf(&mut b, d + o::D_SECTOR_BEST + 8, 111.0);
            pf(&mut b, d + o::D_POSITION, *x);
            pf(&mut b, d + o::D_POSITION + 8, *z);
            pi(&mut b, d + o::D_TIRE_SUBTYPE_FRONT, 2);
        }
        pf(&mut b, o::CAR_SPEED, 40.0);
        pf(&mut b, o::ENGINE_RPS, 600.0);
        pi(&mut b, o::GEAR, 4);
        pf(&mut b, o::THROTTLE, 0.8);
        pf(&mut b, o::FUEL_LEFT, 30.0);
        pf(&mut b, o::FUEL_CAPACITY, 100.0);
        pi(&mut b, o::PIT_LIMITER, 1);
        pi(&mut b, o::FLAG_BLUE, 1);
        pi(&mut b, o::FLAG_YELLOW, -1);
        for k in 0..5 {
            pf(&mut b, o::PENALTIES + k * 4, -1.0);
        }
        pf(&mut b, o::PENALTIES + 4, 0.0); // dur-kalk
        pf(&mut b, o::TIRE_TEMP + 2 * 24 + 4, 88.0);
        pf(&mut b, o::TIRE_WEAR + 4, 0.9);
        pf(&mut b, o::CAR_DAMAGE + 8, 0.75);
        pf(&mut b, o::LAP_FRACTION, 0.25);
        pi(&mut b, o::COMPLETED_LAPS, 3);
        pf(&mut b, o::LAP_PREVIOUS, 113.5);
        pf(&mut b, o::LAP_BEST, -1.0);
        pi(&mut b, o::START_LIGHTS, 3);
        pi(&mut b, o::CURRENT_LAP_VALID, 0);
        // kuzeye (-Z) 30 m/s
        pd(&mut b, o::PLAYER_VELOCITY + 16, -30.0);
        b
    }

    #[test]
    fn parses_session_and_frame() {
        let b = sample();
        assert!(connected_state(&b));
        let sd = build_session(&b);
        assert_eq!(sd.track_name, "Nürburgring");
        assert_eq!(sd.track_config, "Grand Prix");
        assert_eq!(sd.player_idx, 1);
        assert!(sd.is_race(session_num(&b)));
        assert_eq!(sd.driver(0).unwrap().name, "Leader");
        assert_eq!(sd.driver(1).unwrap().car_number, "11");
        assert_eq!(sd.driver(0).unwrap().class_name, "");
        let mut f = Frame::default();
        extract(&b, &sd, &mut Motion::default(), &mut f);
        assert_eq!(f.player_idx, 1);
        assert_eq!(f.gear, 4);
        assert!((f.rpm - 600.0 * 60.0 / std::f32::consts::TAU).abs() < 0.1);
        assert_eq!(f.fuel_level, 30.0);
        assert!((f.fuel_pct - 0.3).abs() < 1e-6);
        assert_eq!(f.engine_warnings, EW_PIT_LIMITER);
        assert_eq!(f.session_flags, flags::BLUE);
        assert_eq!(f.penalty, 2);
        assert_eq!(f.tire_temp[2][1], 88.0);
        assert_eq!(f.tire_wear[1], [0.9; 3]);
        assert!((f.damage.aero - 0.25).abs() < 1e-6);
        assert_eq!(f.lap, 4);
        assert_eq!(f.lap_last, 113.5);
        assert_eq!(f.lap_best, -1.0);
        assert!(f.lap_invalid);
        assert_eq!(f.cars[0].best, 111.0);
        assert_eq!(f.cars[0].last, 112.5);
        assert_eq!(f.cars[0].tire_kind, b'S');
        assert_eq!(f.cars[1].class_position, 2);
        assert!(f.cars[1].f2 > 0.0);
        assert_eq!((f.start_lit, f.start_total), (3, 5));
        assert_eq!(f.session_laps_remain, 9);
        // Lider: dünya X = -2.5 (+X sol -> 2.5 m sağda), Z = -1 (1 m önde)
        assert_eq!(f.car_left_right, 3);
    }

    #[test]
    fn multiclass_names() {
        let mut b = sample();
        let d = o::DRIVERS;
        pi(&mut b, d + o::D_CLASS_ID, 99);
        pi(&mut b, d + o::D_CLASS_PERF, 500);
        let sd = build_session(&b);
        assert_eq!(sd.driver(0).unwrap().class_name, "Class 1");
        assert_eq!(sd.driver(1).unwrap().class_name, "Class 2");
    }
}
