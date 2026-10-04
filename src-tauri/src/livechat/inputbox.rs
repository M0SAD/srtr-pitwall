//! Canlı Sohbet overlay'indeki "mesaj yazma kutusu" (PRO: `livechat.send`) için tıklanabilir bölge.
//!
//! Overlay penceresi normalde tıklamaları oyuna geçirir (`set_ignore_cursor_events(true)`), bu yüzden fare olayı
//! almaz. Kutu ekrandayken arayüz kutunun dikdörtgenini (pencere içi, fiziksel piksel) buraya bildirir; küçük bir iş
//! parçacığı imleci izler (~20/sn) ve imleç SADECE bu dikdörtgenin üstündeyken pencereyi tıklanabilir yapar. Kutuya
//! tıklanınca pencere öne gelir ve klavye kutuya geçer ("focus": kutu odaktayken pencere tıklanabilir kalır); odak
//! bırakılınca ("blur": Esc / gönderme / başka yere tıklama) pencere yeniden tıklama geçirir olur ve klavye, kutuya
//! tıklanmadan önce öndeki pencereye (oyuna) geri verilir.
//! Düzenleme modunda hiçbir şeye dokunulmaz (o modda pencere zaten fareyi alır).

use crate::engine::Shared;
use parking_lot::Mutex;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindow};

/// Pencerenin istemci alanına göre, fiziksel piksel
#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
struct Win {
    regions: HashMap<String, Rect>,
    /// Kutu odakta: imleç dışarı çıksa da pencere tıklanabilir kalır
    hold: bool,
    /// Pencereyi biz tıklanabilir yaptık
    open: bool,
    /// Kutuya gelinmeden önce öndeki pencere (HWND; 0: bilinmiyor)
    prev_fg: isize,
}

#[derive(Default)]
struct St {
    wins: HashMap<String, Win>,
    running: bool,
}

fn st() -> &'static Mutex<St> {
    static S: OnceLock<Mutex<St>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(St::default()))
}

fn editing(app: &AppHandle) -> bool {
    app.try_state::<Arc<Shared>>().map(|s| s.edit_mode.load(Ordering::Relaxed)).unwrap_or(false)
}

#[cfg(windows)]
fn own_hwnd(w: &WebviewWindow) -> isize {
    w.hwnd().map(|h| h.0 as isize).unwrap_or(0)
}

#[cfg(windows)]
fn foreground() -> isize {
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as isize }
}

/// Klavye odağını `prev` penceresine geri ver (yalnızca şu an öndeki pencere bizim overlay penceremizse)
#[cfg(windows)]
fn give_back(w: &WebviewWindow, prev: isize) {
    let own = own_hwnd(w);
    if prev != 0 && prev != own && own != 0 && foreground() == own {
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(prev as _);
        }
    }
}

#[cfg(not(windows))]
fn own_hwnd(_w: &WebviewWindow) -> isize {
    0
}

#[cfg(not(windows))]
fn foreground() -> isize {
    0
}

#[cfg(not(windows))]
fn give_back(_w: &WebviewWindow, _prev: isize) {}

