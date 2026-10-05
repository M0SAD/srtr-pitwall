//! Sesli spotter ve yarış mühendisi (Crew Chief v4 özelliklerinin telemetrimizin izin verdiği kadarı).
//!
//! Sesler SRTR Pitwall ses paketinden okunur (bkz. `voicepack.rs`); Crew Chief kurulumu gerekmez.
//! Her ifade bir klasördür ("kategori/ifade", ör. "position/p5", "spotter/car_left") ve içinde aynı
//! ifadenin farklı kayıtları bulunur; biri rastgele (son çalınanı tekrarlamadan) seçilir.
//!
//! Akış: motor iş parçacığı her karede `tick` çağırır. Spotter kararları her karede verilir ve
//! anında çalınır (mühendisi keser). Mühendis kuralları (`voice_rules.rs`) saniyede dört kez
//! değerlendirilir ve mesajları öncelikli bir kuyruğa koyar; kuyruk ses kanalı boşalınca en önemli
//! ve hâlâ geçerli mesajı gönderir. Çalma işi `audio` iş parçacığındadır, oyun döngüsünü bekletmez.

use crate::audio::{self, Cmd};
use crate::model::{Frame, SessionData, MAX_CARS};
use crate::tracker::Tracker;
use crate::voice_rules::{traffic_msg, Ctx, Eng, Kind, TRAFFIC_TTL};
use crate::voicepack::{self, k, Pack, PackMeta, Part};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BeepCfg {
    pub enabled: bool,
    pub volume: f32,
    pub pitch: f32,
    pub seconds: f32,
    pub mute_spectating: bool,
}

#[derive(Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SoundsCfg {
    pub faster_class: BeepCfg,
    pub alongside: BeepCfg,
}

/// Hangi oturumlarda konuşsun
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionsCfg {
    pub race: bool,
    pub qualify: bool,
    pub practice: bool,
}

/// Ses düzeyi (%) -> genlik çarpanı. Kulak ses şiddetini doğrusal duymaz: çarpan doğrudan yüzde olunca kaydırıcı
/// %10'lara inene kadar ses neredeyse hiç kısılmıyordu. Kare eğrisiyle %50 belirgin biçimde kısık (yaklaşık −12 dB),
/// %100 yine tam ses; %100 üstü (varsa) doğrusal yükseltme.
fn loudness(pct: f32) -> f32 {
    let x = (pct / 100.0).clamp(0.0, 2.0);
    if x <= 1.0 {
        x * x
    } else {
        x
    }
}

impl Default for SessionsCfg {
    fn default() -> Self {
        SessionsCfg {
            race: true,
            qualify: true,
            practice: true,
        }
    }
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceCfg {
    /// "Sesli mühendis açık": canlı oturum algılanınca kendiliğinden konuşur
    pub enabled: bool,
    /// Kurulu paket kimliği (voicepacks/<id>); boşsa ilk kurulu paket
    pub pack: String,
    /// Doğrudan bir klasör (kendi sesini kaydedenler / test edenler için); doluysa `pack`'in önüne geçer
    pub custom_dir: String,
    pub volume: f32,
    pub spotter_volume: f32,
    /// Ses çıkış cihazının adı (boş: Windows varsayılanı)
    pub device: String,
    /// Demo modunda mühendis / spotter sesi ve bipler duyulsun (varsayılan kapalı: yalnızca altyazı benzetimi)
    pub demo_sound: bool,
    /// "Argo ifadeler": sweary_ kayıtları da çalınsın
    pub sweary: bool,
    /// Virajda (direksiyon çevrili / sert frende) önemsiz mesajları beklet
    pub quiet_in_corners: bool,
    pub oval_inside_outside: bool,
    pub sessions: SessionsCfg,
    pub categories: HashMap<String, bool>,
    /// general.speedMph: galon, mil/saat, Fahrenheit
    #[serde(skip)]
    pub imperial: bool,
    /// Ayarlardan çözülen paket kökü ve bilgisi
    #[serde(skip)]
    pub pack_root: Option<PathBuf>,
    #[serde(skip)]
    pub pack_meta: PackMeta,
}

impl Default for VoiceCfg {
    fn default() -> Self {
        VoiceCfg {
            enabled: true,
            pack: String::new(),
            custom_dir: String::new(),
            volume: 80.0,
            spotter_volume: 100.0,
            device: String::new(),
            demo_sound: false,
            sweary: false,
            quiet_in_corners: false,
            oval_inside_outside: false,
            sessions: SessionsCfg::default(),
            categories: HashMap::new(),
            imperial: false,
            pack_root: None,
            pack_meta: PackMeta::default(),
        }
    }
}

/// Varsayılanı kapalı olan özellik grupları
const DEFAULT_OFF: &[&str] = &["radio"];

impl VoiceCfg {
    pub fn on(&self, group: &str) -> bool {
        self.categories
            .get(group)
            .copied()
            .unwrap_or(!DEFAULT_OFF.contains(&group))
    }
}

/// Ayarlardan ses ayarları. `packs_dir`: kurulu paketlerin klasörü (voicepacks)
pub fn cfg_from_settings(v: &Value, packs_dir: Option<&Path>) -> (VoiceCfg, SoundsCfg) {
    let g = v.get("general");
    let mut voice: VoiceCfg = g
        .and_then(|g| g.get("voice"))
        .and_then(|x| serde_json::from_value(x.clone()).ok())
        .unwrap_or_default();
    let sounds = g
        .and_then(|g| g.get("sounds"))
        .and_then(|x| serde_json::from_value(x.clone()).ok())
        .unwrap_or_default();
    voice.imperial = g
        .and_then(|g| g.get("speedMph"))
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    // Bir kerelik geçiş (voice.radioOffV1, bkz. src/sdk/settings.ts): telsiz kontrolü varsayılan olarak kapalı.
    // İşaret henüz kaydedilmemişse (eski kayıt, panel dosyayı yeniden yazmadan önce) eski "açık" değeri sayılmaz.
    let radio_migrated = g
        .and_then(|g| g.pointer("/voice/radioOffV1"))
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    if !radio_migrated {
        voice.categories.insert("radio".into(), false);
    }
    if let Some((root, meta)) = voicepack::resolve(packs_dir, &voice.pack, &voice.custom_dir) {
        voice.pack_root = Some(root);
        voice.pack_meta = meta;
    }
    (voice, sounds)
}

// ---------------------------------------------------------------------------
// Ses paketi bilgisi (arayüz)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    pub found: bool,
    pub custom: bool,
    pub path: String,
    pub pack_id: String,
    pub name: String,
    pub language: String,
    pub author: String,
    pub version: String,
    pub phrases: usize,
    pub files: usize,
    pub active: bool,
    pub packs_dir: String,
    pub error: Option<String>,
}

