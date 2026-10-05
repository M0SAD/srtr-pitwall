// Düzenler: monitör seçerek overlay yerleşimi. Solda düzenler, üstte monitör haritası,
// ortada seçili monitörün tuvali (gerçek overlay görüntüleriyle sürükle-bırak).

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ShareDialog } from "./CommunityPage";
import { appState, setDemo } from "../App";
import { t } from "@/sdk/i18n";
import { go, overlayFocus, setOpenCard, setOverlayFocus } from "../ui";
import { BackdropPicker } from "../components/BackdropPicker";
import { invoke } from "@tauri-apps/api/core";
import { manifestById } from "@/sdk/registry";
import {
  addToLayout,
  instancesOf,
  newProfile,
  pasteInstances,
  removeInstance,
  resolveProfile,
  settings,
  updateSettings,
  type OverlayInstance,
  type Profile,
  type ProfileMode,
  type SessionKind,
  type EditBackdropSlot,
} from "@/sdk/settings";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { defaultMonitor, loadMonitors, monitorLabel, monitors, belongsTo, type MonitorInfo } from "@/sdk/monitors";
import { isHiddenOverlay, isLocked } from "@/cloud/account";
import { LayoutCanvas, canvasMulti, clearCanvasMulti, sayCanvas, sayBadgeArea, sayLayoutLocked, sayOverlayLocked, type CanvasBadge } from "../components/LayoutCanvas";
import { badgePosWanted, badgeWanted } from "@/sdk/streamBadge";
import { streamBadgeLocked } from "@/sdk/proFeatures";
import { UndoRedo } from "@/sdk/UndoRedo";
import { LayoutList, layoutFocus, setLayoutFocus, sortProfiles, toggleProfileLock } from "../components/LayoutList";
import { Switch } from "../components/SettingsForm";
import * as I from "../icons";
import { overlayIcon } from "../overlayIcons";
import { OverlayPalette } from "../components/OverlayPalette";
import { OverlaySettings } from "../components/OverlaySettings";
import { inTauri } from "@/sdk/platform";
import { emit } from "@tauri-apps/api/event";
import { useCols } from "../colResize";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";
import { currentSim, overlaySupportsSim } from "@/overlays/simSupport";

const SESSIONS: { v: SessionKind; label: string }[] = [
  { v: "practice", label: "Antrenman" },
  { v: "qualify", label: "Sıralama" },
  { v: "race", label: "Yarış" },
];
const MODES: { v: ProfileMode; label: string }[] = [
  { v: "driving", label: "Sürüş" },
  { v: "spotting", label: "İzlerken / garaj" },
];

export function newLayout(mode: ProfileMode, name: string, copyOf?: Profile): string {
  const id = `p${Date.now().toString(36)}`;
  updateSettings((d) => {
    const p = copyOf ? structuredClone(copyOf) : newProfile(id, name);
    p.id = id;
    p.name = name;
    p.rules.mode = mode;
    delete p.isDefault;
    if (!copyOf) {
      // Yeni düzen: overlay'ler "Overlaylarım"daki varsayılan ayarlarla başlar (konum ve açık/kapalı fabrika değerinde)
      for (const [k, o] of Object.entries(p.overlays)) {
        const def = d.defaults[o.type];
        if (def) p.overlays[k] = { ...structuredClone(def), type: o.type, name: "", monitor: "", x: o.x, y: o.y, enabled: mode === "stream" ? false : o.enabled };
        else if (mode === "stream") o.enabled = false;
      }
    }
    d.profiles[id] = p;
    if (mode !== "stream") d.activeProfile = id;
  });
  return id;
}

export function RulesChips(props: { p: Profile }) {
  const r = () => props.p.rules;
  return (
    <div class="chips2">
      <span class="chip2">{r().cars.length ? r().cars.join(", ") : "Tüm araçlar"}</span>
      <span class="chip2">{r().sessions.length ? r().sessions.map((s) => SESSIONS.find((x) => x.v === s)?.label).join(", ") : "Tüm oturumlar"}</span>
      <Show when={r().mode === "spotting"}>
        <span class="chip2 alt">İzlerken</span>
      </Show>
    </div>
  );
}

