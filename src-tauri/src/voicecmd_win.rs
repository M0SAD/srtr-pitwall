//! Sesli komut tanıyıcısı (sadece Windows): WinRT `Windows.Media.SpeechRecognition.SpeechRecognizer`, tek seferlik
//! `RecognizeAsync` (kullanıcı susunca kendiliğinden biter). Windows'un varsayılan mikrofonu dinlenir.
//!
//! Üç kip, sırayla denenir (bkz. `Recognizer::open`):
//!   1. Liste kısıtı (`SpeechRecognitionListConstraint`): yalnızca komut cümleleri tanınır; çevrimdışı çalışır, en isabetlisi.
//!      Dil `SupportedGrammarLanguages` içinde olmalı (Windows konuşma tanıma dil paketi kurulu).
//!   2. Dikte (`SpeechRecognitionTopicConstraint`, WebSearch): dil yalnızca dikte olarak destekleniyorsa; serbest metin
//!      gelir, niyet bulanık eşleştirmeyle bulunur. Windows'ta "Çevrimiçi konuşma tanıma" açık olmalıdır.
//!   3. İngilizce liste kısıtı: arayüz dilinin tanıyıcısı hiç yoksa.
//!
//! Bu dosya bilerek kendi başına (sadece std + windows + windows-collections) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use std::time::{Duration, Instant};
use windows::core::HSTRING;
use windows_collections::IIterable;
use windows::Foundation::TimeSpan;
use windows::Globalization::Language;
use windows::Media::SpeechRecognition::{
    SpeechRecognitionConfidence, SpeechRecognitionListConstraint, SpeechRecognitionResult, SpeechRecognitionResultStatus, SpeechRecognitionScenario,
    SpeechRecognitionTopicConstraint, SpeechRecognizer,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode {
    /// Komut listesi (kısıtlı dilbilgisi)
    List,
    /// Serbest dikte + bulanık eşleştirme
    Dictation,
}

/// Tanıma sonucu
#[derive(Clone, Debug, PartialEq)]
pub enum Heard {
    /// Metin ve güven (0..1)
    Text(String, f64),
    /// Ses gelmedi / anlaşılmadı
    Nothing,
    /// Hata (mikrofon, izin, ağ…)
    Error(String),
}

/// Windows.Foundation.AsyncStatus değerleri
const ASYNC_STARTED: i32 = 0;
const ASYNC_COMPLETED: i32 = 1;
const ASYNC_CANCELED: i32 = 2;

const E_PRIVACY: u32 = 0x8004_5509; // SPERR_SPEECH_PRIVACY_POLICY_NOT_ACCEPTED
const E_ACCESS: u32 = 0x8007_0005;
const E_NO_MIC: u32 = 0x8004_5508;

fn err(e: &windows::core::Error) -> String {
    let code = e.code().0 as u32;
    match code {
        E_PRIVACY => "privacy".into(),
        E_ACCESS => "mic_access".into(),
        E_NO_MIC => "no_mic".into(),
        _ => {
            let m = e.message().to_string();
            format!("{} (0x{code:08X})", m.trim())
        }
    }
}

fn tags<I: IntoIterator<Item = Language>>(list: windows::core::Result<I>) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(l) = list {
        for x in l {
            if let Ok(t) = x.LanguageTag() {
                let t = t.to_string();
                if !t.is_empty() {
                    out.push(t);
                }
            }
        }
    }
    out
}

/// Liste kısıtını (komut dilbilgisi) destekleyen kurulu diller
pub fn grammar_languages() -> Vec<String> {
    tags(SpeechRecognizer::SupportedGrammarLanguages())
}

/// Dikteyi destekleyen kurulu diller
pub fn topic_languages() -> Vec<String> {
    tags(SpeechRecognizer::SupportedTopicLanguages())
}

/// İstenen dile (ör. "tr", "pt-BR", "zh-CN") en uygun kurulu etiket: tam eşleşme, yoksa aynı ana dil
pub fn best_tag(installed: &[String], want: &str) -> Option<String> {
    let w = want.to_lowercase();
    let primary = w.split('-').next().unwrap_or("").to_string();
    if primary.is_empty() {
        return None;
    }
    installed
        .iter()
        .find(|t| t.to_lowercase() == w)
        .or_else(|| installed.iter().find(|t| t.to_lowercase().starts_with(&format!("{w}-"))))
        .or_else(|| {
            // pt-BR ↔ pt-PT gibi bölge farkında: önce istenen bölge, yoksa aynı ana dilin herhangi bir bölgesi
            installed.iter().find(|t| t.to_lowercase().split('-').next() == Some(primary.as_str()))
        })
        .cloned()
}