pub fn info(cfg: &VoiceCfg, packs_dir: Option<&Path>, active: bool) -> VoiceInfo {
    let (phrases, files) = cfg
        .pack_root
        .as_deref()
        .map(voicepack::count)
        .unwrap_or((0, 0));
    let custom = !cfg.custom_dir.trim().is_empty();
    let error = if cfg.pack_root.is_none() {
        Some(if custom {
            "Klasörde ses paketi bulunamadı".to_string()
        } else {
            "Kurulu ses paketi yok".to_string()
        })
    } else {
        None
    };
    VoiceInfo {
        found: cfg.pack_root.is_some(),
        custom,
        path: cfg
            .pack_root
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        pack_id: cfg.pack_meta.id.clone(),
        name: cfg.pack_meta.name.clone(),
        language: cfg.pack_meta.language.clone(),
        author: cfg.pack_meta.author.clone(),
        version: cfg.pack_meta.version.clone(),
        phrases,
        files,
        active,
        packs_dir: packs_dir
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        error,
    }
}

// ---------------------------------------------------------------------------
// Mesajlar ve öncelik
// ---------------------------------------------------------------------------

/// Öncelikler: yüksek olan önce çalar; kuyruk dolarsa düşük olan atılır.
pub mod prio {
    /// Hayati: sarı bayrak/safety car, yakıt bitiyor, ters yön, pistten dönüşte araç geliyor
    pub const CRITICAL: u8 = 90;
    pub const HIGH: u8 = 70;
    pub const NORMAL: u8 = 50;
    pub const LOW: u8 = 30;
    /// Sohbet (öğütler, yorumlar)
    pub const CHATTER: u8 = 10;
}

#[derive(Clone, Debug)]
pub struct Msg {
    pub parts: Vec<Part>,
    pub prio: u8,
    /// Özellik grubu (ayarlardaki aç/kapa anahtarı)
    pub group: &'static str,
    /// Bu süreden sonra söylenmezse anlamını yitirir (sn)
    pub ttl: f32,
    pub born: Option<Instant>,
}

impl Msg {
    pub fn new(group: &'static str, prio: u8, parts: Vec<Part>) -> Msg {
        let ttl = match prio {
            p if p >= prio::CRITICAL => 6.0,
            p if p >= prio::HIGH => 10.0,
            p if p >= prio::NORMAL => 15.0,
            _ => 20.0,
        };
        Msg {
            parts,
            prio,
            group,
            ttl,
            born: None,
        }
    }

    pub fn ttl(mut self, secs: f32) -> Msg {
        self.ttl = secs;
        self
    }
}

