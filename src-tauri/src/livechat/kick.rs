//! Kick: kanal bilgisi (sohbet odası kimliği + izleyici) `kick.com/api/v2/channels/<ad>` ile,
//! sohbet Pusher websocket'iyle (`chatrooms.<id>.v2`).
//!
//! Cloudflare: kick.com API'si tarayıcı olmayan istekleri zaman zaman engeller (403 / sınama sayfası).
//! Önce tarayıcı başlıklarıyla reqwest denenir; engellenirse gizli bir Tauri penceresi (WebView2 =
//! gerçek Chromium, Cloudflare sınamasını geçer) aynı adresi açar, sayfa yüklenince içine enjekte
//! edilen betik JSON'dan gereken alanları alıp `https://pitwall-fetch.invalid/?d=<json>` adresine
//! gitmeye çalışır; `on_navigation` bu gezinmeyi engeller ve veriyi yakalar, pencere kapatılır.
//! Bir kez engellenince sonraki istekler doğrudan bu yolla (daha seyrek) yapılır.

use super::model::{merge_text, AlertInfo, Author, ChatMsg, Kind, Part, Platform, Reply};
use super::net::{self, json_str, json_u64, Backoff};
use super::Ctx;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio_tungstenite::tungstenite::Message;

/// Kick'in kendi web sitesinde kullandığı herkese açık Pusher uygulama anahtarı (us2 kümesi)
pub const PUSHER_URL: &str = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";
const SENTINEL_HOST: &str = "pitwall-fetch.invalid";

/// Cloudflare reqwest'i engelledi mi (o zaman gizli pencere kullanılır)
static BLOCKED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, PartialEq, Default)]
pub struct KickInfo {
    pub chatroom_id: u64,
    pub channel_id: u64,
    pub name: String,
    pub live: bool,
    pub viewers: Option<u64>,
}

/// `api/v2/channels/<ad>` yanıtından gereken alanlar
pub fn parse_channel_info(body: &str) -> Option<KickInfo> {
    let v: Value = serde_json::from_str(body).ok()?;
    let v = if v.get("chatroom").is_none() && v.get("data").is_some() { v.get("data")?.clone() } else { v };
    let chatroom_id = json_u64(v.pointer("/chatroom/id"))?;
    let ls = v.get("livestream").filter(|l| !l.is_null());
    let live = ls.map(|l| l.get("is_live").and_then(|x| x.as_bool()).unwrap_or(true)).unwrap_or(false);
    let viewers = if live { ls.and_then(|l| json_u64(l.get("viewer_count")).or_else(|| json_u64(l.get("viewers")))) } else { None };
    let name = json_str(v.pointer("/user/username"));
    Some(KickInfo {
        chatroom_id,
        channel_id: json_u64(v.get("id")).unwrap_or(0),
        name: if name.is_empty() { json_str(v.get("slug")) } else { name },
        live,
        viewers,
    })
}

/// Sohbet içeriği: `[emote:ID:AD]` → emote resmi
pub fn content_parts(content: &str) -> Vec<Part> {
    let mut parts = Vec::new();
    let mut rest = content;
    while let Some(i) = rest.find("[emote:") {
        let after = &rest[i + 7..];
        let Some(close) = after.find(']') else { break };
        let inner = &after[..close];
        let Some((id, name)) = inner.split_once(':') else {
            parts.push(Part::text(&rest[..i + 7]));
            rest = after;
            continue;
        };
        if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
            parts.push(Part::text(&rest[..i + 7]));
            rest = after;
            continue;
        }
        parts.push(Part::text(&rest[..i]));
        parts.push(Part::Emote { url: format!("https://files.kick.com/emotes/{id}/fullsize"), name: name.to_string(), custom: false });
        rest = &after[close + 1..];
    }
    parts.push(Part::text(rest));
    // Eski biçim: [mention:ad]
    let parts = merge_text(parts);
    let mut out = Vec::new();
    for p in parts {
        let Part::Text { v } = &p else {
            out.push(p);
            continue;
        };
        let mut r = v.as_str();
        while let Some(i) = r.find("[mention:") {
            let Some(c) = r[i..].find(']') else { break };
            out.push(Part::text(&r[..i]));
            out.push(Part::Mention { v: r[i + 9..i + c].to_string() });
            r = &r[i + c + 1..];
        }
        out.push(Part::text(r));
    }
    merge_text(out)
}

/// Pusher çerçevesinden çıkan olay
#[derive(Debug, PartialEq)]
pub enum KickEvent {
    /// Bağlantı kuruldu: abone ol
    Established,
    Subscribed,
    Ping,
    Msg(Box<ChatMsg>),
    Delete(String),
    Ban { login: String, permanent: bool },
    Error(String),
}

