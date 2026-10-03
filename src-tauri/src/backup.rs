//! Yönetim › Yedekleme: bütün içeriği (tablolar + üye listesi + yüklenen dosyalar) tek bir .zip'e indirir ve
//! aynı .zip'ten geri yükler (bkz. supabase/c67_guncelleme.sql, src/cloud/backup.ts, AdminBackup.tsx).
//!
//! Oturum arayüzdedir: arayüz Supabase adresini, anon anahtarını ve geçerli erişim anahtarını verir; bütün HTTP ve
//! zip işi burada, ayrı bir iş parçacığında yapılır. Erişim anahtarı yalnızca bellekte tutulur (yazılmaz, günlüğe
//! düşmez); arayüz yenilenen anahtarı `backup_token` ile iletir, sunucu "süresi doldu" derse "backup-need-token"
//! olayıyla yenisi istenir.
//!
//! Olaylar: "backup-progress" (ilerleme), "backup-done" (sonuç + özet + hata listesi), "backup-need-token".
//!
//! Zip düzeni (biçim sürümü 1):
//!   manifest.json, schema.sql, RESTORE.md, errors.json,
//!   tables/<tablo>.ndjson (satır başına bir JSON), auth_users.ndjson,
//!   storage/buckets.json, storage/objects.ndjson, storage/files/<kova>/<temizlenmiş yol>

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const FORMAT: u64 = 1;
const CANCELLED: &str = "İptal edildi";
const SCHEMA_SQL: &str = include_str!("../../supabase/schema.sql");
/// Geri yüklenmeyen tablolar (c67'deki backup_protected ile aynı)
const PROTECTED: [&str; 3] = ["backup_restore_stage", "backup_restore_fks", "mod_log"];
const PARALLEL: usize = 4;
const RETRIES: usize = 2;
/// Geri yüklemede bir sayfa: en çok bu kadar satır / bayt (tek satır daha büyükse tek başına gider)
const PAGE_ROWS: usize = 1000;
const PAGE_BYTES: usize = 2 * 1024 * 1024;

const RESTORE_MD: &str = r#"# SRTR Pitwall yedeği

Bu dosya SRTR Pitwall'ın **Yönetim › Yedekleme** bölümünde alınmış tam bir yedektir.
İçinde üyelerin kişisel verileri (e-posta dahil) bulunur: güvenli bir yerde sakla, kimseyle paylaşma.

## İçindekiler
- `manifest.json` — yedeğin özeti (tarih, proje, tablo başına satır sayısı ve SHA-256).
- `tables/<tablo>.ndjson` — her tablo; satır başına bir JSON kaydı.
- `auth_users.ndjson` — üye listesi (e-posta, kayıt tarihi, giriş sağlayıcıları). **Şifreler yoktur.**
- `storage/buckets.json`, `storage/objects.ndjson`, `storage/files/<kova>/…` — yüklenen dosyalar / görseller.
  Dosya adları Windows'a uygun hale getirilmiştir; asıl ad `objects.ndjson` içindedir.
- `schema.sql` — veritabanı şeması (boş bir projeyi baştan kurmak için).
- `errors.json` — yedek sırasında alınamayan öğeler (boşsa her şey alınmıştır).

## Geri yükleme
1. SRTR Pitwall'ı aç, yönetici hesabınla giriş yap.
2. **Yönetim › Yedekleme › Yedekten geri yükle** bölümünde bu .zip dosyasını seç.
3. Özeti kontrol et, `GERİ YÜKLE` yaz ve başlat. Başlamadan önce o anki durumun güvenlik yedeği
   aynı klasöre `…-geri-yukleme-oncesi.zip` adıyla alınır.

## Ne geri gelir, ne gelmez
- Tablolar yedekteki haline döner (yedekten sonra eklenen satırlar silinir).
- **Üye hesapları (giriş bilgileri, şifreler) geri yüklenmez.** Yedekten sonra kayıt olan üyelerin hesabı ve
  profili korunur; yedekteki profiller üzerine yazılır. Hesabı silinmiş üyelerin profili geri gelmez.
- Moderasyon kaydı (`mod_log`) geri yüklenmez; şimdiki kayıt aynen kalır.
- Yedekte olmayan tablolara dokunulmaz.
- Dosyalar aynı adla yeniden yüklenir. "Yedekte olmayan dosyaları sil" seçilmedikçe fazlalıklar silinmez.
- Geri yüklemeyi yapan yönetici her durumda yönetici kalır.
- Geri yükleme sürerken tablolar arası bağlar (yabancı anahtarlar) geçici olarak kaldırılır, bitince yeniden
  kurulur. Üstü artık olmayan ("yetim") satırlar varsa ilgili bağ "doğrulanmamış" kalır ve özetinde bildirilir;
  yeni kayıtlar için yine geçerlidir. İş yarıda kalırsa (iptal, bağlantı kopması) Yedekleme sayfasındaki
  **Onar** düğmesi bağları yeniden kurar.

## Sıfırdan kurulum (yeni Supabase projesi)
Önce `schema.sql` dosyasını SQL Editor'de çalıştır, yönetici hesabını oluştur, sonra yukarıdaki adımları izle.
Üyelerin yeniden kayıt olması (ya da şifre sıfırlaması) gerekir; `auth_users.ndjson` yalnızca listedir.
"#;

// ---------------------------------------------------------------------------
// Saf yardımcılar (testli)
// ---------------------------------------------------------------------------

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Windows'ta ayrılmış aygıt adları (uzantılı halleri de geçersizdir: "con.txt")
fn is_reserved(stem: &str) -> bool {
    let s = stem.trim_end_matches([' ', '.']).to_ascii_uppercase();
    if matches!(s.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$") {
        return true;
    }
    let b = s.as_bytes();
    b.len() == 4 && (s.starts_with("COM") || s.starts_with("LPT")) && (b[3].is_ascii_digit() && b[3] != b'0')
}

/// Tek yol parçasını her işletim sisteminde (özellikle Windows'ta) geçerli bir dosya adına çevirir
pub fn sanitize_segment(seg: &str) -> String {
    let mut out: String = seg
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 || c as u32 == 0x7f => '_',
            c => c,
        })
        .collect();
    // Windows: sonda nokta / boşluk olamaz ("." ve ".." de böylece zararsızlaşır)
    let keep = out.trim_end_matches(['.', ' ']).len();
    if keep < out.len() {
        let k = out[keep..].chars().count();
        out.truncate(keep);
        out.push_str(&"_".repeat(k));
    }
    let out = out.trim_start_matches(' ');
    let mut out = if out.is_empty() { "_".to_string() } else { out.to_string() };
    let stem = out.split('.').next().unwrap_or("");
    if is_reserved(stem) {
        out.insert(0, '_');
    }
    // Uzunluk sınırı (bayt): uzantıyı koruyarak kısalt
    const MAX: usize = 180;
    if out.len() > MAX {
        let ext: String = match out.rfind('.') {
            Some(i) if out.len() - i <= 16 && i > 0 => out[i..].to_string(),
            _ => String::new(),
        };
        let mut cut = MAX - ext.len();
        while !out.is_char_boundary(cut) {
            cut -= 1;
        }
        out.truncate(cut);
        while out.ends_with('.') || out.ends_with(' ') {
            out.pop();
        }
        out.push_str(&ext);
    }
    out
}

