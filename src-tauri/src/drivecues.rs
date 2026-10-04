//! Sürüş ipuçları: üç overlay'in verisi tek modülde.
//!
//!  - `brakepoint`  (Fren ve Vites İşareti): en iyi geçerli turun fren / gaz kesme noktaları kaydedilir
//!    (pist + araç başına `brakepoints/<anahtar>.json`), sürerken sıradaki noktaya kalan mesafe verilir.
//!  - `tracklimits` (Pist Limiti): tur geçerli mi, pist dışı sayısı, geçersiz tur sayısı, olay puanı.
//!  - `damage`      (Hasar Göstergesi): `Frame::damage` alanından paket.
//!
//! Hepsi oyuncunun kendi aracı içindir; demo verisiyle de çalışır.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::model::{Frame, SessionData};

// ---------------------------------------------------------------------------------------------
// Hasar
// ---------------------------------------------------------------------------------------------

/// Oyuncu aracının hasarı (sim ne veriyorsa). Bilinmeyen alanlar -1.
#[derive(Debug, Clone, Copy)]
pub struct Damage {
    /// 0 sim hasar verisi vermiyor, 1 sadece genel durum (bölge yok: iRacing), 2 bölge bazlı
    pub detail: u8,
    /// Kaporta bölgeleri 0..1, saat yönünde: 0 ön-sol, 1 ön, 2 ön-sağ, 3 sağ, 4 arka-sağ, 5 arka, 6 arka-sol, 7 sol
    pub body: [f32; 8],
    /// Süspansiyon 0..1: LF, RF, LR, RR
    pub susp: [f32; 4],
    /// Fren 0..1: LF, RF, LR, RR
    pub brake: [f32; 4],
    /// Tekerlek: 0 sağlam, 1 patlak, 2 kopmuş, -1 bilinmiyor
    pub wheel: [i8; 4],
    pub engine: f32,
    pub aero: f32,
    /// Gövde ortası / şasi (ACC carDamage[4])
    pub centre: f32,
    /// Zorunlu / isteğe bağlı tamir süresi (sn)
    pub repair: f32,
    pub opt_repair: f32,
    /// Tamir süresi simden gelmiyor, hasardan tahmin edildi
    pub repair_est: bool,
    pub overheating: bool,
    /// Araçtan parça koptu
    pub detached: bool,
}

