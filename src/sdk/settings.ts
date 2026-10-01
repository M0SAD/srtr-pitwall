import { detectLang, lang, setLang } from "./i18n";
import { setRemoteSource } from "./telemetry";
import { formatPrefs } from "./format";
// Ayar deposu. Hem kontrol paneli hem overlay penceresi kullanır.
// Bir pencere değiştirince Rust bunu "settings-changed" olayıyla diğer pencereye
// anında iletir ve settings.json dosyasına arka planda yazar.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./platform";
import { onRemoteSettings } from "./telemetry";
import type { Status } from "./types";
import { manifests } from "./registry";
import { defaultOptions, type Units } from "./overlay";
import { DEFAULT_THEME, normalizeTheme, type Theme } from "./theme";

export interface OverlayInstance {
  /** Overlay türü (manifest kimliği). Aynı türden birden fazla kopya olabilir. */
  type: string;
  /** Kopyalar için kullanıcının verdiği ad (boş: overlay adı) */
  name: string;
  /** Hangi monitörde (monitör adı, boş: ana overlay monitörü) */
  monitor: string;
  enabled: boolean;
  /** Garajdayken gizle */
  hideInGarage: boolean;
  /** Pistte sürerken gizle (ör. sadece izlerken göster) */
  hideOnTrack: boolean;
  /** iRacing kapalıyken de göster (ör. web sayfası, Twitch sohbeti) */
  alwaysShow: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  options: Record<string, any>;
}

/** Düzenin ne zaman kullanılacağı */
export type ProfileMode = "driving" | "spotting" | "stream";
export type SessionKind = "practice" | "qualify" | "race";

export interface ProfileRules {
  /** driving: pistte sürerken; spotting: izlerken/garajda; stream: OBS tarayıcı kaynağı */
  mode: ProfileMode;
  /** Boşsa tüm araçlar. Araç adı, sınıf adı ya da araç yolu (ör. "GT3", "Porsche 963") içerir. */
  cars: string[];
  /** Boşsa tüm oturumlar */
  sessions: SessionKind[];
}

export interface Profile {
  id: string;
  name: string;
  overlays: Record<string, OverlayInstance>;
  rules: ProfileRules;
  /** Yayın düzenlerinde tuval boyutu (OBS tarayıcı kaynağı) */
  canvas?: { w: number; h: number };
}

export interface ServerSettings {
  enabled: boolean;
  port: number;
  /** Yerel ağdaki diğer cihazlara açık (pitwall ekranı için) */
  lan: boolean;
}

export interface MqttSettings {
  /** Dahili MQTT sunucusu */
  server: { enabled: boolean; port: number };
  client: {
    enabled: boolean;
    host: string;
    port: number;
    user: string;
    pass: string;
    prefix: string;
    /** Takım adı: aynı takım adını yazan herkes yakıt verisini paylaşır */
    team: string;
    /** MQTT'ye yayınlanacak veri konuları */
    publish: string[];
    hz: number;
  };
}

export function defaultMqtt(): MqttSettings {
  return {
    server: { enabled: false, port: 1883 },
    client: { enabled: false, host: "127.0.0.1", port: 1883, user: "", pass: "", prefix: "pitwall", team: "", publish: [], hz: 2 },
  };
}

export interface LeagueTier {
  id: string;
  name: string;
  color: string;
}

export interface LeagueConfig {
  id: string;
  name: string;
  /** iRacing lig kimliği; 0 = her oturumda uygula */
  leagueId: number;
  tiers: LeagueTier[];
  /** iRacing sınıf adı -> kategori */
  classDefaults: Record<string, string>;
  /** Araç numarası -> kategori */
  assignments: Record<string, string>;
}

export interface LeagueSettings {
  /** Etkin yapılandırma kimliği ("" = kapalı) */
  active: string;
  configs: LeagueConfig[];
}

export interface Friend {
  id: string;
  /** iRacing'deki tam ad */
  name: string;
  /** iRacing üye numarası (CustID), bilinmiyorsa 0 */
  userId: number;
  /** Boş: varsayılan arkadaş rengi */
  color: string;
  /** Haritada gösterilecek kısa simge (emoji ya da 1-2 harf) */
  icon: string;
  /** Haritada gösterilecek küçük fotoğraf (data URL) */
  photo: string;
  note: string;
  /** Sürücü etiketi (ör. "Takım", "Dikkat"); listede adın yanında görünür */
  tag?: string;
  /** Hesap arkadaşıysa: hesabın kimliği (arkadaşlık kabul edilince otomatik eklenir) */
  accountId?: string;
  /** Ad hesaptan otomatik geliyor (elle değiştirilince kapanır) */
  autoName?: boolean;
}

export interface FriendsSettings {
  enabled: boolean;
  /** Varsayılan vurgu rengi */
  color: string;
  /** Satır arka planı yoğunluğu (%) */
  strength: number;
  where: { relative: boolean; standings: boolean; timing: boolean; map: boolean };
  list: Friend[];
}

export function defaultFriends(): FriendsSettings {
  return {
    enabled: true,
    color: "#2ec4b6",
    strength: 28,
    where: { relative: true, standings: true, timing: true, map: true },
    list: [],
  };
}

/** Canlı Sohbet kanalı (sıra önemli: ücretsiz sürümde sadece ilk kanal bağlanır). Rust: livechat/mod.rs ChannelIn */
export interface LiveChannel {
  /** YouTube (@handle, /channel/UC…, /watch?v=…), Twitch ya da Kick linki; platform otomatik tanınır */
  url: string;
  /** Göz kapalı: mesajları gösterilmez, ankette oy sayılmaz (bağlantı ve izleyici sayısı sürer) */
  hidden?: boolean;
  /** Kullanıcı adının önünde [kanal] etiketi: null/yok = otomatik (aynı platformdan birden fazla kanal varsa) */
  tag?: boolean | null;
  /** "Benim kanalım" (platform başına bir tane; izleyici çubuğu bunu gösterir) */
  mine?: boolean;
  /** Elle verilen ad (boş: platformdan öğrenilen ad) */
  name?: string;
}

/** Canlı Sohbet ayarları (`general.livechat`). Rust tarafı aynı alanları okur (livechat/mod.rs cfg_from_settings).
 *  Gizli bilgiler (Streamlabs Socket API Token) burada DEĞİL, Rust'taki ayrı dosyada. */
