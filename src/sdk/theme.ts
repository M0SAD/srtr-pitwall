// Tema sistemi. Tüm overlay'ler renk, font, köşe vb. için sadece CSS değişkenlerini
// (--ov-*) kullanır. Tema değişince değişkenler overlay kökünde güncellenir ve
// her overlay aynı anda yeni görünüme geçer; overlay kodunda değişiklik gerekmez.

import type { SettingField } from "./overlay";

export type Density = "compact" | "normal" | "comfortable";

export interface Theme {
  preset: string;
  font: string;
  numFont: string;
  fontSize: number;
  bold: boolean;
  text: string;
  dim: string;
  bg: string;
  bgOpacity: number;
  border: boolean;
  borderColor: string;
  borderOpacity: number;
  radius: number;
  accent: string;
  positive: string;
  negative: string;
  warning: string;
  info: string;
  best: string;
  highlight: string;
  highlightOpacity: number;
  density: Density;
  textShadow: boolean;
  /** Tüm overlay'lerin boyut çarpanı (%). Overlay'in kendi boyutuyla çarpılır. */
  scale: number;
  /** Tüm overlay'ler için opaklık tavanı (%). Etkin opaklık = min(overlay, genel). */
  opacity: number;
  /** Yazı kalınlığı (300..700); 0 = "Kalın yazı" ayarına göre */
  weight: number;
  /** Lisans/SR ve iRating tek rozette */
  combineLicense: boolean;
}

// ---- Fontlar ----
// Windows sistem fontları + uygulamayla gelen fontlar (src/host/fonts.ts).
export function fontStack(id: string): string {
  return FONT_STACK[id] ?? FONT_STACK.segoe;
}

export const FONTS: { value: string; label: string }[] = [
  { value: "segoe", label: "Segoe UI (Windows)" },
  { value: "bahnschrift", label: "Bahnschrift (Windows, DIN)" },
  { value: "inter", label: "Inter" },
  { value: "rajdhani", label: "Rajdhani" },
  { value: "barlow", label: "Barlow Condensed" },
  { value: "roboto-mono", label: "Roboto Mono" },
];

export const NUM_FONTS: { value: string; label: string }[] = [
  { value: "same", label: "Yazı fontuyla aynı" },
  { value: "jetbrains", label: "JetBrains Mono" },
  { value: "roboto-mono", label: "Roboto Mono" },
  { value: "consolas", label: "Consolas (Windows)" },
];

const FONT_STACK: Record<string, string> = {
  segoe: `"Segoe UI", system-ui, sans-serif`,
  bahnschrift: `Bahnschrift, "DIN Alternate", "Segoe UI", sans-serif`,
  inter: `"Inter Variable", Inter, "Segoe UI", sans-serif`,
  rajdhani: `Rajdhani, "Segoe UI", sans-serif`,
  barlow: `"Barlow Condensed", "Segoe UI", sans-serif`,
  "roboto-mono": `"Roboto Mono Variable", "Roboto Mono", Consolas, monospace`,
  jetbrains: `"JetBrains Mono Variable", "JetBrains Mono", Consolas, monospace`,
  consolas: `Consolas, "Cascadia Mono", ui-monospace, monospace`,
};

// ---- Hazır temalar ----

/** 031026-83'ten önceki varsayılan yazı ayarları (bir kerelik geçiş için: bkz. settings.ts themeReadV1) */
export const OLD_TEXT_DEFAULTS = { font: "segoe", fontSize: 13, bold: false, textShadow: false, weight: 0, dim: "#8d95a5" } as const;

export const DEFAULT_THEME: Theme = {
  preset: "default",
  font: "inter",
  numFont: "same",
  fontSize: 14,
  bold: false,
  text: "#eef1f6",
  dim: "#a3abba",
  bg: "#0c0e13",
  bgOpacity: 86,
  border: true,
  borderColor: "#ffffff",
  borderOpacity: 8,
  radius: 8,
  accent: "#ff8a2a",
  positive: "#33d17a",
  negative: "#ff4d4f",
  warning: "#ffcc33",
  info: "#4aa8ff",
  best: "#b76cff",
  highlight: "#ffc440",
  highlightOpacity: 20,
  density: "normal",
  textShadow: true,
  scale: 100,
  opacity: 100,
  weight: 500,
  combineLicense: false,
};

type Preset = { id: string; name: string; theme: Partial<Theme> };

