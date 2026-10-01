// Hava/pist bilgileri için küçük satır içi SVG ikonlar (yazı etiketi yerine).
// Üzerine gelince anlamı görünür (title + düzenleme modunda küçük ipucu balonu).

import { Show, type JSX } from "solid-js";
import type { SettingField } from "./overlay";
import { t } from "./i18n";

export type WxKind =
  | "air"
  | "track"
  | "wetness"
  | "humidity"
  | "precip"
  | "wind"
  // Başlık bilgileri (sdk/HeaderStats.tsx)
  | "race"
  | "qualify"
  | "practice"
  | "remaining"
  | "sof"
  | "incidents"
  | "lap"
  | "position"
  | "clock"
  | "brakeBias";

export const WX_TITLES: Record<WxKind, string> = {
  air: "Hava sıcaklığı",
  track: "Pist sıcaklığı",
  wetness: "Pist zemini (ıslaklık)",
  humidity: "Nem",
  precip: "Yağış",
  wind: "Rüzgâr",
  race: "Yarış",
  qualify: "Sıralama turları",
  practice: "Antrenman",
  remaining: "Kalan tur/süre",
  sof: "SOF (alan gücü)",
  incidents: "Olay puanı",
  lap: "Tur",
  position: "Pozisyon",
  clock: "Gerçek saat",
  brakeBias: "Fren dengesi",
};

const PATHS: Record<WxKind, () => JSX.Element> = {
  air: () => (
    <>
      <path d="M4.5 13.6V5a1.5 1.5 0 0 1 3 0v8.6a3.2 3.2 0 1 1-3 0Z" />
      <path d="M6 9v6" />
      <circle cx="6" cy="16.4" r="1.3" class="wxi-fill" />
      <path d="M13.2 15h6.3a2.4 2.4 0 0 0 .2-4.8 3.4 3.4 0 0 0-6.5-.5 2.7 2.7 0 0 0 0 5.3Z" />
    </>
  ),
  track: () => (
    <>
      <path d="M2.5 21 7 10.5M13.5 21 10 10.5" />
      <path d="M8.3 13v1.5M8.1 17.2v2.2" />
      <path d="M16.5 12.6V5a1.5 1.5 0 0 1 3 0v7.6a3.2 3.2 0 1 1-3 0Z" />
      <path d="M18 8v6" />
      <circle cx="18" cy="15.4" r="1.3" class="wxi-fill" />
    </>
  ),
  wetness: () => (
    <>
      <path d="M3 21l5-9M21 21l-5-9" />
      <path d="M12 13.5v1.6M12 18v2.6" />
      <path d="M7 2.5c1.2 1.6 1.8 2.6 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.4Z" class="wxi-fill" />
      <path d="M17 2.5c1.2 1.6 1.8 2.6 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.8.6-1.8 1.8-3.4Z" class="wxi-fill" />
      <path d="M12 5.5c.9 1.2 1.3 1.9 1.3 2.5a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.3 1.3-2.5Z" class="wxi-fill" />
    </>
  ),
  humidity: () => (
    <>
      <path d="M12 2.8c3.6 4.5 5.7 7.6 5.7 10.5a5.7 5.7 0 0 1-11.4 0c0-2.9 2.1-6 5.7-10.5Z" />
      <path d="M9.8 17l4.4-5.6" />
      <circle cx="10.2" cy="12.2" r="0.9" class="wxi-fill" />
      <circle cx="13.8" cy="16.2" r="0.9" class="wxi-fill" />
    </>
  ),
  precip: () => (
    <>
      <path d="M7.5 13.5h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.8 6.4a3.6 3.6 0 0 0-.3 7.1Z" />
      <path d="M8.5 16.5l-1.2 3.5M12.5 16.5l-1.2 3.5M16.5 16.5l-1.2 3.5" />
    </>
  ),
  wind: () => (
    <>
      <path d="M3 8.5h9.5A2.5 2.5 0 1 0 10 6" />
      <path d="M3 12.5h14a3 3 0 1 1-3 3" />
      <path d="M3 16.5h6.5" />
    </>
  ),
  // Damalı bayrak
  race: () => (
    <>
      <path d="M5 21V3.5" />
      <path d="M5 4h14v9H5" />
      <rect x="5" y="4" width="4.67" height="4.5" class="wxi-fill" />
      <rect x="14.33" y="4" width="4.67" height="4.5" class="wxi-fill" />
      <rect x="9.67" y="8.5" width="4.67" height="4.5" class="wxi-fill" />
    </>
  ),
  // Kronometre
  qualify: () => (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.2 7.3l1.4-1.4" />
    </>
  ),
  // Dalgalı bayrak
  practice: () => (
    <>
      <path d="M5 21V3.5" />
      <path d="M5 4.5c2.3-1.4 4.7-1.4 7 0s4.7 1.4 7 0V13c-2.3 1.4-4.7 1.4-7 0s-4.7-1.4-7 0" />
    </>
  ),
  // Kum saati
  remaining: () => (
    <>
      <path d="M6.5 3h11M6.5 21h11" />
      <path d="M8 3v2.5c0 2.6 4 4 4 6.5s-4 3.9-4 6.5V21M16 3v2.5c0 2.6-4 4-4 6.5s4 3.9 4 6.5V21" />
      <path d="M9.6 19.5c0-1.4 1.2-2.4 2.4-3 1.2.6 2.4 1.6 2.4 3Z" class="wxi-fill" />
    </>
  ),
  // Yükselen çubuklar (güç)
  sof: () => (
    <>
      <path d="M3.5 20.5h17" />
      <rect x="5" y="14" width="3.5" height="6.5" rx="0.6" />
      <rect x="10.25" y="9.5" width="3.5" height="11" rx="0.6" />
      <rect x="15.5" y="4.5" width="3.5" height="16" rx="0.6" class="wxi-fill" />
    </>
  ),
  // Uyarı üçgeni
  incidents: () => (
    <>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 9.5v5" />
      <circle cx="12" cy="17.3" r="1.1" class="wxi-fill" />
    </>
  ),
  // Dönen ok (tur)
  lap: () => (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.5v3.7h-3.7" />
      <circle cx="12" cy="12" r="1.4" class="wxi-fill" />
    </>
  ),
  // Podyum
  position: () => (
    <>
      <path d="M3 20.5h18" />
      <path d="M3.5 20.5V14h5.5M9 20.5V9h6v11.5M15 20.5V12h5.5v8.5" />
    </>
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.3V12l3.2 2" />
    </>
  ),
  // Fren diski
  brakeBias: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.8" />
      <circle cx="12" cy="6" r="0.9" class="wxi-fill" />
      <circle cx="12" cy="18" r="0.9" class="wxi-fill" />
      <circle cx="6" cy="12" r="0.9" class="wxi-fill" />
      <circle cx="18" cy="12" r="0.9" class="wxi-fill" />
    </>
  ),
};

