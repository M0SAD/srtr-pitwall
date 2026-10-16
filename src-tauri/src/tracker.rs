//! Oturum boyunca biriken durum: araç başına stint/pit/tur geçmişi, yakıt ölçümü,
//! delta eğilimi ve yarış kontrol olayları. Her karede çağrılır; bellek ayırma azdır.

use crate::model::{Frame, SessionData, MAX_CARS};
use serde::Serialize;
use std::collections::VecDeque;

// ---------------------------------------------------------------------------
// Araç başına takip
// ---------------------------------------------------------------------------

#[derive(Clone, Default)]
pub struct CarTrack {
    pub seen: bool,
    pub prev_on_pit: bool,
    /// Son pit çıkışındaki tamamlanan tur (stint = tamamlanan - bu)
    pub pit_exit_lap: i32,
    pub pits: i32,
    /// Pitten çıktıktan sonraki ilk tur boyunca "OUT" gösterilir
    pub out_lap: bool,
    pub prev_lap_completed: i32,
    pub laps: VecDeque<f32>,
    pub start_pos: i32,
    pub prev_class_pos: i32,
    pub prev_flags: u32,
}

impl CarTrack {
    pub fn stint(&self, lap_completed: i32) -> i32 {
        (lap_completed - self.pit_exit_lap).max(0)
    }

    pub fn avg(&self, n: usize) -> f32 {
        let k = self.laps.len().min(n);
        if k == 0 {
            return -1.0;
        }
        self.laps.iter().rev().take(k).sum::<f32>() / k as f32
    }
}

// ---------------------------------------------------------------------------
// Yakıt
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct FuelTracker {
    last_lap: i32,
    fuel_at_start: f32,
    valid: bool,
    pub history: VecDeque<f32>,
    pub lap_times: VecDeque<f32>,
    /// Oyuncunun son pit çıkışının oturum zamanı
    pub stint_start: f64,
    was_on_pit: bool,
}

impl FuelTracker {
    pub fn seed(&mut self, fuel_per_lap: &[f32], lap_times: &[f32], stint_start: f64) {
        self.history = fuel_per_lap.iter().copied().collect();
        self.lap_times = lap_times.iter().copied().collect();
        self.stint_start = stint_start;
    }

    pub fn update(&mut self, f: &Frame) {
        if f.player_idx < 0 {
            return;
        }
        if self.was_on_pit && !f.on_pit_road {
            self.stint_start = f.session_time;
        }
        self.was_on_pit = f.on_pit_road;
        if f.on_pit_road || !f.is_on_track {
            self.valid = false;
        }
        // Yakıt arttıysa (ikmal) turu geçersiz say
        if f.fuel_level > self.fuel_at_start + 0.3 {
            self.valid = false;
            self.fuel_at_start = f.fuel_level;
        }
        if f.lap_completed != self.last_lap {
            // Tur sayısı bir artmadıysa (ör. oturuma turun ortasında bağlanıldı) bu tur ölçülmez
            let sequential = f.lap_completed == self.last_lap + 1;
            if sequential && self.valid {
                let used = self.fuel_at_start - f.fuel_level;
                if used > 0.05 {
                    self.history.push_back(used);
                    if self.history.len() > 10 {
                        self.history.pop_front();
                    }
                }
                if f.lap_last > 0.0 {
                    self.lap_times.push_back(f.lap_last);
                    if self.lap_times.len() > 10 {
                        self.lap_times.pop_front();
                    }
                }
            }
            self.last_lap = f.lap_completed;
            self.fuel_at_start = f.fuel_level;
            self.valid = sequential && !f.on_pit_road && f.is_on_track;
        }
    }

    pub fn avg_use(&self, n: usize) -> f32 {
        let k = self.history.len().min(n);
        if k == 0 {
            return 0.0;
        }
        self.history.iter().rev().take(k).sum::<f32>() / k as f32
    }

    pub fn max_use(&self, n: usize) -> f32 {
        self.history
            .iter()
            .rev()
            .take(n)
            .copied()
            .fold(0.0, f32::max)
    }

    pub fn avg_lap(&self, n: usize) -> f32 {
        let k = self.lap_times.len().min(n);
        if k == 0 {
            return 0.0;
        }
        self.lap_times.iter().rev().take(k).sum::<f32>() / k as f32
    }
}

