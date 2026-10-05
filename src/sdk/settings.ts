import { sanitizeDashes, setDashList, type CustomDash } from "@/dash/model";
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
import { DEFAULT_THEME, OLD_TEXT_DEFAULTS, normalizeTheme, type Theme } from "./theme";
import { normalizeLook, type OverlayLook } from "./look";

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
  /** Bu kopyaya özel görünüm (renk, biçim, yazı; bkz. sdk/look.ts). Yoksa genel tema. */
  look?: OverlayLook;
  /** Arka plan (panel) opaklığı çarpanı 0..1 (yok = 1: temadaki gibi). Yazılar opak kalır. Bkz. sdk/lookStyle.ts */
  bgOpacity?: number;
  /** Düzene eklendiği an (ms): overlay listesinde ekli olanlar bu sırayla gösterilir */
  addedAt?: number;
  /** Kilitli kopya: konumu / boyutu değiştirilemez, düzenden silinemez (ayarları değiştirilebilir) */
  locked?: boolean;
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
  /** Yayın düzeni bir düzene bağlıysa: kendi overlay listesi yerine o düzenin overlay'leri canlı çizilir */
  link?: StreamLink;
  /** Listedeki sıra (sağ tık › Yukarı / Aşağı taşı). Yoksa oluşturulma sırası. */
  order?: number;
  /** Kilitli düzen: yerleşimi ve overlay ayarları değiştirilemez, silinemez (listeden kilit açılır) */
  locked?: boolean;
  /** Varsayılan düzen: türünde (düzen / yayın düzeni) tam bir tane olur; silinemez, etkin düzen kaybolunca buna dönülür */
  isDefault?: boolean;
  /** Toplulukta paylaşıldıysa paylaşımın kimliği (yeniden paylaşırken "öncekini güncelle" için) */
  sharedId?: string;
}

