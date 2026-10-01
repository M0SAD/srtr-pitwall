//! Streamlabs uyarıları: Socket API (socket.io, Engine.IO v3) üzerinden bağış, takip, abonelik, bits, raid, host…
//! Kullanıcının "Socket API Token"ı gerekir (Streamlabs › Settings › API Settings › API Tokens; Widget Token değil).
//! Anahtar ayarlarda değil, uygulama yapılandırma klasöründeki ayrı bir dosyada tutulur (bkz. mod.rs secrets).
//!
//! Ham protokol: `0{...}` açıldı → `40` gönder; `40` bağlandı; `44` kimlik hatası; `2`/`3` ping/pong;
//! `42["event", {type, message:[...]}]` olay.

use super::model::{AlertInfo, Author, ChatMsg, Kind, Part, Platform};
use super::net::{self, json_str, json_u64, Backoff};
use super::Hub;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, PartialEq)]
pub enum SlFrame {
    /// Engine.IO açıldı (ping aralığı ms)
    Open(u64),
    Connected,
    AuthError,
    Ping,
    Pong,
    Event(Vec<ChatMsg>),
    Other,
}

/// Streamlabs türü → (ortak tür, mesaj türü)
fn map_type(t: &str) -> Option<(&'static str, Kind)> {
    Some(match t {
        "donation" | "streamlabscharity" | "superchat" => ("tip", Kind::Donation),
        "follow" => ("follower", Kind::Alert),
        "subscription" => ("subscriber", Kind::Sub),
        "resubscription" => ("resubscriber", Kind::Sub),
        "host" => ("host", Kind::Raid),
        "bits" => ("cheer", Kind::Donation),
        "raid" => ("raid", Kind::Raid),
        "merch" => ("redemption", Kind::Alert),
        "sponsor" | "member" => ("member", Kind::Sub),
        _ => return None,
    })
}

fn first_str(item: &Value, keys: &[&str]) -> String {
    keys.iter().map(|k| json_str(item.get(*k))).find(|s| !s.is_empty()).unwrap_or_default()
}

/// Tek uyarı öğesi → mesaj
pub fn alert_msg(etype: &str, item: &Value, platform_for: &str) -> Option<ChatMsg> {
    let (mut norm, kind) = map_type(etype)?;
    let months = ["months", "streak_months", "cumulative_months"].iter().find_map(|k| json_u64(item.get(*k))).map(|m| m as u32);
    if norm == "subscriber" && months.is_some_and(|m| m > 1) {
        norm = "resubscriber";
    }
    let user = match first_str(item, &["name", "from", "username", "display_name"]) {
        s if s.is_empty() => "?".to_string(),
        s => s,
    };
    let message = match item.get("message") {
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    };
    let amount = first_str(item, &["formatted_amount", "formattedAmount", "amount"]);
    let currency = json_str(item.get("currency"));
    let tier = first_str(item, &["sub_plan", "subPlan"]);
    let gifted = item.get("gifter").is_some_and(|x| !x.is_null() && x != "") || item.get("giftedBy").is_some_and(|x| !x.is_null()) || item.get("isGiftSub").and_then(|x| x.as_bool()).unwrap_or(false);
    let count = ["viewers", "raiders", "count"].iter().find_map(|k| json_u64(item.get(*k))).filter(|c| *c > 0);
    let id = match first_str(item, &["_id", "id", "event_id"]) {
        s if s.is_empty() => format!("sl{}", super::poll::rand_u64()),
        s => s,
    };
    let author = Author { login: user.to_lowercase(), name: user, ..Default::default() };
    let parts = if message.is_empty() { vec![] } else { vec![Part::text(message)] };
    let mut m = ChatMsg::new(Platform::Streamlabs, id, kind, author, parts);
    m.channel = "streamlabs".into();
    m.channel_name = match platform_for {
        "twitch_account" => "Twitch".into(),
        "youtube_account" => "YouTube".into(),
        "kick_account" => "Kick".into(),
        _ => "Streamlabs".into(),
    };
    if !amount.is_empty() && matches!(norm, "tip" | "cheer") {
        m.amount = Some(if norm == "cheer" {
            format!("{amount} bits")
        } else if currency.is_empty() || amount.contains(|c: char| !c.is_ascii_digit() && c != '.' && c != ',') {
            amount.clone()
        } else {
            format!("{amount} {currency}")
        });
    }
    m.alert = Some(AlertInfo {
        kind: norm.into(),
        tier: (!tier.is_empty()).then_some(tier),
        months,
        gifted,
        count,
        recipient: None,
        currency: (!currency.is_empty()).then_some(currency),
    });
    Some(m)
}

pub fn parse_frame(raw: &str) -> SlFrame {
    if raw == "2" {
        return SlFrame::Ping;
    }
    if raw == "3" {
        return SlFrame::Pong;
    }
    if let Some(rest) = raw.strip_prefix("42") {
        let Ok(Value::Array(a)) = serde_json::from_str::<Value>(rest) else { return SlFrame::Other };
        if a.first().and_then(|x| x.as_str()) != Some("event") {
            return SlFrame::Other;
        }
        let Some(data) = a.get(1) else { return SlFrame::Other };
        let etype = json_str(data.get("type")).to_lowercase();
        let for_ = json_str(data.get("for"));
        let items: Vec<&Value> = match data.get("message") {
            Some(Value::Array(v)) => v.iter().collect(),
            Some(o @ Value::Object(_)) => vec![o],
            _ => vec![],
        };
        return SlFrame::Event(items.into_iter().filter_map(|i| alert_msg(&etype, i, &for_)).collect());
    }
    if raw.starts_with("40") {
        return SlFrame::Connected;
    }
    if raw.starts_with("44") {
        return SlFrame::AuthError;
    }
    if let Some(rest) = raw.strip_prefix('0') {
        let iv = serde_json::from_str::<Value>(rest).ok().and_then(|v| json_u64(v.get("pingInterval"))).unwrap_or(25_000);
        return SlFrame::Open(iv);
    }
    SlFrame::Other
}

