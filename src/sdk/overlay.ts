import { createSignal, type Component } from "solid-js";
import type { TopicName } from "./types";

/** Alanı sadece başka bir ayar belirli değerdeyken göster */
export interface ShowIf {
  key: string;
  /** Bu değerlerden birine eşitse göster */
  is?: unknown[];
  /** Bu değerlerden birine eşitse gizle */
  not?: unknown[];
  /** `is` ile birlikte: değer (yazı) bu öneklerden biriyle başlıyorsa da göster (ör. "dash:" = kullanıcının tasarımı) */
  isPrefix?: string[];
  /** Değer (yazı) bu öneklerden biriyle başlıyorsa gizle */
  notPrefix?: string[];
}

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
  /** Ayar panelinde hangi başlık altında (boş: overlay adı) */
  group?: string;
  showIf?: ShowIf;
  /** Yalnızca yayın logosu izni olanlara (ücretli PRO / yönetici) gösterilen ayar */
  logoPerm?: boolean;
  /** Seçim alanı herkese görünür ama izni olmayan yalnızca varsayılan seçeneği kullanabilir */
  logoPermOpts?: boolean;
  /** Sadece PRO olmayan kullanıcılara gösterilen not (ör. "tasarımlar PRO'ya özel") */
  proHint?: string;
  /** Bu ayar bir PRO özelliğine bağlı (src/sdk/proFeatures.ts anahtarı, ör. "social.messages_tts"):
   *  özellik PRO'ya ayrılmışsa ve kullanıcı PRO değilse ayar varsayılan değerinde kilitli kalır */
  feature?: string;
  /** Alanın altında bir "sıfırla" düğmesi: bu anahtarlardaki ayarları varsayılanına döndürür (ör. renkler) */
  resetKeys?: string[];
  /** Sıfırlama düğmesinin yazısı */
  resetLabel?: string;
  /** Seçenekleri kullanıcı verisinden gelen alan (ör. kendi dashboard tasarımları): PRO kataloğuna girmez */
  dynamic?: boolean;
}

/** Seçim seçeneği; `pro` işaretliyse PRO olmayanlar seçemez */
export interface SelectOption {
  value: string;
  label: string;
  pro?: boolean;
  /** Kilit kuralı (PRO özellikleri kararı) bu seçenek değerininkiyle aynı; `optionsFrom` ile gelen seçenekler için */
  lockAs?: string;
}

/** Ayar panelinde otomatik form üretmek için alan tanımları. */
export type SettingField =
  | (FieldBase & { type: "boolean"; default: boolean })
  | (FieldBase & {
      type: "number";
      default: number;
      min: number;
      max: number;
      step?: number;
      unit?: string;
      /** "slider" (varsayılan) ya da "stepper" (- / + düğmeleri) */
      ui?: "slider" | "stepper";
    })
  | (FieldBase & {
      type: "select";
      default: string;
      options: SelectOption[];
      /** Kullanıcı verisinden gelen EK seçenekler (ör. kendi dashboard tasarımları): sabit seçeneklerin sonuna eklenir,
       *  PRO kataloğuna girmez. Ayar formu `selectOptions()` ile okur. */
      optionsFrom?: () => SelectOption[];
    })
  | (FieldBase & { type: "color"; default: string })
  | (FieldBase & { type: "text"; default: string; placeholder?: string })
  /** Diskten resim seçimi: küçültülüp (en fazla `maxSize` px, oran korunur) PNG data URL olarak saklanır; boş = yok */
  | (FieldBase & { type: "image"; default: string; maxSize?: number })
  /** Çoklu seçim (ör. başlık alanları); `max` en fazla seçim */
  | (FieldBase & { type: "multi"; default: string[]; options: { value: string; label: string }[]; max?: number })
  /** Sıralanabilir ve açılıp kapatılabilir liste (ör. sütunlar) */
  | (FieldBase & {
      type: "order";
      default: { key: string; on: boolean }[];
      options: { value: string; label: string }[];
      /** Sütun genişliği ayarı: `key` adlı seçenekte Record<sütun, px> saklanır (yoksa = varsayılan genişlik).
       * `start`: varsayılandan ilk kez değiştirilirken başlanacak yaklaşık px; `mins`: sütuna özel alt sınır. */
      widths?: { key: string; start: Record<string, number>; min?: number; max?: number; step?: number; mins?: Record<string, number> };
    });

export type OverlayCategory = "race" | "driving" | "info" | "stream";

