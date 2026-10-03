// Canlı Sohbet overlay'lerinin ortak parçaları: platform simgeleri, anket kutusu, altyazı kutusu.
// (Bu klasördeki sadece manifest.ts ve Overlay.tsx overlay olarak bulunur; bu dosya yardımcıdır.)

import { For, Show, createMemo } from "solid-js";
import { siKick, siStreamlabs, siTwitch, siYoutube } from "simple-icons";
import { t } from "@/sdk/i18n";
import type { CaptionView, Platform, PollView } from "@/sdk/livechat";

const ICONS: Partial<Record<Platform, { path: string; hex: string }>> = {
  youtube: siYoutube,
  twitch: siTwitch,
  kick: siKick,
  streamlabs: siStreamlabs,
};

/** Platform logosu (renkli). system: turuncu nokta */
export function PlatformIcon(props: { platform: Platform; size?: number; color?: string }) {
  const ic = () => ICONS[props.platform];
  return (
    <Show when={ic()} fallback={<i class="lc-dot" style={{ width: `${(props.size ?? 16) * 0.6}px`, height: `${(props.size ?? 16) * 0.6}px` }} />}>
      <svg class="lc-ic" viewBox="0 0 24 24" width={props.size ?? 16} height={props.size ?? 16} aria-hidden="true">
        <path d={ic()!.path} fill={props.color ?? `#${ic()!.hex}`} />
      </svg>
    </Show>
  );
}

/** Yazı tipi yığını (emoji için Segoe UI Emoji eklenir) */
export const fontStack = (f: string) => (f ? `"${f}", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif` : undefined);

/** "4 dk 23 sn" / "42 sn" */
export function fmtRemaining(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? t("{0} dk {1} sn", m, r) : t("{0} sn", r);
}

/** Anket kısayolu basılıyken: "Dinleniyor…" göstergesi ve o ana kadar söylenen soru */
export function PollDictBox(props: { text: string }) {
  return (
    <div class="lc-poll lc-poll-dict">
      <div class="lc-poll-head">
        <b>🎙 {t("Dinleniyor…")}</b>
        <span>{t("Anket sorusu")}</span>
      </div>
      <Show when={props.text}>
        <div class="lc-poll-q" data-no-i18n>
          {props.text}
        </div>
      </Show>
    </div>
  );
}

/** Anket kutusu (MCO PollBanner görünümü): soru, şıklar, çubuklar, kalan süre, kazanan / beraberlik animasyonu */
export function PollBox(props: { poll: PollView; showQuestion?: boolean; showAnswers?: boolean; barColor?: string; winColor?: string }) {
  const p = () => props.poll;
  const max = createMemo(() => Math.max(1, ...p().counts));
  const result = () => p().state === "result";
  const header = () => {
    const v = p();
    if (v.state === "active") return v.remaining != null ? fmtRemaining(v.remaining) : t("{0} oy", v.total);
    return t("{0} oy", v.total);
  };
  const resultLine = () => {
    const v = p();
    if (v.state !== "result") return "";
    if (v.spinning) return t("Beraberlik — rastgele seçiliyor…");
    const n = v.picked ?? v.winners[0];
    if (!n) return t("Hiç oy gelmedi");
    const ans = v.answers[n - 1];
    const c = v.counts[n - 1] ?? 0;
    const pct = v.total ? Math.round((c * 100) / v.total) : 0;
    if (v.tie.length > 1) return t("Beraberlik ({0}), rastgele seçilen: {1}", v.tie.join(", "), ans ? `${n} — ${ans}` : n);
    return t("Kazanan: {0} ({1} oy, %{2})", ans ? `${n} — ${ans}` : n, c, pct);
  };
  return (
    <div class="lc-poll" classList={{ result: result(), spin: p().spinning }} style={{ "--lc-bar": props.barColor ?? "#4ea1ff", "--lc-win": props.winColor ?? "#ffc83d" }}>
      <div class="lc-poll-head">
        <b>📊 {t("Anket")}</b>
        <span>{header()}</span>
      </div>
      <Show when={props.showQuestion !== false && p().question}>
        <div class="lc-poll-q" data-no-i18n>
          {p().question}
        </div>
      </Show>
      <For each={p().counts}>
        {(c, i) => {
          const n = () => i() + 1;
          const win = () => result() && p().winners.includes(n());
          const pct = () => (p().total ? Math.round((c * 100) / p().total) : 0);
          return (
            <div class="lc-poll-row" classList={{ win: win() }}>
              <span class="lc-poll-n">{n()}</span>
              <Show when={props.showAnswers !== false && p().answers[i()]}>
                <span class="lc-poll-a" data-no-i18n>
                  {p().answers[i()]}
                </span>
              </Show>
              <span class="lc-poll-bar">
                <i style={{ width: `${(c / max()) * 100}%` }} />
              </span>
              <span class="lc-poll-c">
                {c} · %{pct()}
              </span>
            </div>
          );
        }}
      </For>
      <Show when={result()}>
        <div class="lc-poll-res">{resultLine()}</div>
      </Show>
      <Show when={p().state === "active"}>
        <div class="lc-poll-hint">{t("Oy vermek için şık numarasını yaz (1–{0})", p().options)}</div>
      </Show>
    </div>
  );
}

/** Altyazı satırları (uzak ses önce, mavi; mikrofon beyaz). `maxAge` saniyeden eski satırlar gizlenir. */
export function CaptionBox(props: { captions: CaptionView; now: number; maxAge: number; size?: number; remoteColor?: string; color?: string; bg?: string }) {
  const lines = () => props.captions.lines.filter((l) => l.text && (props.maxAge <= 0 || props.now - l.ts < props.maxAge * 1000));
  return (
    <Show when={lines().length}>
      <div class="lc-cap" style={{ "font-size": props.size ? `${props.size}px` : undefined, background: props.bg, "border-left": props.bg === "transparent" ? "none" : undefined }} data-no-i18n>
        <For each={lines()}>
          {(l) => (
            <div class="lc-cap-line" style={{ color: l.src === "remote" ? (props.remoteColor ?? "#5fd3ff") : (props.color ?? "#fff") }}>
              <Show when={l.label}>
                <b>{l.label}: </b>
              </Show>
              {l.text}
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/** Önizleme (düzenleme modu) için örnek anket */
export const SAMPLE_POLL: PollView = {
  state: "active",
  options: 3,
  counts: [12, 7, 3],
  total: 22,
  remaining: 42,
  endsAt: null,
  winners: [],
  tie: [],
  spinning: false,
  picked: null,
  question: "Bu yarışta kim kazanır?",
  answers: ["Verstappen", "Hamilton", "Leclerc"],
  resultText: "",
  rev: 0,
};
