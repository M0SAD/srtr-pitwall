#![cfg_attr(not(windows), allow(dead_code))]
//! iRacing SDK okuyucu.
//!
//! iRacing verisini `Local\IRSDKMemMapFileName` adlı paylaşımlı bellekte yayınlar.
//! Bu modülün ayrıştırma kısmı platformdan bağımsızdır (bayt dilimleri üzerinde çalışır),
//! böylece testler Windows olmadan da çalışır. Belleği açan kısım sadece Windows'ta derlenir.
//!
//! Bellek düzeni (irsdk_defines.h):
//!   header (112 bayt)
//!     int ver, status, tickRate, sessionInfoUpdate, sessionInfoLen, sessionInfoOffset,
//!         numVars, varHeaderOffset, numBuf, bufLen, pad[2]
//!     varBuf[4] { int tickCount, bufOffset, pad[2] }
//!   varHeader[numVars] (144 bayt) { int type, offset, count; bool countAsTime; pad[3];
//!                                   char name[32], desc[64], unit[32] }

use crate::model::{Frame, MAX_CARS};

pub const HEADER_SIZE: usize = 112;
pub const VAR_HEADER_SIZE: usize = 144;
pub const STATUS_CONNECTED: i32 = 1;

// Değişken tipleri
pub const T_CHAR: u8 = 0;
pub const T_BOOL: u8 = 1;
pub const T_INT: u8 = 2;
pub const T_BITFIELD: u8 = 3;
pub const T_FLOAT: u8 = 4;
pub const T_DOUBLE: u8 = 5;

