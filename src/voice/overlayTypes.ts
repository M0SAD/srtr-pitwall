// Ses Odası overlay'i ile panel (src/voice/engine.ts) arasındaki olay ve veri biçimi.
// Overlay bu dosyayı içe aktarır, motoru değil (motor sadece panel penceresinde çalışır).

export const VOICE_OVERLAY_EVENT = "voiceroom-overlay";
/** Overlay açılınca son durumu ister */
export const VOICE_OVERLAY_REQ = "voiceroom-overlay-req";

export interface VoiceOverlayMember {
  id: string;
  name: string;
  talking: boolean;
  /** on: konuşabilir, off: mikrofonu kapalı, floor: söz hakkı yok */
  mic: "on" | "off" | "floor";
  deaf: boolean;
  me: boolean;
  /** Söz hakkının bitişine kalan sn (söz hakkıyla odada) */
  left: number | null;
  role: string;
  /** Profil fotoğrafı adresi ("" = yok; baş harf gösterilir) */
  avatar?: string;
}
export interface VoiceOverlayData {
  room: string | null;
  mode: string;
  members: VoiceOverlayMember[];
}
