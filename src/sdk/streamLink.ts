// Yayın düzenleri ↔ normal düzenler: kopyalama, bağlama (canlı izleme) ve çözünürlük ölçekleme.
//
// Normal düzenlerde konumlar monitörün mantıksal pikselleriyle, yayın düzenlerinde tuval (OBS tarayıcı
// kaynağı) pikselleriyle saklanır. Buradaki fonksiyonlar bir düzeni kaynak ekran boyutundan yayın
// çözünürlüğüne ORANTILI olarak taşır: overlay ekranın hangi bölgesindeyse (sol/orta/sağ · üst/orta/alt)
// o kenara/ortaya göre sabitlenir, boyutu da aynı oranda ölçeklenir.

import { createSignal } from "solid-js";
import { anchorOf } from "@/host/snap";
import { manifestById } from "./registry";
import { monitorOf, monitors } from "./monitors";
import { newProfile, resolveProfile, settings, updateSettings, type AppSettings, type OverlayInstance, type Profile } from "./settings";
import type { Status } from "./types";

export interface Size {
  w: number;
  h: number;
}

/** Bağlı yayın düzeninde "uygulamada o an etkin düzen" */
export const LINK_ACTIVE = "@active";
export const DEFAULT_CANVAS: Size = { w: 1920, h: 1080 };
export const RESOLUTIONS: Size[] = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
];

/** Yayın sayfasında açılacak yayın düzeni (Düzenler sayfasından "Yayın düzenine kopyala") */
export const [streamFocus, setStreamFocus] = createSignal<string | null>(null);

export const canvasOf = (p: Profile | undefined): Size => p?.canvas ?? DEFAULT_CANVAS;

/** Bir monitörün mantıksal boyutu. Uygulamada canlı monitör listesi, OBS sayfasında ayarlara yazılmış boyutlar. */
export function screenOf(monitor: string, s: AppSettings = settings()): Size {
  if (monitors().length) {
    const m = monitorOf(monitor);
    if (m) return { w: Math.round(m.width / m.scale), h: Math.round(m.height / m.scale) };
  }
  const sc = s.general.screens ?? {};
  const v = sc[monitor] ?? sc[""];
  return v && v.w > 0 && v.h > 0 ? v : DEFAULT_CANVAS;
}

/** Monitör boyutlarını ayarlara yazar (yalnız değiştiyse): tarayıcıdaki OBS sayfası monitörleri göremez. */
export function syncScreens() {
  const list = monitors();
  if (!list.length) return;
  const next: Record<string, Size> = { "": screenOf("") };
  for (const m of list) next[m.name] = { w: Math.round(m.width / m.scale), h: Math.round(m.height / m.scale) };
  if (JSON.stringify(settings().general.screens ?? null) === JSON.stringify(next)) return;
  updateSettings((d) => (d.general.screens = next));
}

/** Bir kopyayı `from` boyutundaki ekrandan `to` boyutundaki tuvale orantılı taşır. */
export function mapInstance(inst: OverlayInstance, from: Size, to: Size, scaleSizes = true): OverlayInstance {
  if (from.w === to.w && from.h === to.h) return inst;
  const fx = to.w / from.w;
  const fy = to.h / from.h;
  const f = scaleSizes ? Math.min(fx, fy) : 1;
  const m = manifestById(inst.type);
  // Gerçek boyut ancak çizilince bilinir; çapa için manifestteki yaklaşık boyut yeterli
  const w = (m?.size.w ?? 200) * inst.scale;
  const h = (m?.size.h ?? 100) * inst.scale;
  const { ax, ay } = anchorOf({ x: inst.x, y: inst.y, w, h }, from);
  return {
    ...inst,
    x: Math.round((inst.x + ax * w) * fx - ax * w * f),
    y: Math.round((inst.y + ay * h) * fy - ay * h * f),
    scale: Math.max(0.2, Math.round(inst.scale * f * 1000) / 1000),
  };
}

/** Kaynak düzenin overlay'lerini yayın tuvaline taşınmış olarak üretir (gizlenenler kapalı gelir). */
function mappedOverlays(src: Profile, canvas: Size, hidden: string[], s: AppSettings, clone: boolean): Record<string, OverlayInstance> {
  const out: Record<string, OverlayInstance> = {};
  for (const [k, i] of Object.entries(src.overlays)) {
    const base = clone ? structuredClone(i) : i;
    out[k] = i.enabled ? { ...mapInstance(base, screenOf(i.monitor, s), canvas), monitor: "", enabled: !hidden.includes(k) } : { ...base, monitor: "" };
  }
  return out;
}

