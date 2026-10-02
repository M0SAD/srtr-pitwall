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
//   Pist haritası (şekil kaydı)   ✓        ✓     ✓     ✓        ✓      (AC/ACC: haritada sadece oyuncu)

import { settings } from "@/sdk/settings";
import type { Status } from "@/sdk/types";

/** iRacing dışındaki sim aileleri (rF2 ile LMU aynı veri düzenini kullanır) */
export type SimFamily = "iracing" | "acc" | "ac" | "lmu" | "ams2";

export const SIM_NAMES: Record<SimFamily, string> = {
  iracing: "iRacing",
  acc: "Assetto Corsa Competizione",
  ac: "Assetto Corsa",
  lmu: "Le Mans Ultimate / rFactor 2",
  ams2: "Automobilista 2",
};

/**
 * Overlay'in ÇALIŞMADIĞI simler. Listede olmayan overlay her simde çalışır
 * (scene, webview, corners, inputs, telemetry, fuel, laptimes, tires, weather,
 * session, digiflags, dataframe, dashboard, trackmap, minimap, pitspeed...).
 *
 * Kısmen çalışıp yine de işe yarayanlar bilerek listede değil:
 *  - pitspeed: iRacing dışında hız sınırı bilinmiyor ("—"), ama pit hızı ve
 *    "SINIRLAYICI KAPALI" uyarısı çalışıyor.
 *  - trackmap / minimap: AC/ACC'de sadece kendi aracın görünür, harita yine kullanışlı.
 *  - weather: AC'de yağış/ıslaklık yok; sıcaklık ve rüzgâr var.
 *  - tires: ACC'de aşınma, AMS2'de basınç yok; sıcaklıklar var.
 *  - session / dataframe / dashboard: olay (incident) alanı 0 kalır, gerisi çalışır.
 */
const UNSUPPORTED: Record<string, SimFamily[]> = {
  // Rakip araç listesi yok (AC/ACC paylaşımlı belleği sadece oyuncu aracını verir)
  relative: ["ac", "acc"],
  standings: ["ac", "acc"],
  battlebox: ["ac", "acc"],
  duel: ["ac", "acc"],
  flatmap: ["ac", "acc"], // düz şeritte tek nokta kalır
  // Arkadaki araçları bilemediği için yanlışlıkla "DÖNEBİLİRSİN" der
  rejoin: ["ac", "acc"],
  // AC yan araç verisi vermiyor
  radar: ["ac"],
  // Delta sadece iRacing ve ACC'de var; diğerlerinde çubuk hep boş kalır
  delta: ["ac", "lmu", "ams2"],
  // Hibrit / batarya verisi: iRacing, LMU/rF2 ve AC'de var; ACC'de hibrit araç yok, AMS2 alanları okunmuyor
  ers: ["acc", "ams2"],
  // Olay puanı sadece iRacing'de
  incidents: ["acc", "ac", "lmu", "ams2"],
  incidentlog: ["acc", "ac", "lmu", "ams2"],
  // Sınıf tempo tahmini (class_est_lap) sadece iRacing'de: "daha hızlı sınıf" hiç tespit edilemez;
  // AC/ACC'de zaten rakip yok
  overtake: ["acc", "ac", "lmu", "ams2"],
};

/** status.sim / general.sim değerini aileye çevirir; bilinmiyorsa null */
export function simFamily(sim: string | null | undefined): SimFamily | null {
  switch (sim) {
    case "iracing":
    case "acc":
    case "ac":
    case "lmu":
    case "ams2":
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