fn sender_author(s: &Value) -> Author {
    let username = json_str(s.get("username"));
    let badges: Vec<String> = s
        .pointer("/identity/badges")
        .and_then(|b| b.as_array())
        .map(|a| a.iter().map(|b| json_str(b.get("type")).to_lowercase()).filter(|t| !t.is_empty()).collect())
        .unwrap_or_default();
    let has = |n: &str| badges.iter().any(|b| b == n);
    let color = json_str(s.pointer("/identity/color"));
    let slug = json_str(s.get("slug"));
    Author {
        login: if slug.is_empty() { username.to_lowercase() } else { slug.to_lowercase() },
        name: username,
        id: json_str(s.get("id")),
        color: (!color.is_empty()).then_some(color),
        avatar: None,
        moderator: has("moderator"),
        sub: has("subscriber") || has("founder"),
        owner: has("broadcaster"),
        member: false,
        vip: has("vip") || has("og"),
        badges,
    }
}

/// Tek Pusher mesajını işler
pub fn parse_pusher(raw: &str) -> Option<KickEvent> {
    let outer: Value = serde_json::from_str(raw).ok()?;
    let event = outer.get("event")?.as_str()?;
    match event {
        "pusher:connection_established" => return Some(KickEvent::Established),
        "pusher_internal:subscription_succeeded" => return Some(KickEvent::Subscribed),
        "pusher:ping" => return Some(KickEvent::Ping),
        "pusher:error" => return Some(KickEvent::Error(json_str(outer.pointer("/data/message")))),
        _ => {}
    }
    // Veri, JSON içinde JSON metni olarak gelir
    let data: Value = match outer.get("data")? {
        Value::String(s) => serde_json::from_str(s).ok()?,
        v => v.clone(),
    };
    match event {
        "App\\Events\\ChatMessageEvent" => {
            let id = json_str(data.get("id"));
            let content = json_str(data.get("content"));
            let sender = data.get("sender")?;
            let author = sender_author(sender);
            if author.name.is_empty() || content.is_empty() {
                return None;
            }
            let mut m = ChatMsg::new(Platform::Kick, if id.is_empty() { format!("k{}", super::poll::rand_u64()) } else { id }, Kind::Chat, author, content_parts(&content));
            if json_str(data.get("type")) == "reply" {
                let u = json_str(data.pointer("/metadata/original_sender/username"));
                if !u.is_empty() {
                    let t = super::model::plain_text(&content_parts(&json_str(data.pointer("/metadata/original_message/content"))));
                    m.reply_to = Some(Reply { user: u, text: t });
                }
            }
            Some(KickEvent::Msg(Box::new(m)))
        }
        "App\\Events\\MessageDeletedEvent" => {
            let id = match json_str(data.pointer("/message/id")) {
                s if !s.is_empty() => s,
                _ => json_str(data.get("id")),
            };
            (!id.is_empty()).then_some(KickEvent::Delete(id))
        }
        "App\\Events\\UserBannedEvent" => {
            let u = data.get("user")?;
            let slug = json_str(u.get("slug"));
            let login = if slug.is_empty() { json_str(u.get("username")) } else { slug };
            let permanent = data.get("permanent").and_then(|x| x.as_bool()).unwrap_or_else(|| data.get("expires_at").map_or(true, |e| e.is_null()));
            (!login.is_empty()).then(|| KickEvent::Ban { login: login.to_lowercase(), permanent })
        }
        "App\\Events\\SubscriptionEvent" => {
            let user = json_str(data.get("username"));
            if user.is_empty() {
                return None;
            }
            let author = Author { login: user.to_lowercase(), name: user, ..Default::default() };
            let mut m = ChatMsg::new(Platform::Kick, format!("sub{}", super::poll::rand_u64()), Kind::Sub, author, vec![]);
            m.alert = Some(AlertInfo { kind: "subscriber".into(), months: json_u64(data.get("months")).map(|x| x as u32), ..Default::default() });
            Some(KickEvent::Msg(Box::new(m)))
        }
        "App\\Events\\GiftedSubscriptionsEvent" => {
            let gifter = json_str(data.get("gifter_username"));
            let n = data.get("gifted_usernames").and_then(|x| x.as_array()).map(|a| a.len() as u64).unwrap_or(0);
            let author = Author { login: gifter.to_lowercase(), name: if gifter.is_empty() { "Anonim".into() } else { gifter }, ..Default::default() };
            let mut m = ChatMsg::new(Platform::Kick, format!("gift{}", super::poll::rand_u64()), Kind::Sub, author, vec![]);
            m.alert = Some(AlertInfo { kind: "subgift".into(), gifted: true, count: (n > 0).then_some(n), ..Default::default() });
            Some(KickEvent::Msg(Box::new(m)))
        }
        "App\\Events\\StreamHostEvent" => {
            let host = json_str(data.get("host_username"));
            if host.is_empty() {
                return None;
            }
            let msg = json_str(data.get("optional_message"));
            let author = Author { login: host.to_lowercase(), name: host, ..Default::default() };
            let parts = if msg.is_empty() { vec![] } else { content_parts(&msg) };
            let mut m = ChatMsg::new(Platform::Kick, format!("host{}", super::poll::rand_u64()), Kind::Raid, author, parts);
            m.alert = Some(AlertInfo { kind: "host".into(), count: json_u64(data.get("number_viewers")), ..Default::default() });
            Some(KickEvent::Msg(Box::new(m)))
        }
        _ => None,
    }
}

