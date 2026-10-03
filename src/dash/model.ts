// Dashboard Tasarımcısı: veri modeli, veri alanları kataloğu, bileşen paleti ve hazır şablonlar.
// Aynı model üç yerde çizilir (src/dash/Render.tsx): tasarımcı tuvali, Direksiyon Ekranı overlay'i
// ("Özel tasarım" görünümü) ve başka cihazdaki tarayıcı sayfası (/dash/<id>).
//
// Saklama: ayarlar → `dashes: CustomDash[]` (src/sdk/settings.ts). Dışa / içe aktarma aynı JSON'dur:
//   { id, name, width, height, bg, bgA, font, radius, pages: [{ id, name, widgets: [{ id, type, x, y, w, h, props }] }] }

import { createSignal } from "solid-js";
import { clock, gear as fmtGear, lapTime } from "@/sdk/format";
import type { Units } from "@/sdk/overlay";
import type { Delta, Ers, Fuel, Inputs, Laps, Relative, Session, Status, Telemetry, Tires, Weather } from "@/sdk/types";

export type WidgetType = "label" | "value" | "gear" | "rpmBar" | "rpmLeds" | "bar" | "radial" | "tyres" | "deltaBar" | "flag" | "rect" | "image";

/** Koşullu renk kuralı: değer eşiği aşınca renk değişir (istenirse yanıp söner) */
export interface ColorRule {
  op: ">" | "<" | "=";
  v: number;
  color: string;
  blink?: boolean;
}

export interface WidgetProps {
  /** Veri alanı (FIELDS anahtarı) */
  field?: string;
  /** Kuralların baktığı alan (boş: `field`); ör. yazı alanı "drs" için sayısal "drsNum" */
  ruleField?: string;
  /** Sabit yazı (label) */
  text?: string;
  /** Etiket; boş: etiket yok */
  label?: string;
  labelPos?: "top" | "bottom" | "left";
  fontSize?: number;
  labelSize?: number;
  weight?: number;
  /** "" tasarımın yazı tipi */
  font?: "" | "digital" | "mono" | "sans";
  color?: string;
  labelColor?: string;
  bg?: string;
  /** Arka plan opaklığı 0..100 */
  bgA?: number;
  border?: string;
  borderW?: number;
  radius?: number;
  align?: "left" | "center" | "right";
  /** -1: alanın varsayılanı */
  decimals?: number;
  showUnit?: boolean;
  min?: number;
  max?: number;
  vertical?: boolean;
  /** LED sayısı */
  count?: number;
  /** Devir bölgeleri: düşük / orta / yüksek / vites noktası */
  c1?: string;
  c2?: string;
  c3?: string;
  c4?: string;
  /** Bölge sınırları (0..100 %) */
  z1?: number;
  z2?: number;
  /** Vites: devire göre renk */
  rpmColor?: boolean;
  /** Vites noktasında yanıp sön */
  flash?: boolean;
  tyreMode?: "temp" | "press" | "wear";
  /** Resim (küçültülmüş data URL) */
  src?: string;
  fit?: "contain" | "cover";
  rules?: ColorRule[];
}

export interface DashWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  props: WidgetProps;
}

/** Sayfa: gerçek direksiyon ekranlarındaki gibi, kısayolla / dokunarak değiştirilir. Dizideki sıra = katman sırası (sondaki üstte). */
export interface DashPage {
  id: string;
  name: string;
  widgets: DashWidget[];
}

export interface CustomDash {
  id: string;
  name: string;
  /** Tasarım tuvali (px) */
  width: number;
  height: number;
  bg: string;
  /** 0..100 */
  bgA: number;
  font: "digital" | "mono" | "sans";
  radius: number;
  pages: DashPage[];
  /** Toplulukta paylaşıldıysa paylaşımın kimliği (yerel işaret; paylaşılan veriye girmez). Sonraki paylaşımda "öncekini güncelle" sorulur. */
  sharedId?: string;
}

export const MAX_DASHES = 20;
export const MAX_PAGES = 8;
export const MAX_WIDGETS = 80;
/** Resim bileşeninin data URL sınırı (karakter) */
export const MAX_IMAGE = 400_000;

export const CANVAS_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "DDU 5\" (800×480)", w: 800, h: 480 },
  { label: "DDU 4.3\" (480×272)", w: 480, h: 272 },
  { label: "Geniş şerit (1280×400)", w: 1280, h: 400 },
  { label: "Telefon yatay 19.5:9 (844×390)", w: 844, h: 390 },
  { label: "Telefon dikey 9:19.5 (390×844)", w: 390, h: 844 },
  { label: "Telefon yatay 16:9 (800×450)", w: 800, h: 450 },
  { label: "Tablet yatay 4:3 (1024×768)", w: 1024, h: 768 },
  { label: "Tablet dikey 3:4 (768×1024)", w: 768, h: 1024 },
  { label: "Tablet 16:10 (1280×800)", w: 1280, h: 800 },
  { label: "HD 16:9 (1280×720)", w: 1280, h: 720 },
];


// ---------------------------------------------------------------------------
// Veri
// ---------------------------------------------------------------------------

export interface DashData {
  tel?: Telemetry;
  delta?: Delta;
  laps?: Partial<Laps>;
  ses?: Partial<Session>;
  fuel?: Partial<Fuel>;
  tires?: Tires;
  ers?: Ers;
  inputs?: Inputs;
  rel?: Partial<Relative>;
  wx?: Partial<Weather>;
  status?: Partial<Status>;
}

type Val = number | string | undefined;
export type FieldFmt = "num" | "lap" | "clock" | "delta" | "text";

export interface DashField {
  id: string;
  label: string;
  group: string;
  fmt: FieldFmt;
  dec?: number;
  unit?: (u: Units) => string;
  /** Çubuk / kadran için varsayılan aralık */
  min?: number;
  max?: number;
  get: (d: DashData, u: Units) => Val;
}

const pos = (v: number | undefined | null): number | undefined => (v != null && isFinite(v) && v >= 0 ? v : undefined);
const gt0 = (v: number | undefined | null): number | undefined => (v != null && isFinite(v) && v > 0 ? v : undefined);
const fin = (v: number | undefined | null): number | undefined => (v != null && isFinite(v) ? v : undefined);
const imp = (u: Units) => u === "imperial";
const tempC = (c: number | undefined, u: Units) => (c == null || !isFinite(c) || c <= -1 ? undefined : imp(u) ? c * 1.8 + 32 : c);
const tU = (u: Units) => (imp(u) ? "°F" : "°C");
const vol = (l: number | undefined, u: Units) => (l == null ? undefined : imp(u) ? l * 0.264172 : l);
const vU = (u: Units) => (imp(u) ? "gal" : "L");
const laps = (v: number | undefined) => (v != null && v > 0 && v < 32767 ? v : undefined);

