import { For, Show, createMemo } from "solid-js";
import { orderValue, type OverlayProps } from "@/sdk/overlay";
import { useRows, useTopic } from "@/sdk/telemetry";
import { Flag } from "@/sdk/Flag";
import { irating, lapTime } from "@/sdk/format";
import type { Row } from "@/sdk/types";
import { settings } from "@/sdk/settings";
import { CarLogo } from "@/sdk/logos";
import { friendOf, friendRowStyle, friendsOn } from "@/sdk/friends";
import { HeaderStats, formatName } from "@/sdk/HeaderStats";
import { FriendBadge } from "@/sdk/FriendBadge";
import { TireBadge } from "@/sdk/TireBadge";
import { t } from "@/sdk/i18n";
import { LicenseBadge } from "@/sdk/LicenseBadge";
import { RELATIVE_COLUMNS, RELATIVE_DEFAULT_COLUMNS } from "./manifest";
import "./style.css";

export function LicensePill(props: { r: Row }) {
  return <LicenseBadge letter={props.r.licLetter} sr={props.r.sr} color={props.r.licColor} />;
}

export function IrPill(props: { r: Row; delta: boolean }) {
  return (
    <span class="irp" classList={{ "irp-d": props.delta }} data-no-i18n>
      <b>{irating(props.r.irating)}</b>
      <Show when={props.delta}>
        <span classList={{ up: props.r.irDelta > 0, down: props.r.irDelta < 0 }}>
          {props.r.irDelta === 0 ? "" : (props.r.irDelta > 0 ? "▲" : "▼") + Math.abs(props.r.irDelta)}
        </span>
      </Show>
    </span>
  );
}

/** Lisans, SR ve iRating tek rozette (Görünüm → tek rozet) */
export function ComboPill(props: { r: Row; delta: boolean }) {
  return (
    <LicenseBadge class="combo" letter={props.r.licLetter} sr={props.r.sr} color={props.r.licColor} digits={1}>
      {irating(props.r.irating)}
      <Show when={props.delta && props.r.irDelta !== 0}>
        <i classList={{ up: props.r.irDelta > 0, down: props.r.irDelta < 0 }}>{props.r.irDelta > 0 ? "▲" : "▼"}</i>
      </Show>
    </LicenseBadge>
  );
}

