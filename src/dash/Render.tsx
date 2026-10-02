// Özel dashboard çizimi: tasarımcı tuvali, Direksiyon Ekranı overlay'i ve uzak sayfa aynı bileşeni kullanır.

import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import type { Units } from "@/sdk/overlay";
import { fieldNum, fieldOf, fieldText, fieldUnit, flagOf, rgba, ruleFor, shiftState, tyreTemp, type CustomDash, type DashData, type DashPage, type DashWidget } from "./model";
import "./dash.css";

const FONTS: Record<string, string> = {
  digital: '"Rajdhani", "Barlow Condensed", "DIN Alternate", "Bahnschrift", system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", "Roboto Mono Variable", ui-monospace, Consolas, monospace',
  sans: '"Inter Variable", "Segoe UI", system-ui, sans-serif',
};

const C1 = "#34e05c";
const C2 = "#ffd21f";
const C3 = "#e8101a";
const C4 = "#2f8bff";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface WP {
  w: DashWidget;
  data: () => DashData;
  units: Units;
  /** Tasarımcıda: boş bileşenler (bayrak yok, resim seçilmedi) yer tutucu gösterir */
  design?: boolean;
}

function boxStyle(w: DashWidget): JSX.CSSProperties {
  const p = w.props;
  const s: JSX.CSSProperties = { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px` };
  if (p.bg && (p.bgA ?? 100) > 0) s.background = rgba(p.bg, (p.bgA ?? 100) / 100);
  if (p.border && (p.borderW ?? 0) > 0) s.border = `${p.borderW}px solid ${p.border}`;
  if (p.radius) s["border-radius"] = `${p.radius}px`;
  if (p.font) s["font-family"] = FONTS[p.font];
  if (p.weight) s["font-weight"] = String(p.weight);
  return s;
}

function Value(p: WP) {
  const pr = () => p.w.props;
  const rule = createMemo(() => ruleFor(pr(), fieldNum(pr().ruleField || pr().field, p.data(), p.units)));
  const text = () => {
    const t = fieldText(pr().field, p.data(), p.units, pr().decimals ?? -1);
    const u = pr().showUnit && t !== "—" ? fieldUnit(pr().field, p.units) : "";
    return u ? `${t}${u.length > 1 ? " " : ""}${u}` : t;
  };
  return (
    <div class={`dw-value lp-${pr().labelPos ?? "bottom"} al-${pr().align ?? "center"}`}>
      <b class="dw-v" classList={{ "dw-blink": !!rule()?.blink }} style={{ "font-size": `${pr().fontSize ?? 40}px`, color: rule()?.color ?? pr().color }}>
        {text()}
      </b>
      <Show when={pr().label}>
        <span class="dw-l" style={{ "font-size": `${pr().labelSize ?? 14}px`, color: pr().labelColor }}>
          {pr().label}
        </span>
      </Show>
    </div>
  );
}

function Gear(p: WP) {
  const pr = () => p.w.props;
  const color = () => {
    if (!pr().rpmColor) return pr().color;
    const s = shiftState(p.data().tel);
    if (s.blink) return pr().c4 ?? C4;
    if (s.shift || s.frac > 0.75) return pr().c3 ?? C3;
    if (s.frac > 0.4) return pr().c2 ?? C2;
    if (s.frac > 0) return pr().c1 ?? C1;
    return pr().color;
  };
  return (
    <div class={`dw-gear al-${pr().align ?? "center"}`} style={{ "font-size": `${pr().fontSize ?? 160}px`, color: color() }}>
      {fieldText("gear", p.data(), p.units)}
    </div>
  );
}

function RpmBar(p: WP) {
  const pr = () => p.w.props;
  const st = () => shiftState(p.data().tel);
  const frac = () => clamp01((p.data().tel?.rpm ?? 0) / Math.max(1, st().max));
  const color = () => {
    const s = st();
    if (s.blink) return pr().c4 ?? C4;
    const f = frac() * 100;
    return f >= (pr().z2 ?? 85) ? (pr().c3 ?? C3) : f >= (pr().z1 ?? 60) ? (pr().c2 ?? C2) : (pr().c1 ?? C1);
  };
  return (
    <div class="dw-bar" classList={{ vert: !!pr().vertical, "dw-flash": !!pr().flash && st().blink }}>
      <i style={pr().vertical ? { height: `${frac() * 100}%`, background: color() } : { width: `${frac() * 100}%`, background: color() }} />
      <For each={[pr().z1 ?? 60, pr().z2 ?? 85]}>{(z) => <u style={pr().vertical ? { bottom: `${z}%` } : { left: `${z}%` }} />}</For>
    </div>
  );
}

function RpmLeds(p: WP) {
  const pr = () => p.w.props;
  const n = () => Math.max(3, Math.min(30, Math.round(pr().count ?? 12)));
  const st = () => shiftState(p.data().tel);
  const color = (i: number) => {
    const s = st();
    if (s.blink) return pr().c4 ?? C4;
    if (s.shift && s.frac >= 1) return pr().c3 ?? C3;
    if (i >= Math.ceil(s.frac * n() - 1e-6)) return undefined;
    const f = (i + 1) / n();
    return f <= 0.4 ? (pr().c1 ?? C1) : f <= 0.75 ? (pr().c2 ?? C2) : (pr().c3 ?? C3);
  };
  return (
    <div class="dw-leds" classList={{ vert: !!pr().vertical, "dw-flash": !!pr().flash && (st().blink || (st().shift && st().frac >= 1)) }}>
      <For each={Array.from({ length: n() })}>{(_, i) => <i style={{ background: color(i()) }} />}</For>
    </div>
  );
}

function range(p: WP): [number, number] {
  const f = fieldOf(p.w.props.field);
  let min = p.w.props.min ?? f?.min ?? 0;
  let max = p.w.props.max ?? f?.max ?? 100;
  // Devir: üst sınır aracın kırmızı çizgisi (elle verilmediyse)
  if (p.w.props.field === "rpm" && p.w.props.max == null) max = shiftState(p.data().tel).max;
  if (max <= min) max = min + 1;
  return [min, max];
}

function Bar(p: WP) {
  const pr = () => p.w.props;
  const v = () => fieldNum(pr().field, p.data(), p.units);
  const frac = () => {
    const [min, max] = range(p);
    return v() == null ? 0 : clamp01((v()! - min) / (max - min));
  };
  const rule = createMemo(() => ruleFor(pr(), fieldNum(pr().ruleField || pr().field, p.data(), p.units)));
  const color = () => rule()?.color ?? pr().color ?? C1;
  return (
    <div class="dw-barwrap" classList={{ vert: !!pr().vertical }}>
      <Show when={pr().label}>
        <span class="dw-l" style={{ "font-size": `${pr().labelSize ?? 14}px`, color: pr().labelColor }}>
          {pr().label}
        </span>
      </Show>
      <div class="dw-bar" classList={{ vert: !!pr().vertical, "dw-blink": !!rule()?.blink }}>
        <i style={pr().vertical ? { height: `${frac() * 100}%`, background: color() } : { width: `${frac() * 100}%`, background: color() }} />
      </div>
    </div>
  );
}

/** 270° yay: sol alttan sağ alta */
function Radial(p: WP) {
  const pr = () => p.w.props;
  const v = () => fieldNum(pr().field, p.data(), p.units);
  const frac = () => {
    const [min, max] = range(p);
    return v() == null ? 0 : clamp01((v()! - min) / (max - min));
  };
  const rule = createMemo(() => ruleFor(pr(), fieldNum(pr().ruleField || pr().field, p.data(), p.units)));
  const R = 42;
  const LEN = 2 * Math.PI * R * 0.75;
  return (
    <div class="dw-radial">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <circle cx="50" cy="50" r={R} class="dw-arc-bg" stroke-dasharray={`${LEN} 1000`} transform="rotate(135 50 50)" />
        <circle cx="50" cy="50" r={R} class="dw-arc" stroke={rule()?.color ?? pr().color ?? "#ff8a2a"} stroke-dasharray={`${LEN * frac()} 1000`} transform="rotate(135 50 50)" />
      </svg>
      <div class="dw-radial-in">
        <b class="dw-v" classList={{ "dw-blink": !!rule()?.blink }} style={{ "font-size": `${pr().fontSize ?? 40}px` }}>
          {fieldText(pr().field, p.data(), p.units, pr().decimals ?? -1)}
        </b>
        <Show when={pr().label}>
          <span class="dw-l" style={{ "font-size": `${pr().labelSize ?? 14}px`, color: pr().labelColor }}>
            {pr().label}
          </span>
        </Show>
      </div>
    </div>
  );
}

const CORNERS = ["LF", "RF", "LR", "RR"];
function tempColor(c: number | undefined) {
  if (c == null) return undefined;
  // 60°C mavi → 85°C yeşil → 105°C sarı → 120°C kırmızı
  const h = c <= 60 ? 210 : c <= 85 ? 210 - ((c - 60) / 25) * 80 : c <= 105 ? 130 - ((c - 85) / 20) * 80 : Math.max(0, 50 - ((c - 105) / 15) * 50);
  return `hsl(${h} 80% 42%)`;
}
function wearColor(pct: number | undefined) {
  if (pct == null) return undefined;
  return `hsl(${Math.max(0, Math.min(130, (pct - 30) * 1.9))} 75% 38%)`;
}
function Tyres(p: WP) {
  const pr = () => p.w.props;
  const mode = () => pr().tyreMode ?? "temp";
  const field = (i: number) => `${mode() === "press" ? "tyrePress" : mode() === "wear" ? "tyreWear" : "tyreTemp"}${CORNERS[i]}`;
  const bg = (i: number) => {
    if (mode() === "temp") return tempColor(tyreTemp(p.data(), i));
    if (mode() === "wear") return wearColor(fieldNum(field(i), p.data(), p.units));
    return undefined;
  };
  return (
    <div class="dw-tyres" style={{ "font-size": `${pr().fontSize ?? 26}px`, color: pr().color }}>
      <For each={[0, 1, 2, 3]}>
        {(i) => (
          <div class="dw-tyre" style={{ background: bg(i) }}>
            <b>{fieldText(field(i), p.data(), p.units, pr().decimals ?? (mode() === "press" ? 1 : 0))}</b>
          </div>
        )}
      </For>
    </div>
  );
}

function DeltaBar(p: WP) {
  const pr = () => p.w.props;
  const v = () => fieldNum(pr().field ?? "delta", p.data(), p.units);
  const frac = () => (v() == null ? 0 : Math.max(-1, Math.min(1, v()! / Math.max(0.05, pr().max ?? 1))));
  return (
    <div class="dw-delta">
      <i
        style={{
          left: frac() < 0 ? `${50 + frac() * 50}%` : "50%",
          width: `${Math.abs(frac()) * 50}%`,
          background: frac() < 0 ? (pr().c1 ?? C1) : (pr().c3 ?? "#ff4a4a"),
        }}
      />
      <u />
    </div>
  );
}

function FlagBox(p: WP) {
  const f = () => flagOf(p.data());
  const dark = () => ["white", "yellow", "caution", "cautionWaving", "checkered"].includes(f()?.name ?? "");
  return (
    <Show when={f()} fallback={<Show when={p.design}><div class="dw-flag dw-ghost">FLAG</div></Show>}>
      <div
        class="dw-flag"
        classList={{ chk: f()!.name === "checkered" }}
        style={{ background: f()!.color, color: dark() ? "#111" : "#fff", "font-size": `${p.w.props.fontSize ?? 22}px`, "border-radius": `${p.w.props.radius ?? 0}px` }}
      >
        {f()!.text}
      </div>
    </Show>
  );
}

function Label(p: WP) {
  const pr = () => p.w.props;
  return (
    <div class={`dw-label al-${pr().align ?? "center"}`} style={{ "font-size": `${pr().fontSize ?? 22}px`, color: pr().color }}>
      {pr().text}
    </div>
  );
}

function Image(p: WP) {
  return (
    <Show when={p.w.props.src} fallback={<Show when={p.design}><div class="dw-flag dw-ghost">IMG</div></Show>}>
      <img class="dw-img" src={p.w.props.src} alt="" draggable={false} style={{ "object-fit": p.w.props.fit ?? "contain" }} />
    </Show>
  );
}

export function WidgetView(p: WP) {
  return (
    <div class={`dw dw-t-${p.w.type}`} data-wid={p.w.id} style={boxStyle(p.w)}>
      <Switch>
        <Match when={p.w.type === "value"}>
          <Value {...p} />
        </Match>
        <Match when={p.w.type === "gear"}>
          <Gear {...p} />
        </Match>
        <Match when={p.w.type === "rpmBar"}>
          <RpmBar {...p} />
        </Match>
        <Match when={p.w.type === "rpmLeds"}>
          <RpmLeds {...p} />
        </Match>
        <Match when={p.w.type === "bar"}>
          <Bar {...p} />
        </Match>
        <Match when={p.w.type === "radial"}>
          <Radial {...p} />
        </Match>
        <Match when={p.w.type === "tyres"}>
          <Tyres {...p} />
        </Match>
        <Match when={p.w.type === "deltaBar"}>
          <DeltaBar {...p} />
        </Match>
        <Match when={p.w.type === "flag"}>
          <FlagBox {...p} />
        </Match>
        <Match when={p.w.type === "label"}>
          <Label {...p} />
        </Match>
        <Match when={p.w.type === "image"}>
          <Image {...p} />
        </Match>
      </Switch>
    </div>
  );
}

/** Geçerli sayfa (dizin taşarsa başa sarar) */
export function pageOf(d: CustomDash, i: number): DashPage {
  const n = d.pages.length;
  return d.pages[((Math.round(i) % n) + n) % n] ?? d.pages[0];
}

/** Tasarım boyutunda (px) tek sayfa. `children`: tuvalin üstüne çizilecekler (tasarımcıda seçim çerçevesi). */
export function DashCanvas(p: { dash: CustomDash; page: number; data: () => DashData; units: Units; design?: boolean; children?: JSX.Element }) {
  return (
    <div
      class="dashc"
      data-no-i18n
      style={{
        width: `${p.dash.width}px`,
        height: `${p.dash.height}px`,
        background: rgba(p.dash.bg, p.dash.bgA / 100),
        "border-radius": `${p.dash.radius}px`,
        "font-family": FONTS[p.dash.font] ?? FONTS.digital,
      }}
    >
      <For each={pageOf(p.dash, p.page).widgets}>{(w) => <WidgetView w={w} data={p.data} units={p.units} design={p.design} />}</For>
      {p.children}
    </div>
  );
}

/** İçeriği (doğal boyutu w×h) kabın içine oranını koruyarak sığdırır */
export function FitBox(p: { w: number; h: number; children: JSX.Element; class?: string; max?: number }) {
  let host!: HTMLDivElement;
  const [box, setBox] = createSignal({ w: 0, h: 0 });
  onMount(() => {
    const ro = new ResizeObserver(() => setBox({ w: host.clientWidth, h: host.clientHeight }));
    ro.observe(host);
    setBox({ w: host.clientWidth, h: host.clientHeight });
    onCleanup(() => ro.disconnect());
  });
  const k = () => {
    const b = box();
    if (!b.w || !b.h || !p.w || !p.h) return 1;
    return Math.min(b.w / p.w, b.h / p.h, p.max ?? Infinity);
  };
  return (
    <div ref={host} class={`dash-fit ${p.class ?? ""}`}>
      <div class="dash-fit-in" style={{ width: `${p.w}px`, height: `${p.h}px`, transform: `translate(-50%, -50%) scale(${k()})` }}>
        {p.children}
      </div>
    </div>
  );
}
