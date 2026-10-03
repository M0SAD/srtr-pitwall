//! iRacing açık değilken overlay'leri görmek ve geliştirmek için sentetik yarış üreticisi.
//! 24 araç, iki sınıf (GTP + GT3), 45 dakikalık yarışın 7. dakikasından başlar.
//! Rastgele olaylar üretir: kör nokta geçişleri, bayraklar, olay puanı, hava değişimi,
//! turdan tura değişen yakıt tüketimi ve yakıt azalınca pit stop. Harici bağımlılık yok.

use crate::model::{Driver, Frame, SessionData, SessionEntry, MAX_CARS};

const N_CARS: usize = 24;
const PLAYER: usize = 14;
const TRACK_KM: f32 = 5.79;
const START_T: f64 = 420.0;
const RACE_LEN: f64 = 2700.0;
const TANK: f32 = 110.0;

struct Rng(u64);
impl Rng {
    fn from_time() -> Rng {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Rng(seed | 1)
    }
    /// 0..1
    fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 40) as f32 / (1u64 << 24) as f32
    }
    fn range(&mut self, a: f32, b: f32) -> f32 {
        a + (b - a) * self.next()
    }
    fn chance(&mut self, p: f32) -> bool {
        self.next() < p
    }
}

struct Car {
    dist: f64, // toplam tur (lap + pct)
    base_lap: f32,
    lap_start_time: f64,
    last: f32,
    best: f32,
    pit_until: f64,
}

/// Yanımızdan geçen/bizi geçen sanal araç (kör nokta demosu).
struct SideCar {
    /// 0 = sol, 1 = sağ
    side: u8,
    /// Bize göre boyuna konum (m). + önde, - arkada
    offset: f32,
    /// Göreli hız (m/s). + bizi geçiyor, - biz onu geçiyoruz
    speed: f32,
}

pub struct Demo {
    rng: Rng,
    cars: Vec<Car>,
    t: f64,
    fuel: f32,
    /// Bu turdaki tüketim çarpanı (turdan tura değişir)
    lap_fuel_factor: f32,
    last_player_lap: i64,
    session: SessionData,
    side_cars: Vec<SideCar>,
    next_side_at: f64,
    flag: u32,
    flag_until: f64,
    next_flag_at: f64,
    air: f32,
    track: f32,
    next_weather_at: f64,
    incidents: i32,
    next_incident_at: f64,
    /// Kısa süreliğine pist dışına çıkan rakip (Olaylar ekranı önizlemesi için)
    off_idx: usize,
    off_until: f64,
    humidity: f32,
    precip: f32,
    wetness: i32,
    wind_dir: f32,
    wind_vel: f32,
    car_flag_idx: usize,
    car_flag: u32,
    car_flag_until: f64,
    shape: Vec<[f32; 2]>,
    /// Lastiklerin bu takımla attığı tur (pitte sıfırlanır)
    tire_age: f64,
    /// Demo hibrit: batarya doluluğu 0..1, bu turda harcanan enerji (MJ), mod ve modun seçildiği tur
    battery: f32,
    lap_deployed: f32,
    ers_mode: i32,
    ers_lap: i32,
    /// Lastik ısısı (yavaş yumuşatılmış yük)
    tire_heat: [f32; 4],
    /// Bu oturumda vitrin adları yerleştirildi mi (bir kez; sonra sabit kalır)
    showcased: bool,
}

const CARS: [&str; 7] = [
    "Cadillac V-Series.R",
    "Porsche 963",
    "BMW M Hybrid V8",
    "Porsche 911 GT3 R",
    "Ferrari 296 GT3",
    "Mercedes-AMG GT3",
    "Ford Mustang GT3",
];

const FLAIRS: [&str; 10] = ["DE", "IT", "JP", "GB", "ES", "SE", "TR", "US", "FR", "BR"];

const NAMES: [&str; N_CARS] = [
    "Max Brenner", "Luca Rossi", "Kenji Sato", "Oliver Hart", "Mateo Silva", "Jonas Berg",
    "Liam Novak", "Ethan Cole", "Noah Fischer", "Arda Yılmaz", "Emre Kaya", "Tom Walsh",
    "Pierre Blanc", "Sam Porter", "Sen (Demo)", "Ivan Petrov", "Diego Ruiz", "Finn Larsen",
    "Hugo Martin", "Leo Costa", "Kai Weber", "Omar Haddad", "Ben Clarke", "Marco Bianchi",
];

/// Vitrin üyesinin ülkesi bilinmiyorsa seçilecek makul ülkeler (flag-icons kodları)
const SHOWCASE_FLAIRS: [&str; 24] = [
    "TR", "DE", "GB", "US", "IT", "ES", "FR", "NL", "BR", "PT", "SE", "FI", "PL", "BE", "AT", "CA", "AU", "JP", "DK", "NO",
    "CH", "CZ", "AR", "MX",
];

/// Ada bağlı sabit sayı (FNV-1a): bilinmeyen değerler her demo oturumunda aynı çıkar
fn name_hash(name: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in name.to_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h ^ (h >> 29)
}

/// Demo vitrini sürücüsü: PRO üyenin görünen adı ve (üye izin verdiyse, biliniyorsa) gerçek iRacing bilgileri.
/// Bilinmeyen (`None`) ülke / iRating / lisans için demo, ada bağlı makul bir rastgele değer üretir
/// (satırda boş hücre kalmaz).
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(default)]
pub struct ShowcaseDriver {
    pub name: String,
    pub country: Option<String>,
    pub irating: Option<i32>,
    pub license: Option<String>,
    pub lic_color: Option<String>,
}

