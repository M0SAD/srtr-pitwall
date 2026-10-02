//! VR modu: overlay'leri VR içi pencere yakalama araçlarının (OpenKneeboard, OVR Toolkit, Desktop+, XSOverlay…)
//! alabileceği sıradan pencereler olarak da açar.
//!
//! Normal overlay penceresi tüm ekranı kaplayan, tıklamaları geçiren, görev çubuğunda görünmeyen şeffaf bir
//! penceredir; yakalama araçları bunu ya listelemez ya da alfa kanalını alamaz. VR modunda ek olarak:
//!   - her açık overlay için ayrı bir pencere ("SRTR Pitwall - <Overlay adı>", içeriği kadar boyutlanır) ve/veya
//!   - tüm düzeni tek pencerede gösteren "SRTR Pitwall - VR Panosu"
//! açılır. Bu pencereler görev çubuğunda görünür, her zaman üstte değildir, tıklama geçirmez ve istenirse
//! opak (siyah / yeşil / özel renk) arka planlıdır. İstenirse masaüstünün dışına (ekranların sağına) konur.
//!
//! Yerel SteamVR (OpenVR) overlay'i ayrı bir modüldedir (deneysel, bkz. `vrnative`): çalışırken buradaki
//! "ayrı pencereler"i kullanır ve piksellerini doğrudan SteamVR'a gönderir (bkz. `effective_cfg`, `native_targets`).
//!
//! Ayarlar: `general.vr` (bkz. src/sdk/settings.ts VrSettings).

use parking_lot::Mutex;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

const PREFIX: &str = "vr-";
const BOARD_TITLE: &str = "SRTR Pitwall - VR Panosu";

/// VR modunda masaüstündeki normal overlay penceresi gizlensin mi (bkz. `sync_overlay_visibility`)
static HIDE_DESKTOP: AtomicBool = AtomicBool::new(false);
/// Açık VR pencereleri: etiket → imza (adres + yerleşim). İmza değişince pencere yeniden açılır.
static OPEN: Mutex<Option<HashMap<String, String>>> = parking_lot::const_mutex(None);

pub fn hide_desktop() -> bool {
    HIDE_DESKTOP.load(Ordering::Relaxed) || crate::vrnative::hides_desktop()
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct VrCfg {
    pub enabled: bool,
    /// Her overlay ayrı pencere
    pub windows: bool,
    /// Tüm düzen tek pencere
    pub board: bool,
    /// Opak arka plan rengi (rrggbb); boş: saydam
    pub bg: String,
    /// Masaüstünün dışına yerleştir
    pub offscreen: bool,
    /// Pencerelerin konacağı monitör (boş: ana monitör)
    pub monitor: Option<usize>,
    pub hide_desktop: bool,
}

pub fn cfg_from_settings(v: &Value) -> VrCfg {
    let d = v.pointer("/general/vr");
    let s = |k: &str| d.and_then(|x| x.get(k)).and_then(|x| x.as_str()).unwrap_or("");
    let b = |k: &str| d.and_then(|x| x.get(k)).and_then(|x| x.as_bool()).unwrap_or(false);
    let source = s("source");
    let bg = match s("background") {
        "black" => "000000".to_string(),
        "green" => "00ff00".to_string(),
        "custom" => {
            let c = s("color").trim_start_matches('#').to_ascii_lowercase();
            if c.len() == 6 && c.chars().all(|ch| ch.is_ascii_hexdigit()) { c } else { "000000".into() }
        }
        _ => String::new(),
    };
    VrCfg {
        enabled: b("enabled"),
        windows: source != "board",
        board: source == "board" || source == "both",
        bg,
        offscreen: s("place") == "offscreen",
        monitor: d.and_then(|x| x.get("monitor")).and_then(|x| x.as_u64()).map(|x| x as usize),
        hide_desktop: b("hideDesktop"),
    }
}

/// VR modunda WebView2'ye eklenen argümanlar: pencere başka bir pencerenin (ör. tam ekran oyunun) arkasında ya da
/// ekran dışında kalınca çizimi durdurmasın / yavaşlatmasın. Dönen: (kapatılacak özellik, ek argümanlar)
pub fn browser_flags(settings: Option<&Value>) -> Option<(&'static str, &'static str)> {
    // Yerel VR de aynı pencereleri yakalar: bir kez kullanıldıysa / otomatik başlatılıyorsa açılışta uygulanır
    let on = settings.map(|v| cfg_from_settings(v).enabled || crate::vrnative::wants_background_rendering(v)).unwrap_or(false);
    on.then_some((
        "CalculateNativeWinOcclusion",
        "--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling",
    ))
}

/// Pencere etiketinde geçerli karakterler (harf, rakam, - ve _)
pub fn safe(key: &str) -> String {
    key.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).collect()
}

