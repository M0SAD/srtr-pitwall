// Düzen tuvali: bir monitörü (ya da yayın sahnesini) küçültülmüş olarak gösterir; overlay'ler
// gerçek görünümleriyle çizilir, sürüklenip boyutlandırılabilir. Izgara ve kenarlara yapıştırma var.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { manifestById } from "@/sdk/registry";
import { instanceName, settings, updateSettings, type EditBackdropSlot, type OverlayInstance, type Profile } from "@/sdk/settings";
import { themeVars } from "@/sdk/theme";
import { isLocked } from "@/cloud/account";
import { CORNERS, clampRect, cornerResize, edgeResize, effectiveScale, layoutRect, snapMove, unlayoutPos, type Corner, type Edge, type Guides, type Rect } from "@/host/snap";
import { clampField, resizeFields, rowUnit } from "@/sdk/overlay";
import { OverlayView } from "./OverlayView";
import { useEditBackdrop } from "./BackdropPicker";
import { Portal } from "solid-js/web";
import { ContextMenu, type MenuState } from "@/host/ContextMenu";
import { endDrag, remoteDrag, sendDrag } from "@/sdk/livedrag";
import { t } from "@/sdk/i18n";
import LockIcon from "lucide-solid/icons/lock";
import { BADGE, StreamBadgeMark, badgeFactor, badgeRect, pushOutOfBadge, rectsHit } from "@/sdk/streamBadge";

/** Tuvalin üstünde kısa süre görünen bilgi (kilitli düzen / kilitli overlay'de engellenen işlem) */
const [canvasNotice, setCanvasNotice] = createSignal<{ text: string; n: number } | null>(null);
let noticeTimer: number | undefined;
export function sayCanvas(text: string) {
  setCanvasNotice({ text, n: (canvasNotice()?.n ?? 0) + 1 });
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => setCanvasNotice(null), 3200);
}
/** "Bu düzen kilitli…" bilgisi: kilitli düzende ekleme / çıkarma / taşıma denenince */
export const sayLayoutLocked = () => sayCanvas(t("Bu düzen kilitli: overlay eklenemez, çıkarılamaz, taşınamaz. Önce düzenin kilidini aç."));
/** Kilitli overlay taşınmak / silinmek istenince */
export const sayOverlayLocked = (remove = false) =>
  sayCanvas(remove ? t("Bu overlay kilitli: silmek için önce kilidini aç (sağ tık > Kilidi aç).") : t("Bu overlay kilitli: konumu değiştirilemez (sağ tık > Kilidi aç)."));

/** Overlay, SRTR Pitwall logosuna ayrılmış alana konmak istenince */
export const sayBadgeArea = () => sayCanvas(t("Bu alan SRTR Pitwall logosuna ayrılmıştır (PRO ile gizlenebilir)"));

/** Yayın düzeni tuvalindeki SRTR Pitwall logosu (sabit öğe; sdk/streamBadge.tsx) */
export interface CanvasBadge {
  /** Gizlenemez (özellik kullanıcıya kilitli): overlay'ler ayrılmış alana konamaz */
  forced: boolean;
  /** Yayında görünüyor mu (false: PRO kullanıcı gizledi, tuvalde soluk) */
  shown: boolean;
  selected: boolean;
  onPick: () => void;
}

