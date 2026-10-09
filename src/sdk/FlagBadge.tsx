import { Show } from "solid-js";
import { t } from "./i18n";
import "./FlagBadge.css";

/** Bayrak kodu -> [görünüm sınıfı, ad]. Sim'den gelen kısa kodlar (BLK/DSQ/REP/BLU) ve renk adları. */
const FLAG_SWATCH: Record<string, [string, string]> = {
  blk: ["black", "Siyah bayrak"],
  black: ["black", "Siyah bayrak"],
  dsq: ["dsq", "Diskalifiye (siyah bayrak)"],
  disqualify: ["dsq", "Diskalifiye (siyah bayrak)"],
  rep: ["meatball", "Teknik bayrak (turuncu toplu siyah)"],
  repair: ["meatball", "Teknik bayrak (turuncu toplu siyah)"],
  meatball: ["meatball", "Teknik bayrak (turuncu toplu siyah)"],
  wrn: ["furled", "Uyarı (kıvrık siyah bayrak)"],
  furled: ["furled", "Uyarı (kıvrık siyah bayrak)"],
  blu: ["blue", "Mavi bayrak"],
  blue: ["blue", "Mavi bayrak"],
  yellow: ["yellow", "Sarı bayrak"],
  yel: ["yellow", "Sarı bayrak"],
  green: ["green", "Yeşil bayrak"],
  grn: ["green", "Yeşil bayrak"],
  white: ["white", "Beyaz bayrak"],
  wht: ["white", "Beyaz bayrak"],
  red: ["red", "Kırmızı bayrak"],
  checkered: ["checkered", "Damalı bayrak"],
  chk: ["checkered", "Damalı bayrak"],
  debris: ["debris", "Pistte döküntü bayrağı"],
  slow: ["slow", "Yavaşla uyarısı"],
};

/** Bayrak sütunu: yazısız renkli bayrak; adı ipucunda */
export function FlagBadge(props: { flag: string }) {
  const info = () => (props.flag ? FLAG_SWATCH[props.flag.toLowerCase()] : undefined);
  return (
    <Show when={info()}>
      <span class={`fsw fsw-${info()![0]}`} title={info()![1]} data-tip={t(info()![1])} />
    </Show>
  );
}

