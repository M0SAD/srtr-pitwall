// Overlay'ler: solda liste (açık kopyalar + tüm overlay'ler), ortada seçilenin ayarları,
// sağda oyun üstünde canlı önizleme.

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { canDuplicate, manifestById, manifests } from "@/sdk/registry";
import {
  activeProfile,
  addInstance,
  defaultInstance,
  instanceName,
  instancesOf,
  removeInstance,
  settings,
  updateOverlay,
  updateSettings,
} from "@/sdk/settings";
import { defaultOptions, type SettingField } from "@/sdk/overlay";
import { isAdmin, isHiddenOverlay, isLocked, isProOverlay, markedHiddenOverlay } from "@/cloud/account";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { SIM_NAMES, currentSim, overlaySupportsSim } from "@/overlays/simSupport";
import { centerInstance, loadMonitors, monitorLabel, monitors } from "@/sdk/monitors";
import { SettingsForm, Slider, Switch } from "../components/SettingsForm";
import { OverlayView } from "../components/OverlayView";
import { LookPanel } from "../components/LookPanel";
import { BACKDROPS, Backdrop, ScreenshotPicker, backdrop, pickCustomImage, setBackdrop } from "../components/Backdrop";
import { CATEGORY_NAMES, overlayIcon } from "../overlayIcons";
import { go, openCard, ovProfile, setOpenCard, setOvProfile } from "../ui";
import { sortProfiles } from "../components/LayoutList";
import { LINK_ACTIVE } from "@/sdk/streamLink";
import { emit } from "@tauri-apps/api/event";
import * as I from "../icons";
import { appState } from "../App";
import { inTauri } from "@/sdk/platform";
import { UndoRedo } from "@/sdk/UndoRedo";
import { t } from "@/sdk/i18n";

// Yeni eklenen overlay: bu sayfada seçili kaldıkça ekranda (oyun kapalıyken örnek veriyle) tutulur; ilk 4 sn vurgulanır.
// Sayfadan çıkınca, başka overlay seçilince, overlay kapatılınca ya da panel kapanınca bırakılır (Rust: overlay_pin).
const [pinned, setPinned] = createSignal<string | null>(null);
/** Düzenlenen düzenin kimliği: sayfada seçili düzen; "Etkin düzeni izle"de (ya da seçili düzen silindiyse) etkin düzen */
const editedId = () => {
  const o = ovProfile();
  const s = settings();
  return o && s.profiles[o] ? o : s.activeProfile;
};
// Ekranda tutma, seçili düzenin kopyasını gösterir (overlay penceresi o düzene geçer). Yayın düzenlerinin konumları
// OBS tuvaline göre olduğundan ekranda tutulmaz; onlar sadece sayfadaki önizlemede görünür.
function pinOverlay(key: string) {
  const p = settings().profiles[editedId()];
  if (!p || p.rules.mode === "stream") return;
  setPinned(key);
  if (!inTauri) return;
  invoke("overlay_pin", { id: key, profile: p.id }).catch(() => {});
  invoke("overlay_peek", { id: key, ms: 4000 }).catch(() => {});
}
function unpinOverlay() {
  if (!pinned()) return;
  setPinned(null);
  if (inTauri) invoke("overlay_pin", { id: null }).catch(() => {});
}

function Section(props: { title: string; open?: boolean; children: any }) {
  const [open, setOpen] = createSignal(props.open ?? true);
  return (
    <section class="osec" classList={{ closed: !open() }}>
      <button class="osec-head" onClick={() => setOpen(!open())}>
        <span>{props.title}</span>
        <I.ChevronDown />
      </button>
      <Show when={open()}>
        <div class="osec-body">{props.children}</div>
      </Show>
    </section>
  );
}

