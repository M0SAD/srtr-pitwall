// Live Timing: spotter ve yarış mühendisi için sıralama + yarış kontrol akışı.
// "Tekrar" olayın 5 sn öncesine iRacing tekrarını sarar; "Canlı" kamerayı o araca çevirir.

import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { setSubscriptions, useTopic, useTopicSource } from "@/sdk/telemetry";
import { themeVars } from "@/sdk/theme";
import { settings } from "@/sdk/settings";
import { inTauri } from "@/sdk/platform";
import { clock } from "@/sdk/format";
import type { RcEvent } from "@/sdk/types";
import { CarLogo } from "@/sdk/logos";
import { friendRowStyle } from "@/sdk/friends";
import { FriendBadge } from "@/sdk/FriendBadge";

const ICON: Record<RcEvent["kind"], string> = {
  lead: "🏁",
  lost: "⚠",
  gained: "▲",
  pitIn: "P",
  pitOut: "P",
  fastest: "⏱",
  flag: "⚑",
};

/**
 * `readOnly`: tekrar / kamera düğmeleri çizilmez, sime komut gönderilmez (Ekip Pitwall'ı: sürücünün gözünden görünüm).
 * Veri kaynağı: üstte bir TopicSourceProvider varsa oradan (uzak anlık görüntü), yoksa yerel sim akışından okunur.
 */
export function Timing(props: { readOnly?: boolean } = {}) {
  const remote = !!useTopicSource();
  /** Sime komut gönderilebilir mi (yerel pencere, uygulama içinde) */
  const canCmd = inTauri && !remote && !props.readOnly;
  const st = useTopic("standings");
  const rc = useTopic("raceControl");
  const ses = useTopic("session");
  const [err, setErr] = createSignal("");
  const [filter, setFilter] = createSignal<"all" | "me">("all");
  onMount(() =>
    !remote && setSubscriptions([
      { name: "standings", hz: 2 },
      { name: "raceControl", hz: 1 },
      { name: "session", hz: 1 },
    ]),
  );
  const vars = createMemo(() => themeVars(settings().theme));

  const run = async (cmd: string, args: Record<string, unknown>) => {
    if (!canCmd) return;
    setErr("");
    try {
      await invoke(cmd, args);
    } catch (e) {
      setErr(String(e));
    }
  };

  const me = createMemo(() => st()?.rows.find((r) => r.isMe));
  const groups = createMemo(() => {
    const d = st();
    if (!d) return [];
    return d.classes.map((c) => ({ c, rows: d.rows.filter((r) => r.classId === c.id) }));
  });
  const events = createMemo(() => {
    const e = rc()?.events ?? [];
    return filter() === "me" ? e.filter((x) => x.isMe) : e;
  });

  return (
    <div class="lt ov-theme" classList={{ ro: !canCmd }} style={vars()}>
      <div class="lt-top">
        <b data-no-i18n>SRTR Pitwall · Live Timing</b>
        <Show when={ses()}>
          <span class="pw-dim">
            {ses()!.sessionType} · Tur {ses()!.lap}
            {ses()!.timeRemain > 0 && ses()!.timeRemain < 604800 ? ` · ${clock(ses()!.timeRemain)}` : ""}
          </span>
        </Show>
        <span class="lt-sp" />
        <Show when={canCmd}>
          <button class="lt-btn" onClick={() => run("replay_live", {})}>
            Canlıya dön
          </button>
          <Show when={me()}>
            <button class="lt-btn accent" onClick={() => run("camera_car", { number: me()!.number })}>
              Benim araç
            </button>
          </Show>
        </Show>
        <span class="lt-pill">{st()?.carCount ?? 0} sürücü</span>
      </div>
      <Show when={err()}>
        <div class="lt-err">{err()}</div>
      </Show>
      <div class="lt-cols">
        <section class="lt-panel">
          <header>SIRALAMA</header>
          <div class="lt-head lt-row">
            <span>P</span>
            <span>#</span>
            <span />
            <span>SÜRÜCÜ</span>
            <span>ARA</span>
            <span>FARK</span>
            <span />
          </div>
          <div class="lt-scroll">
            <For each={groups()}>
              {(g) => (
                <>
                  <div class="lt-class" style={{ "border-left-color": g.c.color || "#888" }}>
                    <b>{g.c.name || "Sınıf"}</b>
                    <span class="pw-dim">{g.c.count} sürücü</span>
                  </div>
                  <For each={g.rows}>
                    {(r) => (
                      <div class="lt-row" classList={{ me: r.isMe, pit: r.onPit }} style={r.isMe ? undefined : friendRowStyle("timing", r.userId, r.name)}>
                        <span class="lt-pos" style={{ background: r.classColor || "#888" }}>
                          {r.classPos}
                        </span>
                        <span class="pw-dim">#{r.number}</span>
                        <CarLogo carName={r.carName || r.car} fallback={r.car} />
                        <span class="lt-name">
                          <FriendBadge place="timing" userId={r.userId} name={r.name} />
                          <span data-no-i18n>{r.name}</span>
                          <Show when={r.pitState}>
                            <span class="ov-tag lt-pit">{r.pitState}</span>
                          </Show>
                        </span>
                        <span class="ov-mono">{r.classPos === 1 ? "—" : `+${r.interval.toFixed(1)}`}</span>
                        <span class="ov-mono">
                          {r.classPos === 1 ? "—" : r.lapsDown > 0 ? `+${r.lapsDown}T` : `+${r.gap.toFixed(1)}`}
                        </span>
                        <span>
                          <Show when={canCmd}>
                            <button class="lt-btn small" onClick={() => run("camera_car", { number: r.number })}>
                              Canlı
                            </button>
                          </Show>
                        </span>
                      </div>
                    )}
                  </For>
                </>
              )}
            </For>
          </div>
        </section>
        <section class="lt-panel">
          <header>
            YARIŞ KONTROL
            <span class="lt-filter">
              <button classList={{ on: filter() === "all" }} onClick={() => setFilter("all")}>
                Tümü
              </button>
              <button classList={{ on: filter() === "me" }} onClick={() => setFilter("me")}>
                Ben
              </button>
            </span>
          </header>
          <div class="lt-scroll">
            <Show when={events().length > 0} fallback={<div class="ov-empty">Henüz olay yok</div>}>
              <For each={events()}>
                {(e) => (
                  <div class={`lt-ev k-${e.kind}`}>
                    <span class="pw-dim lt-lap">T{e.lap}</span>
                    <span class="lt-ico">{ICON[e.kind]}</span>
                    <span class="lt-bar" style={{ background: e.classColor || "#888" }} />
                    <span class="lt-txt">
                      <b>
                        <span data-no-i18n>#{e.number} {e.name}</span>
                      </b>{" "}
                      {e.text}
                    </span>
                    <span class="pw-dim lt-time">{clock(e.time)}</span>
                    <Show when={canCmd}>
                      <button class="lt-btn small" onClick={() => run("replay_seek", { sessionNum: e.sessionNum, sessionTime: e.time, carNumber: e.number, carIdx: e.idx >= 0 ? e.idx : null })}>
                        Tekrar
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </section>
      </div>
    </div>
  );
}
