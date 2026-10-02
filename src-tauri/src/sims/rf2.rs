#![cfg_attr(not(windows), allow(dead_code))]
//! rFactor 2 ve Le Mans Ultimate: "rF2 Shared Memory Map Plugin" (rFactor2SharedMemoryMapPlugin64.dll)
//! tamponları. LMU aynı eklentiyi ve aynı düzeni kullanır; eklentinin oyunun `Plugins`
//! klasörüne kopyalanıp `CustomPluginVariables.JSON` içinde etkinleştirilmesi gerekir.
//!
//! Tamponlar (`#pragma pack(4)`):
//!   `$rFactor2SMMP_Telemetry$`: { u32 versionBegin, u32 versionEnd, i32 bytesUpdatedHint,
//!                                  i32 numVehicles, rF2VehicleTelemetry[128] (1888 bayt) }
//!   `$rFactor2SMMP_Scoring$`:   { u32 versionBegin, u32 versionEnd, i32 bytesUpdatedHint,
//!                                  rF2ScoringInfo (548 bayt), rF2VehicleScoring[128] (584 bayt) }
//! Yazım sırasında versionBegin artırılır, bitince versionEnd; ikisi eşitse tampon tutarlıdır.
//! Dünya koordinatları sol elli, +y yukarı; araç yerel ekseninde +x sol, +z geri.

use super::*;
use crate::model::{tire_kind_from_name, CarState, Driver, SessionEntry};

pub const MAX_VEHICLES: usize = 128;

pub mod buf {
    pub const VERSION_BEGIN: usize = 0;
    pub const VERSION_END: usize = 4;
    pub const TELE_NUM_VEHICLES: usize = 12;
    pub const TELE_VEHICLES: usize = 16;
    pub const SCORING_INFO: usize = 12;
    pub const SCORING_VEHICLES: usize = 12 + super::si::SIZE;
}

/// rF2VehicleTelemetry
pub mod tv {
    pub const ID: usize = 0;
    pub const ELAPSED_TIME: usize = 12;
    pub const LAP_START_ET: usize = 24;
    pub const POS: usize = 160;
    pub const LOCAL_VEL: usize = 184;
    pub const ORI: usize = 232; // 3 satır x 3 double
    pub const GEAR: usize = 352;
    pub const ENGINE_RPM: usize = 356;
    pub const UNF_THROTTLE: usize = 388;
    pub const UNF_BRAKE: usize = 396;
    pub const UNF_STEERING: usize = 404;
    pub const UNF_CLUTCH: usize = 412;
    pub const FUEL: usize = 524;
    pub const ENGINE_MAX_RPM: usize = 532;
    pub const SPEED_LIMITER: usize = 604;
    pub const FRONT_TIRE_COMPOUND_INDEX: usize = 606;
    pub const FUEL_CAPACITY: usize = 608;
    pub const FRONT_TIRE_COMPOUND_NAME: usize = 620; // char[18]
    pub const REAR_BRAKE_BIAS: usize = 664;
    pub const REAR_FLAP_ACTIVATED: usize = 617;
    /// 0 yasak, 1 algılandı ama henüz izinli değil, 2 izinli
    pub const REAR_FLAP_LEGAL_STATUS: usize = 618;
    pub const PHYSICAL_STEERING_WHEEL_RANGE: usize = 692;
    pub const BATTERY_CHARGE_FRACTION: usize = 696; // 0..1
    pub const ELECTRIC_BOOST_MOTOR_TORQUE: usize = 704; // Nm (rejenerasyonda negatif)
    pub const ELECTRIC_BOOST_MOTOR_RPM: usize = 712;
    /// 0 yok, 1 beklemede, 2 itiş, 3 rejenerasyon
    pub const ELECTRIC_BOOST_MOTOR_STATE: usize = 736;
    pub const WHEELS: usize = 848;
    pub const WHEEL_SIZE: usize = 260;
    pub const W_PRESSURE: usize = 120; // kPa
    pub const W_TEMPERATURE: usize = 128; // double[3] Kelvin, sol/orta/sağ
    pub const W_WEAR: usize = 152; // 1 = yeni
    pub const SIZE: usize = 1888;
}

/// rF2ScoringInfo
pub mod si {
    pub const TRACK_NAME: usize = 0;
    pub const SESSION: usize = 64;
    pub const CURRENT_ET: usize = 68;
    pub const END_ET: usize = 76;
    pub const MAX_LAPS: usize = 84;
    pub const LAP_DIST: usize = 88;
    pub const NUM_VEHICLES: usize = 104;
    pub const GAME_PHASE: usize = 108;
    pub const YELLOW_FLAG_STATE: usize = 109;
    pub const SECTOR_FLAG: usize = 110;
    pub const IN_REALTIME: usize = 115;
    pub const PLAYER_NAME: usize = 116;
    pub const RAINING: usize = 220;
    pub const AMBIENT_TEMP: usize = 228;
    pub const TRACK_TEMP: usize = 236;
    pub const WIND: usize = 244;
    pub const AVG_PATH_WETNESS: usize = 332;
    pub const SIZE: usize = 548;
}

