import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from "solid-js";
import { onScreen, previewFrozen, type OverlayProps } from "@/sdk/overlay";
import { fmtTime, musicControl, musicPos, useMusic, type MusicState } from "@/sdk/music";
import { t } from "@/sdk/i18n";
import "./style.css";

/** Örnek kapak (özgün çizim: degrade + nota) */
const SAMPLE_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a18"/><stop offset="1" stop-color="#af002d"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="60" r="40" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/><path d="M70 34v38a10 10 0 1 1-6-9V44l-18 4v28a10 10 0 1 1-6-9V42z" fill="#fff"/></svg>`,
  );

/** Panel önizlemesi / düzenleme: örnek parça (konum zamanla ilerler) */
function sample(now: number): MusicState {
  const dur = 214_000;
  return {
    supported: true,
    active: true,
    kind: "spotify",
    source: "Spotify",
    appId: "Spotify.exe",
    title: t("Örnek Şarkı Adı"),
    artist: t("Örnek Sanatçı"),
    album: t("Örnek Albüm"),
    playing: true,
    posMs: now % dur,
    at: now,
    durMs: dur,
    canPrev: true,
    canNext: true,
    canToggle: true,
    art: SAMPLE_ART,
    artUrl: "",
    key: "sample",
    sessions: [],
    error: "",
    volume: 70,
    muted: false,
  };
}

/** Kapak resminin baskın canlı rengi (koyu / gri pikseller az sayılır) */
function artColor(src: string): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        let r = 0,
          gg = 0,
          b = 0,
          w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]);
          const mn = Math.min(d[i], d[i + 1], d[i + 2]);
          // Doygun ve çok karanlık olmayan pikseller ağır basar
          const k = ((mx - mn) / 255) * 3 + (mx > 40 ? 0.15 : 0);
          r += d[i] * k;
          gg += d[i + 1] * k;
          b += d[i + 2] * k;
          w += k;
        }
        if (w <= 0) return res("");
        let [R, G, B] = [r / w, gg / w, b / w];
        // Çok koyuysa aç (çubuk ve vurgu görünsün)
        const l = Math.max(R, G, B);
        if (l < 140) {
          const f = 140 / Math.max(1, l);
          [R, G, B] = [R * f, G * f, B * f];
        }
        const hex = (v: number) => Math.round(Math.min(255, v)).toString(16).padStart(2, "0");
        res(`#${hex(R)}${hex(G)}${hex(B)}`);
      } catch {
        res("");
      }
    };
    img.onerror = () => res("");
    img.src = src;
  });
}

/** Sığmayan yazı yavaşça kayar (sığıyorsa durur) */
function Marquee(p: { text: string; on: boolean; class?: string }) {
  let box: HTMLSpanElement | undefined;
  let inner: HTMLSpanElement | undefined;
  const [over, setOver] = createSignal(0);
  const measure = () => {
    if (!box || !inner) return;
    const d = inner.scrollWidth - box.clientWidth;
    setOver(d > 2 ? d : 0);
  };
  onMount(() => {
    const ro = new ResizeObserver(measure);
    if (box) ro.observe(box);
    onCleanup(() => ro.disconnect());
  });
  createEffect(on(() => p.text, () => queueMicrotask(measure)));
  return (
    <span ref={box} class={`mu-mq ${p.class ?? ""}`} classList={{ run: p.on && over() > 0, fade: over() > 0 }}>
      <span
        ref={inner}
        style={p.on && over() > 0 ? { "--mq-d": `${-over() - 12}px`, "--mq-t": `${Math.max(6, (over() + 12) / 22)}s` } : undefined}
        data-no-i18n
      >
        {p.text}
      </span>
    </span>
  );
}

const Icon = {
  Prev: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h2v14H7zM20 5v14L10 12z" fill="currentColor" />
    </svg>
  ),
  Next: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5h2v14h-2zM4 5v14l10-7z" fill="currentColor" />
    </svg>
  ),
  Play: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
    </svg>
  ),
  Pause: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" />
    </svg>
  ),
  VolDown: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none" />
    </svg>
  ),
  VolUp: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none" />
    </svg>
  ),
  Speaker: (p: { muted?: boolean }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {p.muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
      ) : (
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none" />
      )}
    </svg>
  ),
  Note: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 3v11.5a3.5 3.5 0 1 1-2-3.16V7l-6 1.5v8a3.5 3.5 0 1 1-2-3.16V5z" fill="currentColor" />
    </svg>
  ),
};

