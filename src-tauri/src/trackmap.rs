//! Pist haritası kaydı.
//!
//! iRacing canlı telemetride pist şekli vermez. Oyuncunun temiz bir turu boyunca
//! aracın yönü (YawNorth) ve hızı birleştirilerek pist çizgisi çıkarılır (ölü hesap),
//! tur sonunda biriken sapma kapanış hatası tur boyunca dağıtılarak düzeltilir.
//! Sonuç pist ve düzen başına diske kaydedilir; bir kez kaydedilen pist bir daha
//! kaydedilmez. Şekil tur yüzdesine (LapDistPct) göre eşit aralıklı noktalardır.

use crate::model::Frame;
use std::path::PathBuf;

pub const BINS: usize = 400;

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
        self.version += 1;
    }

    /// Kaydedilmiş haritayı sil (yeniden kaydetmek için).
    pub fn forget(&mut self) {
        if let Some(p) = self.file() {
            let _ = std::fs::remove_file(p);
        }
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
        if self.shape.is_some() || self.key.is_empty() {
            return;
        }
        let pct = f.lap_dist_pct;
        let t = f.session_time;
        let dt = (t - self.last_t).clamp(0.0, 0.2);
        self.last_t = t;

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
}
