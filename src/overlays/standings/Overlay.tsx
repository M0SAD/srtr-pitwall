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
import { LicenseBadge } from "@/sdk/LicenseBadge";
import { Helmet } from "@/sdk/Helmet";
import { t } from "@/sdk/i18n";
import "./style.css";

interface Group {
  info: ClassInfo;
  /** Oyuncunun sınıfı (ya da izleyicide her sınıf): "önümde/arkamda" satırları da ayrılır */
  mine: boolean;
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
  // Ayrılan satır sayısı dolsun: oyuncu öndeyse (ya da pist kenarındaysa) boş kalan yere sıradaki araçlar gelir
  if (mine) for (let i = Math.min(top, rows.length); keep.size < Math.min(top + 2 * around + 1, rows.length) && i < rows.length; i++) keep.add(i);
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

/** Bir sınıf bölümünün ayırdığı satır sayısı: pencere boyu araç sayısından bağımsız, hep bu kadar yer tutar */
function capOf(o: Record<string, any>, mine: boolean): number {
  if ((o.drivers ?? "all") !== "smart") return Math.max(1, Number(o.maxRows) || 8);
  const top = mine ? (o.topOwn ?? 8) : (o.topOther ?? 3);
  return Math.max(1, Number(top) + (mine ? 2 * Number(o.around ?? 2) + 1 : 0));
}

/** Eski ayarlardan (showFlair vb.) sütun listesi */
function legacyColumns(o: Record<string, unknown>) {
  const map: Record<string, string> = { flair: "showFlair", change: "showChange", car: "showCar", irating: "showIrating", avg: "showAvg", last: "showLast", best: "showBest" };
  return STANDINGS_DEFAULT_COLUMNS.map((c) => ({ key: c.key, on: map[c.key] && typeof o[map[c.key]] === "boolean" ? (o[map[c.key]] as boolean) : c.on }));
}

/** Üst / alt bilgi satırının yazı ölçeği (ayar: %80–%200) */
const barK = (v: unknown) => Math.min(2, Math.max(0.8, (Number(v) || 120) / 100));

export default function Standings(props: OverlayProps) {
  const data = useTopic("standings");

  /** Elle ayarlanmış sütun genişliği (px); 0 = varsayılan */
  const colW = (key: string) => {
    const v = Number((props.options.colWidths as Record<string, unknown> | undefined)?.[key]);
    return Number.isFinite(v) && v > 0 ? Math.max(2, Math.min(600, v)) : 0;
  };

  const columns = createMemo(() =>
    orderValue(
      { options: STANDINGS_COLUMNS, default: STANDINGS_DEFAULT_COLUMNS },
      props.options.columns ?? legacyColumns(props.options),
    )
      .filter((c) => c.on)
      // Genişliği elle ayarlanmış sütun "*" ile işaretlenir: hücre sabit genişlikli sarmalayıcıya girer
      .map((c) => (colW(c.key) ? c.key + "*" : c.key)),
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
        ? pick(rows, mine ? ((props.options.topOwn as number) ?? 8) : ((props.options.topOther as number) ?? 3), (props.options.around as number) ?? 2, mine)
        : trim(rows, max);
    if (!d.multiclass) {
      const info = d.classes[0] ?? { id: 0, name: "", color: "#888", count: all.length, sof: 0 };
      return [{ info, mine: true, rows: sel(all, true) }];
    }
    return d.classes
      .map((c) => ({ info: c, mine: c.id === myClass || myClass === undefined, rows: sel(all.filter((r) => r.classId === c.id), c.id === myClass || myClass === undefined) }))
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
        return <LicenseBadge class="st-lic" letter={r.licLetter} sr={r.sr} color={r.licColor} />;
      case "irating":
        return <span class="st-ir">{irating(r.irating)}</span>;
      case "irDelta":
        // Sadece yarışta: diğer oturumlarda sütun hiç yer kaplamaz
        return (
          <Show when={data()?.race}>
            <span class="st-ird ov-mono" classList={{ up: r.irDelta > 0, down: r.irDelta < 0 }} data-no-i18n>
              <span class="st-v">{r.irDelta === 0 ? "" : (r.irDelta > 0 ? "+" : "−") + Math.abs(r.irDelta)}</span>
            </span>
          </Show>
        );
      case "pits":
        return <span class="st-pits ov-dim">{r.pits > 0 ? `${r.pits}P` : ""}</span>;
      case "gap":
        return <span class="st-gap ov-mono"><span class="st-v">{gapText(r)}</span></span>;
      case "avg":
        return <span class="st-lap ov-mono"><span class="st-v">{lapTime(r.avg5)}</span></span>;
      case "last":
        return (
          <span class="st-lap ov-mono" classList={{ pb: r.lastPb }}>
            <span class="st-v">{lapTime(r.last)}</span>
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
            <span class="st-v">{lapTime(r.best)}</span>
          </span>
        );
    }
    return null;
  };

