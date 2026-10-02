import { For, Show, createMemo, type JSX } from "solid-js";
import type { OverlayProps, Units } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { clock, fuel, fuelUnit, gear, lapTime, signed, speed as fmtSpeed, speedUnit as fmtSpeedUnit } from "@/sdk/format";
import type { Delta, Fuel, Laps, Session, Telemetry, Tires } from "@/sdk/types";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { carFamily } from "@/sdk/cars";
import { CarDash, STYLE_FOR_FAMILY, isCarStyle, type CarStyle, type DashCtx } from "./carstyles";
import "./style.css";

// ---------------------------------------------------------------------------
// Önizleme (veri yokken düzenleme modunda / panelde): referans ekrandaki değerler
// ---------------------------------------------------------------------------

const DEMO_TEL: Telemetry = {
  gear: 4,
  speed: 190 / 3.6,
  rpm: 8150,
  slFirst: 7400,
  slShift: 8600,
  slLast: 8600,
  slBlink: 8900,
  redline: 9000,
  position: 4,
  classPosition: 4,
  posChange: 2,
  lap: 12,
  last: 109.37,
  best: 109.156,
  fuelLevel: 38.4,
  fuelPct: 0.35,
  trackTemp: 46.67,
  airTemp: 24.2,
  abs: 6,
  absActive: false,
  tc: 3,
  brakeBias: 54.5,
  oilTemp: 104.2,
  waterTemp: 88.6,
  onPitRoad: false,
};
const DEMO_DELTA: Delta = {
  delta: -0.01,
  valid: true,
  trend: -0.01,
  current: 52.1,
  last: 109.37,
  best: 109.156,
  sessionDelta: 0.41,
  sessionValid: true,
  optimalDelta: 0.63,
  optimalValid: true,
};
const DEMO_LAPS: Partial<Laps> = { current: [40.4], bestSectors: [40.1, 37.2, 31.8], optimal: 109.1, lapPct: 0.48 };
const DEMO_SESSION: Partial<Session> = {
  lap: 12,
  lapsCompleted: 11,
  lapsRemain: 18,
  totalLaps: 30,
  position: 4,
  classPosition: 4,
  carCount: 22,
  incidents: 2,
  trackTemp: 46.67,
  airTemp: 24.2,
  timeRemain: 1980,
};
const DEMO_FUEL: Partial<Fuel> = {
  level: 38.4,
  max: 110,
  stintTime: 1845,
  avg5: { usage: 2.86, laps: 13.4, stint: 38.4, refuel: 12.1 },
};
const DEMO_TIRES: Tires = {
  corners: [
    { temp: [88, 92, 95], wear: [0.9, 0.88, 0.86], press: 172 },
    { temp: [91, 94, 90], wear: [0.88, 0.87, 0.89], press: 172 },
    { temp: [84, 86, 87], wear: [0.93, 0.92, 0.92], press: 168 },
    { temp: [85, 87, 85], wear: [0.92, 0.92, 0.93], press: 168 },
  ],
  compound: 0,
  available: true,
  onPit: false,
};

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const ok = (v: number | undefined | null): v is number => v != null && isFinite(v) && v >= 0;
const num = (v: number | undefined | null, d = 0) => (ok(v) ? v.toFixed(d) : "—");

