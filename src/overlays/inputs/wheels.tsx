// Pedallar & Girdi overlay'i için direksiyon çizimleri (özgün tasarımlar, marka logosu yok).
// Hepsi aynı kutuda (merkez 0,0) çizilir ve direksiyon açısıyla birlikte döner.

import { For, Match, Switch, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "@/sdk/platform";
import { carFamily, type CarFamily, type CarInfo } from "@/sdk/cars";

export type WheelStyle = "round" | "formula" | "gt" | "proto" | "rally" | "oval" | "classic" | "truck";

/** Ücretsiz olan tek tasarım klasik yuvarlak direksiyondur */
export const FREE_WHEELS = new Set<WheelStyle>(["round"]);
const ALL: WheelStyle[] = ["round", "formula", "gt", "proto", "rally", "oval", "classic", "truck"];
export const isWheelStyle = (v: unknown): v is WheelStyle => ALL.includes(v as WheelStyle);

// Araç ailesi -> direksiyon tasarımı (araç tanıma ortak: src/sdk/cars.ts)
const BY_FAMILY: Record<CarFamily, WheelStyle> = {
  classic: "classic",
  formula: "formula",
  formulaJr: "formula",
  gtDe: "gt",
  gtIt: "gt",
  gtUk: "gt",
  touring: "gt",
  proto: "proto",
  stock: "oval",
  rally: "rally",
  road: "round",
};

/** Sürülen araca göre direksiyon tasarımı */
export function wheelForCar(st: CarInfo | undefined): WheelStyle {
  const f = carFamily(st);
  return f ? BY_FAMILY[f] : "round";
}

// ---------------------------------------------------------------------------------------------------------
// Bilgisayara bağlı direksiyon (Rust: wheeldev::wheel_detect). Aygıtın adı / USB üreticisinden direksiyonun
// TÜRÜ tahmin edilir (yuvarlak, GT, formula, kamyon) ve o türün özgün çizimi gösterilir; ürünün kendi görseli değil.
// OBS tarayıcı kaynağında (Tauri yok) algılama yapılamaz: araca göre seçime düşülür.
// ---------------------------------------------------------------------------------------------------------
interface WheelDev {
  name: string;
  vid: number;
  pid: number;
  shape: string;
  wheel: boolean;
}
const [device, setDevice] = createSignal<WheelDev | null>(null);
let polling = false;
const POLL_MS = 20000;

function pollDevice() {
  invoke<WheelDev[]>("wheel_detect")
    .then((list) => setDevice(list.find((d) => d.wheel) ?? null))
    .catch(() => setDevice(null));
}

/** Bağlı direksiyonun türü (bulunamadıysa null). İlk çağrıda algılamayı başlatır; takıp çıkarma için arada yeniler. */
export function wheelForDevice(): WheelStyle | null {
  if (!polling && inTauri) {
    polling = true;
    pollDevice();
    setInterval(pollDevice, POLL_MS);
  }
  const s = device()?.shape;
  return isWheelStyle(s) ? s : null;
}

/** Algılanan direksiyonun adı (bilgi için) */
export const detectedWheelName = () => device()?.name ?? "";

/** Ayardaki değere göre çizilecek direksiyon: sabit tasarım, "device" (bağlı direksiyon) ya da "auto" (araca göre) */
export function resolveWheel(opt: unknown, st: CarInfo | undefined): WheelStyle {
  if (isWheelStyle(opt)) return opt;
  if (opt === "device") return wheelForDevice() ?? wheelForCar(st);
  return wheelForCar(st);
}

const LEDS = ["#33d17a", "#33d17a", "#ffd23f", "#ff4d4f", "#4aa8ff"];

/** Direksiyon çizimi. `angle` radyan (+ saat yönü). */
export function WheelArt(props: { style: WheelStyle; angle: number; accent: string; size?: number }) {
  return (
    <svg
      class="inp-wheel"
      viewBox={props.style === "round" ? "-24 -24 48 48" : "-26 -26 52 52"}
      style={{
        transform: `rotate(${props.angle}rad)`,
        "--wa": props.accent,
        ...(props.size && props.size !== 1 ? { width: `${2.5 * props.size}em`, height: `${2.5 * props.size}em` } : {}),
      }}
    >
      <Switch fallback={<Round />}>
        <Match when={props.style === "formula"}>
          <Formula />
        </Match>
        <Match when={props.style === "gt"}>
          <Gt />
        </Match>
        <Match when={props.style === "proto"}>
          <Proto />
        </Match>
        <Match when={props.style === "rally"}>
          <Rally />
        </Match>
        <Match when={props.style === "oval"}>
          <Oval />
        </Match>
        <Match when={props.style === "classic"}>
          <Classic />
        </Match>
        <Match when={props.style === "truck"}>
          <Truck />
        </Match>
      </Switch>
    </svg>
  );
}

/** Klasik (eski varsayılan): GT tipi jant, tutma yerleri, üç kol, üstte merkez işareti */
function Round() {
  return (
    <>
      <path
        class="w-rim"
        d="M -19 -6 C -19 -17 -11 -20 0 -20 C 11 -20 19 -17 19 -6 L 19 6 C 19 15 12 19 7 19 L -7 19 C -12 19 -19 15 -19 6 Z"
      />
      <path class="w-grip" d="M -19 -7 L -19 7" />
      <path class="w-grip" d="M 19 -7 L 19 7" />
      <path class="w-spoke" d="M -18 2 L -6 3" />
      <path class="w-spoke" d="M 18 2 L 6 3" />
      <path class="w-spoke" d="M 0 8 L 0 18" />
      <rect class="w-hub" x="-7" y="-4" width="14" height="12" rx="3" />
      <rect class="w-mark" x="-2" y="-23" width="4" height="7" rx="1" />
    </>
  );
}

/** Formula: dikdörtgen gövde, iki yanda tutma yeri, ortada ekran ve vites ışıkları */
function Formula() {
  return (
    <>
      <rect class="wg" x="-25" y="-10" width="7.5" height="22" rx="3.6" />
      <rect class="wg" x="17.5" y="-10" width="7.5" height="22" rx="3.6" />
      <path
        class="wb"
        d="M -15 -12 L 15 -12 Q 18.5 -12 19.2 -8.5 L 20.5 3 Q 21 8.5 15.5 9.8 L 9 11 Q 6.5 11.6 5 14 L -5 14 Q -6.5 11.6 -9 11 L -15.5 9.8 Q -21 8.5 -20.5 3 L -19.2 -8.5 Q -18.5 -12 -15 -12 Z"
      />
      <rect class="wd" x="-8" y="-7" width="16" height="9" rx="1.6" />
      <rect class="wa" x="-5.5" y="-4.5" width="5" height="4" rx="0.6" opacity="0.9" />
      <rect class="wdim" x="1" y="-4.5" width="4.5" height="1.6" rx="0.4" />
      <rect class="wdim" x="1" y="-2.1" width="4.5" height="1.6" rx="0.4" />
      <For each={LEDS}>{(c, i) => <circle cx={-6 + i() * 3} cy="-9.6" r="1" fill={c} />}</For>
      <circle class="wbtn" cx="-12.5" cy="-6" r="1.8" />
      <circle class="wbtn" cx="12.5" cy="-6" r="1.8" />
      <circle class="wa" cx="-12.5" cy="0" r="1.8" />
      <circle class="wa" cx="12.5" cy="0" r="1.8" />
      <circle class="wknob" cx="-6" cy="7" r="2.3" />
      <circle class="wknob" cx="6" cy="7" r="2.3" />
      <rect class="wa" x="-1.5" y="-14" width="3" height="3" rx="0.6" />
    </>
  );
}

/** GT: altı düz jant, geniş tutma yerleri, düğmeli orta panel */
function Gt() {
  return (
    <>
      <path
        class="wr"
        d="M -20 -4 C -20 -16 -11 -21 0 -21 C 11 -21 20 -16 20 -4 L 20 8 C 20 14 16 17 11 17 L -11 17 C -16 17 -20 14 -20 8 Z"
      />
      <path class="wgs" d="M -20 -8 L -20 10" />
      <path class="wgs" d="M 20 -8 L 20 10" />
      <path class="wb" d="M -18 -4 L 18 -4 L 15 9 Q 13.6 13 9.5 13 L -9.5 13 Q -13.6 13 -15 9 Z" />
      <rect class="wd" x="-5" y="-2" width="10" height="5" rx="1" />
      <rect class="wa" x="-3.5" y="-0.8" width="7" height="2.4" rx="0.5" opacity="0.85" />
      <circle class="wbtn" cx="-12" cy="-0.5" r="1.7" />
      <circle class="wa" cx="12" cy="-0.5" r="1.7" />
      <circle class="wbtn" cx="-11" cy="5" r="1.7" />
      <circle class="wbtn" cx="11" cy="5" r="1.7" />
      <circle class="wknob" cx="-5" cy="8.6" r="2" />
      <circle class="wknob" cx="5" cy="8.6" r="2" />
      <path class="wsp" d="M 0 13 L 0 17" />
      <rect class="wa" x="-1.6" y="-24" width="3.2" height="6" rx="0.8" />
    </>
  );
}

/** Dayanıklılık / prototip: üstü açık kelebek gövde, büyük ekran */
function Proto() {
  return (
    <>
      <path class="wg" d="M -24.5 -11 Q -27 1 -22 13 L -16.5 13 Q -20.5 1 -18 -11 Z" />
      <path class="wg" d="M 24.5 -11 Q 27 1 22 13 L 16.5 13 Q 20.5 1 18 -11 Z" />
      <path
        class="wb"
        d="M -21 -9 Q -22 -13 -18 -13 L -12 -13 Q -9.5 -13 -8.5 -10.5 L -7 -7 L 7 -7 L 8.5 -10.5 Q 9.5 -13 12 -13 L 18 -13 Q 22 -13 21 -9 L 19.5 8 Q 18.6 14 13 14 L -13 14 Q -18.6 14 -19.5 8 Z"
      />
      <rect class="wd" x="-8.5" y="-5" width="17" height="10" rx="1.6" />
      <rect class="wdim" x="-6.5" y="-3" width="6" height="6" rx="0.6" />
      <rect class="wa" x="1" y="-3" width="5.5" height="2.4" rx="0.5" />
      <rect class="wdim" x="1" y="0.6" width="5.5" height="2.4" rx="0.5" />
      <For each={LEDS}>{(c, i) => <circle cx={-6 + i() * 3} cy="-8.8" r="0.95" fill={c} />}</For>
      <circle class="wbtn" cx="-13.5" cy="-8" r="1.6" />
      <circle class="wbtn" cx="13.5" cy="-8" r="1.6" />
      <circle class="wa" cx="-13" cy="-2.5" r="1.6" />
      <circle class="wa" cx="13" cy="-2.5" r="1.6" />
      <circle class="wbtn" cx="-13" cy="3" r="1.6" />
      <circle class="wbtn" cx="13" cy="3" r="1.6" />
      <circle class="wknob" cx="-6" cy="9.5" r="2.2" />
      <circle class="wknob" cx="0" cy="9.8" r="2.2" />
      <circle class="wknob" cx="6" cy="9.5" r="2.2" />
      <rect class="wa" x="-1.5" y="-7.2" width="3" height="2" rx="0.4" />
    </>
  );
}

/** Ralli: derin çanaklı yuvarlak, süet jant, üstte renkli bant */
function Rally() {
  return (
    <>
      <circle class="wr suede" cx="0" cy="0" r="19.5" />
      <circle class="wring" cx="0" cy="0" r="16.4" />
      <path class="wsp wide" d="M -17 1.5 L -5 2.5" />
      <path class="wsp wide" d="M 17 1.5 L 5 2.5" />
      <path class="wsp wide" d="M 0 7 L 0 17" />
      <circle class="wb" cx="0" cy="2" r="6.2" />
      <circle class="wring2" cx="0" cy="2" r="3.6" />
      <rect class="wa" x="-2.2" y="-24" width="4.4" height="7.5" rx="1" />
    </>
  );
}

/** Oval / stock car: büyük ince yuvarlak, üç geniş delikli kol, dolgun göbek */
function Oval() {
  return (
    <>
      <circle class="wr thin" cx="0" cy="0" r="21.5" />
      <path class="wm" d="M -21 -2.2 L -6 -3 L -6 4 L -21 3.2 Z" />
      <path class="wm" d="M 21 -2.2 L 6 -3 L 6 4 L 21 3.2 Z" />
      <path class="wm" d="M -3.6 6 L 3.6 6 L 4.6 21 L -4.6 21 Z" />
      <rect class="whole" x="-17" y="-0.6" width="7" height="2.2" rx="1.1" />
      <rect class="whole" x="10" y="-0.6" width="7" height="2.2" rx="1.1" />
      <rect class="whole" x="-1.1" y="10" width="2.2" height="7" rx="1.1" />
      <circle class="wb" cx="0" cy="1" r="7.6" />
      <circle class="wring2" cx="0" cy="1" r="5" />
      <rect class="wa" x="-2" y="-25" width="4" height="7" rx="1" />
    </>
  );
}

/** Klasik / ahşap: ince ahşap jant, delikli metal kollar */
function Classic() {
  return (
    <>
      <circle class="wwood" cx="0" cy="0" r="20" />
      <circle class="wwood-hi" cx="0" cy="0" r="20" />
      <path class="wm" d="M -19.5 -1 L -5 -1.8 L -5 2.6 L -19.5 1.8 Z" />
      <path class="wm" d="M 19.5 -1 L 5 -1.8 L 5 2.6 L 19.5 1.8 Z" />
      <path class="wm" d="M -2.4 5 L 2.4 5 L 3 19.5 L -3 19.5 Z" />
      <circle class="whole" cx="-15" cy="0.4" r="1.1" />
      <circle class="whole" cx="-11" cy="0.4" r="1.1" />
      <circle class="whole" cx="15" cy="0.4" r="1.1" />
      <circle class="whole" cx="11" cy="0.4" r="1.1" />
      <circle class="whole" cx="0" cy="10" r="1.1" />
      <circle class="whole" cx="0" cy="14" r="1.1" />
      <circle class="wm" cx="0" cy="1" r="5.5" />
      <circle class="wa" cx="0" cy="1" r="2.6" />
      <rect class="wa" x="-1.4" y="-22.6" width="2.8" height="5" rx="0.6" />
    </>
  );
}

/** Kamyon / otobüs: büyük çaplı ince simit, alçak iki geniş kol, geniş göbek yastığı */
function Truck() {
  return (
    <>
      <circle class="wr thin" cx="0" cy="0" r="22.5" />
      <circle class="wring" cx="0" cy="0" r="20" />
      <path class="wm" d="M -21.5 2 L -8 0.5 L -8 8 L -19.5 10.5 Z" />
      <path class="wm" d="M 21.5 2 L 8 0.5 L 8 8 L 19.5 10.5 Z" />
      <path class="wm" d="M -9 9 L -4.5 9 L -8 21 L -12.5 19 Z" />
      <path class="wm" d="M 9 9 L 4.5 9 L 8 21 L 12.5 19 Z" />
      <rect class="wb" x="-9.5" y="-3.5" width="19" height="13.5" rx="4" />
      <rect class="wd" x="-5.5" y="0" width="11" height="6" rx="1.6" />
      <circle class="wbtn" cx="-13.5" cy="5" r="1.5" />
      <circle class="wbtn" cx="13.5" cy="5" r="1.5" />
      <rect class="wa" x="-2" y="-25.5" width="4" height="6.5" rx="1" />
    </>
  );
}
