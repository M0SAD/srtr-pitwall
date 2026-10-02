//! Telemetri kaydı (Garage61 benzeri): canlı bir sim oturumunda oyuncunun tamamladığı her tur
//! özetiyle (süre, geçerlilik, olay, sektörler, yakıt, hava...) ve tur mesafesine göre
//! örneklenmiş kısa bir iziyle (hız, gaz, fren, vites, direksiyon) kaydedilir.
//!
//! Turlar önce yerel kuyruğa (`<app data>/telemetry/queue.jsonl`, satır başına bir tur) yazılır.
//! Arayüz (overlay penceresi, `src/cloud/telemetry.ts`) giriş yapılmışsa kuyruğu okuyup Supabase'e
//! yükler ve yüklenenleri `telemetry_ack` ile kuyruktan siler. Demo/önizleme verisi kaydedilmez.

use crate::model::{Frame, SessionData, MAX_CARS};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

/// İz çözünürlüğü: tur mesafesi bu kadar eşit parçaya bölünür
pub const TRACE_POINTS: usize = 360;
/// İz geçerli sayılmak için doldurulması gereken en az nokta oranı
const TRACE_MIN_FILL: f32 = 0.8;
/// Tur geçince simin son tur süresini güncellemesi için beklenen en uzun süre (oturum saniyesi)
const LAST_LAP_WAIT: f64 = 2.5;
/// Kuyrukta tutulan en fazla tur (eski turlar atılır)
pub const QUEUE_MAX: usize = 3000;

/// Mesafeye göre örneklenmiş tur izi. Diziler `n` uzunluğundadır; i. nokta turun i/n konumudur.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Trace {
    pub n: u32,
    /// Tur başından geçen süre (ms)
    pub t: Vec<i32>,
    /// Hız (km/h x10)
    pub speed: Vec<i32>,
    /// Gaz ve fren (0-100)
    pub throttle: Vec<u8>,
    pub brake: Vec<u8>,
    pub gear: Vec<i8>,
    /// Direksiyon açısı (derece, sola pozitif)
    pub steer: Vec<i16>,
}

impl Trace {
    /// Mesafe oranındaki (0..1) süre (sn), doğrusal ara değerle
    pub fn time_at(&self, pct: f32) -> Option<f32> {
        let n = self.t.len();
        if n == 0 {
            return None;
        }
        let x = (pct.clamp(0.0, 1.0) * n as f32).min(n as f32 - 1.0);
        let i = x.floor() as usize;
        let j = (i + 1).min(n - 1);
        let f = x - i as f32;
        Some((self.t[i] as f32 * (1.0 - f) + self.t[j] as f32 * f) / 1000.0)
    }
}

/// Kaydedilen tek tur. Alan adları Supabase `telemetry_record_lap(p_lap jsonb)` ile aynıdır.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LapRecord {
    /// Kuyruk / sunucu kimliği: `<oturum>-<tur>`
    pub id: String,
    /// Yerel oturum kimliği (sim + başlangıç zamanı)
    pub session_local: String,
    pub sim: String,
    pub track_id: String,
    pub track_name: String,
    pub track_config: String,
    pub track_length_km: f32,
    pub car_id: String,
    pub car_name: String,
    pub car_class: String,
    /// practice | qualify | race | warmup | hotlap | other
    pub session_type: String,
    /// Simin verdiği ham oturum adı ("Open Qualify", "Practice"...)
    pub session_kind: String,
    pub session_num: i32,
    /// Oturum kaydının başladığı an (unix ms)
    pub session_started: u64,
    /// Simdeki sürücü adı ve kimliği (iRacing CustID; diğer simlerde boş)
    pub driver_name: String,
    pub driver_id: String,
    pub lap: i32,
    /// Tur süresi (sn)
    pub lap_time: f32,
    /// Üç eşit mesafeli sektör süreleri (iz yoksa boş)
    pub sectors: Vec<f32>,
    pub valid: bool,
    /// Pit çıkış ya da giriş turu
    pub pit: bool,
    pub off_track: bool,
    /// Sim turu geçersiz saydı (pist sınırı vb.)
    pub sim_invalid: bool,
    /// Tur boyunca alınan olay puanı (iRacing)
    pub incidents: i32,
    pub fuel_used: f32,
    pub air_temp: f32,
    pub track_temp: f32,
    /// Islaklık (0 bilinmiyor, 1 kuru ... 7 çok ıslak; iRacing ölçeği)
    pub wetness: i32,
    /// Yağış (0-1, bilinmiyorsa -1)
    pub precip: f32,
    pub position: i32,
    pub class_position: i32,
    /// Turun bittiği an (unix ms)
    pub ts: u64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub trace: Option<Trace>,
}

