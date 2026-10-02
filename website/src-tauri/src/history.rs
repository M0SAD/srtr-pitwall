//! Oturum geçmişi: oyuncunun tur süreleri (sektörlerle), olay (incident) günlüğü ve
//! oturum bitince diske yazılan kayıt/özet dosyaları.

use crate::model::{Frame, SessionData, MAX_CARS};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Tur üç eşit sektöre bölünür
pub const SECTORS: usize = 3;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LapRec {
    pub lap: i32,
    pub time: f32,
    pub sectors: Vec<f32>,
    /// Bu turda harcanan yakıt (L)
    pub fuel: f32,
    /// Bu turdaki olay puanı
    pub inc: i32,
    /// Pist dışına çıkıldı / olay oldu: tur geçersiz sayılır
    pub valid: bool,
    /// Pitten çıkış ya da pite giriş turu
    pub pit: bool,
    pub session_time: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IncidentRec {
    pub id: u32,
    pub session_time: f64,
    /// Gerçek saat (unix ms)
    pub ts: u64,
    pub lap: i32,
    pub sector: i32,
    pub pct: f32,
    pub delta: i32,
    pub total: i32,
    pub kind: String,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Laps {
    pub laps: Vec<LapRec>,
    pub best: f32,
    pub best_lap: i32,
    /// Her sektörün en iyi süresi ve bunların toplamı (teorik en iyi tur)
    pub best_sectors: Vec<f32>,
    pub optimal: f32,
    /// Güncel turun tamamlanmış sektörleri
    pub current: Vec<f32>,
    pub current_lap: i32,
    pub lap_pct: f32,
}

/// Tur hız izi çözünürlüğü (her bölmede en düşük hız)
pub const TRACE_BINS: usize = 200;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Corner {
    pub n: i32,
    pub pct: f32,
    /// En iyi turdaki viraj en düşük hızı (m/s)
    pub best: f32,
    /// Son turdaki
    pub last: f32,
    /// Bu turdaki (geçildiyse)
    pub current: f32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Corners {
    pub corners: Vec<Corner>,
    pub best_lap: i32,
    pub lap_pct: f32,
}

/// En iyi tur hız izinden virajları bulur: belirgin yerel minimumlar.
pub fn find_corners(trace: &[f32]) -> Vec<(usize, f32)> {
    let n = trace.len();
    let valid: Vec<f32> = trace.iter().copied().filter(|v| v.is_finite() && *v > 0.0).collect();
    if valid.len() < n * 3 / 4 {
        return Vec::new();
    }
    let vmax = valid.iter().cloned().fold(0.0f32, f32::max);
    let get = |i: isize| trace[i.rem_euclid(n as isize) as usize];
    let mut out: Vec<(usize, f32)> = Vec::new();
    for i in 0..n {
        let v = trace[i];
        if !v.is_finite() || v <= 0.0 || v > vmax * 0.9 {
            continue;
        }
        let w = 10isize;
        let mut is_min = true;
        let mut peak = 0.0f32;
        for d in -w..=w {
            if d == 0 {
                continue;
            }
            let x = get(i as isize + d);
            if x.is_finite() && x < v {
                is_min = false;
                break;
            }
            if x.is_finite() {
                peak = peak.max(x);
            }
        }
        // Çevresinden en az %8 yavaş olmalı
        if is_min && peak > v * 1.08 {
            if let Some(last) = out.last() {
                if i - last.0 < 8 {
                    continue;
                }
            }
            out.push((i, v));
        }
    }
    out
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Incidents {
    pub list: Vec<IncidentRec>,
    pub total: i32,
    pub limit: i32,
    pub session_kind: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResultRow {
    pub pos: i32,
    pub class_pos: i32,
    pub number: String,
    pub name: String,
    pub car: String,
    pub class_name: String,
    pub laps: i32,
    pub best: f32,
    pub is_me: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub version: u32,
    pub started: u64,
    pub ended: u64,
    pub track: String,
    pub track_config: String,
    pub car: String,
    pub kind: String,
    pub laps: Vec<LapRec>,
    pub incidents: Vec<IncidentRec>,
    pub results: Vec<ResultRow>,
    pub best: f32,
    pub start_pos: i32,
    pub finish_pos: i32,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn incident_kind(delta: i32) -> &'static str {
    match delta {
        1 => "Pist dışı",
        2 => "Kontrol kaybı / duvar",
        4 => "Temas",
        d if d >= 5 => "Ağır temas",
        _ => "Olay",
    }
}

#[derive(Default)]
pub struct History {
    session_num: i32,
    started: u64,
    laps: Vec<LapRec>,
    incidents: Vec<IncidentRec>,
    /// Güncel tur bilgileri
    cur_lap: i32,
    cur_start_time: f64,
    cur_start_fuel: f32,
    cur_inc_start: i32,
    cur_invalid: bool,
    cur_pit: bool,
    cur_sectors: Vec<f32>,
    sector_start: f64,
    last_pct: f32,
    last_inc: i32,
    next_inc_id: u32,
    start_pos: i32,
    dirty: bool,
    seen_frame: bool,
    persist_ok: bool,
    last_track: String,
    last_car: String,
    last_kind: String,
    last_results: Vec<ResultRow>,
    finish_pos: i32,
    /// Demo: ilk karede eklenecek geçmiş turlar (süre, yakıt)
    seed: Vec<(f32, f32)>,
    cur_trace: Vec<f32>,
    last_trace: Vec<f32>,
    best_trace: Vec<f32>,
    best_trace_time: f32,
    best_trace_lap: i32,
    corners: Vec<(usize, f32)>,
}

impl History {
    /// Demo/önizleme için geçmiş turlar
    pub fn seed_demo(&mut self, laps: &[f32], fuel: &[f32]) {
        self.seed = laps.iter().zip(fuel.iter().chain(std::iter::repeat(&2.8))).map(|(a, b)| (*a, *b)).collect();
    }

    fn clear(&mut self, f: &Frame) {
        let persist = self.persist_ok;
        let seed = std::mem::take(&mut self.seed);
        *self = History { persist_ok: persist, ..History::default() };
        self.session_num = f.session_num;
        self.started = now_ms();
        self.last_inc = f.incidents;
        self.cur_lap = f.lap;
        self.cur_start_time = f.session_time;
        self.cur_start_fuel = f.fuel_level;
        self.cur_inc_start = f.incidents;
        self.sector_start = f.session_time;
        self.last_pct = f.lap_dist_pct;
        self.seen_frame = true;
        let n = seed.len() as i32;
        for (i, (t, fuel)) in seed.into_iter().enumerate() {
            let lap = f.lap - n + i as i32;
            if lap < 1 {
                continue;
            }
            let w = [0.318, 0.357, 0.325];
            let j = (i as f32 * 0.37).sin() * 0.15;
            self.laps.push(LapRec {
                lap,
                time: t,
                sectors: vec![t * w[0] + j, t * w[1] - j * 0.5, t * (1.0 - w[0] - w[1]) - j * 0.5],
                fuel,
                inc: 0,
                valid: i != 1,
                pit: false,
                session_time: f.session_time - (n - i as i32) as f64 * t as f64,
            });
        }
    }

    /// Her yeni karede çağrılır. Oturum değişince önceki oturum kaydı döner (diske yazılmak için).
    pub fn update(&mut self, f: &Frame, s: &SessionData, persist: bool) -> Option<SessionRecord> {
        let mut finished = None;
        if !self.seen_frame || f.session_num != self.session_num {
            if self.seen_frame && self.dirty && self.persist_ok {
                finished = Some(self.record());
            }
            self.clear(f);
        }
        self.persist_ok = persist;
        if f.player_idx < 0 || f.player_idx as usize >= MAX_CARS {
            return finished;
        }
        let me = f.cars[f.player_idx as usize];

        // Olaylar
        if f.incidents > self.last_inc {
            let delta = f.incidents - self.last_inc;
            let pct = f.lap_dist_pct.clamp(0.0, 1.0);
            self.next_inc_id += 1;
            self.incidents.push(IncidentRec {
                id: self.next_inc_id,
                session_time: f.session_time,
                ts: now_ms(),
                lap: f.lap.max(0),
                sector: ((pct * SECTORS as f32) as i32).min(SECTORS as i32 - 1) + 1,
                pct,
                delta,
                total: f.incidents,
                kind: incident_kind(delta).into(),
            });
            self.cur_invalid = true;
            self.dirty = true;
        }
        self.last_inc = f.incidents;

        // Pist dışı (0 = OffTrack) turu geçersiz kılar
        if me.surface == 0 && f.is_on_track {
            self.cur_invalid = true;
        }
        if f.on_pit_road {
            self.cur_pit = true;
        }

        let pct = f.lap_dist_pct;
        if self.cur_trace.len() != TRACE_BINS {
            self.cur_trace = vec![f32::INFINITY; TRACE_BINS];
        }
        if (0.0..1.0).contains(&pct) && f.is_on_track {
            let b = ((pct * TRACE_BINS as f32) as usize).min(TRACE_BINS - 1);
            if f.speed < self.cur_trace[b] {
                self.cur_trace[b] = f.speed;
            }
        }
        // Sektör geçişleri
        if f.lap == self.cur_lap && pct >= 0.0 {
            let boundary = (self.cur_sectors.len() + 1) as f32 / SECTORS as f32;
            if self.cur_sectors.len() < SECTORS - 1 && pct >= boundary && self.last_pct < boundary && pct - self.last_pct < 0.5 {
                self.cur_sectors.push((f.session_time - self.sector_start) as f32);
                self.sector_start = f.session_time;
            }
        }

        // Tur tamamlandı
        if f.lap != self.cur_lap {
            if f.lap == self.cur_lap + 1 && self.cur_lap > 0 {
                let t = if f.lap_last > 0.0 { f.lap_last } else { (f.session_time - self.cur_start_time) as f32 };
                let mut sectors = self.cur_sectors.clone();
                if sectors.len() == SECTORS - 1 {
                    let done: f32 = sectors.iter().sum();
                    sectors.push((t - done).max(0.0));
                } else {
                    sectors.clear();
                }
                let fuel = (self.cur_start_fuel - f.fuel_level).max(0.0);
                // Hız izi: en iyi geçerli tur viraj karşılaştırması için saklanır
                let trace = std::mem::replace(&mut self.cur_trace, vec![f32::INFINITY; TRACE_BINS]);
                let full = trace.iter().filter(|v| v.is_finite()).count() > TRACE_BINS * 3 / 4;
                if full {
                    if !self.cur_invalid && !self.cur_pit && t > 0.0 && (self.best_trace_time == 0.0 || t < self.best_trace_time) {
                        self.best_trace = trace.clone();
                        self.best_trace_time = t;
                        self.best_trace_lap = self.cur_lap;
                        self.corners = find_corners(&self.best_trace);
                    }
                    self.last_trace = trace;
                }
                if t > 0.0 {
                    self.laps.push(LapRec {
                        lap: self.cur_lap,
                        time: t,
                        sectors,
                        fuel,
                        inc: f.incidents - self.cur_inc_start,
                        valid: !self.cur_invalid,
                        pit: self.cur_pit,
                        session_time: f.session_time,
                    });
                    if self.laps.len() > 500 {
                        self.laps.remove(0);
                    }
                    self.dirty = true;
                }
            }
            self.cur_lap = f.lap;
            self.cur_start_time = f.session_time;
            self.cur_start_fuel = f.fuel_level;
            self.cur_inc_start = f.incidents;
            self.cur_invalid = false;
            self.cur_pit = f.on_pit_road;
            self.cur_sectors.clear();
            self.sector_start = f.session_time;
        }
        self.last_pct = pct;

        // Özet için son durum
        let race = s.is_race(f.session_num);
        if race && self.start_pos <= 0 && f.session_state >= 4 && me.class_position > 0 {
            self.start_pos = me.class_position;
        }
        if me.class_position > 0 {
            self.finish_pos = me.class_position;
        }
        self.last_track = s.track_name.clone();
        self.last_car = s.player().map(|d| d.car_name.clone()).unwrap_or_default();
        self.last_kind = s.session(f.session_num).map(|x| x.kind.clone()).unwrap_or_default();
        // Sonuçlar (damalı bayrak ya da oturum sonunda en güncel hali)
        if self.dirty && (f.session_state >= 5 || f.tick % 120 == 0) {
            self.last_results = results(f, s);
        }
        finished
    }

    /// Uygulama kapanırken ya da iRacing bağlantısı koptuğunda bekleyen kaydı alır.
    pub fn take(&mut self) -> Option<SessionRecord> {
        if self.dirty && self.persist_ok {
            self.dirty = false;
            Some(self.record())
        } else {
            None
        }
    }

    fn record(&self) -> SessionRecord {
        SessionRecord {
            version: 1,
            started: self.started,
            ended: now_ms(),
            track: self.last_track.clone(),
            track_config: String::new(),
            car: self.last_car.clone(),
            kind: self.last_kind.clone(),
            laps: self.laps.clone(),
            incidents: self.incidents.clone(),
            results: self.last_results.clone(),
            best: best_of(&self.laps).0,
            start_pos: self.start_pos,
            finish_pos: self.finish_pos,
        }
    }

    pub fn laps(&self, f: &Frame) -> Laps {
        let (best, best_lap) = best_of(&self.laps);
        let mut best_sectors = vec![0.0f32; SECTORS];
        for l in self.laps.iter().filter(|l| l.valid && l.sectors.len() == SECTORS) {
            for (i, v) in l.sectors.iter().enumerate() {
                if *v > 0.0 && (best_sectors[i] == 0.0 || *v < best_sectors[i]) {
                    best_sectors[i] = *v;
                }
            }
        }
        let optimal = if best_sectors.iter().all(|x| *x > 0.0) { best_sectors.iter().sum() } else { 0.0 };
        let start = self.laps.len().saturating_sub(60);
        Laps {
            laps: self.laps[start..].to_vec(),
            best,
            best_lap,
            best_sectors,
            optimal,
            current: self.cur_sectors.clone(),
            current_lap: self.cur_lap,
            lap_pct: f.lap_dist_pct,
        }
    }

    pub fn corners(&self, f: &Frame) -> Corners {
        let win = |tr: &[f32], i: usize| -> f32 {
            if tr.len() != TRACE_BINS {
                return 0.0;
            }
            let mut m = f32::INFINITY;
            for d in -4isize..=4 {
                let j = (i as isize + d).rem_euclid(TRACE_BINS as isize) as usize;
                m = m.min(tr[j]);
            }
            if m.is_finite() { m } else { 0.0 }
        };
        let here = ((f.lap_dist_pct.max(0.0) * TRACE_BINS as f32) as usize).min(TRACE_BINS - 1);
        Corners {
            corners: self
                .corners
                .iter()
                .enumerate()
                .map(|(k, (i, v))| Corner {
                    n: k as i32 + 1,
                    pct: *i as f32 / TRACE_BINS as f32,
                    best: *v,
                    last: win(&self.last_trace, *i),
                    current: if here > i + 4 { win(&self.cur_trace, *i) } else { 0.0 },
                })
                .collect(),
            best_lap: self.best_trace_lap,
            lap_pct: f.lap_dist_pct,
        }
    }

    pub fn incidents(&self, f: &Frame, s: &SessionData) -> Incidents {
        let start = self.incidents.len().saturating_sub(100);
        Incidents {
            list: self.incidents[start..].to_vec(),
            total: f.incidents,
            limit: s.incident_limit,
            session_kind: s.session(f.session_num).map(|x| x.kind.clone()).unwrap_or_default(),
        }
    }
}

fn best_of(laps: &[LapRec]) -> (f32, i32) {
    let mut best = 0.0f32;
    let mut lap = 0;
    for l in laps.iter().filter(|l| l.valid && !l.pit) {
        if best == 0.0 || l.time < best {
            best = l.time;
            lap = l.lap;
        }
    }
    (best, lap)
}

fn results(f: &Frame, s: &SessionData) -> Vec<ResultRow> {
    let mut rows: Vec<ResultRow> = (0..MAX_CARS)
        .filter_map(|i| {
            let d = s.driver(i)?;
            if d.is_pace_car || d.is_spectator {
                return None;
            }
            let c = f.cars[i];
            if c.position <= 0 {
                return None;
            }
            Some(ResultRow {
                pos: c.position,
                class_pos: c.class_position,
                number: d.car_number.clone(),
                name: d.name.clone(),
                car: d.car_name.clone(),
                class_name: d.class_name.clone(),
                laps: c.lap_completed.max(0),
                best: c.best,
                is_me: i as i32 == f.player_idx,
            })
        })
        .collect();
    rows.sort_by_key(|r| r.pos);
    rows
}

// ---- Disk ----

pub fn dir(app_data: &Path) -> PathBuf {
    app_data.join("sessions")
}

fn safe(s: &str) -> String {
    let t: String = s
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    t.chars().take(40).collect()
}

fn fmt_time(t: f32) -> String {
    crate::tracker::fmt_lap(t)
}

/// Oturum kaydını JSON olarak, istenirse okunabilir özet olarak yazar.
pub fn save(dir: &Path, rec: &SessionRecord, summary: bool) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let secs = (rec.started / 1000) as i64;
    let stamp = stamp(secs);
    let base = format!("{}_{}_{}", stamp, safe(&rec.track), safe(&rec.kind));
    let json = dir.join(format!("{base}.json"));
    std::fs::write(&json, serde_json::to_vec_pretty(rec).unwrap_or_default())?;
    if summary && (!rec.laps.is_empty() || !rec.results.is_empty()) {
        std::fs::write(dir.join(format!("{base}.txt")), summary_text(rec))?;
    }
    Ok(json)
}

/// Yerel saat dilimi bilinmediği için UTC tarih damgası (YYYY-MM-DD_HH-MM)
fn stamp(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Gün sayısından tarih (Howard Hinnant algoritması)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}_{:02}-{:02}", rem / 3600, (rem % 3600) / 60)
}

pub fn summary_text(r: &SessionRecord) -> String {
    use crate::i18n::{tr, trf};
    let mut o = String::new();
    o += &format!("SRTR Pitwall {}\n{}  ·  {}  ·  {}\n", tr("oturum özeti"), r.track, r.kind, r.car);
    o += &format!("{}: {}\n\n", tr("Tarih (UTC)"), stamp((r.started / 1000) as i64).replace('_', " "));
    if r.start_pos > 0 || r.finish_pos > 0 {
        o += &trf("Başlangıç: P{0}   Bitiş: P{1} (sınıf)", &[&r.start_pos, &r.finish_pos]);
        o += "\n";
    }
    let valid = r.laps.iter().filter(|l| l.valid && !l.pit).count();
    o += &trf("Tur: {0}  (geçerli {1})   En iyi: {2}", &[&r.laps.len(), &valid, &fmt_time(r.best)]);
    o += "\n";
    let total_inc: i32 = r.incidents.iter().map(|i| i.delta).sum();
    o += &trf("Olay: {0}x", &[&total_inc]);
    o += "\n\n";
    if !r.laps.is_empty() {
        o += &format!("{}\n", tr("TURLAR"));
        let (fuel, invalid, pit) = (tr("yakıt"), tr("geçersiz"), tr("pit"));
        for l in &r.laps {
            let sec = l.sectors.iter().map(|s| format!("{s:.3}")).collect::<Vec<_>>().join(" / ");
            o += &format!(
                "  {:>3}  {:>9}  {:<26} {fuel} {:.2} L{}{}\n",
                l.lap,
                fmt_time(l.time),
                sec,
                l.fuel,
                if l.valid { String::new() } else { format!("  {invalid}") },
                if l.pit { format!("  {pit}") } else { String::new() }
            );
        }
        o += "\n";
    }
    if !r.incidents.is_empty() {
        o += &format!("{}\n", tr("OLAYLAR"));
        let (lap, total) = (tr("Tur"), tr("toplam"));
        for i in &r.incidents {
            o += &format!("  {lap} {:>3}  S{}  +{}x  {}  ({total} {}x)\n", i.lap, i.sector, i.delta, tr(&i.kind), i.total);
        }
        o += "\n";
    }
    if !r.results.is_empty() {
        o += &format!("{}\n", tr("SONUÇLAR"));
        let laps = tr("tur");
        for x in &r.results {
            o += &format!(
                "  {:>2}. {:<4} {:<26} {:<18} {:>3} {laps}  {}{}\n",
                x.pos,
                format!("#{}", x.number),
                x.name.chars().take(26).collect::<String>(),
                x.class_name.chars().take(18).collect::<String>(),
                x.laps,
                fmt_time(x.best),
                if x.is_me { "  ◀" } else { "" }
            );
        }
    }
    o
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionsInfo {
    pub count: usize,
    pub dir: String,
    pub recent: Vec<SessionBrief>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionBrief {
    pub file: String,
    pub track: String,
    pub kind: String,
    pub car: String,
    pub started: u64,
    pub laps: usize,
    pub best: f32,
    pub incidents: i32,
    pub finish_pos: i32,
}

fn json_files(dir: &Path) -> Vec<(PathBuf, std::time::SystemTime)> {
    let mut v: Vec<_> = std::fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false))
                .map(|e| {
                    let m = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                    (e.path(), m)
                })
                .collect()
        })
        .unwrap_or_default();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v
}

pub fn info(dir: &Path) -> SessionsInfo {
    let files = json_files(dir);
    let recent = files
        .iter()
        .take(30)
        .filter_map(|(p, _)| {
            let r: SessionRecord = serde_json::from_slice(&std::fs::read(p).ok()?).ok()?;
            Some(SessionBrief {
                file: p.file_name()?.to_string_lossy().into(),
                track: r.track,
                kind: r.kind,
                car: r.car,
                started: r.started,
                laps: r.laps.len(),
                best: r.best,
                incidents: r.incidents.iter().map(|i| i.delta).sum(),
                finish_pos: r.finish_pos,
            })
        })
        .collect();
    SessionsInfo { count: files.len(), dir: dir.to_string_lossy().into(), recent }
}

/// `days` günden eski ya da en yeni `keep` dışındakileri siler (`all` hepsini).
pub fn prune(dir: &Path, days: u32, keep: usize, all: bool) -> usize {
    let files = json_files(dir);
    let now = std::time::SystemTime::now();
    let mut n = 0;
    for (i, (p, m)) in files.iter().enumerate() {
        let old = days > 0 && now.duration_since(*m).map(|d| d.as_secs() > days as u64 * 86_400).unwrap_or(false);
        let over = keep > 0 && i >= keep;
        if all || old || over {
            let _ = std::fs::remove_file(p);
            let _ = std::fs::remove_file(p.with_extension("txt"));
            n += 1;
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corners_found() {
        // İki yavaş bölgeli yapay hız izi
        let tr: Vec<f32> = (0..TRACE_BINS)
            .map(|i| {
                let x = i as f32 / TRACE_BINS as f32;
                70.0 - 40.0 * (-((x - 0.25) * 30.0).powi(2)).exp() - 30.0 * (-((x - 0.7) * 30.0).powi(2)).exp()
            })
            .collect();
        let c = find_corners(&tr);
        assert_eq!(c.len(), 2, "{c:?}");
        assert_eq!(c[0].0, 50);
        assert_eq!(c[1].0, 140);
    }

    #[test]
    fn stamp_date() {
        assert_eq!(stamp(0), "1970-01-01_00-00");
        assert_eq!(stamp(1_790_000_000), "2026-09-21_14-13");
    }

    #[test]
    fn save_info_prune() {
        let dir = std::env::temp_dir().join(format!("pw-sess-{}", now_ms()));
        let rec = SessionRecord {
            version: 1,
            started: 1_790_000_000_000,
            ended: 1_790_000_900_000,
            track: "Spa-Francorchamps".into(),
            track_config: String::new(),
            car: "Porsche 911 GT3 R".into(),
            kind: "Race".into(),
            laps: vec![LapRec { lap: 1, time: 138.2, sectors: vec![40.0, 50.0, 48.2], fuel: 3.1, inc: 0, valid: true, pit: false, session_time: 140.0 }],
            incidents: vec![],
            results: vec![],
            best: 138.2,
            start_pos: 5,
            finish_pos: 3,
        };
        let p = save(&dir, &rec, true).unwrap();
        assert!(p.exists());
        assert!(p.with_extension("txt").exists());
        let txt = std::fs::read_to_string(p.with_extension("txt")).unwrap();
        assert!(txt.contains("2:18.200"), "{txt}");
        let i = info(&dir);
        assert_eq!(i.count, 1);
        assert_eq!(i.recent[0].track, "Spa-Francorchamps");
        assert_eq!(prune(&dir, 0, 0, true), 1);
        assert_eq!(info(&dir).count, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn laps_and_incidents() {
        let s = SessionData::default();
        let mut h = History::default();
        let mut f = Frame::default();
        f.player_idx = 0;
        f.lap = 1;
        f.fuel_level = 50.0;
        f.is_on_track = true;
        f.cars[0].surface = 3;
        let mut t = 0.0;
        // İki tam tur, 100 s'lik
        for step in 0..=2000 {
            t = step as f64 * 0.1;
            let pct = ((t % 100.0) / 100.0) as f32;
            f.session_time = t;
            f.lap = 1 + (t / 100.0) as i32;
            f.lap_dist_pct = pct;
            f.fuel_level = 50.0 - (t / 100.0) as f32 * 2.0;
            if f.lap != 1 {
                f.lap_last = 100.0;
            }
            if (150.0..150.1).contains(&t) {
                f.incidents = 2;
            }
            h.update(&f, &s, false);
        }
        let _ = t;
        let l = h.laps(&f);
        assert_eq!(l.laps.len(), 2);
        assert!(l.laps[0].valid);
        assert!(!l.laps[1].valid);
        assert_eq!(l.laps[0].sectors.len(), 3);
        assert!((l.laps[0].sectors[0] - 33.4).abs() < 0.2, "{:?}", l.laps[0].sectors);
        assert!((l.laps[0].fuel - 2.0).abs() < 0.01);
        let inc = h.incidents(&f, &s);
        assert_eq!(inc.list.len(), 1);
        assert_eq!(inc.list[0].sector, 2);
        assert_eq!(inc.list[0].kind, "Kontrol kaybı / duvar");
        assert_eq!(l.best, 100.0);
    }
}