export interface CanvasProps {
  profileId: string;
  /** Tuvalin mantıksal boyutu (monitör çözünürlüğü / ölçek) */
  width: number;
  height: number;
  /** Tuvalde gösterilecek kopyalar */
  keys: string[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Genel boyut ayarı uygulansın mı (monitör düzenlerinde evet, yayın sahnelerinde hayır) */
  globalScale?: boolean;
  /** Düzenleme arka planı görseli: hangi yerin (Düzenler / Yayın düzenleri) arka planı gösterilsin */
  backdrop?: EditBackdropSlot;
  /** Overlay'ler ayarlardaki düzen yerine bu (türetilmiş) düzenden okunur: bağlı yayın düzeni önizlemesi */
  source?: Profile;
  /** Salt okunur: taşıma/boyutlandırma/sağ tık yok, sadece seçim */
  readOnly?: boolean;
  /** Yakınlaştırma (1 = sığdır). 1'den büyükse tuval kaydırılabilir olur */
  zoom?: number;
  /** Space basılıyken fare tekeri: yakınlaştır / uzaklaştır (verilmezse kapalı) */
  onZoom?: (zoom: number) => void;
  /** Yayın düzeni: sağ üstteki SRTR Pitwall logosu */
  badge?: CanvasBadge;
}

/** rects değişince artar: logo ile çakışma uyarısı yeniden hesaplansın */
const [rectsVer, setRectsVer] = createSignal(0);

// Tuvaldeki overlay'lerin mantıksal dikdörtgenleri (yapıştırma için)
const rects = new Map<string, Rect>();

// Üst üste binen overlay'lerde tıklamanın kime gideceğini seçmek için: tuvaldeki her kopyanın tutamağı
interface ItemHandle {
  locked: () => boolean;
  selected: () => boolean;
  select: () => void;
  begin: (e: PointerEvent, cycle?: string) => void;
}
const items = new Map<string, ItemHandle>();
/** Son tıklamanın yeri: aynı yere sürüklemeden tekrar tıklanınca alttaki overlay'e geçilir */
let lastClick: { x: number; y: number } | null = null;
/** İmlecin altındaki kopyalar, üstten alta */
const stackAt = (x: number, y: number): string[] =>
  document
    .elementsFromPoint(x, y)
    .map((n) => (n instanceof HTMLElement && n.classList.contains("citem") ? n.dataset.ckey : undefined))
    .filter((k): k is string => !!k && items.has(k));

/** Tuş hedefi yazı alanı mı (ok tuşları oraya aittir) */
const typingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Ok tuşu -> (dx, dy); Shift: 10 px */
function arrowDelta(e: KeyboardEvent): [number, number] | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return null;
  const n = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case "ArrowLeft":
      return [-n, 0];
    case "ArrowRight":
      return [n, 0];
    case "ArrowUp":
      return [0, -n];
    case "ArrowDown":
      return [0, n];
  }
  return null;
}