/** Bağlı yayın düzeni: `source` düzen kimliği ya da "@active" (uygulamada o an etkin düzen) */
export interface StreamLink {
  source: string;
  /** Yayında gizlenen kopyalar (kaynak düzendeki anahtarlar) */
  hidden: string[];
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
  /** Bir kerelik geçiş: "Uygulama açılınca sohbeti başlat" varsayılan açık oldu (kullanıcı sonra kapatırsa kapalı kalır) */
  autoStartV1?: boolean;
  channels: LiveChannel[];
  /** Varsayılan kanallar bir kez eklendi (kullanıcı silerse geri gelmez) */
  seeded: boolean;
  /** Üst çubukta (Otomatik'in solunda) sohbeti başlat / durdur düğmesi (PRO) */
  topButton?: boolean;
  /** Bir kerelik geçiş: kanal listesi boş kalmış eski kurulumlara varsayılan kanallar yeniden eklendi, sıra düzeltildi */
  seedV2?: boolean;
  /** Bir kerelik geçiş: sesli okuma + altyazı varsayılan açık, motor Çevrimiçi (Whisper), kaynak ikisi (dokunulmamış kurulumlar) */
  voiceDefV1?: boolean;
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
  /** Ses kimliği: "edge:tr-TR-AhmetNeural" (Edge çevrimiçi sesi), Windows ses kimliği ya da boş (Windows varsayılanı) */
  voice: string;
  /** Bir kerelik geçiş: hiç ses seçilmemiş kurulumlara arayüz diline uygun Edge sesi atandı */
  edgeDefV1?: boolean;
  /** Bir kerelik geçiş yapıldı: varsayılan mod "Sadece komutla", komut "!" */
  cmdDefV1?: boolean;
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
  /**
   * Motor. windows: Windows konuşma tanıma (anahtarsız; yalnızca mikrofon; yalnızca konuşma paketi kurulu diller, Türkçe yok).
   * cloud: Çevrimiçi Whisper (OpenAI uyumlu sunucu; API anahtarı ister; Türkçe, cihaz seçimi ve bilgisayar sesi).
   */
  engine: "windows" | "cloud";
  /** Ses kaynağı: mikrofon / bilgisayar sesi (Discord vb.; yalnızca cloud motoru) / ikisi */
  source: "mic" | "system" | "both";
  /** cloud: mikrofonun (kayıt cihazının) adı; boş: Windows varsayılanı */
  micDevice: string;
  /** cloud: bilgisayar sesinin alınacağı çıkış cihazının adı (geri döngü); boş: Windows varsayılanı */
  systemDevice: string;
  /** Bilgisayar sesinden gelen altyazının önündeki ad (ör. "Discord"; boş bırakılabilir) */
  remoteLabel: string;
  /** cloud: dil kodu (ör. "tr"); boş: arayüz dili, "auto": otomatik algıla */
  cloudLanguage: string;
  /** cloud: sunucu. Anahtar burada DEĞİL (Rust'ta şifreli dosyada). */
  cloud: { provider: "groq" | "openai" | "custom"; url: string; model: string };
  /** cloud: konuşma algılama hassasiyeti 1..10 */
  sensitivity: number;
  /** Windows motoru: tanıma dili (ör. "en-US"; boş: Windows konuşma dili) */
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

/** Varsayılan Canlı Sohbet kanalları, bu sırayla (YouTube ilk: ücretsiz sürümde yalnızca ilk kanal bağlanır) */
export const DEFAULT_LIVE_CHANNELS = ["https://www.youtube.com/@ErkinAzcan", "https://kick.com/erkinazcan", "https://www.twitch.tv/erkinazcan"];

/** Arayüz diline uygun varsayılan Edge çevrimiçi sesi (Türkçe: Ahmet). Rust: livechat/tts_edge.rs */
const EDGE_DEFAULT_VOICES: Record<string, string> = {
  tr: "tr-TR-AhmetNeural",
  en: "en-US-AriaNeural",
  de: "de-DE-ConradNeural",
  es: "es-ES-AlvaroNeural",
  fi: "fi-FI-HarriNeural",
  fr: "fr-FR-HenriNeural",
  it: "it-IT-DiegoNeural",
  ja: "ja-JP-KeitaNeural",
  nl: "nl-NL-MaartenNeural",
  pl: "pl-PL-MarekNeural",
  "pt-BR": "pt-BR-AntonioNeural",
  "pt-PT": "pt-PT-DuarteNeural",
  ru: "ru-RU-DmitryNeural",
  sv: "sv-SE-MattiasNeural",
  "zh-CN": "zh-CN-YunxiNeural",
};
export function edgeDefaultVoice(langCode: string): string {
  return `edge:${EDGE_DEFAULT_VOICES[langCode] ?? EDGE_DEFAULT_VOICES[(langCode || "").split("-")[0]] ?? EDGE_DEFAULT_VOICES.en}`;
}

export function defaultLiveChat(): LiveChatSettings {
  return {
    autoStart: true,
    autoStartV1: true,
    channels: defaultLiveChannels(),
    seeded: true,
    seedV2: true,
    voiceDefV1: true,
    ytInterval: 2,
    ytClientVersion: "",
    moderation: { banned: [], wordFilter: false, words: "", wordMode: "mask", blockLinks: false, spam: true, spamWindow: 10, mirrorDeletes: true },
    poll: { options: 2, duration: 60, resultDuration: 15, hideVotes: false },
    log: false,
    logDays: 30,
    streamlabs: false,
    captions: { secs: 8 },
    tts: {
      enabled: true,
      mode: "command",
      command: "!",
      cmdDefV1: true,
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
      voice: edgeDefaultVoice(detectLang()),
      edgeDefV1: true,
      device: "",
      rate: 0,
      pitch: 0,
      volume: 80,
    },
    stt: {
      enabled: true,
      engine: "cloud",
      source: "both",
      micDevice: "",
      systemDevice: "",
      remoteLabel: "Discord",
      cloudLanguage: "",
      cloud: { provider: "groq", url: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
      sensitivity: 5,
      language: "",
      profanity: false,
      profanityWords: "",
      pauseWhileTts: true,
      label: "",
    },
    sendTarget: "mine",
  };
}

/**
 * autoStartV1 geçişi bu açılışta uygulandı mı: kayıtlı ayarda otomatik başlatma henüz açık değildi, yani Rust tarafı
 * açılışta sohbeti başlatmadı. Panel (App.tsx) bunu görünce ayarı bir kez kaydeder ve sohbeti kendisi başlatır.
 */
let lcAutoMigrated = false;
export function takeLiveChatAutoMigrated(): boolean {
  const v = lcAutoMigrated;
  lcAutoMigrated = false;
  return v;
}

/** Kayıtlı ayarı tamamlar. Eski "Twitch Sohbeti" kanal adı ilk kez Canlı Sohbet listesine taşınır. */
function normalizeLiveChat(v: Partial<LiveChatSettings> | undefined, twitchChannel: string | undefined, uiLang?: string): LiveChatSettings {
  const d = defaultLiveChat();
  if (!v || typeof v !== "object" || (!v.autoStartV1 && !v.autoStart)) lcAutoMigrated = true;
  if (!v || typeof v !== "object") {
    const ch = (twitchChannel ?? "").trim().replace(/^#/, "");
    // Eski "Twitch Sohbeti" kanalı (varsayılanlardan biri değilse) çalışmaya devam etsin diye listenin başına gelir
    if (ch && !DEFAULT_LIVE_CHANNELS.some((u) => u.toLowerCase() === `https://www.twitch.tv/${ch}`.toLowerCase())) d.channels.unshift({ url: `https://www.twitch.tv/${ch}` });
    return d;
  }
  const banned = (v.moderation as any)?.banned;
  // voiceDefV1: sesli okuma / altyazı ayarlarına hiç dokunmamış (eski varsayılanlarda, kapalı) kurulumlar bir kez yeni
  // varsayılanlara geçer; kullanıcının değiştirdiği ayarlara dokunulmaz. PRO kilidi varsa özellik yine çalışmaz.
  const mig = !v.voiceDefV1;
  const ot = v.tts;
  const ttsNew = mig && (!ot || (!ot.enabled && (ot.mode ?? "all") === "all" && !ot.subsOnly && !ot.onlyUsers && !ot.device && (ot.volume ?? 80) === 80 && !ot.rate && !ot.pitch));
  const os = v.stt;
  const sttNew = mig && (!os || (!os.enabled && (os.engine ?? "windows") === "windows" && (os.source ?? "mic") === "mic" && !os.language && !os.label && !os.profanity));
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
    tts: {
      ...d.tts,
      ...(v.tts ?? {}),
      platforms: { ...d.tts.platforms, ...(v.tts?.platforms ?? {}) },
      // edgeDefV1: hiç ses seçmemiş (boş) kayıtlı kurulumlar bir kez arayüz diline uygun Edge sesine geçer
      voice: v.tts && !v.tts.edgeDefV1 && !v.tts.voice ? edgeDefaultVoice(uiLang || detectLang()) : (v.tts?.voice ?? d.tts.voice),
      edgeDefV1: true,
      // Bir kerelik geçiş (cmdDefV1): eski varsayılanda (Tüm mesajlar + "!oku") duran kurulumlar yeni varsayılana geçer:
      // "Sadece komutla" ve komut "!". Kullanıcının kendi seçtiği mod / komut korunur.
      ...(v.tts && !v.tts.cmdDefV1 && (v.tts.mode ?? "all") === "all" && (v.tts.command ?? "!oku") === "!oku" ? { mode: "command" as const, command: "!" } : {}),
      cmdDefV1: true,
      ...(ttsNew ? { enabled: true } : {}),
    },
    stt: { ...d.stt, ...(v.stt ?? {}), cloud: { ...d.stt.cloud, ...(v.stt?.cloud ?? {}) }, ...(sttNew ? { enabled: true, engine: "cloud" as const, source: "both" as const } : {}) },
    voiceDefV1: true,
    // Bir kerelik geçiş (autoStartV1): sohbet uygulama açılınca kendiliğinden başlar; kullanıcı sonra kapatırsa kapalı kalır
    ...(v.autoStartV1 ? {} : { autoStart: true }),
    autoStartV1: true,
    sendTarget: typeof v.sendTarget === "string" && v.sendTarget ? v.sendTarget : "mine",
  });
}

function defaultLiveChannels(): LiveChannel[] {
  return DEFAULT_LIVE_CHANNELS.map((url) => ({ url, hidden: false, tag: null, mine: true, name: "" }));
}

/**
 * Varsayılan kanallar: yeni kurulumda `defaultLiveChat` ile gelir. Kayıtlı ayarda liste boşsa bir kez eklenir
 * (`seedV2`: eski sürümde `seeded` işaretlenip listesi boş kalmış kurulumlar da bir kez daha tohumlanır; kullanıcı
 * sonra silerse geri gelmez). Liste tam olarak varsayılan üç kanaldan oluşuyorsa sıra YouTube, Kick, Twitch yapılır.
 */
function seedLiveChannels(x: LiveChatSettings): LiveChatSettings {
  // Bir kezlik: varsayılan üç kanal ★ (benim kanalım) işaretlenir; hiç ★ kanalı olmayan kurulumlarda
  const xs = x as LiveChatSettings & { starV1?: boolean };
  if (xs.starV1 !== true) {
    if (!x.channels.some((c) => c.mine)) {
      const isDef = (c: LiveChannel) => DEFAULT_LIVE_CHANNELS.some((u) => u.toLowerCase() === c.url.trim().replace(/\/+$/, "").toLowerCase());
      x.channels = x.channels.map((c) => (isDef(c) ? { ...c, mine: true } : c));
    }
    xs.starV1 = true;
  }
  if (x.seeded === true && x.seedV2 === true) return x;
  if (!x.channels.length) x.channels = defaultLiveChannels();
  else if (x.seedV2 !== true && x.channels.length === DEFAULT_LIVE_CHANNELS.length) {
    const idx = (c: LiveChannel) => DEFAULT_LIVE_CHANNELS.findIndex((u) => u.toLowerCase() === c.url.trim().replace(/\/+$/, "").toLowerCase());
    if (x.channels.every((c) => idx(c) >= 0) && new Set(x.channels.map(idx)).size === x.channels.length) x.channels = [...x.channels].sort((a, b) => idx(a) - idx(b));
  }
  x.seeded = true;
  x.seedV2 = true;
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
  /** Bir kerelik geçiş: telsiz kontrolü (categories.radio) varsayılan kapalı. Rust: voice.rs cfg_from_settings */
  radioOffV1?: boolean;
  /** Sesli komut (bas-konuş, PRO: voice.commands). Rust: src-tauri/src/voicecmd.rs */
  commands: VoiceCommandSettings;
}

/** Bas-konuşa atanan direksiyon / kumanda düğmesi (USB üretici / ürün numarası + 0'dan başlayan düğme numarası) */
export interface VoiceCommandButton {
  vid: number;
  pid: number;
  button: number;
  name: string;
}

export interface VoiceCommandSettings {
  enabled: boolean;
  /** hold: basılı tutarken dinler · toggle: dokununca başlar, susunca kendiliğinden biter */
  mode: "hold" | "toggle";
  /** Klavye tuşu ("Ctrl+Shift+T", "F13"…); boş: yok */
  key: string;
  button: VoiceCommandButton | null;
  /** Tanıma dili (dil kodu); boş: arayüz dili */
  language: string;
  /** Tanıma motoru: auto = dilin Windows tanıyıcısı varsa Windows, yoksa çevrimiçi (Whisper) */
  engine: "auto" | "windows" | "online";
  /** Tanıyıcı güven eşiği (%): altındaki sonuçlar "anlaşılmadı" sayılır */
  confidence: number;
  /** Dinleme / anlaşıldı / anlaşılmadı bipleri */
  beeps: boolean;
  /** Mikrofon (Windows kayıt cihazı kimliği); boş: Windows varsayılanı. Cihaz yoksa varsayılana düşülür. */
  mic: string;
  /** Seçilen mikrofonun adı (cihaz çıkarılmışsa göstermek için) */
  micName: string;
  /** Bir kerelik geçiş: sesli komut varsayılan olarak açık (kullanıcı sonra kapatırsa kapalı kalır) */
  onV1?: boolean;
}

export const DEFAULT_VOICE_COMMANDS: VoiceCommandSettings = { enabled: true, mode: "hold", key: "", button: null, language: "", engine: "auto", confidence: 40, beeps: true, mic: "", micName: "", onV1: true };

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

/** Düzenleme arka planı (dosya ayar klasöründe; rev değişince yeniden yüklenir) */
export type EditBackdrop = { enabled: boolean; opacity: number; rev: number; has: boolean };
/** Arka planın gösterildiği yer: Düzenler tuvali / Yayın düzenleri tuvali / ekranda düzenleme modu */
export type EditBackdropSlot = "layout" | "stream" | "screen";
export const EDIT_BACKDROP_SLOTS: EditBackdropSlot[] = ["layout", "stream", "screen"];

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
  /** Monitörlerin mantıksal boyutları (anahtar: monitör adı, "" = ana overlay monitörü). Panel günceller;
   * OBS sayfası bağlı yayın düzenlerini bu boyutlardan yayın çözünürlüğüne oranlar. */
  screens?: Record<string, { w: number; h: number }>;
  /** Yayın düzenlerinde SRTR Pitwall logosu (sağ üst). false: gizli; özellik kullanıcıya kilitliyken yok sayılır (sdk/streamBadge.tsx) */
  streamBadge?: boolean;
  /** Logonun konumu (tuvaldeki boş payın oranı, 0..1). Yoksa varsayılan sağ üst; özellik kilitliyken yok sayılır */
  streamBadgePos?: { x: number; y: number };
  /** Küçük arayüz tercihleri (favori overlay'ler, kapalı kategoriler, arkadaş listesi sırası…): hesapla birlikte buluta gider (uiPref) */
  uiPrefs?: Record<string, unknown>;
  server: ServerSettings;
  /** Web sunucusu bir kez varsayılan olarak açıldı (kullanıcı sonra kapatabilir). Rust açılışta aynı işarete bakar. */
  serverOnV1?: boolean;
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
    crewStop: string;
    /** Direksiyon Ekranı (özel tasarım): sonraki sayfa */
    dashPage: string;
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
  social: { dnd: boolean; /** Çevrimdışı görün (c65; yok = kapalı) */ invisible?: boolean; acceptMessages: boolean; sound: boolean; /** Konuşma altyazımı ekibimle paylaş (Ekip Pitwall'ı; yok = açık) */ crewSpeech?: boolean; /** Ekip mesajlarını ekranın alt ortasında kutucukta göster (yok = açık) */ crewBox?: boolean };
  /** Kullanılmıyor (v75): Demo modunda sesli mühendis / spotter / bipler her zaman susar; eski kayıtlar için duruyor */
  demoMute: boolean;
  /** Bir kerelik geçiş: demo sesi varsayılan olarak kapalı (kullanıcı sonra açarsa açık kalır) */
  demoMuteV1?: boolean;
  /** Bir kerelik geçiş: sesli mühendis kısayolu varsayılanı Ctrl+Shift+S */
  voiceKeyV1?: boolean;
  /** Bir kerelik geçiş yapıldı: daha okunaklı varsayılan yazı (Inter, 14 px, orta kalınlık, gölge) */
  themeReadV1?: boolean;
  /** Aynı overlay'den birden fazla eklenebilsin */
  allowDuplicates: boolean;
  /** Ekran görüntüleri */
  screenshots: ScreenshotSettings;
  /** Düzenleme ekranının arka plan görseli (dosya ayar klasöründe; rev değişince yeniden yüklenir) */
  editBackdrop: EditBackdrop;
  /** Her düzenleme yeri için ayrı arka plan (Düzenler tuvali / Yayın düzenleri tuvali / ekranda düzenleme).
   *  `editBackdrop` eski tek ayardır: sadece ilk geçişte üç yerin başlangıç değeri olarak okunur. */
  editBackdrops: Record<EditBackdropSlot, EditBackdrop>;
  minimizeOnConnect: boolean;
  /** Yarış bitince Olaylar penceresini otomatik aç (Rust `general.eventsAutoOpen` okur) */
  eventsAutoOpen: boolean;
  /** Olaylar penceresinin kendiliğinden açılması için gereken en az olay sayısı (start/bitiş hariç; Rust okur) */
  eventsMinCount: number;
  /** Olaylar ekranına hangi türler kaydedilsin (Rust `general.eventsRecord` okur); others = diğer sürücülerin olayları */
  eventsRecord: { crash: boolean; pass: boolean; pit: boolean; fast: boolean; flag: boolean; others: boolean };
  /** Telemetri: canlı oturumda tamamlanan turları kaydet ve hesaba yükle (Rust `general.telemetryRecord` okur) */
  telemetryRecord: boolean;
  returnFocus: boolean;
  /** Kısayola basılınca ekranın üst ortasında kısa bildirim göster (Rust `general.shortcutOsd` okur) */
  shortcutOsd: boolean;
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

export type OverlaySort = "category" | "alpha" | "popular" | "custom";
export const OVERLAY_SORTS: OverlaySort[] = ["popular", "category", "alpha", "custom"];

export interface AppSettings {
  version: 1;
  updatedAt: number;
  general: GeneralSettings;
  activeProfile: string;
  profiles: Record<string, Profile>;
  /**
   * "Overlaylarım" sayfasında ayarlanan, overlay türü başına varsayılanlar: bir overlay bir düzene eklendiğinde
   * bu ayarlarla (seçenekler, özel görünüm, boyut, opaklık, gizleme kuralları) gelir. Konum ve monitör düzene aittir.
   */
  defaults: Record<string, OverlayInstance>;
  /** "Overlaylarım"da kullanıcının verdiği overlay sırası (tür kimlikleri). Boş: kategorilere göre varsayılan sıra. */
  overlayOrder: string[];
  /** Overlay listesinin sırası: kategori / harf / en çok kullanılan / kullanıcının kendi sırası (overlayOrder) */
  overlaySort: OverlaySort;
  /** Tüm overlay'lerin ortak görünümü */
  theme: Theme;
  /** Topluluktan indirilen temalar (Görünüm'de hazır temaların yanında) */
  savedThemes: SavedTheme[];
  league: LeagueSettings;
  friends: FriendsSettings;
  /** Dashboard Tasarımcısı: kullanıcının özel direksiyon ekranı tasarımları (bkz. src/dash/model.ts) */
  dashes: CustomDash[];
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
    ...(typeof m.defaultBgOpacity === "number" ? { bgOpacity: m.defaultBgOpacity } : {}),
    options: LOGO_COL_TYPES.includes(m.id) ? { ...defaultOptions(m), logoColV1: true, ...(m.id === "relative" ? { relFlairV1: true } : { stFlairV1: true }) } : defaultOptions(m),
  };
}

