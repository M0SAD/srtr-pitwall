// TV yayını overlay'leri (tvtower, tvresults, tvlower, tvbattle, tvfastest) için ortak parçalar:
// örnek veri, farklar / sıra / numara rengi yardımcıları, marka logosu kutusu. Görünüm: sdk/tv.css.

import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { demoShow, useTopic } from "./telemetry";
import { defaultOptions, onScreen, previewFrozen, type OverlayManifest, type SettingField } from "./overlay";
import { sampleRow } from "./samples";
import { brandOf, logoInfo } from "./logos";
import type { Row, Standings } from "./types";
import { lapTime } from "./format";
import "./tv.css";

// ---------------------------------------------------------------------------
// Örnek veri (panel önizlemesi / düzenleme modu; sim kapalıyken)
// ---------------------------------------------------------------------------

const S: [string, string, string, number, string, string][] = [
  // ad, araç, numara, iRating, ülke, takım
  ["Lukas Brenner", "Ford Mustang GT3", "64", 5400, "DE", "Hartmann Racing"],
  ["Marco Engelhardt", "Mercedes-AMG GT3", "48", 5200, "DE", "Silver Arrow Motorsport"],
  ["Thijs de Vries", "Porsche 911 GT3 R", "2", 4800, "NL", "Boutique Racing"],
  ["Oliver Harper", "BMW M4 GT3", "46", 4700, "GB", "Team North"],
  ["Diego Juncal", "Mercedes-AMG GT3", "3", 4600, "ES", "Craft Racing"],
  ["Ethan Tucker", "Ferrari 296 GT3", "74", 3900, "US", "Rosso Corse"],
  ["Hugo Prette", "McLaren 720S GT3 Evo", "58", 3800, "FR", "Garage 58"],
  ["Jonas Klingner", "BMW M4 GT3", "998", 3700, "DE", "Rowe Performance"],
  ["Felix Preiner", "Porsche 911 GT3 R", "80", 3500, "AT", "Alpen Racing"],
  ["Mads Sorensen", "Aston Martin Vantage GT3", "7", 3400, "DK", "Nordic Speed"],
  ["Emre Kaya", "BMW M4 GT3", "32", 3300, "TR", "Pitwall Racing"],
  ["Ricardo Ghetti", "Porsche 911 GT3 R", "10", 3100, "IT", "Squadra Corsa"],
  ["Noah Campbell", "Porsche 911 GT3 R", "22", 3000, "GB", "Highland Motorsport"],
  ["Bruno Gelaal", "Ferrari 296 GT3", "50", 2900, "BE", "AF Racing"],
  ["Louis Rougier", "McLaren 720S GT3 Evo", "111", 2800, "FR", "Garage 59"],
  ["Tom Engstler", "Lamborghini Huracan GT3 EVO", "96", 2700, "DE", "Bull Racing"],
  ["Nuno Chaves", "Aston Martin Vantage GT3", "34", 2600, "PT", "Lusitania GT"],
  ["Simon Machiels", "Ferrari 296 GT3", "52", 2400, "BE", "Red Lion"],
  ["Adam Pittard", "BMW M4 GT3", "991", 2300, "GB", "Century Motorsport"],
  ["Marc Montenegro", "BMW M4 GT3", "30", 2200, "ES", "Iberia Racing"],
  ["Sven Coseteng", "Ford Mustang GT3", "65", 2100, "SE", "Blue Oval"],
  ["Paul Gazeau", "Mercedes-AMG GT3", "6", 2000, "FR", "Team Paris"],
  ["Ben Porter", "McLaren 720S GT3 Evo", "5", 1900, "GB", "Optimum"],
  ["Jan Farfus", "BMW M4 GT3", "98", 1800, "BR", "Samba Speed"],
  ["Nils Nielsen", "Ferrari 296 GT3", "51", 1700, "DK", "Kessel"],
  ["Kenji Hattori", "Ferrari 296 GT3", "80", 1600, "JP", "LM Corsa"],
  ["Yuto Maezawa", "Ferrari 296 GT3", "555", 1500, "JP", "Maezawa Racing"],
  ["Ryo Ohyagi", "Nissan GT-R Nismo GT3", "81", 1400, "JP", "Team Daishin"],
  ["Ali Miyake", "Nissan GT-R Nismo GT3", "500", 1300, "JP", "Team 5Zigen"],
  ["Paul Ellis", "Mercedes-AMG GT3", "75", 1200, "AU", "75 Express"],
];

