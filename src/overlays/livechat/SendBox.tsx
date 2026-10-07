// Canlı Sohbet overlay'inin en altındaki mesaj yazma satırı (ayar: "Mesaj yazma kutusu", PRO: livechat.send).
// Solda hedef kanal (platform simgesi + ad), sağında mesaj kutusu. Kutu odaktayken:
//   Tab / Shift+Tab → sonraki / önceki yazılabilir kanal · Enter → seçili kanala gönder · Esc → odağı bırak
// Overlay penceresi normalde tıklamaları oyuna geçirir; satırın ekran dikdörtgeni Rust'a bildirilir (livechat/inputbox.rs)
// ve imleç yalnızca bu satırın üstündeyken pencere tıklanabilir olur. Odak bırakılınca klavye oyuna geri verilir.
// Panel önizlemesinde ve düzenleme modunda satır sadece görünür (yazılamaz); OBS tarayıcı kaynağında hiç çizilmez.

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import { PlatformIcon } from "./parts";

const WRITABLE = ["twitch", "youtube", "kick"] as const;
type W = (typeof WRITABLE)[number];

export function SendBox(props: { channels: LC.ChannelStatus[]; interactive: boolean; bg?: string }) {
  const id = `lc-send-${Math.random().toString(36).slice(2, 8)}`;
  let row: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const [st, setSt] = createSignal<LC.SendStatus | null>(null);
  const [sel, setSel] = createSignal("");
  const [focused, setFocused] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");
  let errTimer: number | undefined;
  const showErr = (m: string) => {
    setErr(m);
    clearTimeout(errTimer);
    errTimer = window.setTimeout(() => setErr(""), 5000);
  };
  onCleanup(() => clearTimeout(errTimer));

  /** Yazılabilir kanallar: sohbete bağlı (durmuş / kilitli değil) ve platformun hesabı "Sohbete yaz"da bağlı; ★ kanallar önde */
  const targets = createMemo(() => {
    if (!props.interactive) return [];
    const s = st();
    const l = props.channels.filter(
      (c) => c.platform && (WRITABLE as readonly string[]).includes(c.platform) && c.state !== "idle" && c.state !== "locked" && !!s?.[c.platform as W]?.connected,
    );
    return [...l.filter((c) => c.mine), ...l.filter((c) => !c.mine)];
  });
  const cur = createMemo(() => targets().find((c) => c.key === sel()) ?? targets()[0]);
  const step = (d: number) => {
    const l = targets();
    if (l.length < 2) return;
    const i = Math.max(0, l.findIndex((c) => c.key === cur()?.key));
    setSel(l[(i + d + l.length) % l.length].key);
  };

  const send = async () => {
    const text = (input?.value ?? "").trim();
    const c = cur();
    if (!text || busy()) return;
    if (!c) return showErr(t("Yazılabilir kanal yok"));
    setBusy(true);
    try {
      const res = await LC.sendMessage(text, c.key);
      const bad = res.find((r) => !r.ok);
      if (bad) return showErr(bad.error ?? t("Gönderilemedi"));
      if (input) input.value = "";
      setErr("");
      // Odak kutuda kalır: art arda mesaj yazılabilsin (oyuna dönmek için Esc ya da kutunun dışına tıklamak yeterli)
      input?.focus();
    } catch (e) {
      showErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Tab") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input?.blur();
    }
  };

  // Hesap durumu + tıklanabilir bölge (yalnızca ekrandaki, etkileşimli satır)
  onMount(() => {
    let un: (() => void) | undefined;
    let last = "";
    let live = false;
    const report = () => {
      if (!props.interactive || !row) {
        if (live) {
          live = false;
          last = "";
          void LC.inputBox(id, "remove").catch(() => {});
        }
        return;
      }
      const r = row.getBoundingClientRect();
      const k = window.devicePixelRatio || 1;
      const rect = { x: Math.round(r.left * k), y: Math.round(r.top * k), w: Math.round(r.width * k), h: Math.round(r.height * k) };
      const key = JSON.stringify(rect);
      if (key === last) return;
      last = key;
      live = true;
      void LC.inputBox(id, "region", rect).catch(() => {});
    };
    const timer = setInterval(report, 500);
    createEffect(() => {
      if (props.interactive) {
        if (!st()) LC.sendStatus().then(setSt).catch(() => {});
        if (!un) void LC.onSend(setSt).then((u) => (un = u));
      } else input?.blur();
      report();
    });
    // Odaktayken satırın dışına tıklanırsa / pencere arkaya geçerse odağı bırak
    const outside = (e: PointerEvent) => {
      if (focused() && row && !row.contains(e.target as Node)) input?.blur();
    };
    const winBlur = () => input?.blur();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", winBlur);
    onCleanup(() => {
      clearInterval(timer);
      un?.();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", winBlur);
      if (live) void LC.inputBox(id, "remove").catch(() => {});
    });
  });

  return (
    <div ref={row} class="lc-send" classList={{ on: props.interactive, focus: focused(), err: !!err() }} style={{ background: props.bg }}>
      <span class="lc-send-ch" title={t("Mesajın gideceği kanal (kutudayken Tab ile değişir)")}>
        <Show when={props.interactive} fallback={<PlatformIcon platform="twitch" size={16} />}>
          <Show when={cur()} fallback={<i class="lc-dot" style={{ width: "9px", height: "9px" }} />}>
            <PlatformIcon platform={cur()!.platform!} size={16} />
          </Show>
        </Show>
        <b data-no-i18n={props.interactive && cur() ? "" : undefined}>
          {props.interactive ? (cur()?.label ?? t("Kanal yok")) : t("kanalım")}
        </b>
        <Show when={focused() && targets().length > 1}>
          <i class="lc-send-n" data-no-i18n>
            {targets().findIndex((c) => c.key === cur()?.key) + 1}/{targets().length}
          </i>
        </Show>
      </span>
      <Show when={err()}>
        <span class="lc-send-err" data-no-i18n onClick={() => setErr("")}>
          {err()}
        </span>
      </Show>
      <input
        ref={input}
        class="lc-send-in"
        type="text"
        maxLength={500}
        spellcheck={false}
        autocomplete="off"
        disabled={!props.interactive}
        readOnly={busy()}
        placeholder={
          !props.interactive
            ? t("Mesaj yaz…")
            : !targets().length
              ? t("Yazılabilir kanal yok (Canlı Sohbet › Sohbete yaz'dan hesabını bağla)")
              : focused()
                ? t("Tab: kanal · Enter: gönder · Esc: çık")
                : t("Mesaj yaz…")
        }
        onKeyDown={onKey}
        onFocus={() => {
          setFocused(true);
          void LC.inputBox(id, "focus").catch(() => {});
        }}
        onBlur={() => {
          setFocused(false);
          void LC.inputBox(id, "blur").catch(() => {});
        }}
      />
    </div>
  );
}