/// rF2VehicleScoring
pub mod vs {
    pub const ID: usize = 0;
    pub const DRIVER_NAME: usize = 4;
    pub const VEHICLE_NAME: usize = 36;
    pub const TOTAL_LAPS: usize = 100;
    pub const FINISH_STATUS: usize = 103;
    pub const LAP_DIST: usize = 104;
    pub const BEST_LAP_TIME: usize = 144;
    pub const LAST_LAP_TIME: usize = 168;
    pub const IS_PLAYER: usize = 196;
    pub const CONTROL: usize = 197;
    pub const IN_PITS: usize = 198;
    pub const PLACE: usize = 199;
    pub const VEHICLE_CLASS: usize = 200;
    pub const TIME_BEHIND_LEADER: usize = 244;
    pub const POS: usize = 264;
    pub const LOCAL_VEL: usize = 288;
    pub const ORI: usize = 336;
    pub const PIT_STATE: usize = 457;
    pub const ESTIMATED_LAP_TIME: usize = 472;
    pub const FLAG: usize = 504;
    /// 0 tur ve süre sayılmaz, 1 tur sayılır ama süre sayılmaz, 2 ikisi de sayılır
    pub const COUNT_LAP_FLAG: usize = 506;
    pub const IN_GARAGE_STALL: usize = 507;
    pub const SIZE: usize = 584;
}

#[derive(Debug, Clone, Default)]
pub struct Veh {
    pub id: i32,
    pub driver: String,
    pub vehicle: String,
    pub class: String,
    pub total_laps: i32,
    pub lap_dist: f64,
    pub best: f64,
    pub last: f64,
    pub is_player: bool,
    pub control: i8,
    pub in_pits: bool,
    pub place: i32,
    pub behind_leader: f64,
    pub pos: [f64; 3],
    pub speed: f64,
    pub pit_state: u8,
    pub est_lap: f64,
    pub flag: u8,
    pub count_lap_flag: u8,
    pub in_garage: bool,
    pub finish_status: i8,
}

#[derive(Debug, Clone, Default)]
pub struct Scoring {
    pub track: String,
    pub session: i32,
    pub current_et: f64,
    pub end_et: f64,
    pub max_laps: i32,
    pub lap_dist: f64,
    pub game_phase: u8,
    pub yellow_state: i8,
    pub sector_flags: [i8; 3],
    pub in_realtime: bool,
    pub raining: f64,
    pub ambient: f64,
    pub track_temp: f64,
    pub wind: [f64; 3],
    pub wetness: f64,
    pub vehicles: Vec<Veh>,
}

fn len3(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

/// Skorlama tamponunu (sürüm bloğu dahil) ayrıştırır
pub fn parse_scoring(b: &[u8]) -> Scoring {
    let i = buf::SCORING_INFO;
    let n = (rd_i32(b, i + si::NUM_VEHICLES).clamp(0, MAX_VEHICLES as i32)) as usize;
    let mut sc = Scoring {
        track: rd_cstr(b, i + si::TRACK_NAME, 64),
        session: rd_i32(b, i + si::SESSION),
        current_et: rd_f64(b, i + si::CURRENT_ET),
        end_et: rd_f64(b, i + si::END_ET),
        max_laps: rd_i32(b, i + si::MAX_LAPS),
        lap_dist: rd_f64(b, i + si::LAP_DIST),
        game_phase: rd_u8(b, i + si::GAME_PHASE),
        yellow_state: rd_u8(b, i + si::YELLOW_FLAG_STATE) as i8,
        sector_flags: [
            rd_u8(b, i + si::SECTOR_FLAG) as i8,
            rd_u8(b, i + si::SECTOR_FLAG + 1) as i8,
            rd_u8(b, i + si::SECTOR_FLAG + 2) as i8,
        ],
        in_realtime: rd_u8(b, i + si::IN_REALTIME) != 0,
        raining: rd_f64(b, i + si::RAINING),
        ambient: rd_f64(b, i + si::AMBIENT_TEMP),
        track_temp: rd_f64(b, i + si::TRACK_TEMP),
        wind: rd_vec3(b, i + si::WIND),
        wetness: rd_f64(b, i + si::AVG_PATH_WETNESS),
        vehicles: Vec::with_capacity(n),
    };
    for k in 0..n {
        let o = buf::SCORING_VEHICLES + k * vs::SIZE;
        if o + vs::SIZE > b.len() {
            break;
        }
        sc.vehicles.push(Veh {
            id: rd_i32(b, o + vs::ID),
            driver: rd_cstr(b, o + vs::DRIVER_NAME, 32),
            vehicle: rd_cstr(b, o + vs::VEHICLE_NAME, 64),
            class: rd_cstr(b, o + vs::VEHICLE_CLASS, 32),
            total_laps: rd_i16(b, o + vs::TOTAL_LAPS) as i32,
            lap_dist: rd_f64(b, o + vs::LAP_DIST),
            best: rd_f64(b, o + vs::BEST_LAP_TIME),
            last: rd_f64(b, o + vs::LAST_LAP_TIME),
            is_player: rd_u8(b, o + vs::IS_PLAYER) != 0,
            control: rd_u8(b, o + vs::CONTROL) as i8,
            in_pits: rd_u8(b, o + vs::IN_PITS) != 0,
            place: rd_u8(b, o + vs::PLACE) as i32,
            behind_leader: rd_f64(b, o + vs::TIME_BEHIND_LEADER),
            pos: rd_vec3(b, o + vs::POS),
            speed: len3(rd_vec3(b, o + vs::LOCAL_VEL)),
            pit_state: rd_u8(b, o + vs::PIT_STATE),
            est_lap: rd_f64(b, o + vs::ESTIMATED_LAP_TIME),
            flag: rd_u8(b, o + vs::FLAG),
            count_lap_flag: rd_u8(b, o + vs::COUNT_LAP_FLAG),
            in_garage: rd_u8(b, o + vs::IN_GARAGE_STALL) != 0,
            finish_status: rd_u8(b, o + vs::FINISH_STATUS) as i8,
        });
    }
    sc
}

/// Telemetri tamponunda `id`'li aracın başlangıç konumu
pub fn tele_find(b: &[u8], id: i32) -> Option<usize> {
    let n = (rd_i32(b, buf::TELE_NUM_VEHICLES).clamp(0, MAX_VEHICLES as i32)) as usize;
    (0..n)
        .map(|k| buf::TELE_VEHICLES + k * tv::SIZE)
        .take_while(|o| o + tv::SIZE <= b.len())
        .find(|&o| rd_i32(b, o + tv::ID) == id)
}

fn ori(b: &[u8], off: usize) -> [[f64; 3]; 3] {
    [rd_vec3(b, off), rd_vec3(b, off + 24), rd_vec3(b, off + 48)]
}

fn session_kind(s: i32) -> &'static str {
    match s {
        0 => "Test",
        1..=4 => "Practice",
        5..=8 => "Qualify",
        9 => "Warmup",
        10..=13 => "Race",
        _ => "",
    }
}

