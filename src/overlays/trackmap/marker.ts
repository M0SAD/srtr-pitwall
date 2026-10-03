// Haritalarda "senin aracın" işareti: hazır şekiller ya da kullanıcının kendi resmi.
// Şekiller birim kutuda (±1) tanımlıdır; ön taraf yukarıdır (-y). Hem Canvas (Path2D) hem SVG ile çizilir.

import type { SettingField } from "@/sdk/overlay";

export type MeShape = "circle" | "triangle" | "arrow" | "square" | "diamond" | "star" | "hexagon" | "car" | "image";

/** Tek katman: ana renk, koyu ayrıntı ya da açık ayrıntı */
export interface ShapeLayer {
  d: string;
  tone: "main" | "dark";
}

const poly = (pts: [number, number][]) => "M" + pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" L") + " Z";

function starPath(n: number, outer: number, inner: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r + 0.06]);
  }
  return poly(pts);
}

function ngon(n: number, r: number, rot = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + rot;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return poly(pts);
}

const CIRCLE = "M1,0 A1,1 0 1 1 -1,0 A1,1 0 1 1 1,0 Z";

/** Şekil katmanları (ilk "main" katman kenar çizgisi alır) */
export const SHAPES: Record<Exclude<MeShape, "image">, ShapeLayer[]> = {
  circle: [{ d: CIRCLE, tone: "main" }],
  triangle: [{ d: poly([[0, -1.15], [0.98, 0.8], [-0.98, 0.8]]), tone: "main" }],
  arrow: [{ d: poly([[0, -1.15], [0.9, 0.95], [0, 0.48], [-0.9, 0.95]]), tone: "main" }],
  square: [{ d: "M-0.86,-0.66 Q-0.86,-0.86 -0.66,-0.86 L0.66,-0.86 Q0.86,-0.86 0.86,-0.66 L0.86,0.66 Q0.86,0.86 0.66,0.86 L-0.66,0.86 Q-0.86,0.86 -0.86,0.66 Z", tone: "main" }],
  diamond: [{ d: poly([[0, -1.15], [1.0, 0], [0, 1.15], [-1.0, 0]]), tone: "main" }],
  star: [{ d: starPath(5, 1.18, 0.5), tone: "main" }],
  hexagon: [{ d: ngon(6, 1.02, Math.PI / 6), tone: "main" }],
  car: [
    // Tekerlekler
    {
      d: "M-0.8,-0.92 h0.3 v0.46 h-0.3 Z M0.5,-0.92 h0.3 v0.46 h-0.3 Z M-0.82,0.36 h0.32 v0.52 h-0.32 Z M0.5,0.36 h0.32 v0.52 h-0.32 Z",
      tone: "dark",
    },
    // Gövde
    {
      d: "M0,-1.18 C0.32,-1.18 0.54,-1.02 0.57,-0.7 L0.6,0.86 C0.6,1.06 0.42,1.16 0,1.16 C-0.42,1.16 -0.6,1.06 -0.6,0.86 L-0.57,-0.7 C-0.54,-1.02 -0.32,-1.18 0,-1.18 Z",
      tone: "main",
    },
    // Ön ve arka cam
    { d: "M-0.44,-0.44 Q0,-0.6 0.44,-0.44 L0.37,-0.12 Q0,-0.21 -0.37,-0.12 Z", tone: "dark" },
    { d: "M-0.38,0.5 Q0,0.43 0.38,0.5 L0.42,0.74 Q0,0.82 -0.42,0.74 Z", tone: "dark" },
  ],
};

/** Üzerine numara yazılabilen şekiller */
export const LABEL_SHAPES = new Set<MeShape>(["circle", "square", "hexagon", "diamond"]);

export interface MeMarker {
  shape: MeShape;
  color: string;
  outline: string;
  /** data URL (shape === "image") */
  image: string;
  /** 1 = varsayılan boyut */
  scale: number;
  rotate: boolean;
}

/** Overlay seçeneklerinden işaret ayarları */
export function meMarkerFrom(o: Record<string, any>): MeMarker {
  const scale = Number(o.meScale);
  return {
    shape: (o.meShape as MeShape) || "circle",
    color: (o.meColor as string) || "#ffffff",
    outline: (o.meOutline as string) || "#000000",
    image: typeof o.meImage === "string" ? o.meImage : "",
    scale: Number.isFinite(scale) && scale > 0 ? scale / 100 : 1,
    rotate: o.meRotate !== false,
  };
}