const CORNERS = ["LF", "RF", "LR", "RR"] as const;
const CORNER_TR = ["Sol ön", "Sağ ön", "Sol arka", "Sağ arka"];
function corner(d: DashData, i: number) {
  const t = d.tires;
  return t?.available ? t.corners[i] : undefined;
}
export function tyreTemp(d: DashData, i: number): number | undefined {
  const c = corner(d, i);
  if (!c) return undefined;
  const v = c.temp.filter((x) => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}
function tyreWear(d: DashData, i: number): number | undefined {
  const c = corner(d, i);
  if (!c) return undefined;
  const v = c.wear.filter((x) => x >= 0);
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) * 100 : undefined;
}
/** kPa → psi (imperial) / bar (metric) */
function tyrePress(d: DashData, i: number, u: Units): number | undefined {
  const c = corner(d, i);
  if (!c || !(c.press > 0)) return undefined;
  return imp(u) ? c.press * 0.145038 : c.press / 100;
}

/** Yakınımdaki araç (göreli sıralamada bir üst / alt satır) */
function neighbour(d: DashData, dir: -1 | 1) {
  const rows = d.rel?.rows;
  if (!rows?.length) return undefined;
  const me = rows.findIndex((r) => r.isMe);
  return me < 0 ? undefined : rows[me + dir];
}

/** Devir ışıkları durumu (Direksiyon Ekranı ile aynı hesap) */
export function shiftState(t: Telemetry | undefined) {
  if (!t) return { frac: 0, shift: false, blink: false, max: 8000 };
  const red = t.redline > 0 ? t.redline : Math.max(t.slBlink, t.slLast, t.rpm, 7000);
  const first = t.slFirst > 0 ? t.slFirst : red * 0.75;
  const last = t.slLast > first ? t.slLast : t.slShift > first ? t.slShift : red * 0.95;
  const shiftAt = t.slShift > 0 ? t.slShift : last;
  const blinkAt = t.slBlink > 0 ? t.slBlink : red * 0.985;
  const frac = Math.max(0, Math.min(1, (t.rpm - first) / Math.max(1, last - first)));
  return { frac, shift: t.rpm >= shiftAt, blink: t.rpm >= blinkAt, max: red };
}

/** Güncel turun sektörü; henüz geçilmediyse son turun aynı sektörü */
function sectorOf(d: DashData, i: number): number | undefined {
  const cur = d.laps?.current ?? [];
  if (cur[i] > 0) return cur[i];
  const l = d.laps?.laps;
  const lastRec = l?.length ? l[l.length - 1] : undefined;
  return gt0(lastRec?.sectors?.[i]);
}

const DRS = ["OFF", "NEAR", "READY", "OPEN"];
const FLAG_TEXT: Record<string, string> = {
  checkered: "FINISH",
  white: "WHITE",
  green: "GREEN",
  yellow: "YELLOW",
  red: "RED",
  blue: "BLUE",
  debris: "DEBRIS",
  greenHeld: "GREEN",
  oneLapToGreen: "1 TO GREEN",
  caution: "CAUTION",
  cautionWaving: "CAUTION",
  black: "BLACK",
  disqualify: "DSQ",
  repair: "REPAIR",
};
const FLAG_COLOR: Record<string, string> = {
  checkered: "#e8e8e8",
  white: "#ffffff",
  green: "#22c55e",
  yellow: "#facc15",
  red: "#ef4444",
  blue: "#3b82f6",
  debris: "#f59e0b",
  greenHeld: "#22c55e",
  oneLapToGreen: "#84cc16",
  caution: "#facc15",
  cautionWaving: "#facc15",
  black: "#111111",
  disqualify: "#111111",
  repair: "#f97316",
};
const FLAG_ORDER = ["red", "black", "disqualify", "repair", "checkered", "caution", "cautionWaving", "yellow", "debris", "blue", "white", "oneLapToGreen", "green", "greenHeld"];
export function flagOf(d: DashData): { name: string; text: string; color: string } | undefined {
  const f = d.ses?.flags;
  if (!f?.length) return undefined;
  const name = FLAG_ORDER.find((x) => f.includes(x as never));
  return name ? { name, text: FLAG_TEXT[name], color: FLAG_COLOR[name] } : undefined;
}

const tyreFields = (): DashField[] =>
  CORNERS.flatMap((c, i): DashField[] => [
    { id: `tyreTemp${c}`, label: `Lastik sıcaklığı: ${CORNER_TR[i]}`, group: "Lastikler", fmt: "num", dec: 0, unit: tU, min: 40, max: 120, get: (d, u) => tempC(tyreTemp(d, i), u) },
    { id: `tyrePress${c}`, label: `Lastik basıncı: ${CORNER_TR[i]}`, group: "Lastikler", fmt: "num", dec: 2, unit: (u) => (imp(u) ? "psi" : "bar"), min: 1, max: 2.5, get: (d, u) => tyrePress(d, i, u) },
    { id: `tyreWear${c}`, label: `Lastik ömrü: ${CORNER_TR[i]}`, group: "Lastikler", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => tyreWear(d, i) },
  ]);

