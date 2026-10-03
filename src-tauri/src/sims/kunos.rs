#![cfg_attr(not(windows), allow(dead_code))]
//! Assetto Corsa ve Assetto Corsa Competizione (Kunos) paylaşımlı belleği.
//!
//! Üç sayfa (`#pragma pack(4)`, SharedFileOut.h):
//!   `Local\acpmf_physics`  SPageFilePhysics  (ACC: 800 bayt)
//!   `Local\acpmf_graphics` SPageFileGraphic  (AC: 296, ACC: 1588 bayt)
//!   `Local\acpmf_static`   SPageFileStatic   (ACC: 820 bayt)
//! wchar_t dizileri UTF-16'dır. AC ile ACC'nin graphics sayfası 252. bayttan sonra ayrışır
//! (AC: carCoordinates[3], ACC: activeCars + 60 aracın koordinatları).
//!
//! AC paylaşımlı belleği rakip araç verisi vermez (sadece oyuncu). ACC rakiplerin sadece
//! dünya koordinatlarını verir: bunları radar/spotter için kullanıyoruz; isim/sıra için
//! ACC broadcasting (UDP) gerekir, burada kullanılmıyor.

use super::*;
use crate::model::{Driver, SessionEntry};

/// SPageFilePhysics alan konumları
pub mod ph {
    pub const PACKET_ID: usize = 0;
    pub const GAS: usize = 4;
    pub const BRAKE: usize = 8;
    pub const FUEL: usize = 12;
    pub const GEAR: usize = 16;
    pub const RPMS: usize = 20;
    pub const STEER_ANGLE: usize = 24;
    pub const SPEED_KMH: usize = 28;
    pub const VELOCITY: usize = 32; // float[3], dünya koordinatları
    pub const ACC_G: usize = 44; // float[3] g: x yanal, y dikey, z boyuna
    pub const WHEELS_PRESSURE: usize = 88; // float[4] psi
    pub const TYRE_WEAR: usize = 120; // float[4]
    pub const TYRE_CORE_TEMP: usize = 152; // float[4]
    pub const DRS: usize = 200; // AC: kanat açıklığı 0..1
    pub const PIT_LIMITER_ON: usize = 248;
    // AC (ACC'de kullanılmaz): KERS/ERS
    pub const KERS_CHARGE: usize = 256; // 0..1
    pub const KERS_INPUT: usize = 260; // 0..1
    pub const ERS_RECOVERY_LEVEL: usize = 320;
    pub const ERS_POWER_LEVEL: usize = 324;
    pub const ERS_IS_CHARGING: usize = 332;
    pub const KERS_CURRENT_KJ: usize = 336; // bu turda harcanan (kJ)
    pub const DRS_AVAILABLE: usize = 340;
    pub const DRS_ENABLED: usize = 344;
    pub const AIR_TEMP: usize = 288;
    pub const ROAD_TEMP: usize = 292;
    pub const CLUTCH: usize = 364;
    pub const TYRE_TEMP_I: usize = 368; // float[4] iç
    pub const TYRE_TEMP_M: usize = 384;
    pub const TYRE_TEMP_O: usize = 400; // dış
    pub const BRAKE_BIAS: usize = 564;
    pub const CURRENT_MAX_RPM: usize = 588;
    pub const TC_IN_ACTION: usize = 672;
    pub const ABS_IN_ACTION: usize = 676;
    pub const SIZE: usize = 800;
}

/// SPageFileGraphic alan konumları (ortak kısım + ACC eklemeleri)
pub mod gr {
    pub const PACKET_ID: usize = 0;
    pub const STATUS: usize = 4; // 0 kapalı, 1 tekrar, 2 canlı, 3 duraklatıldı
    pub const SESSION: usize = 8;
    pub const COMPLETED_LAPS: usize = 132;
    pub const POSITION: usize = 136;
    pub const I_CURRENT_TIME: usize = 140;
    pub const I_LAST_TIME: usize = 144;
    pub const I_BEST_TIME: usize = 148;
    pub const SESSION_TIME_LEFT: usize = 152;
    pub const IS_IN_PIT: usize = 160;
    pub const NUMBER_OF_LAPS: usize = 172;
    pub const TYRE_COMPOUND: usize = 176; // wchar_t[33]
    pub const NORMALIZED_CAR_POSITION: usize = 248;
    // AC
    pub const AC_CAR_COORDINATES: usize = 252;
    pub const AC_FLAG: usize = 268;
    pub const AC_IS_IN_PIT_LANE: usize = 276;
    pub const AC_WIND_SPEED: usize = 288;
    pub const AC_WIND_DIRECTION: usize = 292;
    pub const AC_SIZE: usize = 296;
    // ACC
    pub const ACTIVE_CARS: usize = 252;
    pub const CAR_COORDINATES: usize = 256; // float[60][3]
    pub const CAR_ID: usize = 976; // int[60]
    pub const PLAYER_CAR_ID: usize = 1216;
    pub const FLAG: usize = 1224;
    pub const PENALTY: usize = 1228; // ACC_PENALTY_TYPE
    pub const IS_IN_PIT_LANE: usize = 1236;
    pub const WIND_SPEED: usize = 1248;
    pub const WIND_DIRECTION: usize = 1252;
    pub const TC: usize = 1268;
    pub const ABS: usize = 1280;
    pub const SESSION_INDEX: usize = 1320;
    pub const I_DELTA_LAP_TIME: usize = 1360;
    pub const I_ESTIMATED_LAP_TIME: usize = 1396;
    pub const IS_DELTA_POSITIVE: usize = 1400;
    pub const IS_VALID_LAP: usize = 1408;
    pub const GLOBAL_YELLOW: usize = 1500;
    pub const GLOBAL_WHITE: usize = 1516;
    pub const GLOBAL_GREEN: usize = 1520;
    pub const GLOBAL_CHEQUERED: usize = 1524;
    pub const GLOBAL_RED: usize = 1528;
    pub const TRACK_GRIP_STATUS: usize = 1556;
    pub const RAIN_INTENSITY: usize = 1560;
    pub const SIZE: usize = 1588;
}

