// PRO özellikleri kataloğu ve yöneticinin kararları.
//
// Her PRO'ya bağlanabilecek özelliğin bir anahtarı var (ör. "community.share.shots"). Varsayılanı (defaultPro)
// bugünkü davranıştır; yönetici Yönetim › PRO özellikleri bölümünden bir özelliği "PRO" ya da "Herkese açık"
// yapabilir (sunucu: pro_features tablosu, pro_features_map() RPC'si). Karar yoksa varsayılan geçerli.
//
// Overlay'ler (manifestlerden otomatik toplanır, yeni overlay / ayar / seçenek kendiliğinden listeye girer):
//   overlay.<overlayId>                         → overlay'in tamamı (saklama: app_config.pro_overlays; Rust da bunu görür)
//   overlay.<overlayId>.<ayarAnahtarı>          → ayarın tamamı (anahtar / sayı / renk / metin / resim / liste):
//                                                 PRO değilse ayar varsayılan değerinde kilitli
//   overlay.<overlayId>.<ayarAnahtarı>.<değer>  → seçim alanının tek seçeneği (manifestte `pro: true` → varsayılan PRO)
//
// Kullanım: proLocked(key) → bu özellik PRO'ya ayrılmış VE kullanıcı PRO değil (kilitli göster).
// Karar listesi localStorage'da saklanır (çevrimdışı da geçerli); diğer pencereler "storage" olayıyla güncellenir.

import { createSignal } from "solid-js";
import { config, isPro, saveConfig, syncVoiceLock } from "@/cloud/account";
import { api, cloudEnabled } from "@/cloud/supabase";
import { manifests } from "./registry";
import type { SelectOption, SettingField } from "./overlay";

export type ProGroup = "Paylaşım" | "Topluluk" | "Sosyal" | "Takımlar" | "Telemetri" | "Görünüm" | "Ses" | "Araçlar" | "Canlı Sohbet" | "Overlay'ler";

export type ProKind = "feature" | "overlay" | "setting" | "option";

export interface ProFeature {
  key: string;
  /** Türkçe ad */
  label: string;
  group: ProGroup | string;
  /** Alt başlık (ör. overlay adı) */
  sub?: string;
  /** İkinci alt başlık (ör. seçim alanının adı; satır bir seçenekse) */
  sub2?: string;
  /** Yönetici karar vermediyse PRO mu (bugünkü davranış) */
  defaultPro: boolean;
  /** Sunucu da denetliyor mu (yönetici paneli bilgi olarak gösterir) */
  server?: boolean;
  /** Kısa açıklama (yönetici paneli) */
  hint?: string;
  kind?: ProKind;
  /** Aynı ayarın başka bir gruptaki kopyası (sunucu kataloğuna yazılmaz) */
  alias?: boolean;
}

/** Sesli mühendis özelliğinin anahtarı. Rust tarafı bunu entitlement "locked" listesindeki "voice" ile görür
 *  (bkz. cloud/account.ts withVoiceLock). */
export const VOICE_FEATURE = "voice.engineer";

/** Uygulama özelliklerinin anahtarları (kodda yazım hatasını önlemek için) */
export const F = {
  friendAdd: "social.friend_add",
  messages: "social.messages",
  msgTts: "social.messages_tts",
  friendLook: "social.friend_look",
  dataShare: "social.data_share",
  chatBg: "social.chat_bg",
  avatar: "social.avatar",
  profilePublic: "social.profile_public",
  crew: "social.crew",
  teamCreate: "teams.create",
  teamJoin: "teams.join",
  teamChat: "teams.chat",
  teamPoll: "teams.poll",
  teamPost: "teams.post",
  teleRecord: "telemetry.record",
  teleOthers: "telemetry.others",
  teleCompare: "telemetry.compare",
  teleBoard: "telemetry.leaderboard",
  appBg: "appearance.app_bg",
  chatLook: "appearance.chat_look",
  themes: "appearance.themes",
  overlayLook: "appearance.overlay_look",
  voice: VOICE_FEATURE,
  voicePackSubmit: "voice.pack_submit",
  voiceCommands: "voice.commands",
  shots: "tools.screenshots",
  streaming: "tools.streaming",
  league: "tools.league",
  pitwall: "tools.pitwall",
  timing: "tools.timing",
  engineer: "tools.engineer",
  events: "tools.events",
  dashDesigner: "dashboard.designer",
  dashRemote: "dashboard.remote",
  liveMulti: "livechat.multi",
  liveFav: "livechat.favorites",
  livePoll: "livechat.poll",
  liveObs: "livechat.obs",
  liveTts: "livechat.tts",
  liveStt: "livechat.stt",
  liveSend: "livechat.send",
  liveAlerts: "livechat.alerts",
  liveLog: "livechat.log",
} as const;

