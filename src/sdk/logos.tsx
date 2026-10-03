// Araç markası logoları.
//
// 46 markanın logosu uygulamayla birlikte paketlenir: src/assets/carlogos/<marka-kimliği>.png / .svg
// (Vite import.meta.glob ile derlemeye otomatik girer, bkz. o klasördeki README.md). Burada sim'deki
// tam araç adından marka bulunur ve paketlenmiş logoyla eşleştirilir. Herkes aynı logoları görür:
// kullanıcının kendi "logos" klasörü artık OKUNMAZ (Ayarlar'daki "Marka logoları" bölümü kaldırıldı).
// Öncelik: paketlenmiş logo > marka adı yazısı.

import { createMemo, Show } from "solid-js";
import logoMeta from "../assets/carlogos/meta.json";

export interface Brand {
  /** Paketlenmiş logonun dosya adı: <id>.png / <id>.svg */
  id: string;
  name: string;
  /** Araç adında aranacak kelimeler (küçük harf) */
  match: string[];
}

// Sıra önemli: daha özel ifadeler önce ("aston martin" -> "martin" değil)
export const BRANDS: Brand[] = [
  { id: "acura", name: "Acura", match: ["acura", "arx 06", "arx06", "nsx"] },
  { id: "alfa-romeo", name: "Alfa Romeo", match: ["alfa romeo", "alfaromeo", "alfa", "giulia", "giulietta"] },
  { id: "alpine", name: "Alpine", match: ["alpine", "a110", "a424", "a470", "a480"] },
  { id: "aston-martin", name: "Aston Martin", match: ["aston martin", "astonmartin", "aston", "amr", "vantage", "valkyrie", "dbr9"] },
  { id: "audi", name: "Audi", match: ["audi", "r8 lms", "r8lms", "rs3", "rs 3 lms", "r18", "90 gto"] },
  { id: "bentley", name: "Bentley", match: ["bentley", "continental gt"] },
  { id: "bmw", name: "BMW", match: ["bmw", "m4 gt", "m4gt", "m2 cs", "m2cs", "m6 gt", "m8 gte", "m8gte", "m hybrid", "mhybrid", "z4 gt"] },
  { id: "buick", name: "Buick", match: ["buick"] },
  { id: "cadillac", name: "Cadillac", match: ["cadillac", "v series.r", "v series r", "vseriesr", "cts v", "ctsv"] },
  { id: "chevrolet", name: "Chevrolet", match: ["chevrolet", "chevy", "corvette", "camaro", "silverado", "monte carlo", "impala", "c6r", "c6.r", "c7r", "c7.r", "c8r", "c8.r", "z06 gt3"] },
  { id: "cupra", name: "Cupra", match: ["cupra", "leon"] },
  { id: "dallara", name: "Dallara", match: ["dallara", "indycar", "ir 18", "ir18", "ir 01", "ir01", "ir 05", "dw12", "p217", "f312", "f317", "il 15", "super formula"] },
  { id: "dodge", name: "Dodge", match: ["dodge", "viper", "challenger", "charger"] },
  { id: "ferrari", name: "Ferrari", match: ["ferrari", "488 gt", "488gt", "296 gt", "296gt", "499p"] },
  { id: "ford", name: "Ford", match: ["ford", "mustang", "fiesta", "gt40", "fordgt", "f 150", "f150", "thunderbird", "fusion", "falcon"] },
  { id: "genesis", name: "Genesis", match: ["genesis", "gmr 001", "gmr001"] },
  { id: "ginetta", name: "Ginetta", match: ["ginetta", "g55", "g56", "g40"] },
  { id: "holden", name: "Holden", match: ["holden", "commodore"] },
  { id: "honda", name: "Honda", match: ["honda", "hpd", "civic"] },
  { id: "hyundai", name: "Hyundai", match: ["hyundai", "elantra", "veloster", "i30", "i20"] },
  { id: "jaguar", name: "Jaguar", match: ["jaguar", "xjr", "f type"] },
  { id: "kia", name: "Kia", match: ["kia", "optima"] },
  { id: "lamborghini", name: "Lamborghini", match: ["lamborghini", "huracan", "huracán", "lambo", "sc63", "gallardo", "super trofeo"] },
  { id: "lexus", name: "Lexus", match: ["lexus", "rc f", "rcf"] },
  { id: "ligier", name: "Ligier", match: ["ligier", "js p2", "js p3", "js p4", "jsp2", "jsp3", "jsp4", "jsp320", "js2 r"] },
  { id: "lotus", name: "Lotus", match: ["lotus", "evora", "exige", "emira"] },
  { id: "maserati", name: "Maserati", match: ["maserati", "mc20", "granturismo"] },
  { id: "mazda", name: "Mazda", match: ["mazda", "mx 5", "mx5", "miata", "rt24"] },
  { id: "mclaren", name: "McLaren", match: ["mclaren", "720s", "650s", "570s", "mp4"] },
  { id: "mercedes", name: "Mercedes", match: ["mercedes", "amg", "merc", "w12", "w13", "sls gt3", "190e"] },
  { id: "mini", name: "Mini", match: ["mini cooper", "mini jcw", "mini john", "mini challenge", "mini countryman", "minicooper"] },
  { id: "nissan", name: "Nissan", match: ["nissan", "gt r", "gtr", "nismo", "370z", "350z", "skyline"] },
  { id: "oreca", name: "Oreca", match: ["oreca", "fla09"] },
  { id: "peugeot", name: "Peugeot", match: ["peugeot", "9x8", "908"] },
  { id: "pontiac", name: "Pontiac", match: ["pontiac", "solstice"] },
  { id: "porsche", name: "Porsche", match: ["porsche", "911 gt", "911gt", "911 rsr", "911rsr", "911 cup", "911cup", "992", "991", "963", "718", "cayman", "919", "962"] },
  { id: "radical", name: "Radical", match: ["radical", "sr8", "sr10", "sr3"] },
  { id: "ray", name: "Ray", match: ["ray ff", "ray gr", "ray formula", "rayff", "ray"] },
  { id: "renault", name: "Renault", match: ["renault", "clio", "megane", "mégane"] },
  { id: "riley", name: "Riley", match: ["riley", "mkxx", "mk xx"] },
  { id: "skip-barber", name: "Skip Barber", match: ["skip barber", "skipbarber", "skippy", "rt2000"] },
  { id: "subaru", name: "Subaru", match: ["subaru", "wrx", "brz"] },
  { id: "tatuus", name: "Tatuus", match: ["tatuus", "f4", "usf 2000", "usf2000", "indy pro 2000", "pm 18"] },
  { id: "toyota", name: "Toyota", match: ["toyota", "gr86", "gr 86", "supra", "camry", "tundra", "gr010", "gr 010", "gr yaris", "ts050", "gr corolla"] },
  { id: "volkswagen", name: "Volkswagen", match: ["volkswagen", "vw", "jetta", "beetle", "golf", "polo", "scirocco"] },
  { id: "williams", name: "Williams", match: ["williams", "fw31", "fw45", "fw46"] },
];

