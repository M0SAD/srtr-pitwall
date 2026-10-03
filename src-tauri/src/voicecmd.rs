//! Sesli komut (bas-konuş): sürücü bir direksiyon düğmesini ya da klavye tuşunu basılı tutup sorar
//! ("ne kadar yakıtım var", "kaç olay puanım var"…), sesli mühendis cevaplar. PRO: `voice.commands`.
//!
//! Akış:
//!   giriş iş parçacığı (`ptt_win`: klavye + HID/WinMM düğmesi, basma ve bırakma)
//!     → tanıma iş parçacığı (`voicecmd_win`: Windows konuşma tanıyıcısı, arayüz dilinde komut listesi)
//!     → niyet eşleştirme (`match_intent`, cümleler `voice_commands.json` içinde, 15 dil)
//!     → motor iş parçacığı (`service`): telemetriden cevap (`answer`) → `Voice::set_answer`
//!     → ses paketinde karşılığı varsa paketten, yoksa Windows sesiyle (TTS) aynı mühendis kanalından çalınır.
//! Soru ve cevap "voice" konusunda (Sesli Mühendis altyazısı) görünür: soru "driver" rolüyle.
//! Cevaplar mühendis kanalını kullanır: spotter yine en önceliklidir (mühendisi keser), dinlerken ve cevap
//! hazırlanırken mühendis kuyruğu bekletilir (bkz. `hold`).

#![cfg_attr(not(windows), allow(dead_code, unused_imports, unused_variables))]

use crate::calc;
use crate::model::{Frame, SessionData, MAX_CARS};
use crate::tracker::Tracker;
use crate::voice::Voice;
use crate::voice_rules::{Ctx, Kind, F_REPAIR};
use crate::voicepack::{k, Part};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const FEATURE: &str = "voice.commands";
pub const SUPPORTED: bool = cfg!(windows);
/// Cümleler ve cevap şablonları (ayarlanabilir veri dosyası)
pub const DATA_JSON: &str = include_str!("voice_commands.json");
/// Bulanık eşleştirmede (dikte) en düşük benzerlik
pub const FUZZY_MIN: f32 = 0.62;

// ---------------------------------------------------------------------------
// Veri: diller, cümleler, cevap şablonları
// ---------------------------------------------------------------------------

pub struct LangData {
    pub key: String,
    pub name: String,
    /// Windows konuşma tanıma dil etiketi (ör. "tr-TR")
    pub tag: String,
    /// (niyet, cümleler)
    pub phrases: Vec<(String, Vec<String>)>,
    /// Normalleştirilmiş cümle → niyet
    norm: Vec<(String, usize)>,
    pub answers: HashMap<String, String>,
}

pub struct Data {
    pub intents: Vec<String>,
    pub langs: Vec<LangData>,
}

pub fn data() -> &'static Data {
    static D: OnceLock<Data> = OnceLock::new();
    D.get_or_init(|| {
        let v: Value = serde_json::from_str(DATA_JSON).unwrap_or(Value::Null);
        let intents: Vec<String> = v["intents"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
        let mut langs = Vec::new();
        if let Some(map) = v["languages"].as_object() {
            for (key, l) in map {
                let mut phrases: Vec<(String, Vec<String>)> = Vec::new();
                let mut norm = Vec::new();
                for (i, intent) in intents.iter().enumerate() {
                    let list: Vec<String> = l["phrases"][intent].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default();
                    for p in &list {
                        norm.push((normalize(p), i));
                    }
                    phrases.push((intent.clone(), list));
                }
                let answers = l["answers"].as_object().map(|o| o.iter().filter_map(|(k, x)| x.as_str().map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
                langs.push(LangData {
                    key: key.clone(),
                    name: l["name"].as_str().unwrap_or(key).to_string(),
                    tag: l["tag"].as_str().unwrap_or(key).to_string(),
                    phrases,
                    norm,
                    answers,
                });
            }
        }
        Data { intents, langs }
    })
}

/// Arayüz dili / dil etiketi → veri dosyasındaki dil anahtarı ("tr-TR" → "tr", "pt" → "pt-BR", bilinmeyen → "en")
pub fn lang_key(tag: &str) -> &'static str {
    let t = tag.trim().to_lowercase().replace('_', "-");
    let d = data();
    if let Some(l) = d.langs.iter().find(|l| l.key.to_lowercase() == t) {
        return &l.key;
    }
    let primary = t.split('-').next().unwrap_or("");
    if let Some(l) = d.langs.iter().find(|l| l.key.to_lowercase().split('-').next() == Some(primary)) {
        return &l.key;
    }
    "en"
}

pub fn lang(key: &str) -> Option<&'static LangData> {
    data().langs.iter().find(|l| l.key == key)
}

/// Cevap şablonu (dilde yoksa İngilizce), `{0}`, `{1}`… doldurulur
pub fn fmt(lang_key: &str, key: &str, args: &[String]) -> String {
    let get = |l: &str| lang(l).and_then(|d| d.answers.get(key)).cloned();
    let mut s = get(lang_key).or_else(|| get("en")).unwrap_or_default();
    for (i, a) in args.iter().enumerate() {
        s = s.replace(&format!("{{{i}}}"), a);
    }
    s
}

// ---------------------------------------------------------------------------
// Niyet eşleştirme
// ---------------------------------------------------------------------------

/// Küçük harf, noktalama yok, tek boşluk. Türkçe İ/I/ı tek biçime (i) indirilir ki tanıyıcının
/// büyük/küçük harf seçimi eşleşmeyi bozmasın.
pub fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut space = true;
    for c in s.chars() {
        let c = match c {
            'İ' | 'I' | 'ı' => 'i',
            '\u{0307}' => continue, // "İ".to_lowercase() birleşik noktası
            _ => c,
        };
        if c.is_alphanumeric() {
            for l in c.to_lowercase() {
                if l != '\u{0307}' {
                    out.push(l);
                }
            }
            space = false;
        } else if c == '\'' || c == '’' {
            // kesme: "what's" → "whats"
        } else if !space {
            out.push(' ');
            space = true;
        }
    }
    out.trim_end().to_string()
}

fn bigrams(s: &str) -> Vec<(char, char)> {
    let c: Vec<char> = s.chars().collect();
    if c.len() < 2 {
        return c.iter().map(|&x| (x, ' ')).collect();
    }
    c.windows(2).map(|w| (w[0], w[1])).collect()
}

/// Sørensen–Dice benzerliği (karakter ikilileri; boşluklar dahil, Çince/Japonca için de çalışır)
pub fn similarity(a: &str, b: &str) -> f32 {
    if a == b {
        return 1.0;
    }
    let (x, mut y) = (bigrams(a), bigrams(b));
    if x.is_empty() || y.is_empty() {
        return 0.0;
    }
    let total = (x.len() + y.len()) as f32;
    let mut hit = 0;
    for g in &x {
        if let Some(i) = y.iter().position(|h| h == g) {
            y.swap_remove(i);
            hit += 1;
        }
    }
    2.0 * hit as f32 / total
}

/// Duyulan metnin niyeti: (niyet, benzerlik 0..1). Tam cümle 1.0; cümle duyulanın içinde geçiyorsa 0.9;
/// değilse en benzer cümle (`FUZZY_MIN` altı: yok).
pub fn match_intent(text: &str, lang_key: &str) -> Option<(&'static str, f32)> {
    let l = lang(lang_key)?;
    let d = data();
    let t = normalize(text);
    if t.is_empty() {
        return None;
    }
    let padded = format!(" {t} ");
    let mut best: Option<(usize, f32)> = None;
    for (p, i) in &l.norm {
        let s = if *p == t {
            1.0
        } else if p.chars().count() >= 6 && (padded.contains(&format!(" {p} ")) || (!p.contains(' ') && !p.is_ascii() && t.contains(p.as_str()))) {
            0.9
        } else {
            similarity(&t, p)
        };
        if best.map(|(_, b)| s > b).unwrap_or(true) {
            best = Some((*i, s));
        }
    }
    let (i, s) = best?;
    (s >= FUZZY_MIN).then(|| (d.intents[i].as_str(), s))
}

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

pub const MOD_CTRL: u8 = 1;
pub const MOD_SHIFT: u8 = 2;
pub const MOD_ALT: u8 = 4;
pub const MOD_WIN: u8 = 8;

