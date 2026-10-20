//! Ölçülmüş zaman farkı (göreli overlay ve yakın araç farkları).
//!
//! Simin "bu noktaya tahmini varış süresi" (iRacing CarIdxEstTime) bir referans tur profilinden gelir; yavaş
//! bölümlerde (firkete, şikan) araçlar birbirine metre olarak çok yakınken aradaki gerçek süre büyüktür: tahmin
//! 0,2 sn derken gerçekte 2 sn olabilir. Sınıflar arasında da her aracın kendi sınıf profili kullanıldığı için
//! farklar kayar.
//!
//! Burada her aracın pistin her noktasından (turun binde biri) geçtiği oturum zamanı kaydedilir. Fark:
//! - arkamdaki araç: o şu an neredeyse ben oradan ne kadar önce geçtim,
//! - önümdeki araç: o benim şu an bulunduğum yerden ne kadar önce geçti.
//!
//! Kayıt yoksa (yeni bağlanıldı, araç piste yeni çıktı, tekrar sarıldı) çağıran tahmine döner.

use crate::model::{Frame, MAX_CARS};

/// Tur başına işaret sayısı (5 km pistte 5 m)
const N: usize = 1000;

pub struct PassTimes {
    /// araç başına: işaret k (tur yüzdesi k/N) en son hangi oturum zamanında geçildi (< 0: yok)
    t: Vec<Vec<f64>>,
    prev_pct: Vec<f32>,
    prev_t: f64,
    sess: i32,
}

impl Default for PassTimes {
    fn default() -> Self {
        PassTimes {
            t: vec![vec![-1.0; N]; MAX_CARS],
            prev_pct: vec![-1.0; MAX_CARS],
            prev_t: -1.0,
            sess: -1,
        }
    }
}

impl PassTimes {
    fn clear(&mut self) {
        for v in self.t.iter_mut() {
            v.fill(-1.0);
        }
        self.prev_pct.fill(-1.0);
    }

    /// Şu anki oturum zamanı (tekrar izlerken tekrar kafasının zamanı)
    fn now(f: &Frame) -> f64 {
        if crate::calc::replay_watch(f) {
            f.replay_session_time
        } else {
            f.session_time
        }
    }

    pub fn update(&mut self, f: &Frame) {
        let now = Self::now(f);
        let sess = if crate::calc::replay_watch(f) {
            f.replay_session_num
        } else {
            f.session_num
        };
        let dt = now - self.prev_t;
        // Yeni oturum, geri sarma ya da büyük atlama: kayıtlar geçersiz
        if sess != self.sess || self.prev_t < 0.0 || !(0.0..=2.0).contains(&dt) {
            if sess != self.sess || dt < 0.0 || dt > 2.0 {
                self.clear();
            }
            self.sess = sess;
            self.prev_t = now;
            for i in 0..MAX_CARS {
                self.prev_pct[i] = f.cars[i].pct;
            }
            return;
        }
        if dt <= 0.0 {
            return;
        }
        for i in 0..MAX_CARS {
            let pct = f.cars[i].pct;
            let pp = self.prev_pct[i];
            self.prev_pct[i] = pct;
            if pct < 0.0 || pp < 0.0 || pct >= 1.0 || pp >= 1.0 {
                continue;
            }
            // Bu karede katedilen yol (çizgiyi geçerken 1 → 0)
            let mut d = pct - pp;
            if d < -0.5 {
                d += 1.0;
            }
            // Geri gitme / duruş / ışınlanma (çekici, pitten çıkış): işaret konmaz
            if d <= 0.0 || d > 0.05 {
                continue;
            }
            // pp..pp+d arasındaki her işaret için geçiş anı (doğrusal ara değer)
            let a = pp as f64 * N as f64;
            let b = a + d as f64 * N as f64;
            let mut k = a.floor() as i64 + 1;
            while (k as f64) <= b {
                let frac = (k as f64 - a) / (b - a);
                let idx = (k.rem_euclid(N as i64)) as usize;
                self.t[i][idx] = self.prev_t + dt * frac;
                k += 1;
            }
        }
        self.prev_t = now;
    }

