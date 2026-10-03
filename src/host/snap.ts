// Düzenleme ekranı için yapıştırma (snap) ve sınır hesapları. Saf fonksiyonlar.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Guides {
  v: number[];
  h: number[];
}

/** Kenarların birbirine yapışması için piksel eşiği. */
export const EDGE_THRESHOLD = 8;

/** Dikdörtgeni ekranın içine sıkıştırır. Ekrandan büyükse sol/üst kenara hizalar. */
export function clampRect(r: Rect, screen: { w: number; h: number }): Rect {
  return {
    ...r,
    x: Math.max(0, Math.min(r.x, screen.w - r.w)),
    y: Math.max(0, Math.min(r.y, screen.h - r.h)),
  };
}

/** Bir eksende en yakın kenar hizalamasını bulur. */
function snapAxis(pos: number, len: number, targets: number[]): { pos: number; guide: number | null } {
  const edges = [0, len / 2, len]; // sol/üst, orta, sağ/alt
  let best: { d: number; pos: number; guide: number } | null = null;
  for (const t of targets) {
    for (const e of edges) {
      const d = Math.abs(pos + e - t);
      if (d <= EDGE_THRESHOLD && (!best || d < best.d)) best = { d, pos: t - e, guide: t };
    }
  }
  return best ? { pos: best.pos, guide: best.guide } : { pos, guide: null };
}

/**
 * Taşınan dikdörtgenin yeni konumunu hesaplar:
 * 1) Ekran kenarlarına/ortasına ve diğer overlay'lerin kenarlarına yapıştırır (varsa öncelikli)
 * 2) Yoksa ızgaraya yuvarlar
 * 3) Her durumda ekran dışına çıkmasını engeller
 */
