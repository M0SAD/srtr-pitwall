// Şeffaf overlay penceresi. Tüm overlay'ler bu tek pencerenin içinde çizilir
// (her overlay için ayrı pencere açmak RAM'i katlar).

import { isHiddenOverlay, isLocked, startPing } from "@/cloud/account";
import { msgPending, msgToast, startSocial } from "./social";
import { startCrew } from "./crew";
import { startTelemetryUpload } from "@/cloud/telemetry";
import { t } from "@/sdk/i18n";
import { prettyKey, shortcut } from "@/sdk/shortcuts";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  lazy,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type Component,
} from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { manifests, loadComponent } from "@/sdk/registry";
import { sanitizeOverlayOptions } from "@/sdk/proFeatures";
import { instanceName, instancesOf, resolveProfile, settings, updateOverlay, updateSettings, type Profile } from "@/sdk/settings";
import { belongsTo, loadMonitors, monitors } from "@/sdk/monitors";
import { liveProfile } from "@/sdk/streamLink";
import { inTauri, query } from "@/sdk/platform";
import { clearData, setSubscriptions, useTopic } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import { UndoRedo } from "@/sdk/UndoRedo";
import type { AppState } from "@/sdk/types";
import { previewFrozen, setOnScreen, setPreviewFrozen, setScreenEditing, type OverlayComponent, type OverlayManifest } from "@/sdk/overlay";
import {
  clampRect,
  effectiveScale,
  layoutRect,
  snapMove,
  unlayoutPos,
  type Guides,
  type Rect,
} from "./snap";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { endDrag, remoteDrag, sendDrag } from "@/sdk/livedrag";
import { BackdropPicker } from "@/app/components/BackdropPicker";
import { overlayBgUrl } from "@/app/appBg";
import { currentSim, overlaySupportsSim } from "@/overlays/simSupport";

// Panelden yeni eklenen overlay: kısa süre gösterilir ve vurgulanır
const [peekId, setPeekId] = createSignal<string | null>(null);
let peekTimer: number | undefined;
// Overlay'ler sayfasında yeni eklenen overlay: kullanıcı o sayfada kaldıkça (oyun kapalıyken) örnek veriyle ekranda tutulur.
// Panel bırakınca (sayfadan çıkış, başka overlay seçimi, panel kapanışı) ya da oyun bağlanınca normal kurallara dönülür.
const [pinId, setPinId] = createSignal<string | null>(null);
/** Panel önizlemeyi dondurdu (Rust: preview_freeze); sadece önizleme verisi akarken dikkate alınır */
const [frozenEvt, setFrozenEvt] = createSignal(false);

// Ekran görüntüsü bildirimi
const [shotToast, setShotToast] = createSignal<{ text: string; err: boolean } | null>(null);
let shotToastTimer: number | undefined;
function showShotToast(text: string, err: boolean) {
  setShotToast({ text, err });
  clearTimeout(shotToastTimer);
  shotToastTimer = window.setTimeout(() => setShotToast(null), err ? 4000 : 1800);
}

// Tembel yüklenen bileşenleri önbellekte tut (yeniden render'da tekrar yüklenmesin)
const lazyCache = new Map<string, Component<any>>();
function componentFor(id: string): Component<any> | undefined {
  if (!lazyCache.has(id)) {
    const loader = loadComponent(id);
    if (!loader) return undefined;
    lazyCache.set(id, lazy(loader) as unknown as OverlayComponent);
  }
  return lazyCache.get(id);
}

// Ekrandaki her overlay'in güncel dikdörtgeni (kenarlara yapıştırmak için)
const rects = new Map<string, Rect>();

const [screen, setScreen] = createSignal({ w: window.innerWidth, h: window.innerHeight });
const [guides, setGuides] = createSignal<Guides>({ v: [], h: [] });
const [menu, setMenu] = createSignal<MenuState | null>(null);

