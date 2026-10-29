// Kan Şekeri overlay'inin ek tasarımları (SVG ile çizilir): Kadran Pro, Büyük sayı, Gösterge, Skala, Mini, Tahmin,
// Arka plansız. Renkler .gl üzerindeki CSS değişkenlerinden gelir (--gl-c: duruma göre renk, --gl-normal / --gl-warn /
// --gl-urgent / --gl-bg / --gl-text). Ölçüler tasarımın kendi tuvalindedir (viewBox); "Kutu boyutu" ayarı tümünü büyütür.
import { For, Show, type JSX } from "solid-js";
import { t } from "@/sdk/i18n";

/** Ölçek çubuklarında gösterilen aralık (mg/dL) */
export const V_MIN = 40;
export const V_MAX = 300;

/** 30 dk tahmin: son ~30 dakikadaki ölçümlere doğru uydurulur */
export interface Forecast {
  /** m dakika sonraki tahmin (mg/dL) */
  at: (m: number) => number;
  /** m dakika sonraki belirsizlik (± mg/dL) */
  hw: (m: number) => number;
  /** 0..1 */
  conf: number;
}

export function forecast(hist: [number, number][], ts: number): Forecast | null {
  const pts = hist.filter((p) => p[0] >= ts - 32 * 60_000 && p[0] <= ts + 60_000);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => (p[0] - ts) / 60_000);
  const ys = pts.map((p) => p[1]);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx < 1) return null;
  // Değişim hızı en çok 4 mg/dL/dk ile sınırlı (sensör sıçramaları tahmini uçurmasın)
  const slope = Math.max(-4, Math.min(4, sxy / sxx));
  const v0 = ys[n - 1];
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - (my + slope * (xs[i] - mx))) ** 2;
  const rmse = Math.sqrt(ss / n);
  return {
    at: (m) => Math.max(20, Math.min(500, v0 + slope * m)),
    hw: (m) => (rmse + 3) * Math.sqrt(1 + m / 6),
    conf: Math.max(0.2, Math.min(0.98, 1 - rmse / 18)),
  };
}

/** Bir tasarımın çizimi için gereken her şey */
export interface Ctx {
  value: number | null;
  /** Gösterilen değer metni ("112", "6.2", "—") */
  text: string;
  arrow: string;
  stale: boolean;
  low: number;
  high: number;
  uLow: number;
  uHigh: number;
  unit: string;
  delta: string;
  time: string;
  hist: [number, number][];
  ts: number;
  fc: Forecast | null;
  /** Durum yazısı (DÜŞÜK, ÇOK YÜKSEK, DÜŞECEK …); boş: normal */
  status: string;
  /** Durum rengi (CSS) */
  scolor: string;
  /** Tahmin satırı ("30 dk ≈ 95") */
  pline: string;
  fmt: (v: number) => string;
  /** Değer rengi bu değer için (bölge rengi, CSS) */
  zone: (v: number) => string;
  /** Sayı yazı ağırlığı */
  weight: number;
  showArrow: boolean;
}

const C = "var(--gl-c)";
const BG = "var(--gl-bg)";
const TXT = "var(--gl-text)";
const SUB = "color-mix(in srgb, var(--gl-text) 60%, var(--gl-bg))";
const BAND = "color-mix(in srgb, var(--gl-normal) 16%, transparent)";
/** Arka plan ile renk karışımı (k: 0..1 renk oranı) */
const mix = (col: string, k: number) => `color-mix(in srgb, ${col} ${Math.round(k * 100)}%, var(--gl-bg))`;
const fr = (v: number) => (Math.min(Math.max(v, V_MIN), V_MAX) - V_MIN) / (V_MAX - V_MIN);

function zonesOf(x: Ctx): [number, number, string][] {
  return (
    [
      [V_MIN, x.uLow, "var(--gl-urgent)"],
      [x.uLow, x.low, "var(--gl-warn)"],
      [x.low, x.high, "var(--gl-normal)"],
      [x.high, x.uHigh, "var(--gl-warn)"],
      [x.uHigh, V_MAX, "var(--gl-urgent)"],
    ] as [number, number, string][]
  ).filter((z) => fr(z[1]) > fr(z[0]));
}

/** Kutu: arka plan + duruma göre renkli kenar */
const Frame = (p: { w: number; h: number; r: number }) => (
  <rect class="gld-frame" x="1.5" y="1.5" width={p.w - 3} height={p.h - 3} rx={Math.min(p.r, (p.h - 3) / 2)} style={{ fill: BG, stroke: mix(C, 0.45) }} />
);

