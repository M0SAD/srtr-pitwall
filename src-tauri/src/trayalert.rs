//! Sistem tepsisi "okunmamış mesaj" göstergesi (Steam gibi): okunmamış arkadaş mesajı varken tepsi
//! simgesinin sağ üst köşesine kırmızı nokta çizilir ve ipucu metnine sayı eklenir; mesajlar okununca
//! simge eski haline döner. Sayıyı overlay penceresindeki arkadaş servisi (src/host/social.ts) bildirir;
//! "Rahatsız Etme" durumunda 0 gönderir (tepside uyarı çıkmaz).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use tauri::image::Image;
use tauri::{AppHandle, Emitter, Manager};

pub const TRAY_ID: &str = "main-tray";

static UNREAD: AtomicU32 = AtomicU32::new(0);

/// Şu an tepside gösterilen okunmamış mesaj sayısı (tepsi simgesine tıklanınca panelde arkadaş listesi de açılsın diye)
pub fn unread() -> u32 {
    UNREAD.load(Ordering::Relaxed)
}

/// Tepsi simgesine okunmamış mesaj varken tıklandı: panel açılınca arkadaş listesini de göstersin
static OPEN_FRIENDS: AtomicBool = AtomicBool::new(false);

/// Tepsi tıklaması (okunmamış mesaj varken): panel açıksa olayı dinler, yeni açılıyorsa `tray_take_open` ile alır
pub fn request_open_friends(app: &AppHandle) {
    OPEN_FRIENDS.store(true, Ordering::Relaxed);
    let _ = app.emit_to("main", "tray-open-friends", ());
}

/// Panel: tepsiden "arkadaş listesini aç" isteği bekliyor mu (bir kez verilir)
#[tauri::command]
pub fn tray_take_open() -> bool {
    OPEN_FRIENDS.swap(false, Ordering::Relaxed)
}

// ---- Bildirim günlüğü (social.log) ----

/// Mesaj bildirimi günlüğü: uygulama veri klasöründe `social.log`. Mesaj metni ve oturum anahtarı YAZILMAZ;
/// sadece "mesaj geldi / kart gösterildi / ses çalındı / neden gösterilmedi" satırları (sorun bildirimi için).
pub fn log(app: &AppHandle, msg: &str) {
    use std::io::Write;
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let p = dir.join("social.log");
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let msg: String = msg.chars().filter(|c| !c.is_control()).take(240).collect();
    // Dosya büyümesin: 256 KB'ı geçince baştan başla
    let big = std::fs::metadata(&p).map(|m| m.len() > 256 * 1024).unwrap_or(false);
    static LOCK: parking_lot::Mutex<()> = parking_lot::Mutex::new(());
    let _g = LOCK.lock();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(!big).write(true).truncate(big).open(&p) {
        let _ = writeln!(f, "{} {:02}:{:02}:{:02}Z {msg}", secs / 86_400, (secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    }
}

/// Arkadaş servisi (overlay penceresi) ve panel günlüğe satır yazar
#[tauri::command]
pub fn social_log(app: AppHandle, line: String) {
    log(&app, &line);
}

// ---- Mesaj sesi ----

/// Windows'un kendi "bildirim" sesi (uygulamanın ses çıkışı açılamadıysa yedek)
#[cfg(windows)]
fn system_sound() {
    use windows::core::w;
    use windows::Win32::Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC};
    unsafe {
        let _ = PlaySoundW(w!("SystemAsterisk"), None, SND_ALIAS | SND_ASYNC);
    }
}

#[cfg(not(windows))]
fn system_sound() {}

/// Gelen mesaj sesi: iki kısa ton (880 → 1320 Hz), sesli mühendisin kullandığı ses çıkışından. Tarayıcı
/// tarafında çalınmaz: hiç tıklanmamış (ya da gizli) pencerede otomatik oynatma kuralı sesi engeller.
/// Ses aygıtı açılamadıysa Windows'un bildirim sesi çalınır.
#[tauri::command]
pub fn message_beep(app: AppHandle, volume: f32) {
    let v = if volume.is_finite() { volume.clamp(0.05, 1.0) } else { 0.6 };
    crate::audio::send(crate::audio::Cmd::Beep { freq: 880.0, ms: 100, volume: v, pan: 0.0 });
    crate::audio::send(crate::audio::Cmd::Beep { freq: 1320.0, ms: 130, volume: v, pan: 0.0 });
    std::thread::spawn(move || {
        // Ses iş parçacığı ilk komutta açılır: aygıt durumunu öğrenmesi için kısa bekleme
        std::thread::sleep(std::time::Duration::from_millis(400));
        if crate::audio::no_device() {
            system_sound();
            log(&app, "beep: ses aygiti acilamadi -> Windows bildirim sesi");
        } else {
            log(&app, "beep: calindi");
        }
    });
}

// ---- Arkadaş servisi için saat ----

/// Overlay penceresi oyun kapalıyken gizlidir; gizli sayfada tarayıcı zamanlayıcıları kısılır (dakikada bire
/// kadar) ve Realtime bağlantısının "kalp atışı" gecikip bağlantı düşer, mesaj anında gelmez. Bu yüzden
/// arkadaş servisi saatini buradan alır: olaylar gizli sayfada da hemen işlenir.
#[tauri::command]
pub fn social_tick_start(app: AppHandle) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::Relaxed) {
        return;
    }
    log(&app, &format!("servis basladi (surum {})", crate::display_version()));
    let _ = std::thread::Builder::new().name("social-tick".into()).spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let _ = app.emit_to("overlay", "social-tick", ());
    });
}