/// iRacing lisans harfinden sınıf rengi (renk gelmediyse)
fn lic_color_for(license: &str) -> &'static str {
    match license.chars().next().map(|c| c.to_ascii_uppercase()) {
        Some('R') => "#fc0706",
        Some('D') => "#ff8c00",
        Some('C') => "#fec600",
        Some('B') => "#00c702",
        Some('A') => "#0153db",
        _ => "#000000",
    }
}

fn is_hex_color(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|x| x.is_ascii_hexdigit())
}

/// "A 3.42" biçimi: 1–6 harf, boşluk, sayı
fn is_license(l: &str) -> bool {
    let mut it = l.splitn(2, ' ');
    let (Some(cls), Some(sr)) = (it.next(), it.next()) else { return false };
    (1..=6).contains(&cls.len())
        && cls.chars().all(|c| c.is_ascii_alphabetic() || c == '/')
        && sr.len() <= 5
        && sr.parse::<f32>().map(|v| (0.0..100.0).contains(&v)).unwrap_or(false)
}

/// Demo vitrini: panelin buluttan aldığı PRO üyeler (`demo_set_drivers`; eski sunucuda sadece adlar,
/// `demo_set_names`). Her demo oturumu başında bunlardan rastgele birkaçı sahte sürücülerin yerine geçer;
/// oturum boyunca değişmez.
static SHOWCASE: std::sync::Mutex<Vec<ShowcaseDriver>> = std::sync::Mutex::new(Vec::new());

/// Vitrin sürücülerini ayarla (temizlenir: boşluklar kırpılır, boş/uzun/tekrarlı adlar atılır, geçersiz
/// ülke / iRating / lisans değerleri boş sayılır; en fazla 100)
pub fn set_showcase_drivers(list: Vec<ShowcaseDriver>) -> usize {
    let mut out: Vec<ShowcaseDriver> = Vec::new();
    for d in list {
        let n: String = d.name.split_whitespace().collect::<Vec<_>>().join(" ");
        let len = n.chars().count();
        if !(2..=32).contains(&len) || out.iter().any(|x| x.name.eq_ignore_ascii_case(&n)) || NAMES.contains(&n.as_str()) {
            continue;
        }
        let country = d
            .country
            .map(|c| c.trim().to_ascii_uppercase())
            .filter(|c| (2..=8).contains(&c.len()) && c.chars().all(|x| x.is_ascii_alphanumeric() || x == '-'))
            // "Bayrak yok" anlamındaki iRacing değerleri (ör. "--") ülke sayılmaz
            .filter(|c| c.chars().any(|x| x.is_ascii_alphabetic()));
        let irating = d.irating.filter(|v| (1..=20000).contains(v));
        let license = d
            .license
            .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|l| is_license(l));
        let lic_color = match &license {
            Some(l) => Some(
                d.lic_color
                    .map(|c| c.trim().to_ascii_lowercase())
                    .filter(|c| is_hex_color(c))
                    .unwrap_or_else(|| lic_color_for(l).to_string()),
            ),
            None => None,
        };
        out.push(ShowcaseDriver { name: n, country, irating, license, lic_color });
        if out.len() >= 100 {
            break;
        }
    }
    let k = out.len();
    if let Ok(mut g) = SHOWCASE.lock() {
        *g = out;
    }
    k
}

/// Sadece adlar (eski sunucu: demo_pro_names). Bayrak / iR / SR bilinmez.
pub fn set_showcase_names(names: Vec<String>) -> usize {
    set_showcase_drivers(names.into_iter().map(|name| ShowcaseDriver { name, ..Default::default() }).collect())
}

fn showcase_drivers() -> Vec<ShowcaseDriver> {
    SHOWCASE.lock().map(|g| g.clone()).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Oyuncunun KENDİ iRacing bilgileri (iRating, lisans, ülke): iRacing oturum bilgisinden alınır, panel
// `player_iracing` komutuyla okur ve giriş yapmış üyenin profiline yazar (demo vitrini ve profil kartı).
// Sadece oyuncunun kendisi: takım yarışında araçta takım arkadaşı varsa (UserID != DriverUserID) alınmaz.
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerIracing {
    pub cust_id: i64,
    pub irating: i32,
    pub license: String,
    pub lic_color: String,
    pub country: String,
    pub category: String,
}

static PLAYER_IR: std::sync::Mutex<Option<PlayerIracing>> = std::sync::Mutex::new(None);

/// Oturum bilgisinden oyuncunun kendi değerleri (yoksa / emin değilsek None)
#[cfg_attr(not(windows), allow(dead_code))]
pub fn player_iracing_from(sim: &str, sd: &SessionData) -> Option<PlayerIracing> {
    if sim != "iracing" || sd.player_idx < 0 || sd.player_user_id <= 0 {
        return None;
    }
    let d = sd.driver(sd.player_idx as usize)?;
    if d.is_ai || d.is_pace_car || d.user_id != sd.player_user_id || d.irating < 1 || !is_license(&d.license) {
        return None;
    }
    Some(PlayerIracing {
        cust_id: d.user_id,
        irating: d.irating,
        license: d.license.clone(),
        lic_color: if is_hex_color(&d.lic_color) { d.lic_color.to_ascii_lowercase() } else { String::new() },
        country: d.flair.trim().to_ascii_uppercase(),
        category: sd.category.chars().filter(|c| c.is_ascii_alphabetic()).collect::<String>().to_ascii_lowercase(),
    })
}

/// Motor: yeni iRacing oturum bilgisi geldi. Emin olunamayan oturumda (takım arkadaşı sürüyor vb.) son bilinen
/// değer aynı hesaba aitse korunur.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn note_player(sim: &str, sd: &SessionData) {
    let cur = player_iracing_from(sim, sd);
    if let Ok(mut g) = PLAYER_IR.lock() {
        match cur {
            Some(p) => *g = Some(p),
            None => {
                if sim != "iracing" || g.as_ref().map(|p| p.cust_id != sd.player_user_id).unwrap_or(false) {
                    *g = None;
                }
            }
        }
    }
}

