//! Canlı sohbetin gizli bilgileri: `<app_config>/livechat_secrets.json`.
//!
//! Dosya ayarlardan (settings.json, /api/settings ile yerel ağa açılabilir) ayrıdır. Her değer ayrı ayrı şifrelenir:
//!   Windows: DPAPI (CryptProtectData, kullanıcı kapsamı) → `"dpapi:<base64>"`; sadece aynı Windows kullanıcısı çözebilir.
//!   Diğer sistemler (geliştirme): `"b64:<base64>"` (şifresiz, sadece gizleme).
//! Eski sürümün düz metin değerleri (ör. Phase 1'deki "streamlabsToken") okunur ve ilk okumada şifrelenip yeniden yazılır.
//!
//! Anahtarlar: "streamlabsToken", "auth.twitch", "auth.youtube", "auth.kick" (JSON metni).

use base64::Engine;
use parking_lot::Mutex;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

static LOCK: Mutex<()> = parking_lot::const_mutex(());

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("livechat_secrets.json"))
}

fn read_file(app: &AppHandle) -> serde_json::Map<String, Value> {
    path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn write_file(app: &AppHandle, m: &serde_json::Map<String, Value>) -> Result<(), String> {
    let p = path(app).ok_or("klasör yok")?;
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&Value::Object(m.clone())).unwrap_or_default()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Değeri sakla (boş: sil)
pub fn set(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let _g = LOCK.lock();
    let mut m = read_file(app);
    if value.is_empty() {
        m.remove(key);
    } else {
        m.insert(key.to_string(), Value::String(seal(value)?));
    }
    write_file(app, &m)
}

/// Değeri oku (yoksa / çözülemezse boş). Düz metin eski değer şifrelenip yeniden yazılır.
pub fn get(app: &AppHandle, key: &str) -> String {
    let _g = LOCK.lock();
    let mut m = read_file(app);
    let Some(raw) = m.get(key).and_then(|v| v.as_str()).map(String::from) else { return String::new() };
    match open(&raw) {
        Some(v) => v,
        None if !raw.starts_with("dpapi:") && !raw.starts_with("b64:") => {
            // Eski düz metin: şifreleyip yaz
            if let Ok(s) = seal(&raw) {
                m.insert(key.to_string(), Value::String(s));
                let _ = write_file(app, &m);
            }
            raw
        }
        None => String::new(),
    }
}

/// JSON değer olarak sakla / oku
pub fn set_json(app: &AppHandle, key: &str, v: &Value) -> Result<(), String> {
    if v.is_null() {
        return set(app, key, "");
    }
    set(app, key, &v.to_string())
}

pub fn get_json(app: &AppHandle, key: &str) -> Option<Value> {
    let s = get(app, key);
    (!s.is_empty()).then(|| serde_json::from_str(&s).ok()).flatten()
}

fn b64() -> base64::engine::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

/// Şifrele: "dpapi:<b64>" (Windows) / "b64:<b64>"
pub fn seal(plain: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        let enc = dpapi::protect(plain.as_bytes())?;
        Ok(format!("dpapi:{}", b64().encode(enc)))
    }
    #[cfg(not(windows))]
    {
        Ok(format!("b64:{}", b64().encode(plain.as_bytes())))
    }
}

/// Çöz (ön ek yoksa / çözülemezse None)
pub fn open(sealed: &str) -> Option<String> {
    if let Some(rest) = sealed.strip_prefix("b64:") {
        return b64().decode(rest).ok().and_then(|b| String::from_utf8(b).ok());
    }
    if let Some(rest) = sealed.strip_prefix("dpapi:") {
        let bytes = b64().decode(rest).ok()?;
        #[cfg(windows)]
        {
            return dpapi::unprotect(&bytes).ok().and_then(|b| String::from_utf8(b).ok());
        }
        #[cfg(not(windows))]
        {
            let _ = bytes;
            return None;
        }
    }
    None
}

/// Kriptografik rastgele baytlar (PKCE, state). Windows: BCryptGenRandom; diğerleri: /dev/urandom.
pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut buf = vec![0u8; n];
    #[cfg(windows)]
    {
        if dpapi::random(&mut buf) {
            return buf;
        }
    }
    #[cfg(not(windows))]
    {
        use std::io::Read;
        if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
            if f.read_exact(&mut buf).is_ok() {
                return buf;
            }
        }
    }
    // Son çare: zaman + işlem kimliği + RandomState karması
    use sha2::{Digest, Sha256};
    use std::hash::{BuildHasher, Hasher};
    let mut out = Vec::with_capacity(n);
    let mut i = 0u64;
    while out.len() < n {
        let mut h = std::collections::hash_map::RandomState::new().build_hasher();
        h.write_u64(i);
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let d = Sha256::digest(format!("{}-{}-{}-{}", h.finish(), t, std::process::id(), i));
        out.extend_from_slice(&d);
        i += 1;
    }
    out.truncate(n);
    out
}

/// URL'de güvenli rastgele metin (base64url, dolgu yok)
pub fn random_token(bytes: usize) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random_bytes(bytes))
}

#[cfg(windows)]
#[path = "dpapi.rs"]
mod dpapi;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn seal_roundtrip() {
        let s = seal("gizli değer").unwrap();
        assert!(s.starts_with("b64:") || s.starts_with("dpapi:"));
        assert_eq!(open(&s).as_deref(), Some("gizli değer"));
        assert_eq!(open("düz metin"), None);
        let a = random_token(32);
        let b = random_token(32);
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
    }
}