export interface OverlayManifest {
  /** Klasör adıyla aynı olmalı. */
  id: string;
  name: string;
  description: string;
  category: OverlayCategory;
  /** Bu overlay'in ihtiyaç duyduğu veri konuları ve saniyedeki güncelleme sayısı. */
  topics: { name: TopicName; hz: number }[];
  /** Ölçek 1'deki yaklaşık boyut (düzenleme modunda çerçeve için). */
  size: { w: number; h: number };
  defaultPosition: { x: number; y: number };
  /** Ekrana eklenince hedef monitörün tam ortasına yerleşir (bkz. monitors.ts centerInstance); `defaultPosition` 1920×1080 için ortadır */
  defaultCenter?: boolean;
  defaultEnabled?: boolean;
  /** Overlay listelerinde (Overlay'ler sayfası, düzen paleti) hiç gösterilmez; var olan düzenlerdeki kopyalar çalışmaya devam eder */
  hidden?: boolean;
  /** Yeni kopyada "iRacing kapalıyken de göster" açık gelsin (ör. canlı sohbet) */
  defaultAlwaysShow?: boolean;
  /** Ayarlar → Genel'de "aynı overlay'den birden fazla" kapalı olsa bile birden çok kopya eklenebilir */
  multiInstance?: boolean;
  /** Ne zaman görüneceğine overlay kendisi karar verir (ör. Setup Örtüsü: garaj ekranı açıkken). Overlay penceresi ve
   *  OBS sayfası bu kopyaya "pist dışında gizle", "tekrar izlerken gizle", "pitteyken gizle" kurallarını UYGULAMAZ:
   *  sim bağlıyken çerçeve hep açıktır, içerik overlay'in kendi koşuluna göre çizilir. */
  ownVisibility?: boolean;
  /** false: tekrar (replay) ekranında çalışmaz — verisi yalnızca kullanıcı aracı kendisi sürerken gelir (pedal, vites,
   *  hız, lastik, hasar, delta…; iRacing bu değerleri tekrarda ya da takım arkadaşı sürerken izlenen araç için vermez).
   *  Bu overlay'lerde "Replay'de göster" seçeneği sunulmaz ve uygulanmaz. Yok = çalışır. */
  replay?: boolean;
  /** Tema arka planını kullanmayan overlay (kendi zemini / görseli var): genel "Arka plan opaklığı" kaydırıcısı gösterilmez */
  noBgOpacity?: boolean;
  /** Yeni kopyanın arka plan opaklığı çarpanı (0..1; yok = 1). Ayarlarda "Arka plan opaklığı" ile değiştirilir. */
  defaultBgOpacity?: number;
  /**
   * Düzenlemede pencere KENARLARINDAN sürükleyince değişecek ayar anahtarları (px cinsinden sayı alanları):
   * w = genişlik, h = yükseklik. Verilmezse "width" / "height" adlı px sayı alanları kendiliğinden kullanılır;
   * `false`: kenardan boyutlandırma yok. (Köşeler her zaman ölçeği değiştirir.)
   */
  resize?: {
    w?: string;
    /**
     * Yükseklik ayarı. Nesne biçimi SATIR sayan ayarlar içindir (px değil): `key` ayar anahtarı (ya da o anki ayarlara göre
     * seçen işlev), `row` satır yüksekliğinin ölçüleceği öğenin CSS seçicisi, `per` ayarın 1 artışında eklenen satır sayısı
     * (ör. önde+arkada = 2; işlevse overlay kökünden hesaplanır). Sürükleme tam satırlara oturur.
     */
    h?: string | { key: string | ((options: Record<string, any>) => string); row: string; per?: number | ((root: HTMLElement) => number) };
    /** w ayarı bir "en az genişlik": kenardan sürükleme ayar değerinden değil, ölçülen gerçek genişlikten başlar (ölü bölge olmaz) */
    wMin?: boolean;
  } | false;
  settings: SettingField[];
}

type NumField = Extract<SettingField, { type: "number" }>;
/** Kenardan boyutlandırılabilen genişlik / yükseklik ayar alanları (bkz. OverlayManifest.resize) */
export function resizeFields(m: OverlayManifest | undefined, options?: Record<string, any>): { w?: NumField; h?: NumField; rows?: { row: string; per?: number | ((root: HTMLElement) => number) } } {
  if (!m || m.resize === false) return {};
  const rh = m.resize?.h;
  if (rh && typeof rh === "object") {
    const key = typeof rh.key === "function" ? rh.key(options ?? {}) : rh.key;
    const f = m.settings.find((x) => x.key === key);
    const wk = m.resize ? m.resize.w : undefined;
    const w = m.settings.find((x) => x.key === (wk ?? "width"));
    return { w: w && w.type === "number" && (wk !== undefined || w.unit === "px") ? w : undefined, h: f && f.type === "number" ? f : undefined, rows: { row: rh.row, per: rh.per } };
  }
  const find = (key: string | undefined, auto: string) => {
    const f = m.settings.find((x) => x.key === (key ?? auto));
    return f && f.type === "number" && (key !== undefined || f.unit === "px") ? f : undefined;
  };
  return { w: find(m.resize?.w, "width"), h: find(typeof rh === "string" ? rh : undefined, "height") };
}