export const PRESETS: Preset[] = [
  { id: "default", name: "Varsayılan", theme: {} },
  {
    id: "midnight",
    name: "Gece Mavisi",
    theme: {
      bg: "#0a1428",
      bgOpacity: 88,
      text: "#e6f0ff",
      dim: "#7f93b5",
      accent: "#2ec5ff",
      highlight: "#2ec5ff",
      highlightOpacity: 18,
      borderColor: "#2ec5ff",
      borderOpacity: 18,
      font: "inter",
      radius: 10,
    },
  },
  {
    id: "carbon",
    name: "Karbon",
    theme: {
      bg: "#000000",
      bgOpacity: 80,
      text: "#f2f2f2",
      dim: "#9a9a9a",
      accent: "#e10600",
      highlight: "#e10600",
      highlightOpacity: 28,
      border: false,
      radius: 2,
      font: "bahnschrift",
      numFont: "same",
      density: "compact",
    },
  },
  {
    id: "light",
    name: "Açık",
    theme: {
      bg: "#f7f8fa",
      bgOpacity: 94,
      text: "#14171f",
      dim: "#5d6575",
      accent: "#e8590c",
      highlight: "#ffb020",
      highlightOpacity: 30,
      borderColor: "#000000",
      borderOpacity: 12,
      positive: "#12944a",
      negative: "#d6272c",
      warning: "#b98300",
      info: "#1c6fd6",
      best: "#8a3ffc",
    },
  },
  {
    id: "contrast",
    name: "Yüksek Kontrast",
    theme: {
      bg: "#000000",
      bgOpacity: 100,
      text: "#ffffff",
      dim: "#c8c8c8",
      accent: "#ffe600",
      highlight: "#ffe600",
      highlightOpacity: 30,
      borderColor: "#ffffff",
      borderOpacity: 40,
      bold: true,
      weight: 0,
      fontSize: 14,
      textShadow: false,
    },
  },
  {
    id: "neon",
    name: "Neon",
    theme: {
      bg: "#12061f",
      bgOpacity: 82,
      text: "#f5e9ff",
      dim: "#a58fc2",
      accent: "#ff2bd6",
      highlight: "#ff2bd6",
      highlightOpacity: 22,
      borderColor: "#00f0ff",
      borderOpacity: 30,
      positive: "#00ffa3",
      negative: "#ff3864",
      info: "#00f0ff",
      font: "rajdhani",
      bold: true,
      weight: 0,
      fontSize: 14,
      radius: 12,
    },
  },
];

export function presetTheme(id: string): Theme {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { ...DEFAULT_THEME, ...p.theme, preset: p.id };
}

/** Tema bir hazır temayla birebir aynı mı? (Değilse "Özel" gösterilir.) */
export function matchesPreset(t: Theme): boolean {
  const p = presetTheme(t.preset);
  return (Object.keys(DEFAULT_THEME) as (keyof Theme)[]).every(
    (k) => k === "scale" || k === "opacity" || k === "combineLicense" || p[k] === t[k],
  );
}

export function normalizeTheme(input: unknown): Theme {
  const t = (input && typeof input === "object" ? input : {}) as Partial<Theme>;
  const out = { ...DEFAULT_THEME } as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_THEME)) {
    const v = (t as Record<string, unknown>)[k];
    if (v !== undefined && typeof v === typeof (DEFAULT_THEME as unknown as Record<string, unknown>)[k]) out[k] = v;
  }
  return out as unknown as Theme;
}

// ---- CSS değişkenleri ----