/// Kısayol metni ("Ctrl+Shift+T", "F13", "Num0") → (Windows sanal tuş kodu, değiştiriciler)
pub fn parse_key(s: &str) -> Option<(u32, u8)> {
    let mut mods = 0u8;
    let mut vk: Option<u32> = None;
    for part in s.split('+').map(|p| p.trim()).filter(|p| !p.is_empty()) {
        let low = part.to_lowercase();
        match low.as_str() {
            "ctrl" | "control" => mods |= MOD_CTRL,
            "shift" => mods |= MOD_SHIFT,
            "alt" => mods |= MOD_ALT,
            "super" | "win" | "meta" | "cmd" => mods |= MOD_WIN,
            _ => {
                let code = if low.len() == 1 {
                    let c = low.chars().next().unwrap();
                    match c {
                        'a'..='z' => Some(c.to_ascii_uppercase() as u32),
                        '0'..='9' => Some(c as u32),
                        '`' => Some(0xC0),
                        '-' => Some(0xBD),
                        '=' => Some(0xBB),
                        '[' => Some(0xDB),
                        ']' => Some(0xDD),
                        '\\' => Some(0xDC),
                        ';' => Some(0xBA),
                        '\'' => Some(0xDE),
                        ',' => Some(0xBC),
                        '.' => Some(0xBE),
                        '/' => Some(0xBF),
                        _ => None,
                    }
                } else if let Some(n) = low.strip_prefix("num").and_then(|n| n.parse::<u32>().ok()).filter(|n| *n <= 9) {
                    Some(0x60 + n)
                } else if let Some(n) = low.strip_prefix('f').and_then(|n| n.parse::<u32>().ok()).filter(|n| (1..=24).contains(n)) {
                    Some(0x6F + n)
                } else {
                    match low.as_str() {
                        "space" => Some(0x20),
                        "enter" => Some(0x0D),
                        "tab" => Some(0x09),
                        "home" => Some(0x24),
                        "end" => Some(0x23),
                        "pageup" => Some(0x21),
                        "pagedown" => Some(0x22),
                        "insert" => Some(0x2D),
                        "delete" => Some(0x2E),
                        "up" => Some(0x26),
                        "down" => Some(0x28),
                        "left" => Some(0x25),
                        "right" => Some(0x27),
                        "scrolllock" => Some(0x91),
                        "pause" => Some(0x13),
                        "printscreen" => Some(0x2C),
                        _ => None,
                    }
                };
                // İki ana tuş ya da bilinmeyen tuş: geçersiz
                if vk.is_some() || code.is_none() {
                    return None;
                }
                vk = code;
            }
        }
    }
    vk.map(|v| (v, mods))
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct CmdCfg {
    pub enabled: bool,
    /// true: dokun-başlat (susunca kendiliğinden biter); false: basılı tut
    pub toggle: bool,
    /// Klavye tuşu (0: yok) ve değiştiriciler
    pub vk: u32,
    pub mods: u8,
    /// Direksiyon / kumanda düğmesi: (VID, PID, düğme)
    pub button: Option<(u16, u16, u16)>,
    /// Tanıma dili (veri anahtarı: "tr", "en"…): ayarda boşsa arayüz dili
    pub rec_lang: String,
    /// Cevap dili (arayüz dili)
    pub ui_lang: String,
    /// 0..1
    pub confidence: f32,
    pub beeps: bool,
    /// Seçilen mikrofonun cihaz kimliği ("" : Windows varsayılanı)
    pub mic: String,
    /// Seçilen mikrofonun adı (çevrimiçi motor cihazı adıyla açar)
    pub mic_name: String,
    /// Tanıma motoru seçimi
    pub engine: Engine,
    /// Çevrimiçi motor (Canlı Sohbet › Konuşma → yazı ile ortak sunucu ayarı)
    pub cloud_url: String,
    pub cloud_model: String,
    /// PRO izni
    pub allowed: bool,
}

/// Tanıma motoru: Otomatik = dilin Windows tanıyıcısı kuruluysa Windows, değilse çevrimiçi (Whisper)
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum Engine {
    #[default]
    Auto,
    Windows,
    Online,
}

pub const CLOUD_URL_DEFAULT: &str = "https://api.groq.com/openai/v1";
pub const CLOUD_MODEL_DEFAULT: &str = "whisper-large-v3-turbo";

/// Gerçekte kullanılacak motor çevrimiçi mi. `native`: istenen dilin Windows tanıyıcısı var mı (İngilizceye düşmeden);
/// `cloud_ok`: çevrimiçi motor kullanılabilir mi (anahtar / adres hazır).
pub fn use_online(engine: Engine, native: bool, cloud_ok: bool) -> bool {
    match engine {
        Engine::Windows => false,
        Engine::Online => true,
        Engine::Auto => !native && cloud_ok,
    }
}

/// Çevrimiçi motor neden kullanılamıyor: "cloud_key" (anahtar girilmemiş) | "cloud_url" (adres geçersiz); hazırsa None
pub fn cloud_problem(c: &CmdCfg, key: &str) -> Option<&'static str> {
    use crate::livechat::stt_cloud as sc;
    if sc::check_url(&c.cloud_url).is_err() || c.cloud_model.trim().is_empty() {
        return Some("cloud_url");
    }
    if key.is_empty() && !sc::is_local(&c.cloud_url) {
        return Some("cloud_key");
    }
    None
}

/// Kayıtlı API anahtarı (şifreli gizli dosyadan; hiçbir yere yazılmaz)
fn cloud_key(app: &AppHandle) -> String {
    crate::livechat::secrets::get(app, crate::livechat::stt::KEY_NAME)
}

/// Whisper'a gönderilecek dil kodu ("tr", "pt", "zh"…)
pub fn cloud_lang(rec_lang: &str) -> String {
    rec_lang.split(['-', '_']).next().unwrap_or("").to_lowercase()
}

pub fn cfg_from_settings(v: &Value, allowed: bool) -> CmdCfg {
    let ui = v.pointer("/general/language").and_then(|x| x.as_str()).unwrap_or("tr");
    let ui_lang = lang_key(ui).to_string();
    let Some(c) = v.pointer("/general/voice/commands") else {
        return CmdCfg {
            enabled: true,
            rec_lang: ui_lang.clone(),
            ui_lang,
            confidence: 0.4,
            beeps: true,
            cloud_url: CLOUD_URL_DEFAULT.into(),
            cloud_model: CLOUD_MODEL_DEFAULT.into(),
            allowed,
            ..Default::default()
        };
    };
    let s = |p: &str| c.get(p).and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    let (vk, mods) = parse_key(&s("key")).unwrap_or((0, 0));
    let button = c.get("button").filter(|b| b.is_object()).and_then(|b| {
        let n = |k: &str| b.get(k).and_then(|x| x.as_u64());
        Some((n("vid")? as u16, n("pid")? as u16, n("button")? as u16))
    });
    let want = s("language");
    let cloud = |k: &str, def: &str| {
        let x = v.pointer(&format!("/general/livechat/stt/cloud/{k}")).and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
        if x.is_empty() {
            def.to_string()
        } else {
            x
        }
    };
    CmdCfg {
        enabled: c.get("enabled").and_then(|x| x.as_bool()).unwrap_or(true),
        toggle: s("mode") == "toggle",
        vk,
        mods,
        button,
        rec_lang: if want.is_empty() { ui_lang.clone() } else { lang_key(&want).to_string() },
        ui_lang,
        confidence: (c.get("confidence").and_then(|x| x.as_f64()).unwrap_or(40.0) as f32 / 100.0).clamp(0.0, 1.0),
        beeps: c.get("beeps").and_then(|x| x.as_bool()).unwrap_or(true),
        mic: s("mic"),
        mic_name: s("micName"),
        engine: match s("engine").as_str() {
            "windows" => Engine::Windows,
            "online" => Engine::Online,
            _ => Engine::Auto,
        },
        cloud_url: cloud("url", CLOUD_URL_DEFAULT),
        cloud_model: cloud("model", CLOUD_MODEL_DEFAULT),
        allowed,
    }
}

impl CmdCfg {
    pub fn active(&self) -> bool {
        self.enabled && self.allowed && (self.vk != 0 || self.button.is_some())
    }
}

// ---------------------------------------------------------------------------
// Cevaplar
// ---------------------------------------------------------------------------

/// Bir cevap: ses paketi parçaları (paket hepsini içeriyorsa bunlar çalınır) ve arayüz dilindeki metin
/// (paket yetmezse Windows sesiyle okunur; altyazıda da bu görünür)
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Answer {
    pub parts: Vec<Part>,
    pub text: String,
}

fn dec1(x: f32, lang: &str) -> String {
    let s = format!("{:.1}", x);
    let sep = self::lang(lang).and_then(|l| l.answers.get("dec")).map(|s| s.as_str()).unwrap_or(".");
    if sep == "." {
        s
    } else {
        s.replace('.', sep)
    }
}

/// Tur süresi sözle: "1 dakika 23,4 saniye"
fn lap_text(t: f32, lang: &str) -> String {
    let tenths = (t.abs() * 10.0).round() as i64;
    let (m, s) = (tenths / 600, (tenths % 600) as f32 / 10.0);
    if m > 0 {
        fmt(lang, "lap_m", &[m.to_string(), dec1(s, lang)])
    } else {
        fmt(lang, "lap_s", &[dec1(s, lang)])
    }
}

fn simple(lang: &str, key: &str, pack: &str) -> Answer {
    Answer { parts: if pack.is_empty() { vec![] } else { vec![k(pack)] }, text: fmt(lang, key, &[]) }
}

pub fn no_data(lang: &str) -> Answer {
    simple(lang, "no_data", "acknowledge/no_data")
}

pub fn not_understood(lang: &str) -> Answer {
    simple(lang, "not_understood", "acknowledge/didnt_understand")
}

/// Yerel saat (saat, dakika). Windows dışında UTC.
fn clock() -> (u32, u32) {
    #[cfg(windows)]
    {
        crate::ptt_win::local_time()
    }
    #[cfg(not(windows))]
    {
        let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        (((s / 3600) % 24) as u32, ((s / 60) % 60) as u32)
    }
}

/// Önümüzdeki / arkamızdaki araç ve aradaki süre: yarışta sınıf sıralamasına, diğer oturumlarda pistteki konuma göre
fn neighbour(c: &Ctx, ahead: bool) -> Option<(usize, f32)> {
    if c.race() && c.pos > 0 {
        let i = c.class_car(if ahead { c.pos - 1 } else { c.pos + 1 })?;
        let g = c.race_gap(i)?;
        return Some((i, g.abs()));
    }
    let mut best: Option<(usize, f32)> = None;
    for i in 0..MAX_CARS {
        if i == c.me || !calc::active(c.f, c.s, i) || c.f.cars[i].on_pit {
            continue;
        }
        if c.s.driver(i).map(|d| d.is_pace_car || d.is_spectator).unwrap_or(true) {
            continue;
        }
        // track_gap: + ise araç arkamızda
        let Some(dt) = c.track_gap(i) else { continue };
        if (ahead && dt >= 0.0) || (!ahead && dt <= 0.0) {
            continue;
        }
        if best.map(|(_, b)| dt.abs() < b).unwrap_or(true) {
            best = Some((i, dt.abs()));
        }
    }
    best
}