    /// `car` aracının `pct` noktasından en son geçtiği an (iki işaret arası ara değer)
    fn passed(&self, car: usize, pct: f32) -> Option<f64> {
        if !(0.0..1.0).contains(&pct) {
            return None;
        }
        let x = pct as f64 * N as f64;
        let k0 = x.floor() as usize % N;
        let k1 = (k0 + 1) % N;
        let (t0, t1) = (self.t[car][k0], self.t[car][k1]);
        if t0 < 0.0 || t1 < 0.0 || t1 < t0 || t1 - t0 > 30.0 {
            return None;
        }
        Some(t0 + (t1 - t0) * (x - x.floor()))
    }

    /// Ölçülmüş fark (sn): + araç önümde, − arkamda. `ahead`: araç pistte önümde mi (tur yüzdesi farkından).
    /// `max`: bundan eski geçiş kullanılmaz (bir tur süresi kadar).
    pub fn gap(&self, f: &Frame, me: usize, car: usize, ahead: bool, max: f64) -> Option<f32> {
        if me >= MAX_CARS || car >= MAX_CARS {
            return None;
        }
        let now = self.prev_t;
        if now < 0.0 {
            return None;
        }
        let (who, at) = if ahead {
            (car, f.cars[me].pct)
        } else {
            (me, f.cars[car].pct)
        };
        let t = self.passed(who, at)?;
        let g = now - t;
        if !(0.0..=max).contains(&g) {
            return None;
        }
        Some(if ahead { g as f32 } else { -g as f32 })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Yavaş bölüm: iki araç aynı hız profilinde, arka araç 2 sn geride. Firketede (çok yavaş) metre farkı küçük,
    /// ölçülen fark yine 2 sn olmalı.
    #[test]
    fn slow_corner_keeps_real_gap() {
        // Tur 100 sn; 0.40–0.45 arası çok yavaş (bu %5'lik bölüm 20 sn sürer), geri kalan hızlı
        let pos = |t: f64| -> f32 {
            let t = t.rem_euclid(100.0);
            let fast = 0.95 / 80.0; // %95 yol 80 sn'de
            let p = if t < 0.40 / fast {
                t * fast
            } else if t < 0.40 / fast + 20.0 {
                0.40 + (t - 0.40 / fast) * (0.05 / 20.0)
            } else {
                0.45 + (t - 0.40 / fast - 20.0) * fast
            };
            p.min(0.999_999) as f32
        };
        let mut f = Frame::default();
        f.player_idx = 0;
        let mut g = PassTimes::default();
        let mut t = 0.0;
        while t < 250.0 {
            f.session_time = t;
            f.cars[0].pct = pos(t); // ben
            f.cars[1].pct = pos(t - 2.0); // 2 sn arkamda
            f.cars[2].pct = pos(t + 1.0); // 1 sn önümde
            g.update(&f);
            t += 1.0 / 60.0;
        }
        // İkisi de firketede: metre olarak çok yakın
        f.session_time = 241.0;
        // Ölçüm anındaki konumlar zaten son karede
        assert!(f.cars[0].pct > 0.40 && f.cars[0].pct < 0.45, "ben firketedeyim");
        let behind = g.gap(&f, 0, 1, false, 150.0).unwrap();
        let ahead = g.gap(&f, 0, 2, true, 150.0).unwrap();
        assert!((behind + 2.0).abs() < 0.05, "arkadaki {behind}");
        assert!((ahead - 1.0).abs() < 0.05, "öndeki {ahead}");
        // Doğrusal tahmin (yüzde farkı × tur) burada çok küçük çıkardı
        let lin = (f.cars[0].pct - f.cars[1].pct) * 100.0;
        assert!(lin < 0.5, "doğrusal tahmin {lin}");
    }

    #[test]
    fn rewind_clears() {
        let mut f = Frame::default();
        let mut g = PassTimes::default();
        for k in 0..600 {
            f.session_time = k as f64 / 60.0;
            f.cars[0].pct = k as f32 / 6000.0;
            f.cars[1].pct = (k as f32 - 60.0).max(0.0) / 6000.0;
            g.update(&f);
        }
        assert!(g.gap(&f, 0, 1, false, 100.0).is_some());
        // Geri sarma
        f.session_time = 1.0;
        g.update(&f);
        assert!(g.gap(&f, 0, 1, false, 100.0).is_none());
    }
}
