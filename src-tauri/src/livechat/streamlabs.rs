//! Streamlabs uyarıları: Socket API (socket.io, Engine.IO v3) üzerinden bağış, takip, abonelik, bits, raid, host…
//! Kullanıcının "Socket API Token"ı gerekir (Streamlabs › Settings › API Settings › API Tokens; Widget Token değil).
//! Anahtar ayarlarda değil, uygulama yapılandırma klasöründeki ayrı bir dosyada tutulur (bkz. mod.rs secrets).
//!
//! Ham protokol (socket.io 2 / Engine.IO v3, doğrudan websocket taşıması):
//!   adres   wss://sockets.streamlabs.com/socket.io/?token=<Socket API Token>&EIO=3&transport=websocket
//!   `0{...}` Engine.IO açıldı (pingInterval / pingTimeout ms). Kök ad alanı için istemci `40` GÖNDERMEZ: sunucu
//!            kimliği doğrulayınca kendisi `40` yollar (socket.io-client 2 de böyle davranır).
//!   `40`     bağlandı (anahtar kabul edildi) · `44"..."` kimlik hatası (anahtar geçersiz) · `41` sunucu ayırdı
//!   `2`/`3`  ping/pong: Engine.IO v3'te pingi İSTEMCİ gönderir (`2`), sunucu `3` ile yanıtlar. pingInterval +
//!            pingTimeout boyunca hiçbir şey gelmezse bağlantı ölü sayılır ve yeniden bağlanılır.
//!   `42["event", {type, for, message:[...]}]` olay. `for`: streamlabs | twitch_account | youtube_account …;
//!            `type`: donation, follow, subscription, resub, bits, raid, host, superchat, membershipGift, subMysteryGift…
//!
//! Bağlantı canlı sohbet çalışmasa da kurulur (anahtar hemen doğrulansın, durum görünsün); uyarılar ise sohbet
//! akışına yalnızca sohbet çalışırken girer. Anahtar hiçbir zaman kayda / hata metnine yazılmaz.

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
    Open(u64, u64),
    Connected,
    AuthError,
    /// Sunucu ad alanından ayırdı (`41`)
    Disconnected,
    Ping,
    Pong,
    Event(Vec<ChatMsg>),
    Other,
}

/// Streamlabs türü → (ortak tür, mesaj türü)
/// `t` küçük harfe çevrilmiş Streamlabs türü; `for_`: olayın geldiği hesap (youtube_account, twitch_account…)
fn map_type(t: &str, for_: &str) -> Option<(&'static str, Kind)> {
    let yt = for_ == "youtube_account";
    Some(match t {
        "donation" | "streamlabscharity" | "pledge" | "eldonation" | "tiltifydonation" | "donordrivedonation" | "justgivingdonation" | "treatstream" => ("tip", Kind::Donation),
        "superchat" => ("superchat", Kind::Superchat),
        "follow" => ("follower", Kind::Alert),
        // YouTube'da "subscription" kanal üyeliğidir (abone olmak "follow" olarak gelir)
        "subscription" if yt => ("member", Kind::Sub),
        "subscription" => ("subscriber", Kind::Sub),
        "resub" | "resubscription" => ("resubscriber", Kind::Sub),
        "submysterygift" => ("submysterygift", Kind::Sub),
        "membershipgift" => ("gift", Kind::Sub),
        "host" => ("host", Kind::Raid),
        "bits" => ("cheer", Kind::Donation),
        "raid" => ("raid", Kind::Raid),
        "merch" | "loyalty_store_redemption" | "redemption" => ("redemption", Kind::Alert),
        "sponsor" | "member" => ("member", Kind::Sub),
        _ => return None,
    })
}

fn first_str(item: &Value, keys: &[&str]) -> String {
    keys.iter().map(|k| json_str(item.get(*k))).find(|s| !s.is_empty()).unwrap_or_default()
}

