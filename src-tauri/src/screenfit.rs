//! Pencereleri ekranın kullanılabilir alanına (görev çubuğu hariç, "work area") sığdırma.
//!
//! Bazı bilgisayarlarda (küçük ya da yüksek ölçekli ekranlar, %125–150) kontrol paneli ekrandan büyük açılıyor, alt
//! kısmı (arkadaş listesi) Windows görev çubuğunun altında kalıyordu: ilk boyut ekranın tamamına göre hesaplanıyordu ve
//! kayıtlı boyut ekrana sığıyor mu bakılmıyordu. Burada pencere hangi monitördeyse onun kullanılabilir alanına göre
//! küçültülür ve alanın içine çekilir. Tüm hesaplar fiziksel piksel.

use tauri::{AppHandle, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

/// (x, y, genişlik, yükseklik)
pub type Rect = (i32, i32, u32, u32);

/// Dikdörtgeni alanın içine sığdırır: önce boyut alana göre küçültülür, sonra konum alanın içine çekilir.
pub fn fit(r: Rect, area: Rect) -> Rect {
    let (ax, ay, aw, ah) = area;
    let w = r.2.min(aw);
    let h = r.3.min(ah);
    let x = r.0.clamp(ax, ax + (aw - w) as i32);
    let y = r.1.clamp(ay, ay + (ah - h) as i32);
    (x, y, w, h)
}

fn overlap(a: Rect, b: Rect) -> i64 {
    let ix = ((a.0 as i64 + a.2 as i64).min(b.0 as i64 + b.2 as i64) - (a.0 as i64).max(b.0 as i64)).max(0);
    let iy = ((a.1 as i64 + a.3 as i64).min(b.1 as i64 + b.3 as i64) - (a.1 as i64).max(b.1 as i64)).max(0);
    ix * iy
}

/// Monitörün kullanılabilir alanı (görev çubuğu hariç); sistem vermiyorsa monitörün tamamı
pub fn work_area(m: &Monitor) -> Rect {
    let wa = m.work_area();
    if wa.size.width >= 200 && wa.size.height >= 200 {
        (wa.position.x, wa.position.y, wa.size.width, wa.size.height)
    } else {
        (m.position().x, m.position().y, m.size().width, m.size().height)
    }
}

/// Dikdörtgenin en çok üstünde durduğu monitör (hiçbirinin üstünde değilse ana monitör)
pub fn monitor_for(app: &AppHandle, r: Rect) -> Option<Monitor> {
    let mons = app.available_monitors().unwrap_or_default();
    let best = mons
        .iter()
        .map(|m| (overlap(r, (m.position().x, m.position().y, m.size().width, m.size().height)), m))
        .max_by_key(|x| x.0)
        .filter(|x| x.0 > 0)
        .map(|x| x.1.clone());
    best.or_else(|| app.primary_monitor().ok().flatten()).or_else(|| mons.into_iter().next())
}

/// Pencereyi bulunduğu monitörün kullanılabilir alanına sığdırır (ekranı kaplamış / simge durumundaysa dokunmaz).
/// Çerçeveli pencerede başlık çubuğu da hesaba katılır (dış boyut sığdırılır).
pub fn fit_window(app: &AppHandle, w: &WebviewWindow) {
    if w.is_maximized().unwrap_or(false) || w.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(p), Ok(outer), Ok(inner)) = (w.outer_position(), w.outer_size(), w.inner_size()) else {
        return;
    };
    let r = (p.x, p.y, outer.width, outer.height);
    let Some(m) = monitor_for(app, r) else { return };
    let f = fit(r, work_area(&m));
    if f.2 != r.2 || f.3 != r.3 {
        let dw = outer.width.saturating_sub(inner.width);
        let dh = outer.height.saturating_sub(inner.height);
        let _ = w.set_size(PhysicalSize::new(f.2.saturating_sub(dw).max(200), f.3.saturating_sub(dh).max(150)));
    }
    if f.0 != r.0 || f.1 != r.1 {
        let _ = w.set_position(PhysicalPosition::new(f.0, f.1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fits_into_work_area() {
        // 1366×768 ekran, alttaki 40 px görev çubuğu: kullanılabilir alan 1366×728
        let area = (0, 0, 1366, 728);
        // Ekrandan büyük pencere: küçülür ve sol üste çekilir
        assert_eq!(fit((-20, 30, 1500, 900), area), (0, 0, 1366, 728));
        // Sığan ama altı görev çubuğuna taşan pencere: yukarı çekilir, boyutu değişmez
        assert_eq!(fit((100, 300, 1000, 600), area), (100, 128, 1000, 600));
        // Zaten sığıyorsa dokunulmaz
        assert_eq!(fit((50, 50, 800, 500), area), (50, 50, 800, 500));
        // İkinci monitör (sağda, görev çubuğu solda 60 px)
        assert_eq!(fit((1900, -10, 900, 700), (1980, 0, 1860, 1080)), (1980, 0, 900, 700));
    }

    #[test]
    fn overlap_picks_area() {
        assert_eq!(overlap((0, 0, 100, 100), (50, 50, 100, 100)), 2500);
        assert_eq!(overlap((0, 0, 100, 100), (200, 0, 100, 100)), 0);
    }
}
