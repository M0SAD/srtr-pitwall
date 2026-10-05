// ERS ve Batarya: hibrit araçlarda batarya doluluğu, turdaki net fark, MGU gücü, mod, P2P / DRS.
// Beş özgün tasarım (hiçbir ürünün görseli / adı kullanılmaz):
//   bar   → Yatay çubuk      cell  → Dikey pil      chip → Kompakt
//   ring  → Halka gösterge (PRO)                    panel → Detaylı panel (PRO)
// Tur başı seviyesi, tur ortalaması ve kalan tur tahmini burada, gelen paketlerden hesaplanır.
// Veri gelmedikçe (önizleme dondurulunca) hiçbir şey ilerlemez; animasyonlar da durdurulur.

import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import { previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import type { Ers } from "@/sdk/types";
import "./style.css";

const DESIGNS = ["bar", "cell", "chip", "ring", "panel"] as const;
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** Düzenleme modunda sim verisi yokken yerleştirme için örnek */
const SAMPLE: Ers = {
  hasHybrid: true,
  batteryPct: 0.64,
  batteryMj: 2.56,
  lapDeployLeft: 0.58,
  mgukKw: 58,
  mguhKw: 18,
  mode: 2,
  modeSet: 1,
  regenGain: 6,
  p2pCount: -1,
  p2pActive: false,
  drs: 1,
  lap: 0,
  lapPct: 0.4,
  onPitRoad: false,
  onTrack: true,
};

interface LapEnd {
  lap: number;
  /** Tur boyunca net değişim (0..1 ölçeğinde, + kazanç) */
  net: number;
  /** Tur sonundaki doluluk 0..1 */
  end: number;
}

const Bolt = () => (
  <svg class="ers-bolt" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9.4 1 3 9.2h4.1L6.2 15l6.8-8.6H8.7z" fill="currentColor" />
  </svg>
);

function createModel(props: OverlayProps) {
  const live = useTopic("ers");
  const o = () => props.options;
  const data = createMemo<Ers | undefined>(() => live() ?? (props.editing ? SAMPLE : undefined));
  const sample = () => !live() && props.editing;

  // --- yumuşatılmış değerler ---
  const [pct, setPct] = createSignal(-1);
  const [kw, setKw] = createSignal(0);
  // --- tur takibi ---
  const [lapStart, setLapStart] = createSignal<number | null>(null);
  const [hist, setHist] = createSignal<LapEnd[]>([]);
  let curLap = -1;
  let partial = true; // ilk izlenen tur yarıdan başlamış olabilir
  let pitLap = false;
  let kwPeak = 80;

  createEffect(
    on(data, (d) => {
      if (!d || !d.hasHybrid || d.batteryPct < 0) {
        setPct(-1);
        return;
      }
      const a = 1 - clamp(num(o().smooth, 40), 0, 90) / 100;
      const prev = pct();
      // Büyük sıçrama (oturum değişimi, pit) doğrudan uygulanır
      setPct(prev < 0 || Math.abs(d.batteryPct - prev) > 0.2 ? d.batteryPct : prev + (d.batteryPct - prev) * a);
      const k = d.mgukKw ?? 0;
      setKw(kw() + (k - kw()) * a);
      kwPeak = Math.max(kwPeak, Math.abs(k));

      if (sample()) {
        setLapStart(0.61);
        return;
      }
      if (d.onPitRoad) pitLap = true;
      if (d.lap !== curLap) {
        const start = lapStart();
        if (curLap >= 0 && d.lap === curLap + 1) {
          // Tam tur: pitte geçmemiş ve baştan izlenmişse geçmişe ekle
          if (!partial && !pitLap && start != null) {
            setHist((h) => [...h, { lap: curLap, net: d.batteryPct - start, end: d.batteryPct }].slice(-20));
          }
          partial = false;
        } else {
          // Tur geri gitti / atladı: yeni oturum ya da araç
          setHist([]);
          partial = d.lapPct > 0.05;
        }
        curLap = d.lap;
        pitLap = d.onPitRoad;
        setLapStart(d.batteryPct);
      }
    }),
  );

  const nLaps = () => clamp(Math.round(num(o().sparkLaps, 8)), 3, 20);
  const recent = createMemo(() => (sample() ? SAMPLE_HIST : hist().slice(-nLaps())));
  /** Bu turdaki net fark (yüzde puanı) */
  const delta = () => {
    const s = lapStart();
    const d = data();
    return s == null || !d || d.batteryPct < 0 ? null : (d.batteryPct - s) * 100;
  };
  /** Son turların ortalama net farkı (yüzde puanı / tur) */
  const avg = createMemo(() => {
    const r = recent();
    return r.length ? (r.reduce((a, x) => a + x.net, 0) / r.length) * 100 : null;
  });
  /** Bu gidişle boşalmaya (dir -1) ya da dolmaya (dir 1) kalan tur */
  const lapsTo = createMemo(() => {
    const a = avg();
    const p = pct();
    if (a == null || p < 0 || Math.abs(a) < 0.15) return null;
    return a < 0 ? { dir: -1, laps: (p * 100) / -a } : { dir: 1, laps: ((1 - p) * 100) / a };
  });

  const lowAt = () => clamp(num(o().lowWarn, 15), 0, 50) / 100;
  const low = () => lowAt() > 0 && pct() >= 0 && pct() <= lowAt();
  const full = () => !!o().fullWarn && pct() >= clamp(num(o().fullAt, 98), 80, 100) / 100;
  const levelColor = () => {
    const p = pct();
    if (p <= Math.max(lowAt(), 0.15)) return (o().colLow as string) || "#ff4d4f";
    if (p < 0.5) return (o().colMid as string) || "#ffcc33";
    return (o().colHigh as string) || "#33d17a";
  };
  const colDeploy = () => (o().colDeploy as string) || "#ff8a2a";
  const colRegen = () => (o().colRegen as string) || "#4aa8ff";
  /** 1 harcıyor, -1 geri kazanıyor, 0 boşta */
  const flow = () => (kw() > 3 ? 1 : kw() < -3 ? -1 : 0);
  const flowColor = () => (flow() > 0 ? colDeploy() : flow() < 0 ? colRegen() : "var(--ov-dim)");
  const hasPower = () => data()?.mgukKw != null;
  const kwRatio = () => clamp(Math.abs(kw()) / kwPeak, 0, 1);

  const modeName = () => {
    const d = data();
    if (!d || d.mode < 0) return "";
    if (d.modeSet === 1) return [t("Biriktir"), t("Dengeli"), t("Atak"), t("Sıralama turu")][d.mode] ?? `${t("Mod")} ${d.mode}`;
    return `${t("Mod")} ${d.mode}`;
  };
  const drsName = () => {
    switch (data()?.drs) {
      case 3:
        return t("Açık");
      case 2:
        return t("Açılabilir");
      case 1:
        return t("Hazır");
      default:
        return t("Kapalı");
    }
  };

  const fmtPct = () => (pct() < 0 ? "—" : `${Math.round(pct() * 100)}`);
  const fmtSigned = (v: number | null, digits = 1) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`);
  const fmtKw = (v: number | null | undefined) => (v == null ? "—" : `${v > 0.5 ? "+" : v < -0.5 ? "−" : ""}${Math.abs(v).toFixed(0)}`);
  const signClass = (v: number | null) => (v == null || Math.abs(v) < 0.05 ? "" : v > 0 ? "ers-pos" : "ers-neg");

  return {
    o,
    data,
    pct,
    kw,
    lapStart,
    recent,
    delta,
    avg,
    lapsTo,
    low,
    full,
    levelColor,
    colDeploy,
    colRegen,
    flow,
    flowColor,
    hasPower,
    kwRatio,
    modeName,
    drsName,
    fmtPct,
    fmtSigned,
    fmtKw,
    signClass,
    showMj: () => !!o().showMj && (data()?.batteryMj ?? -1) >= 0,
    showDeploy: () => !!o().showDeploy && (data()?.lapDeployLeft ?? -1) >= 0,
    showMode: () => !!o().showMode && (data()?.mode ?? -1) >= 0,
    showP2p: () => !!o().showP2pDrs && (data()?.p2pCount ?? -1) >= 0,
    showDrs: () => !!o().showP2pDrs && (data()?.drs ?? -1) >= 0,
    showPower: () => !!o().showPower && hasPower(),
    showMarker: () => !!o().showMarker && lapStart() != null,
  };
}

const SAMPLE_HIST: LapEnd[] = [0.52, 0.58, 0.66, 0.6, 0.55, 0.61].map((end, i, a) => ({ lap: i + 1, net: end - (a[i - 1] ?? 0.5), end }));

type Model = ReturnType<typeof createModel>;

export default function ErsOverlay(props: OverlayProps) {
  const m = createModel(props);
  const o = () => props.options;
  const design = (): Design => {
    const d = o().design as Design;
    return DESIGNS.includes(d) && !overlayValueLocked("ers", "design", d) ? d : "bar";
  };
  const noHybrid = () => !!m.data() && !m.data()!.hasHybrid;
  const visible = () => {
    const d = m.data();
    if (!d) return false;
    if (props.editing || demoShow()) return true;
    if (!d.hasHybrid && o().hideNoHybrid !== false) return false;
    if (o().hidePits && d.onPitRoad) return false;
    return true;
  };
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 14), 10, 28)}px`,
    "--ers-level": m.levelColor(),
    "--ers-deploy": m.colDeploy(),
    "--ers-regen": m.colRegen(),
    "--ers-flow": m.flowColor(),
    ...(design() === "bar" || design() === "panel" ? { width: `${clamp(num(o().width, 300), 200, 600)}px` } : {}),
  });

  return (
    <Show when={visible()}>
      <div
        class={`ers ers-d-${design()} ov-panel`}
        classList={{ "ers-low": m.low(), "ers-full": m.full(), "ers-frozen": previewFrozen(), "ers-none": noHybrid() }}
        style={style()}
      >
        <Show
          when={!noHybrid()}
          fallback={
            <div class="ers-nohybrid">
              <Bolt />
              <span>Bu araçta hibrit sistem yok</span>
            </div>
          }
        >
          <Switch>
            <Match when={design() === "bar"}>
              <BarDesign m={m} />
            </Match>
            <Match when={design() === "cell"}>
              <CellDesign m={m} />
            </Match>
            <Match when={design() === "chip"}>
              <ChipDesign m={m} />
            </Match>
            <Match when={design() === "ring"}>
              <RingDesign m={m} />
            </Match>
            <Match when={design() === "panel"}>
              <PanelDesign m={m} />
            </Match>
          </Switch>
        </Show>
      </div>
    </Show>
  );
}

