//! Sektör süreleri ve tur bazlı fark geçmişi (overlay'ler: sectors, gapchart, target).
//!
//! Her araç için başlangıç/bitiş çizgisi ve sektör sınırı geçişlerinin oturum zamanı tutulur:
//!  - `sectors` konusu: oyuncunun güncel / son / en iyi sektörleri, sınıfın en iyi sektörleri, teorik en iyi tur.
//!  - `gaps` konusu: oyuncunun her çizgi geçişinde diğer araçlara olan süre farkı (tur başına bir örnek),
//!    anlık fark ve pit girişleri.
//!
//! Sektör sınırları (öncelik sırasıyla):
//!  1. Sim sektör numarası veriyorsa (`CarState::sector`; ACC/AC, LMU/rF2, AMS2): numara değişince sınır geçilmiştir.
//!  2. Oturum bilgisinde sektör başlangıçları varsa (`SessionData::sector_starts`; iRacing SplitTimeInfo): tur yüzdesi.
//!  3. Hiçbiri yoksa tur üç eşit mesafeye bölünür (`official = false`).
//!
//! Süreler uygulamanın kendi ölçümüdür (kare aralığında ara değerle); simin resmi süresinden birkaç
//! milisaniye sapabilir.

use crate::model::{Frame, SessionData, MAX_CARS};
use serde::Serialize;
use std::collections::VecDeque;

/// En fazla sektör sayısı (iRacing'de uzun pistlerde 3'ten fazla olabilir)
pub const MAX_SECTORS: usize = 12;
/// Araç başına saklanan çizgi geçişi
const CROSS_KEEP: usize = 48;
/// `gaps` konusunda gönderilen en fazla tur örneği
pub const GAP_LAPS: usize = 41;
const PIT_KEEP: usize = 16;

#[derive(Clone, Default)]
struct CarT {
    seen: bool,
    lapc: i32,
    last_pct: f32,
    token: u8,
    /// Güncel tur çizgide başladı (sektörleri ölçülebilir)
    full: bool,
    lap_start: f64,
    sec_start: f64,
    /// Güncel sektörde pist dışı / pit / geçersiz tur: en iyiye sayılmaz
    dirty: bool,
    cur: Vec<f32>,
    last: Vec<f32>,
    best: Vec<f32>,
    /// Tur başlarkenki en iyi sektörler (fark hesabının referansı)
    best_prev: Vec<f32>,
    /// (geçişten sonraki tamamlanan tur sayısı, oturum zamanı)
    cross: VecDeque<(i32, f64)>,
    /// Pit yoluna giriş zamanları
    pits: VecDeque<f64>,
    on_pit: bool,
}

impl CarT {
    fn clear_sectors(&mut self) {
        self.full = false;
        self.cur.clear();
        self.last.clear();
        self.best.clear();
        self.best_prev.clear();
    }

    /// Bir sektör bitti (`t` anında)
    fn push_sector(&mut self, t: f64, off: bool) {
        let st = (t - self.sec_start) as f32;
        let j = self.cur.len();
        self.cur.push(st);
        if !self.dirty && st > 0.5 {
            if self.best.len() <= j {
                self.best.resize(j + 1, 0.0);
            }
            if self.best[j] <= 0.0 || st < self.best[j] {
                self.best[j] = st;
            }
        }
        self.sec_start = t;
        self.dirty = off;
    }
}

