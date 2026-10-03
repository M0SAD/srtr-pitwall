// Fark Grafiği: sınıfta öndeki (ya da lider) ve arkadaki araca olan süre farkı, tur başına bir örnekle.
// Üç özgün tasarım:  stacked → Alt alta iki grafik   list → Sadece sayılar   combined → Tek birleşik grafik (PRO)
// Veri: `gaps` konusu (Rust: timing.rs; çizgi geçişlerindeki fark + anlık fark + pit girişleri) ve `standings`
// (kim önümde / arkamda). Çizim SVG yollarıyla yapılır; yol yazıları değişmedikçe DOM güncellenmez (saniyede 2 paket).

import { For, Match, Show, Switch, createMemo, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import type { Row } from "@/sdk/types";
import { SAMPLE_GAPS, SAMPLE_ROWS, buildPlot, gapText, lastChange, pickRival, seriesOf, trendOf, type Series } from "./gapdata";
import "./style.css";

const DESIGNS = ["stacked", "list", "combined"] as const;
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
/** Bu hızın altındaki değişim "sabit" sayılır (sn/tur) */
const FLAT = 0.03;

interface Side {
  kind: "ahead" | "behind";
  leader: boolean;
  row: Row | undefined;
  s: Series | undefined;
  /** Mesafe olarak yönlendirilmiş değerler: + = rakip kendi tarafında (öndeki önde, arkadaki arkada) */
  vals: (number | null)[];
  live: number | null;
  /** Mesafenin değişimi (sn/tur): − kapanıyor */
  rate: number | null;
  change: number | null;
  color: string;
}

function createModel(props: OverlayProps) {
  const st = useTopic("standings");
  const gp = useTopic("gaps");
  const o = () => props.options;
  const sample = () => props.editing && !(gp()?.cars.length && st()?.rows.some((r) => r.isMe));
  const rows = () => (sample() ? SAMPLE_ROWS : st()?.rows);
  const gaps = () => (sample() ? SAMPLE_GAPS : gp());
  const nLaps = () => clamp(Math.round(num(o().laps, 15)), 5, 40);
  const leaderMode = () => o().aheadRef === "leader";

  const side = (kind: "ahead" | "behind"): Side => {
    const leader = kind === "ahead" && leaderMode();
    const row = pickRival(rows(), kind === "behind" ? "behind" : leader ? "leader" : "ahead");
    const s = seriesOf(gaps(), row?.idx, nLaps());
    const sign = kind === "ahead" ? 1 : -1;
    const vals = s ? s.hist.map((v) => (v == null ? null : v * sign)) : [];
    const live = s?.live != null ? s.live * sign : null;
    const k = clamp(Math.round(num(o().trendLaps, 3)), 1, 10);
    return {
      kind,
      leader,
      row,
      s,
      vals,
      live,
      rate: trendOf(vals, k),
      change: lastChange(vals),
      color: ((kind === "ahead" ? o().colAhead : o().colBehind) as string) || (kind === "ahead" ? "#4aa8ff" : "#ff8a2a"),
    };
  };
  const ahead = createMemo(() => side("ahead"));
  const behind = createMemo(() => side("behind"));
  const race = () => (sample() ? true : !!gaps()?.race);
  const ready = () => !!rows()?.some((r) => r.isMe) && !!gaps();
  return { o, ahead, behind, race, ready, nLaps };
}

type Model = ReturnType<typeof createModel>;

/** Eğilim: mesafe kapanıyor mu açılıyor mu; önde kapanması iyi, arkada kapanması kötü */
function trendInfo(x: Side) {
  const r = x.rate;
  if (r == null) return { arrow: "", cls: "", text: "", rate: "" };
  if (Math.abs(r) < FLAT) return { arrow: "→", cls: "gc-flat", text: t("Sabit"), rate: "0.00" };
  const closing = r < 0;
  const good = x.kind === "ahead" ? closing : !closing;
  const text = x.kind === "ahead" ? (closing ? t("Yaklaşıyorsun") : t("Uzaklaşıyor")) : closing ? t("Yaklaşıyor") : t("Açılıyorsun");
  return { arrow: closing ? "▼" : "▲", cls: good ? "gc-good" : "gc-bad", text, rate: Math.abs(r).toFixed(2) };
}

/** Fark kapanıyorsa kaç turda sıfırlanır */
function catchLaps(x: Side): string {
  const d = x.live ?? x.vals[x.vals.length - 1];
  if (x.rate == null || d == null || x.rate > -FLAT || d <= 0) return "";
  const n = d / -x.rate;
  return n > 99 ? "" : `≈ ${n < 10 ? n.toFixed(1) : n.toFixed(0)} ${t("tur")}`;
}

function Tag(props: { x: Side }) {
  return <span class="gc-tag">{props.x.kind === "behind" ? t("ARKA") : props.x.leader ? t("LİDER") : t("ÖN")}</span>;
}

function emptyText(x: Side) {
  return x.kind === "behind" ? t("Arkanda araç yok") : x.leader ? t("Sınıf liderisin") : t("Önünde araç yok");
}

function Head(props: { m: Model; x: Side }) {
  const x = () => props.x;
  const o = () => props.m.o();
  const tr = () => trendInfo(x());
  return (
    <div class="gc-head" style={{ "--gc-c": x().color }}>
      <Tag x={x()} />
      <Show when={x().row} fallback={<span class="gc-none">{emptyText(x())}</span>}>
        <span class="gc-who">
          <b>P{x().row!.classPos}</b>
          <span class="gc-num">#{x().row!.number}</span>
          <Show when={o().showNames !== false}>
            <span class="gc-name" data-no-i18n>
              {x().row!.name}
            </span>
          </Show>
          <Show when={x().row!.onPit}>
            <i class="ov-tag gc-pit">PIT</i>
          </Show>
        </span>
        <span class="gc-gap">{gapText(x().live ?? x().vals[x().vals.length - 1])}</span>
        <Show when={o().showTrend !== false && tr().arrow}>
          <span class={`gc-trend ${tr().cls}`}>
            {tr().arrow} {tr().rate}
            <small>{t("sn/tur")}</small>
          </span>
        </Show>
        <Show when={o().showCatch !== false && catchLaps(x())}>
          <span class="gc-catch">{catchLaps(x())}</span>
        </Show>
      </Show>
    </div>
  );
}

/** Tek SVG grafik: bir ya da iki seri */
function Chart(props: { m: Model; sides: Side[]; h: number; combined?: boolean }) {
  const o = () => props.m.o();
  const W = () => clamp(num(o().width, 340), 220, 800) - 2;
  const pad = { l: 30, r: 10, t: 8, b: 14 };
  const slots = () => Math.max(1, ...props.sides.map((x) => x.vals.length));
  const plot = createMemo(() =>
    buildPlot(
      // Birleşik grafikte arkadaki araç sıfırın altında çizilir
      props.sides.map((x) => {
        const k = props.combined && x.kind === "behind" ? -1 : 1;
        return { vals: x.vals.map((v) => (v == null ? null : v * k)), live: x.live == null ? null : x.live * k };
      }),
      slots(),
      W(),
      props.h,
      pad,
      !!props.combined,
    ),
  );
  const lw = () => clamp(num(o().lineWidth, 2), 1, 5);
  /** Pit çizgileri: tek yol yazısı */
  const pitPath = (idxs: number[] | undefined) => {
    if (!idxs?.length || o().showPits === false) return "";
    const p = plot();
    return idxs.map((i) => `M${p.x(Math.min(i, slots())).toFixed(1)} ${pad.t}V${props.h - pad.b}`).join("");
  };
  const laps = () => props.sides.find((x) => x.s?.laps.length)?.s?.laps ?? [];
  const label = (v: number) => (Math.abs(v) >= 10 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1));
  return (
    <svg class="gc-svg" width={W()} height={props.h} viewBox={`0 0 ${W()} ${props.h}`} aria-hidden="true">
      <path class="gc-grid" d={`M${pad.l} ${pad.t}H${W() - pad.r}M${pad.l} ${props.h - pad.b}H${W() - pad.r}`} />
      <Show when={plot().zeroY != null}>
        <path class="gc-zero" d={`M${pad.l} ${plot().zeroY!.toFixed(1)}H${W() - pad.r}`} />
      </Show>
      <text class="gc-ax" x={pad.l - 4} y={pad.t + 4} text-anchor="end">
        {label(plot().hi)}
      </text>
      <text class="gc-ax" x={pad.l - 4} y={props.h - pad.b} text-anchor="end">
        {label(plot().lo)}
      </text>
      <Show when={laps().length > 1}>
        <text class="gc-ax" x={pad.l} y={props.h - 2} text-anchor="start">
          {t("T")}
          {laps()[0]}
        </text>
        <text class="gc-ax" x={plot().x(laps().length - 1)} y={props.h - 2} text-anchor="middle">
          {t("T")}
          {laps()[laps().length - 1]}
        </text>
      </Show>
      <path class="gc-mypit" d={pitPath(props.sides[0]?.s?.myPits ?? props.sides[1]?.s?.myPits)} />
      <For each={[0, 1]}>
        {(i) => (
          <Show when={props.sides[i]}>
            <g style={{ "--gc-c": props.sides[i].color }}>
              <path class="gc-pitline" d={pitPath(props.sides[i].s?.pits)} />
              <path class="gc-line" d={plot().lines[i]?.d ?? ""} stroke-width={lw()} />
              <path class="gc-live" d={plot().lines[i]?.live ?? ""} stroke-width={lw()} />
              <path class="gc-dots" d={plot().lines[i]?.dots ?? ""} />
            </g>
          </Show>
        )}
      </For>
    </svg>
  );
}