/**
 * Satır sayan yükseklik ayarı için kenar sürüklemesi: ölçülen satır yüksekliğiyle (ölçeksiz px) ayarın 1 artışının
 * kaç px ettiğini verir. `root` overlay'in çizildiği öğe.
 */
export function rowUnit(root: HTMLElement | undefined, rows: { row: string; per?: number | ((root: HTMLElement) => number) }): number {
  const h = (root?.querySelector(rows.row) as HTMLElement | null)?.offsetHeight || 28;
  const per = typeof rows.per === "function" ? (root ? rows.per(root) : 1) : (rows.per ?? 1);
  return h * Math.max(1, per);
}

/** Kenar sürüklemesinde ayar değerini alanın sınırlarına ve adımına oturtur */
export function clampField(f: NumField, v: number): number {
  const step = f.step || 1;
  return Math.min(f.max, Math.max(f.min, Math.round(v / step) * step));
}

export type Units = "metric" | "imperial";

export interface OverlayProps {
  /** Bu overlay'in ayarları (manifest.settings anahtarlarıyla). */
  options: Record<string, any>;
  units: Units;
  editing: boolean;
}

export type OverlayComponent = Component<OverlayProps>;

/**
 * Panel önizlemesi donduruldu: örnek veri bir süre oynar, sonra akış durur ve görüntü sabit kalır
 * (bkz. telemetry.ts useSnapshot). Kendi zamanlayıcısı / benzetimi olan overlay'ler bu doğruyken yeni içerik
 * üretmemeli. Ekrandaki gerçek overlay pencerelerinde her zaman yanlıştır.
 */
export const [previewFrozen, setPreviewFrozen] = createSignal(false);

/**
 * Overlay gerçek overlay penceresinde (ya da OBS sayfasında; Host) mı çiziliyor. Yanlış: kontrol panelinin içinde
 * (Overlay'ler sayfası önizlemesi, düzen tuvali). Host açılışta doğru yapar.
 */
export const [onScreen, setOnScreen] = createSignal(false);
/** Overlay penceresi düzenleme modunda mı (Host günceller; panelde her zaman yanlış) */
export const [screenEditing, setScreenEditing] = createSignal(false);

/** Manifest yazarken tip denetimi için yardımcı. */
export function defineOverlay(m: OverlayManifest): OverlayManifest {
  return m;
}

export function defaultOptions(m: OverlayManifest): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of m.settings) o[f.key] = f.default;
  return o;
}

/** Sıralı liste ayarının geçerli hali: kayıtlı sıra + sonradan eklenen seçenekler (kapalı). */
export function orderValue(
  field: { options: { value: string }[]; default: { key: string; on: boolean }[] },
  value: unknown,
): { key: string; on: boolean }[] {
  const saved = Array.isArray(value) ? (value as { key: string; on: boolean }[]) : field.default;
  const known = new Set(field.options.map((o) => o.value));
  const out = saved.filter((x) => known.has(x.key));
  for (const o of field.options) {
    if (!out.some((x) => x.key === o.value)) {
      const d = field.default.find((x) => x.key === o.value);
      out.push({ key: o.value, on: d?.on ?? false });
    }
  }
  return out;
}

/** Alan görünür mü (showIf) */
export function fieldVisible(f: { showIf?: ShowIf }, values: Record<string, unknown>) {
  const c = f.showIf;
  if (!c) return true;
  const v = values[c.key];
  const pre = (list?: string[]) => typeof v === "string" && !!list?.some((x) => v.startsWith(x));
  if (c.is && !c.is.includes(v) && !pre(c.isPrefix)) return false;
  if (c.not && c.not.includes(v)) return false;
  if (pre(c.notPrefix)) return false;
  return true;
}

/** Seçim alanının geçerli seçenekleri: sabit olanlar + kullanıcı verisinden gelenler (`optionsFrom`) */
export function selectOptions(f: { options: SelectOption[]; optionsFrom?: () => SelectOption[] }): SelectOption[] {
  const extra = f.optionsFrom?.();
  return extra?.length ? [...f.options, ...extra] : f.options;
}
