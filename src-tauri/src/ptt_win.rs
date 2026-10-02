//! Bas-konuş girişi (sadece Windows): klavye tuşu ve direksiyon / oyun kumandası düğmesi.
//!
//! Klavye: `GetAsyncKeyState` ile yoklanır (basma VE bırakma görülür, tuş yutulmaz, oyun öndeyken de çalışır).
//!
//! Direksiyon / kumanda düğmeleri iki yoldan okunur ve birleştirilir (biri görmese diğeri görür):
//!   1. Raw Input (HID): `RegisterRawInputDevices` + `RIDEV_INPUTSINK` ile pencere arka plandayken de WM_INPUT gelir;
//!      rapor `HidP_GetUsages` (Button sayfası 0x09) ile çözülür. Düğme sayısı sınırı yoktur (32'den fazla düğmeli
//!      direksiyonlar, düğme kutuları).
//!   2. WinMM `joyGetPosEx`: en çok 16 aygıt, aygıt başına ilk 32 düğme; HID çözümlemesi başarısız olursa yedek.
//! Aygıt kimliği iki yolda da USB üretici / ürün numarasıdır (VID:PID); düğme numarası 0'dan başlar
//! (HID Button usage N → N-1, WinMM bit N).
//!
//! Windows.Gaming.Input (RawGameController) bilerek kullanılmadı: masaüstü uygulamalarında yalnızca pencere
//! odaktayken veri verir; oyun öndeyken düğme görülmez.
//!
//! Bu dosya bilerek kendi başına (sadece std + windows-sys) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use windows_sys::Win32::Devices::HumanInterfaceDevice::{HidD_GetProductString, HidP_GetUsages, HidP_Input, HIDP_STATUS_SUCCESS};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND, INVALID_HANDLE_VALUE, SYSTEMTIME};
use windows_sys::Win32::Media::Multimedia::{joyGetDevCapsW, joyGetNumDevs, joyGetPosEx, JOYCAPSW, JOYERR_NOERROR, JOYINFOEX, JOY_RETURNBUTTONS};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::SystemInformation::GetLocalTime;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT};
use windows_sys::Win32::UI::Input::{
    GetRawInputData, GetRawInputDeviceInfoW, RegisterRawInputDevices, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_DEVNOTIFY, RIDEV_INPUTSINK, RIDEV_REMOVE,
    RIDI_DEVICEINFO, RIDI_DEVICENAME, RIDI_PREPARSEDDATA, RID_DEVICE_INFO, RID_INPUT, RIM_TYPEHID,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, PeekMessageW, RegisterClassW, HWND_MESSAGE, MSG, PM_REMOVE, WM_INPUT,
    WM_INPUT_DEVICE_CHANGE, WNDCLASSW,
};

/// Değiştirici bitleri (voicecmd::parse_key ile aynı)
pub const MOD_CTRL: u8 = 1;
pub const MOD_SHIFT: u8 = 2;
pub const MOD_ALT: u8 = 4;
pub const MOD_WIN: u8 = 8;

fn vk_down(vk: u32) -> bool {
    unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 }
}

/// Tuş (ve istenen değiştiriciler) şu an basılı mı
pub fn key_down(vk: u32, mods: u8) -> bool {
    if vk == 0 || !vk_down(vk) {
        return false;
    }
    (mods & MOD_CTRL == 0 || vk_down(VK_CONTROL as u32))
        && (mods & MOD_SHIFT == 0 || vk_down(VK_SHIFT as u32))
        && (mods & MOD_ALT == 0 || vk_down(VK_MENU as u32))
        && (mods & MOD_WIN == 0 || vk_down(VK_LWIN as u32) || vk_down(VK_RWIN as u32))
}

/// Yerel saat (saat, dakika)
pub fn local_time() -> (u32, u32) {
    unsafe {
        let mut t: SYSTEMTIME = std::mem::zeroed();
        GetLocalTime(&mut t);
        (t.wHour as u32, t.wMinute as u32)
    }
}

/// Basılı görülen bir düğme
#[derive(Clone, Debug, PartialEq)]
pub struct Pressed {
    pub vid: u16,
    pub pid: u16,
    pub button: u16,
    pub name: String,
}

struct HidDev {
    vid: u16,
    pid: u16,
    name: String,
    /// HidP ön çözümleme verisi (u64 hizalı tampon)
    preparsed: Vec<u64>,
    down: HashSet<u16>,
}

struct MmDev {
    id: u32,
    vid: u16,
    pid: u16,
    name: String,
    buttons: u32,
}