pub fn player_iracing() -> Option<PlayerIracing> {
    PLAYER_IR.lock().ok().and_then(|g| g.clone())
}

// SessionFlags bitleri
const F_WHITE: u32 = 0x0002;
const F_GREEN: u32 = 0x0004;
const F_YELLOW: u32 = 0x0008;
const F_BLUE: u32 = 0x0020;
const F_DEBRIS: u32 = 0x0040;
const F_CAUTION: u32 = 0x4000;
const F_BLACK: u32 = 0x0001_0000;
const F_REPAIR: u32 = 0x0010_0000;
const F_CHECKERED: u32 = 0x0001;

impl Demo {
    pub fn new() -> Demo {
        let mut rng = Rng::from_time();
        let mut cars = Vec::new();
        let mut drivers: Vec<Option<Driver>> = vec![None; MAX_CARS];
        for i in 0..N_CARS {
            let gtp = i < 8;
            let base = if gtp { 98.0 } else { 107.5 } + rng.next() * 2.2;
            // Yarış 7. dakikada: lider ~4. turda, araçlar arasında farklar var
            let laps_done = START_T / base as f64;
            let dist = laps_done - (i % 8) as f64 * 0.018 - rng.next() as f64 * 0.01;
            let pct = dist.rem_euclid(1.0);
            let last = base + rng.range(-0.3, 0.9);
            cars.push(Car {
                dist,
                base_lap: base,
                lap_start_time: START_T - pct * base as f64,
                last,
                best: last - rng.range(0.0, 0.6),
                pit_until: 0.0,
            });
            let lic = ["A", "B", "C", "Pro"][(i * 7) % 4];
            drivers[i] = Some(Driver {
                car_idx: i as i32,
                user_id: 100_000 + i as i64 * 7919,
                name: NAMES[i].to_string(),
                abbrev: NAMES[i].to_string(),
                car_number: format!("{}", 3 + i * 4 % 97),
                class_id: if gtp { 1 } else { 2 },
                class_name: if gtp { "GTP".into() } else { "GT3".into() },
                class_color: if gtp { "#ffda59".into() } else { "#33ceff".into() },
                class_est_lap: if gtp { 99.0 } else { 108.5 },
                irating: 1200 + ((i * 1733) % 4200) as i32,
                license: format!("{} {:.2}", lic, 1.5 + (i as f32 * 0.37) % 3.4),
                lic_color: match lic {
                    "A" => "#0153db".into(),
                    "B" => "#00c702".into(),
                    "C" => "#fec600".into(),
                    _ => "#000000".into(),
                },
                car_name: CARS[if gtp { i % 3 } else { 3 + i % 4 }].to_string(),
                car_path: if gtp { "gtp".into() } else { "gt3".into() },
                car_id: i as i32,
                flair: FLAIRS[i % FLAIRS.len()].into(),
                team_name: String::new(),
                is_spectator: false,
                is_pace_car: false,
                ..Default::default()
            });
        }
        let session = SessionData {
            track_name: "Demo Pist".into(),
            track_config: "Grand Prix".into(),
            track_length_km: TRACK_KM,
            pit_limit_kph: 60.0,
            player_idx: PLAYER as i32,
            fuel_max_ltr: TANK,
            max_fuel_pct: 1.0,
            shift_rpm: 8600.0,
            redline: 9000.0,
            est_lap_time: 108.5,
            sl_first: 7400.0,
            sl_last: 8600.0,
            sl_blink: 8900.0,
            incident_limit: 25,
            league_id: 0,
            track_id: 9999,
            series_id: 0,
            category: "Road".into(),
            drivers,
            sessions: vec![SessionEntry { num: 0, kind: "Race".into(), laps: None, time: Some(RACE_LEN) }],
            tire_types: Vec::new(),
            ai_session: false,
            player_user_id: 0,
            sim_mode: String::new(),
            sector_starts: vec![0.0, 0.29, 0.67],
        };
        let player_lap = cars[PLAYER].dist.floor() as i64;
        let air = rng.range(20.0, 27.0);
        let track = air + rng.range(8.0, 14.0);
        let mut d = Demo {
            cars,
            t: START_T,
            fuel: rng.range(38.0, 48.0),
            lap_fuel_factor: 1.0,
            last_player_lap: player_lap,
            session,
            side_cars: Vec::new(),
            next_side_at: START_T + rng.range(2.0, 5.0) as f64,
            flag: 0,
            flag_until: 0.0,
            next_flag_at: START_T + rng.range(4.0, 8.0) as f64,
            air,
            track,
            next_weather_at: START_T + 15.0,
            incidents: 0,
            off_idx: usize::MAX,
            off_until: 0.0,
            next_incident_at: START_T + rng.range(15.0, 60.0) as f64,
            humidity: rng.range(0.45, 0.75),
            precip: rng.range(0.0, 0.3),
            wetness: 1,
            wind_dir: rng.range(0.0, std::f32::consts::TAU),
            wind_vel: rng.range(1.5, 7.0),
            car_flag_idx: 0,
            car_flag: 0,
            car_flag_until: 0.0,
            shape: crate::trackmap::demo_shape(),
            tire_age: 3.4,
            battery: 0.62,
            lap_deployed: 0.0,
            ers_mode: 2,
            ers_lap: -1,
            tire_heat: [0.8; 4],
            showcased: false,
            rng,
        };
        d.apply_showcase();
        d
    }