/// "#6 Porsche Penske" / "Porsche 963 #6" -> "6"
fn car_number(name: &str) -> String {
    let Some(i) = name.find('#') else { return String::new() };
    name[i + 1..].chars().take_while(|c| c.is_ascii_digit()).collect()
}

pub fn session_sig(sc: &Scoring) -> u64 {
    let mut nums: Vec<i64> = vec![sc.session as i64, sc.max_laps as i64];
    let mut parts: Vec<&str> = vec![&sc.track];
    for v in &sc.vehicles {
        nums.push(v.id as i64);
        nums.push(v.is_player as i64);
        parts.push(&v.driver);
        parts.push(&v.vehicle);
        parts.push(&v.class);
    }
    sig(&parts, &nums)
}

/// Skorlamadan oturum/sürücü listesi. `slots` araç kimliklerini 0..64 indekslerine eşler.
pub fn build_session(sc: &Scoring, tele: &[u8], slots: &mut Slots) -> SessionData {
    let mut sd = empty_session();
    sd.track_name = sc.track.clone();
    sd.track_length_km = (sc.lap_dist / 1000.0).max(0.0) as f32;
    let seen: Vec<i64> = sc.vehicles.iter().map(|v| v.id as i64).collect();
    slots.retain(&seen);
    for v in &sc.vehicles {
        let Some(idx) = slots.get(v.id as i64) else { continue };
        let (class_id, class_color) = class_ident(&v.class);
        let d = Driver {
            car_idx: idx as i32,
            name: v.driver.clone(),
            abbrev: v.driver.clone(),
            car_number: car_number(&v.vehicle),
            class_id,
            class_name: v.class.clone(),
            class_color,
            car_name: v.vehicle.clone(),
            car_path: v.vehicle.clone(),
            team_name: v.vehicle.clone(),
            // mControl: 0 yerel oyuncu, 1 yerel yapay zekâ, 2 uzak (çevrimiçi), 3 tekrar
            is_ai: !v.is_player && v.control == 1,
            ..Default::default()
        };
        if v.is_player {
            sd.player_idx = idx as i32;
            sd.est_lap_time = v.est_lap.max(0.0) as f32;
            if let Some(o) = tele_find(tele, v.id) {
                sd.fuel_max_ltr = rd_f64(tele, o + tv::FUEL_CAPACITY).max(0.0) as f32;
                sd.redline = rd_f64(tele, o + tv::ENGINE_MAX_RPM).max(0.0) as f32;
            }
        }
        sd.drivers[idx] = Some(d);
    }
    let kind = session_kind(sc.session);
    sd.sessions.push(SessionEntry {
        num: sc.session,
        kind: kind.to_string(),
        laps: if kind == "Race" && sc.max_laps > 0 && sc.max_laps < 10_000 { Some(sc.max_laps) } else { None },
        time: if sc.end_et > 0.0 { Some(sc.end_et) } else { None },
    });
    sd
}

#[derive(Default)]
pub struct Motion {
    rel: Vec<(f32, f32)>,
}

