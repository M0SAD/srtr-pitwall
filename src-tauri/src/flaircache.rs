#![cfg_attr(not(windows), allow(dead_code))]
//! Sürücü ülkesi önbelleği: iRacing tekrar (replay) oturum bilgisinde sürücülerin ülkesini (FlairName) göndermiyor.
//! Canlı oturumlarda görülen her sürücünün ülkesi üye numarasıyla (UserID) diske yazılır; ülkesi gelmeyen
//! oturumda (tekrar) bilinen sürücülere önbellekten bayrak verilir.

use crate::model::SessionData;
use std::collections::HashMap;
use std::sync::Mutex;

const FILE: &str = "flags-cache.json";
const MAX: usize = 20_000;

struct Cache {
    map: HashMap<i64, String>,
    loaded: bool,
    dirty: bool,
}

static CACHE: std::sync::LazyLock<Mutex<Cache>> = std::sync::LazyLock::new(|| {
    Mutex::new(Cache {
        map: HashMap::new(),
        loaded: false,
        dirty: false,
    })
});

fn path() -> Option<std::path::PathBuf> {
    crate::crashlog::data_dir().map(|d| d.join(FILE))
}

fn load(c: &mut Cache) {
    if c.loaded {
        return;
    }
    c.loaded = true;
    let Some(p) = path() else { return };
    if let Ok(t) = std::fs::read_to_string(p) {
        if let Ok(m) = serde_json::from_str::<HashMap<String, String>>(&t) {
            for (k, v) in m {
                if let Ok(id) = k.parse::<i64>() {
                    c.map.insert(id, v);
                }
            }
        }
    }
}

fn save(c: &mut Cache) {
    if !c.dirty {
        return;
    }
    c.dirty = false;
    let Some(p) = path() else { return };
    let m: HashMap<String, &String> = c.map.iter().map(|(k, v)| (k.to_string(), v)).collect();
    if let Ok(t) = serde_json::to_string(&m) {
        let tmp = p.with_extension("json.tmp");
        if std::fs::write(&tmp, t).is_ok() {
            let _ = std::fs::rename(&tmp, &p);
        }
    }
}

/// Kaydedilmeye değer bayrak: iki-üç harfli kod, "GB-ENG" gibi alt bölge ya da "NONE" (ülke seçmemiş)
fn storable(f: &str) -> bool {
    let f = f.trim();
    f == "NONE"
        || ((2..=3).contains(&f.len()) && f.chars().all(|c| c.is_ascii_alphanumeric()))
        || (f.starts_with("GB-") && f.len() == 6)
}

/// Yeni oturum bilgisi: ülkesi gelen sürücüler öğrenilir, gelmeyenler önbellekten tamamlanır.
/// Dönen değer: önbellekten bayrak verilen sürücü sayısı.
pub fn apply(sd: &mut SessionData) -> usize {
    let mut c = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    apply_with(&mut c, sd, true)
}

fn apply_with(c: &mut Cache, sd: &mut SessionData, persist: bool) -> usize {
    if persist {
        load(c);
    }
    let mut filled = 0;
    for d in sd.drivers.iter_mut().flatten() {
        if d.user_id <= 0 || d.is_pace_car || d.is_spectator {
            continue;
        }
        if storable(&d.flair) {
            let v = d.flair.trim().to_string();
            // Ülke seçmemiş ("NONE") bilgisi bilinen bir ülkenin üstüne yazılmaz
            let keep = v == "NONE" && c.map.get(&d.user_id).map(|x| x != "NONE").unwrap_or(false);
            if !keep && c.map.get(&d.user_id) != Some(&v) {
                if c.map.len() < MAX || c.map.contains_key(&d.user_id) {
                    c.map.insert(d.user_id, v);
                    c.dirty = true;
                }
            }
        } else if d.flair.trim().is_empty() {
            if let Some(v) = c.map.get(&d.user_id) {
                d.flair = v.clone();
                filled += 1;
            }
        }
    }
    if persist {
        save(c);
    }
    filled
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Driver;

    fn sd(list: &[(i64, &str)]) -> SessionData {
        let mut s = SessionData::default();
        s.drivers = list
            .iter()
            .map(|(id, f)| {
                Some(Driver {
                    user_id: *id,
                    flair: f.to_string(),
                    ..Default::default()
                })
            })
            .collect();
        s
    }

    #[test]
    fn learns_live_fills_replay() {
        let mut c = Cache {
            map: HashMap::new(),
            loaded: true,
            dirty: false,
        };
        let mut live = sd(&[(1, "TR"), (2, "ES"), (3, "NONE")]);
        assert_eq!(apply_with(&mut c, &mut live, false), 0);
        let mut rep = sd(&[(1, ""), (2, ""), (3, ""), (4, "")]);
        assert_eq!(apply_with(&mut c, &mut rep, false), 3);
        let f: Vec<_> = rep
            .drivers
            .iter()
            .flatten()
            .map(|d| d.flair.as_str())
            .collect();
        assert_eq!(f, ["TR", "ES", "NONE", ""]);
        // NONE bilinen ülkeyi silmez
        let mut later = sd(&[(1, "NONE")]);
        apply_with(&mut c, &mut later, false);
        assert_eq!(c.map.get(&1).map(String::as_str), Some("TR"));
    }
}
