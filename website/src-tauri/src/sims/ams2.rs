#![cfg_attr(not(windows), allow(dead_code))]
//! Automobilista 2 / Project CARS 2: `$pcars2$` paylaşımlı belleği (SharedMemory.h, sürüm 9+).
//! Oyunda Ayarlar > Sistem > Paylaşımlı Bellek = "Project CARS 2" seçili olmalı.
//!
//! Varsayılan hizalama. Baş kısım (katılımcı listesi, oyuncu telemetrisi, hava) tüm
//! sürümlerde aynıdır. Sonradan eklenen katılımcı dizilerinin (araç adları, tur süreleri,
//! pit durumları) konumunu çalışırken doğruluyoruz: izlenen katılımcının `mCarNames` girdisi
//! baştaki `mCarName` ile aynı değilse bu diziler kullanılmaz.

use super::*;
use crate::model::{CarState, Driver, SessionEntry};

pub const MAX_PARTICIPANTS: usize = 64;

pub mod o {
    pub const VERSION: usize = 0;
    pub const GAME_STATE: usize = 8; // 2 oynuyor, 3 duraklatıldı, 4 menü (zaman akıyor), 6 tekrar
    pub const SESSION_STATE: usize = 12;
    pub const RACE_STATE: usize = 16;
    pub const VIEWED_PARTICIPANT: usize = 20;
    pub const NUM_PARTICIPANTS: usize = 24;
    pub const PARTICIPANTS: usize = 28;
    pub const P_SIZE: usize = 100;
    pub const P_IS_ACTIVE: usize = 0;
    pub const P_NAME: usize = 1; // char[64]
    pub const P_WORLD_POS: usize = 68; // float[3]
    pub const P_LAP_DISTANCE: usize = 80;
    pub const P_RACE_POSITION: usize = 84;
    pub const P_LAPS_COMPLETED: usize = 88;
    pub const P_CURRENT_LAP: usize = 92;
    pub const CAR_NAME: usize = 6444;
    pub const CAR_CLASS_NAME: usize = 6508;
    pub const LAPS_IN_EVENT: usize = 6572;
    pub const TRACK_LOCATION: usize = 6576;
    pub const TRACK_VARIATION: usize = 6640;
    pub const TRACK_LENGTH: usize = 6704;
    pub const BEST_LAP_TIME: usize = 6716;
    pub const LAST_LAP_TIME: usize = 6720;
    pub const CURRENT_TIME: usize = 6724;
    pub const EVENT_TIME_REMAINING: usize = 6740;
    pub const HIGHEST_FLAG_COLOUR: usize = 6800;
    pub const PIT_MODE: usize = 6808;
    pub const CAR_FLAGS: usize = 6816;
    pub const FUEL_LEVEL: usize = 6840; // 0..1
    pub const FUEL_CAPACITY: usize = 6844; // litre
    pub const SPEED: usize = 6848; // m/s
    pub const RPM: usize = 6852;
    pub const MAX_RPM: usize = 6856;
    pub const BRAKE: usize = 6860;
    pub const THROTTLE: usize = 6864;
    pub const CLUTCH: usize = 6868;
    pub const STEERING: usize = 6872;
    pub const GEAR: usize = 6876;
    pub const ANTI_LOCK_ACTIVE: usize = 6888;
    pub const WORLD_VELOCITY: usize = 6932;
    pub const TYRE_TEMP: usize = 7056; // float[4] °C
    pub const TYRE_WEAR: usize = 7088; // float[4] 0 = yeni
    pub const AMBIENT_TEMP: usize = 7244;
    pub const TRACK_TEMP: usize = 7248;
    pub const RAIN_DENSITY: usize = 7252;
    pub const WIND_SPEED: usize = 7256;
    pub const WIND_DIR_X: usize = 7260;
    pub const WIND_DIR_Y: usize = 7264;
    pub const SEQUENCE_NUMBER: usize = 7272;
    // Katılımcı dizileri (çalışırken doğrulanır)
    pub const FASTEST_LAP_TIMES: usize = 8896;
    pub const LAST_LAP_TIMES: usize = 9152;
    pub const LAPS_INVALIDATED: usize = 9408; // bool[64]
    pub const PIT_MODES: usize = 9728;
    pub const CAR_NAMES: usize = 11008; // char[64][64]
    pub const CAR_CLASS_NAMES: usize = 15104;
    /// Okuduğumuz en son alanın sonu
    pub const READ_LEN: usize = 19200;
}