impl Default for Damage {
    fn default() -> Self {
        Damage {
            detail: 0,
            body: [-1.0; 8],
            susp: [-1.0; 4],
            brake: [-1.0; 4],
            wheel: [-1; 4],
            engine: -1.0,
            aero: -1.0,
            centre: -1.0,
            repair: -1.0,
            opt_repair: -1.0,
            repair_est: false,
            overheating: false,
            detached: false,
        }
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DamagePkt {
    pub detail: u8,
    pub body: [f32; 8],
    pub susp: [f32; 4],
    pub brake: [f32; 4],
    pub wheel: [i8; 4],
    pub engine: f32,
    pub aero: f32,
    pub centre: f32,
    pub repair: f32,
    pub opt_repair: f32,
    pub repair_est: bool,
    /// En kötü bölgenin şiddeti 0..1 (bölge verisi yoksa tamir süresinden tahmin)
    pub overall: f32,
    /// Gösterilecek bir hasar / uyarı var
    pub any: bool,
    /// "water", "oil", "oilPressure", "fuelPressure", "stalled", "overheat", "detached", "repairFlag"
    pub warnings: Vec<&'static str>,
    pub on_pit_road: bool,
}

/// iRacing EngineWarnings bitleri (diğer simler yalnız pit sınırlayıcı bitini doldurur)
const EW_WATER: u32 = 0x01;
const EW_FUEL_PRESSURE: u32 = 0x02;
const EW_OIL_PRESSURE: u32 = 0x04;
const EW_STALLED: u32 = 0x08;
const EW_OIL_TEMP: u32 = 0x40;
/// Araca özel bayrak: tamir gerekli ("meatball")
const CF_REPAIR: u32 = 0x0010_0000;

pub fn damage(f: &Frame) -> DamagePkt {
    let d = &f.damage;
    let mut warnings: Vec<&'static str> = Vec::new();
    let ew = f.engine_warnings;
    if ew & EW_WATER != 0 {
        warnings.push("water");
    }
    if ew & EW_OIL_TEMP != 0 {
        warnings.push("oil");
    }
    if ew & EW_OIL_PRESSURE != 0 {
        warnings.push("oilPressure");
    }
    if ew & EW_FUEL_PRESSURE != 0 {
        warnings.push("fuelPressure");
    }
    // Motor durdu uyarısı pitte / garajda anlamsız (kontak kapalı)
    if ew & EW_STALLED != 0 && f.is_on_track && !f.on_pit_road && f.speed > 3.0 {
        warnings.push("stalled");
    }
    if d.overheating {
        warnings.push("overheat");
    }
    if d.detached {
        warnings.push("detached");
    }
    let repair_flag = f.player_idx >= 0
        && f.cars.get(f.player_idx as usize).map(|c| c.flags & CF_REPAIR != 0).unwrap_or(false);
    if repair_flag {
        warnings.push("repairFlag");
    }

    let mx = |a: &[f32]| a.iter().cloned().fold(0.0f32, f32::max);
    let mut overall = mx(&d.body).max(mx(&d.susp)).max(mx(&d.brake)).max(d.engine).max(d.aero).max(d.centre).max(0.0);
    if d.wheel.iter().any(|w| *w > 0) || d.detached {
        overall = overall.max(1.0);
    }
    // Bölge verisi yoksa tamir süresinden: zorunlu tamir ciddi, isteğe bağlı hafif
    if d.repair > 0.5 {
        overall = overall.max(0.4 + 0.6 * (d.repair / 120.0).min(1.0));
    } else if d.opt_repair > 0.5 {
        overall = overall.max(0.12 + 0.28 * (d.opt_repair / 180.0).min(1.0));
    }
    if repair_flag {
        overall = overall.max(0.6);
    }
    let overall = overall.clamp(0.0, 1.0);
    DamagePkt {
        detail: d.detail,
        body: d.body,
        susp: d.susp,
        brake: d.brake,
        wheel: d.wheel,
        engine: d.engine,
        aero: d.aero,
        centre: d.centre,
        repair: d.repair,
        opt_repair: d.opt_repair,
        repair_est: d.repair_est,
        overall,
        any: overall > 0.02 || !warnings.is_empty(),
        warnings,
        on_pit_road: f.on_pit_road,
    }
}

/// ACC / AC `carDamage[5]` (ön, arka, sol, sağ, orta) ve ACC `suspensionDamage[4]`.
/// Ham değerlerin resmi bir ölçeği yok: ACC'de toplam x 0,282 sn kaporta tamiri ve süspansiyon başına
/// 30 sn'ye kadar tamir (topluluk ölçümü) kabul edilir; şiddet buna göre ölçeklenir. AC'de ölçek kabadır.
pub fn kunos_damage(acc: bool, car: [f32; 5], susp: Option<[f32; 4]>) -> Damage {
    let full = if acc { 80.0 } else { 150.0 };
    let sev = |v: f32| if v.is_finite() { (v / full).clamp(0.0, 1.0) } else { 0.0 };
    let mut d = Damage { detail: 2, centre: sev(car[4]), ..Default::default() };
    d.body[1] = sev(car[0]);
    d.body[5] = sev(car[1]);
    d.body[7] = sev(car[2]);
    d.body[3] = sev(car[3]);
    if acc {
        let body: f32 = car.iter().map(|v| if v.is_finite() { v.max(0.0) } else { 0.0 }).sum();
        let mut repair = body * 0.282;
        if let Some(s) = susp {
            for (i, v) in s.iter().enumerate() {
                let v = if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 };
                d.susp[i] = v;
                repair += v * 30.0;
            }
        }
        d.repair = repair;
        d.repair_est = true;
    }
    d
}

/// LMU / rF2: `mDentSeverity[8]` (0 yok, 1 az, 2 çok), kopan parça, aşırı ısınma, teker (patlak, kopmuş).
/// Göçük dizisinin sırası belgelenmemiştir; önden başlayıp sol taraftan dolaşan sıra varsayılır.
pub fn rf2_damage(dent: [u8; 8], overheating: bool, detached: bool, wheels: [(bool, bool); 4]) -> Damage {
    const MAP: [usize; 8] = [1, 0, 7, 6, 5, 4, 3, 2];
    let mut d = Damage { detail: 2, overheating, detached, ..Default::default() };
    for (i, v) in dent.iter().enumerate() {
        d.body[MAP[i]] = match v {
            0 => 0.0,
            1 => 0.45,
            _ => 1.0,
        };
    }
    for (i, (flat, off)) in wheels.iter().enumerate() {
        d.wheel[i] = if *off { 2 } else if *flat { 1 } else { 0 };
    }
    d
}

/// AMS2: aerodinamik ve motor hasarı (0..1), teker başına süspansiyon ve fren hasarı, lastik bayrakları
/// (bit 0 takılı, bit 1 şişik). Kaporta bölgesi yoktur.
pub fn ams2_damage(aero: f32, engine: f32, susp: [f32; 4], brake: [f32; 4], tyre_flags: [u32; 4]) -> Damage {
    let c = |v: f32| if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 };
    let mut d = Damage { detail: 1, aero: c(aero), engine: c(engine), ..Default::default() };
    for i in 0..4 {
        d.susp[i] = c(susp[i]);
        d.brake[i] = c(brake[i]);
    }
    // Bayraklar hiç doldurulmamışsa (hepsi 0) teker durumu bilinmiyor
    if tyre_flags.iter().any(|f| *f != 0) {
        for i in 0..4 {
            d.wheel[i] = if tyre_flags[i] & 1 == 0 { 2 } else if tyre_flags[i] & 2 == 0 { 1 } else { 0 };
        }
    }
    d
}

