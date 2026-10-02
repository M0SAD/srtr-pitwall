// Kontrol paneli kabuğu: solda ikon menü, üstte durum çubuğu, ortada bölüm.

import { t } from "@/sdk/i18n";
import { For, Match, Show, Switch, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppState } from "@/sdk/types";
import { settings, updateSettings } from "@/sdk/settings";
import { cloudEnabled, session } from "@/cloud/supabase";
import { freeView, realAdmin, setFreeView, isAdmin, isHiddenSection, isPro, markedHiddenSection, proDaysLeft, proExpiringSoon } from "@/cloud/account";
import { useSubscriptions, useTopic } from "@/sdk/telemetry";
import { bindUpdateEvents, checking, checkUpdate, justChecked, updateError, focusOverlay, editFriendLook, go, loadVersion, section, setUpdateDialog, sub, update, version, type Section } from "./ui";
import { UpdateDialog } from "./components/UpdateDialog";
import { TrialWelcome } from "./components/TrialWelcome";
import * as I from "./icons";
import { OverlaysPage } from "./pages/OverlaysPage";
import { LayoutsPage } from "./pages/LayoutsPage";
import { StreamingPage } from "./pages/StreamingPage";
import { AccountPage, ProPage } from "./pages/AccountPage";
import { ToolsPage } from "./pages/ToolsPage";
import { LeaguePage } from "./pages/LeaguePage";
import { FriendsPage } from "./pages/FriendsPage";
import { TeamsPage } from "./pages/TeamsPage";
import { setTeamFocus } from "@/cloud/teams";
import { CommunityPage } from "./pages/CommunityPage";
import { CommunityShots } from "./pages/CommunityShots";
import { CommunityHome } from "./pages/CommunityHome";
import { CommunityThemes } from "./pages/CommunityThemes";
import { ScreenshotsPage } from "./pages/ScreenshotsPage";
import { NoticeBell } from "./components/Moderation";
import { FriendsDock } from "./components/FriendsDock";
import { SimPicker } from "./components/SimPicker";
import { LangPicker } from "./components/LangPicker";
import { loadNotices } from "@/cloud/moderation";
import { VoicePage } from "./pages/VoicePage";
import { LiveChatPage, LIVECHAT_PAGES } from "./pages/LiveChatPage";
import { SettingsPage, SETTINGS_PAGES } from "./pages/SettingsPage";
import { SupportPage } from "./pages/SupportPage";
import { TelemetryPage } from "./pages/TelemetryPage";
import { AdminPage, adminSubs, canSeeAdmin } from "./pages/AdminPage";
import { adminBadge, adminBadgeTotal, badgeText, useAdminBadges } from "@/cloud/adminBadges";
import { AppBgLayer, appBgActive } from "./appBg";
<<<<<<< HEAD
import { AdminTopStats } from "./components/AdminTopStats";
=======
>>>>>>> 325d8c04093ce39f66572348391ed80bd7d7d044

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

