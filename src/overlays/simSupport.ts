// Overlay × simülasyon uyumluluğu: hangi overlay hangi simde güvenilir çalışır?
//
// Tek doğruluk kaynağı. Panel (Overlay'ler / Düzenler / Yayın sayfaları) ve overlay penceresi
// (src/host/Host.tsx) desteklenmeyen overlay'leri gizler; kullanıcının `enabled` ayarına
// dokunulmaz, iRacing'e dönünce hepsi geri gelir.
//
// Bu klasördeki dosya bir overlay değildir: registry sadece `<id>/manifest.ts` ve
// `<id>/Overlay.tsx` dosyalarını arar.
//
// Hangi simin hangi veriyi doldurduğu (src-tauri/src/sims/*.rs):
//
//   Veri                         iRacing  ACC   AC    LMU/rF2  AMS2
//   ---------------------------  -------  ----  ----  -------  ----
//   Diğer araçlar (sıra, tur)     ✓        –     –     ✓        ✓      (AC/ACC: sadece oyuncu aracı)
//   Yan araç / radar              ✓        ✓     –     ✓        ✓      (ACC: rakip dünya koordinatları)
//   Delta (en iyi tura göre)      ✓        ✓     –     –        –
//   Olay puanı (incident)         ✓        –     –     –        –
//   Sınıf tempo tahmini           ✓        –     –     –        –      (class_est_lap; "daha hızlı sınıf")
//   Pit hız sınırı                ✓        –     –     –        –      (hız + sınırlayıcı biti hepsinde var)
//   Pist dışı (TrackSurface 0)    ✓        –     –     –        –
//   Hava (sıcaklık, rüzgâr)       ✓        ✓     ✓     ✓        ✓      (AC: yağış/ıslaklık yok)
//   Lastik                        ✓        ✓     ✓     ✓        ✓      (ACC: aşınma yok, AMS2: basınç yok)
//   Pedallar, vites, yakıt, tur   ✓        ✓     ✓     ✓        ✓
//   Yanal / boyuna ivme (g)       ✓        ✓     ✓     ✓        ✓      (gforce; inputs konusunda latG / longG)
//   Resmi sektör sınırları        ✓        ✓     ✓     ✓        ✓      (sectors; iRacing SplitTimeInfo, diğerleri sektör numarası; yoksa 3 eşit parça)
//   Pist haritası (şekil kaydı)   ✓        ✓     ✓     ✓        ✓      (AC/ACC: haritada sadece oyuncu)
//
// RaceRoom (r3e) ve F1 23-25 (f1) tüm alanı verir (sıra, tur, konum / radar; R3E delta ve olay puanı, F1 ERS ve start
// ışıkları). Forza, DiRT / GRID ve BeamNG (UDP) sadece oyuncunun aracını verir: rakip isteyen overlay'ler çalışmaz;
// BeamNG (OutGauge) tur konumu da vermez.

import { settings } from "@/sdk/settings";
import type { Status } from "@/sdk/types";

/** iRacing dışındaki sim aileleri (rF2 ile LMU aynı veri düzenini kullanır) */
export type SimFamily = "iracing" | "acc" | "ac" | "lmu" | "ams2" | "r3e" | "f1" | "forza" | "dirt" | "beamng";

export const SIM_NAMES: Record<SimFamily, string> = {
  iracing: "iRacing",
  acc: "Assetto Corsa Competizione",
  ac: "Assetto Corsa",
  lmu: "Le Mans Ultimate / rFactor 2",
  ams2: "Automobilista 2",
  r3e: "RaceRoom",
  f1: "F1 23 / F1 24 / F1 25",
  forza: "Forza Motorsport / Horizon",
  dirt: "DiRT Rally 2.0 / DiRT 4 / GRID",
  beamng: "BeamNG.drive",
};