// Bu pencerenin monitörü (boş: ana overlay penceresi)
const windowMonitor = query.get("monitor") ?? "";
// VR panosu (?vr=board, Rust: vr.rs): tüm düzeni gösteren sıradan bir pencere; VR pencere yakalama araçları için.
// Düzenleme modu, bildirimler ve arka plan işleri (ping, sosyal, yükleme) bu pencerede çalışmaz.
const vrBoard = query.get("vr") === "board";
const vrBg = vrBoard && /^[0-9a-f]{6}$/i.test(query.get("bg") ?? "") ? `#${query.get("bg")}` : "";

// Gösterilen düzen (Layout Manager kurallarına göre). Düzenleme de bu düzen üzerinde yapılır.
const [shown, setShown] = createSignal<Profile | null>(null);
export const shownProfile = () => shown()!;
const editOverlay = (id: string, fn: Parameters<typeof updateOverlay>[1]) => updateOverlay(id, fn, shown()?.id);
// Düzenleme modunda üst şeritten seçilen düzen (tüm overlay pencerelerine "edit-layout" olayıyla iletilir)
const [editPick, setEditPick] = createSignal<string | null>(null);

// Şeffaf pencerelerde bazı sürücüler, silinen/taşınan içeriğin eski görüntüsünü ekranda
// bırakabiliyor. Düzen değişince tüm pencereyi bir kare boyunca yeniden çizdiriyoruz.
const [repaint, setRepaint] = createSignal(false);
function nudgeRepaint() {
  requestAnimationFrame(() => {
    setRepaint(true);
    requestAnimationFrame(() => setRepaint(false));
  });
}

/** "Sürekli göster" ayarı (options.always) olan overlay türleri. Rust: lib.rs sync_monitor_windows */
const ALWAYS_TYPES = ["livechat", "livepoll", "captions"];