// ---- ortak parçalar ----

function Badges(p: { m: Model }) {
  const m = p.m;
  return (
    <>
      <Show when={m.showMode()}>
        <span class="ers-badge ers-mode">{m.modeName()}</span>
      </Show>
      <Show when={m.showP2p()}>
        <span class="ers-badge" classList={{ "ers-on": m.data()?.p2pActive }} data-no-i18n>
          P2P {m.data()?.p2pCount}
        </span>
      </Show>
      <Show when={m.showDrs()}>
        <span class="ers-badge ers-drs" classList={{ "ers-on": m.data()?.drs === 3, "ers-ready": m.data()?.drs === 2 || m.data()?.drs === 1 }} data-no-i18n>
          DRS
        </span>
      </Show>
    </>
  );
}

function Delta(p: { m: Model }) {
  return (
    <Show when={p.m.o().showDelta && p.m.delta() != null}>
      <span class={`ers-delta ${p.m.signClass(p.m.delta())}`} title={t("Bu turdaki net fark")} data-no-i18n>
        {p.m.fmtSigned(p.m.delta())}
      </span>
    </Show>
  );
}

function Power(p: { m: Model }) {
  const m = p.m;
  return (
    <Show when={m.showPower()}>
      <span class="ers-power" data-no-i18n>
        <i>MGU-K</i>
        <b style={{ color: m.flowColor() }}>{m.fmtKw(m.kw())}</b> kW
        <Show when={m.data()?.mguhKw != null}>
          <i class="ers-gap">MGU-H</i>
          <b>{m.fmtKw(m.data()?.mguhKw)}</b> kW
        </Show>
      </span>
    </Show>
  );
}