    /// Vitrin adları henüz yerleştirilmediyse ve artık varsa yerleştirir. Adlar değiştiyse true
    /// (çağıran oturum verisini yeniden yayınlamalı). Bir oturumda en fazla bir kez çalışır.
    pub fn apply_showcase(&mut self) -> bool {
        if self.showcased {
            return false;
        }
        let mut names = showcase_drivers();
        if names.is_empty() {
            return false;
        }
        self.showcased = true;
        // Karıştır (Fisher-Yates)
        for i in (1..names.len()).rev() {
            let j = ((self.rng.next() * (i + 1) as f32) as usize).min(i);
            names.swap(i, j);
        }
        let mut slots: Vec<usize> = (0..N_CARS).filter(|&i| i != PLAYER).collect();
        for i in (1..slots.len()).rev() {
            let j = ((self.rng.next() * (i + 1) as f32) as usize).min(i);
            slots.swap(i, j);
        }
        // Sahte adlarla karışık: araçların yaklaşık üçte biri (6–10 araç)
        let want = 6 + (self.rng.next() * 5.0) as usize;
        let k = want.min(names.len()).min(slots.len());
        for (slot, m) in slots.into_iter().zip(names.into_iter()).take(k) {
            if let Some(Some(d)) = self.session.drivers.get_mut(slot) {
                d.name = m.name.clone();
                d.abbrev = m.name;
                // Gerçek üye: biliniyorsa kendi ülkesi / iRating'i / lisansı. Bilinmeyen değer boş bırakılmaz:
                // ada bağlı (her oturumda aynı) makul bir rastgele değer üretilir, satırda boş hücre kalmaz.
                let h = name_hash(&d.name);
                d.flair = m.country.unwrap_or_else(|| SHOWCASE_FLAIRS[(h % SHOWCASE_FLAIRS.len() as u64) as usize].to_string());
                d.irating = m.irating.unwrap_or(1350 + ((h >> 8) % 3900) as i32);
                let lic = m.license.unwrap_or_else(|| {
                    let cls = ["D", "C", "C", "B", "B", "A", "A"][((h >> 24) % 7) as usize];
                    format!("{} {:.2}", cls, 1.6 + ((h >> 32) % 330) as f32 / 100.0)
                });
                d.lic_color = m.lic_color.unwrap_or_else(|| lic_color_for(&lic).to_string());
                d.license = lic;
            }
        }
        k > 0
    }

    pub fn session(&self) -> &SessionData {
        &self.session
    }

    /// Yakıt hesaplayıcının hemen dolu görünmesi için son turların tüketimi ve süreleri.
    pub fn seed_history(&mut self) -> (Vec<f32>, Vec<f32>, f64) {
        let base = self.cars[PLAYER].base_lap;
        let fuel: Vec<f32> = (0..8).map(|_| 2.85 * self.rng.range(0.96, 1.05)).collect();
        let laps: Vec<f32> = (0..8).map(|_| base + self.rng.range(-0.2, 0.9)).collect();
        (fuel, laps, START_T - 180.0)
    }

    pub fn track_shape(&self) -> Vec<[f32; 2]> {
        self.shape.clone()
    }

    /// Demo pistinde verilen noktadaki yön (rad, kuzeye göre)
    fn heading_at(&self, pct: f32) -> f32 {
        let n = self.shape.len();
        let i = ((pct * n as f32) as usize).min(n - 1);
        let a = self.shape[i];
        let b = self.shape[(i + 2) % n];
        (b[0] - a[0]).atan2(b[1] - a[1])
    }

    /// Pist boyunca hız profili: 4 fren bölgesi.
    fn speed_factor(pct: f32) -> (f32, f32, f32) {
        // (hız çarpanı, gaz, fren)
        const CORNERS: [f32; 4] = [0.12, 0.37, 0.61, 0.86];
        let mut thr = 1.0f32;
        let mut brk = 0.0f32;
        let mut spd = 1.0f32;
        for c in CORNERS {
            let d = pct - c;
            if (-0.03..0.0).contains(&d) {
                let k = (d + 0.03) / 0.03;
                brk = brk.max((1.0 - (k - 0.3).abs() * 1.2).clamp(0.0, 1.0));
                thr = 0.0;
                spd = spd.min(1.0 - 0.45 * k);
            } else if (0.0..0.035).contains(&d) {
                let k = d / 0.035;
                thr = thr.min(0.25 + k * 0.75);
                spd = spd.min(0.55 + 0.45 * k);
            }
        }
        (spd, thr, brk)
    }