/// Gizli pencerede sayfa yüklenince çalışan betik: JSON'dan gereken alanları sentinel adrese taşır
const EXTRACT_JS: &str = r#"(function(){try{var j=JSON.parse(document.body.innerText);var l=j.livestream;var o={id:j.id,slug:j.slug,user:{username:j.user&&j.user.username},chatroom:{id:j.chatroom&&j.chatroom.id},livestream:l?{is_live:!!l.is_live,viewer_count:l.viewer_count}:null};location.href='https://pitwall-fetch.invalid/?d='+encodeURIComponent(JSON.stringify(o));}catch(e){}})();"#;

/// Cloudflare yedeği: adresi gizli bir WebView2 penceresinde açıp sonucu döndürür (en fazla 30 sn)
async fn webview_fetch(app: &AppHandle, url: &str) -> Result<String, String> {
    use tauri::webview::PageLoadEvent;
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    static N: AtomicU64 = AtomicU64::new(0);
    let label = format!("lcfetch{}", N.fetch_add(1, Ordering::Relaxed));
    let parsed: tauri::Url = url.parse().map_err(|_| "geçersiz adres".to_string())?;
    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = Arc::new(parking_lot::Mutex::new(Some(tx)));
    let tx2 = tx.clone();
    let w = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title("SRTR Pitwall – Kick")
        .inner_size(480.0, 360.0)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .additional_browser_args(crate::browser_args())
        .on_navigation(move |u| {
            if u.host_str() == Some(SENTINEL_HOST) {
                let d = u.query_pairs().find(|(k, _)| k == "d").map(|(_, v)| v.into_owned()).unwrap_or_default();
                if let Some(t) = tx2.lock().take() {
                    let _ = t.send(d);
                }
                return false;
            }
            true
        })
        .on_page_load(|w, p| {
            if matches!(p.event(), PageLoadEvent::Finished) {
                let _ = w.eval(EXTRACT_JS);
            }
        })
        .build()
        .map_err(|e| e.to_string())?;
    let r = tokio::time::timeout(Duration::from_secs(30), rx).await;
    let _ = w.destroy();
    drop(tx);
    match r {
        Ok(Ok(s)) if !s.is_empty() => Ok(s),
        _ => Err("Kick: Cloudflare engeli aşılamadı".into()),
    }
}

/// Kanal bilgisi: önce doğrudan istek, engellenirse gizli pencere
pub async fn fetch_info(app: &AppHandle, slug: &str) -> Result<KickInfo, String> {
    let url = format!("https://kick.com/api/v2/channels/{}", slug.to_lowercase());
    if !BLOCKED.load(Ordering::Relaxed) {
        let client = net::http()?;
        let resp = client
            .get(&url)
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7")
            .header("Referer", "https://kick.com/")
            .header("Origin", "https://kick.com")
            .send()
            .await;
        match resp {
            Ok(r) if r.status().as_u16() == 404 => return Err("Kick kanalı bulunamadı".into()),
            Ok(r) if r.status().is_success() => {
                let text = r.text().await.map_err(|e| e.to_string())?;
                if let Some(i) = parse_channel_info(&text) {
                    return Ok(i);
                }
                BLOCKED.store(true, Ordering::Relaxed);
            }
            Ok(r) if r.status().as_u16() == 403 || r.status().as_u16() == 429 || r.status().as_u16() == 503 => {
                BLOCKED.store(true, Ordering::Relaxed);
            }
            Ok(r) => return Err(format!("Kick API HTTP {}", r.status().as_u16())),
            Err(e) => return Err(e.to_string()),
        }
    }
    let body = webview_fetch(app, &url).await?;
    parse_channel_info(&body).ok_or_else(|| "Kick kanalı bulunamadı".into())
}

