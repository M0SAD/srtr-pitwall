//! Bilgisayar kimliği: Windows'un MachineGuid değeri (Linux'ta /etc/machine-id) tuzlanıp SHA-256 ile karılır.
//! Ham kimlik sunucuya gitmez; aynı hesabın kaç farklı bilgisayarda kullanıldığını anlamak için kullanılır.

use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Serialize)]
pub struct DeviceInfo {
    hash: String,
    label: String,
}

#[cfg(windows)]
fn machine_guid() -> Option<String> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let sub: Vec<u16> = "SOFTWARE\\Microsoft\\Cryptography\0".encode_utf16().collect();
    let val: Vec<u16> = "MachineGuid\0".encode_utf16().collect();
    let mut buf = [0u16; 128];
    let mut size = (buf.len() * 2) as u32;
    let rc = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            sub.as_ptr(),
            val.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut _,
            &mut size,
        )
    };
    if rc != 0 {
        return None;
    }
    let n = (size as usize / 2).saturating_sub(1).min(buf.len());
    Some(String::from_utf16_lossy(&buf[..n]))
}

#[cfg(not(windows))]
fn machine_guid() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id").ok().map(|s| s.trim().to_string())
}

fn computer_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::fs::read_to_string("/etc/hostname").map(|s| s.trim().to_string()))
        .unwrap_or_default()
}

pub fn info() -> DeviceInfo {
    let guid = machine_guid().unwrap_or_else(|| "unknown".into());
    let mut h = Sha256::new();
    h.update(b"srtr-pitwall-device:");
    h.update(guid.as_bytes());
    let hash: String = h.finalize().iter().take(16).map(|b| format!("{b:02x}")).collect();
    DeviceInfo { hash, label: computer_name() }
}

/// Bu bilgisayarın karma kimliği ve adı
#[tauri::command]
pub fn device_info() -> DeviceInfo {
    info()
}

#[cfg(test)]
mod tests {
    #[test]
    fn hash_is_stable_and_hex() {
        let a = super::info();
        let b = super::info();
        assert_eq!(a.hash, b.hash);
        assert_eq!(a.hash.len(), 32);
        assert!(a.hash.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
