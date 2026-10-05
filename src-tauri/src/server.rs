//! Yerel web sunucusu: OBS tarayıcı kaynakları ve ağdaki başka cihazlar (ör. pitwall
//! ekranı) için. Uygulamanın kendi arayüz dosyalarını sunar; canlı veri Server-Sent
//! Events (SSE) ile akar. Sadece açıkça etkinleştirilirse çalışır.
//!
//!   GET /overlay.html?layout=<profil>   şeffaf overlay sayfası (OBS)
//!   GET /window.html?view=pitwall       pitwall paneli (başka bilgisayar/tablet)
//!   GET /api/settings                   ayarlar (JSON)
//!   GET /api/logos                      kullanıcının marka logoları (JSON)
//!   GET /api/stream?topics=a:10,b:2     canlı veri (SSE)
//!   GET /livechat  /livepoll  /captions  canlı sohbet / anket / altyazı (→ overlay.html?only=<id>; PRO: livechat.obs)
//!   GET /livechat/state                 canlı sohbet durumu (JSON: chat, poll, captions)
//!   GET /dash  /dash/<tasarım>          uzak gösterge: direksiyon ekranı telefon / tablette (→ dash.html; PRO: dashboard.remote)
//!   GET /api/dash                       uzak gösterge verisi (JSON: tasarımlar, birim; PRO: dashboard.remote)

use crate::engine::{Shared, Sink, TopicReq};
use std::io::Write;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;
use tauri::AppHandle;
use tiny_http::{Header, Response, Server};

pub struct WebServer {
    stop: Arc<AtomicBool>,
    pub addr: SocketAddr,
}

impl WebServer {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("geçerli başlık")
}

fn parse_topics(q: &str) -> Vec<TopicReq> {
    q.split(',')
        .filter_map(|p| {
            let mut it = p.split(':');
            let name = it.next()?.trim().to_string();
            let hz = it.next().and_then(|h| h.parse().ok()).unwrap_or(5.0);
            if name.is_empty() {
                None
            } else {
                Some(TopicReq { name, hz })
            }
        })
        .collect()
}

/// Basit yüzde çözümü (%3A -> :, %2C -> , ...)
/// Adres parametresi için yüzde kodlama
pub fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn url_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            // `get`: "%" sonrası çok baytlı (UTF-8) karakterse dilimleme panic yapmasın
            if let Some(v) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param<'a>(url: &'a str, key: &str) -> Option<&'a str> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        if k == key {
            Some(v)
        } else {
            None
        }
    })
}