/** Bağlı yayın düzeninin şu an izlediği düzen (yoksa undefined) */
export function linkSource(p: Profile | undefined, st?: Status, s: AppSettings = settings()): Profile | undefined {
  if (!p?.link || p.rules.mode !== "stream") return undefined;
  const src = p.link.source === LINK_ACTIVE ? resolveProfile(st, false) : s.profiles[p.link.source];
  return src && src.rules.mode !== "stream" ? src : undefined;
}

// Aynı girdiler için aynı nesne dönsün (overlay penceresi her durum güncellemesinde yeniden çizmesin)
const cache = new Map<string, { stream: Profile; src: Profile; mons: unknown; screens: unknown; out: Profile }>();

/**
 * Gösterilecek düzen: bağlı yayın düzeniyse kaynak düzenin açık overlay'leri yayın çözünürlüğüne
 * oranlanmış hâliyle; değilse düzenin kendisi.
 */
export function liveProfile<T extends Profile | undefined>(p: T, st?: Status): T {
  const src = linkSource(p, st);
  if (!p || !src) return p;
  const s = settings();
  const mons = monitors();
  const c = cache.get(p.id);
  if (c && c.stream === p && c.src === src && c.mons === mons && c.screens === s.general.screens) return c.out as T;
  const out: Profile = { ...p, overlays: mappedOverlays(src, canvasOf(p), p.link!.hidden, s, false) };
  cache.set(p.id, { stream: p, src, mons, screens: s.general.screens, out });
  return out as T;
}

/** Bağlı yayın düzeninin bağımsız (bağlantısız) kopyası: toplulukta paylaşım ve "Bağlantıyı kopar" için. */
export function independentProfile(p: Profile, st?: Status): Profile {
  const src = linkSource(p, st);
  const out = structuredClone({ ...p, overlays: src ? mappedOverlays(src, canvasOf(p), p.link!.hidden, settings(), false) : p.overlays });
  delete out.link;
  return out;
}

/**
 * Bir düzeni yayın düzenine kopyalar: açık tüm overlay'ler aynı ayar, boyut ve saydamlıkla, konumları
 * kaynak monitörden yayın çözünürlüğüne oranlanarak. `replaceId` verilirse o yayın düzeninin üzerine yazar.
 */
export function copyLayoutToStream(srcId: string, opts: { name?: string; canvas?: Size; replaceId?: string } = {}): string {
  const id = opts.replaceId ?? `p${Date.now().toString(36)}`;
  updateSettings((d) => {
    const src = d.profiles[srcId];
    if (!src) return;
    const p = d.profiles[id] ?? newProfile(id, opts.name ?? src.name);
    const canvas = opts.canvas ?? p.canvas ?? DEFAULT_CANVAS;
    p.id = id;
    if (opts.name) p.name = opts.name;
    p.rules = { mode: "stream", cars: [], sessions: [] };
    p.canvas = { ...canvas };
    p.overlays = mappedOverlays(src, canvas, [], d, true);
    delete p.link;
    d.profiles[id] = p;
  });
  return id;
}

/** Bağlı yayın düzenini o anki görünümüyle bağımsız kopyaya çevirir. */
export function unlinkStream(id: string, st?: Status) {
  const p = settings().profiles[id];
  if (!p?.link) return;
  const ind = independentProfile(p, st);
  updateSettings((d) => (d.profiles[id] = ind));
}

/** Yayın çözünürlüğünü değiştirir; `rescale` ise konumlar (ve `scaleSizes` ise overlay boyutları) orantılı taşınır. */
export function setStreamCanvas(id: string, to: Size, rescale: boolean, scaleSizes: boolean) {
  updateSettings((d) => {
    const p = d.profiles[id];
    if (!p) return;
    const from = p.canvas ?? DEFAULT_CANVAS;
    if (rescale && !p.link) for (const [k, i] of Object.entries(p.overlays)) if (i.enabled) p.overlays[k] = mapInstance(i, from, to, scaleSizes);
    p.canvas = { w: to.w, h: to.h };
  });
}
