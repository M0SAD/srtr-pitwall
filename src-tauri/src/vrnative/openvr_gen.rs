// scripts/openvr_gen.mjs üretir — ELLE DÜZENLEME. Kaynak: OpenVR SDK v2.5.1, headers/openvr_capi.h
#![allow(non_upper_case_globals, non_camel_case_types, non_snake_case, dead_code)]

use super::{HmdMatrix34, TrackedDevicePose};
use std::ffi::{c_char, c_void};

/// Başlığın ve paketlenen openvr_api.dll dosyasının alındığı OpenVR SDK etiketi
pub const OPENVR_TAG: &str = "v2.5.1";
pub const UNIVERSE_SEATED: i32 = 0;
pub const UNIVERSE_STANDING: i32 = 1;
pub const APP_OVERLAY: i32 = 2;
pub const APP_BACKGROUND: i32 = 3;
pub const EVENT_QUIT: i32 = 700;

/// Arayüz sürümü (VR_GetGenericInterface("FnTable:" + sürüm))
pub const IVRSYSTEM_VERSION: &str = "IVRSystem_022";
/// VR_IVRSystem_FnTable alanları, başlıktaki sırayla (indeks = tablodaki konum)
pub const IVRSYSTEM_FNS: [&str; 46] = [
    "GetRecommendedRenderTargetSize",
    "GetProjectionMatrix",
    "GetProjectionRaw",
    "ComputeDistortion",
    "GetEyeToHeadTransform",
    "GetTimeSinceLastVsync",
    "GetD3D9AdapterIndex",
    "GetDXGIOutputInfo",
    "GetOutputDevice",
    "IsDisplayOnDesktop",
    "SetDisplayVisibility",
    "GetDeviceToAbsoluteTrackingPose",
    "GetSeatedZeroPoseToStandingAbsoluteTrackingPose",
    "GetRawZeroPoseToStandingAbsoluteTrackingPose",
    "GetSortedTrackedDeviceIndicesOfClass",
    "GetTrackedDeviceActivityLevel",
    "ApplyTransform",
    "GetTrackedDeviceIndexForControllerRole",
    "GetControllerRoleForTrackedDeviceIndex",
    "GetTrackedDeviceClass",
    "IsTrackedDeviceConnected",
    "GetBoolTrackedDeviceProperty",
    "GetFloatTrackedDeviceProperty",
    "GetInt32TrackedDeviceProperty",
    "GetUint64TrackedDeviceProperty",
    "GetMatrix34TrackedDeviceProperty",
    "GetArrayTrackedDeviceProperty",
    "GetStringTrackedDeviceProperty",
    "GetPropErrorNameFromEnum",
    "PollNextEvent",
    "PollNextEventWithPose",
    "GetEventTypeNameFromEnum",
    "GetHiddenAreaMesh",
    "GetControllerState",
    "GetControllerStateWithPose",
    "TriggerHapticPulse",
    "GetButtonIdNameFromEnum",
    "GetControllerAxisTypeNameFromEnum",
    "IsInputAvailable",
    "IsSteamVRDrawingControllers",
    "ShouldApplicationPause",
    "ShouldApplicationReduceRenderingWork",
    "PerformFirmwareUpdate",
    "AcknowledgeQuit_Exiting",
    "GetAppContainerFilePaths",
    "GetRuntimeVersion",
];

/// Kullanılan IVRSystem işlevleri: tablo indeksi, Rust imzası ve başlıktaki C bildirimi
pub mod ivrsystem {
    use super::*;

    // void (OPENVR_FNTABLE_CALLTYPE *GetDeviceToAbsoluteTrackingPose)(ETrackingUniverseOrigin eOrigin, float fPredictedSecondsToPhotonsFromNow, struct TrackedDevicePose_t * pTrackedDevicePoseArray, uint32_t unTrackedDevicePoseArrayCount);
    pub const GetDeviceToAbsoluteTrackingPose: usize = 11;
    pub type FnGetDeviceToAbsoluteTrackingPose = unsafe extern "system" fn(eOrigin: i32, fPredictedSecondsToPhotonsFromNow: f32, pTrackedDevicePoseArray: *mut TrackedDevicePose, unTrackedDevicePoseArrayCount: u32);

