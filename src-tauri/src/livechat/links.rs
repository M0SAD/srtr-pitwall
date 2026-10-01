//! Kanal linklerini tanıma: platform, kaynak anahtarı (aynı kanal iki kez eklenmesin), etiket.
//! MultiChatOverlay `platformlar/linkler.py` ile aynı kurallar (regex yerine elle ayrıştırma).
//!
//! Desteklenenler:
//!   YouTube: youtube.com/@handle, /c/ad, /user/ad, /channel/UC…, /watch?v=ID, /live/ID, youtu.be/ID, /embed/ID, /shorts/ID
//!   Twitch:  twitch.tv/kanal (popout/ dahil)
//!   Kick:    kick.com/kanal (popout/ dahil)

use super::model::Platform;
use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum YtKind {
    Video,
    Handle,
    Custom,
    User,
    Channel,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub platform: Platform,
    /// Temizlenmiş link
    pub url: String,
    /// Tekilleştirme anahtarı: youtube:v:<vid> | youtube:<tür>:<id küçük> | twitch:<ad küçük> | kick:<ad küçük>
    pub key: String,
    /// Linkten çıkan etiket (kanal adı öğrenilince arayüz onu gösterir)
    pub label: String,
    /// Kanal adı / handle / video kimliği
    pub ident: String,
    /// Sadece YouTube
    #[serde(skip_serializing_if = "Option::is_none")]
    pub yt: Option<YtKind>,
}

/// Yüzde kodlamasını çözer (%C4%B0 → İ); geçersizse olduğu gibi bırakır
fn percent_decode(s: &str) -> String {
    if !s.contains('%') {
        return s.to_string();
    }
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = |c: u8| (c as char).to_digit(16);
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

/// Yapıştırılan linki düzeltir: kodlanmış harfleri çözer, tırnak/<> ve sondaki / işaretini atar.
pub fn clean_link(token: &str) -> String {
    let t = token.trim().trim_matches(|c| c == '<' || c == '>' || c == '"' || c == '\'');
    percent_decode(t).trim().trim_end_matches('/').to_string()
}

/// Python'daki `\w`: harf, rakam, alt çizgi (Unicode)
fn is_w(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Baştaki `[\w\-.]+` / `[\w\-]+` dizisi
fn take_ident(s: &str, dot: bool) -> &str {
    let end = s
        .char_indices()
        .find(|&(_, c)| !(is_w(c) || c == '-' || (dot && c == '.')))
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    &s[..end]
}

/// (host küçük harf, "www."/"m." atılmış ; yol ; sorgu)
fn split_url(url: &str) -> Option<(String, String, String)> {
    let mut rest = url.trim();
    if rest.get(..8).is_some_and(|p| p.eq_ignore_ascii_case("https://")) {
        rest = &rest[8..];
    } else if rest.get(..7).is_some_and(|p| p.eq_ignore_ascii_case("http://")) {
        rest = &rest[7..];
    }
    let (host, after) = match rest.find(|c| c == '/' || c == '?' || c == '#') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    let mut host = host.to_ascii_lowercase();
    for p in ["www.", "m."] {
        if let Some(h) = host.strip_prefix(p) {
            host = h.to_string();
        }
    }
    if host.is_empty() {
        return None;
    }
    let after = after.split('#').next().unwrap_or("");
    let (path, query) = match after.find('?') {
        Some(i) => (&after[..i], &after[i + 1..]),
        None => (after, ""),
    };
    Some((host, path.trim_start_matches('/').to_string(), query.to_string()))
}

fn query_get<'a>(q: &'a str, key: &str) -> Option<&'a str> {
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        (k == key).then_some(v)
    })
}

