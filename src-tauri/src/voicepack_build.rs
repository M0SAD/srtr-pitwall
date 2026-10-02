//! Ses paketi yazarları için araçlar: şablon, eksik kontrolü ve paket oluşturma.
//!
//! - `voice_pack_template(out_dir, language)`: mühendisin kullandığı her ifade için klasör ve içinde METIN.txt
//!   (ne söylenmeli, ne zaman çalar, kaç kayıt önerilir, kayıt ipuçları) + kökte README.txt ve pack.json.
//! - `voice_pack_check(dir)`: kategori kategori kaydedilen / eksik / bilinmeyen ifadeler ve hatalı dosyalar.
//! - `voice_pack_build(src_dir, out_path, meta, convert)`: klasörü (isteğe bağlı WAV → OGG Vorbis, mono) zip'e
//!   çevirir, pack.json yazar. İlerleme: "voicepack-build-progress" {done, total, stage: scan|convert|zip|done|error}.

use crate::voicepack::{self, PackMeta, CATALOG_JSON};
use crate::voicepack_dl::{cancel_done, cancel_flag, io_err, valid_id};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const BUILD_ID: &str = "__build";

#[derive(Deserialize, Clone, Debug)]
pub struct CatalogEntry {
    pub key: String,
    #[serde(default)]
    pub files: u32,
    #[serde(default)]
    pub used: bool,
    #[serde(default)]
    pub trigger_tr: String,
    #[serde(default)]
    pub trigger_en: String,
    #[serde(default)]
    pub say_tr: String,
    #[serde(default)]
    pub say_en: String,
}

pub fn catalog() -> Vec<CatalogEntry> {
    serde_json::from_str(CATALOG_JSON).unwrap_or_default()
}

/// Kaydedilmesi isteğe bağlı ifade: mühendis yoksa parçalardan kurar
/// (numbers/1point5seconds → "1" + "nokta 5" + "saniye"; numbers/1_23 → "1" + "23"; position/p5 → "5").
pub fn optional(key: &str) -> bool {
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if let Some(n) = key.strip_prefix("numbers/") {
        let n = n.strip_suffix("seconds").unwrap_or(n);
        if let Some((a, b)) = n.split_once("point") {
            // "point5" tek başına zorunlu; "1point5", "point5seconds" isteğe bağlı
            return (digits(a) && b.len() == 1 && digits(b)) || (a.is_empty() && key.ends_with("seconds") && digits(b));
        }
        if let Some((a, b)) = n.split_once('_') {
            return digits(a) && b.len() == 2 && digits(b);
        }
        return false;
    }
    if let Some(p) = key.strip_prefix("position/p") {
        return digits(p);
    }
    false
}

