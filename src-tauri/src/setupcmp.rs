//! Setup karşılaştırma: garajda yüklenen her setup için en iyi tur, o turun sektörleri, en iyi sektörler,
//! tur sayısı ve ortalama tutulur (`setupcmp` konusu). Setup adı iRacing oturum bilgisinden gelir
//! (DriverInfo.DriverSetupName); ad vermeyen simlerde liste boş kalır.
//!
//! Kayıtlar pist + araç başına ayrıdır ve `setupcmp.json` dosyasında saklanır ("tüm zamanlar"); ayrıca her
//! setup için yalnızca bu oturumun değerleri de tutulur (pist koşulları aynıyken adil karşılaştırma).

use crate::model::{Frame, SessionData};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Bir pist + araç için saklanan en fazla setup
const MAX_SETUPS: usize = 12;
/// Dosyada saklanan en fazla pist + araç
const MAX_KEYS: usize = 150;
/// Çizgi geçildikten sonra simin "son tur" süresini yazması için beklenen süre (sn)
const WAIT: f64 = 6.0;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Stats {
    pub laps: u32,
    /// En iyi tur (sn); 0 = yok
    pub best: f32,
    /// En iyi turun sektörleri
    pub sectors: Vec<f32>,
    /// Sektör sektör en iyiler (farklı turlardan)
    pub opt: Vec<f32>,
    pub last: f32,
    /// Tur sürelerinin toplamı (ortalama = sum / laps)
    pub sum: f64,
}

