// Araç markası logoları.
//
// Marka logoları tescilli olduğu için uygulamayla gelmez. Kullanıcı logo dosyalarını
// uygulamanın "logos" klasörüne koyar (ör. porsche.png, aston-martin.svg). Burada iRacing'deki
// tam araç adından marka bulunur ve dosya adıyla eşleştirilir. Logo yoksa marka adı yazılır.

import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { apiBase, inTauri } from "./platform";

export interface Brand {
  /** Dosya adı önerisi: <id>.png / <id>.svg */
  id: string;
  name: string;
  /** Araç adında aranacak kelimeler (küçük harf) */
  match: string[];
}

// Sıra önemli: daha özel ifadeler önce ("aston martin" -> "martin" değil)
export const BRANDS: Brand[] = [
  { id: "acura", name: "Acura", match: ["acura"] },
  { id: "alfa-romeo", name: "Alfa Romeo", match: ["alfa romeo", "alfaromeo"] },
  { id: "alpine", name: "Alpine", match: ["alpine"] },
  { id: "aston-martin", name: "Aston Martin", match: ["aston martin", "aston"] },
  { id: "audi", name: "Audi", match: ["audi"] },
  { id: "bmw", name: "BMW", match: ["bmw"] },
  { id: "buick", name: "Buick", match: ["buick"] },
  { id: "cadillac", name: "Cadillac", match: ["cadillac"] },
  { id: "chevrolet", name: "Chevrolet", match: ["chevrolet", "chevy", "corvette", "camaro", "silverado"] },
  { id: "cupra", name: "Cupra", match: ["cupra"] },
  { id: "dallara", name: "Dallara", match: ["dallara", "indycar", "ir-18", "ir18", "f3 ", "ir-01", "ir01"] },
  { id: "dodge", name: "Dodge", match: ["dodge"] },
  { id: "ferrari", name: "Ferrari", match: ["ferrari"] },
  { id: "ford", name: "Ford", match: ["ford", "mustang", "fiesta", "gt40"] },
  { id: "genesis", name: "Genesis", match: ["genesis"] },
  { id: "ginetta", name: "Ginetta", match: ["ginetta"] },
  { id: "holden", name: "Holden", match: ["holden", "commodore"] },
  { id: "honda", name: "Honda", match: ["honda", "hpd", "civic"] },
  { id: "hyundai", name: "Hyundai", match: ["hyundai", "elantra", "veloster"] },
  { id: "kia", name: "Kia", match: ["kia"] },
  { id: "lamborghini", name: "Lamborghini", match: ["lamborghini", "huracan", "huracán"] },
  { id: "ligier", name: "Ligier", match: ["ligier"] },
  { id: "lotus", name: "Lotus", match: ["lotus"] },
  { id: "mazda", name: "Mazda", match: ["mazda", "mx-5", "mx5", "miata"] },
  { id: "mclaren", name: "McLaren", match: ["mclaren"] },
  { id: "mercedes", name: "Mercedes", match: ["mercedes", "amg"] },
  { id: "mini", name: "Mini", match: ["mini cooper"] },
  { id: "nissan", name: "Nissan", match: ["nissan"] },
  { id: "oreca", name: "Oreca", match: ["oreca"] },
  { id: "peugeot", name: "Peugeot", match: ["peugeot"] },
  { id: "pontiac", name: "Pontiac", match: ["pontiac", "solstice"] },
  { id: "porsche", name: "Porsche", match: ["porsche"] },
  { id: "radical", name: "Radical", match: ["radical"] },
  { id: "ray", name: "Ray", match: ["ray ff", "ray gr"] },
  { id: "renault", name: "Renault", match: ["renault"] },
  { id: "riley", name: "Riley", match: ["riley"] },
  { id: "skip-barber", name: "Skip Barber", match: ["skip barber", "skippy"] },
  { id: "subaru", name: "Subaru", match: ["subaru"] },
  { id: "tatuus", name: "Tatuus", match: ["tatuus", "f4"] },
  { id: "toyota", name: "Toyota", match: ["toyota", "gr86", "supra", "camry", "tundra"] },
  { id: "volkswagen", name: "Volkswagen", match: ["volkswagen", "vw ", "jetta", "beetle"] },
  { id: "williams", name: "Williams", match: ["williams"] },
];