export default function Music(props: OverlayProps) {
  const o = () => props.options;
  const live = useMusic(
    () => true,
    () => String(o().pref ?? "auto"),
  );
  const [now, setNow] = createSignal(Date.now());
  const iv = setInterval(() => !previewFrozen() && setNow(Date.now()), 250);
  onCleanup(() => clearInterval(iv));

  /** Ekranda: gerçek veri (düzenlerken çalan yoksa örnek). Panelde: çalan varsa gerçek, yoksa örnek. */
  const demo = () => !live().active && (onScreen() ? props.editing : true);
  const st = createMemo<MusicState>(() => (demo() ? sample(now()) : live()));
  const art = () => st().art || st().artUrl;

  const n = (k: string, d: number) => {
    const v = Number(o()[k]);
    return Number.isFinite(v) ? v : d;
  };
  const design = () => String(o().design ?? "card");
  const theme = () => String(o().theme ?? "art");

  // Kapak rengi (tema "kapak resmine uysun" ya da vurgu için)
  const [tint, setTint] = createSignal("");
  createEffect(
    on(art, (src) => {
      if (!src) return setTint("");
      void artColor(src).then((c) => src === art() && setTint(c));
    }),
  );

  // Parça değişince kısa geçiş ve "değişince göster" süresi
  const [swap, setSwap] = createSignal(false);
  const [shownUntil, setShownUntil] = createSignal(0);
  let lastKey = "";
  createEffect(
    on(
      () => st().key,
      (k) => {
        if (!k || k === lastKey) return;
        const first = lastKey === "";
        lastKey = k;
        setShownUntil(Date.now() + n("showSecs", 8) * 1000);
        if (first) return;
        setSwap(true);
        setTimeout(() => setSwap(false), 450);
      },
    ),
  );
  // Durdur / oynat değişince de kısa göster ("değişince" kipinde)
  createEffect(on(() => st().playing, () => setShownUntil(Date.now() + n("showSecs", 8) * 1000), { defer: true }));

  const visible = () => {
    if (!onScreen() || props.editing) return true;
    const s = st();
    if (!s.active) return false;
    const mode = String(o().show ?? "always");
    if (mode === "playing") return s.playing;
    if (mode === "change") return now() < shownUntil();
    return true;
  };

  const pos = () => musicPos(st(), now());
  const pct = () => (st().durMs > 0 ? Math.min(100, (pos() / st().durMs) * 100) : 0);
  const hasDur = () => st().durMs > 0;

  const vars = (): JSX.CSSProperties => {
    const v: Record<string, string> = {
      "--mu-w": `${n("width", 380)}px`,
      "--mu-radius": `${n("radius", 14)}px`,
      "--mu-k": String(n("textSize", 100) / 100),
    };
    const th = theme();
    if (th === "custom") {
      v["--mu-bg"] = String(o().cBg ?? "#15161b");
      v["--mu-text"] = String(o().cText ?? "#f4f6fa");
      v["--mu-accent"] = String(o().cAccent ?? "#1ed760");
    } else if (tint()) {
      v["--mu-tint"] = tint();
      if (th === "art" || th === "glass") v["--mu-accent"] = tint();
    }
    return v;
  };

  // Ses düzeyi bölümü: "her zaman" ya da ses değişince birkaç saniye
  const vol = () => st().volume ?? -1;
  const [volUntil, setVolUntil] = createSignal(0);
  createEffect(on(() => [vol(), st().muted], () => setVolUntil(Date.now() + 3000), { defer: true }));
  const showVol = () => {
    const m = String(o().volume ?? "always");
    if (m === "off" || vol() < 0) return false;
    return m === "always" || props.editing || now() < volUntil();
  };

  const act = (a: "prev" | "next" | "toggle" | "volup" | "voldown" | "mute") => (e: MouseEvent) => {
    e.stopPropagation();
    if (!demo()) void musicControl(a);
  };

  const Buttons = () => (
    <Show when={o().buttons !== false && design() !== "text"}>
      <div class="mu-btns">
        <button classList={{ off: !st().canPrev }} onClick={act("prev")} title={t("Önceki")}>
          <Icon.Prev />
        </button>
        <button class="mu-play" classList={{ off: !st().canToggle }} onClick={act("toggle")} title={st().playing ? t("Duraklat") : t("Oynat")}>
          {st().playing ? <Icon.Pause /> : <Icon.Play />}
        </button>
        <button classList={{ off: !st().canNext }} onClick={act("next")} title={t("Sonraki")}>
          <Icon.Next />
        </button>
      </div>
    </Show>
  );

  const Volume = () => (
    <Show when={showVol()}>
      <div class="mu-vol">
        <button class="mu-vbtn" onClick={act("mute")} title={st().muted ? t("Sesi aç") : t("Sessize al")}>
          <Icon.Speaker muted={st().muted || vol() === 0} />
        </button>
        <button class="mu-vbtn" onClick={act("voldown")} title={t("Sesi kıs")}>
          <Icon.VolDown />
        </button>
        <div class="mu-bar mu-vbar">
          <i style={{ width: `${st().muted ? 0 : vol()}%` }} />
        </div>
        <button class="mu-vbtn" onClick={act("volup")} title={t("Sesi aç")}>
          <Icon.VolUp />
        </button>
        <span class="mu-t mu-vnum">{st().muted ? "0" : vol()}</span>
      </div>
    </Show>
  );

  const Eq = () => (
    <Show when={o().eq !== false}>
      <i class="mu-eq" classList={{ on: st().playing && !previewFrozen() }}>
        <b />
        <b />
        <b />
        <b />
      </i>
    </Show>
  );

  const Head = () => (
    <Show when={o().header !== false || (o().source !== false && st().source)}>
      <div class="mu-head">
        <Eq />
        <Show when={o().header !== false}>
          <span class="mu-label">{st().playing ? t("Şu an çalıyor") : t("Duraklatıldı")}</span>
        </Show>
        <Show when={o().source !== false && st().source}>
          <span class="mu-src" data-no-i18n>
            {st().source}
          </span>
        </Show>
      </div>
    </Show>
  );

  const Progress = () => (
    <Show when={o().progress !== false && hasDur()}>
      <div class="mu-prog">
        <Show when={o().time !== false}>
          <span class="mu-t">{fmtTime(pos())}</span>
        </Show>
        <div class="mu-bar">
          <i style={{ width: `${pct()}%` }} />
        </div>
        <Show when={o().time !== false}>
          <span class="mu-t">{fmtTime(st().durMs)}</span>
        </Show>
      </div>
    </Show>
  );

  const Cover = (p: { class?: string }) => (
    <div class={`mu-cover ${p.class ?? ""}`}>
      <Show when={art()} fallback={<span class="mu-noart"><Icon.Note /></span>}>
        <img src={art()} alt="" draggable={false} />
      </Show>
    </div>
  );

  const Info = () => (
    <div class="mu-info">
      <Marquee class="mu-title" text={st().title || t("Bilinmeyen parça")} on={o().marquee !== false && !previewFrozen()} />
      <Show when={st().artist}>
        <Marquee class="mu-artist" text={st().artist} on={o().marquee !== false && !previewFrozen()} />
      </Show>
      <Show when={o().album === true && st().album}>
        <Marquee class="mu-album" text={st().album} on={o().marquee !== false && !previewFrozen()} />
      </Show>
    </div>
  );

  return (
    <Show when={visible()}>
      <div
        class={`mu mu-d-${design()} mu-th-${theme()}`}
        classList={{
          "mu-swap": swap(),
          "mu-paused": !st().playing,
          "mu-noborder": o().border === false,
          "mu-noshadow": o().shadow === false,
        }}
        style={vars()}
      >
        <Show when={theme() === "art" || theme() === "glass"}>
          <Show when={art()}>
            <img class="mu-bgart" src={art()} alt="" aria-hidden="true" draggable={false} />
          </Show>
        </Show>
        <Show when={design() === "card"}>
          <Cover />
          <div class="mu-body">
            <Head />
            <Info />
            <Progress />
            <Volume />
          </div>
          <Buttons />
        </Show>
        <Show when={design() === "strip"}>
          <Cover class="sm" />
          <div class="mu-body">
            <div class="mu-line">
              <Eq />
              <Marquee
                class="mu-title"
                text={[st().title || t("Bilinmeyen parça"), st().artist].filter(Boolean).join(" — ")}
                on={o().marquee !== false && !previewFrozen()}
              />
            </div>
            <Show when={o().progress !== false && hasDur()}>
              <div class="mu-bar thin">
                <i style={{ width: `${pct()}%` }} />
              </div>
            </Show>
            <Volume />
          </div>
          <Buttons />
        </Show>
        <Show when={design() === "cover"}>
          <div class="mu-big">
            <Cover class="big" />
            <div class="mu-big-text">
              <Head />
              <Info />
            </div>
          </div>
          <Progress />
          <Volume />
          <Buttons />
        </Show>
        <Show when={design() === "text"}>
          <span class="mu-note">
            <Icon.Note />
          </span>
          <Marquee
            class="mu-title"
            text={[st().title || t("Bilinmeyen parça"), st().artist].filter(Boolean).join(" — ")}
            on={o().marquee !== false && !previewFrozen()}
          />
          <Eq />
        </Show>
      </div>
    </Show>
  );
}
