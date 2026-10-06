//! Overlay'lerin göstereceği hazır veriyi hesaplar.
//! Tüm ağır iş burada, Rust'ta yapılır; arayüze sadece ekrana basılacak küçük paketler gider.
//! Paket tipleri arayüzdeki src/sdk/types.ts ile birebir aynıdır.

use crate::model::{Frame, SessionData, MAX_CARS};
use crate::trackmap::TrackMap;
use crate::tracker::{RcEvent, Tracker, CF_BLACK, CF_BLUE, CF_DQ, CF_REPAIR};
use serde::Serialize;

// ---------------------------------------------------------------------------
// Paketler
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub connected: bool,
    pub demo: bool,
    /// Sadece panel önizlemesi için üretilen demo verisi (overlay'ler gizli)
    pub preview: bool,
    pub on_track: bool,
    pub in_garage: bool,
    /// Garaj / setup ekranı açık mı (sim bildirmiyorsa alan gönderilmez)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub garage_visible: Option<bool>,
    /// Oyuncunun aracı pit yolunda / pit kutusunda (overlay'lerde "Pitteyken gizle")
    pub on_pit: bool,
    pub replay: bool,
    /// Gerçek bir tekrar izleniyor (iRacing'de canlı ana yetişmiş izleme hariç)
    pub replay_watch: bool,
    /// Oyuncu pistte değil ve garajda değil: izleyici/spotter
    pub spectating: bool,
    /// Oyuncu bu oturumda KENDİ aracının sürücüsü (izleyici / spotter / tekrar dosyası / aracı takım arkadaşı sürüyor değil).
    /// Arkadaş durumu ("yarışta") ve ekip pitwall'u buna bakar; bkz. sims/role.rs
    pub driver: bool,
    /// "driver" | "teammate" | "spectator" | "replay" | "" (bağlı değil)
    pub role: String,
    pub session_type: String,
    pub track: String,
    pub track_id: i32,
    pub series_id: i32,
    pub category: String,
    pub car_name: String,
    pub car_path: String,
    pub class_name: String,
    /// Oyuncunun takım adı (sim veriyorsa; sürücü kartı overlay'i)
    pub team_name: String,
    /// Oyuncunun iRacing hesabı (hesap eşleme için)
    pub user_id: i64,
    pub user_name: String,
    /// Bağlı simülasyon: "iracing" | "acc" | "ac" | "lmu" | "rf2" | "ams2" | "" (yok/demo)
    pub sim: String,
    /// Canlı Sohbet overlay kapısı (motor doldurur; bkz. livechat::LiveGate)
    pub chat: crate::livechat::LiveGate,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Inputs {
    pub throttle: f32,
    pub brake: f32,
    pub clutch: f32,
    pub steer: f32,
    pub gear: i32,
    pub speed: f32,
    pub rpm: f32,
    pub shift_rpm: f32,
    pub redline: f32,
    pub abs: bool,
    /// Çekiş kontrolü kesiyor
    pub tc: bool,
    /// Yanal (+ sağ) / boyuna (+ hızlanma) ivme, g
    pub lat_g: f32,
    pub long_g: f32,
    /// Son / en iyi tur (sn; yoksa -1)
    pub last_lap: f32,
    pub best_lap: f32,
}

/// ERS ve batarya overlay'i. Tur başı / tur ortalaması gibi türev değerler arayüzde hesaplanır.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Ers {
    pub has_hybrid: bool,
    /// 0..1; bilinmiyorsa -1
    pub battery_pct: f32,
    /// MJ; bilinmiyorsa -1
    pub battery_mj: f32,
    /// Bu turda kalan harcama hakkı 0..1; yoksa -1
    pub lap_deploy_left: f32,
    /// kW: + harcama, - geri kazanım; sim vermiyorsa null
    pub mguk_kw: Option<f32>,
    pub mguh_kw: Option<f32>,
    pub mode: i32,
    pub mode_set: u8,
    pub regen_gain: f32,
    pub p2p_count: i32,
    pub p2p_active: bool,
    pub drs: i32,
    pub lap: i32,
    pub lap_pct: f32,
    pub on_pit_road: bool,
    pub on_track: bool,
}

pub fn ers(f: &Frame) -> Ers {
    let h = &f.hybrid;
    Ers {
        has_hybrid: h.has,
        battery_pct: if h.battery_pct >= 0.0 { h.battery_pct.clamp(0.0, 1.0) } else { -1.0 },
        battery_mj: if h.battery_j >= 0.0 { h.battery_j / 1.0e6 } else { -1.0 },
        lap_deploy_left: if h.lap_deploy_left >= 0.0 { h.lap_deploy_left.clamp(0.0, 1.0) } else { -1.0 },
        mguk_kw: h.mguk_ok.then_some(h.mguk_kw),
        mguh_kw: h.mguh_ok.then_some(h.mguh_kw),
        mode: h.mode,
        mode_set: h.mode_set,
        regen_gain: h.regen_gain,
        p2p_count: h.p2p_count,
        p2p_active: h.p2p_active,
        drs: h.drs,
        lap: f.lap,
        lap_pct: f.lap_dist_pct,
        on_pit_road: f.on_pit_road,
        on_track: f.is_on_track,
    }
}

