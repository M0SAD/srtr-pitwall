// Düzen listesi ("Düzenlerim" ve "Yayın düzenleri"): iki sayfada aynı başlık, satırlar ve sağ tık menüsü.
//  Başlık: liste adı + "+" (yeni düzen). Satır: ad (çift tık: yeniden adlandır) + çöp kutusu (onay sorar).
//  Her listede tam bir "varsayılan" düzen vardır (yıldız): silinemez; başka bir düzen yıldızıyla ya da sağ tık › Varsayılan yap
//  ile varsayılan yapılabilir (eskisi o zaman silinebilir olur). Listedeki son düzen silinemez.
//  Kilit: satırdaki kilit simgesi (ya da sağ tık › Kilitle) düzeni kilitler: yerleşimi ve overlay ayarları değiştirilemez,
//  yeniden adlandırılamaz, silinemez.
//  Sağ tık: Düzeni kopyala, Yeniden adlandır, Kilitle / Kilidi aç, OBS adresini kopyala / Bağlantıyı kopar (yayın), Toplulukta paylaş,
//           Yukarı / Aşağı taşı, Sil.
//  Klavye (satır odaktayken): F2 = yeniden adlandır, Delete = sil (onay sorar).

import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { askConfirm } from "../confirm";
import { dragSort } from "../dragSort";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import { t } from "@/sdk/i18n";
import { defaultProfileId, setDefaultProfile, settings, updateSettings, type Profile } from "@/sdk/settings";
import * as I from "../icons";
import { copyProfileBackdrop } from "./Shots";

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

/** Aynı türdeki listede `to` sırasına taşır (sürükleyerek sıralama) */
export function reorderProfile(id: string, to: number) {
  updateSettings((d) => {
    const me = d.profiles[id];
    if (!me) return;
    const group = sortProfiles(Object.values(d.profiles).filter((p) => isStream(p) === isStream(me)));
    const i = group.findIndex((p) => p.id === id);
    if (i < 0) return;
    group.splice(Math.max(0, Math.min(to, group.length - 1)), 0, ...group.splice(i, 1));
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
    // Kopya kilitsiz ve paylaşılmamış başlar
    delete p.locked;
    delete p.sharedId;
    delete p.isDefault;
    d.profiles[nid] = p;
  });
  // Kopya aynı tuval arka planıyla görünür (kaynağın kendi görseli varsa kopyaya da yazılır)
  if (src.backdrop?.own) void copyProfileBackdrop(id, nid);
  return nid;
}

/** İlk oluşturulan varsayılan düzenlerin kimlikleri (eski kayıtlarla uyum: işaret yoksa bunlar varsayılandır) */
export const FIXED_LAYOUT = "default";
export const FIXED_STREAM = "stream-default";

/** Silinemeyen varsayılan düzen (işaretli olan; yoksa eski sabit kimlik, o da yoksa listenin ilki) */
export function fixedProfileId(stream: boolean): string | undefined {
  // Yayın düzenlerinde varsayılan / silinemeyen düzen yoktur
  return stream ? undefined : defaultProfileId(false);
}

/** Düzeni kilitler / kilidini açar */
export function toggleProfileLock(id: string) {
  updateSettings((d) => {
    const p = d.profiles[id];
    if (!p) return;
    if (p.locked) delete p.locked;
    else p.locked = true;
  });
}

