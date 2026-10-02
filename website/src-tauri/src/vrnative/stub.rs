//! Yerel VR: Windows dışı yer tutucu (geliştirme ortamı derlensin diye). Hiçbir şey çalıştırmaz.

use super::{HmdMatrix34, MouseInput, OpenError, Probe};
use std::path::PathBuf;

pub const SUPPORTED: bool = false;

pub fn probe(_dirs: &[PathBuf]) -> Probe {
    Probe::default()
}

pub struct Session;

impl Session {
    pub fn open(_dirs: &[PathBuf], _background: bool) -> Result<Session, OpenError> {
        Err(OpenError::Dll("Yerel VR sadece Windows'ta çalışır".into()))
    }
    pub fn poll_quit(&self) -> bool {
        false
    }
    pub fn hmd_pose(&self, _standing: bool) -> Option<HmdMatrix34> {
        None
    }
    pub fn create(&self, _key: &str, _name: &str) -> Result<u64, String> {
        Err("desteklenmiyor".into())
    }
    pub fn destroy(&self, _h: u64) {}
    pub fn set_raw(&self, _h: u64, _rgba: &[u8], _w: u32, _ht: u32) -> Result<(), String> {
        Ok(())
    }
    pub fn set_transform(&self, _h: u64, _standing: bool, _m: &HmdMatrix34) -> Result<(), String> {
        Ok(())
    }
    pub fn set_width(&self, _h: u64, _meters: f32) -> Result<(), String> {
        Ok(())
    }
    pub fn set_curvature(&self, _h: u64, _c: f32) -> Result<(), String> {
        Ok(())
    }
    pub fn set_alpha(&self, _h: u64, _a: f32) -> Result<(), String> {
        Ok(())
    }
    pub fn set_color(&self, _h: u64, _r: f32, _g: f32, _b: f32) -> Result<(), String> {
        Ok(())
    }
    pub fn set_sort_order(&self, _h: u64, _order: u32) -> Result<(), String> {
        Ok(())
    }
    pub fn show(&self, _h: u64) -> Result<(), String> {
        Ok(())
    }
    pub fn hide(&self, _h: u64) -> Result<(), String> {
        Ok(())
    }
    pub fn close(self) {}
}

/// Pencerenin istemci alanını BGRA olarak `buf` içine yakalar; (genişlik, yükseklik)
pub fn capture(_hwnd: isize, _buf: &mut Vec<u8>) -> Option<(u32, u32)> {
    None
}

pub mod mouse {
    use super::MouseInput;
    pub fn start(_exempt: Vec<isize>) -> Result<(), String> {
        Err("desteklenmiyor".into())
    }
    pub fn stop() {}
    pub fn take() -> MouseInput {
        MouseInput::default()
    }
}
