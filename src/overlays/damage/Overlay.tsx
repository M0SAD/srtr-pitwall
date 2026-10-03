// Hasar Göstergesi: aracın üstten şeması, bölgeler hasar şiddetine göre renklenir.
// Veri simden sime çok farklıdır (Rust: drivecues.rs `Damage`):
//   iRacing  → bölge yok; sadece kalan tamir süreleri + motor uyarıları (şema tek renk: genel durum)
//   ACC / AC → ön / arka / sol / sağ / orta (ACC'de ayrıca süspansiyon; tamir süresi tahmini)
//   LMU/rF2  → 8 göçük bölgesi, kopan parça, patlak / kopmuş teker, aşırı ısınma
//   AMS2     → kaporta bölgesi yok; aero, motor, teker başına süspansiyon ve fren
// Şema özgün, genel bir araç silüetidir (hiçbir markanın çizimi değildir).

import { For, Show, createMemo, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import type { Damage } from "@/sdk/drivecues";
import "./style.css";

const DESIGNS = ["car", "compact"] as const;
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** Düzenleme modunda sim verisi yokken yerleştirme için örnek */
const SAMPLE: Damage = {
  detail: 2,
  body: [0.55, 0.3, 0, 0, 0.2, 0.85, 0, 0.12],
  susp: [0.35, 0, 0, 0.1],
  brake: [0, 0, 0, 0],
  wheel: [0, 0, 0, 0],
  engine: 0.08,
  aero: 0.4,
  centre: 0,
  repair: 42,
  optRepair: 65,
  repairEst: false,
  overall: 0.85,
  any: true,
  warnings: ["water"],
  onPitRoad: false,
};

/** Kaporta bölgeleri: [x, y, w, h] (viewBox 0 0 120 200), sıra Rust'taki `body` ile aynı */
const ZONES: [number, number, number, number][] = [
  [20, 6, 24, 46], // ön-sol
  [44, 6, 32, 46], // ön
  [76, 6, 24, 46], // ön-sağ
  [76, 52, 24, 96], // sağ
  [76, 148, 24, 46], // arka-sağ
  [44, 148, 32, 46], // arka
  [20, 148, 24, 46], // arka-sol
  [20, 52, 24, 96], // sol
];
/** Tekerler: LF, RF, LR, RR */
const WHEELS: [number, number][] = [
  [8, 30],
  [100, 30],
  [8, 138],
  [100, 138],
];
const BODY = "M36 8 Q60 1 84 8 Q99 13 100 40 V164 Q99 188 86 192 H34 Q21 188 20 164 V40 Q21 13 36 8 Z";

function mmss(s: number): string {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

export default function DamageOverlay(props: OverlayProps) {
  const live = useTopic("damage");
  const o = () => props.options;
  const d = createMemo<Damage | undefined>(() => live() ?? (props.editing ? SAMPLE : undefined));
  const design = (): Design => {
    const v = o().design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("damage", "design", v) ? v : "car";
  };
  const min = () => clamp(num(o().minSev, 3), 0, 30) / 100;
  const sevColor = (v: number): string => {
    if (v < 0) return "var(--dmg-na)";
    if (v <= min()) return "var(--dmg-ok)";
    if (v < 0.34) return (o().colLight as string) || "#ffcc33";
    if (v < 0.67) return (o().colMedium as string) || "#ff8a2a";
    return (o().colHeavy as string) || "#ff4d4f";
  };
  const sevName = (v: number) => (v <= min() ? t("Hasar yok") : v < 0.34 ? t("Hafif hasar") : v < 0.67 ? t("Orta hasar") : t("Ağır hasar"));
  const hasZones = () => (d()?.detail ?? 0) >= 2;
  /** Teker: kopmuş / patlak her zaman ağır; yoksa süspansiyon ve frenin kötüsü */
  const wheelSev = (i: number) => {
    const x = d()!;
    if (x.wheel[i] > 0) return 1;
    const v = Math.max(x.susp[i] ?? -1, x.brake[i] ?? -1);
    return v;
  };
  const worst = (a: number[]) => a.reduce((m, v) => Math.max(m, v), -1);
  const parts = createMemo(() => {
    const x = d();
    if (!x) return [];
    const out: { name: string; v: number }[] = [];
    if (x.engine >= 0) out.push({ name: t("Motor"), v: x.engine });
    if (x.aero >= 0) out.push({ name: t("Aerodinamik"), v: x.aero });
    if (worst(x.susp) >= 0) out.push({ name: t("Süspansiyon"), v: worst(x.susp) });
    if (worst(x.brake) >= 0) out.push({ name: t("Frenler"), v: worst(x.brake) });
    return out.filter((p) => p.v > min());
  });
  const wheelIssue = () => {
    const x = d();
    if (!x) return "";
    if (x.wheel.some((w) => w === 2)) return t("Teker koptu");
    if (x.wheel.some((w) => w === 1)) return t("Lastik patlak");
    return "";
  };
  const warnName = (w: string): string => {
    switch (w) {
      case "water":
        return t("Su sıcaklığı");
      case "oil":
        return t("Yağ sıcaklığı");
      case "oilPressure":
        return t("Yağ basıncı");
      case "fuelPressure":
        return t("Yakıt basıncı");
      case "stalled":
        return t("Motor durdu");
      case "overheat":
        return t("Aşırı ısınma");
      case "detached":
        return t("Parça koptu");
      case "repairFlag":
        return t("Tamir bayrağı");
      default:
        return w;
    }
  };
  const warnings = () => (o().showWarnings !== false ? (d()?.warnings ?? []) : []);
  const hasRepair = () => o().showRepair !== false && !!d() && (d()!.repair > 0.5 || d()!.optRepair > 0.5);
  const note = () => {
    const x = d();
    if (!x) return "";
    if (x.detail === 0) return t("Bu sim hasar verisi vermiyor");
    if (x.detail === 1 && x.engine < 0 && x.aero < 0) return t("Sim bölge bazlı hasar vermiyor: genel durum tamir süresinden");
    if (x.detail === 1) return t("Sim kaporta bölgesi vermiyor: parça bazlı hasar");
    return "";
  };
  const any = () => {
    const x = d();
    return !!x && (x.overall > min() || x.warnings.length > 0);
  };
  const visible = () => {
    if (!d()) return false;
    if (props.editing) return true;
    return o().hideNone === false || any();
  };
  const style = (): JSX.CSSProperties => ({ "font-size": `${clamp(num(o().fontSize, 14), 10, 28)}px` });

  const Car = () => (
    <svg class="dmg-car" viewBox="0 0 120 200" aria-hidden="true">
      <defs>
        <clipPath id="dmg-body-clip">
          <path d={BODY} />
        </clipPath>
      </defs>
      <For each={WHEELS}>
        {(w, i) => <rect x={w[0]} y={w[1]} width="12" height="32" rx="4" fill={sevColor(wheelSev(i()))} class="dmg-wheel" classList={{ "dmg-gone": d()!.wheel[i()] === 2 }} />}
      </For>
      <g clip-path="url(#dmg-body-clip)">
        <rect x="20" y="0" width="80" height="200" fill="var(--dmg-shell)" />
        <Show
          when={hasZones()}
          fallback={<rect x="20" y="0" width="80" height="200" fill={sevColor(d()!.detail === 1 && d()!.engine < 0 && d()!.aero < 0 ? d()!.overall : Math.max(d()!.aero, 0))} opacity="0.85" />}
        >
          <For each={ZONES}>{(z, i) => <rect x={z[0]} y={z[1]} width={z[2]} height={z[3]} fill={sevColor(d()!.body[i()] ?? -1)} />}</For>
          <rect x="44" y="52" width="32" height="96" fill={sevColor(d()!.centre)} />
        </Show>
      </g>
      {/* Gövde çizgileri: ön cam, tavan, arka cam */}
      <path d={BODY} class="dmg-outline" />
      <path d="M36 62 Q60 52 84 62 L80 84 Q60 78 40 84 Z" class="dmg-glass" />
      <path d="M40 132 Q60 138 80 132 L84 150 Q60 158 36 150 Z" class="dmg-glass" />
      <path d="M40 84 V132 M80 84 V132" class="dmg-line" />
    </svg>
  );

  const Repair = () => (
    <Show when={hasRepair()}>
      <div class="dmg-repair">
        <Show when={d()!.repair > 0.5}>
          <span class="dmg-rep">
            <i>Zorunlu tamir</i>
            <b data-no-i18n>
              {d()!.repairEst ? "≈ " : ""}
              {mmss(d()!.repair)}
            </b>
          </span>
        </Show>
        <Show when={d()!.optRepair > 0.5}>
          <span class="dmg-rep dmg-rep-opt">
            <i>İsteğe bağlı</i>
            <b data-no-i18n>{mmss(d()!.optRepair)}</b>
          </span>
        </Show>
      </div>
    </Show>
  );

  const Warnings = () => (
    <Show when={warnings().length > 0 || wheelIssue()}>
      <div class="dmg-warns">
        <Show when={wheelIssue()}>
          <span class="dmg-warn">{wheelIssue()}</span>
        </Show>
        <For each={warnings()}>{(w) => <span class="dmg-warn">{warnName(w)}</span>}</For>
      </div>
    </Show>
  );

  return (
    <Show when={visible()}>
      <div class={`dmg dmg-d-${design()} ov-panel`} style={{ ...style(), "--dmg-sev": sevColor(d()!.overall) }}>
        <Car />
        <div class="dmg-info">
          <div class="dmg-overall">
            <span class="dmg-dot" />
            <b>{sevName(d()!.overall)}</b>
            <Show when={d()!.overall > min()}>
              <em data-no-i18n>{Math.round(d()!.overall * 100)}%</em>
            </Show>
          </div>
          <Repair />
          <Show when={design() === "car" && o().showParts !== false && parts().length > 0}>
            <div class="dmg-parts">
              <For each={parts()}>
                {(p) => (
                  <div class="dmg-part">
                    <span>{p.name}</span>
                    <div class="dmg-meter">
                      <div style={{ width: `${clamp(p.v, 0, 1) * 100}%`, background: sevColor(p.v) }} />
                    </div>
                    <b data-no-i18n>{Math.round(p.v * 100)}%</b>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Warnings />
          <Show when={design() === "car" && o().showNote !== false && note()}>
            <div class="dmg-note">{note()}</div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
