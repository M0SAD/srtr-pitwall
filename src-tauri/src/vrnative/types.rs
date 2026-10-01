//! Yerel VR: platformdan bağımsız temel türler (win.rs ve openvr_gen.rs bunlara dayanır; tauri'ye bağımlı değildir).

/// OpenVR `HmdMatrix34_t`: 3 satır × 4 sütun (dönüş + öteleme), satır öncelikli
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HmdMatrix34 {
    pub m: [[f32; 4]; 3],
}

impl HmdMatrix34 {
    #[allow(dead_code)]
    pub const IDENTITY: HmdMatrix34 = HmdMatrix34 { m: [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0]] };
}

/// OpenVR `TrackedDevicePose_t` (80 bayt; bkz. openvr_capi_excerpt.h)
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct TrackedDevicePose {
    pub device_to_absolute: HmdMatrix34,
    pub velocity: [f32; 3],
    pub angular_velocity: [f32; 3],
    pub tracking_result: i32,
    pub pose_is_valid: u8,
    pub device_is_connected: u8,
}

/// Başlatmadan önceki durum yoklaması
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Probe {
    /// openvr_api.dll bulundu ve yüklendi
    pub dll: bool,
    /// SteamVR kurulu (VR_IsRuntimeInstalled)
    pub runtime: bool,
    /// Gözlük bağlı (VR_IsHmdPresent)
    pub hmd: bool,
}

#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum OpenError {
    /// openvr_api.dll bulunamadı / yüklenemedi
    Dll(String),
    NoRuntime,
    NoHmd,
    /// VR_InitInternal ya da arayüz hatası (SteamVR'ın açıklaması)
    Init(String),
}

/// Yapılandırma modunda fare kancasının biriktirdiği hareket (son okumadan beri)
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct MouseInput {
    pub left: (i32, i32),
    pub right: (i32, i32),
    pub middle: (i32, i32),
    /// Tekerlek çentiği (yukarı +)
    pub wheel: i32,
    pub shift: bool,
    pub ctrl: bool,
    /// Sağ tuş basılı (eksen kilidini bırakmak için)
    pub right_down: bool,
}

impl MouseInput {
    pub fn is_idle(&self) -> bool {
        self.left == (0, 0) && self.right == (0, 0) && self.middle == (0, 0) && self.wheel == 0
    }
}
