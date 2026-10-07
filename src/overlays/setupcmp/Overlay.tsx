import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { demoShow, useTopic } from "@/sdk/telemetry";
import { lapTime } from "@/sdk/format";
import type { SetupEntry, SetupStats } from "@/sdk/types";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

const st = (laps: number, best: number, sectors: number[], opt: number[], last: number, avg: number): SetupStats => ({ laps, best, sectors, opt, last, sum: avg * laps });
/** Örnek veri (Demo ve düzenleme) */
const SAMPLE: SetupEntry[] = [
  { name: "yaris2", modified: false, used: 4, all: st(9, 138.412, [41.88, 58.214, 38.318], [41.702, 58.11, 38.318], 138.97, 139.24), ses: st(9, 138.412, [41.88, 58.214, 38.318], [41.702, 58.11, 38.318], 138.97, 139.24) },
  { name: "yaris1", modified: false, used: 3, all: st(12, 138.806, [41.655, 58.6, 38.551], [41.655, 58.342, 38.49], 139.6, 139.71), ses: st(12, 138.806, [41.655, 58.6, 38.551], [41.655, 58.342, 38.49], 139.6, 139.71) },
  { name: "baseline", modified: false, used: 2, all: st(6, 139.52, [42.1, 58.82, 38.6], [42.02, 58.7, 38.6], 140.2, 140.33), ses: st(6, 139.52, [42.1, 58.82, 38.6], [42.02, 58.7, 38.6], 140.2, 140.33) },
  { name: "nem_yuksek", modified: true, used: 1, all: st(4, 139.9, [42.3, 58.9, 38.7], [42.2, 58.9, 38.66], 140.6, 140.71), ses: st(4, 139.9, [42.3, 58.9, 38.7], [42.2, 58.9, 38.66], 140.6, 140.71) },
];

interface Row {
  key: string;
  label: string;
  /** Sütun başına değer (sn); 0 = yok */
  vals: number[];
  /** Süre değil sayı (tur sayısı): fark ve renk yok */
  plain?: boolean;
  strong?: boolean;
}

