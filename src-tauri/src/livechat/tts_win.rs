//! Sesli okuma motoru (sadece Windows). İki ses ailesi desteklenir:
//!
//!   - OneCore / WinRT sesleri (`Windows.Media.SpeechSynthesis.SpeechSynthesizer::AllVoices`): Windows Ayarları ›
//!     Saat ve dil › Konuşma › "Ses ekle" ile kurulan sesler (ör. Microsoft Tolga, Emel). Kimlik: Windows ses kimliği.
//!   - SAPI5 masaüstü sesleri (`HKLM\SOFTWARE\Microsoft\Speech\Voices`): "Microsoft Zira Desktop" gibi klasik sesler ve
//!     üçüncü taraf SAPI5 sesleri. Kimlik: `sapi:<belirteç kimliği>`.
//!
//! İnternet gerekmez. Metin WAV baytlarına sentezlenir; çalma işi (rodio, seçilen çıkış cihazı) tts.rs'de yapılır.
//!
//! Bu dosya bilerek kendi başına (sadece std + windows) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use windows::core::{GUID, HSTRING, PCWSTR, PWSTR};
use windows::Globalization::Language;
use windows::Media::SpeechSynthesis::{SpeechSynthesizer, VoiceGender, VoiceInformation};
use windows::Storage::Streams::DataReader;
use windows::Win32::Globalization::LCIDToLocaleName;
use windows::Win32::Media::Audio::WAVEFORMATEX;
use windows::Win32::Media::Speech::{
    IEnumSpObjectTokens, ISpObjectToken, ISpObjectTokenCategory, ISpStream, ISpVoice, SpObjectToken, SpObjectTokenCategory, SpStream, SpVoice, SPCAT_VOICES,
    SPF_IS_NOT_XML, SPF_IS_XML,
};
use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IStream, CLSCTX_ALL, COINIT_MULTITHREADED, STREAM_SEEK_END, STREAM_SEEK_SET};

/// SAPI5 ses kimliklerinin ön eki
pub const SAPI_PREFIX: &str = "sapi:";

#[derive(Clone, Debug)]
pub struct WinVoice {
    pub id: String,
    pub name: String,
    /// BCP-47 dil etiketi (ör. "tr-TR")
    pub language: String,
    /// Dilin Windows arayüz dilindeki adı (ör. "Türkçe (Türkiye)")
    pub language_name: String,
    pub female: bool,
    /// "onecore" | "sapi"
    pub engine: &'static str,
}

fn err(e: windows::core::Error) -> String {
    let m = e.message().to_string();
    if m.trim().is_empty() {
        format!("Windows hatası 0x{:08X}", e.code().0 as u32)
    } else {
        format!("{} (0x{:08X})", m.trim(), e.code().0 as u32)
    }
}

fn language_name(tag: &str) -> String {
    if tag.is_empty() {
        return String::new();
    }
    Language::CreateLanguage(&HSTRING::from(tag)).and_then(|l| l.DisplayName()).map(|s| s.to_string()).unwrap_or_else(|_| tag.to_string())
}

/// Kurulu sesler: önce OneCore (WinRT), sonra SAPI5. Biri okunamazsa diğeri yine listelenir.
pub fn voices() -> Result<Vec<WinVoice>, String> {
    let mut out = Vec::new();
    let mut first_err = None;
    match SpeechSynthesizer::AllVoices() {
        Ok(all) => {
            for v in all {
                out.push(info(&v));
            }
        }
        Err(e) => first_err = Some(err(e)),
    }
    match sapi_voices() {
        Ok(list) => {
            for v in list {
                // Aynı ses iki ailede de kayıtlıysa (ad + dil aynı) bir kez göster
                if !out.iter().any(|o| o.name.eq_ignore_ascii_case(&v.name) && o.language.eq_ignore_ascii_case(&v.language)) {
                    out.push(v);
                }
            }
        }
        Err(e) => {
            if first_err.is_none() && out.is_empty() {
                first_err = Some(e);
            }
        }
    }
    match (out.is_empty(), first_err) {
        (true, Some(e)) => Err(e),
        _ => Ok(out),
    }
}

