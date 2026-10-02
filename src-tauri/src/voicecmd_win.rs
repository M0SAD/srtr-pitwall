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