/** Rust'ın da denetlediği Canlı Sohbet anahtarları: PRO'ya ayrılmışsa entitlement "locked" listesine aynı adla girer
 *  (bkz. cloud/account.ts withVoiceLock, src-tauri/src/livechat/mod.rs allowed). Varsayılanları aşağıdaki katalogda. */
export const LIVECHAT_LOCK_KEYS = [F.liveMulti, F.liveFav, F.livePoll, F.liveObs, F.liveTts, F.liveStt, F.liveSend, F.liveAlerts, F.liveLog] as const;
/** Rust'ın denetlediği diğer anahtarlar (aynı adla "locked" listesine girer): Mesajlar overlay'inde sesli okuma (livechat/tts.rs) */
export const RUST_LOCK_KEYS = [F.msgTts, F.voiceCommands, F.dashRemote] as const;

/** Elle tanımlı özellikler (overlay'ler aşağıda manifestlerden toplanır) */
const STATIC: ProFeature[] = [
  // Paylaşım
  { key: "community.share.shots", label: "Ekran görüntüsünü toplulukta paylaşmak", group: "Paylaşım", defaultPro: true, server: true },
  { key: "community.share.themes", label: "Temayı toplulukta paylaşmak", group: "Paylaşım", defaultPro: true, server: true },
  { key: "community.share.layouts", label: "Düzeni toplulukta paylaşmak", group: "Paylaşım", defaultPro: false, server: true },
  { key: "community.share.streams", label: "Yayın düzenini toplulukta paylaşmak", group: "Paylaşım", defaultPro: false, server: true },
  // Topluluk
  { key: "community.layouts.use", label: "Topluluk düzenini kullanmak (indirmek)", group: "Topluluk", defaultPro: false },
  { key: "community.layouts.rate", label: "Düzenlere puan vermek", group: "Topluluk", defaultPro: false, server: true },
  { key: "community.layouts.comment", label: "Düzenlere yorum yazmak", group: "Topluluk", defaultPro: false, server: true },
  { key: "community.themes.use", label: "Topluluk temasını kullanmak", group: "Topluluk", defaultPro: false },
  // Sosyal
  { key: F.friendAdd, label: "Arkadaş eklemek (arkadaşlık isteği göndermek)", group: "Sosyal", defaultPro: false, server: true, hint: "Gelen istekleri kabul etmek her zaman açık" },
  { key: F.messages, label: "Özel mesajlaşma (arkadaşa mesaj göndermek)", group: "Sosyal", defaultPro: false, server: true, hint: "Gelen mesajları okumak her zaman açık" },
  { key: F.friendLook, label: "Arkadaş görünümünü özelleştirmek (renk, simge, fotoğraf, etiket)", group: "Sosyal", defaultPro: true },
  { key: F.dataShare, label: "Canlı veri paylaşımı (arkadaşı güvenilir işaretleyip verilerini göndermek)", group: "Sosyal", defaultPro: true, server: true },
  { key: F.chatBg, label: "Sohbet arka planı önermek (arkadaşla ortak arka plan)", group: "Sosyal", defaultPro: false, server: true },
  { key: F.msgTts, label: "Mesajlar overlay'inde mesajları sesli okuma", group: "Sosyal", defaultPro: true, hint: "Rust da denetler · arkadaş / takım / grup mesajları; canlı sohbet okumasıyla aynı sırayı kullanır" },
  { key: F.crew, label: "Ekip: arkadaşların pit ayarlarını uzaktan değiştirmesi (izlemek ücretsiz)", group: "Sosyal", defaultPro: true, server: true, hint: "Değiştirme yetkisi veren sürücü PRO olmalı; ekip üyesi olmak ve izlemek ücretsiz" },
  { key: "overlay.messages", label: "Mesajlar overlay'i (overlay'in tamamı)", group: "Sosyal", defaultPro: false, kind: "overlay", alias: true, hint: "Overlay'ler › Mesajlar ile aynı ayar" },
  { key: F.avatar, label: "Profil fotoğrafı yüklemek", group: "Sosyal", defaultPro: false, server: true, hint: "Fotoğrafı kaldırmak her zaman açık" },
  { key: F.profilePublic, label: "Profil tanıtımı ve sosyal bağlantılar", group: "Sosyal", defaultPro: false, server: true, hint: "Hepsini silmek her zaman açık" },
  // Takımlar
  { key: F.teamCreate, label: "Takım kurmak", group: "Takımlar", defaultPro: false, server: true },
  { key: F.teamJoin, label: "Takıma katılmak (istek göndermek, daveti kabul etmek)", group: "Takımlar", defaultPro: false, server: true },
  { key: F.teamChat, label: "Takım sohbetine yazmak", group: "Takımlar", defaultPro: false, server: true, hint: "Okumak her zaman açık" },
  { key: F.teamPoll, label: "Takımda anket oluşturmak", group: "Takımlar", defaultPro: false, server: true, hint: "Oy vermek her zaman açık" },
  { key: F.teamPost, label: "Takım duyurusu yazmak", group: "Takımlar", defaultPro: false, server: true },
  // Telemetri
  { key: F.teleRecord, label: "Telemetri kaydını buluta yüklemek", group: "Telemetri", defaultPro: false, server: true, hint: "Kapalıyken turlar bilgisayarda bekler, PRO olunca yüklenir" },
  { key: F.teleOthers, label: "Başkalarının telemetrisini görmek (Yarışçılar, takım arkadaşları)", group: "Telemetri", defaultPro: false, server: true },
  { key: F.teleCompare, label: "Tur karşılaştırma (iki turun izleri ve fark)", group: "Telemetri", defaultPro: false },
  { key: F.teleBoard, label: "Pist / araç sıralaması (lider tablosu)", group: "Telemetri", defaultPro: false },
  // Görünüm
  { key: F.themes, label: "Tema düzenlemek (renkler, yazı tipi, kenarlık, gölge)", group: "Görünüm", defaultPro: false },
  { key: F.appBg, label: "Uygulama arka planı (resim / renk)", group: "Görünüm", defaultPro: false },
  { key: F.chatLook, label: "Sohbet görünümü (balonlar ve sohbet arka planı)", group: "Görünüm", defaultPro: false },
  { key: F.overlayLook, label: "Overlay'e özel görünüm: gelişmiş seçenekler (yazı tipi, kenarlık, gölge, yoğunluk, hazır görünümler)", group: "Görünüm", defaultPro: false, hint: "Arka plan, yazı ve vurgu rengi, köşe ve yazı boyutu her zaman açık" },
  // Ses
  { key: VOICE_FEATURE, label: "Sesli mühendis ve spotter", group: "Ses", defaultPro: true },
  { key: F.voiceCommands, label: "Sesli komut (bas-konuş: mühendise sesle soru sormak)", group: "Ses", defaultPro: true, hint: "Rust da denetler · sesli mühendis de açık olmalı" },
  { key: F.voicePackSubmit, label: "Ses paketi göndermek (kendi kaydını paylaşmak)", group: "Ses", defaultPro: false, server: true },
  // Araçlar
  { key: F.shots, label: "Ekran görüntüsü almak", group: "Araçlar", defaultPro: false },
  { key: F.streaming, label: "Yayın düzenleri (OBS) sayfası", group: "Araçlar", defaultPro: false },
  { key: F.league, label: "Lig kategorileri (League Builder)", group: "Araçlar", defaultPro: false },
  { key: F.pitwall, label: "Pitwall Paneli penceresi", group: "Araçlar", defaultPro: false },
  { key: F.timing, label: "Live Timing penceresi", group: "Araçlar", defaultPro: false },
  { key: F.engineer, label: "Mühendis Ekranı penceresi", group: "Araçlar", defaultPro: false },
  { key: F.events, label: "Olaylar penceresi", group: "Araçlar", defaultPro: false },
  { key: F.dashDesigner, label: "Dashboard tasarımcısı (Direksiyon Ekranı için kendi tasarımını yapmak)", group: "Araçlar", defaultPro: true, hint: "Tasarımı overlay'de kullanmak ayrıca: Overlay'ler › Direksiyon Ekranı › Görünüm › Özel tasarım" },
  { key: F.dashRemote, label: "Uzak gösterge (direksiyon ekranını telefon / tabletten açmak: /dash)", group: "Araçlar", defaultPro: true, hint: "Rust da denetler · yerel web sunucusundaki /dash sayfası ve verisi" },
  // Canlı Sohbet (tek kanal okuma, moderasyon, görünüm ve kayıt tutmak herkese açık). Giriş zorunluluğu ve sekme gizleme
  // PRO kararı değildir: Yönetim › Canlı Sohbet ayarları (app_config.livechat_require_login / livechat_hidden_tabs).
  { key: F.liveMulti, label: "Birden fazla kanal (ücretsiz: yalnızca en üstteki kanalın sohbeti ve izleyici sayısı)", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler · kanal eklemek her zaman açık; PRO değilse sadece en üstteki kanal bağlanır" },
  { key: F.liveFav, label: "Favori kanallar ve izleyici sayıları (★, platform başına bir tane)", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler · PRO değilse ★ işaretlenemez, favorilerin izleyici sayısı gösterilmez" },
  { key: F.livePoll, label: "Sohbet anketi", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler · anket başlatmak (düğme ve kısayol)" },
  { key: F.liveObs, label: "OBS tarayıcı kaynağı (sohbet, anket, altyazı sayfaları)", group: "Canlı Sohbet", defaultPro: false, hint: "Rust da denetler" },
  { key: F.liveTts, label: "Sohbeti sesli okuma (TTS)", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler" },
  { key: F.liveStt, label: "Konuşmayı yazıya çevirme (altyazı)", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler" },
  { key: F.liveSend, label: "Sohbete yazma (Twitch / Kick / YouTube)", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler" },
  { key: F.liveAlerts, label: "Streamlabs uyarıları", group: "Canlı Sohbet", defaultPro: false, hint: "Rust da denetler" },
  { key: F.liveLog, label: "Sohbet kaydını görüntüleme (arama, süzme, dışa aktarma)", group: "Canlı Sohbet", defaultPro: true, hint: "Rust da denetler · kayıt tutmak ve silmek her zaman açık" },
];

const KEY_RE = /^[A-Za-z0-9_.:-]{1,200}$/;

/** Overlay'in tamamının anahtarı (saklama: app_config.pro_overlays) */
export const overlayKey = (overlayId: string) => `overlay.${overlayId}`;
/** Overlay ayarının tamamının anahtarı */
export const settingKeyOf = (overlayId: string, settingKey: string) => `overlay.${overlayId}.${settingKey}`;
/** Overlay seçim seçeneğinin anahtarı */
export const optionKey = (overlayId: string, settingKey: string, value: string) => `overlay.${overlayId}.${settingKey}.${value}`;
/** Bu anahtar overlay'in tamamı mı (pro_features'ta değil, app_config.pro_overlays'te saklanır) */
export const isOverlayKey = (key: string) => /^overlay\.[^.]+$/.test(key);

const TYPE_HINT: Record<string, string> = {
  boolean: "Bu anahtarı değiştirmek",
  number: "Bu değeri değiştirmek",
  color: "Bu rengi değiştirmek",
  text: "Bu metni değiştirmek",
  image: "Resim seçmek",
  multi: "Bu seçimi değiştirmek",
  order: "Bu listeyi değiştirmek",
};

const fieldLabel = (f: SettingField) => (f.group ? `${f.label} (${f.group})` : f.label);

let manifestCache: ProFeature[] | null = null;
function manifestFeatures(): ProFeature[] {
  if (manifestCache) return manifestCache;
  const out: ProFeature[] = [];
  for (const m of manifests) {
    out.push({ key: overlayKey(m.id), label: "Overlay'in kendisi", group: "Overlay'ler", sub: m.name, defaultPro: false, kind: "overlay", hint: "PRO değilse overlay açılamaz, ekranda görünmez" });
    for (const f of m.settings) {
      if (f.dynamic) continue;
      if (f.type === "select") {
        for (const o of f.options) {
          const key = optionKey(m.id, f.key, o.value);
          if (!KEY_RE.test(key)) continue;
          out.push({ key, label: o.label, group: "Overlay'ler", sub: m.name, sub2: fieldLabel(f), defaultPro: !!o.pro, kind: "option" });
        }
        continue;
      }
      const key = settingKeyOf(m.id, f.key);
      if (!KEY_RE.test(key)) continue;
      out.push({
        key,
        label: fieldLabel(f),
        group: "Overlay'ler",
        sub: m.name,
        defaultPro: false,
        kind: "setting",
        hint: `${TYPE_HINT[f.type] ?? "Değiştirmek"} PRO gerektirsin (PRO değilse varsayılanda kalır)`,
      });
    }
  }
  manifestCache = out;
  return out;
}

/** Tüm katalog: elle tanımlılar + overlay'ler (kendisi, ayarları, seçenekleri) */
export function proFeatureCatalog(): ProFeature[] {
  return [...STATIC, ...manifestFeatures()];
}

const DEFAULTS = (): Map<string, boolean> => new Map(proFeatureCatalog().map((f) => [f.key, f.defaultPro]));
let defaultsCache: Map<string, boolean> | null = null;
const defaultOf = (key: string) => (defaultsCache ??= DEFAULTS()).get(key);

// ---------------------------------------------------------------------------
// Yöneticinin kararları
// ---------------------------------------------------------------------------

const CACHE_KEY = "pitwall.proFeatures";

function readCache(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

const [overrides, setOverrides] = createSignal<Record<string, boolean>>(typeof localStorage !== "undefined" ? readCache() : {});
/** Yöneticinin kararları {anahtar: pro} (karar yoksa anahtar yok) */
export { overrides as proOverrides };

function store(map: Record<string, boolean>) {
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(map ?? {})) if (typeof v === "boolean") clean[k] = v;
  // Rust'a giden kilitler (sesli mühendis, ekran görüntüsü kısayolu)
  const voiceChanged =
    overrides()[VOICE_FEATURE] !== clean[VOICE_FEATURE] ||
    overrides()[F.shots] !== clean[F.shots] ||
    LIVECHAT_LOCK_KEYS.some((k) => overrides()[k] !== clean[k]) ||
    RUST_LOCK_KEYS.some((k) => overrides()[k] !== clean[k]);
  setOverrides(clean);
  // Sesli mühendis kararı değişti: Rust tarafındaki kilidi de güncelle
  if (voiceChanged) queueMicrotask(() => void syncVoiceLock());
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(clean));
  } catch {
    /* depolama yok */
  }
}

/** Sunucudan güncel kararları al (giriş gerekmez) */
export async function loadProFeatures() {
  if (!cloudEnabled) return overrides();
  const m = await api<Record<string, boolean>>("POST", "rpc/pro_features_map", { body: {}, auth: "optional" });
  store(m ?? {});
  return overrides();
}

let started = false;
/**
 * Her pencerede bir kez: önbellekteki kararları kullan, başka pencerenin güncellemesini dinle.
 * fetch: true ise (ana pencere) açılışta, 5 dakikada bir ve pencere öne gelince sunucudan yenile.
 */
export function startProFeatures(fetch: boolean) {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== CACHE_KEY) return;
    try {
      const v = JSON.parse(e.newValue || "{}");
      setOverrides(v && typeof v === "object" ? v : {});
    } catch {
      /* bozuk */
    }
  });
  if (!fetch || !cloudEnabled) return;
  const refresh = () => loadProFeatures().catch(() => {});
  let last = 0;
  const maybe = () => {
    if (Date.now() - last < 60_000) return;
    last = Date.now();
    refresh();
  };
  maybe();
  setInterval(() => ((last = Date.now()), refresh()), 5 * 60_000);
  window.addEventListener("focus", maybe);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && maybe());
}