fn info(v: &VoiceInformation) -> WinVoice {
    let language = v.Language().map(|s| s.to_string()).unwrap_or_default();
    WinVoice {
        id: v.Id().map(|s| s.to_string()).unwrap_or_default(),
        name: v.DisplayName().map(|s| s.to_string()).unwrap_or_default(),
        language_name: language_name(&language),
        language,
        female: v.Gender().map(|g| g == VoiceGender::Female).unwrap_or(false),
        engine: "onecore",
    }
}

// ---------------------------------------------------------------------------
// SAPI5
// ---------------------------------------------------------------------------

/// Bu iş parçacığında COM'u aç (zaten açıksa dokunma). Bırakılınca yalnızca kendi açtığını kapatır.
struct ComGuard(bool);

impl ComGuard {
    fn new() -> ComGuard {
        // S_OK / S_FALSE: bizim çağrımız sayıldı (kapatılmalı). RPC_E_CHANGED_MODE: başka kipte zaten açık (dokunma).
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        ComGuard(hr.is_ok())
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

/// COM'un ayırdığı metni al ve belleği bırak
fn take_pwstr(p: PWSTR) -> String {
    if p.is_null() {
        return String::new();
    }
    let s = unsafe { p.to_string() }.unwrap_or_default();
    unsafe { CoTaskMemFree(Some(p.0 as *const core::ffi::c_void)) };
    s
}

/// "409" / "41F;9" (onaltılık LCID listesi) → "en-US" / "tr-TR"
fn lcid_to_tag(attr: &str) -> String {
    let Some(first) = attr.split([';', ',', ' ']).find(|x| !x.trim().is_empty()) else { return String::new() };
    let Ok(lcid) = u32::from_str_radix(first.trim(), 16) else { return String::new() };
    let mut buf = [0u16; 85];
    let n = unsafe { LCIDToLocaleName(lcid, Some(&mut buf), 0) };
    if n <= 1 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..(n as usize - 1)])
}

fn sapi_token_info(tok: &ISpObjectToken) -> Option<WinVoice> {
    let id = take_pwstr(unsafe { tok.GetId() }.ok()?);
    if id.is_empty() {
        return None;
    }
    let attrs = unsafe { tok.OpenKey(&HSTRING::from("Attributes")) }.ok();
    let attr = |name: &str| -> String {
        attrs.as_ref().and_then(|a| unsafe { a.GetStringValue(&HSTRING::from(name)) }.ok()).map(take_pwstr).unwrap_or_default()
    };
    // Görünen ad: belirtecin varsayılan değeri ("Microsoft Zira Desktop - English (United States)"), yoksa Name özniteliği
    let mut name = unsafe { tok.GetStringValue(PCWSTR::null()) }.map(take_pwstr).unwrap_or_default();
    if name.trim().is_empty() {
        name = attr("Name");
    }
    if let Some((short, _)) = name.split_once(" - ") {
        name = short.to_string();
    }
    if name.trim().is_empty() {
        name = id.rsplit('\\').next().unwrap_or("SAPI").to_string();
    }
    let language = lcid_to_tag(&attr("Language"));
    Some(WinVoice {
        id: format!("{SAPI_PREFIX}{id}"),
        name: name.trim().to_string(),
        language_name: language_name(&language),
        language,
        female: attr("Gender").eq_ignore_ascii_case("female"),
        engine: "sapi",
    })
}

