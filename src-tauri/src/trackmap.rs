//! Pist haritası kaydı.
//!
//! iRacing canlı telemetride pist şekli vermez. Oyuncunun temiz bir turu boyunca
//! aracın yönü (YawNorth) ve hızı birleştirilerek pist çizgisi çıkarılır (ölü hesap),
//! tur sonunda biriken sapma kapanış hatası tur boyunca dağıtılarak düzeltilir.
//! Sonuç pist ve düzen başına diske kaydedilir; bir kez kaydedilen pist bir daha
//! kaydedilmez. Şekil tur yüzdesine (LapDistPct) göre eşit aralıklı noktalardır.
//!
//! Pit yolu: hiçbir oyun pit yolunun şeklini vermez. Araçların "pit yolunda" bayrağının
//! açıldığı / kapandığı tur yüzdeleri (tüm araçlardan) toplanır; ortancası pit girişi ve
//! çıkışıdır. Oyuncu pit yolundan geçerken ölü hesapla pist çizgisinin hangi yanında
//! kaldığı (sol / sağ) ve durduğu yer (pit kutusu) da öğrenilir. Giriş / çıkış / yan
//! pist başına diske yazılır (`<pist>.pit.json`).

use crate::model::{Frame, MAX_CARS};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const BINS: usize = 400;
/// Giriş / çıkış için saklanan en fazla örnek
const PIT_SAMPLES: usize = 25;

/// Haritaya gönderilen pit yolu bilgisi (tur yüzdeleri).
#[derive(Serialize, Clone, Copy, Default, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PitLane {
    pub entry: f32,
    pub exit: f32,
    /// Gidiş yönüne göre: 1 sol, -1 sağ, 0 bilinmiyor
    pub side: i8,
    /// Oyuncunun pit kutusu (bilinmiyorsa -1)
    pub stall: f32,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct PitStore {
    #[serde(default)]
    entries: Vec<f32>,
    #[serde(default)]
    exits: Vec<f32>,
    #[serde(default)]
    side: i8,
}

/// -0.5..0.5 aralığına sarılmış tur yüzdesi farkı
fn wrap(d: f32) -> f32 {
    let d = d.rem_euclid(1.0);
    if d > 0.5 {
        d - 1.0
    } else {
        d
    }
}

/// Başlangıç çizgisini saran örneklerde de doğru çalışan ortanca
fn circ_median(v: &[f32]) -> Option<f32> {
    let r = *v.first()?;
    let mut d: Vec<f32> = v.iter().map(|x| wrap(x - r)).collect();
    d.sort_by(|a, b| a.total_cmp(b));
    Some((r + d[d.len() / 2]).rem_euclid(1.0))
}

pub struct TrackMap {
    dir: Option<PathBuf>,
    key: String,
    bins: Vec<Option<[f32; 2]>>,
    x: f64,
    y: f64,
    last_pct: f32,
    last_t: f64,
    lap_ok: bool,
    pub shape: Option<Vec<[f32; 2]>>,
    pub version: u32,
    // --- pit yolu öğrenme ---
    store: PitStore,
    demo_pit: Option<PitLane>,
    prev: Vec<(f32, bool)>,
    stall: f32,
    /// Oyuncunun pit yolundaki ölü hesap konumu ve pist çizgisine yanal uzaklık toplamı
    pit_pos: Option<(f64, f64)>,
    lat_sum: f64,
    lat_n: u32,
}

impl TrackMap {
    pub fn new(dir: Option<PathBuf>) -> TrackMap {
        TrackMap {
            dir,
            key: String::new(),
            bins: vec![None; BINS],
            x: 0.0,
            y: 0.0,
            last_pct: -1.0,
            last_t: 0.0,
            lap_ok: false,
            shape: None,
            version: 0,
            store: PitStore::default(),
            demo_pit: None,
            prev: vec![(-1.0, false); MAX_CARS],
            stall: -1.0,
            pit_pos: None,
            lat_sum: 0.0,
            lat_n: 0,
        }
    }

    fn pit_file(&self) -> Option<PathBuf> {
        self.file().map(|p| p.with_extension("pit.json"))
    }

    fn reset_pit(&mut self) {
        self.store = PitStore::default();
        self.demo_pit = None;
        self.prev.iter_mut().for_each(|p| *p = (-1.0, false));
        self.stall = -1.0;
        self.pit_pos = None;
        self.lat_sum = 0.0;
        self.lat_n = 0;
    }

    fn save_pit(&self) {
        if let Some(path) = self.pit_file() {
            if let Some(dir) = path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(text) = serde_json::to_string(&self.store) {
                let _ = std::fs::write(path, text);
            }
        }
    }

