//! iRacing'e komut gönderme (irsdk broadcast mesajları): tekrar izleme ve kamera.
//! Live Timing penceresindeki "Tekrar" ve "Canlı" düğmeleri bunu kullanır.

#[allow(dead_code)]
mod msg {
    pub const CAM_SWITCH_NUM: u16 = 1;
    pub const REPLAY_SET_PLAY_SPEED: u16 = 3;
    pub const REPLAY_SET_PLAY_POSITION: u16 = 4;
    pub const REPLAY_SEARCH: u16 = 5;
    /// ReplaySetPlayPosition modu: kasetin başından
    pub const RPY_POS_BEGIN: u16 = 0;
    pub const REPLAY_SEARCH_SESSION_TIME: u16 = 12;
    /// PitCommand(mode, var): pit servisi seçimleri (sadece sürücü araçtayken etkili)
    pub const PIT_COMMAND: u16 = 9;
    /// ReplaySearch modu: canlıya dön
    pub const RPY_SRCH_TO_END: u16 = 1;
}

/// irsdk_broadcastMsg paketleme: wParam = MAKELONG(msg, var1). İki 16 bit parametreli
/// mesajlarda lParam = MAKELONG(var2, var3); 32 bit tek parametreli mesajlarda (ör.
/// ReplaySearchSessionTime'ın milisaniyesi) lParam doğrudan o sayıdır.
#[cfg_attr(not(windows), allow(dead_code))]
fn pack(m: u16, var1: u16) -> usize {
    (m as usize) | ((var1 as usize) << 16)
}

#[cfg(windows)]
fn send(m: u16, var1: u16, lparam: isize) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{RegisterWindowMessageW, SendNotifyMessageW, HWND_BROADCAST};
    let name: Vec<u16> = "IRSDK_BROADCASTMSG".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let id = RegisterWindowMessageW(name.as_ptr());
        if id == 0 {
            return Err("iRacing mesaj kanalı açılamadı".into());
        }
        SendNotifyMessageW(HWND_BROADCAST, id, pack(m, var1), lparam);
    }
    Ok(())
}

#[cfg(not(windows))]
fn send(_m: u16, _var1: u16, _lparam: isize) -> Result<(), String> {
    Err("iRacing komutları sadece Windows'ta çalışır".into())
}

fn make_long(lo: u16, hi: u16) -> isize {
    ((lo as u32) | ((hi as u32) << 16)) as i32 as isize
}

/// iRacing araç numarası kodlaması (irsdk_padCarNum / CarNumberRaw): başında sıfır olan numaralar
/// basamak sayısıyla birlikte kodlanır: "07" = 2007, "007" = 3007, "00" = 2000; "7" = 7, "0" = 0.
fn pad_car_num(num: &str) -> u16 {
    let n: u16 = num.parse().unwrap_or(0);
    let digits = num.len() as u16;
    if digits > 1 && num.starts_with('0') {
        return n + 1000 * digits.min(3);
    }
    n
}

/// Kamerayı verilen araç numarasına odakla (grup/kamera 0 = mevcut).
pub fn camera_to_car(number: &str) -> Result<(), String> {
    send(msg::CAM_SWITCH_NUM, pad_car_num(number), make_long(0, 0))
}

/// ReplaySearchSessionTime(sessionNum, sessionTimeMS): var1 = oturum no, lParam = 32 bit ms
fn search_params(session_num: i32, time_s: f64) -> (u16, isize) {
    let ms = (time_s.max(0.0) * 1000.0).min(i32::MAX as f64) as i32;
    (session_num.clamp(0, u16::MAX as i32) as u16, ms as isize)
}

/// Tekrarı oturumdaki verilen zamana (sn) sar ve oynat.
pub fn replay_to(session_num: i32, time_s: f64) -> Result<(), String> {
    let (var1, lp) = search_params(session_num, time_s);
    send(msg::REPLAY_SEARCH_SESSION_TIME, var1, lp)?;
    // ReplaySetPlaySpeed(1, slowMotion = false): var1 = hız, lParam = MAKELONG(0, 0)
    send(msg::REPLAY_SET_PLAY_SPEED, 1, make_long(0, 0))
}