#[derive(Clone, Copy, Default)]
struct Sample {
    set: bool,
    t: f32,
    speed: f32,
    throttle: f32,
    brake: f32,
    gear: i32,
    steer: f32,
}

/// Süren tur
struct Cur {
    lap: i32,
    /// Tur çizgide başladı mı (bağlanınca yarıda yakalanan tur kaydedilmez)
    full: bool,
    start_time: f64,
    start_fuel: f32,
    inc_start: i32,
    off_track: bool,
    sim_invalid: bool,
    pit: bool,
    /// Tur içinde geri sıçrama (sıfırlama, çekici): iz bozuk, tur geçersiz
    broken: bool,
    max_pct: f32,
    samples: Vec<Sample>,
    /// Tur başladığında simin "son tur" değeri (değişince yeni süre gelmiş demektir)
    prev_last: f32,
}

/// Bitti, simin süreyi yazmasını bekliyor
struct Pending {
    rec: LapRecord,
    samples: Vec<Sample>,
    measured: f32,
    prev_last: f32,
    deadline: f64,
}

#[derive(Default)]
pub struct Recorder {
    key: String,
    session_local: String,
    started: u64,
    /// Aynı milisaniyede iki oturum açılırsa kimlik çakışmasın
    last_started: u64,
    cur: Option<Cur>,
    pending: Option<Pending>,
}

pub fn now_ms() -> u64 {
    crate::history::now_ms()
}

/// Oturum adından kategori
pub fn session_type(kind: &str) -> &'static str {
    let k = kind.to_lowercase();
    if k.contains("race") || k.contains("heat") || k.contains("feature") {
        "race"
    } else if k.contains("qual") || k.contains("superpole") {
        "qualify"
    } else if k.contains("warm") {
        "warmup"
    } else if k.contains("hot") || k.contains("time attack") || k.contains("timeattack") {
        "hotlap"
    } else if k.contains("practice") || k.contains("test") || k.contains("offline") {
        "practice"
    } else {
        "other"
    }
}

/// Telemetri oturumunun ham adı; rakipler yapay zekâysa sonuna " [AI]" eklenir
/// (arayüz "Botlarla yarış" süzgeci bunu okur, bkz. src/cloud/telemetry.ts isAiSession)
pub fn session_kind_tag(kind: &str, ai: bool) -> String {
    let k: String = kind.chars().take(50).collect();
    if ai {
        format!("{k} [AI]")
    } else {
        k
    }
}

/// Sim içi kimlik yoksa adlardan kararlı anahtar
pub fn slug(s: &str) -> String {
    let t: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    t.chars().take(80).collect()
}

impl Recorder {
    pub fn reset(&mut self) {
        self.cur = None;
        self.pending = None;
        self.key.clear();
    }