/// Depodaki nesnenin zip içindeki yolu: storage/files/<kova>/<temiz yol>. Büyük/küçük harf farkı gözetmeden
/// benzersizdir (çakışırsa uzantıdan önce ~2, ~3… eklenir).
pub fn entry_path(bucket: &str, name: &str, used: &mut HashSet<String>) -> String {
    let mut parts: Vec<String> = vec![sanitize_segment(bucket)];
    for seg in name.split('/') {
        if seg.is_empty() {
            continue;
        }
        parts.push(sanitize_segment(seg));
    }
    if parts.len() == 1 {
        parts.push("_".into());
    }
    let base = format!("storage/files/{}", parts.join("/"));
    let mut cand = base.clone();
    let mut n = 1;
    while !used.insert(cand.to_lowercase()) {
        n += 1;
        cand = match base.rfind('.') {
            Some(i) if i > base.rfind('/').unwrap_or(0) + 1 => format!("{}~{}{}", &base[..i], n, &base[i..]),
            _ => format!("{base}~{n}"),
        };
    }
    cand
}

/// Depolama adresindeki yol: her parça ayrı ayrı yüzde-kodlanır
pub fn encode_path(name: &str) -> String {
    let mut out = String::with_capacity(name.len() + 8);
    for (i, seg) in name.split('/').enumerate() {
        if i > 0 {
            out.push('/');
        }
        for b in seg.bytes() {
            if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
                out.push(b as char);
            } else {
                out.push_str(&format!("%{b:02X}"));
            }
        }
    }
    out
}

/// Tablo adı zip girdisi olarak güvenli mi (Postgres adları serbesttir; garip adlar temizlenir)
fn table_file(name: &str) -> String {
    format!("tables/{}.ndjson", sanitize_segment(name))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TableEntry {
    pub name: String,
    pub rows: u64,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub bytes: u64,
    pub file: String,
    #[serde(default = "yes")]
    pub complete: bool,
}
fn yes() -> bool {
    true
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Manifest {
    pub project_ref: String,
    pub created_at: String,
    pub tables: Vec<TableEntry>,
}

/// manifest.json denetimi: biçim sürümü, tablo listesi, dosya yolları (zip dışına çıkan yol olamaz)
pub fn validate_manifest(v: &Value) -> Result<Manifest, String> {
    let format = v.get("format").and_then(Value::as_u64).ok_or("manifest.json: biçim sürümü yok")?;
    if format != FORMAT {
        return Err(format!("Bu yedeğin biçim sürümü ({format}) desteklenmiyor (beklenen {FORMAT})"));
    }
    if v.get("app").and_then(Value::as_str) != Some("SRTR Pitwall") {
        return Err("Bu dosya bir SRTR Pitwall yedeği değil".into());
    }
    let tables: Vec<TableEntry> = serde_json::from_value(v.get("tables").cloned().unwrap_or(Value::Null))
        .map_err(|_| "manifest.json: tablo listesi okunamadı".to_string())?;
    let mut seen = HashSet::new();
    for t in &tables {
        if t.name.is_empty() || !seen.insert(t.name.clone()) {
            return Err(format!("manifest.json: geçersiz ya da yinelenen tablo adı: {}", t.name));
        }
        if !t.file.starts_with("tables/") || t.file.contains("..") || t.file.contains('\\') || t.file[7..].contains('/') {
            return Err(format!("manifest.json: geçersiz dosya yolu: {}", t.file));
        }
    }
    Ok(Manifest {
        project_ref: v.get("project_ref").and_then(Value::as_str).unwrap_or("").to_string(),
        created_at: v.get("created_at").and_then(Value::as_str).unwrap_or("").to_string(),
        tables,
    })
}

/// Satırları ndjson olarak yazar (satır başına bir JSON), özet güncellenir; yazılan bayt döner
pub fn write_ndjson<W: Write>(w: &mut W, rows: &[Value], hasher: &mut Sha256) -> std::io::Result<u64> {
    let mut n = 0u64;
    for r in rows {
        let mut line = serde_json::to_vec(r).map_err(std::io::Error::other)?;
        line.push(b'\n');
        hasher.update(&line);
        w.write_all(&line)?;
        n += line.len() as u64;
    }
    Ok(n)
}

/// ndjson'u sayfa sayfa okur: sayfa `max_rows` satıra ya da `max_bytes` bayta ulaşınca kapanır (düşük bellek)
pub struct NdjsonPager<R: BufRead> {
    r: R,
    max_rows: usize,
    max_bytes: usize,
    line: String,
}

impl<R: BufRead> NdjsonPager<R> {
    pub fn new(r: R, max_rows: usize, max_bytes: usize) -> Self {
        NdjsonPager { r, max_rows: max_rows.max(1), max_bytes: max_bytes.max(1), line: String::new() }
    }

    /// Sonraki sayfa; dosya bittiyse None. Boş satırlar atlanır; bozuk satır hatadır.
    pub fn next_page(&mut self) -> Result<Option<Vec<Value>>, String> {
        let mut rows = Vec::new();
        let mut bytes = 0usize;
        loop {
            self.line.clear();
            let n = self.r.read_line(&mut self.line).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            let s = self.line.trim();
            if s.is_empty() {
                continue;
            }
            let v: Value = serde_json::from_str(s).map_err(|e| format!("bozuk satır: {e}"))?;
            if !v.is_object() {
                return Err("bozuk satır: nesne değil".into());
            }
            bytes += s.len();
            rows.push(v);
            if rows.len() >= self.max_rows || bytes >= self.max_bytes {
                break;
            }
        }
        Ok(if rows.is_empty() { None } else { Some(rows) })
    }
}

/// Bir akışın SHA-256'sı ve (boş olmayan) satır sayısı
fn hash_lines<R: Read>(r: R) -> Result<(String, u64), String> {
    let mut br = BufReader::with_capacity(256 * 1024, r);
    let mut h = Sha256::new();
    let mut lines = 0u64;
    let mut buf = Vec::new();
    loop {
        buf.clear();
        let n = br.read_until(b'\n', &mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf);
        if buf.iter().any(|b| !b.is_ascii_whitespace()) {
            lines += 1;
        }
    }
    Ok((hex(&h.finalize()), lines))
}

/// Zaten sıkıştırılmış türler zip içinde sıkıştırılmadan saklanır
fn precompressed(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "ogg" | "mp3" | "mp4" | "webm" | "zip" | "avif" | "ico")
}

// ---------------------------------------------------------------------------
// Durum: tek iş, iptal bayrağı, bellek içi erişim anahtarı
// ---------------------------------------------------------------------------

static JOB: Mutex<Option<Arc<AtomicBool>>> = parking_lot::const_mutex(None);
static TOKEN: Mutex<String> = parking_lot::const_mutex(String::new());

#[derive(Deserialize)]
pub struct Auth {
    url: String,
    anon_key: String,
    token: String,
    #[serde(default)]
    project_ref: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct BackupOptions {
    tables: bool,
    users: bool,
    storage: bool,
    /// Yedeklenecek kovalar (boşsa hepsi)
    #[serde(default)]
    buckets: Vec<String>,
    /// ISO tarih (arayüz verir)
    #[serde(default)]
    created_at: String,
}

#[derive(Deserialize, Clone)]
pub struct RestoreOptions {
    tables: bool,
    storage: bool,
    #[serde(default)]
    delete_extra: bool,
    #[serde(default)]
    delete_orphans: bool,
}

#[derive(Serialize, Clone, Default)]
struct Progress {
    kind: &'static str,
    step: String,
    label: String,
    tables_done: u64,
    tables_total: u64,
    rows_done: u64,
    rows_total: u64,
    files_done: u64,
    files_total: u64,
    bytes_done: u64,
    bytes_total: u64,
    percent: f64,
    elapsed_ms: u64,
}

#[derive(Serialize, Clone)]
struct ErrItem {
    kind: String,
    name: String,
    error: String,
}

#[derive(Serialize, Clone)]
struct Done {
    kind: &'static str,
    ok: bool,
    cancelled: bool,
    error: String,
    path: String,
    summary: Value,
    errors: Vec<ErrItem>,
    elapsed_ms: u64,
}

struct Ctx {
    app: AppHandle,
    client: reqwest::Client,
    url: String,
    key: String,
    cancel: Arc<AtomicBool>,
    /// Geri yükleme kapanışı (yabancı anahtarların yeniden kurulması) iptal edilmiş olsa da tamamlanır
    cleanup: AtomicBool,
    start: Instant,
    p: Mutex<Progress>,
    last_emit: Mutex<Instant>,
    errors: Mutex<Vec<ErrItem>>,
}

impl Ctx {
    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed) && !self.cleanup.load(Ordering::Relaxed)
    }
    fn check(&self) -> Result<(), String> {
        if self.cancelled() {
            Err(CANCELLED.into())
        } else {
            Ok(())
        }
    }
    fn err(&self, kind: &str, name: &str, error: impl Into<String>) {
        self.errors.lock().push(ErrItem { kind: kind.into(), name: name.into(), error: error.into() });
    }
    /// İlerlemeyi güncelle ve (en sık 150 ms'de bir ya da `force`) arayüze bildir
    fn progress(&self, force: bool, f: impl FnOnce(&mut Progress)) {
        let snap = {
            let mut p = self.p.lock();
            f(&mut p);
            let total = p.rows_total as f64 + p.bytes_total as f64 / 4096.0 + 1.0;
            let done = p.rows_done as f64 + p.bytes_done as f64 / 4096.0;
            p.percent = (done / total * 100.0).clamp(0.0, 99.0);
            p.elapsed_ms = self.start.elapsed().as_millis() as u64;
            p.clone()
        };
        let mut last = self.last_emit.lock();
        if force || last.elapsed() >= Duration::from_millis(150) {
            *last = Instant::now();
            let _ = self.app.emit("backup-progress", snap);
        }
    }
}