/**
 * Bu özellik PRO'ya ayrılmış mı. Sıra: yöneticinin kararı → katalogdaki varsayılan → verilen varsayılan → true.
 */
export function requiresPro(key: string, fallback?: boolean): boolean {
  if (isOverlayKey(key)) return (config()?.pro_overlays ?? []).includes(key.slice(8));
  const o = overrides()[key];
  if (typeof o === "boolean") return o;
  return defaultOf(key) ?? fallback ?? true;
}

/** Özellik PRO'ya ayrılmış ve kullanıcı PRO değil: kilitli göster / kullanma */
export const proLocked = (key: string, fallback?: boolean) => requiresPro(key, fallback) && !isPro();

/** Kilitliyse hata fırlatır (bulut çağrılarından önce; sunucu da ayrıca denetler). what: "Mesaj göndermek" gibi. */
export function assertFeature(key: string, what: string) {
  if (proLocked(key)) throw new Error(`${what} PRO üyelik gerektirir`);
}

/** Seçim seçeneği PRO'ya ayrılmış mı (overlayId yoksa manifestteki `pro` işareti) */
export function optionRequiresPro(overlayId: string | undefined, settingKey: string, o: SelectOption): boolean {
  if (!overlayId) return !!o.pro;
  const key = optionKey(overlayId, settingKey, o.lockAs ?? o.value);
  const ov = overrides()[key];
  if (typeof ov === "boolean") return ov;
  return !!o.pro;
}

