import type { Component } from "solid-js";
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
  | (FieldBase & { type: "select"; default: string; options: { value: string; label: string }[] })
  | (FieldBase & { type: "color"; default: string })
  | (FieldBase & { type: "text"; default: string; placeholder?: string })
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
