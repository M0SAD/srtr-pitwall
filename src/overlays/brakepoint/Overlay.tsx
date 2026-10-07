// Fren ve Vites İşareti: referans turdaki (en iyi geçerli tur) fren / gaz kesme noktalarına geri sayım.
// Referansı Rust tarafı kaydeder (drivecues.rs): pist + araç başına dosyada saklanır, oturumlar arasında kalır.
// Tasarımlar:  bar → Yatay geri sayım çubuğu   sign / neon / hazard / alert → Parlayan tabela çeşitleri
//   boards → Mesafe levhaları   ring → Geri sayım halkası
// Referans kaynağı (ayar): tüm zamanların en iyisi (dosyada), bu oturumun en iyisi ya da topluluk telemetrisindeki rekor.

import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, type JSX } from "solid-js";
import { previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { useTopic, demoShow } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { gear as fmtGear, speed, speedUnit } from "@/sdk/format";
import { t } from "@/sdk/i18n";
import type { Brakepoint } from "@/sdk/drivecues";
import "./style.css";

const DESIGNS = ["bar", "sign", "neon", "hazard", "alert", "boards", "ring"] as const;
const SIGNS: readonly string[] = ["sign", "neon", "hazard", "alert"];
const SOURCES = ["best", "session", "community"] as const;
type Source = (typeof SOURCES)[number];
type Design = (typeof DESIGNS)[number];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

/** Düzenleme modunda sim verisi yokken yerleştirme için örnek */
const SAMPLE: Brakepoint = {
  hasRef: true,
  refTime: 97.873,
  fromFile: true,
  persist: true,
  lapClean: true,
  next: { n: 3, dist: 86, eta: 1.3, kind: 0, gear: 3, speed: 68, minSpeed: 31, liftDist: 70 },
  last: { n: 2, diff: 7.5, kind: 0, id: 1 },
  braking: false,
  gear: 5,
  speed: 66,
  lapPct: 0.41,
  trackLen: 4300,
  onPitRoad: false,
  onTrack: true,
  zones: [0.09, 0.22, 0.43, 0.61, 0.78, 0.9].map((pct, i) => ({ pct, kind: i === 3 ? 1 : 0, gear: 3, speed: 60, minSpeed: 30, lift: -1 })),
};

function createModel(props: OverlayProps) {
  const live = useTopic("brakepoint");
  const o = () => props.options;
  const raw = createMemo<Brakepoint | undefined>(() => live() ?? (props.editing ? SAMPLE : undefined));
  const source = (): Source => (SOURCES.includes(o().source as Source) ? (o().source as Source) : "best");
  /** Seçili referans kaynağına göre paket: oturum / topluluk seçiliyse onların noktaları, farkı ve süresi kullanılır */
  const data = createMemo<Brakepoint | undefined>(() => {
    const d = raw();
    if (!d || source() === "best") return d;
    const r = source() === "session" ? d.session : d.community;
    // Eski sürüm motoru (alan yok) ya da örnek veri: en iyi tura göre gösterilir
    if (!r) return d;
    return { ...d, hasRef: r.hasRef, refTime: r.refTime, next: r.next, last: r.last, zones: r.zones };
  });
  const sample = () => !live() && props.editing;
  const imperial = () => props.units === "imperial";

  const range = () => clamp(num(o().range, 150), 50, 400);
  /** Gaz kesme noktaları kapalıysa onlar için geri sayım yapılmaz */
  const next = createMemo(() => {
    const n = data()?.next;
    if (!n) return null;
    if (n.kind === 1 && o().showLift === false) return null;
    return n;
  });
  /** ŞİMDİ eşiği (m): hız x erken uyarı payı */
  const nowDist = () => (data()?.speed ?? 0) * clamp(num(o().lead, 0.15), 0, 1);
  /** 0 uzak (geri sayım yok), 1 uzak üçte bir, 2 orta, 3 yakın, 4 ŞİMDİ */
  const stage = createMemo(() => {
    const n = next();
    if (!n || n.dist > range()) return 0;
    if (n.dist <= Math.max(nowDist(), 1)) return 4;
    const f = n.dist / range();
    return f > 2 / 3 ? 1 : f > 1 / 3 ? 2 : 3;
  });
  /** Kalan oran: 1 geri sayım başında, 0 noktada */
  const frac = () => {
    const n = next();
    return n ? clamp(n.dist / range(), 0, 1) : 1;
  };
  const color = () => {
    switch (stage()) {
      case 4:
        return (o().colNow as string) || "#ff4d4f";
      case 3:
      case 2:
        return (o().colNear as string) || "#ffcc33";
      default:
        return (o().colFar as string) || "#4aa8ff";
    }
  };
  /** 50 m'de bir işaret (oran olarak, 0..1) */
  const ticks = createMemo(() => {
    const out: { f: number; m: number }[] = [];
    for (let m = 50; m < range(); m += 50) out.push({ f: m / range(), m });
    return out;
  });
  const fmtDist = (m: number) => {
    const v = imperial() ? m * 3.28084 : m;
    const step = v >= 100 ? 10 : 5;
    return `${Math.max(0, Math.round(v / step) * step)}`;
  };
  const distUnit = () => (imperial() ? "ft" : "m");
  const label = () => (next()?.kind === 1 ? t("GAZ KES") : t("FREN"));

  // --- son virajdaki fark: yeni ölçümden sonra bir süre gösterilir ---
  const [shownAt, setShownAt] = createSignal(0);
  let firstSeen = true;
  createEffect(
    on(
      () => (data() ? (data()!.last?.id ?? 0) : undefined),
      (id) => {
        if (id === undefined) return;
        // Overlay açıldığında eskiden kalan ölçüm gösterilmez; sadece yenileri
        if (!firstSeen && id > 0) setShownAt(performance.now());
        firstSeen = false;
      },
    ),
  );
  const diff = createMemo(() => {
    const d = data();
    if (!d?.last || o().showDiff === false) return null;
    if (!sample() && (shownAt() === 0 || performance.now() - shownAt() > clamp(num(o().diffHold, 6), 2, 30) * 1000)) return null;
    const m = d.last.diff;
    const v = imperial() ? m * 3.28084 : m;
    const abs = Math.round(Math.abs(v));
    return {
      n: d.last.n,
      /** -1 erken, 1 geç, 0 aynı */
      dir: abs < (imperial() ? 7 : 2) ? 0 : m > 0 ? 1 : -1,
      text: `${abs} ${distUnit()}`,
    };
  });
  const diffText = () => {
    const d = diff();
    if (!d) return "";
    return d.dir === 0 ? t("aynı nokta") : d.dir > 0 ? t("{0} geç", d.text) : t("{0} erken", d.text);
  };

  return { o, data, sample, source, units: () => props.units, next, stage, frac, color, ticks, fmtDist, distUnit, label, diff, diffText, range };
}

type Model = ReturnType<typeof createModel>;

export default function BrakepointOverlay(props: OverlayProps) {
  const m = createModel(props);
  const o = () => props.options;
  const design = (): Design => {
    const d = o().design as Design;
    return DESIGNS.includes(d) && !overlayValueLocked("brakepoint", "design", d) ? d : "bar";
  };
  const visible = () => {
    const d = m.data();
    if (!d) return false;
    if (props.editing || demoShow()) return true;
    if (!d.onTrack) return false;
    if (o().hidePits !== false && d.onPitRoad) return false;
    if (o().hideIdle && d.hasRef && m.stage() === 0 && !m.diff()) return false;
    return true;
  };
  const style = (): JSX.CSSProperties => ({
    "font-size": `${clamp(num(o().fontSize, 14), 10, 30)}px`,
    "--bp-col": m.color(),
    ...(design() !== "ring" ? { width: `${clamp(num(o().width, 320), 200, 700)}px` } : {}),
  });

  return (
    <Show when={visible()}>
      <div
        class={`bp bp-d-${design()} bp-s${m.stage()} ov-panel`}
        classList={{ "bp-frozen": previewFrozen(), "bp-wait": !m.data()!.hasRef }}
        style={style()}
      >
        <Show
          when={m.data()!.hasRef}
          fallback={
            <div class="bp-waiting">
              <Show
                when={m.source() !== "community"}
                fallback={
                  <>
                    <b>Topluluk rekoru bekleniyor</b>
                    <span>Bu pist ve araç için toplulukta izi olan bir tur bulunursa fren noktaları buradan gösterilir.</span>
                  </>
                }
              >
                <b>Referans turu bekleniyor</b>
                <span>{m.data()!.lapClean ? t("Bu tur temiz gidiyor: bitince referans olacak") : t("Pist dışına çıkmadan tam bir tur at")}</span>
              </Show>
            </div>
          }
        >
          <Switch>
            <Match when={design() === "bar"}>
              <BarDesign m={m} />
            </Match>
            <Match when={SIGNS.includes(design())}>
              <SignDesign m={m} variant={design()} />
            </Match>
            <Match when={design() === "boards"}>
              <BoardsDesign m={m} />
            </Match>
            <Match when={design() === "ring"}>
              <RingDesign m={m} />
            </Match>
          </Switch>
        </Show>
      </div>
    </Show>
  );
}

// ---- ortak parçalar ----

function Gear(p: { m: Model; big?: boolean }) {
  const n = () => p.m.next();
  return (
    <Show when={p.m.o().showGear !== false && n() && n()!.gear > 0}>
      <span class="bp-gear" classList={{ "bp-gear-big": p.big }} title={t("Referans turda bu virajın vitesi")} data-no-i18n>
        <i>{t("VİTES")}</i>
        <b>{fmtGear(n()!.gear)}</b>
      </span>
    </Show>
  );
}

function MinSpeed(p: { m: Model }) {
  const n = () => p.m.next();
  return (
    <Show when={p.m.o().showSpeed && n() && n()!.minSpeed > 0}>
      <span class="bp-min" title={t("Referans turda virajdaki en düşük hız")} data-no-i18n>
        <b>{speed(n()!.minSpeed, p.m.units())}</b> {speedUnit(p.m.units())}
      </span>
    </Show>
  );
}

function Dist(p: { m: Model }) {
  const m = p.m;
  return (
    <Switch>
      <Match when={m.stage() === 4}>
        <span class="bp-now">ŞİMDİ</span>
      </Match>
      <Match when={m.next()}>
        <span class="bp-dist" data-no-i18n>
          <b>{m.fmtDist(m.next()!.dist)}</b> {m.distUnit()}
        </span>
      </Match>
    </Switch>
  );
}

function Diff(p: { m: Model }) {
  const d = () => p.m.diff();
  return (
    <Show when={d()}>
      <span class="bp-diff" classList={{ "bp-late": d()!.dir > 0, "bp-early": d()!.dir < 0 }} data-no-i18n>
        <i>V{d()!.n}</i>
        {p.m.diffText()}
      </span>
    </Show>
  );
}

// ---- tasarımlar ----

function BarDesign(p: { m: Model }) {
  const m = p.m;
  return (
    <>
      <div class="bp-row">
        <span class="bp-label">{m.label()}</span>
        <Dist m={m} />
        <span class="bp-spacer" />
        <MinSpeed m={m} />
        <Gear m={m} />
      </div>
      <div class="bp-track">
        {/* Dolgu sağdan sola erir: nokta sol uçta */}
        <div class="bp-fill" style={{ width: `${(m.stage() === 0 ? 0 : 1 - m.frac()) * 100}%` }} />
        <For each={m.ticks()}>
          {(k) => (
            <span class="bp-tick" style={{ left: `${k.f * 100}%` }} data-no-i18n>
              <em>{m.fmtDist(k.m)}</em>
            </span>
          )}
        </For>
        <span class="bp-end" />
      </div>
      <div class="bp-row bp-foot">
        <Diff m={m} />
        <span class="bp-spacer" />
        <Show when={m.o().showMini !== false && m.data()!.zones.length > 0}>
          <span class="bp-mini" title={t("Tur boyunca fren noktaları")}>
            <For each={m.data()!.zones}>
              {(z) => <i classList={{ "bp-mini-lift": z.kind === 1 }} style={{ left: `${z.pct * 100}%` }} />}
            </For>
            <b style={{ left: `${clamp(m.data()!.lapPct, 0, 1) * 100}%` }} />
          </span>
        </Show>
      </div>
    </>
  );
}

/** Parlayan tabela: uzakta sönük, yaklaştıkça dolar; fren noktasında kırmızı parlayıp yanıp söner */
function SignDesign(p: { m: Model; variant: string }) {
  const m = p.m;
  return (
    <>
      <div class={`bp-sign bp-sign-${p.variant}`} style={{ "--bp-k": String(m.stage() === 0 ? 0 : 1 - m.frac()) }}>
        <span class="bp-sign-fill" />
        <Show when={p.variant === "alert"}>
          <svg class="bp-sign-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 22.5 21h-21z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
            <path d="M12 9.5v5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <circle cx="12" cy="18" r="1.3" fill="currentColor" />
          </svg>
        </Show>
        <b>{m.label()}</b>
      </div>
      <div class="bp-row bp-sign-foot">
        <Show when={m.stage() !== 4} fallback={<span class="bp-now">ŞİMDİ</span>}>
          <Dist m={m} />
        </Show>
        <span class="bp-spacer" />
        <MinSpeed m={m} />
        <Gear m={m} />
      </div>
      <Show when={m.diff()}>
        <div class="bp-row bp-foot">
          <Diff m={m} />
        </div>
      </Show>
    </>
  );
}

/** Pist kenarındaki mesafe levhaları gibi: geri sayım üçe bölünür, geçilen levha yanar; sonuncusu FREN */
function BoardsDesign(p: { m: Model }) {
  const m = p.m;
  const marks = () => [1, 2 / 3, 1 / 3].map((f) => m.fmtDist(m.range() * f));
  return (
    <>
      <div class="bp-boards">
        <For each={marks()}>
          {(d, i) => (
            <span class="bp-board" classList={{ "bp-on": m.stage() >= i() + 1 }} data-no-i18n>
              {d}
            </span>
          )}
        </For>
        <span class="bp-board bp-board-now" classList={{ "bp-on": m.stage() === 4 }}>
          {m.label()}
        </span>
      </div>
      <div class="bp-row bp-foot">
        <Diff m={m} />
        <span class="bp-spacer" />
        <MinSpeed m={m} />
        <Gear m={m} />
      </div>
    </>
  );
}

/** Geri sayım halkası: halka fren noktasına yaklaştıkça dolar, ortada virajın vitesi */
function RingDesign(p: { m: Model }) {
  const m = p.m;
  const C = 2 * Math.PI * 42;
  const n = () => m.next();
  return (
    <>
      <div class="bp-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="bp-ring-bg" cx="50" cy="50" r="42" />
          <circle class="bp-ring-fg" cx="50" cy="50" r="42" stroke-dasharray={`${C}`} stroke-dashoffset={`${C * (m.stage() === 0 ? 1 : m.stage() === 4 ? 0 : m.frac())}`} transform="rotate(-90 50 50)" />
        </svg>
        <div class="bp-ring-mid" data-no-i18n>
          <Show when={m.o().showGear !== false && n() && n()!.gear > 0} fallback={<b class="bp-ring-dot" />}>
            <b>{fmtGear(n()!.gear)}</b>
          </Show>
        </div>
      </div>
      <span class="bp-label">{m.label()}</span>
      <Dist m={m} />
      <MinSpeed m={m} />
      <Diff m={m} />
    </>
  );
}
