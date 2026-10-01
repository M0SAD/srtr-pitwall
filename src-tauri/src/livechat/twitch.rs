//! Twitch: anonim IRC (güvenli websocket, `justinfan` takma adı, etiket yeteneği) ve GQL izleyici sayısı.
//!
//! İşlenenler: PRIVMSG (emote etiketi → static-cdn resimleri, rozetler, renk, /me, yanıt, bits),
//! USERNOTICE (abone, yeniden abone, hediye abone, raid, duyuru…), CLEARCHAT / CLEARMSG (silmeleri yansıt),
//! RECONNECT, PING, NOTICE (kanal yok/askıya alınmış).

use super::model::{merge_text, AlertInfo, Author, ChatMsg, Kind, Part, Platform, Reply};
use super::net::{self, Backoff};
use super::Ctx;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

pub const IRC_URL: &str = "wss://irc-ws.chat.twitch.tv:443";
/// Twitch web istemcisinin herkese açık Client-ID'si (gizli anahtar değil; MCO twitch.py ile aynı, GQL için)
pub const GQL_CLIENT_ID: &str = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
const GQL_URL: &str = "https://gql.twitch.tv/gql";
/// Kalıcı sorgu karmaları (Twitch yeni sürüm yayınlayınca değişebilir; sırayla denenir)
const GQL_QUERIES: [(&str, &str); 2] = [
    ("StreamMetadata", "059c4653b788f5bdb2f5a2d2a24b0ddc3831a15079001a3d927556a96fb0517f"),
    ("UseLive", "639d5f11bfb8bf3053b424d9ef650d04c4ced7e20a612e1d49fb58e1d4cf6357"),
];

/// Ayrıştırılmış IRC satırı
#[derive(Debug, Default, PartialEq)]
pub struct Irc {
    pub tags: HashMap<String, String>,
    /// Önekteki takma ad (`:nick!user@host` → nick)
    pub nick: String,
    pub command: String,
    pub params: Vec<String>,
    pub trailing: Option<String>,
}

impl Irc {
    pub fn tag(&self, k: &str) -> &str {
        self.tags.get(k).map(|s| s.as_str()).unwrap_or("")
    }
}

/// IRCv3 etiket değerindeki kaçış dizileri: `\s` boşluk, `\:` ;, `\\` \, `\r`, `\n`
pub fn unescape_tag(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    let mut it = v.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match it.next() {
            Some('s') => out.push(' '),
            Some(':') => out.push(';'),
            Some('\\') => out.push('\\'),
            Some('r') => out.push('\r'),
            Some('n') => out.push('\n'),
            Some(o) => out.push(o),
            None => {}
        }
    }
    out
}

pub fn parse_irc(line: &str) -> Option<Irc> {
    let mut rest = line.trim_end_matches(['\r', '\n']);
    if rest.is_empty() {
        return None;
    }
    let mut irc = Irc::default();
    if let Some(r) = rest.strip_prefix('@') {
        let (tags, r) = r.split_once(' ')?;
        for kv in tags.split(';') {
            let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
            irc.tags.insert(k.to_string(), unescape_tag(v));
        }
        rest = r.trim_start();
    }
    if let Some(r) = rest.strip_prefix(':') {
        let (prefix, r) = r.split_once(' ')?;
        irc.nick = prefix.split('!').next().unwrap_or("").to_string();
        rest = r.trim_start();
    }
    let (head, trailing) = match rest.find(" :") {
        Some(i) => (&rest[..i], Some(rest[i + 2..].to_string())),
        None => (rest, None),
    };
    let mut words = head.split(' ').filter(|w| !w.is_empty());
    irc.command = words.next()?.to_string();
    irc.params = words.map(String::from).collect();
    irc.trailing = trailing;
    Some(irc)
}

pub fn emote_url(id: &str) -> String {
    format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/2.0")
}