export interface LiveChatSettings {
  /** Uygulama açılınca sohbete otomatik bağlan */
  autoStart: boolean;
  channels: LiveChannel[];
  /** Varsayılan kanallar bir kez eklendi (kullanıcı silerse geri gelmez) */
  seeded: boolean;
  /** YouTube sohbet yoklama aralığı (sn, 1..10) */
  ytInterval: number;
  /** YouTube web istemcisi sürümü (boş: otomatik). YouTube değişirse elle güncellemek için. */
  ytClientVersion: string;
  moderation: {
    /** Engellenen kullanıcı adları (küçük harf, @ olmadan) */
    banned: string[];
    wordFilter: boolean;
    /** Virgülle ayrılmış kelimeler; "kelime*" o kelimeyle başlayanlar */
    words: string;
    /** mask: k*** şeklinde yıldızla, hide: mesajı gizle */
    wordMode: "mask" | "hide";
    blockLinks: boolean;
    /** Aynı kullanıcının aynı mesajını spamWindow saniye içinde tekrar gösterme */
    spam: boolean;
    spamWindow: number;
    /** Platformdaki silme/yasakları yansıt */
    mirrorDeletes: boolean;
  };
  poll: {
    /** Hızlı anket şık sayısı (2..9) */
    options: number;
    /** Süre (sn; 0 = süresiz, elle bitirilir) */
    duration: number;
    /** Sonucun ekranda kalma süresi (sn) */
    resultDuration: number;
    /** Oy mesajlarını sohbette gösterme */
    hideVotes: boolean;
  };
  /** Günlük sohbet kaydı: <app_data>/livechat/logs/YYYY-MM-DD.txt */
  log: boolean;
  /** Kayıtların saklanma süresi (gün; 0: süresiz). Eski dosyalar kendiliğinden silinir (Rust: livechat/chatlog.rs) */
  logDays: number;
  /** Streamlabs uyarıları (anahtar ayrıca kaydedilir) */
  streamlabs: boolean;
  /** Altyazı: aynı kaynaktan bu kadar saniye içinde gelen cümleler birleştirilir */
  captions: { secs: number };
  /** Sohbeti sesli okuma (PRO: livechat.tts; Windows sesleri). Rust: livechat/tts.rs */
  tts: LiveChatTts;
  /** Konuşmayı yazıya çevirme / altyazı (PRO: livechat.stt; Windows konuşma tanıma, mikrofon). Rust: livechat/stt.rs */
  stt: LiveChatStt;
  /** Sohbete yaz kutusunun hedefi: "mine" (★ kanallarım) ya da kanal anahtarı */
  sendTarget: string;
}

export interface LiveChatTts {
  enabled: boolean;
  /** all: her mesaj, command: sadece komutla başlayanlar (!oku …), alerts: sadece bağış/abone/raid uyarıları */
  mode: "all" | "command" | "alerts";
  /** Virgülle ayrılmış okuma komutları */
  command: string;
  /** Sadece aboneler / kanal üyeleri (+ listedekiler) */
  subsOnly: boolean;
  /** Sadece bu kullanıcılar (virgülle; boş: herkes) */
  onlyUsers: string;
  /** "Ali diyor ki: …" */
  readNames: boolean;
  /** Bağış / abone / raid uyarıları her modda okunsun */
  readAlerts: boolean;
  platforms: { youtube: boolean; twitch: boolean; kick: boolean };
  skipLinks: boolean;
  skipEmotes: boolean;
  maxChars: number;
  maxQueue: number;
  /** Bu kadar saniyeden eski mesaj okunmaz */
  maxDelay: number;
  /** Windows ses kimliği (boş: varsayılan) */
  voice: string;
  /** Çıkış cihazı adı (boş: Windows varsayılanı) */
  device: string;
  /** -10..10 */
  rate: number;
  /** -10..10 */
  pitch: number;
  /** 0..100 */
  volume: number;
}

export interface LiveChatStt {
  enabled: boolean;
  /** Tanıma dili (ör. "tr-TR"; boş: Windows konuşma dili) */
  language: string;
  /** Küfürleri yıldızla (ilk harf kalır) */
  profanity: boolean;
  /** Ek kelimeler (virgülle; "kelime*" önek) */
  profanityWords: string;
  /** Sesli okuma konuşurken duyulanları yazma */
  pauseWhileTts: boolean;
  /** Altyazının önündeki ad (boş: yok) */
  label: string;
}

export function defaultLiveChat(): LiveChatSettings {
  return {
    autoStart: false,
    channels: [],
    seeded: false,
    ytInterval: 2,
    ytClientVersion: "",
    moderation: { banned: [], wordFilter: false, words: "", wordMode: "mask", blockLinks: false, spam: true, spamWindow: 10, mirrorDeletes: true },
    poll: { options: 2, duration: 60, resultDuration: 15, hideVotes: false },
    log: false,
    logDays: 30,
    streamlabs: false,
    captions: { secs: 8 },
    tts: {
      enabled: false,
      mode: "all",
      command: "!oku",
      subsOnly: false,
      onlyUsers: "",
      readNames: true,
      readAlerts: true,
      platforms: { youtube: true, twitch: true, kick: true },
      skipLinks: true,
      skipEmotes: true,
      maxChars: 150,
      maxQueue: 3,
      maxDelay: 8,
      voice: "",
      device: "",
      rate: 0,
      pitch: 0,
      volume: 80,
    },
    stt: { enabled: false, language: "", profanity: false, profanityWords: "", pauseWhileTts: true, label: "" },
    sendTarget: "mine",
  };
}

