// Pist Limiti: süren tur geçerli mi, pist dışı / geçersiz tur sayaçları, olay puanı (iRacing).
// Veriyi Rust tarafı toplar (drivecues.rs, `tracklimits` konusu).
// İki özgün tasarım:  badge → Rozet   strip → Şerit (PRO)

import { Show, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from "solid-js";
import { previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { t } from "@/sdk/i18n";
import type { TrackLimits } from "@/sdk/drivecues";
import "./style.css";

const DESIGNS = ["badge", "strip"] as const;
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** Düzenleme modunda sim verisi yokken yerleştirme için örnek */
const SAMPLE: TrackLimits = {
  valid: true,
  off: false,
  tyresOut: 0,
  offs: 3,
  lapOffs: 0,
  invalidLaps: 2,
  laps: 11,
  incidents: 6,
  incidentLimit: 17,
  hasIncidents: true,
  hasOff: true,
  simValid: false,
  penalty: "",
  eventId: 0,
  eventKind: "",
  eventAgo: 999,
  eventDelta: 0,
  onPitRoad: false,
  onTrack: true,
  lap: 12,
};

function penaltyName(p: string): string {
  switch (p) {
    case "driveThrough":
      return t("Pit geçişi cezası");
    case "stopGo":
      return t("Dur-kalk cezası");
    case "disqualify":
      return t("Diskalifiye");
    case "timePenalty":
      return t("Süre cezası");
    case "penalty":
      return t("Ceza");
    default:
      return "";
  }
}

const Check = () => (
  <svg class="tl-ico" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Cross = () => (
  <svg class="tl-ico" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
  </svg>
);

export default function TrackLimitsOverlay(props: OverlayProps) {
  const live = useTopic("tracklimits");
  const o = () => props.options;
  const d = createMemo<TrackLimits | undefined>(() => live() ?? (props.editing ? SAMPLE : undefined));
  const design = (): Design => {
    const v = o().design as Design;
    return DESIGNS.includes(v) && !overlayValueLocked("tracklimits", "design", v) ? v : "badge";
  };

  // --- olay uyarısı: yeni olay numarası gelince bir süre yanıp söner ---
  const [flash, setFlash] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastId: number | undefined;
  createEffect(
    on(
      () => d()?.eventId,
      (id) => {
        if (id === undefined) return;
        const fresh = (d()?.eventAgo ?? 999) < 1.5;
        if (lastId !== undefined && id > lastId && fresh && o().flash !== false && !previewFrozen()) {
          setFlash(true);
          clearTimeout(timer);
          timer = setTimeout(() => setFlash(false), clamp(num(o().flashSecs, 3), 1, 10) * 1000);
        }
        lastId = id;
      },
    ),
  );
  onCleanup(() => clearTimeout(timer));

  /** "pit" | "off" | "invalid" | "valid" */
  const state = () => {
    const x = d();
    if (!x) return "valid";
    if (x.onPitRoad) return "pit";
    if (x.off) return "off";
    return x.valid ? "valid" : "invalid";
  };
  const title = () => {
    switch (state()) {
      case "pit":
        return t("PİT");
      case "off":
        return t("PİST DIŞI");
      case "invalid":
        return t("TUR GEÇERSİZ");
      default:
        return t("TUR GEÇERLİ");
    }
  };
  /** Uyarı sırasında başlığın yerine geçen kısa neden */
  const reason = () => {
    const x = d();
    if (!x || !flash()) return "";
    if (x.eventKind === "off") return t("PİST DIŞI");
    if (x.eventKind === "incident") return t("OLAY +{0}x", x.eventDelta);
    return t("TUR İPTAL");
  };
  const color = () => {
    const s = state();
    if (s === "pit") return "var(--ov-dim)";
    if (s === "valid") return (o().colValid as string) || "#33d17a";
    return (o().colInvalid as string) || "#ff4d4f";
  };
  const incRatio = () => {
    const x = d();
    return x && x.incidentLimit > 0 ? x.incidents / x.incidentLimit : 0;
  };
  const incWarn = () => {
    const at = clamp(num(o().warnAt, 75), 0, 100) / 100;
    return at > 0 && incRatio() >= at;
  };
  const showInc = () => o().showIncidents !== false && !!d()?.hasIncidents;
  const showOffs = () => o().showOffs !== false && !!d()?.hasOff;
  const showTyres = () => !!o().showTyres && (d()?.tyresOut ?? -1) >= 0;
  const penalty = () => (o().showPenalty !== false && d()?.penalty ? penaltyName(d()!.penalty) : "");

  const visible = () => {
    const x = d();
    if (!x) return false;
    if (props.editing) return true;
    if (!x.onTrack) return false;
    if (o().hidePits && x.onPitRoad) return false;
    if (o().hideValid && state() !== "invalid" && state() !== "off" && !flash() && !penalty()) return false;
    return true;
  };
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 14), 10, 30)}px`,
    "--tl-col": color(),
    "--tl-warn": (o().colWarn as string) || "#ffcc33",
  });

  const Stats = () => (
    <>
      <Show when={showOffs()}>
        <span class="tl-stat" classList={{ "tl-hot": (d()?.lapOffs ?? 0) > 0 }}>
          <i>Pist dışı</i>
          <b data-no-i18n>{d()!.offs}</b>
        </span>
      </Show>
      <Show when={showTyres()}>
        <span class="tl-stat" classList={{ "tl-hot": d()!.tyresOut >= 3 }}>
          <i>Dışarıdaki teker</i>
          <b data-no-i18n>{d()!.tyresOut}/4</b>
        </span>
      </Show>
      <Show when={o().showInvalid !== false}>
        <span class="tl-stat">
          <i>Geçersiz tur</i>
          <b data-no-i18n>{d()!.invalidLaps}</b>
        </span>
      </Show>
      <Show when={showInc()}>
        <span class="tl-stat" classList={{ "tl-warned": incWarn() }}>
          <i>Olay</i>
          <b data-no-i18n>
            {d()!.incidents}x<Show when={d()!.incidentLimit > 0}>/{d()!.incidentLimit}</Show>
          </b>
        </span>
      </Show>
    </>
  );

  return (
    <Show when={visible()}>
      <div class={`tl tl-d-${design()} tl-${state()} ov-panel`} classList={{ "tl-flash": flash(), "tl-frozen": previewFrozen() }} style={style()}>
        <div class="tl-head">
          <span class="tl-mark">
            <Show when={state() === "valid" || state() === "pit"} fallback={<Cross />}>
              <Check />
            </Show>
          </span>
          <span class="tl-title">{reason() || title()}</span>
          {/* Sim tur geçerliliğini bildirmiyorsa durum pist dışı / olaydan çıkarılır */}
          <Show when={!d()!.simValid && state() !== "pit" && design() === "badge"}>
            <span class="tl-est" title={t("Bu sim tur geçerliliğini bildirmiyor: pist dışı ve olaylardan tahmin edilir")}>
              tahmini
            </span>
          </Show>
          <Show when={design() === "strip"}>
            <span class="tl-sep" />
            <Stats />
          </Show>
        </div>
        <Show when={design() === "strip" && showInc() && d()!.incidentLimit > 0}>
          <div class="tl-incbar tl-incbar-thin" classList={{ "tl-warned": incWarn() }}>
            <div style={{ width: `${clamp(incRatio(), 0, 1) * 100}%` }} />
          </div>
        </Show>
        <Show when={design() === "badge"}>
          <div class="tl-stats">
            <Stats />
          </div>
          <Show when={showInc() && d()!.incidentLimit > 0}>
            <div class="tl-incbar" classList={{ "tl-warned": incWarn() }}>
              <div style={{ width: `${clamp(incRatio(), 0, 1) * 100}%` }} />
            </div>
          </Show>
        </Show>
        <Show when={penalty()}>
          <div class="tl-penalty">{penalty()}</div>
        </Show>
      </div>
    </Show>
  );
}