export function LayoutCanvas(props: CanvasProps) {
  let box: HTMLDivElement | undefined;
  const [boxW, setBoxW] = createSignal(800);
  const [guides, setGuides] = createSignal<Guides>({ v: [], h: [] });
  onMount(() => {
    const ro = new ResizeObserver(() => box && setBoxW(box.clientWidth));
    ro.observe(box!);
    onCleanup(() => ro.disconnect());
  });
  // Space + fare tekeri: tuvali yakınlaştır / uzaklaştır (imleç tuvalin üstündeyken)
  onMount(() => {
    let space = false;
    let over = false;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      space = true;
      // İmleç tuvaldeyken Space sayfayı kaydırmasın / odaktaki düğmeyi tetiklemesin
      if (over && props.onZoom) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space = false;
    };
    const blur = () => (space = false);
    const enter = () => (over = true);
    const leave = () => (over = false);
    const wheel = (e: WheelEvent) => {
      if (!space || !props.onZoom || e.deltaY === 0) return;
      e.preventDefault();
      const cur = props.zoom ?? 1;
      const next = Math.min(3, Math.max(0.5, Math.round((cur + (e.deltaY < 0 ? 0.1 : -0.1)) * 20) / 20));
      if (next !== cur) props.onZoom(next);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    box!.addEventListener("pointerenter", enter);
    box!.addEventListener("pointerleave", leave);
    box!.addEventListener("wheel", wheel, { passive: false });
    onCleanup(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      box?.removeEventListener("pointerenter", enter);
      box?.removeEventListener("pointerleave", leave);
      box?.removeEventListener("wheel", wheel);
    });
  });
  // Tuval pikseli / mantıksal piksel
  const k = createMemo(() => Math.min(boxW() / props.width, 620 / props.height) * (props.zoom ?? 1));
  const g = () => settings().general;
  const vars = createMemo(() => themeVars(settings().theme));
  const bg = useEditBackdrop(() => props.backdrop);
  // Sağ tık menüsü (düzenleme ekranındakiyle aynı)
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const screen = () => ({ w: props.width, h: props.height });
  const bRect = createMemo(() => badgeRect(screen()));
  /** Ayrılmış alan: sadece logo gizlenemiyorsa (PRO değil) */
  const keepOut = () => (props.badge?.forced ? bRect() : undefined);
  /** Logonun altında kalan overlay var mı */
  const badgeOverlap = createMemo(() => {
    rectsVer();
    if (!props.badge?.shown) return false;
    const b = bRect();
    return props.keys.some((key) => {
      const r = rects.get(key);
      return !!r && rectsHit(r, b);
    });
  });

  return (
    <div class="lcanvas-wrap" classList={{ zoomed: (props.zoom ?? 1) > 1 }} ref={box}>
      <div class="lnotice-slot">
        <Show when={canvasNotice()} keyed>
          {(n) => (
            <div class="lnotice" role="status">
              <LockIcon /> {n.text}
            </div>
          )}
        </Show>
      </div>
      <div
        class="lcanvas ov-theme"
        classList={{ "grid-on": g().snapToGrid }}
        style={{
          ...vars(),
          width: `${props.width * k()}px`,
          height: `${props.height * k()}px`,
          "--gridpx": `${g().gridSize * k()}px`,
        }}
        onPointerDown={(e) => e.target === e.currentTarget && props.onSelect(null)}
      >
        <Show when={bg()}>
          <img class="lcanvas-bg" src={bg()!} alt="" draggable={false} style={{ opacity: g().editBackdrops[props.backdrop ?? "layout"].opacity / 100 }} />
        </Show>
        <div class="lcanvas-grid" classList={{ on: g().snapToGrid }} />
        <div class="lcanvas-center v" />
        <div class="lcanvas-center h" />
        <For each={guides().v}>{(x) => <div class="lcanvas-guide v" style={{ left: `${x * k()}px` }} />}</For>
        <For each={guides().h}>{(y) => <div class="lcanvas-guide h" style={{ top: `${y * k()}px` }} />}</For>
        <For each={props.keys}>
          {(key) => (
            <CanvasItem
              key={key}
              profileId={props.profileId}
              k={k()}
              screen={{ w: props.width, h: props.height }}
              selected={props.selected === key}
              onSelect={() => props.onSelect(key)}
              setGuides={setGuides}
              useGlobal={props.globalScale !== false}
              source={props.source}
              readOnly={props.readOnly}
              keepOut={keepOut()}
              onMenu={(m) => {
                props.onSelect(key);
                setMenu(m);
              }}
            />
          )}
        </For>
        <Show when={props.badge}>
          {(b) => (
            <div
              class="cbadge"
              classList={{ off: !b().shown, sel: b().selected, forced: b().forced, warn: badgeOverlap() }}
              style={{ left: `${bRect().x * k()}px`, top: `${bRect().y * k()}px`, width: `${bRect().w * k()}px`, height: `${bRect().h * k()}px` }}
              title={b().forced ? t("SRTR Pitwall logosu · PRO ile gizlenebilir") : b().shown ? t("SRTR Pitwall logosu · ayarlar için tıkla") : t("SRTR Pitwall logosu gizli · ayarlar için tıkla")}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                b().onPick();
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div class="cbadge-mark" style={{ transform: `scale(${badgeFactor(screen()) * k()})`, width: `${BADGE.w}px`, height: `${BADGE.h}px` }}>
                <StreamBadgeMark />
              </div>
              <Show when={badgeOverlap()} fallback={<Show when={b().forced}><span class="cbadge-hint"><LockIcon /> PRO ile gizlenebilir</span></Show>}>
                <span class="cbadge-hint warn">Bir overlay bu alanla çakışıyor: logo yayında üstte çizilir</span>
              </Show>
              <Show when={!b().shown}>
                <span class="cbadge-hint">Logo gizli</span>
              </Show>
            </div>
          )}
        </Show>
      </div>
      <Show when={menu()}>
        <Portal>
          <ContextMenu
            state={menu()!}
            screen={{ w: props.width, h: props.height }}
            monitors={props.globalScale !== false}
            // Bu tuvaldeki düzenin ayarları açılır (etkin düzen değiştirilmez)
            onOpenSettings={(id) => props.onSelect(id)}
            onClose={() => setMenu(null)}
          />
        </Portal>
      </Show>
    </div>
  );
}