fn client() -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("SRTR-Pitwall/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())
}

enum Body<'a> {
    None,
    Json(&'a [u8]),
    Raw(&'a [u8], &'a str),
}

async fn sleep_cancel(ctx: &Ctx, d: Duration) -> Result<(), String> {
    let until = Instant::now() + d;
    while Instant::now() < until {
        ctx.check()?;
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Ok(())
}

/// Arayüzden yeni erişim anahtarı iste ve gelmesini bekle (en çok 30 sn)
async fn wait_token(ctx: &Ctx, old: &str) -> Result<(), String> {
    let _ = ctx.app.emit("backup-need-token", ());
    let until = Instant::now() + Duration::from_secs(30);
    while Instant::now() < until {
        ctx.check()?;
        if TOKEN.lock().as_str() != old {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err("Oturum süresi doldu; yeniden giriş yapıp tekrar dene".into())
}

/// Kimlikli HTTP isteği: ağ hatası / 5xx / 429'da 2 kez yeniden dener (artan bekleme), oturum süresi dolduysa
/// yeni anahtarı bekleyip yeniden dener. (durum kodu, gövde) döner.
async fn http(ctx: &Ctx, method: reqwest::Method, url: &str, body: &Body<'_>, extra: &[(&str, &str)]) -> Result<(u16, Vec<u8>), String> {
    let mut attempt = 0usize;
    let mut token_waits = 0usize;
    loop {
        ctx.check()?;
        let token = TOKEN.lock().clone();
        let mut rb = ctx
            .client
            .request(method.clone(), url)
            .header("apikey", ctx.key.as_str())
            .header("Authorization", format!("Bearer {token}"));
        for (k, v) in extra {
            rb = rb.header(*k, *v);
        }
        rb = match body {
            Body::None => rb,
            Body::Json(b) => rb.header("Content-Type", "application/json").body(b.to_vec()),
            Body::Raw(b, ct) => rb.header("Content-Type", *ct).body(b.to_vec()),
        };
        let res = match rb.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                match resp.bytes().await {
                    Ok(b) => Ok((status, b.to_vec())),
                    Err(e) => Err(format!("Yanıt yarıda kaldı: {}", e.without_url())),
                }
            }
            Err(e) => Err(format!("Bağlantı hatası: {}", e.without_url())),
        };
        match res {
            Ok((status, bytes)) => {
                let auth_fail = status == 401
                    || ((status == 400 || status == 403) && {
                        let s = String::from_utf8_lossy(&bytes[..bytes.len().min(600)]).to_lowercase();
                        s.contains("jwt") || s.contains("token is expired")
                    });
                if auth_fail && token_waits < 2 {
                    token_waits += 1;
                    wait_token(ctx, &token).await?;
                    continue;
                }
                if (status >= 502 || status == 429) && attempt < RETRIES {
                    attempt += 1;
                    sleep_cancel(ctx, Duration::from_millis(800 * (1 << attempt))).await?;
                    continue;
                }
                return Ok((status, bytes));
            }
            Err(e) => {
                if attempt < RETRIES {
                    attempt += 1;
                    sleep_cancel(ctx, Duration::from_millis(800 * (1 << attempt))).await?;
                    continue;
                }
                return Err(e);
            }
        }
    }
}

fn err_text(status: u16, bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    if let Ok(j) = serde_json::from_str::<Value>(&text) {
        if let Some(m) = j.get("message").or_else(|| j.get("error")).and_then(Value::as_str) {
            return format!("{m} ({status})");
        }
    }
    let t: String = text.chars().take(200).collect();
    if t.trim().is_empty() {
        format!("Sunucu yanıtı {status}")
    } else {
        format!("{t} ({status})")
    }
}

async fn rpc(ctx: &Ctx, name: &str, args: Value) -> Result<Value, String> {
    let body = serde_json::to_vec(&args).map_err(|e| e.to_string())?;
    let url = format!("{}/rest/v1/rpc/{name}", ctx.url);
    let (status, bytes) = http(ctx, reqwest::Method::POST, &url, &Body::Json(&body), &[]).await?;
    if !(200..300).contains(&status) {
        return Err(err_text(status, &bytes));
    }
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("Yanıt çözülemedi: {e}"))
}

