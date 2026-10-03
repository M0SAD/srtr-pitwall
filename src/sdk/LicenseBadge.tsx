// iRacing lisans rozeti (sınıf harfi + Safety Rating). Tablolarda (Sıralama, Yakındakiler, Yakın Takip) ve profilde
// aynı görünüm: koyu rozet, solda sınıf renginde harf kutusu (harf rengi zemine göre koyu/açık seçilir: sarı C ve
// yeşil B'de koyu yazı), sağda koyu zemin üstünde beyaz, sabit genişlikli rakamlarla SR. Genişlik sabittir.

import { Show, type JSX } from "solid-js";
import "./LicenseBadge.css";

/** Zemin rengine göre okunaklı yazı rengi (#rrggbb; tanınmazsa beyaz) */
export function licTextColor(hex: string | null | undefined): string {
  const c = String(hex ?? "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(c)) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? "#111" : "#fff";
}

/** "A 3.42" → ["A", 3.42] */
export function parseLicense(license: string | null | undefined): [string, number] {
  const p = String(license ?? "").trim().split(/\s+/);
  const sr = parseFloat(p[1] ?? "");
  return [p[0] ?? "", isFinite(sr) ? sr : 0];
}

export function LicenseBadge(props: {
  letter: string;
  sr: number;
  color?: string | null;
  /** SR ondalık basamağı (varsayılan 2) */
  digits?: 1 | 2;
  class?: string;
  title?: string;
  /** SR'nin arkasına eklenecek içerik (tek rozet görünümü: iRating) */
  children?: JSX.Element;
}) {
  const col = () => (/^#[0-9a-f]{6}$/i.test(props.color ?? "") ? (props.color as string) : "#5a606b");
  return (
    <span
      class={`licb ${props.digits === 1 ? "licb-d1" : ""} ${props.class ?? ""}`}
      style={{ "--lc": col(), "--lt": licTextColor(col()) }}
      title={props.title}
      data-no-i18n
    >
      <b>{(props.letter || "–").slice(0, 3)}</b>
      <span>{props.sr > 0 ? props.sr.toFixed(props.digits ?? 2) : "–"}</span>
      <Show when={props.children}>
        <span class="licb-x">{props.children}</span>
      </Show>
    </span>
  );
}
