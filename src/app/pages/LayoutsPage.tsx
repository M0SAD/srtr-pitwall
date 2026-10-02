// Düzenler: monitör seçerek overlay yerleşimi. Solda düzenler, üstte monitör haritası,
// ortada seçili monitörün tuvali (gerçek overlay görüntüleriyle sürükle-bırak).

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ShareDialog } from "./CommunityPage";
import { appState } from "../App";
import { t } from "@/sdk/i18n";
import { go } from "../ui";
import { BackdropPicker } from "../components/BackdropPicker";
import { invoke } from "@tauri-apps/api/core";
import { canDuplicate, manifestById, manifests } from "@/sdk/registry";
import {
  instanceName,
  instancesOf,
  newProfile,
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
import { Switch } from "../components/SettingsForm";
import * as I from "../icons";
import { overlayIcon } from "../overlayIcons";
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
    if (!copyOf && mode === "stream") for (const o of Object.values(p.overlays)) o.enabled = false;
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
  const layouts = () => Object.values(settings().profiles).filter((p) => p.rules.mode !== "stream");
  const [selId, setSelId] = createSignal(settings().activeProfile);
  const p = () => settings().profiles[selId()] ?? layouts()[0];
  const [mon, setMon] = createSignal<string>("");
  const [sel, setSel] = createSignal<string | null>(null);
  const [rules, setRules] = createSignal(false);
  const [renaming, setRenaming] = createSignal(false);
  const [picking, setPicking] = createSignal(false);
  const [sharing, setSharing] = createSignal(false);

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

  // Düzenlerim listesinde sağ tık menüsü
  const [lmenu, setLmenu] = createSignal<{ x: number; y: number; id: string } | null>(null);
  onMount(() => {
    const close = () => setLmenu(null);
    window.addEventListener("pointerdown", close);
    onCleanup(() => window.removeEventListener("pointerdown", close));
  });
  const removeId = (id: string) => {
    if (layouts().length <= 1) return;
    const prof = settings().profiles[id];
    if (!prof || !confirm(t('"{0}" düzeni silinsin mi?', prof.name))) return;
    updateSettings((d) => {
      delete d.profiles[id];
      if (!d.profiles[d.activeProfile]) d.activeProfile = Object.keys(d.profiles).find((x) => d.profiles[x].rules.mode !== "stream") ?? Object.keys(d.profiles)[0];
    });
    if (selId() === id) setSelId(settings().activeProfile);
  };

  const addHere = (type: string) => {
    const m = monitor();
    updateSettings((d) => {
      const prof = d.profiles[p().id];
      const base = prof.overlays[type];
      const monName = m && m.name !== defaultMonitor()?.name ? m.name : "";
      const ex = Object.entries(prof.overlays).find(([, o]) => o.type === type && o.enabled)?.[0];
      if (ex && !canDuplicate(type, d.general.allowDuplicates)) {
        // Birden fazla eklemeye izin yok: var olanı seç
        setSel(ex);
      } else if (base && !base.enabled) {
        base.enabled = true;
        base.monitor = monName;
        setSel(type);
      } else {
        let n = 2;
        while (prof.overlays[`${type}#${n}`]) n++;
        const key = `${type}#${n}`;
        prof.overlays[key] = { ...structuredClone(base), enabled: true, monitor: monName, name: "", x: 60, y: 60 };
        setSel(key);
      }
    });
  };

  const remove = () => {
    if (layouts().length <= 1) return;
    if (!confirm(`"${p().name}" düzeni silinsin mi?`)) return;
    updateSettings((d) => {
      delete d.profiles[p().id];
      if (!d.profiles[d.activeProfile]) d.activeProfile = Object.keys(d.profiles).find((id) => d.profiles[id].rules.mode !== "stream") ?? Object.keys(d.profiles)[0];
    });
    setSelId(settings().activeProfile);
  };

  const shownNow = () => resolveProfile(status());
  const selInst = () => (sel() ? p()?.overlays[sel()!] : undefined);

  return (
    <div class="lpage">
      <Show when={lmenu()}>
        {(() => {
          const m = lmenu()!;
          const prof = () => settings().profiles[m.id];
          const run = (fn: () => void) => (e: PointerEvent) => {
            e.stopPropagation();
            setLmenu(null);
            fn();
          };
          return (
            <div class="ovmenu" style={{ left: `${Math.min(m.x, window.innerWidth - 230)}px`, top: `${Math.min(m.y, window.innerHeight - 220)}px` }} onPointerDown={(e) => e.stopPropagation()}>
              <button onPointerUp={run(() => (setSelId(m.id), setRenaming(true)))}>
                <I.Pencil /> Adını değiştir
              </button>
              <button onPointerUp={run(() => (setSelId(m.id), setSharing(true)))}>
                <I.Share2 /> Toplulukta paylaş
              </button>
              <button onPointerUp={run(() => setSelId(newLayout(prof().rules.mode, `${prof().name} (kopya)`, prof())))}>
                <I.Copy /> Kopyala
              </button>
              <button disabled={settings().activeProfile === m.id} onPointerUp={run(() => updateSettings((d) => (d.activeProfile = m.id)))}>
                <I.Play /> Varsayılan yap
              </button>
              <button class="danger" disabled={layouts().length <= 1} onPointerUp={run(() => removeId(m.id))}>
                <I.Trash /> Sil
              </button>
            </div>
          );
        })()}
      </Show>
      <aside class="llist">
        <div class="ovlist-cap">Varsayılan düzen</div>
        <select class="f2-select" value={settings().activeProfile} onChange={(e) => updateSettings((d) => (d.activeProfile = e.currentTarget.value))}>
          <For each={layouts()}>{(x) => <option value={x.id}>{x.name}</option>}</For>
        </select>
        <small class="muted llist-now">
          Ekranda şu an: <b>{shownNow()?.name}</b>
        </small>
        <div class="ovlist-cap">Düzenlerim</div>
        <div class="llist-items">
          <For each={layouts()}>
            {(x) => (
              <button
                class="ovitem"
                classList={{ sel: p()?.id === x.id }}
                onClick={() => setSelId(x.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setLmenu({ x: e.clientX, y: e.clientY, id: x.id });
                }}
              >
                <span class="ovitem-ic">
                  <I.LayoutDashboard />
                </span>
                <span class="ovitem-name">{x.name}</span>
                <Show when={settings().activeProfile === x.id}>
                  <span class="chip2 small">varsayılan</span>
                </Show>
              </button>
            )}
          </For>
        </div>
        <button class="btn primary wide" onClick={() => setSelId(newLayout("driving", `Düzen ${layouts().length + 1}`))}>
          <I.Plus /> Düzen ekle
        </button>
      </aside>

      <Show when={p()}>
        <section class="lmain">
          <header class="lhead">
            <div>
              <Show
                when={!renaming()}
                fallback={
                  <input
                    class="input lname-input"
                    value={p().name}
                    autofocus
                    onBlur={() => setRenaming(false)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setRenaming(false)}
                    onInput={(e) => {
                      const v = e.currentTarget.value;
                      updateSettings((d) => (d.profiles[p().id].name = v || "Düzen"));
                    }}
                  />
                }
              >
                <h2 class="lname" onDblClick={() => setRenaming(true)}>
                  {p().name}
                </h2>
              </Show>
              <small class="muted">
                {monitor() ? `${monitor()!.width}×${monitor()!.height}` : ""} · {keys().length} overlay bu monitörde ·{" "}
                {instancesOf(p()).filter(([, i]) => i.enabled).length} toplam
              </small>
              <RulesChips p={p()} />
            </div>
            <div class="lhead-btns">
              <UndoRedo keys class="ur-panel" />
              <button class="btn ghost" classList={{ on: rules() }} onClick={() => setRules(!rules())}>
                <I.Flag /> Kurallar
              </button>
              <button class="btn ghost" onClick={() => setRenaming(true)}>
                <I.Pencil /> Adı
              </button>
              <button class="btn ghost" onClick={() => setSelId(newLayout(p().rules.mode, `${p().name} (kopya)`, p()))}>
                <I.Copy /> Kopyala
              </button>
              <button class="btn primary" title="Bu düzeni tüm ayarları ve renkleriyle toplulukta paylaş" onClick={() => setSharing(true)}>
                <I.Share2 /> Paylaş
              </button>
              <button class="btn ghost ok" disabled={settings().activeProfile === p().id} onClick={() => updateSettings((d) => (d.activeProfile = p().id))}>
                <I.Play /> Varsayılan yap
              </button>
              <button class="btn ghost danger" disabled={layouts().length <= 1} onClick={remove}>
                <I.Trash /> Sil
              </button>
            </div>
          </header>

          <Show when={rules()}>
            <RulesEditor p={p()} />
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
                  <select
                    class="f2-select small"
                    value=""
                    onChange={(e) => {
                      if (e.currentTarget.value) addHere(e.currentTarget.value);
                      e.currentTarget.value = "";
                    }}
                  >
                    <option value="">+ Bu monitöre ekle…</option>
                    <For each={manifests.filter((m) => !isLocked(m.id) && !isHiddenOverlay(m.id) && overlaySupportsSim(m.id, sim()))}>{(m) => <option value={m.id}>{m.name}</option>}</For>
                  </select>
                  <button class="btn ghost small" onClick={() => invoke("edit_mode_set", { on: true })} title="Oyunun üstünde gerçek boyutta düzenle">
                    <I.MousePointer2 /> Ekranda düzenle
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <LayoutCanvas profileId={p().id} width={logical().w} height={logical().h} keys={keys()} selected={sel()} onSelect={setSel} backdrop />
          <Show when={picking()}>
            <BackdropPicker onClose={() => setPicking(false)} />
          </Show>
          <Show when={sharing()}>
            <ShareDialog kind="layout" profileId={p().id} onClose={() => setSharing(false)} onShared={() => (setSharing(false), go("community", "layouts"))} />
          </Show>

          <Show when={selInst()}>
            <div class="lsel">
              <span class="ovitem-ic">{overlayIcon(selInst()!.type)}</span>
              <b>{instanceName(sel()!, selInst()!)}</b>
              <span class="muted small">
                x {selInst()!.x} · y {selInst()!.y} · %{Math.round(selInst()!.scale * 100)}
              </span>
              <span class="lt-sp" />
              <Show when={monitors().length > 1}>
                <select
                  class="f2-select small"
                  value={selInst()!.monitor}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    updateSettings((d) => {
                      const o = d.profiles[p().id].overlays[sel()!];
                      o.monitor = v;
                      o.x = 40;
                      o.y = 40;
                    });
                    const target = monitors().find((m) => m.name === v);
                    if (target) setMon(target.name);
                  }}
                >
                  <option value="">Ana overlay monitörü</option>
                  <For each={monitors()}>{(m) => <option value={m.name}>{monitorLabel(m)}</option>}</For>
                </select>
              </Show>
              <button
                class="btn ghost small danger"
                onClick={() => {
                  const k = sel()!;
                  updateSettings((d) => {
                    const o = d.profiles[p().id].overlays[k];
                    if (k === o.type) o.enabled = false;
                    else delete d.profiles[p().id].overlays[k];
                  });
                  setSel(null);
                }}
              >
                <I.X /> Kaldır
              </button>
            </div>
          </Show>
          <small class="muted lhint">
            Sürükle: taşı · seçiliyken sağ alt köşe: boyutlandır · <kbd>Alt</kbd>: yapıştırmadan taşı · monitörü yukarıdaki haritadan seç
          </small>
        </section>
      </Show>
    </div>
  );
}
