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
import "../livechat.css";

export const LIVECHAT_PAGES = [
  { id: "chat", label: "Sohbet" },
  { id: "channels", label: "Kanallar" },
  { id: "moderation", label: "Moderasyon" },
  { id: "poll", label: "Anket" },
  { id: "tts", label: "Sesli okuma" },
  { id: "stt", label: "Konuşma → yazı" },
  { id: "send", label: "Sohbete yaz" },
  { id: "alerts", label: "Bildirimler" },
  { id: "log", label: "Sohbet kaydı" },
  { id: "obs", label: "OBS" },
];

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
      <button class={running() ? "btn ghost" : "btn primary"} onClick={toggle}>
        {running() ? <I.Square /> : <I.Play />}
        {running() ? t("Durdur") : t("Başlat")}
      </button>
    </div>
  );
}

export function LiveChatPage(p: { sub: string }) {
  onMount(() => {
    let un: (() => void) | undefined;
    void LC.onNotice((text) => toast(t(text))).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  return (
    <div class="page lcp" classList={{ narrow: p.sub !== "chat" && p.sub !== "log" }}>
      <Head />
      <Switch fallback={<ChatTab />}>
        <Match when={p.sub === "channels"}>
          <ChannelsTab />
        </Match>
        <Match when={p.sub === "moderation"}>
          <ModerationTab />
        </Match>
        <Match when={p.sub === "poll"}>
          <PollTab />
        </Match>
        <Match when={p.sub === "tts"}>
          <TtsTab />
        </Match>
        <Match when={p.sub === "stt"}>
          <SttTab />
        </Match>
        <Match when={p.sub === "send"}>
          <SendTab />
        </Match>
        <Match when={p.sub === "alerts"}>
          <AlertsTab />
        </Match>
        <Match when={p.sub === "log"}>
          <LogTab />
        </Match>
        <Match when={p.sub === "obs"}>
          <ObsTab />
        </Match>
      </Switch>
      <Toast />
    </div>
  );
}
