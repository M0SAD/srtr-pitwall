//! Windows: adlandırılmış paylaşımlı belleği salt okunur açma ve süreç listesi.

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Memory::{
    MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualQuery, MEMORY_BASIC_INFORMATION,
    MEMORY_MAPPED_VIEW_ADDRESS,
};

const FILE_MAP_READ: u32 = 0x0004;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Açık bir paylaşımlı bellek görünümü
pub struct Mapping {
    map: HANDLE,
    view: *const u8,
    len: usize,
}

impl Mapping {
    pub fn open(name: &str) -> Option<Mapping> {
        unsafe {
            let map = OpenFileMappingW(FILE_MAP_READ, 0, wide(name).as_ptr());
            if map.is_null() {
                return None;
            }
            let view: MEMORY_MAPPED_VIEW_ADDRESS = MapViewOfFile(map, FILE_MAP_READ, 0, 0, 0);
            if view.Value.is_null() {
                CloseHandle(map);
                return None;
            }
            let mut mbi: MEMORY_BASIC_INFORMATION = std::mem::zeroed();
            let n = VirtualQuery(view.Value as *const _, &mut mbi, std::mem::size_of::<MEMORY_BASIC_INFORMATION>());
            let len = if n == 0 { 0 } else { mbi.RegionSize };
            if len == 0 {
                UnmapViewOfFile(view);
                CloseHandle(map);
                return None;
            }
            Some(Mapping { map, view: view.Value as *const u8, len })
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    /// `off`'tan başlayan en fazla `n` baytı `dst`'ye kopyalar (sınır dışını kırpar)
    pub fn copy(&self, off: usize, n: usize, dst: &mut Vec<u8>) {
        let n = n.min(self.len.saturating_sub(off));
        dst.resize(n, 0);
        if n > 0 {
            unsafe { std::ptr::copy_nonoverlapping(self.view.add(off), dst.as_mut_ptr(), n) };
        }
    }

    /// Tek bir 32 bitlik sayaç (sürüm/paket numarası) okur
    pub fn u32_at(&self, off: usize) -> u32 {
        if off + 4 > self.len {
            return 0;
        }
        unsafe { std::ptr::read_volatile(self.view.add(off) as *const u32) }
    }
}

impl Drop for Mapping {
    fn drop(&mut self) {
        unsafe {
            UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS { Value: self.view as *mut _ });
            CloseHandle(self.map);
        }
    }
}

/// Çalışan süreçlerin exe adları (küçük harf). Okunamazsa boş.
pub fn process_names() -> Vec<String> {
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut e: PROCESSENTRY32W = std::mem::zeroed();
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut e);
        while ok != 0 {
            let end = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            out.push(String::from_utf16_lossy(&e.szExeFile[..end]).to_lowercase());
            ok = Process32NextW(snap, &mut e);
        }
        CloseHandle(snap);
    }
    out
}

/// Listelenen exe'lerden biri çalışıyor mu? Süreç listesi okunamazsa true (güvenli taraf).
pub fn any_running(names: &[&str]) -> bool {
    let list = process_names();
    list.is_empty() || list.iter().any(|p| names.iter().any(|n| p == n))
}
