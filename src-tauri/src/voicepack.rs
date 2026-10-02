//! Ses paketleri (sesli mühendis / spotter).
//!
//! Kurulu paketler `<app_data_dir>/voicepacks/<packId>/` altında durur. Paket klasöründe
//! `pack.json` ({"id","name","language","author","version","format":"wav"|"ogg"}) ve Crew Chief v4
//! düzenindeki kategori klasörleri bulunur: `<kategori>/<ifade>/{1.wav,2.wav,…}`. Test eden ya da kendi
//! sesini kaydeden kullanıcı `general.voice.customDir` ile doğrudan bir klasör de gösterebilir.
//!
//! Bir ifade klasöründeki her dosya aynı ifadenin farklı bir kaydıdır. Crew Chief adlandırması:
//! - `N.wav` düz kayıt,
//! - `N_op_prefix_ok.wav`, `N_prefix_come_on.wav` … başında ek söz ("tamam, …") olan kayıt: sadece
//!   mesajın ilk parçasıysa kullanılır,
//! - `N_op_suffix_please.wav`, `N_rq_suffix_please.wav` … sonunda ek söz olan kayıt: sadece mesajın
//!   son parçasıysa kullanılır,
//! - `sweary_N.wav` argo kayıt: sadece "Argo ifadeler" açıksa,
//! - `N_male.wav` cinsiyetli kayıt: normal kayıt sayılır.
//!
//! Sayılar (`numbers/…`) paketteki klasörlerden birleştirilir; bkz. [`compose`].

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Ses dosyası uzantısı mı (wav / ogg)
pub fn is_audio(p: &Path) -> bool {
    p.extension()
        .and_then(|x| x.to_str())
        .map(|x| x.eq_ignore_ascii_case("wav") || x.eq_ignore_ascii_case("ogg"))
        .unwrap_or(false)
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

fn audio_files(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .map(|e| e.path())
                .filter(|p| p.is_file() && is_audio(p))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

// ---------------------------------------------------------------------------
// Paket bilgisi ve konum
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct PackMeta {
    pub id: String,
    pub name: String,
    pub language: String,
    pub author: String,
    #[serde(deserialize_with = "str_or_num")]
    pub version: String,
    pub format: String,
}

/// pack.json'da sürüm "2" ya da 2 olarak yazılmış olabilir
fn str_or_num<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::String(s) => s,
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPack {
    pub id: String,
    pub name: String,
    pub language: String,
    pub author: String,
    pub version: String,
    pub path: String,
    pub phrases: usize,
    pub files: usize,
}

/// Paket kurulunca / silinince artar: ses motoru kayıt önbelleğini yeniler
pub static PACK_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Kurulu paketlerin klasörü: `<app_data_dir>/voicepacks`
pub fn voicepacks_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path().app_data_dir().ok().map(|d| d.join("voicepacks"))
}

/// Paketin olmazsa olmaz kategorilerinden biri var mı
fn looks_like_pack(dir: &Path) -> bool {
    ["spotter", "numbers", "position", "flags", "lap_counter"]
        .iter()
        .any(|c| dir.join(c).is_dir())
}

/// Verilen klasörde ya da en fazla iki alt düzeyinde (ör. "turkce/Erkin Azcan") paket kökünü bul
pub fn find_root(dir: &Path) -> Option<PathBuf> {
    if looks_like_pack(dir) {
        return Some(dir.to_path_buf());
    }
    for a in subdirs(dir) {
        let d = dir.join(&a);
        if looks_like_pack(&d) {
            return Some(d);
        }
        for b in subdirs(&d) {
            let e = d.join(&b);
            if looks_like_pack(&e) {
                return Some(e);
            }
        }
    }
    None
}

/// pack.json'u oku; yoksa klasör adından üret
pub fn read_meta(dir: &Path) -> PackMeta {
    let folder = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let mut m: PackMeta = std::fs::read_to_string(dir.join("pack.json"))
        .ok()
        .and_then(|t| serde_json::from_str(t.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default();
    if m.id.is_empty() {
        m.id = folder.clone();
    }
    if m.name.is_empty() {
        m.name = folder;
    }
    if m.format.is_empty() {
        m.format = "wav".into();
    }
    m
}

/// (ifade klasörü, kayıt) sayıları
pub fn count(root: &Path) -> (usize, usize) {
    let (mut phrases, mut files) = (0, 0);
    for cat in subdirs(root) {
        let c = root.join(&cat);
        for ph in subdirs(&c) {
            let n = audio_files(&c.join(ph)).len();
            if n > 0 {
                phrases += 1;
                files += n;
            }
        }
    }
    (phrases, files)
}

/// `base` (voicepacks) altındaki kurulu paketler
pub fn installed(base: &Path) -> Vec<InstalledPack> {
    let mut out = Vec::new();
    for id in subdirs(base) {
        let dir = base.join(&id);
        let Some(root) = find_root(&dir) else {
            continue;
        };
        let mut meta = read_meta(&dir);
        meta.id = id.clone();
        let (phrases, files) = count(&root);
        out.push(InstalledPack {
            id,
            name: meta.name,
            language: meta.language,
            author: meta.author,
            version: meta.version,
            path: root.display().to_string(),
            phrases,
            files,
        });
    }
    out
}

/// Ayarlara göre kullanılacak paket kökü. Sıra: özel klasör → seçili paket → ilk kurulu paket.
pub fn resolve(
    base: Option<&Path>,
    pack_id: &str,
    custom_dir: &str,
) -> Option<(PathBuf, PackMeta)> {
    let custom = custom_dir.trim();
    if !custom.is_empty() {
        let dir = PathBuf::from(custom);
        let root = find_root(&dir)?;
        let mut meta = read_meta(&root);
        if !root.join("pack.json").is_file() && dir.join("pack.json").is_file() {
            meta = read_meta(&dir);
        }
        return Some((root, meta));
    }
    let base = base?;
    let pick = |id: &str| -> Option<(PathBuf, PackMeta)> {
        let dir = base.join(id);
        let root = find_root(&dir)?;
        let mut meta = read_meta(&dir);
        meta.id = id.to_string();
        Some((root, meta))
    };
    if !pack_id.trim().is_empty() {
        if let Some(x) = pick(pack_id.trim()) {
            return Some(x);
        }
    }
    subdirs(base).into_iter().find_map(|id| pick(&id))
}

#[tauri::command]
pub fn voice_packs_installed(app: tauri::AppHandle) -> Vec<InstalledPack> {
    voicepacks_dir(&app)
        .map(|d| installed(&d))
        .unwrap_or_default()
}

/// Bir paket klasörünü (verilmezse kurulu paketler klasörünü, yoksa oluşturarak) dosya gezgininde aç
#[tauri::command]
pub fn voice_packs_open_dir(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    if let Some(p) = path.map(PathBuf::from).filter(|p| p.is_dir()) {
        return crate::open_path(&p);
    }
    let d = voicepacks_dir(&app).ok_or("Uygulama veri klasörü bulunamadı")?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    crate::open_path(&d)
}

/// Sahibin ses paketindeki tüm ifade klasörleri: ne zaman çalar, ne söylenmeli, motor kullanıyor mu
pub const CATALOG_JSON: &str = include_str!("voice_catalog.json");

#[tauri::command]
pub fn voice_catalog() -> Value {
    serde_json::from_str(CATALOG_JSON).unwrap_or(Value::Null)
}

/// Katalogdaki "ne söylenmeli" metinleri: anahtar → (Türkçe, İngilizce)
fn say_texts() -> &'static HashMap<String, (String, String)> {
    static MAP: std::sync::OnceLock<HashMap<String, (String, String)>> = std::sync::OnceLock::new();
    MAP.get_or_init(|| {
        let list: Vec<Value> = serde_json::from_str(CATALOG_JSON).unwrap_or_default();
        list.iter()
            .filter_map(|e| {
                let s = |k: &str| e.get(k).and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
                let key = s("key");
                (!key.is_empty()).then(|| (key, (s("say_tr"), s("say_en"))))
            })
            .collect()
    })
}

/// Bir ifadenin altyazı metni. Ses efekti açıklamaları ("(nefes alma sesi)") ve bilinmeyenler None.
fn say_text(key: &str, tr: bool) -> Option<String> {
    let (t, e) = say_texts().get(key)?;
    let s = if tr && !t.is_empty() { t } else if !e.is_empty() { e } else { t };
    (!s.is_empty() && !s.starts_with('(')).then(|| s.clone())
}

/// Mesajın altyazısı: ifadelerin katalog metni, sayılar rakamla ("Öndekiyle ara 1,3 saniye").
/// Dil paket diline göre (`tr`). Ara parçaların sonundaki nokta atılır.
pub fn subtitle(parts: &[Part], tr: bool) -> String {
    let dec = |x: f32| {
        let s = format!("{:.1}", x);
        if tr { s.replace('.', ",") } else { s }
    };
    let mut out: Vec<String> = Vec::new();
    for p in parts {
        let s = match p {
            Part::K(k) => match say_text(k, tr) {
                Some(s) => s,
                None => continue,
            },
            Part::Int(n) => n.to_string(),
            Part::Dec(x) => dec(*x),
            Part::Secs(s) => {
                let s = s.abs().max(0.1);
                if s < 60.0 {
                    format!("{} {}", dec(s), if tr { "saniye" } else if (s - 1.0).abs() < 0.05 { "second" } else { "seconds" })
                } else {
                    let total = s.round() as i64;
                    let (m, r) = (total / 60, total % 60);
                    match (tr, r) {
                        (true, 0) => format!("{m} dakika"),
                        (true, _) => format!("{m} dakika {r} saniye"),
                        (false, 0) => format!("{m} min"),
                        (false, _) => format!("{m} min {r} s"),
                    }
                }
            }
            Part::Lap(t) => {
                let tenths = (t.abs() * 10.0).round() as i64;
                let (m, s, d) = (tenths / 600, (tenths % 600) / 10, tenths % 10);
                if m > 0 { format!("{m}:{s:02}.{d}") } else { format!("{s}.{d}") }
            }
            Part::Pos(n) => say_text(&format!("position/p{n}"), tr).unwrap_or_else(|| format!("P{n}")),
        };
        out.push(s);
    }
    let n = out.len();
    out.iter()
        .enumerate()
        .map(|(i, s)| if i + 1 < n { s.trim_end_matches('.').to_string() } else { s.clone() })
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// Kayıt seçimi
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq)]
pub struct Variant {
    pub path: PathBuf,
    pub sweary: bool,
    /// Başında ek söz var ("tamam, …"): sadece mesajın ilk parçası olabilir
    pub prefix: bool,
    /// Sonunda ek söz var ("…, lütfen"): sadece mesajın son parçası olabilir
    pub suffix: bool,
}

pub fn parse_variant(path: PathBuf) -> Variant {
    let name = path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    Variant {
        sweary: name.starts_with("sweary"),
        prefix: name.contains("prefix"),
        suffix: name.contains("suffix"),
        path,
    }
}

/// Uygun kayıtlar arasından seçim (son çalınanı tekrarlamadan). `r` 0..n arası rastgele sayı üretir.
pub fn choose<'a>(
    list: &'a [Variant],
    first: bool,
    last: bool,
    sweary: bool,
    avoid: Option<&Path>,
    r: &mut dyn FnMut(usize) -> usize,
) -> Option<&'a Variant> {
    let base: Vec<&Variant> = list.iter().filter(|v| sweary || !v.sweary).collect();
    if base.is_empty() {
        return None;
    }
    let mut cand: Vec<&Variant> = base
        .iter()
        .copied()
        .filter(|v| (first || !v.prefix) && (last || !v.suffix))
        .collect();
    if cand.is_empty() {
        cand = base;
    }
    if cand.len() > 1 {
        if let Some(a) = avoid {
            cand.retain(|v| v.path != a);
        }
    }
    let i = r(cand.len());
    cand.get(i).copied()
}

