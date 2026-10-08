#![cfg_attr(not(windows), allow(dead_code))]
//! Simülasyon kaynakları: iRacing dışındaki simler de aynı `Frame` / `SessionData`
//! yapılarını doldurur, böylece tüm overlay'ler (en iyi çabayla) çalışır.
//!
//! - iRacing: `sdk.rs` (değişmeden) + `iracing.rs` sarmalayıcısı
//! - Assetto Corsa / ACC: `kunos.rs` (`Local\acpmf_physics|graphics|static`)
//! - rFactor 2 / Le Mans Ultimate: `rf2.rs` (rF2 Shared Memory Map Plugin tamponları)
//! - Automobilista 2 / Project CARS 2: `ams2.rs` (`$pcars2$`)
//!
//! Bayt ayrıştırma kısımları platformdan bağımsızdır (testler Linux'ta da çalışır);
//! belleği açan kısımlar sadece Windows'ta derlenir.

pub mod ams2;
pub mod kunos;
pub mod rf2;
pub mod role;

#[cfg(windows)]
pub mod iracing;
#[cfg(windows)]
pub mod shm;

use crate::model::{Frame, SessionData, MAX_CARS};

/// Bağlı simülasyon
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimKind {
    IRacing,
    Acc,
    Ac,
    Lmu,
    Rf2,
    Ams2,
}

impl SimKind {
    /// `status` konusunda ve ayarlarda kullanılan kısa ad
    pub fn id(self) -> &'static str {
        match self {
            SimKind::IRacing => "iracing",
            SimKind::Acc => "acc",
            SimKind::Ac => "ac",
            SimKind::Lmu => "lmu",
            SimKind::Rf2 => "rf2",
            SimKind::Ams2 => "ams2",
        }
    }
}

/// Kullanıcının seçtiği sim (ayar: `general.sim`)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SimPref {
    #[default]
    Auto,
    Only(SimKind),
}

impl SimPref {
    pub fn parse(s: &str) -> SimPref {
        match s {
            "iracing" => SimPref::Only(SimKind::IRacing),
            "acc" => SimPref::Only(SimKind::Acc),
            "ac" => SimPref::Only(SimKind::Ac),
            "lmu" => SimPref::Only(SimKind::Lmu),
            "rf2" => SimPref::Only(SimKind::Rf2),
            "ams2" => SimPref::Only(SimKind::Ams2),
            _ => SimPref::Auto,
        }
    }

    pub fn from_settings(v: Option<&serde_json::Value>) -> SimPref {
        v.and_then(|v| v.pointer("/general/sim")).and_then(|x| x.as_str()).map(SimPref::parse).unwrap_or_default()
    }

    /// Bu tercihte `k` kabul edilir mi? LMU ve rF2 aynı eklentiyi/düzeni kullandığı için
    /// birbirinin yerine geçer; AC ile ACC'nin düzeni farklıdır, ayrı tutulur.
    pub fn accepts(self, k: SimKind) -> bool {
        let rf = |x: SimKind| matches!(x, SimKind::Lmu | SimKind::Rf2);
        match self {
            SimPref::Auto => true,
            SimPref::Only(p) => p == k || (rf(p) && rf(k)),
        }
    }

    fn wants(self, family: &[SimKind]) -> bool {
        match self {
            SimPref::Auto => true,
            SimPref::Only(p) => family.contains(&p),
        }
    }
}

/// Canlı bir sim bağlantısı. Motor (engine.rs) sadece bu arayüzü kullanır.
pub trait Source {
    fn kind(&self) -> SimKind;
    /// Yeni veri için en fazla `ms` bekler
    fn wait(&self, ms: u32);
    /// Sim bir oturumda mı? false ise motor kaynağı bırakır ve yeniden arar.
    fn connected(&self) -> bool;
    /// Oturum bilgisi (pist, sürücüler...) değiştiyse yenisini döner
    fn session_update(&mut self) -> Option<SessionData>;
    /// Yeni bir telemetri karesi varsa `frame`'e yazar ve true döner
    fn read(&mut self, frame: &mut Frame) -> bool;
    /// Pist haritası kayıt anahtarı
    fn map_key(&self, s: &SessionData) -> String;
}

