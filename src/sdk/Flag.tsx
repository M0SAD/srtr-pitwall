// Ülke bayrağı (iRacing "flair" kısa kodu, ör. TR, DE). Windows bayrak emojisi çizmediği için
// flag-icons paketindeki SVG'ler kullanılır; kod tanınmazsa kısa kod yazı olarak kalır.
import { Show } from "solid-js";

const files = import.meta.glob("/node_modules/flag-icons/flags/4x3/*.svg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const byCode: Record<string, string> = {};
for (const [p, url] of Object.entries(files)) {
  const m = p.match(/\/([a-z0-9-]+)\.svg$/);
  if (m) byCode[m[1]] = url;
}
const ALIAS: Record<string, string> = { uk: "gb", en: "gb-eng", sco: "gb-sct", wal: "gb-wls" };

/** Üç harfli ülke kodları (ISO alpha-3 ve yarışlarda kullanılan IOC kısaltmaları) → iki harfli kod */
const ISO3: Record<string, string> = {
  tur: "tr", deu: "de", ger: "de", gbr: "gb", usa: "us", ita: "it", esp: "es", fra: "fr", nld: "nl", ned: "nl", bra: "br",
  prt: "pt", por: "pt", swe: "se", fin: "fi", pol: "pl", bel: "be", aut: "at", can: "ca", aus: "au", jpn: "jp", dnk: "dk",
  den: "dk", nor: "no", che: "ch", sui: "ch", cze: "cz", arg: "ar", mex: "mx", irl: "ie", nzl: "nz", rus: "ru", ukr: "ua",
  hun: "hu", rou: "ro", bgr: "bg", bul: "bg", grc: "gr", gre: "gr", hrv: "hr", cro: "hr", svn: "si", slo: "si", svk: "sk",
  srb: "rs", est: "ee", lva: "lv", lat: "lv", ltu: "lt", lux: "lu", isl: "is", chn: "cn", kor: "kr", ind: "in", idn: "id",
  ina: "id", mys: "my", mas: "my", sgp: "sg", tha: "th", phl: "ph", phi: "ph", zaf: "za", rsa: "za", chl: "cl", chi: "cl",
  col: "co", per: "pe", ury: "uy", uru: "uy", ven: "ve", isr: "il", sau: "sa", ksa: "sa", are: "ae", uae: "ae", aze: "az",
  geo: "ge", kaz: "kz", egy: "eg", mar: "ma", cyp: "cy", mlt: "mt", bih: "ba", mkd: "mk", alb: "al", mne: "me", blr: "by",
};

/** Ülke adı (iRacing "FlairName", İngilizce) → iki harfli kod: kısa kod gelmediğinde bayrak yine çizilsin */
const NAMES: Record<string, string> = {
  turkey: "tr", "türkiye": "tr", turkiye: "tr", germany: "de", "united kingdom": "gb", "great britain": "gb", england: "gb-eng", scotland: "gb-sct", wales: "gb-wls",
  "northern ireland": "gb-nir", "united states": "us", "united states of america": "us", usa: "us", italy: "it", spain: "es", france: "fr", netherlands: "nl",
  brazil: "br", portugal: "pt", sweden: "se", finland: "fi", poland: "pl", belgium: "be", austria: "at", canada: "ca", australia: "au", japan: "jp",
  denmark: "dk", norway: "no", switzerland: "ch", "czech republic": "cz", czechia: "cz", argentina: "ar", mexico: "mx", ireland: "ie", "new zealand": "nz",
  russia: "ru", ukraine: "ua", hungary: "hu", romania: "ro", bulgaria: "bg", greece: "gr", croatia: "hr", slovenia: "si", slovakia: "sk", serbia: "rs",
  estonia: "ee", latvia: "lv", lithuania: "lt", luxembourg: "lu", iceland: "is", china: "cn", "south korea": "kr", korea: "kr", india: "in", indonesia: "id",
  malaysia: "my", singapore: "sg", thailand: "th", philippines: "ph", "south africa": "za", chile: "cl", colombia: "co", peru: "pe", uruguay: "uy",
  venezuela: "ve", israel: "il", "saudi arabia": "sa", "united arab emirates": "ae", azerbaijan: "az", georgia: "ge", kazakhstan: "kz", egypt: "eg",
  morocco: "ma", cyprus: "cy", malta: "mt", "bosnia and herzegovina": "ba", "north macedonia": "mk", albania: "al", montenegro: "me", belarus: "by",
  taiwan: "tw", "hong kong": "hk", vietnam: "vn", pakistan: "pk", qatar: "qa", kuwait: "kw", bahrain: "bh", ecuador: "ec", paraguay: "py", bolivia: "bo",
  "costa rica": "cr", panama: "pa", "puerto rico": "pr", "dominican republic": "do", guatemala: "gt", moldova: "md", armenia: "am", monaco: "mc",
  andorra: "ad", liechtenstein: "li", "san marino": "sm", tunisia: "tn", algeria: "dz", nigeria: "ng", kenya: "ke",
};

/** Aksan ve noktalama farklarını yok sayan karşılaştırma anahtarı ("Côte d'Ivoire" = "cote divoire") */
const fold = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
/** Bütün ülkelerin İngilizce adları → kod (tarayıcının ülke adı listesinden, ilk kullanımda kurulur) */
let nameCache: Record<string, string> | null = null;
function allNames(): Record<string, string> {
  if (nameCache) return nameCache;
  nameCache = {};
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (const code of Object.keys(byCode)) {
      if (code.length !== 2) continue;
      const n = dn.of(code.toUpperCase());
      if (n && n.toUpperCase() !== code.toUpperCase()) nameCache[fold(n)] = code;
    }
  } catch {
    /* Intl.DisplayNames yoksa yalnızca elle yazılmış liste kullanılır */
  }
  for (const [n, code] of Object.entries(NAMES)) nameCache[fold(n)] = code;
  return nameCache;
}

export function flagUrl(code: string | undefined | null): string | undefined {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return undefined;
  return byCode[ALIAS[c] ?? c] ?? (c.length === 3 ? byCode[ISO3[c]] : undefined) ?? (NAMES[c] ? byCode[NAMES[c]] : undefined) ?? byCode[allNames()[fold(c)]];
}

export function Flag(props: { code: string | undefined | null; class?: string }) {
  return (
    <Show when={flagUrl(props.code)} fallback={<span class={props.class}>{String(props.code ?? "").trim().length <= 3 ? props.code : ""}</span>}>
      {(u) => <img class={`ov-flag ${props.class ?? ""}`} src={u()} alt={props.code ?? ""} title={props.code ?? ""} draggable={false} />}
    </Show>
  );
}
