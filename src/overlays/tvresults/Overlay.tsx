import { For, Index, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { previewFrozen } from "@/sdk/overlay";
import { lapTime } from "@/sdk/format";
import { TvLogo, tvName, numberColors, resultGap, sessionLabel, upper, isRaceSession, podiumDoneAt, podiumMounted, useFinishReady, useTvStandings, useTvVisible, withDefaults } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import manifest from "./manifest";
import "./style.css";

// TV Sonuç Tablosu: yarış sonunda gösterilen büyük tablo (sayfa sayfa döner).

const SAMPLE_CO: Record<string, string[]> = {
  "64": ["J. HOFF", "R. KANE"],
  "48": ["L. AUER", "J. STOLZ"],
  "2": ["A. LEFEVRE", "M. BOUTS"],
};

export default function TvResults(props: OverlayProps) {
  const o = withDefaults(manifest, () => props.options);
  const { rows, info, sample, session } = useTvStandings(() => !!props.editing);

  // Aracı süren herkes (takım yarışında sürücü değişir): araç numarası → sürücü adları (ilk görülme sırasıyla)
  const seen = new Map<string, string[]>();
  const [drv, setDrv] = createSignal(0);
  createEffect(() => {
    let changed = false;
    for (const r of rows()) {
      const key = r.number || String(r.idx);
      const short = r.name.trim();
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
    const l = [...(seen.get(r.number || String(r.idx)) ?? [r.name.trim()])];
    if (sample()) l.push(...(SAMPLE_CO[r.number] ?? []));
    const fmt = String(o().nameFormat || "initial");
    return l.slice(0, Math.max(1, Math.min(3, Number(o().drivers) || 3))).map((n) => (fmt === "initial" ? initial(n) : tvName(n, fmt)));
  };

  const me = createMemo(() => rows().find((r) => r.isMe));
  // Son dolu liste tutulur: yarış sonunda sıralama verisi bir an boş gelirse (araçlar sunucudan çıkarken) tablo
  // kapanıp yeniden açılmasın (yanıp sönme)
  let lastList: Row[] = [];
  const list = createMemo(() => {
    const all = rows();
    const l = o().classFilter === "mine" && me() ? all.filter((r) => r.classId === me()!.classId).sort((a, b) => a.classPos - b.classPos) : all;
    if (l.length) lastList = l;
    return l.length ? l : lastList;
  });
  const per = () => Math.max(5, Math.min(30, Number(o().perPage) || 20));
  const pages = createMemo(() => Math.max(1, Math.ceil(list().length / per())));
  const pageMs = createMemo(() => Math.max(3, Number(o().pageSecs) || 10) * 1000);
  // Sayfa çevirme: zamanlayıcı yalnızca sayfa sayısı ya da süre değişince yeniden kurulur
  // (eskiden her veri güncellemesinde baştan kuruluyor, sayfa hiç dönmüyordu)
  const [page, setPage] = createSignal(0);
  createEffect(
    on([pages, pageMs], ([n, ms]) => {
      if (page() >= n) setPage(0);
      if (n <= 1) return;
      const timer = window.setInterval(() => {
        if (!previewFrozen()) setPage((p) => (p + 1) % pages());
      }, ms);
      onCleanup(() => clearInterval(timer));
    }),
  );
  const shown = createMemo(() => {
    const p = Math.min(page(), pages() - 1);
    return list().slice(p * per(), p * per() + per());
  });

  // Görünürlük: damalı bayraktan sonra (session.state 5/6) ya da her zaman
  // Eski ayar: when = "always" → show = "always"
  const opts = () => (props.options?.show === undefined && o().when === "always" ? { ...o(), show: "always" } : o());
  const finishReady = useFinishReady(o, rows, () => session()?.state ?? 0, () => isRaceSession(info().session));
  // TV Yarış Sonucu (podyum) bu pencerede açıksa önce o gösterilir; sonuç tablosu podyum kapanınca açılır
  const afterPodium = () => o().afterPodium !== false && podiumMounted() > 0 && isRaceSession(info().session);
  const visible = useTvVisible({
    o: opts,
    event: () =>
      String(opts().show || "auto") === "auto"
        ? (session()?.state ?? 0) >= 5 && (afterPodium() ? podiumDoneAt() > 0 && Date.now() - podiumDoneAt() >= 1000 && finishReady() : finishReady())
        : true,
    editing: () => !!props.editing,
    sample,
    once: true,
  });

  const showing = createMemo(() => visible() && list().length > 0);

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

  // Satırlar Index ile: her veri güncellemesinde (2 Hz) satır yeniden kurulup giriş animasyonu baştan oynamasın
  function ResRow(p: { r: Row }) {
              const nc = () => numberColors(p.r, String(o().numColor || "category"));
              const i = () => list().indexOf(p.r);
              return (
                <div class="tvr-row" classList={{ me: p.r.isMe && o().highlightMe === true }}>
                  <span class="tv-pos tvr-pos">{posOf(p.r)}</span>
                  <Show when={o().showLogos !== false}>
                    <TvLogo carName={p.r.carName} class="tvr-logo" />
                  </Show>
                  <Show when={o().showTeam !== false}>
                    <span class="tvr-team" classList={{ long: (p.r.team || p.r.carName || "").length > 22, xlong: (p.r.team || p.r.carName || "").length > 28 }}>
                      {upper(p.r.team || p.r.carName || "")}
                    </span>
                  </Show>
                  <span class="tvr-drivers">
                    <For each={driversOf(p.r)}>{(d) => <span>{d}</span>}</For>
                  </span>
                  <span class="tv-num tvr-num" style={{ background: nc().bg, color: nc().fg }}>
                    {p.r.number}
                  </span>
                  <Show when={o().showBest}>
                    <span class="tvr-best" classList={{ purple: p.r.classBest }}>
                      {p.r.best > 0 ? lapTime(p.r.best) : "—"}
                    </span>
                  </Show>
                  <span class="tvr-gap">{resultGap(p.r, i(), info().leaderLap, isRaceSession(info().session), list()[0])}</span>
                </div>
              );
            }

  return (
    <Show when={showing()}>
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
          <Index each={shown()}>{(r) => <ResRow r={r()} />}</Index>
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