// ---- Tekrar kafasının izlenmesi ve doğrulanmış sarma ----

/// Telemetriden okunan tekrar durumu (her iRacing karesinde `observe` ile güncellenir).
#[derive(Clone, Copy, Debug)]
struct ReplayPos {
    session_num: i32,
    session_time: f64,
    frame: i32,
    cam_car_idx: i32,
    at: std::time::Instant,
}

/// Canlı andaki (oturum zamanı, kaset karesi) eşlemesi: oturum başına son görülen çift.
/// ReplaySearchSessionTime işe yaramazsa hedef kare bundan hesaplanır (kaset 60 kare/sn).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Anchor {
    session_num: i32,
    time: f64,
    frame: i32,
}

struct ReplayTrack {
    pos: Option<ReplayPos>,
    anchors: Vec<Anchor>,
}

static TRACK: parking_lot::Mutex<ReplayTrack> = parking_lot::const_mutex(ReplayTrack { pos: None, anchors: Vec::new() });

const TAPE_FPS: f64 = 60.0;

/// Çapa tablosunu güncelle: kaset baştan başladıysa (kare geri gitti) eski çapalar geçersizdir.
fn anchor_put(list: &mut Vec<Anchor>, a: Anchor) {
    if list.iter().any(|x| x.frame > a.frame + 120) {
        list.clear();
    }
    match list.iter_mut().find(|x| x.session_num == a.session_num) {
        Some(x) => *x = a,
        None => {
            if list.len() >= 16 {
                list.remove(0);
            }
            list.push(a);
        }
    }
}

/// Oturumdaki `time` anının kaset karesi (çapa yoksa ya da kasetin başından önceyse None).
fn anchor_frame(list: &[Anchor], session_num: i32, time: f64) -> Option<i32> {
    let a = list.iter().find(|x| x.session_num == session_num)?;
    let fr = a.frame as f64 - (a.time - time) * TAPE_FPS;
    if fr < 1.0 || fr > a.frame as f64 + 1.0 {
        return None;
    }
    Some(fr.round() as i32)
}

/// Tekrar kafası hedefe vardı mı? Sarma bitince kaset oynuyor olabilir: biraz ilerlemiş olması normal.
fn arrived(session_num: i32, time: f64, target_num: i32, target: f64) -> bool {
    session_num == target_num && time >= target - 2.0 && time <= target + 8.0
}

/// Her iRacing karesinde çağrılır (events.rs). `live`: tekrar izlenmiyor (kafa canlı anda).
pub fn observe(f: &crate::model::Frame, live: bool) {
    if f.replay_frame < 0 {
        return;
    }
    let mut t = TRACK.lock();
    t.pos = Some(ReplayPos {
        session_num: f.replay_session_num,
        session_time: f.replay_session_time,
        frame: f.replay_frame,
        cam_car_idx: f.cam_car_idx,
        at: std::time::Instant::now(),
    });
    if live && f.session_time > 0.0 {
        // Canlı andaki kaset karesi = kafa + sona kalan kare
        let a = Anchor { session_num: f.session_num, time: f.session_time, frame: f.replay_frame + f.replay_frame_end.max(0) };
        anchor_put(&mut t.anchors, a);
    }
}

fn fresh_pos() -> Option<ReplayPos> {
    TRACK.lock().pos.filter(|p| p.at.elapsed() < std::time::Duration::from_secs(2))
}

