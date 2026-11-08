//! "Tarayıcı" overlay'i: her siteyi gösteren ayrı, çerçevesiz, tıklamaları geçiren tarayıcı penceresi.
//!
//! Webview overlay'i sayfayı overlay penceresinin içinde <iframe> ile açar; birçok site başka sayfaya gömülmeyi
//! yasaklar (X-Frame-Options / CSP frame-ancestors) ve boş görünür. Bu overlay sayfayı kendi penceresinde, en üst
//! düzey sayfa olarak açar: gömülme yasağı yoktur, oturum açma (çerezler) kalıcıdır. Pencere overlay penceresine
//! bağlıdır (sahibi o), overlay'in ekrandaki çerçevesinin tam üstüne yerleştirilir ve onunla birlikte gizlenir /
//! görünür. Düzenleme modunda gizlenir (çerçeve taşınıp boyutlandırılabilsin). Uzak sayfanın uygulamaya erişimi
//! yoktur (pencere etiketi "web-*" hiçbir izin listesinde değil).
use parking_lot::Mutex;
use std::collections::HashMap;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Default, PartialEq)]
struct Entry {
    url: String,
    owner: String,
    transparent: bool,
    css: String,
    /// Overlay ekranda ve bu kopya gösterilmek istiyor (düzenleme modu dışında)
    want: bool,
    interact: bool,
    muted: bool,
    zoom: f64,
    rect: (f64, f64, f64, f64),
}

static ENTRIES: Mutex<Option<HashMap<String, Entry>>> = Mutex::new(None);

fn label_of(key: &str) -> String {
    let k: String = key.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect();
    format!("web-{k}")
}

/// Kullanıcı CSS'ini sayfaya ekleyen betik (her yüklemede)
fn css_script(css: &str, transparent: bool) -> String {
    let mut all = String::new();
    if transparent {
        all.push_str("html,body{background:transparent!important}");
    }
    all.push_str(css);
    format!(
        "(function(){{var c={};function a(){{if(!document.documentElement)return setTimeout(a,30);var s=document.createElement('style');s.textContent=c;document.documentElement.appendChild(s);}}a();}})();",
        serde_json::to_string(&all).unwrap_or_else(|_| "\"\"".into())
    )
}

fn place(app: &AppHandle, w: &tauri::WebviewWindow, e: &Entry) {
    let Some(owner) = app.get_webview_window(&e.owner) else { return };
    let sf = owner.scale_factor().unwrap_or(1.0);
    let pos = owner.inner_position().unwrap_or_default();
    let (x, y, ww, hh) = e.rect;
    let _ = w.set_position(tauri::PhysicalPosition::new(
        pos.x + (x * sf).round() as i32,
        pos.y + (y * sf).round() as i32,
    ));
    let _ = w.set_size(tauri::PhysicalSize::new(
        ((ww * sf).round() as u32).max(40),
        ((hh * sf).round() as u32).max(30),
    ));
}

/// Görünürlük: sahibi (overlay penceresi) görünür, düzenleme modu kapalı ve kopya istiyorsa
fn apply_visibility(app: &AppHandle, label: &str, e: &Entry) {
    let Some(w) = app.get_webview_window(label) else { return };
    let owner_visible = app
        .get_webview_window(&e.owner)
        .and_then(|o| o.is_visible().ok())
        .unwrap_or(false);
    let edit = crate::shared(app).edit_mode.load(std::sync::atomic::Ordering::Relaxed);
    if e.want && owner_visible && !edit {
        place(app, &w, e);
        let _ = w.show();
        let _ = w.set_always_on_top(true);
        let _ = w.set_ignore_cursor_events(!e.interact);
    } else {
        let _ = w.hide();
    }
}

/// Overlay pencerelerinin görünürlüğü değişti (lib.rs sync_overlay_visibility)
pub fn sync(app: &AppHandle) {
    let list: Vec<(String, Entry)> = {
        let mut g = ENTRIES.lock();
        let m = g.get_or_insert_with(HashMap::new);
        // Sahibi (overlay penceresi) yeniden kurulunca bağlı pencere de kapanır: kaydı kalmasın
        m.retain(|k, _| app.get_webview_window(k).is_some());
        m.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    };
    for (label, e) in list {
        apply_visibility(app, &label, &e);
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn browser_set(
    app: AppHandle,
    key: String,
    owner: String,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    zoom: f64,
    muted: bool,
    interact: bool,
    transparent: bool,
    css: String,
    visible: bool,
) -> Result<(), String> {
    let label = label_of(&key);
    let parsed: tauri::Url = url.trim().parse().map_err(|_| "Adres geçersiz".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Adres http:// ya da https:// ile başlamalı".into());
    }
    let e = Entry {
        url: parsed.to_string(),
        owner,
        transparent,
        css,
        want: visible,
        interact,
        muted,
        zoom: zoom.clamp(0.25, 5.0),
        rect: (x, y, w.max(10.0), h.max(10.0)),
    };
    let prev = ENTRIES.lock().get_or_insert_with(HashMap::new).get(&label).cloned();
    let existing = app.get_webview_window(&label);
    // Şeffaflık ya da ek CSS değişti: pencere yeniden kurulur (yükleme betiği / pencere türü değişmez)
    let rebuild = match (&prev, &existing) {
        (Some(p), Some(_)) => p.transparent != e.transparent || p.css != e.css || p.owner != e.owner,
        _ => true,
    };
    if rebuild {
        if let Some(old) = existing {
            let _ = old.destroy();
        }
        crate::crashlog::crumb("webov:create");
        let mut b = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed.clone()))
            .title("SRTR Pitwall – Tarayıcı overlay'i")
            .decorations(false)
            .transparent(e.transparent)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .visible(false)
            .resizable(false)
            .shadow(false)
            .additional_browser_args(crate::browser_args())
            .initialization_script(css_script(&e.css, e.transparent));
        // Sahibi overlay penceresi: her zaman onun üstünde kalır
        if let Some(o) = app.get_webview_window(&e.owner) {
            b = b.parent(&o).map_err(|x| x.to_string())?;
        }
        let win = b.build().map_err(|x| x.to_string())?;
        let _ = win.set_zoom(e.zoom);
        crate::vr::set_muted(&win, e.muted);
    } else if let (Some(p), Some(win)) = (&prev, &existing) {
        if p.url != e.url {
            let _ = win.navigate(parsed);
        }
        if (p.zoom - e.zoom).abs() > 1e-6 {
            let _ = win.set_zoom(e.zoom);
        }
        if p.muted != e.muted {
            crate::vr::set_muted(win, e.muted);
        }
    }
    ENTRIES.lock().get_or_insert_with(HashMap::new).insert(label.clone(), e.clone());
    apply_visibility(&app, &label, &e);
    Ok(())
}

#[tauri::command]
pub fn browser_close(app: AppHandle, key: String) {
    let label = label_of(&key);
    ENTRIES.lock().get_or_insert_with(HashMap::new).remove(&label);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.destroy();
    }
}

#[tauri::command]
pub fn browser_reload(app: AppHandle, key: String) {
    if let Some(w) = app.get_webview_window(&label_of(&key)) {
        let _ = w.eval("location.reload()");
    }
}
