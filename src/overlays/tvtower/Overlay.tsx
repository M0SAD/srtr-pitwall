import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { previewFrozen } from "@/sdk/overlay";
import { Flag } from "@/sdk/Flag";
import { useTvVisible, TvLogo, gapToLeader, hms, intervalText, numberColors, sessionLabel, tvName, upper, useTvStandings } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import "./style.css";

// TV Sıralama Kulesi: GT yayınlarındaki soldaki dikey sıralama.

// "206 LAPS": sayı normal, LAPS küçük (TV'deki gibi)
function lapsSmall(t: string) {
  const m = /^(\d+) (LAPS?)$/.exec(t);
  return m ? (
    <>
      {m[1]}
      <small class="tvt-laps">{m[2]}</small>
    </>
  ) : (
    t
  );
}

export default function TvTower(props: OverlayProps) {
  const o = () => props.options;
  const { rows, info, sample } = useTvStandings(() => !!props.editing);

  // Fark sütunu "sırayla": 10 sn lidere fark, 10 sn öndekine fark
  const [phase, setPhase] = createSignal(0);
  const iv = window.setInterval(() => !previewFrozen() && setPhase((p) => (p + 1) % 2), 10_000);
  onCleanup(() => clearInterval(iv));
  const gapMode = () => (o().gapMode === "cycle" ? (phase() ? "interval" : "leader") : (o().gapMode as string) || "leader");

  const me = createMemo(() => rows().find((r) => r.isMe));
  const filtered = createMemo(() => {
    const all = rows();
    if (o().classFilter === "mine" && me()) return all.filter((r) => r.classId === me()!.classId).sort((a, b) => a.classPos - b.classPos);
    return all;
  });
  const n = () => Math.max(5, Math.min(40, Number(o().rows) || 25));
  const shown = createMemo(() => filtered().slice(0, n()));
  const extraMe = createMemo(() => (o().showMeAlways !== false && me() && !shown().some((r) => r.isMe) ? me() : undefined));
  const leader = () => filtered()[0];
  const posOf = (r: Row) => (o().classFilter === "mine" ? r.classPos : r.pos);

  // Sıra değişimi: satır 3 sn yeşil (kazandı) / kırmızı (kaybetti)
  const prev = new Map<number, number>();
  const [flash, setFlash] = createSignal<Record<number, "up" | "down">>({});
  createEffect(() => {
    if (o().flash === false) return;
    const next: Record<number, "up" | "down"> = {};
    let any = false;
    for (const r of filtered()) {
      const p = prev.get(r.idx);
      const cur = posOf(r);
      if (p && cur && p !== cur) {
        next[r.idx] = cur < p ? "up" : "down";
        any = true;
      }
      prev.set(r.idx, cur);
    }
    if (any) {
      setFlash({ ...flash(), ...next });
      window.setTimeout(() => {
        const f = { ...flash() };
        for (const k of Object.keys(next)) delete f[Number(k)];
        setFlash(f);
      }, 3000);
    }
  });

  const clockVal = () => (o().clock === "remain" ? hms(info().timeRemain) : hms(info().elapsed));
  const track = () => upper(String(o().trackText || "").trim() || info().track || "");
  const scale = () => Math.max(0.6, Math.min(2, (Number(o().scale) || 100) / 100));

  const Line = (p: { r: Row; i: number }) => {
    const nc = () => numberColors(p.r, String(o().numColor || "category"));
    return (
      <div
        class="tvt-row"
        classList={{
          cam: o().highlightCam !== false && p.r.idx === info().camIdx,
          me: p.r.isMe,
          up: flash()[p.r.idx] === "up",
          down: flash()[p.r.idx] === "down",
          pit: p.r.onPit,
        }}
      >
        <span class="tv-pos tvt-pos">{posOf(p.r)}</span>
        <Show when={o().showLogos !== false}>
          <TvLogo carName={p.r.carName} class="tvt-logo" />
        </Show>
        <span class="tvt-name">{tvName(p.r.name, String(o().nameFormat || "last"))}</span>
        <span class="tv-num tvt-num" style={{ background: nc().bg, color: nc().fg }}>
          {p.r.number}
        </span>
        <span class="tvt-gap" classList={{ pit: p.r.onPit }}>
          {lapsSmall(gapMode() === "interval" ? (p.i === 0 ? gapToLeader(p.r, leader(), info().leaderLap) : intervalText(p.r, p.i)) : gapToLeader(p.r, leader(), info().leaderLap))}
        </span>
      </div>
    );
  };

  const visible = useTvVisible({ o, event: () => rows().length > 0, editing: () => !!props.editing, sample });

  return (
    <div class="tv tvt" classList={{ "tv-off": !visible() }} style={{ "--tv-red": String(o().accent || "#d4151d"), zoom: String(scale()) }} data-no-i18n>
      <Show when={o().showHeader !== false}>
        <div class="tvt-head">
          <div class="tvt-title">
            <b>{upper(String(o().title ?? "SRTR PITWALL"))}</b>
            <Show when={String(o().subtitle || "").trim()}>
              <small>{upper(String(o().subtitle))}</small>
            </Show>
          </div>
          <div class="tvt-ses">{sessionLabel(info().session)}</div>
          <div class="tvt-track">
            <span>{track()}</span>
            <Show when={String(o().country || "").trim()}>
              <span class="tvt-flag">
                <Flag code={String(o().country).trim()} />
              </span>
            </Show>
          </div>
        </div>
      </Show>
      <div class="tvt-sub">
        <Show when={o().clock !== "off"}>
          <span class="tvt-clock">{clockVal()}</span>
        </Show>
        <span class="tvt-over">{o().classFilter === "mine" && me() ? upper(me()!.className || "CLASS") : "OVERALL"}</span>
        <span class="tvt-gaph">{gapMode() === "interval" ? "INTERVAL" : "GAP TO\nLEADER"}</span>
      </div>
      <div class="tvt-list">
        <For each={shown()}>{(r, i) => <Line r={r} i={i()} />}</For>
        <Show when={extraMe()}>
          {(m) => (
            <>
              <div class="tvt-sep" />
              <Line r={m()} i={filtered().indexOf(m())} />
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