/** Seçim seçeneği kullanıcı için kilitli mi */
export const optionLocked = (overlayId: string | undefined, settingKey: string, o: SelectOption) =>
  optionRequiresPro(overlayId, settingKey, o) && !isPro();

/** Kontrol paneli penceresinde overlay'ler sadece önizleme olarak çizilir: PRO tasarımlar da görünsün
 *  (kilit, ayarın kaydedilmesinde uygulanır). Gerçek overlay pencerelerinde kilit geçerlidir. */
let previewUnlocked = false;
export function unlockPreviews() {
  previewUnlocked = true;
}

/** Overlay ayarının tamamı (seçim alanı dışındakiler) PRO'ya ayrılmış mı */
export function settingRequiresPro(overlayId: string | undefined, f: SettingField): boolean {
  // Ayar bir uygulama özelliğine bağlıysa (ör. Mesajlar › sesli okuma) o özelliğin kararı da geçerli
  if (f.feature && requiresPro(f.feature)) return true;
  if (!overlayId || f.type === "select") return false;
  const ov = overrides()[settingKeyOf(overlayId, f.key)];
  return typeof ov === "boolean" ? ov : false;
}

/** Overlay ayarı kullanıcı için kilitli mi (varsayılan değerinde kalır) */
export const settingLocked = (overlayId: string | undefined, f: SettingField) => settingRequiresPro(overlayId, f) && !isPro();

