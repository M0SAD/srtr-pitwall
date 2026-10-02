import { For, Show, createMemo, type JSX } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { orderValue } from "@/sdk/overlay";
import { useRows, useTopic } from "@/sdk/telemetry";
import { clock, irating, lapTime } from "@/sdk/format";
import type { ClassInfo, Row } from "@/sdk/types";
import { CarLogo } from "@/sdk/logos";
import { friendOf, friendRowStyle, friendsOn } from "@/sdk/friends";
import { FriendBadge } from "@/sdk/FriendBadge";
import { HeaderStats, formatName, sessionIcon } from "@/sdk/HeaderStats";
import { WxLabel } from "@/sdk/WxIcon";
import { TireBadge } from "@/sdk/TireBadge";
import { STANDINGS_COLUMNS, STANDINGS_DEFAULT_COLUMNS } from "./manifest";
import { Flag } from "@/sdk/Flag";
import { Helmet } from "@/sdk/Helmet";
import { t } from "@/sdk/i18n";
import "./style.css";

interface Group {
  info: ClassInfo;
  rows: (Row | null)[]; // null = "…" ayırıcı
}

/** Uzun listeyi kısalt ama oyuncuyu her zaman göster. */
function trim(rows: Row[], max: number): (Row | null)[] {
  if (rows.length <= max) return rows;
  const me = rows.findIndex((r) => r.isMe);
  if (me < 0 || me < max - 1) return rows.slice(0, max);
  const around = 3;
  const top = rows.slice(0, Math.max(1, max - around - 1));
  const mid = rows.slice(Math.max(top.length, me - 1), me + 2);
  return [...top, null, ...mid];
}

/** İlk `top` araç + oyuncunun önü/arkası; aradaki boşluklar ayırıcı olur. */
function pick(rows: Row[], top: number, around: number, mine: boolean): (Row | null)[] {
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(top, rows.length); i++) keep.add(i);
  const me = rows.findIndex((r) => r.isMe);
  if (mine && me >= 0) for (let i = Math.max(0, me - around); i <= Math.min(rows.length - 1, me + around); i++) keep.add(i);
  const out: (Row | null)[] = [];
  let last = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (last >= 0 && i > last + 1) out.push(null);
    out.push(rows[i]);
    last = i;
  }
  if (out.length === 0 && rows.length > 0) out.push(rows[0]);
  return out;
}

/** Eski ayarlardan (showFlair vb.) sütun listesi */
function legacyColumns(o: Record<string, unknown>) {
  const map: Record<string, string> = { flair: "showFlair", change: "showChange", car: "showCar", irating: "showIrating", avg: "showAvg", last: "showLast", best: "showBest" };
  return STANDINGS_DEFAULT_COLUMNS.map((c) => ({ key: c.key, on: map[c.key] && typeof o[map[c.key]] === "boolean" ? (o[map[c.key]] as boolean) : c.on }));
}

