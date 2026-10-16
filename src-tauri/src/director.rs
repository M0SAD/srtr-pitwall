//! Otomatik Rejisör (iRacing): yayın için kamerayı kendiliğinden araçtan araca geçirir.
//!
//! Kurgu (her çekim `min_shot`..`max_shot` sn, ayarlardaki ağırlıklarla rastgele):
//! - Lider ve ön sıralar (2..`front_n`)
//! - Mücadeleler: aradaki fark ~1 sn'nin altındaki komşu sıralar; kovalayan araç gösterilir (ikisi de kadrajda)
//! - Diğer araçlar: en uzun süredir gösterilmeyen önce (zamanla tüm araçlar ekrana gelir)
//! - İsteğe bağlı: kendi aracım
//! - Kaza / pist dışı (CarIdxTrackSurface 0'a düştü ya da araç hızlıyken birden neredeyse durdu): o an kesilir,
//!   olay birkaç saniye gösterilir. Canlıda da tekrar izlerken de çalışır.
//!
//! Kamera iRacing'e `CamSwitchNum(numara, grup, kamera)` ile gönderilir. Grup: kullanıcının seçtiği (TV Mix vb.) kalır
//! ya da TV kameraları arasında döner. Sürücü araçta (pistte) sürerken çalışmaz: kendi görüşünü değiştirmesin.
//! Kullanıcı kamerayı elle başka araca çevirirse bir süre (`manual_pause`) bekler.

use crate::model::{Frame, SessionData, MAX_CARS};
use serde::Serialize;
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq)]
pub struct Cfg {
    pub enabled: bool,
    pub min_shot: f32,
    pub max_shot: f32,
    pub front_n: i32,
    pub w_leader: f32,
    pub w_front: f32,
    pub w_battle: f32,
    pub w_field: f32,
    pub w_me: f32,
    pub incidents: bool,
    /// "tvmix": iRacing'in TV Mixed grubu | "keep": seçili kamera grubu kalır | "tv": TV kameraları arasında döner |
    /// "mix": TV + araç üstü kameralar
    pub cams: String,
    /// Yarış başlamadan (gridde, ısınma turunda) araçları pole'dan başlayarak sırayla göster
    pub grid_walk: bool,
    pub grid_shot: f32,
    pub battle_gap: f32,
    pub manual_pause: f32,
}

impl Default for Cfg {
    fn default() -> Self {
        Cfg {
            enabled: false,
            min_shot: 8.0,
            max_shot: 16.0,
            front_n: 5,
            w_leader: 25.0,
            w_front: 25.0,
            w_battle: 30.0,
            w_field: 25.0,
            w_me: 0.0,
            incidents: true,
            cams: "tvmix".into(),
            grid_walk: true,
            grid_shot: 4.0,
            battle_gap: 1.0,
            manual_pause: 20.0,
        }
    }
}

impl Cfg {
    /// Ayarlar: general.director
    pub fn from_settings(v: Option<&serde_json::Value>) -> Cfg {
        let mut c = Cfg::default();
        let Some(v) = v else { return c };
        let f = |k: &str, d: f32| v.get(k).and_then(|x| x.as_f64()).map(|x| x as f32).unwrap_or(d);
        c.enabled = v.get("enabled").and_then(|x| x.as_bool()).unwrap_or(false);
        c.min_shot = f("minShot", c.min_shot).clamp(3.0, 120.0);
        c.max_shot = f("maxShot", c.max_shot).clamp(c.min_shot, 180.0);
        c.front_n = f("frontN", c.front_n as f32).clamp(2.0, 20.0) as i32;
        c.w_leader = f("wLeader", c.w_leader).max(0.0);
        c.w_front = f("wFront", c.w_front).max(0.0);
        c.w_battle = f("wBattle", c.w_battle).max(0.0);
        c.w_field = f("wField", c.w_field).max(0.0);
        c.w_me = f("wMe", c.w_me).max(0.0);
        c.incidents = v.get("incidents").and_then(|x| x.as_bool()).unwrap_or(true);
        c.cams = v.get("cams").and_then(|x| x.as_str()).unwrap_or("tvmix").to_string();
        c.grid_walk = v.get("gridWalk").and_then(|x| x.as_bool()).unwrap_or(true);
        c.grid_shot = f("gridShot", c.grid_shot).clamp(2.0, 30.0);
        c.battle_gap = f("battleGap", c.battle_gap).clamp(0.2, 3.0);
        c.manual_pause = f("manualPause", c.manual_pause).clamp(0.0, 300.0);
        c
    }
}