const CAR_FLAG_SPEED_LIMITER: u32 = 8;

fn session_kind(s: u32) -> &'static str {
    match s {
        1 => "Practice",
        2 => "Test",
        3 => "Qualify",
        4 | 5 => "Race",
        6 => "Hotlap",
        _ => "",
    }
}

fn session_num(b: &[u8]) -> i32 {
    // Isınma turu (4) ve yarış (5) aynı oturum sayılır
    match rd_u32(b, o::SESSION_STATE) {
        4 => 5,
        s => s as i32,
    }
}

fn part(i: usize) -> usize {
    o::PARTICIPANTS + i * o::P_SIZE
}

pub fn viewed(b: &[u8]) -> Option<usize> {
    let v = rd_i32(b, o::VIEWED_PARTICIPANT);
    (0..MAX_PARTICIPANTS as i32).contains(&v).then_some(v as usize)
}

fn num(b: &[u8]) -> usize {
    rd_i32(b, o::NUM_PARTICIPANTS).clamp(0, MAX_PARTICIPANTS as i32) as usize
}

/// Sonradan eklenen katılımcı dizileri beklenen yerde mi?
pub fn tail_ok(b: &[u8]) -> bool {
    let Some(v) = viewed(b) else { return false };
    let head = rd_cstr(b, o::CAR_NAME, 64);
    !head.is_empty() && rd_cstr(b, o::CAR_NAMES + v * 64, 64) == head
}

pub fn connected_state(b: &[u8]) -> bool {
    matches!(rd_u32(b, o::GAME_STATE), 2..=6) && num(b) > 0
}

pub fn session_sig(b: &[u8]) -> u64 {
    let n = num(b);
    let names: Vec<String> = (0..n).map(|i| rd_cstr(b, part(i) + o::P_NAME, 64)).collect();
    let mut parts: Vec<&str> = names.iter().map(|s| s.as_str()).collect();
    let track = rd_cstr(b, o::TRACK_LOCATION, 64);
    let var = rd_cstr(b, o::TRACK_VARIATION, 64);
    let car = rd_cstr(b, o::CAR_NAME, 64);
    parts.push(&track);
    parts.push(&var);
    parts.push(&car);
    let mut nums: Vec<i64> =
        vec![session_num(b) as i64, rd_u32(b, o::LAPS_IN_EVENT) as i64, rd_i32(b, o::VIEWED_PARTICIPANT) as i64, tail_ok(b) as i64];
    nums.extend((0..n).map(|i| rd_u8(b, part(i) + o::P_IS_ACTIVE) as i64));
    sig(&parts, &nums)
}

pub fn build_session(b: &[u8]) -> SessionData {
    let mut sd = empty_session();
    let tail = tail_ok(b);
    sd.track_name = rd_cstr(b, o::TRACK_LOCATION, 64);
    sd.track_config = rd_cstr(b, o::TRACK_VARIATION, 64);
    sd.track_length_km = (rd_f32(b, o::TRACK_LENGTH) / 1000.0).max(0.0);
    sd.fuel_max_ltr = rd_f32(b, o::FUEL_CAPACITY).max(0.0);
    sd.redline = rd_f32(b, o::MAX_RPM).max(0.0);
    let me = viewed(b);
    sd.player_idx = me.map(|v| v as i32).unwrap_or(-1);
    for i in 0..num(b) {
        let p = part(i);
        if rd_u8(b, p + o::P_IS_ACTIVE) == 0 {
            continue;
        }
        let (car, class) = if tail {
            (rd_cstr(b, o::CAR_NAMES + i * 64, 64), rd_cstr(b, o::CAR_CLASS_NAMES + i * 64, 64))
        } else if Some(i) == me {
            (rd_cstr(b, o::CAR_NAME, 64), rd_cstr(b, o::CAR_CLASS_NAME, 64))
        } else {
            (String::new(), String::new())
        };
        let (class_id, class_color) = class_ident(&class);
        let name = rd_cstr(b, p + o::P_NAME, 64);
        sd.drivers[i] = Some(Driver {
            car_idx: i as i32,
            abbrev: name.clone(),
            name,
            class_id,
            class_name: class,
            class_color,
            car_path: car.clone(),
            car_name: car,
            ..Default::default()
        });
    }
    let kind = session_kind(rd_u32(b, o::SESSION_STATE));
    let laps = rd_u32(b, o::LAPS_IN_EVENT) as i32;
    sd.sessions.push(SessionEntry {
        num: session_num(b),
        kind: kind.to_string(),
        laps: if kind == "Race" && laps > 0 { Some(laps) } else { None },
        time: None,
    });
    sd
}