pub fn start(app: AppHandle, shared: Arc<Shared>, port: u16, lan: bool) -> Result<WebServer, String> {
    let host = if lan { "0.0.0.0" } else { "127.0.0.1" };
    let server = Server::http(format!("{host}:{port}")).map_err(|e| format!("Port {port} açılamadı: {e}"))?;
    let addr = server.server_addr().to_ip().ok_or("adres alınamadı")?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = stop.clone();
    std::thread::Builder::new()
        .name("web-server".into())
        // Bir istekteki panic (crash.log'a yazılır) sunucuyu durdurmasın: döngü yeniden başlar
        .spawn(move || crate::crashlog::supervise("web-server", || {
            while !stop2.load(Ordering::Relaxed) {
                let req = match server.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(r)) => r,
                    Ok(None) => continue,
                    Err(_) => break,
                };
                let url = req.url().to_string();
                let path = url.split('?').next().unwrap_or("/").to_string();

                // Nabız gönderimi (saat / telefon uygulamaları): PUT | POST | GET /hr/<anahtar>, bkz. heartrate.rs
                if path.starts_with("/hr/") {
                    let mut req = req;
                    let mut body = String::new();
                    {
                        use std::io::Read;
                        let _ = req.as_reader().take(4096).read_to_string(&mut body);
                    }
                    let q = url_decode(url.split_once('?').map(|x| x.1).unwrap_or(""));
                    let (code, text) = crate::heartrate::http_push(&path, &q, &body);
                    let resp = Response::from_string(text).with_status_code(code).with_header(header("Access-Control-Allow-Origin", "*"));
                    let _ = req.respond(resp);
                    continue;
                }

                if path == "/api/stream" {
                    let mut topics = parse_topics(&url_decode(query_param(&url, "topics").unwrap_or("")));
                    // Canlı sohbet konuları tarayıcı kaynağına sadece izin varsa (PRO: livechat.obs)
                    if topics.iter().any(|t| crate::engine::LIVECHAT_TOPICS.contains(&t.name.as_str())) && !crate::livechat::allowed(&app, "livechat.obs") {
                        topics.retain(|t| !crate::engine::LIVECHAT_TOPICS.contains(&t.name.as_str()));
                    }
                    let (tx, rx) = mpsc::channel::<String>();
                    let id = shared.subscribe(Sink::Sse(tx), &topics);
                    let shared3 = shared.clone();
                    let stop3 = stop2.clone();
                    // Ham sokete doğrudan yaz ve her olaydan sonra boşalt (tamponlama gecikmesi olmasın)
                    std::thread::spawn(move || {
                        let mut w = req.into_writer();
                        let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n\
                                    Connection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                        if w.write_all(head.as_bytes()).and_then(|_| w.flush()).is_ok() {
                            loop {
                                if stop3.load(Ordering::Relaxed) {
                                    break;
                                }
                                let chunk = match rx.recv_timeout(Duration::from_secs(15)) {
                                    Ok(s) => format!("data: {s}\n\n"),
                                    Err(mpsc::RecvTimeoutError::Timeout) => ": ping\n\n".to_string(),
                                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                                };
                                if w.write_all(chunk.as_bytes()).and_then(|_| w.flush()).is_err() {
                                    break;
                                }
                            }
                        }
                        shared3.unsubscribe(id);
                    });
                    continue;
                }

                if path == "/api/entitlement" {
                    let v = serde_json::to_string(&crate::entitlement::view(&app)).unwrap_or_else(|_| "{}".into());
                    let resp = Response::from_string(v)
                        .with_header(header("Content-Type", "application/json"))
                        .with_header(header("Access-Control-Allow-Origin", "*"));
                    let _ = req.respond(resp);
                    continue;
                }

                if path == "/api/logos" {
                    let v = serde_json::to_string(&crate::logos::list(&app)).unwrap_or_else(|_| "[]".into());
                    let resp = Response::from_string(v)
                        .with_header(header("Content-Type", "application/json"))
                        .with_header(header("Access-Control-Allow-Origin", "*"));
                    let _ = req.respond(resp);
                    continue;
                }

                if path == "/api/settings" {
                    let v = crate::current_settings(&app).unwrap_or(serde_json::Value::Null);
                    let resp = Response::from_string(v.to_string())
                        .with_header(header("Content-Type", "application/json"))
                        .with_header(header("Access-Control-Allow-Origin", "*"));
                    let _ = req.respond(resp);
                    continue;
                }

                // Canlı sohbet: OBS tarayıcı kaynağı kısa adresleri → tek overlay'li sayfa
                let only = match path.trim_end_matches('/') {
                    "/livechat" | "/chat" | "/sohbet" => Some("livechat"),
                    "/livepoll" | "/poll" | "/anket" => Some("livepoll"),
                    "/captions" | "/caption" | "/altyazi" => Some("captions"),
                    _ => None,
                };
                if only.is_some() || path == "/livechat/state" {
                    if !crate::livechat::allowed(&app, "livechat.obs") {
                        let mut resp = Response::from_string(
                            "<!doctype html><meta charset=utf-8><body style='font:16px sans-serif;color:#fff;background:#111;padding:20px'>Canlı sohbet OBS kaynağı PRO üyelere özel · SRTR Pitwall</body>",
                        )
                        .with_status_code(403);
                        resp.add_header(header("Content-Type", "text/html; charset=utf-8"));
                        let _ = req.respond(resp);
                        continue;
                    }
                }
                if let Some(id) = only {
                    let q = url.split_once('?').map(|(_, q)| format!("&{q}")).unwrap_or_default();
                    let resp = Response::empty(302)
                        .with_header(header("Location", &format!("/overlay.html?only={id}{q}")))
                        .with_header(header("Cache-Control", "no-store"));
                    let _ = req.respond(resp);
                    continue;
                }
                if path == "/livechat/state" {
                    let v = crate::livechat::state_json(&app);
                    let resp = Response::from_string(v.to_string())
                        .with_header(header("Content-Type", "application/json"))
                        .with_header(header("Cache-Control", "no-store"))
                        .with_header(header("Access-Control-Allow-Origin", "*"));
                    let _ = req.respond(resp);
                    continue;
                }

                // Uzak gösterge (telefon / tablet): /dash tasarım listesi, /dash/<kimlik> tek tasarım. Sayfa da verisi de
                // aynı kilide bağlı (PRO: dashboard.remote); kilitliyken sayfa 403 döner, /api/dash veri vermez.
                // "/dash.html" doğrudan istenirse de aynı kilit geçerli (kısa adresi atlayıp kilidi aşmasın)
                let dash_page = is_dash_page(&path) || path == "/dash.html";
                if dash_page || path == "/api/dash" {
                    if !crate::livechat::allowed(&app, "dashboard.remote") {
                        let (body, mime) = if dash_page {
                            (DASH_LOCKED_HTML.to_string(), "text/html; charset=utf-8")
                        } else {
                            ("{\"ok\":false,\"error\":\"pro\"}".to_string(), "application/json")
                        };
                        let resp = Response::from_string(body)
                            .with_status_code(403)
                            .with_header(header("Content-Type", mime))
                            .with_header(header("Cache-Control", "no-store"))
                            .with_header(header("Access-Control-Allow-Origin", "*"));
                        let _ = req.respond(resp);
                        continue;
                    }
                }
                if path == "/api/dash" {
                    let v = dash_json(crate::current_settings(&app).as_ref());
                    let resp = Response::from_string(v.to_string())
                        .with_header(header("Content-Type", "application/json"))
                        .with_header(header("Cache-Control", "no-store"))
                        .with_header(header("Access-Control-Allow-Origin", "*"));
                    let _ = req.respond(resp);
                    continue;
                }

                // Statik dosyalar: uygulamanın kendi arayüzü
                let file = if path == "/" {
                    "/overlay.html".to_string()
                } else if dash_page {
                    "/dash.html".to_string()
                } else {
                    path.clone()
                };
                match app.asset_resolver().get(file.trim_start_matches('/').to_string()) {
                    Some(asset) => {
                        let mime = asset.mime_type().to_string();
                        let resp = Response::from_data(asset.bytes().to_vec())
                            .with_header(header("Content-Type", &mime))
                            .with_header(header("Cache-Control", "no-cache"));
                        let _ = req.respond(resp);
                    }
                    None => {
                        let mut resp = Response::from_string("Bulunamadı").with_status_code(404);
                        resp.add_header(header("Content-Type", "text/plain; charset=utf-8"));
                        let _ = req.respond(resp);
                    }
                }
            }
        }))
        .map_err(|e| e.to_string())?;
    Ok(WebServer { stop, addr })
}

