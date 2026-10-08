// Canlı Kıyas: canlı gaz / fren girdileri ve tur içi fark, bir referans turun iziyle karşılaştırılır.
// Veriyi Rust tarafı hazırlar (coach.rs, `coach` konusu); referans izlerini masaüstü penceresi indirir (host/coachref.ts).

import { For, Show, createMemo, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { demoShow, useTopic } from "@/sdk/telemetry";
import { lapTime } from "@/sdk/format";
import { t } from "@/sdk/i18n";
import type { Coach, CoachRef } from "@/sdk/types";
import appLogo from "@/assets/logo.png";
import "./style.css";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const KINDS = ["best", "avg", "mine"];
const NONE = 255;

/** Örnek veri (Demo ve düzenleme): fren bölgesine yaklaşan bir an */
function sample(kind: string): Coach {
  const W = 90;
  const now = 27;
  const thr: number[] = [];
  const brk: number[] = [];
  const spd: number[] = [];
  for (let k = 0; k < W; k++) {
    const x = k / (W - 1);
    const b = x > 0.42 && x < 0.66 ? Math.round(100 * Math.min(1, (x - 0.42) / 0.03) * (1 - Math.max(0, (x - 0.5) / 0.16))) : 0;
    brk.push(clamp(b, 0, 100));
    thr.push(x < 0.4 ? 100 : x > 0.7 ? Math.round(clamp((x - 0.7) / 0.14, 0, 1) * 100) : 0);
    spd.push(Math.round(x < 0.42 ? 212 : x < 0.68 ? 212 - ((x - 0.42) / 0.26) * 128 : 84 + ((x - 0.68) / 0.32) * 60));
  }
  const ref: CoachRef = {
    kind,
    status: "ok",
    name: kind === "avg" ? "" : kind === "mine" ? "" : "M. Yılmaz",
    time: 98.412,
    laps: kind === "avg" ? 6 : 1,
    delta: 0.184,
    sectors: [-0.062, 0.246, null],
    thr,
    brk,
    spd,
    nowThr: 100,
    nowBrk: 0,
    nowSpeed: 212 / 3.6,
    nowGear: 5,
  };
  return {
    onTrack: true,
    onPitRoad: false,
    lapPct: 0.41,
    speed: 208 / 3.6,
    throttle: 0.86,
    brake: 0,
    gear: 5,
    nowIdx: now,
    windowM: 430,
    myThr: Array.from({ length: now + 1 }, (_, k) => (k < now - 3 ? 100 : 100 - (k - (now - 3)) * 5)),
    myBrk: Array.from({ length: now + 1 }, () => 0),
    refs: [ref],
  };
}

export default function CoachOverlay(props: OverlayProps) {
  const live = useTopic("coach");
  const o = () => props.options;
  const kind = () => (KINDS.includes(String(o().reference)) ? String(o().reference) : "best");
  const isSample = () => props.editing || demoShow();
  const data = createMemo<Coach | undefined>(() => (isSample() ? sample(kind()) : live()));
  const ref = createMemo<CoachRef | undefined>(() => data()?.refs.find((r) => r.kind === kind()));
  const ok = () => ref()?.status === "ok" && (ref()?.thr.length ?? 0) > 1;

  const visible = () => {
    const d = data();
    if (!d) return false;
    if (isSample()) return true;
    if (!d.onTrack) return false;
    return !(o().hidePits !== false && d.onPitRoad);
  };

  const W = 400;
  const H = 100;
  const x = (k: number, n: number) => (k / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - (clamp(v, 0, 100) / 100) * H;
  /** Dolu alan (referans) */
  const area = (vals: number[]) => {
    if (vals.length < 2) return "";
    let d = `M0,${H}`;
    vals.forEach((v, k) => (d += ` L${x(k, vals.length).toFixed(1)},${y(v).toFixed(1)}`));
    return `${d} L${W},${H} Z`;
  };
  /** Çizgi (benim girdim): boş noktalar çizgiyi keser */
  const line = (vals: number[], total: number) => {
    let d = "";
    let pen = false;
    vals.forEach((v, k) => {
      if (v === NONE) return void (pen = false);
      d += `${pen ? " L" : " M"}${x(k, total).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const total = () => ref()?.thr.length ?? 90;
  const nowX = () => x(data()?.nowIdx ?? 0, total());

  const fmtDelta = (v: number | null | undefined, digits = 2) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`);
  const cls = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? "" : v > 0 ? "co-loss" : "co-gain");
  const speedDiff = () => {
    const d = data();
    const r = ref();
    if (!d || !r) return null;
    const k = props.units === "imperial" ? 2.23694 : 3.6;
    return Math.round((d.speed - r.nowSpeed) * k);
  };
  /** Kısa ipucu: referans frendeyken ben değilsem ya da o gazdayken ben bekliyorsam */
  const cue = () => {
    const d = data();
    const r = ref();
    if (!d || !r || !ok() || o().showCue === false) return "";
    if (r.nowBrk > 25 && d.brake < 0.08) return t("FREN");
    if (r.nowThr > 85 && d.throttle < 0.5 && d.brake < 0.08) return t("GAZ");
    if (r.nowBrk < 5 && d.brake > 0.3) return t("FRENİ BIRAK");
    return "";
  };
  const title = () => {
    const r = ref();
    const k = kind();
    if (k === "avg") return r?.status === "ok" && r.laps > 1 ? t("Topluluk ortalaması ({0} tur)", r.laps) : t("Topluluk ortalaması");
    if (k === "mine") return t("Kendi rekorum");
    return r?.name ? t("Topluluk rekoru · {0}", r.name) : t("Topluluk rekoru");
  };
  const note = () => {
    const s = ref()?.status;
    if (s === "loading" || (!ref() && !isSample())) return [t("Referans tur aranıyor…"), ""];
    if (s === "login") return [t("Giriş gerekli"), t("Kendi rekorunu görmek için hesabınla giriş yap.")];
    if (kind() === "avg") return [t("Yeterli veri yok"), t("Ortalama için bu pist ve araçta izi paylaşılmış en az 3 tur gerekir.")];
    if (kind() === "mine") return [t("Yeterli veri yok"), t("Bu pist ve araçta kayıtlı (izi olan) bir turun yok.")];
    return [t("Yeterli veri yok"), t("Bu pist ve araç için toplulukta izi paylaşılmış bir tur yok.")];
  };

  const style = (): JSX.CSSProperties => ({
    width: `${clamp(num(o().width, 460), 280, 1000)}px`,
    "font-size": `${clamp(num(o().fontSize, 14), 10, 28)}px`,
    "--co-thr": hex(o().colThr, "#35d07f"),
    "--co-brk": hex(o().colBrk, "#ff4d4f"),
    "--co-gain": hex(o().colGain, "#35d07f"),
    "--co-loss": hex(o().colLoss, "#ff4d4f"),
  });

  const Bar = (p: { mine: number; refv: number; c: string; label: string }) => (
    <div class="co-bar" style={{ "--c": p.c }} title={p.label}>
      <i class="co-bar-ref" style={{ height: `${clamp(p.refv, 0, 100)}%` }} />
      <i class="co-bar-me" style={{ height: `${clamp(p.mine, 0, 100)}%` }} />
    </div>
  );

  return (
    <Show when={visible()}>
      <div class="ov-panel co" style={style()}>
        <div class="co-head">
          <Show when={o().showLogo !== false}>
            <img class="co-logo" src={appLogo} alt="" draggable={false} />
          </Show>
          <b>CANLI KIYAS</b>
          <span class="co-ref" data-no-i18n>
            {title()}
            <Show when={ok() && ref()!.time > 0}>
              <em>{lapTime(ref()!.time)}</em>
            </Show>
          </span>
        </div>
        <Show
          when={ok()}
          fallback={
            <div class="co-note">
              <b>{note()[0]}</b>
              <Show when={note()[1]}>
                <span>{note()[1]}</span>
              </Show>
            </div>
          }
        >
          <div class="co-main">
            <Show when={o().showGraph !== false}>
              <div class="co-graph" style={{ height: `${clamp(num(o().graphH, 90), 50, 260)}px` }}>
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                  <path class="co-a co-a-thr" d={area(ref()!.thr)} />
                  <path class="co-a co-a-brk" d={area(ref()!.brk)} />
                  <path class="co-l co-l-thr" d={line(data()!.myThr, total())} />
                  <path class="co-l co-l-brk" d={line(data()!.myBrk, total())} />
                  <line class="co-now" x1={nowX()} x2={nowX()} y1="0" y2={H} />
                </svg>
                <Show when={cue()}>
                  <span class="co-cue">{cue()}</span>
                </Show>
                <Show when={data()!.windowM > 0}>
                  <small class="co-scale" data-no-i18n>
                    {Math.round(((total() - 1 - data()!.nowIdx) / (total() - 1)) * data()!.windowM)} m →
                  </small>
                </Show>
              </div>
            </Show>
            <Show when={o().showBars !== false}>
              <div class="co-bars">
                <Bar mine={data()!.throttle * 100} refv={ref()!.nowThr} c="var(--co-thr)" label={t("Gaz: sen ve referans")} />
                <Bar mine={data()!.brake * 100} refv={ref()!.nowBrk} c="var(--co-brk)" label={t("Fren: sen ve referans")} />
              </div>
            </Show>
            <Show when={o().showDelta !== false || o().showSpeed !== false}>
              <div class="co-side">
                <Show when={o().showDelta !== false}>
                  <span class={`co-delta ${cls(ref()!.delta)}`} data-no-i18n>
                    {fmtDelta(ref()!.delta)}
                  </span>
                  <small>FARK</small>
                </Show>
                <Show when={o().showSpeed !== false && speedDiff() != null}>
                  <span class={`co-speed ${speedDiff()! < 0 ? "co-loss" : speedDiff()! > 0 ? "co-gain" : ""}`} data-no-i18n>
                    {speedDiff()! > 0 ? "+" : speedDiff()! < 0 ? "−" : ""}
                    {Math.abs(speedDiff()!)} {props.units === "imperial" ? "mph" : "km/h"}
                  </span>
                </Show>
              </div>
            </Show>
          </div>
          <Show when={o().showSectors !== false}>
            <div class="co-sectors">
              <For each={ref()!.sectors}>
                {(s, i) => (
                  <span class={`co-sec ${cls(s)}`} classList={{ cur: Math.min(2, Math.floor(data()!.lapPct * 3)) === i() }} data-no-i18n>
                    <i>B{i() + 1}</i>
                    {fmtDelta(s)}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