pub struct Recognizer {
    rec: SpeechRecognizer,
    pub mode: Mode,
    /// Tanıyıcının dili (ör. "tr-TR")
    pub tag: String,
}

fn create(tag: &str) -> Result<SpeechRecognizer, String> {
    let l = Language::CreateLanguage(&HSTRING::from(tag)).map_err(|e| err(&e))?;
    SpeechRecognizer::Create(&l).map_err(|e| err(&e))
}

fn compile(rec: &SpeechRecognizer) -> Result<(), String> {
    let comp = rec.CompileConstraintsAsync().map_err(|e| err(&e))?.join().map_err(|e| err(&e))?;
    let st = comp.Status().map_err(|e| err(&e))?;
    if st != SpeechRecognitionResultStatus::Success {
        return Err(format!("compile:{}", st.0));
    }
    Ok(())
}

fn timeouts(rec: &SpeechRecognizer) {
    if let Ok(t) = rec.Timeouts() {
        let _ = t.SetInitialSilenceTimeout(TimeSpan { Duration: 60_000_000 }); // 6 sn
        let _ = t.SetEndSilenceTimeout(TimeSpan { Duration: 5_000_000 }); // 0,5 sn
        let _ = t.SetBabbleTimeout(TimeSpan { Duration: 0 });
    }
}

impl Recognizer {
    /// Liste kısıtlı tanıyıcı
    pub fn list(tag: &str, phrases: &[String]) -> Result<Recognizer, String> {
        let rec = create(tag)?;
        let items: Vec<HSTRING> = phrases.iter().map(|p| HSTRING::from(p.as_str())).collect();
        let it: IIterable<HSTRING> = IIterable::<HSTRING>::from(items);
        let c = SpeechRecognitionListConstraint::CreateWithTag(&it, &HSTRING::from("commands")).map_err(|e| err(&e))?;
        rec.Constraints().map_err(|e| err(&e))?.Append(&c).map_err(|e| err(&e))?;
        compile(&rec)?;
        timeouts(&rec);
        Ok(Recognizer { rec, mode: Mode::List, tag: tag.to_string() })
    }

    /// Dikte tanıyıcısı (kısa sorgular için WebSearch senaryosu)
    pub fn dictation(tag: &str) -> Result<Recognizer, String> {
        let rec = create(tag)?;
        let c = SpeechRecognitionTopicConstraint::Create(SpeechRecognitionScenario::WebSearch, &HSTRING::from("commands")).map_err(|e| err(&e))?;
        rec.Constraints().map_err(|e| err(&e))?.Append(&c).map_err(|e| err(&e))?;
        compile(&rec)?;
        timeouts(&rec);
        Ok(Recognizer { rec, mode: Mode::Dictation, tag: tag.to_string() })
    }