/// İmleç bu pencerenin bölgelerinden birinin üstünde mi
fn inside(app: &AppHandle, w: &WebviewWindow, regions: &[Rect]) -> bool {
    let (Ok(c), Ok(o)) = (app.cursor_position(), w.inner_position()) else { return false };
    let (x, y) = (c.x - o.x as f64, c.y - o.y as f64);
    regions.iter().any(|r| x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
}

fn poll(app: AppHandle) {
    loop {
        std::thread::sleep(Duration::from_millis(50));
        // Kilit pencere çağrıları sırasında TUTULMAZ (pencere çağrıları ana iş parçacığını bekler)
        let snap: Vec<(String, Vec<Rect>, bool, bool)> = {
            let mut g = st().lock();
            if g.wins.is_empty() {
                g.running = false;
                return;
            }
            g.wins.iter().map(|(l, w)| (l.clone(), w.regions.values().copied().collect(), w.hold, w.open)).collect()
        };
        let edit = editing(&app);
        for (label, regions, hold, open) in snap {
            let Some(w) = app.get_webview_window(&label) else {
                st().lock().wins.remove(&label);
                continue;
            };
            if edit {
                // Düzenleme modu pencerenin fare durumunu kendi yönetir
                if let Some(x) = st().lock().wins.get_mut(&label) {
                    x.open = false;
                    x.hold = false;
                }
                continue;
            }
            let want = hold || inside(&app, &w, &regions);
            if want {
                if !open {
                    let fg = foreground();
                    if fg != 0 && fg != own_hwnd(&w) {
                        if let Some(x) = st().lock().wins.get_mut(&label) {
                            x.prev_fg = fg;
                        }
                    }
                }
                // Her turda yinelenir: görünürlük eşitlemesi (lib.rs) pencereyi yeniden tıklama geçirir yapmış olabilir
                let _ = w.set_ignore_cursor_events(false);
            } else if open {
                let _ = w.set_ignore_cursor_events(true);
            }
            if want != open {
                if let Some(x) = st().lock().wins.get_mut(&label) {
                    x.open = want;
                }
            }
        }
    }
}

/// Overlay'deki mesaj kutusunun durumu. `op`:
///   "region" → kutunun dikdörtgeni (`rect`; ekranda değilse boş → bölge kaldırılır)
///   "remove" → kutu kaldırıldı
///   "focus"  → kutu odağı aldı (pencere öne gelir, tıklanabilir kalır)
///   "blur"   → odak bırakıldı (pencere yeniden tıklama geçirir; klavye önceki pencereye döner)
#[tauri::command]
pub async fn livechat_input(app: AppHandle, window: WebviewWindow, id: String, op: String, rect: Option<Rect>) -> Result<(), String> {
    let label = window.label().to_string();
    if label != "overlay" && !label.starts_with("overlay-m") {
        return Ok(());
    }
    match op.as_str() {
        "region" | "remove" => {
            let rect = if op == "region" { rect.filter(|r| r.w > 1.0 && r.h > 1.0) } else { None };
            let start = {
                let mut g = st().lock();
                match rect {
                    Some(r) => {
                        g.wins.entry(label.clone()).or_default().regions.insert(id, r);
                    }
                    None => {
                        let mut restore = false;
                        if let Some(w) = g.wins.get_mut(&label) {
                            w.regions.remove(&id);
                            if w.regions.is_empty() {
                                restore = w.open || w.hold;
                                g.wins.remove(&label);
                            }
                        }
                        if restore && !editing(&app) {
                            drop(g);
                            let _ = window.set_ignore_cursor_events(true);
                            return Ok(());
                        }
                    }
                }
                let start = !g.wins.is_empty() && !g.running;
                if start {
                    g.running = true;
                }
                start
            };
            if start {
                let a = app.clone();
                std::thread::spawn(move || {
                    // Panic olursa (crash.log'a yazılır) izleyici yeniden başlatılabilsin
                    if crate::crashlog::guard(|| poll(a)).is_none() {
                        st().lock().running = false;
                    }
                });
            }
        }
        "focus" => {
            if editing(&app) {
                return Ok(());
            }
            if let Some(w) = st().lock().wins.get_mut(&label) {
                w.hold = true;
                w.open = true;
            }
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.set_focus();
        }
        "blur" => {
            let prev = {
                let mut g = st().lock();
                match g.wins.get_mut(&label) {
                    Some(w) if w.hold => {
                        w.hold = false;
                        Some(w.prev_fg)
                    }
                    _ => None,
                }
            };
            if let Some(prev) = prev {
                if !editing(&app) {
                    // Tıklama geçirgenliğini izleyici bir sonraki turda (≤50 ms) imlecin yerine göre geri kurar
                    give_back(&window, prev);
                }
            }
        }
        _ => return Err("Bilinmeyen işlem".into()),
    }
    Ok(())
}