/// Niyetin cevabı (telemetriden). `lang`: cevap metninin dili (arayüz dili).
pub fn answer(intent: &str, c: &Ctx, lang: &str) -> Answer {
    let f = c.f;
    let has_car = f.player_idx >= 0 && c.s.driver(c.me).is_some();
    let gal = 3.785_41_f32;
    let conv = |l: f32| if c.imperial { l / gal } else { l };
    let unit = fmt(lang, if c.imperial { "gallons" } else { "litres" }, &[]);
    let deg = |x: f32| if c.imperial { x * 9.0 / 5.0 + 32.0 } else { x };
    let deg_key = if c.imperial { "conditions/fahrenheit" } else { "conditions/celsius" };
    let a = |parts: Vec<Part>, key: &str, args: &[String]| Answer { parts, text: fmt(lang, key, args) };

    match intent {
        "radio_check" => simple(lang, "radio", "acknowledge/radio_check"),
        "clock" => {
            let (h, m) = clock();
            a(vec![], "clock", &[format!("{h}:{m:02}")])
        }
        _ if !has_car => no_data(lang),
        "fuel_level" => {
            if f.fuel_level <= 0.0 {
                return no_data(lang);
            }
            let v = conv(f.fuel_level);
            a(
                vec![Part::Int(v.round() as i64), k(if c.imperial { "fuel/gallons_remaining" } else { "fuel/litres_remaining" })],
                "fuel_level",
                &[dec1(v, lang), unit],
            )
        }
        "fuel_laps" | "fuel_per_lap" | "fuel_to_end" => {
            if f.fuel_level <= 0.0 {
                return no_data(lang);
            }
            let fu = calc::fuel(f, c.s, c.t);
            if fu.samples == 0 || fu.avg5.usage <= 0.0 {
                return simple(lang, "fuel_no_avg", "fuel/not_enough_laps_for_average");
            }
            match intent {
                "fuel_laps" => a(
                    vec![k("fuel/we_estimate"), Part::Int(fu.avg5.laps.floor() as i64), k("fuel/laps_remaining")],
                    "fuel_laps",
                    &[dec1(fu.avg5.laps, lang)],
                ),
                "fuel_per_lap" => {
                    let u = conv(fu.avg5.usage);
                    a(
                        vec![k("fuel/we_estimate"), Part::Dec(u), k(if c.imperial { "fuel/gallons_per_lap" } else { "fuel/litres_per_lap" })],
                        "fuel_per_lap",
                        &[dec1(u, lang), unit],
                    )
                }
                _ => {
                    if !c.race() || fu.race_laps_left <= 0.0 || fu.race_needed <= 0.0 {
                        return no_data(lang);
                    }
                    let add = conv(fu.race_needed - f.fuel_level);
                    if add > 0.0 {
                        let n = add.ceil() as i64;
                        a(
                            vec![
                                k("fuel/we_will_need_to_add"),
                                Part::Int(n),
                                k(if c.imperial { "fuel/gallons_to_get_to_the_end" } else { "fuel/litres_to_get_to_the_end" }),
                            ],
                            "fuel_end_need",
                            &[n.to_string(), unit],
                        )
                    } else {
                        let plenty = fu.avg5.laps - fu.race_laps_left >= 2.0;
                        a(vec![k(if plenty { "fuel/plenty_of_fuel" } else { "fuel/fuel_should_be_ok" })], "fuel_end_ok", &[dec1(-add, lang), unit])
                    }
                }
            }
        }
        "incidents" => {
            if !c.iracing {
                return no_data(lang);
            }
            let (n, limit) = (f.incidents.max(0) as i64, c.s.incident_limit as i64);
            let mut parts = vec![k("incidents/you_have"), Part::Int(n), k("incidents/incident_points")];
            if limit > 0 {
                parts.push(k("incidents/the_incident_limit_is"));
                parts.push(Part::Int(limit));
                a(parts, "incidents_limit", &[n.to_string(), limit.to_string()])
            } else {
                a(parts, "incidents", &[n.to_string()])
            }
        }
        "position" => {
            if c.pos <= 0 {
                return no_data(lang);
            }
            let overall = f.cars[c.me].position;
            if c.multiclass && overall > 0 {
                a(vec![Part::Pos(c.pos)], "position_class", &[c.pos.to_string(), overall.to_string()])
            } else {
                a(vec![Part::Pos(c.pos)], "position", &[c.pos.to_string()])
            }
        }
        "gap_ahead" | "gap_behind" | "driver_ahead" | "driver_behind" => {
            let ahead = intent.ends_with("ahead");
            let Some((i, gap)) = neighbour(c, ahead) else {
                return simple(lang, if ahead { "nobody_ahead" } else { "nobody_behind" }, "");
            };
            if intent.starts_with("driver") {
                let name = c.s.driver(i).map(|d| d.name.trim().to_string()).filter(|n| !n.is_empty());
                return match name {
                    Some(n) => a(vec![], if ahead { "driver_ahead" } else { "driver_behind" }, &[n]),
                    None => no_data(lang),
                };
            }
            let gap = gap.max(0.1);
            a(
                vec![k(if ahead { "timings/gap_in_front_is_now" } else { "timings/gap_behind_is_now" }), Part::Secs(gap)],
                if ahead { "gap_ahead" } else { "gap_behind" },
                &[dec1(gap, lang)],
            )
        }
        "last_lap" | "best_lap" => {
            let t = if intent == "last_lap" { f.lap_last } else { f.lap_best };
            if t <= 0.0 {
                return no_data(lang);
            }
            a(vec![k("lap_times/time_intro"), Part::Lap(t)], intent, &[lap_text(t, lang)])
        }
        "remaining" => {
            if c.kind == Kind::Race && f.session_laps_remain > 0 && f.session_laps_remain < 32767 {
                let n = f.session_laps_remain as i64;
                return a(vec![Part::Int(n), k("race_time/laps_remaining")], "laps_left", &[n.to_string()]);
            }
            let rem = f.session_time_remain;
            if rem <= 0.0 || rem > 7.0 * 86400.0 {
                return no_data(lang);
            }
            let mins = (rem / 60.0).ceil() as i64;
            if mins >= 60 {
                let (h, m) = (mins / 60, mins % 60);
                a(
                    vec![Part::Int(h), k(if h == 1 { "numbers/hour" } else { "numbers/hours" }), Part::Int(m), k("numbers/minutes"), k("race_time/remaining")],
                    "time_left_h",
                    &[h.to_string(), m.to_string()],
                )
            } else {
                a(vec![Part::Int(mins), k(if mins == 1 { "numbers/minute" } else { "numbers/minutes" }), k("race_time/remaining")], "time_left", &[mins.to_string()])
            }
        }
        "tyre_temps" => {
            if !f.tire_temp.iter().any(|t| t[1] > 0.0) {
                return no_data(lang);
            }
            let v: Vec<String> = f.tire_temp.iter().map(|t| (deg(t[1]).round() as i64).to_string()).collect();
            a(vec![], "tyre_temps", &v)
        }
        "tyre_wear" => {
            if !f.tire_wear.iter().all(|w| w.iter().all(|x| *x >= 0.0)) {
                return no_data(lang);
            }
            let v: Vec<String> = f.tire_wear.iter().map(|w| (((w[0] + w[1] + w[2]) / 3.0 * 100.0).round().clamp(0.0, 100.0) as i64).to_string()).collect();
            a(vec![], "tyre_wear", &v)
        }
        "track_temp" | "air_temp" => {
            let t = if intent == "track_temp" { f.track_temp } else { f.air_temp };
            if f.track_temp <= 0.0 && f.air_temp <= 0.0 {
                return no_data(lang);
            }
            let n = deg(t).round() as i64;
            a(
                vec![k(if intent == "track_temp" { "conditions/track_temp_is" } else { "conditions/air_temp_is" }), Part::Int(n), k(deg_key)],
                intent,
                &[n.to_string()],
            )
        }
        "weather" => {
            if f.track_temp <= 0.0 && f.air_temp <= 0.0 {
                return no_data(lang);
            }
            let (air, track) = (deg(f.air_temp).round() as i64, deg(f.track_temp).round() as i64);
            let cond = if f.precip > 0.01 {
                "w_rain"
            } else if f.track_wetness >= 4 {
                "w_wet"
            } else if f.track_wetness >= 2 {
                "w_damp"
            } else {
                "w_dry"
            };
            // Paketten yalnızca sıcaklıklar söylenebilir; yağmur / ıslak pist varsa metin (TTS) daha bilgilendirici
            let parts = if cond == "w_dry" {
                vec![k("conditions/air_temp_is"), Part::Int(air), k(deg_key), k("conditions/track_temp_is"), Part::Int(track), k(deg_key)]
            } else {
                vec![]
            };
            a(parts, "weather", &[air.to_string(), track.to_string(), fmt(lang, cond, &[])])
        }
        "damage" => {
            let damaged = (f.cars[c.me].flags | f.session_flags) & F_REPAIR != 0;
            let mut ans = simple(
                lang,
                if damaged { "damage_yes" } else { "damage_no" },
                if damaged { "damage_reporting/damage" } else { "damage_reporting/no_damage" },
            );
            if f.fast_repairs >= 0 {
                // Hızlı tamir sayısı pakette yok: metinle (TTS) söylenir
                ans.parts.clear();
                ans.text = format!("{} {}", ans.text, fmt(lang, "fast_repairs", &[f.fast_repairs.to_string()]));
            }
            ans
        }
        _ => no_data(lang),
    }
}

// ---------------------------------------------------------------------------
// Çalışma zamanı
// ---------------------------------------------------------------------------

static CFG: Mutex<Option<CmdCfg>> = parking_lot::const_mutex(None);
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Mikrofon açık (dinleniyor)
static LISTENING: AtomicBool = AtomicBool::new(false);
/// Windows sesiyle cevap hazırlanıyor (henüz ses kanalına verilmedi)
static TTS_PENDING: AtomicBool = AtomicBool::new(false);
/// Bas-konuş girişi şu an basılı
static PTT_DOWN: AtomicBool = AtomicBool::new(false);
/// Dokun-başlat kipinde ikinci dokunuş: dinlemeyi bitir
static STOP: AtomicBool = AtomicBool::new(false);
/// Motor iş parçacığının cevaplayacağı niyetler
static PENDING: Mutex<Vec<Request>> = parking_lot::const_mutex(Vec::new());

#[derive(Clone, Debug, PartialEq)]
enum Request {
    Intent(String),
    Repeat,
    NotUnderstood,
}

fn cfg() -> CmdCfg {
    CFG.lock().clone().unwrap_or_default()
}