/** Dosya adı ve marka kimliğini karşılaştırmak için: küçük harf, sadece harf/rakam */
export function normKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const brandCache = new Map<string, Brand | null>();

/** Tam araç adından markayı bul ("Mercedes-AMG GT3 2020" -> Mercedes) */
export function brandOf(carName: string): Brand | null {
  if (!carName) return null;
  const hit = brandCache.get(carName);
  if (hit !== undefined) return hit;
  const n = " " + carName.toLowerCase().replace(/[-_]/g, " ") + " ";
  let best: Brand | null = null;
  let bestAt = Infinity;
  for (const b of BRANDS) {
    for (const m of b.match) {
      const at = n.indexOf(m);
      // Kelime başında olmalı ("kia" "Nikia"da değil)
      if (at >= 0 && /[\s(]/.test(n[at - 1] ?? " ") && at < bestAt) {
        best = b;
        bestAt = at;
      }
    }
  }
  brandCache.set(carName, best);
  return best;
}

export interface LogoFile {
  name: string;
  file: string;
  dataUrl: string;
}

const [files, setFiles] = createSignal<LogoFile[]>([]);
const [map, setMap] = createSignal<Map<string, string>>(new Map());
let loaded: Promise<void> | null = null;

export const logoFiles = files;

async function fetchLogos(): Promise<LogoFile[]> {
  try {
    if (inTauri) return await invoke<LogoFile[]>("logos_list");
    const r = await fetch(`${apiBase}/api/logos`);
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

export async function reloadLogos() {
  const list = await fetchLogos();
  const m = new Map<string, string>();
  for (const f of list) m.set(normKey(f.name), f.dataUrl);
  setFiles(list);
  setMap(m);
}

/** İlk kullanımda bir kez yükle. Uygulamada diğer pencereler "logos-changed" ile yenilenir. */
export function ensureLogos() {
  if (!loaded) {
    loaded = reloadLogos();
    if (inTauri) {
      import("@tauri-apps/api/event").then(({ listen }) => listen("logos-changed", () => reloadLogos()));
    }
  }
  return loaded;
}

/** Marka için logo (varsa data URL) */
export function logoFor(brand: Brand | null): string | undefined {
  if (!brand) return undefined;
  const m = map();
  return m.get(normKey(brand.id)) ?? m.get(normKey(brand.name));
}

export async function openLogosFolder() {
  if (inTauri) await invoke("logos_open_dir");
}

export async function notifyLogosChanged() {
  await reloadLogos();
  if (inTauri) {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("logos-changed");
  }
}

/**
 * Araç logosu. Logo dosyası yoksa `fallback` metni (varsayılan: marka adı ya da araç adının
 * ilk kelimesi) gösterilir. mode="text" her zaman yazı gösterir.
 */
export function CarLogo(props: { carName: string; fallback?: string; mode?: "logo" | "text" | "both"; class?: string }) {
  ensureLogos();
  const brand = () => brandOf(props.carName);
  const src = () => (props.mode === "text" ? undefined : logoFor(brand()));
  const label = () => props.fallback ?? brand()?.name ?? props.carName.split(" ")[0] ?? "";
  return (
    <span class={"car-logo " + (props.class ?? "")} title={props.carName}>
      <Show when={src()} fallback={<span class="car-logo-txt">{label()}</span>}>
        <img src={src()} alt={label()} draggable={false} />
        <Show when={props.mode === "both"}>
          <span class="car-logo-txt">{label()}</span>
        </Show>
      </Show>
    </span>
  );
}
