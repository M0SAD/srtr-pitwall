//! YouTube: resmi API olmadan okuma (MultiChatOverlay ile aynı yöntem).
//!
//! 1. Kanal linki → `https://www.youtube.com/@ad/live` sayfası: `<link rel="canonical" href=".../watch?v=ID">`
//!    ve `"isLiveNow":true` varsa yayın canlıdır.
//! 2. İzleme sayfasındaki `ytInitialData` içinden sohbet devam anahtarı alınır. "Canlı sohbet" (tüm
//!    mesajlar; "Üst sohbet" bazılarını gizler) görünümünün anahtarı tercih edilir, çalışmazsa bir kez
//!    varsayılana dönülür.
//! 3. `youtubei/v1/live_chat/get_live_chat` her `ytInterval` saniyede çağrılır. İlk yanıt (geçmiş
//!    mesajlar) atlanır. Emoji resimleri, Super Chat / Super Sticker / üyelik / hediye üyelik, silme ve yasaklar işlenir.
//! 4. İzleyici sayısı `youtubei/v1/updated_metadata` ile 15 sn'de bir; art arda 3 kez alınamazsa yayın bitmiş sayılır.
//!    Yayında olmayan kanal 30 sn'de bir (ilk kez 10 sn sonra) yeniden kontrol edilir.
//!
//! İstemci sürümü (`clientVersion`): sayfadaki `INNERTUBE_CLIENT_VERSION` kullanılır, bulunamazsa
//! [`CLIENT_VERSION`]; ayarlardaki `general.livechat.ytClientVersion` doluysa o geçerlidir.

use super::links::{youtube_live_page, YtKind};
use super::model::{merge_text, AlertInfo, Author, ChatMsg, Kind, Part, Platform};
use super::net::{self, json_str};
use super::Ctx;
use serde_json::Value;
use std::time::{Duration, Instant};

/// Varsayılan web istemcisi sürümü (YouTube yeni sürüm çıkardıkça güncellenebilir; ayarlardan da ezilebilir)
pub const CLIENT_VERSION: &str = "2.20260925.01.00";
const CHAT_URL: &str = "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false";
const META_URL: &str = "https://www.youtube.com/youtubei/v1/updated_metadata?prettyPrint=false";
const COOKIE: &str = "CONSENT=YES+cb; SOCS=CAI";
const RESOLVE_URL: &str = "https://www.youtube.com/youtubei/v1/navigation/resolve_url?prettyPrint=false";
const NEXT_URL: &str = "https://www.youtube.com/youtubei/v1/next?prettyPrint=false";
const PLAYER_URL: &str = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

// YouTube HTML sayfaları için istek sınırı (HTTP 429): tüm kanallar için ortak bekleme. Sınır varken sayfa hiç
// istenmez (her yeniden denemede / "Yeniden kur"da tekrar istemek sınırı uzatıyordu); bekleme her 429'da ikiye katlanır.
static BLOCK_UNTIL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static BLOCK_LEVEL: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn page_block_left() -> Option<u64> {
    let until = BLOCK_UNTIL.load(std::sync::atomic::Ordering::Relaxed);
    let now = unix_now();
    (until > now).then(|| until - now)
}

fn note_page_429(retry_after: Option<u64>) -> u64 {
    use std::sync::atomic::Ordering::Relaxed;
    let level = BLOCK_LEVEL.fetch_add(1, Relaxed).min(4);
    let secs = retry_after.unwrap_or(60u64 << level).clamp(30, 900);
    BLOCK_UNTIL.store(unix_now() + secs, Relaxed);
    secs
}

fn limit_msg(secs: u64) -> String {
    format!("YouTube geçici istek sınırı (HTTP 429): {secs} sn sonra yeniden denenecek")
}

/// Sayfadaki `ytInitialData` nesnesi
pub fn initial_data(page: &str) -> Option<Value> {
    for marker in ["var ytInitialData = ", "window[\"ytInitialData\"] = ", "ytInitialData = "] {
        if let Some(i) = page.find(marker) {
            let mut it = serde_json::Deserializer::from_str(&page[i + marker.len()..]).into_iter::<Value>();
            if let Some(Ok(v)) = it.next() {
                return Some(v);
            }
        }
    }
    None
}

