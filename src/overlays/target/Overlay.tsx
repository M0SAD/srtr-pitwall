// Rakip Takibi: seçilen TEK rakibin özeti (sıra, fark ve değişimi, tur süreleri, pit, lastik, iRating / lisans)
// ve farkın mini grafiği. İki özgün tasarım:  card → Kart   strip → Kompakt şerit
// Veri: `standings` (rakibin satırı) + `gaps` (tur bazlı fark geçmişi; Rust: timing.rs).

import { Match, Show, Switch, createMemo, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import { irating, lapTime } from "@/sdk/format";
import { TireBadge } from "@/sdk/TireBadge";
import { LicenseBadge } from "@/sdk/LicenseBadge";
import type { Row } from "@/sdk/types";
import { SAMPLE_GAPS, SAMPLE_ROWS, buildPlot, gapText, lastChange, pickRival, seriesOf, type RivalMode } from "../gapchart/gapdata";
import { TARGET_DEFAULT_FIELDS } from "./manifest";
import "./style.css";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const MODES: RivalMode[] = ["ahead", "behind", "leader", "fixed", "friend"];
const FLAT = 0.03;

function createModel(props: OverlayProps) {
  const st = useTopic("standings");
  const gp = useTopic("gaps");
  const o = () => props.options;
  const sample = () => props.editing && !(gp()?.cars.length && st()?.rows.some((r) => r.isMe));
  const rows = () => (sample() ? SAMPLE_ROWS : st()?.rows);
  const gaps = () => (sample() ? SAMPLE_GAPS : gp());
  const mode = (): RivalMode => (MODES.includes(o().mode as RivalMode) ? (o().mode as RivalMode) : "ahead");
  const fields = createMemo(() => new Set<string>(Array.isArray(o().fields) ? (o().fields as string[]) : TARGET_DEFAULT_FIELDS));
  const has = (f: string) => fields().has(f);

  const me = createMemo(() => rows()?.find((r) => r.isMe));
  /** Seçilen rakip; bulunamazsa yedek seçim. `sub`: yedeğe düşüldü */
  const pick = createMemo<{ row: Row | undefined; sub: boolean }>(() => {
    const r = pickRival(rows(), mode(), String(o().query ?? ""));
    if (r) return { row: r, sub: false };
    const fb = o().fallback;
    if (fb === "hide") return { row: undefined, sub: false };
    const first: RivalMode = fb === "behind" ? "behind" : "ahead";
    const alt = pickRival(rows(), first) ?? pickRival(rows(), first === "ahead" ? "behind" : "ahead");
    return { row: alt, sub: !!alt && mode() !== first };
  });
  const row = () => pick().row;
  const series = createMemo(() => seriesOf(gaps(), row()?.idx, clamp(Math.round(num(o().sparkLaps, 12)), 5, 30)));
  /** Fark (sn): + rakip önümde, − arkamda */
  const gap = () => {
    const s = series();
    if (!s) return null;
    if (s.live != null) return s.live;
    for (let i = s.hist.length - 1; i >= 0; i--) if (s.hist[i] != null) return s.hist[i];
    return null;
  };
  const ahead = () => (gap() ?? 0) >= 0;
  /** Son turda aradaki mesafe ne kadar değişti (− kapandı) */
  const change = createMemo(() => {
    const s = series();
    if (!s) return null;
    const k = ahead() ? 1 : -1;
    return lastChange(s.hist.map((v) => (v == null ? null : v * k)));
  });
  /** Mesafenin kapanması: öndeki rakipte iyi, arkadakinde kötü */
  const changeClass = () => {
    const c = change();
    if (c == null || Math.abs(c) < FLAT) return "";
    return (c < 0) === ahead() ? "tg-good" : "tg-bad";
  };
  const race = () => (sample() ? true : !!gaps()?.race);
  const modeLabel = () => {
    if (pick().sub) return ahead() ? t("ÖNDEKİ") : t("ARKADAKİ");
    switch (mode()) {
      case "behind":
        return t("ARKADAKİ");
      case "leader":
        return t("LİDER");
      case "fixed":
        return t("HEDEF");
      case "friend":
        return t("ARKADAŞ");
      default:
        return t("ÖNDEKİ");
    }
  };
  return { o, has, me, row, series, gap, ahead, change, changeClass, race, modeLabel, rows };
}

type Model = ReturnType<typeof createModel>;

/** Rakibin turu benimkine göre: + ben daha hızlıyım */
function LapCmp(props: { label: string; his: number; mine: number }) {
  const d = () => (props.his > 0 && props.mine > 0 ? props.his - props.mine : null);
  return (
    <div class="tg-kv">
      <i>{props.label}</i>
      <b>{lapTime(props.his)}</b>
      <Show when={d() != null}>
        <span class={d()! > 0.0005 ? "tg-good" : d()! < -0.0005 ? "tg-bad" : "ov-dim"}>
          {d()! > 0 ? "+" : "−"}
          {Math.abs(d()!).toFixed(3)}
        </span>
      </Show>
    </div>
  );
}

function Spark(props: { m: Model; w: number; h: number }) {
  const plot = createMemo(() => {
    const s = props.m.series();
    const vals = s?.hist ?? [];
    return buildPlot([{ vals, live: s?.live ?? null }], Math.max(1, vals.length), props.w, props.h, { l: 3, r: 4, t: 4, b: 4 }, false);
  });
  const pits = () => {
    const s = props.m.series();
    if (!s?.pits.length) return "";
    return s.pits.map((i) => `M${plot().x(Math.min(i, Math.max(1, s.hist.length))).toFixed(1)} 2V${props.h - 2}`).join("");
  };
  return (
    <svg class="tg-spark" width={props.w} height={props.h} viewBox={`0 0 ${props.w} ${props.h}`} aria-hidden="true">
      <Show when={plot().zeroY != null}>
        <path class="tg-zero" d={`M0 ${plot().zeroY!.toFixed(1)}H${props.w}`} />
      </Show>
      <path class="tg-pitline" d={pits()} />
      <path class="tg-line" d={plot().lines[0].d} />
      <path class="tg-live" d={plot().lines[0].live} />
      <path class="tg-dots" d={plot().lines[0].dots} />
    </svg>
  );
}

function Gap(props: { m: Model }) {
  const m = props.m;
  return (
    <span class="tg-gap">
      <small>{m.gap() == null ? "" : m.ahead() ? "+" : "−"}</small>
      {gapText(m.gap())}
    </span>
  );
}

function Change(props: { m: Model }) {
  const m = props.m;
  const c = () => m.change();
  return (
    <Show when={c() != null}>
      <span class={`tg-change ${m.changeClass()}`}>
        {Math.abs(c()!) < FLAT ? "→" : c()! < 0 ? "▼" : "▲"} {Math.abs(c()!).toFixed(2)}
      </span>
    </Show>
  );
}

function PitInfo(props: { r: Row; short?: boolean }) {
  const r = () => props.r;
  return (
    <Switch>
      <Match when={r().onPit}>
        <i class="ov-tag tg-pit">{t("PİTTE")}</i>
      </Match>
      <Match when={r().pitState === "OUT"}>
        <i class="ov-tag tg-out">OUT</i>
      </Match>
      <Match when={r().pits > 0}>
        <span class="tg-pitago">{props.short ? `P−${r().stint}` : t("Pit {0} tur önce", r().stint)}</span>
      </Match>
      <Match when={!props.short}>
        <span class="tg-pitago ov-dim">{t("Pit yapmadı")}</span>
      </Match>
    </Switch>
  );
}

function Card(props: { m: Model; w: number }) {
  const m = props.m;
  const r = () => m.row()!;
  return (
    <>
      <div class="tg-top">
        <span class="tg-stripe" style={{ background: r().classColor || "var(--tg-accent)" }} />
        <Show when={m.has("pos")}>
          <b class="tg-pos">P{r().classPos}</b>
        </Show>
        <Show when={m.has("num")}>
          <span class="tg-num">#{r().number}</span>
        </Show>
        <span class="tg-name" data-no-i18n>
          {r().name}
        </span>
        <Show when={m.has("tire")}>
          <TireBadge kind={r().tireKind} />
        </Show>
      </div>
      <div class="tg-mid">
        <Show when={m.has("gap")}>
          <div class="tg-gapbox">
            <Gap m={m} />
            <Show when={m.has("change")}>
              <Change m={m} />
            </Show>
          </div>
        </Show>
        <Show when={m.has("spark")}>
          <Spark m={m} w={Math.max(60, Math.round(props.w * 0.42))} h={38} />
        </Show>
      </div>
      <div class="tg-grid">
        <Show when={m.has("last")}>
          <LapCmp label={t("Son")} his={r().last} mine={m.me()?.last ?? 0} />
        </Show>
        <Show when={m.has("best")}>
          <LapCmp label={t("En iyi")} his={r().best} mine={m.me()?.best ?? 0} />
        </Show>
      </div>
      <div class="tg-foot">
        <Show when={m.has("pit")}>
          <PitInfo r={r()} />
        </Show>
        <span class="tg-spacer" />
        <Show when={m.has("license") && r().licLetter}>
          <LicenseBadge letter={r().licLetter} sr={r().sr} color={r().licColor} />
        </Show>
        <Show when={m.has("irating") && r().irating > 0}>
          <span class="tg-ir">{irating(r().irating)}</span>
        </Show>
      </div>
    </>
  );
}

function Strip(props: { m: Model }) {
  const m = props.m;
  const r = () => m.row()!;
  return (
    <div class="tg-strip">
      <span class="tg-stripe" style={{ background: r().classColor || "var(--tg-accent)" }} />
      <Show when={m.has("pos")}>
        <b class="tg-pos">P{r().classPos}</b>
      </Show>
      <Show when={m.has("num")}>
        <span class="tg-num">#{r().number}</span>
      </Show>
      <span class="tg-name" data-no-i18n>
        {r().name}
      </span>
      <Show when={m.has("tire")}>
        <TireBadge kind={r().tireKind} />
      </Show>
      <Show when={m.has("pit")}>
        <PitInfo r={r()} short />
      </Show>
      <Show when={m.has("last")}>
        <span class="tg-last">{lapTime(r().last)}</span>
      </Show>
      <Show when={m.has("spark")}>
        <Spark m={m} w={64} h={22} />
      </Show>
      <Show when={m.has("gap")}>
        <Gap m={m} />
      </Show>
      <Show when={m.has("change")}>
        <Change m={m} />
      </Show>
    </div>
  );
}

export default function Target(props: OverlayProps) {
  const m = createModel(props);
  const o = () => props.options;
  const design = () => (o().design === "strip" ? "strip" : "card");
  const width = () => clamp(num(o().width, 300), 200, 700);
  const visible = () => {
    if (props.editing || demoShow()) return true;
    if (!m.rows()?.some((r) => r.isMe)) return false;
    if (o().raceOnly && !m.race()) return false;
    return !!m.row();
  };
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 14), 10, 26)}px`,
    width: `${width()}px`,
    "--tg-accent": (o().accent as string) || "#ff8a2a",
  });
  return (
    <Show when={visible()}>
      <div class={`tg tg-d-${design()} ov-panel`} style={style()}>
        <Show when={design() === "card"}>
          <div class="ov-header">
            <span>Rakip takibi</span>
            <span class="tg-mode">{m.modeLabel()}</span>
          </div>
        </Show>
        <Show when={m.row()} fallback={<div class="ov-empty">Rakip bulunamadı</div>}>
          <Show when={design() === "card"} fallback={<Strip m={m} />}>
            <div class="tg-body">
              <Card m={m} w={width()} />
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