export const TV_SAMPLE: Row[] = S.map(([name, carName, number, irating, flair, team], i) =>
  sampleRow({
    idx: i,
    pos: i + 1,
    classPos: i + 1,
    name,
    carName,
    car: carName.split(" ")[0],
    number,
    irating,
    flair,
    team,
    gap: i === 0 ? 0 : i < 8 ? i * 0.52 + (i % 3) * 0.13 : 99,
    interval: i === 0 ? 0 : i < 8 ? 0.52 : 1.9,
    lapsDown: i < 8 ? 0 : i < 26 ? 1 : 3 + i,
    best: 97.4 + i * 0.05,
    last: 98.1 + (i % 5) * 0.2,
    onPit: i === 17,
    pitState: i === 17 ? "PIT" : "",
    posChange: i === 3 ? 2 : i === 6 ? -1 : 0,
    isMe: i === 10,
    classBest: i === 4,
  }),
);
export const TV_SAMPLE_INFO = {
  leaderLap: 206,
  totalLaps: 0,
  elapsed: 14 * 3600 + 26 * 60 + 26,
  raceElapsed: 14 * 3600 + 21 * 60 + 5,
  timeRemain: 9 * 3600 + 33 * 60,
  lapsRemain: 32767,
  totalTime: 24 * 3600,
  track: "Spa-Francorchamps",
  session: "Race",
};

/** Sıralama: gerçek veri ya da (önizlemede) örnek. Sınıf filtresi: "" = hepsi, "mine" = kendi sınıfım. */
export function useTvStandings(editing: () => boolean) {
  const st = useTopic("standings");
  const ses = useTopic("session");
  const sample = () => !(st()?.rows?.length) && (editing() || !onScreen());
  // Sıralama bir an boş gelirse (oturum geçişi, araçlar sunucudan çıkarken) son dolu liste birkaç saniye tutulur:
  // TV grafikleri yanıp sönmesin
  let last: Row[] = [];
  let lastAt = 0;
  const rows = createMemo<Row[]>(() => {
    const r = st()?.rows ?? [];
    let l = r.filter((x) => x.pos > 0 || x.classPos > 0).sort((a, b) => (a.pos || 999) - (b.pos || 999));
    // Gridde (yarış başlamadan) sim sıra vermeyebilir: sıralama verisinin kendi sırası (grid / sıralama) kullanılır
    if (!l.length && r.length) l = r.map((x, i) => ({ ...x, pos: i + 1, classPos: x.classPos || i + 1 }));
    if (l.length) {
      last = l;
      lastAt = Date.now();
      return l;
    }
    if (sample()) return TV_SAMPLE;
    return last.length && Date.now() - lastAt < 8000 ? last : [];
  });
  const info = () => {
    const s = st() as Standings | undefined;
    if (sample() || !s) return { ...TV_SAMPLE_INFO, camIdx: 10, sample: true };
    return {
      leaderLap: s.leaderLap,
      totalLaps: s.totalLaps ?? 0,
      elapsed: s.elapsed,
      raceElapsed: s.raceElapsed ?? -1,
      timeRemain: s.timeRemain,
      lapsRemain: s.lapsRemain,
      totalTime: s.totalTime,
      track: ses()?.track ?? "",
      session: s.sessionType || ses()?.sessionType || "",
      camIdx: s.camIdx ?? -1,
      camKind: s.camKind ?? "",
      camOnboard: !!s.camOnboard,
      sample: false,
    };
  };
  return { rows, info, sample, standings: st, session: ses };
}