function Warn(p: { m: Model }) {
  return (
    <Switch>
      <Match when={p.m.low()}>
        <span class="ers-warn ers-warn-low">Batarya düşük</span>
      </Match>
      <Match when={p.m.full()}>
        <span class="ers-warn ers-warn-full">Dolu: harcamayı unutma</span>
      </Match>
    </Switch>
  );
}

/** Yatay batarya çubuğu + tur başı işareti (bar ve panel tasarımlarında) */
function Track(p: { m: Model }) {
  const m = p.m;
  return (
    <div class="ers-track">
      <div class="ers-fill" style={{ width: `${clamp(m.pct(), 0, 1) * 100}%` }} />
      <Show when={m.showMarker()}>
        <i class="ers-tick" style={{ left: `${clamp(m.lapStart() ?? 0, 0, 1) * 100}%` }} />
      </Show>
    </div>
  );
}

function DeployBar(p: { m: Model }) {
  return (
    <Show when={p.m.showDeploy()}>
      <div class="ers-dep" title={t("Bu turda kalan harcama hakkı")}>
        <div style={{ width: `${clamp(p.m.data()?.lapDeployLeft ?? 0, 0, 1) * 100}%` }} />
      </div>
    </Show>
  );
}

// ---- 1) Yatay çubuk ----

