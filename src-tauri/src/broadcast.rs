//! iRacing'e komut gönderme (irsdk broadcast mesajları): tekrar izleme ve kamera.
//! Live Timing penceresindeki "Tekrar" ve "Canlı" düğmeleri bunu kullanır.

#[allow(dead_code)]
mod msg {
    pub const CAM_SWITCH_NUM: u16 = 1;
    pub const REPLAY_SET_PLAY_SPEED: u16 = 3;
    pub const REPLAY_SEARCH: u16 = 5;
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

/// iRacing araç numarası kodlaması: "07" gibi başında sıfır olan numaralar ayrı kodlanır.
fn pad_car_num(num: &str) -> u16 {
    let n: u16 = num.parse().unwrap_or(0);
    let zeros = num.chars().take_while(|c| *c == '0').count() as u16;
    let digits = num.len() as u16;
    if zeros > 0 && digits > 1 {
        let places = digits;
        return n + 1000 * (places - zeros).min(3);
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

/// Olaylar ekranı: olayın `lead` sn öncesine sar, kamerayı araca çevir ve 1x oynat.
pub fn replay_seek(session_num: i32, time_s: f64, car_number: &str, lead: f64) -> Result<(), String> {
    let (var1, lp) = search_params(session_num, time_s - lead);
    send(msg::REPLAY_SEARCH_SESSION_TIME, var1, lp)?;
    let num = car_number.trim();
    if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
        // CamSwitchNum(carNumber, group, camera): 0 = mevcut grup/kamera kalsın
        send(msg::CAM_SWITCH_NUM, pad_car_num(num), make_long(0, 0))?;
    }
    send(msg::REPLAY_SET_PLAY_SPEED, 1, make_long(0, 0))
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
        assert_eq!(pad_car_num("07"), 1007);
        assert_eq!(make_long(1, 2), 0x0002_0001);
    }

    #[test]
    fn broadcast_packing() {
        // wParam = MAKELONG(msg, var1)
        assert_eq!(pack(msg::REPLAY_SEARCH_SESSION_TIME, 2), 0x0002_000C);
        assert_eq!(pack(msg::CAM_SWITCH_NUM, 1007), (1007 << 16) | 1);
        assert_eq!(pack(msg::REPLAY_SET_PLAY_SPEED, 1), 0x0001_0003);
        // 32 bit ms lParam'a sığar (16 bit sınırını aşan süreler kesilmez)
        assert_eq!(search_params(2, 3725.5), (2, 3_725_500));
        assert_eq!(search_params(1, 3.0 - 5.0), (1, 0));
        assert_eq!(search_params(-1, 10.0), (0, 10_000));
        // İki 16 bit parametre: MAKELONG(lo, hi), işaret genişletmesi 32 bit üzerinden
        assert_eq!(make_long(0xFFFF, 0xFFFF), -1);
    }
}