/// İzleyici sayısı döngüsü: 15 sn (gizli pencere gerekiyorsa 60 sn)
pub async fn run_viewers(ctx: Ctx) {
    // İlk bilgiyi sohbet görevi alıyor; aynı anda iki istek (ya da iki gizli pencere) olmasın
    tokio::time::sleep(Duration::from_secs(15)).await;
    loop {
        if let Ok(i) = fetch_info(&ctx.hub.app, &ctx.link.ident).await {
            ctx.hub.set_live(&ctx.key, i.live, i.viewers);
            if !i.name.is_empty() {
                ctx.hub.set_name(&ctx.key, &i.name);
            }
        }
        let secs = if BLOCKED.load(Ordering::Relaxed) { 60 } else { 15 };
        tokio::time::sleep(Duration::from_secs(secs)).await;
    }
}

pub async fn run_chat(ctx: Ctx) {
    let mut backoff = Backoff::new(3, 60);
    loop {
        ctx.hub.set_chat(&ctx.key, false, None);
        let info = match fetch_info(&ctx.hub.app, &ctx.link.ident).await {
            Ok(i) => i,
            Err(e) => {
                ctx.hub.set_chat(&ctx.key, false, Some(e));
                tokio::time::sleep(backoff.next()).await;
                continue;
            }
        };
        ctx.hub.set_live(&ctx.key, info.live, info.viewers);
        if !info.name.is_empty() {
            ctx.hub.set_name(&ctx.key, &info.name);
        }
        match session(&ctx, info.chatroom_id, &mut backoff).await {
            Ok(()) => backoff.reset(),
            Err(e) => ctx.hub.set_chat(&ctx.key, false, Some(e)),
        }
        tokio::time::sleep(backoff.next()).await;
    }
}

