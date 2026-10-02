// Ekip panelinin grafikleri (pg-*: crew.css): yarış durumu şeridi, depo, üstten araç + dört lastik, pit servisi
// kutuları ve spotter görünümü. Çizimler özgün SVG / CSS'tir (dış görsel yok). Aynı görsel dilin web sürümü
// website/assets/crewpanel.js + crew.css içindedir; sınıf adları ve yapı bilerek aynıdır.

import { For, Show, type JSX } from "solid-js";
import { t } from "@/sdk/i18n";
import { lapTime } from "@/sdk/format";
import { PIT, type CrewDriver, type CrewKind, type CrewLive } from "@/cloud/crew";

/** Komut geri bildirimi: ilgili çizim bekler (halka) → yeşil parlar / kırmızı sallanır */
export type FxState = "pend" | "ok" | "bad";
export type Fx = Record<string, FxState | undefined>;
type Send = (kind: CrewKind, args?: Record<string, unknown>) => void;

const IC = {
  fuel: '<path d="M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14M3.5 20h12M7.5 7.5h4V11h-4zM14 10h1.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>',
  tyre: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.2-.8-.8-2.2z"/>',
  visor: '<path d="M4 15a8 8 0 0 1 16-1.5V16a2 2 0 0 1-2 2h-6.5L8 15z"/><path d="M10.5 10.5H19.5M10.5 10.5 12 14h8"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  warn: '<path d="M12 4.5 20.5 19h-17zM12 10v4M12 16.6v.2"/>',
  left: '<path d="M11 6l-6 6 6 6M5 12h14"/>',
  right: '<path d="M13 6l6 6-6 6M19 12H5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  fast: '<path d="M6 12l6-6 6 6M6 19l6-6 6 6"/>',
  pit: '<path d="M8 20V5h5a4 4 0 0 1 0 8H8"/>',
  drop: '<path d="M12 3.5c3 4 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6 5.5-10z"/>',
  road: '<path d="M8 4 5 20M16 4l3 16M12 5v3M12 11v3M12 17v3"/>',
  send: '<path d="M4 12 20 5l-5 15-3-6z"/>',
} as const;
export type IconName = keyof typeof IC;
export const Ic = (p: { n: IconName }) => <svg class="pg-ic" viewBox="0 0 24 24" aria-hidden="true" innerHTML={IC[p.n]} />;

/** Hazır spotter mesajlarının simgeleri (WALL_MSGS sırasıyla) */
export const QUICK_ICONS: IconName[] = ["left", "right", "check", "fast", "pit", "drop"];

/** Üstten araç silueti (burun yukarıda); lastikler ayrı çizilir */
export const CarTop = (p: { class: string }) => (
  <svg class={p.class} viewBox="0 0 96 220" aria-hidden="true">
    <g class="ax">
      <rect x="0" y="50" width="96" height="4" rx="2" />
      <rect x="0" y="166" width="96" height="4" rx="2" />
    </g>
    <rect class="wg" x="20" y="3" width="56" height="6" rx="3" />
    <path
      class="bd"
      d="M48 6C62 6 72 12 74 26L76 44C78 60 78 70 74 84L72 120C72 132 78 140 78 156L78 188C78 200 70 206 48 206C26 206 18 200 18 188L18 156C18 140 24 132 24 120L22 84C18 70 18 60 20 44L22 26C24 12 34 6 48 6Z"
    />
    <path class="st" d="M48 12V74" />
    <path class="ck" d="M35 88C35 77 61 77 61 88L63 126C63 136 33 136 33 126Z" />
    <path class="gl" d="M37 90C40 82 56 82 59 90L58 100H38Z" />
    <ellipse class="mr" cx="20" cy="92" rx="4" ry="3" />
    <ellipse class="mr" cx="76" cy="92" rx="4" ry="3" />
    <path class="lt" d="M27 19l8-5M69 19l-8-5" />
    <rect class="wg" x="10" y="204" width="76" height="10" rx="3" />
  </svg>
);

const CORNERS = [
  { k: "lf", bit: PIT.lf, label: "Sol ön" },
  { k: "rf", bit: PIT.rf, label: "Sağ ön" },
  { k: "lr", bit: PIT.lr, label: "Sol arka" },
  { k: "rr", bit: PIT.rr, label: "Sağ arka" },
] as const;

const num = (v: number | undefined | null, d = 1) => (typeof v === "number" && isFinite(v) ? v.toFixed(d) : "—");
const fxClass = (fx: Fx, k: string) => ({ "fx-pend": fx[k] === "pend", "fx-ok": fx[k] === "ok", "fx-bad": fx[k] === "bad" });