/// Mühendis kuyruğu beklesin mi: mikrofon açıkken (hoparlördeki ses tanımayı bozmasın) ve Windows sesiyle
/// cevap hazırlanırken (cevabın önüne başka mesaj girmesin). Spotter bundan etkilenmez.
pub fn hold() -> bool {
    LISTENING.load(Ordering::Relaxed) || TTS_PENDING.load(Ordering::Relaxed)
}

/// Cevapların dili (arayüz dili)
pub fn answer_lang() -> String {
    let l = cfg().ui_lang;
    if l.is_empty() {
        "en".into()
    } else {
        l
    }
}

/// PRO izni: sesli komut PRO'ya ayrılmışsa ve sesli mühendisin kendisi kilitliyse kapalı
pub fn allowed(app: &AppHandle) -> bool {
    let e = crate::entitlement::view(app);
    e.pro || !e.locked.iter().any(|x| x == FEATURE || x == "voice")
}

/// Ayarlar (ya da PRO durumu) değişti
pub fn apply_settings(app: &AppHandle, v: &Value) {
    let _ = APP.set(app.clone());
    let c = cfg_from_settings(v, allowed(app));
    let active = c.active();
    *CFG.lock() = Some(c);
    if active {
        imp::ensure_input();
    }
}

fn beep(kind: u8) {
    if !cfg().beeps {
        return;
    }
    // 0: dinliyorum, 1: anlaşıldı, 2: anlaşılmadı
    let tones: &[(f32, u64)] = match kind {
        0 => &[(880.0, 90)],
        1 => &[(1175.0, 60), (1568.0, 80)],
        _ => &[(330.0, 170)],
    };
    for (f, ms) in tones {
        crate::audio::send(crate::audio::Cmd::Beep { freq: *f, ms: *ms, volume: 0.5, pan: 0.0 });
    }
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CmdEvent {
    /// "listening" | "processing" (çevrimiçi: ses gönderildi) | "heard" | "idle" | "error"
    pub state: &'static str,
    pub heard: String,
    pub intent: String,
    /// Niyet benzerliği 0..1
    pub score: f32,
    /// Tanıyıcının güveni 0..1
    pub confidence: f32,
    pub ok: bool,
    /// Hata kodu ("privacy", "mic_access", "no_mic", "network", "no_recognizer", "pro") ya da Windows iletisi
    pub error: String,
    /// Tanıyıcının dili (ör. "tr-TR") ve kipi ("list" | "dictation")
    pub rec_tag: String,
    pub mode: &'static str,
    /// Arayüz dilinin tanıyıcısı yok: İngilizce dinleniyor
    pub fallback: bool,
    /// "windows" | "online"
    pub engine: &'static str,
}

fn emit(ev: CmdEvent) {
    if let Some(app) = APP.get() {
        let _ = app.emit("voicecmd", ev);
    }
}

/// Tanınan metni işle: niyeti bul, soruyu altyazıya yaz, cevabı sıraya koy. `conf`: tanıyıcı güveni;
/// `strict`: liste kipinde güven eşiği uygulanır. Dönen olay arayüzdeki deneme alanında gösterilir.
fn handle_text(text: &str, conf: f32, rec_lang: &str, strict: bool, mut ev: CmdEvent) -> CmdEvent {
    let c = cfg();
    let m = match_intent(text, rec_lang).or_else(|| if c.ui_lang != rec_lang { match_intent(text, &c.ui_lang) } else { None });
    ev.state = "heard";
    ev.heard = text.to_string();
    ev.confidence = conf;
    crate::voicesub::note("driver", text.to_string(), crate::voicesub::estimate_ms(text).min(4000));
    match m {
        Some((intent, score)) if !strict || conf >= c.confidence => {
            ev.intent = intent.to_string();
            ev.score = score;
            ev.ok = true;
            beep(1);
            dispatch(intent);
        }
        other => {
            if let Some((intent, score)) = other {
                ev.intent = intent.to_string();
                ev.score = score;
            }
            beep(2);
            PENDING.lock().push(Request::NotUnderstood);
        }
    }
    ev
}

fn dispatch(intent: &str) {
    match intent {
        "quiet" | "talk" => {
            let on = intent == "talk";
            let Some(app) = APP.get() else { return };
            // Onayı kısayoldaki gibi ayrı (deneme) motoru söyler; paket yoksa Windows sesiyle
            if !crate::set_voice_enabled(app, on, false) {
                let c = cfg();
                speak(fmt(&c.ui_lang, intent, &[]), &c.ui_lang, 0.8);
            }
        }
        "repeat" => PENDING.lock().push(Request::Repeat),
        other => PENDING.lock().push(Request::Intent(other.to_string())),
    }
}

/// Motor iş parçacığı her döngüde çağırır: bekleyen soruları telemetriden cevaplar ve cevabı
/// (ses kanalı boşalınca) söyletir.
pub fn service(voice: &mut Voice, f: &Frame, s: &SessionData, t: &Tracker, sim: &str) {
    let reqs: Vec<Request> = std::mem::take(&mut *PENDING.lock());
    let now = Instant::now();
    if !reqs.is_empty() {
        let lang = answer_lang();
        for r in reqs {
            let ans = match r {
                Request::NotUnderstood => not_understood(&lang),
                Request::Repeat => match voice.last_said() {
                    Some((parts, text)) => Answer { parts, text },
                    None => simple(&lang, "nothing_to_repeat", ""),
                },
                Request::Intent(i) => {
                    let ctx = Ctx::new(f, s, t, now, Kind::of(s, f.session_num), sim, &voice.cfg);
                    answer(&i, &ctx, &lang)
                }
            };
            voice.set_answer(ans.parts, ans.text, now);
        }
    }
    voice.pump_answer(now);
}

// ---------------------------------------------------------------------------
// Windows sesiyle cevap (paket ifadesi yoksa)
// ---------------------------------------------------------------------------

fn tts_tx() -> &'static Sender<(String, String, f32)> {
    static TX: OnceLock<Sender<(String, String, f32)>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = channel::<(String, String, f32)>();
        std::thread::Builder::new()
            .name("voicecmd-tts".into())
            .spawn(move || {
                let mut n = 0u32;
                #[cfg(windows)]
                let mut synth: Option<crate::livechat::tts_win::Synth> = None;
                while let Ok((text, lang, volume)) = rx.recv() {
                    n = (n + 1) % 4;
                    #[allow(unused_mut)]
                    let mut wav: Option<std::path::PathBuf> = None;
                    #[cfg(windows)]
                    {
                        if synth.is_none() {
                            synth = crate::livechat::tts_win::Synth::new().ok();
                        }
                        if let Some(sy) = synth.as_mut() {
                            let voice = tts_voice(&lang);
                            if let Ok(bytes) = sy.wav(&text, &voice, 0.0, 0.0, 1.0, 1.0) {
                                let p = std::env::temp_dir().join(format!("srtr-pitwall-voicecmd-{n}.wav"));
                                if std::fs::write(&p, bytes).is_ok() {
                                    wav = Some(p);
                                }
                            }
                        }
                    }
                    // Konuşan mesaj bitsin (altyazı erken değişmesin); spotter araya girerse sıra yine korunur
                    let t = Instant::now();
                    while crate::audio::busy() && t.elapsed() < Duration::from_secs(6) {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    match wav {
                        Some(p) => {
                            let sub = crate::voicesub::start(false, text);
                            crate::audio::send(crate::audio::Cmd::Say { parts: vec![p], spotter: false, volume, sub });
                            // Ses iş parçacığı kanalı meşgul işaretleyene kadar kuyruk beklesin
                            std::thread::sleep(Duration::from_millis(250));
                        }
                        // Ses üretilemedi (Windows dışı / ses yok): cevap yalnızca altyazıda görünür
                        None => crate::voicesub::note("engineer", text.clone(), crate::voicesub::estimate_ms(&text)),
                    }
                    TTS_PENDING.store(false, Ordering::Relaxed);
                }
            })
            .expect("sesli komut TTS iş parçacığı başlatılamadı");
        tx
    })
}

/// Arayüz diline uygun kurulu Windows sesi (yoksa boş: Windows varsayılanı)
#[cfg(windows)]
fn tts_voice(lang_key: &str) -> String {
    let tag = lang(lang_key).map(|l| l.tag.to_lowercase()).unwrap_or_default();
    let primary = tag.split('-').next().unwrap_or("").to_string();
    let Ok(all) = crate::livechat::tts_win::voices() else { return String::new() };
    all.iter()
        .find(|v| v.language.to_lowercase() == tag)
        .or_else(|| all.iter().find(|v| !primary.is_empty() && v.language.to_lowercase().split('-').next() == Some(primary.as_str())))
        .map(|v| v.id.clone())
        .unwrap_or_default()
}

