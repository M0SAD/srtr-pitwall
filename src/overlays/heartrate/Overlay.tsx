import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { HR_STALE_MS, heartAlert, useHeartRate } from "@/sdk/heartrate";
import { useTopic } from "@/sdk/telemetry";
import { t } from "@/sdk/i18n";
import { HEART_THEMES } from "./manifest";
import "./style.css";

const ZONES = [
  { from: 0, name: "Dinlenme", color: "#60a5fa" },
  { from: 0.6, name: "Hafif", color: "#3ddc84" },
  { from: 0.7, name: "Orta", color: "#ffd34d" },
  { from: 0.8, name: "Yüksek", color: "#ff9a3d" },
  { from: 0.9, name: "En yüksek", color: "#ff4d5e" },
];

/** Kalp (özgün çizim) */
const Heart = () => (
  <svg class="hr-heart" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21.2c-.3 0-.6-.1-.8-.3C6 16.6 2.4 13.300 2.400 9.200 2.400 6.300 4.600 4 7.400 4c1.800 0 3.500.900 4.600 2.400C13.100 4.900 14.800 4 16.600 4c2.800 0 5 2.300 5 5.200 0 4.100-3.600 7.400-8.800 11.700-.2.200-.5.300-.8.300z" fill="currentColor" />
  </svg>
);