/// Arayüze giden durum (Araçlar › Otomatik Rejisör)
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    /// Kamera şu an yönetiliyor mu
    pub active: bool,
    /// Yönetilmiyorsa nedeni: "off" | "nosim" | "driving" | "manual"
    pub why: String,
    /// Çekim türü: grid | leader | front | battle | field | me | incident
    pub kind: String,
    pub number: String,
    pub name: String,
    pub pos: i32,
    /// Çekimin geçen / planlanan süresi (sn)
    pub secs: f32,
    pub len: f32,
    /// Elle değişiklik sonrası kalan bekleme (sn)
    pub pause_left: f32,
    pub group: String,
    pub replay: bool,
}

#[derive(Clone, Copy)]
struct Shot {
    idx: usize,
    kind: &'static str,
    start: Instant,
    len: f32,
}

pub struct Director {
    cur: Option<Shot>,
    last_shown: [Option<Instant>; MAX_CARS],
    prev_surface: [i32; MAX_CARS],
    fast_at: [Option<Instant>; MAX_CARS],
    last_incident: [Option<Instant>; MAX_CARS],
    /// Gönderilen son hedef ve zamanı (kamera telemetride ona dönene dek elle değişiklik sayılmaz)
    sent: Option<(i32, Instant)>,
    manual_until: Option<Instant>,
    last_step: Instant,
    rng: u64,
    group: (i32, String),
    force_next: bool,
    /// Grid turu: sıradaki grid sırası (0 = pole) ve önceki karede grid aşamasında mıydık
    grid_i: usize,
    was_grid: bool,
    pub status: Status,
}

impl Default for Director {
    fn default() -> Self {
        Director {
            cur: None,
            last_shown: [None; MAX_CARS],
            prev_surface: [-1; MAX_CARS],
            fast_at: [None; MAX_CARS],
            last_incident: [None; MAX_CARS],
            sent: None,
            manual_until: None,
            last_step: Instant::now() - Duration::from_secs(5),
            rng: 0x9E37_79B9_7F4A_7C15
                ^ std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos() as u64)
                    .unwrap_or(1),
            group: (0, String::new()),
            force_next: false,
            grid_i: 0,
            was_grid: false,
            status: Status::default(),
        }
    }
}

/// Komut gönderici (testte sahte)
pub trait CamOut {
    fn switch(&mut self, number: &str, group: i32);
}

pub struct IracingOut;
impl CamOut for IracingOut {
    fn switch(&mut self, number: &str, group: i32) {
        let _ = crate::broadcast::camera_to_car_group(number, group);
    }
}

const TV_GROUPS: &[&str] = &["tv1", "tv2", "tv3", "tv static", "tv mixed", "chase", "far chase", "blimp", "chopper"];
const ONBOARD_GROUPS: &[&str] = &["cockpit", "roll bar", "gyro", "nose", "gearbox", "rear chase", "pit lane"];

impl Director {
    fn rand(&mut self) -> f32 {
        // xorshift64
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng = x;
        (x >> 40) as f32 / (1u64 << 24) as f32
    }

    /// Bir sonraki çekime hemen geç (arayüzdeki "Sonraki çekim")
    pub fn next(&mut self) {
        self.force_next = true;
        self.manual_until = None;
    }

