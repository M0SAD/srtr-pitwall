import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
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

  const url = () => {
    const u = String(props.options.url ?? "").trim();
    return /^https?:\/\//i.test(u) ? embedUrl(u) : "";
  };
  // YouTube oynatıcısı yönlendiren adresi (Referer) ister; diğer sitelerde gönderilmez
  const refPolicy = () => (/youtube(-nocookie)?\.com\/embed\//.test(url()) ? "strict-origin-when-cross-origin" : "no-referrer");

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
        {/* nonce değişince iframe yeniden yüklenir */}
        <Show when={nonce() >= 0} keyed>
          <iframe src={url()} title="Webview" loading="lazy" referrerpolicy={refPolicy()} allow={ALLOW} data-no-i18n />
        </Show>
      </Show>
      {/* Düzenleme modunda iframe fareyi yutmasın diye üstüne şeffaf katman */}
      <Show when={props.editing}>
        <div class="webv-shield" />
      </Show>
    </div>
  );
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