export function Host() {
  const [appRaw, setApp] = createSignal<AppState>({ demo: false, editMode: false, connected: false, hidden: false });
  const app = (): AppState => (vrBoard ? { ...appRaw(), editMode: false, hidden: false } : appRaw());
  const status = useTopic("status");

  onMount(async () => {
    loadMonitors();
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
    if (!inTauri) return; // Tarayıcı kaynağı: düzenleme/gizleme yok
    setApp(await invoke<AppState>("state_get"));
    await listen<AppState>("app-state", (e) => {
      setApp(e.payload);
      if (!e.payload.editMode) setEditPick(null);
    });
    await listen<string>("edit-layout", (e) => setEditPick(e.payload || null));
    await listen<{ id: string | null }>("overlay-pin", (e) => setPinId(e.payload?.id || null));
    await listen<boolean>("preview-frozen", (e) => setFrozenEvt(!!e.payload));
    // Pencere sonradan açıldıysa (ör. başka monitörün penceresi) o anki durumu al
    invoke<string | null>("overlay_pin_get")
      .then((id) => setPinId(id || null))
      .catch(() => {});
    await listen<{ id: string; ms: number }>("overlay-peek", (e) => {
      setPeekId(e.payload.id);
      clearTimeout(peekTimer);
      peekTimer = window.setTimeout(() => setPeekId(null), e.payload.ms);
    });
    // Ekran görüntüsü alındı: kısa bir bildirim (görüntüye girmez, çekimden sonra gösterilir)
    if (windowMonitor === "" && !vrBoard) {
      // Kullanım sayacı ve arkadaş listesi durumu (bu pencere uygulama açık olduğu sürece çalışır)
      invoke<{ display: string }>("app_version")
        .then((v) => startPing(() => v.display, () => !!status()?.connected && !status()?.demo && !status()?.preview))
        .catch(() => {});
      startSocial(status);
      startCrew(status);
      // Telemetri: kaydedilen turları (giriş yapılmışsa) buluta yükle
      startTelemetryUpload();
      await listen<{ name: string }>("screenshot-taken", () => showShotToast("Ekran görüntüsü kaydedildi", false));
      await listen<string>("screenshot-error", (e) => showShotToast(t("Ekran görüntüsü alınamadı: {0}", e.payload), true));
      // Canlı sohbet kısayolla başlatıldı/durduruldu
      await listen<{ on: boolean; error: boolean; login?: boolean }>("livechat-toggled", (e) =>
        showShotToast(
          t(e.payload.login ? "Canlı Sohbet için giriş yapmalısın" : e.payload.error ? "Canlı sohbet başlatılamadı: önce kanal ekle" : e.payload.on ? "Canlı sohbet başlatıldı" : "Canlı sohbet durduruldu"),
          e.payload.error,
        ),
      );
      // Sesli mühendis kısayolla açıldı/kapandı
      await listen<{ on: boolean; error: boolean }>("voice-toggled", (e) =>
        showShotToast(
          t(e.payload.error ? "Sesli mühendis PRO üyelere özel" : e.payload.on ? "Sesli mühendis açıldı" : "Sesli mühendis kapatıldı"),
          e.payload.error,
        ),
      );
    }
  });

  // Düzenleme ekranı arka plan görseli (sadece ana overlay penceresinde)
  const [editBg, setEditBg] = createSignal<string | null>(null);
  let bgUrl: string | null = null;
  createEffect(
    on(
      () => {
        const eb = settings().general.editBackdrop;
        return [app().editMode && eb.enabled && eb.has && windowMonitor === "" && inTauri, eb.rev] as const;
      },
      async ([want]) => {
        if (bgUrl) URL.revokeObjectURL(bgUrl);
        bgUrl = null;
        setEditBg(null);
        if (!want) return;
        try {
          const buf = await invoke<ArrayBuffer>("edit_backdrop_read");
          bgUrl = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
          setEditBg(bgUrl);
        } catch {
          /* görsel yok */
        }
      },
    ),
  );

  // Adreste ?layout=<id> ile belirli bir düzen istenebilir (OBS)
  const forced = query.get("layout");
  /** Yeni eklenen overlay ekranda tutuluyor mu (oyun kapalı ya da panel önizleme verisi akarken) */
  const pinActive = () => {
    if (!pinId() || app().editMode) return false;
    const st = status();
    return !st?.connected || !!st.preview;
  };
  // Overlay'ler nerede çizildiklerini bilsin (canlı sohbet örneği ekranda kısa oynayıp kaybolur, düzenlemede kalır)
  setOnScreen(true);
  createEffect(() => setScreenEditing(app().editMode));
  // Ekranda tutulan önizleme de panelle birlikte donar; canlı veri ya da Demo modunda asla
  createEffect(() => {
    const st = status();
    setPreviewFrozen(frozenEvt() && pinActive() && !!st?.preview && !st.demo);
  });
  // Tutulan overlay panelde düzenlenen (etkin) düzendedir: o düzen gösterilir
  const pick = () => forced ?? (app().editMode ? editPick() : pinActive() ? settings().activeProfile : null);
  // Bağlı yayın düzeni: kaynak düzenin overlay'leri yayın çözünürlüğüne oranlanmış hâliyle (canlı)
  setShown(liveProfile(resolveProfile(status(), !inTauri, pick()), status()));
  createEffect(() => setShown(liveProfile(resolveProfile(status(), !inTauri, pick()), status())));

  // Bağlı (ya da seçili) sim: o simde çalışmayan overlay'ler çizilmez (ayarları korunur)
  const sim = createMemo(() => currentSim(status()));

  // Bu pencerede gösterilecek kopyalar: [anahtar, manifest]
  const enabled = createMemo(
    () => {
      const p = shown()!;
      const cur = sim();
      monitors();
      return instancesOf(p)
        .filter(
          ([, i]) =>
            i.enabled &&
            !isLocked(i.type) &&
            !isHiddenOverlay(i.type) &&
            overlaySupportsSim(i.type, cur) &&
            belongsTo(i.monitor, windowMonitor),
        )
        .map(([k, i]) => [k, manifests.find((m) => m.id === i.type)!] as [string, OverlayManifest])
        .filter(([, m]) => !!m);
    },
    undefined,
    // Aynı liste tekrar üretilirse For'u yeniden çalıştırma
    { equals: (a, b) => a.length === b.length && a.every((x, i) => x[0] === b[i][0] && x[1] === b[i][1]) },
  );

  // Açık overlay'lerin veri ihtiyaçlarını birleştirip Rust'a bildir.
  // Bir overlay ayarlarında "hz" seçeneği tanımlarsa manifestteki sıklığı ezer.
  createEffect(() => {
    const prof = shown()!;
    // Performans ayarları: güncelleme sıklığı üst sınırları
    const perf = settings().general.perf;
    const topics = enabled().flatMap(([k, m]) => {
      const hzOverride = prof.overlays[k]?.options?.hz;
      return m.topics.map((t) => {
        const hz = typeof hzOverride === "number" ? hzOverride : t.hz;
        const cap = t.name === "inputs" ? perf.inputHz : perf.telemetryHz;
        return { name: t.name, hz: cap > 0 ? Math.min(hz, cap) : hz };
      });
    });
    setSubscriptions(topics);
  });

  createEffect(() => {
    if (!status()?.connected) clearData();
  });

  /** Bu kopya şu an görünsün mü (düzenlemede hepsi görünür) */
  const frameVisible = (key: string) => {
    if (app().editMode) return true;
    // Yeni eklenen overlay kısa süre her durumda görünür; overlay'ler gizliyken sadece o
    if (peekId()) {
      if (peekId() === key) return true;
      if (app().hidden) return false;
    }
    // Overlay'ler sayfasında yeni eklenen overlay: sayfada kalındıkça ekranda (örnek veriyle)
    if (pinActive()) {
      if (pinId() === key) return true;
      if (app().hidden) return false;
    }
    const inst = shown()!.overlays[key];
    if (!inst) return false;
    const st = status();
    // Canlı sohbet overlay'leri "Sürekli göster": oyun kapalıyken, tekrar izlerken ve pist dışında da görünür
    // (kopyanın kendi "garajda / pistte gizle" seçenekleri yine geçerli)
    const always = ALWAYS_TYPES.includes(inst.type) && inst.options?.always !== false;
    if (!st?.connected || st.preview) return always || !!inst.alwaysShow;
    if (always) return !(inst.hideInGarage && st.inGarage) && !(inst.hideOnTrack && st.onTrack && !st.replay);
    // Tekrar (replay) izlenirken overlay'ler gizlenir (ayar; canlı ana yetişmiş izleme hariç)
    if (settings().general.hideInReplay !== false && !st.demo && st.replayWatch) return false;
    if (settings().general.hideWhenOffTrack && !st.demo && (!st.onTrack || st.replay)) return false;
    if (inst.hideInGarage && st.inGarage) return false;
    if (inst.hideOnTrack && st.onTrack && !st.replay) return false;
    return true;
  };
  const visible = () => enabled().some(([k]) => frameVisible(k));

  createEffect(on([enabled, visible, () => app().editMode], () => nudgeRepaint(), { defer: true }));
  createEffect(() => {
    if (!app().editMode) setMenu(null);
  });

  const vars = createMemo(() => themeVars(settings().theme));
  const g = () => settings().general;

  return (
    <div
      class="host ov-theme"
      classList={{ "ov-frozen": previewFrozen(), editing: app().editMode, "grid-on": g().snapToGrid, "has-bg": app().editMode && !!editBg(), "reduce-fx": g().perf.reduceEffects, opaque: g().opaque, "ov-appbg": !!overlayBgUrl() }}
      style={{ ...vars(), "--grid": `${g().gridSize}px`, ...(overlayBgUrl() ? { "--ov-appbg": `url("${overlayBgUrl()}")` } : {}), ...(vrBg ? { "background-color": vrBg } : {}) }}
    >
      <Show when={app().editMode && editBg()}>
        <img class="edit-bg" src={editBg()!} alt="" draggable={false} style={{ opacity: g().editBackdrop.opacity / 100 }} />
        <Show when={g().snapToGrid}>
          <div class="edit-grid" />
        </Show>
      </Show>
      <Show when={app().editMode}>
        <div class="center-line v" />
        <div class="center-line h" />
        <EditBar demo={app().demo} />
        <For each={guides().v}>{(x) => <div class="guide v" style={{ left: `${x}px` }} />}</For>
        <For each={guides().h}>{(y) => <div class="guide h" style={{ top: `${y}px` }} />}</For>
      </Show>
      <For each={enabled()}>
        {([k, m]) => (
          <Show when={frameVisible(k)}>
            <OverlayFrame key={k} manifest={m} editing={app().editMode} sample={pinActive() && pinId() === k} />
          </Show>
        )}
      </For>
      <Show when={app().editMode && menu()}>
        <ContextMenu state={menu()!} screen={screen()} onClose={() => setMenu(null)} />
      </Show>
      <Show when={msgToast()}>
        <div class="msg-toast" data-no-i18n>
          <span class="msg-ic">✉</span>
          <div>
            <b>{msgToast()!.from}</b>
            <p>{msgToast()!.body}</p>
          </div>
        </div>
      </Show>
      <Show when={msgPending() > 0}>
        <div class="msg-pending">{t("✉ {0} yeni mesaj", msgPending())}</div>
      </Show>
      <Show when={shotToast()}>
        <div class="shot-toast" classList={{ err: shotToast()!.err }}>
          {shotToast()!.text}
        </div>
      </Show>
      <div class="repaint" classList={{ on: repaint() }} />
    </div>
  );
}