/** Kayıtlı ayarı tamamlar. Eski "Twitch Sohbeti" kanal adı ilk kez Canlı Sohbet listesine taşınır. */
function normalizeLiveChat(v: Partial<LiveChatSettings> | undefined, twitchChannel: string | undefined): LiveChatSettings {
  const d = defaultLiveChat();
  if (!v || typeof v !== "object") {
    const ch = (twitchChannel ?? "").trim().replace(/^#/, "");
    if (ch) d.channels = [{ url: `https://www.twitch.tv/${ch}` }];
    return seedLiveChannels(d);
  }
  const banned = (v.moderation as any)?.banned;
  return seedLiveChannels({
    ...d,
    ...v,
    channels: Array.isArray(v.channels) ? v.channels.filter((c) => c && typeof c.url === "string") : [],
    moderation: {
      ...d.moderation,
      ...(v.moderation ?? {}),
      banned: Array.isArray(banned) ? banned.filter((x) => typeof x === "string") : typeof banned === "string" ? banned.split(",").map((x: string) => x.trim()).filter(Boolean) : [],
    },
    poll: { ...d.poll, ...(v.poll ?? {}) },
    captions: { ...d.captions, ...(v.captions ?? {}) },
    tts: { ...d.tts, ...(v.tts ?? {}), platforms: { ...d.tts.platforms, ...(v.tts?.platforms ?? {}) } },
    stt: { ...d.stt, ...(v.stt ?? {}) },
    sendTarget: typeof v.sendTarget === "string" && v.sendTarget ? v.sendTarget : "mine",
  });
}

/** İlk kullanımda (kanal listesi boşken) eklenen varsayılan kanallar, bu sırayla */
export const DEFAULT_LIVE_CHANNELS = ["https://www.youtube.com/@ErkinAzcan", "https://kick.com/erkinazcan", "https://www.twitch.tv/erkinazcan"];

/** Liste boşsa ve daha önce eklenmediyse varsayılan kanalları bir kez ekler (`seeded`; silinince geri gelmez) */
function seedLiveChannels(x: LiveChatSettings): LiveChatSettings {
  if (x.seeded === true) return x;
  if (!x.channels.length) x.channels = DEFAULT_LIVE_CHANNELS.map((url) => ({ url, hidden: false, tag: null, mine: false, name: "" }));
  x.seeded = true;
  return x;
}

export interface VoiceSettings {
  /** "Sesli mühendis açık": canlı oturum algılanınca kendiliğinden konuşur (PRO) */
  enabled: boolean;
  /** Kurulu ses paketi kimliği (<app_data>/voicepacks/<id>); boş: ilk kurulu paket */
  pack: string;
  /** Kendi sesini kaydedenler / test edenler için doğrudan bir klasör; doluysa paketin önüne geçer */
  customDir: string;
  volume: number;
  spotterVolume: number;
  /** Argo ifadeler (sweary_ kayıtları) */
  sweary: boolean;
  /** Virajda (direksiyon çevrili / sert frende) önemsiz mesajları beklet */
  quietInCorners: boolean;
  /** Ovallerde sol/sağ yerine iç/dış de */
  ovalInsideOutside: boolean;
  /** Hangi oturumlarda konuşsun */
  sessions: { race: boolean; qualify: boolean; practice: boolean };
  categories: Record<string, boolean>;
  /** Yeni ses sistemine geçiş yapıldı (bir kezlik: sesli mühendis varsayılan açık) */
  v2?: boolean;
}

export const VOICE_CATEGORIES: { id: string; name: string; desc: string }[] = [
  { id: "spotter", name: "Spotter", desc: "Solda/sağda araç, üç araç yan yana, temiz, hâlâ orada" },
  { id: "radio", name: "Telsiz kontrolü", desc: "Oturuma girince bir kez telsiz testi" },
  { id: "flags", name: "Bayraklar", desc: "Sarı, çift sarı, güvenlik aracı, yeşil, mavi, döküntü bayrağı" },
  { id: "race", name: "Yarış akışı", desc: "Grid bilgisi, start, kalan tur/süre, yarı mesafe, son tur, bitiş" },
  { id: "position", name: "Pozisyon", desc: "Start yorumu, sıra değişimi, geçişler, tur farkı, beklenen sıra" },
  { id: "laptimes", name: "Tur zamanları", desc: "Kişisel rekor, tur süresi, tempo, istikrar, en hızlıya fark" },
  { id: "sectors", name: "Sektör farkları", desc: "Antrenman/sıralamada hangi sektörde ne kadar kaybettin" },
  { id: "gaps", name: "Aralar", desc: "Öndeki/arkadaki ile ara, baskı, takılma, tur bindirme, sicil" },
  { id: "opponents", name: "Rakipler", desc: "Lider/öndeki/arkadaki pite giriyor, en hızlı tur, öndeki araç bilgisi" },
  { id: "fuel", name: "Yakıt", desc: "Yakıt durumu, kalan tur, pit penceresi, eklenecek yakıt" },
  { id: "pit", name: "Pit ve strateji", desc: "Pit limiti, pit hızı, şimdi pite gir, pit kaybı ve çıkış sırası" },
  { id: "tyres", name: "Lastikler", desc: "Soğuk/sıcak lastik, aşınma, kamber yorumu (veri varsa)" },
  { id: "engine", name: "Motor", desc: "Su/yağ sıcaklığı, yağ/yakıt basıncı, motor stop" },
  { id: "damage", name: "Kaza", desc: "Sert kazadan sonra \"iyi misin?\"" },
  { id: "penalties", name: "Cezalar", desc: "Siyah bayrak, hasar bayrağı, pist sınırı, ters yön" },
  { id: "incidents", name: "Olay puanı", desc: "iRacing olay puanı ve sınırı" },
  { id: "conditions", name: "Hava ve pist", desc: "Yağmur başladı/durdu, hava ve pist sıcaklığı" },
  { id: "multiclass", name: "Çok sınıf", desc: "Arkadan hızlı sınıf, önde yavaş sınıf, yanındaki aracın sınıfı" },
  { id: "push", name: "Bas!", desc: "Son turlarda bas, pit çıkışı temiz/trafik, rakip pitten çıkıyor" },
  { id: "rejoin", name: "Piste dönüş", desc: "Pist dışındayken \"bekle, araç geliyor\" / \"yol açık\"" },
  { id: "pearls", name: "Öğütler", desc: "Ara sıra moral cümleleri (argo açıksa söylenmeler)" },
  { id: "acknowledge", name: "Ayar onayları", desc: "Bu sayfada bir şeyi açıp kapatınca sesli onay" },
];

export interface SoundSettings {
  fasterClass: { enabled: boolean; volume: number; pitch: number; seconds: number; muteSpectating: boolean };
  alongside: { enabled: boolean; volume: number; pitch: number; muteSpectating: boolean };
}

export interface ScreenshotSettings {
  /** Görüntüye overlay'ler de girsin */
  includeOverlays: boolean;
  /** Kısayol sadece iRacing açıkken (oyundayken) çalışsın; oyun kapalıyken tuş Windows'a kalır */
  onlyInGame: boolean;
  format: "jpg" | "png";
  quality: number;
}

/** Veri kaynağı simülasyon: "auto" çalışanı bulur (önce iRacing) */
export type SimChoice = "auto" | "iracing" | "acc" | "ac" | "lmu" | "rf2" | "ams2";
export const SIM_CHOICES: SimChoice[] = ["auto", "iracing", "acc", "ac", "lmu", "rf2", "ams2"];

/** Sohbet balonları ve arka planı (Ayarlar → Sohbet) */
export interface ChatLook {
  /** Benim balonum ("" = tema rengi) */
  mine: string;
  /** Arkadaşın balonu ("" = varsayılan) */
  friend: string;
  shape: "rounded" | "square" | "pill";
  size: "s" | "m" | "l";
  /** Balon opaklığı (40–100) */
  opacity: number;
  bg: "none" | "solid" | "gradient" | "image";
  bgColor: string;
  gradient: string;
  /** Arka planı karart (0–80) ve bulanıklaştır (0–20 px) */
  dim: number;
  blur: number;
  /** Görsel dosyası var mı; rev değişince pencereler yeniden yükler */
  hasImg: boolean;
  imgRev: number;
}

export const DEFAULT_CHAT_LOOK: ChatLook = {
  mine: "",
  friend: "",
  shape: "rounded",
  size: "m",
  opacity: 100,
  bg: "none",
  bgColor: "#1b2230",
  gradient: "dusk",
  dim: 30,
  blur: 0,
  hasImg: false,
  imgRev: 0,
};

/** Tek bir arkadaş sohbetinin kendi arka planı (sadece bu kullanıcı; görsel ayar klasöründe "conv-<id>") */
export interface ConvBg {
  kind: "solid" | "gradient" | "image";
  /** Renk (#rrggbb) ya da degrade kimliği; görselde boş */
  value: string;
  /** Görsel değişince artar (pencereler yeniden yükler) */
  rev: number;
}

/** Uygulama arka planı (Ayarlar → Görünüm) */
export interface AppBg {
  kind: "none" | "gradient" | "image";
  gradient: string;
  /** Karartma (0–85) ve bulanıklık (0–30 px) */
  dim: number;
  blur: number;
  hasImg: boolean;
  imgRev: number;
  /** Görseli overlay panellerinin arkasında da göster */
  overlays: boolean;
  /** Overlay'lerdeki görünürlüğü (5–60) */
  overlayOpacity: number;
}

export const DEFAULT_APP_BG: AppBg = {
  kind: "none",
  gradient: "night",
  dim: 45,
  blur: 0,
  hasImg: false,
  imgRev: 0,
  overlays: false,
  overlayOpacity: 25,
};

/** Ayarlar → VR. Rust tarafı aynı alanları okur (src-tauri/src/vr.rs cfg_from_settings). */
export interface VrSettings {
  enabled: boolean;
  /** windows: her overlay ayrı pencere, board: tüm düzen tek pencere (VR panosu), both: ikisi de */
  source: "windows" | "board" | "both";
  /** VR arka planı: alfa kanalını alamayan araçlar için opak renk */
  background: "transparent" | "black" | "green" | "custom";
  /** background "custom" iken (#rrggbb) */
  color: string;
  /** desktop: seçilen monitörde, offscreen: masaüstünün dışında (görünmez alan) */
  place: "desktop" | "offscreen";
  /** VR pencerelerinin konacağı monitör (null: ana monitör) */
  monitor: number | null;
  /** Masaüstündeki normal overlay'i gizle (VR'da ayna penceresini kapatmasın) */
  hideDesktop: boolean;
  /** Yerel VR (SteamVR overlay'i, deneysel) */
  native: VrNativeSettings;
}

/** Yerel VR'da bir overlay'in gözlükteki yeri (Rust: vrnative/place.rs Placement) */
export interface VrPlacement {
  /** Metre: x sağ, y yukarı, z öne uzaklık */
  x: number;
  y: number;
  z: number;
  /** Derece */
  yaw: number;
  pitch: number;
  /** Genişlik (metre) */
  widthM: number;
  /** Eğrilik 0..1 */
  curve: number;
  /** Opaklık 0.1..1 */
  alpha: number;
  /** Hep kullanıcıya dönük, sabit uzaklıkta */
  faceMe: boolean;
  /** Sadece bakınca görünür */
  gaze: boolean;
}

/** Ayarlar → VR → Yerel VR (SteamVR, deneysel). Rust: src-tauri/src/vrnative/mod.rs cfg_from_settings */
export interface VrNativeSettings {
  /** Sim bağlanınca kendiliğinden başlat (SteamVR çalışıyorsa) */
  autoStart: boolean;
  /** Yerel VR çalışırken masaüstü overlay'i de görünsün */
  showDesktop: boolean;
  /** Overlay'leri 180° çevir */
  invert: boolean;
  fps: 10 | 15 | 30;
  /** key: arka plan rengi saydam yapılır, opaque: arka plan opak kalır */
  transparency: "key" | "opaque";
  origin: "seated" | "standing";
  /** VR günlüğü dosyaya da yazılsın */
  debug: boolean;
  /** En az bir kez başlatıldı (arka planda çizim ayarı açılışta uygulanır) */
  used: boolean;
  /** "Ortala" ile belirlenen başlangıç noktası (Rust yazar) */
  base: { x: number; y: number; z: number; yaw: number } | null;
  /** Kopya kimliği → yerleşim */
  overlays: Record<string, VrPlacement>;
}

export const DEFAULT_VR_NATIVE: VrNativeSettings = {
  autoStart: false,
  showDesktop: false,
  invert: false,
  fps: 15,
  transparency: "key",
  origin: "seated",
  debug: false,
  used: false,
  base: null,
  overlays: {},
};

export const DEFAULT_VR: VrSettings = {
  enabled: false,
  source: "windows",
  background: "black",
  color: "#00ff00",
  place: "desktop",
  monitor: null,
  hideDesktop: false,
  native: { ...DEFAULT_VR_NATIVE },
};

export interface GeneralSettings {
  demo: boolean;
  /** Hangi simden veri okunacağı (Rust tarafı `general.sim` okur) */
  sim: SimChoice;
  monitor: number | null;
  units: Units;
  hideWhenOffTrack: boolean;
  /** Düzenleme ekranı: ızgaraya yapıştır */
  snapToGrid: boolean;
  /** Düzenleme ekranı: diğer overlay'lerin ve ekranın kenarlarına yapıştır */
  snapToEdges: boolean;
  gridSize: number;
  /** Araca/oturuma göre düzeni otomatik seç */
  autoSwitch: boolean;
  server: ServerSettings;
  mqtt: MqttSettings;
  /** Genel kısayollar (boş: kısayol yok) */
  shortcuts: {
    edit: string;
    hide: string;
    panel: string;
    shot: string;
    voice: string;
    poll: string;
    tts: string;
    ttsHush: string;
    stt: string;
    chat: string;
    vrConfig: string;
    vrRecenter: string;
    vrNext: string;
    vrMode: string;
    vrSave: string;
    vrReset: string;
    vrFace: string;
    vrGaze: string;
  };
  /** Eski varsayılan ekran görüntüsü kısayolu (PrintScreen) bir kez Ctrl+PrintScreen'e taşındı */
  shotKeyV2?: boolean;
  /** Eski varsayılanlar (PrintScreen / Ctrl+PrintScreen) bir kez F12'ye taşındı */
  shotKeyV3?: boolean;
  /** Tekrar (replay) izlerken overlay'leri gizle */
  hideInReplay: boolean;
  /** Sohbet görünümü (sadece bu kullanıcı görür; arka plan görseli ayar klasöründe dosya) */
  chatLook: ChatLook;
  /** Sohbete özel arka planlar (arkadaş hesap kimliği → arka plan) */
  convBg: Record<string, ConvBg>;
  /** Uygulama (panel) arka planı; istenirse overlay'lerde de */
  appBg: AppBg;
  /** Arkadaş listesi: rahatsız etme, mesaj kabulü, mesaj sesi */
  social: { dnd: boolean; acceptMessages: boolean; sound: boolean };
  /** Demo açıkken sesli spotter ve bipler sussun */
  demoMute: boolean;
  /** Aynı overlay'den birden fazla eklenebilsin */
  allowDuplicates: boolean;
  /** Ekran görüntüleri */
  screenshots: ScreenshotSettings;
  /** Düzenleme ekranının arka plan görseli (dosya ayar klasöründe; rev değişince yeniden yüklenir) */
  editBackdrop: { enabled: boolean; opacity: number; rev: number; has: boolean };
  minimizeOnConnect: boolean;
  /** Yarış bitince Olaylar penceresini otomatik aç (Rust `general.eventsAutoOpen` okur) */
  eventsAutoOpen: boolean;
  /** Telemetri: canlı oturumda tamamlanan turları kaydet ve hesaba yükle (Rust `general.telemetryRecord` okur) */
  telemetryRecord: boolean;
  returnFocus: boolean;
  timeFormat: "24" | "12";
  /** Arayüz dili (ör. "tr", "en", "pt-BR") */
  language: string;
  speedMph: boolean;
  /** Panelleri opak çiz */
  opaque: boolean;
  perf: { telemetryHz: number; inputHz: number; reduceEffects: boolean };
  display: { disableGpu: boolean; disableGpuCompositing: boolean };
  /** VR modu: overlay'leri VR pencere yakalama araçları için ayrı pencerelerde de aç (Rust: vr.rs) */
  vr: VrSettings;
  twitch: { channel: string };
  /** Canlı Sohbet (YouTube / Twitch / Kick) */
  livechat: LiveChatSettings;
  remote: { enabled: boolean; host: string; port: number };
  engineer: { screens: string[]; cycleSec: number };
  /** hiddenFriends: verisini takım listesinde görmek istemediğim (bana güvenen) arkadaşlar */
  sharing: { summaries: boolean; keepSessions: number; hiddenFriends: string[] };
  voice: VoiceSettings;
  sounds: SoundSettings;
}

export interface SavedTheme {
  id: string;
  name: string;
  author: string;
  theme: Theme;
}

export interface AppSettings {
  version: 1;
  updatedAt: number;
  general: GeneralSettings;
  activeProfile: string;
  profiles: Record<string, Profile>;
  /** Tüm overlay'lerin ortak görünümü */
  theme: Theme;
  /** Topluluktan indirilen temalar (Görünüm'de hazır temaların yanında) */
  savedThemes: SavedTheme[];
  league: LeagueSettings;
  friends: FriendsSettings;
}

export function defaultInstance(id: string): OverlayInstance {
  const m = manifests.find((x) => x.id === id)!;
  return {
    type: id,
    name: "",
    monitor: "",
    enabled: m.defaultEnabled ?? false,
    hideInGarage: false,
    hideOnTrack: false,
    alwaysShow: m.defaultAlwaysShow ?? false,
    x: m.defaultPosition.x,
    y: m.defaultPosition.y,
    scale: 1,
    opacity: 1,
    options: LOGO_COL_TYPES.includes(m.id) ? { ...defaultOptions(m), logoColV1: true } : defaultOptions(m),
  };
}

/** Marka logosu sütunu olan overlay türleri */
const LOGO_COL_TYPES = ["relative", "standings"];

/**
 * Bir kerelik geçiş (logoColV1): kayıtlı Relative / Sıralama kopyalarında marka logosu sütunu açılır ve
 * sürücü adının hemen sağına taşınır. Kullanıcı sonradan kapatır ya da taşırsa tekrar dokunulmaz.
 */
function logoColMigrate(type: string, saved: Record<string, any> | undefined, options: Record<string, any>) {
  if (!LOGO_COL_TYPES.includes(type) || saved?.logoColV1) return options;
  const cols = Array.isArray(options.columns) ? (options.columns as { key: string; on: boolean }[]).filter((c) => c && c.key !== "car") : null;
  if (cols) {
    const at = cols.findIndex((c) => c.key === "name");
    cols.splice(at < 0 ? 0 : at + 1, 0, { key: "car", on: true });
    options.columns = cols;
  }
  if (options.carStyle === "text") options.carStyle = "logo";
  options.logoColV1 = true;
  return options;
}

export function newProfile(id: string, name: string): Profile {
  const overlays: Record<string, OverlayInstance> = {};
  for (const m of manifests) overlays[m.id] = defaultInstance(m.id);
  return { id, name, overlays, rules: defaultRules() };
}

export function defaultRules(): ProfileRules {
  return { mode: "driving", cars: [], sessions: [] };
}

export function defaultSettings(): AppSettings {
  return {
    version: 1,
    updatedAt: 0,
    general: {
      demo: false,
      sim: "auto",
      monitor: null,
      units: "metric",
      hideWhenOffTrack: false,
      snapToGrid: true,
      snapToEdges: true,
      gridSize: 20,
      autoSwitch: false,
      server: { enabled: false, port: 8910, lan: false },
      mqtt: defaultMqtt(),
      shortcuts: { edit: "Ctrl+Shift+E", hide: "Ctrl+Shift+D", panel: "Ctrl+Shift+Space", shot: "F12", voice: "Ctrl+Shift+V", poll: "F9", tts: "F5", ttsHush: "", stt: "F6", chat: "Ctrl+Shift+C", vrConfig: "F9", vrRecenter: "End", vrNext: "Space", vrMode: "M", vrSave: "F10", vrReset: "Home", vrFace: "F", vrGaze: "G" },
      shotKeyV2: true,
      shotKeyV3: true,
      hideInReplay: true,
      chatLook: { ...DEFAULT_CHAT_LOOK },
      convBg: {},
      appBg: { ...DEFAULT_APP_BG },
      allowDuplicates: false,
      demoMute: false,
      social: { dnd: false, acceptMessages: true, sound: true },
      screenshots: { includeOverlays: true, onlyInGame: true, format: "jpg", quality: 92 },
      editBackdrop: { enabled: true, opacity: 100, rev: 0, has: false },
      minimizeOnConnect: false,
      eventsAutoOpen: true,
      telemetryRecord: true,
      returnFocus: true,
      timeFormat: "24",
      language: detectLang(),
      speedMph: false,
      opaque: false,
      perf: { telemetryHz: 60, inputHz: 60, reduceEffects: false },
      display: { disableGpu: false, disableGpuCompositing: false },
      vr: { ...DEFAULT_VR },
      twitch: { channel: "" },
      livechat: defaultLiveChat(),
      remote: { enabled: false, host: "", port: 8910 },
      engineer: { screens: ["standings", "relative", "fuel", "battle", "laps", "weather", "session", "inputs"], cycleSec: 10 },
      sharing: { summaries: true, keepSessions: 200, hiddenFriends: [] },
      voice: {
        enabled: true,
        pack: "",
        customDir: "",
        volume: 80,
        spotterVolume: 100,
        sweary: false,
        quietInCorners: false,
        ovalInsideOutside: false,
        sessions: { race: true, qualify: true, practice: true },
        categories: Object.fromEntries(VOICE_CATEGORIES.map((c) => [c.id, true])),
        v2: true,
      },
      sounds: {
        fasterClass: { enabled: false, volume: 70, pitch: 700, seconds: 5, muteSpectating: true },
        alongside: { enabled: false, volume: 50, pitch: 400, muteSpectating: true },
      },
    },
    activeProfile: "default",
    profiles: { default: newProfile("default", "Varsayılan") },
    theme: { ...DEFAULT_THEME },
    savedThemes: [],
    league: { active: "", configs: [] },
    friends: defaultFriends(),
  };
}

/** Eski varsayılanlar "PrintScreen" / "Ctrl+PrintScreen" bir kez "F12" olur (kullanıcı sonra tekrar seçebilir) */
function shotKeyMigrate<T extends { shot: string }>(sc: T, done: boolean | undefined): T {
  if (!done && (sc.shot === "PrintScreen" || sc.shot === "Ctrl+PrintScreen")) sc.shot = "F12";
  return sc;
}

/** Yeni ses sistemi (Crew Chief'ten bağımsız): sesli mühendis bir kez varsayılan açık olur, eski alanlar atılır */
function voiceMigrate(v: VoiceSettings & { soundsDir?: string; spotter?: string }): VoiceSettings {
  if (!v.v2) {
    v.enabled = true;
    v.pack = "";
    v.v2 = true;
  }
  delete v.soundsDir;
  delete v.spotter;
  return v;
}

/** Eksik alanları tamamlar: yeni eklenen overlay'ler ve yeni ayar anahtarları otomatik gelir. */
export function normalize(input: unknown): AppSettings {
  const d = defaultSettings();
  if (!input || typeof input !== "object") return d;
  const s = input as Partial<AppSettings>;
  const out: AppSettings = {
    version: 1,
    updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0,
    general: {
      ...d.general,
      ...(s.general ?? {}),
      sim: SIM_CHOICES.includes(s.general?.sim as SimChoice) ? (s.general!.sim as SimChoice) : "auto",
      server: { ...d.general.server, ...(s.general?.server ?? {}) },
      shortcuts: shotKeyMigrate({ ...d.general.shortcuts, ...(s.general?.shortcuts ?? {}) }, s.general?.shotKeyV3),
      shotKeyV2: true,
      shotKeyV3: true,
      chatLook: { ...DEFAULT_CHAT_LOOK, ...(s.general?.chatLook ?? {}) },
      convBg: s.general?.convBg && typeof s.general.convBg === "object" ? s.general.convBg : {},
      appBg: { ...DEFAULT_APP_BG, ...(s.general?.appBg ?? {}) },
      screenshots: { ...d.general.screenshots, ...(s.general?.screenshots ?? {}) },
      editBackdrop: { ...d.general.editBackdrop, ...(s.general?.editBackdrop ?? {}) },
      social: { ...d.general.social, ...(s.general?.social ?? {}) },
      perf: { ...d.general.perf, ...(s.general?.perf ?? {}) },
      display: { ...d.general.display, ...(s.general?.display ?? {}) },
      vr: {
        ...DEFAULT_VR,
        ...(s.general?.vr ?? {}),
        native: {
          ...DEFAULT_VR_NATIVE,
          ...(s.general?.vr?.native ?? {}),
          overlays: s.general?.vr?.native?.overlays && typeof s.general.vr.native.overlays === "object" ? s.general.vr.native.overlays : {},
        },
      },
      twitch: { ...d.general.twitch, ...(s.general?.twitch ?? {}) },
      livechat: normalizeLiveChat(s.general?.livechat, s.general?.twitch?.channel),
      remote: { ...d.general.remote, ...(s.general?.remote ?? {}) },
      engineer: { ...d.general.engineer, ...(s.general?.engineer ?? {}) },
      sharing: { ...d.general.sharing, ...(s.general?.sharing ?? {}) },
      voice: voiceMigrate({
        ...d.general.voice,
        ...(s.general?.voice ?? {}),
        sessions: { ...d.general.voice.sessions, ...(s.general?.voice?.sessions ?? {}) },
        categories: { ...d.general.voice.categories, ...(s.general?.voice?.categories ?? {}) },
      }),
      sounds: {
        fasterClass: { ...d.general.sounds.fasterClass, ...(s.general?.sounds?.fasterClass ?? {}) },
        alongside: { ...d.general.sounds.alongside, ...(s.general?.sounds?.alongside ?? {}) },
      },
      mqtt: {
        server: { ...d.general.mqtt.server, ...(s.general?.mqtt?.server ?? {}) },
        client: { ...d.general.mqtt.client, ...(s.general?.mqtt?.client ?? {}) },
      },
    },
    activeProfile: typeof s.activeProfile === "string" ? s.activeProfile : "default",
    profiles: {},
    theme: normalizeTheme(s.theme),
    savedThemes: Array.isArray(s.savedThemes)
      ? s.savedThemes
          .filter((x) => x && typeof x.id === "string" && x.theme)
          .map((x) => ({ id: x.id, name: String(x.name ?? "").slice(0, 40), author: String(x.author ?? ""), theme: normalizeTheme(x.theme) }))
      : [],
    league: {
      active: typeof s.league?.active === "string" ? s.league.active : "",
      configs: Array.isArray(s.league?.configs) ? s.league!.configs : [],
    },
    friends: {
      ...d.friends,
      ...(s.friends ?? {}),
      where: { ...d.friends.where, ...(s.friends?.where ?? {}) },
      list: Array.isArray(s.friends?.list) ? s.friends!.list : [],
    },
  };
  const profiles = s.profiles && typeof s.profiles === "object" ? s.profiles : d.profiles;
  for (const [pid, p] of Object.entries(profiles)) {
    const prof: Profile = {
      id: pid,
      name: p?.name || pid,
      overlays: {},
      rules: { ...defaultRules(), ...(p?.rules ?? {}) },
      canvas: p?.canvas && p.canvas.w > 0 && p.canvas.h > 0 ? p.canvas : undefined,
    };
    // Kayıtlı kopyalar (anahtar: kopya kimliği; eski ayarlarda anahtar = overlay türü)
    for (const [key, cur] of Object.entries(p?.overlays ?? {})) {
      const type = (cur as OverlayInstance)?.type || key;
      // Artık var olmayan türler (ör. kaldırılan eski "twitch" sohbet overlay'i) sessizce atılır
      if (!manifests.some((m) => m.id === type)) continue;
      const def = defaultInstance(type);
      prof.overlays[key] = { ...def, ...cur, type, options: logoColMigrate(type, cur?.options, { ...def.options, ...(cur?.options ?? {}) }) };
    }
    // Her türün bir ana kopyası olsun (yeni eklenen overlay'ler otomatik gelir)
    for (const m of manifests) {
      if (!prof.overlays[m.id]) prof.overlays[m.id] = defaultInstance(m.id);
    }
    out.profiles[pid] = prof;
  }
  if (Object.keys(out.profiles).length === 0) out.profiles = d.profiles;
  if (!out.profiles[out.activeProfile]) out.activeProfile = Object.keys(out.profiles)[0];
  return out;
}

const [settings, setSettingsRaw] = createSignal<AppSettings>(defaultSettings());
/** Ayarlar değişince biçim tercihlerini (saat, mph) de günceller */
function setSettingsSignal(s: AppSettings) {
  formatPrefs.hour12 = s.general.timeFormat === "12";
  formatPrefs.speedMph = !!s.general.speedMph;
  if (s.general.language && s.general.language !== lang()) void setLang(s.general.language);
  const r = s.general.remote;
  setRemoteSource(inTauri && r?.enabled && r.host ? `http://${r.host.replace(/^https?:\/\//, "")}:${r.port || 8910}` : null);
  setSettingsRaw(s);
}
export { settings };

let source = "unknown";
let saveTimer: number | undefined;
const changeListeners = new Set<(s: AppSettings, local: boolean) => void>();

export function onSettingsChange(fn: (s: AppSettings, local: boolean) => void) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

let inited = false;

export async function initSettings(windowName: string) {
  if (inited) return;
  inited = true;
  source = windowName;
  if (!inTauri) {
    // Tarayıcı modu (OBS/ağ): ayarlar sadece okunur, değişiklikler sunucudan gelir
    const saved = await fetch("/api/settings").then((r) => r.json()).catch(() => null);
    setSettingsSignal(normalize(saved));
    onRemoteSettings((v) => {
      const s = normalize(v);
      setSettingsSignal(s);
      changeListeners.forEach((fn) => fn(s, false));
    });
    return;
  }
  const saved = await invoke<unknown>("settings_get");
  setSettingsSignal(normalize(saved));
  await listen<{ value: unknown; source: string }>("settings-changed", (e) => {
    if (e.payload.source === source) return;
    const s = normalize(e.payload.value);
    setSettingsSignal(s);
    changeListeners.forEach((fn) => fn(s, false));
  });
}

// Değişiklikler bir kare (~16 ms) içinde birleştirilip hemen gönderilir.
// Kaydırıcı sürüklerken bile diğer pencere akıcı güncellenir; diske yazmayı Rust toplar.
let pending: AppSettings | null = null;
function scheduleSave(s: AppSettings) {
  if (!inTauri) return;
  const first = pending === null;
  pending = s;
  if (!first) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const v = pending;
    pending = null;
    invoke("settings_set", { value: v, source }).catch((e) => console.error("Ayar kaydedilemedi", e));
  }, 16);
}

