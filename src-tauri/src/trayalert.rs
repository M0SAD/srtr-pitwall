//! Sistem tepsisi "okunmamış mesaj" göstergesi (Steam gibi): okunmamış arkadaş mesajı varken tepsi
//! simgesinin sağ üst köşesine kırmızı nokta çizilir ve ipucu metnine sayı eklenir; mesajlar okununca
//! simge eski haline döner. Sayıyı overlay penceresindeki arkadaş servisi (src/host/social.ts) bildirir;
//! "Rahatsız Etme" durumunda 0 gönderir (tepside uyarı çıkmaz).

use std::sync::atomic::{AtomicU32, Ordering};
use tauri::image::Image;
use tauri::AppHandle;

pub const TRAY_ID: &str = "main-tray";

static UNREAD: AtomicU32 = AtomicU32::new(0);

/// Şu an tepside gösterilen okunmamış mesaj sayısı (tepsi simgesine tıklanınca Arkadaşlar penceresi açılsın diye)
pub fn unread() -> u32 {
    UNREAD.load(Ordering::Relaxed)
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