/// Mesaj metnini `emotes` etiketine göre parçalara böler. Konumlar karakter (Unicode) indeksidir:
/// `25:0-4,12-16/1902:6-10`
pub fn emote_parts(text: &str, emotes: &str) -> Vec<Part> {
    let chars: Vec<char> = text.chars().collect();
    let mut reps: Vec<(usize, usize, &str)> = Vec::new();
    for entry in emotes.split('/') {
        let Some((id, pos)) = entry.split_once(':') else { continue };
        for p in pos.split(',') {
            let Some((a, b)) = p.split_once('-') else { continue };
            if let (Ok(a), Ok(b)) = (a.parse::<usize>(), b.parse::<usize>()) {
                if a <= b && b < chars.len() {
                    reps.push((a, b, id));
                }
            }
        }
    }
    if reps.is_empty() {
        return vec![Part::text(text)];
    }
    reps.sort_by_key(|r| r.0);
    let mut parts = Vec::new();
    let mut pos = 0;
    for (a, b, id) in reps {
        if a < pos {
            continue; // çakışan
        }
        if a > pos {
            parts.push(Part::text(chars[pos..a].iter().collect::<String>()));
        }
        parts.push(Part::Emote { url: emote_url(id), name: chars[a..=b].iter().collect() });
        pos = b + 1;
    }
    if pos < chars.len() {
        parts.push(Part::text(chars[pos..].iter().collect::<String>()));
    }
    merge_text(parts)
}

fn author_of(irc: &Irc, login_fallback: &str) -> Author {
    let badges_raw = irc.tag("badges");
    let badges: Vec<String> = badges_raw
        .split(',')
        .filter_map(|b| b.split('/').next())
        .filter(|b| !b.is_empty())
        .map(String::from)
        .collect();
    let has = |n: &str| badges.iter().any(|b| b == n);
    let login = {
        let l = irc.tag("login");
        if !l.is_empty() {
            l.to_lowercase()
        } else if !irc.nick.is_empty() && irc.nick != "tmi.twitch.tv" {
            irc.nick.to_lowercase()
        } else {
            login_fallback.to_lowercase()
        }
    };
    let name = match irc.tag("display-name") {
        "" => login.clone(),
        n => n.to_string(),
    };
    let color = irc.tag("color");
    Author {
        name,
        login,
        id: irc.tag("user-id").to_string(),
        color: (!color.is_empty()).then(|| color.to_string()),
        avatar: None,
        moderator: has("moderator") || irc.tag("mod") == "1",
        sub: has("subscriber") || has("founder") || irc.tag("subscriber") == "1",
        owner: has("broadcaster"),
        member: false,
        vip: has("vip") || irc.tag("vip") == "1",
        badges,
    }
}

/// Twitch olayından üretilen işlem
#[derive(Debug, PartialEq)]
pub enum TwEvent {
    Msg(Box<ChatMsg>),
    /// Tek mesaj silindi (CLEARMSG target-msg-id)
    DeleteMsg(String),
    /// Kullanıcının son mesajı (CLEARMSG, kimliksiz)
    DeleteUserLast(String),
    /// Kullanıcının mesajları silindi: kalıcı yasak (true) ya da zaman aşımı (false)
    ClearUser { login: String, permanent: bool },
    Joined,
    Reconnect,
    Ping(String),
    /// Kanal yok / askıya alınmış vb.
    Error(String),
}

fn tier_name(plan: &str) -> Option<String> {
    Some(match plan {
        "" => return None,
        "Prime" => "Prime".into(),
        "1000" => "1".into(),
        "2000" => "2".into(),
        "3000" => "3".into(),
        o => o.into(),
    })
}

