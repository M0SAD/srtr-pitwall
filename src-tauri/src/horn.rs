//! Korna: PRO üye atadığı direksiyon düğmesine / tuşa basınca aynı iRacing sunucusunda uygulamayı kullanan herkes kornasını
//! duyar (duymak herkese açık; ayarlardan kapatılabilir).
//!
//! * Sinyal arayüzde (src/host/horn.ts) Supabase Realtime yayın kanalıyla ("horn:<SubSessionID>") gider; veritabanına
//!   yazılmaz. Buradaki komutlar: o anki oturum bağlamı (kanal ve gönderen kimliği) ve sesi çalmak.
//! * Çalmadan önce gönderen denetlenir: söylediği araç numarasındaki sürücünün adı, söylediği adla aynı olmalı
//!   (aynı sunucuda olmayan biri korna çaldıramaz).
//! * "Yakındakiler" kipinde ses mesafeye göre kısılır: aynı hizadan en yüksek, `near_m` metrede sessiz (iRacing diğer
//!   araçların yalnızca pist üzerindeki konumunu verir; sağ / sol ayrımı yok).
//! * Hazır kornalar programın içindedir; yöneticinin eklediği kornalar ilk çalındığında indirilir ve bu bilgisayarda
//!   saklanır (app_data/horns).

use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Oturum bağlamı (motor her karede günceller)
#[derive(Clone, Default)]
pub struct Ctx {
    /// Gerçek bir iRacing oturumu (demo / önizleme / tekrar değil)
    pub active: bool,
    pub sub: i64,
    pub me_idx: i32,
    pub me_name: String,
    pub track_m: f32,
    /// iRacing CarLeftRight (yanımdaki araç: 2 sol, 3 sağ, 4 iki yanda, 5 iki araç solda, 6 iki araç sağda)
    pub left_right: i32,
    /// Araç numarasına göre tur yüzdesi (-1: pistte değil)
    pub pct: Vec<f32>,
    /// Araç numarasına göre sürücü adı
    pub names: Vec<String>,
}

pub static CTX: Mutex<Option<Ctx>> = parking_lot::const_mutex(None);
static CACHE: Mutex<Option<HashMap<String, Arc<Vec<u8>>>>> = parking_lot::const_mutex(None);

/// Motor: her karede çağrılır (yalnızca değişen alanlar yazılır)
pub fn update(f: &crate::model::Frame, s: &crate::model::SessionData, real: bool, iracing: bool) {
    let mut g = CTX.lock();
    let c = g.get_or_insert_with(Ctx::default);
    c.active = real && iracing && !f.replay && s.sub_session_id > 0;
    c.sub = s.sub_session_id;
    c.me_idx = f.player_idx;
    c.track_m = s.track_length_km * 1000.0;
    c.left_right = f.car_left_right;
    if c.pct.len() != f.cars.len() {
        c.pct = vec![-1.0; f.cars.len()];
    }
    for (i, car) in f.cars.iter().enumerate() {
        c.pct[i] = car.pct;
    }
}

/// Motor: oturum bilgisi değişince (sürücü listesi)
pub fn set_drivers(s: &crate::model::SessionData) {
    let mut g = CTX.lock();
    let c = g.get_or_insert_with(Ctx::default);
    let mut names = vec![String::new(); crate::model::MAX_CARS];
    for d in s.drivers.iter().flatten() {
        if (0..names.len() as i32).contains(&d.car_idx) {
            names[d.car_idx as usize] = d.name.clone();
        }
    }
    c.me_name = if (0..names.len() as i32).contains(&s.player_idx) {
        names[s.player_idx as usize].clone()
    } else {
        String::new()
    };
    c.names = names;
}

