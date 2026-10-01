//! DPAPI (CryptProtectData) ve sistem rastgele sayı üreteci (sadece Windows). Bkz. secrets.rs

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    BCryptGenRandom, CryptProtectData, CryptUnprotectData, BCRYPT_USE_SYSTEM_PREFERRED_RNG, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

/// Uygulamaya özel ek "tuz" (aynı kullanıcının başka programları da DPAPI kullanır)
const ENTROPY: &[u8] = b"SRTR-Pitwall-livechat-v1";

fn blob(b: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: b.len() as u32, pbData: b.as_ptr() as *mut u8 }
}

pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    unsafe {
        let input = blob(data);
        let ent = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        let ok = CryptProtectData(&input, std::ptr::null(), &ent, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out);
        if ok == 0 || out.pbData.is_null() {
            return Err("DPAPI şifreleme başarısız".into());
        }
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as _);
        Ok(v)
    }
}

pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    unsafe {
        let input = blob(data);
        let ent = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        let ok = CryptUnprotectData(&input, std::ptr::null_mut(), &ent, std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out);
        if ok == 0 || out.pbData.is_null() {
            return Err("DPAPI çözme başarısız".into());
        }
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as _);
        Ok(v)
    }
}

pub fn random(buf: &mut [u8]) -> bool {
    unsafe { BCryptGenRandom(std::ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32, BCRYPT_USE_SYSTEM_PREFERRED_RNG) >= 0 }
}
