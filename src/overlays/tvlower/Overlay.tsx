import { For, Index, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { OverlayProps } from "@/sdk/overlay";
import { previewFrozen } from "@/sdk/overlay";
import { useTopic } from "@/sdk/telemetry";
import { Flag } from "@/sdk/Flag";
import { TvLogo, isTr, upper, useFinishReady, useFinishedCars, useTvStandings, useTvVisible, withDefaults } from "@/sdk/tvkit";
import type { MapCar, Row } from "@/sdk/types";
import manifest from "./manifest";
import "./style.css";

// TV Sürücü Bandı: alt bant (sıra, logo, ad, takım, bayrak, numara) + hız yayı, fren ışığı ve vites şeridi.
// iRacing TV kamerasında ekrandaki araç ve pistte ona en yakın araç yan yana; ikisinde de hız / vites
// (harita verisinden: tur yüzdesi değişimi × pist uzunluğu, CarIdxGear). Diğer araçların freni sim
// tarafından verilmediği için yavaşlamadan tahmin edilir.

const GEARS = ["R", "N", "1", "2", "3", "4", "5", "6", "7", "8"];

export default function TvLower(props: OverlayProps) {
  const o = withDefaults(manifest, () => props.options);
  const { rows, info, sample } = useTvStandings(() => !!props.editing);
  const inputs = useTopic("inputs");
  const status = useTopic("status");
  const map = useTopic("map");
  const mapCar = (idx: number): MapCar | undefined => map()?.cars?.find((c) => c.idx === idx);

  const ses = useTopic("session");
  const [tick, setTick] = createSignal(Date.now());
  const t = window.setInterval(() => !previewFrozen() && setTick(Date.now()), 500);
  onCleanup(() => clearInterval(t));

  const camKind = () => (sample() ? "" : String((info() as { camKind?: string }).camKind || ""));
  // Rejisörün grid turu: yalnız araç / sürücü / sıra (hız-vites göstergesi ve ikinci bant yok), band hep açık
  const gridCam = () => camKind() === "grid";
  // Kamera araç içinde / üstünde: hangi araç olduğu her zaman yazsın
  const onboardCam = () => !sample() && !!(info() as { camOnboard?: boolean }).camOnboard;
  // Rejisör bitiş çizgisini / en hızlı turu gösteriyor: band her zaman açık
  const finishCam = () => camKind() === "finish" || camKind() === "fastest" || camKind() === "pit";
  // Yeşil bayraktan önce (yarışta gridde / ısınma turunda): bütün sürücüler sırayla, tek bant
  const preGreen = () => {
    if (sample() || o().gridCycle === false) return false;
    const st = ses()?.state ?? 0;
    return st >= 1 && st <= 3 && /race/i.test(info().session || "");
  };
  const [gridI, setGridI] = createSignal(0);
  let gridLast = Date.now();
  createEffect(() => {
    const n = tick();
    if (!preGreen()) return;
    if (n - gridLast >= Math.max(2, Number(o().gridSecs) || 4) * 1000) {
      gridLast = n;
      setGridI((i) => i + 1);
    }
  });

  const focus = createMemo<Row | undefined>(() => {
    const l = rows();
    // Rejisörün grid turu, kaza ve bitiş çekimi: her zaman kameradaki araç (kim olduğu görünsün)
    if (gridCam() || onboardCam() || camKind() === "incident" || finishCam()) {
      const cam = l.find((r) => r.idx === info().camIdx);
      if (cam) return cam;
    }
    if (preGreen() && l.length) {
      // Gridde ekrandaki araç (rejisör grid turu bitip TV Mixed'e geçince de bant ekrandaki aracı yazar, kendi başına
      // ikinci kez sırayla dönmez); kamera bilgisi yoksa sürücüler sırayla
      const cam = l.find((r) => r.idx === info().camIdx);
      if (cam) return cam;
      return l[gridI() % l.length];
    }
    if (o().focus !== "me") {
      const c = l.find((r) => r.idx === info().camIdx);
      if (c) return c;
    }
    return l.find((r) => r.isMe) ?? l[0];
  });
  // Pistte iki araç arasındaki süre farkı (sn): tur yüzdesi farkı × tur süresi
  const trackGap = (a: Row, b: Row) => {
    const ca = mapCar(a.idx);
    const cb = mapCar(b.idx);
    if (!ca || !cb || ca.pct < 0 || cb.pct < 0) return 999;
    let d = Math.abs(ca.pct - cb.pct);
    if (d > 0.5) d = 1 - d;
    const lap = a.best > 0 ? a.best : a.last > 0 ? a.last : 100;
    return d * lap;
  };
  const otherRaw = createMemo<Row | undefined>(() => {
    const f = focus();
    if (preGreen()) return undefined;
    const mode = String(o().second || "track");
    if (!f || mode === "none") return undefined;
    const l = rows();
    const i = l.indexOf(f);
    const ahead = i > 0 ? l[i - 1] : undefined;
    const behind = i >= 0 && i < l.length - 1 ? l[i + 1] : undefined;
    if (mode === "ahead") return ahead;
    if (mode === "behind") return behind;
    if (mode === "track") {
      // Pistte (ekranda) en yakın araç: tur yüzdesi farkı en küçük olan, pitte olmayan
      const me = mapCar(f.idx);
      const cars = map()?.cars ?? [];
      if (me && me.pct >= 0 && cars.length > 1) {
        let best: MapCar | undefined;
        let bd = 1;
        for (const c of cars) {
          if (c.idx === f.idx || c.pit || c.pct < 0) continue;
          let d = Math.abs(c.pct - me.pct);
          if (d > 0.5) d = 1 - d;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        const r = best && l.find((x) => x.idx === best!.idx);
        if (r) return r;
      }
      return ahead ?? behind;
    }
    // yakın olan: öndekine fark (benim interval'im) mı, arkadakinin interval'i mi küçük
    const ga = f.interval > 0 ? f.interval : 999;
    const gb = behind && behind.interval > 0 ? behind.interval : 999;
    return ga <= gb ? (ahead ?? behind) : (behind ?? ahead);
  });
  // "Pistte en yakın" / "hangisi yakınsa": ikinci bant yalnızca kapışma varken (fark ayarın altında) görünür;
  // fark açılınca 2 sn sonra kalkar (titremesin)
  const [pairOn, setPairOn] = createSignal(false);
  let farSince = 0;
  createEffect(() => {
    const n = tick();
    const f = focus();
    const x = otherRaw();
    const mode = String(o().second || "track");
    if (!f || !x) {
      setPairOn(false);
      return;
    }
    // Her kipte: ikinci bant yalnızca iki araç arasındaki fark ayarın (varsayılan 1 sn) altındaysa (20 sn öndeki
    // aracın bandı çıkıyordu). Fark pistteki konumdan; konum yoksa sıralama aralığından
    const g = Math.max(0.2, Number(o().pairGap) || 1);
    const tg = trackGap(f, x);
    const iv = Math.min(f.interval > 0 ? f.interval : 999, x.interval > 0 ? x.interval : 999);
    const gap = mode === "close" ? iv : tg < 999 ? tg : iv;
    if (gap <= g) {
      farSince = 0;
      setPairOn(true);
    } else if (pairOn()) {
      if (!farSince) farSince = n;
      if (gap > g + 0.3 && n - farSince > 2000) setPairOn(false);
    }
  });
  // Otomatik Rejisör kazaya kesti: kameradaki aracın bandı hemen çıkar, "INCIDENT" etiketiyle (ikinci bant yok)
  const incident = () => camKind() === "incident" && o().incidentTag !== false;
  // Rejisörün grid turu: yalnız araç / sürücü (hız-vites göstergesi ve ikinci bant yok)

  // Yarışı bitiren araç gösterilirken yalnızca o: ikinci bant kapalı
  const isFinished = useFinishedCars(rows, () => ses()?.state ?? 0);
  const other = () => (camKind() === "incident" || gridCam() || onboardCam() || (!sample() && isFinished(focus()?.idx)) ? undefined : pairOn() || sample() ? otherRaw() : undefined);
  // Ekranda soldaki: geride olan (kovalayan), sağdaki: önde olan (TV'deki gibi)
  const pair = createMemo(() => {
    const f = focus();
    const x = other();
    if (!f) return [] as Row[];
    if (!x) return [f];
    return f.pos > x.pos ? [f, x] : [x, f];
  });

  // Görünürlük
  const [shownAt, setShownAt] = createSignal(Date.now());
  createEffect(on(() => focus()?.idx, () => setShownAt(Date.now()), { defer: true }));
  // Eski ayar (mode) → ortak görünürlük ayarı (show)
  const opts = () => {
    // Eski sürümlerde kaydedilmiş "Yeşil bayraktan önce gizle" yok sayılır: gridde sürücüler sırayla gösterilir
    const x: Record<string, any> = { ...o(), hideBeforeGreen: o().gridCycle === false ? o().hideBeforeGreen : false };
    if (props.options?.show !== undefined || props.options?.mode === undefined) return x;
    const m = String(x.mode || "always");
    return { ...x, show: m === "camchange" ? "auto" : m, camSecs: x.camSecs ?? x.showSecs };
  };
  const allDone = useFinishReady(() => ({ waitAll: true, openDelay: 0 }), rows, () => ses()?.state ?? 0, () => /race/i.test(info().session || ""));
  const visible = useTvVisible({
    o: opts,
    event: () => {
      if (!focus()) return false;
      // Gridde (grid turu): band hep açık, araç / sürücü / sıra yazar
      if (preGreen() || gridCam()) return true;
      if (String(opts().show || "auto") !== "auto") return true;
      return tick() - shownAt() < Math.max(3, Number(opts().camSecs) || 8) * 1000;
    },
    editing: () => !!props.editing,
    sample,
    // Damalı bayraktan sonra bitirenler de gösterilir: band herkes yarışı bitirince kalkar
    finished: allDone,
  });

  // Hız / fren geçmişi (diğer araçlar için fren tahmini: belirgin yavaşlama)
  const hist = new Map<number, { v: number; t: number; brakeUntil: number; pct: number }>();
  const telem = (r: Row) => {
    const mine = r.isMe && !!inputs();
    if (mine) return { speed: inputs()!.speed ?? 0, gear: inputs()!.gear ?? 0, hasGear: true, brake: (inputs()!.brake ?? 0) > 0.05, ok: true };
    if (sample()) return { speed: r.idx === 10 ? 55.3 : 57, gear: r.idx === 10 ? 3 : 5, hasGear: true, brake: r.idx === 10, ok: true };
    const m = map();
    const cached = memo.get(r.idx);
    if (cached && cached.m === m) return cached.res;
    const res = calcTelem(r);
    memo.set(r.idx, { m, res });
    return res;
  };
  const memo = new Map<number, { m: unknown; res: ReturnType<typeof calcTelem> }>();
  const calcTelem = (r: Row) => {
    const c = mapCar(r.idx);
    if (!c) return { speed: 0, gear: 0, hasGear: false, brake: false, ok: false };
    const now = performance.now();
    const h = hist.get(r.idx);
    // Sim hızı vermiyorsa (diğer simler / demo) tur yüzdesi değişiminden hesapla
    let v = c.speed ?? 0;
    const len = map()?.trackM ?? 0;
    if (!(v > 0) && len > 0 && h && h.pct >= 0 && c.pct >= 0 && now - h.t > 40 && now - h.t < 1000) {
      let d = c.pct - h.pct;
      if (d < -0.5) d += 1;
      if (d > 0.5) d -= 1;
      const raw = Math.max(0, (d * len) / ((now - h.t) / 1000));
      v = h.v > 0 ? h.v * 0.6 + raw * 0.4 : raw;
    }
    let brakeUntil = h?.brakeUntil ?? 0;
    if (h && now - h.t > 40 && now - h.t < 1000) {
      const acc = (v - h.v) / ((now - h.t) / 1000);
      if (acc < -7 && v > 8) brakeUntil = now + 350;
    }
    if (!h || now - h.t > 40) hist.set(r.idx, { v, t: now, brakeUntil, pct: c.pct });
    return { speed: v, gear: c.gear ?? 0, hasGear: c.gear !== null && c.gear !== undefined, brake: now < brakeUntil, ok: v > 0 || !!h };
  };

  const scale = () => Math.max(0.5, Math.min(2, (Number(o().scale) || 100) / 100));

  return (
    <div class="tv tvl" classList={{ off: !(visible() || ((camKind() === "incident" || finishCam() || gridCam() || onboardCam() || (preGreen() && !!focus())) && String(o().show) !== "never")) }} style={{ "--tv-red": String(o().accent || "#d4151d"), zoom: String(scale()) }} data-no-i18n>
      <Index each={pair()}>{(r, i) => <Band r={r()} mine={r().isMe} side={pair().length < 2 ? "mid" : i === 0 ? "left" : "right"} />}</Index>
    </div>
  );

  function Band(p: { r: Row; mine: boolean; side: string }) {
    const name = () => (p.mine && String(o().nameText || "").trim() ? String(o().nameText) : p.r.name);
    const team = () => (p.mine && String(o().teamText || "").trim() ? String(o().teamText) : p.r.team || (p.mine ? status()?.teamName : "") || p.r.carName);
    const gauge = () => {
      const g = o().gauge;
      if (g === false || g === "off" || preGreen() || gridCam()) return false;
      const t = telem(p.r);
      // Araç duruyorsa (pitte, gridde, kaza sonrası) hız / vites göstergesi gizlenir (ayar)
      if (o().hideGaugeStopped !== false && !sample() && t.speed * 3.6 < 3) return false;
      if (g === "me" || g === true) return p.mine && t.ok;
      return t.ok && (t.speed > 0 || p.mine);
    };
    return (
      <div class={`tvl-card ${p.side}`}>
        <Show when={incident() && p.r.idx === info().camIdx}>
          <span class="tvl-inc">INCIDENT</span>
        </Show>
        {/* Gösterge yokken (araç duruyor, grid, kapalı) yeri boş tutulur: bant hep aynı hizada kalır */}
        <Show when={gauge()} fallback={<Show when={o().gauge !== false && o().gauge !== "off"}><div class="tvl-gauge tvl-gauge-ph" /></Show>}>
          <Gauge r={p.r} />
        </Show>
        <div class="tvl-band">
          <span class="tv-pos tvl-pos">{o().classPos ? p.r.classPos : p.r.pos}</span>
          <TvLogo carName={p.r.carName} class="tvl-logo" />
          <span class="tvl-txt">
            <b>{upper(name(), isTr(name(), p.r.flair))}</b>
            <Show when={o().showTeam !== false && team()}>
              <small>{upper(team()!)}</small>
            </Show>
          </span>
          <Show when={o().showFlag !== false && p.r.flair}>
            <span class="tvl-flag">
              <Flag code={p.r.flair} />
            </span>
          </Show>
          <span class="tv-num tvl-num">{p.r.number}</span>
        </div>
      </div>
    );
  }

  function Gauge(p: { r: Row }) {
    const tl = () => telem(p.r);
    const sp = () => tl().speed * 3.6;
    const max = () => Math.max(100, Number(o().maxSpeed) || 300);
    const frac = () => Math.max(0, Math.min(1, sp() / max()));
    const gear = () => tl().gear;
    const brake = () => tl().brake;
    // Yay: 180° (sol → sağ); TV'deki gibi koyu yarım disk, kalın dış halka (yeşil dolar, kalan açık gri)
    const R = 91;
    const L = Math.PI * R;
    const arc = `M ${103.5 - R} 100 A ${R} ${R} 0 0 1 ${103.5 + R} 100`;
    const gearLbl = (g: number) => (g < 0 ? "R" : g === 0 ? "N" : String(g));
    // Görünen vites penceresi: 6 vites, şu anki içinde (R N 1 2 3 4 → 1 2 3 4 5 6 …)
    const win = () => {
      const top = Math.max(6, Math.min(8, gear()));
      const all = GEARS.slice(0, top + 2);
      const i = Math.max(0, all.indexOf(gearLbl(gear())));
      const from = Math.max(0, Math.min(all.length - 6, i - 4));
      return all.slice(from, from + 6);
    };
    return (
      <div class="tvl-gauge">
        <svg viewBox="0 0 207 100" class="tvl-arc">
          <defs>
            <linearGradient id="tvlDisc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#4a4b4f" />
              <stop offset="1" stop-color="#1d1e21" />
            </linearGradient>
          </defs>
          <path d="M 3.5 100 A 100 100 0 0 1 203.5 100 Z" class="tvl-disc" fill="url(#tvlDisc)" />
          <path d={arc} class="tvl-arc-bg" />
          <path d={arc} class="tvl-arc-fg" stroke-dasharray={`${L * frac()} ${L}`} />
        </svg>
        <div class="tvl-speed">
          <b>{Math.round(sp())}</b>
          <small>KM/H</small>
        </div>
        <span class="tvl-tag">
          {Math.round(sp())}
          <small>KM/H</small>
        </span>
        <div class="tvl-under">
          <span class="tvl-brake" classList={{ on: brake() }}>
            BRAKE
          </span>
          <span class="tvl-gears" classList={{ none: !tl().hasGear }}>
            <For each={win()}>{(g) => <i classList={{ on: gearLbl(gear()) === g }}>{g}</i>}</For>
          </span>
        </div>
      </div>
    );
  }
}