/// Tercihe göre açık ve bağlı bir sim arar. Otomatikte iRacing önce denenir.
/// Hiçbiri bağlı değilse (ama iRacing belleği varsa) iRacing kaynağı döner; motor onu
/// eskisi gibi bırakıp yeniden dener.
#[cfg(windows)]
pub fn open(pref: SimPref) -> Option<Box<dyn Source>> {
    let mut idle: Option<Box<dyn Source>> = None;
    if pref.wants(&[SimKind::IRacing]) {
        if let Some(s) = iracing::IRacing::open() {
            if s.connected() || pref != SimPref::Auto {
                return Some(Box::new(s));
            }
            idle = Some(Box::new(s));
        }
    }
    // Süreç listesi sadece bir bellek bulunduğunda (AC/ACC, rF2/LMU ayrımı için) okunur
    let mut exes: Option<Vec<String>> = None;
    if pref.wants(&[SimKind::Acc, SimKind::Ac]) {
        if let Some(mut s) = kunos::Kunos::open() {
            s.detect(exes.get_or_insert_with(shm::process_names));
            if s.connected() && pref.accepts(s.kind()) {
                return Some(Box::new(s));
            }
        }
    }
    if pref.wants(&[SimKind::Lmu, SimKind::Rf2]) {
        if let Some(mut s) = rf2::Rf2::open() {
            if s.detect(exes.get_or_insert_with(shm::process_names), pref) && s.connected() {
                return Some(Box::new(s));
            }
        }
    }
    if pref.wants(&[SimKind::Ams2]) {
        if let Some(s) = ams2::Ams2::open() {
            if s.connected() {
                return Some(Box::new(s));
            }
        }
    }
    idle
}

// ---------------------------------------------------------------------------
// Bayt okuma yardımcıları (küçük uçlu). Sınır dışı okuma 0 döner, panik yok.
// ---------------------------------------------------------------------------

#[inline]
pub(crate) fn rd_i32(b: &[u8], off: usize) -> i32 {
    b.get(off..off + 4).map(|s| i32::from_le_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(0)
}
#[inline]
pub(crate) fn rd_u32(b: &[u8], off: usize) -> u32 {
    rd_i32(b, off) as u32
}
#[inline]
pub(crate) fn rd_i16(b: &[u8], off: usize) -> i16 {
    b.get(off..off + 2).map(|s| i16::from_le_bytes([s[0], s[1]])).unwrap_or(0)
}
#[inline]
pub(crate) fn rd_u8(b: &[u8], off: usize) -> u8 {
    b.get(off).copied().unwrap_or(0)
}
#[inline]
pub(crate) fn rd_f32(b: &[u8], off: usize) -> f32 {
    let v = f32::from_bits(rd_u32(b, off));
    if v.is_finite() {
        v
    } else {
        0.0
    }
}
#[inline]
pub(crate) fn rd_f64(b: &[u8], off: usize) -> f64 {
    let v = b
        .get(off..off + 8)
        .map(|s| f64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]))
        .unwrap_or(0.0);
    if v.is_finite() {
        v
    } else {
        0.0
    }
}
#[inline]
pub(crate) fn rd_vec3(b: &[u8], off: usize) -> [f64; 3] {
    [rd_f64(b, off), rd_f64(b, off + 8), rd_f64(b, off + 16)]
}

/// wchar_t[n] (UTF-16) metni
pub(crate) fn rd_wstr(b: &[u8], off: usize, n: usize) -> String {
    let mut u: Vec<u16> = Vec::with_capacity(n);
    for i in 0..n {
        let c = b.get(off + i * 2..off + i * 2 + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).unwrap_or(0);
        if c == 0 {
            break;
        }
        u.push(c);
    }
    String::from_utf16_lossy(&u).trim().to_string()
}

/// char[n] metni (UTF-8 değilse Latin-1 kabul edilir)
pub(crate) fn rd_cstr(b: &[u8], off: usize, n: usize) -> String {
    let Some(s) = b.get(off..(off + n).min(b.len())) else { return String::new() };
    let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    let s = &s[..end];
    match std::str::from_utf8(s) {
        Ok(t) => t.trim().to_string(),
        Err(_) => s.iter().map(|&c| c as char).collect::<String>().trim().to_string(),
    }
}

// ---------------------------------------------------------------------------
// Ortak dönüşümler
// ---------------------------------------------------------------------------