    // bool (OPENVR_FNTABLE_CALLTYPE *PollNextEvent)(struct VREvent_t * pEvent, uint32_t uncbVREvent);
    pub const PollNextEvent: usize = 29;
    pub type FnPollNextEvent = unsafe extern "system" fn(pEvent: *mut c_void, uncbVREvent: u32) -> u8;

    // void (OPENVR_FNTABLE_CALLTYPE *AcknowledgeQuit_Exiting)();
    pub const AcknowledgeQuit_Exiting: usize = 43;
    pub type FnAcknowledgeQuit_Exiting = unsafe extern "system" fn();

    /// (ad, indeks, C bildirimi): birim testi alıntı başlıkla karşılaştırır
    pub const USED: [(&str, usize, &str); 3] = [
        ("GetDeviceToAbsoluteTrackingPose", GetDeviceToAbsoluteTrackingPose, "void (OPENVR_FNTABLE_CALLTYPE *GetDeviceToAbsoluteTrackingPose)(ETrackingUniverseOrigin eOrigin, float fPredictedSecondsToPhotonsFromNow, struct TrackedDevicePose_t * pTrackedDevicePoseArray, uint32_t unTrackedDevicePoseArrayCount);"),
        ("PollNextEvent", PollNextEvent, "bool (OPENVR_FNTABLE_CALLTYPE *PollNextEvent)(struct VREvent_t * pEvent, uint32_t uncbVREvent);"),
        ("AcknowledgeQuit_Exiting", AcknowledgeQuit_Exiting, "void (OPENVR_FNTABLE_CALLTYPE *AcknowledgeQuit_Exiting)();"),
    ];
}

/// Arayüz sürümü (VR_GetGenericInterface("FnTable:" + sürüm))
pub const IVROVERLAY_VERSION: &str = "IVROverlay_027";
/// VR_IVROverlay_FnTable alanları, başlıktaki sırayla (indeks = tablodaki konum)
pub const IVROVERLAY_FNS: [&str; 80] = [
    "FindOverlay",
    "CreateOverlay",
    "DestroyOverlay",
    "GetOverlayKey",
    "GetOverlayName",
    "SetOverlayName",
    "GetOverlayImageData",
    "GetOverlayErrorNameFromEnum",
    "SetOverlayRenderingPid",
    "GetOverlayRenderingPid",
    "SetOverlayFlag",
    "GetOverlayFlag",
    "GetOverlayFlags",
    "SetOverlayColor",
    "GetOverlayColor",
    "SetOverlayAlpha",
    "GetOverlayAlpha",
    "SetOverlayTexelAspect",
    "GetOverlayTexelAspect",
    "SetOverlaySortOrder",
    "GetOverlaySortOrder",
    "SetOverlayWidthInMeters",
    "GetOverlayWidthInMeters",
    "SetOverlayCurvature",
    "GetOverlayCurvature",
    "SetOverlayPreCurvePitch",
    "GetOverlayPreCurvePitch",
    "SetOverlayTextureColorSpace",
    "GetOverlayTextureColorSpace",
    "SetOverlayTextureBounds",
    "GetOverlayTextureBounds",
    "GetOverlayTransformType",
    "SetOverlayTransformAbsolute",
    "GetOverlayTransformAbsolute",
    "SetOverlayTransformTrackedDeviceRelative",
    "GetOverlayTransformTrackedDeviceRelative",
    "SetOverlayTransformTrackedDeviceComponent",
    "GetOverlayTransformTrackedDeviceComponent",
    "SetOverlayTransformCursor",
    "GetOverlayTransformCursor",
    "SetOverlayTransformProjection",
    "ShowOverlay",
    "HideOverlay",
    "IsOverlayVisible",
    "GetTransformForOverlayCoordinates",
    "WaitFrameSync",
    "PollNextOverlayEvent",
    "GetOverlayInputMethod",
    "SetOverlayInputMethod",
    "GetOverlayMouseScale",
    "SetOverlayMouseScale",
    "ComputeOverlayIntersection",
    "IsHoverTargetOverlay",
    "SetOverlayIntersectionMask",
    "TriggerLaserMouseHapticVibration",
    "SetOverlayCursor",
    "SetOverlayCursorPositionOverride",
    "ClearOverlayCursorPositionOverride",
    "SetOverlayTexture",
    "ClearOverlayTexture",
    "SetOverlayRaw",
    "SetOverlayFromFile",
    "GetOverlayTexture",
    "ReleaseNativeOverlayHandle",
    "GetOverlayTextureSize",
    "CreateDashboardOverlay",
    "IsDashboardVisible",
    "IsActiveDashboardOverlay",
    "SetDashboardOverlaySceneProcess",
    "GetDashboardOverlaySceneProcess",
    "ShowDashboard",
    "GetPrimaryDashboardDevice",
    "ShowKeyboard",
    "ShowKeyboardForOverlay",
    "GetKeyboardText",
    "HideKeyboard",
    "SetKeyboardTransformAbsolute",
    "SetKeyboardPositionForOverlay",
    "ShowMessageOverlay",
    "CloseMessageOverlay",
];

