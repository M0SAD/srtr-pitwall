// Yayın düzenlerindeki SRTR Pitwall logosu (sağ üst köşe): logo + "SRTR Pitwall" + "pitwall.simracetr.com".
//
// Normal bir overlay kopyası değildir: taşınamaz, boyutlandırılamaz, silinemez. OBS çıktısında (host/Host.tsx)
// overlay'lerin ÜSTÜNDE çizilir; Yayın düzenleri tuvalinde (LayoutCanvas) sabit bir öğe olarak görünür.
//
// Gizleyebilmek "stream.badge.hide" özelliğidir (varsayılan PRO; Yönetim › PRO özellikleri). Ayar: general.streamBadge.
// Özellik kullanıcıya kilitliyken ayar yok sayılır: logo her zaman görünür (PRO bitince kendiliğinden geri gelir).
// OBS sayfası oturumsuz bir tarayıcıdır; PRO durumunu Rust'ın /api/entitlement yanıtından öğrenir
// ("locked" listesinde "stream.badge" işareti + pro; bkz. cloud/account.ts withVoiceLock).

import appLogo from "@/assets/logo.png";
import { entitlement, entitlementLoaded } from "@/cloud/account";
import { settings } from "./settings";

/** 1920×1080 tuvaldeki ölçüler (px); tuval büyüdükçe / küçüldükçe orantılı ölçeklenir */
export const BADGE = { w: 180, h: 40, margin: 24 };
/** Rust'a giden "locked" listesindeki işaret: logoyu gizlemek PRO'ya ayrılmış */
export const STREAM_BADGE_LOCK = "stream.badge";
/** Kullanıcının gizleme / taşıma hakkı var: ücretli PRO ya da yönetici (yöneticinin hediye ettiği PRO'da bu işaret yoktur) */
export const STREAM_BADGE_PAID = "stream.badge.paid";

export interface BadgeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Size = { w: number; h: number };

export const badgeFactor = (c: Size) => Math.max(0.3, Math.min(c.w / 1920, c.h / 1080));

/** Logonun konumu: tuvaldeki boş payın oranı (0..1; x=1 sağ kenar, y=0 üst kenar). Tuval boyutu değişse de aynı köşede / kenarda kalır. */
export interface BadgePos {
  x: number;
  y: number;
}
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Tuval pikseli (sol üst köşe) -> saklanan oran */
export function badgePosOf(x: number, y: number, c: Size): BadgePos {
  const f = badgeFactor(c);
  const fw = c.w - BADGE.w * f;
  const fh = c.h - BADGE.h * f;
  return { x: fw > 0 ? Math.round(clamp01(x / fw) * 1e4) / 1e4 : 0, y: fh > 0 ? Math.round(clamp01(y / fh) * 1e4) / 1e4 : 0 };
}

/** Kullanıcının seçtiği konum (ayar; özellik kilitliyken yok sayılır: varsayılan sağ üst) */
export const badgePosWanted = (): BadgePos | undefined => {
  const p = settings().general.streamBadgePos;
  return p && typeof p.x === "number" && typeof p.y === "number" ? p : undefined;
};

/** Logonun tuvalde kapladığı dikdörtgen. pos verilmezse varsayılan: sağ üst, kenar boşluklu (kilitliyken ayrılmış alan) */
export function badgeRect(c: Size, pos?: BadgePos): BadgeRect {
  const f = badgeFactor(c);
  if (pos) return { x: clamp01(pos.x) * Math.max(0, c.w - BADGE.w * f), y: clamp01(pos.y) * Math.max(0, c.h - BADGE.h * f), w: BADGE.w * f, h: BADGE.h * f };
  return { x: c.w - (BADGE.margin + BADGE.w) * f, y: BADGE.margin * f, w: BADGE.w * f, h: BADGE.h * f };
}

export const rectsHit = (a: BadgeRect, b: BadgeRect) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;

