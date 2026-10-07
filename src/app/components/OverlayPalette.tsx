// Düzenler / Yayın sayfalarında sol alttaki overlay listesi.
// Üstte düzene EKLİ olanlar (yeşil), eklenme sırasıyla alt alta; altında eklenmemiş overlay'ler: kullanıcı
// "Overlaylarım"da seçilen sıralamayla (en çok kullanılan / harf / kendi sırası: düz liste; kategori: başlıklı).
// Çift tık (ya da sağdaki + / −): düzene ekle / düzenden çıkar. Tek tık: sağdaki ayar panelinde açar.
// Sadece çok kopyalı türler (veri kutusu, webview) birden fazla eklenebilir: ekliyken de aşağıda "+" ile durur.

import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import "@/host/context-menu.css";
import { fitMenu } from "@/host/ContextMenu";
import Minus from "lucide-solid/icons/minus";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { manifests } from "@/sdk/registry";
import type { OverlayManifest } from "@/sdk/overlay";
import { instanceName, settings, uiPref, updateSettings, type OverlaySort, type Profile } from "@/sdk/settings";
import { overlayTop } from "@/cloud/overlayStats";
import { lang, localeTag, t, translateText } from "@/sdk/i18n";
import { isAdmin, isHiddenOverlay, isLocked, isProOverlay, markedHiddenOverlay } from "@/cloud/account";
import { useTopic } from "@/sdk/telemetry";
import { SIM_NAMES, currentSim, overlaySupportsSim } from "@/overlays/simSupport";
import { CATEGORY_NAMES, CategoryFilter, catFilter, catMatch, overlayIcon } from "../overlayIcons";
import * as I from "../icons";
import { dragSort } from "../dragSort";

// Favori overlay'ler: Overlaylarım sayfasıyla aynı kayıt (uiPref "ovFavs")
const FAV_CAT = "__fav";
const [favsRaw] = uiPref<string[]>("ovFavs", [], "pw.ovFavs");
const favIds = () => (Array.isArray(favsRaw()) ? (favsRaw() as unknown[]).filter((x): x is string => typeof x === "string") : []);

// Kapatılan kategori başlıkları: Overlaylarım sayfasıyla aynı kayıt (uiPref "ovCatCollapsed"); orada kapatılan burada da kapalıdır
const [palClosedRaw, setPalClosed] = uiPref<string[]>("ovCatCollapsed", [], "pw.ovcatCollapsed");
const palClosed = () => (Array.isArray(palClosedRaw()) ? (palClosedRaw() as unknown[]).filter((x): x is string => typeof x === "string") : []);
const togglePalCat = (key: string) => setPalClosed(palClosed().includes(key) ? palClosed().filter((c) => c !== key) : [...palClosed(), key]);

/** Kullanıcının kendi sırası mı geçerli ("Kendi sıram") */
export const hasOverlayOrder = () => overlaySort() === "custom";
export const overlaySort = (): OverlaySort => settings().overlaySort;

/** Sıralama seçimi. "Kendi sıram" ilk kez seçilirse o an görünen sıra başlangıç olur. */
export function setOverlaySort(mode: OverlaySort) {
  if (mode === overlaySort()) return;
  const cur = orderedOverlays().map((m) => m.id);
  updateSettings((d) => {
    if (mode === "custom" && !d.overlayOrder.length) d.overlayOrder = cur;
    d.overlaySort = mode;
  });
}

/** Kategorilere göre gruplanmış sıra (kategori içinde kayıt sırası) */
export function categoryOrder(list: OverlayManifest[] = manifests): OverlayManifest[] {
  const cats: string[] = [];
  for (const m of list) if (!cats.includes(m.category)) cats.push(m.category);
  return cats.flatMap((c) => list.filter((m) => m.category === c));
}

/** Kullanım verisi yokken (çevrimdışı, sunucu hazır değil) ve eşitliklerde geçerli yerleşik popülerlik sırası; kalanlar kategorilere göre */
const BUILTIN_POPULAR = [
  "relative", "standings", "fuel", "trackmap", "minimap", "inputs", "delta", "radar", "spotterbar", "dashboard",
  "tires", "session", "weather", "laptimes", "sectors", "pedals", "telemetry", "flatmap", "stint", "pitwindow",
];