    /// Rastgele bayrak, hava ve olay puanı olayları.
    fn events(&mut self) {
        let t = self.t;
        // Bayraklar: birkaç saniyede bir, birkaç saniye görünür
        if self.flag != 0 && t >= self.flag_until {
            self.flag = 0;
        }
        if t >= self.next_flag_at {
            let r = self.rng.next();
            self.flag = if r < 0.28 {
                F_YELLOW
            } else if r < 0.52 {
                F_BLUE
            } else if r < 0.64 {
                F_DEBRIS
            } else if r < 0.76 {
                F_CAUTION
            } else if r < 0.84 {
                F_WHITE
            } else if r < 0.92 {
                F_REPAIR
            } else {
                F_BLACK
            };
            self.flag_until = t + self.rng.range(3.0, 6.0) as f64;
            self.next_flag_at = self.flag_until + self.rng.range(5.0, 14.0) as f64;
        }
        // Sıcaklıklar: 15 sn'de bir çok az değişir
        if t >= self.next_weather_at {
            self.air = (self.air + self.rng.range(-0.3, 0.3)).clamp(15.0, 32.0);
            self.track = (self.track + self.rng.range(-0.4, 0.6)).clamp(self.air + 4.0, 50.0);
            self.humidity = (self.humidity + self.rng.range(-0.02, 0.02)).clamp(0.2, 0.98);
            self.precip = (self.precip + self.rng.range(-0.05, 0.06)).clamp(0.0, 1.0);
            self.wind_dir = (self.wind_dir + self.rng.range(-0.15, 0.15)).rem_euclid(std::f32::consts::TAU);
            self.wind_vel = (self.wind_vel + self.rng.range(-0.4, 0.4)).clamp(0.0, 12.0);
            // Yağış arttıkça pist ıslanır, azalınca kurur
            let target = if self.precip > 0.7 { 5 } else if self.precip > 0.5 { 3 } else { 1 };
            if self.wetness < target {
                self.wetness += 1;
            } else if self.wetness > target {
                self.wetness -= 1;
            }
            self.next_weather_at = t + 15.0;
        }
        // Ara sıra bir rakibe mavi/siyah/hasar bayrağı
        if t >= self.car_flag_until + 20.0 && self.rng.chance(0.002) {
            self.car_flag_idx = (self.rng.next() * N_CARS as f32) as usize % N_CARS;
            if self.car_flag_idx == PLAYER {
                self.car_flag_idx = (self.car_flag_idx + 1) % N_CARS;
            }
            let r = self.rng.next();
            self.car_flag = if r < 0.5 { 0x0020 } else if r < 0.8 { 0x0010_0000 } else { 0x0001_0000 };
            self.car_flag_until = t + self.rng.range(6.0, 12.0) as f64;
        }
        // Ara sıra bir rakip pist dışına çıkar (yaklaşık dakikada bir, 2 – 4 sn)
        if t >= self.off_until + 25.0 && self.rng.chance(0.0005) {
            let i = (self.rng.next() * N_CARS as f32) as usize % N_CARS;
            self.off_idx = if i == PLAYER { (i + 1) % N_CARS } else { i };
            self.off_until = t + self.rng.range(2.0, 4.0) as f64;
        }
        // Olay puanı: 1 – 4 dk arası rastgele (temiz turlar da olsun); iRacing'deki gibi 1x/2x/4x
        if t >= self.next_incident_at {
            let r = self.rng.next();
            self.incidents += if r < 0.6 { 1 } else if r < 0.9 { 2 } else { 4 };
            self.next_incident_at = t + self.rng.range(60.0, 240.0) as f64;
        }
    }

    /// Kör nokta: rastgele sol/sağ/iki yandan, farklı göreli hızlarda geçişler.
    fn side_traffic(&mut self, dt: f32) -> (i32, Vec<(i8, f32)>) {
        let t = self.t;
        if t >= self.next_side_at && self.side_cars.len() < 2 {
            let both = self.rng.chance(0.2);
            let first_side = if self.rng.chance(0.5) { 0 } else { 1 };
            let sides: Vec<u8> = if both { vec![0, 1] } else { vec![first_side] };
            for side in sides {
                let overtaking_us = self.rng.chance(0.5);
                let speed = self.rng.range(1.2, 6.5);
                self.side_cars.push(SideCar {
                    side,
                    offset: if overtaking_us { -14.0 } else { 14.0 } + self.rng.range(-2.0, 2.0),
                    speed: if overtaking_us { speed } else { -speed },
                });
            }
            self.next_side_at = t + self.rng.range(4.0, 11.0) as f64;
        }
        for c in &mut self.side_cars {
            c.offset += c.speed * dt;
        }
        self.side_cars.retain(|c| c.offset.abs() <= 16.0 || c.offset.signum() != c.speed.signum());

        const BESIDE: f32 = 4.8; // araç boyu kadar yan yana
        let left = self.side_cars.iter().filter(|c| c.side == 0 && c.offset.abs() < BESIDE).count();
        let right = self.side_cars.iter().filter(|c| c.side == 1 && c.offset.abs() < BESIDE).count();
        let state = match (left, right) {
            (0, 0) => 1,
            (1, 0) => 2,
            (0, 1) => 3,
            (l, 0) if l > 1 => 5,
            (0, r) if r > 1 => 6,
            _ => 4,
        };
        let list = self
            .side_cars
            .iter()
            .map(|c| (if c.side == 0 { -1i8 } else { 1i8 }, c.offset))
            .collect();
        (state, list)
    }