export function RulesEditor(props: { p: Profile }) {
  const status = useTopic("status");
  const set = (fn: (r: Profile["rules"]) => void) => updateSettings((d) => fn(d.profiles[props.p.id].rules));
  return (
    <div class="rules2">
      <div class="f2">
        <div class="f2-cap">Ne zaman kullanılsın</div>
        <div class="seg">
          <For each={MODES}>
            {(m) => (
              <button classList={{ on: props.p.rules.mode === m.v }} onClick={() => set((r) => (r.mode = m.v))}>
                {m.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="f2">
        <div class="f2-cap">Araçlar / sınıflar</div>
        <input
          class="input f2-text"
          placeholder="Boş = hepsi. Ör: GT3, Porsche 963"
          value={props.p.rules.cars.join(", ")}
          onChange={(e) =>
            set(
              (r) =>
                (r.cars = e.currentTarget.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)),
            )
          }
        />
        <Show when={status()?.carName}>
          <small class="f2-hint">
            Şu anki araç: <b>{status()!.carName}</b>{" "}
            <button class="link" onClick={() => set((r) => void (!r.cars.includes(status()!.carName) && r.cars.push(status()!.carName)))}>
              ekle
            </button>
          </small>
        </Show>
      </div>
      <div class="f2">
        <div class="f2-cap">Oturumlar</div>
        <div class="seg">
          <For each={SESSIONS}>
            {(x) => (
              <button
                classList={{ on: props.p.rules.sessions.includes(x.v) }}
                onClick={() => set((r) => (r.sessions = r.sessions.includes(x.v) ? r.sessions.filter((s) => s !== x.v) : [...r.sessions, x.v]))}
              >
                {x.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="f2 f2-row">
        <span class="f2-label">Otomatik geçiş (araca/oturuma göre en uygun düzen)</span>
        <Switch checked={settings().general.autoSwitch} onChange={(v) => updateSettings((d) => (d.general.autoSwitch = v))} />
      </div>
    </div>
  );
}

/** Monitörlerin gerçek yerleşimini küçük kutular olarak çizer */
function MonitorMap(props: { selected: string; onSelect: (name: string) => void; profile: Profile }) {
  const bounds = createMemo(() => {
    const ms = monitors();
    const minX = Math.min(...ms.map((m) => m.x));
    const minY = Math.min(...ms.map((m) => m.y));
    const maxX = Math.max(...ms.map((m) => m.x + m.width));
    const maxY = Math.max(...ms.map((m) => m.y + m.height));
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  });
  const k = () => Math.min(560 / bounds().w, 140 / bounds().h);
  const count = (m: MonitorInfo) => instancesOf(props.profile).filter(([, i]) => i.enabled && belongsToMonitor(i.monitor, m)).length;
  return (
    <div class="monmap" style={{ width: `${bounds().w * k()}px`, height: `${bounds().h * k()}px` }}>
      <For each={monitors()}>
        {(m) => (
          <button
            class="monmap-m"
            classList={{ sel: props.selected === m.name }}
            style={{
              left: `${(m.x - bounds().minX) * k()}px`,
              top: `${(m.y - bounds().minY) * k()}px`,
              width: `${m.width * k() - 3}px`,
              height: `${m.height * k() - 3}px`,
            }}
            onClick={() => props.onSelect(m.name)}
            title={monitorLabel(m)}
          >
            <b>{m.index + 1}</b>
            <small>{count(m)} overlay</small>
          </button>
        )}
      </For>
    </div>
  );
}

function belongsToMonitor(instMon: string, m: MonitorInfo) {
  const def = defaultMonitor();
  const exists = monitors().some((x) => x.name === instMon);
  const eff = !instMon || !exists ? def?.name : instMon;
  return eff === m.name;
}

export function LayoutsPage() {
  loadMonitors(true);
  const status = useTopic("status");
  const layouts = () => sortProfiles(Object.values(settings().profiles).filter((p) => p.rules.mode !== "stream"));
  // Sayfada seçili düzen aynı zamanda etkin düzendir: ekranda görünen ve "Ekranda düzenle"nin açtığı düzen
  const [selId, setSelIdRaw] = createSignal(settings().activeProfile);
  const setSelId = (id: string) => {
    setSelIdRaw(id);
    setSel(null);
    setGhost(null);
    if (settings().profiles[id] && settings().profiles[id].rules.mode !== "stream" && settings().activeProfile !== id) updateSettings((d) => (d.activeProfile = id));
  };
  const p = () => {
    const x = settings().profiles[selId()];
    return x && x.rules.mode !== "stream" ? x : layouts()[0];
  };
  const [mon, setMon] = createSignal<string>("");
  /** Seçili kopya (tuvalde ve soldaki listede) */
  const [sel, setSel] = createSignal<string | null>(null);
  /** Soldaki listede tıklanan, düzene henüz eklenmemiş overlay türü */
  const [ghost, setGhost] = createSignal<string | null>(null);
  // SRTR Pitwall logosu normal düzenlerde de (en az bir overlay eklenmiş her monitörde) aynı kurallarla: ücretsiz üyede sabit ve
  // gizlenemez; ücretli PRO gizleyebilir / taşıyabilir (ayar yayın düzenleriyle ortak: general.streamBadge / streamBadgePos)
  const badge = (): CanvasBadge => ({
    forced: streamBadgeLocked(),
    shown: streamBadgeLocked() || badgeWanted(),
    selected: false,
    onPick: () => streamBadgeLocked() && sayBadgeArea(),
    pos: streamBadgeLocked() ? undefined : badgePosWanted(),
    onMove: (pos) => !streamBadgeLocked() && updateSettings((d) => (d.general.streamBadgePos = pos)),
  });
  const [rules, setRules] = createSignal(false);
  const [sharing, setSharing] = createSignal(false);
  const [zoom, setZoom] = useCanvasZoom(() => p()?.id);

  // Sağ tık > "Ayarlarını aç" ya da başka sayfadan gelindiyse o düzen ve kopya açılır
  createEffect(() => {
    const f = layoutFocus();
    if (!f) return;
    setLayoutFocus(null);
    setSelId(f);
  });
  createEffect(() => {
    const f = overlayFocus();
    if (!f) return;
    const prof = settings().profiles[f.profile];
    if (!prof || prof.rules.mode === "stream") return;
    setOverlayFocus(null);
    setSelId(f.profile);
    if (prof.overlays[f.key]?.enabled) {
      setSel(f.key);
      const m = prof.overlays[f.key].monitor;
      if (m && monitors().some((x) => x.name === m)) setMon(m);
    }
  });

  createEffect(() => {
    if (!mon() && monitors().length) setMon(defaultMonitor()?.name ?? monitors()[0].name);
  });
  const monitor = () => monitors().find((m) => m.name === mon()) ?? defaultMonitor();
  const logical = () => {
    const m = monitor();
    return m ? { w: Math.round(m.width / m.scale), h: Math.round(m.height / m.scale) } : { w: 1920, h: 1080 };
  };

  // Bu monitördeki açık kopyalar
  const sim = createMemo(() => currentSim(status()));
  const keys = createMemo(() => {
    const prof = p();
    const m = monitor();
    if (!prof) return [];
    return instancesOf(prof)
      .filter(
        ([, i]) =>
          i.enabled &&
          !isLocked(i.type) &&
          !isHiddenOverlay(i.type) &&
          overlaySupportsSim(i.type, sim()) &&
          (m ? belongsToMonitor(i.monitor, m) : belongsTo(i.monitor, "")),
      )
      .map(([k]) => k);
  });
  // Seçili kopya düzenden çıktıysa (kaldırıldı, geri alındı) seçim bırakılır
  createEffect(() => {
    const k = sel();
    if (k && !p()?.overlays[k]?.enabled) setSel(null);
  });

  // Demo kapalıyken tuvaldeki overlay'ler sabit durur: bir anlık örnek veri alınır, sonra akış durur
  // (sürekli yeniden çizim yok, işlemci ve bellek harcamaz). Demo açıksa canlı akar.
  useSnapshot(
    () => {
      const prof = p();
      return prof ? keys().flatMap((k) => manifestById(prof.overlays[k].type)?.topics ?? []) : [];
    },
    () => [p()?.id, keys().join(",")],
    () => appState().demo,
  );

  /** Overlay'i seçili düzene (görüntülenen monitöre) ekler; "Overlaylarım"daki varsayılan ayarlarla gelir */
  /** Kilitli düzen: yerleşim, overlay listesi ve ayarlar değiştirilemez */
  const locked = () => !!p()?.locked;
  const add = (type: string) => {
    if (locked()) return void sayLayoutLocked();
    const m = monitor();
    const key = addToLayout(p().id, type, m && m.name !== defaultMonitor()?.name ? m.name : "");
    if (!key) return;
    setGhost(null);
    setSel(key);
    // Zaten ekli (tek kopyalı) bir overlay başka monitördeyse o monitöre geç
    const im = p().overlays[key]?.monitor;
    if (im && im !== mon() && monitors().some((x) => x.name === im)) setMon(im);
  };
  const remove = (key: string) => {
    if (locked()) return void sayLayoutLocked();
    if (p().overlays[key]?.locked) return void sayOverlayLocked(true);
    const type = p().overlays[key]?.type ?? null;
    removeInstance(key, p().id);
    if (sel() === key) {
      setSel(null);
      setGhost(type);
    }
  };
  const pick = (key: string | null, type: string) => {
    if (key) {
      setGhost(null);
      setSel(key);
      const im = p().overlays[key]?.monitor;
      if (im && im !== mon() && monitors().some((x) => x.name === im)) setMon(im);
      else if (!im && monitor()?.name !== defaultMonitor()?.name && defaultMonitor()) setMon(defaultMonitor()!.name);
    } else {
      setSel(null);
      setGhost(type);
    }
  };

  /** Oyunun üstünde gerçek boyutta düzenle: kilit açılır; overlay'ler taşınabilsin diye Görünür ve (oyun bağlı değilse) Demo açılır */
  const editOnScreen = async () => {
    if (locked()) return void sayLayoutLocked();
    const id = p().id;
    try {
      if (appState().hidden) await invoke("hidden_set", { on: false });
      if (!appState().connected && !appState().demo) setDemo(true);
      await invoke("edit_mode_set", { on: true });
      if (inTauri) await emit("edit-layout", id);
    } catch {
      /* tarayıcı önizlemesi */
    }
  };

  const shownNow = () => resolveProfile(status());
  const closeSet = () => (setSel(null), setGhost(null));
  useEscClose(() => !!(sel() || ghost()), closeSet);
  const cols = useCols();
  useDeleteKey(sel, remove);
  useCopyPaste(p, sel, (k) => (setSel(k), setGhost(null)), locked);

  return (
    <div class="lpage" classList={{ "with-set": !!(sel() || ghost()), "keep-set": cols.keep(), resizing: cols.resizing() }} style={{ "grid-template-columns": cols.columns(!!(sel() || ghost())) }}>
      <cols.Grips withSet={!!(sel() || ghost())} />
      <aside class="llist">
        <div class="llist-items">
          <LayoutList
            kind="layout"
            title="Düzenlerim"
            list={layouts()}
            selId={p()?.id}
            onSelect={setSelId}
            onAdd={() => setSelId(newLayout("driving", t("Düzen {0}", layouts().length + 1)))}
            onShare={() => setSharing(true)}
            icon={() => <I.LayoutDashboard />}
          />
        </div>
        <Show when={shownNow() && shownNow()!.id !== p()?.id}>
          <small class="muted llist-now">
            Ekranda şu an: <b>{shownNow()?.name}</b>
          </small>
        </Show>
        <div class="llist-head">
          <span>Overlay'ler</span>
          <small class="muted">{instancesOf(p()).filter(([, i]) => i.enabled).length} ekli</small>
        </div>
        <div class="llist-pal">
          <Show when={p()}>
            <OverlayPalette profile={p()} selected={sel() ?? ghost()} onSelect={pick} onAdd={add} onRemove={remove} disabled={locked()} />
          </Show>
        </div>
      </aside>

      <Show when={p()}>
        <section class="lmain">
          <header class="lhead">
            <div>
              <h2 class="lname">{p().name}</h2>
              <small class="muted">
                {monitor() ? `${monitor()!.width}×${monitor()!.height}` : ""} · {keys().length} overlay bu monitörde ·{" "}
                {instancesOf(p()).filter(([, i]) => i.enabled).length} toplam
              </small>
              <RulesChips p={p()} />
            </div>
            <div class="lhead-btns">
              <button class="btn ghost" classList={{ on: rules() && !locked() }} disabled={locked()} onClick={() => setRules(!rules())}>
                <I.Flag /> Kurallar
              </button>
              <button class="btn primary" title="Bu düzeni tüm ayarları ve renkleriyle toplulukta paylaş" onClick={() => setSharing(true)}>
                <I.Share2 /> Paylaş
              </button>
            </div>
          </header>

          <Show when={rules() && !locked()}>
            <RulesEditor p={p()} />
          </Show>
          <Show when={locked()}>
            <div class="locked-note lock-note">
              <I.Lock /> Bu düzen kilitli: overlay'ler taşınamaz, eklenip çıkarılamaz, ayarları değiştirilemez.
              <button class="link" onClick={() => toggleProfileLock(p().id)}>
                Kilidi aç
              </button>
            </div>
          </Show>

          <div class="lmon">
            <Show when={monitors().length > 0} fallback={<span class="muted">Monitör bilgisi alınamadı</span>}>
              <MonitorMap selected={mon()} onSelect={(n) => (setMon(n), setSel(null))} profile={p()} />
              <div class="lmon-info">
                <b>{monitor() ? monitorLabel(monitor()!) : ""}</b>
                <small class="muted">
                  {monitor()?.name === defaultMonitor()?.name ? "Ana overlay monitörü" : "Ek monitör"}
                  {monitor() && monitor()!.scale !== 1 ? ` · Windows ölçeği %${Math.round(monitor()!.scale * 100)}` : ""}
                </small>
                <div class="lmon-tools">
                  <CanvasOptions />
                  <label class="check ctools-logo" classList={{ off: streamBadgeLocked() }} title={streamBadgeLocked() ? t("SRTR Pitwall logosu ekranda her zaman görünür · PRO ile gizlenebilir") : t("Ekranda SRTR Pitwall logosunu göster")} onClick={() => streamBadgeLocked() && sayBadgeArea()}>
                    <input type="checkbox" checked={streamBadgeLocked() || badgeWanted()} disabled={streamBadgeLocked()} onChange={(e) => !streamBadgeLocked() && updateSettings((d) => (d.general.streamBadge = e.currentTarget.checked))} />
                    <span>Logo</span>
                  </label>
                  <CanvasTools zoom={zoom()} setZoom={setZoom} />
                  <button class="btn ghost small" onClick={editOnScreen} title="Oyunun üstünde gerçek boyutta düzenle: kilit açılır, Görünür ve (oyun açık değilse) Demo kendiliğinden açılır">
                    <I.MousePointer2 /> Ekranda düzenle
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <LayoutCanvas
            profileId={p().id}
            width={logical().w}
            height={logical().h}
            keys={keys()}
            selected={sel()}
            onSelect={(k) => {
              setSel(k);
              setGhost(null);
            }}
            zoom={zoom()}
            onZoom={setZoom}
            backdrop="layout"
            readOnly={locked()}
            badge={keys().length > 0 ? badge() : undefined}
          />
          <Show when={sharing()}>
            <ShareDialog kind="layout" profileId={p().id} onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "layouts"))} />
          </Show>
          <small class="muted lhint">
            Soldaki listede çift tık: overlay'i düzene ekle / çıkar · Sürükle: taşı · seçiliyken köşeler: boyutlandır, kenarlar: genişlik / yükseklik (destekleyen overlay'lerde) · <kbd data-no-i18n>Alt</kbd>: yapıştırmadan taşı
          </small>
          <small class="muted lhint lkeys">
            Fare tekeri: yakınlaştır / uzaklaştır · <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>Z</kbd>: geri al · <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>Y</kbd>: yinele · <kbd data-no-i18n>Delete</kbd>: sil · sağ tık: kilitle · Ok tuşları: 1 px taşı (Shift: 10 px)
            <span class="chint-more">
              <kbd data-no-i18n>Space</kbd> + sürükle: gezin · boş yerden sürükle: birden çok overlay seç (birlikte taşı / sil) · <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>C</kbd> / <kbd data-no-i18n>Ctrl</kbd>+<kbd data-no-i18n>V</kbd>: kopyala / yapıştır · <kbd data-no-i18n>+</kbd> <kbd data-no-i18n>−</kbd> <kbd data-no-i18n>0</kbd>: yakınlaştır / uzaklaştır / sığdır
            </span>
          </small>
        </section>

        <Show when={sel()} keyed>
          {(k) => <OverlaySettings key={k} profileId={p().id} mode="layout" onRemove={() => remove(k)} readOnly={locked()} onClose={closeSet} />}
        </Show>
        <Show when={!sel() && ghost()} keyed>
          {(g) => <GhostPanel type={g} onAdd={() => add(g)} disabled={locked()} onClose={closeSet} />}
        </Show>
      </Show>
    </div>
  );
}

/** Tuval seçenekleri (Düzenler ve Yayın sayfalarında aynı): ızgara, ızgara aralığı, kenarlara yapıştırma, arka plan görseli */
export function CanvasOptions(props: { backdrop?: EditBackdropSlot }) {
  /** Arka plan yeri: Düzenler tuvali (varsayılan) ya da Yayın düzenleri tuvali; her birinin görseli ayrı */
  const eb = () => settings().general.editBackdrops[props.backdrop ?? "layout"];
  const [picking, setPicking] = createSignal(false);
  return (
    <>
      <label class="check" title="Taşırken overlay'ler ızgara çizgilerine hizalanır. Kapalıyken ızgara ve orta çizgiler gizlenir, sadece overlay çerçeveleri kalır.">
        <input type="checkbox" checked={settings().general.snapToGrid} onChange={(e) => updateSettings((d) => (d.general.snapToGrid = e.currentTarget.checked))} />
        <span>Izgara</span>
      </label>
      <select class="f2-select small" value={settings().general.gridSize} onChange={(e) => updateSettings((d) => (d.general.gridSize = Number(e.currentTarget.value)))}>
        <For each={[5, 10, 20, 40]}>{(n) => <option value={n}>{n}px</option>}</For>
      </select>
      <label class="check" title="Taşırken overlay'ler ekranın ve diğer overlay'lerin kenarlarına ve ortalarına yapışır, hizalama çizgisi gösterir. Alt tuşuna basılıyken geçici olarak kapanır.">
        <input type="checkbox" checked={settings().general.snapToEdges} onChange={(e) => updateSettings((d) => (d.general.snapToEdges = e.currentTarget.checked))} />
        <span>Kenarlar</span>
      </label>
      <label
        class="check"
        title="Tuvalde overlay'lerin arkasında görsel göster · sağ tık: arka planı değiştir"
        onContextMenu={(e) => {
          e.preventDefault();
          setPicking(true);
        }}
      >
        <input
          type="checkbox"
          checked={eb().enabled && eb().has}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            if (on && !eb().has) {
              e.currentTarget.checked = false;
              setPicking(true);
              return;
            }
            updateSettings((d) => (d.general.editBackdrops[props.backdrop ?? "layout"].enabled = on));
          }}
        />
        <span>Arka plan</span>
      </label>
      <button class="btn ghost small" onClick={() => setPicking(true)} title="Arka plan görselini değiştir">
        <I.ImagePlus />
      </button>
      <Show when={picking()}>
        <BackdropPicker slot={props.backdrop ?? "layout"} onClose={() => setPicking(false)} />
      </Show>
    </>
  );
}