#[derive(Default)]
pub struct Timing {
    seen: bool,
    session_num: i32,
    track: String,
    demo: bool,
    prev_time: f64,
    n: usize,
    /// Sektör sınırları (tur yüzdesi), `n - 1` adet; sim numarası kipinde oyuncudan öğrenilir (0 = henüz bilinmiyor)
    bounds: Vec<f32>,
    official: bool,
    token_mode: bool,
    /// Sim sektör numarası veriyor görünüyor ama tur boyunca hiç değişmedi: yüzde / eşit parça kipine dönülür
    token_dead: bool,
    cars: Vec<CarT>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Sectors {
    /// Sektör sayısı
    pub n: usize,
    /// Simin resmi sektörleri (false: üç eşit mesafe)
    pub official: bool,
    /// Sektör sınırları (tur yüzdesi 0..1), n - 1 adet; 0 = henüz bilinmiyor
    pub bounds: Vec<f32>,
    pub lap: i32,
    pub lap_pct: f32,
    /// İçinde bulunulan sektör (0 tabanlı)
    pub sector: usize,
    /// Güncel sektörde / turda geçen süre (sn); tur çizgide başlamadıysa -1
    pub sector_time: f32,
    pub lap_time: f32,
    /// Güncel turun tamamlanan sektörleri
    pub current: Vec<f32>,
    /// Son tamamlanan turun sektörleri (yoksa boş)
    pub last: Vec<f32>,
    /// Kişisel en iyi sektörler (0 = yok)
    pub best: Vec<f32>,
    /// Tur başlarkenki kişisel en iyiler (fark referansı)
    pub best_prev: Vec<f32>,
    /// Sınıfın en iyi sektörleri (oyuncu dahil; 0 = yok) ve kimin (araç numarası)
    pub class_best: Vec<f32>,
    pub class_best_no: Vec<String>,
    /// En iyi sektörlerin toplamı (teorik en iyi tur; eksikse 0)
    pub optimal: f32,
    pub class_optimal: f32,
    pub best_lap: f32,
    pub last_lap: f32,
    pub on_pit_road: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct GapCar {
    pub idx: i32,
    /// Anlık fark (sn): + araç önümde, − arkamda; bilinmiyorsa null
    pub live: Option<f32>,
    /// `Gaps::laps` ile aynı sırada, çizgi geçişindeki fark (sn): + önümde, − arkamda; örnek yoksa null
    pub hist: Vec<Option<f32>>,
    /// Pit girişleri: `laps` içindeki örnek sırası (laps.len() = henüz bitmemiş güncel tur)
    pub pits: Vec<usize>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Gaps {
    pub race: bool,
    /// Oyuncunun tamamladığı tur
    pub lap: i32,
    /// Örneklerin tur numaraları (oyuncunun çizgi geçişleri, eskiden yeniye)
    pub laps: Vec<i32>,
    /// Oyuncunun pit girişleri (`laps` sırası)
    pub my_pits: Vec<usize>,
    pub cars: Vec<GapCar>,
}

fn pad(v: &[f32], n: usize) -> Vec<f32> {
    let mut o: Vec<f32> = v.iter().copied().take(n).collect();
    o.resize(n, 0.0);
    o
}

impl Timing {
    fn clear(&mut self, f: &Frame, s: &SessionData, demo: bool) {
        *self = Timing {
            seen: true,
            session_num: f.session_num,
            track: s.track_name.clone(),
            demo,
            prev_time: f.session_time,
            n: 3,
            bounds: vec![1.0 / 3.0, 2.0 / 3.0],
            cars: vec![CarT::default(); MAX_CARS],
            ..Default::default()
        };
        self.layout(f, s);
        if demo {
            self.seed_demo(f, s);
        }
    }

    /// Sektör düzeni: sim numarası > oturum bilgisindeki sınırlar > üç eşit parça
    fn layout(&mut self, f: &Frame, s: &SessionData) {
        let me = f.player_idx;
        let token = !self.token_dead && me >= 0 && (me as usize) < MAX_CARS && f.cars[me as usize].sector != 0;
        if token {
            if !self.token_mode {
                self.token_mode = true;
                self.official = true;
                self.n = 3;
                self.bounds = vec![0.0; 2];
                self.cars.iter_mut().for_each(CarT::clear_sectors);
            }
            return;
        }
        // Sim numarası bir kez görüldüyse (ör. garajda 0 olsa da) o kipte kalınır
        if self.token_mode && !self.token_dead {
            return;
        }
        self.token_mode = false;
        let mut b: Vec<f32> = Vec::new();
        for &x in s.sector_starts.iter() {
            if x > 0.005 && x < 0.995 && b.last().map(|l| x > *l + 0.005).unwrap_or(true) && b.len() < MAX_SECTORS - 1 {
                b.push(x);
            }
        }
        let official = !b.is_empty();
        if !official {
            b = vec![1.0 / 3.0, 2.0 / 3.0];
        }
        if b != self.bounds || official != self.official {
            self.n = b.len() + 1;
            self.bounds = b;
            self.official = official;
            self.cars.iter_mut().for_each(CarT::clear_sectors);
        }
    }

    /// Demo / önizleme: overlay'ler boş başlamasın diye geçmiş turlar ve sektörler uydurulur
    fn seed_demo(&mut self, f: &Frame, s: &SessionData) {
        let now = f.session_time;
        let ref_lap = crate::calc::ref_lap_time(f, s) as f64;
        let n = self.n;
        let mut w: Vec<f64> = Vec::with_capacity(n);
        let mut prev = 0.0f32;
        for j in 0..n {
            let b = if j + 1 < n { self.bounds[j] } else { 1.0 };
            w.push((b - prev) as f64);
            prev = b;
        }
        for i in 0..MAX_CARS {
            let c = &f.cars[i];
            if c.pct < 0.0 {
                continue;
            }
            let is_me = i as i32 == f.player_idx;
            let lb = if c.best > 1.0 { c.best as f64 } else if c.last > 1.0 { c.last as f64 } else { ref_lap };
            let ll = if c.last > 1.0 { c.last as f64 } else { lb * 1.004 };
            let ct = &mut self.cars[i];
            let t0 = now - c.pct as f64 * lb;
            // Çizgi geçişleri
            let mut t = t0;
            for k in 0..18 {
                let lap = c.lap_completed - k;
                if lap < 1 {
                    break;
                }
                ct.cross.push_front((lap, t));
                let mut lt = lb * (1.003 + 0.004 * ((i as f64) * 1.7 + (lap as f64) * 0.9).sin());
                if !is_me && i % 6 == 3 && k == 5 {
                    lt += 27.0;
                    ct.pits.push_front(t - 40.0);
                }
                t -= lt;
            }
            // Sektörler
            ct.best = (0..n).map(|j| (lb * w[j] * (1.0 - 0.003 * (((i * 7 + j * 3) % 5) as f64) / 4.0)) as f32).collect();
            ct.last = (0..n).map(|j| (ll * w[j] * (1.0 + 0.004 * ((i as f64) + (j as f64) * 2.1).sin())) as f32).collect();
            ct.best_prev = ct.best.clone();
            ct.seen = true;
            ct.lapc = c.lap_completed;
            ct.last_pct = c.pct;
            ct.token = c.sector;
            ct.on_pit = c.on_pit;
            ct.full = c.lap_completed >= 1;
            ct.lap_start = t0;
            ct.sec_start = t0;
            for j in 0..n.saturating_sub(1) {
                if c.pct >= self.bounds[j] && self.bounds[j] > 0.0 {
                    let st = lb * w[j] * (1.0 + 0.004 * ((i as f64) * 0.7 + (j as f64) * 1.3).sin());
                    ct.cur.push(st as f32);
                    ct.sec_start += st;
                }
            }
            if ct.sec_start > now {
                ct.sec_start = now;
            }
        }
    }

    /// Her yeni karede çağrılır
    pub fn update(&mut self, f: &Frame, s: &SessionData, demo: bool) {
        if !self.seen
            || f.session_num != self.session_num
            || demo != self.demo
            || s.track_name != self.track
            || f.session_time + 5.0 < self.prev_time
            || self.cars.len() != MAX_CARS
        {
            self.clear(f, s, demo);
            return;
        }
        self.layout(f, s);
        let now = f.session_time;
        let prev = self.prev_time;
        if now <= prev {
            return;
        }
        self.prev_time = now;
        let me = f.player_idx;
        let ref_lap = crate::calc::ref_lap_time(f, s) as f64;
        let n = self.n;
        let token_mode = self.token_mode;
        let mut bounds = std::mem::take(&mut self.bounds);
        let mut new_n = 0usize;
        let mut token_dead = false;
        for i in 0..MAX_CARS {
            let c = &f.cars[i];
            let ct = &mut self.cars[i];
            if c.pct < 0.0 {
                ct.seen = false;
                ct.full = false;
                continue;
            }
            let is_me = i as i32 == me;
            let off = c.surface == 0 || c.on_pit || (is_me && f.lap_invalid);
            if !ct.seen {
                ct.seen = true;
                ct.lapc = c.lap_completed;
                ct.last_pct = c.pct;
                ct.token = c.sector;
                ct.full = false;
                ct.cur.clear();
                ct.on_pit = c.on_pit;
                continue;
            }
            if c.on_pit && !ct.on_pit {
                ct.pits.push_back(now);
                if ct.pits.len() > PIT_KEEP {
                    ct.pits.pop_front();
                }
            }
            ct.on_pit = c.on_pit;
            if off {
                ct.dirty = true;
            }
            if c.lap_completed != ct.lapc {
                let mut t = now;
                if c.lap_completed == ct.lapc + 1 {
                    // Çizgi iki kare arasında geçildi: tur yüzdesinden geriye doğru tahmin
                    if c.pct < 0.05 {
                        let lt = if c.last > 1.0 { c.last as f64 } else { ref_lap };
                        t -= (c.pct as f64 * lt).min(now - prev).max(0.0);
                    }
                    if ct.full {
                        let count = ct.cur.len() + 1;
                        if token_mode && is_me && count != n && (2..=MAX_SECTORS).contains(&count) {
                            new_n = count;
                        }
                        if token_mode && is_me && count == 1 {
                            token_dead = true;
                        }
                        if count == n {
                            ct.push_sector(t, off);
                            std::mem::swap(&mut ct.last, &mut ct.cur);
                        }
                    }
                    ct.cross.push_back((c.lap_completed, t));
                    if ct.cross.len() > CROSS_KEEP {
                        ct.cross.pop_front();
                    }
                    ct.full = true;
                } else {
                    ct.full = false;
                }
                ct.lapc = c.lap_completed;
                ct.lap_start = t;
                ct.sec_start = t;
                ct.cur.clear();
                ct.dirty = off;
                ct.best_prev.clear();
                ct.best_prev.extend_from_slice(&ct.best);
            } else if ct.full {
                if token_mode {
                    if c.sector != 0 && ct.token != 0 && c.sector != ct.token {
                        // Tur dönüşündeki numara değişimi sınır değildir (tur sayacı ayrıca işlenir)
                        if c.pct < 0.985 && now - ct.lap_start > 1.0 && ct.cur.len() + 1 < MAX_SECTORS {
                            let j = ct.cur.len();
                            ct.push_sector(now, off);
                            if is_me {
                                if bounds.len() <= j {
                                    bounds.resize(j + 1, 0.0);
                                }
                                bounds[j] = c.pct;
                            }
                        }
                    }
                } else if ct.cur.len() + 1 < n {
                    let b = bounds[ct.cur.len()];
                    if c.pct >= b && ct.last_pct < b && c.pct - ct.last_pct < 0.5 {
                        let fr = ((b - ct.last_pct) / (c.pct - ct.last_pct).max(1e-6)).clamp(0.0, 1.0) as f64;
                        ct.push_sector(prev + fr * (now - prev), off);
                    }
                }
            }
            if c.sector != 0 {
                ct.token = c.sector;
            }
            ct.last_pct = c.pct;
        }
        self.bounds = bounds;
        if token_dead {
            self.token_dead = true;
            self.bounds.clear();
            self.layout(f, s);
        } else if new_n != 0 {
            // Sim numarası kipinde sektör sayısı oyuncunun ilk tam turunda öğrenilir
            self.n = new_n;
            self.bounds.resize(new_n - 1, 0.0);
            self.cars.iter_mut().for_each(CarT::clear_sectors);
        }
    }

    pub fn sectors(&self, f: &Frame, s: &SessionData) -> Sectors {
        let n = self.n.max(1);
        let mut out = Sectors {
            n,
            official: self.official,
            bounds: pad(&self.bounds, n - 1),
            lap: f.lap,
            lap_pct: f.lap_dist_pct,
            sector_time: -1.0,
            lap_time: f.lap_cur,
            best: vec![0.0; n],
            best_prev: vec![0.0; n],
            class_best: vec![0.0; n],
            class_best_no: vec![String::new(); n],
            best_lap: f.lap_best,
            last_lap: f.lap_last,
            on_pit_road: f.on_pit_road,
            ..Default::default()
        };
        let me = f.player_idx;
        if me < 0 || me as usize >= MAX_CARS || self.cars.len() != MAX_CARS {
            return out;
        }
        let me = me as usize;
        let ct = &self.cars[me];
        let pct = f.lap_dist_pct;
        out.sector = out.bounds.iter().filter(|b| **b > 0.0 && pct >= **b).count().min(n - 1);
        if ct.full {
            out.current = ct.cur.iter().copied().take(n).collect();
            out.sector = out.current.len().min(n - 1);
            out.sector_time = (f.session_time - ct.sec_start).max(0.0) as f32;
            out.lap_time = (f.session_time - ct.lap_start).max(0.0) as f32;
        }
        if ct.last.len() == n {
            out.last = ct.last.clone();
        }
        out.best = pad(&ct.best, n);
        out.best_prev = pad(&ct.best_prev, n);
        if out.best.iter().all(|x| *x > 0.0) {
            out.optimal = out.best.iter().sum();
        }
        let my_class = s.driver(me).map(|d| d.class_id);
        for i in 0..MAX_CARS {
            let d = s.driver(i);
            if i != me && (d.is_none() || d.map(|d| d.class_id) != my_class) {
                continue;
            }
            for (j, v) in self.cars[i].best.iter().enumerate().take(n) {
                if *v > 0.0 && (out.class_best[j] <= 0.0 || *v < out.class_best[j]) {
                    out.class_best[j] = *v;
                    out.class_best_no[j] = d.map(|d| d.car_number.clone()).unwrap_or_default();
                }
            }
        }
        if out.class_best.iter().all(|x| *x > 0.0) {
            out.class_optimal = out.class_best.iter().sum();
        }
        out
    }

    pub fn gaps(&self, f: &Frame, s: &SessionData) -> Gaps {
        let race = s.is_race(f.session_num);
        let mut out = Gaps { race, lap: f.lap_completed, ..Default::default() };
        let me = f.player_idx;
        if me < 0 || me as usize >= MAX_CARS || self.cars.len() != MAX_CARS {
            return out;
        }
        let me = me as usize;
        let my = f.cars[me];
        if my.pct < 0.0 {
            return out;
        }
        let mt = &self.cars[me];
        let skip = mt.cross.len().saturating_sub(GAP_LAPS);
        let mine: Vec<(i32, f64)> = mt.cross.iter().skip(skip).copied().collect();
        out.laps = mine.iter().map(|x| x.0).collect();
        let first_t = mine.first().map(|x| x.1).unwrap_or(f64::MAX);
        let pit_idx = |pits: &VecDeque<f64>| -> Vec<usize> {
            pits.iter()
                .filter(|tp| **tp >= first_t - 1.0 || mine.is_empty())
                .map(|tp| mine.iter().position(|x| x.1 >= *tp).unwrap_or(mine.len()))
                .collect()
        };
        out.my_pits = pit_idx(&mt.pits);
        let lap_t = crate::calc::ref_lap_time(f, s);
        let has_f2 = |c: &crate::model::CarState| c.position > 0 && (c.f2 > 0.0 || c.position == 1);
        for i in 0..MAX_CARS {
            if i == me || !crate::calc::active(f, s, i) {
                continue;
            }
            let c = f.cars[i];
            let ct = &self.cars[i];
            let live = if race && has_f2(&my) && has_f2(&c) {
                Some(my.f2 - c.f2)
            } else {
                // Pist üzerindeki fark (relative ile aynı tahmin)
                let mut dp = c.pct - my.pct;
                if dp > 0.5 {
                    dp -= 1.0;
                } else if dp < -0.5 {
                    dp += 1.0;
                }
                let mut dt = c.est_time - my.est_time;
                if dp > 0.0 && dt < 0.0 {
                    dt += lap_t;
                } else if dp < 0.0 && dt > 0.0 {
                    dt -= lap_t;
                }
                if dt.abs() > lap_t || (c.est_time == 0.0 && my.est_time == 0.0) {
                    dt = dp * lap_t;
                }
                Some(dt)
            };
            let hist: Vec<Option<f32>> = mine
                .iter()
                .map(|&(lap, t)| {
                    if race {
                        ct.cross.iter().find(|x| x.0 == lap).map(|x| (t - x.1) as f32)
                    } else {
                        // Yarış dışı: pistte en yakın geçiş
                        ct.cross
                            .iter()
                            .map(|x| (t - x.1) as f32)
                            .min_by(|a, b| a.abs().partial_cmp(&b.abs()).unwrap_or(std::cmp::Ordering::Equal))
                            .filter(|d| d.abs() < lap_t * 0.5)
                    }
                })
                .collect();
            out.cars.push(GapCar { idx: i as i32, live, hist, pits: pit_idx(&ct.pits) });
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Driver, SessionEntry};

    fn session() -> SessionData {
        let mut s = SessionData { track_name: "T".into(), player_idx: 0, drivers: vec![None; MAX_CARS], ..Default::default() };
        for i in 0..2 {
            s.drivers[i] = Some(Driver { car_idx: i as i32, car_number: format!("{}", i + 1), class_id: 1, ..Default::default() });
        }
        s.sessions = vec![SessionEntry { num: 0, kind: "Race".into(), laps: None, time: None, ..Default::default() }];
        s.sector_starts = vec![0.0, 0.25, 0.5];
        s
    }

    #[test]
    fn sectors_and_gaps() {
        let s = session();
        let mut t = Timing::default();
        let mut f = Frame::default();
        f.player_idx = 0;
        // 100 sn'lik tur; 1 numaralı araç 2 sn önde
        let mut time = 0.0f64;
        while time < 350.0 {
            f.session_time = time;
            for (i, lead) in [(0usize, 0.0f64), (1, 2.0)] {
                let d = (time + lead) / 100.0;
                f.cars[i].pct = d.fract() as f32;
                f.cars[i].lap_completed = d.floor() as i32;
                f.cars[i].lap = d.floor() as i32 + 1;
                f.cars[i].surface = 3;
                f.cars[i].position = if i == 1 { 1 } else { 2 };
            }
            f.lap_dist_pct = f.cars[0].pct;
            f.lap_completed = f.cars[0].lap_completed;
            t.update(&f, &s, false);
            time += 1.0 / 60.0;
        }
        let sec = t.sectors(&f, &s);
        assert_eq!(sec.n, 3);
        assert!(sec.official);
        assert_eq!(sec.last.len(), 3);
        assert!((sec.last[0] - 25.0).abs() < 0.05, "{:?}", sec.last);
        assert!((sec.last[2] - 50.0).abs() < 0.05, "{:?}", sec.last);
        assert!((sec.optimal - 100.0).abs() < 0.1);
        let g = t.gaps(&f, &s);
        assert_eq!(g.laps, vec![1, 2, 3]);
        let h = &g.cars[0].hist;
        assert!((h[1].unwrap() - 2.0).abs() < 0.05, "{h:?}");
    }
}
