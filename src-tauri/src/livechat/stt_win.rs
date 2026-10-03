//! Konuşmayı yazıya çevirme motoru (sadece Windows): WinRT `Windows.Media.SpeechRecognition.SpeechRecognizer`
//! sürekli dikte oturumu (mikrofon). Windows'un kendi konuşma tanıma hizmeti kullanılır; ek anahtar / hesap yoktur.
//!
//! Gereksinimler (yoksa anlaşılır hata döner):
//!   - Seçilen dil için Windows konuşma tanıma paketi (Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri),
//!   - Mikrofon izni (Ayarlar › Gizlilik › Mikrofon › masaüstü uygulamaları),
//!   - Dikte için "Çevrimiçi konuşma tanıma" gizlilik ayarı (Windows dikte dilbilgisi bunu ister).
//! Masaüstü sesi (loopback) ve cihaz seçimi bu tanıyıcıyla desteklenmez: sadece Windows'un varsayılan kayıt cihazı
//! dinlenir (cihaz seçimi / bilgisayar sesi için bkz. stt_cloud.rs).
//!
//! Dil seçimi (`resolve`): istenen dil (ya da Windows konuşma dili) için kurulu tanıyıcı yoksa `SpeechRecognizer`
//! "Eleman bulunamadı (0x80070490)" hatası verir (ör. Türkçe Windows: Türkçe konuşma tanıma paketi yoktur). Bu yüzden
//! önce kurulu diller sayılır (`languages`), istenen yoksa kurulu bir dile düşülür ve kullanıcıya hangisinin kullanıldığı
//! bildirilir (seçim mantığı: stt.rs `pick_language`).
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

/// Dil etiketinin Windows arayüz dilindeki adı (ör. "tr-TR" → "Türkçe (Türkiye)")
pub fn display_name(tag: &str) -> String {
    Language::CreateLanguage(&HSTRING::from(tag)).and_then(|l| l.DisplayName()).map(|s| s.to_string()).unwrap_or_else(|_| tag.to_string())
}

/// Tanıyıcının desteklediği dikte dilleri: (etiket, görünen ad)
pub fn languages() -> Result<Vec<(String, String)>, String> {
    let list = match SpeechRecognizer::SupportedTopicLanguages() {
        Ok(l) => l,
        // Kurulu tanıyıcı yokken Windows "Eleman bulunamadı" döndürebilir: boş liste say
        Err(e) if matches!(e.code().0 as u32, E_NOT_FOUND | E_SP_NOT_FOUND) => return Ok(Vec::new()),
        Err(e) => return Err(err(&e)),
    };
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
const E_NOT_FOUND: u32 = 0x8007_0490; // ERROR_NOT_FOUND "Eleman bulunamadı": dil için tanıyıcı ya da kayıt cihazı yok
const E_SP_NOT_FOUND: u32 = 0x8004_503A; // SPERR_NOT_FOUND
const E_NO_DEVICE: u32 = 0x8007_0015; // ERROR_NOT_READY
const E_NO_ENDPOINT: u32 = 0x8889_0004; // AUDCLNT_E_DEVICE_INVALIDATED

fn err(e: &windows::core::Error) -> String {
    let code = e.code().0 as u32;
    match code {
        E_PRIVACY => "Windows'ta çevrimiçi konuşma tanıma kapalı: Ayarlar › Gizlilik ve güvenlik › Konuşma › “Çevrimiçi konuşma tanıma”yı açın.".into(),
        E_ACCESS => "Mikrofon izni yok: Ayarlar › Gizlilik ve güvenlik › Mikrofon › “Masaüstü uygulamalarının mikrofona erişmesine izin ver”i açın.".into(),
        E_NO_MIC => "Mikrofon bulunamadı: Windows ses ayarlarında bir kayıt cihazını varsayılan yapın.".into(),
        E_NOT_FOUND | E_SP_NOT_FOUND => "Windows konuşma tanıyıcısı bulunamadı: seçilen dil için konuşma tanıma paketi kurulu değil ya da Windows'ta varsayılan bir kayıt cihazı (mikrofon) yok. Aşağıdan kurulu bir dil seçin ve Windows ses ayarlarında mikrofonu varsayılan yapın.".into(),
        E_NO_DEVICE | E_NO_ENDPOINT => "Mikrofon kullanılamıyor: cihaz çıkarılmış ya da devre dışı. Windows ses ayarlarında bir kayıt cihazını varsayılan yapın.".into(),
        _ => {
            let m = e.message().to_string();
            if m.trim().is_empty() {
                format!("Windows konuşma tanıma hatası (0x{code:08X}).")
            } else {
                format!("Windows konuşma tanıma hatası: {} (0x{code:08X})", m.trim())
            }
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
/// `lang`: kurulu dillerden biri (bkz. `languages`; seçim ve yedek dil mantığı stt.rs'de). Boşsa Windows konuşma dili.
pub fn run(lang: &str, stop: impl Fn() -> bool, emit: impl Fn(SttEvent) + Send + Sync + Clone + 'static) -> Result<(), String> {
    let not_found = |e: &windows::core::Error, what: &str| {
        let code = e.code().0 as u32;
        if code == E_NOT_FOUND || code == E_SP_NOT_FOUND {
            format!("{what} için Windows konuşma tanıyıcısı açılamadı: dil paketi eksik ya da varsayılan mikrofon yok. Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri › “Konuşma tanıma”yı indirin ve Windows ses ayarlarında bir mikrofonu varsayılan yapın.")
        } else {
            err(e)
        }
    };
    let rec = if lang.is_empty() {
        SpeechRecognizer::new().map_err(|e| not_found(&e, "Windows konuşma dili"))?
    } else {
        let l = Language::CreateLanguage(&HSTRING::from(lang)).map_err(|_| format!("Geçersiz dil: {lang}"))?;
        SpeechRecognizer::Create(&l).map_err(|e| not_found(&e, lang))?
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
