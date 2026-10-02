#![cfg_attr(not(windows), allow(dead_code))]
//! iRacing session YAML'ı için hafif, hataya dayanıklı ayrıştırıcı.
//!
//! iRacing'in YAML çıktısı her zaman geçerli YAML değildir (tırnaksız özel karakterli
//! takım/sürücü adları vb.). Tam bir YAML kütüphanesi yerine ihtiyacımız olan alanları
//! satır satır okuyoruz: hem hızlı hem de bozuk girdide çökmez.

use crate::model::{Driver, SessionData, SessionEntry, MAX_CARS};

fn indent(line: &str) -> usize {
    line.len() - line.trim_start_matches(' ').len()
}

fn clean(v: &str) -> &str {
    let v = v.trim();
    v.strip_prefix('"').and_then(|s| s.strip_suffix('"')).unwrap_or(v)
}

fn split_kv(s: &str) -> Option<(&str, &str)> {
    let i = s.find(':')?;
    Some((s[..i].trim(), clean(&s[i + 1..])))
}

fn num_prefix(v: &str) -> Option<f64> {
    // "6.93 km", "1800.0000 sec", "32.5 C" -> baştaki sayı
    let end = v
        .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+'))
        .unwrap_or(v.len());
    v[..end].parse().ok()
}

fn color(v: &str) -> String {
    // 0xffda59 -> #ffda59
    let hex = v.trim_start_matches("0x").trim_start_matches("0X");
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("#{}", hex.to_ascii_lowercase())
    } else {
        String::new()
    }
}

#[derive(PartialEq, Clone, Copy)]
enum List {
    None,
    Drivers,
    Sessions,
    Tires,
}

