// Leaderboard/Relative üst ve alt satırında seçilebilen bilgi kutucukları (Edge'deki
// "Header fields" gibi). Değerler session/weather konularından okunur.

import { For, Show, createSignal, onCleanup, type JSX } from "solid-js";
import { useTopic } from "./telemetry";
import { clock, pct, temp, wallClock, wind, windUnit } from "./format";
import { WETNESS } from "./types";
import type { SettingField, Units } from "./overlay";
import { WxLabel, type WxKind } from "./WxIcon";

export const HEADER_FIELDS = [
  { value: "session", label: "Oturum türü" },
  { value: "sof", label: "SOF" },
  { value: "incidents", label: "Olay puanı" },
  { value: "remaining", label: "Kalan tur/süre" },
  { value: "lap", label: "Güncel tur" },
  { value: "position", label: "Pozisyon" },
  { value: "clock", label: "Gerçek saat" },
  { value: "air", label: "Hava sıcaklığı" },
  { value: "track", label: "Pist sıcaklığı" },
  { value: "wetness", label: "Pist ıslaklığı" },
  { value: "precip", label: "Yağış" },
  { value: "humidity", label: "Nem" },
  { value: "wind", label: "Rüzgâr" },
  { value: "brakeBias", label: "Fren dengesi" },
];

/** Manifestte kullanılacak alan tanımı */
export function headerField(key: string, label: string, def: string[], group = "Başlık"): SettingField {
  return { key, label, type: "multi", default: def, options: HEADER_FIELDS, max: 8, group } as SettingField;
}

export function HeaderStats(props: { fields: string[]; units: Units; sof?: number; class?: string; labels?: string }) {
  const s = useTopic("session");
  const w = useTopic("weather");
  const [now, setNow] = createSignal(Date.now());
  const t = setInterval(() => setNow(Date.now()), 10_000);
  onCleanup(() => clearInterval(t));

  // [yazı etiketi, değer, ikon, ipucu (yoksa ikonun varsayılan adı)]
  const item = (k: string): [string, JSX.Element, WxKind, string?] | null => {
    const ss = s();
    const ww = w();
    switch (k) {
      case "session":
        return ss?.sessionType ? [ss.sessionType, "", sessionIcon(ss.sessionType), ss.sessionType] : null;
      case "sof":
        return props.sof ? ["SOF", (props.sof / 1000).toFixed(1) + "k", "sof"] : null;
      case "incidents":
        return ss ? ["OLAY", `${ss.incidents}${ss.incidentLimit > 0 ? "/" + ss.incidentLimit : ""}x`, "incidents"] : null;
      case "remaining":
        if (!ss) return null;
        if (ss.totalLaps > 0 && ss.lapsRemain >= 0 && ss.lapsRemain < 10000) return ["KALAN", `${ss.lapsRemain} tur`, "remaining", "Kalan tur"];
        return ["KALAN", clock(ss.timeRemain), "remaining", "Kalan süre"];
      case "lap":
        return ss ? ["TUR", ss.totalLaps > 0 ? `${ss.lap}/${ss.totalLaps}` : String(ss.lap), "lap"] : null;
      case "position":
        return ss && ss.classPosition > 0 ? ["P", `${ss.classPosition}/${ss.carCount}`, "position"] : null;
      case "clock":
        return ["SAAT", wallClock(now()), "clock"];
      case "air":
        return ww ? ["HAVA", temp(ww.airTemp, props.units), "air"] : null;
      case "track":
        return ww ? ["PİST", temp(ww.trackTemp, props.units), "track"] : null;
      case "wetness":
        return ww ? ["ZEMİN", WETNESS[ww.wetness] || "—", "wetness"] : null;
      case "precip":
        return ww ? ["YAĞIŞ", pct(ww.precip), "precip"] : null;
      case "humidity":
        return ww ? ["NEM", pct(ww.humidity), "humidity"] : null;
      case "wind":
        return ww ? ["RÜZGÂR", `${wind(ww.windVel, props.units)} ${windUnit(props.units)}`, "wind"] : null;
      case "brakeBias":
        return ss && ss.brakeBias > 0 ? ["FREN", `${ss.brakeBias.toFixed(1)}%`, "brakeBias"] : null;
    }
    return null;
  };

  return (
    <div class={`hdr-stats ${props.class ?? ""}`}>
      <For each={props.fields}>
        {(k) => {
          const v = () => item(k);
          return (
            <Show when={v()} fallback={<span class="hdr-stat">—</span>}>
              <span class="hdr-stat" classList={{ "hdr-only": v()![1] === "" }}>
                {props.labels !== "text" ? (
                  <WxLabel kind={v()![2]} text={v()![0]} title={v()![3]} class="hdr-ic" />
                ) : (
                  <i>{v()![0]}</i>
                )}
                {v()![1]}
              </span>
            </Show>
          );
        }}
      </For>
    </div>
  );
}

/** Oturum türüne göre ikon: yarış damalı bayrak, sıralama kronometre, diğerleri bayrak */
export function sessionIcon(type: string): WxKind {
  const t = type.toLowerCase();
  if (t.includes("race") || t.includes("yarış")) return "race";
  if (t.includes("qual") || t.includes("sıralama")) return "qualify";
  return "practice";
}

/** Sürücü adı biçimi */
export const NAME_FORMATS = [
  { value: "full", label: "Ad Soyad" },
  { value: "initial", label: "A. Soyad" },
  { value: "last", label: "Soyad" },
  { value: "first", label: "Ad S." },
  { value: "upper", label: "SOYAD" },
];

export function formatName(name: string, fmt: string | undefined): string {
  if (!fmt || fmt === "full") return name;
  const parts = name.trim().split(/\s+/).filter((p) => !/^\d+$/.test(p));
  if (parts.length < 2) return name;
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  switch (fmt) {
    case "initial":
      return `${first[0]}. ${last}`;
    case "last":
      return last;
    case "first":
      return `${first} ${parts[parts.length - 1][0]}.`;
    case "upper":
      return last.toLocaleUpperCase("tr");
  }
  return name;
}
