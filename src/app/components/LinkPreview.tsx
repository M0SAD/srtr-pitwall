// Sohbet mesajlarındaki bağlantılar: tıklanabilir bağlantı ve önizleme kartı (başlık, açıklama, görsel).
// Önizleme uygulamanın kendisinden indirilir (Rust: linkpreview.rs; yerel ağ adresleri önizlenmez).
// Ayar: "chat.linkPreview" (Arkadaşlar penceresi › sohbet menüsünden ya da burada kapatılabilir).

import { Show, createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { uiPref } from "@/sdk/settings";
import { openUrl } from "../ui";
import { t } from "@/sdk/i18n";
import "../linkpreview.css";

export const [linkPreviewOn, setLinkPreviewOn] = uiPref<boolean>("chat.linkPreview", true);

// http(s)://… ya da www.… ; sondaki noktalama bağlantıya dahil edilmez
// "blob:https://…" bağlantıları hariç: tarayıcının kendi içindeki geçici adreslerdir, başkası açamaz
const URL_RE = /(?<!blob:)\b((?:https?:\/\/|www\.)[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}»”’])/gi;

/** Tarayıcı içi geçici adres (blob:…): bir sitedeki resim "kopyalanınca" bazen resim yerine bu yazı panoya gelir */
export const BLOB_RE = /\bblob:(?:https?:\/\/|null\/)\S*/i;

/**
 * Mesaj kutusu yapıştırma koruması: panoda yalnızca "blob:…" adresi varsa yapıştırılmaz, kutunun üstünde kısa bir
 * açıklama çıkar (bu adres yalnızca kopyalandığı tarayıcı sekmesinde çalışır; karşı taraf açamaz). true: engellendi.
 */
export function blobPasteGuard(e: ClipboardEvent): boolean {
  const txt = e.clipboardData?.getData("text/plain") ?? "";
  if (!BLOB_RE.test(txt)) return false;
  const rest = txt.replace(new RegExp(BLOB_RE.source, "gi"), "").trim();
  e.preventDefault();
  const el = e.currentTarget as HTMLTextAreaElement | HTMLInputElement | null;
  // Adres dışında yazı da varsa onu yapıştır
  if (rest && el) {
    const s = el.selectionStart ?? el.value.length;
    const en = el.selectionEnd ?? s;
    el.setRangeText(rest, s, en, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (el) blobWarn(el);
  return true;
}

function blobWarn(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const d = document.createElement("div");
  d.className = "blob-warn";
  d.textContent = t(
    "Bu bir resim değil, tarayıcının geçici resim adresi (blob:…): yalnızca senin tarayıcında çalışır, karşı taraf açamaz. Resmi bilgisayarına kaydedip paylaş ya da sitenin paylaşım bağlantısını gönder.",
  );
  d.style.left = `${Math.max(8, r.left)}px`;
  d.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`;
  d.style.maxWidth = `${Math.max(240, Math.min(460, r.width))}px`;
  document.body.appendChild(d);
  window.setTimeout(() => d.remove(), 7000);
  d.addEventListener("click", () => d.remove());
}

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
    p =
      IMG_RE.test(new URL(url).pathname) && url.startsWith("https://")
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
              <img
                src={v().image}
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
                onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
              />
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
              <img
                class="lp-thumb"
                src={v().image}
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </Show>
          </button>
        </Show>
      )}
    </Show>
  );
}
