//! Strateji takibi (`strategy` konusu): Pit Penceresi, Stint Özeti ve Sürücü Değişimi overlay'lerinin verisi.
//!
//! - Stint'ler: pit çıkışından pit çıkışına; tur süreleri, ortalama / en iyi, eğilim, yakıt, lastik yaşı.
//! - Takım sürücüleri: oyuncunun aracını o an kim sürüyorsa (oturum bilgisindeki sürücü adı) ona süre ve tur yazılır.
//!   Yalnızca uygulama açıkken görülen süre sayılır (oturuma sonradan bağlanıldıysa öncesi bilinmez).
//! - Pit kaybı: pit girişi → çıkışı arasında geçen süre eksi aynı pist parçasının normal tempoda süresi.
//!   Pist başına son ölçümler `pitloss.json` dosyasında saklanır (demo verisi saklanmaz).
//! - Pistteki araçların bana göre konumu (sn): "şimdi pite girersem nereden çıkarım" hesabını overlay yapar.
//!
//! Her yeni karede `update`, abone varken `packet` çağrılır. Sim farkı gözetmez: veriyi veren her simde çalışır.

use crate::calc::{active, ref_lap_time};
use crate::model::{Frame, SessionData, MAX_CARS};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

const MAX_STINTS: usize = 20;
const LOSS_SAMPLES: usize = 5;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StintRec {
    /// Oturumdaki sıra numarası (1'den)
    pub n: i32,
    pub driver: String,
    /// Stint başındaki tamamlanmış tur sayısı
    pub start_lap: i32,
    pub laps: i32,
    /// Pit çıkışından pit girişine (süren stint'te şu ana) kadar geçen süre (sn)
    pub time: f32,
    /// Temiz turların (pit giriş/çıkış turu hariç) ortalaması ve en iyisi; yoksa -1
    pub avg: f32,
    pub best: f32,
    /// Son tamamlanan tur (sn); yoksa -1
    pub last: f32,
    /// Tur süresi eğilimi (sn/tur): + yavaşlıyor, − hızlanıyor. `trend_ok` yanlışsa yeterli tur yok
    pub trend: f32,
    pub trend_ok: bool,
    /// Tur başına ortalama yakıt (L) ve stint'te harcanan toplam; bilinmiyorsa -1
    pub fuel_avg: f32,
    pub fuel_used: f32,
    /// Bu lastik takımıyla atılan tur. `tyre_known` yanlışsa lastiğin değiştiği varsayıldı
    pub tyre_laps: i32,
    pub tyre_known: bool,
    /// Stint'i bitiren pit ziyaretinin pit yolunda geçen süresi (sn); yoksa -1
    pub pit_time: f32,
    pub current: bool,
    /// Temiz tur süreleri (en fazla son 30)
    pub lap_times: Vec<f32>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DriverTot {
    pub name: String,
    pub user_id: i64,
    /// Toplam sürüş süresi (sn) ve tamamlanan tur
    pub time: f32,
    pub laps: i32,
    /// Araca kaç kez bindi
    pub stints: i32,
    pub current: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StratCar {
    pub idx: i32,
    pub number: String,
    pub name: String,
    pub class_name: String,
    pub class_color: String,
    pub same_class: bool,
    pub pos: i32,
    pub class_pos: i32,
    /// Pistte benim kaç saniye arkamda (0..tur süresi)
    pub behind: f32,
    /// Yarış sırasına göre fark (sn): + arkamda, − önümde (tur farkı dahil). Yarış değilse `behind` ile aynı
    pub race_gap: f32,
    pub on_pit: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StrategyPacket {
    pub race: bool,
    pub multiclass: bool,
    /// Oyuncunun tempo turu (sn)
    pub lap_time: f32,
    pub position: i32,
    pub class_position: i32,
    pub on_pit_road: bool,
    /// Süren pit ziyaretinde pit yolunda geçen süre; pitte değilse -1
    pub pit_elapsed: f32,
    /// Öğrenilmiş pit kaybı (sn; son ölçümlerin ortalaması); yoksa -1
    pub pit_loss: f32,
    pub pit_loss_samples: i32,
    /// Bu oturumdaki son ölçüm; yoksa -1
    pub pit_loss_last: f32,
    pub track: String,
    pub cars: Vec<StratCar>,
    /// Eskiden yeniye; süren stint en sonda (`current`)
    pub stints: Vec<StintRec>,
    /// Takım yarışı (araçta birden fazla sürücü)
    pub team: bool,
    pub team_name: String,
    pub driver: String,
    /// Şu anki sürücünün araçta kesintisiz geçirdiği süre (sürücü değişiminden beri, sn)
    pub drive_time: f32,
    pub drivers: Vec<DriverTot>,
    /// Takibin başladığı oturum zamanı (sn): bundan öncesi bilinmiyor
    pub tracked_from: f32,
    pub session_time: f32,
}

#[derive(Clone, Copy)]
struct Lap {
    time: f32,
    clean: bool,
    fuel: f32,
}

struct Cur {
    n: i32,
    driver: String,
    start_time: f64,
    start_lap: i32,
    laps: Vec<Lap>,
    fuel_start: f32,
    fuel_end: Option<f32>,
    end_time: Option<f64>,
    lap_start: f64,
    lap_fuel: f32,
    lap_dirty: bool,
    tyre_base: i32,
    tyre_known: bool,
}

struct Visit {
    t_in: f64,
    pct_in: f32,
    valid: bool,
    wear_in: f32,
    tyre_req: bool,
    left_world: bool,
}

struct DriverAcc {
    name: String,
    user_id: i64,
    time: f64,
    laps: i32,
    stints: i32,
}

pub struct Strategy {
    dir: Option<PathBuf>,
    /// Pist anahtarı → son pit kaybı ölçümleri
    losses: HashMap<String, Vec<f32>>,
    seen: bool,
    demo: bool,
    seeded: bool,
    session_num: i32,
    track: String,
    last_time: f64,
    tracked_from: f64,
    prev_lap: i32,
    prev_pit: bool,
    prev_world: bool,
    prev_pct: f32,
    fuel_prev: f32,
    cur: Option<Cur>,
    visit: Option<Visit>,
    stints: Vec<StintRec>,
    next_n: i32,
    drivers: Vec<DriverAcc>,
    cur_driver: usize,
    cont_time: f64,
    pending: Option<(f32, f64)>,
    loss_last: f32,
    demo_loss: Option<f32>,
    team: bool,
    team_name: String,
}

fn avg_wear(f: &Frame) -> f32 {
    let mut sum = 0.0;
    for w in f.tire_wear.iter() {
        for x in w.iter() {
            if *x < 0.0 {
                return -1.0;
            }
            sum += *x;
        }
    }
    sum / 12.0
}

fn mean(v: &[f32]) -> f32 {
    if v.is_empty() {
        -1.0
    } else {
        v.iter().sum::<f32>() / v.len() as f32
    }
}

/// En küçük kareler eğimi (sn/tur)
fn slope(v: &[f32]) -> Option<f32> {
    let n = v.len();
    if n < 3 {
        return None;
    }
    let mx = (n as f32 - 1.0) / 2.0;
    let my = mean(v);
    let (mut num, mut den) = (0.0f32, 0.0f32);
    for (i, y) in v.iter().enumerate() {
        let dx = i as f32 - mx;
        num += dx * (y - my);
        den += dx * dx;
    }
    if den > 0.0 {
        Some(num / den)
    } else {
        None
    }
}

impl Cur {
    fn clean_times(&self) -> Vec<f32> {
        let all: Vec<f32> = self.laps.iter().filter(|l| l.clean && l.time > 0.0).map(|l| l.time).collect();
        // Sarı bayrak / spin gibi çok yavaş turlar ortalamayı ve eğilimi bozmasın
        let best = all.iter().copied().fold(f32::INFINITY, f32::min);
        all.into_iter().filter(|t| *t <= best * 1.12).collect()
    }

    fn rec(&self, now: f64, fuel_now: f32, current: bool, pit_time: f32) -> StintRec {
        let times = self.clean_times();
        let fuels: Vec<f32> = self.laps.iter().filter(|l| l.clean && l.fuel > 0.0).map(|l| l.fuel).collect();
        let tr = slope(&times);
        let end_fuel = self.fuel_end.unwrap_or(fuel_now);
        let used = if self.fuel_start > 0.0 && end_fuel >= 0.0 { (self.fuel_start - end_fuel).max(0.0) } else { -1.0 };
        let skip = times.len().saturating_sub(30);
        StintRec {
            n: self.n,
            driver: self.driver.clone(),
            start_lap: self.start_lap,
            laps: self.laps.len() as i32,
            time: (self.end_time.unwrap_or(now) - self.start_time).max(0.0) as f32,
            avg: mean(&times),
            best: if times.is_empty() { -1.0 } else { times.iter().copied().fold(f32::INFINITY, f32::min) },
            last: self.laps.last().map(|l| l.time).unwrap_or(-1.0),
            trend: tr.unwrap_or(0.0),
            trend_ok: tr.is_some(),
            fuel_avg: mean(&fuels),
            fuel_used: if used > 0.05 { used } else { -1.0 },
            tyre_laps: self.tyre_base + self.laps.len() as i32,
            tyre_known: self.tyre_known,
            pit_time,
            current,
            lap_times: times[skip..].to_vec(),
        }
    }
}

impl Strategy {
    pub fn new(dir: Option<PathBuf>) -> Strategy {
        let losses = dir
            .as_ref()
            .and_then(|d| std::fs::read(d.join("pitloss.json")).ok())
            .and_then(|b| serde_json::from_slice::<HashMap<String, Vec<f32>>>(&b).ok())
            .unwrap_or_default();
        Strategy {
            dir,
            losses,
            seen: false,
            demo: false,
            seeded: false,
            session_num: -1,
            track: String::new(),
            last_time: 0.0,
            tracked_from: 0.0,
            prev_lap: 0,
            prev_pit: false,
            prev_world: false,
            prev_pct: 0.0,
            fuel_prev: 0.0,
            cur: None,
            visit: None,
            stints: Vec::new(),
            next_n: 1,
            drivers: Vec::new(),
            cur_driver: usize::MAX,
            cont_time: 0.0,
            pending: None,
            loss_last: -1.0,
            demo_loss: None,
            team: false,
            team_name: String::new(),
        }
    }

    fn reset(&mut self) {
        let dir = self.dir.take();
        let losses = std::mem::take(&mut self.losses);
        *self = Strategy::new(None);
        self.dir = dir;
        self.losses = losses;
    }

    fn add_loss(&mut self, loss: f32) {
        self.loss_last = loss;
        if self.demo {
            self.demo_loss = Some(loss);
            return;
        }
        let list = self.losses.entry(self.track.clone()).or_default();
        list.push((loss * 10.0).round() / 10.0);
        while list.len() > LOSS_SAMPLES {
            list.remove(0);
        }
        if let Some(d) = &self.dir {
            if let Ok(b) = serde_json::to_vec(&self.losses) {
                let _ = std::fs::write(d.join("pitloss.json"), b);
            }
        }
    }

    fn start_stint(&mut self, f: &Frame, t: f64, lap_completed: i32, dirty: bool, tyre_base: i32, tyre_known: bool) {
        let driver = self.drivers.get(self.cur_driver).map(|d| d.name.clone()).unwrap_or_default();
        if let Some(d) = self.drivers.get_mut(self.cur_driver) {
            d.stints += 1;
        }
        self.cur = Some(Cur {
            n: self.next_n,
            driver,
            start_time: t,
            start_lap: lap_completed.max(0),
            laps: Vec::new(),
            fuel_start: f.fuel_level,
            fuel_end: None,
            end_time: None,
            lap_start: t,
            lap_fuel: f.fuel_level,
            lap_dirty: dirty,
            tyre_base,
            tyre_known,
        });
        self.next_n += 1;
    }

    /// Demo / önizleme: overlay'ler hemen dolu görünsün
    fn seed_demo(&mut self, f: &Frame, s: &SessionData, t: f64) {
        self.seeded = true;
        self.tracked_from = 0.0;
        let lap = ref_lap_time(f, s);
        let mk = |n: i32, driver: &str, start: i32, laps: i32, off: f32, tr: f32, fuel: f32, pit: f32| StintRec {
            n,
            driver: driver.to_string(),
            start_lap: start,
            laps,
            time: laps as f32 * (lap + off) + 9.0,
            avg: lap + off,
            best: lap + off - 0.62,
            last: lap + off + 0.4,
            trend: tr,
            trend_ok: true,
            fuel_avg: fuel,
            fuel_used: fuel * laps as f32,
            tyre_laps: laps,
            tyre_known: true,
            pit_time: pit,
            current: false,
            lap_times: (0..laps.min(30)).map(|i| lap + off - 0.5 + tr * i as f32 + ((i * 7 % 5) as f32 - 2.0) * 0.08).collect(),
        };
        self.stints.push(mk(1, "Deniz Arslan", 0, 23, 0.84, 0.045, 2.91, 41.8));
        self.stints.push(mk(2, "Mert Yıldız", 23, 17, 0.31, 0.03, 2.87, 43.1));
        self.next_n = 3;
        self.drivers.push(DriverAcc { name: "Deniz Arslan".into(), user_id: 1, time: 2520.0, laps: 23, stints: 1 });
        self.drivers.push(DriverAcc { name: "Mert Yıldız".into(), user_id: 2, time: 1890.0, laps: 17, stints: 1 });
        let me = s.player().map(|d| (d.name.clone(), d.user_id)).unwrap_or(("Sen".into(), 3));
        self.drivers.push(DriverAcc { name: me.0, user_id: me.1, time: 5.6 * lap as f64, laps: 5, stints: 0 });
        self.cur_driver = 2;
        self.cont_time = 5.6 * lap as f64;
        self.demo_loss = Some(27.4);
        self.team = true;
        self.team_name = "Demo Endurance".into();
        let lc = f.cars.get(f.player_idx.max(0) as usize).map(|c| c.lap_completed).unwrap_or(0);
        self.start_stint(f, t - 5.6 * lap as f64, lc - 5, false, 0, true);
        if let Some(c) = self.cur.as_mut() {
            c.fuel_start = f.fuel_level + 5.0 * 2.85;
            c.lap_start = t - 0.6 * lap as f64;
            for i in 0..5 {
                c.laps.push(Lap { time: lap + 0.5 - 0.11 * i as f32 + if i == 3 { 0.3 } else { 0.0 }, clean: true, fuel: 2.85 + (i % 2) as f32 * 0.05 });
            }
        }
    }

    pub fn update(&mut self, f: &Frame, s: &SessionData, sim: &str, demo: bool) {
        if f.player_idx < 0 || f.player_idx as usize >= MAX_CARS {
            return;
        }
        let me = f.player_idx as usize;
        let t = f.session_time;
        if !self.seen
            || demo != self.demo
            || f.session_num != self.session_num
            || t + 5.0 < self.last_time
            || !self.track.ends_with(s.track_name.as_str())
        {
            self.reset();
            self.demo = demo;
            self.session_num = f.session_num;
            self.track = format!("{}|{}|{}", if demo { "demo" } else { sim }, s.track_config, s.track_name);
            self.last_time = t;
            self.tracked_from = t;
        }
        let dt = (t - self.last_time).clamp(0.0, 2.0);
        self.last_time = t;
        let c = f.cars[me];
        let in_world = c.pct >= 0.0 && (c.surface >= 0 || f.is_on_track);
        let on_pit = c.on_pit || f.on_pit_road;
        let pit_like = on_pit || !in_world;
        let race = s.is_race(f.session_num);
        let running = !race || f.session_state == 4;

        if demo && !self.seeded {
            self.seed_demo(f, s, t);
            self.seen = true;
            self.prev_lap = c.lap_completed;
            self.prev_pit = pit_like;
            self.prev_world = in_world;
            self.prev_pct = c.pct;
            self.fuel_prev = f.fuel_level;
        }

        // ---- Sürücü ----
        if let Some(d) = s.driver(me) {
            let same = self.drivers.get(self.cur_driver).map(|x| x.name == d.name && x.user_id == d.user_id).unwrap_or(false);
            if !same && !d.name.is_empty() {
                let found = self.drivers.iter().position(|x| if d.user_id > 0 && x.user_id > 0 { x.user_id == d.user_id } else { x.name == d.name });
                let idx = match found {
                    Some(i) => i,
                    None => {
                        self.drivers.push(DriverAcc { name: d.name.clone(), user_id: d.user_id, time: 0.0, laps: 0, stints: 0 });
                        self.drivers.len() - 1
                    }
                };
                if self.cur_driver != idx {
                    let old = self.cur_driver;
                    self.cur_driver = idx;
                    self.cont_time = 0.0;
                    // Sürücü pit dışında, henüz tur atılmamış stint'te değiştiyse stint yeni sürücüye yazılır
                    // (olağan değişim pitte olur: yeni stint pit çıkışında zaten yeni sürücüyle başlar)
                    let rename = self.cur.as_ref().map(|c| c.end_time.is_none() && c.laps.is_empty()).unwrap_or(false);
                    if old != usize::MAX && rename {
                        if let Some(cur) = self.cur.as_mut() {
                            cur.driver = d.name.clone();
                        }
                        if let Some(x) = self.drivers.get_mut(old) {
                            x.stints = (x.stints - 1).max(0);
                        }
                        if let Some(x) = self.drivers.get_mut(idx) {
                            x.stints += 1;
                        }
                    }
                } else if let Some(x) = self.drivers.get_mut(idx) {
                    x.name = d.name.clone();
                }
            }
            if !demo {
                // iRacing takım oturumunda takım adı sürücü adından farklıdır; diğer simlerde yalnızca sürücü değişimi görülünce
                let named = sim == "iracing" && !d.team_name.is_empty() && d.team_name != d.name;
                self.team = named || self.drivers.len() > 1;
                if named {
                    if self.team_name != d.team_name {
                        self.team_name = d.team_name.clone();
                    }
                } else if !self.team_name.is_empty() {
                    self.team_name.clear();
                }
            }
        }
        if in_world && running {
            if let Some(d) = self.drivers.get_mut(self.cur_driver) {
                d.time += dt;
                self.cont_time += dt;
            }
        }

        // ---- İlk kare ----
        if !self.seen {
            self.seen = true;
            self.prev_lap = c.lap_completed;
            self.prev_pit = pit_like;
            self.prev_world = in_world;
            self.prev_pct = c.pct;
            self.fuel_prev = f.fuel_level;
            // Yarış başlamadan (ya da ilk turda) bağlanıldıysa hiçbir şey kaçmadı
            if !(race && f.session_state == 4 && c.lap_completed >= 1) {
                self.tracked_from = 0.0;
            }
            if !pit_like {
                // Stint'in ortasında bağlanıldı: lastik yaşı bilinmiyor, ilk tur yarım
                let fresh = c.lap_completed <= 0;
                self.start_stint(f, t, c.lap_completed, true, 0, fresh);
            }
            return;
        }

        // ---- Pit girişi / çıkışı ----
        if pit_like && !self.prev_pit {
            let jump = (c.pct - self.prev_pct).abs();
            let steady = self.cur.as_ref().map(|x| t - x.start_time > 20.0).unwrap_or(false);
            self.visit = Some(Visit {
                t_in: t,
                pct_in: c.pct,
                valid: in_world && self.prev_world && on_pit && steady && (jump < 0.05 || jump > 0.95),
                wear_in: avg_wear(f),
                tyre_req: false,
                left_world: !in_world,
            });
            if let Some(cur) = self.cur.as_mut() {
                cur.end_time = Some(t);
                cur.fuel_end = Some(f.fuel_level);
                cur.lap_dirty = true;
            }
        }
        if pit_like {
            if let Some(v) = self.visit.as_mut() {
                if !in_world {
                    v.valid = false;
                    v.left_world = true;
                }
                if c.surface == 1 && f.pit_sv_flags >= 0 && f.pit_sv_flags & 0x0f != 0 {
                    v.tyre_req = true;
                }
            }
        }
        if !pit_like && self.prev_pit {
            let visit = self.visit.take();
            let mut pit_time = -1.0f32;
            let (mut tyre_base, mut tyre_known) = (0, true);
            if let Some(v) = &visit {
                let lane = (t - v.t_in) as f32;
                if v.valid {
                    pit_time = lane;
                }
                // Lastik değişti mi
                let (changed, known) = if v.left_world {
                    (true, true)
                } else if f.pit_sv_flags >= 0 {
                    (v.tyre_req, true)
                } else if v.wear_in >= 0.0 && avg_wear(f) >= 0.0 {
                    (avg_wear(f) > v.wear_in + 0.03, true)
                } else {
                    (true, false)
                };
                if let Some(cur) = &self.cur {
                    if !changed {
                        tyre_base = cur.tyre_base + cur.laps.len() as i32;
                        tyre_known = cur.tyre_known;
                    } else {
                        tyre_known = known;
                    }
                }
                // Pit kaybı: pit yolundaki süre − aynı pist parçasının normal temposu
                if v.valid {
                    let frac = (c.pct - v.pct_in).rem_euclid(1.0);
                    let pace = self.cur.as_ref().map(|x| mean(&x.clean_times())).filter(|p| *p > 0.0).unwrap_or_else(|| ref_lap_time(f, s));
                    let loss = lane - frac * pace;
                    if frac < 0.5 && (8.0..150.0).contains(&loss) && (race || lane < 90.0) {
                        self.add_loss(loss);
                    }
                }
            }
            if let Some(cur) = self.cur.take() {
                // Hiç tur atılmamış, pitte başlamış stint kayda girmez
                if !cur.laps.is_empty() || cur.end_time.map(|e| e - cur.start_time > 30.0).unwrap_or(false) {
                    self.stints.push(cur.rec(t, f.fuel_level, false, pit_time));
                    if self.stints.len() > MAX_STINTS {
                        self.stints.remove(0);
                    }
                } else {
                    self.next_n = cur.n;
                    if let Some(d) = self.drivers.iter_mut().find(|d| d.name == cur.driver) {
                        d.stints = (d.stints - 1).max(0);
                    }
                }
            }
            self.start_stint(f, t, c.lap_completed, true, tyre_base, tyre_known);
        }

        // ---- Yakıt ikmali (stint içinde) ----
        if let Some(cur) = self.cur.as_mut() {
            if cur.end_time.is_none() && f.fuel_level > self.fuel_prev + 0.3 {
                cur.fuel_start += f.fuel_level - self.fuel_prev;
                cur.lap_dirty = true;
            }
        }
        self.fuel_prev = f.fuel_level;

        // ---- Tur tamamlandı ----
        if c.lap_completed != self.prev_lap {
            let sequential = c.lap_completed == self.prev_lap + 1 && self.prev_lap >= 0;
            if let Some(cur) = self.cur.as_mut() {
                if sequential {
                    let measured = (t - cur.lap_start) as f32;
                    let clean = !cur.lap_dirty && measured > 5.0;
                    let used = cur.lap_fuel - f.fuel_level;
                    let time = if c.last > 0.0 && (c.last - measured).abs() < 0.25 { c.last } else { measured };
                    cur.laps.push(Lap { time, clean, fuel: if clean && used > 0.05 { used } else { -1.0 } });
                    self.pending = Some((c.last, t + 4.0));
                    if let Some(d) = self.drivers.get_mut(self.cur_driver) {
                        d.laps += 1;
                    }
                }
                cur.lap_start = t;
                cur.lap_fuel = f.fuel_level;
                cur.lap_dirty = pit_like || !sequential;
            }
            self.prev_lap = c.lap_completed;
        } else if let Some((old, deadline)) = self.pending {
            // Sim son tur süresini çizgiyi geçtikten biraz sonra yazar: gelince ölçülen sürenin yerine konur
            if c.last > 0.0 && (c.last - old).abs() > 1e-4 {
                if let Some(l) = self.cur.as_mut().and_then(|x| x.laps.last_mut()) {
                    if (c.last - l.time).abs() < 3.0 {
                        l.time = c.last;
                    }
                }
                self.pending = None;
            } else if t > deadline {
                self.pending = None;
            }
        }

        self.prev_pit = pit_like;
        self.prev_world = in_world;
        self.prev_pct = c.pct;
    }

    pub fn packet(&self, f: &Frame, s: &SessionData) -> StrategyPacket {
        let race = s.is_race(f.session_num);
        let mut out = StrategyPacket {
            race,
            multiclass: s.class_count() > 1,
            pit_elapsed: -1.0,
            pit_loss: -1.0,
            pit_loss_last: self.loss_last,
            track: s.track_name.clone(),
            team: self.team,
            team_name: self.team_name.clone(),
            drive_time: self.cont_time as f32,
            tracked_from: self.tracked_from as f32,
            session_time: f.session_time as f32,
            ..Default::default()
        };
        // Pit kaybı
        if self.demo {
            if let Some(l) = self.demo_loss {
                out.pit_loss = l;
                out.pit_loss_samples = 3;
            }
        } else if let Some(list) = self.losses.get(&self.track) {
            if !list.is_empty() {
                out.pit_loss = mean(list);
                out.pit_loss_samples = list.len() as i32;
            }
        }
        // Stint'ler ve sürücüler
        out.stints = self.stints.clone();
        if let Some(cur) = &self.cur {
            out.stints.push(cur.rec(f.session_time, f.fuel_level, true, -1.0));
        }
        for (i, d) in self.drivers.iter().enumerate() {
            let current = i == self.cur_driver;
            if current {
                out.driver = d.name.clone();
            }
            out.drivers.push(DriverTot { name: d.name.clone(), user_id: d.user_id, time: d.time as f32, laps: d.laps, stints: d.stints, current });
        }
        if let Some(v) = &self.visit {
            out.pit_elapsed = (f.session_time - v.t_in).max(0.0) as f32;
        }

        if f.player_idx < 0 || f.player_idx as usize >= MAX_CARS {
            return out;
        }
        let me = f.player_idx as usize;
        let my = f.cars[me];
        out.position = my.position;
        out.class_position = my.class_position;
        out.on_pit_road = my.on_pit || f.on_pit_road;
        let lap_t = ref_lap_time(f, s).max(1.0);
        out.lap_time = self.cur.as_ref().map(|x| mean(&x.clean_times())).filter(|p| *p > 0.0).unwrap_or(lap_t);
        if my.pct < 0.0 {
            return out;
        }
        let my_class = s.driver(me).map(|d| d.class_id).unwrap_or(0);
        let my_prog = my.lap_completed.max(0) as f32 + my.pct;
        for i in 0..MAX_CARS {
            if i == me || !active(f, s, i) {
                continue;
            }
            let c = f.cars[i];
            let Some(d) = s.driver(i) else { continue };
            // + ise o araç arkamda
            let mut dp = my.pct - c.pct;
            if dp > 0.5 {
                dp -= 1.0;
            } else if dp < -0.5 {
                dp += 1.0;
            }
            let mut dt = my.est_time - c.est_time;
            if dp > 0.0 && dt < 0.0 {
                dt += lap_t;
            } else if dp < 0.0 && dt > 0.0 {
                dt -= lap_t;
            }
            if dt.abs() > lap_t * 0.5 || (dt == 0.0 && dp != 0.0) {
                dt = dp * lap_t;
            }
            let behind = if dt >= 0.0 { dt } else { dt + lap_t };
            let race_gap = if race {
                let k = (my_prog - (c.lap_completed.max(0) as f32 + c.pct) - dp).round();
                k * lap_t + dt
            } else {
                dt
            };
            out.cars.push(StratCar {
                idx: i as i32,
                number: d.car_number.clone(),
                name: d.name.clone(),
                class_name: d.class_name.clone(),
                class_color: d.class_color.clone(),
                same_class: d.class_id == my_class,
                pos: c.position,
                class_pos: c.class_position,
                behind,
                race_gap,
                on_pit: c.on_pit,
            });
        }
        out.cars.sort_by(|a, b| a.behind.partial_cmp(&b.behind).unwrap_or(std::cmp::Ordering::Equal));
        out
    }
}