/** 11.7 -> "0:11.7" (direksiyon ekranlarındaki gibi dakikalı) */
function sectorTime(t: number | undefined): string {
  if (t == null || !isFinite(t) || t <= 0) return "-:--.-";
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

interface Src {
  tel?: Telemetry;
  delta?: Delta;
  laps?: Partial<Laps>;
  ses?: Partial<Session>;
  fuel?: Partial<Fuel>;
  tires?: Tires;
}

interface Fmt {
  units: Units;
  speedUnit: string;
  tempUnit: string;
}

function tempVal(c: number | undefined, f: Fmt, digits = 1): string {
  if (c == null || !isFinite(c) || c <= -1) return "—";
  const fUnit = f.tempUnit === "f" || (f.tempUnit === "auto" && f.units === "imperial");
  return (fUnit ? c * 1.8 + 32 : c).toFixed(digits);
}
function tempUnitLabel(f: Fmt) {
  return f.tempUnit === "f" || (f.tempUnit === "auto" && f.units === "imperial") ? "°F" : "°C";
}
function speedVal(ms: number, f: Fmt) {
  if (f.speedUnit === "kmh") return Math.round(ms * 3.6).toString();
  if (f.speedUnit === "mph") return Math.round(ms * 2.23694).toString();
  return fmtSpeed(ms, f.units);
}
function speedLabel(f: Fmt) {
  if (f.speedUnit === "kmh") return "km/h";
  if (f.speedUnit === "mph") return "mph";
  return fmtSpeedUnit(f.units);
}

function remaining(ses?: Partial<Session>): [string, string] {
  if (!ses) return ["—", "Laps Left"];
  if (ses.lapsRemain != null && ses.lapsRemain > 0 && ses.lapsRemain < 32767) return [String(ses.lapsRemain), "Laps Left"];
  if (ses.timeRemain != null && ses.timeRemain > 0) return [clock(ses.timeRemain), "Time Left"];
  return ["—", "Laps Left"];
}

/** Alt kutu değerleri: [değer, etiket] */
const BOX_VALUES: Record<string, (s: Src, f: Fmt) => [string, string]> = {
  tc: (s) => [num(s.tel?.tc), "TC"],
  abs: (s) => [num(s.tel?.abs), "ABS"],
  bb: (s) => [num(s.tel?.brakeBias, 1), "Brake Bias"],
  trackTemp: (s, f) => [tempVal(s.ses?.trackTemp ?? s.tel?.trackTemp, f, 2), "Track Temp"],
  airTemp: (s, f) => [tempVal(s.ses?.airTemp ?? s.tel?.airTemp, f, 1), "Air Temp"],
  rpm: (s) => [s.tel ? Math.round(s.tel.rpm).toString() : "—", "RPM"],
  fuel: (s, f) => [s.fuel?.level != null ? fuel(s.fuel.level, f.units) : s.tel ? fuel(s.tel.fuelLevel, f.units) : "—", `Fuel ${fuelUnit(f.units)}`],
  fuelLaps: (s) => [(s.fuel?.avg5?.laps ?? 0) > 0 ? s.fuel!.avg5!.laps.toFixed(1) : "—", "Fuel Laps"],
  oilTemp: (s, f) => [tempVal(s.tel?.oilTemp, f), "Oil Temp"],
  waterTemp: (s, f) => [tempVal(s.tel?.waterTemp, f), "Water Temp"],
  incidents: (s) => [s.ses?.incidents != null ? `${s.ses.incidents}x` : "—", "Incidents"],
  lap: (s) => [s.ses?.lap ? String(s.ses.lap) : "—", "Lap"],
  remain: (s) => remaining(s.ses),
  stint: (s) => [s.fuel?.stintTime != null ? clock(s.fuel.stintTime) : "—", "Stint"],
};

// ---------------------------------------------------------------------------

export default function Dashboard(props: OverlayProps) {
  const telT = useTopic("telemetry");
  const deltaT = useTopic("delta");
  const lapsT = useTopic("laps");
  const fuelT = useTopic("fuel");
  const sesT = useTopic("session");
  const tiresT = useTopic("tires");

  // Veri yoksa düzenleme modunda / panel önizlemesinde örnek değerler
  const demo = () => props.editing && !telT();
  const src = (): Src =>
    demo()
      ? { tel: DEMO_TEL, delta: DEMO_DELTA, laps: DEMO_LAPS, ses: DEMO_SESSION, fuel: DEMO_FUEL, tires: DEMO_TIRES }
      : { tel: telT(), delta: deltaT(), laps: lapsT(), ses: sesT(), fuel: fuelT(), tires: tiresT() };

  const fmt = (): Fmt => ({ units: props.units, speedUnit: props.options.speedUnit, tempUnit: props.options.tempUnit });
  // Araç tarzı ekranlar (PRO): seçilen ya da "auto" ile sürülen araca göre. PRO değilse klasik görünüm.
  const status = useTopic("status");
  const carStyle = createMemo((): CarStyle | undefined => {
    const o = (props.options.view as string) || "classic";
    if (!isCarStyle(o) && o !== "auto") return undefined;
    // Yöneticinin PRO özellikleri kararına göre (overlay.dashboard.view.<stil>); kilitliyse klasik görünüm
    let st: CarStyle | undefined;
    if (isCarStyle(o)) st = o;
    else {
      // Otomatik: sürülen araca göre. Araç bilgisi yokken (sim kapalı; panel önizlemesi / düzenleme modu)
      // örnek olarak GT ekranı gösterilir — yoksa PRO üye "Otomatik"i seçince hep Klasik görüyordu.
      const fam = carFamily(status());
      st = fam ? STYLE_FOR_FAMILY[fam] : props.editing || demo() ? "carGtDe" : undefined;
    }
    return st && !overlayValueLocked("dashboard", "view", st) ? st : undefined;
  });
  const view = () => {
    const o = (props.options.view as string) || "classic";
    return o === "auto" || isCarStyle(o) ? "classic" : o;
  };


  // --- Devir ışıkları --------------------------------------------------------
  // En yüksek görülen devir: araç bilgisi gelmezse yüzde hesabı için
  let maxSeen = 0;
  const shift = createMemo(() => {
    const t = src().tel;
    if (!t) return { frac: 0, shift: false, blink: false };
    if (t.rpm > maxSeen) maxSeen = t.rpm;
    const red = t.redline > 0 ? t.redline : Math.max(maxSeen, 1);
    const first = t.slFirst > 0 ? t.slFirst : red * 0.75;
    const last = t.slLast > first ? t.slLast : t.slShift > first ? t.slShift : red * 0.95;
    const shiftAt = t.slShift > 0 ? t.slShift : last;
    const blinkAt = t.slBlink > 0 ? t.slBlink : red * 0.985;
    const frac = Math.max(0, Math.min(1, (t.rpm - first) / Math.max(1, last - first)));
    return { frac, shift: t.rpm >= shiftAt, blink: t.rpm >= blinkAt };
  });
  const flashing = () => !!props.options.flash && (shift().blink || (shift().shift && shift().frac >= 1));

  /** Işık i (0..n-1, dolma sırasına göre) yanıyor mu, rengi ne */
  const ledColor = (i: number, n: number, style: string) => {
    const s = shift();
    if (s.blink) return "var(--dash-blue)";
    if (s.shift && s.frac >= 1) return "var(--dash-accent)";
    if (i >= Math.ceil(s.frac * n - 1e-6)) return undefined;
    const f = (i + 1) / n;
    if (style === "f1") return f <= 1 / 3 ? "var(--dash-green)" : f <= 2 / 3 ? "var(--dash-red)" : "var(--dash-blue)";
    return f <= 0.4 ? "var(--dash-green)" : f <= 0.75 ? "var(--dash-yellow)" : "var(--dash-accent)";
  };
  const rpmColor = () => {
    const s = shift();
    if (s.blink) return "var(--dash-blue)";
    if (s.shift || s.frac > 0.75) return "var(--dash-accent)";
    if (s.frac > 0.4) return "var(--dash-yellow)";
    if (s.frac > 0) return "var(--dash-green)";
    return "var(--dash-text)";
  };

  const ledStyle = () => (props.options.showLeds ? (props.options.ledStyle as string) || "blocks" : "off");

  // --- Değerler ---------------------------------------------------------------
  const gearText = () => gear(src().tel?.gear ?? 0);
  const gearColor = () =>
    props.options.gearColor === "white" ? "var(--dash-text)" : props.options.gearColor === "rpm" ? rpmColor() : "var(--dash-accent)";
  const position = () => {
    const s = src();
    const p = s.tel?.classPosition || s.tel?.position || s.ses?.classPosition || s.ses?.position || 0;
    return p > 0 ? String(p) : "—";
  };

  const deltaInfo = createMemo(() => {
    const d = src().delta;
    const ref = props.options.deltaRef as string;
    if (!d) return { v: undefined as number | undefined, label: "Delta" };
    if (ref === "session" && d.sessionValid) return { v: d.sessionDelta, label: "Delta SB" };
    if (ref === "optimal" && d.optimalValid) return { v: d.optimalDelta, label: "Delta OPT" };
    return { v: d.valid ? d.delta : undefined, label: "Delta" };
  });
  const deltaText = () => {
    const v = deltaInfo().v;
    return v == null ? "-.--" : Math.abs(v) < 0.005 ? "0.00" : signed(v).replace("±", "");
  };
  const deltaTone = () => {
    const v = deltaInfo().v;
    return v == null ? "" : v < 0 ? "pos" : v > 0 ? "neg" : "";
  };

  /** Güncel sektörde geçen süre ve sektör numarası */
  const sector = () => {
    const s = src();
    const done = s.laps?.current ?? [];
    const cur = s.delta?.current ?? 0;
    const used = done.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    return { n: Math.min(3, done.length + 1), t: cur > used ? cur - used : 0 };
  };

  const last = () => src().delta?.last ?? src().tel?.last;
  const best = () => src().delta?.best ?? src().tel?.best;
  const box = (k: string) => (k === "none" || !BOX_VALUES[k] ? null : BOX_VALUES[k](src(), fmt()));

  const tyreTemp = (i: number) => {
    const t = src().tires;
    if (!t?.available) return "—";
    const c = t.corners[i];
    if (!c || c.temp[1] <= 0) return "—";
    return tempVal((c.temp[0] + c.temp[1] + c.temp[2]) / 3, fmt(), 0);
  };

  const rootStyle = (): JSX.CSSProperties => ({
    "--dash-accent": (props.options.accent as string) || "#e8101a",
    "--dash-bg-a": String(((props.options.opacity as number) ?? 100) / 100),
  });

  // --- Parçalar -----------------------------------------------------------------
  const Leds = (p: { n: number; style: string; class?: string }) => (
    <div class={`dash-leds ${p.class ?? ""}`} classList={{ [p.style]: true }}>
      <For each={Array.from({ length: p.n })}>{(_, i) => <i style={{ background: ledColor(i(), p.n, p.style) }} />}</For>
    </div>
  );

  /** Blok stili: iki yanda 4'er blok, dıştan içe dolar; ortada logo */
  const BlockLeds = () => {
    const n = 8;
    const side = n / 2;
    // sol: dıştan (0) içe, sağ: dıştan içe -> dolum sırası aynı
    return (
      <div class="dash-top">
        <div class="dash-leds blocks">
          <For each={Array.from({ length: side })}>{(_, i) => <i style={{ background: ledColor(i(), side, "blocks") }} />}</For>
        </div>
        <div class="dash-emblem">
          <Show when={props.options.showLogo}>
            <span>{((props.options.logoText as string) || "S").trim().charAt(0)}</span>
          </Show>
        </div>
        <div class="dash-leds blocks rev">
          <For each={Array.from({ length: side })}>
            {(_, i) => <i style={{ background: ledColor(side - 1 - i(), side, "blocks") }} />}
          </For>
        </div>
      </div>
    );
  };

  const BarLeds = () => (
    <div class="dash-bar">
      <div
        class="dash-bar-fill"
        style={{
          width: `${(shift().shift ? 1 : shift().frac) * 100}%`,
          background: shift().blink ? "var(--dash-blue)" : rpmColor(),
        }}
      />
      <For each={[0.4, 0.75]}>{(x) => <i style={{ left: `${x * 100}%` }} />}</For>
    </div>
  );

  const TopLights = () => (
    <Show when={ledStyle() !== "off"} fallback={<Show when={view() === "classic"}><BlockShell /></Show>}>
      <Show when={ledStyle() === "blocks"}>
        <BlockLeds />
      </Show>
      <Show when={ledStyle() === "f1"}>
        <Leds n={15} style="f1" class="dash-f1" />
      </Show>
      <Show when={ledStyle() === "bar"}>
        <BarLeds />
      </Show>
    </Show>
  );

  /** Işıklar kapalıyken klasik görünümde sadece logo şeridi */
  const BlockShell = () => (
    <Show when={props.options.showLogo}>
      <div class="dash-top">
        <div />
        <div class="dash-emblem">
          <span>{((props.options.logoText as string) || "S").trim().charAt(0)}</span>
        </div>
        <div />
      </div>
    </Show>
  );

  const Cell = (p: { value: JSX.Element; label: string; class?: string; tone?: string }) => (
    <div class={`dash-cell ${p.class ?? ""}`}>
      <b class="dash-v" classList={{ [`tone-${p.tone}`]: !!p.tone }}>
        {p.value}
      </b>
      <span class="dash-l">{p.label}</span>
    </div>
  );

  const Boxes = () => (
    <div class="dash-boxes">
      <For each={[props.options.box1, props.options.box2, props.options.box3] as string[]}>
        {(k) => (
          <div class="dash-box">
            <Show when={box(k)}>
              {(b) => (
                <>
                  <b class="dash-v">{b()[0]}</b>
                  <span class="dash-l">{b()[1]}</span>
                </>
              )}
            </Show>
          </div>
        )}
      </For>
    </div>
  );

  const Brand = () => (
    <Show when={props.options.showLogo && ((props.options.logoText as string) || (props.options.logoSub as string))}>
      <div class="dash-brand">
        <b>{props.options.logoText as string}</b>
        <Show when={props.options.logoSub}>
          <span>{props.options.logoSub as string}</span>
        </Show>
      </div>
    </Show>
  );

  const Gear = (p: { class?: string }) => (
    <div class={`dash-gear ${p.class ?? ""}`} style={{ color: gearColor() }}>
      {gearText()}
    </div>
  );

  // --- Araç tarzı ekranların okuduğu değerler --------------------------------------
  const speedMs = () => src().tel?.speed ?? 0;
  const speedNum = () => {
    const ms = speedMs();
    return speedLabel(fmt()) === "mph" ? ms * 2.23694 : ms * 3.6;
  };
  const optNum = (v: number | undefined) => (ok(v) ? v : undefined);
  const ctx: DashCtx = {
    gear: gearText,
    speed: () => speedVal(speedMs(), fmt()),
    speedNum,
    speedMax: () => {
      const mph = speedLabel(fmt()) === "mph";
      const step = mph ? 20 : 40;
      return Math.max(mph ? 200 : 320, Math.ceil(speedNum() / step) * step);
    },
    speedUnit: () => speedLabel(fmt()),
    rpm: () => src().tel?.rpm ?? 0,
    rpmMax: () => {
      const t = src().tel;
      if (t && t.redline > 0) return t.redline;
      return Math.max(maxSeen, t?.slBlink ?? 0, t?.slLast ?? 0, 7000);
    },
    frac: () => shift().frac,
    shift: () => shift().shift,
    blink: () => shift().blink,
    pos: () => {
      const s = src();
      return s.tel?.classPosition || s.tel?.position || s.ses?.classPosition || s.ses?.position || 0;
    },
    carCount: () => src().ses?.carCount ?? 0,
    posChange: () => src().tel?.posChange ?? 0,
    delta: () => deltaInfo().v,
    deltaLabel: () => deltaInfo().label.toUpperCase(),
    cur: () => optNum(src().delta?.current),
    last: () => last(),
    best: () => best(),
    lap: () => src().ses?.lap || src().tel?.lap || 0,
    totalLaps: () => src().ses?.totalLaps ?? 0,
    remain: () => remaining(src().ses),
    fuel: () => BOX_VALUES.fuel(src(), fmt())[0],
    fuelUnit: () => fuelUnit(props.units),
    fuelLaps: () => BOX_VALUES.fuelLaps(src(), fmt())[0],
    fuelPct: () => {
      const s = src();
      const max = s.fuel?.max ?? 0;
      if (s.fuel?.level != null && max > 0) return s.fuel.level / max;
      return optNum(s.tel?.fuelPct);
    },
    tc: () => optNum(src().tel?.tc ?? src().ses?.tc),
    abs: () => optNum(src().tel?.abs ?? src().ses?.abs),
    absActive: () => !!src().tel?.absActive,
    bb: () => {
      const v = src().tel?.brakeBias ?? src().ses?.brakeBias;
      return ok(v) && v > 0 ? v : undefined;
    },
    oil: () => tempVal(src().tel?.oilTemp, fmt(), 0),
    oilC: () => (ok(src().tel?.oilTemp) ? src().tel!.oilTemp : undefined),
    water: () => tempVal(src().tel?.waterTemp, fmt(), 0),
    waterC: () => (ok(src().tel?.waterTemp) ? src().tel!.waterTemp : undefined),
    tUnit: () => tempUnitLabel(fmt()),
    trackTemp: () => tempVal(src().ses?.trackTemp ?? src().tel?.trackTemp, fmt(), 0),
    airTemp: () => tempVal(src().ses?.airTemp ?? src().tel?.airTemp, fmt(), 0),
    tyres: () => {
      const t = src().tires;
      if (!t?.available || t.corners.length < 4) return null;
      return t.corners.slice(0, 4).map((c) => {
        const vals = c.temp.filter((x) => x > 0);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
        return {
          c: avg,
          t: avg != null ? tempVal(avg, fmt(), 0) : "—",
          // Lastik basıncı her zaman psi
          p: c.press > 0 ? (c.press * 0.145038).toFixed(1) : undefined,
        };
      });
    },
    pressUnit: () => "psi",
    incidents: () => src().ses?.incidents,
    stint: () => BOX_VALUES.stint(src(), fmt())[0],
    sector,
    onPit: () => !!(src().tel?.onPitRoad ?? src().ses?.onPitRoad),
    lapPct: () => optNum(src().laps?.lapPct),
  };

  return (
    <Show
      when={carStyle()}
      fallback={
        <div
          class={`dash dash-${view()} dash-t-${props.options.theme || "black"} dash-f-${props.options.font || "digital"}`}
          classList={{ flash: flashing() }}
          style={rootStyle()}
          data-no-i18n
        >
          <TopLights />

          {/* ---------------- Klasik ---------------- */}
          <Show when={view() === "classic"}>
            <div class="dash-main">
              <div class="dash-side">
                <div class="dash-pair">
                  <Cell value={position()} label="POS" class="sm" />
                  <Cell value={speedVal(src().tel?.speed ?? 0, fmt())} label={speedLabel(fmt()) === "mph" ? "Speed mph" : "Speed"} class="lg" />
                </div>
                <div class="dash-lap">{lapTime(last())}</div>
              </div>
              <Gear />
              <div class="dash-side">
                <div class="dash-pair">
                  <Cell value={deltaText()} label={deltaInfo().label} class="lg" tone={deltaTone()} />
                  <Cell value={sectorTime(sector().t)} label="SECTOR" class="sm" />
                </div>
                <div class="dash-lap">{lapTime(best())}</div>
              </div>
            </div>
            <Boxes />
            <Brand />
          </Show>

          {/* ---------------- Minimal ---------------- */}
          <Show when={view() === "minimal"}>
            <div class="dash-main">
              <Cell value={speedVal(src().tel?.speed ?? 0, fmt())} label={speedLabel(fmt())} class="xl" />
              <Gear class="big" />
              <Cell value={deltaText()} label={deltaInfo().label} class="xl" tone={deltaTone()} />
            </div>
          </Show>

          {/* ---------------- Yarış ---------------- */}
          <Show when={view() === "race"}>
            <div class="dash-main">
              <div class="dash-cell xl">
                <b class="dash-v">
                  <small>P</small>
                  {position()}
                  <Show when={(src().ses?.carCount ?? 0) > 0}>
                    <small class="dash-of">/{src().ses!.carCount}</small>
                  </Show>
                </b>
                <span class="dash-l">
                  Position
                  <Show when={(src().tel?.posChange ?? 0) !== 0}>
                    <em classList={{ "tone-pos": src().tel!.posChange > 0, "tone-neg": src().tel!.posChange < 0 }}>
                      {" "}
                      {src().tel!.posChange > 0 ? "▲" : "▼"}
                      {Math.abs(src().tel!.posChange)}
                    </em>
                  </Show>
                </span>
              </div>
              <Gear />
              <Cell value={deltaText()} label={deltaInfo().label} class="xl" tone={deltaTone()} />
            </div>
            <div class="dash-row4">
              <Cell
                value={
                  <>
                    {src().ses?.lap || "—"}
                    <Show when={(src().ses?.totalLaps ?? 0) > 0 && (src().ses?.totalLaps ?? 0) < 32767}>
                      <small>/{src().ses!.totalLaps}</small>
                    </Show>
                  </>
                }
                label="Lap"
              />
              <Cell value={lapTime(last())} label="Last" />
              <Cell value={lapTime(best())} label="Best" />
              <Cell value={BOX_VALUES.fuelLaps(src(), fmt())[0]} label="Fuel Laps" />
            </div>
            <Boxes />
          </Show>

          {/* ---------------- Dayanıklılık ---------------- */}
          <Show when={view() === "endurance"}>
            <div class="dash-main slim">
              <Cell value={speedVal(src().tel?.speed ?? 0, fmt())} label={speedLabel(fmt())} class="lg" />
              <Gear class="mid" />
              <Cell value={deltaText()} label={deltaInfo().label} class="lg" tone={deltaTone()} />
            </div>
            <div class="dash-grid6">
              <Cell value={BOX_VALUES.fuel(src(), fmt())[0]} label={`Fuel ${fuelUnit(props.units)}`} />
              <Cell value={BOX_VALUES.fuelLaps(src(), fmt())[0]} label="Fuel Laps" />
              <Cell value={remaining(src().ses)[0]} label={remaining(src().ses)[1]} />
              <Cell value={BOX_VALUES.stint(src(), fmt())[0]} label="Stint" />
              <Cell value={tempVal(src().tel?.oilTemp, fmt())} label={`Oil ${tempUnitLabel(fmt())}`} />
              <Cell value={tempVal(src().tel?.waterTemp, fmt())} label={`Water ${tempUnitLabel(fmt())}`} />
            </div>
            <div class="dash-tyres">
              <span class="dash-l">Tyres {tempUnitLabel(fmt())}</span>
              <For each={["LF", "RF", "LR", "RR"]}>
                {(n, i) => (
                  <span class="dash-tyre">
                    <span class="dash-l">{n}</span>
                    <b class="dash-v">{tyreTemp(i())}</b>
                  </span>
                )}
              </For>
              <span class="dash-l">Last</span>
              <b class="dash-v dash-tlast">{lapTime(last())}</b>
            </div>
          </Show>
        </div>
      }
    >
      {(st) => <CarDash style={st()} c={ctx} flash={flashing()} opacity={((props.options.opacity as number) ?? 100) / 100} />}
    </Show>
  );
}
