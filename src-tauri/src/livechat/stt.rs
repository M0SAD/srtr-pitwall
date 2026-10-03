//! Konuşmayı yazıya çevirme (altyazı, PRO: `livechat.stt`).
//!
//! İki motor vardır (ayar: `general.livechat.stt.engine`):
//!
//!   - "windows": Windows'un konuşma tanıyıcısı (WinRT SpeechRecognizer, sürekli dikte, bkz. stt_win.rs). Anahtar /
//!     hesap gerekmez; yalnızca MİKROFONU dinler (bu sürecin varsayılan kayıt cihazı: Sesli komut ayarındaki mikrofon
//!     seçimiyle ortaktır, bkz. voicecmd_win.rs) ve yalnızca Windows'ta konuşma tanıma paketi kurulu dilleri tanır
//!     (Türkçe paketi yoktur). İstenen dil kurulu değilse kurulu bir dile düşülür ve kullanıcıya bildirilir.
//!   - "cloud": sesi uygulama yakalar (seçilen mikrofon ve/veya seçilen çıkış cihazının geri döngüsü = bilgisayar
//!     sesi, ör. Discord'da konuşanlar) ve OpenAI uyumlu bir Whisper sunucusuna gönderir (bkz. stt_cloud.rs).
//!     Türkçe dahil ~100 dil; API anahtarı gerekir (yerel sunucu hariç).
//!
//! Kaynak (`source`): "mic" | "system" | "both". Kesinleşen cümleler `Hub::push_caption` ile altyazı kutusuna gider:
//! mikrofon → "mic" (etiket: `label`, ör. "Ben"), bilgisayar sesi → "remote" (etiket: `remoteLabel`, ör. "Discord").
//! İsteğe bağlı küfür filtresi (ilk harf kalır: "s*****"), sesli okuma / sesli mühendis konuşurken duyulanları yazmama.
//!
//! Olay: "livechat-stt" SttStatus