/// Tek IRC satırını işler
pub fn event(line: &str) -> Option<TwEvent> {
    let irc = parse_irc(line)?;
    match irc.command.as_str() {
        "PING" => Some(TwEvent::Ping(irc.trailing.unwrap_or_else(|| "tmi.twitch.tv".into()))),
        "RECONNECT" => Some(TwEvent::Reconnect),
        "ROOMSTATE" | "366" => Some(TwEvent::Joined),
        "NOTICE" => {
            let id = irc.tag("msg-id").to_string();
            if id.starts_with("msg_channel_suspended") || id == "msg_banned" || id == "msg_room_not_found" {
                Some(TwEvent::Error(irc.trailing.clone().unwrap_or(id)))
            } else {
                None
            }
        }
        "CLEARMSG" => {
            let id = irc.tag("target-msg-id");
            if !id.is_empty() {
                Some(TwEvent::DeleteMsg(id.to_string()))
            } else {
                let l = irc.tag("login");
                (!l.is_empty()).then(|| TwEvent::DeleteUserLast(l.to_lowercase()))
            }
        }
        "CLEARCHAT" => {
            // Kullanıcısız CLEARCHAT (tüm sohbeti temizle) yok sayılır
            let user = irc.trailing.as_deref().unwrap_or("").trim();
            (!user.is_empty()).then(|| TwEvent::ClearUser { login: user.to_lowercase(), permanent: irc.tag("ban-duration").is_empty() })
        }
        "PRIVMSG" => {
            let mut text = irc.trailing.clone().unwrap_or_default();
            let mut action = false;
            if let Some(inner) = text.strip_prefix("\u{1}ACTION ") {
                text = inner.trim_end_matches('\u{1}').to_string();
                action = true;
            }
            let author = author_of(&irc, "");
            let mut parts = emote_parts(&text, irc.tag("emotes"));
            let mut reply = None;
            let ru = irc.tag("reply-parent-display-name");
            if !ru.is_empty() {
                reply = Some(Reply { user: ru.to_string(), text: irc.tag("reply-parent-msg-body").to_string() });
                // Twitch yanıtın başına "@kullanici " ekler; zaten "↩ @kullanici" olarak gösteriliyor
                let login = irc.tag("reply-parent-user-login");
                if let Some(Part::Text { v }) = parts.first_mut() {
                    for cand in [format!("@{login} "), format!("@{ru} ")] {
                        if cand.len() > 2 && v.get(..cand.len()).is_some_and(|p| p.to_lowercase() == cand.to_lowercase()) {
                            *v = v[cand.len()..].to_string();
                            break;
                        }
                    }
                }
                parts = merge_text(parts);
            }
            let bits: u64 = irc.tag("bits").parse().unwrap_or(0);
            let id = match irc.tag("id") {
                "" => format!("tw{}", super::poll::rand_u64()),
                s => s.to_string(),
            };
            let kind = if bits > 0 { Kind::Donation } else { Kind::Chat };
            let mut m = ChatMsg::new(Platform::Twitch, id, kind, author, parts);
            if let Ok(ts) = irc.tag("tmi-sent-ts").parse::<u64>() {
                m.ts = ts;
            }
            m.action = action;
            m.reply_to = reply;
            if bits > 0 {
                m.amount = Some(format!("{bits} bits"));
                m.alert = Some(AlertInfo { kind: "cheer".into(), count: Some(bits), ..Default::default() });
            }
            Some(TwEvent::Msg(Box::new(m)))
        }
        "USERNOTICE" => {
            let msg_id = irc.tag("msg-id").to_string();
            let mut author = author_of(&irc, "");
            let text = irc.trailing.clone().unwrap_or_default();
            let parts = if text.is_empty() { vec![] } else { emote_parts(&text, irc.tag("emotes")) };
            let p = |k: &str| irc.tag(&format!("msg-param-{k}")).to_string();
            let num = |k: &str| p(k).parse::<u64>().ok().filter(|n| *n > 0);
            let mut alert = AlertInfo { kind: msg_id.clone(), ..Default::default() };
            let kind = match msg_id.as_str() {
                "sub" | "resub" => {
                    alert.months = num("cumulative-months").map(|x| x as u32);
                    alert.tier = tier_name(&p("sub-plan"));
                    Kind::Sub
                }
                "subgift" | "anonsubgift" => {
                    alert.gifted = true;
                    alert.tier = tier_name(&p("sub-plan"));
                    alert.months = num("gift-months").or_else(|| num("months")).map(|x| x as u32);
                    let r = p("recipient-display-name");
                    alert.recipient = (!r.is_empty()).then_some(r);
                    Kind::Sub
                }
                "submysterygift" | "anonsubmysterygift" => {
                    alert.gifted = true;
                    alert.tier = tier_name(&p("sub-plan"));
                    alert.count = num("mass-gift-count");
                    Kind::Sub
                }
                "giftpaidupgrade" | "anongiftpaidupgrade" | "primepaidupgrade" | "communitypayforward" | "standardpayforward" => Kind::Sub,
                "raid" => {
                    alert.count = num("viewerCount");
                    let dn = p("displayName");
                    if !dn.is_empty() {
                        author.name = dn;
                    }
                    Kind::Raid
                }
                _ => Kind::Alert,
            };
            let id = match irc.tag("id") {
                "" => format!("tw{}", super::poll::rand_u64()),
                s => s.to_string(),
            };
            let mut m = ChatMsg::new(Platform::Twitch, id, kind, author, parts);
            if let Ok(ts) = irc.tag("tmi-sent-ts").parse::<u64>() {
                m.ts = ts;
            }
            let sys = irc.tag("system-msg").trim().to_string();
            m.headline = (!sys.is_empty()).then_some(sys);
            m.alert = Some(alert);
            Some(TwEvent::Msg(Box::new(m)))
        }
        _ => None,
    }
}

