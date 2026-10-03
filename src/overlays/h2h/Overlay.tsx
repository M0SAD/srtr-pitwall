import { For, Show, createMemo } from "solid-js";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { Flag } from "@/sdk/Flag";
import { formatName } from "@/sdk/HeaderStats";
import { irating, lapTime } from "@/sdk/format";
import { sampleRow } from "@/sdk/samples";
import { t } from "@/sdk/i18n";
import type { Row } from "@/sdk/types";
import { H2H_DEFAULT_ROWS } from "./manifest";
import "./style.css";

// Kafa Kafaya: oyuncu ile seçilen rakip yan yana. Sıralama rakipleri "standings", pistteki rakipler "relative"
// konusundan seçilir; değerler her zaman "standings" satırından okunur (yoksa relative satırı).
// "Lastikteki tur" = stint turu (son pit çıkışından beri): pitte lastik değişmediyse gerçek lastik yaşı daha fazladır.

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

const S_ME = sampleRow({ idx: 1, classPos: 4, number: "59", name: "Deniz Yılmaz", flair: "TR", isMe: true, gap: 12.84, last: 98.214, best: 97.873, pits: 1, stint: 9, irating: 2450 });
const S_RIVAL = sampleRow({ idx: 2, classPos: 3, number: "44", name: "Luca Rossi", flair: "IT", gap: 11.62, last: 98.402, best: 97.655, pits: 1, stint: 12, irating: 3120 });

interface Line {
  key: string;
  label: string;
  a: string;
  b: string;
  /** -1 sol (ben) iyi, 1 sağ (rakip) iyi, 0 eşit / karşılaştırılamaz */
  win: number;
}