fn hash8(s: &str) -> String {
    // FNV-1a: imza değişince etiket de değişsin (eski pencere kapanırken aynı etiketle yenisi açılamaz)
    let mut h: u32 = 0x811c9dc5;
    for b in s.bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    format!("{h:08x}")
}

#[derive(Debug, Clone, PartialEq)]
pub struct Wanted {
    /// Overlay kopya kimliği (pano için boş)
    pub key: String,
    pub label: String,
    pub url: String,
    pub title: String,
    pub board: bool,
}

/// Ayarlara göre açık olması gereken VR pencereleri (etkin düzenin açık overlay'leri + pano)
pub fn wanted(cfg: &VrCfg, settings: &Value) -> Vec<Wanted> {
    let mut out = Vec::new();
    if !cfg.enabled {
        return out;
    }
    let place = format!("{}:{:?}", cfg.offscreen, cfg.monitor);
    let bg = if cfg.bg.is_empty() { String::new() } else { format!("&bg={}", cfg.bg) };
    if cfg.board {
        let url = format!("overlay.html?vr=board{bg}");
        out.push(Wanted { key: String::new(), label: format!("{PREFIX}board-{}", hash8(&format!("{url}|{place}"))), url, title: BOARD_TITLE.into(), board: true });
    }
    if cfg.windows {
        let active = settings.get("activeProfile").and_then(|x| x.as_str()).unwrap_or("default");
        let ovs = settings.pointer("/profiles").and_then(|p| p.get(active)).and_then(|p| p.get("overlays")).and_then(|o| o.as_object());
        let mut keys: Vec<(&String, &Value)> = ovs.map(|o| o.iter().collect()).unwrap_or_default();
        keys.sort_by(|a, b| a.0.cmp(b.0));
        for (key, o) in keys {
            if !o.get("enabled").and_then(|x| x.as_bool()).unwrap_or(false) {
                continue;
            }
            let ty = o.get("type").and_then(|x| x.as_str()).unwrap_or(key);
            let url = format!(
                "overlay.html?only={}&key={}&layout={}&vr=1{bg}",
                crate::server::url_encode(ty),
                crate::server::url_encode(key),
                crate::server::url_encode(active)
            );
            // Geçici başlık; pencere açılınca overlay'in görünen adıyla değişir (bkz. `vr_fit`)
            out.push(Wanted { key: key.clone(), label: format!("{PREFIX}{}-{}", safe(key), hash8(&format!("{url}|{place}"))), url, title: format!("SRTR Pitwall - {key}"), board: false });
        }
    }
    out
}

/// Yerel VR (vrnative) çalışırken geçerli ayar: VR modu kapalı olsa da her overlay için ayrı pencere açılır ve
/// arka plan hep düz renktir (saydam seçiliyse siyah): yakalanan karede bu renk alfa=0 yapılır ya da opak kalır.
pub fn effective_cfg(settings: &Value, native: bool) -> VrCfg {
    let mut cfg = cfg_from_settings(settings);
    if native {
        if !cfg.enabled {
            cfg.enabled = true;
            cfg.board = false;
            cfg.hide_desktop = false;
        }
        cfg.windows = true;
        if cfg.bg.is_empty() {
            cfg.bg = "000000".into();
        }
    }
    cfg
}

