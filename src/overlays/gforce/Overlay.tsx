// G-Force overlay'i: yanal / boyuna ivme (g). Veri "inputs" konusundan (latG, longG; 60 Hz) gelir.
// Tasarımlar: circle (g-çemberi), bars (çubuklar), numeric (sayısal), friction (sürtünme çemberi).
// Çemberler tuvale çizilir; veri gelmedikçe (önizleme dondurulunca) yeni örnek eklenmez, çizim de durur.

import { Match, Show, Switch, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import "./style.css";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const SECTORS = 48;
const HZ = 60;
const f2 = (v: number) => v.toFixed(2);
const f1 = (v: number) => v.toFixed(1);

interface Peaks {
  left: number;
  right: number;
  accel: number;
  brake: number;
  total: number;
}
const ZERO: Peaks = { left: 0, right: 0, accel: 0, brake: 0, total: 0 };

/** Ortak durum: yumuşatılmış değerler, iz tamponu, tepe değerleri, sürtünme zarfı */
function createModel(props: OverlayProps) {
  const data = useTopic("inputs");
  const o = props.options;
  // Ekran eksenleri: x + = sağ, y + = yukarı
  const [x, setX] = createSignal(0);
  const [y, setY] = createSignal(0);
  const [peaks, setPeaks] = createSignal<Peaks>(ZERO);

  let sx = 0;
  let sy = 0;
  let cap = 0;
  let bx = new Float32Array(0);
  let by = new Float32Array(0);
  let head = 0;
  let count = 0;
  // Tepe değerleri: her yön için değer ve yakalandığı an
  const pk = { left: 0, right: 0, accel: 0, brake: 0, total: 0 };
  const pkT = { left: 0, right: 0, accel: 0, brake: 0, total: 0 };
  // Sürtünme zarfı: açı dilimi başına görülen en büyük yarıçap
  const env = new Float32Array(SECTORS);
  let painter: (() => void) | undefined;
  let pending = false;
  let dead = false;

  const ensure = () => {
    const n = Math.max(2, Math.round(clamp((o.trail as number) ?? 2, 0, 12) * HZ));
    if (n !== cap) {
      cap = n;
      bx = new Float32Array(n);
      by = new Float32Array(n);
      head = 0;
      count = 0;
    }
  };

  createEffect(() => {
    const d = data();
    if (!d) return;
    ensure();
    const lat = (d.latG ?? 0) * (o.flipLat ? 1 : -1);
    const lon = (d.longG ?? 0) * (o.flipLong ? 1 : -1);
    const k = 1 - clamp(((o.smoothing as number) ?? 40) / 100, 0, 0.9) * 0.97;
    sx += (lat - sx) * k;
    sy += (lon - sy) * k;
    bx[head] = sx;
    by[head] = sy;
    head = (head + 1) % cap;
    count = Math.min(count + 1, cap);

    // Tepe değerleri (gerçek yönlerle: sol/sağ viraj, hızlanma, fren)
    const now = performance.now();
    const hold = clamp((o.peakHold as number) ?? 10, 2, 120) * 1000;
    const smLat = sx * (o.flipLat ? 1 : -1);
    const smLon = sy * (o.flipLong ? 1 : -1);
    const upd = (key: keyof Peaks, v: number) => {
      if (v >= pk[key] || now - pkT[key] > hold) {
        pk[key] = Math.max(v, 0);
        pkT[key] = now;
      }
    };
    upd("right", smLat);
    upd("left", -smLat);
    upd("accel", smLon);
    upd("brake", -smLon);
    const tot = Math.hypot(sx, sy);
    upd("total", tot);

    // Zarf: yavaşça içe doğru söner, yeni uç değerlerle büyür
    if (tot > 0.15) {
      const a = Math.atan2(sy, sx);
      const i = Math.floor(((a + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS;
      if (tot > env[i]) env[i] = tot;
    }
    for (let i = 0; i < SECTORS; i++) env[i] *= 0.99985;

    setX(sx);
    setY(sy);
    setPeaks({ ...pk });
    if (painter && !pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!dead) painter?.();
      });
    }
  });
  onCleanup(() => (dead = true));

  return {
    o,
    x,
    y,
    peaks,
    /** Gerçek yönlerle: + sağ viraj */
    lat: () => x() * (o.flipLat ? 1 : -1),
    /** + hızlanma, - fren */
    lon: () => y() * (o.flipLong ? 1 : -1),
    total: () => Math.hypot(x(), y()),
    maxG: () => clamp((o.maxG as number) || 3, 0.5, 8),
    trail: (fn: (x: number, y: number, age: number) => void) => {
      // age: 0 (en yeni) … 1 (en eski)
      const start = (head - count + cap) % cap;
      for (let i = 0; i < count; i++) {
        const j = (start + i) % cap;
        fn(bx[j], by[j], 1 - (i + 1) / count);
      }
    },
    trailOn: () => ((o.trail as number) ?? 2) > 0,
    env,
    setPainter: (p: () => void) => (painter = p),
    clearPainter: (p: () => void) => {
      if (painter === p) painter = undefined;
    },
  };
}
type Model = ReturnType<typeof createModel>;

// ---------------------------------------------------------------------------------------------------------
// Tuval: g-çemberi ve sürtünme çemberi
// ---------------------------------------------------------------------------------------------------------
const S = 190; // mantıksal piksel

function Dial(props: { m: Model; friction?: boolean }) {
  let canvas: HTMLCanvasElement | undefined;
  const m = props.m;

  const paint = () => {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const cs = getComputedStyle(canvas);
    const text = cs.getPropertyValue("--ov-text").trim() || "#eef1f6";
    const dim = cs.getPropertyValue("--ov-dim").trim() || "#8d95a5";
    const dot = (m.o.dotColor as string) || "#ff8a2a";
    const peakC = (m.o.peakColor as string) || "#b76cff";
    const max = m.maxG();
    const c = S / 2;
    const R = c - 13;
    const px = (g: number) => c + (g / max) * R;
    const py = (g: number) => c - (g / max) * R;
    // Kenardan taşan değerler çemberin üstünde tutulur
    const lim = (gx: number, gy: number): [number, number] => {
      const r = Math.hypot(gx, gy);
      return r > max ? [(gx / r) * max, (gy / r) * max] : [gx, gy];
    };

    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, S, S);

    // Zemin
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    // g halkaları
    ctx.lineWidth = 1;
    ctx.font = "600 9px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const step = max > 4 ? 2 : max > 2 ? 1 : 0.5;
    for (let g = step; g < max - 1e-3; g += step) {
      ctx.beginPath();
      ctx.arc(c, c, (g / max) * R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      if (m.o.showNumbers !== false) {
        ctx.fillStyle = dim;
        ctx.globalAlpha = 0.8;
        ctx.fillText(String(g), c + 3, c - (g / max) * R - 1);
        ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);
    // Artı işareti
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(c - R, c + 0.5);
    ctx.lineTo(c + R, c + 0.5);
    ctx.moveTo(c + 0.5, c - R);
    ctx.lineTo(c + 0.5, c + R);
    ctx.stroke();
    // Dış halka
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.strokeStyle = text;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (props.friction) {
      // Kullanılan tutunma zarfı
      const env = m.env;
      let any = false;
      ctx.beginPath();
      for (let i = 0; i <= SECTORS; i++) {
        const j = i % SECTORS;
        const r = Math.min(env[j], max);
        if (r > 0.05) any = true;
        const a = ((j + 0.5) / SECTORS) * 2 * Math.PI - Math.PI;
        const X = px(Math.cos(a) * r);
        const Y = py(Math.sin(a) * r);
        i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      }
      if (any) {
        ctx.closePath();
        ctx.fillStyle = peakC;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = peakC;
        ctx.lineWidth = 1.3;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Geçmiş: yaşla solan noktalar
      if (m.trailOn()) {
        ctx.fillStyle = dot;
        m.trail((gx, gy, age) => {
          const [lx, ly] = lim(gx, gy);
          ctx.globalAlpha = 0.04 + 0.5 * (1 - age) * (1 - age);
          ctx.beginPath();
          ctx.arc(px(lx), py(ly), 1.7, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    } else {
      // İz: yaşla incelip solan çizgi
      if (m.trailOn()) {
        let prev: [number, number] | null = null;
        ctx.strokeStyle = dot;
        ctx.lineCap = "round";
        m.trail((gx, gy, age) => {
          const [lx, ly] = lim(gx, gy);
          const p: [number, number] = [px(lx), py(ly)];
          if (prev) {
            ctx.globalAlpha = 0.75 * (1 - age) * (1 - age);
            ctx.lineWidth = 0.8 + 2.6 * (1 - age);
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(p[0], p[1]);
            ctx.stroke();
          }
          prev = p;
        });
        ctx.globalAlpha = 1;
      }
      // Tepe işaretleri: dört eksende küçük çentikler
      if (m.o.showPeaks) {
        const p = m.peaks();
        const sxn = m.o.flipLat ? 1 : -1;
        const syn = m.o.flipLong ? 1 : -1;
        ctx.strokeStyle = peakC;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        const tick = (gx: number, gy: number) => {
          const r = Math.hypot(gx, gy);
          if (r < 0.08) return;
          const [lx, ly] = lim(gx, gy);
          const X = px(lx);
          const Y = py(ly);
          ctx.beginPath();
          if (gy === 0) {
            ctx.moveTo(X, Y - 5);
            ctx.lineTo(X, Y + 5);
          } else {
            ctx.moveTo(X - 5, Y);
            ctx.lineTo(X + 5, Y);
          }
          ctx.stroke();
        };
        tick(p.right * sxn, 0);
        tick(-p.left * sxn, 0);
        tick(0, p.accel * syn);
        tick(0, -p.brake * syn);
      }
    }

    // Nokta
    const [lx, ly] = lim(m.x(), m.y());
    const X = px(lx);
    const Y = py(ly);
    ctx.beginPath();
    ctx.arc(X, Y, 9, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(X, Y, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  };

  m.setPainter(paint);
  onMount(paint);
  // Ayar değişince (ölçek, renk, yön) veri gelmese de yeniden çiz
  createEffect(() => {
    void [m.o.maxG, m.o.dotColor, m.o.peakColor, m.o.showNumbers, m.o.showPeaks, m.o.flipLat, m.o.flipLong, m.o.trail, props.friction];
    paint();
  });
  onCleanup(() => m.clearPainter(paint));

  return <canvas ref={canvas} width={S * 2} height={S * 2} class="gf-canvas" style={{ width: `${S}px`, height: `${S}px` }} />;
}

/** Çemberin altındaki sayı satırı */
function Readout(props: { m: Model }) {
  const m = props.m;
  return (
    <div class="gf-read">
      <div>
        <label>Yanal</label>
        <b>{f2(Math.abs(m.lat()))}</b>
        <Show when={m.o.showPeaks}>
          <small>{f1(Math.max(m.peaks().left, m.peaks().right))}</small>
        </Show>
      </div>
      <div class="gf-tot">
        <label>Toplam</label>
        <b>
          {f2(m.total())}
          <i>g</i>
        </b>
        <Show when={m.o.showPeaks}>
          <small>{f1(m.peaks().total)}</small>
        </Show>
      </div>
      <div>
        <label>Boyuna</label>
        <b>{f2(Math.abs(m.lon()))}</b>
        <Show when={m.o.showPeaks}>
          <small>{f1(Math.max(m.peaks().accel, m.peaks().brake))}</small>
        </Show>
      </div>
    </div>
  );
}

function CircleDesign(props: { m: Model; friction?: boolean }) {
  return (
    <div class="ov-panel gf gf-circle" style={{ "--gf-peak": (props.m.o.peakColor as string) || "var(--ov-purple)" }}>
      <Dial m={props.m} friction={props.friction} />
      <Show when={props.m.o.showNumbers !== false}>
        <Readout m={props.m} />
      </Show>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Çubuklar: ortadan iki yana yanal çubuk + ortadan yukarı / aşağı boyuna çubuk
// ---------------------------------------------------------------------------------------------------------
function BarsDesign(props: { m: Model }) {
  const m = props.m;
  const frac = (v: number) => clamp(Math.abs(v) / m.maxG(), 0, 1) * 50;
  const sxn = () => (m.o.flipLat ? 1 : -1);
  const syn = () => (m.o.flipLong ? 1 : -1);
  const dot = () => (m.o.dotColor as string) || "var(--ov-accent)";
  const brakeUp = () => !m.o.flipLong;
  return (
    <div class="ov-panel gf gf-bars" style={{ "--gf-dot": dot(), "--gf-peak": (m.o.peakColor as string) || "var(--ov-purple)" }}>
      <div class="gf-vwrap">
        <span class="gf-cap">{brakeUp() ? "Fren" : "Gaz"}</span>
        <div class="gf-vbar">
          <i class="gf-mid" />
          <div
            class="gf-fill"
            classList={{ brake: m.lon() < 0 }}
            style={m.y() >= 0 ? { bottom: "50%", height: `${frac(m.y())}%` } : { top: "50%", height: `${frac(m.y())}%` }}
          />
          <Show when={m.o.showPeaks}>
            <i class="gf-pk" style={{ top: `${50 - frac(m.peaks().accel) * syn()}%` }} />
            <i class="gf-pk" style={{ top: `${50 + frac(m.peaks().brake) * syn()}%` }} />
          </Show>
        </div>
        <span class="gf-cap">{brakeUp() ? "Gaz" : "Fren"}</span>
      </div>
      <div class="gf-hside">
        <Show when={m.o.showNumbers !== false}>
          <div class="gf-big">
            <b>{f2(m.total())}</b>
            <i>g</i>
          </div>
        </Show>
        <div class="gf-hbar">
          <i class="gf-mid" />
          <div class="gf-fill" style={m.x() >= 0 ? { left: "50%", width: `${frac(m.x())}%` } : { right: "50%", width: `${frac(m.x())}%` }} />
          <Show when={m.o.showPeaks}>
            <i class="gf-pk" style={{ left: `${50 + frac(m.peaks().right) * sxn()}%` }} />
            <i class="gf-pk" style={{ left: `${50 - frac(m.peaks().left) * sxn()}%` }} />
          </Show>
        </div>
        <Show when={m.o.showNumbers !== false}>
          <div class="gf-rows">
            <div>
              <label>Yanal</label>
              <b>{f2(Math.abs(m.lat()))}</b>
              <Show when={m.o.showPeaks}>
                <small>{f1(Math.max(m.peaks().left, m.peaks().right))}</small>
              </Show>
            </div>
            <div>
              <label>Boyuna</label>
              <b>{f2(Math.abs(m.lon()))}</b>
              <Show when={m.o.showPeaks}>
                <small>{f1(Math.max(m.peaks().accel, m.peaks().brake))}</small>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Sayısal (minimal)
// ---------------------------------------------------------------------------------------------------------
function NumericDesign(props: { m: Model }) {
  const m = props.m;
  // Ok: noktanın ekrandaki yönü
  const ang = () => (Math.atan2(-m.y(), m.x()) * 180) / Math.PI;
  return (
    <div class="ov-panel gf gf-num" style={{ "--gf-dot": (m.o.dotColor as string) || "var(--ov-accent)", "--gf-peak": (m.o.peakColor as string) || "var(--ov-purple)" }}>
      <div class="gf-numtot">
        <svg viewBox="-12 -12 24 24" class="gf-arrow" style={{ transform: `rotate(${ang()}deg)`, opacity: clamp(m.total() / 0.3, 0.25, 1) }}>
          <path d="M -8 0 L 5 0 M 1 -5 L 7 0 L 1 5" />
        </svg>
        <b>{f2(m.total())}</b>
        <i>g</i>
      </div>
      <div class="gf-numrow">
        <label>Yanal</label>
        <b>{f2(Math.abs(m.lat()))}</b>
        <Show when={m.o.showPeaks}>
          <small>{f1(Math.max(m.peaks().left, m.peaks().right))}</small>
        </Show>
      </div>
      <div class="gf-numrow">
        <label>{m.lon() < -0.05 ? "Fren" : "Boyuna"}</label>
        <b>{f2(Math.abs(m.lon()))}</b>
        <Show when={m.o.showPeaks}>
          <small>{f1(Math.max(m.peaks().accel, m.peaks().brake))}</small>
        </Show>
      </div>
    </div>
  );
}

export default function GForce(props: OverlayProps) {
  const m = createModel(props);
  return (
    <Switch fallback={<CircleDesign m={m} />}>
      <Match when={props.options.design === "bars"}>
        <BarsDesign m={m} />
      </Match>
      <Match when={props.options.design === "numeric"}>
        <NumericDesign m={m} />
      </Match>
      <Match when={props.options.design === "friction"}>
        <CircleDesign m={m} friction />
      </Match>
    </Switch>
  );
}
