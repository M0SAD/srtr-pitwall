import { For, Show, createMemo, createSignal, onCleanup, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import { fmtCount, shortName, type ChatMsg, type Platform } from "@/sdk/livechat";
import { CaptionBox, PlatformIcon, PollBox, fontStack } from "./parts";
import "./style.css";

const now0 = Date.now();
const SAMPLE: ChatMsg[] = [
  sample("1", "twitch", "SRTRFan", "Güzel start! 🏁", { sub: true, color: "#ff8a2a" }),
  sample("2", "youtube", "Mehmet Y.", "T1'de dikkatli ol", { mod: true }),
  sample("3", "kick", "gt3sever", "Bu tur 1:47 gelir", { vip: true }),
  { ...sample("4", "youtube", "Destekçi", "Kolay gelsin!", {}), kind: "superchat", amount: "₺50,00" },
  { ...sample("5", "twitch", "Akıncı", "", {}), kind: "raid", alert: { type: "raid", gifted: false, count: 42 } },
];

function sample(id: string, platform: Platform, name: string, text: string, f: { sub?: boolean; mod?: boolean; vip?: boolean; color?: string }): ChatMsg {
  return {
    id: `s:${id}`,
    nativeId: id,
    platform,
    channel: platform,
    channelName: "",
    showTag: false,
    kind: "chat",
    author: { name, login: name.toLowerCase(), color: f.color, mod: !!f.mod, sub: !!f.sub, owner: false, member: false, vip: !!f.vip },
    parts: text ? [{ t: "text", v: text }] : [],
    text,
    ts: now0,
    deleted: false,
  };
}

const ALERT_COLORS: Record<string, string> = {
  sub: "#ffd700",
  raid: "#e74c3c",
  donation: "#00ff99",
  superchat: "#ffc800",
  alert: "#3498db",
};

/** Uyarının Türkçe açıklaması (alanlardan kurulur; yoksa platformun kendi metni) */
function alertLine(m: ChatMsg): { emoji: string; text: string } {
  const a = m.alert;
  const ty = a?.type ?? "";
  const tier = a?.tier ? ` · ${a.tier === "Prime" ? "Prime" : t("Seviye {0}", a.tier)}` : "";
  switch (m.kind) {
    case "superchat":
      return { emoji: "💰", text: ty === "supersticker" ? t("Super Sticker gönderdi") : t("Super Chat gönderdi") };
    case "donation":
      return ty === "cheer" ? { emoji: "💎", text: t("Bits gönderdi") } : { emoji: "💰", text: t("bağış yaptı") };
    case "raid":
      if (ty === "host") return { emoji: "📡", text: a?.count ? t("{0} kişiyle host etti", a.count) : t("host etti") };
      return { emoji: "⚔️", text: a?.count ? t("{0} kişiyle raid yaptı", a.count) : t("raid yaptı") };
    case "sub": {
      if (ty === "subgift" || ty === "anonsubgift") return { emoji: "🎁", text: (a?.recipient ? t("{0} için abonelik hediye etti", a.recipient) : t("abonelik hediye etti")) + tier };
      if (ty === "submysterygift" || ty === "anonsubmysterygift" || ty === "gift")
        return { emoji: "🎁", text: a?.count ? t("{0} abonelik hediye etti", a.count) : t("abonelik hediye etti") };
      if (ty === "member") return { emoji: "💛", text: t("üye oldu") };
      if (ty === "milestone") return { emoji: "💛", text: a?.months ? t("{0} aydır üye", a.months) : (m.headline ?? t("üyeliğini kutluyor")) };
      if ((a?.months ?? 0) > 1) return { emoji: "🎉", text: t("{0} aydır abone", a!.months) + tier };
      return { emoji: "🎉", text: t("abone oldu") + tier };
    }
    case "alert":
      if (ty === "follower") return { emoji: "❤️", text: t("takip etti") };
      if (ty === "redemption") return { emoji: "🎁", text: t("ödül aldı") };
      if (ty === "announcement") return { emoji: "📣", text: t("duyuru") };
      return { emoji: "🔔", text: m.headline ?? ty };
    default:
      return { emoji: "", text: "" };
  }
}

export default function LiveChat(props: OverlayProps) {
  const o = () => props.options;
  const topic = useTopic("livechat");
  const poll = useTopic("livepoll");
  const caps = useTopic("captions");
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));

  const bots = createMemo(() =>
    String(o().hideBots ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
  const tagColor = (p: Platform) => (p === "youtube" ? o().youtubeColor : p === "twitch" ? o().twitchColor : p === "kick" ? o().kickColor : p === "streamlabs" ? "#31c3a2" : "#ff8a2a");

  // Silinen mesaj "mesaj silindi" olarak 6 sn kalır, sonra kaldırılır
  const delAt = new Map<string, number>();
  // Sohbet çalışmıyorken (başlatılmadı / durduruldu) overlay boş kalır; düzenlemede örnek gösterilir
  const running = () => !!topic()?.running;
  // Konu her gönderimde yeni nesnelerle gelir: aynı mesajın eski nesnesi korunur ki liste baştan çizilmesin
  // (aksi halde her yeni mesajda / izleyici sayısı değişiminde tüm satırlar kaybolup yeniden belirir).
  let cache = new Map<string, ChatMsg>();
  const live = createMemo(() => {
    const next = new Map<string, ChatMsg>();
    const out = (topic()?.msgs ?? []).map((m) => {
      const old = cache.get(m.id);
      const keep = old && old.deleted === m.deleted ? old : m;
      next.set(m.id, keep);
      return keep;
    });
    cache = next;
    return out;
  });
  const shown = createMemo(() => {
    let l = running() || props.editing ? live() : [];
    const fade = Number(o().fade) * 1000;
    const n = now();
    l = l.filter((m) => {
      if (m.deleted) {
        if (!delAt.has(m.id)) delAt.set(m.id, n);
        if (n - delAt.get(m.id)! > 6000) return false;
      }
      if (m.kind !== "chat" && m.kind !== "system" && o().alertStyle === "off") return false;
      if (o().hideCommands && m.text.startsWith("!")) return false;
      if (bots().length && bots().includes(m.author.login)) return false;
      if (m.deleted && o().deleted === "hide") return false;
      if (fade > 0 && n - m.ts > fade && !props.editing) return false;
      return true;
    });
    l = l.slice(-Math.max(1, Number(o().maxMessages) || 12));
    if (delAt.size > 500) for (const k of [...delAt.keys()].slice(0, 250)) delAt.delete(k);
    // Örnek mesajlar sabit nesneler (her saniye yeniden üretilirse giriş animasyonu döngüye girer)
    if (!l.length && props.editing) l = SAMPLE;
    return o().newestTop ? [...l].reverse() : l;
  });

  const bgA = () => Math.max(0, Math.min(100, Number(o().bgOpacity ?? 55)));
  const bubbleBg = () => `color-mix(in srgb, ${o().bgColor || "#000"} ${bgA()}%, transparent)`;
  const emote = () => `${Math.max(12, Number(o().emoteSize) || 24)}px`;

  const userColor = (m: ChatMsg) => (o().userColors && m.author.color ? m.author.color : o().usernameColor);
  const tagShown = (m: ChatMsg) => (o().channelTag === "always" ? !!m.channelName : o().channelTag === "never" ? false : m.showTag && !!m.channelName);
  const fading = (m: ChatMsg) => {
    if (props.editing) return false;
    const fade = Number(o().fade) * 1000;
    return fade > 0 && now() - m.ts > fade - 1000;
  };

  const renderParts = (m: ChatMsg): JSX.Element => (
    <For each={m.parts}>
      {(p) =>
        p.t === "emote" ? (
          <img class="lc-emote" src={p.url} alt={p.name} title={p.name} draggable={false} loading="lazy" />
        ) : p.t === "link" ? (
          <span class="lc-link">{p.v}</span>
        ) : p.t === "mention" ? (
          <span class="lc-mention">@{p.v}</span>
        ) : (
          <>{p.v}</>
        )
      }
    </For>
  );

  const Badges = (b: { m: ChatMsg }) => (
    <Show when={o().showBadges}>
      <Show when={b.m.author.owner}>
        <i class="lc-b lc-b-owner">{b.m.platform === "youtube" ? "SAHİP" : "YAYINCI"}</i>
      </Show>
      <Show when={b.m.author.mod}>
        <i class="lc-b lc-b-mod">MOD</i>
      </Show>
      <Show when={b.m.author.vip}>
        <i class="lc-b lc-b-vip">VIP</i>
      </Show>
      <Show when={b.m.author.member}>
        <i class="lc-b lc-b-member">ÜYE</i>
      </Show>
      <Show when={b.m.author.sub && !b.m.author.member}>
        <i class="lc-b lc-b-sub">★</i>
      </Show>
    </Show>
  );

  const Name = (b: { m: ChatMsg }) => (
    <>
      <Show when={o().showIcons}>
        <PlatformIcon platform={b.m.platform} size={Math.round((Number(o().fontSize) || 15) * 1.1)} />
      </Show>
      <Show when={tagShown(b.m)}>
        <span class="lc-tag" style={{ color: tagColor(b.m.platform) }}>
          [{b.m.channelName}]
        </span>
      </Show>
      <Badges m={b.m} />
      <b class="lc-name" style={{ color: userColor(b.m) }} title={b.m.author.name}>
        {shortName(b.m.author.name, Number(o().nameMax) || 0)}
      </b>
    </>
  );

  // İzleyici çubuğu
  const barSize = () => ({ small: 11, normal: 15, large: 21 })[o().viewerBar as string] ?? 0;
  const viewers = () => (running() ? topic()?.viewers : undefined);
  /** Çubukta gösterilecek platformlar: bağlı (kilitli olmayan) ya da ★ favori kanalı olanlar. Yayın kapalıysa "—". */
  const barPlatforms = createMemo(() => {
    const chans = running() ? (topic()?.channels ?? []) : [];
    const set = new Set<string>();
    for (const c of chans) if (c.platform && (c.state !== "locked" || c.mine)) set.add(c.platform);
    return (["youtube", "twitch", "kick"] as const).filter((p) => set.has(p));
  });
  const barOn = () => barSize() > 0 && (props.editing || running());
  const sample = () => props.editing && !running();
  const clock = () => new Date(now()).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      class="lc"
      classList={{ top: !!o().newestTop }}
      style={{
        width: `${Number(o().width) || 360}px`,
        "font-size": `${Number(o().fontSize) || 15}px`,
        "font-family": fontStack(String(o().font ?? "")),
        "--lc-emote": emote(),
        "--lc-msg": o().messageColor,
        "--lc-bg": bubbleBg(),
      }}
    >
      <Show when={barOn()}>
        <div class="lc-bar" style={{ "font-size": `${barSize()}px`, background: o().bubbles ? bubbleBg() : undefined }}>
          <Show when={o().viewerMode !== "total"}>
            <For each={sample() ? (["youtube", "twitch", "kick"] as const) : barPlatforms()}>
              {(p) => (
                <span class="lc-bar-item">
                  <PlatformIcon platform={p} size={barSize() + 2} />
                  {fmtCount(sample() ? 123 : viewers()?.[p])}
                </span>
              )}
            </For>
          </Show>
          <Show when={sample() || o().viewerMode === "total" || barPlatforms().length > 1}>
            <span class="lc-bar-item lc-bar-total">Σ {fmtCount(sample() ? 369 : viewers()?.total)}</span>
          </Show>
          <Show when={o().showClock}>
            <span class="lc-bar-clock">{clock()}</span>
          </Show>
        </div>
      </Show>
      <Show when={o().showPoll && running() && (poll()?.state ?? "idle") !== "idle"}>
        <PollBox poll={poll()!} />
      </Show>
      <Show when={o().showCaptions && caps()}>
        <CaptionBox captions={caps()!} now={now()} maxAge={10} />
      </Show>
      <div class="lc-list" data-no-i18n>
        <For each={shown()}>
          {(m) => {
            const isAlert = m.kind !== "chat" && m.kind !== "system";
            const al = isAlert ? alertLine(m) : null;
            return (
              <div
                class="lc-msg"
                classList={{
                  bubble: !!o().bubbles,
                  alert: isAlert && o().alertStyle === "box",
                  deleted: m.deleted,
                  out: fading(m),
                  action: !!m.action,
                  system: m.kind === "system",
                }}
                style={{ "--lc-ac": isAlert ? (ALERT_COLORS[m.kind] ?? "#3498db") : undefined }}
              >
                <Show
                  when={!m.deleted}
                  fallback={
                    <>
                      <Name m={m} />
                      <span class="lc-del">{t("[mesaj silindi]")}</span>
                    </>
                  }
                >
                  <Show when={isAlert}>
                    <div class="lc-alert-head">
                      <span class="lc-alert-emoji">{al!.emoji}</span>
                      <Name m={m} />
                      <span class="lc-alert-text">{al!.text}</span>
                      <Show when={m.amount}>
                        <b class="lc-amount">{m.amount}</b>
                      </Show>
                    </div>
                  </Show>
                  <Show when={o().showReplies && m.replyTo}>
                    <div class="lc-reply">
                      ↩ @{m.replyTo!.user}: {m.replyTo!.text}
                    </div>
                  </Show>
                  <Show when={!isAlert}>
                    <Name m={m} />
                    <span class="lc-sep">:</span>
                  </Show>
                  <Show when={m.parts.length}>
                    <span class="lc-text" classList={{ sub: isAlert }}>
                      {renderParts(m)}
                    </span>
                  </Show>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