const TOP: NavItem[] = [
  { id: "overlays", label: "Overlay'ler", icon: () => <I.Box /> },
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
  overlays: "Overlay'ler",
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
const railVisible = (id: Section) => !isHiddenSection(id) && (id !== "support" || (cloudEnabled && !!session()));

/** Alt menüsü olan bölümler */
const SUBS: Partial<Record<Section, { id: string; label: string }[]>> = {
  telemetry: [
    { id: "overview", label: "Telemetrim" },
    { id: "racers", label: "Yarışçılar" },
  ],
  drivers: [
    { id: "friends", label: "Arkadaşlar ve etiketler" },
    { id: "teams", label: "Takımlar" },
    { id: "league", label: "Lig Kategorileri" },
  ],
  community: [
    { id: "home", label: "Ana sayfa" },
    { id: "layouts", label: "Düzenler" },
    { id: "stream", label: "Yayın düzenleri" },
    { id: "shots", label: "Ekran Görüntüleri" },
    { id: "themes", label: "Temalar" },
  ],
  livechat: LIVECHAT_PAGES,
  settings: SETTINGS_PAGES,
};

function RailButton(p: { item: NavItem }) {
  return (
    <button class="rail-btn" classList={{ active: section() === p.item.id, pro: p.item.id === "pro", "hidden-sec": isAdmin() && markedHiddenSection(p.item.id) }} title={p.item.label} onClick={() => go(p.item.id, (p.item.id === "admin" ? adminSubs() : SUBS[p.item.id])?.[0]?.id ?? "")}>
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

  onMount(async () => {
    // Bildirimler 10 dakikada bir yenilenir
    const nt = setInterval(loadNotices, 3 * 60_000);
    onCleanup(() => clearInterval(nt));
    setAppState(await invoke<AppState>("state_get"));
    await listen<AppState>("app-state", (e) => setAppState(e.payload));
    // Düzenleme ekranında sağ tık > "Ayarlarını aç"
    await listen<string>("focus-overlay", (e) => focusOverlay(e.payload));
    // Ayrı arkadaş penceresinden: "PRO'ya bak", "Görünümü düzenle"
    await listen<{ sec?: string; sub?: string; friend?: string; team?: string }>("panel-go", (e) => {
      if (e.payload.team) setTeamFocus(e.payload.team);
      if (e.payload.friend) editFriendLook(e.payload.friend);
      else if (e.payload.sec) go(e.payload.sec as Parameters<typeof go>[0], e.payload.sub ?? "");
    });
    const pending = await invoke<string | null>("panel_take_focus");
    if (pending) focusOverlay(pending);
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
    if (a.demo) return { cls: "demo", text: "Demo" };
    if (a.connected) return { cls: "on", text: status()?.track ? `Bağlı · ${status()!.track}` : "Bağlı" };
    return { cls: "off", text: "Bağlı değil" };
  };

  const subs = () => (section() === "admin" ? adminSubs() : SUBS[section()]);

  return (
    <div class="shell2" classList={{ "has-appbg": appBgActive() }}>
      <AppBgLayer />
      <nav class="rail">
        <div class="rail-logo" title="SRTR Pitwall" />
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
        <AdminTopStats />
        <h1>{TITLES[section()]}</h1>
        <div class="top2-right">
          <Show when={proExpiringSoon()}>
            <button class="btn warn-badge" title="PRO üyeliğini yenile" onClick={() => go("pro")}>
              <I.Heart /> {t("PRO: {0} gün kaldı", proDaysLeft() ?? 0)}
            </button>
          </Show>
          <Show when={version()?.updateConfigured && !update()?.available}>
            <button
              class="icon-btn update-check"
              classList={{ ok: justChecked(), err: !!updateError() }}
              disabled={checking()}
              title={checking() ? t("Denetleniyor…") : updateError() ? t("Denetlenemedi, tekrar dene") : justChecked() ? t("En güncel sürümdesin") : t("Güncellemeleri denetle")}
              onClick={() => checkUpdate(true)}
            >
              <span classList={{ spin: checking() }} style={{ display: "inline-flex" }}>
                <I.RefreshCw />
              </span>
            </button>
          </Show>
          <SimPicker />
          <NoticeBell />
          <span class={`conn-pill ${conn().cls}`}>
            <i />
            {conn().text}
          </span>
          <Toggle on={appState().demo} label="Demo" icon={<I.FlaskConical />} title="iRacing olmadan örnek veriyle göster" onChange={setDemo} />
          <Show when={appState().demo && (settings().general.voice.enabled || settings().general.sounds.fasterClass.enabled || settings().general.sounds.alongside.enabled)}>
            <button
              class="top-toggle"
              classList={{ on: !settings().general.demoMute }}
              title={settings().general.demoMute ? "Demo sesleri kapalı (spotter ve bipler)" : "Demo sesleri açık (spotter ve bipler)"}
              onClick={() => updateSettings((d) => (d.general.demoMute = !d.general.demoMute))}
            >
              {settings().general.demoMute ? <I.VolumeX /> : <I.Volume2 />}
              <span>Ses</span>
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
            <Match when={isHiddenSection(section())}>
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
        <TrialWelcome />
      </div>
    </div>
  );
}

// Eski bileşenler için
export { settings };