pub struct Input {
    hwnd: HWND,
    hid: HashMap<usize, HidDev>,
    mm: Vec<MmDev>,
    mm_scan: Option<Instant>,
    /// Yakalama (düğme atama) başladığında basılı olanlar: bunlar "yeni basış" sayılmaz
    baseline: Option<HashSet<(u16, u16, u16)>>,
    /// Raw Input kaydı başarılı mı (değilse yalnız WinMM)
    pub raw_ok: bool,
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn from_wide(buf: &[u16]) -> String {
    let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..n]).trim().to_string()
}

impl Input {
    /// İleti penceresini açar ve Raw Input'a kaydolur. Aynı iş parçacığında `pump` çağrılmalıdır.
    pub fn new() -> Input {
        let hwnd: HWND;
        let mut raw_ok = false;
        unsafe {
            let class = wide("SrtrPitwallPttInput");
            let hinst = GetModuleHandleW(std::ptr::null());
            let mut wc: WNDCLASSW = std::mem::zeroed();
            wc.lpfnWndProc = Some(DefWindowProcW);
            wc.hInstance = hinst;
            wc.lpszClassName = class.as_ptr();
            // Sınıf zaten kayıtlıysa (0 döner) pencere yine açılabilir
            RegisterClassW(&wc);
            hwnd = CreateWindowExW(0, class.as_ptr(), class.as_ptr(), 0, 0, 0, 0, 0, HWND_MESSAGE, std::ptr::null_mut(), hinst, std::ptr::null());
            if !hwnd.is_null() {
                // Genel Masaüstü sayfası (0x01): 0x04 joystick, 0x05 gamepad, 0x08 çok eksenli kumanda (direksiyonlar)
                let devs: Vec<RAWINPUTDEVICE> = [0x04u16, 0x05, 0x08]
                    .iter()
                    .map(|&u| RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: u, dwFlags: RIDEV_INPUTSINK | RIDEV_DEVNOTIFY, hwndTarget: hwnd })
                    .collect();
                raw_ok = RegisterRawInputDevices(devs.as_ptr(), devs.len() as u32, std::mem::size_of::<RAWINPUTDEVICE>() as u32) != 0;
            }
        }
        Input { hwnd, hid: HashMap::new(), mm: Vec::new(), mm_scan: None, baseline: None, raw_ok }
    }

    /// Bekleyen iletileri işle (WM_INPUT) ve WinMM aygıtlarını yokla. `all`: tüm WinMM aygıtları (yakalama),
    /// değilse yalnız `want` (VID, PID) aygıtı.
    pub fn pump(&mut self, all: bool, want: Option<(u16, u16)>) {
        unsafe {
            let mut msg: MSG = std::mem::zeroed();
            while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if msg.message == WM_INPUT {
                    self.on_input(msg.lParam as HANDLE);
                } else if msg.message == WM_INPUT_DEVICE_CHANGE && msg.wParam == 2 {
                    // GIDC_REMOVAL: aygıt çıkarıldı
                    self.hid.remove(&(msg.lParam as usize));
                }
                DispatchMessageW(&msg);
            }
        }
        if all || want.is_some() {
            self.poll_mm(all, want);
        } else {
            for d in self.mm.iter_mut() {
                d.buttons = 0;
            }
        }
    }

    unsafe fn device_info(h: HANDLE) -> Option<HidDev> {
        let mut info: RID_DEVICE_INFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<RID_DEVICE_INFO>() as u32;
        let mut size = info.cbSize;
        if GetRawInputDeviceInfoW(h, RIDI_DEVICEINFO, &mut info as *mut _ as *mut _, &mut size) as i32 <= 0 || info.dwType != RIM_TYPEHID {
            return None;
        }
        let (vid, pid) = (info.Anonymous.hid.dwVendorId as u16, info.Anonymous.hid.dwProductId as u16);
        // Ön çözümleme verisi
        let mut psize: u32 = 0;
        GetRawInputDeviceInfoW(h, RIDI_PREPARSEDDATA, std::ptr::null_mut(), &mut psize);
        if psize == 0 || psize > 1 << 20 {
            return None;
        }
        let mut preparsed = vec![0u64; (psize as usize + 7) / 8];
        if GetRawInputDeviceInfoW(h, RIDI_PREPARSEDDATA, preparsed.as_mut_ptr() as *mut _, &mut psize) as i32 <= 0 {
            return None;
        }
        // Ürün adı: aygıt yolu → CreateFileW (erişim istemeden) → HidD_GetProductString
        let mut name = String::new();
        let mut nlen: u32 = 0;
        GetRawInputDeviceInfoW(h, RIDI_DEVICENAME, std::ptr::null_mut(), &mut nlen);
        if nlen > 0 && nlen < 4096 {
            let mut path = vec![0u16; nlen as usize + 1];
            if GetRawInputDeviceInfoW(h, RIDI_DEVICENAME, path.as_mut_ptr() as *mut _, &mut nlen) as i32 > 0 {
                let f = CreateFileW(path.as_ptr(), 0, FILE_SHARE_READ | FILE_SHARE_WRITE, std::ptr::null(), OPEN_EXISTING, 0, std::ptr::null_mut());
                if f != INVALID_HANDLE_VALUE && !f.is_null() {
                    let mut buf = [0u16; 127];
                    if HidD_GetProductString(f, buf.as_mut_ptr() as *mut _, (buf.len() * 2) as u32) != 0 {
                        name = from_wide(&buf);
                    }
                    CloseHandle(f);
                }
            }
        }
        if name.is_empty() {
            name = format!("HID {vid:04X}:{pid:04X}");
        }
        Some(HidDev { vid, pid, name, preparsed, down: HashSet::new() })
    }

    unsafe fn on_input(&mut self, hraw: HANDLE) {
        let hdr = std::mem::size_of::<RAWINPUTHEADER>() as u32;
        let mut size: u32 = 0;
        GetRawInputData(hraw as _, RID_INPUT, std::ptr::null_mut(), &mut size, hdr);
        if size < hdr || size > 1 << 16 {
            return;
        }
        let mut buf = vec![0u64; (size as usize + 7) / 8];
        if GetRawInputData(hraw as _, RID_INPUT, buf.as_mut_ptr() as *mut _, &mut size, hdr) != size {
            return;
        }
        let raw = &*(buf.as_ptr() as *const RAWINPUT);
        if raw.header.dwType != RIM_TYPEHID {
            return;
        }
        let key = raw.header.hDevice as usize;
        if !self.hid.contains_key(&key) {
            match Self::device_info(raw.header.hDevice) {
                Some(d) => {
                    self.hid.insert(key, d);
                }
                None => return,
            }
        }
        let Some(dev) = self.hid.get_mut(&key) else { return };
        let (report_len, count) = (raw.data.hid.dwSizeHid as usize, raw.data.hid.dwCount as usize);
        let data = std::ptr::addr_of!(raw.data.hid.bRawData) as *const u8;
        // Tampon sınırı: başlık + RAWHID başlığı (8 bayt) + raporlar
        let avail = (size as usize).saturating_sub(hdr as usize + 8);
        if report_len == 0 || report_len.saturating_mul(count) > avail {
            return;
        }
        for i in 0..count {
            let report = data.add(i * report_len);
            let mut usages = [0u16; 256];
            let mut n: u32 = usages.len() as u32;
            let st = HidP_GetUsages(HidP_Input, 0x09, 0, usages.as_mut_ptr(), &mut n, dev.preparsed.as_ptr() as isize, report as *mut u8, report_len as u32);
            // Bu rapor kimliğinde düğme yoksa (çok raporlu aygıtlar) durum değişmez
            if st == HIDP_STATUS_SUCCESS {
                dev.down = usages[..(n as usize).min(usages.len())].iter().filter(|&&u| u > 0).map(|&u| u - 1).collect();
            }
        }
    }

    fn poll_mm(&mut self, all: bool, want: Option<(u16, u16)>) {
        let rescan = self.mm_scan.map(|t| t.elapsed() > Duration::from_secs(3)).unwrap_or(true);
        unsafe {
            if rescan {
                self.mm_scan = Some(Instant::now());
                let old: HashMap<u32, u32> = self.mm.iter().map(|d| (d.id, d.buttons)).collect();
                self.mm.clear();
                let n = joyGetNumDevs().min(16);
                for id in 0..n {
                    let mut caps: JOYCAPSW = std::mem::zeroed();
                    if joyGetDevCapsW(id as usize, &mut caps, std::mem::size_of::<JOYCAPSW>() as u32) != JOYERR_NOERROR {
                        continue;
                    }
                    // Takılı mı: konum okunabiliyorsa
                    let mut ji: JOYINFOEX = std::mem::zeroed();
                    ji.dwSize = std::mem::size_of::<JOYINFOEX>() as u32;
                    ji.dwFlags = JOY_RETURNBUTTONS as u32;
                    if joyGetPosEx(id, &mut ji) != JOYERR_NOERROR {
                        continue;
                    }
                    let (vid, pid) = (caps.wMid, caps.wPid);
                    let pname = caps.szPname;
                    let mut name = from_wide(&pname);
                    // WinMM adı çoğu zaman genel ("Microsoft PC-joystick driver"): HID adını yeğle
                    if let Some(h) = self.hid.values().find(|h| h.vid == vid && h.pid == pid) {
                        name = h.name.clone();
                    } else if name.is_empty() || name.to_lowercase().contains("pc-joystick") {
                        name = format!("Joystick {vid:04X}:{pid:04X}");
                    }
                    self.mm.push(MmDev { id, vid, pid, name, buttons: old.get(&id).copied().unwrap_or(0) });
                }
            }
            for d in self.mm.iter_mut() {
                if !all && want != Some((d.vid, d.pid)) {
                    d.buttons = 0;
                    continue;
                }
                let mut ji: JOYINFOEX = std::mem::zeroed();
                ji.dwSize = std::mem::size_of::<JOYINFOEX>() as u32;
                ji.dwFlags = JOY_RETURNBUTTONS as u32;
                d.buttons = if joyGetPosEx(d.id, &mut ji) == JOYERR_NOERROR { ji.dwButtons } else { 0 };
            }
        }
    }

    /// Bu aygıtın bu düğmesi şu an basılı mı (HID ya da WinMM)
    pub fn is_down(&self, vid: u16, pid: u16, button: u16) -> bool {
        self.hid.values().any(|d| d.vid == vid && d.pid == pid && d.down.contains(&button))
            || (button < 32 && self.mm.iter().any(|d| d.vid == vid && d.pid == pid && d.buttons & (1 << button) != 0))
    }

    fn all_down(&self) -> Vec<Pressed> {
        let mut out: Vec<Pressed> = Vec::new();
        for d in self.hid.values() {
            for &b in &d.down {
                out.push(Pressed { vid: d.vid, pid: d.pid, button: b, name: d.name.clone() });
            }
        }
        for d in &self.mm {
            for b in 0..32u16 {
                if d.buttons & (1 << b) != 0 && !out.iter().any(|p| p.vid == d.vid && p.pid == d.pid && p.button == b) {
                    out.push(Pressed { vid: d.vid, pid: d.pid, button: b, name: d.name.clone() });
                }
            }
        }
        out
    }

    /// Yakalamayı başlat: şu an basılı düğmeler (ör. sürekli açık anahtarlar) sayılmaz
    pub fn capture_begin(&mut self) {
        self.baseline = Some(self.all_down().into_iter().map(|p| (p.vid, p.pid, p.button)).collect());
    }

    pub fn capture_end(&mut self) {
        self.baseline = None;
    }

    /// Yakalama sürerken yeni basılan ilk düğme
    pub fn capture_poll(&mut self) -> Option<Pressed> {
        let now = self.all_down();
        let base = self.baseline.as_mut()?;
        // Bırakılan düğmeler yeniden basılınca sayılsın
        base.retain(|k| now.iter().any(|p| (p.vid, p.pid, p.button) == *k));
        now.into_iter().find(|p| !base.contains(&(p.vid, p.pid, p.button)))
    }

    /// Görülen aygıtlar (ad, VID, PID): arayüzdeki bilgi satırı için
    pub fn devices(&self) -> Vec<(String, u16, u16)> {
        let mut out: Vec<(String, u16, u16)> = Vec::new();
        for (name, vid, pid) in self.hid.values().map(|d| (&d.name, d.vid, d.pid)).chain(self.mm.iter().map(|d| (&d.name, d.vid, d.pid))) {
            if !out.iter().any(|x| x.1 == vid && x.2 == pid) {
                out.push((name.clone(), vid, pid));
            }
        }
        out
    }
}

impl Drop for Input {
    fn drop(&mut self) {
        if !self.hwnd.is_null() {
            unsafe {
                if self.raw_ok {
                    // Kaydı bırak: özellik kapalıyken WM_INPUT akışı sürmesin
                    let devs: Vec<RAWINPUTDEVICE> = [0x04u16, 0x05, 0x08]
                        .iter()
                        .map(|&u| RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: u, dwFlags: RIDEV_REMOVE, hwndTarget: std::ptr::null_mut() })
                        .collect();
                    RegisterRawInputDevices(devs.as_ptr(), devs.len() as u32, std::mem::size_of::<RAWINPUTDEVICE>() as u32);
                }
                DestroyWindow(self.hwnd);
            }
        }
    }
}
