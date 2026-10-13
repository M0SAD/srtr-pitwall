#![cfg_attr(not(windows), allow(dead_code))]
//! Sadece oyuncunun aracını veren UDP simleri: Forza (Motorsport 7 / 2023, Horizon 4 / 5), Codemasters
//! "extradata" biçimi (DiRT Rally 2.0, DiRT Rally, DiRT 4, GRID) ve BeamNG.drive (OutGauge).
//!
//! Bu oyunlar rakip verisi göndermez: lider tablosu / relative / radar çalışmaz; pedallar, vites, devir, hız,
//! yakıt, lastikler, G, tur süreleri (oyun veriyorsa) ve pist haritası (tur mesafesi biliniyorsa) çalışır.
//!
//! Ortak kaynak `SoloSource<T>`: UDP kuyruğundan kendi paketlerini alır, her pakette bir kare üretir.

use super::udp::{self, Proto};
use super::*;
use crate::model::{Driver, SessionEntry};
use std::time::{Duration, Instant};

/// Tek araçlı bir UDP oyununun ayrıştırıcısı
pub trait Solo: Default {
    const PROTO: Proto;
    const KIND: SimKind;
    /// Bir paketi işler; yeni kare üretilecekse true
    fn feed(&mut self, b: &[u8]) -> bool;
    fn ready(&self) -> bool;
    /// Oturum imzası (araç / pist değişimi)
    fn sig(&self) -> u64;
    fn session(&self) -> SessionData;
    fn extract(&mut self, sd: &SessionData, f: &mut Frame);
}

pub struct SoloSource<T: Solo> {
    p: T,
    session: SessionData,
    sig: u64,
    fresh: bool,
    tick: i32,
    t0: Instant,
    buf: Vec<Vec<u8>>,
}

impl<T: Solo> SoloSource<T> {
    pub fn open() -> Option<SoloSource<T>> {
        if !udp::active(T::PROTO, Duration::from_secs(2)) {
            return None;
        }
        Some(SoloSource { p: T::default(), session: SessionData::default(), sig: 0, fresh: false, tick: 0, t0: Instant::now(), buf: Vec::new() })
    }

    fn pump(&mut self) {
        self.buf.clear();
        udp::drain(T::PROTO, &mut self.buf);
        for b in self.buf.iter() {
            if self.p.feed(b) {
                self.fresh = true;
            }
        }
    }
}

impl<T: Solo> Source for SoloSource<T> {
    fn kind(&self) -> SimKind {
        T::KIND
    }

    fn wait(&self, ms: u32) {
        std::thread::sleep(Duration::from_millis(ms.min(10) as u64));
    }

    fn connected(&self) -> bool {
        udp::active(T::PROTO, Duration::from_secs(3))
    }

    fn session_update(&mut self) -> Option<SessionData> {
        self.pump();
        if !self.p.ready() {
            return None;
        }
        let s = self.p.sig();
        if s == self.sig {
            return None;
        }
        self.sig = s;
        self.t0 = Instant::now();
        self.session = self.p.session();
        Some(self.session.clone())
    }

    fn read(&mut self, frame: &mut Frame) -> bool {
        self.pump();
        if !self.fresh || !self.p.ready() {
            return false;
        }
        self.fresh = false;
        let side = frame.demo_side_cars.take();
        *frame = Frame { demo_side_cars: side, ..Frame::default() };
        self.tick = self.tick.wrapping_add(1);
        frame.tick = self.tick;
        frame.session_time = self.t0.elapsed().as_secs_f64();
        frame.player_idx = 0;
        self.p.extract(&self.session, frame);
        // Rakip yok: oyuncu aracının tablo satırı
        let c = &mut frame.cars[0];
        c.lap = frame.lap;
        c.lap_completed = frame.lap_completed;
        c.pct = frame.lap_dist_pct;
        c.on_pit = frame.on_pit_road;
        c.last = frame.lap_last;
        c.best = frame.lap_best;
        c.surface = if frame.on_pit_road { 2 } else { 3 };
        if c.position <= 0 {
            c.position = 1;
        }
        c.class_position = c.position;
        frame.car_left_right = 0;
        fill_estimates(frame, &self.session, false, false);
        true
    }

    fn map_key(&self, s: &SessionData) -> String {
        map_key(T::KIND, s)
    }
}

