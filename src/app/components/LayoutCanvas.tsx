// Düzen tuvali: bir monitörü (ya da yayın sahnesini) küçültülmüş olarak gösterir; overlay'ler
// gerçek görünümleriyle çizilir, sürüklenip boyutlandırılabilir. Izgara ve kenarlara yapıştırma var.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { manifestById } from "@/sdk/registry";
import { instanceName, settings, updateSettings, type OverlayInstance, type Profile } from "@/sdk/settings";
import { themeVars } from "@/sdk/theme";
import { isLocked } from "@/cloud/account";
import { clampRect, effectiveScale, layoutRect, snapMove, unlayoutPos, type Guides, type Rect } from "@/host/snap";
import { OverlayView } from "./OverlayView";
import { useEditBackdrop } from "./BackdropPicker";
import { Portal } from "solid-js/web";
import { ContextMenu, type MenuState } from "@/host/ContextMenu";
import { focusOverlay } from "../ui";
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
  // Tuval pikseli / mantıksal piksel
  const k = createMemo(() => Math.min(boxW() / props.width, 620 / props.height));
  const g = () => settings().general;
  const vars = createMemo(() => themeVars(settings().theme));
  const bg = useEditBackdrop(() => !!props.backdrop);
  // Sağ tık menüsü (düzenleme ekranındakiyle aynı)
  const [menu, setMenu] = createSignal<MenuState | null>(null);

  return (
    <div class="lcanvas-wrap" ref={box}>
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
            onOpenSettings={(id) => {
              if (settings().profiles[props.profileId]?.rules.mode !== "stream") updateSettings((d) => (d.activeProfile = props.profileId));
              focusOverlay(id);
            }}
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
  const [drag, setDrag] = createSignal<{ x: number; y: number; scale: number } | null>(null);

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

  const livePos = (r: Rect, own: number) => {
    const eff = effectiveScale(own, gScale());
    const pos = unlayoutPos(r, eff / own, props.screen);
    return { profile: props.profileId, key: props.key, x: Math.round(pos.x), y: Math.round(pos.y), scale: own };
  };
  const commit = (r: Rect, own: number) => {
    const eff = effectiveScale(own, gScale());
    const pos = unlayoutPos(r, eff / own, props.screen);
    endDrag({ profile: props.profileId, key: props.key, x: Math.round(pos.x), y: Math.round(pos.y), scale: own });
    updateSettings((d) => {
      const o = d.profiles[props.profileId]?.overlays[props.key];
      if (!o) return;
      o.x = Math.round(pos.x);
      o.y = Math.round(pos.y);
      o.scale = own;
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
      const d = drag();
      if (d) commit({ x: d.x, y: d.y, w: o.w, h: o.h }, o.scale);
      setDrag(null);
      props.setGuides({ v: [], h: [] });
    };
    t.addEventListener("pointermove", move);
    t.addEventListener("pointerup", up);
  };

  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.currentTarget as HTMLElement;
    t.setPointerCapture(e.pointerId);
    const o = view();
    const sx = e.clientX;
    const g0 = gScale();
    const move = (ev: PointerEvent) => {
      const right = o.x + o.w + (ev.clientX - sx) / props.k;
      const eff = Math.max(0.2, (right - o.x) / size().w);
      const own = Math.min(3, Math.max(0.4, Math.round((eff / g0) * 100) / 100));
      setDrag({ x: o.x, y: o.y, scale: own });
      const e2 = effectiveScale(own, g0);
      sendDrag(livePos({ x: o.x, y: o.y, w: size().w * e2, h: size().h * e2 }, own));
    };
    const up = () => {
      t.removeEventListener("pointermove", move);
      t.removeEventListener("pointerup", up);
      const d = drag();
      if (d) {
        const eff = effectiveScale(d.scale, g0);
        commit({ x: d.x, y: d.y, w: size().w * eff, h: size().h * eff }, d.scale);
      }
      setDrag(null);
    };
    t.addEventListener("pointermove", move);
    t.addEventListener("pointerup", up);
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
          <OverlayView type={inst()!.type} options={inst()!.options} themed={false} />
        </div>
        <div class="citem-label" style={{ transform: `scale(${1 / (view().eff * props.k)})` }}>
          {instanceName(props.key, inst()!)}
        </div>
        <Show when={props.selected && !props.readOnly}>
          <div class="citem-resize" style={{ transform: `scale(${1 / (view().eff * props.k)})` }} onPointerDown={startResize} />
        </Show>
      </div>
    </Show>
  );
}