    /// Öğrenilmiş pit yolu; giriş ve çıkış bilinmiyorsa ya da anlamsızsa None.
    pub fn pit(&self) -> Option<PitLane> {
        if self.demo_pit.is_some() {
            return self.demo_pit;
        }
        let entry = circ_median(&self.store.entries)?;
        let exit = circ_median(&self.store.exits)?;
        let len = (exit - entry).rem_euclid(1.0);
        if !(0.005..0.5).contains(&len) {
            return None;
        }
        Some(PitLane { entry, exit, side: self.store.side, stall: self.stall })
    }

    /// Şekil üzerindeki nokta ve birim teğet (tur yüzdesine göre)
    fn shape_at(&self, pct: f32) -> Option<([f64; 2], [f64; 2])> {
        let s = self.shape.as_ref()?;
        let n = s.len();
        let i = ((pct.rem_euclid(1.0) * n as f32) as usize).min(n - 1);
        let a = s[i];
        let b = s[(i + 2) % n];
        let (dx, dy) = ((b[0] - a[0]) as f64, (b[1] - a[1]) as f64);
        let l = (dx * dx + dy * dy).sqrt();
        if l < 1e-6 {
            return None;
        }
        Some(([a[0] as f64, a[1] as f64], [dx / l, dy / l]))
    }

    fn learn_pit(&mut self, f: &Frame, dt: f64) {
        if f.replay {
            return;
        }
        let mut changed = false;
        let me = f.player_idx;
        for i in 0..MAX_CARS {
            let c = &f.cars[i];
            let (pp, was) = self.prev[i];
            self.prev[i] = (c.pct, c.on_pit);
            // Işınlanma / garaja dönüş değil, gerçekten sürerek geçiş olmalı
            if pp < 0.0 || c.pct < 0.0 || c.on_pit == was || wrap(c.pct - pp).abs() > 0.02 {
                continue;
            }
            let list = if c.on_pit { &mut self.store.entries } else { &mut self.store.exits };
            if list.len() >= PIT_SAMPLES {
                list.remove(0);
            }
            list.push(c.pct);
            changed = true;
            if i as i32 == me && c.on_pit {
                // Oyuncu pite girdi: yan tarafı ölçmek için pist çizgisinden başla
                self.pit_pos = self.shape_at(c.pct).map(|(p, _)| (p[0], p[1]));
                self.lat_sum = 0.0;
                self.lat_n = 0;
            }
        }
        // Oyuncu: pit kutusu ve pit yolunun pistin hangi yanında olduğu
        if f.on_pit_road && f.lap_dist_pct >= 0.0 {
            if f.speed.abs() < 0.3 && (f.is_on_track || (f.is_in_garage && f.lap_dist_pct > 0.0)) {
                self.stall = f.lap_dist_pct;
            }
            if let Some((x, y)) = self.pit_pos {
                let h = f.yaw_north as f64;
                let (v, lat) = (f.vel_x as f64, f.vel_y as f64);
                let nx = x + (v * h.sin() - lat * h.cos()) * dt;
                let ny = y + (v * h.cos() + lat * h.sin()) * dt;
                self.pit_pos = Some((nx, ny));
                if let Some((p, t)) = self.shape_at(f.lap_dist_pct) {
                    // Sol normal (-ty, tx) üzerindeki izdüşüm: + sol, - sağ
                    self.lat_sum += (nx - p[0]) * -t[1] + (ny - p[1]) * t[0];
                    self.lat_n += 1;
                }
            }
        } else if self.pit_pos.take().is_some() && self.lat_n > 120 {
            let mean = self.lat_sum / self.lat_n as f64;
            if mean.abs() > 4.0 {
                let side = if mean > 0.0 { 1 } else { -1 };
                if side != self.store.side {
                    self.store.side = side;
                    changed = true;
                }
            }
        }
        if changed {
            self.save_pit();
        }
    }