#[derive(Default)]
pub struct Motion {
    fwd: Option<(f32, f32)>,
    rel: Vec<(f32, f32)>,
}

pub fn extract(b: &[u8], sd: &SessionData, m: &mut Motion, f: &mut Frame) {
    let tail = tail_ok(b);
    let n = num(b);
    let me = viewed(b);
    let track_len = rd_f32(b, o::TRACK_LENGTH);
    let game = rd_u32(b, o::GAME_STATE);
    f.session_num = session_num(b);
    let race = sd.is_race(f.session_num);
    f.player_idx = me.map(|v| v as i32).unwrap_or(-1);

    for c in f.cars.iter_mut() {
        *c = CarState { surface: -1, pct: -1.0, tire: -1, lap: -1, lap_completed: -1, last: -1.0, best: -1.0, ..Default::default() };
    }
    for i in 0..n {
        let p = part(i);
        if rd_u8(b, p + o::P_IS_ACTIVE) == 0 || sd.driver(i).is_none() {
            continue;
        }
        let c = &mut f.cars[i];
        c.pct = if track_len > 0.0 { (rd_f32(b, p + o::P_LAP_DISTANCE) / track_len).clamp(0.0, 0.9999) } else { 0.0 };
        c.lap_completed = rd_u32(b, p + o::P_LAPS_COMPLETED) as i32;
        c.lap = rd_u32(b, p + o::P_CURRENT_LAP) as i32;
        c.position = rd_u32(b, p + o::P_RACE_POSITION) as i32;
        c.surface = 3;
        if tail {
            let pm = rd_u32(b, o::PIT_MODES + i * 4);
            c.on_pit = matches!(pm, 1..=3 | 5);
            c.surface = match pm {
                2 | 4 => 1,
                1 | 3 | 5 => 2,
                _ => 3,
            };
            let last = rd_f32(b, o::LAST_LAP_TIMES + i * 4);
            let best = rd_f32(b, o::FASTEST_LAP_TIMES + i * 4);
            c.last = if last > 0.0 { last } else { -1.0 };
            c.best = if best > 0.0 { best } else { -1.0 };
        }
    }

    // Oyuncu (izlenen katılımcı)
    f.lap_invalid = tail && me.map(|i| rd_u8(b, o::LAPS_INVALIDATED + i) != 0).unwrap_or(false);
    f.speed = rd_f32(b, o::SPEED);
    f.rpm = rd_f32(b, o::RPM);
    f.gear = rd_i32(b, o::GEAR);
    f.throttle = rd_f32(b, o::THROTTLE).clamp(0.0, 1.0);
    f.brake = rd_f32(b, o::BRAKE).clamp(0.0, 1.0);
    f.clutch = rd_f32(b, o::CLUTCH).clamp(0.0, 1.0);
    f.steer = steer_rad(rd_f32(b, o::STEERING), 0.0);
    f.abs_active = rd_u8(b, o::ANTI_LOCK_ACTIVE) != 0;
    let cap = rd_f32(b, o::FUEL_CAPACITY);
    f.fuel_pct = rd_f32(b, o::FUEL_LEVEL).clamp(0.0, 1.0);
    f.fuel_level = f.fuel_pct * cap.max(0.0);
    f.engine_warnings = if rd_u32(b, o::CAR_FLAGS) & CAR_FLAG_SPEED_LIMITER != 0 { EW_PIT_LIMITER } else { 0 };
    let pit = rd_u32(b, o::PIT_MODE);
    f.on_pit_road = matches!(pit, 1..=3 | 5);
    f.is_in_garage = pit == 4;
    f.replay = game == 6 || game == 7;
    f.is_on_track = matches!(game, 2 | 3) && pit != 4;
    let last = rd_f32(b, o::LAST_LAP_TIME);
    let best = rd_f32(b, o::BEST_LAP_TIME);
    f.lap_last = if last > 0.0 { last } else { -1.0 };
    f.lap_best = if best > 0.0 { best } else { -1.0 };
    f.lap_cur = rd_f32(b, o::CURRENT_TIME).max(0.0);
    f.delta_best = 0.0;
    f.delta_best_ok = false;
    if let Some(v) = me {
        let c = &mut f.cars[v];
        if c.pct >= 0.0 {
            c.last = f.lap_last;
            c.best = f.lap_best;
            c.on_pit = f.on_pit_road;
        }
        f.lap = c.lap.max(0);
        f.lap_completed = c.lap_completed.max(0);
        f.lap_dist_pct = c.pct.max(0.0);
    }
    let remain = rd_f32(b, o::EVENT_TIME_REMAINING);
    f.session_time_remain = if remain > 0.0 { remain as f64 } else { -1.0 };
    let laps = rd_u32(b, o::LAPS_IN_EVENT) as i32;
    let leader_laps = (0..n).find(|&i| f.cars[i].position == 1).map(|i| f.cars[i].lap_completed).unwrap_or(0);
    f.session_laps_remain = if race && laps > 0 { (laps - leader_laps).max(0) } else { 32767 };
    f.session_state = if !race {
        STATE_RACING
    } else {
        match rd_u32(b, o::RACE_STATE) {
            0 | 1 => STATE_PARADE,
            2 => STATE_RACING,
            _ => STATE_CHECKERED,
        }
    };
    f.session_flags = match rd_u32(b, o::HIGHEST_FLAG_COLOUR) {
        1 => flags::GREEN,
        2 => flags::BLUE,
        3 | 4 => flags::WHITE,
        5 => flags::RED,
        6 | 7 => flags::YELLOW,
        9 => flags::REPAIR,
        10 => flags::BLACK,
        11 => flags::CHECKERED,
        _ => 0,
    };
    f.air_temp = rd_f32(b, o::AMBIENT_TEMP);
    f.track_temp = rd_f32(b, o::TRACK_TEMP);
    let rain = rd_f32(b, o::RAIN_DENSITY).clamp(0.0, 1.0);
    f.precip = rain;
    f.track_wetness = 0;
    f.wind_vel = rd_f32(b, o::WIND_SPEED);
    f.wind_dir = rd_f32(b, o::WIND_DIR_X).atan2(rd_f32(b, o::WIND_DIR_Y));
    for c in 0..4 {
        f.tire_temp[c] = [rd_f32(b, o::TYRE_TEMP + c * 4); 3];
        let wear = rd_f32(b, o::TYRE_WEAR + c * 4);
        f.tire_wear[c] = [(1.0 - wear).clamp(0.0, 1.0); 3];
        f.tire_press[c] = 0.0;
    }

    // Hareket ve yan araçlar: dünya x (doğu), -z (kuzey)
    let vx = rd_f32(b, o::WORLD_VELOCITY);
    let vz = rd_f32(b, o::WORLD_VELOCITY + 8);
    motion(f, vx, -vz);
    let v = (vx * vx + vz * vz).sqrt();
    if v > 3.0 {
        m.fwd = Some((vx / v, -vz / v));
    }
    m.rel.clear();
    if let (Some(mi), Some((fe, fnn))) = (me, m.fwd) {
        let pos = |i: usize| (rd_f32(b, part(i) + o::P_WORLD_POS), rd_f32(b, part(i) + o::P_WORLD_POS + 8));
        let (mx, mz) = pos(mi);
        let (re, rn) = (fnn, -fe);
        for i in 0..n {
            if i == mi || rd_u8(b, part(i) + o::P_IS_ACTIVE) == 0 || f.cars[i].surface == 1 {
                continue;
            }
            let (x, z) = pos(i);
            let (de, dn) = (x - mx, -(z - mz));
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
pub use win::Ams2;

#[cfg(windows)]
mod win {
    use super::*;
    use crate::sims::shm::{self, Mapping};
    use std::cell::Cell;
    use std::time::{Duration, Instant};

    pub struct Ams2 {
        map: Mapping,
        b: Vec<u8>,
        session: SessionData,
        motion: Motion,
        sig: u64,
        last_sig_check: Instant,
        last_seq: u32,
        tick: i32,
        t0: Instant,
        last_new: Instant,
        last_emit: Instant,
        checked: Cell<Instant>,
        alive: Cell<bool>,
    }

    impl Ams2 {
        pub fn open() -> Option<Ams2> {
            let map = Mapping::open("$pcars2$")?;
            if map.len() < o::SEQUENCE_NUMBER + 4 {
                return None;
            }
            let now = Instant::now();
            Some(Ams2 {
                map,
                b: Vec::new(),
                session: SessionData::default(),
                motion: Motion::default(),
                sig: 0,
                last_sig_check: now - Duration::from_secs(10),
                last_seq: u32::MAX,
                tick: 0,
                t0: now,
                last_new: now,
                last_emit: now,
                checked: Cell::new(now),
                alive: Cell::new(true),
            })
        }

        /// Tutarlı kopya: sıra numarası tek ise yazılıyordur
        fn snapshot(&mut self) {
            for _ in 0..3 {
                let s0 = self.map.u32_at(o::SEQUENCE_NUMBER);
                self.map.copy(0, o::READ_LEN, &mut self.b);
                if s0 % 2 == 0 && self.map.u32_at(o::SEQUENCE_NUMBER) == s0 {
                    return;
                }
                std::thread::yield_now();
            }
        }
    }

    impl Source for Ams2 {
        fn kind(&self) -> SimKind {
            SimKind::Ams2
        }

        fn wait(&self, ms: u32) {
            std::thread::sleep(Duration::from_millis(ms.min(15) as u64));
        }

        fn connected(&self) -> bool {
            let gs = self.map.u32_at(o::GAME_STATE);
            let n = self.map.u32_at(o::NUM_PARTICIPANTS) as i32;
            if !(2..=6).contains(&gs) || n <= 0 {
                return false;
            }
            if self.last_new.elapsed() > Duration::from_secs(10) && self.checked.get().elapsed() > Duration::from_secs(5) {
                self.checked.set(Instant::now());
                self.alive.set(shm::any_running(&["ams2avx.exe", "ams2.exe", "pcars2avx.exe", "pcars2.exe"]));
            }
            self.alive.get() || self.last_new.elapsed() < Duration::from_secs(10)
        }

        fn session_update(&mut self) -> Option<SessionData> {
            // Katılımcı listesi seyrek değişir: iki kez/sn denetlemek yeter
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
            let seq = self.map.u32_at(o::SEQUENCE_NUMBER);
            let now = Instant::now();
            if seq != self.last_seq {
                self.last_seq = seq;
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
            map_key(SimKind::Ams2, s)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_u32(b: &mut [u8], off: usize, v: u32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn put_f32(b: &mut [u8], off: usize, v: f32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn put_s(b: &mut [u8], off: usize, s: &str) {
        b[off..off + s.len()].copy_from_slice(s.as_bytes());
    }

    fn sample(tail: bool) -> Vec<u8> {
        let mut b = vec![0u8; o::READ_LEN];
        put_u32(&mut b, o::VERSION, 13);
        put_u32(&mut b, o::GAME_STATE, 2);
        put_u32(&mut b, o::SESSION_STATE, 5);
        put_u32(&mut b, o::RACE_STATE, 2);
        put_u32(&mut b, o::VIEWED_PARTICIPANT, 1);
        put_u32(&mut b, o::NUM_PARTICIPANTS, 2);
        put_s(&mut b, o::TRACK_LOCATION, "Interlagos");
        put_s(&mut b, o::TRACK_VARIATION, "GP");
        put_f32(&mut b, o::TRACK_LENGTH, 4309.0);
        put_s(&mut b, o::CAR_NAME, "Formula Vee");
        put_s(&mut b, o::CAR_CLASS_NAME, "F-Vee");
        put_u32(&mut b, o::LAPS_IN_EVENT, 10);
        for (i, (name, dist, pos, x, z)) in
            [("Leader", 2154.5f32, 1u32, -2.5f32, -1.0f32), ("Erkin Azcan", 1000.0, 2, 0.0, 0.0)].iter().enumerate()
        {
            let p = part(i);
            b[p + o::P_IS_ACTIVE] = 1;
            put_s(&mut b, p + o::P_NAME, name);
            put_f32(&mut b, p + o::P_LAP_DISTANCE, *dist);
            put_u32(&mut b, p + o::P_RACE_POSITION, *pos);
            put_u32(&mut b, p + o::P_LAPS_COMPLETED, 4);
            put_u32(&mut b, p + o::P_CURRENT_LAP, 5);
            put_f32(&mut b, p + o::P_WORLD_POS, *x);
            put_f32(&mut b, p + o::P_WORLD_POS + 8, *z);
        }
        put_f32(&mut b, o::FUEL_LEVEL, 0.25);
        put_f32(&mut b, o::FUEL_CAPACITY, 40.0);
        put_f32(&mut b, o::SPEED, 30.0);
        put_f32(&mut b, o::RPM, 5000.0);
        put_f32(&mut b, o::MAX_RPM, 6500.0);
        b[o::GEAR..o::GEAR + 4].copy_from_slice(&(-1i32).to_le_bytes());
        put_f32(&mut b, o::LAST_LAP_TIME, 118.25);
        put_f32(&mut b, o::BEST_LAP_TIME, -1.0);
        put_u32(&mut b, o::HIGHEST_FLAG_COLOUR, 2);
        put_u32(&mut b, o::CAR_FLAGS, 8);
        put_f32(&mut b, o::TYRE_TEMP + 8, 70.0);
        put_f32(&mut b, o::TYRE_WEAR + 8, 0.25);
        put_f32(&mut b, o::AMBIENT_TEMP, 25.0);
        // kuzeye (-z) 30 m/s
        put_f32(&mut b, o::WORLD_VELOCITY + 8, -30.0);
        if tail {
            put_s(&mut b, o::CAR_NAMES + 64, "Formula Vee");
            put_s(&mut b, o::CAR_NAMES, "Formula Vee Fin");
            put_s(&mut b, o::CAR_CLASS_NAMES, "F-Vee");
            put_s(&mut b, o::CAR_CLASS_NAMES + 64, "F-Vee");
            put_f32(&mut b, o::FASTEST_LAP_TIMES, 115.5);
            put_u32(&mut b, o::PIT_MODES, 2);
        }
        b
    }

    #[test]
    fn parses_with_tail() {
        let b = sample(true);
        assert!(connected_state(&b));
        assert!(tail_ok(&b));
        let sd = build_session(&b);
        assert_eq!(sd.track_name, "Interlagos");
        assert_eq!(sd.player_idx, 1);
        assert!(sd.is_race(5));
        assert_eq!(sd.driver(0).unwrap().car_name, "Formula Vee Fin");
        assert_eq!(sd.driver(0).unwrap().class_name, "F-Vee");
        let mut f = Frame::default();
        extract(&b, &sd, &mut Motion::default(), &mut f);
        assert_eq!(f.player_idx, 1);
        assert_eq!(f.gear, -1);
        assert_eq!(f.fuel_level, 10.0);
        assert_eq!(f.lap, 5);
        assert!((f.lap_dist_pct - 1000.0 / 4309.0).abs() < 1e-6);
        assert!((f.cars[0].pct - 0.5).abs() < 1e-3);
        assert_eq!(f.cars[0].best, 115.5);
        assert!(f.cars[0].on_pit);
        assert_eq!(f.cars[1].last, 118.25);
        assert_eq!(f.lap_best, -1.0);
        assert_eq!(f.session_flags, flags::BLUE);
        assert_eq!(f.engine_warnings, EW_PIT_LIMITER);
        assert_eq!(f.session_laps_remain, 6);
        assert_eq!(f.tire_temp[2], [70.0; 3]);
        assert_eq!(f.tire_wear[2], [0.75; 3]);
        assert_eq!(f.session_state, STATE_RACING);
        // lider pitte (radar dışı); f2 = (0.5 - 0.232) * ref
        assert!(f.cars[1].f2 > 0.0);
        assert_eq!(f.cars[1].class_position, 2);
    }

    #[test]
    fn works_without_tail() {
        let b = sample(false);
        assert!(!tail_ok(&b));
        let sd = build_session(&b);
        assert_eq!(sd.driver(0).unwrap().car_name, "");
        assert_eq!(sd.player().unwrap().car_name, "Formula Vee");
        let mut f = Frame::default();
        extract(&b, &sd, &mut Motion::default(), &mut f);
        assert_eq!(f.cars[0].best, -1.0);
        assert!(!f.cars[0].on_pit);
        // Lider 2.5 m solda, 1 m önde (kuzey = -z): yan yana
        assert_eq!(f.car_left_right, 2);
    }
}