pub struct Pack {
    pub root: PathBuf,
    pub meta: PackMeta,
    pub sweary: bool,
    cache: HashMap<String, Vec<Variant>>,
    last: HashMap<String, PathBuf>,
    rng: u64,
}

impl Pack {
    pub fn open(root: PathBuf, meta: PackMeta) -> Pack {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(7);
        Pack {
            root,
            meta,
            sweary: false,
            cache: HashMap::new(),
            last: HashMap::new(),
            rng: seed | 1,
        }
    }

    pub fn turkish(&self) -> bool {
        self.meta.language.to_ascii_lowercase().starts_with("tr")
    }

    fn load(&mut self, key: &str) -> &Vec<Variant> {
        if !self.cache.contains_key(key) {
            // Anahtar "kategori/ifade"; ".." gibi kaçışlara izin verme
            let ok = key.split('/').count() == 2 && !key.contains("..") && !key.contains('\\');
            let list = if ok {
                audio_files(&self.root.join(key))
                    .into_iter()
                    .map(parse_variant)
                    .collect()
            } else {
                Vec::new()
            };
            self.cache.insert(key.to_string(), list);
        }
        &self.cache[key]
    }

    /// Bu ifadenin (argo ayarına göre) çalınabilir kaydı var mı
    pub fn has(&mut self, key: &str) -> bool {
        let sweary = self.sweary;
        self.load(key).iter().any(|v| sweary || !v.sweary)
    }

