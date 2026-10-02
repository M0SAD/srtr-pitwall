//! Sesli mühendis altyazısı: motor bir mesaj çalmaya başlayınca "voice" konusuna (bkz. `engine::PUSHED`)
//! kimin konuştuğunu (mühendis / spotter) ve ne dediğini yayınlar; çalma bitince ya da kesilince
//! `speaking: false` gönderir. "Sesli Mühendis" overlay'i bunu hoparlör simgesi + altyazı olarak gösterir.
//!
//! Akış: `voice::Voice::say_now` → `start` (metin + tahmini süre) → ses iş parçacığı kayıtları çözünce
//! gerçek süreyi `duration` ile düzeltir, kanal boşalınca `end` çağırır.

use crate::engine::{Packet, Shared};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLine {
    /// Her mesajda artar (0: henüz hiç konuşulmadı)
    pub id: u64,
    /// "engineer" | "spotter" | "driver" (sesli komutta sürücünün sorusu)
    pub role: &'static str,
    pub text: String,
    /// Kayıtların toplam süresi (biliniyorsa), yoksa metin uzunluğundan tahmin
    pub duration_ms: u32,
    pub speaking: bool,
}

static SHARED: OnceLock<Arc<Shared>> = OnceLock::new();
static NEXT: AtomicU64 = AtomicU64::new(0);
static CUR: Mutex<Option<VoiceLine>> = parking_lot::const_mutex(None);

/// Uygulama açılışında bir kez: yayın için abonelik merkezi
pub fn init(shared: Arc<Shared>) {
    let _ = SHARED.set(shared);
}

fn publish(line: &VoiceLine) {
    if let (Some(sh), Ok(v)) = (SHARED.get(), serde_json::to_value(line)) {
        sh.push_topic("voice", &Packet::Voice(v));
    }
}

/// Okuma süresi tahmini (kayıt süresi bilinmiyorsa): karakter başına ~70 ms
pub fn estimate_ms(text: &str) -> u32 {
    (text.chars().count() as u32 * 70).clamp(700, 12_000)
}

/// Yeni mesaj çalınmaya başladı. Dönen kimlik `audio::Cmd::Say` ile ses iş parçacığına verilir.
pub fn start(spotter: bool, text: String) -> u64 {
    start_role(if spotter { "spotter" } else { "engineer" }, text)
}

/// Sesi olmayan satır (ör. sesli komutta sürücünün sorusu): `ms` sonra kendiliğinden biter
pub fn note(role: &'static str, text: String, ms: u32) {
    let id = start_role(role, text);
    duration(id, ms);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(ms as u64));
        end(id);
    });
}

fn start_role(role: &'static str, text: String) -> u64 {
    let id = NEXT.fetch_add(1, Ordering::Relaxed) + 1;
    let line = VoiceLine {
        id,
        role,
        duration_ms: estimate_ms(&text),
        text,
        speaking: true,
    };
    *CUR.lock() = Some(line.clone());
    publish(&line);
    id
}

/// Kayıtların gerçek toplam süresi öğrenildi
pub fn duration(id: u64, ms: u32) {
    let line = {
        let mut g = CUR.lock();
        match g.as_mut() {
            Some(l) if l.id == id && l.speaking && l.duration_ms != ms => {
                l.duration_ms = ms;
                l.clone()
            }
            _ => return,
        }
    };
    publish(&line);
}

/// Çalma bitti (ya da kesildi). Araya yeni mesaj girdiyse (kimlik farklı) yok sayılır.
pub fn end(id: u64) {
    let line = {
        let mut g = CUR.lock();
        match g.as_mut() {
            Some(l) if l.id == id && l.speaking => {
                l.speaking = false;
                l.clone()
            }
            _ => return,
        }
    };
    publish(&line);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle() {
        let a = start(false, "Kutuya gir.".into());
        let b = start(true, "Solda araç.".into());
        assert!(b > a);
        // Eski mesajın bitişi yeni mesajı kapatmaz
        end(a);
        assert!(CUR.lock().as_ref().unwrap().speaking);
        duration(b, 900);
        assert_eq!(CUR.lock().as_ref().unwrap().duration_ms, 900);
        end(b);
        let l = CUR.lock().clone().unwrap();
        assert!(!l.speaking);
        assert_eq!(l.role, "spotter");
        assert_eq!(estimate_ms(""), 700);
    }
}