const same = (a: unknown, b: unknown) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

/**
 * Overlay pencerelerinde çizimden önce: PRO olmayan kullanıcının kilitli ayarlarını varsayılana çevirir
 * (kilitli seçim seçeneği → varsayılan, o da kilitliyse ilk serbest seçenek; kilitli ayar → varsayılan).
 * Kontrol panelinde (unlockPreviews) ve PRO kullanıcıda dokunmaz. Değişiklik yoksa aynı nesneyi döner.
 */
export function sanitizeOverlayOptions<T extends Record<string, any>>(overlayId: string, opts: T): T {
  if (previewUnlocked || isPro() || !opts) return opts;
  const m = manifests.find((x) => x.id === overlayId);
  if (!m) return opts;
  const ov = overrides();
  let out: Record<string, any> | null = null;
  for (const f of m.settings) {
    const v = opts[f.key];
    if (v === undefined) continue;
    if (f.type === "select") {
      const o = f.options.find((x) => x.value === v);
      if (!o || !optionLocked(overlayId, f.key, o)) continue;
      const d = f.options.find((x) => x.value === f.default);
      const free = d && !optionLocked(overlayId, f.key, d) ? d : f.options.find((x) => !optionLocked(overlayId, f.key, x));
      (out ??= { ...opts })[f.key] = free?.value ?? f.default;
      continue;
    }
    if (ov[settingKeyOf(overlayId, f.key)] !== true && !(f.feature && requiresPro(f.feature))) continue;
    if (!same(v, f.default)) (out ??= { ...opts })[f.key] = f.default;
  }
  return (out as T) ?? opts;
}