function rgba(hex: string, alphaPct: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(100, alphaPct)) / 100})`;
}

const ROW_H: Record<Density, number> = { compact: 22, normal: 26, comfortable: 30 };

/** Temayı overlay kökünde kullanılacak CSS değişkenlerine çevirir. */
export function themeVars(t: Theme): Record<string, string> {
  const font = FONT_STACK[t.font] ?? FONT_STACK.segoe;
  return {
    "--ov-font": font,
    "--ov-mono": t.numFont === "same" ? font : FONT_STACK[t.numFont] ?? FONT_STACK.consolas,
    "--ov-fs": `${t.fontSize}px`,
    "--ov-weight": t.weight > 0 ? String(t.weight) : t.bold ? "600" : "400",
    "--ov-weight-strong": t.weight > 0 ? String(Math.min(900, t.weight + 300)) : t.bold ? "800" : "700",
    "--ov-text": t.text,
    "--ov-dim": t.dim,
    "--ov-bg": rgba(t.bg, t.bgOpacity),
    "--ov-bg-solid": t.bg,
    "--ov-bg-row": rgba(t.text, 4),
    "--ov-bg-me": rgba(t.highlight, t.highlightOpacity),
    "--ov-line": t.border ? rgba(t.borderColor, t.borderOpacity) : "transparent",
    "--ov-divider": rgba(t.text, 8),
    "--ov-radius": `${t.radius}px`,
    "--ov-accent": t.accent,
    "--ov-green": t.positive,
    "--ov-red": t.negative,
    "--ov-yellow": t.warning,
    "--ov-blue": t.info,
    "--ov-purple": t.best,
    "--ov-row-h": `${ROW_H[t.density] ?? 26}px`,
    "--ov-shadow": t.textShadow ? "0 1px 2px rgba(0,0,0,0.9)" : "none",
  };
}

// ---- Ayar formu şemaları (Görünüm sayfası bunlardan otomatik form üretir) ----

export const THEME_GROUPS: { title: string; fields: SettingField[] }[] = [
  {
    title: "Yazı",
    fields: [
      { key: "font", label: "Yazı fontu", type: "select", default: DEFAULT_THEME.font, options: FONTS },
      { key: "numFont", label: "Sayı/süre fontu", type: "select", default: DEFAULT_THEME.numFont, options: NUM_FONTS },
      { key: "fontSize", label: "Yazı boyutu", type: "number", default: DEFAULT_THEME.fontSize, min: 10, max: 18, step: 1, unit: "px" },
      { key: "bold", label: "Kalın yazı", type: "boolean", default: false },
      { key: "textShadow", label: "Yazı gölgesi (okunabilirlik)", type: "boolean", default: DEFAULT_THEME.textShadow },
    ],
  },
  {
    title: "Panel",
    fields: [
      { key: "bg", label: "Arka plan", type: "color", default: DEFAULT_THEME.bg },
      { key: "bgOpacity", label: "Arka plan opaklığı", type: "number", default: 86, min: 0, max: 100, step: 1, unit: "%" },
      { key: "radius", label: "Köşe yuvarlaklığı", type: "number", default: 8, min: 0, max: 20, step: 1, unit: "px" },
      { key: "border", label: "Kenarlık", type: "boolean", default: true },
      { key: "borderColor", label: "Kenarlık rengi", type: "color", default: DEFAULT_THEME.borderColor },
      { key: "borderOpacity", label: "Kenarlık opaklığı", type: "number", default: 8, min: 0, max: 100, step: 1, unit: "%" },
      {
        key: "density",
        label: "Satır yoğunluğu",
        type: "select",
        default: "normal",
        options: [
          { value: "compact", label: "Sıkı" },
          { value: "normal", label: "Normal" },
          { value: "comfortable", label: "Geniş" },
        ],
      },
      {
        key: "scale",
        label: "Tüm overlay'lerin boyutu",
        type: "number",
        default: 100,
        min: 30,
        max: 200,
        step: 5,
        unit: "%",
        hint: "Her overlay'in kendi boyutuyla çarpılır (ör. %150 × %80 = %120). Küçülürken overlay'ler ekrandaki köşelerine/kenarlarına göre yerinde kalır.",
      },
      {
        key: "opacity",
        label: "Tüm overlay'lerin opaklığı",
        type: "number",
        default: 100,
        min: 10,
        max: 100,
        step: 5,
        unit: "%",
        hint: "Tavan olarak uygulanır: kendi opaklığı bundan düşük olan overlay'ler olduğu gibi kalır.",
      },
    ],
  },
  {
    title: "Renkler",
    fields: [
      { key: "text", label: "Yazı", type: "color", default: DEFAULT_THEME.text },
      { key: "dim", label: "İkincil yazı", type: "color", default: DEFAULT_THEME.dim },
      { key: "accent", label: "Vurgu", type: "color", default: DEFAULT_THEME.accent },
      { key: "highlight", label: "Senin satırın", type: "color", default: DEFAULT_THEME.highlight },
      {
        key: "highlightOpacity",
        label: "Senin satırın opaklığı",
        type: "number",
        default: 20,
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
      },
      { key: "positive", label: "Olumlu (kazanç)", type: "color", default: DEFAULT_THEME.positive },
      { key: "negative", label: "Olumsuz (kayıp)", type: "color", default: DEFAULT_THEME.negative },
      { key: "warning", label: "Uyarı", type: "color", default: DEFAULT_THEME.warning },
      { key: "info", label: "Bilgi", type: "color", default: DEFAULT_THEME.info },
      { key: "best", label: "En iyi tur", type: "color", default: DEFAULT_THEME.best },
    ],
  },
];