/// iRacing oturum bayrakları (irsdk_Flags)
pub(crate) mod flags {
    pub const CHECKERED: u32 = 0x0001;
    pub const WHITE: u32 = 0x0002;
    pub const GREEN: u32 = 0x0004;
    pub const YELLOW: u32 = 0x0008;
    pub const RED: u32 = 0x0010;
    pub const BLUE: u32 = 0x0020;
    pub const CAUTION: u32 = 0x4000;
    pub const BLACK: u32 = 0x0001_0000;
    pub const DQ: u32 = 0x0002_0000;
    pub const REPAIR: u32 = 0x0010_0000;
}

/// iRacing EngineWarnings: pit hız sınırlayıcı biti
pub(crate) const EW_PIT_LIMITER: u32 = 0x10;

/// iRacing SessionState: 4 yarış/sürüş, 5 damalı bayrak
pub(crate) const STATE_PARADE: i32 = 3;
pub(crate) const STATE_RACING: i32 = 4;
pub(crate) const STATE_CHECKERED: i32 = 5;

/// Normalize direksiyon girişini (-1 sol .. 1 sağ) iRacing gibi radyana çevirir
/// (iRacing'de pozitif = sola). `range_deg` direksiyonun toplam dönüşü.
pub(crate) fn steer_rad(norm: f32, range_deg: f32) -> f32 {
    let range = if range_deg > 90.0 && range_deg < 3000.0 { range_deg } else { 540.0 };
    -norm.clamp(-1.5, 1.5) * (range * 0.5).to_radians()
}

/// 0..1 ıslaklık -> iRacing TrackWetness (1 kuru .. 7 çok ıslak)
pub(crate) fn wetness_from_frac(w: f32) -> i32 {
    if w <= 0.02 {
        1
    } else {
        (2.0 + w.clamp(0.0, 1.0) * 5.0).round() as i32
    }
}

/// Doğu/kuzey düzlemindeki hızdan pist haritası için yön (kuzeye göre, saat yönünde) ve
/// ileri hız. Durunca son yön korunur.
pub(crate) fn motion(f: &mut Frame, east: f32, north: f32) {
    let v = (east * east + north * north).sqrt();
    if v > 0.5 {
        f.yaw_north = east.atan2(north);
    }
    f.vel_x = v;
    f.vel_y = 0.0;
}

/// Yan araç bilgisi (radar/spotter): her araç için (sağa yanal m, ileri boyuna m).
/// `f.car_left_right` (iRacing CarLeftRight) ve radar listesi (`demo_side_cars`) doldurulur.
pub(crate) fn fill_radar(f: &mut Frame, rel: &[(f32, f32)], driving: bool) {
    const CAR_LEN: f32 = 5.0;
    let mut list = f.demo_side_cars.take().unwrap_or_default();
    list.clear();
    f.radar_lat.clear();
    if !driving {
        f.car_left_right = 0;
        f.demo_side_cars = None;
        return;
    }
    let (mut left, mut right) = (0, 0);
    for &(lat, long) in rel {
        if long.abs() > 60.0 || lat.abs() > 12.0 {
            continue;
        }
        let side: i8 = if lat.abs() < 1.6 {
            0
        } else if lat < 0.0 {
            -1
        } else {
            1
        };
        if long.abs() < CAR_LEN && lat.abs() < 6.0 {
            match side {
                -1 => left += 1,
                1 => right += 1,
                _ => {}
            }
        }
        list.push((side, long));
        f.radar_lat.push(lat);
    }
    f.car_left_right = match (left, right) {
        (0, 0) => 1,
        (1, 0) => 2,
        (0, 1) => 3,
        (l, r) if l > 0 && r > 0 => 4,
        (_, 0) => 5,
        _ => 6,
    };
    f.demo_side_cars = Some(list);
}

