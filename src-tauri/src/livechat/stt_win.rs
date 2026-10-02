//! Konuşmayı yazıya çevirme motoru (sadece Windows): WinRT `Windows.Media.SpeechRecognition.SpeechRecognizer`
//! sürekli dikte oturumu (mikrofon). Windows'un kendi konuşma tanıma hizmeti kullanılır; ek anahtar / hesap yoktur.
//!
//! Gereksinimler (yoksa anlaşılır hata döner):
//!   - Seçilen dil için Windows konuşma tanıma paketi (Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri),
//!   - Mikrofon izni (Ayarlar › Gizlilik › Mikrofon › masaüstü uygulamaları),
//!   - Dikte için "Çevrimiçi konuşma tanıma" gizlilik ayarı (Windows dikte dilbilgisi bunu ister).
//! Masaüstü sesi (loopback) bu tanıyıcıyla desteklenmez: sadece varsayılan mikrofon dinlenir.
//!
//! Bu dosya bilerek kendi başına (sadece std + windows) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use std::sync::mpsc;
use std::time::Duration;
use windows::core::HSTRING;
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Globalization::Language;
use windows::Media::SpeechRecognition::{
    SpeechContinuousRecognitionCompletedEventArgs, SpeechContinuousRecognitionResultGeneratedEventArgs, SpeechContinuousRecognitionSession,
    SpeechRecognitionConfidence, SpeechRecognitionResultStatus, SpeechRecognitionScenario, SpeechRecognitionTopicConstraint, SpeechRecognizer,
};

pub enum SttEvent {
    /// Kesinleşen cümle
    Text(String),
    /// Dinlemeye başladı
    Listening,
}

/// Tanıyıcının desteklediği dikte dilleri: (etiket, görünen ad)
pub fn languages() -> Result<Vec<(String, String)>, String> {
    let list = SpeechRecognizer::SupportedTopicLanguages().map_err(|e| err(&e))?;
    let mut out = Vec::new();
    for l in list {
        let tag = l.LanguageTag().map(|s| s.to_string()).unwrap_or_default();
        let name = l.DisplayName().map(|s| s.to_string()).unwrap_or_else(|_| tag.clone());
        if !tag.is_empty() {
            out.push((tag, name));
        }
    }
    Ok(out)
}

/// Windows'un konuşma dili (ör. "tr-TR")
pub fn system_language() -> Option<String> {
    SpeechRecognizer::SystemSpeechLanguage().ok().and_then(|l| l.LanguageTag().ok()).map(|s| s.to_string())
}

const E_PRIVACY: u32 = 0x8004_5509; // SPERR_SPEECH_PRIVACY_POLICY_NOT_ACCEPTED
const E_ACCESS: u32 = 0x8007_0005;
const E_NO_MIC: u32 = 0x8004_5508; // ses girişi yok

fn err(e: &windows::core::Error) -> String {
    let code = e.code().0 as u32;
    match code {
        E_PRIVACY => "Windows'ta çevrimiçi konuşma tanıma kapalı: Ayarlar › Gizlilik ve güvenlik › Konuşma › “Çevrimiçi konuşma tanıma”yı açın.".into(),
        E_ACCESS => "Mikrofon izni yok: Ayarlar › Gizlilik ve güvenlik › Mikrofon › “Masaüstü uygulamalarının mikrofona erişmesine izin ver”i açın.".into(),
        E_NO_MIC => "Mikrofon bulunamadı: Windows ses ayarlarında bir kayıt cihazını varsayılan yapın.".into(),
        _ => {
            let m = e.message().to_string();
            format!("{} (0x{code:08X})", m.trim())
        }
    }
}

fn status_text(s: SpeechRecognitionResultStatus) -> String {
    match s {
        SpeechRecognitionResultStatus::TopicLanguageNotSupported => "Bu dil için Windows dikte paketi kurulu değil. Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri › Konuşma tanıma paketini indirin.".into(),
        SpeechRecognitionResultStatus::GrammarLanguageMismatch => "Dil uyuşmazlığı: başka bir tanıma dili seçin.".into(),
        SpeechRecognitionResultStatus::NetworkFailure => "Ağ hatası: Windows konuşma tanıma hizmetine ulaşılamadı.".into(),
        SpeechRecognitionResultStatus::MicrophoneUnavailable => "Mikrofon kullanılamıyor (bağlı mı, başka bir uygulama mı kullanıyor?).".into(),
        SpeechRecognitionResultStatus::AudioQualityFailure => "Ses kalitesi çok düşük.".into(),
        SpeechRecognitionResultStatus::TimeoutExceeded => "Uzun süre ses gelmedi.".into(),
        SpeechRecognitionResultStatus::PauseLimitExceeded => "Duraklatma sınırı aşıldı.".into(),
        SpeechRecognitionResultStatus::GrammarCompilationFailure => "Dikte hazırlanamadı (dil paketi eksik olabilir).".into(),
        SpeechRecognitionResultStatus::UserCanceled => "Durduruldu.".into(),
        _ => "Bilinmeyen konuşma tanıma hatası.".into(),
    }
}