function remain(sec: number | undefined, laps: number | undefined): string {
  if (laps != null && laps >= 0 && laps < 32000) return t("{0} tur", String(laps));
  if (sec == null || sec < 0 || sec > 600_000) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Oturum bayrağı (iRacing SessionFlags) → metin + renk sınıfı */
function flagInfo(f: number | undefined): { label: string; cls: string } | null {
  if (!f) return null;
  if (f & 0x1) return { label: t("Damalı bayrak"), cls: "chk" };
  if (f & 0x10) return { label: t("Kırmızı bayrak"), cls: "red" };
  if (f & (0x4000 | 0x8000)) return { label: t("Güvenlik aracı"), cls: "yel" };
  if (f & (0x8 | 0x100)) return { label: t("Sarı bayrak"), cls: "yel" };
  if (f & 0x2) return { label: t("Son tur"), cls: "wht" };
  return null;
}

/** Hangi komut hangi çizimleri etkiler (geri bildirim animasyonu için) */
export function fxKeys(kind: CrewKind, a: Record<string, unknown>, pitFlags: number): string[] {
  const cur = (bit: number) => pitFlags >= 0 && (pitFlags & bit) !== 0;
  const corners = (want: (k: string) => boolean) => {
    const l = CORNERS.filter((c) => want(c.k) !== cur(c.bit)).map((c) => c.k as string);
    return [...(l.length ? l : CORNERS.map((c) => c.k as string)), "tyres"];
  };
  switch (kind) {
    case "fuel_set":
    case "fuel_clear":
      return ["fuel"];
    case "tyres":
      return corners((k) => !!a[k]);
    case "tyres_all":
      return corners(() => true);
    case "tyres_clear":
      return corners(() => false);
    case "fast_repair":
      return ["fr"];
    case "tearoff":
      return ["tearoff"];
    case "clear_all":
      return ["lf", "rf", "lr", "rr", "tyres", "fuel", "fr", "tearoff"];
    default:
      return [];
  }
}

/** Yarış durumu: sıra rozeti, tur halkası, kalan / son / en iyi tur, bayrak · konum · olay · veri yaşı */
export function RaceHeader(props: { d: CrewDriver }) {
  const x = () => props.d.data!;
  const c = (): CrewLive | null => x().crew ?? null;
  const lap = () => x().lap ?? 0;
  const rem = () => remain(c()?.timeRemain, c()?.lapsRemain);
  const pct = () => {
    const lr = c()?.lapsRemain;
    if (lr != null && lr >= 0 && lr < 32000) return lap() + lr > 0 ? lap() / (lap() + lr) : 0;
    return Math.min(1, Math.max(0, x().lapPct ?? 0));
  };
  const C = 2 * Math.PI * 27;
  const inPit = () => !!x().onPit || !!c()?.stall;
  const age = () => {
    const s = props.d.age ?? 0;
    return s < 90 ? t("{0} sn", String(Math.round(s))) : t("{0} dk", String(Math.round(s / 60)));
  };
  return (
    <div class="pg-race">
      <div class="pg-pos">
        <small>Sıra</small>
        <b data-no-i18n>{x().position ? `P${x().position}` : "—"}</b>
        <Show when={c()?.classPos}>
          <i data-no-i18n>
            {t("sınıf")} P{c()!.classPos}
          </i>
        </Show>
      </div>
      <div class="pg-ring" role="img" aria-label={t("Tur {0}, kalan {1}", String(lap() || "—"), rem())}>
        <svg viewBox="0 0 64 64">
          <circle class="bg" cx="32" cy="32" r="27" />
          <circle class="fg" cx="32" cy="32" r="27" transform="rotate(-90 32 32)" stroke-dasharray={C.toFixed(1)} stroke-dashoffset={(C * (1 - pct())).toFixed(1)} />
        </svg>
        <span>
          <small>Tur</small>
          <b data-no-i18n>{lap() || "—"}</b>
        </span>
      </div>
      <dl class="pg-kv">
        <dt>Kalan</dt>
        <dd data-no-i18n>{rem()}</dd>
        <dt>Son tur</dt>
        <dd data-no-i18n>{lapTime(x().last)}</dd>
        <dt>En iyi tur</dt>
        <dd data-no-i18n>{lapTime(x().best)}</dd>
      </dl>
      <div class="pg-chips">
        <Show when={flagInfo(c()?.flags)}>
          {(f) => (
            <span class={`pg-chip flag ${f().cls}`}>
              <i />
              {f().label}
            </span>
          )}
        </Show>
        <span class="pg-chip" classList={{ warn: inPit() }}>
          <Ic n={inPit() ? "pit" : "road"} />
          {c()?.stall ? t("Pit kutusunda") : x().onPit ? t("Pit yolunda") : t("Pistte")}
        </span>
        <Show when={c()}>
          <span class="pg-chip" title={t("Olay puanı")} data-no-i18n>
            <Ic n="warn" />
            <span class="sr">{t("Olay puanı")} </span>
            {c()!.inc}x
          </span>
        </Show>
        <Show when={!props.d.live}>
          <span class="pg-chip stale" title={t("Aşağıdaki veri son alınan veridir (sürücü şu an göndermiyor).")}>
            <Ic n="clock" />
            {props.d.age != null ? t("Son alınan veri ({0} önce)", age()) : t("Son alınan veri")}
          </span>
        </Show>
      </div>
    </div>
  );
}

/** Yakıt kartı: depo çizimi (seviye, pit sonrası hayalet dolgu, bitiş işareti) + litre kontrolü */
export function FuelCard(props: { d: CrewDriver; liters: number; setLiters: (n: number) => void; blocked: boolean; fx: Fx; send: Send }) {
  const x = () => props.d.data;
  const c = () => x()?.crew ?? null;
  const pf = () => c()?.pit?.flags ?? -1;
  const level = () => Math.max(0, x()?.level ?? 0);
  const cap = () => Math.max(0, x()?.max ?? 0);
  const toFinish = () => Math.max(0, c()?.toFinish ?? x()?.refuel ?? 0);
  const needed = () => Math.max(0, c()?.needed ?? 0) || (toFinish() > 0 ? level() + toFinish() : 0);
  const setL = () => (pf() >= 0 && pf() & PIT.fuel ? Math.max(0, c()!.pit.fuel ?? 0) : 0);
  /** Hayalet dolgu: kontrol varsa seçili litre, yoksa şu an ayarlı pit yakıtı */
  const add = () => (props.d.can_control ? props.liters : setL());
  const scale = () => (cap() > 0 ? cap() : Math.max(level() + add(), needed(), level(), 1) * 1.1);
  const pc = (v: number) => Math.max(0, Math.min(100, (v / scale()) * 100));
  const after = () => (cap() > 0 ? Math.min(cap(), level() + add()) : level() + add());
  const room = () => (cap() > 0 ? Math.floor(Math.max(0, cap() - level())) : 0);
  const lapsLeft = () => x()?.lapsLeft ?? 0;
  const low = () => lapsLeft() > 0 && lapsLeft() < 2;
  const rmax = () => Math.max(props.liters, cap() > 0 ? Math.max(1, Math.ceil(cap() - level())) : 150);
  const set = (n: number) => props.setLiters(Math.min(1000, Math.max(1, Math.round(n) || 1)));
  const toEnd = () => {
    if (toFinish() <= 0) return props.send("fuel_clear");
    set(Math.ceil(toFinish()));
    props.send("fuel_set", { liters: Math.min(1000, Math.ceil(toFinish())) });
  };
  const full = () => {
    if (room() < 1) return;
    set(room());
    props.send("fuel_set", { liters: Math.min(1000, room()) });
  };
  return (
    <section class="pg-card pg-fuel" classList={fxClass(props.fx, "fuel")}>
      <h3 class="pg-h">
        <Ic n="fuel" />
        Yakıt
        <span class="sp" />
        <Show when={setL() > 0} fallback={<Show when={pf() >= 0}>{<span class="pg-badge">{t("Eklenmeyecek")}</span>}</Show>}>
          <span class="pg-badge on" data-no-i18n>
            ✓ +{setL().toFixed(0)} L
          </span>
        </Show>
      </h3>
      <div class="pg-fuel-top">
        <div class="pg-tank" role="img" aria-label={t("Depo {0} L, pit sonrası {1} L", num(level()), num(after()))}>
          <div class="pg-tank-b">
            <Show when={pc(after()) - pc(level()) > 0.05}>
              <i class="gh" style={{ bottom: `${pc(level()).toFixed(1)}%`, height: `${(pc(after()) - pc(level())).toFixed(1)}%` }} />
            </Show>
            <i class="lvl" classList={{ low: low() }} style={{ height: `${pc(level()).toFixed(1)}%` }} />
            <b data-no-i18n>
              {num(level())}
              <small>L</small>
            </b>
          </div>
          <Show when={needed() > 0}>
            <i class="fin" classList={{ over: needed() > scale() }} style={{ bottom: `${pc(needed()).toFixed(1)}%` }}>
              <em>
                {needed() > scale() ? "▲ " : ""}
                {t("Bitiş")}
              </em>
            </i>
          </Show>
        </div>
        <div class="pg-fuel-n">
          <div class="pg-big" classList={{ low: low() }}>
            <b data-no-i18n>{lapsLeft() > 0 ? lapsLeft().toFixed(1) : "—"}</b>
            <small>Depoyla gidilecek tur</small>
          </div>
          <Show
            when={toFinish() > 0}
            fallback={
              <span class="pg-chip ok">
                <Ic n="check" />
                {t("Bitişe yeter")}
              </span>
            }
          >
            <span class="pg-chip warn">
              <Ic n="warn" />
              {t("Bitiş için +{0} L", toFinish().toFixed(1))}
            </span>
          </Show>
        </div>
      </div>
      <dl class="pg-kv g2">
        <dt>Depo</dt>
        <dd data-no-i18n>
          {num(level())}
          {cap() > 0 ? ` / ${cap().toFixed(0)}` : ""} L
        </dd>
        <dt>Tur başı</dt>
        <dd data-no-i18n>{(x()?.usage ?? 0) > 0 ? `${x()!.usage.toFixed(2)} L` : "—"}</dd>
        <dt>Yarışın bitmesine</dt>
        <dd data-no-i18n>{c()?.raceLaps ? t("{0} tur", c()!.raceLaps.toFixed(1)) : "—"}</dd>
        <dt>Pit sonrası</dt>
        <dd data-no-i18n>{num(after())} L</dd>
      </dl>
      <Show when={props.d.can_control}>
        <fieldset class="pg-ctl" disabled={props.blocked}>
          <input
            class="pg-range"
            type="range"
            min="1"
            max={rmax()}
            step="1"
            value={Math.min(rmax(), props.liters)}
            aria-label={t("Eklenecek yakıt (litre)")}
            onInput={(e) => set(Number(e.currentTarget.value))}
          />
          <div class="pg-step" data-no-i18n>
            <button type="button" class="pg-b" aria-label="−1 L" onClick={() => set(props.liters - 1)}>
              −1
            </button>
            <input type="number" min="1" max="1000" value={props.liters} aria-label={t("Eklenecek yakıt (litre)")} onInput={(e) => set(Number(e.currentTarget.value))} />
            <button type="button" class="pg-b" aria-label="+1 L" onClick={() => set(props.liters + 1)}>
              +1
            </button>
            <button type="button" class="pg-b" onClick={() => set(props.liters + 5)}>
              +5 L
            </button>
            <button type="button" class="pg-b" onClick={() => set(props.liters + 10)}>
              +10 L
            </button>
          </div>
          <button type="button" class="pg-b pri" onClick={() => props.send("fuel_set", { liters: props.liters })}>
            {t("{0} L ayarla", String(props.liters))}
          </button>
          <div class="pg-row">
            <button type="button" class="pg-b" title={t("Yarış sonuna kadar yakıt")} onClick={toEnd}>
              {t("Bitişe kadar")}
              <Show when={toFinish() > 0}>
                <small data-no-i18n>{Math.ceil(toFinish())} L</small>
              </Show>
            </button>
            <button type="button" class="pg-b" disabled={room() < 1} onClick={full}>
              {t("Dolu")}
              <Show when={room() >= 1}>
                <small data-no-i18n>{room()} L</small>
              </Show>
            </button>
            <button type="button" class="pg-b" onClick={() => props.send("fuel_clear")}>
              {t("Yakıt ekleme")}
            </button>
          </div>
        </fieldset>
      </Show>
    </section>
  );
}

/** Lastik kartı: üstten araç + dört lastik (dolgu: kalan diş, sayı: sıcaklık, çerçeve + ✓: değişecek) */
export function TyreCard(props: { d: CrewDriver; blocked: boolean; fx: Fx; send: Send }) {
  const c = () => props.d.data?.crew ?? null;
  const pf = () => c()?.pit?.flags ?? -1;
  const has = (bit: number) => pf() >= 0 && (pf() & bit) !== 0;
  const ro = () => !props.d.can_control || props.blocked || pf() < 0;
  const toggle = (k: string) => {
    const cur: Record<string, boolean> = {};
    for (const cn of CORNERS) cur[cn.k] = has(cn.bit);
    cur[k] = !cur[k];
    props.send("tyres", cur);
  };
  const cmp = (v: number | undefined) => (typeof v === "number" && v >= 0 ? (v > 0 ? t("Yağmur") : t("Kuru")) : "");
  const cur = () => cmp(c()?.compound);
  const next = () => (pf() >= 0 && (pf() & PIT.tyres) !== 0 ? cmp(c()?.pit?.compound) : "");
  const Tyre = (p: { i: number }): JSX.Element => {
    const cn = CORNERS[p.i];
    const w = () => c()?.wear?.[p.i] ?? -1;
    const wv = () => Math.round(Math.min(100, Math.max(0, w())));
    const tp = () => Math.round(c()?.temp?.[p.i] ?? 0);
    const label = () =>
      [`${t(cn.label)}:`, w() >= 0 ? `${t("kalan diş")} ${wv()}%,` : "", tp() > 0 ? `${tp()}°C,` : "", pf() >= 0 ? (has(cn.bit) ? t("değişecek") : t("değişmeyecek")) : ""]
        .filter(Boolean)
        .join(" ")
        .replace(/[,:]$/, "");
    return (
      <button
        type="button"
        class={`pg-tyre ${cn.k}`}
        classList={{
          "w-ok": w() >= 60,
          "w-mid": w() >= 30 && w() < 60,
          "w-low": w() >= 0 && w() < 30,
          "h-cold": tp() > 0 && tp() < 50,
          "h-ok": tp() >= 50 && tp() <= 105,
          "h-hot": tp() > 105,
          chg: has(cn.bit),
          ...fxClass(props.fx, cn.k),
        }}
        aria-pressed={has(cn.bit)}
        aria-label={label()}
        title={label()}
        disabled={ro()}
        onClick={() => toggle(cn.k)}
      >
        <span class="inf">
          <small>{t(cn.label)}</small>
          <b data-no-i18n>{w() >= 0 ? `${wv()}%` : "—"}</b>
          <em data-no-i18n>{tp() > 0 ? `${tp()}°C` : "—"}</em>
        </span>
        <span class="rub">
          <i style={{ height: `${w() >= 0 ? wv() : 0}%` }} />
        </span>
        <span class="tick">{has(cn.bit) ? `✓ ${t("değişecek")}` : ""}</span>
      </button>
    );
  };
  return (
    <section class="pg-card pg-tyres">
      <h3 class="pg-h">
        <Ic n="tyre" />
        Lastik
        <span class="sp" />
        <Show when={cur()}>
          <span class="pg-badge">
            {cur()}
            {next() && next() !== cur() ? ` → ${next()}` : ""}
          </span>
        </Show>
        <Show when={!props.d.can_control}>
          <span class="pg-badge" title={t("Sadece izleme")}>
            <Ic n="lock" />
            <span class="sr">{t("Kilitli")}</span>
          </span>
        </Show>
      </h3>
      <div class="pg-car">
        <Tyre i={0} />
        <CarTop class="pg-carsvg" />
        <Tyre i={1} />
        <Tyre i={2} />
        <Tyre i={3} />
      </div>
      <p class="pg-note">
        {ro() ? t("Dolgu kalan dişi, sayı sıcaklığı gösterir.") : t("Lastiğe dokun: değişimi aç / kapat. Dolgu kalan dişi, sayı sıcaklığı gösterir.")}{" "}
        {t("iRacing lastik verisini sadece pitte günceller.")}
      </p>
      <Show when={props.d.can_control}>
        <fieldset class="pg-ctl" disabled={props.blocked}>
          <div class="pg-row">
            <button type="button" class="pg-b" onClick={() => props.send("tyres_all")}>
              <Ic n="tyre" />
              {t("4 lastik")}
            </button>
            <button type="button" class="pg-b" onClick={() => props.send("tyres_clear")}>
              {t("Hiçbiri")}
            </button>
          </div>
        </fieldset>
      </Show>
    </section>
  );
}

/** Pit servisi özeti: simgeli dört kutu (kontrol varsa aç / kapat düğmesi) */
export function ServiceStrip(props: { d: CrewDriver; liters: number; blocked: boolean; fx: Fx; send: Send }) {
  const c = () => props.d.data?.crew ?? null;
  const pf = () => c()?.pit?.flags ?? -1;
  const has = (bit: number) => pf() >= 0 && (pf() & bit) !== 0;
  const ro = () => !props.d.can_control || props.blocked || pf() < 0;
  const onoff = (on: boolean) => (pf() < 0 ? "—" : on ? t("Açık") : t("Kapalı"));
  const tyText = () => {
    if (pf() < 0) return "—";
    const ty = pf() & PIT.tyres;
    if (ty === PIT.tyres) return t("4 lastik");
    if (ty === 0) return t("Değişmeyecek");
    return CORNERS.filter((cn) => has(cn.bit))
      .map((cn) => t(cn.label))
      .join(", ");
  };
  const tiles = (): { key: string; icon: IconName; label: string; value: string; on: boolean; cnt?: string; act: () => void }[] => [
    {
      key: "fuel",
      icon: "fuel",
      label: t("Yakıt"),
      value: pf() < 0 ? "—" : has(PIT.fuel) ? `+${(c()!.pit.fuel ?? 0).toFixed(0)} L` : t("Eklenmeyecek"),
      on: has(PIT.fuel),
      act: () => (has(PIT.fuel) ? props.send("fuel_clear") : props.send("fuel_set", { liters: props.liters })),
    },
    { key: "tyres", icon: "tyre", label: t("Lastik"), value: tyText(), on: pf() >= 0 && (pf() & PIT.tyres) !== 0, act: () => props.send(pf() & PIT.tyres ? "tyres_clear" : "tyres_all") },
    {
      key: "fr",
      icon: "wrench",
      label: t("Hızlı tamir"),
      value: onoff(has(PIT.fastRepair)),
      on: has(PIT.fastRepair),
      cnt: (c()?.pit.fr ?? -1) >= 0 ? t("{0} hak", String(c()!.pit.fr)) : undefined,
      act: () => props.send("fast_repair", { on: !has(PIT.fastRepair) }),
    },
    { key: "tearoff", icon: "visor", label: t("Vizör filmi"), value: onoff(has(PIT.tearoff)), on: has(PIT.tearoff), act: () => props.send("tearoff", { on: !has(PIT.tearoff) }) },
  ];
  return (
    <div class="pg-svc">
      <For each={tiles()}>
        {(s) => (
          <button type="button" class="pg-sv" classList={{ on: s.on, ...fxClass(props.fx, s.key) }} aria-pressed={s.on} title={`${s.label}: ${s.value}`} disabled={ro()} onClick={s.act}>
            <span class="ic">
              <Ic n={s.icon} />
            </span>
            <span class="tx">
              <small>{s.label}</small>
              <b>{s.value}</b>
            </span>
            <Show when={s.cnt}>
              <em class="cnt">{s.cnt}</em>
            </Show>
            <i class="st" aria-hidden="true">
              {s.on ? "✓" : ""}
            </i>
          </button>
        )}
      </For>
    </div>
  );
}

/** Spotter: üstten araç + parlayan yan çubuklar. sp: 0 veri yok, 1 temiz, 2 solda, 3 sağda, 4 iki yanda */
export function SpotterView(props: { sp: number; ahead: number | null; behind: number | null }) {
  const left = () => props.sp === 2 || props.sp === 4;
  const right = () => props.sp === 3 || props.sp === 4;
  const text = () => (props.sp === 0 ? t("Spotter verisi yok") : left() && right() ? t("İki yanda araç") : left() ? t("Solunda araç") : right() ? t("Sağında araç") : t("Temiz"));
  const ahead = () => (props.ahead != null ? `${t("Önde")} ${props.ahead.toFixed(0)} m` : "");
  const behind = () => (props.behind != null ? `${t("Arkada")} ${props.behind.toFixed(0)} m` : "");
  return (
    <div class="pg-spot" classList={{ off: props.sp === 0, clr: props.sp === 1 }} role="img" aria-label={[text(), ahead(), behind()].filter(Boolean).join(" · ")}>
      <div class="pg-sbar l" classList={{ on: left() }}>
        <b>{left() ? t("SOLDA ARAÇ") : t("SOL")}</b>
      </div>
      <div class="pg-smid" data-no-i18n>
        <small>{ahead() || " "}</small>
        <CarTop class="pg-minicar" />
        <small>{behind() || " "}</small>
      </div>
      <div class="pg-sbar r" classList={{ on: right() }}>
        <b>{right() ? t("SAĞDA ARAÇ") : t("SAĞ")}</b>
      </div>
      <b class="pg-stxt">
        {props.sp === 1 ? "✓ " : left() || right() ? "⚠ " : ""}
        {text()}
      </b>
    </div>
  );
}
