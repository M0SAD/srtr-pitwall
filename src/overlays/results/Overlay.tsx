import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { Flag } from "@/sdk/Flag";
import { formatName } from "@/sdk/HeaderStats";
import { lapTime } from "@/sdk/format";
import { sampleRow } from "@/sdk/samples";
import { t } from "@/sdk/i18n";
import type { Row } from "@/sdk/types";
import "./style.css";

// Yarış Sonucu: damalı bayraktan sonra sınıfın ilk üçü + oyuncunun sonucu.
// Bitiş: "session" konusunda state >= 5 (damalı / soğuma) ya da "checkered" bayrağı, yarış oturumunda.
// Veriler "standings" konusundan (sınıf sırası, fark, en iyi tur, start'a göre sıra değişimi, tahmini iRating).

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

const SAMPLE: Row[] = [
  sampleRow({ idx: 1, classPos: 1, number: "44", name: "Luca Rossi", flair: "IT", gap: 0, best: 97.412 }),
  sampleRow({ idx: 2, classPos: 2, number: "12", name: "Emre Kaya", flair: "TR", gap: 3.214, best: 97.655 }),
  sampleRow({ idx: 3, classPos: 3, number: "3", name: "Noah Fischer", flair: "DE", gap: 8.902, best: 97.701 }),
  sampleRow({ idx: 4, classPos: 4, number: "59", name: "Deniz Yılmaz", flair: "TR", gap: 11.48, best: 97.873, isMe: true, posChange: 3, irating: 2450, irDelta: 42 }),
  sampleRow({ idx: 5, classPos: 5, number: "71", name: "Finn Larsen", flair: "DK", gap: 19.3, best: 98.102 }),
  sampleRow({ idx: 6, classPos: 6, number: "8", name: "Hugo Martin", flair: "FR", gap: 27.75, best: 98.24 }),
  sampleRow({ idx: 7, classPos: 7, number: "21", name: "Tom Baker", flair: "GB", gap: 0, lapsDown: 1, best: 98.9 }),
];

