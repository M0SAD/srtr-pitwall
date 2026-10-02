// Direksiyon Ekranı: belirli araçların ekran YERLEŞİMLERİNDEN esinlenen özgün çizimler (PRO).
// Hangi alanın kabaca nerede durduğu gerçek araçlardaki gibidir; marka adı / logosu yoktur.
// Sim'in vermediği alanlar (ARB, fren migrasyonu, motor haritası, fren sıcaklığı...) "—" gösterir.

import { For, Match, Show, Switch, type JSX } from "solid-js";
import { lapTime } from "@/sdk/format";
import {
  Cell,
  DeltaBar,
  Leds,
  deltaCls,
  deltaTxt,
  fin,
  hasTotal,
  kwTxt,
  lapTxt,
  n0,
  posTxt,
  tyreColor,
  type DashCtx,
} from "./carstyles";

export type CarStyle2 =
  | "carFormula"
  | "carMercW13"
  | "carFer296"
  | "carMcl720"
  | "carPor992"
  | "carPor963"
  | "carCadV"
  | "carFer499"
  | "carLmp2";

const G = "#2bdc4f";
const Y = "#ffd014";
const R = "#ff2a1f";
const B = "#2f7dff";
const M = "#e93cff";
const O = "#ff8a1a";
const W = "#d8dde2";
const DASH = "—";

/** Başlıklı kutu: üstte renkli etiket, altta değer. `fill` kutunun tamamını boyar. */
function Box(p: { l: string; v: JSX.Element; k?: string; class?: string; fill?: boolean; hid?: boolean; act?: boolean }) {
  return (
    <div
      class={`cx-box ${p.class ?? ""}`}
      classList={{ "cx-fill": !!p.fill, "cd-hid": !!p.hid, "cd-act": !!p.act }}
      style={p.k ? { "--k": p.k } : undefined}
    >
      <span>{p.l}</span>
      <b>{p.v}</b>
    </div>
  );
}

/** ABS / TC kutusu (ayar "Kapalı" ise görünmez, sistem devredeyken yanar) */
function AidBox(p: { c: DashCtx; k: "abs" | "tc"; l?: string; col?: string; class?: string; fill?: boolean }) {
  const c = p.c;
  return (
    <Box
      l={p.l ?? (p.k === "abs" ? "ABS" : "TC")}
      v={n0(p.k === "abs" ? c.abs() : c.tc())}
      k={p.col}
      class={p.class}
      fill={p.fill}
      hid={(p.k === "abs" ? c.absMode() : c.tcMode()) === "off"}
      act={p.k === "abs" ? c.absActive() : c.tcActive()}
    />
  );
}

const tT = (c: DashCtx, i: number) => c.tyres()?.[i]?.t ?? DASH;
const tP = (c: DashCtx, i: number) => c.tyres()?.[i]?.p ?? DASH;
const tC = (c: DashCtx, i: number) => tyreColor(c.tyres()?.[i]?.c);
const socTxt = (c: DashCtx) => (fin(c.soc()) ? `${Math.round(c.soc()! * 100)}` : DASH);
const lapOf = (c: DashCtx) => (
  <>
    {lapTxt(c)}
    <Show when={hasTotal(c)}>
      <small>/{c.totalLaps()}</small>
    </Show>
  </>
);
const sectorTxt = (t: number | undefined) => (t != null && isFinite(t) && t > 0 ? t.toFixed(1) : "--.-");
const clamp01 = (v: number | undefined) => Math.max(0, Math.min(1, v ?? 0));
const rpmFrac = (c: DashCtx) => Math.min(1, c.rpm() / Math.max(1, c.rpmMax()));

