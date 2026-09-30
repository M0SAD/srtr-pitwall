//! League Builder: lig yarışlarında iRacing sınıflarının yerine ligin kendi kategorilerini
//! (ör. Pro / Pro-Am / Am) kullanmak.
//!
//! Arayüzde hazırlanan yapılandırma ayarlarla gelir. Aktifse oturumun sürücü listesinin bir
//! kopyasında sınıf kimliği, adı ve rengi ligin kategorisiyle değiştirilir; sınıf içi sıralar
//! her karede bu kategorilere göre yeniden hesaplanır. Tüm overlay'ler (Leaderboard, Relative,
//! harita, Live Timing...) değişiklik yapmadan lig kategorilerini görür.

use crate::model::{Frame, SessionData, MAX_CARS};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Tier {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LeagueConfig {
    pub id: String,
    pub name: String,
    /// iRacing lig kimliği. 0: her oturumda uygula
    pub league_id: i64,
    pub tiers: Vec<Tier>,
    /// iRacing sınıf adı -> kategori kimliği (atanmamış sürücüler için varsayılan)
    pub class_defaults: HashMap<String, String>,
    /// Araç numarası -> kategori kimliği
    pub assignments: HashMap<String, String>,
}

/// Lig kategorilerine verilen sınıf kimlikleri (iRacing sınıf kimlikleriyle çakışmasın)
const TIER_BASE: i32 = 900_000;

impl LeagueConfig {
    pub fn applies_to(&self, s: &SessionData) -> bool {
        !self.tiers.is_empty() && (self.league_id == 0 || self.league_id == s.league_id)
    }

    fn tier_for(&self, number: &str, class_name: &str) -> Option<(usize, &Tier)> {
        let id = self.assignments.get(number).or_else(|| self.class_defaults.get(class_name))?;
        self.tiers.iter().enumerate().find(|(_, t)| &t.id == id)
    }
}

/// Ham oturumdan overlay'lerin kullanacağı oturumu üretir. Yapılandırma yoksa ya da bu oturuma
/// uymuyorsa sadece orijinal sınıf alanları doldurulur.
pub fn apply(raw: &SessionData, cfg: Option<&LeagueConfig>) -> (SessionData, bool) {
    let mut s = raw.clone();
    for d in s.drivers.iter_mut().flatten() {
        d.orig_class_name = d.class_name.clone();
        d.orig_class_color = d.class_color.clone();
    }
    let Some(cfg) = cfg.filter(|c| c.applies_to(raw)) else { return (s, false) };
    for d in s.drivers.iter_mut().flatten() {
        if d.is_pace_car || d.is_spectator {
            continue;
        }
        if let Some((n, t)) = cfg.tier_for(&d.car_number, &d.orig_class_name) {
            d.class_id = TIER_BASE + n as i32;
            d.class_name = t.name.clone();
            if !t.color.is_empty() {
                d.class_color = t.color.clone();
            }
        }
    }
    (s, true)
}

/// Sınıf içi sıraları lig kategorilerine göre yeniden hesapla (genel sıra korunur).
pub fn reposition(f: &mut Frame, s: &SessionData) {
    let mut order: Vec<(i32, i32, usize)> = Vec::with_capacity(MAX_CARS);
    for i in 0..MAX_CARS {
        let p = f.cars[i].position;
        if p <= 0 {
            continue;
        }
        if let Some(d) = s.driver(i) {
            order.push((d.class_id, p, i));
        }
    }
    order.sort_unstable();
    let mut cur = i32::MIN;
    let mut n = 0;
    for (cid, _, i) in order {
        if cid != cur {
            cur = cid;
            n = 0;
        }
        n += 1;
        f.cars[i].class_position = n;
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub idx: i32,
    pub user_id: i64,
    pub number: String,
    pub name: String,
    pub car_name: String,
    pub irating: i32,
    pub orig_class: String,
    pub orig_color: String,
    pub class_name: String,
    pub class_color: String,
}

/// League Builder sayfası için: oturumdaki sürücüler ve algılanan lig
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entries {
    pub league_id: i64,
    pub active: bool,
    pub drivers: Vec<Entry>,
}

pub fn entries(s: &SessionData, active: bool) -> Entries {
    let mut drivers: Vec<Entry> = s
        .drivers
        .iter()
        .flatten()
        .filter(|d| !d.is_pace_car && !d.is_spectator)
        .map(|d| Entry {
            idx: d.car_idx,
            user_id: d.user_id,
            number: d.car_number.clone(),
            name: d.name.clone(),
            car_name: d.car_name.clone(),
            irating: d.irating,
            orig_class: d.orig_class_name.clone(),
            orig_color: d.orig_class_color.clone(),
            class_name: d.class_name.clone(),
            class_color: d.class_color.clone(),
        })
        .collect();
    drivers.sort_by(|a, b| b.irating.cmp(&a.irating));
    Entries { league_id: s.league_id, active, drivers }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Driver;

    fn session() -> SessionData {
        let mut s = SessionData { league_id: 42, ..Default::default() };
        s.drivers = vec![None; MAX_CARS];
        for i in 0..4 {
            s.drivers[i] = Some(Driver {
                car_idx: i as i32,
                car_number: format!("{}", i + 1),
                class_id: 10,
                class_name: "GT3".into(),
                class_color: "#33ceff".into(),
                ..Default::default()
            });
        }
        s
    }

    #[test]
    fn tiers_and_positions() {
        let raw = session();
        let mut cfg = LeagueConfig {
            league_id: 42,
            tiers: vec![
                Tier { id: "pro".into(), name: "Pro".into(), color: "#ff0000".into() },
                Tier { id: "am".into(), name: "Am".into(), color: "#00ff00".into() },
            ],
            ..Default::default()
        };
        cfg.class_defaults.insert("GT3".into(), "am".into());
        cfg.assignments.insert("2".into(), "pro".into());
        cfg.assignments.insert("4".into(), "pro".into());
        let (s, active) = apply(&raw, Some(&cfg));
        assert!(active);
        assert_eq!(s.driver(1).unwrap().class_name, "Pro");
        assert_eq!(s.driver(0).unwrap().class_name, "Am");
        assert_eq!(s.driver(0).unwrap().orig_class_name, "GT3");

        let mut f = Frame::default();
        for i in 0..4 {
            f.cars[i].position = i as i32 + 1;
        }
        reposition(&mut f, &s);
        assert_eq!(f.cars[1].class_position, 1); // #2 Pro'da birinci
        assert_eq!(f.cars[3].class_position, 2);
        assert_eq!(f.cars[0].class_position, 1); // #1 Am'de birinci
        assert_eq!(f.cars[2].class_position, 2);

        // Başka lig: uygulanmaz
        cfg.league_id = 7;
        let (s2, active2) = apply(&raw, Some(&cfg));
        assert!(!active2);
        assert_eq!(s2.driver(1).unwrap().class_name, "GT3");
    }
}
