// Ekran görüntüsü filigranı. Yönetici panelinden ayarlanır (app_config.watermark).
// Filigran burada canvas ile çizilir (her dilde, her yazı tipinde aynı görünsün diye) ve
// PNG olarak Rust'a gönderilir; Rust görüntünün yüksekliğine göre ölçekleyip bindirir.

import { invoke } from "@tauri-apps/api/core";
import appLogo from "@/assets/logo.png";
import { inTauri } from "./platform";

export type WmPosition = "tl" | "tr" | "bl" | "br" | "bc" | "center";

export interface WatermarkCfg {
  enabled: boolean;
  /** {user}: görüntüyü çeken/paylaşan kullanıcının adı */
  text: string;
  logo: "none" | "app" | "custom";
  logo_url: string;
  position: WmPosition;
  /** 0–100 */
  opacity: number;
  /** Yazı yüksekliği, ekran yüksekliğinin yüzdesi */
  size: number;
  color: string;
  shadow: boolean;
}

export const DEFAULT_WATERMARK: WatermarkCfg = {
  enabled: true,
  text: "SRTR Pitwall · {user}",
  logo: "app",
  logo_url: "",
  position: "br",
  opacity: 85,
  size: 2.2,
  color: "#ffffff",
  shadow: true,
};

export const WM_POSITIONS: { id: WmPosition; name: string }[] = [
  { id: "br", name: "Sağ alt" },
  { id: "bl", name: "Sol alt" },
  { id: "bc", name: "Alt orta" },
  { id: "tr", name: "Sağ üst" },
  { id: "tl", name: "Sol üst" },
  { id: "center", name: "Orta" },
];

/** Filigranın çizildiği referans ekran yüksekliği (Rust tarafıyla aynı) */
export const WM_REF_H = 2160;
/** Kenar boşluğu: ekran yüksekliğinin oranı */
export const WM_MARGIN = 0.02;

export function normalizeWatermark(v: Partial<WatermarkCfg> | null | undefined): WatermarkCfg {
  return { ...DEFAULT_WATERMARK, ...(v ?? {}) };
}