fn arr(v: Value) -> Vec<Value> {
    match v {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

#[derive(Clone)]
struct TableInfo {
    name: String,
    rows: u64,
    bytes: u64,
}

async fn list_tables(ctx: &Ctx) -> Result<Vec<TableInfo>, String> {
    Ok(arr(rpc(ctx, "admin_backup_tables", json!({})).await?)
        .into_iter()
        .filter_map(|t| {
            Some(TableInfo {
                name: t.get("name")?.as_str()?.to_string(),
                rows: t.get("rows").and_then(Value::as_u64).unwrap_or(0),
                bytes: t.get("bytes").and_then(Value::as_u64).unwrap_or(0),
            })
        })
        .collect())
}

#[derive(Clone, Serialize, Deserialize)]
struct Obj {
    bucket: String,
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    mimetype: String,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    entry: String,
    #[serde(default)]
    ok: bool,
}

async fn list_objects(ctx: &Ctx) -> Result<Vec<Obj>, String> {
    let mut out = Vec::new();
    let mut off = 0u64;
    loop {
        let page = arr(rpc(ctx, "admin_backup_objects", json!({ "p_offset": off, "p_limit": 1000 })).await?);
        let n = page.len();
        for o in page {
            let (Some(b), Some(nm)) = (o.get("bucket_id").and_then(Value::as_str), o.get("name").and_then(Value::as_str)) else { continue };
            out.push(Obj {
                bucket: b.to_string(),
                name: nm.to_string(),
                size: o.get("size").and_then(Value::as_u64).unwrap_or(0),
                mimetype: o.get("mimetype").and_then(Value::as_str).unwrap_or("").to_string(),
                updated_at: o.get("updated_at").and_then(Value::as_str).unwrap_or("").to_string(),
                entry: String::new(),
                ok: false,
            });
        }
        if n < 1000 {
            break;
        }
        off += n as u64;
    }
    Ok(out)
}

fn io_err(e: std::io::Error) -> String {
    crate::voicepack_dl::io_err(e)
}
fn zip_err(e: zip::result::ZipError) -> String {
    match e {
        zip::result::ZipError::Io(e) => io_err(e),
        e => e.to_string(),
    }
}

type Zw = zip::ZipWriter<std::io::BufWriter<std::fs::File>>;

fn opts(deflate: bool, large: bool) -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default()
        .compression_method(if deflate { zip::CompressionMethod::Deflated } else { zip::CompressionMethod::Stored })
        .large_file(large)
}

fn put(zw: &mut Zw, name: &str, data: &[u8]) -> Result<(), String> {
    zw.start_file(name, opts(true, data.len() as u64 >= u32::MAX as u64)).map_err(zip_err)?;
    zw.write_all(data).map_err(io_err)
}

// ---------------------------------------------------------------------------
// YEDEK
// ---------------------------------------------------------------------------

/// Bir RPC'yi sayfa sayfa çekip ndjson olarak zip'e akıtır. Sorgu süresi aşılırsa sayfa küçültülür.
/// (satır, bayt, sha256) döner.
async fn dump_paged(ctx: &Ctx, zw: &mut Zw, entry: &str, fn_name: &str, table: Option<&str>, start_limit: u64) -> Result<(u64, u64, String), String> {
    zw.start_file(entry, opts(true, true)).map_err(zip_err)?;
    let mut hasher = Sha256::new();
    let (mut rows, mut bytes, mut off, mut limit) = (0u64, 0u64, 0u64, start_limit);
    loop {
        ctx.check()?;
        let args = match table {
            Some(t) => json!({ "p_table": t, "p_offset": off, "p_limit": limit }),
            None => json!({ "p_offset": off, "p_limit": limit }),
        };
        let page = match rpc(ctx, fn_name, args).await {
            Ok(v) => arr(v),
            Err(e) if e == CANCELLED => return Err(e),
            Err(e) => {
                if limit > 25 {
                    limit = (limit / 4).max(25);
                    continue;
                }
                return Err(e);
            }
        };
        let n = page.len() as u64;
        bytes += write_ndjson(zw, &page, &mut hasher).map_err(io_err)?;
        rows += n;
        off += n;
        ctx.progress(false, |p| p.rows_done += n);
        if n < limit {
            break;
        }
    }
    Ok((rows, bytes, hex(&hasher.finalize())))
}

async fn download_obj(ctx: &Ctx, o: &Obj) -> Result<Vec<u8>, String> {
    let url = format!("{}/storage/v1/object/authenticated/{}/{}", ctx.url, encode_path(&o.bucket), encode_path(&o.name));
    let (status, bytes) = http(ctx, reqwest::Method::GET, &url, &Body::None, &[]).await?;
    if !(200..300).contains(&status) {
        return Err(err_text(status, &bytes));
    }
    Ok(bytes)
}

async fn backup_job(ctx: &Ctx, part: &Path, dest: &Path, o: &BackupOptions, project_ref: &str) -> Result<Value, String> {
    ctx.progress(true, |p| {
        p.step = "scan".into();
        p.label.clear();
    });
    let tables = if o.tables { list_tables(ctx).await? } else { Vec::new() };
    let buckets = if o.storage { arr(rpc(ctx, "admin_backup_buckets", json!({})).await?) } else { Vec::new() };
    let mut objects: Vec<Obj> = if o.storage { list_objects(ctx).await? } else { Vec::new() };
    if !o.buckets.is_empty() {
        objects.retain(|x| o.buckets.contains(&x.bucket));
    }
    let chosen_buckets: Vec<Value> = buckets
        .into_iter()
        .filter(|b| o.buckets.is_empty() || b.get("id").and_then(Value::as_str).is_some_and(|id| o.buckets.iter().any(|x| x == id)))
        .collect();
    let mut used = HashSet::new();
    for x in objects.iter_mut() {
        x.entry = entry_path(&x.bucket, &x.name, &mut used);
    }
    ctx.progress(true, |p| {
        p.tables_total = tables.len() as u64;
        p.rows_total = tables.iter().map(|t| t.rows).sum();
        p.files_total = objects.len() as u64;
        p.bytes_total = objects.iter().map(|x| x.size).sum();
    });

    let file = std::fs::File::create(part).map_err(io_err)?;
    let mut zw: Zw = zip::ZipWriter::new(std::io::BufWriter::with_capacity(1024 * 1024, file));
    put(&mut zw, "RESTORE.md", RESTORE_MD.as_bytes())?;
    put(&mut zw, "schema.sql", SCHEMA_SQL.as_bytes())?;

    // Tablolar
    let mut used_files = HashSet::new();
    let mut entries: Vec<TableEntry> = Vec::new();
    for t in &tables {
        ctx.check()?;
        ctx.progress(true, |p| {
            p.step = "tables".into();
            p.label = t.name.clone();
        });
        let mut file = table_file(&t.name);
        if !used_files.insert(file.to_lowercase()) {
            file = format!("tables/{}~{}.ndjson", sanitize_segment(&t.name), used_files.len());
            used_files.insert(file.to_lowercase());
        }
        // Geniş satırlı tablolar (bayt/satır büyük) küçük sayfayla başlar
        let avg = if t.rows > 0 { t.bytes / t.rows } else { 0 };
        let limit = if avg > 16_384 { 100 } else if avg > 2_048 { 400 } else { 1000 };
        match dump_paged(ctx, &mut zw, &file, "admin_backup_rows", Some(&t.name), limit).await {
            Ok((rows, bytes, sha)) => entries.push(TableEntry { name: t.name.clone(), rows, sha256: sha, bytes, file, complete: true }),
            Err(e) if e == CANCELLED => return Err(e),
            Err(e) => {
                ctx.err("table", &t.name, e);
                entries.push(TableEntry { name: t.name.clone(), rows: 0, sha256: String::new(), bytes: 0, file, complete: false });
            }
        }
        ctx.progress(true, |p| p.tables_done += 1);
    }

    // Üye listesi
    let mut users = Value::Null;
    if o.users {
        ctx.progress(true, |p| {
            p.step = "users".into();
            p.label.clear();
        });
        match dump_paged(ctx, &mut zw, "auth_users.ndjson", "admin_backup_users", None, 500).await {
            Ok((rows, bytes, sha)) => users = json!({ "rows": rows, "bytes": bytes, "sha256": sha, "file": "auth_users.ndjson" }),
            Err(e) if e == CANCELLED => return Err(e),
            Err(e) => ctx.err("users", "auth.users", e),
        }
    }

    // Dosyalar: 4'erli indir, sırayla zip'e yaz
    let (mut files_ok, mut files_bytes, mut files_failed) = (0u64, 0u64, 0u64);
    if o.storage {
        ctx.progress(true, |p| {
            p.step = "files".into();
            p.label.clear();
        });
        put(&mut zw, "storage/buckets.json", &serde_json::to_vec_pretty(&chosen_buckets).unwrap_or_default())?;
        let mut i = 0;
        while i < objects.len() {
            ctx.check()?;
            let end = (i + PARALLEL).min(objects.len());
            let results = futures_util::future::join_all(objects[i..end].iter().map(|x| download_obj(ctx, x))).await;
            for (k, res) in results.into_iter().enumerate() {
                let x = &mut objects[i + k];
                match res {
                    Ok(data) => {
                        zw.start_file(x.entry.as_str(), opts(!precompressed(&x.name), data.len() as u64 >= u32::MAX as u64)).map_err(zip_err)?;
                        zw.write_all(&data).map_err(io_err)?;
                        x.ok = true;
                        files_ok += 1;
                        files_bytes += data.len() as u64;
                    }
                    Err(e) if e == CANCELLED => return Err(e),
                    Err(e) => {
                        files_failed += 1;
                        ctx.err("file", &format!("{}/{}", x.bucket, x.name), e);
                    }
                }
                let (size, label) = (x.size, format!("{}/{}", x.bucket, x.name));
                ctx.progress(false, |p| {
                    p.files_done += 1;
                    p.bytes_done += size;
                    p.label = label;
                });
            }
            i = end;
        }
        zw.start_file("storage/objects.ndjson", opts(true, true)).map_err(zip_err)?;
        for x in &objects {
            let mut line = serde_json::to_vec(x).map_err(|e| e.to_string())?;
            line.push(b'\n');
            zw.write_all(&line).map_err(io_err)?;
        }
    }

    ctx.progress(true, |p| {
        p.step = "finish".into();
        p.label.clear();
    });
    let errors = ctx.errors.lock().clone();
    put(&mut zw, "errors.json", &serde_json::to_vec_pretty(&errors).unwrap_or_default())?;
    let total_rows: u64 = entries.iter().map(|t| t.rows).sum();
    let manifest = json!({
        "format": FORMAT,
        "app": "SRTR Pitwall",
        "app_version": env!("CARGO_PKG_VERSION"),
        "project_ref": project_ref,
        "created_at": o.created_at,
        "options": o,
        "tables": entries,
        "rows": total_rows,
        "users": users,
        "storage": if o.storage {
            json!({
                "buckets": chosen_buckets.iter().filter_map(|b| b.get("id").and_then(Value::as_str)).collect::<Vec<_>>(),
                "objects": files_ok,
                "bytes": files_bytes,
                "failed": files_failed,
            })
        } else {
            Value::Null
        },
        "errors": errors.len(),
    });
    put(&mut zw, "manifest.json", &serde_json::to_vec_pretty(&manifest).unwrap_or_default())?;
    let mut inner = zw.finish().map_err(zip_err)?;
    inner.flush().map_err(io_err)?;
    let f = inner.into_inner().map_err(|e| io_err(e.into_error()))?;
    let _ = f.sync_all();
    let size = f.metadata().map(|m| m.len()).unwrap_or(0);
    drop(f);
    ctx.check()?;
    std::fs::rename(part, dest).map_err(io_err)?;
    Ok(json!({
        "tables": entries.len(),
        "tables_failed": entries.iter().filter(|t| !t.complete).count(),
        "rows": total_rows,
        "users": manifest["users"]["rows"],
        "files": files_ok,
        "files_failed": files_failed,
        "files_bytes": files_bytes,
        "size": size,
    }))
}

// ---------------------------------------------------------------------------
// İNCELEME (ağ yok)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct InspectTable {
    name: String,
    rows: u64,
    ok: bool,
    complete: bool,
}