    /// Her yeni karede çağrılır. `active` false iken (demo, önizleme, bağlantı yok, kayıt kapalı)
    /// kayıt yapılmaz; bekleyen tur ölçülen süreyle bitirilir. Tamamlanan tur döner.
    pub fn update(&mut self, f: &Frame, s: &SessionData, sim: &str, active: bool) -> Option<LapRecord> {
        if !active || sim.is_empty() {
            let out = self.pending.take().map(|p| finish(p, None));
            self.cur = None;
            self.key.clear();
            return out.flatten();
        }
        let mut out = None;

        // Önceki tur süresi bekleniyor
        if let Some(p) = self.pending.as_ref() {
            let changed = f.lap_last > 0.0 && (f.lap_last - p.prev_last).abs() > 0.0005;
            if changed || f.session_time >= p.deadline || f.session_time < p.deadline - LAST_LAP_WAIT - 1.0 {
                let p = self.pending.take().unwrap();
                out = finish(p, changed.then_some(f.lap_last));
            }
        }

        if f.player_idx < 0 || f.player_idx as usize >= MAX_CARS || f.replay {
            self.cur = None;
            return out;
        }
        let me = f.cars[f.player_idx as usize];
        let player = s.player();
        let track_id = if s.track_id > 0 { s.track_id.to_string() } else { slug(&s.track_name) };
        let car_id = match player {
            Some(d) if d.car_id > 0 => d.car_id.to_string(),
            Some(d) if !d.car_path.is_empty() => slug(&d.car_path),
            Some(d) => slug(&d.car_name),
            None => String::new(),
        };
        let key = format!("{sim}|{track_id}|{}|{car_id}|{}", s.track_config, f.session_num);
        if key != self.key {
            // Yeni oturum (ya da pist/araç değişti)
            self.key = key;
            self.started = now_ms().max(self.last_started + 1);
            self.last_started = self.started;
            self.session_local = format!("{sim}-{}-{}", self.started, f.session_num.max(0));
            self.cur = None;
        }

        // Garajda / pistte değil: süren tur bırakılır
        if !f.is_on_track || f.is_in_garage {
            self.cur = None;
            return out;
        }

        let pct = f.lap_dist_pct;
        let lap_changed = self.cur.as_ref().map(|c| c.lap != f.lap).unwrap_or(true);
        if lap_changed {
            if let Some(c) = self.cur.take() {
                if f.lap == c.lap + 1 && c.full && c.lap > 0 {
                    let measured = (f.session_time - c.start_time) as f32;
                    let rec = self.build(f, s, sim, &c, &track_id, &car_id, me.position, me.class_position);
                    let p = Pending {
                        rec,
                        samples: c.samples,
                        measured,
                        prev_last: c.prev_last,
                        deadline: f.session_time + LAST_LAP_WAIT,
                    };
                    // Sim süreyi aynı karede yazdıysa beklemeden bitir
                    if f.lap_last > 0.0 && (f.lap_last - p.prev_last).abs() > 0.0005 {
                        let v = f.lap_last;
                        if let Some(r) = finish(p, Some(v)) {
                            if out.is_none() {
                                out = Some(r);
                            }
                        }
                    } else if let Some(old) = self.pending.replace(p) {
                        // Çok hızlı ardışık turlar (olmamalı): eskisini ölçülen süreyle bitir
                        if out.is_none() {
                            out = finish(old, None);
                        }
                    }
                }
                let full = f.lap == c.lap + 1;
                self.cur = Some(new_cur(f, full));
            } else {
                // İlk kare: tur çizgisinde başlamadıkça bu tur kaydedilmez
                self.cur = Some(new_cur(f, false));
            }
        }

        let c = self.cur.as_mut().unwrap();
        let elapsed = (f.session_time - c.start_time) as f32;
        // Sim önceki turun süresini çizgiden birkaç kare sonra yazabilir (iRacing): turun
        // ortasındaki değer, bu tur bitince "değişti mi" karşılaştırmasının temelidir
        if elapsed as f64 > LAST_LAP_WAIT + 0.5 {
            c.prev_last = f.lap_last;
        }
        if me.surface == 0 {
            c.off_track = true;
        }
        if f.on_pit_road {
            c.pit = true;
        }
        // Sim bayrağı: turun ilk saniyesinde önceki turdan kalmış olabilir
        if f.lap_invalid && elapsed > 1.0 {
            c.sim_invalid = true;
        }
        if (0.0..1.0).contains(&pct) {
            // Tur başında önceki turun sonu (0.99...) ve sonunda yeni turun başı (0.0x) görülebilir
            let plausible = !(elapsed < 3.0 && pct > 0.5);
            if plausible && pct + 0.02 < c.max_pct && c.max_pct - pct < 0.9 {
                c.broken = true;
            }
            if plausible && pct + 0.02 >= c.max_pct {
                c.max_pct = c.max_pct.max(pct);
                let b = ((pct * TRACE_POINTS as f32) as usize).min(TRACE_POINTS - 1);
                let sm = &mut c.samples[b];
                if !sm.set {
                    *sm = Sample {
                        set: true,
                        t: elapsed.max(0.0),
                        speed: f.speed,
                        throttle: f.throttle,
                        brake: f.brake,
                        gear: f.gear,
                        steer: f.steer,
                    };
                }
            }
        }
        out
    }

