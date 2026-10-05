import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { MGDL_PER_MMOL, STALE_MS, glucoseAlert, glucoseRefresh, useGlucose, type GlucoseState } from "@/sdk/glucose";
import { t } from "@/sdk/i18n";
import { GLUCOSE_THEMES } from "./manifest";
import "./style.css";

type Level = "ul" | "l" | "ok" | "h" | "uh";

/** Panel önizlemesi / giriş yapılmamışken düzenleme: örnek veri */
function sample(now: number): GlucoseState {
  const pts = [104, 108, 115, 124, 131, 136, 138, 134, 127, 121, 116, 112, 110, 113, 118, 122, 119, 114, 112];
  const hist = pts.map((v, i) => [now - (pts.length - 1 - i) * 5 * 60_000 - 60_000, v] as [number, number]);
  return { loggedIn: true, source: "sample", account: "", value: 112, arrow: "→", ts: hist[hist.length - 1][0], hist, error: "", checkedAt: now };
}

/** Kan damlası (özgün çizim) */
const Drop = () => (
  <svg class="gl-drop" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.2c-.3 0-.6.15-.8.42C8.9 5.7 5 10.6 5 14.6 5 18.7 8.1 21.8 12 21.8s7-3.1 7-7.2c0-4-3.9-8.9-6.2-11.98a1 1 0 0 0-.8-.42z" fill="currentColor" />
    <path d="M8.3 14.4c0 2.1 1.4 3.7 3.2 4" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.4" stroke-linecap="round" />
  </svg>
);