function loadTag(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => res(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/**
 * Görseli canvas'a çizilebilir (CORS'a takılmayan) biçimde yükler. Uzak adreslerde `<img crossorigin>` başarısız
 * olursa (önbellekteki CORS'suz yanıt, depolama başlığı eksik…) dosya fetch ile indirilip blob adresinden açılır;
 * yoksa logo sessizce atlanıyor ya da canvas "kirlenip" filigran hiç gönderilemiyordu.
 */
async function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  const remote = /^https?:/i.test(src);
  const direct = await loadTag(src, remote);
  if (direct || !remote) return direct;
  try {
    const res = await fetch(src, { cache: "reload" });
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    const img = await loadTag(url, false);
    // Blob adresi görsel çizilene kadar yaşamalı: biraz sonra bırak
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return img;
  } catch {
    return null;
  }
}

/** Filigran logosunun saklandığı en büyük yükseklik (en büyük boyutta 2160p'de ~195 px çizilir) */
const WM_LOGO_MAX_H = 256;
const WM_LOGO_MAX_W = 1024;

/**
 * Seçilen logo dosyasını (PNG / WebP / JPEG; saydamlık korunur) küçültüp PNG veri adresine çevirir. Logo ayarın
 * içinde (`logo_url` = data:image/png;base64,…) saklanır: depolama kovası, dosya boyutu sınırı, CORS ve çevrimdışı
 * açılış sorunlarından etkilenmez.
 */
export async function logoDataUrl(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadTag(url, false);
    if (!img) throw new Error("Görsel okunamadı (PNG, WebP ya da JPEG seç)");
    const k = Math.min(1, WM_LOGO_MAX_H / img.naturalHeight, WM_LOGO_MAX_W / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ayarda bir logo isteniyor mu (uygulama logosu ya da yüklenmiş özel logo) */
function wantsLogo(cfg: WatermarkCfg) {
  return cfg.logo === "app" || (cfg.logo === "custom" && !!cfg.logo_url);
}

export function watermarkText(cfg: WatermarkCfg, user: string) {
  return cfg.text
    .replace(/\{user\}/g, user.trim())
    .replace(/\s*[·|•–—-]\s*$/, "")
    .replace(/^\s*[·|•–—-]\s*/, "")
    .trim();
}

/** Filigranı referans yüksekliğe göre çizer (boşsa null). `info.logoFailed`: logo isteniyordu ama yüklenemedi. */
export async function renderWatermark(cfg: WatermarkCfg, user: string, refH = WM_REF_H, info?: { logoFailed?: boolean }): Promise<HTMLCanvasElement | null> {
  if (!cfg.enabled) return null;
  const text = watermarkText(cfg, user);
  const logo = cfg.logo === "app" ? await loadImg(appLogo) : cfg.logo === "custom" && cfg.logo_url ? await loadImg(cfg.logo_url) : null;
  if (info) info.logoFailed = wantsLogo(cfg) && !logo;
  if (!text && !logo) return null;
  const fs = Math.max(6, (refH * cfg.size) / 100);
  const font = `700 ${fs}px Rajdhani, Inter, "Segoe UI", "Noto Sans", "Microsoft YaHei", "Yu Gothic", sans-serif`;
  try {
    await document.fonts?.load(font, text || "A");
  } catch {
    /* sistem yazı tipi kullanılır */
  }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const tw = text ? Math.ceil(ctx.measureText(text).width) : 0;
  const lh = logo ? Math.round(fs * 1.5) : 0;
  const lw = logo ? Math.max(1, Math.round(((logo.naturalWidth || logo.width) * lh) / Math.max(1, logo.naturalHeight || logo.height))) : 0;
  const gap = logo && text ? Math.round(fs * 0.4) : 0;
  const pad = cfg.shadow ? Math.ceil(fs * 0.4) : 2;
  c.width = lw + gap + tw + pad * 2;
  c.height = Math.max(lh, Math.ceil(fs * 1.25)) + pad * 2;
  ctx.globalAlpha = Math.max(0, Math.min(100, cfg.opacity)) / 100;
  if (cfg.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = fs * 0.25;
    ctx.shadowOffsetY = fs * 0.05;
  }
  if (logo) ctx.drawImage(logo, pad, (c.height - lh) / 2, lw, lh);
  if (text) {
    ctx.font = font;
    ctx.fillStyle = cfg.color || "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, pad + lw + gap, c.height / 2 + fs * 0.04);
  }
  return c;
}

/** Arka plan görselinin üstüne filigranı Rust ile aynı kuralla yerleştirir (önizleme) */
export async function composePreview(bg: string, cfg: WatermarkCfg, user: string, h = 540): Promise<string> {
  const img = await loadImg(bg);
  const w = img ? Math.round((img.width * h) / img.height) : Math.round((h * 16) / 9);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (img) ctx.drawImage(img, 0, 0, w, h);
  else {
    ctx.fillStyle = "#1a1e26";
    ctx.fillRect(0, 0, w, h);
  }
  const wm = await renderWatermark(cfg, user);
  if (wm) {
    const s = h / WM_REF_H;
    const ww = wm.width * s;
    const wh = wm.height * s;
    const m = WM_MARGIN * h;
    const pos: Record<WmPosition, [number, number]> = {
      tl: [m, m],
      tr: [w - ww - m, m],
      bl: [m, h - wh - m],
      br: [w - ww - m, h - wh - m],
      bc: [(w - ww) / 2, h - wh - m],
      center: [(w - ww) / 2, (h - wh) / 2],
    };
    const [x, y] = pos[cfg.position] ?? pos.br;
    ctx.drawImage(wm, Math.max(0, x), Math.max(0, y), ww, wh);
  }
  return c.toDataURL("image/jpeg", 0.9);
}

let lastSync = "";
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;

/** Filigranı Rust'a gönderir (değişmediyse göndermez). Logo yüklenemediyse yazı yine gönderilir ve sonra yeniden denenir. */
export async function syncWatermark(cfg: WatermarkCfg, user: string) {
  if (!inTauri) return;
  const key = JSON.stringify([cfg, user]);
  if (key === lastSync) return;
  lastSync = key;
  clearTimeout(retryTimer);
  try {
    const info: { logoFailed?: boolean } = {};
    const c = await renderWatermark(cfg, user, WM_REF_H, info);
    // Bu arada daha yeni bir ayar geldiyse eskisini gönderme (sıra karışmasın)
    if (lastSync !== key) return;
    const png = c ? c.toDataURL("image/png").split(",")[1] : null;
    await invoke("watermark_set", { enabled: !!c, png, pos: cfg.position, margin: WM_MARGIN });
    if (info.logoFailed) {
      // Logo indirilemedi (çevrimdışı / geçici hata): logosuz gönderildi, birazdan logoyla yeniden dene
      console.warn("filigran: logo yüklenemedi, yeniden denenecek");
      if (lastSync === key) lastSync = "";
      if (retries < 6) {
        retries++;
        retryTimer = setTimeout(() => void syncWatermark(cfg, user), 20_000 * retries);
      }
    } else {
      retries = 0;
    }
  } catch (e) {
    if (lastSync === key) lastSync = "";
    console.warn("filigran", e);
  }
}