    pub fn pick(&mut self, key: &str, first: bool, last: bool) -> Option<PathBuf> {
        let list = self.load(key).clone();
        let avoid = self.last.get(key).cloned();
        let sweary = self.sweary;
        let mut rng = self.rng;
        let mut r = |n: usize| {
            rng ^= rng << 13;
            rng ^= rng >> 7;
            rng ^= rng << 17;
            (rng % n.max(1) as u64) as usize
        };
        let chosen =
            choose(&list, first, last, sweary, avoid.as_deref(), &mut r).map(|v| v.path.clone());
        self.rng = rng;
        if let Some(p) = &chosen {
            self.last.insert(key.to_string(), p.clone());
        }
        chosen
    }

    /// Parçaları dosya yollarına çevir: eksik bir parça varsa hiç söyleme
    pub fn render(&mut self, parts: &[Part]) -> Option<Vec<PathBuf>> {
        let tr = self.turkish();
        let keys = {
            let mut has = |k: &str| self.has(k);
            compose(parts, tr, &mut has)?
        };
        let n = keys.len();
        keys.iter()
            .enumerate()
            .map(|(i, k)| self.pick(k, i == 0, i + 1 == n))
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Mesaj parçaları ve sayı okuma
// ---------------------------------------------------------------------------

/// Bir mesajın parçası. Sayılar paketteki `numbers/…` klasörlerinden birleştirilir.
#[derive(Clone, Debug, PartialEq)]
pub enum Part {
    /// "kategori/ifade"
    K(String),
    /// Tam sayı (negatifse "eksi")
    Int(i64),
    /// Süre farkı, saniyenin onda biri hassasiyetle ("1.3 saniye")
    Secs(f32),
    /// Tur süresi ("1:23.4")
    Lap(f32),
    /// Tek ondalıklı sayı ("2.4"), birim eklenmez
    Dec(f32),
    /// Sıra ("P5"): position/pN yoksa sayı
    Pos(i32),
}

pub fn k(s: &str) -> Part {
    Part::K(s.to_string())
}

/// Parçaları paket anahtarlarına çevirir. `has` paketin o ifadeye sahip olup olmadığını söyler.
/// Bir sayı okunamıyorsa (gereken klasör yok) None.
pub fn compose(parts: &[Part], tr: bool, has: &mut dyn FnMut(&str) -> bool) -> Option<Vec<String>> {
    let mut out = Vec::new();
    for p in parts {
        match p {
            Part::K(s) => {
                if !has(s) {
                    return None;
                }
                out.push(s.clone());
            }
            Part::Int(n) => out.extend(int_keys(*n, tr, has)?),
            Part::Secs(s) => out.extend(seconds_keys(*s, tr, has)?),
            Part::Lap(t) => out.extend(laptime_keys(*t, tr, has)?),
            Part::Dec(x) => out.extend(decimal_keys(*x, tr, has)?),
            Part::Pos(n) => {
                let key = format!("position/p{n}");
                if has(&key) {
                    out.push(key);
                } else {
                    out.extend(int_keys(*n as i64, tr, has)?);
                }
            }
        }
    }
    Some(out)
}

fn need(key: String, has: &mut dyn FnMut(&str) -> bool) -> Option<String> {
    if has(&key) {
        Some(key)
    } else {
        None
    }
}

/// Tam sayı: 0..99 tek klasör; yüzler ve binler "hundred" / "thousand" ile.
/// Türkçede "bir yüz", "bir bin" denmez: 1 atlanır. İngilizcede "one hundred and twenty".
pub fn int_keys(n: i64, tr: bool, has: &mut dyn FnMut(&str) -> bool) -> Option<Vec<String>> {
    if n < 0 {
        let mut v = vec![need("numbers/minus".into(), has)?];
        v.extend(int_keys(-n, tr, has)?);
        return Some(v);
    }
    if n < 100 {
        return Some(vec![need(format!("numbers/{n}"), has)?]);
    }
    if n < 1000 {
        let (h, rest) = (n / 100, n % 100);
        let mut v = Vec::new();
        if !(tr && h == 1) {
            v.push(need(format!("numbers/{h}"), has)?);
        }
        if rest > 0 && !tr && has("numbers/hundred_and") {
            v.push("numbers/hundred_and".into());
        } else {
            v.push(need("numbers/hundred".into(), has)?);
        }
        if rest > 0 {
            v.extend(int_keys(rest, tr, has)?);
        }
        return Some(v);
    }
    if n < 100_000 {
        let (th, rest) = (n / 1000, n % 1000);
        let mut v = Vec::new();
        if !(tr && th == 1) {
            v.extend(int_keys(th, tr, has)?);
        }
        if rest > 0 && rest < 100 && !tr && has("numbers/thousand_and") {
            v.push("numbers/thousand_and".into());
        } else {
            v.push(need("numbers/thousand".into(), has)?);
        }
        if rest > 0 {
            v.extend(int_keys(rest, tr, has)?);
        }
        return Some(v);
    }
    None
}

/// Tek ondalıklı sayı: "2point4" klasörü (0..59), yoksa "2" + "point4"
pub fn decimal_keys(x: f32, tr: bool, has: &mut dyn FnMut(&str) -> bool) -> Option<Vec<String>> {
    let tenths = (x.abs() * 10.0).round() as i64;
    let (whole, dec) = (tenths / 10, tenths % 10);
    let mut v = Vec::new();
    if x < 0.0 && tenths > 0 {
        v.push(need("numbers/minus".into(), has)?);
    }
    let one = format!("numbers/{whole}point{dec}");
    if has(&one) {
        v.push(one);
        return Some(v);
    }
    if whole == 0 && dec > 0 && has(&format!("numbers/point{dec}")) {
        // "sıfır nokta dört" yerine "nokta dört" daha doğal değil; önce sıfırı söyle
        v.extend(int_keys(0, tr, has)?);
        v.push(format!("numbers/point{dec}"));
        return Some(v);
    }
    v.extend(int_keys(whole, tr, has)?);
    if dec > 0 || whole < 10 {
        v.push(need(format!("numbers/point{dec}"), has)?);
    }
    Some(v)
}

/// Süre farkı (saniye): 0.3 → "point3seconds", 1.5 → "1point5seconds", 12.3 → "12point3" + "seconds",
/// 75 → "1" "minute" "15" "seconds"
pub fn seconds_keys(s: f32, tr: bool, has: &mut dyn FnMut(&str) -> bool) -> Option<Vec<String>> {
    let s = s.abs();
    let mut tenths = (s * 10.0).round() as i64;
    if tenths == 0 {
        tenths = 1;
    }
    let (whole, dec) = (tenths / 10, tenths % 10);
    if whole < 10 {
        let one = if whole == 0 {
            format!("numbers/point{dec}seconds")
        } else {
            format!("numbers/{whole}point{dec}seconds")
        };
        if has(&one) {
            return Some(vec![one]);
        }
    }
    if whole < 60 {
        let mut v = decimal_keys(tenths as f32 / 10.0, tr, has)?;
        let unit = if whole == 1 && dec == 0 && has("numbers/second") {
            "numbers/second"
        } else {
            "numbers/seconds"
        };
        v.push(need(unit.into(), has)?);
        return Some(v);
    }
    let total = s.round() as i64;
    let (m, sec) = (total / 60, total % 60);
    let mut v = int_keys(m, tr, has)?;
    v.push(need(
        if m == 1 {
            "numbers/minute".into()
        } else {
            "numbers/minutes".into()
        },
        has,
    )?);
    if sec > 0 {
        v.extend(int_keys(sec, tr, has)?);
        v.push(need(
            if sec == 1 {
                "numbers/second".into()
            } else {
                "numbers/seconds".into()
            },
            has,
        )?);
    }
    Some(v)
}

/// Tur süresi, saniyenin onda biri hassasiyetle: 83.45 → "1_23" "point5"; 45.3 → "45point3";
/// 60.4 → "1" "zerozero" "point4"; 185.2 → "3" "05" "point2"
pub fn laptime_keys(t: f32, tr: bool, has: &mut dyn FnMut(&str) -> bool) -> Option<Vec<String>> {
    if !(t > 0.0) || t > 5999.0 {
        return None;
    }
    let tenths = (t * 10.0).round() as i64;
    let (m, rest) = (tenths / 600, tenths % 600);
    let (sec, dec) = (rest / 10, rest % 10);
    if m == 0 {
        return decimal_keys(rest as f32 / 10.0, tr, has);
    }
    let point = need(format!("numbers/point{dec}"), has)?;
    let combined = format!("numbers/{m}_{sec:02}");
    if sec > 0 && has(&combined) {
        return Some(vec![combined, point]);
    }
    let mut v = int_keys(m, tr, has)?;
    if sec == 0 {
        let z = ["numbers/zerozero", "numbers/double_oh"]
            .into_iter()
            .find(|k| has(k))?;
        v.push(z.to_string());
    } else if sec < 10 {
        let oh = format!("numbers/0{sec}");
        if has(&oh) {
            v.push(oh);
        } else {
            v.push(need("numbers/oh".into(), has)?);
            v.extend(int_keys(sec, tr, has)?);
        }
    } else {
        v.extend(int_keys(sec, tr, has)?);
    }
    v.push(point);
    Some(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// Sahibin paketindeki ifade klasörleri (katalogdan)
    fn owner_pack() -> HashSet<String> {
        let v: Value = serde_json::from_str(CATALOG_JSON).unwrap();
        v.as_array()
            .unwrap()
            .iter()
            .filter(|e| e["files"].as_u64().unwrap_or(0) > 0)
            .map(|e| e["key"].as_str().unwrap().to_string())
            .collect()
    }

    fn keys(parts: &[Part], tr: bool) -> Option<Vec<String>> {
        let set = owner_pack();
        let mut has = |k: &str| set.contains(k);
        compose(parts, tr, &mut has)
    }

    fn s(v: &[&str]) -> Option<Vec<String>> {
        Some(v.iter().map(|x| x.to_string()).collect())
    }

    #[test]
    fn subtitles() {
        assert_eq!(subtitle(&[k("spotter/car_left")], true), "Solda araç.");
        assert_eq!(subtitle(&[k("spotter/car_left")], false), "Car left.");
        // Sayılar rakamla, ara parçaların noktası atılır, ses efektleri yazılmaz
        let t = subtitle(&[k("spotter/car_left"), Part::Secs(1.3), k("acknowledge/breath_in")], true);
        assert_eq!(t, "Solda araç 1,3 saniye");
        assert_eq!(subtitle(&[Part::Secs(75.0)], false), "1 min 15 s");
        assert_eq!(subtitle(&[Part::Lap(83.4)], false), "1:23.4");
        assert_eq!(subtitle(&[Part::Dec(2.4), Part::Int(35)], true), "2,4 35");
        assert_eq!(subtitle(&[Part::Pos(999)], true), "P999");
    }

    #[test]
    fn integers() {
        assert_eq!(keys(&[Part::Int(5)], true), s(&["numbers/5"]));
        assert_eq!(keys(&[Part::Int(42)], true), s(&["numbers/42"]));
        // Türkçe: "yüz yirmi", "iki yüz", "bin beş yüz"
        assert_eq!(
            keys(&[Part::Int(120)], true),
            s(&["numbers/hundred", "numbers/20"])
        );
        assert_eq!(
            keys(&[Part::Int(200)], true),
            s(&["numbers/2", "numbers/hundred"])
        );
        assert_eq!(
            keys(&[Part::Int(1500)], true),
            s(&["numbers/thousand", "numbers/5", "numbers/hundred"])
        );
        assert_eq!(
            keys(&[Part::Int(2345)], true),
            s(&[
                "numbers/2",
                "numbers/thousand",
                "numbers/3",
                "numbers/hundred",
                "numbers/45"
            ])
        );
        // İngilizce: "one hundred and twenty"
        assert_eq!(
            keys(&[Part::Int(120)], false),
            s(&["numbers/1", "numbers/hundred_and", "numbers/20"])
        );
        assert_eq!(
            keys(&[Part::Int(-3)], true),
            s(&["numbers/minus", "numbers/3"])
        );
    }

    #[test]
    fn seconds_and_gaps() {
        assert_eq!(
            keys(&[Part::Secs(0.34)], true),
            s(&["numbers/point3seconds"])
        );
        assert_eq!(
            keys(&[Part::Secs(0.01)], true),
            s(&["numbers/point1seconds"])
        );
        assert_eq!(
            keys(&[Part::Secs(1.52)], true),
            s(&["numbers/1point5seconds"])
        );
        assert_eq!(
            keys(&[Part::Secs(9.96)], true),
            s(&["numbers/10point0", "numbers/seconds"])
        );
        assert_eq!(
            keys(&[Part::Secs(12.34)], true),
            s(&["numbers/12point3", "numbers/seconds"])
        );
        assert_eq!(
            keys(&[Part::Secs(75.0)], true),
            s(&[
                "numbers/1",
                "numbers/minute",
                "numbers/15",
                "numbers/seconds"
            ])
        );
        assert_eq!(
            keys(&[Part::Secs(120.2)], true),
            s(&["numbers/2", "numbers/minutes"])
        );
    }

    #[test]
    fn lap_times() {
        assert_eq!(
            keys(&[Part::Lap(83.44)], true),
            s(&["numbers/1_23", "numbers/point4"])
        );
        assert_eq!(keys(&[Part::Lap(45.3)], true), s(&["numbers/45point3"]));
        assert_eq!(
            keys(&[Part::Lap(60.4)], true),
            s(&["numbers/1", "numbers/zerozero", "numbers/point4"])
        );
        assert_eq!(
            keys(&[Part::Lap(185.2)], true),
            s(&["numbers/3", "numbers/05", "numbers/point2"])
        );
        assert_eq!(
            keys(&[Part::Lap(212.0)], true),
            s(&["numbers/3", "numbers/32", "numbers/point0"])
        );
        // 1:59.96 yuvarlanınca 2:00.0
        assert_eq!(
            keys(&[Part::Lap(119.96)], true),
            s(&["numbers/2", "numbers/zerozero", "numbers/point0"])
        );
        assert_eq!(keys(&[Part::Lap(0.0)], true), None);
    }

    #[test]
    fn decimals_positions_and_missing() {
        assert_eq!(keys(&[Part::Dec(2.44)], true), s(&["numbers/2point4"]));
        assert_eq!(keys(&[Part::Dec(0.4)], true), s(&["numbers/0point4"]));
        assert_eq!(
            keys(&[Part::Dec(72.5)], true),
            s(&["numbers/72", "numbers/point5"])
        );
        assert_eq!(keys(&[Part::Pos(7)], true), s(&["position/p7"]));
        assert_eq!(keys(&[Part::Pos(60)], true), s(&["numbers/60"]));
        assert_eq!(
            keys(&[k("fuel/litres_per_lap")], true),
            s(&["fuel/litres_per_lap"])
        );
        // Paket bu ifadeye sahip değil → hiç söyleme
        assert_eq!(keys(&[k("fuel/yok_boyle_ifade"), Part::Int(3)], true), None);
        // Bileşik: "5 tur kaldı"
        assert_eq!(
            keys(&[Part::Int(5), k("race_time/laps_remaining")], true),
            s(&["numbers/5", "race_time/laps_remaining"])
        );
    }

    #[test]
    fn variant_rules() {
        let v = |n: &str| parse_variant(PathBuf::from(format!("/p/x/{n}")));
        let list = vec![
            v("1.wav"),
            v("2_op_prefix_ok.wav"),
            v("3_op_suffix_please.wav"),
            v("sweary_4.wav"),
            v("5_male.wav"),
        ];
        assert!(list[1].prefix && !list[1].suffix && !list[1].sweary);
        assert!(list[2].suffix && list[3].sweary && !list[4].prefix);
        // Ortadaki parça: ek sözlü kayıtlar ve argo seçilmez
        for seed in 0..20 {
            let mut r = |n: usize| (seed as usize) % n;
            let c = choose(&list, false, false, false, None, &mut r).unwrap();
            assert!(!c.prefix && !c.suffix && !c.sweary, "{:?}", c.path);
        }
        // Argo açıkken argo kayıt da seçilebilir
        let mut seen_sweary = false;
        for seed in 0..10 {
            let mut r = |n: usize| (seed as usize) % n;
            if choose(&list, true, true, true, None, &mut r)
                .unwrap()
                .sweary
            {
                seen_sweary = true;
            }
        }
        assert!(seen_sweary);
        // Sadece argo kaydı olan ifade argo kapalıyken çalınmaz
        let only = vec![v("sweary_1.wav")];
        assert!(choose(&only, true, true, false, None, &mut |_| 0).is_none());
        // Tek uygun kayıt ek sözlüyse yine de o kullanılır (boş kalmasın)
        let pre = vec![v("1_op_prefix_ok.wav")];
        assert!(choose(&pre, false, false, false, None, &mut |_| 0).is_some());
    }

    #[test]
    fn no_immediate_repeat() {
        let v = |n: &str| parse_variant(PathBuf::from(format!("/p/x/{n}")));
        let list = vec![v("1.wav"), v("2.wav"), v("3.wav")];
        let mut last: Option<PathBuf> = None;
        let mut state = 12345u64;
        for _ in 0..200 {
            let mut r = |n: usize| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                (state % n as u64) as usize
            };
            let c = choose(&list, true, true, false, last.as_deref(), &mut r)
                .unwrap()
                .path
                .clone();
            assert_ne!(Some(&c), last.as_ref());
            last = Some(c);
        }
        // Tek kayıt varsa tekrar kaçınılmaz
        let one = vec![v("1.wav")];
        assert!(choose(
            &one,
            true,
            true,
            false,
            Some(Path::new("/p/x/1.wav")),
            &mut |_| 0
        )
        .is_some());
    }

    #[test]
    fn pack_on_disk() {
        let dir = std::env::temp_dir().join(format!("pw_voicepack_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let root = dir.join("voicepacks").join("tr_test");
        for (ph, files) in [
            ("spotter/car_left", vec!["1.wav", "2.wav"]),
            ("numbers/5", vec!["3.ogg"]),
            ("race_time/laps_remaining", vec!["1.wav"]),
        ] {
            let d = root.join(ph);
            std::fs::create_dir_all(&d).unwrap();
            for f in files {
                std::fs::write(d.join(f), b"x").unwrap();
            }
        }
        std::fs::write(root.join("pack.json"), r#"{"id":"tr_test","name":"Test","language":"tr","author":"E","version":"1","format":"wav"}"#).unwrap();
        let list = installed(&dir.join("voicepacks"));
        assert_eq!(list.len(), 1);
        assert_eq!(
            (list[0].phrases, list[0].files, list[0].language.as_str()),
            (3, 4, "tr")
        );
        let (r, meta) = resolve(Some(&dir.join("voicepacks")), "", "").unwrap();
        assert_eq!(meta.name, "Test");
        let mut p = Pack::open(r, meta);
        assert!(p.turkish());
        let parts = p
            .render(&[Part::Int(5), k("race_time/laps_remaining")])
            .unwrap();
        assert_eq!(parts.len(), 2);
        assert!(parts[0].ends_with("3.ogg"));
        assert!(p.render(&[k("spotter/car_right")]).is_none());
        // Özel klasör: bir üst klasör gösterilse de paket kökü bulunur
        let (r2, _) = resolve(None, "", dir.to_str().unwrap()).unwrap();
        assert_eq!(r2, root);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