export function OverlaysPage() {
  loadMonitors();
  // Düzenlenen düzen: baştaki "Düzen" seçicisiyle belirlenir; bütün okuma ve yazmalar bu düzene gider
  const pid = createMemo(editedId);
  const profile = () => settings().profiles[pid()] ?? activeProfile();
  const following = () => ovProfile() === null;
  // Seçili düzen silindiyse etkin düzeni izlemeye dön
  createEffect(() => {
    const o = ovProfile();
    if (o && !settings().profiles[o]) setOvProfile(null);
  });
  const isStreamP = () => profile().rules.mode === "stream";
  /** Bağlı yayın düzeni: overlay'leri kaynak düzenden canlı gelir, burada düzenlenmez */
  const linked = () => (isStreamP() ? profile().link : undefined);
  const linkedSrc = () => {
    const l = linked();
    if (!l) return undefined;
    return l.source === LINK_ACTIVE ? activeProfile() : settings().profiles[l.source];
  };
  const drivingList = () => sortProfiles(Object.values(settings().profiles).filter((p) => p.rules.mode !== "stream"));
  const streamList = () => sortProfiles(Object.values(settings().profiles).filter((p) => p.rules.mode === "stream"));
  const upd = (k: string, fn: Parameters<typeof updateOverlay>[1]) => updateOverlay(k, fn, pid());
  const list = createMemo(() => (linked() ? [] : instancesOf(profile())));
  // Bağlı (ya da seçili) simde çalışmayan overlay'ler listelerden gizlenir; ayarları korunur
  const status = useTopic("status");
  const sim = createMemo(() => currentSim(status()));
  const supported = (type: string) => overlaySupportsSim(type, sim());
  /** Açık kopyaların hepsi (simde gizlenenler dahil) */
  const enabledAll = () => list().filter(([, i]) => i.enabled && !isHiddenOverlay(i.type));
  const active = () => enabledAll().filter(([, i]) => supported(i.type));
  /** Bu türden açık bir overlay varsa anahtarı */
  const existing = (type: string) => enabledAll().find(([, i]) => i.type === type)?.[0] ?? null;
  /** Toplam overlay türü sayısı (gizlenenler hariç; simde çalışmayanlar dahil) */
  const totalTypes = () => manifests.filter((m) => !isHiddenOverlay(m.id)).length;
  /** Bu simde çalışmadığı için gizlenen overlay türü sayısı */
  const hiddenBySim = () => manifests.filter((m) => !isHiddenOverlay(m.id) && !supported(m.id)).length;

  const [adding, setAdding] = createSignal(false);
  // "Tümünü kaldır": listedeki açık overlay'leri tek bir ayar güncellemesiyle kapatır (onaylı)
  const [confirmAll, setConfirmAll] = createSignal(false);
  createEffect(() => {
    if (active().length === 0) setConfirmAll(false);
  });
  createEffect(
    on(
      pid,
      () => {
        setConfirmAll(false);
        setAdding(false);
        // Ekranda tutulan overlay önceki düzene aitti
        unpinOverlay();
      },
      { defer: true },
    ),
  );
  const removeAll = () => {
    const keys = active().map(([k]) => k);
    setConfirmAll(false);
    if (!keys.length) return;
    const id = pid();
    updateSettings((d) => {
      const p = d.profiles[id];
      if (!p) return;
      for (const k of keys) if (p.overlays[k]) p.overlays[k].enabled = false;
    });
  };

  // Listede sağ tık: ekle / kaldır / ayarlar
  const [menu, setMenu] = createSignal<{ x: number; y: number; key: string; type: string } | null>(null);
  const openMenu = (e: MouseEvent, key: string, type: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, key, type });
  };
  const addOverlay = (type: string) => {
    const ex = existing(type);
    if (ex && !canDuplicate(type, settings().general.allowDuplicates)) {
      setOpenCard(ex);
      return;
    }
    const base = profile().overlays[type];
    const key = base && !base.enabled ? (upd(type, (o) => (o.enabled = true)), type) : addInstance(type, pid());
    centerInstance(key, pid());
    setOpenCard(key);
    pinOverlay(key);
  };
  onMount(() => {
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    onCleanup(() => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    });
  });
  // Ekranda tutulan overlay: seçim değişince ya da overlay kapatılınca / silinince bırak
  createEffect(() => {
    const k = pinned();
    if (!k) return;
    if (openCard() !== k || !profile().overlays[k]?.enabled) unpinOverlay();
  });
  onCleanup(unpinOverlay);
  const [shotsOpen, setShotsOpen] = createSignal(false);

  // Seçili kopya (sağ tık > "Ayarlarını aç" ile de gelir)
  const selected = () => {
    const k = openCard();
    if (linked()) return null;
    if (k && profile().overlays[k]) return k;
    return active()[0]?.[0] ?? list()[0]?.[0] ?? null;
  };
  createEffect(() => {
    const k = openCard();
    // Seçili kart bu düzende yoksa (düzen değişti, kopya burada yok) bu düzendeki ilk overlay'e geç
    if (selected() && (!k || (!profile().overlays[k] && !manifestById(k)))) setOpenCard(selected());
  });

  // Önizlenen overlay sabit görüntü: seçilince bir anlık örnek veri, sonra akış durur (Demo açıksa canlı)
  // Profilde olmayan (ör. PRO olmadığı için eklenemeyen) bir overlay'e tıklanınca varsayılan ayarlarla önizleme
  const ghost = () => {
    const k = openCard();
    return !linked() && k && !profile().overlays[k] && manifestById(k) ? k : null;
  };
  const previewType = () => {
    if (ghost()) return ghost()!;
    const k = selected();
    return k ? profile().overlays[k]?.type ?? "" : "";
  };
  const snap = useSnapshot(
    () => manifestById(previewType())?.topics ?? [],
    // Seçim ya da önizlenen overlay'in ayarı değişince bir tur daha oynar
    () => [pid(), selected(), previewType(), JSON.stringify(profile().overlays[selected() ?? ""]?.options ?? null)],
    () => appState().demo,
  );

  const byCat = createMemo(() => {
    const g = new Map<string, typeof manifests>();
    for (const m of manifests) {
      if (isHiddenOverlay(m.id) || !supported(m.id)) continue;
      const c = m.category;
      if (!g.has(c)) g.set(c, []);
      g.get(c)!.push(m);
    }
    return [...g.entries()];
  });

  return (
    <div class="ovpage">
      <Show when={menu()}>
        {(() => {
          const m = menu()!;
          const inst = () => profile().overlays[m.key];
          const on = () => !!inst()?.enabled;
          const run = (fn: () => void) => (e: PointerEvent) => {
            e.stopPropagation();
            fn();
            setMenu(null);
          };
          return (
            <div class="ovmenu" style={{ left: `${Math.min(m.x, window.innerWidth - 220)}px`, top: `${Math.min(m.y, window.innerHeight - 160)}px` }} onPointerDown={(e) => e.stopPropagation()}>
              <Show
                when={on()}
                fallback={
                  <button disabled={isLocked(m.type)} onPointerUp={run(() => addOverlay(m.type))}>
                    <I.Plus /> Overlay ekle
                  </button>
                }
              >
                <button onPointerUp={run(() => upd(m.key, (o) => (o.enabled = false)))}>
                  <I.EyeOff /> Kaldır
                </button>
                <Show when={canDuplicate(m.type, settings().general.allowDuplicates)}>
                  <button disabled={isLocked(m.type)} onPointerUp={run(() => addOverlay(m.type))}>
                    <I.Copy /> Aynısından ekle
                  </button>
                </Show>
              </Show>
              <button onPointerUp={run(() => setOpenCard(m.key))}>
                <I.Settings /> Ayarlarını aç
              </button>
            </div>
          );
        })()}
      </Show>
      <aside class="ovlist">
        <div class="ovlist-profile">
          <span class="ovlist-plabel">Düzen:</span>
          <select
            class="f2-select"
            title={t("Bu sayfada ayarları düzenlenen düzen. Buradaki seçim etkin düzeni değiştirmez.")}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setOvProfile(v === "@follow" ? null : v);
            }}
          >
            <option value="@follow" selected={following()}>
              {t("Etkin düzeni izle ({0})", activeProfile().name)}
            </option>
            <optgroup label={t("Düzenler")}>
              <For each={drivingList()}>
                {(p) => (
                  <option value={p.id} selected={!following() && pid() === p.id}>
                    {settings().activeProfile === p.id ? t("{0} (etkin)", p.name) : p.name}
                  </option>
                )}
              </For>
            </optgroup>
            <Show when={streamList().length > 0}>
              <optgroup label={t("Yayın düzenleri")}>
                <For each={streamList()}>
                  {(p) => (
                    <option value={p.id} selected={!following() && pid() === p.id}>
                      {p.link ? t("{0} (bağlı)", p.name) : p.name}
                    </option>
                  )}
                </For>
              </optgroup>
            </Show>
          </select>
          <button class="icon-btn" title="Düzenleri yönet" onClick={() => go("layouts")}>
            <I.LayoutDashboard />
          </button>
          <UndoRedo keys class="ur-panel" />
        </div>
        <Show when={pid() !== settings().activeProfile}>
          <div class="ovlist-pnote">
            <Show
              when={isStreamP()}
              fallback={
                <>
                  <span>{t("\"{0}\" düzenleniyor · şu an etkin düzen: {1}", profile().name, activeProfile().name)}</span>
                  <button class="link" onClick={() => { const id = pid(); updateSettings((d) => void (d.profiles[id] && (d.activeProfile = id))); }}>
                    Etkin yap
                  </button>
                </>
              }
            >
              <span>{t("Yayın düzeni (OBS) düzenleniyor: {0}", profile().name)}</span>
              <button class="link" onClick={() => go("streaming")}>
                Yayın sayfası
              </button>
            </Show>
          </div>
        </Show>
        <Show when={linked()}>
          <div class="ovlist-scroll">
            <div class="locked-note ovlist-linked">
              <Show
                when={linkedSrc()}
                fallback={<>Bu yayın düzeni başka bir düzene bağlı; kaynak düzen bulunamadı. Bağlantıyı Yayın sayfasından düzenleyebilirsin.</>}
              >
                {t("Bu yayın düzeni \"{0}\" düzenine bağlı: overlay'leri ve ayarları o düzenden canlı gelir, burada düzenlenmez.", linkedSrc()!.name)}{" "}
                <button class="link" onClick={() => setOvProfile(linked()!.source === LINK_ACTIVE ? null : linkedSrc()!.id)}>
                  Kaynak düzeni düzenle
                </button>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={!linked()}>
        <div class="ovlist-scroll">
          <div class="ovlist-total" title={t("Kullanılabilir overlay türü sayısı ve bu düzende açık olanlar")}>
            {t("{0} overlay · {1} açık", totalTypes(), enabledAll().length)}
          </div>
          <div class="ovlist-cap ovlist-cap-row">
            <span>Açık overlay'ler</span>
            <Show when={active().length > 0}>
              <Show
                when={confirmAll()}
                fallback={
                  <button class="ovlist-capbtn" title="Bu düzendeki açık overlay'lerin hepsini kapat" onClick={() => setConfirmAll(true)}>
                    Tümünü kaldır
                  </button>
                }
              >
                <span class="ovlist-confirm">
                  Emin misin?
                  <button class="ovlist-capbtn danger" onClick={removeAll}>
                    Evet
                  </button>
                  <button class="ovlist-capbtn" onClick={() => setConfirmAll(false)}>
                    Vazgeç
                  </button>
                </span>
              </Show>
            </Show>
          </div>
          <Show when={active().length > 0} fallback={<div class="ovlist-empty">Açık overlay yok</div>}>
            <For each={active()}>
              {([k, inst]) => (
                <button
                  class="ovitem on"
                  classList={{ sel: selected() === k, locked: isLocked(inst.type) }}
                  onClick={() => setOpenCard(k)}
                  onContextMenu={(e) => openMenu(e, k, inst.type)}
                >
                  <span class="ovitem-ic">{overlayIcon(inst.type)}</span>
                  <span class="ovitem-name">{instanceName(k, inst)}</span>
                  <Show when={monitors().length > 1 && inst.monitor}>
                    <span class="ovitem-mon" title="Monitör">
                      <I.Monitor />
                    </span>
                  </Show>
                  <span
                    class="ovitem-eye"
                    title="Kapat"
                    onClick={(e) => {
                      e.stopPropagation();
                      upd(k, (o) => (o.enabled = false));
                    }}
                  >
                    <I.Eye />
                  </span>
                </button>
              )}
            </For>
          </Show>
          <For each={byCat()}>
            {([cat, ms]) => (
              <>
                <div class="ovlist-cap">{CATEGORY_NAMES[cat] ?? cat}</div>
                <For each={ms}>
                  {(m) => {
                    const inst = () => profile().overlays[m.id];
                    return (
                      <button
                        class="ovitem"
                        classList={{ sel: selected() === m.id, off: !inst()?.enabled, on: !!inst()?.enabled, locked: isLocked(m.id) }}
                        onClick={() => setOpenCard(m.id)}
                        onContextMenu={(e) => openMenu(e, m.id, m.id)}
                      >
                        <span class="ovitem-ic">{overlayIcon(m.id)}</span>
                        <span class="ovitem-name">{m.name}</span>
                        <Show when={isAdmin() && markedHiddenOverlay(m.id)}>
                          <span class="hidden-badge" title="Yönetici olmayanlar bu overlay'i görmez">gizli</span>
                        </Show>
                        <Show when={isProOverlay(m.id)}>
                          <span class="pro-badge small" title={isLocked(m.id) ? "PRO üyelere özel" : "PRO overlay"}>PRO</span>
                        </Show>
                        <Show when={inst()?.enabled}>
                          <span class="ovitem-on" title="Açık">
                            <I.Eye />
                          </span>
                        </Show>
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
          <button class="btn primary wide" onClick={() => setAdding(!adding())}>
            <I.Plus /> Overlay ekle
          </button>
          <Show when={adding()}>
            <div class="addmenu">
              <For each={manifests.filter((m) => !isHiddenOverlay(m.id) && supported(m.id))}>
                {(m) => (
                  <button
                    disabled={isLocked(m.id)}
                    classList={{ added: !canDuplicate(m.id, settings().general.allowDuplicates) && !!existing(m.id) }}
                    title={
                      !canDuplicate(m.id, settings().general.allowDuplicates) && existing(m.id)
                        ? "Zaten ekli. Aynı overlay'den birden fazla eklemek için Ayarlar → Genel'den izin ver."
                        : undefined
                    }
                    onClick={() => {
                      setAdding(false);
                      const ex = existing(m.id);
                      // Birden fazla eklemeye izin yoksa var olanı aç
                      if (ex && !canDuplicate(m.id, settings().general.allowDuplicates)) {
                        setOpenCard(ex);
                        return;
                      }
                      const base = profile().overlays[m.id];
                      const key = base && !base.enabled ? (upd(m.id, (o) => (o.enabled = true)), m.id) : addInstance(m.id, pid());
                      centerInstance(key, pid());
                      setOpenCard(key);
                      // Overlay'ler gizli ya da oyun kapalı olsa bile ekranda göster (bu sayfada seçili kaldıkça)
                      pinOverlay(key);
                    }}
                  >
                    <span class="ovitem-ic">{overlayIcon(m.id)}</span>
                    {m.name}
                    <Show when={!canDuplicate(m.id, settings().general.allowDuplicates) && existing(m.id)}>
                      <span class="added-tag">ekli</span>
                    </Show>
                    <Show when={isProOverlay(m.id)}>
                      <span class="pro-badge small">PRO</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        </Show>
      </aside>

      <Show
        when={!ghost() && selected()}
        keyed
        fallback={
          <Show when={ghost()} keyed fallback={<div class="ovset" />}>
            {(g) => (
              <aside class="ovset">
                <header class="ovset-head">
                  <span class="ovset-ic">{overlayIcon(g)}</span>
                  <div>
                    <b>{manifestById(g)!.name}</b>
                    <small>{manifestById(g)!.description}</small>
                  </div>
                </header>
                <Show when={isLocked(g)}>
                  <div class="locked-note">
                    Bu overlay PRO üyelere özel. Önizlemede görebilirsin, eklemek için PRO gerekir.{" "}
                    <button class="link" onClick={() => go("pro")}>
                      PRO'ya bak
                    </button>
                  </div>
                </Show>
              </aside>
            )}
          </Show>
        }
      >
        {(k) => <InstanceSettings key={k} profileId={pid()} />}
      </Show>

      <section class="ovpreview">
        <Backdrop />
        <Show when={ghost()} keyed>
          {(g) => (
            <div class="ovpreview-stage" style={{ opacity: settings().theme.opacity / 100 }}>
              <div style={{ transform: `scale(${Math.min(1.4, settings().theme.scale / 100)})` }} class="ovpreview-item">
                <OverlayView type={g} options={defaultOptions(manifestById(g)!)} />
              </div>
              <div class="ovpreview-pro">
                <Show when={isLocked(g)} fallback={<>Önizleme — eklemek için "Overlay ekle"yi kullan</>}>
                  <span class="pro-badge small">PRO</span> Önizleme — bu overlay PRO üyelere özel
                </Show>
              </div>
            </div>
          )}
        </Show>
        <Show when={!ghost() && selected()} keyed>
          {(k) => {
            const inst = () => profile().overlays[k];
            return (
              <Show when={inst()}>
                <div class="ovpreview-stage" style={{ opacity: Math.min(inst()!.opacity, settings().theme.opacity / 100) }}>
                  <div style={{ transform: `scale(${Math.min(1.4, inst()!.scale * (settings().theme.scale / 100))})` }} class="ovpreview-item">
                    <OverlayView type={inst()!.type} options={{ ...inst()!.options, ...previewVals(k) }} look={inst()!.look} />
                  </div>
                  <Show when={isLocked(inst()!.type) || Object.keys(previewVals(k)).length > 0}>
                    <div class="ovpreview-pro">
                      <span class="pro-badge small">PRO</span>{" "}
                      {isLocked(inst()!.type) ? "Önizleme — bu overlay PRO üyelere özel" : "Önizleme — seçtiğin tasarım PRO üyelere özel, kaydedilmedi"}
                    </div>
                  </Show>
                </div>
              </Show>
            );
          }}
        </Show>
        <Show when={!snap() && !appState().demo && previewType()}>
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

// PRO olmayan üyenin seçtiği kilitli (PRO) seçenekler: kaydedilmez, sadece önizlemede gösterilir
const [pv, setPv] = createSignal<{ key: string; vals: Record<string, unknown> }>({ key: "", vals: {} });
const previewVals = (k: string) => (pv().key === k ? pv().vals : {});
function setPreviewVal(k: string, key: string, value: unknown) {
  const cur = pv().key === k ? { ...pv().vals } : {};
  if (value === undefined) delete cur[key];
  else cur[key] = value;
  setPv({ key: k, vals: cur });
}

function InstanceSettings(props: { key: string; profileId: string }) {
  const k = props.key;
  // Sayfada seçili düzenin kopyası (etkin düzen değil)
  const inst = () => settings().profiles[props.profileId]?.overlays[k];
  // Tür değişmedikçe aynı kalsın: ayar değişince form yeniden kurulmasın (kaydırıcı sürüklemesi
  // kopmasın, sütun sıralarken sayfa başa kaymasın)
  const type = createMemo(() => inst()?.type ?? "");
  const m = createMemo(() => manifestById(type()));
  const isCopy = () => inst() && k !== inst()!.type;
  const upd = (fn: Parameters<typeof updateOverlay>[1]) => updateOverlay(k, fn, props.profileId);

  // Alanları gruplara ayır (grup verilmemişse overlay adı)
  const groups = createMemo(() => {
    const man = m();
    if (!man) return [] as [string, SettingField[]][];
    const g = new Map<string, SettingField[]>();
    for (const f of man.settings) {
      const name = f.group ?? man.name;
      if (!g.has(name)) g.set(name, []);
      g.get(name)!.push(f);
    }
    return [...g.entries()];
  });

  return (
    <Show when={inst() && m()}>
      <aside class="ovset">
        <header class="ovset-head">
          <span class="ovset-ic">{overlayIcon(inst()!.type)}</span>
          <div>
            <b>{instanceName(k, inst()!)}</b>
            <small>{m()!.description}</small>
          </div>
        </header>
        <div class="ovset-scroll">
          <Show when={isLocked(inst()!.type)}>
            <div class="locked-note">
              Bu overlay PRO üyelere özel.{" "}
              <button class="link" onClick={() => go("pro")}>
                PRO'ya bak
              </button>
            </div>
          </Show>
          <Section title="Genel">
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">Ekranda göster</span>
                <Switch checked={inst()!.enabled && !isLocked(inst()!.type)} disabled={isLocked(inst()!.type)} onChange={(v) => upd((o) => (o.enabled = v))} />
              </div>
            </div>
            <Show when={isCopy()}>
              <div class="f2">
                <div class="f2-cap">Kopya adı</div>
                <input class="input f2-text" value={inst()!.name} placeholder={instanceName(k, { ...inst()!, name: "" })} onChange={(e) => upd((o) => (o.name = e.currentTarget.value.trim()))} />
              </div>
            </Show>
            <div class="f2">
              <div class="f2-cap">Opaklık</div>
              <Slider value={Math.round(inst()!.opacity * 100)} min={20} max={100} step={5} unit="%" onInput={(v) => upd((o) => (o.opacity = v / 100))} />
            </div>
            <div class="f2">
              <div class="f2-cap">Boyut</div>
              <Slider value={Math.round(inst()!.scale * 100)} min={40} max={300} step={5} unit="%" onInput={(v) => upd((o) => (o.scale = v / 100))} />
              <small class="f2-hint">Kilidi açıp ekranda sağ alt köşeden sürükleyerek de boyutlandırabilirsin.</small>
            </div>
            <Show when={monitors().length > 1}>
              <div class="f2">
                <div class="f2-cap">Monitör</div>
                <select class="f2-select" value={inst()!.monitor} onChange={(e) => upd((o) => ((o.monitor = e.currentTarget.value), (o.x = 40), (o.y = 40)))}>
                  <option value="">Ana overlay monitörü</option>
                  <For each={monitors()}>{(mo) => <option value={mo.name}>{monitorLabel(mo)}</option>}</For>
                </select>
              </div>
            </Show>
          </Section>

          <For each={groups()}>
            {([title, fields]) => (
              <Section title={title}>
                <SettingsForm
                  fields={fields}
                  values={inst()!.options}
                  overlayId={inst()!.type}
                  onChange={(key, value) => upd((o) => (o.options[key] = value))}
                  onPreview={(key, value) => setPreviewVal(k, key, value)}
                  previewValues={previewVals(k)}
                />
              </Section>
            )}
          </For>

          <Section title="Görünüm (bu overlay)" open={false}>
            <LookPanel id={k} profileId={props.profileId} />
          </Section>

          <Section title="Ne zaman gizlensin" open={false}>
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">Garajdayken gizle</span>
                <Switch checked={inst()!.hideInGarage} onChange={(v) => upd((o) => (o.hideInGarage = v))} />
              </div>
            </div>
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">Pistte sürerken gizle</span>
                <Switch checked={inst()!.hideOnTrack} onChange={(v) => upd((o) => (o.hideOnTrack = v))} />
              </div>
            </div>
            <div class="f2">
              <div class="f2-row">
                <span class="f2-label">iRacing kapalıyken de göster</span>
                <Switch checked={inst()!.alwaysShow} onChange={(v) => upd((o) => (o.alwaysShow = v))} />
              </div>
            </div>
          </Section>
        </div>
        <footer class="ovset-foot">
          <Show when={canDuplicate(inst()!.type, settings().general.allowDuplicates)}>
            <button
              class="btn ghost"
              title="Aynı overlay'den bir tane daha"
              onClick={() => {
                const key = addInstance(inst()!.type, props.profileId);
                setOpenCard(key);
                pinOverlay(key);
              }}
              disabled={isLocked(inst()!.type)}
            >
              <I.Copy /> Kopya
            </button>
          </Show>
          <button
            class="btn ghost"
            title="Konum, boyut ve ayarları varsayılana döndür"
            onClick={() =>
              upd((o) => {
                const d = defaultInstance(o.type);
                o.options = d.options;
                delete o.look;
                o.scale = 1;
                o.opacity = 1;
                o.x = d.x;
                o.y = d.y;
              })
            }
          >
            <I.RotateCcw /> Sıfırla
          </button>
          <button class="btn ghost" title="Kilidi aç ve ekranda yerleştir" onClick={async () => {
              const id = props.profileId;
              await invoke("edit_mode_set", { on: true });
              // Düzenleme ekranı bu sayfada seçili düzeni açsın (etkin düzenden farklı olabilir)
              if (inTauri && id !== settings().activeProfile) void emit("edit-layout", id).catch(() => {});
            }}>
            <I.MousePointer2 /> Ekranda
          </button>
          <Show when={isCopy()}>
            <button
              class="btn ghost danger"
              onClick={() => {
                const type = inst()?.type ?? null;
                removeInstance(k, props.profileId);
                setOpenCard(type);
              }}
            >
              <I.Trash />
            </button>
          </Show>
        </footer>
      </aside>
    </Show>
  );
}