/// Sim vermiyorsa araçların tahmini süre konumunu (`est_time`), yarışta lidere farkı (`f2`)
/// ve sınıf sırasını doldurur.
pub(crate) fn fill_estimates(f: &mut Frame, s: &SessionData, need_f2: bool, need_class_pos: bool) {
    let me = f.player_idx.max(0) as usize;
    let fallback = if f.lap_best > 1.0 {
        f.lap_best
    } else if s.est_lap_time > 1.0 {
        s.est_lap_time
    } else if s.driver(me).map(|d| d.class_est_lap > 1.0).unwrap_or(false) {
        s.driver(me).unwrap().class_est_lap
    } else {
        100.0
    };
    let refs: Vec<f32> = (0..MAX_CARS)
        .map(|i| match s.driver(i) {
            Some(d) if d.class_est_lap > 1.0 => d.class_est_lap,
            _ => fallback,
        })
        .collect();
    for i in 0..MAX_CARS {
        let c = &mut f.cars[i];
        c.est_time = if c.pct >= 0.0 { c.pct * refs[i] } else { 0.0 };
    }
    if need_f2 {
        let leader = (0..MAX_CARS).find(|&i| f.cars[i].position == 1 && f.cars[i].pct >= 0.0);
        let (ll, lp) = leader.map(|i| (f.cars[i].lap_completed as f32, f.cars[i].pct)).unwrap_or((0.0, 0.0));
        for i in 0..MAX_CARS {
            let c = &mut f.cars[i];
            c.f2 = if leader.is_some() && c.pct >= 0.0 && c.position > 0 {
                (((ll + lp) - (c.lap_completed as f32 + c.pct)) * refs[i]).max(0.0)
            } else {
                0.0
            };
        }
    }
    if need_class_pos {
        for i in 0..MAX_CARS {
            let p = f.cars[i].position;
            if p <= 0 {
                f.cars[i].class_position = 0;
                continue;
            }
            let cid = s.driver(i).map(|d| d.class_id).unwrap_or(0);
            let ahead = (0..MAX_CARS)
                .filter(|&j| {
                    let q = f.cars[j].position;
                    q > 0 && q < p && s.driver(j).map(|d| d.class_id).unwrap_or(0) == cid
                })
                .count();
            f.cars[i].class_position = ahead as i32 + 1;
        }
    }
}

/// Sınıf adından kararlı küçük bir kimlik ve renk
pub(crate) fn class_ident(name: &str) -> (i32, String) {
    if name.is_empty() {
        return (0, String::new());
    }
    let mut h: u32 = 2166136261;
    for b in name.bytes() {
        h = (h ^ b as u32).wrapping_mul(16777619);
    }
    const COLORS: [&str; 8] = ["#ffda59", "#33ceff", "#ff5888", "#ae6bff", "#53ff77", "#ff8a3d", "#5d8bff", "#e0e0e0"];
    ((h & 0x7fff_ffff) as i32, COLORS[(h % COLORS.len() as u32) as usize].to_string())
}