export default function HeadToHead(props: OverlayProps) {
  const standings = useTopic("standings");
  const relative = useTopic("relative");
  const o = () => props.options;

  const rowsSel = createMemo(() => (Array.isArray(o().rows) ? (o().rows as string[]) : H2H_DEFAULT_ROWS));
  const st = () => standings()?.rows ?? [];
  const realMe = createMemo(() => st().find((r) => r.isMe));
  const byIdx = (idx: number) => st().find((r) => r.idx === idx);

  /** Rakip + (pistteki rakipler için) saniye farkı: + rakip önde */
  const realRival = createMemo<{ row: Row; trackGap?: number } | undefined>(() => {
    const m = realMe();
    if (!m) return undefined;
    const mode = String(o().rival ?? "posAhead");
    const cls = st()
      .filter((r) => r.classId === m.classId && r.classPos > 0)
      .sort((a, b) => a.classPos - b.classPos);
    const at = (p: number) => cls.find((r) => r.classPos === p && !r.isMe);
    if (mode === "number") {
      const want = String(o().carNumber ?? "").replace(/^#/, "").trim();
      const r = want ? st().find((x) => x.number === want && !x.isMe) : undefined;
      return r ? { row: r } : undefined;
    }
    if (mode === "leader") {
      const r = m.classPos === 1 ? at(2) : at(1);
      return r ? { row: r } : undefined;
    }
    if (mode === "trackAhead" || mode === "trackBehind") {
      const rel = relative()?.rows ?? [];
      const mi = rel.findIndex((r) => r.isMe);
      const r = mi < 0 ? undefined : rel[mode === "trackAhead" ? mi - 1 : mi + 1];
      return r ? { row: byIdx(r.idx) ?? r, trackGap: r.gap } : undefined;
    }
    const r = at(m.classPos + (mode === "posBehind" ? 1 : -1));
    return r ? { row: r } : undefined;
  });

  const useSample = () => !realMe() && (props.editing || !onScreen());
  const me = () => realMe() ?? (useSample() ? S_ME : undefined);
  const rival = () => realRival()?.row ?? (useSample() ? S_RIVAL : undefined);
  const race = () => (realMe() ? !!standings()?.race : true);

  /** Aradaki fark (sn; bilinmiyorsa null) ve tur farkı */
  const gap = createMemo<{ secs: number | null; laps: number; ahead: boolean } | undefined>(() => {
    const a = me();
    const b = rival();
    if (!a || !b) return undefined;
    const tg = realRival()?.trackGap;
    if (tg != null) return { secs: Math.abs(tg), laps: 0, ahead: tg > 0 };
    if (!race()) {
      const ok = a.best > 0 && b.best > 0;
      return { secs: ok ? Math.abs(a.best - b.best) : null, laps: 0, ahead: ok ? b.best < a.best : b.classPos < a.classPos };
    }
    const ahead = b.classId === a.classId ? b.classPos < a.classPos : b.pos < a.pos;
    if (b.classId !== a.classId) return { secs: null, laps: 0, ahead };
    const laps = Math.abs(a.lapsDown - b.lapsDown);
    return { secs: laps > 0 ? null : Math.abs(a.gap - b.gap), laps, ahead };
  });
  const gapText = () => {
    const g = gap();
    if (!g) return "";
    if (g.laps > 0) return t("{0} tur", g.laps);
    return g.secs == null ? "–" : g.secs.toFixed(g.secs < 100 ? 2 : 1);
  };

  const lines = createMemo<Line[]>(() => {
    const a = me();
    const b = rival();
    if (!a || !b) return [];
    const lower = (x: number, y: number) => (x > 0 && y > 0 && x !== y ? (x < y ? -1 : 1) : 0);
    const all: Record<string, () => Line> = {
      pos: () => ({ key: "pos", label: t("Sıra"), a: a.classPos > 0 ? `P${a.classPos}` : "–", b: b.classPos > 0 ? `P${b.classPos}` : "–", win: a.classId === b.classId ? lower(a.classPos, b.classPos) : 0 }),
      last: () => ({ key: "last", label: t("Son tur"), a: lapTime(a.last), b: lapTime(b.last), win: lower(a.last, b.last) }),
      best: () => ({ key: "best", label: t("En iyi tur"), a: lapTime(a.best), b: lapTime(b.best), win: lower(a.best, b.best) }),
      pits: () => ({ key: "pits", label: t("Pit stop"), a: String(a.pits), b: String(b.pits), win: a.pits === b.pits ? 0 : a.pits < b.pits ? -1 : 1 }),
      tyre: () => ({ key: "tyre", label: t("Lastikteki tur"), a: String(a.stint), b: String(b.stint), win: a.stint === b.stint ? 0 : a.stint < b.stint ? -1 : 1 }),
      irating: () => ({ key: "irating", label: "iRating", a: a.irating > 0 ? irating(a.irating) : "–", b: b.irating > 0 ? irating(b.irating) : "–", win: a.irating > 0 && b.irating > 0 && a.irating !== b.irating ? (a.irating > b.irating ? -1 : 1) : 0 }),
    };
    return rowsSel()
      .filter((k) => all[k])
      .map((k) => all[k]());
  });

  const visible = () => {
    if (!me() || !rival()) return false;
    if (props.editing || useSample()) return true;
    if (o().raceOnly && !standings()?.race) return false;
    const max = num(o().maxGap, 0);
    const g = gap();
    if (max > 0 && race() && g && (g.laps > 0 || (g.secs != null && g.secs > max))) return false;
    return true;
  };
  const design = () => (o().design === "stack" ? "stack" : "bar");
  const name = (r: Row) => formatName(r.name, o().nameFormat as string);

  const driver = (r: () => Row, side: "a" | "b") => (
    <div class={`h2h-drv h2h-${side}`} style={{ "--h2h-c": r().classColor || "var(--ov-accent)" }}>
      <span class="h2h-pos" data-no-i18n>
        {r().classPos > 0 ? r().classPos : "–"}
      </span>
      <div class="h2h-id">
        <span class="h2h-name" data-no-i18n>
          {name(r())}
        </span>
        <span class="h2h-meta" data-no-i18n>
          <Show when={o().showFlags !== false && r().flair}>
            <Flag code={r().flair} />
          </Show>
          <i>#{r().number}</i>
          <Show when={r().car}>
            <i>{r().car}</i>
          </Show>
        </span>
      </div>
    </div>
  );

  return (
    <div
      class={`ov-theme h2h h2h-d-${design()}`}
      classList={{ "h2h-off": !visible() }}
      style={{
        width: `${clamp(num(o().width, 620), 260, 1100)}px`,
        "font-size": `${clamp(num(o().fontSize, 15), 10, 30)}px`,
        "--h2h-win": (o().winColor as string) || "var(--ov-green)",
      }}
    >
      <Show when={me() && rival()}>
        <div class="ov-panel h2h-panel">
          <div class="h2h-top">
            {driver(() => me()!, "a")}
            <div class="h2h-mid">
              <Show when={o().showGap !== false && gap()} fallback={<b class="h2h-vs">VS</b>}>
                <label>{gap()!.ahead ? t("Rakip önde") : t("Rakip arkada")}</label>
                <b class="h2h-gap ov-mono" data-no-i18n>
                  {gapText()}
                </b>
              </Show>
            </div>
            {driver(() => rival()!, "b")}
          </div>
          <div class="h2h-rows">
            <div class="h2h-row h2h-hdr" data-no-i18n>
              <b class="h2h-va">#{me()!.number}</b>
              <label />
              <b class="h2h-vb">#{rival()!.number}</b>
            </div>
            <For each={lines()}>
              {(l) => (
                <div class="h2h-row">
                  <b class="h2h-va ov-mono" classList={{ win: l.win < 0 }} data-no-i18n>
                    {l.a}
                  </b>
                  <label>{l.label}</label>
                  <b class="h2h-vb ov-mono" classList={{ win: l.win > 0 }} data-no-i18n>
                    {l.b}
                  </b>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
