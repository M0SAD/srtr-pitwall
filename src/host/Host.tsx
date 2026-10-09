// Şeffaf overlay penceresi. Tüm overlay'ler bu tek pencerenin içinde çizilir
// (her overlay için ayrı pencere açmak RAM'i katlar).

import { isHiddenOverlay, isLocked, startPing } from "@/cloud/account";
import { msgPending, msgToast, startSocial } from "./social";
import { crewBox, startCrew } from "./crew";
import { startBrakeRef } from "./brakeref";
import { startCoachRef } from "./coachref";
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
import { sanitizeOverlayOptions, streamBadgeLocked } from "@/sdk/proFeatures";
import { instanceName, instancesOf, resolveProfile, settings, stackKeys, updateOverlay, updateSettings, type Profile } from "@/sdk/settings";
import { belongsTo, loadMonitors, monitors } from "@/sdk/monitors";
import { canvasOf, liveProfile } from "@/sdk/streamLink";
import { StreamBadgeMark, badgeFactor, badgeCfg, badgeForcedLive, badgeRect } from "@/sdk/streamBadge";
import { inTauri, query } from "@/sdk/platform";
import { clearData, setSubscriptions, useTopic } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import { lookClear, lookStyle } from "@/sdk/lookStyle";
import { UndoRedo } from "@/sdk/UndoRedo";
import type { AppState } from "@/sdk/types";
import { clampField, previewFrozen, resizeFields, rowUnit, setOnScreen, setPreviewFrozen, setScreenEditing, type OverlayComponent, type OverlayManifest } from "@/sdk/overlay";
import {
  CORNERS,
  clampRect,
  cornerResize,
  edgeResize,
  effectiveScale,
  layoutRect,
  snapMove,
  unlayoutPos,
  type Corner,
  type Edge,
  type Guides,
  type Rect,
} from "./snap";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { endDrag, remoteDrag, sendDrag } from "@/sdk/livedrag";
import { BackdropPicker } from "@/app/components/BackdropPicker";
import { overlayBgUrl } from "@/app/appBg";
import { currentSim, overlaySupportsSim } from "@/overlays/simSupport";
import { sessionShown } from "@/sdk/sessionShow";
import { replayClick, reportClickRects, setReplayClick } from "@/sdk/replayClick";
import type { Status } from "@/sdk/types";

/** Tekrar ekranında mı (eski bir anı izlerken de, canlı ana yetişmiş izlerken de); garaj / setup ekranı hariç */
const inReplay = (st: Status) => !!st.replayWatch || (!!st.replay && st.garageVisible !== true && !st.onTrack);

// Panelden yeni eklenen overlay: kısa süre gösterilir ve vurgulanır
const [peekId, setPeekId] = createSignal<string | null>(null);
let peekTimer: number | undefined;
// Overlay'ler sayfasında yeni eklenen overlay: kullanıcı o sayfada kaldıkça (oyun kapalıyken) örnek veriyle ekranda tutulur.
// Panel bırakınca (sayfadan çıkış, başka overlay seçimi, panel kapanışı) ya da oyun bağlanınca normal kurallara dönülür.
const [pinId, setPinId] = createSignal<string | null>(null);
// Tutulan overlay'in düzeni: Overlay'ler sayfasında düzenlenen düzen (yoksa etkin düzen)
const [pinProfile, setPinProfile] = createSignal<string | null>(null);
/** Panel önizlemeyi dondurdu (Rust: preview_freeze); sadece önizleme verisi akarken dikkate alınır */
const [frozenEvt, setFrozenEvt] = createSignal(false);