export default function Standings(props: OverlayProps) {
  const data = useTopic("standings");

  const columns = createMemo(() =>
    orderValue(
      { options: STANDINGS_COLUMNS, default: STANDINGS_DEFAULT_COLUMNS },
      props.options.columns ?? legacyColumns(props.options),
    )
      .filter((c) => c.on)
      .map((c) => c.key),
  );

  // Satır kimliği araç idx'ine göre sabit: her pakette DOM (logo/bayrak resimleri) yeniden kurulmaz
  const stable = useRows(() => data()?.rows);

  const groups = createMemo<Group[]>(() => {
    const d = data();
    if (!d) return [];
    const smart = (props.options.drivers ?? "all") === "smart";
    const max = props.options.maxRows as number;
    const all = stable();
    const myClass = all.find((r) => r.isMe)?.classId;
    const sel = (rows: Row[], mine: boolean) =>
      smart
        ? pick(rows, mine ? (props.options.topOwn as number) : (props.options.topOther as number), props.options.around as number, mine)
        : trim(rows, max);
    if (!d.multiclass) {
      const info = d.classes[0] ?? { id: 0, name: "", color: "#888", count: all.length, sof: 0 };
      return [{ info, rows: sel(all, true) }];
    }
    return d.classes
      .map((c) => ({ info: c, rows: sel(all.filter((r) => r.classId === c.id), c.id === myClass || myClass === undefined) }))
      .filter((g) => g.rows.length > 0);
  });

  // Gruplar sınıf kimliğine göre anahtarlanır (değerce): grup nesnesi her pakette yenilense de DOM yerinde kalır
  const groupIds = createMemo(() => groups().map((g) => g.info.id));
  const groupOf = (id: number) => groups().find((g) => g.info.id === id);

  const mySof = () => {
    const d = data();
    const me = d?.rows.find((r) => r.isMe);
    return d?.classes.find((c) => c.id === me?.classId)?.sof ?? d?.classes[0]?.sof ?? 0;
  };

  const gapText = (r: Row) => {
    const d = data()!;
    const v = props.options.gapMode === "interval" ? r.interval : r.gap;
    if (d.race && r.lapsDown > 0 && props.options.gapMode === "gap") return `+${r.lapsDown}T`;
    if (r.classPos === 1) return d.race ? "Lider" : "—";
    if (v <= 0) return "-";
    return "+" + v.toFixed((props.options.decimals as number) ?? 1);
  };

  const sessionTime = (bare = false) => {
    const d = data();
    if (!d) return "";
    if (d.totalLaps > 0) return bare ? `${d.leaderLap}/${d.totalLaps}` : `Tur ${d.leaderLap}/${d.totalLaps}`;
    if (d.totalTime > 0) return `${clock(d.elapsed)} / ${clock(d.totalTime)}`;
    return clock(d.elapsed);
  };

  const cell = (key: string, r: Row): JSX.Element => {
    switch (key) {
      case "flair":
        return (
          <span class="st-flair" data-no-i18n>
            <Flag code={r.flair} />
          </span>
        );
      case "name": {
        const tag = friendsOn("standings") ? friendOf(r.userId, r.name)?.tag : "";
        return (
          <span class="st-name">
            <FriendBadge place="standings" userId={r.userId} name={r.name} />
            <span data-no-i18n>{formatName(r.name, props.options.nameFormat as string)}</span>
            <Show when={tag}>
              <span class="ov-tag st-dtag">{tag}</span>
            </Show>
            <Show when={r.pitState}>
              <span class="ov-tag st-pit">{r.pitState}</span>
            </Show>
          </span>
        );
      }
      case "change":
        return (
          <span class="st-chg" classList={{ up: r.posChange > 0, down: r.posChange < 0 }}>
            {r.posChange !== 0 ? `${r.posChange > 0 ? "▲" : "▼"}${Math.abs(r.posChange)}` : ""}
          </span>
        );
      case "car":
        return <CarLogo class="st-car" cell={(props.options.carStyle ?? "logo") === "logo"} carName={r.carName || r.car} fallback={r.car} mode={props.options.carStyle as "logo" | "text" | "both"} scale={((props.options.logoSize as number) ?? 150) / 100} />;
      case "license":
        return (
          <span class="ov-tag st-lic" style={{ background: r.licColor || "#666" }}>
            {r.licLetter} {r.sr.toFixed(1)}
          </span>
        );
      case "irating":
        return <span class="st-ir">{irating(r.irating)}</span>;
      case "pits":
        return <span class="st-pits ov-dim">{r.pits > 0 ? `${r.pits}P` : ""}</span>;
      case "gap":
        return <span class="st-gap ov-mono">{gapText(r)}</span>;
      case "avg":
        return <span class="st-lap ov-mono">{lapTime(r.avg5)}</span>;
      case "last":
        return (
          <span class="st-lap ov-mono" classList={{ pb: r.lastPb }}>
            {lapTime(r.last)}
          </span>
        );
      case "tire":
        return (
          <span class="st-tire">
            <TireBadge kind={r.tireKind} />
          </span>
        );
      case "best":
        return (
          <span class="st-lap ov-mono st-best" classList={{ best: r.classBest }}>
            {lapTime(r.best)}
          </span>
        );
    }
    return null;
  };

  const rowBg = () => (props.options.rowOpacity as number) ?? 100;

  return (
    <div class="ov-panel st" style={{ "--st-bg": `${rowBg()}%` }}>
      <Show when={props.options.showHeader && data()}>
        <div class="st-head">
          <Show
            when={props.options.labelStyle !== "text"}
            fallback={
              <span>
                <b>{data()!.sessionType || "Oturum"}</b> <span class="ov-mono">{sessionTime()}</span>
              </span>
            }
          >
            <span class="st-sess">
              <WxLabel kind={sessionIcon(data()!.sessionType)} text="" title={data()!.sessionType || "Oturum"} class="st-sess-ic" />
              <WxLabel kind={data()!.totalLaps > 0 ? "lap" : "clock"} text="" title={data()!.totalLaps > 0 ? "Lider turu / toplam" : "Geçen / toplam süre"} class="st-sess-ic" />
              <span class="ov-mono">{sessionTime(true)}</span>
            </span>
          </Show>
          <HeaderStats labels={props.options.labelStyle as string} fields={(props.options.headerFields as string[]) ?? []} units={props.units} sof={mySof()} />
          <span class="ov-dim st-count" title={t("{0} araç", data()!.carCount)}>
            <Helmet /> {data()!.carCount}
          </span>
        </div>
      </Show>
      <Show when={groups().length > 0} fallback={<div class="ov-empty">Veri bekleniyor…</div>}>
        <For each={groupIds()}>
          {(id) => (
            <div class="st-group">
              <Show when={data()?.multiclass && groupOf(id)}>
                <div class="st-class">
                  <span class="st-ribbon" style={{ background: groupOf(id)?.info.color || "#888" }}>
                    {groupOf(id)?.info.name || "Sınıf"}
                  </span>
                  <span class="ov-dim st-count" title={t("{0} araç", groupOf(id)?.info.count ?? 0)}>
                    <Helmet /> {groupOf(id)?.info.count ?? 0}
                  </span>
                  <span>
                    <span class="ov-tag st-sof">SOF</span> {irating(groupOf(id)?.info.sof ?? 0)}
                  </span>
                </div>
              </Show>
              <For each={groupOf(id)?.rows ?? []}>
                {(r) =>
                  r === null ? (
                    <div class="st-gap-row">⋯</div>
                  ) : (
                    <div class="st-row" classList={{ me: r.isMe, pit: r.onPit }} style={r.isMe ? undefined : friendRowStyle("standings", r.userId, r.name)}>
                      <span class="st-accent" style={{ background: r.classColor || "#888" }} />
                      <span class="st-pos">{data()?.multiclass ? r.classPos : r.pos}</span>
                      <For each={columns()}>{(c) => cell(c, r)}</For>
                    </div>
                  )
                }
              </For>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
