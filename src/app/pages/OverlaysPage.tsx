// Overlaylarım: genel sekme. Solda bütün overlay'ler, ortada seçilen overlay'in VARSAYILAN ayarları,
// sağda canlı önizleme. Buradaki ayarlar düzenlerden bağımsızdır: bir overlay bir düzene eklendiğinde bu ayarlarla
// gelir. Hangi overlay'in hangi düzende olduğu ve yerleşim Düzenler / Yayın sayfalarında yönetilir.

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUpToLine from "lucide-solid/icons/arrow-up-to-line";
import type { OverlayManifest } from "@/sdk/overlay";
import { hasOverlayOrder, moveOverlay, orderedOverlays, resetOverlayOrder } from "../components/OverlayPalette";
import { manifestById, manifests } from "@/sdk/registry";
import { DEFAULTS_ID, settings } from "@/sdk/settings";
import { isAdmin, isHiddenOverlay, isLocked, isProOverlay, markedHiddenOverlay } from "@/cloud/account";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { SIM_NAMES, currentSim, overlaySupportsSim } from "@/overlays/simSupport";
import { OverlayView } from "../components/OverlayView";
import { OverlaySettings, previewVals } from "../components/OverlaySettings";
import { BACKDROPS, Backdrop, ScreenshotPicker, backdrop, pickCustomImage, setBackdrop } from "../components/Backdrop";
import { CATEGORY_NAMES, overlayIcon } from "../overlayIcons";
import { go, openCard, setOpenCard } from "../ui";
import * as I from "../icons";
import { appState } from "../App";
import { UndoRedo } from "@/sdk/UndoRedo";
import { t } from "@/sdk/i18n";

