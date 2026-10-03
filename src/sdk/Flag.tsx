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

export function flagUrl(code: string | undefined | null): string | undefined {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return undefined;
  return byCode[ALIAS[c] ?? c] ?? (c.length === 3 ? byCode[ISO3[c]] : undefined);
}

export function Flag(props: { code: string | undefined | null; class?: string }) {
  return (
    <Show when={flagUrl(props.code)} fallback={<span class={props.class}>{props.code}</span>}>
      {(u) => <img class={`ov-flag ${props.class ?? ""}`} src={u()} alt={props.code ?? ""} title={props.code ?? ""} draggable={false} />}
    </Show>
  );
}