/** Tuval araçları: geri al / yinele ve yakınlaştırma */
// Tuval yakınlaştırması düzen başınadır: bir düzende yakınlaştırmak diğerlerini etkilemez (bu bilgisayarda hatırlanır)
const ZOOM_KEY = "pw.canvasZoom";
const readZooms = (): Record<string, number> => {
  try {
    const v = JSON.parse(localStorage.getItem(ZOOM_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};
const [zooms, setZooms] = createSignal<Record<string, number>>(readZooms());
export function useCanvasZoom(id: () => string | undefined): [() => number, (z: number) => void] {
  const zoom = () => {
    const z = Number(zooms()[id() ?? ""]);
    return z >= 0.5 && z <= 3 ? z : 1;
  };
  const setZoom = (z: number) => {
    const k = id();
    if (!k) return;
    const next = { ...zooms() };
    if (z === 1) delete next[k];
    else next[k] = z;
    // Silinmiş düzenlerin kaydı birikmesin
    for (const x of Object.keys(next)) if (!settings().profiles[x]) delete next[x];
    setZooms(next);
    try {
      localStorage.setItem(ZOOM_KEY, JSON.stringify(next));
    } catch {
      /* depo yok */
    }
  };
  return [zoom, setZoom];
}

export function CanvasTools(props: { zoom: number; setZoom: (z: number) => void }) {
  const step = (d: number) => props.setZoom(Math.min(3, Math.max(0.5, Math.round((props.zoom + d) * 4) / 4)));
  return (
    <span class="ctools">
      <UndoRedo keys class="ur-panel" />
      <span class="ctools-zoom">
        <button type="button" class="ur-btn" title="Uzaklaştır" disabled={props.zoom <= 0.5} onClick={() => step(-0.25)}>
          <ZoomOut />
        </button>
        <button type="button" class="ctools-pct" title="Sığdır (%100) · Fare tekeri: yakınlaştır / uzaklaştır" onClick={() => props.setZoom(1)} data-no-i18n>
          %{Math.round(props.zoom * 100)}
        </button>
        <button type="button" class="ur-btn" title="Yakınlaştır" disabled={props.zoom >= 3} onClick={() => step(0.25)}>
          <ZoomIn />
        </button>
      </span>
    </span>
  );
}

/** Esc: tuvalin solundaki ayar panelini kapatır (yazı alanındayken ve açık bir pencere / menü varken dokunmaz) */
export function useEscClose(open: () => boolean, close: () => void) {
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !open()) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector(".modal-back, .bp-back, .ovmenu")) return;
      close();
    };
    window.addEventListener("keydown", key);
    onCleanup(() => window.removeEventListener("keydown", key));
  });
}

