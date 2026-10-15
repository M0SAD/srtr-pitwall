// Sohbet mesajlarındaki bağlantılar: tıklanabilir bağlantı ve önizleme kartı (başlık, açıklama, görsel).
// Önizleme uygulamanın kendisinden indirilir (Rust: linkpreview.rs; yerel ağ adresleri önizlenmez).
// Ayar: "chat.linkPreview" (Arkadaşlar penceresi › sohbet menüsünden ya da burada kapatılabilir).

import { Show, createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { uiPref } from "@/sdk/settings";
import { openUrl } from "../ui";
import "../linkpreview.css";

export const [linkPreviewOn, setLinkPreviewOn] = uiPref<boolean>("chat.linkPreview", true);

// http(s)://… ya da www.… ; sondaki noktalama bağlantıya dahil edilmez
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}»”’])/gi;

export interface TextPart {
  text: string;
  url?: string;
}

/** Metni düz yazı ve bağlantı parçalarına ayır */
export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    const raw = m[1];
    out.push({ text: raw, url: raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw });
    last = i + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function firstLink(text: string): string | null {
  return splitLinks(text).find((p) => p.url)?.url ?? null;
}

interface Preview {
  url: string;
  kind: "page" | "image";
  site: string;
  title: string;
  description: string;
  image: string;
}

const IMG_RE = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;
const cache = new Map<string, Promise<Preview | null>>();

function load(url: string): Promise<Preview | null> {
  let p = cache.get(url);
  if (!p) {
    p = IMG_RE.test(new URL(url).pathname) && url.startsWith("https://")
      ? Promise.resolve({ url, kind: "image", site: new URL(url).hostname, title: "", description: "", image: url } as Preview)
      : inTauri
        ? invoke<Preview | null>("link_preview", { url }).catch(() => null)
        : Promise.resolve(null);
    cache.set(url, p);
  }
  return p;
}

export function LinkA(props: { url: string; text: string }) {
  return (
    <a
      class="msg-link"
      href={props.url}
      title={props.url}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openUrl(props.url);
      }}
    >
      {props.text}
    </a>
  );
}

/** Mesajdaki ilk bağlantının önizleme kartı */
export function LinkPreview(props: { text: string }) {
  const url = () => (linkPreviewOn() ? firstLink(props.text) : null);
  const [p] = createResource(url, (u) => {
    try {
      return load(u);
    } catch {
      return null;
    }
  });
  return (
    <Show when={url() ? p() : null}>
      {(v) => (
        <Show
          when={v().kind === "page"}
          fallback={
            <button class="lp lp-img" onClick={(e) => (e.stopPropagation(), openUrl(v().url))} title={v().url}>
              <img src={v().image} alt="" loading="lazy" referrerpolicy="no-referrer" onError={(e) => (e.currentTarget.parentElement!.style.display = "none")} />
            </button>
          }
        >
          <button class="lp" onClick={(e) => (e.stopPropagation(), openUrl(v().url))} title={v().url}>
            <div class="lp-txt">
              <Show when={v().site}>
                <small class="lp-site">{v().site}</small>
              </Show>
              <Show when={v().title}>
                <b class="lp-title">{v().title}</b>
              </Show>
              <Show when={v().description}>
                <span class="lp-desc">{v().description}</span>
              </Show>
            </div>
            <Show when={v().image}>
              <img class="lp-thumb" src={v().image} alt="" loading="lazy" referrerpolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
            </Show>
          </button>
        </Show>
      )}
    </Show>
  );
}
