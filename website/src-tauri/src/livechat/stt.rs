//! Konuşmayı yazıya çevirme (altyazı, PRO: `livechat.stt`).
//!
//! Windows'un konuşma tanıyıcısı (WinRT SpeechRecognizer, sürekli dikte, bkz. stt_win.rs) varsayılan mikrofonu dinler;
//! kesinleşen cümleler `Hub::push_caption("mic", …)` ile altyazı kutusuna (overlay "captions", OBS /captions sayfası,
//! sohbet overlay'indeki altyazı) gider. İsteğe bağlı küfür filtresi (ilk harf kalır: "s*****"), sesli okuma
//! konuşurken duyulanları yazmama. Masaüstü sesi (loopback) bu tanıyıcıyla desteklenmez.
//!
//! Olay: "livechat-stt" SttStatus

// Windows dışında motor yok: motorla ilgili parçalar sadece Windows'ta kullanılır
#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

use super::allowed;
use super::filter::is_w;
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub const FEATURE: &str = "livechat.stt";
pub const SUPPORTED: bool = cfg!(windows);

#[derive(Clone, Debug, PartialEq, Default)]
pub struct SttCfg {
    pub enabled: bool,
    /// BCP-47 dil etiketi (boş: Windows konuşma dili)
    pub language: String,
    pub profanity: bool,
    pub profanity_words: String,
    /// Sesli okuma konuşurken duyulanları yazma
    pub pause_while_tts: bool,
    /// Altyazının önündeki ad (boş: yok)
    pub label: String,
}