#[inline]
fn rd_i32(b: &[u8], off: usize) -> i32 {
    match b.get(off..off + 4) {
        Some(s) => i32::from_le_bytes([s[0], s[1], s[2], s[3]]),
        None => 0,
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Header {
    pub ver: i32,
    pub status: i32,
    pub tick_rate: i32,
    pub session_info_update: i32,
    pub session_info_len: i32,
    pub session_info_offset: i32,
    pub num_vars: i32,
    pub var_header_offset: i32,
    pub num_buf: i32,
    pub buf_len: i32,
    pub bufs: [(i32, i32); 4], // (tickCount, bufOffset)
}

impl Header {
    pub fn parse(b: &[u8]) -> Option<Header> {
        if b.len() < HEADER_SIZE {
            return None;
        }
        let mut h = Header {
            ver: rd_i32(b, 0),
            status: rd_i32(b, 4),
            tick_rate: rd_i32(b, 8),
            session_info_update: rd_i32(b, 12),
            session_info_len: rd_i32(b, 16),
            session_info_offset: rd_i32(b, 20),
            num_vars: rd_i32(b, 24),
            var_header_offset: rd_i32(b, 28),
            num_buf: rd_i32(b, 32),
            buf_len: rd_i32(b, 36),
            bufs: [(0, 0); 4],
        };
        for i in 0..4 {
            let base = 48 + i * 16;
            h.bufs[i] = (rd_i32(b, base), rd_i32(b, base + 4));
        }
        Some(h)
    }

    pub fn connected(&self) -> bool {
        self.status & STATUS_CONNECTED != 0
    }

    /// En son yazılan tamponun indeksi.
    pub fn latest_buf(&self) -> usize {
        let n = (self.num_buf.clamp(1, 4)) as usize;
        let mut best = 0;
        for i in 1..n {
            if self.bufs[i].0 > self.bufs[best].0 {
                best = i;
            }
        }
        best
    }
}

#[derive(Debug, Clone, Copy)]
pub struct VarRef {
    pub ty: u8,
    pub offset: usize,
    pub count: usize,
}

/// İsimden bağımsız, önceden çözülmüş değişken konumları.
/// Her karede isim araması yapılmaz; bağlantı başına bir kez oluşturulur.
#[derive(Debug, Default, Clone)]
pub struct VarIndex {
    pub session_time: Option<VarRef>,
    pub session_time_remain: Option<VarRef>,
    pub session_laps_remain: Option<VarRef>,
    pub session_num: Option<VarRef>,
    pub session_state: Option<VarRef>,
    pub session_flags: Option<VarRef>,
    pub player_car_idx: Option<VarRef>,
    pub speed: Option<VarRef>,
    pub rpm: Option<VarRef>,
    pub gear: Option<VarRef>,
    pub throttle: Option<VarRef>,
    pub brake: Option<VarRef>,
    pub clutch: Option<VarRef>,
    pub steer: Option<VarRef>,
    pub abs_active: Option<VarRef>,
    pub fuel_level: Option<VarRef>,
    pub fuel_pct: Option<VarRef>,
    pub lap: Option<VarRef>,
    pub lap_completed: Option<VarRef>,
    pub lap_dist_pct: Option<VarRef>,
    pub lap_cur: Option<VarRef>,
    pub lap_last: Option<VarRef>,
    pub lap_best: Option<VarRef>,
    pub delta_best: Option<VarRef>,
    pub delta_best_ok: Option<VarRef>,
    pub car_left_right: Option<VarRef>,
    pub on_pit_road: Option<VarRef>,
    pub is_on_track: Option<VarRef>,
    pub is_in_garage: Option<VarRef>,
    pub replay: Option<VarRef>,
    pub air_temp: Option<VarRef>,
    pub track_temp: Option<VarRef>,
    pub incidents: Option<VarRef>,
    pub track_wetness: Option<VarRef>,
    pub brake_bias: Option<VarRef>,
    pub tc: Option<VarRef>,
    pub abs_setting: Option<VarRef>,
    pub pit_limiter: Option<VarRef>,
    pub engine_warnings: Option<VarRef>,
    pub c_lap: Option<VarRef>,
    pub c_lap_completed: Option<VarRef>,
    pub c_pct: Option<VarRef>,
    pub c_position: Option<VarRef>,
    pub c_class_position: Option<VarRef>,
    pub c_on_pit: Option<VarRef>,
    pub c_est_time: Option<VarRef>,
    pub c_last: Option<VarRef>,
    pub c_best: Option<VarRef>,
    pub c_surface: Option<VarRef>,
    pub c_f2: Option<VarRef>,
    pub c_tire: Option<VarRef>,
    pub c_flags: Option<VarRef>,
    pub yaw_north: Option<VarRef>,
    pub vel_x: Option<VarRef>,
    pub vel_y: Option<VarRef>,
    pub wind_dir: Option<VarRef>,
    pub wind_vel: Option<VarRef>,
    pub humidity: Option<VarRef>,
    pub precip: Option<VarRef>,
    pub shift_pct: Option<VarRef>,
    /// [LF, RF, LR, RR][CL, CM, CR]
    pub tire_temp: [[Option<VarRef>; 3]; 4],
    pub tire_wear: [[Option<VarRef>; 3]; 4],
    pub tire_press: [Option<VarRef>; 4],
    pub tire_compound: Option<VarRef>,
}

impl VarIndex {
    /// `mem` paylaşımlı belleğin başından itibaren en az var header'ları kapsayan dilimdir.
    pub fn build(mem: &[u8], h: &Header) -> VarIndex {
        let mut ix = VarIndex::default();
        let base = h.var_header_offset.max(0) as usize;
        for i in 0..h.num_vars.max(0) as usize {
            let off = base + i * VAR_HEADER_SIZE;
            let Some(vh) = mem.get(off..off + VAR_HEADER_SIZE) else { break };
            let ty = rd_i32(vh, 0) as u8;
            let voff = rd_i32(vh, 4).max(0) as usize;
            let count = rd_i32(vh, 8).max(1) as usize;
            let name_raw = &vh[16..48];
            let end = name_raw.iter().position(|&c| c == 0).unwrap_or(32);
            let name = std::str::from_utf8(&name_raw[..end]).unwrap_or("");
            let r = Some(VarRef { ty, offset: voff, count });
            match name {
                "SessionTime" => ix.session_time = r,
                "SessionTimeRemain" => ix.session_time_remain = r,
                "SessionLapsRemainEx" => ix.session_laps_remain = r,
                "SessionNum" => ix.session_num = r,
                "SessionState" => ix.session_state = r,
                "SessionFlags" => ix.session_flags = r,
                "PlayerCarIdx" => ix.player_car_idx = r,
                "Speed" => ix.speed = r,
                "RPM" => ix.rpm = r,
                "Gear" => ix.gear = r,
                "Throttle" => ix.throttle = r,
                "Brake" => ix.brake = r,
                "Clutch" => ix.clutch = r,
                "SteeringWheelAngle" => ix.steer = r,
                "BrakeABSactive" => ix.abs_active = r,
                "FuelLevel" => ix.fuel_level = r,
                "FuelLevelPct" => ix.fuel_pct = r,
                "Lap" => ix.lap = r,
                "LapCompleted" => ix.lap_completed = r,
                "LapDistPct" => ix.lap_dist_pct = r,
                "LapCurrentLapTime" => ix.lap_cur = r,
                "LapLastLapTime" => ix.lap_last = r,
                "LapBestLapTime" => ix.lap_best = r,
                "LapDeltaToBestLap" => ix.delta_best = r,
                "LapDeltaToBestLap_OK" => ix.delta_best_ok = r,
                "CarLeftRight" => ix.car_left_right = r,
                "OnPitRoad" => ix.on_pit_road = r,
                "IsOnTrack" => ix.is_on_track = r,
                "IsInGarage" => ix.is_in_garage = r,
                "IsReplayPlaying" => ix.replay = r,
                "AirTemp" => ix.air_temp = r,
                "TrackTempCrew" => ix.track_temp = r,
                "PlayerCarMyIncidentCount" => ix.incidents = r,
                "TrackWetness" => ix.track_wetness = r,
                "dcBrakeBias" => ix.brake_bias = r,
                "dcTractionControl" => ix.tc = r,
                "dcABS" => ix.abs_setting = r,
                "EngineWarnings" => ix.engine_warnings = r,
                "dcPitSpeedLimiterToggle" => ix.pit_limiter = r,
                "CarIdxLap" => ix.c_lap = r,
                "CarIdxLapCompleted" => ix.c_lap_completed = r,
                "CarIdxLapDistPct" => ix.c_pct = r,
                "CarIdxPosition" => ix.c_position = r,
                "CarIdxClassPosition" => ix.c_class_position = r,
                "CarIdxOnPitRoad" => ix.c_on_pit = r,
                "CarIdxEstTime" => ix.c_est_time = r,
                "CarIdxLastLapTime" => ix.c_last = r,
                "CarIdxBestLapTime" => ix.c_best = r,
                "CarIdxTrackSurface" => ix.c_surface = r,
                "CarIdxF2Time" => ix.c_f2 = r,
                "CarIdxTireCompound" => ix.c_tire = r,
                "CarIdxSessionFlags" => ix.c_flags = r,
                "YawNorth" => ix.yaw_north = r,
                "VelocityX" => ix.vel_x = r,
                "VelocityY" => ix.vel_y = r,
                "WindDir" => ix.wind_dir = r,
                "WindVel" => ix.wind_vel = r,
                "RelativeHumidity" => ix.humidity = r,
                "Precipitation" => ix.precip = r,
                "ShiftIndicatorPct" => ix.shift_pct = r,
                "PlayerTireCompound" => ix.tire_compound = r,
                _ => {
                    // LFtempCL, RRwearM, LRcoldPressure ...
                    const CORNERS: [&str; 4] = ["LF", "RF", "LR", "RR"];
                    if let Some(ci) = CORNERS.iter().position(|c| name.starts_with(c)) {
                        let rest = &name[2..];
                        match rest {
                            "tempCL" => ix.tire_temp[ci][0] = r,
                            "tempCM" => ix.tire_temp[ci][1] = r,
                            "tempCR" => ix.tire_temp[ci][2] = r,
                            "wearL" => ix.tire_wear[ci][0] = r,
                            "wearM" => ix.tire_wear[ci][1] = r,
                            "wearR" => ix.tire_wear[ci][2] = r,
                            "coldPressure" => ix.tire_press[ci] = r,
                            _ => {}
                        }
                    }
                }
            }
        }
        ix
    }
}

// ---- Tampondan tipten bağımsız okuma ----

#[inline]
fn elem_size(ty: u8) -> usize {
    match ty {
        T_CHAR | T_BOOL => 1,
        T_DOUBLE => 8,
        _ => 4,
    }
}

#[inline]
pub fn get_f64(buf: &[u8], v: Option<VarRef>, i: usize) -> Option<f64> {
    let v = v?;
    if i >= v.count {
        return None;
    }
    let off = v.offset + i * elem_size(v.ty);
    let s = buf.get(off..off + elem_size(v.ty))?;
    Some(match v.ty {
        T_CHAR | T_BOOL => s[0] as f64,
        T_INT | T_BITFIELD => i32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f64,
        T_FLOAT => f32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f64,
        T_DOUBLE => f64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]),
        _ => return None,
    })
}