// Ekran görüntüsü bildirimi
const [shotToast, setShotToast] = createSignal<{ text: string; err: boolean } | null>(null);
let shotToastTimer: number | undefined;
async function showShotToast(text: string, err: boolean) {
  // Kısayolla yapılan işlemi üst ortadaki kısayol bildirimi (OSD, Rust: osd.rs) zaten gösterdiyse ikinci bir
  // bildirim çıkarma; OSD ayarı kapalıysa (ya da işlem panelden yapıldıysa) bu bildirim gösterilir
  if (await invoke<boolean>("osd_claimed").catch(() => false)) return;
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

// Düzenleme modunda üst üste binen overlay'ler: tıklamanın kime gideceğini seçmek için tutamaklar
interface FrameHandle {
  locked: () => boolean;
  begin: (e: PointerEvent, cycle?: string) => void;
}
const frames = new Map<string, FrameHandle>();
/** Son tıklanan overlay: üstte çizilir, sürüklemede önceliklidir, ok tuşlarıyla taşınır */
const [picked, setPicked] = createSignal<string | null>(null);
/** Son tıklamanın yeri: aynı yere sürüklemeden tekrar tıklanınca alttaki overlay'e geçilir */
let lastClick: { x: number; y: number } | null = null;
const stackAt = (x: number, y: number): string[] =>
  document
    .elementsFromPoint(x, y)
    .map((n) => (n instanceof HTMLElement && n.classList.contains("frame") ? n.dataset.fkey : undefined))
    .filter((k): k is string => !!k && frames.has(k));

/** Tuş hedefi yazı alanı mı (ok tuşları oraya aittir) */
const typingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Ok tuşu -> (dx, dy); Shift: 10 px */
function arrowDelta(e: KeyboardEvent): [number, number] | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return null;
  const n = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case "ArrowLeft":
      return [-n, 0];
    case "ArrowRight":
      return [n, 0];
    case "ArrowUp":
      return [0, -n];
    case "ArrowDown":
      return [0, n];
  }
  return null;
}

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
/** Simden bağımsız konular (Rust: engine.rs PUSHED + team + status): oyun bağlı değilken de abone kalınır */
const OFFLINE_TOPICS = ["status", "livechat", "livepoll", "captions", "voice", "team"];

