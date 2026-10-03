// Pedal Seti overlay'i: grafiksiz pedal göstergeleri (özgün çizimler; hiçbir ürünün görseli / adı / logosu kullanılmaz).
//   pedals     → Pedal seti (varsayılan)
//   bars       → Dikey çubuklar
//   strip      → Kompakt şerit
//   horizontal → Yatay şeritler
//   rings      → Halka göstergeler
//   segments   → LED segmentler
//   hud        → HUD (çerçevesiz)
// Bu tasarımlar eskiden Pedallar & Girdi (inputs) overlay'indeydi; ortak parçalar ve stiller hâlâ oradan gelir
// (src/overlays/inputs/shared.tsx, designs.css, style.css).

import { For, Match, Show, Switch, createUniqueId, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import { Bars, CLUTCH, LapLines, SteerBar, VBar, Wheel, clamp, createModel, n100, type Model } from "../inputs/shared";

// "tower" (Dikey kule) kaldırıldı: kayıtlı değer varsayılana (Dikey çubuklar) düşer
export const DESIGNS = ["pedals", "bars", "strip", "horizontal", "rings", "segments", "hud"] as const;
export type Design = (typeof DESIGNS)[number];
const isDesign = (v: unknown): v is Design => DESIGNS.includes(v as Design);

/** PRO'ya ayrılmış tasarım kilitliyse varsayılan (Dikey çubuklar) gösterilir. */
export default function Pedals(props: OverlayProps) {
  const m = createModel(props, "pedals");
  const design = (): Design => {
    const d = props.options.design;
    return isDesign(d) && !overlayValueLocked("pedals", "design", d) ? d : "bars";
  };
  return (
    <div class="inp-stack">
      <Switch>
        <Match when={design() === "pedals"}>
          <PedalsDesign m={m} />
        </Match>
        <Match when={design() === "bars"}>
          <BarsDesign m={m} />
        </Match>
        <Match when={design() === "strip"}>
          <StripDesign m={m} />
        </Match>
        <Match when={design() === "horizontal"}>
          <HorizontalDesign m={m} />
        </Match>
        <Match when={design() === "rings"}>
          <RingsDesign m={m} />
        </Match>
        <Match when={design() === "segments"}>
          <SegmentsDesign m={m} />
        </Match>
        <Match when={design() === "hud"}>
          <HudDesign m={m} />
        </Match>
      </Switch>
      <LapLines {...props} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Dikey çubuklar
// ---------------------------------------------------------------------------------------------------------
function BarsDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-vb" classList={{ shift: m.shiftOn() }}>
      <Bars m={m} h={m.showPct() ? 92 : 108} />
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-side">
          <Show when={m.o.showGear}>
            <b class="inx-gearbox">{m.gear()}</b>
            <span class="inx-speed">{m.speed()}</span>
            <small class="inx-unit">{m.unit()}</small>
          </Show>
          <Show when={m.o.showSteer}>
            <Wheel m={m} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Yatay şeritler
// ---------------------------------------------------------------------------------------------------------
function HRow(props: { label: string; v: number; color: string; h: number; glow?: boolean; glowColor?: string; num: boolean }) {
  return (
    <div class="inx-hrow">
      <span class="inx-hlabel">{props.label}</span>
      <div class="inx-hbar" classList={{ glow: !!props.glow }} style={{ height: `${props.h}px`, "--glow": props.glowColor }}>
        <div class="inx-hfill" style={{ transform: `scaleX(${clamp(props.v, 0, 1)})`, background: props.color }} />
      </div>
      <Show when={props.num}>
        <span class="inx-hnum">{n100(props.v)}</span>
      </Show>
    </div>
  );
}

function HorizontalDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-hz" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showGear}>
        <div class="inx-hzgear">
          <b class="inx-gear">{m.gear()}</b>
          <span class="inx-speed">{m.speed()}</span>
          <small class="inx-unit">{m.unit()}</small>
        </div>
      </Show>
      <div class="inx-hrows">
        <HRow label={t("Gaz")} v={m.throttle()} color={m.thrFill()} h={m.barW()} num={m.showPct()} glow={m.tcFrame()} glowColor={m.tcColor()} />
        <HRow label={t("Fren")} v={m.brake()} color={m.brakeFill()} h={m.barW()} num={m.showPct()} glow={m.absFrame()} glowColor={m.absColor()} />
        <Show when={m.o.showClutch}>
          <HRow label={t("Debriyaj")} v={m.clutch()} color={CLUTCH} h={m.barW()} num={m.showPct()} />
        </Show>
        <Show when={m.o.showSteer}>
          <div class="inx-hrow">
            <span class="inx-hlabel">{t("Direksiyon")}</span>
            <SteerBar m={m} />
            <Show when={m.showPct()}>
              <span class="inx-hnum">{m.steerDeg()}°</span>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Halka göstergeler
// ---------------------------------------------------------------------------------------------------------
const R = 40;
const pt = (deg: number, r = R) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
};
// Açı: +x ekseninden saat yönünde (SVG'de y aşağı). Gaz sağda aşağıdan yukarı, fren solda aşağıdan yukarı dolar.
const ARC_THR = `M ${pt(58)} A ${R} ${R} 0 0 0 ${pt(-58)}`;
const ARC_BRK = `M ${pt(122)} A ${R} ${R} 0 0 1 ${pt(238)}`;
const ARC_CLU = `M ${pt(112)} A ${R} ${R} 0 0 0 ${pt(68)}`;
const ARC_STR = `M ${pt(-116)} A ${R} ${R} 0 0 1 ${pt(-64)}`;

function Arc(props: { d: string; v: number; color: string; w: number; glow?: boolean; glowColor?: string }) {
  return (
    <>
      <path d={props.d} class="inx-arcbg" stroke-width={props.w} />
      <path
        d={props.d}
        class="inx-arc"
        classList={{ glow: !!props.glow }}
        pathLength="100"
        stroke={props.color}
        stroke-width={props.w}
        stroke-dasharray={`${clamp(props.v, 0, 1) * 100} 100`}
        style={{ "--glow": props.glowColor } as JSX.CSSProperties}
      />
    </>
  );
}

function RingsDesign(props: { m: Model }) {
  const m = props.m;
  const w = () => clamp(m.barW() * 0.6, 3, 11);
  const mark = () => {
    const a = ((-90 + m.steerNorm() * 24) * Math.PI) / 180;
    return [R * Math.cos(a), R * Math.sin(a)];
  };
  return (
    <div class="ov-panel inx inx-rg" classList={{ shift: m.shiftOn() }}>
      <svg viewBox="-50 -50 100 100" class="inx-rings">
        <Arc d={ARC_BRK} v={m.brake()} color={m.brakeFill()} w={w()} glow={m.absFrame()} glowColor={m.absColor()} />
        <Arc d={ARC_THR} v={m.throttle()} color={m.thrFill()} w={w()} glow={m.tcFrame()} glowColor={m.tcColor()} />
        <Show when={m.o.showClutch}>
          <Arc d={ARC_CLU} v={m.clutch()} color={CLUTCH} w={w() * 0.7} />
        </Show>
        <Show when={m.o.showSteer}>
          <path d={ARC_STR} class="inx-arcbg" stroke-width="2.4" />
          <path d={`M ${pt(-90, R - 4)} L ${pt(-90, R + 4)}`} class="inx-arctick" />
          <circle r="3.6" class="inx-arcmark" cx={mark()[0]} cy={mark()[1]} />
        </Show>
        <Show when={m.o.showGear}>
          <text class="inx-rgear" y="6" text-anchor="middle">
            {m.gear()}
          </text>
          <text class="inx-rspeed" y="21" text-anchor="middle">
            {m.speed()}
          </text>
          <text class="inx-runit" y="29" text-anchor="middle">
            {m.unit()}
          </text>
        </Show>
        <Show when={m.showPct()}>
          <text class="inx-rpct" x="-13" y={m.o.showGear ? -17 : -3} text-anchor="middle" fill={m.o.brakeColor}>
            {n100(m.brake())}
          </text>
          <text class="inx-rpct" x="13" y={m.o.showGear ? -17 : -3} text-anchor="middle" fill={m.o.throttleColor}>
            {n100(m.throttle())}
          </text>
        </Show>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Kompakt şerit
// ---------------------------------------------------------------------------------------------------------
function StripDesign(props: { m: Model }) {
  const m = props.m;
  const cell = (v: number, color: string, glow?: boolean, glowColor?: string) => (
    <div class="inx-scell">
      <div class="inx-hbar" classList={{ glow: !!glow }} style={{ height: `${clamp(m.barW() * 0.6, 4, 14)}px`, "--glow": glowColor }}>
        <div class="inx-hfill" style={{ transform: `scaleX(${clamp(v, 0, 1)})`, background: color }} />
      </div>
      <Show when={m.showPct()}>
        <span class="inx-snum">{n100(v)}</span>
      </Show>
    </div>
  );
  return (
    <div class="ov-panel inx inx-st" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showGear}>
        <b class="inx-gear">{m.gear()}</b>
        <span class="inx-speed">
          {m.speed()} <small>{m.unit()}</small>
        </span>
        <i class="inx-sep" />
      </Show>
      <Show when={m.o.showClutch}>{cell(m.clutch(), CLUTCH)}</Show>
      {cell(m.brake(), m.brakeFill(), m.absFrame(), m.absColor())}
      {cell(m.throttle(), m.thrFill(), m.tcFrame(), m.tcColor())}
      <Show when={m.o.showSteer}>
        <SteerBar m={m} class="inx-ssteer" />
      </Show>
    </div>
  );
}
// ---------------------------------------------------------------------------------------------------------
// LED segmentler: gaz / fren (debriyaj) satırları ayrı ayrı yanan bloklardan oluşur
// ---------------------------------------------------------------------------------------------------------
const SEGS = Array.from({ length: 14 }, (_, i) => i);

function SegRow(props: { label: string; v: number; color: string; h: number; glow?: boolean; glowColor?: string; num: boolean }) {
  const lit = () => Math.round(clamp(props.v, 0, 1) * SEGS.length);
  return (
    <div class="inx-hrow">
      <span class="inx-hlabel inx-seglabel">{props.label}</span>
      <div class="inx-seg" classList={{ glow: !!props.glow }} style={{ height: `${props.h}px`, "--glow": props.glowColor, "--seg": props.color }}>
        <For each={SEGS}>{(i) => <i classList={{ on: i < lit() }} />}</For>
      </div>
      <Show when={props.num}>
        <span class="inx-hnum">{n100(props.v)}%</span>
      </Show>
    </div>
  );
}

function SegmentsDesign(props: { m: Model }) {
  const m = props.m;
  const h = () => clamp(m.barW() + 2, 8, 26);
  return (
    <div class="ov-panel inx inx-sg" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showGear}>
        <div class="inx-hzgear">
          <b class="inx-gearbox">{m.gear()}</b>
          <span class="inx-speed">
            {m.speed()} <small>{m.unit()}</small>
          </span>
        </div>
      </Show>
      <div class="inx-hrows inx-segrows">
        <SegRow label={t("Gaz")} v={m.throttle()} color={m.thrFill()} h={h()} num={m.showPct()} glow={m.tcFrame()} glowColor={m.tcColor()} />
        <SegRow label={t("Fren")} v={m.brake()} color={m.brakeFill()} h={h()} num={m.showPct()} glow={m.absFrame()} glowColor={m.absColor()} />
        <Show when={m.o.showClutch}>
          <SegRow label={t("Debriyaj")} v={m.clutch()} color={CLUTCH} h={h()} num={m.showPct()} />
        </Show>
        <Show when={m.o.showSteer}>
          <div class="inx-hrow">
            <span class="inx-hlabel inx-seglabel">{t("Direksiyon")}</span>
            <SteerBar m={m} />
            <Show when={m.showPct()}>
              <span class="inx-hnum">{m.steerDeg()}°</span>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Pedal seti: özgün pedal çizimleri; pedala basıldıkça plaka alttan dolar
// ---------------------------------------------------------------------------------------------------------
const PLATE_THR = "M 11 3 Q 11 1 13 1 L 21 1 Q 23 1 23.2 3 L 26 56 Q 26.2 60 22.5 60 L 11.5 60 Q 7.8 60 8 56 Z";
const PLATE_BRK = "M 4.5 13 Q 4.5 10 7.5 10 L 26.5 10 Q 29.5 10 29.6 13 L 31 49 Q 31 53 27 53 L 7 53 Q 3 53 3 49 Z";
const PLATE_CLU = "M 7 15 Q 7 12 10 12 L 24 12 Q 27 12 27.1 15 L 28.5 49 Q 28.5 53 24.5 53 L 9.5 53 Q 5.5 53 5.5 49 Z";

function Pedal(props: { d: string; top: number; bottom: number; v: number; color: string; glow?: boolean; glowColor?: string; num: boolean; label: string }) {
  const id = createUniqueId();
  const hgt = () => props.bottom - props.top;
  const v = () => clamp(props.v, 0, 1);
  return (
    <div class="inx-pedal">
      <svg viewBox="0 0 34 76" class="inx-pedalsvg" classList={{ glow: !!props.glow }} style={{ "--glow": props.glowColor } as JSX.CSSProperties}>
        <defs>
          <clipPath id={id}>
            <path d={props.d} />
          </clipPath>
        </defs>
        {/* pedal kolu ve mafsal */}
        <rect x="15" y={props.bottom - 2} width="4" height={72 - props.bottom} rx="1.5" class="inx-pedarm" />
        <rect x="9" y="70" width="16" height="4.5" rx="2" class="inx-pedbase" />
        <path d={props.d} class="inx-pedplate" />
        <rect clip-path={`url(#${id})`} x="0" width="34" y={props.bottom - v() * hgt()} height={v() * hgt() + 1} fill={props.color} />
        {/* kaymaz çizgiler */}
        <g clip-path={`url(#${id})`} class="inx-pedgrip">
          <For each={[0.2, 0.4, 0.6, 0.8]}>{(k) => <path d={`M 0 ${props.top + k * hgt()} L 34 ${props.top + k * hgt()}`} />}</For>
        </g>
        <path d={props.d} class="inx-pedline" />
      </svg>
      <Show when={props.num} fallback={<span class="inx-pedlabel">{props.label}</span>}>
        <span class="inx-pednum">{n100(props.v)}%</span>
      </Show>
    </div>
  );
}

function PedalsDesign(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="ov-panel inx inx-pd" classList={{ shift: m.shiftOn() }}>
      <div class="inx-pedset">
        <Show when={m.o.showClutch}>
          <Pedal d={PLATE_CLU} top={12} bottom={53} v={m.clutch()} color={CLUTCH} num={m.showPct()} label={t("Debriyaj")} />
        </Show>
        <Pedal d={PLATE_BRK} top={10} bottom={53} v={m.brake()} color={m.brakeFill()} glow={m.absFrame()} glowColor={m.absColor()} num={m.showPct()} label={t("Fren")} />
        <Pedal d={PLATE_THR} top={1} bottom={60} v={m.throttle()} color={m.thrFill()} glow={m.tcFrame()} glowColor={m.tcColor()} num={m.showPct()} label={t("Gaz")} />
      </div>
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-side">
          <Show when={m.o.showGear}>
            <b class="inx-gear">{m.gear()}</b>
            <span class="inx-speed">
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </Show>
          <Show when={m.o.showSteer}>
            <Wheel m={m} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// HUD (çerçevesiz): arka plansız; ortada vites / hız, iki yanında fren ve gaz çubukları
// ---------------------------------------------------------------------------------------------------------
function HudDesign(props: { m: Model }) {
  const m = props.m;
  const num = (v: number) => (
    <Show when={m.showPct()}>
      <span class="inx-hudnum">{n100(v)}%</span>
    </Show>
  );
  return (
    <div class="ov-panel inx inx-hud" classList={{ shift: m.shiftOn() }}>
      <Show when={m.o.showClutch}>
        <div class="inx-hudcol">
          <VBar v={m.clutch()} color={CLUTCH} h={84} w={m.barW()} />
          {num(m.clutch())}
        </div>
      </Show>
      <div class="inx-hudcol">
        <VBar v={m.brake()} color={m.brakeFill()} h={84} w={m.barW()} glow={m.absFrame()} glowColor={m.absColor()} />
        {num(m.brake())}
      </div>
      <Show when={m.o.showGear || m.o.showSteer}>
        <div class="inx-hudmid">
          <Show when={m.o.showGear}>
            <b class="inx-gear">{m.gear()}</b>
            <span class="inx-speed">
              {m.speed()} <small>{m.unit()}</small>
            </span>
          </Show>
          <Show when={m.o.showSteer}>
            <Wheel m={m} />
          </Show>
        </div>
      </Show>
      <div class="inx-hudcol">
        <VBar v={m.throttle()} color={m.thrFill()} h={84} w={m.barW()} glow={m.tcFrame()} glowColor={m.tcColor()} />
        {num(m.throttle())}
      </div>
    </div>
  );
}
