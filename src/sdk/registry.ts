// Overlay keşif sistemi.
//
// src/overlays/ altındaki her klasör bir overlay'dir:
//   src/overlays/<id>/manifest.ts   -> ad, açıklama, veri konuları, ayar şeması
//   src/overlays/<id>/Overlay.tsx   -> görünüm
// Yeni klasör eklemek yeterli; kontrol paneli ve overlay penceresi onu otomatik bulur.
// Adı "_" ile başlayan klasörler (ör. _template) yok sayılır.

import type { OverlayComponent, OverlayManifest } from "./overlay";

const manifestModules = import.meta.glob<{ default: OverlayManifest }>(
  ["../overlays/*/manifest.ts", "!../overlays/_*/manifest.ts"],
  { eager: true },
);

// Görünümler tembel yüklenir: kapalı overlay'lerin kodu hiç yüklenmez.
const componentModules = import.meta.glob<{ default: OverlayComponent }>([
  "../overlays/*/Overlay.tsx",
  "!../overlays/_*/Overlay.tsx",
]);

function folderOf(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2];
}

const order: Record<string, number> = { race: 0, driving: 1, info: 2 };

export const manifests: OverlayManifest[] = Object.entries(manifestModules)
  .filter(([path]) => !folderOf(path).startsWith("_"))
  .map(([path, mod]) => {
    const folder = folderOf(path);
    if (mod.default.id !== folder) {
      console.warn(`[overlay] "${folder}" klasöründeki manifest id'si "${mod.default.id}". Klasör adı kullanılıyor.`);
      return { ...mod.default, id: folder };
    }
    return mod.default;
  })
  // Aynı id iki kez gelirse (ör. kopyalanıp id'si değiştirilmemiş klasör) sadece ilki kullanılır
  .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
  .sort((a, b) => order[a.category] - order[b.category] || a.name.localeCompare(b.name, "tr"));

export function manifestById(id: string): OverlayManifest | undefined {
  return manifests.find((m) => m.id === id);
}

export function loadComponent(id: string): (() => Promise<{ default: OverlayComponent }>) | undefined {
  const key = `../overlays/${id}/Overlay.tsx`;
  return componentModules[key];
}
