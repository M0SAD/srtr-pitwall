//! MP3 → WAV (sadece Windows): Edge çevrimiçi seslerinin MP3 çıktısı Windows'un kendi çözücüsüyle (Media Foundation
//! Source Reader) PCM'e çevrilir; ek kitaplık gerekmez. Çalma işi (rodio) tts.rs'de yapılır.
//!
//! Bu dosya bilerek kendi başına (sadece std + windows) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use std::sync::atomic::{AtomicU32, Ordering};
use windows::core::HSTRING;
use windows::Win32::Media::MediaFoundation::{
    IMFSample, IMFSourceReader, MFAudioFormat_PCM, MFCreateMediaType, MFCreateSourceReaderFromURL, MFMediaType_Audio, MFShutdown, MFStartup, MFSTARTUP_LITE,
    MF_MT_AUDIO_BITS_PER_SAMPLE, MF_MT_AUDIO_NUM_CHANNELS, MF_MT_AUDIO_SAMPLES_PER_SECOND, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_SOURCE_READERF_ENDOFSTREAM,
    MF_SOURCE_READER_FIRST_AUDIO_STREAM, MF_VERSION,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

fn err(e: windows::core::Error) -> String {
    let m = e.message().to_string();
    if m.trim().is_empty() {
        format!("Windows hatası 0x{:08X}", e.code().0 as u32)
    } else {
        format!("{} (0x{:08X})", m.trim(), e.code().0 as u32)
    }
}

/// PCM → WAV dosyası baytları
fn wav_bytes(pcm: &[u8], rate: u32, channels: u16, bits: u16) -> Vec<u8> {
    let mut w = Vec::with_capacity(pcm.len() + 44);
    let len = pcm.len() as u32;
    let block = channels * (bits / 8);
    w.extend_from_slice(b"RIFF");
    w.extend_from_slice(&(36 + len).to_le_bytes());
    w.extend_from_slice(b"WAVEfmt ");
    w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes()); // PCM
    w.extend_from_slice(&channels.to_le_bytes());
    w.extend_from_slice(&rate.to_le_bytes());
    w.extend_from_slice(&(rate * block as u32).to_le_bytes());
    w.extend_from_slice(&block.to_le_bytes());
    w.extend_from_slice(&bits.to_le_bytes());
    w.extend_from_slice(b"data");
    w.extend_from_slice(&len.to_le_bytes());
    w.extend_from_slice(pcm);
    w
}

/// MP3 baytlarını WAV (PCM) baytlarına çevir. Kaynak çözümleyici dosya uzantısına baktığı için veri geçici bir
/// `.mp3` dosyasına yazılır ve iş bitince silinir.
pub fn decode_mp3(mp3: &[u8]) -> Result<Vec<u8>, String> {
    static N: AtomicU32 = AtomicU32::new(0);
    let path = std::env::temp_dir().join(format!("srtr-pitwall-tts-{}-{}.mp3", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    std::fs::write(&path, mp3).map_err(|e| format!("geçici dosya yazılamadı: {e}"))?;
    let r = unsafe {
        // İş parçacığında COM açık olmalı (zaten açıksa S_FALSE döner; her başarılı çağrı dengelenir)
        let com = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
        let r = match MFStartup(MF_VERSION, MFSTARTUP_LITE) {
            Ok(()) => {
                let r = decode_file(&HSTRING::from(path.as_os_str()));
                let _ = MFShutdown();
                r
            }
            Err(e) => Err(err(e)),
        };
        if com {
            CoUninitialize();
        }
        r
    };
    let _ = std::fs::remove_file(&path);
    r
}

unsafe fn decode_file(url: &HSTRING) -> Result<Vec<u8>, String> {
    let stream = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;
    let reader: IMFSourceReader = MFCreateSourceReaderFromURL(url, None).map_err(err)?;
    let want = MFCreateMediaType().map_err(err)?;
    want.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio).map_err(err)?;
    want.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM).map_err(err)?;
    reader.SetCurrentMediaType(stream, None, &want).map_err(err)?;
    let cur = reader.GetCurrentMediaType(stream).map_err(err)?;
    let rate = cur.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND).map_err(err)?;
    let channels = cur.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS).map_err(err)?;
    let bits = cur.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE).unwrap_or(16);
    if rate == 0 || channels == 0 || channels > 8 || (bits != 16 && bits != 8 && bits != 24 && bits != 32) {
        return Err("beklenmeyen ses biçimi".into());
    }
    let mut pcm: Vec<u8> = Vec::with_capacity(256 * 1024);
    loop {
        let mut flags = 0u32;
        let mut sample: Option<IMFSample> = None;
        reader.ReadSample(stream, 0, None, Some(&mut flags), None, Some(&mut sample)).map_err(err)?;
        if let Some(s) = sample {
            let buf = s.ConvertToContiguousBuffer().map_err(err)?;
            let mut p: *mut u8 = std::ptr::null_mut();
            let mut len = 0u32;
            buf.Lock(&mut p, None, Some(&mut len)).map_err(err)?;
            if !p.is_null() && len > 0 {
                pcm.extend_from_slice(std::slice::from_raw_parts(p, len as usize));
            }
            let _ = buf.Unlock();
        }
        if flags & (MF_SOURCE_READERF_ENDOFSTREAM.0 as u32) != 0 {
            break;
        }
        // En fazla ~5 dakikalık ses (bozuk akışta sonsuz döngü olmasın)
        if pcm.len() > 64 * 1024 * 1024 {
            break;
        }
    }
    if pcm.is_empty() {
        return Err("ses verisi çözülemedi".into());
    }
    Ok(wav_bytes(&pcm, rate, channels as u16, bits as u16))
}