#[derive(Serialize)]
pub struct Inspect {
    ok: bool,
    problems: Vec<String>,
    warnings: Vec<String>,
    manifest: Value,
    tables: Vec<InspectTable>,
    rows: u64,
    files: u64,
    files_bytes: u64,
    files_missing: u64,
    buckets: Vec<String>,
    size: u64,
}

fn read_entry<R: Read + std::io::Seek>(z: &mut zip::ZipArchive<R>, name: &str, max: u64) -> Result<Vec<u8>, String> {
    let f = z.by_name(name).map_err(|_| format!("{name} bulunamadı"))?;
    let mut buf = Vec::new();
    f.take(max + 1).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    if buf.len() as u64 > max {
        return Err(format!("{name} çok büyük"));
    }
    Ok(buf)
}

fn read_objects<R: Read + std::io::Seek>(z: &mut zip::ZipArchive<R>) -> Result<Vec<Obj>, String> {
    let mut out = Vec::new();
    let Ok(f) = z.by_name("storage/objects.ndjson") else { return Ok(out) };
    for line in BufReader::new(f).lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let o: Obj = serde_json::from_str(&line).map_err(|e| format!("storage/objects.ndjson bozuk: {e}"))?;
        out.push(o);
    }
    Ok(out)
}

fn inspect_blocking(path: &Path) -> Result<Inspect, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut z = zip::ZipArchive::new(BufReader::new(file)).map_err(|_| "Geçerli bir zip dosyası değil".to_string())?;
    let raw = read_entry(&mut z, "manifest.json", 32 * 1024 * 1024).map_err(|_| "Bu dosya bir SRTR Pitwall yedeği değil (manifest.json yok)".to_string())?;
    let manifest: Value = serde_json::from_slice(&raw).map_err(|_| "manifest.json okunamadı".to_string())?;
    let m = validate_manifest(&manifest)?;
    let mut problems = Vec::new();
    let mut warnings = Vec::new();
    let mut tables = Vec::new();
    let mut rows = 0u64;
    for t in &m.tables {
        let mut ok = true;
        if !t.complete {
            warnings.push(format!("{}: yedek alınırken bu tablo tam indirilemedi; geri yüklenmeyecek", t.name));
        } else {
            match z.by_name(&t.file) {
                Err(_) => {
                    ok = false;
                    problems.push(format!("{}: dosya eksik ({})", t.name, t.file));
                }
                Ok(f) => match hash_lines(f) {
                    Ok((sha, lines)) => {
                        if !sha.eq_ignore_ascii_case(&t.sha256) {
                            ok = false;
                            problems.push(format!("{}: SHA-256 uyuşmuyor (dosya değişmiş ya da bozulmuş)", t.name));
                        } else if lines != t.rows {
                            ok = false;
                            problems.push(format!("{}: satır sayısı uyuşmuyor ({} / {})", t.name, lines, t.rows));
                        }
                    }
                    Err(e) => {
                        ok = false;
                        problems.push(format!("{}: okunamadı ({e})", t.name));
                    }
                },
            }
        }
        rows += t.rows;
        tables.push(InspectTable { name: t.name.clone(), rows: t.rows, ok, complete: t.complete });
    }
    let objects = read_objects(&mut z)?;
    let (mut files, mut files_bytes, mut files_missing) = (0u64, 0u64, 0u64);
    let mut buckets: Vec<String> = Vec::new();
    for o in &objects {
        if !buckets.contains(&o.bucket) {
            buckets.push(o.bucket.clone());
        }
        if o.ok && o.entry.starts_with("storage/files/") && z.index_for_name(&o.entry).is_some() {
            files += 1;
            files_bytes += o.size;
        } else {
            files_missing += 1;
        }
    }
    if files_missing > 0 {
        warnings.push(format!("{files_missing} dosya yedekte yok (yedek alınırken indirilememiş); bunlara dokunulmayacak"));
    }
    let errs = manifest.get("errors").and_then(Value::as_u64).unwrap_or(0);
    if errs > 0 {
        warnings.push(format!("Bu yedek alınırken {errs} hata oluşmuş (zip içindeki errors.json)"));
    }
    Ok(Inspect { ok: problems.is_empty(), problems, warnings, manifest, tables, rows, files, files_bytes, files_missing, buckets, size })
}

// ---------------------------------------------------------------------------
// GERİ YÜKLEME
// ---------------------------------------------------------------------------