/// Metni Windows sesiyle mühendis kanalından söylet (altyazısıyla)
pub fn speak(text: String, lang_key: &str, volume: f32) {
    if text.trim().is_empty() {
        return;
    }
    TTS_PENDING.store(true, Ordering::Relaxed);
    if tts_tx().send((text, lang_key.to_string(), volume)).is_err() {
        TTS_PENDING.store(false, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------
// Çevrimiçi motor (Whisper): tuş basılıyken kaydet → bırakınca gönder → metni komutlarla eşleştir
// ---------------------------------------------------------------------------
// Windows'ta Türkçe konuşma tanıyıcısı yoktur (ne komut listesi ne dikte); Türkçe komutlar bu yoldan tanınır.
// Sunucu ve anahtar Canlı Sohbet › Konuşma → yazı ile ortaktır (OpenAI uyumlu uç; bkz. livechat/stt_cloud.rs).

#[derive(Clone, Debug, PartialEq)]
pub enum CloudHeard {
    Text(String),
    Nothing,
    Error(String),
}

/// Mikrofonu kaydet (16 kHz tek kanal). `released()`: basılı tut kipinde tuş bırakıldı / ikinci dokunuş;
/// `auto_end`: konuşma bitince (sessizlik) kendiliğinden bitir. `on_ready`: mikrofon açılınca bir kez çağrılır.
/// Dönen: örnekler; konuşma algılanmadıysa None.
fn cloud_record(c: &CmdCfg, released: impl Fn() -> bool, auto_end: bool, on_ready: impl FnOnce()) -> Result<Option<Vec<f32>>, String> {
    use crate::livechat::stt_cloud as sc;
    use rodio::cpal;
    use rodio::cpal::traits::{DeviceTrait, StreamTrait};
    const RATE: usize = 16_000;
    const FRAME: usize = 320; // 20 ms
    let (dev, scfg, name) = sc::open_device(sc::Src::Mic, &c.mic_name)?;
    let channels = scfg.channels() as usize;
    let in_rate = scfg.sample_rate().0;
    let (tx, rx) = channel::<Vec<f32>>();
    let on_err = |_e: cpal::StreamError| {};
    let config: cpal::StreamConfig = scfg.config();
    let stream = match scfg.sample_format() {
        cpal::SampleFormat::F32 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[f32], _: &cpal::InputCallbackInfo| drop(tx.send(sc::to_mono(d, channels, |s| s))), on_err, None)
        }
        cpal::SampleFormat::I16 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[i16], _: &cpal::InputCallbackInfo| drop(tx.send(sc::to_mono(d, channels, |s| s as f32 / 32768.0))), on_err, None)
        }
        cpal::SampleFormat::U16 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[u16], _: &cpal::InputCallbackInfo| drop(tx.send(sc::to_mono(d, channels, |s| (s as f32 - 32768.0) / 32768.0))), on_err, None)
        }
        cpal::SampleFormat::I32 => {
            let tx = tx.clone();
            dev.build_input_stream(&config, move |d: &[i32], _: &cpal::InputCallbackInfo| drop(tx.send(sc::to_mono(d, channels, |s| s as f32 / 2_147_483_648.0))), on_err, None)
        }
        other => return Err(format!("Ses biçimi desteklenmiyor: {other:?}")),
    }
    .map_err(|e| format!("Mikrofon açılamadı ({name}): {e}. Cihaz başka bir uygulama tarafından özel kipte kullanılıyor ya da Windows mikrofon izni kapalı olabilir."))?;
    drop(tx);
    stream.play().map_err(|e| format!("Ses yakalama başlatılamadı: {e}"))?;
    on_ready();

    let mut rs = sc::Resampler::new(in_rate);
    let mut samples: Vec<f32> = Vec::with_capacity(RATE * 6);
    let threshold = sc::base_threshold(7);
    let start = Instant::now();
    let mut scanned = 0usize;
    let (mut voiced_ms, mut silence_ms) = (0u32, 0u32);
    let mut released_at: Option<Instant> = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok(chunk) => rs.push(&chunk, &mut samples),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return Err("Ses akışı kapandı".into()),
        }
        while samples.len() - scanned >= FRAME {
            if sc::rms(&samples[scanned..scanned + FRAME]) > threshold {
                voiced_ms += 20;
                silence_ms = 0;
            } else if voiced_ms > 0 {
                silence_ms += 20;
            }
            scanned += FRAME;
        }
        if released_at.is_none() && released() {
            released_at = Some(Instant::now());
        }
        // Bırakıldıktan sonra kısa bir pay: son hece kesilmesin
        if released_at.map(|t| t.elapsed() > Duration::from_millis(250)).unwrap_or(false) {
            break;
        }
        if auto_end && ((voiced_ms >= 280 && silence_ms >= 900) || (voiced_ms == 0 && start.elapsed() > Duration::from_secs(6))) {
            break;
        }
        if start.elapsed() > Duration::from_secs(12) {
            break;
        }
    }
    drop(stream);
    // Hiç konuşma yok: sunucuya gönderme (Whisper sessizlikte cümle uydurur)
    Ok((voiced_ms >= 160).then_some(samples))
}

/// Kaydı yazıya çevir
fn cloud_transcribe(c: &CmdCfg, key: &str, samples: &[f32]) -> CloudHeard {
    use crate::livechat::stt_cloud as sc;
    let ccfg = sc::CloudCfg { url: c.cloud_url.clone(), model: c.cloud_model.clone(), key: key.to_string(), language: cloud_lang(&c.rec_lang), sensitivity: 7 };
    match tauri::async_runtime::block_on(sc::transcribe(&ccfg, sc::wav16(samples))) {
        Ok(text) if text.trim().is_empty() || sc::is_hallucination(&text) => CloudHeard::Nothing,
        Ok(text) => CloudHeard::Text(text),
        Err((_, e)) => CloudHeard::Error(e),
    }
}

// ---------------------------------------------------------------------------
// Giriş ve tanıma iş parçacıkları (Windows)
// ---------------------------------------------------------------------------

/// Arayüze: yakalanan düğme
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BoundButton {
    pub vid: u16,
    pub pid: u16,
    pub button: u16,
    pub name: String,
}

/// Hangi tanıyıcı kullanılacak: (dil etiketi, liste mi, İngilizceye mi düşüldü)
pub fn plan(grammar: &[String], topic: &[String], want_tag: &str, pick: impl Fn(&[String], &str) -> Option<String>) -> Option<(String, bool, bool)> {
    if let Some(t) = pick(grammar, want_tag) {
        return Some((t, true, false));
    }
    if let Some(t) = pick(topic, want_tag) {
        return Some((t, false, false));
    }
    if let Some(t) = pick(grammar, "en-US") {
        return Some((t, true, true));
    }
    pick(topic, "en-US").map(|t| (t, false, true))
}

#[cfg(windows)]
mod imp {
    use super::*;
    use crate::ptt_win::{self, Input};
    use crate::voicecmd_win::{self as win, Heard, Mode, Recognizer};

    pub enum Ev {
        /// Dinle. `manual`: paneldeki deneme düğmesi (susunca biter)
        Listen { manual: bool },
    }

    /// Düğme yakalama isteği: (sonuç kanalı, son tarih)
    static CAPTURE: Mutex<Option<(Sender<Option<BoundButton>>, Instant)>> = parking_lot::const_mutex(None);
    static INPUT_RUNNING: AtomicBool = AtomicBool::new(false);

