// Mühendis ekranında dönen ekranlar: her ekran bir ya da iki overlay'i büyük gösterir.

export interface EngineerScreen {
  id: string;
  name: string;
  desc: string;
  overlays: { type: string; options?: Record<string, unknown> }[];
}

export const ENGINEER_SCREENS: EngineerScreen[] = [
  { id: "standings", name: "Sıralama", desc: "Sınıf sıralaması", overlays: [{ type: "standings", options: { maxRows: 14 } }] },
  { id: "relative", name: "Yakındakiler", desc: "Öndeki ve arkadaki araçlar", overlays: [{ type: "relative", options: { rows: 4 } }] },
  { id: "fuel", name: "Yakıt", desc: "Yakıt stratejisi", overlays: [{ type: "fuel" }] },
  { id: "stint", name: "Stint", desc: "Lastikler ve yakıt", overlays: [{ type: "tires" }, { type: "fuel", options: { showTable: false } }] },
  { id: "battle", name: "Mücadele", desc: "Öndeki ve arkadaki rakip", overlays: [{ type: "battlebox" }] },
  { id: "laps", name: "Tur süreleri", desc: "Son turların listesi", overlays: [{ type: "laptimes" }] },
  { id: "weather", name: "Hava", desc: "Rüzgâr, sıcaklık, ıslaklık", overlays: [{ type: "weather" }] },
  { id: "session", name: "Oturum", desc: "Bayraklar, kalan süre, pozisyon", overlays: [{ type: "session" }] },
  { id: "car", name: "Araç ayarları", desc: "Vites, BB, TC, ABS", overlays: [{ type: "telemetry", options: { showElectronics: true } }] },
  { id: "inputs", name: "Girdiler", desc: "Pedal izi", overlays: [{ type: "inputs" }] },
  { id: "proximity", name: "Yakındaki araçlar", desc: "Radar", overlays: [{ type: "radar" }] },
];