    #[allow(clippy::too_many_arguments)]
    fn build(&self, f: &Frame, s: &SessionData, sim: &str, c: &Cur, track_id: &str, car_id: &str, pos: i32, cpos: i32) -> LapRecord {
        let player = s.player();
        let kind = s.session(f.session_num).map(|x| x.kind.clone()).unwrap_or_default();
        let incidents = (f.incidents - c.inc_start).max(0);
        let fuel = c.start_fuel - f.fuel_level;
        LapRecord {
            id: format!("{}-{}", self.session_local, c.lap),
            session_local: self.session_local.clone(),
            sim: sim.to_string(),
            track_id: track_id.to_string(),
            track_name: s.track_name.clone(),
            track_config: s.track_config.clone(),
            track_length_km: s.track_length_km,
            car_id: car_id.to_string(),
            car_name: player.map(|d| d.car_name.clone()).unwrap_or_default(),
            car_class: player.map(|d| d.class_name.clone()).unwrap_or_default(),
            session_type: session_type(&kind).to_string(),
            session_kind: session_kind_tag(&kind, s.has_ai_opponents()),
            session_num: f.session_num,
            session_started: self.started,
            driver_name: player.map(|d| d.name.clone()).unwrap_or_default(),
            driver_id: player.filter(|d| d.user_id > 0).map(|d| d.user_id.to_string()).unwrap_or_default(),
            lap: c.lap,
            lap_time: 0.0,
            sectors: Vec::new(),
            valid: !(c.off_track || c.sim_invalid || incidents > 0 || c.broken),
            pit: c.pit || f.on_pit_road,
            off_track: c.off_track,
            sim_invalid: c.sim_invalid,
            incidents,
            // Pitte yakıt alındıysa (negatif) bilinmiyor
            fuel_used: if fuel > 0.0 && fuel < 50.0 { fuel } else { 0.0 },
            air_temp: f.air_temp,
            track_temp: f.track_temp,
            wetness: f.track_wetness,
            precip: f.precip,
            position: pos.max(0),
            class_position: cpos.max(0),
            ts: now_ms(),
            trace: None,
        }
    }
}

fn new_cur(f: &Frame, full: bool) -> Cur {
    Cur {
        lap: f.lap,
        full,
        start_time: f.session_time,
        start_fuel: f.fuel_level,
        inc_start: f.incidents,
        off_track: false,
        sim_invalid: false,
        pit: f.on_pit_road,
        broken: false,
        max_pct: 0.0,
        samples: vec![Sample::default(); TRACE_POINTS],
        prev_last: f.lap_last,
    }
}

/// Bekleyen turu bitirir: süre (sim değeri ölçülenle tutarlıysa o), iz ve sektörler.
fn finish(p: Pending, sim_time: Option<f32>) -> Option<LapRecord> {
    let mut rec = p.rec;
    let t = match sim_time {
        Some(v) if (v - p.measured).abs() < 1.0 => v,
        _ => p.measured,
    };
    if !(t > 1.0 && t < 3600.0) {
        return None;
    }
    rec.lap_time = t;
    rec.trace = build_trace(&p.samples, t);
    if let Some(tr) = rec.trace.as_ref() {
        let a = tr.time_at(1.0 / 3.0).unwrap_or(0.0);
        let b = tr.time_at(2.0 / 3.0).unwrap_or(0.0);
        if a > 0.0 && b > a && t > b {
            rec.sectors = vec![round3(a), round3(b - a), round3(t - b)];
        }
    }
    Some(rec)
}