/** Sayı + ok (SVG metni) */
function NumArrow(p: { x: Ctx; cx: number; cy: number; size: number; anchor?: "middle" | "start"; shadow?: boolean }) {
  const arrow = () => (p.x.showArrow && p.x.arrow && p.x.value != null ? p.x.arrow : "");
  return (
    <text
      x={p.cx}
      y={p.cy}
      text-anchor={p.anchor ?? "middle"}
      dominant-baseline="central"
      class="gld-num"
      classList={{ "gld-shadow": !!p.shadow }}
      style={{ "font-size": `${p.size}px`, "font-weight": p.x.weight, fill: C }}
    >
      {p.x.text}
      <Show when={arrow()}>
        <tspan dx={p.size * 0.12} style={{ "font-size": `${p.size * 0.5}px`, fill: TXT, "font-weight": 700 }}>
          {arrow()}
        </tspan>
      </Show>
    </text>
  );
}

const Txt = (p: { x: number; y: number; size: number; fill?: string; bold?: boolean; anchor?: "start" | "middle" | "end"; children: JSX.Element; cls?: string }) => (
  <text
    x={p.x}
    y={p.y}
    text-anchor={p.anchor ?? "middle"}
    dominant-baseline="central"
    class={p.cls}
    style={{ "font-size": `${p.size}px`, "font-weight": p.bold ? 700 : 500, fill: p.fill ?? SUB }}
  >
    {p.children}
  </text>
);

/** Yay yolu (derece, 0 = sağ, saat yönünde artar) */
function arcPath(cx: number, cy: number, r: number, a1: number, a2: number) {
  if (Math.abs(a2 - a1) < 0.2) return "";
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x1, y1] = p(a1);
  const [x2, y2] = p(a2);
  const sweep = a2 > a1 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Durum hapı (renkli yarı saydam zemin) */
function Chip(p: { x: number; y: number; text: string; color: string; size: number; anchor?: "end" | "middle" }) {
  const w = () => p.text.length * p.size * 0.66 + p.size * 1.6;
  const h = () => p.size * 2;
  const left = () => (p.anchor === "middle" ? p.x - w() / 2 : p.x - w());
  return (
    <g>
      <rect x={left()} y={p.y - h() / 2} width={w()} height={h()} rx={h() / 2} style={{ fill: mix(p.color, 0.24) }} />
      <Txt x={left() + w() / 2} y={p.y} size={p.size} bold fill={p.color}>
        {p.text}
      </Txt>
    </g>
  );
}

// ---------------------------------------------------------------- tasarımlar

