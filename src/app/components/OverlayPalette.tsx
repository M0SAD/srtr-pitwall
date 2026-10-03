// Düzenler / Yayın sayfalarında sol alttaki overlay listesi.
// Üstte düzene EKLİ olanlar (yeşil), eklenme sırasıyla alt alta; altında eklenmemiş overlay'ler: kullanıcı
// "Overlaylarım"da bir sıra verdiyse o sırayla düz liste, vermediyse kategorilere göre.
// Çift tık (ya da sağdaki + / −): düzene ekle / düzenden çıkar. Tek tık: sağdaki ayar panelinde açar.
// Sadece çok kopyalı türler (veri kutusu, webview) birden fazla eklenebilir: ekliyken de aşağıda "+" ile durur.

import { For, Show, createMemo } from "solid-js";
import Minus from "lucide-solid/icons/minus";
import { manifests } from "@/sdk/registry";
import type { OverlayManifest } from "@/sdk/overlay";
import { instanceName, settings, updateSettings, type Profile } from "@/sdk/settings";
import { isAdmin, isHiddenOverlay, isLocked, isProOverlay, markedHiddenOverlay } from "@/cloud/account";
import { useTopic } from "@/sdk/telemetry";
import { SIM_NAMES, currentSim, overlaySupportsSim } from "@/overlays/simSupport";
import { CATEGORY_NAMES, overlayIcon } from "../overlayIcons";
import * as I from "../icons";

/** Kullanıcı "Overlaylarım"da kendi sırasını verdi mi */
export const hasOverlayOrder = () => settings().overlayOrder.length > 0;

/** Varsayılan sıra: kategorilere göre gruplanmış (kategori içinde kayıt sırası) */
export function categoryOrder(list: OverlayManifest[] = manifests): OverlayManifest[] {
  const cats: string[] = [];
  for (const m of list) if (!cats.includes(m.category)) cats.push(m.category);
  return cats.flatMap((c) => list.filter((m) => m.category === c));
}