/** Overlay çalışırken: bu değer (manifestteki seçeneğe göre) kullanıcı için kilitli mi */
export function overlayValueLocked(overlayId: string, settingKey: string, value: string): boolean {
  if (previewUnlocked) return false;
  const m = manifests.find((x) => x.id === overlayId);
  const f = m?.settings.find((x) => x.key === settingKey);
  const o = f?.type === "select" ? f.options.find((x) => x.value === value) : undefined;
  if (!o) {
    const ov = overrides()[optionKey(overlayId, settingKey, value)];
    return typeof ov === "boolean" ? ov && !isPro() : false;
  }
  return optionLocked(overlayId, settingKey, o);
}

// ---------------------------------------------------------------------------
// Yönetici
// ---------------------------------------------------------------------------

export interface AdminProFeatureRow {
  key: string;
  label: string;
  grp: string;
  default_pro: boolean;
  pro: boolean | null;
  updated_at: string | null;
  updated_by_name: string;
  in_catalog: boolean;
}

/** Programın kataloğunu sunucuya yaz (web sitesindeki yönetim paneli de görsün) */
export const adminSyncProCatalog = () =>
  api<number>("POST", "rpc/pro_feature_catalog_sync", {
    body: {
      p_items: proFeatureCatalog()
        .filter((f) => !f.alias)
        .map((f) => ({ key: f.key, label: [f.sub, f.sub2, f.label].filter(Boolean).join(" › "), group: f.group, default: f.defaultPro })),
    },
  });