    /// Bir cümle dinle. `stop()`: true dönerse (tuş bırakıldı) en çok `grace` kadar daha sonuç beklenir, sonra iptal edilir.
    /// `max`: en uzun dinleme süresi.
    pub fn listen(&self, stop: impl Fn() -> bool, grace: Duration, max: Duration) -> Heard {
        let op = match self.rec.RecognizeAsync() {
            Ok(op) => op,
            Err(e) => return Heard::Error(err(&e)),
        };
        let start = Instant::now();
        let mut released: Option<Instant> = None;
        loop {
            match op.Status() {
                Ok(s) if s.0 == ASYNC_STARTED => {}
                Ok(s) if s.0 == ASYNC_COMPLETED => break,
                Ok(s) if s.0 == ASYNC_CANCELED => return Heard::Nothing,
                Ok(_) => {
                    return match op.GetResults() {
                        Err(e) => Heard::Error(err(&e)),
                        Ok(_) => Heard::Nothing,
                    }
                }
                Err(e) => return Heard::Error(err(&e)),
            }
            if released.is_none() && stop() {
                released = Some(Instant::now());
            }
            let timed_out = released.map(|r| r.elapsed() > grace).unwrap_or(false) || start.elapsed() > max;
            if timed_out {
                let _ = op.Cancel();
                // İptalin tamamlanmasını kısa süre bekle (tanıyıcı yeniden kullanılabilsin)
                let t = Instant::now();
                while t.elapsed() < Duration::from_millis(800) && op.Status().map(|s| s.0 == ASYNC_STARTED).unwrap_or(false) {
                    std::thread::sleep(Duration::from_millis(20));
                }
                return Heard::Nothing;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let res: SpeechRecognitionResult = match op.GetResults() {
            Ok(r) => r,
            Err(e) => return Heard::Error(err(&e)),
        };
        let st = res.Status().unwrap_or(SpeechRecognitionResultStatus::Unknown);
        if st != SpeechRecognitionResultStatus::Success {
            return match st {
                SpeechRecognitionResultStatus::TimeoutExceeded | SpeechRecognitionResultStatus::PauseLimitExceeded | SpeechRecognitionResultStatus::UserCanceled => Heard::Nothing,
                SpeechRecognitionResultStatus::MicrophoneUnavailable => Heard::Error("no_mic".into()),
                SpeechRecognitionResultStatus::NetworkFailure => Heard::Error("network".into()),
                SpeechRecognitionResultStatus::AudioQualityFailure => Heard::Nothing,
                other => Heard::Error(format!("status:{}", other.0)),
            };
        }
        let text = res.Text().map(|t| t.to_string()).unwrap_or_default();
        if text.trim().is_empty() || res.Confidence().unwrap_or(SpeechRecognitionConfidence::Rejected) == SpeechRecognitionConfidence::Rejected {
            return Heard::Nothing;
        }
        let raw = res.RawConfidence().unwrap_or(0.0);
        // Bazı dikte sonuçlarında ham güven 0 gelir: sınıf değerinden tahmin et
        let conf = if raw > 0.0 {
            raw
        } else {
            match res.Confidence() {
                Ok(SpeechRecognitionConfidence::High) => 0.9,
                Ok(SpeechRecognitionConfidence::Medium) => 0.6,
                _ => 0.3,
            }
        };
        Heard::Text(text, conf.clamp(0.0, 1.0))
    }
}

impl Drop for Recognizer {
    fn drop(&mut self) {
        let _ = self.rec.Close();
    }
}

// ---------------------------------------------------------------------------
// Mikrofon seçimi
// ---------------------------------------------------------------------------
//
// WinRT `SpeechRecognizer` ses girişini seçtirmez: her zaman bu sürecin "varsayılan kayıt cihazını" paylaşımlı
// (WASAPI shared) kipte açar; yani Discord vb. aynı mikrofonu kullanırken de çalışır, özel (exclusive) erişim istemez.
// Başka bir mikrofon seçilebilsin diye Windows'un "uygulama başına ses cihazı" tercihini (Ayarlar › Ses › Ses
// karıştırıcısı ile aynı şey) yalnızca KENDİ sürecimiz için ayarlıyoruz: `IAudioPolicyConfig`
// (Windows.Media.Internal.AudioPolicyConfig; belgelenmemiş ama Windows 10 1803+ / 11'de kararlı, EarTrumpet de bunu kullanır).
// Başarısız olursa (eski Windows, arayüz değişmiş) sessizce varsayılan mikrofona düşülür.

use std::ffi::c_void;
use windows::core::{GUID, HRESULT};
use windows::Devices::Enumeration::{DeviceClass, DeviceInformation};
use windows::Media::Devices::{AudioDeviceRole, MediaDevice};

/// Bir kayıt (mikrofon) cihazı
#[derive(Clone, Debug, PartialEq)]
pub struct Mic {
    /// Cihaz arayüz yolu (`\\?\SWD#MMDEVAPI#{0.0.1.00000000}.{…}#{2eef81be-…}`)
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[link(name = "combase", kind = "raw-dylib")]
extern "system" {
    fn RoGetActivationFactory(class: *mut c_void, iid: *const GUID, factory: *mut *mut c_void) -> HRESULT;
}

/// IAudioPolicyConfig: Windows 10 21H2+ / 11 ve öncesi
const IID_POLICY_NEW: GUID = GUID::from_u128(0xab3d4648_e242_459f_b02f_541c70306324);
const IID_POLICY_OLD: GUID = GUID::from_u128(0x2a59116d_6c4f_45e0_a74f_707e3fef9258);
/// vtable sırası: IUnknown (3) + IInspectable (3) + 19 başka yöntem → SetPersistedDefaultAudioEndpoint
const SLOT_SET: usize = 25;
const E_CAPTURE: u32 = 1; // EDataFlow::eCapture

type SetFn = unsafe extern "system" fn(this: *mut c_void, pid: u32, flow: u32, role: u32, device: *mut c_void) -> HRESULT;
type ReleaseFn = unsafe extern "system" fn(this: *mut c_void) -> u32;

/// Bu sürecin kayıt cihazı tercihini ayarla (boş kimlik: tercihi sil → Windows varsayılanı)
fn set_process_capture(id: &str) -> Result<(), String> {
    let class = HSTRING::from("Windows.Media.Internal.AudioPolicyConfig");
    let dev = HSTRING::from(id);
    // HSTRING tek işaretçidir (repr(transparent)); boş HSTRING = null
    let class_raw: *mut c_void = unsafe { std::mem::transmute_copy(&class) };
    let dev_raw: *mut c_void = unsafe { std::mem::transmute_copy(&dev) };
    let mut p: *mut c_void = std::ptr::null_mut();
    let mut hr = unsafe { RoGetActivationFactory(class_raw, &IID_POLICY_NEW, &mut p) };
    if hr.is_err() || p.is_null() {
        p = std::ptr::null_mut();
        hr = unsafe { RoGetActivationFactory(class_raw, &IID_POLICY_OLD, &mut p) };
    }
    if hr.is_err() || p.is_null() {
        return Err(format!("AudioPolicyConfig (0x{:08X})", hr.0 as u32));
    }
    let pid = std::process::id();
    let mut res = Ok(());
    unsafe {
        let vtbl = *(p as *const *const usize);
        let set: SetFn = std::mem::transmute(*vtbl.add(SLOT_SET));
        // Roller: eConsole, eMultimedia, eCommunications (tanıyıcı hangisini isterse)
        for role in 0..3u32 {
            let h = set(p, pid, E_CAPTURE, role, dev_raw);
            if h.is_err() {
                res = Err(format!("SetPersistedDefaultAudioEndpoint (0x{:08X})", h.0 as u32));
            }
        }
        let release: ReleaseFn = std::mem::transmute(*vtbl.add(2));
        release(p);
    }
    res
}

/// Şu an uygulanmış süreç tercihi ("" : yok). `None`: henüz bilinmiyor (Windows önceki çalıştırmadan kalan tercihi
/// saklamış olabilir), ilk kullanımda mutlaka yazılır.
static APPLIED: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn default_capture_id() -> String {
    MediaDevice::GetDefaultAudioCaptureId(AudioDeviceRole::Default).map(|h| h.to_string()).unwrap_or_default()
}

fn list_raw() -> Result<Vec<(String, String)>, String> {
    let all = DeviceInformation::FindAllAsyncDeviceClass(DeviceClass::AudioCapture).map_err(|e| err(&e))?.join().map_err(|e| err(&e))?;
    let mut out = Vec::new();
    for d in all {
        if !d.IsEnabled().unwrap_or(true) {
            continue;
        }
        let id = d.Id().map(|x| x.to_string()).unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let name = d.Name().map(|x| x.to_string()).unwrap_or_default();
        out.push((id, name));
    }
    Ok(out)
}

/// Etkin kayıt cihazları; önce `want` tercihi uygulanır. "Varsayılan" işareti Windows'un gerçek varsayılanını gösterir
/// (bizim süreç tercihimizi değil): tercih uygulanmışsa kısa süreliğine kaldırılıp sorulur.
pub fn microphones(want: &str) -> Result<Vec<Mic>, String> {
    let list = list_raw()?;
    let used = use_microphone(want);
    let def = if used.is_empty() {
        default_capture_id()
    } else {
        let mut applied = APPLIED.lock().unwrap_or_else(|e| e.into_inner());
        let _ = set_process_capture("");
        let d = default_capture_id();
        if set_process_capture(&used).is_err() {
            let _ = set_process_capture("");
            *applied = Some(String::new());
        }
        d
    };
    Ok(list.into_iter().map(|(id, name)| Mic { is_default: !def.is_empty() && id.eq_ignore_ascii_case(&def), id, name }).collect())
}

/// Seçilen mikrofonu uygula. Boş kimlik ya da cihaz artık yoksa Windows varsayılanına dönülür.
/// Dönen: gerçekten kullanılan cihaz kimliği ("" : Windows varsayılanı). Tercih değiştiyse tanıyıcı yeniden kurulmalıdır.
pub fn use_microphone(want: &str) -> String {
    // Cihaz hâlâ takılı mı (WinRT çağrısı ayrıca süreçte COM/MTA'yı hazırlar)
    let present = !want.is_empty() && list_raw().map(|l| l.iter().any(|(id, _)| id.eq_ignore_ascii_case(want))).unwrap_or(false);
    let target = if present { want } else { "" };
    let mut applied = APPLIED.lock().unwrap_or_else(|e| e.into_inner());
    if applied.as_deref() == Some(target) {
        return target.to_string();
    }
    if want.is_empty() && applied.is_none() {
        // MTA hazır olsun (RoGetActivationFactory öncesi)
        let _ = default_capture_id();
    }
    match set_process_capture(target) {
        Ok(()) => *applied = Some(target.to_string()),
        Err(_) => {
            // Ayarlanamadı: yarım kalmış tercihi temizle, varsayılanla devam et
            let _ = set_process_capture("");
            *applied = Some(String::new());
        }
    }
    applied.clone().unwrap_or_default()
}