export default function Glucose(props: OverlayProps) {
  const o = () => props.options;
  const live = useGlucose(() => onScreen());
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => !previewFrozen() && setNow(Date.now()), 15_000);
  onCleanup(() => clearInterval(iv));

  /** Panelde (önizleme / tuval) her zaman örnek; ekranda giriş yoksa düzenlemede örnek, değilse "giriş yap" */
  const demo = () => !onScreen() || (!live().loggedIn && props.editing);
  const st = createMemo<GlucoseState>(() => (demo() ? sample(now()) : live()));

  const n = (k: string, d: number) => {
    const v = Number(o()[k]);
    return Number.isFinite(v) ? v : d;
  };
  const low = () => n("low", 70);
  const high = () => Math.max(low() + 10, n("high", 180));
  const uLow = () => Math.min(low(), n("urgentLow", 55));
  const uHigh = () => Math.max(high(), n("urgentHigh", 250));
  const mmol = () => o().unit === "mmol";

  const value = () => st().value;
  const stale = () => !demo() && !!st().ts && now() - st().ts > STALE_MS;
  const level = createMemo<Level>(() => {
    const v = value();
    if (v == null) return "ok";
    if (v <= uLow()) return "ul";
    if (v >= uHigh()) return "uh";
    if (v < low()) return "l";
    if (v > high()) return "h";
    return "ok";
  });
  const tone = () => (level() === "ok" ? "normal" : level() === "l" || level() === "h" ? "warn" : "urgent");

  const pal = createMemo(() => {
    const th = String(o().theme ?? "classic");
    if (th === "app") return null;
    if (th === "custom") return { normal: o().cNormal, warn: o().cWarn, urgent: o().cUrgent, bg: o().cBg, text: o().cText };
    return GLUCOSE_THEMES[th] ?? GLUCOSE_THEMES.classic;
  });
  const vars = () => {
    const p = pal();
    return p ? { "--gl-normal": p.normal, "--gl-warn": p.warn, "--gl-urgent": p.urgent, "--gl-bg": p.bg, "--gl-text": p.text } : {};
  };

  const fmt = (v: number) => (mmol() ? (v / MGDL_PER_MMOL).toFixed(1) : String(Math.round(v)));
  const deltaText = () => {
    const h = st().hist;
    if (h.length < 2) return "";
    const d = h[h.length - 1][1] - h[h.length - 2][1];
    if (mmol()) return `${d >= 0 ? "+" : "−"}${Math.abs(d / MGDL_PER_MMOL).toFixed(1)}`;
    return `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`;
  };
  const timeText = () => (st().ts ? new Date(st().ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  const levelText = () => {
    switch (level()) {
      case "ul":
        return t("ÇOK DÜŞÜK");
      case "l":
        return t("DÜŞÜK");
      case "h":
        return t("YÜKSEK");
      case "uh":
        return t("ÇOK YÜKSEK");
      default:
        return "";
    }
  };
  const alerting = () => level() !== "ok" && !stale() && value() != null;

  // Sesli uyarı: yalnızca ekrandaki gerçek veride. Bekleme süresi Rust'ta (pencereler / kopyalar çift çalmaz).
  createEffect(() => {
    if (demo() || !onScreen() || value() == null) return;
    if (stale()) return;
    const lv = level();
    st().ts; // yeni ölçüm geldikçe yeniden dene (bekleme süresi dolduysa tekrar çalar)
    if (lv === "ok") return void glucoseAlert("ok", 0);
    if (o().sound !== false) void glucoseAlert(lv, n("volume", 60) / 100);
  });

  /** Mini grafik: son ölçümler, hedef aralık bandı */
  const spark = (w: number, h: number) => {
    const pts = st().hist;
    if (pts.length < 2) return null;
    const vs = pts.map((p) => p[1]);
    const lo = Math.min(...vs, low()) - 8;
    const hi = Math.max(...vs, high()) + 8;
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0] || t0 + 1;
    const x = (tm: number) => ((tm - t0) / Math.max(1, t1 - t0)) * (w - 4) + 2;
    const y = (v: number) => h - 2 - ((v - lo) / Math.max(1, hi - lo)) * (h - 4);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    return { d, bandY: y(high()), bandH: Math.max(1, y(low()) - y(high())), cx: x(last[0]), cy: y(last[1]) };
  };
  const Spark = (p: { w: number; h: number }) => (
    <Show when={spark(p.w, p.h)}>
      {(s) => (
        <svg class="gl-spark" viewBox={`0 0 ${p.w} ${p.h}`} width={p.w} height={p.h} preserveAspectRatio="none">
          <rect class="gl-band" x="0" y={s().bandY} width={p.w} height={s().bandH} rx="2" />
          <path class="gl-line" d={s().d} />
          <circle class="gl-dot" cx={s().cx} cy={s().cy} r="2.6" />
        </svg>
      )}
    </Show>
  );
  /** Yuvarlak tasarımda halka: 40–300 mg/dL arası doluluk */
  const ring = () => {
    const v = value() ?? 0;
    const f = Math.max(0.04, Math.min(1, (v - 40) / 260));
    const c = 2 * Math.PI * 44;
    return { dash: `${(c * f).toFixed(1)} ${c.toFixed(1)}` };
  };

  const design = () => String(o().design ?? "card");
  const Value = () => (
    <span class="gl-value ov-mono">
      {value() == null ? "—" : fmt(value()!)}
      <Show when={o().arrow !== false && st().arrow && value() != null}>
        <i class="gl-arrow">{st().arrow}</i>
      </Show>
    </span>
  );
  const Sub = () => (
    <span class="gl-sub">
      <For each={[o().delta !== false && value() != null ? deltaText() : "", mmol() ? "mmol/L" : "mg/dL", o().time !== false ? timeText() : ""].filter(Boolean)}>{(x) => <b>{x}</b>}</For>
    </span>
  );

  return (
    <div
      class={`gl gl-${design()}`}
      classList={{ "gl-app": !pal(), "gl-stale": stale(), "gl-alert": alerting() && o().flash !== false, [`gl-${tone()}`]: true, "gl-dropstatus": o().dropColor === "status" }}
      style={vars()}
      onDblClick={() => glucoseRefresh()}
      title={st().error ? t(st().error) : undefined}
    >
      <Show
        when={demo() || live().loggedIn}
        fallback={
          <div class="gl-login">
            <Show when={o().drop !== false}>
              <Drop />
            </Show>
            <span>{t("Kan şekeri: overlay ayarlarından giriş yap")}</span>
          </div>
        }
      >
        <Show when={design() === "circle"}>
          <svg class="gl-ring" viewBox="0 0 100 100">
            <circle class="gl-ring-bg" cx="50" cy="50" r="44" />
            <circle class="gl-ring-fg" cx="50" cy="50" r="44" stroke-dasharray={ring().dash} transform="rotate(-90 50 50)" />
          </svg>
        </Show>
        <div class="gl-main">
          <div class="gl-head">
            <Show when={o().drop !== false}>
              <Drop />
            </Show>
            <Value />
            <Show when={alerting() && o().flash !== false}>
              <em class="gl-tag">{levelText()}</em>
            </Show>
          </div>
          <Sub />
          <Show when={stale()}>
            <span class="gl-note">{t("Veri eski")}</span>
          </Show>
          <Show when={!stale() && value() == null && st().error}>
            <span class="gl-note">{t(st().error)}</span>
          </Show>
        </div>
        <Show when={o().spark !== false && (design() === "card" || design() === "graph")}>
          <div class="gl-chart">
            <Spark w={design() === "graph" ? 300 : 96} h={design() === "graph" ? 64 : 44} />
          </div>
        </Show>
      </Show>
    </div>
  );
}