/** Dosya adı ve marka kimliğini karşılaştırmak için: küçük harf, sadece harf/rakam */
export function normKey(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Tam kelime olarak eşleşmesi gereken kısa takma adlar */
const STRICT = new Set(["vw", "ray", "alfa", "leon", "golf", "polo", "merc", "clio", "amr", "gtr", "gt r", "lambo", "hpd", "viper", "falcon", "fusion", "charger", "impala"]);

const brandCache = new Map<string, Brand | null>();

/** Tam araç adından markayı bul ("Mercedes-AMG GT3 2020" -> Mercedes) */
export function brandOf(carName: string): Brand | null {
  if (!carName) return null;
  const hit = brandCache.get(carName);
  if (hit !== undefined) return hit;
  // Tire/alt çizgi boşluk sayılır ("mx-5" = "mx 5"); aksanlar atılır ("Huracán")
  const n =
    " " +
    carName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_/]/g, " ")
      .replace(/\s+/g, " ") +
    " ";
  let best: Brand | null = null;
  let bestAt = Infinity;
  let bestLen = 0;
  for (const b of BRANDS) {
    for (const m of b.match) {
      const at = n.indexOf(m);
      if (at < 0) continue;
      // Kelime başında olmalı ("kia" "Nikia"da değil). Marka adları önek olabilir ("porsche992cup",
      // "bmwm4gt3"); kısa takma adlar (STRICT) ve rakamla bitenler tam kelime olmalı ("gt r" "GT R8"de değil)
      if (!/[\s(]/.test(n[at - 1] ?? " ")) continue;
      const end = n[at + m.length] ?? " ";
      if ((STRICT.has(m) || /\d$/.test(m)) && /[a-z0-9]/.test(end)) continue;
      // En solda geçen kazanır; aynı yerde daha uzun ifade ("aston martin" > "aston")
      if (at < bestAt || (at === bestAt && m.length > bestLen)) {
        best = b;
        bestAt = at;
        bestLen = m.length;
      }
    }
  }
  brandCache.set(carName, best);
  return best;
}

