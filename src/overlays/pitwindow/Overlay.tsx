// Pit Penceresi: "şimdi pite girersem nereden çıkarım?"
// Veri: `strategy` konusu (pistteki araçların bana göre konumu, ölçülmüş pit kaybı) + `fuel` (pit penceresi).
// Hesap: pit kaybı L sn ise pit çıkışında şu anki yerimin L sn gerisinde olurum; pistte bana L sn'den yakın
// arkamdaki araçlar önüme geçer. Rakiplerin temposunun değişmediği varsayılır (tahmindir).

import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { overlayValueLocked } from "@/sdk/proFeatures";
import { formatName } from "@/sdk/HeaderStats";
import { t } from "@/sdk/i18n";
import type { StratCar } from "@/sdk/types";
import { FUEL_SAMPLE, STRATEGY_SAMPLE } from "@/sdk/strategySample";
import "./style.css";

const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

interface Near {
  car: StratCar;
  /** Pit çıkışındaki yerime göre: + arkamda, − önümde (sn) */
  rel: number;
  /** Bana göre tur farkı: + beni turlamış, − turladığım */
  lapRel: number;
}

/** "Spa=32, Monza=24.5" → pist adına uyan süre */
function trackOverride(spec: unknown, track: string): number | null {
  if (typeof spec !== "string" || !spec.trim() || !track) return null;
  const tr = track.toLocaleLowerCase("tr");
  for (const part of spec.split(/[,;\n]/)) {
    const m = part.match(/^\s*(.+?)\s*[=:]\s*([\d.,]+)\s*$/);
    if (!m) continue;
    const v = parseFloat(m[2].replace(",", "."));
    if (isFinite(v) && v > 0 && tr.includes(m[1].toLocaleLowerCase("tr"))) return clamp(v, 5, 180);
  }
  return null;
}