/// Tek uyarı öğesi → mesaj
pub fn alert_msg(etype: &str, item: &Value, platform_for: &str) -> Option<ChatMsg> {
    let (mut norm, kind) = map_type(&etype.to_lowercase(), platform_for)?;
    let months = ["months", "streak_months", "cumulative_months"].iter().find_map(|k| json_u64(item.get(*k))).map(|m| m as u32);
    if norm == "subscriber" && months.is_some_and(|m| m > 1) {
        norm = "resubscriber";
    }
    let user = match first_str(item, &["name", "from", "display_name", "displayName", "username", "gifter", "gifter_display_name"]) {
        s if s.is_empty() => "?".to_string(),
        s => s,
    };
    let message = match item.get("message").or_else(|| item.get("comment")) {
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    };
    // Super Chat'te "amount" mikro birimdir (5000000 = 5,00): biçimli metin tercih edilir
    let amount = if norm == "superchat" {
        match first_str(item, &["displayString", "display_string", "formatted_amount"]) {
            s if !s.is_empty() => s,
            _ => json_u64(item.get("amount")).map(|micros| format!("{:.2}", micros as f64 / 1_000_000.0)).unwrap_or_default(),
        }
    } else {
        first_str(item, &["formatted_amount", "formattedAmount", "amount"])
    };
    let currency = json_str(item.get("currency"));
    let tier = first_str(item, &["sub_plan", "subPlan"]);
    let gifted = item.get("gifter").is_some_and(|x| !x.is_null() && x != "") || item.get("giftedBy").is_some_and(|x| !x.is_null()) || item.get("isGiftSub").and_then(|x| x.as_bool()).unwrap_or(false);
    let count_keys: &[&str] = match norm {
        "submysterygift" => &["amount", "count"],
        "gift" => &["giftMembershipsCount", "amount", "count"],
        _ => &["viewers", "raiders", "count"],
    };
    let count = count_keys.iter().find_map(|k| json_u64(item.get(*k))).filter(|c| *c > 0);
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
    if !amount.is_empty() && matches!(norm, "tip" | "cheer" | "superchat") {
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
    if raw.starts_with("41") {
        return SlFrame::Disconnected;
    }
    if let Some(rest) = raw.strip_prefix('0') {
        let v = serde_json::from_str::<Value>(rest).ok();
        let iv = v.as_ref().and_then(|v| json_u64(v.get("pingInterval"))).unwrap_or(25_000);
        let to = v.as_ref().and_then(|v| json_u64(v.get("pingTimeout"))).unwrap_or(60_000);
        return SlFrame::Open(iv, to);
    }
    SlFrame::Other
}

pub const AUTH_MSG: &str = "Token geçersiz: Streamlabs anahtarı kabul etmedi. Streamlabs › Ayarlar › API Settings › API Tokens sekmesindeki “Your Socket API Token” değerini yapıştırın (Widget Token / Access Token değil).";

/// Hata metninde anahtar görünmesin (adres içeren hata metinleri için)
fn scrub(msg: &str, token: &str) -> String {
    let mut m = msg.to_string();
    for t in [token.to_string(), crate::server::url_encode(token)] {
        if t.len() >= 6 {
            m = m.replace(&t, "***");
        }
    }
    m
}

/// Bağlantı hatası → kullanıcıya gösterilecek Türkçe metin ("auth": anahtar reddedildi)
fn explain(e: &str) -> String {
    let low = e.to_lowercase();
    if low.contains("401") || low.contains("403") || low.contains("unauthorized") || low.contains("forbidden") {
        "auth".into()
    } else if low.contains("zaman aşımı") || low.contains("timed out") || low.contains("timeout") {
        "Streamlabs sunucusu yanıt vermedi (zaman aşımı); yeniden denenecek.".into()
    } else if low.contains("dns") || low.contains("resolve") || low.contains("lookup") || low.contains("network") || low.contains("connection") || low.contains("os error") {
        format!("Streamlabs sunucusuna ulaşılamadı (internet / güvenlik duvarı?); yeniden denenecek. [{e}]")
    } else {
        format!("Streamlabs bağlantısı koptu; yeniden denenecek. [{e}]")
    }
}

/// Bağlantı döngüsü: koparsa artan beklemeyle (5 → 60 sn) yeniden bağlanır; kimlik hatasında durur
/// (anahtar değişince ya da "Yeniden bağlan" ile yeniden başlar).
pub async fn run(hub: Arc<Hub>, token: String) {
    let token = token.trim().to_string();
    let mut backoff = Backoff::new(5, 60);
    // Bağlandıktan hemen sonra üst üste kapanma: anahtar büyük olasılıkla reddediliyor
    let mut early_drops = 0u32;
    loop {
        hub.set_streamlabs(false, None);
        let mut connected = false;
        let res = session(&hub, &token, &mut backoff, &mut connected).await;
        let err = match res {
            Ok(()) => String::new(),
            Err(e) => explain(&scrub(&e, &token)),
        };
        if err == "auth" {
            hub.set_streamlabs_auth(AUTH_MSG.into());
            return;
        }
        if connected {
            early_drops = 0;
        } else {
            early_drops += 1;
        }
        let msg = if early_drops >= 3 && !err.contains("ulaşılamadı") {
            format!("{err} Bağlantı her seferinde hemen kapanıyor: Socket API Token yanlış olabilir.")
        } else {
            err
        };
        hub.set_streamlabs(false, Some(msg));
        tokio::time::sleep(backoff.next()).await;
    }
}

async fn session(hub: &Arc<Hub>, token: &str, backoff: &mut Backoff, connected: &mut bool) -> Result<(), String> {
    let url = format!("wss://sockets.streamlabs.com/socket.io/?token={}&EIO=3&transport=websocket", crate::server::url_encode(token));
    let mut ws = net::ws_connect(&url, &[("User-Agent", net::BROWSER_UA)]).await?;
    let mut ping_ms: u64 = 25_000;
    let mut timeout_ms: u64 = 60_000;
    let mut ping = tokio::time::interval(Duration::from_millis(ping_ms));
    ping.tick().await;
    let mut last_rx = std::time::Instant::now();
    // Açılış paketi 20 sn içinde gelmezse sunucu socket.io konuşmuyor demektir
    let mut opened = false;
    loop {
        tokio::select! {
            m = ws.next() => {
                last_rx = std::time::Instant::now();
                match m {
                    Some(Ok(Message::Text(t))) => match parse_frame(t.as_str()) {
                        SlFrame::Open(iv, to) => {
                            opened = true;
                            ping_ms = iv.clamp(5_000, 60_000);
                            timeout_ms = to.clamp(5_000, 120_000);
                            ping = tokio::time::interval(Duration::from_millis(ping_ms));
                            ping.tick().await;
                        }
                        SlFrame::Connected => {
                            *connected = true;
                            backoff.reset();
                            hub.set_streamlabs(true, None);
                        }
                        SlFrame::AuthError => return Err("auth".into()),
                        SlFrame::Disconnected => return Err("sunucu bağlantıyı kapattı".into()),
                        SlFrame::Ping => { ws.send(Message::text("3")).await.map_err(|e| e.to_string())?; }
                        SlFrame::Event(list) => {
                            // Bazı sunucu sürümleri `40` göndermeden olay yollar: olay geldiyse bağlıyız
                            if !*connected {
                                *connected = true;
                                backoff.reset();
                                hub.set_streamlabs(true, None);
                            }
                            hub.streamlabs_events(list.len());
                            for m in list { hub.ingest(m); }
                        }
                        SlFrame::Pong | SlFrame::Other => {}
                    },
                    Some(Ok(Message::Ping(p))) => { let _ = ws.send(Message::Pong(p)).await; }
                    Some(Ok(Message::Close(_))) | None => return Err("bağlantı kapandı".into()),
                    Some(Ok(_)) => {}
                    Some(Err(e)) => return Err(e.to_string()),
                }
            },
            _ = ping.tick() => {
                if !opened && last_rx.elapsed() > Duration::from_secs(20) {
                    return Err("zaman aşımı".into());
                }
                if last_rx.elapsed() > Duration::from_millis(ping_ms + timeout_ms) {
                    return Err("zaman aşımı".into());
                }
                // Engine.IO v3: pingi istemci gönderir
                ws.send(Message::text("2")).await.map_err(|e| e.to_string())?;
            }
        }
    }
}

/// Yerel deneme olayı (Streamlabs'e gitmez): gerçek olayla aynı ham çerçeveyi üretir, böylece ayrıştırıcı da denenir.
/// `kind`: donation | follow | subscription | resub | bits | raid | host | superchat | membershipGift
pub fn test_frame(kind: &str) -> String {
    let id = format!("test{}", super::poll::rand_u64());
    let (ty, for_, item) = match kind {
        "follow" => ("follow", "twitch_account", serde_json::json!({ "name": "Deneme_Takipci", "isTest": true })),
        "subscription" => ("subscription", "twitch_account", serde_json::json!({ "name": "Deneme_Abone", "months": 1, "sub_plan": "1000", "message": "İlk abonelik!", "isTest": true })),
        "resub" => ("resub", "twitch_account", serde_json::json!({ "name": "Deneme_Abone", "months": 7, "streak_months": 7, "sub_plan": "1000", "message": "7 ay oldu", "isTest": true })),
        "bits" => ("bits", "twitch_account", serde_json::json!({ "name": "Deneme_Bits", "amount": "250", "message": "Cheer250 kolay gelsin", "isTest": true })),
        "raid" => ("raid", "twitch_account", serde_json::json!({ "name": "Deneme_Yayinci", "raiders": 42, "isTest": true })),
        "host" => ("host", "twitch_account", serde_json::json!({ "name": "Deneme_Yayinci", "viewers": "17", "isTest": true })),
        "superchat" => ("superchat", "youtube_account", serde_json::json!({ "name": "Deneme İzleyici", "amount": "50000000", "currency": "TRY", "displayString": "₺50,00", "comment": "Yayın harika!", "isTest": true })),
        "membershipGift" => ("membershipGift", "youtube_account", serde_json::json!({ "name": "Deneme Üye", "giftMembershipsCount": "5", "isTest": true })),
        _ => ("donation", "streamlabs", serde_json::json!({ "name": "Deneme_Bagisci", "from": "Deneme_Bagisci", "amount": "25", "formatted_amount": "₺25,00", "currency": "TRY", "message": "Bu bir deneme bağışıdır", "isTest": true })),
    };
    let mut item = item;
    item["_id"] = Value::String(id);
    format!("42{}", serde_json::json!(["event", { "type": ty, "for": for_, "message": [item] }]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames() {
        assert_eq!(parse_frame(r#"0{"sid":"x","upgrades":[],"pingInterval":25000,"pingTimeout":60000}"#), SlFrame::Open(25000, 60000));
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
        assert_eq!(parse_frame("41"), SlFrame::Disconnected);
        // Twitch yeniden abonelik "resub" olarak gelir
        let SlFrame::Event(v) = parse_frame(r#"42["event",{"type":"resub","message":[{"name":"Eski","months":"12","streak_months":12}],"for":"twitch_account"}]"#) else { panic!() };
        assert_eq!((v[0].kind, v[0].alert.as_ref().unwrap().kind.as_str(), v[0].alert.as_ref().unwrap().months), (Kind::Sub, "resubscriber", Some(12)));
        // YouTube: Super Chat (mikro birim + biçimli metin), üyelik, hediye üyelik
        let sc = r#"42["event",{"type":"superchat","message":[{"name":"İzleyici","amount":"5000000","currency":"USD","displayString":"$5.00","comment":"selam"}],"for":"youtube_account"}]"#;
        let SlFrame::Event(v) = parse_frame(sc) else { panic!() };
        assert_eq!((v[0].kind, v[0].amount.as_deref(), v[0].text.as_str(), v[0].channel_name.as_str()), (Kind::Superchat, Some("$5.00"), "selam", "YouTube"));
        let SlFrame::Event(v) = parse_frame(r#"42["event",{"type":"subscription","message":[{"name":"Üye"}],"for":"youtube_account"}]"#) else { panic!() };
        assert_eq!(v[0].alert.as_ref().unwrap().kind, "member");
        let SlFrame::Event(v) = parse_frame(r#"42["event",{"type":"membershipGift","message":[{"name":"Cömert","giftMembershipsCount":"5"}],"for":"youtube_account"}]"#) else { panic!() };
        assert_eq!((v[0].alert.as_ref().unwrap().kind.as_str(), v[0].alert.as_ref().unwrap().count), ("gift", Some(5)));
        // Yerel deneme çerçeveleri gerçek ayrıştırıcıdan geçer
        for k in ["donation", "follow", "subscription", "resub", "bits", "raid", "host", "superchat", "membershipGift"] {
            let SlFrame::Event(v) = parse_frame(&test_frame(k)) else { panic!("{k}") };
            assert_eq!(v.len(), 1, "{k}");
        }
        assert_eq!(scrub("wss://x/?token=abcdef123456&EIO=3", "abcdef123456"), "wss://x/?token=***&EIO=3");
        assert_eq!(explain("HTTP error: 401 Unauthorized"), "auth");
    }
}
