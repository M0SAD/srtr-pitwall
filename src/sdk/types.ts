import type { CaptionView, LiveChatTopic, LiveGate, PollView } from "./livechat";
// Rust tarafındaki src-tauri/src/calc.rs paketleriyle birebir aynı tipler.

export interface Status {
  connected: boolean;
  demo: boolean;
  /** Panel önizlemesi için demo verisi (overlay'ler gizli) */
  preview: boolean;
  onTrack: boolean;
  inGarage: boolean;
  /** Garaj / setup ekranı açık mı (yalnızca bildiren simlerde: iRacing) */
  garageVisible?: boolean;
  /** Oyuncunun aracı pit yolunda / pit kutusunda */
  onPit?: boolean;
  replay: boolean;
  /** Gerçek bir tekrar izleniyor (iRacing'de canlı ana yetişmiş izleme hariç) */
  replayWatch?: boolean;
  /** Oyuncu pistte ve garajda değil: izleyici/spotter */
  spectating: boolean;
  /** Oyuncu bu oturumda kendi aracının sürücüsü (izleyici / spotter / tekrar / araçta takım arkadaşı değil) */
  driver?: boolean;
  /** "driver" | "teammate" | "spectator" | "replay" | "" */
  role?: string;
  sessionType: string;
  track: string;
  trackId: number;
  seriesId: number;
  category: string;
  carName: string;
  carPath: string;
  className: string;
  /** Oyuncunun takım adı (sim veriyorsa) */
  teamName?: string;
  /** Oyuncunun iRacing hesabı */
  userId: number;
  userName: string;
  /** Bağlı simülasyon: "iracing" | "acc" | "ac" | "lmu" | "rf2" | "ams2", yoksa "" */
  sim?: string;
  /** Canlı Sohbet overlay kapısı: overlay ne göstersin (uygulama karar verir; OBS sayfası da buradan öğrenir) */
  chat?: LiveGate;
}

export interface Inputs {
  throttle: number;
  brake: number;
  clutch: number;
  /** radyan, + sola */
  steer: number;
  gear: number;
  /** m/s */
  speed: number;
  rpm: number;
  shiftRpm: number;
  redline: number;
  abs: boolean;
  /** Çekiş kontrolü şu an kesiyor (ACC/AC; diğer simlerde hep false) */
  tc?: boolean;
  /** Yanal ivme (g): + sağa (sağ viraj) */
  latG?: number;
  /** Boyuna ivme (g): + hızlanma, - fren */
  longG?: number;
  /** Son / en iyi tur (sn; yoksa -1) */
  lastLap?: number;
  bestLap?: number;
}

/** ERS ve batarya (Rust: calc::Ers). Bilinmeyen sayılar -1, sim vermeyen güçler null. */
export interface Ers {
  hasHybrid: boolean;
  /** 0..1 */
  batteryPct: number;
  batteryMj: number;
  /** Bu turda kalan harcama hakkı 0..1 */
  lapDeployLeft: number;
  /** kW: + harcama, - geri kazanım */
  mgukKw: number | null;
  mguhKw: number | null;
  mode: number;
  /** 0 genel ("Mod N"), 1 demo adları */
  modeSet: number;
  regenGain: number;
  p2pCount: number;
  p2pActive: boolean;
  /** -1 yok, 0 kapalı, 1 yaklaşan bölgede, 2 açılabilir, 3 açık */
  drs: number;
  lap: number;
  lapPct: number;
  onPitRoad: boolean;
  onTrack: boolean;
}

export interface Telemetry {
  gear: number;
  speed: number;
  rpm: number;
  slFirst: number;
  slShift: number;
  slLast: number;
  slBlink: number;
  redline: number;
  position: number;
  classPosition: number;
  posChange: number;
  lap: number;
  last: number;
  best: number;
  fuelLevel: number;
  fuelPct: number;
  trackTemp: number;
  airTemp: number;
  abs: number;
  absActive: boolean;
  /** Çekiş kontrolü şu an kesiyor (ACC/AC; diğer simlerde hep false) */
  tcActive?: boolean;
  tc: number;
  brakeBias: number;
  /** °C; bilinmiyorsa -1 (sadece iRacing) */
  oilTemp?: number;
  waterTemp?: number;
  onPitRoad: boolean;
}

export interface Delta {
  delta: number;
  valid: boolean;
  trend: number;
  current: number;
  last: number;
  best: number;
  /** Oturumun en iyi turuna / optimal tura göre (sadece iRacing) */
  sessionDelta?: number;
  sessionValid?: boolean;
  optimalDelta?: number;
  optimalValid?: boolean;
}