fn solo_session(track: String, track_len_m: f32, car: String, class: String, kind: &str, laps: i32) -> SessionData {
    let mut sd = empty_session();
    sd.track_name = track;
    sd.track_length_km = (track_len_m / 1000.0).max(0.0);
    sd.player_idx = 0;
    let (class_id, class_color) = class_ident(&class);
    sd.drivers[0] = Some(Driver {
        car_idx: 0,
        name: String::new(),
        car_name: car.clone(),
        car_path: car,
        class_id,
        class_name: class,
        class_color,
        ..Default::default()
    });
    sd.sessions.push(SessionEntry {
        num: 1,
        kind: kind.to_string(),
        laps: if kind == "Race" && laps > 0 { Some(laps) } else { None },
        ..Default::default()
    });
    sd
}

/// Tur mesafesi vermeyen oyunlar (Forza) için: toplam yol ve tur sayısından tur uzunluğu ve konum
#[derive(Default)]
struct LapTrack {
    lap: i32,
    start: f32,
    /// `start` gerçekten bir tur başlangıcında mı alındı (ilk görüldüğü an tur ortası olabilir)
    start_ok: bool,
    seen: bool,
    len: f32,
}

impl LapTrack {
    fn update(&mut self, lap: i32, dist: f32) -> f32 {
        if !self.seen || lap != self.lap {
            if self.seen && lap == self.lap + 1 && self.start_ok {
                let l = dist - self.start;
                if l > 300.0 {
                    self.len = l;
                }
            }
            self.start_ok = self.seen && lap == self.lap + 1;
            self.seen = true;
            self.lap = lap;
            self.start = dist;
        }
        if self.len > 0.0 {
            ((dist - self.start) / self.len).clamp(0.0, 0.9999)
        } else {
            0.0
        }
    }
}

// ---------------------------------------------------------------------------
// Forza "Data Out"
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Forza {
    b: Vec<u8>,
    track: LapTrack,
    best: f32,
}

impl Forza {
    /// Dash bölümünün başlangıcı (yoksa None: sadece "Sled")
    fn dash(&self) -> Option<usize> {
        match self.b.len() {
            311 | 331 => Some(232),
            324 => Some(244),
            _ => None,
        }
    }
    fn horizon(&self) -> bool {
        self.b.len() == 324
    }
    fn track_ordinal(&self) -> i32 {
        if self.b.len() == 331 {
            rd_i32(&self.b, 327)
        } else {
            -1
        }
    }
}

const FORZA_CLASS: [&str; 8] = ["D", "C", "B", "A", "S1", "S2", "X", "P"];

impl Solo for Forza {
    const PROTO: Proto = Proto::Forza;
    const KIND: SimKind = SimKind::Forza;

    fn feed(&mut self, b: &[u8]) -> bool {
        self.b.clear();
        self.b.extend_from_slice(b);
        true
    }

    fn ready(&self) -> bool {
        !self.b.is_empty()
    }

    fn sig(&self) -> u64 {
        sig(&[], &[rd_i32(&self.b, 212) as i64, self.track_ordinal() as i64, self.horizon() as i64, (self.track.len / 10.0) as i64])
    }

    fn session(&self) -> SessionData {
        let b = &self.b;
        let class = FORZA_CLASS.get(rd_i32(b, 216).clamp(0, 7) as usize).copied().unwrap_or("");
        let pi = rd_i32(b, 220);
        let class_name = if pi > 0 { format!("{class} {pi}") } else { class.to_string() };
        let ord = self.track_ordinal();
        let track = if ord > 0 { format!("Track {ord}") } else { String::new() };
        let race = self.dash().map(|d| rd_u8(b, d + 70) > 0).unwrap_or(false);
        let mut sd = solo_session(track, self.track.len, format!("Car {}", rd_i32(b, 212)), class_name, if race { "Race" } else { "Practice" }, 0);
        sd.redline = rd_f32(b, 8).max(0.0);
        sd.track_id = ord;
        sd
    }