// ---------------------------------------------------------------------------
// Yazı yardımcıları
// ---------------------------------------------------------------------------

/** "Lukas Brenner" → "BRENNER" (TV'deki gibi soyad, büyük harf; Türkçe büyük harf kuralı) */
/** Türkçe büyük harf (i → İ) gerekir mi: adda Türkçe harf var ya da sürücünün ülkesi Türkiye */
const TR_CHARS = /[çğışöüÇĞİŞÖÜ]/;
const TR_FLAIR = /^(tr|tur|turkey|türkiye|turkiye)$/i;
export const isTr = (name: string, flair?: string) => TR_CHARS.test(name) || TR_FLAIR.test(String(flair ?? "").trim());
/** Büyük harf: Türkçe ad / Türk sürücü için "Erkin" → "ERKİN" (yoksa "ERKIN" olurdu) */
export const upper = (s: string, tr?: boolean) => ((tr ?? TR_CHARS.test(s)) ? s.toLocaleUpperCase("tr-TR") : s.toUpperCase());

export function lastNameUpper(name: string, flair?: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^\d+$/.test(p));
  const last = parts.length > 1 ? parts.slice(1).join(" ") : (parts[0] ?? "");
  return upper(last, isTr(name, flair));
}
/** "Lukas Brenner" → "L. BRENNER" */
export function initialLast(name: string, flair?: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^\d+$/.test(p));
  if (parts.length < 2) return upper(name, isTr(name, flair));
  return upper(`${parts[0][0]}. ${parts.slice(1).join(" ")}`, isTr(name, flair));
}

export function tvName(name: string, fmt: string, flair?: string) {
  if (fmt === "full") return upper(name, isTr(name, flair));
  if (fmt === "initial") return initialLast(name, flair);
  return lastNameUpper(name, flair);
}

/** Oturum adı (TV etiketi) */
export function sessionLabel(t: string) {
  const s = (t || "").toLowerCase();
  if (s.includes("race")) return "RACE";
  if (s.includes("qual")) return "QUALIFYING";
  if (s.includes("warm")) return "WARM UP";
  if (s.includes("prac")) return "PRACTICE";
  if (s.includes("test")) return "TEST";
  return t ? upper(t) : "RACE";
}