/** Bayrak kodu -> [görünüm sınıfı, ad]. Sim'den gelen kısa kodlar (BLK/DSQ/REP/BLU) ve renk adları. */
const FLAG_SWATCH: Record<string, [string, string]> = {
  blk: ["black", "Siyah bayrak"],
  black: ["black", "Siyah bayrak"],
  dsq: ["dsq", "Diskalifiye (siyah bayrak)"],
  disqualify: ["dsq", "Diskalifiye (siyah bayrak)"],
  rep: ["meatball", "Teknik bayrak (turuncu toplu siyah)"],
  repair: ["meatball", "Teknik bayrak (turuncu toplu siyah)"],
  meatball: ["meatball", "Teknik bayrak (turuncu toplu siyah)"],
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

/** Eski ayarlardan (showClass vb.) sütun listesi */
function legacyColumns(o: Record<string, unknown>) {
  const map: Record<string, string> = { class: "showClass", car: "showCar", stint: "showStint", license: "showLicense", irating: "showIrating", last: "showLast", tire: "showTire", flag: "showFlags" };
  return RELATIVE_DEFAULT_COLUMNS.map((c) => ({ key: c.key, on: map[c.key] && typeof o[map[c.key]] === "boolean" ? (o[map[c.key]] as boolean) : c.on }));
}

/** Üst / alt bilgi satırının yazı ölçeği (ayar: %80–%200) */
const barK = (v: unknown) => Math.min(2, Math.max(0.8, (Number(v) || 120) / 100));

export default function Relative(props: OverlayProps) {
  const data = useTopic("relative");

  // Satır kimliği araç idx'ine göre sabit: her pakette DOM (logo/bayrak resimleri) yeniden kurulmaz
  const stable = useRows(() => data()?.rows);
  const rows = createMemo(() => {
    const all = stable();
    const n = props.options.rows as number;
    const me = all.findIndex((r) => r.isMe);
    if (me < 0) return all;
    return all.slice(Math.max(0, me - n), me + n + 1);
  });

  /** Elle ayarlanmış sütun genişliği (px); 0 = varsayılan */
  const colW = (key: string) => {
    const v = Number((props.options.colWidths as Record<string, unknown> | undefined)?.[key]);
    return Number.isFinite(v) && v > 0 ? Math.max(2, Math.min(600, v)) : 0;
  };

  const columns = createMemo(() =>
    orderValue({ options: RELATIVE_COLUMNS, default: RELATIVE_DEFAULT_COLUMNS }, props.options.columns ?? legacyColumns(props.options))
      .filter((c) => c.on)
      // Genişliği elle ayarlanmış sütun "*" ile işaretlenir: hücre sabit genişlikli sarmalayıcıya girer
      .map((c) => (colW(c.key) ? c.key + "*" : c.key)),
  );
  const isOn = (k: string) => columns().includes(k) || columns().includes(k + "*");
  /** Tahmini iRating değişimi yalnızca yarışta dolu gelir: diğer oturumlarda yer ayrılmaz */
  const delta = createMemo(() => props.options.showIrDelta !== false && (data()?.rows ?? []).some((r) => r.irDelta !== 0));

  const cell = (key: string, r: Row) => {
    switch (key) {
      case "class":
        return <span class="rel-class" style={{ background: r.classColor || "#666" }} />;
      case "pos":
        return <span class="rel-pos">{r.classPos > 0 ? r.classPos : "-"}</span>;
      case "num":
        return <span class="rel-num">{r.number}</span>;
      case "flair":
        return (
          <span class="rel-flair" data-no-i18n>
            <Flag code={r.flair} />
          </span>
        );
      case "name":
        return (
          <span class="rel-name">
            <FriendBadge place="relative" userId={r.userId} name={r.name} />
            <span data-no-i18n>{formatName(r.name, props.options.nameFormat as string)}</span>
            <Show when={friendsOn("relative") && friendOf(r.userId, r.name)?.tag}>
              <span class="ov-tag rel-dtag">{friendOf(r.userId, r.name)!.tag}</span>
            </Show>
          </span>
        );
      case "car":
        return <CarLogo class="rel-car" cell carName={r.carName || r.car} fallback={r.car} scale={((props.options.logoSize as number) ?? 150) / 100} />;
      case "stint":
        return (
          <span class="rel-stint">
            <Show when={r.pitState} fallback={<>{r.stint > 0 ? `T${r.stint}` : ""}</>}>
              <span class={`ov-tag ps ps-${r.pitState.toLowerCase()}`}>{r.pitState}</span>
            </Show>
          </span>
        );
      case "license":
        return (
          <Show when={!settings().theme.combineLicense} fallback={<ComboPill r={r} delta={delta()} />}>
            <LicensePill r={r} />
          </Show>
        );
      case "irating":
        return (
          <Show when={!settings().theme.combineLicense} fallback={<Show when={!isOn("license")}><ComboPill r={r} delta={delta()} /></Show>}>
            <IrPill r={r} delta={delta()} />
          </Show>
        );
      case "last":
        return (
          <span class="rel-last ov-mono" classList={{ pb: r.lastPb }}>
            {lapTime(r.last)}
          </span>
        );
      case "tire":
        return (
          <span class="rel-tire">
            <TireBadge kind={r.tireKind} />
          </span>
        );
      case "gap":
        return <span class="rel-gap ov-mono">{r.isMe ? "" : (r.gap > 0 ? "-" : "+") + Math.abs(r.gap).toFixed(1)}</span>;
      case "flag":
        return (
          <span class="rel-flag">
            <FlagBadge flag={r.flag} />
          </span>
        );
    }
    return null;
  };

  const col = (c: string, r: Row) => {
    if (!c.endsWith("*")) return cell(c, r);
    const key = c.slice(0, -1);
    return (
      // Tek rozet açıkken iRating sütunu lisans rozetine taşınır: boş sarmalayıcı yer kaplamasın
      <Show when={!(key === "irating" && settings().theme.combineLicense && isOn("license"))}>
        <span class="rel-cw" classList={{ "rel-cw-name": key === "name" }} style={{ "--cw": String(colW(key)) }}>
          {cell(key, r)}
        </span>
      </Show>
    );
  };

  const rowClass = (r: Row) =>
    r.isMe ? "me" : r.onPit ? "pit" : r.lapRel > 0 ? "ahead-lap" : r.lapRel < 0 ? "behind-lap" : "";

  return (
    <div class="ov-panel rel">
      <Show when={props.options.showHeader && data()}>
        <div class="rel-head" style={{ "font-size": `${0.92 * barK(props.options.barSize)}em` }}>
          <HeaderStats labels={props.options.labelStyle as string} fields={(props.options.headerFields as string[]) ?? ["air", "track", "wetness", "humidity", "precip"]} units={props.units} sof={data()!.sof} />
        </div>
      </Show>
      <Show when={rows().length > 0} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        <div class="rel-rows">
          <For each={rows()}>
            {(r) => (
              <div class={`rel-row ${rowClass(r)}`} style={r.isMe ? undefined : friendRowStyle("relative", r.userId, r.name)}>
                <For each={columns()}>{(c) => col(c, r)}</For>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.options.showFooter && data()}>
        <div class="rel-foot" style={{ "font-size": `${0.92 * barK(props.options.barSize)}em` }}>
          <HeaderStats labels={props.options.labelStyle as string} fields={(props.options.footerFields as string[]) ?? ["sof", "incidents", "position", "brakeBias", "remaining", "clock"]} units={props.units} sof={data()!.sof} />
        </div>
      </Show>
    </div>
  );
}