/**
 * Bir kerelik geçiş (lcDefV1): Canlı Sohbet overlay'inin yeni varsayılanları (genişlik 480, en fazla 10 mesaj, yazı 16 px,
 * izleyici çubuğu Normal, saat açık) eski varsayılanında bırakılmış kayıtlı kopyalara da uygulanır; kullanıcının
 * değiştirdiği değerlere dokunulmaz.
 */
function lcDefMigrate(type: string, saved: Record<string, any> | undefined, options: Record<string, any>) {
  if (type !== "livechat" || saved?.lcDefV1) return options;
  if (saved) {
    if ((saved.width ?? 360) === 360) options.width = 480;
    if ((saved.maxMessages ?? 12) === 12) options.maxMessages = 10;
    if ((saved.fontSize ?? 15) === 15) options.fontSize = 16;
    if ((saved.viewerBar ?? "off") === "off") options.viewerBar = "normal";
    if ((saved.showClock ?? false) === false) options.showClock = true;
  }
  options.lcDefV1 = true;
  return options;
}

/**
 * Bir kerelik geçiş: Mesajlar overlay'inin eski tek "Gösterilecek mesajlar" seçimi (`source`) ayrı anahtarlara
 * çevrilir: "Arkadaş mesajlarını göster" (`friends`) + "Yalnızca şu kişiler" (`people`; boş: herkes). `source`
 * silindiği için ikinci kez çalışmaz.
 */
