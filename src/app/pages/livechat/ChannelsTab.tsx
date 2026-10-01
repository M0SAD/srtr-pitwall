// Canlı Sohbet › Kanallar: link yapıştır (platform otomatik tanınır), sürükleyerek sırala, gizle (göz),
// [kanal] etiketi, ★ benim kanalım, kaldır, kanal başına durum. Ücretsiz sürümde sadece en üstteki kanal bağlanır.

import { For, Show, createMemo, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "@/sdk/i18n";
import * as LC from "@/sdk/livechat";
import type { LiveChannel } from "@/sdk/settings";
import { F } from "@/sdk/proFeatures";
import { prettyKey, shortcut } from "@/sdk/shortcuts";
import { PlatformIcon } from "@/overlays/livechat/parts";
import { ProLockNote } from "../../components/ProLock";
import { Slider, Switch } from "../../components/SettingsForm";
import * as I from "../../icons";
import { STATE_TEXT, errText, lc, setLc, toast } from "./common";

export function ChannelsTab() {
  const store = LC.useLiveChat(300);
  const [input, setInput] = createSignal("");
  const [msg, setMsg] = createSignal<{ ok: string[]; bad: string[] } | null>(null);
  const [drag, setDrag] = createSignal<number | null>(null);
  const [over, setOver] = createSignal<{ i: number; after: boolean } | null>(null);

  const list = () => lc().channels;
  const statusOf = (c: LiveChannel) => store.status()?.channels.find((s) => s.url === c.url);
  const platformOf = (c: LiveChannel) => statusOf(c)?.platform ?? LC.detectPlatform(c.url);
  const multi = () => store.status()?.multi ?? true;

  const save = (next: LiveChannel[]) => {
    // Platform başına tek "benim kanalım"
    const seen = new Set<string>();
    for (const c of next) {
      if (!c.mine) continue;
      const p = LC.detectPlatform(c.url) ?? "";
      if (seen.has(p)) c.mine = false;
      else seen.add(p);
    }
    setLc((x) => (x.channels = next));
  };

  const add = async () => {
    const text = input().trim();
    if (!text) return;
    try {
      const r = await LC.parseLinks(text);
      const have = new Set(list().map((c) => c.url));
      // Aynı kanal (farklı yazılmış link) kontrolü için mevcutların anahtarları
      const existing = await LC.parseLinks(list().map((c) => c.url).join(" "));
      const keys = new Set(existing.valid.map((v) => v.key));
      const added: LiveChannel[] = [];
      const bad: string[] = r.invalid.map((x) => t("Tanınmadı: {0}", x));
      for (const v of r.valid) {
        if (keys.has(v.key) || have.has(v.url)) {
          bad.push(t("Zaten listede: {0}", v.label));
          continue;
        }
        keys.add(v.key);
        added.push({ url: v.url, hidden: false, tag: null, mine: false, name: "" });
      }
      if (added.length) save([...added, ...list().map((c) => ({ ...c }))]);
      setMsg({ ok: added.map((a) => a.url), bad });
      if (added.length) setInput("");
    } catch (e) {
      toast(errText(e), true);
    }
  };

  const patch = (i: number, fn: (c: LiveChannel) => void) => {
    const next = list().map((c) => ({ ...c }));
    fn(next[i]);
    save(next);
  };
  const remove = (i: number) => save(list().filter((_, j) => j !== i).map((c) => ({ ...c })));
  const move = (from: number, to: number) => {
    const next = list().map((c) => ({ ...c }));
    const [x] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, x);
    save(next);
  };
  const rename = (i: number) => {
    const cur = list()[i].name ?? "";
    const v = prompt(t("Kanalın görünen adı (boş: platformdaki ad)"), cur);
    if (v !== null) patch(i, (c) => (c.name = v.trim().slice(0, 40)));
  };
  const cycleTag = (i: number) =>
    patch(i, (c) => {
      c.tag = c.tag == null ? true : c.tag ? false : null;
    });
  const tagTitle = (c: LiveChannel) =>
    c.tag == null ? t("[kanal] etiketi: otomatik (aynı platformdan birden fazla kanal varsa)") : c.tag ? t("[kanal] etiketi: her zaman") : t("[kanal] etiketi: hiç");

  const counts = createMemo(() => {
    const n = { youtube: 0, twitch: 0, kick: 0 } as Record<string, number>;
    for (const c of list()) {
      const p = LC.detectPlatform(c.url);
      if (p) n[p] = (n[p] ?? 0) + 1;
    }
    return n;
  });

  /** ★ favori: platform başına bir tane. Aynı platformdan başka bir kanal işaretlenirse eskisinin yerini alır. */
  const toggleMine = (i: number) => {
    const next = list().map((c) => ({ ...c }));
    const on = !next[i].mine;
    if (on) {
      const p = LC.detectPlatform(next[i].url);
      let replaced = false;
      next.forEach((c, j) => {
        if (j !== i && c.mine && LC.detectPlatform(c.url) === p) {
          c.mine = false;
          replaced = true;
        }
      });
      if (replaced && p) toast(t("{0} için favori kanal değiştirildi (platform başına tek favori)", LC.PLATFORM_NAMES[p]));
    }
    next[i].mine = on;
    save(next);
  };

  const stateLine = (c: LiveChannel, i: number) => {
    const s = statusOf(c);
    if (!multi() && i > 0) return s?.viewers != null ? t("{0} izleyici", LC.fmtCount(s.viewers)) : t(STATE_TEXT.locked);
    if (!s) return store.status()?.running ? t(STATE_TEXT.connecting) : t(STATE_TEXT.idle);
    if (s.state === "live" && s.viewers != null) return t("Canlı · {0} izleyici", LC.fmtCount(s.viewers));
    return t(STATE_TEXT[s.state]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const from = drag();
    const o = over();
    setDrag(null);
    setOver(null);
    if (from == null || !o) return;
    let to = o.after ? o.i + 1 : o.i;
    if (from < to) to -= 1;
    if (to !== from) move(from, to);
  };

  return (
    <>
      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Kanal ekle</h3>
        </div>
        <p class="muted small">
          YouTube (@kanal, /channel/…, /watch?v=… ya da canlı yayın linki), Twitch ve Kick linklerini yapıştır; birden fazlasını boşluk,
          virgül ya da satırla ayırabilirsin. Platform otomatik tanınır, okumak için giriş gerekmez. Yeni kanallar listenin en üstüne eklenir.
        </p>
        <div class="lcp-add">
          <textarea
            class="input"
            rows={2}
            placeholder="https://www.youtube.com/@kanal  https://www.twitch.tv/kanal  https://kick.com/kanal"
            value={input()}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void add();
              }
            }}
          />
          <button class="btn primary" onClick={add}>
            <I.Plus /> Ekle
          </button>
        </div>
        <Show when={msg()}>
          <div class="lcp-add-msg" data-no-i18n>
            <Show when={msg()!.ok.length}>
              <div class="ok">✓ {t("{0} kanal eklendi", msg()!.ok.length)}</div>
            </Show>
            <For each={msg()!.bad}>{(b) => <div class="bad">✖ {b}</div>}</For>
          </div>
        </Show>
      </section>

      <section class="panel">
        <div class="lcp-panel-head">
          <h3>Kanallar</h3>
          <span class="lcp-sp" />
          <Show when={list().length}>
            <small class="muted">Sürükleyerek sırala · ★ favori kanalın (platform başına bir tane; izleyici sayısı ve sohbete yazma)</small>
          </Show>
        </div>
        <Show when={list().length > 1}>
          <ProLockNote feature={F.liveMulti} text={t("Ücretsiz sürümde yalnızca en üstteki kanalın mesajları görünür. Başka bir kanala geçmek için onu en üste sürükle; ★ favori kanalların izleyici sayısı yine gösterilir.")} />
        </Show>
        <Show when={list().length} fallback={<p class="muted">Henüz kanal yok. Yukarıya bir link yapıştır.</p>}>
          <div class="lcp-chans" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <For each={list()}>
              {(c, i) => {
                const s = () => statusOf(c);
                const locked = () => !multi() && i() > 0;
                const p = () => platformOf(c);
                return (
                  <div
                    class="lcp-ch"
                    classList={{
                      drag: drag() === i(),
                      locked: locked(),
                      hiddenmsg: !!c.hidden,
                      "over-top": over()?.i === i() && !over()!.after && drag() !== i(),
                      "over-bottom": over()?.i === i() && over()!.after && drag() !== i(),
                    }}
                    draggable={true}
                    onDragStart={(e) => {
                      setDrag(i());
                      e.dataTransfer?.setData("text/plain", String(i()));
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setOver({ i: i(), after: e.clientY > r.top + r.height / 2 });
                    }}
                  >
                    <span class="lcp-grip" title={t("Sürükle")}>
                      ⠿
                    </span>
                    <i class={`lcp-dot ${locked() ? "" : (s()?.state ?? "")}`} />
                    <Show when={p()}>
                      <PlatformIcon platform={p()!} size={18} />
                    </Show>
                    <div class="lcp-ch-main">
                      <button class="lcp-ch-name" title={t("Kanalı tarayıcıda aç")} onClick={() => invoke("open_url", { url: c.url }).catch(() => {})} data-no-i18n>
                        {c.name || s()?.label || c.url}
                      </button>
                      <Show when={s()?.error && !locked()} fallback={<small data-no-i18n>{c.url}</small>}>
                        <small class="err" data-no-i18n>
                          {s()!.error}
                        </small>
                      </Show>
                    </div>
                    <span class="lcp-ch-state">
                      <Show when={locked()} fallback={stateLine(c, i())}>
                        <Show when={c.mine && s()?.viewers != null}>{stateLine(c, i())} </Show>
                        <span class="pro-badge small" title={t("Ücretsiz sürümde yalnızca en üstteki kanalın mesajları görünür")}>
                          PRO
                        </span>
                      </Show>
                    </span>
                    <div class="lcp-ch-btns">
                      <button
                        classList={{ on: !c.hidden }}
                        title={c.hidden ? t("Mesajlar gizli (oy da sayılmaz) — göster") : t("Mesajlar görünüyor — gizle")}
                        onClick={() => patch(i(), (x) => (x.hidden = !x.hidden))}
                      >
                        {c.hidden ? <I.EyeOff /> : <I.Eye />}
                      </button>
                      <button classList={{ on: c.tag === true }} title={tagTitle(c)} onClick={() => cycleTag(i())}>
                        <I.Tag />
                        <Show when={c.tag == null}>
                          <small>{t("oto")}</small>
                        </Show>
                      </button>
                      <button
                        class="star"
                        classList={{ on: !!c.mine }}
                        title={c.mine ? t("Favori kanalım (platform başına bir tane)") : t("Favori kanalım olarak işaretle")}
                        onClick={() => toggleMine(i())}
                      >
                        <I.Star />
                      </button>
                      <button title={t("Görünen adı değiştir")} onClick={() => rename(i())}>
                        <I.Pencil />
                      </button>
                      <button title={t("Kaldır")} onClick={() => remove(i())}>
                        <I.X />
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
          <div class="lcp-summary">
            <For each={["youtube", "twitch", "kick"] as const}>
              {(p) => (
                <Show when={counts()[p]}>
                  <span>
                    <PlatformIcon platform={p} size={14} /> {LC.PLATFORM_NAMES[p]} × {counts()[p]}
                  </span>
                </Show>
              )}
            </For>
          </div>
        </Show>
      </section>

      <section class="panel">
        <h3>Bağlantı</h3>
        <div class="row">
          <div>
            <b>Otomatik başlat</b>
            <small>
              {t(
                "Program açılınca canlı sohbet kendiliğinden başlar ve sohbet overlay'i görünür. Kapalıyken Başlat düğmesiyle ya da kısayolla ({0}) başlatırsın.",
                prettyKey(shortcut("chat")),
              )}
            </small>
          </div>
          <Switch checked={lc().autoStart} onChange={(v) => setLc((x) => (x.autoStart = v))} />
        </div>
        <div class="row">
          <div>
            <b>YouTube sohbet yenileme aralığı</b>
            <small>Kısa aralık mesajları daha hızlı getirir (1–10 sn).</small>
          </div>
          <div style={{ width: "220px" }}>
            <Slider value={lc().ytInterval} min={1} max={10} step={0.5} unit={t("sn")} onInput={(n) => setLc((x) => (x.ytInterval = n))} />
          </div>
        </div>
      </section>
    </>
  );
}