    pub fn rec_tx() -> &'static Sender<Ev> {
        static TX: OnceLock<Sender<Ev>> = OnceLock::new();
        TX.get_or_init(|| {
            let (tx, rx) = channel::<Ev>();
            std::thread::Builder::new()
                .name("voicecmd-rec".into())
                .spawn(move || rec_loop(rx))
                .expect("sesli komut tanıma iş parçacığı başlatılamadı");
            tx
        })
    }

    /// Giriş iş parçacığını (çalışmıyorsa) başlat. Gerek kalmayınca (özellik kapalı, yakalama yok) kendiliğinden biter.
    pub fn ensure_input() {
        if INPUT_RUNNING.swap(true, Ordering::SeqCst) {
            return;
        }
        let spawned = std::thread::Builder::new().name("voicecmd-input".into()).spawn(|| {
            let mut input = Input::new();
            let mut was_down = false;
            let mut last_raw: Option<Instant> = None;
            let mut capturing = false;
            let mut idle_since: Option<Instant> = None;
            loop {
                let c = cfg();
                let cap = CAPTURE.lock().as_ref().map(|(_, until)| *until);
                let active = c.active();
                if !active && cap.is_none() {
                    // 2 sn boşta: pencereyi ve Raw Input kaydını bırak
                    let since = *idle_since.get_or_insert_with(Instant::now);
                    if since.elapsed() > Duration::from_secs(2) {
                        break;
                    }
                } else {
                    idle_since = None;
                }
                input.pump(cap.is_some(), c.button.map(|(v, p, _)| (v, p)));

                // Düğme yakalama ("Direksiyon tuşu ata")
                if let Some(until) = cap {
                    if !capturing {
                        capturing = true;
                        input.capture_begin();
                    }
                    let hit = input.capture_poll();
                    if hit.is_some() || Instant::now() >= until {
                        if let Some((tx, _)) = CAPTURE.lock().take() {
                            let _ = tx.send(hit.map(|p| BoundButton { vid: p.vid, pid: p.pid, button: p.button, name: p.name }));
                        }
                    }
                } else if capturing {
                    capturing = false;
                    input.capture_end();
                }

                let raw = active
                    && cap.is_none()
                    && (ptt_win::key_down(c.vk, c.mods) || c.button.map(|(v, p, b)| input.is_down(v, p, b)).unwrap_or(false));
                if raw {
                    last_raw = Some(Instant::now());
                }
                // Bırakma 80 ms sürmeli: temas sıçraması ya da rapor titremesi basılı tutmayı erken bitirmesin
                let down = raw || (was_down && active && cap.is_none() && last_raw.map(|t| t.elapsed() < Duration::from_millis(80)).unwrap_or(false));
                PTT_DOWN.store(down, Ordering::Relaxed);
                if down != was_down {
                    // Arayüzdeki "basılı" göstergesi (atamanın görüldüğünü doğrulamak için)
                    if let Some(app) = APP.get() {
                        let _ = app.emit("voicecmd-ptt", down);
                    }
                }
                if down && !was_down {
                    if LISTENING.load(Ordering::Relaxed) {
                        STOP.store(true, Ordering::Relaxed);
                    } else {
                        let _ = rec_tx().send(Ev::Listen { manual: false });
                    }
                }
                was_down = down;
                std::thread::sleep(Duration::from_millis(10));
            }
            PTT_DOWN.store(false, Ordering::Relaxed);
            drop(input);
            INPUT_RUNNING.store(false, Ordering::SeqCst);
            // Kapanırken ayar yeniden açıldıysa tekrar başlat
            if cfg().active() || CAPTURE.lock().is_some() {
                ensure_input();
            }
        });
        if spawned.is_err() {
            INPUT_RUNNING.store(false, Ordering::SeqCst);
        }
    }

    pub fn capture(timeout: Duration) -> Option<BoundButton> {
        let (tx, rx) = channel();
        *CAPTURE.lock() = Some((tx, Instant::now() + timeout));
        ensure_input();
        let r = rx.recv_timeout(timeout + Duration::from_secs(2)).ok().flatten();
        *CAPTURE.lock() = None;
        r
    }

    pub fn capture_cancel() {
        if let Some((tx, _)) = CAPTURE.lock().take() {
            let _ = tx.send(None);
        }
    }

    /// İstenen dil için tanıyıcı: liste → dikte → İngilizce liste. Dönen: (tanıyıcı, veri dili anahtarı, İngilizceye düşüldü mü)
    fn open(want_key: &str) -> Result<(Recognizer, String, bool), String> {
        let (grammar, topic) = (win::grammar_languages(), win::topic_languages());
        let want_tag = lang(want_key).map(|l| l.tag.clone()).unwrap_or_else(|| "en-US".into());
        let phrases = |key: &str| -> Vec<String> { lang(key).map(|l| l.phrases.iter().flat_map(|(_, p)| p.iter().cloned()).collect()).unwrap_or_default() };
        let mut last_err = String::from("no_recognizer");
        if let Some(tag) = win::best_tag(&grammar, &want_tag) {
            match Recognizer::list(&tag, &phrases(want_key)) {
                Ok(r) => return Ok((r, want_key.to_string(), false)),
                Err(e) => last_err = e,
            }
        }
        if let Some(tag) = win::best_tag(&topic, &want_tag) {
            match Recognizer::dictation(&tag) {
                Ok(r) => return Ok((r, want_key.to_string(), false)),
                Err(e) => last_err = e,
            }
        }
        if want_key != "en" {
            if let Some(tag) = win::best_tag(&grammar, "en-US") {
                match Recognizer::list(&tag, &phrases("en")) {
                    Ok(r) => return Ok((r, "en".to_string(), true)),
                    Err(e) => last_err = e,
                }
            }
        }
        Err(last_err)
    }

    fn rec_loop(rx: std::sync::mpsc::Receiver<Ev>) {
        // (istenen dil, tanıyıcı, veri dili, İngilizceye düşüldü mü)
        let mut cache: Option<(String, Recognizer, String, bool)> = None;
        // Mikrofon tercihi: (istenen, kullanılan, son denetim). Seçili cihaz çıkarılmışsa varsayılana düşülür.
        let mut mic: Option<(String, String, Instant)> = None;
        // (istenen dil, o dilin Windows tanıyıcısı var mı)
        let mut native: Option<(String, bool)> = None;
        while let Ok(Ev::Listen { manual }) = rx.recv() {
            let c = cfg();
            if !c.allowed {
                emit(CmdEvent { state: "error", error: "pro".into(), ..Default::default() });
                continue;
            }
            // Motor seçimi
            if native.as_ref().map(|n| n.0 != c.rec_lang).unwrap_or(true) {
                let (grammar, topic) = (win::grammar_languages(), win::topic_languages());
                let want_tag = lang(&c.rec_lang).map(|l| l.tag.clone()).unwrap_or_else(|| "en-US".into());
                let has = plan(&grammar, &topic, &want_tag, win::best_tag).map(|p| !p.2).unwrap_or(false);
                native = Some((c.rec_lang.clone(), has));
            }
            let key = APP.get().map(cloud_key).unwrap_or_default();
            let problem = cloud_problem(&c, &key);
            if use_online(c.engine, native.as_ref().map(|n| n.1).unwrap_or(false), problem.is_none()) {
                let base = CmdEvent { rec_tag: cloud_lang(&c.rec_lang), mode: "dictation", engine: "online", ..Default::default() };
                if let Some(p) = problem {
                    beep(2);
                    emit(CmdEvent { state: "error", error: p.into(), ..base });
                    continue;
                }
                LISTENING.store(true, Ordering::Relaxed);
                STOP.store(false, Ordering::Relaxed);
                let hold = !c.toggle && !manual;
                let recorded = cloud_record(
                    &c,
                    || if hold { !PTT_DOWN.load(Ordering::Relaxed) } else { STOP.load(Ordering::Relaxed) },
                    !hold,
                    || {
                        emit(CmdEvent { state: "listening", ..base.clone() });
                        beep(0);
                    },
                );
                let heard = match recorded {
                    Ok(Some(samples)) => {
                        emit(CmdEvent { state: "processing", ..base.clone() });
                        cloud_transcribe(&c, &key, &samples)
                    }
                    Ok(None) => CloudHeard::Nothing,
                    Err(e) => CloudHeard::Error(e),
                };
                LISTENING.store(false, Ordering::Relaxed);
                match heard {
                    CloudHeard::Text(text) => {
                        let ev = handle_text(&text, 1.0, &c.rec_lang, false, base);
                        emit(ev);
                    }
                    CloudHeard::Nothing => {
                        beep(2);
                        emit(CmdEvent { state: "idle", ..base });
                    }
                    CloudHeard::Error(e) => {
                        beep(2);
                        emit(CmdEvent { state: "error", error: e, ..base });
                    }
                }
                continue;
            }
            LISTENING.store(true, Ordering::Relaxed);
            STOP.store(false, Ordering::Relaxed);
            let recheck = match mic.as_ref() {
                Some((want, _, at)) => *want != c.mic || (!c.mic.is_empty() && at.elapsed() > Duration::from_secs(10)),
                None => true,
            };
            if recheck {
                let used = win::use_microphone(&c.mic);
                if mic.as_ref().map(|m| m.1 != used).unwrap_or(true) {
                    // Tanıyıcı ses girişini kurulurken seçer: yeniden kur
                    cache = None;
                }
                mic = Some((c.mic.clone(), used, Instant::now()));
            }
            if cache.as_ref().map(|x| x.0 != c.rec_lang).unwrap_or(true) {
                cache = None;
                match open(&c.rec_lang) {
                    Ok((r, key, fb)) => cache = Some((c.rec_lang.clone(), r, key, fb)),
                    Err(e) => {
                        LISTENING.store(false, Ordering::Relaxed);
                        beep(2);
                        emit(CmdEvent { state: "error", error: e, ..Default::default() });
                        continue;
                    }
                }
            }
            let Some((_, rec, key, fallback)) = cache.as_ref() else { continue };
            let base = CmdEvent {
                rec_tag: rec.tag.clone(),
                mode: if rec.mode == Mode::List { "list" } else { "dictation" },
                fallback: *fallback,
                engine: "windows",
                ..Default::default()
            };
            emit(CmdEvent { state: "listening", ..base.clone() });
            beep(0);
            let hold = !c.toggle && !manual;
            let heard = rec.listen(
                || if hold { !PTT_DOWN.load(Ordering::Relaxed) } else { STOP.load(Ordering::Relaxed) },
                Duration::from_millis(2500),
                Duration::from_secs(12),
            );
            LISTENING.store(false, Ordering::Relaxed);
            match heard {
                Heard::Text(text, conf) => {
                    let ev = handle_text(&text, conf as f32, key, rec.mode == Mode::List, base);
                    emit(ev);
                }
                Heard::Nothing => {
                    beep(2);
                    emit(CmdEvent { state: "idle", ..base });
                }
                Heard::Error(e) => {
                    beep(2);
                    // Tanıyıcı bozulmuş olabilir: sonraki basışta yeniden kur (mikrofon da yeniden denetlenir)
                    cache = None;
                    mic = None;
                    emit(CmdEvent { state: "error", error: e, ..base });
                }
            }
        }
    }

    pub fn languages() -> (Vec<String>, Vec<String>) {
        (win::grammar_languages(), win::topic_languages())
    }

    pub fn pick(installed: &[String], want: &str) -> Option<String> {
        win::best_tag(installed, want)
    }

    pub fn microphones(want: &str) -> Result<Vec<MicInfo>, String> {
        Ok(win::microphones(want)?.into_iter().map(|m| MicInfo { id: m.id, name: m.name, is_default: m.is_default }).collect())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn ensure_input() {}
    pub fn capture(_timeout: Duration) -> Option<BoundButton> {
        None
    }
    pub fn capture_cancel() {}
    pub fn languages() -> (Vec<String>, Vec<String>) {
        (vec![], vec![])
    }
    pub fn pick(_installed: &[String], _want: &str) -> Option<String> {
        None
    }
    pub fn microphones(_want: &str) -> Result<Vec<MicInfo>, String> {
        Ok(vec![])
    }
}

// ---------------------------------------------------------------------------
// Arayüz komutları
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CmdStatus {
    pub supported: bool,
    pub allowed: bool,
    /// Arayüz dili ve istenen tanıma dili (veri anahtarları)
    pub ui_lang: String,
    pub want_lang: String,
    /// İstenen dilin Windows etiketi (ör. "tr-TR") ve adı
    pub want_tag: String,
    pub want_name: String,
    /// Kurulu tanıma dilleri: komut listesi (çevrimdışı) ve dikte
    pub grammar_langs: Vec<String>,
    pub topic_langs: Vec<String>,
    /// Kullanılacak tanıyıcı ("" : hiçbiri kurulu değil), kipi ve İngilizceye düşüp düşmediği
    pub rec_tag: String,
    pub mode: &'static str,
    pub fallback: bool,
    /// Ayardaki motor ("auto" | "windows" | "online") ve gerçekte kullanılacak olan ("windows" | "online")
    pub engine: &'static str,
    pub use_engine: &'static str,
    /// İstenen dilin Windows tanıyıcısı var mı (İngilizceye düşmeden)
    pub native: bool,
    /// Çevrimiçi motor: hazır mı, değilse neden ("cloud_key" | "cloud_url"), anahtar kayıtlı mı, sunucu adı, model
    pub cloud_ready: bool,
    pub cloud_problem: &'static str,
    pub cloud_has_key: bool,
    pub cloud_host: String,
    pub cloud_model: String,
}