/** Kadran Pro: bölgeli 270° halka, eşik çentikleri, değer işaretçisi, dış halkada 30 dk tahmin yayı, durum hapı */
export function DialPro(p: { x: Ctx }) {
  const x = p.x;
  const W = 148;
  const cx = W / 2;
  const R = cx - 3 - 4.5 - 11;
  const rw = 9;
  const ang = (v: number) => 135 + 270 * fr(v);
  const pt = (a: number, r: number) => [cx + r * Math.cos((a * Math.PI) / 180), cx + r * Math.sin((a * Math.PI) / 180)];
  const word = () => x.status || (x.value != null ? t("NORMAL") : "");
  const wcol = () => (x.status ? x.scolor : "var(--gl-normal)");
  const fcv = () => (x.fc && x.value != null && !x.stale ? Math.max(V_MIN, Math.min(V_MAX, x.fc.at(30))) : null);
  return (
    <svg class="gld" viewBox={`0 0 ${W} ${W}`} width={W} height={W}>
      <circle class="gld-frame" cx={cx} cy={cx} r={cx - 3} style={{ fill: BG, stroke: mix(C, 0.4) }} />
      <circle cx={cx} cy={cx} r={R - rw / 2 - 2} style={{ fill: "color-mix(in srgb, var(--gl-text) 4%, var(--gl-bg))" }} />
      <For each={zonesOf(x)}>{(z) => <path d={arcPath(cx, cx, R, ang(z[0]), ang(z[1]))} style={{ stroke: mix(z[2], 0.28), "stroke-width": rw, fill: "none" }} />}</For>
      <Show when={x.value != null && !x.stale}>
        <For each={zonesOf(x).filter((z) => x.value! > z[0])}>
          {(z) => <path d={arcPath(cx, cx, R, ang(z[0]), ang(Math.min(x.value!, z[1])))} style={{ stroke: z[2], "stroke-width": rw, fill: "none" }} />}
        </For>
      </Show>
      {/* Eşik çentikleri */}
      <For each={[x.low, x.high]}>
        {(v) => {
          const a = ang(v);
          const [x1, y1] = pt(a, R - rw / 2 - 2);
          const [x2, y2] = pt(a, R + rw / 2 + 2);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: TXT, "stroke-width": 1.6 }} />;
        }}
      </For>
      <Show when={fcv() != null && Math.abs(fcv()! - x.value!) >= 3}>
        {(() => {
          const R2 = R + rw / 2 + 5;
          const pc = x.zone(fcv()!);
          const [lo, hi] = [Math.min(x.value!, fcv()!), Math.max(x.value!, fcv()!)];
          const [gx, gy] = pt(ang(fcv()!), R2);
          return (
            <g>
              <path d={arcPath(cx, cx, R2, ang(lo), ang(hi))} style={{ stroke: pc, "stroke-width": 3, fill: "none", "stroke-linecap": "round" }} />
              <circle cx={gx} cy={gy} r="4" style={{ fill: BG, stroke: pc, "stroke-width": 2 }} />
            </g>
          );
        })()}
      </Show>
      <Show when={x.value != null}>
        {(() => {
          const [kx, ky] = pt(ang(x.value!), R);
          return (
            <g>
              <circle cx={kx} cy={ky} r="9" style={{ fill: mix(C, 0.3) }} />
              <circle cx={kx} cy={ky} r="5.5" style={{ fill: C, stroke: BG, "stroke-width": 2 }} />
            </g>
          );
        })()}
      </Show>
      <NumArrow x={x} cx={cx} cy={W * 0.43} size={34} />
      <Show when={word()}>
        <Chip x={cx} y={W * 0.6} text={word()} color={wcol()} size={8.5} anchor="middle" />
      </Show>
      <Txt x={cx} y={W * 0.72} size={8.5} bold={!!x.pline} fill={x.pline ? wcol() : SUB}>
        {x.pline || [x.delta, x.unit].filter(Boolean).join(" ")}
      </Txt>
      <Show when={x.time}>
        <Txt x={cx} y={W * 0.89} size={9.5}>
          {x.time}
        </Txt>
      </Show>
    </svg>
  );
}

/** Büyük sayı: sadece iri rakam, altında küçük satır */
export function BigNumber(p: { x: Ctx }) {
  const x = p.x;
  const [W, H] = [150, 92];
  const bits = () => (x.status ? [x.status, x.pline] : [x.unit, x.delta, x.time]).filter(Boolean).join("  ·  ");
  return (
    <svg class="gld" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <Frame w={W} h={H} r={26} />
      <NumArrow x={x} cx={W / 2} cy={H * 0.43} size={48} />
      <Txt x={W / 2} y={H * 0.84} size={9.5} bold={!!x.status} fill={x.status ? x.scolor : SUB}>
        {bits()}
      </Txt>
    </svg>
  );
}

/** Gösterge: yarım daire kadran (bölgeler), değer işaretçisi */
export function Gauge(p: { x: Ctx }) {
  const x = p.x;
  const [W, H] = [196, 136];
  const cx = W / 2;
  const cy = H * 0.66;
  const r = Math.min(W * 0.36, H * 0.56);
  const rw = 11;
  const ang = (v: number) => 180 + 180 * fr(v);
  const pt = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const bottom = () => (x.status ? [x.status, x.pline].filter(Boolean).join("  ") : x.time);
  return (
    <svg class="gld" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <Frame w={W} h={H} r={26} />
      <For each={zonesOf(x)}>{(z) => <path d={arcPath(cx, cy, r, ang(z[0]), ang(z[1]))} style={{ stroke: mix(z[2], 0.5), "stroke-width": rw, fill: "none" }} />}</For>
      <Show when={x.value != null}>
        {(() => {
          const [kx, ky] = pt(ang(x.value!));
          return (
            <g>
              <circle cx={kx} cy={ky} r="11" style={{ fill: mix(C, 0.28) }} />
              <circle cx={kx} cy={ky} r="7" style={{ fill: C, stroke: BG, "stroke-width": 2 }} />
            </g>
          );
        })()}
      </Show>
      <NumArrow x={x} cx={cx} cy={cy - 15} size={32} />
      <Txt x={cx} y={cy + 13} size={10}>
        {[x.delta, x.unit].filter(Boolean).join("  ")}
      </Txt>
      <Show when={bottom()}>
        <Txt x={cx} y={cy + 31} size={10} bold={!!x.status} fill={x.status ? x.scolor : SUB}>
          {bottom()}
        </Txt>
      </Show>
    </svg>
  );
}