// Paketlenmiş logolar: dosya adı (uzantısız) = marka kimliği (ör. aston-martin.png / .svg).
// Aynı marka için hem SVG hem PNG varsa SVG kullanılır.
interface Bundled {
  url: string;
  /** Koyu zeminde okunmayan logo: arkasına açık çip konur */
  dark: boolean;
  /** Düz siyah tek renk logo: çip yerine beyaza çevrilir */
  mono: boolean;
  /** Logoya özel boyut çarpanı (1 = değişiklik yok) */
  scale: number;
}
/**
 * Elle verilen logo boyutu düzeltmeleri (marka kimliği -> çarpan). Bazı logolar hücreyi tam doldurduğu için
 * tablolarda diğerlerinden iri görünür. meta.json betikle yeniden üretildiğinden (scripts/carlogos_meta.py)
 * elle ayarlar BURADA tutulur; betik bunlara dokunmaz.
 */
const LOGO_SCALE: Record<string, number> = {
  ford: 0.82,
};
const BUNDLED: Map<string, Bundled> = (() => {
  const out = new Map<string, Bundled>();
  const meta = logoMeta as Record<string, { dark?: boolean; mono?: boolean }>;
  const mods = import.meta.glob(["../assets/carlogos/*.png", "../assets/carlogos/*.svg"], { eager: true, query: "?url", import: "default" }) as Record<
    string,
    string
  >;
  // png önce, svg sonra: svg aynı anahtarın üzerine yazar
  const entries = Object.entries(mods).sort(([a], [b]) => Number(/\.svg$/i.test(a)) - Number(/\.svg$/i.test(b)));
  for (const [path, url] of entries) {
    const file = path.split("/").pop()!;
    const name = file.replace(/\.(svg|png)$/i, "");
    const m = /\.png$/i.test(file) ? meta[name] : undefined;
    out.set(normKey(name), { url, dark: !!m?.dark, mono: !!m?.mono, scale: LOGO_SCALE[name.toLowerCase()] ?? 1 });
  }
  return out;
})();

/** Paketlenmiş logosu olan marka kimlikleri (normKey) */
export const bundledLogoKeys = () => [...BUNDLED.keys()];

/** Marka için paketlenmiş logo ve görünüm bilgisi */
export function logoInfo(brand: Brand | null): { src: string; dark: boolean; mono: boolean; scale: number } | undefined {
  if (!brand) return undefined;
  const b = BUNDLED.get(normKey(brand.id)) ?? BUNDLED.get(normKey(brand.name));
  return b ? { src: b.url, dark: b.dark, mono: b.mono, scale: b.scale } : undefined;
}

/** Marka için logo adresi */
export function logoFor(brand: Brand | null): string | undefined {
  return logoInfo(brand)?.src;
}

/**
 * Araç logosu. Logo dosyası yoksa `fallback` metni (varsayılan: marka adı ya da araç adının
 * ilk kelimesi) gösterilir. mode="text" her zaman yazı gösterir.
 */
export function CarLogo(props: {
  carName: string;
  fallback?: string;
  mode?: "logo" | "text" | "both";
  class?: string;
  /** Sabit genişlikli hücre: logo yoksa yazı yerine boş kalır (hizayı korur) */
  cell?: boolean;
  /** Logo boyutu çarpanı (1 = eski boyut); overlay ayarındaki "Logo boyutu" */
  scale?: number;
}) {
  // Tam ad bulunamazsa kısa ad / yol ile de dene ("porsche992cup" gibi)
  // Memo: veri her geldiğinde aynı marka/adres yeniden hesaplanıp <img> yeniden kurulmasın (logo titremesi)
  const brand = createMemo(() => brandOf(props.carName) ?? (props.fallback ? brandOf(props.fallback) : null));
  const info = createMemo(() => (props.mode === "text" ? undefined : logoInfo(brand())));
  const src = createMemo(() => info()?.src);
  const label = () => props.fallback ?? brand()?.name ?? props.carName.split(" ")[0] ?? "";
  return (
    <span
      class={"car-logo " + (props.class ?? "")}
      classList={{ "car-logo-cell": !!props.cell, "car-logo-dark": !!info()?.dark && !info()?.mono, "car-logo-mono": !!info()?.mono }}
      title={props.carName}
      style={props.scale ? { "--logo-k": String(props.scale) } : undefined}
    >
      <Show when={src()} fallback={<Show when={!props.cell || props.mode === "text"}><span class="car-logo-txt">{label()}</span></Show>}>
        <img
          src={src()}
          alt={label()}
          draggable={false}
          style={info()?.scale && info()!.scale !== 1 ? { transform: `scale(${info()!.scale})` } : undefined}
        />
        <Show when={props.mode === "both"}>
          <span class="car-logo-txt">{label()}</span>
        </Show>
      </Show>
    </span>
  );
}