impl Stats {
    fn add(&mut self, lap: f32, sectors: &[f32]) {
        self.laps += 1;
        self.sum += lap as f64;
        self.last = lap;
        if self.best <= 0.0 || lap < self.best {
            self.best = lap;
            self.sectors = sectors.to_vec();
        }
        if !sectors.is_empty() {
            if self.opt.len() != sectors.len() {
                self.opt = sectors.to_vec();
            } else {
                for (o, v) in self.opt.iter_mut().zip(sectors) {
                    if *v > 0.0 && (*o <= 0.0 || *v < *o) {
                        *o = *v;
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Entry {
    pub name: String,
    /// Yüklendikten sonra garajda değiştirilmiş (kaydedilmemiş) hali
    pub modified: bool,
    /// Son kullanım sırası (büyük = daha yeni)
    pub used: u64,
    pub all: Stats,
    /// Sadece bu oturum (dosyaya yazılmaz)
    #[serde(skip_deserializing)]
    pub ses: Stats,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Packet {
    /// Şu an yüklü setup ("" = sim setup adını vermiyor)
    pub current: String,
    pub modified: bool,
    /// En son kullanılan en üstte
    pub setups: Vec<Entry>,
}

#[derive(Default)]
pub struct SetupCmp {
    dir: Option<PathBuf>,
    store: HashMap<String, Vec<Entry>>,
    key: String,
    seq: u64,
    last_lap: i32,
    last_time: f64,
    prev_lap_last: f32,
    /// Çizgi geçildi: (son tarih, geçiş anındaki "son tur" değeri)
    pending: Option<(f64, f32)>,
}

/// "yaris1.sto" → "yaris1"
fn clean(name: &str) -> String {
    let n = name.trim();
    let n = n.rsplit(['/', '\\']).next().unwrap_or(n);
    let low = n.to_ascii_lowercase();
    if low.ends_with(".sto") {
        n[..n.len() - 4].to_string()
    } else {
        n.to_string()
    }
}

impl SetupCmp {
    pub fn new(dir: Option<PathBuf>) -> SetupCmp {
        let store: HashMap<String, Vec<Entry>> = dir
            .as_ref()
            .and_then(|d| std::fs::read(d.join("setupcmp.json")).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let seq = store.values().flatten().map(|e| e.used).max().unwrap_or(0);
        SetupCmp { dir, store, seq, last_lap: -1, prev_lap_last: -1.0, ..Default::default() }
    }

    fn key_of(s: &SessionData) -> String {
        let me = s.player_idx;
        let car = if me >= 0 { s.driver(me as usize).map(|d| d.car_path.clone()).unwrap_or_default() } else { String::new() };
        if car.is_empty() || (s.track_id == 0 && s.track_name.is_empty()) {
            return String::new();
        }
        format!("{}|{}|{}|{}", s.track_id, s.track_name, s.track_config, car)
    }

    fn reset_session(&mut self) {
        for e in self.store.values_mut().flatten() {
            e.ses = Stats::default();
        }
        self.pending = None;
    }

    /// Her karede. `sectors`: biten turun sektörleri (yalnızca tur kaydedilirken çağrılır).
    pub fn update(&mut self, f: &Frame, s: &SessionData, sectors: impl FnOnce() -> Vec<f32>) {
        let key = Self::key_of(s);
        // Yeni pist / araç ya da yeni etkinlik (oturum saati geri gitti): oturum değerleri sıfırlanır
        if key != self.key || f.session_time + 30.0 < self.last_time {
            self.key = key;
            self.reset_session();
            self.last_lap = f.lap;
            self.prev_lap_last = f.lap_last;
        }
        self.last_time = f.session_time;
        if self.key.is_empty() || s.setup_name.trim().is_empty() {
            self.last_lap = f.lap;
            self.prev_lap_last = f.lap_last;
            return;
        }
        if f.lap > self.last_lap && self.last_lap >= 0 {
            self.pending = Some((f.session_time + WAIT, self.prev_lap_last));
        }
        self.last_lap = f.lap;
        if let Some((until, before)) = self.pending {
            if f.lap_last > 0.0 && (f.lap_last - before).abs() > 0.0005 {
                self.pending = None;
                let mut sec = sectors();
                // Sektörler bu tura ait değilse (toplam tutmuyorsa) kullanılmaz
                if sec.iter().any(|x| *x <= 0.0) || (sec.iter().sum::<f32>() - f.lap_last).abs() > 0.3 {
                    sec.clear();
                }
                self.record(clean(&s.setup_name), s.setup_modified, f.lap_last, &sec);
            } else if f.session_time > until {
                // Geçersiz / süresiz tur (çıkış turu, pist dışı): kayıt yok
                self.pending = None;
            }
        }
        self.prev_lap_last = f.lap_last;
    }

    fn record(&mut self, name: String, modified: bool, lap: f32, sectors: &[f32]) {
        self.seq += 1;
        let seq = self.seq;
        let list = self.store.entry(self.key.clone()).or_default();
        let i = match list.iter().position(|e| e.name == name && e.modified == modified) {
            Some(i) => i,
            None => {
                list.push(Entry { name, modified, ..Default::default() });
                list.len() - 1
            }
        };
        let e = &mut list[i];
        e.used = seq;
        e.all.add(lap, sectors);
        e.ses.add(lap, sectors);
        if list.len() > MAX_SETUPS {
            list.sort_by(|a, b| b.used.cmp(&a.used));
            list.truncate(MAX_SETUPS);
        }
        self.save();
    }

    fn save(&mut self) {
        if self.store.len() > MAX_KEYS {
            let mut keys: Vec<(String, u64)> = self.store.iter().map(|(k, v)| (k.clone(), v.iter().map(|e| e.used).max().unwrap_or(0))).collect();
            keys.sort_by(|a, b| b.1.cmp(&a.1));
            for (k, _) in keys.into_iter().skip(MAX_KEYS) {
                self.store.remove(&k);
            }
        }
        let Some(dir) = self.dir.clone() else { return };
        // `ses` dosyaya da yazılır ama okunurken atlanır (skip_deserializing)
        let Ok(bytes) = serde_json::to_vec(&self.store) else { return };
        std::thread::spawn(move || {
            let tmp = dir.join("setupcmp.json.tmp");
            if std::fs::write(&tmp, bytes).is_ok() {
                let _ = std::fs::rename(&tmp, dir.join("setupcmp.json"));
            }
        });
    }

    pub fn packet(&self, s: &SessionData) -> Packet {
        let mut setups = self.store.get(&Self::key_of(s)).cloned().unwrap_or_default();
        setups.sort_by(|a, b| b.used.cmp(&a.used));
        Packet { current: clean(&s.setup_name), modified: s.setup_modified, setups }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Driver;

    fn sd(setup: &str) -> SessionData {
        let mut s = SessionData { drivers: vec![None; 4], player_idx: 1, track_id: 163, track_name: "Spa".into(), ..Default::default() };
        s.drivers[1] = Some(Driver { car_idx: 1, car_path: "mx5".into(), ..Default::default() });
        s.setup_name = setup.into();
        s
    }

    fn frame(t: f64, lap: i32, last: f32) -> Frame {
        Frame { session_time: t, lap, lap_last: last, player_idx: 1, ..Default::default() }
    }

    #[test]
    fn names() {
        assert_eq!(clean("yaris1.sto"), "yaris1");
        assert_eq!(clean("setups\\Yaris1.STO"), "Yaris1");
        assert_eq!(clean("baseline"), "baseline");
    }

    #[test]
    fn two_setups() {
        let mut c = SetupCmp::new(None);
        let a = sd("yaris1.sto");
        c.update(&frame(1.0, 1, -1.0), &a, Vec::new);
        // Çıkış turu: süre gelmez
        c.update(&frame(100.0, 2, -1.0), &a, Vec::new);
        c.update(&frame(107.0, 2, -1.0), &a, Vec::new);
        // İlk süreli tur: süre çizgiden biraz sonra gelir
        c.update(&frame(200.0, 3, -1.0), &a, Vec::new);
        c.update(&frame(201.0, 3, 100.0), &a, || vec![30.0, 40.0, 30.0]);
        c.update(&frame(300.0, 4, 100.0), &a, Vec::new);
        c.update(&frame(301.0, 4, 99.0), &a, || vec![31.0, 38.0, 30.0]);
        let b = sd("yaris2.sto");
        c.update(&frame(400.0, 5, 99.0), &b, Vec::new);
        c.update(&frame(401.0, 5, 98.5), &b, || vec![1.0, 2.0, 3.0]);
        let p = c.packet(&b);
        assert_eq!(p.current, "yaris2");
        assert_eq!(p.setups.len(), 2);
        assert_eq!(p.setups[0].name, "yaris2");
        assert_eq!(p.setups[0].ses.best, 98.5);
        // Toplamı tutmayan sektörler alınmaz
        assert!(p.setups[0].ses.sectors.is_empty());
        let y1 = &p.setups[1];
        assert_eq!((y1.ses.laps, y1.ses.best), (2, 99.0));
        assert_eq!(y1.ses.sectors, vec![31.0, 38.0, 30.0]);
        assert_eq!(y1.ses.opt, vec![30.0, 38.0, 30.0]);
        // Yeni etkinlik: oturum değerleri sıfırlanır, tüm zamanlar kalır
        c.update(&frame(5.0, 0, -1.0), &b, Vec::new);
        let p = c.packet(&b);
        assert_eq!(p.setups[1].ses.laps, 0);
        assert_eq!(p.setups[1].all.best, 99.0);
    }
}