fn is_audio(p: &Path) -> bool {
    voicepack::is_audio(p)
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn subdirs(p: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(p)
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().is_dir())
                .filter_map(|e| e.file_name().to_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

fn files_in(p: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(p)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect())
        .unwrap_or_default();
    v.sort();
    v
}

/// Sistem dosyaları (sessizce yok sayılır)
fn ignorable(p: &Path) -> bool {
    let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_ascii_lowercase();
    n == "desktop.ini" || n == "thumbs.db" || n == ".ds_store" || n.starts_with("._")
}

fn is_text(p: &Path) -> bool {
    matches!(ext_of(p).as_str(), "txt" | "md")
}

/// UTF-8 BOM + Windows satır sonları (Not Defteri düzgün göstersin)
fn write_txt(path: &Path, text: &str) -> std::io::Result<()> {
    let body = text.replace("\r\n", "\n").replace('\n', "\r\n");
    let mut f = std::fs::File::create(path)?;
    f.write_all(b"\xEF\xBB\xBF")?;
    f.write_all(body.as_bytes())
}

// ---------------------------------------------------------------------------
// Şablon
// ---------------------------------------------------------------------------

const TIPS_TR: &str = "KAYIT İPUÇLARI
  - Biçim: WAV, mono, 44.1 kHz ya da 48 kHz, 16 bit.
  - Müzik, efekt, telsiz cızırtısı ve arka plan gürültüsü olmasın; sessiz bir odada kaydet.
  - Tüm kayıtlarda ses düzeyi aynı olsun (mikrofona hep aynı uzaklıkta konuş, kırpılma olmasın).
  - Başta ve sonda uzun sessizlik bırakma (en fazla ~0,1 saniye).
  - Doğal, net ve yarış mühendisi gibi kısa konuş.
  - Dosya adları: 1.wav, 2.wav, 3.wav … (bu METIN.txt dosyası klasörde kalabilir).";

const TIPS_EN: &str = "RECORDING TIPS
  - Format: WAV, mono, 44.1 kHz or 48 kHz, 16-bit.
  - No music, effects, radio noise or background noise; record in a quiet room.
  - Keep the same level in every recording (same distance to the mic, no clipping).
  - Don't leave long silence at the start or end (at most ~0.1 s).
  - Speak naturally, clearly and briefly, like a race engineer.
  - File names: 1.wav, 2.wav, 3.wav … (this METIN.txt file can stay in the folder).";

fn metin(e: &CatalogEntry) -> String {
    let n = e.files.clamp(1, 3);
    let opt = optional(&e.key);
    let num = e.key.starts_with("numbers/");
    let mut s = String::new();
    s += &format!("SRTR Pitwall — {}\n", e.key);
    s += "==================================================\n\n";
    s += "[TÜRKÇE]\n\n";
    s += "NE SÖYLENMELİ (kendi dilinde):\n";
    s += &format!("  Türkçe örnek: \"{}\"\n", e.say_tr);
    s += &format!("  English:      \"{}\"\n", e.say_en);
    if num {
        s += "  Bu bir sayı klasörü: klasör adındaki sayıyı/ifadeyi kendi dilinde, tek başına söyle.\n";
    }
    s += "\nNE ZAMAN ÇALAR:\n";
    s += &format!("  {}\n\n", e.trigger_tr);
    s += "KAÇ KAYIT:\n";
    s += &format!(
        "  En az 1, önerilen {n} farklı kayıt ({}). Mühendis her seferinde birini rastgele seçer;\n  aynı cümleyi biraz farklı tonlarda söylersen daha doğal olur.\n",
        (1..=n).map(|i| format!("{i}.wav")).collect::<Vec<_>>().join(", ")
    );
    if opt {
        s += "  İSTEĞE BAĞLI: kaydetmezsen mühendis bunu parçalardan kurar (ör. \"1\" + \"nokta 5\" + \"saniye\").\n  Kaydedersen daha akıcı olur.\n";
    }
    s += "\n";
    s += TIPS_TR;
    s += "\n\n--------------------------------------------------\n\n[ENGLISH]\n\n";
    s += "WHAT TO SAY (in your language):\n";
    s += &format!("  English:         \"{}\"\n", e.say_en);
    s += &format!("  Turkish example: \"{}\"\n", e.say_tr);
    if num {
        s += "  This is a number folder: say the number/phrase in the folder name on its own, in your language.\n";
    }
    s += "\nWHEN IT PLAYS:\n";
    s += &format!("  {}\n\n", e.trigger_en);
    s += "HOW MANY RECORDINGS:\n";
    s += &format!(
        "  At least 1, {n} different takes recommended ({}). The engineer picks one at random each time;\n  saying it in slightly different tones sounds more natural.\n",
        (1..=n).map(|i| format!("{i}.wav")).collect::<Vec<_>>().join(", ")
    );
    if opt {
        s += "  OPTIONAL: if you skip it the engineer builds it from parts (e.g. \"1\" + \"point 5\" + \"seconds\").\n  Recording it sounds smoother.\n";
    }
    s += "\n";
    s += TIPS_EN;
    s += "\n";
    s
}

const NUMBERS_TR: &str = r#"SAYILAR (numbers) — nasıl kaydedilir
==================================================

[TÜRKÇE]

Her klasör tek bir sayı ya da sayı parçasıdır; klasörün içindeki METIN.txt ne söyleneceğini yazar.
Mühendis süreleri, araları, turları ve sıraları bu parçaları art arda çalarak söyler.

ZORUNLU (bunlar olmadan sayı okunamaz):
  0 … 99          tek başına sayı ("yedi", "kırk iki")
  01 … 09         tur süresinde saniye ("bir dakika sıfır beş" → "sıfır beş")
  point0 … point9 ondalık ("nokta beş")
  hundred, thousand, second, seconds, minute, minutes, zerozero

İSTEĞE BAĞLI (kaydedilirse daha akıcı, yoksa parçalardan kurulur):
  1point5, 12point3 …           "bir nokta beş" tek kayıtta
  1point5seconds, point3seconds  "bir nokta beş saniye" tek kayıtta
  1_23 …                         tur süresi "bir yirmi üç" tek kayıtta
  position/p1 … (sıra klasörleri) yoksa sayı okunur

İpucu: önce zorunlu sayıları kaydet, uygulamadaki "Eksik kontrolü" ile dene, sonra isteğe bağlılara geç.

--------------------------------------------------

[ENGLISH]

Each folder is a single number or number part; the METIN.txt inside says what to say.
The engineer reads times, gaps, laps and positions by playing these parts one after another.

REQUIRED (numbers can't be read without these):
  0 … 99          the number on its own ("seven", "forty-two")
  01 … 09         seconds in lap times ("one oh five" → "oh five")
  point0 … point9 decimals ("point five")
  hundred, thousand, second, seconds, minute, minutes, zerozero

OPTIONAL (smoother if recorded, otherwise built from parts):
  1point5, 12point3 …           "one point five" in a single take
  1point5seconds, point3seconds  "one point five seconds" in a single take
  1_23 …                         lap time "one twenty-three" in a single take
  position/p1 … (position folders) otherwise the number is read

Tip: record the required numbers first, try them with "Missing check" in the app, then do the optional ones.
"#;

const README: &str = r#"SRTR Pitwall — Ses paketi şablonu / Voice pack template
======================================================

[TÜRKÇE]

Bu klasör SRTR Pitwall sesli mühendisi için kendi dilinde ses paketi hazırlaman içindir.
Her klasör mühendisin söylediği bir ifadedir: kategori/ifade/ (ör. spotter/car_left/).
Her ifade klasöründe METIN.txt var: ne söyleneceği (Türkçe ve İngilizce örnek), ne zaman çaldığı ve
kaç farklı kayıt önerildiği yazar. numbers/OKUBENI.txt sayıların nasıl kaydedileceğini anlatır.

ADIMLAR
  1) Kayıtları yap: her klasöre 1.wav, 2.wav … adıyla kayıtlarını koy (WAV, mono, 44.1/48 kHz, 16 bit).
     Kayıt yapmadığın klasörler boş kalabilir; o ifade söylenmez.
  2) SRTR Pitwall → Sesli Mühendis → "Kendi dilinde ses paketi yap" → "Eksik kontrolü":
     bu klasörü seç, eksikleri ve hatalı dosyaları gör. "Bu klasörü dene" ile oyunda dinleyebilirsin.
  3) "Ses paketi oluştur": paket bilgilerini (ad, dil, yazar, sürüm) yaz; uygulama kayıtları OGG'ye
     çevirip (yaklaşık 10 kat küçülür) tek bir zip dosyası yapar.
  4) Zip'i WeTransfer, Google Drive, Dropbox ya da benzeri bir yere yükle ve paylaşım bağlantısını al.
  5) "Paketimi gönder" formuna dili, paket adını ve bağlantıyı yaz. Paket incelenip uygunsa
     herkesin indirebileceği paketler listesine eklenir; durumu aynı yerden takip edebilirsin.

