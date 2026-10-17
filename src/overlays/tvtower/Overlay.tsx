import { Index, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { previewFrozen } from "@/sdk/overlay";
import { Flag } from "@/sdk/Flag";
import { isRaceSession, useFinishReady, useTvVisible, TvLogo, gapToLeader, hms, intervalText, numberColors, sessionLabel, tvName, upper, useTvStandings, withDefaults } from "@/sdk/tvkit";
import type { Row } from "@/sdk/types";
import manifest from "./manifest";
import "./style.css";

// TV Sıralama Kulesi: GT yayınlarındaki soldaki dikey sıralama.

// "206 LAPS": sayı normal, LAPS küçük (TV'deki gibi)
function lapsSmall(t: string) {
  const m = /^(\d+) (LAPS?)$/.exec(t);
  return m ? (
    <>
      {m[1]}
      <small class="tvt-laps">{m[2]}</small>
    </>
  ) : (
    t
  );
}

export default function TvTower(props: OverlayProps) {
  const o = withDefaults(manifest, () => props.options);
  const { rows, info, sample, session: ses } = useTvStandings(() => !!props.editing);

  // Fark sütunu "sırayla": 10 sn lidere fark, 10 sn öndekine fark
  const [phase, setPhase] = createSignal(0);
  const iv = window.setInterval(() => !previewFrozen() && setPhase((p) => (p + 1) % 2), 10_000);
  onCleanup(() => clearInterval(iv));
  const gapMode = () => (o().gapMode === "cycle" ? (phase() ? "interval" : "leader") : (o().gapMode as string) || "leader");

  const me = createMemo(() => rows().find((r) => r.isMe));
  const filtered = createMemo(() => {
    const all = rows();
    if (o().classFilter === "mine" && me()) return all.filter((r) => r.classId === me()!.classId).sort((a, b) => a.classPos - b.classPos);
    return all;
  });
  const n = () => Math.max(5, Math.min(40, Number(o().rows) || 25));
  // Sayfalar: listeye sığmayan araçlar varsa sırayla sonraki sayfalar gösterilir (ilk sayfa daha uzun kalır).
  // "Üstte sabit": sonraki sayfalarda ilk K sıra da görünür (lider ve ön sıralar ekrandan kalkmasın).
  const keep = () => Math.max(0, Math.min(n() - 3, Number(o().keepTop) || 0));
  const pages = createMemo(() => {
    const total = filtered().length;
    if (o().pageCycle === false || total <= n()) return 1;
    return 1 + Math.ceil((total - n()) / Math.max(1, n() - keep()));
  });
  const [page, setPage] = createSignal(0);
  let pageAt = Date.now();
  let nextOther = 0;
  const pv = window.setInterval(() => {
    if (previewFrozen()) return;
    const p = page();
    if (p >= pages()) {
      setPage(0);
      pageAt = Date.now();
      return;
    }
    if (pages() <= 1) return;
    const secs = p === 0 ? Number(o().firstSecs) || 30 : Number(o().pageSecs) || 12;
    if (Date.now() - pageAt >= Math.max(3, secs) * 1000) {
      // "İlk sayfaya dön": 1 → 2 → 1 → 3 → 1 … (ilk sayfa çoğu zaman ekranda, diğerleri ara sıra)
      if (o().returnFirst !== false) {
        if (p === 0) {
          nextOther = nextOther + 1 >= pages() ? 1 : nextOther + 1;
          setPage(nextOther);
        } else setPage(0);
      } else setPage((p + 1) % pages());
      pageAt = Date.now();
    }
  }, 500);
  onCleanup(() => clearInterval(pv));
  const top = createMemo(() => (page() > 0 && pages() > 1 ? filtered().slice(0, keep()) : []));
  const shown = createMemo(() => {
    const l = filtered();
    const p = Math.min(page(), pages() - 1);
    if (p <= 0) return l.slice(0, n());
    const per = Math.max(1, n() - keep());
    const from = n() + (p - 1) * per;
    return l.slice(from, from + per);
  });
  const extraMe = createMemo(() => (o().showMe === true && me() && !shown().some((r) => r.isMe) && !top().some((r) => r.isMe) ? me() : undefined));
  const leader = () => filtered()[0];
  const posOf = (r: Row) => (o().classFilter === "mine" ? r.classPos : r.pos);

  // Sıra değişimi: satır 3 sn yeşil (kazandı) / kırmızı (kaybetti)
  const prev = new Map<number, number>();
  const [flash, setFlash] = createSignal<Record<number, "up" | "down">>({});
  createEffect(() => {
    if (o().flash === false) return;
    const next: Record<number, "up" | "down"> = {};
    let any = false;
    for (const r of filtered()) {
      const p = prev.get(r.idx);
      const cur = posOf(r);
      if (p && cur && p !== cur) {
        next[r.idx] = cur < p ? "up" : "down";
        any = true;
      }
      prev.set(r.idx, cur);
    }
    if (any) {
      setFlash({ ...flash(), ...next });
      window.setTimeout(() => {
        const f = { ...flash() };
        for (const k of Object.keys(next)) delete f[Number(k)];
        setFlash(f);
      }, 3000);
    }
  });

  // Saat: yarış başlangıcından beri (varsayılan), oturumun geçen süresi ya da kalan süre
  const timedValid = (x: number) => isFinite(x) && x >= 0 && x < 600000;
  const clockVal = () => {
    const i = info();
    const mode = String(o().clock || "race");
    if (mode === "remain") {
      // Süreli yarış: kalan süre; tur sayılı yarışta iRacing kalan süre vermez → kalan tur
      if (timedValid(i.timeRemain)) return hms(i.timeRemain);
      if (i.lapsRemain >= 0 && i.lapsRemain < 32767) return `${i.lapsRemain} ${i.lapsRemain === 1 ? "LAP" : "LAPS"}`;
      return "--:--:--";
    }
    if (mode === "race") {
      if (i.raceElapsed >= 0) return hms(i.raceElapsed);
      // Uygulama yarışın ortasında açıldı (yeşil anı görülmedi): süreli yarışta toplam - kalan
      if (timedValid(i.timeRemain) && i.totalTime > 0 && i.totalTime < 600000) return hms(Math.max(0, i.totalTime - i.timeRemain));
    }
    return hms(i.elapsed);
  };
  // Liderin turu (yarışta, yeşilden sonra): LAP 5/20; toplam tur yoksa (süreli yarış) LAP 5
  const lapText = () => {
    if (o().showLap === false) return "";
    const i = info() as { leaderLap: number; totalLaps?: number; sample?: boolean };
    if (!i.sample && (!isRaceSession(info().session) || (ses()?.state ?? 0) < 4)) return "";
    const tot = Number(i.totalLaps) || 0;
    const lap = Math.max(1, Math.min(i.leaderLap, tot > 0 && tot < 32767 ? tot : 1e9));
    if (!(i.leaderLap > 0)) return "";
    return tot > 0 && tot < 32767 ? `LAP ${lap}/${tot}` : `LAP ${lap}`;
  };
  const subCols = () => [o().clock !== "off" ? "minmax(52px, auto)" : "", lapText() ? "auto" : "", "1fr", "54px"].filter(Boolean).join(" ");
  const track = () => upper(String(o().trackText || "").trim() || info().track || "");
  const scale = () => Math.max(0.6, Math.min(2, (Number(o().scale) || 100) / 100));

  const Line = (p: { r: Row; i: number }) => {
    const nc = () => numberColors(p.r, String(o().numColor || "category"));
    return (
      <div
        class="tvt-row"
        classList={{
          cam: o().highlightCam !== false && p.r.idx === info().camIdx,
          me: p.r.isMe,
          up: flash()[p.r.idx] === "up",
          down: flash()[p.r.idx] === "down",
          pit: p.r.onPit,
        }}
      >
        <span class="tv-pos tvt-pos">{posOf(p.r)}</span>
        <Show when={o().showLogos !== false}>
          <TvLogo carName={p.r.carName} class="tvt-logo" />
        </Show>
        <span class="tvt-name">{tvName(p.r.name, String(o().nameFormat || "last"))}</span>
        <span class="tv-num tvt-num" style={{ background: nc().bg, color: nc().fg }}>
          {p.r.number}
        </span>
        <span class="tvt-gap" classList={{ pit: p.r.onPit }}>
          {lapsSmall(gapMode() === "interval" ? (p.i === 0 ? gapToLeader(p.r, leader(), info().leaderLap, { race: isRaceSession(info().session) }) : intervalText(p.r, p.i)) : gapToLeader(p.r, leader(), info().leaderLap, { race: isRaceSession(info().session) }))}
        </span>
      </div>
    );
  };

  // Ad sütunu genişliği: ayar ya da ad biçimine göre otomatik
  const nameW = () => {
    const w = Number(o().nameWidth) || 0;
    if (w > 0) return Math.max(60, w);
    const f = String(o().nameFormat || "last");
    return f === "full" ? 160 : f === "initial" ? 120 : 100;
  };
  // Damalı bayraktan sonra ilk N araç (araç sayısı azsa hepsi) çizgiyi geçince kalkar
  const finished = useFinishReady(() => ({ finishers: Number(o().hideAfterN) || 1, waitAll: !(Number(o().hideAfterN) > 0), openDelay: 0 }), rows, () => ses()?.state ?? 0, () => isRaceSession(info().session));
  const visible = useTvVisible({ o, event: () => rows().length > 0, editing: () => !!props.editing, sample, finished });

  return (
    <div class="tv tvt" classList={{ "tv-off": !visible() }} style={{ "--tv-red": String(o().accent || "#d4151d"), "--tvt-name": `${nameW()}px`, zoom: String(scale()) }} data-no-i18n>
      <Show when={o().showHeader !== false}>
        <div class="tvt-head">
          <div class="tvt-title">
            <b>{upper(String(o().title ?? "SRTR PITWALL"))}</b>
            <Show when={String(o().subtitle || "").trim()}>
              <small>{upper(String(o().subtitle))}</small>
            </Show>
          </div>
          <div class="tvt-ses">{sessionLabel(info().session)}</div>
          <div class="tvt-track">
            <span>{track()}</span>
            <Show when={String(o().country || "").trim()}>
              <span class="tvt-flag">
                <Flag code={String(o().country).trim()} />
              </span>
            </Show>
          </div>
        </div>
      </Show>
      <div class="tvt-sub" style={{ "grid-template-columns": subCols() }}>
        <Show when={o().clock !== "off"}>
          <span class="tvt-clock">{clockVal()}</span>
        </Show>
        <Show when={lapText()}>
          <span class="tvt-lapn">{lapText()}</span>
        </Show>
        <span class="tvt-over">{o().classFilter === "mine" && me() ? upper(me()!.className || "CLASS") : "OVERALL"}</span>
        <span class="tvt-gaph">{gapMode() === "interval" ? "INTERVAL" : "GAP TO\nLEADER"}</span>
      </div>
      <div class="tvt-list">
        <Show when={top().length}>
          <Index each={top()}>{(r) => <Line r={r()} i={filtered().indexOf(r())} />}</Index>
          <div class="tvt-sep" />
        </Show>
        <Index each={shown()}>{(r) => <Line r={r()} i={filtered().indexOf(r())} />}</Index>
        <Show when={extraMe()}>
          {(m) => (
            <>
              <div class="tvt-sep" />
              <Line r={m()} i={filtered().indexOf(m())} />
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