fn round3(v: f32) -> f32 {
    (v * 1000.0).round() / 1000.0
}

/// Örneklerden iz üretir; boşlukları komşu noktalardan doğrusal doldurur.
/// Yeterince dolu değilse (bağlantı koptu, takıldı) None.
fn build_trace(samples: &[Sample], lap_time: f32) -> Option<Trace> {
    let n = samples.len();
    let filled = samples.iter().filter(|s| s.set).count();
    if n == 0 || (filled as f32) < n as f32 * TRACE_MIN_FILL {
        return None;
    }
    let idx: Vec<usize> = (0..n).filter(|&i| samples[i].set).collect();
    let mut full: Vec<Sample> = Vec::with_capacity(n);
    for i in 0..n {
        if samples[i].set {
            full.push(samples[i]);
            continue;
        }
        // Önceki ve sonraki dolu nokta (tur sonu: süre lap_time'a doğru)
        let prev = idx.iter().rev().find(|&&j| j < i).copied();
        let next = idx.iter().find(|&&j| j > i).copied();
        let s = match (prev, next) {
            (Some(a), Some(b)) => {
                let k = (i - a) as f32 / (b - a) as f32;
                lerp(&samples[a], &samples[b], k)
            }
            (Some(a), None) => {
                let mut x = samples[a];
                let k = (i - a) as f32 / (n - a) as f32;
                x.t = samples[a].t + (lap_time - samples[a].t) * k;
                x
            }
            (None, Some(b)) => {
                let mut x = samples[b];
                x.t = samples[b].t * i as f32 / b.max(1) as f32;
                x
            }
            (None, None) => Sample::default(),
        };
        full.push(s);
    }
    // Süre artan olmalı
    for i in 1..n {
        if full[i].t < full[i - 1].t {
            full[i].t = full[i - 1].t;
        }
    }
    Some(Trace {
        n: n as u32,
        t: full.iter().map(|s| (s.t * 1000.0).round() as i32).collect(),
        speed: full.iter().map(|s| (s.speed * 36.0).round() as i32).collect(),
        throttle: full.iter().map(|s| (s.throttle.clamp(0.0, 1.0) * 100.0).round() as u8).collect(),
        brake: full.iter().map(|s| (s.brake.clamp(0.0, 1.0) * 100.0).round() as u8).collect(),
        gear: full.iter().map(|s| s.gear.clamp(-1, 12) as i8).collect(),
        steer: full.iter().map(|s| s.steer.to_degrees().clamp(-1080.0, 1080.0).round() as i16).collect(),
    })
}

fn lerp(a: &Sample, b: &Sample, k: f32) -> Sample {
    let m = |x: f32, y: f32| x + (y - x) * k;
    Sample {
        set: true,
        t: m(a.t, b.t),
        speed: m(a.speed, b.speed),
        throttle: m(a.throttle, b.throttle),
        brake: m(a.brake, b.brake),
        gear: if k < 0.5 { a.gear } else { b.gear },
        steer: m(a.steer, b.steer),
    }
}

// ---- Yerel kuyruk ----

static QUEUE_LOCK: Mutex<()> = Mutex::new(());

pub fn queue_path(app_data: &Path) -> PathBuf {
    app_data.join("telemetry").join("queue.jsonl")
}

fn read_lines(path: &Path) -> Vec<String> {
    std::fs::read_to_string(path)
        .map(|s| s.lines().filter(|l| !l.trim().is_empty()).map(String::from).collect())
        .unwrap_or_default()
}

