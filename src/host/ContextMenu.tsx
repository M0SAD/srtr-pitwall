// Düzenleme ekranında overlay'e sağ tıklayınca açılan konum menüsü.

import { prettyKey, shortcut } from "@/sdk/shortcuts";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { addToLayout, defaultInstance, removeInstance, settings, updateOverlay } from "@/sdk/settings";
import { monitorLabel, monitors, monitorOf } from "@/sdk/monitors";
import { canDuplicate } from "@/sdk/registry";
import "./context-menu.css";
import type { Rect } from "./snap";

export interface MenuState {
  x: number;
  y: number;
  id: string;
  type: string;
  name: string;
  /** Overlay'in ekrandaki dikdörtgeni */
  rect: Rect;
  /** Overlay'in kendi ölçeği */
  scale: number;
  /** Ekrandaki yeni dikdörtgeni kaydeder */
  commit: (r: Rect, own: number) => void;
  /** Overlay'in bulunduğu düzen */
  profileId: string;
}

type Item = { label: string; hint?: string; run: () => void } | "sep";

/** 3x3 konum ızgarası: [yatay, dikey] 0=sol/üst, 0.5=orta, 1=sağ/alt */
const GRID: [number, number, string][] = [
  [0, 0, "Sol üst"],
  [0.5, 0, "Üst orta"],
  [1, 0, "Sağ üst"],
  [0, 0.5, "Sol orta"],
  [0.5, 0.5, "Tam orta"],
  [1, 0.5, "Sağ orta"],
  [0, 1, "Sol alt"],
  [0.5, 1, "Alt orta"],
  [1, 1, "Sağ alt"],
];

const EDGE = 8;

export interface MenuArea {
  x?: number;
  y?: number;
  w: number;
  h: number;
}

/**
 * Menünün sığabileceği görünür alan (pencere koordinatlarında). Pencerenin tamamı değil, imlecin bulunduğu monitörün
 * çalışma alanıyla (görev çubuğu hariç) kesişimi: overlay penceresi monitörden büyükse / birden fazla monitöre
 * yayılıyorsa ya da panel penceresi ekrandan taşıyorsa menü yine görünen kısımda kalır.
 */
export function visibleArea(px: number, py: number): Required<MenuArea> {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const full = { x: 0, y: 0, w: W, h: H };
  try {
    // Pencere içeriğinin ekrandaki başlangıcı (CSS pikseli): çerçeve ve başlık çubuğu payı düşülür
    const bw = Math.max(0, (window.outerWidth - W) / 2);
    const ox = window.screenX + bw;
    const oy = window.screenY + Math.max(0, window.outerHeight - H - bw);
    const cut = (l: number, t: number, w: number, h: number) => {
      if (![l, t, w, h].every(Number.isFinite) || w < 200 || h < 120) return undefined;
      const L = Math.max(0, l - ox);
      const T = Math.max(0, t - oy);
      const R = Math.min(W, l + w - ox);
      const B = Math.min(H, t + h - oy);
      // İmleç bu alanın içinde değilse hesap bu pencere için geçerli değil
      if (R - L < 200 || B - T < 120 || px < L - 1 || px > R + 1 || py < T - 1 || py > B + 1) return undefined;
      return { x: L, y: T, w: R - L, h: B - T };
    };
    const sc = window.screen as Screen & { availLeft?: number; availTop?: number };
    const work = cut(sc.availLeft ?? 0, sc.availTop ?? 0, sc.availWidth, sc.availHeight);
    if (work) return work;
    // Pencere birden fazla monitöre yayılıyor: imlecin üstündeki monitör (Rust listesi fiziksel piksel verir)
    const dpr = window.devicePixelRatio || 1;
    for (const m of monitors()) {
      const r = cut(m.x / dpr, m.y / dpr, m.width / dpr, m.height / dpr);
      if (r) return r;
    }
  } catch {
    /* ölçülemedi: pencerenin tamamı */
  }
  return full;
}

/**
 * Sağ tık menüsünü görünür alanın içine yerleştirir: menü çizildikten sonra ölçülür,
 * altta yer yoksa yukarı, sağda yer yoksa sola açılır, 8px kenar payıyla sıkıştırılır.
 * Alandan uzunsa yüksekliği sınırlanır (CSS'te overflow-y: auto, tekerlekle kayar).
 * Pencere ya da menü boyutu / içeriği değişince yeniden hesaplanır.
 */