    fn file(&self) -> Option<PathBuf> {
        let safe: String = self.key.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).collect();
        self.dir.as_ref().map(|d| d.join("tracks").join(format!("{safe}.json")))
    }

    /// Pist değişince çağrılır: kayıtlı şekil varsa yüklenir.
    pub fn set_track(&mut self, key: &str) {
        if key == self.key {
            return;
        }
        self.key = key.to_string();
        self.reset_lap();
        self.reset_pit();
        if let Some(text) = self.pit_file().and_then(|p| std::fs::read_to_string(p).ok()) {
            if let Ok(v) = serde_json::from_str::<PitStore>(&text) {
                self.store = v;
            }
        }
        self.shape = None;
        if let Some(p) = self.file() {
            if let Ok(text) = std::fs::read_to_string(p) {
                if let Ok(v) = serde_json::from_str::<Vec<[f32; 2]>>(&text) {
                    if v.len() >= 50 {
                        self.shape = Some(v);
                    }
                }
            }
        }
        self.version += 1;
    }

    /// Hazır şekil ver (demo pisti).
    pub fn set_shape(&mut self, key: &str, shape: Vec<[f32; 2]>) {
        self.key = key.to_string();
        self.shape = Some(shape);
        self.reset_pit();
        if key == "demo" {
            // Demo araçları çizgiyi geçince pite girer: pit yolu çizgiyi sarar
            self.demo_pit = Some(PitLane { entry: 0.93, exit: 0.07, side: 0, stall: 0.0 });
        }
        self.version += 1;
    }

    /// Kaydedilmiş haritayı sil (yeniden kaydetmek için).
    pub fn forget(&mut self) {
        if let Some(p) = self.file() {
            let _ = std::fs::remove_file(p);
        }
        if let Some(p) = self.pit_file() {
            let _ = std::fs::remove_file(p);
        }
        self.reset_pit();
        self.shape = None;
        self.reset_lap();
        self.version += 1;
    }

    fn reset_lap(&mut self) {
        self.bins.iter_mut().for_each(|b| *b = None);
        self.x = 0.0;
        self.y = 0.0;
        self.lap_ok = false;
        self.last_pct = -1.0;
    }

    /// Bu turdaki kayıt ilerlemesi (0..1). Harita hazırsa 1.
    pub fn progress(&self) -> f32 {
        if self.shape.is_some() {
            return 1.0;
        }
        if !self.lap_ok {
            return 0.0;
        }
        self.bins.iter().filter(|b| b.is_some()).count() as f32 / BINS as f32
    }

    pub fn recording(&self) -> bool {
        self.shape.is_none() && self.lap_ok
    }

    pub fn update(&mut self, f: &Frame) {
        if self.key.is_empty() {
            return;
        }
        let pct = f.lap_dist_pct;
        let t = f.session_time;
        let dt = (t - self.last_t).clamp(0.0, 0.2);
        self.last_t = t;
        self.learn_pit(f, dt);
        if self.shape.is_some() {
            return;
        }

        // Tur başlangıcı: çizgiyi geçti
        if self.last_pct > 0.9 && pct < 0.1 {
            if self.lap_ok && self.progress() > 0.95 {
                self.finish();
                return;
            }
            self.reset_lap();
            self.lap_ok = f.is_on_track && !f.on_pit_road;
        }
        self.last_pct = pct;
        if !self.lap_ok {
            return;
        }
        // Pit yolu, pist dışı ya da tekrar izleme turu bozar
        if f.on_pit_road || !f.is_on_track || f.replay {
            self.lap_ok = false;
            return;
        }
        let h = f.yaw_north as f64;
        let v = f.vel_x as f64;
        let lat = f.vel_y as f64;
        // x doğu, y kuzey
        self.x += (v * h.sin() - lat * h.cos()) * dt;
        self.y += (v * h.cos() + lat * h.sin()) * dt;
        let bin = ((pct * BINS as f32) as usize).min(BINS - 1);
        if self.bins[bin].is_none() {
            self.bins[bin] = Some([self.x as f32, self.y as f32]);
        }
    }

    fn finish(&mut self) {
        // Boşlukları doğrusal doldur
        let mut pts: Vec<[f32; 2]> = Vec::with_capacity(BINS);
        let known: Vec<(usize, [f32; 2])> = self.bins.iter().enumerate().filter_map(|(i, b)| b.map(|p| (i, p))).collect();
        if known.len() < 50 {
            self.reset_lap();
            return;
        }
        for i in 0..BINS {
            if let Some(p) = self.bins[i] {
                pts.push(p);
                continue;
            }
            let prev = known.iter().rev().find(|k| k.0 < i).or(known.last()).unwrap();
            let next = known.iter().find(|k| k.0 > i).or(known.first()).unwrap();
            let span = ((next.0 + BINS - prev.0) % BINS).max(1) as f32;
            let k = ((i + BINS - prev.0) % BINS) as f32 / span;
            pts.push([prev.1[0] + (next.1[0] - prev.1[0]) * k, prev.1[1] + (next.1[1] - prev.1[1]) * k]);
        }
        // Kapanış hatasını tur boyunca dağıt: son nokta ilk noktaya bağlanmalı
        let first = pts[0];
        let last = pts[BINS - 1];
        let step = [(last[0] - first[0]), (last[1] - first[1])];
        for (i, p) in pts.iter_mut().enumerate() {
            let k = i as f32 / BINS as f32;
            p[0] -= step[0] * k;
            p[1] -= step[1] * k;
        }
        if let Some(path) = self.file() {
            if let Some(dir) = path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(text) = serde_json::to_string(&pts) {
                let _ = std::fs::write(path, text);
            }
        }
        self.shape = Some(pts);
        self.version += 1;
    }
}

