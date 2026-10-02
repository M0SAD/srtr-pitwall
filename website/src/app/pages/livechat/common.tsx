// Canlı Sohbet sayfasının ortak parçaları: ayar kısayolları, durum metinleri, mesaj parçaları, kısa bildirim.

import { For, Show, createSignal } from "solid-js";
import { t } from "@/sdk/i18n";
import { settings, updateSettings, type LiveChatSettings } from "@/sdk/settings";
import type { ChannelState, ChatMsg } from "@/sdk/livechat";

export const lc = () => settings().general.livechat;
export const setLc = (fn: (x: LiveChatSettings) => void) => updateSettings((d) => fn(d.general.livechat));

export const STATE_TEXT: Record<ChannelState, string> = {
  idle: "Durduruldu",
  connecting: "Bağlanıyor…",
  live: "Canlı",
  offline: "Bağlı · yayın yok",
  error: "Hata, tekrar denenecek",
  locked: "PRO: bağlanmıyor",
};

// Kısa bildirim (sayfa altı)
const [toastMsg, setToastMsg] = createSignal<{ text: string; err: boolean } | null>(null);
let hide: number | undefined;
export function toast(text: string, err = false) {
  setToastMsg({ text, err });
  clearTimeout(hide);
  hide = window.setTimeout(() => setToastMsg(null), err ? 6000 : 3000);
}
export const errText = (e: unknown) => String((e as Error)?.message ?? e);

export function Toast() {
  return (
    <Show when={toastMsg()}>
      <div class="toast" classList={{ err: toastMsg()!.err }} onClick={() => setToastMsg(null)} data-no-i18n>
        {toastMsg()!.text}
      </div>
    </Show>
  );
}

/** Mesaj metni (emote resimleri, bağlantılar, bahsetmeler) */
export function MsgParts(p: { m: ChatMsg }) {
  return (
    <For each={p.m.parts}>
      {(x) =>
        x.t === "emote" ? (
          <img class="lcp-emote" src={x.url} alt={x.name} title={x.name} draggable={false} loading="lazy" />
        ) : x.t === "link" ? (
          <span class="lcp-link">{x.v}</span>
        ) : x.t === "mention" ? (
          <span class="lcp-mention">@{x.v}</span>
        ) : (
          <>{x.v}</>
        )
      }
    </For>
  );
}

/** Uyarı satırının açıklaması (overlay ile aynı ifadeler) */
export function alertText(m: ChatMsg): { emoji: string; text: string } {
  const a = m.alert;
  const ty = a?.type ?? "";
  switch (m.kind) {
    case "superchat":
      return { emoji: "💰", text: ty === "supersticker" ? t("Super Sticker gönderdi") : t("Super Chat gönderdi") };
    case "donation":
      return ty === "cheer" ? { emoji: "💎", text: t("Bits gönderdi") } : { emoji: "💰", text: t("bağış yaptı") };
    case "raid":
      if (ty === "host") return { emoji: "📡", text: a?.count ? t("{0} kişiyle host etti", a.count) : t("host etti") };
      return { emoji: "⚔️", text: a?.count ? t("{0} kişiyle raid yaptı", a.count) : t("raid yaptı") };
    case "sub":
      if (ty.includes("gift")) return { emoji: "🎁", text: a?.count ? t("{0} abonelik hediye etti", a.count) : t("abonelik hediye etti") };
      if (ty === "member" || ty === "milestone") return { emoji: "💛", text: t("üye oldu") };
      if ((a?.months ?? 0) > 1) return { emoji: "🎉", text: t("{0} aydır abone", a!.months) };
      return { emoji: "🎉", text: t("abone oldu") };
    case "alert":
      if (ty === "follower") return { emoji: "❤️", text: t("takip etti") };
      if (ty === "redemption") return { emoji: "🎁", text: t("ödül aldı") };
      if (ty === "announcement") return { emoji: "📣", text: t("duyuru") };
      return { emoji: "🔔", text: m.headline ?? ty };
    default:
      return { emoji: "", text: "" };
  }
}

export const ALERT_COLORS: Record<string, string> = {
  sub: "#ffd700",
  raid: "#e74c3c",
  donation: "#00ff99",
  superchat: "#ffc800",
  alert: "#3498db",
};

/** Yuvarlak durum etiketi */
export function StatusPill(p: { cls: "on" | "busy" | "err" | "warn" | "off"; text: string }) {
  return (
    <span class={`lcp-status ${p.cls}`}>
      <i />
      {p.text}
    </span>
  );
}