/// SPageFileStatic alan konumları
pub mod stc {
    pub const SM_VERSION: usize = 0; // wchar_t[15]
    pub const CAR_MODEL: usize = 68; // wchar_t[33]
    pub const TRACK: usize = 134;
    pub const PLAYER_NAME: usize = 200;
    pub const PLAYER_SURNAME: usize = 266;
    pub const PLAYER_NICK: usize = 332;
    pub const MAX_RPM: usize = 412;
    pub const MAX_FUEL: usize = 416;
    // AC: hibrit bilgisi
    pub const HAS_DRS: usize = 496;
    pub const HAS_ERS: usize = 500;
    pub const HAS_KERS: usize = 504;
    pub const KERS_MAX_J: usize = 508;
    pub const ERS_MAX_J: usize = 592; // tur başına harcama sınırı
    pub const TRACK_SPLINE_LENGTH: usize = 520;
    pub const TRACK_CONFIGURATION: usize = 524; // wchar_t[33]
    /// ACC: çevrimiçi oturum (int). ersMaxJ 592, isTimedRace 596, hasExtraLap 600, carSkin 604 (wchar_t[33]),
    /// reversedGridPositions 672, PitWindowStart 676, PitWindowEnd 680, isOnline 684
    pub const IS_ONLINE: usize = 684;
    pub const SIZE: usize = 820;
}

pub const STATUS_OFF: i32 = 0;
pub const STATUS_REPLAY: i32 = 1;
pub const STATUS_LIVE: i32 = 2;
pub const STATUS_PAUSE: i32 = 3;

/// Assetto Corsa (ACC değil): KERS/ERS ve DRS. `stat` SPageFileStatic. ACC bu alanları doldurmaz.
pub fn hybrid(kind: SimKind, phys: &[u8], stat: &[u8]) -> crate::model::Hybrid {
    let mut h = crate::model::Hybrid::default();
    if kind != SimKind::Ac || stat.len() < stc::ERS_MAX_J + 4 {
        return h;
    }
    if rd_i32(stat, stc::HAS_DRS) != 0 {
        h.drs = if rd_i32(phys, ph::DRS_ENABLED) != 0 || rd_f32(phys, ph::DRS) > 0.5 {
            3
        } else if rd_i32(phys, ph::DRS_AVAILABLE) != 0 {
            2
        } else {
            0
        };
    }
    let ers = rd_i32(stat, stc::HAS_ERS) != 0;
    if !ers && rd_i32(stat, stc::HAS_KERS) == 0 {
        return h;
    }
    h.has = true;
    h.battery_pct = rd_f32(phys, ph::KERS_CHARGE).clamp(0.0, 1.0);
    let kers_max = rd_f32(stat, stc::KERS_MAX_J);
    if kers_max > 0.0 {
        h.battery_j = h.battery_pct * kers_max;
    }
    let lap_max = rd_f32(stat, stc::ERS_MAX_J);
    if lap_max > 0.0 {
        h.lap_deploy_left = (1.0 - rd_f32(phys, ph::KERS_CURRENT_KJ) * 1000.0 / lap_max).clamp(0.0, 1.0);
    }
    if ers {
        h.mode = rd_i32(phys, ph::ERS_POWER_LEVEL);
        h.regen_gain = rd_i32(phys, ph::ERS_RECOVERY_LEVEL) as f32;
    }
    h
}