/** En çok kullanılanlar: kullanan kullanıcı sayısı, sonra düzen sayısı, sonra yerleşik sıra */
function popularOrder(list: OverlayManifest[]): OverlayManifest[] {
  const top = overlayTop();
  const base = new Map(categoryOrder(manifests).map((m, i) => [m.id, BUILTIN_POPULAR.length + i]));
  BUILTIN_POPULAR.forEach((id, i) => base.set(id, i));
  const rank = (id: string) => base.get(id) ?? 1e6;
  return [...list].sort(
    (a, b) =>
      (top[b.id]?.users ?? 0) - (top[a.id]?.users ?? 0) || (top[b.id]?.layouts ?? 0) - (top[a.id]?.layouts ?? 0) || rank(a.id) - rank(b.id),
  );
}

/** Harf sırası: çevrilmiş ada göre, dilin kurallarıyla */
function alphaOrder(list: OverlayManifest[]): OverlayManifest[] {
  lang(); // dil değişince yeniden sıralanır
  const coll = new Intl.Collator(localeTag(), { sensitivity: "base", numeric: true });
  return list
    .map((m) => ({ m, n: translateText(m.name) }))
    .sort((a, b) => coll.compare(a.n, b.n))
    .map((x) => x.m);
}

/** Overlay'leri seçili sıralamaya göre dizer ("Kendi sıram"da sırada olmayanlar kategori sırasıyla sonda) */
export function orderedOverlays(list: OverlayManifest[] = manifests): OverlayManifest[] {
  const mode = overlaySort();
  if (mode === "popular") return popularOrder(list);
  if (mode === "alpha") return alphaOrder(list);
  const base = categoryOrder(list);
  const ord = settings().overlayOrder;
  if (mode !== "custom" || !ord.length) return base;
  const idx = new Map(ord.map((id, i) => [id, i]));
  return base
    .map((m, i) => ({ m, k: idx.get(m.id) ?? 1e6 + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.m);
}

/** Kullanıcının verdiği sırayı kaydeder ve "Kendi sıram"a geçer */
export function setCustomOverlayOrder(ids: string[]) {
  updateSettings((d) => {
    d.overlayOrder = ids;
    d.overlaySort = "custom";
  });
}

/**
 * Overlay'i sırada taşır: `visible` listede görünen (gizlenmemiş, simde çalışan) türlerin kimlikleri; bir yukarı /
 * aşağı adım görünen komşuya göre atılır. İlk taşımada o an görünen sıra kayda geçer ve "Kendi sıram" seçilir.
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
  setCustomOverlayOrder(rest);
}

/** Kendi sırasını siler; varsayılan sıralamaya (en çok kullanılanlar) döner */
export function resetOverlayOrder() {
  updateSettings((d) => {
    d.overlayOrder = [];
    d.overlaySort = "popular";
  });
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
  /** Arama kutusu: overlay adına göre (çevirisi ve Türkçesi) süzer */
  const [q, setQ] = createSignal("");
  const fold = (v: string) => v.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const needle = () => fold(q().trim());
  const hit = (m: OverlayManifest) => fold(t(m.name)).includes(needle()) || fold(m.name).includes(needle());
  /** Kategori süzgeci (arama kutusunun altındaki menü; Overlaylarım sayfasıyla ortak) */
  const inCat = (m: OverlayManifest | undefined) => catMatch(m);
  const addedAll = createMemo(() => {
    const pos = new Map(orderedOverlays(usable()).map((m, i) => [m.id, i]));
    return Object.entries(props.profile.overlays)
      .filter(([, o]) => o.enabled && pos.has(o.type))
      .map(([k, o]) => ({ k, type: o.type, at: o.addedAt ?? 0, p: pos.get(o.type)! }))
      .sort((a, b) => a.at - b.at || a.p - b.p || a.k.localeCompare(b.k, undefined, { numeric: true }))
      .map((x) => x.k);
  });
  const added = createMemo(() => {
    if (!needle() && !catFilter()) return addedAll();
    return addedAll().filter((k) => {
      const o = props.profile.overlays[k];
      const m = manifests.find((x) => x.id === o?.type);
      if (!inCat(m)) return false;
      if (!needle()) return true;
      return (!!o && fold(instanceName(k, o)).includes(needle())) || (!!m && hit(m));
    });
  });
  const addedTypes = createMemo(() => new Set(addedAll().map((k) => props.profile.overlays[k]?.type)));
  /** Eklenmemiş (ya da birden çok eklenebilen) türler */
  const rest = createMemo(() => orderedOverlays(usable()).filter((m) => (m.multiInstance || !addedTypes().has(m.id)) && inCat(m)));
  /** Kategori başlıklı gruplar; kullanıcı sırası varsa tek düz liste */
  const groups = createMemo((): [string | null, OverlayManifest[]][] => {
    // Favoriler (Overlaylarım'da sağ tık > Favorilere ekle) eklenebilir listenin en üstünde ayrı grupta
    if (needle()) {
      const f = rest().filter(hit);
      return f.length ? [[null, f]] : [];
    }
    const fav = favIds();
    const fv = rest().filter((m) => fav.includes(m.id));
    const others = fv.length ? rest().filter((m) => !fav.includes(m.id)) : rest();
    const head: [string | null, OverlayManifest[]][] = fv.length ? [[FAV_CAT, fv]] : [];
    if (overlaySort() !== "category") return others.length ? [...head, [null, others]] : head;
    const g = new Map<string, OverlayManifest[]>();
    for (const m of others) {
      if (!g.has(m.category)) g.set(m.category, []);
      g.get(m.category)!.push(m);
    }
    return [...head, ...g.entries()];
  });
  // Gruplar anahtarla (kategori adı) çizilir: groups() yeniden hesaplanınca liste baştan kurulmaz, kaydırma konumu korunur
  const groupKeys = createMemo(() => groups().map(([c]) => c ?? ""), undefined, { equals: (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]) });
  const groupItems = (key: string) => groups().find(([c]) => (c ?? "") === key)?.[1] ?? [];
  // Salt okunur listede de (kilitli düzen) ekle / çıkar sayfaya iletilir: sayfa neden yapılamadığını söyler
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  /** "Düzende" satırına sağ tık: Kilitle / Kilidi aç, Ayarlarını aç, Sil */
  const [menu, setMenu] = createSignal<{ x: number; y: number; key: string } | null>(null);
  const toggleLock = (k: string) =>
    updateSettings((d) => {
      const o = d.profiles[props.profile.id]?.overlays[k];
      if (!o) return;
      if (o.locked) delete o.locked;
      else o.locked = true;
    });

  /** "Düzende" listesinde sürükleyerek sıralama: sıra eklenme anına yazılır (yeni eklenen yine sona gelir) */
  const reorder = (from: number, to: number) => {
    if (needle()) return;
    const keys = [...added()];
    keys.splice(to, 0, ...keys.splice(from, 1));
    updateSettings((d) => {
      const ov = d.profiles[props.profile.id]?.overlays;
      if (!ov) return;
      keys.forEach((k, i) => ov[k] && (ov[k].addedAt = i + 1));
    });
  };

  return (
    <div class="ovpal" classList={{ disabled: !!props.disabled }}>
      <label class="ovlist-search ovpal-search">
        <I.Search />
        <input type="search" value={q()} placeholder={t("Overlay ara")} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === "Escape" && setQ(""))} />
      </label>
      <CategoryFilter />
      <Show when={needle() && !added().length && !groups().length}>
        <div class="ovlist-simnote">Bu adla bir overlay yok.</div>
      </Show>
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
                  title={props.profile.overlays[k].locked ? "Kilitli overlay: taşınamaz, silinemez · sağ tık: Kilidi aç" : "Sürükle: sırala · Çift tık: düzenden çıkar · sağ tık: kilitle, sil"}
                  onPointerDown={(e) => !props.disabled && dragSort(e, { container: e.currentTarget.closest(".ovpal"), selector: ".ovpal-row.on", onDrop: reorder })}
                  onClick={() => props.onSelect(k, type())}
                  onDblClick={() => props.onRemove(k)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    props.onSelect(k, type());
                    // Kilitli / bağlı düzen: menü yok; silme denemesi gibi sayfaya iletilir (kilitliyse bilgi gösterir)
                    if (props.disabled) return void props.onRemove(k);
                    setMenu({ x: e.clientX, y: e.clientY, key: k });
                  }}
                >
                  <span class="ovitem-ic">{overlayIcon(type())}</span>
                  <span class="ovitem-name">{instanceName(k, props.profile.overlays[k])}</span>
                  <Show when={isProOverlay(type())}>
                    <span class="pro-badge small" title="PRO overlay">PRO</span>
                  </Show>
                  <Show when={props.profile.overlays[k].locked}>
                    <button
                      class="ovpal-lock"
                      title="Kilitli: konumu değiştirilemez, silinemez · kilidi açmak için tıkla"
                      onClick={stop(() => (props.disabled ? props.onRemove(k) : toggleLock(k)))}
                      onDblClick={(e) => e.stopPropagation()}
                    >
                      <I.Lock />
                    </button>
                  </Show>
                  <button class="ovpal-btn rem" classList={{ blocked: !!props.disabled || !!props.profile.overlays[k].locked }} title="Düzenden çıkar" onClick={stop(() => props.onRemove(k))} onDblClick={(e) => e.stopPropagation()}>
                    <Minus />
                  </button>
                </div>
              </Show>
            );
          }}
        </For>
      </Show>
      <For each={groupKeys()}>
        {(gk) => {
          const cat = gk === "" ? null : gk;
          const ms = () => groupItems(gk);
          // Arama sırasında hiçbir başlık kapalı sayılmaz (sonuçlar gizlenmesin)
          const closed = () => !needle() && palClosed().includes(gk || "__rest");
          return (
          <>
            <button
              class="ovlist-cap ovlist-captog"
              classList={{ closed: closed() }}
              aria-expanded={!closed()}
              title={closed() ? t("Kategoriyi aç") : t("Kategoriyi kapat")}
              onClick={() => togglePalCat(gk || "__rest")}
            >
              <ChevronDown />
              <span>{cat === FAV_CAT ? t("Favorilerim") : cat === null ? t("Eklenebilir") : CATEGORY_NAMES[cat] ?? cat}</span>
              <small>{ms().length}</small>
            </button>
            <For each={closed() ? [] : ms()}>
              {(m) => {
                const locked = () => isLocked(m.id);
                const again = () => addedTypes().has(m.id);
                return (
                  <div
                    class="ovitem ovpal-row off"
                    classList={{ sel: props.selected === m.id, locked: locked() }}
                    title={locked() ? "PRO üyelere özel" : again() ? "Çift tık: düzene bir tane daha ekle" : "Çift tık: düzene ekle"}
                    onClick={() => props.onSelect(null, m.id)}
                    onDblClick={() => !locked() && props.onAdd(m.id)}
                  >
                    <span class="ovitem-ic">{overlayIcon(m.id)}</span>
                    <span class="ovitem-name">{m.name}</span>
                    <Show when={isAdmin() && markedHiddenOverlay(m.id)}>
                      <span class="hidden-badge" title="Yönetici olmayanlar bu overlay'i görmez">gizli</span>
                    </Show>
                    <Show when={isProOverlay(m.id)}>
                      <span class="pro-badge small" title={locked() ? "PRO üyelere özel" : "PRO overlay"}>PRO</span>
                    </Show>
                    <button class="ovpal-btn add" disabled={locked()} classList={{ blocked: !!props.disabled }} title={again() ? "Düzene bir tane daha ekle" : "Düzene ekle"} onClick={stop(() => props.onAdd(m.id))} onDblClick={(e) => e.stopPropagation()}>
                      <I.Plus />
                    </button>
                  </div>
                );
              }}
            </For>
          </>
          );
        }}
      </For>
      <Show when={menu()} keyed>
        {(m) => (
          <Portal>
            <RowMenu
              x={m.x}
              y={m.y}
              name={props.profile.overlays[m.key] ? instanceName(m.key, props.profile.overlays[m.key]) : ""}
              locked={!!props.profile.overlays[m.key]?.locked}
              onLock={() => toggleLock(m.key)}
              onOpen={() => props.onSelect(m.key, props.profile.overlays[m.key]?.type ?? "")}
              onRemove={() => props.onRemove(m.key)}
              onClose={() => setMenu(null)}
            />
          </Portal>
        )}
      </Show>
      <Show when={sim() && hiddenBySim() > 0}>
        <div class="ovlist-simnote">
          {hiddenBySim()} overlay bu simde çalışmadığı için gizlendi ({SIM_NAMES[sim()!]})
        </div>
      </Show>
    </div>
  );
}

/** "Düzende" listesindeki overlay'in sağ tık menüsü (tuvaldeki menünün kısa hâli) */
function RowMenu(props: { x: number; y: number; name: string; locked: boolean; onLock: () => void; onOpen: () => void; onRemove: () => void; onClose: () => void }) {
  let el: HTMLDivElement | undefined;
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
  fitMenu(() => el, () => ({ x: props.x, y: props.y }));
  const run = (fn: () => void) => () => {
    fn();
    props.onClose();
  };
  return (
    <div
      ref={el}
      class="ctx"
      style={{ left: `${props.x}px`, top: `${props.y}px`, visibility: "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div class="ctx-title">{props.name}</div>
      <button class="ctx-item" onClick={run(props.onLock)}>
        <span>{props.locked ? "Kilidi aç" : "Kilitle"}</span>
        <Show when={!props.locked}>
          <small>konumu değiştirilemez</small>
        </Show>
      </button>
      <button class="ctx-item" onClick={run(props.onOpen)}>
        <span>Ayarlarını aç</span>
      </button>
      <button class="ctx-item" onClick={run(props.onRemove)}>
        <span>Sil</span>
        <small>Delete</small>
      </button>
    </div>
  );
}