fn write_lines(path: &Path, lines: &[String]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    let mut body = lines.join("\n");
    if !body.is_empty() {
        body.push('\n');
    }
    std::fs::write(&tmp, body)?;
    std::fs::rename(&tmp, path)
}

/// Turu kuyruğun sonuna ekler; kuyruk doluysa en eski turlar atılır.
pub fn append(path: &Path, rec: &LapRecord) -> std::io::Result<()> {
    let _g = QUEUE_LOCK.lock();
    if let Some(d) = path.parent() {
        std::fs::create_dir_all(d)?;
    }
    let line = serde_json::to_string(rec).map_err(std::io::Error::other)?;
    let mut fh = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(fh, "{line}")?;
    drop(fh);
    // Ara sıra boyut denetimi (her turda tüm dosyayı okumamak için)
    if rec.lap % 10 == 0 {
        let lines = read_lines(path);
        if lines.len() > QUEUE_MAX {
            write_lines(path, &lines[lines.len() - QUEUE_MAX..])?;
        }
    }
    Ok(())
}

/// Kuyruktaki en eski `limit` tur
pub fn pending(path: &Path, limit: usize) -> Vec<serde_json::Value> {
    let _g = QUEUE_LOCK.lock();
    read_lines(path).iter().filter_map(|l| serde_json::from_str(l).ok()).take(limit).collect()
}

/// Kuyruktaki tur sayısı
pub fn count(path: &Path) -> usize {
    let _g = QUEUE_LOCK.lock();
    read_lines(path).len()
}

/// Yüklenen turları kuyruktan siler; kalan sayıyı döner. Okunamayan satırlar da atılır.
pub fn ack(path: &Path, ids: &[String]) -> std::io::Result<usize> {
    let _g = QUEUE_LOCK.lock();
    let lines = read_lines(path);
    let keep: Vec<String> = lines
        .into_iter()
        .filter(|l| match serde_json::from_str::<serde_json::Value>(l) {
            Ok(v) => !v.get("id").and_then(|x| x.as_str()).map(|id| ids.iter().any(|i| i == id)).unwrap_or(true),
            Err(_) => false,
        })
        .collect();
    if path.exists() {
        write_lines(path, &keep)?;
    }
    Ok(keep.len())
}