export interface RadarCar {
  /** -1 sol, 1 sağ, 0 önde/arkada */
  side: number;
  /** boyuna mesafe (m), + önde */
  offset: number;
  /** Araç sırası (CarIdx; demoda negatif) */
  idx?: number;
  /** Yanal uzaklık (m, + sağ); yalnızca dünya koordinatı veren simlerde (ACC, LMU / rF2, AMS2) */
  lat?: number;
}

export interface Radar {
  /** 0 kapalı, 1 temiz, 2 solda, 3 sağda, 4 iki yanda, 5 solda iki, 6 sağda iki */
  state: number;
  aheadM: number | null;
  behindM: number | null;
  cars: RadarCar[];
}

export interface Row {
  idx: number;
  pos: number;
  classPos: number;
  classId: number;
  className: string;
  classColor: string;
  number: string;
  name: string;
  car: string;
  carName: string;
  userId: number;
  flair: string;
  irating: number;
  irDelta: number;
  license: string;
  licLetter: string;
  sr: number;
  licColor: string;
  gap: number;
  interval: number;
  lapsDown: number;
  lapRel: number;
  last: number;
  best: number;
  avg5: number;
  lastPb: boolean;
  onPit: boolean;
  pitState: "" | "PIT" | "OUT";
  stint: number;
  pits: number;
  tire: number;
  /** Lastik türü: "S" | "M" | "H" | "I" (ara) | "W" (yağmur) | "D" (kuru, türü bilinmiyor) | "" bilinmiyor */
  tireKind?: string;
  flag: "" | "BLK" | "DSQ" | "REP" | "BLU";
  posChange: number;
  isMe: boolean;
  /** Sunucudan çıkmış ama resmi sıralamada duran sürücü (yalnızca "standings") */
  gone?: boolean;
  classBest: boolean;
}

export interface Relative {
  rows: Row[];
  airTemp: number;
  trackTemp: number;
  wetness: number;
  humidity: number;
  precip: number;
  sof: number;
  incidents: number;
  incidentLimit: number;
  timeRemain: number;
  lapsRemain: number;
}

export interface ClassInfo {
  id: number;
  name: string;
  color: string;
  count: number;
  sof: number;
}

export interface Standings {
  rows: Row[];
  multiclass: boolean;
  race: boolean;
  sessionType: string;
  elapsed: number;
  totalTime: number;
  timeRemain: number;
  lapsRemain: number;
  totalLaps: number;
  leaderLap: number;
  carCount: number;
  classes: ClassInfo[];
}

export interface FuelRow {
  usage: number;
  laps: number;
  stint: number;
  refuel: number;
}

export interface Fuel {
  level: number;
  pct: number;
  max: number;
  lap: number;
  last: FuelRow;
  avg5: FuelRow;
  avg10: FuelRow;
  worst: FuelRow;
  raceLapsLeft: number;
  raceNeeded: number;
  stintTime: number;
  lapTime: number;
  timeToEmpty: number;
  targets: [number, number][];
  pitOpen: number;
  pitClose: number;
  pitOpenIn: number;
  pitCloseIn: number;
  samples: number;
}

export interface Weather {
  airTemp: number;
  trackTemp: number;
  windDir: number;
  windVel: number;
  heading: number;
  humidity: number;
  precip: number;
  wetness: number;
}

export type FlagName =
  | "checkered"
  | "white"
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "debris"
  | "yellowWaving"
  | "furled"
  | "greenHeld"
  | "oneLapToGreen"
  | "caution"
  | "cautionWaving"
  | "black"
  | "disqualify"
  | "repair";

export interface Session {
  sessionType: string;
  track: string;
  flags: FlagName[];
  /** Oyuncunun cezası: "" yok, driveThrough, stopGo, disqualify, timePenalty, penalty, black, repair, furled */
  penalty?: string;
  timeRemain: number;
  lapsRemain: number;
  totalLaps: number;
  lap: number;
  lapsCompleted: number;
  position: number;
  classPosition: number;
  carCount: number;
  airTemp: number;
  trackTemp: number;
  wetness: number;
  incidents: number;
  incidentLimit: number;
  brakeBias: number;
  tc: number;
  abs: number;
  onPitRoad: boolean;
  /** iRacing SessionState ölçeği: 1 araca bin, 2 ısınma / grid, 3 formasyon turu, 4 yarış, 5 damalı bayrak, 6 soğuma */
  state?: number;
  /** Start ışığı aşaması: -1 sim vermiyor, 0 gizli, 1 hazır (kırmızılar), 2 set, 3 yeşil */
  startLights?: number;
  /** Yanan kırmızı ışık sayısı / toplam (LMU/rF2); toplam 0: sim ışıkları tek tek vermiyor */
  startLit?: number;
  startTotal?: number;
}