async fn restore_table(ctx: &Ctx, z: &mut zip::ZipArchive<BufReader<std::fs::File>>, run: &str, t: &TableEntry) -> Result<u64, String> {
    let f = z.by_name(&t.file).map_err(|_| format!("dosya eksik: {}", t.file))?;
    let mut pager = NdjsonPager::new(BufReader::with_capacity(256 * 1024, f), PAGE_ROWS, PAGE_BYTES);
    let mut seq = 0u64;
    let mut written = 0u64;
    loop {
        ctx.check()?;
        let page = pager.next_page()?;
        // Boş tablo: boş bir sayfa hazırlanır ki seq 0 uygulaması tabloyu boşaltsın
        let rows = match page {
            Some(r) => r,
            None if seq == 0 => Vec::new(),
            None => break,
        };
        let n = rows.len() as u64;
        rpc(ctx, "admin_restore_stage", json!({ "p_run": run, "p_table": t.name, "p_seq": seq, "p_rows": rows })).await?;
        let w = rpc(ctx, "admin_restore_apply", json!({ "p_run": run, "p_table": t.name, "p_seq": seq })).await?;
        written += w.as_u64().unwrap_or(0);
        ctx.progress(false, |p| p.rows_done += n);
        seq += 1;
        if n == 0 {
            break;
        }
    }
    Ok(written)
}

/// Geri yüklemenin kapanışı: saklı yabancı anahtarlar NOT VALID olarak yeniden kurulur (finish), sonra her biri
/// ayrı çağrıyla doğrulanır. Yetim satır yüzünden doğrulanamayanlar NOT VALID kalır ve raporlanır.
async fn close_restore(ctx: &Ctx, run: &str, delete_orphans: bool) -> Result<Value, String> {
    let mut last = String::new();
    let mut report = Value::Null;
    // finish kısa süreli kilit ister; tablo meşgulse birkaç kez yeniden denenir
    for attempt in 0..4 {
        match rpc(ctx, "admin_restore_finish", json!({ "p_run": run, "p_delete_orphans": delete_orphans })).await {
            Ok(v) => {
                report = v;
                last.clear();
                break;
            }
            Err(e) => {
                last = e;
                tokio::time::sleep(Duration::from_secs(2 + attempt)).await;
            }
        }
    }
    if !last.is_empty() {
        return Err(last);
    }
    let pending = report.get("fks_not_valid").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut not_valid: Vec<Value> = Vec::new();
    let mut orphans: Vec<Value> = Vec::new();
    for c in &pending {
        let (Some(table), Some(conname)) = (c.get("table").and_then(Value::as_str), c.get("conname").and_then(Value::as_str)) else { continue };
        ctx.progress(false, |p| p.label = format!("{table}.{conname}"));
        match rpc(ctx, "admin_restore_validate", json!({ "p_table": table, "p_conname": conname, "p_delete_orphans": delete_orphans })).await {
            Ok(v) => {
                let n = v.get("orphans").and_then(Value::as_u64).unwrap_or(0);
                let valid = v.get("valid").and_then(Value::as_bool).unwrap_or(false);
                if n > 0 {
                    orphans.push(json!({ "table": table, "column": conname, "rows": n, "deleted": v.get("deleted").cloned().unwrap_or(Value::Bool(false)) }));
                }
                if !valid {
                    not_valid.push(json!({ "table": table, "conname": conname, "orphans": n }));
                }
            }
            Err(e) => {
                ctx.err("constraint", &format!("{table}.{conname}"), e);
                not_valid.push(json!({ "table": table, "conname": conname, "orphans": Value::Null }));
            }
        }
    }
    if let Some(m) = report.as_object_mut() {
        m.insert("fks_not_valid".into(), Value::Array(not_valid));
        m.insert("orphans".into(), Value::Array(orphans));
        m.insert("orphans_deleted".into(), Value::Bool(delete_orphans));
    }
    Ok(report)
}

async fn upload_obj(ctx: &Ctx, o: &Obj, data: &[u8]) -> Result<(), String> {
    let url = format!("{}/storage/v1/object/{}/{}", ctx.url, encode_path(&o.bucket), encode_path(&o.name));
    let ct = if o.mimetype.trim().is_empty() { "application/octet-stream" } else { o.mimetype.as_str() };
    let (status, bytes) = http(ctx, reqwest::Method::POST, &url, &Body::Raw(data, ct), &[("x-upsert", "true"), ("cache-control", "max-age=3600")]).await?;
    if !(200..300).contains(&status) {
        return Err(err_text(status, &bytes));
    }
    Ok(())
}

async fn delete_obj(ctx: &Ctx, bucket: &str, name: &str) -> Result<(), String> {
    let url = format!("{}/storage/v1/object/{}/{}", ctx.url, encode_path(bucket), encode_path(name));
    let (status, bytes) = http(ctx, reqwest::Method::DELETE, &url, &Body::None, &[]).await?;
    if !(200..300).contains(&status) {
        return Err(err_text(status, &bytes));
    }
    Ok(())
}

