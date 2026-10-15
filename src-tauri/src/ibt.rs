//! iRacing telemetri dosyası (.ibt) içe aktarma (Telemetri › "iRacing telemetri dosyası içe aktar").
//!
//! .ibt, canlı paylaşımlı bellekle aynı düzendedir: irsdk_header (112 bayt) + irsdk_diskSubHeader (oturum başlangıç
//! tarihi, kayıt sayısı) + değişken başlıkları + oturum bilgisi (YAML) + art arda kayıtlar (her biri `buf_len` bayt).
//! Kayıtlar canlı akıştaki gibi sırayla tur kaydedicisinden (laprec::Recorder) geçirilir: turlar, sektör / süre / iz
//! canlı kayıtla aynı biçimde çıkar. Dosyada canlı veride olmayan konum kanalları (Lat / Lon) da bulunur: içe
//! aktarılan turların izinde sürüş çizgisi olur.
//!
//! Aynı dosya iki kez içe aktarılırsa kopya tur oluşmasın: tur kimlikleri dosyanın oturum kimliğinden ve başlangıç
//! tarihinden türetilir (sunucuda (üye, yerel kimlik) tekildir).

use crate::laprec::{LapRecord, Recorder};
use crate::model::Frame;
use crate::sdk::{extract_frame, Header, VarIndex, HEADER_SIZE};

/// Disk alt başlığı (irsdk_diskSubHeader): başlıktan hemen sonra
const SUB_HEADER_SIZE: usize = 32;

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub file: String,
    pub track: String,
    pub car: String,
    pub laps: usize,
    pub with_line: usize,
    pub error: Option<String>,
}

fn rd_i64(b: &[u8], off: usize) -> i64 {
    b.get(off..off + 8)
        .map(|s| i64::from_le_bytes(s.try_into().unwrap()))
        .unwrap_or(0)
}
fn rd_f64(b: &[u8], off: usize) -> f64 {
    b.get(off..off + 8)
        .map(|s| f64::from_le_bytes(s.try_into().unwrap()))
        .unwrap_or(0.0)
}
fn rd_i32(b: &[u8], off: usize) -> i32 {
    b.get(off..off + 4)
        .map(|s| i32::from_le_bytes(s.try_into().unwrap()))
        .unwrap_or(0)
}

