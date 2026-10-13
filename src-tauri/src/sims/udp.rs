//! UDP telemetrisi veren simler için ortak dinleyici (F1 23-25, DiRT Rally 2.0 / DiRT 4 / GRID, Forza, BeamNG).
//!
//! Her port için bir iş parçacığı soketi dinler; gelen paket içeriğine bakılarak sınıflanır (aynı porta birden
//! fazla oyun gönderebilir: F1 ve DiRT varsayılan olarak 20777 kullanır) ve kuyruğa konur. Kaynaklar
//! (`f1.rs`, `forza.rs`, ...) kuyruktan sadece kendi paketlerini alır.
//!
//! Portlar, ilgili oyun bu bilgisayarda çalışırken açılır (başka bir programın — ör. SimHub — aynı portu
//! kullanmasını engellememek için); "konsoldan da al" ayarı açıksa sürekli açık kalır. Soket 0.0.0.0'a
//! bağlanır: PlayStation / Xbox'taki F1 ve Forza da bilgisayarın IP adresine gönderebilir.
//!
//! Sınıflama ve ayrıştırma platformdan bağımsızdır; testler gerçek soketle Linux'ta da çalışır.

use std::collections::{HashMap, VecDeque};
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Paket türü (hangi oyun ailesi)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Proto {
    F1,
    Dirt,
    Forza,
    BeamNg,
}

impl Proto {
    fn idx(self) -> usize {
        match self {
            Proto::F1 => 0,
            Proto::Dirt => 1,
            Proto::Forza => 2,
            Proto::BeamNg => 3,
        }
    }
}

/// F1 23/24/25 başlık biçimi (m_packetFormat)
pub fn f1_format(b: &[u8]) -> Option<u16> {
    if b.len() < 29 {
        return None;
    }
    let f = u16::from_le_bytes([b[0], b[1]]);
    (matches!(f, 2023..=2025) && b[6] <= 15).then_some(f)
}

/// Paketin hangi oyundan geldiği (boyut ve başlıktan)
pub fn classify(b: &[u8]) -> Option<Proto> {
    if f1_format(b).is_some() {
        return Some(Proto::F1);
    }
    match b.len() {
        // Codemasters "extradata = 3" (66 float): DiRT Rally 2.0, DiRT Rally, DiRT 4, GRID
        264 => Some(Proto::Dirt),
        // Forza "Data Out": Sled 232, FM7 Dash 311, FH4/FH5 324, Forza Motorsport (2023) 331
        232 | 311 | 324 | 331 => Some(Proto::Forza),
        // LFS OutGauge (BeamNG): 92 ya da kimlikli 96 bayt; araç adı alanı yazdırılabilir
        92 | 96 if b[4..8].iter().all(|c| *c == 0 || c.is_ascii_graphic()) => Some(Proto::BeamNg),
        _ => None,
    }
}

const QUEUE_MAX: usize = 1500;

struct PortCtl {
    stop: Arc<AtomicBool>,
}

struct Hub {
    ports: Mutex<HashMap<u16, PortCtl>>,
    queue: Mutex<VecDeque<(Proto, Vec<u8>)>>,
    last: Mutex<[Option<Instant>; 4]>,
    /// Açılamayan portlar (başka program kullanıyor): port -> son deneme
    failed: Mutex<HashMap<u16, Instant>>,
}

fn hub() -> &'static Hub {
    static H: OnceLock<Hub> = OnceLock::new();
    H.get_or_init(|| Hub {
        ports: Mutex::new(HashMap::new()),
        queue: Mutex::new(VecDeque::new()),
        last: Mutex::new([None; 4]),
        failed: Mutex::new(HashMap::new()),
    })
}

/// Sadece bu portlar dinlensin (yenileri açılır, listede olmayanlar kapanır)
pub fn listen(ports: &[u16]) {
    let h = hub();
    let mut map = h.ports.lock().unwrap();
    map.retain(|p, c| {
        let keep = ports.contains(p);
        if !keep {
            c.stop.store(true, Ordering::Relaxed);
        }
        keep
    });
    for &p in ports {
        if p == 0 || map.contains_key(&p) {
            continue;
        }
        // Açılamayan port 10 sn'de bir yeniden denenir
        if h.failed.lock().unwrap().get(&p).map(|t| t.elapsed() < Duration::from_secs(10)).unwrap_or(false) {
            continue;
        }
        match UdpSocket::bind(("0.0.0.0", p)) {
            Ok(sock) => {
                h.failed.lock().unwrap().remove(&p);
                let stop = Arc::new(AtomicBool::new(false));
                let s2 = stop.clone();
                let _ = sock.set_read_timeout(Some(Duration::from_millis(300)));
                let spawned = std::thread::Builder::new().name(format!("udp-{p}")).spawn(move || run(sock, s2));
                if spawned.is_ok() {
                    map.insert(p, PortCtl { stop });
                }
            }
            Err(e) => {
                eprintln!("UDP {p} açılamadı: {e}");
                h.failed.lock().unwrap().insert(p, Instant::now());
            }
        }
    }
}