function msgSrcMigrate(type: string, options: Record<string, any>) {
  if (type !== "messages" || options.source === undefined) return options;
  const src = options.source;
  options.friends = src !== "team" && src !== "none";
  if (src !== "selected") options.people = [];
  if (src === "team") options.includeTeams = true;
  delete options.source;
  return options;
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

/**
 * Bir kerelik geçiş (relFlairV1): kayıtlı Yakındakiler (relative) kopyalarına ülke bayrağı sütunu, Sıralama Tablosu'ndaki
 * gibi sürücü adının hemen soluna ve açık olarak eklenir. Kullanıcı sonradan kapatır ya da taşırsa tekrar dokunulmaz.
 */
function relFlairMigrate(type: string, saved: Record<string, any> | undefined, options: Record<string, any>) {
  if (type !== "relative" || saved?.relFlairV1) return options;
  if (Array.isArray(options.columns)) {
    const cols = (options.columns as { key: string; on: boolean }[]).filter((c) => c && c.key !== "flair");
    const at = cols.findIndex((c) => c.key === "name");
    cols.splice(at < 0 ? cols.length : at, 0, { key: "flair", on: true });
    options.columns = cols;
  }
  options.relFlairV1 = true;
  return options;
}

/**
 * Bir kerelik geçiş (stFlairV1): kayıtlı Sıralama Tablosu kopyalarında ülke bayrağı sütunu sürücü adının hemen
 * soluna alınır (eski kayıtlarda sütun listede yoksa ya da adın arkasında kaldıysa). Açık/kapalı durumu korunur;
 * listede hiç yoksa açık eklenir. Kullanıcı sonradan taşırsa tekrar dokunulmaz.
 */
function stFlairMigrate(type: string, saved: Record<string, any> | undefined, options: Record<string, any>) {
  if (type !== "standings" || saved?.stFlairV1) return options;
  if (Array.isArray(options.columns)) {
    const all = (options.columns as { key: string; on: boolean }[]).filter((c) => c && typeof c.key === "string");
    const cur = all.find((c) => c.key === "flair");
    const cols = all.filter((c) => c.key !== "flair");
    const at = cols.findIndex((c) => c.key === "name");
    cols.splice(at < 0 ? 0 : at, 0, { key: "flair", on: cur ? !!cur.on : true });
    options.columns = cols;
  }
  options.stFlairV1 = true;
  return options;
}

/**
 * Bir kerelik geçiş (c63V1): Sıralama Tablosu / Yakındakiler / Yakın Takip yeni varsayılanları. Yalnızca hâlâ ESKİ
 * varsayılanında duran değerler yeni varsayılana alınır; kullanıcının değiştirdiği değerlere dokunulmaz.
 */
function c63Migrate(type: string, saved: Record<string, any> | undefined, options: Record<string, any>) {
  if ((type !== "standings" && type !== "relative" && type !== "duel") || saved?.c63V1) return options;
  const same = (v: unknown, old: string[]) => Array.isArray(v) && v.length === old.length && old.every((k, i) => v[i] === k);
  if (saved && type === "standings") {
    if ((saved.topOwn ?? 3) === 3) options.topOwn = 8;
    if (same(saved.headerFields, ["remaining", "sof"])) options.headerFields = ["remaining", "sof", "incidents", "position", "brakeBias"];
    if (Array.isArray(options.columns) && !(options.columns as { key: string }[]).some((c) => c?.key === "irDelta")) {
      const cols = [...(options.columns as { key: string; on: boolean }[])];
      const at = cols.findIndex((c) => c?.key === "irating");
      cols.splice(at < 0 ? cols.length : at + 1, 0, { key: "irDelta", on: true });
      options.columns = cols;
    }
  }
  if (saved && type === "relative" && same(saved.footerFields, ["sof", "incidents", "remaining", "clock"]))
    options.footerFields = ["sof", "incidents", "position", "brakeBias", "remaining", "clock"];
  if (saved && type === "duel") {
    // Eşik türü eskiden fark birimiyle aynıydı
    if (saved.thresholdMode === undefined) options.thresholdMode = saved.gapUnit === "m" ? "m" : "s";
    if ((saved.showMe ?? true) === true) options.showMe = false;
    if ((saved.blur ?? true) === true) options.blur = false;
    if ((saved.width ?? 380) === 380) options.width = 560;
    if ((saved.bgOpacity ?? 80) === 80) options.bgOpacity = 90;
    if (same(saved.fields, ["class", "pos", "flair", "num", "name", "car", "irating", "pit", "trend", "gap"]))
      options.fields = ["class", "pos", "flair", "num", "name", "car", "license", "irating", "tire", "pit", "trend", "gap"];
  }
  options.c63V1 = true;
  return options;
}

/**
 * Bir kerelik geçiş (mapMeV1): Pist Haritası ve Mini Harita'da kendi aracının işareti varsayılanı kırmızı ok oldu,
 * Pist Haritası'nda "Pist içini doldur" kapalı geliyor. Eski varsayılanında (daire / beyaz / dolgu açık) kalmış kayıtlı
 * kopyalar yeni varsayılana alınır; kullanıcının değiştirdiği değerlere ve sonraki seçimlerine dokunulmaz.
 */
function mapMeMigrate(type: string, saved: Record<string, any> | undefined, options: Record<string, any>) {
  if ((type !== "trackmap" && type !== "minimap") || saved?.mapMeV1) return options;
  if (saved) {
    if ((saved.meShape ?? "circle") === "circle") options.meShape = "arrow";
    if (String(saved.meColor ?? "#ffffff").toLowerCase() === "#ffffff") options.meColor = "#ff3b30";
    if (type === "trackmap" && saved.fill !== false) options.fill = false;
  }
  options.mapMeV1 = true;
  return options;
}

/**
 * Bir kerelik geçiş: Radar'ın eski "Spotter çubukları" görünümü ayrı bir overlay (spotterbar, Çubuk Spotter) oldu.
 * Görünümü çubuk olan kayıtlı radar kopyasından aynı konumda, eşdeğer ayarlarla bir Çubuk Spotter kopyası üretir;
 * yoksa null. (Radar'dan `style` silindiği için bir daha çalışmaz.)
 */
function radarBarsMigrate(cur: OverlayInstance): OverlayInstance | null {
  const o = cur?.options;
  if (!o || o.style !== "bars" || !manifests.some((m) => m.id === "spotterbar")) return null;
  const def = defaultInstance("spotterbar");
  const num = (v: unknown, d: unknown) => (typeof v === "number" && isFinite(v) ? v : d);
  return {
    ...def,
    ...cur,
    type: "spotterbar",
    options: {
      ...def.options,
      thickness: num(o.barWidth, 44),
      height: num(o.barHeight, 180),
      gap: num(o.barGap, 220),
      range: Math.min(20, Math.max(4, num(o.range, 12) as number)),
      hz: num(o.hz, 30),
      colorCar: typeof o.color === "string" ? o.color : def.options.colorCar,
      // Eski çubuklar yakında araç varken ikisi birden görünürdü; "kimse yokken gizle" kapalıysa hep görünürdü
      guides: o.hideWhenClear === false,
    },
  };
}

/** Pedallar & Girdi'den (inputs) Pedal Seti'ne (pedals) taşınan tasarımlar */
const PEDALS_MOVED = ["bars", "strip", "horizontal", "rings", "segments", "tower", "pedals", "hud"];

/**
 * Bir kerelik geçiş: Pedallar & Girdi'nin grafiksiz tasarımları ayrı bir overlay (pedals, Pedal Seti) oldu.
 * Tasarımı taşınanlardan biri olan kayıtlı inputs kopyası için: "move" = açık kopyadan aynı konum / ölçek / tasarım ve
 * aynı ayarlarla üretilen Pedal Seti kopyası (kapalıysa null); "reset" = tasarımı varsayılana dönmüş inputs kopyası.
 * Tasarım taşınanlardan değilse null. (inputs'ta bu tasarım değerleri kalmadığı için bir daha çalışmaz.)
 */
function inputsPedalsMigrate<T extends Partial<OverlayInstance>>(cur: T | undefined): { move: OverlayInstance | null; reset: T } | null {
  const o = cur?.options;
  if (!cur || !o || !PEDALS_MOVED.includes(o.design) || !manifests.some((m) => m.id === "pedals")) return null;
  const reset = { ...cur, options: { ...o, design: "default" } };
  if (!cur.enabled) return { move: null, reset };
  const def = defaultInstance("pedals");
  const options = { ...def.options };
  for (const k of Object.keys(options)) if (k in o) options[k] = o[k];
  return { move: { ...def, ...cur, type: "pedals", options } as OverlayInstance, reset };
}

/** Radar'dan kaldırılan ayarlar (eski çubuk görünümü) */
const RADAR_DROPPED = ["style", "barGap", "barHeight", "barWidth"];

export function newProfile(id: string, name: string): Profile {
  const overlays: Record<string, OverlayInstance> = {};
  for (const m of manifests) overlays[m.id] = defaultInstance(m.id);
  return { id, name, overlays, rules: defaultRules() };
}

/** "Overlaylarım" varsayılanlarının sözde düzen kimliği (updateOverlay / profileById ile kullanılır) */
export const DEFAULTS_ID = "@defaults";

/** Fabrika varsayılanları: her tür için bir kopya */
export function factoryDefaults(): Record<string, OverlayInstance> {
  const out: Record<string, OverlayInstance> = {};
  for (const m of manifests) out[m.id] = { ...defaultInstance(m.id), enabled: false };
  return out;
}

/** Bir düzen kopyasından varsayılana taşınan alanlar (konum, monitör, ad ve açık/kapalı düzene aittir) */
function defaultFrom(type: string, src: Partial<OverlayInstance> | undefined): OverlayInstance {
  const def = defaultInstance(type);
  const look = normalizeLook(src?.look);
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    ...def,
    enabled: false,
    hideInGarage: typeof src?.hideInGarage === "boolean" ? src.hideInGarage : def.hideInGarage,
    hideOnTrack: typeof src?.hideOnTrack === "boolean" ? src.hideOnTrack : def.hideOnTrack,
    alwaysShow: typeof src?.alwaysShow === "boolean" ? src.alwaysShow : def.alwaysShow,
    scale: num(src?.scale, 1, 0.2, 3),
    opacity: num(src?.opacity, 1, 0.2, 1),
    ...(typeof (src?.bgOpacity ?? def.bgOpacity) === "number" ? { bgOpacity: num(src?.bgOpacity, def.bgOpacity ?? 1, 0, 1) } : {}),
    options: c63Migrate(type, src?.options, mapMeMigrate(type, src?.options, msgSrcMigrate(type, lcDefMigrate(type, src?.options, { ...def.options, ...(src?.options && typeof src.options === "object" ? structuredClone(src.options) : {}) })))),
    ...(look ? { look } : {}),
  };
}