const DASH_LOCKED_HTML: &str = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font:16px sans-serif;color:#fff;background:#111;padding:20px'>Uzak gösterge PRO üyelere özel · SRTR Pitwall</body>";

/// /dash, /dash/ ya da /dash/<kimlik> (alt yol tek parça; "/dash.html" ve "/dashx" değil)
fn is_dash_page(path: &str) -> bool {
    match path.strip_prefix("/dash") {
        Some("") | Some("/") => true,
        Some(rest) => rest.starts_with('/') && !rest[1..].contains('/') && !rest[1..].contains('.'),
        None => false,
    }
}

/// Uzak gösterge sayfasının verisi: kullanıcının tasarımları ve birim tercihi
fn dash_json(settings: Option<&serde_json::Value>) -> serde_json::Value {
    let dashes = settings.and_then(|s| s.get("dashes")).filter(|d| d.is_array()).cloned().unwrap_or_else(|| serde_json::json!([]));
    let units = settings.and_then(|s| s.pointer("/general/units")).and_then(|u| u.as_str()).unwrap_or("metric");
    serde_json::json!({ "ok": true, "units": units, "dashes": dashes })
}

/// Yerel ağ adresini bulur (sunucu LAN'a açıkken bağlantı adresi göstermek için).
pub fn lan_ip() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("10.255.255.255:1").ok()?;
    sock.local_addr().ok().map(|a| a.ip().to_string())
}

