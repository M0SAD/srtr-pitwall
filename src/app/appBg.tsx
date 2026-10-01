// Uygulama arka planı (Ayarlar → Görünüm → Uygulama arka planı): panelin arkasında hazır degrade ya da
// kendi görselin (karartma + bulanıklık). Paneller yarı saydam olur, yazılar okunur kalır.
// İstenirse görsel overlay panellerinin arkasında da (soluk) gösterilir: görsel pencere başına bir kez
// okunur, saydamlığı önceden işlenmiş tek bir WebP olarak tüm overlay'lerde ortak kullanılır.

import { Show, createEffect, createRoot, createSignal, on } from "solid-js";
import { DEFAULT_APP_BG, settings, updateSettings, type AppBg } from "@/sdk/settings";
import { bgFileUrl, clearBgFile, fadedImage, saveBgFile, shrinkToJpeg } from "@/sdk/bgfile";
import { gradientCss } from "./chatLook";
import "./appbg.css";

export function appBg(): AppBg {
  return settings().general.appBg ?? DEFAULT_APP_BG;
}

// ---- Görsel (pencere başına bir kez, imgRev değişince yeniden) ----
const [imgUrl, setImgUrl] = createSignal<string | null>(null);
let imgStarted = false;
function ensureImg() {
  if (imgStarted) return;
  imgStarted = true;
  let token = 0;
  createRoot(() =>
    createEffect(
      on(
        () => {
          const b = appBg();
          return [b.hasImg && (b.kind === "image" || b.overlays), b.imgRev] as const;
        },
        async ([want, rev]) => {
          const my = ++token;
          if (!want) return setImgUrl(null);
          const u = await bgFileUrl("app", rev);
          if (my === token) setImgUrl(u);
        },
      ),
    ),
  );
}

export function appBgImageUrl() {
  ensureImg();
  return imgUrl();
}

/** Panel kabuğunun arkasındaki katman (`.shell2` içinde ilk öğe) */
export function AppBgLayer() {
  const b = appBg;
  const on_ = () => b().kind === "gradient" || (b().kind === "image" && !!appBgImageUrl());
  return (
    <Show when={on_()}>
      <div class="appbg-layer" aria-hidden="true">
        <i
          classList={{ img: b().kind === "image" }}
          style={
            b().kind === "image"
              ? { "background-image": `url("${appBgImageUrl()}")`, filter: b().blur > 0 ? `blur(${Math.min(30, b().blur)}px)` : undefined }
              : { background: gradientCss(b().gradient) }
          }
        />
        <b style={{ opacity: Math.max(0, Math.min(85, b().dim)) / 100 }} />
      </div>
    </Show>
  );
}

/** Kabukta arka plan var mı (paneller yarı saydam olsun) */
export function appBgActive() {
  const b = appBg();
  return b.kind === "gradient" || (b.kind === "image" && !!appBgImageUrl());
}

// ---- Overlay'ler: soluk görsel (tek WebP, tema arka plan opaklığıyla çarpılmış) ----
const [ovUrl, setOvUrl] = createSignal<string | null>(null);
let ovStarted = false;
/** Overlay panellerinin arkasındaki görselin adresi (kapalıysa null) */
export function overlayBgUrl(): string | null {
  if (!ovStarted) {
    ovStarted = true;
    let token = 0;
    let cur: string | null = null;
    createRoot(() =>
      createEffect(
        on(
          () => {
            const b = appBg();
            const src = b.overlays && b.kind === "image" ? appBgImageUrl() : null;
            // Overlay'in kendi arka plan opaklığına saygı: tema opaklığıyla çarpılır (saydam overlay'de görünmez)
            const alpha = (Math.max(5, Math.min(60, b.overlayOpacity)) / 100) * (settings().theme.bgOpacity / 100);
            return [src, Math.round(alpha * 100) / 100] as const;
          },
          async ([src, alpha]) => {
            const my = ++token;
            const next = src && alpha > 0.01 ? await fadedImage(src, alpha) : null;
            if (my !== token) {
              if (next) URL.revokeObjectURL(next);
              return;
            }
            if (cur) URL.revokeObjectURL(cur);
            cur = next;
            setOvUrl(next);
          },
        ),
      ),
    );
  }
  return ovUrl();
}

// ---- Görsel seçme ----
export async function importAppBg(file: File) {
  const blob = await shrinkToJpeg(file);
  await saveBgFile("app", blob);
  updateSettings((d) => {
    const b = d.general.appBg;
    b.hasImg = true;
    b.kind = "image";
    b.imgRev = (b.imgRev || 0) + 1;
  });
}

export async function clearAppBg() {
  await clearBgFile("app");
  updateSettings((d) => {
    const b = d.general.appBg;
    b.hasImg = false;
    if (b.kind === "image") b.kind = "none";
    b.imgRev = (b.imgRev || 0) + 1;
  });
}