/// Skorlama (5 Hz) + telemetri (karede bir) -> `Frame`. Araç indeksleri `sd`'deki sürücülerle eşleşir.
pub fn extract(sc: &Scoring, tele: &[u8], sd: &SessionData, slots: &mut Slots, m: &mut Motion, f: &mut Frame) {
    let len = sc.lap_dist.max(1.0);
    let me = sc.vehicles.iter().find(|v| v.is_player);
    let me_t = me.and_then(|v| tele_find(tele, v.id));
    let now = me_t.map(|o| rd_f64(tele, o + tv::ELAPSED_TIME)).filter(|t| *t > 0.0).unwrap_or(sc.current_et);
    // Skorlama 5 Hz: konumları telemetri zamanına göre ileri taşı
    let dt = (now - sc.current_et).clamp(0.0, 0.5);

    f.session_time = now;
    f.session_num = sc.session;
    let race = session_kind(sc.session) == "Race";
    f.session_time_remain = if sc.end_et > 0.0 { (sc.end_et - now).max(0.0) } else { -1.0 };
    let leader_laps = sc.vehicles.iter().find(|v| v.place == 1).map(|v| v.total_laps).unwrap_or(0);
    f.session_laps_remain =
        if race && sc.max_laps > 0 && sc.max_laps < 10_000 { (sc.max_laps - leader_laps).max(0) } else { 32767 };
    f.session_state = match sc.game_phase {
        0 => 1,
        1 | 2 => 2,
        3 | 4 => STATE_PARADE,
        8 => STATE_CHECKERED,
        _ => STATE_RACING,
    };
    let mut bits = match sc.game_phase {
        5 => flags::GREEN,
        6 => flags::CAUTION | flags::YELLOW,
        7 => flags::RED,
        8 => flags::CHECKERED,
        _ => 0,
    };
    if sc.sector_flags.iter().any(|&x| x == 1) {
        bits |= flags::YELLOW;
    }
    if me.map(|v| v.flag == 6).unwrap_or(false) {
        bits |= flags::BLUE;
    }
    f.session_flags = bits;
    f.air_temp = sc.ambient as f32;
    f.track_temp = sc.track_temp as f32;
    f.precip = sc.raining.clamp(0.0, 1.0) as f32;
    f.track_wetness = wetness_from_frac(sc.wetness as f32);
    // Rüzgâr: dünya x (doğu), z (kuzey)
    f.wind_vel = (sc.wind[0].powi(2) + sc.wind[2].powi(2)).sqrt() as f32;
    f.wind_dir = sc.wind[0].atan2(sc.wind[2]) as f32;
    f.replay = me.map(|v| v.control == 3).unwrap_or(false);
    // Yeşil bayrakta, pistteyken "süre sayılmaz" işareti: tur geçersiz (pist sınırı vb.)
    f.lap_invalid = sc.game_phase == 5 && me.map(|v| v.count_lap_flag < 2 && !v.in_pits && !v.in_garage).unwrap_or(false);

    // Araçlar
    for c in f.cars.iter_mut() {
        *c = CarState { surface: -1, pct: -1.0, tire: -1, lap: -1, lap_completed: -1, last: -1.0, best: -1.0, ..Default::default() };
    }
    f.player_idx = -1;
    for v in &sc.vehicles {
        let Some(idx) = slots.get(v.id as i64) else { continue };
        if sd.driver(idx).is_none() {
            continue;
        }
        let to = tele_find(tele, v.id);
        let speed = to.map(|o| len3(rd_vec3(tele, o + tv::LOCAL_VEL))).unwrap_or(v.speed);
        // Ön lastik hamuru (adıyla; "Soft", "Wet"...) ve indeksi
        let (tire, tire_kind) = to
            .map(|o| (rd_u8(tele, o + tv::FRONT_TIRE_COMPOUND_INDEX) as i32, tire_kind_from_name(&rd_cstr(tele, o + tv::FRONT_TIRE_COMPOUND_NAME, 18))))
            .unwrap_or((-1, 0));
        let mut pct = ((v.lap_dist + speed * dt) / len) as f32;
        let mut laps = v.total_laps;
        if pct >= 1.0 {
            pct -= 1.0;
            laps += 1;
        }
        let c = &mut f.cars[idx];
        c.pct = pct.clamp(0.0, 0.9999);
        c.lap_completed = laps.max(0);
        c.lap = laps.max(0) + 1;
        c.position = v.place;
        c.on_pit = v.in_pits;
        c.last = if v.last > 0.0 { v.last as f32 } else { -1.0 };
        c.best = if v.best > 0.0 { v.best as f32 } else { -1.0 };
        c.surface = if v.in_garage || v.pit_state == 3 {
            1
        } else if v.in_pits {
            2
        } else {
            3
        };
        c.tire = tire;
        c.tire_kind = tire_kind;
        c.f2 = if race { v.behind_leader.max(0.0) as f32 } else { 0.0 };
        c.flags = if v.flag == 6 { flags::BLUE } else { 0 } | if v.finish_status == 3 { flags::DQ } else { 0 };
        if v.is_player {
            f.player_idx = idx as i32;
        }
    }

    // Oyuncu
    let Some(v) = me.filter(|_| f.player_idx >= 0) else {
        f.is_on_track = false;
        f.car_left_right = 0;
        f.demo_side_cars = None;
        fill_estimates(f, sd, false, true);
        return;
    };
    let pi = f.player_idx.max(0) as usize;
    let pc = f.cars[pi];
    f.lap = pc.lap.max(0);
    f.lap_completed = pc.lap_completed.max(0);
    f.lap_dist_pct = pc.pct.max(0.0);
    f.lap_last = pc.last;
    f.lap_best = pc.best;
    f.on_pit_road = v.in_pits;
    f.is_in_garage = v.in_garage;
    f.is_on_track = !v.in_garage && v.control >= 0;
    f.delta_best = 0.0;
    f.delta_best_ok = false;

    if let Some(o) = me_t {
        f.speed = len3(rd_vec3(tele, o + tv::LOCAL_VEL)) as f32;
        f.rpm = rd_f64(tele, o + tv::ENGINE_RPM) as f32;
        f.gear = rd_i32(tele, o + tv::GEAR);
        f.throttle = rd_f64(tele, o + tv::UNF_THROTTLE).clamp(0.0, 1.0) as f32;
        f.brake = rd_f64(tele, o + tv::UNF_BRAKE).clamp(0.0, 1.0) as f32;
        f.clutch = rd_f64(tele, o + tv::UNF_CLUTCH).clamp(0.0, 1.0) as f32;
        let range = rd_f32(tele, o + tv::PHYSICAL_STEERING_WHEEL_RANGE);
        f.steer = steer_rad(rd_f64(tele, o + tv::UNF_STEERING) as f32, range);
        f.fuel_level = rd_f64(tele, o + tv::FUEL).max(0.0) as f32;
        let cap = rd_f64(tele, o + tv::FUEL_CAPACITY) as f32;
        f.fuel_pct = if cap > 0.0 { (f.fuel_level / cap).clamp(0.0, 1.0) } else { 0.0 };
        f.lap_cur = (now - rd_f64(tele, o + tv::LAP_START_ET)).max(0.0) as f32;
        f.engine_warnings = if rd_u8(tele, o + tv::SPEED_LIMITER) != 0 { EW_PIT_LIMITER } else { 0 };
        let rear = rd_f64(tele, o + tv::REAR_BRAKE_BIAS);
        f.brake_bias = if rear > 0.0 && rear < 1.0 { ((1.0 - rear) * 100.0) as f32 } else { -1.0 };
        // Hibrit: elektrik motoru durumu 0 ise araçta sistem yok
        let ms = rd_u8(tele, o + tv::ELECTRIC_BOOST_MOTOR_STATE);
        let mut hy = crate::model::Hybrid::default();
        if (1..=3).contains(&ms) {
            hy.has = true;
            hy.battery_pct = rd_f64(tele, o + tv::BATTERY_CHARGE_FRACTION).clamp(0.0, 1.0) as f32;
            // Güç = tork x açısal hız; yön motor durumundan (itiş +, rejenerasyon -)
            let kw = (rd_f64(tele, o + tv::ELECTRIC_BOOST_MOTOR_TORQUE)
                * rd_f64(tele, o + tv::ELECTRIC_BOOST_MOTOR_RPM)
                * std::f64::consts::TAU
                / 60.0
                / 1000.0)
                .abs() as f32;
            hy.mguk_ok = true;
            hy.mguk_kw = match ms {
                2 => kw,
                3 => -kw,
                _ => 0.0,
            };
        }
        let legal = rd_u8(tele, o + tv::REAR_FLAP_LEGAL_STATUS);
        if rd_u8(tele, o + tv::REAR_FLAP_ACTIVATED) != 0 {
            hy.drs = 3;
        } else if legal == 2 {
            hy.drs = 2;
        } else if legal == 1 {
            hy.drs = 1;
        }
        f.hybrid = hy;
        for c in 0..4 {
            let w = o + tv::WHEELS + c * tv::WHEEL_SIZE;
            for k in 0..3 {
                let t = rd_f64(tele, w + tv::W_TEMPERATURE + k * 8);
                f.tire_temp[c][k] = if t > 0.0 { (t - 273.15) as f32 } else { 0.0 };
            }
            let wear = rd_f64(tele, w + tv::W_WEAR) as f32;
            f.tire_wear[c] = if wear > 0.0 { [wear.clamp(0.0, 1.0); 3] } else { [-1.0; 3] };
            f.tire_press[c] = rd_f64(tele, w + tv::W_PRESSURE) as f32;
        }
        // Dünya hızı = Ori * yerel hız; üstten bakış: doğu = x, kuzey = z (sol elli sistem)
        let r = ori(tele, o + tv::ORI);
        let lv = rd_vec3(tele, o + tv::LOCAL_VEL);
        let wx = r[0][0] * lv[0] + r[0][1] * lv[1] + r[0][2] * lv[2];
        let wz = r[2][0] * lv[0] + r[2][1] * lv[1] + r[2][2] * lv[2];
        motion(f, wx as f32, wz as f32);

        // Yan araçlar: yerel +x sol, +z geri eksenlerinin dünyadaki karşılığı Ori'nin sütunları
        let my = rd_vec3(tele, o + tv::POS);
        let left = [r[0][0], r[1][0], r[2][0]];
        let back = [r[0][2], r[1][2], r[2][2]];
        m.rel.clear();
        for ov in &sc.vehicles {
            if ov.id == v.id || ov.in_garage {
                continue;
            }
            let p = tele_find(tele, ov.id).map(|x| rd_vec3(tele, x + tv::POS)).unwrap_or(ov.pos);
            let d = [p[0] - my[0], p[1] - my[1], p[2] - my[2]];
            let lat_left = d[0] * left[0] + d[1] * left[1] + d[2] * left[2];
            let back_d = d[0] * back[0] + d[1] * back[1] + d[2] * back[2];
            m.rel.push((-lat_left as f32, -back_d as f32));
        }
        fill_radar(f, &m.rel, f.is_on_track && !f.replay && !f.is_in_garage);
    } else {
        f.speed = v.speed as f32;
        f.car_left_right = 0;
        f.demo_side_cars = None;
    }
    fill_estimates(f, sd, false, true);
}