/// Bu bilgisayarın yerel ağ (IPv4) adresleri: önce varsayılan çıkış arayüzü, sonra bilgisayar adının çözdüğü
/// diğer adresler (ör. hem kablo hem Wi-Fi takılıysa). Döngü (127.x) ve bağlantı-yerel (169.254.x) adresler alınmaz.
pub fn lan_ips() -> Vec<String> {
    use std::net::{IpAddr, ToSocketAddrs};
    let mut out: Vec<String> = Vec::new();
    if let Some(ip) = lan_ip() {
        out.push(ip);
    }
    let host = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_default();
    if !host.is_empty() {
        if let Ok(addrs) = (host.as_str(), 0u16).to_socket_addrs() {
            for a in addrs {
                if let IpAddr::V4(v4) = a.ip() {
                    if usable_lan_v4(&v4) {
                        let s = v4.to_string();
                        if !out.contains(&s) {
                            out.push(s);
                        }
                    }
                }
            }
        }
    }
    out.retain(|s| s.parse::<std::net::Ipv4Addr>().map(|v| usable_lan_v4(&v)).unwrap_or(false));
    out
}

fn usable_lan_v4(ip: &std::net::Ipv4Addr) -> bool {
    !ip.is_loopback() && !ip.is_link_local() && !ip.is_unspecified() && !ip.is_broadcast()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn topics_parse() {
        let t = parse_topics("relative:10,fuel:2,map");
        assert_eq!(t.len(), 3);
        assert_eq!(t[0].name, "relative");
        assert_eq!(t[2].hz, 5.0);
        assert_eq!(query_param("/api/stream?a=1&topics=x:1", "topics"), Some("x:1"));
        assert_eq!(url_decode("a%3A1%2Cb%3A2"), "a:1,b:2");
        assert_eq!(url_decode("100%"), "100%");
    }

    #[test]
    fn dash_routes() {
        for p in ["/dash", "/dash/", "/dash/dabc123", "/dash/classic"] {
            assert!(is_dash_page(p), "{p}");
        }
        for p in ["/dash.html", "/dashboard", "/dash/a/b", "/dash/x.js", "/assets/dash.js", "/"] {
            assert!(!is_dash_page(p), "{p}");
        }
        let s = serde_json::json!({ "general": { "units": "imperial" }, "dashes": [{ "id": "d1" }] });
        let v = dash_json(Some(&s));
        assert_eq!(v["ok"], true);
        assert_eq!(v["units"], "imperial");
        assert_eq!(v["dashes"][0]["id"], "d1");
        assert!(!usable_lan_v4(&"127.0.0.1".parse().unwrap()));
        assert!(!usable_lan_v4(&"169.254.10.2".parse().unwrap()));
        assert!(usable_lan_v4(&"192.168.1.20".parse().unwrap()));
        assert!(lan_ips().iter().all(|s| !s.starts_with("127.")));
        let v = dash_json(None);
        assert_eq!(v["units"], "metric");
        assert_eq!(v["dashes"].as_array().map(|a| a.len()), Some(0));
    }
}
