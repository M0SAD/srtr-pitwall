//! PRO üyelik durumu.
//!
//! Arayüz (panel ya da overlay penceresi) buluttan PRO bitiş tarihini ve PRO'ya ayrılmış overlay
//! listesini alıp buraya bildirir. Durum diske yazılır; böylece uygulama tepside başlasa ya da
//! internet olmasa da PRO süresi bitene kadar geçerli kalır.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Entitlement {
    /// PRO bitişi (unix ms), 0: PRO değil
    pub pro_until: u64,
    /// PRO'ya ayrılmış overlay kimlikleri
    pub locked: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementView {
    pub pro: bool,
    pub pro_until: u64,
    pub locked: Vec<String>,
}

#[derive(Default)]
pub struct EntitlementState(pub Mutex<Option<Entitlement>>);

const SALT: &str = "pitwall-ent-7c1e";

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Basit bütünlük kontrolü (FNV-1a); dosyanın elle değiştirilmesini zorlaştırır.
fn sign(body: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in SALT.bytes().chain(body.bytes()).chain(SALT.bytes().rev()) {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("entitlement.dat"))
}

fn load(app: &AppHandle) -> Entitlement {
    let Some(p) = path(app) else { return Entitlement::default() };
    let Ok(text) = std::fs::read_to_string(p) else { return Entitlement::default() };
    let Some((sig, body)) = text.split_once('\n') else { return Entitlement::default() };
    if sig.trim() != sign(body) {
        return Entitlement::default();
    }
    serde_json::from_str(body).unwrap_or_default()
}

fn save(app: &AppHandle, e: &Entitlement) {
    let (Some(p), Ok(body)) = (path(app), serde_json::to_string(e)) else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(p, format!("{}\n{}", sign(&body), body));
}

pub fn current(app: &AppHandle) -> Entitlement {
    let st = app.state::<EntitlementState>();
    let mut g = st.0.lock();
    if g.is_none() {
        *g = Some(load(app));
    }
    g.clone().unwrap_or_default()
}

pub fn view(app: &AppHandle) -> EntitlementView {
    let e = current(app);
    EntitlementView { pro: e.pro_until > now_ms(), pro_until: e.pro_until, locked: e.locked }
}

#[tauri::command]
pub fn entitlement_get(app: AppHandle) -> EntitlementView {
    view(&app)
}

#[tauri::command]
pub fn entitlement_set(app: AppHandle, value: Entitlement) -> EntitlementView {
    if current(&app) != value {
        save(&app, &value);
        *app.state::<EntitlementState>().0.lock() = Some(value);
        let _ = app.emit("entitlement", view(&app));
        if let Some(v) = crate::current_settings(&app) {
            crate::push_voice_cfg(&app, &v);
        }
    }
    view(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_changes_with_body() {
        assert_ne!(sign("{\"proUntil\":1}"), sign("{\"proUntil\":2}"));
        assert_eq!(sign("x"), sign("x"));
    }
}