/// "ks_nurburgring" -> "Nurburgring", "monza" -> "Monza"
pub(crate) fn pretty(raw: &str) -> String {
    let s = raw.trim();
    let s = s.strip_prefix("ks_").unwrap_or(s);
    s.split(['_', ' '])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Harita anahtarı: sim + pist + düzen
pub(crate) fn map_key(sim: SimKind, s: &SessionData) -> String {
    if s.track_name.is_empty() {
        return String::new();
    }
    format!("{}_{}_{}", sim.id(), s.track_name, s.track_config).to_lowercase()
}

/// Kaynağa özgü araç kimliklerini (slot/ID) 0..64 araç indekslerine kararlı biçimde eşler.
#[derive(Default)]
pub(crate) struct Slots {
    ids: Vec<Option<i64>>,
}

impl Slots {
    pub fn clear(&mut self) {
        self.ids.clear();
    }

    /// Bu karede görülmeyen kimlikleri serbest bırakır
    pub fn retain(&mut self, seen: &[i64]) {
        for s in self.ids.iter_mut() {
            if let Some(id) = *s {
                if !seen.contains(&id) {
                    *s = None;
                }
            }
        }
    }

    pub fn get(&mut self, id: i64) -> Option<usize> {
        if self.ids.len() < MAX_CARS {
            self.ids.resize(MAX_CARS, None);
        }
        if let Some(i) = self.ids.iter().position(|x| *x == Some(id)) {
            return Some(i);
        }
        let free = self.ids.iter().position(|x| x.is_none())?;
        self.ids[free] = Some(id);
        Some(free)
    }
}

/// Oturumun "sürücü listesi imzası": değişince SessionData yeniden kurulur
pub(crate) fn sig(parts: &[&str], nums: &[i64]) -> u64 {
    let mut h: u64 = 1469598103934665603;
    for p in parts {
        for b in p.bytes() {
            h = (h ^ b as u64).wrapping_mul(1099511628211);
        }
        h = (h ^ 0xff).wrapping_mul(1099511628211);
    }
    for n in nums {
        for b in n.to_le_bytes() {
            h = (h ^ b as u64).wrapping_mul(1099511628211);
        }
    }
    h
}

/// Oturum sürücüsünden bağımsız "boş" oturum iskeleti
pub(crate) fn empty_session() -> SessionData {
    SessionData { drivers: vec![None; MAX_CARS], player_idx: -1, max_fuel_pct: 1.0, category: "Road".into(), ..Default::default() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pref_parse() {
        assert_eq!(SimPref::parse("auto"), SimPref::Auto);
        assert_eq!(SimPref::parse("acc"), SimPref::Only(SimKind::Acc));
        assert_eq!(SimPref::parse("?"), SimPref::Auto);
        let v = serde_json::json!({"general": {"sim": "lmu"}});
        assert_eq!(SimPref::from_settings(Some(&v)), SimPref::Only(SimKind::Lmu));
        assert!(SimPref::Auto.accepts(SimKind::Ams2));
        assert!(!SimPref::Only(SimKind::Ac).accepts(SimKind::Acc));
        assert!(SimPref::Only(SimKind::Lmu).accepts(SimKind::Rf2));
    }

    #[test]
    fn strings() {
        let mut b = vec![0u8; 40];
        for (i, c) in "Mönza".encode_utf16().enumerate() {
            b[4 + i * 2..6 + i * 2].copy_from_slice(&c.to_le_bytes());
        }
        assert_eq!(rd_wstr(&b, 4, 15), "Mönza");
        b[20..23].copy_from_slice(b"abc");
        assert_eq!(rd_cstr(&b, 20, 8), "abc");
        assert_eq!(pretty("ks_red_bull_ring"), "Red Bull Ring");
    }

    #[test]
    fn radar_sides() {
        let mut f = Frame::default();
        // sağda yan yana, solda biraz geride, önde 20 m
        fill_radar(&mut f, &[(3.0, 1.0), (-3.2, -2.0), (0.2, 20.0), (0.0, 200.0)], true);
        assert_eq!(f.car_left_right, 4);
        let l = f.demo_side_cars.as_ref().unwrap();
        assert_eq!(l.len(), 3);
        assert!(l.contains(&(1, 1.0)) && l.contains(&(-1, -2.0)) && l.contains(&(0, 20.0)));
        fill_radar(&mut f, &[(3.0, 1.0), (3.5, -3.0)], true);
        assert_eq!(f.car_left_right, 6);
        fill_radar(&mut f, &[], true);
        assert_eq!(f.car_left_right, 1);
        fill_radar(&mut f, &[], false);
        assert_eq!(f.car_left_right, 0);
        assert!(f.demo_side_cars.is_none());
    }

    #[test]
    fn slots_are_stable() {
        let mut s = Slots::default();
        assert_eq!(s.get(500), Some(0));
        assert_eq!(s.get(7), Some(1));
        assert_eq!(s.get(500), Some(0));
        s.retain(&[7]);
        assert_eq!(s.get(9), Some(0));
        assert_eq!(s.get(7), Some(1));
    }

    #[test]
    fn estimates() {
        let mut s = empty_session();
        for i in 0..3 {
            s.drivers[i] = Some(crate::model::Driver { car_idx: i as i32, class_est_lap: 100.0, ..Default::default() });
        }
        let mut f = Frame::default();
        f.player_idx = 1;
        f.cars[0] = crate::model::CarState { position: 1, lap_completed: 5, pct: 0.5, ..f.cars[0] };
        f.cars[1] = crate::model::CarState { position: 2, lap_completed: 5, pct: 0.25, ..f.cars[1] };
        f.cars[2] = crate::model::CarState { position: 3, lap_completed: 4, pct: 0.75, ..f.cars[2] };
        fill_estimates(&mut f, &s, true, true);
        assert!((f.cars[1].est_time - 25.0).abs() < 1e-3);
        assert!((f.cars[1].f2 - 25.0).abs() < 1e-3);
        assert!((f.cars[2].f2 - 75.0).abs() < 1e-3);
        assert_eq!(f.cars[2].class_position, 3);
    }
}