/// Kuyruğu tamamen boşaltır (kullanıcı isteği)
pub fn clear(path: &Path) -> std::io::Result<()> {
    let _g = QUEUE_LOCK.lock();
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Driver, SessionEntry};

    #[test]
    fn ai_tag() {
        assert_eq!(session_kind_tag("Race", true), "Race [AI]");
        assert_eq!(session_kind_tag("Practice", false), "Practice");
        let mut s = session();
        assert!(!s.has_ai_opponents());
        s.drivers.push(Some(Driver { car_idx: 1, is_ai: true, ..Default::default() }));
        assert!(s.has_ai_opponents());
    }

    fn session() -> SessionData {
        let mut s = SessionData {
            track_name: "Spa-Francorchamps".into(),
            track_config: "Grand Prix".into(),
            track_length_km: 7.004,
            track_id: 163,
            player_idx: 0,
            ..Default::default()
        };
        s.drivers = vec![Some(Driver {
            car_idx: 0,
            user_id: 123456,
            name: "Erkin Azcan".into(),
            car_name: "Porsche 911 GT3 R".into(),
            car_id: 169,
            class_name: "GT3".into(),
            ..Default::default()
        })];
        s.sessions = vec![SessionEntry { num: 0, kind: "Open Qualify".into(), laps: None, time: None }];
        s
    }

    /// `laps` tur boyunca 60 Hz kare üretir; `lap_len` sn'lik turlar, `start_pct` konumundan başlar.
    /// `hook(t, frame)` her karede çağrılır.
    fn drive(r: &mut Recorder, s: &SessionData, start_pct: f64, lap_len: f64, secs: f64, mut hook: impl FnMut(f64, &mut Frame)) -> Vec<LapRecord> {
        let mut f = Frame { player_idx: 0, is_on_track: true, fuel_level: 60.0, ..Default::default() };
        f.cars[0].surface = 3;
        f.cars[0].position = 4;
        f.cars[0].class_position = 2;
        let mut out = Vec::new();
        let steps = (secs * 60.0) as i64;
        for i in 0..=steps {
            let t = i as f64 / 60.0;
            let d = start_pct + t / lap_len;
            f.session_time = 1000.0 + t;
            f.lap = 1 + d.floor() as i32;
            f.lap_dist_pct = (d - d.floor()) as f32;
            f.speed = 30.0 + 20.0 * (f.lap_dist_pct * 6.28).sin();
            f.throttle = 0.8;
            f.gear = 4;
            f.fuel_level = 60.0 - (t / lap_len) as f32 * 2.5;
            // iRacing gibi: son tur süresi tur geçtikten 3 kare sonra güncellenir
            let since = d - d.floor();
            if f.lap > 1 && since * lap_len > 3.0 / 60.0 {
                f.lap_last = (lap_len + (f.lap - 1) as f64 * 0.001) as f32;
            }
            hook(t, &mut f);
            if let Some(l) = r.update(&f, s, "iracing", true) {
                out.push(l);
            }
        }
        out
    }

    #[test]
    fn laps_completed_with_trace() {
        let s = session();
        let mut r = Recorder::default();
        // %50'den başla: ilk (yarım) tur kaydedilmez, ardından 2 tam tur
        let laps = drive(&mut r, &s, 0.5, 100.0, 252.0, |_, _| {});
        assert_eq!(laps.len(), 2, "{:?}", laps.iter().map(|l| (l.lap, l.lap_time)).collect::<Vec<_>>());
        let l = &laps[0];
        assert_eq!(l.lap, 2);
        assert!((l.lap_time - 100.0).abs() < 0.02, "{}", l.lap_time);
        assert!(l.valid && !l.pit && !l.off_track);
        assert_eq!(l.sim, "iracing");
        assert_eq!(l.track_id, "163");
        assert_eq!(l.car_id, "169");
        assert_eq!(l.driver_id, "123456");
        assert_eq!(l.driver_name, "Erkin Azcan");
        assert_eq!(l.session_type, "qualify");
        assert_eq!(l.position, 4);
        assert!((l.fuel_used - 2.5).abs() < 0.05, "{}", l.fuel_used);
        assert_eq!(l.sectors.len(), 3);
        assert!((l.sectors[0] - 33.33).abs() < 0.1, "{:?}", l.sectors);
        assert!((l.sectors.iter().sum::<f32>() - l.lap_time).abs() < 0.01);
        let tr = l.trace.as_ref().expect("iz");
        assert_eq!(tr.n as usize, TRACE_POINTS);
        assert_eq!(tr.t.len(), TRACE_POINTS);
        assert!(tr.t.windows(2).all(|w| w[1] >= w[0]));
        assert!(tr.t[0] < 50 && *tr.t.last().unwrap() > 99_000);
        assert_eq!(tr.throttle[100], 80);
        assert_eq!(tr.gear[10], 4);
        // Aynı oturum kimliği
        assert_eq!(laps[0].session_local, laps[1].session_local);
        assert_ne!(laps[0].id, laps[1].id);
    }

    #[test]
    fn invalid_offtrack_incident_and_pit() {
        let s = session();
        let mut r = Recorder::default();
        let laps = drive(&mut r, &s, 0.9, 50.0, 50.0 * 4.0, |t, f| {
            // 2. tur: pist dışı; 3. tur: olay; 4. tur: pit yolu
            let lap_t = t + 0.9 * 50.0;
            f.cars[0].surface = if (60.0..61.0).contains(&lap_t) { 0 } else { 3 };
            if lap_t > 120.0 {
                f.incidents = 2;
            }
            f.on_pit_road = (170.0..175.0).contains(&lap_t);
        });
        assert_eq!(laps.len(), 3);
        assert!(!laps[0].valid && laps[0].off_track);
        assert!(!laps[1].valid && laps[1].incidents == 2, "{:?}", laps[1]);
        assert!(laps[2].valid && laps[2].pit && laps[2].incidents == 0);
    }

    #[test]
    fn sim_flag_and_reset() {
        let s = session();
        let mut r = Recorder::default();
        let laps = drive(&mut r, &s, 0.0, 40.0, 40.0 * 3.0 + 1.0, |t, f| {
            // 1. turun ortasında sim turu geçersiz sayar; turun ilk saniyesinde kalan bayrak sayılmaz
            f.lap_invalid = (10.0..12.0).contains(&t) || (40.0..40.5).contains(&t);
        });
        // İlk kare çizgide (pct 0) ama başlangıcı görmediğimiz için 1. tur kaydedilmez
        assert_eq!(laps.len(), 2);
        assert!(laps[0].valid, "{:?}", laps[0].sim_invalid);
        // Pasif olunca süren tur bırakılır, oturum yenilenir
        let before = laps[0].session_local.clone();
        let f = Frame::default();
        assert!(r.update(&f, &s, "iracing", false).is_none());
        let more = drive(&mut r, &s, 0.0, 40.0, 81.0, |_, _| {});
        assert!(!more.is_empty());
        assert_ne!(more[0].session_local, before);
    }

    #[test]
    fn sim_invalid_mid_lap() {
        let s = session();
        let mut r = Recorder::default();
        let laps = drive(&mut r, &s, 0.95, 40.0, 40.0 * 2.0, |t, f| {
            f.lap_invalid = (20.0..21.0).contains(&t);
        });
        assert_eq!(laps.len(), 1);
        assert!(!laps[0].valid && laps[0].sim_invalid);
    }

    #[test]
    fn trace_gaps_filled_and_sparse_rejected() {
        let mut s = vec![Sample::default(); 100];
        for (i, x) in s.iter_mut().enumerate() {
            if i % 5 != 3 {
                *x = Sample { set: true, t: i as f32, speed: i as f32, throttle: 1.0, brake: 0.0, gear: 3, steer: 0.1 };
            }
        }
        let tr = build_trace(&s, 100.0).unwrap();
        assert_eq!(tr.t[3], 3000);
        assert_eq!(tr.speed[3], (3.0f32 * 36.0).round() as i32);
        assert_eq!(tr.steer[0], 6);
        let sparse: Vec<Sample> = (0..100).map(|i| if i < 50 { s[0] } else { Sample::default() }).collect();
        assert!(build_trace(&sparse, 100.0).is_none());
        assert_eq!(tr.time_at(0.5), Some(50.0));
    }

    #[test]
    fn session_types() {
        assert_eq!(session_type("Race"), "race");
        assert_eq!(session_type("Lone Qualify"), "qualify");
        assert_eq!(session_type("Offline Testing"), "practice");
        assert_eq!(session_type("Hotlap"), "hotlap");
        assert_eq!(session_type("Warmup"), "warmup");
        assert_eq!(session_type(""), "other");
        assert_eq!(slug("ks_nordschleife / Touristenfahrten"), "ks-nordschleife-touristenfahrten");
    }

    #[test]
    fn queue_roundtrip() {
        let dir = std::env::temp_dir().join(format!("pw-tq-{}", now_ms()));
        let p = queue_path(&dir);
        for i in 1..=3 {
            let rec = LapRecord { id: format!("x-{i}"), lap: i, lap_time: 90.0, ..Default::default() };
            append(&p, &rec).unwrap();
        }
        assert_eq!(count(&p), 3);
        let v = pending(&p, 2);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0]["id"], "x-1");
        assert!(v[0].get("trace").is_none());
        assert_eq!(ack(&p, &["x-1".into(), "x-3".into()]).unwrap(), 1);
        assert_eq!(pending(&p, 10)[0]["id"], "x-2");
        clear(&p).unwrap();
        assert_eq!(count(&p), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
