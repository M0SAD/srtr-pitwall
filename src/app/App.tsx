// Kontrol paneli kabuğu: solda ikon menü, üstte durum çubuğu, ortada bölüm.

import "./pageStyles";
import { t } from "@/sdk/i18n";
import { For, Match, Show, Switch, createEffect, createSignal, lazy, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppState } from "@/sdk/types";
import { settings, takeLiveChatAutoMigrated, updateSettings } from "@/sdk/settings";
import { loadMonitors } from "@/sdk/monitors";
import { syncScreens } from "@/sdk/streamLink";
import { cloudEnabled, conflict, resolveConflict, session } from "@/cloud/supabase";
import { localeTag } from "@/sdk/i18n";
import { freeView, realAdmin, setFreeView, isAdmin, isHiddenSection, isPro, markedHiddenSection, proDaysLeft, proExpiringSoon } from "@/cloud/account";
import { useSubscriptions, useTopic } from "@/sdk/telemetry";
import { bindUpdateEvents, checking, checkUpdate, focusOverlay, editFriendLook, go, loadVersion, openUrl, section, setUpdateDialog, sub, update, version, type Section } from "./ui";
import { UpdateDialog } from "./components/UpdateDialog";
import { TrialWelcome } from "./components/TrialWelcome";
import * as I from "./icons";
import { OverlaysPage } from "./pages/OverlaysPage";
import { setTeamFocus } from "@/cloud/teams";
import { setCrewFocus } from "@/cloud/crew";
import { NoticeBell } from "./components/Moderation";
import { FriendsDock } from "./components/FriendsDock";
import * as LC from "@/sdk/livechat";
import { LangPicker } from "./components/LangPicker";
import { WinChrome } from "@/window/chrome";
import { loadNotices } from "@/cloud/moderation";
import { LIVECHAT_PAGES, liveChatPages } from "./pages/liveChatPages";
import { ProTag } from "./components/ProLock";
import { SETTINGS_PAGES } from "./pages/settingsPages";
import { adminSubs, canSeeAdmin } from "./pages/adminSubs";
import { adminBadge, adminBadgeTotal, badgeText, useAdminBadges } from "@/cloud/adminBadges";
import { useOverlayStats } from "@/cloud/overlayStats";
import { AppBgLayer, appBgActive } from "./appBg";
import { AdminTopStats } from "./components/AdminTopStats";
import { MENU_SUBS, isHiddenMenu, markedHiddenMenu, visibleSubs } from "./menu";
import { TopLinks } from "./components/TopLinks";