/** Ayarları değiştir. `fn` bir kopya üzerinde çalışır. */
export function updateSettings(fn: (draft: AppSettings) => void) {
  const draft = structuredClone(settings());
  fn(draft);
  draft.updatedAt = Date.now();
  setSettingsSignal(draft);
  scheduleSave(draft);
  changeListeners.forEach((l) => l(draft, true));
}

/** Buluttan gelen ayarları olduğu gibi uygula (updatedAt korunur). */
export function replaceSettings(value: unknown) {
  const s = normalize(value);
  setSettingsSignal(s);
  scheduleSave(s);
  changeListeners.forEach((l) => l(s, false));
}

export function activeProfile(): Profile {
  const s = settings();
  return s.profiles[s.activeProfile];
}

/** Bir düzendeki kopyalar (sıralı: önce türler, sonra kopyalar) */
export function instancesOf(p: Profile): [string, OverlayInstance][] {
  const order = new Map(manifests.map((m, i) => [m.id, i]));
  return Object.entries(p.overlays).sort(
    ([ka, a], [kb, b]) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99) || (ka === a.type ? -1 : kb === b.type ? 1 : ka.localeCompare(kb)),
  );
}

/** Kopya için görünen ad */
export function instanceName(key: string, inst: OverlayInstance) {
  const m = manifests.find((x) => x.id === inst.type);
  if (inst.name) return inst.name;
  if (key === inst.type) return m?.name ?? key;
  const n = key.split("#")[1];
  return `${m?.name ?? inst.type} ${n ?? ""}`.trim();
}

