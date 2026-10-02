// Canlı Sohbet › Sohbet: birleşik sohbet akışı (platform simgeleri, emote'lar, rozetler), arama, kaydırmayı
// durdurma, mesaj üstünde işlemler (kullanıcıyı yasakla / mesajı gizle / kopyala) ve "sohbete yaz" kutusu.

import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import type { ChatMsg } from "@/sdk/livechat";
import { F, proLocked } from "@/sdk/proFeatures";
import { PlatformIcon, fmtRemaining } from "@/overlays/livechat/parts";
import { ProLockTag } from "../../components/ProLock";
import { go } from "../../ui";
import * as I from "../../icons";
import { ALERT_COLORS, MsgParts, alertText, errText, lc, setLc, toast } from "./common";

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

function Badges(p: { m: ChatMsg }) {
  const a = () => p.m.author;
  return (
    <>
      <Show when={a().owner}>
        <i class="lcp-b owner">{p.m.platform === "youtube" ? t("SAHİP") : t("YAYINCI")}</i>
      </Show>
      <Show when={a().mod}>
        <i class="lcp-b mod">MOD</i>
      </Show>
      <Show when={a().vip}>
        <i class="lcp-b vip">VIP</i>
      </Show>
      <Show when={a().member}>
        <i class="lcp-b member">{t("ÜYE")}</i>
      </Show>
      <Show when={a().sub && !a().member}>
        <i class="lcp-b sub" title={t("Abone")}>
          ★
        </i>
      </Show>
    </>
  );
}