function BarDesign(p: { m: Model }) {
  const m = p.m;
  return (
    <>
      <div class="ers-row">
        <span class="ers-ico">
          <Bolt />
        </span>
        <Show when={m.o().showPct}>
          <b class="ers-pct" data-no-i18n>
            {m.fmtPct()}
            <small>%</small>
          </b>
        </Show>
        <Show when={m.showMj()}>
          <span class="ers-mj" data-no-i18n>{m.data()!.batteryMj.toFixed(2)} MJ</span>
        </Show>
        <Delta m={m} />
        <span class="ers-spacer" />
        <Badges m={m} />
      </div>
      <Track m={m} />
      <DeployBar m={m} />
      <Show when={m.showPower() || m.low() || m.full()}>
        <div class="ers-row ers-foot">
          <Power m={m} />
          <span class="ers-spacer" />
          <Warn m={m} />
        </div>
      </Show>
    </>
  );
}

// ---- 2) Dikey pil ----

const SEGMENTS = 10;

function CellDesign(p: { m: Model }) {
  const m = p.m;
  const lit = () => clamp(m.pct(), 0, 1) * SEGMENTS;
  return (
    <>
      <div class="ers-cellwrap">
        <div class="ers-cap" />
        <div class="ers-cellbody">
          <For each={Array.from({ length: SEGMENTS }, (_, i) => SEGMENTS - 1 - i)}>
            {(i) => <i class="ers-seg" style={{ opacity: clamp(lit() - i, 0, 1) * 0.88 + 0.12, background: lit() - i > 0 ? "var(--ers-level)" : "var(--ov-dim)" }} />}
          </For>
          <Show when={m.showMarker()}>
            <i class="ers-vtick" style={{ bottom: `${clamp(m.lapStart() ?? 0, 0, 1) * 100}%` }} />
          </Show>
        </div>
        <Show when={m.showDeploy()}>
          <div class="ers-vdep" title={t("Bu turda kalan harcama hakkı")}>
            <div style={{ height: `${clamp(m.data()?.lapDeployLeft ?? 0, 0, 1) * 100}%` }} />
          </div>
        </Show>
      </div>
      <div class="ers-col">
        <span class="ers-flow" classList={{ "ers-up": m.flow() < 0, "ers-down": m.flow() > 0 }}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2 13.5 9H10v5H6V9H2.5z" fill="currentColor" />
          </svg>
        </span>
        <Show when={m.o().showPct}>
          <b class="ers-pct" data-no-i18n>
            {m.fmtPct()}
            <small>%</small>
          </b>
        </Show>
        <Show when={m.showMj()}>
          <span class="ers-mj" data-no-i18n>{m.data()!.batteryMj.toFixed(2)} MJ</span>
        </Show>
        <Delta m={m} />
        <Show when={m.showPower()}>
          <span class="ers-power" data-no-i18n>
            <b style={{ color: m.flowColor() }}>{m.fmtKw(m.kw())}</b> kW
          </span>
        </Show>
        <Badges m={m} />
        <Warn m={m} />
      </div>
    </>
  );
}

