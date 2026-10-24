import { Show } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { speed, speedUnit } from "@/sdk/format";
import { t } from "@/sdk/i18n";
import { closeness, gapLabel, useNearGaps, type NearGap } from "@/sdk/nearGaps";
import "./style.css";

// Mesafe Çubuğu: solda öndeki, sağda arkadaki araçla fark (aynanın altına konacak sade şerit).
// Çubuk varsayılan olarak aradaki boşluğu gösterir: fark ölçek kadar ya da fazlaysa tam dolu, araç yaklaştıkça kısalır;
// renk yakınlığa göre yeşil → sarı → kırmızı.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);

/** İki renk arası (0..1) */
function mix(a: string, b: string, k: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`;
}

export default function GapBar(props: OverlayProps) {
  const o = () => props.options;
  const tele = useTopic("telemetry");
  const unit = () => (o().unit === "m" ? "m" : "s") as "s" | "m";
  const range = () => (unit() === "m" ? clamp(num(o().rangeM, 150), 20, 1000) : clamp(num(o().rangeS, 3), 0.5, 20));
  const gaps = useNearGaps(() => ({ sameClass: !!o().sameClass, skipPit: o().skipPit !== false }));

  const color = (k: number) => {
    const far = hex(o().cFar, "#1fc95a");
    const mid = hex(o().cMid, "#f5b301");
    const near = hex(o().cNear, "#ef4444");
    return k < 0.5 ? mix(far, mid, k / 0.5) : mix(mid, near, (k - 0.5) / 0.5);
  };

  const center = () => {
    const me = gaps().me;
    switch (o().center ?? "pos") {
      case "pos":
        return me && me.pos > 0 ? String(me.pos) : "–";
      case "classPos":
        return me && me.classPos > 0 ? String(me.classPos) : "–";
      case "speed": {
        const v = tele()?.speed;
        return v != null ? speed(v, props.units) : "–";
      }
      default:
        return "";
    }
  };

  const design = () => {
    const d = String(o().design ?? "bar");
    return ["bar", "thin", "values", "chips"].includes(d) ? d : "bar";
  };
  const barless = () => design() === "values" || design() === "chips";
  /** Kutucuk yazısı: açık renkte koyu, koyu renkte beyaz */
  const ink = (c: string) => {
    const m = c.match(/\d+/g);
    if (!m) return "#fff";
    const [r, g, b] = m.map((x) => Number(x) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#0b0d11" : "#fff";
  };

  /** Çubuksuz görünümler: sadece değer (isteğe bağlı ok ve "önde / arkada" yazısıyla) */
  const Val = (p: { g: () => NearGap | null; side: "ahead" | "behind" }) => {
    const k = () => closeness(p.g(), unit(), range());
    const c = () => color(k());
    const hidden = () => !p.g() && !!o().hideEmpty;
    const chip = () => design() === "chips";
    return (
      <div class={`gb-v gb-${p.side}`} classList={{ "gb-hide": hidden(), "gb-none": !p.g(), "gb-chip": chip() }}>
        <Show when={o().labels}>
          <span class="gb-lbl">{p.side === "ahead" ? t("ÖNDE") : t("ARKADA")}</span>
        </Show>
        <span
          class="gb-vbox"
          style={
            chip()
              ? { background: p.g() ? c() : "rgba(255,255,255,0.12)", color: p.g() ? ink(c()) : "#fff" }
              : { color: p.g() && o().colorText !== false ? c() : undefined }
          }
        >
          <Show when={o().arrows !== false && p.side === "ahead"}>
            <i class="gb-arr">▲</i>
          </Show>
          <b class="ov-mono" data-no-i18n>
            {gapLabel(p.g(), unit())}
          </b>
          <Show when={o().arrows !== false && p.side === "behind"}>
            <i class="gb-arr">▼</i>
          </Show>
        </span>
      </div>
    );
  };

  const Side = (p: { g: () => NearGap | null; side: "ahead" | "behind" }) => {
    const k = () => closeness(p.g(), unit(), range());
    /** Çubuk uzunluğu (0..1) */
    const len = () => (!p.g() ? 0 : o().fill === "close" ? Math.max(0.04, k()) : Math.max(0.04, 1 - k()));
    const hidden = () => !p.g() && !!o().hideEmpty;
    return (
      <div class={`gb-side gb-${p.side}`} classList={{ "gb-hide": hidden(), "gb-none": !p.g() }}>
        <Show when={o().labels}>
          <span class="gb-lbl">{p.side === "ahead" ? t("ÖNDE") : t("ARKADA")}</span>
        </Show>
        <div class="gb-track">
          <div class="gb-fill" style={{ "--gb-len": len(), background: color(k()) }} />
        </div>
        <Show when={o().values !== false}>
          <span class="gb-val ov-mono" data-no-i18n>
            {gapLabel(p.g(), unit())}
          </span>
        </Show>
      </div>
    );
  };

  return (
    <div
      class={`gb gb-d-${design()}`}
      classList={{ "gb-panel": !!o().panel }}
      style={{
        width: barless() ? undefined : `${clamp(num(o().width, 520), 200, 1400)}px`,
        "--gb-h": `${clamp(num(o().barH, 10), 3, 30)}px`,
        "--gb-gap": `${clamp(num(o().gapPx, 14), 0, 400)}px`,
        "font-size": `${(14 * clamp(num(o().textSize, 100), 60, 250)) / 100}px`,
      }}
    >
      <Show when={barless()} fallback={<Side g={() => gaps().ahead} side="ahead" />}>
        <Val g={() => gaps().ahead} side="ahead" />
      </Show>
      <Show when={(o().center ?? "pos") !== "none"}>
        <div class="gb-mid ov-mono" data-no-i18n>
          {center()}
          <Show when={o().center === "speed"}>
            <small>{speedUnit(props.units)}</small>
          </Show>
        </div>
      </Show>
      <Show when={barless()} fallback={<Side g={() => gaps().behind} side="behind" />}>
        <Val g={() => gaps().behind} side="behind" />
      </Show>
    </div>
  );
}