fn cont_of(c: &Value) -> Option<String> {
    for k in ["reloadContinuationData", "invalidationContinuationData", "timedContinuationData"] {
        if let Some(t) = c.pointer(&format!("/{k}/continuation")).and_then(|x| x.as_str()) {
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

/// (Canlı sohbet anahtarı, varsayılan anahtar)
pub fn chat_tokens(data: &Value) -> (Option<String>, Option<String>) {
    let Some(lcr) = data.pointer("/contents/twoColumnWatchNextResults/conversationBar/liveChatRenderer") else {
        return (None, None);
    };
    let default = lcr.get("continuations").and_then(|c| c.as_array()).and_then(|a| a.iter().find_map(cont_of));
    let live = lcr
        .pointer("/header/liveChatHeaderRenderer/viewSelector/sortFilterSubMenuRenderer/subMenuItems")
        .and_then(|x| x.as_array())
        .filter(|a| a.len() >= 2)
        .and_then(|a| a[1].pointer("/continuation/reloadContinuationData/continuation"))
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    (live, default)
}

/// Yapı değişirse: "liveChatRenderer"dan sonraki ilk "continuation":"…"
pub fn fallback_token(page: &str) -> Option<String> {
    let i = page.find("\"liveChatRenderer\"")?;
    let rest = &page[i..];
    let j = rest.find("\"continuation\":\"")? + 16;
    let end = rest[j..].find('"')?;
    Some(rest[j..j + end].to_string()).filter(|s| !s.is_empty())
}

/// Kanal /live sayfasındaki kanonik video kimliği
pub fn canonical_video(page: &str) -> Option<String> {
    let marker = "<link rel=\"canonical\" href=\"https://www.youtube.com/watch?v=";
    let i = page.find(marker)? + marker.len();
    let id: String = page[i..].chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    (id.len() == 11).then_some(id)
}

pub fn is_live_now(page: &str) -> bool {
    page.contains("\"isLiveNow\":true") || page.contains("\"isLive\":true")
}

/// JSON metin değeri: `"anahtar":"…"` (kaçışlar çözülür)
fn json_string_after(page: &str, key: &str) -> Option<String> {
    let marker = format!("\"{key}\":\"");
    let i = page.find(&marker)? + marker.len() - 1;
    let mut it = serde_json::Deserializer::from_str(&page[i..]).into_iter::<String>();
    it.next()?.ok()
}

pub fn owner_channel_name(page: &str) -> Option<String> {
    json_string_after(page, "ownerChannelName").filter(|s| !s.is_empty())
}

pub fn page_client_version(page: &str) -> Option<String> {
    json_string_after(page, "INNERTUBE_CLIENT_VERSION").filter(|s| s.starts_with("2."))
}

fn simple_or_runs(v: Option<&Value>) -> String {
    let Some(v) = v else { return String::new() };
    if let Some(s) = v.get("simpleText").and_then(|x| x.as_str()) {
        return s.to_string();
    }
    v.get("runs")
        .and_then(|r| r.as_array())
        .map(|a| a.iter().map(|r| json_str(r.get("text"))).collect::<String>())
        .unwrap_or_default()
}

fn last_thumb(v: Option<&Value>) -> Option<String> {
    v?.get("thumbnails")?.as_array()?.last()?.get("url")?.as_str().map(|u| if u.starts_with("//") { format!("https:{u}") } else { u.to_string() })
}

/// Kısa kodlar → emoji (resim yoksa)
fn shortcut_emoji(s: &str) -> Option<&'static str> {
    Some(match s {
        ":joy:" => "😂",
        ":smile:" => "😄",
        ":grin:" => "😁",
        ":thinking:" => "🤔",
        ":fire:" => "🔥",
        ":thumbsup:" => "👍",
        ":clap:" => "👏",
        ":100:" => "💯",
        ":heart:" => "❤️",
        ":heart_eyes:" => "😍",
        ":sunglasses:" => "😎",
        ":wink:" => "😉",
        ":blush:" => "😊",
        ":wave:" => "👋",
        ":crown:" => "👑",
        ":zap:" => "⚡",
        ":boom:" => "💥",
        ":sparkles:" => "✨",
        ":star:" => "⭐",
        _ => return None,
    })
}

fn emoji_part(e: &Value) -> Part {
    let custom = e.get("isCustomEmoji").and_then(|x| x.as_bool()).unwrap_or(false);
    let id = json_str(e.get("emojiId"));
    // Standart Unicode emoji: metin olarak (YouTube resmi yerine sistem emojisi)
    if !custom && !id.is_empty() && !id.starts_with("UC") && id.chars().count() <= 8 && !id.is_ascii() {
        return Part::text(id);
    }
    let label = {
        let l = json_str(e.pointer("/image/accessibility/accessibilityData/label"));
        if l.is_empty() {
            e.get("shortcuts").and_then(|s| s.get(0)).map(|x| json_str(Some(x))).unwrap_or_else(|| "emoji".into())
        } else {
            l
        }
    };
    if let Some(url) = last_thumb(e.get("image")) {
        // Kanal emojisi: adı kanalın verdiği kısa koddan (":_ad:"); erişilebilirlik etiketi çoğu zaman yüklenen dosyanın
        // adıdır ("imagein…" gibi) ve okununca anlamsızdı
        let name = if custom {
            e.get("shortcuts").and_then(|s| s.get(0)).and_then(|x| x.as_str()).map(String::from).filter(|s| !s.is_empty()).unwrap_or(label)
        } else {
            label
        };
        return Part::Emote { url, name, custom };
    }
    if let Some(sc) = e.get("shortcuts").and_then(|s| s.get(0)).and_then(|x| x.as_str()) {
        return Part::text(shortcut_emoji(sc).map(String::from).unwrap_or_else(|| sc.to_string()));
    }
    if let Some(hex) = id.strip_prefix("U+") {
        if let Some(c) = u32::from_str_radix(hex, 16).ok().and_then(char::from_u32) {
            return Part::text(c.to_string());
        }
    }
    Part::text(if id.is_empty() { "🔹".to_string() } else { id })
}

/// `message` alanı (simpleText ya da runs: metin / emoji / bağlantı)
pub fn message_parts(msg: Option<&Value>) -> Vec<Part> {
    let Some(msg) = msg else { return vec![] };
    if let Some(s) = msg.get("simpleText").and_then(|x| x.as_str()) {
        return vec![Part::text(s)];
    }
    let mut parts = Vec::new();
    for run in msg.get("runs").and_then(|r| r.as_array()).into_iter().flatten() {
        if let Some(t) = run.get("text").and_then(|x| x.as_str()) {
            let url = json_str(run.pointer("/navigationEndpoint/urlEndpoint/url"));
            if !url.is_empty() {
                // YouTube yönlendirme adresi: asıl adres q parametresinde
                let real = url
                    .split_once("redirect?")
                    .and_then(|(_, q)| q.split('&').find_map(|kv| kv.strip_prefix("q=")))
                    .map(|q| super::links::clean_link(q))
                    .unwrap_or(url);
                parts.push(Part::Link { url: real, v: t.to_string() });
            } else {
                parts.push(Part::text(t));
            }
        } else if let Some(e) = run.get("emoji") {
            parts.push(emoji_part(e));
        }
    }
    merge_text(parts)
}

fn author_of(r: &Value) -> Author {
    let name = simple_or_runs(r.get("authorName"));
    let mut a = Author {
        login: name.trim_start_matches('@').to_lowercase(),
        name,
        id: json_str(r.get("authorExternalChannelId")),
        avatar: last_thumb(r.get("authorPhoto")),
        ..Default::default()
    };
    for b in r.get("authorBadges").and_then(|x| x.as_array()).into_iter().flatten() {
        let br = b.get("liveChatAuthorBadgeRenderer").unwrap_or(b);
        if br.get("customThumbnail").is_some() {
            a.member = true;
            a.badges.push("member".into());
        }
        match json_str(br.pointer("/icon/iconType")).as_str() {
            "OWNER" => {
                a.owner = true;
                a.badges.push("owner".into());
            }
            "MODERATOR" => {
                a.moderator = true;
                a.badges.push("moderator".into());
            }
            "VERIFIED" => a.badges.push("verified".into()),
            _ => {}
        }
    }
    a.sub = a.member;
    a
}

fn ts_of(r: &Value) -> Option<u64> {
    json_str(r.get("timestampUsec")).parse::<u64>().ok().map(|u| u / 1000)
}

fn finish(mut m: ChatMsg, r: &Value) -> ChatMsg {
    if let Some(ts) = ts_of(r) {
        m.ts = ts;
    }
    m
}

/// Tek sohbet öğesi (addChatItemAction.item)
pub fn item_msg(item: &Value, client_id: &str) -> Option<ChatMsg> {
    let id_of = |r: &Value| match json_str(r.get("id")) {
        s if !s.is_empty() => s,
        _ if !client_id.is_empty() => client_id.to_string(),
        _ => format!("yt{}", super::poll::rand_u64()),
    };
    if let Some(r) = item.get("liveChatTextMessageRenderer") {
        let parts = message_parts(r.get("message"));
        let a = author_of(r);
        if a.name.is_empty() || parts.is_empty() {
            return None;
        }
        return Some(finish(ChatMsg::new(Platform::Youtube, id_of(r), Kind::Chat, a, parts), r));
    }
    if let Some(r) = item.get("liveChatPaidMessageRenderer") {
        let a = author_of(r);
        let mut m = ChatMsg::new(Platform::Youtube, id_of(r), Kind::Superchat, a, message_parts(r.get("message")));
        m.amount = Some(simple_or_runs(r.get("purchaseAmountText"))).filter(|s| !s.is_empty());
        m.alert = Some(AlertInfo { kind: "superchat".into(), ..Default::default() });
        return Some(finish(m, r));
    }
    if let Some(r) = item.get("liveChatPaidStickerRenderer") {
        let a = author_of(r);
        let name = match json_str(r.pointer("/sticker/accessibility/accessibilityData/label")) {
            s if s.is_empty() => "Super Sticker".to_string(),
            s => s,
        };
        let parts = last_thumb(r.get("sticker")).map(|url| vec![Part::Emote { url, name, custom: false }]).unwrap_or_default();
        let mut m = ChatMsg::new(Platform::Youtube, id_of(r), Kind::Superchat, a, parts);
        m.amount = Some(simple_or_runs(r.get("purchaseAmountText"))).filter(|s| !s.is_empty());
        m.alert = Some(AlertInfo { kind: "supersticker".into(), ..Default::default() });
        return Some(finish(m, r));
    }
    if let Some(r) = item.get("liveChatMembershipItemRenderer") {
        let mut a = author_of(r);
        a.member = true;
        a.sub = true;
        let primary = simple_or_runs(r.get("headerPrimaryText"));
        let sub = simple_or_runs(r.get("headerSubtext"));
        let mut m = ChatMsg::new(Platform::Youtube, id_of(r), Kind::Sub, a, message_parts(r.get("message")));
        let head = [primary.as_str(), sub.as_str()].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join(" · ");
        m.headline = (!head.is_empty()).then_some(head);
        let months: Option<u32> = if primary.is_empty() { None } else { net::parse_count(&primary).map(|x| x as u32) };
        m.alert = Some(AlertInfo { kind: if primary.is_empty() { "member".into() } else { "milestone".into() }, months, ..Default::default() });
        return Some(finish(m, r));
    }
    if let Some(r) = item.get("liveChatSponsorshipsGiftPurchaseAnnouncementRenderer") {
        let h = r.pointer("/header/liveChatSponsorshipsHeaderRenderer").unwrap_or(r);
        let mut a = author_of(h);
        if a.id.is_empty() {
            a.id = json_str(r.get("authorExternalChannelId"));
        }
        let text = simple_or_runs(h.get("primaryText"));
        let mut m = ChatMsg::new(Platform::Youtube, id_of(r), Kind::Sub, a, vec![]);
        m.headline = (!text.is_empty()).then(|| text.clone());
        m.alert = Some(AlertInfo { kind: "gift".into(), gifted: true, count: net::parse_count(&text), ..Default::default() });
        return Some(finish(m, r));
    }
    None
}

#[derive(Debug, Default, PartialEq)]
pub struct ChatBatch {
    pub msgs: Vec<ChatMsg>,
    pub deleted_ids: Vec<String>,
    /// Tüm mesajları silinen yazarlar (kanal kimliği UC…)
    pub deleted_authors: Vec<String>,
    pub next: Option<String>,
    pub timeout_ms: Option<u64>,
}

/// get_live_chat yanıtı (sohbet verisi yoksa None)
pub fn parse_chat(v: &Value) -> Option<ChatBatch> {
    let lc = v.pointer("/continuationContents/liveChatContinuation")?;
    let mut b = ChatBatch::default();
    for c in lc.get("continuations").and_then(|x| x.as_array()).into_iter().flatten() {
        if let Some(t) = cont_of(c) {
            b.next = Some(t);
            b.timeout_ms = ["invalidationContinuationData", "timedContinuationData"]
                .iter()
                .find_map(|k| c.pointer(&format!("/{k}/timeoutMs")).and_then(|x| x.as_u64()));
            break;
        }
    }
    for action in lc.get("actions").and_then(|x| x.as_array()).into_iter().flatten() {
        if let Some(add) = action.get("addChatItemAction") {
            if let Some(m) = add.get("item").and_then(|i| item_msg(i, &json_str(add.get("clientId")))) {
                b.msgs.push(m);
            }
            continue;
        }
        for k in ["removeChatItemAction", "markChatItemAsDeletedAction"] {
            let id = json_str(action.pointer(&format!("/{k}/targetItemId")));
            if !id.is_empty() && !b.deleted_ids.contains(&id) {
                b.deleted_ids.push(id);
            }
        }
        if let Some(rep) = action.get("replaceChatItemAction") {
            let item = rep.get("replacementItem").map(|x| x.to_string()).unwrap_or_default();
            if item.contains("liveChatDeletedMessageRenderer") || item.contains("deletedStateMessage") {
                let id = json_str(rep.get("targetItemId"));
                if !id.is_empty() && !b.deleted_ids.contains(&id) {
                    b.deleted_ids.push(id);
                }
            }
        }
        for k in ["markChatItemsByAuthorAsDeletedAction", "removeChatItemByAuthorAction"] {
            let ch = json_str(action.pointer(&format!("/{k}/externalChannelId")));
            if !ch.is_empty() && !b.deleted_authors.contains(&ch) {
                b.deleted_authors.push(ch);
            }
        }
    }
    Some(b)
}

/// updated_metadata yanıtından canlı izleyici sayısı (bitmiş yayın / normal video: None)
pub fn parse_viewers(v: &Value, raw: &str) -> Option<u64> {
    for action in v.get("actions").and_then(|x| x.as_array()).into_iter().flatten() {
        let Some(vc) = action.pointer("/updateViewershipAction/viewCount/videoViewCountRenderer") else { continue };
        let mut texts = Vec::new();
        for k in ["viewCount", "originalViewCount"] {
            match vc.get(k) {
                Some(Value::String(s)) => texts.push(s.clone()),
                Some(o @ Value::Object(_)) => {
                    let t = simple_or_runs(Some(o));
                    if !t.is_empty() {
                        texts.push(t);
                    }
                }
                _ => {}
            }
        }
        if texts.is_empty() {
            continue;
        }
        let live = vc.get("isLive").and_then(|x| x.as_bool()).unwrap_or(false)
            || texts.iter().any(|t| {
                let l = t.to_lowercase();
                l.contains("watching") || l.contains("izliyor") || l.contains("izleyen")
            });
        if !live {
            return None;
        }
        return texts.iter().find_map(|t| {
            let d: String = t.chars().filter(|c| c.is_ascii_digit()).collect();
            d.parse().ok()
        });
    }
    // Yedek: "concurrentViewers":"123"
    let i = raw.find("\"concurrentViewers\"")?;
    let d: String = raw[i + 19..].chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
    d.parse().ok()
}

// ---------------------------------------------------------------------------
// Ağ
// ---------------------------------------------------------------------------

async fn get_page(url: &str) -> Result<String, String> {
    if let Some(left) = page_block_left() {
        return Err(limit_msg(left));
    }
    let resp = net::http()?
        .get(url)
        .header("Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7")
        .header("Cookie", COOKIE)
        .send()
        .await
        .map_err(|e| format!("Ağ hatası: {e}"))?;
    if resp.status().as_u16() == 429 {
        let ra = resp.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| v.trim().parse().ok());
        return Err(limit_msg(note_page_429(ra)));
    }
    if !resp.status().is_success() {
        return Err(format!("YouTube sayfası yüklenemedi (HTTP {})", resp.status().as_u16()));
    }
    BLOCK_LEVEL.store(0, std::sync::atomic::Ordering::Relaxed);
    resp.text().await.map_err(|e| e.to_string())
}

fn api_ctx(cv: &str) -> Value {
    serde_json::json!({ "client": { "clientName": "WEB", "clientVersion": cv, "hl": "en" } })
}

/// Kanalın canlı yayını, HTML sayfası yerine YouTube'un veri arayüzüyle: `/@kanal/live` adresi canlı yayın varsa
/// izleme sayfasına çözülür, yayının gerçekten canlı olduğu oynatıcı bilgisinden doğrulanır.
async fn resolve_live_api(live_page: &str, cv: &str) -> Result<Option<String>, String> {
    let body = serde_json::json!({ "context": api_ctx(cv), "url": live_page });
    let (v, _) = post_json(RESOLVE_URL, &body, "https://www.youtube.com/").await?;
    let Some(vid) = v.pointer("/endpoint/watchEndpoint/videoId").and_then(|x| x.as_str()).map(str::to_string) else {
        if v.pointer("/endpoint/browseEndpoint").is_some() {
            return Ok(None); // kanal var, canlı yayın yok
        }
        return Err("YouTube kanal adresi çözülemedi".into());
    };
    let live = player_info(&vid, cv).await?.0;
    Ok(live.then_some(vid))
}

/// (canlı mı, kanal adı)
async fn player_info(vid: &str, cv: &str) -> Result<(bool, Option<String>), String> {
    let body = serde_json::json!({ "context": api_ctx(cv), "videoId": vid });
    let (p, _) = post_json(PLAYER_URL, &body, &format!("https://www.youtube.com/watch?v={vid}")).await?;
    let d = p.get("videoDetails");
    let live = d.and_then(|d| d.get("isLive")).and_then(|x| x.as_bool()).unwrap_or(false);
    let name = d.and_then(|d| d.get("author")).and_then(|x| x.as_str()).filter(|s| !s.is_empty()).map(str::to_string);
    Ok((live, name))
}

/// İzleme sayfasının yerine: (canlı mı, kanal adı, sohbet verisi `ytInitialData` ile aynı yapıda)
async fn watch_api(vid: &str, cv: &str) -> Result<(bool, Option<String>, Value), String> {
    let (live, name) = player_info(vid, cv).await?;
    let body = serde_json::json!({ "context": api_ctx(cv), "videoId": vid });
    let (next, _) = post_json(NEXT_URL, &body, &format!("https://www.youtube.com/watch?v={vid}")).await?;
    Ok((live, name, next))
}

async fn post_json(url: &str, body: &Value, referer: &str) -> Result<(Value, String), String> {
    let resp = net::http()?
        .post(url)
        .header("Content-Type", "application/json")
        .header("Cookie", COOKIE)
        .header("Origin", "https://www.youtube.com")
        .header("Referer", referer)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status != 200 {
        return Err(format!("HTTP {status}"));
    }
    let v = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok((v, text))
}

/// Kanalın şu an canlı yayını (yoksa None)
async fn resolve_live(live_page: &str) -> Result<Option<String>, String> {
    let page = get_page(live_page).await?;
    match canonical_video(&page) {
        Some(v) if is_live_now(&page) => Ok(Some(v)),
        _ => Ok(None),
    }
}

async fn fetch_viewers(vid: &str, cv: &str) -> Option<u64> {
    let body = serde_json::json!({ "context": { "client": { "clientName": "WEB", "clientVersion": cv, "hl": "en" } }, "videoId": vid });
    let (v, raw) = post_json(META_URL, &body, &format!("https://www.youtube.com/watch?v={vid}")).await.ok()?;
    parse_viewers(&v, &raw)
}

enum End {
    NotLive,
    Ended,
}

async fn chat_session(ctx: &Ctx, vid: &str) -> Result<End, String> {
    let watch = format!("https://www.youtube.com/watch?v={vid}");
    let cv0 = ctx.hub.yt_client_version().unwrap_or_else(|| CLIENT_VERSION.to_string());
    // Önce veri arayüzü (hafif, sayfa istek sınırına takılmaz); olmazsa izleme sayfası
    let (live, name, data, page_tok, page_cv) = match watch_api(vid, &cv0).await {
        Ok((live, name, next)) if live && chat_tokens(&next) != (None, None) => (live, name, Some(next), None, None),
        Ok((false, name, _)) => (false, name, None, None, None),
        _ => {
            let page = get_page(&watch).await?;
            (is_live_now(&page), owner_channel_name(&page), initial_data(&page), fallback_token(&page), page_client_version(&page))
        }
    };
    if let Some(n) = name {
        ctx.hub.set_name(&ctx.key, &n);
    }
    if !live {
        return Ok(End::NotLive);
    }
    let (live_tok, mut default_tok) = data.as_ref().map(chat_tokens).unwrap_or((None, None));
    if default_tok.is_none() {
        default_tok = page_tok;
    }
    let Some(mut token) = live_tok.clone().or_else(|| default_tok.clone()) else {
        return Err("Canlı sohbet verisi bulunamadı (sohbet kapalı olabilir)".into());
    };
    let mut fallback = if live_tok.is_some() && default_tok != live_tok { default_tok } else { None };
    let cv = ctx.hub.yt_client_version().or(page_cv).unwrap_or_else(|| CLIENT_VERSION.to_string());

    ctx.hub.set_video(&ctx.key, Some(vid.to_string()));
    ctx.hub.set_chat(&ctx.key, true, None);
    ctx.hub.set_live(&ctx.key, true, None);

    let mut skip_first = true;
    let mut errors = 0u32;
    let mut misses = 0u32;
    let mut next_viewers = Instant::now();
    loop {
        let started = Instant::now();
        if started >= next_viewers {
            next_viewers = started + Duration::from_secs(15);
            match fetch_viewers(vid, &cv).await {
                Some(n) => {
                    misses = 0;
                    ctx.hub.set_live(&ctx.key, true, Some(n));
                }
                None => {
                    misses += 1;
                    if misses >= 3 {
                        return Ok(End::Ended);
                    }
                }
            }
        }
        let body = serde_json::json!({
            "context": { "client": { "clientName": "WEB", "clientVersion": cv, "hl": "tr" } },
            "continuation": token,
        });
        let res = post_json(CHAT_URL, &body, &watch).await;
        match res.as_ref().ok().and_then(|(v, _)| parse_chat(v)) {
            Some(b) => {
                errors = 0;
                fallback = None; // anahtar çalışıyor
                if !skip_first {
                    for mut m in b.msgs {
                        m.channel = ctx.key.clone();
                        ctx.hub.ingest(m);
                    }
                    if !b.deleted_ids.is_empty() {
                        ctx.hub.delete_ids(Platform::Youtube, &b.deleted_ids);
                    }
                    for ch in b.deleted_authors {
                        ctx.hub.delete_author_id(Platform::Youtube, &ch);
                    }
                }
                skip_first = false;
                match b.next {
                    Some(t) => token = t,
                    None => return Ok(End::Ended), // sohbet kapandı
                }
            }
            None => {
                if let Some(fb) = fallback.take() {
                    eprintln!("YouTube: canlı sohbet görünümü açılamadı, varsayılan görünüme geçiliyor");
                    token = fb;
                    skip_first = true;
                } else {
                    errors += 1;
                    if errors >= 5 {
                        let why = res.err().unwrap_or_else(|| "sohbet verisi yok".into());
                        return Err(format!("YouTube sohbeti alınamadı: {why}"));
                    }
                }
            }
        }
        let wait = Duration::from_secs_f64(ctx.hub.yt_interval().max(1.0).min(3600.0));
        let spent = started.elapsed();
        tokio::time::sleep(wait.saturating_sub(spent).max(Duration::from_millis(300))).await;
    }
}

pub async fn run(ctx: Ctx) {
    let mut first = true;
    loop {
        ctx.hub.set_chat(&ctx.key, false, None);
        let vid = match ctx.link.yt {
            Some(YtKind::Video) => Ok(Some(ctx.link.ident.clone())),
            _ => match youtube_live_page(&ctx.link) {
                Some(u) => {
                    let cv = ctx.hub.yt_client_version().unwrap_or_else(|| CLIENT_VERSION.to_string());
                    match resolve_live_api(&u, &cv).await {
                        Ok(v) => Ok(v),
                        Err(_) => resolve_live(&u).await,
                    }
                }
                None => Err("Geçersiz kanal linki".into()),
            },
        };
        let wait = match vid {
            Err(e) => {
                ctx.hub.set_chat(&ctx.key, false, Some(e));
                // Sayfa istek sınırındaysa sınır bitene kadar beklenir
                30.max(page_block_left().unwrap_or(0))
            }
            Ok(None) => {
                ctx.hub.set_video(&ctx.key, None);
                ctx.hub.set_live(&ctx.key, false, None);
                if first {
                    10
                } else {
                    30
                }
            }
            Ok(Some(v)) => match chat_session(&ctx, &v).await {
                Ok(End::NotLive) | Ok(End::Ended) => {
                    ctx.hub.set_video(&ctx.key, None);
                    ctx.hub.set_live(&ctx.key, false, None);
                    ctx.hub.set_chat(&ctx.key, false, None);
                    if first {
                        10
                    } else {
                        30
                    }
                }
                Err(e) => {
                    ctx.hub.set_video(&ctx.key, None);
                    ctx.hub.set_chat(&ctx.key, false, Some(e));
                    20
                }
            },
        };
        first = false;
        tokio::time::sleep(Duration::from_secs(wait)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WATCH: &str = r#"<html><link rel="canonical" href="https://www.youtube.com/watch?v=abcDEF12345"><script>ytcfg.set({"INNERTUBE_CLIENT_VERSION":"2.20260920.00.00"});var ytInitialData = {"contents":{"twoColumnWatchNextResults":{"conversationBar":{"liveChatRenderer":{"continuations":[{"reloadContinuationData":{"continuation":"DEF"}}],"header":{"liveChatHeaderRenderer":{"viewSelector":{"sortFilterSubMenuRenderer":{"subMenuItems":[{"title":"Top chat","continuation":{"reloadContinuationData":{"continuation":"TOP"}}},{"title":"Live chat","continuation":{"reloadContinuationData":{"continuation":"LIVE"}}}]}}}}}}}}};</script>"ownerChannelName":"Erkin & Azcan","isLiveNow":true</html>"#;

    #[test]
    fn page_parsing() {
        assert_eq!(canonical_video(WATCH).as_deref(), Some("abcDEF12345"));
        assert!(is_live_now(WATCH));
        assert_eq!(owner_channel_name(WATCH).as_deref(), Some("Erkin & Azcan"));
        assert_eq!(page_client_version(WATCH).as_deref(), Some("2.20260920.00.00"));
        let d = initial_data(WATCH).unwrap();
        assert_eq!(chat_tokens(&d), (Some("LIVE".into()), Some("DEF".into())));
        assert_eq!(fallback_token(r#"x"liveChatRenderer":{"a":1,"continuation":"TOK"}"#).as_deref(), Some("TOK"));
        assert!(!is_live_now(r#"<link rel="canonical" href="https://www.youtube.com/@x">"#));
    }

    const CHAT: &str = r#"{"continuationContents":{"liveChatContinuation":{"continuations":[{"invalidationContinuationData":{"continuation":"NEXT","timeoutMs":5000}}],"actions":[
      {"addChatItemAction":{"clientId":"c1","item":{"liveChatTextMessageRenderer":{"id":"m1","timestampUsec":"1727700000123456","authorExternalChannelId":"UCaaa","authorName":{"simpleText":"@Ali"},"authorPhoto":{"thumbnails":[{"url":"https://yt3/s32"},{"url":"https://yt3/s64"}]},
        "authorBadges":[{"liveChatAuthorBadgeRenderer":{"icon":{"iconType":"MODERATOR"},"tooltip":"Moderator"}},{"liveChatAuthorBadgeRenderer":{"customThumbnail":{"thumbnails":[{"url":"x"}]},"tooltip":"Member (1 year)"}}],
        "message":{"runs":[{"text":"selam "},{"emoji":{"emojiId":"UCx/abc","shortcuts":[":yt:"],"isCustomEmoji":true,"image":{"thumbnails":[{"url":"https://e/1"},{"url":"https://e/2"}],"accessibility":{"accessibilityData":{"label":"yt"}}}}},{"text":" "},{"emoji":{"emojiId":"😀","shortcuts":[":grinning:"],"image":{"thumbnails":[{"url":"https://e/g"}]}}},{"text":" bak simracetr.com","navigationEndpoint":{"urlEndpoint":{"url":"https://www.youtube.com/redirect?event=x&q=https%3A%2F%2Fsimracetr.com&v=1"}}}]}}}}},
      {"addChatItemAction":{"item":{"liveChatPaidMessageRenderer":{"id":"p1","authorName":{"simpleText":"Zengin"},"purchaseAmountText":{"simpleText":"₺100,00"},"message":{"runs":[{"text":"helal"}]}}}}},
      {"addChatItemAction":{"item":{"liveChatPaidStickerRenderer":{"id":"s1","authorName":{"simpleText":"Sticky"},"purchaseAmountText":{"simpleText":"$2.00"},"sticker":{"thumbnails":[{"url":"//st/1"}],"accessibility":{"accessibilityData":{"label":"Kedi"}}}}}}},
      {"addChatItemAction":{"item":{"liveChatMembershipItemRenderer":{"id":"u1","authorName":{"simpleText":"Uye"},"headerSubtext":{"runs":[{"text":"Welcome to "},{"text":"Kanal"},{"text":"!"}]}}}}},
      {"markChatItemAsDeletedAction":{"targetItemId":"old1"}},
      {"removeChatItemAction":{"targetItemId":"old2"}},
      {"replaceChatItemAction":{"targetItemId":"old3","replacementItem":{"liveChatTextMessageRenderer":{"message":{"runs":[{"text":"x"}]},"deletedStateMessage":{"runs":[{"text":"[message deleted]"}]}}}}},
      {"markChatItemsByAuthorAsDeletedAction":{"externalChannelId":"UCbad"}}
    ]}}}"#;

    #[test]
    fn chat_actions() {
        let v: Value = serde_json::from_str(CHAT).unwrap();
        let b = parse_chat(&v).unwrap();
        assert_eq!(b.next.as_deref(), Some("NEXT"));
        assert_eq!(b.timeout_ms, Some(5000));
        assert_eq!(b.msgs.len(), 4);
        let m = &b.msgs[0];
        assert_eq!(m.id, "youtube:m1");
        assert_eq!(m.ts, 1727700000123);
        assert_eq!(m.author.name, "@Ali");
        assert_eq!(m.author.login, "ali");
        assert_eq!(m.author.id, "UCaaa");
        assert_eq!(m.author.avatar.as_deref(), Some("https://yt3/s64"));
        assert!(m.author.moderator && m.author.member && m.author.sub);
        assert_eq!(
            m.parts,
            vec![
                Part::text("selam "),
                Part::Emote { url: "https://e/2".into(), name: ":yt:".into(), custom: true },
                Part::text(" 😀"),
                Part::Link { url: "https://simracetr.com".into(), v: " bak simracetr.com".into() },
            ]
        );
        let p = &b.msgs[1];
        assert_eq!((p.kind, p.amount.as_deref(), p.text.as_str()), (Kind::Superchat, Some("₺100,00"), "helal"));
        let s = &b.msgs[2];
        assert_eq!(s.parts, vec![Part::Emote { url: "https://st/1".into(), name: "Kedi".into(), custom: false }]);
        let u = &b.msgs[3];
        assert_eq!((u.kind, u.headline.as_deref()), (Kind::Sub, Some("Welcome to Kanal!")));
        assert_eq!(b.deleted_ids, vec!["old1", "old2", "old3"]);
        assert_eq!(b.deleted_authors, vec!["UCbad"]);
        assert!(parse_chat(&serde_json::json!({"responseContext":{}})).is_none());
    }

    #[test]
    fn viewers() {
        let live: Value = serde_json::from_str(r#"{"actions":[{"updateViewershipAction":{"viewCount":{"videoViewCountRenderer":{"viewCount":{"runs":[{"text":"1,234"},{"text":" watching now"}]},"isLive":true}}}}]}"#).unwrap();
        assert_eq!(parse_viewers(&live, ""), Some(1234));
        let ended: Value = serde_json::from_str(r#"{"actions":[{"updateViewershipAction":{"viewCount":{"videoViewCountRenderer":{"viewCount":{"simpleText":"12,345 views"}}}}}]}"#).unwrap();
        assert_eq!(parse_viewers(&ended, ""), None);
        assert_eq!(parse_viewers(&Value::Null, r#"{"concurrentViewers": "77"}"#), Some(77));
    }
}