pub fn norm(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// İki araç arasındaki pist mesafesi (m): tur yüzdesi farkı (en kısa yön) × pist uzunluğu
pub fn distance(a: f32, b: f32, track_m: f32) -> Option<f32> {
    if a < 0.0 || b < 0.0 || track_m <= 0.0 {
        return None;
    }
    let d = (a - b).abs().fract();
    Some(d.min(1.0 - d) * track_m)
}

/// Kulaklıkta yön: yanımdaki araç (spotter: solda / sağda) ve aradaki mesafe araç boyu kadarsa korna o yandan gelir.
/// iRacing diğer araçların yanal konumunu vermez; yalnızca kendi aracımın yanında araç olup olmadığını bildirir.
pub fn side_pan(left_right: i32, dist: f32) -> f32 {
    if dist > 10.0 {
        return 0.0;
    }
    match left_right {
        2 | 5 => -0.85,
        3 | 6 => 0.85,
        _ => 0.0,
    }
}

/// Mesafeye göre ses çarpanı: 25 m'ye kadar tam, `near_m`'de 0 (arası yumuşak)
pub fn near_gain(dist: f32, near_m: f32) -> f32 {
    let near_m = near_m.max(50.0);
    if dist <= 25.0 {
        return 1.0;
    }
    if dist >= near_m {
        return 0.0;
    }
    let x = (dist - 25.0) / (near_m - 25.0);
    (1.0 - x) * (1.0 - x)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HornContext {
    active: bool,
    sub: i64,
    me_idx: i32,
    me_name: String,
}

#[tauri::command]
pub fn horn_context() -> HornContext {
    let g = CTX.lock();
    match g.as_ref() {
        Some(c) => HornContext {
            active: c.active && c.me_idx >= 0 && !c.me_name.is_empty(),
            sub: c.sub,
            me_idx: c.me_idx,
            me_name: c.me_name.clone(),
        },
        None => HornContext {
            active: false,
            sub: 0,
            me_idx: -1,
            me_name: String::new(),
        },
    }
}

fn builtin(key: &str) -> Option<&'static [u8]> {
    Some(match key {
        "b:short" => include_bytes!("horns/short.wav"),
        "b:long" => include_bytes!("horns/long.wav"),
        "b:double" => include_bytes!("horns/double.wav"),
        "b:truck" => include_bytes!("horns/truck.wav"),
        "b:bike" => include_bytes!("horns/bike.wav"),
        _ => return None,
    })
}

/// Korna sesinin baytları: hazırsa programdan, değilse önbellekten ya da adresten (Supabase 'horns' kovası)
async fn sound(app: &AppHandle, key: &str, url: Option<&str>) -> Result<Arc<Vec<u8>>, String> {
    if let Some(b) = builtin(key) {
        return Ok(Arc::new(b.to_vec()));
    }
    if let Some(b) = CACHE.lock().as_ref().and_then(|m| m.get(key).cloned()) {
        return Ok(b);
    }
    let safe: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect();
    if safe.is_empty() {
        return Err("Korna bulunamadı".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("horns");
    let path = dir.join(format!("{safe}.wav"));
    let bytes = match std::fs::read(&path) {
        Ok(b) if !b.is_empty() => b,
        _ => {
            let url = url.unwrap_or("");
            // Yalnızca Supabase depolamasındaki 'horns' kovasından indirilir
            if !(url.starts_with("https://") && url.contains(".supabase.co/storage/v1/object/public/horns/")) {
                return Err("Korna bulunamadı".into());
            }
            let res = crate::livechat::net::http()?
                .get(url)
                .send()
                .await
                .map_err(|_| "Korna indirilemedi".to_string())?;
            if !res.status().is_success() {
                return Err("Korna indirilemedi".into());
            }
            let b = res.bytes().await.map_err(|_| "Korna indirilemedi".to_string())?.to_vec();
            if b.len() < 44 || b.len() > 2 * 1024 * 1024 || &b[0..4] != b"RIFF" {
                return Err("Korna dosyası geçersiz".into());
            }
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::write(&path, &b);
            b
        }
    };
    let arc = Arc::new(bytes);
    CACHE
        .lock()
        .get_or_insert_with(HashMap::new)
        .insert(key.to_string(), arc.clone());
    Ok(arc)
}

/// Korna çal. `from_idx` / `from_name`: gönderenin aracı ve adı (kendi önizlemesi / kendi kornası için -1).
/// `near_m` > 0: yalnızca bu mesafedeki araçlardan duyulur, ses mesafeyle kısılır. Çalındıysa true.
#[tauri::command]
pub async fn horn_play(
    app: AppHandle,
    key: String,
    url: Option<String>,
    from_idx: i32,
    from_name: Option<String>,
    volume: f32,
    near_m: Option<f32>,
) -> Result<bool, String> {
    let mut gain = volume.clamp(0.0, 2.0);
    let mut pan = 0.0f32;
    if from_idx >= 0 {
        let c = CTX.lock().clone().unwrap_or_default();
        if !c.active || from_idx == c.me_idx {
            return Ok(false);
        }
        // Gönderen gerçekten bu sunucuda, o araçta mı
        let name = c.names.get(from_idx as usize).cloned().unwrap_or_default();
        if name.is_empty() || norm(&name) != norm(from_name.as_deref().unwrap_or("")) {
            return Ok(false);
        }
        let me = c.pct.get(c.me_idx.max(0) as usize).copied().unwrap_or(-1.0);
        let them = c.pct.get(from_idx as usize).copied().unwrap_or(-1.0);
        let dist = distance(me, them, c.track_m);
        if let Some(d) = dist {
            pan = side_pan(c.left_right, d);
        }
        if let Some(n) = near_m.filter(|n| *n > 0.0) {
            match dist {
                Some(d) => gain *= near_gain(d, n),
                // Biri pistte değil (garaj / pit): mesafe bilinmez, çalınmaz
                None => return Ok(false),
            }
        }
    }
    if gain <= 0.01 {
        return Ok(false);
    }
    let bytes = sound(&app, &key, url.as_deref()).await?;
    // Çözülebiliyor mu (bozuk dosya ses iş parçacığına gitmesin)
    let ok = crate::crashlog::guard(|| rodio::Decoder::new(std::io::Cursor::new(bytes.as_ref().clone())).is_ok()).unwrap_or(false);
    if !ok {
        return Err("Korna dosyası geçersiz".into());
    }
    crate::audio::send(crate::audio::Cmd::Clip { bytes, volume: gain, pan });
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dist_and_gain() {
        assert_eq!(distance(0.1, 0.2, 1000.0).map(|d| d.round()), Some(100.0));
        // Çizginin iki yanı: 0.98 ile 0.02 arası 0.04 tur
        assert_eq!(distance(0.98, 0.02, 5000.0).map(|d| d.round()), Some(200.0));
        assert_eq!(distance(-1.0, 0.2, 1000.0), None);
        assert_eq!(near_gain(10.0, 300.0), 1.0);
        assert_eq!(near_gain(300.0, 300.0), 0.0);
        let mid = near_gain(150.0, 300.0);
        assert!(mid > 0.1 && mid < 0.5, "{mid}");
        assert_eq!(norm("  Erkin   Azcan "), "erkin azcan");
        assert_eq!(side_pan(2, 3.0), -0.85);
        assert_eq!(side_pan(6, 3.0), 0.85);
        assert_eq!(side_pan(2, 40.0), 0.0);
        assert_eq!(side_pan(4, 2.0), 0.0);
        for k in ["b:short", "b:long", "b:double", "b:truck", "b:bike"] {
            let b = builtin(k).unwrap();
            assert_eq!(&b[0..4], b"RIFF");
        }
    }
}
