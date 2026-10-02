import { createSignal, type Component } from "solid-js";
import type { TopicName } from "./types";

/** Alanı sadece başka bir ayar belirli değerdeyken göster */
export interface ShowIf {
  key: string;
  /** Bu değerlerden birine eşitse göster */
  is?: unknown[];
  /** Bu değerlerden birine eşitse gizle */
  not?: unknown[];
}

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
  /** Ayar panelinde hangi başlık altında (boş: overlay adı) */
  group?: string;
  showIf?: ShowIf;
  /** Sadece PRO olmayan kullanıcılara gösterilen not (ör. "tasarımlar PRO'ya özel") */
  proHint?: string;
  /** Bu ayar bir PRO özelliğine bağlı (src/sdk/proFeatures.ts anahtarı, ör. "social.messages_tts"):
   *  özellik PRO'ya ayrılmışsa ve kullanıcı PRO değilse ayar varsayılan değerinde kilitli kalır */
  feature?: string;
}

/** Seçim seçeneği; `pro` işaretliyse PRO olmayanlar seçemez */
export interface SelectOption {
  value: string;
  label: string;
  pro?: boolean;
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
  | (FieldBase & { type: "select"; default: string; options: SelectOption[] })
  | (FieldBase & { type: "color"; default: string })
  | (FieldBase & { type: "text"; default: string; placeholder?: string })
  /** Diskten resim seçimi: küçültülüp (en fazla `maxSize` px, oran korunur) PNG data URL olarak saklanır; boş = yok */
  | (FieldBase & { type: "image"; default: string; maxSize?: number })
  /** Çoklu seçim (ör. başlık alanları); `max` en fazla seçim */
  | (FieldBase & { type: "multi"; default: string[]; options: { value: string; label: string }[]; max?: number })
  /** Sıralanabilir ve açılıp kapatılabilir liste (ör. sütunlar) */
  | (FieldBase & { type: "order"; default: { key: string; on: boolean }[]; options: { value: string; label: string }[] });

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
  defaultEnabled?: boolean;
  /** Yeni kopyada "iRacing kapalıyken de göster" açık gelsin (ör. canlı sohbet) */
  defaultAlwaysShow?: boolean;
  /** Ayarlar → Genel'de "aynı overlay'den birden fazla" kapalı olsa bile birden çok kopya eklenebilir */
  multiInstance?: boolean;
  settings: SettingField[];
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
  if (c.is && !c.is.includes(v)) return false;
  if (c.not && c.not.includes(v)) return false;
  return true;
}
