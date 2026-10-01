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

export interface VoiceSettings {
  enabled: boolean;
  /** CrewChief "Sounds" klasörü (boş: %LOCALAPPDATA%\\CrewChiefV4\\Sounds) */
  soundsDir: string;
  /** Mühendis ses paketi: "alt" altındaki klasör adı (boş: varsayılan ses) */
  pack: string;
  /** Spotter klasörü (voice altında, ör. spotter_Erkin) */
  spotter: string;
  volume: number;
  spotterVolume: number;
  /** Ovallerde sol/sağ yerine iç/dış de */
  ovalInsideOutside: boolean;
  categories: Record<string, boolean>;
}

export const VOICE_CATEGORIES: { id: string; name: string; desc: string }[] = [
  { id: "spotter", name: "Spotter", desc: "Solda/sağda araç, üç araç yan yana, temiz, hâlâ orada" },
  { id: "flags", name: "Bayraklar", desc: "Sarı, mavi, siyah, beyaz, yeşil" },
  { id: "race", name: "Yarış akışı", desc: "Start, son tur, iki tur kaldı, kalan süre, bitiş" },
  { id: "position", name: "Pozisyon", desc: "Tur sonunda sıran, sıra kazanma/kaybetme" },
  { id: "fuel", name: "Yakıt", desc: "Kalan tur yakıtı, yarı mesafede yakıt durumu, bitmek üzere" },
  { id: "pit", name: "Pit", desc: "Pit penceresi açıldı/kapanıyor" },
  { id: "laptimes", name: "Tur süreleri", desc: "Kişisel rekor, sınıfın en hızlısı" },
  { id: "gaps", name: "Aralar", desc: "Öndeki/arkadaki ile aranın açılıp kapanması" },
  { id: "multiclass", name: "Çok sınıf", desc: "Arkadan daha hızlı sınıf geliyor" },
  { id: "incidents", name: "Olay puanı", desc: "Olay puanın arttığında" },
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
  shortcuts: { edit: string; hide: string; panel: string; shot: string };
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
  returnFocus: boolean;
  timeFormat: "24" | "12";
  /** Arayüz dili (ör. "tr", "en", "pt-BR") */
  language: string;
  speedMph: boolean;
  /** Panelleri opak çiz */
  opaque: boolean;
  perf: { telemetryHz: number; inputHz: number; reduceEffects: boolean };
  display: { disableGpu: boolean; disableGpuCompositing: boolean };
  twitch: { channel: string };
  remote: { enabled: boolean; host: string; port: number };
  engineer: { screens: string[]; cycleSec: number };
  sharing: { summaries: boolean; keepSessions: number };
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
    alwaysShow: false,
    x: m.defaultPosition.x,
    y: m.defaultPosition.y,
    scale: 1,
    opacity: 1,
    options: defaultOptions(m),
  };
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
      shortcuts: { edit: "Ctrl+Shift+E", hide: "Ctrl+Shift+D", panel: "Ctrl+Shift+Space", shot: "PrintScreen" },
      allowDuplicates: false,
      demoMute: false,
      social: { dnd: false, acceptMessages: true, sound: true },
      screenshots: { includeOverlays: true, onlyInGame: true, format: "jpg", quality: 92 },
      editBackdrop: { enabled: true, opacity: 100, rev: 0, has: false },
      minimizeOnConnect: false,
      eventsAutoOpen: true,
      returnFocus: true,
      timeFormat: "24",
      language: detectLang(),
      speedMph: false,
      opaque: false,
      perf: { telemetryHz: 60, inputHz: 60, reduceEffects: false },
      display: { disableGpu: false, disableGpuCompositing: false },
      twitch: { channel: "" },
      remote: { enabled: false, host: "", port: 8910 },
      engineer: { screens: ["standings", "relative", "fuel", "battle", "laps", "weather", "session", "inputs"], cycleSec: 10 },
      sharing: { summaries: true, keepSessions: 200 },
      voice: {
        enabled: false,
        soundsDir: "",
        pack: "",
        spotter: "",
        volume: 80,
        spotterVolume: 100,
        ovalInsideOutside: false,
        categories: Object.fromEntries(VOICE_CATEGORIES.map((c) => [c.id, true])),
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
      shortcuts: { ...d.general.shortcuts, ...(s.general?.shortcuts ?? {}) },
      screenshots: { ...d.general.screenshots, ...(s.general?.screenshots ?? {}) },
      editBackdrop: { ...d.general.editBackdrop, ...(s.general?.editBackdrop ?? {}) },
      social: { ...d.general.social, ...(s.general?.social ?? {}) },
      perf: { ...d.general.perf, ...(s.general?.perf ?? {}) },
      display: { ...d.general.display, ...(s.general?.display ?? {}) },
      twitch: { ...d.general.twitch, ...(s.general?.twitch ?? {}) },
      remote: { ...d.general.remote, ...(s.general?.remote ?? {}) },
      engineer: { ...d.general.engineer, ...(s.general?.engineer ?? {}) },
      sharing: { ...d.general.sharing, ...(s.general?.sharing ?? {}) },
      voice: {
        ...d.general.voice,
        ...(s.general?.voice ?? {}),
        categories: { ...d.general.voice.categories, ...(s.general?.voice?.categories ?? {}) },
      },
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
      if (!manifests.some((m) => m.id === type)) continue;
      const def = defaultInstance(type);
      prof.overlays[key] = { ...def, ...cur, type, options: { ...def.options, ...(cur?.options ?? {}) } };
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