/** Düzen ya da "Overlaylarım" varsayılanları (DEFAULTS_ID) */
export function profileById(id: string | undefined | null, s: AppSettings = settings()): Profile | undefined {
  if (id === DEFAULTS_ID) return { id: DEFAULTS_ID, name: "", overlays: s.defaults, rules: defaultRules() };
  return id ? s.profiles[id] : undefined;
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
      server: { enabled: true, port: 8910, lan: false },
      serverOnV1: true,
      mqtt: defaultMqtt(),
      shortcuts: { edit: "Ctrl+Shift+E", hide: "Ctrl+Shift+D", panel: "Ctrl+Shift+Space", shot: "F12", voice: "Ctrl+Shift+S", poll: "F9", tts: "F5", ttsHush: "", stt: "F6", chat: "Ctrl+Shift+C", crewStop: "", dashPage: "", vrConfig: "F9", vrRecenter: "End", vrNext: "Space", vrMode: "M", vrSave: "F10", vrReset: "Home", vrFace: "F", vrGaze: "G" },
      shotKeyV2: true,
      shotKeyV3: true,
      hideInReplay: true,
      chatLook: { ...DEFAULT_CHAT_LOOK },
      convBg: {},
      appBg: { ...DEFAULT_APP_BG },
      allowDuplicates: false,
      demoMute: true,
      demoMuteV1: true,
      voiceKeyV1: true,
      themeReadV1: true,
      social: { dnd: false, acceptMessages: true, sound: true },
      screenshots: { includeOverlays: true, onlyInGame: true, format: "jpg", quality: 92 },
      editBackdrop: { enabled: true, opacity: 100, rev: 0, has: false },
      editBackdrops: {
        layout: { enabled: true, opacity: 100, rev: 0, has: false },
        stream: { enabled: true, opacity: 100, rev: 0, has: false },
        screen: { enabled: true, opacity: 100, rev: 0, has: false },
      },
      minimizeOnConnect: false,
      eventsAutoOpen: true,
      eventsMinCount: 0,
      eventsRecord: { crash: true, pass: true, pit: true, fast: true, flag: true, others: true },
      telemetryRecord: true,
      returnFocus: true,
      shortcutOsd: true,
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
        categories: Object.fromEntries(VOICE_CATEGORIES.map((c) => [c.id, c.id !== "radio"])),
        v2: true,
        radioOffV1: true,
        commands: { ...DEFAULT_VOICE_COMMANDS },
      },
      sounds: {
        fasterClass: { enabled: false, volume: 70, pitch: 700, seconds: 5, muteSpectating: true },
        alongside: { enabled: false, volume: 50, pitch: 400, muteSpectating: true },
      },
    },
    activeProfile: "default",
    profiles: { default: newProfile("default", "Varsayılan") },
    defaults: factoryDefaults(),
    overlayOrder: [],
    overlaySort: "popular",
    theme: { ...DEFAULT_THEME },
    savedThemes: [],
    league: { active: "", configs: [] },
    friends: defaultFriends(),
    dashes: [],
  };
}

