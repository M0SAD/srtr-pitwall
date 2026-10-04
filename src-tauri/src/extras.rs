//! Ek hesaplar: pit hız sınırı, arkadan gelen trafik (daha hızlı sınıf uyarısı ve
//! pist dışından güvenli dönüş yardımcısı).

use crate::calc::{active, ref_lap_time};
use crate::model::{Frame, SessionData, MAX_CARS};
use serde::Serialize;

/// EngineWarnings: pit hız sınırlayıcı açık
const EW_PIT_LIMITER: u32 = 0x10;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Pit {
    /// m/s
    pub speed: f32,
    /// Hız sınırı (m/s), bilinmiyorsa 0
    pub limit: f32,
    pub limiter: bool,
    pub on_pit_road: bool,
    /// Pit girişine yaklaşıyor (iRacing "AproachingPits")
    pub approaching: bool,
    pub in_stall: bool,
}

pub fn pit(f: &Frame, s: &SessionData) -> Pit {
    let me = (f.player_idx >= 0 && (f.player_idx as usize) < MAX_CARS).then(|| f.cars[f.player_idx as usize]);
    Pit {
        speed: f.speed,
        limit: s.pit_limit_kph / 3.6,
        limiter: f.engine_warnings & EW_PIT_LIMITER != 0,
        on_pit_road: f.on_pit_road,
        approaching: me.map(|c| c.surface == 2).unwrap_or(false),
        in_stall: me.map(|c| c.surface == 1).unwrap_or(false),
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrafficCar {
    pub idx: i32,
    pub number: String,
    pub name: String,
    pub class_name: String,
    pub class_color: String,
    /// Süre farkı (sn): + arkada, − önde
    pub gap: f32,
    /// Mesafe (m): + arkada
    pub meters: f32,
    /// Sınıfı bizimkinden belirgin şekilde hızlı
    pub faster: bool,
    /// Aynı sınıf
    pub same_class: bool,
    pub on_pit: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Traffic {
    /// m/s
    pub speed: f32,
    /// Oyuncu pist dışında (TrackSurface 0)
    pub off_track: bool,
    pub on_pit_road: bool,
    pub on_track: bool,
    pub multiclass: bool,
    pub my_class_color: String,
    /// Arkadan yaklaşan ve hemen öndeki araçlar, en yakından uzağa
    pub cars: Vec<TrafficCar>,
}

pub fn traffic(f: &Frame, s: &SessionData) -> Traffic {
    let mut out = Traffic {
        speed: f.speed,
        on_pit_road: f.on_pit_road,
        on_track: f.is_on_track,
        multiclass: s.class_count() > 1,
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
    out.off_track = my.surface == 0;
    let my_d = s.driver(me);
    let my_class = my_d.map(|d| d.class_id).unwrap_or(0);
    let my_est = my_d.map(|d| d.class_est_lap).unwrap_or(0.0);
    out.my_class_color = my_d.map(|d| d.class_color.clone()).unwrap_or_default();
    let lap_t = ref_lap_time(f, s).max(1.0);
    let len_m = (s.track_length_km * 1000.0).max(1.0);

    for i in 0..MAX_CARS {
        if i == me || !active(f, s, i) {
            continue;
        }
        let c = f.cars[i];
        if c.pct < 0.0 {
            continue;
        }
        let Some(d) = s.driver(i) else { continue };
        // + ise o araç arkada
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
        if dt.abs() > lap_t * 0.5 {
            dt = dp * lap_t;
        }
        // Arkada 12 sn, önde 3 sn penceresi
        if !(-3.0..=12.0).contains(&dt) {
            continue;
        }
        let same = d.class_id == my_class;
        let faster = !same && my_est > 0.0 && d.class_est_lap > 0.0 && d.class_est_lap < my_est * 0.985;
        out.cars.push(TrafficCar {
            idx: i as i32,
            number: d.car_number.clone(),
            name: d.name.clone(),
            class_name: d.class_name.clone(),
            class_color: d.class_color.clone(),
            gap: dt,
            meters: dp * len_m,
            faster,
            same_class: same,
            on_pit: c.on_pit,
        });
    }
    out.cars.sort_by(|a, b| a.gap.abs().total_cmp(&b.gap.abs()));
    out.cars.truncate(10);
    out
}
