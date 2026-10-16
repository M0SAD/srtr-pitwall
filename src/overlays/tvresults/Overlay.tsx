import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { previewFrozen } from "@/sdk/overlay";
import { lapTime } from "@/sdk/format";
import { TvLogo, numberColors, resultGap, sessionLabel, upper, useTvStandings, useTvVisible } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import "./style.css";

// TV Sonuç Tablosu: yarış sonunda gösterilen büyük tablo (sayfa sayfa döner).

const SAMPLE_CO: Record<string, string[]> = {
  "64": ["J. HOFF", "R. KANE"],
  "48": ["L. AUER", "J. STOLZ"],
  "2": ["A. LEFEVRE", "M. BOUTS"],
};

export default function TvResults(props: OverlayProps) {
  const o = () => props.options;
  const { rows, info, sample, session } = useTvStandings(() => !!props.editing);

  // Aracı süren herkes (takım yarışında sürücü değişir): araç numarası → sürücü adları (ilk görülme sırasıyla)
  const seen = new Map<string, string[]>();
  const [drv, setDrv] = createSignal(0);
  createEffect(() => {
    let changed = false;
    for (const r of rows()) {
      const key = r.number || String(r.idx);
      const short = initial(r.name);
      const l = seen.get(key) ?? [];
      if (short && !l.includes(short)) {
        l.push(short);
        seen.set(key, l);
        changed = true;
      }
    }
    if (changed) setDrv(drv() + 1);
  });
  const driversOf = (r: Row) => {
    drv();
    const l = [...(seen.get(r.number || String(r.idx)) ?? [initial(r.name)])];
    if (sample()) l.push(...(SAMPLE_CO[r.number] ?? []));
    return l.slice(0, Math.max(1, Math.min(3, Number(o().drivers) || 3)));
  };

  const me = createMemo(() => rows().find((r) => r.isMe));
  const list = createMemo(() => {
    const all = rows();
    if (o().classFilter === "mine" && me()) return all.filter((r) => r.classId === me()!.classId).sort((a, b) => a.classPos - b.classPos);
    return all;
  });
  const per = () => Math.max(5, Math.min(30, Number(o().perPage) || 20));
  const pages = () => Math.max(1, Math.ceil(list().length / per()));
  const [page, setPage] = createSignal(0);
  let timer = 0;
  const restart = () => {
    clearInterval(timer);
    timer = window.setInterval(() => {
      if (!previewFrozen()) setPage((p) => (p + 1) % pages());
    }, Math.max(3, Number(o().pageSecs) || 10) * 1000);
  };
  createEffect(() => {
    pages();
    o().pageSecs;
    restart();
  });
  onCleanup(() => clearInterval(timer));
  const shown = createMemo(() => {
    const p = Math.min(page(), pages() - 1);
    return list().slice(p * per(), p * per() + per());
  });

  // Görünürlük: damalı bayraktan sonra (session.state 5/6) ya da her zaman
  // Eski ayar: when = "always" → show = "always"
  const opts = () => (o().show === undefined && o().when === "always" ? { ...o(), show: "always" } : o());
  const visible = useTvVisible({
    o: opts,
    event: () => (String(opts().show || "auto") === "auto" ? (session()?.state ?? 0) >= 5 : true),
    editing: () => !!props.editing,
    sample,
  });

  const title = () => upper(String(o().title || "").trim() || String(o().trackText || "").trim() || info().track || "RESULTS");
  const sub = () => `${upper(String(o().trackText || "").trim() || info().track || "")} - ${sessionLabel(info().session)}`.replace(/^ - /, "");
  const scale = () => Math.max(0.5, Math.min(2, (Number(o().scale) || 100) / 100));
  const posOf = (r: Row) => (o().classFilter === "mine" ? r.classPos : r.pos);
  const nDrivers = () => Math.max(1, Math.min(3, Number(o().drivers) || 3));
  const cols = () =>
    [
      "38px",
      o().showLogos !== false ? "38px" : "",
      o().showTeam !== false ? "minmax(0, 1.45fr)" : "",
      `minmax(0, ${nDrivers()}fr)`,
      "40px",
      o().showBest ? "86px" : "",
      "108px",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <Show when={visible() && list().length}>
      <div
        class="tv tvr"
        style={{ "--tv-red": String(o().accent || "#d4151d"), "--tv-line": String(o().lineColor || "#f07a12"), "--nd": String(nDrivers()), "--tvr-cols": cols(), zoom: String(scale()) }}
        classList={{ "no-team": o().showTeam === false, "with-best": !!o().showBest, "no-logo": o().showLogos === false }}
        data-no-i18n
      >
        <div class="tvr-head">
          <b>{title()}</b>
          <small>{sub()}</small>
        </div>
        <div class="tvr-list">
          <For each={shown()}>
            {(r) => {
              const nc = () => numberColors(r, String(o().numColor || "category"));
              const i = () => list().indexOf(r);
              return (
                <div class="tvr-row" classList={{ me: r.isMe }}>
                  <span class="tv-pos tvr-pos">{posOf(r)}</span>
                  <Show when={o().showLogos !== false}>
                    <TvLogo carName={r.carName} class="tvr-logo" />
                  </Show>
                  <Show when={o().showTeam !== false}>
                    <span class="tvr-team" classList={{ long: (r.team || r.carName || "").length > 22, xlong: (r.team || r.carName || "").length > 28 }}>
                      {upper(r.team || r.carName || "")}
                    </span>
                  </Show>
                  <span class="tvr-drivers">
                    <For each={driversOf(r)}>{(d) => <span>{d}</span>}</For>
                  </span>
                  <span class="tv-num tvr-num" style={{ background: nc().bg, color: nc().fg }}>
                    {r.number}
                  </span>
                  <Show when={o().showBest}>
                    <span class="tvr-best" classList={{ purple: r.classBest }}>
                      {r.best > 0 ? lapTime(r.best) : "—"}
                    </span>
                  </Show>
                  <span class="tvr-gap">{resultGap(r, i(), info().leaderLap)}</span>
                </div>
              );
            }}
          </For>
        </div>
        <Show when={pages() > 1}>
          <div class="tvr-pages">
            <For each={Array.from({ length: pages() }, (_, k) => k)}>{(k) => <i classList={{ on: k === Math.min(page(), pages() - 1) }} />}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/** "Lukas Brenner" → "L. BRENNER" */
function initial(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^\d+$/.test(p));
  if (!parts.length) return "";
  if (parts.length < 2) return parts[0].toUpperCase();
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`.toUpperCase();
}
