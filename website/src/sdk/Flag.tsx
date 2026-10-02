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

export function flagUrl(code: string | undefined | null): string | undefined {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return undefined;
  return byCode[ALIAS[c] ?? c];
}

export function Flag(props: { code: string | undefined | null; class?: string }) {
  return (
    <Show when={flagUrl(props.code)} fallback={<span class={props.class}>{props.code}</span>}>
      {(u) => <img class={`ov-flag ${props.class ?? ""}`} src={u()} alt={props.code ?? ""} title={props.code ?? ""} draggable={false} />}
    </Show>
  );
}
