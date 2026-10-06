import { Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { METRICS } from "./metrics";
import "./style.css";

const SHAPES = ["rounded", "square", "pill", "circle", "cut", "slant", "underline", "plain"];
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** #rrggbb + opaklık (%) → rgba() */
function rgba(hex: unknown, alphaPct: number): string {
  const h = typeof hex === "string" && HEX.test(hex) ? hex : "#0c0e13";
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(alphaPct, 0, 100) / 100})`;
}
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);

// Veri Kutusu: seçilen tek değeri büyük gösterir. Şekil (köşeli, hap, daire, kesik köşe, eğik, alt çizgili, kutusuz),
// vurgu şeridi, başlık yeri / hizalama ve isteğe bağlı özel renkler ayarlanabilir. Özel renkler kapalıyken tema
// (ve kopyanın "Görünüm" ayarı) geçerlidir: renkler kutunun kendi --ov-* değişkenlerine yazılarak uygulanır.
export default function DataFrame(props: OverlayProps) {
  const tel = useTopic("telemetry");
  const ses = useTopic("session");
  const fuel = useTopic("fuel");
  const delta = useTopic("delta");

  const o = () => props.options;
  const metric = createMemo(() => METRICS.find((m) => m.id === o().metric) ?? METRICS[0]);
  const src = () => ({ tel: tel(), ses: ses(), fuel: fuel(), delta: delta() });
  const value = () => metric().get(src(), props.units);
  const tone = () => (o().toneColors === false ? "" : (metric().tone?.(src()) ?? ""));

  const shape = () => (SHAPES.includes(String(o().shape)) ? String(o().shape) : "rounded");
  const boxed = () => shape() !== "underline" && shape() !== "plain";
  const bar = () => (boxed() && shape() !== "circle" ? String(o().accentBar ?? "none") : "none");
  const titlePos = () => (["bottom", "left"].includes(String(o().titlePos)) ? String(o().titlePos) : "top");
  const align = () => (["left", "right"].includes(String(o().align)) ? String(o().align) : "center");
  const custom = () => !!o().customColors;
  const title = () => String(o().customTitle ?? "").trim();

  const style = () => {
    const s: Record<string, string> = {
      width: `${clamp(num(o().width, 150), 60, 400)}px`,
      "--df-pad": String(clamp(num(o().pad, 100), 40, 300) / 100),
      "--df-ts": String(clamp(num(o().titleSize, 100), 60, 220) / 100),
      "--df-accent": custom() ? hex(o().accentColor, "#ff8a2a") : "var(--ov-accent)",
    };
    if (custom()) {
      s["--ov-bg"] = rgba(o().bg, num(o().bgAlpha, 86));
      s["--ov-bg-solid"] = hex(o().bg, "#0c0e13");
      s["--ov-text"] = hex(o().valueColor, "#f2f4f8");
      s["--ov-dim"] = hex(o().titleColor, "#9aa3b2");
      s["--ov-line"] = hex(o().borderColor, "#2a2f3a");
      s["--ov-bw"] = `${clamp(num(o().borderW, 1), 0, 6)}px`;
      s.color = "var(--ov-text)";
    }
    return s;
  };

  return (
    <div
      class="ov-panel df"
      classList={{
        [`df-${shape()}`]: true,
        [`df-t-${titlePos()}`]: true,
        [`df-a-${align()}`]: true,
        [`df-bar-${bar()}`]: bar() !== "none",
        "df-glow": !!o().glow,
      }}
      style={style()}
    >
      <div class="df-in">
        <Show when={o().title}>
          <div class="df-title">
            <Show when={title()} fallback={metric().label}>
              <span data-no-i18n>{title()}</span>
            </Show>
          </div>
        </Show>
        <div class="df-value" classList={{ "ov-pos": tone() === "pos", "ov-neg": tone() === "neg" }}>
          <b class="ov-mono" style={{ "font-size": `${clamp(num(o().big, 26), 12, 96)}px` }}>
            {value()?.[0] ?? "—"}
          </b>
          <Show when={o().showUnit !== false && value()?.[1]}>
            <span>{value()![1]}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}