// ---- 3) Kompakt ----

function ChipDesign(p: { m: Model }) {
  const m = p.m;
  return (
    <>
      <span class="ers-ico">
        <Bolt />
      </span>
      <Show when={m.o().showPct}>
        <b class="ers-pct" data-no-i18n>
          {m.fmtPct()}
          <small>%</small>
        </b>
      </Show>
      <Show when={m.showMj()}>
        <span class="ers-mj" data-no-i18n>{m.data()!.batteryMj.toFixed(1)} MJ</span>
      </Show>
      <Delta m={m} />
      <Show when={m.showPower()}>
        <span class="ers-power" data-no-i18n>
          <b style={{ color: m.flowColor() }}>{m.fmtKw(m.kw())}</b> kW
        </span>
      </Show>
      <Badges m={m} />
      <div class="ers-under">
        <div style={{ width: `${clamp(m.pct(), 0, 1) * 100}%` }} />
        <Show when={m.showMarker()}>
          <i class="ers-tick" style={{ left: `${clamp(m.lapStart() ?? 0, 0, 1) * 100}%` }} />
        </Show>
      </div>
    </>
  );
}

// ---- 4) Halka gösterge ----

function RingDesign(p: { m: Model }) {
  const m = p.m;
  // pathLength=100: dasharray doğrudan yüzde
  const tickAngle = () => clamp(m.lapStart() ?? 0, 0, 1) * 360;
  return (
    <>
      <div class="ers-ringwrap">
        <svg viewBox="0 0 120 120" class="ers-ringsvg" aria-hidden="true">
          <circle class="ers-ring-bg" cx="60" cy="60" r="52" />
          <circle class="ers-ring-fg" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray={`${clamp(m.pct(), 0, 1) * 100} 100`} transform="rotate(-90 60 60)" />
          <Show when={m.showMarker()}>
            <line class="ers-ring-tick" x1="60" y1="2" x2="60" y2="14" transform={`rotate(${tickAngle()} 60 60)`} />
          </Show>
          <Show when={m.showPower()}>
            {/* İç yay: saat yönünde harcama, ters yönde geri kazanım (her biri en çok yarım tur) */}
            <circle class="ers-ring-in" cx="60" cy="60" r="41" />
            <circle
              class="ers-ring-pow"
              cx="60"
              cy="60"
              r="41"
              pathLength="200"
              stroke={m.flowColor()}
              stroke-dasharray={`${m.kwRatio() * 100} 200`}
              transform={m.kw() >= 0 ? "rotate(-90 60 60)" : "rotate(-90 60 60) scale(1 -1) translate(0 -120)"}
            />
          </Show>
          <Show when={m.showDeploy()}>
            <circle class="ers-ring-in" cx="60" cy="60" r="33" style={{ "stroke-width": "2" }} />
            <circle class="ers-ring-dep" cx="60" cy="60" r="33" pathLength="100" stroke-dasharray={`${clamp(m.data()?.lapDeployLeft ?? 0, 0, 1) * 100} 100`} transform="rotate(-90 60 60)" />
          </Show>
        </svg>
        <div class="ers-ringmid">
          <Show when={m.o().showPct} fallback={<Bolt />}>
            <b class="ers-pct" data-no-i18n>
              {m.fmtPct()}
              <small>%</small>
            </b>
          </Show>
          <Delta m={m} />
          <Show when={m.showPower()}>
            <span class="ers-power" data-no-i18n>
              <b style={{ color: m.flowColor() }}>{m.fmtKw(m.kw())}</b> kW
            </span>
          </Show>
        </div>
      </div>
      <Show when={m.showMj() || m.showMode() || m.showP2p() || m.showDrs() || m.low() || m.full()}>
        <div class="ers-ringfoot">
          <Show when={m.showMj()}>
            <span class="ers-mj" data-no-i18n>{m.data()!.batteryMj.toFixed(2)} MJ</span>
          </Show>
          <Badges m={m} />
          <Warn m={m} />
        </div>
      </Show>
    </>
  );
}

