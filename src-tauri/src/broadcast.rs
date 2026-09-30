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

#[cfg(windows)]
fn send(m: u16, var1: u16, lparam: isize) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{RegisterWindowMessageW, SendNotifyMessageW, HWND_BROADCAST};
    let name: Vec<u16> = "IRSDK_BROADCASTMSG".encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let id = RegisterWindowMessageW(name.as_ptr());
        if id == 0 {
            return Err("iRacing mesaj kanalı açılamadı".into());
        }
        let wparam = (m as usize) | ((var1 as usize) << 16);
        SendNotifyMessageW(HWND_BROADCAST, id, wparam, lparam);
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

/// Tekrarı oturumdaki verilen zamana (sn) sar ve oynat.
pub fn replay_to(session_num: i32, time_s: f64) -> Result<(), String> {
    let ms = (time_s.max(0.0) * 1000.0) as i32;
    send(msg::REPLAY_SEARCH_SESSION_TIME, session_num.max(0) as u16, ms as isize)?;
    send(msg::REPLAY_SET_PLAY_SPEED, 1, 0)
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
}