/// Kullanılan IVROverlay işlevleri: tablo indeksi, Rust imzası ve başlıktaki C bildirimi
pub mod ivroverlay {
    use super::*;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *FindOverlay)(char * pchOverlayKey, VROverlayHandle_t * pOverlayHandle);
    pub const FindOverlay: usize = 0;
    pub type FnFindOverlay = unsafe extern "system" fn(pchOverlayKey: *const c_char, pOverlayHandle: *mut u64) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *CreateOverlay)(char * pchOverlayKey, char * pchOverlayName, VROverlayHandle_t * pOverlayHandle);
    pub const CreateOverlay: usize = 1;
    pub type FnCreateOverlay = unsafe extern "system" fn(pchOverlayKey: *const c_char, pchOverlayName: *const c_char, pOverlayHandle: *mut u64) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *DestroyOverlay)(VROverlayHandle_t ulOverlayHandle);
    pub const DestroyOverlay: usize = 2;
    pub type FnDestroyOverlay = unsafe extern "system" fn(ulOverlayHandle: u64) -> i32;

    // char * (OPENVR_FNTABLE_CALLTYPE *GetOverlayErrorNameFromEnum)(EVROverlayError error);
    pub const GetOverlayErrorNameFromEnum: usize = 7;
    pub type FnGetOverlayErrorNameFromEnum = unsafe extern "system" fn(error: i32) -> *const c_char;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayColor)(VROverlayHandle_t ulOverlayHandle, float fRed, float fGreen, float fBlue);
    pub const SetOverlayColor: usize = 13;
    pub type FnSetOverlayColor = unsafe extern "system" fn(ulOverlayHandle: u64, fRed: f32, fGreen: f32, fBlue: f32) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayAlpha)(VROverlayHandle_t ulOverlayHandle, float fAlpha);
    pub const SetOverlayAlpha: usize = 15;
    pub type FnSetOverlayAlpha = unsafe extern "system" fn(ulOverlayHandle: u64, fAlpha: f32) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlaySortOrder)(VROverlayHandle_t ulOverlayHandle, uint32_t unSortOrder);
    pub const SetOverlaySortOrder: usize = 19;
    pub type FnSetOverlaySortOrder = unsafe extern "system" fn(ulOverlayHandle: u64, unSortOrder: u32) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayWidthInMeters)(VROverlayHandle_t ulOverlayHandle, float fWidthInMeters);
    pub const SetOverlayWidthInMeters: usize = 21;
    pub type FnSetOverlayWidthInMeters = unsafe extern "system" fn(ulOverlayHandle: u64, fWidthInMeters: f32) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayCurvature)(VROverlayHandle_t ulOverlayHandle, float fCurvature);
    pub const SetOverlayCurvature: usize = 23;
    pub type FnSetOverlayCurvature = unsafe extern "system" fn(ulOverlayHandle: u64, fCurvature: f32) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayTransformAbsolute)(VROverlayHandle_t ulOverlayHandle, ETrackingUniverseOrigin eTrackingOrigin, struct HmdMatrix34_t * pmatTrackingOriginToOverlayTransform);
    pub const SetOverlayTransformAbsolute: usize = 32;
    pub type FnSetOverlayTransformAbsolute = unsafe extern "system" fn(ulOverlayHandle: u64, eTrackingOrigin: i32, pmatTrackingOriginToOverlayTransform: *mut HmdMatrix34) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *ShowOverlay)(VROverlayHandle_t ulOverlayHandle);
    pub const ShowOverlay: usize = 41;
    pub type FnShowOverlay = unsafe extern "system" fn(ulOverlayHandle: u64) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *HideOverlay)(VROverlayHandle_t ulOverlayHandle);
    pub const HideOverlay: usize = 42;
    pub type FnHideOverlay = unsafe extern "system" fn(ulOverlayHandle: u64) -> i32;

    // EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayRaw)(VROverlayHandle_t ulOverlayHandle, void * pvBuffer, uint32_t unWidth, uint32_t unHeight, uint32_t unBytesPerPixel);
    pub const SetOverlayRaw: usize = 60;
    pub type FnSetOverlayRaw = unsafe extern "system" fn(ulOverlayHandle: u64, pvBuffer: *mut c_void, unWidth: u32, unHeight: u32, unBytesPerPixel: u32) -> i32;

    /// (ad, indeks, C bildirimi): birim testi alıntı başlıkla karşılaştırır
    pub const USED: [(&str, usize, &str); 13] = [
        ("FindOverlay", FindOverlay, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *FindOverlay)(char * pchOverlayKey, VROverlayHandle_t * pOverlayHandle);"),
        ("CreateOverlay", CreateOverlay, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *CreateOverlay)(char * pchOverlayKey, char * pchOverlayName, VROverlayHandle_t * pOverlayHandle);"),
        ("DestroyOverlay", DestroyOverlay, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *DestroyOverlay)(VROverlayHandle_t ulOverlayHandle);"),
        ("GetOverlayErrorNameFromEnum", GetOverlayErrorNameFromEnum, "char * (OPENVR_FNTABLE_CALLTYPE *GetOverlayErrorNameFromEnum)(EVROverlayError error);"),
        ("SetOverlayColor", SetOverlayColor, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayColor)(VROverlayHandle_t ulOverlayHandle, float fRed, float fGreen, float fBlue);"),
        ("SetOverlayAlpha", SetOverlayAlpha, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayAlpha)(VROverlayHandle_t ulOverlayHandle, float fAlpha);"),
        ("SetOverlaySortOrder", SetOverlaySortOrder, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlaySortOrder)(VROverlayHandle_t ulOverlayHandle, uint32_t unSortOrder);"),
        ("SetOverlayWidthInMeters", SetOverlayWidthInMeters, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayWidthInMeters)(VROverlayHandle_t ulOverlayHandle, float fWidthInMeters);"),
        ("SetOverlayCurvature", SetOverlayCurvature, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayCurvature)(VROverlayHandle_t ulOverlayHandle, float fCurvature);"),
        ("SetOverlayTransformAbsolute", SetOverlayTransformAbsolute, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayTransformAbsolute)(VROverlayHandle_t ulOverlayHandle, ETrackingUniverseOrigin eTrackingOrigin, struct HmdMatrix34_t * pmatTrackingOriginToOverlayTransform);"),
        ("ShowOverlay", ShowOverlay, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *ShowOverlay)(VROverlayHandle_t ulOverlayHandle);"),
        ("HideOverlay", HideOverlay, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *HideOverlay)(VROverlayHandle_t ulOverlayHandle);"),
        ("SetOverlayRaw", SetOverlayRaw, "EVROverlayError (OPENVR_FNTABLE_CALLTYPE *SetOverlayRaw)(VROverlayHandle_t ulOverlayHandle, void * pvBuffer, uint32_t unWidth, uint32_t unHeight, uint32_t unBytesPerPixel);"),
    ];
}
