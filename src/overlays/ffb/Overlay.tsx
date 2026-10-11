import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const rgba = (v: unknown, a: number) => {
  const h = hex(v, "#0c0e13");
  return `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${clamp(a, 0, 100) / 100})`;
};
const DESIGNS = ["card", "bar", "gauge", "minimal"];
/** Bu orandan sonrası "sınırda" (clipping) sayılır */
const CLIP = 0.985;
/** Sınır uyarısı bu kadar ms açık kalır (kısa vuruşlar da görünsün) */
const CLIP_HOLD = 450;
/** Sınırda kalma oranı penceresi */
const WINDOW_MS = 30_000;
// Yarım daire gösterge yayı (r = 40, 180°)
const ARC = Math.PI * 40;

// FFB Gücü: iRacing'in FFB gücü ayarını (SteeringWheelMaxForceNm, "Max Force") ve şaftaki anlık torkun bu güce oranını
// (SteeringWheelPctTorque) gösterir. Oran 1'e dayanınca güç geri bildirimi sınırdadır (clipping).
export default function Ffb(props: OverlayProps) {
  const d = useTopic("inputs");
  const o = () => props.options;
  const design = () => (DESIGNS.includes(String(o().design)) ? String(o().design) : "card");

  const known = () => num(d()?.ffbMaxNm, -1) > 0;
  const maxNm = () => num(d()?.ffbMaxNm, -1);
  const pct = () => clamp(num(d()?.ffbPct, 0), 0, 1);
  const peak = () => num(d()?.ffbPeakNm, -1);
  const decimals = () => (num(o().decimals, 1) >= 1 ? 1 : 0);
  const value = () => (known() ? maxNm().toFixed(decimals()) : "—");

  // Sınır uyarısı: kısa süre açık kalır; son 30 sn'deki sınırda kalma oranı örneklerden hesaplanır
  const [clipUntil, setClipUntil] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const samples: [number, boolean][] = [];
  const [clipRate, setClipRate] = createSignal(0);
  createEffect(() => {
    const x = d();
    if (!x || !known()) return;
    const t = Date.now();
    const c = num(x.ffbPct, 0) >= CLIP;
    if (c) setClipUntil(t + CLIP_HOLD);
    samples.push([t, c]);
    while (samples.length && samples[0][0] < t - WINDOW_MS) samples.shift();
    let n = 0;
    for (const s of samples) if (s[1]) n++;
    setClipRate(samples.length ? n / samples.length : 0);
  });
  const tick = window.setInterval(() => setNow(Date.now()), 150);
  onCleanup(() => clearInterval(tick));
  const clipping = () => o().clipWarn !== false && known() && now() < clipUntil();

  const custom = () => !!o().customColors;
  const style = () => {
    const st: Record<string, string> = {
      "--ffb-k": String(clamp(num(o().size, 100), 50, 300) / 100),
      "--ffb-bar": custom() ? hex(o().barColor, "#ff8a2a") : "var(--ov-accent)",
      "--ffb-clip": custom() ? hex(o().clipColor, "#ff4d4d") : "var(--ov-red)",
    };
    if (custom()) {
      st["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      st["--ov-text"] = hex(o().textColor, "#f2f4f8");
    }
    return st;
  };

  const extras = () => (
    <>
      <Show when={o().clipStat && known()}>
        <span class="ffb-stat" classList={{ hi: clipRate() >= 0.05 }}>
          <span>SINIR</span> <b>%{Math.round(clipRate() * 100)}</b>
        </span>
      </Show>
      <Show when={o().showPeak && peak() > 0}>
        <span class="ffb-stat">
          <span>TEPE</span> <b>{peak().toFixed(1)}</b> <small>Nm</small>
        </span>
      </Show>
    </>
  );

  const torqueBar = () => (
    <Show when={o().showTorque !== false}>
      <div class="ffb-track">
        <i style={{ width: `${(pct() * 100).toFixed(1)}%` }} />
        <em />
      </div>
    </Show>
  );

  return (
    <div class={`ov-theme ffb ffb-${design()}`} classList={{ "ffb-clipping": clipping(), "ffb-none": !known() }} style={style()}>
      <Show when={design() === "card"}>
        <div class="ov-panel ffb-box">
          <div class="ffb-row">
            <Show when={o().showLabel !== false}>
              <span class="ffb-cap">FFB</span>
            </Show>
            <span class="ffb-val ov-mono">
              {value()}
              <small>Nm</small>
            </span>
          </div>
          {torqueBar()}
          <Show when={o().clipStat || o().showPeak}>
            <div class="ffb-extras">{extras()}</div>
          </Show>
        </div>
      </Show>

      <Show when={design() === "bar"}>
        <div class="ov-panel ffb-box ffb-hbox">
          <Show when={o().showLabel !== false}>
            <span class="ffb-cap">FFB</span>
          </Show>
          <span class="ffb-val ov-mono">
            {value()}
            <small>Nm</small>
          </span>
          <Show when={o().showTorque !== false} fallback={<span class="ffb-gap" />}>
            <div class="ffb-track ffb-track-wide">
              <i style={{ width: `${(pct() * 100).toFixed(1)}%` }} />
              <em />
            </div>
            <span class="ffb-pct ov-mono">{Math.round(pct() * 100)}%</span>
          </Show>
          {extras()}
        </div>
      </Show>

      <Show when={design() === "gauge"}>
        <div class="ov-panel ffb-box ffb-gbox">
          <svg class="ffb-svg" viewBox="0 0 100 58">
            <path class="trk" d="M10 50 A40 40 0 0 1 90 50" />
            <Show when={o().showTorque !== false}>
              <path class="val" d="M10 50 A40 40 0 0 1 90 50" stroke-dasharray={`${(ARC * pct()).toFixed(1)} ${ARC}`} />
            </Show>
            <path class="zone" d="M10 50 A40 40 0 0 1 90 50" stroke-dasharray={`0 ${(ARC * 0.94).toFixed(1)} ${(ARC * 0.06).toFixed(1)} 0`} />
          </svg>
          <div class="ffb-gin">
            <span class="ffb-val ov-mono">{value()}</span>
            <span class="ffb-unit">
              <Show when={o().showLabel !== false}>FFB · </Show>Nm
            </span>
          </div>
          <Show when={o().clipStat || o().showPeak}>
            <div class="ffb-extras">{extras()}</div>
          </Show>
        </div>
      </Show>

      <Show when={design() === "minimal"}>
        <div class="ffb-min">
          <Show when={o().showLabel !== false}>
            <span class="ffb-cap">FFB</span>
          </Show>
          <span class="ffb-val ov-mono">
            {value()}
            <small>Nm</small>
          </span>
          <Show when={o().showTorque !== false}>
            <span class="ffb-pct ov-mono">{Math.round(pct() * 100)}%</span>
          </Show>
          {extras()}
        </div>
      </Show>
    </div>
  );
}
