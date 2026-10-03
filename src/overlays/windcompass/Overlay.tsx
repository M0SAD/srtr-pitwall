// Rüzgâr Pusulası: rüzgârın araca GÖRE yönü (karşıdan / arkadan / yandan) ve hızı.
// `weather` konusundaki rüzgâr yönü (geldiği yön, kuzeye göre) ile aracın yönü (heading) farkından hesaplanır.
// İki özgün tasarım:  compass → Pusula   strip → Ok ve yazı şeridi

import { Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { wind, windUnit } from "@/sdk/format";
import { t } from "@/sdk/i18n";
import type { Weather } from "@/sdk/types";
import "./style.css";

const DESIGNS = ["compass", "strip"] as const;
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const DEG = 180 / Math.PI;
/** Açıyı (rad) -π..π aralığına sarar */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Düzenleme modunda sim verisi yokken yerleştirme için örnek */
const SAMPLE: Weather = { airTemp: 22, trackTemp: 31, windDir: 0.9, windVel: 5.2, heading: 0.2, humidity: 0.5, precip: 0, wetness: 1 };

export default function WindCompass(props: OverlayProps) {
  const live = useTopic("weather");
  const o = () => props.options;
  const w = createMemo<Weather | undefined>(() => live() ?? (props.editing ? SAMPLE : undefined));
  const design = (): Design => {
    const v = o().design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("windcompass", "design", v) ? v : "compass";
  };

  // Rüzgârın geldiği yön, aracın burnuna göre (rad): 0 karşıdan, +π/2 sağdan, ±π arkadan, −π/2 soldan.
  // Yumuşatma birim vektör üzerinde yapılır (±π sınırında sıçramaz).
  const [rel, setRel] = createSignal(0);
  let sx = 1;
  let sy = 0;
  let first = true;
  createEffect(
    on(w, (d) => {
      if (!d) return;
      const a = wrap(d.windDir - d.heading);
      const k = first ? 1 : 1 - clamp(num(o().smooth, 60), 0, 90) / 100;
      first = false;
      sx += (Math.cos(a) - sx) * k;
      sy += (Math.sin(a) - sy) * k;
      setRel(Math.atan2(sy, sx));
    }),
  );

  const vel = () => w()?.windVel ?? 0;
  const calm = () => vel() * 3.6 < clamp(num(o().calm, 3), 0, 20);
  /** "head" | "tail" | "right" | "left" */
  const side = () => {
    const a = Math.abs(rel());
    if (a <= Math.PI / 4) return "head";
    if (a >= (3 * Math.PI) / 4) return "tail";
    return rel() > 0 ? "right" : "left";
  };
  const cue = () => {
    if (calm()) return t("sakin");
    switch (side()) {
      case "head":
        return t("karşıdan");
      case "tail":
        return t("arkadan");
      case "right":
        return t("sağdan yan");
      default:
        return t("soldan yan");
    }
  };
  const color = () => {
    if (calm()) return "var(--ov-dim)";
    const s = side();
    if (s === "head") return (o().colHead as string) || "#4aa8ff";
    if (s === "tail") return (o().colTail as string) || "#33d17a";
    return (o().colCross as string) || "#ffcc33";
  };
  /** Boyuna bileşen (+ karşıdan) ve yanal bileşen (+ sağdan), m/s */
  const head = () => Math.cos(rel()) * vel();
  const cross = () => Math.sin(rel()) * vel();
  const un = () => windUnit(props.units);
  const spd = (ms: number) => wind(Math.abs(ms), props.units);

  const visible = () => {
    if (!w()) return false;
    if (props.editing) return true;
    return !(o().hideCalm && calm());
  };
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 14), 10, 28)}px`,
    "--wc-col": color(),
    "--wc-size": `${clamp(num(o().size, 120), 70, 260)}px`,
  });

  const Parts = () => (
    <Show when={o().showParts && !calm()}>
      <div class="wc-parts" data-no-i18n>
        <span>
          <i>{head() >= 0 ? t("Karşı") : t("Arka")}</i>
          <b>{spd(head())}</b>
        </span>
        <span>
          <i>{cross() >= 0 ? t("Sağdan") : t("Soldan")}</i>
          <b>{spd(cross())}</b>
        </span>
      </div>
    </Show>
  );

  return (
    <Show when={visible()}>
      <div class={`wc wc-d-${design()} ov-panel`} classList={{ "wc-calm": calm() }} style={style()}>
        <Show
          when={design() === "compass"}
          fallback={
            <>
              {/* Şerit: ok rüzgârın ESTİĞİ yönü gösterir (araç burnu yukarı) */}
              <svg class="wc-arrow" viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r="18" class="wc-arrow-ring" />
                <g transform={`rotate(${rel() * DEG + 180} 20 20)`}>
                  <path d="M20 6 L28 20 H23 V33 H17 V20 H12 Z" class="wc-arrow-shape" />
                </g>
              </svg>
              <Show when={o().showCue !== false}>
                <span class="wc-cue">{cue()}</span>
              </Show>
              <Show when={o().showSpeed !== false}>
                <span class="wc-speed" data-no-i18n>
                  <b>{wind(vel(), props.units)}</b> {un()}
                </span>
              </Show>
              <Parts />
            </>
          }
        >
          <svg class="wc-dial" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="54" class="wc-ring" />
            {/* Sabit işaretler: ön, sağ, arka, sol */}
            <path d="M60 6 V14 M114 60 H106 M60 114 V106 M6 60 H14" class="wc-tick" />
            <path d="M98.2 21.8 L94 26 M98.2 98.2 L94 94 M21.8 98.2 L26 94 M21.8 21.8 L26 26" class="wc-tick wc-tick-minor" />
            {/* Kuzey: araç döndükçe çevrede gezer */}
            <Show when={o().showNorth !== false}>
              <g transform={`rotate(${-(w()!.heading ?? 0) * DEG} 60 60)`}>
                <path d="M60 2 L64 10 H56 Z" class="wc-north" />
              </g>
            </Show>
            {/* Araç: genel, özgün silüet (burun yukarı) */}
            <path d="M54 42 Q60 38 66 42 Q69 44 69 52 V70 Q69 77 65 78 H55 Q51 77 51 70 V52 Q51 44 54 42 Z" class="wc-carbody" />
            <path d="M54 52 Q60 49 66 52 L65 58 Q60 56 55 58 Z" class="wc-carglass" />
            {/* Rüzgâr oku: geldiği yönden merkeze doğru */}
            <Show when={!calm()}>
              <g transform={`rotate(${rel() * DEG} 60 60)`}>
                <path d="M60 36 L68 22 H63 V10 H57 V22 H52 Z" class="wc-wind" />
              </g>
            </Show>
          </svg>
          <Show when={o().showCue !== false}>
            <span class="wc-cue">{cue()}</span>
          </Show>
          <Show when={o().showSpeed !== false}>
            <span class="wc-speed" data-no-i18n>
              <b>{wind(vel(), props.units)}</b> {un()}
            </span>
          </Show>
          <Parts />
        </Show>
      </div>
    </Show>
  );
}