/// rF2 `mSurfaceType`: 0 kuru, 1 ıslak, 2 çim, 3 toprak, 4 çakıl, 5 kerb, 6 özel
pub fn rf2_tyres_out(surface: [u8; 4]) -> i8 {
    surface.iter().filter(|s| matches!(**s, 2..=4)).count() as i8
}

/// AMS2 `mTerrain`: çim, çakıl, kum, toprak ve türevleri pist dışı sayılır
pub fn ams2_tyres_out(terrain: [u32; 4]) -> i8 {
    terrain.iter().filter(|t| matches!(**t, 6..=9 | 15..=18 | 22 | 24 | 27 | 28)).count() as i8
}

/// Demo: yaklaşık 80 saniyelik döngü — temiz, ön-sol darbe, arka darbe + süspansiyon, pitte tamir.
pub fn demo_damage(t: f64) -> Damage {
    let mut d = Damage { detail: 2, body: [0.0; 8], susp: [0.0; 4], brake: [0.0; 4], wheel: [0; 4], engine: 0.0, aero: 0.0, centre: 0.0, repair: 0.0, opt_repair: 0.0, ..Default::default() };
    let c = (t % 80.0) as f32;
    let ramp = |from: f32, len: f32| ((c - from) / len).clamp(0.0, 1.0);
    // 12. saniyede ön-sol temas
    let a = ramp(12.0, 0.6);
    // 34. saniyede arkadan darbe
    let b = ramp(34.0, 0.6);
    // 62. saniyeden sonra tamir (hasar geri sayar)
    let fix = 1.0 - ramp(62.0, 14.0);
    d.body[0] = 0.55 * a * fix;
    d.body[1] = 0.30 * a * fix;
    d.body[7] = 0.18 * a * fix;
    d.body[5] = 0.85 * b * fix;
    d.body[4] = 0.40 * b * fix;
    d.susp[0] = 0.35 * a * fix;
    d.susp[3] = 0.20 * b * fix;
    d.aero = (0.25 * a + 0.30 * b) * fix;
    d.engine = 0.0;
    d.repair = (18.0 * a + 42.0 * b) * fix;
    d.opt_repair = (25.0 * a + 60.0 * b) * fix;
    d
}

// ---------------------------------------------------------------------------------------------
// Fren ve vites işareti
// ---------------------------------------------------------------------------------------------