/**
 * Dikdörtgeni ayrılmış alanın hemen dışına iter (sola ya da aşağı, hangisi daha kısaysa).
 * Çakışma yoksa aynı nesne döner. Overlay tuvale sığmayacak kadar büyükse (ör. tam ekran sahne) null:
 * o zaman konum olduğu gibi bırakılır, logo yine üstte çizilir.
 */
export function pushOutOfBadge<T extends BadgeRect>(r: T, b: BadgeRect, screen: Size): T | null {
  if (!rectsHit(r, b)) return r;
  const cands: T[] = [];
  if (b.x - r.w >= 0) cands.push({ ...r, x: b.x - r.w });
  if (b.y + b.h + r.h <= screen.h) cands.push({ ...r, y: b.y + b.h });
  if (!cands.length) return null;
  const dist = (c: T) => Math.abs(c.x - r.x) + Math.abs(c.y - r.y);
  return cands.sort((a, c) => dist(a) - dist(c))[0];
}

/** Kullanıcı logoyu gizlemeyi seçmiş mi (ayar; kilitliyken yok sayılır) */
export const badgeWanted = () => settings().general.streamBadge !== false;

/**
 * OBS sayfası / overlay penceresi: logo zorunlu mu. Rust'ın bildirdiği duruma bakar; durum henüz
 * okunamadıysa zorunlu sayılır (ayar dosyasını elle değiştirmek logoyu gizleyemez).
 */
export const badgeForcedLive = () => !entitlementLoaded() || (entitlement().locked.includes(STREAM_BADGE_LOCK) && !(entitlement().pro && entitlement().locked.includes(STREAM_BADGE_PAID)));

// Ara sıra geçen ışık süpürmesi: 30 sn'de bir, ~1,2 sn (yalnız transform / opacity; arada hiçbir şey boyanmaz)
const BADGE_CSS = `
@keyframes srtr-badge-shine {
  0%, 96% { transform: translateX(-140%) skewX(-22deg); opacity: 0; }
  96.6% { opacity: 1; }
  99.4% { opacity: 1; }
  100% { transform: translateX(480%) skewX(-22deg); opacity: 0; }
}
.srtr-badge-shine {
  position: absolute; top: 0; bottom: 0; left: 0; width: 30%;
  background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.22), rgba(255,255,255,0));
  opacity: 0; will-change: transform, opacity; pointer-events: none;
  animation: srtr-badge-shine 30s linear 6s infinite;
}
@media (prefers-reduced-motion: reduce) { .srtr-badge-shine { animation: none; } }
`;

/** Logonun kendisi (küçük hap biçimli düğme): BADGE.w × BADGE.h px, ölçeklemeyi çağıran yapar. Stil burada: panelde de OBS sayfasında da aynı. */
export function StreamBadgeMark() {
  return (
    <div
      data-no-i18n
      style={{
        position: "relative",
        overflow: "hidden",
        width: `${BADGE.w}px`,
        height: `${BADGE.h}px`,
        "box-sizing": "border-box",
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "0 14px 0 7px",
        "border-radius": `${BADGE.h / 2}px`,
        background: "rgba(10, 12, 16, 0.64)",
        "box-shadow": "0 1px 6px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
        color: "#fff",
        "font-family": '"Inter", "Segoe UI", system-ui, sans-serif',
        "line-height": "1.1",
        "white-space": "nowrap",
        "text-shadow": "0 1px 2px rgba(0, 0, 0, 0.7)",
        "user-select": "none",
        "pointer-events": "none",
      }}
    >
      <style>{BADGE_CSS}</style>
      <img src={appLogo} alt="" draggable={false} style={{ width: "26px", height: "26px", flex: "none", "object-fit": "contain" }} />
      <div style={{ display: "flex", "flex-direction": "column", gap: "2px", "min-width": "0" }}>
        <b style={{ "font-size": "14px", "font-weight": "800", "letter-spacing": "0.2px" }}>SRTR Pitwall</b>
        <span style={{ "font-size": "10.5px", "font-weight": "500", opacity: "0.78" }}>pitwall.simracetr.com</span>
      </div>
      <i class="srtr-badge-shine" />
    </div>
  );
}