export function fitMenu(
  el: () => HTMLElement | undefined,
  anchor: () => { x: number; y: number },
  viewport?: () => MenuArea | undefined,
) {
  const fit = () => {
    const m = el();
    if (!m) return;
    const { x, y } = anchor();
    const v = viewport?.();
    const a = v ? { x: v.x ?? 0, y: v.y ?? 0, w: v.w, h: v.h } : visibleArea(x, y);
    const x0 = a.x + EDGE;
    const y0 = a.y + EDGE;
    const x1 = a.x + a.w - EDGE;
    const y1 = a.y + a.h - EDGE;
    m.style.maxHeight = `${Math.max(80, y1 - y0)}px`;
    m.style.maxWidth = `${Math.max(120, x1 - x0)}px`;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    let left = x + w > x1 ? x - w : x;
    let top = y + h > y1 ? y - h : y;
    // Yukarı / sola da sığmıyorsa kenara yasla
    if (top < y0) top = y1 - h;
    if (left < x0) left = x1 - w;
    // Son güvence: tıklanan nokta alanın dışında kalsa bile menü alanın içinde
    m.style.left = `${Math.max(x0, Math.min(left, x1 - w))}px`;
    m.style.top = `${Math.max(y0, Math.min(top, y1 - h))}px`;
    m.style.visibility = "visible";
  };
  onMount(() => {
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : undefined;
    const m = el();
    if (ro && m) ro.observe(m);
    // İçerik değişti (kilitlenince seçenekler azalır, not satırı eklenir): kutu boyu aynı kalsa da yeniden yerleştir
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(fit) : undefined;
    if (mo && m) mo.observe(m, { childList: true, subtree: true });
    onCleanup(() => {
      window.removeEventListener("resize", fit);
      ro?.disconnect();
      mo?.disconnect();
    });
  });
  // Menü açıkken başka bir overlay'e sağ tıklanırsa (konum değişir)
  createEffect(() => {
    anchor();
    viewport?.();
    fit();
  });
}