/// GQL yanıtı: Some(Some(n)) yayında n izleyici, Some(None) kanal var yayın yok, None anlaşılamadı
pub fn parse_gql(body: &str) -> Option<Option<u64>> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let v = if v.is_array() { v.get(0)?.clone() } else { v };
    if v.get("errors").is_some_and(|e| !e.is_null()) {
        return None;
    }
    let user = v.pointer("/data/user")?;
    if user.is_null() {
        return None;
    }
    let n = user.pointer("/stream/viewersCount").and_then(|x| x.as_u64());
    Some(n)
}

/// İzleyici sayısı (hata: None)
pub async fn fetch_viewers(channel: &str) -> Option<Option<u64>> {
    let client = net::http().ok()?;
    for (op, hash) in GQL_QUERIES {
        let body = serde_json::json!([{
            "operationName": op,
            "variables": { "channelLogin": channel.to_lowercase() },
            "extensions": { "persistedQuery": { "version": 1, "sha256Hash": hash } }
        }]);
        let resp = client
            .post(GQL_URL)
            .header("Client-ID", GQL_CLIENT_ID)
            .header("Content-Type", "application/json")
            .header("Cache-Control", "no-cache, no-store")
            .body(body.to_string())
            .send()
            .await;
        let Ok(resp) = resp else { continue };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(text) = resp.text().await else { continue };
        if let Some(r) = parse_gql(&text) {
            return Some(r);
        }
    }
    None
}

/// İzleyici sayısı döngüsü (15 sn)
pub async fn run_viewers(ctx: Ctx) {
    let ch = ctx.link.ident.clone();
    loop {
        match fetch_viewers(&ch).await {
            Some(n) => ctx.hub.set_live(&ctx.key, n.is_some(), n),
            None => {}
        }
        tokio::time::sleep(Duration::from_secs(15)).await;
    }
}

/// Sohbet döngüsü: bağlan, dinle, koparsa artan beklemeyle yeniden bağlan
pub async fn run_chat(ctx: Ctx) {
    let ch = ctx.link.ident.to_lowercase();
    let mut backoff = Backoff::new(2, 60);
    loop {
        ctx.hub.set_chat(&ctx.key, false, None);
        match session(&ctx, &ch, &mut backoff).await {
            Ok(()) => backoff.reset(),
            Err(e) => ctx.hub.set_chat(&ctx.key, false, Some(e)),
        }
        tokio::time::sleep(backoff.next()).await;
    }
}