/** Kademeli devir çubuğu: n dilim, palete göre renklenir */
function SegBar(p: { c: DashCtx; n: number; class?: string; cols?: [string, string, string] }) {
  const lit = () => Math.round(rpmFrac(p.c) * p.n);
  const col = (i: number) => {
    const pal = p.c.pal();
    const [a, b, d] = pal ? [pal.low, pal.mid, pal.high] : (p.cols ?? [G, Y, R]);
    const f = i / p.n;
    return f < 0.55 ? a : f < 0.8 ? b : d;
  };
  return (
    <div class={`cx-seg ${p.class ?? ""}`}>
      <For each={Array.from({ length: p.n })}>{(_, i) => <i classList={{ on: i() < lit() }} style={{ "--sc": col(i()) }} />}</For>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Genel Formula: LED şeridi, solda delta / tur / son tur, ortada vites + hız, sağda sıra / tur / yakıt, altta ayar kutuları */
function Formula(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <Leds c={c} n={15} mode="ltr" palette={[G, G, R, R, B]} shift={B} blink={M} class="cd-pill cx-fo-leds" />
      <div class="cd-screen">
        <div class="cx-fo-main">
          <div class="cx-fo-col">
            <Cell l={c.deltaLabel()} v={deltaTxt(c.delta())} class={`cx-tile ${deltaCls(c.delta())}`} />
            <Cell l="LAP TIME" v={lapTime(c.cur(), 1)} class="cx-tile" />
            <Cell l="LAST LAP" v={lapTime(c.last())} class="cx-tile cx-yel" />
          </div>
          <div class="cx-tile cx-fo-mid">
            <div class="cd-gear">{c.gear()}</div>
            <span class="cx-fo-speed">
              {c.speed()} <small>{c.speedUnit()}</small>
            </span>
          </div>
          <div class="cx-fo-col">
            <Cell l="POSITION" v={<>{posTxt(c)}<Show when={c.carCount() > 0}><small>/{c.carCount()}</small></Show></>} class="cx-tile" />
            <Cell l="LAP" v={lapOf(c)} class="cx-tile" />
            <Cell l={`FUEL ${c.fuelUnit()}`} v={c.fuel()} class="cx-tile" />
          </div>
        </div>
        <div class="cx-fo-bot">
          <div class="cx-mini">
            <For each={[0, 1, 2, 3]}>{(i) => <i style={{ background: tC(c, i) }}>{tT(c, i)}</i>}</For>
          </div>
          <Cell l="BB" v={n0(c.bb(), 1)} class="cx-tile cx-k" />
          <Box l="TC" v={n0(c.tc())} class="cx-tile cx-k cx-plain" k="#35c8ff" hid={c.tcMode() === "off"} act={c.tcActive()} />
          <Box l="ABS" v={n0(c.abs())} class="cx-tile cx-k cx-plain" k={Y} hid={c.absMode() === "off"} act={c.absActive()} />
          <Box l="F.LAPS" v={c.fuelLaps()} class="cx-tile cx-k cx-plain" k={G} />
        </div>
      </div>
    </>
  );
}

/** F1 hibrit direksiyon ekranı: sade; hız, kutu içinde vites, batarya, delta paneli, su sıcaklığı */
function MercW13(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <>
      <Leds c={c} n={15} mode="ltr" palette={[G, R, B]} shift={B} blink={M} class="cd-round cx-w-leds" />
      <div class="cd-screen">
        <div class="cx-w-col">
          <div class="cx-w-kv">
            <span class="cd-l">SPEED</span>
            <b>{c.speed()}</b>
          </div>
          <div class="cx-w-kv">
            <span class="cd-l">LAP</span>
            <b>{lapOf(c)}</b>
          </div>
          <div class="cx-w-kv">
            <span class="cd-l">POS</span>
            <b>P{posTxt(c)}</b>
          </div>
          <div class="cx-w-kv">
            <span class="cd-l">FUEL</span>
            <b>{c.fuelLaps()}</b>
          </div>
        </div>
        <div class="cx-w-mid">
          <div class="cx-w-gear">
            <div class="cd-gear">{c.gear()}</div>
          </div>
          <div class="cx-w-bat">
            <span class="cd-l">BAT</span>
            <div class="cx-w-batbar">
              <i style={{ width: `${clamp01(c.soc()) * 100}%` }} />
            </div>
            <b>{socTxt(c)}</b>
          </div>
          <div class="cx-w-bat">
            <span class="cd-l">MODE</span>
            <b class="cx-w-mode">{n0(c.mode())}</b>
            <span class="cd-l">MGU-K</span>
            <b class="cx-w-mode">{kwTxt(c.mguk())}</b>
          </div>
        </div>
        <div class="cx-w-col r">
          <div class="cx-w-panel">
            <span class="cd-l">{c.deltaLabel()}</span>
            <b class={`cx-w-delta ${deltaCls(c.delta())}`}>{deltaTxt(c.delta())}</b>
            <DeltaBar v={c.delta()} />
            <span class="cx-w-time">
              <em>LAST</em> {lapTime(c.last())}
            </span>
            <span class="cx-w-time">
              <em>BEST</em> {lapTime(c.best())}
            </span>
          </div>
          <div class="cx-w-water">
            <span class="cd-l">T WATER</span>
            <b>{c.water()}</b>
            <span class="cd-l">BBAL</span>
            <b>{n0(c.bb(), 1)}</b>
          </div>
        </div>
      </div>
    </>
  );
}

