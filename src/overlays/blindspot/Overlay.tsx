import { Show } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import "./style.css";

/** Araç boyu (m): radar mesafesi merkezden merkezedir, tampon arası boşluk = mesafe − araç boyu */
const CAR_LEN = 4.8;
const DESIGNS = ["mirror", "icon", "dot", "bar"];
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

export default function BlindSpot(props: OverlayProps) {
  const radar = useTopic("radar");
  const status = useTopic("status");
  const inputs = useTopic("inputs");
  const o = () => props.options;
  const design = () => (DESIGNS.includes(String(o().design)) ? String(o().design) : "mirror");
  const sample = () => props.editing || !onScreen();
  const muted = () => {
    if (sample() || demoShow()) return false;
    const st = status();
    if (!st || st.preview) return false;
    if (o().onlyOnTrack !== false && !st.onTrack) return true;
    const min = num(o().minSpeed, 30);
    const sp = inputs()?.speed;
    return min > 0 && sp != null && sp * 3.6 < min;
  };
  const far = () => Math.max(1, num(o().far, 20));
  const near = () => Math.max(0, Math.min(num(o().near, 0), far() - 1));
  /** Arkadaki aracın tampon boşluğu ayarlanan aralıkta mı */
  const inZone = (gap: number) => gap <= far() && gap >= near();
  /** 0 yok, 1 yaklaşıyor (aralıkta), 2 yan yana */
  const level = (s: -1 | 1): number => {
    const r = radar();
    if (muted() || !r) return 0;
    const st = r.state;
    const flagged = s < 0 ? st === 2 || st === 4 || st === 5 : st === 3 || st === 4 || st === 6;
    const cars = r.cars ?? [];
    if (o().alongside !== false && (flagged || cars.some((c) => c.side === s && Math.abs(c.offset) < CAR_LEN * 1.1))) return 2;
    // Tarafı bilinen, arkadan yaklaşan araç
    if (cars.some((c) => c.side === s && c.offset < 0 && inZone(Math.max(0, -c.offset - CAR_LEN)))) return 1;
    // Taraf bilinmiyor (iRacing: araç tam arkada sayılır): istenirse iki ışık birden
    if (o().unknownSide !== "none") {
      // Boyu bizimkiyle çakışan araç zaten yan yanadır (tarafı bellidir): burada yalnızca tam arkadaki sayılır
      const behind = (d: number) => d > CAR_LEN * 1.1 && inZone(d - CAR_LEN);
      if (cars.some((c) => c.side === 0 && c.offset < 0 && behind(-c.offset))) return 1;
      if (r.behindM != null && behind(r.behindM)) return 1;
    }
    return 0;
  };
  // Düzenleme / panel önizlemesi: solda yan yana, sağda yaklaşan örnek
  const lv = (s: -1 | 1) => (sample() && level(-1) + level(1) === 0 ? (s < 0 ? 2 : 1) : level(s));
  /** Direksiyon o tarafa kırık mı (radyan, + sola) */
  const steering = (s: -1 | 1) => {
    const a = inputs()?.steer ?? 0;
    return s < 0 ? a > 0.12 : a < -0.12;
  };
  const Lamp = (p: { s: -1 | 1 }) => (
    <div
      class="bs-lamp"
      classList={{
        on: lv(p.s) > 0,
        soft: lv(p.s) === 1 && o().soft !== false,
        blink: !!o().blinkSteer && lv(p.s) > 0 && steering(p.s),
        idle: !!o().idle && lv(p.s) === 0,
        right: p.s > 0,
      }}
    >
      <Show when={design() === "mirror" || design() === "icon"}>
        <svg viewBox="0 0 100 70" aria-hidden="true">
          <Show when={design() === "mirror"}>
            <path class="bs-glass" d="M14 6 H82 Q95 6 93 20 L88 54 Q86 64 74 64 H26 Q10 64 8 50 L5 18 Q4 6 14 6 Z" />
          </Show>
          {/* İki araç: önde kendi aracın, çaprazında kör noktadaki araç */}
          <g class="bs-glyph">
            <rect x="26" y="16" width="20" height="34" rx="6" />
            <rect x="29" y="22" width="14" height="8" rx="2" class="cut" />
            <rect x="54" y="26" width="20" height="34" rx="6" />
            <rect x="57" y="32" width="14" height="8" rx="2" class="cut" />
            <path d="M50 12 q6 6 0 12 M56 8 q10 10 0 20" class="wave" />
          </g>
        </svg>
      </Show>
    </div>
  );

  return (
    <div
      class={`bs bs-${design()}`}
      style={{
        "--bs-size": `${Math.max(24, Math.min(300, num(o().size, 70)))}px`,
        "--bs-gap": `${Math.max(40, Math.min(3800, num(o().gap, 900)))}px`,
        "--bs-c": hex(o().color, "#ffb300"),
      }}
    >
      <Lamp s={-1} />
      <Lamp s={1} />
    </div>
  );
}