/**
 * Overlay'in ÇALIŞMADIĞI simler. Listede olmayan overlay her simde çalışır
 * (scene, webview, corners, inputs, pedals, telemetry, fuel, laptimes, tires, weather,
 * session, digiflags, dataframe, dashboard, trackmap, minimap, pitspeed, gforce...).
 *
 * Kısmen çalışıp yine de işe yarayanlar bilerek listede değil:
 *  - pitspeed: iRacing dışında hız sınırı bilinmiyor ("—"), ama pit hızı ve
 *    "SINIRLAYICI KAPALI" uyarısı çalışıyor.
 *  - trackmap / minimap: AC/ACC'de sadece kendi aracın görünür, harita yine kullanışlı.
 *  - weather: AC'de yağış/ıslaklık yok; sıcaklık ve rüzgâr var.
 *  - tires: ACC'de aşınma, AMS2'de basınç yok; sıcaklıklar var.
 *  - session / dataframe / dashboard: olay (incident) alanı 0 kalır, gerisi çalışır.
 *  - brakepoint / windcompass: her simde çalışır (pedallar + tur konumu; rüzgâr + araç yönü).
 *  - tracklimits: her simde çalışır. Olay puanı / sınırı sadece iRacing'de; tur geçerliliğini ACC, LMU/rF2 ve
 *    AMS2 kendisi bildirir, iRacing ve AC'de pist dışından çıkarılır (AC/ACC: numberOfTyresOut, LMU/AMS2: zemin türü).
 *  - damage: iRacing'de bölge yok (tamir süreleri + motor uyarıları), ACC/AC'de ön-arka-sol-sağ-orta,
 *    LMU/rF2'de 8 göçük bölgesi, AMS2'de aero/motor/süspansiyon/fren. Tamir süresi sadece iRacing (ACC: tahmin).
 */