/** İtalyan GT3 (veri kaydedici ekranı): üstte oturum / tur / devir skalası / hız, iki yanda lastik basınç ve sıcaklıkları,
 *  ortada ters renkli vites, renkli ABS / FUEL / PRED / TC kutuları, altta önceki tur / fark / tahmini tur */
function Fer296(p: { c: DashCtx }) {
  const c = p.c;
  const scale = () => Math.max(4, Math.ceil(c.rpmMax() / 1000));
  const names = ["FL", "FR", "RL", "RR"];
  return (
    <div class="cd-screen">
      <div class="cx-296-top">
        <b class="cx-title">{c.session()}</b>
        <Box l="LAP" v={lapTxt(c)} class="cx-light" />
        <div class="cx-296-rpm">
          <Leds c={c} n={10} mode="ltr" palette={[G, G, Y, R]} shift={B} blink={B} class="cd-round" />
          <div class="cx-296-scale">
            <For each={Array.from({ length: scale() + 1 })}>
              {(_, i) => <span classList={{ red: i() >= scale() - 1 }}>{i()}</span>}
            </For>
          </div>
          <SegBar c={c} n={28} cols={[R, R, R]} />
        </div>
        <Box l={c.speedUnit().toUpperCase()} v={c.speed()} class="cx-light" />
      </div>
      <div class="cx-296-mid">
        <div class="cx-296-quad">
          <For each={[0, 1, 2, 3]}>{(i) => <Box l={`P ${names[i]}`} v={tP(c, i)} class="cx-grey" />}</For>
        </div>
        <div class="cx-296-gear">
          <div class="cd-gear">{c.gear()}</div>
        </div>
        <div class="cx-296-quad">
          <For each={[0, 1, 2, 3]}>{(i) => <Box l={`T ${names[i]}`} v={tT(c, i)} class="cx-grey" />}</For>
        </div>
      </div>
      <div class="cx-296-row">
        <Box l="MIX" v={DASH} class="cx-grey" />
        <Box l="POS" v={posTxt(c)} class="cx-grey" />
        <AidBox c={c} k="abs" col={R} fill />
        <Box l="FUEL" v={c.fuel()} k={Y} fill />
        <Box l="LAP" v={c.fuelPerLap()} k="#b9bfc6" fill />
        <Box l="PRED" v={c.fuelLaps()} k={G} fill />
        <AidBox c={c} k="tc" l="TC1" col={R} fill />
        <Box l="TC2" v={DASH} k={R} fill hid={c.tcMode() === "off"} />
      </div>
      <div class="cx-296-bot">
        <Cell l="PREV LAP" v={lapTime(c.last())} />
        <Cell l="DIFF" v={deltaTxt(c.delta())} class={deltaCls(c.delta())} />
        <Cell l="PREDICTED LAP" v={lapTime(c.pred())} />
      </div>
    </div>
  );
}