/**
 * Delete: tuvalde / listede seçili overlay'i düzenden siler (yazı alanındayken ve açık bir pencere / menü varken dokunmaz).
 * Yakalama aşamasında dinlenir: odak düzen listesindeki bir satırda kalmış olsa bile seçili overlay silinir, düzen değil.
 * Geri al (Ctrl+Z) overlay'i geri getirir. Kilitli düzen / kilitli overlay denetimi `remove` içindedir.
 */
export function useDeleteKey(sel: () => string | null, remove: (key: string) => void) {
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const many = canvasMulti();
      const k = sel();
      if (!k && !many.length) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector(".modal-back, .bp-back, .ovmenu, .ctx")) return;
      e.preventDefault();
      e.stopPropagation();
      // Çoklu seçim: taranan overlay'lerin hepsi silinir (kilitliler `remove` içinde atlanır)
      if (many.length) {
        for (const x of many) remove(x);
        clearCanvasMulti();
      } else if (k) remove(k);
    };
    window.addEventListener("keydown", key, true);
    onCleanup(() => window.removeEventListener("keydown", key, true));
  });
}

// Kopyala / yapıştır panosu (uygulama içi; düzenler ve yayın düzenleri arasında da çalışır)
let clip: OverlayInstance[] = [];
let pasteN = 0;
/** Kopyalamanın yapıldığı düzen: başka düzene yapıştırırken tek kopyalı overlay de (var olanın yerine) gelir */
let clipFrom = "";
/**
 * Ctrl+C: seçili overlay'i (ya da çoklu seçimi) kopyalar. Ctrl+V: açık düzene yapıştırır — overlay birden çok kez
 * eklenebiliyorsa yeni kopya olarak, düzende hiç yoksa aynı ayarlarla. Yazı alanında / metin seçiliyken dokunmaz.
 */
