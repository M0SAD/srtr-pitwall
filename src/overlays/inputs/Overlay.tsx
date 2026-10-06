import { Show, createEffect, onCleanup, onMount } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { gear, speed, speedUnit } from "@/sdk/format";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { FREE_WHEELS, WheelArt, resolveWheel, type WheelStyle } from "./wheels";
import { DesignView, isDesign, type Design } from "./designs";
import { LapLines } from "./shared";
import "./style.css";

const W0 = 240;
const H0 = 86;
const DEF_W = 430;
const DEF_H = 110;
/** Tasarımların doğal (ölçeksiz) yüksekliği: yan sütunun ölçeği buna göre hesaplanır */
const NATURAL_H: Record<Design, number> = { trace: 100, sim: 88, wide: 110 };
const ABS_DEF = "#ffd400";
const TC_DEF = "#00c8ff";

/** Tasarım seçimi: "default" bu dosyadaki ilk görünüm, diğerleri designs.tsx. PRO'ya ayrılmış tasarım kilitliyse varsayılan gösterilir. */
export default function Inputs(props: OverlayProps) {
  const design = (): Design | "default" => {
    const d = props.options.design;
    return isDesign(d) && !overlayValueLocked("inputs", "design", d) ? d : "default";
  };
  // Genişlik ve yükseklik gerçek boyuttur (eskiden "en az genişlik"ti): iz grafiği ve çubuklar alanı doldurur.
  // 200 ve altı eski "en az" kaydıdır; o zamanki doğal genişlik (430) kullanılır.
  const width = () => {
    const v = Number(props.options.width);
    return v > 200 ? Math.min(1200, Math.max(260, v)) : DEF_W;
  };
  const height = () => Math.min(260, Math.max(76, Number(props.options.height) || DEF_H));
  /** Vites / hız / direksiyon sütunu yükseklikle birlikte ölçeklenir (tasarımın doğal yüksekliğine göre) */
  const sideK = () => {
    const d = design();
    const h0 = d === "default" ? (props.options.showGear && props.options.showSteer ? 114 : 102) : NATURAL_H[d];
    return Math.round(Math.min(1.6, Math.max(0.6, height() / h0)) * 1000) / 1000;
  };
  return (
    <div class="inp-stack inp-fit" style={{ "--inp-w": `${width()}px`, "--inp-h": `${height()}px`, "--inp-k": String(sideK()) }}>
      <Show when={design() !== "default"} fallback={<DefaultDesign {...props} />}>
        <DesignView {...props} design={design() as Design} />
      </Show>
      <LapLines {...props} />
    </div>
  );
}