/** Siler (onay sorar). Varsayılan düzen, türünün son düzeni ve kilitli düzenler silinemez. Silindiyse true. */
export async function removeProfile(id: string): Promise<boolean> {
  const p = settings().profiles[id];
  if (!p) return false;
  const stream = isStream(p);
  const count = Object.values(settings().profiles).filter((x) => isStream(x) === stream).length;
  if (fixedProfileId(stream) === id || p.locked || (!stream && count <= 1)) return false;
  const ok = await askConfirm(stream ? t('"{0}" yayın düzeni silinsin mi?', p.name) : t('"{0}" düzeni silinsin mi?', p.name), {
    note: t("Düzendeki overlay'ler ve ayarları da silinir. Bu işlem geri alınamaz."),
    ok: t("Sil"),
    danger: true,
  });
  if (!ok || !settings().profiles[id]) return false;
  updateSettings((d) => {
    delete d.profiles[id];
    if (!d.profiles[d.activeProfile]) d.activeProfile = defaultProfileId(false, d) ?? Object.keys(d.profiles)[0];
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
  /** Liste başlığı ("Düzenlerim" / "Yayın düzenleri") */
  title: string;
  /** Başlıktaki "+" düğmesi: yeni düzen */
  onAdd: () => void;
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
  const fixed = () => fixedProfileId(stream());
  const isFixed = (id: string) => fixed() === id;
  const isLockedP = (id: string) => !!settings().profiles[id]?.locked;
  const canRemove = (id: string) => !isFixed(id) && !isLockedP(id) && (stream() || props.list.length > 1);
  const startRename = (id: string) => !isLockedP(id) && setRenaming(id);
  const remove = async (id: string) => {
    const i = props.list.findIndex((p) => p.id === id);
    const next = props.list[i + 1]?.id ?? props.list[i - 1]?.id ?? "";
    if (!(await removeProfile(id))) return;
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
                <button
                  onPointerUp={run(() => {
                    const id = duplicateProfile(m.id);
                    if (id) props.onSelect(id);
                  })}
                >
                  <I.Copy /> Düzeni kopyala
                </button>
                <button disabled={!!prof().locked} onPointerUp={run(() => (props.onSelect(m.id), startRename(m.id)))}>
                  <I.Pencil /> Yeniden adlandır
                </button>
                <button onPointerUp={run(() => toggleProfileLock(m.id))} title="Kilitli düzenin yerleşimi ve overlay ayarları değiştirilemez, düzen silinemez">
                  <Show when={prof().locked} fallback={<><I.Lock /> Kilitle</>}>
                    <I.LockOpen /> Kilidi aç
                  </Show>
                </button>
                <Show when={!stream()}>
                  <button disabled={isFixed(m.id)} onPointerUp={run(() => setDefaultProfile(m.id))} title="Varsayılan düzen silinemez; seçili düzen kaybolursa buna dönülür">
                    <I.Star /> {isFixed(m.id) ? "Varsayılan düzen" : "Varsayılan yap"}
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
                <Show when={props.onUnlink && prof().link && !prof().locked}>
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
                <button class="danger" disabled={!canRemove(m.id)} onPointerUp={run(() => remove(m.id))}>
                  <I.Trash /> Sil
                </button>
              </div>
            </Show>
          );
        })()}
      </Show>
      <div class="llist-head">
        <span>{props.title}</span>
        <button class="llist-add" title={stream() ? "Yeni yayın düzeni" : "Yeni düzen"} onClick={() => props.onAdd()}>
          <I.Plus />
        </button>
      </div>
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
              <div
                class="ovitem llist-row"
                classList={{ sel: props.selId === x.id }}
                tabindex="0"
                role="button"
                title={x.locked ? "Kilitli düzen: değiştirilemez · kilidi açmak için kilit simgesine tıkla" : "Sürükle: sırala · Çift tık: yeniden adlandır · Sağ tık: kopyala, varsayılan yap, kilitle, taşı, sil · Delete: sil"}
                onPointerDown={(e) => dragSort(e, { container: e.currentTarget.parentElement, selector: ".llist-row", onDrop: (_f, to) => reorderProfile(x.id, to) })}
                onClick={() => props.onSelect(x.id)}
                onDblClick={() => startRename(x.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  // Klavyeden açıldıysa (Menü tuşu) koordinat gelmez: satırın altına aç
                  setMenu({ x: e.clientX || r.left + 24, y: e.clientY || r.bottom, id: x.id });
                }}
                onKeyDown={(e) => {
                  if (e.key === "F2") {
                    e.preventDefault();
                    startRename(x.id);
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onSelect(x.id);
                  } else if (e.key === "Delete" && canRemove(x.id)) {
                    e.preventDefault();
                    remove(x.id);
                  }
                }}
              >
                <span class="ovitem-ic">{props.icon()}</span>
                <span class="ovitem-name">{x.name}</span>
                <Show when={x.link}>
                  <span class="llist-tag" title="Başka bir düzene bağlı">
                    <I.Link2 />
                  </span>
                </Show>
                <button
                  class="llist-lock"
                  classList={{ on: !!x.locked }}
                  title={x.locked ? "Kilitli: değiştirilemez · kilidi aç" : "Düzeni kilitle (değiştirilemez, silinemez)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProfileLock(x.id);
                  }}
                  onDblClick={(e) => e.stopPropagation()}
                >
                  <Show when={x.locked} fallback={<I.LockOpen />}>
                    <I.Lock />
                  </Show>
                </button>
                <Show when={!stream()}>
                  <button
                    class="llist-def"
                    classList={{ on: isFixed(x.id) }}
                    title={isFixed(x.id) ? "Varsayılan düzen: silinemez (başka bir düzeni varsayılan yapabilirsin)" : "Varsayılan yap"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isFixed(x.id)) setDefaultProfile(x.id);
                    }}
                    onDblClick={(e) => e.stopPropagation()}
                  >
                    <I.Star />
                  </button>
                </Show>
                <Show when={canRemove(x.id)}>
                  <button
                    class="llist-del"
                    title="Sil"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(x.id);
                    }}
                    onDblClick={(e) => e.stopPropagation()}
                  >
                    <I.Trash />
                  </button>
                </Show>
              </div>
            </Show>
          )}
        </For>
      </Show>
    </>
  );
}
