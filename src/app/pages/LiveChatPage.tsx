// Canlı Sohbet: YouTube / Twitch / Kick sohbetlerini tek akışta okuma, moderasyon, anket, sesli okuma,
// konuşmayı yazıya çevirme, sohbete yazma, Streamlabs uyarıları, kayıt ve OBS adresleri.
// Bağlantılar Rust'ta (src-tauri/src/livechat); bu sayfa ayarları (general.livechat) ve komutları kullanır.
// Alt sayfalar sol alt menüde (App.tsx SUBS → LIVECHAT_PAGES); her birinin üstünde ortak durum kartı.

import { For, Match, Show, Switch, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { PlatformIcon } from "@/overlays/livechat/parts";
import * as I from "../icons";
import { Toast, errText, lc, toast } from "./livechat/common";
import { ChatTab } from "./livechat/ChatTab";
import { ChannelsTab } from "./livechat/ChannelsTab";
import { AlertsTab, ModerationTab, ObsTab } from "./livechat/SettingsTabs";
import { LogTab } from "./livechat/LogTab";
import { PollTab } from "./livechat/PollTab";
import { SttTab, TtsTab } from "./livechat/VoiceTabs";
import { SendTab } from "./livechat/SendTab";
import { F } from "@/sdk/proFeatures";
import { isHiddenLiveTab, liveChatLoginOk } from "@/cloud/account";
import { go } from "../ui";
import { settings } from "@/sdk/settings";
import "../livechat.css";

export const LIVECHAT_PAGES: { id: string; label: string; feature?: string }[] = [
  { id: "chat", label: "Sohbet" },
  { id: "channels", label: "Kanallar" },
  { id: "moderation", label: "Moderasyon" },
  { id: "poll", label: "Anket", feature: F.livePoll },
  { id: "tts", label: "Sesli okuma", feature: F.liveTts },
  { id: "stt", label: "Konuşma → yazı", feature: F.liveStt },
  { id: "send", label: "Sohbete yaz", feature: F.liveSend },
  { id: "alerts", label: "Bildirimler", feature: F.liveAlerts },
  { id: "log", label: "Sohbet kaydı", feature: F.liveLog },
  { id: "obs", label: "OBS", feature: F.liveObs },
];

/** Kullanıcıya görünen sekmeler (yöneticinin gizledikleri hariç; yönetici hepsini görür) */
export const liveChatPages = () => LIVECHAT_PAGES.filter((p) => !isHiddenLiveTab(p.id));

/** Giriş yapılmamış: sekmeler görünür ama hiçbir şey çalışmaz (ücretsiz bölümler dahil) */
function LoginGate() {
  return (
    <section class="panel">
      <h3>Canlı Sohbet için giriş yapmalısın</h3>
      <p class="muted">
        Canlı Sohbet'i (ücretsiz bölümleri dahil) kullanmak için hesabına giriş yap. Giriş yapmadan sohbet başlatılamaz ve sohbet
        overlay'leri ekranda görünmez; aşağıdaki ayarlar yalnızca görüntülenir.
      </p>
      <button class="btn primary" onClick={() => go("account")}>
        Giriş yap
      </button>
    </section>
  );
}

/** Üst durum kartı: çalışıyor mu, kanal sayısı, izleyiciler, başlat / durdur */
function Head() {
  const store = LC.useLiveChat(300);
  const st = () => store.status();
  const running = () => !!st()?.running;
  const live = () => (st()?.channels ?? []).filter((c) => c.state === "live").length;
  const total = () => lc().channels.length;
  const toggle = async () => {
    try {
      if (running()) await LC.stop();
      else {
        if (!liveChatLoginOk()) return toast(t("Canlı Sohbet için giriş yapmalısın"), true);
        if (!total()) return toast(t("Önce Kanallar'dan en az bir kanal ekle"), true);
        await LC.start();
      }
    } catch (e) {
      toast(errText(e), true);
    }
  };
  return (
    <div class="lcp-head">
      <span class="lcp-state" classList={{ on: running() }}>
        <i />
        {running() ? t("Çalışıyor") : t("Durduruldu")}
      </span>
      <span class="muted small">{t("{0} kanal · {1} canlı", total(), live())}</span>
      <div class="lcp-viewers">
        <For each={["youtube", "twitch", "kick"] as const}>
          {(p) => (
            <Show when={st()?.viewers[p] != null}>
              <span title={LC.PLATFORM_NAMES[p]}>
                <PlatformIcon platform={p} size={15} />
                <b>{LC.fmtCount(st()!.viewers[p])}</b>
              </span>
            </Show>
          )}
        </For>
        <Show when={st()?.viewers.total != null}>
          <span title={t("Toplam izleyici")}>
            Σ <b>{LC.fmtCount(st()!.viewers.total)}</b>
          </span>
        </Show>
      </div>
      <span class="lcp-sp" />
      <Show when={running()}>
        <button class="btn ghost small" title={t("Tüm bağlantıları yeniden kur")} onClick={() => LC.restart().catch((e) => toast(errText(e), true))}>
          <I.RotateCcw /> Yeniden bağlan
        </button>
      </Show>
      <button class={running() ? "btn ghost" : "btn primary"} disabled={!running() && !liveChatLoginOk()} onClick={toggle}>
        {running() ? <I.Square /> : <I.Play />}
        {running() ? t("Durdur") : t("Başlat")}
      </button>
    </div>
  );
}

/** Kapı kararının açıklaması (overlay neden görünüyor / gizli) */
function gateText(m: LC.GateMode): string {
  switch (m) {
    case "real":
      return t("gösteriliyor (gerçek sohbet)");
    case "demo":
      return t("gösteriliyor (Demo modu: örnek sohbet)");
    case "stopped":
      return t("gizli çünkü: sohbet durdurulmuş");
    case "offline":
      return t("gizli çünkü: yayın canlı değil");
    case "login":
      return t("gizli çünkü: giriş yapılmamış");
    case "pro":
      return t("gizli çünkü: PRO gerekli");
    default:
      return t("bilinmiyor");
  }
}

/**
 * Tanı satırı: overlay'in şu an ne gösterdiği / neden gizli olduğu. Overlay'in kullandığı kapı kararının (Rust:
 * live_gate) aynısından hesaplanır; "Yalnızca yayın canlıyken göster" seçeneği etkin düzendeki sohbet overlay'inden okunur.
 */
function GateLine() {
  const store = LC.useLiveChat(300);
  const gate = () => store.status()?.gate;
  const inst = () => {
    const s = settings();
    const all = Object.values(s.profiles[s.activeProfile]?.overlays ?? {}).filter((i) => i.type === "livechat");
    return all.find((i) => i.enabled) ?? null;
  };
  const onlyLive = () => inst()?.options?.onlyLive !== false;
  const app = () => LC.gateMode(gate(), onlyLive(), false);
  const obs = () => LC.gateMode(gate(), onlyLive(), true);
  return (
    <Show when={gate()}>
      <div class="lcp-gate muted small" classList={{ ok: app() === "real" || app() === "demo" }}>
        <span>
          {t("Overlay durumu")}: <b>{gateText(app())}</b>
        </span>
        <Show when={obs() !== app()}>
          <span>
            {t("OBS kaynağı")}: <b>{gateText(obs())}</b>
          </span>
        </Show>
        <Show when={!inst()}>
          <span>{t("Etkin düzende Canlı Sohbet overlay'i açık değil")}</span>
        </Show>
        <Show when={app() === "offline"}>
          <span>{t("Mesaj gelince ya da yayın açılınca kendiliğinden görünür")}</span>
        </Show>
      </div>
    </Show>
  );
}

export function LiveChatPage(p: { sub: string }) {
  onMount(() => {
    let un: (() => void) | undefined;
    void LC.onNotice((text) => toast(t(text))).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  // Yöneticinin gizlediği sekme (ör. doğrudan bağlantıyla) açılmaz: ilk görünür sekme gösterilir
  const sub = () => (isHiddenLiveTab(p.sub || "chat") ? (liveChatPages()[0]?.id ?? "none") : p.sub || "chat");
  return (
    <div class="page lcp" classList={{ narrow: sub() !== "chat" && sub() !== "log" }}>
      <Head />
      <GateLine />
      <Show when={!liveChatLoginOk()}>
        <LoginGate />
      </Show>
      <div classList={{ "prolock-dim": !liveChatLoginOk() }} inert={!liveChatLoginOk()} aria-disabled={!liveChatLoginOk()} style={{ display: "flex", "flex-direction": "column", flex: "1 1 auto", "min-height": "0" }}>
        <Switch fallback={<ChatTab />}>
          <Match when={sub() === "none"}>
            <section class="panel">
              <p class="muted">Bu bölüm şu an kapalı.</p>
            </section>
          </Match>
          <Match when={sub() === "channels"}>
            <ChannelsTab />
          </Match>
          <Match when={sub() === "moderation"}>
            <ModerationTab />
          </Match>
          <Match when={sub() === "poll"}>
            <PollTab />
          </Match>
          <Match when={sub() === "tts"}>
            <TtsTab />
          </Match>
          <Match when={sub() === "stt"}>
            <SttTab />
          </Match>
          <Match when={sub() === "send"}>
            <SendTab />
          </Match>
          <Match when={sub() === "alerts"}>
            <AlertsTab />
          </Match>
          <Match when={sub() === "log"}>
            <LogTab />
          </Match>
          <Match when={sub() === "obs"}>
            <ObsTab />
          </Match>
        </Switch>
      </div>
      <Toast />
    </div>
  );
}
