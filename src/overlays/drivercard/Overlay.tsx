import { Show, createMemo, createSignal, onCleanup } from "solid-js";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { Flag } from "@/sdk/Flag";
import { LicenseBadge } from "@/sdk/LicenseBadge";
import { formatName } from "@/sdk/HeaderStats";
import { irating } from "@/sdk/format";
import { sampleRow } from "@/sdk/samples";
import type { Row } from "@/sdk/types";
import { CARD_DEFAULT_FIELDS } from "./manifest";
import "./style.css";

// Sürücü Kartı (lower third): oyuncunun kimlik bandı. Veri "standings" konusundaki kendi satırından ve "status"
// konusundan (ad, araç, takım) gelir. Rakip listesi vermeyen simlerde de (AC / ACC) oyuncunun satırı vardır.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

const SAMPLE = sampleRow({ classPos: 4, pos: 6, number: "59", name: "Deniz Yılmaz", flair: "TR", irating: 2450, sr: 3.45, licLetter: "A", isMe: true, carName: "Porsche 911 GT3 R", className: "GT3" });

export default function DriverCard(props: OverlayProps) {
  const standings = useTopic("standings");
  const session = useTopic("session");
  const status = useTopic("status");
  const o = () => props.options;

  // Saniyede bir: "belirli aralıklarla" kipi (duvar saati: uygulama penceresi ile OBS sayfası aynı anda gösterir)
  const [tick, setTick] = createSignal(Date.now());
  const timer = window.setInterval(() => {
    if (!previewFrozen()) setTick(Date.now());
  }, 1000);
  onCleanup(() => clearInterval(timer));

  const real = createMemo(() => standings()?.rows.find((r) => r.isMe));
  const useSample = () => !real() && (props.editing || !onScreen());
  const me = createMemo<Row | undefined>(() => real() ?? (useSample() ? SAMPLE : undefined));

  const fields = createMemo(() => new Set<string>(Array.isArray(o().fields) ? (o().fields as string[]) : CARD_DEFAULT_FIELDS));
  const has = (f: string) => fields().has(f);

  const name = () => {
    const custom = String(o().nameText ?? "").trim();
    if (custom) return custom;
    const n = me()?.name || status()?.userName || "";
    return formatName(n, o().nameFormat as string);
  };
  const team = () => String(o().teamText ?? "").trim() || (useSample() ? "SRTR Racing" : status()?.teamName || "");
  const car = () => me()?.carName || status()?.carName || "";
  const cls = () => me()?.className || status()?.className || "";
  const line2 = () => String(o().line2 ?? "").trim();
  const accent = () => (o().classColor !== false ? me()?.classColor || "var(--ov-accent)" : (o().accent as string) || "var(--ov-accent)");

  const visible = createMemo(() => {
    if (!me()) return false;
    if (props.editing || !onScreen()) return true;
    const mode = o().mode;
    if (mode === "interval") {
      const every = clamp(num(o().everyMin, 5), 1, 60) * 60;
      const secs = clamp(num(o().showSecs, 12), 3, 120);
      return (tick() / 1000) % every < secs;
    }
    if (mode === "garage") {
      const st = session()?.state ?? 0;
      const s = status();
      return !!s?.inGarage || (st >= 1 && st <= 3) || (!!s && !s.onTrack);
    }
    return true;
  });
  const design = () => (["bar", "tag", "angled"].includes(o().design) ? (o().design as string) : "bar");
  const sub = () => [has("car") ? car() : "", has("team") ? team() : ""].filter(Boolean);

  return (
    <div
      class={`ov-theme dcard dcard-d-${design()}`}
      classList={{ "dcard-off": !visible() }}
      style={{
        "min-width": design() === "tag" ? undefined : `${clamp(num(o().width, 420), 200, 900)}px`,
        "font-size": `${clamp(num(o().fontSize, 16), 10, 36)}px`,
        "--dc-accent": accent(),
      }}
    >
      <Show when={me()}>
        {(r) => (
          <div class="dcard-in">
            <Show when={has("pos") && r().classPos > 0}>
              <span class="dcard-pos" data-no-i18n>
                <small>P</small>
                {r().classPos}
              </span>
            </Show>
            <Show when={has("number") && r().number}>
              <span class="dcard-num" data-no-i18n>
                {r().number}
              </span>
            </Show>
            <div class="dcard-main">
              <div class="dcard-l1">
                <Show when={has("flag") && r().flair}>
                  <span class="dcard-flag" data-no-i18n>
                    <Flag code={r().flair} />
                  </span>
                </Show>
                <span class="dcard-name" data-no-i18n>
                  {name()}
                </span>
                <Show when={has("class") && cls()}>
                  <span class="dcard-class" data-no-i18n>
                    {cls()}
                  </span>
                </Show>
              </div>
              <Show when={design() !== "tag" && (line2() || sub().length > 0)}>
                <div class="dcard-l2" data-no-i18n>
                  <Show when={line2()} fallback={sub().join("  ·  ")}>
                    {line2()}
                  </Show>
                </div>
              </Show>
            </div>
            <Show when={(has("irating") && r().irating > 0) || (has("license") && r().licLetter)}>
              <div class="dcard-side">
                <Show when={has("irating") && r().irating > 0}>
                  <span class="dcard-ir" data-no-i18n>
                    <small>iR</small>
                    {irating(r().irating)}
                  </span>
                </Show>
                <Show when={has("license") && r().licLetter}>
                  <LicenseBadge letter={r().licLetter} sr={r().sr} color={r().licColor} />
                </Show>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