/** Düzenleme modunda başka düzene anında geç (yayın düzenleri seçili düzeni değiştirmez, sadece gösterilir) */
function switchLayout(id: string) {
  const p = settings().profiles[id];
  if (!p) return;
  if (p.rules.mode !== "stream") updateSettings((d) => (d.activeProfile = id));
  setEditPick(id);
  if (inTauri) void emit("edit-layout", id).catch(() => {});
}

function EditBar(props: { demo: boolean }) {
  const g = () => settings().general;
  const [picking, setPicking] = createSignal(false);
  const setDemo = (on: boolean) => {
    invoke("demo_set", { on });
    updateSettings((d) => (d.general.demo = on));
  };
  return (
    <div class="edit-banner">
      <b>Düzenleme modu</b>
      <select
        class="edit-layout"
        title="Şu an düzenlenen düzen · başka bir düzene geçmek için seç"
        value={shown()?.id ?? ""}
        onChange={(e) => switchLayout(e.currentTarget.value)}
      >
        <For each={Object.values(settings().profiles).filter((p) => !p.link)}>
          {(p) => (
            <option value={p.id} selected={p.id === shown()?.id}>
              {p.name}
            </option>
          )}
        </For>
      </select>
      <UndoRedo keys />
      <span class="edit-hint">
        Sürükle · köşeden boyutlandır · sağ tık: konum · <kbd>Alt</kbd> yapıştırmadan taşı
      </span>
      <label title="iRacing olmadan örnek veriyle göster">
        <input type="checkbox" checked={props.demo} onChange={(e) => setDemo(e.currentTarget.checked)} />
        Demo
      </label>
      <label title="Taşırken overlay'ler ızgara çizgilerine hizalanır. Kapalıyken ızgara ve orta çizgiler gizlenir, sadece overlay çerçeveleri kalır.">
        <input
          type="checkbox"
          checked={g().snapToGrid}
          onChange={(e) => updateSettings((d) => (d.general.snapToGrid = e.currentTarget.checked))}
        />
        Izgara
      </label>
      <select onChange={(e) => updateSettings((d) => (d.general.gridSize = Number(e.currentTarget.value)))}>
        <For each={[5, 10, 20, 40]}>
          {(n) => (
            <option value={n} selected={g().gridSize === n}>
              {n}px
            </option>
          )}
        </For>
      </select>
      <label title="Taşırken overlay'ler ekranın ve diğer overlay'lerin kenarlarına ve ortalarına yapışır, hizalama çizgisi gösterir. Alt tuşuna basılıyken geçici olarak kapanır.">
        <input
          type="checkbox"
          checked={g().snapToEdges}
          onChange={(e) => updateSettings((d) => (d.general.snapToEdges = e.currentTarget.checked))}
        />
        Kenarlar
      </label>
      <label
        title="Düzenlerken overlay'lerin arkasında görsel göster · sağ tık: arka planı değiştir"
        onContextMenu={(e) => {
          e.preventDefault();
          setPicking(true);
        }}
      >
        <input
          type="checkbox"
          checked={g().editBackdrop.enabled && g().editBackdrop.has}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            // Görsel seçilmemişse önce seçtir
            if (on && !g().editBackdrop.has) {
              e.currentTarget.checked = false;
              setPicking(true);
              return;
            }
            updateSettings((d) => (d.general.editBackdrop.enabled = on));
          }}
        />
        Arka plan
      </label>
      <Show when={picking()}>
        <Portal>
          <BackdropPicker onClose={() => setPicking(false)} />
        </Portal>
      </Show>
      <button class="ghost" title={`Kontrol panelini öne getir (${prettyKey(shortcut("panel"))})`} onClick={() => invoke("panel_front")}>
        Panel
      </button>
      <button onClick={() => invoke("edit_mode_set", { on: false })}>Bitti</button>
    </div>
  );
}