export function WxIcon(props: { kind: WxKind; class?: string }) {
  return (
    <svg
      class={`wxi ${props.class ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[props.kind]()}
    </svg>
  );
}

/** Etiket: `mode` "text" ise yazı, değilse ikon (varsayılan). `title` verilirse ipucu o olur. */
export function WxLabel(props: { kind: WxKind; text: string; mode?: string; class?: string; title?: string }) {
  const tip = () => props.title || WX_TITLES[props.kind];
  return (
    <Show
      when={props.mode !== "text"}
      fallback={<span class={props.class}>{props.text}</span>}
    >
      <span class={`wxi-wrap ${props.class ?? ""}`} title={tip()} data-tip={t(tip())}>
        <WxIcon kind={props.kind} />
      </span>
    </Show>
  );
}

export const LABEL_STYLES = [
  { value: "icon", label: "İkon" },
  { value: "text", label: "Yazı" },
];

/** Manifestler için "Etiket gösterimi" ayarı */
export function labelStyleField(group?: string): SettingField {
  return {
    key: "labelStyle",
    label: "Etiket gösterimi",
    type: "select",
    default: "icon",
    options: LABEL_STYLES,
    hint: "Başlık bilgilerinin (oturum, kalan, SOF, olay, tur, hava/pist...) başında ikon mu yazı mı görünsün. İkonun üzerine gelince anlamı yazar.",
    ...(group ? { group } : {}),
  };
}