pub fn cfg_from_settings(v: &Value) -> SttCfg {
    let Some(t) = v.pointer("/general/livechat/stt") else { return SttCfg { pause_while_tts: true, ..Default::default() } };
    let b = |p: &str, def: bool| t.pointer(p).and_then(|x| x.as_bool()).unwrap_or(def);
    let s = |p: &str| t.pointer(p).and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    SttCfg {
        enabled: b("/enabled", false),
        language: s("/language"),
        profanity: b("/profanity", false),
        profanity_words: s("/profanityWords"),
        pause_while_tts: b("/pauseWhileTts", true),
        label: s("/label").chars().take(24).collect(),
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
// Çalışma zamanı
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SttStatus {
    pub enabled: bool,
    pub allowed: bool,
    pub supported: bool,
    /// Dinliyor
    pub listening: bool,
    pub language: String,
    pub error: Option<String>,
    /// Son duyulan cümle
    pub last: Option<String>,
}

#[derive(Default)]
struct St {
    cfg: SttCfg,
    /// Çalışan dinleme iş parçacığının durdurma bayrağı, dili ve kuşağı
    run: Option<(Arc<AtomicBool>, String, u64)>,
    gen: u64,
    listening: bool,
    error: Option<String>,
    last: Option<String>,
    filter: Option<Arc<Profanity>>,
}

pub struct Stt {
    app: AppHandle,
    st: Mutex<St>,
}

impl Stt {
    fn status(&self) -> SttStatus {
        let g = self.st.lock();
        SttStatus {
            enabled: g.cfg.enabled,
            allowed: allowed(&self.app, FEATURE),
            supported: SUPPORTED,
            listening: g.listening,
            language: g.cfg.language.clone(),
            error: g.error.clone(),
            last: g.last.clone(),
        }
    }

    fn emit(&self) {
        let _ = self.app.emit("livechat-stt", self.status());
    }

    /// İstenen duruma getir (açık + izinli → dinle; dil değiştiyse yeniden başlat)
    fn reconcile(self: &Arc<Self>) {
        let ok = allowed(&self.app, FEATURE);
        let mut g = self.st.lock();
        let want = g.cfg.enabled && ok && SUPPORTED;
        let lang = g.cfg.language.clone();
        let same = g.run.as_ref().is_some_and(|(_, l, _)| *l == lang);
        if !want || !same {
            if let Some((stop, _, _)) = g.run.take() {
                stop.store(true, Ordering::Relaxed);
                g.listening = false;
            }
        }
        if want && g.run.is_none() {
            g.gen += 1;
            let gen = g.gen;
            let stop = Arc::new(AtomicBool::new(false));
            g.run = Some((stop.clone(), lang.clone(), gen));
            g.error = None;
            let me = self.clone();
            let _ = std::thread::Builder::new().name("livechat-stt".into()).spawn(move || me.thread(lang, stop, gen));
        }
        drop(g);
        self.emit();
    }

    fn on_text(&self, gen: u64, text: String) {
        // Sesli okuma konuşurken (ve hemen ardından) duyulanlar yazılmaz
        let (pause, label, filter) = {
            let g = self.st.lock();
            if g.run.as_ref().map(|r| r.2) != Some(gen) {
                return;
            }
            (g.cfg.pause_while_tts, g.cfg.label.clone(), g.filter.clone())
        };
        if pause {
            if let Some(t) = super::tts::tts(&self.app) {
                if t.speaking.load(Ordering::Relaxed) || super::model::now_ms() < t.quiet_until.load(Ordering::Relaxed) {
                    return;
                }
            }
        }
        let text = match filter {
            Some(f) => f.mask(&text),
            None => text,
        };
        super::hub(&self.app).push_caption("mic", &label, &text);
        self.st.lock().last = Some(text);
        self.emit();
    }

    #[cfg(windows)]
    fn thread(self: Arc<Self>, lang: String, stop: Arc<AtomicBool>, gen: u64) {
        use super::stt_win::{run, SttEvent};
        let mut fails = 0u32;
        loop {
            let me = self.clone();
            let emit = move |e: SttEvent| match e {
                SttEvent::Text(t) => me.on_text(gen, t),
                SttEvent::Listening => {
                    {
                        let mut g = me.st.lock();
                        if g.run.as_ref().map(|r| r.2) == Some(gen) {
                            g.listening = true;
                            g.error = None;
                        }
                    }
                    me.emit();
                }
            };
            let started = std::time::Instant::now();
            let st2 = stop.clone();
            let res = run(&lang, move || st2.load(Ordering::Relaxed), emit);
            {
                let mut g = self.st.lock();
                if g.run.as_ref().map(|r| r.2) == Some(gen) {
                    g.listening = false;
                    if let Err(e) = &res {
                        g.error = Some(e.clone());
                    }
                }
            }
            self.emit();
            if stop.load(Ordering::Relaxed) || res.is_ok() {
                return;
            }
            // Kısa sürede tekrar tekrar düşüyorsa (dil paketi / izin yok) vazgeç; hata ekranda kalır
            if started.elapsed().as_secs() < 5 {
                fails += 1;
            } else {
                fails = 0;
            }
            if fails >= 3 {
                return;
            }
            for _ in 0..20 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if stop.load(Ordering::Relaxed) {
                    return;
                }
            }
        }
    }

    #[cfg(not(windows))]
    fn thread(self: Arc<Self>, _lang: String, _stop: Arc<AtomicBool>, _gen: u64) {}

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
}

pub fn stt(app: &AppHandle) -> Option<Arc<Stt>> {
    app.try_state::<Arc<Stt>>().map(|s| s.inner().clone())
}

pub fn init(app: &AppHandle) {
    app.manage(Arc::new(Stt { app: app.clone(), st: Mutex::new(St::default()) }));
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
    /// (etiket, ad)
    pub languages: Vec<(String, String)>,
    /// Windows konuşma dili
    pub system: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn livechat_stt_languages() -> SttLanguages {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(|| match super::stt_win::languages() {
            Ok(l) => SttLanguages { languages: l, system: super::stt_win::system_language(), error: None },
            Err(e) => SttLanguages { languages: vec![], system: None, error: Some(e) },
        })
        .await
        .unwrap_or(SttLanguages { languages: vec![], system: None, error: Some("okunamadı".into()) })
    }
    #[cfg(not(windows))]
    {
        SttLanguages { languages: vec![], system: None, error: Some("Konuşmayı yazıya çevirme sadece Windows'ta çalışır".into()) }
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
    if let Some((stop, _, _)) = s.st.lock().run.take() {
        stop.store(true, Ordering::Relaxed);
    }
    s.reconcile();
    s.status()
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
    }
}