/// Exe adlarına, yoksa graphics sayfasının düzenine göre AC mi ACC mi?
pub fn detect(gfx: &[u8], exes: &[String]) -> Option<SimKind> {
    let has = |n: &str| exes.iter().any(|e| e == n);
    if has("acc.exe") || has("ac2-win64-shipping.exe") {
        return Some(SimKind::Acc);
    }
    if has("acs.exe") || has("acs_x86.exe") {
        return Some(SimKind::Ac);
    }
    if rd_i32(gfx, gr::STATUS) == STATUS_OFF {
        return None;
    }
    // ACC'de 252. baytta aktif araç sayısı (1..60) vardır; AC'de ise oyuncunun x koordinatı
    // (float). Bir koordinatın bit deseninin 1..60 arası tamsayı olması pratikte imkânsız.
    let n = rd_i32(gfx, gr::ACTIVE_CARS);
    Some(if (1..=60).contains(&n) { SimKind::Acc } else { SimKind::Ac })
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct StaticInfo {
    pub car_model: String,
    pub track: String,
    pub track_config: String,
    pub player: String,
    pub nick: String,
    pub max_rpm: i32,
    pub max_fuel: f32,
    pub track_len_m: f32,
    /// Sadece ACC: çevrimiçi oturum mu
    pub is_online: bool,
}

pub fn parse_static(b: &[u8]) -> StaticInfo {
    let first = rd_wstr(b, stc::PLAYER_NAME, 33);
    let last = rd_wstr(b, stc::PLAYER_SURNAME, 33);
    StaticInfo {
        car_model: rd_wstr(b, stc::CAR_MODEL, 33),
        track: rd_wstr(b, stc::TRACK, 33),
        track_config: rd_wstr(b, stc::TRACK_CONFIGURATION, 33),
        player: format!("{first} {last}").trim().to_string(),
        nick: rd_wstr(b, stc::PLAYER_NICK, 33),
        max_rpm: rd_i32(b, stc::MAX_RPM),
        max_fuel: rd_f32(b, stc::MAX_FUEL),
        track_len_m: rd_f32(b, stc::TRACK_SPLINE_LENGTH),
        is_online: rd_i32(b, stc::IS_ONLINE) == 1,
    }
}

fn session_kind(t: i32) -> &'static str {
    match t {
        0 => "Practice",
        1 => "Qualify",
        2 => "Race",
        3 | 4 | 7 | 8 => "Hotlap",
        5 => "Drift",
        6 => "Drag",
        _ => "",
    }
}

fn session_num(kind: SimKind, gfx: &[u8]) -> i32 {
    if kind == SimKind::Acc {
        rd_i32(gfx, gr::SESSION_INDEX).max(0)
    } else {
        0
    }
}

/// Oturum imzası: pist/araç/oturum değişince SessionData yeniden kurulur
pub fn session_sig(kind: SimKind, gfx: &[u8], si: &StaticInfo) -> u64 {
    sig(
        &[&si.track, &si.track_config, &si.car_model, &si.player],
        &[rd_i32(gfx, gr::SESSION) as i64, session_num(kind, gfx) as i64, rd_i32(gfx, gr::NUMBER_OF_LAPS) as i64],
    )
}

pub fn build_session(kind: SimKind, gfx: &[u8], phys: &[u8], si: &StaticInfo) -> SessionData {
    let mut sd = empty_session();
    sd.track_name = pretty(&si.track);
    sd.track_config = pretty(&si.track_config);
    sd.track_length_km = (si.track_len_m / 1000.0).max(0.0);
    sd.player_idx = 0;
    sd.fuel_max_ltr = si.max_fuel.max(0.0);
    let max_rpm = if si.max_rpm > 0 { si.max_rpm } else { rd_i32(phys, ph::CURRENT_MAX_RPM) };
    sd.redline = max_rpm.max(0) as f32;
    // ACC çevrimdışı ve pistte başka araçlar var: botlara karşı
    sd.ai_session = kind == SimKind::Acc && !si.is_online && rd_i32(gfx, gr::ACTIVE_CARS) > 1;
    let st = rd_i32(gfx, gr::SESSION);
    let kind_s = session_kind(st);
    let laps = rd_i32(gfx, gr::NUMBER_OF_LAPS);
    sd.sessions.push(SessionEntry {
        num: session_num(kind, gfx),
        kind: kind_s.to_string(),
        laps: if kind_s == "Race" && laps > 0 { Some(laps) } else { None },
        time: None,
    });
    let name = if si.player.is_empty() { si.nick.clone() } else { si.player.clone() };
    sd.drivers[0] = Some(Driver {
        car_idx: 0,
        abbrev: name.clone(),
        name,
        car_name: pretty(&si.car_model),
        car_path: si.car_model.clone(),
        ..Default::default()
    });
    sd
}

/// Kareler arasında korunan durum
#[derive(Default)]
pub struct Motion {
    /// Son bilinen ileri yön (doğu, kuzey); dururken yan araç hesabı için
    fwd: Option<(f32, f32)>,
    rel: Vec<(f32, f32)>,
}

#[inline]
fn ms_time(v: i32) -> f32 {
    if v > 0 && v < 86_400_000 {
        v as f32 / 1000.0
    } else {
        -1.0
    }
}