/// YouTube video kimliği (watch?v=, live/, youtu.be/, embed/, shorts/)
pub fn youtube_video_id(url: &str) -> Option<String> {
    let (host, path, query) = split_url(url)?;
    let id = if host == "youtu.be" {
        take_ident(&path, false)
    } else if host == "youtube.com" {
        let (first, rest) = path.split_once('/').unwrap_or((path.as_str(), ""));
        match first.to_ascii_lowercase().as_str() {
            "watch" => query_get(&query, "v").map(|v| take_ident(v, false)).unwrap_or(""),
            "live" | "embed" | "shorts" => take_ident(rest, false),
            _ => "",
        }
    } else {
        ""
    };
    (!id.is_empty()).then(|| id.to_string())
}

fn youtube_channel(url: &str) -> Option<(YtKind, String)> {
    let (host, path, _) = split_url(url)?;
    if host != "youtube.com" {
        return None;
    }
    if let Some(h) = path.strip_prefix('@') {
        let id = take_ident(h, true);
        return (!id.is_empty()).then(|| (YtKind::Handle, id.to_string()));
    }
    let (first, rest) = path.split_once('/')?;
    let (kind, dot) = match first.to_ascii_lowercase().as_str() {
        "c" => (YtKind::Custom, true),
        "user" => (YtKind::User, true),
        "channel" => (YtKind::Channel, false),
        _ => return None,
    };
    let id = take_ident(rest, dot);
    (!id.is_empty()).then(|| (kind, id.to_string()))
}

fn simple_channel(url: &str, host_want: &str, excluded: &[&str]) -> Option<String> {
    let (host, path, _) = split_url(url)?;
    if host != host_want {
        return None;
    }
    let path = path.strip_prefix("popout/").unwrap_or(&path);
    let name = take_ident(path, false);
    if name.is_empty() || excluded.iter().any(|x| x.eq_ignore_ascii_case(name)) {
        return None;
    }
    Some(name.to_string())
}

pub fn twitch_channel(url: &str) -> Option<String> {
    simple_channel(url, "twitch.tv", &["videos", "directory", "settings", "downloads", "p", "search"])
}

pub fn kick_channel(url: &str) -> Option<String> {
    simple_channel(url, "kick.com", &["categories", "browse", "following", "search", "video"])
}

/// Linki tanır (tanınmazsa None)
pub fn parse_link(raw: &str) -> Option<Link> {
    let url = clean_link(raw);
    if url.is_empty() {
        return None;
    }
    let low = url.to_lowercase();
    if low.contains("youtube.com") || low.contains("youtu.be") {
        if let Some(vid) = youtube_video_id(&url) {
            return Some(Link {
                platform: Platform::Youtube,
                key: format!("youtube:v:{vid}"),
                label: format!("video {vid}"),
                ident: vid,
                yt: Some(YtKind::Video),
                url,
            });
        }
        let (kind, id) = youtube_channel(&url)?;
        let tname = match kind {
            YtKind::Handle => "handle",
            YtKind::Custom => "custom",
            YtKind::User => "user",
            YtKind::Channel => "channel",
            YtKind::Video => "v",
        };
        let label = match kind {
            YtKind::Handle => format!("@{id}"),
            YtKind::Channel => format!("{}…", id.chars().take(8).collect::<String>()),
            _ => id.clone(),
        };
        return Some(Link {
            platform: Platform::Youtube,
            key: format!("youtube:{tname}:{}", id.to_lowercase()),
            label,
            ident: id,
            yt: Some(kind),
            url,
        });
    }
    if low.contains("twitch.tv") {
        let ch = twitch_channel(&url)?;
        return Some(Link { platform: Platform::Twitch, key: format!("twitch:{}", ch.to_lowercase()), label: ch.clone(), ident: ch, yt: None, url });
    }
    if low.contains("kick.com") {
        let ch = kick_channel(&url)?;
        return Some(Link { platform: Platform::Kick, key: format!("kick:{}", ch.to_lowercase()), label: ch.clone(), ident: ch, yt: None, url });
    }
    None
}