// Açılış sayfası (Overlaylarım) dışındaki sayfalar ilk açıldıklarında yüklenir: panel daha hızlı açılır, daha az bellek kullanır.
// (Suspense sarmalayıcısı bilerek yok: sayfaların kendi createResource'ları eskisi gibi davranır.)
const LayoutsPage = lazy(() => import("./pages/LayoutsPage").then((m) => ({ default: m.LayoutsPage })));
const StreamingPage = lazy(() => import("./pages/StreamingPage").then((m) => ({ default: m.StreamingPage })));
const ToolsPage = lazy(() => import("./pages/ToolsPage").then((m) => ({ default: m.ToolsPage })));
const LeaguePage = lazy(() => import("./pages/LeaguePage").then((m) => ({ default: m.LeaguePage })));
const FriendsPage = lazy(() => import("./pages/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const TeamsPage = lazy(() => import("./pages/TeamsPage").then((m) => ({ default: m.TeamsPage })));
const CrewPage = lazy(() => import("./pages/CrewPage").then((m) => ({ default: m.CrewPage })));
const CommunityPage = lazy(() => import("./pages/CommunityPage").then((m) => ({ default: m.CommunityPage })));
const CommunityShots = lazy(() => import("./pages/CommunityShots").then((m) => ({ default: m.CommunityShots })));
const CommunityHome = lazy(() => import("./pages/CommunityHome").then((m) => ({ default: m.CommunityHome })));
const CommunityThemes = lazy(() => import("./pages/CommunityThemes").then((m) => ({ default: m.CommunityThemes })));
const CommunityDashes = lazy(() => import("./pages/CommunityDashes").then((m) => ({ default: m.CommunityDashes })));
const ScreenshotsPage = lazy(() => import("./pages/ScreenshotsPage").then((m) => ({ default: m.ScreenshotsPage })));
const VoicePage = lazy(() => import("./pages/VoicePage").then((m) => ({ default: m.VoicePage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((m) => ({ default: m.SupportPage })));
const TelemetryPage = lazy(() => import("./pages/TelemetryPage").then((m) => ({ default: m.TelemetryPage })));
const AccountPage = lazy(() => import("./pages/AccountPage").then((m) => ({ default: m.AccountPage })));
const LiveChatPage = lazy(() => import("./pages/LiveChatPage").then((m) => ({ default: m.LiveChatPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const ProPage = lazy(() => import("./pages/AccountPage").then((m) => ({ default: m.ProPage })));

export const [appState, setAppState] = createSignal<AppState>({ demo: false, editMode: false, connected: false, hidden: false });

export function setDemo(on: boolean) {
  invoke("demo_set", { on });
  updateSettings((d) => (d.general.demo = on));
}

interface NavItem {
  id: Section;
  label: string;
  icon: () => JSX.Element;
  badge?: () => string;
}

/** Üst çubuk: canlı sohbeti başlat / durdur (Canlı Sohbet › Kanallar'daki seçenekle açılır; PRO) */
function ChatStartButton() {
  const chat = LC.useLiveChat();
  const running = () => !!chat.status()?.running;
  const [busy, setBusy] = createSignal(false);
  const toggle = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await (running() ? LC.stop() : LC.start());
    } catch {
      // Başlatılamadıysa (kanal yok, giriş gerekli…) nedenini Canlı Sohbet sayfası gösterir
      go("livechat");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button class="top-toggle top-chat" classList={{ on: running() }} disabled={busy()} title={running() ? "Canlı sohbet çalışıyor · durdurmak için tıkla" : "Canlı sohbeti başlat"} onClick={toggle}>
      <I.MessageCircle />
      <span>{running() ? t("Sohbet açık") : t("Sohbeti başlat")}</span>
    </button>
  );
}

/** Bağlantı noktasının açıklamasında gösterilen sim adları (status.sim / general.sim) */
const SIM_NAMES: Record<string, string> = { iracing: "iRacing", acc: "Assetto Corsa Competizione", ac: "Assetto Corsa", lmu: "Le Mans Ultimate", rf2: "rFactor 2", ams2: "Automobilista 2" };

const TOP: NavItem[] = [
  { id: "overlays", label: "Overlaylarım", icon: () => <I.Box /> },
  { id: "layouts", label: "Düzenler", icon: () => <I.LayoutDashboard /> },
  { id: "streaming", label: "Yayın", icon: () => <I.Radio /> },
  { id: "drivers", label: "Sürücüler", icon: () => <I.Users /> },
  { id: "telemetry", label: "Telemetri", icon: () => <I.Activity /> },
  { id: "community", label: "Topluluk", icon: () => <I.Share2 /> },
  { id: "shots", label: "Ekran Görüntüleri", icon: () => <I.Camera /> },
  { id: "tools", label: "Araçlar", icon: () => <I.Gauge /> },
  { id: "voice", label: "Sesli Mühendis", icon: () => <I.Mic />, badge: () => "PRO" },
  { id: "livechat", label: "Canlı Sohbet", icon: () => <I.MessageSquare /> },
];

const BOTTOM: NavItem[] = [
  { id: "admin", label: "Yönetim", icon: () => <I.ShieldCheck /> },
  { id: "support", label: "Destek", icon: () => <I.LifeBuoy /> },
  { id: "pro", label: "PRO", icon: () => <I.Heart /> },
  { id: "account", label: "Hesap", icon: () => <I.User /> },
  { id: "settings", label: "Ayarlar", icon: () => <I.Settings /> },
];

const TITLES: Record<Section, string> = {
  overlays: "Overlaylarım",
  layouts: "Düzenler",
  streaming: "Yayın",
  drivers: "Sürücüler",
  telemetry: "Telemetri",
  community: "Topluluk",
  shots: "Ekran Görüntüleri",
  tools: "Araçlar",
  voice: "Sesli Mühendis",
  livechat: "Canlı Sohbet",
  pro: "PRO Üyelik",
  account: "Hesap",
  admin: "Yönetim",
  settings: "Ayarlar",
  support: "Destek",
};

/** Sol menüde gösterilsin mi: yöneticinin gizlediği bölümler (yönetici hepsini görür), Destek sadece giriş yapınca */
const railVisible = (id: Section) => !isHiddenSection(id) && !isHiddenMenu(id) && (id !== "support" || (cloudEnabled && !!session()));

/** Alt menüsü olan bölümler */
const SUBS: Partial<Record<Section, { id: string; label: string }[]>> = {
  // Gizlenebilen alt sayfalar (Yönetim › Görünürlük › Menü görünürlüğü): tanımı menu.ts'te
  ...MENU_SUBS,
  livechat: LIVECHAT_PAGES,
  settings: SETTINGS_PAGES,
};

/** Bölümün bu kullanıcıya görünen alt sayfaları (yöneticinin gizledikleri hariç; yönetici hepsini görür) */
const subsOf = (sec: Section) => (sec === "admin" ? adminSubs() : sec === "livechat" ? liveChatPages() : visibleSubs(sec, SUBS[sec]));

function RailButton(p: { item: NavItem }) {
  return (
    <button class="rail-btn" classList={{ active: section() === p.item.id, pro: p.item.id === "pro", "hidden-sec": isAdmin() && (markedHiddenSection(p.item.id) || markedHiddenMenu(p.item.id)) }} title={p.item.label} onClick={() => go(p.item.id, subsOf(p.item.id)?.[0]?.id ?? "")}>
      {p.item.icon()}
      <Show when={p.item.badge}>
        <i class="rail-badge">{p.item.badge!()}</i>
      </Show>
      <Show when={p.item.id === "admin" && adminBadgeTotal() > 0}>
        <i class="rail-count" data-no-i18n>{badgeText(adminBadgeTotal())}</i>
      </Show>
    </button>
  );
}

function Toggle(p: { on: boolean; label: string; icon: JSX.Element; title?: string; onChange: (v: boolean) => void; tone?: string }) {
  return (
    <button class={`top-toggle ${p.tone ?? ""}`} classList={{ on: p.on }} title={p.title} onClick={() => p.onChange(!p.on)}>
      {p.icon}
      <span>{p.label}</span>
      <i class="top-switch" />
    </button>
  );
}

export function App() {
  const status = useTopic("status");
  // Panel her zaman durum bilgisini dinler
  useSubscriptions([]);
  // Yönetim: bekleyen iş sayaçları (yetkisi olmayanda boş kalır)
  useAdminBadges();
  // Overlay kullanım istatistiği: "en çok kullanılan" sıralaması
  useOverlayStats();
  // Monitör boyutları ayarlara yazılır: OBS sayfası bağlı yayın düzenlerini buna göre oranlar
  void loadMonitors();
  createEffect(syncScreens);

  onMount(async () => {
    // Bildirimler 10 dakikada bir yenilenir
    const nt = setInterval(() => !document.hidden && void loadNotices(), 10 * 60_000);
    onCleanup(() => clearInterval(nt));
    setAppState(await invoke<AppState>("state_get"));
    await listen<AppState>("app-state", (e) => setAppState(e.payload));
    // Düzenleme ekranında sağ tık > "Ayarlarını aç"
    await listen<{ id: string; profile?: string | null }>("focus-overlay", (e) => focusOverlay(e.payload.id, e.payload.profile));
    // Ayrı arkadaş penceresinden: "PRO'ya bak", "Görünümü düzenle"
    await listen<{ sec?: string; sub?: string; friend?: string; team?: string; crew?: string; tele?: string; teleCmp?: string }>("panel-go", (e) => {
      if (e.payload.teleCmp) void import("./pages/TelemetryPage").then((m) => m.compareWithDriver(e.payload.teleCmp!));
      // Telemetri sayfası henüz yüklenmemiş olabilir (tembel yükleme): profil isteğini burada da karşıla
      if (e.payload.tele) void import("./pages/TelemetryPage").then((m) => m.openDriverTelemetry(e.payload.tele!));
      if (e.payload.team) setTeamFocus(e.payload.team);
      if (e.payload.crew) setCrewFocus(e.payload.crew);
      if (e.payload.friend) editFriendLook(e.payload.friend);
      else if (e.payload.sec) go(e.payload.sec as Parameters<typeof go>[0], e.payload.sub ?? "");
    });
    const pending = await invoke<{ id: string; profile?: string | null } | null>("panel_take_focus");
    if (pending?.id) focusOverlay(pending.id, pending.profile);
    await loadVersion();
    bindUpdateEvents();
    if (version()?.updateConfigured) {
      checkUpdate();
      // Program açık kaldıkça 30 dakikada bir yeni sürüme bakar
      const ut = setInterval(() => !checking() && checkUpdate(), 30 * 60_000);
      onCleanup(() => clearInterval(ut));
    }
  });

  const conn = () => {
    const a = appState();
    // Demo gerçek bir bağlantı değildir: "Bağlı" gibi görünmesin (nötr, içi boş nokta)
    if (a.demo) return { cls: "demo", lines: [t("Demo modu açık"), t("Örnek veri gösteriliyor")] };
    // Demo'dan çıkınca motor bir sonraki turda "bağlı değil"e döner; o ana dek eski demo durumu "Bağlı" görünmesin
    const st = status();
    if (a.connected && st?.connected && !st.demo && !st.preview) {
      const lines = [st.sim && SIM_NAMES[st.sim] ? t("Bağlı · {0}", SIM_NAMES[st.sim]) : t("Bağlı")];
      if (st.track) lines.push(t("Pist: {0}", st.track));
      if (st.sessionType) lines.push(t("Oturum: {0}", st.sessionType));
      if (st.carName) lines.push(t("Araç: {0}", st.carName));
      return { cls: "on", lines };
    }
    const want = settings().general.sim ?? "auto";
    return { cls: "off", lines: [t("Bağlı değil"), want === "auto" ? t("Çalışan bir simülasyon aranıyor") : t("Aranan: {0}", SIM_NAMES[want] ?? want)] };
  };

  // Canlı sohbet varsayılan olarak uygulama açılınca başlar. Ayar yeni açıldıysa (autoStartV1 geçişi / ilk kurulum)
  // Rust açılışta başlatmamıştır: ayar bir kez kaydedilir ve sohbet buradan başlatılır (kanal yoksa / giriş gerekiyorsa
  // Rust reddeder, sessizce geçilir). Sonraki açılışlarda Rust kendisi başlatır; elle durdurmak ayarı değiştirmez.
  onMount(() => {
    if (!takeLiveChatAutoMigrated()) return;
    updateSettings(() => {});
    const lc = settings().general.livechat;
    if (lc.autoStart && lc.channels.some((c) => !c.hidden && c.url.trim())) void LC.start().catch(() => {});
  });

  const subs = () => subsOf(section());

  // Açık sayfa üyeden gizlendiyse (ya da gizli bir sayfaya doğrudan gidildiyse) görünen ilk sayfaya geçilir
  createEffect(() => {
    const sec = section();
    const cur = sub() || (sec in MENU_SUBS ? (SUBS[sec]?.[0]?.id ?? "") : "");
    if (!isHiddenMenu(sec, cur)) return;
    if (!isHiddenMenu(sec) && !isHiddenSection(sec)) return go(sec, subsOf(sec)?.[0]?.id ?? "");
    const first = [...TOP, ...BOTTOM].find((it) => it.id !== "admin" && railVisible(it.id))?.id ?? "account";
    go(first, subsOf(first)?.[0]?.id ?? "");
  });

  return (
    <div class="shell2" classList={{ "has-appbg": appBgActive() }}>
      <AppBgLayer />
      <nav class="rail">
        <div class="rail-logo link" role="link" tabindex="0" title="SRTR Pitwall · pitwall.simracetr.com" onClick={() => openUrl("https://pitwall.simracetr.com")} onKeyDown={(e) => e.key === "Enter" && openUrl("https://pitwall.simracetr.com")} />
        <For each={TOP.filter((it) => railVisible(it.id))}>{(it) => <RailButton item={it} />}</For>
        <div class="rail-sp" />
        <For each={BOTTOM.filter((it) => (it.id !== "admin" || canSeeAdmin()) && railVisible(it.id))}>{(it) => <RailButton item={it} />}</For>
      </nav>

      <Show when={freeView() && realAdmin()}>
        <div class="freeview-banner">
          <span>PRO olmayan üye görünümü açık</span>
          <button class="btn small" onClick={() => setFreeView(false)}>
            Kapat
          </button>
        </div>
      </Show>
      <Show when={update()?.available}>
        <div class="update-banner">
          <I.Download />
          <span>{t("Yeni sürüm hazır: {0}", update()!.version ?? "")}</span>
          <button class="btn primary small" onClick={() => setUpdateDialog(true)}>
            Şimdi yükle
          </button>
        </div>
      </Show>
      <header class="top2">
        <TopLinks />
        <AdminTopStats />
        <h1>{TITLES[section()]}</h1>
        <div class="top2-right">
          <Show when={proExpiringSoon()}>
            <button class="btn warn-badge" title="PRO üyeliğini yenile" onClick={() => go("pro")}>
              <I.Heart /> {t("PRO: {0} gün kaldı", proDaysLeft() ?? 0)}
            </button>
          </Show>
          <Show when={isPro() && settings().general.livechat.topButton}>
            <ChatStartButton />
          </Show>
          <NoticeBell />
          <span class={`conn-dot ${conn().cls}`} role="img" tabindex="0" aria-label={conn().lines.join(" · ")}>
            <i />
            <span class="conn-pop" aria-hidden="true">
              <b>{conn().lines[0]}</b>
              <For each={conn().lines.slice(1)}>{(l) => <span>{l}</span>}</For>
            </span>
          </span>
          <Toggle on={appState().demo} label="Demo" icon={<I.FlaskConical />} title="iRacing olmadan örnek veriyle göster" onChange={setDemo} />
          {/* Demoda ses: yalnızca Demo açıkken görünür; varsayılan kapalı (sesli mühendis demoda sessiz, altyazı benzetimi sürer) */}
          <Show when={appState().demo}>
            <button
              class="top-toggle top-demo-sound"
              classList={{ on: !!settings().general.voice.demoSound }}
              title={settings().general.voice.demoSound ? t("Demoda ses açık (sesli mühendis konuşur) · kapatmak için tıkla") : t("Demoda ses kapalı · açmak için tıkla")}
              onClick={() => updateSettings((d) => (d.general.voice.demoSound = !d.general.voice.demoSound))}
            >
              <Show when={settings().general.voice.demoSound} fallback={<I.VolumeX />}>
                <I.Volume2 />
              </Show>
            </button>
          </Show>
          <Toggle on={!appState().hidden} label="Görünür" icon={<I.Eye />} title="Overlay'leri göster/gizle" onChange={(v) => invoke("hidden_set", { on: !v })} />
          <Toggle
            on={!appState().editMode}
            label={appState().editMode ? "Kilit açık" : "Kilitli"}
            icon={appState().editMode ? <I.LockOpen /> : <I.Lock />}
            title="Kilidi açınca overlay'ler ekranda sürüklenebilir"
            tone={appState().editMode ? "warn" : ""}
            onChange={(v) => invoke("edit_mode_set", { on: !v })}
          />
          <LangPicker />
          {/* Çerçevesiz pencere: üst çubuktan tutulup taşınır; küçült / büyüt / kapat burada */}
          <WinChrome inline max drag=".top2" />
        </div>
      </header>

      <div class="body2" classList={{ "with-sub": !!subs() }}>
        <Show when={subs()}>
          <aside class="subnav">
            <div class="subnav-title">{TITLES[section()]}</div>
            <For each={subs()}>
              {(s) => (
                <button classList={{ active: sub() === s.id }} onClick={() => go(section(), s.id)}>
                  {s.label}
                  <Show when={markedHiddenMenu(section(), s.id)}>
                    <span class="hidden-badge" title="Yönetici olmayanlar bu sayfayı görmez">gizli</span>
                  </Show>
                  <Show when={(s as { feature?: string }).feature}>
                    <ProTag feature={(s as { feature?: string }).feature} />
                  </Show>
                  <Show when={section() === "admin" && adminBadge(s.id) > 0}>
                    <i class="sub-count" data-no-i18n>{badgeText(adminBadge(s.id))}</i>
                  </Show>
                </button>
              )}
            </For>
            <div class="subnav-foot">
              <Show when={cloudEnabled}>
                <small class="muted">
                  {session() ? (isPro() ? (proDaysLeft() !== null ? t("PRO üye · {0} gün kaldı", proDaysLeft()!) : "PRO üye") : "Giriş yapıldı") : "Misafir"}
                </small>
              </Show>
              <small class="muted">Sürüm {version()?.display ?? "…"}</small>
            </div>
          </aside>
        </Show>
        <main class="content2">
          <Switch>
            <Match when={isHiddenSection(section()) || isHiddenMenu(section(), sub())}>
              <div class="page">
                <p class="muted">Bu bölüm şu an kullanılamıyor.</p>
              </div>
            </Match>
            <Match when={section() === "support"}>
              <SupportPage />
            </Match>
            <Match when={section() === "overlays"}>
              <OverlaysPage />
            </Match>
            <Match when={section() === "layouts"}>
              <LayoutsPage />
            </Match>
            <Match when={section() === "streaming"}>
              <StreamingPage />
            </Match>
            <Match when={section() === "drivers" && sub() === "teams"}>
              <TeamsPage />
            </Match>
            <Match when={section() === "drivers" && sub() === "crew"}>
              <CrewPage />
            </Match>
            <Match when={section() === "drivers" && sub() === "league"}>
              <LeaguePage />
            </Match>
            <Match when={section() === "drivers"}>
              <FriendsPage />
            </Match>
            <Match when={section() === "community" && sub() === "shots"}>
              <CommunityShots />
            </Match>
            <Match when={section() === "shots"}>
              <ScreenshotsPage />
            </Match>
            <Match when={section() === "community" && sub() === "themes"}>
              <CommunityThemes />
            </Match>
            <Match when={section() === "community" && sub() === "dashes"}>
              <CommunityDashes />
            </Match>
            <Match when={section() === "community" && sub() === "layouts"}>
              <CommunityPage kind="layout" />
            </Match>
            <Match when={section() === "community" && sub() === "stream"}>
              <CommunityPage kind="stream" />
            </Match>
            <Match when={section() === "community"}>
              <CommunityHome />
            </Match>
            <Match when={section() === "tools"}>
              <ToolsPage />
            </Match>
            <Match when={section() === "telemetry"}>
              <TelemetryPage sub={sub()} />
            </Match>
            <Match when={section() === "voice"}>
              <VoicePage />
            </Match>
            <Match when={section() === "livechat"}>
              <LiveChatPage sub={sub() || "chat"} />
            </Match>
            <Match when={section() === "pro"}>
              <ProPage />
            </Match>
            <Match when={section() === "account"}>
              <AccountPage />
            </Match>
            <Match when={section() === "admin" && canSeeAdmin()}>
              <AdminPage />
            </Match>
            <Match when={section() === "settings"}>
              <SettingsPage page={sub() || "general"} />
            </Match>
          </Switch>
        </main>
        <FriendsDock racing={() => appState().connected} />
        <UpdateDialog />
        {/* Eşitleme çakışması her sayfada sorulur: karar verilene kadar ayarlar hesaba gönderilmez (eskiden yalnızca Hesap sayfasında görünüyordu) */}
        <Show when={conflict() && section() !== "account"}>
          <div class="modal-back">
            <div class="modal">
              <h3>Hangi ayarlar kullanılsın?</h3>
              <p class="muted">
                Bu bilgisayardaki ayarlar ile hesabındaki ayarlar farklı (hesaptaki: {new Date(conflict()!.remoteAt).toLocaleString(localeTag())}). Seçim yapana kadar
                değişikliklerin hesabına kaydedilmez.
              </p>
              <div class="btns">
                <button class="btn primary" onClick={() => resolveConflict("local")}>
                  Bu bilgisayardakini kullan
                </button>
                <button class="btn ghost" onClick={() => resolveConflict("remote")}>
                  Buluttakini kullan
                </button>
              </div>
            </div>
          </div>
        </Show>
        <TrialWelcome />
      </div>
    </div>
  );
}

// Eski bileşenler için
export { settings };
