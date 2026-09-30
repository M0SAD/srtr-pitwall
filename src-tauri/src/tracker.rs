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
        self.history.iter().rev().take(n).copied().fold(0.0, f32::max)
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

    pub fn update(&mut self, f: &Frame, s: &SessionData) {
        if f.session_num != self.session_num {
            // Yeni oturum: araç geçmişleri sıfırlanır, yakıt geçmişi korunur
            self.cars = vec![CarTrack::default(); MAX_CARS];
            self.session_num = f.session_num;
            self.class_best.clear();
            self.race_started = false;
        }
        self.fuel.update(f);
        self.trend.update(f.session_time, f.delta_best);

        let race = s.is_race(f.session_num);
        // Yarış başladığında (yeşil) başlangıç pozisyonları kaydedilir
        let racing = f.session_state >= 4;
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
                t.pit_exit_lap = if c.lap_completed > 0 && !race { c.lap_completed } else { 0 };
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
                if s.driver(i).map(|d| !d.is_pace_car && !d.is_spectator).unwrap_or(false) {
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
                    let text = if s.class_count() > 1 { format!("{}: liderliği aldı", d.class_name) } else { "liderliği aldı".to_string() };
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
                    self.push(f, s, i, "fastest", format!("en hızlı tur {}", fmt_lap(c.best)));
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