/** Skala: hedef aralık çubuğu (bölgeler), üstünde değer işaretçisi */
export function Scale(p: { x: Ctx }) {
  const x = p.x;
  const [W, H] = [268, 98];
  const pad = 16;
  const [bx1, bx2, by, bh] = [pad, W - pad, H * 0.68, 8];
  const vx = (v: number) => bx1 + fr(v) * (bx2 - bx1);
  const right = () => (x.status ? [x.status, x.pline].filter(Boolean).join("  ") : x.time);
  return (
    <svg class="gld" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <Frame w={W} h={H} r={22} />
      <NumArrow x={x} cx={pad} cy={H * 0.27} size={30} anchor="start" />
      <Txt x={W - pad} y={H * 0.2} size={10} anchor="end">
        {[x.delta, x.unit].filter(Boolean).join("  ")}
      </Txt>
      <Show when={right()}>
        <Txt x={W - pad} y={H * 0.38} size={10} anchor="end" bold={!!x.status} fill={x.status ? x.scolor : SUB}>
          {right()}
        </Txt>
      </Show>
      <For each={zonesOf(x)}>{(z) => <rect x={vx(z[0])} y={by - bh / 2} width={Math.max(0, vx(z[1]) - vx(z[0]))} height={bh} style={{ fill: mix(z[2], 0.55) }} />}</For>
      <For each={[x.low, x.high]}>
        {(v) => (
          <Txt x={vx(v)} y={by + 16} size={9}>
            {x.fmt(v)}
          </Txt>
        )}
      </For>
      <Show when={x.value != null}>
        <polygon
          points={`${vx(x.value!) - 6},${by - bh / 2 - 11} ${vx(x.value!) + 6},${by - bh / 2 - 11} ${vx(x.value!)},${by - bh / 2 - 2}`}
          style={{ fill: C }}
        />
        <circle cx={vx(x.value!)} cy={by} r="6" style={{ fill: C, stroke: BG, "stroke-width": 2 }} />
      </Show>
    </svg>
  );
}

/** Mini: sadece sayı ve ok (hap) */
export function Mini(p: { x: Ctx }) {
  const x = p.x;
  const [W, H] = [104, 42];
  return (
    <svg class="gld" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <Frame w={W} h={H} r={H / 2} />
      <NumArrow x={x} cx={W / 2} cy={H / 2 + 1} size={21} />
    </svg>
  );
}