/// Dinlenen portlar
pub fn listening() -> Vec<u16> {
    let mut v: Vec<u16> = hub().ports.lock().unwrap().keys().copied().collect();
    v.sort();
    v
}

/// Açılamayan (başka programın kullandığı) portlar
pub fn failed_ports() -> Vec<u16> {
    let mut v: Vec<u16> = hub().failed.lock().unwrap().keys().copied().collect();
    v.sort();
    v
}

fn run(sock: UdpSocket, stop: Arc<AtomicBool>) {
    let mut buf = vec![0u8; 4096];
    while !stop.load(Ordering::Relaxed) {
        match sock.recv_from(&mut buf) {
            Ok((n, _)) => push(&buf[..n]),
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            // Windows: önceki gönderimin ICMP "ulaşılamadı" yanıtı (WSAECONNRESET) — yok sayılır
            Err(e) if e.kind() == std::io::ErrorKind::ConnectionReset => {}
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

/// Bir paketi sınıflayıp kuyruğa koyar (testler de kullanır)
pub fn push(b: &[u8]) {
    let Some(p) = classify(b) else { return };
    let h = hub();
    h.last.lock().unwrap()[p.idx()] = Some(Instant::now());
    let mut q = h.queue.lock().unwrap();
    if q.len() >= QUEUE_MAX {
        q.pop_front();
    }
    q.push_back((p, b.to_vec()));
}

/// Bu türden en son paketin zamanı
pub fn last_seen(p: Proto) -> Option<Instant> {
    hub().last.lock().unwrap()[p.idx()]
}

/// Son `within` içinde bu türden paket geldi mi
pub fn active(p: Proto, within: Duration) -> bool {
    last_seen(p).map(|t| t.elapsed() < within).unwrap_or(false)
}

/// Bu türün kuyruktaki paketlerini sırayla `out`a alır; diğer türlerin paketleri atılır
/// (aynı anda tek oyun çalışır).
pub fn drain(p: Proto, out: &mut Vec<Vec<u8>>) {
    let mut q = hub().queue.lock().unwrap();
    for (k, b) in q.drain(..) {
        if k == p {
            out.push(b);
        }
    }
}

/// Bu türün bekleyen paketlerini atar (kaynak yeni açılırken eski paketler işlenmesin)
pub fn clear(p: Proto) {
    hub().queue.lock().unwrap().retain(|(k, _)| *k != p);
}

/// Oyun süreç adları (küçük harf, Windows süreç listesi) -> o oyunun paket türü
pub fn proto_for_exe(exe: &str) -> Option<Proto> {
    let e = exe.to_ascii_lowercase();
    if e.starts_with("f1_") || e.starts_with("f1 ") {
        Some(Proto::F1)
    } else if e.contains("dirtrally") || e.starts_with("dirt") || e.starts_with("drt") || e.starts_with("grid") {
        Some(Proto::Dirt)
    } else if e.starts_with("forza") {
        Some(Proto::Forza)
    } else if e.starts_with("beamng") {
        Some(Proto::BeamNg)
    } else {
        None
    }
}

/// UDP ayarları (general.udp): portlar ve "konsoldan da al" (oyun bu bilgisayarda çalışmıyorken de dinle)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UdpCfg {
    /// F1 ve DiRT / GRID (Codemasters) portu
    pub codemasters: u16,
    pub forza: u16,
    pub beamng: u16,
    pub always: bool,
}

impl Default for UdpCfg {
    fn default() -> Self {
        UdpCfg { codemasters: 20777, forza: 5300, beamng: 4444, always: false }
    }
}

impl UdpCfg {
    pub fn from_settings(v: Option<&serde_json::Value>) -> UdpCfg {
        let d = UdpCfg::default();
        let Some(u) = v.and_then(|v| v.pointer("/general/udp")) else { return d };
        let port = |k: &str, def: u16| {
            u.get(k).and_then(|x| x.as_u64()).filter(|p| (1024..=65535).contains(p)).map(|p| p as u16).unwrap_or(def)
        };
        UdpCfg {
            codemasters: port("codemasters", d.codemasters),
            forza: port("forza", d.forza),
            beamng: port("beamng", d.beamng),
            always: u.get("always").and_then(|x| x.as_bool()).unwrap_or(false),
        }
    }

    pub fn port(&self, p: Proto) -> u16 {
        match p {
            Proto::F1 | Proto::Dirt => self.codemasters,
            Proto::Forza => self.forza,
            Proto::BeamNg => self.beamng,
        }
    }
}

/// Hangi portlar açık olmalı: istenen türler arasından oyunu çalışanlar (ya da `always`)
pub fn wanted_ports(cfg: &UdpCfg, wants: &[Proto], running: &[Proto]) -> Vec<u16> {
    let mut v: Vec<u16> = wants.iter().filter(|p| cfg.always || running.contains(p)).map(|p| cfg.port(*p)).collect();
    v.sort();
    v.dedup();
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_packets() {
        let mut f1 = vec![0u8; 1352];
        f1[0..2].copy_from_slice(&2025u16.to_le_bytes());
        f1[6] = 6;
        assert_eq!(classify(&f1), Some(Proto::F1));
        f1[0..2].copy_from_slice(&2022u16.to_le_bytes());
        assert_eq!(classify(&f1), None);
        assert_eq!(classify(&[0u8; 264]), Some(Proto::Dirt));
        assert_eq!(classify(&[0u8; 324]), Some(Proto::Forza));
        let mut og = vec![0u8; 96];
        og[4..8].copy_from_slice(b"beam");
        assert_eq!(classify(&og), Some(Proto::BeamNg));
        og[4] = 1;
        assert_eq!(classify(&og), None);
    }

    #[test]
    fn exe_names() {
        assert_eq!(proto_for_exe("F1_25.exe"), Some(Proto::F1));
        assert_eq!(proto_for_exe("f1_24.exe"), Some(Proto::F1));
        assert_eq!(proto_for_exe("dirtrally2.exe"), Some(Proto::Dirt));
        assert_eq!(proto_for_exe("grid_dx12.exe"), Some(Proto::Dirt));
        assert_eq!(proto_for_exe("forzahorizon5.exe"), Some(Proto::Forza));
        assert_eq!(proto_for_exe("beamng.drive.x64.exe"), Some(Proto::BeamNg));
        assert_eq!(proto_for_exe("iracingsim64dx11.exe"), None);
    }

    #[test]
    fn config_and_ports() {
        let v = serde_json::json!({"general": {"udp": {"forza": 9999, "beamng": 80, "always": true}}});
        let c = UdpCfg::from_settings(Some(&v));
        assert_eq!(c, UdpCfg { codemasters: 20777, forza: 9999, beamng: 4444, always: true });
        let d = UdpCfg::default();
        assert_eq!(wanted_ports(&d, &[Proto::F1, Proto::Dirt, Proto::Forza], &[Proto::Dirt]), vec![20777]);
        assert!(wanted_ports(&d, &[Proto::Forza], &[]).is_empty());
        assert_eq!(wanted_ports(&c, &[Proto::F1, Proto::Dirt, Proto::Forza, Proto::BeamNg], &[]), vec![4444, 9999, 20777]);
    }

    #[test]
    fn listens_on_real_socket() {
        let port = 39417;
        listen(&[port]);
        assert!(listening().contains(&port));
        let tx = UdpSocket::bind("127.0.0.1:0").unwrap();
        let mut og = vec![0u8; 96];
        og[4..8].copy_from_slice(b"beam");
        og[0] = 42;
        tx.send_to(&og, ("127.0.0.1", port)).unwrap();
        let t0 = Instant::now();
        let mut got = Vec::new();
        while got.is_empty() && t0.elapsed() < Duration::from_secs(3) {
            std::thread::sleep(Duration::from_millis(20));
            drain(Proto::BeamNg, &mut got);
        }
        assert_eq!(got.len(), 1);
        assert_eq!(got[0][0], 42);
        assert!(active(Proto::BeamNg, Duration::from_secs(5)));

        // Uçtan uca: F1 paketleri sokete -> F1 kaynağı -> oturum ve kare
        use crate::sims::Source;
        for p in crate::sims::f1::tests::sample(2025) {
            tx.send_to(&p, ("127.0.0.1", port)).unwrap();
        }
        let t0 = Instant::now();
        while !active(Proto::F1, Duration::from_secs(2)) && t0.elapsed() < Duration::from_secs(3) {
            std::thread::sleep(Duration::from_millis(20));
        }
        std::thread::sleep(Duration::from_millis(100));
        let mut src = crate::sims::f1::F1::open().expect("F1 kaynağı");
        assert!(src.connected());
        let sd = src.session_update().expect("oturum");
        assert_eq!(sd.track_name, "Monza");
        // Kare için yeni bir telemetri paketi
        let tele = crate::sims::f1::tests::sample(2025).into_iter().find(|p| p[6] == 6).unwrap();
        tx.send_to(&tele, ("127.0.0.1", port)).unwrap();
        let mut f = crate::model::Frame::default();
        let t0 = Instant::now();
        let mut ok = false;
        while !ok && t0.elapsed() < Duration::from_secs(3) {
            std::thread::sleep(Duration::from_millis(20));
            ok = src.read(&mut f);
        }
        assert!(ok);
        assert_eq!(f.gear, 7);
        assert_eq!(f.player_idx, 1);
        listen(&[]);
        assert!(!listening().contains(&port));
    }
}