export function useCopyPaste(prof: () => Profile | undefined, sel: () => string | null, setSel: (k: string | null) => void, locked: () => boolean) {
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.defaultPrevented || e.repeat) return;
      const c = e.key.toLowerCase();
      if (c !== "c" && c !== "v") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector(".modal-back, .bp-back, .ovmenu, .ctx")) return;
      const p = prof();
      if (!p) return;
      if (c === "c") {
        if (window.getSelection()?.toString()) return;
        const ks = canvasMulti().length ? canvasMulti() : sel() ? [sel()!] : [];
        const got = ks.map((k) => p.overlays[k]).filter((o) => !!o);
        if (!got.length) return;
        e.preventDefault();
        clip = JSON.parse(JSON.stringify(got));
        pasteN = 0;
        clipFrom = p.id;
        sayCanvas(got.length > 1 ? t("{0} overlay kopyalandı (Ctrl+V: yapıştır)", got.length) : t("Overlay kopyalandı (Ctrl+V: yapıştır)"));
        return;
      }
      if (!clip.length) return;
      e.preventDefault();
      if (locked()) return void sayLayoutLocked();
      const other = p.id !== clipFrom;
      const r = pasteInstances(p.id, clip.filter((i) => !isLocked(i.type)), 24 * (other ? pasteN++ : ++pasteN), other);
      clearCanvasMulti();
      if (r.keys.length) setSel(r.keys[r.keys.length - 1]);
      if (r.single && !r.keys.length) sayCanvas(t("Bu overlay bir düzende yalnızca bir kez bulunabilir: yapıştırılmadı"));
      else if (r.single) sayCanvas(t("{0} overlay yapıştırıldı; yalnızca bir kez bulunabilenler atlandı", r.keys.length));
    };
    window.addEventListener("keydown", key);
    onCleanup(() => window.removeEventListener("keydown", key));
  });
}