export function Host() {
  const [appRaw, setApp] = createSignal<AppState>({ demo: false, editMode: false, connected: false, hidden: false });
  const app = (): AppState => (vrBoard ? { ...appRaw(), editMode: false, hidden: false } : appRaw());
  // Overlay penceresinin boyutu (normal düzende logonun köşesi buna göre hesaplanır)
  const [winSize, setWinSize] = createSignal({ w: window.innerWidth, h: window.innerHeight });
  const onWinResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
  window.addEventListener("resize", onWinResize);
  onCleanup(() => window.removeEventListener("resize", onWinResize));
  // Tekrar izlerken (iRacing) sürücü adına tıklayıp canlı izleme: adların yeri düzenli olarak bildirilir
  createEffect(() => {
    const st = status();
    setReplayClick(!!st?.connected && !st.demo && !st.preview && inReplay(st) && (st.sim || "iracing") === "iracing" && !app().editMode);
  });
  {
    const tick = setInterval(() => reportClickRects(replayClick()), 250);
    onCleanup(() => {
      clearInterval(tick);
      reportClickRects(false);
    });
  }
  const status = useTopic("status");
  // Açılış: uygulama durumu (state_get) ve ilk `status` paketi gelene kadar hiçbir overlay çizilmez
  // (durum bilinmeden çizilen overlay açılışta görünüp kaybolmasın). Tarayıcı kaynağında (OBS) beklenmez.
  const [booted, setBooted] = createSignal(!inTauri);
  const ready = () => !inTauri || (booted() && status() !== undefined);

  onMount(async () => {
    loadMonitors();
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
    if (!inTauri) return; // Tarayıcı kaynağı: düzenleme/gizleme yok
    setApp(await invoke<AppState>("state_get"));
    setBooted(true);
    await listen<AppState>("app-state", (e) => {
      setApp(e.payload);
      if (!e.payload.editMode) setEditPick(null);
    });
    await listen<string>("edit-layout", (e) => setEditPick(e.payload || null));
    await listen<{ id: string | null; profile?: string | null }>("overlay-pin", (e) => {
      setPinProfile(e.payload?.profile || null);
      setPinId(e.payload?.id || null);
    });
    await listen<boolean>("preview-frozen", (e) => setFrozenEvt(!!e.payload));
    // Pencere sonradan açıldıysa (ör. başka monitörün penceresi) o anki durumu al
    invoke<string | null>("overlay_pin_get")
      .then((id) => setPinId(id || null))
      .catch(() => {});
    invoke<string | null>("overlay_pin_profile_get")
      .then((id) => setPinProfile(id || null))
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
      startBrakeRef();
      startCoachRef();
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
        const eb = settings().general.editBackdrops.screen;
        return [app().editMode && eb.enabled && eb.has && windowMonitor === "" && inTauri, eb.rev] as const;
      },
      async ([want]) => {
        if (bgUrl) URL.revokeObjectURL(bgUrl);
        bgUrl = null;
        setEditBg(null);
        if (!want) return;
        try {
          const buf = await invoke<ArrayBuffer>("edit_backdrop_read", { slot: "screen" });
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
  /**
   * Sim verisi ekrana akıtılsın mı: sadece oyun bağlıyken ya da Demo açıkken. Panel önizleme verisi (status.preview:
   * panelde Overlay'ler / Düzenler sayfası açıkken üretilen örnek veri) ekrandaki overlay'lere verilmez; yoksa
   * "iRacing kapalıyken de göster" açık overlay'ler uygulama açılınca örnek veriyle görünüp sayfadan çıkınca kaybolur.
   */
  const feedLive = () => {
    if (!inTauri) return true;
    const st = status();
    return !!st?.connected && (!st.preview || pinActive());
  };
  // Overlay'ler nerede çizildiklerini bilsin (canlı sohbet örneği ekranda kısa oynayıp kaybolur, düzenlemede kalır)
  setOnScreen(true);
  createEffect(() => setScreenEditing(app().editMode));
  // Ekranda tutulan önizleme de panelle birlikte donar; canlı veri ya da Demo modunda asla
  createEffect(() => {
    const st = status();
    setPreviewFrozen(frozenEvt() && pinActive() && !!st?.preview && !st.demo);
  });
  // Tutulan overlay panelde düzenlenen düzendedir (Overlay'ler sayfasında seçili düzen; yoksa etkin düzen): o gösterilir
  const pick = () => forced ?? (app().editMode ? editPick() : pinActive() ? pinProfile() ?? settings().activeProfile : null);
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
      const all = new Map(instancesOf(p));
      // Listede üstte olan overlay ekranda da üstte çizilir (bkz. stackKeys)
      return stackKeys(p, [...all.keys()])
        .map((k) => [k, all.get(k)!] as const)
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
    const live = feedLive();
    const topics = enabled().flatMap(([k, m]) => {
      const hzOverride = prof.overlays[k]?.options?.hz;
      return m.topics.filter((t) => live || OFFLINE_TOPICS.includes(t.name)).map((t) => {
        const hz = typeof hzOverride === "number" ? hzOverride : t.hz;
        const cap = t.name === "inputs" ? perf.inputHz : perf.telemetryHz;
        return { name: t.name, hz: cap > 0 ? Math.min(hz, cap) : hz };
      });
    });
    setSubscriptions(topics);
  });

  createEffect(() => {
    // `status` her pakette tetiklenir: önizleme sürerken yolda kalmış bir veri paketi de sonraki durumda silinir
    if (!status()?.connected || !feedLive()) clearData();
  });

  /** Bu kopya şu an görünsün mü (düzenlemede hepsi görünür) */
  const frameVisible = (key: string) => {
    if (!ready()) return false;
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
    // Görünürlüğüne kendisi karar veren overlay (Setup Örtüsü): aşağıdaki gizleme kuralları uygulanmaz. iRacing'de garaj
    // ekranı açıkken sim "tekrar oynatılıyor" bildirdiği için "tekrar izlerken gizle" kuralı örtüyü de gizliyordu.
    if (manifests.find((x) => x.id === inst.type)?.ownVisibility) return (!!st?.connected && !st.preview) || inst.options?.when === "always";
    if (!st?.connected || st.preview) return always || !!inst.alwaysShow;
    // "Pitteyken gizle": garajda ya da pit yolunda / kutusunda. "Pistte sürerken gizle": araçta ve pitte değilken.
    const inPit = st.inGarage || !!st.onPit;
    const driving = st.onTrack && !st.replay && !inPit;
    if (always) return !(inst.hideInGarage && inPit) && !(inst.hideOnTrack && driving);
    // Tekrar (replay) izlenirken overlay'ler gizlenir (ayar; canlı ana yetişmiş izleme hariç)
    // "Her zaman göster" işaretli kopyalar (ör. Kan Şekeri, Kalp Atışı) tekrarda da görünür: iRacing garaj ekranı ve
    // araç dışı görünüm de "tekrar" sayıldığından bu kopyalar orada kayboluyordu.
    // "Replay'de göster" işaretli kopya tekrar izlenirken görünür (genel "replay izlerken gizle" ve "pistte değilken
    // gizle" kuralları ona uygulanmaz)
    // iRacing'de araçtan inince tekrar ekranı canlı ana yetişmiş olarak açılır (replayWatch false, replay true): o da
    // "replay" sayılır; yoksa "pistte değilken gizle" kuralı kopyayı yine gizliyordu. Garaj / setup ekranı sayılmaz.
    const replayOk = !st.demo && inReplay(st) && !!inst.showInReplay;
    if (settings().general.hideInReplay !== false && !st.demo && st.replayWatch && !inst.alwaysShow && !replayOk) return false;
    // "Pistte değilken gizle" (varsayılan açık): overlay'ler sürüş başlayınca görünür. "Oyun kapalıyken de göster" işaretli
    // kopyalar (ör. Kan Şekeri, Kalp Atışı, Sosyal Hesaplar) garajda da görünür kalır.
    // "İzlerken / garaj" türündeki düzenler tam da pist dışı içindir: onlar gizlenmez.
    if (settings().general.hideWhenOffTrack && shown()!.rules.mode !== "spotting" && !inst.alwaysShow && !replayOk && !st.demo && (!st.onTrack || st.replay)) return false;
    // Sıralama / Yakındakiler: yalnızca "Gösterildiği oturumlar"da seçili oturum türlerinde (test / antrenman / sıralama / yarış)
    if (!st.demo && (inst.type === "standings" || inst.type === "relative") && !sessionShown(inst.options, st.sessionType)) return false;
    // Demo'da "pitteyken gizle" / "pistte gizle" uygulanmaz: yerleşim denenirken her overlay görünsün
    if (!st.demo && inst.hideInGarage && inPit) return false;
    if (!st.demo && inst.hideOnTrack && driving) return false;
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
      classList={{ "ov-frozen": previewFrozen(), editing: app().editMode, "replay-click": replayClick(), "grid-on": g().snapToGrid, "has-bg": app().editMode && !!editBg(), "reduce-fx": g().perf.reduceEffects, opaque: g().opaque, "ov-appbg": !!overlayBgUrl() }}
      style={{ ...vars(), "--grid": `${g().gridSize}px`, ...(overlayBgUrl() ? { "--ov-appbg": `url("${overlayBgUrl()}")` } : {}), ...(vrBg ? { "background-color": vrBg } : {}) }}
    >
      <Show when={app().editMode && editBg()}>
        <img class="edit-bg" src={editBg()!} alt="" draggable={false} style={{ opacity: g().editBackdrops.screen.opacity / 100 }} />
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
      {/* Yayın düzeni (OBS): SRTR Pitwall logosu her zaman overlay'lerin üstünde; gizlemek PRO'ya bağlı (sdk/streamBadge.tsx) */}
      <Show when={!inTauri && shown()?.rules.mode === "stream" && (badgeForcedLive() || badgeCfg(shown()).show)}>
        <div
          class="stream-badge"
          style={{
            position: "absolute",
            left: `${badgeRect(canvasOf(shown()!), badgeForcedLive() ? undefined : badgeCfg(shown()).pos, badgeForcedLive() ? 1 : badgeCfg(shown()).scale).x}px`,
            top: `${badgeRect(canvasOf(shown()!), badgeForcedLive() ? undefined : badgeCfg(shown()).pos, badgeForcedLive() ? 1 : badgeCfg(shown()).scale).y}px`,
            "z-index": "2147483000",
            transform: `scale(${badgeFactor(canvasOf(shown()!)) * (badgeForcedLive() ? 1 : badgeCfg(shown()).scale)})`,
            "transform-origin": "0 0",
            "pointer-events": "none",
            // Overlay'lerle aynı koşul: sim bağlıyken (ya da Demo açıkken) yumuşakça belirir, yoksa söner
            opacity: status()?.connected && !status()?.preview ? "1" : "0",
            transition: "opacity 0.8s ease",
          }}
        >
          <StreamBadgeMark />
        </div>
      </Show>
      {/* Normal düzen (oyunun üstündeki overlay penceresi): bu monitörde en az bir overlay varsa: aynı logo, aynı kurallar */}
      <Show when={inTauri && !vrBoard && shown()?.rules.mode !== "stream" && enabled().length > 0 && (streamBadgeLocked() || badgeCfg(shown()).show)}>
        <div
          class="stream-badge"
          style={{
            position: "absolute",
            left: `${badgeRect(winSize(), streamBadgeLocked() ? undefined : badgeCfg(shown()).pos, streamBadgeLocked() ? 1 : badgeCfg(shown()).scale).x}px`,
            top: `${badgeRect(winSize(), streamBadgeLocked() ? undefined : badgeCfg(shown()).pos, streamBadgeLocked() ? 1 : badgeCfg(shown()).scale).y}px`,
            "z-index": "2147483000",
            transform: `scale(${badgeFactor(winSize()) * (streamBadgeLocked() ? 1 : badgeCfg(shown()).scale)})`,
            "transform-origin": "0 0",
            "pointer-events": "none",
            // Overlay'lerle birlikte: sim bağlıyken (ya da Demo'da) ve overlay'ler gizli değilken görünür
            opacity: status()?.connected && !status()?.preview && !app().hidden ? "1" : "0",
            transition: "opacity 0.8s ease",
          }}
        >
          <StreamBadgeMark />
        </div>
      </Show>
      <Show when={app().editMode && menu() && !shown()?.locked}>
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
      <Show when={crewBox()}>
        <div class="crew-box" classList={{ out: !!crewBox()!.out }} data-no-i18n>
          <b>{crewBox()!.from}</b>
          <p>{crewBox()!.body}</p>
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
        <For each={Object.values(settings().profiles).filter((p) => p.rules.mode !== "stream" || p.id === shown()?.id)}>
          {(p) => (
            <option value={p.id} selected={p.id === shown()?.id}>
              {p.name}
            </option>
          )}
        </For>
      </select>
      <UndoRedo keys />
      <Show
        when={!shown()?.locked}
        fallback={
          <span class="edit-hint edit-locked">
            Bu düzen kilitli: overlay'ler taşınamaz.
            <button class="ghost" title="Düzenin kilidini aç" onClick={() => updateSettings((d) => void (d.profiles[shown()!.id] && delete d.profiles[shown()!.id].locked))}>
              Kilidi aç
            </button>
          </span>
        }
      >
        <span class="edit-hint">
          Sürükle · köşelerden boyutlandır · sağ tık: konum · <kbd>Alt</kbd> yapıştırmadan taşı · ok tuşları: 1 px taşı
        </span>
      </Show>
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
          checked={g().editBackdrops.screen.enabled && g().editBackdrops.screen.has}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            // Görsel seçilmemişse önce seçtir
            if (on && !g().editBackdrops.screen.has) {
              e.currentTarget.checked = false;
              setPicking(true);
              return;
            }
            updateSettings((d) => (d.general.editBackdrops.screen.enabled = on));
          }}
        />
        Arka plan
      </label>
      <Show when={picking()}>
        <Portal>
          <BackdropPicker slot="screen" onClose={() => setPicking(false)} />
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
  const [drag, setDrag] = createSignal<{ x: number; y: number; scale: number; opts?: Record<string, number> } | null>(null);
  /** Kilitli düzen: taşınamaz, boyutlandırılamaz, kapatılamaz */
  const layoutLocked = () => !!shown()?.locked;
  /** Kilitli kopya (sağ tık > Kilitle): taşınamaz, boyutlandırılamaz, kapatılamaz; sağ tık menüsü açılır (kilidi açmak için) */
  const locked = () => layoutLocked() || !!inst()?.locked;
  /** Kilitli Setup Örtüsü düzenlemede neredeyse saydam olur ve tıklamaları geçirir: arkasındaki overlay'ler seçilebilir */
  const ghost = () => props.editing && !!inst()?.locked && !!props.manifest.ownVisibility;
  /** Kenardan boyutlandırılabilen genişlik / yükseklik ayarları */
  const rz = createMemo(() => resizeFields(props.manifest, inst()?.options));
  /** Satır birimli sürükleme sonucunu (px farkı) ayar değerine çevirir */
  const rowEdge = <T extends { value: number }>(r: T, cur: number, unit: number): T => (unit === 1 && cur === 0 ? r : { ...r, value: Math.round(cur + r.value / unit) });
  /** Sürükleme sırasında (burada ya da panelde) geçici ayar değerleri */
  const liveOpts = () => drag()?.opts ?? remoteDrag(shown()?.id, id)?.opts;

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
  const livePos = (r: Rect, own: number, opts?: Record<string, number>) => {
    const eff = effectiveScale(own, globalScale());
    const pos = unlayoutPos(r, eff / own, screen());
    return { profile: shown()?.id ?? "", key: id, x: Math.round(pos.x), y: Math.round(pos.y), scale: own, ...(opts ? { opts } : {}) };
  };
  const commit = (r: Rect, own: number, opts?: Record<string, number>) => {
    if (locked()) return;
    const eff = effectiveScale(own, globalScale());
    const pos = unlayoutPos(r, eff / own, screen());
    endDrag({ profile: shown()?.id ?? "", key: id, x: Math.round(pos.x), y: Math.round(pos.y), scale: own, ...(opts ? { opts } : {}) });
    editOverlay(id, (i) => {
      i.x = Math.round(pos.x);
      i.y = Math.round(pos.y);
      i.scale = own;
      if (opts) Object.assign(i.options, opts);
    });
    nudgeRepaint();
  };

  /**
   * Sol tık: kilitli overlay tıklamayı geçirir (altındaki kilitsiz overlay tutulur); son tıklanan overlay
   * imlecin altındaysa öncelik ondadır; aynı yere sürüklemeden tekrar tıklanınca alttaki overlay'e geçilir.
   */
  const startMove = (e: PointerEvent) => {
    if (!props.editing || e.button !== 0) return;
    e.preventDefault();
    setMenu(null);
    if (layoutLocked()) return;
    const free = stackAt(e.clientX, e.clientY).filter((k) => !frames.get(k)!.locked());
    if (!free.length) return void setPicked(id);
    const cur = free.find((k) => k === picked());
    const again = !!lastClick && Math.hypot(lastClick.x - e.clientX, lastClick.y - e.clientY) < 5;
    const cycle = cur && again && free.length > 1 ? free[(free.indexOf(cur) + 1) % free.length] : undefined;
    lastClick = { x: e.clientX, y: e.clientY };
    frames.get(cur ?? free[0])!.begin(e, cycle);
  };

  const begin = (e: PointerEvent, cycle?: string) => {
    if (!el || locked()) return;
    setPicked(id);
    const target = el;
    target.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    const o = view();
    let moved = false;
    const move = (ev: PointerEvent) => {
      // Küçük el titremesi sürükleme sayılmaz (tıklama: seç / alttakine geç)
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      moved = true;
      lastClick = null;
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
      if (!moved && cycle && frames.has(cycle)) setPicked(cycle);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const handle: FrameHandle = { locked, begin };
  frames.set(id, handle);
  onCleanup(() => frames.get(id) === handle && frames.delete(id));

  // Ok tuşları (düzenleme modu): son tıklanan overlay'i 1 px (Shift: 10 px) taşır; yapıştırma uygulanmaz
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (!props.editing || picked() !== id || drag()) return;
      const d = arrowDelta(e);
      if (!d || typingTarget(e.target)) return;
      if (document.querySelector(".modal-back, .bp-back, .ctx")) return;
      e.preventDefault();
      if (locked()) return;
      const v = view();
      const r = clampRect({ x: v.x + d[0], y: v.y + d[1], w: v.w, h: v.h }, screen());
      if (r.x !== v.x || r.y !== v.y) commit({ x: r.x, y: r.y, w: v.w, h: v.h }, v.scale);
    };
    window.addEventListener("keydown", key);
    onCleanup(() => window.removeEventListener("keydown", key));
  });

  /** Sürükleme bitişi: dinleyicileri kaldırır, son durumu kaydeder */
  const track = (target: HTMLElement, move: (ev: PointerEvent) => void, done: () => void) => {
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      done();
      setDrag(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  /** Köşeden boyutlandır (ölçek): overlay sürüklenen köşeye doğru büyür, karşı köşe yerinde kalır */
  const startResize = (c: Corner) => (e: PointerEvent) => {
    if (e.button !== 0 || locked()) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const o = view();
    const sx = e.clientX;
    const sy = e.clientY;
    const g0 = globalScale();
    const base = size();
    let last: (Rect & { scale: number }) | null = null;
    track(
      target,
      (ev) => {
        const g = settings().general;
        last = cornerResize(o, c, ev.clientX - sx, ev.clientY - sy, base, g0, { grid: g.snapToGrid && !ev.altKey ? g.gridSize : 0, screen: screen() });
        setDrag({ x: last.x, y: last.y, scale: last.scale });
        sendDrag(livePos(last, last.scale));
      },
      () => last && commit(last, last.scale),
    );
  };

  /** Kenardan boyutlandır: overlay'in genişlik / yükseklik ayarı değişir (ölçek aynı kalır) */
  const startEdge = (edge: Edge) => (e: PointerEvent) => {
    const f = edge === "e" || edge === "w" ? rz().w : rz().h;
    if (e.button !== 0 || locked() || !f) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const o = view();
    const s0 = edge === "e" || edge === "w" ? e.clientX : e.clientY;
    const wMin = (edge === "e" || edge === "w") && props.manifest.resize !== false && !!props.manifest.resize?.wMin;
    const cur = Math.max(Number(inst().options[f.key]) || f.default, wMin ? size().w : 0);
    // Satır sayan yükseklik ayarı: sürükleme px'i ölçülen satır yüksekliğiyle tam satıra çevrilir
    const rows = edge === "n" || edge === "s" ? rz().rows : undefined;
    const unit = rows ? rowUnit(el, rows) : 1;
    let last: (Rect & { value: number }) | null = null;
    track(
      target,
      (ev) => {
        const d = (edge === "e" || edge === "w" ? ev.clientX : ev.clientY) - s0;
        last = rowEdge(edgeResize(o, edge, d, o.eff, rows ? 0 : cur, (v) => (rows ? (clampField(f, cur + v / unit) - cur) * unit : clampField(f, v))), rows ? cur : 0, unit);
        const opts = { [f.key]: last.value };
        setDrag({ x: last.x, y: last.y, scale: o.scale, opts });
        sendDrag(livePos(last, o.scale, opts));
      },
      () => last && commit(last, o.scale, { [f.key]: last.value }),
    );
  };

  const onContext = (e: MouseEvent) => {
    if (!props.editing) return;
    e.preventDefault();
    if (layoutLocked()) return;
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
      data-fkey={id}
      class="frame"
      classList={{ picked: props.editing && picked() === id, dragging: !!drag(), peek: peekId() === id, locked: props.editing && locked(), ghost: ghost(), "ov-clear": !props.manifest.noBgOpacity && lookClear(inst().look, settings().theme, inst().bgOpacity) }}
      style={{
        // Kopyaya özel görünüm: tema değişkenlerinin üstüne (yoksa boş)
        ...lookStyle(inst().look, settings().theme, inst().bgOpacity),
        transform: `translate(${view().x}px, ${view().y}px) scale(${view().eff})`,
        // Genel opaklık bir tavandır: overlay'in kendi opaklığı ondan düşükse aynen kalır
        opacity: ghost() ? 0.2 : Math.min(inst().opacity, globalOpacity()),
        // Düzenlemede boş kalan overlay de tutulabilsin diye küçük bir alt sınır. Eskiden manifestteki tam genişlikti: içeriği daha
        // dar olan tasarımlarda (ör. Kan Şekeri / Kalp Atışı yuvarlak) sağda boşluk kalıyor, overlay sağ kenara yanaşamıyordu.
        "min-width": props.editing && !rz().w ? `${Math.min(props.manifest.size.w, 60)}px` : undefined,
        "min-height": props.editing && !rz().h ? `${Math.min(props.manifest.size.h, 60)}px` : undefined,
      }}
      onPointerDown={startMove}
      onContextMenu={onContext}
    >
      <Show when={ghost() && !layoutLocked()}>
        <button class="frame-unlock" title="Kilidi aç" onPointerDown={(e) => e.stopPropagation()} onClick={() => editOverlay(id, (i) => void delete i.locked)}>
          🔒
        </button>
      </Show>
      <Show when={props.editing}>
        <div
          class="frame-label"
          classList={{ right: view().x + view().w / 2 > screen().w * 0.66 }}
          style={{ transform: `scale(${1 / view().eff})` }}
        >
          <span>
            <Show when={locked()}>🔒 </Show>
            {instanceName(id, inst())} · {Math.round(view().scale * 100)}%
            <Show when={Math.abs(view().eff - view().scale) > 0.005}>
              <small> (ekranda {Math.round(view().eff * 100)}%)</small>
            </Show>
          </span>
          <Show when={!locked()}>
            <button
              class="frame-close"
              title="Bu overlay'i kapat"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => editOverlay(id, (i) => (i.enabled = false))}
            >
              ✕
            </button>
          </Show>
        </div>
        <Show when={!locked()}>
          <For each={(rz().w ? (["w", "e"] as Edge[]) : []).concat(rz().h ? (["n", "s"] as Edge[]) : [])}>
            {(ed) => <div class={`rz-edge ${ed}`} style={{ "--hk": String(1 / view().eff) }} title="Kenardan sürükle: genişlik / yükseklik" onPointerDown={startEdge(ed)} />}
          </For>
          <For each={CORNERS}>{(c) => <div class={`frame-resize ${c}`} style={{ transform: `scale(${1 / view().eff})` }} onPointerDown={startResize(c)} />}</For>
        </Show>
      </Show>
      <Suspense>
        <Show when={Comp} fallback={<div class="ov-panel ov-empty">Overlay.tsx bulunamadı</div>}>
          <Dynamic component={Comp} options={sanitizeOverlayOptions(props.manifest.id, liveOpts() ? { ...inst().options, ...liveOpts() } : inst().options)} units={settings().general.units} editing={props.editing || !!props.sample} />
        </Show>
      </Suspense>
    </div>
  );
}