async fn restore_job(ctx: &Ctx, path: &Path, o: &RestoreOptions) -> Result<Value, String> {
    ctx.progress(true, |p| p.step = "scan".into());
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut z = zip::ZipArchive::new(BufReader::new(file)).map_err(|_| "Geçerli bir zip dosyası değil".to_string())?;
    let manifest: Value = serde_json::from_slice(&read_entry(&mut z, "manifest.json", 32 * 1024 * 1024)?).map_err(|_| "manifest.json okunamadı".to_string())?;
    let m = validate_manifest(&manifest)?;
    let objects: Vec<Obj> = if o.storage { read_objects(&mut z)? } else { Vec::new() };

    // Geri yüklenecek tablolar: yedekte tam olan ∩ şu an var olan − korumalılar; profiles önce, sonra ada göre
    let mut todo: Vec<TableEntry> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    if o.tables {
        let current: HashSet<String> = list_tables(ctx).await?.into_iter().map(|t| t.name).collect();
        for t in &m.tables {
            if PROTECTED.contains(&t.name.as_str()) {
                continue;
            }
            if !t.complete || !current.contains(&t.name) {
                skipped.push(t.name.clone());
                continue;
            }
            todo.push(t.clone());
        }
        todo.sort_by(|a, b| (a.name != "profiles", &a.name).cmp(&(b.name != "profiles", &b.name)));
    }
    let restorable: Vec<&Obj> = objects.iter().filter(|x| x.ok && x.entry.starts_with("storage/files/") && !x.entry.contains("..")).collect();
    ctx.progress(true, |p| {
        p.tables_total = todo.len() as u64;
        p.rows_total = todo.iter().map(|t| t.rows).sum();
        p.files_total = restorable.len() as u64;
        p.bytes_total = restorable.iter().map(|x| x.size).sum();
    });

    let mut rows_written = 0u64;
    let mut tables_ok = 0u64;
    let mut report = Value::Null;
    if o.tables {
        let names: Vec<&str> = todo.iter().map(|t| t.name.as_str()).collect();
        // begin: public'teki bütün yabancı anahtarlar saklanıp kaldırılır (c68). Bu noktadan sonra HER çıkış yolunda
        // (başarı, hata, iptal) kapanış çağrılır ki kısıtlar yeniden kurulsun.
        let run = rpc(ctx, "admin_restore_begin", json!({ "p_tables": names })).await?;
        let run = run.as_str().ok_or("Geri yükleme başlatılamadı")?.to_string();
        let mut outcome: Result<(), String> = Ok(());
        for t in &todo {
            if let Err(e) = ctx.check() {
                outcome = Err(e);
                break;
            }
            ctx.progress(true, |p| {
                p.step = "tables".into();
                p.label = t.name.clone();
            });
            match restore_table(ctx, &mut z, &run, t).await {
                Ok(n) => {
                    rows_written += n;
                    tables_ok += 1;
                }
                Err(e) if e == CANCELLED => {
                    outcome = Err(e);
                    break;
                }
                Err(e) => ctx.err("table", &t.name, e),
            }
            ctx.progress(true, |p| p.tables_done += 1);
        }
        ctx.progress(true, |p| {
            p.step = "finish".into();
            p.label.clear();
        });
        ctx.cleanup.store(true, Ordering::Relaxed);
        let closed = close_restore(ctx, &run, o.delete_orphans).await;
        ctx.cleanup.store(false, Ordering::Relaxed);
        match closed {
            Ok(v) => report = v,
            Err(e) => {
                let msg = format!("Yabancı anahtarlar yeniden kurulamadı: {e}. Yönetim › Yedekleme sayfasındaki \"Onar\" düğmesine bas.");
                if outcome.is_ok() {
                    outcome = Err(msg);
                } else {
                    ctx.err("finish", "admin_restore_finish", msg);
                }
            }
        }
        outcome?;
    }

    let (mut up, mut same, mut failed, mut deleted) = (0u64, 0u64, 0u64, 0u64);
    let mut missing_buckets: Vec<String> = Vec::new();
    if o.storage {
        ctx.progress(true, |p| {
            p.step = "files".into();
            p.label.clear();
        });
        let have: HashSet<String> = arr(rpc(ctx, "admin_backup_buckets", json!({})).await?)
            .iter()
            .filter_map(|b| b.get("id").and_then(Value::as_str).map(str::to_string))
            .collect();
        let current = list_objects(ctx).await?;
        let cur: HashMap<(&str, &str), &Obj> = current.iter().map(|x| ((x.bucket.as_str(), x.name.as_str()), x)).collect();
        let mut batch: Vec<(&Obj, Vec<u8>)> = Vec::new();
        for (idx, x) in restorable.iter().enumerate() {
            ctx.check()?;
            let mut skip = false;
            if !have.contains(&x.bucket) {
                if !missing_buckets.contains(&x.bucket) {
                    missing_buckets.push(x.bucket.clone());
                    ctx.err("bucket", &x.bucket, "Bu kova artık yok; dosyaları yüklenmedi (kova oluşturulmaz)");
                }
                skip = true;
            } else if let Some(c) = cur.get(&(x.bucket.as_str(), x.name.as_str())) {
                if c.size == x.size && !x.updated_at.is_empty() && c.updated_at == x.updated_at {
                    same += 1;
                    skip = true;
                }
            }
            if !skip {
                match z.by_name(&x.entry) {
                    Ok(mut f) => {
                        let mut data = Vec::with_capacity(x.size.min(64 * 1024 * 1024) as usize);
                        match f.read_to_end(&mut data) {
                            Ok(_) => batch.push((*x, data)),
                            Err(e) => {
                                failed += 1;
                                ctx.err("file", &format!("{}/{}", x.bucket, x.name), e.to_string());
                            }
                        }
                    }
                    Err(_) => {
                        failed += 1;
                        ctx.err("file", &format!("{}/{}", x.bucket, x.name), "yedekte bulunamadı");
                    }
                }
            }
            if skip {
                let size = x.size;
                ctx.progress(false, |p| {
                    p.files_done += 1;
                    p.bytes_done += size;
                });
            }
            if batch.len() >= PARALLEL || (idx + 1 == restorable.len() && !batch.is_empty()) {
                let results = futures_util::future::join_all(batch.iter().map(|(x, d)| upload_obj(ctx, x, d))).await;
                for ((x, _), res) in batch.iter().zip(results) {
                    match res {
                        Ok(()) => up += 1,
                        Err(e) if e == CANCELLED => return Err(e),
                        Err(e) => {
                            failed += 1;
                            ctx.err("file", &format!("{}/{}", x.bucket, x.name), e);
                        }
                    }
                    let (size, label) = (x.size, format!("{}/{}", x.bucket, x.name));
                    ctx.progress(false, |p| {
                        p.files_done += 1;
                        p.bytes_done += size;
                        p.label = label;
                    });
                }
                batch.clear();
            }
        }
        if o.delete_extra {
            ctx.progress(true, |p| {
                p.step = "delete".into();
                p.label.clear();
            });
            // Yalnızca yedeğin kapsadığı kovalarda, yedekte adı geçmeyen dosyalar silinir
            let covered: HashSet<&str> = manifest["storage"]["buckets"].as_array().map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
            let known: HashSet<(&str, &str)> = objects.iter().map(|x| (x.bucket.as_str(), x.name.as_str())).collect();
            for c in &current {
                ctx.check()?;
                if !covered.contains(c.bucket.as_str()) || known.contains(&(c.bucket.as_str(), c.name.as_str())) {
                    continue;
                }
                match delete_obj(ctx, &c.bucket, &c.name).await {
                    Ok(()) => deleted += 1,
                    Err(e) if e == CANCELLED => return Err(e),
                    Err(e) => ctx.err("delete", &format!("{}/{}", c.bucket, c.name), e),
                }
            }
        }
    }
    Ok(json!({
        "tables": tables_ok,
        "tables_total": todo.len(),
        "tables_skipped": skipped,
        "rows": rows_written,
        "files_uploaded": up,
        "files_same": same,
        "files_failed": failed,
        "files_deleted": deleted,
        "missing_buckets": missing_buckets,
        "report": report,
    }))
}

// ---------------------------------------------------------------------------
// Komutlar
// ---------------------------------------------------------------------------