/// Referans turdaki bir fren / gaz kesme noktası
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Zone {
    /// Fren (ya da gaz kesme) başlangıcı, tur yüzdesi 0..1
    pub pct: f32,
    /// 0 fren, 1 sadece gaz kesme
    pub kind: u8,
    /// Virajdaki en düşük vites
    pub gear: i32,
    /// Giriş hızı ve virajdaki en düşük hız (m/s)
    pub speed: f32,
    pub min_speed: f32,
    /// Frenden önce gazın kesildiği nokta (tur yüzdesi), yoksa -1
    pub lift: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct RefLap {
    time: f32,
    len_m: f32,
    zones: Vec<Zone>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NextZone {
    /// Sıra numarası (1'den) ve referanstaki toplam nokta
    pub n: usize,
    /// Noktaya kalan mesafe (m); nokta geçildiyse ve hâlâ fren yapılmadıysa negatif
    pub dist: f32,
    /// Şu anki hızla kalan süre (sn)
    pub eta: f32,
    pub kind: u8,
    pub gear: i32,
    pub speed: f32,
    pub min_speed: f32,
    /// Gaz kesme noktasına kalan mesafe (m), yoksa -1
    pub lift_dist: f32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LastZone {
    pub n: usize,
    /// Referansa göre fark (m): + daha geç, − daha erken fren
    pub diff: f32,
    pub kind: u8,
    /// Her yeni ölçümde artar
    pub id: u32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Brakepoint {
    pub has_ref: bool,
    /// Referans turun süresi (sn), bilinmiyorsa 0
    pub ref_time: f32,
    /// Referans diskten yüklendi (önceki oturumdan)
    pub from_file: bool,
    /// Referans dosyaya kaydediliyor (demo değil, pist + araç biliniyor)
    pub persist: bool,
    /// Bu tur referans adayı (baştan beri temiz)
    pub lap_clean: bool,
    pub next: Option<NextZone>,
    pub last: Option<LastZone>,
    /// Şu an fren pedalına basılıyor
    pub braking: bool,
    pub gear: i32,
    pub speed: f32,
    pub lap_pct: f32,
    pub track_len: f32,
    pub on_pit_road: bool,
    pub on_track: bool,
    pub zones: Vec<Zone>,
}

#[derive(Default)]
struct BrakeRec {
    key: String,
    reference: Option<RefLap>,
    from_file: bool,
    /// Süren turun noktaları
    cur: Vec<Zone>,
    clean: bool,
    t0: f64,
    dist: f64,
    prev_pct: f32,
    prev_time: f64,
    prev_inc: i32,
    braking: bool,
    /// Fren bırakıldıktan sonra geçen süre
    release_t: f32,
    /// Viraj sürüyor (gaz tekrar açılana kadar aynı nokta sayılır)
    corner: bool,
    corner_t: f32,
    thr_high: bool,
    /// Son gaz kesme: (tur yüzdesi, üzerinden geçen süre)
    lift: Option<(f32, f32)>,
    /// Referansta bu geçişte karşılanan nokta
    done: Option<usize>,
    last: Option<LastZone>,
    last_id: u32,
}

fn safe_name(key: &str) -> String {
    key.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).take(120).collect()
}

fn ref_file(dir: &Path, key: &str) -> PathBuf {
    dir.join("brakepoints").join(format!("{}.json", safe_name(key)))
}

/// İşaretli tur farkı (-0.5..0.5]
fn wrap_pct(d: f32) -> f32 {
    let mut x = d.rem_euclid(1.0);
    if x > 0.5 {
        x -= 1.0;
    }
    x
}

fn track_len(s: &SessionData, r: Option<&RefLap>) -> f32 {
    if s.track_length_km > 0.05 {
        s.track_length_km * 1000.0
    } else {
        r.map(|r| r.len_m).filter(|l| *l > 50.0).unwrap_or(0.0)
    }
}

impl BrakeRec {
    fn reset_lap(&mut self, f: &Frame, clean: bool) {
        self.cur.clear();
        self.clean = clean;
        self.t0 = f.session_time;
        self.dist = 0.0;
        self.braking = false;
        self.corner = false;
        self.lift = None;
        self.prev_inc = f.incidents;
    }

    fn set_key(&mut self, key: String, dir: Option<&Path>, demo: bool) {
        if key == self.key {
            return;
        }
        *self = BrakeRec { key, prev_pct: -1.0, ..Default::default() };
        if demo {
            // Demo pisti: fren bölgeleri demo.rs `speed_factor` ile aynı yerde (viraj − %3),
            // birkaç metre kaydırılmış ki "erken / geç" farkı da görünsün
            let z = |pct: f32, gear: i32, speed: f32, min: f32| Zone { pct, kind: 0, gear, speed, min_speed: min, lift: pct - 0.004 };
            self.reference = Some(RefLap {
                time: 0.0,
                len_m: 0.0,
                zones: vec![z(0.0885, 3, 71.0, 39.0), z(0.3418, 2, 70.0, 38.0), z(0.5782, 4, 72.0, 40.0), z(0.8326, 3, 71.0, 39.0)],
            });
            return;
        }
        if self.key.is_empty() {
            return;
        }
        if let Some(text) = dir.and_then(|d| std::fs::read_to_string(ref_file(d, &self.key)).ok()) {
            if let Ok(r) = serde_json::from_str::<RefLap>(&text) {
                if !r.zones.is_empty() && r.zones.len() < 200 {
                    self.reference = Some(r);
                    self.from_file = true;
                }
            }
        }
    }

    /// Oyuncunun yeni fren / gaz kesme başlangıcını referansla karşılaştırır
    fn compare(&mut self, pct: f32, kind: u8, len: f32) {
        let Some(r) = self.reference.as_ref() else { return };
        if len <= 0.0 {
            return;
        }
        let best = r
            .zones
            .iter()
            .enumerate()
            .map(|(i, z)| (i, wrap_pct(pct - z.pct) * len))
            .min_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap_or(std::cmp::Ordering::Equal));
        if let Some((i, diff)) = best {
            // Referans noktasından çok uzaktaki fren başka bir şeydir (trafik, hata)
            if diff.abs() <= 150.0 && (kind == 0 || r.zones[i].kind == 1) {
                self.last_id += 1;
                self.last = Some(LastZone { n: i + 1, diff, kind: r.zones[i].kind, id: self.last_id });
                self.done = Some(i);
            }
        }
    }

    fn update(&mut self, f: &Frame, s: &SessionData, sim: &str, demo: bool, dir: Option<&Path>) {
        let me = if f.player_idx >= 0 { s.driver(f.player_idx as usize) } else { None };
        let key = if demo {
            "demo".to_string()
        } else if s.track_name.is_empty() || me.is_none() {
            String::new()
        } else {
            let d = me.unwrap();
            let car = if d.car_path.is_empty() { &d.car_name } else { &d.car_path };
            format!("{}_{}_{}__{}", sim, s.track_name, s.track_config, car).to_lowercase()
        };
        self.set_key(key, dir, demo);
        if self.key.is_empty() {
            return;
        }

        let pct = f.lap_dist_pct;
        let dt = (f.session_time - self.prev_time) as f32;
        self.prev_time = f.session_time;
        let driving = f.is_on_track && !f.replay && !f.is_in_garage && f.player_idx >= 0;
        if !driving || self.prev_pct < 0.0 || !(0.0..=1.0).contains(&dt) {
            // Araçta değil ya da zaman sıçradı: bu tur referans olamaz
            self.prev_pct = if driving { pct } else { -1.0 };
            self.reset_lap(f, false);
            return;
        }
        let len = track_len(s, self.reference.as_ref());
        let surface = f.cars.get(f.player_idx as usize).map(|c| c.surface).unwrap_or(3);
        let off = surface == 0 || f.tyres_out >= 4;

        // Tur çizgisi
        let d_pct = pct - self.prev_pct;
        if self.prev_pct > 0.85 && pct < 0.15 {
            self.finish_lap(f, s, demo, dir);
            self.reset_lap(f, !f.on_pit_road);
            self.done = None;
        } else if d_pct.abs() > 0.05 {
            // Işınlanma (pite dönüş, sıfırlama)
            self.reset_lap(f, false);
        }
        self.prev_pct = pct;
        self.dist += (f.speed * dt) as f64;
        if off || f.lap_invalid || f.on_pit_road || f.incidents > self.prev_inc {
            self.clean = false;
        }
        self.prev_inc = f.incidents;

        // Referansta geçilen nokta "yapıldı" işaretini bırakır
        if let (Some(i), Some(r)) = (self.done, self.reference.as_ref()) {
            let behind = r.zones.get(i).map(|z| wrap_pct(pct - z.pct) * len.max(1.0)).unwrap_or(999.0);
            if !(-200.0..=250.0).contains(&behind) {
                self.done = None;
            }
        }

        // Gaz kesme takibi
        if f.throttle > 0.8 {
            self.thr_high = true;
        }
        if let Some(l) = self.lift.as_mut() {
            l.1 += dt;
        }
        if self.thr_high && f.throttle < 0.2 {
            self.thr_high = false;
            self.lift = Some((pct, 0.0));
        }

        let fast = f.speed > 14.0;
        // Viraj bitti mi: gaz tekrar açıldı ya da çok uzun sürdü
        if self.corner {
            self.corner_t += dt;
            if let Some(z) = self.cur.last_mut() {
                if f.gear > 0 && (z.gear <= 0 || f.gear < z.gear) {
                    z.gear = f.gear;
                }
                z.min_speed = z.min_speed.min(f.speed);
            }
            if (f.throttle > 0.6 && f.brake < 0.05 && self.corner_t > 0.5) || self.corner_t > 12.0 {
                self.corner = false;
            }
        }
        // Fren bırakma
        if self.braking {
            if f.brake < 0.05 {
                self.release_t += dt;
                if self.release_t > 0.35 {
                    self.braking = false;
                }
            } else {
                self.release_t = 0.0;
            }
        }
        // Fren başlangıcı
        if !self.braking && f.brake > 0.12 && fast {
            self.braking = true;
            self.release_t = 0.0;
            let lift = self.lift.filter(|l| l.1 < 2.5).map(|l| l.0).unwrap_or(-1.0);
            let lift_only = self.corner && self.cur.last().map(|z| z.kind == 1).unwrap_or(false);
            if lift_only {
                // Az önce "gaz kesme" diye açılan nokta aslında fren noktasıymış
                if let Some(z) = self.cur.last_mut() {
                    z.lift = z.pct;
                    z.pct = pct;
                    z.kind = 0;
                }
                self.compare(pct, 0, len);
            } else if !self.corner {
                self.cur.push(Zone { pct, kind: 0, gear: f.gear, speed: f.speed, min_speed: f.speed, lift });
                self.corner = true;
                self.corner_t = 0.0;
                self.compare(pct, 0, len);
            }
        }
        // Sadece gaz kesilen viraj (fren yok)
        if !self.corner && !self.braking && fast && f.brake < 0.05 && f.throttle < 0.2 {
            if let Some((lp, age)) = self.lift {
                if (0.4..2.5).contains(&age) {
                    self.cur.push(Zone { pct: lp, kind: 1, gear: f.gear, speed: f.speed, min_speed: f.speed, lift: lp });
                    self.corner = true;
                    self.corner_t = 0.0;
                    self.lift = None;
                    self.compare(lp, 1, len);
                }
            }
        }
    }

    fn finish_lap(&mut self, f: &Frame, s: &SessionData, demo: bool, dir: Option<&Path>) {
        let time = (f.session_time - self.t0) as f32;
        if demo || !self.clean || self.cur.is_empty() || time < 20.0 || self.cur.len() > 150 {
            return;
        }
        let len_m = if s.track_length_km > 0.05 { s.track_length_km * 1000.0 } else { self.dist as f32 };
        // Ölçülen yol pist uzunluğundan çok farklıysa tur eksiktir
        if len_m > 0.0 && ((self.dist as f32) < len_m * 0.9 || (self.dist as f32) > len_m * 1.15) {
            return;
        }
        let better = self.reference.as_ref().map(|r| r.time <= 0.0 || time < r.time - 0.0005).unwrap_or(true);
        if !better {
            return;
        }
        let mut zones = self.cur.clone();
        zones.sort_by(|a, b| a.pct.total_cmp(&b.pct));
        let r = RefLap { time, len_m, zones };
        if let Some(d) = dir {
            let path = ref_file(d, &self.key);
            if let Ok(text) = serde_json::to_string(&r) {
                // Küçük dosya (birkaç KB), tur başına en fazla bir kez
                std::thread::spawn(move || {
                    if let Some(p) = path.parent() {
                        let _ = std::fs::create_dir_all(p);
                    }
                    let _ = std::fs::write(path, text);
                });
            }
        }
        self.reference = Some(r);
        self.from_file = false;
        self.last = None;
    }

    fn packet(&self, f: &Frame, s: &SessionData, demo: bool, persist: bool) -> Brakepoint {
        let pct = f.lap_dist_pct;
        let len = track_len(s, self.reference.as_ref());
        let mut out = Brakepoint {
            has_ref: self.reference.is_some(),
            ref_time: self.reference.as_ref().map(|r| if demo && f.lap_best > 0.0 { f.lap_best } else { r.time }).unwrap_or(0.0),
            from_file: self.from_file,
            persist: persist && !demo && !self.key.is_empty(),
            lap_clean: self.clean,
            next: None,
            last: self.last.clone(),
            braking: f.brake > 0.12,
            gear: f.gear,
            speed: f.speed,
            lap_pct: pct,
            track_len: len,
            on_pit_road: f.on_pit_road,
            on_track: f.is_on_track,
            zones: self.reference.as_ref().map(|r| r.zones.clone()).unwrap_or_default(),
        };
        let Some(r) = self.reference.as_ref() else { return out };
        if len <= 0.0 || r.zones.is_empty() {
            return out;
        }
        let mut best: Option<(usize, f32)> = None;
        for (i, z) in r.zones.iter().enumerate() {
            let mut d = wrap_pct(z.pct - pct) * len;
            let done = self.done == Some(i);
            // Geçilmiş nokta: fren yapılmadıysa 30 m boyunca "ŞİMDİ" kalır
            if d < -30.0 || (done && d < 150.0) || (d < 0.0 && f.brake > 0.12) {
                d += len;
            }
            if best.map(|b| d < b.1).unwrap_or(true) {
                best = Some((i, d));
            }
        }
        if let Some((i, d)) = best {
            let z = &r.zones[i];
            let lift_dist = if z.lift >= 0.0 && z.kind == 0 {
                let l = d - wrap_pct(z.pct - z.lift).max(0.0) * len;
                l.max(0.0)
            } else {
                -1.0
            };
            out.next = Some(NextZone {
                n: i + 1,
                dist: d,
                eta: if f.speed > 1.0 { (d / f.speed).max(0.0) } else { 999.0 },
                kind: z.kind,
                gear: z.gear,
                speed: z.speed,
                min_speed: z.min_speed,
                lift_dist,
            });
        }
        out
    }
}

// ---------------------------------------------------------------------------------------------
// Pist limiti
// ---------------------------------------------------------------------------------------------

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrackLimits {
    /// Süren tur hâlâ geçerli
    pub valid: bool,
    /// Şu an pist dışında
    pub off: bool,
    /// Pist dışındaki teker sayısı (ACC / AC), bilinmiyorsa -1
    pub tyres_out: i32,
    /// Oturumdaki pist dışı sayısı ve bu turdaki
    pub offs: u32,
    pub lap_offs: u32,
    /// Oturumdaki geçersiz tur sayısı (süren tur dahil) ve tamamlanan tur
    pub invalid_laps: u32,
    pub laps: u32,
    pub incidents: i32,
    /// Olay puanı sınırı (sadece iRacing), yoksa 0
    pub incident_limit: i32,
    /// Sim olay puanı veriyor (iRacing)
    pub has_incidents: bool,
    /// Pist dışı algılanabiliyor
    pub has_off: bool,
    /// Tur geçerliliğini sim kendisi bildiriyor (false: pist dışı / olaydan çıkarılıyor)
    pub sim_valid: bool,
    /// "" | driveThrough | stopGo | disqualify | timePenalty | penalty
    pub penalty: &'static str,
    /// Her pist dışı / geçersiz sayılma olayında artar
    pub event_id: u32,
    /// "off" | "invalid" | "incident"
    pub event_kind: &'static str,
    /// Olaydan beri geçen süre (sn)
    pub event_ago: f32,
    /// Olaydaki olay puanı artışı (iRacing)
    pub event_delta: i32,
    pub on_pit_road: bool,
    pub on_track: bool,
    pub lap: i32,
}

#[derive(Default)]
struct Limits {
    session_num: i32,
    prev_time: f64,
    lap_completed: i32,
    invalid: bool,
    was_off: bool,
    off_end: f64,
    offs: u32,
    lap_offs: u32,
    invalid_laps: u32,
    laps: u32,
    prev_inc: i32,
    event_id: u32,
    event_kind: &'static str,
    event_time: f64,
    event_delta: i32,
    started: bool,
    /// Sim tur geçersiz bayrağını en az bir kez verdi mi
    prev_sim_invalid: bool,
}

impl Limits {
    fn event(&mut self, kind: &'static str, t: f64, delta: i32) {
        self.event_id += 1;
        self.event_kind = kind;
        self.event_time = t;
        self.event_delta = delta;
    }

    fn invalidate(&mut self) {
        if !self.invalid {
            self.invalid = true;
            self.invalid_laps += 1;
        }
    }

    fn update(&mut self, f: &Frame, demo: bool) {
        let t = f.session_time;
        if !self.started || f.session_num != self.session_num || t < self.prev_time - 5.0 {
            *self = Limits { started: true, session_num: f.session_num, lap_completed: f.lap_completed, prev_inc: f.incidents, off_end: -10.0, event_time: -100.0, ..Default::default() };
        }
        self.prev_time = t;
        let driving = f.is_on_track && !f.replay && !f.is_in_garage && f.player_idx >= 0;
        if !driving {
            self.prev_inc = f.incidents;
            self.was_off = false;
            return;
        }
        // Yeni tur
        if f.lap_completed != self.lap_completed {
            if f.lap_completed > self.lap_completed && !f.on_pit_road {
                self.laps += 1;
            }
            self.lap_completed = f.lap_completed;
            self.invalid = false;
            self.lap_offs = 0;
            self.prev_sim_invalid = false;
        }
        let surface = f.cars.get(f.player_idx as usize).map(|c| c.surface).unwrap_or(3);
        let off = !f.on_pit_road && (surface == 0 || f.tyres_out >= 4);
        if off && !self.was_off && t - self.off_end > 1.0 {
            self.offs += 1;
            self.lap_offs += 1;
            self.invalidate();
            self.event("off", t, 0);
        }
        if !off && self.was_off {
            self.off_end = t;
        }
        self.was_off = off;

        if f.lap_invalid && !self.prev_sim_invalid && !f.on_pit_road {
            let was = self.invalid;
            self.invalidate();
            // Az önce pist dışı olayı gösterildiyse (ya da tur zaten geçersizse) aynı şeyi iki kez bildirme
            let after_off = t - self.event_time < 2.5 && self.event_kind == "off";
            if !was && !after_off {
                self.event("invalid", t, 0);
            }
        }
        self.prev_sim_invalid = f.lap_invalid;

        if f.incidents > self.prev_inc {
            let delta = f.incidents - self.prev_inc;
            if !f.on_pit_road {
                self.invalidate();
            }
            if t - self.event_time < 2.5 && self.event_kind == "off" {
                // Pist dışının 1x'i: aynı olaya puanı ekle
                self.event_delta += delta;
            } else if demo && delta == 1 {
                // Demo aracı pistten çıkmaz: 1x olayları pist dışı gibi gösterilir
                self.offs += 1;
                self.lap_offs += 1;
                self.event("off", t, delta);
            } else {
                self.event("incident", t, delta);
            }
        }
        self.prev_inc = f.incidents;
    }

    fn packet(&self, f: &Frame, s: &SessionData, sim: &str, demo: bool) -> TrackLimits {
        let iracing = sim == "iracing" || demo;
        let surface = if f.player_idx >= 0 { f.cars.get(f.player_idx as usize).map(|c| c.surface).unwrap_or(3) } else { 3 };
        TrackLimits {
            valid: !self.invalid,
            off: self.was_off,
            tyres_out: f.tyres_out as i32,
            offs: self.offs,
            lap_offs: self.lap_offs,
            invalid_laps: self.invalid_laps,
            laps: self.laps,
            incidents: f.incidents,
            incident_limit: if iracing { s.incident_limit.max(0) } else { 0 },
            has_incidents: iracing,
            has_off: iracing || f.tyres_out >= 0 || surface == 0,
            sim_valid: matches!(sim, "acc" | "lmu" | "rf2" | "ams2"),
            penalty: match f.penalty {
                1 => "driveThrough",
                2 => "stopGo",
                3 => "disqualify",
                4 => "timePenalty",
                5 => "penalty",
                _ => "",
            },
            event_id: self.event_id,
            event_kind: self.event_kind,
            event_ago: (f.session_time - self.event_time).clamp(0.0, 9999.0) as f32,
            event_delta: self.event_delta,
            on_pit_road: f.on_pit_road,
            on_track: f.is_on_track,
            lap: f.lap,
        }
    }
}

// ---------------------------------------------------------------------------------------------

/// Motorun tuttuğu durum (bkz. engine.rs `State::cues`)
#[derive(Default)]
pub struct Cues {
    brake: BrakeRec,
    limits: Limits,
    sim: String,
    demo: bool,
    persist: bool,
}

impl Cues {
    /// Her yeni telemetri karesinde. `dir`: uygulama veri klasörü (referans turlar için); demo'da yazılmaz.
    pub fn update(&mut self, f: &Frame, s: &SessionData, sim: &str, demo: bool, dir: Option<&Path>) {
        if self.sim != sim || self.demo != demo {
            self.sim = sim.to_string();
            self.demo = demo;
            self.limits = Limits::default();
        }
        self.persist = dir.is_some();
        self.brake.update(f, s, sim, demo, dir);
        self.limits.update(f, demo);
    }

    pub fn brakepoint(&self, f: &Frame, s: &SessionData) -> Brakepoint {
        self.brake.packet(f, s, self.demo, self.persist)
    }

    pub fn limits(&self, f: &Frame, s: &SessionData) -> TrackLimits {
        self.limits.packet(f, s, &self.sim, self.demo)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(t: f64, pct: f32, lap: i32) -> Frame {
        let mut f = Frame { session_time: t, lap_dist_pct: pct, lap_completed: lap, lap: lap + 1, player_idx: 0, is_on_track: true, speed: 50.0, throttle: 1.0, gear: 5, ..Default::default() };
        f.cars[0].surface = 3;
        f
    }

    fn session() -> SessionData {
        let mut s = SessionData { track_name: "test".into(), track_length_km: 4.0, player_idx: 0, drivers: vec![None; 4], ..Default::default() };
        s.drivers[0] = Some(crate::model::Driver { car_idx: 0, car_path: "car".into(), ..Default::default() });
        s
    }

    /// 80 sn'lik tur; `brake_at` noktasında 2 sn fren
    fn drive(c: &mut Cues, s: &SessionData, laps: i32, brake_at: f32, t0: f64) -> f64 {
        let mut t = t0;
        for lap in 0..laps {
            for i in 0..4800 {
                let pct = i as f32 / 4800.0;
                let mut f = frame(t, pct, lap);
                if pct >= brake_at && pct < brake_at + 0.025 {
                    f.brake = 0.8;
                    f.throttle = 0.0;
                    f.gear = 2;
                }
                c.update(&f, s, "iracing", false, None);
                t += 1.0 / 60.0;
            }
        }
        t
    }

    #[test]
    fn records_reference_and_compares() {
        let s = session();
        let mut c = Cues::default();
        // İlk tur yarım sayılır (çizgiden başlamadı), ikinci tur referans olur
        let t = drive(&mut c, &s, 3, 0.5, 0.0);
        let p = c.brakepoint(&frame(t, 0.4, 3), &s);
        assert!(p.has_ref);
        assert_eq!(p.zones.len(), 1);
        assert!((p.zones[0].pct - 0.5).abs() < 0.001);
        assert_eq!(p.zones[0].gear, 2);
        let n = p.next.unwrap();
        assert!((n.dist - 400.0).abs() < 5.0, "{}", n.dist);
        // Daha geç fren: + metre
        drive(&mut c, &s, 1, 0.51, t);
        let l = c.brake.last.clone().unwrap();
        assert!((l.diff - 40.0).abs() < 3.0, "{}", l.diff);
    }

    #[test]
    fn limits_count_offs() {
        let s = session();
        let mut c = Cues::default();
        let mut f = frame(1.0, 0.1, 0);
        c.update(&f, &s, "iracing", false, None);
        f.session_time = 2.0;
        f.cars[0].surface = 0;
        f.incidents = 1;
        c.update(&f, &s, "iracing", false, None);
        let p = c.limits(&f, &s);
        assert!(!p.valid && p.offs == 1 && p.invalid_laps == 1 && p.event_id == 1 && p.event_delta == 1);
        f.session_time = 5.0;
        f.cars[0].surface = 3;
        f.lap_completed = 1;
        c.update(&f, &s, "iracing", false, None);
        let p = c.limits(&f, &s);
        assert!(p.valid && p.invalid_laps == 1 && p.laps == 1);
    }
}
