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
    /// Bu oturumun resmi sonuçlarındaki en iyi turlar (ResultsPositions FastestTime; yalnız geçerli turlar)
    ses_best: Vec<f32>,
    /// Yarış oturumu, yeşil bayraktan önce (grid / ısınma turu): lider tablosundaki dereceler boş
    pre_green: bool,
    /// Oturumda araçların görülen son en iyi / son tur değerleri: sunucudan çıkan aracın (sim değerleri -1 olur)
    /// dereceleri lider tablosundan silinmesin
    keep: Vec<(f32, f32)>,
    keep_ses: i32,
    /// Simin bu karedeki ham en iyi turları (düzeltmeden önce) ve yeşil bayrak anındaki değerleri: yeşilden sonra
    /// değişen sim değeri bir yarış turudur (son tur süresinden hesaplananı tamamlar)
    raw_best: Vec<f32>,
    /// Simin ham son tur süreleri (düzeltmeden önce)
    raw_last: Vec<f32>,
    raw_noted: bool,
    green_raw_best: Vec<f32>,
    /// Son karenin oturum zamanı
    last_t: f64,
    /// Araçların pistin her noktasından geçiş anları: göreli farklar tahmin yerine ölçülerek hesaplanır
    pub pass: crate::gaps::PassTimes,
}

/// Tekrardaki tur süreleri. Simin en iyi / son tur değerleri tekrarda oturumun SONUNDAKİ değerlerdir; bu yüzden turlar
/// tekrar kafasının zamanından ölçülür: araç çizgiyi geçince (tur yüzdesi 1 → 0) geçiş anı ara değerlenir, iki geçiş
/// arası tur süresidir. Turlar geçiş zamanıyla tutulur: geri sarınca ilerideki turlar yok sayılır.
/// Tur sayaçlarına (CarIdxLapCompleted) güvenilmez, tekrarda her zaman güncellenmeyebilir.
/// Bu tekrarda hiçbir araç için henüz tur ölçülmediyse (tekrar yeni açıldı / tekrar kafası ilerlemiyor) simin değerleri kalır:
/// tablo bomboş görünmesin.
#[derive(Default)]
pub struct ReplayLaps {
    on: bool,
    sess: i32,
    t: f64,
    prev_pct: Vec<f32>,
    cross: Vec<f64>,
    /// araç başına (geçiş zamanı, tur süresi)
    laps: Vec<Vec<(f64, f32)>>,
    /// Bu tekrarda en az bir tur ölçüldü (ölçüm çalışıyor)
    any: bool,
}

impl ReplayLaps {
    fn clear(&mut self) {
        self.any = false;
        self.prev_pct = vec![-1.0; MAX_CARS];
        self.cross = vec![-1.0; MAX_CARS];
        self.laps = vec![Vec::new(); MAX_CARS];
    }