// ---------------------------------------------------------------------------
// Windows: canlı kaynak
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub use win::Rf2;

#[cfg(windows)]
mod win {
    use super::*;
    use crate::sims::shm::{self, Mapping};
    use std::cell::Cell;
    use std::time::{Duration, Instant};

    pub struct Rf2 {
        tele: Mapping,
        scor: Mapping,
        kind: SimKind,
        tb: Vec<u8>,
        sb: Vec<u8>,
        scoring: Scoring,
        session: SessionData,
        slots: Slots,
        motion: Motion,
        sig: u64,
        sig_ver: u32,
        last_tele: u32,
        last_scor: u32,
        tick: i32,
        last_new: Instant,
        checked: Cell<Instant>,
        alive: Cell<bool>,
    }

    /// Sürüm bloğuyla tutarlı bir kopya alır
    fn read_consistent(m: &Mapping, len: usize, dst: &mut Vec<u8>) -> bool {
        for _ in 0..3 {
            m.copy(0, len, dst);
            let b = rd_u32(dst, buf::VERSION_BEGIN);
            let e = rd_u32(dst, buf::VERSION_END);
            if b == e && m.u32_at(buf::VERSION_BEGIN) == b {
                return true;
            }
            std::thread::yield_now();
        }
        false
    }