Teşekkürler!

------------------------------------------------------

[ENGLISH]

This folder is for making a voice pack in your own language for the SRTR Pitwall voice engineer.
Every folder is one phrase the engineer says: category/phrase/ (e.g. spotter/car_left/).
Each phrase folder has a METIN.txt: what to say (Turkish and English example), when it plays and
how many different takes are recommended. numbers/OKUBENI.txt explains how to record numbers.

STEPS
  1) Record: put your takes in each folder as 1.wav, 2.wav … (WAV, mono, 44.1/48 kHz, 16-bit).
     Folders you don't record can stay empty; that phrase simply won't be said.
  2) SRTR Pitwall → Voice Engineer → "Make a voice pack in your language" → "Missing check":
     pick this folder and see what's missing or invalid. "Try this folder" lets you hear it in-game.
  3) "Build voice pack": enter the pack info (name, language, author, version); the app converts the
     recordings to OGG (about 10x smaller) and makes a single zip file.
  4) Upload the zip to WeTransfer, Google Drive, Dropbox or similar and copy the share link.
  5) Fill in the "Send my pack" form with the language, pack name and link. After review, the pack is
     added to the list everyone can download; you can follow its status in the same place.

Thank you!
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateResult {
    pub path: String,
    pub phrases: usize,
    pub optional: usize,
}

