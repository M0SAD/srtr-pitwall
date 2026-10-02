// Arka plan görselleri (uygulama arka planı ve sohbete özel arka planlar): seçilen dosya burada
// küçültülüp JPEG'e çevrilir (en fazla 1600 px ve ~600 KB), ayar klasörüne yazılır (Rust bg_file_*)
// ve pencere başına bir kez okunup blob adresi olarak önbellekte tutulur (her karede yeniden çözülmez).

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

export const BG_MAX_PX = 1600;
export const BG_MAX_BYTES = 600 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Görsel açılamadı."));
    i.src = src;
  });
}

/** Seçilen görseli en fazla `maxPx` kenara küçültür ve `maxBytes` altına inene kadar JPEG kalitesini düşürür */
export async function shrinkToJpeg(file: Blob, maxPx = BG_MAX_PX, maxBytes = BG_MAX_BYTES): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Sadece PNG, JPEG ya da WebP seçebilirsin.");
  if (file.size > 30 * 1024 * 1024) throw new Error("Dosya çok büyük (en fazla 30 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let side = maxPx;
    for (let attempt = 0; attempt < 4; attempt++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d")!;
      g.fillStyle = "#121419";
      g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.86, 0.78, 0.7, 0.6, 0.5]) {
        const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error("Görsel işlenemedi."))), "image/jpeg", q));
        if (b.size <= maxBytes) return b;
      }
      side = Math.round(side * 0.75);
    }
    throw new Error("Görsel küçültülemedi, daha küçük bir dosya dene.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** Yuva adı: "app" ya da "conv-<arkadaş id>" */
export const convSlot = (friendId: string) => `conv-${friendId.replace(/[^a-zA-Z0-9-]/g, "")}`;

// Yuva + sürüm → blob adresi (aynı pencerede bir kez okunur)
const cache = new Map<string, { rev: number; url: Promise<string | null> }>();

export async function saveBgFile(slot: string, blob: Blob) {
  if (!inTauri) throw new Error("Sadece masaüstü uygulamasında kullanılabilir.");
  await invoke("bg_file_import", { slot, data: await blobToBase64(blob) });
}

export async function clearBgFile(slot: string) {
  const c = cache.get(slot);
  cache.delete(slot);
  if (c) void c.url.then((u) => u && URL.revokeObjectURL(u));
  if (inTauri) await invoke("bg_file_clear", { slot }).catch(() => {});
}

/** Görseli okur (sürüm değişmedikçe önbellekten). Dosya yoksa null. */
export function bgFileUrl(slot: string, rev: number): Promise<string | null> {
  const c = cache.get(slot);
  if (c && c.rev === rev) return c.url;
  if (c) void c.url.then((u) => u && URL.revokeObjectURL(u));
  const url = !inTauri
    ? Promise.resolve(null)
    : invoke<ArrayBuffer>("bg_file_read", { slot })
        .then((buf) => URL.createObjectURL(new Blob([buf], { type: "image/jpeg" })))
        .catch(() => null);
  cache.set(slot, { rev, url });
  return url;
}

/** Kayıtlı görselin baytları (ör. arkadaşa önerirken yüklemek için) */
export async function readBgBlob(slot: string): Promise<Blob> {
  const buf = await invoke<ArrayBuffer>("bg_file_read", { slot });
  return new Blob([buf], { type: "image/jpeg" });
}

/** Görseli verilen saydamlıkla (0–1) önceden işlenmiş, en fazla `maxPx` kenarlı WebP olarak döner (overlay'ler için) */
export async function fadedImage(src: string, alpha: number, maxPx = 1024): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d")!;
    g.globalAlpha = Math.max(0, Math.min(1, alpha));
    g.drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.85));
    return b ? URL.createObjectURL(b) : null;
  } catch {
    return null;
  }
}
