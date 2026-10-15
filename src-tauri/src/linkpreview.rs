//! Sohbetlerdeki bağlantıların önizlemesi (Discord gibi): sayfanın başlığı, açıklaması, görseli.
//!
//! Sayfa uygulamanın kendisinden indirilir (arayüzün CSP'si dış sitelere istek atmaya izin vermez). Güvenlik:
//! yalnızca http / https; yerel ağ, localhost ve özel IP adresleri reddedilir (yönlendirmeler dahil); en çok 512 KB,
//! 6 sn; çerez gönderilmez. Sonuçlar 1 saat bellekte tutulur.

use std::collections::HashMap;
use std::net::{IpAddr, ToSocketAddrs};
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct Preview {
    pub url: String,
    /// "page" | "image"
    pub kind: &'static str,
    pub site: String,
    pub title: String,
    pub description: String,
    /// https görsel adresi ("" = yok)
    pub image: String,
}

static CACHE: Mutex<Option<HashMap<String, (Instant, Option<Preview>)>>> =
    parking_lot::const_mutex(None);
const MAX_BYTES: usize = 512 * 1024;

fn private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            v.is_private()
                || v.is_loopback()
                || v.is_link_local()
                || v.is_unspecified()
                || v.is_broadcast()
                || v.is_multicast()
                || v.octets()[0] == 100 && (v.octets()[1] & 0xc0) == 64 // 100.64/10 (CGNAT)
                || v.octets()[0] == 0
        }
        IpAddr::V6(v) => {
            v.is_loopback()
                || v.is_unspecified()
                || v.is_multicast()
                || (v.segments()[0] & 0xfe00) == 0xfc00 // fc00::/7
                || (v.segments()[0] & 0xffc0) == 0xfe80 // fe80::/10
                || v.to_ipv4_mapped().map(|x| private_ip(IpAddr::V4(x))).unwrap_or(false)
        }
    }
}

/// Ad yerel mi (adres çözülmeden anlaşılanlar)
fn local_name(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    h == "localhost"
        || h.ends_with(".localhost")
        || h.ends_with(".local")
        || h.ends_with(".lan")
        || h.ends_with(".internal")
        || h.ends_with(".home")
        || !h.contains('.')
}

fn host_ok_static(u: &reqwest::Url) -> bool {
    if !matches!(u.scheme(), "http" | "https") {
        return false;
    }
    let Some(h) = u.host_str() else { return false };
    let h = h.trim_start_matches('[').trim_end_matches(']');
    match h.parse::<IpAddr>() {
        Ok(ip) => !private_ip(ip),
        Err(_) => !local_name(h),
    }
}

/// Ad çözülür: adreslerden biri bile yerelse reddedilir
fn host_ok_dns(u: &reqwest::Url) -> bool {
    let Some(host) = u.host_str() else {
        return false;
    };
    let port = u.port_or_known_default().unwrap_or(443);
    match (host.trim_start_matches('[').trim_end_matches(']'), port).to_socket_addrs() {
        Ok(addrs) => {
            let v: Vec<_> = addrs.collect();
            !v.is_empty() && v.iter().all(|a| !private_ip(a.ip()))
        }
        Err(_) => false,
    }
}

fn decode_entities(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let end = rest.as_bytes()[..rest.len().min(12)]
            .iter()
            .position(|&b| b == b';');
        if let Some(e) = end {
            let ent = &rest[1..e];
            let ch = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" | "#39" => Some('\''),
                "nbsp" => Some(' '),
                _ if ent.starts_with("#x") || ent.starts_with("#X") => {
                    u32::from_str_radix(&ent[2..], 16)
                        .ok()
                        .and_then(char::from_u32)
                }
                _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            if let Some(c) = ch {
                out.push(c);
                rest = &rest[e + 1..];
                continue;
            }
        }
        out.push('&');
        rest = &rest[1..];
    }
    out.push_str(rest);
    out
}

/// `<meta a="b" c='d'>` niteliklerini ayrıştır
fn attrs(tag: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    let b = tag.as_bytes();
    let mut i = 0;
    while i < b.len() {
        while i < b.len() && (b[i].is_ascii_whitespace() || b[i] == b'/') {
            i += 1;
        }
        let ks = i;
        while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'=' && b[i] != b'>' {
            i += 1;
        }
        let key = tag[ks..i].to_ascii_lowercase();
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i < b.len() && b[i] == b'=' {
            i += 1;
            while i < b.len() && b[i].is_ascii_whitespace() {
                i += 1;
            }
            let val;
            if i < b.len() && (b[i] == b'"' || b[i] == b'\'') {
                let q = b[i];
                i += 1;
                let vs = i;
                while i < b.len() && b[i] != q {
                    i += 1;
                }
                val = &tag[vs..i.min(tag.len())];
                i += 1;
            } else {
                let vs = i;
                while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'>' {
                    i += 1;
                }
                val = &tag[vs..i];
            }
            if !key.is_empty() {
                m.insert(key, decode_entities(val));
            }
        } else if !key.is_empty() {
            m.insert(key, String::new());
        } else {
            i += 1;
        }
    }
    m
}

fn clean(s: &str, max: usize) -> String {
    let t: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.chars().count() > max {
        let mut x: String = t.chars().take(max).collect();
        x.push('…');
        x
    } else {
        t
    }
}

