//! Çalan müzik (sadece Windows): Windows'un medya oturumları (Global System Media Transport Controls, GSMTC).
//!
//! Spotify, tarayıcıda (Chrome / Edge / Firefox) çalan YouTube Music / YouTube, Apple Music, Deezer, TIDAL ve medya
//! tuşlarını destekleyen diğer oynatıcılar şu an çalanı Windows'a bildirir (ses tuşlarına basınca çıkan medya kutusu).
//! Burada o bilgi okunur: başlık, sanatçı, albüm, kapak resmi, süre / konum, çalıyor mu; önceki / sonraki / durdur.
//! Hesap bağlama, giriş ya da API anahtarı gerekmez.
//!
//! Tüm çağrılar tek iş parçacığında (music.rs) yapılır; WinRT nesneleri iş parçacıkları arasında taşınmaz.
//! Bu dosya bilerek kendi başına (sadece std + windows) yazıldı: Linux'ta da tip denetimi yapılabilsin.

use std::time::{Duration, Instant};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::DataReader;
use windows_future::IAsyncOperation;

/// Windows.Foundation.AsyncStatus
const ASYNC_STARTED: i32 = 0;
const ASYNC_COMPLETED: i32 = 1;
/// 1601-01-01 ile 1970-01-01 arası (100 ns birimi)
const EPOCH_DIFF: i64 = 116_444_736_000_000_000;
/// Kapak resmi en çok bu kadar olabilir (daha büyüğü atlanır)
const ART_MAX: u64 = 3 * 1024 * 1024;

fn err(e: &windows::core::Error) -> String {
    format!("{} (0x{:08X})", e.message().to_string().trim(), e.code().0 as u32)
}

