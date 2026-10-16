// TV yayını overlay'leri (tvtower, tvresults, tvlower, tvbattle, tvfastest) için ortak parçalar:
// örnek veri, farklar / sıra / numara rengi yardımcıları, marka logosu kutusu. Görünüm: sdk/tv.css.

import { Show, createMemo, createSignal, onCleanup } from "solid-js";
import { demoShow, useTopic } from "./telemetry";
import { onScreen, previewFrozen, type SettingField } from "./overlay";
import { sampleRow } from "./samples";
import { brandOf, logoInfo } from "./logos";
import type { Row, Standings } from "./types";
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
export const TV_SAMPLE_INFO = { leaderLap: 206, elapsed: 14 * 3600 + 26 * 60 + 26, timeRemain: 9 * 3600 + 33 * 60, track: "Spa-Francorchamps", session: "Race" };

/** Sıralama: gerçek veri ya da (önizlemede) örnek. Sınıf filtresi: "" = hepsi, "mine" = kendi sınıfım. */
export function useTvStandings(editing: () => boolean) {
  const st = useTopic("standings");
  const ses = useTopic("session");
  const sample = () => !(st()?.rows?.length) && (editing() || !onScreen());
  const rows = createMemo<Row[]>(() => {
    const r = st()?.rows ?? [];
    if (r.length) return r.filter((x) => x.pos > 0 || x.classPos > 0).sort((a, b) => (a.pos || 999) - (b.pos || 999));
    return sample() ? TV_SAMPLE : [];
  });
  const info = () => {
    const s = st() as Standings | undefined;
    if (sample() || !s) return { ...TV_SAMPLE_INFO, camIdx: 10, sample: true };
    return {
      leaderLap: s.leaderLap,
      elapsed: s.elapsed,
      timeRemain: s.timeRemain,
      track: ses()?.track ?? "",
      session: s.sessionType || ses()?.sessionType || "",
      camIdx: s.camIdx ?? -1,
      sample: false,
    };
  };
  return { rows, info, sample, standings: st, session: ses };
}

// ---------------------------------------------------------------------------
// Yazı yardımcıları
// ---------------------------------------------------------------------------

/** "Lukas Brenner" → "BRENNER" (TV'deki gibi soyad, büyük harf; Türkçe büyük harf kuralı) */
export function lastNameUpper(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^\d+$/.test(p));
  const last = parts.length > 1 ? parts.slice(1).join(" ") : (parts[0] ?? "");
  return last.toUpperCase();
}
/** "Lukas Brenner" → "L. BRENNER" */
export function initialLast(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => !/^\d+$/.test(p));
  if (parts.length < 2) return name.toUpperCase();
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`.toUpperCase();
}
export const upper = (s: string) => s.toUpperCase();

export function tvName(name: string, fmt: string) {
  if (fmt === "full") return upper(name);
  if (fmt === "initial") return initialLast(name);
  return lastNameUpper(name);
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
export function gapToLeader(r: Row, leader: Row | undefined, leaderLap: number, opts: { lapsWord?: string; pit?: boolean } = {}) {
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
export function resultGap(r: Row, i: number, leaderLap: number) {
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
        label: "Bir seferde en çok",
        type: "number",
        default: cfg.maxSecs ?? 0,
        min: 0,
        max: 300,
        step: 5,
        unit: "sn",
        hint: "0: olay sürdükçe ekranda kalır. Süre dolunca gizlenir ve bekleme süresi başlar.",
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
        showIf: { key: "show", is: ["auto"] },
        group: G_SHOW,
      },
    );
  f.push(
    { key: "everyMin", label: "Kaç dakikada bir", type: "number", default: cfg.everyMin ?? 5, min: 1, max: 60, step: 1, unit: "dk", showIf: { key: "show", is: ["interval"] }, group: G_SHOW },
    { key: "showSecs", label: "Her seferde ekranda kalma", type: "number", default: cfg.showSecs ?? 20, min: 3, max: 300, step: 1, unit: "sn", showIf: { key: "show", is: ["interval"] }, group: G_SHOW },
    { key: "raceOnly", label: "Sadece yarış oturumunda", type: "boolean", default: cfg.raceOnly ?? false, group: G_SHOW },
  );
  return f;
}

/**
 * Görünürlük durumu. `event`: overlay'in gösterecek bir şeyi var mı (auto kipinde olay; diğer kiplerde
 * gösterilecek veri var mı). Düzenleme / panel önizlemesi / demo'da her zaman görünür.
 */
export function useTvVisible(p: { o: () => Record<string, unknown>; event: () => boolean; editing: () => boolean; sample: () => boolean }) {
  const ses = useTopic("session");
  const [now, setNow] = createSignal(Date.now());
  let shownSince = 0;
  let coolUntil = 0;
  const [autoOn, setAutoOn] = createSignal(false);
  const mode = () => String(p.o().show || "auto");
  // auto kipi: olay başlayınca göster, en çok maxSecs, sonra cooldown kadar bekle (zamanlayıcıda güncellenir)
  const step = () => {
    const n = Date.now();
    setNow(n);
    const ev = p.event();
    const max = Math.max(0, Number(p.o().maxSecs) || 0) * 1000;
    const cool = Math.max(0, Number(p.o().cooldown) || 0) * 1000;
    if (autoOn()) {
      if (!ev || (max > 0 && n - shownSince > max)) {
        setAutoOn(false);
        coolUntil = n + cool;
      }
    } else if (ev && n >= coolUntil) {
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