/** Eski varsayılanlar "PrintScreen" / "Ctrl+PrintScreen" bir kez "F12" olur (kullanıcı sonra tekrar seçebilir) */
function shotKeyMigrate<T extends { shot: string }>(sc: T, done: boolean | undefined): T {
  if (!done && (sc.shot === "PrintScreen" || sc.shot === "Ctrl+PrintScreen")) sc.shot = "F12";
  return sc;
}

/**
 * Bir kerelik geçiş (voiceKeyV1): sesli mühendisi sustur / aç kısayolu varsayılan olarak Ctrl+Shift+S olur. Kısayolu
 * boş olan ya da eski varsayılanda (Ctrl+Shift+V) kalmış kurulumlara uygulanır; kullanıcının kendi seçtiği tuşa
 * dokunulmaz, Ctrl+Shift+S başka bir eylemde kullanılıyorsa da değiştirilmez. Rust: lib.rs shortcuts_from_settings.
 */
function voiceKeyMigrate<T extends Record<string, string>>(sc: T, done: boolean | undefined): T {
  if (done) return sc;
  const norm = (k: unknown) => String(k ?? "").replace(/\s+/g, "").toLowerCase();
  const cur = norm(sc.voice);
  if (cur !== "" && cur !== "ctrl+shift+v") return sc;
  if (Object.entries(sc).some(([a, k]) => a !== "voice" && norm(k) === "ctrl+shift+s")) return sc;
  (sc as Record<string, string>).voice = "Ctrl+Shift+S";
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
/**
 * Bir kerelik geçiş (themeReadV1): yazı ayarlarına hiç dokunmamış (eski varsayılanlarda kalmış) kurulumlar yeni,
 * daha okunaklı varsayılanlara geçer. Yazı tipini, boyutunu ya da kalınlığını kendisi değiştirmiş olana dokunulmaz.
 */
function themeReadMigrate(t: Theme, run: boolean): Theme {
  if (!run) return t;
  const o = OLD_TEXT_DEFAULTS;
  if (t.font !== o.font || t.fontSize !== o.fontSize || t.bold !== o.bold || t.weight !== o.weight) return t;
  return {
    ...t,
    font: DEFAULT_THEME.font,
    fontSize: DEFAULT_THEME.fontSize,
    weight: DEFAULT_THEME.weight,
    textShadow: t.textShadow === o.textShadow ? DEFAULT_THEME.textShadow : t.textShadow,
    dim: t.dim === o.dim ? DEFAULT_THEME.dim : t.dim,
  };
}

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
      // Bir kerelik geçiş (serverOnV1): web sunucusu varsayılan olarak açılır; kullanıcı sonra kapatırsa kapalı kalır
      server: { ...d.general.server, ...(s.general?.server ?? {}), ...(s.general?.serverOnV1 ? {} : { enabled: true }) },
      serverOnV1: true,
      themeReadV1: true,
      // Bir kerelik geçiş (demoMuteV1): Demo açılınca ses varsayılan olarak kapalıdır; kullanıcı açarsa seçimi hatırlanır
      demoMute: s.general?.demoMuteV1 ? (s.general?.demoMute ?? true) : true,
      demoMuteV1: true,
      shortcuts: voiceKeyMigrate(shotKeyMigrate({ ...d.general.shortcuts, ...(s.general?.shortcuts ?? {}) }, s.general?.shotKeyV3), s.general?.voiceKeyV1),
      voiceKeyV1: true,
      shotKeyV2: true,
      shotKeyV3: true,
      chatLook: { ...DEFAULT_CHAT_LOOK, ...(s.general?.chatLook ?? {}) },
      convBg: s.general?.convBg && typeof s.general.convBg === "object" ? s.general.convBg : {},
      appBg: { ...DEFAULT_APP_BG, ...(s.general?.appBg ?? {}) },
      screenshots: { ...d.general.screenshots, ...(s.general?.screenshots ?? {}) },
      editBackdrop: { ...d.general.editBackdrop, ...(s.general?.editBackdrop ?? {}) },
      // Yer başına ayrı arka plan: kayıtlı değeri yoksa eski tek ayar (bayrak + görsel) başlangıç değeri olur
      editBackdrops: Object.fromEntries(
        EDIT_BACKDROP_SLOTS.map((k) => [k, { ...d.general.editBackdrop, ...(s.general?.editBackdrop ?? {}), ...(s.general?.editBackdrops?.[k] ?? {}) }]),
      ) as Record<EditBackdropSlot, EditBackdrop>,
      eventsRecord: { ...d.general.eventsRecord, ...(s.general?.eventsRecord ?? {}) },
      // Mesaj almayı kapatma seçeneği kaldırıldı: her zaman açık
      social: { ...d.general.social, ...(s.general?.social ?? {}), acceptMessages: true },
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
      livechat: normalizeLiveChat(s.general?.livechat, s.general?.twitch?.channel, s.general?.language),
      remote: { ...d.general.remote, ...(s.general?.remote ?? {}) },
      engineer: { ...d.general.engineer, ...(s.general?.engineer ?? {}) },
      sharing: { ...d.general.sharing, ...(s.general?.sharing ?? {}) },
      voice: voiceMigrate({
        ...d.general.voice,
        ...(s.general?.voice ?? {}),
        sessions: { ...d.general.voice.sessions, ...(s.general?.voice?.sessions ?? {}) },
        // Bir kerelik geçiş (radioOffV1): telsiz kontrolü varsayılan olarak kapalı; kullanıcı sonra açarsa açık kalır
        categories: { ...d.general.voice.categories, ...(s.general?.voice?.categories ?? {}), ...(s.general?.voice?.radioOffV1 ? {} : { radio: false }) },
        radioOffV1: true,
        commands: { ...DEFAULT_VOICE_COMMANDS, ...(s.general?.voice?.commands ?? {}), ...(s.general?.voice?.commands?.onV1 ? {} : { enabled: true }), onV1: true },
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
    defaults: {},
    overlayOrder: Array.isArray(s.overlayOrder) ? [...new Set(s.overlayOrder.filter((x) => typeof x === "string"))] : [],
    // Eski kayıt: kendi sırasını vermiş olan onu korur, diğerleri "en çok kullanılan" ile başlar
    overlaySort: s.overlaySort && OVERLAY_SORTS.includes(s.overlaySort) ? s.overlaySort : Array.isArray(s.overlayOrder) && s.overlayOrder.length ? "custom" : "popular",
    theme: themeReadMigrate(normalizeTheme(s.theme), !!s.theme && !s.general?.themeReadV1),
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
    dashes: sanitizeDashes(s.dashes),
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
    if (typeof p?.order === "number" && isFinite(p.order)) prof.order = p.order;
    if (p?.locked === true) prof.locked = true;
    if (p?.isDefault === true) prof.isDefault = true;
    if (typeof p?.sharedId === "string" && p.sharedId) prof.sharedId = p.sharedId;
    if (p?.link && typeof p.link.source === "string" && p.link.source && prof.rules.mode === "stream")
      prof.link = { source: p.link.source, hidden: Array.isArray(p.link.hidden) ? p.link.hidden.filter((x) => typeof x === "string") : [] };
    // Kayıtlı kopyalar (anahtar: kopya kimliği; eski ayarlarda anahtar = overlay türü)
    for (const [key, saved] of Object.entries(p?.overlays ?? {})) {
      let cur = saved;
      const type = (cur as OverlayInstance)?.type || key;
      // Artık var olmayan türler (ör. kaldırılan eski "twitch" sohbet overlay'i) sessizce atılır
      if (!manifests.some((m) => m.id === type)) continue;
      const def = defaultInstance(type);
      if (type === "radar") {
        const bar = radarBarsMigrate(cur as OverlayInstance);
        if (bar) {
          const taken = (k: string) => !!prof.overlays[k] || !!(p?.overlays as Record<string, unknown>)?.[k];
          let bk = "spotterbar";
          for (let n = 2; taken(bk); n++) bk = `spotterbar#${n}`;
          prof.overlays[bk] = bar;
          // Ek radar kopyası tümüyle Çubuk Spotter'a dönüşür; ana kopya kapalı olarak radar görünümünde kalır
          if (key !== type) continue;
          cur = { ...cur, enabled: false };
        }
        if (cur?.options && RADAR_DROPPED.some((k) => k in cur.options)) {
          const options = { ...cur.options };
          for (const k of RADAR_DROPPED) delete options[k];
          cur = { ...cur, options };
        }
      }
      if (type === "inputs") {
        const mg = inputsPedalsMigrate(cur as OverlayInstance);
        if (mg?.move) {
          // Ana Pedal Seti kopyası boşsa o kullanılır; ek inputs kopyası tümüyle Pedal Seti'ne dönüşür,
          // ana inputs kopyası kapalı olarak varsayılan tasarımıyla kalır
          const taken = (k: string) => !!prof.overlays[k] || !!(p?.overlays as Record<string, unknown>)?.[k];
          let pk = "pedals";
          for (let n = 2; taken(pk); n++) pk = `pedals#${n}`;
          prof.overlays[pk] = mg.move;
          if (key !== type) continue;
          cur = { ...mg.reset, enabled: false };
        } else if (mg) cur = mg.reset;
      }
      const look = normalizeLook((cur as OverlayInstance)?.look);
      prof.overlays[key] = { ...def, ...cur, ...(look ? { look } : { look: undefined }), type, options: c63Migrate(type, cur?.options, mapMeMigrate(type, cur?.options, stFlairMigrate(type, cur?.options, relFlairMigrate(type, cur?.options, logoColMigrate(type, cur?.options, msgSrcMigrate(type, lcDefMigrate(type, cur?.options, { ...def.options, ...(cur?.options ?? {}) }))))))) };
    }
    // Her türün bir ana kopyası olsun (yeni eklenen overlay'ler otomatik gelir)
    for (const m of manifests) {
      if (!prof.overlays[m.id]) prof.overlays[m.id] = defaultInstance(m.id);
    }
    out.profiles[pid] = prof;
  }
  if (Object.keys(out.profiles).length === 0) out.profiles = d.profiles;
  ensureDefaultFlags(out);
  if (!out.profiles[out.activeProfile]) out.activeProfile = defaultProfileId(false, out) ?? Object.keys(out.profiles)[0];
  // Overlay varsayılanları. İlk geçişte (kayıtta yoksa) etkin düzendeki ayarlardan alınır: kullanıcının
  // o güne kadar Overlay'ler sayfasında yaptığı ayarlar kaybolmasın.
  const savedDef = s.defaults && typeof s.defaults === "object" ? (s.defaults as Record<string, Partial<OverlayInstance>>) : null;
  const seed = savedDef ? null : s.profiles && typeof s.profiles === "object" ? out.profiles[out.activeProfile] : null;
  for (const m of manifests) out.defaults[m.id] = defaultFrom(m.id, savedDef ? (m.id === "inputs" ? (inputsPedalsMigrate(savedDef[m.id])?.reset ?? savedDef[m.id]) : savedDef[m.id]) : seed?.overlays[m.id]);
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
  setDashList(s.dashes);
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
  }).catch((e) => console.error("Ayar değişiklikleri dinlenemedi (pencere izinlerde tanımlı mı?)", e));
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
/**
 * Hesapla taşınan küçük arayüz tercihi: [oku, yaz]. Değer ayarların içinde (general.uiPrefs) durur ve bulutla eşitlenir.
 * `legacy`: eskiden bu bilgisayarda (localStorage) tutulan anahtar; ayarlarda değer yokken oradan okunur.
 */