pub fn parse_html(html: &str, base: &reqwest::Url) -> Preview {
    let lower = html.to_ascii_lowercase();
    let mut meta: HashMap<String, String> = HashMap::new();
    let mut pos = 0;
    while let Some(i) = lower[pos..].find("<meta") {
        let s = pos + i + 5;
        let Some(e) = lower[s..].find('>') else { break };
        let a = attrs(&html[s..s + e]);
        let key = a
            .get("property")
            .or_else(|| a.get("name"))
            .or_else(|| a.get("itemprop"))
            .map(|k| k.to_ascii_lowercase());
        if let (Some(k), Some(v)) = (key, a.get("content")) {
            meta.entry(k).or_insert_with(|| v.clone());
        }
        pos = s + e;
    }
    let title_tag = lower
        .find("<title")
        .and_then(|i| lower[i..].find('>').map(|j| i + j + 1))
        .and_then(|s| {
            lower[s..]
                .find("</title")
                .map(|e| decode_entities(&html[s..s + e]))
        })
        .unwrap_or_default();
    let get = |ks: &[&str]| {
        ks.iter()
            .find_map(|k| meta.get(*k).filter(|v| !v.trim().is_empty()).cloned())
            .unwrap_or_default()
    };
    let title = get(&["og:title", "twitter:title"]);
    let image = get(&[
        "og:image:secure_url",
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
    ]);
    let image = base
        .join(image.trim())
        .ok()
        .filter(|u| u.scheme() == "https" && !image.trim().is_empty())
        .map(|u| u.to_string())
        .unwrap_or_default();
    Preview {
        url: base.to_string(),
        kind: "page",
        site: clean(&get(&["og:site_name", "application-name"]), 60),
        title: clean(if title.is_empty() { &title_tag } else { &title }, 160),
        description: clean(
            &get(&["og:description", "twitter:description", "description"]),
            300,
        ),
        image,
    }
}

async fn fetch(url: &str) -> Result<Option<Preview>, String> {
    let u = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    if !host_ok_static(&u) {
        return Err("Bu adres önizlenemez".into());
    }
    let u2 = u.clone();
    let ok = tauri::async_runtime::spawn_blocking(move || host_ok_dns(&u2))
        .await
        .unwrap_or(false);
    if !ok {
        return Err("Bu adres önizlenemez".into());
    }
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; SRTR-Pitwall link preview; +https://srtrpitwall.com)")
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::custom(|a| {
            if a.previous().len() >= 4 || !host_ok_static(a.url()) {
                a.stop()
            } else {
                a.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client
        .get(u)
        .header("Accept", "text/html,application/xhtml+xml,image/*;q=0.8")
        .header("Accept-Language", "tr,en;q=0.8")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let final_url = resp.url().clone();
    if !host_ok_static(&final_url) || !resp.status().is_success() {
        return Ok(None);
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ctype.starts_with("image/") {
        return Ok((final_url.scheme() == "https").then(|| Preview {
            url: final_url.to_string(),
            kind: "image",
            site: final_url.host_str().unwrap_or("").to_string(),
            title: String::new(),
            description: String::new(),
            image: final_url.to_string(),
        }));
    }
    if !ctype.contains("html") {
        return Ok(None);
    }
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.extend_from_slice(&chunk);
        if buf.len() >= MAX_BYTES {
            break;
        }
        // Başlık bölümü bittiyse gerisi gerekmez
        if buf.len() > 4096 && buf.windows(7).any(|w| w.eq_ignore_ascii_case(b"</head>")) {
            break;
        }
    }
    let html = String::from_utf8_lossy(&buf);
    let mut p = parse_html(&html, &final_url);
    if p.site.is_empty() {
        p.site = final_url
            .host_str()
            .unwrap_or("")
            .trim_start_matches("www.")
            .to_string();
    }
    if p.title.is_empty() && p.description.is_empty() && p.image.is_empty() {
        return Ok(None);
    }
    Ok(Some(p))
}

/// Bağlantı önizlemesi (arayüz: src/app/components/LinkPreview.tsx). Önizlenemezse None.
#[tauri::command]
pub async fn link_preview(url: String) -> Option<Preview> {
    let key = url.trim().to_string();
    if key.len() > 2048 {
        return None;
    }
    if let Some((at, p)) = CACHE.lock().as_ref().and_then(|c| c.get(&key)).cloned() {
        if at.elapsed() < Duration::from_secs(3600) {
            return p;
        }
    }
    let p = fetch(&key).await.ok().flatten();
    let mut c = CACHE.lock();
    let map = c.get_or_insert_with(HashMap::new);
    if map.len() > 300 {
        map.clear();
    }
    map.insert(key, (Instant::now(), p.clone()));
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_graph() {
        let base = reqwest::Url::parse("https://example.com/a/b").unwrap();
        let html = r#"<html><head><title>Yedek &amp; başlık</title>
            <meta property="og:title" content="Spa &quot;Eau Rouge&quot;">
            <meta name='description' content='Açıklama metni'>
            <META PROPERTY="og:image" CONTENT="/img/x.jpg"/>
            <meta property="og:site_name" content="Örnek"></head>"#;
        let p = parse_html(html, &base);
        assert_eq!(p.title, "Spa \"Eau Rouge\"");
        assert_eq!(p.description, "Açıklama metni");
        assert_eq!(p.image, "https://example.com/img/x.jpg");
        assert_eq!(p.site, "Örnek");
        let p2 = parse_html("<title>Sadece &#39;başlık&#39;</title>", &base);
        assert_eq!(p2.title, "Sadece 'başlık'");
    }

    #[test]
    fn blocks_local_addresses() {
        for u in [
            "http://localhost/",
            "http://127.0.0.1/",
            "http://192.168.1.5/x",
            "http://10.0.0.1",
            "http://[::1]/",
            "file:///c:/x",
            "http://router/",
            "http://nas.local/",
        ] {
            let url = reqwest::Url::parse(u).unwrap();
            assert!(!host_ok_static(&url), "{u}");
        }
        assert!(host_ok_static(
            &reqwest::Url::parse("https://www.youtube.com/watch?v=x").unwrap()
        ));
    }
}
