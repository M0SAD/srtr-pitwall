//! Canlı sohbet: platformdan bağımsız ortak mesaj modeli (Rust ↔ arayüz, camelCase JSON).
//!
//! HTML taşınmaz: mesaj metni parçalara bölünür (metin / emote resmi / bağlantı / bahsetme),
//! arayüz bunları kendisi çizer.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Youtube,
    Twitch,
    Kick,
    Streamlabs,
    System,
}

impl Platform {
    pub fn as_str(self) -> &'static str {
        match self {
            Platform::Youtube => "youtube",
            Platform::Twitch => "twitch",
            Platform::Kick => "kick",
            Platform::Streamlabs => "streamlabs",
            Platform::System => "system",
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Platform::Youtube => "YouTube",
            Platform::Twitch => "Twitch",
            Platform::Kick => "Kick",
            Platform::Streamlabs => "Streamlabs",
            Platform::System => "Sistem",
        }
    }
    pub fn parse(s: &str) -> Option<Platform> {
        Some(match s.to_ascii_lowercase().as_str() {
            "youtube" => Platform::Youtube,
            "twitch" => Platform::Twitch,
            "kick" => Platform::Kick,
            "streamlabs" => Platform::Streamlabs,
            "system" => Platform::System,
            _ => return None,
        })
    }
}

/// Mesaj türü
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// Normal sohbet mesajı
    Chat,
    /// YouTube Super Chat / Super Sticker
    Superchat,
    /// Abonelik / üyelik / hediye abonelik
    Sub,
    /// Raid / host
    Raid,
    /// Bağış (Streamlabs), Twitch Bits
    Donation,
    /// Diğer uyarılar (takip, ödül, duyuru…)
    Alert,
    /// Uygulamanın kendi bilgi satırları
    System,
}

/// Mesaj parçası. JSON: `{"t":"text","v":"…"}`, `{"t":"emote","url":"…","name":"…"}`,
/// `{"t":"link","url":"https://…","v":"görünen"}`, `{"t":"mention","v":"kullanici"}`
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum Part {
    Text { v: String },
    Emote {
        url: String,
        name: String,
        /// Kanalın kendi emojisi / özel görseli (YouTube kanal emojisi): sesli okumada ayrı ayarla okunur
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        custom: bool,
    },
    Link { url: String, v: String },
    Mention { v: String },
}

impl Part {
    pub fn text(s: impl Into<String>) -> Part {
        Part::Text { v: s.into() }
    }
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    /// Görünen ad
    pub name: String,
    /// Küçük harfli giriş adı (yasaklama/oy için). YouTube'da görünen ad (küçük harf).
    pub login: String,
    /// Platformdaki kullanıcı kimliği (YouTube: kanal kimliği UC…, Twitch: user-id, Kick: kullanıcı id)
    #[serde(skip_serializing_if = "String::is_empty")]
    pub id: String,
    /// Kullanıcının kendi rengi (Twitch / Kick)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Profil resmi (YouTube)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// Moderatör
    #[serde(rename = "mod")]
    pub moderator: bool,
    /// Abone (Twitch/Kick abone ya da kurucu)
    pub sub: bool,
    /// Kanal sahibi / yayıncı
    pub owner: bool,
    /// YouTube kanal üyesi
    pub member: bool,
    pub vip: bool,
    /// Ham rozet adları (ör. "subscriber", "moderator", "verified")
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub badges: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    pub user: String,
    pub text: String,
}