/// RGBA simgenin sağ üst köşesine beyaz çerçeveli kırmızı nokta çizer
fn badge(rgba: &mut [u8], w: u32, h: u32) {
    if w < 8 || h < 8 || rgba.len() < (w * h * 4) as usize {
        return;
    }
    let side = w.min(h) as f32;
    let r = side * 0.27;
    let ring = (side * 0.06).max(1.0);
    let cx = w as f32 - r - 0.5;
    let cy = r + 0.5;
    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let d = (dx * dx + dy * dy).sqrt();
            if d > r + 0.5 {
                continue;
            }
            // Kenarda yumuşak geçiş
            let a = (r + 0.5 - d).clamp(0.0, 1.0);
            let col: [f32; 3] = if d > r - ring { [255.0, 255.0, 255.0] } else { [235.0, 45.0, 45.0] };
            let i = ((y * w + x) * 4) as usize;
            let old_a = rgba[i + 3] as f32 / 255.0;
            for k in 0..3 {
                let old = rgba[i + k] as f32 * old_a;
                rgba[i + k] = (col[k] * a + old * (1.0 - a)).round().clamp(0.0, 255.0) as u8;
            }
            rgba[i + 3] = ((a + old_a * (1.0 - a)) * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
}

/// Okunmamış mesaj sayısını tepsiye yansıt. `text`: arayüz dilinde "3 okunmamış mesaj" (ipucu metnine eklenir).
#[tauri::command]
pub fn tray_unread(app: AppHandle, count: u32, text: Option<String>) {
    let prev = UNREAD.swap(count, Ordering::Relaxed);
    if prev != count {
        log(&app, &format!("tepsi: okunmamis {count}"));
    }
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    let base = format!("SRTR Pitwall {}", crate::display_version());
    let tip = match text.as_deref().map(str::trim).filter(|t| !t.is_empty() && count > 0) {
        Some(t) => format!("{base} · {}", t.chars().take(80).collect::<String>()),
        None => base,
    };
    let _ = tray.set_tooltip(Some(tip.as_str()));
    // Simge yalnızca "var / yok" değişince yeniden çizilir
    if (prev > 0) == (count > 0) {
        return;
    }
    let Some(icon) = app.default_window_icon() else { return };
    if count == 0 {
        let _ = tray.set_icon(Some(icon.clone()));
        return;
    }
    let (w, h) = (icon.width(), icon.height());
    let mut rgba = icon.rgba().to_vec();
    badge(&mut rgba, w, h);
    let _ = tray.set_icon(Some(Image::new_owned(rgba, w, h)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_paints_top_right_only() {
        let (w, h) = (32u32, 32u32);
        let mut px = vec![0u8; (w * h * 4) as usize];
        badge(&mut px, w, h);
        let at = |x: u32, y: u32| {
            let i = ((y * w + x) * 4) as usize;
            [px[i], px[i + 1], px[i + 2], px[i + 3]]
        };
        // Noktanın ortası kırmızı ve opak
        let c = at(23, 8);
        assert!(c[0] > 200 && c[1] < 80 && c[3] == 255);
        // Sol alt köşeye dokunulmaz
        assert_eq!(at(2, 29), [0, 0, 0, 0]);
    }

    #[test]
    fn badge_ignores_bad_buffers() {
        let mut px = vec![0u8; 10];
        badge(&mut px, 32, 32);
        assert!(px.iter().all(|v| *v == 0));
    }
}