export function uiPref<T>(key: string, fallback: T, legacy?: string): [() => T, (v: T) => void] {
  const old = (): T | undefined => {
    if (!legacy) return undefined;
    try {
      const raw = localStorage.getItem(legacy);
      if (raw == null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch {
      return undefined;
    }
  };
  const get = (): T => {
    const v = settings().general.uiPrefs?.[key];
    return (v !== undefined ? (v as T) : old() ?? fallback) as T;
  };
  const set = (v: T) =>
    updateSettings((d) => {
      d.general.uiPrefs = { ...(d.general.uiPrefs ?? {}), [key]: v };
    });
  return [get, set];
}

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

/**
 * Varsayılan düzenin kimliği (stream: yayın düzenleri). İşaretli (isDefault) düzen; işaret yoksa eski sabit kimlik
 * ("default" / "stream-default"); o da yoksa listenin ilki.
 */
export function defaultProfileId(stream = false, s: Pick<AppSettings, "profiles"> = settings()): string | undefined {
  const group = Object.values(s.profiles)
    .filter((p) => (p.rules.mode === "stream") === stream)
    .map((p, i) => ({ p, k: p.order ?? 1e9 + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
  const legacy = stream ? "stream-default" : "default";
  return (group.find((p) => p.isDefault) ?? group.find((p) => p.id === legacy) ?? group[0])?.id;
}

/** Her türde (düzen / yayın düzeni) tam bir varsayılan işareti bırakır */
export function ensureDefaultFlags(d: Pick<AppSettings, "profiles">) {
  for (const stream of [false, true]) {
    const id = defaultProfileId(stream, d);
    for (const p of Object.values(d.profiles)) {
      if ((p.rules.mode === "stream") !== stream) continue;
      if (p.id === id) p.isDefault = true;
      else delete p.isDefault;
    }
  }
}

/** Düzeni kendi türünün varsayılanı yapar (öncekinin işareti kalkar) */
export function setDefaultProfile(id: string) {
  updateSettings((d) => {
    const me = d.profiles[id];
    if (!me) return;
    const stream = me.rules.mode === "stream";
    for (const p of Object.values(d.profiles)) if ((p.rules.mode === "stream") === stream) delete p.isDefault;
    me.isDefault = true;
  });
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
    if (profileId === DEFAULTS_ID) {
      if (d.defaults[id]) fn(d.defaults[id]);
      return;
    }
    const pid = profileId && d.profiles[profileId] ? profileId : d.activeProfile;
    const o = d.profiles[pid].overlays[id];
    if (o) fn(o);
  });
}

/**
 * Overlay'i düzene ekler: "Overlaylarım"daki varsayılan ayarlarla gelir. Tek kopyalı türlerde zaten ekliyse
 * var olanın anahtarını döner; çok kopyalı türlerde (veri kutusu, webview) yeni bir kopya açar.
 */
export function addToLayout(profileId: string, type: string, monitor = ""): string | null {
  const man = manifests.find((m) => m.id === type);
  if (!man) return null;
  let key: string | null = null;
  updateSettings((d) => {
    const p = d.profiles[profileId];
    if (!p) return;
    const def = d.defaults[type] ?? defaultInstance(type);
    const fresh = (): OverlayInstance => ({ ...structuredClone(def), type, name: "", enabled: true, addedAt: Date.now(), monitor, x: man.defaultPosition.x, y: man.defaultPosition.y });
    const base = p.overlays[type];
    if (!base || !base.enabled) {
      p.overlays[type] = fresh();
      key = type;
    } else if (man.multiInstance) {
      let n = 2;
      while (p.overlays[`${type}#${n}`]) n++;
      const count = Object.values(p.overlays).filter((o) => o.type === type && o.enabled).length;
      const inst = fresh();
      inst.x += 40 * count;
      inst.y += 40 * count;
      key = `${type}#${n}`;
      p.overlays[key] = inst;
    } else key = type;
  });
  return key;
}

/**
 * Kopyalanan overlay'leri düzene yapıştırır (ayarları ve görünümüyle). Düzende yoksa aynı yere; varsa ve overlay
 * birden çok kez eklenebiliyorsa `shift` px kaydırılmış yeni bir kopya olarak. Tek kopyalı olup düzende zaten
 * bulunanlar atlanır (`single`); `replace` verilirse (başka düzenden yapıştırma) kopyalananla değiştirilir.
 */
export function pasteInstances(profileId: string, list: OverlayInstance[], shift = 24, replace = false): { keys: string[]; single: number } {
  const keys: string[] = [];
  let single = 0;
  updateSettings((d) => {
    const p = d.profiles[profileId];
    if (!p) return;
    for (const src of list) {
      const man = manifests.find((m) => m.id === src.type);
      if (!man) continue;
      const inst: OverlayInstance = { ...structuredClone(src), name: "", enabled: true, addedAt: Date.now() };
      delete inst.locked;
      const base = p.overlays[src.type];
      let key = src.type;
      if (base && base.enabled) {
        if (!man.multiInstance) {
          // Başka düzenden yapıştırma: tek kopyalı overlay zaten varsa kopyalananla değiştirilir (kilitliyse dokunulmaz)
          if (!replace || base.locked) {
            single++;
            continue;
          }
          p.overlays[key] = inst;
          keys.push(key);
          continue;
        }
        let n = 2;
        while (p.overlays[`${src.type}#${n}`]) n++;
        key = `${src.type}#${n}`;
        inst.x += shift;
        inst.y += shift;
      }
      p.overlays[key] = inst;
      keys.push(key);
    }
  });
  return { keys, single };
}

/** Düzendeki kopyayı "Overlaylarım" varsayılanlarına döndürür (konum, monitör ve ad korunur) */
export function resetToDefaults(profileId: string, key: string) {
  updateSettings((d) => {
    const o = d.profiles[profileId]?.overlays[key];
    if (!o) return;
    const def = d.defaults[o.type] ?? defaultInstance(o.type);
    o.options = structuredClone(def.options);
    if (def.look) o.look = structuredClone(def.look);
    else delete o.look;
    o.scale = def.scale;
    o.opacity = def.opacity;
    if (typeof def.bgOpacity === "number") o.bgOpacity = def.bgOpacity;
    else delete o.bgOpacity;
    o.hideInGarage = def.hideInGarage;
    o.hideOnTrack = def.hideOnTrack;
    o.alwaysShow = def.alwaysShow;
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
      // Eşitlikte varsayılan düzen öne geçer
      if (sc > bestScore || (sc === bestScore && !!p.isDefault && !best?.isDefault)) {
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
