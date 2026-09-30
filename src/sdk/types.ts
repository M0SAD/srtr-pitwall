// Rust tarafındaki src-tauri/src/calc.rs paketleriyle birebir aynı tipler.

export interface Status {
  connected: boolean;
  demo: boolean;
  /** Panel önizlemesi için demo verisi (overlay'ler gizli) */
  preview: boolean;
  onTrack: boolean;
  inGarage: boolean;
  replay: boolean;
  /** Oyuncu pistte ve garajda değil: izleyici/spotter */
  spectating: boolean;
  sessionType: string;
  track: string;
  trackId: number;
  seriesId: number;
  category: string;
  carName: string;
  carPath: string;
  className: string;
  /** Oyuncunun iRacing hesabı */
  userId: number;
  userName: string;
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
  tc: number;
  brakeBias: number;
  onPitRoad: boolean;
}

export interface Delta {
  delta: number;
  valid: boolean;
  trend: number;
  current: number;
  last: number;
  best: number;
}

export interface RadarCar {
  /** -1 sol, 1 sağ, 0 önde/arkada */
  side: number;
  /** boyuna mesafe (m), + önde */
  offset: number;
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
  flag: "" | "BLK" | "DSQ" | "REP" | "BLU";
  posChange: number;
  isMe: boolean;
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
  cars: MapCar[];
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
  corners: Corners;
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

export type Packet = { [K in TopicName]: { t: K; d: TopicMap[K] } }[TopicName] | { t: "settings"; d: unknown };

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