pub fn parse(yaml: &str) -> SessionData {
    let mut sd = SessionData {
        drivers: vec![None; MAX_CARS],
        player_idx: -1,
        max_fuel_pct: 1.0,
        ..Default::default()
    };
    let mut section = "";
    let mut list = List::None;
    let mut dash_col = usize::MAX;
    let mut cur_driver: Option<Driver> = None;
    let mut cur_sess: Option<SessionEntry> = None;
    let mut cur_tire: Option<(i32, String)> = None;

    let flush_driver = |d: Option<Driver>, sd: &mut SessionData| {
        if let Some(d) = d {
            let i = d.car_idx;
            if (0..MAX_CARS as i32).contains(&i) {
                sd.drivers[i as usize] = Some(d);
            }
        }
    };

    for raw in yaml.lines() {
        let line = raw.trim_end_matches('\r');
        if line.trim().is_empty() || line.trim() == "---" || line.trim() == "..." {
            continue;
        }
        let ind = indent(line);
        let body = &line[ind..];

        // Üst düzey bölüm başlığı
        if ind == 0 && !body.starts_with('-') {
            flush_driver(cur_driver.take(), &mut sd);
            if let Some(s) = cur_sess.take() {
                sd.sessions.push(s);
            }
            if let Some(t) = cur_tire.take() {
                sd.tire_types.push(t);
            }
            list = List::None;
            section = if body.ends_with(':') { &body[..body.len() - 1] } else { "" };
            if section.is_empty() {
                if let Some((k, _)) = split_kv(body) {
                    section = k;
                }
            }
            continue;
        }

        // Liste başlangıcı anahtarları
        if !body.starts_with('-') {
            if let Some((k, v)) = split_kv(body) {
                if v.is_empty() {
                    if section == "DriverInfo" && k == "Drivers" {
                        flush_driver(cur_driver.take(), &mut sd);
                        list = List::Drivers;
                        dash_col = usize::MAX;
                        continue;
                    }
                    if section == "DriverInfo" && k == "DriverTires" {
                        flush_driver(cur_driver.take(), &mut sd);
                        list = List::Tires;
                        dash_col = usize::MAX;
                        continue;
                    }
                    if section == "SessionInfo" && k == "Sessions" {
                        list = List::Sessions;
                        dash_col = usize::MAX;
                        continue;
                    }
                }
            }
        }

        // Liste öğesi mi?
        let (is_item, kv_text, kv_col) = if let Some(rest) = body.strip_prefix("- ") {
            (true, rest, ind + 2)
        } else {
            (false, body, ind)
        };

        if list != List::None {
            if is_item && dash_col == usize::MAX {
                dash_col = ind;
            }
            if is_item && ind == dash_col {
                match list {
                    List::Drivers => {
                        flush_driver(cur_driver.take(), &mut sd);
                        cur_driver = Some(Driver { car_idx: -1, ..Default::default() });
                    }
                    List::Sessions => {
                        if let Some(s) = cur_sess.take() {
                            sd.sessions.push(s);
                        }
                        cur_sess = Some(SessionEntry::default());
                    }
                    List::Tires => {
                        if let Some(t) = cur_tire.take() {
                            sd.tire_types.push(t);
                        }
                        cur_tire = Some((-1, String::new()));
                    }
                    List::None => {}
                }
            } else if dash_col != usize::MAX && kv_col < dash_col + 2 && ind <= dash_col {
                // Listeden çıkıldı (aynı bölümde başka bir anahtar)
                flush_driver(cur_driver.take(), &mut sd);
                if let Some(s) = cur_sess.take() {
                    sd.sessions.push(s);
                }
                if let Some(t) = cur_tire.take() {
                    sd.tire_types.push(t);
                }
                list = List::None;
            }

            // Sadece öğenin doğrudan alanlarını al (iç içe listeleri atla)
            if list != List::None && dash_col != usize::MAX && kv_col == dash_col + 2 {
                if let Some((k, v)) = split_kv(kv_text) {
                    match list {
                        List::Drivers => {
                            if let Some(d) = cur_driver.as_mut() {
                                match k {
                                    "CarIdx" => d.car_idx = v.parse().unwrap_or(-1),
                                    "UserName" => d.name = v.to_string(),
                                    "UserID" => d.user_id = v.parse().unwrap_or(0),
                                    "AbbrevName" => d.abbrev = v.to_string(),
                                    "CarNumber" => d.car_number = v.to_string(),
                                    "CarClassID" => d.class_id = v.parse().unwrap_or(0),
                                    "CarClassShortName" => d.class_name = v.to_string(),
                                    "CarClassColor" => d.class_color = color(v),
                                    "CarClassEstLapTime" => {
                                        d.class_est_lap = num_prefix(v).unwrap_or(0.0) as f32
                                    }
                                    "IRating" => d.irating = v.parse().unwrap_or(0),
                                    "LicString" => d.license = v.to_string(),
                                    "LicColor" => d.lic_color = color(v),
                                    "CarScreenNameShort" => d.car_name = v.to_string(),
                                    "CarPath" => d.car_path = v.to_string(),
                                    "CarID" => d.car_id = v.parse().unwrap_or(0),
                                    "FlairShortName" => d.flair = v.to_string(),
                                    "TeamName" => d.team_name = v.to_string(),
                                    "IsSpectator" => d.is_spectator = v == "1",
                                    "CarIsPaceCar" => d.is_pace_car = v == "1",
                                    "CarIsAI" => d.is_ai = v == "1",
                                    _ => {}
                                }
                            }
                        }
                        List::Sessions => {
                            if let Some(s) = cur_sess.as_mut() {
                                match k {
                                    "SessionNum" => s.num = v.parse().unwrap_or(0),
                                    "SessionType" => s.kind = v.to_string(),
                                    "SessionLaps" => s.laps = v.parse().ok(),
                                    "SessionTime" => s.time = num_prefix(v),
                                    _ => {}
                                }
                            }
                        }
                        List::Tires => {
                            if let Some(t) = cur_tire.as_mut() {
                                match k {
                                    "TireIndex" => t.0 = v.parse().unwrap_or(-1),
                                    "TireCompoundType" => t.1 = v.to_string(),
                                    _ => {}
                                }
                            }
                        }
                        List::None => {}
                    }
                }
                continue;
            }
            if list != List::None {
                continue;
            }
        }

        // Bölüm içi düz anahtarlar
        if ind > 0 && !is_item {
            if let Some((k, v)) = split_kv(body) {
                match (section, k) {
                    ("WeekendInfo", "TrackDisplayName") => sd.track_name = v.to_string(),
                    ("WeekendInfo", "TrackConfigName") => sd.track_config = v.to_string(),
                    ("WeekendInfo", "TrackLength") => {
                        sd.track_length_km = num_prefix(v).unwrap_or(0.0) as f32
                    }
                    ("DriverInfo", "DriverCarIdx") => sd.player_idx = v.parse().unwrap_or(-1),
                    ("DriverInfo", "DriverCarFuelMaxLtr") => {
                        sd.fuel_max_ltr = num_prefix(v).unwrap_or(0.0) as f32
                    }
                    ("DriverInfo", "DriverCarMaxFuelPct") => {
                        sd.max_fuel_pct = num_prefix(v).unwrap_or(1.0) as f32
                    }
                    ("DriverInfo", "DriverCarRedLine") => {
                        sd.redline = num_prefix(v).unwrap_or(0.0) as f32
                    }
                    ("DriverInfo", "DriverCarSLShiftRPM") => {
                        sd.shift_rpm = num_prefix(v).unwrap_or(0.0) as f32
                    }
                    ("DriverInfo", "DriverCarSLFirstRPM") => sd.sl_first = num_prefix(v).unwrap_or(0.0) as f32,
                    ("DriverInfo", "DriverCarSLLastRPM") => sd.sl_last = num_prefix(v).unwrap_or(0.0) as f32,
                    ("DriverInfo", "DriverCarSLBlinkRPM") => sd.sl_blink = num_prefix(v).unwrap_or(0.0) as f32,
                    ("WeekendInfo", "TrackPitSpeedLimit") => {
                        let n = num_prefix(v).unwrap_or(0.0) as f32;
                        sd.pit_limit_kph = if v.contains("mph") { n * 1.609_344 } else { n };
                    }
                    ("WeekendInfo", "IncidentLimit") => sd.incident_limit = v.parse().unwrap_or(0),
                    ("WeekendInfo", "LeagueID") => sd.league_id = v.parse().unwrap_or(0),
                    ("WeekendInfo", "TrackID") => sd.track_id = v.parse().unwrap_or(0),
                    ("WeekendInfo", "SeriesID") => sd.series_id = v.parse().unwrap_or(0),
                    ("WeekendInfo", "Category") => sd.category = v.to_string(),
                    ("DriverInfo", "DriverCarEstLapTime") => {
                        sd.est_lap_time = num_prefix(v).unwrap_or(0.0) as f32
                    }
                    _ => {}
                }
            }
        }
    }
    flush_driver(cur_driver.take(), &mut sd);
    if let Some(s) = cur_sess.take() {
        sd.sessions.push(s);
    }
    if let Some(t) = cur_tire.take() {
        sd.tire_types.push(t);
    }
    sd.tire_types.retain(|(i, _)| *i >= 0);
    sd
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "---
WeekendInfo:
 TrackName: spa 2024 up
 TrackDisplayName: Circuit de Spa-Francorchamps
 TrackConfigName: Grand Prix Pits
 TrackLength: 6.93 km
 TrackID: 163
 Category: Road
 WeekendOptions:
  IncidentLimit: 25
SessionInfo:
 Sessions:
 - SessionNum: 0
   SessionLaps: unlimited
   SessionTime: 600.0000 sec
   SessionType: Practice
   ResultsPositions:
   - Position: 1
     CarIdx: 3
   - Position: 2
     CarIdx: 1
 - SessionNum: 2
   SessionLaps: 25
   SessionTime: unlimited
   SessionType: Race
DriverInfo:
 DriverCarIdx: 1
 DriverCarFuelMaxLtr: 120.000
 DriverCarRedLine: 7500.000
 DriverCarSLShiftRPM: 7200.000
 DriverTires:
 - TireIndex: 0
   TireCompoundType: \"Hard\"
 - TireIndex: 1
   TireCompoundType: \"Wet\"
 Drivers:
 - CarIdx: 0
   UserName: Pace Car
   CarIsPaceCar: 1
 - CarIdx: 1
   UserName: Erkin Azcan
   CarNumber: \"7\"
   CarClassID: 4029
   CarClassShortName: GT3 Class
   CarPath: porsche992rgt3
   FlairShortName: TR
   CarClassColor: 0xFFDA59
   CarClassEstLapTime: 137.4561
   IRating: 2450
   LicString: A 3.45
   LicColor: 0x0153db
   TeamName: Team: with colon
 - CarIdx: 3
   UserName: Other Driver
   CarNumber: 44
   IRating: 1800
SplitTimeInfo:
 Sectors:
 - SectorNum: 0
";

    #[test]
    fn parses_sample() {
        let sd = parse(SAMPLE);
        assert_eq!(sd.track_name, "Circuit de Spa-Francorchamps");
        assert!((sd.track_length_km - 6.93).abs() < 1e-4);
        assert_eq!(sd.player_idx, 1);
        assert_eq!(sd.fuel_max_ltr, 120.0);
        assert_eq!(sd.shift_rpm, 7200.0);
        assert_eq!(sd.sessions.len(), 2);
        assert_eq!(sd.sessions[0].kind, "Practice");
        assert_eq!(sd.sessions[0].time, Some(600.0));
        assert_eq!(sd.sessions[1].laps, Some(25));
        assert!(sd.is_race(2));
        let me = sd.driver(1).unwrap();
        assert_eq!(me.name, "Erkin Azcan");
        assert_eq!(me.car_number, "7");
        assert_eq!(me.class_color, "#ffda59");
        assert_eq!(me.irating, 2450);
        assert_eq!(me.team_name, "Team: with colon");
        assert_eq!(me.car_path, "porsche992rgt3");
        assert_eq!(me.flair, "TR");
        assert_eq!(sd.incident_limit, 25);
        assert_eq!(sd.track_id, 163);
        assert_eq!(sd.category, "Road");
        assert!(sd.driver(0).unwrap().is_pace_car);
        assert_eq!(sd.driver(3).unwrap().name, "Other Driver");
        // İç içe ResultsPositions içindeki CarIdx sürücü oluşturmamalı
        assert!(sd.driver(2).is_none());
        assert_eq!(sd.tire_types, vec![(0, "Hard".to_string()), (1, "Wet".to_string())]);
        // Tek kuru hamur: "Hard" yerine kuru (D); 1 = yağmur
        let mut c = crate::model::CarState { tire: 0, ..Default::default() };
        assert_eq!(crate::model::tire_kind(&c, &sd, true), b'D');
        c.tire = 1;
        assert_eq!(crate::model::tire_kind(&c, &sd, true), b'W');
        c.tire = -1;
        assert_eq!(crate::model::tire_kind(&c, &sd, true), 0);
        c.tire_kind = b'S';
        assert_eq!(crate::model::tire_kind(&c, &sd, false), b'S');
    }
}