  const col = (c: string, r: Row): JSX.Element => {
    if (!c.endsWith("*")) return cell(c, r);
    const key = c.slice(0, -1);
    return (
      // irDelta yalnızca yarışta yer kaplar
      <Show when={key !== "irDelta" || data()?.race}>
        <span class="st-cw" classList={{ "st-cw-name": key === "name" }} style={{ "--cw": String(colW(key)) }}>
          {cell(key, r)}
        </span>
      </Show>
    );
  };

  /** Bölümün sabit yüksekliği için CSS değişkenleri (satır sayısı, sınıf başlığı, "⋯" ayırıcı payı) */
  const capStyle = (mine: boolean, head: boolean) => {
    const smart = (props.options.drivers ?? "all") === "smart";
    // "Hepsi" kipinde ayırıcı bir satırın yerini alır; akıllı kipte kendi sınıfımda satırlara ek olarak çıkabilir
    const sep = smart && mine && Number(props.options.topOwn ?? 8) > 0;
    return { "--st-cap": String(capOf(props.options, mine)), "--st-hd": head ? "1" : "0", "--st-sep": sep ? "1" : "0" };
  };

  const rowBg = () => (props.options.rowOpacity as number) ?? 100;

  return (
    <div class="ov-panel st" data-per={(props.options.drivers ?? "all") === "smart" ? Math.max(1, groups().filter((g) => g.mine).length) : Math.max(1, groups().length)} style={{ "--ov-w": `${Math.min(1600, Math.max(300, Number(props.options.width) || 560))}px`, "--st-bg": `${rowBg()}%`, "--st-gap-w": `${5.5 + Math.max(0, Math.min(3, (props.options.decimals as number) ?? 1))}ch` }}>
      <Show when={props.options.showHeader && data()}>
        <div class="st-head" style={{ "font-size": `${barK(props.options.barSize)}em` }}>
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
      <Show when={props.options.showHeader && !data()}>
        <div class="st-head" style={{ "font-size": `${barK(props.options.barSize)}em` }}>&nbsp;</div>
      </Show>
      <Show when={groups().length > 0} fallback={<div class="st-group st-wait mine" style={capStyle(true, false)}><div class="ov-empty">Veri bekleniyor…</div></div>}>
        <For each={groupIds()}>
          {(id) => (
            <div class="st-group" classList={{ mine: !!groupOf(id)?.mine }} style={capStyle(!!groupOf(id)?.mine, !!data()?.multiclass)}>
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
                    <div class="st-row" classList={{ me: r.isMe, pit: r.onPit, gone: !!r.gone }} style={r.isMe ? undefined : friendRowStyle("standings", r.userId, r.name)}>
                      <span class="st-accent" style={{ background: r.classColor || "#888" }} />
                      <span class="st-pos">{data()?.multiclass ? r.classPos : r.pos}</span>
                      <For each={columns()}>{(c) => col(c, r)}</For>
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