enum Ctl {
    Stop,
    Ended(SpeechRecognitionResultStatus),
}

/// Dikteyi çalıştır (çağıran iş parçacığını bloklar). `stop()` true dönünce durur (Ok).
/// Oturum kendiliğinden biterse (ağ, mikrofon…) Err ile döner; çağıran bekleyip yeniden dener.
pub fn run(lang: &str, stop: impl Fn() -> bool, emit: impl Fn(SttEvent) + Send + Sync + Clone + 'static) -> Result<(), String> {
    let rec = if lang.is_empty() {
        SpeechRecognizer::new().map_err(|e| err(&e))?
    } else {
        let l = Language::CreateLanguage(&HSTRING::from(lang)).map_err(|_| format!("Geçersiz dil: {lang}"))?;
        SpeechRecognizer::Create(&l).map_err(|e| {
            let m = err(&e);
            format!("Bu dil ({lang}) için Windows konuşma tanıma kullanılamıyor: {m}")
        })?
    };
    let c = SpeechRecognitionTopicConstraint::Create(SpeechRecognitionScenario::Dictation, &HSTRING::from("dictation")).map_err(|e| err(&e))?;
    rec.Constraints().map_err(|e| err(&e))?.Append(&c).map_err(|e| err(&e))?;
    let comp = rec.CompileConstraintsAsync().map_err(|e| err(&e))?.join().map_err(|e| err(&e))?;
    let st = comp.Status().map_err(|e| err(&e))?;
    if st != SpeechRecognitionResultStatus::Success {
        return Err(status_text(st));
    }
    // Uzun sessizlikte oturum kapanmasın; cümle sonu için kısa sessizlik yeter
    if let Ok(t) = rec.Timeouts() {
        let _ = t.SetEndSilenceTimeout(TimeSpan { Duration: 6_000_000 }); // 0,6 sn
        let _ = t.SetBabbleTimeout(TimeSpan { Duration: 0 });
    }
    let session: SpeechContinuousRecognitionSession = rec.ContinuousRecognitionSession().map_err(|e| err(&e))?;
    let _ = session.SetAutoStopSilenceTimeout(TimeSpan { Duration: 24 * 3600 * 10_000_000 });

    let (tx, rx) = mpsc::channel::<Ctl>();
    let em = emit.clone();
    let tok_res = session
        .ResultGenerated(&TypedEventHandler::<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionResultGeneratedEventArgs>::new(move |_, args| {
            if let Some(a) = args.as_ref() {
                if let Ok(r) = a.Result() {
                    let ok = r.Status().map(|s| s == SpeechRecognitionResultStatus::Success).unwrap_or(false);
                    let conf = r.Confidence().unwrap_or(SpeechRecognitionConfidence::Rejected);
                    if ok && conf != SpeechRecognitionConfidence::Rejected {
                        if let Ok(t) = r.Text() {
                            let t = t.to_string();
                            if !t.trim().is_empty() {
                                em(SttEvent::Text(t));
                            }
                        }
                    }
                }
            }
            Ok(())
        }))
        .map_err(|e| err(&e))?;
    let tx2 = tx.clone();
    let tok_done = session
        .Completed(&TypedEventHandler::<SpeechContinuousRecognitionSession, SpeechContinuousRecognitionCompletedEventArgs>::new(move |_, args| {
            let st = args.as_ref().and_then(|a| a.Status().ok()).unwrap_or(SpeechRecognitionResultStatus::Unknown);
            let _ = tx2.send(Ctl::Ended(st));
            Ok(())
        }))
        .map_err(|e| err(&e))?;

    session.StartAsync().map_err(|e| err(&e))?.join().map_err(|e| err(&e))?;
    emit(SttEvent::Listening);

    // Durdurma isteğini ve oturumun kendiliğinden bitmesini bekle
    let result = loop {
        std::thread::sleep(Duration::from_millis(150));
        if stop() {
            let _ = tx.send(Ctl::Stop);
        }
        match rx.try_recv() {
            Ok(Ctl::Stop) => {
                if let Ok(op) = session.StopAsync() {
                    let _ = op.join();
                }
                break Ok(());
            }
            Ok(Ctl::Ended(st)) => {
                break if st == SpeechRecognitionResultStatus::Success || st == SpeechRecognitionResultStatus::UserCanceled {
                    Err("Dinleme oturumu kapandı, yeniden başlatılıyor…".into())
                } else {
                    Err(status_text(st))
                };
            }
            Err(_) => {}
        }
    };
    let _ = session.RemoveResultGenerated(tok_res);
    let _ = session.RemoveCompleted(tok_done);
    let _ = rec.Close();
    result
}