/** Aynı türden yeni bir kopya ekler, anahtarını döner. */
export function addInstance(type: string, profileId?: string): string {
  let key = type;
  updateSettings((d) => {
    const p = d.profiles[profileId && d.profiles[profileId] ? profileId : d.activeProfile];
    let n = 2;
    while (p.overlays[`${type}#${n}`]) n++;
    key = `${type}#${n}`;
    const base = p.overlays[type];
    const inst = defaultInstance(type);
    inst.enabled = true;
    inst.monitor = base?.monitor ?? "";
    inst.x = (base?.x ?? inst.x) + 40;
    inst.y = (base?.y ?? inst.y) + 40;
    p.overlays[key] = inst;
  });
  return key;
}

/** Kopyayı siler (ana kopya silinmez, kapatılır). */
export function removeInstance(key: string, profileId?: string) {
  updateSettings((d) => {
    const p = d.profiles[profileId && d.profiles[profileId] ? profileId : d.activeProfile];
    const inst = p.overlays[key];
    if (!inst) return;
    if (key === inst.type) inst.enabled = false;
    else delete p.overlays[key];
  });
}

/** Overlay ayarını değiştir. `profileId` verilmezse panelde seçili düzen. */
export function updateOverlay(id: string, fn: (o: OverlayInstance) => void, profileId?: string) {
  updateSettings((d) => {
    const pid = profileId && d.profiles[profileId] ? profileId : d.activeProfile;
    fn(d.profiles[pid].overlays[id]);
  });
}

