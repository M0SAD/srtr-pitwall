//! Konuşmayı yazıya çevirme — "Çevrimiçi (Whisper)" motoru.
//!
//! Windows'un kendi tanıyıcısı (stt_win.rs) yalnızca varsayılan mikrofonu dinler, bilgisayar sesini (Discord'da
//! konuşanlar) dinleyemez ve Türkçe konuşma tanıma paketi yoktur. Bu motor sesi KENDİSİ yakalar:
//!
//!   - Mikrofon: seçilen kayıt cihazı (cpal giriş akışı),
//!   - Bilgisayar sesi: seçilen ÇIKIŞ cihazının geri döngüsü (WASAPI loopback; cpal çıkış cihazında giriş akışı
//!     açınca loopback kurar) — o cihazdan çalan her şey: Discord, oyun, tarayıcı…
//!
//! Yakalanan ses 16 kHz tek kanala indirilir, basit bir enerji tabanlı konuşma algılayıcısıyla (VAD) cümlelere
//! bölünür ve her cümle WAV olarak OpenAI uyumlu `POST {url}/audio/transcriptions` ucuna gönderilir (Groq, OpenAI ya da
//! kendi sunucun: faster-whisper-server, LocalAI…). Ses yalnızca konuşma algılanınca gönderilir. API anahtarı
//! ayarlarda değil, şifreli gizli dosyada tutulur (bkz. secrets.rs) ve hiçbir yere yazılmaz.