/** Overlay'leri kullanıcının sırasına dizer (sırada olmayanlar varsayılan sırayla sonda); sıra yoksa varsayılan sıra */
export function orderedOverlays(list: OverlayManifest[] = manifests): OverlayManifest[] {
  const base = categoryOrder(list);
  const ord = settings().overlayOrder;
  if (!ord.length) return base;
  const idx = new Map(ord.map((id, i) => [id, i]));
  return base
    .map((m, i) => ({ m, k: idx.get(m.id) ?? 1e6 + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.m);
}

/**
 * Overlay'i sırada taşır: `visible` listede görünen (gizlenmemiş, simde çalışan) türlerin kimlikleri; bir yukarı /
 * aşağı adım görünen komşuya göre atılır. İlk taşımada o anki sıra (kategorilere göre) kayda geçer.
 */
export function moveOverlay(id: string, where: "up" | "down" | "top", visible: string[]) {
  const full = orderedOverlays().map((m) => m.id);
  const i = visible.indexOf(id);
  if (i < 0) return;
  const target = where === "top" ? visible[0] : visible[i + (where === "up" ? -1 : 1)];
  if (!target || target === id) return;
  const rest = full.filter((x) => x !== id);
  const at = rest.indexOf(target);
  rest.splice(where === "down" ? at + 1 : at, 0, id);
  updateSettings((d) => (d.overlayOrder = rest));
}

export function resetOverlayOrder() {
  updateSettings((d) => (d.overlayOrder = []));
}

export function OverlayPalette(props: {
  profile: Profile;
  /** Seçili kopyanın anahtarı ya da (eklenmemiş bir overlay seçiliyse) türü */
  selected: string | null;
  /** key: düzendeki kopya; yoksa type: henüz eklenmemiş overlay */
  onSelect: (key: string | null, type: string) => void;
  onAdd: (type: string) => void;
  onRemove: (key: string) => void;
  /** Bağlı yayın düzeni ya da kilitli düzen: liste salt okunur */
  disabled?: boolean;
}) {
  const status = useTopic("status");
  const sim = createMemo(() => currentSim(status()));
  const usable = createMemo(() => manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id) && overlaySupportsSim(m.id, sim())));
  const hiddenBySim = () => manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id) && !overlaySupportsSim(m.id, sim())).length;
  /** Düzene ekli kopyalar: eklenme sırasıyla (eski kayıtlarda eklenme anı yok: onlar listedeki sıralarıyla önde) */
  const added = createMemo(() => {
    const pos = new Map(orderedOverlays(usable()).map((m, i) => [m.id, i]));
    return Object.entries(props.profile.overlays)
      .filter(([, o]) => o.enabled && pos.has(o.type))
      .map(([k, o]) => ({ k, type: o.type, at: o.addedAt ?? 0, p: pos.get(o.type)! }))
      .sort((a, b) => a.at - b.at || a.p - b.p || a.k.localeCompare(b.k, undefined, { numeric: true }))
      .map((x) => x.k);
  });
  const addedTypes = createMemo(() => new Set(added().map((k) => props.profile.overlays[k]?.type)));
  /** Eklenmemiş (ya da birden çok eklenebilen) türler */
  const rest = createMemo(() => orderedOverlays(usable()).filter((m) => m.multiInstance || !addedTypes().has(m.id)));
  /** Kategori başlıklı gruplar; kullanıcı sırası varsa tek düz liste */
  const groups = createMemo((): [string | null, OverlayManifest[]][] => {
    if (hasOverlayOrder()) return rest().length ? [[null, rest()]] : [];
    const g = new Map<string, OverlayManifest[]>();
    for (const m of rest()) {
      if (!g.has(m.category)) g.set(m.category, []);
      g.get(m.category)!.push(m);
    }
    return [...g.entries()];
  });
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    if (!props.disabled) fn();
  };

  return (
    <div class="ovpal" classList={{ disabled: !!props.disabled }}>
      <Show when={added().length > 0}>
        <div class="ovlist-cap">Düzende</div>
        <For each={added()}>
          {(k) => {
            const type = () => props.profile.overlays[k]?.type ?? "";
            return (
              <Show when={props.profile.overlays[k]}>
                <div
                  class="ovitem ovpal-row on"
                  classList={{ sel: props.selected === k }}
                  title="Çift tık: düzenden çıkar"
                  onClick={() => props.onSelect(k, type())}
                  onDblClick={() => !props.disabled && props.onRemove(k)}
                >
                  <span class="ovitem-ic">{overlayIcon(type())}</span>
                  <span class="ovitem-name">{instanceName(k, props.profile.overlays[k])}</span>
                  <Show when={isProOverlay(type())}>
                    <span class="pro-badge small" title="PRO overlay">PRO</span>
                  </Show>
                  <button class="ovpal-btn rem" disabled={props.disabled} title="Düzenden çıkar" onClick={stop(() => props.onRemove(k))} onDblClick={(e) => e.stopPropagation()}>
                    <Minus />
                  </button>
                </div>
              </Show>
            );
          }}
        </For>
      </Show>
      <For each={groups()}>
        {([cat, ms]) => (
          <>
            <div class="ovlist-cap">{cat === null ? "Eklenebilir" : CATEGORY_NAMES[cat] ?? cat}</div>
            <For each={ms}>
              {(m) => {
                const locked = () => isLocked(m.id);
                const again = () => addedTypes().has(m.id);
                return (
                  <div
                    class="ovitem ovpal-row off"
                    classList={{ sel: props.selected === m.id, locked: locked() }}
                    title={locked() ? "PRO üyelere özel" : again() ? "Çift tık: düzene bir tane daha ekle" : "Çift tık: düzene ekle"}
                    onClick={() => props.onSelect(null, m.id)}
                    onDblClick={() => !props.disabled && !locked() && props.onAdd(m.id)}
                  >
                    <span class="ovitem-ic">{overlayIcon(m.id)}</span>
                    <span class="ovitem-name">{m.name}</span>
                    <Show when={isAdmin() && markedHiddenOverlay(m.id)}>
                      <span class="hidden-badge" title="Yönetici olmayanlar bu overlay'i görmez">gizli</span>
                    </Show>
                    <Show when={isProOverlay(m.id)}>
                      <span class="pro-badge small" title={locked() ? "PRO üyelere özel" : "PRO overlay"}>PRO</span>
                    </Show>
                    <button class="ovpal-btn add" disabled={locked() || props.disabled} title={again() ? "Düzene bir tane daha ekle" : "Düzene ekle"} onClick={stop(() => props.onAdd(m.id))} onDblClick={(e) => e.stopPropagation()}>
                      <I.Plus />
                    </button>
                  </div>
                );
              }}
            </For>
          </>
        )}
      </For>
      <Show when={sim() && hiddenBySim() > 0}>
        <div class="ovlist-simnote">
          {hiddenBySim()} overlay bu simde çalışmadığı için gizlendi ({SIM_NAMES[sim()!]})
        </div>
      </Show>
    </div>
  );
}