function CanvasItem(props: {
  key: string;
  profileId: string;
  k: number;
  screen: { w: number; h: number };
  selected: boolean;
  onSelect: () => void;
  setGuides: (g: Guides) => void;
  useGlobal: boolean;
  onMenu: (m: MenuState) => void;
  source?: Profile;
  readOnly?: boolean;
  /** SRTR Pitwall logosuna ayrılmış alan (PRO değilken): overlay buraya konamaz */
  keepOut?: Rect;
}) {
  const inst = (): OverlayInstance | undefined => (props.source ?? settings().profiles[props.profileId])?.overlays[props.key];
  const m = () => manifestById(inst()?.type ?? "");
  let el: HTMLDivElement | undefined;
  let root: HTMLDivElement | undefined;
  const [size, setSize] = createSignal({ w: m()?.size.w ?? 200, h: m()?.size.h ?? 100 });
  onMount(() => {
    const ro = new ResizeObserver(() => el && el.offsetWidth > 0 && setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el!);
    onCleanup(() => ro.disconnect());
  });
  onCleanup(() => (rects.delete(props.key), setRectsVer((n) => n + 1)));

  const gScale = () => (props.useGlobal ? settings().theme.scale / 100 : 1);
  const [drag, setDrag] = createSignal<{ x: number; y: number; scale: number; opts?: Record<string, number> } | null>(null);
  /** Kenardan boyutlandırılabilen genişlik / yükseklik ayarları */
  const rz = createMemo(() => resizeFields(m(), inst()?.options));
  /** Sürükleme sırasında (burada ya da ekrandaki düzenleme modunda) geçici ayar değerleri */
  const liveOpts = () => drag()?.opts ?? remoteDrag(props.profileId, props.key)?.opts;

  const view = createMemo(() => {
    const i = inst();
    if (!i) return { x: 0, y: 0, w: 0, h: 0, eff: 1, scale: 1 };
    const d = drag();
    // Overlay düzenleme modunda taşınıyorsa oradaki anlık konum
    const rd = d ? undefined : remoteDrag(props.profileId, props.key);
    const base = rd ?? i;
    const own = d ? d.scale : base.scale;
    const eff = effectiveScale(own, gScale());
    const w = size().w * eff;
    const h = size().h * eff;
    const r = d ? { x: d.x, y: d.y, w, h } : layoutRect({ x: base.x, y: base.y, w: size().w * own, h: size().h * own }, eff / own, props.screen);
    return { ...clampRect(r, props.screen), eff, scale: own };
  });
  createEffect(() => {
    const v = view();
    rects.set(props.key, { x: v.x, y: v.y, w: v.w, h: v.h });
    setRectsVer((n) => n + 1);
  });
  /** Ayrılmış alana giren dikdörtgeni hemen dışına iter; sığmayacak kadar büyükse olduğu gibi bırakır (logo üstte çizilir) */
  const outOfBadge = <T extends Rect>(r: T): T => (props.keepOut ? (pushOutOfBadge(r, props.keepOut, props.screen) ?? r) : r);

  const livePos = (r: Rect, own: number, opts?: Record<string, number>) => {
    const eff = effectiveScale(own, gScale());
    const pos = unlayoutPos(r, eff / own, props.screen);
    return { profile: props.profileId, key: props.key, x: Math.round(pos.x), y: Math.round(pos.y), scale: own, ...(opts ? { opts } : {}) };
  };
  /** Düzenin kendisi kilitli mi (bağlı yayın önizlemesi de salt okunurdur ama bilgi gösterilmez) */
  const layoutLocked = () => !!settings().profiles[props.profileId]?.locked;
  /** Bu kopya kilitli: taşınamaz, boyutlandırılamaz, silinemez (ayarları değiştirilebilir) */
  const instLocked = () => !!inst()?.locked;
  const blocked = () => !!props.readOnly || instLocked();
  const sayBlocked = () => (props.readOnly ? layoutLocked() && sayLayoutLocked() : sayOverlayLocked());
  const commit = (r0: Rect, own: number, opts?: Record<string, number>) => {
    if (blocked()) return void sayBlocked();
    // PRO değilken: overlay SRTR Pitwall logosunun alanına bırakılamaz (taşıma, boyutlandırma, ok tuşu, sağ tık > hizala)
    const r = outOfBadge(r0);
    if (r !== r0) sayBadgeArea();
    const eff = effectiveScale(own, gScale());
    const pos = unlayoutPos(r, eff / own, props.screen);
    endDrag({ profile: props.profileId, key: props.key, x: Math.round(pos.x), y: Math.round(pos.y), scale: own, ...(opts ? { opts } : {}) });
    updateSettings((d) => {
      const o = d.profiles[props.profileId]?.overlays[props.key];
      if (!o) return;
      o.x = Math.round(pos.x);
      o.y = Math.round(pos.y);
      o.scale = own;
      if (opts) Object.assign(o.options, opts);
    });
  };

  /**
   * Sol tık: üst üste binen overlay'lerde kimin tutulacağını seçer.
   * - Kilitli overlay tıklamayı geçirir: altında kilitsiz bir overlay varsa o tutulur.
   * - Seçili (kilitsiz) overlay imlecin altındaysa öncelik ondadır (tıkla seç, sonra sürükle).
   * - Aynı yere sürüklemeden tekrar tıklanınca seçim alttaki overlay'e geçer.
   */
  const startMove = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Odak düzen listesinde / bir düğmede kalmasın: Delete tuşu seçili overlay'e gitsin
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== document.body) ae.blur();
    const free = props.readOnly ? [] : stackAt(e.clientX, e.clientY).filter((k) => !items.get(k)!.locked());
    let target = props.key;
    let cycle: string | undefined;
    if (free.length) {
      const cur = free.find((k) => items.get(k)!.selected());
      target = cur ?? free[0];
      const again = !!lastClick && Math.hypot(lastClick.x - e.clientX, lastClick.y - e.clientY) < 5;
      if (cur && again && free.length > 1) cycle = free[(free.indexOf(cur) + 1) % free.length];
    }
    lastClick = { x: e.clientX, y: e.clientY };
    (items.get(target) ?? handle).begin(e, cycle);
  };

  const begin = (e: PointerEvent, cycle?: string) => {
    if (!root) return;
    props.onSelect();
    if (blocked()) {
      // Tıklama sadece seçer; sürüklemeye çalışılırsa neden taşınmadığı söylenir
      const el0 = root;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const mv = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        sayBlocked();
        done();
      };
      const done = () => {
        el0.removeEventListener("pointermove", mv);
        el0.removeEventListener("pointerup", done);
        el0.removeEventListener("pointercancel", done);
      };
      el0.setPointerCapture(e.pointerId);
      el0.addEventListener("pointermove", mv);
      el0.addEventListener("pointerup", done);
      el0.addEventListener("pointercancel", done);
      return;
    }
    const t = root;
    t.setPointerCapture(e.pointerId);
    const o = view();
    const sx = e.clientX;
    const sy = e.clientY;
    const others = [...rects.entries()].filter(([k]) => k !== props.key).map(([, r]) => r);
    let moved = false;
    let said = false;
    const move = (ev: PointerEvent) => {
      // Küçük el titremesi sürükleme sayılmaz (tıklama: seç / alttakine geç)
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      moved = true;
      lastClick = null;
      const g = settings().general;
      const r = snapMove(
        { x: o.x + (ev.clientX - sx) / props.k, y: o.y + (ev.clientY - sy) / props.k, w: o.w, h: o.h },
        others,
        props.screen,
        { grid: g.snapToGrid && !ev.altKey ? g.gridSize : 0, edges: g.snapToEdges && !ev.altKey },
      );
      props.setGuides(r.guides);
      const q0 = { x: r.x, y: r.y, w: o.w, h: o.h };
      const q = outOfBadge(q0);
      if (q !== q0 && !said) (said = true), sayBadgeArea();
      setDrag({ x: q.x, y: q.y, scale: o.scale });
      sendDrag(livePos(q, o.scale));
    };
    const up = () => {
      t.removeEventListener("pointermove", move);
      t.removeEventListener("pointerup", up);
      t.removeEventListener("pointercancel", up);
      const d = drag();
      if (d) commit({ x: d.x, y: d.y, w: o.w, h: o.h }, o.scale);
      setDrag(null);
      props.setGuides({ v: [], h: [] });
      if (!moved && cycle) items.get(cycle)?.select();
    };
    t.addEventListener("pointermove", move);
    t.addEventListener("pointerup", up);
    t.addEventListener("pointercancel", up);
  };

  const handle: ItemHandle = { locked: () => blocked(), selected: () => props.selected, select: () => props.onSelect(), begin };
  items.set(props.key, handle);
  onCleanup(() => items.get(props.key) === handle && items.delete(props.key));

  // Ok tuşları: seçili overlay'i 1 px (Shift: 10 px) taşır; ızgaraya / kenarlara yapıştırılmaz
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (!props.selected || drag()) return;
      const d = arrowDelta(e);
      if (!d || typingTarget(e.target)) return;
      if (document.querySelector(".modal-back, .bp-back, .ovmenu, .ctx")) return;
      e.preventDefault();
      if (blocked()) return void (e.repeat || sayBlocked());
      const v = view();
      const r = clampRect({ x: v.x + d[0], y: v.y + d[1], w: v.w, h: v.h }, props.screen);
      if (r.x !== v.x || r.y !== v.y) commit({ x: r.x, y: r.y, w: v.w, h: v.h }, v.scale);
    };
    window.addEventListener("keydown", key);
    onCleanup(() => window.removeEventListener("keydown", key));
  });

  const track = (t: HTMLElement, move: (ev: PointerEvent) => void, done: () => void) => {
    const up = () => {
      t.removeEventListener("pointermove", move);
      t.removeEventListener("pointerup", up);
      t.removeEventListener("pointercancel", up);
      done();
      setDrag(null);
    };
    t.addEventListener("pointermove", move);
    t.addEventListener("pointerup", up);
    t.addEventListener("pointercancel", up);
  };

  /** Köşeden boyutlandır (ölçek): overlay sürüklenen köşeye doğru büyür, karşı köşe yerinde kalır */
  const startResize = (c: Corner) => (e: PointerEvent) => {
    if (e.button !== 0 || blocked()) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const o = view();
    const sx = e.clientX;
    const sy = e.clientY;
    const g0 = gScale();
    const base = size();
    let last: (Rect & { scale: number }) | null = null;
    track(
      t,
      (ev) => {
        last = cornerResize(o, c, (ev.clientX - sx) / props.k, (ev.clientY - sy) / props.k, base, g0, { screen: props.screen });
        setDrag({ x: last.x, y: last.y, scale: last.scale });
        sendDrag(livePos(last, last.scale));
      },
      () => last && commit(last, last.scale),
    );
  };

  /** Kenardan boyutlandır: overlay'in genişlik / yükseklik ayarı değişir (ölçek aynı kalır) */
  const startEdge = (edge: Edge) => (e: PointerEvent) => {
    const horiz = edge === "e" || edge === "w";
    const f = horiz ? rz().w : rz().h;
    const i = inst();
    if (e.button !== 0 || blocked() || !f || !i) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const o = view();
    const s0 = horiz ? e.clientX : e.clientY;
    const mr = m()?.resize;
    const cur = Math.max(Number(i.options[f.key]) || f.default, horiz && mr && mr.wMin ? size().w : 0);
    // Satır sayan yükseklik ayarı: sürükleme px'i ölçülen satır yüksekliğiyle tam satıra çevrilir
    const rows = horiz ? undefined : rz().rows;
    const unit = rows ? rowUnit(el, rows) : 1;
    let last: (Rect & { value: number }) | null = null;
    track(
      t,
      (ev) => {
        last = edgeResize(o, edge, ((horiz ? ev.clientX : ev.clientY) - s0) / props.k, o.eff, rows ? 0 : cur, (v) => (rows ? (clampField(f, cur + v / unit) - cur) * unit : clampField(f, v)));
        if (rows) last = { ...last, value: Math.round(cur + last.value / unit) };
        const opts = { [f.key]: last.value };
        setDrag({ x: last.x, y: last.y, scale: o.scale, opts });
        sendDrag(livePos(last, o.scale, opts));
      },
      () => last && commit(last, o.scale, { [f.key]: last.value }),
    );
  };

  return (
    <Show when={inst() && m()}>
      <div
        ref={root}
        data-ckey={props.key}
        class="citem"
        classList={{ sel: props.selected, dragging: !!drag(), locked: isLocked(inst()!.type), pinned: instLocked() }}
        style={{
          transform: `translate(${view().x * props.k}px, ${view().y * props.k}px) scale(${view().eff * props.k})`,
          opacity: Math.min(inst()!.opacity, settings().theme.opacity / 100),
        }}
        onPointerDown={startMove}
        onContextMenu={(e) => {
          e.preventDefault();
          if (props.readOnly) return void (layoutLocked() && sayLayoutLocked());
          const v = view();
          props.onMenu({
            x: e.clientX,
            y: e.clientY,
            id: props.key,
            type: inst()!.type,
            name: instanceName(props.key, inst()!),
            rect: { x: v.x, y: v.y, w: v.w, h: v.h },
            scale: v.scale,
            commit,
            profileId: props.profileId,
          });
        }}
      >
        <div ref={el} class="citem-inner">
          <OverlayView type={inst()!.type} options={liveOpts() ? { ...inst()!.options, ...liveOpts() } : inst()!.options} look={inst()!.look} bgOpacity={inst()!.bgOpacity} themed={false} />
        </div>
        <div class="citem-label" style={{ transform: `scale(${1 / (view().eff * props.k)})` }}>
          {instanceName(props.key, inst()!)}
        </div>
        <Show when={instLocked()}>
          <div
            class="citem-lock"
            title="Kilitli: konumu değiştirilemez · sağ tık: Kilidi aç"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              // Rozet: kilitli overlay'i (altındakine geçirmeden) seçer
              e.stopPropagation();
              e.preventDefault();
              props.onSelect();
            }}
            style={{ transform: `scale(${1 / (view().eff * props.k)})` }}>
            <LockIcon />
          </div>
        </Show>
        <Show when={props.selected && !blocked()}>
          <For each={(rz().w ? (["w", "e"] as Edge[]) : []).concat(rz().h ? (["n", "s"] as Edge[]) : [])}>
            {(ed) => <div class={`rz-edge ${ed}`} style={{ "--hk": String(1 / (view().eff * props.k)) }} title="Kenardan sürükle: genişlik / yükseklik" onPointerDown={startEdge(ed)} />}
          </For>
          <For each={CORNERS}>{(c) => <div class={`citem-resize ${c}`} style={{ transform: `scale(${1 / (view().eff * props.k)})` }} onPointerDown={startResize(c)} />}</For>
        </Show>
      </div>
    </Show>
  );
}