// ---- 5) Detaylı panel ----

function Cell(p: { label: string; children: JSX.Element; cls?: string }) {
  return (
    <div class="ers-kv">
      <span>{p.label}</span>
      <b class={p.cls} data-no-i18n>
        {p.children}
      </b>
    </div>
  );
}

function PanelDesign(p: { m: Model }) {
  const m = p.m;
  const d = () => m.data()!;
  const W = 200;
  const H = 34;
  /** Son turların tur sonu doluluğu + şu anki değer */
  const spark = createMemo(() => {
    const pts = [...m.recent().map((x) => x.end), clamp(m.pct(), 0, 1)];
    if (pts.length < 2) return "";
    return pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - 2 - clamp(v, 0, 1) * (H - 4)).toFixed(1)}`).join(" ");
  });
  return (
    <>
      <div class="ers-row">
        <span class="ers-ico">
          <Bolt />
        </span>
        <span class="ers-title">ERS</span>
        <Delta m={m} />
        <span class="ers-spacer" />
        <Badges m={m} />
      </div>
      <Track m={m} />
      <DeployBar m={m} />
      <div class="ers-grid">
        <Show when={m.o().showPct}>
          <Cell label={t("Batarya")}>{m.fmtPct()}%</Cell>
        </Show>
        <Show when={m.showMj()}>
          <Cell label={t("Enerji")}>{d().batteryMj.toFixed(2)} MJ</Cell>
        </Show>
        <Show when={m.o().showDelta}>
          <Cell label={t("Bu tur")} cls={m.signClass(m.delta())}>
            {m.fmtSigned(m.delta())}
          </Cell>
          <Cell label={t("Tur ortalaması")} cls={m.signClass(m.avg())}>
            {m.fmtSigned(m.avg())}
          </Cell>
          <Cell label={m.lapsTo()?.dir === 1 ? t("Dolmaya") : t("Boşalmaya")}>
            {m.lapsTo() ? `${m.lapsTo()!.laps >= 99 ? "99+" : m.lapsTo()!.laps.toFixed(1)} ${t("tur")}` : "—"}
          </Cell>
        </Show>
        <Show when={m.showDeploy()}>
          <Cell label={t("Tur harcama hakkı")}>{Math.round(clamp(d().lapDeployLeft, 0, 1) * 100)}%</Cell>
        </Show>
        <Show when={m.showPower()}>
          <Cell label="MGU-K">
            <span style={{ color: m.flowColor() }}>{m.fmtKw(m.kw())}</span> kW
          </Cell>
          <Show when={d().mguhKw != null}>
            <Cell label="MGU-H">{m.fmtKw(d().mguhKw)} kW</Cell>
          </Show>
        </Show>
        <Show when={m.showMode()}>
          <Cell label={t("Harcama modu")}>{m.modeName()}</Cell>
        </Show>
        <Show when={m.o().showMode && d().regenGain >= 0}>
          <Cell label={t("Geri kazanım")}>{d().regenGain.toFixed(0)}</Cell>
        </Show>
        <Show when={m.showP2p()}>
          <Cell label="P2P" cls={d().p2pActive ? "ers-pos" : ""}>
            {d().p2pCount}
          </Cell>
        </Show>
        <Show when={m.showDrs()}>
          <Cell label="DRS" cls={d().drs === 3 ? "ers-pos" : ""}>
            {m.drsName()}
          </Cell>
        </Show>
      </div>
      <Show when={spark()}>
        <svg class="ers-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} class="ers-spark-mid" />
          <polyline points={spark()} />
        </svg>
      </Show>
      <Show when={m.low() || m.full()}>
        <div class="ers-row ers-foot">
          <Warn m={m} />
        </div>
      </Show>
    </>
  );
}