function Message(p: { m: ChatMsg }) {
  const m = () => p.m;
  const isAlert = () => !["chat", "system"].includes(m().kind);
  const al = () => (isAlert() ? alertText(m()) : null);
  const tagColor = () => LC.PLATFORM_COLORS[m().platform];
  const copy = async () => {
    await navigator.clipboard.writeText(`${m().author.name}: ${m().text}`).catch(() => {});
    toast(t("Kopyalandı"));
  };
  const ban = async () => {
    if (!confirm(t("{0} engellensin mi? Mesajları gizlenir ve bundan sonra gösterilmez (Moderasyon'dan kaldırılabilir).", m().author.name))) return;
    try {
      await LC.banUser(m().author.login || m().author.name, m().platform);
      toast(t("{0} engellendi", m().author.name));
    } catch (e) {
      toast(errText(e), true);
    }
  };
  const hide = () => LC.hideMessage(m().id).catch((e) => toast(errText(e), true));
  return (
    <div
      class="lcp-msg"
      classList={{ deleted: m().deleted, alert: isAlert(), system: m().kind === "system", vote: m().vote != null }}
      style={{ "--lcp-ac": isAlert() ? (ALERT_COLORS[m().kind] ?? "#3498db") : undefined }}
    >
      <span class="lcp-time">{hhmm(m().ts)}</span>
      <span class="lcp-ic" title={LC.PLATFORM_NAMES[m().platform] + (m().channelName ? ` · ${m().channelName}` : "")}>
        <PlatformIcon platform={m().platform} size={16} />
      </span>
      <div class="lcp-body" data-no-i18n>
        <Show when={m().replyTo}>
          <div class="lcp-reply">
            ↩ @{m().replyTo!.user}: {m().replyTo!.text}
          </div>
        </Show>
        <Show when={isAlert()}>
          <div class="lcp-alert-line">
            {al()!.emoji}{" "}
            <span class="lcp-name" style={{ color: m().author.color || undefined }}>
              {m().author.name}
            </span>{" "}
            {al()!.text}
            <Show when={m().amount}>
              <span class="lcp-amount">{m().amount}</span>
            </Show>
          </div>
        </Show>
        <Show when={!isAlert() || m().parts.length}>
          <span class="lcp-text">
            <Show when={!isAlert()}>
              <Show when={m().showTag && m().channelName}>
                <span class="lcp-tag" style={{ color: tagColor() }}>
                  [{m().channelName}]
                </span>
              </Show>
              <Badges m={m()} />
              <span class="lcp-name" style={{ color: m().author.color || "#7ee2a8" }} title={m().author.login}>
                {m().author.name}
              </span>
              <span>{m().action ? " " : ": "}</span>
            </Show>
            <Show when={m().deleted} fallback={<MsgParts m={m()} />}>
              {t("[mesaj silindi]")}
            </Show>
          </span>
        </Show>
      </div>
      <Show when={m().kind !== "system"}>
        <div class="lcp-acts">
          <button title={t("Kopyala")} onClick={copy}>
            <I.Copy />
          </button>
          <Show when={!m().deleted}>
            <button title={t("Mesajı gizle (sadece bu uygulamada ve overlay'lerde)")} onClick={hide}>
              <I.EyeOff />
            </button>
          </Show>
          <Show when={m().platform !== "streamlabs"}>
            <button class="danger" title={t("Kullanıcıyı engelle")} onClick={ban}>
              <I.Ban />
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Sohbete yaz kutusu (PRO: livechat.send) */
function Composer() {
  const store = LC.useLiveChat(300);
  const [send, setSend] = createSignal<LC.SendStatus | null>(null);
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  onMount(() => {
    LC.sendStatus().then(setSend).catch(() => {});
    let un: (() => void) | undefined;
    void LC.onSend(setSend).then((u) => (un = u));
    onCleanup(() => un?.());
  });
  const locked = () => proLocked(F.liveSend);
  const connected = (p: LC.Platform) => !!(send() as any)?.[p]?.connected;
  const anyAccount = () => connected("twitch") || connected("youtube") || connected("kick");
  const targets = createMemo(() => (store.status()?.channels ?? []).filter((c) => c.platform && c.state !== "idle" && c.state !== "locked"));
  const mine = () => targets().filter((c) => c.mine);
  const target = () => {
    const v = lc().sendTarget || "mine";
    return v === "mine" || targets().some((c) => c.key === v) ? v : "mine";
  };
  const submit = async () => {
    const msg = text().trim();
    if (!msg || busy()) return;
    setBusy(true);
    try {
      const res = await LC.sendMessage(msg, target());
      const bad = res.filter((r) => !r.ok);
      if (bad.length < res.length) setText("");
      for (const r of bad) toast(t("Gönderilemedi ({0} · {1}): {2}", LC.PLATFORM_NAMES[r.platform], r.label, r.error ?? ""), true);
      if (!bad.length && res.length > 1) toast(t("{0} kanala gönderildi", res.length));
    } catch (e) {
      toast(errText(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Show
      when={!locked() && anyAccount()}
      fallback={
        <div class="lcp-composer-note">
          <Show
            when={locked()}
            fallback={
              <>
                {t("Sohbete yazmak için hesabını bağla: ")}
                <button class="link" onClick={() => go("livechat", "send")}>
                  Sohbete yaz ayarları
                </button>
              </>
            }
          >
            <ProLockTag feature={F.liveSend} /> {t("Twitch / YouTube / Kick sohbetine buradan yazmak PRO üyelere özel.")}{" "}
            <button class="link" onClick={() => go("pro")}>
              PRO'ya bak
            </button>
          </Show>
        </div>
      }
    >
      <div class="lcp-composer">
        <select value={target()} onChange={(e) => setLc((x) => (x.sendTarget = e.currentTarget.value))} title={t("Mesajın gideceği kanal")}>
          <option value="mine">{t("★ Kanallarım ({0})", mine().length)}</option>
          <For each={targets()}>
            {(c) => (
              <option value={c.key}>
                {LC.PLATFORM_NAMES[c.platform!]} · {c.label}
              </option>
            )}
          </For>
        </select>
        <input
          class="input"
          placeholder={t("Sohbete yaz… (Enter gönderir)")}
          maxLength={500}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button class="btn primary" disabled={busy() || !text().trim()} onClick={submit}>
          <I.Send /> Gönder
        </button>
      </div>
    </Show>
  );
}

export function ChatTab() {
  const store = LC.useLiveChat(300);
  const [query, setQuery] = createSignal("");
  const [paused, setPaused] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  const tick = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(tick));
  let list: HTMLDivElement | undefined;

  const shown = createMemo(() => {
    const q = query().trim().toLocaleLowerCase("tr");
    const all = store.msgs();
    if (!q) return all;
    return all.filter((m) => m.text.toLocaleLowerCase("tr").includes(q) || m.author.name.toLocaleLowerCase("tr").includes(q));
  });

  const toBottom = () => {
    if (list) list.scrollTop = list.scrollHeight;
  };
  // Yeni mesajda en alta kay (durdurulmadıysa)
  createEffect(
    on(
      () => shown().length + (shown()[shown().length - 1]?.id ?? ""),
      () => {
        if (!paused()) queueMicrotask(toBottom);
      },
    ),
  );
  onMount(() => setTimeout(toBottom, 50));
  // Kullanıcı yukarı kaydırırsa otomatik kaydırma durur; en alta inince sürer
  const onScroll = () => {
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (!atBottom && !paused()) setPaused(true);
    else if (atBottom && paused() && !query()) setPaused(false);
  };

  const poll = () => store.poll();
  const running = () => !!store.status()?.running;

  return (
    <div class="lcp-chat">
      <div class="lcp-tools">
        <input class="input" placeholder={t("Mesajlarda ya da kullanıcı adlarında ara…")} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} />
        <button
          class="btn ghost small"
          classList={{ on: paused() }}
          title={t("Otomatik kaydırmayı durdur / sürdür")}
          onClick={() => {
            setPaused(!paused());
            if (!paused()) toBottom();
          }}
        >
          {paused() ? <I.Play /> : <I.Pause />}
          {paused() ? t("Kaydırma durdu") : t("Kaydırmayı durdur")}
        </button>
        <button
          class="btn ghost small"
          title={t("Sohbeti temizle (kayıt dosyası etkilenmez)")}
          onClick={() => LC.clearChat().catch((e) => toast(errText(e), true))}
        >
          <I.Trash /> Temizle
        </button>
      </div>
      <Show when={poll() && poll()!.state !== "idle"}>
        <div class="lcp-pollbar" classList={{ result: poll()!.state === "result" }}>
          <b>📊 {poll()!.state === "active" ? t("Anket sürüyor") : t("Anket bitti")}</b>
          <span data-no-i18n>{poll()!.question}</span>
          <span class="lcp-sp" />
          <span>
            {t("{0} oy", poll()!.total)}
            <Show when={poll()!.state === "active" && poll()!.endsAt}>
              {" · "}
              {fmtRemaining(Math.max(0, Math.round((poll()!.endsAt! - now()) / 1000)))}
            </Show>
          </span>
          <button class="btn ghost small" onClick={() => go("livechat", "poll")}>
            Anket
          </button>
        </div>
      </Show>
      <div class="lcp-list" ref={list} onScroll={onScroll}>
        <Show
          when={shown().length}
          fallback={
            <div class="lcp-empty">
              <div>
                <Show
                  when={running()}
                  fallback={
                    <>
                      <p>{t("Canlı sohbet çalışmıyor.")}</p>
                      <p class="muted small">
                        {lc().channels.length ? t("Üstteki Başlat düğmesiyle bağlan.") : t("Önce Kanallar'dan YouTube, Twitch ya da Kick kanalını ekle.")}
                      </p>
                      <Show when={!lc().channels.length}>
                        <button class="btn primary small" onClick={() => go("livechat", "channels")}>
                          Kanal ekle
                        </button>
                      </Show>
                    </>
                  }
                >
                  <p>{query() ? t("Aramaya uyan mesaj yok.") : t("Mesaj bekleniyor…")}</p>
                </Show>
              </div>
            </div>
          }
        >
          <For each={shown()}>{(m) => <Message m={m} />}</For>
        </Show>
        <Show when={paused() && !query()}>
          <div class="lcp-resume">
            <button
              class="btn primary small"
              onClick={() => {
                setPaused(false);
                toBottom();
              }}
            >
              <I.ArrowDownToLine /> En alta dön
            </button>
          </div>
        </Show>
      </div>
      <Composer />
    </div>
  );
}