/// Öncelikli mesaj kuyruğu (spotter dışındaki her şey)
#[derive(Default)]
pub struct Queue {
    pub items: Vec<Msg>,
}

pub const QUEUE_MAX: usize = 8;

impl Queue {
    pub fn push(&mut self, mut m: Msg, now: Instant) {
        if self.items.iter().any(|x| x.parts == m.parts) {
            return;
        }
        m.born.get_or_insert(now);
        if self.items.len() >= QUEUE_MAX {
            // En düşük öncelikli (eşitse en eski) mesajı at; yeni mesaj daha önemsizse onu at
            let (i, low) = self
                .items
                .iter()
                .enumerate()
                .min_by_key(|(_, x)| x.prio)
                .map(|(i, x)| (i, x.prio))
                .unwrap();
            if low >= m.prio {
                return;
            }
            self.items.remove(i);
        }
        self.items.push(m);
    }

    /// Süresi geçenleri at, sonra en önemli (eşitse en eski) mesajı çıkar. `min_prio` altındakiler beklesin.
    pub fn pop(&mut self, now: Instant, min_prio: u8) -> Option<Msg> {
        self.items.retain(|m| {
            m.born
                .map(|b| now.duration_since(b).as_secs_f32() <= m.ttl)
                .unwrap_or(true)
        });
        let i = self
            .items
            .iter()
            .enumerate()
            .filter(|(_, m)| m.prio >= min_prio)
            .max_by(|(ia, a), (ib, b)| a.prio.cmp(&b.prio).then(ib.cmp(ia)))
            .map(|(i, _)| i)?;
        Some(self.items.remove(i))
    }
}

// ---------------------------------------------------------------------------
// Spotter durumu
// ---------------------------------------------------------------------------

struct Spot {
    clr: i32,
    pending_clr: i32,
    pending_since: Instant,
    overlap_since: Option<Instant>,
    last_spot: Instant,
    held_line: bool,
    three_wide: bool,
}

impl Default for Spot {
    fn default() -> Self {
        let past = crate::crashlog::past(600);
        Spot {
            clr: 1,
            pending_clr: 1,
            pending_since: past,
            overlap_since: None,
            last_spot: past,
            held_line: false,
            three_wide: false,
        }
    }
}