fn begin(app: &AppHandle, auth: Auth, kind: &'static str) -> Result<(Arc<Ctx>, String), String> {
    let url = auth.url.trim().trim_end_matches('/').to_string();
    if !url.starts_with("https://") || auth.anon_key.is_empty() || auth.token.is_empty() {
        return Err("Bulut bağlantısı ya da oturum yok".into());
    }
    let client = client()?;
    let mut job = JOB.lock();
    if job.is_some() {
        return Err("Süren bir yedekleme / geri yükleme işi var".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    *job = Some(cancel.clone());
    *TOKEN.lock() = auth.token;
    let ctx = Ctx {
        app: app.clone(),
        client,
        url,
        key: auth.anon_key,
        cancel,
        cleanup: AtomicBool::new(false),
        start: Instant::now(),
        p: Mutex::new(Progress { kind, ..Default::default() }),
        last_emit: Mutex::new(Instant::now()),
        errors: Mutex::new(Vec::new()),
    };
    Ok((Arc::new(ctx), auth.project_ref))
}

fn finish(ctx: &Ctx, kind: &'static str, path: &Path, res: Result<Value, String>) {
    *JOB.lock() = None;
    TOKEN.lock().clear();
    let cancelled = matches!(&res, Err(e) if e == CANCELLED);
    let (ok, error, summary) = match res {
        Ok(s) => (true, String::new(), s),
        Err(e) => (false, e, Value::Null),
    };
    if ok {
        ctx.progress(true, |p| p.step = "done".into());
    }
    let _ = ctx.app.emit(
        "backup-done",
        Done {
            kind,
            ok,
            cancelled,
            error,
            path: path.to_string_lossy().to_string(),
            summary,
            errors: ctx.errors.lock().clone(),
            elapsed_ms: ctx.start.elapsed().as_millis() as u64,
        },
    );
}

/// Yedeği `dest` dosyasına indir (arka planda; sonuç "backup-done" olayıyla gelir)
#[tauri::command]
pub fn backup_run(app: AppHandle, dest: String, options: BackupOptions, auth: Auth) -> Result<(), String> {
    let dest = PathBuf::from(dest.trim());
    let fname = dest.file_name().and_then(|f| f.to_str()).ok_or("Geçersiz dosya adı")?.to_string();
    if !dest.is_absolute() {
        return Err("Geçersiz dosya yolu".into());
    }
    let part = dest.with_file_name(format!("{fname}.part"));
    let (ctx, project_ref) = begin(&app, auth, "backup")?;
    std::thread::spawn(move || {
        let res = tauri::async_runtime::block_on(backup_job(&ctx, &part, &dest, &options, &project_ref));
        if res.is_err() {
            let _ = std::fs::remove_file(&part);
        }
        finish(&ctx, "backup", &dest, res);
    });
    Ok(())
}

/// Yedekten geri yükle (arka planda; sonuç "backup-done" olayıyla gelir)
#[tauri::command]
pub fn restore_run(app: AppHandle, path: String, options: RestoreOptions, auth: Auth) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if !path.is_file() {
        return Err("Yedek dosyası bulunamadı".into());
    }
    let (ctx, _) = begin(&app, auth, "restore")?;
    std::thread::spawn(move || {
        let res = tauri::async_runtime::block_on(restore_job(&ctx, &path, &options));
        finish(&ctx, "restore", &path, res);
    });
    Ok(())
}

/// Yedek dosyasını incele: manifest + SHA-256 doğrulaması (ağ kullanmaz)
#[tauri::command]
pub async fn backup_inspect(path: String) -> Result<Inspect, String> {
    let p = PathBuf::from(path.trim());
    tauri::async_runtime::spawn_blocking(move || inspect_blocking(&p)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn backup_cancel() {
    if let Some(c) = JOB.lock().as_ref() {
        c.store(true, Ordering::Relaxed);
    }
}

/// Arayüz yenilenen erişim anahtarını iletir (yalnızca süren iş varken saklanır)
#[tauri::command]
pub fn backup_token(token: String) {
    if JOB.lock().is_some() && !token.is_empty() {
        *TOKEN.lock() = token;
    }
}

#[tauri::command]
pub fn backup_busy() -> bool {
    JOB.lock().is_some()
}

/// Dosyayı klasöründe göster
#[tauri::command]
pub fn backup_reveal(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    #[cfg(windows)]
    {
        if p.is_file() {
            return std::process::Command::new("explorer").arg("/select,").arg(&p).spawn().map(|_| ()).map_err(|e| e.to_string());
        }
    }
    let dir = if p.is_dir() { p.as_path() } else { p.parent().ok_or("klasör yok")? };
    #[cfg(windows)]
    let cmd = "explorer";
    #[cfg(target_os = "macos")]
    let cmd = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = "xdg-open";
    std::process::Command::new(cmd).arg(dir).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn sanitize_windows_rules() {
        assert_eq!(sanitize_segment("a<b>c:d\"e|f?g*h\\i"), "a_b_c_d_e_f_g_h_i");
        assert_eq!(sanitize_segment("con"), "_con");
        assert_eq!(sanitize_segment("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_segment("Lpt9.png"), "_Lpt9.png");
        assert_eq!(sanitize_segment("com0"), "com0");
        assert_eq!(sanitize_segment("console.png"), "console.png");
        assert_eq!(sanitize_segment(".."), "__");
        assert_eq!(sanitize_segment("."), "_");
        assert_eq!(sanitize_segment(""), "_");
        assert_eq!(sanitize_segment("name."), "name_");
        assert_eq!(sanitize_segment("name "), "name_");
        assert_eq!(sanitize_segment("a\u{1}b\tc"), "a_b_c");
        assert_eq!(sanitize_segment("şğü ıİ.png"), "şğü ıİ.png");
        let long = format!("{}.webp", "ş".repeat(300));
        let s = sanitize_segment(&long);
        assert!(s.len() <= 180 && s.ends_with(".webp"));
    }

    #[test]
    fn entry_paths_are_unique_and_inside() {
        let mut used = HashSet::new();
        let a = entry_path("shots", "u1/A.png", &mut used);
        let b = entry_path("shots", "u1/a.png", &mut used);
        let c = entry_path("shots", "../../etc/passwd", &mut used);
        let d = entry_path("shots", "u1/a:b.png", &mut used);
        let e = entry_path("shots", "u1/a?b.png", &mut used);
        assert_eq!(a, "storage/files/shots/u1/A.png");
        assert_eq!(b, "storage/files/shots/u1/a~2.png");
        assert_eq!(c, "storage/files/shots/__/__/etc/passwd");
        assert_eq!(d, "storage/files/shots/u1/a_b.png");
        assert_eq!(e, "storage/files/shots/u1/a_b~2.png");
        assert!(!c.split('/').any(|s| s == ".."));
        assert_eq!(entry_path("b", "", &mut used), "storage/files/b/_");
    }

    #[test]
    fn encode_keeps_slashes() {
        assert_eq!(encode_path("a b/ç#?.png"), "a%20b/%C3%A7%23%3F.png");
    }

    #[test]
    fn manifest_validation() {
        let good = json!({"format": 1, "app": "SRTR Pitwall", "project_ref": "abc", "created_at": "2026-01-01T00:00:00Z",
            "tables": [{"name": "profiles", "rows": 2, "sha256": "x", "file": "tables/profiles.ndjson"}]});
        let m = validate_manifest(&good).unwrap();
        assert_eq!(m.project_ref, "abc");
        assert_eq!(m.tables.len(), 1);
        assert!(m.tables[0].complete);
        let mut bad = good.clone();
        bad["format"] = json!(2);
        assert!(validate_manifest(&bad).is_err());
        let mut bad = good.clone();
        bad["app"] = json!("Other");
        assert!(validate_manifest(&bad).is_err());
        let mut bad = good.clone();
        bad["tables"][0]["file"] = json!("tables/../../x");
        assert!(validate_manifest(&bad).is_err());
        let mut bad = good.clone();
        bad["tables"][0]["file"] = json!("manifest.json");
        assert!(validate_manifest(&bad).is_err());
        let mut bad = good.clone();
        bad["tables"] = json!([good["tables"][0], good["tables"][0]]);
        assert!(validate_manifest(&bad).is_err());
        assert!(validate_manifest(&json!({})).is_err());
    }

    #[test]
    fn ndjson_roundtrip_and_paging() {
        let rows: Vec<Value> = (0..25).map(|i| json!({"id": i, "t": "satır\n\"x\""})).collect();
        let mut buf = Vec::new();
        let mut h = Sha256::new();
        let n = write_ndjson(&mut buf, &rows, &mut h).unwrap();
        assert_eq!(n as usize, buf.len());
        let sha = hex(&h.finalize());
        let (sha2, lines) = hash_lines(Cursor::new(buf.clone())).unwrap();
        assert_eq!(sha, sha2);
        assert_eq!(lines, 25);

        let mut p = NdjsonPager::new(Cursor::new(buf.clone()), 10, usize::MAX);
        let sizes: Vec<usize> = std::iter::from_fn(|| p.next_page().unwrap()).map(|v| v.len()).collect();
        assert_eq!(sizes, vec![10, 10, 5]);

        // Bayt sınırı: her satır tek başına sayfa olur
        let mut p = NdjsonPager::new(Cursor::new(buf.clone()), 1000, 1);
        let mut all = Vec::new();
        while let Some(pg) = p.next_page().unwrap() {
            assert_eq!(pg.len(), 1);
            all.extend(pg);
        }
        assert_eq!(all, rows);

        let mut p = NdjsonPager::new(Cursor::new(b"\n\n".to_vec()), 10, 10);
        assert!(p.next_page().unwrap().is_none());
        let mut p = NdjsonPager::new(Cursor::new(b"{\"a\":1}\nnot json\n".to_vec()), 10, 1000);
        assert!(p.next_page().is_err());
        let mut p = NdjsonPager::new(Cursor::new(b"[1,2]\n".to_vec()), 10, 1000);
        assert!(p.next_page().is_err());
    }
}
