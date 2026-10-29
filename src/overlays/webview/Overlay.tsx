import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { onScreen, type OverlayProps } from "@/sdk/overlay";
import { inTauri, query } from "@/sdk/platform";
import "./style.css";

/** Gömülü oynatıcının izinleri */
const ALLOW = ["autoplay", "encrypted-media", "picture-in-picture", "fullscreen"].join("; ");

export default function Webview(props: OverlayProps) {
  const [nonce, setNonce] = createSignal(0);
  let timer: number | undefined;

  createEffect(() => {
    clearInterval(timer);
    const s = props.options.reload as number;
    if (s > 0) timer = window.setInterval(() => setNonce((n) => n + 1), s * 1000);
  });
  onCleanup(() => clearInterval(timer));

  /**
   * Aynı overlay birden çok yerde çizilir (ekrandaki overlay penceresi, panel önizlemesi / düzen tuvali, VR penceresi,
   * OBS kaynağı). Her biri sayfayı ayrı yükleyince video sesi iki-üç kez duyuluyordu. Ses tek yerden gelir.
   */
  const where = (): "panel" | "vr" | "screen" | "obs" => {
    if (!onScreen()) return "panel";
    if (inTauri && query.get("vr")) return "vr";
    return inTauri ? "screen" : "obs";
  };
  const audible = () => {
    const s = String(props.options.sound ?? "screen");
    const w = where();
    if (w === "screen") return s === "screen" || s === "both";
    if (w === "obs") return s === "obs" || s === "both";
    return false;
  };
  const raw = () => {
    const u = String(props.options.url ?? "").trim();
    return /^https?:\/\//i.test(u) ? embedUrl(u) : "";
  };
  const url = () => withApi(audible() ? raw() : mutedUrl(raw()));
  // Panelde sessize alınamayan (bilinen oynatıcı olmayan) sayfa yüklenmez: önizleme kartı gösterilir
  const placeholder = () => where() === "panel" && !!raw() && !isPlayer(raw());
  // YouTube oynatıcısı yönlendiren adresi (Referer) ister; diğer sitelerde gönderilmez
  const refPolicy = () => (/youtube(-nocookie)?\.com\/embed\//.test(url()) ? "strict-origin-when-cross-origin" : "no-referrer");

  // ---- YouTube oynatıcısı denetimi (IFrame Player API, postMessage): durdur / oynat, sarma, ses
  let frame: HTMLIFrameElement | undefined;
  const [info, setInfo] = createSignal<YtInfo | null>(null);
  let infoAt = 0;
  const yt = () => isYouTube(url());
  const send = (func: string, args: unknown[] = []) => {
    try {
      frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }), "*");
    } catch {
      /* sayfa kapanmış */
    }
  };
  // Oynatıcı durum bilgisini göndersin diye "dinliyorum" denir (yüklenince ve bilgi gelene kadar aralıklarla)
  const hello = () => {
    try {
      frame?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
    } catch {
      /* yok */
    }
  };
  const helloIv = window.setInterval(() => yt() && Date.now() - infoAt > 3000 && hello(), 1000);
  onCleanup(() => clearInterval(helloIv));
  const onMsg = (e: MessageEvent) => {
    if (!frame || e.source !== frame.contentWindow || typeof e.data !== "string") return;
    let d: { event?: string; info?: Partial<YtInfo> | null };
    try {
      d = JSON.parse(e.data);
    } catch {
      return;
    }
    if ((d.event === "infoDelivery" || d.event === "initialDelivery") && d.info) {
      infoAt = Date.now();
      setInfo({ ...(info() ?? { currentTime: 0, duration: 0, volume: 100, muted: false, playerState: -1 }), ...d.info, at: infoAt } as YtInfo);
    }
  };
  window.addEventListener("message", onMsg);
  onCleanup(() => window.removeEventListener("message", onMsg));
  /** Şu anki konum (son bilgiden bu yana geçen süreyle) */
  const curTime = () => {
    const i = info();
    if (!i) return 0;
    return i.currentTime + (i.playerState === 1 ? (Date.now() - i.at) / 1000 : 0);
  };
  const [osd, setOsd] = createSignal("");
  let osdT = 0;
  const flash = (txt: string) => {
    if (props.options.osd === false) return;
    setOsd(txt);
    clearTimeout(osdT);
    osdT = window.setTimeout(() => setOsd(""), 1400);
  };
  onCleanup(() => clearTimeout(osdT));
  const step = () => Math.max(1, Number(props.options.seekStep) || 10);
  const vstep = () => Math.max(1, Number(props.options.volStep) || 10);
  const act = (a: "webPlay" | "webBack" | "webFwd" | "webVolUp" | "webVolDown" | "webMute") => {
    if (!yt()) return;
    const i = info();
    switch (a) {
      case "webPlay":
        if (i?.playerState === 1) {
          send("pauseVideo");
          flash("❚❚");
        } else {
          send("playVideo");
          flash("▶");
        }
        break;
      case "webBack":
      case "webFwd": {
        const d = a === "webFwd" ? step() : -step();
        const tt = Math.max(0, curTime() + d);
        send("seekTo", [i?.duration ? Math.min(i.duration - 1, tt) : tt, true]);
        if (i) setInfo({ ...i, currentTime: tt, at: Date.now() });
        flash(`${d > 0 ? "⏩ +" : "⏪ −"}${Math.abs(d)} sn`);
        break;
      }
      case "webVolUp":
      case "webVolDown": {
        const v = Math.max(0, Math.min(100, Math.round(((i?.volume ?? 100) + (a === "webVolUp" ? vstep() : -vstep())) / 5) * 5));
        send("setVolume", [v]);
        if (v > 0 && i?.muted) send("unMute");
        if (i) setInfo({ ...i, volume: v, muted: v === 0 ? i.muted : false });
        flash(`Ses %${v}`);
        break;
      }
      case "webMute":
        if (i?.muted) {
          send("unMute");
          flash(`Ses %${i?.volume ?? 100}`);
        } else {
          send("mute");
          flash("Ses kapalı");
        }
        if (i) setInfo({ ...i, muted: !i.muted });
        break;
    }
  };
  // Tuş / direksiyon düğmesi (Rust voicecmd.rs → "webview-key"); ekrandaki her kopya (VR / panel önizlemesi dahil) aynı
  // işlemi yapar, görüntüler birbirinden kopmaz
  onMount(() => {
    if (!inTauri || !onScreen()) return;
    const un = listen<string>("webview-key", (e) => act(e.payload as Parameters<typeof act>[0])).catch(() => null);
    onCleanup(() => void un.then((f) => f?.()));
  });
  const [tick, setTick] = createSignal(0);
  const tickIv = window.setInterval(() => props.editing && info()?.playerState === 1 && setTick((n) => n + 1), 500);
  onCleanup(() => clearInterval(tickIv));
  const pos = () => (tick(), curTime());
  const stop = (e: Event) => e.stopPropagation();

  return (
    <div
      class="webv"
      classList={{ solid: !props.options.transparent }}
      style={{ width: `${props.options.width}px`, height: `${props.options.height}px` }}
    >
      <Show
        when={url()}
        fallback={
          <div class="ov-panel ov-empty webv-empty">
            Ayarlardan bir adres gir
            <br />
            <small>(https://…)</small>
          </div>
        }
      >
        <Show
          when={!placeholder()}
          fallback={
            <div class="ov-panel ov-empty webv-empty">
              {hostOf(raw())}
              <br />
              <small>Sayfa ekrandaki overlay'de açılır (panelde iki kez ses çıkmasın diye yüklenmez)</small>
            </div>
          }
        >
          {/* nonce değişince iframe yeniden yüklenir */}
          <Show when={`${nonce()}|${url()}`} keyed>
            <iframe
              ref={(el) => {
                frame = el;
                setInfo(null);
              }}
              src={url()}
              title="Webview"
              loading="lazy"
              referrerpolicy={refPolicy()}
              allow={ALLOW}
              data-no-i18n
              onLoad={() => yt() && hello()}
            />
          </Show>
        </Show>
      </Show>
      {/* Düzenleme modunda iframe fareyi yutmasın diye üstüne şeffaf katman */}
      <Show when={osd()}>
        <div class="webv-osd">{osd()}</div>
      </Show>
      <Show when={props.editing}>
        <div class="webv-shield" />
      </Show>
      {/* Düzenleme modunda YouTube denetim çubuğu (tıklamalar overlay'i sürüklemesin) */}
      <Show when={props.editing && onScreen() && yt() && props.options.controls !== false}>
        <div class="webv-ctl" onPointerDown={stop} onMouseDown={stop} onClick={stop}>
          <button title="Geri sar" onClick={() => act("webBack")}>
            ⏪
          </button>
          <button title="Durdur / oynat" onClick={() => act("webPlay")}>
            {info()?.playerState === 1 ? "❚❚" : "▶"}
          </button>
          <button title="İleri sar" onClick={() => act("webFwd")}>
            ⏩
          </button>
          <span class="webv-time">{clock(pos())}</span>
          <input
            class="webv-seek"
            type="range"
            min={0}
            max={Math.max(1, Math.floor(info()?.duration ?? 0))}
            step={1}
            value={Math.floor(pos())}
            disabled={!info()?.duration}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              send("seekTo", [v, true]);
              const i = info();
              if (i) setInfo({ ...i, currentTime: v, at: Date.now() });
            }}
          />
          <span class="webv-time">{info()?.duration ? clock(info()!.duration) : "--:--"}</span>
          <button title="Sessize al / aç" onClick={() => act("webMute")}>
            {info()?.muted || info()?.volume === 0 ? "🔇" : "🔊"}
          </button>
          <input
            class="webv-vol"
            type="range"
            min={0}
            max={100}
            step={5}
            value={info()?.muted ? 0 : info()?.volume ?? 100}
            onInput={(e) => {
              const v = Number(e.currentTarget.value);
              send("setVolume", [v]);
              if (v > 0) send("unMute");
              const i = info();
              if (i) setInfo({ ...i, volume: v, muted: false });
            }}
          />
        </div>
      </Show>
    </div>
  );
}