export const adminProFeatures = () => api<AdminProFeatureRow[]>("POST", "rpc/pro_features_admin_list", { body: {} }).then((r) => r ?? []);

/** Overlay'lerin tamamı için kararlar: app_config.pro_overlays listesini günceller (Rust da bunu okur) */
async function setProOverlays(items: Record<string, boolean | null>) {
  const cur = new Set(config()?.pro_overlays ?? []);
  for (const [k, v] of Object.entries(items)) {
    const id = k.slice(8);
    if (v) cur.add(id);
    else cur.delete(id);
  }
  await saveConfig({ pro_overlays: [...cur] });
}

/** pro: null → varsayılana dön */
export async function adminSetProFeature(key: string, pro: boolean | null) {
  if (isOverlayKey(key)) return setProOverlays({ [key]: pro });
  await api("POST", "rpc/pro_feature_set", { body: { p_key: key, p_pro: pro } });
  const next = { ...overrides() };
  if (pro === null) delete next[key];
  else next[key] = pro;
  store(next);
}

export async function adminSetProFeatures(all: Record<string, boolean | null>) {
  const ovs: Record<string, boolean | null> = {};
  const items: Record<string, boolean | null> = {};
  for (const [k, v] of Object.entries(all)) (isOverlayKey(k) ? ovs : items)[k] = v;
  if (Object.keys(ovs).length) await setProOverlays(ovs);
  if (!Object.keys(items).length) return;
  await api("POST", "rpc/pro_feature_set_many", { body: { p_items: items } });
  const next = { ...overrides() };
  for (const [k, v] of Object.entries(items)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  store(next);
}