/** 51986 → "14:26:26" */
export function hms(sec: number) {
  if (!isFinite(sec) || sec < 0) return "--:--:--";
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Lidere fark (TV biçimi): lider "206 LAPS", diğerleri "+1.234" / "+1L" / "PIT" */
/** Yarış oturumu mu (antrenman / sıralamada farklar en iyi tura göre) */
export const isRaceSession = (t: string) => /race/i.test(t || "");

export function gapToLeader(r: Row, leader: Row | undefined, leaderLap: number, opts: { lapsWord?: string; pit?: boolean; race?: boolean } = {}) {
  if (opts.race === false) {
    // Antrenman / sıralama: lider en iyi turu, diğerleri en iyi tur farkı
    if (!leader || r.idx === leader.idx || r.pos === 1) return r.best > 0 ? lapTime(r.best) : "—";
    if (!(r.best > 0) || !(leader.best > 0)) return "—";
    return `+${(r.best - leader.best).toFixed(3)}`;
  }
  if (opts.pit !== false && r.onPit) return "PIT";
  if (!leader || r.idx === leader.idx || r.pos === 1) return leaderLap > 0 ? `${leaderLap} ${opts.lapsWord ?? "LAPS"}` : "LEADER";
  if (r.lapsDown > 0) return `+${r.lapsDown}L`;
  if (!(r.gap > 0) || r.gap > 3600) return "—";
  return `+${r.gap.toFixed(3)}`;
}
export function intervalText(r: Row, i: number) {
  if (r.onPit) return "PIT";
  if (i === 0) return "INTERVAL";
  if (!(r.interval > 0) || r.interval > 3600) return r.lapsDown > 0 ? `+${r.lapsDown}L` : "—";
  return `+${r.interval.toFixed(3)}`;
}
/** Sonuç tablosu farkı: "+3 LAPS" / "+12.345" */
export function resultGap(r: Row, i: number, leaderLap: number, race = true, leader?: Row) {
  if (!race) {
    // Sıralama / antrenman sonucu: lider en iyi turu, diğerleri farkı
    if (i === 0) return r.best > 0 ? lapTime(r.best) : "—";
    if (!(r.best > 0) || !(leader && leader.best > 0)) return "—";
    return `+${(r.best - leader.best).toFixed(3)}`;
  }
  if (i === 0) return leaderLap > 0 ? `${leaderLap} LAPS` : "WINNER";
  if (r.lapsDown > 0) return `+${r.lapsDown} ${r.lapsDown === 1 ? "LAP" : "LAPS"}`;
  if (!(r.gap > 0) || r.gap > 36000) return "—";
  return `+${r.gap.toFixed(3)}`;
}

/** Numara kutusunun rengi: sınıf rengi, beyaz ya da iRating'e göre kategori (Pro / Gold / Silver / Bronze) */
export function numberColors(r: Row, mode: string): { bg: string; fg: string } {
  if (mode === "white") return { bg: "#ffffff", fg: "#0b0b0d" };
  if (mode === "category") {
    const ir = r.irating || 0;
    if (ir >= 4000) return { bg: "#ffffff", fg: "#0b0b0d" };
    if (ir >= 2500) return { bg: "#f6d20a", fg: "#0b0b0d" };
    if (ir >= 1500) return { bg: "#2f6fd6", fg: "#ffffff" };
    return { bg: "#ff8a1f", fg: "#0b0b0d" };
  }
  const c = r.classColor || "#ffffff";
  return { bg: c, fg: lightness(c) > 0.6 ? "#0b0b0d" : "#ffffff" };
}
function lightness(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// ---------------------------------------------------------------------------
// Logo kutusu (beyaz zeminli marka logosu, TV'deki gibi)
// ---------------------------------------------------------------------------

export function TvLogo(props: { carName: string; class?: string }) {
  const brand = createMemo(() => brandOf(props.carName));
  const info = createMemo(() => logoInfo(brand()));
  return (
    <span class={`tv-logo ${props.class ?? ""}`} title={props.carName}>
      <Show when={info()?.src} fallback={<b>{(brand()?.name ?? props.carName).slice(0, 3).toUpperCase()}</b>}>
        <img src={info()!.src} alt="" draggable={false} style={info()!.scale && info()!.scale !== 1 ? { transform: `scale(${info()!.scale})` } : undefined} />
      </Show>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Görünürlük (ortak ayarlar): TV grafikleri yayında hep değil, zaman zaman görünür
// ---------------------------------------------------------------------------

const G_SHOW = "Ne zaman görünsün";

/**
 * Ortak görünürlük ayarları. `auto`: overlay'in kendi olayı (mücadele olunca, en hızlı tur atılınca...);
 * `always`: hep; `interval`: belirli aralıklarla kısa süre; `never`: kapalı (yalnızca düzenlemede görünür).
 */
export function tvShowSettings(cfg: {
  autoLabel?: string;
  def?: "auto" | "always" | "interval";
  maxSecs?: number;
  cooldown?: number;
  showSecs?: number;
  everyMin?: number;
  raceOnly?: boolean;
  /** Yeşil bayraktan önce (gridde, ısınma turunda) gizle; undefined: ayar yok */
  hideBeforeGreen?: boolean;
  /** Damalı bayraktan sonra gizle; undefined: ayar yok */
  hideAfterFinish?: boolean;
  finishHint?: string;
  /** Olay başına bir kez: süre dolunca olay bitene dek tekrar çıkmaz (bekleme ayarı yok); süre ayarının adı / açıklaması */
  once?: { label: string; hint: string };
}): SettingField[] {
  const auto = !!cfg.autoLabel;
  const options = [
    ...(auto ? [{ value: "auto", label: cfg.autoLabel! }] : []),
    { value: "always", label: "Her zaman" },
    { value: "interval", label: "Belirli aralıklarla (birkaç dakikada bir)" },
    { value: "never", label: "Gizli (yalnızca düzenlerken görünür)" },
  ];
  const f: SettingField[] = [
    { key: "show", label: "Ne zaman görünsün", type: "select", default: cfg.def ?? (auto ? "auto" : "always"), options, group: G_SHOW },
  ];
  if (auto)
    f.push(
      {
        key: "maxSecs",
        label: cfg.once?.label ?? "Bir seferde en çok",
        type: "number",
        default: cfg.maxSecs ?? 0,
        min: 0,
        max: 300,
        step: 5,
        unit: "sn",
        hint: cfg.once?.hint ?? "0: olay sürdükçe ekranda kalır. Süre dolunca gizlenir ve bekleme süresi başlar.",
        showIf: { key: "show", is: ["auto"] },
        group: G_SHOW,
      },
      {
        key: "cooldown",
        label: "Tekrar görünmeden önce bekleme",
        type: "number",
        default: cfg.cooldown ?? 0,
        min: 0,
        max: 600,
        step: 5,
        unit: "sn",
        hint: "Gizlendikten sonra bu süre geçmeden yeniden çıkmaz (ekran sürekli dolu olmasın).",
        showIf: { key: "show", is: cfg.once ? ["__never"] : ["auto"] },
        group: G_SHOW,
      },
    );
  f.push(
    { key: "everyMin", label: "Kaç dakikada bir", type: "number", default: cfg.everyMin ?? 5, min: 1, max: 60, step: 1, unit: "dk", showIf: { key: "show", is: ["interval"] }, group: G_SHOW },
    { key: "showSecs", label: "Her seferde ekranda kalma", type: "number", default: cfg.showSecs ?? 20, min: 3, max: 300, step: 1, unit: "sn", showIf: { key: "show", is: ["interval"] }, group: G_SHOW },
    { key: "raceOnly", label: "Sadece yarış oturumunda", type: "boolean", default: cfg.raceOnly ?? false, group: G_SHOW },
  );
  if (cfg.hideBeforeGreen !== undefined)
    f.push({ key: "hideBeforeGreen", label: "Yeşil bayraktan önce gizle", type: "boolean", default: cfg.hideBeforeGreen, hint: "Gridde ve ısınma turunda görünmez; yarış başlayınca çıkar.", group: G_SHOW });
  if (cfg.hideAfterFinish !== undefined)
    f.push({ key: "hideAfterFinish", label: "Damalı bayraktan sonra gizle", type: "boolean", default: cfg.hideAfterFinish, hint: cfg.finishHint ?? "Yarış bitince ekrandan kalkar (sonuç tablosuna yer açılır).", group: G_SHOW });
  return f;
}

/**
 * Görünürlük durumu. `event`: overlay'in gösterecek bir şeyi var mı (auto kipinde olay; diğer kiplerde
 * gösterilecek veri var mı). Düzenleme / panel önizlemesi / demo'da her zaman görünür.
 */
export function useTvVisible(p: {
  o: () => Record<string, unknown>;
  event: () => boolean;
  editing: () => boolean;
  sample: () => boolean;
  /** Olay başına bir kez göster (süre dolunca olay bitene dek kapalı kalır) */
  once?: boolean;
  /** "Damalı bayraktan sonra gizle" için yarış bitti mi (verilmezse damalı bayrak çıkınca) */
  finished?: () => boolean;
}) {
  const ses = useTopic("session");
  const [now, setNow] = createSignal(Date.now());
  let shownSince = 0;
  let coolUntil = 0;
  let spent = false;
  const [autoOn, setAutoOn] = createSignal(false);
  const mode = () => String(p.o().show || "auto");
  // auto kipi: olay başlayınca göster, en çok maxSecs, sonra cooldown kadar bekle (zamanlayıcıda güncellenir)
  const step = () => {
    const n = Date.now();
    setNow(n);
    const ev = p.event();
    const max = Math.max(0, Number(p.o().maxSecs) || 0) * 1000;
    const cool = Math.max(0, Number(p.o().cooldown) || 0) * 1000;
    if (!ev) spent = false;
    if (autoOn()) {
      if (!ev || (max > 0 && n - shownSince > max)) {
        setAutoOn(false);
        coolUntil = n + cool;
        if (ev && p.once) spent = true;
      }
    } else if (ev && n >= coolUntil && !spent) {
      shownSince = n;
      setAutoOn(true);
    }
  };
  const t = window.setInterval(() => !previewFrozen() && step(), 400);
  onCleanup(() => clearInterval(t));
  const preview = () => p.editing() || !onScreen() || demoShow() || p.sample();
  return () => {
    if (preview()) return true;
    const m = mode();
    if (m === "never") return false;
    // Yarış durumu (iRacing SessionState): 1-3 gridde / ısınma turunda, 4 yarış, 5 damalı bayrak, 6 soğuma turu
    const state = ses()?.state ?? 0;
    if (p.o().hideBeforeGreen && state >= 1 && state <= 3) return false;
    if (p.o().hideAfterFinish && state >= 5 && (p.finished ? p.finished() : true)) return false;
    if (p.o().raceOnly) {
      const st = String(ses()?.sessionType ?? "").toLowerCase();
      if (st && !st.includes("race")) return false;
    }
    if (m === "always") return p.event();
    if (m === "interval") {
      const every = Math.max(1, Number(p.o().everyMin) || 5) * 60_000;
      const secs = Math.max(3, Number(p.o().showSecs) || 20) * 1000;
      return p.event() && now() % every < secs;
    }
    return autoOn() && p.event();
  };
}

/**
 * Overlay ayarları + manifest varsayılanları. Kayıtlı kopyalar oluşturuldukları andaki ayarları taşır: sonradan eklenen
 * ayarlar (ör. "Damalı bayraktan sonra gizle") kayıtta yoktur; varsayılanları buradan gelir.
 */
export function withDefaults(m: OverlayManifest, opts: () => Record<string, unknown>) {
  const d = defaultOptions(m);
  const memo = createMemo(() => ({ ...d, ...(opts() ?? {}) }));
  return () => memo();
}

/**
 * Yarış sonu: damalı bayraktan sonra ilk `o().finishers` araç çizgiyi geçtikten `o().openDelay` sn sonra true.
 * Damalı bayrak çıktığı andaki turlar not edilir; turu artan araç bitirmiş sayılır (lider bayrağı gördüğü için zaten bitirmiştir).
 */
export function useFinishReady(o: () => Record<string, unknown>, rows: () => Row[], state: () => number, race: () => boolean = () => true) {
  let snap: Map<number, number> | null = null;
  const done = new Set<number>();
  let lastDone = 0;
  const [readyAt, setReadyAt] = createSignal(0);
  // Herkesin bitirmesi beklenirken son bitiren üzerinden zaman geçti mi diye ara ara bakılır
  const [tick, setTick] = createSignal(0);
  const iv = window.setInterval(() => setTick((x) => x + 1), 2000);
  onCleanup(() => clearInterval(iv));
  createEffect(() => {
    tick();
    const st = state();
    const l = rows();
    if (st < 5) {
      snap = null;
      done.clear();
      lastDone = 0;
      if (readyAt()) setReadyAt(0);
      return;
    }
    if (!snap) {
      snap = new Map(l.map((r) => [r.idx, r.lapsDone ?? 0]));
      if (l[0]) done.add(l[0].idx);
      lastDone = Date.now();
    }
    for (const r of l)
      if (!done.has(r.idx) && (r.lapsDone ?? 0) > (snap.get(r.idx) ?? 1e9)) {
        done.add(r.idx);
        lastDone = Date.now();
      }
    if (readyAt()) return;
    // Soğuma turu (6): yarış bitti (bitirenler sayılamasa da, ör. uygulama yarış bitince açıldı)
    if (st >= 6) return void setReadyAt(Date.now());
    if (!race()) return void setReadyAt(Date.now());
    if (o().waitAll === true) {
      // Herkes bitirdi: pistte bitirmemiş (pitte / garajda olmayan) araç kalmadı; ya da 2 dk kimse bitirmedi
      const left = l.filter((r) => !done.has(r.idx) && !r.onPit && r.pitState !== "GAR" && r.pitState !== "PIT");
      if (!left.length || Date.now() - lastDone > 120_000) setReadyAt(Date.now());
      return;
    }
    // Sıralama / antrenman: damalı bayrak oturumun sonu; bitiren sayısı beklenmez
    const need = Math.max(1, Math.min(l.length || 1, Number(o().finishers) || 1));
    if (done.size >= need) setReadyAt(Date.now());
  });
  return () => readyAt() > 0 && Date.now() - readyAt() >= Math.max(0, Number(o().openDelay) || 0) * 1000;
}

/** Damalı bayraktan sonra yarışı bitiren araçlar (idx kümesi): bayrak anında lider + turu artanlar */
export function useFinishedCars(rows: () => Row[], state: () => number) {
  let snap: Map<number, number> | null = null;
  const [done, setDone] = createSignal<ReadonlySet<number>>(new Set());
  createEffect(() => {
    const st = state();
    const l = rows();
    if (st < 5) {
      snap = null;
      if (done().size) setDone(new Set<number>());
      return;
    }
    if (!snap) {
      snap = new Map(l.map((r) => [r.idx, r.lapsDone ?? 0]));
      if (l[0]) setDone(new Set([l[0].idx]));
    }
    const cur = done();
    let add: number[] | null = null;
    for (const r of l) if (!cur.has(r.idx) && (r.lapsDone ?? 0) > (snap.get(r.idx) ?? 1e9)) (add ??= []).push(r.idx);
    if (add) setDone(new Set([...cur, ...add]));
  });
  return (idx: number | undefined) => idx !== undefined && done().has(idx);
}

/**
 * Yarış sonu sırası: TV Yarış Sonucu (podyum) aynı pencerede açıksa TV Sonuç Tablosu onun bitmesini bekler
 * (kule → podyum → sonuç tablosu). Podyum kendini kaydeder; gösterilip kapanınca `done` olur.
 */
export const [podiumMounted, setPodiumMounted] = createSignal(0);
export const [podiumDoneAt, setPodiumDoneAt] = createSignal(0);

/** Yarış sonu açılış ayarları (TV Sonuç Tablosu, TV Yarış Sonucu) */
export const finishSettings = (waitAll = false): SettingField[] => [
  ...(waitAll
    ? [{ key: "waitAll", label: "Yarış bitince aç (herkes bitirince)", type: "boolean", default: true, group: "Ne zaman görünsün", showIf: { key: "show", is: ["auto"] }, hint: "Bitiş çizgisini pistteki bütün araçlar geçince açılır (2 dk kimse geçmezse de açılır). Kapalıysa aşağıdaki araç sayısı kadar bitiren yeter." } as SettingField]
    : []),
  { key: "finishers", label: "Kaç araç bitirince açılsın", type: "number", default: 3, min: 1, max: 20, step: 1, ui: "stepper", group: "Ne zaman görünsün", showIf: waitAll ? { key: "waitAll", is: [false] } : { key: "show", is: ["auto"] }, hint: "Damalı bayrağı bu kadar araç geçince sayaç başlar (lider dahil)." },
  { key: "openDelay", label: "Sonra kaç saniye beklesin", type: "number", default: 15, min: 0, max: 180, step: 1, unit: "sn", group: "Ne zaman görünsün", showIf: { key: "show", is: ["auto"] } },
];