export default function Results(props: OverlayProps) {
  const standings = useTopic("standings");
  const session = useTopic("session");
  const status = useTopic("status");
  const o = () => props.options;

  const [now, setNow] = createSignal(Date.now());
  const timer = window.setInterval(() => {
    if (!previewFrozen()) setNow(Date.now());
  }, 500);
  onCleanup(() => clearInterval(timer));

  const sample = () => !!status()?.demo || !!status()?.preview;
  const isRace = () => {
    const s = standings();
    if (s) return s.race;
    return /race|yarış/i.test(session()?.sessionType ?? "");
  };
  const checkered = () => {
    const s = session();
    return !!s && isRace() && ((s.state ?? 0) >= 5 || s.flags.includes("checkered"));
  };

  // --- bitiş anı ---
  const [shownAt, setShownAt] = createSignal(0);
  let lapsAtFlag = -1;
  createEffect(() => {
    const s = session();
    if (sample() || !checkered() || !s) {
      lapsAtFlag = -1;
      if (shownAt()) setShownAt(0);
      return;
    }
    if (shownAt()) return;
    if (lapsAtFlag < 0) lapsAtFlag = s.lapsCompleted;
    const st = status();
    const done =
      o().trigger === "flag" ||
      s.lapsCompleted > lapsAtFlag || // damalıdan sonra çizgiyi geçtim
      s.classPosition === 1 || // lider: bayrak zaten onunla çıkar
      (s.state ?? 0) >= 6 ||
      (!!st && !st.onTrack);
    if (done) setShownAt(Date.now());
  });

  const liveOn = () => shownAt() > 0 && (o().mode === "stay" || now() - shownAt() < clamp(num(o().secs, 30), 5, 300) * 1000);
  // Örnek: Demo modu / önizlemede 10 sn görünür, 4 sn gizli; düzenlemede hep görünür
  const sampleOn = () => {
    if (props.editing || previewFrozen()) return true;
    // Ekrandaki gerçek overlay'de yalnızca gerçek Demo: panel önizleme verisi (demo + preview) akarken örnek gösterilmez
    if (onScreen() && !(status()?.demo && !status()?.preview)) return false;
    return (now() / 1000) % 14 < 10;
  };
  const on = () => liveOn() || sampleOn();

  // --- veriler ---
  const all = createMemo<Row[]>(() => {
    const rows = standings()?.rows ?? [];
    if (rows.some((r) => r.isMe)) return rows;
    // Rakip listesi yoksa örnek yalnızca önizleme / düzenlemede
    return liveOn() ? rows : SAMPLE;
  });
  const me = createMemo(() => all().find((r) => r.isMe));
  const field = createMemo(() => {
    const m = me();
    return all()
      .filter((r) => r.classPos > 0 && (!m || r.classId === m.classId))
      .sort((a, b) => a.classPos - b.classPos);
  });
  // Podyum resmi sınıf sırasına göre: 1., 2., 3. (o an listede olan ilk üç kişi değil)
  const podium = createMemo(() => field().filter((r) => r.classPos <= 3).slice(0, 3));
  const table = createMemo(() => {
    const n = clamp(Math.round(num(o().topN, 5)), 3, 12);
    const top = field().slice(0, n);
    const m = me();
    return m && m.classPos > 0 && !top.includes(m) ? [...top, m] : top;
  });

  const gapText = (r: Row) => {
    if (r.classPos === 1) return lapTime(r.best);
    if (r.lapsDown > 0) return t("+{0} tur", r.lapsDown);
    return r.gap > 0 ? `+${r.gap.toFixed(r.gap < 100 ? 3 : 1)}` : "";
  };
  const name = (r: Row) => formatName(r.name, o().nameFormat as string);
  const showInc = () => o().showInc !== false && (sample() || !onScreen() || status()?.sim === "iracing" || (session()?.incidentLimit ?? 0) > 0);
  const showIr = () => o().showIr !== false && (me()?.irating ?? 0) > 0 && isRaceOrSample();
  const isRaceOrSample = () => isRace() || !liveOn();
  const gain = () => me()?.posChange ?? 0;
  const title = () => String(o().title ?? "").trim() || t("YARIŞ SONUCU");
  const design = () => (o().design === "table" ? "table" : "podium");

  return (
    <div
      class={`ov-theme rslt rslt-d-${design()}`}
      classList={{ "rslt-off": !on() }}
      style={{ width: `${clamp(num(o().width, 460), 300, 900)}px`, "font-size": `${clamp(num(o().fontSize, 15), 10, 30)}px` }}
    >
      <div class="ov-panel rslt-panel">
        <div class="rslt-head">
          <i class="rslt-chk" />
          <span class="rslt-title">{title()}</span>
          <Show when={me()?.className}>
            <span class="rslt-class" style={{ background: me()!.classColor || "var(--ov-accent)" }} data-no-i18n>
              {me()!.className}
            </span>
          </Show>
        </div>

        <Show when={design() === "podium"}>
          <div class="rslt-podium">
            <For each={[1, 0, 2]}>
              {(i) => (
                <Show when={podium()[i]} fallback={<div class="rslt-step" />}>
                  {(r) => (
                    <div class={`rslt-step p${i + 1}`} classList={{ me: r().isMe }}>
                      <Show when={o().showFlags !== false && r().flair}>
                        <span class="rslt-flag" data-no-i18n>
                          <Flag code={r().flair} />
                        </span>
                      </Show>
                      <span class="rslt-name" data-no-i18n>
                        {name(r())}
                      </span>
                      <Show when={o().showGaps !== false}>
                        <span class="rslt-gap ov-mono" data-no-i18n>
                          {gapText(r())}
                        </span>
                      </Show>
                      <div class="rslt-block">
                        <b>{i + 1}</b>
                        <small data-no-i18n>#{r().number}</small>
                      </div>
                    </div>
                  )}
                </Show>
              )}
            </For>
          </div>
        </Show>

        <Show when={design() === "table"}>
          <div class="rslt-table">
            <For each={table()}>
              {(r, i) => (
                <div class="rslt-row" classList={{ me: r.isMe, sep: r.isMe && i() === table().length - 1 && r.classPos > i() + 1 }} style={{ "--i": String(i()) }}>
                  <span class="rslt-p">{r.classPos}</span>
                  <Show when={o().showFlags !== false}>
                    <span class="rslt-flag" data-no-i18n>
                      <Flag code={r.flair} />
                    </span>
                  </Show>
                  <span class="rslt-num" data-no-i18n>
                    #{r.number}
                  </span>
                  <span class="rslt-name" data-no-i18n>
                    {name(r)}
                  </span>
                  <Show when={o().showGaps !== false}>
                    <span class="rslt-gap ov-mono" data-no-i18n>
                      {gapText(r)}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={o().showMine !== false && me()}>
          {(m) => (
            <div class="rslt-mine">
              <div class="rslt-stat big">
                <label>Sıra</label>
                <b data-no-i18n>
                  <small>P</small>
                  {m().classPos > 0 ? m().classPos : "–"}
                </b>
              </div>
              <Show when={o().showGain !== false}>
                <div class="rslt-stat">
                  <label>Start'a göre</label>
                  <b classList={{ "ov-pos": gain() > 0, "ov-neg": gain() < 0 }} data-no-i18n>
                    {gain() > 0 ? `▲ ${gain()}` : gain() < 0 ? `▼ ${-gain()}` : "="}
                  </b>
                </div>
              </Show>
              <Show when={o().showBest !== false}>
                <div class="rslt-stat">
                  <label>En iyi tur</label>
                  <b class="ov-mono" data-no-i18n>
                    {lapTime(m().best)}
                  </b>
                </div>
              </Show>
              <Show when={showInc()}>
                <div class="rslt-stat">
                  <label>Olay</label>
                  <b data-no-i18n>{session()?.incidents ?? 0}x</b>
                </div>
              </Show>
              <Show when={showIr()}>
                <div class="rslt-stat">
                  <label>iRating (tahmini)</label>
                  <b classList={{ "ov-pos": m().irDelta > 0, "ov-neg": m().irDelta < 0 }} data-no-i18n>
                    {m().irDelta > 0 ? "+" : m().irDelta < 0 ? "−" : "±"}
                    {Math.abs(m().irDelta)}
                  </b>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