/// Kurulu SAPI5 sesleri (64 bit; 32 bit sesler bu süreçten kullanılamaz)
pub fn sapi_voices() -> Result<Vec<WinVoice>, String> {
    let _com = ComGuard::new();
    unsafe {
        let cat: ISpObjectTokenCategory = CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL).map_err(err)?;
        cat.SetId(SPCAT_VOICES, false).map_err(err)?;
        let en: IEnumSpObjectTokens = cat.EnumTokens(PCWSTR::null(), PCWSTR::null()).map_err(err)?;
        let mut n = 0u32;
        en.GetCount(&mut n).map_err(err)?;
        let mut out = Vec::new();
        for i in 0..n.min(500) {
            if let Ok(tok) = en.Item(i) {
                if let Some(v) = sapi_token_info(&tok) {
                    out.push(v);
                }
            }
        }
        Ok(out)
    }
}

/// SPDFID_WaveFormatEx
const FMT_WAVEFORMATEX: GUID = GUID::from_u128(0xc31adbae_527f_4ff5_a230_f62bb61ff70c);
const SAPI_RATE: u32 = 22_050;

fn xml_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '&' => o.push_str("&amp;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&apos;"),
            c if (c as u32) < 0x20 => o.push(' '),
            c => o.push(c),
        }
    }
    o
}

/// PCM (16 bit, tek kanal) → WAV dosyası baytları
fn wav_bytes(pcm: &[u8], rate: u32) -> Vec<u8> {
    let mut w = Vec::with_capacity(pcm.len() + 44);
    let len = pcm.len() as u32;
    w.extend_from_slice(b"RIFF");
    w.extend_from_slice(&(36 + len).to_le_bytes());
    w.extend_from_slice(b"WAVEfmt ");
    w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes()); // PCM
    w.extend_from_slice(&1u16.to_le_bytes()); // tek kanal
    w.extend_from_slice(&rate.to_le_bytes());
    w.extend_from_slice(&(rate * 2).to_le_bytes());
    w.extend_from_slice(&2u16.to_le_bytes());
    w.extend_from_slice(&16u16.to_le_bytes());
    w.extend_from_slice(b"data");
    w.extend_from_slice(&len.to_le_bytes());
    w.extend_from_slice(pcm);
    w
}

struct Sapi {
    voice: ISpVoice,
    /// Seçili belirteç kimliği (ön eksiz)
    token: String,
}

impl Sapi {
    fn new() -> Result<Sapi, String> {
        let voice: ISpVoice = unsafe { CoCreateInstance(&SpVoice, None, CLSCTX_ALL) }.map_err(err)?;
        Ok(Sapi { voice, token: String::new() })
    }