/** İngiliz GT3: kehribar segment ekran; üstte MAP / TC / ABS / BB, solda devir çubuğu ve son tur, ortada iri vites,
 *  sağda tahmini tur ve lastikler */
function Mcl720(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <div class="cd-screen">
      <div class="cx-mc-top">
        <Box l="MAP" v={DASH} class="cx-plain" />
        <AidBox c={c} k="tc" l="TC1" class="cx-plain" />
        <Box l="TC2" v={DASH} class="cx-plain" hid={c.tcMode() === "off"} />
        <AidBox c={c} k="abs" class="cx-plain" />
        <Box l="BB" v={n0(c.bb(), 1)} class="cx-plain" />
        <Box l="POS" v={posTxt(c)} class="cx-plain" />
        <Box l="LAP" v={lapTxt(c)} class="cx-plain" />
      </div>
      <div class="cx-mc-main">
        <div class="cx-mc-side">
          <SegBar c={c} n={22} />
          <b class="cx-mc-cur">{lapTime(c.cur(), 1)}</b>
          <span class="cd-l">LAST LAP</span>
          <b class="cx-mc-time">{lapTime(c.last())}</b>
          <span class={`cx-mc-delta ${deltaCls(c.delta())}`}>{deltaTxt(c.delta())}</span>
        </div>
        <div class="cx-mc-mid">
          <span class="cd-l">RPM</span>
          <b class="cx-mc-num">{Math.round(c.rpm())}</b>
          <div class="cd-gear">{c.gear()}</div>
          <b class="cx-mc-num">{c.speed()}</b>
          <span class="cd-l">{c.speedUnit().toUpperCase()}</span>
        </div>
        <div class="cx-mc-side r">
          <span class="cd-l">PREDICTED LAP</span>
          <b class="cx-mc-time">{lapTime(c.pred())}</b>
          <div class="cx-mc-tyres">
            <span>FL</span>
            <b style={{ color: tC(c, 0) }}>{tT(c, 0)}</b>
            <b style={{ color: tC(c, 1) }}>{tT(c, 1)}</b>
            <span>FR</span>
            <span>RL</span>
            <b style={{ color: tC(c, 2) }}>{tT(c, 2)}</b>
            <b style={{ color: tC(c, 3) }}>{tT(c, 3)}</b>
            <span>RR</span>
          </div>
          <span class="cx-mc-fuel">
            FUEL <b>{c.fuel()}</b> · <b>{c.fuelLaps()}</b> L
          </span>
        </div>
      </div>
      <div class="cx-mc-foot">
        <b>{c.session()}</b>
        <i />
        <span>
          BEST <b>{lapTime(c.best())}</b>
        </span>
      </div>
    </div>
  );
}

/** Alman GT3 (992): üstte oturum ve ışıklar, solda uyarı lambaları listesi, ortada çerçeveli vites,
 *  renkli çerçeveli TC / ABS / FUEL kutuları ve lastik ızgarası */
