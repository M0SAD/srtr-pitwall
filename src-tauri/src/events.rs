//! Olaylar ekranı: oturum boyunca olan önemli anların tam listesi (kazalar, geçişler, pit,
//! en hızlı turlar, bayraklar, start/bitiş). Her olayın oturum numarası ve oturum zamanı
//! (sn) tutulur; Olaylar penceresi bir olaya tıklanınca iRacing tekrarını o ana sarar.
//!
//! Kaynaklar:
//! - Tracker'ın yarış kontrol olayları (liderlik, ±3 sıra, pit giriş/çıkış, sınıf en hızlı tur,
//!   siyah/hasar/DQ bayrakları) kimliğe göre kopyalanır.
//! - Oyuncunun kendi olay puanı artışları (1x/2x/4x), sıra değişimleri, kişisel en iyi turu.
//! - Diğer araçların pist dışına çıkması (CarIdxTrackSurface = 0), oturum bayrakları.
//! - Yarış başlangıcı ve oyuncunun damalı bayrağı görmesi (Olaylar penceresini otomatik açar).
//!
//! Tekrar izlenirken (f.replay) kayıt durur: tekrar oynatılırken telemetri geçmiş anları
//! gösterir ve sahte olay üretmemesi gerekir.

use crate::model::{Frame, SessionData, MAX_CARS};
use crate::tracker::{fmt_lap, Tracker, CF_BLUE};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// En fazla tutulan olay sayısı
pub const MAX_EVENTS: usize = 500;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RaceEvent {
    pub id: u64,
    pub session_num: i32,
    /// Oturum zamanı (sn)
    pub time: f64,
    pub lap: i32,
    /// incident | offTrack | invalid | pass | passed | lead | gained | lost | pitIn | pitOut |
    /// repair | fastest | best | flag | penalty | start | finish
    pub kind: &'static str,
    /// Ek bilgi: olay puanı ("4x"), bayrak adı ("yellow") vb.
    pub sub: String,
    pub idx: i32,
    pub number: String,
    pub name: String,
    pub class_color: String,
    /// Türkçe açıklama (arayüzde çevrilir)
    pub text: String,
    pub is_me: bool,
    /// Tekrarda kameranın odaklanacağı araç numarası
    pub focus: String,
}

/// Oturum özeti (Olaylar penceresinin başlığı): her canlı karede güncellenir, oturum bitince
/// olaylarla birlikte saklanır.
#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub car: String,
    /// Kaydın başladığı an (Unix ms); uygulama oturumun ortasında açıldıysa oturumun başı değildir
    pub started_at: u64,
    /// Son karedeki oturum zamanı (sn)
    pub duration: f64,
    /// Oyuncunun tamamladığı tur
    pub laps: i32,
    /// Oyuncunun en iyi turu (sn), yoksa 0
    pub best_lap: f32,
    /// Sınıf içi sıra (son kare), bilinmiyorsa 0
    pub position: i32,
    /// Başlangıç sırası (sınıf içi), bilinmiyorsa 0
    pub start_position: i32,
    /// Simin bildirdiği toplam olay puanı (kayıt başlamadan önce alınanlar dahil)
    pub incidents: i32,
    /// Oturumun olay puanı sınırı, yoksa 0
    pub incident_limit: i32,
    /// Sim olay puanı veriyor mu (yalnızca iRacing ve demo)
    pub has_incidents: bool,
}

/// Hangi olay türleri kaydedilsin (ayar: `general.eventsRecord`). Start/bitiş her zaman kaydedilir.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Record {
    pub crash: bool,
    pub pass: bool,
    pub pit: bool,
    pub fast: bool,
    pub flag: bool,
    /// Diğer sürücülerin olayları (kapalıysa yalnızca oyuncununkiler)
    pub others: bool,
}

impl Default for Record {
    fn default() -> Self {
        Record { crash: true, pass: true, pit: true, fast: true, flag: true, others: true }
    }
}

impl Record {
    /// `general.eventsRecord` nesnesinden okur; eksik alanlar açık sayılır
    pub fn from_settings(v: Option<&serde_json::Value>) -> Record {
        let g = |k: &str| v.and_then(|v| v.get(k)).and_then(|x| x.as_bool()).unwrap_or(true);
        Record { crash: g("crash"), pass: g("pass"), pit: g("pit"), fast: g("fast"), flag: g("flag"), others: g("others") }
    }

    fn allows(&self, ev: &RaceEvent) -> bool {
        let cat = match category(ev.kind) {
            "crash" => self.crash,
            "pass" => self.pass,
            "pit" => self.pit,
            "fast" => self.fast,
            "flag" => self.flag,
            _ => return true,
        };
        cat && (self.others || ev.is_me)
    }
}

/// Olay türünün süzgeç grubu (arayüzdeki çiplerle aynı): crash | pass | pit | fast | flag | session
pub fn category(kind: &str) -> &'static str {
    match kind {
        "incident" | "offTrack" | "invalid" => "crash",
        "pass" | "passed" | "lead" | "gained" | "lost" => "pass",
        "pitIn" | "pitOut" | "repair" => "pit",
        "fastest" | "best" => "fast",
        "flag" | "penalty" => "flag",
        _ => "session",
    }
}

/// iRacing olay puanı artışının türü. Tek karede birden çok olay birleşebilir (ör. 3x = 1x + 2x).
pub fn incident_text(delta: i32) -> &'static str {
    match delta {
        3 => "Pist dışı + kontrol kaybı",
        d => crate::history::incident_kind(d),
    }
}