/// Telemetri paneli: vites halkası, devir ışıkları, pozisyon, son tur, yakıt
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    pub gear: i32,
    pub speed: f32,
    pub rpm: f32,
    pub sl_first: f32,
    pub sl_shift: f32,
    pub sl_last: f32,
    pub sl_blink: f32,
    pub redline: f32,
    pub position: i32,
    pub class_position: i32,
    /// Başlangıca göre kazanılan (+) / kaybedilen (-) sıra
    pub pos_change: i32,
    pub lap: i32,
    pub last: f32,
    pub best: f32,
    pub fuel_level: f32,
    pub fuel_pct: f32,
    pub track_temp: f32,
    pub air_temp: f32,
    pub abs: f32,
    pub abs_active: bool,
    /// Çekiş kontrolü şu an kesiyor (ACC/AC; diğer simlerde hep false)
    pub tc_active: bool,
    pub tc: f32,
    pub brake_bias: f32,
    /// °C; bilinmiyorsa -1
    pub oil_temp: f32,
    pub water_temp: f32,
    pub on_pit_road: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Delta {
    pub delta: f32,
    pub valid: bool,
    pub trend: f32,
    pub current: f32,
    pub last: f32,
    pub best: f32,
    /// Oturumun en iyi turuna / optimal tura göre (sadece iRacing; yoksa valid false)
    pub session_delta: f32,
    pub session_valid: bool,
    pub optimal_delta: f32,
    pub optimal_valid: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RadarCar {
    /// -1 sol, 1 sağ, 0 önde/arkada
    pub side: i8,
    /// Boyuna mesafe (m); + önde
    pub offset: f32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Radar {
    /// 0 kapalı, 1 temiz, 2 solda, 3 sağda, 4 iki yanda, 5 solda iki, 6 sağda iki
    pub state: i32,
    pub ahead_m: Option<f32>,
    pub behind_m: Option<f32>,
    pub cars: Vec<RadarCar>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub idx: i32,
    pub pos: i32,
    pub class_pos: i32,
    pub class_id: i32,
    pub class_name: String,
    pub class_color: String,
    pub number: String,
    pub name: String,
    pub car: String,
    /// Tam araç adı (marka logosu eşleşmesi için)
    pub car_name: String,
    pub user_id: i64,
    pub flair: String,
    pub irating: i32,
    /// Tahmini iRating değişimi (sadece yarış)
    pub ir_delta: i32,
    pub license: String,
    pub lic_letter: String,
    pub sr: f32,
    pub lic_color: String,
    /// Relative: oyuncuya göre saniye (+ önde). Standings: lidere göre saniye.
    pub gap: f32,
    pub interval: f32,
    pub laps_down: i32,
    /// Relative: +N = N tur önde (seni turluyor), -N = turlanıyor, 0 = aynı tur
    pub lap_rel: i32,
    pub last: f32,
    pub best: f32,
    pub avg5: f32,
    /// Son tur kendi en iyisi mi
    pub last_pb: bool,
    pub on_pit: bool,
    /// "PIT" | "OUT" | ""
    pub pit_state: String,
    pub stint: i32,
    pub pits: i32,
    pub tire: i32,
    /// Lastik türü: "S" | "M" | "H" | "I" | "W" | "D" (kuru, türü bilinmiyor) | "" (bilinmiyor)
    pub tire_kind: String,
    /// "BLK" | "DSQ" | "REP" | "BLU" | ""
    pub flag: String,
    pub pos_change: i32,
    pub is_me: bool,
    /// Sunucudan çıkmış (araç dünyada yok) ama resmi sıralamada duran sürücü: sıralama / sonuç listelerinde kalır
    pub gone: bool,
    pub class_best: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Relative {
    pub rows: Vec<Row>,
    pub air_temp: f32,
    pub track_temp: f32,
    pub wetness: i32,
    pub humidity: f32,
    pub precip: f32,
    pub sof: i32,
    pub incidents: i32,
    pub incident_limit: i32,
    pub time_remain: f64,
    pub laps_remain: i32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClassInfo {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub count: i32,
    pub sof: i32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Standings {
    pub rows: Vec<Row>,
    pub multiclass: bool,
    pub race: bool,
    pub session_type: String,
    pub elapsed: f64,
    pub total_time: f64,
    pub time_remain: f64,
    pub laps_remain: i32,
    pub total_laps: i32,
    pub leader_lap: i32,
    pub car_count: i32,
    pub classes: Vec<ClassInfo>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FuelRow {
    /// Tur başı tüketim
    pub usage: f32,
    /// Depodaki yakıtla gidilebilecek tur
    pub laps: f32,
    /// Dolu depoyla gidilebilecek tur (stint uzunluğu)
    pub stint: f32,
    /// Bitişe kadar eklenmesi gereken yakıt (emniyet payı hariç)
    pub refuel: f32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Fuel {
    pub level: f32,
    pub pct: f32,
    pub max: f32,
    pub lap: i32,
    pub last: FuelRow,
    pub avg5: FuelRow,
    pub avg10: FuelRow,
    /// En kötü (en yüksek) tüketim
    pub worst: FuelRow,
    pub race_laps_left: f32,
    /// Bitişe kadar gereken toplam yakıt (ort. 5 tur)
    pub race_needed: f32,
    pub stint_time: f64,
    pub lap_time: f32,
    /// Yakıtın bitmesine kalan süre (sn)
    pub time_to_empty: f32,
    /// [tur sayısı, o kadar tur gitmek için gereken tur başı tüketim]
    pub targets: Vec<(i32, f32)>,
    /// Tek pitle bitirmek için pit penceresi (tur aralığı), yoksa 0
    pub pit_open: i32,
    pub pit_close: i32,
    /// Pit penceresi zaman aralığı (oturum kalan süresi cinsinden değil, şu andan itibaren sn)
    pub pit_open_in: f32,
    pub pit_close_in: f32,
    pub samples: usize,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Weather {
    pub air_temp: f32,
    pub track_temp: f32,
    /// Rüzgârın geldiği yön (rad, kuzeye göre)
    pub wind_dir: f32,
    pub wind_vel: f32,
    /// Aracın yönü (rad, kuzeye göre) — pusulayı araca göre döndürmek için
    pub heading: f32,
    /// 0..1, bilinmiyorsa -1
    pub humidity: f32,
    pub precip: f32,
    pub wetness: i32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub session_type: String,
    pub track: String,
    pub flags: Vec<&'static str>,
    /// Oyuncunun cezası: "" yok, driveThrough, stopGo, disqualify, timePenalty, penalty (türü bilinmiyor),
    /// black (siyah bayrak), repair (hasar), furled (uyarı: yavaşla)
    pub penalty: &'static str,
    pub time_remain: f64,
    pub laps_remain: i32,
    pub total_laps: i32,
    pub lap: i32,
    pub laps_completed: i32,
    pub position: i32,
    pub class_position: i32,
    pub car_count: i32,
    pub air_temp: f32,
    pub track_temp: f32,
    pub wetness: i32,
    pub incidents: i32,
    pub incident_limit: i32,
    pub brake_bias: f32,
    pub tc: f32,
    pub abs: f32,
    pub on_pit_road: bool,
    /// iRacing SessionState ölçeği: 1 araca bin, 2 ısınma / grid, 3 formasyon turu, 4 yarış, 5 damalı bayrak, 6 soğuma
    pub state: i32,
    /// Start ışığı aşaması: -1 sim vermiyor, 0 gizli, 1 hazır (kırmızılar), 2 set, 3 yeşil
    pub start_lights: i32,
    /// Yanan kırmızı ışık sayısı / toplam (LMU/rF2); toplam 0: sim ışıkları tek tek vermiyor
    pub start_lit: i32,
    pub start_total: i32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MapCar {
    pub idx: i32,
    pub number: String,
    pub user_id: i64,
    pub name: String,
    pub pct: f32,
    pub color: String,
    pub pos: i32,
    pub class_pos: i32,
    pub me: bool,
    pub pit: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MapData {
    pub key: String,
    pub version: u32,
    /// Sadece sürüm değişince gönderilir; aksi halde null
    pub shape: Option<Vec<[f32; 2]>>,
    pub has_shape: bool,
    pub progress: f32,
    pub recording: bool,
    /// Öğrenilmiş pit yolu (giriş / çıkış tur yüzdesi, yan, pit kutusu); bilinmiyorsa null
    pub pit: Option<crate::trackmap::PitLane>,
    pub cars: Vec<MapCar>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RaceControl {
    pub events: Vec<RcEvent>,
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

pub(crate) fn active(f: &Frame, s: &SessionData, i: usize) -> bool {
    let c = &f.cars[i];
    if c.pct < 0.0 {
        return false;
    }
    match s.driver(i) {
        Some(d) => !d.is_pace_car && !d.is_spectator,
        None => false,
    }
}

fn car_flag(bits: u32) -> &'static str {
    if bits & CF_DQ != 0 {
        "DSQ"
    } else if bits & CF_BLACK != 0 {
        "BLK"
    } else if bits & CF_REPAIR != 0 {
        "REP"
    } else if bits & CF_BLUE != 0 {
        "BLU"
    } else {
        ""
    }
}

/// "A 3.45" -> ("A", 3.45)
fn split_license(l: &str) -> (String, f32) {
    let mut it = l.split_whitespace();
    let letter = it.next().unwrap_or("").to_string();
    let sr = it.next().and_then(|x| x.parse().ok()).unwrap_or(0.0);
    (letter, sr)
}

/// Araç adından kısa marka: "Porsche 911 GT3 R" -> "Porsche"
fn car_make(name: &str) -> String {
    name.split_whitespace().next().unwrap_or("").to_string()
}

const BR1: f64 = 1600.0 / std::f64::consts::LN_2;

/// iRacing'in sınıf gücü (SOF) formülü
pub fn sof(irs: &[i32]) -> i32 {
    let v: Vec<f64> = irs.iter().filter(|&&x| x > 0).map(|&x| x as f64).collect();
    if v.is_empty() {
        return 0;
    }
    let sum: f64 = v.iter().map(|ir| (-ir / BR1).exp()).sum();
    (BR1 * (v.len() as f64 / sum).ln()).round() as i32
}

/// Topluluğun yaygın kullandığı iRating tahmin formülü. `field` sınıf içi sıraya göre
/// (iRating, bitiş sırası 1..N) listesidir; aynı sırada tahmini değişimleri döner.
#[allow(dead_code)]
pub fn ir_deltas(field: &[(i32, i32)]) -> Vec<i32> {
    let n = field.len();
    if n < 2 {
        return vec![0; n];
    }
    let e: Vec<f64> = field.iter().map(|(ir, _)| (-(*ir).max(1) as f64 / BR1).exp()).collect();
    let chance = |a: usize, b: usize| {
        // a'nın b'yi yenme olasılığı
        let (ea, eb) = (e[a], e[b]);
        ((1.0 - ea) * eb) / ((1.0 - eb) * ea + (1.0 - ea) * eb)
    };
    let nf = n as f64;
    (0..n)
        .map(|i| {
            // Beklenen: yenmesi beklenen rakip sayısı (kendisiyle eşleşme 0.5 sayılır)
            let expected: f64 = (0..n).map(|j| chance(i, j)).sum::<f64>() - 0.5;
            let pos = field[i].1 as f64;
            let fudge = (nf / 2.0 - pos) / 100.0;
            ((nf - pos - expected - fudge) * 200.0 / nf).round() as i32
        })
        .collect()
}

fn base_row(f: &Frame, s: &SessionData, t: &Tracker, i: usize) -> Row {
    let c = &f.cars[i];
    let d = s.driver(i);
    let tr = &t.cars[i];
    let license = d.map(|d| d.license.clone()).unwrap_or_default();
    let (lic_letter, sr) = split_license(&license);
    let pit_state = if c.on_pit {
        "PIT"
    } else if tr.out_lap {
        "OUT"
    } else {
        ""
    };
    Row {
        idx: i as i32,
        pos: c.position,
        class_pos: c.class_position,
        class_id: d.map(|d| d.class_id).unwrap_or(0),
        class_name: d.map(|d| d.class_name.clone()).unwrap_or_default(),
        class_color: d.map(|d| d.class_color.clone()).unwrap_or_default(),
        number: d.map(|d| d.car_number.clone()).unwrap_or_default(),
        name: d.map(|d| d.name.clone()).unwrap_or_default(),
        car: d.map(|d| car_make(&d.car_name)).unwrap_or_default(),
        car_name: d.map(|d| d.car_name.clone()).unwrap_or_default(),
        user_id: d.map(|d| d.user_id).unwrap_or(0),
        flair: d.map(|d| d.flair.clone()).unwrap_or_default(),
        irating: d.map(|d| d.irating).unwrap_or(0),
        license,
        lic_letter,
        sr,
        lic_color: d.map(|d| d.lic_color.clone()).unwrap_or_default(),
        last: c.last,
        best: c.best,
        avg5: tr.avg(5),
        last_pb: c.last > 0.0 && c.best > 0.0 && (c.last - c.best).abs() < 0.0005,
        on_pit: c.on_pit,
        pit_state: pit_state.into(),
        stint: tr.stint(c.lap_completed),
        pits: tr.pits,
        tire: c.tire,
        tire_kind: {
            let my_class = s.player().map(|p| p.class_id);
            let k = crate::model::tire_kind(c, s, d.map(|d| d.class_id) == my_class);
            if k == 0 { String::new() } else { (k as char).to_string() }
        },
        flag: car_flag(c.flags).into(),
        pos_change: if tr.start_pos > 0 && c.class_position > 0 { tr.start_pos - c.class_position } else { 0 },
        is_me: i as i32 == f.player_idx,
        ..Default::default()
    }
}

pub(crate) fn ref_lap_time(f: &Frame, s: &SessionData) -> f32 {
    let me = f.player_idx.max(0) as usize;
    let est = s.driver(me).map(|d| d.class_est_lap).unwrap_or(0.0);
    if est > 1.0 {
        est
    } else if f.lap_best > 1.0 {
        f.lap_best
    } else if s.est_lap_time > 1.0 {
        s.est_lap_time
    } else {
        100.0
    }
}

/// Yarışta sınıf başına tahmini iRating değişimleri (araç indeksine göre)
fn ir_map(f: &Frame, s: &SessionData) -> [i32; MAX_CARS] {
    let mut out = [0i32; MAX_CARS];
    if !s.is_race(f.session_num) {
        return out;
    }
    // Sınıftaki bütün kayıtlı sürücüler (pistten çıkmış olsa da): sıralaması olan başlamış, olmayan başlamamış sayılır
    let in_field = |i: usize| s.driver(i).map(|d| !d.is_pace_car && !d.is_spectator).unwrap_or(false);
    let mut class_ids: Vec<i32> = Vec::new();
    for i in 0..MAX_CARS {
        if let Some(d) = s.driver(i) {
            if in_field(i) && !class_ids.contains(&d.class_id) {
                class_ids.push(d.class_id);
            }
        }
    }
    for cid in class_ids {
        let mut idxs: Vec<usize> =
            (0..MAX_CARS).filter(|&i| in_field(i) && s.driver(i).map(|d| d.class_id == cid).unwrap_or(false)).collect();
        // Başlayanlar sınıf sırasına göre önde, başlamayanlar sonda
        idxs.sort_by_key(|&i| {
            let p = f.cars[i].class_position;
            if p > 0 {
                p
            } else {
                i32::MAX
            }
        });
        let field: Vec<crate::irating::Entry> = idxs
            .iter()
            .enumerate()
            .map(|(n, &i)| crate::irating::Entry {
                irating: s.driver(i).map(|d| d.irating).unwrap_or(0),
                pos: n as i32 + 1,
                started: f.cars[i].class_position > 0,
            })
            .collect();
        for (k, d) in crate::irating::estimate(&field).into_iter().enumerate() {
            out[idxs[k]] = d;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Paket üreticileri
// ---------------------------------------------------------------------------

/// Gerçek bir tekrar izleniyor mu (overlay'leri gizlemek, Olaylar penceresini açmak için)
pub fn replay_watch(f: &Frame) -> bool {
    f.replay && !f.replay_live
}

pub fn status(f: &Frame, s: &SessionData, connected: bool, demo: bool, preview: bool) -> Status {
    let me = s.player();
    Status {
        connected,
        demo,
        preview,
        on_track: f.is_on_track,
        in_garage: f.is_in_garage,
        garage_visible: if connected && !demo { f.garage_visible } else { None },
        on_pit: f.on_pit_road,
        replay: f.replay,
        replay_watch: replay_watch(f),
        spectating: connected && !demo && !f.is_on_track && !f.is_in_garage,
        // Demo / önizleme: sürücü; canlı simde motor sim kimliğiyle yeniden hesaplar (engine.rs)
        driver: connected,
        role: if connected { "driver".into() } else { String::new() },
        session_type: s.session(f.session_num).map(|x| x.kind.clone()).unwrap_or_default(),
        track: s.track_name.clone(),
        track_id: s.track_id,
        series_id: s.series_id,
        category: s.category.clone(),
        car_name: me.map(|d| d.car_name.clone()).unwrap_or_default(),
        user_id: me.map(|d| d.user_id).unwrap_or(0),
        user_name: me.map(|d| d.name.clone()).unwrap_or_default(),
        car_path: me.map(|d| d.car_path.clone()).unwrap_or_default(),
        class_name: me.map(|d| d.class_name.clone()).unwrap_or_default(),
        team_name: me.map(|d| d.team_name.clone()).unwrap_or_default(),
        sim: String::new(),
        chat: Default::default(),
    }
}

pub fn inputs(f: &Frame, s: &SessionData) -> Inputs {
    Inputs {
        throttle: f.throttle,
        brake: f.brake,
        clutch: f.clutch,
        steer: f.steer,
        gear: f.gear,
        speed: f.speed,
        rpm: f.rpm,
        shift_rpm: s.shift_rpm,
        redline: s.redline,
        abs: f.abs_active,
        tc: f.tc_active,
        lat_g: f.lat_g,
        long_g: f.long_g,
        last_lap: f.lap_last,
        best_lap: f.lap_best,
    }
}

pub fn telemetry(f: &Frame, s: &SessionData, t: &Tracker) -> Telemetry {
    let me = f.player_idx.max(0) as usize;
    let c = f.cars.get(me).copied().unwrap_or_default();
    let start = t.cars.get(me).map(|x| x.start_pos).unwrap_or(0);
    // Vites ışıkları tanımlı değilse makul değerler türet
    let shift = if s.shift_rpm > 0.0 { s.shift_rpm } else { s.redline * 0.95 };
    let first = if s.sl_first > 0.0 { s.sl_first } else { shift * 0.8 };
    Telemetry {
        gear: f.gear,
        speed: f.speed,
        rpm: f.rpm,
        sl_first: first,
        sl_shift: shift,
        sl_last: if s.sl_last > 0.0 { s.sl_last } else { shift },
        sl_blink: if s.sl_blink > 0.0 { s.sl_blink } else { s.redline },
        redline: s.redline,
        position: c.position,
        class_position: c.class_position,
        pos_change: if start > 0 && c.class_position > 0 { start - c.class_position } else { 0 },
        lap: f.lap,
        last: f.lap_last,
        best: f.lap_best,
        fuel_level: f.fuel_level,
        fuel_pct: f.fuel_pct,
        track_temp: f.track_temp,
        air_temp: f.air_temp,
        abs: f.abs_setting,
        abs_active: f.abs_active,
        tc_active: f.tc_active,
        tc: f.tc,
        brake_bias: f.brake_bias,
        oil_temp: f.oil_temp,
        water_temp: f.water_temp,
        on_pit_road: f.on_pit_road,
    }
}

pub fn delta(f: &Frame, t: &Tracker) -> Delta {
    Delta {
        delta: f.delta_best,
        valid: f.delta_best_ok,
        trend: t.trend.trend(),
        current: f.lap_cur,
        last: f.lap_last,
        best: f.lap_best,
        session_delta: f.delta_session,
        session_valid: f.delta_session_ok,
        optimal_delta: f.delta_optimal,
        optimal_valid: f.delta_optimal_ok,
    }
}

/// Oyuncunun önündeki ve arkasındaki `n` aracı pist üzerindeki fiziksel sıraya göre verir.
pub fn relative(f: &Frame, s: &SessionData, t: &Tracker, n: usize) -> Relative {
    let mut out = Relative {
        air_temp: f.air_temp,
        track_temp: f.track_temp,
        wetness: f.track_wetness,
        humidity: f.humidity,
        precip: f.precip,
        incidents: f.incidents,
        incident_limit: s.incident_limit,
        time_remain: f.session_time_remain,
        laps_remain: f.session_laps_remain,
        ..Default::default()
    };
    if f.player_idx < 0 || f.player_idx as usize >= MAX_CARS {
        return out;
    }
    let me = f.player_idx as usize;
    let my = f.cars[me];
    if my.pct < 0.0 {
        return out;
    }
    let my_class = s.driver(me).map(|d| d.class_id).unwrap_or(0);
    out.sof = sof(
        &(0..MAX_CARS)
            .filter(|&i| active(f, s, i) && s.driver(i).map(|d| d.class_id == my_class).unwrap_or(false))
            .filter_map(|i| s.driver(i).map(|d| d.irating))
            .collect::<Vec<_>>(),
    );
    let irs = ir_map(f, s);
    let lap_t = ref_lap_time(f, s);
    let race = s.is_race(f.session_num);
    let mut list: Vec<(f32, usize, i32)> = Vec::with_capacity(MAX_CARS);
    for i in 0..MAX_CARS {
        if i != me && !active(f, s, i) {
            continue;
        }
        let c = f.cars[i];
        let mut dp = c.pct - my.pct;
        if dp > 0.5 {
            dp -= 1.0;
        } else if dp < -0.5 {
            dp += 1.0;
        }
        let mut dt = c.est_time - my.est_time;
        if dp > 0.0 && dt < 0.0 {
            dt += lap_t;
        } else if dp < 0.0 && dt > 0.0 {
            dt -= lap_t;
        }
        if dt.abs() > lap_t {
            dt = dp * lap_t;
        }
        let lap_rel = if race && i != me {
            let diff = (c.lap as f32 + c.pct) - (my.lap as f32 + my.pct);
            // Tam tur farkı: +1/+2 beni turlayanlar, −1/−2 turladıklarım
            if diff.abs() > 0.5 {
                diff.round() as i32
            } else {
                0
            }
        } else {
            0
        };
        list.push((if i == me { 0.0 } else { dt }, i, lap_rel));
    }
    list.sort_by(|a, b| b.0.total_cmp(&a.0));
    let me_pos = list.iter().position(|x| x.1 == me).unwrap_or(0);
    let from = me_pos.saturating_sub(n);
    let to = (me_pos + n + 1).min(list.len());
    out.rows = list[from..to]
        .iter()
        .map(|&(gap, i, lr)| {
            let mut r = base_row(f, s, t, i);
            r.gap = gap;
            r.lap_rel = lr;
            r.ir_delta = irs[i];
            r
        })
        .collect();
    out
}

pub fn standings(f: &Frame, s: &SessionData, t: &Tracker) -> Standings {
    let race = s.is_race(f.session_num);
    let entry = s.session(f.session_num);
    // Sunucudan çıkan sürücüler de listede kalır: araç dünyada yoktur (pct < 0) ama resmi sırası durur. Yoksa yarışı
    // bitirip çıkanlar tablodan düşer, podyum da "o an sunucuda kim varsa" ona göre dizilirdi.
    let left = |i: usize| f.cars[i].pct < 0.0 && f.cars[i].position > 0 && s.driver(i).is_some_and(|d| !d.is_pace_car && !d.is_spectator);
    let mut idxs: Vec<usize> =
        (0..MAX_CARS).filter(|&i| active(f, s, i) || left(i) || (i as i32 == f.player_idx && f.cars[i].pct >= 0.0)).collect();
    let has_pos = idxs.iter().any(|&i| f.cars[i].position > 0);
    if has_pos {
        idxs.sort_by_key(|&i| {
            let p = f.cars[i].position;
            if p > 0 {
                p
            } else {
                1000 + i as i32
            }
        });
    } else {
        // Henüz resmi sıralama yok: en iyi tura, o da yoksa pistteki mesafeye göre
        idxs.sort_by(|&a, &b| {
            let ka = if f.cars[a].best > 0.0 { f.cars[a].best } else { 1e6 - (f.cars[a].lap as f32 + f.cars[a].pct) };
            let kb = if f.cars[b].best > 0.0 { f.cars[b].best } else { 1e6 - (f.cars[b].lap as f32 + f.cars[b].pct) };
            ka.total_cmp(&kb)
        });
    }
    let irs = ir_map(f, s);

    // Sınıf bazında en iyi tur
    let mut class_best: Vec<(i32, f32)> = Vec::new();
    for &i in &idxs {
        let cid = s.driver(i).map(|d| d.class_id).unwrap_or(0);
        let b = f.cars[i].best;
        if b <= 0.0 {
            continue;
        }
        match class_best.iter_mut().find(|x| x.0 == cid) {
            Some(x) if b < x.1 => x.1 = b,
            Some(_) => {}
            None => class_best.push((cid, b)),
        }
    }

    let mut rows: Vec<Row> = Vec::with_capacity(idxs.len());
    let mut classes: Vec<ClassInfo> = Vec::new();
    let mut class_irs: Vec<(i32, Vec<i32>)> = Vec::new();
    let mut class_leader: Vec<(i32, usize)> = Vec::new();
    let mut class_prev: Vec<(i32, usize)> = Vec::new();
    let mut class_seen: Vec<(i32, i32)> = Vec::new();
    for (n, &i) in idxs.iter().enumerate() {
        let mut r = base_row(f, s, t, i);
        r.ir_delta = irs[i];
        if left(i) {
            r.gone = true;
            r.on_pit = false;
            r.pit_state = String::new();
        }
        if !has_pos {
            r.pos = n as i32 + 1;
        }
        let c = f.cars[i];
        let leader = match class_leader.iter().find(|x| x.0 == r.class_id) {
            Some(x) => x.1,
            None => {
                class_leader.push((r.class_id, i));
                classes.push(ClassInfo {
                    id: r.class_id,
                    name: r.class_name.clone(),
                    color: r.class_color.clone(),
                    ..Default::default()
                });
                i
            }
        };
        if let Some(ci) = classes.iter_mut().find(|x| x.id == r.class_id) {
            ci.count += 1;
        }
        match class_irs.iter_mut().find(|x| x.0 == r.class_id) {
            Some(x) => x.1.push(r.irating),
            None => class_irs.push((r.class_id, vec![r.irating])),
        }
        let prev = class_prev.iter().find(|x| x.0 == r.class_id).map(|x| x.1);
        if race {
            let lc = f.cars[leader];
            r.laps_down = (lc.lap_completed - c.lap_completed).max(0);
            r.gap = (c.f2 - lc.f2).max(0.0);
            r.interval = match prev {
                Some(p) => (c.f2 - f.cars[p].f2).max(0.0),
                None => 0.0,
            };
        } else {
            let lb = f.cars[leader].best;
            r.gap = if c.best > 0.0 && lb > 0.0 { c.best - lb } else { 0.0 };
            r.interval = match prev {
                Some(p) if c.best > 0.0 && f.cars[p].best > 0.0 => c.best - f.cars[p].best,
                _ => 0.0,
            };
        }
        r.class_best = class_best.iter().any(|x| x.0 == r.class_id && c.best > 0.0 && (x.1 - c.best).abs() < 1e-4);
        let nth = match class_seen.iter_mut().find(|x| x.0 == r.class_id) {
            Some(x) => {
                x.1 += 1;
                x.1
            }
            None => {
                class_seen.push((r.class_id, 1));
                1
            }
        };
        if !has_pos || r.class_pos <= 0 {
            r.class_pos = nth;
        }
        match class_prev.iter_mut().find(|x| x.0 == r.class_id) {
            Some(x) => x.1 = i,
            None => class_prev.push((r.class_id, i)),
        }
        rows.push(r);
    }
    for ci in classes.iter_mut() {
        if let Some(x) = class_irs.iter().find(|x| x.0 == ci.id) {
            ci.sof = sof(&x.1);
        }
    }
    let total_time = entry.and_then(|e| e.time).unwrap_or(0.0);
    let leader_lap = idxs.first().map(|&i| f.cars[i].lap).unwrap_or(0);
    Standings {
        car_count: rows.len() as i32,
        rows,
        multiclass: s.class_count() > 1,
        race,
        session_type: entry.map(|e| e.kind.clone()).unwrap_or_default(),
        elapsed: f.session_time,
        total_time,
        time_remain: f.session_time_remain,
        laps_remain: f.session_laps_remain,
        total_laps: entry.and_then(|e| e.laps).unwrap_or(0),
        leader_lap,
        classes,
    }
}

pub fn radar(f: &Frame, s: &SessionData) -> Radar {
    let mut r = Radar { state: f.car_left_right, ..Default::default() };
    // Demo: sanal yan araçlar hazır gelir
    if let Some(sc) = &f.demo_side_cars {
        for &(side, off) in sc {
            r.cars.push(RadarCar { side, offset: off });
            if side == 0 || off.abs() > 4.8 {
                if off >= 0.0 {
                    r.ahead_m = Some(r.ahead_m.map_or(off, |a| a.min(off)));
                } else {
                    r.behind_m = Some(r.behind_m.map_or(-off, |b| b.min(-off)));
                }
            }
        }
        return r;
    }
    if f.player_idx < 0 || s.track_length_km <= 0.0 {
        return r;
    }
    let me = f.player_idx as usize;
    let my = f.cars[me].pct;
    if my < 0.0 {
        return r;
    }
    let len_m = s.track_length_km * 1000.0;
    let mut near: Vec<f32> = Vec::new();
    for i in 0..MAX_CARS {
        if i == me || !active(f, s, i) || f.cars[i].on_pit {
            continue;
        }
        let mut dp = f.cars[i].pct - my;
        if dp > 0.5 {
            dp -= 1.0;
        } else if dp < -0.5 {
            dp += 1.0;
        }
        let m = dp * len_m;
        if m >= 0.0 {
            if r.ahead_m.map(|a| m < a).unwrap_or(true) {
                r.ahead_m = Some(m);
            }
        } else if r.behind_m.map(|b| -m < b).unwrap_or(true) {
            r.behind_m = Some(-m);
        }
        if m.abs() < 25.0 {
            near.push(m);
        }
    }
    // iRacing yan araçların yanal konumunu vermez; CarLeftRight'a göre en yakın
    // araçları yanlara, kalanları öne/arkaya yerleştiriyoruz.
    near.sort_by(|a, b| a.abs().total_cmp(&b.abs()));
    let (mut left, mut right) = match f.car_left_right {
        2 => (1, 0),
        3 => (0, 1),
        4 => (1, 1),
        5 => (2, 0),
        6 => (0, 2),
        _ => (0, 0),
    };
    for m in near {
        let side = if m.abs() < 6.0 && left > 0 {
            left -= 1;
            -1
        } else if m.abs() < 6.0 && right > 0 {
            right -= 1;
            1
        } else {
            0
        };
        r.cars.push(RadarCar { side, offset: m });
    }
    r
}

/// Yakıt hesabı: son tur / ort. 5 / ort. 10 / en kötü tüketimle ayrı ayrı.
pub fn fuel(f: &Frame, s: &SessionData, t: &Tracker) -> Fuel {
    let ft = &t.fuel;
    let max = s.fuel_max_ltr * s.max_fuel_pct.max(0.01);
    let lap_time = {
        let a = ft.avg_lap(5);
        if a > 0.0 {
            a
        } else if f.lap_best > 0.0 {
            f.lap_best
        } else {
            s.est_lap_time.max(60.0)
        }
    };
    let frac_left = (1.0 - f.lap_dist_pct).clamp(0.0, 1.0);
    let race_laps_left = if f.session_laps_remain > 0 && f.session_laps_remain < 32767 {
        (f.session_laps_remain as f32 - 1.0 + frac_left).max(frac_left)
    } else if f.session_time_remain > 0.0 && f.session_time_remain < 604800.0 {
        let after = (f.session_time_remain as f32 - frac_left * lap_time).max(0.0);
        // Süre bitince içinde bulunulan tur da tamamlanır
        frac_left + (after / lap_time).ceil()
    } else {
        0.0
    };
    let row = |usage: f32| -> FuelRow {
        if usage <= 0.0 {
            return FuelRow::default();
        }
        FuelRow {
            usage,
            laps: f.fuel_level / usage,
            stint: if max > 0.0 { max / usage } else { 0.0 },
            refuel: (race_laps_left * usage - f.fuel_level).max(0.0),
        }
    };
    let avg5 = ft.avg_use(5);
    let laps_of_fuel = if avg5 > 0.0 { f.fuel_level / avg5 } else { 0.0 };
    let mut targets = Vec::new();
    if avg5 > 0.0 {
        let base = laps_of_fuel.floor() as i32;
        for k in 1..=3 {
            let n = base + k;
            if n > 0 {
                targets.push((n, f.fuel_level / n as f32));
            }
        }
    }
    // Pit penceresi (tek duraklı): en erken = bitişe dolu depoyla yetişebileceğin tur,
    // en geç = yakıtın bittiği tur
    let (mut pit_open, mut pit_close, mut open_in, mut close_in) = (0, 0, 0.0, 0.0);
    if avg5 > 0.0 && race_laps_left > laps_of_fuel && max > 0.0 {
        let full_laps = max / avg5;
        let cur = f.lap_completed as f32 + f.lap_dist_pct;
        let earliest = (cur + race_laps_left - full_laps).max(cur);
        let latest = cur + laps_of_fuel;
        pit_open = earliest.ceil() as i32 + 1;
        pit_close = latest.floor() as i32 + 1;
        open_in = (earliest - cur) * lap_time;
        close_in = (latest - cur) * lap_time;
    }
    Fuel {
        level: f.fuel_level,
        pct: f.fuel_pct,
        max,
        lap: f.lap,
        last: row(ft.history.back().copied().unwrap_or(0.0)),
        avg5: row(avg5),
        avg10: row(ft.avg_use(10)),
        worst: row(ft.max_use(10)),
        race_laps_left,
        race_needed: race_laps_left * avg5,
        stint_time: (f.session_time - ft.stint_start).max(0.0),
        lap_time,
        time_to_empty: laps_of_fuel * lap_time,
        targets,
        pit_open,
        pit_close,
        pit_open_in: open_in,
        pit_close_in: close_in,
        samples: ft.history.len(),
    }
}

pub fn weather(f: &Frame) -> Weather {
    Weather {
        air_temp: f.air_temp,
        track_temp: f.track_temp,
        wind_dir: f.wind_dir,
        wind_vel: f.wind_vel,
        heading: f.yaw_north,
        humidity: f.humidity,
        precip: f.precip,
        wetness: f.track_wetness,
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TireCorner {
    /// Sol / orta / sağ yüzey sıcaklığı (°C)
    pub temp: [f32; 3],
    /// Kalan diş (0..1), bilinmiyorsa -1
    pub wear: [f32; 3],
    /// Soğuk basınç (kPa)
    pub press: f32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tires {
    /// LF, RF, LR, RR
    pub corners: Vec<TireCorner>,
    /// -1 bilinmiyor, 0 kuru, 1+ ıslak
    pub compound: i32,
    pub available: bool,
    pub on_pit: bool,
}

pub fn tires(f: &Frame) -> Tires {
    let corners: Vec<TireCorner> =
        (0..4).map(|i| TireCorner { temp: f.tire_temp[i], wear: f.tire_wear[i], press: f.tire_press[i] }).collect();
    let available = corners.iter().any(|c| c.wear[1] >= 0.0 || c.temp[1] > 0.0);
    Tires { corners, compound: f.tire_compound, available, on_pit: f.on_pit_road }
}

pub fn decode_flags(bits: u32) -> Vec<&'static str> {
    const TABLE: [(u32, &str); 16] = [
        (0x0001, "checkered"),
        (0x0002, "white"),
        (0x0004, "green"),
        (0x0008, "yellow"),
        (0x0010, "red"),
        (0x0020, "blue"),
        (0x0040, "debris"),
        // irsdk_Flags: 0x0100 yellowWaving, 0x0200 oneLapToGreen, 0x0400 greenHeld
        // (eskiden 0x0100 yanlışlıkla "greenHeld" sayılıyordu: dalgalanan sarı yeşil görünüyordu)
        (0x0100, "yellowWaving"),
        (0x0200, "oneLapToGreen"),
        (0x0400, "greenHeld"),
        (0x4000, "caution"),
        (0x8000, "cautionWaving"),
        (0x0001_0000, "black"),
        (0x0002_0000, "disqualify"),
        (0x0008_0000, "furled"),
        (0x0010_0000, "repair"),
    ];
    // Dalgalanan sarı aynı zamanda "yellow" olarak da bildirilir (bu adı bilmeyen tüketiciler için)
    let bits = if bits & 0x0100 != 0 { bits | 0x0008 } else { bits };
    TABLE.iter().filter(|(b, _)| bits & b != 0).map(|(_, n)| *n).collect()
}

pub fn session(f: &Frame, s: &SessionData) -> Session {
    let me = f.player_idx.max(0) as usize;
    let entry = s.session(f.session_num);
    let car_count = (0..MAX_CARS).filter(|&i| active(f, s, i)).count() as i32;
    // Oyuncuya özel bayraklar (siyah, hasar) oturum bayraklarına eklenir
    let mut bits = f.session_flags;
    if let Some(c) = f.cars.get(me) {
        bits |= c.flags & (CF_BLACK | CF_DQ | CF_REPAIR | CF_FURLED);
    }
    let penalty = if bits & CF_DQ != 0 || f.penalty == 3 {
        "disqualify"
    } else {
        match f.penalty {
            1 => "driveThrough",
            2 => "stopGo",
            4 => "timePenalty",
            5 => "penalty",
            _ if bits & CF_BLACK != 0 => "black",
            _ if bits & CF_REPAIR != 0 => "repair",
            _ if bits & CF_FURLED != 0 => "furled",
            _ => "",
        }
    };
    Session {
        session_type: entry.map(|e| e.kind.clone()).unwrap_or_default(),
        track: s.track_name.clone(),
        flags: decode_flags(bits),
        penalty,
        time_remain: f.session_time_remain,
        laps_remain: f.session_laps_remain,
        total_laps: entry.and_then(|e| e.laps).unwrap_or(0),
        lap: f.lap,
        laps_completed: f.lap_completed,
        position: f.cars.get(me).map(|c| c.position).unwrap_or(0),
        class_position: f.cars.get(me).map(|c| c.class_position).unwrap_or(0),
        car_count,
        air_temp: f.air_temp,
        track_temp: f.track_temp,
        wetness: f.track_wetness,
        incidents: f.incidents,
        incident_limit: s.incident_limit,
        brake_bias: f.brake_bias,
        tc: f.tc,
        abs: f.abs_setting,
        on_pit_road: f.on_pit_road,
        state: f.session_state,
        start_lights: start_lights(f.session_flags),
        start_lit: f.start_lit as i32,
        start_total: f.start_total as i32,
    }
}

/// Start ışığı aşaması (iRacing SessionFlags: 0x1000_0000 StartHidden, 0x2000_0000 StartReady, 0x4000_0000 StartSet,
/// 0x8000_0000 StartGo): -1 sim vermiyor, 0 ışıklar gizli, 1 hazır (kırmızılar yanıyor), 2 set, 3 yeşil.
/// Diğer simler aynı bitleri kendi verilerinden doldurur (bkz. sims/rf2.rs).
fn start_lights(bits: u32) -> i32 {
    if bits & 0x8000_0000 != 0 {
        3
    } else if bits & 0x4000_0000 != 0 {
        2
    } else if bits & 0x2000_0000 != 0 {
        1
    } else if bits & 0x1000_0000 != 0 {
        0
    } else {
        -1
    }
}

/// iRacing irsdk_furled: sarılı siyah bayrak (uyarı)
const CF_FURLED: u32 = 0x0008_0000;

/// Harita paketi. Şekil sadece `send_shape` true iken eklenir (her abone kendi takibini yapar).
pub fn map(f: &Frame, s: &SessionData, m: &TrackMap, send_shape: bool) -> MapData {
    let mut cars = Vec::new();
    for i in 0..MAX_CARS {
        if !active(f, s, i) && i as i32 != f.player_idx {
            continue;
        }
        let c = f.cars[i];
        if c.pct < 0.0 {
            continue;
        }
        let d = s.driver(i);
        cars.push(MapCar {
            idx: i as i32,
            number: d.map(|d| d.car_number.clone()).unwrap_or_default(),
            user_id: d.map(|d| d.user_id).unwrap_or(0),
            name: d.map(|d| d.name.clone()).unwrap_or_default(),
            pct: c.pct,
            color: d.map(|d| d.class_color.clone()).unwrap_or_default(),
            pos: c.position,
            class_pos: c.class_position,
            me: i as i32 == f.player_idx,
            pit: c.on_pit,
        });
    }
    // Oyuncu en üstte çizilsin
    cars.sort_by_key(|c| c.me);
    MapData {
        key: format!("{}", s.track_id),
        version: m.version,
        shape: if send_shape { m.shape.clone() } else { None },
        has_shape: m.shape.is_some(),
        progress: m.progress(),
        recording: m.recording(),
        pit: m.pit(),
        cars,
    }
}

pub fn race_control(t: &Tracker) -> RaceControl {
    RaceControl { events: t.events.iter().rev().take(80).cloned().collect() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::demo::Demo;

    #[test]
    fn sof_and_ir() {
        assert_eq!(sof(&[2000, 2000, 2000]), 2000);
        let d = ir_deltas(&[(3000, 1), (2000, 2), (1000, 3)]);
        // Favori kazanınca az, sürpriz kazanan çok puan alır
        assert!(d[0] > 0 && d[2] < 0, "{d:?}");
        let d2 = ir_deltas(&[(1000, 1), (2000, 2), (3000, 3)]);
        assert!(d2[0] > d[0], "{d2:?}");
    }

    #[test]
    fn demo_race_produces_sane_output() {
        let mut d = Demo::new();
        let mut f = Frame::default();
        let mut t = Tracker::default();
        let (h, l, st) = d.seed_history();
        t.fuel.seed(&h, &l, st);
        // 6 dakika simüle et (60 Hz)
        for _ in 0..(360 * 60) {
            d.step(1.0 / 60.0, &mut f);
            t.update(&f, d.session());
        }
        let s = d.session().clone();
        let rel = relative(&f, &s, &t, 3);
        // Önde/arkada yarım tur içinde araç yoksa satır azalabilir
        assert!(rel.rows.len() >= 4 && rel.rows.len() <= 7);
        assert!(rel.rows.iter().any(|r| r.is_me));
        assert!(rel.sof > 1000);
        for w in rel.rows.windows(2) {
            assert!(w[0].gap >= w[1].gap);
        }
        let st = standings(&f, &s, &t);
        assert_eq!(st.rows.len(), 24);
        assert!(st.multiclass);
        assert!(st.race);
        assert_eq!(st.classes.len(), 2);
        assert_eq!(st.rows[0].pos, 1);
        assert!(st.rows.iter().any(|r| r.avg5 > 0.0));
        let fu = fuel(&f, &s, &t);
        assert!(fu.samples >= 2, "yakıt örneği: {}", fu.samples);
        assert!(fu.avg5.usage > 1.0 && fu.avg5.usage < 5.0, "ortalama: {}", fu.avg5.usage);
        assert!(fu.race_laps_left > 5.0);
        assert_eq!(fu.targets.len(), 3);
        let se = session(&f, &s);
        assert!(se.flags.contains(&"green"));
        let ra = radar(&f, &s);
        assert!((1..=6).contains(&ra.state));
        let te = telemetry(&f, &s, &t);
        assert!(te.sl_first > 0.0 && te.sl_first < te.sl_shift);
        assert!(!t.events.is_empty(), "yarış kontrol olayı üretilmeli");
    }
}