/** Düzene henüz eklenmemiş overlay seçilince overlay listesinin yanında görünen kısa tanıtım */
export function GhostPanel(props: { type: string; onAdd: () => void; disabled?: boolean; onClose?: () => void }) {
  const m = () => manifestById(props.type);
  return (
    <Show when={m()}>
      <aside class="ovset">
        <header class="ovset-head">
          <span class="ovset-ic">{overlayIcon(props.type)}</span>
          <div>
            <b>{m()!.name}</b>
            <small>{m()!.description}</small>
          </div>
          <Show when={props.onClose}>
            <button class="ovset-close" title="Kapat (Esc)" onClick={() => props.onClose!()}>
              <I.X />
            </button>
          </Show>
        </header>
        <div class="ovset-scroll">
          <Show
            when={!isLocked(props.type)}
            fallback={
              <div class="locked-note">
                Bu overlay PRO üyelere özel.{" "}
                <button class="link" onClick={() => go("pro")}>
                  PRO'ya bak
                </button>
              </div>
            }
          >
            <p class="ovset-note">Bu overlay bu düzende yok. Eklediğinde Overlaylarım'daki varsayılan ayarlarıyla gelir; sonra bu düzene özel ayarlarını buradan değiştirebilirsin.</p>
            <button class="btn primary wide" classList={{ blocked: !!props.disabled }} onClick={() => props.onAdd()}>
              <I.Plus /> Düzene ekle
            </button>
            <button class="btn ghost wide" style={{ "margin-top": "8px" }} onClick={() => (setOpenCard(props.type), go("overlays"))}>
              <I.Settings /> Varsayılan ayarlarını aç
            </button>
          </Show>
        </div>
      </aside>
    </Show>
  );
}
