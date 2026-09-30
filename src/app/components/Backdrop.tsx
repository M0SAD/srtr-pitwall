// Önizleme arka planları: overlay'lerin oyun üstünde nasıl duracağını gösteren çizimler.
// Kullanıcı kendi ekran görüntüsünü de seçebilir (bu bilgisayarda saklanır).

import { Match, Switch, createSignal } from "solid-js";
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

const [backdrop, setBackdropSig] = createSignal<BackdropId>(load<BackdropId>(KEY, "track"));
const [customImage, setCustomImageSig] = createSignal<string>(load<string>(KEY_IMG, ""));
export { backdrop, customImage };

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

const IMAGES: Partial<Record<BackdropId, string>> = { track: dayImg, night: nightImg, cockpit: cockpitImg };

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
        <Match when={IMAGES[backdrop()]}>
          <img class="backdrop-img" src={IMAGES[backdrop()]} alt="" />
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