/** Tahmin: son 1 saat + önümüzdeki 30 dakikanın tahmini (belirsizlik konisiyle) */
export function ForecastBox(p: { x: Ctx }) {
  const x = p.x;
  const [W, H] = [300, 150];
  const pad = 16;
  const [gx1, gy1, gx2, gy2] = [pad, H * 0.5, W - pad, H - 20];
  const now = () => x.ts || Date.now();
  const t0 = () => now() - 3600_000;
  const tf = () => now() + 1800_000;
  const X = (tm: number) => gx1 + ((gx2 - gx1) * (tm - t0())) / (tf() - t0());
  const recent = () => x.hist.filter((q) => q[0] >= t0());
  const bounds = () => {
    const vals = recent().map((q) => q[1]);
    if (x.fc) for (const m of [0, 15, 30]) vals.push(x.fc.at(m) - x.fc.hw(m), x.fc.at(m) + x.fc.hw(m));
    return { lo: Math.min(x.low - 15, ...vals.map((v) => v - 8)), hi: Math.max(x.high + 20, ...vals.map((v) => v + 8)) };
  };
  const Y = (v: number) => {
    const b = bounds();
    return gy2 - ((Math.min(Math.max(v, b.lo), b.hi) - b.lo) / (b.hi - b.lo)) * (gy2 - gy1);
  };
  const line = () =>
    recent()
      .map((q, i) => `${i ? "L" : "M"}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}`)
      .join(" ");
  const v30 = () => (x.fc ? x.fc.at(30) : null);
  const label = () => (x.status ? [x.status, x.pline].filter(Boolean).join("  ") : x.value != null ? t("NORMAL") : "");
  const cone = () => {
    if (!x.fc || x.value == null) return "";
    const up: string[] = [];
    const dn: string[] = [];
    for (let m = 0; m <= 30; m += 3) {
      const hw = x.fc.hw(m);
      up.push(`${X(now() + m * 60_000).toFixed(1)},${Y(x.fc.at(m) + hw).toFixed(1)}`);
      dn.unshift(`${X(now() + m * 60_000).toFixed(1)},${Y(x.fc.at(m) - hw).toFixed(1)}`);
    }
    return [...up, ...dn].join(" ");
  };
  const fline = () => {
    if (!x.fc) return "";
    const a: string[] = [];
    for (let m = 0; m <= 30; m += 2) a.push(`${a.length ? "L" : "M"}${X(now() + m * 60_000).toFixed(1)} ${Y(x.fc.at(m)).toFixed(1)}`);
    return a.join(" ");
  };
  return (
    <svg class="gld" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <Frame w={W} h={H} r={22} />
      <Txt x={pad} y={17} size={8} bold anchor="start">
        {t("TAHMİN · 30 DK SONRA")}
        {x.fc ? `  ·  ${t("güven")} %${Math.round(x.fc.conf * 100)}` : ""}
      </Txt>
      <text x={pad} y={H * 0.3} dominant-baseline="central" class="gld-num" style={{ "font-size": "28px", "font-weight": x.weight, fill: v30() != null ? x.zone(v30()!) : SUB }}>
        {v30() != null ? `≈ ${x.fmt(v30()!)}` : "--"}
        <tspan dx="6" style={{ "font-size": "9px", fill: SUB, "font-weight": 500 }}>
          {x.unit}
        </tspan>
      </text>
      <Txt x={W - pad} y={H * 0.24} size={10} bold anchor="end" fill={C}>
        {`${t("şu an")} ${x.text} ${x.showArrow ? x.arrow : ""}`.trim()}
      </Txt>
      <Show when={label()}>
        <Txt x={W - pad} y={H * 0.38} size={9} bold anchor="end" fill={x.status ? x.scolor : "var(--gl-normal)"}>
          {label()}
        </Txt>
      </Show>
      <rect x={X(now())} y={gy1} width={Math.max(0, gx2 - X(now()))} height={gy2 - gy1} style={{ fill: "color-mix(in srgb, var(--gl-text) 5%, transparent)" }} />
      <rect x={gx1} y={Y(x.high)} width={gx2 - gx1} height={Math.max(1, Y(x.low) - Y(x.high))} style={{ fill: BAND }} />
      <line x1={X(now())} y1={gy1} x2={X(now())} y2={gy2} style={{ stroke: SUB, "stroke-dasharray": "2 3" }} />
      <Show when={recent().length >= 2}>
        <path d={line()} style={{ fill: "none", stroke: C, "stroke-width": 2.4, "stroke-linejoin": "round", "stroke-linecap": "round" }} />
      </Show>
      <Show
        when={x.fc && x.value != null}
        fallback={
          <Txt x={(X(now()) + gx2) / 2} y={(gy1 + gy2) / 2} size={8}>
            {t("veri bekleniyor")}
          </Txt>
        }
      >
        <polygon points={cone()} style={{ fill: mix(x.zone(v30()!), 0.16) }} />
        <path d={fline()} style={{ fill: "none", stroke: x.zone(v30()!), "stroke-width": 2.4, "stroke-dasharray": "5 4", "stroke-linecap": "round" }} />
        <circle cx={X(now())} cy={Y(x.value!)} r="3.5" style={{ fill: C, stroke: BG, "stroke-width": 2 }} />
      </Show>
      <Txt x={gx1} y={H - 9} size={8} anchor="start">
        −60 {t("dk")}
      </Txt>
      <Txt x={X(now())} y={H - 9} size={8}>
        {t("şimdi")}
      </Txt>
      <Txt x={gx2} y={H - 9} size={8} anchor="end">
        +30 {t("dk")}
      </Txt>
    </svg>
  );
}

/** Arka plansız: gölgeli iri sayı ve durum (oyunun / videonun üstünde) */
export function Hud(p: { x: Ctx }) {
  const x = p.x;
  const [W, H] = [150, 72];
  const word = () => x.status || (x.value != null ? t("NORMAL") : "");
  const line = () => [word(), x.pline].filter(Boolean).join("  ") || x.unit;
  return (
    <svg class="gld gld-hud" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <NumArrow x={x} cx={W / 2} cy={H * 0.4} size={40} shadow />
      <Txt x={W / 2} y={H * 0.82} size={10} bold cls="gld-shadow" fill={x.status ? x.scolor : x.value != null ? "var(--gl-normal)" : SUB}>
        {line()}
      </Txt>
    </svg>
  );
}

export const SVG_DESIGNS: Record<string, (p: { x: Ctx }) => JSX.Element> = {
  dialpro: DialPro,
  number: BigNumber,
  gauge: Gauge,
  scale: Scale,
  mini: Mini,
  forecast: ForecastBox,
  hud: Hud,
};