    pub fn update(&mut self, f: &Frame) {
        if !crate::calc::replay_watch(f) {
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
        // Sarma / atlama: geçiş zinciri kopar; geri sarınca ilerideki turlar atılır
        let jump = !(0.0..=1.5).contains(&dt);
        if dt < 0.0 {
            for v in self.laps.iter_mut() {
                v.retain(|x| x.0 <= t + 0.01);
            }
        }
        for i in 0..MAX_CARS {
            let pct = f.cars[i].pct;
            let pp = self.prev_pct[i];
            if jump || pct < 0.0 || pp < 0.0 {
                self.cross[i] = -1.0;
            } else if dt > 0.0 && pp > 0.8 && pct < 0.2 {
                let a = (1.0 - pp) as f64;
                let b = pct as f64;
                let frac = if a + b > 1e-6 { a / (a + b) } else { 1.0 };
                let tc = self.t + dt * frac;
                if self.cross[i] > 0.0 {
                    let lt = (tc - self.cross[i]) as f32;
                    if lt > 10.0 {
                        self.laps[i].push((tc, lt));
                        self.any = true;
                    }
                }
                self.cross[i] = tc;
            }
            self.prev_pct[i] = pct;
        }
        self.t = t;
    }

    /// Tekrardaysa araçların en iyi / son turunu izlenen ana göre yazar
    fn apply(&self, f: &mut Frame) -> bool {
        if !self.on || self.laps.len() != MAX_CARS || !self.any {
            return false;
        }
        let t = self.t + 0.01;
        for i in 0..MAX_CARS {
            let v = &self.laps[i];
            let mut best = -1.0f32;
            let mut last: Option<(f64, f32)> = None;
            for &(tc, lt) in v.iter().filter(|x| x.0 <= t) {
                if best <= 0.0 || lt < best {
                    best = lt;
                }
                if last.map(|l| tc > l.0).unwrap_or(true) {
                    last = Some((tc, lt));
                }
            }
            f.cars[i].best = best;
            f.cars[i].last = last.map(|l| l.1).unwrap_or(-1.0);
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
            ses_best: vec![-1.0; MAX_CARS],
            pre_green: false,
            keep: vec![(-1.0, -1.0); MAX_CARS],
            keep_ses: -1,
            raw_best: vec![-1.0; MAX_CARS],
            raw_last: vec![-1.0; MAX_CARS],
            raw_noted: false,
            green_raw_best: vec![-1.0; MAX_CARS],
            last_t: 0.0,
            pass: crate::gaps::PassTimes::default(),
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
        self.apply_bests(f);
        // Sunucudan çıkan araç: son görülen dereceler kalır
        if !self.pre_green && self.keep.len() == MAX_CARS {
            for i in 0..MAX_CARS {
                let (b, l) = self.keep[i];
                if f.cars[i].best <= 0.0 && b > 0.0 {
                    f.cars[i].best = b;
                }
                if f.cars[i].last <= 0.0 && l > 0.0 {
                    f.cars[i].last = l;
                }
            }
        }
    }

    /// Simin ham son tur süresi (not_raw çağrılmadıysa karedeki değer)
    fn raw_last_of(&self, f: &Frame, i: usize) -> f32 {
        if self.raw_noted {
            self.raw_last[i]
        } else {
            f.cars[i].last
        }
    }

    /// Simin ham değerlerini not et (her karede apply_race_best'ten önce)
    pub fn note_raw(&mut self, f: &Frame) {
        if self.raw_best.len() != MAX_CARS || self.raw_last.len() != MAX_CARS {
            self.raw_best = vec![-1.0; MAX_CARS];
            self.raw_last = vec![-1.0; MAX_CARS];
        }
        for i in 0..MAX_CARS {
            self.raw_best[i] = f.cars[i].best;
            self.raw_last[i] = f.cars[i].last;
        }
        self.raw_noted = true;
    }

    fn apply_bests(&self, f: &mut Frame) {
        if self.green_time.is_some() {
            // Yarış: yeşilden sonraki turlar. İki kaynağın en iyisi: son tur süresinden hesaplanan ve yeşilden sonra değişmiş
            // sim değeri (biri eksik kalsa da derece görünür)
            // Yeşilden beri geçen süreden uzun tur olamaz (önceki oturumdan kalan değer): sayılmaz
            let since_green = self
                .green_time
                .map(|g| (self.last_t - g).max(0.0) as f32 + 1.0)
                .unwrap_or(f32::MAX);
            for i in 0..MAX_CARS {
                let mut b = self.race_best[i];
                let mut take = |x: f32| {
                    if x > 0.0 && x <= since_green && (b <= 0.0 || x < b) {
                        b = x;
                    }
                };
                // Oturumun resmi sonuç listesi yarışta kullanılmaz: yarış başında sıralama turlarını taşıyabiliyor (1 tur atan
                // sürücünün en iyi turu, attığı turdan farklı / daha hızlı görünüyordu)
                let raw = self.raw_best.get(i).copied().unwrap_or(-1.0);
                let g = self.green_raw_best.get(i).copied().unwrap_or(-1.0);
                if raw > 0.0 && (raw - g).abs() > 1e-4 {
                    take(raw);
                }
                f.cars[i].best = b;
                // Son tur: ilk yarış turu tamamlanana kadar (sıralamadan kalan) gösterilmez
                if self.race_best[i] <= 0.0 && self.raw_noted {
                    f.cars[i].last = -1.0;
                }
            }
            return;
        }
        // Yarış için gride oturuldu: önceki oturumların (sıralama) dereceleri gösterilmez
        if self.pre_green {
            for i in 0..MAX_CARS {
                f.cars[i].best = -1.0;
                f.cars[i].last = -1.0;
            }
            return;
        }
        for i in 0..MAX_CARS {
            // Oturumun resmi sonucu varsa o (simin en iyi tur değeri önceki oturumdan kalmış olabilir: sıralamada
            // antrenmandaki daha hızlı tur kalıyor ve sıralama dereceleri hiç görünmüyordu)
            let rb = self.ses_best.get(i).copied().unwrap_or(-1.0);
            if rb > 0.0 {
                f.cars[i].best = rb;
                continue;
            }
            let st = self.stale_best[i];
            if st > 0.0 && (f.cars[i].best - st).abs() < 1e-4 {
                f.cars[i].best = -1.0;
            }
        }
    }

    pub fn update(&mut self, f: &Frame, s: &SessionData) {
        self.replay.update(f);
        self.pass.update(f);
        self.last_t = f.session_time;
        // Oturumun resmi sonuçları (geçerli en iyi turlar)
        self.ses_best = vec![-1.0; MAX_CARS];
        if let Some(se) = s.session(f.session_num) {
            for &(idx, best, _) in &se.results {
                if (0..MAX_CARS as i32).contains(&idx) && best > 0.0 {
                    self.ses_best[idx as usize] = best;
                }
            }
        }
        self.pre_green = s.is_race(f.session_num) && (1..=3).contains(&f.session_state);
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
            self.stale_best = (0..MAX_CARS)
                .map(|i| if fresh { f.cars[i].best } else { -1.0 })
                .collect();
        }
        // Sim yeni bir en iyi tur verdi: artık eski değer değil
        for i in 0..MAX_CARS {
            let st = self.stale_best[i];
            if st > 0.0 && f.cars[i].best > 0.0 && (f.cars[i].best - st).abs() >= 1e-4 {
                self.stale_best[i] = -1.0;
            }
        }
        if self.keep_ses != f.session_num || self.pre_green || self.keep.len() != MAX_CARS {
            self.keep = vec![(-1.0, -1.0); MAX_CARS];
            self.keep_ses = f.session_num;
        }
        if !self.pre_green && !self.replay.on {
            for i in 0..MAX_CARS {
                let c = &f.cars[i];
                let st = self.stale_best[i];
                if c.best > 0.0 && !(st > 0.0 && (c.best - st).abs() < 1e-4) {
                    self.keep[i].0 = c.best;
                }
                if c.last > 0.0 {
                    self.keep[i].1 = c.last;
                }
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
            self.green_raw_best = self.raw_best.clone();
            // Yeşildeki "son tur" değerleri (sıralamadan kalan) yarış turu sayılmaz
            self.race_last_seen = (0..MAX_CARS).map(|i| self.raw_last_of(f, i)).collect();
        }
        // Yarış turları: son tur süresi (CarIdxLastLapTime) her değiştiğinde yeni bir tur tamamlanmıştır. iRacing bu
        // değeri çizgiyi geçtikten biraz sonra günceller; tamamlanan tur sayısının arttığı karede eski değer durur.
        if race && self.green_time.is_some() {
            for i in 0..MAX_CARS {
                let last = self.raw_last_of(f, i);
                if last > 1.0 && (last - self.race_last_seen[i]).abs() > 1e-4 {
                    self.race_last_seen[i] = last;
                    if self.race_best[i] <= 0.0 || last < self.race_best[i] {
                        self.race_best[i] = last;
                    }
                }
            }
        }
        crate::calc::set_green(f.session_num, if race { self.green_time } else { None });
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
        let mut s = SessionData {
            drivers: vec![None; MAX_CARS],
            ..Default::default()
        };
        s.sessions = vec![crate::model::SessionEntry {
            num: 0,
            kind: kind.into(),
            ..Default::default()
        }];
        s.drivers[0] = Some(crate::model::Driver {
            car_idx: 0,
            ..Default::default()
        });
        s
    }
    fn step(t: &mut Tracker, f: &mut Frame, s: &SessionData) {
        t.note_raw(f);
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
        // Son tur süresi kaçırıldı ama sim yeni en iyi tur verdi (yeşilden sonra değişti): o da sayılır
        f.cars[0].best = 92.4;
        f.cars[0].lap_completed = 3;
        f.session_time = 400.0;
        step(&mut t, &mut f, &s);
        assert_eq!(f.cars[0].best, 92.4);
        // Yarış yeni başladı (yeşilden 30 sn): 92 sn'lik "en iyi tur" önceki oturumdan kalmış olamaz, sayılmaz
        let mut t2 = Tracker::default();
        let mut g = Frame::default();
        g.cars[0].pct = 0.1;
        g.cars[0].best = 88.0;
        g.session_state = 3;
        step(&mut t2, &mut g, &s);
        g.session_state = 4;
        g.session_time = 10.0;
        step(&mut t2, &mut g, &s);
        g.session_time = 40.0;
        g.cars[0].best = 87.0;
        step(&mut t2, &mut g, &s);
        assert!(g.cars[0].best <= 0.0, "{}", g.cars[0].best);
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

    #[test]
    fn departed_car_keeps_times() {
        let s = sess("Qualify");
        let mut t = Tracker::default();
        let mut f = Frame::default();
        f.session_state = 4;
        f.cars[0].pct = 0.1;
        f.cars[0].lap_completed = 3;
        f.cars[0].best = 91.0;
        f.cars[0].last = 92.0;
        step(&mut t, &mut f, &s);
        // Sunucudan çıktı: sim değerleri -1
        f.cars[0].pct = -1.0;
        f.cars[0].best = -1.0;
        f.cars[0].last = -1.0;
        step(&mut t, &mut f, &s);
        assert_eq!((f.cars[0].best, f.cars[0].last), (91.0, 92.0));
    }

    #[test]
    fn qualify_uses_session_results_and_grid_clears() {
        let mut s = sess("Qualify");
        let mut t = Tracker::default();
        let mut f = Frame::default();
        f.session_state = 4;
        f.cars[0].pct = 0.1;
        f.cars[0].best = 90.0; // antrenmandan kalan, daha hızlı: sim değiştirmiyor
        step(&mut t, &mut f, &s);
        assert!(f.cars[0].best <= 0.0);
        // Sıralama sonucu geldi (92.3): sim hâlâ 90 veriyor
        s.sessions[0].results = vec![(0, 92.3, 92.3)];
        f.cars[0].best = 90.0;
        f.cars[0].lap_completed = 2;
        step(&mut t, &mut f, &s);
        assert_eq!(f.cars[0].best, 92.3);
        // Yarış oturumu, gridde: dereceler boş
        let r = sess("Race");
        let mut f2 = Frame::default();
        f2.session_num = 0;
        f2.session_state = 1;
        f2.cars[0].pct = 0.1;
        f2.cars[0].best = 92.3;
        let mut t2 = Tracker::default();
        step(&mut t2, &mut f2, &r);
        assert!(f2.cars[0].best <= 0.0);
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
        // Tekrar yeni açıldı, tur ölçülmedi: simin değerleri kalır
        r.update(&frame(0.0, 0, 0.0));
        let mut f = frame(0.0, 0, 0.0);
        assert!(!r.apply(&mut f));
        // 100 sn'lik turlar, 0.5 sn'de bir kare (tur sayacı tekrarda güncellenmiyor: hep 0)
        let mut t: f64 = 0.0;
        while t <= 350.0 {
            let pct = ((t / 100.0) - (t / 100.0).floor()) as f32;
            r.update(&frame(t, 0, pct));
            t += 0.5;
        }
        let mut f = frame(350.0, 0, 0.5);
        assert!(r.apply(&mut f));
        assert!((f.cars[0].best - 100.0).abs() < 0.01, "{}", f.cars[0].best);
        assert!((f.cars[0].last - 100.0).abs() < 0.01);
        // Geri sar: 150. sn; 200 ve 300'deki turlar yok sayılır, ölçülen tek tur yok (ilk geçiş 100'de)
        r.update(&frame(150.0, 0, 0.5));
        let mut f = frame(150.0, 0, 0.5);
        r.apply(&mut f);
        assert_eq!(f.cars[0].best, -1.0);
    }
}