async fn session(ctx: &Ctx, ch: &str, backoff: &mut Backoff) -> Result<(), String> {
    let mut ws = net::ws_connect(IRC_URL, &[]).await?;
    let nick = format!("justinfan{}", 10000 + super::poll::rand_u64() % 89999);
    for l in [
        "CAP REQ :twitch.tv/tags twitch.tv/commands".to_string(),
        "PASS SCHMOOPIIE".to_string(),
        format!("NICK {nick}"),
        format!("JOIN #{ch}"),
    ] {
        ws.send(Message::text(l)).await.map_err(|e| e.to_string())?;
    }
    let mut ping = tokio::time::interval(Duration::from_secs(60));
    ping.tick().await;
    let mut last_rx = std::time::Instant::now();
    loop {
        tokio::select! {
            m = ws.next() => {
                last_rx = std::time::Instant::now();
                match m {
                    Some(Ok(Message::Text(t))) => {
                        for line in t.as_str().split("\r\n") {
                            let Some(ev) = event(line) else { continue };
                            match ev {
                                TwEvent::Ping(p) => { ws.send(Message::text(format!("PONG :{p}"))).await.map_err(|e| e.to_string())?; }
                                TwEvent::Reconnect => return Ok(()),
                                TwEvent::Joined => { backoff.reset(); ctx.hub.set_chat(&ctx.key, true, None); }
                                TwEvent::Error(e) => return Err(e),
                                TwEvent::Msg(mut m) => { m.channel = ctx.key.clone(); ctx.hub.ingest(*m); }
                                TwEvent::DeleteMsg(id) => ctx.hub.delete_ids(Platform::Twitch, &[id]),
                                TwEvent::DeleteUserLast(l) => ctx.hub.delete_user_last(Platform::Twitch, &l),
                                TwEvent::ClearUser { login, permanent } => ctx.hub.delete_user(Platform::Twitch, &login, permanent),
                            }
                        }
                    }
                    Some(Ok(Message::Ping(p))) => { let _ = ws.send(Message::Pong(p)).await; }
                    Some(Ok(Message::Close(_))) | None => return Err("bağlantı kapandı".into()),
                    Some(Ok(_)) => {}
                    Some(Err(e)) => return Err(e.to_string()),
                }
            }
            _ = ping.tick() => {
                if last_rx.elapsed() > Duration::from_secs(330) {
                    return Err("sunucu yanıt vermiyor".into());
                }
                ws.send(Message::text("PING :tmi.twitch.tv")).await.map_err(|e| e.to_string())?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIV: &str = "@badge-info=subscriber/14;badges=moderator/1,subscriber/12;color=#1E90FF;display-name=Ali_Veli;emotes=25:0-4,12-16/1902:18-22;id=abc-123;mod=1;subscriber=1;tmi-sent-ts=1727700000000;user-id=42 :ali_veli!ali_veli@ali_veli.tmi.twitch.tv PRIVMSG #erkinazcan :Kappa selam Kappa Keepo ğüş";

    #[test]
    fn irc_parse() {
        let i = parse_irc(PRIV).unwrap();
        assert_eq!(i.command, "PRIVMSG");
        assert_eq!(i.nick, "ali_veli");
        assert_eq!(i.params, vec!["#erkinazcan"]);
        assert_eq!(i.tag("display-name"), "Ali_Veli");
        assert_eq!(unescape_tag(r"a\sb\:c\\d"), "a b;c\\d");
        let p = parse_irc("PING :tmi.twitch.tv").unwrap();
        assert_eq!((p.command.as_str(), p.trailing.as_deref()), ("PING", Some("tmi.twitch.tv")));
    }

    #[test]
    fn privmsg() {
        let Some(TwEvent::Msg(m)) = event(PRIV) else { panic!() };
        assert_eq!(m.id, "twitch:abc-123");
        assert_eq!(m.author.name, "Ali_Veli");
        assert_eq!(m.author.login, "ali_veli");
        assert!(m.author.moderator && m.author.sub && !m.author.owner);
        assert_eq!(m.author.color.as_deref(), Some("#1E90FF"));
        assert_eq!(m.ts, 1727700000000);
        assert_eq!(
            m.parts,
            vec![
                Part::Emote { url: emote_url("25"), name: "Kappa".into() },
                Part::text(" selam "),
                Part::Emote { url: emote_url("25"), name: "Kappa".into() },
                Part::text(" "),
                Part::Emote { url: emote_url("1902"), name: "Keepo".into() },
                Part::text(" ğüş"),
            ]
        );
        assert_eq!(m.text, "Kappa selam Kappa Keepo ğüş");
    }

    #[test]
    fn emotes_unicode_positions() {
        // Konumlar karakter indeksi: "ğğ " sonrası emote
        let p = emote_parts("ğğ Kappa", "25:3-7");
        assert_eq!(p, vec![Part::text("ğğ "), Part::Emote { url: emote_url("25"), name: "Kappa".into() }]);
        // Bozuk konumlar yok sayılır
        assert_eq!(emote_parts("hi", "25:0-9"), vec![Part::text("hi")]);
    }

    #[test]
    fn action_reply_bits() {
        let l = "@badges=;display-name=Ayşe;emotes=;id=x1;reply-parent-display-name=Mehmet;reply-parent-user-login=mehmet;reply-parent-msg-body=nas\\sılsın;bits=100 :ayse!a@a PRIVMSG #c :\u{1}ACTION @mehmet iyiyim\u{1}";
        let Some(TwEvent::Msg(m)) = event(l) else { panic!() };
        assert!(m.action);
        assert_eq!(m.text, "iyiyim");
        assert_eq!(m.reply_to, Some(Reply { user: "Mehmet".into(), text: "nas ılsın".into() }));
        assert_eq!(m.kind, Kind::Donation);
        assert_eq!(m.amount.as_deref(), Some("100 bits"));
    }

    #[test]
    fn usernotice_and_moderation() {
        let sub = "@badges=subscriber/0;display-name=Can;id=n1;login=can;msg-id=resub;msg-param-cumulative-months=5;msg-param-sub-plan=1000;system-msg=Can\\ssubscribed\\sat\\sTier\\s1. :tmi.twitch.tv USERNOTICE #c :harika yayın";
        let Some(TwEvent::Msg(m)) = event(sub) else { panic!() };
        assert_eq!(m.kind, Kind::Sub);
        assert_eq!(m.author.login, "can");
        assert_eq!(m.headline.as_deref(), Some("Can subscribed at Tier 1."));
        let a = m.alert.as_ref().unwrap();
        assert_eq!((a.kind.as_str(), a.months, a.tier.as_deref()), ("resub", Some(5), Some("1")));
        assert_eq!(m.text, "harika yayın");

        let raid = "@display-name=Baskın;login=baskin;id=n2;msg-id=raid;msg-param-displayName=Baskın;msg-param-viewerCount=42 :tmi.twitch.tv USERNOTICE #c";
        let Some(TwEvent::Msg(m)) = event(raid) else { panic!() };
        assert_eq!(m.kind, Kind::Raid);
        assert_eq!(m.alert.unwrap().count, Some(42));

        let gift = "@display-name=X;login=x;id=n3;msg-id=subgift;msg-param-recipient-display-name=Y;msg-param-sub-plan=2000 :tmi.twitch.tv USERNOTICE #c";
        let Some(TwEvent::Msg(m)) = event(gift) else { panic!() };
        let a = m.alert.unwrap();
        assert!(a.gifted);
        assert_eq!((a.recipient.as_deref(), a.tier.as_deref()), (Some("Y"), Some("2")));

        assert_eq!(event("@login=ali;target-msg-id=abc :tmi.twitch.tv CLEARMSG #c :mesaj"), Some(TwEvent::DeleteMsg("abc".into())));
        assert_eq!(
            event("@ban-duration=600 :tmi.twitch.tv CLEARCHAT #c :Spammer"),
            Some(TwEvent::ClearUser { login: "spammer".into(), permanent: false })
        );
        assert_eq!(event(":tmi.twitch.tv CLEARCHAT #c :kotu"), Some(TwEvent::ClearUser { login: "kotu".into(), permanent: true }));
        assert_eq!(event(":tmi.twitch.tv CLEARCHAT #c"), None);
        assert_eq!(event("PING :tmi.twitch.tv"), Some(TwEvent::Ping("tmi.twitch.tv".into())));
        assert_eq!(event(":tmi.twitch.tv RECONNECT"), Some(TwEvent::Reconnect));
        assert_eq!(event("@emote-only=0;room-id=1 :tmi.twitch.tv ROOMSTATE #c"), Some(TwEvent::Joined));
    }

    #[test]
    fn gql() {
        assert_eq!(parse_gql(r#"[{"data":{"user":{"stream":{"viewersCount":321}}}}]"#), Some(Some(321)));
        assert_eq!(parse_gql(r#"[{"data":{"user":{"stream":null}}}]"#), Some(None));
        assert_eq!(parse_gql(r#"[{"data":{"user":null}}]"#), None);
        assert_eq!(parse_gql(r#"[{"errors":[{"message":"PersistedQueryNotFound"}]}]"#), None);
    }
}
