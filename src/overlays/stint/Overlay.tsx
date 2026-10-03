// Stint Özeti: süren stint + önceki stint'ler. Veri `strategy` konusundan (Rust: strategy.rs) gelir;
// stint'ler pit çıkışından pit çıkışına sayılır, ortalamalar pit giriş / çıkış turları hariç temiz turlardan hesaplanır.

import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { clock, fuel as fuelFmt, fuelUnit, lapTime } from "@/sdk/format";
import { t } from "@/sdk/i18n";
import type { StratStint } from "@/sdk/types";
import { STRATEGY_SAMPLE } from "@/sdk/strategySample";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Bu eğimin altı "sabit" sayılır (sn/tur) */
const FLAT = 0.015;

export default function Stint(props: OverlayProps) {
  const live = useTopic("strategy");
  const o = () => props.options;
  const data = createMemo(() => live() ?? (props.editing ? STRATEGY_SAMPLE : undefined));
  const design = () => (o().design === "table" ? "table" : "compact");
  const stints = () => data()?.stints ?? [];
  const cur = createMemo<StratStint | undefined>(() => stints()[stints().length - 1]);
  const prev = createMemo<StratStint | undefined>(() => {
    const l = stints();
    // Karşılaştırma: tur atılmış bir önceki stint
    for (let i = l.length - 2; i >= 0; i--) if (l[i].laps > 0) return l[i];
    return undefined;
  });
  const inPit = () => !!data()?.onPitRoad;
  const visible = () => !!data() && (props.editing || !(o().hidePits && inPit()));

  const trendDir = (s: StratStint) => (!s.trendOk ? "none" : s.trend > FLAT ? "slower" : s.trend < -FLAT ? "faster" : "flat");
  const trendArrow = (s: StratStint) => ({ slower: "↗", faster: "↘", flat: "→", none: "·" })[trendDir(s)];
  const trendText = (s: StratStint) => (s.trendOk ? `${s.trend > 0 ? "+" : "−"}${Math.abs(s.trend).toFixed(2)}` : "—");
  const fuelText = (v: number) => (v > 0 ? fuelFmt(v, props.units, 2) : "—");
  const tyreText = (s: StratStint) => `${s.tyreKnown ? "" : "~"}${s.tyreLaps}`;
  const diff = (a: number, b: number, digits = 2) => {
    if (!(a > 0) || !(b > 0)) return null;
    const d = a - b;
    return { text: `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(digits)}`, cls: d > 0.005 ? "ov-neg" : d < -0.005 ? "ov-pos" : "ov-dim" };
  };

  /** Tur süresi çizgisi (temiz turlar) */
  const Spark = (p: { s: StratStint }) => {
    const path = createMemo(() => {
      const v = p.s.lapTimes;
      if (v.length < 2) return null;
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      const span = Math.max(0.3, hi - lo);
      const pts = v.map((y, i) => [(i / (v.length - 1)) * 100, 22 - ((y - lo) / span) * 20] as const);
      const bi = v.indexOf(lo);
      return { d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "), best: pts[bi], last: pts[pts.length - 1] };
    });
    return (
      <Show when={path()}>
        <svg class="sti-spark" viewBox="-2 0 104 24" preserveAspectRatio="none" aria-hidden="true">
          <path d={path()!.d} />
          <circle class="sti-spark-best" cx={path()!.best[0]} cy={path()!.best[1]} r="1.6" />
          <circle class="sti-spark-last" cx={path()!.last[0]} cy={path()!.last[1]} r="1.6" />
        </svg>
      </Show>
    );
  };

  const Compact = () => (
    <Show when={cur()} fallback={<div class="ov-empty">Stint verisi bekleniyor</div>}>
      {(s) => (
        <>
          <div class="ov-header sti-head">
            <span>
              <span>Stint</span> <b data-no-i18n>{s().n}</b>
              <Show when={inPit()}>
                <i class="sti-pit">PİT</i>
              </Show>
            </span>
            <span class="sti-head-r">
              <b data-no-i18n>{s().laps}</b> <span>tur</span>
              <Show when={o().showTime !== false}>
                <b class="sti-time" data-no-i18n>
                  {clock(s().time)}
                </b>
              </Show>
            </span>
          </div>
          <div class="sti-grid">
            <Show when={o().showAvg !== false}>
              <div class="sti-cell">
                <span class="sti-k">ORTALAMA</span>
                <b data-no-i18n>{lapTime(s().avg)}</b>
              </div>
            </Show>
            <Show when={o().showBest !== false}>
              <div class="sti-cell">
                <span class="sti-k">EN İYİ</span>
                <b class="sti-best" data-no-i18n>
                  {lapTime(s().best)}
                </b>
              </div>
            </Show>
            <Show when={o().showTrend !== false}>
              <div class={`sti-cell sti-trend sti-${trendDir(s())}`} title={t("Tempo eğilimi (saniye / tur)")}>
                <span class="sti-k">{trendDir(s()) === "slower" ? "YAVAŞLIYOR" : trendDir(s()) === "faster" ? "HIZLANIYOR" : trendDir(s()) === "flat" ? "SABİT" : "EĞİLİM"}</span>
                <b data-no-i18n>
                  <em>{trendArrow(s())}</em>
                  {trendText(s())}
                </b>
              </div>
            </Show>
            <Show when={o().showTyre !== false}>
              <div class="sti-cell">
                <span class="sti-k">LASTİK</span>
                <b>
                  <span data-no-i18n>{tyreText(s())}</span> <i>tur</i>
                </b>
              </div>
            </Show>
            <Show when={o().showFuel !== false}>
              <div class="sti-cell">
                <span class="sti-k">YAKIT / TUR</span>
                <b data-no-i18n>
                  {fuelText(s().fuelAvg)}
                  <Show when={s().fuelAvg > 0}>
                    <i> {fuelUnit(props.units)}</i>
                  </Show>
                </b>
              </div>
            </Show>
          </div>
          <Show when={o().showSpark !== false && s().lapTimes.length >= 2}>
            <Spark s={s()} />
          </Show>
          <Show when={o().showCompare !== false && prev()}>
            {(p) => (
              <div class="sti-cmp">
                <span class="sti-k">ÖNCEKİ STINT</span>
                <span class="sti-cmp-i">
                  <span>ort</span> <b data-no-i18n>{lapTime(p().avg)}</b>
                  <Show when={diff(s().avg, p().avg)}>{(d) => <em class={d().cls} data-no-i18n>{d().text}</em>}</Show>
                </span>
                <span class="sti-cmp-i">
                  <b data-no-i18n>{p().laps}</b> <span>tur</span>
                </span>
                <Show when={o().showFuel !== false && p().fuelAvg > 0}>
                  <span class="sti-cmp-i">
                    <b data-no-i18n>
                      {fuelText(p().fuelAvg)} {fuelUnit(props.units)}
                    </b>
                    <Show when={diff(s().fuelAvg, p().fuelAvg)}>{(d) => <em class={d().cls} data-no-i18n>{d().text}</em>}</Show>
                  </span>
                </Show>
              </div>
            )}
          </Show>
        </>
      )}
    </Show>
  );

  const rows = createMemo(() => {
    const n = clamp(num(o().rows, 5), 2, 12);
    const l = stints().slice(-n);
    return o().newestTop !== false ? [...l].reverse() : l;
  });
  const Table = () => (
    <>
      <div class="ov-header sti-head">
        <span>Stint Özeti</span>
        <Show when={inPit()}>
          <i class="sti-pit">PİT</i>
        </Show>
      </div>
      <Show when={rows().length} fallback={<div class="ov-empty">Stint verisi bekleniyor</div>}>
        <table class="sti-table">
          <thead>
            <tr>
              <th>#</th>
              <Show when={o().showDriver}>
                <th class="sti-l">Sürücü</th>
              </Show>
              <th>Tur</th>
              <Show when={o().showTime !== false}>
                <th>Süre</th>
              </Show>
              <Show when={o().showAvg !== false}>
                <th>Ort</th>
              </Show>
              <Show when={o().showBest !== false}>
                <th>En iyi</th>
              </Show>
              <Show when={o().showTrend !== false}>
                <th>Eğilim</th>
              </Show>
              <Show when={o().showFuel !== false}>
                <th>Yakıt</th>
              </Show>
              <Show when={o().showTyre !== false}>
                <th>Lastik</th>
              </Show>
              <Show when={o().showPit}>
                <th>Pit</th>
              </Show>
            </tr>
          </thead>
          <tbody data-no-i18n>
            <For each={rows()}>
              {(s) => (
                <tr classList={{ "sti-cur": s.current }}>
                  <td>{s.n}</td>
                  <Show when={o().showDriver}>
                    <td class="sti-l sti-drv">{s.driver || "—"}</td>
                  </Show>
                  <td>{s.laps}</td>
                  <Show when={o().showTime !== false}>
                    <td>{clock(s.time)}</td>
                  </Show>
                  <Show when={o().showAvg !== false}>
                    <td>{lapTime(s.avg)}</td>
                  </Show>
                  <Show when={o().showBest !== false}>
                    <td class="sti-best">{lapTime(s.best)}</td>
                  </Show>
                  <Show when={o().showTrend !== false}>
                    <td class={`sti-trend sti-${trendDir(s)}`}>
                      <em>{trendArrow(s)}</em>
                      {trendText(s)}
                    </td>
                  </Show>
                  <Show when={o().showFuel !== false}>
                    <td>{fuelText(s.fuelAvg)}</td>
                  </Show>
                  <Show when={o().showTyre !== false}>
                    <td>{tyreText(s)}</td>
                  </Show>
                  <Show when={o().showPit}>
                    <td>{s.pitTime > 0 ? `${s.pitTime.toFixed(1)}s` : "—"}</td>
                  </Show>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </>
  );

  return (
    <Show when={visible()}>
      <div class={`sti sti-d-${design()} ov-panel`} style={{ width: `${clamp(num(o().width, 340), 240, 800)}px` }}>
        <Show when={design() === "table"} fallback={<Compact />}>
          <Table />
        </Show>
      </div>
    </Show>
  );
}