/// Serbest metinden linkleri ayıklar (boşluk, virgül, noktalı virgül, satır ayırıcı).
/// Dönüş: (tanınanlar — tekrarlar atılmış, tanınmayanlar)
pub fn parse_many(text: &str) -> (Vec<Link>, Vec<String>) {
    let mut valid: Vec<Link> = Vec::new();
    let mut invalid = Vec::new();
    for tok in text.split(|c: char| c.is_whitespace() || c == ',' || c == ';') {
        let t = clean_link(tok);
        if t.is_empty() {
            continue;
        }
        match parse_link(&t) {
            Some(l) => {
                if !valid.iter().any(|x| x.key == l.key) {
                    valid.push(l);
                }
            }
            None => invalid.push(t),
        }
    }
    (valid, invalid)
}

/// YouTube kanal linkinin canlı yayın sayfası
pub fn youtube_live_page(l: &Link) -> Option<String> {
    let id = &l.ident;
    Some(match l.yt.as_ref()? {
        YtKind::Handle => format!("https://www.youtube.com/@{id}/live"),
        YtKind::Custom => format!("https://www.youtube.com/c/{id}/live"),
        YtKind::User => format!("https://www.youtube.com/user/{id}/live"),
        YtKind::Channel => format!("https://www.youtube.com/channel/{id}/live"),
        YtKind::Video => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn youtube_links() {
        let l = parse_link("https://www.youtube.com/@ErkinAzcan").unwrap();
        assert_eq!(l.platform, Platform::Youtube);
        assert_eq!(l.key, "youtube:handle:erkinazcan");
        assert_eq!(l.label, "@ErkinAzcan");
        assert_eq!(youtube_live_page(&l).unwrap(), "https://www.youtube.com/@ErkinAzcan/live");

        let l = parse_link("youtube.com/@%C4%B0nanDemirel/").unwrap();
        assert_eq!(l.ident, "İnanDemirel");

        let l = parse_link("https://www.youtube.com/channel/UCabcdefghijklmnop12345").unwrap();
        assert_eq!(l.key, "youtube:channel:ucabcdefghijklmnop12345");
        assert_eq!(l.label, "UCabcdef…");

        let l = parse_link("https://www.youtube.com/watch?feature=x&v=dQw4w9WgXcQ&t=1").unwrap();
        assert_eq!(l.key, "youtube:v:dQw4w9WgXcQ");
        assert_eq!(parse_link("https://youtu.be/dQw4w9WgXcQ?si=1").unwrap().ident, "dQw4w9WgXcQ");
        assert_eq!(parse_link("https://m.youtube.com/live/abcDEF12345").unwrap().ident, "abcDEF12345");
        assert_eq!(parse_link("https://www.youtube.com/c/Foo.Bar/live").unwrap().key, "youtube:custom:foo.bar");
        assert!(parse_link("https://www.youtube.com/results?search_query=x").is_none());
    }

    #[test]
    fn twitch_kick_links() {
        let l = parse_link("https://www.twitch.tv/ErkinAzcan").unwrap();
        assert_eq!((l.platform, l.key.as_str(), l.label.as_str()), (Platform::Twitch, "twitch:erkinazcan", "ErkinAzcan"));
        assert_eq!(parse_link("twitch.tv/popout/foo_bar/chat").unwrap().ident, "foo_bar");
        assert!(parse_link("https://www.twitch.tv/directory").is_none());
        let l = parse_link("https://kick.com/erkin-azcan").unwrap();
        assert_eq!(l.key, "kick:erkin-azcan");
        assert!(parse_link("https://kick.com/categories").is_none());
        assert!(parse_link("https://example.com/x").is_none());
    }

    #[test]
    fn many() {
        let (v, inv) = parse_many("https://kick.com/a, twitch.tv/b;https://kick.com/A\nfoo");
        assert_eq!(v.len(), 2);
        assert_eq!(inv, vec!["foo".to_string()]);
    }
}