function ListRow(props: { m: Model; x: Side }) {
  const x = () => props.x;
  const o = () => props.m.o();
  const tr = () => trendInfo(x());
  const ch = () => x().change;
  return (
    <div class="gc-lrow" style={{ "--gc-c": x().color }}>
      <Tag x={x()} />
      <Show when={x().row} fallback={<span class="gc-none">{emptyText(x())}</span>}>
        <span class="gc-who">
          <b>P{x().row!.classPos}</b>
          <span class="gc-num">#{x().row!.number}</span>
          <Show when={o().showNames !== false}>
            <span class="gc-name" data-no-i18n>
              {x().row!.name}
            </span>
          </Show>
        </span>
        <span class="gc-gap">{gapText(x().live ?? x().vals[x().vals.length - 1])}</span>
        <span class="gc-chg" classList={{ "gc-good": ch() != null && (x().kind === "ahead" ? ch()! < -FLAT : ch()! > FLAT), "gc-bad": ch() != null && (x().kind === "ahead" ? ch()! > FLAT : ch()! < -FLAT) }}>
          {ch() == null ? "—" : `${ch()! > 0 ? "+" : "−"}${Math.abs(ch()!).toFixed(2)}`}
        </span>
        <Show when={o().showTrend !== false}>
          <span class={`gc-trend ${tr().cls}`}>
            <Show when={tr().arrow} fallback="—">
              {tr().arrow} {tr().rate}
              <small>{t("sn/tur")}</small>
            </Show>
          </span>
        </Show>
        <Show when={o().showTrend !== false || o().showCatch !== false}>
          <span class={`gc-note ${tr().cls}`}>{(o().showCatch !== false && catchLaps(x())) || tr().text}</span>
        </Show>
      </Show>
    </div>
  );
}