#[tauri::command]
pub fn voicecmd_status(app: AppHandle) -> CmdStatus {
    let c = cfg_from_settings(&crate::current_settings(&app).unwrap_or(Value::Null), allowed(&app));
    let (grammar, topic) = imp::languages();
    let l = lang(&c.rec_lang);
    let want_tag = l.map(|l| l.tag.clone()).unwrap_or_default();
    let p = plan(&grammar, &topic, &want_tag, imp::pick);
    let native = p.as_ref().map(|x| !x.2).unwrap_or(false);
    let key = cloud_key(&app);
    let problem = cloud_problem(&c, &key);
    let online = use_online(c.engine, native, problem.is_none());
    let host = c.cloud_url.split("://").nth(1).unwrap_or("").split('/').next().unwrap_or("").to_string();
    CmdStatus {
        engine: match c.engine {
            Engine::Auto => "auto",
            Engine::Windows => "windows",
            Engine::Online => "online",
        },
        use_engine: if online { "online" } else { "windows" },
        native,
        cloud_ready: problem.is_none(),
        cloud_problem: problem.unwrap_or(""),
        cloud_has_key: !key.is_empty(),
        cloud_host: host,
        cloud_model: c.cloud_model.clone(),
        supported: SUPPORTED,
        allowed: c.allowed,
        ui_lang: c.ui_lang.clone(),
        want_lang: c.rec_lang.clone(),
        want_name: l.map(|l| l.name.clone()).unwrap_or_default(),
        want_tag,
        grammar_langs: grammar,
        topic_langs: topic,
        rec_tag: p.as_ref().map(|x| x.0.clone()).unwrap_or_default(),
        mode: match p.as_ref() {
            Some((_, true, _)) => "list",
            Some(_) => "dictation",
            None => "",
        },
        fallback: p.map(|x| x.2).unwrap_or(false),
    }
}

