// Pist haritası ve mini harita için ortak Canvas çizim yardımcıları.

import type { MapCar, PitLane } from "@/sdk/types";
import { pointAt, type Shape } from "@/sdk/trackshape";
import { friendColor, friendOf, friendsOn } from "@/sdk/friends";
import { drawMeMarker, type MeMarker } from "./marker";

const images = new Map<string, HTMLImageElement>();
function image(src: string) {
  let im = images.get(src);
  if (!im) {
    im = new Image();
    im.src = src;
    images.set(src, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export type Xf = (p: [number, number]) => [number, number];

/** Tema değişkenini okur (Canvas CSS değişkenlerini doğrudan kullanamaz). */
export function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** Şekli kutuya sığdıran dönüşüm (döndürme ve aynalama dahil). */
export function fitTransform(s: Shape, w: number, h: number, pad: number, rotateDeg: number, mirror: boolean): Xf {
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (s.bbox.minX + s.bbox.maxX) / 2;
  const cy = (s.bbox.minY + s.bbox.maxY) / 2;
  const rot = (p: [number, number]): [number, number] => {
    let x = p[0] - cx;
    const y = p[1] - cy;
    if (mirror) x = -x;
    // y kuzey (yukarı) -> ekranda yukarı için ters çevir
    return [x * cos - y * sin, -(x * sin + y * cos)];
  };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of s.pts) {
    const [x, y] = rot(p);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const k = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * k;
  const oy = h / 2 - ((minY + maxY) / 2) * k;
  return (p) => {
    const [x, y] = rot(p);
    return [ox + x * k, oy + y * k];
  };
}

/** "Otomatik" döndürme açısı (derece): başlangıç / bitiş çizgisi haritanın altına gelir. */
export function autoRotation(s: Shape, mirror: boolean): number {
  const p = pointAt(s, 0);
  let x = p[0] - (s.bbox.minX + s.bbox.maxX) / 2;
  const y = p[1] - (s.bbox.minY + s.bbox.maxY) / 2;
  if (mirror) x = -x;
  if (Math.hypot(x, y) < 1e-6) return 0;
  return ((-Math.PI / 2 - Math.atan2(y, x)) * 180) / Math.PI;
}

/** Dönüşümün ölçeği (ekran pikseli / pist birimi) */
export function xfScale(s: Shape, xf: Xf): number {
  const a: [number, number] = [s.bbox.minX, s.bbox.minY];
  const b: [number, number] = [s.bbox.maxX, s.bbox.maxY];
  const A = xf(a);
  const B = xf(b);
  return Math.hypot(B[0] - A[0], B[1] - A[1]) / Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
}

/** Pit yolu geometrisi: pist çizgisine paralel, uçları piste birleşen çizgi (pist koordinatlarında). */
export interface PitGeom {
  entry: number;
  exit: number;
  stall: number;
  pts: [number, number][];
  /** Pit yolu üzerindeki nokta; yüzde pit aralığının dışındaysa null */
  at: (pct: number) => [number, number] | null;
}

/**
 * @param side "auto": öğrenilen yan (yoksa pistin içi), "in": pistin içi, "out": pistin dışı
 * @param offset pist çizgisinden uzaklık (pist birimi)
 */
export function pitGeometry(s: Shape, pit: PitLane, side: string, offset: number): PitGeom | null {
  const len = (((pit.exit - pit.entry) % 1) + 1) % 1;
  if (!(len > 0.004 && len < 0.5)) return null;
  // Kapalı eğrinin yönü: alan > 0 ise saat yönünün tersi, yani pistin içi gidiş yönünün solunda
  let area = 0;
  const n = s.pts.length;
  for (let i = 0; i < n; i++) {
    const a = s.pts[i];
    const b = s.pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const inside = area >= 0 ? 1 : -1;
  const sign = side === "in" ? inside : side === "out" ? -inside : pit.side || inside;
  const at = (pct: number): [number, number] | null => {
    const rel = (((pct - pit.entry) % 1) + 1) % 1;
    if (rel > len) return null;
    const u = rel / len;
    const p = pointAt(s, pct);
    const a = pointAt(s, pct - 0.003);
    const b = pointAt(s, pct + 0.003);
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // Uçlarda piste yumuşakça birleş
    const e = Math.min(1, Math.min(u, 1 - u) / 0.14);
    const k = e * e * (3 - 2 * e) * offset * sign;
    return [p[0] + (-ty / l) * k, p[1] + (tx / l) * k];
  };
  const N = Math.max(12, Math.ceil(len * n));
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) pts.push(at(pit.entry + (len * i) / N) ?? pointAt(s, pit.entry + (len * i) / N));
  return { entry: pit.entry, exit: pit.exit, stall: pit.stall, pts, at };
}

export function drawPit(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  g: PitGeom,
  xf: Xf,
  o: { color: string; width: number; outline?: string; outlineWidth?: number; marks?: boolean; trackLine: number; stall?: string },
) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  g.pts.forEach((p, i) => {
    const [x, y] = xf(p);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  if (o.outline && (o.outlineWidth ?? 0) > 0) {
    ctx.strokeStyle = o.outline;
    ctx.lineWidth = o.width + (o.outlineWidth ?? 0) * 2;
    ctx.stroke();
  }
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.width;
  ctx.stroke();
  if (o.marks) {
    // Giriş ve çıkış: pist çizgisine dik kısa çentik
    for (const pct of [g.entry, g.exit]) {
      const a = xf(pointAt(s, pct));
      const b = xf(pointAt(s, pct + 0.003));
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      const L = o.trackLine / 2 + 4;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a[0] - Math.cos(ang) * L, a[1] - Math.sin(ang) * L);
      ctx.lineTo(a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L);
      ctx.stroke();
    }
  }
  if (o.stall && g.stall >= 0) {
    const w = g.at(g.stall);
    if (w) {
      const [x, y] = xf(w);
      const r = Math.max(3, o.width + 1.5);
      ctx.fillStyle = o.stall;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(x - r, y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  xf: Xf,
  o: {
    line: number;
    fill: boolean;
    text: string;
    bg: string;
    outline: string;
    /** Kenar çizgisi kalınlığı (her yanda; varsayılan 2, 0 = yok) */
    outlineWidth?: number;
    /** Dolgu opaklığı 0..1 (varsayılan 1) */
    fillAlpha?: number;
    /** Başlangıç / bitiş çizgisi (varsayılan açık) ve rengi (varsayılan pist rengi) */
    sf?: boolean;
    sfColor?: string;
    /** Dolgu ile pist çizgisi arasında çizilecek katman (pit yolu) */
    under?: () => void;
  },
) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  s.pts.forEach((p, i) => {
    const [x, y] = xf(p);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  if (o.fill) {
    ctx.fillStyle = o.bg;
    ctx.globalAlpha = o.fillAlpha ?? 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const trace = () => {
    ctx.beginPath();
    s.pts.forEach((p, i) => {
      const [x, y] = xf(p);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  // Dış kontur + beyaz pist çizgisi
  const ow = o.outlineWidth ?? 2;
  if (ow > 0) {
    ctx.strokeStyle = o.outline;
    ctx.lineWidth = o.line + ow * 2;
    ctx.stroke();
  }
  if (o.under) {
    o.under();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    trace();
  }
  ctx.strokeStyle = o.text;
  ctx.lineWidth = o.line;
  ctx.stroke();

  // Başlangıç/bitiş çizgisi
  if (o.sf === false) return;
  const a = xf(pointAt(s, 0));
  const b = xf(pointAt(s, 0.003));
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
  const L = o.line + 8;
  ctx.strokeStyle = o.sfColor || o.text;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a[0] - Math.cos(ang) * L, a[1] - Math.sin(ang) * L);
  ctx.lineTo(a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L);
  ctx.stroke();
}

export function drawCars(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  xf: Xf,
  cars: MapCar[],
  o: {
    size: number;
    label: string;
    meColor: string;
    font: string;
    me?: MeMarker;
    /** Pitteki araçlar pit yolu çizgisinde çizilsin */
    pit?: PitGeom | null;
    /** Sınıf renkleri kapalıysa tüm araçların rengi */
    carColor?: string;
    /** Pitteki araçların opaklığı (varsayılan 0.45) */
    pitAlpha?: number;
  },
) {
  const pos = (c: MapCar, pct: number) => (c.pit && o.pit ? o.pit.at(pct) : null) ?? pointAt(s, pct);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const showFriends = friendsOn("map");
  // Arkadaşlar diğer araçların üstünde (oyuncu yine en üstte) çizilsin
  const list = showFriends
    ? [...cars].sort((a, b) => Number(a.me) * 2 + Number(!!friendOf(a.userId, a.name)) - (Number(b.me) * 2 + Number(!!friendOf(b.userId, b.name))))
    : cars;
  for (const c of list) {
    const [x, y] = xf(pos(c, c.pct));
    const fr = showFriends && !c.me ? friendOf(c.userId, c.name) : null;
    const r = c.me ? o.size * 1.25 : fr ? o.size * 1.2 : o.size;
    ctx.globalAlpha = c.pit ? (o.pitAlpha ?? 0.45) : 1;

    if (c.me && o.me) {
      // Senin aracın: seçilen şekil ya da resim, gidiş yönüne göre döndürülebilir
      const a = xf(pos(c, c.pct + 0.004));
      const ang = Math.atan2(a[0] - x, -(a[1] - y));
      const txt = o.label === "number" ? c.number : o.label === "pos" && c.classPos > 0 ? String(c.classPos) : "";
      drawMeMarker(ctx, x, y, r * o.me.scale, ang, o.me, { text: txt, font: o.font });
      continue;
    }

    const photo = fr?.photo ? image(fr.photo) : null;
    if (fr && photo) {
      // Fotoğraflı arkadaş: yuvarlak fotoğraf + renkli halka
      const pr = r * 1.45;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(photo, x - pr, y - pr, pr * 2, pr * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, pr, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = friendColor(fr);
      ctx.stroke();
      continue;
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = c.me ? o.meColor : fr ? friendColor(fr) : o.carColor || c.color || "#e03b3b";
    ctx.fill();
    ctx.lineWidth = fr ? 2.5 : 1.5;
    ctx.strokeStyle = fr ? "#ffffff" : "rgba(0,0,0,0.55)";
    ctx.stroke();
    const txt = fr?.icon
      ? fr.icon
      : o.label === "number"
        ? c.number
        : o.label === "pos" && c.classPos > 0
          ? String(c.classPos)
          : "";
    if (txt && r >= 7) {
      ctx.fillStyle = "#111";
      ctx.font = `700 ${Math.round(r * (fr?.icon ? 1.15 : 1.05))}px ${o.font}`;
      ctx.fillText(txt, x, y + 0.5);
    }
  }
  ctx.globalAlpha = 1;
}