    /// `rate` ve `pitch`: -10..10
    fn wav(&mut self, text: &str, token_id: &str, rate: i32, pitch: i32) -> Result<Vec<u8>, String> {
        unsafe {
            if self.token != token_id {
                let tok: ISpObjectToken = CoCreateInstance(&SpObjectToken, None, CLSCTX_ALL).map_err(err)?;
                tok.SetId(PCWSTR::null(), &HSTRING::from(token_id), false).map_err(|_| "Seçilen ses artık kurulu değil".to_string())?;
                self.voice.SetVoice(&tok).map_err(err)?;
                self.token = token_id.to_string();
            }
            let base: IStream = CreateStreamOnHGlobal(Default::default(), true).map_err(err)?;
            let sp: ISpStream = CoCreateInstance(&SpStream, None, CLSCTX_ALL).map_err(err)?;
            let fmt = WAVEFORMATEX {
                wFormatTag: 1,
                nChannels: 1,
                nSamplesPerSec: SAPI_RATE,
                nAvgBytesPerSec: SAPI_RATE * 2,
                nBlockAlign: 2,
                wBitsPerSample: 16,
                cbSize: 0,
            };
            sp.SetBaseStream(&base, &FMT_WAVEFORMATEX, &fmt).map_err(err)?;
            self.voice.SetOutput(&sp, false).map_err(err)?;
            let _ = self.voice.SetRate(rate.clamp(-10, 10));
            let _ = self.voice.SetVolume(100);
            // Eşzamanlı okuma (SPF_ASYNC yok): dönünce akış dolmuştur. Ses tonu yalnızca SAPI XML'iyle verilebilir.
            let res = if pitch != 0 {
                let xml = format!("<pitch absmiddle=\"{}\">{}</pitch>", pitch.clamp(-10, 10), xml_escape(text));
                self.voice.Speak(&HSTRING::from(xml), SPF_IS_XML.0 as u32, None)
            } else {
                self.voice.Speak(&HSTRING::from(text), SPF_IS_NOT_XML.0 as u32, None)
            };
            // Çıkışı akıştan ayır (akış bizimle birlikte bırakılsın)
            let _ = self.voice.SetOutput(None::<&windows::core::IUnknown>, true);
            res.map_err(err)?;
            let mut size = 0u64;
            base.Seek(0, STREAM_SEEK_END, Some(&mut size)).map_err(err)?;
            base.Seek(0, STREAM_SEEK_SET, None).map_err(err)?;
            if size == 0 || size > 64 * 1024 * 1024 {
                return Err("Ses üretilemedi".into());
            }
            let mut pcm = vec![0u8; size as usize];
            let mut got = 0usize;
            while got < pcm.len() {
                let mut n = 0u32;
                let want = (pcm.len() - got).min(1 << 20) as u32;
                let hr = base.Read(pcm.as_mut_ptr().add(got) as *mut core::ffi::c_void, want, Some(&mut n));
                if hr.is_err() || n == 0 {
                    break;
                }
                got += n as usize;
            }
            pcm.truncate(got);
            if pcm.is_empty() {
                return Err("Ses üretilemedi".into());
            }
            Ok(wav_bytes(&pcm, SAPI_RATE))
        }
    }
}

// ---------------------------------------------------------------------------
// Sentezleyici (iki aile tek arayüzde)
// ---------------------------------------------------------------------------

/// Bir iş parçacığına ait sentezleyici (WinRT / COM nesneleri iş parçacığından çıkmaz)
pub struct Synth {
    s: SpeechSynthesizer,
    voice: String,
    /// SAPI5 sesi ilk istendiğinde kurulur
    sapi: Option<Sapi>,
    _com: ComGuard,
}

impl Synth {
    pub fn new() -> Result<Synth, String> {
        let com = ComGuard::new();
        Ok(Synth { s: SpeechSynthesizer::new().map_err(err)?, voice: String::new(), sapi: None, _com: com })
    }

    /// Metni WAV baytlarına çevir. `voice`: ses kimliği (boş: Windows varsayılanı; `sapi:` ön ekliyse SAPI5 sesi),
    /// `rate` ve `pitch`: -10..10 (0 normal; SAPI5 için), `oc_rate` 0.5..6 ve `oc_pitch` 0..2 (1 normal; OneCore için).
    pub fn wav(&mut self, text: &str, voice: &str, rate: f64, pitch: f64, oc_rate: f64, oc_pitch: f64) -> Result<Vec<u8>, String> {
        if let Some(token) = voice.strip_prefix(SAPI_PREFIX) {
            if self.sapi.is_none() {
                self.sapi = Some(Sapi::new()?);
            }
            let r = self.sapi.as_mut().unwrap().wav(text, token, rate.round() as i32, pitch.round() as i32);
            if r.is_err() {
                // Bozuk kalmış olabilir: sıradaki okumada yeniden kurulsun
                self.sapi = None;
            }
            return r;
        }
        self.wav_onecore(text, voice, oc_rate, oc_pitch, 1.0)
    }

    /// OneCore: `rate` 0.5..6 (1 normal), `pitch` 0..2 (1 normal), `volume` 0..1.
    fn wav_onecore(&mut self, text: &str, voice: &str, rate: f64, pitch: f64, volume: f64) -> Result<Vec<u8>, String> {
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