/// Fiziksel ve grafik sayfalarını `Frame`'e aktarır. `session_time` ve `tick` çağıran tarafından verilir.
pub fn extract(kind: SimKind, phys: &[u8], gfx: &[u8], sd: &SessionData, m: &mut Motion, f: &mut Frame) {
    let acc = kind == SimKind::Acc;
    let status = rd_i32(gfx, gr::STATUS);
    f.player_idx = 0;
    f.session_num = session_num(kind, gfx);
    let race = sd.is_race(f.session_num);

    f.speed = rd_f32(phys, ph::SPEED_KMH) / 3.6;
    f.rpm = rd_i32(phys, ph::RPMS) as f32;
    // AC: 0 geri, 1 boş, 2 birinci -> iRacing: -1, 0, 1
    f.gear = rd_i32(phys, ph::GEAR) - 1;
    f.throttle = rd_f32(phys, ph::GAS).clamp(0.0, 1.0);
    f.brake = rd_f32(phys, ph::BRAKE).clamp(0.0, 1.0);
    let clutch = rd_f32(phys, ph::CLUTCH).clamp(0.0, 1.0);
    // AC debriyajı kavrama oranı olarak verir (1 = bırakılmış pedal); ACC pedal konumu.
    f.clutch = if acc { clutch } else { 1.0 - clutch };
    f.steer = steer_rad(rd_f32(phys, ph::STEER_ANGLE), 0.0);
    f.abs_active = rd_u32(phys, ph::ABS_IN_ACTION) != 0;
    f.lat_g = rd_f32(phys, ph::ACC_G);
    f.long_g = rd_f32(phys, ph::ACC_G + 8);
    f.tc_active = rd_u32(phys, ph::TC_IN_ACTION) != 0;
    f.fuel_level = rd_f32(phys, ph::FUEL).max(0.0);
    f.fuel_pct = if sd.fuel_max_ltr > 0.0 { (f.fuel_level / sd.fuel_max_ltr).clamp(0.0, 1.0) } else { 0.0 };
    f.air_temp = rd_f32(phys, ph::AIR_TEMP);
    f.track_temp = rd_f32(phys, ph::ROAD_TEMP);
    f.engine_warnings = if rd_i32(phys, ph::PIT_LIMITER_ON) != 0 { EW_PIT_LIMITER } else { 0 };
    f.brake_bias = if acc {
        // ACC'de değer araca göre kaydırılmış gelir; yanlış göstermemek için boş bırakıyoruz
        -1.0
    } else {
        let b = rd_f32(phys, ph::BRAKE_BIAS);
        if b > 0.0 && b < 1.0 {
            b * 100.0
        } else {
            -1.0
        }
    };
    f.tc = if acc { rd_i32(gfx, gr::TC) as f32 } else { -1.0 };
    // ACC: tur geçersiz mi (pist sınırı vb.); AC bu bilgiyi vermez
    f.lap_invalid = acc && gfx.len() >= gr::IS_VALID_LAP + 4 && rd_i32(gfx, gr::IS_VALID_LAP) == 0;
    f.abs_setting = if acc { rd_i32(gfx, gr::ABS) as f32 } else { -1.0 };

    // Lastikler: FL, FR, RL, RR = LF, RF, LR, RR. iRacing sırası araç soldan sağa (L/M/R):
    // sol lastiklerde dış taraf soldadır, sağ lastiklerde iç taraf.
    for c in 0..4 {
        let ti = rd_f32(phys, ph::TYRE_TEMP_I + c * 4);
        let tm = rd_f32(phys, ph::TYRE_TEMP_M + c * 4);
        let to = rd_f32(phys, ph::TYRE_TEMP_O + c * 4);
        if ti > 0.0 || tm > 0.0 || to > 0.0 {
            let left_side = c % 2 == 0;
            f.tire_temp[c] = if left_side { [to, tm, ti] } else { [ti, tm, to] };
        } else {
            let core = rd_f32(phys, ph::TYRE_CORE_TEMP + c * 4);
            f.tire_temp[c] = [core; 3];
        }
        let wear = rd_f32(phys, ph::TYRE_WEAR + c * 4);
        f.tire_wear[c] = if !acc && wear > 0.0 { [(wear / 100.0).clamp(0.0, 1.0); 3] } else { [-1.0; 3] };
        f.tire_press[c] = rd_f32(phys, ph::WHEELS_PRESSURE + c * 4) * 6.894_757;
    }

    let completed = rd_i32(gfx, gr::COMPLETED_LAPS).max(0);
    f.lap_completed = completed;
    f.lap = completed + 1;
    f.lap_dist_pct = rd_f32(gfx, gr::NORMALIZED_CAR_POSITION).clamp(0.0, 1.0);
    f.lap_cur = ms_time(rd_i32(gfx, gr::I_CURRENT_TIME)).max(0.0);
    f.lap_last = ms_time(rd_i32(gfx, gr::I_LAST_TIME));
    f.lap_best = ms_time(rd_i32(gfx, gr::I_BEST_TIME));
    if acc && f.lap_best > 0.0 {
        let d = rd_i32(gfx, gr::I_DELTA_LAP_TIME).unsigned_abs() as f32 / 1000.0;
        f.delta_best = if rd_i32(gfx, gr::IS_DELTA_POSITIVE) != 0 { d } else { -d };
        f.delta_best_ok = d < 600.0;
    } else {
        f.delta_best = 0.0;
        f.delta_best_ok = false;
    }
    let left = rd_f32(gfx, gr::SESSION_TIME_LEFT);
    f.session_time_remain = if left > 0.0 { left as f64 / 1000.0 } else { -1.0 };
    let laps = rd_i32(gfx, gr::NUMBER_OF_LAPS);
    f.session_laps_remain = if race && laps > 0 { (laps - completed).max(0) } else { 32767 };

    let in_pit = rd_i32(gfx, gr::IS_IN_PIT) != 0;
    let pit_lane = rd_i32(gfx, if acc { gr::IS_IN_PIT_LANE } else { gr::AC_IS_IN_PIT_LANE }) != 0;
    f.on_pit_road = in_pit || pit_lane;
    f.is_in_garage = in_pit;
    f.replay = status == STATUS_REPLAY;
    f.is_on_track = (status == STATUS_LIVE || status == STATUS_PAUSE) && !in_pit;

    // Bayraklar -> iRacing bitleri
    let flag = rd_i32(gfx, if acc { gr::FLAG } else { gr::AC_FLAG });
    let mut bits = match flag {
        1 => flags::BLUE,
        2 => flags::YELLOW,
        3 | 6 => flags::BLACK,
        4 => flags::WHITE,
        5 => flags::CHECKERED,
        7 => flags::GREEN,
        _ => 0,
    };
    if acc {
        if rd_i32(gfx, gr::GLOBAL_YELLOW) != 0 {
            bits |= flags::YELLOW;
        }
        if rd_i32(gfx, gr::GLOBAL_WHITE) != 0 {
            bits |= flags::WHITE;
        }
        if rd_i32(gfx, gr::GLOBAL_GREEN) != 0 {
            bits |= flags::GREEN;
        }
        if rd_i32(gfx, gr::GLOBAL_CHEQUERED) != 0 {
            bits |= flags::CHECKERED;
        }
        if rd_i32(gfx, gr::GLOBAL_RED) != 0 {
            bits |= flags::RED;
        }
    }
    // ACC ceza türü (ACC_PENALTY_TYPE): pit geçişi / dur-kalk / diskalifiye / yarış sonu süre cezası
    f.penalty = if acc {
        match rd_i32(gfx, gr::PENALTY) {
            1 | 7 | 19 => 1,
            2..=4 | 8..=10 => 2,
            5 | 11 | 13 | 15..=18 | 20 | 21 => 3,
            14 => 4,
            _ => 0,
        }
    } else {
        0
    };
    f.session_flags = bits;
    f.session_state = if bits & flags::CHECKERED != 0 { STATE_CHECKERED } else { STATE_RACING };

    // Hava
    if acc {
        f.wind_vel = rd_f32(gfx, gr::WIND_SPEED);
        f.wind_dir = rd_f32(gfx, gr::WIND_DIRECTION);
        let rain = rd_i32(gfx, gr::RAIN_INTENSITY).clamp(0, 5);
        f.precip = rain as f32 / 5.0;
        f.track_wetness = match rd_i32(gfx, gr::TRACK_GRIP_STATUS) {
            0..=2 => 1,
            3 => 2,
            4 => 4,
            5 => 6,
            6 => 7,
            _ => 0,
        };
    } else {
        f.wind_vel = rd_f32(gfx, gr::AC_WIND_SPEED) / 3.6;
        f.wind_dir = rd_f32(gfx, gr::AC_WIND_DIRECTION).to_radians();
        f.precip = -1.0;
        f.track_wetness = 0;
    }

    // Hareket: dünya hızı (x, y, z); üstten bakışta doğu = x, kuzey = -z
    let vx = rd_f32(phys, ph::VELOCITY);
    let vz = rd_f32(phys, ph::VELOCITY + 8);
    motion(f, vx, -vz);
    let v = (vx * vx + vz * vz).sqrt();
    if v > 3.0 {
        m.fwd = Some((vx / v, -vz / v));
    }

    // Oyuncu aracı
    let position = rd_i32(gfx, gr::POSITION);
    for c in f.cars.iter_mut() {
        *c = crate::model::CarState { surface: -1, pct: -1.0, tire: -1, lap: -1, lap_completed: -1, last: -1.0, best: -1.0, ..Default::default() };
    }
    let me = &mut f.cars[0];
    me.lap = f.lap;
    me.lap_completed = completed;
    me.pct = f.lap_dist_pct;
    me.position = position.max(0);
    me.class_position = position.max(0);
    me.on_pit = f.on_pit_road;
    me.last = f.lap_last;
    me.best = f.lap_best;
    me.surface = if in_pit {
        1
    } else if pit_lane {
        2
    } else {
        3
    };
    // Lastik hamuru adı (ACC: "dry_compound"/"wet_compound", AC: "Soft (S)" vb.)
    let kind = crate::model::tire_kind_from_name(&rd_wstr(gfx, gr::TYRE_COMPOUND, 33));
    me.tire = if kind == b'W' { 1 } else { 0 };
    me.tire_kind = if kind == 0 { b'D' } else { kind };

    // ACC: rakiplerin dünya koordinatlarından yan araç radarı
    m.rel.clear();
    if acc {
        let n = rd_i32(gfx, gr::ACTIVE_CARS).clamp(0, 60) as usize;
        let pid = rd_i32(gfx, gr::PLAYER_CAR_ID);
        let pos = |i: usize| {
            let o = gr::CAR_COORDINATES + i * 12;
            (rd_f32(gfx, o), rd_f32(gfx, o + 8))
        };
        let my = (0..n).find(|&i| rd_i32(gfx, gr::CAR_ID + i * 4) == pid).map(pos);
        if let (Some((mx, mz)), Some((fe, fnn))) = (my, m.fwd) {
            let (re, rn) = (fnn, -fe); // sağ = ileri yönün saat yönünde 90°
            for i in 0..n {
                if rd_i32(gfx, gr::CAR_ID + i * 4) == pid {
                    continue;
                }
                let (x, z) = pos(i);
                if x == 0.0 && z == 0.0 {
                    continue;
                }
                let (de, dn) = (x - mx, -(z - mz));
                m.rel.push((de * re + dn * rn, de * fe + dn * fnn));
            }
        }
        fill_radar(f, &m.rel, f.is_on_track && !f.replay);
    } else {
        f.car_left_right = 0;
        f.demo_side_cars = None;
    }
    fill_estimates(f, sd, false, false);
}