use rodio::cpal;
use rodio::cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Src {
    Mic,
    /// Bilgisayar sesi (çıkış cihazının geri döngüsü)
    System,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct CloudCfg {
    /// OpenAI uyumlu taban adres (ör. "https://api.groq.com/openai/v1")
    pub url: String,
    pub model: String,
    pub key: String,
    /// ISO-639-1 dil kodu ("tr"); boş: otomatik algıla
    pub language: String,
    /// 1..10 (yüksek: daha kısık sesleri de konuşma sayar)
    pub sensitivity: u8,
}

pub enum Ev {
    /// Dinlemeye başladı (kullanılan cihazın adı)
    Listening(String),
    /// Ses düzeyi 0..100 (gösterge için)
    Level(u8),
    Text(String),
    /// Geçici hata (dinleme sürer)
    Warn(String),
}

/// Hata: (kalıcı mı, metin). Kalıcı hatada (anahtar geçersiz, adres yanlış) yeniden denenmez.
pub type RunErr = (bool, String);

const RATE: u32 = 16_000;
/// 20 ms
const FRAME: usize = 320;
/// Konuşma başlangıcı: art arda bu kadar sesli çerçeve
const START_FRAMES: usize = 3;
/// Cümle sonu: bu kadar sessizlik
const END_SILENCE_MS: u32 = 700;
/// En uzun cümle (aşılırsa kesilip gönderilir)
const MAX_SEGMENT_S: usize = 14;
/// Bundan kısa konuşma (tık, öksürük) gönderilmez
const MIN_VOICED_MS: u32 = 280;
/// Konuşma öncesinden tutulan pay
const PREROLL: usize = RATE as usize * 3 / 10;

// ---------------------------------------------------------------------------
// Cihazlar
// ---------------------------------------------------------------------------

/// Kayıt cihazlarının adları
pub fn input_devices() -> Vec<String> {
    // cpal (WASAPI) cihaz listelenirken cihaz çıkarılırsa içeride panic yapabilir: yakalanır (crash.log'a yazılır)
    crate::crashlog::guard(|| {
        let host = cpal::default_host();
        let mut v: Vec<String> = host.input_devices().map(|it| it.filter_map(|d| d.name().ok()).collect()).unwrap_or_default();
        v.dedup();
        v
    })
    .unwrap_or_default()
}

pub fn default_input_name() -> Option<String> {
    crate::crashlog::guard(|| cpal::default_host().default_input_device().and_then(|d| d.name().ok())).flatten()
}

pub fn default_output_name() -> Option<String> {
    crate::crashlog::guard(|| cpal::default_host().default_output_device().and_then(|d| d.name().ok())).flatten()
}

pub(crate) fn open_device(src: Src, want: &str) -> Result<(cpal::Device, cpal::SupportedStreamConfig, String), String> {
    // cpal içindeki panic (cihaz o anda çıkarıldı vb.) hata olarak döner
    crate::crashlog::guard(|| open_device_inner(src, want)).unwrap_or_else(|| Err("Ses cihazı açılırken beklenmeyen hata oluştu".into()))
}

fn open_device_inner(src: Src, want: &str) -> Result<(cpal::Device, cpal::SupportedStreamConfig, String), String> {
    let host = cpal::default_host();
    fn find(mut it: impl Iterator<Item = cpal::Device>, want: &str) -> Option<cpal::Device> {
        it.find(|d| d.name().map(|n| n == want).unwrap_or(false))
    }
    match src {
        Src::Mic => {
            let chosen = if want.is_empty() { None } else { host.input_devices().ok().and_then(|it| find(it, want)) };
            let dev = chosen
                .or_else(|| host.default_input_device())
                .ok_or("Mikrofon bulunamadı: Windows'ta etkin bir kayıt cihazı yok. Mikrofonu takın ya da Windows ses ayarlarından etkinleştirin.")?;
            let cfg = dev.default_input_config().map_err(|e| format!("Mikrofon açılamadı: {e}"))?;
            let name = dev.name().unwrap_or_default();
            Ok((dev, cfg, name))
        }
        Src::System => {
            if !cfg!(windows) {
                return Err("Bilgisayar sesini yakalama sadece Windows'ta çalışır".into());
            }
            let chosen = if want.is_empty() { None } else { host.output_devices().ok().and_then(|it| find(it, want)) };
            let dev = chosen.or_else(|| host.default_output_device()).ok_or("Ses çıkış cihazı bulunamadı: Windows'ta etkin bir hoparlör / kulaklık yok.")?;
            // Geri döngü çıkış cihazının kendi biçimiyle açılır
            let cfg = dev.default_output_config().map_err(|e| format!("Bilgisayar sesi açılamadı: {e}"))?;
            let name = dev.name().unwrap_or_default();
            Ok((dev, cfg, name))
        }
    }
}

// ---------------------------------------------------------------------------
// Ses işleme (saf mantık; testleri aşağıda)
// ---------------------------------------------------------------------------

/// Çok kanallı örnekleri tek kanala indir
pub(crate) fn to_mono<T: Copy>(data: &[T], channels: usize, conv: impl Fn(T) -> f32) -> Vec<f32> {
    let ch = channels.max(1);
    data.chunks(ch).map(|c| c.iter().map(|s| conv(*s)).sum::<f32>() / c.len() as f32).collect()
}

/// Kutu süzgeçli örnekleme hızı düşürücü (giriş hızı → 16 kHz). Giriş 16 kHz'in altındaysa doğrusal ara değer.
pub struct Resampler {
    step: f64,
    /// Sıradaki çıkış örneğinin giriş eksenindeki başlangıcı
    pos: f64,
    acc: f32,
    n: u32,
    idx: u64,
    last: f32,
}

impl Resampler {
    pub fn new(in_rate: u32) -> Resampler {
        Resampler { step: in_rate.max(1) as f64 / RATE as f64, pos: 0.0, acc: 0.0, n: 0, idx: 0, last: 0.0 }
    }

    pub fn push(&mut self, input: &[f32], out: &mut Vec<f32>) {
        if self.step <= 1.0 {
            // Yukarı örnekleme (nadir: 8 kHz cihazlar)
            for &s in input {
                while self.pos <= self.idx as f64 {
                    let prev_i = self.idx as f64 - 1.0;
                    let t = (self.pos - prev_i).clamp(0.0, 1.0) as f32;
                    out.push(self.last + (s - self.last) * t);
                    self.pos += self.step;
                }
                self.last = s;
                self.idx += 1;
            }
            return;
        }
        for &s in input {
            self.acc += s;
            self.n += 1;
            self.idx += 1;
            if self.idx as f64 >= self.pos + self.step {
                out.push(self.acc / self.n as f32);
                self.acc = 0.0;
                self.n = 0;
                self.pos += self.step;
            }
        }
    }
}

pub(crate) fn rms(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    (frame.iter().map(|x| x * x).sum::<f32>() / frame.len() as f32).sqrt()
}

/// Hassasiyet 1..10 → taban eşik (RMS): 1 → 0,04 (≈ -28 dB) … 5 → 0,005 (≈ -46 dB) … 10 → 0,0004
pub fn base_threshold(sensitivity: u8) -> f32 {
    let s = sensitivity.clamp(1, 10) as f32;
    0.04 * 10f32.powf(-(s - 1.0) / 4.5)
}

/// RMS → gösterge düzeyi 0..100 (-60 dB … 0 dB)
pub fn level_of(r: f32) -> u8 {
    if r <= 0.000_001 {
        return 0;
    }
    ((20.0 * r.log10() + 60.0) / 60.0 * 100.0).clamp(0.0, 100.0) as u8
}

/// Konuşma algılayıcı: 16 kHz çerçevelerle beslenir, biten cümleyi döndürür
pub struct Vad {
    base: f32,
    noise: f32,
    pre: VecDeque<f32>,
    run: usize,
    seg: Option<Vec<f32>>,
    voiced: u32,
    silence_ms: u32,
    /// Cümle sırasında "meşgul" görüldü (sesli okuma / sesli mühendis konuşuyordu): cümle atılır
    tainted: bool,
}

impl Vad {
    pub fn new(sensitivity: u8) -> Vad {
        Vad { base: base_threshold(sensitivity), noise: 0.0, pre: VecDeque::with_capacity(PREROLL + FRAME), run: 0, seg: None, voiced: 0, silence_ms: 0, tainted: false }
    }

    pub fn in_speech(&self) -> bool {
        self.seg.is_some()
    }

    fn threshold(&self) -> f32 {
        self.base.max(self.noise * 2.5)
    }

    /// Bir çerçeve (20 ms) işle. Cümle bittiyse örneklerini döndürür.
    pub fn frame(&mut self, f: &[f32], busy: bool) -> Option<Vec<f32>> {
        let r = rms(f);
        let voiced = r > self.threshold();
        match self.seg.as_mut() {
            None => {
                if voiced {
                    self.run += 1;
                } else {
                    self.run = 0;
                    // Arka plan gürültüsü yavaşça izlenir (konuşma sırasında güncellenmez)
                    self.noise = (self.noise * 0.95 + r * 0.05).min(0.05);
                }
                self.pre.extend(f.iter().copied());
                while self.pre.len() > PREROLL {
                    self.pre.pop_front();
                }
                if self.run >= START_FRAMES {
                    self.seg = Some(self.pre.drain(..).collect());
                    self.voiced = self.run as u32;
                    self.silence_ms = 0;
                    self.run = 0;
                    self.tainted = busy;
                }
                None
            }
            Some(seg) => {
                seg.extend_from_slice(f);
                self.tainted |= busy;
                if voiced {
                    self.voiced += 1;
                    self.silence_ms = 0;
                } else {
                    self.silence_ms += 20;
                }
                if self.silence_ms >= END_SILENCE_MS || seg.len() >= MAX_SEGMENT_S * RATE as usize {
                    self.finish()
                } else {
                    None
                }
            }
        }
    }

    /// Süren cümleyi kapat (ses akışı kesildiğinde de çağrılır). Çok kısa ya da "meşgul" cümle atılır.
    pub fn finish(&mut self) -> Option<Vec<f32>> {
        let mut seg = self.seg.take()?;
        let ok = self.voiced * 20 >= MIN_VOICED_MS && !self.tainted;
        // Sondaki sessizliğin 200 ms'i kalsın
        let cut = (self.silence_ms.saturating_sub(200) as usize) * RATE as usize / 1000;
        seg.truncate(seg.len().saturating_sub(cut));
        self.voiced = 0;
        self.silence_ms = 0;
        self.tainted = false;
        ok.then_some(seg)
    }
}

/// 16 kHz tek kanal → 16 bit WAV
pub fn wav16(samples: &[f32]) -> Vec<u8> {
    let len = (samples.len() * 2) as u32;
    let mut w = Vec::with_capacity(samples.len() * 2 + 44);
    w.extend_from_slice(b"RIFF");
    w.extend_from_slice(&(36 + len).to_le_bytes());
    w.extend_from_slice(b"WAVEfmt ");
    w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes());
    w.extend_from_slice(&RATE.to_le_bytes());
    w.extend_from_slice(&(RATE * 2).to_le_bytes());
    w.extend_from_slice(&2u16.to_le_bytes());
    w.extend_from_slice(&16u16.to_le_bytes());
    w.extend_from_slice(b"data");
    w.extend_from_slice(&len.to_le_bytes());
    // Kısık kayıtlar tanıyıcıya daha net gitsin: tepe değeri 0,7'ye yükselt (en fazla 8 kat)
    let peak = samples.iter().fold(0f32, |m, x| m.max(x.abs()));
    let gain = if peak > 0.000_1 { (0.7 / peak).clamp(1.0, 8.0) } else { 1.0 };
    for s in samples {
        w.extend_from_slice(&(((s * gain).clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }
    w
}

/// Whisper'ın sessizlikte / gürültüde uydurduğu bilinen kalıplar
pub fn is_hallucination(text: &str) -> bool {
    let t: String = text.to_lowercase().chars().filter(|c| c.is_alphanumeric() || c.is_whitespace()).collect();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.is_empty() {
        return true;
    }
    const EXACT: &[&str] = &[
        "altyazı mk",
        "altyazı",
        "izlediğiniz için teşekkür ederim",
        "izlediğiniz için teşekkürler",
        "i̇zlediğiniz için teşekkür ederim",
        "i̇zlediğiniz için teşekkürler",
        "abone olmayı unutmayın",
        "thanks for watching",
        "thank you for watching",
        "thank you",
        "you",
        "bye",
        "müzik",
        "music",
    ];
    EXACT.contains(&t.as_str()) || t.contains("altyazı mk") || t.contains("amaraorg")
}

/// Taban adres güvenli mi: https ya da yerel sunucu (anahtar düz http ile uzağa gönderilmez)
pub fn check_url(url: &str) -> Result<String, String> {
    let u = url.trim().trim_end_matches('/');
    let local = ["http://localhost", "http://127.0.0.1", "http://[::1]"].iter().any(|p| u.starts_with(p));
    if u.starts_with("https://") || local {
        if u.contains(char::is_whitespace) {
            return Err("Sunucu adresi geçersiz".into());
        }
        Ok(u.to_string())
    } else if u.is_empty() {
        Err("Çevrimiçi motor için sunucu adresi seçilmedi".into())
    } else {
        Err("Sunucu adresi https:// ile başlamalı (yerel sunucu için http://localhost)".into())
    }
}

pub fn is_local(url: &str) -> bool {
    ["http://localhost", "http://127.0.0.1", "http://[::1]"].iter().any(|p| url.trim().starts_with(p))
}

// ---------------------------------------------------------------------------
// Sunucu çağrısı
// ---------------------------------------------------------------------------

fn multipart(boundary: &str, fields: &[(&str, &str)], wav: &[u8]) -> Vec<u8> {
    let mut b = Vec::with_capacity(wav.len() + 512);
    for (k, v) in fields {
        b.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").as_bytes());
    }
    b.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n").as_bytes());
    b.extend_from_slice(wav);
    b.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    b
}

/// Sunucunun hata gövdesinden kısa ileti (anahtar içermez)
fn api_message(body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
    let m = v.pointer("/error/message").or_else(|| v.pointer("/message")).or_else(|| v.pointer("/error")).and_then(|x| x.as_str()).unwrap_or("");
    m.chars().take(160).collect()
}

pub(crate) async fn transcribe(cfg: &CloudCfg, wav: Vec<u8>) -> Result<String, RunErr> {
    let base = check_url(&cfg.url).map_err(|e| (true, e))?;
    let boundary = format!("----pitwall{:016x}", super::poll::rand_u64());
    let mut fields: Vec<(&str, &str)> = vec![("model", cfg.model.as_str()), ("response_format", "json"), ("temperature", "0")];
    if !cfg.language.is_empty() {
        fields.push(("language", cfg.language.as_str()));
    }
    let body = multipart(&boundary, &fields, &wav);
    let client = super::net::http().map_err(|e| (false, e))?;
    let mut req = client.post(format!("{base}/audio/transcriptions")).header("Content-Type", format!("multipart/form-data; boundary={boundary}")).body(body);
    if !cfg.key.is_empty() {
        req = req.bearer_auth(&cfg.key);
    }
    let resp = req.send().await.map_err(|e| {
        let m = if e.is_timeout() {
            "Konuşma tanıma sunucusu yanıt vermedi (zaman aşımı).".to_string()
        } else if e.is_connect() {
            "Konuşma tanıma sunucusuna bağlanılamadı (internet / adres?).".to_string()
        } else {
            "Konuşma tanıma isteği gönderilemedi.".to_string()
        };
        (false, m)
    })?;
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    match status {
        200..=299 => {
            let v: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
            Ok(v.get("text").and_then(|x| x.as_str()).unwrap_or("").trim().to_string())
        }
        401 | 403 => Err((true, "API anahtarı geçersiz ya da yetkisiz: Konuşma → yazı ayarlarından anahtarı yeniden girin.".into())),
        404 => Err((true, format!("Sunucu adresi ya da model bulunamadı (404): adresi ve model adını ({}) kontrol edin. {}", cfg.model, api_message(&text)))),
        400 | 422 => Err((false, format!("Sunucu isteği kabul etmedi ({status}): {}", api_message(&text)))),
        413 => Err((false, "Ses parçası sunucu için çok büyük.".into())),
        429 => Err((false, "Konuşma tanıma kotası / hız sınırı doldu; biraz sonra yeniden denenecek.".into())),
        _ => Err((false, format!("Konuşma tanıma sunucusu hata verdi ({status}). {}", api_message(&text)))),
    }
}

// ---------------------------------------------------------------------------
// Dinleme döngüsü
// ---------------------------------------------------------------------------

/// Kaynağı dinle ve cümleleri yazıya çevir (çağıran iş parçacığını bloklar). `stop()` true dönünce Ok ile çıkar.
/// `busy()`: sesli okuma / sesli mühendis konuşuyor (o sırada yakalanan cümle atılır).
pub fn run(src: Src, device: &str, cfg: &CloudCfg, stop: impl Fn() -> bool, busy: impl Fn() -> bool, emit: impl Fn(Ev)) -> Result<(), RunErr> {
    check_url(&cfg.url).map_err(|e| (true, e))?;
    if cfg.key.is_empty() && !is_local(&cfg.url) {
        return Err((true, "API anahtarı girilmedi: “Çevrimiçi (Whisper)” motoru için anahtarı aşağıya yapıştırın.".into()));
    }
    if cfg.model.trim().is_empty() {
        return Err((true, "Model adı boş".into()));
    }
    let (dev, scfg, name) = open_device(src, device).map_err(|e| (false, e))?;
    let channels = scfg.channels() as usize;
    let in_rate = scfg.sample_rate().0;
    let (tx, rx) = mpsc::channel::<Vec<f32>>();
    let failed: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let f2 = failed.clone();
    let on_err = move |e: cpal::StreamError| {
        if let Ok(mut g) = f2.lock() {
            *g = Some(e.to_string());
        }
    };
    let config: cpal::StreamConfig = scfg.config();
    let stream = match scfg.sample_format() {
        cpal::SampleFormat::F32 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[f32], _: &cpal::InputCallbackInfo| drop(tx.send(to_mono(d, channels, |s| s))), on_err, None)
        }
        cpal::SampleFormat::I16 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[i16], _: &cpal::InputCallbackInfo| drop(tx.send(to_mono(d, channels, |s| s as f32 / 32768.0))), on_err, None)
        }
        cpal::SampleFormat::U16 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[u16], _: &cpal::InputCallbackInfo| drop(tx.send(to_mono(d, channels, |s| (s as f32 - 32768.0) / 32768.0))), on_err, None)
        }
        cpal::SampleFormat::I32 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[i32], _: &cpal::InputCallbackInfo| drop(tx.send(to_mono(d, channels, |s| s as f32 / 2_147_483_648.0))), on_err, None)
        }
        other => return Err((false, format!("Ses biçimi desteklenmiyor: {other:?}"))),
    }
    .map_err(|e| {
        let what = if src == Src::Mic { "Mikrofon" } else { "Bilgisayar sesi" };
        (false, format!("{what} açılamadı ({name}): {e}. Cihaz başka bir uygulama tarafından özel kipte kullanılıyor ya da Windows mikrofon izni kapalı olabilir."))
    })?;
    drop(tx);
    stream.play().map_err(|e| (false, format!("Ses yakalama başlatılamadı: {e}")))?;
    emit(Ev::Listening(name));

    let mut rs = Resampler::new(in_rate);
    let mut vad = Vad::new(cfg.sensitivity);
    let mut pending: Vec<f32> = Vec::with_capacity(RATE as usize);
    let mut last_data = Instant::now();
    let mut level_at = Instant::now();
    let mut level_peak = 0f32;
    let mut last_level = 255u8;
    loop {
        if stop() {
            return Ok(());
        }
        if let Some(e) = failed.lock().ok().and_then(|mut g| g.take()) {
            return Err((false, format!("Ses akışı kesildi: {e}")));
        }
        let mut done: Option<Vec<f32>> = None;
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(chunk) => {
                last_data = Instant::now();
                rs.push(&chunk, &mut pending);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Geri döngüde hiçbir şey çalmıyorken veri gelmez: süren cümleyi kapat
                if vad.in_speech() && last_data.elapsed() > Duration::from_millis(END_SILENCE_MS as u64) {
                    done = vad.finish();
                }
                level_peak = 0.0;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return Err((false, "Ses akışı kapandı".into())),
        }
        let mut off = 0;
        while pending.len() - off >= FRAME {
            let f = &pending[off..off + FRAME];
            level_peak = level_peak.max(rms(f));
            let b = vad.in_speech() && busy();
            if let Some(seg) = vad.frame(f, b) {
                // Aynı turda iki cümle bitmesi çok nadir: ilki gönderilir
                if done.is_none() {
                    done = Some(seg);
                }
            }
            off += FRAME;
        }
        pending.drain(..off);
        if level_at.elapsed() > Duration::from_millis(300) {
            let l = level_of(level_peak);
            if l != last_level {
                emit(Ev::Level(l));
                last_level = l;
            }
            level_peak = 0.0;
            level_at = Instant::now();
        }
        if let Some(seg) = done {
            let wav = wav16(&seg);
            match tauri::async_runtime::block_on(transcribe(cfg, wav)) {
                Ok(text) => {
                    if !is_hallucination(&text) {
                        emit(Ev::Text(text));
                    }
                }
                Err((true, e)) => return Err((true, e)),
                Err((false, e)) => emit(Ev::Warn(e)),
            }
            // İstek sürerken biriken ses sırayla işlenir (kuyruk 30 sn'yi aşarsa eskisi atılır)
            let mut backlog = 0usize;
            let mut chunks: Vec<Vec<f32>> = Vec::new();
            while let Ok(c) = rx.try_recv() {
                backlog += c.len();
                chunks.push(c);
            }
            let max = in_rate as usize * 30;
            let mut skip = backlog.saturating_sub(max);
            for c in chunks {
                if skip >= c.len() {
                    skip -= c.len();
                    continue;
                }
                rs.push(&c[skip..], &mut pending);
                skip = 0;
            }
            last_data = Instant::now();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(ms: usize, amp: f32) -> Vec<f32> {
        (0..RATE as usize * ms / 1000).map(|i| (i as f32 * 0.2).sin() * amp).collect()
    }

    #[test]
    fn resample_and_levels() {
        let mut r = Resampler::new(48_000);
        let mut out = Vec::new();
        r.push(&vec![0.5f32; 48_000], &mut out);
        assert!((out.len() as i64 - 16_000).abs() <= 1);
        assert!(out.iter().all(|x| (x - 0.5).abs() < 1e-4));
        let mut r = Resampler::new(44_100);
        let mut out = Vec::new();
        for _ in 0..10 {
            r.push(&vec![0.1f32; 4_410], &mut out);
        }
        assert!((out.len() as i64 - 16_000).abs() <= 2);
        let mut r = Resampler::new(8_000);
        let mut out = Vec::new();
        r.push(&vec![0.2f32; 8_000], &mut out);
        assert!((out.len() as i64 - 16_000).abs() <= 2);
        assert_eq!(to_mono(&[1i16, 3, 5, 7], 2, |s| s as f32), vec![2.0, 6.0]);
        assert!(base_threshold(1) > base_threshold(5) && base_threshold(5) > base_threshold(10));
        assert!((base_threshold(5) - 0.005).abs() < 0.001);
        assert_eq!(level_of(0.0), 0);
        assert_eq!(level_of(1.0), 100);
        assert!(level_of(0.03) > 40 && level_of(0.03) < 60);
    }

    #[test]
    fn vad_segments() {
        let mut v = Vad::new(5);
        let mut audio = vec![0.0f32; RATE as usize / 2];
        audio.extend(tone(800, 0.2));
        audio.extend(vec![0.0f32; RATE as usize]);
        let mut segs = Vec::new();
        for f in audio.chunks(FRAME).filter(|c| c.len() == FRAME) {
            if let Some(s) = v.frame(f, false) {
                segs.push(s);
            }
        }
        assert_eq!(segs.len(), 1);
        let ms = segs[0].len() * 1000 / RATE as usize;
        assert!((900..=1500).contains(&ms), "{ms}");
        // Çok kısa ses (tık) cümle sayılmaz
        let mut v = Vad::new(5);
        let mut audio = tone(100, 0.3);
        audio.extend(vec![0.0f32; RATE as usize]);
        assert!(audio.chunks(FRAME).filter(|c| c.len() == FRAME).all(|f| v.frame(f, false).is_none()));
        // Sesli okuma konuşurken yakalanan cümle atılır
        let mut v = Vad::new(5);
        let mut audio = tone(800, 0.2);
        audio.extend(vec![0.0f32; RATE as usize]);
        assert!(audio.chunks(FRAME).filter(|c| c.len() == FRAME).all(|f| v.frame(f, true).is_none()));
        // Akış kesilince süren cümle kapatılır
        let mut v = Vad::new(5);
        for f in tone(600, 0.2).chunks(FRAME).filter(|c| c.len() == FRAME) {
            assert!(v.frame(f, false).is_none());
        }
        assert!(v.in_speech());
        assert!(v.finish().is_some());
        assert!(!v.in_speech());
    }

    #[test]
    fn wav_and_text() {
        let w = wav16(&[0.0, 0.1, -0.1]);
        assert_eq!(w.len(), 44 + 6);
        assert_eq!(&w[0..4], b"RIFF");
        assert!(is_hallucination("Altyazı M.K."));
        assert!(is_hallucination(" Thanks for watching! "));
        assert!(is_hallucination(""));
        assert!(!is_hallucination("Pite gir, lastikler bitti"));
        assert_eq!(check_url("https://api.groq.com/openai/v1/").unwrap(), "https://api.groq.com/openai/v1");
        assert!(check_url("http://example.com/v1").is_err());
        assert!(check_url("http://localhost:8000/v1").is_ok());
        assert!(check_url("").is_err());
        let b = multipart("B", &[("model", "m")], b"WAV");
        let s = String::from_utf8_lossy(&b);
        assert!(s.starts_with("--B\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nm\r\n--B\r\n"));
        assert!(s.ends_with("\r\nWAV\r\n--B--\r\n"));
        assert_eq!(api_message(r#"{"error":{"message":"Invalid API Key"}}"#), "Invalid API Key");
    }
}