// ---------------------------------------------------------------------------
// Düzen seçimi (Layout Manager)
// ---------------------------------------------------------------------------

export function sessionKind(type: string): SessionKind | null {
  const t = type.toLowerCase();
  if (t.includes("race")) return "race";
  if (t.includes("qual")) return "qualify";
  if (t.includes("practice") || t.includes("warmup") || t.includes("test")) return "practice";
  return null;
}

/** Kuralın bu duruma uyup uymadığı ve ne kadar özel olduğu (yüksek = daha özel). -1 uymaz. */
function ruleScore(p: Profile, st: Status | undefined, mode: ProfileMode): number {
  const r = p.rules;
  if (r.mode !== mode) return -1;
  let score = 0;
  if (r.cars.length) {
    if (!st) return -1;
    const hay = `${st.carName}|${st.carPath}|${st.className}`.toLowerCase();
    if (!r.cars.some((c) => c.trim() && hay.includes(c.trim().toLowerCase()))) return -1;
    score += 2;
  }
  if (r.sessions.length) {
    const k = st ? sessionKind(st.sessionType) : null;
    if (!k || !r.sessions.includes(k)) return -1;
    score += 1;
  }
  return score;
}

/**
 * Şu an gösterilecek düzen.
 * - Yayın (OBS) sayfası: adreste ?layout= varsa o; yoksa "Yayın" düzeni; yoksa seçili düzen.
 * - Otomatik geçiş kapalıysa: panelde seçili düzen (izlerken "Spotting" düzeni varsa o).
 * - Açıksa: araca/oturuma en özel uyan düzen; hiçbiri uymazsa seçili düzen.
 */