/// Telemetri `ok` diyene kadar bekle (en çok `ms`).
fn wait_pos(ms: u64, ok: impl Fn(&ReplayPos) -> bool) -> bool {
    let end = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    loop {
        if fresh_pos().map(|p| ok(&p)).unwrap_or(false) {
            return true;
        }
        if std::time::Instant::now() >= end {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

/// Sarma sonucu (arayüz bildirimi buna göre yazılır)
#[derive(serde::Serialize, Clone, Copy, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SeekResult {
    /// Telemetriden doğrulanabildi mi (false: komut gönderildi ama tekrar konumu okunamıyor)
    pub verified: bool,
    /// Kamera istenen araca geçti mi (araç istenmediyse ya da doğrulanamadıysa true)
    pub camera: bool,
    /// Oturum zamanı araması tutmadı, kare numarasıyla sarıldı
    pub by_frame: bool,
}

pub const SEEK_FAILED: &str = "Tekrar o ana gitmedi: iRacing tekrar ekranında olmalısın (araçtan in) ve o an kasette olmalı";

/// Olayın `lead` sn öncesine sar, kamerayı araca çevir ve 1x oynat; sonucu telemetriden doğrula.
/// Bekleme içerir (en çok ~4 sn): arayüz iş parçacığından çağrılmaz.
///
/// Sıra önemli: önce sarma biter, sonra kamera değişir. Arama sürerken gelen kamera/hız
/// komutları sarmayı yarıda bırakabiliyor.
pub fn replay_seek(session_num: i32, time_s: f64, car_number: &str, car_idx: Option<i32>, lead: f64) -> Result<SeekResult, String> {
    let target = (time_s - lead).max(0.0);
    let (var1, lp) = search_params(session_num, target);
    let known = fresh_pos().is_some();
    send(msg::REPLAY_SEARCH_SESSION_TIME, var1, lp)?;
    let mut res = SeekResult { verified: known, camera: true, by_frame: false };
    if known {
        let there = |p: &ReplayPos| arrived(p.session_num, p.session_time, session_num, target);
        let mut ok = wait_pos(1500, there);
        if !ok {
            // Zaman araması tutmadı (çok araçlı / çok oturumlu etkinliklerde olur): kare numarasıyla sar
            let frame = anchor_frame(&TRACK.lock().anchors, session_num, target);
            if let Some(fr) = frame {
                send(msg::REPLAY_SET_PLAY_POSITION, msg::RPY_POS_BEGIN, fr as isize)?;
                ok = wait_pos(1500, |p| there(p) || (p.frame >= fr - 120 && p.frame <= fr + 480));
                res.by_frame = ok;
            }
        }
        if !ok {
            return Err(SEEK_FAILED.into());
        }
    }
    let num = car_number.trim();
    if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
        // CamSwitchNum(carNumber, group, camera): 0 = mevcut grup/kamera kalsın
        send(msg::CAM_SWITCH_NUM, pad_car_num(num), make_long(0, 0))?;
        if let (true, Some(idx)) = (known, car_idx.filter(|i| *i >= 0)) {
            res.camera = wait_pos(800, |p| p.cam_car_idx == idx);
        }
    }
    send(msg::REPLAY_SET_PLAY_SPEED, 1, make_long(0, 0))?;
    Ok(res)
}

/// Canlı yayına dön.
pub fn replay_live() -> Result<(), String> {
    send(msg::REPLAY_SEARCH, msg::RPY_SRCH_TO_END, 0)?;
    send(msg::REPLAY_SET_PLAY_SPEED, 1, 0)
}

/// irsdk_PitCommandMode
#[allow(dead_code)]
pub mod pit {
    /// Bütün pit servisi seçimlerini kaldır
    pub const CLEAR: u16 = 0;
    /// Vizör filmi (tear-off)
    pub const WS: u16 = 1;
    /// Yakıt ekle; var = litre (0: mevcut miktar kalsın)
    pub const FUEL: u16 = 2;
    /// Lastik değiştir; var = basınç kPa (0: mevcut basınç kalsın)
    pub const LF: u16 = 3;
    pub const RF: u16 = 4;
    pub const LR: u16 = 5;
    pub const RR: u16 = 6;
    pub const CLEAR_TIRES: u16 = 7;
    /// Hızlı tamir
    pub const FR: u16 = 8;
    pub const CLEAR_WS: u16 = 9;
    pub const CLEAR_FR: u16 = 10;
    pub const CLEAR_FUEL: u16 = 11;
}

/// irsdk_BroadcastPitCommand: wParam = MAKELONG(PitCommand, mode), lParam = MAKELONG(var, 0)
pub fn pit_command(mode: u16, var: u16) -> Result<(), String> {
    send(msg::PIT_COMMAND, mode, make_long(var, 0))
}

/// Ekip (uzaktan pit) komutunu iRacing pit komutlarına çevirir: [(mod, değer)].
/// Sadece burada sayılan türler kabul edilir; `message` bir pit komutu değildir (arayüz gösterir).
pub fn crew_plan(kind: &str, args: &serde_json::Value) -> Result<Vec<(u16, u16)>, String> {
    let flag = |k: &str, d: bool| args.get(k).and_then(|x| x.as_bool()).unwrap_or(d);
    Ok(match kind {
        "fuel_set" => {
            let l = args.get("liters").and_then(|x| x.as_f64()).unwrap_or(0.0);
            if !l.is_finite() || l <= 0.0 || l > 1000.0 {
                return Err("Geçersiz yakıt miktarı".into());
            }
            // iRacing tam litre alır: eksik kalmasın diye yukarı yuvarlanır
            vec![(pit::FUEL, l.ceil() as u16)]
        }
        "fuel_clear" => vec![(pit::CLEAR_FUEL, 0)],
        "tyres_all" => vec![(pit::LF, 0), (pit::RF, 0), (pit::LR, 0), (pit::RR, 0)],
        "tyres" => {
            // Tek tek kaldırma komutu yok: önce hepsi kaldırılır, sonra seçilenler işaretlenir
            let mut v = vec![(pit::CLEAR_TIRES, 0)];
            for (k, m) in [("lf", pit::LF), ("rf", pit::RF), ("lr", pit::LR), ("rr", pit::RR)] {
                if flag(k, false) {
                    v.push((m, 0));
                }
            }
            v
        }
        "tyres_clear" => vec![(pit::CLEAR_TIRES, 0)],
        "fast_repair" => vec![(if flag("on", true) { pit::FR } else { pit::CLEAR_FR }, 0)],
        "tearoff" => vec![(if flag("on", true) { pit::WS } else { pit::CLEAR_WS }, 0)],
        "clear_all" => vec![(pit::CLEAR, 0)],
        _ => return Err("Bilinmeyen komut".into()),
    })
}

/// Ekip komutunu iRacing'e gönder.
pub fn crew_apply(kind: &str, args: &serde_json::Value) -> Result<(), String> {
    for (mode, var) in crew_plan(kind, args)? {
        pit_command(mode, var)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crew_commands() {
        use serde_json::json;
        // PitCommand = 9, mod wParam'ın üst sözcüğünde; litre lParam'ın alt sözcüğünde
        assert_eq!(pack(msg::PIT_COMMAND, pit::FUEL), 0x0002_0009);
        assert_eq!(make_long(45, 0), 45);
        assert_eq!(crew_plan("fuel_set", &json!({ "liters": 44.2 })).unwrap(), vec![(pit::FUEL, 45)]);
        assert!(crew_plan("fuel_set", &json!({ "liters": 0 })).is_err());
        assert!(crew_plan("fuel_set", &json!({ "liters": 5000 })).is_err());
        assert!(crew_plan("fuel_set", &json!({})).is_err());
        assert_eq!(crew_plan("fuel_clear", &json!({})).unwrap(), vec![(pit::CLEAR_FUEL, 0)]);
        assert_eq!(crew_plan("tyres_all", &json!({})).unwrap().len(), 4);
        assert_eq!(
            crew_plan("tyres", &json!({ "lf": true, "rr": true })).unwrap(),
            vec![(pit::CLEAR_TIRES, 0), (pit::LF, 0), (pit::RR, 0)]
        );
        assert_eq!(crew_plan("tyres", &json!({})).unwrap(), vec![(pit::CLEAR_TIRES, 0)]);
        assert_eq!(crew_plan("fast_repair", &json!({ "on": false })).unwrap(), vec![(pit::CLEAR_FR, 0)]);
        assert_eq!(crew_plan("fast_repair", &json!({})).unwrap(), vec![(pit::FR, 0)]);
        assert_eq!(crew_plan("tearoff", &json!({ "on": true })).unwrap(), vec![(pit::WS, 0)]);
        assert_eq!(crew_plan("clear_all", &json!({})).unwrap(), vec![(pit::CLEAR, 0)]);
        // Pit komutu olmayan hiçbir şey çalıştırılamaz
        assert!(crew_plan("message", &json!({ "text": "x" })).is_err());
        assert!(crew_plan("settings_set", &json!({})).is_err());
    }
    #[test]
    fn car_numbers() {
        assert_eq!(pad_car_num("7"), 7);
        assert_eq!(pad_car_num("44"), 44);
        // irsdk_padCarNum: başında sıfır varsa 1000 x basamak sayısı eklenir
        assert_eq!(pad_car_num("07"), 2007);
        assert_eq!(pad_car_num("007"), 3007);
        assert_eq!(pad_car_num("00"), 2000);
        assert_eq!(pad_car_num("0"), 0);
        assert_eq!(pad_car_num("010"), 3010);
        assert_eq!(pad_car_num("100"), 100);
        assert_eq!(make_long(1, 2), 0x0002_0001);
    }

    #[test]
    fn anchors_and_arrival() {
        let mut l = Vec::new();
        anchor_put(&mut l, Anchor { session_num: 0, time: 600.0, frame: 36_000 });
        anchor_put(&mut l, Anchor { session_num: 2, time: 100.0, frame: 50_000 });
        anchor_put(&mut l, Anchor { session_num: 2, time: 200.0, frame: 56_000 });
        assert_eq!(l.len(), 2);
        // 200. sn = 56000. kare; 150. sn 50 sn (3000 kare) geride
        assert_eq!(anchor_frame(&l, 2, 150.0), Some(53_000));
        assert_eq!(anchor_frame(&l, 0, 590.0), Some(35_400));
        assert_eq!(anchor_frame(&l, 1, 10.0), None, "o oturum görülmedi");
        assert_eq!(anchor_frame(&l, 2, 5000.0), None, "gelecekteki an");
        assert_eq!(anchor_frame(&l, 0, -5000.0), None, "kasetin başından önce");
        // Kaset baştan başladı (oturuma yeniden girildi): eski çapalar silinir
        anchor_put(&mut l, Anchor { session_num: 2, time: 300.0, frame: 500 });
        assert_eq!(l, vec![Anchor { session_num: 2, time: 300.0, frame: 500 }]);
        assert!(arrived(2, 96.0, 2, 95.0));
        assert!(arrived(2, 94.0, 2, 95.0));
        assert!(!arrived(1, 95.0, 2, 95.0), "başka oturum");
        assert!(!arrived(2, 400.0, 2, 95.0), "kafa yerinden oynamadı");
        // ReplaySetPlayPosition = 4, mod wParam'ın üst sözcüğünde, kare lParam'da
        assert_eq!(pack(msg::REPLAY_SET_PLAY_POSITION, msg::RPY_POS_BEGIN), 4);
    }

    #[test]
    fn broadcast_packing() {
        // wParam = MAKELONG(msg, var1)
        assert_eq!(pack(msg::REPLAY_SEARCH_SESSION_TIME, 2), 0x0002_000C);
        assert_eq!(pack(msg::CAM_SWITCH_NUM, 2007), (2007 << 16) | 1);
        assert_eq!(pack(msg::REPLAY_SET_PLAY_SPEED, 1), 0x0001_0003);
        // 32 bit ms lParam'a sığar (16 bit sınırını aşan süreler kesilmez)
        assert_eq!(search_params(2, 3725.5), (2, 3_725_500));
        assert_eq!(search_params(1, 3.0 - 5.0), (1, 0));
        assert_eq!(search_params(-1, 10.0), (0, 10_000));
        // İki 16 bit parametre: MAKELONG(lo, hi), işaret genişletmesi 32 bit üzerinden
        assert_eq!(make_long(0xFFFF, 0xFFFF), -1);
    }
}
