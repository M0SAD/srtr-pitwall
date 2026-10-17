import { Index, Show, createEffect, createMemo, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { Flag } from "@/sdk/Flag";
import { TvLogo, numberColors, resultGap, sessionLabel, tvName, upper, isRaceSession, setPodiumDoneAt, setPodiumMounted, podiumDoneAt, useFinishReady, useTvStandings, useTvVisible, withDefaults } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import manifest from "./manifest";
import "./style.css";

// TV Yarış Sonucu: ilk üç araç basamaklar üzerinde (2 - 1 - 3). Tarafsız: oyuncunun kendi bilgisi gösterilmez.

export default function TvPodium(props: OverlayProps) {
  const o = withDefaults(manifest, () => props.options);
  const { rows, info, sample, session } = useTvStandings(() => !!props.editing);

  // İlk üç (genel ya da liderin sınıfı); son dolu üçlü tutulur (veri bir an boş gelirse yanıp sönmesin)
  let last: Row[] = [];
  const top = createMemo<Row[]>(() => {
    const all = rows();
    const l = o().classFilter === "first" && all[0] ? all.filter((r) => r.classId === all[0].classId).sort((a, b) => a.classPos - b.classPos) : all;
    const t = l.slice(0, 3);
    if (t.length) last = t;
    return t.length ? t : last;
  });
  // Basamak sırası: 2 - 1 - 3
  const steps = createMemo(() => {
    const t = top();
    return [t[1], t[0], t[2]].map((r, i) => ({ r, place: [2, 1, 3][i] })).filter((x) => !!x.r) as { r: Row; place: number }[];
  });

  // Podyum ilk N bitirince hemen (ayar: podiumDelay) açılır
  const finishReady = useFinishReady(() => ({ ...o(), openDelay: o().podiumDelay }), rows, () => session()?.state ?? 0, () => isRaceSession(info().session));
  const visible = useTvVisible({
    o,
    event: () => (String(o().show || "auto") === "auto" ? (session()?.state ?? 0) >= 5 && finishReady() : true),
    editing: () => !!props.editing,
    sample,
    once: true,
  });
  const showing = createMemo(() => visible() && top().length > 0);
  // Sonuç tablosu podyum bitince açılsın: kayıt ve "gösterildi → kapandı" bilgisi
  setPodiumMounted((n) => n + 1);
  onCleanup(() => setPodiumMounted((n) => Math.max(0, n - 1)));
  let wasShown = false;
  createEffect(() => {
    const st = session()?.state ?? 0;
    if (st < 5 || props.editing || sample()) {
      wasShown = false;
      if (st < 5 && podiumDoneAt()) setPodiumDoneAt(0);
      return;
    }
    if (showing()) wasShown = true;
    else if (wasShown && !podiumDoneAt()) setPodiumDoneAt(Date.now());
  });

  const title = () => upper(String(o().title || "").trim() || (isRaceSession(info().session) ? "RACE RESULT" : `${sessionLabel(info().session)} RESULT`));
  const sub = () => upper(String(o().subtitle || "").trim() || `${info().track ? info().track + " - " : ""}${sessionLabel(info().session)}`);
  const scale = () => Math.max(0.5, Math.min(2, (Number(o().scale) || 100) / 100));
  const posOf = (r: Row) => (o().classFilter === "first" ? r.classPos : r.pos);
  const gapOf = (r: Row) => {
    const l = top();
    const i = l.indexOf(r);
    const race = isRaceSession(info().session);
    if (i === 0) return race ? "WINNER" : resultGap(r, 0, 0, false);
    return resultGap(r, i, info().leaderLap, race, l[0]);
  };

  return (
    <Show when={showing()}>
      <div class="tv tvp" style={{ "--tv-red": String(o().accent || "#d4151d"), zoom: String(scale()) }} data-no-i18n>
        <div class="tvp-head">
          <b>{title()}</b>
          <small>{sub()}</small>
        </div>
        <div class="tvp-stage">
          <Index each={steps()}>
            {(x) => {
              const r = () => x().r;
              const nc = () => numberColors(r(), String(o().numColor || "category"));
              return (
                <div class={`tvp-col p${x().place}`}>
                  <div class="tvp-card">
                    <div class="tvp-top">
                      <TvLogo carName={r().carName} class="tvp-logo" />
                      <span class="tv-num tvp-num" style={{ background: nc().bg, color: nc().fg }}>
                        {r().number}
                      </span>
                    </div>
                    <b class="tvp-name">{tvName(r().name, String(o().nameFormat || "full"), r().flair)}</b>
                    <Show when={o().showTeam !== false}>
                      <small class="tvp-team">{upper(r().team || r().carName || "")}</small>
                    </Show>
                    <div class="tvp-meta">
                      <Show when={o().showFlag !== false && r().flair}>
                        <span class="tvp-flag">
                          <Flag code={r().flair} />
                        </span>
                      </Show>
                      <Show when={o().showGap !== false}>
                        <span class="tvp-gap">{gapOf(r())}</span>
                      </Show>
                    </div>
                  </div>
                  <div class="tvp-step">
                    <span>{posOf(r())}</span>
                  </div>
                </div>
              );
            }}
          </Index>
        </div>
      </div>
    </Show>
  );
}