export function snapMove(
  r: Rect,
  others: Rect[],
  screen: { w: number; h: number },
  opts: { grid: number; edges: boolean },
): Rect & { guides: Guides } {
  let x = r.x;
  let y = r.y;
  const guides: Guides = { v: [], h: [] };

  let snappedX = false;
  let snappedY = false;
  if (opts.edges) {
    const tx = [0, screen.w / 2, screen.w];
    const ty = [0, screen.h / 2, screen.h];
    for (const o of others) {
      tx.push(o.x, o.x + o.w / 2, o.x + o.w);
      ty.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const sx = snapAxis(x, r.w, tx);
    const sy = snapAxis(y, r.h, ty);
    if (sx.guide !== null) {
      x = sx.pos;
      snappedX = true;
      guides.v.push(sx.guide);
    }
    if (sy.guide !== null) {
      y = sy.pos;
      snappedY = true;
      guides.h.push(sy.guide);
    }
  }
  if (opts.grid > 0) {
    if (!snappedX) x = Math.round(x / opts.grid) * opts.grid;
    if (!snappedY) y = Math.round(y / opts.grid) * opts.grid;
  }
  const c = clampRect({ x, y, w: r.w, h: r.h }, screen);
  return { ...c, guides };
}

// ---------------------------------------------------------------------------
// Genel boyut: çapalı (anchor) ölçekleme
// ---------------------------------------------------------------------------
//
// Kaydedilen konum/boyut, genel boyut %100 iken geçerli yerleşimdir. Genel boyut
// değişince her overlay ekrandaki bölgesine göre bir noktasından sabitlenir:
//   sol üst bölge  -> sol üst köşe     üst orta -> üst kenarın ortası     sağ üst -> sağ üst köşe
//   sol orta       -> sol kenar ortası  orta     -> merkez                sağ orta -> sağ kenar ortası
//   sol alt        -> sol alt köşe      alt orta -> alt kenarın ortası     sağ alt -> sağ alt köşe
// Bölge, overlay'in merkezinin ekranın hangi üçte birlik diliminde olduğuna göre belirlenir.

/** Genel boyut ne kadar küçülürse küçülsün etkin ölçek bunun altına inmez. */
export const MIN_EFFECTIVE_SCALE = 0.35;

export interface Anchor {
  ax: 0 | 0.5 | 1;
  ay: 0 | 0.5 | 1;
}

function third(v: number, len: number): 0 | 0.5 | 1 {
  if (v < len / 3) return 0;
  if (v > (len * 2) / 3) return 1;
  return 0.5;
}

export function anchorOf(r: Rect, screen: { w: number; h: number }): Anchor {
  return { ax: third(r.x + r.w / 2, screen.w), ay: third(r.y + r.h / 2, screen.h) };
}

/** %100 yerleşimdeki dikdörtgeni `factor` kadar ölçekler; çapa noktası yerinde kalır. */
export function layoutRect(base: Rect, factor: number, screen: { w: number; h: number }): Rect {
  const { ax, ay } = anchorOf(base, screen);
  const px = base.x + ax * base.w;
  const py = base.y + ay * base.h;
  const w = base.w * factor;
  const h = base.h * factor;
  return { x: px - ax * w, y: py - ay * h, w, h };
}

/** layoutRect'in tersi: ekranda görünen dikdörtgenden %100 yerleşimdeki sol üst köşeyi bulur. */
export function unlayoutPos(eff: Rect, factor: number, screen: { w: number; h: number }): { x: number; y: number } {
  const { ax, ay } = anchorOf(eff, screen);
  const px = eff.x + ax * eff.w;
  const py = eff.y + ay * eff.h;
  return { x: px - (ax * eff.w) / factor, y: py - (ay * eff.h) / factor };
}

/** Overlay'in kendi ölçeği ve genel boyuttan etkin ölçeği hesaplar (alt sınırlı). */
export function effectiveScale(own: number, global: number): number {
  return Math.max(MIN_EFFECTIVE_SCALE, own * global);
}

// ---------------------------------------------------------------------------
// Boyutlandırma: köşeler (ölçek) ve kenarlar (genişlik / yükseklik ayarı)
// ---------------------------------------------------------------------------

export type Corner = "nw" | "ne" | "sw" | "se";
export const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
export type Edge = "n" | "s" | "e" | "w";

/**
 * Köşeden boyutlandırma: karşı köşe yerinde kalır, overlay sürüklenen köşeye doğru büyür / küçülür (en-boy oranı sabit).
 * `o` başlangıç dikdörtgeni, `dx`/`dy` imlecin başlangıçtan farkı (aynı birimde), `base` ölçeklenmemiş içerik boyutu,
 * `g0` genel boyut çarpanı. Dönen `scale` overlay'in kendi ölçeğidir (0.4..3).
 */
export function cornerResize(
  o: Rect,
  c: Corner,
  dx: number,
  dy: number,
  base: { w: number; h: number },
  g0: number,
  opts: { grid?: number; screen?: { w: number; h: number } } = {},
): Rect & { scale: number } {
  const east = c[1] === "e";
  const south = c[0] === "s";
  const ax = east ? o.x : o.x + o.w;
  const ay = south ? o.y : o.y + o.h;
  let mx = (east ? o.x + o.w : o.x) + dx;
  let my = (south ? o.y + o.h : o.y) + dy;
  if (opts.grid && opts.grid > 0) {
    mx = Math.round(mx / opts.grid) * opts.grid;
    my = Math.round(my / opts.grid) * opts.grid;
  }
  const bw = Math.max(1, base.w);
  const bh = Math.max(1, base.h);
  const rw = (east ? mx - ax : ax - mx) / bw;
  const rh = (south ? my - ay : ay - my) / bh;
  // Hangi eksende daha çok sürüklendiyse ölçeği o belirler
  let eff = Math.abs(dx) / bw >= Math.abs(dy) / bh ? rw : rh;
  let maxEff = 3 * g0;
  if (opts.screen) maxEff = Math.min(maxEff, (east ? opts.screen.w - ax : ax) / bw, (south ? opts.screen.h - ay : ay) / bh);
  eff = Math.min(maxEff, Math.max(0.2, eff));
  const scale = Math.min(3, Math.max(0.4, Math.round((eff / g0) * 100) / 100));
  const e2 = effectiveScale(scale, g0);
  const w = base.w * e2;
  const h = base.h * e2;
  return { x: east ? ax : ax - w, y: south ? ay : ay - h, w, h, scale };
}

/**
 * Kenardan boyutlandırma: overlay'in genişlik / yükseklik AYARI değişir (ölçek değil); karşı kenar yerinde kalır.
 * `d` imlecin o eksendeki farkı, `eff` etkin ölçek, `cur` ayarın başlangıç değeri, `clamp` ayarın sınır/adım kuralı.
 */
export function edgeResize(o: Rect, edge: Edge, d: number, eff: number, cur: number, clamp: (v: number) => number): Rect & { value: number } {
  const grow = edge === "e" || edge === "s" ? d : -d;
  const value = clamp(cur + grow / eff);
  const applied = (value - cur) * eff;
  if (edge === "e") return { ...o, w: o.w + applied, value };
  if (edge === "w") return { ...o, x: o.x - applied, w: o.w + applied, value };
  if (edge === "s") return { ...o, h: o.h + applied, value };
  return { ...o, y: o.y - applied, h: o.h + applied, value };
}
