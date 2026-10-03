// Düzenler: monitör seçerek overlay yerleşimi. Solda düzenler, üstte monitör haritası,
// ortada seçili monitörün tuvali (gerçek overlay görüntüleriyle sürükle-bırak).

import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
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
  removeInstance,
  resolveProfile,
  settings,
  updateSettings,
  type Profile,
  type ProfileMode,
  type SessionKind,
} from "@/sdk/settings";
import { useSnapshot, useTopic } from "@/sdk/telemetry";
import { defaultMonitor, loadMonitors, monitorLabel, monitors, belongsTo, type MonitorInfo } from "@/sdk/monitors";
import { isHiddenOverlay, isLocked } from "@/cloud/account";
import { LayoutCanvas } from "../components/LayoutCanvas";
import { UndoRedo } from "@/sdk/UndoRedo";
import { LayoutList, layoutFocus, setLayoutFocus, sortProfiles, toggleProfileLock } from "../components/LayoutList";
import { Switch } from "../components/SettingsForm";
import * as I from "../icons";
import { overlayIcon } from "../overlayIcons";
import { OverlayPalette } from "../components/OverlayPalette";
import { OverlaySettings } from "../components/OverlaySettings";
import { inTauri } from "@/sdk/platform";
import { emit } from "@tauri-apps/api/event";
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
  const [rules, setRules] = createSignal(false);
  const [sharing, setSharing] = createSignal(false);
  const [zoom, setZoom] = createSignal(1);

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
    if (locked()) return;
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
    if (locked()) return;
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

  return (
    <div class="lpage" classList={{ "with-set": !!(sel() || ghost()) }}>
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
              if (k) setGhost(null);
            }}
            zoom={zoom()}
            onZoom={setZoom}
            backdrop
            readOnly={locked()}
          />
          <Show when={sharing()}>
            <ShareDialog kind="layout" profileId={p().id} onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "layouts"))} />
          </Show>
          <small class="muted lhint">
            Soldaki listede çift tık: overlay'i düzene ekle / çıkar · Sürükle: taşı · seçiliyken köşeler: boyutlandır, kenarlar: genişlik / yükseklik (destekleyen overlay'lerde) · <kbd data-no-i18n>Alt</kbd>: yapıştırmadan taşı
          </small>
        </section>

        <Show when={sel()} keyed>
          {(k) => <OverlaySettings key={k} profileId={p().id} mode="layout" onRemove={() => remove(k)} readOnly={locked()} />}
        </Show>
        <Show when={!sel() && ghost()} keyed>
          {(g) => <GhostPanel type={g} onAdd={() => add(g)} disabled={locked()} />}
        </Show>
      </Show>
    </div>
  );
}

/** Tuval seçenekleri (Düzenler ve Yayın sayfalarında aynı): ızgara, ızgara aralığı, kenarlara yapıştırma, arka plan görseli */
export function CanvasOptions() {
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
          checked={settings().general.editBackdrop.enabled && settings().general.editBackdrop.has}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            if (on && !settings().general.editBackdrop.has) {
              e.currentTarget.checked = false;
              setPicking(true);
              return;
            }
            updateSettings((d) => (d.general.editBackdrop.enabled = on));
          }}
        />
        <span>Arka plan</span>
      </label>
      <button class="btn ghost small" onClick={() => setPicking(true)} title="Arka plan görselini değiştir">
        <I.ImagePlus />
      </button>
      <Show when={picking()}>
        <BackdropPicker onClose={() => setPicking(false)} />
      </Show>
    </>
  );
}

/** Tuval araçları: geri al / yinele ve yakınlaştırma */
export function CanvasTools(props: { zoom: number; setZoom: (z: number) => void }) {
  const step = (d: number) => props.setZoom(Math.min(3, Math.max(0.5, Math.round((props.zoom + d) * 4) / 4)));
  return (
    <span class="ctools">
      <UndoRedo keys class="ur-panel" />
      <span class="ctools-zoom">
        <button type="button" class="ur-btn" title="Uzaklaştır" disabled={props.zoom <= 0.5} onClick={() => step(-0.25)}>
          <ZoomOut />
        </button>
        <button type="button" class="ctools-pct" title="Sığdır (%100) · Space + fare tekeri: yakınlaştır / uzaklaştır" onClick={() => props.setZoom(1)} data-no-i18n>
          %{Math.round(props.zoom * 100)}
        </button>
        <button type="button" class="ur-btn" title="Yakınlaştır" disabled={props.zoom >= 3} onClick={() => step(0.25)}>
          <ZoomIn />
        </button>
      </span>
    </span>
  );
}

/** Düzene henüz eklenmemiş overlay seçilince sağda görünen kısa tanıtım */
export function GhostPanel(props: { type: string; onAdd: () => void; disabled?: boolean }) {
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
            <button class="btn primary wide" disabled={props.disabled} onClick={() => props.onAdd()}>
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