/// CarLeftRight geçişine karşılık gelen spotter ifadesi (sol/sağ ya da ovalde iç/dış)
pub fn spotter_key(prev: i32, st: i32, oval: bool, from_three_wide: bool) -> Option<&'static str> {
    let left = |a: &'static str, b: &'static str| if oval { b } else { a };
    match (prev, st) {
        (1, 2) => Some(left("spotter/car_left", "spotter/car_inside")),
        (1, 3) => Some(left("spotter/car_right", "spotter/car_outside")),
        (_, 4) => Some("spotter/in_the_middle"),
        (_, 5) => Some(left(
            "spotter/three_wide_on_right",
            "spotter/three_wide_on_outside",
        )),
        (_, 6) => Some(left(
            "spotter/three_wide_on_left",
            "spotter/three_wide_on_inside",
        )),
        (_, 1) if from_three_wide => Some("spotter/clear"),
        (2, 1) | (5, 1) => Some(left("spotter/clear_left", "spotter/clear_inside")),
        (3, 1) | (6, 1) => Some(left("spotter/clear_right", "spotter/clear_outside")),
        (4, 1) => Some("spotter/clear_all_round"),
        (4, 2) => Some(left("spotter/clear_right", "spotter/clear_outside")),
        (4, 3) => Some(left("spotter/clear_left", "spotter/clear_inside")),
        (2, 3) => Some(left("spotter/car_right", "spotter/car_outside")),
        (3, 2) => Some(left("spotter/car_left", "spotter/car_inside")),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Ses motoru
// ---------------------------------------------------------------------------

pub struct Voice {
    pub cfg: VoiceCfg,
    pub sounds: SoundsCfg,
    /// Sesli kısım etkin (PRO ve "Sesli mühendis açık")
    pub voice_on: bool,
    /// Demo: ses çıkmaz (ses düzeyi 0, bip yok) ama mesajlar gerçek süreleriyle "söylenir": altyazı overlay'i canlı gibi görünür
    silent: bool,
    pack: Option<Pack>,
    pack_key: Option<PathBuf>,
    /// voicepack::PACK_GEN: paket kurulunca / silinince kayıt önbelleği yenilensin
    pack_gen: u64,
    pub queue: Queue,
    sent_at: Instant,
    last_busy: Instant,
    spot: Spot,
    pub eng: Eng,
    radio_done: bool,
    cfg_seen: bool,
    /// Ayar değişikliklerini sesle onayla (test düğmelerinin ayrı motorunda kapalı)
    pub acks: bool,
    last_eng: Instant,
    faster_cd: HashMap<usize, Instant>,
    /// Sesli komut cevabı (bkz. `voicecmd`): (paket parçaları, metin, ne zaman istendi). Kanal boşalınca söylenir.
    answer: Option<(Vec<Part>, String, Instant)>,
    /// Mühendisin son söylediği ("tekrar et" komutu için): paket parçaları ya da Windows sesiyle okunan metin
    last_said: Option<(Vec<Part>, String)>,
}

impl Default for Voice {
    fn default() -> Self {
        let past = crate::crashlog::past(600);
        Voice {
            cfg: VoiceCfg::default(),
            sounds: SoundsCfg::default(),
            voice_on: false,
            silent: false,
            pack: None,
            pack_key: None,
            pack_gen: 0,
            queue: Queue::default(),
            sent_at: past,
            last_busy: past,
            spot: Spot::default(),
            eng: Eng::default(),
            radio_done: false,
            cfg_seen: false,
            acks: true,
            last_eng: past,
            faster_cd: HashMap::new(),
            answer: None,
            last_said: None,
        }
    }
}

/// Ayar değişikliğinde sürücüye onay ("spotter açıldı" gibi): (grup, açıldı ifadesi, kapandı ifadesi)
const ACKS: &[(&str, &str, &str)] = &[
    (
        "spotter",
        "acknowledge/spotterEnabled",
        "acknowledge/spotterDisabled",
    ),
    (
        "flags",
        "acknowledge/yellowEnabled",
        "acknowledge/yellowDisabled",
    ),
    (
        "penalties",
        "acknowledge/cut_warnings_enabled",
        "acknowledge/cut_warnings_disabled",
    ),
    (
        "sectors",
        "acknowledge/deltasEnabled",
        "acknowledge/deltasDisabled",
    ),
];

impl Voice {
    pub fn set_cfg(&mut self, cfg: VoiceCfg, sounds: SoundsCfg, allowed: bool) {
        let gen = voicepack::PACK_GEN.load(std::sync::atomic::Ordering::Relaxed);
        if cfg.pack_root != self.pack_key || gen != self.pack_gen {
            self.pack_gen = gen;
            self.pack = None;
            self.pack_key = cfg.pack_root.clone();
        }
        let now_on = cfg.enabled && allowed;
        // Arayüzden yapılan değişiklikleri sesle onayla (ilk yüklemede değil)
        let mut acks: Vec<&'static str> = Vec::new();
        if self.acks && self.cfg_seen && allowed && cfg.on("acknowledge") {
            if self.cfg.enabled != cfg.enabled {
                acks.push(if cfg.enabled {
                    "acknowledge/keepQuietDisabled"
                } else {
                    "acknowledge/keepQuietEnabled"
                });
            } else if now_on {
                for (g, on, off) in ACKS {
                    if self.cfg.on(g) != cfg.on(g) {
                        acks.push(if cfg.on(g) { on } else { off });
                    }
                }
                if self.cfg.quiet_in_corners != cfg.quiet_in_corners {
                    acks.push(if cfg.quiet_in_corners {
                        "acknowledge/keep_quiet_in_corners_enabled"
                    } else {
                        "acknowledge/keep_quiet_in_corners_disabled"
                    });
                }
            }
        }
        self.cfg_seen = true;
        self.voice_on = now_on;
        self.cfg = cfg;
        self.sounds = sounds;
        if let Some(p) = self.pack.as_mut() {
            p.sweary = self.cfg.sweary;
        }
        if !self.sounds.alongside.enabled {
            audio::send(Cmd::Alongside(None));
        }
        if let Some(a) = acks.first() {
            self.say_now(&[k(a)], false);
        }
        if !self.voice_on {
            self.queue.items.clear();
        }
    }

    fn pack(&mut self) -> Option<&mut Pack> {
        if self.pack.is_none() {
            let root = self.cfg.pack_root.clone()?;
            let mut p = Pack::open(root, self.cfg.pack_meta.clone());
            p.sweary = self.cfg.sweary;
            self.pack = Some(p);
        }
        self.pack.as_mut()
    }

    pub fn active(&self) -> bool {
        self.voice_on && self.cfg.pack_root.is_some()
    }

    /// Kuyruğu atlayıp hemen söyle. Paket ya da bir parça eksikse false.
    fn say_now(&mut self, parts: &[Part], spotter: bool) -> bool {
        let vol = if self.silent {
            0.0
        } else if spotter {
            loudness(self.cfg.spotter_volume)
        } else {
            loudness(self.cfg.volume)
        };
        let Some(pack) = self.pack() else {
            return false;
        };
        let Some(files) = pack.render(parts) else {
            return false;
        };
        // Altyazı ("Sesli Mühendis" overlay'i): söylenen ifadelerin katalogdaki metni, paket dilinde
        let sub = crate::voicesub::start(spotter, voicepack::subtitle(parts, pack.turkish()));
        // Çıkış cihazı: ses iş parçacığı aynı cihaz için hiçbir şey yapmaz
        audio::send(Cmd::Device(self.cfg.device.clone()));
        audio::send(Cmd::Say {
            parts: files,
            spotter,
            volume: vol,
            sub,
        });
        self.sent_at = Instant::now();
        if !spotter {
            self.last_said = Some((parts.to_vec(), String::new()));
        }
        true
    }

    /// Sesli komut cevabını sıraya koy (yenisi eskisinin yerine geçer)
    pub fn set_answer(&mut self, parts: Vec<Part>, text: String, now: Instant) {
        self.answer = Some((parts, text, now));
    }

    /// Mühendisin son söylediği (spotter hariç)
    pub fn last_said(&self) -> Option<(Vec<Part>, String)> {
        self.last_said.clone()
    }

    /// Bekleyen sesli komut cevabını, ses kanalı boşsa söyle: ses paketinde tüm parçalar varsa paketten,
    /// yoksa metni Windows sesiyle (aynı mühendis kanalından; spotter yine keser). Sürücü sorduğu için
    /// "virajlarda sessiz" ve oturum türü ayarları uygulanmaz; 12 sn içinde söylenemezse vazgeçilir.
    pub fn pump_answer(&mut self, now: Instant) {
        let Some((_, _, born)) = self.answer.as_ref() else {
            return;
        };
        if now.duration_since(*born) > Duration::from_secs(12) {
            self.answer = None;
            return;
        }
        if crate::voicecmd::hold() || audio::busy() || now.duration_since(self.sent_at) < Duration::from_millis(350) {
            self.last_busy = now;
            return;
        }
        let Some((parts, text, _)) = self.answer.take() else {
            return;
        };
        if !parts.is_empty() && self.say_now(&parts, false) {
            self.last_busy = now;
            return;
        }
        if !text.is_empty() {
            self.last_said = Some((Vec::new(), text.clone()));
            crate::voicecmd::speak(text, &crate::voicecmd::answer_lang(), self.cfg.volume / 100.0);
            self.sent_at = now;
            self.last_busy = now;
        }
    }

    /// Test düğmeleri: kısa ad, "kategori/ifade" ya da "+" ile birleştirilmiş anahtarlar
    pub fn test(&mut self, key: &str) -> Result<(), String> {
        let parts: Vec<Part> = match key {
            "radio" => vec![k("radio_check/test")],
            "car_left" => vec![k("spotter/car_left")],
            "car_right" => vec![k("spotter/car_right")],
            "three_wide" => vec![k("spotter/in_the_middle")],
            "clear" => vec![k("spotter/clear_all_round")],
            "position" => vec![Part::Pos(5)],
            "laps_left" => vec![Part::Int(5), k("race_time/laps_remaining")],
            "gap" => vec![k("timings/gap_in_front_is_now"), Part::Secs(1.3)],
            "laptime" => vec![k("lap_times/time_intro"), Part::Lap(83.4)],
            "pb" => vec![k("lap_times/personal_best")],
            "fuel" => vec![
                k("fuel/we_estimate"),
                Part::Dec(2.4),
                k("fuel/litres_per_lap"),
            ],
            "fuel_add" => vec![
                k("fuel/we_will_need_to_add"),
                Part::Int(35),
                k("fuel/litres_to_get_to_the_end"),
            ],
            "yellow" => vec![k("flags/yellow_flag")],
            "blue" => vec![k("flags/blue_flag")],
            "green" => vec![k("lap_counter/green_green_green")],
            "last_lap" => vec![k("lap_counter/last_lap")],
            "limiter" => vec![k("mandatory_pit_stops/engage_limiter")],
            "rain" => vec![k("conditions/seeing_some_rain")],
            "temps" => vec![
                k("conditions/track_temp_is"),
                Part::Int(32),
                k("conditions/celsius"),
            ],
            "sof" => vec![k("lap_counter/strength_of_field_is"), Part::Int(2345)],
            "won" => vec![k("lap_counter/won_race")],
            other => other
                .split('+')
                .map(|x| {
                    let x = x.trim();
                    if let Some(n) = x.strip_prefix("int:") {
                        Part::Int(n.parse().unwrap_or(0))
                    } else if let Some(n) = x.strip_prefix("secs:") {
                        Part::Secs(n.parse().unwrap_or(0.0))
                    } else if let Some(n) = x.strip_prefix("lap:") {
                        Part::Lap(n.parse().unwrap_or(0.0))
                    } else {
                        k(x)
                    }
                })
                .collect(),
        };
        let spotter = parts
            .iter()
            .all(|p| matches!(p, Part::K(s) if s.starts_with("spotter/")));
        if self.pack().is_none() {
            return Err("Ses paketi bulunamadı".into());
        }
        if self.say_now(&parts, spotter) {
            Ok(())
        } else {
            Err(format!("Bu ifadenin kaydı yok: {key}"))
        }
    }

    /// Her karede çağrılır. `live`: gerçek sürüş ya da kullanıcının açtığı demo (önizleme değil).
    /// `sim`: bağlı sim kısa adı ("iracing", "acc"…; demo için boş)
    pub fn tick(&mut self, f: &Frame, s: &SessionData, t: &Tracker, live: bool, sim: &str, silent: bool) {
        // "Demoda ses" açıksa demo da gerçek sürüş gibi seslidir
        let silent = silent && !self.cfg.demo_sound;
        if self.silent != silent {
            // Demo açıldı / kapandı: sıradaki mesajlar diğer kipe taşınmasın
            self.queue.items.clear();
        }
        self.silent = silent;
        let now = Instant::now();
        let driving = live && f.is_on_track && !f.replay && f.player_idx >= 0;

        self.beeps(f, s, driving && !silent, live && !silent, now);

        if (!self.voice_on && !silent) || !driving || self.cfg.pack_root.is_none() {
            self.spot.clr = 1;
            self.spot.overlap_since = None;
            // Araçtan inildi / ses kapalı: bekleyen trafik çağrıları sonradan çalmasın
            self.queue.items.retain(|m| !traffic_msg(m));
            if !live {
                self.eng = Eng::default();
                self.queue.items.clear();
            }
            return;
        }

        let kind = Kind::of(s, f.session_num);
        let session_ok = match kind {
            Kind::Race => self.cfg.sessions.race,
            Kind::Qualify => self.cfg.sessions.qualify,
            Kind::Practice => self.cfg.sessions.practice,
        };
        if !session_ok {
            self.queue.items.clear();
            return;
        }

        // Telsiz kontrolü: oturum algılanıp ilk kez pistte olunca bir kez
        if !self.radio_done {
            self.radio_done = true;
            if self.cfg.on("radio") {
                self.queue.push(
                    Msg::new("radio", prio::NORMAL, vec![k("radio_check/test")]),
                    now,
                );
            }
        }

        if self.cfg.on("spotter") {
            self.spotter(f, s, now);
        }

        // Kare başına izlenen hızlı şeyler (sektör zamanları, kaza ani yavaşlaması)
        let mut out: Vec<Msg> = Vec::new();
        let ctx = Ctx::new(f, s, t, now, kind, sim, &self.cfg);
        self.eng.frame(&ctx, &mut out);
        if now.duration_since(self.last_eng) >= Duration::from_millis(250) {
            self.last_eng = now;
            self.eng.rules(&ctx, &mut out);
        }
        // Pitte (ve pit çıkışından hemen sonra) trafik çağrıları: yenileri atılır, kuyruktakiler silinir;
        // pistte de kuyrukta birkaç saniyeden fazla bekleyen trafik çağrısı bayattır.
        let off = self.eng.traffic_off(f, now);
        if off {
            self.queue.items.retain(|m| !traffic_msg(m));
        }
        for mut m in out {
            if traffic_msg(&m) {
                if off {
                    continue;
                }
                m.ttl = m.ttl.min(TRAFFIC_TTL);
            }
            if self.cfg.on(m.group) {
                self.queue.push(m, now);
            }
        }
        self.flush(f, now);
    }

    /// Kanal boşsa kuyruktaki en önemli mesajı çal
    fn flush(&mut self, f: &Frame, now: Instant) {
        // Sesli komut: mikrofon açıkken ve cevap beklerken / hazırlanırken kuyruk bekler (cevap öne geçer)
        if self.answer.is_some() || crate::voicecmd::hold() {
            self.last_busy = now;
            return;
        }
        if audio::busy() || now.duration_since(self.sent_at) < Duration::from_millis(350) {
            self.last_busy = now;
            return;
        }
        // Mesajlar arasında kısa nefes
        if now.duration_since(self.last_busy) < Duration::from_millis(450) {
            return;
        }
        let cornering =
            self.cfg.quiet_in_corners && (f.steer.abs() > 0.6 || (f.brake > 0.4 && f.speed > 20.0));
        let min = if cornering { prio::CRITICAL } else { 0 };
        while let Some(m) = self.queue.pop(now, min) {
            if self.say_now(&m.parts, false) {
                self.last_busy = now;
                break;
            }
        }
    }

    // ------------------------------------------------------------------ bipler
    fn beeps(&mut self, f: &Frame, s: &SessionData, driving: bool, live: bool, now: Instant) {
        let al = &self.sounds.alongside;
        if al.enabled && live && (driving || !al.mute_spectating) && !f.on_pit_road {
            let pan = match f.car_left_right {
                2 | 5 => Some(-1.0),
                3 | 6 => Some(1.0),
                4 => Some(0.0),
                _ => None,
            };
            audio::send(Cmd::Alongside(
                pan.map(|p| (p, al.pitch.max(100.0), al.volume / 100.0)),
            ));
        } else if al.enabled {
            audio::send(Cmd::Alongside(None));
        }

        let fc = self.sounds.faster_class.clone();
        // Kendi aracımız pit yolundayken hızlı sınıf bipi de çalmaz
        if !fc.enabled || !(driving || (live && !fc.mute_spectating)) || (driving && f.on_pit_road) {
            return;
        }
        let me = f.player_idx.max(0) as usize;
        let Some(my) = s.driver(me) else { return };
        let my_est = my.class_est_lap;
        let lap = if my_est > 1.0 { my_est } else { 100.0 };
        let my_pct = f.cars[me].pct;
        for i in 0..MAX_CARS {
            if i == me || f.cars[i].pct < 0.0 || f.cars[i].on_pit {
                continue;
            }
            let Some(d) = s.driver(i) else { continue };
            if d.is_pace_car
                || d.class_id == my.class_id
                || d.class_est_lap <= 1.0
                || d.class_est_lap >= my_est - 0.5
            {
                continue;
            }
            let mut behind = my_pct - f.cars[i].pct;
            if behind < 0.0 {
                behind += 1.0;
            }
            let secs = behind * lap;
            if secs > 0.3 && secs < fc.seconds.max(1.0) {
                let cd = self.faster_cd.get(&i).copied();
                if cd
                    .map(|c| now.duration_since(c) > Duration::from_secs(45))
                    .unwrap_or(true)
                {
                    self.faster_cd.insert(i, now);
                    audio::send(Cmd::Beep {
                        freq: fc.pitch.max(100.0),
                        ms: 160,
                        volume: fc.volume / 100.0,
                        pan: 0.0,
                    });
                }
            }
        }
    }

    // ------------------------------------------------------------------ spotter
    fn spotter(&mut self, f: &Frame, s: &SessionData, now: Instant) {
        if f.on_pit_road || f.speed < 5.0 {
            self.spot.clr = 1;
            self.spot.overlap_since = None;
            return;
        }
        let st = if f.car_left_right <= 0 {
            1
        } else {
            f.car_left_right
        };
        // Kısa titremeleri yok say: yeni durum 120 ms sürmeli
        if st != self.spot.pending_clr {
            self.spot.pending_clr = st;
            self.spot.pending_since = now;
            return;
        }
        if st == self.spot.clr
            || now.duration_since(self.spot.pending_since) < Duration::from_millis(120)
        {
            // Uzun süren yan yanalık: "çizgini koru", "hâlâ orada"
            if st != 1 {
                if let Some(since) = self.spot.overlap_since {
                    if st == 4
                        && !self.spot.held_line
                        && now.duration_since(since) > Duration::from_secs(2)
                    {
                        self.spot.held_line = true;
                        self.spot.last_spot = now;
                        self.say_now(&[k("spotter/hold_your_line")], true);
                    } else if now.duration_since(since) > Duration::from_secs(4)
                        && now.duration_since(self.spot.last_spot) > Duration::from_secs(4)
                    {
                        self.spot.last_spot = now;
                        self.say_now(&[k("spotter/still_there")], true);
                    }
                }
            }
            return;
        }
        let prev = self.spot.clr;
        self.spot.clr = st;
        let oval = self.cfg.oval_inside_outside && s.category.to_lowercase().contains("oval");
        let key = spotter_key(prev, st, oval, self.spot.three_wide && st == 1);
        if st == 1 {
            self.spot.overlap_since = None;
            self.spot.held_line = false;
            self.spot.three_wide = false;
        } else {
            if prev == 1 {
                self.spot.overlap_since = Some(now);
            }
            if st >= 5 {
                self.spot.three_wide = true;
            }
        }
        if let Some(k0) = key {
            self.spot.last_spot = now;
            self.say_now(&[k(k0)], true);
            // Çok sınıflı yarışta yanımızdaki aracın sınıfı (spotter'dan sonra, mühendis kuyruğunda)
            if (prev == 1 && (st == 2 || st == 3)) && self.cfg.on("multiclass") {
                if let Some(m) = self.eng.alongside_class(f, s, now) {
                    self.queue.push(m, now);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spotter_transitions() {
        assert_eq!(spotter_key(1, 2, false, false), Some("spotter/car_left"));
        assert_eq!(spotter_key(1, 3, true, false), Some("spotter/car_outside"));
        assert_eq!(spotter_key(2, 1, false, false), Some("spotter/clear_left"));
        assert_eq!(
            spotter_key(4, 1, false, false),
            Some("spotter/clear_all_round")
        );
        assert_eq!(spotter_key(6, 1, false, true), Some("spotter/clear"));
        assert_eq!(
            spotter_key(1, 5, false, false),
            Some("spotter/three_wide_on_right")
        );
        assert_eq!(spotter_key(5, 2, false, false), None);
    }

    #[test]
    fn queue_priority_and_expiry() {
        let now = Instant::now();
        let mut q = Queue::default();
        q.push(
            Msg::new(
                "gaps",
                prio::LOW,
                vec![k("timings/gap_in_front_increasing")],
            ),
            now,
        );
        q.push(
            Msg::new("flags", prio::CRITICAL, vec![k("flags/yellow_flag")]),
            now,
        );
        q.push(
            Msg::new("flags", prio::CRITICAL, vec![k("flags/yellow_flag")]),
            now,
        ); // tekrar eklenmez
        q.push(Msg::new("position", prio::NORMAL, vec![Part::Pos(3)]), now);
        assert_eq!(q.items.len(), 3);
        assert_eq!(q.pop(now, 0).unwrap().parts, vec![k("flags/yellow_flag")]);
        // Virajda: sadece hayati mesajlar
        assert!(q.pop(now, prio::CRITICAL).is_none());
        // Normal mesajın süresi (15 sn) geçti, düşük öncelikli (20 sn) hâlâ geçerli
        let later = now + Duration::from_secs(17);
        assert_eq!(
            q.pop(later, 0).unwrap().parts,
            vec![k("timings/gap_in_front_increasing")]
        );
        assert!(q.pop(later, 0).is_none());
        // Dolu kuyruk: daha önemli mesaj en önemsizini atar
        for i in 0..QUEUE_MAX {
            q.push(Msg::new("x", prio::LOW, vec![Part::Int(i as i64)]), now);
        }
        q.push(Msg::new("x", prio::CHATTER, vec![Part::Int(99)]), now);
        assert_eq!(q.items.len(), QUEUE_MAX);
        assert!(!q.items.iter().any(|m| m.parts == vec![Part::Int(99)]));
        q.push(Msg::new("x", prio::HIGH, vec![Part::Int(100)]), now);
        assert_eq!(q.items.len(), QUEUE_MAX);
        assert_eq!(q.pop(now, 0).unwrap().parts, vec![Part::Int(100)]);
    }

    #[test]
    fn traffic_messages_expire_quickly() {
        let t0 = Instant::now();
        let mut q = Queue::default();
        let mut m = Msg::new("gaps", prio::NORMAL, vec![k("timings/car_behind_is_lapping_us")]);
        assert!(traffic_msg(&m));
        m.ttl = m.ttl.min(TRAFFIC_TTL);
        q.push(m, t0);
        q.push(Msg::new("fuel", prio::NORMAL, vec![k("fuel/half_distance_good_fuel")]), t0);
        // pitte: trafik mesajları kuyruktan silinir
        let mut q2 = Queue::default();
        q2.items = q.items.clone();
        q2.items.retain(|m| !traffic_msg(m));
        assert_eq!(q2.items.len(), 1);
        // bayat trafik mesajı çalınmaz, diğeri çalınır
        let got = q.pop(t0 + Duration::from_secs(8), 0).unwrap();
        assert_eq!(got.group, "fuel");
        assert!(q.items.is_empty());
    }

    #[test]
    fn settings_parse() {
        let v: Value = serde_json::json!({"general": {"speedMph": true, "voice": {"enabled": false, "sweary": true, "customDir": "/yok/boyle", "categories": {"fuel": false}}}});
        let (c, _) = cfg_from_settings(&v, None);
        assert!(!c.enabled && c.sweary && c.imperial);
        assert!(!c.on("fuel") && c.on("spotter"));
        // Telsiz kontrolü varsayılan kapalı; işaret yokken kayıtlı "açık" sayılmaz, işaretliyken kullanıcının seçimi geçerli
        assert!(!c.on("radio"));
        let old: Value = serde_json::json!({"general": {"voice": {"categories": {"radio": true}}}});
        assert!(!cfg_from_settings(&old, None).0.on("radio"));
        let new: Value = serde_json::json!({"general": {"voice": {"radioOffV1": true, "categories": {"radio": true}}}});
        assert!(cfg_from_settings(&new, None).0.on("radio"));
        assert!(c.pack_root.is_none());
        let (d, _) = cfg_from_settings(&serde_json::json!({}), None);
        assert!(d.enabled && d.sessions.race);
    }
}