/// Dosya içeriğinden turları çıkarır. `data` tüm dosyadır.
pub fn laps_from_bytes(data: &[u8]) -> Result<(Vec<LapRecord>, crate::model::SessionData), String> {
    let h = Header::parse(data).ok_or("Dosya çok kısa: iRacing telemetri dosyası değil")?;
    if h.num_vars <= 0 || h.buf_len <= 0 || h.var_header_offset <= 0 {
        return Err("iRacing telemetri dosyası değil (başlık okunamadı)".into());
    }
    let start_date = rd_i64(data, HEADER_SIZE); // time_t (sn)
    let start_time = rd_f64(data, HEADER_SIZE + 8); // oturum zamanı (sn)
    let mut records = rd_i32(data, HEADER_SIZE + 28).max(0) as usize;
    let row0 = h.bufs[0].1.max(0) as usize;
    let len = h.buf_len as usize;
    if row0 < HEADER_SIZE + SUB_HEADER_SIZE || row0 >= data.len() {
        return Err("Telemetri kayıtları bulunamadı".into());
    }
    // Kayıt sayısı yazılmamışsa (yarıda kalan dosya) dosya boyundan
    let fit = (data.len() - row0) / len;
    if records == 0 || records > fit {
        records = fit;
    }
    // Oturum bilgisi (YAML; Latin-1 olabilir)
    let so = h.session_info_offset.max(0) as usize;
    let sl = h.session_info_len.max(0) as usize;
    let yaml_raw = data.get(so..so + sl).unwrap_or(&[]);
    let end = yaml_raw
        .iter()
        .position(|&c| c == 0)
        .unwrap_or(yaml_raw.len());
    let yaml: String = match std::str::from_utf8(&yaml_raw[..end]) {
        Ok(s) => s.to_string(),
        Err(_) => yaml_raw[..end].iter().map(|&c| c as char).collect(),
    };
    let session = crate::session::parse(&yaml);
    let ix = VarIndex::build(data, &h);

    let mut rec = Recorder::default();
    let mut f = Frame::default();
    let mut laps = Vec::new();
    for r in 0..records {
        let off = row0 + r * len;
        let Some(buf) = data.get(off..off + len) else {
            break;
        };
        extract_frame(&ix, buf, r as i32, &mut f);
        // Dosyada oyuncu indeksi yoksa oturum bilgisindeki (DriverCarIdx)
        if ix.player_car_idx.is_none() || f.player_idx < 0 {
            f.player_idx = session.player_idx;
        }
        crate::session::fill_lap_times(&mut f, &session);
        if let Some(l) = rec.update(&f, &session, "iracing", true) {
            laps.push(l);
        }
    }
    // Bekleyen son tur (süresi bekleniyordu) ölçülen süreyle
    if let Some(l) = rec.update(&f, &session, "iracing", false) {
        laps.push(l);
    }
    // Kararlı kimlikler ve gerçek sürüş zamanı
    let started_ms = if start_date > 0 {
        (start_date as u64) * 1000
    } else {
        crate::laprec::now_ms()
    };
    let sess_key = if session.sub_session_id > 0 {
        session.sub_session_id.to_string()
    } else {
        format!("{start_date}")
    };
    for l in laps.iter_mut() {
        // Canlı kayıtla aynı kimlik (laprec.rs): aynı oturumun turları yeniden yüklenince üzerine yazılır
        l.session_local = if session.sub_session_id > 0 {
            format!("iracing-ss{sess_key}-{}", l.session_num.max(0))
        } else {
            format!("ibt-{sess_key}-{}", l.session_num.max(0))
        };
        l.id = format!("{}-{}", l.session_local, l.lap);
        l.session_started = started_ms;
        // Sürüş anı: oturum başı + tur bitişinin yaklaşık oturum zamanı bilinmiyor; başlangıçtan tur sırasıyla
        let _ = start_time;
        l.ts = started_ms + (l.lap.max(0) as u64) * (l.lap_time.max(1.0) * 1000.0) as u64;
    }
    Ok((laps, session))
}

/// Otomatik içe aktarma: iRacing telemetri klasöründeki yeni .ibt dosyaları (son 48 saatte yazılmış, en az 30 sn'dir
/// değişmeyen, daha önce içe aktarılmamış). İçe aktarılanlar `seen` dosyasında tutulur (ad|boyut|zaman).
pub fn auto_scan(
    dir: &std::path::Path,
    queue: &std::path::Path,
    seen: &std::path::Path,
) -> Vec<ImportSummary> {
    let now = std::time::SystemTime::now();
    let mut known: Vec<String> = std::fs::read_to_string(seen)
        .map(|s| s.lines().map(|l| l.to_string()).collect())
        .unwrap_or_default();
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<(std::path::PathBuf, String)> = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if !p
            .extension()
            .map(|x| x.eq_ignore_ascii_case("ibt"))
            .unwrap_or(false)
        {
            continue;
        }
        let Ok(md) = e.metadata() else { continue };
        let Ok(mt) = md.modified() else { continue };
        let age = now.duration_since(mt).unwrap_or_default();
        if age < std::time::Duration::from_secs(30)
            || age > std::time::Duration::from_secs(48 * 3600)
        {
            continue;
        }
        let secs = mt
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let key = format!(
            "{}|{}|{}",
            p.file_name()
                .map(|x| x.to_string_lossy().to_string())
                .unwrap_or_default(),
            md.len(),
            secs
        );
        if !known.contains(&key) {
            files.push((p, key));
        }
    }
    files.sort();
    let mut out = Vec::new();
    for (p, key) in files.into_iter().take(20) {
        out.push(import_file(&p, queue));
        known.push(key);
    }
    if !out.is_empty() {
        // Son 500 kayıt yeter
        let start = known.len().saturating_sub(500);
        let _ = std::fs::write(seen, known[start..].join("\n"));
    }
    out
}

