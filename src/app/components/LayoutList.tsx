// Düzen listesi ("Düzenlerim" ve "Yayın düzenleri"): iki sayfada aynı satırlar ve aynı sağ tık menüsü.
//  Sağ tık: Yeniden adlandır (satırda), Kopyasını oluştur, Yayın düzenine kopyala / Düzene kopyala,
//           Varsayılan yap (düzenler), OBS adresini kopyala / Bağlantıyı kopar (yayın), Toplulukta paylaş, Yukarı / Aşağı taşı, Sil.
//  Klavye (satır odaktayken): F2 = yeniden adlandır, Delete = sil.

import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import { t } from "@/sdk/i18n";
import { settings, updateSettings, type Profile } from "@/sdk/settings";
import { canvasOf, independentProfile, mapInstance, screenOf } from "@/sdk/streamLink";
import type { Status } from "@/sdk/types";
import * as I from "../icons";

export type LayoutKind = "layout" | "stream";

/** Düzenler sayfasında açılacak düzen (Yayın sayfasından "Düzene kopyala") */
export const [layoutFocus, setLayoutFocus] = createSignal<string | null>(null);

const isStream = (p: Profile) => p.rules.mode === "stream";

/** Kullanıcının verdiği sıraya göre (order); sırası olmayanlar oluşturulma sırasıyla sonda */
export function sortProfiles(list: Profile[]): Profile[] {
  return list
    .map((p, i) => ({ p, k: p.order ?? 1e9 + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
}

/** Aynı türdeki (düzen / yayın düzeni) listede bir yukarı (-1) ya da aşağı (+1) taşır */
export function moveProfile(id: string, dir: -1 | 1) {
  updateSettings((d) => {
    const me = d.profiles[id];
    if (!me) return;
    const group = sortProfiles(Object.values(d.profiles).filter((p) => isStream(p) === isStream(me)));
    const i = group.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= group.length) return;
    [group[i], group[j]] = [group[j], group[i]];
    group.forEach((p, n) => (p.order = n));
  });
}

/** Kopya: aynı türde, aynı ayarlarla; listenin sonuna eklenir. Etkin düzeni değiştirmez. */
export function duplicateProfile(id: string): string | null {
  const src = settings().profiles[id];
  if (!src) return null;
  const nid = `p${Date.now().toString(36)}`;
  updateSettings((d) => {
    const p = structuredClone(src);
    p.id = nid;
    p.name = t("{0} (kopya)", src.name);
    delete p.order;
    d.profiles[nid] = p;
  });
  return nid;
}

/**
 * Yayın düzenini normal bir düzene kopyalar: açık overlay'ler aynı ayarlarla, konumları yayın çözünürlüğünden
 * ana overlay monitörüne oranlanarak. Bağlı yayın düzeninde o an görünen (kaynak düzenden gelen) hâli kopyalanır.
 */
export function copyStreamToLayout(id: string, st?: Status): string | null {
  const src = settings().profiles[id];
  if (!src) return null;
  const ind = independentProfile(src, st);
  const from = canvasOf(src);
  const to = screenOf("");
  const nid = `p${Date.now().toString(36)}`;
  updateSettings((d) => {
    const p = structuredClone(ind);
    p.id = nid;
    p.name = t("{0} (düzen)", src.name);
    p.rules = { mode: "driving", cars: [], sessions: [] };
    delete p.canvas;
    delete p.link;
    delete p.order;
    for (const [k, i] of Object.entries(p.overlays)) p.overlays[k] = i.enabled ? { ...mapInstance(i, from, to), monitor: "" } : { ...i, monitor: "" };
    d.profiles[nid] = p;
  });
  return nid;
}

/** Siler (onay sorar). Son kalan normal düzen silinemez. Silindiyse true. */
export function removeProfile(id: string): boolean {
  const p = settings().profiles[id];
  if (!p) return false;
  const stream = isStream(p);
  if (!stream && Object.values(settings().profiles).filter((x) => !isStream(x)).length <= 1) return false;
  if (!confirm(stream ? t('"{0}" yayın düzeni silinsin mi?', p.name) : t('"{0}" düzeni silinsin mi?', p.name))) return false;
  updateSettings((d) => {
    delete d.profiles[id];
    if (!d.profiles[d.activeProfile]) d.activeProfile = Object.keys(d.profiles).find((x) => !isStream(d.profiles[x])) ?? Object.keys(d.profiles)[0];
  });
  return true;
}

export function LayoutList(props: {
  kind: LayoutKind;
  /** Sıralı liste (sortProfiles) */
  list: Profile[];
  selId?: string;
  onSelect: (id: string) => void;
  /** Toplulukta paylaş (verilmezse madde çıkmaz); canShare false ise madde devre dışı */
  onShare?: (id: string) => void;
  canShare?: (p: Profile) => boolean;
  /** Düzen -> yayın düzeni ya da yayın düzeni -> düzen kopyası */
  onCopyOther: (id: string) => void;
  /** Yayın düzenleri: OBS tarayıcı kaynağı adresini panoya kopyalar */
  onCopyUrl?: (id: string) => void;
  /** Yayın düzenleri: bağlı düzenle bağlantıyı koparır (sadece bağlı olanlarda görünür) */
  onUnlink?: (id: string) => void;
  icon: () => JSX.Element;
  empty?: JSX.Element;
}) {
  const [menu, setMenu] = createSignal<{ x: number; y: number; id: string } | null>(null);
  const [renaming, setRenaming] = createSignal<string | null>(null);
  onMount(() => {
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    onCleanup(() => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    });
  });
  const stream = () => props.kind === "stream";
  const canRemove = () => stream() || props.list.length > 1;
  const remove = (id: string) => {
    const i = props.list.findIndex((p) => p.id === id);
    const next = props.list[i + 1]?.id ?? props.list[i - 1]?.id ?? "";
    if (!removeProfile(id)) return;
    if (props.selId === id) props.onSelect(stream() ? next : next || settings().activeProfile);
  };
  const rename = (id: string, v: string) => {
    const name = v.trim();
    if (name && settings().profiles[id] && settings().profiles[id].name !== name) updateSettings((d) => (d.profiles[id].name = name));
    setRenaming(null);
  };

  return (
    <>
      <Show when={menu()}>
        {(() => {
          const m = menu()!;
          const prof = () => settings().profiles[m.id];
          const idx = () => props.list.findIndex((p) => p.id === m.id);
          const run = (fn: () => void) => (e: PointerEvent) => {
            e.stopPropagation();
            setMenu(null);
            fn();
          };
          return (
            <Show when={prof()}>
              <div
                class="ovmenu"
                style={{ left: `${Math.max(4, Math.min(m.x, window.innerWidth - 240))}px`, top: `${Math.max(4, Math.min(m.y, window.innerHeight - 380))}px` }}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                <button onPointerUp={run(() => (props.onSelect(m.id), setRenaming(m.id)))}>
                  <I.Pencil /> Yeniden adlandır
                </button>
                <button
                  onPointerUp={run(() => {
                    const id = duplicateProfile(m.id);
                    if (id) props.onSelect(id);
                  })}
                >
                  <I.Copy /> Kopyasını oluştur
                </button>
                <Show
                  when={stream()}
                  fallback={
                    <button onPointerUp={run(() => props.onCopyOther(m.id))} title="Açık overlay'leri aynı ayarlarla OBS için bir yayın düzenine kopyalar (konumlar yayın çözünürlüğüne oranlanır)">
                      <I.Radio /> Yayın düzenine kopyala
                    </button>
                  }
                >
                  <button onPointerUp={run(() => props.onCopyOther(m.id))} title="Açık overlay'leri aynı ayarlarla normal bir düzene kopyalar (konumlar ana monitöre oranlanır)">
                    <I.LayoutDashboard /> Düzene kopyala
                  </button>
                </Show>
                <Show when={!stream()}>
                  <button disabled={settings().activeProfile === m.id} onPointerUp={run(() => updateSettings((d) => (d.activeProfile = m.id)))}>
                    <I.Play /> Varsayılan yap
                  </button>
                </Show>
                <Show when={props.onShare}>
                  <button disabled={props.canShare ? !props.canShare(prof()) : false} onPointerUp={run(() => (props.onSelect(m.id), props.onShare!(m.id)))}>
                    <I.Share2 /> Toplulukta paylaş
                  </button>
                </Show>
                <Show when={props.onCopyUrl}>
                  <button onPointerUp={run(() => props.onCopyUrl!(m.id))}>
                    <I.Link2 /> OBS adresini kopyala
                  </button>
                </Show>
                <Show when={props.onUnlink && prof().link}>
                  <button onPointerUp={run(() => props.onUnlink!(m.id))} title="Şu anki görünümü bu yayın düzenine kopyalar; artık düzendeki değişiklikleri izlemez ve burada serbestçe düzenlenebilir">
                    <I.Unlink /> Bağlantıyı kopar
                  </button>
                </Show>
                <button disabled={idx() <= 0} onPointerUp={run(() => moveProfile(m.id, -1))}>
                  <ArrowUp /> Yukarı taşı
                </button>
                <button disabled={idx() < 0 || idx() >= props.list.length - 1} onPointerUp={run(() => moveProfile(m.id, 1))}>
                  <ArrowDown /> Aşağı taşı
                </button>
                <button class="danger" disabled={!canRemove()} onPointerUp={run(() => remove(m.id))}>
                  <I.Trash /> Sil
                </button>
              </div>
            </Show>
          );
        })()}
      </Show>
      <Show when={props.list.length > 0} fallback={props.empty}>
        <For each={props.list}>
          {(x) => (
            <Show
              when={renaming() !== x.id}
              fallback={
                <div class="ovitem" classList={{ sel: props.selId === x.id }}>
                  <span class="ovitem-ic">{props.icon()}</span>
                  <input
                    class="input"
                    style={{ flex: "1", "min-width": "0", padding: "3px 6px", "font-size": "13px" }}
                    value={x.name}
                    maxLength={60}
                    ref={(el) => setTimeout(() => (el.focus(), el.select()))}
                    onBlur={(e) => renaming() === x.id && rename(x.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") rename(x.id, e.currentTarget.value);
                      else if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                </div>
              }
            >
              <button
                class="ovitem"
                classList={{ sel: props.selId === x.id }}
                title="Sağ tık: yeniden adlandır, kopyala, taşı, sil · F2: yeniden adlandır · Delete: sil"
                onClick={() => props.onSelect(x.id)}
                onDblClick={() => setRenaming(x.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  // Klavyeden açıldıysa (Menü tuşu) koordinat gelmez: satırın altına aç
                  setMenu({ x: e.clientX || r.left + 24, y: e.clientY || r.bottom, id: x.id });
                }}
                onKeyDown={(e) => {
                  if (e.key === "F2") {
                    e.preventDefault();
                    setRenaming(x.id);
                  } else if (e.key === "Delete" && canRemove()) {
                    e.preventDefault();
                    remove(x.id);
                  }
                }}
              >
                <span class="ovitem-ic">{props.icon()}</span>
                <span class="ovitem-name">{x.name}</span>
                <Show when={!stream() && settings().activeProfile === x.id}>
                  <span class="chip2 small">varsayılan</span>
                </Show>
              </button>
            </Show>
          )}
        </For>
      </Show>
    </>
  );
}