const UNSUPPORTED: Record<string, SimFamily[]> = {
  // Rakip araç listesi yok (AC/ACC paylaşımlı belleği sadece oyuncu aracını verir)
  relative: ["ac", "acc", "forza", "dirt", "beamng"],
  standings: ["ac", "acc", "forza", "dirt", "beamng"],
  battlebox: ["ac", "acc", "forza", "dirt", "beamng"],
  duel: ["ac", "acc", "forza", "dirt", "beamng"],
  gapbar: ["ac", "acc", "forza", "dirt", "beamng"],
  // Fark Grafiği / Rakip Takibi: rakiplerin çizgi geçişleri gerekir (sectors her simde çalışır: AC/ACC'de sınıf
  // en iyisi = kendi en iyin)
  gapchart: ["ac", "acc", "forza", "dirt", "beamng"],
  target: ["ac", "acc", "forza", "dirt", "beamng"],
  // Pit Penceresi: pit çıkışında aralarına dönülecek araçlar için rakip listesi gerekir
  pitwindow: ["ac", "acc", "forza", "dirt", "beamng"],
  // Sürücü Değişimi: aracı o an kimin sürdüğü iRacing (takım oturumu) ve LMU/rF2 (skorlamadaki sürücü adı) verisinden
  // izlenir; AC/ACC paylaşımlı belleği ve AMS2 takım sürücüsü bilgisini vermiyor
  driverswap: ["ac", "acc", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  flatmap: ["ac", "acc", "forza", "dirt", "beamng"], // düz şeritte tek nokta kalır
  // Arkadaki araçları bilemediği için yanlışlıkla "DÖNEBİLİRSİN" der
  rejoin: ["ac", "acc", "forza", "dirt", "beamng"],
  // AC yan araç verisi vermiyor
  radar: ["ac", "forza", "dirt", "beamng"],
  spotterbar: ["ac", "forza", "dirt", "beamng"],
  blindspot: ["ac", "forza", "dirt", "beamng"],
  // Delta sadece iRacing ve ACC'de var; diğerlerinde çubuk hep boş kalır
  delta: ["ac", "lmu", "ams2", "f1", "forza", "dirt", "beamng"],
  // Hibrit / batarya verisi: iRacing, LMU/rF2 ve AC'de var; ACC'de hibrit araç yok, AMS2 alanları okunmuyor
  ers: ["acc", "ams2", "forza", "dirt", "beamng"],
  // Olay puanı sadece iRacing'de
  incidents: ["acc", "ac", "lmu", "ams2", "f1", "forza", "dirt", "beamng"],
  // Setup adı sadece iRacing oturum bilgisinde var
  setupcmp: ["acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  setupname: ["acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  // FFB gücü ve şaft torku sadece iRacing telemetrisinde var
  ffb: ["acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  // Arkadaşın simdeki adı profilde yalnızca iRacing için tutulur (aynı yarıştaki arkadaşı bulmak için)
  friendalert: ["acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  incidentlog: ["acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  // Sınıf tempo tahmini (class_est_lap) sadece iRacing'de: "daha hızlı sınıf" hiç tespit edilemez;
  // AC/ACC'de zaten rakip yok
  overtake: ["acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"],
  // Start ışıkları: AC start aşamasını vermiyor. iRacing: start bitleri (hazır / set / yeşil); LMU/rF2: ışıklar tek tek;
  // AMS2: sadece grid / formasyon ve start anı; ACC: yaklaşık (tur sayacı / yeşil bayrak), ışık verisi yok
  startlights: ["ac", "forza", "dirt", "beamng"],
  // Sınıfın ilk üçü ve rakip karşılaştırması rakip listesi ister (AC/ACC'de yok)
  results: ["ac", "acc", "forza", "dirt", "beamng"],
  // BeamNG (OutGauge) tur konumu vermiyor: harita çizilemez
  trackmap: ["beamng"],
  minimap: ["beamng"],
  h2h: ["ac", "acc", "forza", "dirt", "beamng"],
};

/** Sim aileleri, gösterim sırasıyla */
export const SIM_FAMILIES: SimFamily[] = ["iracing", "acc", "ac", "lmu", "ams2", "r3e", "f1", "forza", "dirt", "beamng"];

/** Kısa rozet yazıları (önizleme köşesindeki "desteklenen oyunlar" çipleri) */
export const SIM_SHORT: Record<SimFamily, string> = {
  iracing: "iRacing",
  acc: "ACC",
  ac: "AC",
  lmu: "LMU / rF2",
  ams2: "AMS2",
  r3e: "R3E",
  f1: "F1",
  forza: "Forza",
  dirt: "DiRT",
  beamng: "BeamNG",
};

/** Overlay'in çalıştığı sim aileleri (gösterim sırasıyla) */
export function supportedSims(overlayId: string): SimFamily[] {
  const no = UNSUPPORTED[overlayId] ?? [];
  return SIM_FAMILIES.filter((f) => f === "iracing" || !no.includes(f));
}

/** status.sim / general.sim değerini aileye çevirir; bilinmiyorsa null */
export function simFamily(sim: string | null | undefined): SimFamily | null {
  switch (sim) {
    case "iracing":
    case "acc":
    case "ac":
    case "lmu":
    case "ams2":
    case "r3e":
    case "f1":
    case "forza":
    case "dirt":
    case "beamng":
      return sim;
    case "rf2":
      return "lmu";
    default:
      return null;
  }
}

/** Overlay bu simde çalışıyor mu? Sim bilinmiyorsa (null) her şey gösterilir. */
export function overlaySupportsSim(overlayId: string, sim: string | null | undefined): boolean {
  const fam = simFamily(sim);
  if (!fam || fam === "iracing") return true;
  return !(UNSUPPORTED[overlayId]?.includes(fam) ?? false);
}

/**
 * Şu anki sim: canlı bağlantı (demo/önizleme değil) varsa bağlı sim, yoksa kullanıcının
 * seçtiği sim (Otomatik değilse). İkisi de yoksa null: her overlay gösterilir.
 * Reaktiftir (status + ayarlar); kullanan taraf `createMemo` ile sarmalıdır
 * (status paketi her yarım saniyede bir gelir).
 */
export function currentSim(status: Status | undefined): SimFamily | null {
  if (status?.connected && !status.demo && !status.preview) {
    const live = simFamily(status.sim);
    if (live) return live;
  }
  const pref = settings().general.sim;
  return pref && pref !== "auto" ? simFamily(pref) : null;
}
