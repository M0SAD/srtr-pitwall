#![cfg_attr(not(windows), allow(dead_code))]
//! Bilgisayara bağlı direksiyonu bulur (Pedallar & Girdi overlay'indeki "bağlı direksiyona göre" görsel seçimi).
//!
//! Windows: takılı oyun kumandaları Raw Input aygıt listesinden okunur (ptt_win::game_devices; WinMM kullanılmaz:
//! sürücü kodunu süreç içinde çalıştırıp direksiyon kapatılıp açılırken programı çökertiyordu); ürün adı kayıt
//! defterindeki OEMName değerinden, yoksa HID ürün adından.
//! Aygıt, USB üretici numarası (VID) ve ürün adına göre genel bir direksiyon biçimine eşlenir:
//! `round` (yuvarlak), `gt` (altı düz / D biçimli), `formula` (dikdörtgen), `truck` (büyük çaplı kamyon).
//! Bu yalnızca bir TAHMİNDİR: direksiyon tabanı çoğu zaman takılı simidin modelini bildirmez; overlay de
//! ürünün fotoğrafını değil, o türün özgün (markasız) çizimini gösterir.
//!
//! Sınıflandırma taşınabilir koddur (Linux'ta da derlenir ve sınanır); listeleme sadece Windows'tadır.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct WheelDev {
    pub name: String,
    pub vid: u16,
    pub pid: u16,
    /// round | gt | formula | truck
    pub shape: &'static str,
    /// Direksiyon (tabanı) olduğu düşünülüyor mu; pedal seti, vites kolu, el freni, oyun kolu değil
    pub wheel: bool,
}

/// Direksiyon tabanı üreten bilinen USB üreticileri: (VID, varsayılan biçim)
const VENDORS: [(u16, &str); 14] = [
    (0x046D, "round"), // yuvarlak simitli tüketici setleri
    (0x044F, "round"),
    (0x0EB7, "gt"), // değiştirilebilir simitli tabanlar: çoğu simit D biçimli
    (0x346E, "gt"),
    (0x3670, "gt"),
    (0x16D0, "round"),
    (0x2433, "formula"),
    (0x3416, "gt"),
    (0x1DD2, "round"),
    (0x1FC9, "round"),
    (0x11FF, "gt"),
    (0x0F0D, "round"),
    (0x0E8F, "round"),
    (0x045E, "round"), // yalnız adı "wheel" içerenler (eski direksiyonlar); oyun kolları elenir
];

/// Ad ve VID'den biçim + direksiyon olup olmadığı
pub fn classify(name: &str, vid: u16) -> (&'static str, bool) {
    let n = name.to_lowercase();
    let has = |ws: &[&str]| ws.iter().any(|w| n.contains(w));
    let not_wheel = has(&[
        "pedal",
        "shifter",
        "handbrake",
        "hand brake",
        "button box",
        "gamepad",
        "controller",
        "joystick",
        "throttle",
        "keyboard",
        "mouse",
        "headset",
        "xinput",
    ]);
    let named_wheel = has(&[
        "wheel",
        "racing",
        "direct drive",
        "wheelbase",
        "wheel base",
        "force feedback",
        "ffb",
        "steering",
    ]);
    let vendor = VENDORS.iter().find(|(v, _)| *v == vid).map(|(_, s)| *s);
    // Microsoft VID'i oyun kollarında da kullanılır: orada ad şartı aranır
    let wheel = !not_wheel
        && (named_wheel || (vendor.is_some() && vid != 0x045E && vid != 0x0F0D && vid != 0x0E8F));
    let shape = if has(&["truck", "tsw", "bus "]) {
        "truck"
    } else if has(&["formula", " f1", "f1 ", "sf1000", "open wheel", "fx "]) {
        "formula"
    } else if has(&["gt3", "gte", "gt wheel", "gt rim", "d-shape", "flat bottom"]) {
        "gt"
    } else if has(&["round", "rally", "drift", "classic"]) {
        "round"
    } else {
        vendor.unwrap_or("round")
    };
    (shape, wheel)
}

fn make(name: String, vid: u16, pid: u16) -> WheelDev {
    let (shape, wheel) = classify(&name, vid);
    WheelDev {
        name,
        vid,
        pid,
        shape,
        wheel,
    }
}

#[cfg(windows)]
fn enumerate() -> Vec<WheelDev> {
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };

    fn oem_name(vid: u16, pid: u16) -> Option<String> {
        let sub: Vec<u16> = format!("System\\CurrentControlSet\\Control\\MediaProperties\\PrivateProperties\\Joystick\\OEM\\VID_{vid:04X}&PID_{pid:04X}\0")
            .encode_utf16()
            .collect();
        let val: Vec<u16> = "OEMName\0".encode_utf16().collect();
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            let mut buf = [0u16; 256];
            let mut size = (buf.len() * 2) as u32;
            let rc = unsafe {
                RegGetValueW(
                    root,
                    sub.as_ptr(),
                    val.as_ptr(),
                    RRF_RT_REG_SZ,
                    std::ptr::null_mut(),
                    buf.as_mut_ptr() as *mut _,
                    &mut size,
                )
            };
            if rc == 0 {
                let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                let s = String::from_utf16_lossy(&buf[..n]).trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
        None
    }

    // Raw Input aygıt listesinden (WinMM / sürücü kodu çağrılmaz: direksiyon kapatılıp açılırken ya da simit
    // değiştirilirken programı çökertiyordu)
    crate::crashlog::crumb("wheel:detect");
    crate::ptt_win::game_devices()
        .into_iter()
        .map(|(hid_name, vid, pid)| {
            let name = oem_name(vid, pid).unwrap_or(if hid_name.is_empty() { format!("Joystick {vid:04X}:{pid:04X}") } else { hid_name });
            make(name, vid, pid)
        })
        .collect()
}

#[cfg(not(windows))]
fn enumerate() -> Vec<WheelDev> {
    Vec::new()
}

/// Takılı oyun kumandaları; direksiyon olduğu düşünülenler önce gelir
#[tauri::command]
pub fn wheel_detect() -> Vec<WheelDev> {
    let mut v = enumerate();
    v.sort_by_key(|d| !d.wheel);
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_devices() {
        assert_eq!(
            classify("G29 Driving Force Racing Wheel", 0x046D),
            ("round", true)
        );
        assert_eq!(classify("FANATEC Wheel", 0x0EB7), ("gt", true));
        assert_eq!(classify("Some Formula Wheel", 0x1234), ("formula", true));
        assert_eq!(classify("Truck Wheel", 0x346E), ("truck", true));
        assert!(!classify("Xbox Controller", 0x045E).1);
        assert!(!classify("CSL Pedals", 0x0EB7).1);
        let _ = make("x".into(), 0, 0);
    }
}