export function OverlaysPage() {
  // Bağlı (ya da seçili) simde çalışmayan overlay'ler listeden gizlenir; ayarları korunur
  const status = useTopic("status");
  const sim = createMemo(() => currentSim(status()));
  const supported = (type: string) => overlaySupportsSim(type, sim());
  // Kullanıcının verdiği sırayla (yoksa kategorilere göre)
  const shown = createMemo(() => orderedOverlays(manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id) && supported(m.id))));
  const shownIds = () => shown().map((m) => m.id);
  const move = (id: string, where: "up" | "down" | "top") => moveOverlay(id, where, shownIds());
  // Sağ tık menüsü: sırayı değiştir
  const [menu, setMenu] = createSignal<{ x: number; y: number; id: string } | null>(null);
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
  /** Toplam overlay türü sayısı (gizlenenler hariç; simde çalışmayanlar dahil) */
  const totalTypes = () => manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id)).length;
  const hiddenBySim = () => manifests.filter((m) => !m.hidden && !isHiddenOverlay(m.id) && !supported(m.id)).length;
  const [shotsOpen, setShotsOpen] = createSignal(false);

  /** Seçili overlay türü (eski kayıtlardan "tür#2" gibi kopya anahtarı gelirse türüne indirgenir) */
  const selected = createMemo(() => {
    const k = (openCard() ?? "").split("#")[0];
    if (k && shown().some((m) => m.id === k)) return k;
    return shown()[0]?.id ?? null;
  });
  createEffect(() => {
    if (selected() && openCard() !== selected()) setOpenCard(selected());
  });
  const inst = () => (selected() ? settings().defaults[selected()!] : undefined);

  // Önizlenen overlay sabit görüntü: seçilince bir anlık örnek veri, sonra akış durur (Demo açıksa canlı)
  const snap = useSnapshot(
    () => manifestById(selected() ?? "")?.topics ?? [],
    // Seçim ya da önizlenen overlay'in ayarı değişince bir tur daha oynar
    () => [selected(), JSON.stringify(inst()?.options ?? null)],
    () => appState().demo,
  );

  /** Kategori başlıklı gruplar; kullanıcı kendi sırasını verdiyse tek düz liste (başlıksız) */
  const groups = createMemo((): [string | null, OverlayManifest[]][] => {
    if (hasOverlayOrder()) return [[null, shown()]];
    const g = new Map<string, OverlayManifest[]>();
    for (const m of shown()) {
      if (!g.has(m.category)) g.set(m.category, []);
      g.get(m.category)!.push(m);
    }
    return [...g.entries()];
  });

  return (
    <div class="ovpage">
      <Show when={menu()}>
        {(() => {
          const m = menu()!;
          const idx = () => shownIds().indexOf(m.id);
          const run = (fn: () => void) => (e: PointerEvent) => {
            e.stopPropagation();
            setMenu(null);
            fn();
          };
          return (
            <div
              class="ovmenu"
              style={{ left: `${Math.max(4, Math.min(m.x, window.innerWidth - 240))}px`, top: `${Math.max(4, Math.min(m.y, window.innerHeight - 200))}px` }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button disabled={idx() <= 0} onPointerUp={run(() => move(m.id, "up"))}>
                <ArrowUp /> Yukarı taşı
              </button>
              <button disabled={idx() < 0 || idx() >= shownIds().length - 1} onPointerUp={run(() => move(m.id, "down"))}>
                <ArrowDown /> Aşağı taşı
              </button>
              <button disabled={idx() <= 0} onPointerUp={run(() => move(m.id, "top"))}>
                <ArrowUpToLine /> En üste taşı
              </button>
              <button disabled={!hasOverlayOrder()} onPointerUp={run(() => resetOverlayOrder())}>
                <I.RotateCcw /> Sıralamayı sıfırla
              </button>
            </div>
          );
        })()}
      </Show>
      <aside class="ovlist">
        <div class="ovlist-profile">
          <span class="ovlist-total" title={t("Kullanılabilir overlay türü sayısı")}>
            {t("{0} overlay", totalTypes())}
          </span>
          <span class="lt-sp" />
          <UndoRedo keys class="ur-panel" />
        </div>
        <div class="ovlist-scroll">
          <Show when={hasOverlayOrder()}>
            <div class="ovlist-cap ovlist-cap-row">
              <span>Kendi sıran</span>
              <button class="link" title="Overlay'leri yeniden kategorilere göre sırala" onClick={() => resetOverlayOrder()}>
                Sıralamayı sıfırla
              </button>
            </div>
          </Show>
          <For each={groups()}>
            {([cat, ms]) => (
              <>
                <Show when={cat !== null}>
                  <div class="ovlist-cap">{CATEGORY_NAMES[cat!] ?? cat}</div>
                </Show>
                <For each={ms}>
                  {(m) => {
                    const idx = () => shownIds().indexOf(m.id);
                    const step = (where: "up" | "down") => (e: MouseEvent) => {
                      e.stopPropagation();
                      move(m.id, where);
                    };
                    return (
                      <button
                        class="ovitem"
                        classList={{ sel: selected() === m.id, locked: isLocked(m.id) }}
                        title="Sağ tık: sırayı değiştir (bu sıra Düzenler ve Yayın sayfalarındaki overlay listesinde de kullanılır)"
                        onClick={() => setOpenCard(m.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          setOpenCard(m.id);
                          setMenu({ x: e.clientX || r.left + 24, y: e.clientY || r.bottom, id: m.id });
                        }}
                      >
                        <span class="ovitem-ic">{overlayIcon(m.id)}</span>
                        <span class="ovitem-name">{m.name}</span>
                        <Show when={isAdmin() && markedHiddenOverlay(m.id)}>
                          <span class="hidden-badge" title="Yönetici olmayanlar bu overlay'i görmez">gizli</span>
                        </Show>
                        <Show when={isProOverlay(m.id)}>
                          <span class="pro-badge small" title={isLocked(m.id) ? "PRO üyelere özel" : "PRO overlay"}>PRO</span>
                        </Show>
                        <span class="ovord">
                          <span role="button" classList={{ off: idx() <= 0 }} title="Yukarı taşı" onClick={step("up")}>
                            <ArrowUp />
                          </span>
                          <span role="button" classList={{ off: idx() >= shownIds().length - 1 }} title="Aşağı taşı" onClick={step("down")}>
                            <ArrowDown />
                          </span>
                        </span>
                      </button>
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
        <div class="ovlist-foot">
          <button class="btn primary wide" title="Overlay'leri ekrana yerleştirmek için Düzenler sayfasını açar" onClick={() => go("layouts")}>
            <I.Plus /> Düzen oluştur
          </button>
        </div>
      </aside>

      <Show when={selected()} keyed fallback={<div class="ovset" />}>
        {(k) => <OverlaySettings key={k} profileId={DEFAULTS_ID} mode="defaults" />}
      </Show>

      <section class="ovpreview">
        <Backdrop />
        <Show when={selected()} keyed>
          {(k) => (
            <Show when={inst()}>
              <div class="ovpreview-stage" style={{ opacity: Math.min(inst()!.opacity, settings().theme.opacity / 100) }}>
                <div style={{ transform: `scale(${Math.min(1.4, inst()!.scale * (settings().theme.scale / 100))})` }} class="ovpreview-item">
                  <OverlayView type={k} options={{ ...inst()!.options, ...previewVals(k) }} look={inst()!.look} bgOpacity={inst()!.bgOpacity} />
                </div>
                <Show when={isLocked(k) || Object.keys(previewVals(k)).length > 0}>
                  <div class="ovpreview-pro">
                    <span class="pro-badge small">PRO</span>{" "}
                    {isLocked(k) ? "Önizleme — bu overlay PRO üyelere özel" : "Önizleme — seçtiğin tasarım PRO üyelere özel, kaydedilmedi"}
                  </div>
                </Show>
              </div>
            </Show>
          )}
        </Show>
        <Show when={!snap() && !appState().demo && selected()}>
          <button
            class="btn ghost"
            style={{ position: "absolute", top: "12px", right: "12px", "z-index": 3 }}
            title="Örnek veri birkaç saniye oynar, sonra görüntü sabit kalır"
            onClick={() => snap.replay()}
          >
            ▶ Önizlemeyi oynat
          </button>
        </Show>
        <div class="ovpreview-bar">
          <For each={BACKDROPS.filter((b) => b.id !== "custom")}>
            {(b) => (
              <button classList={{ on: backdrop() === b.id }} onClick={() => setBackdrop(b.id)}>
                {b.name}
              </button>
            )}
          </For>
          <button classList={{ on: shotsOpen() }} onClick={() => setShotsOpen(!shotsOpen())} title="SRTR Pitwall ve iRacing ekran görüntülerinden seç">
            <I.Car /> Ekran görüntüsü
          </button>
          <Show when={shotsOpen()}>
            <ScreenshotPicker onClose={() => setShotsOpen(false)} />
          </Show>
          <label class="ovpreview-upload" classList={{ on: backdrop() === "custom" }}>
            <I.ImagePlus /> Kendi görselin
            <input type="file" accept="image/*" onChange={(e) => e.currentTarget.files?.[0] && pickCustomImage(e.currentTarget.files[0])} />
          </label>
          <span class="ovpreview-note">
            {appState().connected ? "Canlı veri" : appState().demo ? "Demo verisi" : "Önizleme verisi"}
          </span>
        </div>
      </section>
    </div>
  );
}