/// Uyarı ayrıntıları (abonelik, raid, bağış…)
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AlertInfo {
    /// subscriber | resubscriber | member | follower | tip | cheer | raid | host | redemption |
    /// subgift | submysterygift | announcement | gift … (platforma göre)
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub months: Option<u32>,
    pub gifted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMsg {
    /// Benzersiz: `<platform>:<nativeId>`
    pub id: String,
    pub native_id: String,
    pub platform: Platform,
    /// Kaynak (kanal) anahtarı, ör. "twitch:erkinazcan" (Streamlabs: "streamlabs")
    pub channel: String,
    /// Kanalın görünen adı (etiket)
    pub channel_name: String,
    /// Kullanıcı adının önüne `[kanal]` etiketi yazılsın mı
    pub show_tag: bool,
    pub kind: Kind,
    pub author: Author,
    pub parts: Vec<Part>,
    /// Düz metin (emote adları dahil)
    pub text: String,
    /// Unix ms
    pub ts: u64,
    /// Super Chat / bağış / bits tutarı (biçimlenmiş, ör. "₺50,00", "100 bits")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Reply>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alert: Option<AlertInfo>,
    /// Platformun kendi olay metni (Twitch system-msg, YouTube üyelik başlığı…)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headline: Option<String>,
    /// /me mesajı
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub action: bool,
    /// Silindi (platform moderasyonu, yasak ya da elle gizleme)
    pub deleted: bool,
    /// Kelime filtresi yıldızladı
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub masked: bool,
    /// Bu mesaj ankette oy olarak sayıldıysa şık numarası (1..9)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote: Option<u8>,
}

impl ChatMsg {
    pub fn new(platform: Platform, native_id: impl Into<String>, kind: Kind, author: Author, parts: Vec<Part>) -> ChatMsg {
        let native_id = native_id.into();
        let text = plain_text(&parts);
        ChatMsg {
            id: format!("{}:{}", platform.as_str(), native_id),
            native_id,
            platform,
            channel: String::new(),
            channel_name: String::new(),
            show_tag: false,
            kind,
            author,
            parts,
            text,
            ts: now_ms(),
            amount: None,
            reply_to: None,
            alert: None,
            headline: None,
            action: false,
            deleted: false,
            masked: false,
            vote: None,
        }
    }

    /// Parçalar değişince düz metni yeniden üret
    pub fn refresh_text(&mut self) {
        self.text = plain_text(&self.parts);
    }
}

/// Parçaların düz metni (emote: adı, bağlantı: görünen metni)
pub fn plain_text(parts: &[Part]) -> String {
    let mut s = String::new();
    for p in parts {
        match p {
            Part::Text { v } => s.push_str(v),
            Part::Emote { name, .. } => s.push_str(name),
            Part::Link { v, .. } => s.push_str(v),
            Part::Mention { v } => {
                s.push('@');
                s.push_str(v);
            }
        }
    }
    s.trim().to_string()
}

/// Yan yana metin parçalarını birleştirir, boşları atar
pub fn merge_text(parts: Vec<Part>) -> Vec<Part> {
    let mut out: Vec<Part> = Vec::with_capacity(parts.len());
    for p in parts {
        if let Part::Text { v } = &p {
            if v.is_empty() {
                continue;
            }
            if let Some(Part::Text { v: last }) = out.last_mut() {
                last.push_str(v);
                continue;
            }
        }
        out.push(p);
    }
    out
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn now_s() -> f64 {
    now_ms() as f64 / 1000.0
}

/// Kanal bağlantı durumu
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum State {
    /// Sohbet çalışmıyor
    #[default]
    Idle,
    Connecting,
    /// Yayın canlı
    Live,
    /// Kanal bulundu / sohbete bağlı ama yayın yok (YouTube: yayın bekleniyor)
    Offline,
    /// Son deneme başarısız, tekrar denenecek
    Error,
    /// Ücretsiz sürümde sadece listedeki ilk kanal bağlanır
    Locked,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStatus {
    pub key: String,
    pub platform: Option<Platform>,
    pub url: String,
    /// Görünen ad (kullanıcının verdiği ad > platformdan öğrenilen ad > linkten çıkan ad)
    pub label: String,
    pub state: State,
    /// Sohbet bağlantısı açık
    pub chat: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub viewers: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub hidden: bool,
    pub mine: bool,
    /// Etiket görünürlüğü: null = otomatik (aynı platformdan birden fazla kanal varsa)
    pub tag: Option<bool>,
    /// YouTube: şu an bağlı olunan yayının video kimliği
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_id: Option<String>,
}