function Por992(p: { c: DashCtx }) {
  const c = p.c;
  const lamp = (l: string, v: string, warn: boolean) => (
    <div class="cx-lamp" classList={{ warn }}>
      <span>{l}</span>
      <b>{v}</b>
    </div>
  );
  return (
    <div class="cd-screen">
      <div class="cx-92-top">
        <b class="cx-title">{c.session()}</b>
        <Leds c={c} n={10} mode="ltr" palette={[G, G, Y, R]} shift={B} blink={B} class="cd-round" />
      </div>
      <div class="cx-92-main">
        <div class="cx-92-lamps">
          {lamp("Oil temp", c.oil(), (c.oilC() ?? 0) > 135)}
          {lamp("Oil press", DASH, false)}
          {lamp("Water temp", c.water(), (c.waterC() ?? 0) > 115)}
          {lamp("Water press", DASH, false)}
        </div>
        <div class="cx-92-mid">
          <div class="cx-92-speed">
            {c.speed()} <small>{c.speedUnit()}</small>
          </div>
          <div class="cx-92-gear">
            <div class="cd-gear">{c.gear()}</div>
          </div>
        </div>
        <div class="cx-92-right">
          <Cell l="LAST" v={lapTime(c.last())} />
          <Cell l="BEST" v={lapTime(c.best())} />
          <Cell l={c.deltaLabel()} v={deltaTxt(c.delta())} class={`cx-92-delta ${deltaCls(c.delta())}`} />
        </div>
      </div>
      <div class="cx-92-bot">
        <div class="cx-92-boxes">
          <AidBox c={c} k="tc" col={O} class="cx-row" />
          <AidBox c={c} k="abs" col={B} class="cx-row" />
          <Box l="FUEL" v={c.fuel()} k={R} class="cx-row" />
          <Box l="LAPS" v={c.fuelLaps()} k="#5b6670" class="cx-row" />
          <Box l="POS" v={posTxt(c)} k="#5b6670" class="cx-row" />
          <Box l="LAP" v={lapTxt(c)} k="#5b6670" class="cx-row" />
        </div>
        <div class="cx-frame" style={{ "--k": O }}>
          <span>TYRE</span>
          <div class="cx-quad">
            <For each={[0, 1, 2, 3]}>
              {(i) => (
                <b style={{ color: tC(c, i) }}>
                  {tT(c, i)}
                  <small>{tP(c, i)}</small>
                </b>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}

/** LMDh (Alman): üstte renkli kutular (ERS / TC / LAP / ARB / TYRE / STRAT), büyük fren dengesi, ortada vites ve hibrit durumu,
 *  tahmini tur + delta ve sektörler, altta yakıt / SOC, lastik ve fren blokları */
function Por963(p: { c: DashCtx }) {
  const c = p.c;
  const hyb = () => {
    const k = c.mguk();
    if (k == null) return fin(c.soc()) ? "Hybrid" : "Hybrid —";
    return Math.abs(k) < 1 ? "Hybrid off" : k > 0 ? `Deploy ${Math.round(k)}` : `Regen ${Math.round(-k)}`;
  };
  return (
    <div class="cd-screen">
      <div class="cx-63-top">
        <Box l="ERS" v={n0(c.mode())} k={G} />
        <AidBox c={c} k="tc" l="TCLO" col={R} />
        <Box l="LAP" v={lapTxt(c)} k="#8fa0c8" />
        <Box l="AR-F" v={DASH} k="#8fa0c8" />
        <b class="cx-63-rpm">{Math.round(c.rpm())}</b>
        <Box l="AR-R" v={DASH} k="#8fa0c8" />
        <Box l="TYRE" v={c.compound()} k="#8fa0c8" />
        <Box l="TCLA" v={DASH} k={O} hid={c.tcMode() === "off"} />
        <Box l="POS" v={posTxt(c)} k={M} />
      </div>
      <div class="cx-63-mid">
        <div class="cx-frame cx-63-bias">
          <span>Bias</span>
          <b>{n0(c.bb(), 2)}</b>
        </div>
        <div class="cx-63-small">
          <div class="cx-frame">
            <span>MIG</span>
            <b>{DASH}</b>
          </div>
          <div class="cx-frame">
            <span>Target</span>
            <b>{c.fuelPerLap()}</b>
          </div>
        </div>
        <div class="cx-63-gear">
          <div class="cd-gear">{c.gear()}</div>
          <span classList={{ dep: (c.mguk() ?? 0) > 1, reg: (c.mguk() ?? 0) < -1 }}>{hyb()}</span>
        </div>
        <div class="cx-frame cx-63-pred">
          <span>Pred</span>
          <div class="cx-63-predrow">
            <b>{lapTime(c.pred())}</b>
            <em class={deltaCls(c.delta())}>{deltaTxt(c.delta())}</em>
          </div>
          <div class="cx-63-sec">
            <For each={[0, 1, 2]}>
              {(i) => (
                <div>
                  <small>S{i + 1}</small>
                  <b>{sectorTxt(c.sectors()[i])}</b>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
      <div class="cx-63-bot">
        <div class="cx-frame cx-63-fuel">
          <span>Fuel</span>
          <dl>
            <dt>Fuel</dt>
            <dd>{c.fuel()}</dd>
            <dt>Laps</dt>
            <dd>{c.fuelLaps()}</dd>
            <dt>SOC</dt>
            <dd class="soc">{socTxt(c)}</dd>
          </dl>
        </div>
        <div class="cx-frame cx-63-last">
          <span>Last</span>
          <b>{lapTime(c.last())}</b>
          <small>
            BEST <i>{lapTime(c.best())}</i>
          </small>
        </div>
        <div class="cx-frame" style={{ "--k": O }}>
          <span>Tyre</span>
          <div class="cx-quad">
            <For each={[0, 1, 2, 3]}>{(i) => <b style={{ color: tC(c, i) }}>{tT(c, i)}</b>}</For>
          </div>
        </div>
        <div class="cx-frame">
          <span>Press</span>
          <div class="cx-quad">
            <For each={[0, 1, 2, 3]}>{(i) => <b>{tP(c, i)}</b>}</For>
          </div>
        </div>
      </div>
    </div>
  );
}

/** LMDh (Amerikan): üstte durum satırı, solda sarı çerçeveli yakıt kutusu, ortada köşelerinde lastik değerleri olan vites,
 *  sağda tur / delta ve SoC kutusu, altta küçük renkli kutular */
function CadV(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <div class="cd-screen">
      <div class="cx-cv-top">
        <div class="cx-cv-strip">
          <b>{c.compound()}</b>
          <span>
            WAT T <b>{c.water()}</b>
          </span>
          <span>
            OIL T <b>{c.oil()}</b>
          </span>
        </div>
        <b class="cx-cv-rpm">{Math.round(c.rpm())}</b>
        <div class="cx-cv-strip e">
          <span>
            ENERGY <b>{kwTxt(c.mguk())}</b>
          </span>
          <span>
            E LAP <b>{fin(c.deployLeft()) ? `${Math.round(c.deployLeft()! * 100)}` : DASH}</b>
          </span>
          <span>
            P <b>{posTxt(c)}</b>
          </span>
        </div>
      </div>
      <div class="cx-cv-main">
        <div class="cx-cv-left">
          <div class="cx-frame cx-cv-fuel" style={{ "--k": Y }}>
            <Cell l="LAST" v={c.fuelLast()} />
            <Cell l="F LEVEL" v={c.fuel()} />
            <Cell l="EST LAPS" v={c.fuelLaps()} />
            <Cell l="STINT" v={c.stint()} />
            <b class="cx-cv-best">{lapTime(c.best())}</b>
          </div>
          <div class="cx-frame cx-cv-bb" style={{ "--k": Y }}>
            <em>Brake Bias</em>
            <b>{n0(c.bb(), 1)}</b>
          </div>
        </div>
        <div class="cx-cv-mid">
          <div class="cx-cv-gear">
            <i style={{ color: tC(c, 0) }}>{tT(c, 0)}</i>
            <i style={{ color: tC(c, 1) }}>{tT(c, 1)}</i>
            <div class="cd-gear">{c.gear()}</div>
            <i style={{ color: tC(c, 2) }}>{tT(c, 2)}</i>
            <i style={{ color: tC(c, 3) }}>{tT(c, 3)}</i>
          </div>
          <div class="cx-frame cx-cv-tyre">
            <span>TYRE</span>
            <div class="cx-quad">
              <For each={[0, 1, 2, 3]}>{(i) => <b>{tP(c, i)}</b>}</For>
            </div>
          </div>
        </div>
        <div class="cx-cv-right">
          <div class="cx-frame cx-cv-lap" style={{ "--k": "#7d6bff" }}>
            <Cell l="LAP" v={lapTxt(c)} />
            <Cell l="DELTA" v={deltaTxt(c.delta())} class={deltaCls(c.delta())} />
            <b class="cx-cv-cur">{lapTime(c.cur(), 1)}</b>
          </div>
          <div class="cx-frame cx-cv-soc" style={{ "--k": Y }}>
            <i style={{ width: `${clamp01(c.soc()) * 100}%` }} />
            <b>
              SoC <u>{socTxt(c)}</u>
            </b>
          </div>
          <div class="cx-frame cx-cv-arb">
            <em>
              ARB F <b>{DASH}</b>
            </em>
            <em>
              ARB R <b>{DASH}</b>
            </em>
            <em>
              LAST <b>{lapTime(c.last())}</b>
            </em>
          </div>
        </div>
      </div>
      <div class="cx-cv-bot">
        <AidBox c={c} k="tc" l="TC S" col={Y} />
        <AidBox c={c} k="abs" col={R} />
        <Box l="REGEN" v={n0(c.regen())} k={G} />
        <Box l="SPEED" v={c.speed()} k="#8fa0c8" />
        <Box l="TCL" v={DASH} k={G} hid={c.tcMode() === "off"} />
        <Box l="DEPLOY" v={n0(c.mode())} k={B} class="w2" />
      </div>
    </div>
  );
}

/** LMH (İtalyan): üstte tur süresi / delta / enerji / devir, iki yanda lastik blokları, ortada yan çubuklu vites,
 *  altta SOC / yakıt / fren dengesi / migrasyon / regen / TC satırı ve devir şeridi */
function Fer499(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <div class="cd-screen">
      <div class="cx-49-top">
        <Cell l="LAPTIME" v={lapTime(c.cur(), 1)} class="l" />
        <Cell l="DELTA" v={deltaTxt(c.delta())} class={deltaCls(c.delta())} />
        <div class="cx-49-cell">
          <i style={{ height: `${clamp01(c.soc()) * 100}%` }} />
        </div>
        <Cell l="ENERGY KW" v={kwTxt(c.mguk())} />
        <Cell l="RPM" v={Math.round(c.rpm())} />
      </div>
      <div class="cx-49-main">
        <div class="cx-49-side">
          <div class="cx-49-pair">
            <Box l="TC SLIP" v={n0(c.tc())} class="cx-plain" hid={c.tcMode() === "off"} act={c.tcActive()} />
            <Cell l="SPEED" v={c.speed()} />
          </div>
          <div class="cx-49-tyres">
            <For each={[0, 1, 2, 3]}>
              {(i) => (
                <div>
                  <b style={{ color: tC(c, i) }}>{tT(c, i)}</b>
                  <small>{tP(c, i)}</small>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="cx-49-mid">
          <div class="cx-49-gear">
            <div class="cx-49-bar">
              <i style={{ height: `${clamp01(c.soc()) * 100}%` }} />
            </div>
            <div class="cd-gear">{c.gear()}</div>
            <div class="cx-49-bar f">
              <i style={{ height: `${clamp01(c.fuelPct()) * 100}%` }} />
            </div>
          </div>
          <div class="cx-49-arb">
            <Cell l="ARB F" v={DASH} />
            <Cell l="LAP" v={lapTxt(c)} />
            <Cell l="ARB R" v={DASH} />
          </div>
        </div>
        <div class="cx-49-side">
          <div class="cx-49-pair">
            <Cell l="LAST" v={lapTime(c.last())} class="sm" />
            <Cell l="POS" v={posTxt(c)} />
          </div>
          <div class="cx-49-tyres br">
            <For each={[0, 1, 2, 3]}>
              {() => (
                <div>
                  <b>{DASH}</b>
                </div>
              )}
            </For>
            <span>BRAKE T</span>
          </div>
        </div>
      </div>
      <div class="cx-49-bot">
        <Cell l="SOC" v={socTxt(c)} />
        <Cell l="FUEL LVL" v={c.fuel()} />
        <Cell l="BRAKE BIAS" v={n0(c.bb(), 1)} />
        <Cell l="BRK MIG" v={DASH} />
        <Cell l="REGEN" v={n0(c.regen())} />
        <Box l="TC LVL" v={n0(c.tc())} class="cx-plain" hid={c.tcMode() === "off"} />
      </div>
      <SegBar c={c} n={30} class="cx-49-strip" cols={[W, W, R]} />
    </div>
  );
}

/** LMP2: üstte oturum / tur / sıra, sarı çerçeveli vites etrafında hız, yakıt, delta, fren dengesi, tur süreleri,
 *  yağ / su sıcaklığı ve altta renkli SLIP / EPS / TPS / ENG / GAIN kutuları */
function Lmp2(p: { c: DashCtx }) {
  const c = p.c;
  return (
    <div class="cd-screen">
      <div class="cx-l2-top">
        <b>{c.session()}</b>
        <span>
          L{lapTxt(c)} &nbsp; P{posTxt(c)}
        </span>
        <span>{c.remain()[0]}</span>
      </div>
      <div class="cx-l2-grid">
        <Cell l="SPEED" v={c.speed()} class="a k-y" />
        <Cell l="LIVE FUEL" v={c.fuel()} class="b k-o" />
        <div class="cx-l2-gear">
          <small>{Math.round(c.rpm())}</small>
          <div class="cd-gear">{c.gear()}</div>
        </div>
        <Cell l="LAP FUEL" v={c.fuelPerLap()} class="c k-g" />
        <Cell l="DELTA" v={deltaTxt(c.delta())} class={`d k-g ${deltaCls(c.delta())}`} />
        <Cell l="BRAKE BALANCE" v={n0(c.bb(), 1)} class="e k-g" />
        <Cell l="LAP TIME" v={lapTime(c.cur(), 1)} class="f k-g" />
        <Cell l="OIL T" v={c.oil()} class="g k-r" />
        <Cell l="WATER T" v={c.water()} class="h k-b" />
        <Cell l="LAST" v={lapTime(c.last())} class="i k-m" />
      </div>
      <div class="cx-l2-bot">
        <AidBox c={c} k="tc" l="SLIP" col={R} />
        <Box l="EPS" v={DASH} k={Y} />
        <Box l="TPS" v={DASH} k={W} />
        <Box l="ENG" v={DASH} k={B} />
        <Box l="GAIN" v={DASH} k={G} />
        <Box l="F.LAPS" v={c.fuelLaps()} k="#5b6670" />
      </div>
    </div>
  );
}

export function CarDash2(p: { style: CarStyle2; c: DashCtx }) {
  return (
    <Switch>
      <Match when={p.style === "carFormula"}>
        <Formula c={p.c} />
      </Match>
      <Match when={p.style === "carMercW13"}>
        <MercW13 c={p.c} />
      </Match>
      <Match when={p.style === "carFer296"}>
        <Fer296 c={p.c} />
      </Match>
      <Match when={p.style === "carMcl720"}>
        <Mcl720 c={p.c} />
      </Match>
      <Match when={p.style === "carPor992"}>
        <Por992 c={p.c} />
      </Match>
      <Match when={p.style === "carPor963"}>
        <Por963 c={p.c} />
      </Match>
      <Match when={p.style === "carCadV"}>
        <CadV c={p.c} />
      </Match>
      <Match when={p.style === "carFer499"}>
        <Fer499 c={p.c} />
      </Match>
      <Match when={p.style === "carLmp2"}>
        <Lmp2 c={p.c} />
      </Match>
    </Switch>
  );
}