export interface MapCar {
  idx: number;
  number: string;
  userId: number;
  name: string;
  pct: number;
  color: string;
  pos: number;
  classPos: number;
  me: boolean;
  pit: boolean;
}

export interface MapData {
  key: string;
  version: number;
  shape: [number, number][] | null;
  hasShape: boolean;
  progress: number;
  recording: boolean;
  /** Öğrenilmiş pit yolu; bilinmiyorsa null */
  pit?: PitLane | null;
  cars: MapCar[];
}

export interface PitLane {
  /** Pit girişi / çıkışı (tur yüzdesi 0..1) */
  entry: number;
  exit: number;
  /** Gidiş yönüne göre: 1 sol, -1 sağ, 0 bilinmiyor */
  side: number;
  /** Oyuncunun pit kutusu (tur yüzdesi; bilinmiyorsa -1) */
  stall: number;
}

export interface RcEvent {
  id: number;
  sessionNum: number;
  time: number;
  lap: number;
  kind: "lead" | "lost" | "gained" | "pitIn" | "pitOut" | "fastest" | "flag";
  idx: number;
  number: string;
  name: string;
  className: string;
  classColor: string;
  text: string;
  isMe: boolean;
}

export interface RaceControl {
  events: RcEvent[];
}

export interface TopicMap {
  status: Status;
  inputs: Inputs;
  ers: Ers;
  telemetry: Telemetry;
  delta: Delta;
  radar: Radar;
  relative: Relative;
  standings: Standings;
  fuel: Fuel;
  session: Session;
  weather: Weather;
  map: MapData;
  raceControl: RaceControl;
  tires: Tires;
  team: Team;
  entries: Entries;
  laps: Laps;
  incidents: Incidents;
  pit: Pit;
  traffic: Traffic;
  /** Stint'ler, takım sürücüleri, pit kaybı ve pistteki araçların bana göre konumu (Rust: strategy.rs) */
  strategy: Strategy;
  corners: Corners;
  /** Fren / vites işareti, pist limiti, hasar (Rust: drivecues.rs; tipler: sdk/drivecues.ts) */
  brakepoint: import("./drivecues").Brakepoint;
  tracklimits: import("./drivecues").TrackLimits;
  damage: import("./drivecues").Damage;
  /** Sektör süreleri ve tur bazlı fark geçmişi (Rust: timing.rs) */
  sectors: Sectors;
  gaps: Gaps;
  /** Setup karşılaştırma (Rust: setupcmp.rs) */
  setupcmp: SetupCmp;
  /** Canlı Kıyas: referans tur izi ile canlı girdi / fark (Rust: coach.rs) */
  coach: Coach;
  /** Canlı sohbet (olay tabanlı, iRacing'den bağımsız) */
  livechat: LiveChatTopic;
  livepoll: PollView;
  captions: CaptionView;
  /** Sesli mühendis altyazısı (olay tabanlı; Rust: voicesub.rs) */
  voice: VoiceLine;
}

/** Sesli mühendis / spotter şu an ne diyor */
export interface VoiceLine {
  /** Her mesajda artar */
  id: number;
  /** "driver": sesli komutta sürücünün sorusu (tanınan cümle) */
  role: "engineer" | "spotter" | "driver";
  /** Söylenen cümle (ses paketinin dilinde) */
  text: string;
  /** Kayıtların toplam süresi (bilinmiyorsa tahmin) */
  durationMs: number;
  /** false: konuşma bitti ya da kesildi */
  speaking: boolean;
}

/** Bir stint (pit çıkışından pit çıkışına). Bilinmeyen sayılar -1. Rust: strategy::StintRec */
export interface StratStint {
  n: number;
  driver: string;
  startLap: number;
  laps: number;
  /** Pit çıkışından pit girişine (süren stint'te şu ana) kadar süre (sn) */
  time: number;
  /** Temiz turların (pit giriş / çıkış turu hariç) ortalaması ve en iyisi */
  avg: number;
  best: number;
  last: number;
  /** sn/tur: + yavaşlıyor, − hızlanıyor (trendOk yanlışsa yeterli tur yok) */
  trend: number;
  trendOk: boolean;
  fuelAvg: number;
  fuelUsed: number;
  /** Bu lastik takımıyla atılan tur; tyreKnown yanlışsa lastiğin değiştiği varsayıldı */
  tyreLaps: number;
  tyreKnown: boolean;
  /** Stint'i bitiren pit ziyaretinde pit yolunda geçen süre */
  pitTime: number;
  current: boolean;
  lapTimes: number[];
}

