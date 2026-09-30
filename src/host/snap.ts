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