    /// Her karede çağrılır. `iracing`: bağlı sim iRacing ve demo değil.
    pub fn step(&mut self, f: &Frame, s: &SessionData, cfg: &Cfg, iracing: bool, out: &mut dyn CamOut) {
        let now = Instant::now();
        // Kaza tespiti her karede (kısa olayları kaçırmamak için); karar 5 Hz
        let crash = if iracing && cfg.enabled && cfg.incidents { self.detect(f, s, now) } else { None };
        if crash.is_none() && now.duration_since(self.last_step) < Duration::from_millis(200) && !self.force_next {
            return;
        }
        self.last_step = now;
        let replay = crate::calc::replay_watch(f) || s.sim_mode == "replay";
        let mut st = Status { enabled: cfg.enabled, replay, ..Default::default() };
        if !cfg.enabled || !iracing {
            st.why = if cfg.enabled { "nosim".into() } else { "off".into() };
            self.cur = None;
            self.sent = None;
            self.status = st;
            return;
        }
        // Sürücü araçta sürüyorsa kameraya dokunma
        if f.is_on_track && !replay && s.player_idx >= 0 && !f.replay {
            st.why = "driving".into();
            self.cur = None;
            self.sent = None;
            self.status = st;
            return;
        }
        // Elle değişiklik: kamera gönderdiğimiz araçtan başka bir araca döndü
        if let (Some((idx, at)), Some(cur)) = (self.sent, self.cur) {
            if now.duration_since(at) > Duration::from_millis(2500)
                && f.cam_car_idx >= 0
                && f.cam_car_idx != idx
                && cur.idx as i32 == idx
                && cfg.manual_pause > 0.0
            {
                self.manual_until = Some(now + Duration::from_secs_f32(cfg.manual_pause));
                self.sent = None;
                self.cur = None;
            }
        }
        if let Some(u) = self.manual_until {
            if now < u && !self.force_next {
                st.why = "manual".into();
                st.pause_left = (u - now).as_secs_f32();
                self.status = st;
                return;
            }
            self.manual_until = None;
        }

        // Yarış başlamadan: gridi pole'dan başlayarak sırayla göster; yeşil bayrakta normal kurguya geç
        let race = s
            .sessions
            .iter()
            .find(|x| x.num == f.session_num)
            .map(|x| x.kind.to_lowercase().contains("race"))
            .unwrap_or(false);
        let grid = cfg.grid_walk && race && !replay && (1..=3).contains(&f.session_state);
        if grid {
            if !self.was_grid {
                self.grid_i = 0;
                self.cur = None;
            }
            self.was_grid = true;
            let elapsed = self.cur.map(|c| now.duration_since(c.start).as_secs_f32()).unwrap_or(f32::MAX);
            let order = Self::grid_order(f, s);
            if !order.is_empty() && (self.force_next || self.cur.map(|c| elapsed >= c.len).unwrap_or(true)) {
                if self.grid_i >= order.len() {
                    self.grid_i = 0;
                }
                let idx = order[self.grid_i];
                self.grid_i += 1;
                if let Some(number) = s.driver(idx).map(|d| d.car_number.clone()).filter(|n| !n.is_empty()) {
                    out.switch(&number, 0);
                    self.group = (0, String::new());
                    self.sent = Some((idx as i32, now));
                    self.cur = Some(Shot { idx, kind: "grid", start: now, len: cfg.grid_shot });
                    self.last_shown[idx] = Some(now);
                }
            }
            self.force_next = false;
            self.fill_status(&mut st, f, s, now);
            self.status = st;
            return;
        }
        if self.was_grid {
            // Yeşil bayrak: hemen yeni çekim (TV kamerasına geçilir)
            self.was_grid = false;
            self.cur = None;
        }

        // Karar
        let elapsed = self.cur.map(|c| now.duration_since(c.start).as_secs_f32()).unwrap_or(f32::MAX);
        let cur_ok = self.cur.map(|c| crate::calc::active(f, s, c.idx) && f.cars[c.idx].surface != -1).unwrap_or(false);
        let mut pick: Option<(usize, &'static str, f32)> = None;
        if let Some(ci) = crash {
            let on_incident = self.cur.map(|c| c.kind == "incident" && c.idx == ci).unwrap_or(false);
            // Sürmekte olan bir kaza çekimi en az 4 sn sürsün
            let busy = self.cur.map(|c| c.kind == "incident" && elapsed < 4.0).unwrap_or(false);
            if !on_incident && !busy {
                pick = Some((ci, "incident", 7.0));
            }
        }
        if pick.is_none() && (self.force_next || !cur_ok || self.cur.map(|c| elapsed >= c.len).unwrap_or(true)) {
            pick = self.choose(f, s, cfg, now);
        }
        self.force_next = false;
        if let Some((idx, kind, len)) = pick {
            let number = s.driver(idx).map(|d| d.car_number.clone()).unwrap_or_default();
            if !number.is_empty() {
                let group = self.pick_group(s, cfg, kind);
                out.switch(&number, group.0);
                self.group = group;
                self.sent = Some((idx as i32, now));
                self.cur = Some(Shot { idx, kind, start: now, len });
                self.last_shown[idx] = Some(now);
            }
        }
        self.fill_status(&mut st, f, s, now);
        self.status = st;
    }

    fn fill_status(&self, st: &mut Status, f: &Frame, s: &SessionData, now: Instant) {
        if let Some(c) = self.cur {
            st.active = true;
            st.kind = c.kind.into();
            st.secs = now.duration_since(c.start).as_secs_f32();
            st.len = c.len;
            st.pos = if c.kind == "grid" { self.grid_i as i32 } else { f.cars[c.idx].position };
            if let Some(d) = s.driver(c.idx) {
                st.number = d.car_number.clone();
                st.name = d.name.clone();
            }
            st.group = self.group.1.clone();
        }
    }

    /// Grid sırası: pistteki (pitte olmayan) araçlar, turda en önde olandan geriye (pole en önde durur)
    fn grid_order(f: &Frame, s: &SessionData) -> Vec<usize> {
        let mut v: Vec<usize> = (0..MAX_CARS).filter(|&i| crate::calc::active(f, s, i) && !f.cars[i].on_pit && f.cars[i].surface >= 1).collect();
        if v.is_empty() {
            v = (0..MAX_CARS).filter(|&i| crate::calc::active(f, s, i)).collect();
        }
        let key = |i: usize| f.cars[i].lap.max(0) as f32 + f.cars[i].pct;
        v.sort_by(|&a, &b| key(b).partial_cmp(&key(a)).unwrap_or(std::cmp::Ordering::Equal));
        v
    }

    /// Kaza / pist dışı: yeni olan aracı döndürür
    fn detect(&mut self, f: &Frame, s: &SessionData, now: Instant) -> Option<usize> {
        let len_m = s.track_length_km * 1000.0;
        let mut hit: Option<usize> = None;
        for i in 0..MAX_CARS {
            if !crate::calc::active(f, s, i) {
                self.prev_surface[i] = -1;
                self.fast_at[i] = None;
                continue;
            }
            let c = &f.cars[i];
            let speed = if len_m > 100.0 { c.pct_rate * len_m } else { 0.0 };
            if speed > 30.0 && c.surface == 3 {
                self.fast_at[i] = Some(now);
            }
            let off = self.prev_surface[i] == 3 && c.surface == 0;
            // Hızlıyken (son 1,5 sn) pistte neredeyse durdu: dönme / çarpışma
            let stopped = c.surface == 3
                && !c.on_pit
                && speed < 9.0
                && self.fast_at[i].map(|t| now.duration_since(t) < Duration::from_millis(1500)).unwrap_or(false);
            self.prev_surface[i] = c.surface;
            if (off || stopped) && !c.on_pit {
                let recent = self.last_incident[i].map(|t| now.duration_since(t) < Duration::from_secs(20)).unwrap_or(false);
                if stopped {
                    self.fast_at[i] = None;
                }
                if !recent {
                    self.last_incident[i] = Some(now);
                    // Öndeki sıradaki aracın olayı öncelikli
                    let better = hit.map(|h| {
                        let ph = f.cars[h].position;
                        let pi = c.position;
                        pi > 0 && (ph <= 0 || pi < ph)
                    });
                    if better.unwrap_or(true) {
                        hit = Some(i);
                    }
                }
            }
        }
        hit
    }

    /// Sıradaki çekim: (araç, tür, süre)
    fn choose(&mut self, f: &Frame, s: &SessionData, cfg: &Cfg, now: Instant) -> Option<(usize, &'static str, f32)> {
        // Pistte, pitte olmayan araçlar
        let mut cars: Vec<usize> = (0..MAX_CARS)
            .filter(|&i| crate::calc::active(f, s, i) && f.cars[i].surface >= 1 && !f.cars[i].on_pit && f.cars[i].position > 0)
            .collect();
        if cars.is_empty() {
            cars = (0..MAX_CARS).filter(|&i| crate::calc::active(f, s, i) && f.cars[i].surface >= 0).collect();
        }
        if cars.is_empty() {
            return None;
        }
        cars.sort_by_key(|&i| if f.cars[i].position > 0 { f.cars[i].position } else { 999 });
        let cur = self.cur.map(|c| c.idx);
        let shown = self.last_shown;
        let since = |i: usize| shown[i].map(|t| now.duration_since(t).as_secs_f32()).unwrap_or(1e6);

        let leader = cars.first().copied().filter(|&i| f.cars[i].position == 1);
        let front: Vec<usize> = cars.iter().copied().filter(|&i| (2..=cfg.front_n).contains(&f.cars[i].position)).collect();
        let battles = self.battles(f, s, &cars, cfg.battle_gap);
        let field: Vec<usize> = cars.iter().copied().filter(|&i| f.cars[i].position > cfg.front_n).collect();
        let me = (s.player_idx >= 0 && cars.contains(&(s.player_idx as usize))).then_some(s.player_idx as usize);

        let mut opts: Vec<(&'static str, f32)> = Vec::new();
        if leader.is_some() && leader != cur {
            opts.push(("leader", cfg.w_leader));
        }
        if front.iter().any(|&i| Some(i) != cur) {
            opts.push(("front", cfg.w_front));
        }
        if battles.iter().any(|&(_, b)| Some(b) != cur) {
            opts.push(("battle", cfg.w_battle));
        }
        if field.iter().any(|&i| Some(i) != cur) {
            opts.push(("field", cfg.w_field));
        }
        if me.is_some() && me != cur {
            opts.push(("me", cfg.w_me));
        }
        let total: f32 = opts.iter().map(|o| o.1).sum();
        let kind = if total <= 0.0 {
            "field"
        } else {
            let mut r = self.rand() * total;
            let mut k = opts.last().map(|o| o.0).unwrap_or("field");
            for (name, w) in &opts {
                if r < *w {
                    k = name;
                    break;
                }
                r -= w;
            }
            k
        };
        let len = cfg.min_shot + self.rand() * (cfg.max_shot - cfg.min_shot).max(0.0);
        let least = |list: &[usize], d: &mut Director| -> Option<usize> {
            let mut best: Option<(usize, f32)> = None;
            for &i in list {
                if Some(i) == cur {
                    continue;
                }
                // En uzun süredir gösterilmeyen; eşitlikte küçük rastgelelik
                let sc = since(i) + d.rand() * 3.0;
                if best.map(|b| sc > b.1).unwrap_or(true) {
                    best = Some((i, sc));
                }
            }
            best.map(|b| b.0)
        };
        let idx = match kind {
            "leader" => leader,
            "front" => least(&front, self),
            "battle" => {
                // Öndeki mücadeleler biraz öncelikli; aynı mücadele art arda gösterilmez
                let mut best: Option<(usize, f32)> = None;
                for &(a, b) in &battles {
                    if Some(b) == cur || Some(a) == cur {
                        continue;
                    }
                    let sc = 100.0 - f.cars[a].position as f32 + since(b).min(120.0) * 0.3 + self.rand() * 10.0;
                    if best.map(|x| sc > x.1).unwrap_or(true) {
                        best = Some((b, sc));
                    }
                }
                best.map(|x| x.0)
            }
            "me" => me,
            _ => least(if field.is_empty() { &cars } else { &field }, self),
        }
        .or_else(|| least(&cars, self))?;
        let len = if kind == "battle" { len * 1.3 } else { len };
        Some((idx, kind, len))
    }

    /// Mücadeleler: (öndeki, arkadaki) — sırada komşu, aynı turda, fark `gap` sn'den az
    fn battles(&self, f: &Frame, s: &SessionData, sorted: &[usize], gap: f32) -> Vec<(usize, usize)> {
        let mut out = Vec::new();
        for w in sorted.windows(2) {
            let (a, b) = (w[0], w[1]);
            let (ca, cb) = (&f.cars[a], &f.cars[b]);
            if ca.position <= 0 || cb.position != ca.position + 1 {
                continue;
            }
            let da = ca.lap as f32 + ca.pct;
            let db = cb.lap as f32 + cb.pct;
            let dist = da - db;
            if !(0.0..0.2).contains(&dist) {
                continue;
            }
            let lap = s
                .driver(b)
                .map(|d| d.class_est_lap)
                .filter(|x| *x > 10.0)
                .or_else(|| (cb.best > 10.0).then_some(cb.best))
                .unwrap_or(100.0);
            if dist * lap <= gap {
                out.push((a, b));
            }
        }
        out
    }

    fn pick_group(&mut self, s: &SessionData, cfg: &Cfg, kind: &str) -> (i32, String) {
        if cfg.cams == "keep" || s.cam_groups.is_empty() {
            return (0, String::new());
        }
        if cfg.cams == "tvmix" {
            return s
                .cam_groups
                .iter()
                .find(|g| g.0 > 0 && g.1.to_lowercase().contains("mix"))
                .cloned()
                .unwrap_or((0, String::new()));
        }
        let has = |names: &[&str], g: &(i32, String)| names.contains(&g.1.trim().to_lowercase().as_str());
        let mut pool: Vec<(i32, String)> = s.cam_groups.iter().filter(|g| g.0 > 0 && has(TV_GROUPS, g)).cloned().collect();
        // Kazalarda yalnızca TV kameraları (araç üstü kamera olayı göstermez)
        if cfg.cams == "mix" && kind != "incident" && self.rand() < 0.35 {
            let on: Vec<(i32, String)> = s.cam_groups.iter().filter(|g| g.0 > 0 && has(ONBOARD_GROUPS, g)).cloned().collect();
            if !on.is_empty() {
                pool = on;
            }
        }
        if pool.is_empty() {
            return (0, String::new());
        }
        // Aynı grup art arda gelmesin
        if pool.len() > 1 {
            pool.retain(|g| g.0 != self.group.0);
        }
        let i = ((self.rand() * pool.len() as f32) as usize).min(pool.len() - 1);
        pool[i].clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Driver;

    struct Rec(Vec<(String, i32)>);
    impl CamOut for Rec {
        fn switch(&mut self, n: &str, g: i32) {
            self.0.push((n.to_string(), g));
        }
    }

    fn sess(n: usize) -> SessionData {
        let mut s = SessionData { drivers: vec![None; MAX_CARS], player_idx: -1, track_length_km: 5.0, ..Default::default() };
        for i in 0..n {
            s.drivers[i] = Some(Driver {
                car_idx: i as i32,
                car_number: format!("{}", i + 10),
                name: format!("D{i}"),
                class_est_lap: 100.0,
                ..Default::default()
            });
        }
        s.cam_groups = vec![(1, "Nose".into()), (10, "TV1".into()), (11, "TV2".into()), (12, "Chase".into())];
        s
    }
    fn frame(n: usize) -> Frame {
        let mut f = Frame::default();
        f.cam_car_idx = -1;
        for i in 0..n {
            let c = &mut f.cars[i];
            c.position = i as i32 + 1;
            c.lap = 5;
            c.pct = 0.9 - i as f32 * 0.03;
            c.surface = 3;
            c.pct_rate = 0.012; // 60 m/sn
        }
        f
    }

    #[test]
    fn picks_and_rotates_and_respects_driving() {
        let s = sess(12);
        let mut f = frame(12);
        let mut d = Director::default();
        let mut cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.len(), 1, "ilk çekim hemen");
        assert!(d.status.active);
        // Aynı çekim sürerken yeni komut yok
        d.last_step = Instant::now() - Duration::from_secs(1);
        f.cam_car_idx = d.cur.unwrap().idx as i32;
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.len(), 1);
        // Zorla sonraki: farklı araç
        let first = d.cur.unwrap().idx;
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.len(), 2);
        assert_ne!(d.cur.unwrap().idx, first);
        // Kamera grupları dönerse TV grubu seçilir
        cfg.cams = "tv".into();
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert!([10, 11, 12].contains(&out.0.last().unwrap().1));
        // Sürücü pistte sürerken dokunmaz
        let mut s2 = s.clone();
        s2.player_idx = 3;
        f.is_on_track = true;
        d.next();
        d.step(&f, &s2, &cfg, true, &mut out);
        assert_eq!(d.status.why, "driving");
        assert_eq!(out.0.len(), 3);
    }