export default function GapChart(props: OverlayProps) {
  const m = createModel(props);
  const o = () => props.options;
  const design = (): Design => {
    const v = o().design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("gapchart", "design", v) ? v : "stacked";
  };
  const showA = () => o().showAhead !== false;
  const showB = () => o().showBehind !== false;
  const sides = () => [...(showA() ? [m.ahead()] : []), ...(showB() ? [m.behind()] : [])];
  const visible = () => {
    if (props.editing) return true;
    if (!m.ready()) return false;
    return !(o().raceOnly && !m.race());
  };
  const h = () => clamp(num(o().chartHeight, 70), 40, 240);
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 13), 10, 24)}px`,
    width: `${clamp(num(o().width, 340), 220, 800)}px`,
  });
  return (
    <Show when={visible()}>
      <div class={`gc gc-d-${design()} ov-panel`} style={style()}>
        <div class="ov-header">
          <span>Fark grafiği</span>
          <span>
            Son <b>{m.nLaps()}</b> tur
          </span>
        </div>
        <Switch>
          <Match when={design() === "stacked"}>
            <Show when={showA()}>
              <div class="gc-block">
                <Head m={m} x={m.ahead()} />
                <Chart m={m} sides={[m.ahead()]} h={h()} />
              </div>
            </Show>
            <Show when={showB()}>
              <div class="gc-block">
                <Head m={m} x={m.behind()} />
                <Chart m={m} sides={[m.behind()]} h={h()} />
              </div>
            </Show>
          </Match>
          <Match when={design() === "combined"}>
            <div class="gc-block">
              <Show when={showA()}>
                <Head m={m} x={m.ahead()} />
              </Show>
              <Show when={showB()}>
                <Head m={m} x={m.behind()} />
              </Show>
              <Chart m={m} sides={sides()} h={h() * 2} combined />
            </div>
          </Match>
          <Match when={design() === "list"}>
            <div class="gc-list">
              <div class="gc-lrow gc-lhead">
                <span />
                <span />
                <span>Fark</span>
                <span>Son tur</span>
                <Show when={o().showTrend !== false}>
                  <span>Eğilim</span>
                </Show>
                <Show when={o().showTrend !== false || o().showCatch !== false}>
                  <span />
                </Show>
              </div>
              <Show when={showA()}>
                <ListRow m={m} x={m.ahead()} />
              </Show>
              <Show when={showB()}>
                <ListRow m={m} x={m.behind()} />
              </Show>
            </div>
          </Match>
        </Switch>
      </div>
    </Show>
  );
}