/// Demo için yapay pist: birkaç harmonikten oluşan kapalı eğri.
pub fn demo_shape() -> Vec<[f32; 2]> {
    let mut v = Vec::with_capacity(BINS);
    for i in 0..BINS {
        let a = i as f32 / BINS as f32 * std::f32::consts::TAU;
        let r = 1.0 + 0.28 * (2.0 * a + 0.6).sin() + 0.12 * (3.0 * a + 1.9).cos() + 0.06 * (5.0 * a).sin();
        v.push([r * a.cos() * 420.0, r * a.sin() * 300.0]);
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Frame;

    #[test]
    fn records_a_circle() {
        let mut m = TrackMap::new(None);
        m.set_track("test");
        let mut f = Frame::default();
        f.is_on_track = true;
        let lap_t = 60.0f64;
        let dt = 1.0 / 60.0;
        let v = 2.0 * std::f64::consts::PI * 300.0 / lap_t; // 300 m yarıçaplı daire
        let mut t = 0.0;
        // 2.2 tur sür
        while t < lap_t * 2.2 {
            let pct = ((t / lap_t) % 1.0) as f32;
            f.session_time = t;
            f.lap_dist_pct = pct;
            f.yaw_north = (pct as f64 * std::f64::consts::TAU) as f32;
            f.vel_x = v as f32;
            m.update(&f);
            t += dt;
        }
        let s = m.shape.as_ref().expect("harita oluşmalı");
        assert_eq!(s.len(), BINS);
        // Kapalı eğri: ilk ve son nokta yakın
        let d = ((s[0][0] - s[BINS - 1][0]).powi(2) + (s[0][1] - s[BINS - 1][1]).powi(2)).sqrt();
        assert!(d < 20.0, "kapanış {d}");
    }

    #[test]
    fn learns_pit_lane() {
        let mut m = TrackMap::new(None);
        m.set_track("test");
        // Saat yönünün tersine 300 m yarıçaplı daire: içerisi solda
        let shape: Vec<[f32; 2]> = (0..BINS)
            .map(|i| {
                let a = i as f32 / BINS as f32 * std::f32::consts::TAU;
                [300.0 * a.cos(), 300.0 * a.sin()]
            })
            .collect();
        m.shape = Some(shape);
        assert!(m.pit().is_none());
        let mut f = Frame::default();
        f.is_on_track = true;
        f.player_idx = 0;
        let dt = 1.0 / 60.0;
        let lap_t = 60.0f64;
        let mut t = 0.0f64;
        // 0.90'dan 0.10'a sür; 0.95..0.05 arası pit yolu, pistin 20 m içinde (solda)
        let mut p = 0.90f64;
        while p < 1.10 {
            let pct = (p % 1.0) as f32;
            let on = (0.95..1.05).contains(&p);
            // Pit yoluna girince 2 sn boyunca 10 m/s sola kay (20 m içeri)
            f.vel_y = if (0.95..0.95 + 2.0 / lap_t).contains(&p) { 10.0 } else { 0.0 };
            let r = 300.0;
            f.session_time = t;
            f.lap_dist_pct = pct;
            f.on_pit_road = on;
            f.cars[0].pct = pct;
            f.cars[0].on_pit = on;
            // Daire üzerinde saat yönünün tersine: yön açısı (kuzeyden saat yönünde) = -a
            f.yaw_north = -(p * std::f64::consts::TAU) as f32;
            f.vel_x = (std::f64::consts::TAU * r / lap_t) as f32;
            f.speed = f.vel_x;
            m.update(&f);
            p += dt / lap_t;
            t += dt;
        }
        let pit = m.pit().expect("pit yolu öğrenilmeli");
        assert!((pit.entry - 0.95).abs() < 0.005, "giriş {}", pit.entry);
        assert!((pit.exit - 0.05).abs() < 0.005, "çıkış {}", pit.exit);
        assert_eq!(pit.side, 1);
        // Işınlanma örnek sayılmaz
        f.cars[1].pct = 0.5;
        m.update(&f);
        f.cars[1].pct = 0.0;
        f.cars[1].on_pit = true;
        m.update(&f);
        assert_eq!(m.store.entries.len(), 1);
    }

    #[test]
    fn median_wraps() {
        let m = circ_median(&[0.99, 0.01, 0.98, 0.02, 0.0]).unwrap();
        assert!(wrap(m).abs() < 0.011, "{m}");
    }
}
