// Overlay başına görünüm ("Görünüm (bu overlay)"): genel temanın üstüne, sadece o kopya için renk / biçim /
// yazı / yoğunluk. Değerler kopyada durur (instance.look; yoksa = tema) ve overlay'in kök sarmalayıcısına
// CSS değişkenleri (--ov-*) olarak yazılır; overlay kodunda değişiklik gerekmez.
// Çizildiği her yer (overlay penceresi, panel önizlemeleri, OBS/VR tek overlay sayfası) aynı yardımcıyı kullanır:
// lookStyle(look, theme) (sdk/lookStyle.ts; PRO kilidini de uygular). Bu dosya saf modeldir: ayar deposu (settings.ts)
// buradan yalnızca tip ve normalizeLook alır, PRO özellikleri modülüne bağımlı değildir (döngüsel içe aktarma olmasın).

import { createSignal } from "solid-js";
import { fontStack, type Density, type Theme } from "./theme";

export interface OverlayLook {
  /** "Özel görünüm kullan": false ise değerler saklanır ama uygulanmaz (overlay temadaki gibi çizilir). Yoksa = açık. */
  on?: boolean;
  /** Arka plan rengi (#rrggbb) */
  bg?: string;
  /** Arka plan opaklığı (%) */
  bgOpacity?: number;
  text?: string;
  dim?: string;
  accent?: string;
  positive?: string;
  negative?: string;
  /** Uyarı (sarı), bilgi (mavi), en iyi tur (mor) */
  warning?: string;
  info?: string;
  best?: string;
  /** "Senin satırın" vurgusu ve opaklığı (%) */
  highlight?: string;
  highlightOpacity?: number;
  /** Yazı gölgesi (okunabilirlik) */
  textShadow?: boolean;
  /** Satır başındaki sınıf rengi şeridi (false: gizle) */
  classStripe?: boolean;
  /** Kenarlık rengi ve opaklığı (%) */
  border?: string;
  borderOpacity?: number;
  /** Satır / şerit zemini rengi ve opaklığı (%) */
  row?: string;
  rowOpacity?: number;
  /** Köşe yuvarlaklığı (px) */
  radius?: number;
  /** Kenarlık kalınlığı (px) */
  borderWidth?: number;
  /** İç boşluk çarpanı (%) */
  pad?: number;
  /** Panel gölgesi */
  shadow?: boolean;
  /** Arka plan bulanıklığı (cam) */
  blur?: boolean;
  /** Standart başlık çubuğu (false: gizle) */
  header?: boolean;
  font?: string;
  /** Yazı boyutu çarpanı (%) */
  fontScale?: number;
  weight?: "normal" | "strong";
  /** Harf aralığı (em × 100) */
  spacing?: number;
  /** Başlık / etiketler büyük harf */
  upper?: boolean;
  /** Sabit genişlikli rakamlar */
  tabular?: boolean;
  density?: Density;
}

export type LookKey = keyof OverlayLook;

/** Ücretsiz seçenekler; kalanı F.overlayLook (PRO) */
export const LOOK_FREE: LookKey[] = ["bg", "bgOpacity", "text", "accent", "radius", "fontScale"];

const HEX = /^#[0-9a-f]{6}$/i;
const NUM: Partial<Record<LookKey, [number, number]>> = {
  bgOpacity: [0, 100],
  borderOpacity: [0, 100],
  rowOpacity: [0, 100],
  highlightOpacity: [0, 100],
  radius: [0, 24],
  borderWidth: [0, 4],
  pad: [50, 200],
  fontScale: [70, 160],
  spacing: [-3, 20],
};
const COLORS: LookKey[] = ["bg", "text", "dim", "accent", "positive", "negative", "warning", "info", "best", "highlight", "border", "row"];
const BOOLS: LookKey[] = ["on", "textShadow", "classStripe", "shadow", "blur", "header", "upper", "tabular"];