export interface StratDriver {
  name: string;
  userId: number;
  time: number;
  laps: number;
  stints: number;
  current: boolean;
}

export interface StratCar {
  idx: number;
  number: string;
  name: string;
  className: string;
  classColor: string;
  sameClass: boolean;
  pos: number;
  classPos: number;
  /** Pistte benim kaç saniye arkamda (0..tur süresi) */
  behind: number;
  /** Yarış sırasına göre fark (sn): + arkamda, − önümde (tur farkı dahil) */
  raceGap: number;
  onPit: boolean;
}

export interface Strategy {
  race: boolean;
  multiclass: boolean;
  lapTime: number;
  position: number;
  classPosition: number;
  onPitRoad: boolean;
  /** Süren pit ziyaretinde pit yolunda geçen süre; pitte değilse -1 */
  pitElapsed: number;
  /** Öğrenilmiş pit kaybı (sn); yoksa -1 */
  pitLoss: number;
  pitLossSamples: number;
  pitLossLast: number;
  track: string;
  /** Pistteki sıraya göre (en yakın arkamdaki ilk) */
  cars: StratCar[];
  /** Eskiden yeniye; süren stint en sonda */
  stints: StratStint[];
  team: boolean;
  teamName: string;
  driver: string;
  /** Şu anki sürücünün araçta kesintisiz geçirdiği süre (sn) */
  driveTime: number;
  drivers: StratDriver[];
  /** Takibin başladığı oturum zamanı (sn): öncesi bilinmiyor */
  trackedFrom: number;
  sessionTime: number;
}

export interface Corner {
  n: number;
  pct: number;
  /** En iyi turdaki en düşük hız (m/s) */
  best: number;
  last: number;
  /** Bu tur, viraj geçildiyse */
  current: number;
}

export interface Corners {
  corners: Corner[];
  bestLap: number;
  lapPct: number;
}

/** Sektör süreleri (Rust: timing::Sectors). Süreler sn; 0 = yok. */
export interface Sectors {
  n: number;
  /** Simin resmi sektörleri (false: üç eşit mesafe) */
  official: boolean;
  /** Sektör sınırları (tur yüzdesi), n - 1 adet; 0 = henüz bilinmiyor */
  bounds: number[];
  lap: number;
  lapPct: number;
  /** İçinde bulunulan sektör (0 tabanlı) */
  sector: number;
  /** Güncel sektörde / turda geçen süre; tur çizgide başlamadıysa sectorTime -1 */
  sectorTime: number;
  lapTime: number;
  current: number[];
  last: number[];
  best: number[];
  /** Tur başlarkenki kişisel en iyiler (fark referansı) */
  bestPrev: number[];
  classBest: number[];
  classBestNo: string[];
  optimal: number;
  classOptimal: number;
  bestLap: number;
  lastLap: number;
  onPitRoad: boolean;
}

export interface GapCar {
  idx: number;
  /** Anlık fark (sn): + araç önümde, − arkamda */
  live: number | null;
  /** Gaps.laps ile aynı sırada çizgi geçişindeki fark */
  hist: (number | null)[];
  /** Pit girişleri: laps içindeki örnek sırası (laps.length = bitmemiş güncel tur) */
  pits: number[];
}

/** Tur bazlı fark geçmişi (Rust: timing::Gaps) */
export interface Gaps {
  race: boolean;
  lap: number;
  laps: number[];
  myPits: number[];
  cars: GapCar[];
}

export interface Pit {
  /** m/s */
  speed: number;
  /** m/s, bilinmiyorsa 0 */
  limit: number;
  limiter: boolean;
  onPitRoad: boolean;
  approaching: boolean;
  inStall: boolean;
}

export interface TrafficCar {
  idx: number;
  number: string;
  name: string;
  className: string;
  classColor: string;
  /** sn: + arkada, − önde */
  gap: number;
  meters: number;
  faster: boolean;
  sameClass: boolean;
  onPit: boolean;
}

export interface Traffic {
  speed: number;
  offTrack: boolean;
  onPitRoad: boolean;
  onTrack: boolean;
  multiclass: boolean;
  myClassColor: string;
  cars: TrafficCar[];
}

export interface LapRec {
  lap: number;
  time: number;
  /** 3 sektör (sn); eksikse boş */
  sectors: number[];
  fuel: number;
  inc: number;
  valid: boolean;
  pit: boolean;
  sessionTime: number;
}