/// Yerel VR'ın yakalayacağı pencereler: (kopya kimliği, pencere etiketi, görünen ad) ve arka plan rengi (rrggbb)
pub fn native_targets(app: &AppHandle) -> (Vec<(String, String, String)>, String) {
    let Some(settings) = crate::current_settings(app) else { return (Vec::new(), String::new()) };
    let cfg = effective_cfg(&settings, true);
    let list = wanted(&cfg, &settings)
        .into_iter()
        .filter(|w| !w.board)
        .map(|w| {
            // Pencere başlığı overlay'in görünen adıdır (bkz. `vr_fit`)
            let title = app.get_webview_window(&w.label).and_then(|x| x.title().ok()).unwrap_or(w.title);
            let name = title.strip_prefix("SRTR Pitwall - ").unwrap_or(&title).to_string();
            (w.key, w.label, name)
        })
        .collect();
    (list, cfg.bg)
}

/// Ayar değişince / monitör düzeni değişince: VR pencerelerini aç, kapat, yerleştir.
/// Pencere oluşturduğu için ana iş parçacığında (eşzamanlı komut içinde) çağrılmamalı.
pub fn sync(app: &AppHandle, settings: &Value) {
    let own = cfg_from_settings(settings);
    HIDE_DESKTOP.store(own.enabled && own.hide_desktop, Ordering::Relaxed);
    let cfg = effective_cfg(settings, crate::vrnative::running());
    let list = wanted(&cfg, settings);

    let mut g = OPEN.lock();
    let open = g.get_or_insert_with(HashMap::new);
    for (label, w) in app.webview_windows() {
        if label.starts_with(PREFIX) && !list.iter().any(|x| x.label == label) {
            let _ = w.destroy();
            open.remove(&label);
        }
    }
    if list.is_empty() {
        return;
    }

    let Some(main) = app.get_webview_window("overlay") else { return };
    let monitors = main.available_monitors().unwrap_or_default();
    let primary = main.primary_monitor().ok().flatten().or_else(|| monitors.first().cloned());
    // Pano, overlay'lerin yerleştirildiği (varsayılan) monitörün boyutunda olmalı
    let def = settings
        .pointer("/general/monitor")
        .and_then(|x| x.as_u64())
        .and_then(|i| monitors.get(i as usize).cloned())
        .or_else(|| primary.clone());
    let target = cfg.monitor.and_then(|i| monitors.get(i).cloned()).or_else(|| primary.clone());
    let (base_x, base_y) = if cfg.offscreen {
        // Tüm ekranların sağında, görünmeyen bir alan
        let right = monitors.iter().map(|m| m.position().x + m.size().width as i32).max().unwrap_or(1920);
        let top = monitors.iter().map(|m| m.position().y).min().unwrap_or(0);
        (right + 200, top)
    } else {
        target.as_ref().map(|m| (m.position().x + 40, m.position().y + 40)).unwrap_or((40, 40))
    };

    for (i, x) in list.iter().enumerate() {
        if app.get_webview_window(&x.label).is_some() {
            continue;
        }
        let built = WebviewWindowBuilder::new(app, &x.label, WebviewUrl::App(x.url.clone().into()))
            .title(&x.title)
            .transparent(cfg.bg.is_empty())
            .decorations(false)
            .shadow(false)
            // Yakalama araçları pencereyi listelesin: görev çubuğunda görünür, her zaman üstte değil
            .skip_taskbar(false)
            .always_on_top(false)
            .resizable(false)
            .focused(false)
            .visible(false)
            .inner_size(480.0, 240.0)
            .additional_browser_args(crate::browser_args())
            .build();
        let w = match built {
            Ok(w) => w,
            Err(e) => {
                eprintln!("VR penceresi açılamadı ({}): {e}", x.label);
                continue;
            }
        };
        if x.board {
            let size = def.as_ref().map(|m| (m.size().width, m.size().height)).unwrap_or((1920, 1080));
            let _ = w.set_size(PhysicalSize::new(size.0, size.1));
            let _ = w.set_position(PhysicalPosition::new(base_x, base_y));
        } else {
            let off = 36 * (i as i32 % 12);
            let _ = w.set_position(PhysicalPosition::new(base_x + off, base_y + off));
        }
        let _ = w.show();
        open.insert(x.label.clone(), x.url.clone());
    }
}