interface YtInfo {
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  /** -1 başlamadı, 0 bitti, 1 oynuyor, 2 duraklatıldı, 3 yükleniyor, 5 hazır */
  playerState: number;
  /** Bilginin geldiği an (ms) */
  at: number;
}

const clock = (s: number) => {
  const x = Math.max(0, Math.floor(s));
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const ss = String(x % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export function isYouTube(u: string): boolean {
  return /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//i.test(u);
}

/** YouTube oynatıcısı dışarıdan denetlenebilsin (IFrame Player API): enablejsapi=1 ve sayfanın kaynağı */
export function withApi(u: string): string {
  if (!isYouTube(u)) return u;
  try {
    const x = new URL(u);
    x.searchParams.set("enablejsapi", "1");
    if (/^https?:/.test(location.origin)) x.searchParams.set("origin", location.origin);
    return x.toString();
  } catch {
    return u;
  }
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

/** Sessize alınabilen bilinen oynatıcı adresi mi (embedUrl çıktısı) */
export function isPlayer(u: string): boolean {
  return /^https:\/\/(www\.youtube(-nocookie)?\.com\/embed\/|player\.twitch\.tv\/|player\.kick\.com\/)/i.test(u);
}

/** Bilinen oynatıcıları sessiz başlatır (YouTube mute=1, Twitch muted=true, Kick muted=true). Diğer adresler aynen kalır. */
export function mutedUrl(u: string): string {
  if (!u || !isPlayer(u)) return u;
  let x: URL;
  try {
    x = new URL(u);
  } catch {
    return u;
  }
  if (/youtube/.test(x.hostname)) x.searchParams.set("mute", "1");
  else x.searchParams.set("muted", "true");
  return x.toString();
}

/**
 * Video sitelerinin normal sayfa adresleri başka sayfaya gömülemez (site engeller, iframe boş kalır).
 * Bilinen adresler oynatıcı (embed) adresine çevrilir:
 *   YouTube: watch?v=, youtu.be/, shorts/, live/, playlist → youtube.com/embed/…
 *   Twitch kanal → player.twitch.tv · Kick kanal → player.kick.com
 */
export function embedUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  const start = (() => {
    const t = u.searchParams.get("t") ?? u.searchParams.get("start");
    if (!t) return "";
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
    const sec = m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : Number(t);
    return sec > 0 ? `&start=${Math.floor(sec)}` : "";
  })();
  const yt = (id: string) => `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0${start}`;
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    if (id) return yt(id);
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname.startsWith("/embed/")) return raw;
    const v = u.searchParams.get("v");
    if (u.pathname === "/watch" && v) return yt(v);
    const m = /^\/(shorts|live)\/([\w-]+)/.exec(u.pathname);
    if (m) return yt(m[2]);
    const list = u.searchParams.get("list");
    if (list) return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1`;
  }
  if (host === "twitch.tv") {
    const ch = u.pathname.split("/").filter(Boolean)[0];
    if (ch && !["videos", "directory", "p"].includes(ch)) {
      const parent = location.hostname || "localhost";
      return `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(parent)}&muted=false`;
    }
  }
  if (host === "kick.com") {
    const ch = u.pathname.split("/").filter(Boolean)[0];
    if (ch) return `https://player.kick.com/${encodeURIComponent(ch)}`;
  }
  return raw;
}