export interface Laps {
  laps: LapRec[];
  best: number;
  bestLap: number;
  bestSectors: number[];
  /** En iyi sektörlerin toplamı */
  optimal: number;
  /** Güncel turun tamamlanan sektörleri */
  current: number[];
  currentLap: number;
  lapPct: number;
}

export interface IncidentRec {
  id: number;
  sessionTime: number;
  ts: number;
  lap: number;
  sector: number;
  pct: number;
  delta: number;
  total: number;
  kind: string;
}

export interface Incidents {
  list: IncidentRec[];
  total: number;
  limit: number;
  sessionKind: string;
}

export interface TireCorner {
  /** Sol / orta / sağ yüzey sıcaklığı (°C) */
  temp: [number, number, number];
  /** Kalan (0..1), bilinmiyorsa -1 */
  wear: [number, number, number];
  /** Soğuk basınç (kPa) */
  press: number;
}

export interface Tires {
  /** LF, RF, LR, RR */
  corners: TireCorner[];
  compound: number;
  available: boolean;
  onPit: boolean;
}

export interface TeamMember {
  sender: string;
  car: string;
  number: string;
  level: number;
  pct: number;
  max: number;
  usage: number;
  lapsLeft: number;
  refuel: number;
  lap: number;
  onPit: boolean;
  ts: number;
  /** Son veriden bu yana (sn) */
  age: number;
  me: boolean;
}

export interface Team {
  enabled: boolean;
  connected: boolean;
  team: string;
  members: TeamMember[];
}

export interface Entry {
  idx: number;
  userId: number;
  number: string;
  name: string;
  carName: string;
  irating: number;
  origClass: string;
  origColor: string;
  className: string;
  classColor: string;
}

export interface Entries {
  leagueId: number;
  active: boolean;
  drivers: Entry[];
}

export type TopicName = keyof TopicMap;

export type Packet = { [K in TopicName]: { t: K; d: TopicMap[K] } }[TopicName] | { t: "settings"; d: unknown } | { t: "drag"; d: unknown };

export interface AppState {
  demo: boolean;
  editMode: boolean;
  connected: boolean;
  hidden: boolean;
}

export const WETNESS: string[] = [
  "",
  "Kuru",
  "Çoğunlukla kuru",
  "Çok hafif ıslak",
  "Hafif ıslak",
  "Orta ıslak",
  "Çok ıslak",
  "Sırılsıklam",
];

/** Bir setup ile atılan turların özeti (Rust: setupcmp::Stats). Süreler sn; 0 = yok. */
export interface SetupStats {
  laps: number;
  best: number;
  /** En iyi turun sektörleri */
  sectors: number[];
  /** Sektör sektör en iyiler (farklı turlardan) */
  opt: number[];
  last: number;
  /** Tur sürelerinin toplamı (ortalama = sum / laps) */
  sum: number;
}
export interface SetupEntry {
  name: string;
  /** Yüklendikten sonra garajda değiştirilmiş (kaydedilmemiş) */
  modified: boolean;
  used: number;
  /** Tüm zamanlar (bu pist ve araç) */
  all: SetupStats;
  /** Sadece bu oturum */
  ses: SetupStats;
}
export interface SetupCmp {
  /** Şu an yüklü setup ("" = sim vermiyor) */
  current: string;
  modified: boolean;
  /** En son kullanılan en üstte */
  setups: SetupEntry[];
}

/** Canlı Kıyas referansı (Rust: coach::RefView) */
export interface CoachRef {
  /** "best" topluluk rekoru | "avg" topluluk ortalaması | "mine" kendi rekorum */
  kind: string;
  /** "ok" | "nodata" | "loading" | "login" */
  status: string;
  name: string;
  time: number;
  laps: number;
  /** Tur içi fark (sn): + referanstan yavaş */
  delta: number | null;
  /** Üç eşit bölümde kazanılan / kaybedilen süre */
  sectors: (number | null)[];
  thr: number[];
  brk: number[];
  /** km/h */
  spd: number[];
  nowThr: number;
  nowBrk: number;
  /** m/s */
  nowSpeed: number;
  nowGear: number;
}
export interface Coach {
  onTrack: boolean;
  onPitRoad: boolean;
  lapPct: number;
  /** m/s */
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  nowIdx: number;
  windowM: number;
  /** Oyuncunun bu turdaki gaz / freni (0-100; 255 = yok) */
  myThr: number[];
  myBrk: number[];
  refs: CoachRef[];
}