    fn extract(&mut self, _sd: &SessionData, f: &mut Frame) {
        let b = &self.b;
        let on = rd_i32(b, 0) != 0;
        f.rpm = rd_f32(b, 16).max(0.0);
        // Yerel ivme: X sağ, Z ileri (m/s²)
        f.lat_g = rd_f32(b, 20) / 9.80665;
        f.long_g = rd_f32(b, 28) / 9.80665;
        f.yaw_north = rd_f32(b, 56);
        f.vel_x = rd_f32(b, 40);
        f.vel_y = 0.0;
        f.is_on_track = on;
        f.session_state = STATE_RACING;
        // Pist dışı: teker kenar şeridinde değil ama su birikintisinde vb. bilinmez; kullanılmıyor
        let Some(d) = self.dash() else {
            f.speed = (rd_f32(b, 32).powi(2) + rd_f32(b, 40).powi(2)).sqrt();
            return;
        };
        f.speed = rd_f32(b, d + 12).max(0.0);
        for (i, w) in [0usize, 1, 2, 3].iter().enumerate() {
            let tf = rd_f32(b, d + 24 + w * 4);
            f.tire_temp[i] = [(tf - 32.0) / 1.8; 3];
        }
        f.fuel_pct = rd_f32(b, d + 44).clamp(0.0, 1.0);
        f.fuel_level = f.fuel_pct * 100.0;
        let best = rd_f32(b, d + 52);
        let last = rd_f32(b, d + 56);
        f.lap_cur = rd_f32(b, d + 60).max(0.0);
        let lap = rd_i16(b, d + 68) as u16 as i32;
        f.lap_completed = lap;
        f.lap = lap + 1;
        f.lap_last = if last > 0.0 { last } else { -1.0 };
        if best > 0.0 {
            self.best = best;
        }
        f.lap_best = if self.best > 0.0 { self.best } else { -1.0 };
        let pos = rd_u8(b, d + 70) as i32;
        f.cars[0].position = pos;
        f.throttle = rd_u8(b, d + 71) as f32 / 255.0;
        f.brake = rd_u8(b, d + 72) as f32 / 255.0;
        f.clutch = rd_u8(b, d + 73) as f32 / 255.0;
        let g = rd_u8(b, d + 75) as i32;
        f.gear = match g {
            0 => -1,
            11.. => 0,
            n => n,
        };
        f.steer = steer_rad(rd_u8(b, d + 76) as i8 as f32 / 127.0, 540.0);
        let dist = rd_f32(b, d + 48);
        f.lap_dist_pct = self.track.update(lap, dist);
        if b.len() == 331 {
            for i in 0..4 {
                let w = rd_f32(b, 311 + i * 4);
                f.tire_wear[i] = [(1.0 - w).clamp(0.0, 1.0); 3];
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Codemasters "extradata = 3": DiRT Rally 2.0 / DiRT Rally / DiRT 4 / GRID
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Dirt {
    v: Vec<f32>,
    best: f32,
    last_lap: i32,
}

impl Dirt {
    fn g(&self, i: usize) -> f32 {
        self.v.get(i).copied().filter(|x| x.is_finite()).unwrap_or(0.0)
    }
}

impl Solo for Dirt {
    const PROTO: Proto = Proto::Dirt;
    const KIND: SimKind = SimKind::Dirt;

    fn feed(&mut self, b: &[u8]) -> bool {
        self.v.clear();
        self.v.extend((0..b.len() / 4).map(|i| rd_f32(b, i * 4)));
        let lap = self.g(36) as i32;
        let last = self.g(62);
        if lap != self.last_lap {
            if last > 0.0 && (self.best <= 0.0 || last < self.best) && lap > self.last_lap {
                self.best = last;
            }
            if lap < self.last_lap {
                self.best = 0.0;
            }
            self.last_lap = lap;
        }
        true
    }

    fn ready(&self) -> bool {
        self.v.len() >= 64
    }

    fn sig(&self) -> u64 {
        sig(&[], &[self.g(61).round() as i64, self.g(60) as i64, self.g(63).round() as i64, self.g(65) as i64])
    }

    fn session(&self) -> SessionData {
        let len = self.g(61);
        let track = if len > 0.0 { format!("Track {:.2} km", len / 1000.0) } else { String::new() };
        let laps = self.g(60) as i32;
        let mut sd = solo_session(track, len, String::new(), String::new(), if laps > 1 { "Race" } else { "Practice" }, laps);
        sd.redline = self.g(63) * 10.0;
        sd.fuel_max_ltr = self.g(46).max(0.0);
        sd
    }

    fn extract(&mut self, sd: &SessionData, f: &mut Frame) {
        f.speed = self.g(7).max(0.0);
        f.throttle = self.g(29).clamp(0.0, 1.0);
        f.steer = steer_rad(self.g(30), 540.0);
        f.brake = self.g(31).clamp(0.0, 1.0);
        f.clutch = self.g(32).clamp(0.0, 1.0);
        let gear = self.g(33).round() as i32;
        let max_gears = self.g(65) as i32;
        f.gear = if gear < 0 || (gear == 10 && max_gears < 10) { -1 } else { gear };
        f.lat_g = self.g(34);
        f.long_g = self.g(35);
        f.rpm = (self.g(37) * 10.0).max(0.0);
        f.fuel_level = self.g(45).max(0.0);
        f.fuel_pct = if sd.fuel_max_ltr > 0.0 { (f.fuel_level / sd.fuel_max_ltr).clamp(0.0, 1.0) } else { 0.0 };
        f.on_pit_road = self.g(47) > 0.5;
        f.abs_setting = self.g(44);
        f.tc = self.g(43);
        let len = self.g(61);
        let mut d = self.g(2);
        if len > 0.0 && d < 0.0 {
            d += len;
        }
        f.lap_dist_pct = if len > 0.0 { (d / len).clamp(0.0, 0.9999) } else { 0.0 };
        let lap = self.g(36) as i32;
        f.lap_completed = lap.max(0);
        f.lap = f.lap_completed + 1;
        f.lap_cur = self.g(1).max(0.0);
        let last = self.g(62);
        f.lap_last = if last > 0.0 { last } else { -1.0 };
        f.lap_best = if self.best > 0.0 { self.best } else { -1.0 };
        let laps = self.g(60) as i32;
        f.session_laps_remain = if laps > 1 { (laps - f.lap_completed).max(0) } else { 32767 };
        f.cars[0].position = self.g(39) as i32;
        f.cars[0].sector = (self.g(48) as i32).clamp(-1, 200) as u8 + 2;
        // Lastikler RL, RR, FL, FR -> LF, RF, LR, RR
        for (src, dst) in [2usize, 3, 0, 1].iter().enumerate() {
            f.tire_press[*dst] = self.g(55 + src) * 6.894_757;
        }
        f.is_on_track = f.speed > 0.0 || f.rpm > 0.0;
        f.session_state = STATE_RACING;
        motion(f, self.g(8), self.g(10));
    }
}

// ---------------------------------------------------------------------------
// BeamNG.drive: OutGauge (Seçenekler › Diğer › OutGauge, IP 127.0.0.1, port 4444)
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct BeamNg {
    b: Vec<u8>,
}

impl Solo for BeamNg {
    const PROTO: Proto = Proto::BeamNg;
    const KIND: SimKind = SimKind::BeamNg;

    fn feed(&mut self, b: &[u8]) -> bool {
        self.b.clear();
        self.b.extend_from_slice(b);
        true
    }

    fn ready(&self) -> bool {
        self.b.len() >= 92
    }

    fn sig(&self) -> u64 {
        let car = rd_cstr(&self.b, 4, 4);
        sig(&[&car], &[])
    }

    fn session(&self) -> SessionData {
        solo_session(String::new(), 0.0, String::new(), String::new(), "Practice", 0)
    }

    fn extract(&mut self, _sd: &SessionData, f: &mut Frame) {
        let b = &self.b;
        let gear = rd_u8(b, 10) as i8 as i32;
        f.gear = gear - 1;
        f.speed = rd_f32(b, 12).max(0.0);
        f.rpm = rd_f32(b, 16).max(0.0);
        let et = rd_f32(b, 24);
        f.water_temp = if et > 0.0 { et } else { -1.0 };
        f.fuel_pct = rd_f32(b, 28).clamp(0.0, 1.0);
        f.fuel_level = f.fuel_pct * 100.0;
        let ot = rd_f32(b, 36);
        f.oil_temp = if ot > 0.0 { ot } else { -1.0 };
        let lights = rd_u32(b, 44);
        if lights & 8 != 0 {
            f.engine_warnings |= EW_PIT_LIMITER;
        }
        f.tc_active = lights & 16 != 0;
        f.abs_active = lights & 1024 != 0;
        f.throttle = rd_f32(b, 48).clamp(0.0, 1.0);
        f.brake = rd_f32(b, 52).clamp(0.0, 1.0);
        f.clutch = rd_f32(b, 56).clamp(0.0, 1.0);
        f.is_on_track = true;
        f.session_state = STATE_RACING;
        f.lap = 1;
    }
}

pub type ForzaSource = SoloSource<Forza>;
pub type DirtSource = SoloSource<Dirt>;
pub type BeamNgSource = SoloSource<BeamNg>;

#[cfg(test)]
mod tests {
    use super::*;

    fn pf(b: &mut [u8], o: usize, v: f32) {
        b[o..o + 4].copy_from_slice(&v.to_le_bytes());
    }

    #[test]
    fn forza_horizon_dash() {
        let mut b = vec![0u8; 324];
        b[0] = 1;
        pf(&mut b, 8, 8000.0);
        pf(&mut b, 16, 5500.0);
        pf(&mut b, 20, 9.80665);
        b[212] = 42;
        b[216] = 4;
        b[220..224].copy_from_slice(&800i32.to_le_bytes());
        let d = 244;
        pf(&mut b, d + 12, 50.0);
        pf(&mut b, d + 24, 212.0);
        pf(&mut b, d + 44, 0.5);
        pf(&mut b, d + 56, 95.5);
        b[d + 68] = 2;
        b[d + 70] = 3;
        b[d + 71] = 255;
        b[d + 75] = 0;
        b[d + 76] = (-127i8) as u8;
        let mut p = Forza::default();
        assert_eq!(udp::classify(&b), Some(Proto::Forza));
        p.feed(&b);
        let sd = p.session();
        assert_eq!(sd.driver(0).unwrap().class_name, "S1 800");
        assert_eq!(sd.redline, 8000.0);
        assert_eq!(sd.track_name, "");
        let mut f = Frame::default();
        p.extract(&sd, &mut f);
        assert_eq!(f.speed, 50.0);
        assert_eq!(f.tire_temp[0], [100.0; 3]);
        assert_eq!(f.gear, -1);
        assert_eq!(f.throttle, 1.0);
        assert_eq!(f.lap, 3);
        assert_eq!(f.lap_last, 95.5);
        assert_eq!(f.cars[0].position, 3);
        assert!((f.lat_g - 1.0).abs() < 1e-6);
        assert!(f.steer > 0.0);
    }

    #[test]
    fn forza_lap_length_from_distance() {
        let mut t = LapTrack::default();
        assert_eq!(t.update(1, 100.0), 0.0);
        t.update(1, 2000.0);
        // İlk görülen tur ortadan başladı: uzunluk bilinmiyor
        assert_eq!(t.update(2, 4100.0), 0.0);
        assert_eq!(t.update(3, 8100.0), 0.0);
        assert!((t.update(3, 9100.0) - 0.25).abs() < 1e-6);
    }

    #[test]
    fn dirt_extradata() {
        let mut b = vec![0u8; 264];
        let put = |b: &mut Vec<u8>, i: usize, v: f32| pf(b, i * 4, v);
        put(&mut b, 1, 33.0);
        put(&mut b, 2, 1250.0);
        put(&mut b, 7, 40.0);
        put(&mut b, 29, 0.5);
        put(&mut b, 33, 3.0);
        put(&mut b, 36, 1.0);
        put(&mut b, 37, 650.0);
        put(&mut b, 39, 2.0);
        put(&mut b, 45, 20.0);
        put(&mut b, 46, 60.0);
        put(&mut b, 57, 30.0); // FL basınç
        put(&mut b, 60, 3.0);
        put(&mut b, 61, 5000.0);
        put(&mut b, 62, 98.25);
        put(&mut b, 63, 800.0);
        put(&mut b, 65, 6.0);
        let mut p = Dirt::default();
        assert_eq!(udp::classify(&b), Some(Proto::Dirt));
        p.feed(&b);
        let sd = p.session();
        assert_eq!(sd.track_name, "Track 5.00 km");
        assert!(sd.is_race(1));
        assert_eq!(sd.redline, 8000.0);
        let mut f = Frame::default();
        p.extract(&sd, &mut f);
        assert_eq!(f.rpm, 6500.0);
        assert_eq!(f.gear, 3);
        assert!((f.lap_dist_pct - 0.25).abs() < 1e-6);
        assert_eq!(f.lap, 2);
        assert_eq!(f.lap_last, 98.25);
        assert_eq!(f.lap_best, 98.25);
        assert_eq!(f.session_laps_remain, 2);
        assert!((f.fuel_pct - 1.0 / 3.0).abs() < 1e-6);
        assert!((f.tire_press[0] - 30.0 * 6.894_757).abs() < 1e-3);
        put(&mut b, 33, 10.0);
        p.feed(&b);
        p.extract(&sd, &mut f);
        assert_eq!(f.gear, -1);
    }

    #[test]
    fn beamng_outgauge() {
        let mut b = vec![0u8; 96];
        b[4..8].copy_from_slice(b"beam");
        b[10] = 3;
        pf(&mut b, 12, 20.0);
        pf(&mut b, 16, 3000.0);
        pf(&mut b, 28, 0.4);
        b[44..48].copy_from_slice(&(8u32 | 1024).to_le_bytes());
        pf(&mut b, 48, 0.7);
        let mut p = BeamNg::default();
        p.feed(&b);
        let sd = p.session();
        let mut f = Frame::default();
        p.extract(&sd, &mut f);
        assert_eq!(f.gear, 2);
        assert_eq!(f.rpm, 3000.0);
        assert!(f.abs_active);
        assert_eq!(f.engine_warnings, EW_PIT_LIMITER);
        assert!((f.fuel_pct - 0.4).abs() < 1e-6);
    }
}