/// Bağlantı döngüsü (kimlik hatasında durur)
pub async fn run(hub: Arc<Hub>, token: String) {
    let mut backoff = Backoff::new(5, 60);
    loop {
        hub.set_streamlabs(false, None);
        match session(&hub, &token, &mut backoff).await {
            Ok(()) => backoff.reset(),
            Err(e) if e == "auth" => {
                hub.set_streamlabs(false, Some("Kimlik doğrulama hatası — Socket API Token'ı kontrol edin (Widget Token ile karıştırmayın)".into()));
                return;
            }
            Err(e) => hub.set_streamlabs(false, Some(e)),
        }
        tokio::time::sleep(backoff.next()).await;
    }
}

async fn session(hub: &Arc<Hub>, token: &str, backoff: &mut Backoff) -> Result<(), String> {
    let url = format!("wss://sockets.streamlabs.com/socket.io/?EIO=3&transport=websocket&token={}", crate::server::url_encode(token));
    let mut ws = net::ws_connect(&url, &[("User-Agent", net::BROWSER_UA)]).await?;
    let mut ping = tokio::time::interval(Duration::from_secs(25));
    ping.tick().await;
    loop {
        tokio::select! {
            m = ws.next() => match m {
                Some(Ok(Message::Text(t))) => match parse_frame(t.as_str()) {
                    SlFrame::Open(iv) => {
                        ping = tokio::time::interval(Duration::from_millis(iv.clamp(5_000, 60_000)));
                        ping.tick().await;
                        ws.send(Message::text("40")).await.map_err(|e| e.to_string())?;
                    }
                    SlFrame::Connected => { backoff.reset(); hub.set_streamlabs(true, None); }
                    SlFrame::AuthError => return Err("auth".into()),
                    SlFrame::Ping => { ws.send(Message::text("3")).await.map_err(|e| e.to_string())?; }
                    SlFrame::Event(list) => for m in list { hub.ingest(m); },
                    SlFrame::Pong | SlFrame::Other => {}
                },
                Some(Ok(Message::Ping(p))) => { let _ = ws.send(Message::Pong(p)).await; }
                Some(Ok(Message::Close(_))) | None => return Err("bağlantı kapandı".into()),
                Some(Ok(_)) => {}
                Some(Err(e)) => return Err(e.to_string()),
            },
            _ = ping.tick() => {
                // Engine.IO v3: istemci ping gönderir
                ws.send(Message::text("2")).await.map_err(|e| e.to_string())?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames() {
        assert_eq!(parse_frame(r#"0{"sid":"x","upgrades":[],"pingInterval":25000,"pingTimeout":60000}"#), SlFrame::Open(25000));
        assert_eq!(parse_frame("40"), SlFrame::Connected);
        assert_eq!(parse_frame("44\"Invalid token\""), SlFrame::AuthError);
        assert_eq!(parse_frame("2"), SlFrame::Ping);
        let don = r#"42["event",{"type":"donation","message":[{"name":"Bağışçı","amount":"50","formatted_amount":"₺50,00","currency":"TRY","message":"Kolay gelsin","_id":"d1"}],"for":"streamlabs"}]"#;
        let SlFrame::Event(v) = parse_frame(don) else { panic!() };
        assert_eq!(v.len(), 1);
        let m = &v[0];
        assert_eq!((m.kind, m.amount.as_deref(), m.text.as_str(), m.author.name.as_str()), (Kind::Donation, Some("₺50,00"), "Kolay gelsin", "Bağışçı"));
        assert_eq!(m.alert.as_ref().unwrap().kind, "tip");
        assert_eq!(m.id, "streamlabs:d1");
        let sub = r#"42["event",{"type":"subscription","message":[{"name":"Abone","months":3,"sub_plan":"1000"}],"for":"twitch_account"}]"#;
        let SlFrame::Event(v) = parse_frame(sub) else { panic!() };
        let a = v[0].alert.as_ref().unwrap();
        assert_eq!((a.kind.as_str(), a.months, a.tier.as_deref()), ("resubscriber", Some(3), Some("1000")));
        assert_eq!(v[0].channel_name, "Twitch");
        let raid = r#"42["event",{"type":"raid","message":{"name":"Akıncı","raiders":25},"for":"twitch_account"}]"#;
        let SlFrame::Event(v) = parse_frame(raid) else { panic!() };
        assert_eq!((v[0].kind, v[0].alert.as_ref().unwrap().count), (Kind::Raid, Some(25)));
        let SlFrame::Event(v) = parse_frame(r#"42["event",{"type":"alertPlaying","message":{}}]"#) else { panic!() };
        assert!(v.is_empty());
    }
}