export default function SetupCmp(props: OverlayProps) {
  const data = useTopic("setupcmp");
  const o = () => props.options;
  const dec = () => Math.max(1, Math.min(3, parseInt(String(o().decimals ?? "3"), 10) || 3));
  const sample = () => props.editing || demoShow();
  const all = () => o().scope === "all";
  const pick = (e: SetupEntry): SetupStats => (all() ? e.all : e.ses);

  /** Gösterilen setup'lar: en son kullanılanlar; yüklü setup henüz tur atmadıysa da en başta yer alır */
  const cols = createMemo(() => {
    const n = Math.max(2, Math.min(6, Math.round(num(o().count, 2))));
    if (sample()) return SAMPLE.slice(0, n).map((e, i) => ({ e, s: pick(e), cur: i === 0 }));
    const d = data();
    if (!d) return [];
    const list = d.setups.filter((e) => pick(e).laps > 0 || (e.name === d.current && e.modified === d.modified));
    const out = list.map((e) => ({ e, s: pick(e), cur: e.name === d.current && e.modified === d.modified }));
    if (d.current && !out.some((x) => x.cur)) {
      const empty: SetupStats = { laps: 0, best: 0, sectors: [], opt: [], last: 0, sum: 0 };
      out.unshift({ e: { name: d.current, modified: d.modified, used: 0, all: empty, ses: empty }, s: empty, cur: true });
    }
    return out.slice(0, n);
  });
  const noName = () => !sample() && !data()?.current;
  const hasLaps = () => cols().some((c) => c.s.laps > 0);

  const rows = createMemo<Row[]>(() => {
    const c = cols();
    const out: Row[] = [{ key: "best", label: "En iyi tur", vals: c.map((x) => x.s.best), strong: true }];
    if (o().design === "list") return out;
    if (o().showSectors !== false) {
      const src = (s: SetupStats) => (o().sectorMode === "opt" ? s.opt : s.sectors);
      const n = Math.max(0, ...c.map((x) => src(x.s).length));
      for (let i = 0; i < n; i++) out.push({ key: `s${i}`, label: `S${i + 1}`, vals: c.map((x) => src(x.s)[i] ?? 0) });
    }
    if (o().showOptimal !== false)
      out.push({ key: "opt", label: "Teorik", vals: c.map((x) => (x.s.opt.length && x.s.opt.every((v) => v > 0) ? x.s.opt.reduce((a, b) => a + b, 0) : 0)) });
    if (o().showAvg !== false) out.push({ key: "avg", label: "Ortalama", vals: c.map((x) => (x.s.laps > 0 ? x.s.sum / x.s.laps : 0)) });
    if (o().showLast) out.push({ key: "last", label: "Son tur", vals: c.map((x) => x.s.last) });
    if (o().showLaps !== false) out.push({ key: "laps", label: "Tur", vals: c.map((x) => x.s.laps), plain: true });
    return out;
  });

  const bestOf = (vals: number[]) => {
    const v = vals.filter((x) => x > 0);
    return v.length ? Math.min(...v) : 0;
  };
  const fmt = (v: number, key: string) => (v > 0 ? (key.startsWith("s") ? v.toFixed(dec()) : lapTime(v, dec())) : "–");
  const delta = (v: number, best: number) => (v > 0 && best > 0 && v - best >= 0.0005 ? `+${(v - best).toFixed(dec())}` : "");
  const name = (e: SetupEntry) => e.name + (e.modified ? "*" : "");

  const style = () => ({
    width: `${Math.max(220, Math.min(900, num(o().width, 380)))}px`,
    "font-size": `${Math.max(10, Math.min(28, num(o().fontSize, 14)))}px`,
    "--sc-best": hex(o().colBest, "#33d17a"),
    "--sc-slow": hex(o().colSlow, "#ffcc33"),
  });

  return (
    <Show when={!(o().hideEmpty && !sample() && (!hasLaps() || cols().length < 2))}>
      <div class="ov-panel sc" classList={{ "sc-list": o().design === "list" }} style={style()}>
        <div class="sc-head">
          <b>SETUP KARŞILAŞTIRMA</b>
          <small>{all() ? "Tüm zamanlar" : "Bu oturum"}</small>
        </div>
        <Show
          when={!noName()}
          fallback={<p class="sc-note">Setup adı bu oyunda okunamıyor (iRacing gerekir).</p>}
        >
          <Show when={o().design === "list"} fallback={
            <div class="sc-grid" style={{ "grid-template-columns": `auto repeat(${Math.max(1, cols().length)}, minmax(0, 1fr))` }}>
              <span />
              <For each={cols()}>
                {(c) => (
                  <span class="sc-name" classList={{ cur: c.cur }} data-no-i18n title={name(c.e)}>
                    {name(c.e)}
                  </span>
                )}
              </For>
              <For each={rows()}>
                {(r) => {
                  const best = () => (r.plain ? 0 : bestOf(r.vals));
                  return (
                    <>
                      <span class="sc-lbl" classList={{ strong: r.strong }}>{r.label}</span>
                      <For each={r.vals}>
                        {(v) => (
                          <span class="sc-val" classList={{ strong: r.strong, best: !r.plain && v > 0 && v - best() < 0.0005 && r.vals.filter((x) => x > 0).length > 1, slow: !r.plain && !!delta(v, best()) }}>
                            <b>{r.plain ? (v > 0 ? v : "–") : fmt(v, r.key)}</b>
                            <Show when={!r.plain && o().showDelta !== false && delta(v, best())}>
                              <i>{delta(v, best())}</i>
                            </Show>
                          </span>
                        )}
                      </For>
                    </>
                  );
                }}
              </For>
            </div>
          }>
            <div class="sc-rows">
              <For each={cols()}>
                {(c) => {
                  const best = () => bestOf(cols().map((x) => x.s.best));
                  return (
                    <div class="sc-row" classList={{ cur: c.cur, best: c.s.best > 0 && c.s.best - best() < 0.0005 && cols().filter((x) => x.s.best > 0).length > 1, slow: !!delta(c.s.best, best()) }}>
                      <span class="sc-name" classList={{ cur: c.cur }} data-no-i18n title={name(c.e)}>
                        {name(c.e)}
                      </span>
                      <Show when={o().showLaps !== false}>
                        <small>{c.s.laps} tur</small>
                      </Show>
                      <b>{fmt(c.s.best, "best")}</b>
                      <Show when={o().showDelta !== false}>
                        <i>{delta(c.s.best, best())}</i>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
          <Show when={!hasLaps()}>
            <p class="sc-note">Bu setup ile süreli bir tur at; ardından başka bir setup yükleyince karşılaştırma burada görünür.</p>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