/** Kayıtlı değeri doğrular; boşsa undefined (= tema) */
export function normalizeLook(input: unknown): OverlayLook | undefined {
  if (!input || typeof input !== "object") return undefined;
  const s = input as Record<string, unknown>;
  const o: Record<string, unknown> = {};
  for (const k of COLORS) if (typeof s[k] === "string" && HEX.test(s[k] as string)) o[k] = (s[k] as string).toLowerCase();
  for (const [k, [min, max]] of Object.entries(NUM) as [LookKey, [number, number]][]) {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v)) o[k] = Math.min(max, Math.max(min, v));
  }
  for (const k of BOOLS) if (typeof s[k] === "boolean") o[k] = s[k];
  if (typeof s.font === "string" && s.font) o.font = s.font;
  if (s.weight === "normal" || s.weight === "strong") o.weight = s.weight;
  if (s.density === "compact" || s.density === "normal" || s.density === "comfortable") o.density = s.density;
  return Object.keys(o).length ? (o as OverlayLook) : undefined;
}

/** Görünümde "aç/kapa" dışında en az bir değer var mı */
export function lookHasValues(l: OverlayLook | undefined): boolean {
  return !!l && Object.keys(l).some((k) => k !== "on");
}

function rgba(hex: string, alphaPct: number): string {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(100, alphaPct)) / 100})`;
}

const ROW_H: Record<Density, number> = { compact: 22, normal: 26, comfortable: 30 };

/**
 * Kopyanın görünümünü, overlay'in kök sarmalayıcısına yazılacak stile çevirir (tema değişkenlerinin üstüne).
 * Görünüm yoksa boş nesne döner: overlay aynen temadaki gibi çizilir.
 */
export function lookVars(l: OverlayLook | undefined, t: Theme): Record<string, string> {
  if (!l || l.on === false) return {};
  const v: Record<string, string> = {};
  if (l.bg !== undefined || l.bgOpacity !== undefined) {
    v["--ov-bg"] = rgba(l.bg ?? t.bg, l.bgOpacity ?? t.bgOpacity);
    v["--ov-bg-solid"] = l.bg ?? t.bg;
  }
  if (l.text !== undefined) {
    v["--ov-text"] = l.text;
    v["--ov-divider"] = rgba(l.text, 8);
    v["--ov-bg-row"] = rgba(l.text, 4);
    v.color = "var(--ov-text)";
  }
  if (l.row !== undefined || l.rowOpacity !== undefined) v["--ov-bg-row"] = rgba(l.row ?? l.text ?? t.text, l.rowOpacity ?? (l.row ? 12 : 4));
  if (l.dim !== undefined) v["--ov-dim"] = l.dim;
  if (l.accent !== undefined) v["--ov-accent"] = l.accent;
  if (l.positive !== undefined) v["--ov-green"] = l.positive;
  if (l.negative !== undefined) v["--ov-red"] = l.negative;
  if (l.warning !== undefined) v["--ov-yellow"] = l.warning;
  if (l.info !== undefined) v["--ov-blue"] = l.info;
  if (l.best !== undefined) v["--ov-purple"] = l.best;
  if (l.highlight !== undefined || l.highlightOpacity !== undefined) v["--ov-bg-me"] = rgba(l.highlight ?? t.highlight, l.highlightOpacity ?? t.highlightOpacity);
  if (l.textShadow !== undefined) v["--ov-shadow"] = l.textShadow ? "0 1px 2px rgba(0,0,0,0.9)" : "none";
  if (l.classStripe !== undefined) v["--ov-stripe-vis"] = l.classStripe ? "visible" : "hidden";
  if (l.border !== undefined || l.borderOpacity !== undefined)
    v["--ov-line"] = rgba(l.border ?? t.borderColor, l.borderOpacity ?? (l.border ? 100 : t.borderOpacity));
  if (l.radius !== undefined) v["--ov-radius"] = `${l.radius}px`;
  if (l.borderWidth !== undefined) v["--ov-bw"] = `${l.borderWidth}px`;
  if (l.pad !== undefined) v["--ov-pad-k"] = String(l.pad / 100);
  if (l.shadow !== undefined) v["--ov-box-shadow"] = l.shadow ? "0 6px 18px rgba(0, 0, 0, 0.5)" : "none";
  if (l.blur !== undefined) v["--ov-backdrop"] = l.blur ? "blur(10px)" : "none";
  if (l.header !== undefined) v["--ov-hdr-display"] = l.header ? "flex" : "none";
  if (l.font !== undefined) {
    v["--ov-font"] = fontStack(l.font);
    if (t.numFont === "same") v["--ov-mono"] = fontStack(l.font);
    v["font-family"] = "var(--ov-font)";
  }
  const fk = (l.fontScale ?? 100) / 100;
  if (l.fontScale !== undefined) {
    v["--ov-fs"] = `${Math.round(t.fontSize * fk * 10) / 10}px`;
    v["font-size"] = "var(--ov-fs)";
    // Sabit genişlikli paneller yazıyla birlikte genişler (style.css: width: calc(… * var(--ov-fs-k, 1)))
    v["--ov-fs-k"] = String(fk);
  }
  if (l.density !== undefined || l.fontScale !== undefined) v["--ov-row-h"] = `${Math.round(ROW_H[l.density ?? t.density] * fk)}px`;
  if (l.weight !== undefined) {
    v["--ov-weight"] = l.weight === "strong" ? "600" : "400";
    v["--ov-weight-strong"] = l.weight === "strong" ? "800" : "700";
    v["font-weight"] = "var(--ov-weight)";
  }
  if (l.spacing !== undefined) v["letter-spacing"] = `${l.spacing / 100}em`;
  if (l.upper !== undefined) v["--ov-label-tt"] = l.upper ? "uppercase" : "none";
  if (l.tabular !== undefined) v["--ov-numeric"] = l.tabular ? "tabular-nums" : "normal";
  return v;
}

/** Hazır görünümler (başlangıç noktası: kopyanın görünümünün yerine geçer, sonra alanlar tek tek değiştirilebilir) */
export const LOOK_PRESETS: { id: string; name: string; look: OverlayLook }[] = [
  { id: "glass", name: "Koyu cam", look: { bg: "#10141c", bgOpacity: 45, border: "#ffffff", borderOpacity: 22, radius: 14, blur: true, shadow: true } },
  { id: "flat", name: "Düz siyah", look: { bg: "#000000", bgOpacity: 100, text: "#f2f2f2", dim: "#9a9a9a", radius: 0, borderWidth: 0, shadow: false, row: "#ffffff", rowOpacity: 5 } },
  {
    id: "light",
    name: "Açık",
    look: {
      bg: "#f5f6f8",
      bgOpacity: 94,
      text: "#14171f",
      dim: "#5d6575",
      accent: "#e8590c",
      positive: "#12944a",
      negative: "#d6272c",
      warning: "#b98300",
      info: "#1c6fd6",
      best: "#8a3ffc",
      highlight: "#ffb020",
      highlightOpacity: 30,
      border: "#000000",
      borderOpacity: 14,
    },
  },
  {
    id: "contrast",
    name: "Yüksek kontrast",
    look: { bg: "#000000", bgOpacity: 100, text: "#ffffff", dim: "#d0d0d0", accent: "#ffe600", highlight: "#ffe600", highlightOpacity: 30, border: "#ffffff", borderOpacity: 70, borderWidth: 2, weight: "strong", fontScale: 110 },
  },
  {
    id: "neon",
    name: "Neon",
    look: {
      bg: "#12061f",
      bgOpacity: 82,
      text: "#f5e9ff",
      dim: "#a58fc2",
      accent: "#ff2bd6",
      positive: "#00ffa3",
      negative: "#ff3864",
      info: "#00f0ff",
      highlight: "#ff2bd6",
      highlightOpacity: 22,
      border: "#00f0ff",
      borderOpacity: 45,
      radius: 12,
      font: "rajdhani",
      weight: "strong",
      shadow: true,
    },
  },
  { id: "minimal", name: "Minimal", look: { bgOpacity: 0, borderWidth: 0, radius: 0, header: false, upper: false, rowOpacity: 0, density: "compact", textShadow: true } },
  {
    id: "broadcast",
    name: "Yayın (kalın)",
    look: { bg: "#11151d", bgOpacity: 96, accent: "#ffcc33", radius: 4, borderWidth: 0, font: "barlow", fontScale: 125, weight: "strong", spacing: 3, shadow: true, density: "comfortable" },
  },
];

/** "Görünümü kopyala / yapıştır": bellekte tutulur (uygulama kapanınca silinir) */
export const [lookClipboard, setLookClipboard] = createSignal<OverlayLook | null>(null);
