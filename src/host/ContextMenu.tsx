// Düzenleme ekranında overlay'e sağ tıklayınca açılan konum menüsü.

import { prettyKey, shortcut } from "@/sdk/shortcuts";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
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

export function ContextMenu(props: {
  state: MenuState;
  /** Overlay'lerin yerleştiği ekran (mantıksal piksel) */
  screen: { w: number; h: number };
  onClose: () => void;
  /** Menünün sığması gereken alan (varsayılan: pencere) */
  viewport?: { w: number; h: number };
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
    ...(locked() ? [] : moveItems()),
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

  // Menü ekrandan taşmasın
  const pos = () => {
    const w = 250;
    const h = 420;
    const vp = props.viewport ?? { w: window.innerWidth, h: window.innerHeight };
    return {
      left: `${Math.max(8, Math.min(s().x, vp.w - w - 8))}px`,
      top: `${Math.max(8, Math.min(s().y, vp.h - h - 8))}px`,
    };
  };

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
    <div ref={el} class="ctx" style={pos()} onContextMenu={(e) => e.preventDefault()}>
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