    pub fn step(&mut self, dt: f64, f: &mut Frame) {
        self.t += dt;
        let t = self.t;
        self.events();

        for (i, c) in self.cars.iter_mut().enumerate() {
            let pct = c.dist.rem_euclid(1.0) as f32;
            let (sf, _, _) = Demo::speed_factor(pct);
            let pace = if i == PLAYER { 1.0 } else { 1.0 + ((t * 0.05 + i as f64).sin() as f32) * 0.004 };
            let in_pit = t < c.pit_until;
            let v = if in_pit { 0.0 } else { dt / (c.base_lap as f64 * pace as f64) * (0.55 + 0.6 * sf as f64) };
            let before = c.dist.floor();
            c.dist += v;
            if c.dist.floor() > before && c.dist >= 1.0 {
                let lt = (t - c.lap_start_time) as f32;
                c.last = lt;
                if c.best < 0.0 || lt < c.best {
                    c.best = lt;
                }
                c.lap_start_time = t;
                // Ara sıra pit stop (oyuncu hariç; oyuncu yakıt azalınca girer)
                if i != PLAYER && (c.dist as i32) % 11 == (i as i32 % 5) + 4 {
                    c.pit_until = t + 22.0;
                }
            }
        }

        // Oyuncu tur atladı: yeni tur için tüketim çarpanı, yakıt azsa pit
        let player_lap = self.cars[PLAYER].dist.floor() as i64;
        if player_lap != self.last_player_lap {
            self.last_player_lap = player_lap;
            self.lap_fuel_factor = self.rng.range(0.94, 1.07);
            if self.fuel < 2.9 * 1.6 {
                self.cars[PLAYER].pit_until = t + 26.0;
            }
        }
        let player_in_pit = t < self.cars[PLAYER].pit_until;
        if player_in_pit {
            // Pitte yakıt dolumu (~4 L/sn)
            self.fuel = (self.fuel + 4.0 * dt as f32).min(TANK * 0.8);
        }

        // Pozisyonlar
        let mut order: Vec<usize> = (0..N_CARS).collect();
        order.sort_by(|&a, &b| self.cars[b].dist.partial_cmp(&self.cars[a].dist).unwrap());
        let leader = self.cars[order[0]].dist;
        let mut class_counter = [0i32; 3];

        *f = Frame::default();
        f.tick = (t * 60.0) as i32;
        f.session_time = t;
        f.session_time_remain = (RACE_LEN - t).max(0.0);
        f.session_laps_remain = 32767;
        f.session_num = 0;
        f.session_state = if t < RACE_LEN { 4 } else { 5 };
        f.player_idx = PLAYER as i32;

        for (p, &i) in order.iter().enumerate() {
            let c = &self.cars[i];
            let cls = if i < 8 { 1 } else { 2 };
            class_counter[cls] += 1;
            let lap_t = c.base_lap;
            let cs = &mut f.cars[i];
            // Izgarada (çizgiden önce) tur 0 sayılır, iRacing'deki gibi.
            cs.lap = c.dist.floor() as i32 + 1;
            cs.lap_completed = (c.dist.floor() as i32).max(0);
            cs.pct = c.dist.rem_euclid(1.0) as f32;
            cs.position = p as i32 + 1;
            cs.class_position = class_counter[cls];
            cs.on_pit = t < c.pit_until;
            cs.est_time = cs.pct * lap_t;
            cs.last = c.last;
            cs.best = c.best;
            cs.surface = if cs.on_pit {
                1
            } else if i == self.off_idx && t < self.off_until {
                0
            } else {
                3
            };
            cs.f2 = ((leader - c.dist) * 104.0) as f32;
        }

        // Oyuncu arabası
        let me = &self.cars[PLAYER];
        let pct = me.dist.rem_euclid(1.0) as f32;
        let (sf, thr, brk) = if player_in_pit { (0.0, 0.0, 0.0) } else { Demo::speed_factor(pct) };
        let noise = self.rng.next() * 0.03;
        f.throttle = (thr - noise).clamp(0.0, 1.0);
        f.brake = brk;
        f.clutch = 0.0;
        f.abs_active = brk > 0.85;
        f.speed = if player_in_pit { 0.0 } else { (55.0 + 22.0 * sf) * (0.6 + 0.4 * sf) }; // m/s
        f.gear = if player_in_pit { 1 } else { (1.0 + (f.speed / 76.0 * 5.0)).clamp(1.0, 6.0) as i32 };
        let gear_lo = (f.gear - 1) as f32 * 76.0 / 5.0;
        f.rpm = 4200.0 + ((f.speed - gear_lo) / (76.0 / 5.0)).clamp(0.0, 1.0) * 4600.0;
        f.steer = ((pct * std::f32::consts::TAU * 4.0).sin()) * 0.9 * (1.0 - sf * 0.8);
        // Demo ivmeleri (g): gaz/fren ve direksiyondan türetilir, önceki kareyle yumuşatılır
        {
            let k = (dt as f32 * 7.0).min(1.0);
            let v = (f.speed / 76.0).clamp(0.0, 1.0);
            let long_t = if player_in_pit { 0.0 } else { f.throttle * (1.15 - 0.75 * v) - brk * (1.6 + 1.3 * v) };
            let lat_t = if player_in_pit { 0.0 } else { (-f.steer / 0.9 * 3.4 * (0.35 + 0.65 * v)).clamp(-2.9, 2.9) };
            let jit = (self.rng.next() - 0.5) * 0.08;
            f.long_g += (long_t + jit - f.long_g) * k;
            f.lat_g += (lat_t - jit - f.lat_g) * k;
        }
        // Demo: düşük viteste tam gazda çekiş kontrolü devreye girer
        f.tc_active = !player_in_pit && f.throttle > 0.9 && f.gear <= 2;
        f.lap = me.dist.floor() as i32 + 1;
        f.lap_completed = (me.dist.floor() as i32).max(0);
        f.lap_dist_pct = pct;
        f.lap_cur = (t - me.lap_start_time) as f32;
        f.lap_last = me.last;
        f.lap_best = me.best;
        f.delta_best = ((t * 0.4).sin() as f32) * 0.35 + (pct - 0.5) * 0.2;
        f.delta_best_ok = me.best > 0.0;
        f.delta_session = f.delta_best + 0.42;
        f.delta_session_ok = f.delta_best_ok;
        f.delta_optimal = f.delta_best + 0.61;
        f.delta_optimal_ok = f.delta_best_ok;

        // Yakıt: tur başına ~2.85 L, gaza ve turdan tura değişen çarpana bağlı
        if !player_in_pit {
            let use_rate = (2.85 / me.base_lap) * self.lap_fuel_factor * (0.35 + 0.8 * f.throttle) * 1.095;
            self.fuel = (self.fuel - dt as f32 * use_rate).max(0.0);
        }
        f.fuel_level = self.fuel;
        f.fuel_pct = self.fuel / TANK;

        // Hibrit: 4 MJ batarya, turda en çok 4 MJ harcama. Frende geri kazanım, tam gazda harcama;
        // mod her tur batarya seviyesine göre değişir, böylece doluluk inip çıkar.
        {
            const CAP_MJ: f32 = 4.0;
            const LAP_LIMIT_MJ: f32 = 4.0;
            if f.lap != self.ers_lap {
                self.ers_lap = f.lap;
                self.lap_deployed = 0.0;
                self.ers_mode = if self.battery > 0.72 {
                    3
                } else if self.battery < 0.3 {
                    0
                } else {
                    1 + (f.lap.rem_euclid(2))
                };
            }
            let factor = [0.35f32, 0.65, 0.95, 1.25][self.ers_mode.clamp(0, 3) as usize];
            let mut k_kw = 0.0f32;
            let mut h_kw = 0.0f32;
            if !player_in_pit {
                if brk > 0.05 {
                    k_kw = -(60.0 + 110.0 * brk);
                } else if f.throttle > 0.85 && self.lap_deployed < LAP_LIMIT_MJ && self.battery > 0.01 {
                    k_kw = 62.0 * factor;
                }
                if f.throttle > 0.5 {
                    h_kw = 10.0 + 12.0 * f.throttle;
                }
                if self.battery >= 1.0 && k_kw < 0.0 {
                    k_kw = 0.0;
                }
            }
            let d_mj = dt as f32 * k_kw / 1000.0;
            if d_mj > 0.0 {
                self.lap_deployed += d_mj;
            }
            self.battery = (self.battery - (d_mj - dt as f32 * h_kw / 1000.0) / CAP_MJ).clamp(0.0, 1.0);
            f.hybrid = crate::model::Hybrid {
                has: true,
                battery_pct: self.battery,
                battery_j: self.battery * CAP_MJ * 1.0e6,
                lap_deploy_left: (1.0 - self.lap_deployed / LAP_LIMIT_MJ).clamp(0.0, 1.0),
                mguk_kw: k_kw,
                mguk_ok: true,
                mguh_kw: h_kw,
                mguh_ok: true,
                mode: self.ers_mode,
                regen_gain: 6.0,
                p2p_count: -1,
                p2p_active: false,
                drs: if player_in_pit { 0 } else if f.throttle > 0.95 && sf > 0.9 { 3 } else if sf > 0.75 { 1 } else { 0 },
                mode_set: 1,
            };
        }

        // Kör nokta
        let (state, side_list) = self.side_traffic(dt as f32);
        f.car_left_right = if player_in_pit { 1 } else { state };
        f.demo_side_cars = Some(if player_in_pit { Vec::new() } else { side_list });

        f.on_pit_road = player_in_pit;
        f.is_on_track = true;
        f.air_temp = self.air;
        f.track_temp = self.track;
        f.incidents = self.incidents;
        f.track_wetness = self.wetness;
        f.humidity = self.humidity;
        f.precip = self.precip;
        f.wind_dir = self.wind_dir;
        f.wind_vel = self.wind_vel;
        // Pist boyunca yön: demo pistinin teğeti (pusula ve mini harita için)
        f.yaw_north = self.heading_at(pct);
        // Hasar göstergesi: döngüsel örnek hasar (bkz. drivecues.rs)
        f.damage = crate::drivecues::demo_damage(t);
        f.vel_x = f.speed;
        f.shift_pct = 0.0;
        for i in 0..N_CARS {
            // Karışık lastikler: pist ıslaksa herkes yağmur lastiğinde; değilse birkaç araç
            // yağmur/ara lastiğinde, diğerleri yumuşak/orta/sert
            let wet = self.wetness >= 4 || i % 5 == 2;
            f.cars[i].tire = if wet { 1 } else { 0 };
            f.cars[i].tire_kind = if wet {
                if i % 10 == 7 { b'I' } else { b'W' }
            } else {
                [b'S', b'M', b'H'][i % 3]
            };
            f.cars[i].flags = if i == self.car_flag_idx && t < self.car_flag_until { self.car_flag } else { 0 };
        }
        self.tires(dt, player_in_pit, sf, brk, f);
        f.brake_bias = 54.5;
        f.tc = 4.0;
        f.abs_setting = 6.0;
        f.oil_temp = 94.0 + f.speed * 0.06;
        f.water_temp = 82.0 + f.speed * 0.04;
        f.session_flags = if t >= RACE_LEN { F_CHECKERED } else { F_GREEN | self.flag };
    }