export default function PitWindow(props: OverlayProps) {
  const live = useTopic("strategy");
  const liveFuel = useTopic("fuel");
  const o = () => props.options;
  const sample = () => !live() && props.editing;
  const data = createMemo(() => live() ?? (props.editing ? STRATEGY_SAMPLE : undefined));
  const fuel = createMemo(() => (sample() ? FUEL_SAMPLE : liveFuel()));

  const design = () => (o().design === "card" && !overlayValueLocked("pitwindow", "design", "card") ? "card" : "strip");

  const loss = createMemo<{ v: number; src: "track" | "measured" | "default" }>(() => {
    const d = data();
    const ov = trackOverride(o().trackLoss, d?.track ?? "");
    if (ov != null) return { v: ov, src: "track" };
    if (o().lossMode !== "manual" && d && d.pitLoss > 0) return { v: d.pitLoss, src: "measured" };
    return { v: clamp(num(o().pitLoss, 28), 5, 180), src: "default" };
  });

  const calc = createMemo(() => {
    const d = data();
    if (!d) return null;
    const L = loss().v;
    const lapT = Math.max(20, d.lapTime || 100);
    const near: Near[] = [];
    let gained = 0;
    let gainedClass = 0;
    for (const c of d.cars) {
      if (c.onPit) continue;
      // Yarış sırası: şu an L sn'den yakın arkamda olan araç pit sonrası önümde
      if (d.race && c.raceGap > 0 && c.raceGap < L) {
        gained++;
        if (c.sameClass) gainedClass++;
      }
      if (o().classOnly && !c.sameClass) continue;
      let rel = c.behind - L;
      while (rel > lapT / 2) rel -= lapT;
      while (rel <= -lapT / 2) rel += lapT;
      const lapRel = d.race ? -Math.round((c.raceGap - L - rel) / lapT) : 0;
      near.push({ car: c, rel, lapRel });
    }
    near.sort((a, b) => a.rel - b.rel);
    const ahead = [...near].reverse().find((x) => x.rel < 0) ?? null;
    const behind = near.find((x) => x.rel >= 0) ?? null;
    const gap = clamp(num(o().trafficGap, 2.5), 0.5, 10);
    const traffic = (!!ahead && -ahead.rel < gap) || (!!behind && behind.rel < gap / 2);
    const multi = d.multiclass;
    const posNow = multi ? d.classPosition : d.position;
    const posAfter = posNow > 0 ? posNow + (multi ? gainedClass : gained) : 0;
    return { L, near, ahead, behind, traffic, posNow, posAfter, multi, pack: near.filter((x) => Math.abs(x.rel) <= 5).length };
  });

  /** Yakıt pit penceresi */
  const win = createMemo(() => {
    const f = fuel();
    const d = data();
    if (!f || !(f.avg5?.usage > 0)) return { state: "wait" as const, text: t("Yakıt verisi bekleniyor"), laps: -1, open: 0, close: 0 };
    const laps = f.avg5.laps;
    const base = { laps, open: f.pitOpen, close: f.pitClose };
    if (!d?.race || !(f.raceLapsLeft > 0)) return { ...base, state: "info" as const, text: "" };
    if (f.pitOpen <= 0 && laps >= f.raceLapsLeft) return { ...base, state: "none" as const, text: t("Pit gerekmez") };
    if (f.pitOpen <= 0) return { ...base, state: "info" as const, text: "" };
    if (f.pitOpen > f.pitClose) return { ...base, state: "multi" as const, text: t("Tek pit yetmez · en geç {0}. tur", f.pitClose) };
    if (f.lap < f.pitOpen) return { ...base, state: "early" as const, text: t("{0}. turda açılır", f.pitOpen) };
    if (f.lap >= f.pitClose) return { ...base, state: "last" as const, text: t("SON TUR · şimdi gir") };
    return { ...base, state: "open" as const, text: t("AÇIK · en geç {0}. tur", f.pitClose) };
  });

  const visible = () => {
    const d = data();
    if (!d) return false;
    if (props.editing) return true;
    if (o().raceOnly && !d.race) return false;
    return true;
  };

  const name = (c: StratCar) => formatName(c.name, o().nameFormat ?? "initial");
  const sec = (v: number) => v.toFixed(1);
  const srcText = () => (loss().src === "track" ? t("piste özel") : loss().src === "measured" ? t("ölçülen") : t("varsayılan"));
  const lapTag = (n: Near) => (n.lapRel > 0 ? `+${n.lapRel}T` : n.lapRel < 0 ? `−${-n.lapRel}T` : "");

  const NearRow = (p: { n: Near | null; side: "ahead" | "behind" }) => (
    <div class={`pw-near pw-${p.side}`}>
      <span class="pw-near-l">{p.side === "ahead" ? "ÖNÜNDE" : "ARKANDA"}</span>
      <Show when={p.n} fallback={<span class="pw-near-none">Boş pist</span>}>
        <i class="pw-cls" style={{ background: p.n!.car.classColor }} />
        <b class="pw-num" data-no-i18n>
          #{p.n!.car.number}
        </b>
        <span class="pw-name" data-no-i18n>
          {name(p.n!.car)}
        </span>
        <Show when={lapTag(p.n!)}>
          <span class="pw-lap" data-no-i18n>
            {lapTag(p.n!)}
          </span>
        </Show>
        <b class="pw-gap" data-no-i18n>
          {sec(Math.abs(p.n!.rel))}
        </b>
      </Show>
    </div>
  );

  const Loss = () => (
    <div class="pw-cell pw-loss" title={t("Tahmini pit kaybı")}>
      <span class="pw-k">PİT KAYBI</span>
      <b data-no-i18n>
        {sec(loss().v)}
        <i>s</i>
      </b>
      <span class="pw-sub">{srcText()}</span>
    </div>
  );
  const Pos = () => (
    <Show when={data()?.race && calc() && calc()!.posNow > 0}>
      <div class="pw-cell pw-pos" title={t("Pit sonrası tahmini sıra")}>
        <span class="pw-k">{calc()!.multi ? "SINIF SIRASI" : "SIRA"}</span>
        <b data-no-i18n>
          P{calc()!.posNow}
          <em>→</em>
          <span classList={{ "pw-drop": calc()!.posAfter > calc()!.posNow }}>P{calc()!.posAfter}</span>
        </b>
      </div>
    </Show>
  );
  const Traffic = () => (
    <div class="pw-traffic" classList={{ "pw-busy": calc()?.traffic }}>
      <i />
      <b>{calc()?.traffic ? "TRAFİK" : "TEMİZ HAVA"}</b>
    </div>
  );
  const Window = () => (
    <div class={`pw-win pw-win-${win().state}`}>
      <span class="pw-k">PİT PENCERESİ</span>
      <Show when={win().state !== "wait"} fallback={<span class="pw-win-t">{win().text}</span>}>
        <Show when={win().open > 0 && win().open <= win().close}>
          <span class="pw-win-r" data-no-i18n>
            {win().open}–{win().close}
          </span>
        </Show>
        <Show when={win().text}>
          <b class="pw-win-t">{win().text}</b>
        </Show>
        <span class="pw-win-f">
          <span>Yakıt</span>{" "}
          <b data-no-i18n>{win().laps.toFixed(1)}</b> <span>tur</span>
        </span>
      </Show>
    </div>
  );

  /** Dönüş çizelgesi: ortada ben (pit çıkışı), sağda öndekiler, solda arkadakiler */
  const Timeline = () => {
    const span = () => clamp(num(o().span, 15), 5, 40);
    const shown = () => (calc()?.near ?? []).filter((x) => Math.abs(x.rel) <= span());
    const x = (rel: number) => 50 - (rel / span()) * 50;
    return (
      <div class="pw-tl">
        <div class="pw-tl-track">
          <i class="pw-tl-zone" style={{ left: `${x(clamp(num(o().trafficGap, 2.5), 0.5, 10) / 2)}%`, right: `${100 - x(-clamp(num(o().trafficGap, 2.5), 0.5, 10))}%` }} />
          <For each={shown()}>
            {(n) => (
              <span class="pw-tl-car" classList={{ "pw-tl-other": !n.car.sameClass }} style={{ left: `${x(n.rel)}%`, "--pw-c": n.car.classColor }} data-no-i18n>
                <i />
                <b>{n.car.number}</b>
              </span>
            )}
          </For>
          <span class="pw-tl-me" style={{ left: "50%" }}>
            <i />
            <b>SEN</b>
          </span>
        </div>
        <div class="pw-tl-axis" data-no-i18n>
          <span>−{span()}s</span>
          <span class="pw-tl-dir">
            <span>arkanda</span> ◂ ▸ <span>önünde</span>
          </span>
          <span>+{span()}s</span>
        </div>
      </div>
    );
  };

  return (
    <Show when={visible()}>
      <div
        class={`pw pw-d-${design()} ov-panel`}
        classList={{ "pw-sample": sample() }}
        style={{
          width: `${clamp(num(o().width, 460), 300, 900)}px`,
          "--pw-clear": String(o().clearColor || "#33d17a"),
          "--pw-traffic": String(o().trafficColor || "#ff8a2a"),
        }}
      >
        <Show when={design() === "card"}>
          <div class="ov-header pw-head">
            <span>Pit Penceresi</span>
            <Show when={data()!.onPitRoad} fallback={<span class="pw-head-r">Şimdi girersen</span>}>
              <span class="pw-inpit">
                <span>PİTTESİN</span>
                <Show when={data()!.pitElapsed >= 0}>
                  {" "}
                  <b data-no-i18n>{sec(data()!.pitElapsed)}s</b>
                </Show>
              </span>
            </Show>
          </div>
        </Show>
        <div class="pw-main">
          <Show when={o().showLoss !== false}>
            <Loss />
          </Show>
          <Show when={o().showPos !== false}>
            <Pos />
          </Show>
          <Show when={o().showRejoin !== false}>
            <div class="pw-rejoin">
              <NearRow n={calc()?.ahead ?? null} side="ahead" />
              <NearRow n={calc()?.behind ?? null} side="behind" />
            </div>
          </Show>
          <Show when={o().showTraffic !== false}>
            <Traffic />
          </Show>
        </div>
        <Show when={design() === "card" && o().showRejoin !== false}>
          <Timeline />
        </Show>
        <Show when={o().showWindow !== false}>
          <Window />
        </Show>
      </div>
    </Show>
  );
}