    impl Rf2 {
        pub fn open() -> Option<Rf2> {
            let scor = Mapping::open("$rFactor2SMMP_Scoring$")?;
            let tele = Mapping::open("$rFactor2SMMP_Telemetry$")?;
            let kind = SimKind::Rf2;
            let now = Instant::now();
            let mut s = Rf2 {
                tele,
                scor,
                kind,
                tb: Vec::new(),
                sb: Vec::new(),
                scoring: Scoring::default(),
                session: SessionData::default(),
                slots: Slots::default(),
                motion: Motion::default(),
                sig: 0,
                sig_ver: u32::MAX,
                last_tele: u32::MAX,
                last_scor: u32::MAX,
                tick: 0,
                last_new: now,
                checked: Cell::new(now),
                alive: Cell::new(true),
            };
            s.refresh_scoring();
            Some(s)
        }

        /// Oyunu exe adından ayırt eder (aynı eklenti/bellek); tercih uymuyorsa false
        pub fn detect(&mut self, exes: &[String], pref: SimPref) -> bool {
            let has = |n: &str| exes.iter().any(|e| e == n);
            self.kind = if has("le mans ultimate.exe") {
                SimKind::Lmu
            } else if has("rfactor2.exe") {
                SimKind::Rf2
            } else if pref == SimPref::Only(SimKind::Lmu) {
                SimKind::Lmu
            } else {
                SimKind::Rf2
            };
            pref.accepts(self.kind)
        }

        /// Skorlama değiştiyse yeniden okur
        fn refresh_scoring(&mut self) -> bool {
            let ver = self.scor.u32_at(buf::VERSION_END);
            if ver == self.last_scor {
                return false;
            }
            let n = (self.scor.u32_at(buf::SCORING_INFO + si::NUM_VEHICLES) as usize).min(MAX_VEHICLES);
            if !read_consistent(&self.scor, buf::SCORING_VEHICLES + n * vs::SIZE, &mut self.sb) {
                return false;
            }
            self.last_scor = ver;
            self.scoring = parse_scoring(&self.sb);
            true
        }

        fn refresh_tele(&mut self) -> bool {
            let ver = self.tele.u32_at(buf::VERSION_END);
            if ver == self.last_tele {
                return false;
            }
            let n = (self.tele.u32_at(buf::TELE_NUM_VEHICLES) as usize).min(MAX_VEHICLES);
            if !read_consistent(&self.tele, buf::TELE_VEHICLES + n * tv::SIZE, &mut self.tb) {
                return false;
            }
            self.last_tele = ver;
            true
        }
    }

    impl Source for Rf2 {
        fn kind(&self) -> SimKind {
            self.kind
        }

        fn wait(&self, ms: u32) {
            std::thread::sleep(Duration::from_millis(ms.min(10) as u64));
        }

        fn connected(&self) -> bool {
            if self.scor.u32_at(buf::SCORING_INFO + si::NUM_VEHICLES) == 0 {
                return false;
            }
            if self.last_new.elapsed() > Duration::from_secs(10) && self.checked.get().elapsed() > Duration::from_secs(5) {
                self.checked.set(Instant::now());
                self.alive.set(shm::any_running(&["le mans ultimate.exe", "rfactor2.exe"]));
            }
            self.alive.get() || self.last_new.elapsed() < Duration::from_secs(10)
        }

