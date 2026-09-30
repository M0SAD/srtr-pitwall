//! MQTT: dahili sunucu (broker) ve istemci.
//!
//! - Sunucu: takım arkadaşlarının ve başka araçların (ör. kendi yazdığın dashboard, Home
//!   Assistant, SimHub) bağlanabileceği hafif bir MQTT sunucusu.
//! - İstemci: seçilen veri konularını `<önek>/<konu>` başlıklarına JSON olarak yayınlar.
//! - Takım yakıt paylaşımı: sürüş yapan sürücünün yakıt verisi `<önek>/team/<takım>/fuel/<sürücü>`
//!   başlığına (retained) gönderilir; takımdaki herkes (izleyici/mühendis dahil) görür.

use crate::engine::{Shared, Sink, TopicReq};
use parking_lot::Mutex;
use rumqttc::{Client, Event, MqttOptions, Packet as MqttPacket, QoS};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ServerCfg {
    pub enabled: bool,
    pub port: u16,
}

impl Default for ServerCfg {
    fn default() -> Self {
        ServerCfg { enabled: false, port: 1883 }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ClientCfg {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub pass: String,
    pub prefix: String,
    /// Takım adı (boşsa yakıt paylaşımı kapalı)
    pub team: String,
    /// Yayınlanacak veri konuları
    pub publish: Vec<String>,
    pub hz: f32,
}

impl Default for ClientCfg {
    fn default() -> Self {
        ClientCfg {
            enabled: false,
            host: "127.0.0.1".into(),
            port: 1883,
            user: String::new(),
            pass: String::new(),
            prefix: "pitwall".into(),
            team: String::new(),
            publish: vec![],
            hz: 2.0,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct MqttCfg {
    pub server: ServerCfg,
    pub client: ClientCfg,
}

/// Takım yakıt mesajı
#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TeamFuel {
    pub sender: String,
    pub car: String,
    pub number: String,
    pub level: f32,
    pub pct: f32,
    pub max: f32,
    pub usage: f32,
    pub laps_left: f32,
    pub refuel: f32,
    pub lap: i32,
    pub on_pit: bool,
    /// Gönderim zamanı (unix ms)
    pub ts: u64,
    /// Pistteki konum (tur yüzdesi 0..1)
    pub lap_pct: f32,
    /// Sıralama
    pub position: i32,
    /// En iyi ve son tur (sn, 0: yok)
    pub best: f32,
    pub last: f32,
    /// Son turlar (en yeni sonda)
    pub laps: Vec<TeamLap>,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TeamLap {
    pub lap: i32,
    pub time: f32,
    pub valid: bool,
    pub pit: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TeamMember {
    #[serde(flatten)]
    pub fuel: TeamFuel,
    /// Son veriden bu yana geçen süre (sn)
    pub age: f32,
    pub me: bool,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub enabled: bool,
    pub connected: bool,
    pub team: String,
    pub members: Vec<TeamMember>,
}

/// Motorun takım verisi göndermesi için bağlantı
pub struct Link {
    pub client: Client,
    pub prefix: String,
    pub team: String,
}

#[derive(Default)]
pub struct MqttShared {
    pub link: Mutex<Option<Link>>,
    pub connected: AtomicBool,
    pub error: Mutex<Option<String>>,
    pub team: Mutex<HashMap<String, TeamFuel>>,
    /// Kendi gönderen anahtarımız (takım listesinde "sen" işareti için)
    pub me: Mutex<String>,
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Başlıkta kullanılabilir anahtar (MQTT joker karakterleri ve boşluk olmadan)
pub fn topic_key(s: &str) -> String {
    let k: String = s
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if k.is_empty() {
        "anon".into()
    } else {
        k
    }
}

impl MqttShared {
    pub fn team_packet(&self) -> Team {
        let link = self.link.lock();
        let team = link.as_ref().map(|l| l.team.clone()).unwrap_or_default();
        let enabled = link.is_some() && !team.is_empty();
        drop(link);
        let me = self.me.lock().clone();
        let now = now_ms();
        let mut members: Vec<TeamMember> = self
            .team
            .lock()
            .iter()
            .map(|(k, v)| TeamMember {
                fuel: v.clone(),
                age: (now.saturating_sub(v.ts) as f32 / 1000.0).max(0.0),
                me: *k == me,
            })
            .collect();
        members.sort_by(|a, b| a.age.partial_cmp(&b.age).unwrap_or(std::cmp::Ordering::Equal));
        // Arkadaş listesinden gelen veri varsa takım bölümü kod olmadan da görünür
        let enabled = enabled || !members.is_empty();
        Team { enabled, connected: self.connected.load(Ordering::Relaxed), team, members }
    }

    /// Takım yakıtını yayınla (motor iş parçacığından, ~2 sn'de bir)
    pub fn publish_team(&self, msg: &TeamFuel) {
        let link = self.link.lock();
        let Some(l) = link.as_ref() else { return };
        if l.team.is_empty() || !self.connected.load(Ordering::Relaxed) {
            return;
        }
        let key = topic_key(&msg.sender);
        *self.me.lock() = key.clone();
        let topic = format!("{}/team/{}/fuel/{}", l.prefix, topic_key(&l.team), key);
        if let Ok(payload) = serde_json::to_vec(msg) {
            let _ = l.client.try_publish(topic, QoS::AtMostOnce, true, payload);
        }
    }
}

// ---------------------------------------------------------------------------
// Sunucu
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct BrokerState {
    /// Çalışan sunucunun portu
    pub running: Mutex<Option<u16>>,
    pub error: Mutex<Option<String>>,
}

fn start_broker(port: u16) -> Result<(), String> {
    // Port kullanımdaysa rumqttd iş parçacığı içinde çöker; önce kendimiz deneyelim.
    let addr: std::net::SocketAddr = ([0, 0, 0, 0], port).into();
    std::net::TcpListener::bind(addr).map_err(|e| format!("Port {port} kullanılamıyor: {e}"))?;

    let mut v4 = HashMap::new();
    v4.insert(
        "1".to_string(),
        rumqttd::ServerSettings {
            name: "v4".into(),
            listen: addr,
            tls: None,
            next_connection_delay_ms: 1,
            connections: rumqttd::ConnectionSettings {
                connection_timeout_ms: 60_000,
                max_payload_size: 256 * 1024,
                max_inflight_count: 100,
                auth: None,
                external_auth: None,
                dynamic_filters: true,
            },
        },
    );
    let config = rumqttd::Config {
        id: 0,
        router: rumqttd::RouterConfig {
            max_connections: 64,
            max_outgoing_packet_count: 200,
            max_segment_size: 1024 * 1024,
            max_segment_count: 4,
            custom_segment: None,
            initialized_filters: None,
            shared_subscriptions_strategy: Default::default(),
        },
        v4: Some(v4),
        v5: None,
        ws: None,
        cluster: None,
        console: None,
        bridge: None,
        prometheus: None,
        metrics: None,
    };
    std::thread::Builder::new()
        .name("mqtt-broker".into())
        .spawn(move || {
            let mut broker = rumqttd::Broker::new(config);
            if let Err(e) = broker.start() {
                eprintln!("MQTT sunucusu durdu: {e}");
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// İstemci
// ---------------------------------------------------------------------------

pub struct ClientHandle {
    client: Client,
    stop: Arc<AtomicBool>,
    sub_id: Option<u64>,
}

fn start_client(shared: &Arc<Shared>, cfg: &ClientCfg) -> ClientHandle {
    let id = format!("pitwall-{:x}", now_ms() & 0xffff_ffff);
    let mut opts = MqttOptions::new(id, cfg.host.trim(), cfg.port);
    opts.set_keep_alive(Duration::from_secs(15));
    opts.set_max_packet_size(256 * 1024, 256 * 1024);
    if !cfg.user.is_empty() {
        opts.set_credentials(cfg.user.clone(), cfg.pass.clone());
    }
    let (client, mut connection) = Client::new(opts, 64);
    let prefix = cfg.prefix.trim().trim_end_matches('/').to_string();
    let prefix = if prefix.is_empty() { "pitwall".to_string() } else { prefix };
    let team = cfg.team.trim().to_string();

    let m = &shared.mqtt;
    m.connected.store(false, Ordering::Relaxed);
    *m.error.lock() = None;
    m.team.lock().clear();
    *m.link.lock() = Some(Link { client: client.clone(), prefix: prefix.clone(), team: team.clone() });

    let stop = Arc::new(AtomicBool::new(false));
    {
        let stop = stop.clone();
        let shared = shared.clone();
        let client = client.clone();
        let team_filter = if team.is_empty() { None } else { Some(format!("{}/team/{}/fuel/+", prefix, topic_key(&team))) };
        std::thread::Builder::new()
            .name("mqtt-client".into())
            .spawn(move || {
                let m = &shared.mqtt;
                for ev in connection.iter() {
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                    match ev {
                        Ok(Event::Incoming(MqttPacket::ConnAck(_))) => {
                            m.connected.store(true, Ordering::Relaxed);
                            *m.error.lock() = None;
                            if let Some(f) = &team_filter {
                                let _ = client.try_subscribe(f.clone(), QoS::AtMostOnce);
                            }
                        }
                        Ok(Event::Incoming(MqttPacket::Publish(p))) => {
                            if let Ok(tf) = serde_json::from_slice::<TeamFuel>(&p.payload) {
                                let key = p.topic.rsplit('/').next().unwrap_or("").to_string();
                                m.team.lock().insert(key, tf);
                            }
                        }
                        Ok(_) => {}
                        Err(e) => {
                            m.connected.store(false, Ordering::Relaxed);
                            *m.error.lock() = Some(e.to_string());
                            if stop.load(Ordering::Relaxed) {
                                break;
                            }
                            std::thread::sleep(Duration::from_secs(2));
                        }
                    }
                }
            })
            .ok();
    }

    // Seçilen veri konularını yayınlayan abone
    let topics: Vec<TopicReq> = cfg
        .publish
        .iter()
        .map(|n| TopicReq { name: n.clone(), hz: cfg.hz.clamp(0.2, 20.0) })
        .collect();
    let sub_id = if topics.is_empty() {
        None
    } else {
        Some(shared.subscribe(Sink::Mqtt { client: client.clone(), prefix }, &topics))
    };

    ClientHandle { client, stop, sub_id }
}

impl ClientHandle {
    fn stop(self, shared: &Shared) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(id) = self.sub_id {
            shared.unsubscribe(id);
        }
        *shared.mqtt.link.lock() = None;
        shared.mqtt.connected.store(false, Ordering::Relaxed);
        shared.mqtt.team.lock().clear();
        let _ = self.client.disconnect();
    }
}

// ---------------------------------------------------------------------------
// Ayarlardan uygulama
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct MqttState {
    pub broker: BrokerState,
    client: Mutex<Option<ClientHandle>>,
    applied: Mutex<Option<MqttCfg>>,
    busy: Mutex<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttStatus {
    pub server_running: Option<u16>,
    pub server_error: Option<String>,
    /// Sunucuyu kapatmak/port değiştirmek için uygulamanın yeniden başlatılması gerekir
    pub server_restart: bool,
    pub client_enabled: bool,
    pub client_connected: bool,
    pub client_error: Option<String>,
    pub team_members: usize,
}

pub fn cfg_from_settings(v: Option<&Value>) -> MqttCfg {
    v.and_then(|v| v.get("general"))
        .and_then(|g| g.get("mqtt"))
        .and_then(|m| serde_json::from_value(m.clone()).ok())
        .unwrap_or_default()
}

/// Ayarlar değiştiyse sunucuyu/istemciyi yeniden kur.
pub fn apply(state: &MqttState, shared: &Arc<Shared>, cfg: MqttCfg) {
    let _busy = state.busy.lock();
    let mut applied = state.applied.lock();
    if applied.as_ref() == Some(&cfg) {
        return;
    }
    let client_changed = applied.as_ref().map(|a| a.client != cfg.client).unwrap_or(true);
    *applied = Some(cfg.clone());
    drop(applied);

    if cfg.server.enabled && state.broker.running.lock().is_none() {
        match start_broker(cfg.server.port) {
            Ok(()) => {
                *state.broker.running.lock() = Some(cfg.server.port);
                *state.broker.error.lock() = None;
            }
            Err(e) => *state.broker.error.lock() = Some(e),
        }
    }

    if client_changed {
        if let Some(old) = state.client.lock().take() {
            old.stop(shared);
        }
        if cfg.client.enabled && !cfg.client.host.trim().is_empty() {
            // Sunucu aynı anda başlatıldıysa dinlemeye başlaması için kısa bekleme
            let wait_broker = cfg.server.enabled;
            let h = {
                if wait_broker {
                    let t = Instant::now();
                    while t.elapsed() < Duration::from_millis(300) {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                }
                start_client(shared, &cfg.client)
            };
            *state.client.lock() = Some(h);
        }
    }
}

pub fn status(state: &MqttState, shared: &Shared) -> MqttStatus {
    let applied = state.applied.lock().clone().unwrap_or_default();
    let running = *state.broker.running.lock();
    MqttStatus {
        server_running: running,
        server_error: state.broker.error.lock().clone(),
        server_restart: match running {
            Some(p) => !applied.server.enabled || applied.server.port != p,
            None => false,
        },
        client_enabled: state.client.lock().is_some(),
        client_connected: shared.mqtt.connected.load(Ordering::Relaxed),
        client_error: shared.mqtt.error.lock().clone(),
        team_members: shared.mqtt.team.lock().len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys() {
        assert_eq!(topic_key("Arda Yılmaz"), "Arda_Yılmaz");
        assert_eq!(topic_key("a/b+#"), "a_b__");
        assert_eq!(topic_key(""), "anon");
    }

    #[test]
    fn cfg_parse() {
        let v: Value = serde_json::json!({"general": {"mqtt": {"server": {"enabled": true}, "client": {"team": "x"}}}});
        let c = cfg_from_settings(Some(&v));
        assert!(c.server.enabled);
        assert_eq!(c.server.port, 1883);
        assert_eq!(c.client.team, "x");
        assert_eq!(c.client.prefix, "pitwall");
    }
}