// ---------------------------------------------------------------------------
// Windows: canlı kaynak
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub use win::Kunos;

#[cfg(windows)]
mod win {
    use super::*;
    use crate::sims::shm::{self, Mapping};
    use std::cell::Cell;
    use std::time::{Duration, Instant};

    pub struct Kunos {
        phys: Mapping,
        gfx: Mapping,
        stat: Mapping,
        kind: Option<SimKind>,
        pb: Vec<u8>,
        gb: Vec<u8>,
        sb: Vec<u8>,
        motion: Motion,
        session: SessionData,
        sig: u64,
        /// Son oturum denetiminde görülen static sayfa + oturum alanları (değişmediyse ayrıştırma yok)
        seen: (Vec<u8>, [i32; 3]),
        t0: Instant,
        tick: i32,
        last_ids: (u32, u32),
        last_new: Instant,
        last_emit: Instant,
        // Donmuş bellek (oyun kapandı) denetimi
        checked: Cell<Instant>,
        alive: Cell<bool>,
    }

    impl Kunos {
        pub fn open() -> Option<Kunos> {
            let gfx = Mapping::open("Local\\acpmf_graphics")?;
            let phys = Mapping::open("Local\\acpmf_physics")?;
            let stat = Mapping::open("Local\\acpmf_static")?;
            let now = Instant::now();
            Some(Kunos {
                phys,
                gfx,
                stat,
                kind: None,
                pb: Vec::new(),
                gb: Vec::new(),
                sb: Vec::new(),
                motion: Motion::default(),
                session: SessionData::default(),
                sig: 0,
                seen: (Vec::new(), [0; 3]),
                t0: now,
                tick: 0,
                last_ids: (u32::MAX, u32::MAX),
                last_new: now,
                last_emit: now,
                checked: Cell::new(now),
                alive: Cell::new(true),
            })
        }