function DefaultDesign(props: OverlayProps) {
  const data = useTopic("inputs");
  let canvas: HTMLCanvasElement | undefined;

  // Halka tampon: bellek ayırmadan son N saniyelik örnekler
  let cap = 0;
  let thr = new Float32Array(0);
  let brk = new Float32Array(0);
  let clu = new Float32Array(0);
  // ABS / TC çalışıyor mu (iz grafiğinde o kısımları renklendirmek için)
  let absB = new Uint8Array(0);
  let tcB = new Uint8Array(0);
  let head = 0;
  let count = 0;
  let pending = false;

  const ensure = () => {
    const n = Math.max(60, Math.round((props.options.seconds as number) * 60));
    if (n !== cap) {
      cap = n;
      thr = new Float32Array(n);
      brk = new Float32Array(n);
      clu = new Float32Array(n);
      absB = new Uint8Array(n);
      tcB = new Uint8Array(n);
      head = 0;
      count = 0;
    }
  };

  // İz grafiği genişlik / yükseklik ayarıyla büyür ve küçülür: tuval çözünürlüğü kutusunun yerleşim boyutunu izler
  let box: HTMLDivElement | undefined;
  let W = W0;
  let H = H0;
  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!canvas || !box) return;
      const w = Math.max(40, Math.round(box.clientWidth));
      const h = Math.max(24, Math.round(box.clientHeight));
      W = w;
      H = h;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      draw();
    });
    createEffect(() => {
      ro.disconnect();
      if (props.options.showTrace && box) ro.observe(box);
    });
    onCleanup(() => ro.disconnect());
  });

  const draw = () => {
    pending = false;
    const ctx = canvas?.getContext("2d");
    if (!ctx || count === 0) return;
    ctx.clearRect(0, 0, W, H);
    // Yatay kılavuz çizgileri
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const y of [0.25, 0.5, 0.75]) {
      ctx.moveTo(0, Math.round(H * y) + 0.5);
      ctx.lineTo(W, Math.round(H * y) + 0.5);
    }
    ctx.stroke();

    const smooth = !!props.options.smooth;
    const line = (buf: Float32Array, color: string, flags?: Uint8Array, hiColor?: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      const start = (head - count + cap) % cap;
      const at = (i: number) => buf[(start + Math.max(0, Math.min(count - 1, i))) % cap];
      const X = (i: number) => W - ((count - 1 - i) / (cap - 1)) * W;
      const raw = (i: number) => H - 2 - at(i) * (H - 4);
      const smoothY = (i: number) => {
        const v = (at(i - 2) + 2 * at(i - 1) + 3 * at(i) + 2 * at(i + 1) + at(i + 2)) / 9;
        return H - 2 - v * (H - 4);
      };
      if (!smooth) {
        for (let i = 0; i < count; i++) {
          const y = H - 2 - at(i) * (H - 4);
          i === 0 ? ctx.moveTo(X(i), y) : ctx.lineTo(X(i), y);
        }
      } else {
        // Yumuşak: önce 5 örneklik ağırlıklı ortalama, sonra noktalar arası ikinci derece eğriler
        const Y = smoothY;
        const step = 2; // her 2 örnekte bir kontrol noktası (daha akıcı ve daha az çizim)
        ctx.moveTo(X(0), Y(0));
        let i = step;
        for (; i < count - step; i += step) {
          const mx = (X(i) + X(i + step)) / 2;
          const my = (Y(i) + Y(i + step)) / 2;
          ctx.quadraticCurveTo(X(i), Y(i), mx, my);
        }
        ctx.lineTo(X(count - 1), Y(count - 1));
      }
      ctx.stroke();
      // ABS/TC çalıştığı kısımları üstüne vurgu rengiyle çiz
      if (flags && hiColor) {
        const Y = smooth ? smoothY : raw;
        const fl = (i: number) => flags[(start + i) % cap] === 1;
        ctx.strokeStyle = hiColor;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (!fl(i)) continue;
          if (i === 0 || !fl(i - 1)) ctx.moveTo(X(Math.max(0, i - 1)), Y(Math.max(0, i - 1)));
          ctx.lineTo(X(i), Y(i));
        }
        ctx.stroke();
      }
    };
    if (props.options.showClutch) line(clu, "#4aa8ff");
    line(brk, props.options.brakeColor, absBar() ? absB : undefined, props.options.absColor || ABS_DEF);
    line(thr, props.options.throttleColor, tcBar() ? tcB : undefined, props.options.tcColor || TC_DEF);
  };

  createEffect(() => {
    const d = data();
    if (!d) return;
    ensure();
    thr[head] = d.throttle;
    brk[head] = d.brake;
    clu[head] = d.clutch;
    absB[head] = d.abs && d.brake > 0.01 ? 1 : 0;
    tcB[head] = d.tc && d.throttle > 0.01 ? 1 : 0;
    head = (head + 1) % cap;
    count = Math.min(count + 1, cap);
    if (props.options.showTrace && !pending) {
      pending = true;
      requestAnimationFrame(draw);
    }
  });

  onCleanup(() => (pending = true));

  // Direksiyon tasarımı: "auto" sürülen araca göre seçer; tasarımlı direksiyonlar PRO'ya özel
  const status = useTopic("status");
  const wheelStyle = (): WheelStyle => {
    const o = props.options.wheelStyle as string;
    const st = resolveWheel(o, status());
    // Yöneticinin PRO özellikleri kararına göre (overlay.inputs.wheelStyle.<tasarım>)
    return FREE_WHEELS.has(st) || !overlayValueLocked("inputs", "wheelStyle", st) ? st : "round";
  };
  const wheelAccent = () => (props.options.wheelAccentOn ? (props.options.wheelAccent as string) : "var(--ov-accent)");
  const steerDeg = () => Math.round((-(data()?.steer ?? 0) * 180) / Math.PI);

  // ABS / TC göstergesi: "bar" (renk), "frame" (dış çerçeve), "both", "off"
  const absMode = () => (props.options.absMode as string) ?? "both";
  const tcMode = () => (props.options.tcMode as string) ?? "both";
  function absBar() {
    return absMode() === "bar" || absMode() === "both";
  }
  function tcBar() {
    return tcMode() === "bar" || tcMode() === "both";
  }
  const absOn = () => !!data()?.abs && (data()?.brake ?? 0) > 0.01;
  const tcOn = () => !!data()?.tc && (data()?.throttle ?? 0) > 0.01;
  const absColor = () => (props.options.absColor as string) || ABS_DEF;
  const tcColor = () => (props.options.tcColor as string) || TC_DEF;
  const brakeFill = () => (absOn() && absBar() ? absColor() : props.options.brakeColor);
  const thrFill = () => (tcOn() && tcBar() ? tcColor() : props.options.throttleColor);
  const absFrame = () => absOn() && (absMode() === "frame" || absMode() === "both");
  const tcFrame = () => tcOn() && (tcMode() === "frame" || tcMode() === "both");

  const showPct = () => props.options.showPct !== false;
  const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;
  const shiftOn = () => {
    const d = data();
    return !!d && d.shiftRpm > 0 && d.rpm >= d.shiftRpm;
  };

  return (
    <div class="ov-panel inp" classList={{ shift: shiftOn() }}>
      <Show when={props.options.showTrace}>
        <div class="inp-tracebox" ref={box}>
          <canvas ref={canvas} width={W0} height={H0} class="inp-trace" />
        </div>
      </Show>
      <div class="inp-bars">
        <Show when={props.options.showClutch}>
          <div class="inp-col">
            <Show when={showPct()}>
              <span class="inp-pct">{pct(data()?.clutch)}</span>
            </Show>
            <div class="inp-bar">
              <div class="inp-fill" style={{ height: pct(data()?.clutch), background: "#4aa8ff" }} />
            </div>
          </div>
        </Show>
        <div class="inp-col">
          <Show when={showPct()}>
            <span class="inp-pct">{pct(data()?.brake)}</span>
          </Show>
          <div class="inp-bar" classList={{ glow: absFrame() }} style={{ "--glow": absColor() }} title="Fren (ABS)">
            <div class="inp-fill" style={{ height: pct(data()?.brake), background: brakeFill() }} />
          </div>
        </div>
        <div class="inp-col">
          <Show when={showPct()}>
            <span class="inp-pct">{pct(data()?.throttle)}</span>
          </Show>
          <div class="inp-bar" classList={{ glow: tcFrame() }} style={{ "--glow": tcColor() }} title="Gaz (TC)">
            <div class="inp-fill" style={{ height: pct(data()?.throttle), background: thrFill() }} />
          </div>
        </div>
      </div>
      <Show when={props.options.showGear}>
        <div class="inp-gear">
          <b>{gear(data()?.gear ?? 0)}</b>
          <span>{speed(data()?.speed ?? 0, props.units)}</span>
          <small>{speedUnit(props.units)}</small>
          <Show when={props.options.showSteer}>
            <WheelArt
              style={wheelStyle()}
              angle={-(data()?.steer ?? 0)}
              accent={wheelAccent()}
              size={((props.options.wheelSize as number) ?? 100) / 100}
            />
            <Show when={props.options.showSteerDeg}>
              <small class="inp-deg">{steerDeg()}°</small>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