#[inline]
fn f32_or(buf: &[u8], v: Option<VarRef>, d: f32) -> f32 {
    get_f64(buf, v, 0).map(|x| x as f32).unwrap_or(d)
}
#[inline]
fn i32_or(buf: &[u8], v: Option<VarRef>, d: i32) -> i32 {
    get_f64(buf, v, 0).map(|x| x as i32).unwrap_or(d)
}
#[inline]
fn u32_bits(buf: &[u8], v: Option<VarRef>) -> u32 {
    // Bitfield'ları kayıpsız okumak için doğrudan bayttan oku.
    let Some(v) = v else { return 0 };
    buf.get(v.offset..v.offset + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .unwrap_or(0)
}
#[inline]
fn bool_of(buf: &[u8], v: Option<VarRef>) -> bool {
    get_f64(buf, v, 0).map(|x| x != 0.0).unwrap_or(false)
}

/// Telemetri tamponunu normalize edilmiş `Frame` yapısına aktarır. Bellek ayırmaz.
pub fn extract_frame(ix: &VarIndex, buf: &[u8], tick: i32, f: &mut Frame) {
    f.tick = tick;
    f.session_time = get_f64(buf, ix.session_time, 0).unwrap_or(0.0);
    f.session_time_remain = get_f64(buf, ix.session_time_remain, 0).unwrap_or(-1.0);
    f.session_laps_remain = i32_or(buf, ix.session_laps_remain, 32767);
    f.session_num = i32_or(buf, ix.session_num, 0);
    f.session_state = i32_or(buf, ix.session_state, 0);
    f.session_flags = u32_bits(buf, ix.session_flags);
    f.player_idx = i32_or(buf, ix.player_car_idx, -1);
    f.speed = f32_or(buf, ix.speed, 0.0);
    f.rpm = f32_or(buf, ix.rpm, 0.0);
    f.gear = i32_or(buf, ix.gear, 0);
    f.throttle = f32_or(buf, ix.throttle, 0.0);
    f.brake = f32_or(buf, ix.brake, 0.0);
    // iRacing'de Clutch 1 = tam bağlı (pedal bırakılmış). Pedal konumuna çeviriyoruz.
    f.clutch = 1.0 - f32_or(buf, ix.clutch, 1.0);
    f.steer = f32_or(buf, ix.steer, 0.0);
    f.abs_active = bool_of(buf, ix.abs_active);
    f.fuel_level = f32_or(buf, ix.fuel_level, 0.0);
    f.fuel_pct = f32_or(buf, ix.fuel_pct, 0.0);
    f.lap = i32_or(buf, ix.lap, 0);
    f.lap_completed = i32_or(buf, ix.lap_completed, 0);
    f.lap_dist_pct = f32_or(buf, ix.lap_dist_pct, 0.0);
    f.lap_cur = f32_or(buf, ix.lap_cur, 0.0);
    f.lap_last = f32_or(buf, ix.lap_last, -1.0);
    f.lap_best = f32_or(buf, ix.lap_best, -1.0);
    f.delta_best = f32_or(buf, ix.delta_best, 0.0);
    f.delta_best_ok = bool_of(buf, ix.delta_best_ok);
    f.car_left_right = i32_or(buf, ix.car_left_right, 0);
    f.on_pit_road = bool_of(buf, ix.on_pit_road);
    f.is_on_track = bool_of(buf, ix.is_on_track);
    f.is_in_garage = bool_of(buf, ix.is_in_garage);
    f.replay = bool_of(buf, ix.replay);
    f.air_temp = f32_or(buf, ix.air_temp, 0.0);
    f.track_temp = f32_or(buf, ix.track_temp, 0.0);
    f.incidents = i32_or(buf, ix.incidents, 0);
    f.track_wetness = i32_or(buf, ix.track_wetness, 0);
    f.brake_bias = f32_or(buf, ix.brake_bias, -1.0);
    f.tc = f32_or(buf, ix.tc, -1.0);
    f.abs_setting = f32_or(buf, ix.abs_setting, -1.0);
    f.engine_warnings = u32_bits(buf, ix.engine_warnings);
    f.yaw_north = f32_or(buf, ix.yaw_north, 0.0);
    f.vel_x = f32_or(buf, ix.vel_x, 0.0);
    f.vel_y = f32_or(buf, ix.vel_y, 0.0);
    f.wind_dir = f32_or(buf, ix.wind_dir, 0.0);
    f.wind_vel = f32_or(buf, ix.wind_vel, 0.0);
    f.humidity = f32_or(buf, ix.humidity, -1.0);
    f.precip = f32_or(buf, ix.precip, -1.0);
    f.shift_pct = f32_or(buf, ix.shift_pct, 0.0);
    for c in 0..4 {
        for k in 0..3 {
            f.tire_temp[c][k] = f32_or(buf, ix.tire_temp[c][k], 0.0);
            f.tire_wear[c][k] = f32_or(buf, ix.tire_wear[c][k], -1.0);
        }
        f.tire_press[c] = f32_or(buf, ix.tire_press[c], 0.0);
    }
    f.tire_compound = i32_or(buf, ix.tire_compound, -1);
    f.demo_side_cars = None;

    for i in 0..MAX_CARS {
        let c = &mut f.cars[i];
        c.lap = get_f64(buf, ix.c_lap, i).map(|x| x as i32).unwrap_or(-1);
        c.lap_completed = get_f64(buf, ix.c_lap_completed, i).map(|x| x as i32).unwrap_or(-1);
        c.pct = get_f64(buf, ix.c_pct, i).map(|x| x as f32).unwrap_or(-1.0);
        c.position = get_f64(buf, ix.c_position, i).map(|x| x as i32).unwrap_or(0);
        c.class_position = get_f64(buf, ix.c_class_position, i).map(|x| x as i32).unwrap_or(0);
        c.on_pit = get_f64(buf, ix.c_on_pit, i).map(|x| x != 0.0).unwrap_or(false);
        c.est_time = get_f64(buf, ix.c_est_time, i).map(|x| x as f32).unwrap_or(0.0);
        c.last = get_f64(buf, ix.c_last, i).map(|x| x as f32).unwrap_or(-1.0);
        c.best = get_f64(buf, ix.c_best, i).map(|x| x as f32).unwrap_or(-1.0);
        c.surface = get_f64(buf, ix.c_surface, i).map(|x| x as i32).unwrap_or(-1);
        c.f2 = get_f64(buf, ix.c_f2, i).map(|x| x as f32).unwrap_or(0.0);
        c.tire = get_f64(buf, ix.c_tire, i).map(|x| x as i32).unwrap_or(-1);
        c.flags = match ix.c_flags {
            Some(v) if i < v.count => buf
                .get(v.offset + i * 4..v.offset + i * 4 + 4)
                .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
                .unwrap_or(0),
            _ => 0,
        };
    }
}

// ---------------------------------------------------------------------------
// Windows: paylaşımlı belleğe canlı bağlantı
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub use win::LiveSource;

#[cfg(windows)]
mod win {
    use super::*;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, MEMORY_MAPPED_VIEW_ADDRESS,
    };
    use windows_sys::Win32::System::Threading::{OpenEventW, WaitForSingleObject};

    const FILE_MAP_READ: u32 = 0x0004;
    const SYNCHRONIZE: u32 = 0x0010_0000;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub struct LiveSource {
        map: HANDLE,
        view: *const u8,
        event: HANDLE,
        pub index: VarIndex,
        index_vars: i32,
        buf: Vec<u8>,
        last_tick: i32,
    }

    // Tutamaçlar sadece telemetri iş parçacığında kullanılır.
    unsafe impl Send for LiveSource {}

    impl LiveSource {
        pub fn open() -> Option<LiveSource> {
            unsafe {
                let map = OpenFileMappingW(FILE_MAP_READ, 0, wide("Local\\IRSDKMemMapFileName").as_ptr());
                if map.is_null() {
                    return None;
                }
                let view: MEMORY_MAPPED_VIEW_ADDRESS = MapViewOfFile(map, FILE_MAP_READ, 0, 0, 0);
                if view.Value.is_null() {
                    CloseHandle(map);
                    return None;
                }
                let event = OpenEventW(SYNCHRONIZE, 0, wide("Local\\IRSDKDataValidEvent").as_ptr());
                Some(LiveSource {
                    map,
                    view: view.Value as *const u8,
                    event,
                    index: VarIndex::default(),
                    index_vars: -1,
                    buf: Vec::new(),
                    last_tick: -1,
                })
            }
        }

        fn header(&self) -> Option<Header> {
            let s = unsafe { std::slice::from_raw_parts(self.view, HEADER_SIZE) };
            Header::parse(s)
        }

        /// Yeni veri gelene kadar (en fazla `ms`) bekler.
        pub fn wait(&self, ms: u32) {
            if !self.event.is_null() {
                unsafe { WaitForSingleObject(self.event, ms) };
            } else {
                std::thread::sleep(std::time::Duration::from_millis(ms.min(16) as u64));
            }
        }

        pub fn connected(&self) -> bool {
            self.header().map(|h| h.connected()).unwrap_or(false)
        }

        pub fn session_info_update(&self) -> i32 {
            self.header().map(|h| h.session_info_update).unwrap_or(-1)
        }

        /// Session YAML metnini (ISO-8859-1) okur.
        pub fn session_yaml(&self) -> Option<String> {
            let h = self.header()?;
            if h.session_info_len <= 0 || h.session_info_offset <= 0 {
                return None;
            }
            let bytes = unsafe {
                std::slice::from_raw_parts(
                    self.view.add(h.session_info_offset as usize),
                    h.session_info_len as usize,
                )
            };
            let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
            // Latin-1 -> UTF-8: her bayt bir Unicode kod noktasıdır.
            Some(bytes[..end].iter().map(|&b| b as char).collect())
        }

        /// Yeni bir telemetri satırı varsa `frame`'e yazar ve true döner.
        pub fn read(&mut self, frame: &mut Frame) -> bool {
            let Some(h) = self.header() else { return false };
            if !h.connected() || h.buf_len <= 0 {
                return false;
            }
            if h.num_vars != self.index_vars {
                let len = h.var_header_offset as usize + h.num_vars as usize * VAR_HEADER_SIZE;
                let mem = unsafe { std::slice::from_raw_parts(self.view, len) };
                self.index = VarIndex::build(mem, &h);
                self.index_vars = h.num_vars;
            }
            for _ in 0..2 {
                let h = match self.header() {
                    Some(h) => h,
                    None => return false,
                };
                let bi = h.latest_buf();
                let (tick, off) = h.bufs[bi];
                if tick == self.last_tick {
                    return false;
                }
                let len = h.buf_len as usize;
                self.buf.resize(len, 0);
                unsafe {
                    std::ptr::copy_nonoverlapping(self.view.add(off as usize), self.buf.as_mut_ptr(), len);
                }
                // Kopyalarken iRacing aynı tamponu yeniden yazdıysa tekrar dene.
                let h2 = match self.header() {
                    Some(h) => h,
                    None => return false,
                };
                if h2.bufs[bi].0 == tick {
                    self.last_tick = tick;
                    extract_frame(&self.index, &self.buf, tick, frame);
                    return true;
                }
            }
            false
        }
    }

    impl Drop for LiveSource {
        fn drop(&mut self) {
            unsafe {
                UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS { Value: self.view as *mut _ });
                CloseHandle(self.map);
                if !self.event.is_null() {
                    CloseHandle(self.event);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_i32(b: &mut [u8], off: usize, v: i32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }

    fn var(b: &mut Vec<u8>, base: usize, i: usize, name: &str, ty: i32, off: i32, count: i32) {
        let o = base + i * VAR_HEADER_SIZE;
        put_i32(b, o, ty);
        put_i32(b, o + 4, off);
        put_i32(b, o + 8, count);
        b[o + 16..o + 16 + name.len()].copy_from_slice(name.as_bytes());
    }

    #[test]
    fn parses_header_vars_and_frame() {
        let mut mem = vec![0u8; 4096];
        let var_base = 200;
        let buf_off = 1000;
        put_i32(&mut mem, 4, 1); // connected
        put_i32(&mut mem, 24, 4); // numVars
        put_i32(&mut mem, 28, var_base as i32);
        put_i32(&mut mem, 32, 2); // numBuf
        put_i32(&mut mem, 36, 600); // bufLen
        put_i32(&mut mem, 48, 10); // buf0 tick
        put_i32(&mut mem, 52, 3000);
        put_i32(&mut mem, 64, 11); // buf1 tick (en yeni)
        put_i32(&mut mem, 68, buf_off as i32);
        var(&mut mem, var_base, 0, "Speed", T_FLOAT as i32, 0, 1);
        var(&mut mem, var_base, 1, "Gear", T_INT as i32, 4, 1);
        var(&mut mem, var_base, 2, "SessionTime", T_DOUBLE as i32, 8, 1);
        var(&mut mem, var_base, 3, "CarIdxLapDistPct", T_FLOAT as i32, 16, 64);
        mem[buf_off..buf_off + 4].copy_from_slice(&42.5f32.to_le_bytes());
        put_i32(&mut mem, buf_off + 4, 3);
        mem[buf_off + 8..buf_off + 16].copy_from_slice(&123.25f64.to_le_bytes());
        mem[buf_off + 16 + 4 * 7..buf_off + 16 + 4 * 8].copy_from_slice(&0.75f32.to_le_bytes());

        let h = Header::parse(&mem).unwrap();
        assert!(h.connected());
        assert_eq!(h.latest_buf(), 1);
        let ix = VarIndex::build(&mem, &h);
        let mut f = Frame::default();
        let buf = &mem[buf_off..buf_off + 600];
        extract_frame(&ix, buf, 11, &mut f);
        assert_eq!(f.speed, 42.5);
        assert_eq!(f.gear, 3);
        assert_eq!(f.session_time, 123.25);
        assert_eq!(f.cars[7].pct, 0.75);
        assert_eq!(f.cars[8].pct, 0.0);
        // Olmayan değişken varsayılan değeri alır
        assert_eq!(f.cars[0].position, 0);
    }
}
