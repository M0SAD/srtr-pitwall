// Pist haritası ve mini harita için ortak Canvas çizim yardımcıları.

import type { MapCar } from "@/sdk/types";
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

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  xf: Xf,
  o: { line: number; fill: boolean; text: string; bg: string; outline: string },
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
    ctx.fill();
  }
  // Dış kontur + beyaz pist çizgisi
  ctx.strokeStyle = o.outline;
  ctx.lineWidth = o.line + 4;
  ctx.stroke();
  ctx.strokeStyle = o.text;
  ctx.lineWidth = o.line;
  ctx.stroke();

  // Başlangıç/bitiş çizgisi
  const a = xf(pointAt(s, 0));
  const b = xf(pointAt(s, 0.003));
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
  const L = o.line + 8;
  ctx.strokeStyle = o.text;
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
  o: { size: number; label: string; meColor: string; font: string; me?: MeMarker },
) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const showFriends = friendsOn("map");
  // Arkadaşlar diğer araçların üstünde (oyuncu yine en üstte) çizilsin
  const list = showFriends
    ? [...cars].sort((a, b) => Number(a.me) * 2 + Number(!!friendOf(a.userId, a.name)) - (Number(b.me) * 2 + Number(!!friendOf(b.userId, b.name))))
    : cars;
  for (const c of list) {
    const [x, y] = xf(pointAt(s, c.pct));
    const fr = showFriends && !c.me ? friendOf(c.userId, c.name) : null;
    const r = c.me ? o.size * 1.25 : fr ? o.size * 1.2 : o.size;
    ctx.globalAlpha = c.pit ? 0.45 : 1;

    if (c.me && o.me) {
      // Senin aracın: seçilen şekil ya da resim, gidiş yönüne göre döndürülebilir
      const a = xf(pointAt(s, c.pct + 0.004));
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
    ctx.fillStyle = c.me ? o.meColor : fr ? friendColor(fr) : c.color || "#e03b3b";
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
