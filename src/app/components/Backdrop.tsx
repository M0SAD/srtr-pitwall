// Önizleme arka planları: overlay'lerin oyun üstünde nasıl duracağını gösteren çizimler.
// Kullanıcı kendi ekran görüntüsünü de seçebilir (bu bilgisayarda saklanır).
// Yönetici (Yönetim › Overlay önizleme arka planları) hazır görselleri değiştirebilir ve varsayılanı seçer
// (app_config.preview_backdrops). Arka plan seçmemiş kullanıcı yöneticinin varsayılanını görür. Yöneticinin
// görselleri bu bilgisayarda saklanır (IndexedDB); indirilemezse programla gelen görsel kullanılır.

import { Match, Switch, createResource, createRoot, createSignal } from "solid-js";
import { config } from "@/cloud/account";
import { ShotPicker } from "./Shots";
import { invoke } from "@tauri-apps/api/core";
// 3B olarak üretilmiş arka planlar (scripts/backdrops ile yeniden üretilebilir)
import dayImg from "@/assets/backdrops/day.jpg";
import nightImg from "@/assets/backdrops/night.jpg";
import cockpitImg from "@/assets/backdrops/cockpit.jpg";

export type BackdropId = "track" | "night" | "cockpit" | "plain" | "custom";

export const BACKDROPS: { id: BackdropId; name: string }[] = [
  { id: "track", name: "Pist (gündüz)" },
  { id: "night", name: "Pist (gece)" },
  { id: "cockpit", name: "Kokpit" },
  { id: "plain", name: "Düz" },
  { id: "custom", name: "Kendi görselim" },
];

const KEY = "pitwall.backdrop";
const KEY_IMG = "pitwall.backdropImage";

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}

export interface PreviewBackdrops {
  default?: Exclude<BackdropId, "custom">;
  images?: Partial<Record<"track" | "night" | "cockpit", string>>;
}
/** Yöneticinin arka plan ayarı */
export const previewBackdrops = (): PreviewBackdrops => ((config() as { preview_backdrops?: PreviewBackdrops } | null)?.preview_backdrops ?? {}) || {};

/** Kullanıcının kendi seçimi (yoksa null: yöneticinin varsayılanı) */
const [userBackdrop, setBackdropSig] = createSignal<BackdropId | null>(load<BackdropId | null>(KEY, null));
const [customImage, setCustomImageSig] = createSignal<string>(load<string>(KEY_IMG, ""));
/** Geçerli arka plan: kullanıcının seçimi > yöneticinin varsayılanı > pist (gündüz) */
export const backdrop = (): BackdropId => {
  const u = userBackdrop();
  if (u) return u;
  const d = previewBackdrops().default;
  return d && BACKDROPS.some((b) => b.id === d) ? d : "track";
};
export { customImage };

export function setBackdrop(b: BackdropId) {
  setBackdropSig(b);
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* depolama yok */
  }
}

export function setCustomImage(url: string) {
  setCustomImageSig(url);
  try {
    localStorage.setItem(KEY_IMG, JSON.stringify(url));
  } catch {
    /* çok büyükse saklanamaz; oturum boyunca kalır */
  }
}

/** Seçilen görseli ekran genişliğine küçültüp saklar */
export function pickCustomImage(file: File) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const w = Math.min(1600, img.width);
    const h = Math.round((img.height / img.width) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    setCustomImage(c.toDataURL("image/jpeg", 0.82));
    setBackdrop("custom");
  };
  img.src = url;
}

/** Programla gelen görseller (çevrimdışı yedek) */
export const BUNDLED_BACKDROPS: Partial<Record<BackdropId, string>> = { track: dayImg, night: nightImg, cockpit: cockpitImg };
const IMAGES = BUNDLED_BACKDROPS;

// ---------------------------------------------------------------------------
// Yöneticinin görselleri: adres başına bir kez indirilir, IndexedDB'de saklanır
// ---------------------------------------------------------------------------
const DB = "pitwall-cache";
const STORE = "img";
function idb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}
async function idbGet(key: string): Promise<Blob | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res((r.result as Blob) ?? null);
      r.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}
async function idbPut(key: string, v: Blob) {
  const db = await idb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    // Sadece arka planlar tutulur: eski adresler silinir
    const keys = st.getAllKeys();
    keys.onsuccess = () => {
      for (const k of keys.result) if (String(k).includes("/backdrops/") && k !== key) st.delete(k);
      st.put(v, key);
    };
  } catch {
    /* depolama yok */
  }
}
const blobUrls = new Map<string, string>();
/** Uzak görseli yerel kopyasından verir (yoksa indirir, saklar); olmazsa null */
export async function cachedImage(url: string): Promise<string | null> {
  if (!url) return null;
  const hit = blobUrls.get(url);
  if (hit) return hit;
  let blob = await idbGet(url);
  if (!blob) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      blob = await res.blob();
      if (!blob.type.startsWith("image/")) return null;
      void idbPut(url, blob);
    } catch {
      return null;
    }
  }
  const u = URL.createObjectURL(blob);
  blobUrls.set(url, u);
  return u;
}

const remoteOf = (id: BackdropId) => (id === "track" || id === "night" || id === "cockpit" ? (previewBackdrops().images?.[id] ?? "") : "");
const [remoteImg] = createRoot(() =>
  createResource(
    () => remoteOf(backdrop()) || false,
    (url) => cachedImage(url),
  ),
);
/** Hazır arka planın görseli: yöneticininki (yerel kopya) ya da programla gelen */
export const backdropImage = (id: BackdropId): string | undefined => {
  if (remoteOf(id) && id === backdrop()) {
    const r = remoteImg.loading ? undefined : remoteImg();
    if (r) return r;
  }
  return IMAGES[id];
};

/** iRacing ekran görüntüsünü (bayt dizisi) küçültüp arka plan yapar */
export function useScreenshotBytes(bytes: ArrayBuffer, type = "image/jpeg") {
  pickCustomImage(new File([bytes], "shot", { type }));
}

export function Backdrop() {
  return (
    <div class="backdrop">
      <Switch fallback={<img class="backdrop-img" src={dayImg} alt="" />}>
        <Match when={backdrop() === "plain"}>
          <div class="backdrop-plain" />
        </Match>
        <Match when={backdrop() === "custom" && customImage()}>
          <img class="backdrop-img" src={customImage()} alt="" />
        </Match>
        <Match when={backdropImage(backdrop())}>
          <img
            class="backdrop-img"
            src={backdropImage(backdrop())}
            alt=""
            onError={(e) => {
              const b = IMAGES[backdrop()];
              if (b && e.currentTarget.src !== b) e.currentTarget.src = b;
            }}
          />
        </Match>
      </Switch>
    </div>
  );
}

/** Ekran görüntülerinden (SRTR Pitwall + iRacing) birini önizleme arka planı yapar */
export function ScreenshotPicker(props: { onClose: () => void }) {
  return (
    <ShotPicker
      title="Önizleme arka planı seç"
      onClose={props.onClose}
      onPick={async (s) => {
        const buf = await invoke<ArrayBuffer>("shot_read", { path: s.path });
        const type = /\.png$/i.test(s.name) ? "image/png" : /\.bmp$/i.test(s.name) ? "image/bmp" : "image/jpeg";
        useScreenshotBytes(buf, type);
      }}
    />
  );
}