/// Zaman uyumsuz işlemi en çok `ms` bekle (takılan bir oynatıcı iş parçacığını kilitlemesin)
fn wait<T: windows::core::RuntimeType + 'static>(op: &IAsyncOperation<T>, ms: u64) -> Result<T, String> {
    let start = Instant::now();
    loop {
        match op.Status() {
            Ok(s) if s.0 == ASYNC_STARTED => {}
            Ok(s) if s.0 == ASYNC_COMPLETED => return op.GetResults().map_err(|e| err(&e)),
            Ok(_) => return op.GetResults().map_err(|e| err(&e)),
            Err(e) => return Err(err(&e)),
        }
        if start.elapsed() > Duration::from_millis(ms) {
            let _ = op.Cancel();
            return Err("timeout".into());
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// Bir oturumun anlık durumu
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Snap {
    /// Oynatıcının uygulama kimliği (ör. "Spotify.exe", "Chrome", "MSEdge")
    pub app_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    /// Konum (ms) ve konumun ölçüldüğü an (epoch ms); süre 0: oynatıcı süre bildirmiyor
    pub pos_ms: i64,
    pub pos_at: i64,
    pub dur_ms: i64,
    pub can_prev: bool,
    pub can_next: bool,
    pub can_toggle: bool,
}

/// Kapak resmi: (bayt, MIME türü)
pub type Art = (Vec<u8>, String);

pub struct Media {
    mgr: Manager,
}

impl Media {
    pub fn new() -> Result<Media, String> {
        let op = Manager::RequestAsync().map_err(|e| err(&e))?;
        Ok(Media { mgr: wait(&op, 5000)? })
    }

    /// Açık medya oturumları: (uygulama kimliği, çalıyor mu)
    pub fn sessions(&self) -> Vec<(String, bool)> {
        self.list()
            .iter()
            .map(|s| {
                (
                    s.SourceAppUserModelId().map(|x| x.to_string()).unwrap_or_default(),
                    is_playing(s),
                )
            })
            .collect()
    }

    fn list(&self) -> Vec<Session> {
        self.mgr
            .GetSessions()
            .map(|v| v.into_iter().collect())
            .unwrap_or_default()
    }

    /// Gösterilecek oturum. `pref`: "auto" (çalan; birden çoksa Windows'un şu anki oturumu), "spotify", "browser"
    /// ya da bir uygulama kimliği. Tercih edilen kaynak açık değilse otomatiğe düşülür.
    fn pick(&self, pref: &str) -> Option<Session> {
        let all = self.list();
        if all.is_empty() {
            return None;
        }
        let id = |s: &Session| s.SourceAppUserModelId().map(|x| x.to_string()).unwrap_or_default();
        let wanted: Vec<&Session> = all.iter().filter(|s| matches_pref(&id(s), pref)).collect();
        let pool: Vec<&Session> = if wanted.is_empty() { all.iter().collect() } else { wanted };
        let cur = self.mgr.GetCurrentSession().ok().map(|c| id(&c));
        // Çalan ve Windows'un şu anki oturumu > çalan > şu anki > ilk
        pool.iter()
            .find(|s| is_playing(s) && Some(id(s)) == cur)
            .or_else(|| pool.iter().find(|s| is_playing(s)))
            .or_else(|| pool.iter().find(|s| Some(id(s)) == cur))
            .or_else(|| pool.first())
            .map(|s| (*s).clone())
    }

    /// Şu an gösterilecek parça (oturum yoksa None). `art_for`: kapak resmi bu parça anahtarı için istenir
    /// (anahtar değişmediyse resim tekrar okunmaz).
    pub fn snapshot(&self, pref: &str, want_art: bool) -> Result<Option<(Snap, Option<Art>)>, String> {
        let Some(s) = self.pick(pref) else { return Ok(None) };
        let mut snap = Snap {
            app_id: s.SourceAppUserModelId().map(|x| x.to_string()).unwrap_or_default(),
            playing: is_playing(&s),
            ..Snap::default()
        };
        let mut art = None;
        if let Ok(op) = s.TryGetMediaPropertiesAsync() {
            if let Ok(p) = wait(&op, 1500) {
                snap.title = p.Title().map(|x| x.to_string()).unwrap_or_default();
                snap.artist = p.Artist().map(|x| x.to_string()).unwrap_or_default();
                snap.album = p.AlbumTitle().map(|x| x.to_string()).unwrap_or_default();
                if snap.artist.is_empty() {
                    snap.artist = p.AlbumArtist().map(|x| x.to_string()).unwrap_or_default();
                }
                if want_art {
                    art = p.Thumbnail().ok().and_then(|r| read_art(&r).ok());
                }
            }
        }
        if let Ok(tl) = s.GetTimelineProperties() {
            let start = tl.StartTime().map(|t| t.Duration).unwrap_or(0);
            let end = tl.EndTime().map(|t| t.Duration).unwrap_or(0);
            let pos = tl.Position().map(|t| t.Duration).unwrap_or(0);
            let at = tl.LastUpdatedTime().map(|d| d.UniversalTime).unwrap_or(0);
            snap.dur_ms = ((end - start) / 10_000).max(0);
            snap.pos_ms = ((pos - start) / 10_000).max(0);
            snap.pos_at = if at > EPOCH_DIFF { (at - EPOCH_DIFF) / 10_000 } else { 0 };
        }
        if let Ok(info) = s.GetPlaybackInfo() {
            if let Ok(c) = info.Controls() {
                snap.can_prev = c.IsPreviousEnabled().unwrap_or(false);
                snap.can_next = c.IsNextEnabled().unwrap_or(false);
                snap.can_toggle = c.IsPlayPauseToggleEnabled().unwrap_or(false)
                    || c.IsPlayEnabled().unwrap_or(false)
                    || c.IsPauseEnabled().unwrap_or(false);
            }
        }
        Ok(Some((snap, art)))
    }

    /// "toggle" | "play" | "pause" | "next" | "prev"
    pub fn control(&self, pref: &str, action: &str) -> Result<bool, String> {
        let s = self.pick(pref).ok_or_else(|| "no_session".to_string())?;
        let op = match action {
            "play" => s.TryPlayAsync(),
            "pause" => s.TryPauseAsync(),
            "next" => s.TrySkipNextAsync(),
            "prev" => s.TrySkipPreviousAsync(),
            _ => s.TryTogglePlayPauseAsync(),
        }
        .map_err(|e| err(&e))?;
        wait(&op, 2000)
    }
}

fn is_playing(s: &Session) -> bool {
    s.GetPlaybackInfo()
        .and_then(|i| i.PlaybackStatus())
        .map(|st| st == Status::Playing)
        .unwrap_or(false)
}

/// Uygulama kimliği tercihle eşleşiyor mu
pub fn matches_pref(app_id: &str, pref: &str) -> bool {
    let a = app_id.to_ascii_lowercase();
    match pref {
        "" | "auto" => true,
        "spotify" => a.contains("spotify"),
        "browser" => is_browser(&a),
        p => a == p.to_ascii_lowercase(),
    }
}

pub fn is_browser(id_lower: &str) -> bool {
    ["chrome", "msedge", "firefox", "opera", "brave", "vivaldi", "yandex"]
        .iter()
        .any(|b| id_lower.contains(b))
        || id_lower == "308046b0af4a39cb"
        || id_lower == "6f193ccc56814779"
}

fn read_art(r: &windows::Storage::Streams::IRandomAccessStreamReference) -> Result<Art, String> {
    let st = wait(&r.OpenReadAsync().map_err(|e| err(&e))?, 1500)?;
    let size = st.Size().map_err(|e| err(&e))?;
    if size == 0 || size > ART_MAX {
        return Err("art_size".into());
    }
    let mime = st.ContentType().map(|x| x.to_string()).unwrap_or_default();
    let input = st.GetInputStreamAt(0).map_err(|e| err(&e))?;
    let rd = DataReader::CreateDataReader(&input).map_err(|e| err(&e))?;
    let n = wait(&rd.LoadAsync(size as u32).map_err(|e| err(&e))?, 1500)?;
    let mut buf = vec![0u8; n as usize];
    rd.ReadBytes(&mut buf).map_err(|e| err(&e))?;
    let mime = if mime.starts_with("image/") { mime } else { sniff(&buf).to_string() };
    Ok((buf, mime))
}

/// İçerikten görsel türü (bazı oynatıcılar türü boş bildirir)
pub fn sniff(b: &[u8]) -> &'static str {
    if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if b.starts_with(b"GIF8") {
        "image/gif"
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        "image/webp"
    } else if b.starts_with(b"BM") {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}