export function ContextMenu(props: {
  state: MenuState;
  /** Overlay'lerin yerleştiği ekran (mantıksal piksel) */
  screen: { w: number; h: number };
  onClose: () => void;
  /** Menünün sığması gereken alan (varsayılan: pencere) */
  viewport?: MenuArea;
  /** Monitöre taşıma seçenekleri (yayın sahnelerinde yok) */
  monitors?: boolean;
  /** "Ayarlarını aç" */
  onOpenSettings?: (id: string) => void;
}) {
  let el: HTMLDivElement | undefined;
  const s = () => props.state;
  // Köşelere yerleştirirken kenardan boşluk: ızgara açıksa ızgara aralığı, değilse 10px
  const margin = () => (settings().general.snapToGrid ? settings().general.gridSize : 10);

  /** Kilitli kopya: konum / boyut değiştiren seçenekler gizlenir, silinemez */
  const inst = () => settings().profiles[s().profileId]?.overlays[s().id];
  const locked = () => !!inst()?.locked;
  const [note, setNote] = createSignal(false);

  const place = (fx: number, fy: number) => {
    const r = s().rect;
    const m = margin();
    const W = props.screen.w;
    const H = props.screen.h;
    const x = fx === 0 ? m : fx === 1 ? W - r.w - m : (W - r.w) / 2;
    const y = fy === 0 ? m : fy === 1 ? H - r.h - m : (H - r.h) / 2;
    s().commit({ ...r, x, y }, s().scale);
    props.onClose();
  };

  const move = (x: number | null, y: number | null) => {
    const r = s().rect;
    s().commit({ ...r, x: x ?? r.x, y: y ?? r.y }, s().scale);
    props.onClose();
  };

  const moveItems = (): Item[] => [
    { label: "Yatayda ortala", hint: "dikey konum aynı kalır", run: () => move((props.screen.w - s().rect.w) / 2, null) },
    { label: "Dikeyde ortala", hint: "yatay konum aynı kalır", run: () => move(null, (props.screen.h - s().rect.h) / 2) },
    "sep",
    {
      label: "Boyutu %100 yap",
      run: () => {
        updateOverlay(s().id, (i) => (i.scale = 1), s().profileId);
        props.onClose();
      },
    },
    {
      label: "Varsayılan konum ve boyut",
      run: () => {
        const d = defaultInstance(s().type);
        updateOverlay(s().id, (i) => ((i.x = d.x), (i.y = d.y), (i.scale = d.scale)), s().profileId);
        props.onClose();
      },
    },
    "sep",
    ...(props.monitors === false ? [] : monitors())
      .filter((m) => m.name !== monitorOf((settings().profiles[s().profileId]?.overlays ?? {})[s().id]?.monitor ?? "")?.name)
      .map((m) => ({
        label: `Taşı: ${monitorLabel(m)}`,
        run: () => {
          updateOverlay(s().id, (i) => ((i.monitor = m.name), (i.x = 40), (i.y = 40)), s().profileId);
          props.onClose();
        },
      })),
  ];
  const items = (): Item[] => [
    // Kilit en üstte: uzun menüde aşağı kaydırmadan erişilsin
    {
      label: locked() ? "Kilidi aç" : "Kilitle",
      hint: locked() ? undefined : "konumu değiştirilemez",
      run: () => {
        updateOverlay(
          s().id,
          (i) => {
            if (i.locked) delete i.locked;
            else i.locked = true;
          },
          s().profileId,
        );
        props.onClose();
      },
    },
    ...(locked() ? [] : ["sep" as const, ...moveItems()]),
    // Ayarlarda "birden fazla eklenebilsin" açıksa
    ...(canDuplicate(s().type, settings().general.allowDuplicates)
      ? [
          {
            label: "Aynısından ekle",
            hint: "aynı overlay'den bir tane daha",
            run: () => {
              addToLayout(s().profileId, s().type, (settings().profiles[s().profileId]?.overlays ?? {})[s().id]?.monitor ?? "");
              props.onClose();
            },
          },
        ]
      : []),
    ...(locked() && !canDuplicate(s().type, settings().general.allowDuplicates) ? [] : ["sep" as const]),
    {
      label: "Ayarlarını aç",
      hint: props.onOpenSettings ? undefined : prettyKey(shortcut("panel")),
      run: () => {
        if (props.onOpenSettings) props.onOpenSettings(s().id);
        else invoke("panel_focus_overlay", { id: s().id, profile: s().profileId });
        props.onClose();
      },
    },
    {
      label: "Sil",
      hint: props.onOpenSettings ? "Delete" : "düzenden çıkar",
      run: () => {
        if (locked()) return void setNote(true);
        removeInstance(s().id, s().profileId);
        props.onClose();
      },
    },
  ];

  // Menü ekrandan taşmasın: gerçek boyut ölçülür, gerekirse yukarı / sola açılır
  fitMenu(() => el, () => ({ x: s().x, y: s().y }), () => props.viewport);

  onMount(() => {
    const down = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node)) props.onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    onCleanup(() => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    });
  });

  return (
    <div ref={el} class="ctx" style={{ left: `${s().x}px`, top: `${s().y}px`, visibility: "hidden" }} onContextMenu={(e) => e.preventDefault()}>
      <div class="ctx-title">{s().name}</div>
      <Show when={locked()}>
        <div class="ctx-sub">Kilitli: konumu değiştirilemez</div>
      </Show>
      <Show when={!locked()}>
      <div class="ctx-sub">Ekranda konumla</div>
      <div class="ctx-grid">
        <For each={GRID}>
          {([fx, fy, label]) => (
            <button title={label} onClick={() => place(fx, fy)}>
              <i
                style={{
                  left: fx === 0 ? "4px" : fx === 1 ? "calc(100% - 18px)" : "calc(50% - 7px)",
                  top: fy === 0 ? "4px" : fy === 1 ? "calc(100% - 13px)" : "calc(50% - 4.5px)",
                }}
              />
            </button>
          )}
        </For>
      </div>
      </Show>
      <For each={items()}>
        {(it) =>
          it === "sep" ? (
            <div class="ctx-sep" />
          ) : (
            <button class="ctx-item" onClick={it.run}>
              <span>{it.label}</span>
              <Show when={it.hint}>
                <small>{it.hint}</small>
              </Show>
            </button>
          )
        }
      </For>
      <Show when={note() && locked()}>
        <div class="ctx-note">Bu overlay kilitli: silmek için önce kilidini aç.</div>
      </Show>
    </div>
  );
}
