// Rust tarafındaki src-tauri/src/drivecues.rs paketleriyle birebir aynı tipler
// (brakepoint, tracklimits, damage konuları).

/** Referans turdaki bir fren / gaz kesme noktası */
export interface BrakeZone {
  /** Tur yüzdesi 0..1 */
  pct: number;
  /** 0 fren, 1 sadece gaz kesme */
  kind: number;
  /** Virajdaki en düşük vites */
  gear: number;
  /** Giriş hızı ve virajdaki en düşük hız (m/s) */
  speed: number;
  minSpeed: number;
  /** Frenden önce gazın kesildiği nokta (tur yüzdesi), yoksa -1 */
  lift: number;
}

export interface BrakeNext {
  n: number;
  /** Noktaya kalan mesafe (m); geçildiyse ve fren yapılmadıysa negatif */
  dist: number;
  eta: number;
  kind: number;
  gear: number;
  speed: number;
  minSpeed: number;
  liftDist: number;
}

export interface BrakeLast {
  n: number;
  /** m: + daha geç, − daha erken */
  diff: number;
  kind: number;
  id: number;
}

export interface Brakepoint {
  hasRef: boolean;
  refTime: number;
  fromFile: boolean;
  persist: boolean;
  lapClean: boolean;
  next: BrakeNext | null;
  last: BrakeLast | null;
  braking: boolean;
  gear: number;
  speed: number;
  lapPct: number;
  trackLen: number;
  onPitRoad: boolean;
  onTrack: boolean;
  zones: BrakeZone[];
  /** Bu oturumun en iyi temiz turu / topluluk rekoru (eski motor sürümlerinde yok) */
  session?: BrakeRef;
  community?: BrakeRef;
  /** Telemetri kayıtlarıyla aynı pist + araç kimliği */
  combo?: { sim: string; trackId: string; trackConfig: string; carId: string };
}

export interface BrakeRef {
  hasRef: boolean;
  refTime: number;
  /** Topluluk rekorunun sahibi */
  name: string;
  next: BrakeNext | null;
  last: BrakeLast | null;
  zones: BrakeZone[];
}

export interface TrackLimits {
  valid: boolean;
  off: boolean;
  /** Pist dışındaki teker sayısı, bilinmiyorsa -1 */
  tyresOut: number;
  offs: number;
  lapOffs: number;
  invalidLaps: number;
  laps: number;
  incidents: number;
  incidentLimit: number;
  hasIncidents: boolean;
  hasOff: boolean;
  /** Tur geçerliliğini sim bildiriyor (false: pist dışı / olaydan çıkarılıyor) */
  simValid: boolean;
  penalty: string;
  eventId: number;
  eventKind: "" | "off" | "invalid" | "incident";
  eventAgo: number;
  eventDelta: number;
  onPitRoad: boolean;
  onTrack: boolean;
  lap: number;
}

export interface Damage {
  /** 0 sim hasar verisi vermiyor, 1 kaporta bölgesi yok (genel / parça bazlı), 2 bölge bazlı */
  detail: number;
  /** 0..1 (-1 yok), saat yönünde: ön-sol, ön, ön-sağ, sağ, arka-sağ, arka, arka-sol, sol */
  body: number[];
  /** LF, RF, LR, RR */
  susp: number[];
  brake: number[];
  /** 0 sağlam, 1 patlak, 2 kopmuş, -1 bilinmiyor */
  wheel: number[];
  engine: number;
  aero: number;
  centre: number;
  /** sn; bilinmiyorsa -1 */
  repair: number;
  optRepair: number;
  repairEst: boolean;
  overall: number;
  any: boolean;
  warnings: string[];
  onPitRoad: boolean;
}
