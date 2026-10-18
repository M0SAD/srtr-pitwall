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
    /// Bitişte ilk N araç çizgiye yaklaşırken kamerayı onlara çevir (beyaz bayraktan itibaren)
    pub finish_focus: bool,
    /// Yeni en hızlı tur atılınca kamera o araca geçer
    pub fastest_focus: bool,
    /// Tekrarda kazaya kesince tekrar olaydan biraz öncesine sarılır (olay baştan görünsün)
    pub incident_rewind: bool,
    /// Pite giren araçlar ara sıra gösterilir
    pub pit_focus: bool,
    pub finish_top: i32,
    /// İlk N bitirdikten sonra da bitiş çizgisine gelen (henüz bitirmemiş) araçları göster: herkes bitirene kadar
    pub finish_all: bool,
    pub battle_gap: f32,
    pub manual_pause: f32,
    /// PRO özelliği kilitli (PRO değil): çalışmaz
    pub locked: bool,
}

impl Default for Cfg {
    fn default() -> Self {
        Cfg {
            enabled: false,
            min_shot: 10.0,
            max_shot: 20.0,
            front_n: 5,
            w_leader: 20.0,
            w_front: 20.0,
            w_battle: 25.0,
            w_field: 40.0,
            w_me: 0.0,
            incidents: true,
            cams: "tvmix".into(),
            grid_walk: true,
            grid_shot: 4.0,
            finish_focus: true,
            fastest_focus: true,
            incident_rewind: true,
            pit_focus: true,
            finish_top: 3,
            finish_all: true,
            battle_gap: 1.0,
            manual_pause: 20.0,
            locked: false,
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
        c.finish_focus = v.get("finishFocus").and_then(|x| x.as_bool()).unwrap_or(true);
        c.fastest_focus = v.get("fastestFocus").and_then(|x| x.as_bool()).unwrap_or(true);
        c.incident_rewind = v.get("incidentRewind").and_then(|x| x.as_bool()).unwrap_or(true);
        c.pit_focus = v.get("pitFocus").and_then(|x| x.as_bool()).unwrap_or(true);
        c.finish_top = f("finishTop", c.finish_top as f32).clamp(1.0, 10.0) as i32;
        c.finish_all = v.get("finishAll").and_then(|x| x.as_bool()).unwrap_or(true);
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
    /// Yönetilmiyorsa nedeni: "off" | "pro" | "nosim" | "driving" | "manual"
    pub why: String,
    /// Çekim türü: grid | leader | front | battle | field | me | incident | finish
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
    /// Pist dışına çıkış / yavaşlama başlangıcı (karenin oturum zamanı, sn; -1 yok) ve son hızlı görülme zamanı
    off_t: [f64; MAX_CARS],
    slow_t: [f64; MAX_CARS],
    fast_t: [f64; MAX_CARS],
    /// Son kaza olayının başladığı oturum zamanı (tekrarda oraya sarılır)
    inc_t: f64,
    fast_at: [Option<Instant>; MAX_CARS],
    last_incident: [Option<Instant>; MAX_CARS],
    /// En hızlı tur takibi: (oturum, en iyi süre), son en hızlı tur çekimi
    fast_best: (i32, f32),
    fastest_at: Option<Instant>,
    /// Kurgunun başladığı an (hiç gösterilmeyen araçların bekleme süresi buradan sayılır)
    born: Instant,
    /// Bekleyen çekim (araç, tür, süre, ne zamandan beri)
    pending: Option<(usize, &'static str, f32, Instant)>,
    /// Tekrar sarılıyor: bu ana kadar kamera komutu yok, yeni kaza algılanmaz
    seek_until: Option<Instant>,
    /// Beyaz bayrak (son tur) liderin önüne çıktı: lider bir süre gösterilir
    white_seen: bool,
    /// Pit yolu: önceki karede pitte miydi, son pit çekimi
    prev_pit: [bool; MAX_CARS],
    pit_shot_at: Option<Instant>,
    white_hold: Option<(usize, Instant)>,
    /// Gönderilen son hedef ve zamanı (kamera telemetride ona dönene dek elle değişiklik sayılmaz)
    sent: Option<(i32, Instant)>,
    manual_until: Option<Instant>,
    last_step: Instant,
    rng: u64,
    group: (i32, String),
    /// Yakın mücadelede kamera açısının son değiştiği an (araç içi ↔ TV)
    cam_at: Instant,
    force_next: bool,
    /// Grid turu: sıradaki grid sırası (0 = pole) ve önceki karede grid aşamasında mıydık
    grid_i: usize,
    /// Bitiş: damalı bayrak çıktığı andaki tamamlanan turlar, bitirenler, çizgiyi az önce geçen (gösterim süresi için)
    fin_snap: Option<Vec<i32>>,
    fin_done: [bool; MAX_CARS],
    fin_hold: Option<(usize, Instant)>,
    fin_prev_state: i32,
    was_grid: bool,
    /// Grid turu bir kez bütün araçları gösterdi: yeşile kadar TV kamerasıyla normal kurgu
    grid_done: bool,
    /// Elle başlatılan grid turu (ayarlardaki düğme): yeşilden sonra da bir kez bütün araçlar
    grid_force: bool,
    /// Grid turunda gösterilen araçlar
    grid_seen: [bool; MAX_CARS],
    grid_sess: i32,
    prev_pre: bool,
    pub status: Status,
}

impl Default for Director {
    fn default() -> Self {
        Director {
            cur: None,
            last_shown: [None; MAX_CARS],
            prev_surface: [-1; MAX_CARS],
            off_t: [-1.0; MAX_CARS],
            slow_t: [-1.0; MAX_CARS],
            fast_t: [-1.0; MAX_CARS],
            inc_t: -1.0,
            fast_at: [None; MAX_CARS],
            last_incident: [None; MAX_CARS],
            fast_best: (-1, -1.0),
            fastest_at: None,
            born: Instant::now(),
            pending: None,
            seek_until: None,
            white_seen: false,
            prev_pit: [false; MAX_CARS],
            pit_shot_at: None,
            white_hold: None,
            sent: None,
            manual_until: None,
            last_step: Instant::now() - Duration::from_secs(5),
            rng: 0x9E37_79B9_7F4A_7C15
                ^ std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos() as u64)
                    .unwrap_or(1),
            group: (0, String::new()),
            cam_at: Instant::now(),
            force_next: false,
            grid_i: 0,
            was_grid: false,
            grid_done: false,
            grid_force: false,
            grid_seen: [false; MAX_CARS],
            grid_sess: -1,
            prev_pre: false,
            fin_snap: None,
            fin_done: [false; MAX_CARS],
            fin_hold: None,
            fin_prev_state: 0,
            status: Status::default(),
        }
    }
}

/// Komut gönderici (testte sahte)
pub trait CamOut {
    fn switch(&mut self, number: &str, group: i32);
    /// Tekrarı oturumdaki zamana sar ve kamerayı araçta tut (yalnız tekrar izlerken)
    fn rewind(&mut self, _session_num: i32, _time_s: f64, _number: &str, _idx: i32) {}
}

pub struct IracingOut;
impl CamOut for IracingOut {
    fn switch(&mut self, number: &str, group: i32) {
        let _ = crate::broadcast::camera_to_car_group(number, group);
    }
    fn rewind(&mut self, session_num: i32, time_s: f64, number: &str, idx: i32) {
        // Doğrulamalı sarma (zaman araması tutmazsa kare numarasıyla), bitince kamera araca ve 1x oynatma. Bekleme
        // içerdiği için ayrı iş parçacığında; sarma sürerken kamera komutu gönderilmez (sarmayı yarıda bırakabiliyor)
        let number = number.to_string();
        std::thread::spawn(move || {
            let _ = crate::broadcast::replay_seek(session_num, time_s, &number, Some(idx), 0.0);
        });
    }
}

const TV_GROUPS: &[&str] = &["tv1", "tv2", "tv3", "tv static", "tv mixed", "chase", "far chase", "blimp", "chopper"];
/// Grid turunda aracı yakından, kim olduğu anlaşılacak şekilde gösteren kameralar (sırayla değişir)
const GRID_GROUPS: &[&str] = &["rear chase"];
/// Önden kamera yoksa
const GRID_FALLBACK: &[&str] = &["chase", "gyro", "far chase"];
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

    /// O anki çekim türü (TV grafikleri için)
    pub fn current_kind(&self) -> &'static str {
        self.cur.map(|c| c.kind).unwrap_or("")
    }

