import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from "solid-js";
import { onScreen, orderValue, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { demoShow } from "@/sdk/telemetry";
import manifest, { SOCIALS, SOCIAL_THEMES } from "./manifest";
import "./style.css";

// Sosyal Hesaplar: kullanıcının ayarlardan girdiği hesapları 5 farklı biçimde gösterir.
// Marka logosu çizilmez: rozet, platform adının kısaltması + platform rengidir; kullanıcı isterse kendi simgesini yükler.

interface Item {
  id: string;
  name: string;
  tag: string;
  color: string;
  text: string;
  img: string;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const ORDER = manifest.settings.find((f) => f.key === "order") as Extract<(typeof manifest.settings)[number], { type: "order" }>;
const SAMPLE: Record<string, string> = { twitch: "srtrpitwall", youtube: "@srtrpitwall", instagram: "@srtrpitwall", discord: "discord.gg/srtr" };

/** Rozet rengi üstünde okunur yazı rengi */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? "#111" : "#fff";
}

export default function Socials(props: OverlayProps) {
  const o = () => props.options;
  const [now, setNow] = createSignal(Date.now());
  const iv = window.setInterval(() => !previewFrozen() && setNow(Date.now()), 250);
  onCleanup(() => clearInterval(iv));

  const entered = createMemo<Item[]>(() =>
    orderValue(ORDER, o().order)
      .filter((x) => x.on)
      .map((x) => {
        const s = SOCIALS.find((p) => p.id === x.key)!;
        return {
          id: s.id,
          name: s.name || String(o()[`l_${s.id}`] ?? "").trim(),
          tag: s.tag,
          color: s.color,
          text: String(o()[`a_${s.id}`] ?? "").trim(),
          img: String(o()[`i_${s.id}`] ?? ""),
        };
      })
      .filter((x) => x.text),
  );
  /** Hiç hesap girilmediyse: önizleme / düzenleme / Demo modunda örnek hesaplar */
  const useSample = () => entered().length === 0 && (props.editing || !onScreen() || demoShow());
  const items = createMemo<Item[]>(() =>
    useSample()
      ? SOCIALS.filter((s) => SAMPLE[s.id]).map((s) => ({ id: s.id, name: s.name, tag: s.tag, color: s.color, text: SAMPLE[s.id], img: String(o()[`i_${s.id}`] ?? "") }))
      : entered(),
  );

  const design = () => (["rotator", "expand", "row", "list", "ticker"].includes(o().design) ? (o().design as string) : "rotator");
  const secs = () => clamp(num(o().secs, 5), 2, 30);
  // Duvar saati: uygulama penceresi ile OBS sayfası aynı hesabı aynı anda gösterir
  const idx = createMemo(() => (items().length ? Math.floor(now() / 1000 / secs()) % items().length : 0));

  const visible = createMemo(() => {
    if (!items().length) return false;
    if (props.editing || !onScreen() || demoShow()) return true;
    if (o().mode === "interval") {
      const every = clamp(num(o().everyMin, 5), 1, 60) * 60;
      return (now() / 1000) % every < clamp(num(o().showSecs, 20), 3, 300);
    }
    return true;
  });

  // Sırayla tek hesap: giden öğe çıkış animasyonu bitene kadar ekranda kalır
  const [cur, setCur] = createSignal<{ it: Item; k: number } | null>(null);
  const [prev, setPrev] = createSignal<{ it: Item; k: number } | null>(null);
  let k = 0;
  let outTimer = 0;
  createEffect(
    on([idx, items], () => {
      const it = items()[idx()];
      const c = cur();
      if (!it) return void setCur(null);
      if (c && c.it.id === it.id && c.it.text === it.text && c.it.img === it.img && c.it.name === it.name) return;
      if (c) {
        setPrev(c);
        clearTimeout(outTimer);
        outTimer = window.setTimeout(() => setPrev(null), 650);
      }
      setCur({ it, k: ++k });
    }),
  );
  onCleanup(() => clearTimeout(outTimer));

  const pal = createMemo(() => {
    const th = String(o().theme ?? "dark");
    if (th === "app") return null;
    if (th === "custom") return { accent: String(o().cAccent || "#ff8a2a"), bg: String(o().cBg || "#15171c"), text: String(o().cText || "#f2f4f8") };
    return SOCIAL_THEMES[th] ?? SOCIAL_THEMES.dark;
  });
  const style = (): JSX.CSSProperties => {
    const p = pal();
    return {
      "font-size": `${clamp(num(o().fontSize, 18), 10, 48)}px`,
      "font-weight": o().bold === false ? 500 : 700,
      ...(p ? { "--so-accent": p.accent, "--so-bg": p.bg, "--so-text": p.text } : {}),
      ...(design() === "ticker" ? { width: `${clamp(num(o().width, 600), 200, 1920)}px` } : {}),
    };
  };
  const itemStyle = (it: Item): JSX.CSSProperties => {
    const brand = o().brand !== false;
    const c = brand ? it.color : "var(--so-accent)";
    return {
      "--so-c": c,
      "--so-ink": brand ? inkOn(it.color) : "var(--so-bg)",
      ...(o().brandText && brand ? { "--so-name": it.color } : {}),
    };
  };

  const Chip = (p: { it: Item; open?: boolean; class?: string }) => (
    <div class={`so-chip ${p.class ?? ""}`} classList={{ "so-open": p.open !== false }} style={itemStyle(p.it)}>
      <Show when={o().iconStyle !== "none" || design() === "expand"}>
        <span class="so-ic" data-no-i18n>
          <Show when={p.it.img} fallback={p.it.tag}>
            <img src={p.it.img} alt="" />
          </Show>
        </span>
      </Show>
      <span class="so-tx" data-no-i18n>
        <Show when={o().showName && p.it.name}>
          <small>{p.it.name}</small>
        </Show>
        <b>{p.it.text}</b>
      </span>
    </div>
  );

  // Kayan şerit: içerik iki kez çizilir, yarısı kadar kayınca başa döner (kesintisiz)
  let track: HTMLDivElement | undefined;
  const [dur, setDur] = createSignal(20);
  createEffect(() => {
    if (design() !== "ticker") return;
    items();
    o().fontSize;
    o().showName;
    const sp = clamp(num(o().speed, 60), 20, 200);
    queueMicrotask(() => track && setDur(Math.max(4, track.scrollWidth / 2 / sp)));
  });

  return (
    <div
      class={`so so-d-${design()} so-s-${["pill", "card", "line", "plain"].includes(o().shape) ? o().shape : "pill"} so-a-${["center", "right"].includes(o().align) ? o().align : "left"} so-i-${o().iconStyle === "outline" ? "outline" : "badge"} so-t-${o().transition || "slideUp"}`}
      classList={{ "so-app": !pal(), "so-off": !visible(), "so-shadow": o().shadow !== false }}
      style={style()}
    >
      <Show when={design() === "rotator"}>
        <div class="so-stage">
          <Show when={prev()} keyed>
            {(p) => <Chip it={p.it} class="so-out" />}
          </Show>
          <Show when={cur()} keyed>
            {(c) => <Chip it={c.it} class="so-in" />}
          </Show>
        </div>
      </Show>
      <Show when={design() === "expand"}>
        <For each={items()}>{(it, i) => <Chip it={it} open={i() === idx()} />}</For>
      </Show>
      <Show when={design() === "row" || design() === "list"}>
        <For each={items()}>{(it) => <Chip it={it} />}</For>
      </Show>
      <Show when={design() === "ticker"}>
        <div class="so-track" ref={track} style={{ "animation-duration": `${dur()}s` }}>
          <For each={[...items(), ...items()]}>{(it) => <Chip it={it} />}</For>
        </div>
      </Show>
    </div>
  );
}