// Windows dışında motor yok: motorla ilgili parçalar sadece Windows'ta kullanılır
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use super::allowed;
use super::filter::is_w;
use super::stt_cloud::{self as cloud, CloudCfg, Src};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub const FEATURE: &str = "livechat.stt";
pub const SUPPORTED: bool = cfg!(windows);
/// Çevrimiçi motorun API anahtarının gizli dosyadaki adı (bkz. secrets.rs)
const KEY_NAME: &str = "sttApiKey";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Engine {
    #[default]
    Windows,
    Cloud,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Source {
    #[default]
    Mic,
    System,
    Both,
}

impl Source {
    fn mic(self) -> bool {
        matches!(self, Source::Mic | Source::Both)
    }
    fn system(self) -> bool {
        matches!(self, Source::System | Source::Both)
    }
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct SttCfg {
    pub enabled: bool,
    pub engine: Engine,
    pub source: Source,
    /// Windows motoru: BCP-47 dil etiketi (boş: Windows konuşma dili)
    pub language: String,
    /// Çevrimiçi motor: ISO-639-1 kodu; boş: arayüz dili, "auto": otomatik algıla
    pub cloud_language: String,
    pub profanity: bool,
    pub profanity_words: String,
    /// Sesli okuma konuşurken duyulanları yazma
    pub pause_while_tts: bool,
    /// Mikrofon altyazısının önündeki ad (boş: yok; ör. "Ben")
    pub label: String,
    /// Bilgisayar sesi altyazısının önündeki ad (ör. "Discord")
    pub remote_label: String,
    /// Çevrimiçi motor: kayıt cihazı adı (boş: Windows varsayılanı)
    pub mic_device: String,
    /// Çevrimiçi motor: geri döngüsü dinlenecek çıkış cihazı adı (boş: Windows varsayılanı)
    pub system_device: String,
    /// Windows motoru: kayıt cihazı kimliği (Sesli komut ayarıyla ortak; boş: Windows varsayılanı)
    pub win_mic: String,
    /// Arayüz dili (ör. "tr"): dil yedeği ve çevrimiçi motorun varsayılan dili
    pub ui_lang: String,
    pub cloud_url: String,
    pub cloud_model: String,
    /// 1..10
    pub sensitivity: u8,
}

pub fn cfg_from_settings(v: &Value) -> SttCfg {
    let ui_lang = v.pointer("/general/language").and_then(|x| x.as_str()).unwrap_or("tr").trim().to_string();
    let win_mic = v.pointer("/general/voice/commands/mic").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    let Some(t) = v.pointer("/general/livechat/stt") else {
        return SttCfg { pause_while_tts: true, remote_label: "Discord".into(), sensitivity: 5, ui_lang, win_mic, ..Default::default() };
    };
    let b = |p: &str, def: bool| t.pointer(p).and_then(|x| x.as_bool()).unwrap_or(def);
    let s = |p: &str| t.pointer(p).and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    SttCfg {
        enabled: b("/enabled", false),
        engine: if s("/engine") == "cloud" { Engine::Cloud } else { Engine::Windows },
        source: match s("/source").as_str() {
            "system" => Source::System,
            "both" => Source::Both,
            _ => Source::Mic,
        },
        language: s("/language"),
        cloud_language: s("/cloudLanguage"),
        profanity: b("/profanity", false),
        profanity_words: s("/profanityWords"),
        pause_while_tts: b("/pauseWhileTts", true),
        label: s("/label").chars().take(24).collect(),
        remote_label: match t.pointer("/remoteLabel").and_then(|x| x.as_str()) {
            Some(x) => x.trim().chars().take(24).collect(),
            None => "Discord".into(),
        },
        mic_device: s("/micDevice"),
        system_device: s("/systemDevice"),
        win_mic,
        ui_lang,
        cloud_url: s("/cloud/url"),
        cloud_model: s("/cloud/model"),
        sensitivity: t.pointer("/sensitivity").and_then(|x| x.as_f64()).unwrap_or(5.0).clamp(1.0, 10.0) as u8,
    }
}

impl SttCfg {
    /// Dinlemeyi yeniden başlatmayı gerektiren alanlar (etiket, filtre gibi alanlar değişince yeniden başlatılmaz)
    fn run_key(&self, key: &str) -> String {
        match self.engine {
            Engine::Windows => format!("win|{}|{}|{}|{:?}", self.language, self.win_mic, self.ui_lang, self.source),
            Engine::Cloud => format!(
                "cloud|{:?}|{}|{}|{}|{}|{}|{}|{}|{}",
                self.source,
                self.mic_device,
                self.system_device,
                self.cloud_url,
                self.cloud_model,
                self.cloud_lang(),
                self.sensitivity,
                key.len(),
                // Anahtarın kendisi karşılaştırma metnine girmez: kısa özeti yeter
                key.bytes().fold(0u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32))
            ),
        }
    }

    /// Çevrimiçi motora gönderilecek dil kodu ("" : otomatik algıla)
    fn cloud_lang(&self) -> String {
        let l = self.cloud_language.trim().to_lowercase();
        let l = if l.is_empty() { self.ui_lang.to_lowercase() } else { l };
        if l == "auto" {
            return String::new();
        }
        l.split(['-', '_']).next().unwrap_or("").chars().take(3).collect()
    }
}

// ---------------------------------------------------------------------------
// Küfür filtresi (MCO yardimci.py ProfanityFilter): "kelime*" önek, diğerleri tam kelime; ilk harf kalır.
// Türkçede ı/i birleştirilmez ("sıkıldım", "götürmek" gibi masum kelimeler yakalanmasın).
// ---------------------------------------------------------------------------

const PROFANITY: &[&str] = &[
    // Türkçe
    "amına*", "amina*", "amını*", "amcık*", "amcik*", "amk", "amq", "aq", "mk", "orospu*", "orosbu*", "oç", "piç*", "pic", "sik", "sikik*",
    "sikim*", "sikiş*", "sikis*", "siktir*", "siktiğ*", "sikeyim", "sikerim", "siker", "sikecek*", "sikey*", "sikt*", "yarrak*", "yarak",
    "yarağ*", "yarram*", "dalyarak*", "dalyarrak*", "taşak*", "taşşak*", "göt", "götü", "götün", "götveren*", "götoş*", "kahpe*",
    "pezevenk*", "puşt*", "ibne*", "gavat*", "kaltak*", "kancık*", "fahişe*", "sürtük*", "yavşak*", "şerefsiz*", "ananı*", "ananın amı*",
    "gerizekalı*", "salak", "dangalak*", "hıyarağası",
    // English
    "fuck*", "motherfuck*", "shit*", "bullshit*", "bitch*", "asshole*", "bastard*", "dick", "dickhead*", "cunt*", "pussy", "whore*", "slut*",
    "wanker*", "twat*", "nigger*", "nigga*", "faggot*", "fag", "retard*", "cock", "cocksucker*", "jerkoff*",
];

/// Türkçe küçük harf (İ→i, I→ı); karakter başına bir karakter
fn tr_lower(s: &str) -> Vec<char> {
    s.chars()
        .map(|c| match c {
            'İ' => 'i',
            'I' => 'ı',
            _ => c.to_lowercase().next().unwrap_or(c),
        })
        .collect()
}

pub struct Profanity {
    /// (kelimeler, önek mi)
    words: Vec<(Vec<Vec<char>>, bool)>,
}

impl Profanity {
    pub fn new(extra: &str, builtin: bool) -> Profanity {
        let mut list: Vec<String> = if builtin { PROFANITY.iter().map(|s| s.to_string()).collect() } else { vec![] };
        list.extend(extra.split([',', '\n']).map(|w| w.trim().to_string()).filter(|w| !w.is_empty()));
        let words = list
            .iter()
            .filter_map(|w| {
                let prefix = w.ends_with('*');
                let w = w.trim_end_matches('*').trim();
                let parts: Vec<Vec<char>> = w.split_whitespace().map(tr_lower).collect();
                (!parts.is_empty()).then_some((parts, prefix))
            })
            .collect();
        Profanity { words }
    }

    /// Eşleşmenin bitişi (i'den başlayarak; kelimeler arasında bir ya da daha çok boşluk)
    fn match_at(text: &[char], i: usize, parts: &[Vec<char>], prefix: bool) -> Option<usize> {
        let mut j = i;
        for (k, p) in parts.iter().enumerate() {
            if k > 0 {
                let s = j;
                while j < text.len() && text[j].is_whitespace() {
                    j += 1;
                }
                if j == s {
                    return None;
                }
            }
            if j + p.len() > text.len() || text[j..j + p.len()] != p[..] {
                return None;
            }
            j += p.len();
        }
        if prefix {
            while j < text.len() && is_w(text[j]) {
                j += 1;
            }
            Some(j)
        } else if j < text.len() && is_w(text[j]) {
            None
        } else {
            Some(j)
        }
    }

    pub fn mask(&self, text: &str) -> String {
        if self.words.is_empty() || text.is_empty() {
            return text.to_string();
        }
        let low = tr_lower(text);
        let mut chars: Vec<char> = text.chars().collect();
        if low.len() != chars.len() {
            return text.to_string();
        }
        let mut i = 0;
        while i < low.len() {
            if i > 0 && is_w(low[i - 1]) {
                i += 1;
                continue;
            }
            let mut end = None;
            for (parts, prefix) in &self.words {
                if let Some(e) = Self::match_at(&low, i, parts, *prefix) {
                    end = Some(end.map_or(e, |x: usize| x.max(e)));
                }
            }
            match end {
                Some(e) => {
                    for c in chars.iter_mut().take(e).skip(i + 1) {
                        if !c.is_whitespace() {
                            *c = '*';
                        }
                    }
                    i = e.max(i + 1);
                }
                None => i += 1,
            }
        }
        chars.into_iter().collect()
    }
}

// ---------------------------------------------------------------------------
// Windows motoru: dil seçimi
// ---------------------------------------------------------------------------

pub const NO_LANGUAGE: &str = "Windows'ta kurulu konuşma tanıma dili yok. Ayarlar › Saat ve dil › Dil ve bölge › “Dil ekle” ile bir dil (ör. English (United States)) ekleyin ve “Konuşma tanıma” seçeneğini işaretleyin; ardından “Tekrar dene”ye basın. Windows'ta Türkçe konuşma tanıma paketi yoktur: Türkçe için “Çevrimiçi (Whisper)” motorunu seçin.";

fn primary(tag: &str) -> String {
    tag.split(['-', '_']).next().unwrap_or("").to_lowercase()
}

/// Kurulu dillerden (`supported`: etiket, ad) seçim: istenen dil (tam eşleşme → aynı ana dil) → tercih listesi
/// (ör. arayüz dili) → en-US → ilk kurulu dil. Döner: (sıra, istenen dil bulunamadığı için yedeğe düşüldü mü).
/// İstenen dil kurulu değilken `SpeechRecognizer` "Eleman bulunamadı (0x80070490)" hatası verir; bu seçim onu önler.
pub fn pick_language(supported: &[(String, String)], wanted: &str, prefer: &[String]) -> Option<(usize, bool)> {
    if supported.is_empty() {
        return None;
    }
    let find_exact = |t: &str| supported.iter().position(|(tag, _)| tag.eq_ignore_ascii_case(t));
    let find_primary = |t: &str| supported.iter().position(|(tag, _)| primary(tag) == primary(t));
    if !wanted.is_empty() {
        if let Some(i) = find_exact(wanted).or_else(|| find_primary(wanted)) {
            return Some((i, false));
        }
    }
    for p in prefer.iter().filter(|p| !p.is_empty()) {
        if let Some(i) = find_exact(p).or_else(|| find_primary(p)) {
            return Some((i, !wanted.is_empty()));
        }
    }
    Some((find_exact("en-US").or_else(|| find_primary("en")).unwrap_or(0), !wanted.is_empty()))
}

// ---------------------------------------------------------------------------
// Çalışma zamanı
// ---------------------------------------------------------------------------

/// Bir kaynağın (mikrofon / bilgisayar sesi) durumu
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SrcStatus {
    /// Bu kaynak isteniyor (ayar)
    pub wanted: bool,
    pub listening: bool,
    /// Kullanılan cihazın adı (biliniyorsa)
    pub device: Option<String>,
    /// Ses düzeyi 0..100 (yalnızca çevrimiçi motor)
    pub level: u8,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SttStatus {
    pub enabled: bool,
    pub allowed: bool,
    pub supported: bool,
    /// Dinliyor (kaynaklardan en az biri)
    pub listening: bool,
    pub language: String,
    pub error: Option<String>,
    /// Son duyulan cümle
    pub last: Option<String>,
    /// "windows" | "cloud"
    pub engine: &'static str,
    /// Gerçekte kullanılan tanıma dili (ör. "English (United States) · en-US"; çevrimiçi motorda dil kodu)
    pub active_language: Option<String>,
    /// Uyarı (dinleme sürer): başka dile düşüldü, geçici sunucu hatası…
    pub notice: Option<String>,
    /// Çevrimiçi motorun API anahtarı kayıtlı
    pub has_key: bool,
    pub mic: SrcStatus,
    pub system: SrcStatus,
}

#[derive(Default)]
struct SrcRt {
    listening: bool,
    device: Option<String>,
    level: u8,
    error: Option<String>,
}

#[derive(Default)]
struct St {
    cfg: SttCfg,
    /// Çevrimiçi motorun API anahtarı (gizli dosyadan; asla dışarı verilmez)
    key: String,
    /// Çalışan dinleme iş parçacıklarının durdurma bayrağı, çalıştırma anahtarı ve kuşağı
    run: Option<(Arc<AtomicBool>, String, u64)>,
    gen: u64,
    mic: SrcRt,
    sys: SrcRt,
    active_language: Option<String>,
    notice: Option<String>,
    last: Option<String>,
    filter: Option<Arc<Profanity>>,
}

pub struct Stt {
    app: AppHandle,
    st: Mutex<St>,
}

const SYSTEM_NEEDS_CLOUD: &str = "Bilgisayar sesi (Discord vb.) Windows motoruyla yazıya çevrilemez: Windows tanıyıcısı yalnızca mikrofonu dinler. Bunun için motor olarak “Çevrimiçi (Whisper)” seçin.";

impl Stt {
    fn status(&self) -> SttStatus {
        let ok = allowed(&self.app, FEATURE);
        let g = self.st.lock();
        let running = g.run.is_some();
        let src = |want: bool, r: &SrcRt| SrcStatus { wanted: want, listening: running && r.listening, device: r.device.clone(), level: if running && r.listening { r.level } else { 0 }, error: r.error.clone() };
        let mic = src(g.cfg.source.mic(), &g.mic);
        let system = src(g.cfg.source.system(), &g.sys);
        let error = match (&mic.error, &system.error) {
            (Some(a), Some(b)) if a != b => Some(format!("{a}\n{b}")),
            (Some(a), _) => Some(a.clone()),
            (None, Some(b)) => Some(b.clone()),
            (None, None) => None,
        };
        SttStatus {
            enabled: g.cfg.enabled,
            allowed: ok,
            supported: SUPPORTED,
            listening: mic.listening || system.listening,
            language: g.cfg.language.clone(),
            error,
            last: g.last.clone(),
            engine: if g.cfg.engine == Engine::Cloud { "cloud" } else { "windows" },
            active_language: g.active_language.clone(),
            notice: g.notice.clone(),
            has_key: !g.key.is_empty(),
            mic,
            system,
        }
    }

    fn emit(&self) {
        let _ = self.app.emit("livechat-stt", self.status());
    }

    /// İstenen duruma getir (açık + izinli → dinle; motor / kaynak / cihaz / dil değiştiyse yeniden başlat)
    fn reconcile(self: &Arc<Self>) {
        let ok = allowed(&self.app, FEATURE);
        let mut g = self.st.lock();
        let want = g.cfg.enabled && ok && SUPPORTED;
        let key = g.cfg.run_key(&g.key);
        let same = g.run.as_ref().is_some_and(|(_, k, _)| *k == key);
        if !want || !same {
            if let Some((stop, _, _)) = g.run.take() {
                stop.store(true, Ordering::Relaxed);
            }
            g.mic = SrcRt::default();
            g.sys = SrcRt::default();
            g.active_language = None;
            g.notice = None;
        }
        if want && g.run.is_none() {
            g.gen += 1;
            let gen = g.gen;
            let stop = Arc::new(AtomicBool::new(false));
            g.run = Some((stop.clone(), key, gen));
            let cfg = g.cfg.clone();
            match cfg.engine {
                Engine::Windows => {
                    if cfg.source.system() {
                        g.sys.error = Some(SYSTEM_NEEDS_CLOUD.into());
                    }
                    if cfg.source.mic() {
                        let me = self.clone();
                        let _ = std::thread::Builder::new().name("livechat-stt".into()).spawn(move || me.win_thread(cfg, stop, gen));
                    }
                }
                Engine::Cloud => {
                    let ccfg = CloudCfg { url: cfg.cloud_url.clone(), model: cfg.cloud_model.clone(), key: g.key.clone(), language: cfg.cloud_lang(), sensitivity: cfg.sensitivity };
                    g.active_language = Some(if ccfg.language.is_empty() { "auto".into() } else { ccfg.language.clone() });
                    for (on, src, dev, name) in [(cfg.source.mic(), Src::Mic, cfg.mic_device.clone(), "livechat-stt-mic"), (cfg.source.system(), Src::System, cfg.system_device.clone(), "livechat-stt-sys")] {
                        if !on {
                            continue;
                        }
                        let me = self.clone();
                        let (c, st) = (ccfg.clone(), stop.clone());
                        let _ = std::thread::Builder::new().name(name.into()).spawn(move || me.cloud_thread(src, dev, c, st, gen));
                    }
                }
            }
        }
        drop(g);
        self.emit();
    }

    fn current(&self, gen: u64) -> bool {
        self.st.lock().run.as_ref().map(|r| r.2) == Some(gen)
    }

    /// Kaynağın çalışma durumunu güncelle (kuşak eskiyse yok say)
    fn with_src(&self, gen: u64, src: Src, f: impl FnOnce(&mut SrcRt, &mut St2)) {
        {
            let mut g = self.st.lock();
            if g.run.as_ref().map(|r| r.2) != Some(gen) {
                return;
            }
            let St { mic, sys, notice, active_language, .. } = &mut *g;
            let mut extra = St2 { notice, active_language };
            f(if src == Src::Mic { mic } else { sys }, &mut extra);
        }
        self.emit();
    }

    /// Sesli okuma konuşuyor (ya da az önce bitti)
    fn tts_busy(&self) -> bool {
        super::tts::tts(&self.app).is_some_and(|t| t.speaking.load(Ordering::Relaxed) || super::model::now_ms() < t.quiet_until.load(Ordering::Relaxed))
    }

    fn on_text(&self, gen: u64, src: Src, text: String, check_tts: bool) {
        let (pause, label, filter) = {
            let g = self.st.lock();
            if g.run.as_ref().map(|r| r.2) != Some(gen) {
                return;
            }
            (g.cfg.pause_while_tts, if src == Src::Mic { g.cfg.label.clone() } else { g.cfg.remote_label.clone() }, g.filter.clone())
        };
        // Sesli okuma konuşurken (ve hemen ardından) duyulanlar yazılmaz
        if check_tts && pause && self.tts_busy() {
            return;
        }
        let text = match filter {
            Some(f) => f.mask(&text),
            None => text,
        };
        // Anket kısayolu basılıyken söylenenler anket sorusudur; altyazıya yazılmaz
        if src == Src::Mic && super::poll_dict_take(&self.app, &text) {
            return;
        }
        super::hub(&self.app).push_caption(if src == Src::Mic { "mic" } else { "remote" }, &label, &text);
        self.st.lock().last = Some(text);
        self.emit();
    }

    /// Hata sonrası bekleme (durdurulursa false)
    fn pause(stop: &AtomicBool, ms: u64) -> bool {
        for _ in 0..(ms / 100).max(1) {
            std::thread::sleep(std::time::Duration::from_millis(100));
            if stop.load(Ordering::Relaxed) {
                return false;
            }
        }
        true
    }

    // ---- Windows motoru ----

    #[cfg(windows)]
    fn win_thread(self: Arc<Self>, cfg: SttCfg, stop: Arc<AtomicBool>, gen: u64) {
        use super::stt_win::{display_name, languages, run, system_language, SttEvent};
        let prefer: Vec<String> = vec![cfg.ui_lang.clone()];
        let mut fails = 0u32;
        loop {
            // Mikrofon: bu sürecin kayıt cihazı tercihi (Sesli komut ayarıyla ortak). Cihaz yoksa Windows varsayılanı.
            let _ = crate::voicecmd_win::use_microphone(&cfg.win_mic);
            // Kullanılan cihazın adı yalnızca Windows varsayılanı kullanılırken bilinir
            let dev = if cfg.win_mic.is_empty() { cloud::default_input_name() } else { None };
            if cloud::input_devices().is_empty() {
                self.with_src(gen, Src::Mic, |r, _| {
                    r.listening = false;
                    r.error = Some("Mikrofon bulunamadı: Windows'ta etkin bir kayıt cihazı yok. Mikrofonu takın, Windows ses ayarlarında etkinleştirip varsayılan yapın ve “Tekrar dene”ye basın.".into());
                });
                if !Self::pause(&stop, 5000) {
                    return;
                }
                continue;
            }
            // Dil: istenen (ya da Windows konuşma dili) kurulu değilse kurulu bir dile düş
            let supported = match languages() {
                Ok(l) => l,
                Err(e) => {
                    self.with_src(gen, Src::Mic, |r, _| r.error = Some(e));
                    return;
                }
            };
            let wanted = if cfg.language.is_empty() { system_language().unwrap_or_default() } else { cfg.language.clone() };
            let Some((i, fallback)) = pick_language(&supported, &wanted, &prefer) else {
                self.with_src(gen, Src::Mic, |r, _| r.error = Some(NO_LANGUAGE.into()));
                return;
            };
            let (tag, name) = supported[i].clone();
            let notice = if fallback {
                Some(format!(
                    "{} ({wanted}) için Windows'ta konuşma tanıma paketi kurulu değil; {name} ({tag}) dilinde dinleniyor. Paketi kurmak için: Ayarlar › Saat ve dil › Dil ve bölge › dil › Dil seçenekleri › “Konuşma tanıma”. Windows'ta Türkçe paketi yoktur: Türkçe için “Çevrimiçi (Whisper)” motorunu seçin.",
                    display_name(&wanted)
                ))
            } else if cfg.language.is_empty() && !cfg.ui_lang.is_empty() && primary(&tag) != primary(&cfg.ui_lang) {
                Some(format!("{name} ({tag}) dilinde dinleniyor: Windows'ta arayüz diliniz için konuşma tanıma paketi yok. Türkçe için “Çevrimiçi (Whisper)” motorunu seçin."))
            } else {
                None
            };
            let shown = format!("{name} · {tag}");
            self.with_src(gen, Src::Mic, |_, x| {
                *x.active_language = Some(shown);
                *x.notice = notice;
            });
            let me = self.clone();
            let dev2 = dev.clone();
            let emit = move |e: SttEvent| match e {
                SttEvent::Text(t) => me.on_text(gen, Src::Mic, t, true),
                SttEvent::Listening => {
                    let d = dev2.clone();
                    me.with_src(gen, Src::Mic, |r, _| {
                        r.listening = true;
                        r.error = None;
                        r.device = d;
                    })
                }
            };
            let started = std::time::Instant::now();
            let st2 = stop.clone();
            let res = run(&tag, move || st2.load(Ordering::Relaxed), emit);
            self.with_src(gen, Src::Mic, |r, _| {
                r.listening = false;
                if let Err(e) = &res {
                    r.error = Some(e.clone());
                }
            });
            if stop.load(Ordering::Relaxed) || res.is_ok() || !self.current(gen) {
                return;
            }
            // Kısa sürede tekrar tekrar düşüyorsa (dil paketi / izin yok) vazgeç; hata ekranda kalır
            if started.elapsed().as_secs() < 5 {
                fails += 1;
            } else {
                fails = 0;
            }
            if fails >= 3 || !Self::pause(&stop, 2000) {
                return;
            }
        }
    }

    #[cfg(not(windows))]
    fn win_thread(self: Arc<Self>, _cfg: SttCfg, _stop: Arc<AtomicBool>, _gen: u64) {}

    // ---- Çevrimiçi motor ----

    fn cloud_thread(self: Arc<Self>, src: Src, device: String, ccfg: CloudCfg, stop: Arc<AtomicBool>, gen: u64) {
        let mut fails = 0u32;
        loop {
            let me = self.clone();
            let emit = move |e: cloud::Ev| match e {
                cloud::Ev::Text(t) => me.on_text(gen, src, t, false),
                cloud::Ev::Listening(name) => me.with_src(gen, src, |r, _| {
                    r.listening = true;
                    r.error = None;
                    r.device = Some(name);
                }),
                cloud::Ev::Level(l) => me.with_src(gen, src, |r, _| r.level = l),
                cloud::Ev::Warn(w) => me.with_src(gen, src, |_, x| *x.notice = Some(w)),
            };
            let me2 = self.clone();
            let busy = move || {
                let pause = me2.st.lock().cfg.pause_while_tts;
                // Bilgisayar sesinde sesli mühendis / spotter de hoparlörden çıkar: altyazıya girmesin
                (pause && me2.tts_busy()) || (src == Src::System && crate::audio::busy())
            };
            let started = std::time::Instant::now();
            let st2 = stop.clone();
            let res = cloud::run(src, &device, &ccfg, move || st2.load(Ordering::Relaxed), busy, emit);
            let fatal = matches!(&res, Err((true, _)));
            self.with_src(gen, src, |r, _| {
                r.listening = false;
                r.level = 0;
                if let Err((_, e)) = &res {
                    r.error = Some(e.clone());
                }
            });
            if stop.load(Ordering::Relaxed) || res.is_ok() || fatal || !self.current(gen) {
                return;
            }
            // Cihaz açılamıyorsa arada bir yeniden dene (cihaz sonradan takılabilir); hata ekranda kalır
            if started.elapsed().as_secs() < 5 {
                fails += 1;
            } else {
                fails = 0;
            }
            if !Self::pause(&stop, if fails >= 3 { 10_000 } else { 2000 }) {
                return;
            }
        }
    }

    fn apply(self: &Arc<Self>, cfg: SttCfg) {
        {
            let mut g = self.st.lock();
            if g.cfg == cfg {
                return;
            }
            g.filter = cfg.profanity.then(|| Arc::new(Profanity::new(&cfg.profanity_words, true)));
            g.cfg = cfg;
        }
        self.reconcile();
    }

    fn restart(self: &Arc<Self>) {
        if let Some((stop, _, _)) = self.st.lock().run.take() {
            stop.store(true, Ordering::Relaxed);
        }
        self.reconcile();
    }
}

/// `with_src` içinde kaynağın yanında güncellenebilen ortak alanlar
struct St2<'a> {
    notice: &'a mut Option<String>,
    active_language: &'a mut Option<String>,
}

pub fn stt(app: &AppHandle) -> Option<Arc<Stt>> {
    app.try_state::<Arc<Stt>>().map(|s| s.inner().clone())
}

pub fn init(app: &AppHandle) {
    let key = super::secrets::get(app, KEY_NAME);
    app.manage(Arc::new(Stt { app: app.clone(), st: Mutex::new(St { key, ..Default::default() }) }));
}

pub fn apply_settings(app: &AppHandle, v: &Value) {
    if let Some(s) = stt(app) {
        s.apply(cfg_from_settings(v));
    }
}

/// PRO durumu değişmiş olabilir (merkez zamanlayıcısından ara ara)
pub fn recheck(app: &AppHandle) {
    if let Some(s) = stt(app) {
        let (enabled, running) = {
            let g = s.st.lock();
            (g.cfg.enabled, g.run.is_some())
        };
        if enabled && running != allowed(app, FEATURE) {
            s.reconcile();
        }
    }
}

pub fn is_enabled(app: &AppHandle) -> bool {
    stt(app).is_some_and(|s| s.st.lock().cfg.enabled)
}

/// Kısayol: altyazıyı aç / kapat
pub fn hotkey_toggle(app: &AppHandle) {
    if !SUPPORTED || !allowed(app, FEATURE) {
        crate::audio::send(crate::audio::Cmd::Beep { freq: 300.0, ms: 160, volume: 0.5, pan: 0.0 });
        super::notice(app, "Konuşmayı yazıya çevirme kullanılamıyor (PRO / Windows gerekli)");
        return;
    }
    let on = !is_enabled(app);
    super::update_settings(app, |lc| {
        if !lc.get("stt").is_some_and(|x| x.is_object()) {
            lc["stt"] = serde_json::json!({});
        }
        lc["stt"]["enabled"] = Value::Bool(on);
    });
    super::beep_onoff(on);
    super::notice(app, if on { "Altyazı (konuşma → yazı) açıldı" } else { "Altyazı (konuşma → yazı) kapatıldı" });
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SttLanguages {
    /// (etiket, ad): Windows'ta konuşma tanıma paketi kurulu diller
    pub languages: Vec<(String, String)>,
    /// Windows konuşma dili
    pub system: Option<String>,
    /// Boş ayarla ("Windows konuşma dili") gerçekte kullanılacak dil (kurulu değilse yedek dil)
    pub effective: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn livechat_stt_languages(app: AppHandle) -> SttLanguages {
    #[cfg(windows)]
    {
        let ui = stt(&app).map(|s| s.st.lock().cfg.ui_lang.clone()).unwrap_or_default();
        tauri::async_runtime::spawn_blocking(move || match super::stt_win::languages() {
            Ok(l) => {
                let system = super::stt_win::system_language();
                let effective = pick_language(&l, system.as_deref().unwrap_or(""), &[ui]).map(|(i, _)| l[i].0.clone());
                let error = l.is_empty().then(|| NO_LANGUAGE.to_string());
                SttLanguages { languages: l, system, effective, error }
            }
            Err(e) => SttLanguages { languages: vec![], system: None, effective: None, error: Some(e) },
        })
        .await
        .unwrap_or(SttLanguages { languages: vec![], system: None, effective: None, error: Some("Dil listesi okunamadı".into()) })
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        SttLanguages { languages: vec![], system: None, effective: None, error: Some("Konuşmayı yazıya çevirme sadece Windows'ta çalışır".into()) }
    }
}

#[tauri::command]
pub fn livechat_stt_status(app: AppHandle) -> SttStatus {
    stt(&app).map(|s| s.status()).unwrap_or_default()
}

/// Dinlemeyi yeniden başlat (hata sonrası "Tekrar dene")
#[tauri::command]
pub fn livechat_stt_restart(app: AppHandle) -> SttStatus {
    let Some(s) = stt(&app) else { return SttStatus::default() };
    s.restart();
    s.status()
}

/// Çevrimiçi motorun API anahtarını kaydet (boş: sil). Anahtar şifreli saklanır ve geri okunamaz.
#[tauri::command]
pub fn livechat_stt_key_set(app: AppHandle, key: String) -> Result<SttStatus, String> {
    let k = key.trim().to_string();
    if k.len() > 1024 || k.contains(char::is_whitespace) {
        return Err("Anahtar geçersiz".into());
    }
    super::secrets::set(&app, KEY_NAME, &k)?;
    let s = stt(&app).ok_or("hazır değil")?;
    s.st.lock().key = k;
    s.restart();
    Ok(s.status())
}

/// Ses cihazları (çevrimiçi motorun cihaz seçicileri için)
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevices {
    /// Kayıt cihazları (mikrofonlar)
    pub inputs: Vec<String>,
    /// Çıkış cihazları (bilgisayar sesi bunlardan birinin geri döngüsünden alınır)
    pub outputs: Vec<String>,
    pub default_input: Option<String>,
    pub default_output: Option<String>,
}

#[tauri::command]
pub async fn livechat_audio_devices() -> AudioDevices {
    tauri::async_runtime::spawn_blocking(|| {
        use rodio::cpal::traits::HostTrait;
        use rodio::DeviceTrait;
        let host = rodio::cpal::default_host();
        let mut outputs: Vec<String> = host.output_devices().map(|it| it.filter_map(|d| d.name().ok()).collect()).unwrap_or_default();
        outputs.dedup();
        AudioDevices { inputs: cloud::input_devices(), outputs, default_input: cloud::default_input_name(), default_output: cloud::default_output_name() }
    })
    .await
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profanity_mask() {
        let f = Profanity::new("", true);
        assert_eq!(f.mask("siktir git"), "s***** git");
        assert_eq!(f.mask("çok sıkıldım bugün"), "çok sıkıldım bugün");
        assert_eq!(f.mask("götürmek lazım"), "götürmek lazım");
        assert_eq!(f.mask("Bu ne SALAK iş"), "Bu ne S**** iş");
        assert_eq!(f.mask("what the fucking hell"), "what the f****** hell");
        assert_eq!(f.mask("ananın  amı"), "a*****  ***");
        let g = Profanity::new("muz*", false);
        assert_eq!(g.mask("muzlu kek"), "m**** kek");
        let c = cfg_from_settings(&serde_json::json!({}));
        assert!(c.pause_while_tts && !c.enabled);
        assert_eq!((c.engine, c.source, c.remote_label.as_str(), c.sensitivity), (Engine::Windows, Source::Mic, "Discord", 5));
    }

    #[test]
    fn language_pick() {
        let sup = |tags: &[&str]| tags.iter().map(|t| (t.to_string(), t.to_string())).collect::<Vec<_>>();
        let l = sup(&["de-DE", "en-GB", "en-US"]);
        // Kurulu dil: aynen; aynı ana dil: o dil
        assert_eq!(pick_language(&l, "en-US", &[]), Some((2, false)));
        assert_eq!(pick_language(&l, "de-AT", &[]), Some((0, false)));
        // Türkçe kurulu değil: arayüz dili de yoksa en-US'e düş ve bildir
        assert_eq!(pick_language(&l, "tr-TR", &["tr".into()]), Some((2, true)));
        assert_eq!(pick_language(&l, "tr-TR", &["de".into()]), Some((0, true)));
        // Windows konuşma dili okunamadı (boş): yedek ama "istenen bulunamadı" sayılmaz
        assert_eq!(pick_language(&l, "", &["tr".into()]), Some((2, false)));
        // en-US yoksa İngilizcenin başka bir türü, o da yoksa ilk dil
        assert_eq!(pick_language(&sup(&["fr-FR", "en-GB"]), "tr-TR", &[]), Some((1, true)));
        assert_eq!(pick_language(&sup(&["fr-FR"]), "tr-TR", &[]), Some((0, true)));
        assert_eq!(pick_language(&[], "tr-TR", &[]), None);
    }

    #[test]
    fn settings() {
        let v = serde_json::json!({ "general": { "language": "tr", "voice": { "commands": { "mic": "MIC1" } }, "livechat": { "stt": {
            "enabled": true, "engine": "cloud", "source": "both", "label": "Ben", "remoteLabel": "", "micDevice": "Mikrofon (USB)", "systemDevice": "Kulaklık",
            "cloud": { "url": "https://api.groq.com/openai/v1", "model": "whisper-large-v3-turbo" }, "sensitivity": 7
        } } } });
        let c = cfg_from_settings(&v);
        assert_eq!((c.engine, c.source), (Engine::Cloud, Source::Both));
        assert!(c.source.mic() && c.source.system());
        assert_eq!((c.label.as_str(), c.remote_label.as_str(), c.win_mic.as_str(), c.sensitivity), ("Ben", "", "MIC1", 7));
        // Dil: boş → arayüz dili, "auto" → otomatik (boş), "en-US" → "en"
        assert_eq!(c.cloud_lang(), "tr");
        let mut d = c.clone();
        d.cloud_language = "auto".into();
        assert_eq!(d.cloud_lang(), "");
        d.cloud_language = "en-US".into();
        assert_eq!(d.cloud_lang(), "en");
        // Etiket değişince yeniden başlatılmaz; cihaz / anahtar değişince başlatılır; anahtar metne girmez
        let k = c.run_key("gizli-anahtar");
        assert!(!k.contains("gizli"));
        let mut e = c.clone();
        e.label = "Erkin".into();
        assert_eq!(e.run_key("gizli-anahtar"), k);
        e.system_device = "Hoparlör".into();
        assert_ne!(e.run_key("gizli-anahtar"), k);
        assert_ne!(c.run_key("baska-anahtar1"), k);
    }
}
