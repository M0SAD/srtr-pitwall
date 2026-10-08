//! Canlı Kıyas (`coach` konusu): oyuncunun gaz / fren girdilerini ve tur içi farkını bir referans turun iziyle
//! canlı karşılaştırır. Referans izleri arayüz indirir (topluluk rekoru, topluluk ortalaması, kendi rekorum) ve
//! `coach_ref_set` komutuyla verir; motor yalnızca şu anki pist + araç için olanları kullanır.

use crate::drivecues::Combo;
use crate::laprec::Trace;
use crate::model::Frame;
use serde::{Deserialize, Serialize};

/// Oyuncunun süren turu için tur yüzdesi kutuları
const BINS: usize = 1000;
/// Pencerede gönderilen nokta sayısı
const WIN: usize = 90;
/// Pencerenin arkası / önü (m); pist uzunluğu bilinmiyorsa tur oranı kullanılır
const BEHIND_M: f32 = 130.0;
const AHEAD_M: f32 = 300.0;
const NONE: u8 = 255;

/// Arayüzün verdiği referans (iz yoksa yalnızca durum: "nodata" | "loading" | "login")
#[derive(Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct RefIn {
    pub combo: Combo,
    /// "best" | "avg" | "mine"
    pub kind: String,
    pub status: String,
    pub name: String,
    pub time: f32,
    /// Ortalamaya giren tur sayısı (tek tur: 1)
    pub laps: u32,
    pub trace: Option<Trace>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefView {
    pub kind: String,
    /// "ok" | "nodata" | "loading" | "login"
    pub status: String,
    pub name: String,
    pub time: f32,
    pub laps: u32,
    /// Tur içi fark (sn): + referanstan yavaş. Tur çizgide başlamadıysa yok
    pub delta: Option<f32>,
    /// Üç eşit bölümde kazanılan / kaybedilen süre (son tamamlanan değerler)
    pub sectors: [Option<f32>; 3],
    /// Pencere: referansın gaz / fren (0-100) ve hızı (km/h)
    pub thr: Vec<u8>,
    pub brk: Vec<u8>,
    pub spd: Vec<u16>,
    /// Şu anki konumda referansın değerleri
    pub now_thr: u8,
    pub now_brk: u8,
    pub now_speed: f32,
    pub now_gear: i32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Packet {
    pub on_track: bool,
    pub on_pit_road: bool,
    pub lap_pct: f32,
    /// m/s
    pub speed: f32,
    pub throttle: f32,
    pub brake: f32,
    pub gear: i32,
    /// Penceredeki "şimdi" noktasının sırası
    pub now_idx: usize,
    /// Pencerenin uzunluğu (m), bilinmiyorsa 0
    pub window_m: f32,
    /// Oyuncunun bu turdaki gaz / freni (pencerenin geçmiş kısmı; 255 = yok)
    pub my_thr: Vec<u8>,
    pub my_brk: Vec<u8>,
    pub refs: Vec<RefView>,
}

struct Ref {
    input: RefIn,
    /// Bölüm sınırlarında fark (bölüm kazancı için)
    mark: f32,
    sectors: [Option<f32>; 3],
}

pub struct Coach {
    combo: Combo,
    refs: Vec<Ref>,
    my_thr: Vec<u8>,
    my_brk: Vec<u8>,
    prev_pct: f32,
    lap_start: f64,
    /// Süren tur çizgide başladı (fark hesaplanabilir)
    full: bool,
}

impl Default for Coach {
    fn default() -> Self {
        Coach { combo: Combo::default(), refs: Vec::new(), my_thr: vec![NONE; BINS], my_brk: vec![NONE; BINS], prev_pct: -1.0, lap_start: 0.0, full: false }
    }
}

fn bin(pct: f32) -> usize {
    ((pct.clamp(0.0, 0.999_99) * BINS as f32) as usize).min(BINS - 1)
}

impl Coach {
    /// Arayüzden gelen referans: başka pist / araç içinse yok sayılır
    pub fn set_ref(&mut self, mut r: RefIn) {
        if r.combo != self.combo || self.combo.track_id.is_empty() {
            return;
        }
        if let Some(t) = r.trace.as_ref() {
            let n = t.t.len();
            if n < 50 || t.throttle.len() != n || t.brake.len() != n || t.speed.len() != n {
                r.trace = None;
                r.status = "nodata".into();
            } else {
                r.status = "ok".into();
            }
        }
        self.refs.retain(|x| x.input.kind != r.kind);
        self.refs.push(Ref { input: r, mark: 0.0, sectors: [None; 3] });
    }

    fn delta_of(&self, t: &Trace, f: &Frame) -> Option<f32> {
        if !self.full {
            return None;
        }
        t.time_at(f.lap_dist_pct).map(|rt| (f.session_time - self.lap_start) as f32 - rt)
    }

    pub fn update(&mut self, f: &Frame, combo: &Combo) {
        if *combo != self.combo {
            *self = Coach { combo: combo.clone(), ..Default::default() };
        }
        let pct = f.lap_dist_pct;
        let driving = f.is_on_track && !f.replay && !f.is_in_garage && f.player_idx >= 0;
        if !driving || self.prev_pct < 0.0 {
            self.prev_pct = if driving { pct } else { -1.0 };
            self.full = false;
            return;
        }
        let d = pct - self.prev_pct;
        if self.prev_pct > 0.85 && pct < 0.15 {
            // Tur çizgisi: son bölüm kapanır, yeni tur başlar
            let prev = Frame { lap_dist_pct: 1.0, ..f.clone() };
            for i in 0..self.refs.len() {
                if let Some(t) = self.refs[i].input.trace.as_ref() {
                    if let Some(dl) = self.delta_of(t, &prev) {
                        let m = self.refs[i].mark;
                        self.refs[i].sectors[2] = Some(dl - m);
                    }
                }
                self.refs[i].mark = 0.0;
            }
            self.my_thr.iter_mut().for_each(|x| *x = NONE);
            self.my_brk.iter_mut().for_each(|x| *x = NONE);
            self.lap_start = f.session_time;
            self.full = !f.on_pit_road;
        } else if d.abs() > 0.05 || d < -0.002 {
            // Işınlanma / geri gitme: fark güvenilmez
            self.full = false;
        } else {
            // Bölüm sınırları (1/3 ve 2/3)
            for (k, b) in [1.0f32 / 3.0, 2.0 / 3.0].iter().enumerate() {
                if self.prev_pct < *b && pct >= *b {
                    for i in 0..self.refs.len() {
                        if let Some(t) = self.refs[i].input.trace.as_ref() {
                            if let Some(dl) = self.delta_of(t, f) {
                                let m = self.refs[i].mark;
                                self.refs[i].sectors[k] = Some(dl - m);
                                self.refs[i].mark = dl;
                            }
                        }
                    }
                }
            }
        }
        if f.on_pit_road {
            self.full = false;
        }
        // Geçilen kutuları doldur
        let (a, b) = (bin(self.prev_pct), bin(pct));
        let (thr, brk) = ((f.throttle.clamp(0.0, 1.0) * 100.0) as u8, (f.brake.clamp(0.0, 1.0) * 100.0) as u8);
        if b >= a && b - a < 60 {
            for i in a..=b {
                self.my_thr[i] = thr;
                self.my_brk[i] = brk;
            }
        } else {
            self.my_thr[b] = thr;
            self.my_brk[b] = brk;
        }
        self.prev_pct = pct;
    }

    pub fn packet(&self, f: &Frame, track_len_m: f32) -> Packet {
        let pct = f.lap_dist_pct;
        let (behind, ahead) = if track_len_m > 200.0 { (BEHIND_M / track_len_m, AHEAD_M / track_len_m) } else { (0.025, 0.06) };
        let span = behind + ahead;
        let now_idx = ((behind / span) * (WIN - 1) as f32).round() as usize;
        let pos = |k: usize| (pct - behind + span * k as f32 / (WIN - 1) as f32).rem_euclid(1.0);
        let mut out = Packet {
            on_track: f.is_on_track,
            on_pit_road: f.on_pit_road,
            lap_pct: pct,
            speed: f.speed,
            throttle: f.throttle,
            brake: f.brake,
            gear: f.gear,
            now_idx,
            window_m: if track_len_m > 200.0 { BEHIND_M + AHEAD_M } else { 0.0 },
            my_thr: Vec::with_capacity(now_idx + 1),
            my_brk: Vec::with_capacity(now_idx + 1),
            refs: Vec::with_capacity(self.refs.len()),
        };
        for k in 0..=now_idx {
            let p = pos(k);
            // Çizginin gerisi önceki tura aittir: bu turda yok
            let i = bin(p);
            let old = p > pct + 0.5;
            out.my_thr.push(if old { NONE } else { self.my_thr[i] });
            out.my_brk.push(if old { NONE } else { self.my_brk[i] });
        }
        for r in &self.refs {
            let mut v = RefView {
                kind: r.input.kind.clone(),
                status: if r.input.status.is_empty() { "nodata".into() } else { r.input.status.clone() },
                name: r.input.name.clone(),
                time: r.input.time,
                laps: r.input.laps,
                sectors: r.sectors,
                ..Default::default()
            };
            if let Some(t) = r.input.trace.as_ref() {
                let n = t.t.len();
                let at = |p: f32| ((p * n as f32) as usize).min(n - 1);
                for k in 0..WIN {
                    let i = at(pos(k));
                    v.thr.push(t.throttle[i]);
                    v.brk.push(t.brake[i]);
                    v.spd.push((t.speed[i].max(0) / 10) as u16);
                }
                let i = at(pct.clamp(0.0, 0.999_99));
                v.now_thr = t.throttle[i];
                v.now_brk = t.brake[i];
                v.now_speed = t.speed[i] as f32 / 36.0;
                v.now_gear = t.gear.get(i).copied().unwrap_or(0) as i32;
                v.delta = self.delta_of(t, f);
            }
            out.refs.push(v);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn combo() -> Combo {
        Combo { sim: "iracing".into(), track_id: "1".into(), track_config: "".into(), car_id: "2".into() }
    }

    fn frame(t: f64, pct: f32) -> Frame {
        Frame { session_time: t, lap_dist_pct: pct, is_on_track: true, player_idx: 0, throttle: 0.5, brake: 0.25, ..Default::default() }
    }

    /// 100 sn'lik sabit hızlı referans tur
    fn trace() -> Trace {
        let n = 200;
        Trace { n: n as u32, t: (0..n).map(|i| (i * 500) as i32).collect(), speed: vec![1800; n], throttle: vec![100; n], brake: vec![0; n], gear: vec![4; n], steer: vec![0; n] }
    }

    #[test]
    fn delta_and_window() {
        let mut c = Coach::default();
        let cb = combo();
        c.update(&frame(0.0, 0.95), &cb);
        // Başka araç için gelen referans alınmaz
        c.set_ref(RefIn { combo: Combo { car_id: "9".into(), ..combo() }, kind: "best".into(), trace: Some(trace()), ..Default::default() });
        assert!(c.packet(&frame(0.0, 0.95), 4000.0).refs.is_empty());
        c.set_ref(RefIn { combo: combo(), kind: "best".into(), name: "A".into(), time: 100.0, laps: 1, trace: Some(trace()), ..Default::default() });
        c.set_ref(RefIn { combo: combo(), kind: "avg".into(), status: "nodata".into(), ..Default::default() });
        // Çizgi t=10'da geçilir; tur %10 daha yavaş sürülür (110 sn)
        let mut t = 9.0;
        let mut pct = 0.99f32;
        while pct < 1.0 {
            c.update(&frame(t, pct), &cb);
            t += 0.11;
            pct += 0.001;
        }
        t = 10.0;
        pct = 0.0;
        while pct < 0.5 {
            c.update(&frame(t, pct), &cb);
            t += 0.11;
            pct += 0.001;
        }
        let p = c.packet(&frame(t, pct), 4000.0);
        assert_eq!(p.refs.len(), 2);
        let r = &p.refs[0];
        assert_eq!(r.status, "ok");
        // Yarı turda 55 sn sürdü, referans 50 sn: +5
        assert!((r.delta.unwrap() - 5.0).abs() < 0.3, "{:?}", r.delta);
        // İlk bölüm: 1/3 turda ~+3.3 sn
        assert!((r.sectors[0].unwrap() - 3.33).abs() < 0.3, "{:?}", r.sectors);
        assert_eq!(r.thr.len(), WIN);
        assert_eq!(p.my_thr.len(), p.now_idx + 1);
        assert_eq!(p.my_thr[p.now_idx - 1], 50);
        assert_eq!(p.my_brk[0], 25);
        assert_eq!(p.refs[1].status, "nodata");
        assert!(p.refs[1].thr.is_empty());
    }
}