/** Ayar alanları (trackmap / minimap / flatmap ortak). meColor her overlay'de zaten varsa `withColor` false verilir. */
export function meMarkerFields(o: { color?: string; withColor?: boolean; shape?: MeShape } = {}): SettingField[] {
  const group = "Senin aracının işareti";
  const notImage = { key: "meShape", not: ["image"] };
  const fields: SettingField[] = [
    {
      key: "meShape",
      label: "Şekil",
      type: "select",
      default: o.shape ?? "circle",
      group,
      options: [
        { value: "circle", label: "Daire" },
        { value: "arrow", label: "Ok" },
        { value: "triangle", label: "Üçgen" },
        { value: "car", label: "Araç (üstten)" },
        { value: "square", label: "Kare" },
        { value: "diamond", label: "Baklava" },
        { value: "hexagon", label: "Altıgen" },
        { value: "star", label: "Yıldız" },
        { value: "image", label: "Kendi resmim" },
      ],
    },
  ];
  if (o.withColor !== false) {
    fields.push({ key: "meColor", label: "Senin aracın rengi", type: "color", default: o.color ?? "#ffffff", group, showIf: notImage });
  }
  fields.push(
    { key: "meOutline", label: "Kenar rengi", type: "color", default: "#000000", group, showIf: notImage },
    {
      key: "meImage",
      label: "Resim",
      type: "image",
      default: "",
      maxSize: 128,
      group,
      showIf: { key: "meShape", is: ["image"] },
      hint: "PNG, JPG, WEBP, ICO ya da SVG. En fazla 128 piksele küçültülüp bu bilgisayarda ayarlarla birlikte saklanır; oranı korunur.",
    },
    { key: "meScale", label: "İşaret boyutu", type: "number", default: 100, min: 50, max: 400, step: 10, unit: "%", group },
    {
      key: "meRotate",
      label: "Gidiş yönüne göre döndür",
      type: "boolean",
      default: true,
      group,
      showIf: { key: "meShape", not: ["circle"] },
      hint: "Kapalıyken işaret hep dik durur. Resimde üst taraf aracın önü kabul edilir.",
    },
  );
  return fields;
}

const paths = new Map<string, Path2D>();
function path2d(d: string) {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
}

// Son kullanılan birkaç resmi önbellekte tut (data URL anahtar)
const imgs = new Map<string, HTMLImageElement>();
function loadImage(src: string) {
  let im = imgs.get(src);
  if (!im) {
    if (imgs.size > 4) imgs.clear();
    im = new Image();
    im.decoding = "async";
    im.src = src;
    imgs.set(src, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

/** Resmi kare kutuya oranını bozmadan sığdırır (object-fit: contain) */
export function containBox(w: number, h: number, box: number) {
  const k = box / Math.max(1, w, h);
  return { w: w * k, h: h * k };
}

/**
 * İşareti çizer. `r` yarıçap (CSS piksel), `angle` ekranda yukarıya göre saat yönünde açı (rad).
 * Çizdiyse true; resim henüz yüklenmediyse daireye düşer.
 */
export function drawMeMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
  m: MeMarker,
  label?: { text: string; font: string },
) {
  let shape: MeShape = m.shape;
  const rot = m.rotate && shape !== "circle" ? angle : 0;
  if (shape === "image") {
    const im = m.image ? loadImage(m.image) : null;
    if (im) {
      const box = r * 2.3;
      const s = containBox(im.naturalWidth, im.naturalHeight, box);
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(im, -s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
      return;
    }
    shape = "circle";
  }
  const layers = SHAPES[shape as Exclude<MeShape, "image">] ?? SHAPES.circle;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(r, r);
  ctx.lineJoin = "round";
  let outlined = false;
  for (const l of layers) {
    const p = path2d(l.d);
    ctx.fillStyle = l.tone === "main" ? m.color : "rgba(10,12,16,0.82)";
    ctx.fill(p);
    if (l.tone === "main" && !outlined) {
      outlined = true;
      ctx.globalAlpha *= 0.6;
      ctx.strokeStyle = m.outline;
      ctx.lineWidth = 1.6 / r;
      ctx.stroke(p);
      ctx.globalAlpha /= 0.6;
    }
  }
  ctx.restore();
  if (label?.text && r >= 7 && LABEL_SHAPES.has(shape)) {
    ctx.fillStyle = textOn(m.color);
    ctx.font = `700 ${Math.round(r * (shape === "circle" ? 1.05 : 0.95))}px ${label.font}`;
    ctx.fillText(label.text, x, y + 0.5);
  }
}

/** Zemin rengine göre okunur yazı rengi */
export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#111";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#111" : "#fff";
}