fn lang_ok(l: &str) -> bool {
    let mut parts = l.split('-');
    let first = parts.next().unwrap_or("");
    (2..=3).contains(&first.len())
        && first.chars().all(|c| c.is_ascii_alphabetic())
        && parts.all(|p| (2..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

pub fn make_template(out_dir: &Path, language: &str) -> Result<TemplateResult, String> {
    let language = language.trim();
    if !lang_ok(language) {
        return Err("Geçersiz dil kodu (ör. de, fr, pt-BR)".into());
    }
    if !out_dir.is_dir() {
        return Err("Klasör bulunamadı".into());
    }
    let root = out_dir.join(format!("{}-sablon", language.to_ascii_lowercase()));
    std::fs::create_dir_all(&root).map_err(io_err)?;
    let (mut phrases, mut opt) = (0, 0);
    for e in catalog().iter().filter(|e| e.used) {
        if e.key.split('/').count() != 2 || e.key.contains("..") {
            continue;
        }
        let d = root.join(&e.key);
        std::fs::create_dir_all(&d).map_err(io_err)?;
        write_txt(&d.join("METIN.txt"), &metin(e)).map_err(io_err)?;
        phrases += 1;
        if optional(&e.key) {
            opt += 1;
        }
    }
    write_txt(&root.join("numbers").join("OKUBENI.txt"), NUMBERS_TR).map_err(io_err)?;
    write_txt(&root.join("README.txt"), README).map_err(io_err)?;
    let pj = root.join("pack.json");
    if !pj.exists() {
        let meta = PackMeta {
            id: format!("{}-yeni", language.to_ascii_lowercase()),
            name: String::new(),
            language: language.to_string(),
            author: String::new(),
            version: "1".into(),
            format: "wav".into(),
        };
        std::fs::write(&pj, serde_json::to_string_pretty(&meta).unwrap_or_default()).map_err(io_err)?;
    }
    Ok(TemplateResult { path: root.display().to_string(), phrases, optional: opt })
}

#[tauri::command]
pub async fn voice_pack_template(out_dir: String, language: String) -> Result<TemplateResult, String> {
    tauri::async_runtime::spawn_blocking(move || make_template(Path::new(&out_dir), &language))
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Eksik kontrolü
// ---------------------------------------------------------------------------

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatReport {
    pub name: String,
    /// Zorunlu (mühendisin kullandığı, parçalardan kurulamayan) ifade sayısı
    pub required: usize,
    pub recorded: usize,
    pub optional: usize,
    pub optional_recorded: usize,
    /// Eksik zorunlu ifadeler ("kategori/ifade")
    pub missing: Vec<String>,
    /// Katalogda olmayan ya da mühendisin kullanmadığı klasörler (kaydı olanlar)
    pub extra: Vec<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckReport {
    pub root: String,
    pub meta: Option<PackMeta>,
    pub required: usize,
    pub recorded: usize,
    pub optional: usize,
    pub optional_recorded: usize,
    pub files: usize,
    pub categories: Vec<CatReport>,
    /// Katalogda olmayan kategori klasörleri
    pub extra_categories: Vec<String>,
    /// Desteklenmeyen ya da bozuk dosyalar (göreli yol + sebep)
    pub invalid: Vec<String>,
    pub warnings: Vec<String>,
    /// Kaydı olan ifadeler (deneme listesi için)
    pub recorded_keys: Vec<String>,
}

#[derive(Default)]
struct AudioStats {
    rates: BTreeMap<u32, usize>,
    stereo: usize,
}

/// WAV başlığını denetle; sorun varsa sebebi
fn check_wav(p: &Path, st: &mut AudioStats) -> Option<String> {
    match hound::WavReader::open(p) {
        Ok(r) => {
            let s = r.spec();
            *st.rates.entry(s.sample_rate).or_default() += 1;
            if s.channels > 1 {
                st.stereo += 1;
            }
            if r.duration() == 0 {
                return Some("boş kayıt".into());
            }
            None
        }
        Err(e) => Some(format!("okunamayan WAV ({e})")),
    }
}

fn check_ogg(p: &Path) -> Option<String> {
    let mut b = [0u8; 4];
    match std::fs::File::open(p).and_then(|mut f| f.read_exact(&mut b)) {
        Ok(()) if &b == b"OggS" => None,
        _ => Some("okunamayan OGG".into()),
    }
}

pub fn check(dir: &Path) -> Result<CheckReport, String> {
    if !dir.is_dir() {
        return Err("Klasör bulunamadı".into());
    }
    let root = voicepack::find_root(dir).unwrap_or_else(|| dir.to_path_buf());
    let cat = catalog();
    let known: HashMap<&str, &CatalogEntry> = cat.iter().map(|e| (e.key.as_str(), e)).collect();
    let mut cats: BTreeMap<String, CatReport> = BTreeMap::new();
    for e in cat.iter().filter(|e| e.used) {
        let (c, _) = e.key.split_once('/').unwrap_or((&e.key, ""));
        let r = cats.entry(c.to_string()).or_insert_with(|| CatReport { name: c.to_string(), ..Default::default() });
        if optional(&e.key) {
            r.optional += 1;
        } else {
            r.required += 1;
        }
    }
    let mut rep = CheckReport { root: root.display().to_string(), ..Default::default() };
    if root.join("pack.json").is_file() {
        rep.meta = Some(voicepack::read_meta(&root));
    }
    let mut st = AudioStats::default();
    let mut present: HashSet<String> = HashSet::new();
    let mut empty_unused = 0usize;
    for c in subdirs(&root) {
        let cdir = root.join(&c);
        let known_cat = cats.contains_key(&c) || cat.iter().any(|e| e.key.starts_with(&format!("{c}/")));
        if !known_cat {
            rep.extra_categories.push(c.clone());
        }
        for f in files_in(&cdir) {
            if !ignorable(&f) && !is_text(&f) {
                rep.invalid.push(format!("{c}/{}: ifade klasörünün dışında dosya", f.file_name().unwrap_or_default().to_string_lossy()));
            }
        }
        for ph in subdirs(&cdir) {
            let key = format!("{c}/{ph}");
            let pdir = cdir.join(&ph);
            let mut n = 0;
            for f in files_in(&pdir) {
                let name = f.file_name().unwrap_or_default().to_string_lossy().into_owned();
                if ignorable(&f) || is_text(&f) {
                    continue;
                }
                if !is_audio(&f) {
                    rep.invalid.push(format!("{key}/{name}: desteklenmeyen dosya (sadece .wav / .ogg)"));
                    continue;
                }
                let bad = if ext_of(&f) == "wav" { check_wav(&f, &mut st) } else { check_ogg(&f) };
                if let Some(b) = bad {
                    rep.invalid.push(format!("{key}/{name}: {b}"));
                    continue;
                }
                n += 1;
            }
            for sub in subdirs(&pdir) {
                rep.invalid.push(format!("{key}/{sub}/: fazladan alt klasör (kayıtlar doğrudan ifade klasöründe olmalı)"));
            }
            rep.files += n;
            let used = known.get(key.as_str()).map(|e| e.used).unwrap_or(false);
            if n == 0 {
                if !used {
                    empty_unused += 1;
                }
                continue;
            }
            present.insert(key.clone());
            rep.recorded_keys.push(key.clone());
            if !used {
                let r = cats.entry(c.clone()).or_insert_with(|| CatReport { name: c.clone(), ..Default::default() });
                r.extra.push(key);
            }
        }
    }
    for e in cat.iter().filter(|e| e.used) {
        let (c, _) = e.key.split_once('/').unwrap_or((&e.key, ""));
        let r = cats.get_mut(c).unwrap();
        let has = present.contains(&e.key);
        match (optional(&e.key), has) {
            (true, true) => r.optional_recorded += 1,
            (true, false) => {}
            (false, true) => r.recorded += 1,
            (false, false) => r.missing.push(e.key.clone()),
        }
    }
    for r in cats.values() {
        rep.required += r.required;
        rep.recorded += r.recorded;
        rep.optional += r.optional;
        rep.optional_recorded += r.optional_recorded;
    }
    rep.categories = cats.into_values().collect();
    // Uyarılar
    if empty_unused > 0 {
        rep.warnings.push(format!("{empty_unused} boş klasör mühendisin kullanmadığı ifadelere ait (sorun değil)."));
    }
    let odd: Vec<String> = st
        .rates
        .iter()
        .filter(|(r, _)| !(22050..=48000).contains(*r))
        .map(|(r, n)| format!("{r} Hz ({n})"))
        .collect();
    if !odd.is_empty() {
        rep.warnings.push(format!("Alışılmadık örnekleme hızı: {} — 44.1 kHz ya da 48 kHz önerilir.", odd.join(", ")));
    }
    if st.rates.len() > 1 {
        let all: Vec<String> = st.rates.iter().map(|(r, n)| format!("{r} Hz × {n}")).collect();
        rep.warnings.push(format!("Kayıtlar farklı örnekleme hızlarında: {}.", all.join(", ")));
    }
    if st.stereo > 0 {
        rep.warnings.push(format!("{} kayıt stereo; paket oluşturulurken OGG dönüşümü açıksa mono yapılır.", st.stereo));
    }
    if rep.invalid.len() > 500 {
        let n = rep.invalid.len();
        rep.invalid.truncate(500);
        rep.warnings.push(format!("{n} hatalı dosyanın ilk 500 tanesi gösteriliyor."));
    }
    Ok(rep)
}

#[tauri::command]
pub async fn voice_pack_check(dir: String) -> Result<CheckReport, String> {
    tauri::async_runtime::spawn_blocking(move || check(Path::new(&dir)))
        .await
        .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// Paket oluşturma
// ---------------------------------------------------------------------------

#[derive(Deserialize, Clone, Debug)]
pub struct BuildMeta {
    pub id: String,
    pub name: String,
    pub language: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub version: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    pub phrases: usize,
    pub files: usize,
    pub input_bytes: u64,
    pub converted: usize,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Clone)]
struct BuildProgress {
    done: usize,
    total: usize,
    stage: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

struct Job {
    /// Zip içindeki yol ("spotter/car_left/1.ogg")
    out: String,
    src: PathBuf,
    convert: bool,
}

/// WAV → mono OGG Vorbis (konuşma için kalite ~0.4 ≈ 60-70 kbit/s)
pub fn wav_to_ogg(path: &Path, serial: i32) -> Result<Vec<u8>, String> {
    let mut r = hound::WavReader::open(path).map_err(|e| e.to_string())?;
    let spec = r.spec();
    let ch = spec.channels.max(1) as usize;
    let inter: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => r.samples::<f32>().collect::<Result<_, _>>().map_err(|e| e.to_string())?,
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => {
            let scale = 1.0 / (1u32 << (spec.bits_per_sample.max(1) - 1)) as f32;
            r.samples::<i16>()
                .map(|s| s.map(|v| v as f32 * scale))
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string())?
        }
        hound::SampleFormat::Int => {
            let scale = 1.0 / (1u64 << (spec.bits_per_sample.min(32) - 1)) as f32;
            r.samples::<i32>()
                .map(|s| s.map(|v| v as f32 * scale))
                .collect::<Result<_, _>>()
                .map_err(|e| e.to_string())?
        }
    };
    let mono: Vec<f32> = inter
        .chunks(ch)
        .map(|c| (c.iter().sum::<f32>() / ch as f32).clamp(-1.0, 1.0))
        .collect();
    if mono.is_empty() {
        return Err("boş kayıt".into());
    }
    let rate = std::num::NonZeroU32::new(spec.sample_rate).ok_or("geçersiz örnekleme hızı")?;
    let mut out = Vec::with_capacity(mono.len() / 8);
    {
        let mut enc = vorbis_rs::VorbisEncoderBuilder::new_with_serial(rate, std::num::NonZeroU8::new(1).unwrap(), &mut out, serial)
            .bitrate_management_strategy(vorbis_rs::VorbisBitrateManagementStrategy::QualityVbr { target_quality: 0.4 })
            .build()
            .map_err(|e| e.to_string())?;
        for block in mono.chunks(4096) {
            enc.encode_audio_block([block]).map_err(|e| e.to_string())?;
        }
        enc.finish().map_err(|e| e.to_string())?;
    }
    Ok(out)
}

fn serial_of(s: &str) -> i32 {
    let h = Sha256::digest(s.as_bytes());
    i32::from_le_bytes([h[0], h[1], h[2], h[3]])
}

pub fn build(
    src: &Path,
    out_path: &Path,
    meta: &BuildMeta,
    convert: bool,
    cancel: &AtomicBool,
    progress: &(dyn Fn(usize, usize, &'static str) + Sync),
) -> Result<BuildResult, String> {
    if !valid_id(meta.id.trim()) {
        return Err("Paket kimliği sadece harf, rakam, - _ . içerebilir (ör. de-hans)".into());
    }
    if meta.name.trim().is_empty() {
        return Err("Paket adı gerekli".into());
    }
    if !lang_ok(meta.language.trim()) {
        return Err("Geçersiz dil kodu (ör. de, fr, pt-BR)".into());
    }
    let root = voicepack::find_root(src).ok_or("Klasörde ses paketi düzeni bulunamadı (spotter, numbers… klasörleri)")?;
    if out_path.starts_with(&root) {
        return Err("Zip dosyasını paket klasörünün dışına kaydet".into());
    }
    progress(0, 0, "scan");
    let mut warnings = Vec::new();
    let mut jobs: Vec<Job> = Vec::new();
    let mut texts: Vec<(String, PathBuf)> = Vec::new();
    let mut taken: HashSet<String> = HashSet::new();
    let (mut empty, mut unsupported, mut dup) = (0usize, 0usize, 0usize);
    let mut phrases = 0usize;
    let mut input_bytes = 0u64;
    for c in subdirs(&root) {
        let cdir = root.join(&c);
        for ph in subdirs(&cdir) {
            let pdir = cdir.join(&ph);
            let mut n = 0;
            for f in files_in(&pdir) {
                let name = f.file_name().unwrap_or_default().to_string_lossy().into_owned();
                if ignorable(&f) {
                    continue;
                }
                if is_text(&f) {
                    texts.push((format!("{c}/{ph}/{name}"), f));
                    continue;
                }
                if !is_audio(&f) {
                    unsupported += 1;
                    continue;
                }
                let conv = convert && ext_of(&f) == "wav";
                let stem = f.file_stem().unwrap_or_default().to_string_lossy().into_owned();
                let out_name = if conv { format!("{stem}.ogg") } else { name.clone() };
                let out = format!("{c}/{ph}/{out_name}");
                if !taken.insert(out.to_ascii_lowercase()) {
                    dup += 1;
                    continue;
                }
                input_bytes += f.metadata().map(|m| m.len()).unwrap_or(0);
                jobs.push(Job { out, src: f, convert: conv });
                n += 1;
            }
            if n == 0 {
                empty += 1;
            } else {
                phrases += 1;
            }
        }
    }
    // Kök ve kategori düzeyindeki metinler (README, OKUBENI)
    for f in files_in(&root).into_iter().filter(|f| is_text(f)) {
        texts.push((f.file_name().unwrap_or_default().to_string_lossy().into_owned(), f));
    }
    for c in subdirs(&root) {
        for f in files_in(&root.join(&c)).into_iter().filter(|f| is_text(f)) {
            texts.push((format!("{c}/{}", f.file_name().unwrap_or_default().to_string_lossy()), f));
        }
    }
    if jobs.is_empty() {
        return Err("Klasörde hiç kayıt yok".into());
    }
    if empty > 0 {
        warnings.push(format!("{empty} ifade klasörü boş (pakete eklenmedi)."));
    }
    if unsupported > 0 {
        warnings.push(format!("{unsupported} desteklenmeyen dosya atlandı (sadece .wav / .ogg)."));
    }
    if dup > 0 {
        warnings.push(format!("{dup} kayıt aynı adda başka bir kayıtla çakıştığı için atlandı (ör. 1.wav ve 1.ogg)."));
    }

    let total = jobs.len();
    let any_wav_left = jobs.iter().any(|j| !j.convert && j.out.to_ascii_lowercase().ends_with(".wav"));
    let any_ogg = jobs.iter().any(|j| j.convert || j.out.to_ascii_lowercase().ends_with(".ogg"));
    let format = match (any_wav_left, any_ogg) {
        (true, true) => "mixed",
        (false, true) => "ogg",
        _ => "wav",
    };
    let pack = PackMeta {
        id: meta.id.trim().to_string(),
        name: meta.name.trim().to_string(),
        language: meta.language.trim().to_string(),
        author: meta.author.trim().to_string(),
        version: if meta.version.trim().is_empty() { "1".into() } else { meta.version.trim().to_string() },
        format: format.into(),
    };

    let part = PathBuf::from(format!("{}.part", out_path.display()));
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(io_err)?;
    }
    let file = std::fs::File::create(&part).map_err(io_err)?;
    let mut zw = zip::ZipWriter::new(std::io::BufWriter::new(file));
    let deflate = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    let stored = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(true);

    let result = (|| -> Result<(usize, usize), String> {
        zw.start_file("pack.json", deflate).map_err(|e| e.to_string())?;
        zw.write_all(serde_json::to_string_pretty(&pack).unwrap_or_default().as_bytes()).map_err(io_err)?;
        for (name, p) in &texts {
            let data = std::fs::read(p).map_err(io_err)?;
            zw.start_file(name.as_str(), deflate).map_err(|e| e.to_string())?;
            zw.write_all(&data).map_err(io_err)?;
        }
        // Dönüştürme paralel; zip'e yazma bu iş parçacığında
        let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 12);
        let next = AtomicUsize::new(0);
        let (tx, rx) = std::sync::mpsc::sync_channel::<(usize, Result<Vec<u8>, String>, bool)>(workers * 2);
        let jobs_ref = &jobs;
        let mut converted = 0usize;
        let mut failed: Vec<String> = Vec::new();
        let res = std::thread::scope(|s| -> Result<(), String> {
            for _ in 0..workers {
                let tx = tx.clone();
                let next = &next;
                s.spawn(move || loop {
                    if cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    let Some(j) = jobs_ref.get(i) else { break };
                    let r = if j.convert {
                        match wav_to_ogg(&j.src, serial_of(&j.out)) {
                            Ok(d) => Ok((d, true)),
                            // Dönüştürülemeyen WAV olduğu gibi eklenmez (adı .ogg); hata olarak bildirilir
                            Err(e) => Err(e),
                        }
                    } else {
                        std::fs::read(&j.src).map(|d| (d, false)).map_err(io_err)
                    };
                    let msg = match r {
                        Ok((d, c)) => (i, Ok(d), c),
                        Err(e) => (i, Err(e), false),
                    };
                    if tx.send(msg).is_err() {
                        break;
                    }
                });
            }
            drop(tx);
            let mut done = 0usize;
            let mut last = Instant::now();
            let stage = if convert { "convert" } else { "zip" };
            progress(0, total, stage);
            for (i, data, was_conv) in rx.iter() {
                if cancel.load(Ordering::Relaxed) {
                    return Err("İptal edildi".into());
                }
                let j = &jobs_ref[i];
                match data {
                    Ok(d) => {
                        let opt = if j.out.to_ascii_lowercase().ends_with(".ogg") { stored } else { deflate };
                        zw.start_file(j.out.as_str(), opt).map_err(|e| e.to_string())?;
                        zw.write_all(&d).map_err(io_err)?;
                        if was_conv {
                            converted += 1;
                        }
                    }
                    Err(e) => failed.push(format!("{}: {e}", j.src.strip_prefix(&root).unwrap_or(&j.src).display())),
                }
                done += 1;
                if last.elapsed() >= Duration::from_millis(150) {
                    last = Instant::now();
                    progress(done, total, stage);
                }
            }
            if cancel.load(Ordering::Relaxed) {
                return Err("İptal edildi".into());
            }
            Ok(())
        });
        res?;
        let n = failed.len();
        if n > 0 {
            let list = failed.into_iter().take(10).collect::<Vec<_>>().join("; ");
            warnings.push(format!("{n} kayıt okunamadı / dönüştürülemedi ve pakete eklenmedi: {list}"));
        }
        Ok((converted, n))
    })();
    let (converted, failed) = match result {
        Ok(x) => x,
        Err(e) => {
            drop(zw);
            let _ = std::fs::remove_file(&part);
            return Err(e);
        }
    };
    let w = zw.finish().map_err(|e| e.to_string())?;
    let mut f = w.into_inner().map_err(|e| e.to_string())?;
    f.flush().map_err(io_err)?;
    drop(f);
    let _ = std::fs::remove_file(out_path);
    std::fs::rename(&part, out_path).map_err(io_err)?;
    progress(total, total, "zip");
    // SHA-256
    let mut h = Sha256::new();
    let mut rf = std::fs::File::open(out_path).map_err(io_err)?;
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = rf.read(&mut buf).map_err(io_err)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    let size = std::fs::metadata(out_path).map(|m| m.len()).unwrap_or(0);
    let files = total - failed;
    Ok(BuildResult {
        path: out_path.display().to_string(),
        size,
        sha256: h.finalize().iter().map(|b| format!("{b:02x}")).collect(),
        phrases,
        files,
        input_bytes,
        converted,
        warnings,
    })
}

#[tauri::command]
pub async fn voice_pack_build(
    app: AppHandle,
    src_dir: String,
    out_path: String,
    meta: BuildMeta,
    convert: bool,
) -> Result<BuildResult, String> {
    let cancel = cancel_flag(BUILD_ID)?;
    let app2 = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let emit = |done: usize, total: usize, stage: &'static str| {
            let _ = app2.emit("voicepack-build-progress", BuildProgress { done, total, stage, error: None });
        };
        build(Path::new(&src_dir), Path::new(&out_path), &meta, convert, &cancel, &emit)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    cancel_done(BUILD_ID);
    let _ = match &res {
        Ok(_) => app.emit("voicepack-build-progress", BuildProgress { done: 1, total: 1, stage: "done", error: None }),
        Err(e) => app.emit("voicepack-build-progress", BuildProgress { done: 0, total: 0, stage: "error", error: Some(e.clone()) }),
    };
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_keys() {
        for k in ["numbers/1point5", "numbers/12point3", "numbers/1point5seconds", "numbers/point3seconds", "numbers/1_23", "position/p5"] {
            assert!(optional(k), "{k}");
        }
        for k in ["numbers/5", "numbers/05", "numbers/point5", "numbers/seconds", "numbers/hundred", "spotter/car_left", "position/leader"] {
            assert!(!optional(k), "{k}");
        }
        // Katalogdaki zorunlu sayılar: 0-99, 01-09, point0-9 ve birkaç kelime
        let req = catalog().into_iter().filter(|e| e.used && e.key.starts_with("numbers/") && !optional(&e.key)).count();
        assert!((110..=140).contains(&req), "{req}");
    }

    fn write_wav(p: &Path, rate: u32, ch: u16, secs: f32) {
        let spec = hound::WavSpec { channels: ch, sample_rate: rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut w = hound::WavWriter::create(p, spec).unwrap();
        let n = (rate as f32 * secs) as usize;
        for i in 0..n {
            let v = ((i as f32 * 440.0 * 2.0 * std::f32::consts::PI / rate as f32).sin() * 12000.0) as i16;
            for _ in 0..ch {
                w.write_sample(v).unwrap();
            }
        }
        w.finalize().unwrap();
    }

    #[test]
    fn template_check_build() {
        let dir = std::env::temp_dir().join(format!("pw_vpbuild_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let t = make_template(&dir, "de").unwrap();
        let root = PathBuf::from(&t.path);
        assert!(root.ends_with("de-sablon"));
        assert!(root.join("spotter/car_left/METIN.txt").is_file());
        assert!(root.join("README.txt").is_file());
        assert!(!root.join("acknowledge/OK").exists()); // kullanılmayan ifade
        let txt = std::fs::read(root.join("spotter/car_left/METIN.txt")).unwrap();
        assert_eq!(&txt[..3], b"\xEF\xBB\xBF");

        // Boş şablon: hiçbir şey kaydedilmemiş
        let r = check(&root).unwrap();
        assert_eq!(r.recorded, 0);
        assert!(r.required > 300);
        // Kayıt ekle
        write_wav(&root.join("spotter/car_left/1.wav"), 44100, 2, 0.5);
        write_wav(&root.join("spotter/car_left/2.wav"), 44100, 1, 0.3);
        write_wav(&root.join("numbers/5/1.wav"), 48000, 1, 0.3);
        std::fs::write(root.join("numbers/5/bad.mp3"), b"x").unwrap();
        std::fs::write(root.join("numbers/7/1.wav"), b"not a wav").unwrap();
        std::fs::create_dir_all(root.join("spotter/unknown_phrase")).unwrap();
        write_wav(&root.join("spotter/unknown_phrase/1.wav"), 44100, 1, 0.1);
        let r = check(&root).unwrap();
        assert_eq!(r.recorded, 2);
        assert_eq!(r.files, 4);
        assert_eq!(r.invalid.len(), 2, "{:?}", r.invalid);
        let sp = r.categories.iter().find(|c| c.name == "spotter").unwrap();
        assert_eq!(sp.extra, vec!["spotter/unknown_phrase".to_string()]);
        assert!(!sp.missing.contains(&"spotter/car_left".to_string()));
        assert!(r.warnings.iter().any(|w| w.contains("stereo")));

        // Paket oluştur (OGG)
        std::fs::remove_file(root.join("numbers/7/1.wav")).unwrap();
        let out = dir.join("out").join("de-test.zip");
        let meta = BuildMeta { id: "de-test".into(), name: "Test".into(), language: "de".into(), author: "A".into(), version: "2".into() };
        let cancel = AtomicBool::new(false);
        let b = build(&root, &out, &meta, true, &cancel, &|_, _, _| {}).unwrap();
        assert_eq!((b.files, b.converted, b.phrases), (4, 4, 3));
        assert!(b.size > 0 && b.sha256.len() == 64);
        let s = crate::voicepack_dl::scan_zip(&out).unwrap();
        assert_eq!((s.prefix.as_str(), s.files, s.format.as_str()), ("", 4, "ogg"));
        assert_eq!((s.meta.id.as_str(), s.meta.version.as_str()), ("de-test", "2"));
        // OGG kodlanmış kayıt rodio (lewton) ile çözülebilmeli
        let f = std::fs::File::open(&out).unwrap();
        let mut z = zip::ZipArchive::new(f).unwrap();
        let mut data = Vec::new();
        z.by_name("spotter/car_left/1.ogg").unwrap().read_to_end(&mut data).unwrap();
        assert_eq!(&data[..4], b"OggS");
        let dec = rodio::Decoder::new(std::io::Cursor::new(data)).unwrap();
        use rodio::Source;
        assert_eq!(dec.channels(), 1);
        assert!(z.by_name("spotter/car_left/METIN.txt").is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
