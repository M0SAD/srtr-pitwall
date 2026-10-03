// "Ekip Çağrısı" overlay'i için ortak tanımlar. Ekip odası mesajları zaten `overlay-message` olayıyla
// (bkz. ovmsg.ts, kind "crew") overlay pencerelerine gelir; uygulanan pit komutları ayrıca bu olayla yayınlanır.

export const CREWCALL_EVENT = "crew-call";

export interface CrewCallEvt {
  id: string;
  /** Komutu gönderen ekip üyesi */
  from: string;
  /** Okunabilir komut metni (ör. "yakıt 45 L") */
  body: string;
}

/** Hazır çağrı türü: banner'ın rengi ve simgesi buna göre seçilir */
export type CallKind = "pit" | "push" | "fuel" | "fast" | "left" | "right" | "clear" | "command" | "";

const norm = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");

/**
 * Mesaj metninden hazır çağrı türünü çıkarır (Türkçe / İngilizce ve yaygın pit duvarı deyimleri).
 * Ekip odasındaki hazır düğmeler gönderenin dilinde yazar; bu yüzden birkaç dilin anahtar sözcüklerine bakılır.
 */
export function callKind(text: string): CallKind {
  const s = ` ${norm(text)} `;
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  if (has("hizli arac", "arkandan", "arkanda", "faster car", "fast car", "car behind", "blue flag", "mavi bayrak", "schneller", "coche rapido", "voiture rapide")) return "fast";
  if (has("yakit koru", "yakit tasarruf", "tasarruf", "save fuel", "fuel sav", "lift and coast", "lift & coast", "sprit sparen", "ahorra", "economise")) return "fuel";
  if (has("push", "bastir", "atak", "tam gaz", "gaz ver", "attack")) return "push";
  if (has(" pit", "box box", " box ", "boxes")) return "pit";
  if (has("solunda", "car left", "links", "izquierda", "a gauche")) return "left";
  if (has("saginda", "car right", "rechts", "derecha", "a droite")) return "right";
  if (has(" temiz ", " clear ", " frei ", "libre")) return "clear";
  return "";
}