        fn session_update(&mut self) -> Option<SessionData> {
            self.refresh_scoring();
            if self.last_scor == self.sig_ver {
                return None;
            }
            self.sig_ver = self.last_scor;
            let s = session_sig(&self.scoring);
            if s == self.sig {
                return None;
            }
            self.refresh_tele();
            self.sig = s;
            self.session = build_session(&self.scoring, &self.tb, &mut self.slots);
            Some(self.session.clone())
        }

        fn read(&mut self, frame: &mut Frame) -> bool {
            let sc = self.refresh_scoring();
            let te = self.refresh_tele();
            if !sc && !te {
                return false;
            }
            self.last_new = Instant::now();
            self.tick = self.tick.wrapping_add(1);
            frame.tick = self.tick;
            extract(&self.scoring, &self.tb, &self.session, &mut self.slots, &mut self.motion, frame);
            true
        }

        fn map_key(&self, s: &SessionData) -> String {
            map_key(self.kind, s)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_i32(b: &mut [u8], o: usize, v: i32) {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn put_f64(b: &mut [u8], o: usize, v: f64) {
        b[o..o + 8].copy_from_slice(&v.to_le_bytes());
    }
    fn put_s(b: &mut [u8], o: usize, s: &str) {
        b[o..o + s.len()].copy_from_slice(s.as_bytes());
    }
    fn put_v3(b: &mut [u8], o: usize, v: [f64; 3]) {
        for k in 0..3 {
            put_f64(b, o + k * 8, v[k]);
        }
    }

    /// İki araçlı yapay skorlama + telemetri tamponu
    fn sample() -> (Vec<u8>, Vec<u8>) {
        let mut s = vec![0u8; buf::SCORING_VEHICLES + 2 * vs::SIZE];
        let i = buf::SCORING_INFO;
        put_s(&mut s, i + si::TRACK_NAME, "Circuit de la Sarthe");
        put_i32(&mut s, i + si::SESSION, 10);
        put_f64(&mut s, i + si::CURRENT_ET, 100.0);
        put_f64(&mut s, i + si::END_ET, 3700.0);
        put_i32(&mut s, i + si::MAX_LAPS, i32::MAX);
        put_f64(&mut s, i + si::LAP_DIST, 13626.0);
        put_i32(&mut s, i + si::NUM_VEHICLES, 2);
        s[i + si::GAME_PHASE] = 5;
        put_f64(&mut s, i + si::AMBIENT_TEMP, 21.5);
        put_f64(&mut s, i + si::AVG_PATH_WETNESS, 0.5);
        // araç 0: rakip (id 17), araç 1: oyuncu (id 3)
        let v0 = buf::SCORING_VEHICLES;
        let v1 = v0 + vs::SIZE;
        put_i32(&mut s, v0 + vs::ID, 17);
        put_s(&mut s, v0 + vs::DRIVER_NAME, "Rival");
        put_s(&mut s, v0 + vs::VEHICLE_NAME, "#50 Ferrari 499P");
        put_s(&mut s, v0 + vs::VEHICLE_CLASS, "Hypercar");
        s[v0 + vs::TOTAL_LAPS..v0 + vs::TOTAL_LAPS + 2].copy_from_slice(&3i16.to_le_bytes());
        put_f64(&mut s, v0 + vs::LAP_DIST, 6813.0);
        s[v0 + vs::PLACE] = 1;
        s[v0 + vs::FLAG] = 6;
        put_i32(&mut s, v1 + vs::ID, 3);
        put_s(&mut s, v1 + vs::DRIVER_NAME, "Erkin Azcan");
        put_s(&mut s, v1 + vs::VEHICLE_NAME, "Porsche 963 #6");
        put_s(&mut s, v1 + vs::VEHICLE_CLASS, "Hypercar");
        s[v1 + vs::TOTAL_LAPS..v1 + vs::TOTAL_LAPS + 2].copy_from_slice(&2i16.to_le_bytes());
        put_f64(&mut s, v1 + vs::LAP_DIST, 1000.0);
        put_f64(&mut s, v1 + vs::LAST_LAP_TIME, 210.5);
        put_f64(&mut s, v1 + vs::TIME_BEHIND_LEADER, 55.0);
        s[v1 + vs::IS_PLAYER] = 1;
        s[v1 + vs::PLACE] = 2;
        s[v1 + vs::IN_PITS] = 0;

        let mut t = vec![0u8; buf::TELE_VEHICLES + 2 * tv::SIZE];
        put_i32(&mut t, buf::TELE_NUM_VEHICLES, 2);
        let t0 = buf::TELE_VEHICLES;
        let t1 = t0 + tv::SIZE;
        put_i32(&mut t, t0 + tv::ID, 17);
        // rakip oyuncunun 3 m solunda (+x yerel sol = dünya +x, kimlik yönelimi)
        put_v3(&mut t, t0 + tv::POS, [3.0, 0.0, 0.5]);
        put_i32(&mut t, t1 + tv::ID, 3);
        put_f64(&mut t, t1 + tv::ELAPSED_TIME, 100.2);
        put_f64(&mut t, t1 + tv::LAP_START_ET, 60.0);
        // kimlik yönelimi: ileri = -z; yerel hız z = -50 (ileri 50 m/s)
        put_v3(&mut t, t1 + tv::ORI, [1.0, 0.0, 0.0]);
        put_v3(&mut t, t1 + tv::ORI + 24, [0.0, 1.0, 0.0]);
        put_v3(&mut t, t1 + tv::ORI + 48, [0.0, 0.0, 1.0]);
        put_v3(&mut t, t1 + tv::LOCAL_VEL, [0.0, 0.0, -50.0]);
        put_i32(&mut t, t1 + tv::GEAR, 5);
        put_f64(&mut t, t1 + tv::ENGINE_RPM, 8000.0);
        put_f64(&mut t, t1 + tv::UNF_THROTTLE, 1.0);
        put_f64(&mut t, t1 + tv::UNF_STEERING, 0.5);
        t[t1 + tv::PHYSICAL_STEERING_WHEEL_RANGE..t1 + tv::PHYSICAL_STEERING_WHEEL_RANGE + 4]
            .copy_from_slice(&360.0f32.to_le_bytes());
        put_f64(&mut t, t1 + tv::FUEL, 45.0);
        put_f64(&mut t, t1 + tv::FUEL_CAPACITY, 90.0);
        put_f64(&mut t, t1 + tv::ENGINE_MAX_RPM, 9000.0);
        put_f64(&mut t, t1 + tv::REAR_BRAKE_BIAS, 0.45);
        let w = t1 + tv::WHEELS + tv::WHEEL_SIZE; // sağ ön
        put_f64(&mut t, w + tv::W_PRESSURE, 170.0);
        put_v3(&mut t, w + tv::W_TEMPERATURE, [353.15, 363.15, 373.15]);
        put_f64(&mut t, w + tv::W_WEAR, 0.9);
        (s, t)
    }

    #[test]
    fn parses_scoring_and_session() {
        let (s, t) = sample();
        let sc = parse_scoring(&s);
        assert_eq!(sc.track, "Circuit de la Sarthe");
        assert_eq!(sc.vehicles.len(), 2);
        assert_eq!(sc.vehicles[1].driver, "Erkin Azcan");
        assert!(sc.vehicles[1].is_player);
        assert_eq!(sc.vehicles[0].total_laps, 3);
        assert_eq!(tele_find(&t, 3), Some(buf::TELE_VEHICLES + tv::SIZE));
        let mut slots = Slots::default();
        let sd = build_session(&sc, &t, &mut slots);
        assert_eq!(sd.player_idx, 1);
        assert!(sd.is_race(10));
        assert_eq!(sd.fuel_max_ltr, 90.0);
        assert_eq!(sd.redline, 9000.0);
        let me = sd.player().unwrap();
        assert_eq!(me.car_number, "6");
        assert_eq!(sd.driver(0).unwrap().car_number, "50");
        assert_eq!(sd.class_count(), 1);
        assert!((sd.track_length_km - 13.626).abs() < 1e-3);
    }

    #[test]
    fn extracts_frame() {
        let (s, t) = sample();
        let sc = parse_scoring(&s);
        let mut slots = Slots::default();
        let sd = build_session(&sc, &t, &mut slots);
        let mut f = Frame::default();
        extract(&sc, &t, &sd, &mut slots, &mut Motion::default(), &mut f);
        assert_eq!(f.player_idx, 1);
        assert_eq!(f.gear, 5);
        assert_eq!(f.rpm, 8000.0);
        assert!((f.speed - 50.0).abs() < 1e-3);
        assert_eq!(f.fuel_pct, 0.5);
        assert!((f.steer + 90f32.to_radians()).abs() < 1e-4); // sağa yarım tur = -90°
        assert!((f.brake_bias - 55.0).abs() < 1e-3);
        assert!((f.tire_temp[1][0] - 80.0).abs() < 1e-3 && (f.tire_temp[1][2] - 100.0).abs() < 1e-3);
        assert!((f.tire_wear[1][1] - 0.9).abs() < 1e-6);
        assert_eq!(f.tire_press[1], 170.0);
        assert_eq!(f.lap, 3);
        assert_eq!(f.lap_last, 210.5);
        assert!((f.lap_cur - 40.2).abs() < 1e-3);
        assert!((f.session_time_remain - 3599.8).abs() < 1e-6);
        assert_eq!(f.session_state, STATE_RACING);
        assert_eq!(f.session_flags & flags::GREEN, flags::GREEN);
        assert_eq!(f.track_wetness, 5);
        // 0.2 s ileri taşındı: 1000 + 50*0.2 = 1010 m
        assert!((f.lap_dist_pct - 1010.0 / 13626.0).abs() < 1e-5);
        assert_eq!(f.cars[0].position, 1);
        assert_eq!(f.cars[0].flags & flags::BLUE, flags::BLUE);
        assert_eq!(f.cars[1].f2, 55.0);
        assert_eq!(f.cars[1].class_position, 2);
        // kuzeye (+z) değil: ileri -z => yön güney (π)
        assert!((f.yaw_north.abs() - std::f32::consts::PI).abs() < 1e-4);
        // Rakip yerel +x (sol) tarafında 3 m
        assert_eq!(f.car_left_right, 2);
    }
}