/// Dosyayı okuyup turları yerel yükleme kuyruğuna yazar (yükleme arayüzde, canlı turlar gibi).
pub fn import_file(path: &std::path::Path, queue: &std::path::Path) -> ImportSummary {
    let file = path
        .file_name()
        .map(|x| x.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut out = ImportSummary {
        file,
        ..Default::default()
    };
    if !path
        .extension()
        .map(|e| e.eq_ignore_ascii_case("ibt"))
        .unwrap_or(false)
    {
        out.error = Some("Dosya .ibt değil".into());
        return out;
    }
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(e) => {
            out.error = Some(format!("Dosya okunamadı: {e}"));
            return out;
        }
    };
    match laps_from_bytes(&data) {
        Ok((laps, s)) => {
            out.track = if s.track_config.is_empty() {
                s.track_name.clone()
            } else {
                format!("{} – {}", s.track_name, s.track_config)
            };
            out.car = s.player().map(|d| d.car_name.clone()).unwrap_or_default();
            for l in &laps {
                if l.trace.as_ref().map(|t| !t.lat.is_empty()).unwrap_or(false) {
                    out.with_line += 1;
                }
                if let Err(e) = crate::laprec::append(queue, l) {
                    out.error = Some(format!("Kuyruğa yazılamadı: {e}"));
                    break;
                }
                out.laps += 1;
            }
            if laps.is_empty() && out.error.is_none() {
                out.error = Some("Dosyada tamamlanmış tur yok".into());
            }
        }
        Err(e) => out.error = Some(e),
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sdk::{T_BITFIELD, T_BOOL, T_DOUBLE, T_FLOAT, T_INT, VAR_HEADER_SIZE};

    fn put_i32(b: &mut [u8], off: usize, v: i32) {
        b[off..off + 4].copy_from_slice(&v.to_le_bytes());
    }
    fn var(b: &mut [u8], base: usize, i: usize, name: &str, ty: u8, off: i32) {
        let o = base + i * VAR_HEADER_SIZE;
        put_i32(b, o, ty as i32);
        put_i32(b, o + 4, off);
        put_i32(b, o + 8, 1);
        b[o + 16..o + 16 + name.len()].copy_from_slice(name.as_bytes());
    }

    /// 3 tam tur + yarım tur süren sahte bir .ibt (60 Hz, 30 sn'lik turlar)
    fn fake_ibt() -> Vec<u8> {
        let vars: [(&str, u8, i32); 14] = [
            ("SessionTime", T_DOUBLE, 0),
            ("Lap", T_INT, 8),
            ("LapDistPct", T_FLOAT, 12),
            ("Speed", T_FLOAT, 16),
            ("Throttle", T_FLOAT, 20),
            ("Brake", T_FLOAT, 24),
            ("Gear", T_INT, 28),
            ("IsOnTrack", T_BOOL, 32),
            ("Lat", T_DOUBLE, 40),
            ("Lon", T_DOUBLE, 48),
            ("LapLastLapTime", T_FLOAT, 56),
            ("RPM", T_FLOAT, 60),
            ("SessionNum", T_INT, 64),
            ("SessionFlags", T_BITFIELD, 68),
        ];
        let buf_len = 80usize;
        let var_base = HEADER_SIZE + SUB_HEADER_SIZE;
        let yaml = "WeekendInfo:\n TrackDisplayName: Test Ring\n TrackConfigName: GP\n TrackID: 77\n TrackLength: 3.00 km\n SubSessionID: 987654\nSessionInfo:\n Sessions:\n - SessionNum: 0\n   SessionType: Practice\nDriverInfo:\n DriverCarIdx: 0\n Drivers:\n - CarIdx: 0\n   UserName: Test Driver\n   UserID: 5\n   CarID: 33\n   CarScreenName: Test Car\n   CarPath: testcar\n";
        let yaml_off = var_base + vars.len() * VAR_HEADER_SIZE;
        let row0 = yaml_off + yaml.len() + 16;
        let hz = 60.0;
        let lap_s = 30.0;
        let total = ((3.5 * lap_s) * hz) as usize;
        let mut b = vec![0u8; row0 + total * buf_len];
        put_i32(&mut b, 0, 2);
        put_i32(&mut b, 8, 60);
        put_i32(&mut b, 16, yaml.len() as i32);
        put_i32(&mut b, 20, yaml_off as i32);
        put_i32(&mut b, 24, vars.len() as i32);
        put_i32(&mut b, 28, var_base as i32);
        put_i32(&mut b, 32, 1);
        put_i32(&mut b, 36, buf_len as i32);
        put_i32(&mut b, 52, row0 as i32);
        b[HEADER_SIZE..HEADER_SIZE + 8].copy_from_slice(&1_760_000_000i64.to_le_bytes());
        put_i32(&mut b, HEADER_SIZE + 28, total as i32);
        for (i, (n, ty, off)) in vars.iter().enumerate() {
            var(&mut b, var_base, i, n, *ty, *off);
        }
        b[yaml_off..yaml_off + yaml.len()].copy_from_slice(yaml.as_bytes());
        // Tur başı biraz geçmişte başlar: ilk tur çizgide başlamış sayılmaz (yarıda yakalanan tur kaydedilmez)
        for r in 0..total {
            let t = r as f64 / hz;
            let x = t + lap_s * 0.5; // yarım turdan başla
            let lap = (x / lap_s).floor() as i32;
            let pct = ((x / lap_s) - lap as f64) as f32;
            let o = row0 + r * buf_len;
            b[o..o + 8].copy_from_slice(&t.to_le_bytes());
            put_i32(&mut b, o + 8, lap);
            b[o + 12..o + 16].copy_from_slice(&pct.to_le_bytes());
            b[o + 16..o + 20].copy_from_slice(&50f32.to_le_bytes());
            b[o + 20..o + 24].copy_from_slice(&1f32.to_le_bytes());
            put_i32(&mut b, o + 28, 4);
            b[o + 32] = 1;
            let a = pct as f64 * std::f64::consts::TAU;
            b[o + 40..o + 48].copy_from_slice(&(50.0 + 0.004 * a.sin()).to_le_bytes());
            b[o + 48..o + 56].copy_from_slice(&(6.0 + 0.006 * a.cos()).to_le_bytes());
            let last = if lap >= 2 { lap_s as f32 } else { 0.0 };
            b[o + 56..o + 60].copy_from_slice(&last.to_le_bytes());
            b[o + 60..o + 64].copy_from_slice(&7000f32.to_le_bytes());
        }
        b
    }

    #[test]
    fn imports_laps_with_line_and_stable_ids() {
        let data = fake_ibt();
        let (laps, s) = laps_from_bytes(&data).unwrap();
        assert_eq!(s.track_name, "Test Ring");
        assert_eq!(s.sub_session_id, 987654);
        // Yarıda yakalanan ilk tur kaydedilmez; çizgide başlayan 1. ve 2. turlar (3. yarıda biter)
        assert!(laps.len() >= 2, "tur sayısı {}", laps.len());
        let l = &laps[0];
        assert_eq!(l.sim, "iracing");
        assert!(l.id.starts_with("iracing-ss987654-0-"), "{}", l.id);
        assert_eq!(l.session_started, 1_760_000_000_000);
        assert!((l.lap_time - 30.0).abs() < 0.2, "tur süresi {}", l.lap_time);
        let tr = l.trace.as_ref().expect("iz");
        assert_eq!(tr.lat.len(), tr.t.len());
        assert!((tr.lat[0] - 50_000_000).abs() < 10, "lat {}", tr.lat[0]);
        assert_eq!(tr.rpm[10], 7000);
        // Aynı dosya yine aynı kimlikleri üretir
        let (again, _) = laps_from_bytes(&data).unwrap();
        assert_eq!(again[0].id, l.id);
    }

    #[test]
    fn rejects_garbage() {
        assert!(laps_from_bytes(&[0u8; 50]).is_err());
        assert!(laps_from_bytes(&vec![0u8; 4096]).is_err());
    }
}