    /// Bir sonraki çekime hemen geç (arayüzdeki "Sonraki çekim")
    /// Grid turunu baştan başlat: araçlar 1. sıradan itibaren sırayla (bir kez), sonra normal kurgu
    pub fn restart_grid(&mut self) {
        self.grid_force = true;
        self.force_next = true;
        self.grid_seen = [false; MAX_CARS];
        self.grid_done = false;
        self.was_grid = false;
        self.grid_i = 0;
        self.cur = None;
        self.manual_until = None;
    }

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
        if !cfg.enabled || !iracing || cfg.locked {
            st.why = if cfg.locked && cfg.enabled { "pro".into() } else if cfg.enabled { "nosim".into() } else { "off".into() };
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

        // Tekrar sarılıyor: bitene kadar kamera komutu gönderme (sarmayı yarıda bırakır)
        if let Some(u) = self.seek_until {
            if now < u {
                self.fill_status(&mut st, f, s, now);
                self.status = st;
                return;
            }
            self.seek_until = None;
            // Sarmadan sonraki zaman sıçraması kaza sayılmasın: çekim yeniden başlar
            if let Some(c) = self.cur.as_mut() {
                c.start = now;
            }
        }

        // Yarış başlamadan: gridi pole'dan başlayarak sırayla göster; yeşil bayrakta normal kurguya geç
        let race = s
            .sessions
            .iter()
            .find(|x| x.num == f.session_num)
            .map(|x| x.kind.to_lowercase().contains("race"))
            .unwrap_or(false);
        // Tekrarda da: kasetteki an grid / ısınma turuysa (SessionState tekrarın o anını verir)
        // Yeşil bayraktan önce mi: yarış durumu 1-3 ve yeşil / "start go" bayrağı yok (durum geç güncellense de start
        // alınınca grid turu biter)
        const GREEN: u32 = 0x0000_0004;
        const START_GO: u32 = 0x8000_0000;
        let pre = race && (1..=3).contains(&f.session_state) && f.session_flags & (GREEN | START_GO) == 0;
        // Yeşil bayrak: grid turu (elle başlatılmış olsa da) yarıda kalsa bile biter, TV Mixed'e geçilir
        if self.prev_pre && !pre && race {
            self.grid_force = false;
            self.grid_done = true;
        }
        self.prev_pre = pre;
        // Grid turu oturum başına bir kez: durum bir an değişse (grid → ısınma turu, tekrar kafası) baştan başlamaz;
        // yalnızca yeni oturumda ya da "Baştan başlat" ile
        if f.session_num != self.grid_sess {
            self.grid_sess = f.session_num;
            self.grid_done = false;
            self.grid_seen = [false; MAX_CARS];
        }
        // Grid turu: araçlar ön sıradan geriye, her biri bir kez. Gridde sonradan yerini alan (geç yüklenen) araç da
        // sırası gelince gösterilir; herkes gösterilince yeşile kadar TV Mixed.
        let order = if pre || self.grid_force { Self::grid_order(f, s) } else { Vec::new() };
        let next_unseen = order.iter().copied().find(|&i| !self.grid_seen[i]);
        if self.grid_done && cfg.grid_walk && pre && next_unseen.is_some() && !self.grid_force {
            self.grid_done = false;
        }
        let grid = (cfg.grid_walk && pre && !self.grid_done) || self.grid_force;
        if grid {
            if !self.was_grid {
                self.cur = None;
            }
            self.was_grid = true;
            let elapsed = self.cur.map(|c| now.duration_since(c.start).as_secs_f32()).unwrap_or(f32::MAX);
            if !order.is_empty() && (self.force_next || self.cur.map(|c| elapsed >= c.len).unwrap_or(true)) {
                match next_unseen {
                    None => {
                        // Herkes gösterildi: yeşile kadar TV Mixed (normal kurgu). "En uzun süredir gösterilmeyen" kuralı
                        // grid sırasını yeniden üretmesin (yine sırayla gidiyordu): gösterilme zamanları karıştırılır
                        for &i in &order {
                            let back = Duration::from_secs_f32(self.rand() * 120.0);
                            self.last_shown[i] = Some(now.checked_sub(back).unwrap_or(now));
                        }
                        self.grid_done = true;
                        self.grid_force = false;
                        self.was_grid = false;
                        self.cur = None;
                        self.force_next = false;
                    }
                    Some(idx) => {
                        self.grid_seen[idx] = true;
                        self.grid_i = order.iter().position(|&x| x == idx).map(|p| p + 1).unwrap_or(0);
                        if let Some(number) = s.driver(idx).map(|d| d.car_number.clone()).filter(|n| !n.is_empty()) {
                            // Aracı önden gösteren kamera
                            let g = self.grid_group(s, cfg);
                            out.switch(&number, g.0);
                            self.group = g;
                            self.sent = Some((idx as i32, now));
                            self.cur = Some(Shot { idx, kind: "grid", start: now, len: cfg.grid_shot });
                            self.last_shown[idx] = Some(now);
                        }
                    }
                }
            }
            if !self.grid_done {
                self.force_next = false;
                self.fill_status(&mut st, f, s, now);
                self.status = st;
                return;
            }
        }
        if self.was_grid {
            // Yeşil bayrak: hemen yeni çekim (TV kamerasına geçilir)
            self.was_grid = false;
            self.cur = None;
        }

        // Bitiş: ilk N araç çizgiye yaklaşırken onlar (kaza ve diğer kurgudan önce gelir)
        let fin = self.finish_target(f, s, cfg, race, now);
        if fin.is_none() && self.cur.map(|c| c.kind == "finish").unwrap_or(false) {
            self.cur = None;
        }

        // En hızlı tur
        let fastest = if iracing && cfg.fastest_focus { self.detect_fastest(f, s, race, now) } else { None };

        // Pite giren (yarışta): öndeki öncelikli; 40 sn'de bir kezden sık değil
        let pit_in = if iracing && cfg.pit_focus && race && f.session_state == 4 { self.detect_pit(f, s, now) } else {
            for i in 0..MAX_CARS {
                self.prev_pit[i] = f.cars[i].on_pit;
            }
            None
        };

        // Karar
        let elapsed = self.cur.map(|c| now.duration_since(c.start).as_secs_f32()).unwrap_or(f32::MAX);
        let cur_ok = self.cur.map(|c| crate::calc::active(f, s, c.idx) && f.cars[c.idx].surface != -1).unwrap_or(false);
        let mut pick: Option<(usize, &'static str, f32)> = None;
        if let Some(fi) = fin {
            if self.cur.map(|c| c.kind != "finish" || c.idx != fi).unwrap_or(true) {
                pick = Some((fi, "finish", 999.0));
            }
        } else if let Some(ci) = crash {
            let on_incident = self.cur.map(|c| c.kind == "incident" && c.idx == ci).unwrap_or(false);
            // Sürmekte olan bir kaza çekimi en az 10 sn sürsün (olay ve sonrası görünsün); ön sıralardaki bir aracın
            // kazası arkadakinin çekimini böler
            let np = f.cars[ci].position;
            let front_first = self
                .cur
                .map(|c| {
                    let cp = f.cars[c.idx].position;
                    np > 0 && np <= cfg.front_n && (cp <= 0 || np < cp)
                })
                .unwrap_or(false);
            let busy = !front_first && self.cur.map(|c| c.kind == "incident" && elapsed < 10.0).unwrap_or(false);
            if !on_incident && !busy {
                pick = Some((ci, "incident", 16.0));
            }
        } else if let Some(fi) = fastest {
            // Yeni en hızlı tur: o araç birkaç saniye (kaza çekimi sürüyorsa onu bölmez)
            let busy = self.cur.map(|c| c.kind == "incident" && elapsed < 10.0).unwrap_or(false);
            if !busy && self.cur.map(|c| c.idx != fi || c.kind != "fastest").unwrap_or(true) {
                pick = Some((fi, "fastest", 10.0));
            }
        } else if let Some(pi) = pit_in {
            // Pite giren araç: kaza / bitiş / en hızlı tur çekimini bölmez
            let busy = self.cur.map(|c| matches!(c.kind, "incident" | "fastest" | "finish") && elapsed < c.len).unwrap_or(false);
            if !busy && self.cur.map(|c| c.idx != pi).unwrap_or(true) {
                pick = Some((pi, "pit", 10.0));
                self.pit_shot_at = Some(now);
            }
        }
        // Mücadele sürüyorsa çekim biraz uzar; mücadele bittiyse en kısa süreden sonra kesilir
        let mut due = self.cur.map(|c| elapsed >= c.len).unwrap_or(true);
        if let Some(c) = self.cur.filter(|c| c.kind == "battle") {
            let on = self.in_battle(f, s, c.idx, cfg.battle_gap * 1.5);
            // Dip dibe (0,5 sn'den yakın) giderken biraz daha uzun: en çok 25 sn (diğer mücadeleler 20 sn)
            let tight = self.in_battle(f, s, c.idx, 0.5);
            let cap = if tight { 25.0f32 } else { 20.0 };
            if due && on && elapsed < cap.max(c.len) {
                due = false;
            } else if !due && !on && elapsed >= cfg.min_shot.max(6.0) {
                due = true;
            }
        }
        if pick.is_none() && fin.is_none() && (self.force_next || !cur_ok || due) {
            pick = self.choose(f, s, cfg, now);
        }
        // Süren dip dibe mücadele: ~10 sn'de bir araç içi kamera ile TV kamerası arasında geçiş (aynı araç)
        if pick.is_none() && !due {
            if let Some(c) = self.cur.filter(|c| c.kind == "battle") {
                if now.duration_since(self.cam_at) >= Duration::from_secs(12) && self.in_battle(f, s, c.idx, 0.5) {
                    // Her seferinde değil, ara sıra (araç içi ↔ TV)
                    self.cam_at = now;
                    if self.rand() >= 0.4 {
                        self.fill_status(&mut st, f, s, now);
                        self.status = st;
                        return;
                    }
                    let onboard = self.onboard_group(s, cfg);
                    let is_on = onboard.as_ref().map(|g| g.0 == self.group.0).unwrap_or(false);
                    let g = if is_on { Some(self.pick_group(s, cfg, "battle")) } else { onboard };
                    if let (Some(g), Some(number)) = (g, s.driver(c.idx).map(|d| d.car_number.clone()).filter(|n| !n.is_empty())) {
                        out.switch(&number, g.0);
                        self.group = g;
                        self.sent = Some((c.idx as i32, now));
                        self.cam_at = now;
                    }
                }
            }
        }
        // Çok hızlı kesme olmasın: bir çekim en az 6 sn ekranda kalır (kaza, bitiş, elle "sonraki" ve görünmez olan araç hariç)
        // Bekletilen pit çekimi (önceki kesmeye çok yakındı): 8 sn içinde sırası gelince
        if pick.is_none() {
            if let Some((pi, k, l, at)) = self.pending {
                if now.duration_since(at) > Duration::from_secs(8) {
                    self.pending = None;
                } else if elapsed >= 6.0 {
                    pick = Some((pi, k, l));
                    self.pending = None;
                }
            }
        }
        if let Some((pi, kind, len)) = pick {
            let urgent = matches!(kind, "incident" | "finish" | "fastest") || self.force_next || !cur_ok;
            if !urgent && self.cur.is_some() && elapsed < 6.0 {
                if kind == "pit" {
                    self.pending = Some((pi, kind, len, now));
                }
                pick = None;
            }
        }
        self.force_next = false;
        if let Some((idx, kind, len)) = pick {
            let number = s.driver(idx).map(|d| d.car_number.clone()).unwrap_or_default();
            if !number.is_empty() {
                // Dip dibe mücadele: arkadaki aracın içinden (öndekini takip ederken)
                let group = if kind == "battle" && self.in_battle(f, s, idx, 0.5) && self.rand() < 0.35 {
                    self.onboard_group(s, cfg).unwrap_or_else(|| self.pick_group(s, cfg, kind))
                } else if matches!(cfg.cams.as_str(), "tvmix" | "mix") && matches!(kind, "leader" | "front" | "field") && self.cur.is_some() && self.rand() < 0.12 {
                    // Ara sıra (çekimlerin ~%12'si) araç içinden; çekim en az "en kısa çekim" kadar sürer
                    self.onboard_group(s, cfg).unwrap_or_else(|| self.pick_group(s, cfg, kind))
                } else {
                    self.pick_group(s, cfg, kind)
                };
                out.switch(&number, group.0);
                self.cam_at = now;
                // Tekrar izlerken: olaydan 6 sn öncesine sar, kaza ve öncesi görünsün (canlıda geri sarılamaz). Sarma
                // tamamlanana kadar (birkaç sn) kurgu yeni kamera komutu göndermez
                if kind == "incident" && cfg.incident_rewind && crate::calc::replay_watch(f) && self.inc_t > 0.0 {
                    out.rewind(f.replay_session_num, (self.inc_t - 6.0).max(0.0), &number, idx as i32);
                    self.seek_until = Some(now + Duration::from_secs(5));
                }
                self.group = group;
                self.sent = Some((idx as i32, now));
                self.cur = Some(Shot { idx, kind, start: now, len });
                self.last_shown[idx] = Some(now);
            }
        }
        self.fill_status(&mut st, f, s, now);
        self.status = st;
    }

    /// Bitişte gösterilecek araç: beyaz bayraktan (son tur) itibaren lider, damalı bayraktan sonra da ilk N'den henüz
    /// bitirmemiş olup çizgiye en yakın gelen (çizgiye `LEAD` sn'den az kaldıysa). Çizgiyi geçen 3 sn daha gösterilir.
    fn finish_target(&mut self, f: &Frame, s: &SessionData, cfg: &Cfg, race: bool, now: Instant) -> Option<usize> {
        const LEAD: f32 = 15.0;
        const WHITE: u32 = 0x0000_0002;
        let st = f.session_state;
        let prev = self.fin_prev_state;
        self.fin_prev_state = st;
        if !cfg.finish_focus || !race || st < 4 {
            self.white_seen = false;
            self.white_hold = None;
            self.fin_snap = None;
            self.fin_done = [false; MAX_CARS];
            self.fin_hold = None;
            return None;
        }
        let checkered = st >= 5;
        // Beyaz bayrak çıktı (lider son tura başladı): lider 10 sn gösterilir, çizgiye yaklaşınca yeniden
        let white = !checkered && f.session_flags & WHITE != 0;
        if white && !self.white_seen {
            self.white_seen = true;
            if let Some(l) = (0..MAX_CARS).find(|&i| f.cars[i].position == 1 && crate::calc::active(f, s, i)) {
                self.white_hold = Some((l, now));
            }
        }
        if let Some((l, at)) = self.white_hold {
            if !checkered && now.duration_since(at) < Duration::from_secs(10) {
                return Some(l);
            }
            self.white_hold = None;
        }
        if !checkered && !white {
            // Son tur başlamak üzere: lider çizgiye yaklaşıyor ve bu geçişte beyaz bayrak sallanacak (bayrağı görelim)
            if !self.white_seen {
                if let Some(l) = (0..MAX_CARS).find(|&i| f.cars[i].position == 1 && crate::calc::active(f, s, i)) {
                    let c = &f.cars[l];
                    let lap = s
                        .driver(l)
                        .map(|d| d.class_est_lap)
                        .filter(|x| *x > 10.0)
                        .or_else(|| (c.best > 10.0).then_some(c.best))
                        .unwrap_or(100.0);
                    let ttl = (1.0 - c.pct.max(0.0)) * lap;
                    let total = s.session(f.session_num).and_then(|e| e.laps).unwrap_or(0);
                    // Tur sayılı: lider sondan bir önceki turda; süreli: çizgiye vardığında süre bitmiş olacak
                    let penult = (total > 0 && total < 32767 && c.lap == total - 1) || f.session_laps_remain == 1;
                    let rem = f.session_time_remain;
                    let timed = (total <= 0 || total >= 32767) && rem >= 0.0 && rem < 1e5 && rem - (ttl as f64) <= 0.0;
                    if (penult || timed) && !c.on_pit && ttl < LEAD {
                        return Some(l);
                    }
                }
            }
            return None;
        }
        if checkered && self.fin_snap.is_none() {
            self.fin_snap = Some((0..MAX_CARS).map(|i| f.cars[i].lap_completed).collect());
            // Damalı bayrağı lider açtı: o bitirmiştir; çizgiyi geçişi 3 sn gösterilir
            if let Some(l) = (0..MAX_CARS).find(|&i| f.cars[i].position == 1) {
                self.fin_done[l] = true;
                if prev == 4 {
                    self.fin_hold = Some((l, now));
                }
            }
        }
        if let Some(snap) = &self.fin_snap {
            for i in 0..MAX_CARS {
                if !self.fin_done[i] && f.cars[i].lap_completed > snap[i] && snap[i] >= 0 {
                    self.fin_done[i] = true;
                    // Az önce gösterdiğimiz araç çizgiyi geçti: biraz daha göster
                    if self.cur.map(|c| c.kind == "finish" && c.idx == i).unwrap_or(false) {
                        self.fin_hold = Some((i, now));
                    }
                }
            }
        }
        if let Some((i, at)) = self.fin_hold {
            if now.duration_since(at) < Duration::from_secs(3) {
                return Some(i);
            }
            self.fin_hold = None;
        }
        let mut best: Option<(usize, f32, bool)> = None;
        for i in 0..MAX_CARS {
            let c = &f.cars[i];
            if !crate::calc::active(f, s, i) || self.fin_done[i] || c.on_pit || c.pct < 0.0 {
                continue;
            }
            // Damalı bayraktan önce yalnızca lider (son turda); sonra önce ilk N, çizgiye gelen ilk N yoksa (finish_all)
            // bitirmemiş diğer araçlar: herkes çizgiyi geçene kadar
            let top = (1..=cfg.finish_top).contains(&c.position);
            let ok = if checkered { top || (cfg.finish_all && c.position > 0) } else { c.position == 1 };
            if !ok {
                continue;
            }
            let lap = s
                .driver(i)
                .map(|d| d.class_est_lap)
                .filter(|x| *x > 10.0)
                .or_else(|| (c.best > 10.0).then_some(c.best))
                .unwrap_or(100.0);
            let ttl = (1.0 - c.pct) * lap;
            if ttl >= LEAD {
                continue;
            }
            // İlk N'den biri çizgiye geliyorsa o önce
            let better = match best {
                None => true,
                Some((_, bt, btop)) => (top && !btop) || (top == btop && ttl < bt),
            };
            if better {
                best = Some((i, ttl, top));
            }
        }
        best.map(|b| b.0)
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
    /// Grid turu sırası: lider tablosundaki sıra (aynı sıralama işlevi): önce griddekiler, sonra pitte olanlar;
    /// garajdakiler (dünyada olmayan) atlanır
    fn grid_order(f: &Frame, s: &SessionData) -> Vec<usize> {
        let mut v = crate::calc::field_idxs(f, s);
        crate::calc::sort_field(f, s, &mut v);
        v.retain(|&i| crate::calc::active(f, s, i));
        // Önce griddekiler (sıralamaya göre), sonra pitte olanlar; garajdakiler (dünyada olmayan) atlanır
        let (grid, pit): (Vec<usize>, Vec<usize>) = v.into_iter().partition(|&i| !f.cars[i].on_pit && f.cars[i].surface >= 1);
        let pit: Vec<usize> = pit.into_iter().filter(|&i| f.cars[i].on_pit || f.cars[i].surface >= 1).collect();
        grid.into_iter().chain(pit).collect()
    }



    /// Kaza / pist dışı: yeni olan aracı döndürür
    fn detect(&mut self, f: &Frame, s: &SessionData, now: Instant) -> Option<usize> {
        // Kaza / pist dışı: kısa kenar taşmaları ve hız ölçümündeki sıçramalar sayılmaz, görüntüde görünür olaylar sayılır:
        //  - pist dışında en az 0,5 sn kalan, hızlıyken (son 5 sn) çıkmış araç
        //  - hızlıyken (son 5 sn) pistte yavaşlayıp en az 0,5 sn neredeyse duran (< 40 km/s) araç (dönme / çarpışma)
        let len_m = s.track_length_km * 1000.0;
        let t = if crate::calc::replay_watch(f) { f.replay_session_time } else { f.session_time };
        let mut hit: Option<(usize, f64)> = None;
        for i in 0..MAX_CARS {
            if !crate::calc::active(f, s, i) {
                self.prev_surface[i] = -1;
                self.fast_at[i] = None;
                self.off_t[i] = -1.0;
                self.slow_t[i] = -1.0;
                self.fast_t[i] = -1.0;
                continue;
            }
            let c = &f.cars[i];
            // Zaman geri gitti (tekrar sarıldı): araç geçmişi sıfırlanır
            if self.fast_t[i] > t + 0.5 || self.off_t[i] > t + 0.5 || self.slow_t[i] > t + 0.5 {
                self.off_t[i] = -1.0;
                self.slow_t[i] = -1.0;
                self.fast_t[i] = -1.0;
            }
            let speed = if len_m > 100.0 { c.pct_rate * len_m } else { 0.0 };
            let was_fast = |ft: f64, at: f64| ft >= 0.0 && at - ft < 5.0;
            if speed > 30.0 && c.surface == 3 {
                self.fast_at[i] = Some(now);
                self.fast_t[i] = t;
            }
            // Pist dışı
            if c.surface == 0 && !c.on_pit {
                if self.off_t[i] < 0.0 && self.prev_surface[i] == 3 {
                    self.off_t[i] = t;
                }
            } else {
                self.off_t[i] = -1.0;
            }
            let off_ev = self.off_t[i] >= 0.0 && t - self.off_t[i] >= 0.5 && was_fast(self.fast_t[i], self.off_t[i]);
            // Pistte neredeyse durdu
            if c.surface == 3 && !c.on_pit && speed < 11.0 {
                if self.slow_t[i] < 0.0 && was_fast(self.fast_t[i], t) {
                    self.slow_t[i] = t;
                }
            } else {
                self.slow_t[i] = -1.0;
            }
            let stop_ev = self.slow_t[i] >= 0.0 && t - self.slow_t[i] >= 0.5;
            // Kaza yapıp araç sıfırlandı (pite ışınlandı: pit yolundan geçmeden pist / pist dışından pit kutusuna). Tekrarda
            // olayın öncesine sarılıp kaza gösterilir; az önce kazası gösterildiyse tekrar gösterilmez
            let tow_ev = crate::calc::replay_watch(f)
                && matches!(self.prev_surface[i], 0 | 3)
                && (c.surface == 1 || c.on_pit)
                && self.fast_t[i] >= 0.0
                && self.last_incident[i].map(|x| now.duration_since(x) > Duration::from_secs(60)).unwrap_or(true);
            self.prev_surface[i] = c.surface;
            if ((off_ev || stop_ev) && !c.on_pit) || tow_ev {
                // Olayın başladığı an: hızlı görüldüğü son an (yavaşlama / çıkış ondan hemen sonra)
                let start = if off_ev { self.off_t[i].min(self.fast_t[i].max(0.0) + 0.5) } else { self.fast_t[i].max(0.0) };
                self.off_t[i] = -1.0;
                self.slow_t[i] = -1.0;
                self.fast_t[i] = -1.0;
                self.fast_at[i] = None;
                let recent = self.last_incident[i].map(|x| now.duration_since(x) < Duration::from_secs(12)).unwrap_or(false);
                if !recent {
                    self.last_incident[i] = Some(now);
                    // Öndeki sıradaki aracın olayı öncelikli
                    let better = hit.map(|(h, _)| {
                        let ph = f.cars[h].position;
                        let pi = c.position;
                        pi > 0 && (ph <= 0 || pi < ph)
                    });
                    if better.unwrap_or(true) {
                        hit = Some((i, start));
                    }
                }
            }
        }
        hit.map(|(i, st)| {
            self.inc_t = st;
            i
        })
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
        // Hiç gösterilmeyen araç: kurgunun başlangıcından beri gösterilmemiş sayılır
        let born = self.born;
        let since = |i: usize| now.saturating_duration_since(shown[i].unwrap_or(born)).as_secs_f32();

        let leader = cars.first().copied().filter(|&i| f.cars[i].position == 1);
        let front: Vec<usize> = cars.iter().copied().filter(|&i| (2..=cfg.front_n).contains(&f.cars[i].position)).collect();
        let battles = self.battles(f, s, &cars, cfg.battle_gap);
        let field: Vec<usize> = cars.iter().copied().filter(|&i| f.cars[i].position > cfg.front_n).collect();

        let mut opts: Vec<(&'static str, f32)> = Vec::new();
        if leader.is_some() && leader != cur {
            opts.push(("leader", cfg.w_leader));
        }
        if front.iter().any(|&i| Some(i) != cur) {
            opts.push(("front", cfg.w_front));
        }
        // Aynı ikili sürekli yakın takipteyse çok sık gösterilmesin: ikisinden biri son 2 dk'da gösterildiyse o mücadele beklemede
        let fresh = |a: usize, b: usize| since(a) > 120.0 && since(b) > 120.0;
        if battles.iter().any(|&(a, b)| Some(b) != cur && Some(a) != cur && fresh(a, b)) {
            opts.push(("battle", cfg.w_battle));
        }
        if field.iter().any(|&i| Some(i) != cur) {
            opts.push(("field", cfg.w_field));
        }
        // Uzun süredir (2,5 dk) ekrana gelmeyen araç varsa sıra ona gelir: yarıştaki bütün araçlar mutlaka gösterilir
        // (kendi aracın da diğerleri gibi; ayrı bir kural yok)
        let overdue: Vec<usize> = cars.iter().copied().filter(|&i| Some(i) != cur && since(i) > 150.0).collect();
        if !overdue.is_empty() {
            opts.push(("overdue", (cfg.w_field.max(15.0)) * 2.5));
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
                // En uzun süredir gösterilmeyen (hiç gösterilmeyen önce); eşitlikte küçük rastgelelik
                let sc = since(i) + if shown[i].is_none() { 1000.0 } else { 0.0 } + d.rand() * 3.0;
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
                    if Some(b) == cur || Some(a) == cur || !fresh(a, b) {
                        continue;
                    }
                    let sc = 100.0 - f.cars[a].position as f32 + since(b).min(120.0) * 0.3 + self.rand() * 10.0;
                    if best.map(|x| sc > x.1).unwrap_or(true) {
                        best = Some((b, sc));
                    }
                }
                best.map(|x| x.0)
            }
            "overdue" => {
                let o: Vec<usize> = cars.iter().copied().filter(|&i| Some(i) != cur && since(i) > 150.0).collect();
                least(&o, self)
            }
            _ => least(if field.is_empty() { &cars } else { &field }, self),
        }
        .or_else(|| least(&cars, self))?;
        // Türe göre süre (yayınlarda olduğu gibi): lider biraz uzun, mücadele daha uzun (sürdükçe uzar), arkadaki
        // araçlar kısa (bütün sahaya sıra gelsin, izleyici sıkılmasın)
        let kind = if kind == "overdue" { "field" } else { kind };
        let len = match kind {
            "battle" => {
                if self.in_battle(f, s, idx, 0.5) {
                    (len * 1.4).min(22.0f32.max(cfg.max_shot))
                } else {
                    (len * 1.2).min(18.0f32.max(cfg.max_shot))
                }
            }
            "leader" => len * 1.2,
            "field" => (len * 0.75).max(cfg.min_shot.min(6.0)),
            _ => len,
        };
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

    /// Pit yoluna yeni giren araç (önde olan öncelikli); son pit çekiminden 40 sn geçmediyse yok
    fn detect_pit(&mut self, f: &Frame, s: &SessionData, now: Instant) -> Option<usize> {
        let mut hit: Option<usize> = None;
        for i in 0..MAX_CARS {
            let on = f.cars[i].on_pit;
            if on && !self.prev_pit[i] && crate::calc::active(f, s, i) && f.cars[i].position > 0 {
                if hit.map(|h| f.cars[i].position < f.cars[h].position).unwrap_or(true) {
                    hit = Some(i);
                }
            }
            self.prev_pit[i] = on;
        }
        if self.pit_shot_at.map(|t| now.duration_since(t) < Duration::from_secs(40)).unwrap_or(false) {
            return None;
        }
        hit
    }

    /// Yeni en hızlı tur (oturumda tüm araçların en iyisi düştü): o araç. Yarışta ilk 2 turda (herkes ilk turlarını
    /// atarken) ve 25 sn içinde bir kezden fazla kesilmez.
    fn detect_fastest(&mut self, f: &Frame, s: &SessionData, race: bool, now: Instant) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for i in 0..MAX_CARS {
            let b = f.cars[i].best;
            if b > 1.0 && crate::calc::active(f, s, i) && best.map(|x| b < x.1).unwrap_or(true) {
                best = Some((i, b));
            }
        }
        let (sess, prev) = self.fast_best;
        let Some((idx, b)) = best else {
            if sess == f.session_num {
                self.fast_best = (sess, -1.0);
            }
            return None;
        };
        if sess != f.session_num || prev <= 0.0 || b > prev + 1e-3 {
            // Yeni oturum / ilk değer / en iyi tur sıfırlandı (yeşil bayrak, tekrar sarıldı): duyurmadan not et
            self.fast_best = (f.session_num, b);
            return None;
        }
        if b >= prev - 1e-3 {
            return None;
        }
        self.fast_best = (f.session_num, b);
        let lead_laps = (0..MAX_CARS).filter(|&i| f.cars[i].position == 1).map(|i| f.cars[i].lap_completed).next().unwrap_or(99);
        if race && lead_laps < 2 {
            return None;
        }
        if self.fastest_at.map(|t| now.duration_since(t) < Duration::from_secs(25)).unwrap_or(false) {
            return None;
        }
        // Pistte / görünür değilse (pit, garaj) kesilmez
        if f.cars[idx].surface < 1 || f.cars[idx].on_pit {
            return None;
        }
        self.fastest_at = Some(now);
        Some(idx)
    }

    /// Araç hâlâ önündeki ya da arkasındaki araçla `gap` sn'den yakın mı
    fn in_battle(&self, f: &Frame, s: &SessionData, idx: usize, gap: f32) -> bool {
        let mut cars: Vec<usize> = (0..MAX_CARS)
            .filter(|&i| crate::calc::active(f, s, i) && f.cars[i].surface >= 1 && !f.cars[i].on_pit && f.cars[i].position > 0)
            .collect();
        cars.sort_by_key(|&i| f.cars[i].position);
        self.battles(f, s, &cars, gap).iter().any(|&(a, b)| a == idx || b == idx)
    }

    /// Araç içi kamera (arkadaki aracın gözünden öndeki): Roll Bar, yoksa Cockpit, yoksa Nose
    fn onboard_group(&self, s: &SessionData, cfg: &Cfg) -> Option<(i32, String)> {
        if cfg.cams == "keep" {
            return None;
        }
        for name in ["roll bar", "cockpit", "nose"] {
            if let Some(g) = s.cam_groups.iter().find(|g| g.0 > 0 && g.1.trim().to_lowercase() == name) {
                return Some(g.clone());
            }
        }
        None
    }

    /// Grid turu kamerası: aracı önden gösteren (oturumda yoksa yakın bir arka kamera, o da yoksa sim seçsin)
    fn grid_group(&mut self, s: &SessionData, cfg: &Cfg) -> (i32, String) {
        if cfg.cams == "keep" {
            return (0, String::new());
        }
        let has = |names: &[&str], g: &(i32, String)| names.contains(&g.1.trim().to_lowercase().as_str());
        // Aracı önden gösteren kamera (Rear Chase: aracın önünde, ona bakar); yoksa yakın arka kameralar
        let mut pool: Vec<(i32, String)> = s.cam_groups.iter().filter(|g| g.0 > 0 && has(GRID_GROUPS, g)).cloned().collect();
        if pool.is_empty() {
            pool = s.cam_groups.iter().filter(|g| g.0 > 0 && has(GRID_FALLBACK, g)).cloned().collect();
        }
        if pool.is_empty() {
            return (0, String::new());
        }
        let i = ((self.rand() * pool.len() as f32) as usize).min(pool.len() - 1);
        pool[i].clone()
    }

    fn pick_group(&mut self, s: &SessionData, cfg: &Cfg, kind: &str) -> (i32, String) {
        if cfg.cams == "keep" || s.cam_groups.is_empty() {
            return (0, String::new());
        }
        if cfg.cams == "tvmix" {
            // TV Mixed yoksa (bazı pist / tekrarlarda adı farklı) aşağıdaki TV kameralarından biri: grup 0 gönderilirse
            // iRacing o anki grupta kalır (grid turunun önden kamerası takılı kalıyordu)
            if let Some(g) = s.cam_groups.iter().find(|g| g.0 > 0 && g.1.to_lowercase().contains("mix")) {
                return g.clone();
            }
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
            // Bilinen TV grubu yok: araç içi / önden olmayan herhangi bir grup (yoksa ilk grup)
            let other = s
                .cam_groups
                .iter()
                .find(|g| g.0 > 0 && !has(ONBOARD_GROUPS, g) && !has(GRID_GROUPS, g))
                .or_else(|| s.cam_groups.iter().find(|g| g.0 > 0));
            return other.cloned().unwrap_or((0, String::new()));
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
        // Herkes gösterildi, yeşil henüz yok: TV Mixed, grid turu baştan başlamaz
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.last().unwrap().1, 20, "herkes gösterilince TV Mixed");
        assert_ne!(d.status.kind, "grid");
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_ne!(d.status.kind, "grid");
        // Yarıda yeşil: yeni bir grid turu (yarıda kalıp) yeşilde TV Mixed
        let mut d = Director::default();
        f.session_state = 2;
        for _ in 0..3 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
        }
        assert_eq!(d.status.kind, "grid");
        f.session_state = 4;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.last().unwrap().1, 20, "yeşil bayrakta TV Mixed");
        assert_ne!(d.status.kind, "grid");
    }

    #[test]
    fn finish_focus_follows_top_three() {
        let mut s = sess(8);
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), ..Default::default() }];
        let mut f = frame(8);
        f.session_state = 4;
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, finish_all: false, ..Default::default() };
        let mut out = Rec(vec![]);
        // Son tur (beyaz bayrak), lider çizgiye 5 sn uzakta
        f.session_flags = 0x2;
        f.cars[0].pct = 0.95;
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.status.kind, "finish");
        assert_eq!(d.cur.unwrap().idx, 0);
        // Lider geçti: damalı bayrak; 2. araç çizgiye yaklaşıyor
        f.session_state = 5;
        f.cars[0].pct = 0.01;
        f.cars[0].lap_completed += 1;
        f.cars[1].pct = 0.97;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.cur.unwrap().idx, 0, "lider çizgiyi geçerken 3 sn daha gösterilir");
        d.fin_hold = None;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.cur.unwrap().idx, 1);
        // 4. araç ilk 3'te değil: gösterilmez
        f.cars[1].lap_completed += 1;
        f.cars[1].pct = 0.01;
        f.cars[3].pct = 0.99;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.cur.unwrap().idx, 1, "2. çizgiyi geçerken gösterilir");
        d.fin_hold = None;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_ne!(d.status.kind, "finish", "3. henüz uzakta, 4. ilk 3'te değil");
        // Herkes bitirene kadar: 4. araç da gösterilir
        let cfg = Cfg { enabled: true, finish_all: true, ..Default::default() };
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.status.kind, "finish");
        assert_eq!(d.cur.unwrap().idx, 3);
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
        let miss: Vec<usize> = (0..20).filter(|i| !seen.contains(i)).collect();
        assert_eq!(seen.len(), 20, "zamanla bütün araçlar gösterilir {miss:?}");
    }

    #[test]
    fn grid_walk_skips_off_grid_and_restarts() {
        let mut s = sess(5);
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), ..Default::default() }];
        let mut f = frame(5);
        f.session_state = 1;
        f.cars[2].surface = -1; // garajda
        f.cars[2].pct = -1.0;
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        for _ in 0..4 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
        }
        let nums: Vec<String> = out.0.iter().map(|x| x.0.clone()).collect();
        assert_eq!(nums, vec!["10", "11", "13", "14"], "garajdaki atlanır");
        // Sonradan gride geldi: sırası gelince gösterilir
        f.cars[2].surface = 3;
        f.cars[2].pct = 0.84;
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.last().unwrap().0, "12");
        // Baştan başlat: ilk sıradaki; pitteki araç griddekilerden sonra
        f.cars[1].on_pit = true;
        d.restart_grid();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(out.0.last().unwrap().0, "10");
        let mut rest = vec![];
        for _ in 0..4 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
            rest.push(out.0.last().unwrap().0.clone());
        }
        assert_eq!(rest, vec!["12", "13", "14", "11"], "pitteki en sonda");
    }

    #[test]
    fn forced_grid_walk_stops_at_green() {
        let mut s = sess(6);
        s.cam_groups.push((20, "TV Mixed".into()));
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), ..Default::default() }];
        let mut f = frame(6);
        f.session_state = 3;
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        d.restart_grid();
        for _ in 0..2 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
        }
        assert_eq!(d.status.kind, "grid");
        f.session_state = 4;
        d.next();
        d.step(&f, &s, &cfg, true, &mut out);
        assert_ne!(d.status.kind, "grid", "yeşilde grid turu biter");
        assert_eq!(out.0.last().unwrap().1, 20, "TV Mixed");
    }

    #[test]
    fn after_grid_walk_not_sequential_again() {
        let mut s = sess(12);
        s.cam_groups.push((20, "TV Mixed".into()));
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), ..Default::default() }];
        let mut f = frame(12);
        f.session_state = 2;
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        for _ in 0..13 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
        }
        assert_ne!(d.status.kind, "grid");
        // Sonraki 6 çekim grid sırasının (10, 11, 12, …) tekrarı olmamalı
        let mut nums = vec![];
        for _ in 0..6 {
            d.next();
            d.step(&f, &s, &cfg, true, &mut out);
            nums.push(out.0.last().unwrap().0.clone());
        }
        let seq: Vec<String> = (0..6).map(|i| (10 + i).to_string()).collect();
        assert_ne!(nums, seq, "{nums:?}");
        assert!(out.0.iter().rev().take(6).filter(|x| x.1 == 20).count() >= 3, "çoğunlukla TV Mixed (ara sıra araç içi)");
    }

    #[test]
    fn leader_before_white_flag() {
        let mut s = sess(6);
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), laps: Some(10), ..Default::default() }];
        let mut f = frame(6);
        f.session_state = 4;
        for i in 0..6 {
            f.cars[i].lap = 9;
            f.cars[i].pct = 0.5;
        }
        f.cars[0].pct = 0.96;
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.status.kind, "finish", "beyaz bayraktan önce lider");
        assert_eq!(d.cur.unwrap().idx, 0);
    }

    #[test]
    fn fastest_lap_cuts_in() {
        let mut s = sess(6);
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), ..Default::default() }];
        let mut f = frame(6);
        f.session_state = 4;
        for i in 0..6 {
            f.cars[i].best = 95.0 + i as f32;
            f.cars[i].lap_completed = 5;
        }
        let mut d = Director::default();
        let cfg = Cfg { enabled: true, ..Default::default() };
        let mut out = Rec(vec![]);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_ne!(d.status.kind, "fastest", "ilk değer duyurulmaz");
        f.cars[4].best = 94.2;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_eq!(d.status.kind, "fastest");
        assert_eq!(d.cur.unwrap().idx, 4);
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
        // 7. araç hızlıyken pist dışına çıktı: kısa taşma sayılmaz, 0,7 sn dışarıda kalınca kaza
        let mut s = s;
        s.track_length_km = 5.0;
        f.session_time = 100.0;
        f.cars[7].pct_rate = 0.01; // 50 m/s
        d.step(&f, &s, &cfg, true, &mut out);
        f.session_time = 100.2;
        f.cars[7].surface = 0;
        d.last_step = Instant::now() - Duration::from_secs(1);
        d.step(&f, &s, &cfg, true, &mut out);
        assert_ne!(d.status.kind, "incident", "kısa taşma");
        f.session_time = 101.0;
        d.last_step = Instant::now() - Duration::from_secs(1);
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