function OverlayFrame(props: { key: string; manifest: OverlayManifest; editing: boolean; sample?: boolean }) {
  const id = props.key;
  const inst = () => shownProfile().overlays[id];
  const Comp = componentFor(props.manifest.id);
  const globalScale = () => settings().theme.scale / 100;
  const globalOpacity = () => settings().theme.opacity / 100;

  let el: HTMLDivElement | undefined;
  // Ölçeklenmemiş içerik boyutu
  const [size, setSize] = createSignal({ w: props.manifest.size.w, h: props.manifest.size.h });
  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
    });
    ro.observe(el!);
    onCleanup(() => ro.disconnect());
  });
  onCleanup(() => rects.delete(id));

  // Sürükleme/boyutlandırma sırasında geçici durum: ekrandaki sol üst köşe ve overlay'in kendi ölçeği.
  // Ayarlar sadece bırakınca kaydedilir.
  const [drag, setDrag] = createSignal<{ x: number; y: number; scale: number } | null>(null);

  // Ekranda gösterilen dikdörtgen: kayıtlı (%100) yerleşim, genel boyuta göre çapalı ölçeklenir
  // ve her zaman ekran içine sıkıştırılır (ör. monitör değişince dışarıda kalmaz).
  const view = createMemo(() => {
    const d = drag();
    // Panelde (Düzenler) taşınıyorsa oradaki anlık konum
    const rd = d ? undefined : remoteDrag(shown()?.id, id);
    const own = d ? d.scale : (rd ?? inst()).scale;
    const eff = effectiveScale(own, globalScale());
    const w = size().w * eff;
    const h = size().h * eff;
    let r: Rect;
    if (d) {
      r = { x: d.x, y: d.y, w, h };
    } else {
      const b = rd ?? inst();
      const base = { x: b.x, y: b.y, w: size().w * own, h: size().h * own };
      r = layoutRect(base, eff / own, screen());
    }
    const c = clampRect(r, screen());
    return { ...c, scale: own, eff };
  });

  createEffect(() => {
    const v = view();
    rects.set(id, { x: v.x, y: v.y, w: v.w, h: v.h });
  });

  const others = () => [...rects.entries()].filter(([k]) => k !== id).map(([, r]) => r);

  /** Ekrandaki dikdörtgeni %100 yerleşime çevirip kaydeder. */
  const livePos = (r: Rect, own: number) => {
    const eff = effectiveScale(own, globalScale());
    const pos = unlayoutPos(r, eff / own, screen());
    return { profile: shown()?.id ?? "", key: id, x: Math.round(pos.x), y: Math.round(pos.y), scale: own };
  };
  const commit = (r: Rect, own: number) => {
    const eff = effectiveScale(own, globalScale());
    const pos = unlayoutPos(r, eff / own, screen());
    endDrag({ profile: shown()?.id ?? "", key: id, x: Math.round(pos.x), y: Math.round(pos.y), scale: own });
    editOverlay(id, (i) => {
      i.x = Math.round(pos.x);
      i.y = Math.round(pos.y);
      i.scale = own;
    });
    nudgeRepaint();
  };

  const startMove = (e: PointerEvent) => {
    if (!props.editing || e.button !== 0) return;
    e.preventDefault();
    setMenu(null);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    const o = view();
    const move = (ev: PointerEvent) => {
      const g = settings().general;
      const r = snapMove(
        { x: o.x + ev.clientX - sx, y: o.y + ev.clientY - sy, w: o.w, h: o.h },
        others(),
        screen(),
        { grid: g.snapToGrid && !ev.altKey ? g.gridSize : 0, edges: g.snapToEdges && !ev.altKey },
      );
      setGuides(r.guides);
      setDrag({ x: r.x, y: r.y, scale: o.scale });
      sendDrag(livePos({ x: r.x, y: r.y, w: o.w, h: o.h }, o.scale));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      const d = drag();
      if (d) commit({ x: d.x, y: d.y, w: o.w, h: o.h }, o.scale);
      setDrag(null);
      setGuides({ v: [], h: [] });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const startResize = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const o = view();
    const sx = e.clientX;
    const g0 = globalScale();
    // Ekrandan taşmadan izin verilen en büyük etkin ölçek
    const maxEff = Math.min((screen().w - o.x) / size().w, (screen().h - o.y) / size().h, 3 * g0);
    const move = (ev: PointerEvent) => {
      const g = settings().general;
      let right = o.x + o.w + ev.clientX - sx;
      if (g.snapToGrid && !ev.altKey) right = Math.round(right / g.gridSize) * g.gridSize;
      const eff = Math.min(maxEff, Math.max(0.2, (right - o.x) / size().w));
      const own = Math.min(3, Math.max(0.4, Math.round((eff / g0) * 100) / 100));
      setDrag({ x: o.x, y: o.y, scale: own });
      const e2 = effectiveScale(own, g0);
      sendDrag(livePos({ x: o.x, y: o.y, w: size().w * e2, h: size().h * e2 }, own));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      const d = drag();
      if (d) {
        const eff = effectiveScale(d.scale, g0);
        commit({ x: d.x, y: d.y, w: size().w * eff, h: size().h * eff }, d.scale);
      }
      setDrag(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const onContext = (e: MouseEvent) => {
    if (!props.editing) return;
    e.preventDefault();
    const v = view();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      id,
      type: props.manifest.id,
      name: instanceName(id, inst()),
      rect: { x: v.x, y: v.y, w: v.w, h: v.h },
      scale: v.scale,
      commit,
      profileId: shownProfile().id,
    });
  };

  return (
    <div
      ref={el}
      class="frame"
      classList={{ dragging: !!drag(), peek: peekId() === id }}
      style={{
        transform: `translate(${view().x}px, ${view().y}px) scale(${view().eff})`,
        // Genel opaklık bir tavandır: overlay'in kendi opaklığı ondan düşükse aynen kalır
        opacity: Math.min(inst().opacity, globalOpacity()),
        "min-width": props.editing ? `${props.manifest.size.w}px` : undefined,
        "min-height": props.editing ? `${Math.min(props.manifest.size.h, 60)}px` : undefined,
      }}
      onPointerDown={startMove}
      onContextMenu={onContext}
    >
      <Show when={props.editing}>
        <div
          class="frame-label"
          classList={{ right: view().x + view().w / 2 > screen().w * 0.66 }}
          style={{ transform: `scale(${1 / view().eff})` }}
        >
          <span>
            {instanceName(id, inst())} · {Math.round(view().scale * 100)}%
            <Show when={Math.abs(view().eff - view().scale) > 0.005}>
              <small> (ekranda {Math.round(view().eff * 100)}%)</small>
            </Show>
          </span>
          <button
            class="frame-close"
            title="Bu overlay'i kapat"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => editOverlay(id, (i) => (i.enabled = false))}
          >
            ✕
          </button>
        </div>
        <div class="frame-resize" style={{ transform: `scale(${1 / view().eff})` }} onPointerDown={startResize} />
      </Show>
      <Suspense>
        <Show when={Comp} fallback={<div class="ov-panel ov-empty">Overlay.tsx bulunamadı</div>}>
          <Dynamic component={Comp} options={sanitizeOverlayOptions(props.manifest.id, inst().options)} units={settings().general.units} editing={props.editing || !!props.sample} />
        </Show>
      </Suspense>
    </div>
  );
}
