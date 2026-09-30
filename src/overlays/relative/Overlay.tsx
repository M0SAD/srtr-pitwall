import { For, Show, createMemo } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { irating, lapTime } from "@/sdk/format";
import type { Row } from "@/sdk/types";
import { settings } from "@/sdk/settings";
import { CarLogo } from "@/sdk/logos";
import { friendOf, friendRowStyle, friendsOn } from "@/sdk/friends";
import { HeaderStats, formatName } from "@/sdk/HeaderStats";
import { FriendBadge } from "@/sdk/FriendBadge";
import "./style.css";

export function LicensePill(props: { r: Row }) {
  return (
    <span class="lic" style={{ "--lc": props.r.licColor || "#555" }}>
      <b>{props.r.licLetter || "–"}</b>
      <span>{props.r.sr > 0 ? props.r.sr.toFixed(2) : "–"}</span>
    </span>
  );
}

export function IrPill(props: { r: Row; delta: boolean }) {
  return (
    <span class="irp">
      <b>{irating(props.r.irating)}</b>
      <Show when={props.delta && props.r.irDelta !== 0}>
        <span classList={{ up: props.r.irDelta > 0, down: props.r.irDelta < 0 }}>
          {props.r.irDelta > 0 ? "▲" : "▼"}
          {Math.abs(props.r.irDelta)}
        </span>
      </Show>
    </span>
  );
}

/** Lisans, SR ve iRating tek rozette (Görünüm → tek rozet) */
export function ComboPill(props: { r: Row; delta: boolean }) {
  return (
    <span class="lic combo" style={{ "--lc": props.r.licColor || "#555" }}>
      <b>{props.r.licLetter || "–"}</b>
      <span>
        {props.r.sr > 0 ? props.r.sr.toFixed(1) : "–"} · {irating(props.r.irating)}
        <Show when={props.delta && props.r.irDelta !== 0}>
          <i classList={{ up: props.r.irDelta > 0, down: props.r.irDelta < 0 }}>{props.r.irDelta > 0 ? "▲" : "▼"}</i>
        </Show>
      </span>
    </span>
  );
}

export function FlagBadge(props: { flag: string }) {
  return (
    <Show when={props.flag}>
      <span class={`ov-tag fb fb-${props.flag.toLowerCase()}`}>{props.flag}</span>
    </Show>
  );
}

export default function Relative(props: OverlayProps) {
  const data = useTopic("relative");

  const rows = createMemo(() => {
    const all = data()?.rows ?? [];
    const n = props.options.rows as number;
    const me = all.findIndex((r) => r.isMe);
    if (me < 0) return all;
    return all.slice(Math.max(0, me - n), me + n + 1);
  });

  const rowClass = (r: Row) =>
    r.isMe ? "me" : r.onPit ? "pit" : r.lapRel > 0 ? "ahead-lap" : r.lapRel < 0 ? "behind-lap" : "";

  return (
    <div class="ov-panel rel">
      <Show when={props.options.showHeader && data()}>
        <div class="rel-head">
          <HeaderStats fields={(props.options.headerFields as string[]) ?? ["air", "track", "wetness", "humidity", "precip"]} units={props.units} sof={data()!.sof} />
        </div>
      </Show>
      <Show when={rows().length > 0} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        <div class="rel-rows">
          <For each={rows()}>
            {(r) => (
              <div class={`rel-row ${rowClass(r)}`} style={r.isMe ? undefined : friendRowStyle("relative", r.userId, r.name)}>
                <Show when={props.options.showClass}>
                  <span class="rel-class" style={{ background: r.classColor || "#666" }} />
                </Show>
                <span class="rel-pos">{r.classPos > 0 ? r.classPos : "-"}</span>
                <span class="rel-num">{r.number}</span>
                <span class="rel-name">
                  <FriendBadge place="relative" userId={r.userId} name={r.name} />
                  <span data-no-i18n>{formatName(r.name, props.options.nameFormat as string)}</span>
                  <Show when={friendsOn("relative") && friendOf(r.userId, r.name)?.tag}>
                    <span class="ov-tag rel-dtag">{friendOf(r.userId, r.name)!.tag}</span>
                  </Show>
                </span>
                <Show when={props.options.showCar}>
                  <CarLogo class="rel-car" carName={r.carName || r.car} fallback={r.car} />
                </Show>
                <Show when={props.options.showStint}>
                  <span class="rel-stint">
                    <Show when={r.pitState} fallback={<>{r.stint > 0 ? `T${r.stint}` : ""}</>}>
                      <span class={`ov-tag ps ps-${r.pitState.toLowerCase()}`}>{r.pitState}</span>
                    </Show>
                  </span>
                </Show>
                <Show
                  when={!settings().theme.combineLicense}
                  fallback={
                    <Show when={props.options.showLicense || props.options.showIrating}>
                      <ComboPill r={r} delta={props.options.showIrDelta} />
                    </Show>
                  }
                >
                  <Show when={props.options.showLicense}>
                    <LicensePill r={r} />
                  </Show>
                  <Show when={props.options.showIrating}>
                    <IrPill r={r} delta={props.options.showIrDelta} />
                  </Show>
                </Show>
                <Show when={props.options.showLast}>
                  <span class="rel-last ov-mono" classList={{ pb: r.lastPb }}>
                    {lapTime(r.last)}
                  </span>
                </Show>
                <span class="rel-gap ov-mono">{r.isMe ? "" : (r.gap > 0 ? "-" : "+") + Math.abs(r.gap).toFixed(1)}</span>
                <Show when={props.options.showFlags}>
                  <span class="rel-flag">
                    <FlagBadge flag={r.flag} />
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.options.showFooter && data()}>
        <div class="rel-foot">
          <HeaderStats fields={(props.options.footerFields as string[]) ?? ["sof", "incidents", "remaining", "clock"]} units={props.units} sof={data()!.sof} />
        </div>
      </Show>
    </div>
  );
}