    /// Demo lastikleri: aşınma turla artar, sıcaklık yüke göre değişir, pitte yeni takım.
    fn tires(&mut self, dt: f64, in_pit: bool, sf: f32, brk: f32, f: &mut Frame) {
        if in_pit {
            self.tire_age = 0.0;
            self.tire_heat = [0.35; 4];
        } else {
            self.tire_age += dt / self.cars[PLAYER].base_lap as f64;
        }
        // Saat yönünde pist: sol taraf daha çok çalışır; ön lastikler frende ısınır
        let load = [1.0 + brk * 0.5, 0.9 + brk * 0.45, 0.95, 0.85];
        let k = (dt as f32 * 0.25).min(1.0);
        for (i, h) in self.tire_heat.iter_mut().enumerate() {
            let target = if in_pit { 0.35 } else { (0.55 + 0.35 * (1.0 - sf) + 0.15 * sf) * load[i] };
            *h += (target - *h) * k;
        }
        let wear_rate = [0.0125, 0.0105, 0.0095, 0.0085];
        let track = self.track;
        for i in 0..4 {
            let base = track + 35.0 + self.tire_heat[i] * 30.0;
            // iç/orta/dış: kamber yüzünden iç kenar daha sıcak
            let (inner, outer) = if i % 2 == 0 { (2, 0) } else { (0, 2) };
            let mut t3 = [base; 3];
            t3[inner] = base + 6.0;
            t3[1] = base + 2.5;
            t3[outer] = base - 3.0;
            f.tire_temp[i] = t3;
            let w = (1.0 - self.tire_age as f32 * wear_rate[i]).clamp(0.0, 1.0);
            let mut w3 = [w; 3];
            w3[inner] = (w - 0.012).max(0.0);
            w3[outer] = (w + 0.006).min(1.0);
            f.tire_wear[i] = w3;
            f.tire_press[i] = if i < 2 { 172.0 } else { 165.0 };
        }
        f.tire_compound = if self.wetness >= 4 { 1 } else { 0 };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn showcase_names_mixed_in() {
        let n = set_showcase_names(vec![
            "  Ayşe   Demir ".into(),
            "ayşe demir".into(),
            "A".into(),
            "Max Brenner".into(),
            "Can Öztürk".into(),
            "Zoe Lane".into(),
        ]);
        assert_eq!(n, 3);
        let d = Demo::new();
        let names: Vec<String> = d.session.drivers.iter().flatten().map(|x| x.name.clone()).collect();
        assert_eq!(names.len(), N_CARS);
        assert!(names.iter().any(|x| x == "Ayşe Demir"));
        assert_eq!(names[PLAYER], "Sen (Demo)");
        // Fake adlar hâlâ çoğunlukta
        assert!(names.iter().filter(|x| NAMES.contains(&x.as_str())).count() >= N_CARS - 10);
        set_showcase_names(Vec::new());

        // Gerçek bilgiler: bayrak / iRating / lisans üyeninki; bilgisi olmayan üyede rastgele (boş değil)
        let n = set_showcase_drivers(vec![
            ShowcaseDriver {
                name: "Ayşe Demir".into(),
                country: Some("tr".into()),
                irating: Some(3210),
                license: Some("A  3.42".into()),
                lic_color: None,
            },
            ShowcaseDriver { name: "Zoe Lane".into(), country: Some("??".into()), irating: Some(0), license: Some("x".into()), lic_color: None },
        ]);
        assert_eq!(n, 2);
        let d = Demo::new();
        let a = d.session.drivers.iter().flatten().find(|x| x.name == "Ayşe Demir").unwrap();
        assert_eq!((a.flair.as_str(), a.irating, a.license.as_str(), a.lic_color.as_str()), ("TR", 3210, "A 3.42", "#0153db"));
        let z = d.session.drivers.iter().flatten().find(|x| x.name == "Zoe Lane").unwrap();
        // Bilgisi olmayan üye: boş kalmaz, makul rastgele bayrak
        assert!(SHOWCASE_FLAIRS.contains(&z.flair.as_str()));
        assert!(z.irating >= 1200 && z.license.contains(' '));
        set_showcase_names(Vec::new());
    }

    #[test]
    fn player_iracing_only_self() {
        let mut sd = SessionData { drivers: vec![None; MAX_CARS], player_idx: 1, player_user_id: 77, category: "DirtOval".into(), ..Default::default() };
        sd.drivers[1] = Some(Driver {
            car_idx: 1,
            user_id: 77,
            irating: 2450,
            license: "A 3.45".into(),
            lic_color: "#0153DB".into(),
            flair: "tr".into(),
            ..Default::default()
        });
        let p = player_iracing_from("iracing", &sd).unwrap();
        assert_eq!((p.cust_id, p.irating, p.country.as_str(), p.category.as_str(), p.lic_color.as_str()), (77, 2450, "TR", "dirtoval", "#0153db"));
        assert!(player_iracing_from("acc", &sd).is_none());
        // Takım yarışı: araçta başkası
        sd.drivers[1].as_mut().unwrap().user_id = 99;
        assert!(player_iracing_from("iracing", &sd).is_none());
    }
}