/// Bir kayıt cihazı (mikrofon)
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MicInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Kayıt cihazları (ad + Windows varsayılanı işareti). Ayardaki seçim önce uygulanır; cihaz yoksa varsayılana düşülür.
#[tauri::command]
pub async fn voicecmd_microphones(app: AppHandle) -> Result<Vec<MicInfo>, String> {
    let c = cfg_from_settings(&crate::current_settings(&app).unwrap_or(Value::Null), allowed(&app));
    tauri::async_runtime::spawn_blocking(move || imp::microphones(&c.mic)).await.map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct Example {
    pub intent: String,
    pub phrases: Vec<String>,
}

/// Bir dildeki komut cümleleri (boş dil: ayardaki tanıma dili)
#[tauri::command]
pub fn voicecmd_examples(app: AppHandle, language: Option<String>) -> Vec<Example> {
    let key = match language.filter(|l| !l.trim().is_empty()) {
        Some(l) => lang_key(&l).to_string(),
        None => cfg_from_settings(&crate::current_settings(&app).unwrap_or(Value::Null), true).rec_lang,
    };
    lang(&key).map(|l| l.phrases.iter().map(|(i, p)| Example { intent: i.clone(), phrases: p.clone() }).collect()).unwrap_or_default()
}

/// "Direksiyon tuşu ata": bir düğmeye basılmasını bekler (en çok `seconds` sn). Basılmazsa None.
#[tauri::command]
pub async fn voicecmd_capture_button(seconds: Option<u64>) -> Result<Option<BoundButton>, String> {
    if !SUPPORTED {
        return Err("Sesli komut yalnızca Windows'ta çalışır".into());
    }
    let t = Duration::from_secs(seconds.unwrap_or(10).clamp(2, 30));
    tauri::async_runtime::spawn_blocking(move || imp::capture(t)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn voicecmd_capture_cancel() {
    imp::capture_cancel();
}

/// Deneme alanı: yazılan cümleyi tanınmış gibi işle (mikrofon gerekmez). `speak`: cevabı da söylet.
#[tauri::command]
pub fn voicecmd_test_text(app: AppHandle, text: String, speak: Option<bool>) -> CmdEvent {
    let _ = APP.set(app.clone());
    let c = cfg_from_settings(&crate::current_settings(&app).unwrap_or(Value::Null), allowed(&app));
    *CFG.lock() = Some(c.clone());
    if !c.allowed {
        return CmdEvent { state: "error", error: "pro".into(), ..Default::default() };
    }
    if speak.unwrap_or(true) {
        return handle_text(&text, 1.0, &c.rec_lang, false, CmdEvent::default());
    }
    let m = match_intent(&text, &c.rec_lang).or_else(|| match_intent(&text, &c.ui_lang));
    CmdEvent {
        state: "heard",
        heard: text,
        intent: m.map(|x| x.0.to_string()).unwrap_or_default(),
        score: m.map(|x| x.1).unwrap_or(0.0),
        confidence: 1.0,
        ok: m.is_some(),
        ..Default::default()
    }
}

/// Deneme alanı: mikrofonu bir cümle için dinle (tuş atanmamış olsa da). Sonuç "voicecmd" olayıyla gelir.
#[tauri::command]
pub fn voicecmd_listen(app: AppHandle) -> Result<(), String> {
    let _ = APP.set(app.clone());
    let c = cfg_from_settings(&crate::current_settings(&app).unwrap_or(Value::Null), allowed(&app));
    if !SUPPORTED {
        return Err("Sesli komut yalnızca Windows'ta çalışır".into());
    }
    if !c.allowed {
        return Err("pro".into());
    }
    *CFG.lock() = Some(c);
    #[cfg(windows)]
    {
        if LISTENING.load(Ordering::Relaxed) {
            STOP.store(true, Ordering::Relaxed);
        } else {
            let _ = imp::rec_tx().send(imp::Ev::Listen { manual: true });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_is_complete() {
        let d = data();
        assert_eq!(d.langs.len(), 15);
        assert!(d.intents.len() >= 24);
        let en = lang("en").unwrap();
        for l in &d.langs {
            assert!(!l.tag.is_empty() && !l.name.is_empty());
            for (intent, phrases) in &l.phrases {
                assert!(phrases.len() >= 2, "{} {intent}", l.key);
                for p in phrases {
                    // Her cümle kendi niyetine tam eşleşmeli (başka niyetle çakışma yok)
                    assert_eq!(match_intent(p, &l.key), Some((intent.as_str(), 1.0)), "{} {p}", l.key);
                }
            }
            for key in en.answers.keys() {
                assert!(l.answers.get(key).map(|s| !s.is_empty()).unwrap_or(false), "{} cevap eksik: {key}", l.key);
                // Yer tutucular İngilizcedekiyle aynı
                for i in 0..4 {
                    let ph = format!("{{{i}}}");
                    assert_eq!(l.answers[key].contains(&ph), en.answers[key].contains(&ph), "{} {key} {ph}", l.key);
                }
            }
        }
    }

    #[test]
    fn language_keys() {
        assert_eq!(lang_key("tr"), "tr");
        assert_eq!(lang_key("tr-TR"), "tr");
        assert_eq!(lang_key("pt-BR"), "pt-BR");
        assert_eq!(lang_key("pt-pt"), "pt-PT");
        assert_eq!(lang_key("pt"), "pt-BR");
        assert_eq!(lang_key("zh"), "zh-CN");
        assert_eq!(lang_key("zh-CN"), "zh-CN");
        assert_eq!(lang_key("ko"), "en");
        assert_eq!(lang_key(""), "en");
    }

    #[test]
    fn normalizes() {
        assert_eq!(normalize("  Ne kadar YAKITIM var?  "), "ne kadar yakitim var");
        assert_eq!(normalize("İncident limiti kaç!"), "incident limiti kaç");
        assert_eq!(normalize("What's my position?"), "whats my position");
        assert_eq!(normalize("燃料はどれくらいある?"), "燃料はどれくらいある");
    }

    #[test]
    fn matches_turkish() {
        let m = |t: &str| match_intent(t, "tr").map(|x| x.0);
        assert_eq!(m("Ne kadar yakıtım var?"), Some("fuel_level"));
        assert_eq!(m("ne kadar yakıtım kaldı"), Some("fuel_level"));
        assert_eq!(m("Kaç incidentım var"), Some("incidents"));
        assert_eq!(m("kaç olay puanım var acaba"), Some("incidents"));
        assert_eq!(m("kaç turluk yakıt var"), Some("fuel_laps"));
        assert_eq!(m("yakıt bitişe yeter mi"), Some("fuel_to_end"));
        assert_eq!(m("kaçıncıyım"), Some("position"));
        assert_eq!(m("öndekiyle fark ne kadar"), Some("gap_ahead"));
        assert_eq!(m("arkadakiyle fark ne kadar"), Some("gap_behind"));
        assert_eq!(m("son turum kaçtı"), Some("last_lap"));
        assert_eq!(m("en iyi turum kaç"), Some("best_lap"));
        assert_eq!(m("kaç tur kaldı"), Some("remaining"));
        assert_eq!(m("pist sıcaklığı kaç derece"), Some("track_temp"));
        assert_eq!(m("hava sıcaklığı kaç"), Some("air_temp"));
        assert_eq!(m("önümde kim var"), Some("driver_ahead"));
        assert_eq!(m("arkamda kim var"), Some("driver_behind"));
        assert_eq!(m("tekrar et"), Some("repeat"));
        assert_eq!(m("sus"), Some("quiet"));
        assert_eq!(m("konuşabilirsin"), Some("talk"));
        assert_eq!(m("telsiz kontrol"), Some("radio_check"));
        assert_eq!(m("bugün hava çok güzel pikniğe gidelim mi"), None);
        assert_eq!(m(""), None);
    }

    #[test]
    fn matches_english() {
        let m = |t: &str| match_intent(t, "en").map(|x| x.0);
        assert_eq!(m("How much fuel do I have?"), Some("fuel_level"));
        assert_eq!(m("how much fuel do i have left"), Some("fuel_level"));
        assert_eq!(m("How many incidents do I have"), Some("incidents"));
        assert_eq!(m("how many laps of fuel do I have"), Some("fuel_laps"));
        assert_eq!(m("do I have enough fuel to finish the race"), Some("fuel_to_end"));
        assert_eq!(m("what's my position"), Some("position"));
        assert_eq!(m("whats the gap ahead"), Some("gap_ahead"));
        assert_eq!(m("what's the gap behind"), Some("gap_behind"));
        assert_eq!(m("what was my last lap"), Some("last_lap"));
        assert_eq!(m("what's my best lap"), Some("best_lap"));
        assert_eq!(m("how many laps are left"), Some("remaining"));
        assert_eq!(m("what's the track temperature"), Some("track_temp"));
        assert_eq!(m("what's the air temperature"), Some("air_temp"));
        assert_eq!(m("who's behind me"), Some("driver_behind"));
        assert_eq!(m("repeat that"), Some("repeat"));
        assert_eq!(m("be quiet"), Some("quiet"));
        assert_eq!(m("radio check"), Some("radio_check"));
        assert_eq!(m("what should we have for dinner tonight"), None);
    }

    #[test]
    fn matches_other_languages() {
        assert_eq!(match_intent("Wie viel Sprit habe ich?", "de").map(|x| x.0), Some("fuel_level"));
        assert_eq!(match_intent("wie viele incidents habe ich", "de").map(|x| x.0), Some("incidents"));
        assert_eq!(match_intent("¿Cuánto combustible tengo?", "es").map(|x| x.0), Some("fuel_level"));
        assert_eq!(match_intent("combien de tours il reste", "fr").map(|x| x.0), Some("remaining"));
        assert_eq!(match_intent("сколько у меня топлива", "ru").map(|x| x.0), Some("fuel_level"));
        assert_eq!(match_intent("我还有多少油?", "zh-CN").map(|x| x.0), Some("fuel_level"));
        assert_eq!(match_intent("燃料はどれくらいある", "ja").map(|x| x.0), Some("fuel_level"));
        assert_eq!(match_intent("いま何位ですか", "ja").map(|x| x.0), Some("position"));
        assert_eq!(match_intent("ile mam paliwa", "pl").map(|x| x.0), Some("fuel_level"));
    }

    #[test]
    fn keys() {
        assert_eq!(parse_key("Ctrl+Shift+T"), Some((0x54, MOD_CTRL | MOD_SHIFT)));
        assert_eq!(parse_key("F13"), Some((0x7C, 0)));
        assert_eq!(parse_key("Num0"), Some((0x60, 0)));
        assert_eq!(parse_key("Alt+Space"), Some((0x20, MOD_ALT)));
        assert_eq!(parse_key("5"), Some((0x35, 0)));
        assert_eq!(parse_key(""), None);
        assert_eq!(parse_key("Ctrl"), None);
        assert_eq!(parse_key("A+B"), None);
        assert_eq!(parse_key("Foo"), None);
    }

    #[test]
    fn settings() {
        let v = serde_json::json!({"general": {"language": "de", "voice": {"commands": {
            "enabled": true, "mode": "toggle", "key": "Ctrl+Alt+K", "button": {"vid": 0x0EB7, "pid": 6, "button": 12, "name": "Wheel"},
            "language": "", "confidence": 55, "beeps": false}}}});
        let c = cfg_from_settings(&v, true);
        assert!(c.enabled && c.toggle && !c.beeps && c.active());
        assert_eq!((c.vk, c.mods), (0x4B, MOD_CTRL | MOD_ALT));
        assert_eq!(c.button, Some((0x0EB7, 6, 12)));
        assert_eq!((c.rec_lang.as_str(), c.ui_lang.as_str()), ("de", "de"));
        assert!((c.confidence - 0.55).abs() < 1e-6);
        // PRO değilse çalışmaz; ayar yoksa kapalı
        assert!(!cfg_from_settings(&v, false).active());
        let d = cfg_from_settings(&serde_json::json!({"general": {"language": "tr"}}), true);
        assert!(d.enabled && !d.active() && d.beeps && d.rec_lang == "tr");
        // Tanıma dili ayrı seçilebilir
        let v2 = serde_json::json!({"general": {"language": "tr", "voice": {"commands": {"enabled": true, "language": "en", "key": "F13"}}}});
        let c2 = cfg_from_settings(&v2, true);
        assert_eq!((c2.rec_lang.as_str(), c2.ui_lang.as_str()), ("en", "tr"));
    }

    #[test]
    fn recognizer_plan() {
        let pick = |list: &[String], want: &str| {
            let w = want.to_lowercase();
            let p = w.split('-').next().unwrap().to_string();
            list.iter().find(|t| t.to_lowercase() == w).or_else(|| list.iter().find(|t| t.to_lowercase().starts_with(&p))).cloned()
        };
        let g = vec!["en-US".to_string(), "de-DE".to_string()];
        let t = vec!["en-US".to_string(), "tr-TR".to_string()];
        assert_eq!(plan(&g, &t, "de-DE", pick), Some(("de-DE".into(), true, false)));
        assert_eq!(plan(&g, &t, "tr-TR", pick), Some(("tr-TR".into(), false, false)));
        assert_eq!(plan(&g, &t, "fi-FI", pick), Some(("en-US".into(), true, true)));
        assert_eq!(plan(&[], &[], "tr-TR", pick), None);
    }

    fn ctx_frame() -> (Frame, SessionData, Tracker) {
        let mut s = SessionData::default();
        s.incident_limit = 17;
        s.drivers = (0..3)
            .map(|i| {
                Some(crate::model::Driver { car_idx: i, name: format!("Sürücü {i}"), class_id: 1, class_est_lap: 90.0, ..Default::default() })
            })
            .collect();
        s.sessions = vec![crate::model::SessionEntry { num: 0, kind: "Race".into(), laps: Some(20), time: None }];
        let mut f = Frame::default();
        f.player_idx = 1;
        f.is_on_track = true;
        f.fuel_level = 42.6;
        f.incidents = 4;
        f.lap_last = 83.44;
        f.lap_best = 59.96;
        f.session_laps_remain = 7;
        f.track_temp = 31.6;
        f.air_temp = 22.2;
        f.track_wetness = 1;
        for (i, (pos, pct)) in [(1, 0.50), (2, 0.48), (3, 0.45)].iter().enumerate() {
            f.cars[i].position = *pos;
            f.cars[i].class_position = *pos;
            f.cars[i].pct = *pct;
            f.cars[i].lap_completed = 3;
            f.cars[i].surface = 3;
        }
        (f, s, Tracker::default())
    }

    #[test]
    fn answers() {
        let (f, s, t) = ctx_frame();
        let cfg = crate::voice::VoiceCfg::default();
        let c = Ctx::new(&f, &s, &t, Instant::now(), Kind::of(&s, 0), "iracing", &cfg);
        let a = answer("fuel_level", &c, "tr");
        assert_eq!(a.parts, vec![Part::Int(43), k("fuel/litres_remaining")]);
        assert_eq!(a.text, "Depoda 42,6 litre yakıt var.");
        assert_eq!(answer("fuel_level", &c, "en").text, "You have 42.6 litres of fuel.");
        let a = answer("incidents", &c, "tr");
        assert_eq!(a.text, "4 olay puanın var, sınır 17.");
        assert_eq!(a.parts.len(), 5);
        assert_eq!(answer("incidents", &c, "en").text, "You have 4 incident points, the limit is 17.");
        assert_eq!(answer("position", &c, "tr").text, "2. sıradasın.");
        assert_eq!(answer("position", &c, "tr").parts, vec![Part::Pos(2)]);
        assert_eq!(answer("last_lap", &c, "tr").text, "Son turun 1 dakika 23,4 saniye.");
        assert_eq!(answer("best_lap", &c, "en").text, "Your best lap is 1 minutes 0.0 seconds.");
        assert_eq!(answer("remaining", &c, "tr").text, "7 tur kaldı.");
        assert_eq!(answer("track_temp", &c, "tr").text, "Pist sıcaklığı 32 derece.");
        assert_eq!(answer("weather", &c, "tr").text, "Hava 22 derece, pist 32 derece, pist kuru.");
        assert_eq!(answer("driver_ahead", &c, "tr").text, "Önünde Sürücü 0 var.");
        assert_eq!(answer("driver_behind", &c, "tr").text, "Arkanda Sürücü 2 var.");
        assert!(answer("gap_ahead", &c, "tr").text.starts_with("Öndekiyle fark "));
        assert_eq!(answer("damage", &c, "tr").text, "Hasar görünmüyor.");
        assert_eq!(answer("tyre_wear", &c, "tr"), no_data("tr"));
        // Ortalama yokken
        assert_eq!(answer("fuel_per_lap", &c, "tr").parts, vec![k("fuel/not_enough_laps_for_average")]);
        assert_eq!(answer("radio_check", &c, "tr").text, "Telsiz kontrolü, sesin net geliyor.");
        assert!(answer("clock", &c, "tr").text.starts_with("Saat "));
        // Diğer simlerde olay puanı yok
        let c2 = Ctx::new(&f, &s, &t, Instant::now(), Kind::of(&s, 0), "acc", &cfg);
        assert_eq!(answer("incidents", &c2, "tr"), no_data("tr"));
        // Oturum yokken
        let (f0, s0) = (Frame::default(), SessionData::default());
        let c0 = Ctx::new(&f0, &s0, &t, Instant::now(), Kind::Practice, "", &cfg);
        assert_eq!(answer("fuel_level", &c0, "tr"), no_data("tr"));
        assert_eq!(answer("position", &c0, "en").text, "I don't have that data.");
    }

    /// Cevaplarda kullanılan ses paketi ifadeleri katalogda var
    #[test]
    fn pack_keys_exist_in_catalog() {
        let cat: Value = serde_json::from_str(crate::voicepack::CATALOG_JSON).unwrap();
        // Yalnızca "used" işaretliler: katalog yeniden üretilirse (scripts/voice) sesli komut ifadeleri unutulmasın
        let keys: std::collections::HashSet<&str> =
            cat.as_array().unwrap().iter().filter(|e| e["used"].as_bool().unwrap_or(false)).filter_map(|e| e["key"].as_str()).collect();
        let cats: std::collections::HashSet<&str> = keys.iter().map(|k| k.split('/').next().unwrap()).collect();
        let src = include_str!("voicecmd.rs");
        let mut n = 0;
        for piece in src.split('"').skip(1).step_by(2) {
            let Some((c0, ph)) = piece.split_once('/') else { continue };
            if !cats.contains(c0) || ph.is_empty() || ph.contains(' ') || ph.contains('/') || ph.contains('{') {
                continue;
            }
            assert!(keys.contains(piece), "katalogda yok ya da used=false: {piece}");
            n += 1;
        }
        assert!(n > 20);
    }
}