    #[test]
    fn grid_walk_then_tv_mix() {
        let mut s = sess(6);
        s.cam_groups.push((20, "TV Mixed".into()));
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), ..Default::default() }];
        let mut f = frame(6);
        f.session_state = 2;
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        for _ in 0..6 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
        }
        let nums: Vec<String> = out.0.iter().map(|x| x.0.clone()).collect();
        assert_eq!(nums, vec!["10", "11", "12", "13", "14", "15"], "pole'dan geriye sırayla");
        assert_eq!(d.status.kind, "grid");
        f.session_state = 4;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.last().unwrap().1, 20, "yeşil bayrakta TV Mixed");
        assert_ne!(d.status.kind, "grid");
    }

    #[test]
    fn many_shots_cover_whole_field() {
        let s = sess(20);
        let f = frame(20);
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        let mut seen = std::collections::HashSet::new();
        for _ in 0..200 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
            seen.insert(d.cur.unwrap().idx);
        }
        assert_eq!(seen.len(), 20, "zamanla bütün araçlar gösterilir");
    }

    #[test]
    fn incident_cuts_in() {
        let s = sess(10);
        let mut f = frame(10);
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        d.step(&f, &s, &cfg, true, &mut out);
        f.cam_car_idx = d.cur.unwrap().idx as i32;
        // 7. araç pist dışına çıktı
        f.cars[7].surface = 0;
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.cur.unwrap().idx, 7);
        assert_eq!(d.status.kind, "incident");
    }

    #[test]
    fn manual_change_pauses() {
        let s = sess(10);
        let mut f = frame(10);
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        d.step(&f, &s, &cfg, true, &mut out);
        let idx = d.cur.unwrap().idx;
        d.sent = Some((idx as i32, Instant::now() - Duration::from_secs(5)));
        f.cam_car_idx = ((idx + 1) % 10) as i32;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.status.why, "manual");
    }
}
