// Düzen tuvali: bir monitörü (ya da yayın sahnesini) küçültülmüş olarak gösterir; overlay'ler
// gerçek görünümleriyle çizilir, sürüklenip boyutlandırılabilir. Izgara ve kenarlara yapıştırma var.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { manifestById } from "@/sdk/registry";
import { instanceName, settings, updateSettings, type OverlayInstance, type Profile } from "@/sdk/settings";
import { themeVars } from "@/sdk/theme";
import { isLocked } from "@/cloud/account";
import { CORNERS, clampRect, cornerResize, edgeResize, effectiveScale, layoutRect, snapMove, unlayoutPos, type Corner, type Edge, type Guides, type Rect } from "@/host/snap";
import { clampField, resizeFields } from "@/sdk/overlay";
import { OverlayView } from "./OverlayView";
import { useEditBackdrop } from "./BackdropPicker";
import { Portal } from "solid-js/web";
import { ContextMenu, type MenuState } from "@/host/ContextMenu";
import { endDrag, remoteDrag, sendDrag } from "@/sdk/livedrag";

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
  /** Düzenleme arka planı görseli gösterilsin (monitör düzenlerinde) */
  backdrop?: boolean;
  /** Overlay'ler ayarlardaki düzen yerine bu (türetilmiş) düzenden okunur: bağlı yayın düzeni önizlemesi */
  source?: Profile;
  /** Salt okunur: taşıma/boyutlandırma/sağ tık yok, sadece seçim */
  readOnly?: boolean;
  /** Yakınlaştırma (1 = sığdır). 1'den büyükse tuval kaydırılabilir olur */
  zoom?: number;
  /** Space basılıyken fare tekeri: yakınlaştır / uzaklaştır (verilmezse kapalı) */
  onZoom?: (zoom: number) => void;
}

// Tuvaldeki overlay'lerin mantıksal dikdörtgenleri (yapıştırma için)
const rects = new Map<string, Rect>();

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
  const bg = useEditBackdrop(() => !!props.backdrop);
  // Sağ tık menüsü (düzenleme ekranındakiyle aynı)
  const [menu, setMenu] = createSignal<MenuState | null>(null);

  return (
    <div class="lcanvas-wrap" classList={{ zoomed: (props.zoom ?? 1) > 1 }} ref={box}>
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
          <img class="lcanvas-bg" src={bg()!} alt="" draggable={false} style={{ opacity: g().editBackdrop.opacity / 100 }} />
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
              onMenu={(m) => {
                props.onSelect(key);
                setMenu(m);
              }}
            />
          )}
        </For>
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
}) {
  const inst = (): OverlayInstance | undefined => (props.source ?? settings().profiles[props.profileId])?.overlays[props.key];
  const m = () => manifestById(inst()?.type ?? "");
  let el: HTMLDivElement | undefined;
  const [size, setSize] = createSignal({ w: m()?.size.w ?? 200, h: m()?.size.h ?? 100 });
  onMount(() => {
    const ro = new ResizeObserver(() => el && el.offsetWidth > 0 && setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el!);
    onCleanup(() => ro.disconnect());
  });
  onCleanup(() => rects.delete(props.key));

  const gScale = () => (props.useGlobal ? settings().theme.scale / 100 : 1);
  const [drag, setDrag] = createSignal<{ x: number; y: number; scale: number; opts?: Record<string, number> } | null>(null);
  /** Kenardan boyutlandırılabilen genişlik / yükseklik ayarları */
  const rz = createMemo(() => resizeFields(m()));
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
  });

  const livePos = (r: Rect, own: number, opts?: Record<string, number>) => {
    const eff = effectiveScale(own, gScale());
    const pos = unlayoutPos(r, eff / own, props.screen);
    return { profile: props.profileId, key: props.key, x: Math.round(pos.x), y: Math.round(pos.y), scale: own, ...(opts ? { opts } : {}) };
  };
  const commit = (r: Rect, own: number, opts?: Record<string, number>) => {
    if (props.readOnly) return;
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

  const startMove = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    props.onSelect();
    if (props.readOnly) return;
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const o = view();
    const sx = e.clientX;
    const sy = e.clientY;
    const others = [...rects.entries()].filter(([k]) => k !== props.key).map(([, r]) => r);
    const move = (ev: PointerEvent) => {
      const g = settings().general;
      const r = snapMove(
        { x: o.x + (ev.clientX - sx) / props.k, y: o.y + (ev.clientY - sy) / props.k, w: o.w, h: o.h },
        others,
        props.screen,
        { grid: g.snapToGrid && !ev.altKey ? g.gridSize : 0, edges: g.snapToEdges && !ev.altKey },
      );
      props.setGuides(r.guides);
      setDrag({ x: r.x, y: r.y, scale: o.scale });
      sendDrag(livePos({ x: r.x, y: r.y, w: o.w, h: o.h }, o.scale));
    };
    const up = () => {
      t.removeEventListener("pointermove", move);
      t.removeEventListener("pointerup", up);
      t.removeEventListener("pointercancel", up);
      const d = drag();
      if (d) commit({ x: d.x, y: d.y, w: o.w, h: o.h }, o.scale);
      setDrag(null);
      props.setGuides({ v: [], h: [] });
    };
    t.addEventListener("pointermove", move);
    t.addEventListener("pointerup", up);
    t.addEventListener("pointercancel", up);
  };

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
    if (e.button !== 0 || props.readOnly) return;
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
    if (e.button !== 0 || props.readOnly || !f || !i) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const o = view();
    const s0 = horiz ? e.clientX : e.clientY;
    const cur = Number(i.options[f.key]) || f.default;
    let last: (Rect & { value: number }) | null = null;
    track(
      t,
      (ev) => {
        last = edgeResize(o, edge, ((horiz ? ev.clientX : ev.clientY) - s0) / props.k, o.eff, cur, (v) => clampField(f, v));
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
        class="citem"
        classList={{ sel: props.selected, dragging: !!drag(), locked: isLocked(inst()!.type) }}
        style={{
          transform: `translate(${view().x * props.k}px, ${view().y * props.k}px) scale(${view().eff * props.k})`,
          opacity: Math.min(inst()!.opacity, settings().theme.opacity / 100),
        }}
        onPointerDown={startMove}
        onContextMenu={(e) => {
          e.preventDefault();
          if (props.readOnly) return;
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
        <Show when={props.selected && !props.readOnly}>
          <For each={(rz().w ? (["w", "e"] as Edge[]) : []).concat(rz().h ? (["n", "s"] as Edge[]) : [])}>
            {(ed) => <div class={`rz-edge ${ed}`} style={{ "--hk": String(1 / (view().eff * props.k)) }} title="Kenardan sürükle: genişlik / yükseklik" onPointerDown={startEdge(ed)} />}
          </For>
          <For each={CORNERS}>{(c) => <div class={`citem-resize ${c}`} style={{ transform: `scale(${1 / (view().eff * props.k)})` }} onPointerDown={startResize(c)} />}</For>
        </Show>
      </div>
    </Show>
  );
}