/// Delta'nın son ~0.5 saniyedeki değişimi (kazanıyor mu kaybediyor mu).
#[derive(Default)]
pub struct DeltaTrend {
    samples: VecDeque<(f64, f32)>,
}

impl DeltaTrend {
    pub fn update(&mut self, t: f64, d: f32) {
        self.samples.push_back((t, d));
        while let Some(&(t0, _)) = self.samples.front() {
            if t - t0 > 0.5 {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }
    pub fn trend(&self) -> f32 {
        match (self.samples.front(), self.samples.back()) {
            (Some(a), Some(b)) => b.1 - a.1,
            _ => 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Yarış kontrol olayları (Live Timing)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RcEvent {
    pub id: u64,
    pub session_num: i32,
    pub time: f64,
    pub lap: i32,
    /// lead | lost | gained | pitIn | pitOut | fastest | flag
    pub kind: &'static str,
    pub idx: i32,
    pub number: String,
    pub name: String,
    pub class_name: String,
    pub class_color: String,
    pub text: String,
    pub is_me: bool,
}

// iRacing araç bayrakları
pub const CF_BLACK: u32 = 0x0001_0000;
pub const CF_DQ: u32 = 0x0002_0000;
pub const CF_REPAIR: u32 = 0x0010_0000;
pub const CF_BLUE: u32 = 0x0020;

// ---------------------------------------------------------------------------
// Toplu takipçi
// ---------------------------------------------------------------------------

pub struct Tracker {
    pub cars: Vec<CarTrack>,
    pub fuel: FuelTracker,
    pub trend: DeltaTrend,
    pub events: VecDeque<RcEvent>,
    next_id: u64,
    session_num: i32,
    last_rc_check: f64,
    class_best: Vec<(i32, f32)>,
    race_started: bool,
    /// Yeşil bayrağın oturum zamanı (sn): yarış başlamadan önce görüldüyse (grid / ısınma turu) yeşile geçiş anı
    pub green_time: Option<f64>,
    /// Otomatik Rejisör'ün o anki çekim türü (incident, finish, battle…; çalışmıyorsa boş): TV Sürücü Bandı bununla kazayı yazar
    pub director_kind: &'static str,
    saw_pre_green: bool,
    /// Yarışta yeşil bayraktan sonra atılan en iyi turlar (CarIdxBestLapTime / oturum sonuçları sıralama turlarını
    /// taşıyabildiği için en iyi tur yeşilde sıfırlanır ve yarış turlarından yeniden hesaplanır)
    race_best: Vec<f32>,
    race_last_seen: Vec<f32>,
    /// Antrenman / sıralama: oturum başında simin elinde kalan (önceki oturumdan) en iyi turlar; değişene kadar yok sayılır
    stale_best: Vec<f32>,
    /// Tekrar izlerken turlar tekrar kafasının zamanından hesaplanır (simin en iyi / son tur değerleri tekrarda
    /// oturumun SONUNDAKİ değerlerdir): lider tablosu ve TV En Hızlı Tur izlenen ana kadarki turları gösterir.
    replay: ReplayLaps,
}

/// Tekrardaki tur süreleri: her araç çizgiyi geçince (tamamlanan tur +1) geçiş anı tur yüzdesinden ara değerlenir.
/// İleri / geri sarınca geçiş zinciri kopar (sonraki tam tura kadar süre yok); geri sarınca ilerideki turlar atılır.
#[derive(Default)]
pub struct ReplayLaps {
    on: bool,
    sess: i32,
    t: f64,
    prev: Vec<(i32, f32)>,
    cross: Vec<f64>,
    /// araç başına (tur numarası, süre)
    laps: Vec<Vec<(i32, f32)>>,
}

impl ReplayLaps {
    fn clear(&mut self) {
        self.prev = vec![(-1, -1.0); MAX_CARS];
        self.cross = vec![-1.0; MAX_CARS];
        self.laps = vec![Vec::new(); MAX_CARS];
    }

    pub fn update(&mut self, f: &Frame) {
        let watch = crate::calc::replay_watch(f);
        if !watch {
            if self.on {
                self.on = false;
                self.laps.clear();
            }
            return;
        }
        let t = f.replay_session_time;
        if !self.on || f.replay_session_num != self.sess || self.laps.len() != MAX_CARS {
            self.on = true;
            self.sess = f.replay_session_num;
            self.t = t;
            self.clear();
        }
        let dt = t - self.t;
        // Sarma / atlama: zincir kopar
        let jump = !(0.0..=1.5).contains(&dt);
        for i in 0..MAX_CARS {
            let c = &f.cars[i];
            let (plc, ppct) = self.prev[i];
            if jump || c.lap_completed < 0 {
                self.cross[i] = -1.0;
                if c.lap_completed >= 0 {
                    let lc = c.lap_completed;
                    self.laps[i].retain(|x| x.0 <= lc);
                }
            } else if plc >= 0 && c.lap_completed == plc + 1 && dt > 0.0 {
                // Geçiş anı: önceki karede çizgiye kalan yol / iki kare arası yol
                let a = (1.0 - ppct).max(0.0) as f64;
                let b = c.pct.max(0.0) as f64;
                let frac = if a + b > 1e-6 && ppct > 0.5 && c.pct < 0.5 { a / (a + b) } else { 1.0 };
                let tc = self.t + dt * frac;
                if self.cross[i] > 0.0 {
                    let lt = (tc - self.cross[i]) as f32;
                    if lt > 10.0 {
                        self.laps[i].retain(|x| x.0 != c.lap_completed);
                        self.laps[i].push((c.lap_completed, lt));
                    }
                }
                self.cross[i] = tc;
            } else if plc >= 0 && c.lap_completed != plc {
                // Birden fazla tur atlandı / geri gitti
                self.cross[i] = -1.0;
                let lc = c.lap_completed;
                self.laps[i].retain(|x| x.0 <= lc);
            }
            self.prev[i] = (c.lap_completed, c.pct);
        }
        self.t = t;
    }

    /// Tekrardaysa araçların en iyi / son turunu izlenen ana göre yazar
    fn apply(&self, f: &mut Frame) -> bool {
        if !self.on || self.laps.len() != MAX_CARS {
            return false;
        }
        for i in 0..MAX_CARS {
            let lc = f.cars[i].lap_completed;
            let v = &self.laps[i];
            let best = v.iter().filter(|x| x.0 <= lc).map(|x| x.1).fold(-1.0f32, |m, x| if m <= 0.0 || x < m { x } else { m });
            let last = v.iter().find(|x| x.0 == lc).map(|x| x.1).unwrap_or(-1.0);
            f.cars[i].best = best;
            f.cars[i].last = last;
        }
        true
    }
}

impl Default for Tracker {
    fn default() -> Self {
        Tracker {
            cars: vec![CarTrack::default(); MAX_CARS],
            fuel: FuelTracker::default(),
            trend: DeltaTrend::default(),
            events: VecDeque::new(),
            next_id: 1,
            session_num: -1,
            last_rc_check: -1.0,
            class_best: Vec::new(),
            race_started: false,
            green_time: None,
            director_kind: "",
            saw_pre_green: false,
            race_best: vec![-1.0; MAX_CARS],
            race_last_seen: vec![-1.0; MAX_CARS],
            stale_best: vec![-1.0; MAX_CARS],
            replay: ReplayLaps::default(),
        }
    }
}

impl Tracker {
    pub fn reset(&mut self) {
        *self = Tracker::default();
    }

    fn push(&mut self, f: &Frame, s: &SessionData, idx: usize, kind: &'static str, text: String) {
        let d = s.driver(idx);
        let ev = RcEvent {
            id: self.next_id,
            session_num: f.session_num,
            time: f.session_time,
            lap: f.cars[idx].lap.max(0),
            kind,
            idx: idx as i32,
            number: d.map(|d| d.car_number.clone()).unwrap_or_default(),
            name: d.map(|d| d.name.clone()).unwrap_or_default(),
            class_name: d.map(|d| d.class_name.clone()).unwrap_or_default(),
            class_color: d.map(|d| d.class_color.clone()).unwrap_or_default(),
            text,
            is_me: idx as i32 == f.player_idx,
        };
        self.next_id += 1;
        self.events.push_back(ev);
        while self.events.len() > 120 {
            self.events.pop_front();
        }
    }

    /// En iyi turlar her oturumda (antrenman, sıralama, yarış) ayrı tutulur:
    /// - Yarışta (yeşil bayrak görüldüyse) yalnızca yeşilden sonraki yarış turlarından hesaplanır: sıralamadan kalan
    ///   süreler lider tablosuna / en hızlı tur grafiğine karışmaz.
    /// - Diğer oturumlarda oturum başında simin elinde kalan (önceki oturumdan) değer, değişene kadar yok sayılır.
    /// Oturumun başı görülmediyse (uygulama oturum ortasında açıldı) simin verdiği değer kalır.
    pub fn apply_race_best(&self, f: &mut Frame) {
        if self.replay.apply(f) {
            return;
        }
        if self.green_time.is_some() {
            for i in 0..MAX_CARS {
                f.cars[i].best = self.race_best[i];
            }
            return;
        }
        for i in 0..MAX_CARS {
            let st = self.stale_best[i];
            if st > 0.0 && (f.cars[i].best - st).abs() < 1e-4 {
                f.cars[i].best = -1.0;
            }
        }
    }

    pub fn update(&mut self, f: &Frame, s: &SessionData) {
        self.replay.update(f);
        if f.session_num != self.session_num {
            // Yeni oturum: araç geçmişleri sıfırlanır, yakıt geçmişi korunur
            self.cars = vec![CarTrack::default(); MAX_CARS];
            self.session_num = f.session_num;
            self.class_best.clear();
            self.race_started = false;
            self.green_time = None;
            self.saw_pre_green = false;
            // Oturumun başı görüldüyse (henüz kimse tur tamamlamadı) simde kalan eski en iyiler not edilir
            let fresh = (0..MAX_CARS).all(|i| f.cars[i].lap_completed <= 0);
            self.stale_best = (0..MAX_CARS).map(|i| if fresh { f.cars[i].best } else { -1.0 }).collect();
        }
        // Sim yeni bir en iyi tur verdi: artık eski değer değil
        for i in 0..MAX_CARS {
            let st = self.stale_best[i];
            if st > 0.0 && f.cars[i].best > 0.0 && (f.cars[i].best - st).abs() >= 1e-4 {
                self.stale_best[i] = -1.0;
            }
        }
        self.fuel.update(f);
        self.trend.update(f.session_time, f.delta_best);

        let race = s.is_race(f.session_num);
        // Yarış başladığında (yeşil) başlangıç pozisyonları kaydedilir
        let racing = f.session_state >= 4;
        // Yeşil bayrak anı: grid / ısınma turu görüldükten sonra yarışa geçildiği an (oturum ortasında açılınca bilinmez)
        if race && (1..=3).contains(&f.session_state) {
            self.saw_pre_green = true;
            self.green_time = None;
        } else if race && racing && self.saw_pre_green && self.green_time.is_none() {
            self.green_time = Some(f.session_time);
            self.race_best = vec![-1.0; MAX_CARS];
            // Yeşildeki "son tur" değerleri (sıralamadan kalan) yarış turu sayılmaz
            self.race_last_seen = (0..MAX_CARS).map(|i| f.cars[i].last).collect();
        }
        // Yarış turları: son tur süresi (CarIdxLastLapTime) her değiştiğinde yeni bir tur tamamlanmıştır. iRacing bu
        // değeri çizgiyi geçtikten biraz sonra günceller; tamamlanan tur sayısının arttığı karede eski değer durur.
        if race && self.green_time.is_some() {
            for i in 0..MAX_CARS {
                let last = f.cars[i].last;
                if last > 1.0 && (last - self.race_last_seen[i]).abs() > 1e-4 {
                    self.race_last_seen[i] = last;
                    if self.race_best[i] <= 0.0 || last < self.race_best[i] {
                        self.race_best[i] = last;
                    }
                }
            }
        }
        let record_start = race && racing && !self.race_started;
        if record_start {
            self.race_started = true;
        }

        for i in 0..MAX_CARS {
            let c = &f.cars[i];
            if c.pct < 0.0 && c.position <= 0 {
                continue;
            }
            let t = &mut self.cars[i];
            if !t.seen {
                t.seen = true;
                t.prev_on_pit = c.on_pit;
                t.prev_lap_completed = c.lap_completed;
                t.pit_exit_lap = if c.lap_completed > 0 && !race {
                    c.lap_completed
                } else {
                    0
                };
                t.start_pos = c.class_position;
                t.prev_class_pos = c.class_position;
                t.prev_flags = c.flags;
            }
            if record_start && c.class_position > 0 {
                t.start_pos = c.class_position;
            }
            if t.start_pos <= 0 && c.class_position > 0 {
                t.start_pos = c.class_position;
            }
            // Pit giriş/çıkış
            if c.on_pit && !t.prev_on_pit {
                t.pits += 1;
            }
            if !c.on_pit && t.prev_on_pit {
                t.pit_exit_lap = c.lap_completed;
                t.out_lap = true;
            }
            // Tur tamamlandı
            if c.lap_completed > t.prev_lap_completed {
                if c.lap_completed == t.prev_lap_completed + 1 && c.last > 0.0 && !t.out_lap {
                    t.laps.push_back(c.last);
                    if t.laps.len() > 10 {
                        t.laps.pop_front();
                    }
                }
                if t.out_lap && c.lap_completed > t.pit_exit_lap {
                    t.out_lap = false;
                }
                t.prev_lap_completed = c.lap_completed;
            }
        }

        // Yarış kontrol olayları saniyede bir değerlendirilir
        if f.session_time - self.last_rc_check >= 1.0 || f.session_time < self.last_rc_check {
            self.last_rc_check = f.session_time;
            self.race_control(f, s, race);
        }
        // Pit giriş/çıkış olayı ve önceki pit durumu her karede güncellenir
        for i in 0..MAX_CARS {
            let c = f.cars[i];
            if !self.cars[i].seen {
                continue;
            }
            let was = self.cars[i].prev_on_pit;
            if c.on_pit != was {
                self.cars[i].prev_on_pit = c.on_pit;
                if s.driver(i)
                    .map(|d| !d.is_pace_car && !d.is_spectator)
                    .unwrap_or(false)
                {
                    if c.on_pit {
                        self.push(f, s, i, "pitIn", "pite girdi".into());
                    } else {
                        self.push(f, s, i, "pitOut", "pitten çıktı".into());
                    }
                }
            }
        }
    }

    fn race_control(&mut self, f: &Frame, s: &SessionData, race: bool) {
        for i in 0..MAX_CARS {
            let c = f.cars[i];
            let Some(d) = s.driver(i) else { continue };
            if d.is_pace_car || d.is_spectator || !self.cars[i].seen {
                continue;
            }
            let prev = self.cars[i].prev_class_pos;
            let now = c.class_position;
            if race && prev > 0 && now > 0 && now != prev {
                if now == 1 {
                    // Metin arayüzde çevrilir: kalıplar scripts/i18n/extra.json'da
                    let text = if s.class_count() > 1 {
                        format!("{}: liderliği aldı", d.class_name)
                    } else {
                        "liderliği aldı".to_string()
                    };
                    self.push(f, s, i, "lead", text);
                } else if now - prev >= 3 && !c.on_pit {
                    self.push(f, s, i, "lost", format!("{} sıra kaybetti", now - prev));
                } else if prev - now >= 3 {
                    self.push(f, s, i, "gained", format!("{} sıra kazandı", prev - now));
                }
            }
            self.cars[i].prev_class_pos = now;

            // Sınıfın en hızlı turu
            if c.best > 0.0 {
                let cid = d.class_id;
                let entry = self.class_best.iter_mut().find(|x| x.0 == cid);
                let improved = match entry {
                    Some(e) if c.best < e.1 - 0.0005 => {
                        e.1 = c.best;
                        true
                    }
                    Some(_) => false,
                    None => {
                        self.class_best.push((cid, c.best));
                        false
                    }
                };
                if improved {
                    self.push(
                        f,
                        s,
                        i,
                        "fastest",
                        format!("en hızlı tur {}", fmt_lap(c.best)),
                    );
                }
            }

            // Araca verilen bayraklar
            let newf = c.flags & !self.cars[i].prev_flags;
            if newf & CF_DQ != 0 {
                self.push(f, s, i, "flag", "diskalifiye edildi".into());
            } else if newf & CF_BLACK != 0 {
                self.push(f, s, i, "flag", "siyah bayrak aldı".into());
            } else if newf & CF_REPAIR != 0 {
                self.push(f, s, i, "flag", "hasar bayrağı aldı".into());
            }
            self.cars[i].prev_flags = c.flags;
        }
    }
}

pub fn fmt_lap(t: f32) -> String {
    if t <= 0.0 {
        return "-".into();
    }
    let m = (t / 60.0).floor() as i32;
    let sec = t - m as f32 * 60.0;
    if m > 0 {
        format!("{m}:{sec:06.3}")
    } else {
        format!("{sec:.3}")
    }
}

#[cfg(test)]
mod best_tests {
    use super::*;

    fn sess(kind: &str) -> SessionData {
        let mut s = SessionData { drivers: vec![None; MAX_CARS], ..Default::default() };
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: kind.into(), ..Default::default() }];
        s.drivers[0] = Some(crate::model::Driver { car_idx: 0, ..Default::default() });
        s
    }
    fn step(t: &mut Tracker, f: &mut Frame, s: &SessionData) {
        t.apply_race_best(f);
        t.update(f, s);
        t.apply_race_best(f);
    }

    #[test]
    fn race_best_resets_at_green() {
        let s = sess("Race");
        let mut t = Tracker::default();
        let mut f = Frame::default();
        f.cars[0].pct = 0.1;
        f.cars[0].best = 88.0; // sıralamadan kalan
        f.session_state = 3;
        step(&mut t, &mut f, &s);
        f.cars[0].best = 88.0;
        f.session_state = 4;
        f.session_time = 100.0;
        step(&mut t, &mut f, &s);
        assert!(f.cars[0].best <= 0.0, "yeşilde sıfırlanır");
        f.cars[0].best = 88.0;
        f.cars[0].lap_completed = 1;
        f.cars[0].last = 95.2;
        step(&mut t, &mut f, &s);
        assert_eq!(f.cars[0].best, 95.2);
        f.cars[0].best = 88.0;
        f.cars[0].lap_completed = 2;
        f.cars[0].last = 93.1;
        step(&mut t, &mut f, &s);
        assert_eq!(f.cars[0].best, 93.1);
    }

    #[test]
    fn practice_ignores_previous_session_best() {
        let s = sess("Qualify");
        let mut t = Tracker::default();
        let mut f = Frame::default();
        f.session_state = 4;
        f.cars[0].pct = 0.1;
        f.cars[0].best = 90.0; // antrenmandan kalan
        step(&mut t, &mut f, &s);
        assert!(f.cars[0].best <= 0.0);
        // Sim yeni en iyi tur verdi
        f.cars[0].best = 91.5;
        f.cars[0].lap_completed = 1;
        step(&mut t, &mut f, &s);
        assert_eq!(f.cars[0].best, 91.5);
    }
}

#[cfg(test)]
mod replay_tests {
    use super::*;

    fn frame(t: f64, lc: i32, pct: f32) -> Frame {
        let mut f = Frame::default();
        f.replay = true;
        f.replay_live = false;
        f.replay_session_time = t;
        f.cars[0].lap_completed = lc;
        f.cars[0].pct = pct;
        f.cars[0].best = 80.0; // simin tekrarda verdiği (oturum sonu) değer
        f
    }

    #[test]
    fn replay_laps_follow_playhead() {
        let mut r = ReplayLaps::default();
        // 100 sn'lik turlar, 0.5 sn'de bir kare
        let mut t: f64 = 0.0;
        while t <= 350.0 {
            let lap = (t / 100.0).floor() as i32;
            let pct = ((t / 100.0) - lap as f64) as f32;
            r.update(&frame(t, lap, pct));
            t += 0.5;
        }
        let mut f = frame(350.0, 3, 0.5);
        assert!(r.apply(&mut f));
        assert!((f.cars[0].best - 100.0).abs() < 0.01, "{}", f.cars[0].best);
        // Geri sar: tur 1'in ortası, 2. ve 3. tur atılır, tur 1 hiç ölçülmedi
        r.update(&frame(150.0, 1, 0.5));
        let mut f = frame(150.0, 1, 0.5);
        r.apply(&mut f);
        assert_eq!(f.cars[0].best, -1.0);
    }
}