        pub fn detect(&mut self, exes: &[String]) {
            self.gfx.copy(0, gr::SIZE, &mut self.gb);
            self.kind = detect(&self.gb, exes);
        }

        fn status(&self) -> i32 {
            self.gfx.u32_at(gr::STATUS) as i32
        }
    }

    impl Source for Kunos {
        fn kind(&self) -> SimKind {
            self.kind.unwrap_or(SimKind::Acc)
        }

        fn wait(&self, ms: u32) {
            std::thread::sleep(Duration::from_millis(ms.min(15) as u64));
        }

        fn connected(&self) -> bool {
            if self.kind.is_none() || self.status() == STATUS_OFF {
                return false;
            }
            // Oyun çökünce bellek son hâliyle kalır: veri uzun süre akmıyorsa süreç var mı bak
            if self.last_new.elapsed() > Duration::from_secs(10) && self.checked.get().elapsed() > Duration::from_secs(5) {
                self.checked.set(Instant::now());
                self.alive.set(shm::any_running(&["acc.exe", "ac2-win64-shipping.exe", "acs.exe", "acs_x86.exe"]));
            }
            self.alive.get() || self.last_new.elapsed() < Duration::from_secs(10)
        }

        fn session_update(&mut self) -> Option<SessionData> {
            let kind = self.kind?;
            self.stat.copy(0, stc::SIZE, &mut self.sb);
            self.gfx.copy(0, gr::SIZE, &mut self.gb);
            let key = [rd_i32(&self.gb, gr::SESSION), session_num(kind, &self.gb), rd_i32(&self.gb, gr::NUMBER_OF_LAPS)];
            if self.sig != 0 && key == self.seen.1 && self.sb == self.seen.0 {
                return None;
            }
            self.seen = (self.sb.clone(), key);
            self.phys.copy(0, ph::SIZE, &mut self.pb);
            let si = parse_static(&self.sb);
            let s = session_sig(kind, &self.gb, &si);
            if s == self.sig {
                return None;
            }
            self.sig = s;
            self.t0 = Instant::now();
            self.session = build_session(kind, &self.gb, &self.pb, &si);
            Some(self.session.clone())
        }