export default function HeartRate(props: OverlayProps) {
  const o = () => props.options;
  // Panel önizlemesi de "bakıyorum" der: bağlıysa önizlemede de gerçek nabız görünür
  const live = useHeartRate(() => true);
  const status = useTopic("status");
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => !previewFrozen() && setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(iv));

  /** Etkin (taze) bir ölçüm var mı */
  const real = () => live().bpm != null && now() - live().ts < HR_STALE_MS;
  /** Benzetim: gerçek ölçüm yokken panel önizlemesinde, Demo modunda ve düzenlemede */
  const sim = () => !real() && (!onScreen() || !!status()?.demo || props.editing);

  // Normal aralıkta gezinen örnek nabız (yavaş dalga + küçük oynama); geçmişi de üretir
  const simAt = (ms: number) => {
    const s = ms / 1000;
    return Math.round(112 + 26 * Math.sin(s / 37) + 12 * Math.sin(s / 11 + 1.3) + 4 * Math.sin(s / 2.7));
  };
  const bpm = createMemo<number | null>(() => (real() ? live().bpm : sim() ? simAt(now()) : null));
  const hist = createMemo<[number, number][]>(() => {
    if (real()) return live().hist;
    if (!sim()) return [];
    const n = now();
    return Array.from({ length: 60 }, (_, i) => [n - (59 - i) * 2000, simAt(n - (59 - i) * 2000)] as [number, number]);
  });

  const maxHr = () => Math.max(120, Number(o().maxHr) || 190);
  const pct = () => (bpm() == null ? 0 : bpm()! / maxHr());
  const zone = createMemo(() => {
    let z = ZONES[0];
    for (const x of ZONES) if (pct() >= x.from) z = x;
    return z;
  });
  const pal = createMemo(() => {
    const th = String(o().theme ?? "classic");
    if (th === "app") return null;
    if (th === "custom") return { accent: o().cAccent, bg: o().cBg, text: o().cText };
    return HEART_THEMES[th] ?? HEART_THEMES.classic;
  });
  const vars = () => {
    const p = pal();
    const v: Record<string, string> = p ? { "--hr-accent": p.accent, "--hr-bg": p.bg, "--hr-text": p.text } : {};
    if (o().zoneColor && bpm() != null) v["--hr-accent"] = zone().color;
    // Kalp atışı animasyonunun süresi: bir atım
    v["--hr-beat"] = `${(60 / Math.max(30, Math.min(220, bpm() ?? 60))).toFixed(3)}s`;
    return v;
  };

  const alerting = () => !!o().alert && bpm() != null && bpm()! >= (Number(o().alertAt) || 175);
  createEffect(() => {
    if (!alerting() || !real() || !onScreen() || o().sound === false) return;
    live().ts; // sınırın üstünde kaldıkça dakikada bir yeniden (bekleme süresi Rust'ta)
    void heartAlert((Number(o().volume) || 60) / 100);
  });

  const range = createMemo(() => {
    const vs = hist().map((p) => p[1]);
    return vs.length ? { lo: Math.min(...vs), hi: Math.max(...vs) } : null;
  });
  const spark = (w: number, h: number) => {
    const pts = hist();
    if (pts.length < 2) return null;
    const lo = Math.min(...pts.map((p) => p[1])) - 4;
    const hi = Math.max(...pts.map((p) => p[1])) + 4;
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const x = (tm: number) => ((tm - t0) / Math.max(1, t1 - t0)) * (w - 4) + 2;
    const y = (v: number) => h - 2 - ((v - lo) / Math.max(1, hi - lo)) * (h - 4);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
    return { d, area: `${d} L${x(t1).toFixed(1)} ${h} L${x(t0).toFixed(1)} ${h} Z` };
  };
  const Spark = (p: { w: number; h: number }) => (
    <Show when={spark(p.w, p.h)}>
      {(s) => (
        <svg class="hr-spark" viewBox={`0 0 ${p.w} ${p.h}`} width={p.w} height={p.h} preserveAspectRatio="none">
          <path class="hr-area" d={s().area} />
          <path class="hr-line" d={s().d} />
        </svg>
      )}
    </Show>
  );
  const ring = () => {
    const c = 2 * Math.PI * 44;
    return `${(c * Math.max(0.04, Math.min(1, pct()))).toFixed(1)} ${c.toFixed(1)}`;
  };
  const design = () => String(o().design ?? "card");
  const beating = () => o().beat !== false && bpm() != null && !previewFrozen();
  const note = () => {
    if (bpm() != null) return "";
    if (!live().configured) return t("Nabız: overlay ayarlarından bağlan");
    if (live().error) return t(live().error);
    return live().connected ? t("Ölçüm bekleniyor…") : t("Bağlanıyor…");
  };

  return (
    <div
      class={`hr hr-${design()}`}
      classList={{ "hr-app": !pal(), "hr-beating": beating(), "hr-alert": alerting(), "hr-idle": bpm() == null }}
      style={vars()}
    >
      <Show when={design() === "circle"}>
        <svg class="hr-ring" viewBox="0 0 100 100">
          <circle class="hr-ring-bg" cx="50" cy="50" r="44" />
          <circle class="hr-ring-fg" cx="50" cy="50" r="44" stroke-dasharray={ring()} transform="rotate(-90 50 50)" />
        </svg>
      </Show>
      <Show when={design() === "ecg"}>
        <svg class="hr-wave" viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 34h34l6-4 6 4h10l5-22 7 40 6-24 4 6h28l6-4 6 4h10l5-22 7 40 6-24 4 6h28l6-4 6 4h10l5-22 7 40 6-24 4 6h14" />
        </svg>
      </Show>
      <div class="hr-main">
        <div class="hr-head">
          <Heart />
          <span class="hr-value ov-mono">{bpm() ?? "—"}</span>
          <Show when={o().label !== false && design() !== "circle"}>
            <span class="hr-unit" data-no-i18n>
              BPM
            </span>
          </Show>
        </div>
        <Show when={bpm() != null && (o().zone !== false || o().minmax)}>
          <span class="hr-sub">
            <Show when={o().zone !== false}>
              <b>
                %{Math.round(pct() * 100)} · {t(zone().name)}
              </b>
            </Show>
            <Show when={o().minmax && range()}>
              <b data-no-i18n>
                ↓{range()!.lo} ↑{range()!.hi}
              </b>
            </Show>
          </span>
        </Show>
        <Show when={note()}>
          <span class="hr-note">{note()}</span>
        </Show>
      </div>
      <Show when={o().spark !== false && design() === "card" && bpm() != null}>
        <div class="hr-chart">
          <Spark w={88} h={42} />
        </div>
      </Show>
    </div>
  );
}
