//! Sesli okuma motoru (sadece Windows): WinRT `Windows.Media.SpeechSynthesis.SpeechSynthesizer`.
//!
//! Windows'un kendi (OneCore) sesleri kullanılır: internet gerekmez, ek kurulum yoktur. Türkçe ses için
//! Windows Ayarları › Saat ve dil › Konuşma › "Ses ekle" (ör. Microsoft Tolga). Metin WAV akışına sentezlenir,
//! baytlar okunur; çalma işi (rodio, seçilen çıkış cihazı) tts.rs'de yapılır.
//!
//! Bu dosya bilerek kendi başına (sadece std + windows) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use windows::core::HSTRING;
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceGender, VoiceInformation};
use windows::Storage::Streams::DataReader;

#[derive(Clone, Debug)]
pub struct WinVoice {
    pub id: String,
    pub name: String,
    pub language: String,
    pub female: bool,
}

fn err(e: windows::core::Error) -> String {
    let m = e.message().to_string();
    if m.trim().is_empty() {
        format!("Windows hatası 0x{:08X}", e.code().0 as u32)
    } else {
        format!("{} (0x{:08X})", m.trim(), e.code().0 as u32)
    }
}

/// Kurulu sesler
pub fn voices() -> Result<Vec<WinVoice>, String> {
    let all = SpeechSynthesizer::AllVoices().map_err(err)?;
    let mut out = Vec::new();
    for v in all {
        out.push(info(&v));
    }
    Ok(out)
}

fn info(v: &VoiceInformation) -> WinVoice {
    WinVoice {
        id: v.Id().map(|s| s.to_string()).unwrap_or_default(),
        name: v.DisplayName().map(|s| s.to_string()).unwrap_or_default(),
        language: v.Language().map(|s| s.to_string()).unwrap_or_default(),
        female: v.Gender().map(|g| g == VoiceGender::Female).unwrap_or(false),
    }
}

/// Bir iş parçacığına ait sentezleyici (WinRT nesnesi iş parçacığından çıkmaz)
pub struct Synth {
    s: SpeechSynthesizer,
    voice: String,
}

impl Synth {
    pub fn new() -> Result<Synth, String> {
        Ok(Synth { s: SpeechSynthesizer::new().map_err(err)?, voice: String::new() })
    }

    /// Metni WAV baytlarına çevir. `voice`: ses kimliği (boş: Windows varsayılanı),
    /// `rate` 0.5..6 (1 normal), `pitch` 0..2 (1 normal), `volume` 0..1.
    pub fn wav(&mut self, text: &str, voice: &str, rate: f64, pitch: f64, volume: f64) -> Result<Vec<u8>, String> {
        if self.voice != voice {
            let mut chosen: Option<VoiceInformation> = None;
            if !voice.is_empty() {
                if let Ok(all) = SpeechSynthesizer::AllVoices() {
                    for v in all {
                        let id = v.Id().map(|s| s.to_string()).unwrap_or_default();
                        let name = v.DisplayName().map(|s| s.to_string()).unwrap_or_default();
                        if id == voice || name == voice {
                            chosen = Some(v);
                            break;
                        }
                    }
                }
            }
            let v = match chosen {
                Some(v) => v,
                None => SpeechSynthesizer::DefaultVoice().map_err(err)?,
            };
            self.s.SetVoice(&v).map_err(err)?;
            self.voice = voice.to_string();
        }
        if let Ok(o) = self.s.Options() {
            let _ = o.SetSpeakingRate(rate.clamp(0.5, 6.0));
            let _ = o.SetAudioPitch(pitch.clamp(0.0, 2.0));
            let _ = o.SetAudioVolume(volume.clamp(0.0, 1.0));
        }
        let stream = self.s.SynthesizeTextToStreamAsync(&HSTRING::from(text)).map_err(err)?.join().map_err(err)?;
        let size = stream.Size().map_err(err)?;
        if size == 0 || size > 64 * 1024 * 1024 {
            return Err("Ses üretilemedi".into());
        }
        let input = stream.GetInputStreamAt(0).map_err(err)?;
        let reader = DataReader::CreateDataReader(&input).map_err(err)?;
        let got = reader.LoadAsync(size as u32).map_err(err)?.join().map_err(err)?;
        let mut buf = vec![0u8; got as usize];
        reader.ReadBytes(&mut buf).map_err(err)?;
        let _ = stream.Close();
        Ok(buf)
    }
}