        fn read(&mut self, frame: &mut Frame) -> bool {
            let Some(kind) = self.kind else { return false };
            let ids = (self.phys.u32_at(ph::PACKET_ID), self.gfx.u32_at(gr::PACKET_ID));
            let now = Instant::now();
            if ids != self.last_ids {
                self.last_ids = ids;
                self.last_new = now;
            } else if now.duration_since(self.last_emit) < Duration::from_millis(500) {
                // Duraklatılmışken de ara ara kare ver (overlay'ler kaybolmasın)
                return false;
            }
            self.last_emit = now;
            for _ in 0..2 {
                self.phys.copy(0, ph::SIZE, &mut self.pb);
                if self.phys.u32_at(ph::PACKET_ID) == ids.0 {
                    break;
                }
            }
            self.gfx.copy(0, if kind == SimKind::Acc { gr::SIZE } else { gr::AC_SIZE }, &mut self.gb);
            self.tick = self.tick.wrapping_add(1);
            frame.tick = self.tick;
            frame.session_time = self.t0.elapsed().as_secs_f64();
            extract(kind, &self.pb, &self.gb, &self.session, &mut self.motion, frame);
            frame.hybrid = hybrid(kind, &self.pb, &self.sb);
            true
        }

        fn map_key(&self, s: &SessionData) -> String {
            map_key(self.kind(), s)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_i32(b: &mut [u8], o: usize, v: i32) {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn put_f32(b: &mut [u8], o: usize, v: f32) {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn put_w(b: &mut [u8], o: usize, s: &str) {
        for (i, c) in s.encode_utf16().enumerate() {
            b[o + i * 2..o + i * 2 + 2].copy_from_slice(&c.to_le_bytes());
        }
    }

    #[test]
    fn detects_layout() {
        let mut g = vec![0u8; gr::SIZE];
        assert_eq!(detect(&g, &[]), None);
        put_i32(&mut g, gr::STATUS, STATUS_LIVE);
        put_f32(&mut g, gr::AC_CAR_COORDINATES, -123.4);
        assert_eq!(detect(&g, &[]), Some(SimKind::Ac));
        put_i32(&mut g, gr::ACTIVE_CARS, 24);
        assert_eq!(detect(&g, &[]), Some(SimKind::Acc));
        assert_eq!(detect(&g, &["acs.exe".into()]), Some(SimKind::Ac));
    }

    #[test]
    fn parses_static() {
        let mut s = vec![0u8; stc::SIZE];
        put_w(&mut s, stc::SM_VERSION, "1.9");
        put_w(&mut s, stc::CAR_MODEL, "porsche_992_gt3_r");
        put_w(&mut s, stc::TRACK, "monza");
        put_w(&mut s, stc::PLAYER_NAME, "Erkin");
        put_w(&mut s, stc::PLAYER_SURNAME, "Azcan");
        put_i32(&mut s, stc::MAX_RPM, 9250);
        put_f32(&mut s, stc::MAX_FUEL, 120.0);
        put_f32(&mut s, stc::TRACK_SPLINE_LENGTH, 5793.0);
        let si = parse_static(&s);
        assert_eq!(si.car_model, "porsche_992_gt3_r");
        assert_eq!(si.track, "monza");
        assert_eq!(si.player, "Erkin Azcan");
        assert_eq!(si.max_rpm, 9250);
        assert_eq!(si.max_fuel, 120.0);
        let mut g = vec![0u8; gr::SIZE];
        put_i32(&mut g, gr::SESSION, 2);
        put_i32(&mut g, gr::NUMBER_OF_LAPS, 12);
        let sd = build_session(SimKind::Acc, &g, &[], &si);
        assert_eq!(sd.track_name, "Monza");
        assert!((sd.track_length_km - 5.793).abs() < 1e-4);
        assert!(sd.is_race(0));
        assert_eq!(sd.sessions[0].laps, Some(12));
        assert_eq!(sd.player().unwrap().name, "Erkin Azcan");
        assert_eq!(sd.player().unwrap().car_name, "Porsche 992 Gt3 R");
        assert_eq!(map_key(SimKind::Acc, &sd), "acc_monza_");
    }

    #[test]
    fn extracts_acc_frame() {
        let mut p = vec![0u8; ph::SIZE];
        let mut g = vec![0u8; gr::SIZE];
        put_f32(&mut p, ph::GAS, 0.75);
        put_f32(&mut p, ph::BRAKE, 0.25);
        put_f32(&mut p, ph::FUEL, 60.0);
        put_i32(&mut p, ph::GEAR, 4); // 3. vites
        put_i32(&mut p, ph::RPMS, 7000);
        put_f32(&mut p, ph::SPEED_KMH, 180.0);
        // kuzeye (-z) 50 m/s
        put_f32(&mut p, ph::VELOCITY + 8, -50.0);
        put_f32(&mut p, ph::TYRE_CORE_TEMP, 85.0);
        put_f32(&mut p, ph::WHEELS_PRESSURE + 4, 27.5);
        put_f32(&mut p, ph::AIR_TEMP, 22.0);
        put_i32(&mut p, ph::PIT_LIMITER_ON, 1);
        put_i32(&mut p, ph::ABS_IN_ACTION, 1);
        put_f32(&mut p, ph::TC_IN_ACTION, 1.0);
        put_i32(&mut g, gr::STATUS, STATUS_LIVE);
        put_i32(&mut g, gr::SESSION, 2);
        put_i32(&mut g, gr::COMPLETED_LAPS, 3);
        put_i32(&mut g, gr::POSITION, 5);
        put_i32(&mut g, gr::I_LAST_TIME, 105_432);
        put_i32(&mut g, gr::I_BEST_TIME, i32::MAX);
        put_f32(&mut g, gr::SESSION_TIME_LEFT, 600_000.0);
        put_f32(&mut g, gr::NORMALIZED_CAR_POSITION, 0.5);
        put_i32(&mut g, gr::ACTIVE_CARS, 3);
        put_i32(&mut g, gr::PLAYER_CAR_ID, 1001);
        let ids = [1001, 1002, 1003];
        // oyuncu (0,0), sağında 3 m bir araç (doğu = +x), 20 m önünde bir araç (kuzey = -z)
        let coords = [(0.0f32, 0.0f32), (3.0, 0.0), (0.0, -20.0)];
        for i in 0..3 {
            put_i32(&mut g, gr::CAR_ID + i * 4, ids[i]);
            put_f32(&mut g, gr::CAR_COORDINATES + i * 12, coords[i].0);
            put_f32(&mut g, gr::CAR_COORDINATES + i * 12 + 8, coords[i].1);
        }
        put_i32(&mut g, gr::CAR_ID, 1001);
        put_f32(&mut g, gr::CAR_COORDINATES, 0.001);
        put_i32(&mut g, gr::FLAG, 1);
        put_i32(&mut g, gr::TC, 3);
        put_i32(&mut g, gr::RAIN_INTENSITY, 2);
        put_i32(&mut g, gr::TRACK_GRIP_STATUS, 5);
        let si = StaticInfo { max_fuel: 120.0, track: "monza".into(), track_len_m: 5793.0, ..Default::default() };
        let sd = build_session(SimKind::Acc, &g, &p, &si);
        let mut f = Frame::default();
        let mut m = Motion::default();
        extract(SimKind::Acc, &p, &g, &sd, &mut m, &mut f);
        assert_eq!(f.gear, 3);
        assert!((f.speed - 50.0).abs() < 1e-3);
        assert_eq!(f.throttle, 0.75);
        assert_eq!(f.fuel_pct, 0.5);
        assert_eq!(f.lap, 4);
        assert_eq!(f.lap_last, 105.432);
        assert_eq!(f.lap_best, -1.0);
        assert_eq!(f.session_time_remain, 600.0);
        assert_eq!(f.cars[0].position, 5);
        assert_eq!(f.tire_temp[0], [85.0; 3]);
        assert!((f.tire_press[1] - 189.6).abs() < 0.1);
        assert!(f.abs_active);
        assert!(f.tc_active);
        assert_eq!(f.engine_warnings, EW_PIT_LIMITER);
        assert_eq!(f.session_flags & flags::BLUE, flags::BLUE);
        assert_eq!(f.tc, 3.0);
        assert_eq!(f.track_wetness, 6);
        assert!(f.yaw_north.abs() < 1e-4); // kuzeye gidiyor
        assert!(f.is_on_track);
        // Sağda araç var (3), önündeki araç radar listesinde
        assert_eq!(f.car_left_right, 3);
        let l = f.demo_side_cars.as_ref().unwrap();
        assert!(l.iter().any(|&(s, o)| s == 1 && o.abs() < 0.1));
        assert!(l.iter().any(|&(s, o)| s == 0 && (o - 20.0).abs() < 0.1));
    }

    #[test]
    fn extracts_ac_frame() {
        let mut p = vec![0u8; ph::SIZE];
        let mut g = vec![0u8; gr::AC_SIZE];
        put_i32(&mut g, gr::STATUS, STATUS_REPLAY);
        put_f32(&mut p, ph::CLUTCH, 1.0);
        put_f32(&mut p, ph::TYRE_TEMP_I, 90.0);
        put_f32(&mut p, ph::TYRE_TEMP_O, 70.0);
        put_f32(&mut p, ph::TYRE_TEMP_I + 4, 91.0);
        put_f32(&mut p, ph::TYRE_TEMP_O + 4, 71.0);
        put_f32(&mut p, ph::TYRE_WEAR, 98.0);
        put_f32(&mut p, ph::BRAKE_BIAS, 0.58);
        put_i32(&mut g, gr::AC_FLAG, 2);
        put_i32(&mut g, gr::AC_IS_IN_PIT_LANE, 1);
        let sd = build_session(SimKind::Ac, &g, &p, &StaticInfo::default());
        let mut f = Frame::default();
        extract(SimKind::Ac, &p, &g, &sd, &mut Motion::default(), &mut f);
        assert_eq!(f.clutch, 0.0);
        assert!(f.replay);
        assert_eq!(f.tire_temp[0][0], 70.0); // sol ön: dış taraf solda
        assert_eq!(f.tire_temp[1][0], 91.0); // sağ ön: iç taraf solda
        assert!((f.tire_wear[0][1] - 0.98).abs() < 1e-5);
        assert!((f.brake_bias - 58.0).abs() < 1e-3);
        assert_eq!(f.session_flags, flags::YELLOW);
        assert!(f.on_pit_road);
        assert_eq!(f.car_left_right, 0);
    }
}