export function resolveProfile(st: Status | undefined, stream = false, forced?: string | null): Profile {
  const s = settings();
  if (forced && s.profiles[forced]) return s.profiles[forced];
  const list = Object.values(s.profiles);
  const mode: ProfileMode = stream ? "stream" : st?.spectating ? "spotting" : "driving";
  const pick = (m: ProfileMode, needAuto: boolean) => {
    let best: Profile | null = null;
    let bestScore = -1;
    for (const p of list) {
      const sc = ruleScore(p, st, m);
      if (sc < 0) continue;
      if (needAuto && !s.general.autoSwitch && sc > 0) continue;
      if (sc > bestScore) {
        best = p;
        bestScore = sc;
      }
    }
    return best;
  };
  if (mode !== "driving") {
    const p = pick(mode, false);
    if (p) return p;
  }
  if (s.general.autoSwitch && mode === "driving") {
    const active = s.profiles[s.activeProfile];
    const p = pick("driving", true);
    // Seçili düzen genel (kuralsız) ise ve daha özel bir düzen uyuyorsa ona geç
    if (p && ruleScore(p, st, "driving") > 0) return p;
    if (active && active.rules.mode === "driving") return active;
    if (p) return p;
  }
  return s.profiles[s.activeProfile];
}

export function updateTheme(fn: (t: Theme) => void) {
  updateSettings((d) => fn(d.theme));
}