async fn session(ctx: &Ctx, chatroom: u64, backoff: &mut Backoff) -> Result<(), String> {
    let mut ws = net::ws_connect(PUSHER_URL, &[("Origin", "https://kick.com"), ("User-Agent", net::BROWSER_UA)]).await?;
    let mut ping = tokio::time::interval(Duration::from_secs(30));
    ping.tick().await;
    let mut last_rx = std::time::Instant::now();
    let mut seen: std::collections::VecDeque<String> = std::collections::VecDeque::new();
    loop {
        tokio::select! {
            m = ws.next() => {
                last_rx = std::time::Instant::now();
                match m {
                    Some(Ok(Message::Text(t))) => match parse_pusher(t.as_str()) {
                        Some(KickEvent::Established) => {
                            let sub = serde_json::json!({"event":"pusher:subscribe","data":{"auth":"","channel":format!("chatrooms.{chatroom}.v2")}});
                            ws.send(Message::text(sub.to_string())).await.map_err(|e| e.to_string())?;
                        }
                        Some(KickEvent::Subscribed) => { backoff.reset(); ctx.hub.set_chat(&ctx.key, true, None); }
                        Some(KickEvent::Ping) => { ws.send(Message::text(r#"{"event":"pusher:pong","data":{}}"#)).await.map_err(|e| e.to_string())?; }
                        Some(KickEvent::Error(e)) => { if !e.is_empty() { eprintln!("Kick pusher: {e}"); } }
                        Some(KickEvent::Msg(mut m)) => {
                            // Aynı mesaj iki kez gelebilir
                            if seen.contains(&m.native_id) { continue; }
                            seen.push_back(m.native_id.clone());
                            if seen.len() > 600 { seen.pop_front(); }
                            m.channel = ctx.key.clone();
                            ctx.hub.ingest(*m);
                        }
                        Some(KickEvent::Delete(id)) => ctx.hub.delete_ids(Platform::Kick, &[id]),
                        Some(KickEvent::Ban { login, permanent }) => ctx.hub.delete_user(Platform::Kick, &login, permanent),
                        None => {}
                    },
                    Some(Ok(Message::Ping(p))) => { let _ = ws.send(Message::Pong(p)).await; }
                    Some(Ok(Message::Close(_))) | None => return Err("bağlantı kapandı".into()),
                    Some(Ok(_)) => {}
                    Some(Err(e)) => return Err(e.to_string()),
                }
            }
            _ = ping.tick() => {
                if last_rx.elapsed() > Duration::from_secs(150) {
                    return Err("sunucu yanıt vermiyor".into());
                }
                ws.send(Message::text(r#"{"event":"pusher:ping","data":{}}"#)).await.map_err(|e| e.to_string())?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_info() {
        let body = r#"{"id":77,"slug":"erkinazcan","user":{"username":"ErkinAzcan"},"chatroom":{"id":12345},"livestream":{"is_live":true,"viewer_count":321}}"#;
        assert_eq!(
            parse_channel_info(body),
            Some(KickInfo { chatroom_id: 12345, channel_id: 77, name: "ErkinAzcan".into(), live: true, viewers: Some(321) })
        );
        let off = r#"{"id":77,"slug":"x","user":{"username":"X"},"chatroom":{"id":"9"},"livestream":null}"#;
        let i = parse_channel_info(off).unwrap();
        assert_eq!((i.chatroom_id, i.live, i.viewers), (9, false, None));
        assert!(parse_channel_info("<html>Just a moment...</html>").is_none());
        assert!(parse_channel_info(r#"{"message":"Not found"}"#).is_none());
    }

    #[test]
    fn content() {
        assert_eq!(
            content_parts("selam [emote:37226:KEKW] [mention:ali] naber"),
            vec![
                Part::text("selam "),
                Part::Emote { url: "https://files.kick.com/emotes/37226/fullsize".into(), name: "KEKW".into(), custom: false },
                Part::text(" "),
                Part::Mention { v: "ali".into() },
                Part::text(" naber"),
            ]
        );
        assert_eq!(content_parts("[emote:abc:x] y"), vec![Part::text("[emote:abc:x] y")]);
    }

    #[test]
    fn pusher_events() {
        assert_eq!(parse_pusher(r#"{"event":"pusher:connection_established","data":"{\"socket_id\":\"1.2\",\"activity_timeout\":120}"}"#), Some(KickEvent::Established));
        assert_eq!(parse_pusher(r#"{"event":"pusher:ping","data":{}}"#), Some(KickEvent::Ping));
        let chat = r##"{"event":"App\\Events\\ChatMessageEvent","data":"{\"id\":\"m-1\",\"chatroom_id\":1,\"content\":\"merhaba [emote:1:Hi]\",\"type\":\"reply\",\"sender\":{\"id\":5,\"username\":\"Ayşe\",\"slug\":\"ayse\",\"identity\":{\"color\":\"#FF0000\",\"badges\":[{\"type\":\"moderator\",\"text\":\"Moderator\"},{\"type\":\"subscriber\",\"text\":\"Sub\",\"count\":3}]}},\"metadata\":{\"original_sender\":{\"id\":6,\"username\":\"Ali\"},\"original_message\":{\"id\":\"m-0\",\"content\":\"sorum var\"}}}","channel":"chatrooms.1.v2"}"##;
        let Some(KickEvent::Msg(m)) = parse_pusher(chat) else { panic!() };
        assert_eq!(m.id, "kick:m-1");
        assert_eq!((m.author.name.as_str(), m.author.login.as_str()), ("Ayşe", "ayse"));
        assert!(m.author.moderator && m.author.sub);
        assert_eq!(m.author.color.as_deref(), Some("#FF0000"));
        assert_eq!(m.reply_to, Some(Reply { user: "Ali".into(), text: "sorum var".into() }));
        assert_eq!(m.text, "merhaba Hi");
        let del = r#"{"event":"App\\Events\\MessageDeletedEvent","data":"{\"id\":\"d1\",\"message\":{\"id\":\"m-1\"}}"}"#;
        assert_eq!(parse_pusher(del), Some(KickEvent::Delete("m-1".into())));
        let ban = r#"{"event":"App\\Events\\UserBannedEvent","data":"{\"id\":\"b\",\"user\":{\"id\":5,\"username\":\"Kotu\",\"slug\":\"kotu\"},\"banned_by\":{\"username\":\"mod\"},\"expires_at\":\"2026-10-01T10:00:00Z\"}"}"#;
        assert_eq!(parse_pusher(ban), Some(KickEvent::Ban { login: "kotu".into(), permanent: false }));
        let sub = r#"{"event":"App\\Events\\SubscriptionEvent","data":"{\"chatroom_id\":1,\"username\":\"Veli\",\"months\":3}"}"#;
        let Some(KickEvent::Msg(m)) = parse_pusher(sub) else { panic!() };
        assert_eq!((m.kind, m.alert.unwrap().months), (Kind::Sub, Some(3)));
        assert_eq!(parse_pusher(r#"{"event":"App\\Events\\PinnedMessageCreatedEvent","data":"{}"}"#), None);
    }
}