/// VR overlay penceresi içeriğini ölçtü: pencereyi içeriğe sığdır ve başlığı overlay'in adına çevir.
#[tauri::command]
pub fn vr_fit(window: tauri::WebviewWindow, title: String, w: f64, h: f64) {
    let label = window.label();
    if !label.starts_with(PREFIX) || label.starts_with("vr-board-") {
        return;
    }
    let name: String = title.chars().filter(|c| !c.is_control()).take(60).collect();
    if !name.trim().is_empty() {
        let _ = window.set_title(&format!("SRTR Pitwall - {}", name.trim()));
    }
    if w.is_finite() && h.is_finite() {
        let _ = window.set_size(LogicalSize::new(w.clamp(60.0, 4000.0), h.clamp(40.0, 3000.0)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn settings(vr: Value) -> Value {
        json!({
            "general": { "vr": vr },
            "activeProfile": "default",
            "profiles": { "default": { "overlays": {
                "relative": { "type": "relative", "enabled": true },
                "fuel": { "type": "fuel", "enabled": false },
                "relative#2": { "type": "relative", "enabled": true },
            } } }
        })
    }

    #[test]
    fn config() {
        let c = cfg_from_settings(&settings(json!({ "enabled": true, "source": "both", "background": "custom", "color": "#12AbCd", "place": "offscreen", "monitor": 1, "hideDesktop": true })));
        assert!(c.enabled && c.windows && c.board && c.offscreen && c.hide_desktop);
        assert_eq!(c.bg, "12abcd");
        assert_eq!(c.monitor, Some(1));
        // Bozuk renk siyaha düşer, eksik ayar kapalı sayılır
        assert_eq!(cfg_from_settings(&settings(json!({ "background": "custom", "color": "kirmizi" }))).bg, "000000");
        assert_eq!(cfg_from_settings(&json!({})), VrCfg { windows: true, ..Default::default() });
        assert!(browser_flags(Some(&json!({}))).is_none());
        assert!(browser_flags(Some(&settings(json!({ "enabled": true })))).is_some());
    }

    #[test]
    fn windows_list() {
        let s = settings(json!({ "enabled": true, "source": "both", "background": "green" }));
        let c = cfg_from_settings(&s);
        let w = wanted(&c, &s);
        assert_eq!(w.len(), 3);
        assert!(w[0].board && w[0].url == "overlay.html?vr=board&bg=00ff00");
        assert!(w[1].label.starts_with("vr-relative-") && w[2].label.starts_with("vr-relative_2-"));
        assert!(w[2].url.contains("only=relative&key=relative%232") && w[2].url.contains("&vr=1&bg=00ff00"));
        assert!(w.iter().all(|x| x.label.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')));
        // Arka plan değişince etiket de değişir (pencere yeniden açılır)
        let s2 = settings(json!({ "enabled": true, "source": "both", "background": "black" }));
        assert_ne!(wanted(&cfg_from_settings(&s2), &s2)[1].label, w[1].label);
        // Kapalıyken pencere yok
        let off = settings(json!({ "enabled": false }));
        assert!(wanted(&cfg_from_settings(&off), &off).is_empty());
        assert!(w[0].key.is_empty() && w[2].key == "relative#2");
    }

    #[test]
    fn native_windows() {
        // VR modu kapalıyken yerel VR çalışıyorsa: yalnız ayrı pencereler, siyah (anahtar renk) arka plan
        let off = settings(json!({ "enabled": false, "background": "transparent" }));
        let c = effective_cfg(&off, true);
        assert!(c.enabled && c.windows && !c.board && c.bg == "000000");
        let w = wanted(&c, &off);
        assert_eq!(w.len(), 2);
        assert!(w.iter().all(|x| !x.board && x.url.contains("&vr=1&bg=000000")));
        // VR modu "sadece pano" iken de ayrı pencereler eklenir; seçilen renk korunur
        let board = settings(json!({ "enabled": true, "source": "board", "background": "green" }));
        let c = effective_cfg(&board, true);
        assert!(c.board && c.windows && c.bg == "00ff00");
        assert_eq!(wanted(&c, &board).len(), 3);
        // Yerel VR çalışmıyorken ayar olduğu gibi
        assert_eq!(effective_cfg(&board, false), cfg_from_settings(&board));
        // Bir kez kullanıldıysa WebView2 arka plan çizim ayarı açılışta uygulanır
        assert!(browser_flags(Some(&json!({ "general": { "vr": { "native": { "used": true } } } }))).is_some());
    }
}