/// Bekleyen ceza kodunun (Frame::penalty) açıklaması
fn penalty_text(code: u8) -> (&'static str, &'static str) {
    match code {
        1 => ("driveThrough", "pit geçişi cezası"),
        2 => ("stopGo", "dur-kalk cezası"),
        3 => ("dq", "diskalifiye"),
        4 => ("time", "süre cezası"),
        _ => ("penalty", "ceza aldın"),
    }
}

static REV: AtomicU64 = AtomicU64::new(1);
fn next_rev() -> u64 {
    REV.fetch_add(1, Ordering::Relaxed)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Biten bir oturumun saklanan kopyası
#[derive(Clone)]
struct Snapshot {
    sim: &'static str,
    track: String,
    session_kind: String,
    session_num: i32,
    summary: Summary,
    events: Vec<RaceEvent>,
}

/// Olaylar penceresinin hangi oturumu istediği
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum View {
    /// Güncel oturum; boşsa (ve varsa) önceki oturum
    Auto,
    Current,
    Previous,
}

impl View {
    pub fn parse(s: Option<&str>) -> View {
        match s {
            Some("current") => View::Current,
            Some("previous") => View::Previous,
            _ => View::Auto,
        }
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct EventsInfo {
    /// Bağlı sim kısa adı ("iracing", "acc"...), demo/bağlı değilse boş
    pub sim: String,
    pub demo: bool,
    pub connected: bool,
    pub track: String,
    pub session_kind: String,
    pub session_num: i32,
    /// Tekrara atlama mümkün mü (iRacing, demo değil, bağlı)
    pub replay_ok: bool,
    /// Liste, biten bir önceki oturuma ait (yeni oturumda henüz olay yok)
    pub previous: bool,
    /// Saklanan bir önceki oturum var (pencerede "Önceki oturum" düğmesi)
    pub has_previous: bool,
    /// Güncel oturumda en az bir olay var
    pub has_current: bool,
    /// Liste her değiştiğinde artar (pencere gereksiz yeniden çizmesin)
    pub rev: u64,
    pub summary: Summary,
    pub events: Vec<RaceEvent>,
}

/// Bu kadar süre kare gelmezse (oyun kapandı/yeniden bağlandı) eski değerlerle kıyaslama yapılmaz
const GAP: Duration = Duration::from_secs(10);

// Oturum bayrakları (irsdk_Flags)
const F_CHECKERED: u32 = 0x0001;
const F_WHITE: u32 = 0x0002;
const F_GREEN: u32 = 0x0004;
const F_YELLOW: u32 = 0x0008;
const F_RED: u32 = 0x0010;
const F_CAUTION: u32 = 0x4000;
const F_CAUTION_WAVING: u32 = 0x8000;

/// Aynı bayrağın tekrar yazılması için beklenecek süre (yerel sarılar sık yanıp söner)
const FLAG_COOLDOWN: f64 = 20.0;
/// Aynı aracın pist dışı olayları arası en kısa süre
const OFFTRACK_COOLDOWN: f64 = 8.0;

pub struct EventLog {
    list: VecDeque<RaceEvent>,
    next_id: u64,
    session_num: i32,
    track: String,
    session_kind: String,
    pub sim: &'static str,
    pub demo: bool,
    last_rc_id: u64,
    last_time: f64,
    /// Sonraki canlı karede önceki değerleri sadece kaydet (olay üretme)
    rebase: bool,
    prev_inc: i32,
    prev_pos: i32,
    prev_best: f32,
    prev_flags: u32,
    prev_state: i32,
    prev_lap_completed: i32,
    prev_surface: Vec<i32>,
    offtrack_at: Vec<f64>,
    flag_at: Vec<(u32, f64)>,
    last_pos_check: f64,
    checkered_seen: bool,
    checkered_lap: i32,
    finished: bool,
    /// Diğer kaynağın (demo ↔ canlı) listesi: önizleme/demo açılınca gerçek olaylar silinmez
    stash: Option<Box<EventLog>>,
    /// Bir önceki oturumun olayları (yeni oturum boşken gösterilir)
    prev: Option<Snapshot>,
    summary: Summary,
    record: Record,
    /// Liste sürümü (bkz. EventsInfo::rev)
    pub rev: u64,
    /// Son karenin geldiği an (kare akışındaki kopukluğu yakalamak için)
    last_wall: Option<Instant>,
    prev_penalty: u8,
    prev_repairs: i32,
    prev_invalid: bool,
    /// Geçersiz tur olayının yazıldığı son tur (tur başına bir kez)
    invalid_lap: i32,
}

impl Default for EventLog {
    fn default() -> Self {
        EventLog {
            list: VecDeque::new(),
            next_id: 1,
            session_num: i32::MIN,
            track: String::new(),
            session_kind: String::new(),
            sim: "",
            demo: false,
            last_rc_id: 0,
            last_time: 0.0,
            rebase: true,
            prev_inc: 0,
            prev_pos: 0,
            prev_best: 0.0,
            prev_flags: 0,
            prev_state: 0,
            prev_lap_completed: 0,
            prev_surface: vec![-1; MAX_CARS],
            offtrack_at: vec![f64::MIN; MAX_CARS],
            flag_at: Vec::new(),
            last_pos_check: f64::MIN,
            checkered_seen: false,
            checkered_lap: 0,
            finished: false,
            stash: None,
            prev: None,
            summary: Summary::default(),
            record: Record::default(),
            rev: next_rev(),
            last_wall: None,
            prev_penalty: 0,
            prev_repairs: -1,
            prev_invalid: false,
            invalid_lap: i32::MIN,
        }
    }
}

impl EventLog {
    pub fn events(&self) -> Vec<RaceEvent> {
        self.list.iter().cloned().collect()
    }

    #[cfg(test)]
    pub fn info(&self, connected: bool) -> EventsInfo {
        self.info_view(connected, View::Auto)
    }

    pub fn info_view(&self, connected: bool, view: View) -> EventsInfo {
        let prev = if self.demo { None } else { self.prev.as_ref() };
        let has_current = !self.list.is_empty();
        let use_prev = match view {
            View::Auto => !has_current,
            View::Current => false,
            View::Previous => true,
        };
        if let (true, Some(p)) = (use_prev, prev) {
            return EventsInfo {
                sim: p.sim.to_string(),
                demo: false,
                connected,
                track: p.track.clone(),
                session_kind: p.session_kind.clone(),
                session_num: p.session_num,
                // Aynı sim hâlâ bağlıysa önceki oturumun anlarına da sarılabilir (tekrar bütün etkinliği kapsar)
                replay_ok: connected && p.sim == "iracing" && self.sim == "iracing",
                previous: true,
                has_previous: true,
                has_current,
                rev: self.rev,
                summary: p.summary.clone(),
                events: p.events.clone(),
            };
        }
        EventsInfo {
            sim: self.sim.to_string(),
            demo: self.demo,
            connected,
            track: self.track.clone(),
            session_kind: self.session_kind.clone(),
            session_num: if self.session_num == i32::MIN { -1 } else { self.session_num },
            replay_ok: connected && !self.demo && self.sim == "iracing",
            previous: false,
            has_previous: prev.is_some(),
            has_current,
            rev: self.rev,
            summary: self.summary.clone(),
            events: self.events(),
        }
    }

    /// Otomatik açılışta pencerede görünecek (start/bitiş dışındaki) olay sayısı
    pub fn auto_count(&self) -> usize {
        let n = self.list.iter().filter(|e| category(e.kind) != "session").count();
        if n == 0 && self.list.is_empty() && !self.demo {
            return self.prev.as_ref().map(|p| p.events.iter().filter(|e| category(e.kind) != "session").count()).unwrap_or(0);
        }
        n
    }

    pub fn set_record(&mut self, r: Record) {
        self.record = r;
        if let Some(s) = self.stash.as_mut() {
            s.record = r;
        }
    }

    fn snapshot(&self) -> Option<Snapshot> {
        if self.demo || self.list.is_empty() {
            return None;
        }
        Some(Snapshot {
            sim: self.sim,
            track: self.track.clone(),
            session_kind: self.session_kind.clone(),
            session_num: self.session_num,
            summary: self.summary.clone(),
            events: self.events(),
        })
    }

    /// Veri kaynağı değişti (demo ↔ canlı, başka sim): liste sıfırlanır
    pub fn set_source(&mut self, sim: &'static str, demo: bool) {
        if demo != self.demo {
            // Demo / önizleme açılıp kapanınca diğer liste saklanır, geri dönünce kaldığı yerden sürer
            let back = self.stash.take().map(|b| *b).filter(|l| l.demo == demo);
            let mut cur = std::mem::take(self);
            cur.stash = None;
            let record = cur.record;
            let mut next = back.unwrap_or_else(|| EventLog { sim: if demo { sim } else { "" }, demo, ..EventLog::default() });
            next.rebase = true;
            next.record = record;
            next.rev = next_rev();
            next.stash = Some(Box::new(cur));
            *self = next;
        }
        if !sim.is_empty() && !self.sim.is_empty() && sim != self.sim {
            // Başka sime geçildi: biten oturum silinmez, "önceki oturum" olarak kalır
            let stash = self.stash.take();
            let prev = self.snapshot().or_else(|| self.prev.take());
            let (record, next_id) = (self.record, self.next_id);
            *self = EventLog { sim, demo, stash, prev, record, next_id, ..EventLog::default() };
        }
        if !sim.is_empty() || demo {
            self.sim = sim;
        }
    }

    fn reset_session(&mut self, f: &Frame, s: &SessionData) {
        let (sim, demo, next_id) = (self.sim, self.demo, self.next_id);
        let stash = self.stash.take();
        let prev = self.snapshot().or_else(|| self.prev.take());
        let (record, last_wall) = (self.record, self.last_wall);
        *self = EventLog { sim, demo, next_id, stash, prev, record, last_wall, ..EventLog::default() };
        self.session_num = f.session_num;
        self.summary.started_at = now_ms();
        self.track = if s.track_config.is_empty() {
            s.track_name.clone()
        } else {
            format!("{} – {}", s.track_name, s.track_config)
        };
    }

    fn push_ev(&mut self, ev: RaceEvent) {
        if !self.record.allows(&ev) {
            return;
        }
        let mut ev = ev;
        self.rev = next_rev();
        ev.id = self.next_id;
        self.next_id += 1;
        self.list.push_back(ev);
        while self.list.len() > MAX_EVENTS {
            self.list.pop_front();
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn push(&mut self, f: &Frame, s: &SessionData, idx: usize, kind: &'static str, sub: &str, text: String, focus_idx: usize) {
        let d = s.driver(idx);
        let lap = f.cars.get(idx).map(|c| c.lap.max(0)).unwrap_or(0);
        let focus = s.driver(focus_idx).map(|d| d.car_number.clone()).unwrap_or_default();
        self.push_ev(RaceEvent {
            id: 0,
            session_num: f.session_num,
            time: f.session_time,
            lap: if idx as i32 == f.player_idx { f.lap.max(lap) } else { lap },
            kind,
            sub: sub.to_string(),
            idx: idx as i32,
            number: d.map(|d| d.car_number.clone()).unwrap_or_default(),
            name: d.map(|d| d.name.clone()).unwrap_or_default(),
            class_color: d.map(|d| d.class_color.clone()).unwrap_or_default(),
            text,
            is_me: idx as i32 == f.player_idx,
            focus,
        });
    }

    fn flag_ready(&mut self, bit: u32, now: f64) -> bool {
        match self.flag_at.iter_mut().find(|x| x.0 == bit) {
            Some(e) if now - e.1 < FLAG_COOLDOWN && now >= e.1 => false,
            Some(e) => {
                e.1 = now;
                true
            }
            None => {
                self.flag_at.push((bit, now));
                true
            }
        }
    }

    /// Her yeni karede çağrılır. Oyuncu bu yarışı ilk kez bitirdiğinde `true` döner
    /// (Olaylar penceresini otomatik açmak için; oturum başına bir kez).
    pub fn update(&mut self, f: &Frame, s: &SessionData, t: &Tracker) -> bool {
        // Tracker sıfırlandıysa (kimlikler baştan başladı) kopyalama sayacını da sıfırla
        let rc_max = t.events.back().map(|e| e.id).unwrap_or(0);
        if rc_max < self.last_rc_id {
            self.last_rc_id = 0;
        }
        // Kare akışı koptu mu (oyun kapanıp açıldı, bağlantı gitti geldi)? O arada olanlar bilinmez:
        // eski değerlerle kıyaslayıp sahte olay üretme. Zaman geri gittiyse bu yeni bir oturumdur
        // (aynı pistte aynı oturum numarasıyla yeniden başlayan antrenman eskisine karışmasın).
        let now = Instant::now();
        let gap = self.last_wall.map(|w| now.saturating_duration_since(w) > GAP).unwrap_or(false);
        self.last_wall = Some(now);
        if gap {
            self.rebase = true;
            self.last_rc_id = rc_max;
        }
        if f.replay && !f.replay_live {
            // Tekrar oynatılıyor: geçmiş anlardan olay üretme, dönünce yeniden taban al
            self.last_rc_id = rc_max;
            self.rebase = true;
            return false;
        }
        let restarted = gap && self.session_num != i32::MIN && f.session_time + 1.0 < self.last_time;
        let track_changed = !s.track_name.is_empty() && !self.track.is_empty() && !self.track.starts_with(&s.track_name);
        // Oturum değişti, pist değişti ya da zaman belirgin geri gitti (yeni yarış etkinliği)
        if f.session_num != self.session_num || track_changed || restarted || f.session_time + 30.0 < self.last_time {
            self.reset_session(f, s);
            self.last_rc_id = rc_max;
        }
        if self.track.is_empty() && !s.track_name.is_empty() {
            self.reset_track_name(s);
        }
        self.last_time = f.session_time;
        self.session_kind = s.session(f.session_num).map(|x| x.kind.clone()).unwrap_or_default();
        let race = s.is_race(f.session_num);
        let me = if f.player_idx >= 0 && (f.player_idx as usize) < MAX_CARS { Some(f.player_idx as usize) } else { None };
        let my_car = me.map(|i| f.cars[i]);

        // Oturum özeti (pencere başlığı)
        self.summary.duration = f.session_time;
        self.summary.incident_limit = s.incident_limit.max(0);
        self.summary.has_incidents = self.demo || self.sim == "iracing" || f.incidents > 0;
        if let (Some(mi), Some(c)) = (me, my_car) {
            if let Some(d) = s.driver(mi) {
                if !d.car_name.is_empty() {
                    self.summary.car = d.car_name.clone();
                }
            }
            self.summary.laps = c.lap_completed.max(f.lap_completed).max(0);
            if f.lap_best > 0.0 {
                self.summary.best_lap = f.lap_best;
            }
            if c.class_position > 0 {
                self.summary.position = c.class_position;
            }
            let sp = t.cars.get(mi).map(|x| x.start_pos).unwrap_or(0);
            if race && sp > 0 {
                self.summary.start_position = sp;
            }
            self.summary.incidents = f.incidents.max(0);
        }

        if self.rebase {
            self.rebase = false;
            self.prev_inc = f.incidents;
            self.prev_pos = my_car.map(|c| c.class_position).unwrap_or(0);
            self.prev_best = f.lap_best.max(0.0);
            self.prev_flags = f.session_flags;
            self.prev_state = f.session_state;
            self.prev_lap_completed = my_car.map(|c| c.lap_completed).unwrap_or(0);
            self.prev_penalty = f.penalty;
            self.prev_repairs = f.fast_repairs;
            self.prev_invalid = f.lap_invalid;
            for i in 0..MAX_CARS {
                self.prev_surface[i] = f.cars[i].surface;
            }
            return false;
        }

        // 1) Tracker'ın yarış kontrol olayları
        let new: Vec<_> = t.events.iter().filter(|e| e.id > self.last_rc_id).cloned().collect();
        for e in new {
            self.last_rc_id = self.last_rc_id.max(e.id);
            if e.session_num != f.session_num {
                continue;
            }
            let sub = if e.kind == "flag" {
                if e.text.contains("diskalifiye") {
                    "dq"
                } else if e.text.contains("siyah") {
                    "black"
                } else {
                    "repair"
                }
            } else {
                ""
            };
            self.push_ev(RaceEvent {
                id: 0,
                session_num: e.session_num,
                time: e.time,
                lap: e.lap,
                kind: e.kind,
                sub: sub.into(),
                idx: e.idx,
                focus: e.number.clone(),
                number: e.number,
                name: e.name,
                class_color: e.class_color,
                text: e.text,
                is_me: e.is_me,
            });
        }

        // 2) Oyuncunun olay puanı
        if let Some(mi) = me {
            if f.incidents > self.prev_inc {
                let d = f.incidents - self.prev_inc;
                let text = incident_text(d).to_string();
                self.push(f, s, mi, "incident", &format!("{d}x"), text, mi);
            }
            // Olay puanı vermeyen simler (ACC, LMU/rF2, AMS2): turun geçersiz sayılması (tur başına bir kez)
            if f.lap_invalid && !self.prev_invalid && f.is_on_track && f.lap != self.invalid_lap {
                self.invalid_lap = f.lap;
                self.push(f, s, mi, "invalid", "", "tur geçersiz sayıldı".into(), mi);
            }
            // Bekleyen ceza (ACC / AMS2 / LMU-rF2)
            if f.penalty != 0 && f.penalty != self.prev_penalty {
                let (sub, text) = penalty_text(f.penalty);
                self.push(f, s, mi, "penalty", sub, text.into(), mi);
            }
            // Hızlı tamir hakkı kullanıldı (iRacing)
            if self.prev_repairs > 0 && f.fast_repairs >= 0 && f.fast_repairs < self.prev_repairs {
                self.push(f, s, mi, "repair", "", "hızlı tamir kullanıldı".into(), mi);
            }
        }
        self.prev_inc = f.incidents;
        self.prev_invalid = f.lap_invalid;
        self.prev_penalty = f.penalty;
        self.prev_repairs = f.fast_repairs;

        // 3) Diğer araçların pist dışına çıkması (sadece yarışta; antrenmanda çok gürültülü)
        for i in 0..MAX_CARS {
            let now = f.cars[i].surface;
            let was = self.prev_surface[i];
            self.prev_surface[i] = now;
            if !race || Some(i) == me || now != 0 || was != 3 {
                continue;
            }
            let Some(d) = s.driver(i) else { continue };
            if d.is_pace_car || d.is_spectator {
                continue;
            }
            if f.session_time - self.offtrack_at[i] < OFFTRACK_COOLDOWN {
                continue;
            }
            self.offtrack_at[i] = f.session_time;
            self.push(f, s, i, "offTrack", "", "pist dışına çıktı".into(), i);
        }

        // 4) Oyuncunun sıra değişimleri (saniyede bir, yarış sürerken)
        if let (Some(mi), Some(c)) = (me, my_car) {
            let due = f.session_time - self.last_pos_check >= 1.0 || f.session_time < self.last_pos_check;
            if due {
                self.last_pos_check = f.session_time;
                let now = c.class_position;
                let prev = self.prev_pos;
                if race && f.session_state >= 4 && prev > 0 && now > 0 && now != prev {
                    let my_class = s.driver(mi).map(|d| d.class_id);
                    // Eski sırama gelen araç: geçtiğim (arkama düşen) ya da beni geçen
                    let other = (0..MAX_CARS).find(|&j| {
                        j != mi && f.cars[j].class_position == prev && s.driver(j).map(|d| Some(d.class_id) == my_class).unwrap_or(false)
                    });
                    let oname = other.and_then(|j| s.driver(j)).map(|d| format!("#{} {}", d.car_number, d.name));
                    if now < prev {
                        let text = match (&oname, prev - now) {
                            (Some(n), 1) => format!("{n} geçildi · P{now}"),
                            (_, k) => format!("{k} sıra kazandın · P{now}"),
                        };
                        self.push(f, s, mi, "pass", &format!("P{now}"), text, mi);
                    } else {
                        let text = match (&oname, now - prev) {
                            (Some(n), 1) => format!("{n} seni geçti · P{now}"),
                            (_, k) => format!("{k} sıra kaybettin · P{now}"),
                        };
                        self.push(f, s, mi, "passed", &format!("P{now}"), text, mi);
                    }
                }
                self.prev_pos = now;
            }
        }

        // 5) Kişisel en iyi tur
        if let Some(mi) = me {
            if f.lap_best > 0.0 && (self.prev_best <= 0.0 || f.lap_best < self.prev_best - 0.0005) {
                let text = format!("kişisel en iyi tur {}", fmt_lap(f.lap_best));
                self.push(f, s, mi, "best", "", text, mi);
            }
        }
        if f.lap_best > 0.0 {
            self.prev_best = f.lap_best;
        }

        // 6) Bayraklar (oturum ve oyuncunun mavi bayrağı)
        if let Some(mi) = me {
            let newf = f.session_flags & !self.prev_flags;
            let player_blue = f.cars[mi].flags & CF_BLUE != 0 || f.session_flags & CF_BLUE != 0;
            let was_caution = self.prev_flags & (F_CAUTION | F_CAUTION_WAVING | F_YELLOW) != 0;
            let mut flags: Vec<(u32, &str, &str)> = Vec::new();
            if newf & F_RED != 0 {
                flags.push((F_RED, "red", "kırmızı bayrak"));
            }
            if newf & (F_CAUTION | F_CAUTION_WAVING) != 0 {
                flags.push((F_CAUTION, "yellow", "tam sarı bayrak (güvenlik aracı)"));
            } else if newf & F_YELLOW != 0 {
                flags.push((F_YELLOW, "yellow", "sarı bayrak"));
            }
            if newf & F_GREEN != 0 && was_caution && self.prev_state >= 4 {
                flags.push((F_GREEN, "green", "yeşil bayrak, yarış devam ediyor"));
            }
            if newf & F_WHITE != 0 && race {
                flags.push((F_WHITE, "white", "son tur (beyaz bayrak)"));
            }
            if newf & CF_BLUE != 0 && player_blue {
                flags.push((CF_BLUE, "blue", "mavi bayrak"));
            }
            for (bit, sub, text) in flags {
                if self.flag_ready(bit, f.session_time) {
                    self.push(f, s, mi, "flag", sub, text.into(), mi);
                }
            }
        }
        self.prev_flags = f.session_flags;

        // 7) Yarış başlangıcı ve bitiş
        let mut open = false;
        if let (Some(mi), Some(c)) = (me, my_car) {
            if race && f.session_state == 4 && self.prev_state > 0 && self.prev_state < 4 {
                self.push(f, s, mi, "start", "", format!("yarış başladı · P{}", c.class_position.max(0)), mi);
            }
            if race && (f.session_state >= 5 || f.session_flags & F_CHECKERED != 0) && !self.checkered_seen {
                self.checkered_seen = true;
                self.checkered_lap = self.prev_lap_completed;
            }
            if race && self.checkered_seen && !self.finished {
                // Oyuncu damalı bayraktan sonra çizgiyi geçti, soğuma turu başladı ya da pistten çıktı
                let crossed = c.lap_completed > self.checkered_lap;
                if crossed || f.session_state >= 6 || !f.is_on_track {
                    self.finished = true;
                    let text = if c.class_position > 0 {
                        format!("damalı bayrak · P{}", c.class_position)
                    } else {
                        "damalı bayrak".to_string()
                    };
                    self.push(f, s, mi, "finish", "checkered", text, mi);
                    open = true;
                }
            }
            self.prev_lap_completed = c.lap_completed;
        }
        self.prev_state = f.session_state;
        open
    }

    fn reset_track_name(&mut self, s: &SessionData) {
        self.track = if s.track_config.is_empty() {
            s.track_name.clone()
        } else {
            format!("{} – {}", s.track_name, s.track_config)
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Driver, SessionEntry};

    fn session() -> SessionData {
        let mut s = SessionData { track_name: "Spa".into(), player_idx: 0, ..Default::default() };
        for i in 0..3 {
            s.drivers.push(Some(Driver {
                car_idx: i,
                name: format!("Sürücü {i}"),
                car_number: format!("{}", i + 10),
                class_id: 1,
                ..Default::default()
            }));
        }
        s.sessions.push(SessionEntry { num: 2, kind: "Race".into(), laps: None, time: None });
        s
    }

    fn frame(t: f64) -> Frame {
        let mut f = Frame { session_num: 2, session_time: t, session_state: 4, player_idx: 0, is_on_track: true, lap: 3, ..Default::default() };
        for i in 0..3 {
            f.cars[i].position = i as i32 + 1;
            f.cars[i].class_position = i as i32 + 1;
            f.cars[i].surface = 3;
            f.cars[i].lap = 3;
            f.cars[i].lap_completed = 2;
        }
        f
    }

    #[test]
    fn collects_player_and_field_events() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        let mut f = frame(100.0);
        assert!(!log.update(&f, &s, &t)); // taban
        assert!(log.events().is_empty());

        // Olay puanı 4x
        f.session_time = 101.0;
        f.incidents = 4;
        log.update(&f, &s, &t);
        let e = log.events();
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].kind, "incident");
        assert_eq!(e[0].sub, "4x");
        assert_eq!(e[0].session_num, 2);
        assert!((e[0].time - 101.0).abs() < 1e-9);
        assert!(e[0].is_me);
        assert_eq!(e[0].focus, "10");

        // 2 numara pist dışı
        f.session_time = 102.0;
        f.cars[2].surface = 0;
        log.update(&f, &s, &t);
        assert_eq!(log.events().last().unwrap().kind, "offTrack");
        assert_eq!(log.events().last().unwrap().number, "12");
        // Bekleme süresi içinde tekrar sayılmaz
        f.cars[2].surface = 3;
        log.update(&f, &s, &t);
        f.cars[2].surface = 0;
        f.session_time = 103.0;
        log.update(&f, &s, &t);
        assert_eq!(log.events().iter().filter(|e| e.kind == "offTrack").count(), 1);

        // Oyuncu 1. sıradan 2.'ye düştü: 2 numaralı (idx 1) araç geçti
        f.session_time = 105.0;
        f.cars[0].class_position = 2;
        f.cars[1].class_position = 1;
        log.update(&f, &s, &t);
        let last = log.events().last().unwrap().clone();
        assert_eq!(last.kind, "passed");
        assert!(last.text.contains("#11"), "{}", last.text);

        // Sarı bayrak, bekleme süresi içinde ikinci kez yazılmaz
        f.session_time = 106.0;
        f.session_flags = F_YELLOW;
        log.update(&f, &s, &t);
        f.session_time = 107.0;
        f.session_flags = 0;
        log.update(&f, &s, &t);
        f.session_time = 108.0;
        f.session_flags = F_YELLOW;
        log.update(&f, &s, &t);
        assert_eq!(log.events().iter().filter(|e| e.kind == "flag").count(), 1);

        // Kişisel en iyi
        f.session_time = 110.0;
        f.lap_best = 92.5;
        log.update(&f, &s, &t);
        assert_eq!(log.events().last().unwrap().kind, "best");
    }

    #[test]
    fn replay_does_not_record_and_finish_fires_once() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        let mut f = frame(10.0);
        log.update(&f, &s, &t);
        // Tekrar izlenirken zaman geri gider, olay puanı değişse bile kayıt yok
        f.replay = true;
        f.session_time = 2.0;
        f.incidents = 2;
        log.update(&f, &s, &t);
        assert!(log.events().is_empty());
        f.replay = false;
        f.session_time = 20.0;
        log.update(&f, &s, &t); // yeniden taban
        assert!(log.events().is_empty());

        // Damalı bayrak: lider bitirdi, oyuncu henüz çizgide değil
        f.session_time = 30.0;
        f.session_state = 5;
        assert!(!log.update(&f, &s, &t));
        // Oyuncu çizgiyi geçti
        f.session_time = 31.0;
        f.cars[0].lap_completed = 3;
        assert!(log.update(&f, &s, &t));
        assert_eq!(log.events().last().unwrap().kind, "finish");
        // Bir daha tetiklenmez
        f.session_time = 40.0;
        f.session_state = 6;
        assert!(!log.update(&f, &s, &t));
    }

    #[test]
    fn demo_race_fills_log() {
        let mut d = crate::demo::Demo::new();
        let mut f = Frame::default();
        let mut t = Tracker::default();
        let mut log = EventLog::default();
        log.set_source("", true);
        for _ in 0..(240 * 60) {
            d.step(1.0 / 60.0, &mut f);
            t.update(&f, d.session());
            log.update(&f, d.session(), &t);
        }
        let ev = log.events();
        assert!(!ev.is_empty());
        assert!(ev.iter().any(|e| e.kind == "pitIn" || e.kind == "fastest" || e.kind == "lead"), "{ev:?}");
        assert!(ev.windows(2).all(|w| w[0].id < w[1].id && w[0].time <= w[1].time + 1.0));
        assert!(!log.info(true).replay_ok, "demo'da tekrar yok");
    }

    #[test]
    fn bounded_and_reset_on_new_session() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        let mut f = frame(0.0);
        log.update(&f, &s, &t);
        for k in 1..=(MAX_EVENTS as i32 + 50) {
            f.session_time = k as f64;
            f.incidents = k;
            log.update(&f, &s, &t);
        }
        assert_eq!(log.events().len(), MAX_EVENTS);
        f.session_num = 3;
        log.update(&f, &s, &t);
        assert!(log.events().is_empty());
        // Yeni oturum boşken önceki oturumun olayları gösterilir
        let i = log.info(true);
        assert!(i.previous && i.session_num == 2 && i.events.len() == MAX_EVENTS);
        f.session_time += 1.0;
        f.incidents += 1;
        log.update(&f, &s, &t);
        let i = log.info(true);
        assert!(!i.previous && i.session_num == 3 && i.events.len() == 1);
        // Demo açılıp kapanınca gerçek liste korunur
        log.set_source("iracing", true);
        assert!(log.events().is_empty());
        log.set_source("iracing", false);
        assert_eq!(log.events().len(), 1);
    }

    #[test]
    fn incident_delta_classification() {
        assert_eq!(incident_text(1), "Pist dışı");
        assert_eq!(incident_text(2), "Kontrol kaybı / duvar");
        assert_eq!(incident_text(3), "Pist dışı + kontrol kaybı");
        assert_eq!(incident_text(4), "Temas");
        assert_eq!(incident_text(6), "Ağır temas");
        // Her artış ayrı olay; azalma ya da aynı değer olay üretmez
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        let mut f = frame(10.0);
        f.incidents = 5; // kayıt başlamadan önce alınmış puan
        log.update(&f, &s, &t);
        for (k, inc) in [6, 6, 8, 12, 12, 15].into_iter().enumerate() {
            f.session_time = 11.0 + k as f64;
            f.incidents = inc;
            log.update(&f, &s, &t);
        }
        let subs: Vec<String> = log.events().iter().map(|e| e.sub.clone()).collect();
        assert_eq!(subs, ["1x", "2x", "4x", "3x"]);
        let i = log.info(true);
        assert_eq!(i.summary.incidents, 15, "özet simin toplamını gösterir (kayıt öncesi dahil)");
        assert!(i.summary.has_incidents);
    }

    #[test]
    fn rollover_keeps_previous_with_summary_and_views() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        log.set_source("iracing", false);
        let mut f = frame(100.0);
        f.lap_completed = 7;
        f.cars[0].lap_completed = 7;
        f.lap_best = 91.25;
        log.update(&f, &s, &t);
        f.session_time = 101.0;
        f.incidents = 2;
        log.update(&f, &s, &t);
        let cur = log.info_view(true, View::Auto);
        assert!(!cur.previous && !cur.has_previous && cur.has_current && cur.replay_ok);
        assert_eq!((cur.summary.laps, cur.summary.position), (7, 1));
        assert!((cur.summary.best_lap - 91.25).abs() < 1e-4);

        // Yeni oturum (boş): otomatik görünüm önceki oturumu özetiyle birlikte verir
        f.session_num = 3;
        f.session_time = 5.0;
        f.incidents = 0;
        f.cars[0].lap_completed = 0;
        f.lap_completed = 0;
        log.update(&f, &s, &t);
        let a = log.info_view(true, View::Auto);
        assert!(a.previous && a.has_previous && !a.has_current);
        assert_eq!((a.session_num, a.events.len(), a.summary.laps, a.summary.incidents), (2, 1, 7, 2));
        assert_eq!(log.auto_count(), 1);
        // "Güncel" istenirse boş güncel oturum döner, önceki hâlâ erişilebilir
        let c = log.info_view(true, View::Current);
        assert!(!c.previous && c.has_previous && c.events.is_empty() && c.session_num == 3);
        // Güncel oturumda olay olunca otomatik görünüm ona döner, "önceki" hâlâ istenebilir
        f.session_time = 6.0;
        f.incidents = 1;
        log.update(&f, &s, &t);
        assert!(!log.info_view(true, View::Auto).previous);
        let p = log.info_view(true, View::Previous);
        assert!(p.previous && p.session_num == 2 && p.events.len() == 1);
        // Olaysız bir oturum daha: en son olaylı oturum (3) önceki olur, 2 düşer
        f.session_num = 4;
        f.session_time = 1.0;
        log.update(&f, &s, &t);
        assert_eq!(log.info(true).session_num, 3);
        // Kimlikler oturumlar arasında tekrar etmez
        let ids: Vec<u64> = log.info(true).events.iter().map(|e| e.id).collect();
        assert!(ids.iter().all(|&i| i >= 2));
    }

    #[test]
    fn sim_change_keeps_finished_session_as_previous() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        log.set_source("iracing", false);
        let mut f = frame(10.0);
        log.update(&f, &s, &t);
        f.session_time = 11.0;
        f.incidents = 4;
        log.update(&f, &s, &t);
        log.set_source("acc", false);
        let i = log.info(true);
        assert!(i.previous && i.sim == "iracing" && i.events.len() == 1);
        assert!(!i.replay_ok, "başka sim bağlıyken iRacing tekrarına sarılamaz");
    }

    #[test]
    fn demo_is_isolated_from_live_log() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        log.set_source("iracing", false);
        let mut f = frame(10.0);
        log.update(&f, &s, &t);
        f.session_time = 11.0;
        f.incidents = 1;
        log.update(&f, &s, &t);
        let live_rev = log.rev;

        // Demo açıldı: demo olayları ayrı listede birikir, canlı liste görünmez
        log.set_source("iracing", true);
        assert_ne!(log.rev, live_rev, "kaynak değişimi pencereyi yeniler");
        let mut d = frame(500.0);
        d.session_num = 0;
        log.update(&d, &s, &t);
        d.session_time = 501.0;
        d.incidents = 2;
        log.update(&d, &s, &t);
        d.session_time = 502.0;
        d.incidents = 6;
        log.update(&d, &s, &t);
        let i = log.info(true);
        assert!(i.demo && !i.previous && !i.has_previous && !i.replay_ok);
        assert_eq!(i.events.len(), 2);

        // Demo kapandı: canlı liste olduğu gibi, demo olayı yok; ilk kare yalnızca taban alır
        log.set_source("iracing", false);
        let i = log.info(true);
        assert!(!i.demo && i.events.len() == 1 && i.events[0].sub == "1x");
        f.session_time = 60.0;
        f.incidents = 1;
        log.update(&f, &s, &t);
        assert_eq!(log.events().len(), 1);
        // Demo yeniden açılınca kendi listesi kaldığı yerden sürer; canlıya hiç karışmaz
        log.set_source("iracing", true);
        assert_eq!(log.events().len(), 2);
        log.set_source("iracing", false);
        assert!(log.events().iter().all(|e| e.sub == "1x"));
    }

    #[test]
    fn gap_rebases_and_restart_starts_new_session() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        let mut f = frame(600.0);
        log.update(&f, &s, &t);
        f.session_time = 601.0;
        f.incidents = 4;
        log.update(&f, &s, &t);
        assert_eq!(log.events().len(), 1);

        // Bağlantı koptu, aynı oturuma dönüldü (zaman ilerlemiş): liste sürer, aradaki fark olay sayılmaz
        log.last_wall = Instant::now().checked_sub(Duration::from_secs(20));
        f.session_time = 700.0;
        f.incidents = 9;
        f.cars[0].class_position = 3;
        log.update(&f, &s, &t);
        assert_eq!(log.events().len(), 1);
        assert!(!log.info(true).previous);

        // Oyun kapanıp aynı pistte aynı oturum numarasıyla yeniden açıldı (zaman baştan): yeni oturum
        log.last_wall = Instant::now().checked_sub(Duration::from_secs(20));
        f.session_time = 690.0;
        f.incidents = 0;
        log.update(&f, &s, &t);
        assert!(log.events().is_empty());
        let i = log.info(true);
        assert!(i.previous && i.events.len() == 1);
        // Kopukluk yokken küçük geri gidiş yeni oturum sayılmaz
        f.session_time = 691.0;
        f.incidents = 1;
        log.update(&f, &s, &t);
        f.session_time = 689.0;
        log.update(&f, &s, &t);
        assert_eq!(log.events().len(), 1);
    }

    #[test]
    fn record_mask_and_other_sim_events() {
        let s = session();
        let t = Tracker::default();
        let mut log = EventLog::default();
        log.set_source("acc", false);
        let mut f = frame(10.0);
        log.update(&f, &s, &t);
        // ACC: olay puanı yok; geçersiz tur (tur başına bir kez) ve ceza kaydedilir
        f.session_time = 11.0;
        f.lap_invalid = true;
        log.update(&f, &s, &t);
        f.session_time = 12.0;
        f.lap_invalid = false;
        log.update(&f, &s, &t);
        f.session_time = 13.0;
        f.lap_invalid = true;
        log.update(&f, &s, &t);
        f.session_time = 14.0;
        f.penalty = 1;
        log.update(&f, &s, &t);
        f.session_time = 15.0;
        log.update(&f, &s, &t);
        let kinds: Vec<&str> = log.events().iter().map(|e| e.kind).collect();
        assert_eq!(kinds, ["invalid", "penalty"]);
        assert_eq!(log.events()[1].sub, "driveThrough");
        assert!(!log.info(true).summary.has_incidents);
        assert!(!log.info(true).replay_ok);

        // Kayıt süzgeci: kaza grubu kapalıyken yazılmaz, diğer sürücüler kapalıyken yalnızca oyuncu
        log.set_record(Record { crash: false, others: false, ..Record::default() });
        f.session_time = 20.0;
        f.lap = 4;
        f.lap_invalid = false;
        log.update(&f, &s, &t);
        f.session_time = 21.0;
        f.lap_invalid = true;
        f.cars[2].surface = 0;
        log.update(&f, &s, &t);
        assert_eq!(log.events().len(), 2);
        f.session_time = 22.0;
        f.lap_best = 90.0;
        log.update(&f, &s, &t);
        assert_eq!(log.events().last().unwrap().kind, "best");
        // Ayar nesnesi: eksik alan açık sayılır
        let r = Record::from_settings(Some(&serde_json::json!({ "pit": false })));
        assert!(!r.pit && r.crash && r.others);
        assert_eq!(Record::from_settings(None), Record::default());
        assert_eq!(category("finish"), "session");
        assert_eq!(category("repair"), "pit");
    }
}