/** Veri alanları kataloğu */
export const FIELDS: DashField[] = [
  // Sürüş
  { id: "speed", label: "Hız", group: "Sürüş", fmt: "num", dec: 0, unit: (u) => (imp(u) ? "mph" : "km/h"), min: 0, max: 320, get: (d, u) => (d.tel ? d.tel.speed * (imp(u) ? 2.23694 : 3.6) : undefined) },
  { id: "gear", label: "Vites", group: "Sürüş", fmt: "text", get: (d) => (d.tel ? fmtGear(d.tel.gear) : undefined) },
  { id: "rpm", label: "Devir (RPM)", group: "Sürüş", fmt: "num", dec: 0, min: 0, max: 9000, get: (d) => fin(d.tel?.rpm) },
  { id: "rpmPct", label: "Devir (kırmızı çizgiye göre %)", group: "Sürüş", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (d.tel ? Math.min(100, (d.tel.rpm / shiftState(d.tel).max) * 100) : undefined) },
  { id: "throttle", label: "Gaz", group: "Sürüş", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (d.inputs ? d.inputs.throttle * 100 : undefined) },
  { id: "brake", label: "Fren", group: "Sürüş", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (d.inputs ? d.inputs.brake * 100 : undefined) },
  { id: "clutch", label: "Debriyaj", group: "Sürüş", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (d.inputs ? d.inputs.clutch * 100 : undefined) },
  { id: "steer", label: "Direksiyon açısı", group: "Sürüş", fmt: "num", dec: 0, unit: () => "°", min: -180, max: 180, get: (d) => (d.inputs ? (-d.inputs.steer * 180) / Math.PI : undefined) },
  // Yarış
  { id: "position", label: "Pozisyon (genel)", group: "Yarış", fmt: "num", dec: 0, get: (d) => gt0(d.tel?.position) ?? gt0(d.ses?.position) },
  { id: "classPosition", label: "Pozisyon (sınıf)", group: "Yarış", fmt: "num", dec: 0, get: (d) => gt0(d.tel?.classPosition) ?? gt0(d.ses?.classPosition) ?? gt0(d.tel?.position) },
  { id: "carCount", label: "Araç sayısı", group: "Yarış", fmt: "num", dec: 0, get: (d) => gt0(d.ses?.carCount) },
  { id: "posChange", label: "Kazanılan / kaybedilen sıra", group: "Yarış", fmt: "delta", dec: 0, get: (d) => fin(d.tel?.posChange) },
  { id: "lap", label: "Tur", group: "Yarış", fmt: "num", dec: 0, get: (d) => gt0(d.ses?.lap) ?? gt0(d.tel?.lap) },
  { id: "totalLaps", label: "Toplam tur", group: "Yarış", fmt: "num", dec: 0, get: (d) => laps(d.ses?.totalLaps) },
  { id: "lapsRemain", label: "Kalan tur", group: "Yarış", fmt: "num", dec: 0, get: (d) => laps(d.ses?.lapsRemain) },
  { id: "timeRemain", label: "Kalan süre", group: "Yarış", fmt: "clock", get: (d) => gt0(d.ses?.timeRemain) },
  { id: "sessionType", label: "Oturum türü", group: "Yarış", fmt: "text", get: (d) => d.ses?.sessionType || d.status?.sessionType || undefined },
  { id: "incidents", label: "Olay puanı", group: "Yarış", fmt: "num", dec: 0, unit: () => "x", get: (d) => pos(d.ses?.incidents) },
  { id: "incidentLimit", label: "Olay sınırı", group: "Yarış", fmt: "num", dec: 0, get: (d) => gt0(d.ses?.incidentLimit) },
  { id: "flag", label: "Bayrak", group: "Yarış", fmt: "text", get: (d) => flagOf(d)?.text },
  { id: "gapAhead", label: "Öndeki araca fark", group: "Yarış", fmt: "num", dec: 1, unit: () => "s", min: 0, max: 5, get: (d) => { const r = neighbour(d, -1); return r ? Math.abs(r.gap) : undefined; } },
  { id: "gapBehind", label: "Arkadaki araca fark", group: "Yarış", fmt: "num", dec: 1, unit: () => "s", min: 0, max: 5, get: (d) => { const r = neighbour(d, 1); return r ? Math.abs(r.gap) : undefined; } },
  { id: "nameAhead", label: "Öndeki sürücü", group: "Yarış", fmt: "text", get: (d) => neighbour(d, -1)?.name },
  { id: "nameBehind", label: "Arkadaki sürücü", group: "Yarış", fmt: "text", get: (d) => neighbour(d, 1)?.name },
  { id: "sof", label: "Güç ortalaması (SoF)", group: "Yarış", fmt: "num", dec: 0, get: (d) => gt0(d.rel?.sof) },
  // Tur zamanları
  { id: "lastLap", label: "Son tur", group: "Tur zamanları", fmt: "lap", get: (d) => gt0(d.delta?.last) ?? gt0(d.tel?.last) },
  { id: "bestLap", label: "En iyi tur", group: "Tur zamanları", fmt: "lap", get: (d) => gt0(d.delta?.best) ?? gt0(d.tel?.best) },
  { id: "currentLap", label: "Güncel tur süresi", group: "Tur zamanları", fmt: "lap", dec: 1, get: (d) => gt0(d.delta?.current) },
  { id: "predictedLap", label: "Tahmini tur", group: "Tur zamanları", fmt: "lap", get: (d) => (d.delta && d.delta.valid && d.delta.best > 0 ? d.delta.best + d.delta.delta : undefined) },
  { id: "optimalLap", label: "Optimal tur (en iyi sektörler)", group: "Tur zamanları", fmt: "lap", get: (d) => gt0(d.laps?.optimal) },
  { id: "delta", label: "Delta (kendi en iyi turuma)", group: "Tur zamanları", fmt: "delta", dec: 2, min: -1, max: 1, get: (d) => (d.delta?.valid ? d.delta.delta : undefined) },
  { id: "deltaSession", label: "Delta (oturumun en iyisine)", group: "Tur zamanları", fmt: "delta", dec: 2, min: -1, max: 1, get: (d) => (d.delta?.sessionValid ? d.delta.sessionDelta : undefined) },
  { id: "deltaOptimal", label: "Delta (optimal tura)", group: "Tur zamanları", fmt: "delta", dec: 2, min: -1, max: 1, get: (d) => (d.delta?.optimalValid ? d.delta.optimalDelta : undefined) },
  { id: "sector1", label: "Sektör 1", group: "Tur zamanları", fmt: "lap", dec: 3, get: (d) => sectorOf(d, 0) },
  { id: "sector2", label: "Sektör 2", group: "Tur zamanları", fmt: "lap", dec: 3, get: (d) => sectorOf(d, 1) },
  { id: "sector3", label: "Sektör 3", group: "Tur zamanları", fmt: "lap", dec: 3, get: (d) => sectorOf(d, 2) },
  { id: "lapPct", label: "Tur ilerlemesi", group: "Tur zamanları", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (pos(d.laps?.lapPct) != null ? d.laps!.lapPct! * 100 : undefined) },
  // Yakıt
  { id: "fuelLevel", label: "Yakıt", group: "Yakıt", fmt: "num", dec: 1, unit: vU, min: 0, max: 110, get: (d, u) => vol(pos(d.fuel?.level) ?? pos(d.tel?.fuelLevel), u) },
  { id: "fuelPct", label: "Yakıt (%)", group: "Yakıt", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => { const p = pos(d.fuel?.pct) ?? pos(d.tel?.fuelPct); return p != null ? p * 100 : undefined; } },
  { id: "fuelPerLap", label: "Tur başına yakıt (5 tur ort.)", group: "Yakıt", fmt: "num", dec: 2, unit: vU, get: (d, u) => vol(gt0(d.fuel?.avg5?.usage), u) },
  { id: "fuelLastLap", label: "Son turda harcanan yakıt", group: "Yakıt", fmt: "num", dec: 2, unit: vU, get: (d, u) => vol(gt0(d.fuel?.last?.usage), u) },
  { id: "fuelLaps", label: "Yakıt yeter (tur)", group: "Yakıt", fmt: "num", dec: 1, min: 0, max: 30, get: (d) => gt0(d.fuel?.avg5?.laps) },
  { id: "fuelToFinish", label: "Bitişe gereken yakıt", group: "Yakıt", fmt: "num", dec: 1, unit: vU, get: (d, u) => vol(gt0(d.fuel?.raceNeeded), u) },
  { id: "fuelRefuel", label: "Eklenecek yakıt", group: "Yakıt", fmt: "num", dec: 1, unit: vU, get: (d, u) => vol(pos(d.fuel?.avg5?.refuel), u) },
  { id: "fuelTime", label: "Yakıt yeter (süre)", group: "Yakıt", fmt: "clock", get: (d) => gt0(d.fuel?.timeToEmpty) },
  { id: "stintTime", label: "Stint süresi", group: "Yakıt", fmt: "clock", get: (d) => pos(d.fuel?.stintTime) },
  // Lastikler
  ...tyreFields(),
  { id: "compound", label: "Lastik türü", group: "Lastikler", fmt: "text", get: (d) => (!d.tires || d.tires.compound < 0 ? undefined : d.tires.compound === 0 ? "DRY" : "WET") },
  // Araç
  { id: "brakeBias", label: "Fren dengesi", group: "Araç", fmt: "num", dec: 1, unit: () => "%", min: 40, max: 70, get: (d) => gt0(d.tel?.brakeBias) ?? gt0(d.ses?.brakeBias) },
  { id: "tc", label: "TC seviyesi", group: "Araç", fmt: "num", dec: 0, get: (d) => pos(d.tel?.tc) ?? pos(d.ses?.tc) },
  { id: "abs", label: "ABS seviyesi", group: "Araç", fmt: "num", dec: 0, get: (d) => pos(d.tel?.abs) ?? pos(d.ses?.abs) },
  { id: "absActive", label: "ABS devrede (0 / 1)", group: "Araç", fmt: "num", dec: 0, min: 0, max: 1, get: (d) => (d.tel ? (d.tel.absActive ? 1 : 0) : undefined) },
  { id: "tcActive", label: "TC devrede (0 / 1)", group: "Araç", fmt: "num", dec: 0, min: 0, max: 1, get: (d) => (d.tel ? (d.tel.tcActive ? 1 : 0) : undefined) },
  { id: "waterTemp", label: "Su sıcaklığı", group: "Araç", fmt: "num", dec: 0, unit: tU, min: 40, max: 130, get: (d, u) => tempC(d.tel?.waterTemp, u) },
  { id: "oilTemp", label: "Yağ sıcaklığı", group: "Araç", fmt: "num", dec: 0, unit: tU, min: 40, max: 150, get: (d, u) => tempC(d.tel?.oilTemp, u) },
  { id: "pit", label: "Pit yolunda (0 / 1)", group: "Araç", fmt: "num", dec: 0, min: 0, max: 1, get: (d) => (d.tel ? (d.tel.onPitRoad ? 1 : 0) : undefined) },
  { id: "carName", label: "Araç adı", group: "Araç", fmt: "text", get: (d) => d.status?.carName || undefined },
  // Hibrit
  { id: "battery", label: "Batarya", group: "Hibrit", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (d.ers?.hasHybrid && d.ers.batteryPct >= 0 ? d.ers.batteryPct * 100 : undefined) },
  { id: "mguk", label: "MGU-K gücü", group: "Hibrit", fmt: "num", dec: 0, unit: () => "kW", min: -200, max: 200, get: (d) => (d.ers?.hasHybrid ? fin(d.ers.mgukKw) : undefined) },
  { id: "deployMode", label: "Harcama modu", group: "Hibrit", fmt: "num", dec: 0, get: (d) => (d.ers?.hasHybrid ? pos(d.ers.mode) : undefined) },
  { id: "deployLeft", label: "Bu turda kalan harcama", group: "Hibrit", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (d.ers?.hasHybrid && d.ers.lapDeployLeft >= 0 ? d.ers.lapDeployLeft * 100 : undefined) },
  { id: "drs", label: "DRS durumu", group: "Hibrit", fmt: "text", get: (d) => (d.ers && d.ers.drs >= 0 ? DRS[d.ers.drs] : undefined) },
  { id: "drsNum", label: "DRS (0 kapalı … 3 açık)", group: "Hibrit", fmt: "num", dec: 0, min: 0, max: 3, get: (d) => pos(d.ers?.drs) },
  { id: "p2pActive", label: "Push-to-pass devrede (0 / 1)", group: "Hibrit", fmt: "num", dec: 0, min: 0, max: 1, get: (d) => (d.ers && d.ers.p2pCount >= 0 ? (d.ers.p2pActive ? 1 : 0) : undefined) },
  { id: "p2p", label: "Push-to-pass hakkı", group: "Hibrit", fmt: "num", dec: 0, get: (d) => pos(d.ers?.p2pCount) },
  // Hava
  { id: "airTemp", label: "Hava sıcaklığı", group: "Hava", fmt: "num", dec: 0, unit: tU, min: 0, max: 45, get: (d, u) => tempC(d.ses?.airTemp ?? d.wx?.airTemp ?? d.tel?.airTemp, u) },
  { id: "trackTemp", label: "Pist sıcaklığı", group: "Hava", fmt: "num", dec: 0, unit: tU, min: 0, max: 60, get: (d, u) => tempC(d.ses?.trackTemp ?? d.wx?.trackTemp ?? d.tel?.trackTemp, u) },
  { id: "humidity", label: "Nem", group: "Hava", fmt: "num", dec: 0, unit: () => "%", min: 0, max: 100, get: (d) => (pos(d.wx?.humidity) != null ? d.wx!.humidity! * (d.wx!.humidity! <= 1 ? 100 : 1) : undefined) },
  { id: "wind", label: "Rüzgâr", group: "Hava", fmt: "num", dec: 0, unit: (u) => (imp(u) ? "mph" : "km/h"), get: (d, u) => (pos(d.wx?.windVel) != null ? d.wx!.windVel! * (imp(u) ? 2.23694 : 3.6) : undefined) },
  { id: "wetness", label: "Pist ıslaklığı (0–7)", group: "Hava", fmt: "num", dec: 0, min: 0, max: 7, get: (d) => pos(d.ses?.wetness ?? d.wx?.wetness) },
  // Genel
  { id: "clock", label: "Saat", group: "Genel", fmt: "text", get: () => { const n = new Date(); return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`; } },
  { id: "track", label: "Pist adı", group: "Genel", fmt: "text", get: (d) => d.ses?.track || d.status?.track || undefined },
];

const FIELD_MAP = new Map(FIELDS.map((f) => [f.id, f]));
export const fieldOf = (id: string | undefined) => (id ? FIELD_MAP.get(id) : undefined);

/** Alanın sayısal değeri (çubuk, kadran, kurallar için); yazı alanlarında undefined */
export function fieldNum(id: string | undefined, d: DashData, u: Units): number | undefined {
  const v = fieldOf(id)?.get(d, u);
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

/** Alanın ekranda görünen yazısı */
export function fieldText(id: string | undefined, d: DashData, u: Units, decimals = -1): string {
  const f = fieldOf(id);
  if (!f) return "—";
  const v = f.get(d, u);
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  const dec = decimals >= 0 ? decimals : (f.dec ?? 0);
  switch (f.fmt) {
    case "lap":
      return lapTime(v, decimals >= 0 ? Math.min(3, decimals) : (f.dec ?? 3));
    case "clock":
      return clock(v);
    case "delta":
      return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dec);
    default:
      return v.toFixed(dec);
  }
}

export const fieldUnit = (id: string | undefined, u: Units) => fieldOf(id)?.unit?.(u) ?? "";

/** Koşullu renk: son eşleşen kural geçerli */
export function ruleFor(p: Pick<WidgetProps, "rules">, v: number | undefined): ColorRule | undefined {
  if (v == null || !p.rules?.length) return undefined;
  let hit: ColorRule | undefined;
  for (const r of p.rules) {
    if ((r.op === ">" && v > r.v) || (r.op === "<" && v < r.v) || (r.op === "=" && Math.abs(v - r.v) < 1e-6)) hit = r;
  }
  return hit;
}

// ---------------------------------------------------------------------------
// Bileşen türleri ve palet
// ---------------------------------------------------------------------------

export const TYPE_LABELS: Record<WidgetType, string> = {
  value: "Değer",
  gear: "Vites",
  rpmBar: "Devir çubuğu",
  rpmLeds: "Vites ışıkları",
  bar: "Çubuk",
  radial: "Kadran (yay)",
  tyres: "Lastikler",
  deltaBar: "Delta çubuğu",
  flag: "Bayrak kutusu",
  label: "Yazı",
  rect: "Dikdörtgen / çizgi",
  image: "Resim",
};
export const typeLabel = (t: WidgetType) => TYPE_LABELS[t] ?? t;

const DELTA_RULES: ColorRule[] = [
  { op: "<", v: 0, color: "#34e05c" },
  { op: ">", v: 0, color: "#ff4a4a" },
];
const val = (field: string, label: string, fontSize: number, more: WidgetProps = {}): WidgetProps => ({ field, label, labelPos: "bottom", fontSize, labelSize: 14, align: "center", ...more });

export interface PaletteItem {
  label: string;
  group: string;
  type: WidgetType;
  w: number;
  h: number;
  props: WidgetProps;
}

/** Tasarımcının paleti: hazır ayarlı bileşenler (hepsi sonradan özelliklerden değiştirilebilir) */
export const PALETTE: PaletteItem[] = [
  { group: "Sürüş", label: "Vites", type: "gear", w: 140, h: 180, props: { fontSize: 170, rpmColor: true, align: "center" } },
  { group: "Sürüş", label: "Hız", type: "value", w: 160, h: 80, props: val("speed", "SPEED", 48) },
  { group: "Sürüş", label: "Devir sayısı", type: "value", w: 150, h: 64, props: val("rpm", "RPM", 34) },
  { group: "Sürüş", label: "Devir çubuğu (yatay)", type: "rpmBar", w: 520, h: 28, props: { z1: 60, z2: 85, flash: true } },
  { group: "Sürüş", label: "Devir çubuğu (dikey)", type: "rpmBar", w: 30, h: 260, props: { z1: 60, z2: 85, flash: true, vertical: true } },
  { group: "Sürüş", label: "Devir kadranı (yay)", type: "radial", w: 200, h: 200, props: { field: "rpm", label: "RPM", fontSize: 40, labelSize: 14, color: "#ff8a2a", rules: [{ op: ">", v: 8000, color: "#ff3030" }] } },
  { group: "Sürüş", label: "Vites ışıkları (LED)", type: "rpmLeds", w: 420, h: 26, props: { count: 12, flash: true } },
  { group: "Sürüş", label: "Gaz çubuğu", type: "bar", w: 26, h: 160, props: { field: "throttle", color: "#34e05c", vertical: true } },
  { group: "Sürüş", label: "Fren çubuğu", type: "bar", w: 26, h: 160, props: { field: "brake", color: "#ff3030", vertical: true } },
  { group: "Tur", label: "Delta (sayı)", type: "value", w: 180, h: 80, props: val("delta", "DELTA", 48, { rules: DELTA_RULES }) },
  { group: "Tur", label: "Delta çubuğu", type: "deltaBar", w: 360, h: 26, props: { field: "delta", max: 1 } },
  { group: "Tur", label: "Güncel tur", type: "value", w: 220, h: 70, props: val("currentLap", "CURRENT", 40) },
  { group: "Tur", label: "Son tur", type: "value", w: 220, h: 70, props: val("lastLap", "LAST", 40) },
  { group: "Tur", label: "En iyi tur", type: "value", w: 220, h: 70, props: val("bestLap", "BEST", 40, { color: "#c084fc" }) },
  { group: "Tur", label: "Tahmini tur", type: "value", w: 220, h: 70, props: val("predictedLap", "PREDICTED", 40) },
  { group: "Tur", label: "Sektör 1", type: "value", w: 130, h: 60, props: val("sector1", "S1", 30) },
  { group: "Tur", label: "Sektör 2", type: "value", w: 130, h: 60, props: val("sector2", "S2", 30) },
  { group: "Tur", label: "Sektör 3", type: "value", w: 130, h: 60, props: val("sector3", "S3", 30) },
  { group: "Yarış", label: "Pozisyon", type: "value", w: 120, h: 80, props: val("classPosition", "POS", 54) },
  { group: "Yarış", label: "Tur sayacı", type: "value", w: 120, h: 80, props: val("lap", "LAP", 54) },
  { group: "Yarış", label: "Kalan tur", type: "value", w: 140, h: 80, props: val("lapsRemain", "LAPS LEFT", 48) },
  { group: "Yarış", label: "Oturum süresi (kalan)", type: "value", w: 200, h: 70, props: val("timeRemain", "TIME LEFT", 40) },
  { group: "Yarış", label: "Bayrak göstergesi", type: "flag", w: 160, h: 50, props: { fontSize: 22, radius: 6 } },
  { group: "Yarış", label: "Öndeki araca fark", type: "value", w: 150, h: 70, props: val("gapAhead", "AHEAD", 40, { decimals: 1 }) },
  { group: "Yarış", label: "Arkadaki araca fark", type: "value", w: 150, h: 70, props: val("gapBehind", "BEHIND", 40, { decimals: 1 }) },
  { group: "Yakıt", label: "Yakıt (miktar)", type: "value", w: 150, h: 76, props: val("fuelLevel", "FUEL", 44, { rules: [{ op: "<", v: 5, color: "#ff4a4a", blink: true }] }) },
  { group: "Yakıt", label: "Yakıt yeter (tur)", type: "value", w: 150, h: 76, props: val("fuelLaps", "FUEL LAPS", 44, { rules: [{ op: "<", v: 2, color: "#ff4a4a", blink: true }] }) },
  { group: "Yakıt", label: "Tur başına yakıt", type: "value", w: 150, h: 76, props: val("fuelPerLap", "PER LAP", 40) },
  { group: "Yakıt", label: "Yakıt çubuğu", type: "bar", w: 220, h: 22, props: { field: "fuelPct", color: "#34e05c", rules: [{ op: "<", v: 15, color: "#ff4a4a" }] } },
  { group: "Araç", label: "Lastikler: sıcaklık", type: "tyres", w: 170, h: 130, props: { tyreMode: "temp", fontSize: 26 } },
  { group: "Araç", label: "Lastikler: basınç", type: "tyres", w: 170, h: 130, props: { tyreMode: "press", fontSize: 24 } },
  { group: "Araç", label: "Lastikler: ömür", type: "tyres", w: 170, h: 130, props: { tyreMode: "wear", fontSize: 26 } },
  { group: "Araç", label: "Fren dengesi", type: "value", w: 150, h: 76, props: val("brakeBias", "BRAKE BIAS", 42) },
  { group: "Araç", label: "TC", type: "value", w: 110, h: 76, props: val("tc", "TC", 46, { ruleField: "tcActive", rules: [{ op: "=", v: 1, color: "#ffd21f" }] }) },
  { group: "Araç", label: "ABS", type: "value", w: 110, h: 76, props: val("abs", "ABS", 46, { ruleField: "absActive", rules: [{ op: "=", v: 1, color: "#ffd21f" }] }) },
  { group: "Araç", label: "Su sıcaklığı", type: "value", w: 130, h: 70, props: val("waterTemp", "WATER", 38, { rules: [{ op: ">", v: 105, color: "#ff4a4a", blink: true }] }) },
  { group: "Araç", label: "Yağ sıcaklığı", type: "value", w: 130, h: 70, props: val("oilTemp", "OIL", 38, { rules: [{ op: ">", v: 130, color: "#ff4a4a", blink: true }] }) },
  { group: "Hibrit", label: "ERS batarya çubuğu", type: "bar", w: 260, h: 24, props: { field: "battery", color: "#39d0ff", label: "ERS", labelPos: "left", labelSize: 14 } },
  { group: "Hibrit", label: "Batarya (%)", type: "value", w: 130, h: 70, props: val("battery", "SOC", 40, { showUnit: true }) },
  { group: "Hibrit", label: "DRS", type: "value", w: 130, h: 60, props: { field: "drs", ruleField: "drsNum", label: "DRS", labelPos: "top", fontSize: 28, labelSize: 13, align: "center", rules: [{ op: ">", v: 0, color: "#ffd21f" }, { op: "=", v: 3, color: "#34e05c" }] } },
  { group: "Hibrit", label: "Push-to-pass", type: "value", w: 130, h: 70, props: val("p2p", "P2P", 40, { ruleField: "p2pActive", rules: [{ op: "=", v: 1, color: "#34e05c", blink: true }] }) },
  { group: "Genel", label: "Saat", type: "value", w: 130, h: 50, props: { field: "clock", fontSize: 32, align: "center" } },
  { group: "Genel", label: "Yazı etiketi", type: "label", w: 160, h: 32, props: { text: "YAZI", fontSize: 22, align: "center" } },
  { group: "Genel", label: "Dikdörtgen", type: "rect", w: 200, h: 100, props: { bg: "#000000", bgA: 0, border: "#e8101a", borderW: 2, radius: 6 } },
  { group: "Genel", label: "Çizgi", type: "rect", w: 240, h: 3, props: { bg: "#e8101a", bgA: 100 } },
  { group: "Genel", label: "Resim", type: "image", w: 160, h: 90, props: { fit: "contain" } },
  { group: "Genel", label: "Veri alanı (seç)", type: "value", w: 160, h: 80, props: val("speed", "", 44) },
];

let seq = 0;
export const newId = (p = "w") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function newWidget(item: PaletteItem, x = 20, y = 20): DashWidget {
  return { id: newId(), type: item.type, x, y, w: item.w, h: item.h, props: structuredClone(item.props) };
}

export const newPage = (name: string, widgets: DashWidget[] = []): DashPage => ({ id: newId("p"), name, widgets });

export function newDash(name: string, width = 800, height = 480): CustomDash {
  return { id: newId("d"), name, width, height, bg: "#050506", bgA: 100, font: "digital", radius: 10, pages: [newPage("1")] };
}

/** Kopya: bütün kimlikler yenilenir */
export function cloneDash(d: CustomDash, name: string): CustomDash {
  const c = structuredClone(d);
  c.id = newId("d");
  c.name = name;
  delete c.sharedId;
  for (const p of c.pages) {
    p.id = newId("p");
    for (const w of p.widgets) w.id = newId();
  }
  return c;
}

// ---------------------------------------------------------------------------
// Şablonlar
// ---------------------------------------------------------------------------

type W = [WidgetType, number, number, number, number, WidgetProps];
const page = (name: string, list: W[]): DashPage => newPage(name, list.map(([type, x, y, w, h, props]) => ({ id: newId(), type, x, y, w, h, props })));
function build(name: string, width: number, height: number, pages: DashPage[], extra: Partial<CustomDash> = {}): CustomDash {
  return { ...newDash(name, width, height), ...extra, pages };
}
const box = (accent: string): WidgetProps => ({ bg: "#000000", bgA: 40, border: accent, borderW: 2, radius: 8 });
const RED = "#e8101a";

/** Ortak ikinci sayfa (800×480): lastikler, yakıt, sıcaklıklar */
const carPage = (): DashPage =>
  page("Araç", [
    ["rpmLeds", 20, 16, 760, 24, { count: 15, flash: true }],
    ["label", 20, 54, 240, 26, { text: "TYRES", fontSize: 18, align: "left", color: "#a3a3a3" }],
    ["tyres", 20, 84, 240, 170, { tyreMode: "temp", fontSize: 34 }],
    ["tyres", 20, 270, 240, 150, { tyreMode: "press", fontSize: 26 }],
    ["gear", 290, 60, 150, 200, { fontSize: 190, rpmColor: true, align: "center" }],
    ["value", 290, 270, 150, 80, val("speed", "SPEED", 52)],
    ["rect", 470, 54, 310, 150, box(RED)],
    ["value", 478, 64, 145, 76, val("fuelLevel", "FUEL", 46)],
    ["value", 628, 64, 145, 76, val("fuelLaps", "FUEL LAPS", 46, { rules: [{ op: "<", v: 2, color: "#ff4a4a", blink: true }] })],
    ["bar", 486, 160, 278, 22, { field: "fuelPct", color: "#34e05c", rules: [{ op: "<", v: 15, color: "#ff4a4a" }] }],
    ["value", 470, 220, 150, 76, val("waterTemp", "WATER", 44, { rules: [{ op: ">", v: 105, color: "#ff4a4a", blink: true }] })],
    ["value", 630, 220, 150, 76, val("oilTemp", "OIL", 44, { rules: [{ op: ">", v: 130, color: "#ff4a4a", blink: true }] })],
    ["value", 470, 310, 150, 76, val("trackTemp", "TRACK", 44)],
    ["value", 630, 310, 150, 76, val("airTemp", "AIR", 44)],
    ["value", 20, 420, 240, 48, { field: "stintTime", label: "STINT", labelPos: "left", fontSize: 30, labelSize: 14, align: "left" }],
    ["value", 290, 370, 150, 90, val("lapsRemain", "LAPS LEFT", 50)],
    ["value", 470, 400, 150, 64, val("lastLap", "LAST", 34)],
    ["value", 630, 400, 150, 64, val("clock", "", 34)],
  ]);

export const TEMPLATES: { id: string; label: string; make: () => CustomDash }[] = [
  {
    id: "gt",
    label: "GT (2 sayfa)",
    make: () =>
      build("GT", 800, 480, [
        page("Yarış", [
          ["rpmLeds", 20, 16, 760, 30, { count: 15, flash: true }],
          ["rect", 20, 62, 760, 250, box(RED)],
          ["value", 40, 78, 110, 80, val("classPosition", "POS", 54)],
          ["value", 150, 78, 170, 80, val("speed", "SPEED", 60)],
          ["value", 40, 190, 280, 100, val("lastLap", "LAST", 56)],
          ["gear", 325, 70, 150, 235, { fontSize: 230, rpmColor: true, align: "center" }],
          ["value", 480, 78, 170, 80, val("delta", "DELTA", 60, { rules: DELTA_RULES })],
          ["value", 650, 78, 110, 80, val("lap", "LAP", 54)],
          ["value", 480, 190, 280, 100, val("bestLap", "BEST", 56, { color: "#c084fc" })],
          ["deltaBar", 20, 322, 760, 16, { field: "delta", max: 1 }],
          ["rect", 20, 350, 180, 112, box(RED)],
          ["value", 20, 358, 180, 100, val("tc", "TC", 64, { ruleField: "tcActive", rules: [{ op: "=", v: 1, color: "#ffd21f" }] })],
          ["rect", 213, 350, 180, 112, box(RED)],
          ["value", 213, 358, 180, 100, val("abs", "ABS", 64, { ruleField: "absActive", rules: [{ op: "=", v: 1, color: "#ffd21f" }] })],
          ["rect", 407, 350, 180, 112, box(RED)],
          ["value", 407, 358, 180, 100, val("brakeBias", "BRAKE BIAS", 58)],
          ["rect", 600, 350, 180, 112, box(RED)],
          ["value", 600, 358, 180, 100, val("fuelLaps", "FUEL LAPS", 58, { rules: [{ op: "<", v: 2, color: "#ff4a4a", blink: true }] })],
        ]),
        carPage(),
      ]),
  },
  {
    id: "formula",
    label: "Formula (2 sayfa)",
    make: () =>
      build(
        "Formula",
        800,
        480,
        [
          page("Yarış", [
            ["rpmBar", 20, 16, 760, 34, { z1: 55, z2: 82, flash: true }],
            ["gear", 310, 60, 180, 250, { fontSize: 250, rpmColor: false, color: "#ffffff", align: "center" }],
            ["value", 20, 66, 280, 96, val("speed", "KM/H", 84, { align: "left" })],
            ["value", 20, 180, 280, 70, val("lastLap", "LAST LAP", 46, { align: "left" })],
            ["value", 20, 262, 280, 70, val("bestLap", "BEST LAP", 46, { align: "left", color: "#c084fc" })],
            ["value", 500, 66, 280, 96, val("delta", "DELTA", 84, { align: "right", rules: DELTA_RULES })],
            ["value", 500, 180, 135, 70, val("classPosition", "POS", 50)],
            ["value", 645, 180, 135, 70, val("lap", "LAP", 50)],
            ["value", 500, 262, 135, 70, { field: "drs", ruleField: "drsNum", label: "DRS", labelPos: "bottom", fontSize: 34, labelSize: 14, align: "center", rules: [{ op: ">", v: 0, color: "#ffd21f" }, { op: "=", v: 3, color: "#34e05c" }] }],
            ["value", 645, 262, 135, 70, val("deployMode", "MODE", 50)],
            ["bar", 20, 346, 760, 26, { field: "battery", color: "#39d0ff", label: "ERS", labelPos: "left", labelSize: 15 }],
            ["tyres", 20, 384, 190, 84, { tyreMode: "temp", fontSize: 26 }],
            ["value", 225, 384, 130, 84, val("fuelLevel", "FUEL", 44)],
            ["value", 365, 384, 130, 84, val("fuelLaps", "FUEL LAPS", 44)],
            ["value", 505, 384, 130, 84, val("brakeBias", "BB", 44)],
            ["flag", 648, 392, 132, 68, { fontSize: 22, radius: 8 }],
          ]),
          carPage(),
        ],
        { bg: "#07080c" },
      ),
  },
  {
    id: "minimal",
    label: "Minimal şerit",
    make: () =>
      build(
        "Minimal",
        800,
        300,
        [
          page("1", [
            ["rpmLeds", 20, 16, 760, 22, { count: 20, flash: true }],
            ["value", 20, 70, 260, 190, val("speed", "KM/H", 130)],
            ["gear", 300, 44, 200, 250, { fontSize: 250, rpmColor: true, align: "center" }],
            ["value", 520, 70, 260, 190, val("delta", "DELTA", 110, { rules: DELTA_RULES })],
          ]),
        ],
        { bgA: 85 },
      ),
  },
  {
    id: "phone",
    label: "Telefon (yatay)",
    make: () =>
      build("Telefon", 844, 390, [
        page("Yarış", [
          ["rpmLeds", 16, 12, 812, 26, { count: 16, flash: true }],
          ["value", 16, 54, 250, 110, val("speed", "KM/H", 92, { align: "left" })],
          ["value", 16, 180, 250, 80, val("lastLap", "LAST", 52, { align: "left" })],
          ["value", 16, 276, 250, 80, val("bestLap", "BEST", 52, { align: "left", color: "#c084fc" })],
          ["gear", 322, 46, 200, 290, { fontSize: 290, rpmColor: true, align: "center" }],
          ["deltaBar", 286, 350, 272, 18, { field: "delta", max: 1 }],
          ["value", 578, 54, 250, 110, val("delta", "DELTA", 92, { align: "right", rules: DELTA_RULES })],
          ["value", 578, 180, 120, 80, val("classPosition", "POS", 56)],
          ["value", 708, 180, 120, 80, val("lap", "LAP", 56)],
          ["value", 578, 276, 120, 80, val("fuelLaps", "FUEL LAPS", 50, { rules: [{ op: "<", v: 2, color: "#ff4a4a", blink: true }] })],
          ["value", 708, 276, 120, 80, val("brakeBias", "BB", 50)],
        ]),
        page("Araç", [
          ["rpmLeds", 16, 12, 812, 26, { count: 16, flash: true }],
          ["tyres", 16, 56, 250, 170, { tyreMode: "temp", fontSize: 38 }],
          ["tyres", 16, 240, 250, 130, { tyreMode: "press", fontSize: 26 }],
          ["gear", 322, 46, 200, 250, { fontSize: 250, rpmColor: true, align: "center" }],
          ["value", 322, 300, 200, 76, val("speed", "KM/H", 54)],
          ["value", 578, 56, 120, 86, val("fuelLevel", "FUEL", 52)],
          ["value", 708, 56, 120, 86, val("fuelPerLap", "PER LAP", 46)],
          ["bar", 578, 156, 250, 22, { field: "fuelPct", color: "#34e05c", rules: [{ op: "<", v: 15, color: "#ff4a4a" }] }],
          ["value", 578, 196, 120, 80, val("waterTemp", "WATER", 48)],
          ["value", 708, 196, 120, 80, val("oilTemp", "OIL", 48)],
          ["value", 578, 292, 120, 80, val("tc", "TC", 52)],
          ["value", 708, 292, 120, 80, val("abs", "ABS", 52)],
        ]),
      ]),
  },
];

// ---------------------------------------------------------------------------
// Doğrulama (ayarlardan / içe aktarılan dosyadan gelen veri)
// ---------------------------------------------------------------------------

const num = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && isFinite(v) ? Math.max(min, Math.min(max, v)) : d);
const str = (v: unknown, d: string, max = 80) => (typeof v === "string" ? v.slice(0, max) : d);
const TYPES = new Set<string>(Object.keys(TYPE_LABELS));

function sanitizeWidgets(list: unknown): DashWidget[] {
  const widgets: DashWidget[] = [];
  if (!Array.isArray(list)) return widgets;
  for (const raw of list.slice(0, MAX_WIDGETS)) {
    if (!raw || typeof raw !== "object" || !TYPES.has(raw.type)) continue;
    const p: WidgetProps = raw.props && typeof raw.props === "object" ? { ...raw.props } : {};
    // Betik taşıyabilecek alan yok: yazılar kısaltılır, resim yalnızca data URL, kurallar süzülür
    if (p.text != null) p.text = str(p.text, "", 200);
    if (p.label != null) p.label = str(p.label, "", 60);
    if (p.src != null && !(typeof p.src === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(p.src) && p.src.length <= MAX_IMAGE)) delete p.src;
    if (p.rules != null) {
      p.rules = Array.isArray(p.rules)
        ? p.rules.slice(0, 6).filter((r) => r && typeof r.v === "number" && typeof r.color === "string" && [">", "<", "="].includes(r.op))
        : [];
    }
    widgets.push({
      id: str(raw.id, "", 40) || newId(),
      type: raw.type,
      x: Math.round(num(raw.x, 0, -2000, 6000)),
      y: Math.round(num(raw.y, 0, -2000, 6000)),
      w: Math.round(num(raw.w, 100, 2, 6000)),
      h: Math.round(num(raw.h, 40, 2, 6000)),
      props: p,
    });
  }
  return widgets;
}

export function sanitizeDash(input: unknown): CustomDash | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Partial<CustomDash> & { widgets?: unknown };
  const pages: DashPage[] = [];
  if (Array.isArray(s.pages)) {
    for (const p of s.pages.slice(0, MAX_PAGES)) {
      if (!p || typeof p !== "object") continue;
      pages.push({ id: str(p.id, "", 40) || newId("p"), name: str(p.name, "", 30) || String(pages.length + 1), widgets: sanitizeWidgets(p.widgets) });
    }
  } else if (Array.isArray(s.widgets)) pages.push(newPage("1", sanitizeWidgets(s.widgets)));
  if (!pages.length) return null;
  return {
    id: str(s.id, "", 40).replace(/[^A-Za-z0-9_-]/g, "") || newId("d"),
    name: str(s.name, "Dashboard", 60) || "Dashboard",
    width: Math.round(num(s.width, 800, 100, 4000)),
    height: Math.round(num(s.height, 480, 60, 4000)),
    bg: str(s.bg, "#050506", 20),
    bgA: num(s.bgA, 100, 0, 100),
    font: s.font === "mono" || s.font === "sans" ? s.font : "digital",
    radius: num(s.radius, 10, 0, 200),
    pages,
    ...(typeof s.sharedId === "string" && /^[0-9a-f-]{36}$/i.test(s.sharedId) ? { sharedId: s.sharedId } : {}),
  };
}

export function sanitizeDashes(input: unknown): CustomDash[] {
  if (!Array.isArray(input)) return [];
  const out: CustomDash[] = [];
  const seen = new Set<string>();
  for (const d of input.slice(0, MAX_DASHES)) {
    const s = sanitizeDash(d);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** "#rrggbb" + opaklık (0..1) -> rgba() */
export function rgba(hex: string | undefined, a: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return a >= 1 && hex ? hex : `rgba(0, 0, 0, ${a})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}

/** Kayıtlı tasarımların listesi (ayarlar değişince settings.ts günceller). Direksiyon Ekranı manifesti
 *  "Tasarım" seçeneklerini buradan okur; manifest ayar modülünü içe aktarmasın diye (döngü) burada durur. */
export const [dashList, setDashList] = createSignal<CustomDash[]>([]);
/** Ayarlardaki kimliğe göre tasarım; yoksa ilki */
/** Direksiyon Ekranı "Görünüm" değerinde kullanıcının tasarımı: "dash:<kimlik>" */
export const DASH_VIEW = "dash:";
export const dashView = (id: string) => DASH_VIEW + id;
/** Görünüm değeri bir kullanıcı tasarımıysa kimliği */
export const dashViewId = (view: unknown) => (typeof view === "string" && view.startsWith(DASH_VIEW) ? view.slice(DASH_VIEW.length) : undefined);
export const dashById = (list: CustomDash[], id: string | undefined) => list.find((d) => d.id === id) ?? list[0];
