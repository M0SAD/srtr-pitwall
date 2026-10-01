//! iRacing'e komut gönderme (irsdk broadcast mesajları): tekrar izleme ve kamera.
//! Live Timing penceresindeki "Tekrar" ve "Canlı" düğmeleri bunu kullanır.

#[allow(dead_code)]
mod msg {
    pub const CAM_SWITCH_NUM: u16 = 1;
    pub const REPLAY_SET_PLAY_SPEED: u16 = 3;
    pub const REPLAY_SEARCH: u16 = 5;
    pub const REPLAY_SEARCH_SESSION_TIME: u16 = 12;
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

#[cfg(test)]
mod tests {
    use super::*;
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
